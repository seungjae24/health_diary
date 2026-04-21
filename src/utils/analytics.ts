import {
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';

import { GoalRecord, HealthStore, MealRecord, WeightRecord, WorkoutKind } from '../types';
import {
  formatDistanceKm,
  formatDurationMinutes,
  formatPace,
  formatWeight,
  sortByDateDesc,
  todayDateKey,
} from './format';

type GoalProgress = {
  ratio: number;
  currentLabel: string;
  targetLabel: string;
  statusText: string;
};

export type WeightCalendarDay = {
  key: string;
  dayOfMonth: string;
  inMonth: boolean;
  record?: WeightRecord;
};

export type MealCalendarDay = {
  key: string;
  dayOfMonth: string;
  inMonth: boolean;
  records: MealRecord[];
};

export type WorkoutCalendarDay = {
  key: string;
  dayOfMonth: string;
  inMonth: boolean;
  records: HealthStore['workouts'];
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getLatestWeight(weights: WeightRecord[]) {
  return sortByDateDesc(weights)[0];
}

export function getWeightChange(weights: WeightRecord[], days = 14) {
  const windowStart = subDays(new Date(), days);
  const records = [...weights]
    .filter((record) => parseISO(record.date) >= windowStart)
    .sort((left, right) => left.date.localeCompare(right.date));

  if (records.length < 2) {
    return null;
  }

  return records[records.length - 1].valueKg - records[0].valueKg;
}

export function getWorkoutMinutes(workouts: HealthStore['workouts'], days = 7) {
  const windowStart = subDays(new Date(), days);
  return workouts
    .filter((record) => parseISO(record.date) >= windowStart)
    .reduce((total, record) => total + record.durationMinutes, 0);
}

export function getWorkoutCount(
  workouts: HealthStore['workouts'],
  days = 7,
  kind?: WorkoutKind,
) {
  const windowStart = subDays(new Date(), days);
  return workouts.filter(
    (record) =>
      parseISO(record.date) >= windowStart && (!kind || record.kind === kind),
  ).length;
}

export function getMealPhotoRate(meals: HealthStore['meals'], days = 7) {
  const windowStart = subDays(new Date(), days);
  const windowMeals = meals.filter((record) => parseISO(record.date) >= windowStart);

  if (windowMeals.length === 0) {
    return 0;
  }

  const photoMeals = windowMeals.filter((record) => Boolean(record.imageUri)).length;
  return Math.round((photoMeals / windowMeals.length) * 100);
}

export function getWorkoutStreak(workouts: HealthStore['workouts']) {
  if (workouts.length === 0) {
    return 0;
  }

  const workoutDates = new Set(workouts.map((record) => record.date));
  const today = parseISO(todayDateKey());
  let cursor = today;

  if (!workoutDates.has(format(today, 'yyyy-MM-dd'))) {
    cursor = subDays(today, 1);
  }

  const latestWorkout = sortByDateDesc(workouts)[0];
  if (differenceInCalendarDays(new Date(), parseISO(latestWorkout.date)) > 1) {
    return 0;
  }

  let streak = 0;

  while (workoutDates.has(format(cursor, 'yyyy-MM-dd'))) {
    streak += 1;
    cursor = subDays(cursor, 1);
  }

  return streak;
}

export function getBestRunningDistance(workouts: HealthStore['workouts']) {
  return workouts
    .filter((record) => record.kind === 'running' && record.running)
    .reduce((best, record) => {
      if (!record.running) {
        return best;
      }

      return Math.max(best, record.running.distanceKm);
    }, 0);
}

export function getBestBadmintonTime(workouts: HealthStore['workouts']) {
  return workouts
    .filter((record) => record.kind === 'badminton' && record.badminton)
    .reduce((best, record) => {
      if (!record.badminton) {
        return best;
      }

      return Math.max(best, record.badminton.totalTimeMinutes);
    }, 0);
}

export function getGoalProgress(goal: GoalRecord, store: HealthStore): GoalProgress {
  if (goal.category === 'weight-target') {
    const latest = getLatestWeight(store.weights);

    if (!latest) {
      return {
        ratio: 0,
        currentLabel: 'No weigh-ins yet',
        targetLabel: `${goal.targetValue.toFixed(1)} ${goal.unit}`,
        statusText: 'Add a weigh-in to start tracking this goal.',
      };
    }

    const baseline = goal.baselineValue ?? latest.valueKg;
    const direction = goal.targetValue < baseline ? -1 : 1;
    const covered = direction === -1 ? baseline - latest.valueKg : latest.valueKg - baseline;
    const targetDistance =
      direction === -1 ? baseline - goal.targetValue : goal.targetValue - baseline;
    const ratio = targetDistance === 0 ? 1 : clamp(covered / targetDistance);

    return {
      ratio,
      currentLabel: formatWeight(latest.valueKg),
      targetLabel: `${goal.targetValue.toFixed(1)} ${goal.unit}`,
      statusText: `${Math.abs(latest.valueKg - goal.targetValue).toFixed(1)} kg away`,
    };
  }

  if (goal.category === 'run-distance') {
    const current = getBestRunningDistance(store.workouts);
    return {
      ratio: clamp(current / goal.targetValue),
      currentLabel: current ? formatDistanceKm(current) : 'No run logged yet',
      targetLabel: `${goal.targetValue.toFixed(1)} ${goal.unit}`,
      statusText: current
        ? `Best run so far: ${formatDistanceKm(current)}`
        : 'Log a run to start measuring progress.',
    };
  }

  if (goal.category === 'badminton-time') {
    const current = getBestBadmintonTime(store.workouts);
    return {
      ratio: clamp(current / goal.targetValue),
      currentLabel: current ? formatDurationMinutes(current) : 'No badminton session yet',
      targetLabel: `${goal.targetValue} ${goal.unit}`,
      statusText: current
        ? `Longest session: ${formatDurationMinutes(current)}`
        : 'Track a badminton session to unlock progress.',
    };
  }

  if (goal.category === 'workout-streak') {
    const current = getWorkoutStreak(store.workouts);
    return {
      ratio: clamp(current / goal.targetValue),
      currentLabel: `${current} days`,
      targetLabel: `${goal.targetValue} days`,
      statusText: current
        ? `Current streak is ${current} days`
        : 'A new streak starts with today’s workout.',
    };
  }

  const current = store.meals.filter(
    (record) => parseISO(record.date) >= subDays(new Date(), 7),
  ).length;
  return {
    ratio: clamp(current / goal.targetValue),
    currentLabel: `${current} entries`,
    targetLabel: `${goal.targetValue} ${goal.unit}`,
    statusText:
      current >= goal.targetValue
        ? 'Weekly logging target reached.'
        : `${goal.targetValue - current} more meal logs to reach target.`,
  };
}

export function buildWeightCalendar(
  focusDate: Date,
  weights: HealthStore['weights'],
): WeightCalendarDay[] {
  const weightMap = new Map(weights.map((record) => [record.date, record]));
  const start = startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 });

  return eachDayOfInterval({ start, end }).map((day) => {
    const key = format(day, 'yyyy-MM-dd');
    return {
      key,
      dayOfMonth: format(day, 'd'),
      inMonth: isSameMonth(day, focusDate),
      record: weightMap.get(key),
    };
  });
}

export function buildMealCalendar(
  focusDate: Date,
  meals: HealthStore['meals'],
): MealCalendarDay[] {
  const mealMap = meals.reduce<Map<string, MealRecord[]>>((map, record) => {
    const existing = map.get(record.date) ?? [];
    existing.push(record);
    map.set(record.date, existing);
    return map;
  }, new Map());
  const start = startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 });

  return eachDayOfInterval({ start, end }).map((day) => {
    const key = format(day, 'yyyy-MM-dd');
    return {
      key,
      dayOfMonth: format(day, 'd'),
      inMonth: isSameMonth(day, focusDate),
      records: mealMap.get(key) ?? [],
    };
  });
}

export function buildWorkoutCalendar(
  focusDate: Date,
  workouts: HealthStore['workouts'],
): WorkoutCalendarDay[] {
  const workoutMap = workouts.reduce<Map<string, HealthStore['workouts']>>((map, record) => {
    const existing = map.get(record.date) ?? [];
    existing.push(record);
    map.set(record.date, existing);
    return map;
  }, new Map());
  const start = startOfWeek(startOfMonth(focusDate), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(focusDate), { weekStartsOn: 0 });

  return eachDayOfInterval({ start, end }).map((day) => {
    const key = format(day, 'yyyy-MM-dd');
    return {
      key,
      dayOfMonth: format(day, 'd'),
      inMonth: isSameMonth(day, focusDate),
      records: workoutMap.get(key) ?? [],
    };
  });
}

export function createAnalysisSnapshot(store: HealthStore) {
  const latestWeight = getLatestWeight(store.weights);
  const weightChange14 = getWeightChange(store.weights, 14);
  const weeklyMinutes = getWorkoutMinutes(store.workouts, 7);
  const runningSessions = getWorkoutCount(store.workouts, 14, 'running');
  const badmintonSessions = getWorkoutCount(store.workouts, 14, 'badminton');

  return {
    latestWeight: latestWeight ? formatWeight(latestWeight.valueKg) : 'No data',
    weightChange14:
      weightChange14 === null
        ? 'Not enough data'
        : `${weightChange14 > 0 ? '+' : ''}${weightChange14.toFixed(1)} kg`,
    weeklyMinutes: formatDurationMinutes(weeklyMinutes),
    runningSessions,
    badmintonSessions,
    workoutStreak: getWorkoutStreak(store.workouts),
    mealLogsLast7Days: store.meals.filter(
      (record) => parseISO(record.date) >= subDays(new Date(), 7),
    ).length,
  };
}

export function describeWorkout(record: HealthStore['workouts'][number]) {
  if (record.sessionType === 'strength' && record.strength) {
    return `${record.title}: ${formatDurationMinutes(record.durationMinutes)} 동안 ${record.strength.exerciseCount}개 운동, ${record.strength.totalSets}세트, 총 볼륨 ${record.strength.totalVolumeKg}kg.`;
  }

  if (record.kind === 'running' && record.running) {
    return `${record.title}: ${formatDistanceKm(record.running.distanceKm)} at ${formatPace(record.running.paceMinPerKm)} for ${formatDurationMinutes(record.durationMinutes)}. Avg HR ${record.running.averageHeartRate ?? 'n/a'} bpm.`;
  }

  if (record.kind === 'badminton' && record.badminton) {
    return `${record.title}: ${formatDurationMinutes(record.badminton.totalTimeMinutes)} of badminton. ${record.notes}`;
  }

  if (record.sessionType === 'cardio' && record.activityLabel) {
    return `${record.activityLabel}: ${formatDurationMinutes(record.durationMinutes)}. ${record.notes}`;
  }

  return `${record.title}: ${formatDurationMinutes(record.durationMinutes)}. ${record.notes}`;
}
