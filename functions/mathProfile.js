/* [functions/mathProfile.js]
   학생의 개념테스트 기록을 단원별로 집계합니다. 순수 함수만 둡니다.

   [왜 서버에서 계산하는가]
   화면에서 계산하면 세 가지가 무너집니다.
     1. 화면마다 다른 값이 나온다 (학생 화면과 강사 화면의 집계 코드가 갈린다)
     2. 반 인원수만큼 읽기 요금이 곱해진다
     3. 규칙을 학생에게 열어야 계산이 되는데, 그러면 학생이 자기 능력치를 쓸 수 있다
        (english_stats 에서 실제로 그렇게 뚫려 있었다)

   [왜 순수 함수로 떼어 놓는가]
   Firestore 트리거 안에 계산을 묻어 두면 배포해야만 확인할 수 있습니다.
   여기 있는 것들은 node 로 바로 돌려 볼 수 있습니다.
*/

/* ── Wilson 점수 구간 ─────────────────────────────────────────
   정답률 점 추정치에 라벨을 붙이면 3문제 중 3개 맞은 학생이 '익힘' 이 됩니다.
   구간의 한쪽 끝이 임계선을 넘을 때만 라벨을 냅니다.

   한쪽꼬리 90%(z=1.2816)는 통계적 필연이 아니라 정책 선택입니다.
   형성평가용 판단이고 이 라벨로 학생을 자르지 않기 때문에 95%보다 완화했습니다.
   95%로 하면 8문항 만점도 '익힘' 이 안 되어 아무도 도달하지 못합니다. */
const Z = 1.2816;

function wilsonBounds(correct, total) {
  if (!total || total <= 0) return { low: 0, high: 1 };
  const p = correct / total;
  const z2 = Z * Z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (Z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin)
  };
}

/* 판정 게이트. 이 아래에서는 라벨을 내지 않고 개수만 보여줍니다.
   MATH_INDICATORS_v2 §2 와 같은 값이어야 합니다. */
const MIN_ATTEMPTS = 8;
const HIGH_CUT = 0.80;
const LOW_CUT = 0.60;

function labelFor(correct, attempted) {
  if (!attempted || attempted < MIN_ATTEMPTS) return null;   // 자료 모으는 중
  const { low, high } = wilsonBounds(correct, attempted);
  if (low >= HIGH_CUT) return '익힘';
  if (high < LOW_CUT) return '아직';
  return '익히는 중';
}

/* ── 문항 하나의 상태 판정 ────────────────────────────────────
   mark 가 정본입니다. 옛 기록에는 mark 가 없으므로 verdict 로 물러섭니다.
   무응답은 분모에서 빠집니다 — 시간이 없어 못 푼 것을
   '이 조건에서 무너진다' 로 읽으면 안 되기 때문입니다. */
function markOf(response) {
  if (response.mark === 'correct' || response.mark === 'wrong' || response.mark === 'blank') {
    return response.mark;
  }
  if (response.mark === 'partial') return 'partial';
  return response.verdict === 'wrong' ? 'wrong' : 'correct';
}

const toMillis = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (v instanceof Date) return v.getTime();
  return 0;
};

/**
 * 진단 기록들을 단원별로 집계합니다.
 *
 * @param docs student_exam_diagnostics 문서 배열 (한 학생 것)
 * @returns 저장할 프로필 본문
 */
function buildMathProfile(docs) {
  const units = new Map();
  const overall = { attempted: 0, correct: 0, blank: 0, testCount: 0, lastAt: 0 };
  const unmapped = new Map();   // 단원 마스터에 없는 범위(직접 입력)

  const usable = (Array.isArray(docs) ? docs : []).filter(d =>
    d &&
    d.schemaVersion === 2 &&                    // 만점 100 고정 시절 기록은 점수 자체가 틀리다
    Number(d.maxScore) > 0 &&
    d.testCategory === 'concept' &&             // 내신은 단원 태그가 없다
    Array.isArray(d.responses)
  );

  usable.forEach(d => {
    const at = toMillis(d.createdAt);
    overall.testCount += 1;
    if (at > overall.lastAt) overall.lastAt = at;

    /* 개념테스트는 시험 하나가 곧 단원 하나입니다.
       문항별 unitId 가 있으면 그것을, 없으면 문서 단위 unitId 를 씁니다. */
    const docUnitId = d.unitId || null;

    d.responses.forEach(r => {
      const mark = markOf(r);
      if (mark === 'blank') { overall.blank += 1; return; }

      const isCorrect = mark === 'correct';
      overall.attempted += 1;
      if (isCorrect) overall.correct += 1;

      const unitId = r.unitId || docUnitId;
      if (!unitId) {
        // 직접 입력한 범위. 집계에 못 쌓이는 이유를 화면에서 알려주기 위해 셉니다.
        const name = (r.unitRaw || d.unitName || '범위 미지정').trim();
        const cur = unmapped.get(name) || { name, attempted: 0 };
        cur.attempted += 1;
        unmapped.set(name, cur);
        return;
      }

      let u = units.get(unitId);
      if (!u) {
        u = {
          unitId,
          unitName: d.unitName || '',
          courseCode: d.courseCode || null,
          curriculum: d.curriculum || null,
          attempted: 0, correct: 0, blank: 0,
          testIds: new Set(),
          lastAt: 0
        };
        units.set(unitId, u);
      }
      u.attempted += 1;
      if (isCorrect) u.correct += 1;
      u.testIds.add(d.id || d.batchId || String(at));
      if (at > u.lastAt) u.lastAt = at;
    });

    // 무응답도 단원별로 세어 둡니다. 분모에는 안 들어가지만 '몇 개를 안 풀었나' 는 정보입니다.
    if (docUnitId) {
      const blanks = d.responses.filter(r => markOf(r) === 'blank').length;
      const u = units.get(docUnitId);
      if (u) u.blank += blanks;
    }
  });

  const unitList = [...units.values()]
    .map(u => {
      const { low, high } = wilsonBounds(u.correct, u.attempted);
      return {
        unitId: u.unitId,
        unitName: u.unitName,
        courseCode: u.courseCode,
        curriculum: u.curriculum,
        attempted: u.attempted,
        correct: u.correct,
        blank: u.blank,
        testCount: u.testIds.size,
        lastAt: u.lastAt || null,
        label: labelFor(u.correct, u.attempted),
        wilsonLow: Math.round(low * 1000) / 1000,
        wilsonHigh: Math.round(high * 1000) / 1000
      };
    })
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

  return {
    schemaVersion: 1,
    units: unitList,
    overall: {
      attempted: overall.attempted,
      correct: overall.correct,
      blank: overall.blank,
      testCount: overall.testCount,
      lastAt: overall.lastAt || null
    },
    /* 단원 마스터에 못 붙은 기록. 0 이 아니면 화면에서 그 사실을 알려야 합니다.
       조용히 빠지면 나중에 왜 비었는지 알 수 없습니다. */
    unmapped: [...unmapped.values()].sort((a, b) => b.attempted - a.attempted).slice(0, 10)
  };
}

/* ── 재계산이 필요한 변경인지 ─────────────────────────────────
   클리닉에서 오답 원인 칩을 누를 때마다 responses 가 바뀝니다.
   그때마다 학생의 전 기록을 다시 읽으면, 클리닉 한 번에 수백 번 읽게 됩니다.
   집계에 실제로 쓰이는 값만 지문으로 만들어 비교합니다.

   errorType 은 여기 넣지 않습니다 — 지금 집계에 안 쓰이기 때문입니다.
   나중에 오답 원인을 집계에 넣을 때 이 지문에도 같이 넣어야 합니다. */
function aggregationSignature(data) {
  if (!data) return '';
  const marks = (Array.isArray(data.responses) ? data.responses : [])
    .map(r => `${markOf(r)}:${r.unitId || ''}:${r.points || 0}`)
    .join(',');
  return [
    data.schemaVersion, data.testCategory, data.unitId || '',
    data.courseCode || '', data.curriculum || '',
    data.score, data.maxScore, marks
  ].join('|');
}

module.exports = {
  buildMathProfile, wilsonBounds, labelFor, markOf, aggregationSignature,
  MIN_ATTEMPTS, HIGH_CUT, LOW_CUT
};
