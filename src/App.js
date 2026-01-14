import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle,
  User,
  MessageSquare,
  AlertCircle,
  LogOut,
  Plus,
  X,
  Trash2,
  Settings,
  Edit2,
  Save,
  XCircle,
  PlusCircle,
  ClipboardList,
  Users,
  CheckSquare,
  BarChart2,
  AlertTriangle,
  Undo2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore';

// --- [중요] 디자인 엔진 교체 (Style Loader) ---
// 정적 CSS 대신 Tailwind Play CDN 스크립트를 사용하여 JIT 문법([] 등)을 지원합니다.
const StyleLoader = () => {
  useEffect(() => {
    // 1. Tailwind CSS 최신 스크립트 로드
    const script = document.createElement('script');
    script.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(script);
    
    // 2. 폰트 로드 (Pretendard)
    const font = document.createElement('link');
    font.href = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css";
    font.rel = "stylesheet";
    document.head.appendChild(font);
  }, []);
  
  // 기본 폰트 적용
  return <style>{`body { font-family: 'Pretendard', sans-serif; }`}</style>;
};

// --- Constants & Initial Data ---
const ADMIN_ID = 'imperialsys01';
const CLASSROOMS = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 초기 데이터 (DB가 비어있을 때 한 번만 자동 등록됨)
const SEED_USERS = [
  { role: 'admin', userId: 'imperialsys01', password: '1', name: '행정직원' }, 
  { role: 'ta', userId: 'ta_kim', password: '1', name: '김민성' },
  { role: 'ta', userId: 'ta_oh', password: '1', name: '오혜원' },
  { role: 'ta', userId: 'ta_lee', password: '1', name: '이채연' },
  { role: 'lecturer', userId: 'lec_kim', password: '1', name: '김강사' },
  { role: 'student', userId: 'lee12', password: '1', name: '이원준', phone: '010-1234-5678' },
];

const TEMPLATES = {
  confirmStudent: (data) => `[클리닉 안내]\n일시 : ${data.date} ${data.startTime}~${data.endTime}\n장소 : 목동임페리얼학원 본관 ${data.classroom}`,
  confirmParent: (data) => `[목동임페리얼학원]\n${data.studentName}학생의 클리닉 예정을 안내드립니다.\n\n[클리닉 예정 안내]\n일시 : ${data.date} ${data.startTime}~${data.endTime}\n장소 : 목동임페리얼학원 본관 ${data.classroom}\n내용 : [${data.topic}] 개별 Q&A 클리닉\n\n학생이 직접 시간을 선정하였으며 해당 시간은 선생님과의 개인적인 약속이므로 늦지 않도록 지도해주시면 감사하겠습니다.`,
  feedbackParent: (data) => `[목동임페리얼학원]\n${data.studentName}학생의 클리닉 피드백입니다.\n\n클리닉 진행 조교 : ${data.taName}\n클리닉 진행 내용 : ${data.clinicContent}\n개별 문제점 : ${data.feedback}\n개선 방향 : ${data.improvement || '꾸준한 연습이 필요함'}\n\n감사합니다.`,
};

// --- Firebase Initialization ---
// 실제 배포 시에는 본인의 Firebase 설정값으로 변경해야 합니다.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  // 여기에 Firebase 콘솔에서 복사한 설정을 붙여넣으세요.
  apiKey: "AIzaSyBN0Zy0-GOqN0sB0bTouDohZp7B2zfFjWc",
  authDomain: "imperial-system-1221c.firebaseapp.com",
  projectId: "imperial-system-1221c",
  storageBucket: "imperial-system-1221c.firebasestorage.app",
  messagingSenderId: "414889692060",
  appId: "1:414889692060:web:9b6b89d0d918a74f8c1659"
};

// 앱 초기화 (중복 방지)
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  // 이미 초기화된 경우 무시
}
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'imperial-clinic-v1';

// --- Helper Functions ---
const getDayOfWeek = (dateStr) => DAYS[new Date(dateStr).getDay()];
const getDaysInMonth = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];
  for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
  for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i));
  return days;
};
const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const generateTimeSlots = () => Array.from({ length: 12 }, (_, i) => `${i + 10}:00`);

// --- UI Components ---
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

// --- Main Application ---
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
  const [selectedDateStr, setSelectedDateStr] = useState(formatDate(new Date()));
  
  const [studentDate, setStudentDate] = useState(new Date());
  const [studentSelectedDateStr, setStudentSelectedDateStr] = useState(formatDate(new Date()));
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
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  
  const [selectedTaIdForSchedule, setSelectedTaIdForSchedule] = useState('');
  const [batchDateRange, setBatchDateRange] = useState({ start: '', end: '' });
  const [defaultSchedule, setDefaultSchedule] = useState({
    월: { start: '14:00', end: '22:00', active: false },
    화: { start: '14:00', end: '22:00', active: false },
    수: { start: '14:00', end: '22:00', active: false },
    목: { start: '14:00', end: '22:00', active: false },
    금: { start: '14:00', end: '22:00', active: false },
    토: { start: '10:00', end: '18:00', active: false },
    일: { start: '10:00', end: '18:00', active: false },
  });

  // --- 1. Firebase Auth & Data Sync ---
  useEffect(() => {
    const initAuth = async () => {
      // 실제 환경: __initial_auth_token이 없으므로 익명 로그인 수행
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const unsubUsers = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'users'),
      (snapshot) => {
        const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(usersList);
        
        if (usersList.length === 0) {
          console.log("Seeding initial users...");
          const batch = writeBatch(db);
          SEED_USERS.forEach(userData => {
            const newRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
            batch.set(newRef, userData);
          });
          batch.commit();
        }
      },
      (error) => console.error("Users Sync Error:", error)
    );

    const unsubSessions = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'sessions'),
      (snapshot) => {
        const sessionsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSessions(sessionsList);
        setLoading(false);
      },
      (error) => console.error("Sessions Sync Error:", error)
    );

    return () => {
      unsubUsers();
      unsubSessions();
    };
  }, [authUser]);

  // --- Handlers ---
  const addNotification = (msg, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
  };

  const handleLogin = () => {
    const { id, password } = loginForm;
    const user = users.find(u => u.userId === id && u.password === password);
    if (user) {
      setCurrentUser(user);
      setLoginError('');
      addNotification(`${user.name}님 환영합니다!`);
    } else {
      setLoginError('아이디 또는 비밀번호가 잘못되었습니다.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginForm({ id: '', password: '' });
    setStudentSelectedSlots([]);
    setModalType(null);
  };

  // --- Firestore Actions ---
  const createSession = async (sessionData) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), sessionData);
  };
  const updateSession = async (sessionId, updates) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sessionId), updates);
  };
  const deleteSession = async (sessionId) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sessionId));
  };
  const createUser = async (userData) => {
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), userData);
  };
  const deleteUserAction = async (userId) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userId));
  };

  const handleSaveDefaultSchedule = async () => {
    if (!selectedTaIdForSchedule || !batchDateRange.start || !batchDateRange.end) return;
    const targetTa = users.find(u => u.id === selectedTaIdForSchedule);
    if (!targetTa) return;

    const startDate = new Date(batchDateRange.start);
    const endDate = new Date(batchDateRange.end);
    const batch = writeBatch(db);
    let count = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDate(d);
      const dayName = DAYS[d.getDay()];
      const sched = defaultSchedule[dayName];

      if (sched && sched.active) {
        const startHour = parseInt(sched.start.split(':')[0]);
        const endHour = parseInt(sched.end.split(':')[0]);

        for (let h = startHour; h < endHour; h++) {
          const startTime = `${String(h).padStart(2, '0')}:00`;
          const endTime = `${String(h + 1).padStart(2, '0')}:00`;
          
          const exists = sessions.some(s => s.taId === targetTa.id && s.date === dateStr && s.startTime === startTime);
          
          if (!exists) {
            const newRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'));
            batch.set(newRef, {
              taId: targetTa.id,
              taName: targetTa.name,
              date: dateStr,
              startTime,
              endTime,
              status: 'open',
              source: 'system',
              studentName: '', topic: '', questionRange: '', feedback: '', improvement: '', clinicContent: '', feedbackStatus: 'none', classroom: '',
            });
            count++;
          }
        }
      }
    }
    await batch.commit();
    addNotification(`${count}개의 근무 슬롯이 생성되었습니다.`);
  };

  const handleRequestAdd = async (timeStr) => {
    const [hour] = timeStr.split(':');
    const start = `${hour.padStart(2, '0')}:00`;
    const end = `${String(Number(hour) + 1).padStart(2, '0')}:00`;
    
    await createSession({
      taId: currentUser.id, taName: currentUser.name, date: selectedDateStr, startTime: start, endTime: end,
      status: 'addition_requested', source: 'system', studentName: '', topic: '', questionRange: '', feedback: '', improvement: '', clinicContent: '', feedbackStatus: 'none', classroom: ''
    });
    setModalType(null);
    addNotification('근무 추가 요청 완료');
  };

  const handleRequestCancel = async () => {
    if (!requestData.reason) return addNotification('사유를 입력해주세요', 'error');
    await updateSession(selectedSession.id, { status: 'cancellation_requested', cancelReason: requestData.reason });
    setModalType(null);
    addNotification('취소 요청 완료');
  };

  const submitStudentApplication = async () => {
    const formattedTopic = applicationItems.map(i => i.subject).join(', ');
    const formattedRange = applicationItems.map(i => `${i.workbook} (${i.range})`).join('\n');
    
    const batch = writeBatch(db);
    studentSelectedSlots.forEach(id => {
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', id);
      batch.update(ref, {
        status: 'pending', studentName: currentUser.name, studentPhone: currentUser.phone || '',
        topic: formattedTopic, questionRange: formattedRange, source: 'app'
      });
    });
    await batch.commit();
    setModalType(null);
    setStudentSelectedSlots([]);
    addNotification('신청 완료!');
  };

  const handleSubmitFeedback = async () => {
    await updateSession(selectedSession.id, { ...feedbackData, status: 'completed', feedbackStatus: 'submitted' });
    setModalType(null);
    addNotification('피드백 제출 완료');
  };

  // --- Views ---
  const LoginView = () => (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><CheckCircle size={32} /></div>
          <h1 className="text-2xl font-bold text-gray-800">Imperial System</h1>
          <p className="text-gray-500 mt-2">임페리얼 학원 관리 시스템</p>
        </div>
        <div className="space-y-4">
          <input type="text" placeholder="아이디" className="w-full border rounded-lg p-3" value={loginForm.id} onChange={e => setLoginForm({...loginForm, id: e.target.value})}/>
          <input type="password" placeholder="비밀번호" className="w-full border rounded-lg p-3" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleLogin()}/>
          {loginError && <div className="text-red-500 text-sm text-center font-medium">{loginError}</div>}
          <Button onClick={handleLogin} className="w-full py-3 text-lg">로그인</Button>
        </div>
      </div>
    </div>
  );

  const CalendarView = ({ isInteractive }) => {
    const mySessions = isInteractive ? sessions.filter(s => s.taId === currentUser.id && s.date === selectedDateStr) : sessions.filter(s => s.date === selectedDateStr);
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 min-h-[400px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold flex items-center gap-2"><CalendarIcon size={18} className="text-blue-600"/> 달력</h3>
            <div className="flex gap-2">
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()-1)))} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={20}/></button>
              <span className="font-bold text-lg">{currentDate.getFullYear()}.{currentDate.getMonth()+1}</span>
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()+1)))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={20}/></button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-500 mb-2">{DAYS.map(d=><div key={d}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {getDaysInMonth(currentDate).map((date, i) => {
              if(!date) return <div key={i} className="aspect-square"/>;
              const dStr = formatDate(date);
              const isSel = dStr === selectedDateStr;
              const has = sessions.some(s => s.date === dStr && (isInteractive ? s.taId === currentUser.id : true));
              return (
                <button key={i} onClick={() => setSelectedDateStr(dStr)} className={`aspect-square rounded-lg flex flex-col items-center justify-center relative ${isSel ? 'bg-blue-600 text-white shadow' : 'hover:bg-gray-100'}`}>
                  <span className={`text-sm ${isSel?'font-bold':''}`}>{date.getDate()}</span>
                  {has && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSel?'bg-white':'bg-blue-500'}`}/>}
                </button>
              );
            })}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <h3 className="font-bold text-xl mb-4">{selectedDateStr} 스케줄</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {generateTimeSlots().map((time, idx) => {
              const slots = mySessions.filter(s => s.startTime === time);
              if (slots.length === 0) {
                return isInteractive ? (
                  <div key={idx} className="flex gap-4 items-start group">
                    <div className="w-16 pt-3 text-right text-sm font-medium text-gray-500">{time}</div>
                    <div className="flex-1 border rounded-xl p-3 bg-gray-50 border-dashed flex items-center justify-between min-h-[60px]">
                      <span className="text-xs text-gray-400">근무 없음</span>
                      <Button size="sm" variant="secondary" icon={PlusCircle} onClick={() => { setRequestData({ ...requestData, startTime: time }); setModalType('request_change'); handleRequestAdd(time); }}>추가</Button>
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="flex gap-4 items-start"><div className="w-16 pt-3 text-right text-sm font-medium text-gray-500">{time}</div><div className="flex-1 border rounded-xl p-3 bg-gray-50 min-h-[60px] flex items-center justify-center text-gray-400 text-xs">일정 없음</div></div>
                );
              }
              return (
                <div key={idx} className="flex gap-4 items-start">
                  <div className="w-16 pt-3 text-right text-sm font-medium text-gray-500">{time}</div>
                  <div className="flex-1 space-y-2">
                    {slots.map(s => (
                      <div key={s.id} className={`border rounded-xl p-3 flex flex-col justify-center min-h-[80px] ${s.status === 'confirmed' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex justify-between items-start w-full">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-gray-900">{s.studentName || s.taName}</span>
                              <Badge status={s.status} />
                            </div>
                            <div className="text-sm text-gray-600">{s.topic || (isAdmin ? `${s.taName} 근무` : '예약 대기')}</div>
                          </div>
                          <div className="flex gap-1">
                            {isInteractive && s.status === 'open' && <Button size="sm" variant="danger" icon={XCircle} onClick={()=>{ setSelectedSession(s); setRequestData({type:'cancel', targetTime: `${s.startTime}~${s.endTime}`}); setModalType('request_change'); }}>취소</Button>}
                            {isAdmin && <button onClick={()=>deleteSession(s.id)} className="text-red-400 p-1"><Trash2 size={14}/></button>}
                            {isAdmin && s.status === 'pending' && <Button size="sm" onClick={()=>{setSelectedSession(s); setModalType('message_preview_confirm');}}>승인</Button>}
                            {isInteractive && (s.status === 'confirmed' || s.status === 'completed') && <Button size="sm" variant="success" icon={CheckSquare} onClick={()=>{setSelectedSession(s); setFeedbackData({clinicContent: s.clinicContent||'', feedback: s.feedback||'', improvement: s.improvement||''}); setModalType('feedback');}}>피드백</Button>}
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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={48}/></div>;
  if (!currentUser) return <><StyleLoader/><LoginView /></>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      <StyleLoader />
      <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] space-y-2 w-full max-w-md pointer-events-none px-4">
        {notifications.map(n => (
          <div key={n.id} className={`backdrop-blur text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 justify-center ${n.type==='error'?'bg-red-500/90':'bg-gray-900/90'}`}>
            {n.type==='error'?<AlertTriangle size={16}/>:<CheckCircle size={16} className="text-green-400"/>}{n.msg}
          </div>
        ))}
      </div>

      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white"><CheckCircle size={20}/></div>
          <h1 className="text-lg font-bold text-gray-800 hidden md:block">Imperial System <span className="text-xs font-normal text-gray-500">Cloud</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-gray-900">{currentUser.name}</div>
            <div className="text-xs text-gray-500 capitalize">{currentUser.role}</div>
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        {currentUser.role === 'admin' && (
          <div className="space-y-8">
            <div className="flex justify-end gap-2">
              <Button onClick={() => setModalType('admin_stats')} variant="secondary" icon={BarChart2}>통계</Button>
              <Button onClick={() => setModalType('user_manage')} variant="secondary" icon={Settings}>사용자 관리</Button>
            </div>
            <Card className="bg-blue-50 border-blue-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold flex items-center gap-2"><Clock size={18}/> 근무 일괄 설정</h3>
                <select className="border rounded p-1" value={selectedTaIdForSchedule} onChange={e=>setSelectedTaIdForSchedule(e.target.value)}>
                  <option value="">조교 선택</option>
                  {users.filter(u=>u.role==='ta').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 mb-4">
                <input type="date" className="border rounded p-1 flex-1" value={batchDateRange.start} onChange={e=>setBatchDateRange({...batchDateRange, start:e.target.value})}/>
                <input type="date" className="border rounded p-1 flex-1" value={batchDateRange.end} onChange={e=>setBatchDateRange({...batchDateRange, end:e.target.value})}/>
              </div>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {DAYS.map(d=>(
                  <div key={d} className="border rounded p-2 text-center bg-white">
                    <div className="flex justify-between mb-1"><span className="text-xs font-bold">{d}</span><input type="checkbox" checked={defaultSchedule[d].active} onChange={()=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], active: !defaultSchedule[d].active}})}/></div>
                    <input type="time" className="w-full text-xs mb-1" value={defaultSchedule[d].start} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], start: e.target.value}})}/>
                    <input type="time" className="w-full text-xs" value={defaultSchedule[d].end} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], end: e.target.value}})}/>
                  </div>
                ))}
              </div>
              <Button onClick={handleSaveDefaultSchedule} className="w-full">설정 저장</Button>
            </Card>
            <CalendarView isInteractive={false} />
          </div>
        )}

        {currentUser.role === 'ta' && <CalendarView isInteractive={true} />}
        
        {currentUser.role === 'student' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="col-span-1">
              <h3 className="font-bold mb-4">예약 날짜 선택</h3>
              <div className="grid grid-cols-7 text-center text-xs mb-2">{DAYS.map(d=><div key={d}>{d}</div>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth(studentDate).map((d,i)=>{
                  if(!d) return <div key={i}/>;
                  const dStr = formatDate(d);
                  const isSel = dStr===studentSelectedDateStr;
                  const has = sessions.some(s=>s.date===dStr && s.status==='open');
                  return <button key={i} onClick={()=>setStudentSelectedDateStr(dStr)} className={`aspect-square rounded ${isSel?'bg-blue-600 text-white':'hover:bg-gray-100'} ${has?'font-bold':''}`}>{d.getDate()}</button>
                })}
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <h3 className="font-bold mb-4">{studentSelectedDateStr} 예약 가능 시간</h3>
              <div className="grid grid-cols-2 gap-4">
                {sessions.filter(s=>s.date===studentSelectedDateStr && s.status==='open').map(s=>(
                  <div key={s.id} onClick={()=>{
                    if(studentSelectedSlots.includes(s.id)) setStudentSelectedSlots(p=>p.filter(id=>id!==s.id));
                    else setStudentSelectedSlots(p=>[...p, s.id]);
                  }} className={`border rounded p-4 cursor-pointer ${studentSelectedSlots.includes(s.id)?'bg-blue-50 border-blue-500':'hover:bg-gray-50'}`}>
                    <div className="font-bold text-lg">{s.startTime} ~ {s.endTime}</div>
                    <div className="text-sm text-gray-500">{s.taName} TA</div>
                  </div>
                ))}
              </div>
              {studentSelectedSlots.length > 0 && <Button className="w-full mt-4" onClick={()=>setModalType('student_apply')}>{studentSelectedSlots.length}건 예약 신청</Button>}
            </Card>
          </div>
        )}
      </main>

      {/* Common Modals */}
      <Modal isOpen={modalType==='request_change'} onClose={()=>setModalType(null)} title="근무 취소">
        <textarea className="w-full border rounded p-3 h-24 mb-4" placeholder="취소 사유" value={requestData.reason} onChange={e=>setRequestData({...requestData, reason: e.target.value})}/>
        <Button onClick={handleRequestCancel} className="w-full">요청 전송</Button>
      </Modal>

      <Modal isOpen={modalType==='student_apply'} onClose={()=>setModalType(null)} title="예약 신청">
        {applicationItems.map((item, i) => (
          <div key={i} className="border rounded p-3 mb-2 bg-gray-50">
            <input placeholder="과목 (예: 수1)" className="w-full border rounded p-2 mb-2" value={item.subject} onChange={e=>{const n=[...applicationItems]; n[i].subject=e.target.value; setApplicationItems(n)}}/>
            <div className="flex gap-2">
              <input placeholder="교재" className="w-full border rounded p-2" value={item.workbook} onChange={e=>{const n=[...applicationItems]; n[i].workbook=e.target.value; setApplicationItems(n)}}/>
              <input placeholder="범위" className="w-full border rounded p-2" value={item.range} onChange={e=>{const n=[...applicationItems]; n[i].range=e.target.value; setApplicationItems(n)}}/>
            </div>
          </div>
        ))}
        <Button variant="secondary" className="w-full mb-2" onClick={()=>setApplicationItems([...applicationItems, {subject:'', workbook:'', range:''}])}><Plus size={16}/> 과목 추가</Button>
        <Button className="w-full" onClick={submitStudentApplication}>신청 완료</Button>
      </Modal>

      <Modal isOpen={modalType==='feedback'} onClose={()=>setModalType(null)} title="피드백 작성">
        <textarea className="w-full border rounded p-2 mb-2 h-20" placeholder="진행 내용" value={feedbackData.clinicContent} onChange={e=>setFeedbackData({...feedbackData, clinicContent:e.target.value})}/>
        <textarea className="w-full border rounded p-2 mb-2 h-20" placeholder="문제점" value={feedbackData.feedback} onChange={e=>setFeedbackData({...feedbackData, feedback:e.target.value})}/>
        <textarea className="w-full border rounded p-2 mb-2 h-20" placeholder="개선 방향" value={feedbackData.improvement} onChange={e=>setFeedbackData({...feedbackData, improvement:e.target.value})}/>
        <Button className="w-full" onClick={handleSubmitFeedback}>저장 완료</Button>
      </Modal>

      <Modal isOpen={modalType==='user_manage'} onClose={()=>setModalType(null)} title="사용자 관리">
        <div className="flex border-b mb-4">
          {['ta', 'student', 'lecturer'].map(tab => (
            <button key={tab} className={`flex-1 py-2 font-bold capitalize ${manageTab===tab?'text-blue-600 border-b-2 border-blue-600':'text-gray-400'}`} onClick={()=>setManageTab(tab)}>{tab}</button>
          ))}
        </div>
        <div className="flex gap-2 mb-4">
          <input placeholder="이름" className="border rounded p-2 w-1/4" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})}/>
          <input placeholder="ID" className="border rounded p-2 w-1/4" value={newUser.userId} onChange={e=>setNewUser({...newUser, userId: e.target.value})}/>
          <input placeholder="PW" className="border rounded p-2 w-1/4" value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})}/>
          <Button onClick={()=>createUser({...newUser, role: manageTab, id: Date.now().toString()})}>추가</Button>
        </div>
        <div className="max-h-[300px] overflow-auto">
          {users.filter(u=>u.role===manageTab).map(u=>(
            <div key={u.id} className="flex justify-between p-2 border-b items-center">
              <div><span className="font-bold">{u.name}</span> <span className="text-gray-500 text-xs">({u.userId})</span></div>
              <button onClick={()=>deleteUserAction(u.id)} className="text-red-500"><Trash2 size={16}/></button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal isOpen={modalType==='message_preview_confirm'} onClose={()=>setModalType(null)} title="문자 발송">
        <div className="bg-gray-50 p-4 rounded mb-4 whitespace-pre-wrap text-sm">{selectedSession && TEMPLATES.confirmParent(selectedSession)}</div>
        <Button className="w-full" onClick={async ()=>{ await updateSession(selectedSession.id, {status:'confirmed'}); setModalType(null); addNotification('발송 완료'); }}>전송 및 확정</Button>
      </Modal>
    </div>
  );
}