import React, { useState, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, Calendar as CalendarIcon, Settings, PenTool, GraduationCap, 
  LayoutDashboard, LogOut, Menu, X, CheckCircle, Eye, EyeOff, AlertCircle, 
  Bell, Video, Users, Loader, CircleDollarSign, Wallet, Printer, BookOpen, User, Brain
} from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore'; 
import { auth, db } from './firebase'; 
import { LoadingSpinner } from './components/UI';

const ClinicDashboard = React.lazy(() => import('./features/ClinicDashboard'));
const AdminLectureManager = React.lazy(() => import('./features/LectureManager').then(module => ({ default: module.AdminLectureManager })));
const LecturerDashboard = React.lazy(() => import('./features/LectureManager').then(module => ({ default: module.LecturerDashboard })));
const StudentClassroom = React.lazy(() => import('./features/StudentClassroom'));
const UserManager = React.lazy(() => import('./features/UserManager'));
const PayrollManager = React.lazy(() => import('./features/PayrollManager'));
const PickupRequest = React.lazy(() => import('./features/PickupRequest'));
const ExamArchive = React.lazy(() => import('./features/ExamArchive'));
const SchoolStrategy = React.lazy(() => import('./features/SchoolStrategy'));

const APP_ID = 'imperial-clinic-v1';

const LoginView = ({ form, setForm, onLogin, isLoading, loginErrorModal, setLoginErrorModal }) => {
  const [showPassword, setShowPassword] = useState(false);
  const handleKeyDown = (e) => { if (e.key === 'Enter') onLogin(); };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 md:p-10 border border-gray-100">
        <div className="text-center mb-8">
          <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <span className="text-2xl font-bold">I</span>
          </div>
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
              <input type={showPassword ? "text" : "password"} placeholder="비밀번호를 입력하세요" className="w-full border border-gray-200 rounded-xl p-4 text-lg bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-all pr-12" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} onKeyDown={handleKeyDown}/>
              <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
          </div>
          <button onClick={onLogin} className="w-full py-4 text-lg bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200 mt-2 hover:bg-blue-700 transition-all disabled:opacity-50" disabled={isLoading}>
            {isLoading ? <Loader className="animate-spin mx-auto" /> : '로그인'}
          </button>
        </div>
      </div>
      {loginErrorModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl max-w-sm w-full mx-4 shadow-2xl">
                <div className="flex flex-col items-center text-center space-y-4 pt-2">
                    <div className="bg-red-50 p-4 rounded-full text-red-500 mb-2"><AlertCircle size={48} /></div>
                    <h3 className="text-xl font-bold text-gray-900">{loginErrorModal.msg}</h3>
                    <button className="w-full mt-4 py-3 bg-gray-100 rounded-xl font-bold text-gray-700 hover:bg-gray-200" onClick={() => setLoginErrorModal({ isOpen: false, msg: '' })}>확인</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const Dashboard = ({ currentUser }) => {
    const navigate = useNavigate();

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-none p-8 rounded-3xl shadow-lg">
                <h1 className="text-3xl font-bold mb-2">안녕하세요, {currentUser.name}님! 👋</h1>
                <p className="opacity-90 text-lg">오늘도 임페리얼 시스템과 함께 효율적인 하루 보내세요.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div onClick={() => navigate('/strategy')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><Brain size={32} /></div>
                        <h2 className="text-xl font-bold text-gray-800">내신 전략 리포트</h2>
                    </div>
                    <p className="text-gray-500 leading-relaxed">학교별 맞춤형 출제 경향과<br/>분석 리포트를 확인하세요.</p>
                </div>

                <div onClick={() => navigate('/clinic')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><CalendarIcon size={32} /></div>
                        <h2 className="text-xl font-bold text-gray-800">클리닉 센터</h2>
                    </div>
                    <p className="text-gray-500 leading-relaxed">1:1 맞춤형 학습 클리닉을 예약하고<br/>피드백을 확인할 수 있습니다.</p>
                </div>

                {(['admin', 'lecturer', 'student', 'parent'].includes(currentUser.role)) && (
                    <div onClick={() => navigate('/lectures')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-green-100 p-3 rounded-xl text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Video size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">
                                {currentUser.role === 'student' || currentUser.role === 'parent' ? '수강 강의' : '강의 관리'}
                            </h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">
                            {currentUser.role === 'student' || currentUser.role === 'parent' 
                                ? '배정된 강의 진도를 확인하고\n영상 학습을 진행하세요.' 
                                : '수업 진도와 숙제를 관리하고\n강의 영상을 업로드하세요.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

const AppContent = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [users, setUsers] = useState([]); 

  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [loginProcessing, setLoginProcessing] = useState(false);
  const [loginErrorModal, setLoginErrorModal] = useState({ isOpen: false, msg: '' });

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 5000);
    const initAuth = async () => { try { await signInAnonymously(auth); } catch (e) { console.error(e); setLoading(false); } };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        clearTimeout(safetyTimeout);
        if(user) {
             const saved = sessionStorage.getItem('imperial_user');
             if(saved) setCurrentUser(JSON.parse(saved));
        }
        setLoading(false);
    });
    return () => { unsubscribe(); clearTimeout(safetyTimeout); };
  }, []);

  useEffect(() => {
      if(!currentUser) return;
      const shouldFetchUsers = ['admin', 'lecturer', 'ta'].includes(currentUser.role);
      
      if (shouldFetchUsers) {
          const fetchUsers = async () => {
              try {
                  const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
                  const snapshot = await getDocs(q); 
                  const userList = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                  setUsers(userList);
              } catch (e) { console.error("User Fetch Error", e); }
          };
          fetchUsers();
      }
  }, [currentUser]);

  const handleLogin = async () => {
     if (!loginForm.id || !loginForm.password) {
         setLoginErrorModal({ isOpen: true, msg: '아이디와 비밀번호를 모두 입력해주세요.' });
         return;
     }
     setLoginProcessing(true);
     try {
         const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), where('userId', '==', loginForm.id), where('password', '==', loginForm.password));
         const s = await getDocs(q);
         if(!s.empty) {
             const userData = { id: s.docs[0].id, ...s.docs[0].data() };
             setCurrentUser(userData);
             sessionStorage.setItem('imperial_user', JSON.stringify(userData));
             navigate('/dashboard'); 
         } else {
             setLoginErrorModal({ isOpen: true, msg: '아이디 또는 비밀번호가 일치하지 않습니다.' });
         }
     } catch (e) { setLoginErrorModal({ isOpen: true, msg: '오류 발생: ' + e.message }); } finally { setLoginProcessing(false); }
  };

  const handleLogout = () => { sessionStorage.removeItem('imperial_user'); setCurrentUser(null); navigate('/'); };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="animate-spin text-blue-600" size={40} />
    </div>
  );

  if (!currentUser) return <LoginView form={loginForm} setForm={setLoginForm} onLogin={handleLogin} isLoading={loginProcessing} loginErrorModal={loginErrorModal} setLoginErrorModal={setLoginErrorModal} />;

  const menuItems = [
    { path: '/dashboard', label: '대시보드', icon: Home, roles: ['student', 'parent', 'ta', 'lecturer', 'admin'] },
    { path: '/strategy', label: '내신 전략 리포트', icon: Brain, roles: ['student', 'parent', 'ta', 'lecturer', 'admin'] },
    { path: '/clinic', label: '클리닉 센터', icon: CalendarIcon, roles: ['student', 'parent', 'ta', 'lecturer', 'admin'] },
    { path: '/pickup', label: '픽업 신청', icon: Printer, roles: ['lecturer'] },
    { path: '/lectures', label: currentUser.role === 'student' || currentUser.role === 'parent' ? '수강 강의' : '강의 관리', icon: currentUser.role === 'student' || currentUser.role === 'parent' ? GraduationCap : BookOpen, roles: ['admin', 'lecturer', 'student', 'parent'] },
    { path: '/exams', label: '기출 아카이브', icon: BookOpen, roles: ['admin', 'lecturer', 'ta'] }, 
    { path: '/users', label: '사용자 관리', icon: User, roles: ['admin'] },
    { path: '/payroll-mgmt', label: '월급 관리', icon: Wallet, roles: ['admin'] },
    { path: '/payroll-check', label: '월급 확인', icon: CircleDollarSign, roles: ['admin', 'ta', 'lecturer'] },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)}/>}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2"><LayoutDashboard /> Imperial</h1>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-500"><X size={24} /></button>
        </div>
        <nav className="p-4 space-y-2">
           {menuItems.filter(item => item.roles.includes(currentUser.role)).map((item) => (
              <button key={item.path} onClick={() => { navigate(item.path); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${location.pathname === item.path ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                <item.icon size={20} /> {item.label}
              </button>
           ))}
        </nav>
        <div className="absolute bottom-0 w-full p-4 border-t">
            <button onClick={handleLogout} className="w-full flex items-center gap-2 text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold"><LogOut size={16}/> 로그아웃</button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto w-full min-w-0">
           <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
            <Suspense fallback={<Loader className="animate-spin text-blue-600" />}>
                <Routes>
                    <Route path="/dashboard" element={<Dashboard currentUser={currentUser} />} />
                    <Route path="/strategy" element={<SchoolStrategy currentUser={currentUser} />} />
                    <Route path="/clinic" element={<ClinicDashboard currentUser={currentUser} users={users} />} />
                    <Route path="/pickup" element={<PickupRequest currentUser={currentUser} />} />
                    <Route path="/lectures" element={ currentUser.role === 'admin' ? <AdminLectureManager users={users} /> : currentUser.role === 'lecturer' ? <LecturerDashboard currentUser={currentUser} users={users} /> : <StudentClassroom currentUser={currentUser} /> } />
                    {(['admin', 'lecturer', 'ta'].includes(currentUser.role)) && <Route path="/exams" element={<ExamArchive currentUser={currentUser} />} />}
                    <Route path="/users" element={<UserManager currentUser={currentUser} />} />
                    <Route path="/payroll-mgmt" element={<PayrollManager currentUser={currentUser} users={users} viewMode="management" />} />
                    <Route path="/payroll-check" element={<PayrollManager currentUser={currentUser} users={users} viewMode="personal" />} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </Suspense>
           </div>
      </main>
    </div>
  );
};
const App = () => <Router><AppContent /></Router>;
export default App;