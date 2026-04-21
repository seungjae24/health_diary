import {
  StrengthExerciseCategory,
  WorkoutActivityDefinition,
} from '../types';

export type ExerciseTrackingMode = 'weight-reps' | 'reps-only';
export type MuscleIntensity = 'low' | 'medium' | 'high';
export type MuscleZone =
  | 'chest'
  | 'frontShoulder'
  | 'sideShoulder'
  | 'rearShoulder'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'lats'
  | 'midBack'
  | 'lowerBack'
  | 'abs'
  | 'obliques'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'adductors'
  | 'hipAbductors';

export type ExerciseDefinition = {
  id: string;
  name: string;
  category: StrengthExerciseCategory;
  instructions: string;
  trackingMode: ExerciseTrackingMode;
  bodyweightRatio?: number;
  equipmentLabel: string;
  muscleMap: Partial<Record<MuscleZone, MuscleIntensity>>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hasAny(name: string, keywords: string[]) {
  return keywords.some((keyword) => name.includes(keyword));
}

function resolveEquipmentLabel(name: string, category: StrengthExerciseCategory) {
  if (name.includes('스미스머신')) return '스미스머신';
  if (name.includes('바벨')) return '바벨';
  if (name.includes('덤벨')) return '덤벨';
  if (name.includes('케틀벨')) return '케틀벨';
  if (name.includes('케이블')) return '케이블';
  if (name.includes('머신') || name.includes('프레스') || name.includes('풀다운') || name.includes('로우 머신')) return '머신';
  if (hasAny(name, ['맨몸', '푸시업', '풀업', '친업', '딥스', '플랭크', '크런치', '싯업', '레그 레이즈', '머슬업', '버피', '점핑 잭'])) return '맨몸';
  if (category === 'cardio') return '유산소 장비/맨몸';
  return '프리웨이트/맨몸';
}

function resolveTrackingMeta(name: string) {
  if (hasAny(name, ['중량 ', '바벨', '덤벨', '케틀벨', '스미스머신', '머신', '케이블', '플레이트', '이지바', '트랩바', '랜드마인'])) {
    return { trackingMode: 'weight-reps' as const };
  }

  if (hasAny(name, ['풀업', '친업', '딥스', '핸드스탠드 푸시업', '바 머슬업', '링 머슬업'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.93 };
  }

  if (hasAny(name, ['푸시업', '클랩 푸시업', '힌두 푸시업', '클로즈그립 푸시업'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.69 };
  }

  if (hasAny(name, ['아처 푸시업', '파이크 푸시업'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.75 };
  }

  if (hasAny(name, ['인클라인 푸시업'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.55 };
  }

  if (hasAny(name, ['에어 스쿼트', '스모 에어 스쿼트', '맨몸 오버헤드 스쿼트'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.77 };
  }

  if (hasAny(name, ['피스톨 스쿼트', '피스톨 박스 스쿼트', '스텝업', '원레그'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.89 };
  }

  if (hasAny(name, ['맨몸 스플릿 스쿼트', '런지', '레터럴 런지'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.85 };
  }

  if (hasAny(name, ['맨몸 카프 레이즈'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.98 };
  }

  if (hasAny(name, ['글루트 브릿지', '싱글 레그 글루트 브릿지'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: name.includes('싱글') ? 0.72 : 0.55 };
  }

  if (hasAny(name, ['덩키 킥', '사이드 라잉 클램', '라잉 힙 어브덕션'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.22 };
  }

  if (hasAny(name, ['크런치', '싯업', '힐 터치', '레그 레이즈', '리버스 크런치', '사이드 크런치', '복근 에어 바이크', '필라테스 잭나이프'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.4 };
  }

  if (hasAny(name, ['플랭크', '할로우', 'RKC 플랭크', '사이드 플랭크'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.35 };
  }

  if (hasAny(name, ['행잉 레그 레이즈', '행잉 니 레이즈', '행 클린', '행 스내치'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.6 };
  }

  if (hasAny(name, ['핸드스탠드', '숄더 탭', '점프 스쿼트', '박스 점프', '버피', '점핑 잭', '마운틴 클라이머', '인치웜'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.65 };
  }

  if (hasAny(name, ['맨몸 ', '걷기', '달리기'])) {
    return { trackingMode: 'reps-only' as const, bodyweightRatio: 0.5 };
  }

  return { trackingMode: 'weight-reps' as const };
}

function withIntensity(zones: MuscleZone[], intensity: MuscleIntensity) {
  return zones.reduce<Partial<Record<MuscleZone, MuscleIntensity>>>((acc, zone) => {
    acc[zone] = intensity;
    return acc;
  }, {});
}

function mergeMuscleMaps(...maps: Array<Partial<Record<MuscleZone, MuscleIntensity>>>) {
  return maps.reduce<Partial<Record<MuscleZone, MuscleIntensity>>>((acc, map) => {
    Object.entries(map).forEach(([zone, intensity]) => {
      acc[zone as MuscleZone] = intensity as MuscleIntensity;
    });
    return acc;
  }, {});
}

function resolveMuscleMap(name: string, category: StrengthExerciseCategory) {
  if (hasAny(name, ['벤치프레스', '체스트 프레스', '푸시업', '딥스', '플라이'])) {
    return mergeMuscleMaps(
      withIntensity(['chest'], 'high'),
      withIntensity(['frontShoulder', 'triceps'], 'medium'),
      withIntensity(['abs'], 'low'),
    );
  }

  if (hasAny(name, ['오버헤드 프레스', '숄더 프레스', '레터럴 레이즈', '프론트 레이즈', '업라이트 로우', 'Y 레이즈'])) {
    return mergeMuscleMaps(
      withIntensity(['frontShoulder', 'sideShoulder'], 'high'),
      withIntensity(['triceps', 'rearShoulder'], 'medium'),
      withIntensity(['abs'], 'low'),
    );
  }

  if (hasAny(name, ['리버스 플라이', '페이스 풀', '슈러그'])) {
    return mergeMuscleMaps(
      withIntensity(['rearShoulder', 'midBack'], 'high'),
      withIntensity(['sideShoulder', 'lowerBack'], 'medium'),
      withIntensity(['biceps'], 'low'),
    );
  }

  if (hasAny(name, ['랫풀다운', '풀업', '친업', '로우', '풀다운', '하이 로우'])) {
    return mergeMuscleMaps(
      withIntensity(['lats', 'midBack'], 'high'),
      withIntensity(['biceps', 'rearShoulder'], 'medium'),
      withIntensity(['forearms', 'lowerBack'], 'low'),
    );
  }

  if (hasAny(name, ['데드리프트', '굿모닝', '하이풀', '클린', '스내치'])) {
    return mergeMuscleMaps(
      withIntensity(['glutes', 'hamstrings', 'lowerBack'], 'high'),
      withIntensity(['midBack', 'quads'], 'medium'),
      withIntensity(['forearms', 'calves'], 'low'),
    );
  }

  if (hasAny(name, ['스쿼트', '레그 프레스', '런지', '스플릿 스쿼트', '스텝업'])) {
    return mergeMuscleMaps(
      withIntensity(['quads', 'glutes'], 'high'),
      withIntensity(['hamstrings', 'adductors'], 'medium'),
      withIntensity(['calves', 'abs'], 'low'),
    );
  }

  if (hasAny(name, ['레그 컬', '노르딕 햄스트링 컬'])) {
    return mergeMuscleMaps(
      withIntensity(['hamstrings'], 'high'),
      withIntensity(['glutes', 'calves'], 'medium'),
    );
  }

  if (hasAny(name, ['레그 익스텐션'])) {
    return mergeMuscleMaps(
      withIntensity(['quads'], 'high'),
      withIntensity(['adductors'], 'low'),
    );
  }

  if (hasAny(name, ['힙 쓰러스트', '글루트 브릿지', '킥백', '어브덕션', '클램'])) {
    return mergeMuscleMaps(
      withIntensity(['glutes'], 'high'),
      withIntensity(['hamstrings', 'hipAbductors'], 'medium'),
      withIntensity(['abs'], 'low'),
    );
  }

  if (hasAny(name, ['카프 레이즈'])) {
    return mergeMuscleMaps(
      withIntensity(['calves'], 'high'),
      withIntensity(['quads'], 'low'),
    );
  }

  if (hasAny(name, ['컬'])) {
    return mergeMuscleMaps(
      withIntensity(['biceps'], 'high'),
      withIntensity(['forearms'], 'medium'),
    );
  }

  if (hasAny(name, ['트라이셉', '푸시 다운', '스컬 크러셔', '킥백'])) {
    return mergeMuscleMaps(
      withIntensity(['triceps'], 'high'),
      withIntensity(['frontShoulder', 'forearms'], 'low'),
    );
  }

  if (hasAny(name, ['크런치', '싯업', '레그 레이즈', '플랭크', '할로우', '트위스트', '사이드 벤드'])) {
    return mergeMuscleMaps(
      withIntensity(['abs'], 'high'),
      withIntensity(['obliques'], 'medium'),
      withIntensity(['glutes', 'lowerBack'], 'low'),
    );
  }

  if (category === 'lower') {
    return mergeMuscleMaps(
      withIntensity(['quads', 'glutes'], 'high'),
      withIntensity(['hamstrings', 'calves'], 'medium'),
    );
  }
  if (category === 'chest') {
    return mergeMuscleMaps(
      withIntensity(['chest'], 'high'),
      withIntensity(['frontShoulder', 'triceps'], 'medium'),
    );
  }
  if (category === 'back') {
    return mergeMuscleMaps(
      withIntensity(['lats', 'midBack'], 'high'),
      withIntensity(['biceps', 'rearShoulder'], 'medium'),
    );
  }
  if (category === 'shoulder') {
    return mergeMuscleMaps(
      withIntensity(['frontShoulder', 'sideShoulder'], 'high'),
      withIntensity(['rearShoulder', 'triceps'], 'medium'),
    );
  }
  if (category === 'arms') {
    return mergeMuscleMaps(
      withIntensity(['biceps', 'triceps'], 'high'),
      withIntensity(['forearms'], 'medium'),
    );
  }
  if (category === 'core') {
    return mergeMuscleMaps(
      withIntensity(['abs'], 'high'),
      withIntensity(['obliques'], 'medium'),
      withIntensity(['lowerBack'], 'low'),
    );
  }

  return withIntensity(['abs'], 'low');
}

function buildInstructionSections(name: string, category: StrengthExerciseCategory) {
  const defaultSections = {
    key: '복압과 호흡을 먼저 고정하고, 반동보다 같은 자세를 반복 재현하는 데 집중하세요.',
    how: '시작 자세를 안정적으로 만든 뒤 목표 근육이 늘어나는 구간과 수축하는 구간을 모두 통제합니다.',
    checkpoints: '통증 없이 가동범위를 확보하고, 손목·팔꿈치·무릎 같은 관절 정렬이 무너지지 않는지 확인하세요.',
    caution: '무게 욕심으로 속도를 올리기보다 마지막 반복까지 같은 궤적이 유지되는 강도를 선택하는 편이 안전합니다.',
  };

  if (hasAny(name, ['스쿼트', '레그 프레스', '브이 스쿼트', '핵 스쿼트'])) {
    return {
      key: '발 전체로 바닥을 누르며 내려가고 올라오는 동안 무릎과 발끝 방향을 맞추는 것이 핵심입니다.',
      how: '내려갈 때 복압을 유지하며 엉덩이를 뒤와 아래로 보내고, 올라올 때는 허벅지와 엉덩이로 바닥을 민다는 느낌으로 일어납니다.',
      checkpoints: '발뒤꿈치가 뜨지 않는지, 허리가 말리지 않는지, 하단에서 골반이 한쪽으로 쏠리지 않는지 확인하세요.',
      caution: '무릎을 급하게 잠그거나 허리를 과하게 세우지 말고, 깊이를 늘릴수록 코어 긴장을 더 먼저 잡아 주세요.',
    };
  }

  if (hasAny(name, ['데드리프트', '굿모닝', '풀 스루'])) {
    return {
      key: '바나 손잡이를 몸 가까이 두고 힙힌지로 엉덩이를 접었다 펴는 패턴을 유지하는 것이 가장 중요합니다.',
      how: '가슴을 연 채 광배를 잠그고, 햄스트링이 늘어나는 지점까지 엉덩이를 뒤로 보낸 뒤 다리와 둔근으로 바닥을 밀어 올라옵니다.',
      checkpoints: '목을 꺾지 않고 정수리와 꼬리뼈가 길게 유지되는지, 바가 정강이에서 멀어지지 않는지 확인하세요.',
      caution: '허리로 버티는 느낌이 들면 즉시 중량을 낮추고, 상단에서 허리를 뒤로 젖히며 잠그는 습관은 줄이는 편이 좋습니다.',
    };
  }

  if (hasAny(name, ['런지', '스플릿 스쿼트', '스텝업'])) {
    return {
      key: '좌우 균형을 무너뜨리지 않고 앞발 중심으로 하중을 받아 내는 것이 핵심입니다.',
      how: '상체를 길게 세운 채 천천히 내려가며 골반을 정면으로 유지하고, 올라올 때는 앞발 전체로 지면을 밀며 균형 있게 올라옵니다.',
      checkpoints: '앞무릎이 안으로 붕 뜨지 않는지, 골반이 틀어지지 않는지, 발바닥 압력이 한쪽으로 쏠리지 않는지 보세요.',
      caution: '폭이 너무 좁으면 흔들림이 커지므로 자신의 가동성에 맞게 보폭을 조정하고, 반동으로 올라오지 않도록 합니다.',
    };
  }

  if (hasAny(name, ['힙 쓰러스트', '글루트 브릿지', '킥백', '어브덕션', '클램'])) {
    return {
      key: '허리를 꺾기보다 엉덩이 수축으로 마무리하는 패턴을 만드는 것이 중요합니다.',
      how: '복부 긴장을 유지한 채 엉덩이를 들어 올리고, 상단에서 둔근 수축을 1초 정도 느낀 뒤 천천히 돌아옵니다.',
      checkpoints: '갈비뼈가 들리지 않는지, 무릎 간격이 무너지지 않는지, 상단에서 허리만 먼저 젖혀지지 않는지 확인하세요.',
      caution: '동작을 크게 만들려고 허리를 과신전하면 자극이 허리로 빠질 수 있으니 골반 중립을 우선합니다.',
    };
  }

  if (hasAny(name, ['카프 레이즈'])) {
    return {
      key: '발가락이 아닌 엄지볼과 새끼발가락 볼, 뒤꿈치까지 발 전체를 안정적으로 쓰는 것이 중요합니다.',
      how: '천천히 최대한 올라가 종아리를 수축하고, 내려올 때 발목이 편안하게 늘어나는 구간까지 버텨 줍니다.',
      checkpoints: '발목이 안으로 꺾이지 않는지, 상단에서 튕기지 않는지, 좌우 체중이 균형적인지 확인하세요.',
      caution: '반동을 주면 종아리 긴장이 사라지므로 반복 속도를 일정하게 유지하세요.',
    };
  }

  if (hasAny(name, ['벤치프레스', '체스트 프레스', '플로어 프레스'])) {
    return {
      key: '견갑을 뒤로 모아 가슴을 세운 상태에서 같은 경로로 내리고 미는 것이 핵심입니다.',
      how: '손목과 팔꿈치를 수직에 가깝게 맞춘 뒤 천천히 가슴 중앙~아래쪽으로 내려오고, 발로 바닥을 밀며 안정적으로 밀어 올립니다.',
      checkpoints: '어깨가 말리지 않는지, 하강 때 바가 흔들리지 않는지, 손목이 뒤로 꺾이지 않는지 확인하세요.',
      caution: '팔꿈치를 과하게 벌리면 어깨 부담이 커질 수 있으므로 자신에게 맞는 각도를 찾고, 가슴에서 튕기지 않습니다.',
    };
  }

  if (hasAny(name, ['플라이'])) {
    return {
      key: '팔꿈치 각도를 거의 고정한 채 가슴이 늘어나는 범위와 모이는 범위를 통제하는 것이 중요합니다.',
      how: '가슴을 연 상태로 양팔을 부드럽게 벌리며 신장감을 느끼고, 팔이 아닌 가슴으로 끌어안는 느낌으로 모읍니다.',
      checkpoints: '어깨 앞쪽이 찝히지 않는지, 손이 너무 아래로 떨어지지 않는지, 상단에서 긴장을 완전히 놓지 않는지 확인하세요.',
      caution: '가동범위를 욕심내면 어깨 스트레스가 커지므로 통증 없는 범위 안에서만 넓혀 주세요.',
    };
  }

  if (hasAny(name, ['푸시업', '딥스'])) {
    return {
      key: '몸통을 한 덩어리처럼 유지한 채 가슴과 삼두로 밀어내는 패턴을 만드는 것이 핵심입니다.',
      how: '손으로 바닥이나 손잡이를 강하게 밀어 견갑을 안정시키고, 내려갈 때는 가슴이 먼저 접근하도록 천천히 버틴 뒤 전신으로 밀어 올립니다.',
      checkpoints: '허리가 꺾이지 않는지, 어깨가 귀 쪽으로 들리지 않는지, 상단에서 팔꿈치 잠금을 과하게 치지 않는지 확인하세요.',
      caution: '깊이를 무리하게 늘리면 앞어깨에 부담이 갈 수 있으니 어깨 위치가 불편해지는 지점 전에서 멈추는 편이 좋습니다.',
    };
  }

  if (hasAny(name, ['풀업', '친업', '랫풀다운', '풀다운'])) {
    return {
      key: '팔로 당기기 전에 견갑을 아래로 내리고, 가슴을 세운 상태에서 광배로 끌어당기는 것이 중요합니다.',
      how: '시작 자세에서 어깨를 끌어내린 뒤 팔꿈치를 몸통 옆으로 보내며 당기고, 내려갈 때는 등 긴장을 유지한 채 천천히 늘려 줍니다.',
      checkpoints: '상체를 과하게 젖히지 않는지, 턱만 빼며 올라가지 않는지, 하강 구간을 급하게 놓지 않는지 확인하세요.',
      caution: '반동으로 반복 수만 늘리면 자극이 등에서 빠지므로, 완전 가동범위를 쓸 수 있는 난이도로 조절하는 것이 낫습니다.',
    };
  }

  if (hasAny(name, ['로우'])) {
    return {
      key: '몸통을 고정한 채 팔꿈치를 뒤로 보내며 등 중앙을 모으는 감각을 유지하는 것이 핵심입니다.',
      how: '견갑을 먼저 가볍게 모은 뒤 팔꿈치를 몸통 뒤쪽으로 당기고, 상단에서 1초 정도 버틴 뒤 천천히 풀어 줍니다.',
      checkpoints: '상체가 들썩이지 않는지, 어깨가 앞으로 말리지 않는지, 하단에서 긴장을 완전히 풀어 버리지 않는지 확인하세요.',
      caution: '중량 때문에 몸을 젖혀 당기면 로우보다 치팅이 되기 쉬우니, 상체 각도와 복압을 먼저 고정합니다.',
    };
  }

  if (hasAny(name, ['오버헤드 프레스', '숄더 프레스', '랜드마인 프레스', '푸시 프레스'])) {
    return {
      key: '갈비뼈가 들리지 않도록 코어를 고정한 채, 손목-팔꿈치-중량이 같은 선으로 움직이게 만드는 것이 중요합니다.',
      how: '시작 자세에서 팔꿈치를 바 아래에 두고 머리 위로 곧게 밀어 올리며, 상단에서 귀 옆으로 팔이 정렬되도록 마무리합니다.',
      checkpoints: '허리가 과하게 젖혀지지 않는지, 어깨가 으쓱 올라가지 않는지, 손목이 뒤로 꺾이지 않는지 확인하세요.',
      caution: '가동성이 부족한데 무리하게 수직 궤적을 고집하면 허리 보상이 커질 수 있으니 범위를 조절합니다.',
    };
  }

  if (hasAny(name, ['레터럴 레이즈', '프론트 레이즈', '리버스 플라이', 'Y 레이즈', '페이스 풀', '업라이트 로우', '슈러그'])) {
    return {
      key: '반동 없이 어깨의 목표 부위가 수축되는 구간을 느끼면서 천천히 드는 것이 중요합니다.',
      how: '견갑을 안정시킨 뒤 정해진 궤적으로 들어 올리고, 상단에서 잠깐 멈춘 후 같은 속도로 내려옵니다.',
      checkpoints: '승모로만 버티지 않는지, 팔꿈치와 손목 각도가 중간에 무너지지 않는지, 상단에서 몸통이 흔들리지 않는지 확인하세요.',
      caution: '가벼운 운동처럼 보여도 반동이 들어가기 쉬우니, 반복 수보다 긴장 유지 시간을 먼저 챙겨 주세요.',
    };
  }

  if (hasAny(name, ['컬'])) {
    return {
      key: '팔꿈치를 고정하고 이두나 전완이 수축되는 구간을 정확히 쓰는 것이 핵심입니다.',
      how: '손잡이를 쥐고 팔꿈치 굽힘으로만 들어 올리며, 상단에서 잠깐 멈춘 뒤 천천히 신장 구간을 버텨 내려옵니다.',
      checkpoints: '어깨가 같이 말려 올라가지 않는지, 허리를 젖혀 치팅하지 않는지, 하단에서 텐션이 사라지지 않는지 확인하세요.',
      caution: '중량을 억지로 올리면 전완만 먼저 지치기 쉬우니 팔꿈치 고정이 깨지지 않는 범위에서 진행합니다.',
    };
  }

  if (hasAny(name, ['트라이셉', '푸시 다운', '스컬 크러셔', '킥백', '클로즈 그립 벤치프레스'])) {
    return {
      key: '팔꿈치 위치를 크게 흔들지 않고 삼두가 펴지는 구간을 끝까지 통제하는 것이 중요합니다.',
      how: '시작 자세에서 팔꿈치를 세팅한 뒤 부드럽게 밀거나 펴고, 끝지점에서 잠깐 멈춘 뒤 천천히 원위치로 돌아옵니다.',
      checkpoints: '어깨가 앞쪽으로 튀어나오지 않는지, 팔꿈치가 과하게 벌어지지 않는지 확인하세요.',
      caution: '관절 락아웃을 세게 찍는 습관은 팔꿈치 부담을 키울 수 있으므로 부드럽게 마무리합니다.',
    };
  }

  if (hasAny(name, ['크런치', '싯업', '레그 레이즈', '플랭크', '할로우', '사이드 벤드', '트위스트', '니 레이즈'])) {
    return {
      key: '허리를 꺾는 대신 갈비뼈와 골반을 가까이 유지하며 복부 긴장을 계속 이어 가는 것이 핵심입니다.',
      how: '반복 내내 배를 납작하게 유지하고, 동작 크기보다 복부 수축과 이완을 천천히 느끼며 수행합니다.',
      checkpoints: '목에 힘이 과하게 들어가지 않는지, 허리가 먼저 꺾이지 않는지, 반동으로 다음 반복을 만들지 않는지 확인하세요.',
      caution: '복근 운동은 속도를 올릴수록 허리 보상이 커지기 쉬우니 반복 수보다 자세 품질을 우선합니다.',
    };
  }

  if (hasAny(name, ['클린', '저크', '스내치', '하이풀', '쓰러스터'])) {
    return {
      key: '폭발적인 타이밍이 중요하지만, 시작은 항상 바를 몸 가까이 두고 힘 전달 순서를 지키는 데서 출발합니다.',
      how: '하체 드라이브로 속도를 만들고, 바가 떠오르는 동안 몸에 가깝게 끌어오며 캐치 자세에서는 중심을 즉시 안정시킵니다.',
      checkpoints: '초반에 팔로 먼저 당기지 않는지, 캐치 때 무릎과 발목이 흔들리지 않는지, 바가 몸에서 멀어지지 않는지 보세요.',
      caution: '피로가 쌓이면 기술 동작이 무너지기 쉬우니 반복 수를 많이 밀기보다 품질이 떨어지기 전 끊는 편이 좋습니다.',
    };
  }

  if (category === 'cardio') {
    return {
      key: '자세와 리듬이 무너지지 않는 강도로 시간을 쌓고, 기록은 거리·시간·심박·자각 난이도를 함께 남기는 것이 좋습니다.',
      how: '호흡이 과하게 깨지지 않는 템포를 유지하면서 페이스 변화나 인터벌이 있다면 구간별 느낌도 간단히 메모해 둡니다.',
      checkpoints: '과보폭이나 과도한 상체 긴장이 없는지, 장비 사용 시 리듬이 일정한지 확인하세요.',
      caution: '기록 경쟁만 하다 보면 회복이 밀리기 쉬우니 근력운동 주간 볼륨과 함께 강도를 조절합니다.',
    };
  }

  return defaultSections;
}

function buildInstructions(name: string, category: StrengthExerciseCategory) {
  const sections = buildInstructionSections(name, category);
  return [
    `핵심: ${sections.key}`,
    `방법: ${sections.how}`,
    `체크포인트: ${sections.checkpoints}`,
    `주의: ${sections.caution}`,
  ].join('\n');
}

function makeExercises(category: StrengthExerciseCategory, names: string[]): ExerciseDefinition[] {
  return names.map((name) => ({
    id: slugify(name),
    name,
    category,
    instructions: buildInstructions(name, category),
    ...resolveTrackingMeta(name),
    equipmentLabel: resolveEquipmentLabel(name, category),
    muscleMap: resolveMuscleMap(name, category),
  }));
}

export const defaultWorkoutActivities: WorkoutActivityDefinition[] = [
  { id: 'walk', label: '걷기', sessionType: 'cardio', kind: 'other', category: 'cardio', removable: true },
  { id: 'run', label: '달리기', sessionType: 'cardio', kind: 'running', category: 'cardio', removable: true },
  { id: 'badminton', label: '배드민턴', sessionType: 'cardio', kind: 'badminton', category: 'sport', removable: true },
  { id: 'treadmill', label: '트레드밀', sessionType: 'cardio', kind: 'running', category: 'cardio', removable: true },
  { id: 'cycle', label: '싸이클', sessionType: 'cardio', kind: 'other', category: 'cardio', removable: true },
  { id: 'rowing', label: '로잉 머신', sessionType: 'cardio', kind: 'other', category: 'cardio', removable: true },
  { id: 'stair', label: '계단 오르기', sessionType: 'cardio', kind: 'other', category: 'cardio', removable: true },
  { id: 'jump-rope', label: '줄넘기', sessionType: 'cardio', kind: 'other', category: 'cardio', removable: true },
  { id: 'assault-bike', label: '어썰트 바이크', sessionType: 'cardio', kind: 'other', category: 'cardio', removable: true },
  { id: 'stepmill', label: '스텝밀', sessionType: 'cardio', kind: 'other', category: 'cardio', removable: true },
];

const lower = [
  '컨벤셔널 데드리프트', '바벨 백스쿼트', '스미스머신 스플릿 스쿼트', '스미스머신 데드리프트', '스미스머신 스쿼트',
  '덤벨 런지', '덤벨 고블릿 스쿼트', '덤벨 스티프 레그 데드리프트', '프론트 스쿼트', '저처 스쿼트',
  '바벨 불가리안 스플릿 스쿼트', '덤벨 불가리안 스플릿 스쿼트', '덤벨 스플릿 스쿼트', '맨몸 스플릿 스쿼트', '에어 스쿼트',
  '점프 스쿼트', '케틀벨 고블릿 스쿼트', '루마니안 데드리프트', '스모 데드리프트', '레그 프레스',
  '레그 컬', '레그 익스텐션', '스탠딩 카프 레이즈', '이너 싸이 머신', '런지',
  '스텝업', '중량 스텝업', '힙 쓰러스트', '바벨 힙 쓰러스트', '브이 스쿼트',
  '리버스 브이 스쿼트', '글루트 킥백 머신', '힙 어브덕션 머신', '시티드 카프 레이즈', '정지 백 스쿼트',
  '트랩바 데드리프트', '케이블 힙 어브덕션', '핵 스쿼트 머신', '정지 데드리프트', '정지 스모 데드리프트',
  '바벨 박스 스쿼트', '바벨 프론트 랙 런지', '바벨 점프 스쿼트', '바벨 런지', '바벨 레터럴 런지',
  '바벨 스플릿 스쿼트', '바벨 스탠딩 카프 레이즈', '스티프 레그 데드리프트', '맨몸 오버헤드 스쿼트', '덤벨 스모 스쿼트',
  '덤벨 레그 컬', '덤벨 스쿼트', '바벨 핵 스쿼트', '시티드 레그 컬', '힙 쓰러스트 머신',
  '맨몸 카프 레이즈', '글루트 브릿지', '덤벨 루마니안 데드리프트', '라잉 힙 어브덕션', '싱글 레그 글루트 브릿지',
  '피스톨 박스 스쿼트', '사이드 라잉 클램', '맨몸 원레그 데드리프트', '바벨 원레그 데드리프트', '덤벨 원레그 데드리프트',
  '케틀벨 데드리프트', '케틀벨 스모 데드리프트', '덤벨 스모 데드리프트', '덤벨 레터럴 런지', '케틀벨 레터럴 런지',
  '맨몸 레터럴 런지', '원레그 익스텐션', '원레그 컬', '원레그 프레스', '수평 레그 프레스',
  '수평 원레그 프레스', '시티드 원레그 컬', '노르딕 햄스트링 컬', '바벨 스모 스쿼트', '케틀벨 스모 스쿼트',
  '스모 에어 스쿼트', '피스톨 스쿼트', '덩키 킥', '케이블 덩키 킥', '데피싯 데드리프트',
  '런지 트위스트', '케틀벨 런지 트위스트', '케이블 풀 스루', '몬스터 글루트 머신',
];

const shoulder = [
  '오버헤드 프레스', '스미스머신 오버헤드 프레스', '스미스머신 슈러그', '덤벨 숄더 프레스', '덤벨 레터럴 레이즈',
  '벤트오버 덤벨 레터럴 레이즈', '아놀드 덤벨 프레스', '숄더 프레스 머신', '비하인드 넥 프레스', '덤벨 프론트 레이즈',
  '덤벨 슈러그', '바벨 슈러그', '페이스 풀', '핸드스탠드', '핸드스탠드 푸시업',
  '케이블 리버스 플라이', '바벨 업라이트 로우', '덤벨 업라이트 로우', '이지바 업라이트 로우', '푸시 프레스',
  '리어 델토이드 플라이 머신', '레터럴 레이즈 머신', '케이블 레터럴 레이즈', '케이블 프론트 레이즈', '이지바 프론트 레이즈',
  '시티드 덤벨 리어 레터럴 레이즈', '숄더 탭', '시티드 바벨 숄더 프레스', '시티드 덤벨 숄더 프레스', '플레이트 숄더 프레스',
  'Y 레이즈', '덤벨 Y 레이즈', '슈러그 머신', '케이블 슈러그', '케이블 인터널 로테이션',
  '케이블 익스터널 로테이션', '원암 케이블 레터럴 레이즈', '랜드마인 프레스', '원암 랜드마인 프레스',
];

const chest = [
  '벤치프레스', '스미스머신 벤치프레스', '스미스머신 인클라인 벤치프레스', '덤벨 벤치프레스', '인클라인 덤벨 벤치프레스',
  '덤벨 플라이', '스탠딩 케이블 플라이', '인클라인 벤치프레스', '딥스', '중량 딥스',
  '인클라인 덤벨 플라이', '푸시업', '중량 푸시업', '힌두 푸시업', '아처 푸시업',
  '클로즈그립 푸시업', '체스트 프레스 머신', '펙덱 플라이 머신', '인클라인 벤치프레스 머신', '덤벨 풀오버',
  '시티드 딥스 머신', '로우 풀리 케이블 플라이', '해머 벤치프레스', '스포토 벤치프레스', '어시스트 딥스 머신',
  '디클라인 벤치프레스', '바벨 플로어 프레스', '클랩 푸시업', '디클라인 덤벨 플라이', '인클라인 푸시업',
  '파이크 푸시업', '디클라인 체스트 프레스 머신', '인클라인 덤벨 트위스트 프레스', '인클라인 케이블 플라이', '덤벨 스퀴즈 프레스',
];

const arms = [
  '덤벨 트라이셉 익스텐션', '덤벨 킥백', '케이블 푸시 다운', '바벨 컬', '이지바 컬',
  '덤벨 해머 컬', '클로즈 그립 벤치프레스', '시티드 덤벨 트라이셉 익스텐션', '케이블 트라이셉 익스텐션', '바벨 리스트 컬',
  '이지바 리스트 컬', '덤벨 리스트 컬', '스컬 크러셔', '바벨 라잉 트라이셉 익스텐션', '덤벨 프리쳐 컬',
  '바벨 프리쳐 컬', '이지바 프리쳐 컬', '프리쳐 컬 머신', '암 컬 머신', '케이블 해머컬',
  '케이블 오버헤드 트라이셉 익스텐션', '케이블 라잉 트라이셉 익스텐션', '리버스 바벨 리스트 컬', '리버스 덤벨 리스트 컬', '인클라인 덤벨 컬',
  '벤치 딥스', '리스트 롤러', '리버스 바벨 컬', '트라이셉 익스텐션 머신',
];

const core = [
  '싯업', '크런치', '힐 터치', '레그 레이즈', '행잉 레그 레이즈',
  '할로우 락', '할로우 포지션', '플랭크', '덤벨 사이드 벤드', '복근 롤아웃',
  '복근 에어 바이크', '행잉 니 레이즈', '복근 크런치 머신', '행 클린', '행 스내치',
  '필라테스 잭나이프', '리버스 크런치', '사이드 플랭크', '45도 사이드 벤드', 'RKC 플랭크',
  '케이블 사이드 벤드', '중량 디클라인 크런치', '디클라인 리버스 크런치', '디클라인 싯업', '중량 디클라인 싯업',
  '사이드 크런치', '케이블 트위스트',
];

const back = [
  '스미스머신 로우', '덤벨 로우', '원암 덤벨 로우', '케이블 암 풀다운', '시티드 케이블 로우',
  '굿모닝 엑서사이즈', '풀업', '중량 풀업', '친업', '중량 친업',
  '인클라인 바벨 로우', '인클라인 덤벨 로우', '인버티드 로우', '바벨 풀오버', '시티드 로우 머신',
  '랫풀다운', '중량 하이퍼 익스텐션', '백 익스텐션', '티바 로우 머신', '맥그립 랫풀다운',
  '패러럴그립 랫풀다운', '언더그립 랫풀다운', '정지 바벨 로우', '어시스트 풀업 머신', '플로어 시티드 케이블 로우',
  '언더그립 바벨 로우', '라잉 바벨 로우', '비하인드 넥 풀다운', '원암 케이블 풀다운', '원암 레터럴 와이드 풀다운',
  '로우 로우 머신', '원암 로우 로우 머신', '하이 로우 머신', '언더그립 하이 로우 머신', '원암 하이 로우 머신',
  '원암 시티드 케이블 로우',
];

const other = [
  '클린', '클린 & 저크', '저크', '스내치', '바벨 오버헤드 스쿼트',
  '덤벨 스내치', '케틀벨 스내치', '스내치 밸런스', '중량 행잉 니 레이즈', '클린 하이풀',
  '스내치 하이풀', '쓰러스터', '버피', '케틀벨 스윙', '파머스 워크',
  '월볼 샷', '마운틴 클라이머', '박스 점프', '점핑 잭', '바 머슬업',
  '링 머슬업', '덤벨 버피', '덤벨 쓰러스터', '인치웜', '스모 데드리프트 하이풀',
  '케틀벨 스모 하이풀',
];

const cardio = [
  '트레드밀', '싸이클', '로잉 머신', '계단 오르기', '줄넘기',
  '이단 뛰기', '하이니 스킵', '어썰트 바이크', '스텝밀', '걷기', '달리기',
];

export const workoutExerciseLibrary: ExerciseDefinition[] = [
  ...makeExercises('lower', lower),
  ...makeExercises('shoulder', shoulder),
  ...makeExercises('chest', chest),
  ...makeExercises('arms', arms),
  ...makeExercises('core', core),
  ...makeExercises('back', back),
  ...makeExercises('other', other),
  ...makeExercises('cardio', cardio),
];

export const strengthCategoryLabels: Record<StrengthExerciseCategory, string> = {
  lower: '하체',
  chest: '가슴',
  back: '등',
  shoulder: '어깨',
  arms: '팔',
  core: '복근',
  other: '기타',
  cardio: '유산소',
};
