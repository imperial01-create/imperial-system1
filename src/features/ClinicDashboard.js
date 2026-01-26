import React, { useState, useEffect, useMemo } from 'react';
// [수정] Eye, ArrowRight 등 누락된 아이콘 모두 추가 (런타임 에러 방지)
import { 
  Calendar as CalendarIcon, Clock, CheckCircle, MessageSquare, Plus, Trash2, 
  Settings, Edit2, XCircle, PlusCircle, ClipboardList, BarChart2, CheckSquare, 
  Send, RefreshCw, ChevronLeft, ChevronRight, Check, Search, Eye, ArrowRight 
} from 'lucide-react';
import { collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Badge, Modal, LoadingSpinner } from '../components/UI';

// --- Constants ---
const APP_ID = 'imperial-clinic-v1';
const CLASSROOMS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TEMPLATES = {
  confirmParent: (d) => `[목동임페리얼학원]\n${d.studentName}학생의 클리닉 예정을 안내드립니다.\n\n[클리닉 예정 안내]\n일시 : ${d.date} ${d.startTime}~${d.endTime}\n장소 : 목동임페리얼학원 본관 ${d.classroom}\n내용 : [${d.topic}] 개별 Q&A 클리닉\n\n학생이 직접 시간을 선정하였으며 해당 시간은 선생님과의 개인적인 약속이므로 늦지 않도록 지도해주시면 감사하겠습니다.`,
  feedbackParent: (d) => `[목동임페리얼학원]\n${d.studentName}학생의 클리닉 피드백입니다.\n\n클리닉 진행 조교 : ${d.taName}\n클리닉 진행 내용 : ${d.clinicContent}\n개별 문제점 : ${d.feedback}\n개선 방향 : ${d.improvement || '꾸준한 연습이 필요함'}\n\n감사합니다.`,
};

// --- Helper Functions ---
const getLocalToday = () => {
  const d = new Date();
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

// --- Calendar Sub-Component ---
const CalendarView = React.memo(({ isInteractive, sessions, currentUser, currentDate, setCurrentDate, selectedDateStr, onDateChange, onAction, selectedSlots = [], users }) => {
  const mySessions = useMemo(() => {
     if (currentUser.role === 'ta') {
        return sessions.filter(s => s.taId === currentUser.id && s.date === selectedDateStr);
     }
     return sessions.filter(s => s.date === selectedDateStr);
  }, [sessions, currentUser, selectedDateStr]);

  const now = new Date();
  const isAdmin = currentUser.role === 'admin';
  const isStudent = currentUser.role === 'student';
  const isLecturer = currentUser.role === 'lecturer';
  const isTa = currentUser.role === 'ta';

  const isTimeSlotBlockedForStudent = (time) => {
    if (!isStudent) return false;
    const alreadyBooked = sessions.some(s => 
        s.studentName === currentUser.name && 
        s.date === selectedDateStr && 
        s.startTime === time && 
        (s.status === 'confirmed' || s.status === 'pending')
    );
    if (alreadyBooked) return true;
    const selectedSessionTimes = selectedSlots.map(id => sessions.find(s => s.id === id)?.startTime).filter(Boolean);
    if (selectedSessionTimes.includes(time)) return true;
    return false;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
      <Card className="lg:col-span-1 min-h-[420px] p-4 md:p-6 w-full">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold flex items-center gap-2 text-lg text-gray-800"><CalendarIcon size={20} className="text-blue-600"/> 일정 선택</h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={()=>setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()-1)))} className="p-2 hover:bg-white rounded-md transition-all shadow-sm"><ChevronLeft size={20}/></button>
            <span className="font-bold text-lg w-20 text-center flex items-center justify-center">{currentDate.getMonth()+1}월</span>
            <button onClick={()=>setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()+1)))} className="p-2 hover:bg-white rounded-md transition-all shadow-sm"><ChevronRight size={20}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-sm font-bold text-gray-400 mb-2">{DAYS.map(d=><div key={d} className="py-1">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {getDaysInMonth(currentDate).map((d,i)=>{
            if(!d) return <div key={i} className="aspect-square"/>;
            const dStr = formatDate(d);
            const isSel = dStr===selectedDateStr;
            const isToday = dStr === getLocalToday();
            let hasEvent = false;
            if (isStudent) { if (dStr >= getLocalToday()) hasEvent = sessions.some(s => s.date === dStr && s.status === 'open'); }
            else if (isTa) { hasEvent = sessions.some(s => s.date === dStr && s.taId === currentUser.id); }
            else { hasEvent = sessions.some(s => s.date === dStr); }

            return (
              <button key={i} onClick={()=>onDateChange(dStr)} className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 min-h-[50px] ${isSel?'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-200': isToday ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-gray-100 text-gray-700'} ${hasEvent && !isSel ? 'ring-1 ring-blue-100' : ''}`}>
                <span className={`text-base md:text-lg ${isSel?'font-bold':''}`}>{d.getDate()}</span>
                {hasEvent && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSel?'bg-white':'bg-blue-400'}`}/>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="lg:col-span-2 flex flex-col h-[600px] lg:h-auto p-0 md:p-6 overflow-hidden w-full">
        <div className="p-5 md:p-0 border-b md:border-none bg-white sticky top-0 z-10">
           <h3 className="font-bold text-xl flex items-center gap-2">
            <span className="text-blue-600">{selectedDateStr.split('-')[2]}일</span> 상세 스케줄
           </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-0 custom-scrollbar space-y-3">
          {generateTimeSlots().map((t, i) => {
            const slots = mySessions.filter(s => s.startTime === t);
            // [버그 수정] 변수 선언 위치 보장
            const slotDateTime = new Date(`${selectedDateStr}T${t}`);
            const isSlotPast = slotDateTime < now;
            
            if (isStudent) {
                const availableSlots = slots.filter(s => s.status === 'open' && new Date(`${s.date}T${s.startTime}`) >= now);
                if (availableSlots.length === 0) return null;
            }
            if (isLecturer && slots.length === 0) return null;

            if(slots.length === 0) {
                 return isInteractive ? (
                    <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 group min-h-[80px]">
                        <div className="w-full md:w-14 text-left md:text-right text-base font-bold text-gray-400 font-mono pl-1">{t}</div>
                        <div className="flex-1 border-2 border-dashed border-gray-200 rounded-xl p-3 flex justify-between items-center hover:bg-gray-50 transition-colors w-full">
                            <span className="text-sm text-gray-400">등록된 근무 없음</span>
                            {/* [버그 수정] isSlotPast가 올바르게 참조됨 */}
                            {((isTa || isAdmin) && !isSlotPast) && <Button size="sm" variant="ghost" className="text-blue-600 bg-blue-50 hover:bg-blue-100" icon={PlusCircle} onClick={()=>onAction('add_request', {time: t})}>근무 신청</Button>}
                        </div>
                    </div>
                ) : (
                    !isStudent ? <div key={i} className="flex gap-4 items-start min-h-[60px] opacity-40">
                         <div className="w-14 pt-2 text-right text-sm font-bold text-gray-400 font-mono">{t}</div>
                         <div className="flex-1 border border-gray-100 rounded-xl p-3 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">일정 없음</div>
                    </div> : null
                );
            }

            return (
              <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 items-start">
                <div className="w-full md:w-14 text-left md:text-right text-lg md:text-base font-bold text-gray-800 md:text-gray-600 font-mono pl-1 mt-2 md:mt-4">{t}</div>
                <div className="flex-1 space-y-3 w-full">
                  {slots.map(s => {
                    const isConfirmed = s.status === 'confirmed';
                    const isSelected = selectedSlots.includes(s.id);
                    const isBlocked = isStudent && !isSelected && isTimeSlotBlockedForStudent(s.startTime);
                    
                    let taSubject = s.taSubject; 
                    if (!taSubject && users && users.length > 0) {
                        const taUser = users.find(u => u.id === s.taId);
                        if (taUser) taSubject = taUser.subject;
                    }

                    if (isStudent) {
                        if (s.status !== 'open') return null;
                        if (new Date(`${s.date}T${s.startTime}`) < now) return null;
                        
                        return (
                             <div key={s.id} onClick={()=> !isBlocked && onAction('toggle_slot', s)} className={`border-2 rounded-2xl p-3 md:p-4 flex justify-between items-center transition-all active:scale-[0.98] cursor-pointer w-full ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : isBlocked ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' : 'bg-white border-gray-200 hover:shadow-md'}`}>
                                <div className="flex-1 flex flex-col justify-center">
                                    <div className={`font-bold text-base md:text-lg leading-tight ${isBlocked ? 'text-gray-400' : 'text-gray-800'}`}>
                                        {taSubject ? <span className="text-blue-600 mr-1.5">[{taSubject}]</span> : ''}
                                        {s.taName} TA
                                    </div>
                                    <div className={`text-xs md:text-sm mt-0.5 ${isBlocked ? 'text-gray-400' : 'text-gray-500'}`}>
                                        개별 클리닉
                                    </div>
                                </div>
                                <div className="ml-3">
                                  <Button 
                                      size="sm" 
                                      variant={isSelected ? "selected" : "outline"}
                                      onClick={(e)=> { e.stopPropagation(); !isBlocked && onAction('toggle_slot', s); }}
                                      icon={isSelected ? Check : Plus}
                                      disabled={isBlocked}
                                  >
                                      {isSelected ? '선택됨' : isBlocked ? '불가' : '선택'}
                                  </Button>
                                </div>
                            </div>
                        );
                    }

                    return (
                      <div key={s.id} className={`border rounded-2xl p-4 flex flex-col justify-center shadow-sm transition-all w-full ${isConfirmed ? 'bg-green-50/50 border-green-200' : s.status==='cancellation_requested' ? 'bg-red-50 border-red-200' : s.status==='addition_requested' ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex justify-between items-start w-full">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="font-bold text-lg text-gray-900">{s.studentName || s.taName}</span>
                                <Badge status={s.status}/>
                            </div>
                            <div className="text-sm text-gray-600 font-medium">
                                {taSubject && <span className="text-blue-600 font-bold mr-1">[{taSubject}]</span>}
                                {s.topic || (isAdmin ? `${s.taName} 근무` : '예약 대기 중')}
                            </div>
                            {(isAdmin || isLecturer) && s.studentName && (
                              <div className="text-sm text-gray-600 mt-2 p-2.5 bg-gray-50/80 rounded-xl border border-gray-100">
                                {s.topic && <div className="flex gap-1 mb-1"><span className="font-bold text-gray-500 w-10 shrink-0">과목</span><span>{s.topic}</span></div>}
                                {s.questionRange && <div className="flex gap-1"><span className="font-bold text-gray-500 w-10 shrink-0">범위</span><span className="whitespace-pre-wrap">{s.questionRange}</span></div>}
                              </div>
                            )}
                            {isAdmin && (
                              <div className="mt-3 flex flex-wrap gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                <span className="text-xs font-bold text-gray-500 mr-2">담당: {s.taName}</span>
                                <select className={`text-sm border rounded-md p-1.5 focus:ring-2 focus:ring-blue-200 outline-none bg-white ${!s.classroom ? 'border-red-300 text-red-700' : 'border-gray-200'}`} value={s.classroom || ''} onChange={(e) => onAction('update_classroom', { id: s.id, val: e.target.value })}>
                                  <option value="">강의실 미배정</option>{CLASSROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <button onClick={()=>onAction('admin_edit', s)} className="text-gray-500 hover:text-blue-600 p-2"><Edit2 size={18}/></button>
                                <button onClick={()=>onAction('delete', s.id)} className="text-gray-500 hover:text-red-600 p-2"><Trash2 size={18}/></button>
                              </div>
                            )}
                            {!isAdmin && s.classroom && <div className="text-sm font-bold text-blue-600 mt-2 flex items-center gap-1 bg-blue-50 w-fit px-2 py-1 rounded"><CheckCircle size={14}/> {s.classroom}</div>}
                          </div>
                          <div className="flex flex-col gap-2 ml-2">
                            {isInteractive && s.status==='open' && !isSlotPast && <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 h-10 w-10 p-0" onClick={()=>onAction('cancel_request', s)}><XCircle size={20}/></Button>}
                            {isInteractive && s.status==='cancellation_requested' && <Button size="sm" variant="secondary" onClick={()=>onAction('withdraw_cancel', s)}>철회</Button>}
                            
                            {/* [버그 수정] 철회 버튼의 onAction 페이로드를 명확히 지정 */}
                            {isInteractive && s.status==='addition_requested' && <Button size="sm" variant="secondary" onClick={()=>onAction('withdraw_add', s.id)}>철회</Button>}
                            
                            {isAdmin && s.status==='pending' && <Button size="sm" variant="success" onClick={()=>onAction('approve_booking', s)}>승인</Button>}
                            {isInteractive && (s.status==='confirmed'||s.status==='completed') && <Button size="sm" variant={s.feedbackStatus==='submitted'?'secondary':'primary'} icon={CheckSquare} onClick={()=>onAction('write_feedback', s)} disabled={s.feedbackStatus==='submitted'}>{s.feedbackStatus==='submitted'?'완료':'작성'}</Button>}
                          </div>
                        </div>
                      </div>
                    )
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
    const [searchQuery, setSearchQuery] = useState('');
    const [studentSelectedSlots, setStudentSelectedSlots] = useState([]); 
    const [applicationItems, setApplicationItems] = useState([{ subject: '', workbook: '', range: '' }]); 
    const [defaultSchedule, setDefaultSchedule] = useState({ 월: { start: '14:00', end: '22:00', active: false }, 화: { start: '14:00', end: '22:00', active: false }, 수: { start: '14:00', end: '22:00', active: false }, 목: { start: '14:00', end: '22:00', active: false }, 금: { start: '14:00', end: '22:00', active: false }, 토: { start: '10:00', end: '18:00', active: false }, 일: { start: '10:00', end: '18:00', active: false } }); 
    const [batchDateRange, setBatchDateRange] = useState({ start: '', end: '' }); 
    const [selectedTaIdForSchedule, setSelectedTaIdForSchedule] = useState(''); 
    const [manageTab, setManageTab] = useState('ta'); 
    const [newUser, setNewUser] = useState({ name: '', userId: '', password: '', phone: '', subject: '' }); 
    const [selectedSession, setSelectedSession] = useState(null);
    const [confirmConfig, setConfirmConfig] = useState(null);
    const [adminEditData, setAdminEditData] = useState({ studentName: '', topic: '', questionRange: '' });
    const [feedbackData, setFeedbackData] = useState({});
    const [requestData, setRequestData] = useState({});

    useEffect(() => {
        if (!currentUser) return;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const startOfMonth = `${year}-${String(month).padStart(2,'0')}-01`;
        const endOfMonth = `${year}-${String(month).padStart(2,'0')}-31`;

        let sessionQuery;
        if (currentUser.role === 'student') {
            const today = getLocalToday();
            sessionQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', today), limit(200));
        } else {
            sessionQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', startOfMonth), where('date', '<=', endOfMonth));
        }

        const unsub = onSnapshot(sessionQuery, (s) => {
            const newDocs = {};
            s.docs.forEach(d => { newDocs[d.id] = { id: d.id, ...d.data() }; });
            setSessionMap(prev => ({ ...prev, ...newDocs }));
            setAppLoading(false);
        });
        return () => unsub();
    }, [currentUser, currentDate]);

    useEffect(() => {
        const sorted = Object.values(sessionMap).sort((a,b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            const timeA = a.startTime || '';
            const timeB = b.startTime || '';
            return dateA.localeCompare(dateB) || timeA.localeCompare(timeB);
        });
        setSessions(sorted);
    }, [sessionMap]);

    const notify = (msg, type = 'success') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
    };

    const askConfirm = (message, onConfirm) => setConfirmConfig({ message, onConfirm });

    const handleDateChange = (dStr) => setSelectedDateStr(dStr);

    const handleAction = async (action, payload) => {
      try {
        if (action === 'toggle_slot') {
            const s = payload;
            if (studentSelectedSlots.includes(s.id)) {
                setStudentSelectedSlots(p => p.filter(id => id !== s.id));
            } else {
                if (studentSelectedSlots.length > 0) {
                    const first = sessions.find(sess => sess.id === studentSelectedSlots[0]);
                    if (first && first.date !== s.date) return notify('같은 날짜의 클리닉만 동시 신청 가능합니다.', 'error');
                }
                setStudentSelectedSlots(p => [...p, s.id]);
            }
        } else if (action === 'add_request') {
            const h = parseInt(payload.time.split(':')[0]);
            if (h < 8 || h >= 22) return notify('운영 시간(08:00~22:00) 외 신청 불가', 'error');
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), {
                taId: currentUser.id, taName: currentUser.name, taSubject: currentUser.subject || '',
                date: selectedDateStr, startTime: payload.time, endTime: `${String(h+1).padStart(2,'0')}:00`, 
                status: 'addition_requested', source: 'system', classroom: ''
            });
            notify('근무 신청 완료');
        } else if (action === 'cancel_request') {
             setSelectedSession(payload); setRequestData({reason:'', type:'cancel'}); setModalState({ type: 'request_change' });
        } else if (action === 'delete') {
            askConfirm("정말 삭제하시겠습니까?", async () => await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload)));
        } else if (action === 'withdraw_cancel') {
            askConfirm("철회하시겠습니까?", async () => await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open', cancelReason: '' }));
        } else if (action === 'withdraw_add') {
            // [버그 수정] 페이로드가 ID 스트링이므로 그대로 사용
            askConfirm("철회하시겠습니까?", async () => await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload)));
        } else if (action === 'approve_booking') {
            if (!payload.classroom) return notify('강의실을 배정해주세요.', 'error');
            setSelectedSession(payload); setModalState({ type: 'preview_confirm' });
        } else if (action === 'cancel_booking_admin') { 
            askConfirm("이 신청을 취소하고 슬롯을 초기화하시겠습니까?", async () => {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open', studentName: '', studentPhone: '', topic: '', questionRange: '', source: 'system' });
                notify('예약 신청이 취소되었습니다.');
            });
        } else if (action === 'update_classroom') {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { classroom: payload.val });
        } else if (action === 'write_feedback') {
            setSelectedSession(payload); setFeedbackData({clinicContent:payload.clinicContent||'', feedback:payload.feedback||'', improvement:payload.improvement||''}); setModalState({ type: 'feedback' });
        } else if (action === 'admin_edit') {
            setSelectedSession(payload); setAdminEditData({ studentName: payload.studentName||'', topic: payload.topic||'', questionRange: payload.questionRange||'' }); setModalState({ type: 'admin_edit' });
        } else if (action === 'approve_schedule_change') { 
             if (payload.status === 'cancellation_requested') { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id)); notify('취소 요청 승인됨 (삭제 완료)'); } 
             else if (payload.status === 'addition_requested') { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open' }); notify('추가 요청 승인됨'); }
        } else if (action === 'send_feedback_msg') { 
             setSelectedSession(payload); setModalState({ type: 'message_preview_feedback' });
        }
      } catch (e) { notify('오류: ' + e.message, 'error'); }
  };

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
            if (h >= 22) break;
            const sT = `${String(h).padStart(2,'0')}:00`, eT = `${String(h+1).padStart(2,'0')}:00`;
            if (!sessions.some(s => s.taId === targetTa.id && s.date === dStr && s.startTime === sT)) {
              batch.set(doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions')), {
                taId: targetTa.id, taName: targetTa.name, taSubject: targetTa.subject || '', date: dStr, startTime: sT, endTime: eT, 
                status: 'open', source: 'system', studentName: '', topic: '', questionRange: '', classroom: ''
              });
              count++;
            }
          }
        }
      }
      await batch.commit(); notify(`${count}개의 스케줄 생성 완료`);
  };

  const submitStudentApplication = async () => {
      const formattedTopic = applicationItems.map(i => i.subject).join(', ');
      const formattedRange = applicationItems.map(i => `${i.workbook} (${i.range})`).join('\n');
      const batch = writeBatch(db);
      studentSelectedSlots.forEach(id => {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id);
        batch.update(ref, { status: 'pending', studentName: currentUser.name, studentPhone: currentUser.phone || '', topic: formattedTopic, questionRange: formattedRange, source: 'app' });
      });
      await batch.commit(); setModalState({type:null}); setStudentSelectedSlots([]); notify('신청 완료!');
  };

  const handleAdminEditSubmit = async () => {
    await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{studentName:adminEditData.studentName,topic:adminEditData.topic,questionRange:adminEditData.questionRange,status:adminEditData.studentName?'confirmed':'open'}); 
    setModalState({type:null}); notify('수정완료'); 
  };

  const pendingBookings = sessions.filter(s => s.status === 'pending');
  const scheduleRequests = sessions.filter(s => s.status === 'cancellation_requested' || s.status === 'addition_requested');
  const pendingFeedbacks = sessions.filter(s => s.feedbackStatus === 'submitted');
  const studentMyClinics = sessions.filter(s => s.studentName === currentUser.name && (s.status === 'confirmed' || s.status === 'pending')).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  if (appLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 w-full">
       <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 space-y-2 pointer-events-none">
          {notifications.map(n=><div key={n.id} className="backdrop-blur text-white px-4 py-3 rounded-lg shadow-xl bg-gray-900/90">{n.msg}</div>)}
       </div>
       
       {currentUser.role === 'admin' && (
           <div className="space-y-8 w-full">
              <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">관리자 대시보드</h2>
                  <div className="flex gap-2">
                      <Button variant="secondary" size="sm" icon={BarChart2} onClick={()=>setModalState({type:'stats'})}>통계</Button>
                      <Button variant="secondary" size="sm" icon={Settings} onClick={()=>setModalState({type:'user_manage'})}>사용자 관리</Button>
                  </div>
              </div>
              <Card className="border-purple-200 bg-purple-50/30 w-full">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><ClipboardList className="text-purple-600"/> 근무 변경 요청 {scheduleRequests.length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{scheduleRequests.length}</span>}</h2>
                  {scheduleRequests.length === 0 ? <p className="text-gray-500 text-center py-6 bg-white rounded-2xl border border-gray-100">처리할 요청이 없습니다.</p> : (
                    <div className="grid gap-3">{scheduleRequests.map(req => (
                      <div key={req.id} className="bg-white border p-4 rounded-xl flex justify-between items-center shadow-sm">
                        <div>
                            <div className="flex items-center gap-2 mb-1"><Badge status={req.status}/><span className="font-bold">{req.taName}</span><span className="text-sm text-gray-500">{req.date}</span></div>
                            <div className="text-sm text-gray-600">{req.startTime}~{req.endTime}{req.cancelReason && <span className="ml-2 text-red-600 font-medium"> (사유: {req.cancelReason})</span>}</div>
                        </div>
                        <Button variant="primary" size="sm" onClick={() => handleAction('approve_schedule_change', req)}>승인</Button>
                      </div>
                    ))}</div>
                  )}
              </Card>
              <Card className="bg-blue-50/50 border-blue-100 w-full">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold flex items-center gap-2 text-lg text-blue-900"><Clock size={20}/> 근무 일괄 생성</h3>
                      <select className="border rounded-lg p-2 text-sm bg-white" value={selectedTaIdForSchedule} onChange={e=>setSelectedTaIdForSchedule(e.target.value)}>
                          <option value="">조교 선택</option>{users.filter(u=>u.role==='ta').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                  </div>
                  <div className="flex gap-2 mb-4">
                      <input type="date" className="border rounded-lg p-2 flex-1 text-sm" value={batchDateRange.start} onChange={e=>setBatchDateRange({...batchDateRange, start:e.target.value})}/>
                      <span className="self-center">~</span>
                      <input type="date" className="border rounded-lg p-2 flex-1 text-sm" value={batchDateRange.end} onChange={e=>setBatchDateRange({...batchDateRange, end:e.target.value})}/>
                  </div>
                  <div className="grid grid-cols-7 gap-2 mb-4">
                      {DAYS.map(d=>(
                          <div key={d} className={`border rounded-lg p-2 text-center transition-all ${defaultSchedule[d].active ? 'bg-blue-100 border-blue-300' : 'bg-white'}`}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold">{d}</span>
                                <input type="checkbox" checked={defaultSchedule[d].active} onChange={()=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], active: !defaultSchedule[d].active}})}/>
                              </div>
                              <input type="time" className="w-full text-xs mb-1 border rounded" value={defaultSchedule[d].start} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], start:e.target.value}})} disabled={!defaultSchedule[d].active}/>
                              <input type="time" className="w-full text-xs border rounded" value={defaultSchedule[d].end} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], end:e.target.value}})} disabled={!defaultSchedule[d].active}/>
                          </div>
                      ))}
                  </div>
                  <Button onClick={handleSaveDefaultSchedule} className="w-full" size="sm">스케줄 생성 실행</Button>
              </Card>
              <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={(d)=>setSelectedDateStr(d)} onAction={handleAction} users={users}/>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                <Card>
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><CheckCircle className="text-green-600"/> 예약 승인 대기</h2>
                    {pendingBookings.length === 0 ? <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-400">대기 중인 예약 없음</div> :
                        <div className="space-y-3">{pendingBookings.map(s => (
                            <div key={s.id} className="border border-green-100 bg-green-50/30 p-4 rounded-xl flex justify-between items-center">
                                <div className="flex-1">
                                    <div className="font-bold text-gray-900">{s.studentName} <span className="font-normal text-sm text-gray-500">({s.studentPhone})</span></div>
                                    <div className="text-sm text-gray-500">{s.date} {s.startTime} ({s.taName})</div>
                                    <div className="text-sm text-gray-600 mt-2 p-2 bg-white rounded border border-green-100">
                                        <div className="font-bold text-xs text-green-700 mb-0.5">신청 상세</div>
                                        <div className="whitespace-pre-wrap">{s.topic} / {s.questionRange}</div>
                                    </div>
                                </div>
                                <div className="ml-2 flex flex-col gap-2">
                                    <Button size="sm" onClick={()=>handleAction('approve_booking', s)}>승인</Button>
                                    <Button size="sm" variant="danger" icon={RefreshCw} onClick={()=>handleAction('cancel_booking_admin', s)}>취소</Button>
                                </div>
                            </div>
                        ))}</div>
                    }
                </Card>
                <Card>
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><MessageSquare className="text-blue-600"/> 피드백 발송 대기</h2>
                    {pendingFeedbacks.length === 0 ? <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-400">발송할 피드백 없음</div> :
                        <div className="space-y-3">{pendingFeedbacks.map(s => (
                            <div key={s.id} className="border border-gray-200 p-4 rounded-xl flex justify-between items-center hover:bg-gray-50">
                                <div className="overflow-hidden mr-2">
                                    <div className="font-bold text-gray-900 truncate">{s.studentName} 피드백</div>
                                    <div className="text-sm text-gray-500 truncate">{s.feedback}</div>
                                    <div className="text-xs text-gray-400">작성자: {s.taName}</div>
                                </div>
                                <Button variant="secondary" size="sm" icon={Send} onClick={()=>handleAction('send_feedback_msg', s)}>전송</Button>
                            </div>
                        ))}</div>
                    }
                </Card>
              </div>
           </div>
       )}
       {currentUser.role === 'ta' && (
            <>
                <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-none w-full">
                    <div className="flex justify-between items-end">
                        <div><h2 className="text-2xl font-bold mb-1">안녕하세요, {currentUser.name}님</h2><p className="text-white/80">오늘도 학생들의 성장을 위해 힘써주세요!</p></div>
                        <div className="text-right"><div className="text-4xl font-black">{sessions.filter(s => s.taId === currentUser.id && s.date.startsWith(formatDate(currentDate).substring(0,7))).length}</div><div className="text-sm opacity-80">이달의 근무</div></div>
                    </div>
                </Card>
                <CalendarView isInteractive={true} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={(d)=>setSelectedDateStr(d)} onAction={handleAction}/>
            </>
        )}
       {currentUser.role === 'lecturer' && (
           <div className="space-y-8 w-full">
              <div className="bg-white border-b pb-4 mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Eye className="text-blue-600" /> 전체 조교 통합 스케줄 (열람 전용)</h2>
              </div>
              <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={(d)=>setSelectedDateStr(d)} onAction={()=>{}} users={users}/>
           </div>
       )}
       {currentUser.role === 'student' && (
            <div className="flex flex-col gap-6 w-full">
                <Card className="bg-blue-50 border-blue-100 w-full">
                    <h2 className="text-lg font-bold mb-4 text-blue-800 flex items-center gap-2"><CheckCircle size={20}/> 나의 예약 현황</h2>
                    {studentMyClinics.length === 0 ? <div className="text-center py-8 text-gray-400">예약 내역이 없습니다.</div> : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                            {studentMyClinics.map(s => (
                                <div key={s.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex justify-between mb-2">
                                        <span className="font-bold text-gray-800 text-lg">{s.date}</span>
                                        <Badge status={s.status}/>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700 mb-2">
                                        <Clock size={16} className="text-blue-500"/>
                                        <span className="font-medium">{s.startTime} ~ {s.endTime}</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-sm">{s.taName} TA</span>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 border border-gray-100">
                                        <div className="flex gap-2 mb-1"><span className="font-bold text-gray-500 w-8 shrink-0">과목</span> <span>{s.topic}</span></div>
                                        <div className="flex gap-2"><span className="font-bold text-gray-500 w-8 shrink-0">범위</span> <span className="whitespace-pre-wrap">{s.questionRange}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
                <Card className="w-full">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">클리닉 신청</h2>
                    </div>
                    {/* [Fix] Change sortedSessions to sessions */}
                    <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={(d)=>setSelectedDateStr(d)} onAction={handleAction} selectedSlots={studentSelectedSlots} users={users}/>
                </Card>
                {studentSelectedSlots.length > 0 && (
                    <div className="fixed bottom-6 left-0 right-0 p-4 z-50 flex justify-center animate-in slide-in-from-bottom-4">
                        <Button 
                            className="w-full max-w-md shadow-2xl bg-blue-600 hover:bg-blue-700 text-white border-none py-4 text-xl rounded-2xl flex items-center justify-center gap-3"
                            onClick={()=>setModalState({type:'student_apply'})}
                        >
                            <span className="bg-white/20 px-3 py-1 rounded-lg text-base font-bold">{studentSelectedSlots.length}건</span>
                            <span className="font-bold">예약 진행하기</span>
                            <ArrowRight size={24} />
                        </Button>
                    </div>
                )}
            </div>
        )}

      {/* --- Modals --- */}
      {confirmConfig && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl scale-100 animate-in zoom-in-95">
                <h3 className="text-lg font-bold text-gray-900 mb-2">확인</h3><p className="text-gray-600 mb-6">{confirmConfig.message}</p>
                <div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => setConfirmConfig(null)}>취소</Button><Button className="flex-1" onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }}>확인</Button></div>
            </div>
        </div>
      )}
      <Modal isOpen={modalState.type==='request_change'} onClose={()=>setModalState({type:null})} title="근무 취소"><textarea className="w-full border-2 rounded-xl p-4 h-32 mb-4 text-lg" placeholder="취소 사유" value={requestData.reason} onChange={e=>setRequestData({...requestData, reason:e.target.value})}/><Button onClick={async()=>{ if(!requestData.reason) return notify('사유입력','error'); await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{status:'cancellation_requested', cancelReason:requestData.reason}); setModalState({type:null}); notify('요청완료'); }} className="w-full py-4 text-lg">요청 전송</Button></Modal>
      <Modal isOpen={modalState.type==='student_apply'} onClose={()=>setModalState({type:null})} title="예약 신청">{applicationItems.map((item,i)=>(<div key={i} className="border-2 rounded-xl p-5 mb-3 bg-gray-50"><div className="mb-3"><label className="block text-sm font-bold text-gray-600 mb-1">과목</label><input placeholder="예시 : 미적분1" className="w-full border-2 rounded-lg p-3 text-lg" value={item.subject} onChange={e=>{const n=[...applicationItems];n[i].subject=e.target.value;setApplicationItems(n)}}/></div><div className="flex gap-3"><div className="flex-1"><label className="block text-sm font-bold text-gray-600 mb-1">교재</label><input placeholder="예시 : 개념원리" className="w-full border-2 rounded-lg p-3 text-lg" value={item.workbook} onChange={e=>{const n=[...applicationItems];n[i].workbook=e.target.value;setApplicationItems(n)}}/></div><div className="flex-1"><label className="block text-sm font-bold text-gray-600 mb-1">범위</label><input placeholder="p.23-25 #61..." className="w-full border-2 rounded-lg p-3 text-lg" value={item.range} onChange={e=>{const n=[...applicationItems];n[i].range=e.target.value;setApplicationItems(n)}}/></div></div></div>))}<Button variant="secondary" className="w-full mb-3 py-3" onClick={()=>setApplicationItems([...applicationItems,{subject:'',workbook:'',range:''}])}><Plus size={20}/> 과목 추가</Button><Button className="w-full py-4 text-xl" onClick={submitStudentApplication}>신청 완료</Button></Modal>
      <Modal isOpen={modalState.type==='feedback'} onClose={()=>setModalState({type:null})} title="피드백"><textarea className="w-full border-2 rounded-xl p-4 mb-3 h-24 text-lg" placeholder="진행 내용" value={feedbackData.clinicContent} onChange={e=>setFeedbackData({...feedbackData, clinicContent:e.target.value})}/><textarea className="w-full border-2 rounded-xl p-4 mb-3 h-24 text-lg" placeholder="문제점" value={feedbackData.feedback} onChange={e=>setFeedbackData({...feedbackData, feedback:e.target.value})}/><textarea className="w-full border-2 rounded-xl p-4 mb-3 h-24 text-lg" placeholder="개선 방향" value={feedbackData.improvement} onChange={e=>setFeedbackData({...feedbackData, improvement:e.target.value})}/><Button className="w-full py-4 text-lg" onClick={async()=>{ await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{...feedbackData,status:'completed',feedbackStatus:'submitted'}); setModalState({type:null}); notify('저장완료'); }}>저장 완료</Button></Modal>
      <Modal isOpen={modalState.type==='user_manage'} onClose={()=>setModalState({type:null})} title="사용자 관리"><div className="flex border-b mb-4">{['ta','student','lecturer'].map(t=><button key={t} className={`flex-1 py-3 font-bold text-lg capitalize ${manageTab===t?'text-blue-600 border-b-4 border-blue-600':'text-gray-400'}`} onClick={()=>setManageTab(t)}>{t}</button>)}</div><div className="mb-4 relative"><input placeholder="이름/ID 검색" className="w-full border rounded-lg p-3 pl-10" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/></div><div className="flex flex-col gap-3 mb-4 bg-gray-50 p-4 rounded-xl"><div className="flex justify-between mb-2"><span className="font-bold">{newUser.isEdit?'수정':'추가'}</span>{newUser.isEdit&&<button onClick={()=>setNewUser({name:'',userId:'',password:'',phone:'',subject:'',isEdit:false})} className="text-xs text-gray-500 underline">취소</button>}</div><input placeholder="이름" className="border rounded-lg p-2" value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})}/><input placeholder="ID" className="border rounded-lg p-2" value={newUser.userId} onChange={e=>setNewUser({...newUser,userId:e.target.value})} disabled={newUser.isEdit}/><input placeholder="PW" className="border rounded-lg p-2" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})}/>{manageTab==='ta'&&<input placeholder="담당 과목" className="border rounded-lg p-2" value={newUser.subject||''} onChange={e=>setNewUser({...newUser,subject:e.target.value})}/>}<Button size="sm" onClick={async()=>{ try { if(newUser.isEdit){ await updateDoc(doc(db,'artifacts',APP_ID,'public','data','users',newUser.id),{name:newUser.name,password:newUser.password,subject:newUser.subject}); notify('수정완료'); } else { await addDoc(collection(db,'artifacts',APP_ID,'public','data','users'),{...newUser,role:manageTab}); notify('추가완료'); } setNewUser({name:'',userId:'',password:'',phone:'',subject:'',isEdit:false}); } catch(e){ notify('권한오류','error'); } }}>{newUser.isEdit?'수정':'추가'}</Button></div><div className="max-h-[300px] overflow-auto divide-y">{users.filter(u=>u.role===manageTab&&(u.name.includes(searchQuery)||u.userId.includes(searchQuery))).map(u=>(<div key={u.id} className="flex justify-between p-3 items-center"><div><span className="font-bold">{u.name}</span> <span className="text-gray-400 text-sm">({u.userId})</span>{u.subject&&<span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{u.subject}</span>}</div><div className="flex gap-2"><button onClick={()=>{setNewUser({...u,isEdit:true});}} className="text-gray-400 hover:text-blue-600"><Edit2 size={18}/></button><button onClick={()=>askConfirm("삭제하시겠습니까?",async()=>await deleteDoc(doc(db,'artifacts',APP_ID,'public','data','users',u.id)))} className="text-red-400 hover:text-red-600"><Trash2 size={18}/></button></div></div>))}</div></Modal>
      <Modal isOpen={modalState.type==='preview_confirm'} onClose={()=>setModalState({type:null})} title="문자 발송"><div className="bg-gray-50 p-5 rounded-xl mb-4 whitespace-pre-wrap text-base leading-relaxed">{selectedSession&&TEMPLATES.confirmParent(selectedSession)}</div><Button className="w-full py-4 text-lg" onClick={async ()=>{ await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{status:'confirmed'}); setModalState({type:null}); notify('확정 완료'); }}>전송 및 확정</Button></Modal>
      <Modal isOpen={modalState.type==='message_preview_feedback'} onClose={()=>setModalState({type:null})} title="피드백 발송"><div className="bg-green-50 p-5 rounded-xl text-base border border-green-200 whitespace-pre-wrap relative cursor-pointer leading-relaxed">{selectedSession&&TEMPLATES.feedbackParent(selectedSession)}</div><Button className="w-full mt-4 py-4 text-lg" onClick={async ()=>{ await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{feedbackStatus:'sent'}); setModalState({type:null}); notify('발송 완료'); }}>전송 완료 처리</Button></Modal>
      <Modal isOpen={modalState.type==='admin_edit'} onClose={()=>setModalState({type:null})} title="예약/클리닉 수정"><div className="space-y-4"><div><label className="block text-sm font-bold text-gray-600 mb-1">학생 이름 (직접 입력 시 예약됨)</label><input className="w-full border-2 rounded-lg p-3 text-lg" value={adminEditData.studentName} onChange={e=>setAdminEditData({...adminEditData, studentName:e.target.value})} placeholder="학생 이름"/></div><div><label className="block text-sm font-bold text-gray-600 mb-1">과목</label><input className="w-full border-2 rounded-lg p-3 text-lg" value={adminEditData.topic} onChange={e=>setAdminEditData({...adminEditData, topic:e.target.value})} placeholder="과목"/></div><div><label className="block text-sm font-bold text-gray-600 mb-1">교재 및 범위</label><input className="w-full border-2 rounded-lg p-3 text-lg" value={adminEditData.questionRange} onChange={e=>setAdminEditData({...adminEditData, questionRange:e.target.value})} placeholder="범위"/></div><Button className="w-full py-4 text-lg" onClick={handleAdminEditSubmit}>저장하기</Button></div></Modal>
      <Modal isOpen={modalState.type==='admin_stats'} onClose={()=>setModalState({type:null})} title="근무 통계"><div className="space-y-6"><div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl"><span className="font-bold text-gray-700 text-lg">{currentDate.getFullYear()}년 {currentDate.getMonth()+1}월 근무 현황</span><div className="text-sm text-gray-500">확정(수행) / 전체(오픈)</div></div><div className="overflow-x-auto"><table className="w-full text-base text-left border-collapse"><thead><tr className="bg-gray-100 border-b"><th className="p-3">조교명</th>{[1,2,3,4,5].map(w=><th key={w} className="p-3 text-center">{w}주</th>)}<th className="p-3 text-center font-bold">합계</th></tr></thead><tbody>{users.filter(u=>u.role==='ta').map(ta=>{let tConf=0,tSched=0;return(<tr key={ta.id} className="border-b"><td className="p-3 font-medium">{ta.name}</td>{[1,2,3,4,5].map(w=>{const weekSessions=sessions.filter(s=>{const [sy,sm,sd]=s.date.split('-').map(Number);const sDate=new Date(sy,sm-1,sd);return s.taId===ta.id&&sy===currentDate.getFullYear()&&(sm-1)===currentDate.getMonth()&&getWeekOfMonth(sDate)===w});const conf=weekSessions.filter(s=>s.status==='confirmed'||s.status==='completed').length;const sched=weekSessions.filter(s=>s.status==='open'||s.status==='confirmed'||s.status==='completed').length;tConf+=conf;tSched+=sched;return<td key={w} className="p-3 text-center text-sm">{sched>0?<span className={conf>0?'text-blue-600 font-bold':'text-gray-400'}>{conf}/{sched}</span>:'-'}</td>})}<td className="p-3 text-center font-bold bg-blue-50 text-blue-800">{tConf}/{tSched}</td></tr>)})}</tbody></table></div></div></Modal>
    </div>
  );
};

export default ClinicDashboard;