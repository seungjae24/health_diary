import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { addMonths, subMonths } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View, TextInput } from 'react-native';

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draft, setDraft] = useState(createWeightDraft());

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
  const calendar = buildWeightCalendar(focusMonth, store.weights);
  const filteredWeights = sortByDateDesc(store.weights).filter((record) => {
    const haystack = `${record.date} ${record.valueKg} ${record.note ?? ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

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

        <View style={styles.metricsRow}>
          <MetricPill
            label="최근 체중"
            value={latestWeight ? formatWeight(latestWeight.valueKg) : '없음'}
            tone="good"
          />
          <MetricPill
            label="2주 변화"
            value={
              weightChange === null
                ? '기록 부족'
                : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg`
            }
          />
          <MetricPill label="총 기록 수" value={`${store.weights.length}건`} tone="warm" />
        </View>

        {bodyComment ? (
          <SurfaceCard style={styles.coachCard}>
            <View style={styles.coachHeader}>
              <View style={[styles.coachBadge, bodyComment.tone === '칭찬' && styles.coachBadgeGood, bodyComment.tone === '혼냄' && styles.coachBadgeWarn]}>
                <Text style={styles.coachBadgeText}>{bodyComment.tone}</Text>
              </View>
              <Text style={styles.coachTitle}>{bodyComment.headline}</Text>
            </View>
            <Text style={styles.coachBody}>{bodyComment.body}</Text>
            <Text style={styles.coachBody}>{bodyComment.longLine}</Text>
            <Text style={styles.coachPlan}>다음 계획: {bodyComment.plan}</Text>
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <View>
              <Text style={styles.monthLabel}>{formatMonthYear(focusMonth)}</Text>
              <Text style={styles.monthCaption}>월별 이동을 통해 변화 추이를 확인하세요.</Text>
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
              <View
                key={day.key}
                style={[
                  styles.dayCell,
                  !day.inMonth && styles.dayCellMuted,
                  day.record && styles.dayCellFilled,
                ]}
              >
                <Text style={[styles.dayNumber, !day.inMonth && styles.dayNumberMuted]}>
                  {day.dayOfMonth}
                </Text>
                {day.record ? (
                  <View style={styles.weightBadge}>
                    <Text style={styles.weightBadgeText}>{day.record.valueKg.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </SurfaceCard>

        {filteredWeights.length ? (
          filteredWeights.map((record) => (
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
                <Text style={styles.weightRowNote} numberOfLines={2}>{record.note || '메모 없음'}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Pressable
                    onPress={() => {
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
          <EmptyState
            title="검사 결과가 없습니다"
            body="검색어를 변경하거나 새로운 체중을 기록해 보세요."
            actionLabel="기록 추가"
            onAction={openAddMenu}
          />
        )}
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
  calendarCard: {
    gap: 14,
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
    alignItems: 'flex-start',
  },
  monthLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: palette.ink,
  },
  monthCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: palette.muted,
  },
  monthActions: {
    flexDirection: 'row',
    gap: 10,
  },
  monthButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.stroke,
  },
  dayCell: {
    width: '14.2857%',
    minHeight: 78,
    paddingHorizontal: 4,
    paddingVertical: 7,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paper,
    gap: 8,
  },
  dayCellMuted: {
    backgroundColor: '#F4F4EE',
  },
  dayCellFilled: {
    backgroundColor: '#F3FFF7',
  },
  dayNumber: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.ink,
  },
  dayNumberMuted: {
    color: '#A2A9A0',
  },
  weightBadge: {
    backgroundColor: palette.mint,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  weightBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: palette.paper,
    textAlign: 'center',
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
