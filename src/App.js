/* [서비스 가치] 글로벌 Context 데이터와 컴포넌트 재사용성을 극대화한 SPA 엔트리 포인트.
   (🚀 CTO 패치: Voca 출제/관리 기능 복구 및 CAT 시험 UI 완전 제거) */
import React, { useState, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { 
  Home, Calendar as CalendarIcon, Settings, GraduationCap, 
  LayoutDashboard, LogOut, Menu, X, CheckCircle, Eye, EyeOff, AlertCircle, 
  Video, Loader, CircleDollarSign, Wallet, Printer, BookOpen, User, Brain, Target, Compass, Receipt, PieChart,
  Clock, Trash2, Activity, MessageSquare, Rocket, Phone, Search, ClipboardList, BookText, UserPlus2
} from 'lucide-react';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, setDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'; 
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
 
import { DataProvider, useData } from './contexts/DataContext';

const ClinicDashboard = React.lazy(() => import('./features/ClinicDashboard'));
const ClinicTaskManager = React.lazy(() => import('./features/ClinicTaskManager'));
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
const ScheduleControlTower = React.lazy(() => import('./features/ScheduleControlTower'));
const SettingsManager = React.lazy(() => import('./features/SettingsManager'));
const MessageCenter = React.lazy(() => import('./features/MessageCenter'));
const CollegeNavigator = React.lazy(() => import('./features/CollegeNavigator'));
const AcademyUniverse = React.lazy(() => import('./features/AcademyUniverse'));
const ConsultationManager = React.lazy(() => import('./features/ConsultationManager'));
const VocaManager = React.lazy(() => import('./features/VocaManager'));
const StudentVocaDaily = React.lazy(() => import('./features/StudentVocaDaily'));

const APP_ID = 'imperial-clinic-v1';

const ReportWrapper = () => {
  const { diagnosticId } = useParams();
  return <ExamDiagnosticReport diagnosticId={diagnosticId} />;
};

const SmartSchoolSelect = ({ schoolType, schoolsData, value, onChange, onCustomSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const schools = schoolsData[schoolType] || [];
    const favorites = schoolsData.favorites || [];
    
    const pinned = schools.filter(s => favorites.includes(s) && s.includes(search));
    const others = schools.filter(s => !favorites.includes(s) && s.includes(search));

    return (
        <div className="relative w-2/3">
            <div 
                className={`w-full border-2 p-3 rounded-xl outline-none font-bold text-sm cursor-pointer flex justify-between items-center transition-colors ${isOpen ? 'border-blue-500 bg-blue-50/50' : 'bg-white hover:bg-gray-50'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={value ? "text-blue-900" : "text-gray-400"}>{value || '👇 학교명 검색 및 선택'}</span>
            </div>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute z-50 w-full mt-2 bg-white border-2 border-blue-200 rounded-2xl shadow-2xl max-h-72 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-3 border-b border-gray-100 bg-gray-50/80">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input type="text" autoFocus className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 font-bold text-sm" placeholder="학교명 키워드 검색..." value={search} onChange={e => setSearch(e.target.value)} />
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 custom-scrollbar pb-2">
                            {pinned.length > 0 && (
                                <div className="p-2 bg-yellow-50/40">
                                    <div className="text-[11px] font-black text-yellow-600 mb-1.5 px-2 tracking-tight">📌 자주 찾는 학교</div>
                                    <div className="grid grid-cols-1 gap-1">
                                        {pinned.map(s => (
                                            <div key={s} onClick={() => { onChange(s); setIsOpen(false); setSearch(''); }} className="px-3 py-2.5 hover:bg-white border border-transparent hover:border-yellow-200 hover:shadow-sm rounded-lg cursor-pointer font-bold text-sm text-gray-800 transition-all">{s}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {pinned.length > 0 && <div className="h-1 bg-gray-50 border-y border-gray-100"></div>}
                            <div className="p-2">
                                {others.length === 0 && search && pinned.length === 0 && <div className="text-center py-4 text-xs font-bold text-gray-400">검색 결과가 없습니다.</div>}
                                <div className="grid grid-cols-1 gap-1">
                                    {others.map(s => (
                                        <div key={s} onClick={() => { onChange(s); setIsOpen(false); setSearch(''); }} className="px-3 py-2.5 hover:bg-blue-50 rounded-lg cursor-pointer font-bold text-sm text-gray-700 transition-colors">{s}</div>
                                    ))}
                                    <div onClick={() => { onCustomSelect(); setIsOpen(false); setSearch(''); }} className="px-3 py-2.5 hover:bg-gray-100 rounded-lg cursor-pointer font-bold text-sm text-blue-600 mt-1 border border-dashed border-gray-300 text-center">➕ 목록에 없음 (직접 입력)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const SignUpForm = ({ onCancel, setLoginErrorModal }) => {
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false); 
    const [form, setForm] = useState({ role: 'student', userId: '', password: '', name: '', phone: '', schoolName: '', grade: '1학년', childName: '', subject: '' });
    const [smsAuth, setSmsAuth] = useState({ code: '', input: '', sent: false, verified: false, timer: 0 });
    const [schoolsData, setSchoolsData] = useState({ elementary: [], middle: [], high: [], favorites: [] });
    const [schoolType, setSchoolType] = useState('high'); 
    const [isCustomSchool, setIsCustomSchool] = useState(false); 

    useEffect(() => {
        const fetchSchools = async () => {
            try {
                const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'schools');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) setSchoolsData(docSnap.data());
            } catch (e) { console.error(e); }
        };
        fetchSchools();
    }, []);

    useEffect(() => {
        let interval = null;
        if (smsAuth.timer > 0 && !smsAuth.verified) {
            interval = setInterval(() => { setSmsAuth(prev => ({ ...prev, timer: prev.timer - 1 })); }, 1000);
        } else if (smsAuth.timer === 0 && smsAuth.sent && !smsAuth.verified) {
            setSmsAuth(prev => ({ ...prev, code: '', sent: false }));
            setLoginErrorModal({ isOpen: true, msg: "인증 시간이 만료되었습니다. 다시 시도해주세요." });
        }
        return () => clearInterval(interval);
    }, [smsAuth.timer, smsAuth.sent, smsAuth.verified, setLoginErrorModal]);

    const handleSendAuthCode = async () => {
        const cleanPhone = form.phone.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 10) return setLoginErrorModal({ isOpen: true, msg: '유효한 휴대폰 번호를 입력해주세요.' });
        setLoading(true);
        try {
            const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
            const message = `[목동임페리얼학원]\n회원가입 본인인증 번호는 [${generatedCode}] 입니다. 3분 이내에 입력해주세요.`;
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                phoneNumber: cleanPhone, message: message, status: 'pending', type: 'auth_code', studentName: form.name || '신규가입자', createdAt: serverTimestamp()
            });
            setSmsAuth({ code: generatedCode, input: '', sent: true, verified: false, timer: 180 });
            alert('인증번호가 발송되었습니다.');
        } catch (error) { setLoginErrorModal({ isOpen: true, msg: '인증번호 발송 실패: ' + error.message }); } finally { setLoading(false); }
    };

    const handleVerifyCode = () => {
        if (smsAuth.input === smsAuth.code) { setSmsAuth(prev => ({ ...prev, verified: true })); } 
        else { setLoginErrorModal({ isOpen: true, msg: '인증번호가 일치하지 않습니다.' }); }
    };

    const getGradeOptions = (type) => {
        if (type === 'elementary') return ['1학년','2학년','3학년','4학년','5학년','6학년'];
        if (type === 'middle') return ['1학년','2학년','3학년'];
        return ['1학년','2학년','3학년','N수생'];
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        if (!smsAuth.verified) return setLoginErrorModal({ isOpen: true, msg: '먼저 휴대폰 본인 인증을 완료해주세요.' });
        if (!form.userId || !form.password || !form.name) return setLoginErrorModal({ isOpen: true, msg: '필수 정보를 모두 입력해주세요.' });
        if (form.password.length < 6) return setLoginErrorModal({ isOpen: true, msg: '비밀번호는 6자리 이상이어야 합니다.' });
        if (form.role === 'student' && !form.schoolName) return setLoginErrorModal({ isOpen: true, msg: '학교를 정확히 선택하거나 입력해주세요.' });

        setLoading(true);
        try {
            const safeId = encodeURIComponent(form.userId).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();
            const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', safeId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) { setLoading(false); return setLoginErrorModal({ isOpen: true, msg: '이미 사용 중인 아이디입니다.' }); }

            const cleanPhone = form.phone.replace(/[^0-9]/g, '');
            const payload = { id: safeId, userId: form.userId, name: form.name, phone: cleanPhone, role: form.role, password: form.password, status: 'pending', createdAt: serverTimestamp() };

            if (form.role === 'student') { 
                payload.schoolName = form.schoolName; 
                payload.grade = form.grade; 
                payload.attendancePin = cleanPhone.slice(-4); 
            } else if (form.role === 'parent') { 
                payload.childName = form.childName; 
            } else if (['ta', 'lecturer'].includes(form.role)) { 
                payload.subject = form.subject; 
            }

            await setDoc(docRef, payload);
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                phoneNumber: '01012345678', message: `[시스템 알림] 새로운 가입 승인 대기자가 있습니다.\n- 이름: ${form.name}\n데스크에서 승인해주세요.`, status: 'pending', type: 'system_alert', studentName: '시스템', createdAt: serverTimestamp()
            });
            alert('가입 신청이 완료되었습니다. 데스크 승인 후 로그인 가능합니다.');
            onCancel(); 
        } catch (error) { setLoginErrorModal({ isOpen: true, msg: '오류가 발생했습니다: ' + error.message }); } finally { setLoading(false); }
    };

    return (
        <form onSubmit={handleSignUp} className="space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">시스템 회원가입</h2>
                <button type="button" onClick={onCancel} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">가입 유형</label>
                <select className="w-full border rounded-xl p-3 bg-gray-50 font-bold" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                    <option value="student">학생</option>
                    <option value="parent">학부모</option>
                    <option value="ta">수업조교</option>
                    <option value="admin_assistant">행정조교</option>
                    <option value="lecturer">강사</option>
                </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">이름</label>
                    <input required className="w-full border p-3 rounded-xl bg-gray-50 font-bold" placeholder="실명 입력" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">아이디</label>
                    <input required className="w-full border p-3 rounded-xl bg-gray-50 font-bold" placeholder="영문/숫자" value={form.userId} onChange={e => setForm({...form, userId: e.target.value})} />
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">비밀번호</label>
                <div className="relative">
                    <input required type={showPassword ? "text" : "password"} placeholder="6자리 이상" className="w-full border p-3 rounded-xl bg-gray-50 font-bold" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                    <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                </div>
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                <label className="block text-xs font-bold text-blue-800 flex items-center gap-1"><Phone size={14}/> 휴대폰 본인 인증</label>
                <div className="flex gap-2">
                    <input className="w-full border p-3 rounded-xl font-bold bg-white" placeholder="01012345678 (-없이)" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} disabled={smsAuth.verified} />
                    <button type="button" onClick={handleSendAuthCode} disabled={loading || smsAuth.verified || smsAuth.timer > 0} className="shrink-0 bg-blue-600 text-white rounded-xl font-bold px-4">{smsAuth.timer > 0 ? '재전송' : '인증번호 받기'}</button>
                </div>
                {smsAuth.sent && !smsAuth.verified && (
                    <div className="flex gap-2 animate-in slide-in-from-top-2">
                        <div className="relative w-full">
                            <input className="w-full border-2 border-indigo-200 p-3 rounded-xl font-black text-center tracking-widest bg-white" placeholder="인증번호 6자리" value={smsAuth.input} onChange={e => setSmsAuth({...smsAuth, input: e.target.value})} />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-500 font-bold text-sm flex items-center gap-1"><Clock size={14}/> {Math.floor(smsAuth.timer / 60)}:{String(smsAuth.timer % 60).padStart(2, '0')}</div>
                        </div>
                        <button type="button" onClick={handleVerifyCode} className="shrink-0 bg-indigo-600 text-white rounded-xl font-bold px-4">확인</button>
                    </div>
                )}
                {smsAuth.verified && <div className="text-sm font-bold text-emerald-600 flex items-center gap-1"><CheckCircle size={16}/> 인증이 완료되었습니다.</div>}
            </div>
            {form.role === 'student' && (
                <div className="grid grid-cols-1 gap-3 bg-gray-50 p-3 rounded-xl border">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">학교 정보</label>
                        <div className="flex gap-2 relative">
                            <select className="w-1/3 border-2 p-3 rounded-xl bg-white font-bold text-sm" value={schoolType} onChange={e => { setSchoolType(e.target.value); setForm({...form, schoolName: '', grade: '1학년'}); setIsCustomSchool(false); }}>
                                <option value="elementary">초등학교</option>
                                <option value="middle">중학교</option>
                                <option value="high">고등학교</option>
                            </select>
                            {!isCustomSchool ? (
                                <SmartSchoolSelect schoolType={schoolType} schoolsData={schoolsData} value={form.schoolName} onChange={(val) => setForm({...form, schoolName: val})} onCustomSelect={() => setIsCustomSchool(true)}/>
                            ) : (
                                <div className="w-2/3 relative">
                                    <input required className="w-full border-2 border-blue-300 p-3 rounded-xl bg-white font-bold text-sm pr-8" placeholder="학교명 직접 입력" value={form.schoolName} onChange={e => setForm({...form, schoolName: e.target.value})} />
                                    <button type="button" onClick={() => { setIsCustomSchool(false); setForm({...form, schoolName: ''}); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 bg-white rounded-full"><X size={18}/></button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">학년</label>
                        <select className="w-full border-2 p-3 rounded-xl bg-white font-bold" value={form.grade} onChange={e => setForm({...form, grade: e.target.value})}>
                            {getGradeOptions(schoolType).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>
            )}
            {form.role === 'parent' && (
                <div className="bg-gray-50 p-3 rounded-xl border">
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">자녀 이름</label>
                    <input required className="w-full border-2 p-3 rounded-xl bg-white font-bold" placeholder="데스크 확인용" value={form.childName} onChange={e => setForm({...form, childName: e.target.value})} />
                </div>
            )}
            {['ta', 'lecturer'].includes(form.role) && (
                <div className="bg-gray-50 p-3 rounded-xl border">
                    <label className="block text-xs font-bold text-gray-500 mb-1 ml-1">담당 과목</label>
                    <input className="w-full border-2 p-3 rounded-xl bg-white font-bold" placeholder="예: 수학, 국어" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} />
                </div>
            )}
            <div className="pt-2">
                <button type="submit" disabled={loading || !smsAuth.verified} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-md">
                    {loading ? <Loader className="animate-spin mx-auto" /> : '가입 신청 완료하기'}
                </button>
            </div>
        </form>
    );
};

const LoginView = ({ form, setForm, onLogin, isLoading, loginErrorModal, setLoginErrorModal }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const handleKeyDown = (e) => { if (e.key === 'Enter') onLogin(); };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 border border-gray-100">
        {isSignUpMode ? (
            <SignUpForm onCancel={() => setIsSignUpMode(false)} setLoginErrorModal={setLoginErrorModal} />
        ) : (
            <>
                <div className="text-center mb-8">
                    <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <span className="text-2xl font-bold">I</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Imperial System</h1>
                    <p className="text-gray-500 mt-2">학생과 학부모를 위한 프리미엄 관리</p>
                </div>
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">아이디</label>
                        <input type="text" placeholder="ID를 입력하세요" className="w-full border rounded-xl p-4 bg-gray-50 outline-none focus:border-blue-500 font-bold" value={form.id} onChange={e=>setForm({...form, id:e.target.value})}/>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">비밀번호</label>
                        <div className="relative">
                            <input type={showPassword ? "text" : "password"} placeholder="비밀번호를 입력하세요" className="w-full border rounded-xl p-4 bg-gray-50 outline-none focus:border-blue-500 font-bold" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} onKeyDown={handleKeyDown}/>
                            <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={24} /> : <Eye size={24} />}</button>
                        </div>
                    </div>
                    <button onClick={onLogin} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-md" disabled={isLoading}>
                        {isLoading ? <Loader className="animate-spin mx-auto" /> : '로그인'}
                    </button>
                    <div className="pt-2 text-center border-t border-gray-100">
                        <button type="button" onClick={() => setIsSignUpMode(true)} className="text-sm font-bold text-blue-600 hover:text-blue-800">새로 오셨나요? 회원가입 하기</button>
                    </div>
                </div>
            </>
        )}
      </div>
      {loginErrorModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
            <div className="bg-white p-6 rounded-2xl max-w-sm w-full shadow-2xl text-center space-y-4">
                <div className="bg-red-50 p-4 rounded-full text-red-500 inline-block"><AlertCircle size={48} /></div>
                <h3 className="text-xl font-bold leading-relaxed whitespace-pre-wrap">{loginErrorModal.msg}</h3>
                <button className="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold" onClick={() => setLoginErrorModal({ isOpen: false, msg: '' })}>확인</button>
            </div>
        </div>
      )}
    </div>
  );
};

const Dashboard = ({ currentUser }) => {
    const navigate = useNavigate();
    if (!currentUser) return null;

    const DASHBOARD_CARDS = [
        { path: '/consult', label: '신규 상담 등록', icon: UserPlus2, roles: ['admin', 'admin_assistant', 'lecturer'], desc: '신규 원생 상담 데이터를 입력하고 초기 세팅을 진행합니다.', color: 'text-indigo-600', bg: 'bg-indigo-100', hoverBg: 'group-hover:bg-indigo-600' },
        { path: '/schedule', label: '실시간 운영 현황', icon: Activity, roles: ['admin', 'lecturer', 'admin_assistant'], desc: '오늘의 시간표와 학생들의 등원/지각 현황을 실시간으로 추적합니다.', color: 'text-emerald-600', bg: 'bg-emerald-100', hoverBg: 'group-hover:bg-emerald-600' },
        { path: '/financial-dashboard', label: '재무 대시보드', icon: PieChart, roles: ['admin'], desc: '학원의 자금 흐름을 파악하고 지출결의서를 승인/반려합니다.', color: 'text-blue-600', bg: 'bg-blue-100', hoverBg: 'group-hover:bg-blue-600' },
        { path: '/expense', label: '지출결의 등록', icon: Receipt, roles: ['admin', 'lecturer', 'ta', 'admin_assistant'], desc: '법인카드 및 개인 지출 내역을 등록하고 증빙을 업로드합니다.', color: 'text-teal-600', bg: 'bg-teal-100', hoverBg: 'group-hover:bg-teal-600' },
        { path: '/strategy', label: '내신 연구소', icon: Brain, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'], desc: '학교별 맞춤형 출제 경향과 분석 리포트를 확인하세요.', color: 'text-purple-600', bg: 'bg-purple-100', hoverBg: 'group-hover:bg-purple-600' },
        { path: '/exam-diagnostics', label: '시험 진단 입력', icon: Target, roles: ['admin', 'lecturer', 'admin_assistant'], desc: '학생의 시험 결과를 입력하고 프리미엄 분석 리포트를 생성합니다.', color: 'text-rose-600', bg: 'bg-rose-100', hoverBg: 'group-hover:bg-rose-600' },
        { path: '/my-exams', label: '나의 시험 결과', icon: Target, roles: ['student', 'parent'], desc: '지금까지 치른 시험의 성적과 담당 선생님의 리포트를 확인하세요.', color: 'text-rose-600', bg: 'bg-rose-100', hoverBg: 'group-hover:bg-rose-600' },
        { path: '/navigator', label: '입시 내비게이터', icon: Compass, roles: ['student', 'parent', 'admin', 'admin_assistant'], desc: '목표 대학 및 학과 진학을 위한 성적 분석 및 전략을 수립합니다.', color: 'text-cyan-600', bg: 'bg-cyan-100', hoverBg: 'group-hover:bg-cyan-600' },
        { path: '/clinic', label: '클리닉 센터', icon: CalendarIcon, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'], desc: ['admin', 'admin_assistant'].includes(currentUser.role) ? '학생들의 클리닉 예약을 관리하고 조교 일정을 통제합니다.' : '1:1 맞춤형 학습 클리닉을 예약하고 피드백을 확인합니다.', color: 'text-orange-600', bg: 'bg-orange-100', hoverBg: 'group-hover:bg-orange-600' },
        { path: '/clinic-tasks', label: '오늘의 할 일', icon: ClipboardList, roles: ['admin', 'admin_assistant', 'ta', 'lecturer'], desc: '클리닉/보충 지시를 확인하고 학생들의 미션 수행률을 기록합니다.', color: 'text-yellow-600', bg: 'bg-yellow-100', hoverBg: 'group-hover:bg-yellow-600' },
        { path: '/work-schedule', label: '근무 스케줄', icon: Clock, roles: ['admin_assistant'], desc: '나의 근무 일정을 확인하고 추가/취소를 요청합니다.', color: 'text-lime-600', bg: 'bg-lime-100', hoverBg: 'group-hover:bg-lime-600' },
        { path: '/pickup', label: '픽업 신청', icon: Printer, roles: ['lecturer'], desc: '학생 픽업을 요청하고 관리합니다.', color: 'text-pink-600', bg: 'bg-pink-100', hoverBg: 'group-hover:bg-pink-600' },
        { path: '/lectures', label: ['student', 'parent'].includes(currentUser.role) ? '수강 강의' : '강의 관리', icon: ['student', 'parent'].includes(currentUser.role) ? GraduationCap : Video, roles: ['admin', 'lecturer', 'student', 'parent', 'ta', 'admin_assistant'], desc: ['student', 'parent'].includes(currentUser.role) ? '배정된 강의 진도를 확인하고 영상 학습을 진행하세요.' : '수업 진도와 숙제를 관리하고 강의 영상을 업로드하세요.', color: 'text-fuchsia-600', bg: 'bg-fuchsia-100', hoverBg: 'group-hover:bg-fuchsia-600' },
        { path: '/exams', label: '기출 아카이브', icon: BookOpen, roles: ['admin', 'lecturer', 'ta', 'admin_assistant'], desc: '학교별 기출문제와 분석 자료를 가장 빠르게 확인하세요.', color: 'text-sky-600', bg: 'bg-sky-100', hoverBg: 'group-hover:bg-sky-600' },
        { path: '/voca', label: currentUser.role === 'student' ? '오늘의 영단어' : 'Voca 출제/관리', icon: BookText, roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student'], showCondition: (user) => user.role === 'admin' || user.role === 'admin_assistant' || user.role === 'student' || (['lecturer', 'ta'].includes(user.role) && user.subject === '영어'), desc: currentUser.role === 'student' ? '나만의 맞춤형 단어장과 숨겨진 약점을 투명하게 확인하세요.' : '영단어 시험지를 발급하고 고속 채점을 통해 스탯을 관리합니다.', color: 'text-violet-600', bg: 'bg-violet-100', hoverBg: 'group-hover:bg-violet-600' },
        { path: '/universe', label: '아카데미 유니버스', icon: Rocket, roles: ['student', 'parent', 'admin', 'admin_assistant', 'lecturer', 'ta'], desc: '학원의 다양한 소식과 커뮤니티 랭킹을 확인합니다.', color: 'text-amber-600', bg: 'bg-amber-100', hoverBg: 'group-hover:bg-amber-600' },
        { path: '/messages', label: '통합 메시지 센터', icon: MessageSquare, roles: ['admin', 'admin_assistant'], desc: '성적표, 결제 안내 등 대량 문자를 템플릿으로 발송합니다.', color: 'text-red-600', bg: 'bg-red-100', hoverBg: 'group-hover:bg-red-600' },
        { path: '/users', label: '사용자 관리', icon: User, roles: ['admin', 'admin_assistant'], desc: '학원 구성원(학생, 학부모, 강사 등)의 계정과 권한을 관리합니다.', color: 'text-slate-600', bg: 'bg-slate-100', hoverBg: 'group-hover:bg-slate-600' },
        { path: '/payroll-mgmt', label: '월급 관리', icon: Wallet, roles: ['admin'], desc: '전체 직원의 급여를 정산하고 관리합니다.', color: 'text-stone-600', bg: 'bg-stone-100', hoverBg: 'group-hover:bg-stone-600' },
        { path: '/payroll-check', label: '월급 확인', icon: CircleDollarSign, roles: ['admin', 'ta', 'lecturer', 'admin_assistant'], desc: '이번 달 급여 명세서와 정산 내역을 확인합니다.', color: 'text-stone-600', bg: 'bg-stone-100', hoverBg: 'group-hover:bg-stone-600' },
        { path: '/settings', label: '환경 설정', icon: Settings, roles: ['admin'], desc: '학원 시스템의 전반적인 환경과 코어 데이터를 설정합니다.', color: 'text-zinc-600', bg: 'bg-zinc-100', hoverBg: 'group-hover:bg-zinc-600' },
    ];

    const visibleCards = DASHBOARD_CARDS.filter(card => 
        card.roles.includes(currentUser.role) && 
        (!card.showCondition || card.showCondition(currentUser))
    );

    return (
        <div className="space-y-6 animate-in fade-in pb-10">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8 rounded-3xl shadow-lg flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold mb-2">안녕하세요, {currentUser.name}님! 👋</h1>
                    <p className="opacity-90 text-lg">오늘도 임페리얼 시스템과 함께 효율적인 하루 보내세요.</p>
                </div>
                {['admin', 'admin_assistant', 'lecturer'].includes(currentUser.role) && (
                    <button onClick={() => navigate('/consult')} className="bg-indigo-900/40 text-white border border-indigo-200/30 px-6 py-4 rounded-2xl font-black text-base shadow-lg hover:bg-indigo-900/60 active:scale-95 transition-all flex items-center gap-2">
                        ⚡ 10초 빠른 신규 상담 등록
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {visibleCards.map((card, index) => (
                    <div key={index} onClick={() => navigate(card.path)} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 cursor-pointer group active:scale-95 transition-all flex flex-col h-full">
                        <div className="flex items-center gap-4 mb-3">
                            <div className={`p-3 rounded-xl transition-colors ${card.bg} ${card.color} ${card.hoverBg} group-hover:text-white`}>
                                <card.icon size={28} />
                            </div>
                            <h2 className="text-lg font-bold text-gray-800">{card.label}</h2>
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed flex-1">{card.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AppLayout = ({ currentUser, handleLogout }) => {
  const { users } = useData(); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { path: '/dashboard', label: '대시보드', icon: Home, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'] },
    { path: '/consult', label: '신규 상담 등록', icon: UserPlus2, roles: ['admin', 'admin_assistant', 'lecturer'] },
    { path: '/schedule', label: '실시간 운영 현황', icon: Activity, roles: ['admin', 'lecturer', 'admin_assistant'] }, 
    { path: '/financial-dashboard', label: '재무 대시보드', icon: PieChart, roles: ['admin'] }, 
    { path: '/expense', label: '지출결의 등록', icon: Receipt, roles: ['admin', 'lecturer', 'ta', 'admin_assistant'] },
    { path: '/strategy', label: '내신 연구소', icon: Brain, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'] },
    { path: '/exam-diagnostics', label: '시험 진단 입력', icon: Target, roles: ['admin', 'lecturer', 'admin_assistant'] },
    { path: '/my-exams', label: '나의 시험 결과', icon: Target, roles: ['student', 'parent'] },
    { path: '/navigator', label: '입시 내비게이터', icon: Compass, roles: ['student', 'parent', 'admin', 'admin_assistant'] },
    { path: '/clinic', label: '클리닉 센터', icon: CalendarIcon, roles: ['student', 'parent', 'ta', 'lecturer', 'admin', 'admin_assistant'] },
    { path: '/clinic-tasks', label: '오늘의 할 일', icon: ClipboardList, roles: ['admin', 'admin_assistant', 'ta', 'lecturer'] },
    { path: '/work-schedule', label: '근무 스케줄', icon: Clock, roles: ['admin_assistant'] }, 
    { path: '/pickup', label: '픽업 신청', icon: Printer, roles: ['lecturer'] },
    { 
      path: '/lectures', 
      label: currentUser.role.includes('student') || currentUser.role.includes('parent') ? '수강 강의' : '강의 관리', 
      icon: currentUser.role.includes('student') ? GraduationCap : Video,
      roles: ['admin', 'lecturer', 'student', 'parent', 'ta', 'admin_assistant'] 
    },
    { path: '/exams', label: '기출 아카이브', icon: BookOpen, roles: ['admin', 'lecturer', 'ta', 'admin_assistant'] }, 
    { 
  path: '/voca', 
  // 🚀 [UX/UI 최적화] 역할별로 메뉴 이름을 다르게 보여주어 직관성을 높입니다.
  label: currentUser.role === 'student' ? '오늘의 영단어' : 
         currentUser.role === 'parent' ? 'AI 학습 리포트' : 'Voca 출제/관리', 
  icon: BookText, 
  // 🚀 [접근 권한 추가] parent 권한을 명시적으로 추가합니다.
  roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student', 'parent'], 
  showCondition: (user) => 
    user.role === 'admin' || 
    user.role === 'admin_assistant' || 
    user.role === 'student' || 
    user.role === 'parent' || 
    (['lecturer', 'ta'].includes(user.role) && user.subject === '영어')
},
    { path: '/universe', label: '아카데미 유니버스', icon: Rocket, roles: ['student', 'parent', 'admin', 'admin_assistant', 'lecturer', 'ta'] },
    { path: '/messages', label: '통합 메시지 센터', icon: MessageSquare, roles: ['admin', 'admin_assistant'] }, 
    { path: '/users', label: '사용자 관리', icon: User, roles: ['admin', 'admin_assistant'] }, 
    { path: '/payroll-mgmt', label: '월급 관리', icon: Wallet, roles: ['admin'] },
    { path: '/payroll-check', label: '월급 확인', icon: CircleDollarSign, roles: ['admin', 'ta', 'lecturer', 'admin_assistant'] },
    { path: '/settings', label: '환경 설정', icon: Settings, roles: ['admin'] }, 
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
           {menuItems.filter(item => item.roles.includes(currentUser.role) && (!item.showCondition || item.showCondition(currentUser))).map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
              <button key={item.path} onClick={() => { navigate(item.path); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
                <item.icon size={20} /> {item.label}
              </button>
              );
           })}
        </nav>
        
        <div className="absolute bottom-0 w-full p-4 border-t bg-white shrink-0 z-10">
            <div className="flex items-center gap-3 mb-4 px-2 p-2 rounded-xl border border-transparent">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600 uppercase">{currentUser.name?.[0]}</div>
                <div className="flex flex-col text-left flex-1">
                    <span className="font-bold text-sm text-gray-900 leading-tight">{currentUser.name}</span>
                    <span className="text-xs text-gray-500 uppercase">
                        {currentUser.role === 'admin_assistant' ? 'ADMIN ASSISTANT' : currentUser.role}
                    </span>
                </div>
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
                        <Route path="/consult" element={['admin', 'admin_assistant', 'lecturer'].includes(currentUser.role) ? <ConsultationManager /> : <Navigate to="/dashboard" replace />} />
                        {['admin', 'lecturer', 'admin_assistant'].includes(currentUser.role) && <Route path="/schedule" element={<ScheduleControlTower currentUser={currentUser} />} />}
                        <Route path="/lectures" element={ ['admin', 'admin_assistant'].includes(currentUser.role) ? <AdminLectureManager /> : currentUser.role === 'lecturer' ? <LecturerDashboard currentUser={currentUser} /> : <StudentClassroom currentUser={currentUser} /> } />
                        <Route path="/messages" element={['admin', 'admin_assistant'].includes(currentUser.role) ? <MessageCenter currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/users" element={['admin', 'admin_assistant'].includes(currentUser.role) ? <UserManager currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/settings" element={currentUser.role === 'admin' ? <SettingsManager currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/financial-dashboard" element={currentUser.role === 'admin' ? <FinancialDashboard currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        {['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role) && <Route path="/expense" element={<ExpenseManager currentUser={currentUser} />} />}
                        <Route path="/strategy" element={<SchoolStrategy currentUser={currentUser} />} />
                        <Route path="/clinic" element={<ClinicDashboard currentUser={currentUser} users={users} mode="clinic" />} />
                        <Route path="/clinic-tasks" element={['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role) ? <ClinicTaskManager currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        {currentUser.role === 'admin_assistant' && <Route path="/work-schedule" element={<ClinicDashboard currentUser={currentUser} users={users} mode="work_schedule" />} />}
                        <Route path="/pickup" element={<PickupRequest currentUser={currentUser} />} />
                        {['admin', 'lecturer', 'ta', 'admin_assistant'].includes(currentUser.role) && <Route path="/exams" element={<ExamArchive currentUser={currentUser} />} />}
                        <Route path="/payroll-mgmt" element={<PayrollManager currentUser={currentUser} users={users} viewMode="management" />} />
                        <Route path="/payroll-check" element={<PayrollManager currentUser={currentUser} users={users} viewMode="personal" />} />
                        <Route path="/exam-diagnostics" element={['admin', 'lecturer', 'admin_assistant'].includes(currentUser.role) ? <ExamDiagnosticInput currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/report/:diagnosticId" element={<ReportWrapper />} />
                        <Route path="/my-exams" element={['student', 'parent'].includes(currentUser.role) ? <StudentExamList currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
{/* 🚀 [Zero Trust Security] 권한에 따른 컴포넌트 렌더링 강제 분리 */}
<Route 
  path="/voca" 
  element={
    ['student', 'parent'].includes(currentUser?.role) 
      ? <StudentVocaDaily currentUser={currentUser} /> 
      : <VocaManager currentUser={currentUser} />
  } 
/>
                        <Route path="/navigator" element={['student', 'parent', 'admin', 'admin_assistant'].includes(currentUser.role) ? <CollegeNavigator currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/navigator/:studentId" element={['student', 'parent', 'admin', 'admin_assistant'].includes(currentUser.role) ? <CollegeNavigator currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/universe" element={['student', 'parent', 'admin', 'admin_assistant', 'lecturer', 'ta'].includes(currentUser.role) ? <AcademyUniverse currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                </Suspense>
            </div>
        </main>
      </div>
    </div>
  );
};

const Navigation = () => null;

const AppContent = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ id: '', password: '' });
  const [loginProcessing, setLoginProcessing] = useState(false);
  const [loginErrorModal, setLoginErrorModal] = useState({ isOpen: false, msg: '' });

  const navigate = useNavigate();

  useEffect(() => {
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach(name => caches.delete(name));
      });
    }

    const savedUser = sessionStorage.getItem('imperial_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      if (parsedUser.id && parsedUser.id !== parsedUser.id.toLowerCase()) {
          parsedUser.id = parsedUser.id.toLowerCase();
          sessionStorage.setItem('imperial_user', JSON.stringify(parsedUser));
      }
      setCurrentUser(parsedUser);
    }
    setLoading(false);
  }, []);

  const handleLogin = async () => {
      if (!loginForm.id || !loginForm.password) { setLoginErrorModal({ isOpen: true, msg: '정보를 입력하세요.' }); return; }
      setLoginProcessing(true);
      try {
          const rawId = loginForm.id.trim();
          let loginPassword = loginForm.password;
          if (loginPassword.length < 6) loginPassword = loginPassword.padEnd(6, '0');

          const idVariants = [...new Set([rawId, rawId.normalize('NFC'), rawId.normalize('NFD')])];
          let authUid = null;
          let finalSafeId = null;

          for (const idVariant of idVariants) {
              const safeId = encodeURIComponent(idVariant).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();
              const email = `${safeId}@imperial.com`;
              try {
                  const userCredential = await signInWithEmailAndPassword(auth, email, loginPassword);
                  authUid = userCredential.user.uid;
                  finalSafeId = safeId;
                  break; 
              } catch (authErr) {}
          }

          if (!finalSafeId) { finalSafeId = encodeURIComponent(rawId).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase(); }
          
          try {
              let userDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', finalSafeId);
              let userDoc = await getDoc(userDocRef);
              let docData = null;
              let originalDocId = null; 
              
              if (!userDoc.exists()) {
                  const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), where('userId', '==', rawId));
                  const s = await getDocs(q);
                  if (!s.empty) {
                      userDoc = s.docs[0];
                      docData = userDoc.data();
                      originalDocId = userDoc.id; 
                  }
              } else {
                  docData = userDoc.data();
                  originalDocId = userDoc.id;
              }
              
              if(docData) {
                  if (docData.status === 'pending') {
                      setLoginProcessing(false);
                      return setLoginErrorModal({ isOpen: true, msg: '가입 승인이 대기 중인 계정입니다.\n\n학원 데스크에서 승인을 완료해야 로그인이 가능합니다.' });
                  }

                  if (!authUid && docData.password !== loginForm.password) throw new Error("비밀번호 불일치");

                  const userData = { id: finalSafeId, ...docData, authUid: authUid || docData.authUid };

                  if (originalDocId && originalDocId !== finalSafeId) {
                      setDoc(userDocRef, { ...docData, lastLogin: new Date().toISOString() }, { merge: true })
                         .then(() => {
                             const oldDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', originalDocId);
                             deleteDoc(oldDocRef).catch(e => console.error("Failed to delete old duplicate doc:", e));
                         })
                         .catch(e => console.error("Self-healing failed:", e));
                  } else {
                      updateDoc(userDocRef, { lastLogin: new Date().toISOString() })
                         .catch(e => console.error("Last login update failed:", e));
                  }

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
      try { await signOut(auth); } catch (e) { console.error("Sign Out Error:", e); }
      sessionStorage.removeItem('imperial_user'); 
      setCurrentUser(null); 
      navigate('/'); 
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40} /></div>;
  
  return (
    <Routes>
      <Route path="/kiosk/consult" element={
        <Suspense fallback={<div className="h-screen flex items-center justify-center bg-gray-50"><Loader className="animate-spin text-blue-600" size={40} /></div>}>
          <DataProvider currentUser={{ role: 'admin_assistant', name: '상담용 태블릿 기기' }}>
            <div className="w-full min-h-screen bg-gray-50 p-4 sm:p-6 md:p-10">
              <ConsultationManager isKiosk={true} />
            </div>
          </DataProvider>
        </Suspense>
      } />
      
      <Route path="*" element={
        !currentUser ? (
          <LoginView form={loginForm} setForm={setLoginForm} onLogin={handleLogin} isLoading={loginProcessing} loginErrorModal={loginErrorModal} setLoginErrorModal={setLoginErrorModal} />
        ) : (
          <DataProvider currentUser={currentUser}>
            <AppLayout currentUser={currentUser} handleLogout={handleLogout} />
          </DataProvider>
        )
      } />
    </Routes>
  );
};

const App = () => <Router><AppContent /></Router>;
export default App;