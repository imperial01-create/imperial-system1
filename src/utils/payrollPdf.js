/**
 * [급여대장 PDF 파서] — 순수 함수 모듈 (React 의존 없음)
 *
 * 세무사가 보내주는 '급여대장' PDF는 아래 구조입니다.
 * 직원 1명이 **가로 3줄**을 차지합니다.
 *
 *   1줄(A): 사원번호 | 성명 | 기본급 | 수당 | …빈칸… |          | 국민연금 … 지방소득세
 *   2줄(B): 입사일   | 직급 |                          |          |                공제합계
 *   3줄(C): 퇴사일   | 부서 |                 | 지급합계 |                        차인지급액
 *
 * 이 표를 잘못 읽는 원인은 정확히 두 가지입니다.
 *
 *  (1) '공제합계'와 '차인지급액'은 '지방소득세'와 **같은 세로 칸**을 씁니다.
 *      X좌표만 보면 셋이 구분되지 않습니다. 반드시 '몇 번째 줄인가'로 갈라야 합니다.
 *      → 이걸 놓치면 지방소득세 23,600원 자리에 차인지급액 3,576,170원이 들어갑니다.
 *
 *  (2) 빈 칸이 있습니다. 예를 들어 4대보험 중 고용보험만 빠진 직원이 있습니다.
 *        김기중: 243,960 / 194,750 / (없음) / 25,510 / 236,010 / 23,600
 *      숫자를 왼쪽부터 순서대로 읽으면 25,510이 고용보험 자리로 밀려 들어갑니다.
 *      → 반드시 헤더 X좌표로 만든 '칸 경계'에 숫자를 배정해야 합니다.
 *
 * 다행히 급여대장은 **스스로 검산식을 갖고 있습니다.**
 *      공제 6종의 합  ==  공제합계
 *      지급합계 - 공제합계  ==  차인지급액
 *      (맨 아래) 개인별 합  ==  합계 행
 * 파싱 결과가 이 검산을 통과하지 못하면 저장하지 않고 화면에 표시합니다.
 * 조용히 틀린 금액이 저장되는 것만은 막습니다.
 */

// ────────────────────────────────────────────────────────────
// 1. 문자열 판별 / 금액 변환
// ────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/;
// 1,234,567 / 1234 / -236,010 / (236,010) / △236,010
const AMOUNT_RE = /^[([]?[-−–▲△]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?[)\]]?$/;

const squeeze = (s) => String(s == null ? '' : s).replace(/\s+/g, '');

export const isDateLike = (raw) => DATE_RE.test(squeeze(raw));

export const isAmountLike = (raw) => {
    const s = squeeze(raw);
    if (!s || isDateLike(s)) return false;
    return AMOUNT_RE.test(s);
};

/** '(236,010)' · '-236,010' · '△236,010' 모두 음수로 읽습니다. (연말정산 환급분) */
export const parseAmount = (raw) => {
    const s = squeeze(raw);
    if (!s) return 0;
    const negative = /^[-−–▲△]/.test(s) || /^[([].*[)\]]$/.test(s);
    const digits = s.replace(/[^0-9.]/g, '');
    if (digits === '') return 0;
    const n = Number(digits);
    if (!Number.isFinite(n)) return 0;
    return negative ? -n : n;
};

// ────────────────────────────────────────────────────────────
// 2. 헤더 사전
// ────────────────────────────────────────────────────────────

/**
 * 공백 제거 후 **완전 일치**로만 인식합니다.
 * 이유: 표 맨 윗줄의 묶음 제목이 '기 본 급 여 및 제 수 당' → '기본급여및제수당' 인데,
 * 부분 일치(includes)를 쓰면 여기에 '기본급'과 '수당'이 걸려서
 * 엉뚱한 X좌표가 기본급/수당 열로 등록됩니다. 같은 이유로 '공제및차인지급액'도 제외됩니다.
 */
const HEADER_ALIASES = [
    ['baseSalary', ['기본급', '기본급여', '월기본급']],
    ['allowance', ['수당', '제수당', '기타수당', '각종수당']],
    ['grossTotal', ['지급합계', '지급총액', '지급계', '급여계', '지급액계']],
    ['nationalPension', ['국민연금', '국민연금료', '국민연금보험료']],
    ['healthInsurance', ['건강보험', '건강보험료']],
    ['employmentInsurance', ['고용보험', '고용보험료']],
    ['longTermCare', ['장기요양보험료', '장기요양', '장기요양보험', '노인장기요양보험료']],
    ['taxIncome', ['소득세', '갑근세', '근로소득세']],
    ['taxLocal', ['지방소득세', '주민세', '지방세', '지방소득세액']],
    ['deductionTotal', ['공제합계', '공제계', '공제총액', '공제액계']],
    ['netPay', ['차인지급액', '차감지급액', '실지급액', '실수령액', '차인지급']],
    // 값이 아닌 인적사항 칸. 축(axis)에는 넣되 금액은 버립니다.
    ['_person', ['사원번호', '사번', '코드', '입사일', '퇴사일']],
    ['_name', ['성명', '이름', '직급', '부서', '직위']],
    ['_seal', ['영수인', '수령인', '서명', '인']],
];

const HEADER_LOOKUP = new Map();
HEADER_ALIASES.forEach(([key, labels]) => {
    labels.forEach((label) => { if (!HEADER_LOOKUP.has(label)) HEADER_LOOKUP.set(label, key); });
});

export const headerKeyOf = (text) => HEADER_LOOKUP.get(squeeze(text)) || null;

/** 직원 블록에서 '몇 번째 줄에 나오는 값인가' */
const ROW_A_KEYS = ['baseSalary', 'allowance', 'nationalPension', 'healthInsurance', 'employmentInsurance', 'longTermCare', 'taxIncome', 'taxLocal'];

export const DEDUCTION_FIELDS = ['nationalPension', 'healthInsurance', 'employmentInsurance', 'longTermCare', 'taxIncome', 'taxLocal'];

export const FIELD_LABELS = {
    baseSalary: '기본급', allowance: '수당', grossTotal: '지급합계',
    nationalPension: '국민연금', healthInsurance: '건강보험', employmentInsurance: '고용보험',
    longTermCare: '장기요양보험료', taxIncome: '소득세', taxLocal: '지방소득세',
    deductionTotal: '공제합계', netPay: '차인지급액',
};

const TOTALS_LABELS = ['합계', '총계', '소계', '계', '전체합계'];

// ────────────────────────────────────────────────────────────
// 3. 행(가로줄) 묶기
// ────────────────────────────────────────────────────────────

/**
 * 같은 가로줄(±tolerance pt)에 있는 글자들을 한 행으로 묶고, 위→아래 순으로 돌려줍니다.
 * pdf.js는 한 칸의 글자를 여러 조각으로 쪼개서 주는 일이 잦습니다
 * (예: '지방소득세' → '지방' + '소득세'). 이걸 그대로 두면 '소득세' 조각이
 * 엉뚱한 X좌표에서 소득세 열로 잡혀 표 전체가 어긋납니다.
 * 그래서 붙어 있는(gap ≤ glueGap) 조각은 다시 이어 붙입니다.
 */
export const clusterRows = (items, tolerance = 2.5, glueGap = 1.5) => {
    const rows = [];
    [...items].sort((a, b) => b.y - a.y).forEach((item) => {
        const row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance);
        if (row) row.items.push(item);
        else rows.push({ y: item.y, items: [item] });
    });

    rows.forEach((r) => {
        r.items.sort((a, b) => a.x - b.x);
        const glued = [];
        r.items.forEach((it) => {
            const prev = glued[glued.length - 1];
            if (prev && it.x - rightOf(prev) <= glueGap) {
                prev.str += it.str;
                prev.width = rightOf(it) - prev.x;
            } else {
                glued.push({ ...it });
            }
        });
        r.items = glued;
    });
    return rows;
};

const centerOf = (item) => item.x + (Number(item.width) || 0) / 2;
const rightOf = (item) => item.x + (Number(item.width) || 0);

// ────────────────────────────────────────────────────────────
// 4. 세로 칸(축) 만들기
// ────────────────────────────────────────────────────────────

/**
 * 헤더 줄들의 글자 중심 X를 모아 '세로 칸'을 만듭니다.
 * 중심이 6pt 이내면 같은 칸으로 봅니다.
 * → 지방소득세 / 공제합계 / 차인지급액은 같은 칸 하나로 합쳐지고, keys 가 3개가 됩니다.
 */
export const buildAxis = (headerRows, mergeTolerance = 6) => {
    const raw = [];
    headerRows.forEach((row) => {
        row.items.forEach((it) => {
            raw.push({ center: centerOf(it), key: headerKeyOf(it.str), text: squeeze(it.str) });
        });
    });
    raw.sort((a, b) => a.center - b.center);

    const cols = [];
    raw.forEach((r) => {
        const last = cols[cols.length - 1];
        if (last && Math.abs(last.center - r.center) <= mergeTolerance) {
            last.centers.push(r.center);
            last.center = last.centers.reduce((s, v) => s + v, 0) / last.centers.length;
            if (r.key && !last.keys.includes(r.key)) last.keys.push(r.key);
            last.labels.push(r.text);
        } else {
            cols.push({ center: r.center, centers: [r.center], keys: r.key ? [r.key] : [], labels: [r.text] });
        }
    });

    // 이웃 칸 중심의 중간점을 칸 경계로 씁니다.
    cols.forEach((c, i) => {
        c.left = i === 0 ? -Infinity : (cols[i - 1].center + c.center) / 2;
        c.right = i === cols.length - 1 ? Infinity : (c.center + cols[i + 1].center) / 2;
    });
    return cols;
};

/**
 * 숫자는 칸 안에서 **오른쪽 정렬**되어 있습니다.
 * 따라서 '글자의 오른쪽 끝보다 왼쪽에 있는 머리글 중 가장 가까운 것'이 그 숫자의 열입니다.
 *
 * 처음에는 이웃 머리글 중심의 중간점을 칸 경계로 썼는데, 이 방식은 칸 너비가
 * 들쭉날쭉하면 무너집니다. 실제 급여대장의 맨 오른쪽 '영수인' 칸은 다른 칸의 절반도
 * 안 될 만큼 좁아서, 중간점이 지방소득세 칸 **안쪽**에 찍힙니다.
 * 그 결과 지방소득세·공제합계·차인지급액 세 값이 통째로 영수인 칸으로 넘어가 사라졌습니다.
 * (오른쪽 정렬 기준으로 바꾸면 칸 너비와 무관하게 정확합니다.)
 */
const columnIndexOf = (axis, item) => {
    const r = rightOf(item) + 0.5; // 반올림 오차 여유
    let idx = -1;
    for (let i = 0; i < axis.length; i += 1) {
        if (axis[i].center <= r) idx = i;
        else break;
    }
    return idx;
};

const indexOfKey = (axis, key) => axis.findIndex((c) => c.keys.includes(key));

/** 한 행의 숫자들을 { 칸번호 → [금액…] } 으로 배정 */
const assignRow = (axis, row) => {
    const byCol = new Map();
    row.items.forEach((it) => {
        if (!isAmountLike(it.str)) return;
        const idx = columnIndexOf(axis, it);
        if (idx < 0) return;
        if (!byCol.has(idx)) byCol.set(idx, []);
        byCol.get(idx).push({ value: parseAmount(it.str), raw: it.str, x: it.x });
    });
    return byCol;
};

// ────────────────────────────────────────────────────────────
// 5. 급여대장 본체 파싱
// ────────────────────────────────────────────────────────────

const emptyAmounts = () => ({
    baseSalary: 0, allowance: 0, grossTotal: 0,
    nationalPension: 0, healthInsurance: 0, employmentInsurance: 0,
    longTermCare: 0, taxIncome: 0, taxLocal: 0,
    deductionTotal: 0, netPay: 0,
});

const overlapsColumn = (item, col) => {
    if (!col) return false;
    const l = item.x;
    const r = rightOf(item);
    return r > col.left && l < col.right;
};

/**
 * @param {Array<{str:string,x:number,y:number,width:number,page:number}>} items
 * @returns {{employees:Array, totals:Object|null, warnings:string[], axisFound:boolean}}
 */
export const parsePayrollRegister = (items) => {
    const warnings = [];
    const employees = [];
    let totals = null;
    let axis = null;
    let axisFound = false;

    const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);

    pages.forEach((pageNo) => {
        const rows = clusterRows(items.filter((i) => i.page === pageNo));

        // (a) 헤더 줄 = 아는 머리글이 1개라도 있는 줄
        const headerRows = rows.filter((r) => r.items.some((it) => headerKeyOf(it.str)));
        if (headerRows.length > 0) {
            const built = buildAxis(headerRows);
            const keyCount = built.filter((c) => c.keys.some((k) => !k.startsWith('_'))).length;
            if (keyCount >= 5) { axis = built; axisFound = true; }
        }
        if (!axis) {
            warnings.push(`${pageNo}쪽: 표 머리글(국민연금·건강보험 등)을 찾지 못해 건너뛰었습니다.`);
            return;
        }

        const idxBase = indexOfKey(axis, 'baseSalary');
        const idxAllow = indexOfKey(axis, 'allowance');
        const idxGross = indexOfKey(axis, 'grossTotal');
        const idxDedTotal = indexOfKey(axis, 'deductionTotal');
        const idxNet = indexOfKey(axis, 'netPay');
        const nameCol = axis[indexOfKey(axis, '_name')] || null;
        const personCol = axis[indexOfKey(axis, '_person')] || null;

        const headerBottom = headerRows.length ? Math.min(...headerRows.map((r) => r.y)) : Infinity;
        const bodyRows = rows.filter((r) => r.y < headerBottom - 0.5);

        // (b) 직원 블록의 첫 줄(A) 찾기
        //     조건: 성명 칸에 걸치는 '숫자가 아닌 글자'가 있고, 기본급/수당 칸에 금액이 있다.
        //     → 2줄(입사일·직급)과 3줄(퇴사일·부서)은 기본급 칸이 비어 있으므로 자동으로 걸러집니다.
        const anchors = [];
        bodyRows.forEach((row, rowIdx) => {
            const byCol = assignRow(axis, row);
            const hasPayColumn = (idxBase >= 0 && byCol.has(idxBase)) || (idxAllow >= 0 && byCol.has(idxAllow));
            if (!hasPayColumn) return;

            const labelItem = row.items.find((it) => {
                if (isAmountLike(it.str) || isDateLike(it.str)) return false;
                const t = squeeze(it.str);
                if (!t || headerKeyOf(t)) return false;
                return nameCol ? overlapsColumn(it, nameCol) : (personCol ? overlapsColumn(it, personCol) : false);
            });
            if (!labelItem) return;

            anchors.push({ rowIdx, row, byCol, label: squeeze(labelItem.str) });
        });

        // (c) 블록 = 앵커 줄부터 다음 앵커 줄 직전까지
        anchors.forEach((anchor, i) => {
            const endIdx = i === anchors.length - 1 ? bodyRows.length : anchors[i + 1].rowIdx;
            const tailRows = bodyRows.slice(anchor.rowIdx + 1, endIdx);

            const amounts = emptyAmounts();

            // A줄: 기본급 · 수당 · 공제 6종
            ROW_A_KEYS.forEach((key) => {
                const idx = indexOfKey(axis, key);
                if (idx < 0) return;
                const hits = anchor.byCol.get(idx);
                if (hits && hits.length) amounts[key] = hits[0].value;
            });

            // B줄 / C줄: 지급합계가 있는 줄이 C, 그 앞이 B.
            //   '공제합계'와 '차인지급액'은 지방소득세와 같은 칸이므로 줄로 구분합니다.
            let rowB = null;
            let rowC = null;
            tailRows.forEach((r) => {
                const byCol = assignRow(axis, r);
                if (idxGross >= 0 && byCol.has(idxGross)) { if (!rowC) rowC = byCol; return; }
                if (!rowB) rowB = byCol;
            });

            if (rowB && idxDedTotal >= 0) {
                const hits = rowB.get(idxDedTotal);
                if (hits && hits.length) amounts.deductionTotal = hits[hits.length - 1].value;
            }
            if (rowC) {
                if (idxGross >= 0) {
                    const g = rowC.get(idxGross);
                    if (g && g.length) amounts.grossTotal = g[0].value;
                }
                if (idxNet >= 0) {
                    const n = rowC.get(idxNet);
                    if (n && n.length) amounts.netPay = n[n.length - 1].value;
                }
            }

            const hireItem = tailRows.flatMap((r) => r.items).find((it) => isDateLike(it.str));
            const empNoItem = personCol
                ? anchor.row.items.find((it) => isAmountLike(it.str) && overlapsColumn(it, personCol))
                : null;

            const record = {
                page: pageNo,
                name: anchor.label,
                employeeNo: empNoItem ? squeeze(empNoItem.str) : '',
                hireDate: hireItem ? squeeze(hireItem.str) : '',
                amounts,
                ...verifyRow(amounts),
            };

            if (TOTALS_LABELS.includes(anchor.label)) {
                if (!totals) totals = { ...record, isTotals: true };
            } else {
                employees.push(record);
            }
        });
    });

    if (axisFound && employees.length === 0) {
        warnings.push('표 머리글은 찾았지만 직원 줄을 한 줄도 인식하지 못했습니다. 다른 서식일 수 있습니다.');
    }

    return { employees, totals, warnings, axisFound };
};

// ────────────────────────────────────────────────────────────
// 6. 검산
// ────────────────────────────────────────────────────────────

/** 급여대장이 스스로 갖고 있는 검산식으로 파싱 결과를 확인합니다. */
export const verifyRow = (amounts) => {
    const deductionSum = DEDUCTION_FIELDS.reduce((s, k) => s + (Number(amounts[k]) || 0), 0);
    const checks = [];

    // (필수) 공제 6종의 합 == 공제합계
    checks.push({
        id: 'deduction',
        label: '공제 6종 합 = 공제합계',
        expected: amounts.deductionTotal,
        actual: deductionSum,
        ok: deductionSum === amounts.deductionTotal,
        critical: true,
    });

    // (필수) 지급합계 − 공제합계 == 차인지급액
    checks.push({
        id: 'net',
        label: '지급합계 − 공제합계 = 차인지급액',
        expected: amounts.netPay,
        actual: amounts.grossTotal - amounts.deductionTotal,
        ok: amounts.grossTotal - amounts.deductionTotal === amounts.netPay,
        critical: true,
    });

    // (참고) 기본급 + 수당 == 지급합계
    // 상여·식대처럼 우리가 모르는 지급 항목 열이 더 있으면 어긋날 수 있어 경고만 합니다.
    checks.push({
        id: 'gross',
        label: '기본급 + 수당 = 지급합계',
        expected: amounts.grossTotal,
        actual: amounts.baseSalary + amounts.allowance,
        ok: amounts.baseSalary + amounts.allowance === amounts.grossTotal,
        critical: false,
    });

    return {
        deductionSum,
        checks,
        ok: checks.every((c) => !c.critical || c.ok),
        hasSoftWarning: checks.some((c) => !c.critical && !c.ok),
    };
};

/** 개인별 합이 맨 아래 '합계' 행과 맞는지 — 누락된 직원을 잡아냅니다. */
export const verifyTotals = (employees, totals) => {
    if (!totals) return null;
    const fields = ['baseSalary', 'allowance', 'grossTotal', ...DEDUCTION_FIELDS, 'deductionTotal', 'netPay'];
    const rows = fields.map((key) => {
        const actual = employees.reduce((s, e) => s + (Number(e.amounts[key]) || 0), 0);
        const expected = Number(totals.amounts[key]) || 0;
        return { key, label: FIELD_LABELS[key], expected, actual, ok: expected === actual };
    });
    return { rows, ok: rows.every((r) => r.ok) };
};

// ────────────────────────────────────────────────────────────
// 7. 사람 매칭
// ────────────────────────────────────────────────────────────

/**
 * PDF의 성명을 시스템 직원과 이어 붙입니다.
 * 동명이인은 자동 배정하지 않고 '확인 필요'로 남깁니다. (엉뚱한 사람에게 급여가 갈 수 있음)
 */
export const matchEmployees = (parsedRows, users) => {
    const byName = new Map();
    (users || []).forEach((u) => {
        if (!u || !u.name) return;
        const n = squeeze(u.name);
        if (!n) return;
        if (!byName.has(n)) byName.set(n, []);
        byName.get(n).push(u);
    });

    const matched = parsedRows.map((row) => {
        const candidates = byName.get(squeeze(row.name)) || [];
        if (candidates.length === 1) {
            const u = candidates[0];
            return { ...row, userId: u.id || u.userId, userName: u.name, userRole: u.role, matchStatus: 'matched' };
        }
        if (candidates.length > 1) {
            return { ...row, userId: null, matchStatus: 'ambiguous', candidateCount: candidates.length };
        }
        return { ...row, userId: null, matchStatus: 'unmatched' };
    });

    const usedIds = new Set(matched.filter((m) => m.userId).map((m) => m.userId));
    const missingUsers = (users || []).filter((u) => !usedIds.has(u.id || u.userId));

    return { matched, missingUsers };
};
