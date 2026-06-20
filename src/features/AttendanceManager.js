/* [서비스 가치(Service Value)] 통합 출결 및 공간 관제 엔진 v8.0
   1. 공간 최적화: '교실 매트릭스' 탭을 통해 학원의 시공간 자원을 시각화하고 데드타임을 제거합니다.
   2. 지능형 인원 계산: 시험 기간 결석자(Exam Leave)를 정규반 실제 등원 예정 인원에서 자동 차감하여 빈 교실을 찾아냅니다.
   3. O(n) 렌더링 최적화: 30분 단위 테이블 렌더링 시 RowSpan을 동적 계산하여 React 렌더링 과부하를 방지합니다. */

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Clock, MapPin, CheckCircle, 
    User, Users, Search, Loader, PhoneCall, ShieldAlert, Check,
    CalendarDays, UserCheck, AlertTriangle, Plus, Trash2, Calendar, LayoutGrid, ArrowRightLeft
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Card, Button, Modal, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];
// 매트릭스 관제를 위한 시간대 (14:00 ~ 22:00, 30분 단위)
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
    const hour = Math.floor(i / 2) + 14;
    const min = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${min}`;
});

const getLocalDateStr = (dateObj) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
};

const AttendanceManager = ({ currentUser }) => {
    const { classes, enrollments, users, masterData, loadingData } = useData();

    // --- State ---
    const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'student', 'exam_leave', 'matrix'
    const [currentTime, setCurrentTime] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState('');
    
    const [dailyAttendances, setDailyAttendances] = useState([]); 
    const [examLeaves, setExamLeaves] = useState([]);
    const [todaySessions, setTodaySessions] = useState([]); // 클리닉/직보 데이터
    const [localLoading, setLocalLoading] = useState(true);

    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [studentLogs, setStudentLogs] = useState([]);

    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ studentId: '', startDate: '', endDate: '', reason: '중간/기말고사 대비' });
    const [isSavingLeave, setIsSavingLeave] = useState(false);

    const todayStr = DAYS_OF_WEEK[currentTime.getDay()];
    const todayDateStr = getLocalDateStr(currentTime);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // 출결 로그 구독
    useEffect(() => {
        const qAtt = query(collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`), where('date', '==', todayDateStr));
        const unsubAtt = onSnapshot(qAtt, s => {
            setDailyAttendances(s.docs.map(d => ({ id: d.id, ...d.data() })));
            setLocalLoading(false);
        });
        return () => unsubAtt();
    }, [todayDateStr]);

    // 시험 결석자 구독
    useEffect(() => {
        const qLeave = query(collection(db, `artifacts/${APP_ID}/public/data/exam_leaves`));
        const unsubLeave = onSnapshot(qLeave, s => setExamLeaves(s.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsubLeave();
    }, []);

    // 당일 보충/클리닉(세션) 구독
    useEffect(() => {
        const qSession = query(collection(db, `artifacts/${APP_ID}/public/data/sessions`), where('date', '==', todayDateStr));
        const unsubSession = onSnapshot(qSession, s => setTodaySessions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsubSession();
    }, [todayDateStr]);

    useEffect(() => {
        if (activeTab === 'student' && selectedStudentId) {
            const fetchLogs = async () => {
                const q = query(collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`), where('studentId', '==', selectedStudentId));
                const snap = await getDocs(q);
                const logs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
                setStudentLogs(logs);
            };
            fetchLogs();
        }
    }, [activeTab, selectedStudentId]);

    // 🚀 [CTO 코어 엔진] 정규반 실시간 출결 현황 계산
    const radarData = useMemo(() => {
        const classGroups = {};
        const emergencyList = [];
        const examLeaveList = []; 
        let totalExpected = 0; let totalAttended = 0; let totalLate = 0;

        enrollments.forEach(enroll => {
            if (enroll.status !== 'active') return;
            if (currentUser.role === 'lecturer' && enroll.lecturerId !== currentUser.id) return;

            const todaySch = enroll.schedules?.find(s => s.dayOfWeek === todayStr);
            if (!todaySch) return;

            const student = users.find(u => u.id === enroll.studentId);
            if (!student) return;

            const lecturer = users.find(u => u.id === enroll.lecturerId);
            if (searchQuery && !student.name.includes(searchQuery) && !enroll.className.includes(searchQuery)) return;

            const isExamLeave = examLeaves.some(leave => leave.studentId === student.id && todayDateStr >= leave.startDate && todayDateStr <= leave.endDate);
            const hasAttended = dailyAttendances.some(a => a.studentId === enroll.studentId);
            const currentHHMM = `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`;
            const isLate = !hasAttended && (currentHHMM > todaySch.callTime);

            let status = 'expected'; 
            if (isExamLeave) { status = 'exam_leave'; } 
            else if (hasAttended) { status = 'attended'; totalAttended++; } 
            else if (isLate) { status = 'late'; totalLate++; } 
            else { totalExpected++; }

            const studentData = { studentId: enroll.studentId, studentName: student.name, phone: student.phone || '-', status: status, enrollId: enroll.id };

            if (status === 'exam_leave') {
                examLeaveList.push({ ...studentData, className: enroll.className });
                return; 
            }

            if (status === 'late') {
                emergencyList.push({ ...studentData, className: enroll.className, callTime: todaySch.callTime });
            }

            const groupKey = `${enroll.classId}_${todaySch.callTime}`;
            if (!classGroups[groupKey]) {
                classGroups[groupKey] = {
                    classId: enroll.classId, className: enroll.className, lecturerName: lecturer?.name || '미지정',
                    callTime: todaySch.callTime, classTime: todaySch.startTime, endTime: todaySch.endTime, room: todaySch.room || '미정',
                    students: []
                };
            }
            classGroups[groupKey].students.push(studentData);
        });

        const sortedGroups = Object.values(classGroups).sort((a, b) => a.callTime.localeCompare(b.callTime));
        sortedGroups.forEach(g => g.students.sort((a, b) => a.studentName.localeCompare(b.studentName)));
        emergencyList.sort((a, b) => a.callTime.localeCompare(b.callTime));

        return { groups: sortedGroups, emergencyList, examLeaveList, totalExpected: totalExpected + totalAttended + totalLate, totalAttended, totalLate };
    }, [enrollments, users, dailyAttendances, examLeaves, todayStr, todayDateStr, currentTime, searchQuery, currentUser]);

    // 🚀 [CTO 매트릭스 엔진] 강의실 x 시간표 그리드 데이터 구축 (O(n) 최적화 및 rowSpan 계산)
    const matrixGrid = useMemo(() => {
        const grid = {};
        const masterRooms = masterData?.classrooms || [];
        
        // 1. 그리드 뼈대 초기화
        masterRooms.forEach(room => {
            const rName = typeof room === 'string' ? room : room.name;
            grid[rName] = {};
            TIME_SLOTS.forEach(time => { grid[rName][time] = null; });
        });

        // 2. 정규반 데이터 매핑 (radarData.groups 재활용)
        radarData.groups.forEach(group => {
            if (!group.room || !grid[group.room]) return;
            const startTime = group.classTime;
            const endTime = group.endTime || '22:00';
            
            // 수용 인원 및 실제 출석 예정 계산 (시험 결석자는 이미 groups에서 제외됨)
            const roomObj = masterRooms.find(r => (typeof r === 'string' ? r : r.name) === group.room);
            const capacity = typeof roomObj === 'string' ? 999 : (roomObj?.capacity || 999);
            const currentHeadcount = group.students.length;
            
            const startIndex = TIME_SLOTS.indexOf(startTime);
            const endIndex = TIME_SLOTS.indexOf(endTime);
            
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                const rowSpan = endIndex - startIndex;
                grid[group.room][startTime] = {
                    type: 'class',
                    title: group.className,
                    lecturer: group.lecturerName,
                    headcount: currentHeadcount,
                    capacity: capacity,
                    rowSpan: rowSpan,
                    warn: currentHeadcount > capacity ? 'over' : (currentHeadcount < capacity * 0.3 ? 'under' : 'normal')
                };
                // 병합되는 하위 슬롯은 'skip' 처리하여 렌더링 방지
                for (let i = startIndex + 1; i < endIndex; i++) {
                    if (TIME_SLOTS[i]) grid[group.room][TIME_SLOTS[i]] = { skip: true };
                }
            }
        });

        // 3. 직전보충/클리닉 (sessions) 데이터 매핑
        todaySessions.forEach(session => {
            if (!session.classroom || !grid[session.classroom] || !['confirmed', 'completed'].includes(session.status)) return;
            const startTime = session.startTime;
            const endTime = session.endTime;
            
            const roomObj = masterRooms.find(r => (typeof r === 'string' ? r : r.name) === session.classroom);
            const capacity = typeof roomObj === 'string' ? 999 : (roomObj?.capacity || 999);
            const stList = Array.isArray(session.students) ? session.students : (session.studentName ? [1] : []);
            const currentHeadcount = stList.length;

            const startIndex = TIME_SLOTS.indexOf(startTime);
            const endIndex = TIME_SLOTS.indexOf(endTime);

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                // 충돌 감지 로직
                if (grid[session.classroom][startTime] && grid[session.classroom][startTime].type === 'class') {
                    grid[session.classroom][startTime].conflict = true;
                    return;
                }

                const rowSpan = endIndex - startIndex;
                grid[session.classroom][startTime] = {
                    type: 'clinic',
                    title: session.topic || '보충/클리닉',
                    lecturer: session.taName,
                    headcount: currentHeadcount,
                    capacity: capacity,
                    rowSpan: rowSpan,
                    warn: currentHeadcount > capacity ? 'over' : 'normal'
                };
                for (let i = startIndex + 1; i < endIndex; i++) {
                    if (TIME_SLOTS[i]) grid[session.classroom][TIME_SLOTS[i]] = { skip: true };
                }
            }
        });

        return grid;
    }, [masterData, radarData.groups, todaySessions]);

    // --- Handlers ---
    const handleManualCheckIn = async (studentId, studentName) => {
        if (!window.confirm(`[${studentName}] 학생을 즉시 등원(출석) 처리하시겠습니까?`)) return;
        try {
            const logId = `${todayDateStr}_${studentId}`;
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/attendance_logs`, logId), {
                studentId, date: todayDateStr, timestamp: serverTimestamp(), method: 'manual_desk'
            });
        } catch (e) { alert("출결 처리 실패: " + e.message); }
    };

    const handleSaveExamLeave = async () => {
        if (!leaveForm.studentId || !leaveForm.startDate || !leaveForm.endDate) return alert("학생과 기간을 모두 선택해주세요.");
        if (leaveForm.startDate > leaveForm.endDate) return alert("시작일이 종료일보다 늦을 수 없습니다.");

        setIsSavingLeave(true);
        try {
            const student = users.find(u => u.id === leaveForm.studentId);
            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/exam_leaves`), {
                studentId: student.id, studentName: student.name, startDate: leaveForm.startDate, endDate: leaveForm.endDate,
                reason: leaveForm.reason, createdAt: serverTimestamp(), createdBy: currentUser.name
            });
            setIsLeaveModalOpen(false);
            setLeaveForm({ studentId: '', startDate: '', endDate: '', reason: '중간/기말고사 대비' });
        } catch (error) { alert("저장 실패: " + error.message); } finally { setIsSavingLeave(false); }
    };

    const handleDeleteExamLeave = async (id) => {
        if (!window.confirm("이 시험기간 면제 설정을 삭제하시겠습니까?\n삭제 즉시 정규 출결 스케줄로 원복됩니다.")) return;
        try { await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/exam_leaves`, id)); } 
        catch (error) { alert("삭제 실패: " + error.message); }
    };

    if (loadingData || localLoading) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-screen-2xl mx-auto space-y-6 pb-20 animate-in fade-in h-screen flex flex-col">
            
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-200 shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <UserCheck className="text-indigo-600" /> 통합 출결 및 공간 관제
                    </h1>
                </div>
                
                <div className="flex bg-gray-100 p-1 rounded-2xl flex-wrap justify-center gap-1 w-full md:w-auto">
                    <button onClick={() => setActiveTab('daily')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${activeTab === 'daily' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>일별 운영 관제</button>
                    <button onClick={() => setActiveTab('matrix')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-1 ${activeTab === 'matrix' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
                        <LayoutGrid size={16}/> 교실 매트릭스
                    </button>
                    <button onClick={() => setActiveTab('student')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${activeTab === 'student' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>원생별 출결</button>
                    <button onClick={() => setActiveTab('exam_leave')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-1 ${activeTab === 'exam_leave' ? 'bg-white text-rose-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
                        시험결석 설정 {examLeaves.length > 0 && <span className="bg-rose-100 text-rose-600 px-1.5 rounded-full text-[10px]">{examLeaves.length}</span>}
                    </button>
                </div>
            </div>

            {/* TAB 1: 일별 운영 관제 (기존 ScheduleControlTower 진화형) */}
            {activeTab === 'daily' && (
                <div className="flex flex-col h-full gap-6">
                    <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-6 rounded-3xl shadow-lg shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Activity size={28} className="animate-pulse" />
                                <h2 className="text-xl md:text-2xl font-black">{todayStr}요일 실시간 출결 현황</h2>
                            </div>
                            <p className="opacity-90 text-sm">{currentUser.role === 'lecturer' ? '담당하시는 반의' : '학원의 모든'} 스케줄이 실시간으로 관제됩니다.</p>
                        </div>
                        <div className="bg-black/20 p-4 rounded-2xl flex items-center gap-5">
                            <div className="text-center">
                                <div className="text-xs opacity-70 font-bold mb-1">등원 예정 (면제 제외)</div>
                                <div className="text-2xl font-black">{radarData.totalExpected}명</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xs text-emerald-300 font-bold mb-1">출석 완료</div>
                                <div className="text-2xl font-black text-emerald-400">{radarData.totalAttended}명</div>
                            </div>
                            <div className="text-center relative">
                                <div className="text-xs text-rose-300 font-bold mb-1">지각/미등원</div>
                                <div className="text-2xl font-black text-rose-400 animate-pulse">{radarData.totalLate}명</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                        {/* 메인 관제탑 (반 단위 그룹 리스트) */}
                        <div className="flex-1 bg-white border border-gray-200 rounded-3xl shadow-sm flex flex-col min-h-[400px]">
                            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50/50 rounded-t-3xl shrink-0">
                                <h2 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18}/> 콜 타임(Call Time)별 타임라인</h2>
                                <div className="relative w-full sm:w-64">
                                    <input type="text" placeholder="학생 이름, 반 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold bg-white"/>
                                    <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                                {radarData.groups.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <Activity size={48} className="opacity-20 mb-4"/>
                                        <p className="font-bold">오늘 예정된 스케줄이 없습니다.</p>
                                    </div>
                                ) : (
                                    radarData.groups.map((group, idx) => {
                                        const hasLate = group.students.some(s => s.status === 'late');
                                        return (
                                            <div key={idx} className={`border-2 rounded-2xl p-4 transition-all ${hasLate ? 'border-rose-200 bg-rose-50/20 shadow-sm' : 'border-gray-100 bg-white'}`}>
                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-xs font-black px-2 py-0.5 rounded-md ${hasLate ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'}`}>콜타임 {group.callTime}</span>
                                                            <span className="text-xs font-bold text-gray-500">본수업 {group.classTime}</span>
                                                        </div>
                                                        <h3 className="text-lg font-black text-gray-900">{group.className}</h3>
                                                    </div>
                                                    <div className="flex flex-row md:flex-col gap-3 md:gap-1 text-xs font-bold text-gray-500">
                                                        <div className="flex items-center gap-1"><User size={12}/> {group.lecturerName} 강사</div>
                                                        <div className="flex items-center gap-1"><MapPin size={12}/> {group.room}</div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {group.students.map(student => (
                                                        <div key={student.studentId} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-sm transition-all ${student.status === 'late' ? 'bg-rose-50 border-rose-300 text-rose-800' : student.status === 'attended' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                                            <span className="font-bold">{student.studentName}</span>
                                                            {student.status === 'late' && <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded animate-pulse">지각</span>}
                                                            {student.status === 'attended' && <span className="text-emerald-500 text-[10px] font-black flex items-center gap-0.5"><Check size={12}/> 완료</span>}
                                                            {student.status === 'expected' && <span className="text-gray-400 text-[10px] font-black">대기</span>}
                                                            {student.status !== 'attended' && (
                                                                <button onClick={() => handleManualCheckIn(student.studentId, student.studentName)} className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${student.status === 'late' ? 'bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-gray-100 text-gray-500 hover:bg-emerald-500 hover:text-white'}`}>
                                                                    등원
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* 우측 긴급 콜 & 면제자 리스트 */}
                        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
                            {/* 긴급 콜 */}
                            <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 shadow-sm flex flex-col h-1/2 min-h-[300px]">
                                <h2 className="text-lg font-black text-rose-800 mb-3 flex items-center gap-2">
                                    <ShieldAlert size={20} className="animate-pulse"/> 긴급 콜 리스트
                                </h2>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                                    {radarData.emergencyList.length === 0 ? (
                                        <div className="text-center py-10 text-rose-400 font-bold text-sm">지각생이 없습니다! 🕊️</div>
                                    ) : (
                                        radarData.emergencyList.map(data => (
                                            <div key={`call_${data.enrollId}`} className="bg-white p-3 rounded-xl border border-rose-200 shadow-sm relative group hover:border-rose-300">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <span className="font-bold text-gray-900">{data.studentName}</span>
                                                        <span className="text-[10px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded ml-2 animate-pulse">{data.callTime} 지각</span>
                                                    </div>
                                                </div>
                                                <div className="text-[11px] font-bold text-gray-500 mb-2 truncate">{data.className}</div>
                                                <div className="bg-gray-50 p-2 rounded-lg flex justify-between items-center border border-gray-100">
                                                    <div className="font-mono text-xs font-bold text-gray-700">{data.phone || '번호없음'}</div>
                                                    <a href={`tel:${data.phone}`} className="w-7 h-7 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-500 hover:text-white"><PhoneCall size={14} /></a>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            {/* 시험기간 결석 자동 면제자 알림판 */}
                            <div className="bg-gray-50 border-2 border-gray-200 rounded-3xl p-5 shadow-sm flex flex-col flex-1 min-h-[200px]">
                                <h2 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
                                    <CalendarDays size={18} className="text-gray-500"/> 자동 출석 면제 (시험/특수)
                                </h2>
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                                    {radarData.examLeaveList.length === 0 ? (
                                        <div className="text-center py-6 text-gray-400 font-bold text-xs">오늘 면제자가 없습니다.</div>
                                    ) : (
                                        radarData.examLeaveList.map((data, idx) => (
                                            <div key={idx} className="bg-white px-3 py-2 rounded-lg border border-gray-200 flex justify-between items-center shadow-sm">
                                                <span className="font-bold text-gray-800 text-sm">{data.studentName}</span>
                                                <span className="text-[10px] font-bold text-gray-500 truncate max-w-[120px]">{data.className}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 🚀 TAB 4: 교실 매트릭스 (Room Matrix View) */}
            {activeTab === 'matrix' && (
                <div className="flex flex-col h-full gap-6 animate-in fade-in">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-5 rounded-3xl shadow-lg shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <LayoutGrid size={24} />
                                <h2 className="text-xl font-black">{todayDateStr} 교실 자원 관제탑</h2>
                            </div>
                            <p className="opacity-90 text-sm">빈 강의실을 시각적으로 확인하고, 시험 결석자로 인해 인원이 빈 정규반 교실을 찾아냅니다.</p>
                        </div>
                        <div className="flex gap-2 bg-black/20 p-2 rounded-xl text-xs font-bold">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-100 border border-blue-400 rounded-sm"></span> 정규반</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-100 border border-purple-400 rounded-sm"></span> 직보/보충</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-100 border border-rose-400 rounded-sm"></span> 초과/충돌</span>
                        </div>
                    </div>

                    <div className="flex-1 bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-auto custom-scrollbar relative">
                            <table className="w-full min-w-[1200px] border-collapse text-sm">
                                <thead className="bg-gray-50 sticky top-0 z-20 shadow-sm">
                                    <tr>
                                        <th className="p-3 border-b border-r border-gray-200 text-center w-20 bg-gray-100">시간</th>
                                        {masterData?.classrooms?.map((room, idx) => {
                                            const rName = typeof room === 'string' ? room : room.name;
                                            const rCap = typeof room === 'string' ? '' : room.capacity;
                                            return (
                                                <th key={idx} className="p-3 border-b border-r border-gray-200 text-center font-black text-gray-700 min-w-[150px]">
                                                    {rName} <br/><span className="text-[10px] text-gray-400 font-bold">{rCap ? `수용: ${rCap}명` : ''}</span>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {TIME_SLOTS.map((time, tIdx) => (
                                        <tr key={time} className="hover:bg-gray-50/50">
                                            <td className="p-2 border-b border-r border-gray-200 text-center font-mono font-bold text-gray-500 bg-gray-50 sticky left-0 z-10">
                                                {time}
                                            </td>
                                            {masterData?.classrooms?.map((room, rIdx) => {
                                                const rName = typeof room === 'string' ? room : room.name;
                                                const cellData = matrixGrid[rName]?.[time];
                                                
                                                if (cellData?.skip) return null; // rowSpan에 의해 병합된 셀은 렌더링 스킵

                                                if (!cellData) {
                                                    return <td key={rIdx} className="p-2 border-b border-r border-gray-100 text-center text-gray-300"></td>;
                                                }

                                                // 렌더링 스타일 지정
                                                let bgClass = 'bg-blue-50 border-blue-200';
                                                let textClass = 'text-blue-800';
                                                
                                                if (cellData.type === 'clinic') {
                                                    bgClass = 'bg-purple-50 border-purple-200';
                                                    textClass = 'text-purple-800';
                                                }
                                                
                                                if (cellData.conflict) {
                                                    bgClass = 'bg-rose-100 border-rose-400 animate-pulse';
                                                    textClass = 'text-rose-900';
                                                }

                                                return (
                                                    <td key={rIdx} rowSpan={cellData.rowSpan} className={`p-2 border-b border-r border-gray-200 align-top transition-all hover:brightness-95 cursor-pointer ${bgClass}`}>
                                                        <div className="h-full flex flex-col gap-1 relative">
                                                            <div className={`font-black text-sm leading-tight ${textClass}`}>{cellData.title}</div>
                                                            <div className="text-[10px] font-bold text-gray-500">{cellData.lecturer} 강사</div>
                                                            
                                                            <div className="mt-auto pt-2 flex items-center justify-between">
                                                                <span className="text-[10px] font-bold bg-white/50 px-1.5 py-0.5 rounded">
                                                                    예상: {cellData.headcount}명
                                                                </span>
                                                                {cellData.warn === 'over' && (
                                                                    <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-sm" title="수용 인원 초과!">초과</span>
                                                                )}
                                                                {cellData.warn === 'under' && cellData.type === 'class' && (
                                                                    <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-sm flex items-center gap-1" title="시험결석자로 인해 빈 자리가 많습니다. 스왑 추천!">
                                                                        <ArrowRightLeft size={10}/> 스왑 추천
                                                                    </span>
                                                                )}
                                                                {cellData.conflict && (
                                                                    <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-sm flex items-center gap-1"><AlertTriangle size={10}/> 교실 중복</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: 원생별 출결 현황 */}
            {activeTab === 'student' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
                    <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-full">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
                            <div className="relative">
                                <input type="text" placeholder="이름, 학교 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold bg-white"/>
                                <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {users.filter(u => u.role === 'student' && (u.name.includes(searchQuery) || (u.schoolName||'').includes(searchQuery))).map(student => (
                                <button key={student.id} onClick={() => setSelectedStudentId(student.id)} className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 mb-1 ${selectedStudentId === student.id ? 'bg-blue-50 border border-blue-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'}`}>
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black shrink-0">{student.name[0]}</div>
                                    <div>
                                        <div className={`font-bold ${selectedStudentId === student.id ? 'text-blue-900' : 'text-gray-800'}`}>{student.name}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">{student.schoolName}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
                        {!selectedStudentId ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
                                <UserCheck size={48} className="opacity-20" />
                                <p className="font-bold">좌측에서 학생을 선택하면 상세 출결을 봅니다.</p>
                            </div>
                        ) : (
                            <>
                                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50/30">
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                            {users.find(u=>u.id===selectedStudentId)?.name} <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md">출결 통계</span>
                                        </h2>
                                    </div>
                                    <div className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-center shadow-sm">
                                        <div className="text-xs text-gray-500 font-bold">누적 등원 횟수</div>
                                        <div className="text-xl font-black text-blue-600">{studentLogs.length}회</div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-gray-50">
                                    {studentLogs.length === 0 ? (
                                        <div className="text-center py-16 text-gray-400 font-bold border-2 border-dashed border-gray-200 rounded-2xl bg-white">기록이 없습니다.</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {studentLogs.map(log => (
                                                <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><CheckCircle size={20}/></div>
                                                        <div>
                                                            <div className="font-black text-gray-800">{log.date}</div>
                                                            <div className="text-xs text-gray-500 font-bold mt-1">인증 방식: {log.method === 'manual_desk' ? '데스크 수동 인증' : '키패드 인증'}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm font-mono text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                                        {new Date(log.timestamp?.seconds * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: 시험기간 면제(Exam Leave) 관리 */}
            {activeTab === 'exam_leave' && (
                <div className="flex flex-col h-full gap-6 animate-in fade-in">
                    <Card className="bg-rose-50 border-rose-200 w-full shrink-0">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                            <div>
                                <h2 className="text-xl font-black text-rose-800 flex items-center gap-2 mb-2"><AlertTriangle size={20}/> 시험기간 출석 면제(Bypass) 관리</h2>
                                <p className="text-sm font-bold text-rose-600">설정된 기간 동안 해당 학생들은 정규 출결 스케줄(긴급 콜, 지각 알림)에서 완전히 제외되며, 교실 수용 인원 계산에서도 차감됩니다.</p>
                            </div>
                            <Button onClick={() => setIsLeaveModalOpen(true)} className="bg-rose-600 hover:bg-rose-700 shadow-md font-bold" icon={Plus}>면제 대상자 추가</Button>
                        </div>
                    </Card>

                    <Card className="flex-1 overflow-hidden p-0 flex flex-col border border-gray-200">
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {examLeaves.length === 0 ? (
                                <div className="text-center py-20 text-gray-400 font-bold flex flex-col items-center">
                                    <CalendarDays size={48} className="opacity-20 mb-4"/>
                                    현재 설정된 시험 기간/면제자가 없습니다.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {examLeaves.map(leave => {
                                        const isExpired = todayDateStr > leave.endDate;
                                        return (
                                            <div key={leave.id} className={`border-2 rounded-2xl p-5 relative overflow-hidden transition-all ${isExpired ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-rose-200 shadow-sm'}`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full mb-2 inline-block ${isExpired ? 'bg-gray-200 text-gray-600' : 'bg-rose-100 text-rose-700 animate-pulse'}`}>
                                                            {isExpired ? '기간 만료' : '면제 적용 중'}
                                                        </span>
                                                        <h3 className="text-lg font-black text-gray-900">{leave.studentName} 학생</h3>
                                                    </div>
                                                    <button onClick={() => handleDeleteExamLeave(leave.id)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                                </div>
                                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1">
                                                    <div className="text-xs font-bold text-gray-500">면제 사유: <span className="text-gray-800">{leave.reason}</span></div>
                                                    <div className="text-xs font-bold text-gray-500">적용 기간: <span className="text-rose-600">{leave.startDate} ~ {leave.endDate}</span></div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            <Modal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} title="시험기간 출석 면제 설정">
                <div className="space-y-5 p-2">
                    <div className="bg-rose-50 p-4 rounded-xl text-rose-700 text-sm font-bold flex items-start gap-2 border border-rose-100">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5"/>
                        이 기간 동안 해당 학생은 학원에 오지 않아도 지각/결석 처리가 되지 않으며 긴급 콜 리스트에서 제외됩니다.
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-700 mb-1.5 block">1. 대상 학생 선택</label>
                        <select className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white text-gray-800" value={leaveForm.studentId} onChange={e => setLeaveForm({...leaveForm, studentId: e.target.value})}>
                            <option value="">학생을 선택해주세요</option>
                            {users.filter(u=>u.role==='student').sort((a,b)=>a.name.localeCompare(b.name)).map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.schoolName})</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-gray-700 mb-1.5 block">2. 시작일</label>
                            <input type="date" className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white" value={leaveForm.startDate} onChange={e => setLeaveForm({...leaveForm, startDate: e.target.value})} />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-bold text-gray-700 mb-1.5 block">3. 종료일</label>
                            <input type="date" className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white" value={leaveForm.endDate} onChange={e => setLeaveForm({...leaveForm, endDate: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-700 mb-1.5 block">4. 사유</label>
                        <input type="text" className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white" value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} placeholder="예: 1학기 기말고사 직전대비 휴원" />
                    </div>

                    <Button className="w-full py-4 text-lg font-black bg-rose-600 hover:bg-rose-700 shadow-lg mt-4" onClick={handleSaveExamLeave} disabled={isSavingLeave}>
                        {isSavingLeave ? <Loader className="animate-spin mx-auto"/> : '출석 면제(Bypass) 기간 저장'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default AttendanceManager;