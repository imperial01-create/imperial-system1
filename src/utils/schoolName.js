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
export const normalizeSchoolName = (raw) => {
  let s = String(raw || '').replace(/[\s·.,()[\]'"-]/g, '');
  if (!s) return '';

  // 이미 정식 명칭이면 그대로 둡니다.
  if (/(초등학교|중학교|고등학교)$/.test(s)) return s;

  // 여고/여중은 '여자'가 생략된 형태라 따로 처리합니다. (일반 고/중 규칙보다 먼저)
  if (/여고$/.test(s)) return s.replace(/여고$/, '여자고등학교');
  if (/여중$/.test(s)) return s.replace(/여중$/, '여자중학교');

  if (/초$/.test(s)) return s.replace(/초$/, '초등학교');
  if (/중$/.test(s)) return s.replace(/중$/, '중학교');
  if (/고$/.test(s)) return s.replace(/고$/, '고등학교');

  // 접미사가 없으면(예: '한국삼육') 판단하지 않고 그대로 둡니다.
  return s;
};

/** 두 학교명이 같은 학교를 가리키는지 비교합니다. */
export const isSameSchool = (a, b) => {
  const na = normalizeSchoolName(a);
  const nb = normalizeSchoolName(b);
  return !!na && na === nb;
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

  for (const type of ['elementary', 'middle', 'high']) {
    const list = schoolsData[type];
    if (!Array.isArray(list)) continue;
    const hit = list.find(name => normalizeSchoolName(name) === key);
    if (hit) return hit;
  }
  return null;
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
