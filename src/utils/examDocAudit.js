/* [src/utils/examDocAudit.js]
   기출 시험 문서가 '같은 시험인데 여러 개로 쪼개져 있는지' 점검합니다. 읽기만 합니다.

   [왜 쪼개지는가]
   문서 번호를 내용에서 계산해 만듭니다 (examDataManager.generateExamDocId).
       2025_목동중학교_2학년_1학기_중간고사_수학
   그런데 재료 두 가지가 사람이 친 '표기'입니다.

     1) 과목 원문   '미적분 I' 과 '미적분I' 은 다른 번호가 됩니다.
                    이미 표준 코드(MATH_CALC1 등)를 갖고 있는데도 쓰지 않습니다.
     2) 학교명 원문 '영일 고등학교' 와 '영일고등학교' 도 다른 번호가 됩니다.

   같은 시험이 두 문서로 갈리면 자료 4칸도 갈립니다.
   한쪽엔 시험지만, 다른 쪽엔 해설만 있는 식이라, 검색한 사람은 늘 반쪽만 봅니다.

   [이 파일이 하는 일]
   과목을 표준 코드로, 학교명을 정규화한 이름으로 바꿔 번호를 다시 계산했을 때
   하나로 합쳐질 문서들을 찾아냅니다. 옮기지는 않습니다 — 세어서 보여 줄 뿐입니다.
*/

import { normalizeSchoolName } from './schoolName';

const safe = (str) => String(str || '').replace(/[\/\\.\s]+/g, '_');

/**
 * 표기에 흔들리지 않는 번호. 과목은 표준 코드로, 학교명은 정규화한 이름으로 씁니다.
 * (표준 코드가 없는 옛 문서는 과목 원문으로 물러섭니다 — 그런 문서는 따로 보고합니다)
 */
export const canonicalExamKey = (exam) => [
    safe(exam.year || '0000'),
    safe(normalizeSchoolName(exam.schoolName || exam.school || '')),
    safe(exam.grade || '1학년'),
    safe(exam.semester || '1학기'),
    safe(exam.termType || exam.term || '중간고사'),
    safe(exam.standardCode || `RAW_${exam.subject || '미정'}`)
].join('_');

/** 어느 재료가 갈렸는지 — 원장에게 '무엇 때문에 쪼개졌는지'를 보여 주기 위한 것 */
const variationsOf = (docs, pick) => {
    const seen = [];
    docs.forEach(d => { const v = pick(d); if (v && !seen.includes(v)) seen.push(v); });
    return seen;
};

/**
 * @param exams 시험 문서 배열 ({ id, ...데이터 })
 * @returns {{
 *   total: number,
 *   groups: Array<{ key, docs, subjects, schoolNames, cause }>,
 *   mergedCount: number,   // 합쳐지면 사라지는 문서 수
 *   noCode: Array          // 표준 코드가 없어 판정에서 제외한 문서
 * }}
 */
export const auditExamDocs = (exams) => {
    const list = Array.isArray(exams) ? exams : [];
    const buckets = new Map();

    list.forEach(e => {
        const key = canonicalExamKey(e);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(e);
    });

    const groups = [];
    buckets.forEach((docs, key) => {
        if (docs.length < 2) return;

        const subjects = variationsOf(docs, d => d.subject);
        const schoolNames = variationsOf(docs, d => d.schoolName);

        /* 무엇 때문에 갈렸는지. 둘 다일 수도 있습니다. */
        const cause = [];
        if (subjects.length > 1) cause.push('과목 표기');
        if (schoolNames.length > 1) cause.push('학교명 표기');
        if (cause.length === 0) cause.push('알 수 없음');

        groups.push({ key, docs, subjects, schoolNames, cause });
    });

    // 자료가 많이 든 그룹부터 — 합쳤을 때 이득이 큰 순서
    groups.sort((a, b) => b.docs.length - a.docs.length);

    return {
        total: list.length,
        groups,
        mergedCount: groups.reduce((n, g) => n + g.docs.length - 1, 0),
        noCode: list.filter(e => !e.standardCode)
    };
};

/** 문서에 실제로 자료가 몇 칸 들어 있는지 (합칠 가치가 있는지 판단용) */
export const filledSlotCount = (exam) =>
    Object.values(exam?.files || {}).filter(f => f && f.status && f.status !== 'open').length;
