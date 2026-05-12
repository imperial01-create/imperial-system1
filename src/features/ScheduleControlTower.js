import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, onSnapshot, doc, getDoc, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Calendar as CalendarIcon, MapPin, UploadCloud, 
  CheckCircle, XCircle, ChevronRight, User, 
  AlertTriangle, Printer, Bell, Loader, Users, CalendarDays,
  ChevronLeft
} from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", 
  "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

const CLASS_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-purple-50 border-purple-200 text-purple-900',
  'bg-rose-50 border-rose-200 text-rose-900',
  'bg-amber-50 border-amber-200 text-amber-900',
  'bg-indigo-50 border-indigo-200 text-indigo-900',
  'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900',
];

const getClassColor = (className) => {
  if (!className) return CLASS_COLORS[0];
  let hash = 0;
  for (let i = 0; i < className.length; i++) hash = className.charCodeAt(i) + ((hash << 5) - hash);
  return CLASS_COLORS[Math.abs(hash) % CLASS_COLORS.length];
};

const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const normalizeRoomName = (roomStr) => {
  if (!roomStr) return '';
  const cleaned = String(roomStr).trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.startsWith('CLASSROOM')) {
      const num = cleaned.replace('CLASSROOM', '');
      return `Classroom ${num}`;
  }
  if (cleaned.startsWith('CLASS')) {
      const num = cleaned.replace('CLASS', '');
      return `Classroom ${num}`;
  }
  return String(roomStr).trim();
};

const ScheduleControlTower = ({ currentUser }) => {
  const isAdmin = currentUser?.role === 'admin';
  const myName = currentUser?.name || '';
  
  const [viewMode, setViewMode] = useState(isAdmin ? 'TEACHER' : 'TEACHER');
  const [selectedFilter, setSelectedFilter] = useState(isAdmin ? '' : myName);
  
  const [mobileSelectedDay, setMobileSelectedDay] = useState("월");
  const [mobileSelectedRoom, setMobileSelectedRoom] = useState(""); 
  
  const [baseSchedules, setBaseSchedules] = useState([]);
  const [studentsMap, setStudentsMap] = useState({});
  const [requests, setRequests] = useState([]);
  const [clinics, setClinics] = useState([]); 
  const [isLoading, setIsLoading] = useState(true);

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.getFullYear(), d.getMonth(), diff);
  });

  const weekEnd = useMemo(() => {
      const end = new Date(currentWeekStart);
      end.setDate(end.getDate() + 6);
      return end;
  }, [currentWeekStart]);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [changeRequestModal, setChangeRequestModal] = useState(null);

  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

  // 🚀 [보안/UX 고도화]: 강사 접속 시 다른 선생님 데이터 열람 원천 차단
  useEffect(() => {
    if (!isAdmin) {
        setViewMode('TEACHER');
        setSelectedFilter(myName);
    }
  }, [isAdmin, myName]);

  // 🚀 [성능 최적화 1]: 뼈대 데이터 및 변경 요청 데이터 로드 (최초 1회 마운트 시에만)
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    const loadBaseData = async () => {
      try {
        const docRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schedule_base');
        const docSnap = await getDoc(docRef);
        if (isMounted && docSnap.exists()) {
          setBaseSchedules(docSnap.data().schedules || []);
          setStudentsMap(docSnap.data().studentsMap || {});
        }
      } catch (e) { console.error("뼈대 데이터 로드 실패:", e); }
    };
    loadBaseData();

    // 관리자 결재함을 위해 PENDING 처리가 필요하므로 전체 요청을 구독 (데이터량이 적어 문제없음)
    const unsubReq = onSnapshot(query(collection(db, `artifacts/${APP_ID}/public/data/schedule_requests`)), (snap) => {
      if (isMounted) setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => { });

    return () => { isMounted = false; unsubReq(); };
  }, []);

  // 🚀 [성능 최적화 2]: 클리닉(Sessions) 데이터는 주간 캘린더 날짜에 맞춰 필터링하여 최소한의 읽기(Read)만 수행
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    
    const weekStartStr = formatDate(currentWeekStart);
    const weekEndStr = formatDate(weekEnd);

    const qClinics = query(
        collection(db, `artifacts/${APP_ID}/public/data/sessions`),
        where('date', '>=', weekStartStr),
        where('date', '<=', weekEndStr)
    );

    const unsubClinics = onSnapshot(qClinics, (snap) => {
      if (isMounted) {
          setClinics(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setIsLoading(false);
      }
    }, () => { if (isMounted) setIsLoading(false); });

    return () => { isMounted = false; unsubClinics(); };
  }, [currentWeekStart, weekEnd]);

  const teacherList = useMemo(() => Array.from(new Set(baseSchedules.map(s => s.teacher))).filter(Boolean), [baseSchedules]);
  
  const roomList = useMemo(() => {
    const baseRooms = baseSchedules.map(s => normalizeRoomName(s.room));
    const clinicRooms = clinics.map(c => c.classroom ? normalizeRoomName(c.classroom) : null);
    return Array.from(new Set([...baseRooms, ...clinicRooms]))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [baseSchedules, clinics]);

  useEffect(() => {
    if (roomList.length > 0 && !mobileSelectedRoom) setMobileSelectedRoom(roomList[0]);
  }, [roomList, mobileSelectedRoom]);

  const activeSchedules = useMemo(() => {
    let list = baseSchedules.map(s => ({ ...s, room: normalizeRoomName(s.room) }));
    const weekStartStr = formatDate(currentWeekStart);
    const weekEndStr = formatDate(weekEnd);

    requests.filter(r => r.status === 'APPROVED').forEach(req => {
      if (req.type === 'PERMANENT') {
        const idx = list.findIndex(s => s.id === req.originalScheduleId);
        if (idx > -1) { 
            list[idx] = { ...list[idx], day: req.newDay, startTime: req.newStartTime, endTime: req.newEndTime, room: normalizeRoomName(req.newRoom) }; 
        }
      } else if (req.type === 'MAKEUP' || req.type === 'TEMPORARY') {
        if (req.targetDate >= weekStartStr && req.targetDate <= weekEndStr) {
            list.push({
              id: `mod_${req.id}`, teacher: req.requestTeacher, day: req.newDay,
              startTime: req.newStartTime, endTime: req.newEndTime, room: normalizeRoomName(req.newRoom),
              grade: req.grade, className: req.className + (req.type === 'MAKEUP' ? ' (보강)' : ' (일시변경)'),
              isModified: true, targetDate: req.targetDate
            });
        }
      }
    });

    clinics.forEach(c => {
        if ((c.status === 'confirmed' || c.status === 'completed' || c.status === 'pending' || c.status === 'open') && c.classroom) {
            if (c.date >= weekStartStr && c.date <= weekEndStr) {
                const d = new Date(c.date);
                const dayStr = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1]; 
                
                list.push({
                    id: `clinic_${c.id}`,
                    teacher: `${c.taName} TA`,
                    day: dayStr,
                    startTime: c.startTime,
                    endTime: c.endTime,
                    room: normalizeRoomName(c.classroom), 
                    grade: '클리닉 센터',
                    className: `${c.taName}TA클리닉`, 
                    isModified: false,
                    isClinic: true,
                    clinicStatus: c.status,
                    taName: c.taName
                });
            }
        }
    });

    if (viewMode === 'TEACHER') {
        return list.filter(s => s.teacher === (selectedFilter || (teacherList[0] || '')));
    } else {
        return list.filter(s => s.day === (selectedFilter || "월"));
    }
  }, [baseSchedules, requests, clinics, viewMode, selectedFilter, teacherList, currentWeekStart, weekEnd]);

  const getStudentsForClass = (className, map) => {
    if (!className || !map) return [];
    if (className.includes('TA클리닉')) return []; 
    const cleanTarget = className.replace(/\(.*\)/g, '').trim();
    if (map[cleanTarget]) return map[cleanTarget]; 
    for (const [key, students] of Object.entries(map)) {
        const cleanKey = key.replace(/\(.*\)/g, '').trim();
        if (cleanKey.includes(cleanTarget) || cleanTarget.includes(cleanKey)) return students;
    }
    return [];
  };

  const getScheduleStyle = (start, end) => {
    try {
        const [sH, sM] = start.split(':').map(s => parseInt(s.trim(), 10) || 0);
        const [eH, eM] = end.split(':').map(e => parseInt(e.trim(), 10) || 0);
        const durationMins = (eH * 60 + eM) - (sH * 60 + sM);
        return {
            top: `calc(${(sM / 60) * 100}% + 2px)`, 
            height: `calc(${(durationMins / 60) * 100}% - 4px)`, 
            minHeight: '40px', zIndex: 10 
        };
    } catch (e) { return { top: '0%', height: '100%' }; }
  };

  const [uploadData, setUploadData] = useState({ schedules: [], studentsMap: {} });
  
  const handleTeacherExcel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        let currentTeacher = ''; const parsedSchedules = [];

        rows.forEach(row => {
          if (row[0] && String(row[0]).includes('* 강사명 :')) {
            currentTeacher = String(row[0]).replace('* 강사명 :', '').trim();
          } else if (row[0] && String(row[0]).includes('~')) {
            const [start, end] = String(row[0]).split('~').map(s => s.trim());
            for (let i = 1; i <= 7; i++) {
              if (row[i]) {
                const parts = String(row[i]).split('\n').map(s => s.trim()).filter(Boolean);
                if (parts.length >= 3) {
                  const cleanClassName = parts[1].replace(/\(.*\)/g, '').trim();
                  const standardizedRoom = normalizeRoomName(parts[2]);
                  parsedSchedules.push({
                    id: `base_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
                    teacher: currentTeacher, day: DAYS[i - 1], startTime: start, endTime: end,
                    grade: parts[0], className: cleanClassName, room: standardizedRoom,
                  });
                }
              }
            }
          }
        });
        setUploadData(prev => ({ ...prev, schedules: parsedSchedules }));
        alert(`강사별 스케줄 ${parsedSchedules.length}건 해독 완료!`);
      } catch (err) { alert("강사별 엑셀 해독 실패: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const handleStudentExcel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        const headers = rows[0]; const sMap = {};
        
        headers.forEach((h, i) => {
          if(!h) return;
          const cleanClassName = String(h).replace(/\(\d+\s*명\)/, '').trim();
          sMap[cleanClassName] = [];
          
          for (let r = 1; r < rows.length; r++) {
            if (rows[r][i]) {
                let sName = String(rows[r][i]).replace(/\[.*?\]/, '').trim(); 
                if (!sName || sName.includes(':') || sName.includes('~') || sName.length > 8 || /\d{2}/.test(sName)) continue;
                sMap[cleanClassName].push(sName);
            }
          }
        });
        setUploadData(prev => ({ ...prev, studentsMap: sMap }));
        alert(`총 ${Object.keys(sMap).length}개 반의 원생 목록 정제 및 해독 완료!`);
      } catch (err) { alert("반별원생 엑셀 해독 실패: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveExcelData = async () => {
    if (uploadData.schedules.length === 0) return alert("강사별 현황 엑셀을 먼저 업로드해주세요.");
    try {
      await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schedule_base'), {
        schedules: uploadData.schedules, studentsMap: uploadData.studentsMap, updatedAt: new Date().toISOString()
      });
      setBaseSchedules(uploadData.schedules); setStudentsMap(uploadData.studentsMap); setIsUploadModalOpen(false);
      alert("✅ 학원 전체 뼈대 시간표가 동기화되었습니다.");
    } catch (e) { alert("저장 실패: " + e.message); }
  };

  const handleSubmitRequest = async (e) => {
      e.preventDefault();
      const form = e.target;
      const targetDateStr = form.targetDate.value;
      const dateObj = new Date(targetDateStr);
      const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
      const computedDay = dayNames[dateObj.getDay()];

      try {
          const reqRef = doc(collection(db, `artifacts/${APP_ID}/public/data/schedule_requests`));
          await setDoc(reqRef, {
              originalScheduleId: changeRequestModal.id,
              requestTeacher: myName || changeRequestModal.teacher,
              type: form.type.value, 
              originalDate: form.originalDate.value || null,
              targetDate: targetDateStr,
              newDay: computedDay,
              newStartTime: form.newStartTime.value, 
              newEndTime: form.newEndTime.value,
              newRoom: normalizeRoomName(form.newRoom.value),
              grade: changeRequestModal.grade, 
              className: changeRequestModal.className,
              status: 'PENDING', 
              createdAt: new Date().toISOString()
          });
          alert("✅ 특정 날짜에 대한 스케줄 요청이 전송되었습니다.");
          setChangeRequestModal(null); setSelectedBlock(null);
      } catch (err) { alert("요청 실패: " + err.message); }
  };

  const handleApproveRequest = async (reqId, status) => {
      try {
          await setDoc(doc(db, `artifacts/${APP_ID}/public/data/schedule_requests`, reqId), { status, updatedAt: new Date().toISOString() }, { merge: true });
          alert(`요청이 ${status === 'APPROVED' ? '승인' : '반려'} 처리되었습니다.`);
      } catch (e) { alert("처리 실패: " + e.message); }
  };

  if (isLoading) return <div className="p-20 text-center"><Loader className="animate-spin inline-block text-blue-600 mb-4" size={40}/><p className="font-bold text-gray-600">데이터 동기화 중...</p></div>;

  return (
    <div className="max-w-[1600px] w-full mx-auto space-y-4 pb-20 animate-in fade-in">
      <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg flex flex-col lg:flex-row justify-between lg:items-center gap-4 print:hidden">
        <div>
          {/* 🚀 메뉴명 수정 완료 */}
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><CalendarIcon className="text-yellow-400"/> 인터랙티브 스케줄 관리</h1>
          <p className="text-sm text-gray-400">정규수업 및 클리닉 일정 캘린더 연동 시스템</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
              <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5">
                <UploadCloud size={16}/> 엑셀 뼈대 업로드
              </button>
          )}
          <button onClick={() => window.print()} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5">
            <Printer size={16}/> 인쇄 (PDF)
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 w-full">
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[750px] relative">
            <div className="p-4 border-b bg-gray-50 flex flex-col lg:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2 bg-white rounded-xl p-1.5 shadow-sm border border-gray-200 order-2 lg:order-1 w-full lg:w-auto justify-center">
                    <button onClick={() => setCurrentWeekStart(new Date(currentWeekStart.setDate(currentWeekStart.getDate() - 7)))} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft size={20} className="text-gray-600"/></button>
                    <span className="text-sm font-black text-gray-800 px-2 flex items-center gap-1">
                        <CalendarDays size={14} className="text-blue-600"/>
                        {currentWeekStart.getMonth() + 1}/{currentWeekStart.getDate()} ~ {weekEnd.getMonth() + 1}/{weekEnd.getDate()}
                    </span>
                    <button onClick={() => setCurrentWeekStart(new Date(currentWeekStart.setDate(currentWeekStart.getDate() + 7)))} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight size={20} className="text-gray-600"/></button>
                </div>

                {/* 🚀 강사 계정 시 불필요한 컨트롤 숨김 처리 (권한 통제) */}
                {isAdmin && (
                    <div className="flex bg-gray-200 p-1 rounded-xl w-full lg:w-auto justify-center order-1 lg:order-2">
                        <button onClick={() => setViewMode('TEACHER')} className={`px-4 py-1.5 text-sm font-bold rounded-lg ${viewMode === 'TEACHER' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>👨‍🏫 선생님별</button>
                        <button onClick={() => { setViewMode('ROOM'); setSelectedFilter(roomList[0] || 'Classroom 1'); }} className={`px-4 py-1.5 text-sm font-bold rounded-lg ${viewMode === 'ROOM' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>🏫 요일/교실</button>
                    </div>
                )}
                
                {isAdmin ? (
                    <select value={selectedFilter} onChange={e => setSelectedFilter(e.target.value)} className="w-full lg:w-auto border border-gray-300 rounded-xl px-3 py-1.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 order-3">
                        {viewMode === 'TEACHER' ? 
                            teacherList.map(t => <option key={t} value={t}>{t} 선생님</option>) :
                            DAYS.map(d => <option key={d} value={d}>{d}요일</option>)
                        }
                    </select>
                ) : (
                    <div className="w-full lg:w-auto bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-sm font-bold text-blue-800 order-3 text-center shadow-sm">
                        {myName} 선생님 전용 스케줄
                    </div>
                )}
            </div>

            {viewMode === 'TEACHER' && isAdmin && (
                <div className="xl:hidden flex overflow-x-auto gap-2 p-3 bg-white border-b custom-scrollbar">
                    {DAYS.map(d => (
                        <button key={`mob-${d}`} onClick={() => setMobileSelectedDay(d)} className={`px-4 py-1.5 rounded-full text-sm font-black shrink-0 transition-colors ${mobileSelectedDay === d ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                            {d}
                        </button>
                    ))}
                </div>
            )}
            
            {viewMode === 'ROOM' && isAdmin && (
                <div className="xl:hidden flex overflow-x-auto gap-2 p-3 bg-white border-b custom-scrollbar">
                    {roomList.map((r) => (
                        <button key={`mob-room-${r}`} onClick={() => setMobileSelectedRoom(r)} className={`px-4 py-1.5 rounded-full text-sm font-black shrink-0 transition-colors ${mobileSelectedRoom === r ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                            {r}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex-1 overflow-auto bg-gray-50/30 relative custom-scrollbar">
                <table className="w-full text-sm border-collapse bg-white min-w-full xl:min-w-[1000px]">
                    <thead className="bg-gray-100 sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="border p-2 w-16 md:w-20 text-gray-500 font-bold bg-gray-100">시간</th>
                            {viewMode === 'TEACHER' ? 
                                DAYS.map(d => <th key={d} className={`border p-2 font-bold bg-gray-100 ${mobileSelectedDay !== d && isAdmin ? 'hidden xl:table-cell' : ''}`}>{d}</th>) :
                                roomList.map(r => <th key={r} className={`border p-2 font-bold bg-gray-100 ${mobileSelectedRoom !== r && isAdmin ? 'hidden xl:table-cell' : ''}`}>{r}</th>)
                            }
                        </tr>
                    </thead>
                    <tbody>
                        {TIME_SLOTS.map((time) => {
                            const currentHour = parseInt(time.split(':')[0], 10);
                            return (
                                <tr key={time}>
                                    <td className="border p-2 text-center text-xs font-bold text-gray-400 bg-gray-50">{time}</td>
                                    
                                    {viewMode === 'TEACHER' ? DAYS.map(day => {
                                        const schedulesInCell = activeSchedules.filter(s => s.day === day && parseInt(s.startTime.split(':')[0], 10) === currentHour);
                                        return (
                                            <td key={`${day}-${time}`} className={`border relative h-24 hover:bg-gray-50/50 align-top ${mobileSelectedDay !== day && isAdmin ? 'hidden xl:table-cell' : ''}`}>
                                                {schedulesInCell.map(schedule => {
                                                    // 🚀 [알고리즘 진화]: 선생님별 뷰에서도 완벽하게 교차 병합을 지원
                                                    if (schedule.isClinic) {
                                                        const isCovered = activeSchedules.some(c => 
                                                            !c.isClinic && 
                                                            c.day === schedule.day &&
                                                            c.teacher === schedule.teacher && // 선생님 본인의 클리닉인 경우 겹침 판정
                                                            c.startTime <= schedule.startTime && 
                                                            c.endTime > schedule.startTime
                                                        );
                                                        if (isCovered) return null;
                                                    }

                                                    const matchedClinics = !schedule.isClinic 
                                                        ? activeSchedules.filter(c => 
                                                            c.isClinic && 
                                                            c.day === schedule.day &&
                                                            c.teacher === schedule.teacher &&
                                                            c.startTime >= schedule.startTime && 
                                                            c.startTime < schedule.endTime
                                                          )
                                                        : [];

                                                    const colorTheme = schedule.isClinic 
                                                        ? `bg-cyan-50/80 border-cyan-400 text-cyan-900 border-[2px] border-dotted ${schedule.clinicStatus === 'open' ? 'opacity-80' : ''}`
                                                        : schedule.isModified ? 'bg-amber-50 border-amber-400 text-amber-900 border-[2px] border-dashed' 
                                                        : getClassColor(schedule.className);
                                                    
                                                    return (
                                                        <div key={schedule.id} onClick={() => setSelectedBlock(schedule)} style={getScheduleStyle(schedule.startTime, schedule.endTime)}
                                                            className={`absolute left-1 right-1 p-2 rounded-lg border cursor-pointer hover:shadow-lg transition-all flex flex-col overflow-hidden shadow-sm ${colorTheme}`}
                                                        >
                                                            <span className="text-[10px] font-bold opacity-70 mb-0.5">{schedule.startTime} - {schedule.endTime}</span>
                                                            <span className="text-[11px] sm:text-xs font-black break-words whitespace-normal leading-tight">{schedule.className}</span>
                                                            
                                                            {matchedClinics.length > 0 && (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {matchedClinics.map(c => (
                                                                        <span key={c.id} className="bg-white/60 text-[9px] px-1 rounded border border-cyan-300 font-bold text-cyan-800">
                                                                            + {c.taName}TA 투입 ({c.startTime}~{c.endTime})
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <span className="text-[10px] opacity-80 flex items-center gap-1 mt-auto truncate font-semibold"><MapPin size={10} className="shrink-0"/>{schedule.room}</span>
                                                        </div>
                                                    );
                                                })}
                                            </td>
                                        );
                                    }) : roomList.map(room => {
                                        const schedulesInCell = activeSchedules.filter(s => s.room === room && parseInt(s.startTime.split(':')[0], 10) === currentHour);
                                        
                                        return (
                                            <td key={`${room}-${time}`} className={`border relative h-24 hover:bg-gray-50/50 align-top min-w-[120px] ${mobileSelectedRoom !== room && isAdmin ? 'hidden xl:table-cell' : ''}`}>
                                                {schedulesInCell.map(schedule => {
                                                    // 🚀 [알고리즘 진화]: Span(시간 범위)을 완벽하게 계산하여 다중 클리닉 중복 렌더링 방지
                                                    if (schedule.isClinic) {
                                                        const isCovered = activeSchedules.some(c => 
                                                            !c.isClinic && 
                                                            c.room === schedule.room && 
                                                            c.day === schedule.day &&
                                                            c.startTime <= schedule.startTime && 
                                                            c.endTime > schedule.startTime // 클리닉이 포함되는지 완벽 판별
                                                        );
                                                        if (isCovered) return null; // 정규 수업 뒤로 완벽하게 숨김
                                                    }

                                                    // 해당 정규 수업의 전체 시간(예: 16~18시) 내에 속한 모든 클리닉 탐색
                                                    const matchedClinics = !schedule.isClinic 
                                                        ? activeSchedules.filter(c => 
                                                            c.isClinic && 
                                                            c.room === schedule.room && 
                                                            c.day === schedule.day &&
                                                            c.startTime >= schedule.startTime && 
                                                            c.startTime < schedule.endTime
                                                          )
                                                        : [];

                                                    const colorTheme = schedule.isClinic 
                                                        ? `bg-cyan-50/80 border-cyan-400 text-cyan-900 border-[2px] border-dotted ${schedule.clinicStatus === 'open' ? 'opacity-80' : ''}`
                                                        : schedule.isModified ? 'bg-amber-50 border-amber-400 text-amber-900 border-[2px] border-dashed' 
                                                        : getClassColor(schedule.className);

                                                    return (
                                                        <div key={schedule.id} onClick={() => setSelectedBlock(schedule)} style={getScheduleStyle(schedule.startTime, schedule.endTime)}
                                                            className={`absolute left-1 right-1 p-2 rounded-lg border cursor-pointer hover:shadow-lg transition-all flex flex-col overflow-hidden shadow-sm ${colorTheme}`}
                                                        >
                                                            <span className="text-[10px] font-bold opacity-70 mb-0.5">{schedule.startTime} - {schedule.endTime}</span>
                                                            <span className="text-[11px] sm:text-xs font-black break-words whitespace-normal leading-tight">{schedule.className}</span>
                                                            
                                                            {/* 🚀 분할된 1시간 클리닉들이 모두 수업 안으로 병합되어 뱃지로 예쁘게 출력됨 */}
                                                            {matchedClinics.length > 0 && (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {matchedClinics.map(c => (
                                                                        <span key={c.id} className="bg-white/60 text-[9px] px-1 rounded border border-cyan-300 font-bold text-cyan-800">
                                                                            + {c.taName}TA 투입 ({c.startTime}~{c.endTime})
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            
                                                            <span className="text-[10px] opacity-80 flex items-center gap-1 mt-auto truncate font-semibold">
                                                                <User size={10} className="shrink-0"/>{schedule.teacher}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="w-full xl:w-96 flex flex-col gap-6 print:hidden">
            {isAdmin && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col max-h-[350px]">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Bell className="text-rose-500" size={18}/> 날짜별 스케줄 결재함</h3>
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        {requests.filter(r => r.status === 'PENDING').length === 0 ? (
                            <p className="text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-xl">대기 중인 요청이 없습니다.</p>
                        ) : requests.filter(r => r.status === 'PENDING').map(req => (
                            <div key={req.id} className="bg-rose-50 border border-rose-100 p-3 rounded-xl">
                                <div className="flex justify-between mb-2">
                                    <span className="text-[10px] font-black text-rose-700 bg-white px-2 py-0.5 rounded shadow-sm border border-rose-100">{req.type === 'MAKEUP' ? '보강' : '변경'}</span>
                                    <span className="text-[10px] text-gray-500">{new Date(req.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm font-bold text-gray-800 break-words">{req.className}</p>
                                <p className="text-xs text-gray-500 mb-3">{req.requestTeacher}T</p>
                                <div className="bg-white rounded border border-rose-100 p-2 mb-3 text-xs">
                                    {req.originalDate && <p className="text-gray-400 line-through mb-1">기존: {req.originalDate}</p>}
                                    <p className="font-bold text-rose-600">희망: {req.targetDate} ({req.newDay}) {req.newStartTime} ({req.newRoom})</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleApproveRequest(req.id, 'REJECTED')} className="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded">반려</button>
                                    <button onClick={() => handleApproveRequest(req.id, 'APPROVED')} className="flex-1 py-1.5 bg-rose-500 text-white text-xs font-bold rounded shadow-sm">승인</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedBlock ? (
                <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 p-5 flex flex-col animate-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-full pr-4">
                            <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{selectedBlock.grade}</span>
                            <h3 className="text-lg font-black text-gray-900 mt-2 break-words">{selectedBlock.className}</h3>
                            <p className="text-xs font-semibold text-gray-500 mt-1">{selectedBlock.day}요일 {selectedBlock.startTime} ~ {selectedBlock.endTime} | {selectedBlock.room}</p>
                        </div>
                        <button onClick={() => setSelectedBlock(null)} className="text-gray-400 hover:text-gray-800 shrink-0"><XCircle size={20}/></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl p-3 mb-4 custom-scrollbar border border-gray-100">
                        <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1"><Users size={14}/> {selectedBlock.isClinic ? '클리닉 정보' : '수강생 명단'}</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {(() => {
                                if (selectedBlock.isClinic) {
                                    if (selectedBlock.clinicStatus === 'open') {
                                        return <p className="text-[11px] text-gray-500 font-medium py-1">현재 예약된 학생이 없는 대기(오픈) 슬롯입니다.</p>;
                                    }
                                    return <p className="text-[11px] text-gray-500 font-medium py-1">클리닉 배정 시간입니다. 클리닉 센터에서 상세 명단을 확인하세요.</p>;
                                }
                                const matchedStudents = getStudentsForClass(selectedBlock.className, studentsMap);
                                if(matchedStudents.length === 0) return <p className="text-[11px] text-gray-400 py-2">매칭된 명단이 없습니다.</p>;
                                return matchedStudents.map((s, i) => (
                                    <span key={i} className="text-[11px] font-bold text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded shadow-sm">{s}</span>
                                ));
                            })()}
                        </div>
                    </div>

                    {!selectedBlock.isClinic && (
                        <button onClick={() => setChangeRequestModal(selectedBlock)} className="w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-xl flex justify-center items-center gap-2 shadow-md hover:bg-black transition-transform active:scale-95">
                            <CalendarDays size={16}/> 특정 날짜 일정 변경/보강
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-10 flex flex-col items-center justify-center text-center h-[300px]">
                    <MapPin className="text-gray-300 mb-3" size={32}/>
                    <p className="text-sm font-bold text-gray-500">시간표 블록을 클릭하시면<br/>학생 명단과 옵션이 나타납니다.</p>
                </div>
            )}
        </div>
      </div>

      {changeRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <h3 className="text-xl font-black text-gray-900 mb-5 flex items-center gap-2"><CalendarDays className="text-indigo-600"/> 캘린더 기반 스케줄 변경</h3>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">신청 유형</label>
                    <select name="type" className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="TEMPORARY">특정일 휴강 및 이동 (일시 변경)</option>
                        <option value="MAKEUP">추가 보강 (수업 추가)</option>
                        <option value="PERMANENT">영구 변경 (해당일 이후 계속)</option>
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t pt-4 mt-4 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">취소/변경될 수업일 (선택)</label>
                        <input name="originalDate" type="date" className="w-full border border-gray-300 p-2 rounded-xl text-sm font-bold text-gray-600 outline-none"/>
                        <p className="text-[9px] text-gray-400 mt-1">보강 추가시 비워두세요.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-rose-600 mb-1">새로운 희망 날짜 (필수)</label>
                        <input name="targetDate" type="date" className="w-full border border-rose-300 p-2 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500" required/>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">희망 교실</label>
                        <select name="newRoom" className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-bold outline-none" defaultValue={changeRequestModal.room}>
                            {roomList.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">시작 시간</label>
                        <input name="newStartTime" type="time" className="w-full border border-gray-300 p-2 rounded-xl text-sm font-bold outline-none" defaultValue={changeRequestModal.startTime} required/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">종료 시간</label>
                        <input name="newEndTime" type="time" className="w-full border border-gray-300 p-2 rounded-xl text-sm font-bold outline-none" defaultValue={changeRequestModal.endTime} required/>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-6 pt-4 border-t">
                    <button type="button" onClick={() => setChangeRequestModal(null)} className="py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">취소</button>
                    <button type="submit" className="py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700">날짜 지정 결재 올리기</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="text-xl font-black text-gray-900 mb-6">학원 뼈대 시간표 동기화</h3>
            <div className="space-y-4 mb-6">
                <div className="border border-dashed border-gray-300 bg-gray-50 p-4 rounded-2xl">
                    <label className="block text-sm font-bold text-gray-800 mb-1">1단계. 강사별 현황.xlsx</label>
                    <input type="file" accept=".xlsx" onChange={handleTeacherExcel} ref={fileInputRef1} className="text-xs"/>
                </div>
                <div className="border border-dashed border-gray-300 bg-gray-50 p-4 rounded-2xl">
                    <label className="block text-sm font-bold text-gray-800 mb-1">2단계. 반별원생목록.xlsx</label>
                    <input type="file" accept=".xlsx" onChange={handleStudentExcel} ref={fileInputRef2} className="text-xs"/>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-4 border-t">
                <button onClick={() => setIsUploadModalOpen(false)} className="py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">닫기</button>
                <button onClick={handleSaveExcelData} className="py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700">저장 및 동기화</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleControlTower;