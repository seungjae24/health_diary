import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, TextInput, useWindowDimensions } from 'react-native';

import { ScreenFrame } from '../components/screen-frame';
import {
  ChoiceChip,
  EmptyState,
  FieldInput,
  MetricPill,
  ModalSheet,
  PrimaryButton,
  SurfaceCard,
} from '../components/ui';
import { useHealthData } from '../context/health-data-context';
import { useGlobalUi } from '../context/global-ui-context';
import { generateAiResponse } from '../services/ai';
import { fontFamily, palette } from '../theme';
import { WeightRecord } from '../types';
import { getLatestWeight, getWeightChange } from '../utils/analytics';
import { formatLongDate, formatShortDate, formatTime, formatWeight, makeId, sortByDateDesc, todayDateKey, currentTimeKey } from '../utils/format';
import { captureImageWithCamera, getPersistedImageUri, pickImageFromLibrary } from '../utils/media';
import { analyzeImage } from '../services/ai';
import { ActivityIndicator } from 'react-native';


function createWeightDraft() {
  return {
    date: todayDateKey(),
    time: currentTimeKey(),
    valueKg: '',
    note: '',
    bmi: '',
    bodyFatPercentage: '',
    skeletalMuscleMassKg: '',
    bodyWaterKg: '',
    bodyFatMassKg: '',
    imageUri: '',
  };
}

const chartHeight = 280;
const chartTopPadding = 58;
const chartBottomPadding = 54;
const chartLeftPadding = 26;
const chartRightPadding = 76;
const chartTooltipWidth = 190;
const chartVisibleSlots = 10;

function getRecordTimestamp(record: WeightRecord) {
  return `${record.date}T${record.time || '00:00'}`;
}

function formatChartDate(record: WeightRecord) {
  return `${record.date.slice(2).replace(/-/g, '.')} ${record.time || ''}`.trim();
}

type MetricStatus = 'low' | 'standard' | 'high';
type MetricKind = 'weight' | 'muscle' | 'bodyFat';

function getMetricStatusLabel(status: MetricStatus) {
  if (status === 'low') return '표준이하';
  if (status === 'high') return '표준이상';
  return '표준';
}

function getWeightStatus(weightKg?: number, heightCm?: string) {
  const heightM = Number(heightCm) / 100;
  if (!weightKg || !heightM) return 'standard' as MetricStatus;

  const bmi = weightKg / (heightM * heightM);
  if (bmi < 18.5) return 'low' as MetricStatus;
  if (bmi > 22.9) return 'high' as MetricStatus;
  return 'standard' as MetricStatus;
}

function getMuscleStatus(muscleKg?: number, heightCm?: string, sex?: string) {
  const heightM = Number(heightCm) / 100;
  if (!muscleKg || !heightM) return 'standard' as MetricStatus;

  const standardWeight = 22 * heightM * heightM;
  const muscleRatio = sex === 'female' ? 0.36 : sex === 'male' ? 0.45 : 0.405;
  const standardMuscleKg = standardWeight * muscleRatio;
  const ratio = (muscleKg / standardMuscleKg) * 100;
  if (ratio < 90) return 'low' as MetricStatus;
  if (ratio > 110) return 'high' as MetricStatus;
  return 'standard' as MetricStatus;
}

function getBodyFatStatus(bodyFatPercentage?: number, sex?: string) {
  if (typeof bodyFatPercentage !== 'number') return 'standard' as MetricStatus;

  const lowCutoff = sex === 'female' ? 18 : sex === 'male' ? 10 : 14;
  const highCutoff = sex === 'female' ? 28 : sex === 'male' ? 20 : 24;
  if (bodyFatPercentage < lowCutoff) return 'low' as MetricStatus;
  if (bodyFatPercentage > highCutoff) return 'high' as MetricStatus;
  return 'standard' as MetricStatus;
}

function getMetricTone(kind: MetricKind, status: MetricStatus) {
  if (status === 'standard') return 'standard';
  if (kind === 'bodyFat') return status === 'low' ? 'blue' : 'red';
  if (kind === 'muscle') return status === 'low' ? 'red' : 'blue';
  return 'red';
}

function WeightTrendChart({
  records,
  selectedId,
  onSelect,
}: {
  records: WeightRecord[];
  selectedId?: string | null;
  onSelect: (record: WeightRecord) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const chronological = React.useMemo(
    () => [...records].sort((left, right) => getRecordTimestamp(left).localeCompare(getRecordTimestamp(right))),
    [records],
  );

  if (!chronological.length) {
    return (
      <SurfaceCard style={styles.chartCard}>
        <EmptyState title="그래프에 표시할 기록이 없습니다" body="체중을 추가하면 시간순 그래프로 변화가 표시됩니다." />
      </SurfaceCard>
    );
  }

  const selectedRecord = chronological.find((record) => record.id === selectedId) ?? chronological[chronological.length - 1];
  const values = chronological.map((record) => record.valueKg);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, 1);
  const minValue = Math.floor((rawMin - spread * 0.2) * 2) / 2;
  const maxValue = Math.ceil((rawMax + spread * 0.2) * 2) / 2;
  const valueRange = Math.max(maxValue - minValue, 1);
  const plotHeight = chartHeight - chartTopPadding - chartBottomPadding;
  const chartOuterPadding = 36;
  const screenHorizontalPadding = 40;
  const viewportWidth = Math.max(300, windowWidth - screenHorizontalPadding - chartOuterPadding);
  const pointGap = (viewportWidth - chartLeftPadding - chartRightPadding) / (chartVisibleSlots - 1);
  const isScrollable = chronological.length > chartVisibleSlots;
  const plotWidth = isScrollable
    ? chartLeftPadding + chartRightPadding + Math.max(chronological.length - 1, 1) * pointGap
    : viewportWidth;
  const selectedIndex = chronological.findIndex((record) => record.id === selectedRecord.id);
  const selectedX = chartLeftPadding + Math.max(selectedIndex, 0) * pointGap;

  const points = chronological.map((record, index) => {
    const x = chartLeftPadding + index * pointGap;
    const y = chartTopPadding + (1 - (record.valueKg - minValue) / valueRange) * plotHeight;
    return { record, x, y };
  });
  const lineSegments = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    return {
      key: `${point.x}-${point.y}-${index}`,
      left: (point.x + next.x) / 2 - length / 2,
      top: (point.y + next.y) / 2 - 1,
      width: length,
      rotate: `${Math.atan2(dy, dx)}rad`,
    };
  });
  const ticks = [maxValue, minValue + valueRange * 0.66, minValue + valueRange * 0.33, minValue];
  const chartBody = (
    <View style={[styles.chartCanvas, { width: plotWidth }]}>
      <View
        style={[
          styles.selectedTooltip,
          {
            left: Math.min(
              Math.max(selectedX - chartTooltipWidth / 2, 6),
              plotWidth - chartRightPadding - chartTooltipWidth,
            ),
          },
        ]}
      >
        <Text style={styles.selectedTooltipDate}>{formatChartDate(selectedRecord)}</Text>
        <Text style={styles.selectedTooltipValue}>{formatWeight(selectedRecord.valueKg)}</Text>
      </View>

      {ticks.map((tick) => {
        const y = chartTopPadding + (1 - (tick - minValue) / valueRange) * plotHeight;
        return (
          <React.Fragment key={tick.toFixed(2)}>
            <View style={[styles.chartGridLine, { top: y }]} />
            <Text style={[styles.chartYAxisLabel, { top: y - 9 }]}>{tick.toFixed(1)}</Text>
          </React.Fragment>
        );
      })}

      {selectedRecord ? (
        <View
          pointerEvents="none"
          style={[
            styles.selectedGuide,
            {
              left: selectedX,
              top: chartTopPadding,
              height: plotHeight,
            },
          ]}
        />
      ) : null}

      {lineSegments.map((segment) => (
        <View
          key={segment.key}
          style={[
            styles.chartLineSegment,
            {
              left: segment.left,
              top: segment.top,
              width: segment.width,
              transform: [{ rotate: segment.rotate }],
            },
          ]}
        />
      ))}

      {points.map((point, index) => {
        const isSelected = point.record.id === selectedRecord.id;
        const shouldLabel = chronological.length <= 6 || index === 0 || index === chronological.length - 1 || isSelected || index % 2 === 0;
        return (
          <React.Fragment key={point.record.id}>
            <Pressable
              onPress={() => onSelect(point.record)}
              style={[
                styles.chartDotButton,
                {
                  left: point.x - 18,
                  top: point.y - 18,
                },
              ]}
              hitSlop={8}
            >
              <View style={[styles.chartDot, isSelected && styles.chartDotSelected]} />
            </Pressable>
            {shouldLabel ? (
              <Text
                style={[
                  styles.chartXLabel,
                  isSelected && styles.chartXLabelSelected,
                  {
                    left: point.x - 38,
                    top: point.y + 26,
                  },
                ]}
              >
                {formatShortDate(point.record.date)}
              </Text>
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );

  return (
    <SurfaceCard style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartTitle}>체중 변화</Text>
          <Text style={styles.chartCaption}>좌우로 밀어서 시간순 기록을 보고 점을 누르면 위 요약이 바뀝니다.</Text>
        </View>
        <View style={styles.chartCountBadge}>
          <Text style={styles.chartCountText}>{chronological.length}건</Text>
        </View>
      </View>

      <View style={styles.chartViewport}>
        {isScrollable ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentOffset={{ x: Math.max(plotWidth - viewportWidth, 0), y: 0 }}
          >
            {chartBody}
          </ScrollView>
        ) : chartBody}
      </View>
    </SurfaceCard>
  );
}

export function WeightsScreen({ route, navigation }: any) {
  const { store, addWeight } = useHealthData();
  const { openAddMenu } = useGlobalUi();
  const [query, setQuery] = useState('');
  const [composerVisible, setComposerVisible] = useState(false);
  const [selectedWeightId, setSelectedWeightId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draft, setDraft] = useState(createWeightDraft());
  const [summaryPeriod, setSummaryPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachText, setCoachText] = useState('');

  const shouldOpen = route?.params?.openComposer;
  const prefilledData = route?.params?.prefilledData;
  const initialImage = route?.params?.initialImage;

  React.useEffect(() => {
    if (shouldOpen) {
      openComposer(prefilledData, initialImage);
      navigation.setParams({
        openComposer: undefined,
        prefilledData: undefined,
        initialImage: undefined
      });
    }
  }, [shouldOpen, prefilledData, initialImage]);

  const latestWeight = getLatestWeight(store.weights);
  const weightChange = getWeightChange(store.weights, 14);
  const recentWeights = sortByDateDesc(store.weights).slice(0, 3);
  const summaryWeights = React.useMemo(() => {
    const today = todayDateKey();
    if (summaryPeriod === 'today') {
      return sortByDateDesc(store.weights).filter((record) => record.date === today);
    }
    const floorDate = new Date();
    floorDate.setDate(floorDate.getDate() - (summaryPeriod === 'week' ? 6 : 29));
    const floor = floorDate.toISOString().slice(0, 10);
    return sortByDateDesc(store.weights).filter((record) => record.date >= floor);
  }, [store.weights, summaryPeriod]);
  const periodLatest = summaryWeights[0];
  const periodOldest = summaryWeights[summaryWeights.length - 1];
  const periodWeightDelta = periodLatest && periodOldest ? periodLatest.valueKg - periodOldest.valueKg : null;
  const periodBodyFatDelta =
    periodLatest && periodOldest && typeof periodLatest.bodyFatPercentage === 'number' && typeof periodOldest.bodyFatPercentage === 'number'
      ? periodLatest.bodyFatPercentage - periodOldest.bodyFatPercentage
      : null;
  const periodMuscleDelta =
    periodLatest && periodOldest && typeof periodLatest.skeletalMuscleMassKg === 'number' && typeof periodOldest.skeletalMuscleMassKg === 'number'
      ? periodLatest.skeletalMuscleMassKg - periodOldest.skeletalMuscleMassKg
      : null;
  const filteredWeights = sortByDateDesc(store.weights).filter((record) => {
    const haystack = `${record.date} ${record.valueKg} ${record.note ?? ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const selectedWeight = selectedWeightId
    ? store.weights.find((record) => record.id === selectedWeightId) ?? null
    : null;
  const displayWeight = selectedWeight ?? latestWeight;
  const weightStatus = getWeightStatus(displayWeight?.valueKg, store.profile.heightCm);
  const muscleStatus = getMuscleStatus(displayWeight?.skeletalMuscleMassKg, store.profile.heightCm, store.profile.sex);
  const bodyFatStatus = getBodyFatStatus(displayWeight?.bodyFatPercentage, store.profile.sex);
  const weightTone = getMetricTone('weight', weightStatus);
  const muscleTone = getMetricTone('muscle', muscleStatus);
  const bodyFatTone = getMetricTone('bodyFat', bodyFatStatus);

  async function openComposer(initialData?: any, forcedImage?: string) {
    const draftBase = createWeightDraft();
    setDraft({
      ...draftBase,
      ...(initialData || {}),
      valueKg: initialData?.valueKg ? String(initialData.valueKg) : draftBase.valueKg,
      bmi: initialData?.bmi ? String(initialData.bmi) : draftBase.bmi,
      bodyFatPercentage: initialData?.bodyFatPercentage ? String(initialData.bodyFatPercentage) : draftBase.bodyFatPercentage,
      skeletalMuscleMassKg: initialData?.skeletalMuscleMassKg ? String(initialData.skeletalMuscleMassKg) : draftBase.skeletalMuscleMassKg,
      bodyWaterKg: initialData?.bodyWaterKg ? String(initialData.bodyWaterKg) : draftBase.bodyWaterKg,
      bodyFatMassKg: initialData?.bodyFatMassKg ? String(initialData.bodyFatMassKg) : draftBase.bodyFatMassKg,
      imageUri: forcedImage || draftBase.imageUri
    });
    setComposerVisible(true);
  }

  async function handleAiAnalysis(base64s: string[]) {
    try {
      setIsAnalyzing(true);
      const analysis = await analyzeImage(store.aiSettings, base64s, 'weight');
      if (analysis && analysis.data) {
        setDraft(current => ({
          ...current,
          valueKg: analysis.data.valueKg ? String(analysis.data.valueKg) : current.valueKg,
          bmi: analysis.data.bmi ? String(analysis.data.bmi) : current.bmi,
          bodyFatPercentage: analysis.data.bodyFatPercentage ? String(analysis.data.bodyFatPercentage) : current.bodyFatPercentage,
          skeletalMuscleMassKg: analysis.data.skeletalMuscleMassKg ? String(analysis.data.skeletalMuscleMassKg) : current.skeletalMuscleMassKg,
          bodyWaterKg: analysis.data.bodyWaterKg ? String(analysis.data.bodyWaterKg) : current.bodyWaterKg,
          bodyFatMassKg: analysis.data.bodyFatMassKg ? String(analysis.data.bodyFatMassKg) : current.bodyFatMassKg,
          note: analysis.data.note || current.note,
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function addLibraryImage() {
    const result = await pickImageFromLibrary(true);
    if (result && result.length > 0) {
      const persistedUri = await getPersistedImageUri(result[0]);
      setDraft((current) => ({ ...current, imageUri: persistedUri }));
      const base64s = result.map(r => r.base64).filter((b): b is string => !!b);
      if (base64s.length > 0 && store.aiSettings.geminiKey) {
        handleAiAnalysis(base64s);
      }
    }
  }

  async function addCameraImage() {
    const result = await captureImageWithCamera();
    if (result && result.length > 0) {
      const persistedUri = await getPersistedImageUri(result[0]);
      setDraft((current) => ({ ...current, imageUri: persistedUri }));
      const base64s = result.map(r => r.base64).filter((b): b is string => !!b);
      if (base64s.length > 0 && store.aiSettings.geminiKey) {
        handleAiAnalysis(base64s);
      }
    }
  }

  function chooseDate() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: new Date(`${draft.date}T12:00:00`),
        mode: 'date',
        onChange: (_, selectedDate) => {
          if (!selectedDate) {
            return;
          }

          setDraft((current) => ({
            ...current,
            date: selectedDate.toISOString().slice(0, 10),
          }));
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

  function saveWeight() {
    const value = Number(draft.valueKg);

    if (!value) {
      Alert.alert('체중을 입력해 주세요', '기록할 체중 수치(kg)를 입력해 주세요.');
      return;
    }

    addWeight({
      id: (draft as any).id || makeId('weight'),
      date: draft.date,
      time: draft.time,
      valueKg: value,
      imageUri: draft.imageUri || undefined,
      bmi: draft.bmi ? Number(draft.bmi) : undefined,
      bodyFatPercentage: draft.bodyFatPercentage ? Number(draft.bodyFatPercentage) : undefined,
      skeletalMuscleMassKg: draft.skeletalMuscleMassKg ? Number(draft.skeletalMuscleMassKg) : undefined,
      bodyWaterKg: draft.bodyWaterKg ? Number(draft.bodyWaterKg) : undefined,
      bodyFatMassKg: draft.bodyFatMassKg ? Number(draft.bodyFatMassKg) : undefined,
      note: draft.note.trim() || undefined,
    });
    setComposerVisible(false);
  }

  const latest = recentWeights[0];
  const previous = recentWeights[1];
  const older = recentWeights[2];
  const bodyComment = (() => {
    if (!latest || !previous) {
      return null;
    }

    const weightDelta = latest.valueKg - previous.valueKg;
    const bodyFatDelta =
      typeof latest.bodyFatPercentage === 'number' && typeof previous.bodyFatPercentage === 'number'
        ? latest.bodyFatPercentage - previous.bodyFatPercentage
        : null;
    const muscleDelta =
      typeof latest.skeletalMuscleMassKg === 'number' && typeof previous.skeletalMuscleMassKg === 'number'
        ? latest.skeletalMuscleMassKg - previous.skeletalMuscleMassKg
        : null;

    let tone = '차분';
    let headline = '최근 변화가 기록되고 있어요.';

    if (muscleDelta !== null && muscleDelta > 0.2) {
      tone = '칭찬';
      headline = '골격근량이 올라가고 있어요. 아주 좋습니다.';
    } else if (bodyFatDelta !== null && bodyFatDelta < -0.3) {
      tone = '칭찬';
      headline = '체지방률이 내려가고 있어요. 방향이 좋아요.';
    } else if (weightDelta > 1.2 && bodyFatDelta !== null && bodyFatDelta > 0.5) {
      tone = '혼냄';
      headline = '최근 증량 속도가 조금 빠릅니다. 먹는 양을 다시 점검해 보세요.';
    }

    const longLine =
      older
        ? `과거 기록과 비교하면 ${older.valueKg.toFixed(1)}kg에서 ${latest.valueKg.toFixed(1)}kg로 변했어요.`
        : '이전 기록과 비교 기준이 생기기 시작했습니다.';

    const plan = muscleDelta !== null && muscleDelta < 0
      ? '다음 1주일은 단백질과 수면을 우선 챙기고, 강도 높은 운동은 유지하되 회복도 확인해 보세요.'
      : bodyFatDelta !== null && bodyFatDelta > 0.5
        ? '다음 1주일은 야식과 액상 칼로리를 줄이고, 유산소 1회만 더 추가해도 흐름이 좋아질 수 있어요.'
        : '현재 흐름을 유지하되, 같은 시간대 공복 측정으로 비교 품질을 높여 보세요.';

    return {
      tone,
      headline,
      body: `직전 기록 대비 체중 ${weightDelta >= 0 ? '+' : ''}${weightDelta.toFixed(1)}kg${bodyFatDelta !== null ? ` · 체지방 ${bodyFatDelta >= 0 ? '+' : ''}${bodyFatDelta.toFixed(1)}%` : ''}${muscleDelta !== null ? ` · 골격근량 ${muscleDelta >= 0 ? '+' : ''}${muscleDelta.toFixed(1)}kg` : ''}`,
      longLine,
      plan,
    };
  })();

  React.useEffect(() => {
    async function buildWeightCoachSummary() {
      const periodLabel = summaryPeriod === 'today' ? '오늘' : summaryPeriod === 'week' ? '최근 7일' : '최근 30일';
      const lines = summaryWeights.length
        ? summaryWeights
            .slice(0, 8)
            .map((record) => `${record.date}: ${record.valueKg}kg${typeof record.bodyFatPercentage === 'number' ? ` / 체지방 ${record.bodyFatPercentage}%` : ''}${typeof record.skeletalMuscleMassKg === 'number' ? ` / 골격근 ${record.skeletalMuscleMassKg}kg` : ''}`)
            .join('\n')
        : '기록 없음';
      const localFallback = !summaryWeights.length
        ? `${periodLabel} 체중 기록이 아직 없습니다. 같은 조건의 측정값이 2~3개만 쌓여도 감량인지 수분변동인지 구분하기 쉬워집니다.`
        : periodBodyFatDelta !== null && periodBodyFatDelta > 0.4
          ? `${periodLabel} 체중 변화보다 체지방 변화가 더 불리합니다. 현재 흐름은 체중 자체보다 조성 관리가 먼저 흔들리고 있는 신호에 가깝습니다.`
          : periodMuscleDelta !== null && periodMuscleDelta > 0.2
            ? `${periodLabel} 체중보다 골격근량 흐름이 안정적입니다. 숫자 변동이 있어도 체성분 방향은 나쁘지 않으니 측정 조건만 더 일정하게 맞추면 됩니다.`
            : `${periodLabel} 기록은 체중 자체보다 측정 편차가 함께 섞여 있습니다. 같은 시간대와 같은 컨디션으로 비교 품질을 높이는 것이 우선입니다.`;
      try {
        setCoachLoading(true);
        const text = await generateAiResponse(
          store.aiSettings,
          store,
          `당신은 체성분 변화를 해석하는 코치입니다. 뻔한 말 금지, 숫자 근거 포함, 한국어 2~3문장 140자 안팎으로만 답하세요.
${periodLabel} 체중/체성분 흐름을 평가하고, 가장 중요한 관리 포인트 1개만 말하세요.

요약: 기록 ${summaryWeights.length}건, 최신 ${periodLatest?.valueKg ?? '-'}kg, 변화 ${periodWeightDelta !== null ? `${periodWeightDelta >= 0 ? '+' : ''}${periodWeightDelta.toFixed(1)}kg` : '기준 부족'}, 체지방 변화 ${periodBodyFatDelta !== null ? `${periodBodyFatDelta >= 0 ? '+' : ''}${periodBodyFatDelta.toFixed(1)}%` : '없음'}, 골격근 변화 ${periodMuscleDelta !== null ? `${periodMuscleDelta >= 0 ? '+' : ''}${periodMuscleDelta.toFixed(1)}kg` : '없음'}

기록:
${lines}`,
        );
        setCoachText(text);
      } catch {
        setCoachText(localFallback);
      } finally {
        setCoachLoading(false);
      }
    }
    buildWeightCoachSummary();
  }, [periodBodyFatDelta, periodLatest?.valueKg, periodMuscleDelta, periodWeightDelta, store, summaryPeriod, summaryWeights]);

  return (
    <>
      <ScreenFrame
        title="Weights"
        subtitle="매일 조금씩 달라지는 체중의 변화를 기록해 보세요. 그래프가 시간순 흐름을 보여줍니다."
        accent={palette.coral}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="날짜 또는 수치 검색..."
        actionLabel="체중 추가"
        onAction={openAddMenu}
      >
        <SurfaceCard style={styles.summaryCard}>
          <View style={styles.coachHeader}>
            <View>
              <Text style={styles.summaryTitle}>Weight Coach Summary</Text>
              <Text style={styles.summaryCaption}>체중 숫자보다 변화의 질을 짧고 정확하게 읽어줍니다.</Text>
            </View>
            {coachLoading ? <ActivityIndicator size="small" color={palette.coral} /> : null}
          </View>
          <View style={styles.filterRow}>
            <ChoiceChip label="오늘" selected={summaryPeriod === 'today'} onPress={() => setSummaryPeriod('today')} />
            <ChoiceChip label="주간" selected={summaryPeriod === 'week'} onPress={() => setSummaryPeriod('week')} />
            <ChoiceChip label="월간" selected={summaryPeriod === 'month'} onPress={() => setSummaryPeriod('month')} />
          </View>
          <View style={styles.metricsRow}>
            <MetricPill label="기록" value={`${summaryWeights.length}건`} tone="good" />
            <MetricPill label="최신 체중" value={periodLatest ? formatWeight(periodLatest.valueKg) : '없음'} />
            <MetricPill label="순변화" value={periodWeightDelta === null ? '기준 부족' : `${periodWeightDelta > 0 ? '+' : ''}${periodWeightDelta.toFixed(1)} kg`} tone="warm" />
          </View>
          <Text style={styles.summaryBody}>{coachText || (bodyComment ? bodyComment.headline : '체중 흐름을 정리하고 있습니다.')}</Text>
        </SurfaceCard>

        <View style={styles.bodySummaryHeader}>
          <Text style={styles.bodySummaryTitle}>인바디검사 요약</Text>
          {displayWeight ? (
            <Text style={styles.bodySummaryDate}>
              {formatChartDate(displayWeight)}
            </Text>
          ) : null}
        </View>
        <View style={styles.bodyMetricCards}>
          <Pressable
            onPress={() => displayWeight && setSelectedWeightId(displayWeight.id)}
            style={[
              styles.bodyMetricCard,
              styles.bodyMetricCardActive,
              weightTone === 'red' && styles.bodyMetricCardRed,
            ]}
          >
            <Text style={styles.bodyMetricLabel}>체중 (kg)</Text>
            <Text style={styles.bodyMetricValue}>{displayWeight ? displayWeight.valueKg.toFixed(1) : '-'}</Text>
            <View style={[
              styles.bodyMetricBadge,
              weightTone === 'red' && styles.bodyMetricBadgeRed,
            ]}>
              <Text style={styles.bodyMetricBadgeText}>{getMetricStatusLabel(weightStatus)}</Text>
            </View>
          </Pressable>
          <View style={[
            styles.bodyMetricCard,
            muscleTone === 'red' && styles.bodyMetricCardRed,
            muscleTone === 'blue' && styles.bodyMetricCardBlue,
          ]}>
            <Text style={styles.bodyMetricLabel}>골격근량 (kg)</Text>
            <Text style={styles.bodyMetricValue}>
              {typeof displayWeight?.skeletalMuscleMassKg === 'number' ? displayWeight.skeletalMuscleMassKg.toFixed(1) : '-'}
            </Text>
            <View style={[
              styles.bodyMetricBadge,
              muscleTone === 'red' && styles.bodyMetricBadgeRed,
              muscleTone === 'blue' && styles.bodyMetricBadgeBlue,
            ]}>
              <Text style={styles.bodyMetricBadgeText}>{getMetricStatusLabel(muscleStatus)}</Text>
            </View>
          </View>
          <View style={[
            styles.bodyMetricCard,
            bodyFatTone === 'red' && styles.bodyMetricCardRed,
            bodyFatTone === 'blue' && styles.bodyMetricCardBlue,
          ]}>
            <Text style={styles.bodyMetricLabel}>체지방률 (%)</Text>
            <Text style={styles.bodyMetricValue}>
              {typeof displayWeight?.bodyFatPercentage === 'number' ? displayWeight.bodyFatPercentage.toFixed(1) : '-'}
            </Text>
            <View style={[
              styles.bodyMetricBadge,
              bodyFatTone === 'red' && styles.bodyMetricBadgeRed,
              bodyFatTone === 'blue' && styles.bodyMetricBadgeBlue,
            ]}>
              <Text style={styles.bodyMetricBadgeText}>{getMetricStatusLabel(bodyFatStatus)}</Text>
            </View>
          </View>
        </View>

        <WeightTrendChart
          records={filteredWeights}
          selectedId={selectedWeightId}
          onSelect={(record) => setSelectedWeightId(record.id)}
        />

        <EmptyState
          title={filteredWeights.length ? '그래프의 점을 눌러 요약 바꾸기' : '체중 기록이 아직 없습니다'}
          body={filteredWeights.length ? '선택한 시간의 체중, 골격근량, 체지방률이 위 카드에 바로 표시됩니다.' : '체중을 추가하면 시간순 그래프로 바로 확인할 수 있어요.'}
          actionLabel="기록 추가"
          onAction={openAddMenu}
        />
      </ScreenFrame>

      <ModalSheet
        visible={composerVisible}
        title="체중 기록"
        subtitle={isAnalyzing ? "AI가 사진에서 수치를 분석 중입니다..." : "오늘 몸무게를 측정하셨나요? 하루 한 번 꾸준한 기록이 중요합니다."}
        onClose={() => setComposerVisible(false)}
        onSave={saveWeight}
        saveDisabled={isAnalyzing}
      >
        {isAnalyzing && (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={palette.paper} />
            <View>
              <Text style={styles.analyzingText}>AI가 사진을 분석하고 있어요!</Text>
              <Text style={styles.analyzingSubtext}>자동으로 눈바디와 체중계를 파악 중입니다 ⚖️</Text>
            </View>
          </View>
        )}

        <View style={styles.dateTimeRow}>
          <Pressable onPress={chooseDate} style={[styles.dateButton, { flex: 2 }]}>
            <View>
              <Text style={styles.dateButtonLabel}>날짜 {Platform.OS !== 'android' ? '(YYYY-MM-DD)' : ''}</Text>
              {Platform.OS === 'android' ? (
                <Text style={styles.dateButtonValue}>{formatLongDate(draft.date)}</Text>
              ) : (
                <TextInput style={[styles.dateButtonValue, { padding: 0 }]} value={draft.date} onChangeText={(val) => setDraft((c) => ({ ...c, date: val }))} />
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
                <TextInput style={[styles.dateButtonValue, { padding: 0 }]} value={draft.time} onChangeText={(val) => setDraft((c) => ({ ...c, time: val }))} />
              )}
            </View>
            <Feather name="clock" size={18} color={palette.ink} />
          </Pressable>
        </View>

        <FieldInput
          label="체중 (kg)"
          placeholder="70.5"
          keyboardType="decimal-pad"
          value={draft.valueKg}
          onChangeText={(valueKg) => setDraft((current) => ({ ...current, valueKg }))}
        />
        <View style={styles.metricsGrid}>
          <View style={{ flex: 1 }}>
            <FieldInput
              label="BMI"
              placeholder="-"
              keyboardType="decimal-pad"
              value={draft.bmi}
              onChangeText={(bmi) => setDraft((current) => ({ ...current, bmi }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FieldInput
              label="체지방(%)"
              placeholder="-"
              keyboardType="decimal-pad"
              value={draft.bodyFatPercentage}
              onChangeText={(bodyFatPercentage) => setDraft((current) => ({ ...current, bodyFatPercentage }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FieldInput
              label="골격근량(kg)"
              placeholder="-"
              keyboardType="decimal-pad"
              value={draft.skeletalMuscleMassKg}
              onChangeText={(skeletalMuscleMassKg) => setDraft((current) => ({ ...current, skeletalMuscleMassKg }))}
            />
          </View>
        </View>
        <View style={styles.metricsGrid}>
          <View style={{ flex: 1 }}>
            <FieldInput
              label="체수분량(kg)"
              placeholder="-"
              keyboardType="decimal-pad"
              value={draft.bodyWaterKg}
              onChangeText={(bodyWaterKg) => setDraft((current) => ({ ...current, bodyWaterKg }))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FieldInput
              label="체지방량(kg)"
              placeholder="-"
              keyboardType="decimal-pad"
              value={draft.bodyFatMassKg}
              onChangeText={(bodyFatMassKg) => setDraft((current) => ({ ...current, bodyFatMassKg }))}
            />
          </View>
        </View>

        <FieldInput
          label="메모"
          placeholder="공복 상태, 운동 후, 과식 후 등..."
          value={draft.note}
          onChangeText={(note) => setDraft((current) => ({ ...current, note }))}
        />

        <SurfaceCard style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: palette.ink }}>사진 첨부</Text>
              <Text style={{ marginTop: 4, fontFamily: fontFamily.regular, fontSize: 14, color: palette.muted }}>체중계 사진을 올리면 AI가 수치를 자동 기록해 드립니다.</Text>
            </View>
            {draft.imageUri ? (
              <Pressable onPress={() => setDraft((c) => ({ ...c, imageUri: '' }))} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blush, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="trash-2" size={16} color={palette.coral} />
              </Pressable>
            ) : null}
          </View>
          {draft.imageUri ? (
            <Image source={{ uri: draft.imageUri }} style={{ width: '100%', height: 180, borderRadius: 22 }} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PrimaryButton label="앨범에서 선택" onPress={addLibraryImage} icon="image" variant="outline" />
            <PrimaryButton label="카메라 촬영" onPress={addCameraImage} icon="camera" variant="ghost" />
          </View>
        </SurfaceCard>

      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    gap: 14,
    backgroundColor: '#FFF9F6',
    borderColor: '#F2DCCE',
  },
  summaryTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: palette.ink,
  },
  summaryCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: palette.muted,
  },
  summaryBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.ink,
  },
  bodySummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  bodySummaryTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: palette.ink,
  },
  bodySummaryDate: {
    flexShrink: 0,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  bodyMetricCards: {
    flexDirection: 'row',
    gap: 10,
  },
  bodyMetricCard: {
    flex: 1,
    minHeight: 132,
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 15,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.stroke,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bodyMetricCardActive: {
    borderWidth: 3,
    borderColor: '#67738A',
  },
  bodyMetricCardRed: {
    borderColor: '#EE6D86',
    backgroundColor: '#FFF6F8',
  },
  bodyMetricCardBlue: {
    borderColor: '#69AEEB',
    backgroundColor: '#F2F8FF',
  },
  bodyMetricLabel: {
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.muted,
  },
  bodyMetricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 34,
    color: palette.ink,
  },
  bodyMetricBadge: {
    alignSelf: 'stretch',
    borderRadius: 999,
    paddingVertical: 8,
    backgroundColor: palette.mint,
  },
  bodyMetricBadgeRed: {
    backgroundColor: palette.coral,
  },
  bodyMetricBadgeBlue: {
    backgroundColor: '#4C9DE4',
  },
  bodyMetricBadgeText: {
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.paper,
  },
  calendarCard: {
    gap: 14,
    backgroundColor: '#FFFDF7',
    borderColor: '#F1E2C8',
  },
  chartCard: {
    gap: 14,
    backgroundColor: '#FFFDF7',
    borderColor: '#F1E2C8',
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  chartHeader: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  chartTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: palette.ink,
  },
  chartCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
  },
  chartCountBadge: {
    borderRadius: 999,
    backgroundColor: '#F5E4D7',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chartCountText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.coral,
  },
  chartViewport: {
    paddingHorizontal: 18,
  },
  chartCanvas: {
    height: chartHeight,
    position: 'relative',
  },
  chartGridLine: {
    position: 'absolute',
    left: 0,
    right: chartRightPadding - 10,
    height: 1,
    backgroundColor: '#EFE7D8',
  },
  chartYAxisLabel: {
    position: 'absolute',
    right: 4,
    width: 44,
    textAlign: 'right',
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  chartLineSegment: {
    position: 'absolute',
    height: 2,
    borderRadius: 999,
    backgroundColor: '#CFD5D2',
  },
  chartDotButton: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  chartDot: {
    width: 15,
    height: 15,
    borderRadius: 999,
    backgroundColor: palette.mint,
    borderWidth: 3,
    borderColor: palette.paper,
  },
  chartDotSelected: {
    width: 19,
    height: 19,
    backgroundColor: palette.coral,
    borderColor: '#FFF3EC',
  },
  chartXLabel: {
    position: 'absolute',
    width: 76,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.muted,
  },
  chartXLabelSelected: {
    color: palette.ink,
    fontFamily: fontFamily.bold,
  },
  selectedGuide: {
    position: 'absolute',
    width: 2,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#C9C9C9',
  },
  selectedTooltip: {
    position: 'absolute',
    top: 0,
    zIndex: 5,
    width: chartTooltipWidth,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#F3F1F6',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  selectedTooltipDate: {
    flexShrink: 0,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: palette.muted,
  },
  selectedTooltipValue: {
    flexShrink: 0,
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: palette.ink,
  },
  coachCard: {
    gap: 10,
    backgroundColor: '#FFF7EC',
    borderColor: '#F1D7A7',
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coachBadge: {
    borderRadius: 999,
    backgroundColor: '#E9ECE8',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  coachBadgeGood: {
    backgroundColor: '#E7F6EE',
  },
  coachBadgeWarn: {
    backgroundColor: '#FFE8E1',
  },
  coachBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: palette.ink,
  },
  coachTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: palette.ink,
  },
  coachBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  coachPlan: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 20,
    color: '#8A5A1E',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  monthHeading: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
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
  weightDayCell: {
    width: '13.3%',
    minWidth: 0,
    aspectRatio: 0.76,
    borderRadius: 15,
    paddingVertical: 6,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: '#F1E6CF',
    backgroundColor: palette.paper,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCellMuted: {
    opacity: 0.45,
  },
  weightDayCellActive: {
    backgroundColor: '#FFF5EF',
    borderColor: '#F3B5A5',
  },
  dayNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: palette.ink,
  },
  dayNumberMuted: {
    color: palette.muted,
  },
  weightDayIndicator: {
    width: 18,
    height: 6,
    borderRadius: 999,
    backgroundColor: palette.coral,
  },
  weightDayIndicatorIdle: {
    backgroundColor: '#E9DED1',
  },
  weightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  weightRowDate: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.mintDeep,
  },
  recordDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordTime: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.coral,
    opacity: 0.8,
  },
  weightRowValue: {
    marginTop: 4,
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: palette.ink,
  },
  weightItemInfo: {
    flex: 1,
  },
  weightItemNoteWrap: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  deleteButton: {
    padding: 6,
  },
  weightRowNote: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: palette.muted,
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
    marginTop: 4,
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: palette.ink,
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
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricRowSmall: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  recordMetricSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
    backgroundColor: palette.mist,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
