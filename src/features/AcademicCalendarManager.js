/* [학사일정 마스터] 학원의 모든 날짜 기준을 한곳에서 관리합니다.
 *
 * 왜 한곳에 모았나
 * ---------------
 * 달력을 그리는 화면이 9곳인데 각자 따로 그리고 있었습니다. 그래서
 *   - 설날에도 클리닉 예약 슬롯이 열리고
 *   - 학원 방학 기간에 강의가 생성되고
 *   - 시즌은 환경설정에, 학교 시험은 여기에, 공휴일은 아예 없는
 * 상태였습니다. "이 날 학원이 운영하는가"를 아는 곳이 시스템에 없었습니다.
 *
 * 세 가지를 탭으로 묶습니다.
 *   1. 학원 달력   : 공휴일(서버 자동) · 휴원일 · 학원 행사   → academy_calendar
 *   2. 학교 학사일정: 학교별 시험·수행평가                     → academic_calendars
 *   3. 시즌        : 윈터/중간/기말/서머                       → settings/master_data 의 seasons
 *
 * ⚠️ 시즌은 '편집 화면만' 여기로 옮겼습니다. 저장 위치는 그대로 settings/master_data 입니다.
 *    LectureManager·AttendanceManager·CareReportManager·VocaManager·PayrollManager 가
 *    useSeasonAutoSelect 를 통해 그 값을 쓰고 있어서, 저장 위치를 옮기면 전부 손봐야 합니다.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
    CalendarDays, Target, BookOpen, AlertTriangle, Plus, Trash2,
    Building, CheckCircle, Clock, X, Loader, RefreshCcw, Layers, Save, Sun
} from 'lucide-react';
import { collection, query, onSnapshot, doc, deleteDoc, setDoc, serverTimestamp, addDoc, getDoc, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Modal, Button, Card, Badge } from '../components/UI';
import { APP_ID } from '../constants';
import { getDayInfo, getDayStyle, DAY_TONE_CLASS, CALENDAR_TYPE_LABEL, toDateStr } from '../utils/academyCalendar';

const CAL_PATH = `artifacts/${APP_ID}/public/data/academy_calendar`;
const SCHOOL_CAL_PATH = `artifacts/${APP_ID}/public/data/academic_calendars`;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const SEASON_TYPES = ['윈터시즌', '1학기 중간고사', '1학기 기말고사', '서머시즌', '2학기 중간고사', '2학기 기말고사'];

export default function AcademicCalendarManager() {
    const { currentUser, academyCalendar = [], masterData, loadingData } = useData() || {};
    const isDesk = ['admin', 'admin_assistant'].includes(currentUser?.role);

    const [tab, setTab] = useState('academy');
    const [schoolCalendars, setSchoolCalendars] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [schoolsData, setSchoolsData] = useState({ elementary: [], middle: [], high: [] });

    // ── 학원 달력 ────────────────────────────────────────────────
    const [viewDate, setViewDate] = useState(() => new Date());
    const [syncing, setSyncing] = useState(false);
    const [entryModal, setEntryModal] = useState(false);
    const [savingEntry, setSavingEntry] = useState(false);
    const todayStr = toDateStr(new Date());
    const blankEntry = { type: 'closure', title: '', startDate: todayStr, endDate: todayStr, isClosed: true, memo: '' };
    const [entry, setEntry] = useState(blankEntry);

    // ── 학교 학사일정 ─────────────────────────────────────────────
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const blankSchoolForm = {
        schoolLevel: 'high', schoolName: '', eventType: 'exam',
        eventName: '', startDate: todayStr, endDate: todayStr, isAttendanceExempt: true
    };
    const [form, setForm] = useState(blankSchoolForm);

    // ── 시즌 ─────────────────────────────────────────────────────
    const seasons = useMemo(() => masterData?.seasons || [], [masterData]);
    const [seasonDraft, setSeasonDraft] = useState(null); // null 이면 저장된 값 그대로
    const workingSeasons = seasonDraft ?? seasons;
    const [newSeason, setNewSeason] = useState({ year: new Date().getFullYear(), type: SEASON_TYPES[0], startDate: '', endDate: '' });
    const [savingSeasons, setSavingSeasons] = useState(false);

    useEffect(() => {
        const q = query(collection(db, SCHOOL_CAL_PATH), orderBy('startDate', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setSchoolCalendars(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        }, (e) => { console.error('[학사일정] 구독 실패:', e); setIsLoading(false); });
        return () => unsub();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'schools'));
                if (snap.exists()) setSchoolsData(snap.data());
            } catch (e) { console.error('학교 목록 조회 실패:', e); }
        })();
    }, []);

    // ── 달력 격자 ────────────────────────────────────────────────
    const monthGrid = useMemo(() => {
        const y = viewDate.getFullYear();
        const m = viewDate.getMonth();
        const first = new Date(y, m, 1);
        const start = new Date(y, m, 1 - first.getDay()); // 그 주 일요일부터
        const cells = [];
        for (let i = 0; i < 42; i += 1) {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const dateStr = toDateStr(d);
            cells.push({
                dateStr,
                day: d.getDate(),
                inMonth: d.getMonth() === m,
                info: getDayInfo(dateStr, { calendar: academyCalendar, seasons, schoolCalendars })
            });
        }
        return cells;
    }, [viewDate, academyCalendar, seasons, schoolCalendars]);

    const moveMonth = (delta) => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

    const handleSyncHolidays = async () => {
        if (!window.confirm('올해와 내년 공휴일을 공공데이터포털에서 받아옵니다.\n\n직접 수정하신 항목은 덮어쓰지 않습니다.\n계속할까요?')) return;
        setSyncing(true);
        try {
            const fn = httpsCallable(functions, 'syncPublicHolidays');
            const res = await fn({});
            const d = res?.data || {};
            alert(`✅ 공휴일 반영 완료\n\n대상 연도: ${(d.years || []).join(', ')}\n새로 추가: ${d.added ?? 0}건\n갱신: ${d.updated ?? 0}건\n직접 수정분 유지: ${d.keptManual ?? 0}건`);
        } catch (e) {
            alert('공휴일 가져오기 실패: ' + (e.message || '서버 오류'));
        } finally { setSyncing(false); }
    };

    const handleSaveEntry = async () => {
        if (!entry.title.trim()) return alert('일정 이름을 입력해주세요.');
        if (entry.startDate > entry.endDate) return alert('시작일이 종료일보다 늦을 수 없습니다.');
        setSavingEntry(true);
        try {
            await addDoc(collection(db, CAL_PATH), {
                type: entry.type,
                title: entry.title.trim(),
                startDate: entry.startDate,
                endDate: entry.endDate,
                isClosed: !!entry.isClosed,
                memo: entry.memo || '',
                source: 'manual',
                createdBy: currentUser?.name || '관리자',
                createdAt: serverTimestamp()
            });
            setEntryModal(false);
            setEntry(blankEntry);
        } catch (e) { alert('저장 실패: ' + e.message); } finally { setSavingEntry(false); }
    };

    const handleDeleteEntry = async (item) => {
        const extra = item.source === 'system'
            ? '\n\n※ 공휴일 항목입니다. 지워도 다음 [공휴일 가져오기] 때 다시 생깁니다.\n   그 날 학원을 운영하신다면 삭제 대신 "이 날 학원 쉼"을 꺼두세요.'
            : '';
        if (!window.confirm(`[${item.title}] 을(를) 삭제할까요?${extra}`)) return;
        try { await deleteDoc(doc(db, CAL_PATH, item.id)); } catch (e) { alert('삭제 실패: ' + e.message); }
    };

    /** 공휴일인데 학원은 여는 날 → 휴원 표시만 끈다 (항목은 남겨 화면에 이름이 보이게) */
    const toggleClosed = async (item) => {
        try {
            await setDoc(doc(db, CAL_PATH, item.id), { isClosed: !item.isClosed, source: 'manual' }, { merge: true });
        } catch (e) { alert('변경 실패: ' + e.message); }
    };

    const handleSaveSchoolCalendar = async () => {
        if (!form.schoolName || !form.eventName) return alert('학교와 일정명을 입력해주세요.');
        if (form.startDate > form.endDate) return alert('시작일이 종료일보다 늦을 수 없습니다.');
        setIsSaving(true);
        try {
            await addDoc(collection(db, SCHOOL_CAL_PATH), { ...form, createdAt: serverTimestamp(), createdBy: currentUser?.name || '관리자' });
            setIsModalOpen(false);
            setForm(blankSchoolForm);
        } catch (e) { alert('저장 실패: ' + e.message); } finally { setIsSaving(false); }
    };

    const handleDeleteSchoolCalendar = async (id) => {
        if (!window.confirm('이 학사일정을 삭제할까요?\n연동된 출결 면제와 학생 화면 D-Day 배너가 즉시 사라집니다.')) return;
        try { await deleteDoc(doc(db, SCHOOL_CAL_PATH, id)); } catch (e) { alert('삭제 실패: ' + e.message); }
    };

    // ── 시즌 저장 (저장 위치는 기존과 동일: settings/master_data) ──
    const addSeason = () => {
        if (!newSeason.year || !newSeason.type || !newSeason.startDate || !newSeason.endDate) return alert('연도·종류·시작일·종료일을 모두 입력해주세요.');
        if (newSeason.startDate > newSeason.endDate) return alert('시작일이 종료일보다 늦을 수 없습니다.');
        const name = `${newSeason.year} ${newSeason.type}`;
        if (workingSeasons.some(s => s.name === name)) return alert(`이미 [${name}] 시즌이 있습니다.`);
        setSeasonDraft([...workingSeasons, { id: `season_${Date.now()}`, name, startDate: newSeason.startDate, endDate: newSeason.endDate }]);
        setNewSeason(prev => ({ ...prev, startDate: '', endDate: '' }));
    };

    const removeSeason = (idx) => {
        if (!window.confirm('이 시즌을 삭제할까요?\n이미 이 시즌으로 개설된 강의는 과거 데이터로 분류될 수 있습니다.')) return;
        const arr = [...workingSeasons];
        arr.splice(idx, 1);
        setSeasonDraft(arr);
    };

    const saveSeasons = async () => {
        setSavingSeasons(true);
        try {
            // ⚠️ merge:true 필수. 이 문서에는 학원명·강의실·과목도 함께 들어 있다.
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'master_data'),
                { seasons: workingSeasons }, { merge: true });
            setSeasonDraft(null);
            alert('시즌이 저장되었습니다.');
        } catch (e) { alert('저장 실패: ' + e.message); } finally { setSavingSeasons(false); }
    };

    if (isLoading || loadingData) {
        return <div className="h-[70vh] flex items-center justify-center"><Loader className="animate-spin text-indigo-600" size={40} /></div>;
    }

    const upcoming = schoolCalendars.filter(c => c.endDate >= todayStr);
    const expired = schoolCalendars.filter(c => c.endDate < todayStr).sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
    const futureEntries = [...academyCalendar]
        .filter(c => (c.endDate || c.startDate) >= todayStr)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

    const eventBadge = (type) => {
        if (type === 'exam') return <Badge color="red" customLabel="정기고시(시험)" />;
        if (type === 'performance') return <Badge color="green" customLabel="수행평가" />;
        return <Badge color="blue" customLabel="학교 행사" />;
    };

    const TABS = [
        { key: 'academy', label: '학원 달력', icon: CalendarDays },
        { key: 'school', label: '학교 학사일정', icon: Building },
        { key: 'season', label: '시즌 관리', icon: Layers },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 rounded-3xl p-6 md:p-8 shadow-xl text-white">
                <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-2">
                    <CalendarDays size={28} /> 학사일정 마스터
                </h1>
                <p className="text-indigo-200 font-medium">
                    공휴일·휴원일·시즌·학교 시험을 한곳에서 관리합니다. 여기서 정한 기준을 클리닉·강의·상담 화면이 함께 봅니다.
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex overflow-x-auto">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`px-6 py-4 font-bold text-sm whitespace-nowrap flex items-center gap-2 transition-colors ${tab === key ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>

            {/* ══════════════ 1. 학원 달력 ══════════════ */}
            {tab === 'academy' && (
                <div className="space-y-6 animate-in fade-in">
                    <Card className="p-5 md:p-6 rounded-3xl border border-slate-200">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                            {/* 좁은 화면에서 이 줄이 화면 폭을 넘겨 오른쪽이 잘렸다.
                                고정 폭(min-w-[140px])을 없애고 제목이 남는 자리를 차지하게 한다.
                                제목 자체는 절대 줄바꿈되지 않도록 nowrap 을 준다. */}
                            <div className="flex items-center gap-1 sm:gap-3 w-full md:w-auto">
                                <Button variant="ghost" onClick={() => moveMonth(-1)} className="px-2 sm:px-3 shrink-0">‹</Button>
                                <h2 className="text-lg sm:text-xl font-black text-slate-800 flex-1 md:flex-none md:min-w-[140px] text-center whitespace-nowrap">
                                    {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
                                </h2>
                                <Button variant="ghost" onClick={() => moveMonth(1)} className="px-2 sm:px-3 shrink-0">›</Button>
                                <Button variant="ghost" onClick={() => setViewDate(new Date())} className="text-xs px-2 sm:px-3 shrink-0 whitespace-nowrap">오늘</Button>
                            </div>
                            {isDesk && (
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" icon={syncing ? Loader : RefreshCcw} onClick={handleSyncHolidays} disabled={syncing}>
                                        {syncing ? '가져오는 중…' : '공휴일 가져오기'}
                                    </Button>
                                    <Button icon={Plus} onClick={() => { setEntry(blankEntry); setEntryModal(true); }}>휴원일 · 행사 등록</Button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {WEEKDAYS.map((w, i) => (
                                <div key={w} className={`text-center text-xs font-black py-2 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>{w}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {monthGrid.map(cell => {
                                const style = getDayStyle(cell.info);
                                const isToday = cell.dateStr === todayStr;
                                return (
                                    <div key={cell.dateStr}
                                        className={`min-h-[52px] sm:min-h-[84px] border rounded-xl p-1 sm:p-1.5 text-left transition-colors overflow-hidden ${cell.inMonth ? 'bg-white border-slate-200' : 'bg-slate-50/60 border-slate-100 opacity-50'} ${DAY_TONE_CLASS[style.tone] || ''} ${cell.info.isClosed ? 'bg-slate-200' : ''}`}>
                                        <div className="flex items-center justify-between">
                                            <span className={`text-xs font-black ${isToday ? 'bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : ''} ${!isToday && cell.info.isSunday ? 'text-red-500' : ''}`}>
                                                {cell.day}
                                            </span>
                                            {cell.info.isClosed && <span className="hidden sm:inline text-[9px] font-black bg-slate-700 text-white px-1 rounded leading-none py-0.5">휴원</span>}
                                        </div>
                                        {style.label && <div className="hidden sm:block text-[10px] font-bold mt-1 leading-tight break-keep">{style.label}</div>}
                                        {cell.info.schoolExams.slice(0, 2).map(ex => (
                                            <div key={ex.id} className="hidden sm:block text-[9px] text-slate-500 mt-0.5 truncate" title={`${ex.schoolName} ${ex.eventName}`}>
                                                · {ex.schoolName} {ex.eventName}
                                            </div>
                                        ))}
                                        {cell.info.season && cell.inMonth && (
                                            <div className="hidden sm:block text-[9px] text-indigo-400 font-bold mt-0.5 truncate">{cell.info.season.name}</div>
                                        )}
                                        {/* 모바일에서는 글씨 대신 점으로만 알린다 (칸이 40px 남짓이라 겹친다) */}
                                        <div className="sm:hidden flex gap-0.5 mt-1">
                                            {cell.info.holidayName && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
                                            {cell.info.events.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />}
                                            {cell.info.schoolExams.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-100 text-[11px] font-bold text-slate-500">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block" /> 공휴일</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-200 inline-block" /> 휴원</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-50 border border-indigo-200 inline-block" /> 학원 행사</span>
                            <span className="flex items-center gap-1">· 학교 시험</span>
                        </div>
                    </Card>

                    <Card className="p-6 rounded-3xl border border-slate-200">
                        <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
                            <Clock size={18} className="text-indigo-500" /> 앞으로의 일정 <span className="text-sm font-bold text-slate-400">{futureEntries.length}건</span>
                        </h3>
                        <p className="text-xs text-slate-500 font-bold mb-4 leading-relaxed">
                            공휴일은 달력에 <span className="text-red-500">빨간날</span>로 표시만 되고 <strong>기본값은 정상 운영</strong>입니다.
                            실제로 쉬는 날은 <span className="bg-slate-700 text-white px-1.5 py-0.5 rounded text-[10px]">학원 쉼</span> 으로 직접 지정해 주세요.
                            지정한 날만 클리닉 정기 스케줄 일괄 생성에서 빠집니다. (개별 슬롯은 막지 않습니다)
                        </p>
                        {futureEntries.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl">
                                등록된 일정이 없습니다. 먼저 <strong>공휴일 가져오기</strong>를 실행해 보세요.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {futureEntries.slice(0, 40).map(item => (
                                    <div key={item.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-4 py-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-black text-slate-800">{item.title}</span>
                                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{CALENDAR_TYPE_LABEL[item.type] || item.type}</span>
                                                {item.source === 'system' && <span className="text-[10px] font-bold text-slate-400">자동</span>}
                                            </div>
                                            <div className="text-xs text-slate-500 font-bold mt-0.5">
                                                {item.startDate}{item.endDate && item.endDate !== item.startDate ? ` ~ ${item.endDate}` : ''}
                                            </div>
                                        </div>
                                        {isDesk && (
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button onClick={() => toggleClosed(item)}
                                                    className={`text-[11px] font-black px-2.5 py-1.5 rounded-lg border transition-colors ${item.isClosed ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-300'}`}
                                                    title="이 날 학원을 운영하면 꺼두세요">
                                                    {item.isClosed ? '학원 쉼' : '정상 운영'}
                                                </button>
                                                <button onClick={() => handleDeleteEntry(item)} className="text-slate-300 hover:text-rose-500 p-1"><Trash2 size={16} /></button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* ══════════════ 2. 학교 학사일정 ══════════════ */}
            {tab === 'school' && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex justify-end">
                        <Button onClick={() => { setForm(blankSchoolForm); setIsModalOpen(true); }} icon={Plus}>새 학사일정 등록</Button>
                    </div>

                    <Card className="p-6 md:p-8 border border-slate-200 rounded-3xl">
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                            <Target className="text-rose-500" size={24} />
                            <h2 className="text-xl font-black text-slate-800">진행 중 및 다가오는 학사일정</h2>
                            <span className="bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-lg text-sm">{upcoming.length}건</span>
                        </div>

                        {upcoming.length === 0 ? (
                            <div className="text-center py-16 text-slate-500 font-bold">등록된 일정이 없습니다.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {upcoming.map(cal => {
                                    const dDay = Math.ceil((new Date(cal.startDate) - new Date()) / (1000 * 60 * 60 * 24));
                                    const isOngoing = dDay <= 0 && todayStr <= cal.endDate;
                                    return (
                                        <div key={cal.id} className="bg-white border-2 border-slate-200 hover:border-indigo-300 rounded-2xl p-5 relative overflow-hidden transition-all shadow-sm group">
                                            {isOngoing && <div className="absolute top-0 left-0 w-full h-1.5 bg-rose-500 animate-pulse" />}
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                                        <span className="text-xs font-black bg-slate-800 text-white px-2 py-0.5 rounded flex items-center gap-1"><Building size={12} /> {cal.schoolName}</span>
                                                        {eventBadge(cal.eventType)}
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-900 leading-tight">{cal.eventName}</h3>
                                                </div>
                                                <button onClick={() => handleDeleteSchoolCalendar(cal.id)} className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                                            </div>
                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 mt-4">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-slate-500">일정</span>
                                                    <span className="font-black text-slate-800">{cal.startDate} ~ {cal.endDate}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-bold text-slate-500">D-Day</span>
                                                    {isOngoing
                                                        ? <span className="font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded">진행 중</span>
                                                        : <span className="font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">D-{dDay}</span>}
                                                </div>
                                                <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
                                                    <span className="font-bold text-slate-500">자동 출결 면제</span>
                                                    {cal.isAttendanceExempt
                                                        ? <span className="font-bold text-emerald-600 flex items-center gap-1"><CheckCircle size={14} /> 작동 중</span>
                                                        : <span className="font-bold text-slate-400">면제 안 됨</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    {expired.length > 0 && (
                        <div className="opacity-70">
                            <h3 className="text-sm font-black text-slate-500 mb-3 ml-2 flex items-center gap-2"><Clock size={16} /> 지난 학사일정 (최근 10건)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {expired.slice(0, 10).map(cal => (
                                    <div key={cal.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center">
                                        <div>
                                            <div className="text-xs font-bold text-slate-500 mb-0.5">{cal.schoolName}</div>
                                            <div className="text-sm font-black text-slate-700">{cal.eventName}</div>
                                        </div>
                                        <button onClick={() => handleDeleteSchoolCalendar(cal.id)} className="text-slate-300 hover:text-rose-500"><X size={16} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════ 3. 시즌 관리 ══════════════ */}
            {tab === 'season' && (
                <div className="space-y-6 animate-in fade-in">
                    <Card className="p-6 md:p-8 rounded-3xl border border-indigo-200">
                        <h2 className="text-xl font-black text-indigo-900 border-b border-indigo-100 pb-4 mb-5 flex items-center gap-2">
                            <Layers className="text-indigo-600" /> 글로벌 시즌 관리
                        </h2>

                        <div className="bg-indigo-50 text-indigo-900 p-4 rounded-2xl border border-indigo-200 text-sm mb-5 leading-relaxed">
                            <p className="font-bold flex items-center gap-1.5 mb-2"><Sun size={16} /> 시즌은 강의·출결·리포트·급여 화면의 기준입니다</p>
                            <p>• 이름은 <strong>연도 + 종류</strong>로 자동 생성됩니다. 표기가 갈리지 않게 하기 위해서입니다.</p>
                            <p>• 저장 위치는 기존과 같습니다(환경설정의 마스터 데이터). <strong>편집 화면만 이곳으로 옮겼습니다.</strong></p>
                        </div>

                        <div className="flex flex-col xl:flex-row gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 mb-5">
                            <input type="number" className="w-full xl:w-28 border-2 border-indigo-200 p-2.5 rounded-lg outline-none font-bold text-sm focus:border-indigo-500"
                                value={newSeason.year} onChange={e => setNewSeason({ ...newSeason, year: e.target.value })} placeholder="연도" />
                            <select className="flex-1 border-2 border-indigo-200 p-2.5 rounded-lg outline-none font-bold text-sm bg-white text-indigo-900 focus:border-indigo-500 min-w-[150px]"
                                value={newSeason.type} onChange={e => setNewSeason({ ...newSeason, type: e.target.value })}>
                                {SEASON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <div className="flex items-center gap-2 w-full xl:w-auto">
                                <input type="date" className="flex-1 border-2 border-slate-200 p-2.5 rounded-lg outline-none font-bold text-sm focus:border-indigo-500"
                                    value={newSeason.startDate} onChange={e => setNewSeason({ ...newSeason, startDate: e.target.value })} />
                                <span className="text-slate-400 font-black">~</span>
                                <input type="date" className="flex-1 border-2 border-slate-200 p-2.5 rounded-lg outline-none font-bold text-sm focus:border-indigo-500"
                                    value={newSeason.endDate} onChange={e => setNewSeason({ ...newSeason, endDate: e.target.value })} />
                            </div>
                            <Button onClick={addSeason} icon={Plus} className="shrink-0">추가</Button>
                        </div>

                        {workingSeasons.length === 0 ? (
                            <div className="text-sm text-slate-400 font-bold text-center py-8 border-2 border-dashed border-slate-200 rounded-2xl">등록된 시즌이 없습니다.</div>
                        ) : (
                            <div className="space-y-2">
                                {[...workingSeasons].sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || ''))).map((s) => {
                                    const idx = workingSeasons.findIndex(x => x.id === s.id);
                                    const isNow = todayStr >= (s.startDate || '') && todayStr <= (s.endDate || '');
                                    return (
                                        <div key={s.id} className={`flex items-center justify-between gap-3 border rounded-xl px-4 py-3 ${isNow ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                                            <div>
                                                <div className="font-black text-slate-800 flex items-center gap-2">
                                                    {s.name}
                                                    {isNow && <span className="text-[10px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded">진행 중</span>}
                                                </div>
                                                <div className="text-xs text-slate-500 font-bold mt-0.5">{s.startDate} ~ {s.endDate}</div>
                                            </div>
                                            <button onClick={() => removeSeason(idx)} className="text-slate-300 hover:text-rose-500 p-1"><Trash2 size={16} /></button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {seasonDraft !== null && (
                            <div className="mt-5 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                <span className="text-sm font-bold text-amber-900">저장하지 않은 변경사항이 있습니다.</span>
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={() => setSeasonDraft(null)}>되돌리기</Button>
                                    <Button icon={savingSeasons ? Loader : Save} onClick={saveSeasons} disabled={savingSeasons}>
                                        {savingSeasons ? '저장 중…' : '시즌 저장'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* ── 휴원일 · 행사 등록 모달 ── */}
            <Modal isOpen={entryModal} onClose={() => setEntryModal(false)} title="휴원일 · 학원 행사 등록">
                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-black text-slate-700 mb-2 block">종류</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setEntry({ ...entry, type: 'closure', isClosed: true })}
                                className={`p-3 rounded-xl font-bold text-sm border-2 ${entry.type === 'closure' ? 'bg-slate-100 border-slate-500 text-slate-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                                휴원 (방학·워크숍)
                            </button>
                            <button onClick={() => setEntry({ ...entry, type: 'event', isClosed: false })}
                                className={`p-3 rounded-xl font-bold text-sm border-2 ${entry.type === 'event' ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                학원 행사 (설명회·특강)
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-black text-slate-700 mb-2 block">일정 이름 <span className="text-rose-500">*</span></label>
                        <input className="w-full border-2 border-slate-300 p-4 rounded-xl outline-none focus:border-indigo-500 font-black text-lg"
                            value={entry.title} onChange={e => setEntry({ ...entry, title: e.target.value })}
                            placeholder="예: 여름 정기 휴원, 학부모 설명회" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">시작일</label>
                            <input type="date" className="w-full border-2 border-slate-300 p-3.5 rounded-xl outline-none focus:border-indigo-500 font-bold"
                                value={entry.startDate} onChange={e => setEntry({ ...entry, startDate: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">종료일</label>
                            <input type="date" className="w-full border-2 border-slate-300 p-3.5 rounded-xl outline-none focus:border-indigo-500 font-bold"
                                value={entry.endDate} onChange={e => setEntry({ ...entry, endDate: e.target.value })} />
                        </div>
                    </div>

                    <label className={`flex items-center gap-3 p-4 border-2 rounded-2xl cursor-pointer ${entry.isClosed ? 'bg-slate-100 border-slate-500' : 'bg-white border-slate-200'}`}>
                        <input type="checkbox" className="w-5 h-5 accent-slate-700" checked={entry.isClosed} onChange={e => setEntry({ ...entry, isClosed: e.target.checked })} />
                        <div className="flex flex-col">
                            <span className="font-black text-base">이 기간 학원이 쉽니다</span>
                            <span className="text-xs font-bold mt-1 text-slate-500">
                                체크하면 앞으로 클리닉 예약·강의 생성·상담 예약에서 이 기간이 제외됩니다.
                            </span>
                        </div>
                    </label>

                    <div>
                        <label className="text-xs font-black text-slate-700 mb-2 block">메모 (선택)</label>
                        <input className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 text-sm"
                            value={entry.memo} onChange={e => setEntry({ ...entry, memo: e.target.value })} placeholder="내부 참고용" />
                    </div>

                    <Button className="w-full py-4 text-lg font-black" onClick={handleSaveEntry} disabled={savingEntry}>
                        {savingEntry ? <Loader className="animate-spin mx-auto" /> : '등록하기'}
                    </Button>
                </div>
            </Modal>

            {/* ── 학교 학사일정 등록 모달 ── */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="새로운 학사일정 등록">
                <div className="space-y-5 p-2">
                    <div className="bg-indigo-50 p-4 rounded-2xl text-indigo-800 text-sm font-bold flex items-start gap-2 border border-indigo-200 leading-relaxed">
                        <AlertTriangle size={20} className="shrink-0 mt-0.5 text-indigo-600" />
                        여기에 등록하면 출결 면제와 학생 대시보드의 D-Day 배너에 실시간으로 반영됩니다.
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">1. 학교 급 <span className="text-rose-500">*</span></label>
                            <select className="w-full border-2 border-slate-300 p-3.5 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white"
                                value={form.schoolLevel} onChange={e => setForm({ ...form, schoolLevel: e.target.value, schoolName: '' })}>
                                <option value="elementary">초등학교</option>
                                <option value="middle">중학교</option>
                                <option value="high">고등학교</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">2. 대상 학교 <span className="text-rose-500">*</span></label>
                            <select className="w-full border-2 border-slate-300 p-3.5 rounded-xl outline-none focus:border-indigo-500 font-black text-indigo-900 bg-white"
                                value={form.schoolName} onChange={e => setForm({ ...form, schoolName: e.target.value })}>
                                <option value="" disabled>학교를 선택해주세요</option>
                                {(schoolsData[form.schoolLevel] || []).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-black text-slate-700 mb-2 block">3. 일정 유형 <span className="text-rose-500">*</span></label>
                        <div className="grid grid-cols-3 gap-2">
                            {[['exam', '정기고시 (시험)'], ['performance', '수행평가'], ['event', '기타 학사행사']].map(([v, label]) => (
                                <button key={v} onClick={() => setForm({ ...form, eventType: v, isAttendanceExempt: v === 'exam' })}
                                    className={`p-3 rounded-xl font-bold text-sm border-2 transition-all ${form.eventType === v ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-black text-slate-700 mb-2 block">4. 학사 일정명 <span className="text-rose-500">*</span></label>
                        <input className="w-full border-2 border-slate-300 p-4 rounded-xl outline-none focus:border-indigo-500 font-black text-lg"
                            value={form.eventName} onChange={e => setForm({ ...form, eventName: e.target.value })} placeholder="예: 1학기 중간고사" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">5. 시작일 <span className="text-rose-500">*</span></label>
                            <input type="date" className="w-full border-2 border-slate-300 p-4 rounded-xl outline-none focus:border-indigo-500 font-bold"
                                value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                        </div>
                        <div>
                            <label className="text-xs font-black text-slate-700 mb-2 block">6. 종료일 <span className="text-rose-500">*</span></label>
                            <input type="date" className="w-full border-2 border-slate-300 p-4 rounded-xl outline-none focus:border-indigo-500 font-bold"
                                value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                        </div>
                    </div>

                    <label className={`flex items-center gap-3 p-4 border-2 rounded-2xl cursor-pointer ${form.isAttendanceExempt ? 'bg-indigo-50 border-indigo-400 text-indigo-900' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                        <input type="checkbox" className="w-5 h-5 accent-indigo-600" checked={form.isAttendanceExempt} onChange={e => setForm({ ...form, isAttendanceExempt: e.target.checked })} />
                        <div className="flex flex-col">
                            <span className="font-black text-base">해당 기간 정규 출결 면제</span>
                            <span className="text-xs font-bold mt-1 opacity-80">체크하면 그 기간에 학원에 오지 않아도 지각·결석 처리되지 않습니다.</span>
                        </div>
                    </label>

                    <Button className="w-full py-5 text-xl font-black" onClick={handleSaveSchoolCalendar} disabled={isSaving}>
                        {isSaving ? <Loader className="animate-spin mx-auto" /> : '학사일정 등록'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
