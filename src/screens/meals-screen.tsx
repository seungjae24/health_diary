import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { addMonths, subMonths } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenFrame } from '../components/screen-frame';
import {
  EmptyState,
  FieldInput,
  MetricPill,
  ModalSheet,
  PrimaryButton,
  SurfaceCard,
} from '../components/ui';
import { useHealthData } from '../context/health-data-context';
import { useGlobalUi } from '../context/global-ui-context';
import { estimateMealNutrition } from '../services/ai';
import { fontFamily, palette } from '../theme';
import { NutritionInfo } from '../types';
import { buildMealCalendar, getMealPhotoRate } from '../utils/analytics';
import {
  dietPhaseMeta,
  getMacroTotalsForMeals,
  getDailyBurnEstimate,
  getMacroTotalsForDate,
  getNutritionTargets,
  summarizeNutrition,
} from '../utils/nutrition';
import {
  formatLongDate,
  formatMonthYear,
  formatTime,
  makeId,
  shiftDateKey,
  sortByDateDesc,
  todayDateKey,
  currentTimeKey,
} from '../utils/format';
import { captureImageWithCamera, getPersistedImageUri, pickImageFromLibrary } from '../utils/media';
import { confirmAction } from '../utils/ui';

const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

type MealDraft = {
  id?: string;
  date: string;
  time: string;
  title: string;
  notes: string;
  aiPrompt: string;
  imageUri: string;
  calories: string;
  carbsG: string;
  proteinG: string;
  fatG: string;
  fiberG: string;
};

type MealAiSummary = {
  modelLabel: string;
  source: 'ai' | 'local' | 'search';
  title?: string;
  notes?: string;
  nutrition?: NutritionInfo | null;
  rationale?: string;
  empty: boolean;
};

function createMealDraft(): MealDraft {
  return {
    date: todayDateKey(),
    time: currentTimeKey(),
    title: '',
    notes: '',
    aiPrompt: '',
    imageUri: '',
    calories: '',
    carbsG: '',
    proteinG: '',
    fatG: '',
    fiberG: '',
  };
}

function getDraftFromRecord(record: any): MealDraft {
  return {
    id: record.id,
    date: record.date,
    time: record.time || currentTimeKey(),
    title: record.title || '',
    notes: record.notes || '',
    aiPrompt: '',
    imageUri: record.imageUri || '',
    calories: record.nutrition?.calories ? String(record.nutrition.calories) : '',
    carbsG: record.nutrition?.carbsG ? String(record.nutrition.carbsG) : '',
    proteinG: record.nutrition?.proteinG ? String(record.nutrition.proteinG) : '',
    fatG: record.nutrition?.fatG ? String(record.nutrition.fatG) : '',
    fiberG: record.nutrition?.fiberG ? String(record.nutrition.fiberG) : '',
  };
}

function hasNutritionDraft(draft: MealDraft) {
  return Boolean(draft.calories || draft.carbsG || draft.proteinG || draft.fatG || draft.fiberG);
}

function buildNutritionFromDraft(draft: MealDraft, source: NutritionInfo['source'] = 'manual') {
  if (!hasNutritionDraft(draft)) {
    return undefined;
  }

  const nutrition = summarizeNutrition({
    calories: draft.calories ? Number(draft.calories) : undefined,
    carbsG: Number(draft.carbsG || 0),
    proteinG: Number(draft.proteinG || 0),
    fatG: Number(draft.fatG || 0),
    fiberG: draft.fiberG ? Number(draft.fiberG) : undefined,
    source,
  });

  return nutrition ?? undefined;
}

function formatMacroValue(value: number | undefined, suffix: string) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return `${Math.round(value)}${suffix}`;
}

export function MealsScreen({ route, navigation }: any) {
  const { store, addMeal, deleteMeal } = useHealthData();
  const { openAddMenu } = useGlobalUi();
  const [focusMonth, setFocusMonth] = useState(new Date());
  const [query, setQuery] = useState('');
  const [selectedMealDate, setSelectedMealDate] = useState<string | null>(null);
  const [composerVisible, setComposerVisible] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draft, setDraft] = useState<MealDraft>(createMealDraft());
  const [aiSummary, setAiSummary] = useState<MealAiSummary | null>(null);
  const [lastImageBase64s, setLastImageBase64s] = useState<string[]>([]);

  const shouldOpen = route?.params?.openComposer;
  const prefilledData = route?.params?.prefilledData;
  const initialImage = route?.params?.initialImage;

  React.useEffect(() => {
    if (shouldOpen) {
      openComposer(prefilledData, initialImage);
      navigation.setParams({
        openComposer: undefined,
        prefilledData: undefined,
        initialImage: undefined,
      });
    }
  }, [shouldOpen, prefilledData, initialImage]);

  const weekFloor = shiftDateKey(todayDateKey(), -6);
  const mealsThisWeek = store.meals.filter((record) => record.date >= weekFloor).length;
  const meals = sortByDateDesc(store.meals).filter((record) => {
    const haystack = `${record.title} ${record.notes}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const nutritionTargets = getNutritionTargets(store);
  const todayNutrition = getMacroTotalsForDate(store.meals);
  const burnEstimate = getDailyBurnEstimate(store) || 0;
  const calorieDelta = Math.round(todayNutrition.calories - burnEstimate);
  const phaseLabel = dietPhaseMeta[store.profile.dietPhase || 'lean'].label;
  const mealCalendar = buildMealCalendar(focusMonth, store.meals);
  const configuredModelLabel =
    store.aiSettings.provider === 'openai'
      ? `OpenAI · ${store.aiSettings.openAiModel || 'gpt-5-mini'}`
      : `Gemini · ${store.aiSettings.geminiModel || 'gemini-2.5-flash'}`;

  const macroRings = useMemo(
    () => [
      {
        key: 'carbs',
        label: '탄수화물',
        color: '#4A86FF',
        current: todayNutrition.carbsG,
        target: nutritionTargets?.carbsG ?? 0,
        unit: 'g',
      },
      {
        key: 'protein',
        label: '단백질',
        color: palette.mintDeep,
        current: todayNutrition.proteinG,
        target: nutritionTargets?.proteinG ?? 0,
        unit: 'g',
      },
      {
        key: 'fat',
        label: '지방',
        color: palette.coral,
        current: todayNutrition.fatG,
        target: nutritionTargets?.fatG ?? 0,
        unit: 'g',
      },
    ],
    [nutritionTargets, todayNutrition],
  );
  const selectedDateMeals = selectedMealDate
    ? sortByDateDesc(store.meals).filter((record) => record.date === selectedMealDate)
    : [];
  const selectedDateNutrition = selectedMealDate
    ? getMacroTotalsForDate(store.meals, selectedMealDate)
    : getMacroTotalsForMeals([]);
  const selectedDateMacroRings = useMemo(
    () => [
      {
        key: 'selected-carbs',
        label: '탄수화물',
        color: '#4A86FF',
        current: selectedDateNutrition.carbsG,
        target: nutritionTargets?.carbsG ?? 0,
        unit: 'g',
      },
      {
        key: 'selected-protein',
        label: '단백질',
        color: palette.mintDeep,
        current: selectedDateNutrition.proteinG,
        target: nutritionTargets?.proteinG ?? 0,
        unit: 'g',
      },
      {
        key: 'selected-fat',
        label: '지방',
        color: palette.coral,
        current: selectedDateNutrition.fatG,
        target: nutritionTargets?.fatG ?? 0,
        unit: 'g',
      },
    ],
    [nutritionTargets, selectedDateNutrition],
  );

  const mealCalendarSummary = useMemo(
    () =>
      mealCalendar.map((day) => {
        const totals = getMacroTotalsForMeals(day.records);
        const targetCalories = nutritionTargets?.calories ?? 0;
        const calorieRatio = targetCalories > 0 ? totals.calories / targetCalories : 0;
        const carbRatio = nutritionTargets?.carbsG ? totals.carbsG / nutritionTargets.carbsG : 0;
        const proteinRatio = nutritionTargets?.proteinG ? totals.proteinG / nutritionTargets.proteinG : 0;
        const fatRatio = nutritionTargets?.fatG ? totals.fatG / nutritionTargets.fatG : 0;
        const averageRatio =
          nutritionTargets
            ? (carbRatio + proteinRatio + fatRatio + calorieRatio) / 4
            : day.records.length > 0
              ? 1
              : 0;

        let mood = '🙂';
        let moodLabel = '기록 대기';
        let tone: 'good' | 'soft' | 'over' = 'soft';
        if (day.records.length === 0) {
          mood = '·';
          moodLabel = '기록 없음';
        } else if (averageRatio >= 0.85 && averageRatio <= 1.15) {
          mood = '😊';
          moodLabel = '잘 채움';
          tone = 'good';
        } else if (averageRatio > 1.15) {
          mood = '😤';
          moodLabel = '초과';
          tone = 'over';
        } else {
          mood = '🥺';
          moodLabel = '부족';
          tone = 'soft';
        }

        const percent = nutritionTargets ? Math.round(Math.min(199, averageRatio * 100)) : day.records.length * 100;

        return {
          ...day,
          totals,
          mood,
          moodLabel,
          tone,
          percent,
        };
      }),
    [mealCalendar, nutritionTargets],
  );

  async function openComposer(initialData?: any, forcedImage?: string) {
    const draftBase = createMealDraft();
    setAiSummary(null);
    setLastImageBase64s([]);
    setDraft({
      ...draftBase,
      ...(initialData ? getDraftFromRecord(initialData) : {}),
      imageUri: forcedImage || (initialData?.imageUri ?? draftBase.imageUri),
    });
    setComposerVisible(true);
  }

  function chooseDate() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: new Date(`${draft.date}T12:00:00`),
        mode: 'date',
        onChange: (_, selectedDate) => {
          if (!selectedDate) return;
          setDraft((current) => ({ ...current, date: selectedDate.toISOString().slice(0, 10) }));
        },
      });
    }
  }

  function chooseTime() {
    if (Platform.OS === 'android') {
      const [h, m] = (draft.time || '12:00').split(':');
      const now = new Date();
      now.setHours(parseInt(h || '12', 10));
      now.setMinutes(parseInt(m || '00', 10));

      DateTimePickerAndroid.open({
        value: now,
        mode: 'time',
        is24Hour: false,
        display: 'spinner',
        onChange: (_, selectedDate) => {
          if (!selectedDate) return;
          const hStr = selectedDate.getHours().toString().padStart(2, '0');
          const mStr = selectedDate.getMinutes().toString().padStart(2, '0');
          setDraft((current) => ({ ...current, time: `${hStr}:${mStr}` }));
        },
      });
    }
  }

  function applyNutritionEstimate(estimate: Awaited<ReturnType<typeof estimateMealNutrition>>) {
    const summarized = summarizeNutrition(estimate.nutrition);
    setAiSummary({
      modelLabel:
        estimate.providerLabel ||
        (estimate.source === 'ai'
          ? configuredModelLabel
          : estimate.source === 'search'
            ? '검색 우선 계산'
            : '로컬 추정'),
      source: estimate.source,
      title: estimate.title,
      notes: estimate.notes,
      nutrition: summarized,
      rationale: estimate.rationale,
      empty: !summarized,
    });
    setDraft((current) => ({
      ...current,
      title: estimate.title || current.title,
      calories: summarized?.calories ? String(summarized.calories) : current.calories,
      carbsG: summarized ? String(summarized.carbsG) : current.carbsG,
      proteinG: summarized ? String(summarized.proteinG) : current.proteinG,
      fatG: summarized ? String(summarized.fatG) : current.fatG,
      fiberG: summarized?.fiberG ? String(summarized.fiberG) : current.fiberG,
    }));
  }

  async function estimateCurrentMeal(saveAfter = false, imageBase64s = lastImageBase64s) {
    const analysisText = draft.aiPrompt.trim() || draft.title.trim();

    if (!analysisText && imageBase64s.length === 0) {
      Alert.alert('식단 정보가 부족해요', '식사 메뉴나 AI 분석용 설명, 또는 사진을 먼저 추가해 주세요.');
      return false;
    }

    try {
      setIsAnalyzing(true);
      const estimate = await estimateMealNutrition(
        store.aiSettings,
        draft.title,
        analysisText,
        imageBase64s,
      );
      applyNutritionEstimate(estimate);

      if (saveAfter) {
        const summarized = summarizeNutrition(estimate.nutrition);
        persistMeal(estimate.nutrition, {
          title: estimate.title || draft.title,
          calories: summarized?.calories ? String(summarized.calories) : draft.calories,
          carbsG: summarized ? String(summarized.carbsG) : draft.carbsG,
          proteinG: summarized ? String(summarized.proteinG) : draft.proteinG,
          fatG: summarized ? String(summarized.fatG) : draft.fatG,
          fiberG: summarized?.fiberG ? String(summarized.fiberG) : draft.fiberG,
        });
      }

      return true;
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : '영양 정보를 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      Alert.alert('영양 추정 실패', message);
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function attachFromCamera() {
    const result = await captureImageWithCamera();
    if (result && result.length > 0) {
      const persistedUri = await getPersistedImageUri(result[0]);
      const base64s = result.map((entry) => entry.base64).filter((value): value is string => Boolean(value));
      setLastImageBase64s(base64s);
      setDraft((current) => ({ ...current, imageUri: persistedUri }));
      if (base64s.length > 0) {
        await estimateCurrentMeal(false, base64s);
      }
    }
  }

  async function attachFromLibrary() {
    const result = await pickImageFromLibrary(false);
    if (result && result.length > 0) {
      const persistedUri = await getPersistedImageUri(result[0]);
      const base64s = result.map((entry) => entry.base64).filter((value): value is string => Boolean(value));
      setLastImageBase64s(base64s);
      setDraft((current) => ({ ...current, imageUri: persistedUri }));
      if (base64s.length > 0) {
        await estimateCurrentMeal(false, base64s);
      }
    }
  }

  function persistMeal(overrideNutrition?: NutritionInfo, overrideDraft?: Partial<MealDraft>) {
    const finalDraft = { ...draft, ...overrideDraft };

    if (!finalDraft.title.trim()) {
      Alert.alert('메뉴를 입력해 주세요', '식단 기록을 위해 어떤 음식을 드셨는지 간단히 적어주세요.');
      return;
    }

    const nutrition =
      summarizeNutrition(overrideNutrition) ||
      buildNutritionFromDraft(finalDraft, aiSummary ? aiSummary.source : 'manual');

    addMeal({
      id: finalDraft.id || makeId('meal'),
      date: finalDraft.date,
      time: finalDraft.time,
      title: finalDraft.title.trim(),
      notes: finalDraft.notes.trim(),
      imageUri: finalDraft.imageUri || undefined,
      nutrition,
    });
    setComposerVisible(false);
  }

  async function saveMeal() {
    if (!draft.title.trim() && !draft.aiPrompt.trim() && lastImageBase64s.length === 0) {
      Alert.alert('메뉴를 입력해 주세요', '식단 기록을 위해 어떤 음식을 드셨는지 간단히 적어주세요.');
      return;
    }

    if (!draft.title.trim() || !hasNutritionDraft(draft)) {
      await estimateCurrentMeal(true);
      return;
    }

    persistMeal();
  }

  function confirmDelete(id: string) {
    confirmAction('기록 삭제', '이 식단 기록을 정말 삭제할까요? 삭제 후에는 복구할 수 없습니다.', () => deleteMeal(id));
  }

  return (
    <>
      <ScreenFrame
        title="Meals"
        subtitle="텍스트와 사진만 남겨도 AI가 오늘 식단의 탄단지를 정리해 드립니다."
        accent={palette.mint}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="식단 검색..."
        actionLabel="식단 추가"
        onAction={openAddMenu}
      >
        <View style={styles.metricsRow}>
          <MetricPill label="이번 주 기록" value={`${mealsThisWeek}건`} tone="good" />
          <MetricPill label="사진 첨부율" value={`${getMealPhotoRate(store.meals)}%`} />
          <MetricPill label="현재 모드" value={phaseLabel} tone="warm" />
        </View>

        <SurfaceCard style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <View>
              <Text style={styles.goalTitle}>오늘의 탄단지 진행률</Text>
              <Text style={styles.goalCaption}>
                {nutritionTargets
                  ? `${phaseLabel} 기준 목표 대비 얼마나 채웠는지 보여드려요.`
                  : '설정과 체중 기록을 먼저 입력하면 맞춤 목표를 계산할 수 있어요.'}
              </Text>
              <View style={styles.calorieCoachRow}>
                <Feather name="fire" size={15} color="#F28D3A" />
                <Text style={styles.calorieCoachText}>
                  {burnEstimate
                    ? `오늘 섭취 ${Math.round(todayNutrition.calories)}kcal, 예상 소모 ${Math.round(burnEstimate)}kcal${Math.abs(calorieDelta) > 0 ? ` · ${calorieDelta > 0 ? `${Math.abs(calorieDelta)}kcal 더 먹음` : `${Math.abs(calorieDelta)}kcal 덜 먹음`}` : ''}`
                    : `오늘 섭취 ${Math.round(todayNutrition.calories)}kcal`}
                </Text>
              </View>
            </View>
            <View style={styles.calorieBadge}>
              <Text style={styles.calorieBadgeLabel}>칼로리</Text>
              <Text style={styles.calorieBadgeValue}>
                {nutritionTargets
                  ? `${Math.round(todayNutrition.calories)} / ${Math.round(nutritionTargets.calories)}`
                  : Math.round(todayNutrition.calories)}
              </Text>
            </View>
          </View>
          <View style={styles.ringsRow}>
            {macroRings.map((macro) => (
              <MacroRing
                key={macro.key}
                label={macro.label}
                color={macro.color}
                current={macro.current}
                target={macro.target}
                unit={macro.unit}
              />
            ))}
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <View>
              <Text style={styles.monthLabel}>{formatMonthYear(focusMonth)}</Text>
              <Text style={styles.monthCaption}>식단 목표 달성률을 표정으로 한눈에 확인해 보세요.</Text>
            </View>
            <View style={styles.monthActions}>
              <Pressable onPress={() => setFocusMonth((current) => subMonths(current, 1))} style={styles.monthButton}>
                <Feather name="chevron-left" size={18} color={palette.ink} />
              </Pressable>
              <Pressable onPress={() => setFocusMonth((current) => addMonths(current, 1))} style={styles.monthButton}>
                <Feather name="chevron-right" size={18} color={palette.ink} />
              </Pressable>
            </View>
          </View>

          <View style={styles.mealLegendRow}>
            <View style={styles.mealLegendItem}>
              <Text style={styles.mealLegendEmoji}>😊</Text>
              <Text style={styles.mealLegendText}>잘 채움</Text>
            </View>
            <View style={styles.mealLegendItem}>
              <Text style={styles.mealLegendEmoji}>🥺</Text>
              <Text style={styles.mealLegendText}>부족</Text>
            </View>
            <View style={styles.mealLegendItem}>
              <Text style={styles.mealLegendEmoji}>😤</Text>
              <Text style={styles.mealLegendText}>초과</Text>
            </View>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {mealCalendarSummary.map((day) => (
              <Pressable
                key={day.key}
                onPress={() => {
                  if (day.records.length) {
                    setSelectedMealDate(day.key);
                  }
                }}
                style={[
                  styles.mealDayCell,
                  !day.inMonth && styles.dayCellMuted,
                  day.tone === 'good' && styles.mealDayCellGood,
                  day.tone === 'soft' && day.records.length > 0 && styles.mealDayCellSoft,
                  day.tone === 'over' && styles.mealDayCellOver,
                ]}
                >
                  <Text style={[styles.dayNumber, !day.inMonth && styles.dayNumberMuted]}>{day.dayOfMonth}</Text>
                  <View
                    style={[
                      styles.mealDayIndicator,
                      day.tone === 'good' && styles.mealDayIndicatorGood,
                      day.tone === 'soft' && day.records.length > 0 && styles.mealDayIndicatorSoft,
                      day.tone === 'over' && styles.mealDayIndicatorOver,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
        </SurfaceCard>

        <EmptyState
          title={meals.length ? '달력에서 날짜를 눌러 식단 보기' : '식단 기록이 아직 없습니다'}
          body={meals.length ? '기록 목록은 달력 날짜를 눌렀을 때만 열리도록 정리했어요.' : '식단을 추가하면 날짜별로 달력에서 바로 확인할 수 있어요.'}
          actionLabel="추가하기"
          onAction={openAddMenu}
        />
      </ScreenFrame>

      <ModalSheet
        visible={Boolean(selectedMealDate)}
        title={selectedMealDate ? `${formatLongDate(selectedMealDate)} 식단` : '식단 기록'}
        subtitle="해당 날짜에 먹은 음식만 모아서 볼 수 있어요."
        onClose={() => setSelectedMealDate(null)}
      >
        <SurfaceCard style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <View>
              <Text style={styles.goalTitle}>그날의 탄단지 진행률</Text>
              <Text style={styles.goalCaption}>
                {nutritionTargets
                  ? `${selectedMealDate ? formatLongDate(selectedMealDate) : '선택한 날짜'} 기준 목표 대비 얼마나 채웠는지 보여드려요. 100%를 넘기면 초과로 표시합니다.`
                  : '설정과 체중 기록을 먼저 입력하면 맞춤 목표를 계산할 수 있어요.'}
              </Text>
            </View>
            <View style={styles.calorieBadge}>
              <Text style={styles.calorieBadgeLabel}>칼로리</Text>
              <Text style={styles.calorieBadgeValue}>
                {nutritionTargets
                  ? `${Math.round(selectedDateNutrition.calories)} / ${Math.round(nutritionTargets.calories)}`
                  : Math.round(selectedDateNutrition.calories)}
              </Text>
            </View>
          </View>
          <View style={styles.ringsRow}>
            {selectedDateMacroRings.map((macro) => (
              <MacroRing
                key={macro.key}
                label={macro.label}
                color={macro.color}
                current={macro.current}
                target={macro.target}
                unit={macro.unit}
              />
            ))}
          </View>
        </SurfaceCard>
        {selectedDateMeals.length ? selectedDateMeals.map((record) => (
          <SurfaceCard key={record.id} style={styles.recordCard}>
            {record.imageUri ? (
              <Image source={{ uri: record.imageUri }} style={styles.recordImage} contentFit="cover" />
            ) : (
              <View style={[styles.recordImage, styles.placeholderImage]}>
                <Feather name="camera" size={20} color={palette.mintDeep} />
                <Text style={styles.placeholderLabel}>사진 없음</Text>
              </View>
            )}
            <View style={styles.recordBody}>
              <View style={styles.recordHeader}>
                <View style={styles.recordDateRow}>
                  <Text style={styles.recordDate}>{formatLongDate(record.date)}</Text>
                  {record.time && <Text style={styles.recordTime}>{formatTime(record.time)}</Text>}
                </View>
                <View style={styles.iconRow}>
                  <Pressable
                    onPress={() => {
                      setAiSummary(null);
                      setLastImageBase64s([]);
                      setDraft(getDraftFromRecord(record));
                      setComposerVisible(true);
                    }}
                    hitSlop={12}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Feather name="edit-2" size={18} color={palette.muted} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(record.id)}
                    hitSlop={12}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                  >
                    <Feather name="trash-2" size={18} color={palette.coral} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.recordTitle}>{record.title}</Text>
              <Text style={styles.recordNotes}>{record.notes || '추가 메모가 없습니다.'}</Text>
              {record.nutrition ? (
                <View style={styles.nutritionPills}>
                  <MiniMacroPill label="탄" value={formatMacroValue(record.nutrition.carbsG, 'g')} tone="blue" />
                  <MiniMacroPill label="단" value={formatMacroValue(record.nutrition.proteinG, 'g')} tone="green" />
                  <MiniMacroPill label="지" value={formatMacroValue(record.nutrition.fatG, 'g')} tone="coral" />
                  <MiniMacroPill label="kcal" value={formatMacroValue(record.nutrition.calories, '')} tone="neutral" />
                </View>
              ) : null}
            </View>
          </SurfaceCard>
        )) : (
          <EmptyState title="기록 없음" body="이 날짜에는 식단 기록이 없어요." />
        )}
      </ModalSheet>

      <ModalSheet
        visible={composerVisible}
        title="식단 추가하기"
        subtitle={
          isAnalyzing
            ? 'AI가 음식 이름과 영양 성분을 계산 중입니다...'
            : '메뉴명만 적어도 되고, 제품 사진이나 영양표를 올리면 더 정확해집니다.'
        }
        onClose={() => setComposerVisible(false)}
        onSave={saveMeal}
        saveLabel={isAnalyzing ? '분석 중...' : '저장'}
        saveDisabled={isAnalyzing}
      >
        {isAnalyzing ? (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={palette.paper} />
            <View>
              <Text style={styles.analyzingText}>AI가 식단을 해석하고 있어요</Text>
              <Text style={styles.analyzingSubtext}>메뉴명, 제품 정보, 수량을 바탕으로 탄단지를 계산 중입니다.</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.dateTimeRow}>
          <Pressable onPress={chooseDate} style={[styles.dateButton, { flex: 2 }]}>
            <View>
              <Text style={styles.dateButtonLabel}>날짜 {Platform.OS !== 'android' ? '(YYYY-MM-DD)' : ''}</Text>
              {Platform.OS === 'android' ? (
                <Text style={styles.dateButtonValue}>{formatLongDate(draft.date)}</Text>
              ) : (
                <TextInput
                  style={[styles.dateButtonValue, { padding: 0 }]}
                  value={draft.date}
                  onChangeText={(value) => setDraft((current) => ({ ...current, date: value }))}
                />
              )}
            </View>
            <Feather name="calendar" size={18} color={palette.ink} />
          </Pressable>
          <Pressable onPress={chooseTime} style={[styles.dateButton, { flex: 1 }]}>
            <View>
              <Text style={styles.dateButtonLabel}>시간 {Platform.OS !== 'android' ? '(HH:mm)' : ''}</Text>
              {Platform.OS === 'android' ? (
                <Text style={styles.dateButtonValue}>{formatTime(draft.time)}</Text>
              ) : (
                <TextInput
                  style={[styles.dateButtonValue, { padding: 0 }]}
                  value={draft.time}
                  onChangeText={(value) => setDraft((current) => ({ ...current, time: value }))}
                />
              )}
            </View>
            <Feather name="clock" size={18} color={palette.ink} />
          </Pressable>
        </View>

        <FieldInput
          label="식사 메뉴"
          placeholder="제육덮밥, 닭가슴살, 단백질 쉐이크처럼 간단히"
          value={draft.title}
          onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
        />
        <FieldInput
          label="메모"
          placeholder="식사 장소, 기분, 누구와 먹었는지 같은 메모를 남겨보세요."
          multiline
          value={draft.notes}
          onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
        />
        <FieldInput
          label="AI 분석용 설명"
          placeholder="예: 오리고기 반마리 크기에서 떡 6~7개, 당면 8~9젓가락, 밥 한 공기 추가해서 먹음"
          multiline
          value={draft.aiPrompt}
          onChangeText={(aiPrompt) => setDraft((current) => ({ ...current, aiPrompt }))}
        />

        <SurfaceCard style={styles.attachmentCard}>
          <View style={styles.attachmentHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attachmentTitle}>사진 첨부 + AI 영양 추정</Text>
              <Text style={styles.attachmentCaption}>
                제품명은 검색 우선으로 계산하고, 사진과 AI 분석용 설명은 양 추정을 더 정확하게 보정해 줍니다.
              </Text>
            </View>
            {draft.imageUri ? (
              <Pressable
                onPress={() => {
                  setDraft((current) => ({ ...current, imageUri: '' }));
                  setLastImageBase64s([]);
                }}
                style={styles.clearPhotoButton}
              >
                <Feather name="trash-2" size={16} color={palette.coral} />
              </Pressable>
            ) : null}
          </View>

          {draft.imageUri ? (
            <Image source={{ uri: draft.imageUri }} style={styles.previewImage} contentFit="cover" />
          ) : null}

          {aiSummary ? (
            <View style={styles.aiSummaryBox}>
              <Text style={styles.aiSummaryTitle}>AI 분석 결과</Text>
              <Text style={styles.aiSummaryProvider}>분석 엔진: {aiSummary.modelLabel}</Text>
              {aiSummary.nutrition ? (
                <View style={styles.aiMacroRow}>
                  <MiniMacroPill label="탄" value={`${Math.round(aiSummary.nutrition.carbsG)}g`} tone="blue" />
                  <MiniMacroPill label="단" value={`${Math.round(aiSummary.nutrition.proteinG)}g`} tone="green" />
                  <MiniMacroPill label="지" value={`${Math.round(aiSummary.nutrition.fatG)}g`} tone="coral" />
                  <MiniMacroPill label="kcal" value={`${Math.round(aiSummary.nutrition.calories || 0)}`} tone="neutral" />
                </View>
              ) : null}
              {aiSummary.rationale ? <Text style={styles.aiSummaryBody}>{aiSummary.rationale}</Text> : null}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <PrimaryButton label="앨범에서 선택" onPress={attachFromLibrary} icon="image" variant="outline" disabled={isAnalyzing} />
            <PrimaryButton label="카메라 촬영" onPress={attachFromCamera} icon="camera" variant="ghost" disabled={isAnalyzing} />
          </View>
          <PrimaryButton
            label="AI 영양 추정"
            onPress={() => {
              estimateCurrentMeal(false);
            }}
            icon="cpu"
            disabled={isAnalyzing}
          />
        </SurfaceCard>

        <SurfaceCard style={styles.nutritionEditorCard}>
          <View style={styles.nutritionEditorHeader}>
            <View>
              <Text style={styles.nutritionEditorTitle}>영양 정보</Text>
              <Text style={styles.nutritionEditorCaption}>AI 추정 후 필요하면 숫자를 직접 수정해 주세요.</Text>
            </View>
            <View style={styles.phaseBadge}>
              <Text style={styles.phaseBadgeText}>{phaseLabel}</Text>
            </View>
          </View>
          <View style={styles.nutritionGrid}>
            <FieldInput
              label="칼로리"
              placeholder="650"
              keyboardType="decimal-pad"
              value={draft.calories}
              onChangeText={(calories) => setDraft((current) => ({ ...current, calories }))}
              style={{ flex: 1 }}
            />
            <FieldInput
              label="탄수화물 (g)"
              placeholder="80"
              keyboardType="decimal-pad"
              value={draft.carbsG}
              onChangeText={(carbsG) => setDraft((current) => ({ ...current, carbsG }))}
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.nutritionGrid}>
            <FieldInput
              label="단백질 (g)"
              placeholder="35"
              keyboardType="decimal-pad"
              value={draft.proteinG}
              onChangeText={(proteinG) => setDraft((current) => ({ ...current, proteinG }))}
              style={{ flex: 1 }}
            />
            <FieldInput
              label="지방 (g)"
              placeholder="18"
              keyboardType="decimal-pad"
              value={draft.fatG}
              onChangeText={(fatG) => setDraft((current) => ({ ...current, fatG }))}
              style={{ flex: 1 }}
            />
          </View>
          <FieldInput
            label="식이섬유 (g, 선택)"
            placeholder="5"
            keyboardType="decimal-pad"
            value={draft.fiberG}
            onChangeText={(fiberG) => setDraft((current) => ({ ...current, fiberG }))}
          />
        </SurfaceCard>
      </ModalSheet>
    </>
  );
}

function MacroRing({
  label,
  color,
  current,
  target,
  unit,
}: {
  label: string;
  color: string;
  current: number;
  target: number;
  unit: string;
}) {
  const ratio = target ? Math.min(1.5, current / target) : 0;
  const rawPercent = target ? Math.round((current / target) * 100) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <View style={styles.ringWrap}>
      <View style={[styles.ringOuter, { borderColor: color, backgroundColor: `${color}12` }]}>
        <View style={styles.ringInner}>
          <Text style={styles.ringPercent}>{target ? `${rawPercent}%` : '--'}</Text>
          {target && rawPercent > 100 ? <Text style={styles.ringOverLabel}>초과</Text> : null}
          <Text style={styles.ringCurrent}>{Math.round(current)}{unit}</Text>
        </View>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
      <Text style={styles.ringTarget}>{target ? `목표 ${Math.round(target)}${unit}` : '목표 계산 필요'}</Text>
    </View>
  );
}

function MiniMacroPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'coral' | 'neutral';
}) {
  return (
    <View
      style={[
        styles.miniPill,
        tone === 'blue' && styles.miniPillBlue,
        tone === 'green' && styles.miniPillGreen,
        tone === 'coral' && styles.miniPillCoral,
      ]}
    >
      <Text style={styles.miniPillLabel}>{label}</Text>
      <Text style={styles.miniPillValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  goalCard: {
    gap: 18,
    backgroundColor: '#F7FBFF',
    borderColor: '#D9E4F3',
  },
  calendarCard: {
    gap: 14,
    backgroundColor: '#FFFDF7',
    borderColor: '#F1E2C8',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  monthLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: palette.ink,
  },
  monthCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: palette.muted,
  },
  monthActions: {
    flexDirection: 'row',
    gap: 8,
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: '#ECDDBD',
  },
  mealLegendRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  mealLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.paper,
  },
  mealLegendEmoji: {
    fontSize: 14,
  },
  mealLegendText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  mealDayCell: {
    width: '13.3%',
    minWidth: 0,
    aspectRatio: 0.76,
    borderRadius: 15,
    paddingVertical: 6,
    paddingHorizontal: 3,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: '#F1E6CF',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealDayCellGood: {
    backgroundColor: '#E8F7EE',
    borderColor: '#BEE7CC',
  },
  mealDayCellSoft: {
    backgroundColor: '#FFF4D9',
    borderColor: '#F2D38E',
  },
  mealDayCellOver: {
    backgroundColor: '#FFE8E1',
    borderColor: '#F3B5A5',
  },
  dayCellMuted: {
    opacity: 0.45,
  },
  dayNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: palette.ink,
  },
  dayNumberMuted: {
    color: palette.muted,
  },
  mealDayIndicator: {
    width: 18,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E5EBE6',
  },
  mealDayIndicatorGood: {
    backgroundColor: palette.mintDeep,
  },
  mealDayIndicatorSoft: {
    backgroundColor: palette.amber,
  },
  mealDayIndicatorOver: {
    backgroundColor: palette.coral,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  goalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: palette.ink,
  },
  goalCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
    maxWidth: '88%',
  },
  calorieCoachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  calorieCoachText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 18,
    color: '#A45E1B',
  },
  calorieBadge: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#EAF4FF',
    minWidth: 88,
  },
  calorieBadgeLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.muted,
    textTransform: 'uppercase',
  },
  calorieBadgeValue: {
    marginTop: 4,
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: palette.ink,
  },
  ringsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ringWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  ringOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: palette.ink,
  },
  ringOverLabel: {
    marginTop: 1,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: palette.coral,
  },
  ringCurrent: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.muted,
    marginTop: 2,
  },
  ringLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.ink,
  },
  ringTarget: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: palette.muted,
    textAlign: 'center',
  },
  recordCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  recordImage: {
    width: 92,
    height: 92,
    borderRadius: 22,
    backgroundColor: '#DDEEE2',
  },
  placeholderImage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.mintDeep,
  },
  recordBody: {
    flex: 1,
    gap: 6,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 16,
  },
  recordDate: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.mintDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  recordTime: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.mintDeep,
    opacity: 0.8,
  },
  recordTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: palette.ink,
  },
  recordNotes: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  nutritionPills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  miniPill: {
    flexDirection: 'row',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EFF2F1',
  },
  miniPillBlue: {
    backgroundColor: '#EAF2FF',
  },
  miniPillGreen: {
    backgroundColor: '#E8F7EE',
  },
  miniPillCoral: {
    backgroundColor: '#FFF0EA',
  },
  miniPillLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: palette.muted,
  },
  miniPillValue: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: palette.ink,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  dateButton: {
    borderRadius: 22,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.stroke,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  dateButtonValue: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: palette.ink,
    marginTop: 4,
  },
  attachmentCard: {
    gap: 14,
  },
  attachmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  attachmentTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: palette.ink,
  },
  attachmentCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  clearPhotoButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 22,
  },
  aiSummaryBox: {
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#F7F8F6',
    borderWidth: 1,
    borderColor: palette.stroke,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  aiSummaryTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: palette.ink,
  },
  aiSummaryProvider: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.mintDeep,
  },
  aiSummaryBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: palette.muted,
  },
  aiMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nutritionEditorCard: {
    gap: 14,
    backgroundColor: '#FFFCF6',
    borderColor: '#F4E3BC',
  },
  nutritionEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  nutritionEditorTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: palette.ink,
  },
  nutritionEditorCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: palette.muted,
    lineHeight: 19,
  },
  phaseBadge: {
    backgroundColor: '#FFF1DA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  phaseBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: '#9C6422',
  },
  nutritionGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  analyzingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: palette.ink,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderRadius: 24,
    marginBottom: 16,
  },
  analyzingText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: palette.paper,
  },
  analyzingSubtext: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: palette.mist,
    marginTop: 4,
  },
});
