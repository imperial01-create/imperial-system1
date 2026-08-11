/* 저장된 시험 진단 기록을 확인하고 고치는 화면

   [왜 필요한가]
   지금까지 저장한 성적을 다시 보거나 고치는 화면이 시스템 전체에 한 곳도 없었습니다.
   잘못 채점해도 되돌릴 방법이 없었고, 학생·학부모 화면을 여는 순간
   잘못된 기록이 그대로 노출됩니다.

   [옛 기록 주의]
   schemaVersion 이 2 가 아닌 기록은 점수가 항상 100 에서 깎이던 시절의 것이라
   값이 틀렸을 수 있습니다. '재채점 필요' 표시를 붙입니다.
   문항 정보(responses)가 없는 기록은 고쳐도 v2 로 올리지 않습니다.
   점수 한 칸만 바꿔 놓고 '제대로 채점된 기록'인 척하면 나중에 구별할 수가 없습니다.
*/

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, limit, startAfter, getDocs, doc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Search, Loader, AlertCircle, AlertTriangle, Trash2, Pencil, RefreshCw,
  CheckCircle, X, Save, FileText, Zap, ShieldAlert, WifiOff
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { APP_ID } from '../constants';

const DIAG_PATH = `artifacts/${APP_ID}/public/data/student_exam_diagnostics`;
const STATS_PATH = `artifacts/${APP_ID}/public/data/concept_stats`;
const PAGE = 100;
const WRITE_TIMEOUT_MS = 10000;
const WIPE_PHRASE = '전체 삭제';

const CATEGORY_LABEL = { school: '학교 내신', concept: '개념 테스트', mock: '모의고사' };
const VALID_CATEGORY = ['school', 'concept', 'mock'];

/* 왜 틀렸는가. 채점할 때는 시간이 없어 비워 두고, 나중에 답안을 보며 채웁니다.

   이 구분이 중요한 이유가 있습니다. 지금은 '시간이 없어 못 푼 것' 과 '틀린 것' 이
   똑같이 wrong 으로 남습니다. 그런데 시험지 뒷번호는 대개 어려운 문항이라,
   시간에 쫓긴 학생이 자동으로 '고난도 취약' 으로 진단됩니다. */
const ERROR_TYPES = [
  { id: 'calc', label: '계산 실수' },
  { id: 'condition', label: '조건 누락' },
  { id: 'concept', label: '개념 모름' },
  { id: 'time', label: '시간 부족' },
  { id: 'blank', label: '미시도' }
];

const maxOf = (rec) => {
  const m = Number(rec?.maxScore);
  return Number.isFinite(m) && m > 0 ? m : null;
};

/* 점수 계산이 틀렸던 시절의 기록인가.
   만점 근거가 없는 것도 함께 잡습니다 — schemaVersion 만 보면
   만점을 모르는 기록이 '정상'으로 통과합니다. */
const needsRescore = (rec) => Number(rec?.schemaVersion) !== 2 || maxOf(rec) === null;

const sumPoints = (responses) =>
  Math.round((responses || []).reduce((s, r) => s + (Number(r.points) || 0), 0) * 10) / 10;

const fmtDate = (ts) => {
  if (!ts?.toDate) return '시각 미상';
  return ts.toDate().toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/* 영속 캐시가 켜져 있어서, 오프라인이면 쓰기 Promise 가 무기한 기다립니다.
   그동안 화면은 잠긴 채 아무 안내도 못 합니다. 시간을 끊고 사실대로 알립니다. */
const withTimeout = (p) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(
    () => reject(Object.assign(new Error('서버 확인이 오지 않았습니다.'), { code: 'app/timeout' })),
    WRITE_TIMEOUT_MS
  ))
]);

export default function ExamDiagnosticRecords({ currentUser }) {
  const { classes, enrollments } = useData();

  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [notice, setNotice] = useState(null);

  const [filterClassId, setFilterClassId] = useState('');
  const [searchName, setSearchName] = useState('');
  const [onlyRescore, setOnlyRescore] = useState(false);

  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState({});          // { [docId]: true }
  const [wipe, setWipe] = useState(null);        // { open, text, running, done }
  const editorDirty = useRef(false);

  const isBusy = (id) => !!busy[id];
  const anyBusy = Object.keys(busy).length > 0;
  const setBusyFor = (id, on) =>
    setBusy(prev => {
      if (on) return { ...prev, [id]: true };
      const next = { ...prev };
      delete next[id];
      return next;
    });

  /* 규칙(firestore.rules:415)상 삭제는 원장과 강사만 할 수 있습니다.
     전체 삭제는 되돌릴 수 없으므로 원장에게만 보여줍니다. */
  const canDelete = ['admin', 'lecturer'].includes(currentUser?.role);
  const canWipe = currentUser?.role === 'admin';
  const isLecturer = currentUser?.role === 'lecturer';

  /* 강사는 자기 반 학생의 기록만 봅니다.
     예전에는 학원 전체 최근 100건이 실명으로 나오고 남의 반 기록도 지울 수 있었습니다. */
  const ownStudentIds = useMemo(() => {
    if (!isLecturer) return null;
    const myClassIds = new Set(
      (Array.isArray(classes) ? classes : [])
        .filter(c => c.lecturerId === currentUser?.id || c.instructorId === currentUser?.id || c.teacherId === currentUser?.id)
        .map(c => c.id)
    );
    return new Set(
      (Array.isArray(enrollments) ? enrollments : [])
        .filter(e => myClassIds.has(e?.classId))
        .map(e => e.studentId)
    );
  }, [isLecturer, classes, enrollments, currentUser]);

  const fetchPage = useCallback(async (after) => {
    const parts = [orderBy('createdAt', 'desc')];
    if (after) parts.push(startAfter(after));
    parts.push(limit(PAGE));
    const snap = await getDocs(query(collection(db, DIAG_PATH), ...parts));
    return {
      rows: snap.docs.map(d => ({ id: d.id, ...d.data() })),
      last: snap.docs[snap.docs.length - 1] || null,
      more: snap.size === PAGE,
      cached: snap.metadata.fromCache
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { rows, last, more, cached } = await fetchPage(null);
      setRecords(rows);
      setCursor(last);
      setHasMore(more);
      setFromCache(cached);
    } catch (e) {
      console.error('[진단 기록] 조회 실패:', e);
      setErrorMsg(e?.code === 'permission-denied'
        ? '기록을 볼 권한이 없습니다.'
        : `기록을 불러오지 못했습니다: ${e.message || ''}`);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { load(); }, [load]);

  /* 이어서 읽습니다. 예전에는 limit 만 키워 매번 처음부터 다시 읽었고,
     기록이 쌓일수록 읽기 비용이 제곱으로 늘었습니다. */
  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const { rows, last, more, cached } = await fetchPage(cursor);
      setRecords(prev => [...prev, ...rows]);
      setCursor(last || cursor);
      setHasMore(more);
      setFromCache(cached);
    } catch (e) {
      console.error('[진단 기록] 추가 조회 실패:', e);
      setErrorMsg(`더 불러오지 못했습니다: ${e.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const classStudentIds = useMemo(() => {
    if (!filterClassId) return null;
    return new Set(
      (Array.isArray(enrollments) ? enrollments : [])
        .filter(e => e?.classId === filterClassId)     // 지난 수강도 포함. 반을 옮겨도 과거 기록이 보입니다.
        .map(e => e.studentId)
    );
  }, [filterClassId, enrollments]);

  const scoped = useMemo(
    () => (ownStudentIds ? records.filter(r => ownStudentIds.has(r.studentId)) : records),
    [records, ownStudentIds]
  );

  const visible = useMemo(() => {
    const q = searchName.trim();
    return scoped.filter(r => {
      if (onlyRescore && !needsRescore(r)) return false;
      if (classStudentIds && !classStudentIds.has(r.studentId)) return false;
      if (q && !String(r.studentName || '').includes(q)) return false;
      return true;
    });
  }, [scoped, onlyRescore, classStudentIds, searchName]);

  const rescoreCount = useMemo(() => scoped.filter(needsRescore).length, [scoped]);
  const filtered = visible.length !== scoped.length;

  const availableClasses = useMemo(() => {
    const list = Array.isArray(classes) ? classes : [];
    if (!isLecturer) return list;
    return list.filter(c => c.lecturerId === currentUser?.id || c.instructorId === currentUser?.id || c.teacherId === currentUser?.id);
  }, [classes, isLecturer, currentUser]);

  // ── 수정 ────────────────────────────────────────────────
  const openEditor = (rec) => {
    const responses = Array.isArray(rec.responses) && rec.responses.length > 0
      ? rec.responses.map(r => ({ ...r })) : null;
    /* 문항이 있으면 만점은 배점의 합입니다. 저장된 값과 어긋나면 합계를 정본으로 봅니다.
       어긋난 채 두면 다시 계산한 점수가 만점을 넘어 저장이 거부됩니다. */
    const derived = responses ? sumPoints(responses) : null;
    editorDirty.current = false;
    setEditing({
      ...rec,
      draft: {
        responses,
        score: String(rec.score ?? ''),
        // 옛 기록은 만점을 지어내지 않고 비워 둡니다. 100 을 미리 채우면 그 값이 사실로 굳습니다.
        maxScore: derived != null ? String(derived) : (maxOf(rec) != null ? String(maxOf(rec)) : ''),
        comment: rec.instructorComment || '',
        plan: rec.growthPlan || ''
      }
    });
  };

  const patchDraft = (patch) => {
    editorDirty.current = true;
    setEditing(prev => (prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev));
  };

  const closeEditor = () => {
    if (editorDirty.current && !window.confirm('고치던 내용이 사라집니다. 닫으시겠습니까?')) return;
    setEditing(null);
  };

  const toggleResponse = (idx) => {
    setEditing(prev => {
      if (!prev?.draft?.responses) return prev;
      const next = prev.draft.responses.map((r, i) => {
        if (i !== idx) return r;
        const nowCorrect = r.verdict === 'wrong';
        // 정답으로 되돌리면 오답 원인도 함께 지웁니다. 남겨 두면 앞뒤가 안 맞습니다.
        return { ...r, verdict: nowCorrect ? 'correct' : 'wrong', errorType: nowCorrect ? null : (r.errorType || null) };
      });
      editorDirty.current = true;
      const earned = next.reduce((s, r) => s + (r.verdict === 'wrong' ? 0 : Number(r.points) || 0), 0);
      return { ...prev, draft: { ...prev.draft, responses: next, score: String(Math.round(earned * 10) / 10) } };
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const d = editing.draft;
    const score = Number(d.score);
    const max = Number(d.maxScore);

    if (d.maxScore === '' || !Number.isFinite(max) || max <= 0 || max > 1000) {
      return alert('만점을 1~1000 사이의 숫자로 입력해주세요. (이 시험의 실제 총점입니다)');
    }
    if (d.score === '' || !Number.isFinite(score) || score < 0 || score > max) {
      return alert(`점수는 0~${max} 사이여야 합니다.`);
    }
    const category = editing.testCategory;
    if (!VALID_CATEGORY.includes(category)) {
      return alert(`이 기록의 평가 구분('${category || '없음'}')을 알 수 없어 저장할 수 없습니다. 삭제 후 다시 입력해주세요.`);
    }

    /* 문항별 정오로 계산한 점수와 손으로 넣은 점수가 다르면 확인을 받습니다.
       그냥 저장하면 '오답이 하나도 없는데 40점' 같은 모순된 기록이 학부모에게 갑니다. */
    if (d.responses) {
      const auto = d.responses.reduce((s, r) => s + (r.verdict === 'wrong' ? 0 : Number(r.points) || 0), 0);
      if (Math.abs(auto - score) > 0.001 && !window.confirm(
        `문항별 정오로 계산한 점수는 ${Math.round(auto * 10) / 10}점입니다.\n` +
        `${score}점으로 저장하면 오답 목록과 어긋납니다. (서술형 부분점수라면 그대로 진행하세요)\n\n계속할까요?`
      )) return;
    }

    setBusyFor(editing.id, true);
    try {
      const payload = {
        testCategory: category,
        score,
        maxScore: max,
        instructorComment: d.comment,
        growthPlan: d.plan,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.id || 'unknown'
      };
      if (d.responses) {
        // 문항 정보가 있을 때만 현재 형식으로 인정합니다.
        payload.schemaVersion = 2;
        payload.responses = d.responses;
        payload.wrongQuestionNumbers = d.responses.filter(r => r.verdict === 'wrong').map(r => r.no);
        payload.autoScore = Math.round(d.responses.reduce((s, r) => s + (r.verdict === 'wrong' ? 0 : Number(r.points) || 0), 0) * 10) / 10;
      } else {
        // 문항 정보가 없는 기록은 사람이 점수를 확인했다는 사실만 남깁니다.
        payload.rescoredAt = serverTimestamp();
        payload.rescoredBy = currentUser?.id || 'unknown';
      }

      await withTimeout(updateDoc(doc(db, DIAG_PATH, editing.id), payload));
      setRecords(prev => prev.map(r => (r.id === editing.id
        ? { ...r, ...payload, updatedAt: r.updatedAt, rescoredAt: r.rescoredAt } : r)));
      editorDirty.current = false;
      setEditing(null);
      setNotice(`${editing.studentName || '학생'} 기록을 수정했습니다.`);
    } catch (e) {
      console.error('[진단 기록] 수정 실패:', e);
      if (e?.code === 'app/timeout') {
        alert('서버 확인이 오지 않았습니다. 연결이 불안정할 수 있습니다.\n저장됐는지 새로고침해서 확인해주세요.');
      } else {
        alert(e?.code === 'permission-denied'
          ? '수정 권한이 없습니다. 점수가 0~만점 범위인지 확인해주세요.'
          : `수정에 실패했습니다: ${e.message || ''}`);
      }
    } finally {
      setBusyFor(editing.id, false);
    }
  };

  const removeRecord = async (rec) => {
    const max = maxOf(rec);
    if (!window.confirm(
      `아래 기록을 삭제합니다. 되돌릴 수 없습니다.\n\n` +
      `학생: ${rec.studentName || '이름 없음'}\n` +
      `시험: ${rec.examTitle || '(제목 없음)'}\n` +
      `점수: ${rec.score}${max != null ? ` / ${max}` : ''}점\n` +
      `저장: ${fmtDate(rec.createdAt)}\n\n계속할까요?`
    )) return;

    setBusyFor(rec.id, true);
    try {
      await withTimeout(deleteDoc(doc(db, DIAG_PATH, rec.id)));
      setRecords(prev => prev.filter(r => r.id !== rec.id));
      setNotice(`${rec.studentName || '학생'} 기록을 삭제했습니다.`);
    } catch (e) {
      console.error('[진단 기록] 삭제 실패:', e);
      if (e?.code === 'app/timeout') {
        alert('서버 확인이 오지 않았습니다. 연결이 불안정할 수 있습니다.\n지워졌는지 새로고침해서 확인해주세요.');
      } else {
        alert(e?.code === 'permission-denied'
          ? '삭제 권한이 없습니다. 삭제는 원장과 강사만 할 수 있습니다.'
          : `삭제에 실패했습니다: ${e.message || ''}`);
      }
    } finally {
      setBusyFor(rec.id, false);
    }
  };

  // ── 전체 삭제 ────────────────────────────────────────────
  /* 진단 기록과, 거기서 파생된 개념테스트 지표(concept_stats)를 함께 비웁니다.
     concept_stats 는 이 화면에서만 쓰고 아카데미 유니버스에서만 읽으므로,
     기록만 지우고 남겨두면 학부모 화면에 옛 지표가 유령처럼 남습니다. */
  const wipeCollection = async (path, onProgress) => {
    let removed = 0;
    for (let round = 0; round < 200; round += 1) {
      const snap = await getDocs(query(collection(db, path), limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      removed += snap.size;
      onProgress(removed);
      if (snap.size < 400) break;
    }
    return removed;
  };

  const runWipe = async () => {
    setWipe(w => ({ ...w, running: true, diag: 0, stats: 0 }));
    try {
      const diag = await wipeCollection(DIAG_PATH, n => setWipe(w => ({ ...w, diag: n })));
      const stats = await wipeCollection(STATS_PATH, n => setWipe(w => ({ ...w, stats: n })));
      setWipe(null);
      setRecords([]);
      setCursor(null);
      setHasMore(false);
      setNotice(`전체 삭제를 마쳤습니다. 진단 기록 ${diag}건, 개념테스트 지표 ${stats}건을 지웠습니다.`);
    } catch (e) {
      console.error('[진단 기록] 전체 삭제 실패:', e);
      setWipe(w => ({ ...w, running: false }));
      alert(e?.code === 'permission-denied'
        ? '삭제 권한이 없습니다. 원장 계정으로 진행해주세요.'
        : `전체 삭제 중 오류가 발생했습니다: ${e.message || ''}\n일부만 지워졌을 수 있습니다. 다시 실행하면 남은 것부터 이어서 지웁니다.`);
      load();
    }
  };

  return (
    <div className="space-y-5">
      {fromCache && (
        <div className="p-3.5 bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          지금 보이는 목록은 기기에 저장된 사본입니다. 서버 최신 상태와 다를 수 있습니다.
        </div>
      )}

      {rescoreCount > 0 && (
        <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-xl text-sm font-bold text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="leading-relaxed">
            불러온 기록 중 <strong>{rescoreCount}건</strong>이 옛 채점 방식으로 저장된 것입니다.
            그때는 만점이 100 으로 고정돼 있어 점수가 실제와 다를 수 있습니다.
            문항 정보가 없어 자동으로 되살릴 수 없으니, 확인해서 고치거나 지우고 다시 채점하는 편이 확실합니다.
          </div>
        </div>
      )}

      {notice && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-xl text-sm font-bold text-emerald-800 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-800"><X size={16} /></button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-xl text-sm font-bold text-rose-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" /> <span>{errorMsg}</span>
        </div>
      )}

      {/* 필터 */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            className="border border-slate-300 p-3 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            value={filterClassId} onChange={e => setFilterClassId(e.target.value)}
          >
            <option value="">반 전체</option>
            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="학생 이름으로 찾기"
              className="w-full border border-slate-300 pl-9 pr-3 py-3 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              value={searchName} onChange={e => setSearchName(e.target.value)}
            />
          </div>

          <button
            type="button" onClick={load} disabled={loading || anyBusy}
            title={anyBusy ? '저장 또는 삭제가 끝난 뒤에 눌러주세요.' : ''}
            className="border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 font-bold flex items-center justify-center gap-2 disabled:opacity-50 py-3"
          >
            {loading ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />} 새로고침
          </button>
        </div>

        <label className="flex items-center gap-2 mt-3 text-sm font-bold text-slate-600 cursor-pointer w-fit">
          <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={onlyRescore} onChange={e => setOnlyRescore(e.target.checked)} />
          재채점이 필요한 기록만 보기
        </label>
      </div>

      {/* 목록 */}
      {loading && records.length === 0 ? (
        <div className="py-16 text-center text-indigo-600 font-bold flex flex-col items-center gap-3">
          <Loader className="animate-spin" size={32} /> 기록을 불러오는 중입니다...
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-500 uppercase">
            {visible.length}건 표시 · 불러온 기록 {scoped.length}건
            {isLecturer && <span className="normal-case font-bold text-slate-400 ml-1">(내 반 학생만)</span>}
          </div>

          {visible.length === 0 ? (
            <div className="py-14 text-center px-6">
              <p className="font-black text-slate-700 mb-1">
                {filtered ? '조건에 맞는 기록이 없습니다.' : '저장된 기록이 없습니다.'}
              </p>
              {hasMore && (
                <p className="text-sm text-slate-500">
                  불러온 {scoped.length}건 안에서 찾고 있습니다. 더 예전 기록은 아래에서 불러오세요.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map(rec => {
                const max = maxOf(rec);
                const stale = needsRescore(rec);
                return (
                  <li key={rec.id} className="px-4 md:px-6 py-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-black text-slate-900">{rec.studentName || '이름 없음'}</span>
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {CATEGORY_LABEL[rec.testCategory] || rec.testCategory || '구분 없음'}
                          </span>
                          {stale && (
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">재채점 필요</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-700 truncate">{rec.examTitle || '(제목 없음)'}</p>
                        <p className="text-xs font-bold text-slate-400 mt-0.5">
                          {fmtDate(rec.createdAt)}
                          {rec.unitName ? ` · ${rec.unitName}` : ''}
                          {Array.isArray(rec.wrongQuestionNumbers) ? ` · 오답 ${rec.wrongQuestionNumbers.length}개` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="font-black text-xl text-indigo-700 leading-none text-right">
                          {rec.score}<span className="text-sm text-slate-400 font-bold">{max != null ? ` / ${max}` : ' / ?'}</span>
                        </div>
                        <button
                          type="button" onClick={() => openEditor(rec)} disabled={isBusy(rec.id)}
                          className="p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 disabled:opacity-50"
                          title="수정"
                        >
                          <Pencil size={16} />
                        </button>
                        {canDelete && (
                          <button
                            type="button" onClick={() => removeRecord(rec)} disabled={isBusy(rec.id)}
                            className="p-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:opacity-50"
                            title="삭제"
                          >
                            {isBusy(rec.id) ? <Loader size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 필터로 0건이어도 범위를 넓힐 수 있어야 합니다. */}
          {hasMore && (
            <button
              type="button" onClick={loadMore} disabled={loading}
              className="w-full py-4 bg-slate-50 hover:bg-slate-100 font-black text-slate-600 text-sm border-t border-slate-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader size={14} className="animate-spin" />}
              더 예전 기록 {PAGE}건 더 불러오기
            </button>
          )}
        </div>
      )}

      {/* 전체 삭제 */}
      {canWipe && (
        <div className="bg-white rounded-3xl border-2 border-rose-200 overflow-hidden">
          <div className="px-6 py-4 bg-rose-50 border-b border-rose-200 flex items-center gap-2 font-black text-rose-900">
            <ShieldAlert className="w-5 h-5 text-rose-600" /> 위험 구역
          </div>
          <div className="p-6">
            {!wipe?.open ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-600 leading-relaxed">
                  저장된 <strong>모든</strong> 시험 진단 기록과 개념테스트 지표를 지우고 처음부터 다시 시작합니다.
                </p>
                <button
                  type="button" onClick={() => setWipe({ open: true, text: '' })}
                  className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm flex items-center gap-2"
                >
                  <Trash2 size={16} /> 전체 삭제
                </button>
              </div>
            ) : wipe.running ? (
              <div className="flex items-center gap-3 font-bold text-rose-900">
                <Loader className="animate-spin w-5 h-5" />
                지우는 중입니다 — 진단 기록 {wipe.diag || 0}건, 개념테스트 지표 {wipe.stats || 0}건.
                <span className="text-xs font-bold text-slate-500">창을 닫지 마세요.</span>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-bold text-rose-900 leading-relaxed">
                  되돌릴 수 없습니다. 학생·학부모에게 보였던 성적 기록이 전부 사라집니다.<br />
                  계속하려면 아래 칸에 <strong className="bg-rose-100 px-1.5 py-0.5 rounded">{WIPE_PHRASE}</strong> 를 그대로 입력하세요.
                </p>
                <input
                  type="text" autoFocus placeholder={WIPE_PHRASE}
                  className="w-full border-2 border-rose-300 p-3 rounded-xl font-black outline-none focus:border-rose-500"
                  value={wipe.text} onChange={e => setWipe(w => ({ ...w, text: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button
                    type="button" onClick={() => setWipe(null)}
                    className="px-5 py-3 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
                  >
                    취소
                  </button>
                  <button
                    type="button" onClick={runWipe} disabled={wipe.text.trim() !== WIPE_PHRASE}
                    className="flex-1 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    전부 지우고 처음부터 시작
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 수정 창 */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6" onClick={closeEditor}>
          <div
            className="bg-white w-full md:max-w-2xl rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto custom-scrollbar"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="font-black text-lg text-slate-900 truncate">{editing.studentName} — 기록 수정</h3>
                <p className="text-xs font-bold text-slate-500 truncate">{editing.examTitle} · {fmtDate(editing.createdAt)}</p>
              </div>
              <button type="button" onClick={closeEditor} className="p-2 text-slate-400 hover:text-slate-700 shrink-0"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              {editing.draft.responses ? (
                <div>
                  <p className="text-xs font-extrabold text-slate-500 uppercase mb-2">
                    문항별 정오 — 누르면 바뀌고 점수가 다시 계산됩니다
                  </p>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    {editing.draft.responses.map((r, idx) => {
                      const isWrong = r.verdict === 'wrong';
                      return (
                        <button
                          key={`${r.no}-${idx}`} type="button" onClick={() => toggleResponse(idx)}
                          className={`px-3 min-w-[3.25rem] h-12 rounded-xl font-black text-sm border flex flex-col items-center justify-center leading-tight transition-colors ${
                            isWrong ? 'bg-rose-600 text-white border-rose-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <span>{r.no}번</span>
                          <span className={`text-[10px] font-bold ${isWrong ? 'text-rose-100' : 'text-slate-400'}`}>{r.points}점</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 오답마다 '왜 틀렸는가' 를 남깁니다. 비워 두어도 저장됩니다. */}
                  {editing.draft.responses.some(r => r.verdict === 'wrong') && (
                    <div className="mt-4">
                      <p className="text-xs font-extrabold text-slate-500 uppercase mb-2">
                        오답 원인 <span className="normal-case font-bold text-slate-400">— 선택 사항. 나중에 채워도 됩니다</span>
                      </p>
                      <div className="space-y-2">
                        {editing.draft.responses.map((r, idx) => {
                          if (r.verdict !== 'wrong') return null;
                          return (
                            <div key={`err-${r.no}-${idx}`} className="flex items-center gap-3">
                              <span className="w-16 shrink-0 text-sm font-black text-rose-700">{r.no}번</span>
                              <select
                                className="flex-1 border border-slate-300 p-2 rounded-lg bg-slate-50 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                value={r.errorType || ''}
                                onChange={e => setEditing(prev => {
                                  editorDirty.current = true;
                                  const next = prev.draft.responses.map((x, i) =>
                                    i === idx ? { ...x, errorType: e.target.value || null } : x);
                                  return { ...prev, draft: { ...prev.draft, responses: next } };
                                })}
                              >
                                <option value="">— 미분류 —</option>
                                {ERROR_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 leading-relaxed">
                  이 기록에는 문항별 정보가 없습니다(옛 형식). 점수와 <strong>실제 만점</strong>을 직접 입력해주세요.
                  {Array.isArray(editing.wrongQuestionNumbers) && editing.wrongQuestionNumbers.length > 0 && (
                    <span className="block mt-1">
                      기록된 오답 번호: {editing.wrongQuestionNumbers.join(', ')}
                      <span className="block text-amber-700">— 옛 채점 기준이라 새 점수와 맞지 않을 수 있습니다.</span>
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">점수 (원점수)</label>
                  <input
                    type="number" min="0" max={editing.draft.maxScore || undefined} step="0.5"
                    className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-rose-600 text-xl text-center outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editing.draft.score}
                    onChange={e => patchDraft({ score: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">만점</label>
                  <input
                    type="number" min="1" max="1000" placeholder="예: 80"
                    className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-slate-700 text-xl text-center outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                    value={editing.draft.maxScore}
                    onChange={e => patchDraft({ maxScore: e.target.value })}
                    disabled={!!editing.draft.responses}
                  />
                  {editing.draft.responses && (
                    <p className="text-[11px] font-bold text-slate-400 mt-1">문항 배점 합계라 직접 고칠 수 없습니다.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 mb-1.5 uppercase flex items-center gap-1"><FileText size={14} /> 강사 진단 코멘트</label>
                <textarea
                  rows="3" className="w-full border border-slate-300 p-3.5 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  value={editing.draft.comment}
                  onChange={e => patchDraft({ comment: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-emerald-700 mb-1.5 uppercase flex items-center gap-1"><Zap size={14} /> 맞춤 성장 플랜</label>
                <textarea
                  rows="3" className="w-full border border-emerald-300 p-3.5 rounded-xl bg-emerald-50/50 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-emerald-950"
                  value={editing.draft.plan}
                  onChange={e => patchDraft({ plan: e.target.value })}
                />
              </div>

              {editing.testCategory === 'concept' && (
                <p className="text-[11px] font-bold text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
                  개념 테스트 점수를 고쳐도 학부모 화면(아카데미 유니버스)의 지표는 아직 따라오지 않습니다.
                  그 연동은 별도 작업으로 예정되어 있습니다.
                </p>
              )}
            </div>

            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-200 flex gap-3">
              <button
                type="button" onClick={closeEditor}
                className="px-5 py-3 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button" onClick={saveEdit} disabled={isBusy(editing.id)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBusy(editing.id) ? <Loader size={18} className="animate-spin" /> : <Save size={18} />} 수정 내용 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
