/* [서비스 가치(Service Value)] 통합 출결 관리 및 시험 기간 관제 엔진 v7.0
   1. 운영 효율화: '일별 관제'와 '원생별 통계'를 통합하여 데스크의 화면 전환(Friction)을 없앴습니다.
   2. 에러 방어: 연쇄 삭제된 유령 데이터를 필터링하는 방어막(Bulletproof)을 유지합니다.
   3. 자동화: '시험 기간 설정' 시 해당 기간 동안 학생을 자동으로 결석(Exam Leave) 처리하여 불필요한 긴급 콜과 오발송 문자를 원천 차단합니다. */

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Clock, MapPin, CheckCircle, 
    User, Users, Search, Loader, PhoneCall, ShieldAlert, Check,
    CalendarDays, UserCheck, AlertTriangle, Plus, Trash2, Calendar
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Card, Button, Modal, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 한국 시간(KST) 기준 정확한 로컬 날짜 문자열(YYYY-MM-DD) 추출기
const getLocalDateStr = (dateObj) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
};

const AttendanceManager = ({ currentUser }) => {
    const { classes, enrollments, users, loadingData } = useData();

    // --- State ---
    const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'student', 'exam_leave'
    const [currentTime, setCurrentTime] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState('');
    
    // 데이터 State
    const [dailyAttendances, setDailyAttendances] = useState([]); 
    const [examLeaves, setExamLeaves] = useState([]);
    const [localLoading, setLocalLoading] = useState(true);

    // 원생별 출결 조회를 위한 State
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [studentLogs, setStudentLogs] = useState([]);

    // 시험기간 설정 모달 State
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ studentId: '', startDate: '', endDate: '', reason: '중간/기말고사 대비' });
    const [isSavingLeave, setIsSavingLeave] = useState(false);

    const todayStr = DAYS_OF_WEEK[currentTime.getDay()];
    const todayDateStr = getLocalDateStr(currentTime);

    // 1분마다 현재 시간 갱신
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // 🚀 [Firebase 최적화] 리스너 분리 및 최소화
    // 1. 오늘 날짜 출결 로그 구독
    useEffect(() => {
        const qAtt = query(collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`), where('date', '==', todayDateStr));
        const unsubAtt = onSnapshot(qAtt, s => {
            setDailyAttendances(s.docs.map(d => ({ id: d.id, ...d.data() })));
            setLocalLoading(false);
        });
        return () => unsubAtt();
    }, [todayDateStr]);

    // 2. 현재 활성화된 시험 기간(Exam Leaves) 전체 구독 (용량이 작으므로 전체 구독 후 메모리 필터링)
    useEffect(() => {
        const qLeave = query(collection(db, `artifacts/${APP_ID}/public/data/exam_leaves`));
        const unsubLeave = onSnapshot(qLeave, s => {
            setExamLeaves(s.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubLeave();
    }, []);

    // 원생별 출결 탭 - 학생 선택 시 과거 기록 로딩 (비용 절감을 위해 onSnapshot 대신 1회성 getDocs 사용)
    useEffect(() => {
        if (activeTab === 'student' && selectedStudentId) {
            const fetchLogs = async () => {
                const q = query(
                    collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`),
                    where('studentId', '==', selectedStudentId),
                    // 복합 인덱스 필요 경고 방지를 위해 메모리 정렬 사용
                );
                const snap = await getDocs(q);
                const logs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.date.localeCompare(a.date));
                setStudentLogs(logs);
            };
            fetchLogs();
        }
    }, [activeTab, selectedStudentId]);

    // 🚀 [CTO 코어 엔진] 일별 스케줄 및 출결 매트릭스 계산
    const radarData = useMemo(() => {
        const classGroups = {};
        const emergencyList = [];
        const examLeaveList = []; // 시험기간 면제자 리스트
        let totalExpected = 0;
        let totalAttended = 0;
        let totalLate = 0;

        enrollments.forEach(enroll => {
            if (enroll.status !== 'active') return;
            if (currentUser.role === 'lecturer' && enroll.lecturerId !== currentUser.id) return;

            const todaySch = enroll.schedules?.find(s => s.dayOfWeek === todayStr);
            if (!todaySch) return;

            const student = users.find(u => u.id === enroll.studentId);
            // 방탄 필터링: 유령 데이터 차단
            if (!student) return;

            const lecturer = users.find(u => u.id === enroll.lecturerId);
            if (searchQuery && !student.name.includes(searchQuery) && !enroll.className.includes(searchQuery)) return;

            // 🚀 [신규 엔진] 이 학생이 오늘 '시험 기간 결석' 대상자인지 검증
            const isExamLeave = examLeaves.some(leave => 
                leave.studentId === student.id && 
                todayDateStr >= leave.startDate && 
                todayDateStr <= leave.endDate
            );

            const hasAttended = dailyAttendances.some(a => a.studentId === enroll.studentId);
            const currentHHMM = `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`;
            const isLate = !hasAttended && (currentHHMM > todaySch.callTime);

            let status = 'expected'; 
            
            if (isExamLeave) {
                status = 'exam_leave';
            } else if (hasAttended) { 
                status = 'attended'; totalAttended++; 
            } else if (isLate) { 
                status = 'late'; totalLate++; 
            } else { 
                totalExpected++; 
            }

            const studentData = {
                studentId: enroll.studentId,
                studentName: student.name,
                phone: student.phone || '-',
                status: status,
                enrollId: enroll.id
            };

            // 그룹 분리 적재
            if (status === 'exam_leave') {
                examLeaveList.push({ ...studentData, className: enroll.className });
                return; // 정규 그룹 카드에 표시하지 않고 넘깁니다. (원한다면 표시할 수도 있음)
            }

            if (status === 'late') {
                emergencyList.push({ ...studentData, className: enroll.className, callTime: todaySch.callTime });
            }

            const groupKey = `${enroll.classId}_${todaySch.callTime}`;
            if (!classGroups[groupKey]) {
                classGroups[groupKey] = {
                    classId: enroll.classId,
                    className: enroll.className,
                    lecturerName: lecturer?.name || '미지정',
                    callTime: todaySch.callTime,
                    classTime: todaySch.startTime,
                    room: todaySch.room || '미정',
                    students: []
                };
            }
            classGroups[groupKey].students.push(studentData);
        });

        const sortedGroups = Object.values(classGroups).sort((a, b) => a.callTime.localeCompare(b.callTime));
        sortedGroups.forEach(g => g.students.sort((a, b) => a.studentName.localeCompare(b.studentName)));
        emergencyList.sort((a, b) => a.callTime.localeCompare(b.callTime));

        return { 
            groups: sortedGroups, 
            emergencyList,
            examLeaveList,
            totalExpected: totalExpected + totalAttended + totalLate, 
            totalAttended, 
            totalLate 
        };
    }, [enrollments, users, dailyAttendances, examLeaves, todayStr, todayDateStr, currentTime, searchQuery, currentUser]);

    // --- Handlers ---
    const handleManualCheckIn = async (studentId, studentName) => {
        if (!window.confirm(`[${studentName}] 학생을 즉시 등원(출석) 처리하시겠습니까?`)) return;
        try {
            const logId = `${todayDateStr}_${studentId}`;
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/attendance_logs`, logId), {
                studentId,
                date: todayDateStr,
                timestamp: serverTimestamp(),
                method: 'manual_desk'
            });
        } catch (e) { alert("출결 처리 실패: " + e.message); }
    };

    const handleSaveExamLeave = async () => {
        if (!leaveForm.studentId || !leaveForm.startDate || !leaveForm.endDate) {
            return alert("학생과 기간을 모두 선택해주세요.");
        }
        if (leaveForm.startDate > leaveForm.endDate) {
            return alert("시작일이 종료일보다 늦을 수 없습니다.");
        }

        setIsSavingLeave(true);
        try {
            const student = users.find(u => u.id === leaveForm.studentId);
            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/exam_leaves`), {
                studentId: student.id,
                studentName: student.name,
                startDate: leaveForm.startDate,
                endDate: leaveForm.endDate,
                reason: leaveForm.reason,
                createdAt: serverTimestamp(),
                createdBy: currentUser.name
            });
            setIsLeaveModalOpen(false);
            setLeaveForm({ studentId: '', startDate: '', endDate: '', reason: '중간/기말고사 대비' });
        } catch (error) {
            alert("저장 실패: " + error.message);
        } finally {
            setIsSavingLeave(false);
        }
    };

    const handleDeleteExamLeave = async (id) => {
        if (!window.confirm("이 시험기간 면제 설정을 삭제하시겠습니까?\n삭제 즉시 정규 출결 스케줄로 원복됩니다.")) return;
        try {
            await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/exam_leaves`, id));
        } catch (error) { alert("삭제 실패: " + error.message); }
    };

    if (loadingData || localLoading) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in h-screen flex flex-col">
            
            {/* Header & Tabs */}
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-200 shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <UserCheck className="text-indigo-600" /> 통합 출결 관리
                    </h1>
                </div>
                
                <div className="flex bg-gray-100 p-1 rounded-2xl flex-wrap justify-center gap-1 w-full md:w-auto">
                    <button onClick={() => setActiveTab('daily')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${activeTab === 'daily' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>일별 운영 관제</button>
                    <button onClick={() => setActiveTab('student')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${activeTab === 'student' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>원생별 출결 현황</button>
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
                                <div className="text-xs opacity-70 font-bold mb-1">등원 예정</div>
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
                                            <div key={idx} className="bg-white px-3 py-2 rounded-lg border border-gray-200 flex justify-between items-center">
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
                                <p className="text-sm font-bold text-rose-600">설정된 기간 동안 해당 학생들은 정규 출결 스케줄(긴급 콜, 지각 알림)에서 완전히 제외됩니다.</p>
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

            {/* 모달: 시험기간 면제자 추가 */}
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