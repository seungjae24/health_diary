import { AiInsight, AiProvider, AiSettings, HealthStore, InsightSource, NutritionInfo } from '../types';
import { createAnalysisSnapshot, describeWorkout, getGoalProgress } from '../utils/analytics';
import { estimateMealNutritionFromText, estimateMealSegmentNutrition, splitMealDescription, summarizeNutrition } from '../utils/nutrition';
import {
  formatLongDate,
  formatShortDate,
  makeId,
  sortByDateDesc,
} from '../utils/format';

type ParsedInsight = Omit<AiInsight, 'id' | 'generatedAt' | 'source'>;
type MealNutritionEstimate = {
  title?: string;
  notes?: string;
  nutrition: NutritionInfo;
  rationale: string;
  source: 'ai' | 'local' | 'search';
  providerLabel?: string;
};

type MealReferenceContext = {
  summary: string;
  matchedCount: number;
  searchedEstimate: MealNutritionEstimate | null;
};

function summarizeForLog(value: string, limit = 280) {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= limit) {
    return singleLine;
  }

  return `${singleLine.slice(0, limit)}...`;
}

function debugAiLog(stage: 'request' | 'response' | 'error', payload: Record<string, unknown>) {
  if (!__DEV__) {
    return;
  }

  const logger = stage === 'error' ? console.error : console.log;
  logger(`[AI ${stage.toUpperCase()}]`, payload);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAiError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('high demand') ||
    normalized.includes('please try again later') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('overloaded') ||
    normalized.includes('rate limit') ||
    normalized.includes('429') ||
    normalized.includes('503')
  );
}

function buildPrompt(store: HealthStore) {
  const snapshot = createAnalysisSnapshot(store);
  const meals = sortByDateDesc(store.meals)
    .slice(0, 8)
    .map((record) => `- ${formatShortDate(record.date)}: ${record.title}. ${record.notes}`)
    .join('\n');
  const workouts = sortByDateDesc(store.workouts)
    .slice(0, 8)
    .map((record) => `- ${formatShortDate(record.date)}: ${describeWorkout(record)}`)
    .join('\n');
  const weights = sortByDateDesc(store.weights)
    .slice(0, 8)
    .map((record) => `- ${formatShortDate(record.date)}: ${record.valueKg.toFixed(1)} kg`)
    .join('\n');
  const goals = store.goals
    .map((goal) => {
      const progress = getGoalProgress(goal, store);
      return `- ${goal.title} due ${formatLongDate(goal.dueDate)}. Current: ${progress.currentLabel}. Target: ${progress.targetLabel}. Status: ${progress.statusText}.`;
    })
    .join('\n');

  return {
    system: `You are a practical health coach helping a user reach health goals with meal, workout, and weight logs. Use only the supplied data. Do not diagnose disease or provide medical advice. Return JSON only with this schema:
{
  "summary": "2-3 sentence progress summary",
  "trajectory": "1 sentence describing whether the user is on track for current goals",
  "actionItems": ["up to 4 short, concrete next steps"],
  "goalWatch": ["up to 3 risks or wins tied to the existing goals"],
  "nutritionFocus": "1 short sentence",
  "trainingFocus": "1 short sentence"
}`,
    user: `Health tracking snapshot

Highlights
- Latest weight: ${snapshot.latestWeight}
- 14 day weight change: ${snapshot.weightChange14}
- Workout minutes in last 7 days: ${snapshot.weeklyMinutes}
- Running sessions in last 14 days: ${snapshot.runningSessions}
- Badminton sessions in last 14 days: ${snapshot.badmintonSessions}
- Current workout streak: ${snapshot.workoutStreak} days
- Meal logs in last 7 days: ${snapshot.mealLogsLast7Days}

Goals
${goals || '- No goals set'}

Recent meals
${meals || '- No meal records'}

Recent workouts
${workouts || '- No workout records'}

Recent weight history
${weights || '- No weight records'}`,
  };
}

function extractTextFromOpenAiResponse(payload: any) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    return '';
  }

  const textParts: string[] = [];

  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (typeof content?.text === 'string') {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join('\n').trim();
}

function extractTextFromGeminiResponse(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
}

function parseInsightPayload(rawText: string): ParsedInsight {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? rawText.slice(start, end + 1) : rawText;

  try {
    const parsed = JSON.parse(candidate);
    return {
      summary: parsed.summary ?? 'No summary returned.',
      trajectory: parsed.trajectory ?? 'Trajectory not available.',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 4) : [],
      goalWatch: Array.isArray(parsed.goalWatch) ? parsed.goalWatch.slice(0, 3) : [],
      nutritionFocus: parsed.nutritionFocus ?? '',
      trainingFocus: parsed.trainingFocus ?? '',
    };
  } catch {
    return {
      summary: rawText.trim() || 'No insight returned.',
      trajectory: 'Model response was not structured.',
      actionItems: [],
      goalWatch: [],
      nutritionFocus: '',
      trainingFocus: '',
    };
  }
}

function createInsight(source: InsightSource, payload: ParsedInsight): AiInsight {
  return {
    id: makeId('insight'),
    generatedAt: new Date().toISOString(),
    source,
    ...payload,
  };
}

function createLocalInsight(store: HealthStore): AiInsight {
  const snapshot = createAnalysisSnapshot(store);
  const watchList = store.goals
    .slice(0, 3)
    .map((goal) => {
      const progress = getGoalProgress(goal, store);
      return `${goal.title}: ${progress.statusText}`;
    });

  const summary = [
    `You logged ${snapshot.mealLogsLast7Days} meals and ${snapshot.weeklyMinutes} of workouts this week.`,
    `Your latest weight is ${snapshot.latestWeight} with a 14-day change of ${snapshot.weightChange14}.`,
  ].join(' ');

  return createInsight('local', {
    summary,
    trajectory:
      snapshot.runningSessions > 0 || snapshot.badmintonSessions > 0
        ? 'You have enough recent activity to keep progressing, but a model-backed review will give sharper timing advice.'
        : 'The current logs are too thin for strong forecasting. Add more meals, workouts, and weights for better guidance.',
    actionItems: [
      'Keep logging meals daily so AI can spot repeat nutrition patterns.',
      'Aim for at least 3 planned workouts over the next 7 days.',
      'Add 2 more weigh-ins this week to tighten the weight trend.',
    ],
    goalWatch: watchList,
    nutritionFocus: 'Tighten consistency first: repeated meal logging matters more than perfect detail.',
    trainingFocus: 'Protect a repeatable weekly rhythm before adding intensity.',
  });
}

function normalizeNutritionPayload(payload: any): NutritionInfo {
  return {
    calories: typeof payload?.calories === 'number' ? Math.round(payload.calories) : undefined,
    carbsG: typeof payload?.carbsG === 'number' ? Number(payload.carbsG.toFixed(1)) : 0,
    proteinG: typeof payload?.proteinG === 'number' ? Number(payload.proteinG.toFixed(1)) : 0,
    fatG: typeof payload?.fatG === 'number' ? Number(payload.fatG.toFixed(1)) : 0,
    fiberG: typeof payload?.fiberG === 'number' ? Number(payload.fiberG.toFixed(1)) : undefined,
    source: 'ai',
  };
}

function parseMealNutritionEstimate(rawText: string): MealNutritionEstimate {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? rawText.slice(start, end + 1) : rawText;

  try {
    const parsed = JSON.parse(candidate);
    return {
      title: parsed?.title,
      notes: parsed?.notes,
      nutrition: normalizeNutritionPayload(parsed?.nutrition ?? parsed),
      rationale: parsed?.rationale ?? 'AI가 식단 설명을 기준으로 추정했어요.',
      source: 'ai',
    };
  } catch {
    const fallback = estimateMealNutritionFromText(rawText);
    return {
      ...fallback,
      source: 'local',
    };
  }
}

type OpenFoodFactsProduct = {
  product_name?: string;
  product_name_ko?: string;
  brands?: string;
  quantity?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number>;
};

function normalizeSearchQuery(text: string) {
  return text
    .replace(/[()]/g, ' ')
    .replace(/\b(먹음|먹었다|먹었음|사먹음|추가|정도|큰거|큰 것|작은거|작은 것)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPer100Value(product: OpenFoodFactsProduct, keys: string[]) {
  const nutriments = product.nutriments || {};
  for (const key of keys) {
    const value = nutriments[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
  }
  return null;
}

function getServingValue(product: OpenFoodFactsProduct, keys: string[]) {
  const nutriments = product.nutriments || {};
  for (const key of keys) {
    const value = nutriments[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }
  }
  return null;
}

function parseNumericAmount(text?: string | number | null) {
  if (typeof text === 'number') return text;
  if (!text) return null;
  const match = String(text).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parseSegmentAmount(segment: string) {
  const normalized = segment.toLowerCase();
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)/);
  const rangeValue = rangeMatch ? (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2 : null;
  const unitMatch = normalized.match(/(g|그램|ml|컵|개|알|덩이|봉|봉지|팩|공기|젓가락|인분)/);
  const explicitNumber = normalized.match(/(\d+(?:\.\d+)?)/);
  const value = rangeValue ?? (explicitNumber ? Number(explicitNumber[1]) : null);
  const unit = unitMatch?.[1] || null;

  if (value) {
    return { value, unit };
  }

  if (/하나|한개|한 개|한덩이|한 덩이|한봉|한 봉|한팩|한 팩|한공기|한 공기/.test(normalized)) {
    return { value: 1, unit: 'count' };
  }

  return { value: null, unit: null };
}

function parsePackageWeight(text?: string) {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(g|ml)/i);
  return match ? Number(match[1]) : null;
}

function productLabel(product: OpenFoodFactsProduct) {
  return product.product_name_ko || product.product_name || '';
}

function scoreOpenFoodFactsProduct(product: OpenFoodFactsProduct, query: string) {
  const haystack = `${productLabel(product)} ${product.brands || ''}`.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1);

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length > 2 ? 2 : 1;
    }
  }

  if (haystack.includes(query.toLowerCase())) {
    score += 6;
  }

  const protein = getPer100Value(product, ['proteins_100g']);
  const carbs = getPer100Value(product, ['carbohydrates_100g']);
  const fat = getPer100Value(product, ['fat_100g']);
  if (protein !== null || carbs !== null || fat !== null) {
    score += 2;
  }

  return score;
}

function convertOpenFoodFactsProductToNutrition(product: OpenFoodFactsProduct, segment: string): NutritionInfo | null {
  const per100Calories = getPer100Value(product, ['energy-kcal_100g', 'energy-kcal_100ml']);
  const per100Carbs = getPer100Value(product, ['carbohydrates_100g', 'carbohydrates_100ml']);
  const per100Protein = getPer100Value(product, ['proteins_100g', 'proteins_100ml']);
  const per100Fat = getPer100Value(product, ['fat_100g', 'fat_100ml']);
  const per100Fiber = getPer100Value(product, ['fiber_100g', 'fiber_100ml']);

  const servingCalories = getServingValue(product, ['energy-kcal_serving']);
  const servingCarbs = getServingValue(product, ['carbohydrates_serving']);
  const servingProtein = getServingValue(product, ['proteins_serving']);
  const servingFat = getServingValue(product, ['fat_serving']);
  const servingFiber = getServingValue(product, ['fiber_serving']);

  const amount = parseSegmentAmount(segment);
  const servingQty = parseNumericAmount(product.serving_quantity);
  const packageQty = parsePackageWeight(product.quantity);

  let multiplier = 1;
  let useServing = false;

  if (amount.value && amount.unit && /g|그램|ml/.test(amount.unit)) {
    multiplier = amount.value / 100;
  } else if (amount.value && /컵|개|알|덩이|봉|봉지|팩|공기|count|인분/.test(amount.unit || '')) {
    if (servingCalories !== null || servingCarbs !== null || servingProtein !== null || servingFat !== null) {
      multiplier = amount.value;
      useServing = true;
    } else if (packageQty) {
      multiplier = (packageQty / 100) * amount.value;
    } else if (servingQty) {
      multiplier = (servingQty / 100) * amount.value;
    } else {
      multiplier = amount.value;
    }
  } else if (servingCalories !== null || servingCarbs !== null || servingProtein !== null || servingFat !== null) {
    useServing = true;
  } else if (packageQty) {
    multiplier = packageQty / 100;
  } else if (servingQty) {
    multiplier = servingQty / 100;
  }

  if (useServing) {
    return summarizeNutrition({
      calories: servingCalories !== null ? servingCalories * multiplier : undefined,
      carbsG: (servingCarbs ?? 0) * multiplier,
      proteinG: (servingProtein ?? 0) * multiplier,
      fatG: (servingFat ?? 0) * multiplier,
      fiberG: servingFiber !== null ? servingFiber * multiplier : undefined,
      source: 'search',
    });
  }

  if (per100Calories === null && per100Carbs === null && per100Protein === null && per100Fat === null) {
    return null;
  }

  return summarizeNutrition({
    calories: per100Calories !== null ? per100Calories * multiplier : undefined,
    carbsG: (per100Carbs ?? 0) * multiplier,
    proteinG: (per100Protein ?? 0) * multiplier,
    fatG: (per100Fat ?? 0) * multiplier,
    fiberG: per100Fiber !== null ? per100Fiber * multiplier : undefined,
    source: 'search',
  });
}

async function searchOpenFoodFactsProduct(query: string): Promise<OpenFoodFactsProduct | null> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return null;

  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(normalizedQuery)}&search_simple=1&action=process&json=1&page_size=5`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts search failed with status ${response.status}`);
  }

  const payload = await response.json();
  const products = Array.isArray(payload?.products) ? (payload.products as OpenFoodFactsProduct[]) : [];
  if (!products.length) {
    return null;
  }

  const best = products
    .map((product) => ({ product, score: scoreOpenFoodFactsProduct(product, normalizedQuery) }))
    .sort((left, right) => right.score - left.score)[0];

  return best && best.score >= 3 ? best.product : null;
}

async function estimateMealNutritionFromSearch(title: string, notes: string): Promise<MealNutritionEstimate | null> {
  const combined = [title, notes].filter(Boolean).join(', ').trim();
  const segments = splitMealDescription(combined).slice(0, 4);
  if (!segments.length) {
    return null;
  }

  const foundLabels: string[] = [];
  let total: NutritionInfo = {
    calories: 0,
    carbsG: 0,
    proteinG: 0,
    fatG: 0,
    fiberG: 0,
    source: 'search',
  };
  let matchedCount = 0;

  for (const segment of segments) {
    try {
      const product = await searchOpenFoodFactsProduct(segment);
      const searchedNutrition = product ? convertOpenFoodFactsProductToNutrition(product, segment) : null;

      if (searchedNutrition) {
        total = {
          calories: (total.calories || 0) + (searchedNutrition.calories || 0),
          carbsG: total.carbsG + searchedNutrition.carbsG,
          proteinG: total.proteinG + searchedNutrition.proteinG,
          fatG: total.fatG + searchedNutrition.fatG,
          fiberG: (total.fiberG || 0) + (searchedNutrition.fiberG || 0),
          source: 'search',
        };
        matchedCount += 1;
        foundLabels.push(productLabel(product!));
        continue;
      }
    } catch (error) {
      debugAiLog('error', {
        operation: 'meal_product_search',
        query: segment,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const localSegment = estimateMealSegmentNutrition(segment);
    if (localSegment.nutrition) {
      total = {
        calories: (total.calories || 0) + (localSegment.nutrition.calories || 0),
        carbsG: total.carbsG + localSegment.nutrition.carbsG,
        proteinG: total.proteinG + localSegment.nutrition.proteinG,
        fatG: total.fatG + localSegment.nutrition.fatG,
        fiberG: (total.fiberG || 0) + (localSegment.nutrition.fiberG || 0),
        source: 'search',
      };
      matchedCount += 1;
      foundLabels.push(`${segment} (부분 추정)`);
    }
  }

  if (!matchedCount) {
    return null;
  }

  return {
    title: title.trim() || segments[0],
    notes,
    nutrition: summarizeNutrition(total)!,
    rationale: foundLabels.length
      ? `검색 우선으로 ${foundLabels.join(', ')} 정보를 반영해 합산했어요.`
      : '검색 기반 영양정보를 합산했어요.',
    source: 'search',
  };
}

async function buildMealReferenceContext(title: string, notes: string): Promise<MealReferenceContext> {
  const combined = [title, notes].filter(Boolean).join(', ').trim();
  const segments = splitMealDescription(combined).slice(0, 5);
  const lines: string[] = [];
  let matchedCount = 0;

  for (const segment of segments) {
    try {
      const product = await searchOpenFoodFactsProduct(segment);
      const searchedNutrition = product ? convertOpenFoodFactsProductToNutrition(product, segment) : null;

      if (product && searchedNutrition) {
        matchedCount += 1;
        lines.push(
          `- ${segment}: matched "${productLabel(product)}" approx ${Math.round(searchedNutrition.calories || 0)} kcal, carbs ${searchedNutrition.carbsG}g, protein ${searchedNutrition.proteinG}g, fat ${searchedNutrition.fatG}g.`,
        );
        continue;
      }
    } catch (error) {
      debugAiLog('error', {
        operation: 'meal_reference_search',
        query: segment,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const localSegment = estimateMealSegmentNutrition(segment);
    if (localSegment.nutrition) {
      matchedCount += 1;
      lines.push(
        `- ${segment}: fallback estimate approx ${Math.round(localSegment.nutrition.calories || 0)} kcal, carbs ${localSegment.nutrition.carbsG}g, protein ${localSegment.nutrition.proteinG}g, fat ${localSegment.nutrition.fatG}g.`,
      );
    }
  }

  const searchedEstimate = await estimateMealNutritionFromSearch(title, notes);
  if (searchedEstimate?.nutrition) {
    lines.push(
      `- Rough combined total before final reasoning: ${Math.round(searchedEstimate.nutrition.calories || 0)} kcal, carbs ${searchedEstimate.nutrition.carbsG}g, protein ${searchedEstimate.nutrition.proteinG}g, fat ${searchedEstimate.nutrition.fatG}g.`,
    );
  }

  return {
    summary: lines.join('\n'),
    matchedCount,
    searchedEstimate,
  };
}

function buildMealNutritionPrompt(title: string, notes: string) {
  return {
    system: `You estimate nutrition for a single meal log.
Return JSON only with this schema:
{
  "title": "short meal title",
  "notes": "brief meal note",
  "nutrition": {
    "calories": 0,
    "carbsG": 0,
    "proteinG": 0,
    "fatG": 0,
    "fiberG": 0
  },
  "rationale": "1 short sentence"
}
Use visible nutrition labels when present. If the user specifies quantities like grams, ml, cups, scoops, counts, shared portions, or fractions, calculate totals from them.
If the user describes eating part of a shared dish, estimate the user's own consumed portion, not the whole table order.
When phrases like "조금", "몇 젓가락", "3명이 나눠먹음", "3분의 1", "half", "a few bites" appear, reason about portion size before computing totals.
Search the web for likely nutrition facts or product references when needed, then reason about the actual eaten amount from the user's description.
If exact values are impossible, provide a practical estimate.`,
    user: `Meal title: ${title || '(none)'}
Meal note: ${notes || '(none)'}
Important:
- Treat brand names and product names in the note as high-priority clues.
- If the note says things like "50g", "1 cup", "1 pack", "1 piece", calculate totals from those amounts.
- If an attached image includes a nutrition label or package front, use that before guessing.
- Return the user's consumed total, not the full table total.`,
  };
}

async function requestGeminiMealNutritionEstimate(
  settings: AiSettings,
  title: string,
  notes: string,
  base64Images: string[] = [],
): Promise<MealNutritionEstimate> {
  const prompt = buildMealNutritionPrompt(title, notes);
  const contentsParts: any[] = [{ text: prompt.user }];
  base64Images.forEach((base64) => {
    contentsParts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64,
      },
    });
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel || 'gemini-2.5-flash'}:generateContent?key=${settings.geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: prompt.system }],
        },
        contents: [
          {
            role: 'user',
            parts: contentsParts,
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Gemini meal nutrition request failed.');
  }

  return parseMealNutritionEstimate(extractTextFromGeminiResponse(payload));
}

async function requestOpenAiMealNutritionEstimate(
  settings: AiSettings,
  title: string,
  notes: string,
  base64Images: string[] = [],
): Promise<MealNutritionEstimate> {
  const prompt = buildMealNutritionPrompt(title, notes);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openAiKey}`,
    },
    body: JSON.stringify({
      model: settings.openAiModel || 'gpt-5-mini',
      tools: [
        {
          type: 'web_search',
          user_location: {
            type: 'approximate',
            country: 'KR',
            city: 'Seoul',
            region: 'Seoul',
          },
        },
      ],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: prompt.system }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt.user },
            ...base64Images.map((base64) => ({
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${base64}`,
              detail: 'high',
            })),
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'meal_nutrition_estimate',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              notes: { type: 'string' },
              rationale: { type: 'string' },
              nutrition: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  calories: { type: 'number' },
                  carbsG: { type: 'number' },
                  proteinG: { type: 'number' },
                  fatG: { type: 'number' },
                  fiberG: { type: 'number' },
                },
                required: ['calories', 'carbsG', 'proteinG', 'fatG', 'fiberG'],
              },
            },
            required: ['title', 'notes', 'nutrition', 'rationale'],
          },
        },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'OpenAI meal nutrition request failed.');
  }

  return parseMealNutritionEstimate(extractTextFromOpenAiResponse(payload) || JSON.stringify(payload));
}

async function requestGroqMealNutritionEstimate(
  settings: AiSettings,
  title: string,
  notes: string,
  base64Images: string[] = [],
): Promise<MealNutritionEstimate> {
  if (!settings.groqKey) {
    throw new Error('Groq API 키가 필요합니다.');
  }

  const prompt = buildMealNutritionPrompt(title, notes);
  const model = settings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `${prompt.system}
If exact label data is unavailable, estimate using typical nutrition references and realistic serving sizes.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.user },
            ...base64Images.map((base64) => ({
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            })),
          ],
        },
      ],
      response_format: {
        type: 'json_object',
      },
      temperature: 0.2,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? 'Groq meal nutrition request failed.');
  }

  const text = payload?.choices?.[0]?.message?.content ?? '';
  return parseMealNutritionEstimate(text || JSON.stringify(payload));
}

export async function estimateMealNutrition(
  settings: AiSettings,
  title: string,
  notes: string,
  base64Images: string[] = [],
): Promise<MealNutritionEstimate> {
  const hasAiSearchPrompt = notes.trim().length > 0;

  if (!title.trim() && !notes.trim() && base64Images.length === 0) {
    return {
      ...estimateMealNutritionFromText(title, notes),
      source: 'local',
    };
  }

  try {
    if (hasAiSearchPrompt) {
      if (settings.groqKey) {
        const aiEstimate = await requestGroqMealNutritionEstimate(
          settings,
          title,
          notes,
          base64Images,
        );
        return {
          ...aiEstimate,
          providerLabel: `Groq · ${settings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct'}`,
          rationale:
            base64Images.length > 0
              ? `${aiEstimate.rationale} AI 설명란 문장과 첨부 이미지를 함께 Groq에 넘겨 계산했어요.`
              : `${aiEstimate.rationale} AI 설명란 문장을 그대로 Groq에 넘겨 계산했어요.`,
        };
      }

      if (settings.provider === 'openai' && settings.openAiKey) {
        const aiEstimate = await requestOpenAiMealNutritionEstimate(
          settings,
          title,
          notes,
          base64Images,
        );
        return {
          ...aiEstimate,
          providerLabel: `OpenAI · ${settings.openAiModel || 'gpt-5-mini'}`,
          rationale:
            base64Images.length > 0
              ? `${aiEstimate.rationale} AI 설명란 문장과 첨부 이미지를 함께 OpenAI에 넘겨 계산했어요.`
              : `${aiEstimate.rationale} AI 설명란 문장을 그대로 OpenAI에 넘겨 계산했어요.`,
        };
      }

      if (settings.geminiKey) {
        const aiEstimate = await requestGeminiMealNutritionEstimate(
          settings,
          title,
          notes,
          base64Images,
        );
        return {
          ...aiEstimate,
          providerLabel: `Gemini · ${settings.geminiModel || 'gemini-2.5-flash'}`,
          rationale:
            base64Images.length > 0
              ? `${aiEstimate.rationale} AI 설명란 문장과 첨부 이미지를 함께 Gemini에 넘겨 계산했어요.`
              : `${aiEstimate.rationale} AI 설명란 문장을 그대로 Gemini에 넘겨 계산했어요.`,
        };
      }

      throw new Error('AI 분석용 설명을 사용하려면 연결된 Groq, OpenAI, 또는 Gemini API 키가 필요합니다.');
    }

    if (settings.groqKey) {
      const aiEstimate = await requestGroqMealNutritionEstimate(
        settings,
        title,
        notes,
        base64Images,
      );
      return {
        ...aiEstimate,
        providerLabel: `Groq · ${settings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct'}`,
        rationale: `${aiEstimate.rationale} Groq 모델 기준으로 계산했어요.`,
      };
    }

    if (settings.provider === 'openai' && settings.openAiKey) {
      const aiEstimate = await requestOpenAiMealNutritionEstimate(
        settings,
        title,
        notes,
        base64Images,
      );
      return {
        ...aiEstimate,
        providerLabel: `OpenAI · ${settings.openAiModel || 'gpt-5-mini'}`,
        rationale:
          base64Images.length > 0
            ? `${aiEstimate.rationale} AI 설명란 문장과 첨부 이미지를 함께 검색/추론했어요.`
            : `${aiEstimate.rationale} AI 설명란 문장을 그대로 검색 가능한 AI에 넘겨 계산했어요.`,
      };
    }

    if (settings.provider === 'gemini' && settings.geminiKey) {
      const aiEstimate = await requestGeminiMealNutritionEstimate(
        settings,
        title,
        notes,
        base64Images,
      );
      return {
        ...aiEstimate,
        providerLabel: `Gemini · ${settings.geminiModel || 'gemini-2.5-flash'}`,
      };
    }

    if (settings.openAiKey) {
      const aiEstimate = await requestOpenAiMealNutritionEstimate(
        settings,
        title,
        notes,
        base64Images,
      );
      return {
        ...aiEstimate,
        providerLabel: `OpenAI · ${settings.openAiModel || 'gpt-5-mini'}`,
        rationale:
          base64Images.length > 0
            ? `${aiEstimate.rationale} AI 설명란 문장과 첨부 이미지를 함께 검색/추론했어요.`
            : `${aiEstimate.rationale} AI 설명란 문장을 그대로 검색 가능한 AI에 넘겨 계산했어요.`,
      };
    }

    if (settings.geminiKey) {
      const aiEstimate = await requestGeminiMealNutritionEstimate(
        settings,
        title,
        notes,
        base64Images,
      );
      return {
        ...aiEstimate,
        providerLabel: `Gemini · ${settings.geminiModel || 'gemini-2.5-flash'}`,
      };
    }
  } catch (error) {
    debugAiLog('error', {
      operation: 'meal_nutrition',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (hasAiSearchPrompt || settings.openAiKey || settings.groqKey || settings.geminiKey) {
      throw error instanceof Error ? error : new Error('AI meal nutrition request failed.');
    }
  }

  return {
    ...estimateMealNutritionFromText(title, notes),
    source: 'local',
  };
}

async function requestOpenAiInsight(
  settings: AiSettings,
  store: HealthStore,
) {
  const prompt = buildPrompt(store);
  debugAiLog('request', {
    operation: 'coach_insight',
    provider: 'openai',
    model: settings.openAiModel,
    system: summarizeForLog(prompt.system),
    user: summarizeForLog(prompt.user),
  });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openAiKey}`,
    },
    body: JSON.stringify({
      model: settings.openAiModel,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: prompt.system }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt.user }],
        },
      ],
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    debugAiLog('error', {
      operation: 'coach_insight',
      provider: 'openai',
      model: settings.openAiModel,
      error: payload?.error?.message ?? 'OpenAI request failed.',
    });
    throw new Error(payload?.error?.message ?? 'OpenAI request failed.');
  }

  const text = extractTextFromOpenAiResponse(payload);
  debugAiLog('response', {
    operation: 'coach_insight',
    provider: 'openai',
    model: settings.openAiModel,
    text: summarizeForLog(text, 500),
  });
  return createInsight('openai', parseInsightPayload(text));
}

async function requestGeminiInsight(
  settings: AiSettings,
  store: HealthStore,
) {
  const prompt = buildPrompt(store);
  debugAiLog('request', {
    operation: 'coach_insight',
    provider: 'gemini',
    model: settings.geminiModel,
    system: summarizeForLog(prompt.system),
    user: summarizeForLog(prompt.user),
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent?key=${settings.geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: prompt.system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt.user }],
          },
        ],
        generationConfig: {
          temperature: 0.4,
        },
      }),
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    debugAiLog('error', {
      operation: 'coach_insight',
      provider: 'gemini',
      model: settings.geminiModel,
      error: payload?.error?.message ?? 'Gemini request failed.',
    });
    throw new Error(payload?.error?.message ?? 'Gemini request failed.');
  }

  const text = extractTextFromGeminiResponse(payload);
  debugAiLog('response', {
    operation: 'coach_insight',
    provider: 'gemini',
    model: settings.geminiModel,
    text: summarizeForLog(text, 500),
  });
  return createInsight('gemini', parseInsightPayload(text));
}

async function requestGeminiAnswer(
  settings: AiSettings,
  store: HealthStore,
  query: string,
): Promise<string> {
  const dataContext = buildPrompt(store).user;
  const systemPrompt = `You are an expert personal health coach.
Answer the user's question based strictly on their provided health tracking data.
If the information is not in the logs, say you don't have that data.
Be encouraging, concise, and practical.
Do not provide medical diagnosis.

User Health Context:
${dataContext}`;
  debugAiLog('request', {
    operation: 'chat_answer',
    provider: 'gemini',
    model: settings.geminiModel || 'gemini-2.5-flash',
    system: summarizeForLog(systemPrompt),
    user: summarizeForLog(query),
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel || 'gemini-2.5-flash'}:generateContent?key=${settings.geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: query }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
        },
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    debugAiLog('error', {
      operation: 'chat_answer',
      provider: 'gemini',
      model: settings.geminiModel || 'gemini-2.5-flash',
      error: payload?.error?.message ?? 'Gemini request failed.',
    });
    throw new Error(payload?.error?.message ?? 'Gemini request failed.');
  }

  const text = extractTextFromGeminiResponse(payload);
  debugAiLog('response', {
    operation: 'chat_answer',
    provider: 'gemini',
    model: settings.geminiModel || 'gemini-2.5-flash',
    text: summarizeForLog(text, 500),
  });
  return text;
}

async function requestOpenAiAnswer(
  settings: AiSettings,
  store: HealthStore,
  query: string,
): Promise<string> {
  const dataContext = buildPrompt(store).user;
  const systemPrompt = `You are an expert personal health coach.
Answer the user's question based strictly on their provided health tracking data.
If the information is not in the logs, say you don't have that data.
Be encouraging, concise, and practical.
Do not provide medical diagnosis.

User Health Context:
${dataContext}`;
  debugAiLog('request', {
    operation: 'chat_answer',
    provider: 'openai',
    model: settings.openAiModel || 'gpt-5-mini',
    system: summarizeForLog(systemPrompt),
    user: summarizeForLog(query),
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openAiKey}`,
    },
    body: JSON.stringify({
      model: settings.openAiModel || 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    debugAiLog('error', {
      operation: 'chat_answer',
      provider: 'openai',
      model: settings.openAiModel || 'gpt-5-mini',
      error: payload?.error?.message ?? 'OpenAI request failed.',
    });
    throw new Error(payload?.error?.message ?? 'OpenAI request failed.');
  }

  const text = payload.choices[0]?.message?.content ?? 'No response received.';
  debugAiLog('response', {
    operation: 'chat_answer',
    provider: 'openai',
    model: settings.openAiModel || 'gpt-5-mini',
    text: summarizeForLog(text, 500),
  });
  return text;
}

export async function generateAiResponse(
  settings: AiSettings,
  store: HealthStore,
  query: string,
): Promise<string> {
  if (settings.provider === 'openai' && settings.openAiKey) {
    return requestOpenAiAnswer(settings, store, query);
  }

  if (settings.provider === 'gemini' && settings.geminiKey) {
    return requestGeminiAnswer(settings, store, query);
  }

  if (settings.openAiKey) {
    return requestOpenAiAnswer(settings, store, query);
  }

  if (settings.geminiKey) {
    return requestGeminiAnswer(settings, store, query);
  }

  return `[Local Analysis Mode] 
Your tracking looks active! You have ${store.meals.length} meals and ${store.workouts.length} workouts logged. 
(Note: To get a real Gemini response, please add your API key in Goals > AI Settings.)`;
}

export async function generateCoachInsight(
  settings: AiSettings,
  store: HealthStore,
  preferredProvider: AiProvider = settings.provider,
) {
  if (preferredProvider === 'openai' && settings.openAiKey) {
    return requestOpenAiInsight(settings, store);
  }

  if (preferredProvider === 'gemini' && settings.geminiKey) {
    return requestGeminiInsight(settings, store);
  }

  if (settings.openAiKey) {
    return requestOpenAiInsight(settings, store);
  }

  if (settings.geminiKey) {
    return requestGeminiInsight(settings, store);
  }

  return createLocalInsight(store);
}

type SupportedImageMode = 'meal' | 'workout' | 'weight';

type ImageAnalysisResponse = {
  provider: AiProvider | 'groq';
  rawText: string;
  data: any | null;
  type?: SupportedImageMode;
  error?: string;
};

function buildImageAnalysisPrompts(mode?: SupportedImageMode) {
  const systemPrompt = `Analyze the provided health-related image(s). 
Your goal is to extract specific data for a health tracker.

If the category is "meal":
- title: A short, appetizing name for the meal.
- notes: Detailed but brief description including portion size (e.g., "1 bowl of pasta, approx 400g").

If the category is "workout":
- kind: One of "running", "badminton", "strength", "mobility", "other".
- title: A short name for the session.
- notes: Brief observation.
- durationMinutes: (number) Estimated or extracted duration.
- distanceKm: (number, for running) Total distance in km.
- paceMinPerKm: (number, for running) Average pace in decimal minutes per km. Convert formats like "5:23 /km" into 5.38.
- averageHeartRate: (number, for running) Average HR in bpm.
- averageCadence: (number, for running) Average cadence in steps per minute (spm).
- For running screenshots, prioritize OCR of labels like distance, km, pace, avg pace, average pace, heart rate, avg heart rate, bpm, duration, time, moving time.
- When multiple images are provided, treat them as the same workout session and combine evidence across images before returning the final JSON.
- If one image shows split/lap records, infer total distance and representative pace from the visible rows when possible.
- If another image shows heart-rate details, extract averageHeartRate from that image and merge it with running data from the other image.
- Return plain numbers only for workout metrics. Do not include units like "km", "bpm", or time strings like "5:23" in the JSON.

If the category is "weight":
- valueKg: (number) Weight in kilograms.
- bmi: (number, optional) Body Mass Index.
- bodyFatPercentage: (number, optional) Body fat percentage.
- skeletalMuscleMassKg: (number, optional) Skeletal muscle mass in kilograms.
- bodyWaterKg: (number, optional) Body water amount in kilograms.
- bodyFatMassKg: (number, optional) Body fat mass in kilograms.
- note: (optional) Any other info visible (e.g., "Fasted morning weight").

If no mode is provided, first detect the category ("meal", "workout", or "weight").

Return JSON only: { "type": "meal" | "workout" | "weight", "data": { ... } }`;

  const userPrompt = mode
    ? `Category: ${mode}. Analyze these images as one record and return JSON only.`
    : `Analyze these images, detect the category, and return JSON only.`;

  return { systemPrompt, userPrompt };
}

function parseImageAnalysisText(provider: AiProvider | 'groq', text: string): ImageAnalysisResponse {
  try {
    const parsed = JSON.parse(text);
    return {
      provider,
      rawText: text,
      data: parsed?.data ?? null,
      type: parsed?.type,
    };
  } catch {
    return {
      provider,
      rawText: text,
      data: null,
      error: 'Failed to parse model response as JSON.',
    };
  }
}

function scoreImageAnalysis(data: any, mode?: SupportedImageMode): number {
  if (!data || typeof data !== 'object') {
    return 0;
  }

  if (mode === 'workout') {
    return [
      data.kind,
      data.title,
      data.notes,
      data.durationMinutes,
      data.distanceKm,
      data.paceMinPerKm,
      data.averageHeartRate,
      data.averageCadence,
    ].filter((value) => value !== undefined && value !== null && value !== '').length;
  }

  return Object.values(data).filter((value) => value !== undefined && value !== null && value !== '').length;
}

async function requestGroqImageAnalysis(
  settings: AiSettings,
  base64Images: string[],
  mode?: SupportedImageMode,
): Promise<ImageAnalysisResponse> {
  if (!settings.groqKey) {
    throw new Error('Groq API key is required for image analysis.');
  }

  const model = settings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct';
  const { systemPrompt, userPrompt } = buildImageAnalysisPrompts(mode);
  debugAiLog('request', {
    operation: 'image_analysis',
    provider: 'groq',
    model,
    mode,
    imageCount: base64Images.length,
    system: summarizeForLog(systemPrompt),
    user: summarizeForLog(userPrompt),
  });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            ...base64Images.map((base64) => ({
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            })),
          ],
        },
      ],
      response_format: {
        type: 'json_object',
      },
      temperature: 0.2,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    debugAiLog('error', {
      operation: 'image_analysis',
      provider: 'groq',
      model,
      mode,
      error: payload?.error?.message ?? 'Groq image analysis failed.',
    });
    throw new Error(payload?.error?.message ?? 'Groq image analysis failed.');
  }

  const text = payload?.choices?.[0]?.message?.content ?? '';
  debugAiLog('response', {
    operation: 'image_analysis',
    provider: 'groq',
    model,
    mode,
    text: summarizeForLog(text, 600),
  });
  return parseImageAnalysisText('groq', text);
}

async function requestGeminiImageAnalysis(
  settings: AiSettings,
  base64Images: string[],
  mode?: SupportedImageMode,
): Promise<ImageAnalysisResponse> {
  if (!settings.geminiKey) {
    throw new Error('Gemini API key is required for image analysis.');
  }

  const { systemPrompt, userPrompt } = buildImageAnalysisPrompts(mode);
  debugAiLog('request', {
    operation: 'image_analysis',
    provider: 'gemini',
    model: settings.geminiModel || 'gemini-2.5-flash',
    mode,
    imageCount: base64Images.length,
    system: summarizeForLog(systemPrompt),
    user: summarizeForLog(userPrompt),
  });
  const contentsParts: any[] = [{ text: userPrompt }];
  base64Images.forEach((base64) => {
    contentsParts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64,
      },
    });
  });

  const model = settings.geminiModel || 'gemini-2.5-flash';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: contentsParts,
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    const payload = await response.json();
    if (response.ok) {
      const text = extractTextFromGeminiResponse(payload);
      debugAiLog('response', {
        operation: 'image_analysis',
        provider: 'gemini',
        model,
        mode,
        attempt: attempt + 1,
        text: summarizeForLog(text, 600),
      });
      return parseImageAnalysisText('gemini', text);
    }

    const message = payload?.error?.message ?? 'Gemini image analysis failed.';
    const shouldRetry = attempt < 2 && isRetryableAiError(message);
    debugAiLog('error', {
      operation: 'image_analysis',
      provider: 'gemini',
      model,
      mode,
      attempt: attempt + 1,
      retrying: shouldRetry,
      error: message,
    });

    if (!shouldRetry) {
      throw new Error(message);
    }

    await sleep(800 * (attempt + 1));
  }

  throw new Error('Gemini image analysis failed after retries.');
}

async function requestOpenAiImageAnalysis(
  settings: AiSettings,
  base64Images: string[],
  mode?: SupportedImageMode,
): Promise<ImageAnalysisResponse> {
  if (!settings.openAiKey) {
    throw new Error('OpenAI API key is required for image analysis.');
  }

  const { systemPrompt, userPrompt } = buildImageAnalysisPrompts(mode);
  debugAiLog('request', {
    operation: 'image_analysis',
    provider: 'openai',
    model: settings.openAiModel || 'gpt-5-mini',
    mode,
    imageCount: base64Images.length,
    system: summarizeForLog(systemPrompt),
    user: summarizeForLog(userPrompt),
  });
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: {
        type: 'string',
        enum: ['meal', 'workout', 'weight'],
      },
      data: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: {
            type: 'string',
            enum: ['running', 'badminton', 'strength', 'mobility', 'other'],
          },
          title: { type: 'string' },
          notes: { type: 'string' },
          durationMinutes: { type: 'number' },
          distanceKm: { type: 'number' },
          paceMinPerKm: { type: 'number' },
          averageHeartRate: { type: 'number' },
          averageCadence: { type: 'number' },
          valueKg: { type: 'number' },
          bmi: { type: 'number' },
          bodyFatPercentage: { type: 'number' },
          skeletalMuscleMassKg: { type: 'number' },
          bodyWaterKg: { type: 'number' },
          bodyFatMassKg: { type: 'number' },
          note: { type: 'string' },
        },
        required: [
          'kind',
          'title',
          'notes',
          'durationMinutes',
          'distanceKm',
          'paceMinPerKm',
          'averageHeartRate',
          'averageCadence',
          'valueKg',
          'bmi',
          'bodyFatPercentage',
          'skeletalMuscleMassKg',
          'bodyWaterKg',
          'bodyFatMassKg',
          'note',
        ],
      },
    },
    required: ['type', 'data'],
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openAiKey}`,
    },
    body: JSON.stringify({
      model: settings.openAiModel || 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: userPrompt },
            ...base64Images.map((base64) => ({
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${base64}`,
              detail: 'high',
            })),
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'health_image_analysis',
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    debugAiLog('error', {
      operation: 'image_analysis',
      provider: 'openai',
      model: settings.openAiModel || 'gpt-5-mini',
      mode,
      error: payload?.error?.message ?? 'OpenAI image analysis failed.',
    });
    throw new Error(payload?.error?.message ?? 'OpenAI image analysis failed.');
  }

  const text = extractTextFromOpenAiResponse(payload) || JSON.stringify(payload);
  debugAiLog('response', {
    operation: 'image_analysis',
    provider: 'openai',
    model: settings.openAiModel || 'gpt-5-mini',
    mode,
    text: summarizeForLog(text, 600),
  });
  return parseImageAnalysisText('openai', text);
}



export async function analyzeImage(
  settings: AiSettings,
  base64Images: string[],
  mode?: SupportedImageMode
): Promise<any> {
  const comparisons: ImageAnalysisResponse[] = [];
  const comparisonErrors: string[] = [];

  const runGemini = settings.imageAnalysisProvider === 'gemini' || settings.imageAnalysisProvider === 'compare';
  const runOpenAi = settings.imageAnalysisProvider === 'openai' || settings.imageAnalysisProvider === 'compare';
  const runGroq = settings.imageAnalysisProvider === 'groq' || settings.imageAnalysisProvider === 'compare';

  if (runGemini && settings.geminiKey) {
    try {
      comparisons.push(await requestGeminiImageAnalysis(settings, base64Images, mode));
    } catch (error) {
      comparisonErrors.push(
        `Gemini: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  if (runOpenAi && settings.openAiKey) {
    try {
      comparisons.push(await requestOpenAiImageAnalysis(settings, base64Images, mode));
    } catch (error) {
      comparisonErrors.push(
        `OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  if (runGroq && settings.groqKey) {
    try {
      comparisons.push(await requestGroqImageAnalysis(settings, base64Images, mode));
    } catch (error) {
      comparisonErrors.push(
        `Groq: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  if (!comparisons.length) {
    throw new Error(
      comparisonErrors[0] ||
      'No available image analysis provider. Add Gemini or OpenAI API keys in settings.'
    );
  }

  const best = comparisons
    .slice()
    .sort((left, right) => scoreImageAnalysis(right.data, mode) - scoreImageAnalysis(left.data, mode))[0];

  return {
    provider: settings.imageAnalysisProvider === 'compare' ? 'compare' : best.provider,
    type: best.type,
    data: best.data,
    rawText: best.rawText,
    comparisons,
    errors: comparisonErrors,
  };
}
