import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Calendar as CalendarIcon, MapPin, UploadCloud, 
  CheckCircle, XCircle, ChevronRight, User, 
  AlertTriangle, Printer, Bell, Loader, Users
} from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", 
  "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

const ScheduleControlTower = ({ currentUser }) => {
  const isAdmin = currentUser?.role === 'admin';
  const myName = currentUser?.name || '';
  
  const [viewMode, setViewMode] = useState('TEACHER');
  const [selectedFilter, setSelectedFilter] = useState(isAdmin ? '' : myName);
  
  // [모바일 최적화] 모바일 뷰에서 볼 요일을 선택하는 상태
  const [mobileSelectedDay, setMobileSelectedDay] = useState("월");
  
  const [baseSchedules, setBaseSchedules] = useState([]);
  const [studentsMap, setStudentsMap] = useState({});
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [changeRequestModal, setChangeRequestModal] = useState(null);

  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

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

    const q = query(collection(db, `artifacts/${APP_ID}/public/data/schedule_requests`));
    const unsub = onSnapshot(q, 
      (snap) => {
        if (isMounted) {
          setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setIsLoading(false);
        }
      },
      (error) => {
        console.error("Firebase Snapshot Error:", error);
        if (isMounted) setIsLoading(false);
      }
    );

    return () => { isMounted = false; unsub(); };
  }, []);

  const teacherList = useMemo(() => 
    Array.from(new Set(baseSchedules.map(s => s.teacher))).filter(Boolean), 
  [baseSchedules]);

  const roomList = useMemo(() => 
    Array.from(new Set(baseSchedules.map(s => s.room))).filter(Boolean).sort(), 
  [baseSchedules]);

  const activeSchedules = useMemo(() => {
    let list = [...baseSchedules];
    requests.filter(r => r.status === 'APPROVED').forEach(req => {
      if (req.type === 'PERMANENT') {
        const idx = list.findIndex(s => s.id === req.originalScheduleId);
        if (idx > -1) {
          list[idx] = { ...list[idx], day: req.newDay, startTime: req.newStartTime, endTime: req.newEndTime, room: req.newRoom };
        }
      } else if (req.type === 'MAKEUP' || req.type === 'TEMPORARY') {
        list.push({
          id: `mod_${req.id}`, teacher: req.requestTeacher, day: req.newDay,
          startTime: req.newStartTime, endTime: req.newEndTime, room: req.newRoom,
          grade: req.grade, className: req.className + (req.type === 'MAKEUP' ? ' (보강)' : ' (일시변경)'),
          isModified: true
        });
      }
    });

    if (viewMode === 'TEACHER') {
        const defaultTeacher = teacherList.length > 0 ? teacherList[0] : '';
        return list.filter(s => s.teacher === (selectedFilter || defaultTeacher));
    } else {
        return list.filter(s => s.day === (selectedFilter || "월"));
    }
  }, [baseSchedules, requests, viewMode, selectedFilter, teacherList]);

  // [수강생 명단 수정] 부분 일치 알고리즘을 도입하여 엑셀 양식이 조금 달라도 지능적으로 매칭합니다.
  const getStudentsForClass = (className, map) => {
    if (!className || !map) return [];
    const cleanTarget = className.replace(/\(.*\)/g, '').trim();
    if (map[cleanTarget]) return map[cleanTarget]; // 1. 완벽 일치 검사
    
    // 2. 부분 일치 검사 (예: "고1 심화"가 "고1 심화(10명)"에 포함되는지)
    for (const [key, students] of Object.entries(map)) {
        const cleanKey = key.replace(/\(.*\)/g, '').trim();
        if (cleanKey.includes(cleanTarget) || cleanTarget.includes(cleanKey)) {
            return students;
        }
    }
    return [];
  };

  // [다이내믹 타일 로직] 시작 분(Minute)과 종료 시간을 이용해 위치와 세로 길이를 계산합니다.
  const getScheduleStyle = (start, end) => {
    try {
        const [sH, sM] = start.split(':').map(s => parseInt(s.trim(), 10) || 0);
        const [eH, eM] = end.split(':').map(e => parseInt(e.trim(), 10) || 0);
        
        const durationMins = (eH * 60 + eM) - (sH * 60 + sM);
        const heightPercentage = (durationMins / 60) * 100;
        const topPercentage = (sM / 60) * 100;

        return {
            top: `calc(${topPercentage}% + 2px)`, // 위쪽 테두리 여백
            height: `calc(${heightPercentage}% - 4px)`, // 타일이 겹치지 않도록 높이 조절
            minHeight: '40px',
            zIndex: 10 // 배경 셀보다 무조건 위에 렌더링
        };
    } catch (e) {
        return { top: '0%', height: '100%' };
    }
  };

  const [uploadData, setUploadData] = useState({ schedules: [], studentsMap: {} });
  // (기존 엑셀 핸들러 로직 유지 - 생략 없이 전체 포함)
  const handleTeacherExcel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        let currentTeacher = '';
        const parsedSchedules = [];

        rows.forEach(row => {
          if (row[0] && String(row[0]).includes('* 강사명 :')) {
            currentTeacher = String(row[0]).replace('* 강사명 :', '').trim();
          } else if (row[0] && String(row[0]).includes('~')) {
            const [start, end] = String(row[0]).split('~').map(s => s.trim());
            for (let i = 1; i <= 7; i++) {
              if (row[i]) {
                const parts = String(row[i]).split('\n').map(s => s.trim()).filter(Boolean);
                if (parts.length >= 3) {
                  parsedSchedules.push({
                    id: `base_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
                    teacher: currentTeacher, day: DAYS[i - 1],
                    startTime: start, endTime: end,
                    grade: parts[0], className: parts[1], room: parts[2],
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
        const headers = rows[0];
        const sMap = {};
        
        headers.forEach((h, i) => {
          if(!h) return;
          const cleanClassName = String(h).replace(/\(\d+\s*명\)/, '').trim();
          sMap[cleanClassName] = [];
          for (let r = 1; r < rows.length; r++) {
            if (rows[r][i]) {
                let sName = String(rows[r][i]).replace(/\[.*?\]/, '').trim(); 
                sMap[cleanClassName].push(sName);
            }
          }
        });
        setUploadData(prev => ({ ...prev, studentsMap: sMap }));
        alert(`총 ${Object.keys(sMap).length}개 반의 원생 목록 해독 완료!`);
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
      setBaseSchedules(uploadData.schedules);
      setStudentsMap(uploadData.studentsMap);
      setIsUploadModalOpen(false);
      alert("✅ 학원 전체 뼈대 시간표가 동기화되었습니다.");
    } catch (e) { alert("저장 실패: " + e.message); }
  };

  const handleSubmitRequest = async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
          const reqRef = doc(collection(db, `artifacts/${APP_ID}/public/data/schedule_requests`));
          await setDoc(reqRef, {
              originalScheduleId: changeRequestModal.id,
              requestTeacher: myName || changeRequestModal.teacher,
              type: form.type.value, newDay: form.newDay.value,
              newStartTime: form.newStartTime.value, newEndTime: form.newEndTime.value,
              newRoom: form.newRoom.value, grade: changeRequestModal.grade, className: changeRequestModal.className,
              status: 'PENDING', createdAt: new Date().toISOString()
          });
          alert("✅ 요청이 전송되었습니다.");
          setChangeRequestModal(null); setSelectedBlock(null);
      } catch (err) { alert("요청 실패: " + err.message); }
  };

  const handleApproveRequest = async (reqId, status) => {
      try {
          await setDoc(doc(db, `artifacts/${APP_ID}/public/data/schedule_requests`, reqId), { status, updatedAt: new Date().toISOString() }, { merge: true });
          alert(`요청이 ${status === 'APPROVED' ? '승인' : '반려'} 처리되었습니다.`);
      } catch (e) { alert("처리 실패: " + e.message); }
  };

  if (isLoading) return (
    <div className="p-20 text-center">
      <Loader className="animate-spin inline-block text-blue-600 mb-4" size={40}/>
      <p className="font-bold text-gray-600">시간표 데이터 동기화 중...</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-20 animate-in fade-in">
      <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg flex flex-col lg:flex-row justify-between lg:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><CalendarIcon className="text-yellow-400"/> 인터랙티브 스케줄 관제탑</h1>
          <p className="text-sm text-gray-400">선생님별 시간표 열람 및 원클릭 보강/일정 변경 결재 시스템</p>
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

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[750px] relative">
            <div className="p-4 border-b bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex bg-gray-200 p-1 rounded-xl w-full sm:w-auto justify-center">
                    <button onClick={() => setViewMode('TEACHER')} className={`px-4 py-1.5 text-sm font-bold rounded-lg ${viewMode === 'TEACHER' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>👨‍🏫 선생님별</button>
                    <button onClick={() => { setViewMode('ROOM'); setSelectedFilter('월'); }} className={`px-4 py-1.5 text-sm font-bold rounded-lg ${viewMode === 'ROOM' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>🏫 요일/교실</button>
                </div>
                <select value={selectedFilter} onChange={e => setSelectedFilter(e.target.value)} className="w-full sm:w-auto border border-gray-300 rounded-xl px-3 py-1.5 text-sm font-bold">
                    {viewMode === 'TEACHER' ? 
                        teacherList.map(t => <option key={t} value={t}>{t} 선생님</option>) :
                        DAYS.map(d => <option key={d} value={d}>{d}요일</option>)
                    }
                </select>
            </div>

            {/* [모바일 최적화] 모바일에서만 보이는 요일 선택 탭 */}
            {viewMode === 'TEACHER' && (
                <div className="md:hidden flex overflow-x-auto gap-2 p-3 bg-white border-b custom-scrollbar">
                    {DAYS.map(d => (
                        <button 
                            key={`mob-${d}`} 
                            onClick={() => setMobileSelectedDay(d)}
                            className={`px-4 py-1.5 rounded-full text-xs font-black shrink-0 transition-colors ${mobileSelectedDay === d ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
                        >
                            {d}요일
                        </button>
                    ))}
                </div>
            )}

            <div className="flex-1 overflow-auto bg-gray-50/30 relative custom-scrollbar">
                <table className="w-full text-sm border-collapse bg-white min-w-full md:min-w-[800px]">
                    <thead className="bg-gray-100 sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="border p-2 w-16 md:w-20 text-gray-500 font-bold bg-gray-100">시간</th>
                            {viewMode === 'TEACHER' ? 
                                // 모바일에서는 선택된 요일만 표시 (md:table-cell로 데스크탑은 전체 표시)
                                DAYS.map(d => <th key={d} className={`border p-2 font-bold bg-gray-100 ${mobileSelectedDay !== d ? 'hidden md:table-cell' : ''}`}>{d}</th>) :
                                roomList.map(r => <th key={r} className="border p-2 font-bold bg-gray-100">{r}</th>)
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
                                        // 해당 시간(Hour)에 시작하는 수업만 이 칸에서 렌더링을 시작함 (30분 수업 해결)
                                        const schedulesInCell = activeSchedules.filter(s => {
                                            if (s.day !== day) return false;
                                            const schedHour = parseInt(s.startTime.split(':')[0], 10);
                                            return schedHour === currentHour;
                                        });

                                        return (
                                            <td key={`${day}-${time}`} className={`border relative h-24 hover:bg-gray-50/50 align-top ${mobileSelectedDay !== day ? 'hidden md:table-cell' : ''}`}>
                                                {schedulesInCell.map(schedule => (
                                                    <div 
                                                        key={schedule.id}
                                                        onClick={() => setSelectedBlock(schedule)} 
                                                        style={getScheduleStyle(schedule.startTime, schedule.endTime)}
                                                        className={`absolute left-1 right-1 p-2 rounded-lg border cursor-pointer hover:shadow-lg transition-all flex flex-col overflow-hidden shadow-sm
                                                        ${schedule.isModified ? 'bg-amber-100 border-amber-300' : 'bg-blue-50 border-blue-200'}`}
                                                    >
                                                        <span className="text-[10px] font-bold text-gray-500 mb-0.5">{schedule.startTime} - {schedule.endTime}</span>
                                                        <span className="text-xs font-black truncate text-blue-900">{schedule.className}</span>
                                                        <span className="text-[10px] text-gray-600 flex items-center gap-1 mt-auto truncate"><MapPin size={10} className="shrink-0"/>{schedule.room}</span>
                                                    </div>
                                                ))}
                                            </td>
                                        );
                                    }) : roomList.map(room => {
                                        const schedulesInCell = activeSchedules.filter(s => {
                                            if (s.room !== room) return false;
                                            const schedHour = parseInt(s.startTime.split(':')[0], 10);
                                            return schedHour === currentHour;
                                        });

                                        return (
                                            <td key={`${room}-${time}`} className="border relative h-24 hover:bg-gray-50/50 align-top min-w-[120px]">
                                                {schedulesInCell.map(schedule => (
                                                    <div 
                                                        key={schedule.id}
                                                        onClick={() => setSelectedBlock(schedule)} 
                                                        style={getScheduleStyle(schedule.startTime, schedule.endTime)}
                                                        className="absolute left-1 right-1 p-2 rounded-lg border bg-indigo-50 border-indigo-200 cursor-pointer shadow-sm hover:shadow-lg flex flex-col overflow-hidden"
                                                    >
                                                        <span className="text-[10px] font-bold text-gray-500 mb-0.5">{schedule.startTime} - {schedule.endTime}</span>
                                                        <span className="text-xs font-black text-indigo-900 truncate">{schedule.className}</span>
                                                        <span className="text-[10px] text-gray-600 flex items-center gap-1 mt-auto truncate"><User size={10} className="shrink-0"/>{schedule.teacher}T</span>
                                                    </div>
                                                ))}
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

        {/* 우측 패널 (결재함 & 학생 명단 정보) */}
        <div className="w-full xl:w-96 flex flex-col gap-6 print:hidden">
            {isAdmin && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col max-h-[350px]">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Bell className="text-rose-500" size={18}/> 스케줄 결재함</h3>
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                        {requests.filter(r => r.status === 'PENDING').length === 0 ? (
                            <p className="text-center py-10 text-gray-400 text-sm bg-gray-50 rounded-xl">대기 중인 요청이 없습니다.</p>
                        ) : requests.filter(r => r.status === 'PENDING').map(req => (
                            <div key={req.id} className="bg-rose-50 border border-rose-100 p-3 rounded-xl">
                                <div className="flex justify-between mb-2">
                                    <span className="text-[10px] font-black text-rose-700 bg-white px-2 py-0.5 rounded shadow-sm">{req.type === 'MAKEUP' ? '보강' : '변경'}</span>
                                    <span className="text-[10px] text-gray-500">{new Date(req.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm font-bold text-gray-800">{req.className}</p>
                                <p className="text-xs text-gray-500 mb-3">{req.requestTeacher}T</p>
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
                        <div>
                            <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded">{selectedBlock.grade}</span>
                            <h3 className="text-lg font-black text-gray-900 mt-2">{selectedBlock.className}</h3>
                            <p className="text-xs font-semibold text-gray-500 mt-1">{selectedBlock.day}요일 {selectedBlock.startTime} ~ {selectedBlock.endTime} | {selectedBlock.room}</p>
                        </div>
                        <button onClick={() => setSelectedBlock(null)} className="text-gray-400 hover:text-gray-800"><XCircle size={20}/></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl p-3 mb-4 custom-scrollbar">
                        <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1"><Users size={14}/> 수강생 명단 (자동 매칭)</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {/* 고도화된 부분 일치 알고리즘 적용 */}
                            {(() => {
                                const matchedStudents = getStudentsForClass(selectedBlock.className, studentsMap);
                                if(matchedStudents.length === 0) return <p className="text-[11px] text-gray-400 py-2">매칭된 명단이 없습니다. (엑셀 확인 필요)</p>;
                                return matchedStudents.map((s, i) => (
                                    <span key={i} className="text-[11px] font-bold text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded shadow-sm">{s}</span>
                                ));
                            })()}
                        </div>
                    </div>

                    <button onClick={() => setChangeRequestModal(selectedBlock)} className="w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-xl flex justify-center items-center gap-2 shadow-md hover:bg-black transition-transform active:scale-95">
                        <AlertTriangle size={16}/> 보강 / 일정 변경 신청
                    </button>
                </div>
            ) : (
                <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-10 flex flex-col items-center justify-center text-center h-[300px]">
                    <MapPin className="text-gray-300 mb-3" size={32}/>
                    <p className="text-sm font-bold text-gray-500">시간표 블록을 클릭하시면<br/>학생 명단과 옵션이 나타납니다.</p>
                </div>
            )}
        </div>
      </div>

      {/* 모달: 일정 변경 신청 */}
      {changeRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-black text-gray-900 mb-5">스케줄 변경 / 보강 신청</h3>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">신청 유형</label>
                    <select name="type" className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-bold">
                        <option value="TEMPORARY">일시 변경</option>
                        <option value="MAKEUP">추가 보강</option>
                        <option value="PERMANENT">영구 변경</option>
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">희망 요일</label>
                        <select name="newDay" className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-bold" defaultValue={changeRequestModal.day}>
                            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">희망 교실</label>
                        <select name="newRoom" className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-bold" defaultValue={changeRequestModal.room}>
                            {roomList.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t pt-4 mt-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">시작 시간</label>
                        <input name="newStartTime" type="time" className="w-full border border-gray-300 p-2 rounded-xl text-sm font-bold" defaultValue={changeRequestModal.startTime} required/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">종료 시간</label>
                        <input name="newEndTime" type="time" className="w-full border border-gray-300 p-2 rounded-xl text-sm font-bold" defaultValue={changeRequestModal.endTime} required/>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-6 pt-4 border-t">
                    <button type="button" onClick={() => setChangeRequestModal(null)} className="py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">취소</button>
                    <button type="submit" className="py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md">결재 올리기</button>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달: 엑셀 업로드 */}
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
                <button onClick={() => setIsUploadModalOpen(false)} className="py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">닫기</button>
                <button onClick={handleSaveExcelData} className="py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md">저장 및 동기화</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleControlTower;