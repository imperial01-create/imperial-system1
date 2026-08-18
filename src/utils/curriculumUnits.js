/* [src/utils/curriculumUnits.js]
   단원 마스터를 읽는 유일한 경계입니다.

   [왜 필요한가]
   지금까지 개념테스트의 '단원'은 자유 텍스트였습니다.
   '삼각함수' / '삼각함수 ' / '삼각함수(1)' / '삼각함수 심화' 가 서로 다른 단원이 되어,
   히트맵에서 4행으로 갈리고 각각 따로 게이트에 걸려 전부 '자료 부족' 으로 남습니다.

   이 파일은 두 가지를 답합니다.
     1) 이 학생(학교급·연도·학년)은 어느 교육과정인가
     2) 그 과정에는 어떤 단원이 있는가

   과목 판정은 subjectMatch/subjectMapper 가, 단원 판정은 여기가 합니다. 섞지 않습니다.
*/

import { CURRICULUM_UNITS } from '../data/curriculumUnits';

export { CURRICULUM_UNITS };

/* ── 교육과정 판정 ───────────────────────────────────────────
   2022 개정은 학년별로 순차 적용됩니다.
     2025년 고1 / 2026년 고1·고2 / 2027년 이후 전 학년
   subjectMapper.getAvailableSubjects 와 같은 규칙을 씁니다. 두 곳이 어긋나면
   과목 목록과 단원 목록이 다른 교육과정을 가리키게 됩니다. */
export const resolveCurriculum = (schoolType, yearStr, gradeStr) => {
    const year = parseInt(yearStr, 10);
    const grade = parseInt(String(gradeStr ?? '').replace(/[^0-9]/g, ''), 10) || 1;
    if (!Number.isFinite(year)) return '2022';

    if (schoolType === '고등학교') {
        if (year >= 2027) return '2022';
        if (year === 2026 && grade <= 2) return '2022';
        if (year === 2025 && grade === 1) return '2022';
        return '2015';
    }

    /* 중학교는 2022 개정이 2025년 중1부터 순차 적용됩니다.
       ⚠️ 이 규칙은 고등만큼 확실히 확인되지 않았습니다(CURRICULUM_UNITS.md §4-A).
          중등 2015·2022 의 단원 구성 차이는 크지 않아 영향이 작지만,
          교과서가 나오면 다시 봐야 합니다. */
    if (schoolType === '중학교') {
        if (year >= 2027) return '2022';
        if (year === 2026 && grade <= 2) return '2022';
        if (year === 2025 && grade === 1) return '2022';
        return '2015';
    }

    return '2022';
};

/* ── 과목명 → 과정 코드 ──────────────────────────────────────
   마스터의 course 문자열은 subjectMapper 의 과목명과 글자까지 같습니다.
   그래서 문자열 비교로 찾되, 못 찾으면 null 을 돌려 조용히 틀리지 않게 합니다. */
const COURSE_INDEX = (() => {
    const map = new Map();
    CURRICULUM_UNITS.forEach(u => {
        const key = `${u.course}|${u.curriculum}`;
        if (!map.has(key)) map.set(key, u.courseCode);
    });
    return map;
})();

export const courseCodeOf = (courseName, curriculum) =>
    COURSE_INDEX.get(`${String(courseName || '').trim()}|${curriculum}`) || null;

/* ── 단원 목록 ───────────────────────────────────────────── */

/** 과정 하나의 단원을 진도 순서로 돌려줍니다. */
export const unitsOfCourse = (courseName, curriculum) => {
    const name = String(courseName || '').trim();
    if (!name) return [];
    return CURRICULUM_UNITS
        .filter(u => u.course === name && u.curriculum === curriculum)
        .sort((a, b) => a.order - b.order);
};

/**
 * 화면에서 쓰는 주 진입점.
 * 학교급·연도·학년으로 교육과정을 판정하고, 그 과정의 단원을 돌려줍니다.
 */
export const unitsFor = (schoolType, yearStr, gradeStr, courseName) =>
    unitsOfCourse(courseName, resolveCurriculum(schoolType, yearStr, gradeStr));

/** 대단원으로 묶은 형태. 드롭다운의 optgroup 에 씁니다. */
export const groupByCategory = (units) => {
    const groups = [];
    (units || []).forEach(u => {
        const last = groups[groups.length - 1];
        if (last && last.category === u.category) last.units.push(u);
        else groups.push({ category: u.category, categoryOrder: u.categoryOrder, units: [u] });
    });
    return groups;
};

export const findUnit = (unitId) =>
    CURRICULUM_UNITS.find(u => u.unitId === unitId) || null;

/* 두 교육과정에 같은 이름으로 존재하는 단원.
   예) 중등 '수학 3-1 · 인수분해' 는 2015·2022 양쪽에 있습니다.
   목록에 똑같은 줄이 두 번 뜨면 조교가 무엇을 골라야 할지 알 수 없으므로,
   이런 단원에만 교육과정을 표시합니다. 전부에 붙이면 잡음이 됩니다. */
const AMBIGUOUS_KEYS = (() => {
    const byKey = new Map();
    CURRICULUM_UNITS.forEach(u => {
        const k = `${u.course}|${u.unitName}`;
        if (!byKey.has(k)) byKey.set(k, new Set());
        byKey.get(k).add(u.curriculum);
    });
    const out = new Set();
    byKey.forEach((curs, k) => { if (curs.size > 1) out.add(k); });
    return out;
})();

export const isAmbiguousUnit = (unit) =>
    !!unit && AMBIGUOUS_KEYS.has(`${unit.course}|${unit.unitName}`);

/* ── 단원 검색 ───────────────────────────────────────────────
   이 학원은 반마다 강사마다 나가는 과정이 다릅니다.
   한 반이 중1-1·중2-1·중3-1·공통수학1 에서 일부씩 뽑아 나가기도 합니다.
   그래서 '과정을 고른 뒤 단원을 고르는' 2단계 방식은 오히려 방해가 됩니다.
   조교가 단원 이름만 알아도 찾을 수 있어야 합니다.

   별칭(aliases)까지 훑으므로 교재 표기로 쳐도 찾아집니다. */
const searchNorm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export const searchUnits = (queryText, options = {}) => {
    const { limit = 30, curriculum = null, schoolLevel = null, preferUnitIds = [] } = options;
    const q = searchNorm(queryText);

    let pool = CURRICULUM_UNITS;
    if (curriculum) pool = pool.filter(u => u.curriculum === curriculum);
    if (schoolLevel) pool = pool.filter(u => u.schoolLevel === schoolLevel);

    const prefer = new Set(preferUnitIds || []);

    const scored = [];
    pool.forEach(u => {
        // 자주 쓰는 단원(예: 이 반이 이미 다룬 단원)을 위로 올립니다.
        const bonus = prefer.has(u.unitId) ? -100 : 0;

        if (!q) { scored.push({ u, score: bonus }); return; }

        const name = searchNorm(u.unitName);
        const cat = searchNorm(u.category);
        const course = searchNorm(u.course);
        const alias = (u.aliases || []).map(searchNorm);

        let score = null;
        if (name === q) score = 0;
        else if (name.startsWith(q)) score = 1;
        else if (alias.some(a => a === q)) score = 2;
        else if (name.includes(q)) score = 3;
        else if (alias.some(a => a.includes(q))) score = 4;
        else if (cat.includes(q)) score = 5;
        else if (course.includes(q)) score = 6;

        if (score !== null) scored.push({ u, score: score + bonus });
    });

    return scored
        .sort((a, b) => a.score - b.score
            || a.u.course.localeCompare(b.u.course)
            || a.u.order - b.u.order)
        .slice(0, limit)
        .map(x => x.u);
};

/* ── 옛 기록 붙이기 ──────────────────────────────────────────
   자유 텍스트로 저장된 옛 단원명을 마스터에 맞춰 봅니다.
   백필과, 강사가 손으로 친 값을 확인할 때 씁니다.

   ⚠️ 이것은 '보정' 이지 '정답' 이 아닙니다. 확실한 것만 붙이고,
      애매하면 null 을 돌려 사람이 보게 합니다. 잘못 붙이면 조용히 틀린 단원에 쌓입니다. */
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[()[\]{}]/g, '').toLowerCase();

export const matchUnitByText = (rawText, candidates) => {
    const target = norm(rawText);
    if (!target) return null;

    const pool = candidates && candidates.length ? candidates : CURRICULUM_UNITS;

    // 1) 정식 단원명 완전 일치
    const exact = pool.filter(u => norm(u.unitName) === target);
    if (exact.length === 1) return exact[0];

    // 2) 별칭 완전 일치
    const byAlias = pool.filter(u => (u.aliases || []).some(a => norm(a) === target));
    if (byAlias.length === 1) return byAlias[0];

    // 3) 포함 관계 (한쪽이 다른 쪽을 품는 경우)
    const contains = pool.filter(u => {
        const n = norm(u.unitName);
        return n.includes(target) || target.includes(n);
    });
    if (contains.length === 1) return contains[0];

    // 후보가 여럿이면 붙이지 않습니다. 사람이 골라야 합니다.
    return null;
};
