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

/* 숙제는 채점을 마친 것만 셉니다.
   갓 배정된 숙제는 wrongNumbers 가 빈 배열이라, 그냥 세면 '전부 정답' 이 됩니다.
   조교가 채점했다는 표시(gradedAt)가 있어야 셉니다. */
function isGradedHomework(item) {
  return !!item
    && Number(item.assignedCount) > 0
    && !!item.gradedAt;
}

const emptyBucket = () => ({ attempted: 0, correct: 0, blank: 0, count: 0, lastAt: 0 });

/**
 * 진단 기록과 숙제를 단원별로 집계합니다.
 *
 * ⚠️ 시험과 숙제를 한 숫자로 합치지 않습니다.
 *    숙제는 시간 제한 없이 참고서를 보며 푸는 것이라 정답률이 체계적으로 높습니다.
 *    합치면 시험 성적이 실제보다 좋아 보이고, 무엇보다
 *    '숙제와 시험의 괴리'(과제 신뢰도)라는 신호 자체가 사라집니다.
 *    라벨(익힘/익히는 중/아직)은 감독하에 본 시험만으로 냅니다.
 *
 * @param input { diagnostics: [], tasks: [] }  (한 학생 것)
 */
function buildMathProfile(input) {
  const docs = Array.isArray(input) ? input : (input?.diagnostics || []);
  const tasks = Array.isArray(input) ? [] : (input?.tasks || []);

  const units = new Map();
  const overall = { attempted: 0, correct: 0, blank: 0, testCount: 0, lastAt: 0 };
  const unmapped = new Map();   // 단원 마스터에 없는 범위(직접 입력)

  const unitOf = (unitId, unitName) => {
    let u = units.get(unitId);
    if (!u) {
      u = {
        unitId, unitName: unitName || '',
        courseCode: null, curriculum: null,
        attempted: 0, correct: 0, blank: 0,
        testIds: new Set(), lastAt: 0,
        hw: emptyBucket()
      };
      units.set(unitId, u);
    }
    if (!u.unitName && unitName) u.unitName = unitName;
    return u;
  };

  const usable = docs.filter(d =>
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

      const u = unitOf(unitId, d.unitName);
      if (!u.courseCode) u.courseCode = d.courseCode || null;
      if (!u.curriculum) u.curriculum = d.curriculum || null;
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

  /* ── 숙제 ──────────────────────────────────────────────
     교재에서 배정하고 조교가 채점을 마친 항목만 셉니다.
     안 푼 문항(blankNumbers)은 분모에서 뺍니다 — 시간이 없어 못 푼 것을
     '틀렸다' 로 묶으면 실력이 실제보다 낮게 기록됩니다. */
  const hwOverall = emptyBucket();
  const assignment = { assigned: 0, completed: 0, gradedItems: 0 };

  (Array.isArray(tasks) ? tasks : []).forEach(t => {
    const at = toMillis(t.updatedAt) || toMillis(t.createdAt);
    (Array.isArray(t.items) ? t.items : []).forEach(item => {
      // 실행 지구력: 채점 여부와 무관하게 '배정했고 했는가' 를 셉니다.
      assignment.assigned += 1;
      if (item.isCompleted) assignment.completed += 1;

      if (!isGradedHomework(item)) return;

      const total = Number(item.assignedCount) || 0;
      const blanks = Array.isArray(item.blankNumbers) ? item.blankNumbers.length : 0;
      const wrongs = Array.isArray(item.wrongNumbers) ? item.wrongNumbers.length : 0;
      const attempted = Math.max(0, total - blanks);
      const correct = Math.max(0, attempted - wrongs);

      assignment.gradedItems += 1;
      hwOverall.attempted += attempted;
      hwOverall.correct += correct;
      hwOverall.blank += blanks;
      hwOverall.count += 1;
      if (at > hwOverall.lastAt) hwOverall.lastAt = at;

      if (!item.unitId) {
        /* 단원을 안 붙인 범위(교재의 종합 문제 등). 정답률에는 들어가지만
           단원별 현황에는 못 들어갑니다. 그 사실을 화면에서 알리려고 셉니다. */
        const name = (item.unitName || item.textbookTitle || '단원 미지정').trim();
        const cur = unmapped.get(name) || { name, attempted: 0 };
        cur.attempted += attempted;
        unmapped.set(name, cur);
        return;
      }

      const u = unitOf(item.unitId, item.unitName);
      u.hw.attempted += attempted;
      u.hw.correct += correct;
      u.hw.blank += blanks;
      u.hw.count += 1;
      if (at > u.hw.lastAt) u.hw.lastAt = at;
      if (at > u.lastAt) u.lastAt = at;
    });
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
        /* 라벨은 감독하에 본 시험만으로 냅니다.
           숙제는 참고서를 보며 풀 수 있어 정답률이 체계적으로 높습니다. */
        label: labelFor(u.correct, u.attempted),
        wilsonLow: Math.round(low * 1000) / 1000,
        wilsonHigh: Math.round(high * 1000) / 1000,
        hw: {
          attempted: u.hw.attempted, correct: u.hw.correct,
          blank: u.hw.blank, taskCount: u.hw.count,
          lastAt: u.hw.lastAt || null
        }
      };
    })
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

  /* 과제 신뢰도 — 숙제와 시험 사이의 괴리.
     크게 벌어지면 답지를 보거나 손만 움직이고 있다는 신호입니다.

     ⚠️ 숙제는 시간 제한이 없어 모든 학생에게 괴리가 있습니다.
        절대 괴리는 의미가 없고 또래 대비만 의미가 있습니다.
        반 평균 차감은 아직 없으므로 cohortReady: false 로 두고,
        화면은 이 값을 판정이 아니라 참고로만 써야 합니다. */
  const pct = (b) => (b.attempted > 0 ? b.correct / b.attempted : null);
  const hwPct = pct(hwOverall);
  const testPct = overall.attempted > 0 ? overall.correct / overall.attempted : null;
  const reliability = {
    homework: { attempted: hwOverall.attempted, correct: hwOverall.correct, pct: hwPct },
    test: { attempted: overall.attempted, correct: overall.correct, pct: testPct },
    gap: (hwPct !== null && testPct !== null) ? Math.round((hwPct - testPct) * 1000) / 1000 : null,
    ready: hwOverall.attempted >= 20 && overall.attempted >= 20,
    cohortReady: false
  };

  return {
    schemaVersion: 1,
    units: unitList,
    overall: {
      attempted: overall.attempted,
      correct: overall.correct,
      blank: overall.blank,
      testCount: overall.testCount,
      lastAt: overall.lastAt || null,
      hw: {
        attempted: hwOverall.attempted, correct: hwOverall.correct,
        blank: hwOverall.blank, taskCount: hwOverall.count,
        lastAt: hwOverall.lastAt || null
      }
    },
    reliability,
    /* 실행 지구력 — 비율이 아니라 개수입니다.
       '30%' 는 학부모에게 '게으르다' 로 읽히고 '12건 중 9건' 은 사실로 읽힙니다. */
    assignment,
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

/* 숙제 쪽 지문. 클리닉 문서는 전화 상태·출석 같은 값으로도 자주 바뀝니다.
   집계에 쓰이는 값이 그대로면 다시 계산하지 않습니다. */
function taskAggregationSignature(data) {
  if (!data) return '';
  const items = (Array.isArray(data.items) ? data.items : []).map(it => [
    it.unitId || '', it.assignedCount || 0, it.isCompleted ? 1 : 0, it.gradedAt || '',
    (it.wrongNumbers || []).join('.'), (it.blankNumbers || []).join('.')
  ].join(':')).join(',');
  return `${data.studentId || ''}|${items}`;
}

module.exports = {
  buildMathProfile, wilsonBounds, labelFor, markOf,
  aggregationSignature, taskAggregationSignature, isGradedHomework,
  MIN_ATTEMPTS, HIGH_CUT, LOW_CUT
};
