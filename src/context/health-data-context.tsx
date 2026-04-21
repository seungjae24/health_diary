import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { defaultWorkoutActivities } from '../data/workout-library';
import { getPersistentItem, setPersistentItem } from '../services/storage';
import { AiInsight, AiSettings, GoalRecord, HealthStore, MealRecord, SupplementPlan, UserProfile, WeightRecord, WorkoutActivityDefinition, WorkoutRecord } from '../types';
import { getLatestWeight } from '../utils/analytics';
import { createDefaultStore } from '../utils/sample-data';

const STORAGE_KEY = 'health-tracker-state-v1';
const AI_KEYS_STORAGE_KEY = 'health-tracker-ai-keys-v1';

type AiKeys = { openAiKey: string; geminiKey: string; groqKey: string };

async function loadAiKeys(): Promise<AiKeys> {
  try {
    const raw = Platform.OS === 'web'
      ? await getPersistentItem(AI_KEYS_STORAGE_KEY)
      : await SecureStore.getItemAsync(AI_KEYS_STORAGE_KEY);
    if (!raw) return { openAiKey: '', geminiKey: '', groqKey: '' };
    return JSON.parse(raw) as AiKeys;
  } catch {
    return { openAiKey: '', geminiKey: '', groqKey: '' };
  }
}

async function saveAiKeys(keys: AiKeys): Promise<void> {
  const value = JSON.stringify(keys);
  if (Platform.OS === 'web') {
    return setPersistentItem(AI_KEYS_STORAGE_KEY, value);
  }
  return SecureStore.setItemAsync(AI_KEYS_STORAGE_KEY, value);
}

function stripAiKeys(store: HealthStore): HealthStore {
  return {
    ...store,
    aiSettings: { ...store.aiSettings, openAiKey: '', geminiKey: '', groqKey: '' },
  };
}

type HealthDataContextValue = {
  hydrated: boolean;
  store: HealthStore;
  exportStoreSnapshot: () => HealthStore;
  importStoreSnapshot: (snapshot: HealthStore) => void;
  addMeal: (record: MealRecord) => void;
  deleteMeal: (id: string) => void;
  addWorkout: (record: WorkoutRecord) => void;
  deleteWorkout: (id: string) => void;
  saveWorkoutActivities: (activities: WorkoutActivityDefinition[]) => void;
  toggleExerciseBookmark: (exerciseId: string) => void;
  addWeight: (record: WeightRecord) => void;
  deleteWeight: (date: string) => void;
  addGoal: (record: GoalRecord) => void;
  deleteGoal: (id: string) => void;
  saveSupplements: (plans: SupplementPlan[]) => void;
  toggleSupplementDose: (supplementId: string, date: string, timeSlot: string) => void;
  saveProfile: (profile: UserProfile) => void;
  saveAiSettings: (settings: AiSettings) => void;
  saveInsight: (insight: AiInsight) => void;
};

const HealthDataContext = createContext<HealthDataContextValue | undefined>(undefined);

function withEnvironmentDefaults(store: HealthStore): HealthStore {
  return {
    ...store,
    meals: store.meals || [],
    workouts: store.workouts || [],
    workoutActivities: store.workoutActivities?.length ? store.workoutActivities : defaultWorkoutActivities,
    bookmarkedExercises: store.bookmarkedExercises || [],
    weights: store.weights || [],
    goals: store.goals || [],
    supplements: store.supplements || [],
    supplementLogs: store.supplementLogs || [],
    insights: store.insights || [],
    profile: {
      sex: store.profile?.sex || '',
      heightCm: store.profile?.heightCm || '',
      birthDate: store.profile?.birthDate || '',
      dietPhase: store.profile?.dietPhase || 'lean',
    },
    aiSettings: {
      ...store.aiSettings,
      imageAnalysisProvider:
        store.aiSettings.imageAnalysisProvider ||
        'groq',
      openAiKey:
        store.aiSettings.openAiKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
      geminiKey:
        store.aiSettings.geminiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
      groqKey:
        store.aiSettings.groqKey || process.env.EXPO_PUBLIC_GROQ_API_KEY || '',
      openAiModel:
        store.aiSettings.openAiModel ||
        process.env.EXPO_PUBLIC_OPENAI_MODEL ||
        'gpt-5-mini',
      geminiModel:
        store.aiSettings.geminiModel ||
        process.env.EXPO_PUBLIC_GEMINI_MODEL ||
        'gemini-2.5-flash',
      groqModel:
        store.aiSettings.groqModel ||
        process.env.EXPO_PUBLIC_GROQ_MODEL ||
        'meta-llama/llama-4-scout-17b-16e-instruct',
    },
  };
}

export function HealthDataProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<HealthStore>(() => withEnvironmentDefaults(createDefaultStore()));
  const [hydrated, setHydrated] = useState(false);
  const [hydrationError, setHydrationError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        const [raw, aiKeys] = await Promise.all([
          getPersistentItem(STORAGE_KEY),
          loadAiKeys(),
        ]);

        if (!raw) {
          if (mounted) {
            setStore((current) => withEnvironmentDefaults({
              ...current,
              aiSettings: { ...current.aiSettings, ...aiKeys },
            }));
            setHydrated(true);
          }
          return;
        }

        const parsed = JSON.parse(raw) as HealthStore;

        if (mounted) {
          setStore(withEnvironmentDefaults({
            ...parsed,
            aiSettings: { ...parsed.aiSettings, ...aiKeys },
          }));
          setHydrated(true);
        }
      } catch (error) {
        console.error('Hydration failed:', error);
        if (mounted) {
          // If hydration fails (e.g. malformed JSON or SecureStore issue), 
          // do NOT overwrite the local state immediately unless we want to reset.
          // Setting hydrated = true means the next useEffect will save this Default store, 
          // wiping their previous data. We should just set hydrated to let them use the app, 
          // but we MUST NOT save unless they explicitly wipe it.
          setHydrationError(true);
          setHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || hydrationError) {
      return;
    }

    const { openAiKey, geminiKey, groqKey } = store.aiSettings;
    saveAiKeys({ openAiKey, geminiKey, groqKey }).catch(() => undefined);
    setPersistentItem(STORAGE_KEY, JSON.stringify(stripAiKeys(store))).catch((error) => {
      if (__DEV__) {
        console.error('Failed to persist health store:', error);
      }
    });
  }, [hydrated, store]);

  const value: HealthDataContextValue = {
    hydrated,
    store,
    exportStoreSnapshot: () => stripAiKeys(store),
    importStoreSnapshot: (snapshot) => {
      setStore((current) => withEnvironmentDefaults({
        ...snapshot,
        aiSettings: {
          ...snapshot.aiSettings,
          openAiKey: current.aiSettings.openAiKey,
          geminiKey: current.aiSettings.geminiKey,
          groqKey: current.aiSettings.groqKey,
        },
      }));
    },
    addMeal: (record) => {
      setStore((current) => {
        const exists = current.meals.some(m => m.id === record.id);
        if (exists) {
          return { ...current, meals: current.meals.map(m => m.id === record.id ? record : m) };
        }
        return { ...current, meals: [record, ...current.meals] };
      });
    },
    deleteMeal: (id) => {
      setStore((current) => ({ ...current, meals: current.meals.filter((m) => m.id !== id) }));
    },
    addWorkout: (record) => {
      setStore((current) => {
        const exists = current.workouts.some(w => w.id === record.id);
        if (exists) {
          return { ...current, workouts: current.workouts.map(w => w.id === record.id ? record : w) };
        }
        return { ...current, workouts: [record, ...current.workouts] };
      });
    },
    deleteWorkout: (id) => {
      setStore((current) => ({
        ...current,
        workouts: current.workouts.filter((w) => w.id !== id),
      }));
    },
    saveWorkoutActivities: (activities) => {
      setStore((current) => ({ ...current, workoutActivities: activities }));
    },
    toggleExerciseBookmark: (exerciseId) => {
      setStore((current) => ({
        ...current,
        bookmarkedExercises: current.bookmarkedExercises.includes(exerciseId)
          ? current.bookmarkedExercises.filter((id) => id !== exerciseId)
          : [exerciseId, ...current.bookmarkedExercises],
      }));
    },
    addWeight: (record) => {
      setStore((current) => {
        const exists = current.weights.some(w => w.id === record.id);
        if (exists) {
          return { ...current, weights: current.weights.map(w => w.id === record.id ? record : w) };
        }
        return { ...current, weights: [record, ...current.weights] };
      });
    },
    deleteWeight: (id) => {
      setStore((current) => ({
        ...current,
        weights: current.weights.filter((w) => w.id !== id),
      }));
    },
    addGoal: (record) => {
      setStore((current) => {
        const normalizedRecord = {
          ...record,
          baselineValue:
            record.category === 'weight-target'
              ? record.baselineValue ?? getLatestWeight(current.weights)?.valueKg
              : record.baselineValue,
        };
        const exists = current.goals.some((goal) => goal.id === record.id);

        if (exists) {
          return {
            ...current,
            goals: current.goals.map((goal) => goal.id === record.id ? normalizedRecord : goal),
          };
        }

        return {
          ...current,
          goals: [normalizedRecord, ...current.goals],
        };
      });
    },
    deleteGoal: (id) => {
      setStore((current) => ({
        ...current,
        goals: current.goals.filter((goal) => goal.id !== id),
      }));
    },
    saveSupplements: (plans) => {
      setStore((current) => ({ ...current, supplements: plans }));
    },
    toggleSupplementDose: (supplementId, date, timeSlot) => {
      setStore((current) => {
        const existing = current.supplementLogs.find(
          (log) =>
            log.supplementId === supplementId &&
            log.date === date &&
            log.timeSlot === timeSlot,
        );

        if (existing) {
          return {
            ...current,
            supplementLogs: current.supplementLogs.filter((log) => log.id !== existing.id),
          };
        }

        return {
          ...current,
          supplementLogs: [
            ...current.supplementLogs,
            {
              id: `supp-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              supplementId,
              date,
              timeSlot,
              takenAt: new Date().toISOString(),
            },
          ],
        };
      });
    },
    saveProfile: (profile) => {
      setStore((current) => ({ ...current, profile }));
    },
    saveAiSettings: (settings) => {
      setStore((current) => ({ ...current, aiSettings: settings }));
    },
    saveInsight: (insight) => {
      setStore((current) => ({
        ...current,
        insights: [insight, ...current.insights].slice(0, 8),
      }));
    },
  };

  return <HealthDataContext.Provider value={value}>{children}</HealthDataContext.Provider>;
}

export function useHealthData() {
  const context = useContext(HealthDataContext);

  if (!context) {
    throw new Error('useHealthData must be used within HealthDataProvider');
  }

  return context;
}
