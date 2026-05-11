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
  
  const [baseSchedules, setBaseSchedules] = useState([]);
  const [studentsMap, setStudentsMap] = useState({});
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [changeRequestModal, setChangeRequestModal] = useState(null);

  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

  // [서비스 가치]: 데이터 로딩 및 예외 처리를 강화하여 관리자의 무한 대기 시간을 제거합니다.
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
      } catch (e) { 
        console.error("뼈대 데이터 로드 실패:", e); 
      }
    };
    loadBaseData();

    // [중요 수정]: 에러 콜백을 추가하여 보안 규칙 미적용 시에도 로딩 스피너를 해제합니다.
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
        if (isMounted) {
          // 관리자에게 직관적인 피드백 제공 (무한 로딩 방지)
          alert("데이터를 불러올 권한이 없거나 설정 오류가 발생했습니다. 보안 규칙을 확인하세요.");
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsub(); // 리스너 해제 (메모리 누수 방지)
    };
  }, []);

  // 엑셀 파싱 및 저장 로직 (기존 로직 유지)
  const [uploadData, setUploadData] = useState({ schedules: [], studentsMap: {} });

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
                    teacher: currentTeacher,
                    day: DAYS[i - 1],
                    startTime: start,
                    endTime: end,
                    grade: parts[0],
                    className: parts[1],
                    room: parts[2],
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
        schedules: uploadData.schedules,
        studentsMap: uploadData.studentsMap,
        updatedAt: new Date().toISOString()
      });
      setBaseSchedules(uploadData.schedules);
      setStudentsMap(uploadData.studentsMap);
      setIsUploadModalOpen(false);
      alert("✅ 학원 전체 뼈대 시간표가 성공적으로 동기화되었습니다.");
    } catch (e) { alert("저장 실패: " + e.message); }
  };

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
        const filterVal = selectedFilter || (teacherList[0] || '');
        return list.filter(s => s.teacher === filterVal);
    } else {
        return list.filter(s => s.day === (selectedFilter || "월"));
    }
  }, [baseSchedules, requests, viewMode, selectedFilter]);

  const handleSubmitRequest = async (e) => {
      e.preventDefault();
      const form = e.target;
      const type = form.type.value;
      const newDay = form.newDay.value;
      const newStartTime = form.newStartTime.value;
      const newEndTime = form.newStartTime.value; // 단순화를 위해 시작시간과 동일하게 설정 (수정가능)
      const newRoom = form.newRoom.value;

      try {
          const reqRef = doc(collection(db, `artifacts/${APP_ID}/public/data/schedule_requests`));
          await setDoc(reqRef, {
              originalScheduleId: changeRequestModal.id,
              requestTeacher: myName || changeRequestModal.teacher,
              type, newDay, newStartTime, newEndTime, newRoom,
              grade: changeRequestModal.grade, className: changeRequestModal.className,
              status: 'PENDING',
              createdAt: new Date().toISOString()
          });
          alert("✅ 요청이 관리자에게 전송되었습니다.");
          setChangeRequestModal(null);
          setSelectedBlock(null);
      } catch (err) { alert("요청 실패: " + err.message); }
  };

  const handleApproveRequest = async (reqId, status) => {
      try {
          await setDoc(doc(db, `artifacts/${APP_ID}/public/data/schedule_requests`, reqId), {
              status, updatedAt: new Date().toISOString()
          }, { merge: true });
          alert(`요청이 ${status === 'APPROVED' ? '승인' : '반려'} 처리되었습니다.`);
      } catch (e) { alert("처리 실패: " + e.message); }
  };

  const teacherList = Array.from(new Set(baseSchedules.map(s => s.teacher))).filter(Boolean);
  const roomList = Array.from(new Set(baseSchedules.map(s => s.room))).filter(Boolean).sort();
  const pendingRequests = requests.filter(r => r.status === 'PENDING');

  if (isLoading) return (
    <div className="p-20 text-center">
      <Loader className="animate-spin inline-block text-blue-600 mb-4" size={40}/>
      <p className="font-bold text-gray-600">시간표 데이터 동기화 중...</p>
      <p className="text-xs text-gray-400 mt-2">지속될 경우 관리자에게 보안 규칙 설정을 문의하세요.</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-20 animate-in fade-in">
      {/* 상단 헤더 */}
      <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-lg flex flex-col lg:flex-row justify-between lg:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><CalendarIcon className="text-yellow-400"/> 인터랙티브 스케줄 관제탑</h1>
          <p className="text-sm text-gray-400">선생님별 시간표 열람 및 원클릭 보강/일정 변경 결재 시스템</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
              <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors">
                <UploadCloud size={16}/> 엑셀 뼈대 업로드
              </button>
          )}
          <button onClick={() => window.print()} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors">
            <Printer size={16}/> 인쇄 (PDF)
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* 메인 캘린더 */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[750px]">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <div className="flex bg-gray-200 p-1 rounded-xl">
                    <button onClick={() => setViewMode('TEACHER')} className={`px-4 py-1.5 text-sm font-bold rounded-lg ${viewMode === 'TEACHER' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>👨‍🏫 선생님별</button>
                    <button onClick={() => setViewMode('ROOM')} className={`px-4 py-1.5 text-sm font-bold rounded-lg ${viewMode === 'ROOM' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>🏫 요일/교실</button>
                </div>
                <select value={selectedFilter} onChange={e => setSelectedFilter(e.target.value)} className="border border-gray-300 rounded-xl px-3 py-1.5 text-sm font-bold">
                    {viewMode === 'TEACHER' ? 
                        teacherList.map(t => <option key={t} value={t}>{t} 선생님</option>) :
                        DAYS.map(d => <option key={d} value={d}>{d}요일</option>)
                    }
                </select>
            </div>

            <div className="flex-1 overflow-auto bg-gray-50/30 relative">
                <table className="w-full text-sm border-collapse bg-white min-w-[800px]">
                    <thead className="bg-gray-100 sticky top-0 z-20">
                        <tr>
                            <th className="border p-2 w-20 text-gray-500 font-bold">시간</th>
                            {viewMode === 'TEACHER' ? 
                                DAYS.map(d => <th key={d} className="border p-2 font-bold">{d}</th>) :
                                roomList.map(r => <th key={r} className="border p-2 font-bold">{r}</th>)
                            }
                        </tr>
                    </thead>
                    <tbody>
                        {TIME_SLOTS.map((time) => (
                            <tr key={time}>
                                <td className="border p-2 text-center text-xs font-bold text-gray-400 bg-gray-50">{time}</td>
                                {viewMode === 'TEACHER' ? DAYS.map(day => {
                                    const schedule = activeSchedules.find(s => s.day === day && s.startTime === time);
                                    return (
                                        <td key={`${day}-${time}`} className="border p-1.5 h-20 relative hover:bg-gray-50">
                                            {schedule && (
                                                <div onClick={() => setSelectedBlock(schedule)} className={`absolute inset-1 p-2 rounded-lg border cursor-pointer hover:shadow-md transition-all z-10 flex flex-col ${schedule.isModified ? 'bg-amber-100 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                                                    <span className="text-[10px] font-bold text-gray-500">{schedule.startTime}</span>
                                                    <span className="text-xs font-black truncate text-blue-900">{schedule.className}</span>
                                                    <span className="text-[10px] text-gray-600 flex items-center gap-1"><MapPin size={10}/>{schedule.room}</span>
                                                </div>
                                            )}
                                        </td>
                                    );
                                }) : roomList.map(room => {
                                    const schedule = activeSchedules.find(s => s.room === room && s.startTime === time);
                                    return (
                                        <td key={`${room}-${time}`} className="border p-1.5 h-20 relative hover:bg-gray-50">
                                            {schedule && (
                                                <div onClick={() => setSelectedBlock(schedule)} className="absolute inset-1 p-2 rounded-lg border bg-indigo-50 border-indigo-200 cursor-pointer flex flex-col">
                                                    <span className="text-[10px] font-bold text-gray-500">{schedule.startTime}</span>
                                                    <span className="text-xs font-black text-indigo-900 truncate">{schedule.className}</span>
                                                    <span className="text-[10px] text-gray-600 flex items-center gap-1"><User size={10}/>{schedule.teacher}T</span>
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* 우측 패널 */}
        <div className="w-full xl:w-96 flex flex-col gap-6 print:hidden">
            {isAdmin && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col max-h-[350px]">
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2"><Bell className="text-rose-500" size={18}/> 스케줄 결재함</h3>
                    <div className="flex-1 overflow-y-auto space-y-3">
                        {pendingRequests.length === 0 ? (
                            <p className="text-center py-10 text-gray-400 text-sm">대기 중인 요청이 없습니다.</p>
                        ) : pendingRequests.map(req => (
                            <div key={req.id} className="bg-rose-50 border border-rose-100 p-3 rounded-xl">
                                <div className="flex justify-between mb-2">
                                    <span className="text-[10px] font-black text-rose-700 bg-white px-2 py-0.5 rounded shadow-sm border border-rose-100">{req.type === 'MAKEUP' ? '보강' : '변경'}</span>
                                    <span className="text-[10px] text-gray-500">{new Date(req.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm font-bold text-gray-800">{req.className}</p>
                                <p className="text-xs text-gray-500 mb-3"><User size={12} className="inline mr-1"/>{req.requestTeacher}T</p>
                                <div className="bg-white p-2 rounded border border-gray-100 text-xs mb-3 font-bold text-rose-600">
                                    <ChevronRight size={12} className="inline"/> {req.newDay} {req.newStartTime} ({req.newRoom})
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
                        <div>
                            <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded">{selectedBlock.grade}</span>
                            <h3 className="text-lg font-black text-gray-900 mt-2">{selectedBlock.className}</h3>
                            <p className="text-xs font-semibold text-gray-500">{selectedBlock.day} {selectedBlock.startTime} | {selectedBlock.room}</p>
                        </div>
                        <button onClick={() => setSelectedBlock(null)} className="text-gray-400 hover:text-gray-800"><XCircle size={20}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl p-3 mb-4">
                        <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1"><Users size={14}/> 수강생 명단</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {(studentsMap[selectedBlock.className.replace(/\(.*\)/, '').trim()] || []).map((s, i) => (
                                <span key={i} className="text-[11px] font-bold text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded shadow-sm">{s}</span>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => setChangeRequestModal(selectedBlock)} className="w-full py-3 bg-gray-900 text-white text-sm font-bold rounded-xl flex justify-center items-center gap-2 shadow-md hover:bg-black">
                        <AlertTriangle size={16}/> 보강 / 일정 변경 신청
                    </button>
                </div>
            ) : (
                <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-10 flex flex-col items-center text-center">
                    <MapPin className="text-gray-300 mb-3" size={32}/>
                    <p className="text-sm font-bold text-gray-500">시간표 블록을 클릭하시면<br/>학생 명단과 변경 옵션이 나타납니다.</p>
                </div>
            )}
        </div>
      </div>

      {/* 모달: 일정 변경 신청 */}
      {changeRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 mb-1"><CalendarIcon className="text-indigo-600"/> 스케줄 변경 / 보강 신청</h3>
            <p className="text-xs font-semibold text-gray-500 mb-5 pb-4 border-b">선택한 수업: [{changeRequestModal.className}]</p>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">신청 유형</label>
                    <select name="type" className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-bold">
                        <option value="TEMPORARY">일시 변경 (하루만)</option>
                        <option value="MAKEUP">추가 보강 (1회 추가)</option>
                        <option value="PERMANENT">영구 변경 (앞으로 계속)</option>
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
                        <label className="block text-xs font-bold text-gray-700 mb-1">시작 시간</label>
                        <select name="newStartTime" className="w-full border border-gray-300 p-2.5 rounded-xl text-sm font-bold" defaultValue={changeRequestModal.startTime}>
                            {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl">
                    <label className="block text-xs font-black text-indigo-800 mb-1">희망 교실 선택</label>
                    <select name="newRoom" className="w-full border border-indigo-200 p-2 rounded-lg text-sm font-bold">
                        {roomList.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
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
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 mb-1"><UploadCloud className="text-blue-600"/> 학원 뼈대 시간표 동기화</h3>
            <div className="space-y-4 my-6">
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
                <button onClick={handleSaveExcelData} className="py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md">동기화 확정 (저장)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleControlTower;