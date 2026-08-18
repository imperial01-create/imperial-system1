/* [src/utils/errorTaxonomy.js]
   오답 원인 분류. 수학 능력 지표의 인지 4축과 1:1로 붙습니다.

   [왜 고정 칩인가]
   조교는 이미 클리닉에서 학생 풀이를 함께 보고 있고, 이미 태그를 자유 텍스트로
   타이핑하고 있습니다. 그 자유 텍스트를 고정 칩으로 바꾸면
   조교 시간은 늘지 않으면서 집계 가능한 신호가 생깁니다.

   자유 텍스트로 두면 '#개념보충' / '개념 보충' / '개념부족' 이 서로 다른 값이 되어
   아무리 쌓여도 셀 수 없습니다.

   [왜 조교가 오답마다 판정하지 않는가]
   오답마다 원인을 가리려면 풀이를 다시 읽어야 합니다. 그것은 원장이 이미 폐기한
   'lucky(찍어서 맞음)' 판정과 같은 비용 구조입니다.
   클리닉은 이미 풀이를 보는 자리이므로, 거기서 세션 단위로만 받습니다.

   [학부모에게는 다른 말을 씁니다]
   '손도 못 댐' 은 진단이지 통보할 말이 아닙니다.
   문자와 리포트에는 처방 쪽 표현(parentLabel)을 씁니다.
*/

export const ERROR_TAGS = [
    {
        code: 'condition',
        label: '조건을 빠뜨림',
        hint: '조건 하나를 안 쓰고 답을 냈다',
        axis: '조건 독해력',
        parentLabel: '문제 조건 확인',
        prescription: '조건에 밑줄 긋기 · 조건 체크리스트'
    },
    {
        code: 'assembly',
        label: '손도 못 댐',
        hint: '어디서 시작할지를 못 찾았다',
        axis: '개념 조립력',
        parentLabel: '개념 다지기',
        prescription: '개념 재확인 후 기본 문항'
    },
    {
        code: 'pattern',
        label: '풀어본 건데 시작을 못 함',
        hint: '전에 같은 개념으로 풀었는데 이번엔 못 떠올렸다',
        axis: '유형 매칭력',
        parentLabel: '유형 복습',
        prescription: '같은 유형 재노출'
    },
    {
        code: 'calc',
        label: '방향은 맞고 계산에서 무너짐',
        hint: '식은 세웠는데 전개에서 틀렸다',
        axis: '연산 견고함',
        parentLabel: '계산 정확도',
        prescription: '중간식 쓰기 · 계산 훈련'
    },
    {
        code: 'transcribe',
        label: '다 풀고 옮겨 적기에서 틀림',
        hint: '답만 잘못 옮겼다',
        axis: '연산 견고함',
        parentLabel: '검산 습관',
        prescription: '답 옮긴 뒤 한 번 대조'
    }
];

export const ERROR_TAG_BY_CODE = ERROR_TAGS.reduce((m, t) => { m[t.code] = t; return m; }, {});

/* 옛 분류. 기록 관리 화면이 쓰던 목록이다.
   'time(시간 부족)' 과 'blank(미시도)' 는 원인이 아니라 상태이고,
   이제 채점의 무응답 표시(mark: 'blank')가 담당한다. 새로 고를 수는 없지만
   이미 저장된 값은 화면에 그대로 보여야 하므로 이름만 남긴다. */
export const LEGACY_ERROR_LABEL = {
    concept: '개념 모름',      // → assembly
    time: '시간 부족',          // → 무응답으로 대체됨
    blank: '미시도'            // → 무응답으로 대체됨
};

/** 저장된 코드 하나를 화면에 쓸 이름으로. 옛 값도 읽힙니다. */
export const errorLabelOf = (code) =>
    ERROR_TAG_BY_CODE[code]?.label || LEGACY_ERROR_LABEL[code] || null;

export const isErrorTagCode = (code) => Object.prototype.hasOwnProperty.call(ERROR_TAG_BY_CODE, code);

/** 저장된 코드 배열을 화면에 쓸 정의로 바꿉니다. 모르는 코드는 버립니다. */
export const tagsFromCodes = (codes) =>
    (Array.isArray(codes) ? codes : []).map(c => ERROR_TAG_BY_CODE[c]).filter(Boolean);

/**
 * 학부모 문자·리포트에 나가는 문구.
 * 진단명이 아니라 처방 쪽 표현을 씁니다 — '손도 못 댐' 을 문자로 보내면 안 됩니다.
 */
export const parentTagText = (codes) => {
    const labels = tagsFromCodes(codes).map(t => t.parentLabel);
    return [...new Set(labels)].join(', ');
};

/** 강사·조교가 보는 처방 안내. */
export const prescriptionsFor = (codes) => {
    const list = tagsFromCodes(codes).map(t => t.prescription);
    return [...new Set(list)];
};
