import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon, Clock, CheckCircle, MessageSquare, AlertCircle, LogOut, Plus, X, Trash2, Settings, Edit2, Save, XCircle, PlusCircle, ClipboardList, Users, CheckSquare, BarChart2, AlertTriangle, Undo2, Eye, EyeOff, ChevronLeft, ChevronRight, Loader, PenTool, List, Bell, Send, Check, RefreshCw
} from 'lucide-react';

// --- Firebase Libraries ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, writeBatch, query, where, getDocs, limit, enableIndexedDbPersistence 
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyBN0Zy0-GOqN0sB0bTouDohZp7B2zfFjWc",
  authDomain: "imperial-system-1221c.firebaseapp.com",
  projectId: "imperial-system-1221c",
  storageBucket: "imperial-system-1221c.firebasestorage.app",
  messagingSenderId: "414889692060",
  appId: "1:414889692060:web:9b6b89d0d918a74f8c1659"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// [Optimization] Offline Persistence
try { enableIndexedDbPersistence(db).catch(() => {}); } catch(e) {}

// --- Constants ---
const APP_ID = 'imperial-clinic-v1';
const CLASSROOMS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const SEED_USERS = [
  { role: 'admin', userId: 'imperialsys01', password: '1', name: '행정직원' }, 
  { role: 'ta', userId: 'ta_kim', password: '1', name: '김민성' },
  { role: 'ta', userId: 'ta_oh', password: '1', name: '오혜원' },
  { role: 'ta', userId: 'ta_lee', password: '1', name: '이채연' },
  { role: 'lecturer', userId: 'lec_kim', password: '1', name: '김강사' },
  { role: 'student', userId: 'lee12', password: '1', name: '이원준', phone: '010-1234-5678' },
];

const TEMPLATES = {
  confirmStudent: (d) => `[클리닉 안내]\n일시 : ${d.date} ${d.startTime}~${d.endTime}\n장소 : 목동임페리얼학원 본관 ${d.classroom}`,
  confirmParent: (d) => `[목동임페리얼학원]\n${d.studentName}학생의 클리닉 예정을 안내드립니다.\n\n[클리닉 예정 안내]\n일시 : ${d.date} ${d.startTime}~${d.endTime}\n장소 : 목동임페리얼학원 본관 ${d.classroom}\n내용 : [${d.topic}] 개별 Q&A 클리닉\n\n학생이 직접 시간을 선정하였으며 해당 시간은 선생님과의 개인적인 약속이므로 늦지 않도록 지도해주시면 감사하겠습니다.`,
  feedbackParent: (d) => `[목동임페리얼학원]\n${d.studentName}학생의 클리닉 피드백입니다.\n\n클리닉 진행 조교 : ${d.taName}\n클리닉 진행 내용 : ${d.clinicContent}\n개별 문제점 : ${d.feedback}\n개선 방향 : ${d.improvement || '꾸준한 연습이 필요함'}\n\n감사합니다.`,
};

// --- Utils ---
const getLocalToday = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

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

const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const generateTimeSlots = () => Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);

// --- UI Components ---
const Button = React.memo(({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon, size = 'md' }) => {
  const sizes = { 
    sm: 'px-4 py-3 text-base md:text-sm md:px-3 md:py-2', 
    md: 'px-6 py-4 text-lg md:text-base md:px-5 md:py-3', 
    lg: 'px-8 py-5 text-xl md:text-lg md:px-8 md:py-4' 
  };
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-md active:scale-95 active:bg-blue-800',
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:scale-95',
    success: 'bg-green-600 text-white hover:bg-green-700 shadow-md active:scale-95',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 active:scale-95',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200',
    outline: 'border-2 border-blue-600 text-blue-600 bg-white hover:bg-blue-50 active:scale-95', 
    selected: 'bg-blue-600 text-white border-2 border-blue-600 shadow-inner'
  };
  return (
    <button onClick={onClick} className={`rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`} disabled={disabled}>
      {Icon && <Icon size={size === 'sm' ? 18 : 22} />} {children}
    </button>
  );
});

const Card = ({ children, className = '' }) => <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 ${className}`}>{children}</div>;

const Badge = React.memo(({ status }) => {
  const styles = { 
    open: 'bg-blue-50 text-blue-700 border border-blue-100', 
    pending: 'bg-yellow-50 text-yellow-700 border border-yellow-100', 
    confirmed: 'bg-green-50 text-green-700 border border-green-100', 
    completed: 'bg-gray-50 text-gray-600 border border-gray-200', 
    cancellation_requested: 'bg-red-50 text-red-700 border border-red-100', 
    addition_requested: 'bg-purple-50 text-purple-700 border border-purple-100' 
  };
  const labels = { open: '예약 가능', pending: '승인 대기', confirmed: '예약 확정', completed: '클리닉 완료', cancellation_requested: '취소 요청', addition_requested: '추가 신청' };
  return <span className={`px-2.5 py-1 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap ${styles[status] || styles.completed}`}>{labels[status] || status}</span>;
});

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col scale-100 animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} className="text-gray-400" /></button>
        </div>
        <div className="p-5 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};

// --- Login View ---
const LoginView = ({ form, setForm, onLogin, isLoading, loginErrorModal, setLoginErrorModal }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 md:p-10 border border-gray-100">
        <div className="text-center mb-8">
          <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200"><CheckCircle size={32}/></div>
          <h1 className="text-2xl font-bold text-gray-900">Imperial System</h1>
          <p className="text-gray-500 mt-2 text-base">학생과 학부모를 위한 프리미엄 관리</p>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">아이디</label>
            <input type="text" placeholder="ID를 입력하세요" className="w-full border border-gray-200 rounded-xl p-4 text-lg bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-all" value={form.id} onChange={e=>setForm({...form, id:e.target.value})}/>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">비밀번호</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="비밀번호를 입력하세요" 
                className="w-full border border-gray-200 rounded-xl p-4 text-lg bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-all pr-12" 
                value={form.password} 
                onChange={e=>setForm({...form, password:e.target.value})} 
                onKeyDown={e=>e.key==='Enter'&&onLogin()}
              />
              <button 
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
          </div>
          <Button onClick={onLogin} className="w-full py-4 text-lg shadow-lg shadow-blue-200 mt-2" disabled={isLoading}>
            {isLoading ? <Loader className="animate-spin" /> : '로그인'}
          </Button>
        </div>
      </div>

      {/* 로그인 실패 모달 */}
      <Modal isOpen={loginErrorModal.isOpen} onClose={() => setLoginErrorModal({ isOpen: false, msg: '' })} title="로그인 실패">
        <div className="flex flex-col items-center text-center space-y-4 pt-2">
          <div className="bg-red-50 p-4 rounded-full text-red-500 mb-2">
            <AlertCircle size={48} />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{loginErrorModal.msg}</h3>
          <div className="w-full bg-gray-50 rounded-xl p-5 mt-4 text-left border border-gray-100">
            <p className="text-sm text-gray-600 leading-relaxed mb-2 font-medium">
              아이디 또는 비밀번호가 기억나지 않으시나요?
            </p>
            <p className="text-sm text-gray-500 leading-relaxed">
              아래 관리자에게 문의해 주세요.<br/>
              신속하게 처리를 도와드리겠습니다.
            </p>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-blue-600 text-sm">시스템 관리자</span>
                <span className="text-gray-800 font-medium">김준혁</span>
              </div>
              <div className="text-lg font-bold text-gray-900">010-9510-2265</div>
            </div>
          </div>
          <Button className="w-full mt-4" onClick={() => setLoginErrorModal({ isOpen: false, msg: '' })}>확인</Button>
        </div>
      </Modal>
    </div>
  );
};

// --- Calendar View ---
const CalendarView = React.memo(({ isInteractive, sessions, currentUser, currentDate, setCurrentDate, selectedDateStr, onDateChange, onAction, selectedSlots = [] }) => {
  const mySessions = useMemo(() => {
     if (currentUser.role === 'ta') {
        return sessions.filter(s => s.taId === currentUser.id && s.date === selectedDateStr);
     }
     return sessions.filter(s => s.date === selectedDateStr);
  }, [sessions, currentUser, selectedDateStr]);

  const isAdmin = currentUser.role === 'admin';
  const isStudent = currentUser.role === 'student';
  const isLecturer = currentUser.role === 'lecturer';
  const isTa = currentUser.role === 'ta';
  const now = new Date();

  // [Helper] Check if student already booked/selected this time slot
  const isTimeSlotBlockedForStudent = (time) => {
    if (!isStudent) return false;
    
    // 1. 이미 다른 조교에게 예약된 시간인지 확인 (Confirmed or Pending)
    const alreadyBooked = sessions.some(s => 
        s.studentName === currentUser.name && 
        s.date === selectedDateStr && 
        s.startTime === time && 
        (s.status === 'confirmed' || s.status === 'pending')
    );
    if (alreadyBooked) return true;

    // 2. 현재 선택 목록에 같은 시간대가 있는지 확인 (다른 조교)
    // 선택된 슬롯들의 ID를 기반으로 세션 정보를 찾아서 시간 비교
    const selectedSessionTimes = selectedSlots.map(id => sessions.find(s => s.id === id)?.startTime);
    if (selectedSessionTimes.includes(time)) return true;

    return false;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar Area */}
      <Card className="lg:col-span-1 min-h-[420px] p-4 md:p-6">
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
            if (isStudent) {
                 if (dStr >= getLocalToday()) {
                    hasEvent = sessions.some(s => s.date === dStr && s.status === 'open');
                 }
            } else if (isTa) {
                 hasEvent = sessions.some(s => s.date === dStr && s.taId === currentUser.id);
            } else {
                 hasEvent = sessions.some(s => s.date === dStr);
            }

            return (
              <button key={i} onClick={()=>onDateChange(dStr)} className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 ${isSel?'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-200': isToday ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-gray-100 text-gray-700'} ${hasEvent && !isSel ? 'ring-1 ring-blue-100' : ''}`}>
                <span className={`text-base md:text-sm ${isSel?'font-bold':''}`}>{d.getDate()}</span>
                {hasEvent && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSel?'bg-white':'bg-blue-400'}`}/>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Schedule List Area */}
      <Card className="lg:col-span-2 flex flex-col h-[600px] lg:h-auto p-0 md:p-6 overflow-hidden">
        <div className="p-5 md:p-0 border-b md:border-none bg-white sticky top-0 z-10">
           <h3 className="font-bold text-xl flex items-center gap-2">
            <span className="text-blue-600">{selectedDateStr.split('-')[2]}일</span> 상세 스케줄
           </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-0 custom-scrollbar space-y-3">
          {generateTimeSlots().map((t, i) => {
            const slots = mySessions.filter(s => s.startTime === t);
            
            if (isStudent) {
                const availableSlots = slots.filter(s => s.status === 'open' && new Date(`${s.date}T${s.startTime}`) >= now);
                if (availableSlots.length === 0) return null;
            }

            if (isLecturer && slots.length === 0) return null;

            if(slots.length === 0) {
                 return isInteractive ? (
                    <div key={i} className="flex gap-4 items-center group min-h-[80px]">
                        <div className="w-14 text-right text-base font-bold text-gray-400 font-mono">{t}</div>
                        <div className="flex-1 border-2 border-dashed border-gray-200 rounded-xl p-3 flex justify-between items-center hover:bg-gray-50 transition-colors">
                            <span className="text-sm text-gray-400">등록된 근무 없음</span>
                            {((isTa || isAdmin) && new Date(`${selectedDateStr}T${t}`) >= now) && <Button size="sm" variant="ghost" className="text-blue-600 bg-blue-50 hover:bg-blue-100" icon={PlusCircle} onClick={()=>onAction('add_request', {time: t})}>근무 신청</Button>}
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
              <div key={i} className="flex gap-3 md:gap-4 items-start">
                <div className="w-14 pt-4 text-right text-base font-bold text-gray-600 font-mono">{t}</div>
                <div className="flex-1 space-y-3">
                  {slots.map(s => {
                    const isConfirmed = s.status === 'confirmed';
                    const isSelected = selectedSlots.includes(s.id);
                    
                    // [Check] 동시간대 중복 신청 방지 로직
                    // 현재 슬롯이 선택되지 않았는데, 같은 시간대에 이미 선택/예약된 것이 있다면 비활성화
                    const isBlocked = isStudent && !isSelected && isTimeSlotBlockedForStudent(s.startTime);

                    // Student View: Inline Button
                    if (isStudent) {
                        if (s.status !== 'open') return null;
                        if (new Date(`${s.date}T${s.startTime}`) < now) return null;
                        
                        return (
                             <div key={s.id} onClick={()=> !isBlocked && onAction('toggle_slot', s)} className={`border-2 rounded-2xl p-4 flex justify-between items-center transition-all active:scale-[0.98] cursor-pointer ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : isBlocked ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' : 'bg-white border-gray-200 hover:shadow-md'}`}>
                                <div>
                                    <div className={`font-bold text-lg ${isBlocked ? 'text-gray-400' : 'text-gray-800'}`}>{s.startTime} ~ {s.endTime}</div>
                                    <div className={`text-sm mt-0.5 ${isBlocked ? 'text-gray-400' : 'text-gray-500'}`}>{s.taName} 선생님</div>
                                </div>
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
                        );
                    }

                    // Admin & TA & Lecturer View
                    return (
                      <div key={s.id} className={`border rounded-2xl p-4 flex flex-col justify-center shadow-sm transition-all ${isConfirmed ? 'bg-green-50/50 border-green-200' : s.status==='cancellation_requested' ? 'bg-red-50 border-red-200' : s.status==='addition_requested' ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex justify-between items-start w-full">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="font-bold text-lg text-gray-900">{s.studentName || s.taName}</span>
                                <Badge status={s.status}/>
                            </div>
                            <div className="text-sm text-gray-600 font-medium">{s.topic || (isAdmin ? `${s.taName} 근무` : '예약 대기 중')}</div>
                            
                            {(isAdmin || isLecturer) && s.studentName && (
                              <div className="text-sm text-gray-600 mt-2 p-2.5 bg-gray-50/80 rounded-xl border border-gray-100">
                                {s.topic && <div className="flex gap-1 mb-1"><span className="font-bold text-gray-500 w-10 shrink-0">과목</span><span>{s.topic}</span></div>}
                                {s.questionRange && <div className="flex gap-1"><span className="font-bold text-gray-500 w-10 shrink-0">범위</span><span className="whitespace-pre-wrap">{s.questionRange}</span></div>}
                              </div>
                            )}

                            {isAdmin && (
                              <div className="mt-3 flex flex-wrap gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                <span className="text-xs font-bold text-gray-500 mr-2">담당: {s.taName}</span>
                                <select 
                                    className={`text-sm border rounded-md p-1.5 focus:ring-2 focus:ring-blue-200 outline-none bg-white ${!s.classroom ? 'border-red-300 text-red-700' : 'border-gray-200'}`} 
                                    value={s.classroom || ''} 
                                    onChange={(e) => onAction('update_classroom', { id: s.id, val: e.target.value })}
                                >
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

// --- Main App ---
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessionMap, setSessionMap] = useState({});
  const [appLoading, setAppLoading] = useState(true);
  const [loginProcessing, setLoginProcessing] = useState(false);
  const [loginErrorModal, setLoginErrorModal] = useState({ isOpen: false, msg: '' });
  const [notifications, setNotifications] = useState([]);
  const [modalState, setModalState] = useState({ type: null, data: null });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(getLocalToday());
  
  const [studentSelectedSlots, setStudentSelectedSlots] = useState([]); 
  const [applicationItems, setApplicationItems] = useState([{ subject: '', workbook: '', range: '' }]); 
  const [defaultSchedule, setDefaultSchedule] = useState({ 월: { start: '14:00', end: '22:00', active: false }, 화: { start: '14:00', end: '22:00', active: false }, 수: { start: '14:00', end: '22:00', active: false }, 목: { start: '14:00', end: '22:00', active: false }, 금: { start: '14:00', end: '22:00', active: false }, 토: { start: '10:00', end: '18:00', active: false }, 일: { start: '10:00', end: '18:00', active: false } }); 
  const [batchDateRange, setBatchDateRange] = useState({ start: '', end: '' }); 
  const [selectedTaIdForSchedule, setSelectedTaIdForSchedule] = useState(''); 
  const [manageTab, setManageTab] = useState('ta'); 
  const [newUser, setNewUser] = useState({ name: '', userId: '', password: '', phone: '' }); 
  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [inputData, setInputData] = useState({});
  const [confirmConfig, setConfirmConfig] = useState(null);

  const sessions = useMemo(() => Object.values(sessionMap), [sessionMap]);
  const sortedSessions = useMemo(() => sessions.sort((a,b) => a.startTime.localeCompare(b.startTime)), [sessions]);

  // Auth Init
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) { console.error("Auth Error", e); }
    };
    initAuth();
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  // Data Sync
  useEffect(() => {
    if (!authUser || !currentUser) return;
    
    // 1. Users Cache
    if (currentUser.role === 'admin') {
       const cachedUsers = localStorage.getItem('cached_users');
       if (cachedUsers) setUsers(JSON.parse(cachedUsers));

       const unsubUsers = onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), (s) => {
        const u = s.docs.map(d => ({ id: d.id, ...d.data() }));
        if (JSON.stringify(u) !== cachedUsers) {
            setUsers(u);
            localStorage.setItem('cached_users', JSON.stringify(u));
        }
      });
      return () => unsubUsers();
    }
  }, [authUser, currentUser]);

  useEffect(() => {
    if (!authUser || !currentUser) return;

    // 2. Sessions Sync
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const startOfMonth = `${year}-${String(month).padStart(2,'0')}-01`;
    const endOfMonth = `${year}-${String(month).padStart(2,'0')}-31`;

    let sessionQuery;
    if (currentUser.role === 'student') {
        const today = getLocalToday();
        sessionQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', today));
    } else {
        sessionQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', startOfMonth), where('date', '<=', endOfMonth));
    }

    const unsubCalendar = onSnapshot(sessionQuery, (s) => {
      const newDocs = {};
      s.docs.forEach(d => { newDocs[d.id] = { id: d.id, ...d.data() }; });
      setSessionMap(prev => {
          const filteredPrev = Object.fromEntries(Object.entries(prev).filter(([k,v]) => {
              if (currentUser.role === 'student') return v.date >= getLocalToday(); 
              return v.date < startOfMonth || v.date > endOfMonth;
          }));
          return { ...filteredPrev, ...newDocs };
      });
      setAppLoading(false);
    });

    return () => unsubCalendar();
  }, [authUser, currentUser, currentDate]);

  const notify = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  }, []);

  const askConfirm = (message, onConfirm) => setConfirmConfig({ message, onConfirm });

  const handleDateChange = (newDate) => {
    setSelectedDateStr(newDate);
    if (currentUser && currentUser.role === 'student') {
        setStudentSelectedSlots([]);
    }
  };

  const handleLogin = async () => {
    setLoginProcessing(true);
    try {
        const usersRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users');
        const q = query(usersRef, where('userId', '==', loginForm.id), where('password', '==', loginForm.password));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            setCurrentUser(user);
            notify(`${user.name}님 환영합니다!`);
        } else {
            if (snapshot.empty) {
                const allUsersQ = query(usersRef, limit(1));
                const allUsersSnap = await getDocs(allUsersQ);
                if (allUsersSnap.empty) {
                    const batch = writeBatch(db);
                    SEED_USERS.forEach(ud => batch.set(doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users')), ud));
                    await batch.commit();
                    notify('초기 계정 생성됨. 다시 로그인하세요.', 'success');
                    setLoginProcessing(false);
                    return;
                }
            }
            setLoginErrorModal({ isOpen: true, msg: '아이디 또는 비밀번호가 일치하지 않습니다.' });
        }
    } catch (e) { notify('로그인 오류', 'error'); } finally { setLoginProcessing(false); }
  };

  const handleSaveDefaultSchedule = async () => {
    if (!selectedTaIdForSchedule || !batchDateRange.start || !batchDateRange.end) return notify('조교와 날짜 범위를 선택하세요', 'error');
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
          const isDuplicate = sessions.some(s => s.taId === targetTa.id && s.date === dStr && s.startTime === sT);
          if (!isDuplicate) {
              const newRef = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'));
              batch.set(newRef, {
                taId: targetTa.id, taName: targetTa.name, date: dStr, startTime: sT, endTime: eT, 
                status: 'open', source: 'system', studentName: '', topic: '', questionRange: '', classroom: ''
              });
              count++;
          }
        }
      }
    }
    await batch.commit();
    notify(`${count}개의 스케줄 생성 완료`);
  };

  const submitStudentApplication = async () => {
    if (studentSelectedSlots.length === 0) return notify('선택된 시간이 없습니다.', 'error');
    const formattedTopic = applicationItems.map(i => i.subject).join(', ');
    const formattedRange = applicationItems.map(i => `${i.workbook} (${i.range})`).join('\n');
    const batch = writeBatch(db);
    
    studentSelectedSlots.forEach(id => {
      const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id);
      batch.update(ref, { 
          status: 'pending', studentName: currentUser.name, studentPhone: currentUser.phone || '', 
          topic: formattedTopic, questionRange: formattedRange, source: 'app' 
      });
    });
    
    await batch.commit();
    setModalState({type:null}); setStudentSelectedSlots([]); setApplicationItems([{ subject: '', workbook: '', range: '' }]);
    notify('신청이 완료되었습니다!');
  };

  const handleAction = useCallback(async (action, payload) => {
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
                taId: currentUser.id, taName: currentUser.name, date: selectedDateStr, 
                startTime: payload.time, endTime: `${String(h+1).padStart(2,'0')}:00`, 
                status: 'addition_requested', source: 'system', classroom: ''
            });
            notify('근무 신청 완료');
        } else if (action === 'cancel_request') {
            setModalState({ type: 'cancel_reason', data: payload });
        } else if (action === 'delete') {
            askConfirm("정말 삭제하시겠습니까?", async () => await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload)));
        } else if (action === 'withdraw_cancel') {
            askConfirm("철회하시겠습니까?", async () => await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open', cancelReason: '' }));
        } else if (action === 'withdraw_add') {
            askConfirm("철회하시겠습니까?", async () => await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload)));
        } else if (action === 'approve_booking') {
            if (!payload.classroom) return notify('강의실을 배정해주세요.', 'error');
            setModalState({ type: 'preview_confirm', data: payload });
        } else if (action === 'cancel_booking_admin') { // [추가] 관리자 예약 취소 (초기화)
            askConfirm("이 신청을 취소하고 슬롯을 초기화하시겠습니까?", async () => {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { 
                    status: 'open', studentName: '', studentPhone: '', topic: '', questionRange: '', source: 'system' 
                });
                notify('예약 신청이 취소되었습니다.');
            });
        } else if (action === 'update_classroom') {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { classroom: payload.val });
        } else if (action === 'write_feedback') {
            setInputData({ clinicContent: payload.clinicContent||'', feedback: payload.feedback||'', improvement: payload.improvement||'' });
            setModalState({ type: 'feedback', data: payload });
        } else if (action === 'admin_edit') {
            setInputData({ studentName: payload.studentName||'', topic: payload.topic||'', questionRange: payload.questionRange||'' });
            setModalState({ type: 'admin_edit', data: payload });
        } else if (action === 'approve_schedule_change') { 
             if (payload.status === 'cancellation_requested') {
                 await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id));
                 notify('취소 요청 승인됨 (삭제 완료)');
             } else if (payload.status === 'addition_requested') {
                 await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open' });
                 notify('추가 요청 승인됨');
             }
        } else if (action === 'send_feedback_msg') { 
             setModalState({ type: 'message_preview_feedback', data: payload });
        }
    } catch (e) { notify('오류: ' + e.message, 'error'); }
  }, [currentUser, selectedDateStr, notify, studentSelectedSlots, sessions]);

  // Render
  if(!authUser) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader className="animate-spin text-blue-600" size={40}/></div>;
  if(!currentUser) return <LoginView form={loginForm} setForm={setLoginForm} onLogin={handleLogin} isLoading={loginProcessing} loginErrorModal={loginErrorModal} setLoginErrorModal={setLoginErrorModal}/>;
  if (appLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader className="animate-spin text-blue-600" size={40}/></div>;

  const pendingBookings = sessions.filter(s => s.status === 'pending');
  const scheduleRequests = sessions.filter(s => s.status === 'cancellation_requested' || s.status === 'addition_requested');
  const pendingFeedbacks = sessions.filter(s => s.feedbackStatus === 'submitted');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 pb-20">
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 space-y-2 pointer-events-none">
        {notifications.map(n=><div key={n.id} className={`backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 justify-center text-white font-bold animate-in fade-in slide-in-from-top-4 ${n.type==='error'?'bg-red-500/90':'bg-gray-800/90'}`}>{n.type==='error'?<AlertTriangle size={20}/>:<CheckCircle size={20}/>} {n.msg}</div>)}
      </div>

      <header className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200"><CheckCircle size={20}/></div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight hidden md:block">Imperial<span className="text-blue-600">Admin</span></h1>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
                <div className="text-base font-bold text-gray-900">{currentUser.name}</div>
                <div className="text-xs text-gray-500 uppercase font-medium tracking-wider">{currentUser.role}</div>
            </div>
            <button onClick={() => window.location.reload()} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {currentUser.role === 'admin' && (
           <div className="space-y-8">
              <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">관리자 대시보드</h2>
                  <div className="flex gap-2">
                      <Button variant="secondary" size="sm" icon={BarChart2} onClick={()=>setModalState({type:'stats'})}>통계</Button>
                      <Button variant="secondary" size="sm" icon={Settings} onClick={()=>setModalState({type:'user_manage'})}>사용자 관리</Button>
                  </div>
              </div>
              <Card className="border-purple-200 bg-purple-50/30">
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
              <Card className="bg-blue-50/50 border-blue-100">
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
              <CalendarView isInteractive={false} sessions={sortedSessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={handleAction}/>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-none">
                    <div className="flex justify-between items-end">
                        <div><h2 className="text-2xl font-bold mb-1">안녕하세요, {currentUser.name}님</h2><p className="text-white/80">오늘도 학생들의 성장을 위해 힘써주세요!</p></div>
                        <div className="text-right"><div className="text-4xl font-black">{sessions.filter(s => s.taId === currentUser.id && s.date.startsWith(formatDate(currentDate).substring(0,7))).length}</div><div className="text-sm opacity-80">이달의 근무</div></div>
                    </div>
                </Card>
                <CalendarView isInteractive={true} sessions={sortedSessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={handleAction}/>
            </>
        )}
        {currentUser.role === 'lecturer' && (
           <div className="space-y-8">
              <div className="bg-white border-b pb-4 mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Eye className="text-blue-600" /> 전체 조교 통합 스케줄 (열람 전용)</h2>
              </div>
              <CalendarView isInteractive={false} sessions={sortedSessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={()=>{}}/>
           </div>
        )}
        {currentUser.role === 'student' && (
            <div className="flex flex-col gap-6">
                <Card className="bg-blue-50 border-blue-100">
                    <h2 className="text-lg font-bold mb-4 text-blue-800 flex items-center gap-2"><CheckCircle size={20}/> 나의 예약 현황</h2>
                    {sessions.filter(s => s.studentName === currentUser.name && s.status !== 'open').length === 0 ? <div className="text-center py-8 text-gray-400">예약 내역이 없습니다.</div> : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                            {sessions.filter(s => s.studentName === currentUser.name && s.status !== 'open').map(s => (
                                <div key={s.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                                    <div className="flex justify-between mb-2">
                                        <span className="font-bold text-gray-800 text-lg">{s.date}</span>
                                        <Badge status={s.status}/>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700 mb-2">
                                        <Clock size={16} className="text-blue-500"/>
                                        <span className="font-medium">{s.startTime} ~ {s.endTime}</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-sm">{s.taName} 선생님</span>
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
                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">클리닉 신청</h2>
                        {studentSelectedSlots.length > 0 && <Button size="sm" onClick={()=>setModalState({type:'student_apply'})}>{studentSelectedSlots.length}건 예약 진행</Button>}
                    </div>
                    <CalendarView isInteractive={false} sessions={sortedSessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={handleAction} selectedSlots={studentSelectedSlots}/>
                </Card>
            </div>
        )}
      </main>

      {confirmConfig && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl scale-100 animate-in zoom-in-95">
                <h3 className="text-lg font-bold text-gray-900 mb-2">확인</h3>
                <p className="text-gray-600 mb-6">{confirmConfig.message}</p>
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setConfirmConfig(null)}>취소</Button>
                    <Button className="flex-1" onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }}>확인</Button>
                </div>
            </div>
        </div>
      )}
      <Modal isOpen={modalState.type==='cancel_reason'} onClose={()=>setModalState({type:null})} title="취소 사유">
         <textarea className="w-full border border-gray-300 rounded-xl p-4 h-32 mb-4 text-base focus:ring-2 focus:ring-blue-200 outline-none" placeholder="사유 입력" value={inputData.reason||''} onChange={e=>setInputData({...inputData, reason:e.target.value})}/>
         <Button className="w-full" onClick={async ()=>{ await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', modalState.data.id), { status: 'cancellation_requested', cancelReason: inputData.reason }); setModalState({type:null}); notify('요청 완료'); }}>전송</Button>
      </Modal>
      <Modal isOpen={modalState.type==='preview_confirm'} onClose={()=>setModalState({type:null})} title="문자 발송 확인">
          <div className="bg-gray-50 p-5 rounded-xl text-base leading-relaxed text-gray-700 mb-6 whitespace-pre-wrap font-medium">{modalState.data && TEMPLATES.confirmParent(modalState.data)}</div>
          <Button className="w-full" onClick={async ()=>{ await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', modalState.data.id), { status: 'confirmed' }); setModalState({type:null}); notify('확정 완료'); }}>전송 및 확정</Button>
      </Modal>
      <Modal isOpen={modalState.type==='message_preview_feedback'} onClose={()=>setModalState({type:null})} title="피드백 발송">
          <div className="bg-green-50 p-5 rounded-xl text-base border border-green-200 whitespace-pre-wrap leading-relaxed mb-4">{modalState.data && TEMPLATES.feedbackParent(modalState.data)}</div>
          <Button className="w-full" onClick={async ()=>{ await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', modalState.data.id), { feedbackStatus: 'sent' }); setModalState({type:null}); notify('발송 완료 처리됨'); }}>전송 완료 처리</Button>
      </Modal>
      <Modal isOpen={modalState.type==='admin_edit'} onClose={()=>setModalState({type:null})} title="정보 수정">
         <div className="space-y-4">
             <div><label className="text-sm font-bold text-gray-500">학생 이름</label><input className="w-full border rounded-lg p-3 mt-1" value={inputData.studentName} onChange={e=>setInputData({...inputData, studentName:e.target.value})}/></div>
             <div><label className="text-sm font-bold text-gray-500">과목</label><input className="w-full border rounded-lg p-3 mt-1" value={inputData.topic} onChange={e=>setInputData({...inputData, topic:e.target.value})}/></div>
             <div><label className="text-sm font-bold text-gray-500">범위</label><input className="w-full border rounded-lg p-3 mt-1" value={inputData.questionRange} onChange={e=>setInputData({...inputData, questionRange:e.target.value})}/></div>
             <Button className="w-full mt-4" onClick={async ()=>{ await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', modalState.data.id), { studentName: inputData.studentName, topic: inputData.topic, questionRange: inputData.questionRange, status: inputData.studentName ? 'confirmed' : 'open' }); setModalState({type:null}); notify('수정 완료'); }}>저장</Button>
         </div>
      </Modal>
      <Modal isOpen={modalState.type==='user_manage'} onClose={()=>setModalState({type:null})} title="사용자 관리">
         <div className="flex border-b mb-4">
            {['ta','student','lecturer'].map(t=><button key={t} className={`flex-1 py-3 font-bold text-lg capitalize ${manageTab===t?'text-blue-600 border-b-4 border-blue-600':'text-gray-400'}`} onClick={()=>setManageTab(t)}>{t}</button>)}
         </div>
         <div className="flex flex-col gap-3 mb-4 bg-gray-50 p-4 rounded-xl">
             <input placeholder="이름" className="border rounded-lg p-2" value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})}/>
             <input placeholder="ID" className="border rounded-lg p-2" value={newUser.userId} onChange={e=>setNewUser({...newUser,userId:e.target.value})}/>
             <input placeholder="PW" className="border rounded-lg p-2" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})}/>
             <Button size="sm" onClick={async ()=>{ 
                 try {
                     await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), {...newUser, role:manageTab}); 
                     notify('추가 완료'); 
                     setNewUser({name:'',userId:'',password:'',phone:''}); 
                 } catch (e) {
                     console.error(e);
                     notify('추가 실패: 권한이 부족합니다. DB 규칙을 확인하세요.', 'error');
                 }
             }}>추가하기</Button>
         </div>
         <div className="max-h-[300px] overflow-auto divide-y">
            {users.filter(u=>u.role===manageTab).map(u=>(
                <div key={u.id} className="flex justify-between p-3 items-center">
                    <div><span className="font-bold">{u.name}</span> <span className="text-gray-400 text-sm">({u.userId})</span></div>
                    <button onClick={()=>askConfirm("정말 이 계정을 삭제하시겠습니까?", async ()=>await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', u.id)))} className="text-red-400 hover:text-red-600"><Trash2 size={18}/></button>
                </div>
            ))}
         </div>
      </Modal>
      <Modal isOpen={modalState.type==='stats'} onClose={()=>setModalState({type:null})} title="근무 통계">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
                <thead><tr className="bg-gray-100 border-b"><th className="p-3">이름</th>{[1,2,3,4,5].map(w=><th key={w} className="p-3 text-center">{w}주</th>)}<th className="p-3 text-center">합계</th></tr></thead>
                <tbody>{users.filter(u=>u.role==='ta').map(ta=>{
                    let tConf=0, tSched=0;
                    return (
                        <tr key={ta.id} className="border-b">
                            <td className="p-3 font-medium">{ta.name}</td>
                            {[1,2,3,4,5].map(w=>{
                                const weekSessions = sessions.filter(s => {
                                    const d = new Date(s.date);
                                    return s.taId===ta.id && d.getMonth()===currentDate.getMonth() && getWeekOfMonth(d)===w;
                                });
                                const conf = weekSessions.filter(s=>['confirmed','completed'].includes(s.status)).length;
                                const total = weekSessions.length;
                                tConf+=conf; tSched+=total;
                                return <td key={w} className="p-3 text-center text-xs text-gray-500">{total>0 ? `${conf}/${total}` : '-'}</td>
                            })}
                            <td className="p-3 text-center font-bold text-blue-600">{tConf}/{tSched}</td>
                        </tr>
                    )
                })}</tbody>
            </table>
        </div>
      </Modal>
      <Modal isOpen={modalState.type==='student_apply'} onClose={()=>setModalState({type:null})} title="예약 신청서">
         {applicationItems.map((item,i)=>(
             <div key={i} className="bg-gray-50 p-4 rounded-xl mb-3 border border-gray-100">
                 <div className="mb-2"><label className="block text-xs font-bold text-gray-500 mb-1">과목</label><input className="w-full border rounded-lg p-2" value={item.subject} onChange={e=>{const n=[...applicationItems];n[i].subject=e.target.value;setApplicationItems(n)}} placeholder="예: 수학1"/></div>
                 <div className="flex gap-2">
                     <div className="flex-1"><label className="block text-xs font-bold text-gray-500 mb-1">교재</label><input className="w-full border rounded-lg p-2" value={item.workbook} onChange={e=>{const n=[...applicationItems];n[i].workbook=e.target.value;setApplicationItems(n)}} placeholder="예: 쎈"/></div>
                     <div className="flex-1"><label className="block text-xs font-bold text-gray-500 mb-1">범위</label><input className="w-full border rounded-lg p-2" value={item.range} onChange={e=>{const n=[...applicationItems];n[i].range=e.target.value;setApplicationItems(n)}} placeholder="p.30~40"/></div>
                 </div>
             </div>
         ))}
         <Button variant="secondary" className="w-full mb-4" onClick={()=>setApplicationItems([...applicationItems,{subject:'',workbook:'',range:''}])}><Plus size={16}/> 과목 추가</Button>
         <Button className="w-full" onClick={submitStudentApplication}>신청 완료</Button>
      </Modal>
      <Modal isOpen={modalState.type==='feedback'} onClose={()=>setModalState({type:null})} title="피드백 작성">
          <textarea className="w-full border rounded-xl p-3 mb-2 h-20" placeholder="진행 내용" value={inputData.clinicContent} onChange={e=>setInputData({...inputData, clinicContent:e.target.value})}/>
          <textarea className="w-full border rounded-xl p-3 mb-2 h-20" placeholder="문제점" value={inputData.feedback} onChange={e=>setInputData({...inputData, feedback:e.target.value})}/>
          <textarea className="w-full border rounded-xl p-3 mb-2 h-20" placeholder="개선 방향" value={inputData.improvement} onChange={e=>setInputData({...inputData, improvement:e.target.value})}/>
          <Button className="w-full" onClick={async ()=>{ await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', modalState.data.id), { ...inputData, status: 'completed', feedbackStatus: 'submitted' }); setModalState({type:null}); notify('제출 완료'); }}>저장</Button>
      </Modal>
    </div>
  );
}