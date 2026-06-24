/* [서비스 가치(Service Value)] 프리미엄 상담 스케줄 & 온보딩 통합 센터
   🚀 CTO 패치: 
   1. 대형 캘린더 뷰(Monthly Calendar) 탑재: 월간 상담 일정을 한눈에 파악하여 데스크의 스케줄링 인지 부하를 줄이고 병목을 예방합니다.
   2. 동적 상담자 배정: 시스템의 실제 직원(admin, lecturer 등) 데이터를 연동하여 드롭다운으로 제공, 오기입을 방지하고 책임 소재를 명확히 합니다.
   3. Firebase 비용 최적화: 현재 보고 있는 '월(Month)'의 상담 데이터만 쿼리하여 Read 비용을 방어합니다. */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Calendar, Clock, UserPlus, Users, Phone, Edit2, XCircle, 
    CheckCircle, AlertCircle, Loader, MessageSquare, BookOpen, Calculator, Languages, FlaskConical, Sparkles,
    ChevronLeft, ChevronRight, Check
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp, addDoc, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Modal, Button, Badge, Card, Toast } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// 업무 시간 슬롯 생성
const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => {
    const hour = Math.floor(i / 2) + 13;
    const min = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${min}`;
});

export default function ConsultationManager({ isKiosk = false }) {
    // 🚀 전역 Context에서 유저 목록(users)도 가져옵니다.
    const { currentUser, users = [], loadingData } = useData() || {};
    const [mainTab, setMainTab] = useState('schedule');
    const isMounted = useRef(true);

    // =========================================================================
    // 1. [기능 A] 대형 캘린더 및 상담 스케줄 관제 상태 모음
    // =========================================================================
    const [consultations, setConsultations] = useState([]);
    const [isScheduleLoading, setIsScheduleLoading] = useState(true);
    const [criticalError, setCriticalError] = useState('');
    
    // 캘린더 상태 (현재 보고 있는 연도/월, 선택된 날짜)
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);
    
    // 모달 및 폼 상태
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [scheduleErrorMsg, setScheduleErrorMsg] = useState('');
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);

    // 🚀 실제 시스템 직원 목록 필터링 (상담 가능자)
    const availableStaff = useMemo(() => {
        return users.filter(u => ['admin', 'admin_assistant', 'lecturer', 'ta'].includes(u.role));
    }, [users]);

    const initialScheduleForm = {
        id: '', type: 'new', studentName: '', parentPhone: '', date: selectedDate, time: '15:00',
        consultantId: currentUser?.id || '', notes: ''
    };
    const [scheduleForm, setScheduleForm] = useState(initialScheduleForm);

    // 🚀 [비용 최적화] 현재 '월'을 기준으로 시작일과 종료일을 계산하여 해당 월의 데이터만 가져옵니다.
    useEffect(() => {
        isMounted.current = true;
        setIsScheduleLoading(true);
        
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        
        // 이전 달의 마지막 며칠부터 다음 달의 첫 며칠까지 (달력 뷰에 보이는 영역 전체)
        const startDate = new Date(year, month, 1);
        startDate.setDate(startDate.getDate() - startDate.getDay()); // 달력 첫 주 일요일
        
        const endDate = new Date(year, month + 1, 0);
        endDate.setDate(endDate.getDate() + (6 - endDate.getDay())); // 달력 마지막 주 토요일

        const pad = (n) => String(n).padStart(2, '0');
        const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
        const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;

        const q = query(
            collection(db, `artifacts/${APP_ID}/public/data/consultations`), 
            where('date', '>=', startStr),
            where('date', '<=', endStr)
        );
        
        const unsub = onSnapshot(q, 
            (snap) => {
                if (isMounted.current) {
                    setConsultations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setCriticalError('');
                    setIsScheduleLoading(false);
                }
            },
            (error) => {
                console.error("Consultation fetching error:", error);
                if (isMounted.current) {
                    setCriticalError('데이터베이스 접근 권한이 없거나 네트워크 오류가 발생했습니다.');
                    setIsScheduleLoading(false);
                }
            }
        );

        return () => { isMounted.current = false; unsub(); };
    }, [currentMonth]); // 달이 바뀔 때마다 다시 쿼리

    // --- 캘린더 생성 로직 ---
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        
        const days = [];
        // 이전 달 빈 칸
        for (let i = 0; i < firstDay; i++) {
            days.push({ empty: true, key: `empty-start-${i}` });
        }
        // 현재 달 날짜
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            // 해당 날짜의 스케줄 개수 및 내역
            const dayConsults = consultations.filter(c => c.date === dateStr);
            days.push({ empty: false, date: i, fullDate: dateStr, consults: dayConsults, key: dateStr });
        }
        // 다음 달 빈 칸 (격자 맞추기)
        const remainingCells = 42 - days.length; // 6주 * 7일 = 42칸 기준
        for (let i = 0; i < remainingCells; i++) {
            days.push({ empty: true, key: `empty-end-${i}` });
        }
        return days;
    }, [currentMonth, consultations]);

    const changeMonth = (offset) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const getDisplayTime = (dateStr, timeStr) => {
        const hour = parseInt(timeStr.split(':')[0]);
        const min = timeStr.split(':')[1];
        const ampm = hour >= 12 ? '오후' : '오전';
        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        return `${dateStr} ${ampm} ${displayHour}:${min}`;
    };

    const sendConsultationSMS = async (type, data, customTime = null) => {
        if (data.type !== 'new' || !data.parentPhone) return;
        const cleanPhone = data.parentPhone.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 10) return;

        const displayTime = getDisplayTime(data.date, customTime || data.time);
        const staff = availableStaff.find(u => u.id === data.consultantId);
        const staffName = staff ? staff.name : '학원 관계자';
        let message = '';

        if (type === 'created') message = `[목동임페리얼학원]\n안녕하세요. 목동임페리얼학원입니다.\n\n${data.studentName} 학생의 상담이 ${displayTime}로 예약되었습니다.\n\n해당 시간에 [${staffName}] 선생님이 배정되었으며, 상담 일정변경 또는 궁금하신 사항은 언제든 연락주시기를 바랍니다.\n\n[목동임페리얼학원]\n☎ 대표전화 : 02-2644-1178\n◆ 대표메일 : imperialsys01@naver.com`;
        else if (type === 'cancelled') message = `[목동임페리얼학원]\n안녕하세요. 목동임페리얼학원입니다.\n\n${data.studentName} 학생의 ${displayTime} 상담예약이 취소되었습니다.\n\n궁금하신 사항은 언제든 연락해주시면 감사하겠습니다.\n\n[목동임페리얼학원]\n☎ 대표전화 : 02-2644-1178\n◆ 대표메일 : imperialsys01@naver.com`;
        else if (type === 'rescheduled') message = `[목동임페리얼학원]\n안녕하세요. 목동임페리얼학원입니다.\n\n${data.studentName} 학생의 상담예약이 ${displayTime}로 변경되었습니다. 학생을 위해 더욱 준비하고 있겠습니다.\n\n감사합니다.\n\n[목동임페리얼학원]\n☎ 대표전화 : 02-2644-1178\n◆ 대표메일 : imperialsys01@naver.com`;

        try {
            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/sms_outbox`), {
                phoneNumber: cleanPhone, message: message, status: 'pending', type: 'consultation_notice', studentName: data.studentName, createdAt: serverTimestamp()
            });
        } catch (error) { console.error("SMS Queue Error:", error); }
    };

    const handleSaveSchedule = async () => {
        setScheduleErrorMsg('');
        if (!scheduleForm.studentName) return setScheduleErrorMsg('학생 이름을 입력해주세요.');
        if (scheduleForm.type === 'new' && !scheduleForm.parentPhone) return setScheduleErrorMsg('신규 상담은 학부모 연락처가 필수입니다.');
        if (!scheduleForm.consultantId) return setScheduleErrorMsg('상담 담당자를 배정해주세요.');
        
        const isConflict = consultations.some(c => c.date === scheduleForm.date && c.time === scheduleForm.time && c.status === 'scheduled' && c.id !== scheduleForm.id);
        if (isConflict) return setScheduleErrorMsg('해당 시간에는 이미 상담실이 예약되어 있습니다. 다른 시간을 선택해주세요.');

        setIsSavingSchedule(true);
        try {
            const isEditing = modalMode === 'edit' && scheduleForm.id;
            const docRef = isEditing ? doc(db, `artifacts/${APP_ID}/public/data/consultations`, scheduleForm.id) : doc(collection(db, `artifacts/${APP_ID}/public/data/consultations`));

            const staff = availableStaff.find(u => u.id === scheduleForm.consultantId);

            const payload = {
                studentName: scheduleForm.studentName, 
                parentPhone: scheduleForm.parentPhone || '', 
                type: scheduleForm.type, 
                date: scheduleForm.date,
                time: scheduleForm.time, 
                consultantId: scheduleForm.consultantId,
                consultantName: staff ? staff.name : '', // 편의를 위해 이름도 함께 저장
                notes: scheduleForm.notes, 
                status: 'scheduled', 
                updatedAt: serverTimestamp()
            };
            if (!isEditing) payload.createdAt = serverTimestamp();

            await setDoc(docRef, payload, { merge: true });

            if (!isEditing) { await sendConsultationSMS('created', payload); } 
            else {
                const oldData = consultations.find(c => c.id === scheduleForm.id);
                if (oldData && (oldData.date !== scheduleForm.date || oldData.time !== scheduleForm.time)) await sendConsultationSMS('rescheduled', payload);
            }
            setIsModalOpen(false); 
            setScheduleForm(initialScheduleForm);
        } catch (error) { setScheduleErrorMsg('저장 중 오류: ' + error.message); } finally { setIsSavingSchedule(false); }
    };

    const handleCancelConsultation = async (consultation) => {
        if (!window.confirm(`[${consultation.studentName}] 학생의 상담 예약을 취소하시겠습니까?\n신규 상담인 경우 취소 안내 문자가 발송됩니다.`)) return;
        try {
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/consultations`, consultation.id), { status: 'cancelled', updatedAt: serverTimestamp() }, { merge: true });
            await sendConsultationSMS('cancelled', consultation);
        } catch (error) { alert('취소 처리 실패: ' + error.message); }
    };

    const handleCompleteConsultation = async (id) => {
        try { await setDoc(doc(db, `artifacts/${APP_ID}/public/data/consultations`, id), { status: 'completed', updatedAt: serverTimestamp() }, { merge: true }); } 
        catch (error) { alert('완료 처리 실패: ' + error.message); }
    };

    const todaysConsultations = useMemo(() => {
        return consultations.filter(c => c.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
    }, [consultations, selectedDate]);


    // =========================================================================
    // 2. [기능 B] 신규 원생 온보딩(계정 발급) 상태 모음
    // =========================================================================
    const [toast, setToast] = useState({ message: '', type: 'info' });
    const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
    const [onboardTab, setOnboardTab] = useState('basic');

    const [leadForm, setLeadForm] = useState({
        name: '', phone: '', schoolName: '', schoolType: '중등', gradeLevel: '2', 
        checkedSubjects: { "국어": false, "수학": false, "영어": false, "과학": false },
        korean: { lastScore: '', weakType: '', note: '' }, math: { currentProgress: '', hardestConcept: '', note: '' },
        english: { catScore: '', readingLevel: '', vocabularyNote: '' }, science: { selectedSubject: '', note: '' }
    });

    const showToast = (message, type = 'error') => setToast({ message, type });
    const handleSubjectCheck = (subject) => setLeadForm(prev => ({ ...prev, checkedSubjects: { ...prev.checkedSubjects, [subject]: !prev.checkedSubjects[subject] } }));

    const handleConvertAndSubmit = async () => {
        if (!leadForm.name || !leadForm.phone) return showToast("학생 이름과 휴대폰 번호는 필수 항목입니다.", "error");
        for (const [sub, isChecked] of Object.entries(leadForm.checkedSubjects)) {
            if (isChecked) {
                if (sub === '국어' && !leadForm.korean.lastScore) return showToast("국어 점수/등급을 마저 채워주세요.", "error");
                if (sub === '수학' && !leadForm.math.currentProgress) return showToast("수학 현 진도를 마저 채워주세요.", "error");
                if (sub === '영어' && !leadForm.english.catScore) return showToast("영어 어휘력 진단 점수를 입력해야 마감됩니다.", "error");
            }
        }

        setIsOnboardingLoading(true);
        try {
            const cleanPhone = leadForm.phone.replace(/[^0-9]/g, '');
            const targetDocId = `imp_${cleanPhone.slice(-8)}`; 
            const generatedPw = cleanPhone.slice(-4) + '00'; 
            const mergedGrade = `${leadForm.schoolType} ${leadForm.gradeLevel}학년`; 

            const email = `${targetDocId}@imperial.com`;
            let authUid = 'legacy_verified_account';
            try {
                const credential = await createUserWithEmailAndPassword(secondaryAuth, email, generatedPw);
                authUid = credential.user.uid;
                await signOut(secondaryAuth);
            } catch (authErr) { if (authErr.code !== 'auth/email-already-in-use') throw authErr; }

            const userPayload = {
                id: targetDocId, userId: targetDocId, name: leadForm.name, phone: cleanPhone,
                role: 'student', status: 'attending', authUid: authUid,
                schoolName: leadForm.schoolName, grade: mergedGrade, attendancePin: cleanPhone.slice(-4),
                createdAt: serverTimestamp()
            };
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetDocId), userPayload);

            if (leadForm.checkedSubjects['영어'] && leadForm.english.catScore) {
                const score = Number(leadForm.english.catScore);
                const zones = {
                    Z1_Pass: [0, Math.max(0, score - 150)], Z2_Grey: [Math.max(0, score - 149), Math.max(0, score - 20)],
                    Z3_Target: [Math.max(0, score - 19), score + 30], Z4_Lock: [score + 31, 1000]
                };
                await setDoc(doc(db, `artifacts/${APP_ID}/public/data/english_stats`, targetDocId), {
                    studentId: targetDocId, catScore: score, vocaSession: 1, studyMode: 'calibration', calibrationSessionsLeft: 10, zones,
                    vocaProgress: 0, vocaComprehension: 0, vocaRetention: 0, vocaBook: '능률VOCA수능고난도', 
                    vocaRubric: `[상담 연동 세팅] 초기 진단평가 ${score}점 기준 영점 조절 프리셋 10회가 예약 가동되었습니다.`,
                    updatedAt: serverTimestamp()
                });
            }

            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/consult_history`, targetDocId), {
                studentId: targetDocId, studentName: leadForm.name, korean: leadForm.korean, math: leadForm.math, science: leadForm.science,
                checkedSubjects: leadForm.checkedSubjects, updatedAt: serverTimestamp()
            });

            const welcomeSmsMessage = `[목동임페리얼학원]\n안녕하세요. 프리미엄 임페리얼 학원입니다.\n${leadForm.name} 학생의 상담 등록 및 계정 발급이 완료되었습니다.\n\n[로그인 자격증명]\n- 접속 주소: https://imperial-sys.web.app\n- 로그인 ID: ${targetDocId}\n- 초기 비밀번호: ${generatedPw}\n\n* 로그인 시 첫 등원 전 맞춤 단어장 세팅이 이미 완료되어 있습니다.`;
            
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                phoneNumber: cleanPhone, message: welcomeSmsMessage, status: 'pending', type: 'auto_onboarding', studentName: leadForm.name, createdAt: serverTimestamp()
            });

            alert(`🎉 대성공!\n정식 계정(${targetDocId})이 발급되었으며, 첫 등원 안내 문자가 발송 큐에 적재되었습니다.`);
            
            setLeadForm({ name: '', phone: '', schoolName: '', schoolType: '중등', gradeLevel: '2', checkedSubjects: { "국어": false, "수학": false, "영어": false, "과학": false }, korean: { lastScore: '', weakType: '', note: '' }, math: { currentProgress: '', hardestConcept: '', note: '' }, english: { catScore: '', readingLevel: '', vocabularyNote: '' }, science: { selectedSubject: '', note: '' } });
            setOnboardTab('basic');

        } catch (e) { showToast(e.message || "등록 처리에 실패했습니다.", "error"); } finally { setIsOnboardingLoading(false); }
    };

    if (loadingData) return <div className="h-[70vh] flex items-center justify-center"><Loader className="animate-spin text-indigo-600" size={40}/></div>;

    if (criticalError) {
        return (
            <div className="h-[70vh] flex flex-col items-center justify-center p-4">
                <AlertCircle size={64} className="text-rose-500 mb-4" />
                <h2 className="text-2xl font-black text-slate-800 mb-2">시스템 접근 오류</h2>
                <p className="text-slate-500 font-bold mb-6 text-center">{criticalError}</p>
                <Button onClick={() => window.location.reload()} className="bg-indigo-600">새로고침</Button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

            {/* 통합 메뉴 탭 */}
            <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex gap-2">
                <button 
                    onClick={() => setMainTab('schedule')}
                    className={`flex-1 py-3 text-sm md:text-base font-black rounded-xl transition-all flex justify-center items-center gap-2 ${mainTab === 'schedule' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <Calendar size={18} /> 1. 상담실 스케줄 관리
                </button>
                <button 
                    onClick={() => setMainTab('onboarding')}
                    className={`flex-1 py-3 text-sm md:text-base font-black rounded-xl transition-all flex justify-center items-center gap-2 ${mainTab === 'onboarding' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <UserPlus size={18} /> 2. 신규 원생 정식 등록
                </button>
            </div>

            {/* ==================== 탭 1. 상담실 스케줄 관제탑 (대형 캘린더 탑재) ==================== */}
            {mainTab === 'schedule' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-6 md:p-8 shadow-xl text-white flex flex-col md:flex-row justify-between md:items-center gap-6">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-2">
                                <Users size={28} /> 상담 스케줄 관제 센터
                            </h1>
                            <p className="text-indigo-200 font-medium">상담실 예약이 완료된 후, 상담을 진행하고 2번 탭에서 정식 등록하세요.</p>
                        </div>
                        <Button onClick={() => { setScheduleForm({...initialScheduleForm, date: selectedDate}); setModalMode('create'); setIsModalOpen(true); }} className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold px-5 py-3 shadow-md flex items-center gap-2 text-lg">
                            <UserPlus size={20}/> 새 상담 예약하기
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* 왼쪽: 대형 캘린더 보드 */}
                        <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                            {/* 달력 헤더 */}
                            <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200">
                                        <ChevronLeft size={20} className="text-slate-600"/>
                                    </button>
                                    <h2 className="text-xl font-black text-slate-800">
                                        {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                                    </h2>
                                    <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200">
                                        <ChevronRight size={20} className="text-slate-600"/>
                                    </button>
                                </div>
                                <Button onClick={() => { setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(today.toISOString().split('T')[0]); }} variant="outline" className="text-sm font-bold border-slate-300">
                                    오늘로 이동
                                </Button>
                            </div>

                            {/* 요일 헤더 */}
                            <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-200 text-center py-3 text-xs font-black text-slate-500">
                                <div className="text-rose-500">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-500">토</div>
                            </div>

                            {/* 달력 그리드 */}
                            {isScheduleLoading ? (
                                <div className="h-96 flex items-center justify-center"><Loader className="animate-spin text-indigo-500" size={40}/></div>
                            ) : (
                                <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px">
                                    {calendarDays.map((day) => {
                                        if (day.empty) return <div key={day.key} className="bg-slate-50/50 min-h-[100px]"></div>;
                                        
                                        const isToday = day.fullDate === today.toISOString().split('T')[0];
                                        const isSelected = day.fullDate === selectedDate;
                                        const pendingConsults = day.consults.filter(c => c.status === 'scheduled');

                                        return (
                                            <div 
                                                key={day.key} 
                                                onClick={() => setSelectedDate(day.fullDate)}
                                                className={`bg-white min-h-[100px] p-2 cursor-pointer transition-colors hover:bg-indigo-50 relative ${isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10' : ''}`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
                                                        {day.date}
                                                    </span>
                                                </div>
                                                
                                                <div className="space-y-1 mt-2">
                                                    {pendingConsults.slice(0, 3).map(c => (
                                                        <div key={c.id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${c.type === 'new' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                                                            {c.time} {c.studentName}
                                                        </div>
                                                    ))}
                                                    {pendingConsults.length > 3 && (
                                                        <div className="text-[10px] font-bold text-slate-500 text-center">+ {pendingConsults.length - 3}건</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 오른쪽: 선택된 날짜 상세 스케줄 (기존 타임라인) */}
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[650px]">
                            <div className="p-5 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center shrink-0">
                                <div className="font-black text-indigo-900 flex items-center gap-2 text-lg">
                                    <Clock size={20}/> {selectedDate} 타임라인
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 relative bg-slate-50/50 custom-scrollbar">
                                <div className="absolute left-[72px] top-6 bottom-6 w-0.5 bg-slate-200"></div>
                                <div className="space-y-6">
                                    {TIME_SLOTS.map(time => {
                                        const item = todaysConsultations.find(c => c.time === time && (c.status === 'scheduled' || c.status === 'completed'));
                                        return (
                                            <div key={time} className="relative flex items-center gap-4 group">
                                                <div className="w-12 shrink-0 text-right font-bold text-slate-500 text-sm">{time}</div>
                                                <div className={`relative z-10 w-4 h-4 rounded-full ring-4 ring-white shadow-sm transition-colors ${item ? (item.status === 'completed' ? 'bg-slate-300' : 'bg-indigo-500') : 'bg-white border-2 border-slate-300 group-hover:border-indigo-400 cursor-pointer'}`} onClick={() => { if(!item){ setScheduleForm({...initialScheduleForm, date: selectedDate, time}); setModalMode('create'); setIsModalOpen(true); }}}></div>

                                                <div className="flex-1">
                                                    {item ? (
                                                        <div className={`p-4 rounded-2xl border transition-all ${item.status === 'completed' ? 'bg-slate-100 border-slate-200 opacity-60' : item.type === 'new' ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-300 shadow-sm'}`}>
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm text-white ${item.type === 'new' ? 'bg-emerald-500' : 'bg-slate-500'}`}>
                                                                        {item.type === 'new' ? <><MessageSquare size={10}/> 신규</> : '기존'}
                                                                    </span>
                                                                    <span className="font-black text-slate-800">{item.studentName}</span>
                                                                </div>
                                                                {item.status === 'scheduled' && (
                                                                    <div className="flex gap-0.5">
                                                                        <button onClick={() => { setScheduleForm(item); setModalMode('edit'); setIsModalOpen(true); }} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14}/></button>
                                                                        <button onClick={() => handleCompleteConsultation(item.id)} className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"><CheckCircle size={14}/></button>
                                                                        <button onClick={() => handleCancelConsultation(item)} className="p-1 text-slate-400 hover:text-rose-600 transition-colors"><XCircle size={14}/></button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                                                                <span className="flex items-center gap-1"><UserPlus size={12}/> 담당: {item.consultantName || '미정'}</span>
                                                                {item.parentPhone && <span className="flex items-center gap-1 text-blue-600"><Phone size={12}/> {item.parentPhone}</span>}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div onClick={() => { setScheduleForm({...initialScheduleForm, date: selectedDate, time}); setModalMode('create'); setIsModalOpen(true); }} className="h-10 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-sm font-bold text-slate-400 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500 transition-all">예약 추가</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== 탭 2. 신규 원생 온보딩 시스템 ==================== */}
            {mainTab === 'onboarding' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="text-center md:text-left mb-6 mt-4 pl-2">
                        <h1 className="text-3xl font-black text-gray-900 flex items-center justify-center md:justify-start gap-2">
                            <Sparkles className="text-blue-600"/> 임페리얼 원스톱 상담 & 온보딩 엔진
                        </h1>
                        <p className="text-sm font-bold text-gray-500 mt-1">상담을 마친 학생의 데이터를 입력하고 즉시 정식 계정을 발급합니다.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="md:col-span-1 flex flex-col gap-2 bg-white p-3 rounded-2xl border shadow-sm h-fit">
                            <button onClick={() => setOnboardTab('basic')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${onboardTab === 'basic' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>👤 1. 기본 인적사항</button>
                            {leadForm.checkedSubjects["국어"] && <button onClick={() => setOnboardTab('국어')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${onboardTab === '국어' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><BookOpen size={14}/> 국어 체크리스트</button>}
                            {leadForm.checkedSubjects["수학"] && <button onClick={() => setOnboardTab('수학')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${onboardTab === '수학' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><Calculator size={14}/> 수학 체크리스트</button>}
                            {leadForm.checkedSubjects["영어"] && <button onClick={() => setOnboardTab('영어')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${onboardTab === '영어' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><Languages size={14}/> 영어 체크리스트</button>}
                            {leadForm.checkedSubjects["과학"] && <button onClick={() => setOnboardTab('과학')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${onboardTab === '과학' ? 'bg-purple-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><FlaskConical size={14}/> 과학 체크리스트</button>}
                            <button onClick={() => setOnboardTab('final')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 border border-dashed transition-all mt-4 ${onboardTab === 'final' ? 'bg-gray-900 text-white shadow-md border-transparent' : 'text-gray-700 hover:bg-gray-50 border-gray-300'}`}><UserPlus size={14}/> 3. 원클릭 학생 전환</button>
                        </div>

                        <div className="md:col-span-3">
                            {onboardTab === 'basic' && (
                                <Card className="space-y-4 animate-in fade-in">
                                    <h2 className="text-lg font-black text-gray-800 border-b pb-2">1단계: 가망고객 기본 정보 및 상담 과목 선택</h2>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">학생 실명 *</label>
                                            <input required className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500 transition-all" placeholder="홍길동" value={leadForm.name} onChange={e=>setLeadForm({...leadForm, name: e.target.value})}/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">학부모 휴대폰 번호 *</label>
                                            <input required className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500 transition-all" placeholder="01012345678" value={leadForm.phone} onChange={e=>setLeadForm({...leadForm, phone: e.target.value})}/>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">학교명</label>
                                            <input className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500 transition-all" placeholder="목동중학교" value={leadForm.schoolName} onChange={e=>setLeadForm({...leadForm, schoolName: e.target.value})}/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">학교급 및 학년 *</label>
                                            <div className="flex gap-2">
                                                <select className="w-1/2 border p-3 rounded-xl font-bold bg-gray-50 outline-none focus:border-blue-500" value={leadForm.schoolType} onChange={e=>{
                                                    const newType = e.target.value;
                                                    let newGrade = leadForm.gradeLevel;
                                                    if (newType !== '초등' && Number(newGrade) > 3) newGrade = '1';
                                                    setLeadForm({...leadForm, schoolType: newType, gradeLevel: newGrade});
                                                }}>
                                                    <option value="초등">초등학교</option>
                                                    <option value="중등">중학교</option>
                                                    <option value="고등">고등학교</option>
                                                </select>
                                                <select className="w-1/2 border p-3 rounded-xl font-bold bg-gray-50 outline-none focus:border-blue-500" value={leadForm.gradeLevel} onChange={e=>setLeadForm({...leadForm, gradeLevel: e.target.value})}>
                                                    <option value="1">1학년</option>
                                                    <option value="2">2학년</option>
                                                    <option value="3">3학년</option>
                                                    {leadForm.schoolType === '초등' && (
                                                        <>
                                                            <option value="4">4학년</option>
                                                            <option value="5">5학년</option>
                                                            <option value="6">6학년</option>
                                                        </>
                                                    )}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-gray-100">
                                        <label className="block text-xs font-black text-blue-900 mb-3">📍 오늘 상담을 희망하는 과목을 모두 체크하세요</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {["국어", "수학", "영어", "과학"].map(sub => (
                                                <label key={sub} className={`flex items-center justify-center gap-2 p-4 border rounded-xl font-black text-sm cursor-pointer transition-all active:scale-95 ${leadForm.checkedSubjects[sub] ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-sm' : 'bg-white hover:bg-gray-50 text-gray-500 border-gray-200'}`}>
                                                    <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={leadForm.checkedSubjects[sub]} onChange={() => handleSubjectCheck(sub)}/>
                                                    {sub}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {onboardTab === '국어' && (
                                <Card className="space-y-4 border-2 border-orange-100 animate-in fade-in slide-in-from-right-4">
                                    <h2 className="text-lg font-black text-orange-900 border-b border-orange-100 pb-2 flex items-center gap-2"><BookOpen className="text-orange-500"/> 국어과 정밀 필터링 질문지</h2>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">최근 시험 점수 또는 모의고사 등급 *</label>
                                        <input required className="w-full border p-3 rounded-xl outline-none font-bold focus:border-orange-400 focus:bg-orange-50/30 transition-all" placeholder="예: 88점 또는 모의고사 2등급" value={leadForm.korean.lastScore} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, lastScore: e.target.value}})}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">취약한 영역 (현대시, 비문학, 문법 중 선택)</label>
                                        <input className="w-full border p-3 rounded-xl outline-none font-bold focus:border-orange-400 focus:bg-orange-50/30 transition-all" placeholder="예: 비문학 경제 지문 독해 불가능" value={leadForm.korean.weakType} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, weakType: e.target.value}})}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">강사 인수인계용 데스크 특이사항</label>
                                        <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 focus:border-orange-400 focus:bg-orange-50/30 transition-all resize-none" placeholder="과외 경험 유무 등을 작성해 주세요." value={leadForm.korean.note} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, note: e.target.value}})}/>
                                    </div>
                                </Card>
                            )}

                            {onboardTab === '수학' && (
                                <Card className="space-y-4 border-2 border-emerald-100 animate-in fade-in slide-in-from-right-4">
                                    <h2 className="text-lg font-black text-emerald-900 border-b border-emerald-100 pb-2 flex items-center gap-2"><Calculator className="text-emerald-500"/> 수학과 진도 측정 질문지</h2>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">현재 선행 학습 완료 및 진행 구역 *</label>
                                        <input required className="w-full border p-3 rounded-xl outline-none font-bold focus:border-emerald-400 focus:bg-emerald-50/30 transition-all" placeholder="예: 수학(상) 개념원리 수준 진행 중" value={leadForm.math.currentProgress} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, currentProgress: e.target.value}})}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">가장 오답률이 높은 취약 단원</label>
                                        <input className="w-full border p-3 rounded-xl outline-none font-bold focus:border-emerald-400 focus:bg-emerald-50/30 transition-all" placeholder="예: 도형의 방정식 파트 응용문제 무너짐" value={leadForm.math.hardestConcept} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, hardestConcept: e.target.value}})}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">기타 수학적 연산 습관 기술</label>
                                        <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 focus:border-emerald-400 focus:bg-emerald-50/30 transition-all resize-none" placeholder="풀이 과정을 안 적는 습관 있음 등" value={leadForm.math.note} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, note: e.target.value}})}/>
                                    </div>
                                </Card>
                            )}

                            {onboardTab === '영어' && (
                                <Card className="space-y-4 border-2 border-indigo-200 bg-indigo-50/30 animate-in fade-in slide-in-from-right-4">
                                    <h2 className="text-lg font-black text-indigo-900 border-b border-indigo-200 pb-2 flex items-center gap-2"><Languages className="text-indigo-600"/> 영어과 진단평가 기록지</h2>
                                    
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">영어 진단평가 점수 (수동 입력) *</label>
                                            <input required type="number" className="w-full border p-3 rounded-xl outline-none font-bold bg-white focus:border-indigo-400 transition-all" placeholder="예: 85 (숫자만 입력)" value={leadForm.english.catScore} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, catScore: e.target.value}})}/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">독해력 지표 수준 (자체 교재 레벨용)</label>
                                            <input className="w-full border p-3 rounded-xl outline-none font-bold bg-white focus:border-indigo-400 transition-all" placeholder="예: 고1 학평 기준 안정적 2등급" value={leadForm.english.readingLevel} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, readingLevel: e.target.value}})}/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">영어 대면 상담 일지 코멘트</label>
                                            <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 bg-white focus:border-indigo-400 transition-all resize-none" placeholder="단어 암기 시 발음을 전혀 모름 등" value={leadForm.english.vocabularyNote} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, vocabularyNote: e.target.value}})}/>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {onboardTab === '과학' && (
                                <Card className="space-y-4 border-2 border-purple-100 animate-in fade-in slide-in-from-right-4">
                                    <h2 className="text-lg font-black text-purple-900 border-b border-purple-100 pb-2 flex items-center gap-2"><FlaskConical className="text-purple-500"/> 과학과 선택과목 질문지</h2>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">희망 수강 과목 (물리, 화학, 생명, 지학 고등 선행) *</label>
                                        <input required className="w-full border p-3 rounded-xl outline-none font-bold focus:border-purple-400 focus:bg-purple-50/30 transition-all" placeholder="예: 고1 통합과학 및 화학1 선행 희망" value={leadForm.science.selectedSubject} onChange={e=>setLeadForm({...leadForm, science: { ...leadForm.science, selectedSubject: e.target.value}})}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">수업 조율 관련 특이사항</label>
                                        <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 focus:border-purple-400 focus:bg-purple-50/30 transition-all resize-none" placeholder="실험 위주 학원 다닌 이력 있음 등" value={leadForm.science.note} onChange={e=>setLeadForm({...leadForm, science: { ...leadForm.science, note: e.target.value}})}/>
                                    </div>
                                </Card>
                            )}

                            {onboardTab === 'final' && (
                                <Card className="space-y-6 border-2 border-gray-900 bg-gray-50 text-center py-10 animate-in fade-in slide-in-from-right-4 shadow-xl relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-2 bg-gray-900"></div>
                                    <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner border border-blue-200">
                                        <CheckCircle size={40}/>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-gray-900">3단계: 상담 최종 마감 및 정식 원생 승급</h3>
                                        <p className="text-sm font-bold text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
                                            아래 버튼을 누르면 즉시 아이디와 비밀번호가 <span className="text-blue-600">자동 발급(Auto-generation)</span>되며, 
                                            학부모님께 첫 등원 가이드 문자가 자동 발송됩니다.
                                        </p>
                                    </div>
                                    <div className="max-w-md mx-auto bg-white p-5 rounded-2xl border text-left text-sm font-bold space-y-3 text-gray-600 shadow-sm">
                                        <div className="font-black text-base text-gray-800 border-b pb-2 mb-3 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500"/> 입력 상태 체크보드</div>
                                        <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg"><span>• 대상 학생</span> <span className="text-gray-900 font-black">{leadForm.name || '미입력'} ({leadForm.schoolType} {leadForm.gradeLevel}학년)</span></div>
                                        <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg"><span>• 안내 연락처</span> <span className="text-gray-900 font-black">{leadForm.phone || '미입력'}</span></div>
                                        <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg"><span>• 상담 과목</span> <span className="text-blue-600 font-black">{Object.entries(leadForm.checkedSubjects).filter(([_, v]) => v).map(([k]) => k).join(', ') || '없음'}</span></div>
                                        {leadForm.checkedSubjects['영어'] && (
                                            <div className="flex justify-between items-center bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                                                <span className="text-indigo-800">• 어휘 진단 점수</span> 
                                                <span className={leadForm.english.catScore ? 'text-indigo-600 font-black' : 'text-rose-500 font-black'}>{leadForm.english.catScore ? `${leadForm.english.catScore}점 측정완료` : '미입력 (필수)'}</span>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={handleConvertAndSubmit} disabled={isOnboardingLoading} className="w-full max-w-md mx-auto py-5 bg-gray-900 text-white font-black rounded-2xl text-xl shadow-[0_10px_20px_rgba(0,0,0,0.2)] hover:bg-black hover:-translate-y-1 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:bg-gray-400 disabled:transform-none disabled:shadow-none">
                                        {isOnboardingLoading ? <Loader className="animate-spin" size={28}/> : <><UserPlus size={24}/> 정식 등록 및 등원문자 발송</>}
                                    </button>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 상담 예약 생성/수정용 공통 모달 (탭 1 소속) */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalMode === 'create' ? '새로운 상담 예약' : '상담 예약 수정'}>
                <div className="space-y-5 p-2">
                    {scheduleErrorMsg && <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-sm font-bold flex items-center gap-2 border border-rose-200"><AlertCircle size={16} className="shrink-0"/> {scheduleErrorMsg}</div>}

                    <div className="bg-slate-50 p-1.5 rounded-2xl flex border border-slate-200">
                        <button className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${scheduleForm.type === 'new' ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400 hover:bg-slate-100'}`} onClick={() => setScheduleForm({...scheduleForm, type: 'new'})}>신규 학부모 상담 (문자 O)</button>
                        <button className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${scheduleForm.type === 'existing' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-400 hover:bg-slate-100'}`} onClick={() => setScheduleForm({...scheduleForm, type: 'existing', parentPhone: ''})}>기존 재원생 상담 (문자 X)</button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1.5 block">학생 이름 <span className="text-rose-500">*</span></label>
                            <input type="text" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" placeholder="예: 김현민" value={scheduleForm.studentName} onChange={e => setScheduleForm({...scheduleForm, studentName: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1.5 block">학부모 연락처 {scheduleForm.type === 'new' && <span className="text-rose-500">*</span>}</label>
                            <input type="text" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" placeholder="01012345678" value={scheduleForm.parentPhone} onChange={e => setScheduleForm({...scheduleForm, parentPhone: e.target.value})} disabled={scheduleForm.type === 'existing'} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1.5 block">예약 일자</label>
                            <input type="date" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" value={scheduleForm.date} onChange={e => setScheduleForm({...scheduleForm, date: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1.5 block">예약 시간</label>
                            <select className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" value={scheduleForm.time} onChange={e => setScheduleForm({...scheduleForm, time: e.target.value})}>
                                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* 🚀 [CTO 패치] 텍스트 입력이 아닌, 실제 시스템 유저 드롭다운 연동 */}
                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">배정된 상담자 (강사/원장) <span className="text-rose-500">*</span></label>
                        <select 
                            className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" 
                            value={scheduleForm.consultantId} 
                            onChange={e => setScheduleForm({...scheduleForm, consultantId: e.target.value})}
                        >
                            <option value="" disabled>상담 담당자를 선택해주세요</option>
                            {availableStaff.map(staff => (
                                <option key={staff.id} value={staff.id}>
                                    {staff.name} ({staff.role === 'admin' ? '원장' : staff.role === 'admin_assistant' ? '행정실장' : '강사/조교'})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">상담 메모 (선택)</label>
                        <textarea className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white h-24 resize-none" placeholder="상담 시 참고할 사항..." value={scheduleForm.notes} onChange={e => setScheduleForm({...scheduleForm, notes: e.target.value})} />
                    </div>

                    {scheduleForm.type === 'new' && (
                        <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-xs font-bold border border-emerald-200 leading-relaxed">
                            💡 저장 즉시 학부모님께 <b>[상담 안내 문자]</b>가 발송되며, 내일 예정된 경우 익일 오전 11시에 리마인드 문자가 자동 발송됩니다.
                        </div>
                    )}

                    <Button className="w-full py-4 text-lg font-black bg-indigo-600 hover:bg-indigo-700 shadow-lg mt-2" onClick={handleSaveSchedule} disabled={isSavingSchedule}>
                        {isSavingSchedule ? <Loader className="animate-spin mx-auto" /> : (modalMode === 'create' ? '예약 확정 및 문자 발송' : '예약 변경 내용 저장')}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}