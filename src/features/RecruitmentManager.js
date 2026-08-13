/* 채용 파이프라인

   [무엇이 달라졌나]
   1. 단계가 실제 채용 과정을 따릅니다 — 서류 접수 → 전화 안내 → 면접 → 합격 →
      경력조회 → 근로계약. 예전에는 전화 안내와 계약 단계가 없었습니다.
   2. 문자는 **보낼 내용을 그대로 보여 준 뒤** 사람이 확인해야 나갑니다.
      예전에는 상태를 바꾸는 순간 즉시 발송돼 되돌릴 수 없었습니다.
   3. 문자에 들어가는 학원 정보(담당자·기관 코드)는 환경설정에서 받아 씁니다.
      예전에는 코드에 박혀 있어 공개 JS 파일로 새어 나갔습니다.
   4. 단계를 되돌릴 수 있습니다. 잘못 누른 것을 고칠 수 없던 문제를 없앴습니다.
*/

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Briefcase, UserPlus, Users, Phone, Calendar as CalendarIcon,
  CheckCircle, XCircle, FileText, Trash2, Loader, ArrowRight, AlertCircle,
  Send, Undo2, MessageSquare, Settings
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, addDoc, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useData } from '../contexts/DataContext';
import { Modal, Button, Badge } from '../components/UI';
import { APP_ID } from '../constants';
import {
  POSITIONS, SOURCES, findPosition, STAGES, stageOf, ACTIONS_BY_STAGE, CAN_REJECT,
  buildMessage, missingConfigFor, configLabel, cleanPhone
} from '../utils/recruitment';

const PATH = `artifacts/${APP_ID}/public/data/recruitment`;

const TONE = {
  slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700', emerald: 'bg-emerald-100 text-emerald-700',
  purple: 'bg-purple-100 text-purple-700', indigo: 'bg-indigo-100 text-indigo-700',
  rose: 'bg-rose-100 text-rose-700'
};
const BTN = {
  amber: 'bg-amber-600 hover:bg-amber-700', blue: 'bg-blue-600 hover:bg-blue-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700', purple: 'bg-purple-600 hover:bg-purple-700',
  indigo: 'bg-indigo-600 hover:bg-indigo-700'
};

export default function RecruitmentManager() {
  const { currentUser, loadingData } = useData() || {};
  const navigate = useNavigate();

  const [applicants, setApplicants] = useState([]);
  const [config, setConfig] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [criticalError, setCriticalError] = useState('');
  const isMounted = useRef(true);

  const [addOpen, setAddOpen] = useState(false);
  /* 유입 경로와 포지션에 기본값을 두지 않습니다.
     예전에는 '알바몬'·'수업조교' 가 미리 박혀 있어서, 그 칸을 건드리지 않으면
     훈장마을로 온 강사가 알바몬 조교로 기록됐습니다. */
  const [form, setForm] = useState({ name: '', phone: '', source: '', position: '', resumeRaw: '' });
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [openResume, setOpenResume] = useState(null);   // 이력서 원문을 펼쳐 볼 지원자

  /* 진행 창. 단계 이동과 문자 미리보기를 한 곳에서 처리합니다. */
  const [step, setStep] = useState(null);   // { applicant, action, schedule, message }

  useEffect(() => {
    isMounted.current = true;
    const unsub = onSnapshot(
      query(collection(db, PATH), orderBy('createdAt', 'desc')),
      (snap) => {
        if (!isMounted.current) return;
        setApplicants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCriticalError('');
        setIsLoading(false);
      },
      (error) => {
        console.error('[채용] 조회 실패:', error);
        if (!isMounted.current) return;
        setCriticalError(error?.code === 'permission-denied'
          ? '채용 정보를 볼 권한이 없습니다. 원장·행정조교만 접근할 수 있습니다.'
          : '채용 정보를 불러오지 못했습니다.');
        setIsLoading(false);
      }
    );
    return () => { isMounted.current = false; unsub(); };
  }, []);

  // 문자에 들어가는 학원 정보. 코드에 두지 않습니다.
  useEffect(() => {
    getDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'recruitment'))
      .then(snap => { if (snap.exists()) setConfig(snap.data()); })
      .catch(e => console.error('[채용] 설정 로드 실패:', e?.code));
  }, []);

  const byStage = useMemo(() => {
    const m = {};
    STAGES.forEach(s => { m[s.id] = applicants.filter(a => (a.status || 'applied') === s.id); });
    return m;
  }, [applicants]);

  // ── 등록 ────────────────────────────────────────────────
  const handleAdd = async () => {
    const phone = cleanPhone(form.phone);
    if (!form.name.trim()) return alert('지원자 이름을 입력해주세요.');
    if (!phone) return alert('연락처를 확인해주세요. 숫자 10자리 이상이어야 합니다.');
    if (!form.source) return alert('어디로 지원했는지 선택해주세요.');
    if (!form.position) return alert('지원 포지션을 선택해주세요.');

    // 같은 번호가 이미 있으면 알려 줍니다. 양쪽 사이트에 지원한 사람이 두 건으로 들어옵니다.
    const dup = applicants.find(a => cleanPhone(a.phone) === phone);
    if (dup && !window.confirm(
      `같은 번호로 이미 등록된 지원자가 있습니다.\n\n· ${dup.name} (${stageOf(dup.status).label})\n\n그래도 새로 등록할까요?`
    )) return;

    setIsSaving(true);
    try {
      await addDoc(collection(db, PATH), {
        name: form.name.trim(), phone, source: form.source, position: form.position,
        /* 지원 내용 원문. 면접 직전에 훈장마을·메일함을 다시 열지 않아도 되게
           그대로 담아 둡니다. 옮겨 적는 수고에 대한 보상이 여기서 나옵니다. */
        resumeRaw: form.resumeRaw.trim() || null,
        status: 'applied', callAttempts: 0,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      setAddOpen(false);
      setForm({ name: '', phone: '', source: '', position: '', resumeRaw: '' });
    } catch (e) { alert('등록 실패: ' + e.message); } finally { setIsSaving(false); }
  };

  // ── 단계 이동 ────────────────────────────────────────────
  const openStep = (applicant, action) => {
    setStep({
      applicant, action,
      schedule: { interviewDate: applicant.interviewDate || '', interviewTime: applicant.interviewTime || '' },
      memo: applicant.callMemo || '',
      sending: false
    });
  };

  /* 며칠째 같은 자리에 멈춰 있는가. 바쁘면 잊히는 지원자를 화면이 스스로 드러내게 합니다. */
  const stuckDays = (a) => {
    const t = a.updatedAt?.toDate?.() || a.createdAt?.toDate?.();
    if (!t) return 0;
    return Math.floor((Date.now() - t.getTime()) / 86400000);
  };

  const visible = useMemo(() => {
    const q = search.trim();
    if (!q) return applicants;
    const digits = q.replace(/[^0-9]/g, '');
    return applicants.filter(a =>
      String(a.name || '').includes(q) || (digits && String(a.phone || '').includes(digits))
    );
  }, [applicants, search]);

  const previewOf = (s) => {
    if (!s?.action?.sms) return '';
    return buildMessage(s.action.sms, { applicant: s.applicant, schedule: s.schedule, config });
  };

  const commitStep = async (sendSms) => {
    const { applicant, action, schedule } = step;
    if (action.needsSchedule && (!schedule.interviewDate || !schedule.interviewTime)) {
      return alert('면접 날짜와 시간을 입력해주세요.');
    }

    setStep(s => ({ ...s, sending: true }));
    try {
      /* 문자를 먼저 보냅니다. 실패하면 상태를 바꾸지 않습니다 —
         예전에는 반대라서, 문자가 안 나가도 '통보됨' 으로 보였습니다. */
      if (sendSms && action.sms) {
        const phone = cleanPhone(applicant.phone);
        if (!phone) throw new Error('연락처가 올바르지 않아 문자를 보낼 수 없습니다.');
        await addDoc(collection(db, `artifacts/${APP_ID}/public/data/sms_outbox`), {
          phoneNumber: phone, message: previewOf(step), status: 'pending',
          type: 'hr_recruitment', recipientName: applicant.name, createdAt: serverTimestamp()
        });
      }

      const patch = { status: action.to, updatedAt: serverTimestamp() };
      if (action.needsSchedule) {
        patch.interviewDate = schedule.interviewDate;
        patch.interviewTime = schedule.interviewTime;
      }
      /* 통화 시도를 남깁니다. 모르는 번호라 안 받는 일이 잦은데 그 사실이
         어디에도 남지 않아 같은 사람에게 두 번 걸고 있었습니다. */
      if (action.logCall) {
        patch.callAttempts = (Number(applicant.callAttempts) || 0) + 1;
        patch.lastCallAt = serverTimestamp();
        if (step.memo?.trim()) patch.callMemo = step.memo.trim();
      }
      // 접수 확인은 한 번만 보내면 됩니다. 보냈다는 사실을 남겨 버튼을 감춥니다.
      if (action.markReceived && sendSms) patch.receivedNotifiedAt = serverTimestamp();
      await setDoc(doc(db, PATH, applicant.id), patch, { merge: true });
      setStep(null);
    } catch (e) {
      console.error('[채용] 처리 실패:', e);
      alert('처리하지 못했습니다: ' + e.message + '\n\n상태를 바꾸지 않았습니다.');
      setStep(s => (s ? { ...s, sending: false } : null));
    }
  };

  const moveBack = async (applicant) => {
    const idx = STAGES.findIndex(s => s.id === (applicant.status || 'applied'));
    const prev = applicant.status === 'rejected' ? 'applied' : STAGES[Math.max(0, idx - 1)]?.id;
    if (!prev || prev === applicant.status) return;
    if (!window.confirm(
      `${applicant.name} 지원자를 '${stageOf(prev).label}' 단계로 되돌립니다.\n\n이미 보낸 문자는 취소되지 않습니다. 계속할까요?`
    )) return;
    try {
      await setDoc(doc(db, PATH, applicant.id), { status: prev, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { alert('되돌리지 못했습니다: ' + e.message); }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(
      `${a.name} 지원자 기록을 삭제합니다.\n연락처: ${a.phone}\n단계: ${stageOf(a.status).label}\n\n` +
      `되돌릴 수 없습니다. 이미 보낸 문자 기록은 발송함에 남습니다.\n\n계속할까요?`
    )) return;
    try { await deleteDoc(doc(db, PATH, a.id)); }
    catch (e) { alert('삭제 실패: ' + e.message); }
  };

  // ── 화면 ────────────────────────────────────────────────
  if (isLoading || loadingData) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center">
        <Loader className="animate-spin text-indigo-600 mb-4" size={40} />
        <p className="text-slate-500 font-bold">채용 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (criticalError) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center p-4 text-center">
        <AlertCircle size={64} className="text-rose-500 mb-4" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">접근 오류</h2>
        <p className="text-slate-500 font-bold mb-6 max-w-md">{criticalError}</p>
        <Button onClick={() => window.location.reload()} className="bg-indigo-600">새로고침</Button>
      </div>
    );
  }

  const preview = step ? previewOf(step) : '';
  const missing = step?.action?.sms ? missingConfigFor(step.action.sms, config) : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
      <div className="bg-gradient-to-r from-slate-800 to-gray-900 rounded-3xl p-6 md:p-8 shadow-xl text-white flex flex-col md:flex-row justify-between md:items-center gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-2">
            <Briefcase size={28} /> 채용 파이프라인
          </h1>
          <p className="text-gray-300 font-medium">
            서류 접수 · 전화 안내 · 면접 · 합격 · 경력조회 · 근로계약까지 한 화면에서 진행합니다.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-5 py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <UserPlus size={18} /> 신규 지원자 등록
        </button>
      </div>

      {/* 단계별 인원 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {STAGES.map(s => (
          <div key={s.id} className="bg-white border border-slate-200 rounded-2xl px-3 py-3 text-center">
            <div className="text-2xl font-black text-slate-800">{byStage[s.id]?.length || 0}</div>
            <div className="text-[11px] font-bold text-slate-500 leading-tight mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="font-black text-slate-700 flex items-center gap-2">
            <Users size={18} /> 지원자 {visible.length}명
            {search && <span className="text-xs font-bold text-slate-400">(전체 {applicants.length}명)</span>}
          </div>
          <input
            type="text" placeholder="이름 또는 연락처로 찾기"
            className="border border-slate-300 px-3 py-2 rounded-xl bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>

        {visible.length === 0 ? (
          <div className="text-center py-20 text-slate-400 font-bold flex flex-col items-center">
            <Briefcase size={48} className="opacity-20 mb-4" />
            {search ? '조건에 맞는 지원자가 없습니다.' : '현재 진행 중인 채용 건이 없습니다.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map(app => {
              const st = stageOf(app.status);
              const pos = findPosition(app.position);
              const actions = ACTIONS_BY_STAGE[st.id] || [];
              const canReject = CAN_REJECT.includes(st.id);
              const canUndo = st.id !== 'applied';

              return (
                <div key={app.id} className="p-4 md:p-6 hover:bg-slate-50/60 transition-colors flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-black text-lg text-slate-900">{app.name}</span>
                      <Badge className={TONE[st.tone]}>{st.label}</Badge>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{pos.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-500">
                      <span className="flex items-center gap-1"><Phone size={14} /> {app.phone}</span>
                      <span className="flex items-center gap-1"><ArrowRight size={14} /> {app.source}</span>
                      {app.interviewDate && (
                        <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                          <CalendarIcon size={14} /> {app.interviewDate} {app.interviewTime}
                        </span>
                      )}
                    </div>
                    {pos.interview.length > 1 && ['screening', 'scheduled'].includes(st.id) && (
                      <p className="text-[11px] font-bold text-slate-400 mt-1.5">
                        면접 구성: {pos.interview.join(' · ')}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                      {Number(app.callAttempts) > 0 && (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          통화 시도 {app.callAttempts}회
                        </span>
                      )}
                      {/* 결과가 정해지지 않았는데 오래 멈춰 있으면 눈에 띄게 합니다. */}
                      {!['contracted', 'rejected'].includes(st.id) && stuckDays(app) >= 3 && (
                        <span className="text-[11px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                          {stuckDays(app)}일째 이 단계
                        </span>
                      )}
                      {app.resumeRaw && (
                        <button type="button" onClick={() => setOpenResume(app)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline">
                          지원 내용 보기
                        </button>
                      )}
                    </div>
                    {app.callMemo && (
                      <p className="text-[11px] font-bold text-slate-500 mt-1 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        통화 메모: {app.callMemo}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0 items-center">
                    {/* 접수 확인 문자. 단계를 옮기지 않고 문자만 보냅니다.
                        지원 직후의 침묵이 '연락 왔었나요' 전화로 돌아오던 것을 줄입니다. */}
                    {st.id === 'applied' && !app.receivedNotifiedAt && (
                      <Button onClick={() => openStep(app, {
                        to: 'applied', label: '접수 확인 문자', sms: 'received', tone: 'amber', markReceived: true
                      })} variant="outline" className="text-xs py-1.5 px-3 border-slate-300 text-slate-600 hover:bg-slate-50">
                        <MessageSquare size={14} className="mr-1 inline" /> 접수 확인
                      </Button>
                    )}

                    {actions.map(a => (
                      <Button key={a.to} onClick={() => openStep(app, a)}
                        className={`${BTN[a.tone] || BTN.blue} text-xs py-1.5 px-3`}>
                        {a.sms ? <MessageSquare size={14} className="mr-1 inline" /> : <CheckCircle size={14} className="mr-1 inline" />}
                        {a.label}
                      </Button>
                    ))}

                    {canReject && (
                      <Button onClick={() => openStep(app, { to: 'rejected', label: '불합격 통보', sms: 'rejected', tone: 'rose' })}
                        variant="outline" className="text-xs py-1.5 px-3 border-rose-200 text-rose-600 hover:bg-rose-50">
                        <XCircle size={14} className="mr-1 inline" /> 불합격
                      </Button>
                    )}

                    {st.id === 'contracted' && (
                      <Button onClick={() => navigate('/users')} className="bg-slate-800 hover:bg-black text-xs py-1.5 px-3">
                        <FileText size={14} className="mr-1 inline" /> 회원 관리에서 계정 만들기
                      </Button>
                    )}

                    {canUndo && (
                      <button onClick={() => moveBack(app)} title="이전 단계로 되돌리기"
                        className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors">
                        <Undo2 size={16} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(app)} title="기록 삭제"
                      className="p-2 text-slate-400 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 신규 등록 */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="신규 지원자 접수">
        <div className="space-y-4 p-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">지원자 이름</label>
              <input type="text" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-gray-800 font-bold"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">연락처</label>
              <input type="text" placeholder="01012345678"
                className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-gray-800 font-bold"
                value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">유입 경로</label>
              <select className="w-full border-2 border-slate-200 p-3 rounded-xl font-bold bg-white"
                value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                <option value="" disabled>선택하세요</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 mb-1.5 block">지원 포지션</label>
              <select className="w-full border-2 border-slate-200 p-3 rounded-xl font-bold bg-white"
                value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                <option value="" disabled>선택하세요</option>
                {POSITIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {form.position && (
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
              {findPosition(form.position).label} 면접 구성: {findPosition(form.position).interview.join(' · ')}
            </p>
          )}

          {/* 지원 내용을 통째로 붙여넣어 두면 면접 전에 사이트를 다시 열지 않아도 됩니다. */}
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">
              지원 내용 원문 <span className="font-medium text-slate-400">— 선택. 훈장마을·알바몬·메일 내용을 그대로 붙여넣으세요</span>
            </label>
            <textarea rows="4" placeholder="경력, 담당 가능 과목, 희망 근무 시간 등이 적힌 원문을 붙여넣으면 면접 때 여기서 바로 볼 수 있습니다."
              className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-gray-800 text-sm font-medium"
              value={form.resumeRaw} onChange={e => setForm({ ...form, resumeRaw: e.target.value })} />
          </div>
          <Button className="w-full py-4 text-lg font-black bg-gray-900 hover:bg-black mt-2" onClick={handleAdd} disabled={isSaving}>
            {isSaving ? <Loader className="animate-spin mx-auto" /> : '서류 접수 등록'}
          </Button>
        </div>
      </Modal>

      {/* 단계 이동 + 문자 미리보기 */}
      <Modal isOpen={!!step} onClose={() => !step?.sending && setStep(null)}
        title={step ? `${step.applicant.name} — ${step.action.label}` : ''} maxWidthClass="max-w-2xl">
        {step && (
          <div className="space-y-4 p-2">
            {step.action.needsSchedule && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">면접 일자</label>
                  <input type="date" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-blue-500 font-bold"
                    value={step.schedule.interviewDate}
                    onChange={e => setStep(s => ({ ...s, schedule: { ...s.schedule, interviewDate: e.target.value } }))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1.5 block">면접 시간</label>
                  <input type="time" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-blue-500 font-bold"
                    value={step.schedule.interviewTime}
                    onChange={e => setStep(s => ({ ...s, schedule: { ...s.schedule, interviewTime: e.target.value } }))} />
                </div>
              </div>
            )}

            {/* 통화 내용을 몇 줄 남겨 두면 면접 때 같은 질문을 다시 하지 않습니다. */}
            {step.action.logCall && (
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1.5 block">통화 메모 (선택)</label>
                <textarea rows="2" placeholder="예: 주 3회 가능, 9월부터 출근 희망"
                  className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-gray-800 text-sm font-medium"
                  value={step.memo} onChange={e => setStep(s => ({ ...s, memo: e.target.value }))} />
                {Number(step.applicant.callAttempts) > 0 && (
                  <p className="text-[11px] font-bold text-slate-400 mt-1">
                    지금까지 {step.applicant.callAttempts}회 시도했습니다.
                  </p>
                )}
              </div>
            )}

            {step.action.sms ? (
              missing.length > 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold text-amber-900 leading-relaxed">
                  문자를 보내려면 환경설정에 아래 항목을 먼저 채워야 합니다.
                  <ul className="mt-2 space-y-0.5">
                    {missing.map(k => <li key={k}>· {configLabel(k)}</li>)}
                  </ul>
                  <button type="button" onClick={() => navigate('/settings')}
                    className="mt-3 inline-flex items-center gap-1 text-amber-700 underline font-black">
                    <Settings size={14} /> 환경설정으로 가기
                  </button>
                  <p className="mt-2 text-xs font-bold text-amber-700">
                    문자 없이 단계만 옮길 수도 있습니다.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-extrabold text-slate-500 uppercase mb-2">
                    보낼 문자 — {step.applicant.phone} 로 발송됩니다
                  </p>
                  <pre className="w-full max-h-64 overflow-y-auto whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-xl p-4 text-[13px] font-medium text-slate-700 leading-relaxed">
                    {preview}
                  </pre>
                  <p className="text-[11px] font-bold text-slate-400 mt-1.5">
                    {preview.length}자 · 내용을 확인한 뒤 발송하세요. 보낸 뒤에는 취소할 수 없습니다.
                  </p>
                </div>
              )
            ) : (
              <p className="text-sm font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                {step.action.hint || '단계를 옮깁니다.'} 문자는 나가지 않습니다.
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={() => setStep(null)} disabled={step.sending}
                variant="outline" className="px-5 py-3 border-slate-300 text-slate-600">
                취소
              </Button>
              {step.action.sms && (
                <Button onClick={() => commitStep(false)} disabled={step.sending}
                  variant="outline" className="px-5 py-3 border-slate-300 text-slate-600">
                  문자 없이 단계만 옮기기
                </Button>
              )}
              <Button onClick={() => commitStep(!!step.action.sms)} disabled={step.sending || (step.action.sms && missing.length > 0)}
                className={`flex-1 py-3 font-black ${BTN[step.action.tone] || 'bg-indigo-600 hover:bg-indigo-700'} disabled:opacity-40`}>
                {step.sending ? <Loader className="animate-spin mx-auto" size={20} />
                  : step.action.sms ? <><Send size={16} className="mr-1 inline" /> 문자 보내고 단계 옮기기</>
                  : '단계 옮기기'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 지원 내용 원문 */}
      <Modal isOpen={!!openResume} onClose={() => setOpenResume(null)}
        title={openResume ? `${openResume.name} — 지원 내용` : ''} maxWidthClass="max-w-2xl">
        {openResume && (
          <div className="p-2">
            <p className="text-xs font-bold text-slate-500 mb-2">
              {findPosition(openResume.position).label} · {openResume.source} · {openResume.phone}
            </p>
            <pre className="w-full max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-xl p-4 text-[13px] font-medium text-slate-700 leading-relaxed">
              {openResume.resumeRaw}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
