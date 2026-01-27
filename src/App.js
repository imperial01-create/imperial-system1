import React, { useState, useEffect, Suspense } from 'react';
import { 
  Home, Calendar as CalendarIcon, Settings, PenTool, GraduationCap, 
  LayoutDashboard, LogOut, Menu, X, CheckCircle, Eye, EyeOff, AlertCircle, Bell, Video, Users
} from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { auth, db } from './firebase';
import { Button, Card, Modal, LoadingSpinner } from './components/UI';

const APP_ID = 'imperial-clinic-v1';

// Lazy Load Features
const ClinicDashboard = React.lazy(() => import('./features/ClinicDashboard'));
const AdminLectureManager = React.lazy(() => import('./features/LectureManager').then(module => ({ default: module.AdminLectureManager })));
const LecturerDashboard = React.lazy(() => import('./features/LectureManager').then(module => ({ default: module.LecturerDashboard })));
const StudentClassroom = React.lazy(() => import('./features/StudentClassroom'));
const UserManager = React.lazy(() => import('./features/UserManager')); // [신규]

// --- Login Component ---
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
              <input type={showPassword ? "text" : "password"} placeholder="비밀번호를 입력하세요" className="w-full border border-gray-200 rounded-xl p-4 text-lg bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-all pr-12" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} onKeyDown={e=>e.key==='Enter'&&onLogin()}/>
              <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={24} /> : <Eye size={24} />}</button>
            </div>
          </div>
          <Button onClick={onLogin} className="w-full py-4 text-lg shadow-lg shadow-blue-200 mt-2" disabled={isLoading}>{isLoading ? <LoadingSpinner /> : '로그인'}</Button>
        </div>
      </div>
      <Modal isOpen={loginErrorModal.isOpen} onClose={() => setLoginErrorModal({ isOpen: false, msg: '' })} title="로그인 실패">
        <div className="flex flex-col items-center text-center space-y-4 pt-2">
          <div className="bg-red-50 p-4 rounded-full text-red-500 mb-2"><AlertCircle size={48} /></div>
          <h3 className="text-xl font-bold text-gray-900">{loginErrorModal.msg}</h3>
          <Button className="w-full mt-4" onClick={() => setLoginErrorModal({ isOpen: false, msg: '' })}>확인</Button>
        </div>
      </Modal>
    </div>
  );
};

// --- Dashboard Component ---
const Dashboard = ({ currentUser, setActiveTab }) => {
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-none p-8">
                <h1 className="text-3xl font-bold mb-2">안녕하세요, {currentUser.name}님! 👋</h1>
                <p className="opacity-90 text-lg">오늘도 임페리얼 시스템과 함께 효율적인 하루 보내세요.</p>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div onClick={() => setActiveTab('clinic')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group">
                    <div className="flex items-center gap-4 mb-4"><div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><CalendarIcon size={32} /></div><h2 className="text-xl font-bold text-gray-800">클리닉 센터</h2></div>
                    <p className="text-gray-500 leading-relaxed">1:1 맞춤형 학습 클리닉을 예약하고<br/>피드백을 확인할 수 있습니다.</p>
                </div>
                {/* [수정] 학부모(parent)도 강의실 접근 가능 (읽기 전용) */}
                {(currentUser.role === 'admin' || currentUser.role === 'lecturer' || currentUser.role === 'student' || currentUser.role === 'parent') && (
                    <div onClick={() => setActiveTab(currentUser.role === 'admin' ? 'lecture_mgmt' : (currentUser.role === 'student' || currentUser.role === 'parent' ? 'my_classes' : 'lectures'))} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group">
                        <div className="flex items-center gap-4 mb-4"><div className="bg-green-100 p-3 rounded-xl text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Video size={32} /></div><h2 className="text-xl font-bold text-gray-800">{currentUser.role === 'student' || currentUser.role === 'parent' ? '수강 강의' : '강의 관리'}</h2></div>
                        <p className="text-gray-500 leading-relaxed">{currentUser.role === 'student' || currentUser.role === 'parent' ? '배정된 강의 진도를 확인하고\n영상 학습을 진행하세요.' : '수업 진도와 숙제를 관리하고\n강의 영상을 업로드하세요.'}</p>
                    </div>
                )}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-4 mb-4"><div className="bg-purple-100 p-3 rounded-xl text-purple-600"><Bell size={32} /></div><h2 className="text-xl font-bold text-gray-800">공지사항</h2></div>
                    <p className="text-gray-500 leading-relaxed">현재 등록된 공지사항이 없습니다.<br/>(시스템 정상 운영 중)</p>
                </div>
            </div>
        </div>
    );
};

// --- Main App Shell ---
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [loginProcessing, setLoginProcessing] = useState(false);
  const [loginErrorModal, setLoginErrorModal] = useState({ isOpen: false, msg: '' });

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

  useEffect(() => {
      if(!currentUser) return;
      if (currentUser.role === 'admin' || currentUser.role === 'lecturer') {
          const cachedUsers = localStorage.getItem('cached_users');
          if (cachedUsers) setUsers(JSON.parse(cachedUsers));
          
          const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
          getDocs(q).then(s => {
              const u = s.docs.map(d => ({id: d.id, ...d.data()}));
              if (JSON.stringify(u) !== cachedUsers) {
                  setUsers(u);
                  localStorage.setItem('cached_users', JSON.stringify(u));
              }
          });
      }
  }, [currentUser]);

  const handleLogin = async () => {
     setLoginProcessing(true);
     const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), where('userId', '==', loginForm.id), where('password', '==', loginForm.password));
     const s = await getDocs(q);
     if(!s.empty) {
         const userData = { id: s.docs[0].id, ...s.docs[0].data() };
         setCurrentUser(userData);
         sessionStorage.setItem('imperial_user', JSON.stringify(userData));
         setActiveTab('dashboard');
     } else {
         setLoginErrorModal({ isOpen: true, msg: '아이디 또는 비밀번호가 일치하지 않습니다.' });
     }
     setLoginProcessing(false);
  };

  if (loading) return <LoadingSpinner />;
  if (!currentUser) return <LoginView form={loginForm} setForm={setLoginForm} onLogin={handleLogin} isLoading={loginProcessing} loginErrorModal={loginErrorModal} setLoginErrorModal={setLoginErrorModal} />;

  const navItems = [
      { id: 'dashboard', label: '대시보드', icon: Home, roles: ['admin', 'ta', 'lecturer', 'student', 'parent'] },
      { id: 'user_mgmt', label: '사용자 관리', icon: Users, roles: ['admin'] }, // [신규] 사용자 관리 메뉴
      { id: 'clinic', label: '클리닉 센터', icon: CalendarIcon, roles: ['admin', 'ta', 'lecturer', 'student', 'parent'] },
      { id: 'lecture_mgmt', label: '강의 관리', icon: Settings, roles: ['admin'] },
      { id: 'lectures', label: '강의 관리', icon: PenTool, roles: ['lecturer'] },
      { id: 'my_classes', label: '수강 강의', icon: GraduationCap, roles: ['student', 'parent'] },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-6 border-b flex justify-between items-center"><h1 className="text-xl font-bold text-blue-600 flex items-center gap-2"><LayoutDashboard /> Imperial</h1><button className="md:hidden" onClick={()=>setIsSidebarOpen(false)}><X size={24}/></button></div>
            <nav className="p-4 space-y-2">
                {navItems.filter(item => item.roles.includes(currentUser.role)).map(item => (
                    <button key={item.id} onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium ${activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}><item.icon size={20} /> {item.label}</button>
                ))}
            </nav>
            <div className="absolute bottom-0 w-full p-4 border-t">
                <div className="flex items-center gap-3 mb-4 px-2"><div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-500">{currentUser.name[0]}</div><div><div className="font-bold text-sm">{currentUser.name}</div><div className="text-xs text-gray-500 uppercase">{currentUser.role}</div></div></div>
                <button onClick={()=>{sessionStorage.removeItem('imperial_user'); window.location.reload();}} className="w-full flex items-center gap-2 text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold"><LogOut size={16}/> 로그아웃</button>
            </div>
        </aside>
        <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
            <header className="bg-white border-b p-4 flex items-center gap-3 md:hidden sticky top-0 z-30"><button onClick={()=>setIsSidebarOpen(true)}><Menu size={24}/></button><h1 className="text-lg font-bold">Imperial System</h1></header>
            <main className="p-4 md:p-8 flex-1 overflow-y-auto">
                <Suspense fallback={<LoadingSpinner />}>
                    {activeTab === 'dashboard' && <Dashboard currentUser={currentUser} setActiveTab={setActiveTab} />}
                    {activeTab === 'user_mgmt' && <UserManager currentUser={currentUser} />}
                    {/* [수정] 학부모도 ClinicDashboard에 접근 가능 */}
                    {activeTab === 'clinic' && <ClinicDashboard currentUser={currentUser} users={users} />}
                    {activeTab === 'lecture_mgmt' && <AdminLectureManager users={users} />}
                    {activeTab === 'lectures' && <LecturerDashboard currentUser={currentUser} users={users} />}
                    {/* [수정] 학부모도 StudentClassroom에 접근 가능 */}
                    {activeTab === 'my_classes' && <StudentClassroom currentUser={currentUser} />}
                </Suspense>
            </main>
        </div>
    </div>
  );
}