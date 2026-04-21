import { parseISO, subDays } from 'date-fns';

import { DietPhase, HealthStore, MealRecord, NutritionInfo, WeightRecord } from '../types';
import { calculateAge, todayDateKey } from './format';
import { getWorkoutMinutes } from './analytics';

export const dietPhaseMeta: Record<
  DietPhase,
  {
    label: string;
    calorieDelta: number;
    proteinMultiplier: number;
    fatMultiplier: number;
    coachLabel: string;
  }
> = {
  lean: {
    label: 'Lean',
    calorieDelta: -320,
    proteinMultiplier: 2.0,
    fatMultiplier: 0.8,
    coachLabel: '체지방을 줄이면서 근손실을 최소화하는 단계',
  },
  'lean-mass-up': {
    label: 'Lean mass up',
    calorieDelta: 140,
    proteinMultiplier: 1.9,
    fatMultiplier: 0.9,
    coachLabel: '체지방 증가는 억제하면서 근육량을 서서히 늘리는 단계',
  },
  'bulk-up': {
    label: 'Bulk up',
    calorieDelta: 320,
    proteinMultiplier: 1.8,
    fatMultiplier: 1.0,
    coachLabel: '훈련 퍼포먼스와 체중 증가를 우선하는 단계',
  },
};

export type MacroTotals = {
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  fiberG: number;
  mealsTracked: number;
};

export type MacroTargetSummary = {
  calories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  carbMultiplier: number;
  proteinMultiplier: number;
  fatMultiplier: number;
  maintenanceCalories: number;
  activityMultiplier: number;
  leanMassKg?: number;
  phase: DietPhase;
  phaseLabel: string;
  phaseDescription: string;
};

export type MacroCoachSummary = {
  targets: MacroTargetSummary | null;
  consumed: MacroTotals;
  remaining: MacroTotals;
  progress: {
    carbs: number;
    protein: number;
    fat: number;
  };
  workoutDeltaMinutes: number;
  workoutDeltaLabel: string;
  headline: string;
  body: string;
  recommendations: string[];
  missingProfileFields: string[];
  calorieBalance: number;
  calorieBurnEstimate: number;
  calorieLine: string;
};

function roundValue(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum = 0, maximum = 1.8) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getLatestBodyData(weights: WeightRecord[]) {
  return [...weights].sort((left, right) => {
    const dateComp = right.date.localeCompare(left.date);
    if (dateComp !== 0) return dateComp;
    return (right.time || '').localeCompare(left.time || '');
  })[0];
}

function resolveLeanMassKg(weight: WeightRecord | undefined) {
  if (!weight) return undefined;
  if (typeof weight.skeletalMuscleMassKg === 'number' && weight.skeletalMuscleMassKg > 0) {
    return weight.skeletalMuscleMassKg;
  }
  if (typeof weight.bodyFatMassKg === 'number' && weight.bodyFatMassKg > 0) {
    return Math.max(0, weight.valueKg - weight.bodyFatMassKg);
  }
  if (typeof weight.bodyFatPercentage === 'number' && weight.bodyFatPercentage > 0) {
    return weight.valueKg * (1 - weight.bodyFatPercentage / 100);
  }
  return undefined;
}

function getActivityMultiplier(workoutMinutes: number) {
  if (workoutMinutes < 60) return 1.32;
  if (workoutMinutes < 180) return 1.45;
  if (workoutMinutes < 360) return 1.58;
  return 1.72;
}

function getMissingProfileFields(store: HealthStore) {
  const missing: string[] = [];
  if (!store.profile.heightCm) missing.push('키');
  if (!store.profile.birthDate) missing.push('생년월일');
  if (!store.profile.sex) missing.push('성별');
  if (!store.weights.length) missing.push('최근 체중');
  return missing;
}

export function summarizeNutrition(nutrition?: NutritionInfo): NutritionInfo | null {
  if (!nutrition) return null;
  return {
    calories: nutrition.calories ? roundValue(nutrition.calories, 0) : undefined,
    carbsG: roundValue(nutrition.carbsG),
    proteinG: roundValue(nutrition.proteinG),
    fatG: roundValue(nutrition.fatG),
    fiberG: nutrition.fiberG ? roundValue(nutrition.fiberG) : undefined,
    source: nutrition.source,
  };
}

export function getMacroTotalsForMeals(meals: MealRecord[]): MacroTotals {
  return meals.reduce<MacroTotals>(
    (totals, meal) => {
      if (!meal.nutrition) {
        return totals;
      }

      return {
        calories: totals.calories + (meal.nutrition.calories || 0),
        carbsG: totals.carbsG + meal.nutrition.carbsG,
        proteinG: totals.proteinG + meal.nutrition.proteinG,
        fatG: totals.fatG + meal.nutrition.fatG,
        fiberG: totals.fiberG + (meal.nutrition.fiberG || 0),
        mealsTracked: totals.mealsTracked + 1,
      };
    },
    { calories: 0, carbsG: 0, proteinG: 0, fatG: 0, fiberG: 0, mealsTracked: 0 },
  );
}

export function getMacroTotalsForDate(meals: MealRecord[], date = todayDateKey()) {
  return getMacroTotalsForMeals(meals.filter((meal) => meal.date === date));
}

export function getNutritionTargets(store: HealthStore): MacroTargetSummary | null {
  const latestWeight = getLatestBodyData(store.weights);
  if (!latestWeight) return null;

  const weightKg = latestWeight.valueKg;
  const leanMassKg = resolveLeanMassKg(latestWeight);
  const heightCm = Number(store.profile.heightCm || 0);
  if (!leanMassKg && !heightCm) {
    return null;
  }
  const age = calculateAge(store.profile.birthDate) ?? 30;
  const sex = store.profile.sex || 'male';
  const weeklyMinutes = getWorkoutMinutes(store.workouts, 7);
  const activityMultiplier = getActivityMultiplier(weeklyMinutes);
  const phase = store.profile.dietPhase || 'lean';
  const phaseConfig = dietPhaseMeta[phase];

  const bmr = leanMassKg
    ? 370 + 21.6 * leanMassKg
    : 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);

  const maintenanceCalories = bmr * activityMultiplier;
  const calories = maintenanceCalories + phaseConfig.calorieDelta;
  const proteinG = weightKg * phaseConfig.proteinMultiplier;
  const fatG = Math.max(45, weightKg * phaseConfig.fatMultiplier);
  const carbsG = Math.max(120, (calories - proteinG * 4 - fatG * 9) / 4);

  return {
    calories: roundValue(calories, 0),
    carbsG: roundValue(carbsG),
    proteinG: roundValue(proteinG),
    fatG: roundValue(fatG),
    carbMultiplier: roundValue(carbsG / weightKg, 2),
    proteinMultiplier: phaseConfig.proteinMultiplier,
    fatMultiplier: phaseConfig.fatMultiplier,
    maintenanceCalories: roundValue(maintenanceCalories, 0),
    activityMultiplier: roundValue(activityMultiplier, 2),
    leanMassKg: leanMassKg ? roundValue(leanMassKg) : undefined,
    phase,
    phaseLabel: phaseConfig.label,
    phaseDescription: phaseConfig.coachLabel,
  };
}

export function getWorkoutDeltaSummary(store: HealthStore) {
  const thisWeek = getWorkoutMinutes(store.workouts, 7);
  const lastWeekStart = subDays(new Date(), 14);
  const previousWeekEnd = subDays(new Date(), 7);
  const previousWeek = store.workouts
    .filter((record) => {
      const date = parseISO(record.date);
      return date >= lastWeekStart && date < previousWeekEnd;
    })
    .reduce((total, record) => total + record.durationMinutes, 0);

  const delta = thisWeek - previousWeek;

  if (previousWeek === 0 && thisWeek === 0) {
    return {
      deltaMinutes: 0,
      label: '지난 2주 모두 운동 기록이 많지 않았어요.',
    };
  }

  if (delta === 0) {
    return {
      deltaMinutes: 0,
      label: '지난주와 비슷한 운동량을 유지하고 있어요.',
    };
  }

  return {
    deltaMinutes: delta,
    label:
      delta > 0
        ? `지난주보다 운동량이 ${Math.round(delta)}분 늘었어요.`
        : `지난주보다 운동량이 ${Math.abs(Math.round(delta))}분 줄었어요.`,
  };
}

export function getDailyBurnEstimate(store: HealthStore, date = todayDateKey()) {
  const targets = getNutritionTargets(store);
  if (!targets) return null;

  const baseBurn = targets.maintenanceCalories;
  const workoutBurn = store.workouts
    .filter((record) => record.date === date)
    .reduce((total, record) => total + record.durationMinutes * 6.5, 0);

  return roundValue(baseBurn + workoutBurn, 0);
}

function getMacroProgress(consumed: number, target: number) {
  if (!target) return 0;
  return roundValue(clamp(consumed / target, 0, 1.5), 2);
}

export function getMacroCoachSummary(store: HealthStore): MacroCoachSummary {
  const targets = getNutritionTargets(store);
  const consumed = getMacroTotalsForDate(store.meals);
  const workoutSummary = getWorkoutDeltaSummary(store);
  const missingProfileFields = getMissingProfileFields(store);

  if (!targets) {
    return {
      targets: null,
      consumed,
      remaining: consumed,
      progress: { carbs: 0, protein: 0, fat: 0 },
      workoutDeltaMinutes: workoutSummary.deltaMinutes,
      workoutDeltaLabel: workoutSummary.label,
      headline: '체중과 프로필을 먼저 입력하면 맞춤 영양 목표를 계산할 수 있어요.',
      body: '설정에서 키, 나이, 성별을 입력하고 Weights에 최근 체중과 체성분을 기록해 주세요.',
      recommendations: [
        '설정에서 현재 목표를 Lean, Lean mass up, Bulk up 중 하나로 선택해 주세요.',
        '오늘 체중과 체지방 또는 골격근량을 입력하면 단백질과 탄단지 목표가 더 정확해집니다.',
      ],
      missingProfileFields,
      calorieBalance: 0,
      calorieBurnEstimate: 0,
      calorieLine: '칼로리 밸런스를 계산하려면 프로필과 체중 데이터가 더 필요해요.',
    };
  }

  const remaining: MacroTotals = {
    calories: Math.max(0, roundValue(targets.calories - consumed.calories, 0)),
    carbsG: Math.max(0, roundValue(targets.carbsG - consumed.carbsG)),
    proteinG: Math.max(0, roundValue(targets.proteinG - consumed.proteinG)),
    fatG: Math.max(0, roundValue(targets.fatG - consumed.fatG)),
    fiberG: 0,
    mealsTracked: consumed.mealsTracked,
  };

  const progress = {
    carbs: getMacroProgress(consumed.carbsG, targets.carbsG),
    protein: getMacroProgress(consumed.proteinG, targets.proteinG),
    fat: getMacroProgress(consumed.fatG, targets.fatG),
  };

  const lowestMacro = [
    { key: '탄수화물', progress: progress.carbs, remaining: remaining.carbsG },
    { key: '단백질', progress: progress.protein, remaining: remaining.proteinG },
    { key: '지방', progress: progress.fat, remaining: remaining.fatG },
  ].sort((left, right) => left.progress - right.progress)[0];

  const headline = `${targets.phaseLabel} 기준으로 단백질은 체중 x ${targets.proteinMultiplier}, 탄수화물은 체중 x ${targets.carbMultiplier}, 지방은 체중 x ${targets.fatMultiplier}를 적용해 단백질 ${targets.proteinG}g, 탄수화물 ${targets.carbsG}g, 지방 ${targets.fatG}g를 목표로 잡았어요.`;
  const body = `현재는 단백질 ${roundValue(consumed.proteinG)}g, 탄수화물 ${roundValue(consumed.carbsG)}g, 지방 ${roundValue(consumed.fatG)}g를 채웠고 ${lowestMacro.key}이 가장 부족해 보여요.`;
  const calorieBurnEstimate = getDailyBurnEstimate(store) || 0;
  const calorieBalance = roundValue(consumed.calories - calorieBurnEstimate, 0);
  const calorieLine =
    calorieBalance > 120
      ? `예상 소모보다 ${Math.round(calorieBalance)}kcal 더 먹었어요. 오늘은 남은 식사를 조금 가볍게 가져가면 좋아요.`
      : calorieBalance < -120
        ? `예상 소모보다 ${Math.abs(Math.round(calorieBalance))}kcal 덜 먹었어요. 회복을 위해 탄수화물이나 단백질을 한 번 더 챙겨도 좋아요.`
        : '섭취 칼로리와 예상 소모 칼로리가 크게 벗어나지 않고 있어요.';

  const recommendations = [
    remaining.proteinG > 15
      ? `오늘 단백질이 ${remaining.proteinG}g 남았어요. 닭가슴살, 그릭요거트, 단백질 음료를 우선 고려해 보세요.`
      : '단백질은 목표에 거의 도달했어요. 남은 끼니는 탄수화물과 지방 밸런스만 가볍게 맞추면 됩니다.',
    remaining.carbsG > 25
      ? `탄수화물이 ${remaining.carbsG}g 부족합니다. 운동 전후에는 밥, 감자, 바나나 같은 소화 쉬운 탄수화물이 잘 맞아요.`
      : '탄수화물 섭취는 무난해 보여요. 남은 식사는 과하지 않게 유지하면 좋겠습니다.',
    workoutSummary.label,
  ];

  return {
    targets,
    consumed,
    remaining,
    progress,
    workoutDeltaMinutes: workoutSummary.deltaMinutes,
    workoutDeltaLabel: workoutSummary.label,
    headline,
    body,
    recommendations,
    missingProfileFields,
    calorieBalance,
    calorieBurnEstimate,
    calorieLine,
  };
}

type FoodEntry = {
  keywords: string[];
  serving: NutritionInfo;
  gramsPerServing?: number;
  mlPerServing?: number;
  pieceWeightG?: number;
  chopsticksWeightG?: number;
};

export type MealSegmentEstimate = {
  label: string;
  nutrition: NutritionInfo | null;
  rationale: string;
};

const foodDatabase: FoodEntry[] = [
  {
    keywords: ['제육덮밥', 'jeyuk'],
    serving: { calories: 820, carbsG: 96, proteinG: 33, fatG: 31, fiberG: 4, source: 'local' },
  },
  {
    keywords: ['김치찌개'],
    serving: { calories: 260, carbsG: 15, proteinG: 18, fatG: 14, fiberG: 3, source: 'local' },
  },
  {
    keywords: ['신라면', 'shin ramyun'],
    serving: { calories: 500, carbsG: 79, proteinG: 10, fatG: 16, fiberG: 3, source: 'local' },
  },
  {
    keywords: ['컵라면', '큰사발', '큰컵라면'],
    serving: { calories: 470, carbsG: 73, proteinG: 9, fatG: 16, fiberG: 2, source: 'local' },
  },
  {
    keywords: ['삼각김밥', 'triangle kimbap', 'onigiri'],
    serving: { calories: 180, carbsG: 33, proteinG: 4, fatG: 3.5, fiberG: 1, source: 'local' },
  },
  {
    keywords: ['닭가슴살', 'chicken breast'],
    serving: { calories: 165, carbsG: 0, proteinG: 31, fatG: 3.6, source: 'local' },
    gramsPerServing: 100,
  },
  {
    keywords: ['프로틴', '단백질쉐이크', 'protein shake', '웨이'],
    serving: { calories: 130, carbsG: 6, proteinG: 24, fatG: 2, source: 'local' },
  },
  {
    keywords: ['켈로그 프로틴 그래놀라 제로슈거', '프로틴 그래놀라 제로슈거', 'kellogg protein granola zero sugar'],
    serving: { calories: 220, carbsG: 29, proteinG: 17, fatG: 5, fiberG: 6, source: 'local' },
    gramsPerServing: 50,
  },
  {
    keywords: ['한끼통살', '쿠팡 한끼통살'],
    serving: { calories: 135, carbsG: 3, proteinG: 24, fatG: 3, source: 'local' },
  },
  {
    keywords: ['우유', 'milk'],
    serving: { calories: 125, carbsG: 10, proteinG: 6, fatG: 4.5, source: 'local' },
    mlPerServing: 200,
  },
  {
    keywords: ['계란', 'egg'],
    serving: { calories: 78, carbsG: 0.6, proteinG: 6.3, fatG: 5.3, source: 'local' },
  },
  {
    keywords: ['현미밥', '밥', 'rice'],
    serving: { calories: 300, carbsG: 68, proteinG: 6, fatG: 1, fiberG: 2, source: 'local' },
    gramsPerServing: 210,
  },
  {
    keywords: ['오리고기', '오리', 'duck'],
    serving: { calories: 420, carbsG: 0, proteinG: 36, fatG: 30, source: 'local' },
    gramsPerServing: 100,
  },
  {
    keywords: ['당면', 'glass noodle'],
    serving: { calories: 110, carbsG: 27, proteinG: 0.5, fatG: 0.1, source: 'local' },
    gramsPerServing: 100,
    chopsticksWeightG: 18,
  },
  {
    keywords: ['떡', 'rice cake'],
    serving: { calories: 135, carbsG: 30, proteinG: 2.5, fatG: 0.3, source: 'local' },
    gramsPerServing: 100,
    pieceWeightG: 12,
  },
  {
    keywords: ['양파', 'onion'],
    serving: { calories: 20, carbsG: 4.5, proteinG: 0.6, fatG: 0.1, fiberG: 0.8, source: 'local' },
    gramsPerServing: 100,
    pieceWeightG: 100,
  },
  {
    keywords: ['그릭요거트', 'greek yogurt'],
    serving: { calories: 110, carbsG: 7, proteinG: 17, fatG: 1.5, source: 'local' },
  },
  {
    keywords: ['바나나', 'banana'],
    serving: { calories: 100, carbsG: 27, proteinG: 1.3, fatG: 0.3, fiberG: 3, source: 'local' },
  },
  {
    keywords: ['방울토마토', 'cherry tomato'],
    serving: { calories: 30, carbsG: 6, proteinG: 1.2, fatG: 0.2, fiberG: 2, source: 'local' },
    gramsPerServing: 100,
    pieceWeightG: 12,
  },
  {
    keywords: ['파채', 'scallion', 'green onion'],
    serving: { calories: 32, carbsG: 7, proteinG: 1.8, fatG: 0.2, fiberG: 2.6, source: 'local' },
    gramsPerServing: 100,
  },
  {
    keywords: ['샐러드', 'salad'],
    serving: { calories: 180, carbsG: 12, proteinG: 10, fatG: 9, fiberG: 4, source: 'local' },
  },
];

function getServingMultiplier(text: string, entry: FoodEntry) {
  if (entry.keywords.some((keyword) => /오리고기|오리/i.test(keyword)) && /반마리|반 마리/i.test(text)) {
    return 1.5;
  }

  if (entry.keywords.some((keyword) => /오리고기|오리/i.test(keyword)) && /한마리|한 마리|1마리/i.test(text)) {
    return 3;
  }

  if (entry.keywords.some((keyword) => /당면/i.test(keyword)) && /사리/i.test(text)) {
    return /추가|넣은|들은/i.test(text) ? 1.3 : 1;
  }

  const gramMatch = text.match(/(\d+(?:\.\d+)?)\s*(g|그램)/i);
  if (entry.gramsPerServing && gramMatch) {
    return Number(gramMatch[1]) / entry.gramsPerServing;
  }

  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*(ml|mL)/i);
  if (entry.mlPerServing && mlMatch) {
    return Number(mlMatch[1]) / entry.mlPerServing;
  }

  const cupMatch = text.match(/(\d+(?:\.\d+)?)\s*컵/i);
  if (entry.mlPerServing && cupMatch) {
    return Number(cupMatch[1]);
  }

  const countMatch = text.match(/(\d+(?:\.\d+)?)\s*(개|알)/i);
  if (countMatch) {
    return Number(countMatch[1]);
  }

  if (/한컵|한 컵/i.test(text) && entry.mlPerServing) {
    return 1;
  }

  if (/한덩어리|한 덩어리|1개|한개/i.test(text)) {
    return 1;
  }

  return 1;
}

function addNutrition(base: NutritionInfo, addition: NutritionInfo, multiplier = 1): NutritionInfo {
  return {
    calories: roundValue((base.calories || 0) + (addition.calories || 0) * multiplier, 0),
    carbsG: roundValue(base.carbsG + addition.carbsG * multiplier),
    proteinG: roundValue(base.proteinG + addition.proteinG * multiplier),
    fatG: roundValue(base.fatG + addition.fatG * multiplier),
    fiberG: roundValue((base.fiberG || 0) + (addition.fiberG || 0) * multiplier),
    source: base.source || addition.source,
  };
}

export function splitMealDescription(text: string) {
  return text
    .replace(/[+\/]/g, ',')
    .replace(/\s*(먹고|먹음|먹었음|먹었다|사먹음|마시고|추가해서|추가로|곁들여|그리고|에다가|랑|하고)\s*/g, ',')
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function normalizeKoreanNumbers(text: string) {
  return text
    .replace(/한두|한 두/g, '1.5')
    .replace(/한/g, '1')
    .replace(/두/g, '2')
    .replace(/세/g, '3')
    .replace(/네/g, '4')
    .replace(/다섯/g, '5')
    .replace(/여섯/g, '6')
    .replace(/일곱/g, '7')
    .replace(/여덟/g, '8')
    .replace(/아홉/g, '9')
    .replace(/열/g, '10');
}

function parseRangeAverage(match: RegExpMatchArray | null) {
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (Number.isNaN(first) || Number.isNaN(second)) return null;
  return (first + second) / 2;
}

function getExplicitPortionMultiplier(text: string, entry: FoodEntry) {
  const normalized = normalizeKoreanNumbers(text.toLowerCase());

  const gramRange = parseRangeAverage(normalized.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)\s*(g|그램)/i));
  if (entry.gramsPerServing && gramRange) {
    return gramRange / entry.gramsPerServing;
  }

  const gramMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(g|그램)/i);
  if (entry.gramsPerServing && gramMatch) {
    return Number(gramMatch[1]) / entry.gramsPerServing;
  }

  const halfMatch = normalized.match(/반\s*(개|알|덩이|봉|공기)/i);
  if (halfMatch) {
    if (entry.pieceWeightG && entry.gramsPerServing) {
      return entry.pieceWeightG * 0.5 / entry.gramsPerServing;
    }
    return 0.5;
  }

  const countRange = parseRangeAverage(normalized.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)\s*(개|알|덩이|봉|봉지|팩|공기|젓가락)/i));
  if (countRange) {
    const unit = normalized.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)\s*(개|알|덩이|봉|봉지|팩|공기|젓가락)/i)?.[3];
    if (unit === '젓가락' && entry.chopsticksWeightG && entry.gramsPerServing) {
      return countRange * entry.chopsticksWeightG / entry.gramsPerServing;
    }
    if ((unit === '개' || unit === '알') && entry.pieceWeightG && entry.gramsPerServing) {
      return countRange * entry.pieceWeightG / entry.gramsPerServing;
    }
    return countRange;
  }

  const countMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(개|알|덩이|봉|봉지|팩|공기|젓가락)/i);
  if (countMatch) {
    const count = Number(countMatch[1]);
    const unit = countMatch[2];
    if (unit === '젓가락' && entry.chopsticksWeightG && entry.gramsPerServing) {
      return count * entry.chopsticksWeightG / entry.gramsPerServing;
    }
    if ((unit === '개' || unit === '알') && entry.pieceWeightG && entry.gramsPerServing) {
      return count * entry.pieceWeightG / entry.gramsPerServing;
    }
    return Number(countMatch[1]);
  }

  if (/한컵|한 컵/i.test(normalized) && entry.mlPerServing) {
    return 1;
  }

  if (/한공기|한 공기/i.test(normalized)) {
    return 1;
  }

  if (/한덩이|한 덩어리|하나|1개|한개|한봉|한 봉|한팩|한 팩|한봉지|한 봉지/i.test(normalized)) {
    return 1;
  }

  return null;
}

export function estimateMealSegmentNutrition(text: string): MealSegmentEstimate {
  const normalized = text.toLowerCase();
  let nutrition: NutritionInfo = {
    calories: 0,
    carbsG: 0,
    proteinG: 0,
    fatG: 0,
    fiberG: 0,
    source: 'local',
  };
  let matched = 0;

  for (const entry of foodDatabase) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      matched += 1;
      const multiplier = getExplicitPortionMultiplier(normalized, entry) ?? getServingMultiplier(normalized, entry);
      nutrition = addNutrition(nutrition, entry.serving, multiplier);
    }
  }

  if (!matched) {
    const generic = inferGenericMeal(normalized);
    if (generic) {
      nutrition = addNutrition(nutrition, generic);
      matched = 1;
    }
  }

  if (!matched) {
    return {
      label: text.trim(),
      nutrition: null,
      rationale: '로컬 음식 사전에 매칭되지 않았어요.',
    };
  }

  return {
    label: text.trim(),
    nutrition: summarizeNutrition(nutrition),
    rationale: '문장 안의 음식명과 수량 표현을 기준으로 부분 추정했어요.',
  };
}

function inferGenericMeal(text: string): NutritionInfo | null {
  if (/덮밥|볶음밥|비빔밥|라면|파스타/i.test(text)) {
    return { calories: 680, carbsG: 86, proteinG: 24, fatG: 22, fiberG: 4, source: 'local' };
  }
  if (/찌개|국|탕/i.test(text)) {
    return { calories: 280, carbsG: 18, proteinG: 18, fatG: 14, fiberG: 3, source: 'local' };
  }
  if (/샌드위치|버거/i.test(text)) {
    return { calories: 520, carbsG: 46, proteinG: 27, fatG: 24, fiberG: 3, source: 'local' };
  }
  return null;
}

export function estimateMealNutritionFromText(title: string, notes = '') {
  const combined = `${title} ${notes}`.toLowerCase();
  const rawCombined = `${title} ${notes}`.trim();
  const fallbackTitle = title.trim() || notes.trim().split(/[,.]/)[0] || '식단 기록';

  if (/오리고기|오리/.test(combined) && /반마리|반 마리/.test(combined)) {
    const riceMultiplier =
      /밥\s*한공기|밥 한 공기|공기밥|밥추가|밥 추가/.test(combined) ? 1 : 0;
    const base: NutritionInfo = {
      calories: 980 + riceMultiplier * 300,
      carbsG: 46 + riceMultiplier * 68,
      proteinG: 48 + riceMultiplier * 6,
      fatG: 62 + riceMultiplier * 1,
      fiberG: 3,
      source: 'local',
    };

    if (/떡/.test(combined)) {
      base.calories = (base.calories || 0) + 135;
      base.carbsG += 30;
      base.proteinG += 2.5;
      base.fatG += 0.3;
    }

    if (/당면/.test(combined)) {
      base.calories = (base.calories || 0) + 110;
      base.carbsG += 27;
      base.proteinG += 0.5;
      base.fatG += 0.1;
    }

    if (/양파/.test(combined)) {
      base.calories = (base.calories || 0) + 20;
      base.carbsG += 4.5;
      base.proteinG += 0.6;
      base.fatG += 0.1;
      base.fiberG = (base.fiberG || 0) + 0.8;
    }

    return {
      title: fallbackTitle,
      notes: notes.trim(),
      nutrition: summarizeNutrition(base)!,
      rationale: '오리고기 반마리와 사리, 공기밥 추가를 반영한 외식 기준 추정치예요.',
    };
  }

  const segments = splitMealDescription(rawCombined);
  let nutrition: NutritionInfo = {
    calories: 0,
    carbsG: 0,
    proteinG: 0,
    fatG: 0,
    fiberG: 0,
    source: 'local',
  };
  let matched = 0;

  for (const segment of segments) {
    const estimate = estimateMealSegmentNutrition(segment);
    if (estimate.nutrition) {
      matched += 1;
      nutrition = addNutrition(nutrition, estimate.nutrition);
    }
  }

  if (!matched) {
    nutrition = {
      calories: 420,
      carbsG: 38,
      proteinG: 24,
      fatG: 16,
      fiberG: 3,
      source: 'local',
    };
  }

  return {
    title: fallbackTitle,
    notes: notes.trim(),
    nutrition: summarizeNutrition(nutrition)!,
    rationale:
      matched > 0
        ? '식단명과 수량 표현을 바탕으로 항목별 합산 추정을 계산했어요.'
        : '정확한 식품 정보가 부족해 일반적인 1인분 기준으로 추정했어요.',
  };
}
