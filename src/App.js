import React, { useState, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { 
  Home, Calendar as CalendarIcon, Settings, PenTool, GraduationCap, 
  LayoutDashboard, LogOut, Menu, X, CheckCircle, Eye, EyeOff, AlertCircle, 
  Bell, Video, Users, Loader, CircleDollarSign, Wallet, Printer, BookOpen, User, Brain, Target, Receipt, PieChart,
  Clock, Trash2 // 🚀 타임시트용 아이콘 추가
} from 'lucide-react';
// 🚀 addDoc, serverTimestamp, deleteDoc, onSnapshot 추가 임포트
import { collection, getDocs, query, where, doc, updateDoc, getDoc, addDoc, serverTimestamp, deleteDoc, onSnapshot } from 'firebase/firestore'; 
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from './firebase'; 

// 기존 컴포넌트 지연 로딩
const ClinicDashboard = React.lazy(() => import('./features/ClinicDashboard'));
const AdminLectureManager = React.lazy(() => import('./features/LectureManager').then(module => ({ default: module.AdminLectureManager })));
const LecturerDashboard = React.lazy(() => import('./features/LectureManager').then(module => ({ default: module.LecturerDashboard })));
const StudentClassroom = React.lazy(() => import('./features/StudentClassroom'));
const UserManager = React.lazy(() => import('./features/UserManager'));
const PayrollManager = React.lazy(() => import('./features/PayrollManager'));
const PickupRequest = React.lazy(() => import('./features/PickupRequest'));
const ExamArchive = React.lazy(() => import('./features/ExamArchive'));
const SchoolStrategy = React.lazy(() => import('./features/SchoolStrategy'));
const ExamDiagnosticInput = React.lazy(() => import('./features/ExamDiagnosticInput'));
const ExamDiagnosticReport = React.lazy(() => import('./features/ExamDiagnosticReport'));
const StudentExamList = React.lazy(() => import('./features/StudentExamList'));
const ExpenseManager = React.lazy(() => import('./features/ExpenseManager'));
const FinancialDashboard = React.lazy(() => import('./features/FinancialDashboard'));

const APP_ID = 'imperial-clinic-v1';

const ReportWrapper = () => {
  const { diagnosticId } = useParams();
  return <ExamDiagnosticReport diagnosticId={diagnosticId} />;
};

const LoginView = ({ form, setForm, onLogin, isLoading, loginErrorModal, setLoginErrorModal }) => {
  const [showPassword, setShowPassword] = useState(false);
  const handleKeyDown = (e) => { if (e.key === 'Enter') onLogin(); };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <span className="text-2xl font-bold">I</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Imperial System</h1>
          <p className="text-gray-500 mt-2">학생과 학부모를 위한 프리미엄 관리</p>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">아이디</label>
            <input type="text" placeholder="ID를 입력하세요" className="w-full border rounded-xl p-4 bg-gray-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" value={form.id} onChange={e=>setForm({...form, id:e.target.value})}/>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">비밀번호</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} placeholder="비밀번호를 입력하세요" className="w-full border rounded-xl p-4 bg-gray-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} onKeyDown={handleKeyDown}/>
              <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
          </div>
          <button onClick={onLogin} className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold transition-all" disabled={isLoading}>
            {isLoading ? <Loader className="animate-spin mx-auto" /> : '로그인'}
          </button>
        </div>
      </div>
      {loginErrorModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white p-6 rounded-2xl max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="bg-red-50 p-4 rounded-full text-red-500"><AlertCircle size={48} /></div>
                    <h3 className="text-xl font-bold">{loginErrorModal.msg}</h3>
                    <button className="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition-colors" onClick={() => setLoginErrorModal({ isOpen: false, msg: '' })}>확인</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const Dashboard = ({ currentUser }) => {
    const navigate = useNavigate();
    if (!currentUser) return null;
    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8 rounded-3xl shadow-lg">
                <h1 className="text-3xl font-bold mb-2">안녕하세요, {currentUser.name}님! 👋</h1>
                <p className="opacity-90 text-lg">오늘도 임페리얼 시스템과 함께 효율적인 하루 보내세요.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {currentUser.role === 'admin' && (
                    <div onClick={() => navigate('/financial-dashboard')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><PieChart size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">재무 대시보드</h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">학원의 자금 흐름을 파악하고 지출결의서를 승인/반려합니다.</p>
                    </div>
                )}

                {/* 🚀 admin_assistant 추가 */}
                {['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role) && (
                    <div onClick={() => navigate('/expense')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-emerald-100 p-3 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors"><Receipt size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">지출결의 등록</h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">법인카드 및 개인 지출 내역을 등록하고 증빙 영수증을 업로드합니다.</p>
                    </div>
                )}

                {/* 🚀 admin_assistant 추가 */}
                {['admin', 'lecturer', 'admin_assistant'].includes(currentUser.role) && (
                    <div onClick={() => navigate('/exam-diagnostics')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-rose-100 p-3 rounded-xl text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors"><Target size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">시험 진단 입력</h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">학생의 시험 결과를 입력하고 학부모 전용 프리미엄 분석 리포트를 즉시 생성합니다.</p>
                    </div>
                )}

                {['student', 'parent'].includes(currentUser.role) && (
                    <div onClick={() => navigate('/my-exams')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors"><Target size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">나의 시험 결과</h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">지금까지 치른 시험의 성적과 담당 선생님의 맞춤 분석 리포트를 확인하세요.</p>
                    </div>
                )}

                <div onClick={() => navigate('/strategy')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><Brain size={32} /></div>
                        <h2 className="text-xl font-bold text-gray-800">내신 연구소</h2>
                    </div>
                    <p className="text-gray-500 leading-relaxed">학교별 맞춤형 출제 경향과 분석 리포트를 확인하세요.</p>
                </div>

                <div onClick={() => navigate('/clinic')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-blue-100 p-3 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><CalendarIcon size={32} /></div>
                        <h2 className="text-xl font-bold text-gray-800">클리닉 센터</h2>
                    </div>
                    <p className="text-gray-500 leading-relaxed">1:1 맞춤형 학습 클리닉을 예약하고 피드백을 확인할 수 있습니다.</p>
                </div>

                {/* 🚀 admin_assistant 추가 */}
                {(['admin', 'lecturer', 'student', 'parent', 'ta', 'admin_assistant'].includes(currentUser.role)) && (
                    <div onClick={() => navigate('/lectures')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-green-100 p-3 rounded-xl text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors"><Video size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">
                                {currentUser.role === 'student' || currentUser.role === 'parent' ? '수강 강의' : '강의 관리'}
                            </h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">{currentUser.role === 'student' || currentUser.role === 'parent' ? '배정된 강의 진도를 확인하고 영상 학습을 진행하세요.' : '수업 진도와 숙제를 관리하고 강의 영상을 업로드하세요.'}</p>
                    </div>
                )}

                {/* 🚀 admin_assistant 추가 */}
                {(['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role)) && (
                    <div onClick={() => navigate('/exams')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-teal-100 p-3 rounded-xl text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors"><BookOpen size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">기출 아카이브</h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">학교별 기출문제와 분석 자료를 가장 빠르게 확인하세요.</p>
                    </div>
                )}

                {currentUser.role === 'admin' && (
                    <div onClick={() => navigate('/payroll-mgmt')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-yellow-100 p-3 rounded-xl text-yellow-600 group-hover:bg-yellow-600 group-hover:text-white transition-colors"><Wallet size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">월급 관리</h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">전체 직원의 급여를 정산하고 관리합니다.</p>
                    </div>
                )}

                {/* 🚀 admin_assistant 추가 */}
                {['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role) && (
                    <div onClick={() => navigate('/payroll-check')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer group active:scale-95 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="bg-purple-100 p-3 rounded-xl text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors"><CircleDollarSign size={32} /></div>
                            <h2 className="text-xl font-bold text-gray-800">월급 확인</h2>
                        </div>
                        <p className="text-gray-500 leading-relaxed">이번 달 급여 명세서와 정산 내역을 확인합니다.</p>
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
  
  // 🚀 조교용 타임시트 상태
  const [isWorkLogModalOpen, setIsWorkLogModalOpen] = useState(false);
  const [workDate, setWorkLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [workHours, setWorkHours] = useState('');
  const [myWorkLogs, setMyWorkLogs] = useState([]);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach(name => caches.delete(name));
      });
    }

    const savedUser = sessionStorage.getItem('imperial_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
      if(!currentUser) return;
      // admin_assistant도 사용자 목록을 받아오도록 추가
      if (['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role)) {
          const fetchUsers = async () => {
              try {
                  const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
                  const s = await getDocs(q); 
                  setUsers(s.docs.map(d => ({id: d.id, ...d.data()})));
              } catch (e) { console.error(e); }
          };
          fetchUsers();
      }
  }, [currentUser]);

  // 🚀 조교 본인의 타임시트 기록 실시간 구독
  useEffect(() => {
    if (isWorkLogModalOpen && currentUser?.role === 'admin_assistant') {
      const today = new Date();
      const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      const monthEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-31`;
      
      const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'work_logs'), 
        where('userId', '==', currentUser.id),
        where('date', '>=', monthStart),
        where('date', '<=', monthEnd)
      );
      
      const unsub = onSnapshot(q, (snap) => {
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => new Date(b.date) - new Date(a.date)); // 최신순 정렬
        setMyWorkLogs(logs);
      });
      return () => unsub();
    }
  }, [isWorkLogModalOpen, currentUser]);

  const handleLogin = async () => {
     if (!loginForm.id || !loginForm.password) { setLoginErrorModal({ isOpen: true, msg: '정보를 입력하세요.' }); return; }
     setLoginProcessing(true);
     try {
         const rawId = loginForm.id.trim();
         
         let loginPassword = loginForm.password;
         if (loginPassword.length < 6) {
             loginPassword = loginPassword.padEnd(6, '0');
         }

         const idVariants = [...new Set([
             rawId, 
             rawId.normalize('NFC'), 
             rawId.normalize('NFD')  
         ])];

         let authUid = null;
         let finalSafeId = null;

         for (const idVariant of idVariants) {
             const safeId = encodeURIComponent(idVariant).replace(/[^a-zA-Z0-9]/g, 'x');
             const email = `${safeId}@imperial.com`;
             try {
                 const userCredential = await signInWithEmailAndPassword(auth, email, loginPassword);
                 authUid = userCredential.user.uid;
                 finalSafeId = safeId;
                 break; 
             } catch (authErr) {
                 // 시도 계속
             }
         }

         if (!finalSafeId) {
             finalSafeId = encodeURIComponent(rawId).replace(/[^a-zA-Z0-9]/g, 'x');
         }
         
         try {
             let userDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', finalSafeId);
             let userDoc = await getDoc(userDocRef);
             
             if (!userDoc.exists()) {
                 const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), where('userId', '==', rawId));
                 const s = await getDocs(q);
                 if (!s.empty) userDoc = s.docs[0];
             }
             
             if(userDoc && userDoc.exists()) {
                 const docData = userDoc.data();
                 
                 if (!authUid && docData.password !== loginForm.password) {
                     throw new Error("비밀번호 불일치 (평문 및 Auth 모두 실패)");
                 }

                 const userData = { id: userDoc.id, ...docData, authUid: authUid || docData.authUid };

                 updateDoc(userDocRef, { lastLogin: new Date().toISOString() }).catch(e => console.error("Update Login Time Error:", e));

                 setCurrentUser(userData);
                 sessionStorage.setItem('imperial_user', JSON.stringify(userData));
                 navigate('/dashboard'); 
             } else { 
                 setLoginErrorModal({ isOpen: true, msg: '로그인 실패: 시스템에 등록된 계정 정보가 없습니다.' }); 
             }
         } catch (dbErr) {
             console.error("Firestore Permission Denied:", dbErr);
             throw new Error("보안 규칙(Zero Trust) 접근 거부");
         }
     } catch (e) { 
         console.error("Login Final Error:", e);
         setLoginErrorModal({ isOpen: true, msg: '로그인 실패: 아이디 또는 비밀번호를 다시 확인해 주세요.' }); 
     } 
     finally { setLoginProcessing(false); }
  };

  const handleLogout = async () => { 
      try {
          await signOut(auth);
      } catch (e) {
          console.error("Sign Out Error:", e);
      }
      sessionStorage.removeItem('imperial_user'); 
      setCurrentUser(null); 
      navigate('/'); 
  };

  // 🚀 타임시트 데이터 조작 함수
  const handleSaveWorkLog = async () => {
    if (!workHours || workHours <= 0) return alert('근무 시간을 정확히 입력해주세요.');
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'work_logs'), {
        userId: currentUser.id,
        userName: currentUser.name,
        date: workDate,
        hours: Number(workHours),
        createdAt: serverTimestamp()
      });
      setWorkHours('');
      alert('근무 기록이 리스트에 추가되었습니다.');
    } catch (err) { alert('저장 실패: ' + err.message); }
  };

  const handleDeleteWorkLog = async (id) => {
    if (window.confirm('이 근무 기록을 삭제하시겠습니까?')) {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'work_logs', id));
    }
  };
  
  const getTodayString = () => new Date().toISOString().split('T')[0];

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40} /></div>;
  if (!currentUser) return <LoginView form={loginForm} setForm={setLoginForm} onLogin={handleLogin} isLoading={loginProcessing} loginErrorModal={loginErrorModal} setLoginErrorModal={setLoginErrorModal} />;

  // 🚀 권한 통제 (menuItems)
  const menuItems = [
    { path: '/dashboard', label: '대시보드', icon: Home, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'] },
    { path: '/financial-dashboard', label: '재무 대시보드', icon: PieChart, roles: ['admin'] }, 
    { path: '/expense', label: '지출결의 등록', icon: Receipt, roles: ['admin', 'lecturer', 'ta', 'admin_assistant'] },
    { path: '/strategy', label: '내신 연구소', icon: Brain, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'] },
    { path: '/exam-diagnostics', label: '시험 진단 입력', icon: Target, roles: ['admin', 'lecturer', 'admin_assistant'] },
    { path: '/my-exams', label: '나의 시험 결과', icon: Target, roles: ['student', 'parent'] },
    { path: '/clinic', label: '클리닉 센터', icon: CalendarIcon, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'] },
    { path: '/pickup', label: '픽업 신청', icon: Printer, roles: ['lecturer'] },
    { path: '/lectures', label: currentUser.role.includes('student') || currentUser.role.includes('parent') ? '수강 강의' : '강의 관리', icon: currentUser.role.includes('student') ? GraduationCap : BookOpen, roles: ['admin', 'lecturer', 'student', 'parent', 'ta', 'admin_assistant'] },
    { path: '/exams', label: '기출 아카이브', icon: BookOpen, roles: ['admin', 'lecturer', 'ta', 'admin_assistant'] }, 
    { path: '/users', label: '사용자 관리', icon: User, roles: ['admin'] },
    { path: '/payroll-mgmt', label: '월급 관리', icon: Wallet, roles: ['admin'] },
    { path: '/payroll-check', label: '월급 확인', icon: CircleDollarSign, roles: ['admin', 'ta', 'lecturer', 'admin_assistant'] },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden w-full">
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}/>}
      
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-300 md:relative md:translate-x-0 flex flex-col ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="p-6 border-b flex justify-between items-center shrink-0">
          <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2"><LayoutDashboard /> Imperial</h1>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"><X /></button>
        </div>
        
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto custom-scrollbar pb-24">
           {menuItems.filter(item => item.roles.includes(currentUser.role)).map((item) => (
              <button key={item.path} onClick={() => { navigate(item.path); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${location.pathname === item.path ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
                <item.icon size={20} /> {item.label}
              </button>
           ))}
        </nav>
        
        {/* 🚀 사이드바 하단 프로필 영역 (조교는 타임시트 팝업 트리거) */}
        <div className="absolute bottom-0 w-full p-4 border-t bg-white shrink-0 z-10">
            <div 
                onClick={() => currentUser.role === 'admin_assistant' && setIsWorkLogModalOpen(true)}
                className={`flex items-center gap-3 mb-4 px-2 p-2 rounded-xl transition-colors ${currentUser.role === 'admin_assistant' ? 'cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-100' : ''}`}
                title={currentUser.role === 'admin_assistant' ? '클릭하여 타임시트 열기' : ''}
            >
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600 uppercase">{currentUser.name?.[0]}</div>
                <div className="flex flex-col text-left flex-1">
                    <span className="font-bold text-sm text-gray-900 leading-tight">{currentUser.name}</span>
                    <span className="text-xs text-gray-500 uppercase">
                        {currentUser.role === 'admin_assistant' ? 'ADMIN ASSISTANT' : currentUser.role}
                    </span>
                </div>
                {currentUser.role === 'admin_assistant' && <Clock size={16} className="text-blue-500 animate-pulse"/>}
            </div>
            <button onClick={handleLogout} className="w-full flex items-center gap-2 text-red-500 hover:bg-red-50 p-2 rounded-lg font-bold transition-colors">
                <LogOut size={16}/> 로그아웃
            </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative min-w-0">
        <header className="md:hidden shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm z-30">
            <div className="flex items-center gap-2">
                <div className="bg-blue-600 text-white w-8 h-8 rounded-lg flex items-center justify-center shadow-sm">
                    <span className="text-base font-bold">I</span>
                </div>
                <h1 className="text-lg font-bold text-gray-900">Imperial</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-all active:scale-95" aria-label="메뉴 열기">
                <Menu size={24} />
            </button>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full bg-gray-50">
            <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-4 md:px-8 py-4 md:py-6 flex flex-col items-stretch">
                <Suspense fallback={<div className="h-full flex items-center justify-center min-h-[50vh]"><Loader className="animate-spin text-blue-600" size={40} /></div>}>
                    <Routes>
                        <Route path="/dashboard" element={<Dashboard currentUser={currentUser} />} />
                        <Route path="/financial-dashboard" element={currentUser.role === 'admin' ? <FinancialDashboard currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        {['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role) && (
                            <Route path="/expense" element={<ExpenseManager currentUser={currentUser} />} />
                        )}
                        <Route path="/strategy" element={<SchoolStrategy currentUser={currentUser} />} />
                        <Route path="/clinic" element={<ClinicDashboard currentUser={currentUser} users={users} />} />
                        <Route path="/pickup" element={<PickupRequest currentUser={currentUser} />} />
                        <Route path="/lectures" element={ currentUser.role === 'admin' ? <AdminLectureManager users={users} /> : currentUser.role === 'lecturer' ? <LecturerDashboard currentUser={currentUser} users={users} /> : <StudentClassroom currentUser={currentUser} /> } />
                        {['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role) && <Route path="/exams" element={<ExamArchive currentUser={currentUser} />} />}
                        <Route path="/users" element={<UserManager currentUser={currentUser} />} />
                        <Route path="/payroll-mgmt" element={<PayrollManager currentUser={currentUser} users={users} viewMode="management" />} />
                        <Route path="/payroll-check" element={<PayrollManager currentUser={currentUser} users={users} viewMode="personal" />} />
                        <Route path="/exam-diagnostics" element={['admin', 'lecturer', 'admin_assistant'].includes(currentUser.role) ? <ExamDiagnosticInput currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/report/:diagnosticId" element={<ReportWrapper />} />
                        <Route path="/my-exams" element={['student', 'parent'].includes(currentUser.role) ? <StudentExamList currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                </Suspense>
            </div>
        </main>
      </div>

      {/* 🚀 조교용 월간 타임시트 팝업 (미래 예정 시간 포함) */}
      {isWorkLogModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col md:flex-row transform animate-in zoom-in-95 h-[80vh] md:h-auto">
            
            {/* 좌측: 신규 입력 폼 */}
            <div className="w-full md:w-1/2 p-6 md:p-8 bg-blue-50 border-b md:border-b-0 md:border-r border-blue-100 flex flex-col shrink-0">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-blue-900 flex items-center gap-2"><Clock size={20}/> 근무/예정 기록</h3>
                <button className="md:hidden" onClick={() => setIsWorkLogModalOpen(false)}><XCircle className="text-blue-300 hover:text-blue-600"/></button>
              </div>
              <div className="space-y-5 flex-1">
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">날짜 (미래 선택 시 '예정' 등록)</label>
                  <input type="date" value={workDate} onChange={(e) => setWorkLogDate(e.target.value)} className="w-full border-2 border-blue-200 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-800 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-800 mb-1">근무 시간 (단위: 시간)</label>
                  <input type="number" step="0.5" placeholder="예: 8 (또는 8.5)" value={workHours} onChange={(e) => setWorkHours(e.target.value)} className="w-full border-2 border-blue-200 p-3 rounded-xl focus:border-blue-500 outline-none font-black text-2xl text-blue-600 bg-white" />
                </div>
                <button onClick={handleSaveWorkLog} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-black shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                  <CheckCircle size={20}/> 리스트에 추가
                </button>
              </div>
            </div>

            {/* 우측: 리스트 뷰 */}
            <div className="w-full md:w-1/2 flex flex-col flex-1 min-h-0 bg-white">
              <div className="p-4 md:p-6 border-b flex justify-between items-center shrink-0">
                <h4 className="font-bold text-sm text-gray-700">이번 달 나의 타임시트</h4>
                <button className="hidden md:block" onClick={() => setIsWorkLogModalOpen(false)}><XCircle className="text-gray-400 hover:text-rose-500 transition-colors"/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 custom-scrollbar">
                {myWorkLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full opacity-50">
                     <Clock size={40} className="mb-2 text-gray-400"/>
                     <p className="text-sm font-bold text-gray-400">기록이 없습니다.</p>
                  </div>
                ) : (
                  myWorkLogs.map(log => {
                    const isFuture = log.date > getTodayString();
                    return (
                      <div key={log.id} className="flex justify-between items-center bg-gray-50 border border-gray-100 p-3 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            {log.date}
                            {isFuture ? <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-black">예정</span> : <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-black">완료</span>}
                          </p>
                          <p className="text-xs text-gray-500 font-semibold">{log.hours}시간 근무</p>
                        </div>
                        <button onClick={() => handleDeleteWorkLog(log.id)} className="text-gray-400 hover:text-rose-500 p-2 rounded-lg transition-colors bg-white border border-gray-200 hover:bg-rose-50"><Trash2 size={14}/></button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
};

const App = () => <Router><AppContent /></Router>;
export default App;