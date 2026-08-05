/* 어휘량 추정 및 티어 계산.

   기존에는 AcademyUniverse / StudentVocaDaily / VocaManager 세 파일에
   같은 함수가 복사되어 있었습니다(줄바꿈만 다르고 로직은 동일).
   티어 기준을 조정하려면 세 곳을 모두 고쳐야 했고, 한 곳만 놓치면
   같은 학생의 등급이 화면마다 다르게 보이는 문제가 생깁니다.

   ⚠️ 아래 값과 반환 형태는 기존 세 파일의 동작을 그대로 옮긴 것입니다.
      화면에서 tier.percent, tier.name, tier.color 등을 그대로 쓰고 있으므로
      반환하는 키 이름을 바꾸면 표시가 깨집니다. */

/** 어휘 티어 구간 정의 (누적 추정 단어 수 기준) */
export const VOCA_TIERS = [
    { name: '초등 기초 (초3~4)', limit: 500, color: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
    { name: '초등 필수 (초5~6)', limit: 800, color: 'bg-orange-400', bg: 'bg-orange-50', text: 'text-orange-700' },
    { name: '중등 기초 (중1)', limit: 1400, color: 'bg-lime-500', bg: 'bg-lime-50', text: 'text-lime-700' },
    { name: '중등 발전 (중2)', limit: 2000, color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    { name: '중등 마스터 (중3)', limit: 2800, color: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-700' },
    { name: '고등 기초 (고1)', limit: 4000, color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
    { name: '고등 발전 (고2)', limit: 6000, color: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700' },
    { name: '수능 완성 (고3)', limit: 8500, color: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
    { name: '최상위 (TEPS/TOEFL)', limit: 99999, color: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' }
];

/**
 * 하이브리드 어휘량 추정.
 * CAT 진단 점수로 기본 어휘량을 환산하고, 실제로 외운 단어 수를 더합니다.
 */
export const getTierProgress = (masteredCount = 0, catScore = 0) => {
    const baseVocab = catScore ? Math.floor(catScore * 8.5) : 0;
    const totalEstimatedWords = baseVocab + masteredCount;

    let prevLimit = 0;
    let currentTier = VOCA_TIERS[0];

    for (let i = 0; i < VOCA_TIERS.length; i++) {
        if (totalEstimatedWords < VOCA_TIERS[i].limit) {
            currentTier = VOCA_TIERS[i];
            break;
        }
        prevLimit = VOCA_TIERS[i].limit;
        if (i === VOCA_TIERS.length - 1) currentTier = VOCA_TIERS[i];
    }

    const currentBracketMastered = Math.max(0, totalEstimatedWords - prevLimit);
    const bracketTotal = currentTier.limit - prevLimit;
    const percent = Math.min(100, Math.round((currentBracketMastered / bracketTotal) * 100));

    return { ...currentTier, percent, currentBracketMastered, bracketTotal, totalMastered: totalEstimatedWords };
};
