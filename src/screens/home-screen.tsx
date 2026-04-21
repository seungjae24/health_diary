import React, { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenFrame } from '../components/screen-frame';
import { SurfaceCard, FieldInput, PrimaryButton, ModalSheet } from '../components/ui';
import { useHealthData } from '../context/health-data-context';
import { useGlobalUi } from '../context/global-ui-context';
import { generateAiResponse } from '../services/ai';
import { fontFamily, palette } from '../theme';
import { shiftDateKey, todayDateKey } from '../utils/format';
import { dietPhaseMeta, getMacroCoachSummary } from '../utils/nutrition';

export function HomeScreen() {
  const { store, toggleSupplementDose } = useHealthData();
  const { openAddMenu } = useGlobalUi();
  const today = todayDateKey();
  const yesterday = shiftDateKey(today, -1);
  const weekStart = shiftDateKey(today, -6);

  const getDaySummary = (date: string) => {
    const dayMeals = store.meals.filter((meal) => meal.date === date);
    const dayWorkouts = store.workouts.filter((workout) => workout.date === date);
    const dayWeight = store.weights.find((weight) => weight.date === date);

    return {
      meals: dayMeals.length,
      workouts: dayWorkouts.length,
      weight: dayWeight?.valueKg,
    };
  };

  const todaySum = getDaySummary(today);
  const yesterdaySum = getDaySummary(yesterday);
  const weekMeals = store.meals.filter((meal) => meal.date >= weekStart).length;
  const weekWorkouts = store.workouts.filter((workout) => workout.date >= weekStart).length;
  const latestWeight = store.weights[0]?.valueKg;
  const coachSummary = getMacroCoachSummary(store);
  const phase = dietPhaseMeta[store.profile.dietPhase || 'lean'];

  const [query, setQuery] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  async function handleAskAi() {
    if (!query.trim()) return;
    try {
      setIsAsking(true);
      const response = await generateAiResponse(store.aiSettings, store, query);
      setAiResponse(response);
    } catch {
      Alert.alert('AI Error', 'Could not get a response. Please check your AI settings.');
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <ScreenFrame
      title="HealthDiary"
      subtitle="오늘 하루의 건강 요약입니다. 식단, 운동, 체질량의 변화를 한눈에 확인하세요."
      accent={palette.mintDeep}
      actionLabel="추가"
      onAction={openAddMenu}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>오늘의 요약</Text>
        <View style={styles.row}>
          <SummaryCard icon="coffee" label="식사" value={`${todaySum.meals}`} subValue="완료" />
          <SummaryCard icon="zap" label="운동" value={`${todaySum.workouts}`} subValue="수행" />
          <SummaryCard icon="heart" label="체중" value={todaySum.weight ? `${todaySum.weight}kg` : '--'} subValue="측정" />
        </View>
      </View>

      <SurfaceCard style={styles.aiCard}>
        <View style={styles.aiHeader}>
          <View style={styles.aiIconBox}>
            <Feather name="zap" size={20} color={palette.mintDeep} />
          </View>
          <Text style={styles.aiTitle}>HealthDiary AI에게 질문하기</Text>
        </View>
        <View style={styles.aiInputRow}>
          <FieldInput
            label=""
            placeholder="예: 오늘 남은 식사에서 단백질을 어떻게 채우면 좋아?"
            value={query}
            onChangeText={setQuery}
            style={styles.aiInput}
          />
          <Pressable
            onPress={handleAskAi}
            style={[styles.aiSendBtn, !query.trim() && styles.aiSendBtnDisabled]}
            disabled={isAsking || !query.trim()}
          >
            {isAsking ? (
              <ActivityIndicator size="small" color={palette.paper} />
            ) : (
              <Feather name="arrow-right" size={18} color={palette.paper} />
            )}
          </Pressable>
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.coachCard}>
        <View style={styles.coachHeader}>
          <View style={styles.coachIcon}>
            <Feather name="cpu" size={20} color={palette.paper} />
          </View>
          <View style={styles.coachHeaderText}>
            <Text style={styles.coachEyebrow}>Smart Fuel Coach</Text>
            <Text style={styles.coachTitle}>{phase.label}</Text>
          </View>
          <View style={styles.phaseChip}>
            <Text style={styles.phaseChipText}>{phase.label}</Text>
          </View>
        </View>

        <Text style={styles.coachHeadline}>{coachSummary.headline}</Text>
        <Text style={styles.coachBody}>{coachSummary.body}</Text>
        <View style={styles.calorieLine}>
          <Feather name="fire" size={16} color="#F2C46A" />
          <Text style={styles.calorieLineText}>{coachSummary.calorieLine}</Text>
        </View>

        {coachSummary.targets ? (
          <View style={styles.macroTargetRow}>
            <CoachMetricCard label="단백질" value={`${Math.round(coachSummary.targets.proteinG)}g`} caption={`현재 ${Math.round(coachSummary.consumed.proteinG)}g`} tone="mint" />
            <CoachMetricCard label="탄수화물" value={`${Math.round(coachSummary.targets.carbsG)}g`} caption={`현재 ${Math.round(coachSummary.consumed.carbsG)}g`} tone="sky" />
            <CoachMetricCard label="지방" value={`${Math.round(coachSummary.targets.fatG)}g`} caption={`현재 ${Math.round(coachSummary.consumed.fatG)}g`} tone="coral" />
          </View>
        ) : null}

        <View style={styles.tipList}>
          {coachSummary.recommendations.map((recommendation) => (
            <View key={recommendation} style={styles.tipItem}>
              <View style={styles.tipBullet} />
              <Text style={styles.tipText}>{recommendation}</Text>
            </View>
          ))}
        </View>

        {coachSummary.missingProfileFields.length ? (
          <View style={styles.warningBox}>
            <Feather name="info" size={15} color="#8C6421" />
            <Text style={styles.warningText}>더 정확한 계산을 위해 {coachSummary.missingProfileFields.join(', ')} 정보를 채워 주세요.</Text>
          </View>
        ) : null}
      </SurfaceCard>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>어제의 기록</Text>
        <View style={styles.row}>
          <SummaryCard icon="coffee" label="식사" value={`${yesterdaySum.meals}`} subValue="완료" variant="muted" />
          <SummaryCard icon="zap" label="운동" value={`${yesterdaySum.workouts}`} subValue="수행" variant="muted" />
          <SummaryCard icon="heart" label="체중" value={yesterdaySum.weight ? `${yesterdaySum.weight}kg` : '--'} subValue="어제" variant="muted" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>지난 7일간의 통계</Text>
        <SurfaceCard style={styles.weekCard}>
          <View style={styles.weekItem}>
            <View style={styles.weekIconBound}>
              <Feather name="coffee" size={16} color={palette.mintDeep} />
            </View>
            <View>
              <Text style={styles.weekLabel}>영양 상태</Text>
              <Text style={styles.weekValue}>{weekMeals}번의 식사 기록</Text>
            </View>
          </View>
          <View style={styles.weekItem}>
            <View style={[styles.weekIconBound, { backgroundColor: palette.blush }]}>
              <Feather name="zap" size={16} color={palette.coral} />
            </View>
            <View>
              <Text style={styles.weekLabel}>활동량</Text>
              <Text style={styles.weekValue}>{weekWorkouts}번의 운동 완료</Text>
            </View>
          </View>
          <View style={styles.weekItem}>
            <View style={[styles.weekIconBound, { backgroundColor: '#F0F4FF' }]}>
              <Feather name="heart" size={16} color="#4A6CF7" />
            </View>
            <View>
              <Text style={styles.weekLabel}>체중 변화</Text>
              <Text style={styles.weekValue}>현재: {latestWeight ? `${latestWeight}kg` : '기록 없음'}</Text>
            </View>
          </View>
        </SurfaceCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>영양제 체크</Text>
        {store.supplements.length ? (
          <SurfaceCard style={styles.supplementCard}>
            {store.supplements.map((supplement: any) => (
              <View key={supplement.id} style={styles.supplementBlock}>
                <View style={styles.supplementTopRow}>
                  <View style={[styles.supplementIcon, supplement.color === 'sky' && styles.supplementIconSky, supplement.color === 'coral' && styles.supplementIconCoral, supplement.color === 'amber' && styles.supplementIconAmber]}>
                    <Feather name="plus-square" size={16} color={palette.paper} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.supplementTitle}>{supplement.name}</Text>
                    <Text style={styles.supplementMeta}>{[supplement.dosage, supplement.note].filter(Boolean).join(' · ') || '오늘 복용 체크해 주세요.'}</Text>
                  </View>
                </View>
                <View style={styles.supplementDoseRow}>
                  {supplement.times.map((timeSlot: string) => {
                    const taken = store.supplementLogs.some((log: any) => log.supplementId === supplement.id && log.date === today && log.timeSlot === timeSlot);
                    return (
                      <Pressable
                        key={`${supplement.id}-${timeSlot}`}
                        onPress={() => toggleSupplementDose(supplement.id, today, timeSlot)}
                        style={[styles.supplementDosePill, taken && styles.supplementDosePillTaken]}
                      >
                        <Text style={styles.supplementDoseEmoji}>{taken ? '😊' : '🥲'}</Text>
                        <Text style={[styles.supplementDoseText, taken && styles.supplementDoseTextTaken]}>{timeSlot}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </SurfaceCard>
        ) : (
          <SurfaceCard style={styles.emptySuppCard}>
            <Text style={styles.emptySuppTitle}>아직 등록한 영양제가 없어요</Text>
            <Text style={styles.emptySuppBody}>설정에서 매일 챙겨 먹는 영양제나 약을 추가해 두면 여기서 바로 체크할 수 있어요.</Text>
          </SurfaceCard>
        )}
      </View>

      <ModalSheet
        visible={aiResponse !== null}
        title="AI 분석 결과"
        subtitle={`질문: "${query}"`}
        onClose={() => {
          setAiResponse(null);
          setQuery('');
        }}
      >
        <View style={styles.aiResponseBox}>
          <Text style={styles.aiResponseText}>{aiResponse}</Text>
        </View>
        <PrimaryButton
          label="확인했습니다"
          onPress={() => {
            setAiResponse(null);
            setQuery('');
          }}
        />
      </ModalSheet>
    </ScreenFrame>
  );
}

function SummaryCard({ icon, label, value, subValue, variant = 'normal' }: any) {
  return (
    <SurfaceCard style={[styles.summaryCard, variant === 'muted' && styles.mutedCard]}>
      <Feather name={icon} size={18} color={variant === 'muted' ? palette.muted : palette.mintDeep} />
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardSubValue}>{subValue}</Text>
    </SurfaceCard>
  );
}

function CoachMetricCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: 'mint' | 'sky' | 'coral';
}) {
  return (
    <View
      style={[
        styles.coachMetricCard,
        tone === 'sky' && styles.coachMetricCardSky,
        tone === 'coral' && styles.coachMetricCardCoral,
      ]}
    >
      <Text style={styles.coachMetricLabel}>{label}</Text>
      <Text style={styles.coachMetricValue}>{value}</Text>
      <Text style={styles.coachMetricCaption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: palette.ink,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 16,
  },
  mutedCard: {
    opacity: 0.8,
    backgroundColor: '#F8FAF8',
  },
  cardValue: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: palette.ink,
    marginTop: 4,
  },
  cardLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: palette.muted,
  },
  cardSubValue: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: palette.muted,
    opacity: 0.7,
  },
  coachCard: {
    gap: 16,
    backgroundColor: '#182D21',
    borderColor: '#294836',
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coachIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D5A43',
  },
  coachHeaderText: {
    flex: 1,
  },
  coachEyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: '#9CC6AA',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  coachTitle: {
    marginTop: 2,
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: palette.paper,
  },
  phaseChip: {
    backgroundColor: '#F2C46A',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  phaseChipText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: '#5F4112',
  },
  coachHeadline: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 25,
    color: palette.paper,
  },
  coachBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 22,
    color: '#D7E7DB',
  },
  calorieLine: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#223A2B',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  calorieLineText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: '#FBEAC7',
  },
  macroTargetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  coachMetricCard: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#214531',
  },
  coachMetricCardSky: {
    backgroundColor: '#203B55',
  },
  coachMetricCardCoral: {
    backgroundColor: '#4C2E2A',
  },
  coachMetricLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: '#AAC8B6',
  },
  coachMetricValue: {
    marginTop: 6,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: palette.paper,
  },
  coachMetricCaption: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#C4D9CC',
  },
  tipList: {
    gap: 10,
  },
  tipItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  tipBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    backgroundColor: '#F2C46A',
  },
  tipText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: '#D7E7DB',
  },
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#FFF4D7',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 18,
    color: '#7B581F',
  },
  weekCard: {
    gap: 16,
    padding: 20,
  },
  weekItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  weekIconBound: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: palette.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekValue: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: palette.ink,
    marginTop: 2,
  },
  aiCard: {
    backgroundColor: '#F0F9F4',
    borderColor: '#D4E9DE',
    gap: 12,
    marginBottom: 8,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DFF4E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: palette.ink,
  },
  aiInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  aiInput: {
    flex: 1,
  },
  aiSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: palette.mintDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  aiSendBtnDisabled: {
    backgroundColor: '#C5D6CC',
  },
  aiResponseBox: {
    backgroundColor: '#F9FBF9',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EDF2EE',
  },
  aiResponseText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 24,
    color: palette.ink,
  },
  supplementCard: {
    gap: 14,
  },
  supplementBlock: {
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1EE',
  },
  supplementTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  supplementIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: palette.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplementIconSky: {
    backgroundColor: palette.sky,
  },
  supplementIconCoral: {
    backgroundColor: palette.coral,
  },
  supplementIconAmber: {
    backgroundColor: palette.amber,
  },
  supplementTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: palette.ink,
  },
  supplementMeta: {
    marginTop: 3,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  supplementDoseRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  supplementDosePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#F4F6F3',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  supplementDosePillTaken: {
    backgroundColor: '#E7F6EE',
  },
  supplementDoseEmoji: {
    fontSize: 16,
  },
  supplementDoseText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.muted,
  },
  supplementDoseTextTaken: {
    color: palette.mintDeep,
  },
  emptySuppCard: {
    gap: 8,
    backgroundColor: '#FFF8E8',
    borderColor: '#F2DEAA',
  },
  emptySuppTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: palette.ink,
  },
  emptySuppBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
});
