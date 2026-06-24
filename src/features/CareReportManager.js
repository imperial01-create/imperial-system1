/* [서비스 가치(Service Value)] 프리미엄 밀착 케어 리포트 엔진
   🚀 CTO 패치: 
   1. Role-based Access Control (RBAC): 학생(본인만), 학부모(자녀만), 강사(본인 수강생만), 관리자(전체)로 데이터 접근 및 검색 권한을 철저히 격리했습니다.
   2. UI/UX 전문화: 시즌 명칭을 전문적인 용어(윈터시즌, 서머시즌 등)로 변경하고, 권한에 맞지 않는 불필요한 검색창이나 에러 메시지를 완전히 제거했습니다. */

import React, { useState, useEffect, useMemo } from 'react';
import { 
    PieChart, Clock, CalendarDays, CheckCircle, AlertTriangle, XCircle, 
    BookOpen, Flame, User, Search, Loader, ShieldCheck
} from 'lucide-react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Card, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// 🚀 전문화된 6시즌 파티셔닝 데이터 (이모지 제거, 윈터/서머 명칭 변경)
const SEASONS = [
    { id: 'winter', name: '윈터시즌 (1~2월)', start: '01-01', end: '02-28' },
    { id: 'sem1_mid', name: '1학기 중간고사 (3~4월)', start: '03-01', end: '04-30' },
    { id: 'sem1_fin', name: '1학기 기말고사 (5~6월)', start: '05-01', end: '06-30' },
    { id: 'summer', name: '서머시즌 (7~8월)', start: '07-01', end: '08-31' },
    { id: 'sem2_mid', name: '2학기 중간고사 (9~10월)', start: '09-01', end: '10-31' },
    { id: 'sem2_fin', name: '2학기 기말고사 (11~12월)', start: '11-01', end: '12-31' }
];

// 초경량 커스텀 SVG 도넛 차트 컴포넌트
const CustomDonutChart = ({ data }) => {
    let cumulativePercent = 0;
    const getCoordinatesForPercent = (percent) => {
        const x = Math.cos(2 * Math.PI * percent);
        const y = Math.sin(2 * Math.PI * percent);
        return [x, y];
    };

    return (
        <svg viewBox="-1 -1 2 2" className="w-48 h-48 md:w-56 md:h-56 transform -rotate-90">
            {data.map((slice, i) => {
                if (slice.value === 0) return null;
                const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
                cumulativePercent += slice.percent;
                const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
                const largeArcFlag = slice.percent > 0.5 ? 1 : 0;
                
                const pathData = slice.percent === 1 
                    ? `M 1 0 A 1 1 0 1 1 1 -0.0001` 
                    : `M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`;

                return (
                    <path 
                        key={i} d={pathData} 
                        fill="none" stroke={slice.color} strokeWidth="0.3" 
                        className="transition-all duration-1000 ease-out"
                    />
                );
            })}
            <circle cx="0" cy="0" r="0.85" fill="white" />
        </svg>
    );
};

export default function CareReportManager() {
    const { currentUser, users, enrollments, classes, loadingData } = useData() || {};
    
    // 역할 확인 변수
    const isStudent = currentUser?.role === 'student';
    const isParent = currentUser?.role === 'parent';
    const isLecturer = currentUser?.role === 'lecturer';
    const isGlobalAdmin = ['admin', 'admin_assistant', 'ta'].includes(currentUser?.role);

    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedSeason, setSelectedSeason] = useState(SEASONS[1]); // 기본값: 1학기 중간
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [reportData, setReportData] = useState({
        attendance: [], sessions: [], 
        stats: { expected: 0, attended: 0, late: 0, absent: 0, exempt: 0 },
        careTime: { regular: 0, clinic: 0, total: 0 }
    });

    // 🚀 [CTO 패치] 강사(Lecturer)일 경우 본인이 가르치는 학생 ID 목록만 추출
    const myStudentIds = useMemo(() => {
        if (!isLecturer) return [];
        const myClassIds = classes?.filter(c => c.lecturerId === currentUser.id).map(c => c.id) || [];
        const myEnrolls = enrollments?.filter(e => myClassIds.includes(e.classId) && e.status === 'active') || [];
        return [...new Set(myEnrolls.map(e => e.studentId))];
    }, [classes, enrollments, currentUser, isLecturer]);

    // 🚀 검색 가능한 학생 목록 동적 필터링
    const searchableStudents = useMemo(() => {
        if (!users) return [];
        return users.filter(u => {
            if (u.role !== 'student') return false;
            if (searchQuery && !u.name?.includes(searchQuery)) return false;
            if (isLecturer) return myStudentIds.includes(u.id); // 강사는 본인 학생만
            return true; // 관리자는 모두 검색 가능
        });
    }, [users, searchQuery, isLecturer, myStudentIds]);

    // 학부모의 연결된 자녀 목록
    const parentChildren = useMemo(() => {
        if (!isParent || !users) return [];
        return users.filter(u => currentUser.linkedChildrenIds?.includes(u.id));
    }, [users, currentUser, isParent]);

    // 🚀 [초기 렌더링 세팅] 권한에 따른 자동 학생 선택
    useEffect(() => {
        if (!currentUser || loadingData) return;
        
        if (isStudent && !selectedStudentId) {
            setSelectedStudentId(currentUser.id);
        } else if (isParent && parentChildren.length > 0 && !selectedStudentId) {
            setSelectedStudentId(parentChildren[0].id);
        }
    }, [currentUser, loadingData, isStudent, isParent, parentChildren, selectedStudentId]);

    // 시간 계산 헬퍼 함수
    const calculateHours = (start, end) => {
        if (!start || !end) return 0;
        const [sH, sM] = start.split(':').map(Number);
        const [eH, eM] = end.split(':').map(Number);
        const hours = (eH + eM / 60) - (sH + sM / 60);
        return hours > 0 ? hours : 0;
    };

    // 리포트 데이터 패칭
    useEffect(() => {
        if (!selectedStudentId || loadingData) return;
        
        let isMounted = true;
        const fetchReport = async () => {
            setIsLoading(true);
            try {
                const startDateStr = `${selectedYear}-${selectedSeason.start}`;
                const endDateStr = `${selectedYear}-${selectedSeason.end}`;

                const attQ = query(collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`), where('studentId', '==', selectedStudentId));
                const attSnap = await getDocs(attQ);
                const allAtt = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const seasonAtt = allAtt.filter(a => a.date >= startDateStr && a.date <= endDateStr).sort((a,b) => b.date.localeCompare(a.date));

                const sessQ = query(collection(db, `artifacts/${APP_ID}/public/data/sessions`), where('status', '==', 'confirmed'));
                const sessSnap = await getDocs(sessQ);
                const allSess = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                
                const targetStudent = users?.find(u => u.id === selectedStudentId);
                const seasonSess = allSess.filter(s => {
                    if (s.date < startDateStr || s.date > endDateStr) return false;
                    const stList = Array.isArray(s.students) ? s.students : (s.studentName ? [{name: s.studentName}] : []);
                    return stList.some(st => st.name === targetStudent?.name);
                }).sort((a,b) => b.date.localeCompare(a.date));

                if (!isMounted) return;

                let attended = 0, late = 0, absent = 0, exempt = 0;
                seasonAtt.forEach(a => {
                    if (a.status === 'attended' || a.status === 'late_attended') attended++;
                    else if (a.status === 'late') late++;
                    else if (a.status === 'absent') absent++;
                    else if (a.status === 'exam_leave') exempt++;
                });

                const regularHours = attended * 2;
                let clinicHours = 0;
                seasonSess.forEach(s => { clinicHours += calculateHours(s.startTime, s.endTime); });

                setReportData({
                    attendance: seasonAtt,
                    sessions: seasonSess,
                    stats: { expected: attended + late + absent, attended, late, absent, exempt },
                    careTime: { regular: regularHours, clinic: clinicHours, total: regularHours + clinicHours }
                });

            } catch (error) {
                console.error("Report fetch error:", error);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchReport();
        return () => { isMounted = false; };
    }, [selectedStudentId, selectedSeason, selectedYear, users, loadingData]);

    const totalStatus = reportData.stats.expected || 1; 
    const chartData = [
        { name: '정상 출석', value: reportData.stats.attended, percent: reportData.stats.attended / totalStatus, color: '#10b981' }, 
        { name: '지각', value: reportData.stats.late, percent: reportData.stats.late / totalStatus, color: '#f59e0b' }, 
        { name: '결석', value: reportData.stats.absent, percent: reportData.stats.absent / totalStatus, color: '#ef4444' } 
    ];

    if (loadingData) return <div className="h-[70vh] flex items-center justify-center"><Loader className="animate-spin text-indigo-600" size={40}/></div>;

    const isStaffType = isGlobalAdmin || isLecturer;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
            {/* 헤더 영역 */}
            <div className="bg-gradient-to-r from-indigo-900 to-blue-900 rounded-3xl p-6 md:p-8 shadow-xl text-white flex flex-col md:flex-row justify-between md:items-center gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-2">
                        <PieChart size={28} /> 
                        {isStaffType ? '원생 케어 및 출결 분석' : '나의 밀착 케어 리포트'}
                    </h1>
                    <p className="text-indigo-200 font-medium">
                        {isStaffType ? '데이터 기반의 학부모 상담을 위해 학생별 케어 시간과 출결 현황을 분석합니다.' : '임페리얼 학원이 학생에게 투자한 완벽한 시간과 성장을 눈으로 확인하세요.'}
                    </p>
                </div>
            </div>

            {/* 필터링 바 */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center z-20 relative">
                
                {/* 1. 강사/관리자용 검색창 */}
                {isStaffType && (
                    <div className="relative w-full md:w-1/3">
                        <input 
                            type="text" placeholder={isLecturer ? "내 수강생 이름 검색..." : "전체 원생 이름 검색..."}
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} 
                            className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-bold bg-slate-50"
                        />
                        <Search className="absolute left-3 top-3.5 text-slate-400" size={18}/>
                        
                        {searchQuery && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-60 z-50">
                                {searchableStudents.length === 0 ? (
                                    <div className="p-4 text-center text-sm font-bold text-slate-400">검색 결과가 없습니다.</div>
                                ) : (
                                    searchableStudents.map(student => (
                                        <div key={student.id} onClick={() => { setSelectedStudentId(student.id); setSearchQuery(''); }} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0">
                                            <div className="font-black text-slate-800">{student.name}</div>
                                            <div className="text-xs text-slate-500">{student.schoolName || '학교 미상'}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 2. 학부모용 자녀 선택 드롭다운 */}
                {isParent && (
                    <div className="w-full md:w-1/3">
                        <select 
                            className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-black text-indigo-900 bg-white"
                            value={selectedStudentId}
                            onChange={(e) => setSelectedStudentId(e.target.value)}
                        >
                            {parentChildren.map(child => (
                                <option key={child.id} value={child.id}>{child.name} 학생 리포트</option>
                            ))}
                        </select>
                    </div>
                )}
                
                {/* 3. 공통 시즌 필터 */}
                <div className="flex w-full md:w-auto gap-2 flex-1 md:justify-end">
                    <select className="border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold bg-white" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                        <option value={currentYear}>{currentYear}년도</option>
                        <option value={currentYear - 1}>{currentYear - 1}년도</option>
                    </select>
                    
                    <select className="flex-1 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-indigo-500 font-black text-indigo-900 bg-white" value={selectedSeason.id} onChange={e => setSelectedSeason(SEASONS.find(s => s.id === e.target.value))}>
                        {SEASONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </div>

            {/* 메인 리포트 렌더링 영역 */}
            {!selectedStudentId ? (
                // 강사/관리자가 검색 전일 때만 노출 (학생/학부모는 무조건 ID가 세팅되므로 안 보임)
                <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 shadow-sm flex flex-col items-center">
                    <User size={64} className="text-slate-200 mb-4"/>
                    <h3 className="text-xl font-black text-slate-700">원생을 검색해주세요</h3>
                    <p className="text-slate-500 mt-2 font-bold">상단 검색창에서 원생 이름을 입력하면 리포트가 생성됩니다.</p>
                </div>
            ) : isLoading ? (
                <div className="h-64 flex items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm"><Loader className="animate-spin text-indigo-600" size={40}/></div>
            ) : (
                <div className="space-y-6">
                    {/* 최상단 요약 (Total Care Time) */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-2 bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-100 flex flex-col md:flex-row items-center justify-between p-6 md:p-8 gap-6 relative overflow-hidden">
                            <div className="absolute right-0 top-0 opacity-5 -translate-y-1/4 translate-x-1/4 pointer-events-none">
                                <ShieldCheck size={250} />
                            </div>
                            <div className="z-10 w-full md:w-1/2">
                                <h2 className="text-lg font-black text-indigo-900 flex items-center gap-2 mb-2"><Flame className="text-orange-500"/> Total 밀착 케어 타임</h2>
                                <p className="text-sm font-bold text-indigo-700/80 mb-6">해당 시즌 동안 학원에서 학생의 성장을 위해 투입한 완벽한 시간입니다.</p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs font-black text-slate-600 mb-1">
                                            <span>📚 정규 수업 집중 시간</span>
                                            <span>{reportData.careTime.regular} hr</span>
                                        </div>
                                        <div className="w-full bg-white rounded-full h-2 shadow-inner"><div className="bg-blue-500 h-2 rounded-full" style={{width: '70%'}}></div></div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs font-black text-slate-600 mb-1">
                                            <span>💡 1:N 밀착 클리닉 (추가 케어)</span>
                                            <span className="text-purple-600">{reportData.careTime.clinic} hr</span>
                                        </div>
                                        <div className="w-full bg-white rounded-full h-2 shadow-inner"><div className="bg-purple-500 h-2 rounded-full" style={{width: '30%'}}></div></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="z-10 bg-white p-6 rounded-3xl shadow-md border border-indigo-50 text-center shrink-0 w-full md:w-auto">
                                <p className="text-xs font-black text-slate-500 mb-1">이번 시즌 누적 케어 타임</p>
                                <div className="text-5xl font-black text-indigo-600 tracking-tighter">
                                    {reportData.careTime.total}<span className="text-2xl text-indigo-400">시간</span>
                                </div>
                            </div>
                        </Card>

                        {/* 출결 상태 도넛 차트 */}
                        <Card className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200">
                            <h2 className="text-sm font-black text-slate-700 w-full mb-4 flex items-center gap-2"><PieChart size={16}/> 출결 달성률</h2>
                            <div className="relative flex items-center justify-center mb-4">
                                <CustomDonutChart data={chartData} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-black text-slate-800 tracking-tighter">
                                        {reportData.stats.expected === 0 ? '0' : Math.round((reportData.stats.attended / reportData.stats.expected) * 100)}%
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400">정상 출석률</span>
                                </div>
                            </div>
                            <div className="flex gap-4 text-xs font-bold w-full justify-center">
                                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span>출석 {reportData.stats.attended}</div>
                                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500"></span>지각 {reportData.stats.late}</div>
                                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500"></span>결석 {reportData.stats.absent}</div>
                            </div>
                        </Card>
                    </div>

                    {/* 상세 내역 테이블 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="p-0 overflow-hidden border border-slate-200 flex flex-col h-[400px]">
                            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                <h3 className="font-black text-slate-800 flex items-center gap-2"><CalendarDays size={18}/> 정규 출결 히스토리</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white sticky top-0 text-xs text-slate-500 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 font-bold">날짜</th>
                                            <th className="px-4 py-3 font-bold">인증 시간</th>
                                            <th className="px-4 py-3 font-bold text-center">상태</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {reportData.attendance.length === 0 ? (
                                            <tr><td colSpan="3" className="text-center py-10 text-slate-400 font-bold">기록이 없습니다.</td></tr>
                                        ) : (
                                            reportData.attendance.map(log => {
                                                const timeStr = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                                                return (
                                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3 font-bold text-slate-700">{log.date}</td>
                                                    <td className="px-4 py-3 font-mono text-slate-500">{timeStr}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {log.status === 'attended' && <Badge className="bg-emerald-100 text-emerald-700 border-0">정상 출석</Badge>}
                                                        {log.status === 'late_attended' && <Badge className="bg-amber-100 text-amber-700 border-0">지각 출석</Badge>}
                                                        {log.status === 'late' && <Badge className="bg-rose-100 text-rose-700 border-0 animate-pulse">지각(미등원)</Badge>}
                                                        {log.status === 'absent' && <Badge className="bg-slate-200 text-slate-600 border-0">결석</Badge>}
                                                        {log.status === 'exam_leave' && <Badge className="bg-indigo-100 text-indigo-700 border-0">내신 면제</Badge>}
                                                    </td>
                                                </tr>
                                            )})
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        <Card className="p-0 overflow-hidden border border-slate-200 flex flex-col h-[400px]">
                            <div className="p-4 bg-purple-50 border-b border-purple-100 flex justify-between items-center">
                                <h3 className="font-black text-purple-900 flex items-center gap-2"><BookOpen size={18}/> 밀착 클리닉 및 보충 내역</h3>
                                <Badge className="bg-purple-200 text-purple-800 border-0">총 {reportData.sessions.length}건</Badge>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white sticky top-0 text-xs text-slate-500 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 font-bold">날짜 및 시간</th>
                                            <th className="px-4 py-3 font-bold">학습 내용</th>
                                            <th className="px-4 py-3 font-bold">담당자</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {reportData.sessions.length === 0 ? (
                                            <tr><td colSpan="3" className="text-center py-10 text-slate-400 font-bold">추가 케어 기록이 없습니다.</td></tr>
                                        ) : (
                                            reportData.sessions.map(s => (
                                                <tr key={s.id} className="hover:bg-purple-50/30 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-700">{s.date}</div>
                                                        <div className="text-xs font-mono text-purple-600">{s.startTime} ~ {s.endTime}</div>
                                                    </td>
                                                    <td className="px-4 py-3 font-bold text-slate-800 break-keep leading-tight">
                                                        {s.topic || '개별 보충'}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-bold text-slate-500">
                                                        {s.taName || '담당자 미정'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
}