/**
 * 급여대장 파서 회귀 테스트  —  `npm test` 로 실행합니다.
 *
 * 2026년 7월 실제 급여대장의 숫자를 그대로 넣고, 같은 표 구조(3줄 블록 / 공유 칸 /
 * 빈 칸 / 좁은 영수인 칸)를 좌표로 재현해서 검증합니다.
 * 금액이 하나라도 틀리면 실패합니다. 급여는 실제로 돈이 나가는 곳이라
 * '대충 맞음'이 허용되지 않습니다.
 */
import { parsePayrollRegister, verifyTotals, matchEmployees, parseAmount, isAmountLike } from './payrollPdf';

// [사원번호, 성명, 입사일, 기본급, 수당, 국민연금, 건강보험, 고용보험, 장기요양, 소득세, 지방소득세, 공제합계, 지급합계, 차인지급액]
const PAGE1 = [
  ['1', '김기중', '2024-09-12', 4300000, 0, 243960, 194750, 0, 25510, 236010, 23600, 723830, 4300000, 3576170],
  ['2', '장인자', '2024-09-20', 3500000, 500000, 221730, 156240, 0, 20460, 195960, 19590, 613980, 4000000, 3386020],
  ['3', '김준혁', '2024-09-26', 3300000, 1500000, 247470, 130440, 0, 17110, 307420, 30740, 733180, 4800000, 4066820],
  ['7', '정석홍', '2025-10-18', 1200000, 0, 6460, 21570, 2160, 2830, 2990, 290, 36300, 1200000, 1163700],
  ['8', '한채영', '2025-10-10', 644000, 0, 6080, 19410, 5790, 2550, 0, 0, 33830, 644000, 610170],
  ['9', '이채연', '2025-10-18', 926400, 0, 9660, 34150, 1670, 4480, 0, 0, 49960, 926400, 876440],
  ['12', '김하은', '2026-04-06', 1039200, 0, 8550, 32350, 1870, 4250, 0, 0, 47020, 1039200, 992180],
  ['13', '김연지', '2026-05-01', 1017600, 0, 8550, 32350, 1830, 4250, 0, 0, 46980, 1017600, 970620],
  ['14', '윤희주', '2026-05-15', 480000, 0, 5700, 21570, 4320, 2830, 0, 0, 34420, 480000, 445580],
  ['15', '신요한', '2026-06-01', 4000000, 0, 190000, 143800, 36000, 18890, 195960, 19590, 604240, 4000000, 3395760],
  ['16', '최성민', '2026-06-01', 2600000, 0, 36100, 93470, 23400, 12280, 39690, 3960, 208900, 2600000, 2391100],
];
const PAGE2 = [
  ['17', '제정애', '2026-06-01', 1800000, 0, 17100, 64710, 16200, 8500, 15110, 1510, 123130, 1800000, 1676870],
  ['18', '오혜원', '2026-06-01', 876200, 0, 8550, 32350, 7880, 4250, 0, 0, 53030, 876200, 823170],
  ['19', '박성채', '2026-06-01', 900000, 0, 8550, 32350, 8100, 4250, 0, 0, 53250, 900000, 846750],
  ['20', '박유찬', '2026-06-23', 408000, 0, 8550, 32350, 3670, 4250, 0, 0, 48820, 408000, 359180],
];
const TOTALS = ['', '합계', '', 26991400, 2000000, 1027010, 1041860, 112890, 136690, 993140, 99280, 3410870, 28991400, 25580530];

// ── 표 좌표 재현 ───────────────────────────────────────────
// 실제 대장처럼 맨 오른쪽 '영수인' 칸을 다른 칸의 절반 너비로 둡니다.
// (이 좁은 칸 때문에 예전 방식은 오른쪽 세 값을 통째로 잃어버렸습니다)
const NORMAL_COLS = {
  empNo: [20, 62], name: [62, 103], base: [103, 156], allow: [156, 209],
  gross: [421, 474], np: [474, 527], hi: [527, 580], ei: [580, 633],
  ltc: [633, 686], tax: [686, 739], local: [739, 792], seal: [792, 822],
};
const UNEVEN_COLS = {
  empNo: [15, 50], name: [50, 120], base: [120, 230], allow: [230, 290],
  gross: [400, 500], np: [500, 545], hi: [545, 600], ei: [600, 638],
  ltc: [638, 720], tax: [720, 758], local: [758, 830], seal: [830, 845],
};

const wOf = (s) => [...String(s)].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 7 : 3.9), 0);
const won = (n) => n.toLocaleString('en-US');

const buildPage = (pageNo, block, opts = {}) => {
  const { cols = NORMAL_COLS, splitHeader = false, jitter = 0, splitNumber = false, spacedName = false } = opts;
  const C = cols;
  const mid = (c, str, y) => ({ str, width: wOf(str), x: (c[0] + c[1]) / 2 - wOf(str) / 2, y, page: pageNo });
  const right = (c, str, y) => ({ str, width: wOf(str), x: c[1] - 3 - wOf(str), y, page: pageNo });
  const jy = (y) => y + (jitter ? Math.round(Math.sin(y * 7.3) * 100) / 100 * jitter : 0);

  const it = [];
  it.push({ str: '2026년07월분 급여대장', width: 90, x: 380, y: 570, page: pageNo });
  // 묶음 제목 — 부분일치로 파싱하면 여기서 '기본급'/'수당'/'차인지급액'이 잘못 걸립니다.
  it.push(mid([C.empNo[0], C.name[1]], '인적사항', 552));
  it.push(mid([C.base[0], C.gross[1]], '기 본 급 여 및 제 수 당', 552));
  it.push(mid([C.np[0], C.local[1]], '공 제 및 차 인 지 급 액', 552));

  [['empNo', '사원번호'], ['name', '성 명'], ['base', '기본급'], ['allow', '수당'],
    ['np', '국민연금'], ['hi', '건강보험'], ['ei', '고용보험'], ['ltc', '장기요양보험료'],
    ['tax', '소득세'], ['local', '지방소득세']].forEach(([k, t]) => {
    if (splitHeader && t.length > 3) {
      const x0 = (C[k][0] + C[k][1]) / 2 - wOf(t) / 2;
      const head = t.slice(0, 2); const tail = t.slice(2);
      it.push({ str: head, width: wOf(head), x: x0, y: jy(540), page: pageNo });
      it.push({ str: tail, width: wOf(tail), x: x0 + wOf(head), y: jy(540), page: pageNo });
    } else {
      it.push(mid(C[k], t, jy(540)));
    }
  });
  it.push(mid(C.seal, '영수인', 540));
  it.push(mid(C.empNo, '입사일', 528.5)); it.push(mid(C.name, '직 급', 528.5));
  it.push(mid(C.local, '공제합계', 528.5));
  it.push(mid(C.empNo, '퇴사일', 517)); it.push(mid(C.name, '부 서', 517));
  it.push(mid(C.gross, '지급합계', 517)); it.push(mid(C.local, '차인지급액', 517));

  let y = 502;
  block.forEach((r) => {
    const [no, name, hire, base, allow, np, hi, ei, ltc, tax, local, ded, gross, net] = r;
    if (no) it.push(mid(C.empNo, no, jy(y)));
    it.push(mid(C.name, spacedName ? name.split('').join(' ') : name, jy(y)));
    if (splitNumber) {
      const s = won(base); const x0 = C.base[1] - 3 - wOf(s);
      const a = s.slice(0, 4); const b = s.slice(4);
      it.push({ str: a, width: wOf(a), x: x0, y: jy(y), page: pageNo });
      it.push({ str: b, width: wOf(b), x: x0 + wOf(a), y: jy(y), page: pageNo });
    } else {
      it.push(right(C.base, won(base), jy(y)));
    }
    if (allow) it.push(right(C.allow, won(allow), jy(y)));
    [['np', np], ['hi', hi], ['ei', ei], ['ltc', ltc], ['tax', tax], ['local', local]]
      .forEach(([k, v]) => { if (v) it.push(right(C[k], won(v), jy(y))); });
    if (hire) it.push(mid(C.empNo, hire, jy(y - 11.4)));
    it.push(right(C.local, won(ded), jy(y - 11.4)));
    it.push(right(C.gross, won(gross), jy(y - 22.8)));
    it.push(right(C.local, won(net), jy(y - 22.8)));
    y -= 34.2;
  });
  return it;
};

const amountsOf = (row) => [
  row.amounts.baseSalary, row.amounts.allowance,
  row.amounts.nationalPension, row.amounts.healthInsurance, row.amounts.employmentInsurance,
  row.amounts.longTermCare, row.amounts.taxIncome, row.amounts.taxLocal,
  row.amounts.deductionTotal, row.amounts.grossTotal, row.amounts.netPay,
];
const expectedOf = (r) => [r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13]];

describe('금액 문자열 해석', () => {
  test('연말정산 환급(음수)의 부호를 잃지 않는다', () => {
    expect(parseAmount('-236,010')).toBe(-236010);
    expect(parseAmount('(236,010)')).toBe(-236010);
    expect(parseAmount('△236,010')).toBe(-236010);
  });
  test('입사일을 금액으로 착각하지 않는다', () => {
    expect(isAmountLike('2024-09-12')).toBe(false);
    expect(isAmountLike('4,300,000')).toBe(true);
  });
});

describe('2026-07 실제 급여대장', () => {
  const items = [...buildPage(1, PAGE1), ...buildPage(2, [...PAGE2, TOTALS])];
  const { employees, totals } = parsePayrollRegister(items);
  const ALL = [...PAGE1, ...PAGE2];

  test('직원 15명을 모두 인식한다 (합계 행은 직원으로 세지 않는다)', () => {
    expect(employees).toHaveLength(15);
  });

  test.each(ALL.map((r) => [r[1], r]))('%s — 금액 11개가 모두 일치하고 검산을 통과한다', (name, exp) => {
    const row = employees.find((e) => e.name === name);
    expect(row).toBeDefined();
    expect(amountsOf(row)).toEqual(expectedOf(exp));
    expect(row.ok).toBe(true);
    expect(row.employeeNo).toBe(exp[0]);
    expect(row.hireDate).toBe(exp[2]);
  });

  test('고용보험이 빈 칸인 사람도 값이 밀리지 않는다', () => {
    // 김기중은 고용보험이 비어 있어서, 순서대로 읽으면 장기요양 25,510이 고용보험 자리로 밀립니다.
    const row = employees.find((e) => e.name === '김기중');
    expect(row.amounts.employmentInsurance).toBe(0);
    expect(row.amounts.longTermCare).toBe(25510);
  });

  test('지방소득세 자리에 공제합계·차인지급액이 들어가지 않는다', () => {
    // 세 값은 같은 세로 칸을 쓰므로 줄로 구분해야 합니다.
    const row = employees.find((e) => e.name === '김기중');
    expect(row.amounts.taxLocal).toBe(23600);
    expect(row.amounts.deductionTotal).toBe(723830);
    expect(row.amounts.netPay).toBe(3576170);
  });

  test('맨 아래 합계 행과 개인별 합계가 원 단위까지 일치한다', () => {
    const v = verifyTotals(employees, totals);
    expect(v.rows.filter((r) => !r.ok)).toEqual([]);
    expect(v.ok).toBe(true);
  });
});

describe('직원 매칭', () => {
  const { employees } = parsePayrollRegister(buildPage(1, PAGE1));
  const users = [
    { id: 'u1', name: '김기중' }, { id: 'u2', name: '장인자' },
    { id: 'd1', name: '김하은' }, { id: 'd2', name: '김하은' },
    { id: 'x1', name: '퇴사자' },
  ];
  const { matched, missingUsers } = matchEmployees(employees, users);
  const statusOf = (n) => matched.find((m) => m.name === n).matchStatus;

  test('이름이 하나뿐이면 배정한다', () => expect(statusOf('김기중')).toBe('matched'));
  test('동명이인은 자동 배정하지 않는다', () => expect(statusOf('김하은')).toBe('ambiguous'));
  test('시스템에 없는 사람은 미등록으로 남긴다', () => expect(statusOf('김준혁')).toBe('unmatched'));
  test('PDF에 없는 직원을 알려준다', () => expect(missingUsers.map((u) => u.name)).toContain('퇴사자'));
});

describe('pdf.js 출력 변형에도 견딘다', () => {
  const variants = [
    ['머리글이 조각남 (지방 | 소득세)', { splitHeader: true }],
    ['같은 줄인데 baseline이 흔들림', { jitter: 0.8 }],
    ['숫자가 조각남 (4,30 | 0,000)', { splitNumber: true }],
    ['칸 너비가 불균일한 서식', { cols: UNEVEN_COLS }],
    ['이름 자간이 벌어짐 (김 기 중)', { spacedName: true }],
    ['위 다섯 가지가 한꺼번에', { splitHeader: true, jitter: 0.8, splitNumber: true, cols: UNEVEN_COLS, spacedName: true }],
  ];

  test.each(variants)('%s', (_label, opts) => {
    const { employees } = parsePayrollRegister(buildPage(1, PAGE1, opts));
    expect(employees).toHaveLength(PAGE1.length);
    PAGE1.forEach((exp) => {
      const row = employees.find((e) => e.name === exp[1]);
      expect(row).toBeDefined();
      expect(amountsOf(row)).toEqual(expectedOf(exp));
      expect(row.ok).toBe(true);
    });
  });
});
