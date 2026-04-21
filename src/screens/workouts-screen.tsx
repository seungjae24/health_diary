import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { addMonths, subMonths } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, TextInput } from 'react-native';

import { defaultWorkoutActivities, strengthCategoryLabels, workoutExerciseLibrary } from '../data/workout-library';
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
import { fontFamily, palette } from '../theme';
import { StrengthExerciseCategory, StrengthExerciseEntry, StrengthSetEntry, WorkoutKind, WorkoutSessionType } from '../types';
import { buildWorkoutCalendar, getWorkoutCount, getWorkoutMinutes } from '../utils/analytics';
import {
  formatDistanceKm,
  formatDurationMinutes,
  formatLongDate,
  formatMonthYear,
  formatPace,
  formatTime,
  makeId,
  sortByDateDesc,
  todayDateKey,
  currentTimeKey,
} from '../utils/format';
import { captureImageWithCamera, getPersistedImageUri, pickImageFromLibrary } from '../utils/media';
import { confirmAction } from '../utils/ui';
import { analyzeImage, generateAiResponse } from '../services/ai';
import { ActivityIndicator } from 'react-native';

const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

type WorkoutDraft = {
  id?: string;
  date: string;
  time: string;
  kind: WorkoutKind;
  sessionType: WorkoutSessionType;
  activityId: string;
  activityLabel: string;
  title: string;
  notes: string;
  durationMinutes: string;
  caloriesBurned: string;
  imageUri: string;
  distanceKm: string;
  paceMinPerKm: string;
  averageHeartRate: string;
  averageCadence: string;
  badmintonMinutes: string;
  strengthExercises: StrengthExerciseEntry[];
};

type WorkoutAiSummary = {
  provider?: string;
  modelLabel?: string;
  kind?: string;
  title?: string;
  durationMinutes?: string;
  distanceKm?: string;
  paceMinPerKm?: string;
  averageHeartRate?: string;
  averageCadence?: string;
  notes?: string;
  rawText?: string;
  comparisons?: Array<{
    provider: string;
    modelLabel?: string;
    rawText?: string;
    fields: Array<{ label: string; value: string }>;
    empty: boolean;
    error?: string;
  }>;
  errors?: string[];
  empty: boolean;
};

const strengthFilterLabels: Array<{ label: string; value: 'all' | 'bookmark' | StrengthExerciseCategory }> = [
  { label: '전체', value: 'all' },
  { label: '북마크', value: 'bookmark' },
  { label: '하체', value: 'lower' },
  { label: '가슴', value: 'chest' },
  { label: '등', value: 'back' },
  { label: '어깨', value: 'shoulder' },
  { label: '팔', value: 'arms' },
  { label: '복근', value: 'core' },
  { label: '기타', value: 'other' },
  { label: '유산소', value: 'cardio' },
];

function createWorkoutDraft(): WorkoutDraft {
  return {
    date: todayDateKey(),
    time: currentTimeKey(),
    kind: 'running',
    sessionType: 'cardio',
    activityId: 'run',
    activityLabel: '달리기',
    title: '',
    notes: '',
    durationMinutes: '',
    caloriesBurned: '',
    imageUri: '',
    distanceKm: '',
    paceMinPerKm: '',
    averageHeartRate: '',
    averageCadence: '',
    badmintonMinutes: '',
    strengthExercises: [],
  };
}

function createStrengthSet(): StrengthSetEntry {
  return {
    id: makeId('set'),
    weightKg: undefined,
    reps: undefined,
  };
}

function calculateStrengthSummary(exercises: StrengthExerciseEntry[]) {
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const totalVolumeKg = exercises.reduce(
    (sum, exercise) =>
      sum +
      exercise.sets.reduce(
        (exerciseSum, set) => exerciseSum + (set.weightKg || 0) * (set.reps || 0),
        0,
      ),
    0,
  );
  return {
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg),
    exerciseCount: exercises.length,
  };
}

function estimateStrengthCalories(durationMinutes: number, totalSets: number) {
  if (!durationMinutes) return 0;
  return Math.round(durationMinutes * 4.6 + totalSets * 3.5);
}

function calculateExerciseVolume(exercise: StrengthExerciseEntry) {
  return exercise.sets.reduce((sum, set) => sum + (set.weightKg || 0) * (set.reps || 0), 0);
}

function getBodyPartStats(workouts: any[]) {
  const stats = new Map<
    StrengthExerciseCategory | 'cardio',
    { sets: number; volume: number; exerciseCount: number }
  >();

  workouts.forEach((workout) => {
    if (workout.sessionType === 'strength' && workout.strength?.exercises) {
      workout.strength.exercises.forEach((exercise: StrengthExerciseEntry) => {
        const current = stats.get(exercise.category) || { sets: 0, volume: 0, exerciseCount: 0 };
        current.sets += exercise.sets.length;
        current.volume += calculateExerciseVolume(exercise);
        current.exerciseCount += 1;
        stats.set(exercise.category, current);
      });
    } else {
      const current = stats.get('cardio') || { sets: 0, volume: 0, exerciseCount: 0 };
      current.exerciseCount += 1;
      stats.set('cardio', current);
    }
  });

  return Array.from(stats.entries())
    .map(([category, value]) => ({
      category,
      label: category === 'cardio' ? '유산소' : strengthCategoryLabels[category],
      ...value,
    }))
    .sort((left, right) => right.sets - left.sets || right.volume - left.volume);
}

function parseNumericLikeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(',', '.').trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePaceValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(',', '.');
  const colonMatch = normalized.match(/(\d{1,2})\s*[:']\s*(\d{1,2})/);
  if (colonMatch) {
    const minutes = Number(colonMatch[1]);
    const seconds = Number(colonMatch[2]);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
      return minutes + seconds / 60;
    }
  }

  return parseNumericLikeValue(normalized);
}

function formatPaceInputValue(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  const wholeMinutes = Math.floor(value);
  const roundedSeconds = Math.round((value - wholeMinutes) * 60);
  const normalizedMinutes = roundedSeconds === 60 ? wholeMinutes + 1 : wholeMinutes;
  const normalizedSeconds = roundedSeconds === 60 ? 0 : roundedSeconds;
  return `${normalizedMinutes}'${String(normalizedSeconds).padStart(2, '0')}''`;
}

function ExerciseArt({ category }: { category: StrengthExerciseCategory }) {
  const icon =
    category === 'lower'
      ? 'move'
      : category === 'chest'
        ? 'maximize-2'
        : category === 'back'
          ? 'corner-up-left'
          : category === 'shoulder'
            ? 'navigation'
            : category === 'arms'
              ? 'git-branch'
              : category === 'core'
                ? 'target'
                : category === 'cardio'
                  ? 'wind'
                  : 'activity';
  const tint =
    category === 'lower'
      ? '#F7E3D7'
      : category === 'chest'
        ? '#E4EDFF'
        : category === 'back'
          ? '#E0F2EC'
          : category === 'shoulder'
            ? '#FFF0D9'
            : category === 'arms'
              ? '#F0E6FF'
              : category === 'core'
                ? '#FFE5EA'
                : category === 'cardio'
                  ? '#DFF4FF'
                  : '#EEF1F3';

  return (
    <View style={[styles.exerciseArtWrap, { backgroundColor: tint }]}>
      <View style={styles.exerciseArtBody}>
        <View style={styles.exerciseArtHead} />
        <View style={styles.exerciseArtShoulders}>
          <View style={[styles.exerciseArtArm, styles.exerciseArtArmLeft]} />
          <View style={styles.exerciseArtTorso} />
          <View style={[styles.exerciseArtArm, styles.exerciseArtArmRight]} />
        </View>
        <View style={styles.exerciseArtLegs}>
          <View style={[styles.exerciseArtLeg, styles.exerciseArtLegLeft]} />
          <View style={[styles.exerciseArtLeg, styles.exerciseArtLegRight]} />
        </View>
      </View>
      <Feather name={icon as any} size={16} color={palette.ink} style={styles.exerciseArtIcon} />
    </View>
  );
}

export function WorkoutsScreen({ route, navigation }: any) {
  const { store, addWorkout, deleteWorkout, saveWorkoutActivities, toggleExerciseBookmark } = useHealthData();
  const { openAddMenu } = useGlobalUi();
  const [focusMonth, setFocusMonth] = useState(new Date());
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedWorkoutDate, setSelectedWorkoutDate] = useState<string | null>(null);
  const [selectedWorkoutReportVisible, setSelectedWorkoutReportVisible] = useState(false);
  const [selectedWorkoutReportLoading, setSelectedWorkoutReportLoading] = useState(false);
  const [selectedWorkoutReportText, setSelectedWorkoutReportText] = useState('');
  const [composerVisible, setComposerVisible] = useState(false);
  const [activityManagerVisible, setActivityManagerVisible] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [draft, setDraft] = useState(createWorkoutDraft());
  const [aiSummary, setAiSummary] = useState<WorkoutAiSummary | null>(null);
  const [newActivityLabel, setNewActivityLabel] = useState('');
  const [strengthFilter, setStrengthFilter] = useState<'all' | 'bookmark' | StrengthExerciseCategory>('all');
  const [strengthSort, setStrengthSort] = useState<'recent' | 'alpha'>('recent');
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [exerciseInfoId, setExerciseInfoId] = useState<string | null>(null);
  const [recentExerciseId, setRecentExerciseId] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState('');


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

  React.useEffect(() => {
    buildWorkoutReport(reportPeriod);
  }, [reportPeriod, store.workouts.length, store.goals.length]);

  const activityOptions = store.workoutActivities?.length ? store.workoutActivities : defaultWorkoutActivities;
  const filterOptions = useMemo(() => {
    return ['전체', '근력운동', ...activityOptions.map((item) => item.label)];
  }, [activityOptions]);
  const workouts = sortByDateDesc(store.workouts).filter((record) => {
    const textMatch = `${record.title} ${record.notes} ${record.kind} ${record.activityLabel || ''}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const filterMatch =
      activeFilter === 'all' || activeFilter === '전체'
        ? true
        : activeFilter === '근력운동'
          ? record.sessionType === 'strength' || record.kind === 'strength'
          : (record.activityLabel || record.title) === activeFilter;
    return textMatch && filterMatch;
  });
  const workoutCalendar = buildWorkoutCalendar(focusMonth, store.workouts);
  const selectedDateWorkouts = selectedWorkoutDate
    ? sortByDateDesc(store.workouts).filter((record) => record.date === selectedWorkoutDate)
    : [];
  const selectedDateBodyPartStats = useMemo(
    () => getBodyPartStats(selectedDateWorkouts),
    [selectedDateWorkouts],
  );
  const calendarScores = useMemo(
    () =>
      workoutCalendar.map((day) => {
        const duration = day.records.reduce((sum, record) => sum + (record.durationMinutes || 0), 0);
        const totalSets = day.records.reduce((sum, record) => sum + (record.strength?.totalSets || 0), 0);
        let mood = '·';
        if (day.records.length > 0) {
          if (duration >= 35 || totalSets >= 12) {
            mood = '😊';
          } else if (duration >= 15 || totalSets >= 5) {
            mood = '🙂';
          } else {
            mood = '🥺';
          }
        }
        return {
          ...day,
          duration,
          totalSets,
          mood,
        };
      }),
    [workoutCalendar],
  );
  const strengthLibrary = useMemo(() => {
    const recentMap = new Map<string, number>();
    store.workouts.forEach((record) => {
      record.strength?.exercises.forEach((exercise, index) => {
        if (!recentMap.has(exercise.exerciseId)) {
          recentMap.set(exercise.exerciseId, Date.now() - index);
        }
      });
    });

    return workoutExerciseLibrary
      .filter((exercise) => {
        const matchesQuery = exercise.name.toLowerCase().includes(exerciseQuery.toLowerCase());
        const matchesBookmark =
          strengthFilter !== 'bookmark' || store.bookmarkedExercises.includes(exercise.id);
        const matchesCategory =
          strengthFilter === 'all' ||
          strengthFilter === 'bookmark' ||
          exercise.category === strengthFilter;
        return matchesQuery && matchesBookmark && matchesCategory;
      })
      .sort((left, right) => {
        if (strengthSort === 'alpha') {
          return left.name.localeCompare(right.name, 'ko');
        }
        return (recentMap.get(right.id) || 0) - (recentMap.get(left.id) || 0);
      });
  }, [exerciseQuery, strengthFilter, strengthSort, store.bookmarkedExercises, store.workouts]);
  const selectedExerciseInfo = exerciseInfoId
    ? workoutExerciseLibrary.find((exercise) => exercise.id === exerciseInfoId) || null
    : null;
  const recentExerciseRecord = useMemo(() => {
    if (!recentExerciseId) {
      return null;
    }

    for (const workout of sortByDateDesc(store.workouts)) {
      const exercise = workout.strength?.exercises.find((item) => item.exerciseId === recentExerciseId);
      if (exercise) {
        return {
          workout,
          exercise,
          volume: calculateExerciseVolume(exercise),
        };
      }
    }

    return null;
  }, [recentExerciseId, store.workouts]);
  const todayKey = todayDateKey();
  const reportSourceWorkouts = useMemo(() => {
    if (reportPeriod === 'today') {
      return store.workouts.filter((workout) => workout.date === todayKey);
    }

    if (reportPeriod === 'week') {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const floor = start.toISOString().slice(0, 10);
      return store.workouts.filter((workout) => workout.date >= floor);
    }

    const start = new Date();
    start.setDate(start.getDate() - 29);
    const floor = start.toISOString().slice(0, 10);
    return store.workouts.filter((workout) => workout.date >= floor);
  }, [reportPeriod, store.workouts, todayKey]);
  const reportSummary = useMemo(() => {
    const totalMinutes = reportSourceWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
    const totalCalories = reportSourceWorkouts.reduce((sum, workout) => sum + (workout.caloriesBurned || 0), 0);
    const strengthSessions = reportSourceWorkouts.filter((workout) => workout.sessionType === 'strength').length;
    const cardioSessions = reportSourceWorkouts.filter((workout) => workout.sessionType !== 'strength').length;
    const totalVolume = reportSourceWorkouts.reduce((sum, workout) => sum + (workout.strength?.totalVolumeKg || 0), 0);
    const totalSets = reportSourceWorkouts.reduce((sum, workout) => sum + (workout.strength?.totalSets || 0), 0);
    return { totalMinutes, totalCalories, strengthSessions, cardioSessions, totalVolume, totalSets };
  }, [reportSourceWorkouts]);
  const reportBodyPartStats = useMemo(
    () => getBodyPartStats(reportSourceWorkouts),
    [reportSourceWorkouts],
  );
  const todayWorkouts = sortByDateDesc(store.workouts).filter((workout) => workout.date === todayKey);
  const todayWorkoutComment = useMemo(() => {
    if (!todayWorkouts.length) {
      return '오늘 운동 기록이 아직 없어요. 목표와 비교하려면 가벼운 유산소나 근력 한 세션만 남겨도 분석이 시작됩니다.';
    }

    const todayMinutes = todayWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
    const previousWorkout = sortByDateDesc(store.workouts).find((workout) => workout.date < todayKey);
    const previousMinutes = previousWorkout?.durationMinutes || 0;
    const strengthToday = todayWorkouts.filter((workout) => workout.sessionType === 'strength').length;
    const cardioToday = todayWorkouts.filter((workout) => workout.sessionType !== 'strength').length;
    const summary = `오늘은 ${todayWorkouts.map((item) => item.title).join(', ')}을(를) 해서 총 ${todayMinutes}분 움직였어요.`;
    const deltaLine =
      previousWorkout
        ? `직전 기록(${formatLongDate(previousWorkout.date)}) 대비 ${todayMinutes >= previousMinutes ? `${todayMinutes - previousMinutes}분 더 움직였고` : `${previousMinutes - todayMinutes}분 덜 움직였고`}, `
        : '';
    const goalHint =
      store.goals.length
        ? `현재 목표와 비교하면 ${strengthToday > 0 ? '근력 진행은 괜찮지만' : '근력 자극이 부족할 수 있고'} ${cardioToday > 0 ? '유산소도 챙겼어요.' : '유산소 자극은 더 보완해도 좋아요.'}`
        : `${strengthToday > 0 ? '근력 세션이 포함돼서 좋고,' : '근력 세션을 추가하면 더 좋고,'} ${cardioToday > 0 ? '유산소도 있어서 밸런스가 괜찮아요.' : '유산소는 조금 더해도 좋겠습니다.'}`;
    return `${summary} ${deltaLine}${goalHint}`;
  }, [store.goals.length, store.workouts, todayKey, todayWorkouts]);

  const configuredImageAnalysisLabel =
    store.aiSettings.imageAnalysisProvider === 'compare'
      ? `비교 모드 · OpenAI ${store.aiSettings.openAiModel || 'gpt-5-mini'} + Gemini ${store.aiSettings.geminiModel || 'gemini-2.5-flash'} + Groq ${store.aiSettings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct'}`
      : store.aiSettings.imageAnalysisProvider === 'openai'
        ? `OpenAI · ${store.aiSettings.openAiModel || 'gpt-5-mini'}`
        : store.aiSettings.imageAnalysisProvider === 'groq'
          ? `Groq · ${store.aiSettings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct'}`
          : `Gemini · ${store.aiSettings.geminiModel || 'gemini-2.5-flash'}`;

  function getProviderModelLabel(provider: string) {
    if (provider === 'openai') {
      return `OpenAI · ${store.aiSettings.openAiModel || 'gpt-5-mini'}`;
    }

    if (provider === 'gemini') {
      return `Gemini · ${store.aiSettings.geminiModel || 'gemini-2.5-flash'}`;
    }

    if (provider === 'groq') {
      return `Groq · ${store.aiSettings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct'}`;
    }

    if (provider === 'compare') {
      return '비교 모드';
    }

    return provider;
  }

  async function openComposer(initialData?: any, forcedImage?: string) {
    const draftBase = createWorkoutDraft();
    setAiSummary(null);
    const existingSessionType: WorkoutSessionType =
      initialData?.sessionType || (initialData?.kind === 'strength' ? 'strength' : 'cardio');
    setDraft({
      ...draftBase,
      ...(initialData || {}),
      id: initialData?.id,
      sessionType: existingSessionType,
      activityId: initialData?.activityId || draftBase.activityId,
      activityLabel: initialData?.activityLabel || initialData?.title || draftBase.activityLabel,
      caloriesBurned: initialData?.caloriesBurned ? String(initialData.caloriesBurned) : '',
      strengthExercises: initialData?.strength?.exercises || [],
      imageUri: forcedImage || initialData?.imageUri || draftBase.imageUri,
    });
    setComposerVisible(true);
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

  async function addLibraryImage() {
    const result = await pickImageFromLibrary(true);
    if (result && result.length > 0) {
      const persistedUri = await getPersistedImageUri(result[0]);
      setDraft((current) => ({ ...current, imageUri: persistedUri }));
      const base64s = result.map(r => r.base64).filter((b): b is string => !!b);
      if (base64s.length > 0 && (store.aiSettings.groqKey || store.aiSettings.geminiKey || store.aiSettings.openAiKey)) {
        handleAiAnalysis(base64s);
      } else if (base64s.length > 0) {
        Alert.alert('AI 분석 불가', 'AI 분석을 사용하려면 설정에서 API 키를 먼저 입력해 주세요.');
      }
    }
  }

  async function addCameraImage() {
    const result = await captureImageWithCamera();
    if (result && result.length > 0) {
      const persistedUri = await getPersistedImageUri(result[0]);
      setDraft((current) => ({ ...current, imageUri: persistedUri }));
      const base64s = result.map(r => r.base64).filter((b): b is string => !!b);
      if (base64s.length > 0 && (store.aiSettings.groqKey || store.aiSettings.geminiKey || store.aiSettings.openAiKey)) {
        handleAiAnalysis(base64s);
      } else if (base64s.length > 0) {
        Alert.alert('AI 분석 불가', 'AI 분석을 사용하려면 설정에서 API 키를 먼저 입력해 주세요.');
      }
    }
  }

  async function handleAiAnalysis(base64s: string[]) {
    try {
      setIsAnalyzing(true);
      setAiSummary(null);
      const analysis = await analyzeImage(store.aiSettings, base64s, 'workout');
      const comparisonSummaries = Array.isArray(analysis?.comparisons)
        ? analysis.comparisons.map((item: any) => {
          const itemDistance = parseNumericLikeValue(item?.data?.distanceKm);
          const itemPace = parsePaceValue(item?.data?.paceMinPerKm);
          const itemHeartRate = parseNumericLikeValue(item?.data?.averageHeartRate);
          const itemDuration = parseNumericLikeValue(item?.data?.durationMinutes);

          const fields = [
            { label: '종류', value: item?.data?.kind ? String(item.data.kind) : '-' },
            { label: '제목', value: item?.data?.title ? String(item.data.title) : '-' },
            { label: '시간', value: itemDuration !== null ? `${itemDuration}분` : '-' },
            { label: '거리', value: itemDistance !== null ? `${itemDistance} km` : '-' },
            { label: '페이스', value: itemPace !== null ? `${formatPaceInputValue(itemPace)} /km` : '-' },
            { label: '평균 심박수', value: itemHeartRate !== null ? `${Math.round(itemHeartRate)} bpm` : '-' },
            { label: '평균 케이던스', value: parseNumericLikeValue(item?.data?.averageCadence) !== null ? `${Math.round(parseNumericLikeValue(item?.data?.averageCadence) as number)} spm` : '-' },
          ];

          return {
            provider: item?.provider ?? 'unknown',
            modelLabel: getProviderModelLabel(item?.provider ?? 'unknown'),
            rawText: typeof item?.rawText === 'string' ? item.rawText : undefined,
            error: item?.error,
            empty: fields.every((field) => field.value === '-'),
            fields,
          };
        })
        : [];

      if (analysis && analysis.data) {
        const parsedDistance = parseNumericLikeValue(analysis.data.distanceKm);
        const parsedPace = parsePaceValue(analysis.data.paceMinPerKm);
        const parsedHeartRate = parseNumericLikeValue(analysis.data.averageHeartRate);
        const parsedCadence = parseNumericLikeValue(analysis.data.averageCadence);
        const parsedDuration = parseNumericLikeValue(analysis.data.durationMinutes);
        const summary: WorkoutAiSummary = {
          provider: analysis.provider,
          modelLabel: getProviderModelLabel(analysis.provider),
          kind: analysis.data.kind || undefined,
          title: analysis.data.title || undefined,
          durationMinutes: parsedDuration !== null ? String(parsedDuration) : undefined,
          distanceKm: parsedDistance !== null ? String(parsedDistance) : undefined,
          paceMinPerKm: parsedPace !== null ? formatPaceInputValue(parsedPace) : undefined,
          averageHeartRate: parsedHeartRate !== null ? String(Math.round(parsedHeartRate)) : undefined,
          averageCadence: parsedCadence !== null ? String(Math.round(parsedCadence)) : undefined,
          notes: analysis.data.notes || undefined,
          rawText: typeof analysis.rawText === 'string' ? analysis.rawText : undefined,
          comparisons: comparisonSummaries,
          errors: Array.isArray(analysis?.errors) ? analysis.errors : [],
          empty:
            !analysis.data.kind &&
            !analysis.data.title &&
            parsedDuration === null &&
            parsedDistance === null &&
            parsedPace === null &&
            parsedHeartRate === null &&
            !analysis.data.notes,
        };

        setAiSummary(summary);

        setDraft(current => ({
          ...current,
          sessionType: 'cardio',
          kind: analysis.data.kind || current.kind,
          activityLabel: analysis.data.title || current.activityLabel,
          title: analysis.data.title || current.title,
          notes: analysis.data.notes || current.notes,
          durationMinutes: parsedDuration !== null ? String(parsedDuration) : current.durationMinutes,
          distanceKm: parsedDistance !== null ? String(parsedDistance) : current.distanceKm,
          paceMinPerKm: parsedPace !== null ? formatPaceInputValue(parsedPace) : current.paceMinPerKm,
          averageHeartRate: parsedHeartRate !== null ? String(Math.round(parsedHeartRate)) : current.averageHeartRate,
          averageCadence: parsedCadence !== null ? String(Math.round(parsedCadence)) : current.averageCadence,
        }));

        if (summary.empty) {
          Alert.alert(
            'AI가 운동 수치를 찾지 못했습니다',
            '사진은 첨부되었지만 거리, 페이스, 심박수 같은 값을 읽지 못했습니다. 운동 결과 화면이 더 크게 보이도록 다시 올려보세요.'
          );
        }
      } else {
        setAiSummary({
          provider: analysis?.provider,
          modelLabel: analysis?.provider ? getProviderModelLabel(analysis.provider) : undefined,
          empty: true,
          rawText: typeof analysis?.rawText === 'string' ? analysis.rawText : undefined,
          comparisons: comparisonSummaries,
          errors: Array.isArray(analysis?.errors) ? analysis.errors : [],
        });
        Alert.alert(
          'AI 분석 결과 없음',
          '사진은 첨부되었지만 읽을 수 있는 운동 정보를 찾지 못했습니다.'
        );
      }
    } catch (err) {
      console.error(err);
      setAiSummary({ empty: true });
      Alert.alert('AI 분석 실패', '운동 사진 분석 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  const kindDefaultTitle: Record<WorkoutKind, string> = {
    running: '러닝',
    badminton: '배드민턴',
    strength: '근력운동',
    mobility: '유연성',
    other: '운동',
  };

  function addCustomActivity() {
    const label = newActivityLabel.trim();
    if (!label) {
      return;
    }
    const next = [
      ...activityOptions,
      {
        id: makeId('activity'),
        label,
        sessionType: 'cardio' as const,
        kind: 'other' as const,
        category: 'other' as const,
        removable: true,
      },
    ];
    saveWorkoutActivities(next);
    setDraft((current) => ({ ...current, activityId: next[next.length - 1].id, activityLabel: label }));
    setNewActivityLabel('');
  }

  function removeActivity(id: string) {
    saveWorkoutActivities(activityOptions.filter((item) => item.id !== id));
    if (draft.activityId === id) {
      setDraft((current) => ({ ...current, activityId: 'run', activityLabel: '달리기' }));
    }
    if (activeFilter !== 'all') {
      const removed = activityOptions.find((item) => item.id === id);
      if (removed && activeFilter === removed.label) {
        setActiveFilter('all');
      }
    }
  }

  function addStrengthExercise(exerciseId: string) {
    const definition = workoutExerciseLibrary.find((item) => item.id === exerciseId);
    if (!definition) {
      return;
    }
    setDraft((current) => {
      if (current.strengthExercises.some((exercise) => exercise.exerciseId === definition.id)) {
        return current;
      }
      return {
        ...current,
        sessionType: 'strength',
        kind: 'strength',
        title: current.title || '근력운동',
        strengthExercises: [
          ...current.strengthExercises,
          {
            exerciseId: definition.id,
            name: definition.name,
            category: definition.category,
            sets: [createStrengthSet()],
          },
        ],
      };
    });
    setExercisePickerVisible(false);
  }

  function toggleExerciseSelection(exerciseId: string) {
    setSelectedExerciseIds((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId],
    );
  }

  function addSelectedExercises() {
    if (!selectedExerciseIds.length) {
      return;
    }

    setDraft((current) => {
      const existingIds = new Set(current.strengthExercises.map((exercise) => exercise.exerciseId));
      const additions = selectedExerciseIds
        .map((exerciseId) => workoutExerciseLibrary.find((item) => item.id === exerciseId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => !existingIds.has(item.id))
        .map((item) => ({
          exerciseId: item.id,
          name: item.name,
          category: item.category,
          sets: [createStrengthSet()],
        }));

      return {
        ...current,
        sessionType: 'strength',
        kind: 'strength',
        title: current.title || '근력운동',
        strengthExercises: [...current.strengthExercises, ...additions],
      };
    });

    setSelectedExerciseIds([]);
    setExercisePickerVisible(false);
  }

  function removeSelectedExercise(exerciseId: string) {
    setSelectedExerciseIds((current) => current.filter((id) => id !== exerciseId));
  }

  function moveSelectedExercise(exerciseId: string, direction: -1 | 1) {
    setSelectedExerciseIds((current) => {
      const index = current.indexOf(exerciseId);
      if (index === -1) {
        return current;
      }
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function removeStrengthExercise(exerciseId: string) {
    setDraft((current) => ({
      ...current,
      strengthExercises: current.strengthExercises.filter((exercise) => exercise.exerciseId !== exerciseId),
    }));
  }

  function addSet(exerciseId: string) {
    setDraft((current) => ({
      ...current,
      strengthExercises: current.strengthExercises.map((exercise) =>
        exercise.exerciseId === exerciseId
          ? { ...exercise, sets: [...exercise.sets, createStrengthSet()] }
          : exercise,
      ),
    }));
  }

  function removeSet(exerciseId: string, setId: string) {
    setDraft((current) => ({
      ...current,
      strengthExercises: current.strengthExercises.map((exercise) =>
        exercise.exerciseId === exerciseId
          ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) }
          : exercise,
      ),
    }));
  }

  function updateSetField(
    exerciseId: string,
    setId: string,
    field: 'weightKg' | 'reps',
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      strengthExercises: current.strengthExercises.map((exercise) =>
        exercise.exerciseId === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId
                  ? { ...set, [field]: value ? Number(value) : undefined }
                  : set,
              ),
            }
          : exercise,
      ),
    }));
  }

  async function buildWorkoutReport(period: 'today' | 'week' | 'month') {
    const periodLabel =
      period === 'today' ? '오늘' : period === 'week' ? '최근 7일' : '최근 30일';
    const periodWorkouts =
      period === reportPeriod
        ? reportSourceWorkouts
        : store.workouts.filter((workout) => {
            if (period === 'today') return workout.date === todayKey;
            const start = new Date();
            start.setDate(start.getDate() - (period === 'week' ? 6 : 29));
            return workout.date >= start.toISOString().slice(0, 10);
          });
    const goalLines =
      store.goals.length > 0
        ? store.goals.map((goal) => `${goal.title} (${goal.category}) target ${goal.targetValue}${goal.unit}`).join('\n')
        : '등록된 목표 없음';
    const workoutLines =
      periodWorkouts.length > 0
        ? periodWorkouts
            .map((workout) => {
              const strengthLine = workout.strength
                ? `strength ${workout.strength.exerciseCount} exercises / ${workout.strength.totalSets} sets / ${workout.strength.totalVolumeKg}kg`
                : '';
              const cardioLine = workout.running
                ? `run ${workout.running.distanceKm}km pace ${workout.running.paceMinPerKm.toFixed(2)}`
                : workout.activityLabel || workout.title;
              return `- ${workout.date}: ${workout.title}, ${workout.durationMinutes}min, ${strengthLine || cardioLine}, calories ${workout.caloriesBurned || 0}`;
            })
            .join('\n')
        : '운동 기록 없음';

    const localFallback =
      `${periodLabel} 요약: 총 ${periodWorkouts.length}회, ${periodWorkouts.reduce((sum, item) => sum + item.durationMinutes, 0)}분 운동했습니다. ` +
      `${periodWorkouts.filter((item) => item.sessionType === 'strength').length}회 근력, ${periodWorkouts.filter((item) => item.sessionType !== 'strength').length}회 유산소였습니다. ` +
      `${periodWorkouts.reduce((sum, item) => sum + (item.strength?.totalVolumeKg || 0), 0)}kg 볼륨이 쌓였습니다.`;

    try {
      setReportLoading(true);
      const text = await generateAiResponse(
        store.aiSettings,
        store,
        `당신은 프로 수준의 운동 코치입니다. ${periodLabel} 운동 기록을 매우 자세하고 실전적으로 분석해 주세요.
목표:
${goalLines}

운동 로그:
${workoutLines}

다음 형식으로 한국어로 답하세요:
1. 전체 평가
2. 잘한 점
3. 아쉬운 점
4. Goal 기준 현재 상태
5. 다음 ${period === 'today' ? '운동' : period === 'week' ? '1주일' : '한 달'} 계획
6. 부상/회복/볼륨 관점 주의점`,
      );
      setReportText(text);
    } catch {
      setReportText(localFallback);
    } finally {
      setReportLoading(false);
    }
  }

  async function buildSelectedDayReport() {
    if (!selectedWorkoutDate || !selectedDateWorkouts.length) {
      return;
    }

    const bodyPartLines =
      selectedDateBodyPartStats.length > 0
        ? selectedDateBodyPartStats
            .map((item) => `${item.label}: ${item.sets}세트, ${item.volume}kg 볼륨, 운동 ${item.exerciseCount}개`)
            .join('\n')
        : '부위별 통계 없음';
    const workoutLines = selectedDateWorkouts
      .map((workout) => {
        const strengthDetails = workout.strength?.exercises?.length
          ? workout.strength.exercises
              .map((exercise) => `${exercise.name} ${exercise.sets.map((set) => `${set.weightKg || 0}kgx${set.reps || 0}`).join(', ')}`)
              .join(' / ')
          : workout.activityLabel || workout.title;
        return `- ${workout.title}: ${workout.durationMinutes}분, ${strengthDetails}, 칼로리 ${workout.caloriesBurned || 0}`;
      })
      .join('\n');

    const fallback =
      `${formatLongDate(selectedWorkoutDate)}에는 총 ${selectedDateWorkouts.length}회 운동했고, ` +
      `${selectedDateWorkouts.reduce((sum, workout) => sum + workout.durationMinutes, 0)}분 움직였습니다. ` +
      `${bodyPartLines}`;

    try {
      setSelectedWorkoutReportLoading(true);
      const text = await generateAiResponse(
        store.aiSettings,
        store,
        `당신은 디테일한 퍼포먼스 코치입니다. ${formatLongDate(selectedWorkoutDate)} 하루 운동 레포트를 작성하세요.
목표:
${store.goals.length ? store.goals.map((goal) => `${goal.title} (${goal.category}) ${goal.targetValue}${goal.unit}`).join('\n') : '등록된 목표 없음'}

그날 운동 기록:
${workoutLines}

부위별 통계:
${bodyPartLines}

다음 형식으로 한국어로 답하세요:
1. 오늘 한 운동 요약
2. 부위별 자극/볼륨 해석
3. 잘한 점과 부족한 점
4. 직전 흐름과 비교한 코멘트
5. 다음 운동에서 보완할 점`,
      );
      setSelectedWorkoutReportText(text);
    } catch {
      setSelectedWorkoutReportText(fallback);
    } finally {
      setSelectedWorkoutReportLoading(false);
      setSelectedWorkoutReportVisible(true);
    }
  }

  function saveWorkout() {
    const durationFromForm = Number(draft.durationMinutes);
    const runningDistance = Number(draft.distanceKm);
    const runningPaceFromForm = parsePaceValue(draft.paceMinPerKm) ?? 0;
    const badmintonMinutes = Number(draft.badmintonMinutes);
    const inferredRunningPace =
      runningDistance > 0 && durationFromForm > 0 ? durationFromForm / runningDistance : 0;
    const runningPace = runningPaceFromForm > 0 ? runningPaceFromForm : inferredRunningPace;
    const inferredDuration =
      draft.kind === 'running' && runningDistance > 0 && runningPace > 0
        ? Math.round(runningDistance * runningPace)
        : draft.kind === 'badminton' && badmintonMinutes > 0
          ? badmintonMinutes
          : 0;
    const durationMinutes =
      durationFromForm > 0 ? durationFromForm : inferredDuration;

    const strengthSummary = calculateStrengthSummary(draft.strengthExercises);
    const inferredStrengthDuration =
      draft.sessionType === 'strength' && strengthSummary.totalSets > 0
        ? Math.max(20, strengthSummary.totalSets * 3)
        : 0;
    const resolvedDurationMinutes =
      draft.sessionType === 'strength' && !durationMinutes
        ? inferredStrengthDuration
        : durationMinutes;

    const title =
      draft.title.trim() ||
      (draft.sessionType === 'strength'
        ? '근력운동'
        : draft.activityLabel || kindDefaultTitle[draft.kind]);

    if (!resolvedDurationMinutes) {
      Alert.alert(
        '시간 정보 필요',
        draft.sessionType === 'strength'
          ? '운동 시간(분)을 입력하거나 세트 구성을 더 추가해 주세요.'
          : '운동 시간(분)을 입력하거나 러닝/배드민턴 상세 수치를 입력해 주세요.',
      );
      return;
    }

    if (draft.sessionType === 'strength' && draft.strengthExercises.length === 0) {
      Alert.alert('운동 선택 필요', '근력운동은 최소 1개 이상의 운동을 선택해 주세요.');
      return;
    }

    const selectedActivity = activityOptions.find((item) => item.id === draft.activityId);
    const caloriesBurned =
      Number(draft.caloriesBurned) ||
      (draft.sessionType === 'strength'
        ? estimateStrengthCalories(resolvedDurationMinutes, strengthSummary.totalSets)
        : undefined);

    addWorkout({
      id: draft.id || makeId('workout'),
      date: draft.date,
      time: draft.time,
      kind:
        draft.sessionType === 'strength'
          ? 'strength'
          : selectedActivity?.kind || draft.kind,
      sessionType: draft.sessionType,
      activityId: draft.activityId || undefined,
      activityLabel: draft.sessionType === 'strength' ? '근력운동' : draft.activityLabel,
      title,
      notes: draft.notes.trim(),
      durationMinutes: resolvedDurationMinutes,
      imageUri: draft.imageUri || undefined,
      caloriesBurned,
      running:
        (selectedActivity?.kind === 'running' || draft.kind === 'running') && runningDistance > 0 && runningPace > 0
          ? {
            distanceKm: runningDistance,
            paceMinPerKm: runningPace,
            averageHeartRate: Number(draft.averageHeartRate) || undefined,
            averageCadence: Number(draft.averageCadence) || undefined,
          }
          : undefined,
      badminton:
        (selectedActivity?.kind === 'badminton' || draft.kind === 'badminton') && badmintonMinutes > 0
          ? { totalTimeMinutes: badmintonMinutes }
          : undefined,
      cardio:
        draft.sessionType === 'cardio'
          ? {
              distanceKm: runningDistance || undefined,
              paceMinPerKm: runningPace || undefined,
              averageHeartRate: Number(draft.averageHeartRate) || undefined,
              averageCadence: Number(draft.averageCadence) || undefined,
              caloriesBurned,
            }
          : undefined,
      strength:
        draft.sessionType === 'strength'
          ? {
              exercises: draft.strengthExercises,
              totalVolumeKg: strengthSummary.totalVolumeKg,
              totalSets: strengthSummary.totalSets,
              exerciseCount: strengthSummary.exerciseCount,
              caloriesBurned,
            }
          : undefined,
    });

    setComposerVisible(false);
  }

  function confirmDelete(id: string) {
    confirmAction('Delete workout?', 'This record will be permanently removed.', () => deleteWorkout(id));
  }

  return (
    <>
      <ScreenFrame
        title="Workouts"
        subtitle="오늘의 땀방울을 기록해 보세요. 가벼운 메모에서 구체적인 수치까지 모두 담을 수 있습니다."
        accent={palette.sky}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="운동 기록 검색..."
        actionLabel="운동 추가"
        onAction={openAddMenu}
      >
        <View style={styles.metricsRow}>
          <MetricPill
            label="7일 부하"
            value={formatDurationMinutes(getWorkoutMinutes(store.workouts, 7))}
            tone="good"
          />
          <MetricPill label="러닝 횟수" value={`${getWorkoutCount(store.workouts, 14, 'running')}회`} />
          <MetricPill
            label="근력 세션"
            value={`${store.workouts.filter((item) => item.sessionType === 'strength' || item.kind === 'strength').length}회`}
            tone="warm"
          />
        </View>

        <View style={styles.toolbarRow}>
          <PrimaryButton label="운동 기록 작성하기" onPress={() => openComposer()} icon="plus" />
          <PrimaryButton label="운동 종류 관리" onPress={() => setActivityManagerVisible(true)} icon="sliders" variant="ghost" />
        </View>

        <View style={styles.filterRow}>
          {filterOptions.map((filter) => (
            <ChoiceChip
              key={filter}
              label={filter}
              selected={activeFilter === filter || (filter === '전체' && activeFilter === 'all')}
              onPress={() => setActiveFilter(filter === '전체' ? 'all' : filter)}
            />
          ))}
        </View>

        <SurfaceCard style={styles.reportCard}>
          <View style={styles.inlineHeader}>
            <View>
              <Text style={styles.detailTitle}>오늘의 운동 코멘트</Text>
              <Text style={styles.detailCaption}>오늘 한 운동과 직전 기록, 목표 흐름을 같이 봅니다.</Text>
            </View>
          </View>
          <Text style={styles.reportBody}>{todayWorkoutComment}</Text>
        </SurfaceCard>

        <SurfaceCard style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <View>
              <Text style={styles.monthLabel}>{formatMonthYear(focusMonth)}</Text>
              <Text style={styles.monthCaption}>운동한 날과 종류를 달력에서 먼저 훑어보세요.</Text>
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
            {calendarScores.map((day) => (
              <Pressable
                key={day.key}
                onPress={() => {
                  if (day.records.length) {
                    setSelectedWorkoutDate(day.key);
                  }
                }}
                style={[
                  styles.workoutDayCell,
                  !day.inMonth && styles.dayCellMuted,
                  day.records.length > 0 && styles.workoutDayCellActive,
                ]}
                >
                  <Text style={[styles.dayNumber, !day.inMonth && styles.dayNumberMuted]}>{day.dayOfMonth}</Text>
                  <View
                    style={[
                      styles.workoutDayIndicator,
                      day.records.length > 0 && day.mood === '😊' && styles.workoutDayIndicatorStrong,
                      day.records.length > 0 && day.mood === '🙂' && styles.workoutDayIndicatorMedium,
                      day.records.length > 0 && day.mood === '🥺' && styles.workoutDayIndicatorLight,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
        </SurfaceCard>

        <SurfaceCard style={styles.reportCard}>
          <View style={styles.inlineHeader}>
            <View>
              <Text style={styles.detailTitle}>AI Workout Report</Text>
              <Text style={styles.detailCaption}>오늘, 최근 7일, 최근 30일 흐름을 코치 시점으로 정리합니다.</Text>
            </View>
            {reportLoading ? <ActivityIndicator size="small" color={palette.sky} /> : null}
          </View>
          <View style={styles.filterRow}>
            <ChoiceChip label="오늘" selected={reportPeriod === 'today'} onPress={() => setReportPeriod('today')} />
            <ChoiceChip label="주간" selected={reportPeriod === 'week'} onPress={() => setReportPeriod('week')} />
            <ChoiceChip label="월간" selected={reportPeriod === 'month'} onPress={() => setReportPeriod('month')} />
          </View>
          <View style={styles.metricsRow}>
            <MetricPill label="운동 수" value={`${reportSourceWorkouts.length}회`} tone="good" />
            <MetricPill label="총 시간" value={formatDurationMinutes(reportSummary.totalMinutes)} />
            <MetricPill label="총 볼륨" value={`${reportSummary.totalVolume}kg`} tone="warm" />
          </View>
          {reportBodyPartStats.length ? (
            <View style={styles.bodyPartStatsWrap}>
              {reportBodyPartStats.slice(0, 6).map((item) => (
                <View key={item.category} style={styles.bodyPartStatCard}>
                  <Text style={styles.bodyPartStatLabel}>{item.label}</Text>
                  <Text style={styles.bodyPartStatValue}>{item.sets ? `${item.sets}세트` : `${item.exerciseCount}회`}</Text>
                  {item.volume ? <Text style={styles.bodyPartStatMeta}>{item.volume}kg</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.reportBody}>
            {reportText || '아직 분석 내용이 없습니다.'}
          </Text>
        </SurfaceCard>

        <EmptyState
          title={workouts.length ? '달력에서 날짜를 눌러 운동 보기' : '운동 기록이 아직 없습니다'}
          body={workouts.length ? '기록 목록은 날짜를 눌렀을 때만 열리도록 정리했어요.' : '운동을 추가하면 날짜별로 달력에서 바로 확인할 수 있어요.'}
          actionLabel="추가하기"
          onAction={openAddMenu}
        />
      </ScreenFrame>

      <ModalSheet
        visible={Boolean(selectedWorkoutDate)}
        title={selectedWorkoutDate ? `${formatLongDate(selectedWorkoutDate)} 운동` : '운동 기록'}
        subtitle="해당 날짜의 운동 기록만 모아서 볼 수 있어요."
        onClose={() => setSelectedWorkoutDate(null)}
      >
        <PrimaryButton label="레포트 보기" onPress={buildSelectedDayReport} icon="bar-chart-2" />
        {selectedDateBodyPartStats.length ? (
          <View style={styles.bodyPartStatsWrap}>
            {selectedDateBodyPartStats.slice(0, 6).map((item) => (
              <View key={item.category} style={styles.bodyPartStatCard}>
                <Text style={styles.bodyPartStatLabel}>{item.label}</Text>
                <Text style={styles.bodyPartStatValue}>{item.sets ? `${item.sets}세트` : `${item.exerciseCount}회`}</Text>
                {item.volume ? <Text style={styles.bodyPartStatMeta}>{item.volume}kg</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
        {selectedDateWorkouts.length ? selectedDateWorkouts.map((record) => (
          <SurfaceCard key={record.id} style={styles.workoutCard}>
            <View style={styles.workoutHeader}>
              <View style={styles.workoutHeading}>
                <Text style={styles.workoutDate}>{formatLongDate(record.date)}</Text>
                <Text style={styles.workoutTitle}>{record.title}</Text>
              </View>
              <View style={styles.headerActions}>
                <View style={[styles.kindBadge, record.kind === 'running' && styles.kindBadgeRunning]}>
                  <Text style={styles.kindBadgeText}>{record.sessionType === 'strength' ? '근력' : record.activityLabel || record.kind}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    setDraft({
                      ...(record as any),
                      id: record.id,
                      sessionType: record.sessionType || (record.kind === 'strength' ? 'strength' : 'cardio'),
                      activityId: record.activityId || '',
                      activityLabel: record.activityLabel || record.title,
                      time: record.time || '',
                      imageUri: record.imageUri || '',
                      caloriesBurned: record.caloriesBurned ? String(record.caloriesBurned) : '',
                      averageHeartRate: record.running?.averageHeartRate ? String(record.running.averageHeartRate) : '',
                      averageCadence: record.running?.averageCadence ? String(record.running.averageCadence) : '',
                      distanceKm: record.running?.distanceKm ? String(record.running.distanceKm) : '',
                      paceMinPerKm: record.running?.paceMinPerKm ? formatPaceInputValue(record.running.paceMinPerKm) : '',
                      badmintonMinutes: record.badminton?.totalTimeMinutes ? String(record.badminton.totalTimeMinutes) : '',
                      durationMinutes: String(record.durationMinutes),
                      strengthExercises: record.strength?.exercises || [],
                    });
                    setComposerVisible(true);
                  }}
                  hitSlop={12}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: 8 })}
                >
                  <Feather name="edit-2" size={18} color={palette.muted} />
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(record.id)}
                  hitSlop={12}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginLeft: 8 })}
                >
                  <Feather name="trash-2" size={18} color={palette.coral} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.workoutNotes}>{record.notes || '기록된 메모가 없습니다.'}</Text>
            <View style={styles.metricWrap}>
              <MetricPill label="운동 시간" value={formatDurationMinutes(record.durationMinutes)} />
              <MetricPill label="칼로리" value={record.caloriesBurned ? `${record.caloriesBurned} kcal` : '-'} />
              {record.sessionType === 'strength' && record.strength ? (
                <>
                  <MetricPill label="운동 개수" value={`${record.strength.exerciseCount}개`} tone="good" />
                  <MetricPill label="총 세트" value={`${record.strength.totalSets}세트`} />
                  <MetricPill label="총 볼륨" value={`${record.strength.totalVolumeKg}kg`} tone="warm" />
                </>
              ) : null}
            </View>
          </SurfaceCard>
        )) : (
          <EmptyState title="기록 없음" body="이 날짜에는 운동 기록이 없어요." />
        )}
      </ModalSheet>

      <ModalSheet
        visible={selectedWorkoutReportVisible}
        title={selectedWorkoutDate ? `${formatLongDate(selectedWorkoutDate)} 일일 레포트` : '일일 레포트'}
        subtitle="그날 운동, 세트, 볼륨, 부위별 통계를 묶어 자세히 확인할 수 있어요."
        onClose={() => setSelectedWorkoutReportVisible(false)}
      >
        {selectedWorkoutReportLoading ? <ActivityIndicator size="small" color={palette.sky} /> : null}
        {selectedDateBodyPartStats.length ? (
          <View style={styles.bodyPartStatsWrap}>
            {selectedDateBodyPartStats.map((item) => (
              <View key={item.category} style={styles.bodyPartStatCard}>
                <Text style={styles.bodyPartStatLabel}>{item.label}</Text>
                <Text style={styles.bodyPartStatValue}>{item.sets ? `${item.sets}세트` : `${item.exerciseCount}회`}</Text>
                {item.volume ? <Text style={styles.bodyPartStatMeta}>{item.volume}kg</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.reportBody}>{selectedWorkoutReportText || '레포트를 불러오는 중입니다.'}</Text>
      </ModalSheet>

      <ModalSheet
        visible={composerVisible}
        title="운동 기록 추가"
        subtitle={isAnalyzing ? "AI가 사진을 통해 운동 내용을 분석 중입니다..." : "어떤 운동을 하셨나요? 먼저 내용을 적고 나중에 상세 수치를 더해보세요."}
        onClose={() => setComposerVisible(false)}
        onSave={saveWorkout}
        saveLabel={isAnalyzing ? "분석 중..." : "저장"}
        saveDisabled={isAnalyzing}
      >
        {isAnalyzing && (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={palette.paper} />
            <View>
              <Text style={styles.analyzingText}>AI가 사진을 분석하고 있어요!</Text>
              <Text style={styles.analyzingSubtext}>거리, 시간 등 운동 기록을 추출 중입니다 🏃‍♂️</Text>
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
                <TextInput style={[styles.dateButtonValue, { padding: 0 }]} value={draft.date} onChangeText={(val: string) => setDraft((c) => ({ ...c, date: val }))} />
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
                <TextInput style={[styles.dateButtonValue, { padding: 0 }]} value={draft.time} onChangeText={(val: string) => setDraft((c) => ({ ...c, time: val }))} />
              )}
            </View>
            <Feather name="clock" size={18} color={palette.ink} />
          </Pressable>
        </View>

        <SurfaceCard style={styles.sessionCard}>
          <Text style={styles.detailTitle}>운동 기록 작성하기</Text>
          <Text style={styles.detailCaption}>유산소는 활동 종류를 고르고, 근력은 운동과 세트를 직접 구성할 수 있어요.</Text>
          <View style={styles.filterRow}>
            <ChoiceChip
              label="유산소 운동"
              selected={draft.sessionType === 'cardio'}
              onPress={() => setDraft((current) => ({ ...current, sessionType: 'cardio', kind: 'running' }))}
            />
            <ChoiceChip
              label="근력 운동"
              selected={draft.sessionType === 'strength'}
              onPress={() => setDraft((current) => ({ ...current, sessionType: 'strength', kind: 'strength' }))}
            />
          </View>

          {draft.sessionType === 'cardio' ? (
            <>
              <View style={styles.inlineHeader}>
                <Text style={styles.inlineTitle}>운동 종류</Text>
                <PrimaryButton label="운동 종류 관리" onPress={() => setActivityManagerVisible(true)} icon="sliders" variant="ghost" />
              </View>
              <View style={styles.filterRow}>
                {activityOptions.map((activity) => (
                  <ChoiceChip
                    key={activity.id}
                    label={activity.label}
                    selected={draft.activityId === activity.id}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        activityId: activity.id,
                        activityLabel: activity.label,
                        kind: activity.kind,
                        title: current.title && current.title !== '근력운동' ? current.title : activity.label,
                      }))
                    }
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.inlineHeader}>
                <Text style={styles.inlineTitle}>근력 운동 선택</Text>
                <PrimaryButton label="운동 추가" onPress={() => setExercisePickerVisible(true)} icon="plus" variant="outline" />
              </View>
              {draft.strengthExercises.length ? (
                <View style={styles.selectedExerciseList}>
                  {draft.strengthExercises.map((exercise) => {
                    const definition = workoutExerciseLibrary.find((item) => item.id === exercise.exerciseId);
                    return (
                      <SurfaceCard key={exercise.exerciseId} style={styles.exerciseCard}>
                        <View style={styles.exerciseCardHeader}>
                          <ExerciseArt category={exercise.category} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.exerciseCardTitle}>{exercise.name}</Text>
                            <Text style={styles.exerciseCardMeta}>{strengthCategoryLabels[exercise.category]}</Text>
                          </View>
                          <Pressable onPress={() => setExerciseInfoId(exercise.exerciseId)} hitSlop={12}>
                            <Feather name="info" size={18} color={palette.sky} />
                          </Pressable>
                          <Pressable onPress={() => toggleExerciseBookmark(exercise.exerciseId)} hitSlop={12}>
                            <Feather name="bookmark" size={18} color={store.bookmarkedExercises.includes(exercise.exerciseId) ? palette.amber : palette.muted} />
                          </Pressable>
                          <Pressable onPress={() => removeStrengthExercise(exercise.exerciseId)} hitSlop={12}>
                            <Feather name="trash-2" size={18} color={palette.coral} />
                          </Pressable>
                        </View>
                        {definition ? <Text style={styles.exerciseInstruction}>{definition.instructions}</Text> : null}
                        <View style={styles.exerciseVolumeRow}>
                          <Text style={styles.exerciseVolumeText}>현재 볼륨 {calculateExerciseVolume(exercise)}kg</Text>
                          {(() => {
                            const latest = sortByDateDesc(store.workouts)
                              .flatMap((workout) =>
                                workout.strength?.exercises
                                  .filter((item) => item.exerciseId === exercise.exerciseId)
                                  .map((item) => ({ workout, item })) || [],
                              )[0];
                            if (!latest) {
                              return <Text style={styles.exerciseVolumeDelta}>첫 기록</Text>;
                            }
                            const delta = calculateExerciseVolume(exercise) - calculateExerciseVolume(latest.item);
                            return (
                              <Text style={[styles.exerciseVolumeDelta, delta >= 0 ? styles.exerciseVolumeDeltaUp : styles.exerciseVolumeDeltaDown]}>
                                최근 대비 {delta >= 0 ? '+' : ''}{delta}kg
                              </Text>
                            );
                          })()}
                        </View>
                        {exercise.sets.map((set, setIndex) => (
                          <View key={set.id} style={styles.setRow}>
                            <Text style={styles.setIndex}>{setIndex + 1}세트</Text>
                            <TextInput
                              value={set.weightKg ? String(set.weightKg) : ''}
                              onChangeText={(value) => updateSetField(exercise.exerciseId, set.id, 'weightKg', value)}
                              placeholder="kg"
                              keyboardType="decimal-pad"
                              style={styles.setInput}
                            />
                            <TextInput
                              value={set.reps ? String(set.reps) : ''}
                              onChangeText={(value) => updateSetField(exercise.exerciseId, set.id, 'reps', value)}
                              placeholder="회"
                              keyboardType="decimal-pad"
                              style={styles.setInput}
                            />
                            <Pressable onPress={() => setRecentExerciseId(exercise.exerciseId)} hitSlop={10}>
                              <Text style={styles.recentLink}>최근</Text>
                            </Pressable>
                            <Pressable onPress={() => removeSet(exercise.exerciseId, set.id)} hitSlop={10}>
                              <Feather name="minus-circle" size={18} color={palette.coral} />
                            </Pressable>
                          </View>
                        ))}
                        <PrimaryButton label="세트 추가" onPress={() => addSet(exercise.exerciseId)} icon="plus" variant="ghost" />
                      </SurfaceCard>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyExerciseText}>운동 추가 버튼을 눌러 루틴을 먼저 골라주세요.</Text>
              )}
            </>
          )}
        </SurfaceCard>

        <FieldInput
          label="운동 이름 (선택)"
          placeholder={`비워두면 '${draft.sessionType === 'strength' ? '근력운동' : draft.activityLabel || kindDefaultTitle[draft.kind]}'으로 저장됩니다`}
          value={draft.title}
          onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
        />
        <FieldInput
          label="메모"
          placeholder="운동 컨디션, 날씨, 자극 부위 등..."
          multiline
          value={draft.notes}
          onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
        />
        <FieldInput
          label="활동 시간 (분)"
          hint={draft.sessionType === 'strength' ? '세트 수에 따라 대략 자동 추정될 수 있습니다.' : '유산소 상세 입력 시 자동 계산될 수 있습니다.'}
          placeholder="45"
          keyboardType="numeric"
          value={draft.durationMinutes}
          onChangeText={(durationMinutes) => setDraft((current) => ({ ...current, durationMinutes }))}
        />
        <FieldInput
          label="칼로리 (선택)"
          placeholder="420"
          keyboardType="numeric"
          value={draft.caloriesBurned}
          onChangeText={(caloriesBurned) => setDraft((current) => ({ ...current, caloriesBurned }))}
        />

        {draft.sessionType === 'cardio' ? (
          <SurfaceCard style={styles.detailCard}>
            <Text style={styles.detailTitle}>유산소 상세</Text>
            <FieldInput
              label="거리 (km)"
              placeholder="6.2"
              keyboardType="decimal-pad"
              value={draft.distanceKm}
              onChangeText={(distanceKm) => setDraft((current) => ({ ...current, distanceKm }))}
            />
            <FieldInput
              label="페이스 (분'/km)"
              placeholder="5'23''"
              value={draft.paceMinPerKm}
              onChangeText={(paceMinPerKm) => setDraft((current) => ({ ...current, paceMinPerKm }))}
            />
            <FieldInput
              label="평균 심박수"
              placeholder="148"
              keyboardType="numeric"
              value={draft.averageHeartRate}
              onChangeText={(averageHeartRate) => setDraft((current) => ({ ...current, averageHeartRate }))}
            />
            <FieldInput
              label="평균 케이던스 (spm)"
              placeholder="172"
              keyboardType="numeric"
              value={draft.averageCadence}
              onChangeText={(averageCadence) => setDraft((current) => ({ ...current, averageCadence }))}
            />
            {(draft.activityLabel || '').includes('배드민턴') ? (
              <FieldInput
                label="배드민턴 경기 시간 (분)"
                placeholder="90"
                keyboardType="numeric"
                value={draft.badmintonMinutes}
                onChangeText={(badmintonMinutes) => setDraft((current) => ({ ...current, badmintonMinutes }))}
              />
            ) : null}
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={styles.detailCard}>
          <Text style={styles.detailTitle}>사진 첨부</Text>
          <View style={styles.engineBanner}>
            <Feather name="cpu" size={16} color={palette.mintDeep} />
            <View style={styles.engineBannerTextWrap}>
              <Text style={styles.engineBannerLabel}>현재 이미지 분석 설정</Text>
              <Text style={styles.engineBannerValue}>{configuredImageAnalysisLabel}</Text>
            </View>
          </View>
          {draft.imageUri ? (
            <Image source={{ uri: draft.imageUri }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <Text style={styles.detailCaption}>
              운동 인증샷이나 결과 화면을 캡처해서 올려보세요.
            </Text>
          )}
          {isAnalyzing ? (
            <View style={styles.analysisStatus}>
              <ActivityIndicator size="small" color={palette.mintDeep} />
              <View style={styles.analysisStatusTextWrap}>
                <Text style={styles.analysisStatusTitle}>AI가 사진을 확인 중입니다</Text>
                <Text style={styles.analysisStatusBody}>운동 종류와 시간, 거리 같은 기록을 추출하고 있습니다.</Text>
              </View>
            </View>
          ) : null}
          {aiSummary ? (
            <View style={styles.aiSummaryBox}>
              <Text style={styles.aiSummaryTitle}>AI 추출 결과</Text>
              {aiSummary.provider ? (
                <Text style={styles.aiSummaryProvider}>
                  추론 중: {aiSummary.modelLabel ?? aiSummary.provider}
                </Text>
              ) : null}
              {aiSummary.empty ? (
                <View style={styles.aiEmptyBox}>
                  <Text style={styles.aiSummaryEmpty}>추출된 운동 수치가 없습니다.</Text>
                  <Text style={styles.aiEmptyHint}>
                    사용 엔진: {aiSummary.modelLabel ?? configuredImageAnalysisLabel}
                  </Text>
                </View>
              ) : (
                <View style={styles.aiSummaryGrid}>
                  <Text style={styles.aiSummaryItem}>종류: {aiSummary.kind ?? '-'}</Text>
                  <Text style={styles.aiSummaryItem}>제목: {aiSummary.title ?? '-'}</Text>
                  <Text style={styles.aiSummaryItem}>시간: {aiSummary.durationMinutes ? `${aiSummary.durationMinutes}분` : '-'}</Text>
                  <Text style={styles.aiSummaryItem}>거리: {aiSummary.distanceKm ? `${aiSummary.distanceKm} km` : '-'}</Text>
                  <Text style={styles.aiSummaryItem}>페이스: {aiSummary.paceMinPerKm ? `${aiSummary.paceMinPerKm} 분/km` : '-'}</Text>
                  <Text style={styles.aiSummaryItem}>평균 심박수: {aiSummary.averageHeartRate ? `${aiSummary.averageHeartRate} bpm` : '-'}</Text>
                  <Text style={styles.aiSummaryItem}>평균 케이던스: {aiSummary.averageCadence ? `${aiSummary.averageCadence} spm` : '-'}</Text>
                </View>
              )}
              {aiSummary.errors?.length ? (
                <View style={styles.aiErrorList}>
                  {aiSummary.errors.map((error) => (
                    <Text key={error} style={styles.aiErrorItem}>
                      {error}
                    </Text>
                  ))}
                </View>
              ) : null}
              {aiSummary.comparisons?.length ? (
                <View style={styles.aiComparisonList}>
                  {aiSummary.comparisons.map((comparison) => (
                    <View key={comparison.provider} style={styles.aiComparisonCard}>
                      <Text style={styles.aiComparisonTitle}>{comparison.modelLabel ?? comparison.provider}</Text>
                      {comparison.error ? (
                        <Text style={styles.aiComparisonError}>{comparison.error}</Text>
                      ) : comparison.empty ? (
                        <Text style={styles.aiComparisonEmpty}>읽은 운동 수치가 없습니다.</Text>
                      ) : (
                        <View style={styles.aiComparisonFields}>
                          {comparison.fields.map((field) => (
                            <Text key={`${comparison.provider}-${field.label}`} style={styles.aiComparisonItem}>
                              {field.label}: {field.value}
                            </Text>
                          ))}
                        </View>
                      )}
                      {comparison.rawText ? (
                        <Text style={styles.aiRawText} numberOfLines={8}>
                          원본 응답: {comparison.rawText}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              {aiSummary.rawText ? (
                <Text style={styles.aiRawText} numberOfLines={8}>
                  원본 응답: {aiSummary.rawText}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.actionRow}>
            <PrimaryButton
              label="앨범에서 선택"
              onPress={addLibraryImage}
              icon="image"
              variant="outline"
              disabled={isAnalyzing}
            />
            <PrimaryButton
              label="카메라 촬영"
              onPress={addCameraImage}
              icon="camera"
              variant="ghost"
              disabled={isAnalyzing}
            />
          </View>
        </SurfaceCard>

      </ModalSheet>

      <ModalSheet
        visible={activityManagerVisible}
        title="유산소 종류 관리"
        subtitle="자주 하는 운동을 직접 추가하고, 필요 없는 항목은 제거할 수 있어요."
        onClose={() => setActivityManagerVisible(false)}
      >
        <View style={styles.activityManagerRow}>
          <TextInput
            value={newActivityLabel}
            onChangeText={setNewActivityLabel}
            placeholder="예: 축구, 농구, 수영"
            style={styles.activityInput}
            placeholderTextColor="#8C978D"
          />
          <PrimaryButton label="추가" onPress={addCustomActivity} icon="plus" />
        </View>
        <View style={styles.selectedExerciseList}>
          {activityOptions.map((activity) => (
            <SurfaceCard key={activity.id} style={styles.activityCard}>
              <View style={styles.exerciseCardHeader}>
                <View>
                  <Text style={styles.exerciseCardTitle}>{activity.label}</Text>
                  <Text style={styles.exerciseCardMeta}>{activity.category}</Text>
                </View>
                <Pressable onPress={() => removeActivity(activity.id)} hitSlop={12}>
                  <Feather name="trash-2" size={18} color={palette.coral} />
                </Pressable>
              </View>
            </SurfaceCard>
          ))}
        </View>
      </ModalSheet>

      <ModalSheet
        visible={exercisePickerVisible}
        title="근력 운동 선택"
        subtitle="카테고리, 북마크, 검색으로 원하는 운동을 빠르게 찾을 수 있어요."
        onClose={() => setExercisePickerVisible(false)}
        footer={
          <PrimaryButton
            label={selectedExerciseIds.length ? `선택한 ${selectedExerciseIds.length}개 운동 추가` : '선택한 운동 추가'}
            onPress={addSelectedExercises}
            icon="check"
            disabled={!selectedExerciseIds.length}
          />
        }
      >
        <SurfaceCard style={styles.selectionDock}>
          <View style={styles.inlineHeader}>
            <Text style={styles.inlineTitle}>선택한 운동 {selectedExerciseIds.length}개</Text>
            <Text style={styles.selectionDockHint}>순서 변경 가능</Text>
          </View>
          <ScrollView style={styles.selectionDockScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={styles.selectionDockList}>
              {selectedExerciseIds.length ? (
                selectedExerciseIds.map((exerciseId, index) => {
                  const exercise = workoutExerciseLibrary.find((item) => item.id === exerciseId);
                  if (!exercise) return null;
                  return (
                    <View key={exerciseId} style={styles.selectionDockItem}>
                      <ExerciseArt category={exercise.category} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.exerciseCardTitle}>{exercise.name}</Text>
                        <Text style={styles.exerciseCardMeta}>{index + 1}번째 순서</Text>
                      </View>
                      <View style={styles.selectionDockActions}>
                        <Pressable onPress={() => moveSelectedExercise(exerciseId, -1)} hitSlop={10}>
                          <Feather name="chevron-up" size={18} color={palette.muted} />
                        </Pressable>
                        <Pressable onPress={() => moveSelectedExercise(exerciseId, 1)} hitSlop={10}>
                          <Feather name="chevron-down" size={18} color={palette.muted} />
                        </Pressable>
                        <Pressable onPress={() => removeSelectedExercise(exerciseId)} hitSlop={10}>
                          <Feather name="x-circle" size={18} color={palette.coral} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyExerciseText}>아직 체크한 운동이 없습니다.</Text>
              )}
            </View>
          </ScrollView>
        </SurfaceCard>
        <FieldInput
          label="운동 검색"
          placeholder="벤치프레스, 스쿼트, 랫풀다운..."
          value={exerciseQuery}
          onChangeText={setExerciseQuery}
        />
        <View style={styles.filterRow}>
          {strengthFilterLabels.map((item) => (
            <ChoiceChip
              key={item.value}
              label={item.label}
              selected={strengthFilter === item.value}
              onPress={() => setStrengthFilter(item.value)}
            />
          ))}
        </View>
        <View style={styles.filterRow}>
          <ChoiceChip label="최근운동순" selected={strengthSort === 'recent'} onPress={() => setStrengthSort('recent')} />
          <ChoiceChip label="가나다 순" selected={strengthSort === 'alpha'} onPress={() => setStrengthSort('alpha')} />
        </View>
        <View style={styles.selectedExerciseList}>
          {strengthLibrary.map((exercise) => (
            <SurfaceCard key={exercise.id} style={styles.exercisePickerCard}>
              <View style={styles.exerciseCardHeader}>
                <ExerciseArt category={exercise.category} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseCardTitle}>{exercise.name}</Text>
                  <Text style={styles.exerciseCardMeta}>{strengthCategoryLabels[exercise.category]}</Text>
                </View>
                <Pressable onPress={() => setExerciseInfoId(exercise.id)} hitSlop={12}>
                  <Feather name="info" size={18} color={palette.sky} />
                </Pressable>
                <Pressable onPress={() => toggleExerciseBookmark(exercise.id)} hitSlop={12}>
                  <Feather name="bookmark" size={18} color={store.bookmarkedExercises.includes(exercise.id) ? palette.amber : palette.muted} />
                </Pressable>
                <Pressable onPress={() => toggleExerciseSelection(exercise.id)} hitSlop={12}>
                  <Feather name={selectedExerciseIds.includes(exercise.id) ? 'check-circle' : 'circle'} size={20} color={selectedExerciseIds.includes(exercise.id) ? palette.mintDeep : palette.sky} />
                </Pressable>
              </View>
              <Text style={styles.exerciseInstruction}>{exercise.instructions}</Text>
            </SurfaceCard>
          ))}
        </View>
      </ModalSheet>

      <ModalSheet
        visible={Boolean(selectedExerciseInfo)}
        title={selectedExerciseInfo?.name || '운동 정보'}
        subtitle="운동 방법을 빠르게 확인할 수 있어요."
        onClose={() => setExerciseInfoId(null)}
      >
        {selectedExerciseInfo ? (
          <SurfaceCard style={styles.exerciseInfoCard}>
            <View style={styles.exerciseInfoHeader}>
              <ExerciseArt category={selectedExerciseInfo.category} />
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseCardTitle}>{selectedExerciseInfo.name}</Text>
                <Text style={styles.exerciseCardMeta}>{strengthCategoryLabels[selectedExerciseInfo.category]}</Text>
              </View>
            </View>
            <Text style={styles.exerciseInstruction}>{selectedExerciseInfo.instructions}</Text>
          </SurfaceCard>
        ) : null}
      </ModalSheet>

      <ModalSheet
        visible={Boolean(recentExerciseRecord)}
        title={recentExerciseRecord?.exercise.name || '최근 기록'}
        subtitle="가장 최근 했던 세트와 볼륨을 참고해 바로 이어서 적을 수 있어요."
        onClose={() => setRecentExerciseId(null)}
      >
        {recentExerciseRecord ? (
          <SurfaceCard style={styles.exerciseInfoCard}>
            <View style={styles.exerciseInfoHeader}>
              <ExerciseArt category={recentExerciseRecord.exercise.category} />
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseCardTitle}>{recentExerciseRecord.exercise.name}</Text>
                <Text style={styles.exerciseCardMeta}>
                  {formatLongDate(recentExerciseRecord.workout.date)} · {recentExerciseRecord.workout.title}
                </Text>
              </View>
            </View>
            <Text style={styles.exerciseInstruction}>
              {recentExerciseRecord.exercise.sets
                .map((set, index) => `${index + 1}세트 ${set.weightKg || 0}kg x ${set.reps || 0}`)
                .join(' · ')}
            </Text>
            <Text style={styles.exerciseVolumeText}>최근 볼륨 {recentExerciseRecord.volume}kg</Text>
          </SurfaceCard>
        ) : null}
      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolbarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reportCard: {
    gap: 14,
    backgroundColor: '#FFF8EF',
    borderColor: '#F1DAB7',
  },
  reportBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 22,
    color: palette.ink,
  },
  bodyPartStatsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bodyPartStatCard: {
    minWidth: 90,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#ECD9BC',
  },
  bodyPartStatLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  bodyPartStatValue: {
    marginTop: 4,
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: palette.ink,
  },
  bodyPartStatMeta: {
    marginTop: 2,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.sky,
  },
  selectionDock: {
    gap: 10,
    backgroundColor: '#FFF8EF',
    borderColor: '#F0D9B8',
  },
  selectionDockHint: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  selectionDockScroll: {
    maxHeight: 210,
  },
  selectionDockList: {
    gap: 8,
  },
  selectionDockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: '#EADFCF',
  },
  selectionDockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarCard: {
    gap: 14,
    backgroundColor: '#F8FCFF',
    borderColor: '#D7E5F2',
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
    borderColor: '#D7E5F2',
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
  workoutDayCell: {
    width: '13.3%',
    minWidth: 0,
    aspectRatio: 0.77,
    borderRadius: 15,
    paddingVertical: 6,
    paddingHorizontal: 3,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: '#E3EBF2',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workoutDayCellActive: {
    backgroundColor: '#EAF4FF',
    borderColor: '#B8D0F5',
  },
  dayCellMuted: {
    opacity: 0.4,
  },
  dayNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: palette.ink,
  },
  dayNumberMuted: {
    color: palette.muted,
  },
  workoutDayIndicator: {
    width: 18,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E1E8EF',
  },
  workoutDayIndicatorStrong: {
    backgroundColor: palette.mintDeep,
  },
  workoutDayIndicatorMedium: {
    backgroundColor: palette.sky,
  },
  workoutDayIndicatorLight: {
    backgroundColor: palette.amber,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  workoutCard: {
    gap: 14,
  },
  strengthSummaryList: {
    gap: 10,
  },
  strengthSummaryCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#F7F9FC',
    borderWidth: 1,
    borderColor: '#DDE6F0',
    gap: 6,
  },
  strengthSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  strengthSummaryTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: palette.ink,
  },
  strengthSummaryCategory: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.sky,
  },
  strengthSummarySets: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteButton: {
    padding: 6,
  },
  workoutHeading: {
    flex: 1,
    gap: 5,
  },
  recordDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordTime: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.sky,
    opacity: 0.8,
  },
  workoutDate: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.mintDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  workoutTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 21,
    color: palette.ink,
  },
  kindBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.mist,
  },
  kindBadgeRunning: {
    backgroundColor: '#EAF2FF',
  },
  kindBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.ink,
    textTransform: 'capitalize',
  },
  workoutNotes: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  metricWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  workoutImage: {
    width: '100%',
    height: 180,
    borderRadius: 20,
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
  detailCard: {
    gap: 14,
  },
  sessionCard: {
    gap: 14,
    backgroundColor: '#FFFDF8',
    borderColor: '#F0E2C8',
  },
  exerciseArtWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  exerciseArtBody: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseArtHead: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#1F2A22',
    marginBottom: 3,
  },
  exerciseArtShoulders: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  exerciseArtTorso: {
    width: 14,
    height: 19,
    borderRadius: 7,
    backgroundColor: '#1F2A22',
    marginBottom: 4,
  },
  exerciseArtArm: {
    width: 4,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#1F2A22',
    marginTop: 2,
  },
  exerciseArtArmLeft: {
    transform: [{ rotate: '20deg' }],
  },
  exerciseArtArmRight: {
    transform: [{ rotate: '-20deg' }],
  },
  exerciseArtLegs: {
    flexDirection: 'row',
    gap: 6,
  },
  exerciseArtLeg: {
    width: 5,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#1F2A22',
  },
  exerciseArtLegLeft: {
    transform: [{ rotate: '8deg' }],
  },
  exerciseArtLegRight: {
    transform: [{ rotate: '-8deg' }],
  },
  exerciseArtIcon: {
    position: 'absolute',
    right: 7,
    top: 7,
  },
  detailTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: palette.ink,
  },
  detailCaption: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  inlineTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: palette.ink,
  },
  selectedExerciseList: {
    gap: 10,
  },
  exerciseCard: {
    gap: 12,
    backgroundColor: '#FFF',
    borderColor: '#E5E0D4',
  },
  exercisePickerCard: {
    gap: 10,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exerciseCardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: palette.ink,
  },
  exerciseCardMeta: {
    marginTop: 3,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.sky,
  },
  exerciseInstruction: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  exerciseVolumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  exerciseVolumeText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.mintDeep,
  },
  exerciseVolumeDelta: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.muted,
  },
  exerciseVolumeDeltaUp: {
    color: palette.mintDeep,
  },
  exerciseVolumeDeltaDown: {
    color: palette.coral,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setIndex: {
    width: 44,
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.ink,
  },
  setInput: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paper,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: palette.ink,
  },
  recentLink: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.sky,
    paddingHorizontal: 4,
  },
  emptyExerciseText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  activityManagerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  activityInput: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.stroke,
    backgroundColor: palette.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: palette.ink,
  },
  activityCard: {
    padding: 14,
  },
  exerciseInfoCard: {
    gap: 12,
  },
  exerciseInfoHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 20,
  },
  engineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    backgroundColor: '#EEF6FF',
    borderWidth: 1,
    borderColor: '#D6E4F7',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  engineBannerTextWrap: {
    flex: 1,
    gap: 2,
  },
  engineBannerLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  engineBannerValue: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.ink,
  },
  analysisStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#EEF8F2',
    borderWidth: 1,
    borderColor: '#D2E8DA',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  analysisStatusTextWrap: {
    flex: 1,
  },
  analysisStatusTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: palette.mintDeep,
  },
  analysisStatusBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: palette.muted,
    marginTop: 2,
    lineHeight: 18,
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
  aiSummaryGrid: {
    gap: 6,
  },
  aiSummaryItem: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: palette.muted,
  },
  aiSummaryEmpty: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: palette.coral,
  },
  aiEmptyBox: {
    gap: 4,
  },
  aiEmptyHint: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  aiErrorList: {
    gap: 4,
  },
  aiErrorItem: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.coral,
  },
  aiComparisonList: {
    gap: 10,
    marginTop: 4,
  },
  aiComparisonCard: {
    gap: 6,
    borderRadius: 16,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.stroke,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  aiComparisonTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.ink,
    textTransform: 'capitalize',
  },
  aiComparisonFields: {
    gap: 4,
  },
  aiComparisonItem: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  aiComparisonEmpty: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.coral,
  },
  aiComparisonError: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.coral,
  },
  aiRawText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: palette.muted,
    lineHeight: 17,
    marginTop: 4,
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
