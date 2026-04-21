export type MealRecord = {
  id: string;
  date: string;
  time?: string;
  title: string;
  notes: string;
  imageUri?: string;
  nutrition?: NutritionInfo;
  presetItems?: MealPresetEntry[];
};

export type NutritionInfo = {
  calories?: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
  fiberG?: number;
  source?: 'ai' | 'local' | 'manual' | 'search';
};

export type MealPreset = {
  id: string;
  name: string;
  servingLabel: string;
  nutrition: NutritionInfo;
};

export type MealPresetEntry = {
  presetId: string;
  name: string;
  servingLabel: string;
  servings: number;
  nutrition: NutritionInfo;
};

export type WorkoutKind =
  | 'running'
  | 'badminton'
  | 'strength'
  | 'mobility'
  | 'other';

export type WorkoutSessionType = 'cardio' | 'strength';
export type WorkoutActivityCategory = 'cardio' | 'sport' | 'mobility' | 'other';
export type StrengthExerciseCategory =
  | 'lower'
  | 'chest'
  | 'back'
  | 'shoulder'
  | 'arms'
  | 'core'
  | 'other'
  | 'cardio';

export type WorkoutActivityDefinition = {
  id: string;
  label: string;
  sessionType: WorkoutSessionType;
  kind: WorkoutKind;
  category: WorkoutActivityCategory;
  removable?: boolean;
};

export type StrengthSetEntry = {
  id: string;
  weightKg?: number;
  reps?: number;
};

export type StrengthExerciseEntry = {
  exerciseId: string;
  name: string;
  category: StrengthExerciseCategory;
  note?: string;
  sets: StrengthSetEntry[];
};

export type WorkoutRoutine = {
  id: string;
  name: string;
  exercises: StrengthExerciseEntry[];
  updatedAt: string;
};

export type WorkoutRecord = {
  id: string;
  date: string;
  time?: string;
  kind: WorkoutKind;
  sessionType?: WorkoutSessionType;
  activityId?: string;
  activityLabel?: string;
  title: string;
  notes: string;
  durationMinutes: number;
  imageUri?: string;
  caloriesBurned?: number;
  running?: {
    distanceKm: number;
    paceMinPerKm: number;
    averageHeartRate?: number;
    averageCadence?: number;
  };
  badminton?: {
    totalTimeMinutes: number;
  };
  cardio?: {
    distanceKm?: number;
    paceMinPerKm?: number;
    averageHeartRate?: number;
    averageCadence?: number;
    caloriesBurned?: number;
  };
  strength?: {
    exercises: StrengthExerciseEntry[];
    totalVolumeKg: number;
    totalSets: number;
    exerciseCount: number;
    caloriesBurned?: number;
  };
};

export type WeightRecord = {
  id: string;
  date: string;
  time?: string;
  valueKg: number;
  imageUri?: string;
  note?: string;
  bmi?: number;
  bodyFatPercentage?: number;
  skeletalMuscleMassKg?: number;
  bodyWaterKg?: number;
  bodyFatMassKg?: number;
};

export type GoalCategory =
  | 'weight-target'
  | 'run-distance'
  | 'badminton-time'
  | 'workout-streak'
  | 'meal-consistency';

export type GoalRecord = {
  id: string;
  createdAt: string;
  dueDate: string;
  title: string;
  note: string;
  category: GoalCategory;
  targetValue: number;
  unit: string;
  baselineValue?: number;
};

export type AiProvider = 'openai' | 'gemini';
export type ImageAnalysisProvider = AiProvider | 'groq' | 'compare';
export type InsightSource = AiProvider | 'local';

export type AiSettings = {
  provider: AiProvider;
  imageAnalysisProvider: ImageAnalysisProvider;
  openAiKey: string;
  geminiKey: string;
  groqKey: string;
  openAiModel: string;
  geminiModel: string;
  groqModel: string;
};

export type AiInsight = {
  id: string;
  generatedAt: string;
  source: InsightSource;
  summary: string;
  trajectory: string;
  actionItems: string[];
  goalWatch: string[];
  nutritionFocus: string;
  trainingFocus: string;
};

export type UserProfile = {
  sex: 'male' | 'female' | 'other' | '';
  heightCm: string;
  birthDate: string;
  activityLevel: string;
  dietPhase: DietPhase;
};

export type DietPhase = 'lean' | 'lean-mass-up' | 'bulk-up';

export type SupplementPlan = {
  id: string;
  name: string;
  dosage: string;
  times: string[];
  note?: string;
  color: 'mint' | 'sky' | 'coral' | 'amber';
};

export type SupplementLog = {
  id: string;
  supplementId: string;
  date: string;
  timeSlot: string;
  takenAt?: string;
};

export type HealthStore = {
  meals: MealRecord[];
  mealPresets: MealPreset[];
  workoutRoutines: WorkoutRoutine[];
  workouts: WorkoutRecord[];
  workoutActivities: WorkoutActivityDefinition[];
  bookmarkedExercises: string[];
  weights: WeightRecord[];
  goals: GoalRecord[];
  supplements: SupplementPlan[];
  supplementLogs: SupplementLog[];
  profile: UserProfile;
  aiSettings: AiSettings;
  insights: AiInsight[];
};
