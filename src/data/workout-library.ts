import {
  StrengthExerciseCategory,
  WorkoutActivityDefinition,
} from '../types';

type ExerciseDefinition = {
  id: string;
  name: string;
  category: StrengthExerciseCategory;
  instructions: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildInstructions(name: string, category: StrengthExerciseCategory) {
  const shared =
    '호흡과 복압을 먼저 잡고, 반동보다 통제된 반복을 우선하세요. 통증이 느껴지면 가동범위를 줄이거나 중량을 낮추는 쪽이 안전합니다.';

  if (name.includes('스쿼트')) {
    return `${name}: 발바닥 전체로 지면을 누르고 무릎과 발끝 방향을 맞춘 채 내려가세요. 내려갈 때 허리가 말리지 않도록 복압을 유지하고, 올라올 때는 엉덩이와 허벅지로 바닥을 민다는 느낌이 좋습니다. ${shared}`;
  }

  if (name.includes('데드리프트')) {
    return `${name}: 바를 몸 가까이 둔 채 가슴을 열고 힙힌지로 시작하세요. 시작부터 허리를 젖히지 말고, 광배를 잠근 상태에서 다리와 엉덩이 힘으로 끌어올리는 것이 핵심입니다. ${shared}`;
  }

  if (name.includes('벤치프레스') || name.includes('체스트 프레스')) {
    return `${name}: 견갑을 뒤로 모으고 가슴을 열어 어깨가 말리지 않게 세팅하세요. 바는 가슴 중앙~아래쪽으로 안정적으로 내리고, 손목이 꺾이지 않도록 수직으로 밀어 올리세요. ${shared}`;
  }

  if (name.includes('랫풀다운') || name.includes('풀다운')) {
    return `${name}: 상체를 과하게 뒤로 젖히지 말고 가슴을 세운 상태에서 시작하세요. 팔보다 등으로 끌어당긴다는 느낌으로 바를 쇄골 쪽으로 내리고, 올라갈 때도 광배 긴장을 끝까지 유지하세요. ${shared}`;
  }

  if (name.includes('로우')) {
    return `${name}: 몸통을 고정한 채 팔꿈치를 뒤로 보낸다는 느낌으로 당기세요. 어깨가 앞으로 말리지 않게 견갑을 먼저 모으고, 상단 수축에서 등을 잠깐 멈춰주면 자극이 더 선명합니다. ${shared}`;
  }

  if (name.includes('프레스')) {
    return `${name}: 손목과 팔꿈치가 같은 선상에 있도록 세팅하고, 어깨가 들썩이지 않게 코어를 단단히 고정하세요. 밀어 올릴 때 반동을 줄이고, 내릴 때 천천히 버티는 구간까지 챙기는 것이 좋습니다. ${shared}`;
  }

  if (name.includes('런지') || name.includes('스플릿 스쿼트')) {
    return `${name}: 앞발 전체로 지면을 안정적으로 누르고 상체를 과하게 숙이지 마세요. 내려갈 때 무릎과 골반이 흔들리지 않게 통제하고, 올라오면서 엉덩이와 허벅지 앞쪽 자극을 느껴보세요. ${shared}`;
  }

  if (name.includes('컬')) {
    return `${name}: 팔꿈치 위치를 몸통 옆에 고정하고 반동 없이 팔꿈치 굽힘으로만 들어 올리세요. 위쪽 수축에서 잠깐 멈추고, 내려갈 때도 이두나 햄스트링 긴장을 유지하는 편이 좋습니다. ${shared}`;
  }

  if (name.includes('익스텐션')) {
    return `${name}: 시작 자세에서 관절 정렬을 먼저 맞춘 뒤 끝지점까지 부드럽게 펴 주세요. 락아웃을 세게 찍기보다 목표 근육이 수축하는 지점에서 통제된 정지를 주는 편이 더 안정적입니다. ${shared}`;
  }

  if (name.includes('플랭크')) {
    return `${name}: 머리부터 발끝까지 일직선을 유지하고 갈비뼈가 들리지 않게 복부를 조여 주세요. 시간이 늘어날수록 허리가 꺾이지 않는지 계속 확인하는 것이 중요합니다. ${shared}`;
  }

  if (name.includes('푸시업')) {
    return `${name}: 손으로 바닥을 밀어 견갑을 안정시키고, 몸통이 꺾이지 않게 코어를 단단히 유지하세요. 내려갈 때 가슴이 먼저 닿는 느낌으로 천천히 내리고, 올라올 때는 전신을 한 덩어리처럼 밀어 올리세요. ${shared}`;
  }

  if (category === 'lower') {
    return `${name}: 발 전체로 지면을 밀고 무릎과 발끝 방향을 맞춘 채 내려갔다 올라오세요. 허리가 말리지 않게 코어를 단단히 유지하세요. ${shared}`;
  }

  if (category === 'chest') {
    return `${name}: 견갑을 뒤로 모아 가슴을 열고, 팔꿈치 각도를 과하게 벌리지 않은 채 밀어주세요. 바벨이나 덤벨은 통제된 하강 후 부드럽게 밀어 올리세요. ${shared}`;
  }

  if (category === 'back') {
    return `${name}: 가슴을 세우고 견갑을 먼저 당긴 뒤 팔이 아닌 등으로 끌어온다는 느낌으로 수행하세요. 허리를 꺾기보다 몸통을 단단히 고정하는 편이 좋습니다. ${shared}`;
  }

  if (category === 'shoulder') {
    return `${name}: 어깨를 으쓱하지 말고 견갑을 안정시킨 상태에서 움직이세요. 반동을 줄이고 삼각근이 수축되는 구간을 끝까지 느끼는 데 집중해 주세요. ${shared}`;
  }

  if (category === 'arms') {
    return `${name}: 팔꿈치 위치를 고정하고 목표 근육이 수축되는 구간을 끝까지 가져가세요. 중량 욕심보다 동작 범위와 자극 유지가 훨씬 중요합니다. ${shared}`;
  }

  if (category === 'core') {
    return `${name}: 허리를 과하게 꺾지 말고 갈비뼈와 골반을 가까이 둔다는 느낌으로 버티거나 말아 올리세요. 코어 긴장이 풀리면 반복을 멈추는 편이 낫습니다. ${shared}`;
  }

  if (category === 'cardio') {
    return `${name}: 자세가 무너지지 않는 강도로 페이스를 유지하고, 호흡 리듬과 팔 스윙을 일정하게 가져가세요. 기록은 거리, 시간, 심박, 자각 난이도를 함께 남기면 다음 비교에 도움이 됩니다.`;
  }

  return `${name}: 시작 자세를 먼저 안정적으로 만들고, 가동범위 안에서 통제된 속도로 반복하세요. 중량보다 자세 재현성을 우선하는 편이 결과가 좋습니다. ${shared}`;
}

function makeExercises(category: StrengthExerciseCategory, names: string[]): ExerciseDefinition[] {
  return names.map((name) => ({
    id: slugify(name),
    name,
    category,
    instructions: buildInstructions(name, category),
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
