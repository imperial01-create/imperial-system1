/* [서비스 가치(Service Value)] 통합 출결 및 공간 관제 엔진 v13.1
   1. 타임머신 관제: 상단 캘린더(Date Picker)를 통해 과거/미래 스케줄을 자유롭게 탐색합니다.
   2. 스마트 매트릭스: 정규 수업과 TA(조교) 협업 클리닉이 겹칠 경우, 클라이언트 엔진이 이를 자동 병합하여 [TA 협업] 배지로 시각화(Visual Hierarchy)합니다.
   🚀 CTO 패치: 매트릭스 RowSpan HTML 구조 파괴 및 Null String 치명적 오류를 완벽히 방어하는 안전망 탑재 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Clock, MapPin, CheckCircle, 
    User, Users, Search, Loader, PhoneCall, ShieldAlert, Check,
    CalendarDays, UserCheck, AlertTriangle, Trash2, LayoutGrid, ArrowRightLeft, Plus, X, School, ShieldCheck
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, getDocs, where, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Card, Button, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 🚀 법적 심야교습 시간 제한 반영 (08:00 ~ 22:00, 총 29슬롯)
const TIME_SLOTS = Array.from({ length: 29 }, (_, i) => {
    const hour = Math.floor(i / 2) + 8;
    const min = i % 2 === 0 ? '00' : '30';
    return `${String(hour).padStart(2, '0')}:${min}`;
});

const getLocalDateStr = (dateObj) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
};

const snapTime = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const snappedM = m < 30 ? '00' : '30';
    return `${String(h).padStart(2, '0')}:${snappedM}`;
};

const TEACHER_COLORS = [
    'bg-indigo-50 border-indigo-400 text-indigo-900', 'bg-emerald-50 border-emerald-400 text-emerald-900',
    'bg-amber-50 border-amber-400 text-amber-900', 'bg-rose-50 border-rose-400 text-rose-900',
    'bg-cyan-50 border-cyan-400 text-cyan-900', 'bg-fuchsia-50 border-fuchsia-400 text-fuchsia-900',
    'bg-lime-50 border-lime-400 text-lime-900', 'bg-orange-50 border-orange-400 text-orange-900',
    'bg-blue-50 border-blue-400 text-blue-900', 'bg-purple-50 border-purple-400 text-purple-900',
    'bg-pink-50 border-pink-400 text-pink-900', 'bg-teal-50 border-teal-400 text-teal-900',
    'bg-yellow-50 border-yellow-500 text-yellow-900', 'bg-red-50 border-red-400 text-red-900',
    'bg-sky-50 border-sky-400 text-sky-900', 'bg-stone-200 border-stone-400 text-stone-900'
];

const AttendanceManager = ({ currentUser }) => {
    const { classes, enrollments, users, masterData, loadingData } = useData();

    const [activeTab, setActiveTab] = useState('daily'); 
    
    // 날짜 변경(타임머신) State
    const [selectedDateObj, setSelectedDateObj] = useState(new Date());
    const selectedDayStr = DAYS_OF_WEEK[selectedDateObj.getDay()];
    const selectedDateStr = getLocalDateStr(selectedDateObj);

    const [searchQuery, setSearchQuery] = useState('');
    
    const [dailyAttendances, setDailyAttendances] = useState([]); 
    const [examLeaves, setExamLeaves] = useState([]);
    const [todaySessions, setTodaySessions] = useState([]); 
    const [localLoading, setLocalLoading] = useState(true);

    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [studentLogs, setStudentLogs] = useState([]);

    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ schoolName: '', startDate: '', endDate: '', reason: '1학기 기말고사 대비' });
    const [isSavingLeave, setIsSavingLeave] = useState(false);

    const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
    const [quickAddForm, setQuickAddForm] = useState({ room: '', startTime: '', endTime: '', topic: '', lecturerId: '', headcount: 1 });
    const [confirmConfig, setConfirmConfig] = useState(null);

    const uniqueSchools = useMemo(() => {
        const schools = new Set();
        users.forEach(u => {
            if (u.role === 'student' && u.schoolName) {
                schools.add(u.schoolName);
            }
        });
        return Array.from(schools).sort();
    }, [users]);

    const teacherColorMap = useMemo(() => {
        const map = {};
        const teacherNames = [...new Set(
            users.filter(u => ['lecturer', 'ta', 'admin_assistant'].includes(u.role)).map(u => u.name)
        )].sort(); 

        teacherNames.forEach((name, index) => {
            map[name] = TEACHER_COLORS[index % TEACHER_COLORS.length];
        });
        return map;
    }, [users]);

    const getTeacherColor = (name) => {
        if (!name || name === '미지정') return 'bg-slate-100 border-slate-300 text-slate-700';
        return teacherColorMap[name] || 'bg-gray-100 border-gray-300 text-gray-800';
    };

    // 선택된 날짜에 맞추어 실시간 데이터 구독 갱신
    useEffect(() => {
        const qAtt = query(collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`), where('date', '==', selectedDateStr));
        const unsubAtt = onSnapshot(qAtt, s => {
            setDailyAttendances(s.docs.map(d => ({ id: d.id, ...d.data() })));
            setLocalLoading(false);
        });
        return () => unsubAtt();
    }, [selectedDateStr]);

    useEffect(() => {
        const qLeave = query(collection(db, `artifacts/${APP_ID}/public/data/exam_leaves`));
        const unsubLeave = onSnapshot(qLeave, s => setExamLeaves(s.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsubLeave();
    }, []);

    useEffect(() => {
        const qSession = query(collection(db, `artifacts/${APP_ID}/public/data/sessions`), where('date', '==', selectedDateStr));
        const unsubSession = onSnapshot(qSession, s => setTodaySessions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsubSession();
    }, [selectedDateStr]);

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

    const radarData = useMemo(() => {
        const classGroups = {};
        const emergencyList = [];
        const examLeaveList = []; 
        let totalExpected = 0; let totalAttended = 0; let totalLate = 0;

        const now = new Date();
        const isToday = selectedDateStr === getLocalDateStr(now);
        const isPastDate = selectedDateStr < getLocalDateStr(now);
        const currentHHMM = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

        enrollments.forEach(enroll => {
            if (enroll.status !== 'active') return;
            if (currentUser.role === 'lecturer' && enroll.lecturerId !== currentUser.id) return;

            const todaySch = enroll.schedules?.find(s => s.dayOfWeek === selectedDayStr);
            if (!todaySch) return;

            const student = users.find(u => u.id === enroll.studentId);
            if (!student) return;

            const lecturer = users.find(u => u.id === enroll.lecturerId);
            
            // 🚀 [CTO 방어 패치] enroll.className이 없을 경우 대비
            if (searchQuery && !student.name.includes(searchQuery) && !(enroll.className || '').includes(searchQuery)) return;

            const isExamLeave = examLeaves.some(leave => {
                const isTargetMatch = leave.schoolName ? (leave.schoolName === student.schoolName) : (leave.studentId === student.id);
                return isTargetMatch && selectedDateStr >= leave.startDate && selectedDateStr <= leave.endDate;
            });
            
            const attLog = dailyAttendances.find(a => a.studentId === enroll.studentId);
            
            const isLate = !attLog && (isPastDate || (isToday && currentHHMM > todaySch.callTime));

            let status = 'expected'; 
            if (isExamLeave) { 
                status = 'exam_leave'; 
            } else if (attLog) { 
                if (attLog.status === 'absent') { status = 'absent'; }
                else if (attLog.status === 'late') { status = 'late_attended'; totalAttended++; }
                else { status = 'attended'; totalAttended++; }
            } else if (isLate) { 
                status = 'late'; totalLate++; 
            } else { 
                totalExpected++; 
            }

            const studentData = { studentId: enroll.studentId, studentName: student.name, phone: student.phone || '-', schoolName: student.schoolName, status: status, enrollId: enroll.id, callTime: todaySch.callTime };

            if (status === 'exam_leave') {
                examLeaveList.push({ ...studentData, className: enroll.className });
                return; 
            }

            if (status === 'late') {
                emergencyList.push({ ...studentData, className: enroll.className });
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
    }, [enrollments, users, dailyAttendances, examLeaves, selectedDayStr, selectedDateStr, searchQuery, currentUser]);

    // 🚀 [CTO 패치] 교실 매트릭스 엔진 (정규 수업과 반 단체 클리닉 병합 렌더링 & RowSpan 파괴 방어)
    const matrixGrid = useMemo(() => {
        const grid = {};
        const masterRooms = masterData?.classrooms || [];
        
        // 1. 모든 교실의 시간표 뼈대 생성
        masterRooms.forEach(room => {
            const rName = typeof room === 'string' ? room : room.name;
            grid[rName] = {};
            TIME_SLOTS.forEach(time => { grid[rName][time] = null; });
        });

        // 2. 정규 수업 먼저 매핑
        classes.forEach(cls => {
            const todaySch = cls.schedules?.find(s => s.dayOfWeek === selectedDayStr);
            if (!todaySch || !todaySch.room || !grid[todaySch.room]) return;

            const snappedStart = snapTime(todaySch.startTime);
            const snappedEnd = snapTime(todaySch.endTime || '22:00');
            
            const roomObj = masterRooms.find(r => (typeof r === 'string' ? r : r.name) === todaySch.room);
            const capacity = typeof roomObj === 'string' ? 999 : (roomObj?.capacity || 999);
            
            const activeEnrolls = enrollments.filter(e => e.classId === cls.id && e.status === 'active' && users.some(u => u.id === e.studentId));
            let currentHeadcount = 0;
            let expectedStudentNames = [];
            
            activeEnrolls.forEach(e => {
                const sObj = users.find(u => u.id === e.studentId);
                const isExamLeave = examLeaves.some(leave => {
                    const isTargetMatch = leave.schoolName ? (leave.schoolName === sObj?.schoolName) : (leave.studentId === e.studentId);
                    return isTargetMatch && selectedDateStr >= leave.startDate && selectedDateStr <= leave.endDate;
                });

                if (!isExamLeave) {
                    currentHeadcount++;
                    expectedStudentNames.push(sObj?.name || e.studentName || '이름없음');
                }
            });

            const lecturer = users.find(u => u.id === cls.lecturerId);
            const startIndex = TIME_SLOTS.indexOf(snappedStart);
            const endIndex = TIME_SLOTS.indexOf(snappedEnd);
            
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                // 🚀 안전 장치: 기존 셀과 겹치는지 검사하여 HTML 구조 파괴(빈 화면) 방지
                let isOverlap = false;
                for (let i = startIndex; i < endIndex; i++) {
                    if (grid[todaySch.room][TIME_SLOTS[i]] !== null) {
                        isOverlap = true;
                        break;
                    }
                }

                if (isOverlap) {
                    if (!grid[todaySch.room][snappedStart]) {
                        grid[todaySch.room][snappedStart] = { skip: false, type: 'class', conflict: true, title: '배정 중복', lecturer: '오류', rowSpan: 1, clinicSessions: [] };
                    } else if (!grid[todaySch.room][snappedStart].skip) {
                        grid[todaySch.room][snappedStart].conflict = true;
                    }
                    return;
                }

                grid[todaySch.room][snappedStart] = {
                    type: 'class', title: cls.name, lecturer: lecturer?.name || '미지정', 
                    headcount: currentHeadcount, studentNames: expectedStudentNames, capacity: capacity, 
                    rowSpan: endIndex - startIndex,
                    warn: currentHeadcount > capacity ? 'over' : (currentHeadcount < capacity * 0.3 ? 'under' : 'normal'),
                    clinicSessions: [] // 클리닉 정보를 담을 배열 (TA 협업 확인용)
                };
                // RowSpan된 나머지 시간대는 skip 처리
                for (let i = startIndex + 1; i < endIndex; i++) {
                    if (TIME_SLOTS[i]) grid[todaySch.room][TIME_SLOTS[i]] = { skip: true };
                }
            }
        });

        // 3. 클리닉(조교 세션) 매핑 및 정규 수업과 병합
        todaySessions.forEach(session => {
            if (!session.classroom || !grid[session.classroom] || session.status === 'rejected') return;
            const snappedStart = snapTime(session.startTime);
            const snappedEnd = snapTime(session.endTime || '22:00');
            
            const roomObj = masterRooms.find(r => (typeof r === 'string' ? r : r.name) === session.classroom);
            const capacity = typeof roomObj === 'string' ? 999 : (roomObj?.capacity || 999);
            
            const stList = Array.isArray(session.students) ? session.students : (session.studentName ? [{name: session.studentName}] : []);
            const currentHeadcount = stList.length;
            const expectedStudentNames = stList.map(st => st.name || '미정');

            const startIndex = TIME_SLOTS.indexOf(snappedStart);
            const endIndex = TIME_SLOTS.indexOf(snappedEnd);

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                let targetCell = grid[session.classroom][snappedStart];

                // 🚀 안전 장치: 이미 다른 수업이 병합되어 skip 처리된 시간이라면, 상위 부모 셀을 찾아 병합
                if (targetCell && targetCell.skip) {
                    for (let i = startIndex - 1; i >= 0; i--) {
                        const prevCell = grid[session.classroom][TIME_SLOTS[i]];
                        if (prevCell && !prevCell.skip) {
                            targetCell = prevCell;
                            break;
                        }
                    }
                }

                // ✅ CASE 1: 해당 시간에 이미 정규 수업(class)이 있는 경우 -> 클리닉을 배열에 추가 (TA 협업 모드로 렌더링)
                if (targetCell && targetCell.type === 'class') {
                    targetCell.clinicSessions.push({
                        ...session,
                        headcount: currentHeadcount,
                        studentNames: expectedStudentNames
                    });
                    return; // 덮어쓰지 않고 병합만 수행하여 구조 보존
                }

                // 🚀 안전 장치: 빈 공간인지 확인 (해당 범위에 다른 예약이나 클래스가 있으면 충돌 처리)
                let isOverlap = false;
                for (let i = startIndex; i < endIndex; i++) {
                    if (grid[session.classroom][TIME_SLOTS[i]] !== null && grid[session.classroom][TIME_SLOTS[i]] !== targetCell) {
                        isOverlap = true;
                        break;
                    }
                }

                if (isOverlap) {
                    if (targetCell && !targetCell.skip) {
                        targetCell.conflict = true;
                    }
                    return;
                }

                // ✅ CASE 3: 빈 강의실인 경우 -> 일반/반 단체 클리닉 모드로 삽입
                let displayTitle = session.topic || '보충/직보';
                if (session.status === 'open') displayTitle = '💡 대기중 (예약가능)';

                grid[session.classroom][snappedStart] = {
                    type: 'clinic', status: session.status, title: displayTitle, lecturer: session.taName,
                    headcount: currentHeadcount, studentNames: expectedStudentNames, capacity: capacity, 
                    rowSpan: endIndex - startIndex,
                    warn: currentHeadcount > capacity ? 'over' : 'normal',
                    sessionData: session // 원본 데이터 보존
                };
                for (let i = startIndex + 1; i < endIndex; i++) {
                    if (TIME_SLOTS[i]) grid[session.classroom][TIME_SLOTS[i]] = { skip: true };
                }
            }
        });

        return grid;
    }, [masterData, classes, enrollments, examLeaves, todaySessions, users, selectedDayStr, selectedDateStr]);

    const handleManualCheckIn = async (studentId, studentName, callTime) => {
        const currentHHMM = `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`;
        const isToday = selectedDateStr === getLocalDateStr(new Date());
        const isLate = callTime && (!isToday || currentHHMM > callTime); 
        const statusVal = isLate ? 'late' : 'attended';
        const msg = isLate ? `[지각] 처리하시겠습니까?` : `[정상 출석] 처리하시겠습니까?`;

        if (!window.confirm(`[${studentName}] 학생을 ${msg}`)) return;
        try {
            const logId = `${selectedDateStr}_${studentId}`;
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/attendance_logs`, logId), {
                studentId, date: selectedDateStr, timestamp: serverTimestamp(), method: 'manual_desk', status: statusVal
            });
        } catch (e) { alert("출결 처리 실패: " + e.message); }
    };

    const handleMarkAbsent = async (studentId, studentName) => {
        if (!window.confirm(`[${studentName}] 학생을 결석 처리하시겠습니까?`)) return;
        try {
            const logId = `${selectedDateStr}_${studentId}`;
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/attendance_logs`, logId), {
                studentId, date: selectedDateStr, timestamp: serverTimestamp(), method: 'manual_desk', status: 'absent'
            });
        } catch (e) { alert("결석 처리 실패: " + e.message); }
    };

    const handleSaveExamLeave = async () => {
        if (!leaveForm.schoolName || !leaveForm.startDate || !leaveForm.endDate) return alert("학교와 기간을 모두 선택해주세요.");
        if (leaveForm.startDate > leaveForm.endDate) return alert("시작일이 종료일보다 늦을 수 없습니다.");

        setIsSavingLeave(true);
        try {
            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/exam_leaves`), {
                schoolName: leaveForm.schoolName, 
                startDate: leaveForm.startDate, 
                endDate: leaveForm.endDate,
                reason: leaveForm.reason, 
                createdAt: serverTimestamp(), 
                createdBy: currentUser.name
            });
            setIsLeaveModalOpen(false);
            setLeaveForm({ schoolName: '', startDate: '', endDate: '', reason: '1학기 기말고사 대비' });
        } catch (error) { alert("저장 실패: " + error.message); } finally { setIsSavingLeave(false); }
    };

    const handleDeleteExamLeave = async (id) => {
        if (!window.confirm("이 시험기간 면제 설정을 삭제하시겠습니까?\n삭제 즉시 정규 출결 스케줄로 원복됩니다.")) return;
        try { await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/exam_leaves`, id)); } 
        catch (error) { alert("삭제 실패: " + error.message); }
    };

    const handleCellClick = (room, time) => {
        const currentCell = matrixGrid[room][time];
        if (currentCell) return; 
        
        let endTime = '22:00';
        const startIndex = TIME_SLOTS.indexOf(time);
        if (startIndex + 4 <= TIME_SLOTS.length - 1) { 
            endTime = TIME_SLOTS[startIndex + 4];
        }
        setQuickAddForm({ room, startTime: time, endTime, topic: '직전 보충', lecturerId: currentUser.id, headcount: 1 });
        setIsQuickAddModalOpen(true);
    };

    const executeQuickAdd = async (finalRoom) => {
        try {
            const lecturer = users.find(u => u.id === quickAddForm.lecturerId);
            const docId = `quick_${Date.now()}`;
            
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/sessions`, docId), {
                taId: lecturer?.id || '', taName: lecturer?.name || '미정',
                date: selectedDateStr, 
                startTime: quickAddForm.startTime, endTime: quickAddForm.endTime,
                classroom: finalRoom, status: 'confirmed', source: 'matrix_quick_add',
                topic: quickAddForm.topic,
                students: Array(Number(quickAddForm.headcount)).fill({ name: '직보학생' }) 
            });
            
            setIsQuickAddModalOpen(false);
            setConfirmConfig(null);
        } catch (e) { alert("배정 실패: " + e.message); }
    };

    const handleQuickAddSubmit = () => {
        if (!quickAddForm.startTime || !quickAddForm.endTime || quickAddForm.startTime >= quickAddForm.endTime) {
            return alert('시간을 올바르게 설정해주세요.');
        }

        const reqHeadcount = Number(quickAddForm.headcount);
        const startIndex = TIME_SLOTS.indexOf(quickAddForm.startTime);
        const endIndex = TIME_SLOTS.indexOf(quickAddForm.endTime);
        const requiredSlots = TIME_SLOTS.slice(startIndex, endIndex);

        const checkRoomAvailable = (roomName) => {
            const rObj = (masterData?.classrooms || []).find(r => (typeof r === 'string' ? r : r.name) === roomName);
            const cap = typeof rObj === 'string' ? 999 : (rObj?.capacity || 999);
            if (cap < reqHeadcount) return false; 
            for (const slot of requiredSlots) {
                if (matrixGrid[roomName][slot] !== null) return false;
            }
            return true;
        };

        if (checkRoomAvailable(quickAddForm.room)) {
            return executeQuickAdd(quickAddForm.room);
        }

        const masterRooms = masterData?.classrooms || [];
        const availableRooms = masterRooms
            .filter(r => checkRoomAvailable(typeof r === 'string' ? r : r.name))
            .sort((a, b) => {
                const capA = typeof a === 'string' ? 999 : (a.capacity || 999);
                const capB = typeof b === 'string' ? 999 : (b.capacity || 999);
                return capA - capB; 
            });

        if (availableRooms.length > 0) {
            const bestRoom = typeof availableRooms[0] === 'string' ? availableRooms[0] : availableRooms[0].name;
            setConfirmConfig({
                message: `🚨 선택하신 [${quickAddForm.room}]는 정원이 초과되거나 이미 수업이 있습니다.\n\n대신 현재 비어있는 [${bestRoom}]로 자동 변경하여 배정하시겠습니까?`,
                onConfirm: () => executeQuickAdd(bestRoom)
            });
        } else {
            alert(`🚨 지정하신 시간에 ${reqHeadcount}명을 수용할 수 있는 빈 강의실이 학원 전체에 단 한 곳도 없습니다.`);
        }
    };

    if (loadingData || localLoading) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-screen-2xl mx-auto space-y-6 pb-20 animate-in fade-in h-screen flex flex-col">
            
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-300 shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <UserCheck className="text-indigo-600" /> 통합 출결 및 공간 관제
                    </h1>
                    
                    <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                        <CalendarDays size={18} className="text-slate-500 ml-2" />
                        <input 
                            type="date" 
                            value={selectedDateStr}
                            onChange={(e) => {
                                const d = new Date(e.target.value);
                                if (!isNaN(d.getTime())) setSelectedDateObj(d);
                            }}
                            className="bg-transparent border-none outline-none font-bold text-slate-700 text-sm cursor-pointer"
                        />
                        {selectedDateStr !== getLocalDateStr(new Date()) && (
                            <button onClick={() => setSelectedDateObj(new Date())} className="text-[10px] font-bold bg-white text-indigo-600 border border-slate-200 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm mr-1">
                                오늘
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-2xl flex-wrap justify-center gap-1 w-full md:w-auto">
                    <button onClick={() => setActiveTab('daily')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${activeTab === 'daily' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>일별 운영 관제</button>
                    <button onClick={() => setActiveTab('matrix')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-1 ${activeTab === 'matrix' ? 'bg-white text-emerald-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>
                        <LayoutGrid size={16}/> 교실 매트릭스
                    </button>
                    <button onClick={() => setActiveTab('student')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm ${activeTab === 'student' ? 'bg-white text-blue-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>원생별 출결</button>
                    <button onClick={() => setActiveTab('exam_leave')} className={`px-5 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-1 ${activeTab === 'exam_leave' ? 'bg-white text-rose-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>
                        시험결석 설정 {examLeaves.length > 0 && <span className="bg-rose-100 text-rose-600 px-1.5 rounded-full text-[10px]">{examLeaves.length}</span>}
                    </button>
                </div>
            </div>

            {/* TAB 1: 일별 운영 관제 */}
            {activeTab === 'daily' && (
                <div className="flex flex-col h-full gap-6">
                    <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-6 rounded-3xl shadow-lg shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Activity size={28} className="animate-pulse" />
                                <h2 className="text-xl md:text-2xl font-black">{selectedDayStr}요일 실시간 출결 현황</h2>
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
                        <div className="flex-1 bg-white border border-slate-300 rounded-3xl shadow-sm flex flex-col min-h-[400px]">
                            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50 rounded-t-3xl shrink-0">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2"><Users size={18}/> 콜 타임(Call Time)별 타임라인</h2>
                                <div className="relative w-full sm:w-64">
                                    <input type="text" placeholder="학생 이름, 반 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold bg-white"/>
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                                {radarData.groups.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                        <Activity size={48} className="opacity-20 mb-4"/>
                                        <p className="font-bold">선택하신 날짜에 예정된 스케줄이 없습니다.</p>
                                    </div>
                                ) : (
                                    radarData.groups.map((group, idx) => {
                                        const hasLate = group.students.some(s => s.status === 'late');
                                        return (
                                            <div key={idx} className={`border-2 rounded-2xl p-4 transition-all ${hasLate ? 'border-rose-300 bg-rose-50/20 shadow-sm' : 'border-slate-200 bg-white'}`}>
                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-xs font-black px-2 py-0.5 rounded-md ${hasLate ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>콜타임 {group.callTime}</span>
                                                            <span className="text-xs font-bold text-slate-500">본수업 {group.classTime}</span>
                                                        </div>
                                                        <h3 className="text-lg font-black text-slate-900">{group.className}</h3>
                                                    </div>
                                                    <div className="flex flex-row md:flex-col gap-3 md:gap-1 text-xs font-bold text-slate-500">
                                                        <div className="flex items-center gap-1"><User size={12}/> {group.lecturerName} 강사</div>
                                                        <div className="flex items-center gap-1"><MapPin size={12}/> {group.room}</div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {group.students.map(student => (
                                                        <div key={student.studentId} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-sm transition-all ${student.status === 'late' ? 'bg-rose-50 border-rose-300 text-rose-800' : student.status === 'attended' || student.status === 'late_attended' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : student.status === 'absent' ? 'bg-slate-100 border-slate-300 text-slate-500' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                                                            <span className="font-bold">{student.studentName}</span>
                                                            {student.status === 'late' && <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded animate-pulse">지각</span>}
                                                            {student.status === 'attended' && <span className="text-emerald-500 text-[10px] font-black flex items-center gap-0.5"><Check size={12}/> 정상 출석</span>}
                                                            {student.status === 'late_attended' && <span className="text-amber-500 text-[10px] font-black flex items-center gap-0.5"><Check size={12}/> 지각 등원</span>}
                                                            {student.status === 'absent' && <span className="text-rose-500 text-[10px] font-black flex items-center gap-0.5"><X size={12}/> 결석</span>}
                                                            {student.status === 'expected' && <span className="text-slate-400 text-[10px] font-black">대기</span>}
                                                            
                                                            {['expected', 'late'].includes(student.status) && (
                                                                <div className="flex gap-1 ml-1">
                                                                    <button onClick={() => handleManualCheckIn(student.studentId, student.studentName, group.callTime)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${student.status === 'late' ? 'bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-slate-100 text-slate-500 hover:bg-emerald-500 hover:text-white'}`}>
                                                                        등원
                                                                    </button>
                                                                    <button onClick={() => handleMarkAbsent(student.studentId, student.studentName)} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors">
                                                                        결석
                                                                    </button>
                                                                </div>
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

                        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
                            <div className="bg-rose-50 border-2 border-rose-300 rounded-3xl p-5 shadow-sm flex flex-col h-1/2 min-h-[300px]">
                                <h2 className="text-lg font-black text-rose-800 mb-3 flex items-center gap-2">
                                    <ShieldAlert size={20} className="animate-pulse"/> 긴급 콜 리스트
                                </h2>
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                                    {radarData.emergencyList.length === 0 ? (
                                        <div className="text-center py-10 text-rose-400 font-bold text-sm">지각생이 없습니다! 🕊️</div>
                                    ) : (
                                        radarData.emergencyList.map(data => (
                                            <div key={`call_${data.enrollId}`} className="bg-white p-3 rounded-xl border border-rose-300 shadow-sm relative group hover:border-rose-400">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <span className="font-bold text-slate-900">{data.studentName}</span>
                                                        <span className="text-[10px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded ml-2 animate-pulse">{data.callTime} 지각</span>
                                                    </div>
                                                </div>
                                                <div className="text-[11px] font-bold text-slate-500 mb-2 truncate">{data.className}</div>
                                                <div className="bg-slate-50 p-2 rounded-lg flex justify-between items-center border border-slate-200">
                                                    <div className="font-mono text-xs font-bold text-slate-700">{data.phone || '번호없음'}</div>
                                                    <a href={`tel:${data.phone}`} className="w-7 h-7 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-500 hover:text-white"><PhoneCall size={14} /></a>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 border-2 border-slate-300 rounded-3xl p-5 shadow-sm flex flex-col flex-1 min-h-[200px]">
                                <h2 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
                                    <CalendarDays size={18} className="text-slate-500"/> 자동 출석 면제 현황
                                </h2>
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                                    {radarData.examLeaveList.length === 0 ? (
                                        <div className="text-center py-6 text-slate-400 font-bold text-xs">오늘 면제자가 없습니다.</div>
                                    ) : (
                                        radarData.examLeaveList.map((data, idx) => (
                                            <div key={idx} className="bg-white px-3 py-2 rounded-lg border border-slate-300 flex justify-between items-center shadow-sm">
                                                <span className="font-bold text-slate-800 text-sm">{data.studentName} <span className="font-normal text-xs text-slate-500 ml-1">({data.schoolName || '학교미상'})</span></span>
                                                <span className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]">{data.className}</span>
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
                    <div className="lg:col-span-1 bg-white border border-slate-300 rounded-2xl shadow-sm flex flex-col h-full">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                            <div className="relative">
                                <input type="text" placeholder="이름, 학교 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold bg-white"/>
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            {searchQuery.trim().length === 0 ? (
                                <div className="text-center py-10 text-slate-400 font-bold text-sm flex flex-col items-center">
                                    <Search size={32} className="mb-3 opacity-20"/>
                                    학생 이름을 검색해주세요.
                                </div>
                            ) : (
                                users.filter(u => u.role === 'student' && (u.name.includes(searchQuery) || (u.schoolName||'').includes(searchQuery))).map(student => (
                                    <button key={student.id} onClick={() => setSelectedStudentId(student.id)} className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 mb-1 ${selectedStudentId === student.id ? 'bg-blue-50 border-2 border-blue-400 shadow-sm' : 'hover:bg-slate-50 border-2 border-transparent'}`}>
                                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black shrink-0">{student.name[0]}</div>
                                        <div>
                                            <div className={`font-bold ${selectedStudentId === student.id ? 'text-blue-900' : 'text-slate-800'}`}>{student.name}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{student.schoolName}</div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="lg:col-span-2 bg-white border border-slate-300 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
                        {!selectedStudentId ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                                <UserCheck size={48} className="opacity-20" />
                                <p className="font-bold">좌측에서 학생을 검색 및 선택하면 상세 출결을 봅니다.</p>
                            </div>
                        ) : (
                            <>
                                <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-blue-50/30">
                                    <div>
                                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                            {users.find(u=>u.id===selectedStudentId)?.name} <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200">출결 통계</span>
                                        </h2>
                                    </div>
                                    <div className="bg-white border border-slate-300 px-4 py-2 rounded-xl text-center shadow-sm">
                                        <div className="text-xs text-slate-500 font-bold">누적 기록 횟수</div>
                                        <div className="text-xl font-black text-blue-600">{studentLogs.length}회</div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-slate-50">
                                    {studentLogs.length === 0 ? (
                                        <div className="text-center py-16 text-slate-400 font-bold border-2 border-dashed border-slate-300 rounded-2xl bg-white">기록이 없습니다.</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {studentLogs.map(log => {
                                                const isAbsent = log.status === 'absent';
                                                const isLate = log.status === 'late';
                                                return (
                                                <div key={log.id} className="bg-white border border-slate-300 rounded-xl p-4 flex justify-between items-center shadow-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${isAbsent ? 'bg-rose-100 text-rose-600 border-rose-200' : isLate ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-emerald-100 text-emerald-600 border-emerald-200'}`}>
                                                            {isAbsent ? <X size={20}/> : isLate ? <AlertTriangle size={20}/> : <CheckCircle size={20}/>}
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-slate-800">{log.date}</div>
                                                            <div className="text-xs text-slate-500 font-bold mt-1">
                                                                상태: <span className={isAbsent ? 'text-rose-600' : isLate ? 'text-amber-600' : 'text-emerald-600'}>{isAbsent ? '결석' : isLate ? '지각' : '정상 출석'}</span>
                                                                <span className="mx-2 text-slate-300">|</span>
                                                                방식: {log.method === 'manual_desk' ? '데스크 수동 인증' : '키패드 인증'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-sm font-mono text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 font-bold">
                                                        {new Date(log.timestamp?.seconds * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: 시험기간 면제 관리 */}
            {activeTab === 'exam_leave' && (
                <div className="flex flex-col h-full gap-6 animate-in fade-in">
                    <Card className="bg-rose-50 border-2 border-rose-300 w-full shrink-0">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                            <div>
                                <h2 className="text-xl font-black text-rose-800 flex items-center gap-2 mb-2"><AlertTriangle size={20}/> 학교 단위 시험결석(Bypass) 관리</h2>
                                <p className="text-sm font-bold text-rose-600">등록된 학교 학생들은 모두 해당 기간 동안 정규 출결에서 자동 제외(면제)되며, 교실 수용 인원 계산에서도 차감됩니다.</p>
                            </div>
                            <Button onClick={() => setIsLeaveModalOpen(true)} className="bg-rose-600 hover:bg-rose-700 shadow-md font-bold" icon={Plus}>면제 대상 학교 추가</Button>
                        </div>
                    </Card>

                    <Card className="flex-1 overflow-hidden p-0 flex flex-col border border-slate-300">
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {examLeaves.length === 0 ? (
                                <div className="text-center py-20 text-slate-400 font-bold flex flex-col items-center">
                                    <CalendarDays size={48} className="opacity-20 mb-4"/>
                                    현재 설정된 시험 기간/면제 학교가 없습니다.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {examLeaves.map(leave => {
                                        const isExpired = selectedDateStr > leave.endDate;
                                        const displayName = leave.schoolName ? `${leave.schoolName} 전체` : `${leave.studentName} 학생 (구버전)`;
                                        const iconMode = leave.schoolName ? <School size={16} className="text-indigo-500 mr-1 inline"/> : <User size={16} className="text-gray-400 mr-1 inline"/>;
                                        
                                        return (
                                            <div key={leave.id} className={`border-2 rounded-2xl p-5 relative overflow-hidden transition-all ${isExpired ? 'bg-slate-50 border-slate-300 opacity-60' : 'bg-white border-rose-300 shadow-sm'}`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full mb-2 inline-block border ${isExpired ? 'bg-slate-200 text-slate-600 border-slate-300' : 'bg-rose-100 text-rose-700 border-rose-300 animate-pulse'}`}>
                                                            {isExpired ? '기간 만료' : '면제 적용 중'}
                                                        </span>
                                                        <h3 className="text-lg font-black text-slate-900 break-keep leading-tight">{iconMode}{displayName}</h3>
                                                    </div>
                                                    <button onClick={() => handleDeleteExamLeave(leave.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                                </div>
                                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1">
                                                    <div className="text-xs font-bold text-slate-500">면제 사유: <span className="text-slate-800">{leave.reason}</span></div>
                                                    <div className="text-xs font-bold text-slate-500">적용 기간: <span className="text-rose-600">{leave.startDate} ~ {leave.endDate}</span></div>
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

            {/* 🚀 TAB 4: 교실 매트릭스 (Room Matrix View) */}
            {activeTab === 'matrix' && (
                <div className="flex flex-col h-full gap-6 animate-in fade-in">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-5 rounded-3xl shadow-lg shrink-0 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <LayoutGrid size={24} />
                                <h2 className="text-xl font-black">{selectedDateStr} 교실 자원 관제탑</h2>
                            </div>
                            <p className="opacity-90 text-sm">강사별 고유 색상 식별. 빈 칸을 클릭하여 직보/보충을 즉시 배정하세요.</p>
                        </div>
                        <div className="flex gap-2 bg-black/20 p-2 rounded-xl text-xs font-bold">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-white/90 rounded-sm"></span> 정규반</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-white/40 rounded-sm"></span> 클리닉/직보</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-500 rounded-sm"></span> 단체 대관</span>
                        </div>
                    </div>

                    <div className="flex-1 bg-white border border-slate-300 rounded-3xl shadow-sm overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-auto custom-scrollbar relative">
                            <table className="w-full min-w-[1200px] border-collapse text-sm border-2 border-slate-300">
                                <thead className="bg-slate-100 sticky top-0 z-20 shadow-md">
                                    <tr>
                                        <th className="p-3 border border-slate-300 text-center w-20 bg-slate-200">시간</th>
                                        {masterData?.classrooms?.map((room, idx) => {
                                            const rName = typeof room === 'string' ? room : room.name;
                                            const rCap = typeof room === 'string' ? '' : room.capacity;
                                            return (
                                                <th key={idx} className="p-3 border border-slate-300 text-center font-black text-slate-700 min-w-[150px]">
                                                    {rName} <br/><span className="text-[10px] text-slate-500 font-bold">{rCap ? `수용: ${rCap}명` : ''}</span>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {TIME_SLOTS.map((time, tIdx) => (
                                        <tr key={time} className="hover:bg-slate-50/50">
                                            <td className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-500 bg-slate-100 sticky left-0 z-10">
                                                {time}
                                            </td>
                                            {masterData?.classrooms?.map((room, rIdx) => {
                                                const rName = typeof room === 'string' ? room : room.name;
                                                const cellData = matrixGrid[rName]?.[time];
                                                
                                                // 병합되어 숨겨진 셀 처리
                                                if (cellData?.skip) return null;

                                                // 🚀 [CTO 패치] 1. 빈 교실 렌더링
                                                if (!cellData) {
                                                    return (
                                                        <td key={rIdx} 
                                                            onClick={() => handleCellClick(rName, time)}
                                                            className="p-2 border border-slate-300 text-center text-transparent hover:bg-emerald-50 hover:text-emerald-500 cursor-pointer transition-colors font-black text-xs"
                                                        >
                                                            + 배정하기
                                                        </td>
                                                    );
                                                }

                                                // 🚀 [CTO 패치] 2. 정규 수업 + TA 협업 분기 렌더링
                                                if (cellData.type === 'class') {
                                                    const classGroupClinic = cellData.clinicSessions?.find(s => {
                                                        const stList = Array.isArray(s.students) ? s.students : [];
                                                        const names = stList.map(st => st.name).join('');
                                                        return names.includes('[반 단체]') || (s.studentName && s.studentName.includes('[반 단체]'));
                                                    });

                                                    if (classGroupClinic) {
                                                        // [CASE 1: 정규 수업 + TA 협업]
                                                        return (
                                                            <td key={rIdx} rowSpan={cellData.rowSpan} className="p-2 border-2 align-top transition-all hover:brightness-95 cursor-pointer bg-blue-50 border-blue-400 text-blue-900 shadow-sm relative">
                                                                <div className="absolute top-0 right-0 bg-amber-400 text-amber-950 text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg flex items-center gap-0.5 shadow-sm">
                                                                    <ShieldCheck size={10} /> TA 협업
                                                                </div>
                                                                <div className="font-black text-sm leading-tight break-keep pr-14 mt-1">{cellData.title}</div>
                                                                <div className="text-xs font-bold opacity-80 mt-1 flex justify-between items-end">
                                                                    <span>{cellData.lecturer} 강사</span>
                                                                    <span className="text-[10px] text-blue-600 bg-blue-100 px-1 rounded">조교: {classGroupClinic.taName}</span>
                                                                </div>
                                                            </td>
                                                        );
                                                    } else {
                                                        // [CASE 2: 정규 수업 단독]
                                                        const colorClass = cellData.conflict ? 'bg-rose-100 border-rose-500 text-rose-900 animate-pulse' : 'bg-slate-100 border-slate-300 text-slate-800';
                                                        return (
                                                            <td key={rIdx} rowSpan={cellData.rowSpan} className={`p-2 border-2 align-top transition-all hover:brightness-95 cursor-pointer ${colorClass}`}>
                                                                <div className="h-full flex flex-col gap-1 relative">
                                                                    <div className="flex justify-between items-start mb-1">
                                                                        <span className="bg-white/90 border-white text-slate-800 text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm border">
                                                                            📚 정규
                                                                        </span>
                                                                        {cellData.warn === 'over' && <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-sm border border-rose-600">초과</span>}
                                                                        {cellData.conflict && <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-sm flex items-center gap-1 border border-rose-800"><AlertTriangle size={10}/> 중복</span>}
                                                                    </div>
                                                                    <div className="font-black text-sm leading-tight break-keep">{cellData.title}</div>
                                                                    <div className="text-xs font-bold opacity-80">{cellData.lecturer} 강사</div>
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                }

                                                // 🚀 [CTO 패치] 3. 단독 반 단체 클리닉 & 개별 클리닉 분기 렌더링
                                                if (cellData.type === 'clinic') {
                                                    const isClassGroup = cellData.studentNames?.some(n => n.includes('[반 단체]')) || (cellData.sessionData?.studentName && cellData.sessionData.studentName.includes('[반 단체]'));

                                                    if (isClassGroup) {
                                                        // [CASE 3: 단독 반 단체 클리닉 (대관/보강)]
                                                        const rawNames = (cellData.studentNames && cellData.studentNames.length > 0) 
                                                            ? cellData.studentNames.join(', ') 
                                                            : (cellData.sessionData?.studentName || '');
                                                        const cleanName = String(rawNames || '').replace(/\[반 단체\]\s*/g, '').trim() || '반 단체 예약';
                                                        
                                                        return (
                                                            <td key={rIdx} rowSpan={cellData.rowSpan} className="p-2 border-2 align-top transition-all hover:brightness-95 cursor-pointer bg-purple-100 border-purple-400 text-purple-900 shadow-sm relative">
                                                                <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-bl-lg">
                                                                    단체 대관
                                                                </div>
                                                                <div className="flex items-center gap-1.5 font-black text-sm mb-1 mt-2">
                                                                    <Users size={14} className="text-purple-600 shrink-0" />
                                                                    <span className="truncate">{cleanName}</span>
                                                                </div>
                                                                <div className="text-xs font-bold text-purple-700">
                                                                    담당: {cellData.lecturer} T
                                                                </div>
                                                            </td>
                                                        );
                                                    } else {
                                                        // [CASE 4: 일반 개별 클리닉 (1:N)]
                                                        const colorClass = cellData.conflict ? 'bg-rose-100 border-rose-500 text-rose-900 animate-pulse' : getTeacherColor(cellData.lecturer);
                                                        return (
                                                            <td key={rIdx} rowSpan={cellData.rowSpan} className={`p-2 border-2 align-top transition-all hover:brightness-95 cursor-pointer ${colorClass}`}>
                                                                <div className="h-full flex flex-col gap-1 relative">
                                                                    <div className="flex justify-between items-start mb-1">
                                                                        <span className="bg-white/40 border-white/50 text-slate-700 text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm border">
                                                                            💡 클리닉
                                                                        </span>
                                                                        {cellData.warn === 'over' && <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-sm border border-rose-600">초과</span>}
                                                                        {cellData.conflict && <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-sm flex items-center gap-1 border border-rose-800"><AlertTriangle size={10}/> 중복</span>}
                                                                    </div>
                                                                    
                                                                    <div className="font-black text-sm leading-tight break-keep">{cellData.title}</div>
                                                                    <div className="text-xs font-bold opacity-80">{cellData.lecturer} T</div>
                                                                    
                                                                    <div className="mt-auto pt-2 flex items-center justify-between">
                                                                        <div className="relative group/tooltip w-full">
                                                                            <span className="text-[10px] font-bold bg-white/50 px-1.5 py-0.5 rounded border border-white/30 cursor-help block w-fit">
                                                                                예약: {cellData.headcount}명
                                                                            </span>
                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-max min-w-[60px] max-w-[120px] bg-slate-800 text-white text-[11px] p-2 rounded-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-[100] shadow-xl pointer-events-none">
                                                                                {cellData.studentNames?.length > 0 ? (
                                                                                    <div className="flex flex-col gap-0.5">
                                                                                        {cellData.studentNames.map((n, i) => <span key={i} className="text-center truncate">{n}</span>)}
                                                                                    </div>
                                                                                ) : '명단 없음'}
                                                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                }
                                                return null;
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* 모달: 시험기간 면제자 추가 */}
            <Modal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} title="학교 단위 시험기간 면제 설정">
                <div className="space-y-5 p-2">
                    <div className="bg-rose-50 p-4 rounded-xl text-rose-700 text-sm font-bold flex items-start gap-2 border border-rose-200">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5"/>
                        이 기간 동안 해당 학교의 모든 학생은 학원에 오지 않아도 결석 처리되지 않으며, 긴급 콜 리스트에서 자동 제외됩니다.
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 block">1. 대상 학교 선택</label>
                        <select className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white text-slate-800" value={leaveForm.schoolName} onChange={e => setLeaveForm({...leaveForm, schoolName: e.target.value})}>
                            <option value="">학교를 선택해주세요</option>
                            {uniqueSchools.map(school => (
                                <option key={school} value={school}>{school}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-700 mb-1.5 block">2. 시작일</label>
                            <input type="date" className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white" value={leaveForm.startDate} onChange={e => setLeaveForm({...leaveForm, startDate: e.target.value})} />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-700 mb-1.5 block">3. 종료일</label>
                            <input type="date" className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white" value={leaveForm.endDate} onChange={e => setLeaveForm({...leaveForm, endDate: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-700 mb-1.5 block">4. 사유</label>
                        <input type="text" className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-rose-500 font-bold bg-white" value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} placeholder="예: 1학기 기말고사 집중 기간" />
                    </div>

                    <Button className="w-full py-4 text-lg font-black bg-rose-600 hover:bg-rose-700 shadow-lg mt-4" onClick={handleSaveExamLeave} disabled={isSavingLeave}>
                        {isSavingLeave ? <Loader className="animate-spin mx-auto"/> : '학교 단위 면제(Bypass) 기간 저장'}
                    </Button>
                </div>
            </Modal>

            {/* [Auto-Resolver] 퀵 등록 모달 */}
            <Modal isOpen={isQuickAddModalOpen} onClose={() => setIsQuickAddModalOpen(false)} title="직전 보충 / 클리닉 퀵 배정">
                <div className="space-y-4">
                    <div className="bg-emerald-50 p-4 rounded-xl text-emerald-800 font-bold text-sm border border-emerald-300">
                        선택하신 <span className="font-black">[{quickAddForm.room}]</span>에 스케줄을 배정합니다. 만약 충돌이 발생하면 시스템이 최적의 대안 교실을 제안해 드립니다.
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">강의 내용 / 타이틀</label>
                        <input type="text" className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-emerald-500 font-bold" value={quickAddForm.topic} onChange={e => setQuickAddForm({...quickAddForm, topic: e.target.value})} placeholder="예: 신목고 2학년 내신 직보" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1.5 block">담당 강사</label>
                            <select className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-emerald-500 font-bold bg-white" value={quickAddForm.lecturerId} onChange={e => setQuickAddForm({...quickAddForm, lecturerId: e.target.value})}>
                                {users.filter(u => ['lecturer', 'ta', 'admin_assistant', 'admin'].includes(u.role)).map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-600 mb-1.5 block">참석 예상 인원수</label>
                            <input type="number" min="1" className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-emerald-500 font-bold" value={quickAddForm.headcount} onChange={e => setQuickAddForm({...quickAddForm, headcount: e.target.value})} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">시작 시간</label>
                            <select className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-emerald-500 font-bold bg-white" value={quickAddForm.startTime} onChange={e => setQuickAddForm({...quickAddForm, startTime: e.target.value})}>
                                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 mb-1 block">종료 시간</label>
                            <select className="w-full border-2 border-slate-300 p-3 rounded-xl outline-none focus:border-emerald-500 font-bold bg-white" value={quickAddForm.endTime} onChange={e => setQuickAddForm({...quickAddForm, endTime: e.target.value})}>
                                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    <Button className="w-full py-4 text-lg font-black shadow-lg bg-emerald-600 hover:bg-emerald-700 mt-4" onClick={handleQuickAddSubmit}>
                        스마트 배정 등록 (Auto-Resolve)
                    </Button>
                </div>
            </Modal>

            <Modal isOpen={!!confirmConfig} onClose={() => setConfirmConfig(null)} title="🚨 스마트 교실 재배정">
                <div className="space-y-6 p-2 text-center">
                    <p className="text-base text-slate-800 font-bold whitespace-pre-wrap leading-relaxed bg-rose-50 p-6 rounded-2xl border border-rose-200">{confirmConfig?.message}</p>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => setConfirmConfig(null)} className="flex-1 py-4 text-lg font-bold border-2 border-slate-300">취소</Button>
                        <Button variant="danger" onClick={() => { confirmConfig.onConfirm(); }} className="flex-1 py-4 text-lg font-black bg-rose-600 hover:bg-rose-700 shadow-md">네, 제안대로 변경합니다</Button>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default AttendanceManager;