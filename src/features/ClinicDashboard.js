import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar as CalendarIcon, Clock, CheckCircle, MessageSquare, Plus, Trash2, 
  Settings, Edit2, XCircle, PlusCircle, ClipboardList, BarChart2, CheckSquare, 
  Send, RefreshCw, ChevronLeft, ChevronRight, Check, Search, Eye, ArrowRight, Loader, RefreshCcw 
} from 'lucide-react';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, 
  query, where, onSnapshot, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Badge, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const CLASSROOMS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// [텔레그램 설정] - 원본 기능 유지
const TELEGRAM_API_URL = "https://api.telegram.org/bot8435500018:AAGY4gcNhiRBx2fHf8OzbHy74wIkzN5qvB0/sendMessage";
const CHAT_ID = "8466973475";

const TEMPLATES = {
  confirmParent: (d) => `[목동임페리얼학원]\n${d.studentName}학생의 클리닉 예정을 안내드립니다.\n\n[클리닉 예정 안내]\n일시 : ${d.date} ${d.startTime}~${d.endTime}\n장소 : 목동임페리얼학원 본관 ${d.classroom || '미정'}\n내용 : [${d.topic}] 개별 Q&A 클리닉\n\n학생이 직접 시간을 선정하였으며 해당 시간은 선생님과의 개인적인 약속이므로 늦지 않도록 지도해주시면 감사하겠습니다.`,
  feedbackParent: (d) => `[목동임페리얼학원]\n${d.studentName}학생의 클리닉 피드백입니다.\n\n클리닉 진행 조교 : ${d.taName}\n클리닉 진행 내용 : ${d.clinicContent}\n개별 문제점 : ${d.feedback}\n개선 방향 : ${d.improvement || '꾸준한 연습이 필요함'}\n\n감사합니다.`,
};

// --- Helper Functions ---
const getLocalToday = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const getFutureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const generateTimeSlots = () => Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
const getDaysInMonth = (d) => {
  const y = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const days = [];
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let i = 1; i <= last.getDate(); i++) days.push(new Date(y, m, i));
  return days;
};
const getWeekOfMonth = (date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfWeek = firstDay.getDay();
    return Math.ceil((date.getDate() + dayOfWeek) / 7);
};

// --- Calendar View Component (Memoized for Performance) ---
const CalendarView = React.memo(({ isInteractive, sessions, currentUser, currentDate, setCurrentDate, selectedDateStr, onDateChange, onAction, selectedSlots = [], users, taSubjectMap }) => {
  const mySessions = useMemo(() => {
     if (currentUser.role === 'ta') return sessions.filter(s => s.taId === currentUser.id && s.date === selectedDateStr);
     return sessions.filter(s => s.date === selectedDateStr);
  }, [sessions, currentUser, selectedDateStr]);

  const now = new Date();
  const isAdmin = currentUser.role === 'admin';
  const isStudent = currentUser.role === 'student';
  const isParent = currentUser.role === 'parent';
  const isLecturer = currentUser.role === 'lecturer';
  const isTa = currentUser.role === 'ta';

  const isTimeSlotBlockedForStudent = (time) => {
    if (!isStudent) return false;
    const alreadyBooked = sessions.some(s => 
        s.studentId === currentUser.id && 
        s.date === selectedDateStr && 
        s.startTime === time && 
        (s.status === 'confirmed' || s.status === 'pending')
    );
    if (alreadyBooked) return true;
    const selectedSessionTimes = selectedSlots.map(id => sessions.find(s => s.id === id)?.startTime).filter(Boolean);
    return selectedSessionTimes.includes(time);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
      <Card className="lg:col-span-1 min-h-[420px] p-4 md:p-6 w-full">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold flex items-center gap-2 text-lg text-gray-800"><CalendarIcon size={20} className="text-blue-600"/> 일정 선택</h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()-1)))} className="p-2 hover:bg-white rounded-md shadow-sm transition-all"><ChevronLeft size={20}/></button>
            <span className="font-bold text-lg w-20 text-center">{currentDate.getMonth()+1}월</span>
            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()+1)))} className="p-2 hover:bg-white rounded-md shadow-sm transition-all"><ChevronRight size={20}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-sm font-bold text-gray-400 mb-2">{DAYS.map(d=><div key={d} className="py-1">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {getDaysInMonth(currentDate).map((d,i)=>{
            if(!d) return <div key={i} className="aspect-square"/>;
            const dStr = formatDate(d);
            const isSel = dStr===selectedDateStr;
            const isToday = dStr === getLocalToday();
            let hasEvent = sessions.some(s => s.date === dStr && (isStudent ? s.status === 'open' : true));

            return (
              <button key={i} onClick={()=>onDateChange(dStr)} className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all ${isSel?'bg-blue-600 text-white shadow-md scale-105':'hover:bg-gray-100 text-gray-700'} ${isToday && !isSel ? 'bg-blue-50 text-blue-600' : ''}`}>
                <span className="text-base font-bold">{d.getDate()}</span>
                {hasEvent && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSel?'bg-white':'bg-blue-400'}`}/>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="lg:col-span-2 flex flex-col h-[600px] lg:h-auto p-0 md:p-6 overflow-hidden w-full">
        <div className="p-5 md:p-0 border-b md:border-none bg-white sticky top-0 z-10">
           <h3 className="font-bold text-xl"><span className="text-blue-600">{selectedDateStr.split('-')[2]}일</span> 상세 스케줄</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-0 space-y-3 custom-scrollbar">
          {generateTimeSlots().map((t, i) => {
            const slots = mySessions.filter(s => s.startTime === t);
            const isSlotPast = new Date(`${selectedDateStr}T${t}`) < now;
            
            if (isStudent && slots.filter(s => s.status === 'open' && !isSlotPast).length === 0) return null;

            if (slots.length === 0) {
              return (isTa || isAdmin) ? (
                <div key={i} className="flex gap-4 group min-h-[80px]">
                    <div className="w-14 text-right text-base font-bold text-gray-400 font-mono mt-2">{t}</div>
                    <div className="flex-1 border-2 border-dashed border-gray-200 rounded-xl p-3 flex justify-between items-center hover:bg-gray-50 transition-colors">
                        <span className="text-sm text-gray-400">등록된 근무 없음</span>
                        {!isSlotPast && <Button size="sm" variant="ghost" className="text-blue-600 bg-blue-50" icon={PlusCircle} onClick={()=>onAction('add_request', {time: t})}>근무 신청</Button>}
                    </div>
                </div>
              ) : null;
            }

            return (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-14 text-right text-base font-bold text-gray-600 font-mono mt-4">{t}</div>
                <div className="flex-1 space-y-3 w-full">
                  {slots.map(s => {
                    const isSelected = selectedSlots.includes(s.id);
                    const isBlocked = isStudent && !isSelected && isTimeSlotBlockedForStudent(s.startTime);
                    
                    if (isStudent && (s.status !== 'open' || isSlotPast)) return null;

                    return (
                      <div key={s.id} onClick={()=> !isBlocked && isStudent && onAction('toggle_slot', s)} className={`border rounded-2xl p-4 flex flex-col shadow-sm transition-all ${s.status==='confirmed' ? 'bg-green-50/50 border-green-200' : isSelected ? 'bg-blue-50 border-blue-500 ring-2' : 'bg-white border-gray-200'} ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-bold text-lg text-gray-900">{s.studentName || s.taName}</span>
                                <Badge status={s.status}/>
                            </div>
                            <div className="text-sm text-gray-600 font-medium">
                                <span className="text-blue-600 font-bold mr-1">[{s.taSubject || '개별 클리닉'}]</span>
                                {s.topic || (isAdmin ? `${s.taName} 근무` : '예약 대기 중')}
                            </div>
                            {(isAdmin || isLecturer || isTa) && s.studentName && (
                              <div className="text-sm text-gray-600 mt-2 p-2.5 bg-gray-50/80 rounded-xl border border-gray-100">
                                {s.questionRange && <div className="flex gap-1"><span className="font-bold text-gray-500 w-10 shrink-0">범위</span><span className="whitespace-pre-wrap">{s.questionRange}</span></div>}
                              </div>
                            )}
                            {isAdmin && (
                              <div className="mt-3 flex gap-2 items-center bg-gray-50 p-2 rounded-lg border">
                                <select className="text-sm border rounded-md p-1.5 bg-white w-full" value={s.classroom || ''} onChange={(e) => onAction('update_classroom', { id: s.id, val: e.target.value })}>
                                  <option value="">강의실 미배정</option>{CLASSROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button onClick={()=>onAction('admin_edit', s)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Edit2 size={18}/></button>
                                <button onClick={()=>onAction('delete', s.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={18}/></button>
                              </div>
                            )}
                            {!isAdmin && s.classroom && <div className="text-sm font-bold text-blue-600 mt-2 flex items-center gap-1 bg-blue-50 w-fit px-2 py-1 rounded"><CheckCircle size={14}/> {s.classroom}</div>}
                          </div>
                          <div className="flex flex-col gap-2 ml-2">
                            {isStudent && <Button size="sm" variant={isSelected ? "selected" : "outline"} disabled={isBlocked}>{isSelected ? '선택됨' : '선택'}</Button>}
                            {isAdmin && s.status==='pending' && <Button size="sm" variant="success" onClick={()=>onAction('approve_booking', s)}>승인</Button>}
                            {(isTa || isAdmin) && (s.status==='confirmed'||s.status==='completed') && <Button size="sm" variant={s.feedbackStatus==='submitted'?'secondary':'primary'} icon={CheckSquare} onClick={()=>onAction('write_feedback', s)} disabled={s.feedbackStatus==='submitted'}>{s.feedbackStatus==='submitted'?'완료':'작성'}</Button>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
});

// --- Main Clinic Dashboard ---
const ClinicDashboard = ({ currentUser, users }) => {
    const [sessionMap, setSessionMap] = useState({});
    const [sessions, setSessions] = useState([]);
    const [appLoading, setAppLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDateStr, setSelectedDateStr] = useState(getLocalToday());
    const [studentSelectedSlots, setStudentSelectedSlots] = useState([]); 
    const [applicationItems, setApplicationItems] = useState([{ subject: '', workbook: '', range: '' }]); 
    const [defaultSchedule, setDefaultSchedule] = useState({ 월: { start: '14:00', end: '22:00', active: false }, 화: { start: '14:00', end: '22:00', active: false }, 수: { start: '14:00', end: '22:00', active: false }, 목: { start: '14:00', end: '22:00', active: false }, 금: { start: '14:00', end: '22:00', active: false }, 토: { start: '10:00', end: '18:00', active: false }, 일: { start: '10:00', end: '18:00', active: false } }); 
    const [batchDateRange, setBatchDateRange] = useState({ start: '', end: '' }); 
    const [selectedTaIdForSchedule, setSelectedTaIdForSchedule] = useState(''); 
    const [selectedSession, setSelectedSession] = useState(null);
    const [confirmConfig, setConfirmConfig] = useState(null);
    const [adminEditData, setAdminEditData] = useState({ studentName: '', topic: '', questionRange: '' });
    const [feedbackData, setFeedbackData] = useState({});
    const [requestData, setRequestData] = useState({});

    const taSubjectMap = useMemo(() => {
        const map = {};
        if (users) users.forEach(u => { if (u.role === 'ta') map[u.id] = u.subject; });
        return map;
    }, [users]);

    // [CTO 최적화] fetchSessions 함수 제거 후 onSnapshot 실시간 동기화로 전면 교체
    useEffect(() => {
        if (!currentUser) return;
        setAppLoading(true);

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const startOfMonth = `${year}-${String(month).padStart(2,'0')}-01`;
        const endOfMonth = `${year}-${String(month).padStart(2,'0')}-31`;

        let q;
        // 학생/학부모는 데이터 소모를 줄이기 위해 3주치만, 나머지는 월간 데이터를 실시간 수신
        if (currentUser.role === 'student' || currentUser.role === 'parent') {
            q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), 
                      where('date', '>=', getLocalToday()), 
                      where('date', '<=', getFutureDate(21)));
        } else {
            q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), 
                      where('date', '>=', startOfMonth), 
                      where('date', '<=', endOfMonth));
        }

        // includeMetadataChanges를 통해 캐시 우선 렌더링 (TBT 0ms 목표)
        const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
            const fetchedData = {};
            snapshot.forEach(doc => { fetchedData[doc.id] = { id: doc.id, ...doc.data() }; });
            setSessionMap(fetchedData);
            setAppLoading(false);
            if (!snapshot.metadata.fromCache) console.log("[Clinic] Data Sync with Server Done.");
        }, (err) => {
            console.error("Session Sync Error:", err);
            setAppLoading(false);
        });

        return () => unsubscribe();
    }, [currentDate, currentUser]);

    useEffect(() => {
        const sorted = Object.values(sessionMap).sort((a,b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
        setSessions(sorted);
    }, [sessionMap]);

    const notify = (msg, type = 'success') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
    };

    const askConfirm = (message, onConfirm) => setConfirmConfig({ message, onConfirm });

    // [기능 복구] 텔레그램 알림 시스템
    const sendClinicNotificationToTelegram = async (updates) => {
        try {
            const bookedSessions = Object.values(updates);
            if (bookedSessions.length === 0) return;
            const studentName = bookedSessions[0].studentName;
            const topic = bookedSessions[0].topic;
            let scheduleText = "";
            bookedSessions.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).forEach(s => {
                scheduleText += `- ${s.date} ${s.startTime} (${s.taName})\n`;
            });
            const messageText = `<b>🔔 클리닉 신청 알림</b>\n\n<b>학생:</b> ${studentName}\n<b>내용:</b> ${topic}\n\n<b>신청 일정:</b>\n${scheduleText}`.trim();
            await fetch(TELEGRAM_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT_ID, text: messageText, parse_mode: 'HTML' })});
        } catch (e) { console.error("Telegram Error:", e); }
    };

    const handleAction = async (action, payload) => {
      try {
        if (action === 'toggle_slot') {
            const s = payload;
            if (studentSelectedSlots.includes(s.id)) {
                setStudentSelectedSlots(p => p.filter(id => id !== s.id));
            } else {
                if (studentSelectedSlots.length > 0 && sessions.find(sess => sess.id === studentSelectedSlots[0])?.date !== s.date) 
                    return notify('같은 날짜의 클리닉만 동시 신청 가능합니다.', 'error');
                setStudentSelectedSlots(p => [...p, s.id]);
            }
        } else if (action === 'add_request') {
            const h = parseInt(payload.time.split(':')[0]);
            const newSession = {
                taId: currentUser.id, taName: currentUser.name, taSubject: currentUser.subject || '',
                date: selectedDateStr, startTime: payload.time, endTime: `${String(h+1).padStart(2,'0')}:00`, 
                status: 'addition_requested', source: 'system', classroom: '', createdAt: serverTimestamp()
            };
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), newSession);
            notify('근무 신청 완료');
        } else if (action === 'cancel_request') {
             setSelectedSession(payload); setRequestData({reason:'', type:'cancel'}); setModalState({ type: 'request_change' });
        } else if (action === 'delete') {
            askConfirm("정말 삭제하시겠습니까?", async () => {
                await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload));
                notify('삭제 완료');
            });
        } else if (action === 'approve_booking') {
            setSelectedSession(payload); setModalState({ type: 'preview_confirm' });
        } else if (action === 'update_classroom') {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { classroom: payload.val, updatedAt: serverTimestamp() });
        } else if (action === 'write_feedback') {
            setSelectedSession(payload); setFeedbackData({clinicContent:payload.clinicContent||'', feedback:payload.feedback||'', improvement:payload.improvement||''}); setModalState({ type: 'feedback' });
        } else if (action === 'admin_edit') {
            setSelectedSession(payload); setAdminEditData({ studentName: payload.studentName||'', topic: payload.topic||'', questionRange: payload.questionRange||'' }); setModalState({ type: 'admin_edit' });
        } else if (action === 'send_feedback_msg') { 
             setSelectedSession(payload); setModalState({ type: 'message_preview_feedback' });
        } else if (action === 'approve_schedule_change') {
             if (payload.status === 'cancellation_requested') await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id));
             else await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open', updatedAt: serverTimestamp() });
             notify('승인 완료');
        }
      } catch (e) { notify('오류: ' + e.message, 'error'); }
    };

    // [기능 복구] 조교 근무 일괄 생성 로직
    const handleSaveDefaultSchedule = async () => {
        if (!selectedTaIdForSchedule || !batchDateRange.start || !batchDateRange.end) return notify('조교와 날짜를 선택하세요', 'error');
        const targetTa = users.find(u => u.id === selectedTaIdForSchedule);
        const batch = writeBatch(db);
        let count = 0;
        for (let d = new Date(batchDateRange.start); d <= new Date(batchDateRange.end); d.setDate(d.getDate() + 1)) {
            const dStr = formatDate(d);
            const dayName = DAYS[d.getDay()];
            const sched = defaultSchedule[dayName];
            if (sched && sched.active) {
                const sH = parseInt(sched.start.split(':')[0]), eH = parseInt(sched.end.split(':')[0]);
                for (let h = sH; h < eH; h++) {
                    const sT = `${String(h).padStart(2,'0')}:00`, eT = `${String(h+1).padStart(2,'0')}:00`;
                    if (!sessions.some(s => s.taId === targetTa.id && s.date === dStr && s.startTime === sT)) {
                        batch.set(doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions')), {
                            taId: targetTa.id, taName: targetTa.name, taSubject: targetTa.subject || '', date: dStr, startTime: sT, endTime: eT, 
                            status: 'open', source: 'system', studentName: '', topic: '', questionRange: '', classroom: '', createdAt: serverTimestamp()
                        });
                        count++;
                    }
                }
            }
        }
        await batch.commit(); notify(`${count}건 생성 완료`);
    };

    // [기능 복구] 학생 신청 및 텔레그램 연동
    const submitStudentApplication = async () => {
        try {
            const formattedTopic = applicationItems.map(i => i.subject).filter(Boolean).join(', ') || '개별 클리닉';
            const formattedRange = applicationItems.map(i => `${i.workbook} (${i.range})`).join('\n');
            const batch = writeBatch(db);
            const updates = {};
            
            studentSelectedSlots.forEach(id => {
                const updateData = { 
                    status: 'pending', studentId: currentUser.id, studentName: currentUser.name, 
                    studentPhone: currentUser.phone || '', topic: formattedTopic, questionRange: formattedRange, 
                    source: 'app', updatedAt: serverTimestamp() 
                };
                batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), updateData);
                updates[id] = { ...sessionMap[id], ...updateData };
            });

            await batch.commit(); 
            sendClinicNotificationToTelegram(updates);
            setModalState({type:null}); setStudentSelectedSlots([]); notify('신청 완료!');
        } catch (e) { notify('신청 오류', 'error'); }
    };

    const studentMyClinics = sessions.filter(s => (s.studentId === currentUser.id || s.studentName === currentUser.childName) && (s.status === 'confirmed' || s.status === 'pending'));

    if (appLoading) return <div className="h-screen flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="space-y-6 w-full pb-24">
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 space-y-2 pointer-events-none">
                {notifications.map(n=><div key={n.id} className="backdrop-blur text-white px-4 py-3 rounded-lg shadow-xl bg-gray-900/90 animate-in slide-in-from-top-2">{n.msg}</div>)}
            </div>

            {currentUser.role === 'admin' && (
                <div className="space-y-8">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-900">관리자 대시보드</h2>
                        <Button variant="secondary" size="sm" icon={BarChart2} onClick={()=>setModalState({type:'admin_stats'})}>통계</Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="border-purple-200 bg-purple-50/30">
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><ClipboardList className="text-purple-600"/> 근무 변경 요청 {sessions.filter(s=>s.status.includes('requested')).length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{sessions.filter(s=>s.status.includes('requested')).length}</span>}</h2>
                            <div className="space-y-3">{sessions.filter(s=>s.status.includes('requested')).map(req=>(
                                <div key={req.id} className="bg-white border p-4 rounded-xl flex justify-between items-center shadow-sm">
                                    <div><Badge status={req.status}/> <span className="font-bold ml-2">{req.taName}</span> <span className="text-sm text-gray-500">{req.date} {req.startTime}</span></div>
                                    <Button size="sm" onClick={()=>handleAction('approve_schedule_change', req)}>승인</Button>
                                </div>
                            ))}</div>
                        </Card>

                        <Card className="bg-blue-50/50 border-blue-100">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-blue-900"><Clock size={20}/> 근무 일괄 생성</h3>
                                <select className="border rounded-lg p-2 text-sm bg-white" value={selectedTaIdForSchedule} onChange={e=>setSelectedTaIdForSchedule(e.target.value)}>
                                    <option value="">조교 선택</option>{users.filter(u=>u.role==='ta').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2 mb-4">
                                <input type="date" className="border rounded-lg p-2 flex-1 text-sm" value={batchDateRange.start} onChange={e=>setBatchDateRange({...batchDateRange, start:e.target.value})}/>
                                <input type="date" className="border rounded-lg p-2 flex-1 text-sm" value={batchDateRange.end} onChange={e=>setBatchDateRange({...batchDateRange, end:e.target.value})}/>
                            </div>
                            <Button onClick={handleSaveDefaultSchedule} className="w-full" size="sm">스케줄 생성 실행</Button>
                        </Card>
                    </div>

                    <Card>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><CheckCircle className="text-green-600"/> 승인 대기 / 피드백 대기</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-gray-400">신규 예약</h3>
                                {sessions.filter(s=>s.status==='pending').map(s=>(
                                    <div key={s.id} className="border border-green-100 bg-green-50/30 p-4 rounded-xl flex justify-between items-center">
                                        <div className="text-sm"><b>{s.studentName}</b><br/>{s.date} {s.startTime}</div>
                                        <Button size="sm" onClick={()=>handleAction('approve_booking', s)}>승인</Button>
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-gray-400">피드백 발송</h3>
                                {sessions.filter(s=>s.feedbackStatus==='submitted').map(s=>(
                                    <div key={s.id} className="border border-gray-200 p-4 rounded-xl flex justify-between items-center">
                                        <div className="text-sm"><b>{s.studentName}</b><br/>{s.taName} 작성</div>
                                        <Button variant="secondary" size="sm" onClick={()=>handleAction('send_feedback_msg', s)} icon={Send}>발송</Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            <CalendarView 
                isInteractive={currentUser.role !== 'lecturer' && currentUser.role !== 'parent'} 
                sessions={sessions} 
                currentUser={currentUser} 
                currentDate={currentDate} 
                setCurrentDate={setCurrentDate} 
                selectedDateStr={selectedDateStr} 
                onDateChange={setSelectedDateStr} 
                onAction={handleAction} 
                selectedSlots={studentSelectedSlots} 
                users={users} 
                taSubjectMap={taSubjectMap}
            />

            {(currentUser.role === 'student' || currentUser.role === 'parent') && (
                <div className="mt-8 space-y-6">
                    <Card className="bg-blue-50 border-blue-100">
                        <h2 className="text-lg font-bold mb-4 text-blue-800 flex items-center gap-2"><CheckCircle size={20}/> {currentUser.role === 'parent' ? `${currentUser.childName} 학생의` : '나의'} 예약 현황</h2>
                        {studentMyClinics.length === 0 ? <div className="text-center py-8 text-gray-400">예약 내역이 없습니다.</div> : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {studentMyClinics.map(s => (
                                    <div key={s.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                                        <div>
                                            <div className="font-bold text-gray-800">{s.date} {s.startTime}</div>
                                            <div className="text-sm text-gray-500">{s.taName} TA | {s.topic}</div>
                                        </div>
                                        <Badge status={s.status}/>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                    {studentSelectedSlots.length > 0 && (
                        <div className="fixed bottom-6 left-0 right-0 p-4 z-50 flex justify-center">
                            <Button className="w-full max-w-md shadow-2xl py-4 text-xl rounded-2xl" onClick={()=>setModalState({type:'student_apply'})}>
                                {studentSelectedSlots.length}건 예약 신청하기 <ArrowRight className="ml-2"/>
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            <Modal isOpen={modalState.type==='student_apply'} onClose={()=>setModalState({type:null})} title="클리닉 상세 내용">
                <div className="space-y-4">
                    {applicationItems.map((item, i) => (
                        <div key={i} className="p-4 bg-gray-50 rounded-xl space-y-3 border">
                            <input placeholder="과목 (예: 미적분)" className="w-full p-3 border rounded-lg" value={item.subject} onChange={e=>{const n=[...applicationItems]; n[i].subject=e.target.value; setApplicationItems(n)}}/>
                            <div className="flex gap-2">
                                <input placeholder="교재" className="flex-1 p-3 border rounded-lg" value={item.workbook} onChange={e=>{const n=[...applicationItems]; n[i].workbook=e.target.value; setApplicationItems(n)}}/>
                                <input placeholder="범위" className="flex-1 p-3 border rounded-lg" value={item.range} onChange={e=>{const n=[...applicationItems]; n[i].range=e.target.value; setApplicationItems(n)}}/>
                            </div>
                        </div>
                    ))}
                    <Button variant="outline" className="w-full" onClick={()=>setApplicationItems([...applicationItems, {subject:'', workbook:'', range:''}])} icon={Plus}>과목 추가</Button>
                    <Button className="w-full py-4 text-lg" onClick={submitStudentApplication}>최종 신청하기</Button>
                </div>
            </Modal>

            <Modal isOpen={modalState.type==='preview_confirm'} onClose={()=>setModalState({type:null})} title="예약 확정 및 문자 발송">
                <div className="bg-gray-50 p-4 rounded-xl mb-4 text-sm whitespace-pre-wrap leading-relaxed">{selectedSession && TEMPLATES.confirmParent(selectedSession)}</div>
                <Button className="w-full py-4" onClick={async ()=>{ 
                    await updateDoc(doc(db,'artifacts',APP_ID, 'public', 'data', 'sessions', selectedSession.id), {status:'confirmed', updatedAt: serverTimestamp()}); 
                    setModalState({type:null}); notify('확정 완료'); 
                }}>전송 및 확정</Button>
            </Modal>

            <Modal isOpen={modalState.type==='feedback'} onClose={()=>setModalState({type:null})} title="피드백 작성">
                <div className="space-y-3">
                    <textarea className="w-full border rounded-xl p-3 h-24" placeholder="진행 내용" value={feedbackData.clinicContent} onChange={e=>setFeedbackData({...feedbackData, clinicContent:e.target.value})}/>
                    <textarea className="w-full border rounded-xl p-3 h-24" placeholder="문제점" value={feedbackData.feedback} onChange={e=>setFeedbackData({...feedbackData, feedback:e.target.value})}/>
                    <textarea className="w-full border rounded-xl p-3 h-24" placeholder="개선 방향" value={feedbackData.improvement} onChange={e=>setFeedbackData({...feedbackData, improvement:e.target.value})}/>
                    <Button className="w-full py-4" onClick={async()=>{ 
                        await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{...feedbackData, status:'completed', feedbackStatus:'submitted', updatedAt: serverTimestamp()}); 
                        setModalState({type:null}); notify('저장 완료'); 
                    }}>피드백 저장</Button>
                </div>
            </Modal>

            <Modal isOpen={modalState.type==='admin_stats'} onClose={()=>setModalState({type:null})} title="근무 통계">
                <div className="overflow-x-auto"><table className="w-full text-sm text-left">
                    <thead><tr className="bg-gray-100 border-b"><th className="p-3">조교명</th>{[1,2,3,4,5].map(w=><th key={w} className="p-3 text-center">{w}주</th>)}<th className="p-3 text-center">합계</th></tr></thead>
                    <tbody>{users.filter(u=>u.role==='ta').map(ta=>{
                        let tConf=0, tSched=0;
                        return (<tr key={ta.id} className="border-b">
                            <td className="p-3 font-medium">{ta.name}</td>
                            {[1,2,3,4,5].map(w=>{
                                const weekSessions = sessions.filter(s=>s.taId===ta.id && getWeekOfMonth(new Date(s.date))===w);
                                const conf=weekSessions.filter(s=>['confirmed','completed'].includes(s.status)).length;
                                const sched=weekSessions.length; tConf+=conf; tSched+=sched;
                                return <td key={w} className="p-3 text-center text-xs">{sched>0?`${conf}/${sched}`:'-'}</td>
                            })}
                            <td className="p-3 text-center font-bold text-blue-600">{tConf}/{tSched}</td>
                        </tr>)
                    })}</tbody>
                </table></div>
            </Modal>

            <Modal isOpen={!!confirmConfig} onClose={() => setConfirmConfig(null)} title="시스템 확인">
                <div className="space-y-6 text-center">
                    <p className="text-lg font-medium mt-4">{confirmConfig?.message}</p>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setConfirmConfig(null)} className="flex-1 py-3">취소</Button>
                        <Button variant="danger" onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }} className="flex-1 py-3">확인</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ClinicDashboard;