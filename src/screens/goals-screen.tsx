import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenFrame } from '../components/screen-frame';
import {
  ChoiceChip,
  EmptyState,
  FieldInput,
  ModalSheet,
  PrimaryButton,
  ProgressBar,
  SurfaceCard,
} from '../components/ui';
import { useHealthData } from '../context/health-data-context';
import { generateCoachInsight } from '../services/ai';
import { fontFamily, palette } from '../theme';
import { GoalCategory } from '../types';
import { getGoalProgress } from '../utils/analytics';
import {
  formatLongDate,
  formatRelativeDue,
  makeId,
  shiftDateKey,
  sortByDateDesc,
  todayDateKey,
} from '../utils/format';
import { confirmAction } from '../utils/ui';

const categoryConfig: Record<
  GoalCategory,
  { label: string; unit: string; placeholder: string }
> = {
  'weight-target': { label: '체중', unit: 'kg', placeholder: '74.0' },
  'run-distance': { label: '러닝', unit: 'km', placeholder: '5' },
  'badminton-time': { label: '배드민턴', unit: 'min', placeholder: '90' },
  'workout-streak': { label: '연속 운동', unit: '일', placeholder: '7' },
  'meal-consistency': { label: '식단 기록', unit: '회', placeholder: '12' },
};

function createGoalDraft(category: GoalCategory = 'weight-target') {
  return {
    category,
    title: '',
    note: '',
    dueDate: shiftDateKey(todayDateKey(), 60),
    targetValue: '',
    unit: categoryConfig[category].unit,
  };
}

export function GoalsScreen() {
  const { store, addGoal, deleteGoal, saveInsight } = useHealthData();
  const [query, setQuery] = useState('');
  const [composerVisible, setComposerVisible] = useState(false);
  const [draft, setDraft] = useState(createGoalDraft());
  const [analyzing, setAnalyzing] = useState(false);

  const goals = sortByDateDesc(store.goals.map((goal) => ({ ...goal, date: goal.dueDate }))).filter(
    (goal) => `${goal.title} ${goal.note} ${goal.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const lastInsight = store.insights[0];
  const activeCoachModel =
    store.aiSettings.provider === 'openai'
      ? `OpenAI · ${store.aiSettings.openAiModel || 'gpt-5-mini'}`
      : `Gemini · ${store.aiSettings.geminiModel || 'gemini-2.5-flash'}`;

  function openComposer() {
    setDraft(createGoalDraft());
    setComposerVisible(true);
  }

  function openEditor(goal: any) {
    setDraft({
      id: goal.id,
      category: goal.category,
      title: goal.title,
      note: goal.note,
      dueDate: goal.dueDate,
      targetValue: String(goal.targetValue),
      unit: goal.unit,
      createdAt: goal.createdAt,
      baselineValue: goal.baselineValue,
    } as any);
    setComposerVisible(true);
  }

  function confirmDelete(id: string) {
    confirmAction(
      '목표 삭제',
      '이 목표를 정말 삭제할까요? 삭제 후에는 복구할 수 없습니다.',
      () => deleteGoal(id),
    );
  }

  function chooseDueDate() {
    DateTimePickerAndroid.open({
      value: new Date(`${draft.dueDate}T12:00:00`),
      mode: 'date',
      onChange: (_, selectedDate) => {
        if (!selectedDate) {
          return;
        }

        setDraft((current) => ({
          ...current,
          dueDate: selectedDate.toISOString().slice(0, 10),
        }));
      },
    });
  }

  function saveGoalDraft() {
    if (!draft.title.trim()) {
      Alert.alert('목표 이름을 입력해 주세요', '어떤 목표인지 알아보기 쉽게 이름을 정해 주세요.');
      return;
    }

    const targetValue = Number(draft.targetValue);
    if (!targetValue) {
      Alert.alert('수치를 입력해 주세요', '목표 달성을 위한 숫자 기준이 필요합니다.');
      return;
    }

    addGoal({
      id: (draft as any).id || makeId('goal'),
      createdAt: (draft as any).createdAt || todayDateKey(),
      dueDate: draft.dueDate,
      title: draft.title.trim(),
      note: draft.note.trim(),
      category: draft.category,
      targetValue,
      unit: draft.unit,
      baselineValue: (draft as any).baselineValue,
    });
    setComposerVisible(false);
  }

  async function runAnalysis() {
    try {
      setAnalyzing(true);
      const insight = await generateCoachInsight(store.aiSettings, store);
      saveInsight(insight);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The coach analysis could not be generated.';
      Alert.alert('Analysis failed', message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
      <ScreenFrame
        title="Goals"
        subtitle="달성하고 싶은 목표를 설정하세요. AI 코치가 기록을 분석해 조언을 드립니다."
        accent={palette.amber}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="목표 검색..."
        actionLabel="목표 추가"
        onAction={openComposer}
      >
        <SurfaceCard style={styles.coachCard}>
          <View style={styles.coachHeader}>
            <View style={styles.coachHeading}>
              <Text style={styles.coachEyebrow}>AI 코치</Text>
              <Text style={styles.coachTitle}>
                {lastInsight ? '새로운 조언이 준비되었습니다' : '아직 분석이 진행되지 않았습니다'}
              </Text>
            </View>
            <View
              style={[
                styles.providerBadge,
                lastInsight?.source === 'gemini' && styles.providerBadgeGemini,
                lastInsight?.source === 'local' && styles.providerBadgeLocal,
              ]}
            >
              <Text style={styles.providerBadgeText}>
                {lastInsight
                  ? lastInsight.source === 'openai'
                    ? 'OpenAI'
                    : lastInsight.source === 'gemini'
                      ? 'Gemini'
                      : '로컬 분석'
                  : store.aiSettings.provider === 'openai'
                    ? 'OpenAI'
                    : 'Gemini'}
              </Text>
            </View>
          </View>

          {analyzing ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={palette.mintDeep} />
              <View style={styles.loadingTextWrap}>
                <Text style={styles.loadingText}>기록과 목표를 분석 중입니다...</Text>
                <Text style={styles.loadingModelText}>추론 모델: {activeCoachModel}</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.modelHint}>현재 추론 모델: {activeCoachModel}</Text>
              <Text style={styles.coachSummary}>
                {lastInsight?.summary ??
                  '분석을 시작하면 식단 꾸준함, 운동량, 목표 달성 가능성 등에 대한 코칭 피드백을 받을 수 있습니다.'}
              </Text>
              {lastInsight ? (
                <>
                  <Text style={styles.trajectoryText}>{lastInsight.trajectory}</Text>
                  <View style={styles.insightSection}>
                    <Text style={styles.insightLabel}>다음 추천 행동</Text>
                    {lastInsight.actionItems.map((item) => (
                      <Text key={item} style={styles.listItem}>
                        • {item}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.insightSection}>
                    <Text style={styles.insightLabel}>집중 관리 목표</Text>
                    {lastInsight.goalWatch.map((item) => (
                      <Text key={item} style={styles.listItem}>
                        • {item}
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.focusText}>영양 관리: {lastInsight.nutritionFocus}</Text>
                  <Text style={styles.focusText}>운동 관리: {lastInsight.trainingFocus}</Text>
                </>
              ) : null}
            </>
          )}

          <View style={styles.coachActions}>
            <PrimaryButton
              label={analyzing ? '분석 중...' : '목표 분석 시작'}
              onPress={runAnalysis}
              icon="zap"
            />
          </View>
        </SurfaceCard>

        {goals.length ? (
          goals.map((goal) => {
            const progress = getGoalProgress(goal, store);
            return (
              <SurfaceCard key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <View style={styles.goalHeaderText}>
                    <Text style={styles.goalDue}>{formatLongDate(goal.dueDate)}</Text>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                  </View>
                  <View style={styles.goalActions}>
                    <Text style={styles.goalRelative}>{formatRelativeDue(goal.dueDate)}</Text>
                    <View style={styles.goalIconRow}>
                      <Pressable
                        onPress={() => openEditor(goal)}
                        hitSlop={12}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                      >
                        <Feather name="edit-2" size={18} color={palette.muted} />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDelete(goal.id)}
                        hitSlop={12}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                      >
                        <Feather name="trash-2" size={18} color={palette.coral} />
                      </Pressable>
                    </View>
                  </View>
                </View>

                <Text style={styles.goalNote}>{goal.note || 'No note added yet.'}</Text>

                <View style={styles.goalMetricRow}>
                  <View style={styles.goalMetric}>
                    <Text style={styles.goalMetricLabel}>현재</Text>
                    <Text style={styles.goalMetricValue}>{progress.currentLabel}</Text>
                  </View>
                  <View style={styles.goalMetric}>
                    <Text style={styles.goalMetricLabel}>목표</Text>
                    <Text style={styles.goalMetricValue}>{progress.targetLabel}</Text>
                  </View>
                </View>

                <ProgressBar value={progress.ratio} />
                <Text style={styles.goalStatus}>{progress.statusText}</Text>
              </SurfaceCard>
            );
          })
        ) : (
          <EmptyState
            title="목표가 없습니다"
            body="새로운 목표를 설정해 보세요. 체중, 러닝, 배드민턴 등 다양한 목표를 관리할 수 있습니다."
            actionLabel="목표 추가"
            onAction={openComposer}
          />
        )}
      </ScreenFrame>

      <ModalSheet
        visible={composerVisible}
        title={(draft as any).id ? "목표 수정" : "목표 추가"}
        subtitle={(draft as any).id ? "기존 목표를 지금 상태에 맞게 다듬어 보세요." : "꾸준히 실천할 수 있는 목표를 세워보세요."}
        onClose={() => setComposerVisible(false)}
        onSave={saveGoalDraft}
        saveLabel={(draft as any).id ? "수정" : "저장"}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {(Object.keys(categoryConfig) as GoalCategory[]).map((category) => (
            <ChoiceChip
              key={category}
              label={categoryConfig[category].label}
              selected={draft.category === category}
              onPress={() =>
                setDraft((current) => ({
                  ...current,
                  category,
                  unit: categoryConfig[category].unit,
                }))
              }
            />
          ))}
        </ScrollView>

        <FieldInput
          label="목표 이름"
          placeholder="70kg 달성하기, 일주일에 3번 러닝..."
          value={draft.title}
          onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
        />

        <Pressable onPress={chooseDueDate} style={styles.dateButton}>
          <View>
            <Text style={styles.dateButtonLabel}>목표일</Text>
            <Text style={styles.dateButtonValue}>{formatLongDate(draft.dueDate)}</Text>
          </View>
          <Feather name="calendar" size={18} color={palette.ink} />
        </Pressable>

        <FieldInput
          label={`목표치 (${draft.unit})`}
          placeholder={categoryConfig[draft.category].placeholder}
          keyboardType="decimal-pad"
          value={draft.targetValue}
          onChangeText={(targetValue) => setDraft((current) => ({ ...current, targetValue }))}
        />

        <FieldInput
          label="메모"
          placeholder="목표가 중요한 이유나 다짐 등을 적어주세요."
          multiline
          value={draft.note}
          onChangeText={(note) => setDraft((current) => ({ ...current, note }))}
        />

      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  coachCard: {
    gap: 14,
  },
  coachHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  coachHeading: {
    flex: 1,
    gap: 4,
  },
  coachEyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: palette.mintDeep,
  },
  coachTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: palette.ink,
  },
  providerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#E7F6EE',
  },
  providerBadgeGemini: {
    backgroundColor: '#FFF2DE',
  },
  providerBadgeLocal: {
    backgroundColor: '#EFF2F1',
  },
  providerBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.ink,
  },
  loadingState: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  loadingTextWrap: {
    gap: 2,
  },
  loadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: palette.muted,
  },
  loadingModelText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: palette.mintDeep,
  },
  modelHint: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.mintDeep,
  },
  coachSummary: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 24,
    color: palette.ink,
  },
  trajectoryText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 22,
    color: palette.mintDeep,
  },
  insightSection: {
    gap: 6,
  },
  insightLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: palette.ink,
  },
  listItem: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  focusText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 22,
    color: palette.ink,
  },
  coachActions: {
    flexDirection: 'row',
    gap: 10,
  },
  goalCard: {
    gap: 14,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  goalActions: {
    alignItems: 'flex-end',
    gap: 10,
  },
  goalIconRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  goalHeaderText: {
    flex: 1,
    gap: 5,
  },
  goalDue: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.mintDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  goalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 21,
    color: palette.ink,
  },
  goalRelative: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
  },
  goalNote: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
  goalMetricRow: {
    flexDirection: 'row',
    gap: 14,
  },
  goalMetric: {
    flex: 1,
    gap: 4,
  },
  goalMetricLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: palette.muted,
  },
  goalMetricValue: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: palette.ink,
  },
  goalStatus: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 21,
    color: palette.mintDeep,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
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
  settingsCard: {
    gap: 14,
  },
  settingsTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: palette.ink,
  },
  warningCard: {
    gap: 8,
    backgroundColor: '#FFF6E7',
  },
  warningTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: palette.ink,
  },
  warningText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: palette.muted,
  },
});
