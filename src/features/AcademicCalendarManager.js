/* [서비스 가치(Service Value)] 학사일정 및 D-Day 마스터 관제 센터
   1. 데이터 코어화: 시험, 수행평가, 학교 행사 등 모든 학사일정을 통합 관리하여 학원의 운영 스케줄링을 최적화합니다.
   2. 동적 필터링 UX: 초/중/고 학교 급에 따라 등록된 학교 목록을 동적으로 필터링하여 데스크의 입력 실수를 원천 차단합니다.
   3. 시스템 연동: 이곳에 등록된 데이터는 학생 대시보드(My Imperial Day)의 D-Day 배너와 출결 면제(Bypass) 시스템에 자동 반영됩니다. */

import React, { useState, useEffect, useMemo } from 'react';
import { 
    CalendarDays, Target, BookOpen, AlertTriangle, Plus, Trash2, 
    Building, CheckCircle, Clock, GraduationCap, X, Loader, Search 
} from 'lucide-react';
import { collection, query, onSnapshot, doc, deleteDoc, serverTimestamp, addDoc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Modal, Button, Card, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const getLocalDateStr = (dateObj) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
};

export default function AcademicCalendarManager() {
    const { currentUser, loadingData } = useData() || {};
    const [calendars, setCalendars] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // 학교 DB 데이터 (설정에서 가져옴)
    const [schoolsData, setSchoolsData] = useState({ elementary: [], middle: [], high: [] });
    
    // 모달 및 폼 상태
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const initialForm = {
        schoolLevel: 'high', // 'elementary' | 'middle' | 'high'
        schoolName: '',
        eventType: 'exam', // 'exam' | 'performance' | 'event'
        eventName: '',
        startDate: getLocalDateStr(new Date()),
        endDate: getLocalDateStr(new Date()),
        isAttendanceExempt: true
    };
    const [form, setForm] = useState(initialForm);

    // 1. 학사일정 데이터 구독
    useEffect(() => {
        const q = query(collection(db, `artifacts/${APP_ID}/public/data/academic_calendars`), orderBy('startDate', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setCalendars(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    // 2. 학교 마스터 데이터 로드 (settings/schools)
    useEffect(() => {
        const fetchSchools = async () => {
            try {
                const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'schools');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSchoolsData(docSnap.data());
                }
            } catch (e) { console.error("School data fetch error:", e); }
        };
        fetchSchools();
    }, []);

    // 유형 변경 시 기본값 세팅 (시험은 출결면제 O, 나머지는 X)
    const handleEventTypeChange = (type) => {
        setForm({
            ...form, 
            eventType: type,
            isAttendanceExempt: type === 'exam'
        });
    };

    // 학교 급(초중고) 변경 시 학교명 초기화
    const handleSchoolLevelChange = (level) => {
        setForm({ ...form, schoolLevel: level, schoolName: '' });
    };

    const handleSaveCalendar = async () => {
        if (!form.schoolName || !form.eventName || !form.startDate || !form.endDate) return alert("필수 항목을 모두 입력해주세요.");
        if (form.startDate > form.endDate) return alert("시작일이 종료일보다 늦을 수 없습니다.");

        setIsSaving(true);
        try {
            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/academic_calendars`), {
                ...form,
                createdAt: serverTimestamp(),
                createdBy: currentUser?.name || '관리자'
            });
            setIsModalOpen(false);
            setForm(initialForm);
        } catch (error) {
            alert("저장 실패: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("이 학사일정을 영구 삭제하시겠습니까?\n해당 일정과 연동된 출결 면제 및 학생 화면 배너가 즉시 사라집니다.")) return;
        try {
            await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/academic_calendars`, id));
        } catch (error) {
            alert("삭제 실패: " + error.message);
        }
    };

    const getEventBadge = (type) => {
        switch(type) {
            case 'exam': return <Badge className="bg-rose-100 text-rose-700 border-0 flex items-center gap-1"><Target size={12}/> 정기고시(시험)</Badge>;
            case 'performance': return <Badge className="bg-emerald-100 text-emerald-700 border-0 flex items-center gap-1"><BookOpen size={12}/> 수행평가</Badge>;
            case 'event': return <Badge className="bg-blue-100 text-blue-700 border-0 flex items-center gap-1"><CalendarDays size={12}/> 학교 행사</Badge>;
            default: return null;
        }
    };

    if (isLoading || loadingData) return <div className="h-[70vh] flex items-center justify-center"><Loader className="animate-spin text-indigo-600" size={40}/></div>;

    // 만료된 일정과 다가오는 일정을 분리
    const todayStr = getLocalDateStr(new Date());
    const upcomingCalendars = calendars.filter(c => c.endDate >= todayStr);
    const expiredCalendars = calendars.filter(c => c.endDate < todayStr).sort((a,b)=> b.endDate.localeCompare(a.endDate));

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 rounded-3xl p-6 md:p-8 shadow-xl text-white flex flex-col md:flex-row justify-between md:items-center gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-2">
                        <CalendarDays size={28} /> 학사일정 마스터 관제탑
                    </h1>
                    <p className="text-indigo-200 font-medium">단순 출결을 넘어, 학원의 모든 스케줄링 기준이 되는 마스터 데이터를 관리합니다.</p>
                </div>
                <Button onClick={() => { setForm(initialForm); setIsModalOpen(true); }} className="bg-white text-indigo-900 hover:bg-indigo-50 font-bold px-5 py-3 shadow-md flex items-center gap-2 text-lg">
                    <Plus size={20}/> 새 학사일정 등록
                </Button>
            </div>

            {/* 다가오는 일정 */}
            <Card className="p-6 md:p-8 border border-slate-200 shadow-sm rounded-3xl">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                    <Target className="text-rose-500" size={24} />
                    <h2 className="text-xl font-black text-slate-800">진행 중 및 다가오는 학사일정</h2>
                    <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-lg text-sm">{upcomingCalendars.length}건</span>
                </div>

                {upcomingCalendars.length === 0 ? (
                    <div className="text-center py-16 flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <CalendarDays size={32} className="text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-bold text-lg">등록된 일정이 없습니다.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {upcomingCalendars.map(cal => {
                            const now = new Date();
                            const dDay = Math.ceil((new Date(cal.startDate) - now) / (1000 * 60 * 60 * 24));
                            const isOngoing = dDay <= 0 && todayStr <= cal.endDate;

                            return (
                                <div key={cal.id} className="bg-white border-2 border-slate-200 hover:border-indigo-300 rounded-2xl p-5 relative overflow-hidden transition-all shadow-sm group">
                                    {isOngoing && <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500 animate-pulse"></div>}
                                    
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                <span className="text-xs font-black bg-slate-800 text-white px-2 py-0.5 rounded flex items-center gap-1">
                                                    <Building size={12}/> {cal.schoolName}
                                                </span>
                                                {getEventBadge(cal.eventType)}
                                            </div>
                                            <h3 className="text-lg font-black text-slate-900 leading-tight">{cal.eventName}</h3>
                                        </div>
                                        <button onClick={() => handleDelete(cal.id)} className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 size={18}/>
                                        </button>
                                    </div>

                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 mt-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="font-bold text-slate-500">일정</span>
                                            <span className="font-black text-slate-800 tracking-tight">{cal.startDate} ~ {cal.endDate}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="font-bold text-slate-500">D-Day</span>
                                            {isOngoing ? (
                                                <span className="font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded">진행 중</span>
                                            ) : (
                                                <span className="font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">D-{dDay}</span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
                                            <span className="font-bold text-slate-500">자동 출결 면제</span>
                                            {cal.isAttendanceExempt ? (
                                                <span className="font-bold text-emerald-600 flex items-center gap-1"><CheckCircle size={14}/> 작동 중</span>
                                            ) : (
                                                <span className="font-bold text-slate-400">면제 안 됨</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            {/* 지난 일정 */}
            {expiredCalendars.length > 0 && (
                <div className="opacity-70">
                    <h3 className="text-sm font-black text-slate-500 mb-3 ml-2 flex items-center gap-2"><Clock size={16}/> 지난 학사일정 (최근 10건)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {expiredCalendars.slice(0, 10).map(cal => (
                            <div key={cal.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center">
                                <div>
                                    <div className="text-xs font-bold text-slate-500 mb-0.5">{cal.schoolName}</div>
                                    <div className="text-sm font-black text-slate-700">{cal.eventName}</div>
                                </div>
                                <button onClick={() => handleDelete(cal.id)} className="text-slate-300 hover:text-rose-500"><X size={16}/></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 🚀 학사일정 등록 모달 */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="새로운 학사일정 등록">
                <div className="space-y-5 p-2">
                    <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-800 text-sm font-bold flex items-start gap-2 border border-indigo-200 leading-relaxed">
                        <AlertTriangle size={20} className="shrink-0 mt-0.5 text-indigo-600"/>
                        이곳에 일정을 등록하면 학원 전반의 출결 시스템과 학생들의 앱 대시보드(D-Day 배너)에 실시간으로 반영됩니다.
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">1. 학교 급 <span className="text-rose-500">*</span></label>
                            <select 
                                className="w-full border-2 border-slate-300 p-3.5 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" 
                                value={form.schoolLevel} 
                                onChange={e => handleSchoolLevelChange(e.target.value)}
                            >
                                <option value="elementary">초등학교</option>
                                <option value="middle">중학교</option>
                                <option value="high">고등학교</option>
                            </select>
                        </div>
                        <div>
                            {/* 🚀 선택된 학교 급(Level)에 따라 배열을 가져옵니다. */}
                            <label className="text-xs font-black text-slate-700 mb-2 block">2. 대상 학교 <span className="text-rose-500">*</span></label>
                            <select 
                                className="w-full border-2 border-slate-300 p-3.5 rounded-xl outline-none focus:border-indigo-500 font-black text-indigo-900 bg-white" 
                                value={form.schoolName} 
                                onChange={e => setForm({...form, schoolName: e.target.value})}
                            >
                                <option value="" disabled>학교를 선택해주세요</option>
                                {(schoolsData[form.schoolLevel] || []).map(school => (
                                    <option key={school} value={school}>{school}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-black text-slate-700 mb-2 block">3. 일정 유형 <span className="text-rose-500">*</span></label>
                        <div className="grid grid-cols-3 gap-2">
                            <button className={`p-3 rounded-xl font-bold text-sm border-2 transition-all ${form.eventType === 'exam' ? 'bg-rose-50 border-rose-400 text-rose-700' : 'bg-white border-slate-200 text-slate-500'}`} onClick={() => handleEventTypeChange('exam')}>
                                정기고시 (시험)
                            </button>
                            <button className={`p-3 rounded-xl font-bold text-sm border-2 transition-all ${form.eventType === 'performance' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`} onClick={() => handleEventTypeChange('performance')}>
                                수행평가
                            </button>
                            <button className={`p-3 rounded-xl font-bold text-sm border-2 transition-all ${form.eventType === 'event' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`} onClick={() => handleEventTypeChange('event')}>
                                기타 학사행사
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-black text-slate-700 mb-2 block">4. 학사 일정명 (타이틀) <span className="text-rose-500">*</span></label>
                        <input type="text" className="w-full border-2 border-slate-300 p-4 rounded-xl outline-none focus:border-indigo-500 font-black text-lg bg-white" value={form.eventName} onChange={e => setForm({...form, eventName: e.target.value})} placeholder="예: 1학기 중간고사, 과학 탐구보고서 제출" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">5. 시작일 <span className="text-rose-500">*</span></label>
                            <input type="date" className="w-full border-2 border-slate-300 p-4 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">6. 종료일 <span className="text-rose-500">*</span></label>
                            <input type="date" className="w-full border-2 border-slate-300 p-4 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
                        </div>
                    </div>

                    <div className="pt-2">
                        <label className="text-xs font-black text-slate-700 mb-2 block">7. 자동 출결 면제 설정 (Bypass)</label>
                        <label className={`flex items-center gap-3 p-4 border-2 rounded-2xl cursor-pointer transition-all ${form.isAttendanceExempt ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                            <input type="checkbox" className="w-5 h-5 accent-indigo-600" checked={form.isAttendanceExempt} onChange={(e) => setForm({...form, isAttendanceExempt: e.target.checked})} />
                            <div className="flex flex-col">
                                <span className="font-black text-base">해당 기간 정규 출결 면제</span>
                                <span className="text-xs font-bold mt-1 opacity-80">체크 시, 해당 기간 동안 학원에 오지 않아도 지각/결석 처리되지 않습니다.</span>
                            </div>
                        </label>
                    </div>

                    <Button className="w-full py-5 text-xl font-black bg-indigo-600 hover:bg-indigo-700 shadow-xl mt-4 tracking-wider" onClick={handleSaveCalendar} disabled={isSaving}>
                        {isSaving ? <Loader className="animate-spin mx-auto"/> : '학사일정 마스터 배포하기'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}