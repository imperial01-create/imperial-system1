/* 학교명 표기 통일 유틸

   [배경]
   같은 학교가 '영일고', '영일 고등학교', '영일고등학교' 처럼 여러 표기로 저장되어
   화면마다 검색 결과가 달랐습니다. 특히 학사일정(academic_calendars)은 드롭다운으로만
   등록되어 항상 정식 명칭인데, 학생 프로필은 자유 입력이라 표기가 어긋나면
   시험기간 출결 면제가 적용되지 않는 실제 피해가 있었습니다.

   [설계 원칙]
   전국 학교 DB는 쓰지 않습니다. 학원이 관리하는 마스터 목록(환경설정 > 학교 마스터)이
   유일한 정본이며, 이 파일은 '입력값을 그 정본에 맞추는' 역할만 합니다.
   규칙은 접미사 정리 몇 가지뿐이라 지역이 바뀌어도 그대로 쓸 수 있습니다.
*/

/**
 * 비교용 정규화 키를 만듭니다.
 * 공백·문장부호를 없애고 축약 접미사를 정식 명칭으로 펼칩니다.
 *
 *   '영일고'        → '영일고등학교'
 *   '영일 고등학교'  → '영일고등학교'
 *   '목동여고'      → '목동여자고등학교'
 *   '월촌초'        → '월촌초등학교'
 */
/* 축약 접미사를 정식 명칭으로 '펼치는' 표.
   ⚠️ 순서가 중요합니다. 긴 것부터 검사해야 '대원외고'가 일반 '고' 규칙에 먼저
      걸려 '대원외고등학교'라는 존재하지 않는 이름이 되는 사고를 막습니다. */
const SUFFIX_EXPANSIONS = [
  ['외고', '외국어고등학교'],
  ['과고', '과학고등학교'],
  ['예고', '예술고등학교'],
  ['체고', '체육고등학교'],
  ['공고', '공업고등학교'],
  ['상고', '상업고등학교'],
  ['여고', '여자고등학교'],
  ['여중', '여자중학교'],
  ['초', '초등학교'],
  ['중', '중학교'],
  ['고', '고등학교'],
];

/* 공식 명칭에만 붙는 지역 접두사. 사람들은 보통 빼고 부릅니다.
   예: 공식 '서울고척초등학교' ↔ 통칭 '고척초'
   키 자체에서 제거하면 다른 지역 같은 이름과 섞이므로, 여기서는 지우지 않고
   마스터 목록과 대조할 때만 유연하게 봅니다(findCanonicalSchool 참고). */
const REGION_PREFIXES = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

export const normalizeSchoolName = (raw) => {
  const s = String(raw || '').replace(/[\s·.,()[\]'"-]/g, '');
  if (!s) return '';

  // 이미 정식 명칭이면 그대로 둡니다.
  if (/(초등학교|중학교|고등학교)$/.test(s)) return s;

  for (const [short, full] of SUFFIX_EXPANSIONS) {
    if (s.endsWith(short)) return s.slice(0, -short.length) + full;
  }

  // 학교 종류를 알 수 없으면(예: '한국삼육') 추측하지 않고 그대로 둡니다.
  return s;
};

/* 학교 종류 접미사. 긴 것부터 확인해야 '여자고등학교'가 '고등학교'로 잘리지 않습니다. */
const TYPE_SUFFIXES = ['여자고등학교', '여자중학교', '초등학교', '중학교', '고등학교'];

/** 학교 종류를 뗀 '이름 부분'. 예: '서울고척초등학교' → '서울고척' */
const stemOf = (normalized) => {
  for (const suf of TYPE_SUFFIXES) {
    if (normalized.endsWith(suf)) return normalized.slice(0, -suf.length);
  }
  return normalized;
};

/**
 * 지역 접두사를 분리합니다. → [접두사 또는 null, 나머지]
 *
 *   '서울고척초등학교' → ['서울', '고척초등학교']
 *   '서울고등학교'     → [null, '서울고등학교']   (이름이 안 남으므로 접두사로 보지 않음)
 */
const splitRegionPrefix = (normalized) => {
  for (const p of REGION_PREFIXES) {
    if (!normalized.startsWith(p)) continue;
    const rest = normalized.slice(p.length);
    if (stemOf(rest).length >= 2) return [p, rest];
  }
  return [null, normalized];
};

/**
 * 두 학교명이 같은 학교를 가리키는지 비교합니다.
 *
 * 완전히 같은 경우 외에, 지역 접두사 유무만 다른 경우도 같다고 봅니다.
 * (공식 명칭 '서울고척초등학교' ↔ 학부모가 적은 '고척초')
 * 학교 종류(초/중/고)는 정규화 결과에 그대로 남으므로
 * '목동중학교'와 '목동고등학교'가 섞이는 일은 구조적으로 없습니다.
 */
export const isSameSchool = (a, b) => {
  const na = normalizeSchoolName(a);
  const nb = normalizeSchoolName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const [pa, ra] = splitRegionPrefix(na);
  const [pb, rb] = splitRegionPrefix(nb);

  /* ⚠️ 핵심 규칙: 지역을 '생략한 것'만 같다고 보고, '지역이 다른 것'은 다른 학교로 봅니다.
     양쪽 모두 지역을 명시했는데 문자열이 다르다면 서로 다른 학교입니다.
     이 조건이 없으면 '서울과학고등학교'와 '경기과학고등학교'가 둘 다 '과학고등학교'가 되어
     전국 시도별 과학고·외국어고·예술고가 한 학교로 뭉칩니다. */
  if (pa && pb) return false;

  return ra === rb;
};

/** 학교급을 추론합니다. 못 하면 null. */
export const detectSchoolType = (raw) => {
  const s = normalizeSchoolName(raw);
  if (/초등학교$/.test(s)) return 'elementary';
  if (/중학교$/.test(s)) return 'middle';
  if (/고등학교$/.test(s)) return 'high';
  return null;
};

/**
 * 마스터 목록(환경설정의 schools)에서 정식 명칭을 찾습니다.
 * 표기가 달라도 같은 학교면 목록에 등록된 정본을 돌려줍니다.
 * 목록에 없으면 null.
 */
export const findCanonicalSchool = (raw, schoolsData) => {
  const key = normalizeSchoolName(raw);
  if (!key || !schoolsData) return null;

  // 1차: 정확히 같은 키
  for (const type of ['elementary', 'middle', 'high']) {
    const list = schoolsData[type];
    if (!Array.isArray(list)) continue;
    const hit = list.find(name => normalizeSchoolName(name) === key);
    if (hit) return hit;
  }

  /* 2차: 사용자가 지역 접두사를 '생략'한 경우만 찾아줍니다. ('고척초' → '서울고척초등학교')
     지역을 명시했는데 1차에서 못 찾았다면, 그건 마스터 목록에 없는 학교입니다.
     이때 억지로 다른 지역 학교에 붙이면 안 됩니다. */
  const [inPrefix] = splitRegionPrefix(key);
  if (inPrefix) return null;

  const hits = [];
  for (const type of ['elementary', 'middle', 'high']) {
    const list = schoolsData[type];
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      if (isSameSchool(name, key)) hits.push(name);
    }
  }

  /* 후보가 둘 이상이면 고르지 않습니다.
     예를 들어 마스터에 '서울대신중학교'와 '부산대신중학교'가 함께 있는데
     사용자가 '대신중'이라고만 적었다면, 어느 쪽인지 알 수 없습니다.
     이럴 때 첫 번째를 골라 저장하면 조용히 잘못된 학교로 기록됩니다. */
  return hits.length === 1 ? hits[0] : null;
};

/**
 * Firestore 조회용 학교명 후보 목록을 만듭니다.
 *
 * 과거 데이터에는 같은 학교가 여러 표기로 저장돼 있어, 한 가지 이름으로만
 * 조회하면 놓칩니다. 그렇다고 전부 받아와 걸러내면 요금이 커지므로,
 * '있을 법한 표기'만 만들어 in 쿼리로 좁히고 결과를 isSameSchool로 다시 거릅니다.
 *
 * ⚠️ Firestore의 in 연산자는 최대 30개까지만 허용하므로 잘라냅니다.
 */
export const buildSchoolQueryVariations = (raw, schoolsData) => {
  const input = String(raw || '').trim();
  if (!input) return [];

  const canonical = findCanonicalSchool(input, schoolsData) || normalizeSchoolName(input);
  const out = new Set([input, canonical, normalizeSchoolName(input)]);

  // 정식 명칭 ↔ 축약형 ↔ 공백 포함형을 서로 만들어 둡니다.
  const add = (v) => { if (v) out.add(v); };
  const pairs = [
    ['초등학교', '초'],
    ['중학교', '중'],
    ['고등학교', '고'],
    ['여자중학교', '여중'],
    ['여자고등학교', '여고'],
  ];

  for (const base of [canonical, normalizeSchoolName(input)]) {
    if (!base) continue;
    for (const [full, short] of pairs) {
      if (base.endsWith(full)) {
        const stem = base.slice(0, -full.length);
        add(stem + short);              // 영일고
        add(stem + ' ' + full);         // 영일 고등학교
        add(stem);                      // 영일
      }
    }
  }

  return [...out].filter(Boolean).slice(0, 30);
};

/**
 * 저장하기 직전에 학교명을 다듬습니다.
 * 마스터 목록에 있으면 그 정본을, 없으면 최소한 공백만 정리해서 돌려줍니다.
 * (없는 학교를 임의로 바꾸지는 않습니다 — 잘못된 추측이 더 위험하기 때문입니다.)
 */
export const toStorableSchoolName = (raw, schoolsData) => {
  const trimmed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return findCanonicalSchool(trimmed, schoolsData) || trimmed;
};
