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
 * 지역 접두사를 뗀 형태. 마스터 목록 대조와 비교에만 씁니다.
 *
 * ⚠️ 조건이 핵심입니다. 접두사를 뗀 뒤에도 '이름 부분'이 남아 있을 때만 뗍니다.
 *    이 조건이 없으면 '서울고등학교' → '고등학교', '경기고등학교' → '고등학교' 가 되어
 *    실존하는 서로 다른 학교가 같은 학교로 합쳐집니다.
 *      서울고척초등학교 → 고척초등학교   (이름 '고척'이 남음 → 뗀다)
 *      서울고등학교     → 그대로          (이름이 안 남음 → 떼지 않는다)
 *      경기고등학교     → 그대로
 */
const stripRegionPrefix = (normalized) => {
  for (const p of REGION_PREFIXES) {
    if (!normalized.startsWith(p)) continue;
    const rest = normalized.slice(p.length);
    // 뗀 나머지가 여전히 '이름 + 학교종류' 형태여야 합니다.
    if (stemOf(rest).length >= 2) return rest;
  }
  return normalized;
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
  return stripRegionPrefix(na) === stripRegionPrefix(nb);
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

  // 2차: 지역 접두사 유무만 다른 경우 ('고척초' → '서울고척초등학교')
  const bare = stripRegionPrefix(key);
  for (const type of ['elementary', 'middle', 'high']) {
    const list = schoolsData[type];
    if (!Array.isArray(list)) continue;
    const hit = list.find(name => stripRegionPrefix(normalizeSchoolName(name)) === bare);
    if (hit) return hit;
  }

  return null;
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
