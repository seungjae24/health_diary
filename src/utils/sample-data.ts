import { AiSettings, HealthStore } from '../types';
import { defaultWorkoutActivities } from '../data/workout-library';

function createDefaultSettings(): AiSettings {
  return {
    provider: 'openai',
    imageAnalysisProvider: 'groq',
    openAiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
    geminiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '',
    groqKey: process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '',
    openAiModel: process.env.EXPO_PUBLIC_OPENAI_MODEL ?? 'gpt-5-mini',
    geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL ?? 'gemini-2.5-flash',
    groqModel:
      process.env.EXPO_PUBLIC_GROQ_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct',
  };
}

export function createDefaultStore(): HealthStore {
  return {
    meals: [],
    workouts: [],
    workoutActivities: defaultWorkoutActivities,
    bookmarkedExercises: [],
    weights: [],
    goals: [],
    supplements: [],
    supplementLogs: [],
    profile: {
      sex: '',
      heightCm: '',
      birthDate: '',
      dietPhase: 'lean',
    },
    aiSettings: createDefaultSettings(),
    insights: [],
  };
}
