import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { addMonths, subMonths } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Alert, PanResponder, Platform, Pressable, StyleSheet, Text, View, TextInput } from 'react-native';

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
import { buildWeightCalendar, getLatestWeight, getWeightChange } from '../utils/analytics';
import { formatLongDate, formatMonthYear, formatTime, formatWeight, makeId, sortByDateDesc, todayDateKey, currentTimeKey } from '../utils/format';
import { confirmAction } from '../utils/ui';
import { captureImageWithCamera, getPersistedImageUri, pickImageFromLibrary } from '../utils/media';
import { analyzeImage } from '../services/ai';
import { ActivityIndicator } from 'react-native';



const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

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

export function WeightsScreen({ route, navigation }: any) {
  const { store, addWeight, deleteWeight } = useHealthData();
  const { openAddMenu } = useGlobalUi();
  const [focusMonth, setFocusMonth] = useState(new Date());
  const [query, setQuery] = useState('');
  const [composerVisible, setComposerVisible] = useState(false);
  const [selectedWeightDate, setSelectedWeightDate] = useState<string | null>(null);
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
  const calendar = buildWeightCalendar(focusMonth, store.weights);
  const filteredWeights = sortByDateDesc(store.weights).filter((record) => {
    const haystack = `${record.date} ${record.valueKg} ${record.note ?? ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const selectedDateWeights = selectedWeightDate
    ? sortByDateDesc(store.weights).filter((record) => record.date === selectedWeightDate)
    : [];
  const calendarSwipe = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 14 && Math.abs(gesture.dy) < 20,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 40) {
            setFocusMonth((current) => subMonths(current, 1));
          } else if (gesture.dx < -40) {
            setFocusMonth((current) => addMonths(current, 1));
          }
        },
      }),
    [],
  );

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

  function confirmDelete(id: string) {
    confirmAction('기록 삭제', '이 체중 기록을 정말 삭제할까요? 삭제 후에는 복구할 수 없습니다.', () => deleteWeight(id));
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
        subtitle="매일 조금씩 달라지는 체중의 변화를 기록해 보세요. 달력이 변화의 흐름을 보여줍니다."
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

        <View {...calendarSwipe.panHandlers}>
        <SurfaceCard style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <View style={styles.monthHeading}>
              <Text style={styles.monthLabel}>{formatMonthYear(focusMonth)}</Text>
              <Text style={styles.monthCaption}>좌우로 밀어 월을 넘기고 날짜별 흐름을 확인하세요.</Text>
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

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((label) => (
              <Text key={label} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendar.map((day) => (
              <Pressable
                key={day.key}
                onPress={() => {
                  if (day.record) {
                    setSelectedWeightDate(day.key);
                  }
                }}
                style={[
                  styles.weightDayCell,
                  !day.inMonth && styles.dayCellMuted,
                  day.record && styles.weightDayCellActive,
                ]}
              >
                <Text style={[styles.dayNumber, !day.inMonth && styles.dayNumberMuted]}>
                  {day.dayOfMonth}
                </Text>
                <View
                  style={[
                    styles.weightDayIndicator,
                    !day.record && styles.weightDayIndicatorIdle,
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </SurfaceCard>
        </View>

        <EmptyState
          title={filteredWeights.length ? '달력에서 날짜를 눌러 체중 보기' : '체중 기록이 아직 없습니다'}
          body={filteredWeights.length ? '메인 화면에서는 달력만 보고, 상세 기록은 날짜를 눌렀을 때만 열리도록 정리했어요.' : '체중을 추가하면 날짜별로 달력에서 바로 확인할 수 있어요.'}
          actionLabel="기록 추가"
          onAction={openAddMenu}
        />
      </ScreenFrame>

      <ModalSheet
        visible={Boolean(selectedWeightDate)}
        title={selectedWeightDate ? `${formatLongDate(selectedWeightDate)} 체중` : '체중 기록'}
        subtitle="해당 날짜의 체중과 체성분 기록만 모아서 볼 수 있어요."
        onClose={() => setSelectedWeightDate(null)}
      >
        {selectedDateWeights.length ? (
          selectedDateWeights.map((record) => (
            <SurfaceCard key={record.id} style={styles.weightRow}>
              <View style={styles.weightItemInfo}>
                <View style={styles.recordDateRow}>
                  <Text style={styles.weightRowDate}>{formatLongDate(record.date)}</Text>
                  {record.time && <Text style={styles.recordTime}>{formatTime(record.time)}</Text>}
                </View>
                <Text style={styles.weightRowValue}>{formatWeight(record.valueKg)}</Text>
                {(record.bmi || record.bodyFatPercentage || record.skeletalMuscleMassKg || record.bodyWaterKg || record.bodyFatMassKg) && (
                  <View style={styles.metricRowSmall}>
                    {record.bmi && <Text style={styles.recordMetricSmall}>BMI {record.bmi}</Text>}
                    {record.bodyFatPercentage && <Text style={styles.recordMetricSmall}>체지방 {record.bodyFatPercentage}%</Text>}
                    {record.skeletalMuscleMassKg && <Text style={styles.recordMetricSmall}>골격근량 {record.skeletalMuscleMassKg}kg</Text>}
                    {record.bodyWaterKg && <Text style={styles.recordMetricSmall}>체수분 {record.bodyWaterKg}kg</Text>}
                    {record.bodyFatMassKg && <Text style={styles.recordMetricSmall}>체지방량 {record.bodyFatMassKg}kg</Text>}
                  </View>
                )}
              </View>
              <View style={styles.weightItemNoteWrap}>
                <Text style={styles.weightRowNote} numberOfLines={3}>{record.note || '메모 없음'}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable
                    onPress={() => {
                      setSelectedWeightDate(null);
                      setDraft({
                        ...(record as any),
                        time: record.time || '',
                        valueKg: String(record.valueKg),
                        bmi: record.bmi ? String(record.bmi) : '',
                        bodyFatPercentage: record.bodyFatPercentage ? String(record.bodyFatPercentage) : '',
                        skeletalMuscleMassKg: record.skeletalMuscleMassKg ? String(record.skeletalMuscleMassKg) : '',
                        bodyWaterKg: record.bodyWaterKg ? String(record.bodyWaterKg) : '',
                        bodyFatMassKg: record.bodyFatMassKg ? String(record.bodyFatMassKg) : '',
                        note: record.note || '',
                      });
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
            </SurfaceCard>
          ))
        ) : (
          <EmptyState title="기록 없음" body="이 날짜에는 체중 기록이 없어요." />
        )}
      </ModalSheet>

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
  calendarCard: {
    gap: 14,
    backgroundColor: '#FFFDF7',
    borderColor: '#F1E2C8',
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
