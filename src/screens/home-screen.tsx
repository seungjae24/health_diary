import React, { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenFrame } from '../components/screen-frame';
import { SurfaceCard, FieldInput, PrimaryButton, ModalSheet } from '../components/ui';
import { useHealthData } from '../context/health-data-context';
import { useGlobalUi } from '../context/global-ui-context';
import { generateAiResponse } from '../services/ai';
import { fontFamily, palette } from '../theme';
import { shiftDateKey, todayDateKey } from '../utils/format';
import { dietPhaseMeta, getMacroCoachSummary, getMacroTotalsForDate, getNutritionTargets } from '../utils/nutrition';

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
  const nutritionTargets = getNutritionTargets(store);
  const todayNutrition = getMacroTotalsForDate(store.meals);
  const weightDeltaText =
    todaySum.weight && yesterdaySum.weight
      ? `${todaySum.weight > yesterdaySum.weight ? '+' : ''}${(todaySum.weight - yesterdaySum.weight).toFixed(1)}kg`
      : latestWeight
        ? `${latestWeight}kg`
        : '기록 없음';
  const macroCards = nutritionTargets
    ? [
        {
          key: 'calories',
          label: '칼로리',
          color: '#F28D3A',
          current: todayNutrition.calories,
          target: nutritionTargets.calories,
          range: null,
          unit: 'kcal',
        },
        {
          key: 'protein',
          label: '단백질',
          color: palette.mintDeep,
          current: todayNutrition.proteinG,
          target: nutritionTargets.proteinG,
          range: nutritionTargets.proteinRangeG,
          unit: 'g',
        },
        {
          key: 'carbs',
          label: '탄수화물',
          color: '#4A86FF',
          current: todayNutrition.carbsG,
          target: nutritionTargets.carbsG,
          range: nutritionTargets.carbsRangeG,
          unit: 'g',
        },
        {
          key: 'fat',
          label: '지방',
          color: palette.coral,
          current: todayNutrition.fatG,
          target: nutritionTargets.fatG,
          range: nutritionTargets.fatRangeG,
          unit: 'g',
        },
      ]
    : [];

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

      <SurfaceCard style={styles.nutritionCard}>
        <View style={styles.nutritionHeader}>
          <View style={styles.nutritionHeaderText}>
            <Text style={styles.nutritionEyebrow}>오늘의 탄단지 + 칼로리</Text>
            <Text style={styles.nutritionTitle}>{phase.label}</Text>
            <Text style={styles.nutritionBody}>
              {nutritionTargets
                ? `${phase.coachLabel}`
                : '체중과 프로필을 입력하면 목표 범위를 자동 계산해 드려요.'}
            </Text>
          </View>
          <View style={styles.phaseChip}>
            <Text style={styles.phaseChipText}>{phase.label}</Text>
          </View>
        </View>

        <View style={styles.calorieLineBright}>
          <Feather name="activity" size={16} color="#F28D3A" />
          <Text style={styles.calorieLineBrightText}>{coachSummary.calorieLine}</Text>
        </View>

        {nutritionTargets ? (
          <View style={styles.ringsRow}>
            {macroCards.map((macro) => (
              <MacroProgressCard
                key={macro.key}
                label={macro.label}
                color={macro.color}
                current={macro.current}
                target={macro.target}
                range={macro.range}
                unit={macro.unit}
              />
            ))}
          </View>
        ) : null}

        {nutritionTargets ? (
          <View style={styles.rangeSummaryBox}>
            <Text style={styles.rangeSummaryTitle}>권장 범위</Text>
            <Text style={styles.rangeSummaryText}>
              단백질 {nutritionTargets.proteinRange[0]}~{nutritionTargets.proteinRange[1]} g/kg ·
              지방 {nutritionTargets.fatRange[0]}~{nutritionTargets.fatRange[1]} g/kg ·
              탄수화물 {nutritionTargets.carbRange[0]}~{nutritionTargets.carbRange[1]} g/kg
            </Text>
          </View>
        ) : null}

        {coachSummary.missingProfileFields.length ? (
          <View style={styles.warningBox}>
            <Feather name="info" size={15} color="#8C6421" />
            <Text style={styles.warningText}>더 정확한 계산을 위해 {coachSummary.missingProfileFields.join(', ')} 정보를 채워 주세요.</Text>
          </View>
        ) : null}
      </SurfaceCard>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>이번 흐름</Text>
        <SurfaceCard style={styles.flowCard}>
          <View style={styles.weekItem}>
            <View style={styles.weekIconBound}>
              <Feather name="coffee" size={16} color={palette.mintDeep} />
            </View>
            <View>
              <Text style={styles.weekLabel}>식사 밀도</Text>
              <Text style={styles.weekValue}>{weekMeals}번의 식사 기록</Text>
            </View>
          </View>
          <View style={styles.weekItem}>
            <View style={[styles.weekIconBound, { backgroundColor: palette.blush }]}>
              <Feather name="zap" size={16} color={palette.coral} />
            </View>
            <View>
              <Text style={styles.weekLabel}>운동량</Text>
              <Text style={styles.weekValue}>{weekWorkouts}번의 운동 완료</Text>
            </View>
          </View>
          <View style={styles.weekItem}>
            <View style={[styles.weekIconBound, { backgroundColor: '#F0F4FF' }]}>
              <Feather name="heart" size={16} color="#4A6CF7" />
            </View>
            <View>
              <Text style={styles.weekLabel}>체중 흐름</Text>
              <Text style={styles.weekValue}>{weightDeltaText}</Text>
            </View>
          </View>
          <View style={styles.flowDivider} />
          <Text style={styles.flowInsight}>
            {todaySum.meals === 0 && todaySum.workouts === 0
              ? '오늘 기록이 비어 있어요. 식사나 운동 하나만 남겨도 코멘트 정확도가 훨씬 올라갑니다.'
              : `${phase.label} 기준으로 지금 제일 중요한 건 ${todayNutrition.proteinG < (nutritionTargets?.proteinG || 0) * 0.7 ? '단백질 보강' : weekWorkouts < 3 ? '운동 빈도 유지' : '기록 일관성 유지'}입니다.`}
          </Text>
        </SurfaceCard>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>영양제 체크</Text>
        {store.supplements.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supplementScroller}>
            {store.supplements.map((supplement: any) => (
              <SurfaceCard key={supplement.id} style={styles.supplementBlock}>
                <View style={styles.supplementTopRow}>
                  <View style={[styles.supplementIcon, supplement.color === 'sky' && styles.supplementIconSky, supplement.color === 'coral' && styles.supplementIconCoral, supplement.color === 'amber' && styles.supplementIconAmber]}>
                    <Feather name="plus-square" size={16} color={palette.paper} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.supplementTitle}>{supplement.name}</Text>
                    <Text style={styles.supplementMeta}>{[supplement.dosage, supplement.note].filter(Boolean).join(' · ') || '오늘 복용 체크해 주세요.'}</Text>
                  </View>
                  <Text style={styles.supplementProgressText}>
                    {
                      `${store.supplementLogs.filter((log: any) => log.supplementId === supplement.id && log.date === today).length}/${supplement.times.length}`
                    }
                  </Text>
                </View>
                <View style={styles.supplementProgressTrack}>
                  {supplement.times.map((timeSlot: string) => {
                    const taken = store.supplementLogs.some((log: any) => log.supplementId === supplement.id && log.date === today && log.timeSlot === timeSlot);
                    return <View key={`${supplement.id}-${timeSlot}-bar`} style={[styles.supplementProgressSegment, taken && styles.supplementProgressSegmentTaken]} />;
                  })}
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
                        <Text style={[styles.supplementDoseText, taken && styles.supplementDoseTextTaken]}>{timeSlot}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </SurfaceCard>
            ))}
          </ScrollView>
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

function MacroProgressCard({
  label,
  color,
  current,
  target,
  range,
  unit,
}: {
  label: string;
  color: string;
  current: number;
  target: number;
  range: [number, number] | null;
  unit: string;
}) {
  const ratio = target > 0 ? Math.min(current / target, 1.4) : 0;
  const percent = target > 0 ? Math.round((current / target) * 100) : 0;
  const fillHeight = `${Math.max(12, Math.min(100, ratio * 100))}%`;

  return (
    <View style={styles.macroCard}>
      <View style={[styles.macroCircle, { borderColor: `${color}55` }]}>
        <View style={[styles.macroCircleFill, { height: fillHeight as any, backgroundColor: `${color}33` }]} />
        <View style={styles.macroCircleInner}>
          <Text style={styles.macroPercent}>{percent}%</Text>
          <Text style={styles.macroCurrent}>{Math.round(current)}{unit}</Text>
        </View>
      </View>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroCaption}>
        목표 {Math.round(target)}{unit}
      </Text>
      {range ? (
        <Text style={styles.macroCaptionMuted}>
          권장 {Math.round(range[0])}~{Math.round(range[1])}{unit}
        </Text>
      ) : (
        <Text style={styles.macroCaptionMuted}>목표 대비 진행률</Text>
      )}
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
  nutritionCard: {
    gap: 16,
    backgroundColor: '#F7FBFF',
    borderColor: '#D9E4F3',
  },
  nutritionHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  nutritionHeaderText: {
    flex: 1,
  },
  nutritionEyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.sky,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  nutritionTitle: {
    marginTop: 2,
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: palette.ink,
  },
  nutritionBody: {
    marginTop: 6,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  phaseChip: {
    backgroundColor: '#EAF4FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  phaseChipText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: '#285D97',
  },
  calorieLineBright: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#FFF5E7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  calorieLineBrightText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 19,
    color: '#A45E1B',
  },
  ringsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  macroCard: {
    width: '47%',
    alignItems: 'center',
    gap: 6,
  },
  macroCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 8,
    overflow: 'hidden',
    backgroundColor: '#F3F6F9',
    justifyContent: 'flex-end',
  },
  macroCircleFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  macroCircleInner: {
    position: 'absolute',
    inset: 10,
    borderRadius: 36,
    backgroundColor: palette.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroPercent: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: palette.ink,
  },
  macroCurrent: {
    marginTop: 2,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.muted,
  },
  macroLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.ink,
  },
  macroCaption: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: palette.ink,
  },
  macroCaptionMuted: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: palette.muted,
    textAlign: 'center',
  },
  rangeSummaryBox: {
    borderRadius: 16,
    backgroundColor: '#EFF6FB',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rangeSummaryTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: palette.ink,
  },
  rangeSummaryText: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
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
  flowCard: {
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
  flowDivider: {
    height: 1,
    backgroundColor: palette.stroke,
  },
  flowInsight: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.ink,
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
  supplementScroller: {
    gap: 10,
    paddingRight: 12,
  },
  supplementCard: {
    gap: 12,
  },
  supplementBlock: {
    width: 250,
    gap: 8,
    paddingBottom: 2,
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
  supplementProgressText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: palette.mintDeep,
  },
  supplementProgressTrack: {
    flexDirection: 'row',
    gap: 6,
  },
  supplementProgressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E8ECE8',
  },
  supplementProgressSegmentTaken: {
    backgroundColor: palette.mint,
  },
  supplementDoseRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  supplementDosePill: {
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#F4F6F3',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  supplementDosePillTaken: {
    backgroundColor: '#E7F6EE',
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
