/* [서비스 가치] 글로벌 Context 데이터와 컴포넌트 재사용성을 극대화한 SPA 엔트리 포인트.
   (🚀 CTO 패치: 아이콘 참조 에러(Reference Error)로 인한 백지 화면(WSOD)을 원천 차단하기 위해 
    import 목록과 변수 사용을 100% 동기화하고 가장 안정적인 코어 아이콘으로 교체했습니다.) */

import React, { useState, Suspense, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

// 🚀 [CTO 패치] 에러의 원인이었던 아이콘 Import 누락을 완벽히 해결한 100% 동기화 리스트
import { 
  Home, Calendar as CalendarIcon, Settings, LayoutDashboard, LogOut, Menu, X, CheckCircle, Eye, EyeOff, AlertCircle, 
  Video, Loader, DollarSign, Briefcase, Printer, BookOpen, User, Target, Compass, FileText, Activity,
  Clock, Trash2, MessageSquare, Globe, Phone, Search, Clipboard, Book, Users, Star, ArrowRight, ChevronDown, ChevronRight,
  PieChart
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
const AttendanceManager = React.lazy(() => import('./features/AttendanceManager'));
const SettingsManager = React.lazy(() => import('./features/SettingsManager'));
const MessageCenter = React.lazy(() => import('./features/MessageCenter'));
const CollegeNavigator = React.lazy(() => import('./features/CollegeNavigator'));
const AcademyUniverse = React.lazy(() => import('./features/AcademyUniverse'));
const ConsultationManager = React.lazy(() => import('./features/ConsultationManager'));
const VocaManager = React.lazy(() => import('./features/VocaManager'));
const StudentVocaDaily = React.lazy(() => import('./features/StudentVocaDaily'));
const VocaChallenge = React.lazy(() => import('./features/VocaChallenge'));

const APP_ID = 'imperial-clinic-v1';

// 🚀 [CTO 아키텍처] 대시보드와 사이드바(SNB)를 동기화시키는 중앙 마스터 데이터
// (참조 에러 방지를 위해 반드시 위에서 import된 아이콘만 사용합니다.)
const MENU_GROUPS = [
    {
        title: "교무 및 출결 관제",
        description: "클리닉 예약, 출결 현황 및 교실 공간을 관리합니다.",
        theme: "from-blue-600 to-indigo-700",
        items: [
            { name: "신규 상담 등록", path: "/consult", icon: User, desc: "신규 원생 상담 데이터를 입력합니다.", roles: ['admin', 'admin_assistant', 'lecturer'] },
            { name: "통합 출결 관리", path: "/attendance", icon: User, desc: "일별 출결 관제 및 교실 매트릭스", roles: ['admin', 'admin_assistant', 'lecturer'] },
            { name: "클리닉 센터", path: "/clinic", icon: CalendarIcon, desc: "1:N 클리닉 배정 및 예약 현황", roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student', 'parent'] },
            { name: "오늘의 할 일", path: "/clinic-tasks", icon: Clipboard, desc: "조교 업무 지시 및 진행률 트래킹", roles: ['admin', 'admin_assistant', 'ta', 'lecturer'] },
            { name: "픽업 신청", path: "/pickup", icon: Printer, desc: "학생 픽업을 요청하고 관리합니다.", roles: ['lecturer'] }
        ]
    },
    {
        title: "학습 및 수강",
        description: "학생들의 성적, 수업, 학습 자료를 관리합니다.",
        theme: "from-emerald-600 to-teal-700",
        items: [
            { name: "강의 관리", studentName: "수강 강의", path: "/lectures", icon: Video, studentIcon: BookOpen, desc: "수업 진도, 숙제 관리 및 영상 시청", roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student', 'parent'] },
            { name: "내신 연구소", path: "/strategy", icon: Activity, desc: "학교별 맞춤형 출제 경향 및 리포트", roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student', 'parent'] },
            { name: "기출 아카이브", path: "/exams", icon: BookOpen, desc: "학교별 기출문제 은행", roles: ['admin', 'admin_assistant', 'lecturer', 'ta'] },
            { name: "Voca 출제/관리", studentName: "오늘의 영단어", path: "/voca", icon: Book, desc: "맞춤형 단어장 및 고속 채점 시스템", roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student', 'parent'], condition: (u) => !['lecturer', 'ta'].includes(u?.role) || u?.subject === '영어' },
            { name: "영단어 챌린지", path: "/voca-challenge", icon: Star, desc: "게이미피케이션 기반 단어 암기", roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student'] },
            { name: "시험 진단 입력", path: "/exam-diagnostics", icon: Target, desc: "시험 결과를 입력하고 리포트 생성", roles: ['admin', 'admin_assistant', 'lecturer'] },
            { name: "나의 시험 결과", path: "/my-exams", icon: Target, desc: "성적표 및 담당 선생님 리포트", roles: ['student', 'parent'] },
            { name: "입시 내비게이터", path: "/navigator", icon: Compass, desc: "성적 추이 분석 및 목표 대학 전략", roles: ['admin', 'admin_assistant', 'student', 'parent'] }
        ]
    },
    {
        title: "재무 및 행정",
        description: "수납, 급여, 시스템 설정을 관리합니다.",
        theme: "from-amber-500 to-orange-600",
        items: [
            { name: "재무 대시보드", path: "/financial-dashboard", icon: PieChart, desc: "자금 흐름 파악 및 결재 승인", roles: ['admin'] },
            { name: "지출결의 등록", path: "/expense", icon: FileText, desc: "지출 내역 등록 및 증빙 업로드", roles: ['admin', 'admin_assistant', 'lecturer', 'ta'] },
            { name: "월급 정산 관리", path: "/payroll-mgmt", icon: Briefcase, desc: "전체 직원의 급여 정산 및 관리", roles: ['admin'] },
            { name: "내 월급 확인", path: "/payroll-check", icon: DollarSign, desc: "이번 달 급여 명세서 확인", roles: ['admin', 'admin_assistant', 'lecturer', 'ta'] },
            { name: "사용자 관리", path: "/users", icon: Users, desc: "모든 계정 승인 및 권한 관리", roles: ['admin', 'admin_assistant'] }
        ]
    },
    {
        title: "학원 생활 및 시스템",
        description: "알림, 메시지, 스케줄을 확인합니다.",
        theme: "from-slate-700 to-slate-900",
        items: [
            { name: "아카데미 유니버스", path: "/universe", icon: Globe, desc: "학원 소식 및 커뮤니티 랭킹", roles: ['admin', 'admin_assistant', 'lecturer', 'ta', 'student', 'parent'] },
            { name: "통합 메시지 센터", path: "/messages", icon: MessageSquare, desc: "알림톡/SMS 발송 및 관리", roles: ['admin', 'admin_assistant'] },
            { name: "근무 스케줄", path: "/work-schedule", icon: Clock, desc: "나의 근무 일정 확인 및 변경 요청", roles: ['admin_assistant'] },
            { name: "환경 설정", path: "/settings", icon: Settings, desc: "학원 시스템 코어 데이터 설정", roles: ['admin'] }
        ]
    }
];

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
        
        if (['student', 'parent'].includes(form.role) && !form.schoolName) return setLoginErrorModal({ isOpen: true, msg: '학교를 정확히 선택하거나 입력해주세요.' });
        if (form.role === 'parent' && !form.childName) return setLoginErrorModal({ isOpen: true, msg: '자녀 이름을 입력해주세요.' });
        if (['ta', 'lecturer'].includes(form.role) && !form.subject) return setLoginErrorModal({ isOpen: true, msg: '담당 과목을 선택해주세요.' });

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
                payload.schoolName = form.schoolName; 
                payload.grade = form.grade;           
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

            {['student', 'parent'].includes(form.role) && (
                <div className="grid grid-cols-1 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    {form.role === 'parent' && (
                        <div className="mb-2">
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">자녀 이름</label>
                            <input required className="w-full border-2 border-gray-200 focus:border-blue-400 outline-none p-3 rounded-xl bg-white font-bold transition-colors" placeholder="자녀 실명 입력" value={form.childName} onChange={e => setForm({...form, childName: e.target.value})} />
                            <p className="text-[11px] text-rose-500 font-bold ml-1 mt-1.5">* 2명 이상의 자녀가 재원 중인 경우, 가입 후 데스크에 문의 바랍니다.</p>
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">{form.role === 'parent' ? '자녀 학교 정보' : '학교 정보'}</label>
                        <div className="flex gap-2 relative">
                            <select className="w-1/3 border-2 border-gray-200 p-3 rounded-xl bg-white font-bold text-sm outline-none focus:border-blue-400 transition-colors" value={schoolType} onChange={e => { setSchoolType(e.target.value); setForm({...form, schoolName: '', grade: '1학년'}); setIsCustomSchool(false); }}>
                                <option value="elementary">초등학교</option>
                                <option value="middle">중학교</option>
                                <option value="high">고등학교</option>
                            </select>
                            {!isCustomSchool ? (
                                <SmartSchoolSelect schoolType={schoolType} schoolsData={schoolsData} value={form.schoolName} onChange={(val) => setForm({...form, schoolName: val})} onCustomSelect={() => setIsCustomSchool(true)}/>
                            ) : (
                                <div className="w-2/3 relative">
                                    <input required className="w-full border-2 border-blue-400 p-3 rounded-xl bg-white font-bold text-sm pr-8 outline-none" placeholder="학교명 직접 입력" value={form.schoolName} onChange={e => setForm({...form, schoolName: e.target.value})} />
                                    <button type="button" onClick={() => { setIsCustomSchool(false); setForm({...form, schoolName: ''}); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-white rounded-full p-1 transition-colors"><X size={16}/></button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">{form.role === 'parent' ? '자녀 학년' : '학년'}</label>
                        <select className="w-full border-2 border-gray-200 focus:border-blue-400 outline-none p-3 rounded-xl bg-white font-bold transition-colors" value={form.grade} onChange={e => setForm({...form, grade: e.target.value})}>
                            {getGradeOptions(schoolType).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                </div>
            )}

            {['ta', 'lecturer'].includes(form.role) && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">담당 과목</label>
                    <select required className="w-full border-2 border-gray-200 focus:border-blue-400 outline-none p-3 rounded-xl bg-white font-bold transition-colors" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})}>
                        <option value="" disabled hidden>과목을 선택해주세요</option>
                        <option value="영어">영어 (English)</option>
                        <option value="수학">수학 (Math)</option>
                        <option value="국어">국어 (Korean)</option>
                        <option value="과학">과학 (Science)</option>
                        <option value="기타">기타 (Others)</option>
                    </select>
                </div>
            )}

            <div className="pt-2">
                <button type="submit" disabled={loading || !smsAuth.verified} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50">
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
    const { loadingData } = useData() || { loadingData: false }; 

    const authorizedGroups = useMemo(() => {
        if (!currentUser?.role) return [];

        return MENU_GROUPS.map(group => {
            const authorizedItems = group.items.filter(item => {
                if (item.path === '/voca' && ['lecturer', 'ta'].includes(currentUser.role) && currentUser.subject !== '영어') {
                    return false;
                }
                const hasRole = item.roles.includes(currentUser.role);
                const passCondition = item.condition ? item.condition(currentUser) : true;
                return hasRole && passCondition;
            });
            return { ...group, items: authorizedItems };
        }).filter(group => group.items.length > 0);
    }, [currentUser]);

    if (loadingData || !currentUser) {
        return (
            <div className="flex flex-col justify-center items-center h-[70vh] animate-pulse">
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-bold">나만의 대시보드를 구성 중입니다...</p>
            </div>
        );
    }

    const getWelcomeMessage = () => {
        switch (currentUser.role) {
            case 'admin': return "오늘도 임페리얼 학원의 성장을 이끌어주세요.";
            case 'lecturer': return "선생님의 열정적인 강의를 응원합니다.";
            case 'ta': return "원생들의 든든한 멘토가 되어주셔서 감사합니다.";
            case 'admin_assistant': return "완벽한 학원 운영을 위한 컨트롤 타워입니다.";
            case 'parent': return "자녀의 학습 현황과 성장을 한눈에 확인하세요.";
            case 'student': return "오늘도 목표를 향해 힘차게 달려볼까요?";
            default: return "환영합니다.";
        }
    };

    return (
        <div className="max-w-screen-2xl mx-auto space-y-8 animate-in fade-in pb-20">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-[32px] p-8 md:p-10 shadow-2xl relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px]"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <span className="inline-block px-3 py-1 bg-white/10 border border-white/20 text-white text-xs font-black rounded-full mb-3">
                            {currentUser.role.toUpperCase()} MODE
                        </span>
                        <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">
                            안녕하세요, {currentUser.name}님! 👋
                        </h1>
                        <p className="text-indigo-200 font-medium text-base md:text-lg">
                            {getWelcomeMessage()}
                        </p>
                    </div>
                    {['admin', 'admin_assistant', 'lecturer'].includes(currentUser.role) && (
                        <button onClick={() => navigate('/consult')} className="bg-indigo-600 text-white hover:bg-indigo-500 font-black px-6 py-4 rounded-2xl flex items-center gap-2 shadow-lg transition-all active:scale-95 whitespace-nowrap">
                            ⚡ 10초 빠른 신규 상담 등록
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-10">
                {authorizedGroups.map((group, gIdx) => (
                    <section key={gIdx} className="space-y-4">
                        <div className="flex items-end gap-3 px-2">
                            <h2 className="text-xl font-black text-slate-800">{group.title}</h2>
                            <p className="text-sm font-bold text-slate-400 hidden md:block pb-0.5">{group.description}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
                            {group.items.map((item, iIdx) => {
                                // 🚀 방탄 렌더링: 아이콘 누락 시 기본값 적용
                                const IconObj = (item.studentIcon && ['student', 'parent'].includes(currentUser.role)) ? item.studentIcon : item.icon;
                                const SafeIcon = IconObj || Activity;
                                const displayLabel = (item.studentName && ['student', 'parent'].includes(currentUser.role)) ? item.studentName : item.name;

                                return (
                                    <button
                                        key={iIdx}
                                        onClick={() => navigate(item.path)}
                                        className="group relative bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 text-left flex flex-col justify-between h-40 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 overflow-hidden"
                                    >
                                        <div className={`absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br ${group.theme} opacity-5 rounded-full group-hover:scale-150 transition-transform duration-500`}></div>
                                        
                                        <div className="relative z-10">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br ${group.theme} text-white shadow-md group-hover:scale-110 transition-transform duration-300`}>
                                                <SafeIcon size={24} />
                                            </div>
                                            <h3 className="font-black text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">
                                                {displayLabel}
                                            </h3>
                                        </div>
                                        
                                        <div className="relative z-10 flex justify-between items-end w-full mt-2">
                                            <p className="text-xs font-bold text-slate-500 leading-relaxed pr-4 line-clamp-2">
                                                {item.desc}
                                            </p>
                                            <ArrowRight size={18} className="text-slate-300 group-hover:text-indigo-600 transform group-hover:translate-x-1 transition-all shrink-0" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};

const AppLayout = ({ currentUser, handleLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const groupedMenus = useMemo(() => {
      const groups = {};
      MENU_GROUPS.forEach(group => {
          const items = group.items.filter(item => {
              const hasRole = item.roles.includes(currentUser.role);
              const passCondition = item.condition ? item.condition(currentUser) : true;
              return hasRole && passCondition;
          });
          
          if (items.length > 0) {
              groups[group.title] = items.map(item => ({
                  path: item.path,
                  label: (item.studentName && ['student', 'parent'].includes(currentUser.role)) ? item.studentName : item.name,
                  icon: (item.studentIcon && ['student', 'parent'].includes(currentUser.role)) ? item.studentIcon : item.icon,
              }));
          }
      });
      return groups;
  }, [currentUser]);

  const [expandedCategories, setExpandedCategories] = useState({});
  useEffect(() => {
      const initials = {};
      Object.keys(groupedMenus).forEach(cat => initials[cat] = true);
      setExpandedCategories(initials);
  }, [groupedMenus]);

  const toggleCategory = (category) => {
      setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden w-full">
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}/>}
      
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-300 md:relative md:translate-x-0 flex flex-col ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
        <div className="p-6 border-b flex justify-between items-center shrink-0">
          <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2"><LayoutDashboard /> Imperial</h1>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"><X /></button>
        </div>
        
        <nav className="p-3 space-y-4 flex-1 overflow-y-auto custom-scrollbar pb-24">
            <button 
                onClick={() => { navigate('/dashboard'); setIsSidebarOpen(false); }} 
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${location.pathname === '/dashboard' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'}`}
            >
                <Home size={20} /> 대시보드 홈
            </button>

            {Object.entries(groupedMenus).map(([category, items]) => (
                <div key={category} className="space-y-1">
                    <button 
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between px-4 py-2 text-xs font-black text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        {category}
                        {expandedCategories[category] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                    </button>
                    
                    {expandedCategories[category] && (
                        <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                            {items.map((item) => {
                                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                                // 🚀 방탄 렌더링: 사이드바 아이콘 에러 차단
                                const SafeIcon = item.icon || Activity;
                                return (
                                    <button 
                                        key={item.path} 
                                        onClick={() => { navigate(item.path); setIsSidebarOpen(false); }} 
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${isActive ? 'bg-blue-50 text-blue-600 font-bold shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        <SafeIcon size={18} className={isActive ? 'text-blue-600' : 'text-gray-400'} /> 
                                        <span className="text-sm">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </nav>
        
        <div className="absolute bottom-0 w-full p-4 border-t bg-white shrink-0 z-10">
            <div className="flex items-center gap-3 mb-4 px-2 p-2 rounded-xl border border-transparent">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600 uppercase">{currentUser?.name?.[0] || 'U'}</div>
                <div className="flex flex-col text-left flex-1">
                    <span className="font-bold text-sm text-gray-900 leading-tight">{currentUser?.name || '사용자'}</span>
                    <span className="text-xs text-gray-500 uppercase">
                        {currentUser?.role === 'admin_assistant' ? 'ADMIN ASSISTANT' : currentUser?.role}
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
                        
                        {['admin', 'lecturer', 'admin_assistant'].includes(currentUser.role) && <Route path="/attendance" element={<AttendanceManager currentUser={currentUser} />} />}
                        
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

                        <Route path="/voca" element={
                            ['student', 'parent'].includes(currentUser.role) 
                                ? <StudentVocaDaily currentUser={currentUser} /> 
                                : <VocaManager currentUser={currentUser} />
                        } />

                        <Route path="/voca-challenge" element={['student', 'admin', 'admin_assistant', 'lecturer', 'ta'].includes(currentUser.role) ? <VocaChallenge currentUser={currentUser} /> : <Navigate to="/dashboard" replace />} />

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