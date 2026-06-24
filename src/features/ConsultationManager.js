/* [서비스 가치(Service Value)] 프리미엄 상담 스케줄 & 온보딩 통합 센터
   🚀 CTO 패치: 
   1. 무한 로딩 원천 차단: Firebase 권한 거부(Permission Denied)나 네트워크 오류 발생 시 무한 로딩에 빠지지 않고 명확한 에러 UI를 노출하는 예외 처리(Error Boundary)를 적용했습니다.
   2. Zero Trust Security 방어: 컴포넌트 마운트 해제 시 스냅샷 리스너를 완벽히 정리(Cleanup)하여 메모리 누수를 방지합니다. */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Calendar, Clock, UserPlus, Users, Phone, Edit2, XCircle, 
    CheckCircle, AlertCircle, Loader, MessageSquare, BookOpen, Calculator, Languages, FlaskConical, Sparkles 
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
    const { currentUser, loadingData } = useData() || {};
    
    // 네비게이션 탭 상태: 'schedule' (예약 스케줄 관제) | 'onboarding' (신규 원생 계정 발급)
    const [mainTab, setMainTab] = useState('schedule');
    const isMounted = useRef(true);

    // =========================================================================
    // 1. [기능 A] 상담 스케줄 관제 상태 모음
    // =========================================================================
    const [consultations, setConsultations] = useState([]);
    const [isScheduleLoading, setIsScheduleLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('create');
    const [scheduleErrorMsg, setScheduleErrorMsg] = useState('');
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);
    
    // 🚀 [CTO 방어 로직] 치명적 오류 발생 시 화면을 멈추지 않기 위한 전역 에러 상태
    const [criticalError, setCriticalError] = useState('');

    const initialScheduleForm = {
        id: '', type: 'new', studentName: '', parentPhone: '', date: selectedDate, time: '15:00',
        consultantName: currentUser?.name || '', notes: ''
    };
    const [scheduleForm, setScheduleForm] = useState(initialScheduleForm);

    // 🚀 [핵심 픽스] 스케줄 데이터 구독 시 에러 핸들링 추가
    useEffect(() => {
        isMounted.current = true;
        const startOfCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0];
        const q = query(collection(db, `artifacts/${APP_ID}/public/data/consultations`), where('date', '>=', startOfCurrentMonth));
        
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
                    setIsScheduleLoading(false); // 🚀 에러가 나더라도 무한 로딩을 즉시 중단
                }
            }
        );

        return () => {
            isMounted.current = false;
            unsub();
        };
    }, []);

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
        let message = '';

        if (type === 'created') message = `[목동임페리얼학원]\n안녕하세요. 목동임페리얼학원입니다.\n\n${data.studentName} 학생의 상담이 ${displayTime}로 예약되었습니다.\n\n학생의 상황에 최적화된 상담자가 배정될 예정이며, 상담 일정변경 또는 궁금하신 사항은 언제든 연락주시기를 바랍니다.\n\n[목동임페리얼학원]\n☎ 대표전화 : 02-2644-1178\n◆ 대표메일 : imperialsys01@naver.com`;
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
        
        const isConflict = consultations.some(c => c.date === scheduleForm.date && c.time === scheduleForm.time && c.status === 'scheduled' && c.id !== scheduleForm.id);
        if (isConflict) return setScheduleErrorMsg('해당 시간에는 이미 상담실이 예약되어 있습니다. 다른 시간을 선택해주세요.');

        setIsSavingSchedule(true);
        try {
            const isEditing = modalMode === 'edit' && scheduleForm.id;
            const docRef = isEditing ? doc(db, `artifacts/${APP_ID}/public/data/consultations`, scheduleForm.id) : doc(collection(db, `artifacts/${APP_ID}/public/data/consultations`));

            const payload = {
                studentName: scheduleForm.studentName, parentPhone: scheduleForm.parentPhone || '', type: scheduleForm.type, date: scheduleForm.date,
                time: scheduleForm.time, consultantName: scheduleForm.consultantName, notes: scheduleForm.notes, status: 'scheduled', updatedAt: serverTimestamp()
            };
            if (!isEditing) payload.createdAt = serverTimestamp();

            await setDoc(docRef, payload, { merge: true });

            if (!isEditing) { await sendConsultationSMS('created', payload); } 
            else {
                const oldData = consultations.find(c => c.id === scheduleForm.id);
                if (oldData && (oldData.date !== scheduleForm.date || oldData.time !== scheduleForm.time)) await sendConsultationSMS('rescheduled', payload);
            }
            setIsModalOpen(false); setScheduleForm(initialScheduleForm);
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

    // 🚀 전역 로딩 처리 (에러 발생 시에도 무한 로딩 탈출)
    if (loadingData || isScheduleLoading) {
        return (
            <div className="h-screen flex items-center justify-center">
                <Loader className="animate-spin text-indigo-600" size={40}/>
            </div>
        );
    }

    // 🚀 치명적 에러 UI 표시
    if (criticalError) {
        return (
            <div className="h-screen flex flex-col items-center justify-center p-4">
                <AlertCircle size={64} className="text-rose-500 mb-4" />
                <h2 className="text-2xl font-black text-slate-800 mb-2">시스템 접근 오류</h2>
                <p className="text-slate-500 font-bold mb-6 text-center">{criticalError}</p>
                <Button onClick={() => window.location.reload()} className="bg-indigo-600">새로고침</Button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
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

            {/* ==================== 탭 1. 상담실 스케줄 관제탑 ==================== */}
            {mainTab === 'schedule' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-6 md:p-8 shadow-xl text-white flex flex-col md:flex-row justify-between md:items-center gap-6">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-2">
                                <Users size={28} /> 상담 스케줄 관제 센터
                            </h1>
                            <p className="text-indigo-200 font-medium">상담실 예약이 완료된 후, 상담을 진행하고 2번 탭에서 정식 등록하세요.</p>
                        </div>
                        
                        <div className="flex items-center gap-3 bg-white/10 p-2 rounded-2xl backdrop-blur-sm border border-white/20">
                            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent border-none text-white font-black text-lg outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:filter-white"/>
                            <Button onClick={() => { setScheduleForm(initialScheduleForm); setModalMode('create'); setIsModalOpen(true); }} className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold px-4 py-2 shadow-md">
                                + 상담 예약
                            </Button>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div className="font-black text-slate-700 flex items-center gap-2">
                                <Calendar size={18}/> {selectedDate} 상담실 점유 현황 (1개 호실)
                            </div>
                            <div className="flex gap-3 text-xs font-bold text-slate-500">
                                <span className="flex items-center gap-1"><Badge className="bg-emerald-100 text-emerald-700 border-0">신규</Badge> 문자 발송 됨</span>
                                <span className="flex items-center gap-1"><Badge className="bg-slate-100 text-slate-600 border-0">기존</Badge> 재원생</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 relative bg-slate-50/50">
                            <div className="absolute left-[88px] top-6 bottom-6 w-0.5 bg-slate-200"></div>
                            <div className="space-y-6">
                                {TIME_SLOTS.map(time => {
                                    const item = todaysConsultations.find(c => c.time === time && (c.status === 'scheduled' || c.status === 'completed'));
                                    return (
                                        <div key={time} className="relative flex items-center gap-6 group">
                                            <div className="w-16 shrink-0 text-right font-bold text-slate-500">{time}</div>
                                            <div className={`relative z-10 w-4 h-4 rounded-full ring-4 ring-white shadow-sm transition-colors ${item ? (item.status === 'completed' ? 'bg-slate-300' : 'bg-indigo-500') : 'bg-white border-2 border-slate-300 group-hover:border-indigo-400 cursor-pointer'}`} onClick={() => { if(!item){ setScheduleForm({...initialScheduleForm, time}); setModalMode('create'); setIsModalOpen(true); }}}></div>

                                            <div className="flex-1">
                                                {item ? (
                                                    <div className={`p-4 rounded-2xl border transition-all ${item.status === 'completed' ? 'bg-slate-100 border-slate-200 opacity-60' : item.type === 'new' ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-300 shadow-sm'}`}>
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="flex items-center gap-2">
                                                                {item.type === 'new' ? <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm"><MessageSquare size={10}/> 신규 상담</span> : <span className="bg-slate-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">기존 학생</span>}
                                                                <span className="font-black text-slate-800 text-lg">{item.studentName}</span>
                                                                {item.status === 'completed' && <span className="text-slate-500 text-xs font-bold">(상담 완료)</span>}
                                                            </div>
                                                            {item.status === 'scheduled' && (
                                                                <div className="flex gap-1">
                                                                    <button onClick={() => { setScheduleForm(item); setModalMode('edit'); setIsModalOpen(true); }} className="p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-lg transition-colors"><Edit2 size={16}/></button>
                                                                    <button onClick={() => handleCompleteConsultation(item.id)} className="p-1.5 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 rounded-lg transition-colors"><CheckCircle size={16}/></button>
                                                                    <button onClick={() => handleCancelConsultation(item)} className="p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors"><XCircle size={16}/></button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap gap-4 text-sm font-bold text-slate-600">
                                                            <span className="flex items-center gap-1"><UserPlus size={14}/> 담당: {item.consultantName || '미정'}</span>
                                                            {item.parentPhone && <a href={`tel:${item.parentPhone}`} className="flex items-center gap-1 text-blue-600 hover:underline"><Phone size={14}/> {item.parentPhone}</a>}
                                                        </div>
                                                        {item.notes && <p className="mt-2 text-xs text-slate-500 bg-white/50 p-2 rounded-lg border border-slate-100">{item.notes}</p>}
                                                    </div>
                                                ) : (
                                                    <div onClick={() => { setScheduleForm({...initialScheduleForm, time}); setModalMode('create'); setIsModalOpen(true); }} className="h-10 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-sm font-bold text-slate-400 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-500 transition-all">이 시간에 상담 예약하기</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
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

                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">배정된 상담자 (강사/원장)</label>
                        <input type="text" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" placeholder="이름 입력" value={scheduleForm.consultantName} onChange={e => setScheduleForm({...scheduleForm, consultantName: e.target.value})} />
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