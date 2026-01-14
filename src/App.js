import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon, Clock, CheckCircle, User, MessageSquare, AlertCircle, LogOut, Plus, X, Trash2, Settings, Edit2, Save, XCircle, PlusCircle, ClipboardList, Users, CheckSquare, BarChart2, AlertTriangle, Undo2, Eye, ChevronLeft, ChevronRight, Loader
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';

// --- 디자인 강제 적용 (Design Enforcer) ---
const DesignEnforcer = () => {
  useEffect(() => {
    if (!document.getElementById('tailwind-script')) {
      const script = document.createElement('script');
      script.id = 'tailwind-script';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    if (!document.getElementById('font-style')) {
      const link = document.createElement('link');
      link.id = 'font-style';
      link.rel = 'stylesheet';
      link.href = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css";
      document.head.appendChild(link);
    }
  }, []);
  return (
    <style dangerouslySetInnerHTML={{__html: `
      body { font-family: 'Pretendard', sans-serif !important; }
      .opacity-0 { opacity: 0; }
      .transition-opacity { transition: opacity 0.3s; }
    `}} />
  );
};

// --- Firebase 설정 ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyBN0Zy0-GOqN0sB0bTouDohZp7B2zfFjWc",
  authDomain: "imperial-system-1221c.firebaseapp.com",
  projectId: "imperial-system-1221c",
  storageBucket: "imperial-system-1221c.firebasestorage.app",
  messagingSenderId: "414889692060",
  appId: "1:414889692060:web:9b6b89d0d918a74f8c1659"
};

let app;
try { app = initializeApp(firebaseConfig); } catch (e) {}
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'imperial-clinic-v1';

// --- 상수 및 유틸 ---
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

// 한국 시간 기준 오늘 날짜 가져오기 (YYYY-MM-DD)
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
const generateTimeSlots = () => Array.from({ length: 12 }, (_, i) => `${i + 10}:00`);

// --- UI 컴포넌트 ---
const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon, size = 'md' }) => {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-md disabled:bg-blue-300',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    success: 'bg-green-600 text-white hover:bg-green-700 shadow-md',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    naver: 'bg-[#03C75A] text-white hover:bg-[#02b351] shadow-md',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
  };
  return (
    <button onClick={onClick} className={`rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`} disabled={disabled}>
      {Icon && <Icon size={size === 'sm' ? 14 : 18} />} {children}
    </button>
  );
};

const Card = ({ children, className = '' }) => <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}>{children}</div>;
const Badge = ({ status }) => {
  const styles = { open: 'bg-blue-100 text-blue-700', pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-green-100 text-green-700', completed: 'bg-gray-100 text-gray-700 border border-gray-300', cancellation_requested: 'bg-red-100 text-red-700', addition_requested: 'bg-purple-100 text-purple-700' };
  const labels = { open: '예약 가능', pending: '승인 대기', confirmed: '예약 확정', completed: '클리닉 완료', cancellation_requested: '취소 요청중', addition_requested: '신청 대기중' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${styles[status] || styles.completed}`}>{labels[status] || status}</span>;
};
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl transform transition-all max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b shrink-0">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// --- [분리됨] 로그인 뷰 ---
const LoginView = ({ form, setForm, error, onLogin }) => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">
      <div className="text-center mb-8">
        <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><CheckCircle size={32}/></div>
        <h1 className="text-2xl font-bold text-gray-800">Imperial System</h1>
        <p className="text-gray-500 mt-2">임페리얼 학원 관리 시스템</p>
      </div>
      <div className="space-y-4">
        <input type="text" placeholder="아이디" className="w-full border rounded-lg p-3" value={form.id} onChange={e=>setForm({...form, id:e.target.value})}/>
        <input type="password" placeholder="비밀번호" className="w-full border rounded-lg p-3" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} onKeyDown={e=>e.key==='Enter'&&onLogin()}/>
        {error && <div className="text-red-500 text-sm text-center">{error}</div>}
        <Button onClick={onLogin} className="w-full py-3 text-lg">로그인</Button>
      </div>
    </div>
  </div>
);

// --- [분리됨] 달력 뷰 (관리자 강의실 배정 기능 추가됨) ---
const CalendarView = ({ isInteractive, sessions, currentUser, currentDate, setCurrentDate, selectedDateStr, setSelectedDateStr, onAddRequest, onDelete, onApprove, onCancel, onFeedback, onWithdrawCancel, onUpdateSession }) => {
  const mySessions = isInteractive ? sessions.filter(s=>s.taId===currentUser.id&&s.date===selectedDateStr) : sessions.filter(s=>s.date===selectedDateStr);
  const isAdmin = currentUser.role === 'admin';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 min-h-[400px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold flex items-center gap-2"><CalendarIcon size={18} className="text-blue-600"/> 달력</h3>
          <div className="flex gap-2">
            <button onClick={()=>setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()-1)))} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={20}/></button>
            <span className="font-bold text-lg">{currentDate.getFullYear()}.{currentDate.getMonth()+1}</span>
            <button onClick={()=>setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()+1)))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={20}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-500 mb-2">{DAYS.map(d=><div key={d}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {getDaysInMonth(currentDate).map((d,i)=>{
            if(!d) return <div key={i} className="aspect-square"/>;
            const dStr = formatDate(d);
            const isSel = dStr===selectedDateStr;
            const has = sessions.some(s=>s.date===dStr && (isInteractive?s.taId===currentUser.id:true));
            return (
              <button key={i} onClick={()=>setSelectedDateStr(dStr)} className={`aspect-square rounded-lg flex flex-col items-center justify-center relative ${isSel?'bg-blue-600 text-white shadow':'hover:bg-gray-100'}`}>
                <span className={`text-sm ${isSel?'font-bold':''}`}>{d.getDate()}</span>
                {has && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSel?'bg-white':'bg-blue-500'}`}/>}
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <h3 className="font-bold text-xl mb-4">{selectedDateStr} 스케줄</h3>
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {generateTimeSlots().map((t, i) => {
            const slots = mySessions.filter(s=>s.startTime===t);
            if(slots.length===0) return isInteractive ? (
              <div key={i} className="flex gap-4 items-start group">
                <div className="w-16 pt-3 text-right text-sm text-gray-500">{t}</div>
                <div className="flex-1 border rounded-xl p-3 bg-gray-50 border-dashed flex justify-between items-center min-h-[60px]">
                  <span className="text-xs text-gray-400">근무 없음</span>
                  <Button size="sm" variant="secondary" icon={PlusCircle} onClick={()=>onAddRequest(t)}>추가</Button>
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-4 items-start"><div className="w-16 pt-3 text-right text-sm text-gray-500">{t}</div><div className="flex-1 border rounded-xl p-3 bg-gray-50 min-h-[60px] flex items-center justify-center text-gray-400 text-xs">일정 없음</div></div>
            );
            return (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-16 pt-3 text-right text-sm text-gray-500">{t}</div>
                <div className="flex-1 space-y-2">
                  {slots.map(s=>(
                    <div key={s.id} className={`border rounded-xl p-3 flex flex-col justify-center min-h-[80px] ${s.status==='confirmed'?'bg-green-50 border-green-200':s.status==='cancellation_requested'?'bg-red-50 border-red-200':s.status==='addition_requested'?'bg-purple-50 border-purple-200':'bg-blue-50 border-blue-200'}`}>
                      <div className="flex justify-between items-start w-full">
                        <div>
                          <div className="flex items-center gap-2 mb-1"><span className="font-bold text-gray-900">{s.studentName||s.taName}</span><Badge status={s.status}/></div>
                          <div className="text-sm text-gray-600">{s.topic||(isAdmin?`${s.taName} 근무`:'예약 대기')}</div>
                          {/* 관리자인 경우 스케줄 칸에서 강의실 배정 */}
                          {isAdmin && (
                            <select 
                              className={`text-xs border rounded p-1 mt-1 ${!s.classroom ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} 
                              value={s.classroom || ''} 
                              onChange={(e) => onUpdateSession(s.id, { classroom: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">강의실 선택</option>
                              {CLASSROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          )}
                          {!isAdmin && s.classroom && <div className="text-xs text-blue-600 mt-1">{s.classroom}</div>}
                        </div>
                        <div className="flex gap-1">
                          {isInteractive && s.status==='open' && <Button size="sm" variant="danger" icon={XCircle} onClick={()=>onCancel(s)}>취소</Button>}
                          {isInteractive && s.status==='cancellation_requested' && <Button size="sm" variant="secondary" icon={Undo2} onClick={()=>onWithdrawCancel(s)}>요청 취소</Button>}
                          {isInteractive && s.status==='addition_requested' && <span className="text-xs text-purple-600 flex items-center">승인 대기중</span>}
                          {isAdmin && <button onClick={()=>onDelete(s.id)} className="text-red-400 p-1"><Trash2 size={14}/></button>}
                          {isAdmin && s.status==='pending' && <Button size="sm" onClick={()=>onApprove(s)}>승인</Button>}
                          {isInteractive && (s.status==='confirmed'||s.status==='completed') && <Button size="sm" variant="success" icon={CheckSquare} onClick={()=>onFeedback(s)}>피드백</Button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

// --- 메인 앱 ---
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(getLocalToday());
  const [studentDate, setStudentDate] = useState(new Date());
  const [studentSelectedDateStr, setStudentSelectedDateStr] = useState(getLocalToday());
  const [studentSelectedSlots, setStudentSelectedSlots] = useState([]);
  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [manageTab, setManageTab] = useState('ta');
  const [newUser, setNewUser] = useState({ name: '', userId: '', password: '', phone: '' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', userId: '', password: '', phone: '' });
  const [requestData, setRequestData] = useState({ reason: '', type: '', targetTime: '' });
  const [applicationItems, setApplicationItems] = useState([{ subject: '', workbook: '', range: '' }]);
  const [feedbackData, setFeedbackData] = useState({ clinicContent: '', feedback: '', improvement: '' });
  const [selectedTaIdForSchedule, setSelectedTaIdForSchedule] = useState('');
  const [batchDateRange, setBatchDateRange] = useState({ start: '', end: '' });
  const [defaultSchedule, setDefaultSchedule] = useState({ 월: { start: '14:00', end: '22:00', active: false }, 화: { start: '14:00', end: '22:00', active: false }, 수: { start: '14:00', end: '22:00', active: false }, 목: { start: '14:00', end: '22:00', active: false }, 금: { start: '14:00', end: '22:00', active: false }, 토: { start: '10:00', end: '18:00', active: false }, 일: { start: '10:00', end: '18:00', active: false } });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      } catch (e) { console.error(e); }
    };
    initAuth();
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (s) => {
      const u = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(u);
      if (u.length === 0) {
        const batch = writeBatch(db);
        SEED_USERS.forEach(ud => batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'users')), ud));
        batch.commit();
      }
    });
    const unsubSessions = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), (s) => {
      setSessions(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => { unsubUsers(); unsubSessions(); };
  }, [authUser]);

  const addNotification = (msg, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const handleLogin = () => {
    const u = users.find(u => u.userId === loginForm.id && u.password === loginForm.password);
    if (u) { setCurrentUser(u); setLoginError(''); addNotification(`${u.name}님 환영합니다!`); }
    else setLoginError('아이디 또는 비밀번호가 일치하지 않습니다.');
  };
  const handleLogout = () => { setCurrentUser(null); setLoginForm({id:'',password:''}); setModalType(null); };

  const createSession = async (data) => await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), data);
  const updateSession = async (id, data) => await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', id), data);
  const deleteSession = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', id));
  const createUser = async (data) => await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), data);
  const deleteUserAction = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id));

  const handleSaveDefaultSchedule = async () => {
    if (!selectedTaIdForSchedule || !batchDateRange.start || !batchDateRange.end) return;
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
            batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions')), {
              taId: targetTa.id, taName: targetTa.name, date: dStr, startTime: sT, endTime: eT, status: 'open', source: 'system', studentName: '', topic: '', questionRange: '', feedback: '', improvement: '', clinicContent: '', feedbackStatus: 'none', classroom: ''
            });
            count++;
          }
        }
      }
    }
    await batch.commit();
    addNotification(`${count}개의 스케줄 생성 완료`);
  };

  const onAddRequest = async (t) => {
    const h = parseInt(t.split(':')[0]);
    await createSession({
      taId: currentUser.id, taName: currentUser.name, date: selectedDateStr, startTime: t, endTime: `${String(h+1).padStart(2,'0')}:00`, status: 'addition_requested', source: 'system', studentName: '', topic: '', questionRange: '', feedback: '', improvement: '', clinicContent: '', feedbackStatus: 'none', classroom: ''
    });
    setModalType(null);
    addNotification('신청 완료');
  };
  
  const onCancel = (s) => { setSelectedSession(s); setRequestData({reason:'', type:'cancel'}); setModalType('request_change'); };
  const onApprove = (s) => { 
    if(!s.classroom) { addNotification('클리닉 반이 배정되지 않았습니다.', 'error'); return; }
    setSelectedSession(s); setModalType('message_preview_confirm'); 
  };
  const onFeedback = (s) => { setSelectedSession(s); setFeedbackData({clinicContent:s.clinicContent||'', feedback:s.feedback||'', improvement:s.improvement||''}); setModalType('feedback'); };

  const handleRequestCancel = async () => {
    if (!requestData.reason) return addNotification('사유를 입력해주세요', 'error');
    await updateSession(selectedSession.id, { status: 'cancellation_requested', cancelReason: requestData.reason });
    setModalType(null);
    addNotification('취소 요청 완료');
  };

  const handleWithdrawCancelRequest = async (s) => {
    if (window.confirm('취소 요청을 철회하시겠습니까?')) {
      await updateSession(s.id, { status: 'open', cancelReason: '' });
      addNotification('취소 요청 철회됨');
    }
  };

  const handleApproveRequest = async (s) => {
    if(s.status === 'cancellation_requested') {
      await deleteSession(s.id);
      addNotification('취소 승인 완료');
    } else if(s.status === 'addition_requested') {
      await updateSession(s.id, { status: 'open' });
      addNotification('신청 승인 완료');
    }
  };

  const submitStudentApplication = async () => {
    const formattedTopic = applicationItems.map(i => i.subject).join(', ');
    const formattedRange = applicationItems.map(i => `${i.workbook} (${i.range})`).join('\n');
    const batch = writeBatch(db);
    studentSelectedSlots.forEach(id => {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', id);
      batch.update(ref, { status: 'pending', studentName: currentUser.name, studentPhone: currentUser.phone || '', topic: formattedTopic, questionRange: formattedRange, source: 'app' });
    });
    await batch.commit();
    setModalType(null); setStudentSelectedSlots([]); addNotification('신청 완료!');
  };

  const handleSubmitFeedback = async () => {
    await updateSession(selectedSession.id, { ...feedbackData, status: 'completed', feedbackStatus: 'submitted' });
    setModalType(null);
    addNotification('피드백 제출 완료');
  };

  if(loading) return <div className="min-h-screen flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={48}/></div>;
  if(!currentUser) return <><DesignEnforcer/><LoginView form={loginForm} setForm={setLoginForm} error={loginError} onLogin={handleLogin}/></>;

  // Filtered Lists for Admin/Lecturer
  const pendingBookings = sessions.filter(s => s.status === 'pending');
  const pendingFeedbacks = sessions.filter(s => s.feedbackStatus === 'submitted');
  const scheduleRequests = sessions.filter(s => s.status === 'cancellation_requested' || s.status === 'addition_requested');

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      <DesignEnforcer/>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 space-y-2 pointer-events-none">
        {notifications.map(n=><div key={n.id} className={`backdrop-blur text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 justify-center ${n.type==='error'?'bg-red-500/90':'bg-gray-900/90'}`}>{n.msg}</div>)}
      </div>
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2"><div className="bg-blue-600 p-1.5 rounded-lg text-white"><CheckCircle size={20}/></div><h1 className="text-lg font-bold text-gray-800 hidden md:block">Imperial System</h1></div>
        <div className="flex items-center gap-4"><div className="text-right hidden sm:block"><div className="text-sm font-bold text-gray-900">{currentUser.name}</div><div className="text-xs text-gray-500 capitalize">{currentUser.role}</div></div><button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><LogOut size={20}/></button></div>
      </header>
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        {currentUser.role==='admin' && (
          <div className="space-y-8">
            <div className="flex justify-end gap-2"><Button onClick={()=>setModalType('admin_stats')} variant="secondary" icon={BarChart2}>통계</Button><Button onClick={()=>setModalType('user_manage')} variant="secondary" icon={Settings}>사용자 관리</Button></div>
            
            <Card className="border-purple-200 bg-purple-50/30">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><ClipboardList className="text-purple-600"/> 근무 변경 요청 관리 {scheduleRequests.length > 0 && <span className="bg-red-500 text-white text-xs px-2 rounded-full">{scheduleRequests.length}</span>}</h2>
              {scheduleRequests.length === 0 ? <p className="text-gray-500 text-center py-4 bg-white rounded-lg border border-gray-100">처리할 요청이 없습니다.</p> : (
                <div className="grid gap-3">{scheduleRequests.map(req => (
                  <div key={req.id} className="bg-white border p-4 rounded-lg flex justify-between items-center shadow-sm">
                    <div><div className="flex items-center gap-2 mb-1"><Badge status={req.status}/><span className="font-bold">{req.taName}</span><span className="text-sm text-gray-500">{req.date}</span></div><div className="text-sm text-gray-600">{req.startTime}~{req.endTime}{req.cancelReason && <span className="ml-2 text-red-600 font-medium"> (사유: {req.cancelReason})</span>}</div></div>
                    <Button variant="primary" size="sm" onClick={() => handleApproveRequest(req)}>승인</Button>
                  </div>
                ))}</div>
              )}
            </Card>

            <Card className="bg-blue-50 border-blue-200">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold flex items-center gap-2"><Clock size={18}/> 근무 일괄 설정</h3><select className="border rounded p-1" value={selectedTaIdForSchedule} onChange={e=>setSelectedTaIdForSchedule(e.target.value)}><option value="">조교 선택</option>{users.filter(u=>u.role==='ta').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              <div className="flex gap-2 mb-4"><input type="date" className="border rounded p-1 flex-1" value={batchDateRange.start} onChange={e=>setBatchDateRange({...batchDateRange, start:e.target.value})}/><input type="date" className="border rounded p-1 flex-1" value={batchDateRange.end} onChange={e=>setBatchDateRange({...batchDateRange, end:e.target.value})}/></div>
              <div className="grid grid-cols-7 gap-2 mb-4">{DAYS.map(d=>(<div key={d} className="border rounded p-2 text-center bg-white"><div className="flex justify-between mb-1"><span className="text-xs font-bold">{d}</span><input type="checkbox" checked={defaultSchedule[d].active} onChange={()=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], active: !defaultSchedule[d].active}})}/></div><input type="time" className="w-full text-xs mb-1" value={defaultSchedule[d].start} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], start:e.target.value}})}/><input type="time" className="w-full text-xs" value={defaultSchedule[d].end} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], end:e.target.value}})}/></div>))}</div>
              <Button onClick={handleSaveDefaultSchedule} className="w-full">설정 저장</Button>
            </Card>
            
            <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} setSelectedDateStr={setSelectedDateStr} onAddRequest={onAddRequest} onDelete={deleteSession} onApprove={onApprove} onCancel={onCancel} onFeedback={onFeedback} onWithdrawCancel={handleWithdrawCancelRequest} onUpdateSession={updateSession}/>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t">
              <Card>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><CheckCircle className="text-blue-600"/> 신규 예약 확인 {pendingBookings.length>0&&<span className="bg-red-500 text-white text-xs px-2 rounded-full">{pendingBookings.length}</span>}</h2>
                {pendingBookings.length===0?<p className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">신규 예약 없음</p>:<div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">{pendingBookings.map(s=>(<div key={s.id} className="border-l-4 border-green-500 bg-white shadow-sm rounded-r-lg p-4 flex flex-col gap-2"><div><div className="flex items-center gap-2 mb-1"><span className="font-bold">{s.studentName}</span><span className="text-xs text-gray-500">({s.studentPhone}) → {s.taName}</span></div><div className="text-sm text-gray-600">{s.date} {s.startTime}~{s.endTime}</div><div className="text-xs text-gray-500 mt-1 whitespace-pre-line">{s.topic}<br/><span className="text-gray-400">{s.questionRange}</span></div></div>
                <Button variant="primary" onClick={()=>onApprove(s)}>확인 및 문자발송</Button></div>))}</div>}
              </Card>
              <Card>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><MessageSquare className="text-green-600"/> 피드백 전송 {pendingFeedbacks.length>0&&<span className="bg-red-500 text-white text-xs px-2 rounded-full">{pendingFeedbacks.length}</span>}</h2>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {pendingFeedbacks.map(s=>(<div key={s.id} className="border rounded-lg p-4 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-50"><div className="flex-1"><div className="font-bold mb-1">{s.studentName} 피드백</div><div className="text-sm text-gray-600 mb-2 truncate">{s.feedback}</div><div className="text-xs text-gray-400">작성자: {s.taName}</div></div><Button variant="secondary" onClick={()=>{setSelectedSession(s); setModalType('message_preview_feedback');}}>전송 미리보기</Button></div>))}
                  {pendingFeedbacks.length===0&&<p className="text-gray-500 text-center py-8">대기 중인 피드백 없음</p>}
                </div>
              </Card>
            </div>
          </div>
        )}
        
        {/* 강사 화면 */}
        {currentUser.role==='lecturer' && (
          <div className="space-y-8">
            <div className="bg-white border-b pb-4 mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Eye className="text-blue-600" /> 전체 조교 통합 스케줄 (열람 전용)</h2>
            </div>
            <CalendarView isInteractive={false} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} setSelectedDateStr={setSelectedDateStr} onAddRequest={onAddRequest} onDelete={deleteSession} onApprove={onApprove} onCancel={onCancel} onFeedback={onFeedback} onWithdrawCancel={handleWithdrawCancelRequest} onUpdateSession={updateSession}/>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-6 pt-6 border-t">
              <Card>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><CheckCircle className="text-blue-600" /> 진행 중인 클리닉 신청</h2>
                {pendingBookings.length === 0 ? <p className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">대기 중인 신청 없음</p> : 
                  <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">{pendingBookings.map(session => (
                    <div key={session.id} className="border-l-4 border-green-500 bg-white shadow-sm rounded-r-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          {session.source === 'naver' ? <span className="bg-green-100 text-green-800 text-[10px] font-bold px-1.5 rounded">NAVER</span> : <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 rounded">APP</span>}
                          <span className="font-bold">{session.studentName}</span><span className="text-xs text-gray-500">({session.studentPhone}) → {session.taName}</span>
                        </div>
                        <div className="text-sm text-gray-600">{session.date} {session.startTime}~{session.endTime}</div>
                        <div className="text-xs text-gray-500 mt-1 whitespace-pre-line">{session.topic}<br/><span className="text-gray-400">{session.questionRange}</span></div>
                    </div>
                  ))}</div>
                }
              </Card>
            </div>
          </div>
        )}

        {/* 조교 화면 */}
        {currentUser.role==='ta' && (
          <div className="space-y-6">
            <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex justify-between items-center">
                <div><h2 className="text-lg font-bold mb-1">이번 달 근무 현황 ({currentDate.getMonth() + 1}월)</h2><p className="text-sm opacity-90">{currentUser.name} TA님, 오늘도 화이팅하세요!</p></div>
                <div className="flex gap-6 text-center">
                  <div>
                    <div className="text-3xl font-black">
                      {sessions.filter(s => s.taId === currentUser.id && new Date(s.date).getMonth() === currentDate.getMonth() && s.status === 'completed').length}시간
                    </div>
                    <div className="text-xs opacity-80">클리닉 수행</div>
                  </div>
                  <div className="w-px bg-white/20"></div>
                  <div>
                    <div className="text-3xl font-black">
                      {sessions.filter(s => s.taId === currentUser.id && new Date(s.date).getMonth() === currentDate.getMonth() && (s.status === 'open' || s.status === 'confirmed' || s.status === 'completed')).length}시간
                    </div>
                    <div className="text-xs opacity-80">총 근무 예정</div>
                  </div>
                </div>
              </div>
            </Card>
            <CalendarView isInteractive={true} sessions={sessions} currentUser={currentUser} currentDate={currentDate} setCurrentDate={setCurrentDate} selectedDateStr={selectedDateStr} setSelectedDateStr={setSelectedDateStr} onAddRequest={onAddRequest} onDelete={deleteSession} onApprove={onApprove} onCancel={onCancel} onFeedback={onFeedback} onWithdrawCancel={handleWithdrawCancelRequest} onUpdateSession={updateSession}/>
          </div>
        )}

        {currentUser.role==='student' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="col-span-1"><h3 className="font-bold mb-4">예약 날짜</h3><div className="grid grid-cols-7 text-center text-xs mb-2">{DAYS.map(d=><div key={d}>{d}</div>)}</div><div className="grid grid-cols-7 gap-1">{getDaysInMonth(studentDate).map((d,i)=>{if(!d)return<div key={i}/>;const dStr=formatDate(d);const isSel=dStr===studentSelectedDateStr;const has=sessions.some(s=>s.date===dStr&&s.status==='open');return<button key={i} onClick={()=>setStudentSelectedDateStr(dStr)} className={`aspect-square rounded ${isSel?'bg-blue-600 text-white':'hover:bg-gray-100'} ${has?'font-bold':''}`}>{d.getDate()}</button>})}</div></Card>
            <Card className="lg:col-span-2"><h3 className="font-bold mb-4">{studentSelectedDateStr} 예약</h3><div className="grid grid-cols-2 gap-4">
              {sessions.filter(s=>s.date===studentSelectedDateStr&&s.status==='open').sort((a, b) => a.startTime.localeCompare(b.startTime)).map(s=>(
                <div key={s.id} onClick={()=>{
                  if (studentSelectedSlots.includes(s.id)) {
                    setStudentSelectedSlots(p=>p.filter(id=>id!==s.id));
                  } else {
                    if (studentSelectedSlots.length > 0) {
                      const firstSession = sessions.find(sess => sess.id === studentSelectedSlots[0]);
                      if (firstSession && firstSession.date !== s.date) {
                        addNotification('다른 날짜의 클리닉은 동시에 신청할 수 없습니다.', 'error');
                        return;
                      }
                    }
                    setStudentSelectedSlots(p=>[...p,s.id]);
                  }
                }} className={`border rounded p-4 cursor-pointer relative ${studentSelectedSlots.includes(s.id)?'bg-blue-50 border-blue-500':'hover:bg-gray-50'}`}>
                  {/* 학생 선택 박스 체크 표시 (Fix 4) */}
                  <div className="absolute top-4 right-4">
                    {studentSelectedSlots.includes(s.id) ? <CheckCircle className="text-blue-600 fill-blue-100" size={24} /> : <div className="w-6 h-6 rounded-full border-2 border-gray-300" />}
                  </div>
                  <div className="font-bold text-lg">{s.startTime}~{s.endTime}</div><div className="text-sm text-gray-500">{s.taName} TA</div>
                </div>
              ))}
            </div>{studentSelectedSlots.length>0&&<Button className="w-full mt-4" onClick={()=>setModalType('student_apply')}>{studentSelectedSlots.length}건 예약 신청</Button>}</Card>
          </div>
        )}
      </main>

      <Modal isOpen={modalType==='request_change'} onClose={()=>setModalType(null)} title="근무 취소"><textarea className="w-full border rounded p-3 h-24 mb-4" placeholder="취소 사유" value={requestData.reason} onChange={e=>setRequestData({...requestData, reason:e.target.value})}/><Button onClick={handleRequestCancel} className="w-full">요청 전송</Button></Modal>
      
      {/* 학생 예약 신청 모달 수정 (Fix 5: 라벨 및 예시 추가) */}
      <Modal isOpen={modalType==='student_apply'} onClose={()=>setModalType(null)} title="예약 신청">{applicationItems.map((item,i)=>(<div key={i} className="border rounded p-3 mb-2 bg-gray-50">
        <div className="mb-2"><label className="block text-xs font-bold text-gray-600 mb-1">과목</label><input placeholder="예시 : 미적분1" className="w-full border rounded p-2 text-sm" value={item.subject} onChange={e=>{const n=[...applicationItems];n[i].subject=e.target.value;setApplicationItems(n)}}/></div>
        <div className="flex gap-2">
          <div className="flex-1"><label className="block text-xs font-bold text-gray-600 mb-1">교재</label><input placeholder="예시 : 개념원리" className="w-full border rounded p-2 text-sm" value={item.workbook} onChange={e=>{const n=[...applicationItems];n[i].workbook=e.target.value;setApplicationItems(n)}}/></div>
          <div className="flex-1"><label className="block text-xs font-bold text-gray-600 mb-1">범위</label><input placeholder="p.23-25 #61,62,63" className="w-full border rounded p-2 text-sm" value={item.range} onChange={e=>{const n=[...applicationItems];n[i].range=e.target.value;setApplicationItems(n)}}/></div>
        </div></div>))}<Button variant="secondary" className="w-full mb-2" onClick={()=>setApplicationItems([...applicationItems,{subject:'',workbook:'',range:''}])}><Plus size={16}/> 과목 추가</Button><Button className="w-full" onClick={submitStudentApplication}>신청 완료</Button></Modal>
      
      <Modal isOpen={modalType==='feedback'} onClose={()=>setModalType(null)} title="피드백"><textarea className="w-full border rounded p-2 mb-2 h-20" placeholder="진행 내용" value={feedbackData.clinicContent} onChange={e=>setFeedbackData({...feedbackData, clinicContent:e.target.value})}/><textarea className="w-full border rounded p-2 mb-2 h-20" placeholder="문제점" value={feedbackData.feedback} onChange={e=>setFeedbackData({...feedbackData, feedback:e.target.value})}/><textarea className="w-full border rounded p-2 mb-2 h-20" placeholder="개선 방향" value={feedbackData.improvement} onChange={e=>setFeedbackData({...feedbackData, improvement:e.target.value})}/><Button className="w-full" onClick={handleSubmitFeedback}>저장 완료</Button></Modal>
      <Modal isOpen={modalType==='user_manage'} onClose={()=>setModalType(null)} title="사용자 관리"><div className="flex border-b mb-4">{['ta','student','lecturer'].map(t=><button key={t} className={`flex-1 py-2 font-bold capitalize ${manageTab===t?'text-blue-600 border-b-2 border-blue-600':'text-gray-400'}`} onClick={()=>setManageTab(t)}>{t}</button>)}</div><div className="flex gap-2 mb-4"><input placeholder="이름" className="border rounded p-2 w-1/4" value={newUser.name} onChange={e=>setNewUser({...newUser,name:e.target.value})}/><input placeholder="ID" className="border rounded p-2 w-1/4" value={newUser.userId} onChange={e=>setNewUser({...newUser,userId:e.target.value})}/><input placeholder="PW" className="border rounded p-2 w-1/4" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})}/><Button onClick={()=>createUser({...newUser, role:manageTab})}>추가</Button></div><div className="max-h-[300px] overflow-auto">{users.filter(u=>u.role===manageTab).map(u=>(<div key={u.id} className="flex justify-between p-2 border-b items-center"><div><span className="font-bold">{u.name}</span> <span className="text-gray-500 text-xs">({u.userId})</span></div><button onClick={()=>deleteUserAction(u.id)} className="text-red-500"><Trash2 size={16}/></button></div>))}</div></Modal>
      <Modal isOpen={modalType==='message_preview_confirm'} onClose={()=>setModalType(null)} title="문자 발송"><div className="bg-gray-50 p-4 rounded mb-4 whitespace-pre-wrap text-sm">{selectedSession&&TEMPLATES.confirmParent(selectedSession)}</div><Button className="w-full" onClick={async ()=>{ await updateSession(selectedSession.id, {status:'confirmed'}); setModalType(null); addNotification('발송 완료'); }}>전송 및 확정</Button></Modal>
      <Modal isOpen={modalType==='message_preview_feedback'} onClose={()=>setModalType(null)} title="피드백 발송"><div className="bg-green-50 p-3 rounded text-xs border border-green-200 whitespace-pre-wrap relative cursor-pointer" onClick={()=>copyToClipboard(selectedSession&&TEMPLATES.feedbackParent(selectedSession))}>{selectedSession&&TEMPLATES.feedbackParent(selectedSession)}</div><Button className="w-full mt-4" onClick={async ()=>{ await updateSession(selectedSession.id, {feedbackStatus:'sent'}); setModalType(null); addNotification('발송 완료'); }}>전송 완료 처리</Button></Modal>
      
      {/* 통계 모달 수정 (Fix 1: 날짜 계산 로직 개선) */}
      <Modal isOpen={modalType==='admin_stats'} onClose={()=>setModalType(null)} title="조교 근무 통계">
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
            <span className="font-bold text-gray-700">{currentDate.getFullYear()}년 {currentDate.getMonth()+1}월 근무 현황</span>
            <div className="text-xs text-gray-500">확정(수행) / 전체(오픈)</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="p-2">조교명</th>
                  {[1,2,3,4,5].map(w=><th key={w} className="p-2 text-center">{w}주차</th>)}
                  <th className="p-2 text-center font-bold">월 합계</th>
                </tr>
              </thead>
              <tbody>
                {users.filter(u=>u.role==='ta').map(ta=>{
                  let tConf=0, tSched=0;
                  return (
                    <tr key={ta.id} className="border-b">
                      <td className="p-2 font-medium">{ta.name}</td>
                      {[1,2,3,4,5].map(w=>{
                        const weekSessions = sessions.filter(s=>{
                          const [sy, sm, sd] = s.date.split('-').map(Number);
                          const sDate = new Date(sy, sm-1, sd);
                          return s.taId===ta.id && sy===currentDate.getFullYear() && (sm-1)===currentDate.getMonth() && getWeekOfMonth(sDate)===w;
                        });
                        const conf = weekSessions.filter(s=>s.status==='confirmed'||s.status==='completed').length;
                        const sched = weekSessions.filter(s=>s.status==='open'||s.status==='confirmed'||s.status==='completed').length;
                        tConf+=conf; tSched+=sched;
                        return <td key={w} className="p-2 text-center text-xs">{sched>0?<span className={conf>0?'text-blue-600 font-bold':'text-gray-400'}>{conf}/{sched}</span>:'-'}</td>
                      })}
                      <td className="p-2 text-center font-bold bg-blue-50 text-blue-800">{tConf}/{tSched}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}