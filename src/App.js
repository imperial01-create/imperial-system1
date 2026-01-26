import React, { useState, useEffect, useMemo, useCallback } from 'react';
import YouTube from 'react-youtube'; 
import {
  Calendar as CalendarIcon, Clock, CheckCircle, MessageSquare, AlertCircle, LogOut, Plus, X, Trash2, Settings, Edit2, Save, XCircle, PlusCircle, ClipboardList, Users, CheckSquare, BarChart2, AlertTriangle, Undo2, Eye, EyeOff, ChevronLeft, ChevronRight, Loader, PenTool, List, Bell, Send, Check, RefreshCw, ArrowRight, Search, Menu, Video, BookOpen, GraduationCap, LayoutDashboard
} from 'lucide-react';

// --- Firebase Libraries ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc,
  onSnapshot, writeBatch, query, where, getDocs, limit, enableIndexedDbPersistence, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, serverTimestamp 
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// [Optimization] Offline Persistence
try { enableIndexedDbPersistence(db).catch(() => {}); } catch(e) {}

// --- Constants ---
const APP_ID = 'imperial-clinic-v1';
const CLASSROOMS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SUBJECTS = ['수학', '영어', '국어', '과학', '기타'];

const SEED_USERS = [
  { role: 'admin', userId: 'imperialsys01', password: '1', name: '행정직원' }, 
  { role: 'ta', userId: 'ta_kim', password: '1', name: '김민성', subject: '수학' },
  { role: 'ta', userId: 'ta_oh', password: '1', name: '오혜원', subject: '영어' },
  { role: 'ta', userId: 'ta_lee', password: '1', name: '이채연', subject: '과학' },
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

const getYouTubeID = (url) => {
    if(!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// --- UI Components ---
const Button = React.memo(({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon, size = 'md' }) => {
  const sizes = { 
    sm: 'px-4 py-2 text-sm', 
    md: 'px-5 py-3 text-base', 
    lg: 'px-8 py-4 text-xl' 
  };
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95 active:bg-blue-800',
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
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200">
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

// --- Calendar View (Clinic) ---
const CalendarView = React.memo(({ isInteractive, sessions, currentUser, currentDate, setCurrentDate, selectedDateStr, onDateChange, onAction, selectedSlots = [], users }) => {
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
              <button key={i} onClick={()=>onDateChange(dStr)} className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 min-h-[50px] ${isSel?'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-200': isToday ? 'bg-blue-50 text-blue-600 font-bold' : 'hover:bg-gray-100 text-gray-700'} ${hasEvent && !isSel ? 'ring-1 ring-blue-100' : ''}`}>
                <span className={`text-base md:text-lg ${isSel?'font-bold':''}`}>{d.getDate()}</span>
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
            const isSlotPast = new Date(`${selectedDateStr}T${t}`) < now;
            
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

// --- [Module 1] Clinic System (Integrated) ---
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
  const [inputData, setInputData] = useState({});
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
        sessionQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', today), limit(100));
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
  }, [currentUser, currentDate]);

  useEffect(() => {
    setSessions(Object.values(sessionMap).sort((a,b) => a.startTime.localeCompare(b.startTime)));
  }, [sessionMap]);

  const notify = (msg, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };
  const askConfirm = (message, onConfirm) => setConfirmConfig({ message, onConfirm });
  const handleDateChange = (newDate) => { setSelectedDateStr(newDate); if (currentUser.role === 'student') setStudentSelectedSlots([]); };

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
        } else if (action === 'edit_user') { 
             setNewUser({ ...payload, isEdit: true }); setModalState({ type: 'user_manage' }); 
        }
      } catch (e) { notify('오류: ' + e.message, 'error'); }
  }, [currentUser, selectedDateStr, sessions, studentSelectedSlots, users]);

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

  const pendingBookings = sessions.filter(s => s.status === 'pending');
  const scheduleRequests = sessions.filter(s => s.status === 'cancellation_requested' || s.status === 'addition_requested');
  const pendingFeedbacks = sessions.filter(s => s.feedbackStatus === 'submitted');
  const studentMyClinics = sessions.filter(s => s.studentName === currentUser.name && (s.status === 'confirmed' || s.status === 'pending')).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  if (appLoading) return <div className="h-full flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40}/></div>;

  return (
    <div className="space-y-6">
       <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 space-y-2 pointer-events-none">
          {notifications.map(n=><div key={n.id} className={`backdrop-blur text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 justify-center ${n.type==='error'?'bg-red-500/90':'bg-gray-900/90'}`}>{n.msg}</div>)}
       </div>
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
              <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={handleAction} users={users}/>
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
                <CalendarView isInteractive={true} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={handleAction}/>
            </>
        )}
       {currentUser.role === 'lecturer' && (
           <div className="space-y-8">
              <div className="bg-white border-b pb-4 mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Eye className="text-blue-600" /> 전체 조교 통합 스케줄 (열람 전용)</h2>
              </div>
              <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={()=>{}} users={users}/>
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
                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">클리닉 신청</h2>
                    </div>
                    <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} onDateChange={handleDateChange} onAction={handleAction} selectedSlots={studentSelectedSlots} users={users}/>
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

      {/* --- Modals (Restored All Modals from v3.0) --- */}
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
      <Modal isOpen={modalState.type==='preview_confirm'} onClose={()=>setModalState({type:null})} title="문자 발송"><div className="bg-gray-50 p-5 rounded-xl mb-4 whitespace-pre-wrap text-base leading-relaxed">{selectedSession&&TEMPLATES.confirmParent(selectedSession)}</div><Button className="w-full py-4 text-lg" onClick={async ()=>{ await updateSession(selectedSession.id, {status:'confirmed'}); setModalType(null); addNotification('발송 완료'); }}>전송 및 확정</Button></Modal>
      <Modal isOpen={modalState.type==='message_preview_feedback'} onClose={()=>setModalState({type:null})} title="피드백 발송"><div className="bg-green-50 p-5 rounded-xl text-base border border-green-200 whitespace-pre-wrap relative cursor-pointer leading-relaxed" onClick={()=>copyToClipboard(selectedSession&&TEMPLATES.feedbackParent(selectedSession))}>{selectedSession&&TEMPLATES.feedbackParent(selectedSession)}</div><Button className="w-full mt-4 py-4 text-lg" onClick={async ()=>{ await updateSession(selectedSession.id, {feedbackStatus:'sent'}); setModalType(null); addNotification('발송 완료'); }}>전송 완료 처리</Button></Modal>
      <Modal isOpen={modalState.type==='admin_edit'} onClose={()=>setModalState({type:null})} title="예약/클리닉 수정"><div className="space-y-4"><div><label className="block text-sm font-bold text-gray-600 mb-1">학생 이름 (직접 입력 시 예약됨)</label><input className="w-full border-2 rounded-lg p-3 text-lg" value={adminEditData.studentName} onChange={e=>setAdminEditData({...adminEditData, studentName:e.target.value})} placeholder="학생 이름"/></div><div><label className="block text-sm font-bold text-gray-600 mb-1">과목</label><input className="w-full border-2 rounded-lg p-3 text-lg" value={adminEditData.topic} onChange={e=>setAdminEditData({...adminEditData, topic:e.target.value})} placeholder="과목"/></div><div><label className="block text-sm font-bold text-gray-600 mb-1">교재 및 범위</label><input className="w-full border-2 rounded-lg p-3 text-lg" value={adminEditData.questionRange} onChange={e=>setAdminEditData({...adminEditData, questionRange:e.target.value})} placeholder="범위"/></div><Button className="w-full py-4 text-lg" onClick={handleAdminEditSubmit}>저장하기</Button></div></Modal>
      <Modal isOpen={modalState.type==='admin_stats'} onClose={()=>setModalState({type:null})} title="근무 통계"><div className="space-y-6"><div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl"><span className="font-bold text-gray-700 text-lg">{currentDate.getFullYear()}년 {currentDate.getMonth()+1}월 근무 현황</span><div className="text-sm text-gray-500">확정(수행) / 전체(오픈)</div></div><div className="overflow-x-auto"><table className="w-full text-base text-left border-collapse"><thead><tr className="bg-gray-100 border-b"><th className="p-3">조교명</th>{[1,2,3,4,5].map(w=><th key={w} className="p-3 text-center">{w}주</th>)}<th className="p-3 text-center font-bold">합계</th></tr></thead><tbody>{users.filter(u=>u.role==='ta').map(ta=>{let tConf=0,tSched=0;return(<tr key={ta.id} className="border-b"><td className="p-3 font-medium">{ta.name}</td>{[1,2,3,4,5].map(w=>{const weekSessions=sessions.filter(s=>{const [sy,sm,sd]=s.date.split('-').map(Number);const sDate=new Date(sy,sm-1,sd);return s.taId===ta.id&&sy===currentDate.getFullYear()&&(sm-1)===currentDate.getMonth()&&getWeekOfMonth(sDate)===w});const conf=weekSessions.filter(s=>s.status==='confirmed'||s.status==='completed').length;const sched=weekSessions.filter(s=>s.status==='open'||s.status==='confirmed'||s.status==='completed').length;tConf+=conf;tSched+=sched;return<td key={w} className="p-3 text-center text-sm">{sched>0?<span className={conf>0?'text-blue-600 font-bold':'text-gray-400'}>{conf}/{sched}</span>:'-'}</td>})}<td className="p-3 text-center font-bold bg-blue-50 text-blue-800">{tConf}/{tSched}</td></tr>)})}</tbody></table></div></div></Modal>
    </div>
  );
};


// --- [Module 2] Admin Lecture Management ---
const AdminLectureManager = ({ users }) => {
    const [classes, setClasses] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newClass, setNewClass] = useState({ name: '', days: [], students: [] });
    const [selectedStudents, setSelectedStudents] = useState([]);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
        return onSnapshot(q, (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, []);

    const handleCreateClass = async () => {
        if(!newClass.name) return alert('반 이름을 입력하세요');
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), {
            ...newClass, studentIds: selectedStudents, createdAt: serverTimestamp()
        });
        setIsModalOpen(false); setNewClass({ name: '', days: [], students: [] }); setSelectedStudents([]);
    };

    const toggleDay = (day) => {
        setNewClass(prev => ({
            ...prev, days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">강의 및 반 관리</h2>
                <Button onClick={() => setIsModalOpen(true)} icon={Plus}>반 생성</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classes.map(cls => (
                    <Card key={cls.id} className="hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg">{cls.name}</h3>
                            <button onClick={async () => { if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', cls.id)) }} className="text-gray-400 hover:text-red-500"><Trash2 size={18}/></button>
                        </div>
                        <div className="flex gap-1 mb-3">
                            {cls.days.map(d => <span key={d} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{d}</span>)}
                        </div>
                        <div className="text-sm text-gray-500">배정된 학생: {cls.studentIds?.length || 0}명</div>
                    </Card>
                ))}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="새로운 반 생성">
                <div className="space-y-4">
                    <input className="w-full border p-3 rounded-xl" placeholder="반 이름 (예: 고1 수학 A반)" value={newClass.name} onChange={e => setNewClass({...newClass, name: e.target.value})} />
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">수업 요일</label>
                        <div className="flex gap-2 flex-wrap">
                            {DAYS.map(d => (
                                <button key={d} onClick={() => toggleDay(d)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${newClass.days.includes(d) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{d}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">학생 배정</label>
                        <div className="max-h-40 overflow-y-auto border rounded-xl p-2 divide-y">
                            {users.filter(u => u.role === 'student').map(u => (
                                <div key={u.id} className="flex justify-between items-center p-2 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedStudents(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}>
                                    <span>{u.name} ({u.userId})</span>
                                    {selectedStudents.includes(u.id) && <CheckCircle size={16} className="text-green-600" />}
                                </div>
                            ))}
                        </div>
                    </div>
                    <Button className="w-full" onClick={handleCreateClass}>생성하기</Button>
                </div>
            </Modal>
        </div>
    );
};

// --- [Module 3] Lecturer Dashboard ---
const LecturerDashboard = () => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [lectures, setLectures] = useState([]);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingLecture, setEditingLecture] = useState({});

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
        return onSnapshot(q, (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, []);

    useEffect(() => {
        if (!selectedClass) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', '==', selectedClass.id));
        return onSnapshot(q, (s) => setLectures(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.date.localeCompare(a.date))));
    }, [selectedClass]);

    const handleSaveLecture = async () => {
        const data = {
            classId: selectedClass.id,
            date: editingLecture.date || getLocalToday(),
            progress: editingLecture.progress || '',
            homework: editingLecture.homework || '',
            youtubeLink: editingLecture.youtubeLink || '',
            updatedAt: serverTimestamp()
        };

        if (editingLecture.id) {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', editingLecture.id), data);
        } else {
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), data);
        }
        setIsEditModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 overflow-x-auto pb-2">
                {classes.map(cls => (
                    <button key={cls.id} onClick={() => setSelectedClass(cls)} className={`px-5 py-3 rounded-xl border whitespace-nowrap transition-all ${selectedClass?.id === cls.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {cls.name}
                    </button>
                ))}
            </div>

            {selectedClass && (
                <>
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-xl">{selectedClass.name} 강의 기록</h3>
                        <Button size="sm" icon={Plus} onClick={() => { setEditingLecture({ date: getLocalToday() }); setIsEditModalOpen(true); }}>강의 기록 추가</Button>
                    </div>

                    <div className="space-y-4">
                        {lectures.map(lecture => (
                            <Card key={lecture.id} className="border-l-4 border-l-blue-500">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="font-bold text-lg text-gray-800">{lecture.date}</div>
                                    <button onClick={() => { setEditingLecture(lecture); setIsEditModalOpen(true); }} className="text-gray-400 hover:text-blue-600"><Edit2 size={18} /></button>
                                </div>
                                <div className="space-y-2 text-sm text-gray-600">
                                    <div className="flex gap-2"><BookOpen size={16} className="shrink-0 text-blue-600" /> <span className="font-medium text-gray-800">진도:</span> {lecture.progress}</div>
                                    <div className="flex gap-2"><PenTool size={16} className="shrink-0 text-purple-600" /> <span className="font-medium text-gray-800">숙제:</span> {lecture.homework}</div>
                                    {lecture.youtubeLink && <div className="flex gap-2"><Video size={16} className="shrink-0 text-red-600" /> <a href={lecture.youtubeLink} target="_blank" rel="noreferrer" className="text-blue-500 underline truncate">강의 영상 보기</a></div>}
                                </div>
                            </Card>
                        ))}
                    </div>
                </>
            )}

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="강의 내용 입력">
                <div className="space-y-4">
                    <input type="date" className="w-full border rounded-lg p-3" value={editingLecture.date} onChange={e => setEditingLecture({...editingLecture, date: e.target.value})} />
                    <textarea placeholder="진도 내용" className="w-full border rounded-lg p-3 h-20" value={editingLecture.progress} onChange={e => setEditingLecture({...editingLecture, progress: e.target.value})} />
                    <textarea placeholder="숙제 내용" className="w-full border rounded-lg p-3 h-20" value={editingLecture.homework} onChange={e => setEditingLecture({...editingLecture, homework: e.target.value})} />
                    <input placeholder="YouTube 영상 링크" className="w-full border rounded-lg p-3" value={editingLecture.youtubeLink} onChange={e => setEditingLecture({...editingLecture, youtubeLink: e.target.value})} />
                    <Button className="w-full" onClick={handleSaveLecture}>저장하기</Button>
                </div>
            </Modal>
        </div>
    );
};

// --- [Module 4] Student Classroom ---
const StudentClassroom = ({ currentUser }) => {
    const [myClasses, setMyClasses] = useState([]);
    const [lectures, setLectures] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [completions, setCompletions] = useState([]);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), where('studentIds', 'array-contains', currentUser.id));
        return onSnapshot(q, (s) => setMyClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [currentUser]);

    useEffect(() => {
        if (myClasses.length === 0) return;
        const classIds = myClasses.map(c => c.id);
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', 'in', classIds.slice(0, 10))); // Limit 10 for 'in' query
        return onSnapshot(q, (s) => setLectures(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.date.localeCompare(a.date))));
    }, [myClasses]);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions'), where('studentId', '==', currentUser.id));
        return onSnapshot(q, (s) => setCompletions(s.docs.map(d => d.data().lectureId)));
    }, [currentUser]);

    const handleVideoEnd = async (lectureId) => {
        const docId = `${lectureId}_${currentUser.id}`;
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions', docId), {
            lectureId,
            studentId: currentUser.id,
            studentName: currentUser.name,
            status: 'completed',
            completedAt: serverTimestamp()
        });
        alert('학습 완료가 저장되었습니다!');
        setSelectedVideo(null);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">내 강의실</h2>
            
            <div className="space-y-4">
                {lectures.map(lecture => {
                    const cls = myClasses.find(c => c.id === lecture.classId);
                    const isCompleted = completions.includes(lecture.id);
                    const videoId = getYouTubeID(lecture.youtubeLink);

                    return (
                        <Card key={lecture.id} className={`border-l-4 ${isCompleted ? 'border-l-green-500' : 'border-l-gray-300'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md mb-1 inline-block">{cls?.name}</span>
                                    <div className="font-bold text-lg">{lecture.date} 수업</div>
                                </div>
                                {isCompleted ? (
                                    <div className="flex items-center gap-1 text-green-600 font-bold text-sm"><CheckCircle size={16} /> 학습 완료</div>
                                ) : (
                                    <span className="text-gray-400 text-sm font-medium">미완료</span>
                                )}
                            </div>
                            <div className="space-y-2 mb-4 text-sm text-gray-700">
                                <div className="bg-gray-50 p-3 rounded-lg"><span className="font-bold mr-2">진도:</span>{lecture.progress}</div>
                                <div className="bg-purple-50 p-3 rounded-lg"><span className="font-bold mr-2">숙제:</span>{lecture.homework}</div>
                            </div>
                            {videoId && (
                                <Button 
                                    className={`w-full ${isCompleted ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-700'}`} 
                                    icon={Video} 
                                    onClick={() => setSelectedVideo({ id: videoId, lectureId: lecture.id })}
                                >
                                    {isCompleted ? '다시 보기' : '영상 학습하기'}
                                </Button>
                            )}
                        </Card>
                    );
                })}
            </div>

            {selectedVideo && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col justify-center items-center p-4">
                    <div className="w-full max-w-4xl aspect-video bg-black shadow-2xl relative">
                        <button onClick={() => setSelectedVideo(null)} className="absolute -top-12 right-0 text-white p-2"><X size={32}/></button>
                        <YouTube
                            videoId={selectedVideo.id}
                            opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }}
                            className="w-full h-full"
                            onEnd={() => handleVideoEnd(selectedVideo.lectureId)}
                        />
                    </div>
                    <p className="text-white mt-4 text-center">영상을 끝까지 시청하면 자동으로 완료 처리됩니다.</p>
                </div>
            )}
        </div>
    );
};


// --- Main App Shell ---
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('clinic'); // 'clinic', 'lectures', 'class_mgmt', 'my_classes'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [users, setUsers] = useState([]);

  // Auth Init
  useEffect(() => {
    const initAuth = async () => { try { await signInAnonymously(auth); } catch (e) {} };
    initAuth();
    return onAuthStateChanged(auth, (user) => {
        if(user) {
             const saved = sessionStorage.getItem('imperial_user');
             if(saved) setCurrentUser(JSON.parse(saved));
        }
        setLoading(false);
    });
  }, []);

  // Fetch Users (Cached)
  useEffect(() => {
      if(!currentUser) return;
      // Only Admin or Lecturer needs user list (for management/stats)
      if (currentUser.role === 'admin' || currentUser.role === 'lecturer') {
          const cachedUsers = localStorage.getItem('cached_users');
          if (cachedUsers) setUsers(JSON.parse(cachedUsers));
          
          const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
          getDocs(q).then(s => {
              const u = s.docs.map(d => ({id: d.id, ...d.data()}));
              // Update cache only if different (simple check)
              if (JSON.stringify(u) !== cachedUsers) {
                  setUsers(u);
                  localStorage.setItem('cached_users', JSON.stringify(u));
              }
          });
      }
  }, [currentUser]);

  // Login Logic
  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [loginProcessing, setLoginProcessing] = useState(false);
  const [loginErrorModal, setLoginErrorModal] = useState({ isOpen: false, msg: '' });

  const handleLogin = async () => {
     setLoginProcessing(true);
     const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), where('userId', '==', loginForm.id), where('password', '==', loginForm.password));
     const s = await getDocs(q);
     if(!s.empty) {
         const userData = { id: s.docs[0].id, ...s.docs[0].data() };
         setCurrentUser(userData);
         sessionStorage.setItem('imperial_user', JSON.stringify(userData));
         // Set default tab based on role
         if(userData.role === 'student') setActiveTab('my_classes');
         else if(userData.role === 'admin') setActiveTab('class_mgmt');
         else setActiveTab('clinic');
     } else {
         setLoginErrorModal({ isOpen: true, msg: '아이디 또는 비밀번호가 일치하지 않습니다.' });
     }
     setLoginProcessing(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40} /></div>;
  if (!currentUser) return <LoginView form={loginForm} setForm={setLoginForm} onLogin={handleLogin} isLoading={loginProcessing} loginErrorModal={loginErrorModal} setLoginErrorModal={setLoginErrorModal} />;

  // Navigation Items
  const navItems = [
      { id: 'clinic', label: '클리닉 센터', icon: CalendarIcon, roles: ['admin', 'ta', 'lecturer', 'student'] },
      { id: 'class_mgmt', label: '강의 관리', icon: Settings, roles: ['admin'] },
      { id: 'lectures', label: '강의 관리', icon: PenTool, roles: ['lecturer'] },
      { id: 'my_classes', label: '수강 강의', icon: GraduationCap, roles: ['student'] },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar (Desktop) */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-6 border-b flex justify-between items-center">
                <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2"><LayoutDashboard /> Imperial</h1>
                <button className="md:hidden" onClick={()=>setIsSidebarOpen(false)}><X size={24}/></button>
            </div>
            <nav className="p-4 space-y-2">
                {navItems.filter(item => item.roles.includes(currentUser.role)).map(item => (
                    <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <item.icon size={20} /> {item.label}
                    </button>
                ))}
            </nav>
            <div className="absolute bottom-0 w-full p-4 border-t">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-500">{currentUser.name[0]}</div>
                    <div>
                        <div className="font-bold text-sm">{currentUser.name}</div>
                        <div className="text-xs text-gray-500 uppercase">{currentUser.role}</div>
                    </div>
                </div>
                <button onClick={()=>{sessionStorage.removeItem('imperial_user'); window.location.reload();}} className="w-full flex items-center gap-2 text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold">
                    <LogOut size={16}/> 로그아웃
                </button>
            </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
            {/* Mobile Header */}
            <header className="bg-white border-b p-4 flex items-center gap-3 md:hidden sticky top-0 z-30">
                <button onClick={()=>setIsSidebarOpen(true)}><Menu size={24}/></button>
                <h1 className="text-lg font-bold">Imperial System</h1>
            </header>

            <main className="p-4 md:p-8 flex-1 overflow-y-auto">
                {activeTab === 'clinic' && <ClinicDashboard currentUser={currentUser} users={users} />}
                {activeTab === 'class_mgmt' && <AdminLectureManager users={users} />}
                {activeTab === 'lectures' && <LecturerDashboard />}
                {activeTab === 'my_classes' && <StudentClassroom currentUser={currentUser} />}
            </main>
        </div>
    </div>
  );
}