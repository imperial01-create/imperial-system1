/* [서비스 가치] 클리닉 V3.1.2 - 1:N 다대일 그룹 클리닉 배정 및 연속 시간 자동 병합(Smart Merge) 엔진
   (🚀 CTO 패치: 데이터베이스 직관적 네이밍 룰 적용 [날짜_시간_조교명_난수] - 관리자 편의성 및 데이터 증발 완벽 차단) */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar as CalendarIcon, Clock, CheckCircle, MessageSquare, Plus, Trash2, 
  Edit2, XCircle, PlusCircle, ClipboardList, BarChart2, CheckSquare, 
  Send, RefreshCw, ChevronLeft, ChevronRight, Check, Search, Eye, ArrowRight, Loader, RefreshCcw,
  AlertTriangle, BookOpen, Star, Sparkles, X
} from 'lucide-react';
// 🚀 [수정] setDoc 라이브러리 추가
import { collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, onSnapshot, getDocs, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { Button, Card, Badge, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 🚀 [CTO 패치] 데이터베이스 문서 ID 직관적 네이밍 엔진 (날짜_시간_조교명_난수)
const generateSessionId = (dateStr, timeStr, taName) => {
    const d = (dateStr || '').replace(/-/g, ''); 
    const t = (timeStr || '').replace(/:/g, '');  
    const name = (taName || '미상').replace(/\s+/g, '');
    const randomStr = Math.random().toString(36).substring(2, 6);
    return `${d}_${t}_${name}_${randomStr}`;
};

const formatAmPm = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return '';
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const isPm = h >= 12;
    const ampm = isPm ? '오후' : '오전';
    const hr12 = h % 12 === 0 ? 12 : h % 12;
    return `${ampm} ${hr12}:${String(m).padStart(2,'0')}`;
};

const formatDateKo = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const w = DAYS[d.getDay()];
    return `${m}월 ${day}일 (${w})`;
};

const TEMPLATES = {
  confirmParent: (d) => `[클리닉 안내]\n일시 : ${formatDateKo(d.date)} ${formatAmPm(d.startTime)} - ${formatAmPm(d.endTime)}\n장소 : 목동임페리얼학원 본관 ${d.classroom || '미정'}`,
  
  feedbackParent: (d) => `[목동임페리얼학원]\n${d.studentName} 학생의 클리닉 리포트입니다.\n\n🗓️ 클리닉 일시 : ${formatDateKo(d.date)} ${formatAmPm(d.startTime)} - ${formatAmPm(d.endTime)}\n👨‍🏫 담당 선생님 : ${d.taName}\n\n⭐ 이해도/태도 : ${'★'.repeat(Number(d.rating || 5))}${'☆'.repeat(Math.max(0, 5 - Number(d.rating || 5)))}\n🏷️ 핵심 태그 : ${d.tags || '없음'}\n\n📝 진행 내용 및 피드백 :\n${d.clinicDetails || d.clinicContent || ''}\n\n🎯 다음 과제 (Next Action) :\n${d.nextAction || '수업 시간에 안내됨'}\n\n감사합니다.`
};

const getLocalToday = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const getFutureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const generateTimeSlots = () => Array.from({ length: 14 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
const getDaysInMonth = (d) => {
  const y = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const days = [];
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let i = 1; i <= last.getDate(); i++) days.push(new Date(y, m, i));
  return days;
};
const getWeekOfMonth = (date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfWeek = firstDay.getDay();
    return Math.ceil((date.getDate() + dayOfWeek) / 7);
};

const groupSessions = (sessionList) => {
    if (!sessionList || !Array.isArray(sessionList)) return [];
    
    const toGroup = sessionList.filter(s => ['pending', 'confirmed', 'completed'].includes(s.status));
    const others = sessionList.filter(s => !['pending', 'confirmed', 'completed'].includes(s.status));

    const sorted = [...toGroup].sort((a, b) => {
        const aDate = a.date || ''; const bDate = b.date || '';
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        
        const aTa = a.taId || ''; const bTa = b.taId || '';
        if (aTa !== bTa) return aTa.localeCompare(bTa);
        
        const aStList = Array.isArray(a.students) ? a.students : [];
        const bStList = Array.isArray(b.students) ? b.students : [];
        const aSt = aStList.map(st=>st.id).sort().join() || a.studentId || '';
        const bSt = bStList.map(st=>st.id).sort().join() || b.studentId || '';
        
        if (aSt !== bSt) return aSt.localeCompare(bSt);
        
        const aStat = a.status || ''; const bStat = b.status || '';
        if (aStat !== bStat) return aStat.localeCompare(bStat);
        
        const aStart = a.startTime || ''; const bStart = b.startTime || '';
        return aStart.localeCompare(bStart);
    });

    const grouped = [];
    let current = null;

    sorted.forEach(s => {
        const startStr = s.startTime || '00:00';
        const sEnd = s.endTime || `${String(parseInt(startStr.split(':')[0]) + 1).padStart(2,'0')}:00`;
        
        if (!current) {
            current = { ...s, originalIds: [s.id], endTime: sEnd };
        } else {
            const currentStList = Array.isArray(current.students) ? current.students : [];
            const sStList = Array.isArray(s.students) ? s.students : [];
            const currentSt = currentStList.map(st=>st.id).sort().join() || current.studentId || '';
            const sSt = sStList.map(st=>st.id).sort().join() || s.studentId || '';
            
            if (current.date === s.date && current.taId === s.taId && currentSt === sSt && current.endTime === s.startTime && current.status === s.status && current.classroom === s.classroom) {
                current.endTime = sEnd;
                current.originalIds.push(s.id);
                if (current.topic !== s.topic && s.topic) {
                    const topics = (current.topic || '').split(' / ');
                    if (!topics.includes(s.topic)) current.topic = (current.topic ? current.topic + ' / ' : '') + s.topic;
                }
                if (current.questionRange !== s.questionRange && s.questionRange) {
                     const ranges = (current.questionRange || '').split('\n');
                     if (!ranges.includes(s.questionRange)) current.questionRange = (current.questionRange ? current.questionRange + '\n' : '') + s.questionRange;
                }
            } else {
                grouped.push(current);
                current = { ...s, originalIds: [s.id], endTime: sEnd };
            }
        }
    });
    if (current) grouped.push(current);

    others.forEach(o => { 
        o.originalIds = [o.id]; 
        const startStr = o.startTime || '00:00';
        o.endTime = o.endTime || `${String(parseInt(startStr.split(':')[0]) + 1).padStart(2,'0')}:00`; 
    });

    return [...grouped, ...others].sort((a,b) => (a.startTime || '').localeCompare(b.startTime || ''));
};

const AdminStudentMultiSelect = ({ users, selectedStudents, onAdd, onRemove }) => {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const students = Array.isArray(users) ? users.filter(u => u.role === 'student') : [];
    const filtered = search ? students.filter(s => s.name.includes(search)) : students.slice(0, 5);
    const safeSelected = Array.isArray(selectedStudents) ? selectedStudents : [];

    return (
        <div className="relative w-full">
            <div className="flex flex-wrap gap-1.5 mb-2 p-2 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 min-h-[46px]">
                {safeSelected.length === 0 && <span className="text-xs text-gray-400 font-bold p-1">현재 배정된 학생이 없습니다. 아래에서 검색해 추가하세요.</span>}
                {safeSelected.map(st => (
                    <div key={st.id} className="flex items-center gap-1 bg-indigo-600 text-white font-bold text-xs px-2.5 py-1 rounded-lg shadow-sm">
                        {st.name}
                        <button type="button" onClick={() => onRemove(st.id)} className="hover:text-red-200"><X size={12}/></button>
                    </div>
                ))}
            </div>
            
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="🔍 배정할 학생 이름을 입력하세요..." 
                    className="w-full border-2 p-2.5 rounded-xl outline-none font-bold text-sm focus:border-indigo-500 bg-white"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                />
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-indigo-100 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar p-1">
                            {filtered.map(s => {
                                const isAlreadyAdded = safeSelected.some(st => st.id === s.id);
                                return (
                                    <button 
                                        key={s.id} 
                                        type="button"
                                        disabled={isAlreadyAdded}
                                        onClick={() => { onAdd({ id: s.id, name: s.name, phone: s.phone || '' }); setSearch(''); setIsOpen(false); }}
                                        className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors flex justify-between items-center ${isAlreadyAdded ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-indigo-50 text-gray-700'}`}
                                    >
                                        <span>{s.name} <span className="text-gray-400 font-normal">({s.schoolName || '학교미상'})</span></span>
                                        {isAlreadyAdded && <span className="text-indigo-600 text-[10px]">이미 배정됨</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const CalendarView = React.memo(({ isInteractive, sessions, currentUser, currentDate, setCurrentDate, selectedDateStr, onDateChange, onAction, selectedSlots = [], users, taSubjectMap, onRefresh, isAdminView, isMyScheduleView, checkRoomAvailability, masterClassrooms, myClassIds }) => {
  
  const mySessions = useMemo(() => {
     const safeSessions = Array.isArray(sessions) ? sessions : [];
     if (isMyScheduleView) {
        return safeSessions.filter(s => (s.taId === currentUser.id || s.taName === currentUser.name) && s.date === selectedDateStr);
     }
     return safeSessions.filter(s => s.date === selectedDateStr);
  }, [sessions, currentUser, selectedDateStr, isMyScheduleView]);

  const coveredHours = useMemo(() => {
      const set = new Set();
      mySessions.forEach(s => {
          if (Array.isArray(s.originalIds) && s.originalIds.length > 1) {
              const startH = parseInt((s.startTime || '00:00').split(':')[0]);
              const endH = parseInt((s.endTime || '00:00').split(':')[0]);
              for(let h = startH + 1; h < endH; h++) {
                  set.add(`${String(h).padStart(2,'0')}:00`);
              }
          }
      });
      return set;
  }, [mySessions]);

  const now = new Date();
  const isStudent = currentUser.role === 'student';
  const isParent = currentUser.role === 'parent';
  const isLecturer = currentUser.role === 'lecturer';

  const handlePrevMonth = () => {
      const newDate = new Date(currentDate);
      newDate.setDate(1); 
      newDate.setMonth(newDate.getMonth() - 1);
      setCurrentDate(newDate);
  };

  const handleNextMonth = () => {
      const newDate = new Date(currentDate);
      newDate.setDate(1); 
      newDate.setMonth(newDate.getMonth() + 1);
      setCurrentDate(newDate);
  };

  const isTimeSlotBlockedForStudent = (time) => {
    if (!isStudent) return false;
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const alreadyBooked = safeSessions.some(s => {
        const stList = Array.isArray(s.students) ? s.students : [];
        return (s.studentId === currentUser.id || stList.some(st => st.id === currentUser.id)) && 
               s.date === selectedDateStr && 
               s.startTime === time && 
               (s.status === 'confirmed' || s.status === 'pending');
    });
    if (alreadyBooked) return true;
    
    const selectedSessionTimes = selectedSlots.map(id => safeSessions.find(s => (s.originalIds && s.originalIds.includes(id)) || s.id === id)?.startTime).filter(Boolean);
    if (selectedSessionTimes.includes(time)) return true;
    return false;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
      <Card className="lg:col-span-1 min-h-[420px] p-4 md:p-6 w-full">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold flex items-center gap-2 text-lg text-gray-800"><CalendarIcon size={20} className="text-blue-600"/> 일정 선택</h3>
          <div className="flex gap-1 items-center">
             <button onClick={onRefresh} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 mr-2" title="일정 새로고침"><RefreshCcw size={16}/></button>
             <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-white rounded-md transition-all shadow-sm"><ChevronLeft size={20}/></button>
                <span className="font-bold text-lg w-20 text-center flex items-center justify-center">{currentDate.getMonth()+1}월</span>
                <button onClick={handleNextMonth} className="p-2 hover:bg-white rounded-md transition-all shadow-sm"><ChevronRight size={20}/></button>
             </div>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-sm font-bold text-gray-400 mb-2">{DAYS.map(d=><div key={d} className="py-1">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1.5">
          {getDaysInMonth(currentDate).map((d,i)=>{
            if(!d) return <div key={i} className="aspect-square"/>;
            const dStr = formatDate(d);
            const isSel = dStr===selectedDateStr;
            const isToday = dStr === getLocalToday();
            
            const maxDateStr = getFutureDate(7);
            const isAllowedDateForStudent = isStudent ? (dStr >= getLocalToday() && dStr <= maxDateStr) : true;

            let hasEvent = false;
            const safeSessions = Array.isArray(sessions) ? sessions : [];
            if (isStudent) { 
                if (isAllowedDateForStudent) {
                    hasEvent = safeSessions.some(s => {
                        const workerRole = s.workerRole || taSubjectMap.byId?.[s.taId]?.role || taSubjectMap.byName?.[s.taName]?.role || 'ta';
                        if (workerRole === 'admin_assistant') return false;
                        if (s.targetClassId && !myClassIds?.includes(s.targetClassId)) return false;
                        return s.date === dStr && s.status === 'open'; 
                    });
                } 
            }
            else if (isMyScheduleView) { hasEvent = safeSessions.some(s => s.date === dStr && (s.taId === currentUser.id || s.taName === currentUser.name)); }
            else { hasEvent = safeSessions.some(s => s.date === dStr); }

            let dayClass = 'text-gray-700 hover:bg-gray-100';
            if (isStudent && !isAllowedDateForStudent) {
                dayClass = 'opacity-30 cursor-not-allowed bg-gray-50'; 
            } else if (isSel) {
                dayClass = 'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-200';
            } else if (isToday) {
                dayClass = 'bg-indigo-100 text-indigo-800 font-black ring-2 ring-indigo-400 shadow-sm'; 
            } else if (hasEvent) {
                dayClass = 'ring-1 ring-blue-200 hover:bg-blue-50 text-gray-800';
            }

            return (
              <button 
                key={i} 
                onClick={() => { if (!(isStudent && !isAllowedDateForStudent)) onDateChange(dStr); }} 
                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 min-h-[50px] ${dayClass}`}
                disabled={isStudent && !isAllowedDateForStudent}
              >
                <span className={`text-base md:text-lg ${isSel || isToday ? 'font-bold' : ''}`}>{d.getDate()}</span>
                {isToday && !isSel && <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"/>}
                {hasEvent && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSel ? 'bg-white' : 'bg-blue-400'}`}/>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="lg:col-span-2 flex flex-col h-[600px] lg:h-auto p-0 md:p-6 overflow-hidden w-full">
        <div className="p-5 md:p-0 border-b md:border-none bg-white sticky top-0 z-10">
           <h3 className="font-bold text-xl flex items-center gap-2">
            <span className="text-blue-600">{selectedDateStr.split('-')[2]}일</span> 상세 스케줄
           </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-0 custom-scrollbar space-y-3">
          {generateTimeSlots().map((t, i) => {
            if (coveredHours.has(t)) return null;

            let slots = mySessions.filter(s => s.startTime === t);
            
            if (isStudent || isParent) {
                slots = slots.filter(s => {
                    const workerRole = s.workerRole || taSubjectMap.byId?.[s.taId]?.role || taSubjectMap.byName?.[s.taName]?.role || 'ta';
                    if (workerRole === 'admin_assistant') return false;
                    if (isStudent && s.targetClassId && !myClassIds?.includes(s.targetClassId)) return false;
                    return true;
                });
            }

            const slotDateTime = new Date(`${selectedDateStr}T${t}`);
            const isSlotPast = slotDateTime < now;
            
            if (isStudent) {
                const isSelectedDateAllowed = selectedDateStr <= getFutureDate(7);
                const availableSlots = slots.filter(s => s.status === 'open' && new Date(`${s.date}T${s.startTime}`) >= now);
                if (availableSlots.length === 0 || !isSelectedDateAllowed) return null;
            }
            if (isLecturer && slots.length === 0) return null;

            if(slots.length === 0) {
                 return isInteractive ? (
                    <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 group min-h-[80px]">
                        <div className="w-full md:w-14 text-left md:text-right text-base font-bold text-gray-400 font-mono pl-1">{t}</div>
                        <div className="flex-1 border-2 border-dashed border-gray-200 rounded-xl p-3 flex justify-between items-center hover:bg-gray-50 transition-colors w-full">
                            <span className="text-sm text-gray-400">등록된 근무 없음</span>
                            {((isMyScheduleView || isAdminView) && !isSlotPast) && <Button size="sm" variant="ghost" className="text-blue-600 bg-blue-50 hover:bg-blue-100" icon={PlusCircle} onClick={()=>onAction('add_request', {time: t})}>근무 신청</Button>}
                        </div>
                    </div>
                ) : (
                    !isStudent ? <div key={i} className="flex gap-4 items-start min-h-[60px] opacity-40">
                         <div className="w-14 pt-2 text-right text-sm font-bold text-gray-400 font-mono">{t}</div>
                         <div className="flex-1 border border-gray-100 rounded-xl p-3 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">일정 없음</div>
                    </div> : null
                );
            }

            return (
              <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 items-start">
                <div className="w-full md:w-14 text-left md:text-right text-lg md:text-base font-bold text-gray-800 md:text-gray-600 font-mono pl-1 mt-2 md:mt-4">{t}</div>
                <div className="flex-1 space-y-3 w-full">
                  {slots.map(s => {
                    const isConfirmed = s.status === 'confirmed' || s.status === 'completed';
                    const isSelected = Array.isArray(s.originalIds) ? s.originalIds.some(id => selectedSlots.includes(id)) : selectedSlots.includes(s.id);
                    const isBlocked = isStudent && !isSelected && isTimeSlotBlockedForStudent(s.startTime);
                    
                    const workerRole = s.workerRole || taSubjectMap.byId?.[s.taId]?.role || taSubjectMap.byName?.[s.taName]?.role || 'ta';
                    const isAsstSlot = workerRole === 'admin_assistant'; 
                    const taSubject = s.taSubject || taSubjectMap.byId?.[s.taId]?.subject || taSubjectMap.byName?.[s.taName]?.subject || (isAsstSlot ? '행정 업무' : '개별 클리닉');

                    const stList = Array.isArray(s.students) ? s.students : [];
                    const displayStudentName = stList.length > 0 ? stList.map(st => st.name).join(', ') : s.studentName;

                    if (isStudent) {
                        if (s.status !== 'open') return null;
                        if (new Date(`${s.date}T${s.startTime}`) < now) return null;
                        
                        return (
                             <div key={s.id} onClick={()=> !isBlocked && onAction('toggle_slot', s)} className={`border-2 rounded-2xl p-3 md:p-4 flex justify-between items-center transition-all active:scale-[0.98] cursor-pointer w-full ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:shadow-md'}`}>
                                <div className="flex-1 flex flex-col justify-center">
                                    <div className="font-bold text-base md:text-lg leading-tight flex flex-wrap gap-2 items-center text-gray-800">
                                        {s.taName} 선생님
                                        {s.targetClassName && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-black border border-indigo-200">{s.targetClassName} 전용</span>}
                                    </div>
                                    <div className="text-xs md:text-sm mt-1 font-bold text-blue-600">
                                        {taSubject} {s.classroom ? `· ${s.classroom}` : ''}
                                    </div>
                                </div>
                                <div className="ml-3 shrink-0">
                                  <Button size="sm" variant={isSelected ? "selected" : "outline"} onClick={(e)=> { e.stopPropagation(); onAction('toggle_slot', s); }} icon={isSelected ? Check : Plus}>
                                      {isSelected ? '선택됨' : '선택'}
                                  </Button>
                               </div>
                            </div>
                        );
                    }

                    if (isParent) {
                        const isMyChild = (currentUser.linkedChildrenIds && stList.some(st => currentUser.linkedChildrenIds.includes(st.id))) || 
                                          (currentUser.linkedChildrenIds && currentUser.linkedChildrenIds.includes(s.studentId)) || 
                                          (stList.some(st => st.name === currentUser.childName)) || 
                                          (s.studentName === currentUser.childName);
                        const isBooked = s.status === 'confirmed' || s.status === 'pending' || s.status === 'completed';
                        if (isBooked && !isMyChild) {
                            return (
                                <div key={s.id} className="border rounded-2xl p-4 flex flex-col justify-center bg-gray-50 border-gray-200 opacity-70 w-full min-h-[80px]">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-gray-400 text-lg">예약 마감</span>
                                        <div className="bg-gray-200 text-gray-500 text-xs px-2 py-1 rounded">불가</div>
                                    </div>
                                </div>
                            );
                        }
                    }

                    let cardBgClass = '';
                    if (s.status === 'cancellation_requested') cardBgClass = 'bg-red-50 border-red-200';
                    else if (s.status === 'addition_requested') cardBgClass = 'bg-purple-50 border-purple-200';
                    else if (isConfirmed) cardBgClass = isAsstSlot ? 'bg-indigo-50 border-indigo-200' : 'bg-green-50/50 border-green-200';
                    else cardBgClass = isAsstSlot ? 'bg-indigo-50/40 border-indigo-100' : 'bg-white border-gray-200';

                    return (
                      <div key={s.id} className={`border rounded-2xl p-4 flex flex-col justify-center shadow-sm hover:shadow-md transition-all w-full ${cardBgClass}`}>
                        <div className="flex justify-between items-start w-full">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className="font-bold text-lg text-gray-900">{displayStudentName || s.taName}</span>
                                <Badge status={s.status}/>
                                {isAsstSlot && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">행정조교</span>}
                            </div>
                            
                            <div className="text-sm text-gray-600 font-medium mt-1">
                                {s.targetClassName && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded mr-1 font-bold">대상: {s.targetClassName}</span>}
                                {Array.isArray(s.originalIds) && s.originalIds.length > 1 && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded mr-1 font-black shadow-sm">{formatAmPm(s.startTime)} ~ {formatAmPm(s.endTime)}</span>}
                                {isAsstSlot ? (
                                    <span className="text-indigo-600">{s.topic || '행정 근무 예정'}</span>
                                ) : (
                                    <>
                                        {taSubject !== '개별 클리닉' && <span className="text-blue-600 font-bold mr-1">[{taSubject}]</span>}
                                        {s.topic || (isAdminView ? `${s.taName} 근무` : '예약 대기 중')}
                                    </>
                                )}
                            </div>

                            {(isAdminView || isLecturer || isMyScheduleView) && !isAsstSlot && displayStudentName && (
                              <div className="text-sm text-gray-600 mt-2 p-2.5 bg-gray-50/80 rounded-xl border border-gray-100">
                                {s.topic && <div className="flex gap-1 mb-1"><span className="font-bold text-gray-500 w-10 shrink-0">과목</span><span>{s.topic}</span></div>}
                                {s.questionRange && <div className="flex gap-1"><span className="font-bold text-gray-500 w-10 shrink-0">범위</span><span className="whitespace-pre-wrap">{s.questionRange}</span></div>}
                              </div>
                            )}

                            {isAdminView && (
                              <div className="mt-3 flex flex-wrap gap-2 items-center bg-white/50 p-2 rounded-lg border border-gray-100">
                                <span className="text-xs font-bold text-gray-500 mr-2">담당: {s.taName}</span>
                                
                                {!isAsstSlot && (
                                    <select 
                                        className={`text-sm border rounded-md p-1.5 focus:ring-2 focus:ring-blue-200 outline-none w-full ${!s.classroom ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white'}`} 
                                        value={s.classroom || ''} 
                                        onChange={(e) => onAction('update_classroom', { session: s, val: e.target.value })}
                                    >
                                      <option value="">장소 미지정</option>
                                      {masterClassrooms?.map(r => {
                                          const occupiedStatus = checkRoomAvailability && checkRoomAvailability(s.date, s.startTime, s.endTime, r, s.originalIds || []);
                                          return (
                                              <option 
                                                  key={r} 
                                                  value={r} 
                                                  className={occupiedStatus ? 'text-gray-400 bg-gray-100' : ''}
                                                  disabled={occupiedStatus === 'clinic'}
                                              >
                                                  {r} {occupiedStatus === 'class' ? '(정규수업-협업가능)' : occupiedStatus === 'clinic' ? '(타 클리닉 사용중)' : ''}
                                              </option>
                                          );
                                      })}
                                    </select>
                                )}
                                
                                <button onClick={()=>onAction('admin_edit', s)} className="text-gray-500 hover:text-blue-600 p-2" title="정보 수정"><Edit2 size={18}/></button>
                                <button onClick={(e)=>{ e.stopPropagation(); onAction('delete', s); }} className="text-gray-500 hover:text-red-600 p-2" title="삭제"><Trash2 size={18}/></button>
                                
                                {(s.status === 'confirmed' || s.status === 'completed') && !isAsstSlot && (
                                    <button onClick={(e)=>{ e.stopPropagation(); onAction('write_feedback', s); }} className="text-gray-500 hover:text-green-600 p-2" title="피드백 작성/수정"><CheckSquare size={18}/></button>
                                )}
                              </div>
                            )}
                            {!isAdminView && !isAsstSlot && s.classroom && <div className="text-sm font-bold text-blue-600 mt-2 flex items-center gap-1 bg-blue-50 w-fit px-2 py-1 rounded"><CheckCircle size={14}/> {s.classroom}</div>}
                          </div>
                          <div className="flex flex-col gap-2 ml-2 shrink-0">
                            {isInteractive && !isParent && s.status==='open' && !isSlotPast && <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 h-10 w-10 p-0" onClick={()=>onAction('cancel_request', s)}><XCircle size={20}/></Button>}
                            {isInteractive && !isParent && s.status==='cancellation_requested' && <Button size="sm" variant="secondary" onClick={()=>onAction('withdraw_cancel', s)}>철회</Button>}
                            {isInteractive && !isParent && s.status==='addition_requested' && <Button size="sm" variant="secondary" onClick={()=>onAction('withdraw_add', s)}>철회</Button>}
                            
                            {isAdminView && s.status==='pending' && <Button size="sm" variant="success" onClick={()=>onAction('approve_booking', s)} disabled={!s.classroom}>승인</Button>}
                            
                            {isInteractive && !isParent && (s.status==='confirmed'||s.status==='completed') && !isAsstSlot && (
                                <Button size="sm" variant={s.feedbackStatus==='submitted'?'secondary':'primary'} icon={CheckSquare} onClick={()=>onAction('write_feedback', s)} disabled={s.feedbackStatus==='submitted' && s.taId !== currentUser.id && s.taName !== currentUser.name}>
                                    {s.feedbackStatus==='submitted' ? '수정' : '작성'}
                                </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
});

const ClinicDashboard = ({ currentUser, mode = 'clinic' }) => {
    const { users = [], classes = [], masterData = {}, enrollments = [], loadingData } = useData();

    const isAdminView = currentUser.role === 'admin' || (currentUser.role === 'admin_assistant' && mode === 'clinic');
    const isMyScheduleView = currentUser.role === 'ta' || (currentUser.role === 'admin_assistant' && mode === 'work_schedule');

    const [sessionMap, setSessionMap] = useState({});
    const [sessions, setSessions] = useState([]);
    const [appLoading, setAppLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDateStr, setSelectedDateStr] = useState(getLocalToday());
    const [studentSelectedSlots, setStudentSelectedSlots] = useState([]); 
    const [applicationItems, setApplicationItems] = useState([{ subject: '', workbook: '', range: '' }]); 
    const [defaultSchedule, setDefaultSchedule] = useState({ 월: { start: '14:00', end: '22:00', active: false }, 화: { start: '14:00', end: '22:00', active: false }, 수: { start: '14:00', end: '22:00', active: false }, 목: { start: '14:00', end: '22:00', active: false }, 금: { start: '14:00', end: '22:00', active: false }, 토: { start: '10:00', end: '18:00', active: false }, 일: { start: '10:00', end: '18:00', active: false } }); 
    const [batchDateRange, setBatchDateRange] = useState({ start: '', end: '' }); 
    
    const [selectedTaIdForSchedule, setSelectedTaIdForSchedule] = useState(''); 
    const [batchClassroom, setBatchClassroom] = useState('');

    const [selectedSession, setSelectedSession] = useState(null);
    const [confirmConfig, setConfirmConfig] = useState(null);
    
    const [adminEditData, setAdminEditData] = useState({ students: [], topic: '', questionRange: '' });
    
    const [feedbackData, setFeedbackData] = useState({ rating: 5, tags: '', clinicDetails: '', nextAction: '' });
    const [isRefining, setIsRefining] = useState(false); 
    
    const [previewMessage, setPreviewMessage] = useState("");
    const [requestData, setRequestData] = useState({});
    const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

    const [baseSchedules, setBaseSchedules] = useState([]);
    const [masterScheduleRequests, setMasterScheduleRequests] = useState([]);

    const myClassIds = useMemo(() => {
        if (currentUser?.role !== 'student') return [];
        return enrollments.filter(e => e.studentId === currentUser.id && e.status === 'active').map(e => e.classId);
    }, [enrollments, currentUser]);

    useEffect(() => {
        if (!isAdminView) return; 
        const loadSchedules = async () => {
            try {
                const snap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schedule_base'));
                if (snap.exists()) setBaseSchedules(snap.data().schedules || []);
            } catch (e) { console.error("뼈대 데이터 로드 실패", e); }
        };
        loadSchedules();

        const unsubReq = onSnapshot(query(collection(db, `artifacts/${APP_ID}/public/data/schedule_requests`)), (snap) => {
            setMasterScheduleRequests(snap.docs.map(d => ({id: d.id, ...d.data()})));
        });
        return () => unsubReq();
    }, [isAdminView]);

    const activeSchedules = useMemo(() => {
        let list = [...baseSchedules];
        masterScheduleRequests.filter(r => r.status === 'APPROVED').forEach(req => {
            if (req.type === 'PERMANENT') {
                const idx = list.findIndex(s => s.id === req.originalScheduleId);
                if (idx > -1) list[idx] = { ...list[idx], day: req.newDay, startTime: req.newStartTime, endTime: req.newEndTime, room: req.newRoom };
            } else if (req.type === 'MAKEUP' || req.type === 'TEMPORARY') {
                list.push({ day: req.newDay, startTime: req.newStartTime, endTime: req.newEndTime, room: req.newRoom, targetDate: req.targetDate });
            }
        });
        return list;
    }, [baseSchedules, masterScheduleRequests]);

    const checkRoomAvailability = useCallback((dateStr, startTime, endTime, clinicRoom, currentSessionIds = []) => {
        if (!dateStr || isNaN(new Date(dateStr).getTime())) return null;
        const dayOfWeek = DAYS[new Date(dateStr).getDay()];
        const normTargetRoom = (clinicRoom || '').replace(/\s+/g, '').toLowerCase().replace('class', 'classroom');

        const isOccupiedByClass = activeSchedules.some(s => {
            const normS = (s.room || '').replace(/\s+/g, '').toLowerCase().replace('class', 'classroom');
            if (normS !== normTargetRoom) return false;
            if (s.targetDate && s.targetDate !== dateStr) return false;
            if (!s.targetDate && s.day !== dayOfWeek) return false;
            
            const startA = s.startTime || '00:00'; 
            const endA = s.endTime || `${String(parseInt(startA.split(':')[0]) + 1).padStart(2,'0')}:00`;
            const startB = startTime || '00:00'; 
            const endB = endTime || `${String(parseInt(startB.split(':')[0]) + 1).padStart(2,'0')}:00`;
            return (startA < endB && endA > startB); 
        });

        if (isOccupiedByClass) return 'class';

        const groupedSessionsAll = groupSessions(sessions);
        const isOccupiedByClinic = groupedSessionsAll.some(s => {
            if (s.originalIds && s.originalIds.some(id => currentSessionIds.includes(id))) return false;
            if (s.date !== dateStr) return false;
            const normS = (s.classroom || '').replace(/\s+/g, '').toLowerCase().replace('class', 'classroom');
            if (!normS || normS !== normTargetRoom) return false;
            if (['addition_requested', 'cancellation_requested'].includes(s.status)) return false; 
            
            const startA = s.startTime || '00:00'; 
            const endA = s.endTime || `${String(parseInt(startA.split(':')[0]) + 1).padStart(2,'0')}:00`;
            const startB = startTime || '00:00'; 
            const endB = endTime || `${String(parseInt(startB.split(':')[0]) + 1).padStart(2,'0')}:00`;
            return (startA < endB && endA > startB);
        });

        if (isOccupiedByClinic) return 'clinic';
        return null;
    }, [activeSchedules, sessions]);

    const taSubjectMap = useMemo(() => {
        const mapById = {}; const mapByName = {};
        if (users && users.length > 0) {
            users.forEach(u => {
                if (u.role === 'ta' || u.role === 'admin_assistant') {
                    mapById[u.id] = { subject: u.subject, role: u.role };
                    mapByName[u.name] = { subject: u.subject, role: u.role };
                }
            });
        }
        return { byId: mapById, byName: mapByName };
    }, [users]);

    const fetchSessions = useCallback(async (forceRefresh = false) => {
        setAppLoading(true);
        const year = currentDate.getFullYear(); const month = currentDate.getMonth() + 1;
        const cacheKey = `imperial_sessions_${year}-${month}`;

        try {
            if (!forceRefresh) {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        const cacheTTL = currentUser.role === 'admin' ? 60000 : 3600000; 
                        if (Date.now() - parsed.timestamp < cacheTTL) { 
                            setSessionMap(parsed.data); setAppLoading(false); return; 
                        }
                    } catch (e) { localStorage.removeItem(cacheKey); }
                }
            }

            const startOfMonth = `${year}-${String(month).padStart(2,'0')}-01`;
            const endOfMonth = `${year}-${String(month).padStart(2,'0')}-31`;
            let sessionQuery;

            if (currentUser.role === 'student' || currentUser.role === 'parent') {
                const today = getLocalToday(); const endDate = getFutureDate(21);
                sessionQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', today), where('date', '<=', endDate));
            } else {
                sessionQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', startOfMonth), where('date', '<=', endOfMonth));
            }

            const snapshot = await getDocs(sessionQuery);
            const fetchedData = {};
            snapshot.forEach(doc => { fetchedData[doc.id] = { id: doc.id, ...doc.data() }; });

            setSessionMap(fetchedData);
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: fetchedData }));
        } catch (e) { console.error(e); } finally { setAppLoading(false); }
    }, [currentDate, currentUser]);

    useEffect(() => { fetchSessions(false); }, [fetchSessions]);

    const updateLocalAndCacheState = (updater) => {
        setSessionMap(prev => {
            const newState = typeof updater === 'function' ? updater(prev) : updater;
            const year = currentDate.getFullYear(); const month = currentDate.getMonth() + 1;
            const cacheKey = `imperial_sessions_${year}-${month}`;
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: newState }));
            return newState;
        });
    };

    useEffect(() => {
        const sorted = Object.values(sessionMap).sort((a,b) => (String(a.date||'')).localeCompare(String(b.date||'')) || (String(a.startTime||'')).localeCompare(String(b.startTime||'')));
        setSessions(sorted);
    }, [sessionMap]);

    const notify = (msg, type = 'success') => {
        const id = Date.now(); setNotifications(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3000);
    };

    const askConfirm = (message, onConfirm) => setConfirmConfig({ message, onConfirm });
    const handleDateChange = (dStr) => { setSelectedDateStr(dStr); setStudentSelectedSlots([]); };

    const handleAiRefine = async () => {
        if (!feedbackData.clinicDetails) return notify('피드백 내용을 먼저 입력해주세요.', 'error');
        setIsRefining(true);
        try {
            const refineFeedbackFunction = httpsCallable(functions, 'refineFeedback');
            const response = await refineFeedbackFunction({ rawText: feedbackData.clinicDetails });
            setFeedbackData(prev => ({ ...prev, clinicDetails: response.data.refinedText }));
            notify('✨ AI가 학부모님 전용 문장으로 깔끔하게 정제했습니다.', 'success');
        } catch (error) { notify(`AI 정제 실패: ${error.message}`, 'error'); } finally { setIsRefining(false); }
    };

    const handleAction = async (action, payload) => {
      try {
        if (action === 'toggle_slot') {
            const s = payload; 
            if (studentSelectedSlots.includes(s.id)) { setStudentSelectedSlots(p => p.filter(id => id !== s.id)); } 
            else {
                if (studentSelectedSlots.length > 0) {
                    const first = sessions.find(sess => sess.id === studentSelectedSlots[0]);
                    if (first && first.date !== s.date) return notify('같은 날짜의 클리닉만 동시 신청 가능합니다.', 'error');
                }
                setStudentSelectedSlots(p => [...p, s.id]);
            }
        } else if (action === 'add_request') {
            const h = parseInt((payload.time || '00:00').split(':')[0]);
            if (h < 8 || h >= 22) return notify('운영 시간(08:00~22:00) 외 신청 불가', 'error');
            const newSession = {
                taId: currentUser.id, taName: currentUser.name, taSubject: currentUser.subject || '', workerRole: currentUser.role,
                date: selectedDateStr, startTime: payload.time, endTime: `${String(h+1).padStart(2,'0')}:00`, 
                status: 'addition_requested', source: 'system', classroom: ''
            };
            // 🚀 [CTO 패치] 직관적 ID 부여
            const docId = generateSessionId(selectedDateStr, payload.time, currentUser.name);
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', docId), newSession);
            updateLocalAndCacheState(prev => ({ ...prev, [docId]: { id: docId, ...newSession } }));
            notify('근무 신청 완료');
        } else if (action === 'cancel_request') {
             setSelectedSession(payload); setRequestData({reason:'', type:'cancel'}); setModalState({ type: 'request_change' });
        } else if (action === 'delete') {
            if(payload) askConfirm("정말 이 클리닉 기록 전체를 삭제하시겠습니까?", async () => {
                const ids = payload.originalIds || [payload.id];
                const batch = writeBatch(db);
                ids.forEach(id => batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id)));
                await batch.commit();
                updateLocalAndCacheState(prev => { const next = { ...prev }; ids.forEach(id => delete next[id]); return next; });
                notify('기록 삭제 완료', 'success');
            });
        } else if (action === 'skip_feedback_msg') {
            askConfirm("학부모님께 문자를 발송하지 않고,\n내부 기록용으로만 보관(발송 생략)하시겠습니까?", async () => {
                const ids = payload.originalIds || [payload.id];
                const batch = writeBatch(db);
                ids.forEach(id => batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), { feedbackStatus: 'sent' }));
                await batch.commit();
                updateLocalAndCacheState(prev => {
                    const next = { ...prev };
                    ids.forEach(id => { next[id] = { ...(next[id] || {}), feedbackStatus: 'sent' }; });
                    return next;
                });
                notify('문자 발송이 생략되고 내부 기록으로 보관되었습니다.', 'success');
            });
        } else if (action === 'withdraw_cancel') {
            askConfirm("철회하시겠습니까?", async () => {
                const ids = payload.originalIds || [payload.id];
                const batch = writeBatch(db);
                ids.forEach(id => batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), { status: 'open', cancelReason: '' }));
                await batch.commit();
                updateLocalAndCacheState(prev => {
                    const next = { ...prev };
                    ids.forEach(id => { next[id] = { ...(next[id] || {}), status: 'open', cancelReason: '' }; });
                    return next;
                });
            });
        } else if (action === 'withdraw_add') {
            if(payload) askConfirm("철회하시겠습니까?", async () => {
                const ids = payload.originalIds || [payload.id];
                const batch = writeBatch(db);
                ids.forEach(id => batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id)));
                await batch.commit();
                updateLocalAndCacheState(prev => { const next = { ...prev }; ids.forEach(id => delete next[id]); return next; });
            });
        } else if (action === 'approve_booking') {
            setSelectedSession(payload); 
            setPreviewMessage(TEMPLATES.confirmParent(payload));
            setModalState({ type: 'preview_confirm' });
        } else if (action === 'cancel_booking_admin') { 
            askConfirm("이 신청을 취소하고 슬롯을 초기화하시겠습니까?", async () => {
                const resetData = { status: 'open', studentId: '', studentName: '', studentPhone: '', students: [], topic: '', questionRange: '', source: 'system', classroom: payload.classroom || '' };
                const ids = payload.originalIds || [payload.id];
                const batch = writeBatch(db);
                ids.forEach(id => batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), resetData));
                await batch.commit();
                updateLocalAndCacheState(prev => {
                    const next = { ...prev };
                    ids.forEach(id => { next[id] = { ...(next[id] || {}), ...resetData }; });
                    return next;
                });
                notify('예약 신청이 취소되었습니다.');
            });
        } else if (action === 'update_classroom') {
            const ids = payload.session.originalIds || [payload.session.id];
            const batch = writeBatch(db);
            ids.forEach(id => batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), { classroom: payload.val }));
            await batch.commit();
            updateLocalAndCacheState(prev => {
                const next = { ...prev };
                ids.forEach(id => { next[id] = { ...(next[id] || {}), classroom: payload.val }; });
                return next;
            });
        } else if (action === 'write_feedback') {
            setSelectedSession(payload); 
            setFeedbackData({
                rating: payload.rating || 5, tags: '',
                clinicDetails: payload.clinicDetails || payload.clinicContent || '',
                nextAction: payload.nextAction || payload.improvement || ''
            }); 
            setModalState({ type: 'feedback' });
        } else if (action === 'admin_edit') {
            setSelectedSession(payload); 
            const initialStudents = Array.isArray(payload.students) ? payload.students : (payload.studentName ? [{ id: payload.studentId || '', name: payload.studentName, phone: payload.studentPhone || '' }] : []);
            setAdminEditData({ students: initialStudents, topic: payload.topic||'', questionRange: payload.questionRange||'' }); 
            setModalState({ type: 'admin_edit' });
        } else if (action === 'approve_schedule_change') { 
             const ids = payload.originalIds || [payload.id];
             const batch = writeBatch(db);
             if (payload.status === 'cancellation_requested') { 
                 ids.forEach(id => batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id)));
                 await batch.commit();
                 updateLocalAndCacheState(prev => { const next = { ...prev }; ids.forEach(id => delete next[id]); return next; });
                 notify('취소 요청이 승인되었습니다.', 'success'); 
             } else if (payload.status === 'addition_requested') { 
                 ids.forEach(id => batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), { status: 'open' }));
                 await batch.commit();
                 updateLocalAndCacheState(prev => {
                     const next = { ...prev };
                     ids.forEach(id => { next[id] = { ...(next[id] || {}), status: 'open' }; });
                     return next;
                 });
                 notify('추가 요청이 승인되었습니다.', 'success'); 
             }
        } else if (action === 'reject_schedule_change') {
             askConfirm("이 근무 변경 요청을 반려하시겠습니까?", async () => {
                 const ids = payload.originalIds || [payload.id];
                 const batch = writeBatch(db);
                 if (payload.status === 'cancellation_requested') { 
                     const stList = Array.isArray(payload.students) ? payload.students : [];
                     const revertStatus = (payload.studentName || stList.length > 0) ? 'confirmed' : 'open';
                     ids.forEach(id => batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), { status: revertStatus, cancelReason: '' }));
                     await batch.commit();
                     updateLocalAndCacheState(prev => {
                         const next = { ...prev };
                         ids.forEach(id => { next[id] = { ...(next[id] || {}), status: revertStatus, cancelReason: '' }; });
                         return next;
                     });
                     notify('취소 요청이 반려되어 기존 상태로 복구되었습니다.', 'success'); 
                 } else if (payload.status === 'addition_requested') { 
                     ids.forEach(id => batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id)));
                     await batch.commit();
                     updateLocalAndCacheState(prev => { const next = { ...prev }; ids.forEach(id => delete next[id]); return next; });
                     notify('추가 요청이 반려 및 삭제되었습니다.', 'success'); 
                 }
             });
        } else if (action === 'send_feedback_msg') { 
             setSelectedSession(payload); 
             setPreviewMessage(TEMPLATES.feedbackParent(payload));
             setModalState({ type: 'message_preview_feedback' });
        }
      } catch (e) { notify('오류: ' + e.message, 'error'); }
    };

    const handleSaveDefaultSchedule = async () => {
      if (!selectedTaIdForSchedule || !batchDateRange.start || !batchDateRange.end) return notify('조교와 날짜를 선택하세요', 'error');
      const targetTa = users.find(u => u.id === selectedTaIdForSchedule);
      const batch = writeBatch(db); let count = 0;
      for (let d = new Date(batchDateRange.start); d <= new Date(batchDateRange.end); d.setDate(d.getDate() + 1)) {
        const dStr = formatDate(d); const dayName = DAYS[d.getDay()]; const sched = defaultSchedule[dayName];
        if (sched && sched.active) {
          const sH = parseInt((sched.start||'00:00').split(':')[0]), eH = parseInt((sched.end||'00:00').split(':')[0]);
          for (let h = sH; h < eH; h++) {
            if (h >= 22) break;
            const sT = `${String(h).padStart(2,'0')}:00`, eT = `${String(h+1).padStart(2,'0')}:00`;
            if (!sessions.some(s => (s.taId === targetTa.id || s.taName === targetTa.name) && s.date === dStr && s.startTime === sT)) {
              // 🚀 [CTO 패치] 직관적 ID 부여 적용
              const docId = generateSessionId(dStr, sT, targetTa.name);
              batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', docId), {
                taId: targetTa.id, taName: targetTa.name, taSubject: targetTa.subject || '', workerRole: targetTa.role,
                date: dStr, startTime: sT, endTime: eT, status: 'open', source: 'system', studentName: '', topic: '', questionRange: '', students: [], classroom: batchClassroom || ''
              });
              count++;
            }
          }
        }
      }
      await batch.commit(); notify(`${count}개의 스케줄이 일괄 생성되었습니다!`); fetchSessions(true); 
    };

    const submitStudentApplication = async () => {
      if (isSubmittingBooking) return; setIsSubmittingBooking(true);
      try {
          const validItems = applicationItems.filter(i => i.subject || i.workbook || i.range);
          const formattedTopic = validItems.length > 0 ? validItems.map(i => i.subject).join(', ') : '개별 Q&A';
          const formattedRange = validItems.length > 0 ? validItems.map(i => `${i.workbook} (${i.range})`).join('\n') : '현장 지참';
          const batch = writeBatch(db); const updates = {};
          
          studentSelectedSlots.forEach(id => {
              const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id);
              const studentPayload = [{ id: currentUser?.id, name: currentUser?.name, phone: currentUser?.phone || '' }];
              const updateData = { 
                  status: 'pending', studentId: currentUser?.id || 'unknown_student', studentName: currentUser?.name || '알수없음', studentPhone: currentUser?.phone || '', 
                  students: studentPayload, topic: formattedTopic, questionRange: formattedRange, source: 'app' 
              };
              batch.update(ref, updateData); updates[id] = { id, ...updateData }; 
          });
          await batch.commit();
          updateLocalAndCacheState(prev => {
              const next = { ...prev }; Object.keys(updates).forEach(id => { next[id] = { ...next[id], ...updates[id] }; }); return next;
          });
          
          try {
              const telegramMsg = `[🔔 클리닉 예약 신청]\n\n👨‍🎓 학생명: ${currentUser?.name}\n📚 과목: ${formattedTopic}\n📖 범위: ${formattedRange.replace(/\n/g, ' ')}\n⏰ 슬롯: 총 ${studentSelectedSlots.length}건\n\n승인을 진행해 주세요!`;
              await httpsCallable(functions, 'sendTelegramAlert')({ text: telegramMsg });
          } catch (teleErr) {
                console.error("텔레그램 발송 실패:", teleErr);
            }
          setModalState({type:null}); setStudentSelectedSlots([]); notify('신청이 완료되었습니다!', 'success');
      } catch(e) { notify(`예약 실패: ${e.message}`, 'error'); } finally { setIsSubmittingBooking(false); }
    };

    const handleAdminEditSubmit = async () => {
        const isAsst = selectedSession.workerRole === 'admin_assistant';
        let updateData = {};

        if (isAsst) {
            const newStatus = (selectedSession.status === 'open' && adminEditData.topic) ? 'confirmed' : selectedSession.status;
            updateData = { topic: adminEditData.topic, status: newStatus };
        } else {
            const fallbackName = adminEditData.students.map(st => st.name).join(', ');
            const newStatus = adminEditData.students.length > 0 ? (selectedSession.status === 'open' ? 'confirmed' : selectedSession.status) : 'open';
            
            updateData = {
                students: adminEditData.students,
                studentName: fallbackName,
                topic: adminEditData.topic,
                questionRange: adminEditData.questionRange,
                status: newStatus
            };
        }
        
        try {
            const ids = selectedSession.originalIds || [selectedSession.id];
            const batch = writeBatch(db);
            ids.forEach(id => batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id), updateData));
            await batch.commit();
            
            updateLocalAndCacheState(prev => {
                const next = { ...prev };
                ids.forEach(id => { next[id] = { ...(next[id] || {}), ...updateData }; });
                return next;
            });
            setModalState({type:null}); notify('그룹 배정이 성공적으로 처리되었습니다.', 'success'); 
        } catch (e) { notify('수정 권한이 거부되었습니다.', 'error'); }
    };

    const groupedSessionsAll = useMemo(() => groupSessions(sessions), [sessions]);

    const pendingBookings = groupedSessionsAll.filter(s => s.status === 'pending');
    const scheduleRequests = groupedSessionsAll.filter(s => s.status === 'cancellation_requested' || s.status === 'addition_requested');
    const pendingFeedbacks = groupedSessionsAll.filter(s => s.feedbackStatus === 'submitted');
  
    const studentMyClinics = useMemo(() => {
        return groupedSessionsAll.filter(s => {
            const stList = Array.isArray(s.students) ? s.students : [];
            const hasStudentMatch = stList.some(st => {
                if (currentUser.role === 'parent') {
                    return (currentUser.linkedChildrenIds && currentUser.linkedChildrenIds.includes(st.id)) || (st.name === currentUser.childName);
                }
                return st.id === currentUser.id || st.name === currentUser.name;
            }) || (
                currentUser.role === 'parent' ? (
                    (currentUser.linkedChildrenIds && currentUser.linkedChildrenIds.includes(s.studentId)) || (s.studentName === currentUser.childName)
                ) : (s.studentId === currentUser.id || s.studentName === currentUser.name)
            );
            return hasStudentMatch && (s.status === 'confirmed' || s.status === 'pending' || s.status === 'completed');
        }).sort((a, b) => (String(a.date||'')).localeCompare(String(b.date||'')) || (String(a.startTime||'')).localeCompare(String(b.startTime||''))); 
    }, [groupedSessionsAll, currentUser]);

    if (appLoading || loadingData) return <div className="h-full flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
    <div className="space-y-6 w-full animate-in fade-in">
       <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4 space-y-2 pointer-events-none">
          {notifications.map(n=><div key={n.id} className={`backdrop-blur text-white px-4 py-3 rounded-lg shadow-xl ${n.type==='error'?'bg-red-600/90':'bg-gray-900/90'}`}>{n.msg}</div>)}
       </div>
       
       {isAdminView && (
           <div className="space-y-8 w-full">
              <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-900">클리닉/업무 관리자 대시보드</h2>
                  <div className="flex gap-2"><Button variant="secondary" size="sm" icon={BarChart2} onClick={()=>setModalState({type:'admin_stats'})}>통계</Button></div>
              </div>
              <Card className="border-purple-200 bg-purple-50/30 w-full">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><ClipboardList className="text-purple-600"/> 근무 변경 요청 {scheduleRequests.length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{scheduleRequests.length}</span>}</h2>
                  {scheduleRequests.length === 0 ? <p className="text-gray-500 text-center py-6 bg-white rounded-2xl border border-gray-100">처리할 요청이 없습니다.</p> : (
                    <div className="grid gap-3">{scheduleRequests.map(req => (
                      <div key={req.id} className="bg-white border p-4 rounded-xl flex justify-between items-center shadow-sm">
                        <div>
                            <div className="flex items-center gap-2 mb-1"><Badge status={req.status}/><span className="font-bold">{req.taName}</span><span className="text-sm text-gray-500">{req.date}</span></div>
                            <div className="text-sm text-gray-600">{formatAmPm(req.startTime)} ~ {formatAmPm(req.endTime)}{req.cancelReason && <span className="ml-2 text-red-600 font-medium"> (사유: {req.cancelReason})</span>}</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <Button variant="primary" size="sm" onClick={() => handleAction('approve_schedule_change', req)}>승인</Button>
                            <Button variant="danger" size="sm" onClick={() => handleAction('reject_schedule_change', req)}>반려</Button>
                        </div>
                      </div>
                    ))}</div>
                  )}
              </Card>

              <Card className="bg-blue-50/50 border-blue-100 w-full">
                  <div className="flex justify-between items-center mb-4"><h3 className="font-bold flex items-center gap-2 text-lg text-blue-900"><Clock size={20}/> 스케줄 일괄 오픈 (마스터 권한)</h3></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      <select className="border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-300 font-bold" value={selectedTaIdForSchedule} onChange={e=>setSelectedTaIdForSchedule(e.target.value)}>
                          <option value="">1. 담당 조교 선택 (필수)</option>
                          {users.filter(u=>u.role==='ta' || u.role==='admin_assistant').map(u=><option key={u.id} value={u.id}>[{u.role==='admin_assistant'?'행정':'수업'}] {u.name}</option>)}
                      </select>
                      <select className="border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-300 font-bold text-blue-700" value={batchClassroom} onChange={e=>setBatchClassroom(e.target.value)}>
                          <option value="">2. 배정 강의실 선택 (미정)</option>
                          {masterData?.classrooms?.map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                  </div>
                  <div className="flex gap-2 mb-4">
                      <input type="date" className="border rounded-lg p-2 flex-1 text-sm focus:ring-2 focus:ring-blue-300 font-bold text-gray-700" value={batchDateRange.start} onChange={e=>setBatchDateRange({...batchDateRange, start:e.target.value})}/>
                      <span className="self-center font-bold text-gray-400">~</span>
                      <input type="date" className="border rounded-lg p-2 flex-1 text-sm focus:ring-2 focus:ring-blue-300 font-bold text-gray-700" value={batchDateRange.end} onChange={e=>setBatchDateRange({...batchDateRange, end:e.target.value})}/>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                      {DAYS.map(d=>(
                          <div key={d} className={`border rounded-xl p-3 shadow-sm transition-all flex flex-col justify-between min-h-[100px] ${defaultSchedule[d].active ? 'bg-blue-100 border-blue-400' : 'bg-white'}`}>
                              <div className="flex justify-between items-center mb-2">
                                <span className={`text-sm font-black ${defaultSchedule[d].active ? 'text-blue-800' : 'text-gray-500'}`}>{d}요일</span>
                                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={defaultSchedule[d].active} onChange={()=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], active: !defaultSchedule[d].active}})}/>
                              </div>
                              <div className="flex flex-col gap-1.5 mt-auto">
                                  <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500 w-6">시작</span>
                                      <input type="time" className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 font-bold" value={defaultSchedule[d].start} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], start:e.target.value}})} disabled={!defaultSchedule[d].active}/>
                                  </div>
                                  <div className="flex items-center gap-1">
                                      <span className="text-xs text-gray-500 w-6">종료</span>
                                      <input type="time" className="w-full text-sm border-gray-300 rounded focus:ring-blue-500 font-bold" value={defaultSchedule[d].end} onChange={e=>setDefaultSchedule({...defaultSchedule, [d]: {...defaultSchedule[d], end:e.target.value}})} disabled={!defaultSchedule[d].active}/>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
                  <Button onClick={handleSaveDefaultSchedule} className="w-full py-3.5 font-bold text-lg shadow-md" size="sm">스케줄 일괄 생성하기</Button>
              </Card>

              <CalendarView 
                  isInteractive={false} sessions={groupedSessionsAll} currentUser={currentUser} 
                  currentDate={currentDate} setCurrentDate={setCurrentDate} 
                  selectedDateStr={selectedDateStr} onDateChange={handleDateChange} 
                  onAction={handleAction} users={users} taSubjectMap={taSubjectMap} 
                  onRefresh={() => fetchSessions(true)}
                  isAdminView={true} isMyScheduleView={false} 
                  checkRoomAvailability={checkRoomAvailability}
                  masterClassrooms={masterData?.classrooms} 
              />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                <Card>
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><CheckCircle className="text-green-600"/> 퀵-예약 승인 대기</h2>
                    {pendingBookings.length === 0 ? <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-400">대기 중인 예약 없음</div> :
                        <div className="space-y-3">{pendingBookings.map(s => {
                            const stList = Array.isArray(s.students) ? s.students : [];
                            const displayStudentName = stList.length > 0 ? stList.map(st=>st.name).join(', ') : s.studentName;
                            return (
                            <div key={s.id} className="border border-green-100 bg-green-50/30 p-4 rounded-xl flex justify-between items-center shadow-sm">
                                <div className="flex-1 pr-3">
                                    <div className="font-bold text-gray-900 text-lg">{displayStudentName} <span className="font-normal text-sm text-gray-500">({s.studentPhone || '연락처 연동됨'})</span></div>
                                    <div className="text-sm font-bold text-gray-600 mt-1">{formatDateKo(s.date)} <span className="text-blue-600">{formatAmPm(s.startTime)} - {formatAmPm(s.endTime)}</span> ({s.taName})</div>
                                    
                                    <div className="text-sm text-gray-600 mt-2 p-2 bg-white rounded-lg border border-green-100">
                                        <div className="font-bold text-xs text-green-700 mb-0.5">신청 상세</div>
                                        <div className="whitespace-pre-wrap">{s.topic} / {s.questionRange}</div>
                                    </div>
                                    
                                    <div className="mt-2">
                                        <select 
                                            className={`text-sm border rounded-lg p-2 font-bold focus:ring-2 focus:ring-green-200 outline-none w-full ${!s.classroom ? 'bg-red-50 border-red-300 text-red-700' : 'bg-green-50 border-green-300 text-green-800 shadow-inner'}`} 
                                            value={s.classroom || ''} 
                                            onChange={(e) => handleAction('update_classroom', { session: s, val: e.target.value })}
                                        >
                                            <option value="">강의실 미배정 (선택 필수)</option>
                                            {masterData?.classrooms?.map(r => {
                                                const occupiedStatus = checkRoomAvailability && checkRoomAvailability(s.date, s.startTime, s.endTime, r, s.originalIds || []);
                                                return (
                                                    <option 
                                                        key={r} 
                                                        value={r} 
                                                        className={occupiedStatus ? 'text-gray-400 bg-gray-100' : ''}
                                                        disabled={occupiedStatus === 'clinic'}
                                                    >
                                                        {r} {occupiedStatus === 'class' ? '(정규수업-협업가능)' : occupiedStatus === 'clinic' ? '(타 클리닉 사용중)' : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 shrink-0">
                                    <Button className="font-bold py-3 shadow-md" onClick={()=>handleAction('approve_booking', s)} disabled={!s.classroom}>승인</Button>
                                    <Button variant="danger" className="text-xs" icon={RefreshCw} onClick={()=>handleAction('cancel_booking_admin', s)}>취소</Button>
                                </div>
                            </div>
                        )})}</div>
                    }
                </Card>
                <Card>
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><MessageSquare className="text-blue-600"/> 학부모 발송 대기 (피드백)</h2>
                    {pendingFeedbacks.length === 0 ? <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-400">발송 대기 중인 피드백 없음</div> :
                        <div className="space-y-3">{pendingFeedbacks.map(s => {
                            const stList = Array.isArray(s.students) ? s.students : [];
                            const displayStudentName = stList.length > 0 ? stList.map(st=>st.name).join(', ') : s.studentName;
                            return (
                            <div key={s.id} className="border border-gray-200 p-4 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-all shadow-sm">
                                <div className="overflow-hidden mr-2 flex-1">
                                    <div className="font-bold text-gray-900 flex items-center gap-2">
                                        {displayStudentName} 학생 
                                        <span className="text-yellow-500 text-xs">{'★'.repeat(s.rating||5)}</span>
                                    </div>
                                    <div className="text-sm text-gray-500 truncate mt-1 bg-white border px-2 py-1 rounded">{s.clinicDetails || s.feedback || '내용 없음'}</div>
                                    <div className="text-xs text-gray-400 mt-1">작성자: {s.taName}</div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button variant="secondary" size="sm" icon={Send} onClick={()=>handleAction('send_feedback_msg', s)}>검수/발송</Button>
                                    <Button variant="danger" size="sm" icon={XCircle} onClick={(e)=>{ e.stopPropagation(); handleAction('skip_feedback_msg', s); }}>발송 생략</Button>
                                </div>
                            </div>
                        )})}</div>
                    }
                </Card>
              </div>
           </div>
       )}

       {isMyScheduleView && (
            <>
                <Card className={`bg-gradient-to-r ${currentUser.role === 'admin_assistant' ? 'from-cyan-600 to-blue-600' : 'from-indigo-600 to-purple-600'} text-white border-none w-full`}>
                    <div className="flex justify-between items-end">
                        <div>
                            <h2 className="text-2xl font-bold mb-1">안녕하세요, {currentUser.name} {currentUser.role === 'admin_assistant' ? '행정조교' : '수업조교'}님</h2>
                            <p className="text-white/80">오늘도 학원을 위해 힘써주세요!</p>
                        </div>
                        <div className="text-right"><div className="text-4xl font-black">{sessions.filter(s => (s.taId === currentUser.id || s.taName === currentUser.name) && s.date.startsWith(formatDate(currentDate).substring(0,7))).length}</div><div className="text-sm opacity-80">이달의 배정 스케줄</div></div>
                    </div>
                </Card>
                <CalendarView 
                    isInteractive={true} sessions={groupedSessionsAll} currentUser={currentUser} 
                    currentDate={currentDate} setCurrentDate={setCurrentDate} 
                    selectedDateStr={selectedDateStr} onDateChange={handleDateChange} 
                    onAction={handleAction} users={users} taSubjectMap={taSubjectMap} 
                    onRefresh={() => fetchSessions(true)}
                    isAdminView={false} isMyScheduleView={true}
                    masterClassrooms={masterData?.classrooms}
                />
            </>
        )}

       {currentUser.role === 'lecturer' && (
           <div className="space-y-8 w-full">
              <div className="bg-white border-b pb-4 mb-4">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Eye className="text-blue-600" /> 전체 직원 통합 스케줄 (열람 전용)</h2>
              </div>
              <CalendarView 
                  isInteractive={false} sessions={groupedSessionsAll} currentUser={currentUser} 
                  currentDate={currentDate} setCurrentDate={setCurrentDate} 
                  selectedDateStr={selectedDateStr} onDateChange={handleDateChange} 
                  onAction={()=>{}} users={users} taSubjectMap={taSubjectMap} 
                  onRefresh={() => fetchSessions(true)}
                  isAdminView={false} isMyScheduleView={false}
                  masterClassrooms={masterData?.classrooms}
              />
           </div>
       )}

       {(currentUser.role === 'student' || currentUser.role === 'parent') && (
            <div className="flex flex-col gap-6 w-full">
                <Card className="bg-blue-50 border-blue-100 w-full shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-3">
                        <h2 className="text-lg font-black text-blue-900 flex items-center gap-2">
                            <CheckCircle size={22}/> {currentUser.role === 'parent' ? '내 자녀들의 예약 현황' : '나의 확정 예약 현황'}
                        </h2>
                        {currentUser.role === 'student' && (
                            <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold px-3 py-2 rounded-lg flex items-start gap-1.5 shadow-sm">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <div>예약 취소 및 변경은 데스크에 직접 방문하여 말씀해주세요. <br className="hidden md:block"/><span className="font-normal text-[10px] text-gray-500">(무단 노쇼 시 클리닉 이용 페널티 부여)</span></div>
                            </div>
                        )}
                    </div>
                    
                    {studentMyClinics.length === 0 ? <div className="text-center py-8 text-gray-400 font-bold bg-white rounded-xl border border-dashed border-gray-200">예약 내역이 없습니다.</div> : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                            {studentMyClinics.map(s => {
                                const stList = Array.isArray(s.students) ? s.students : [];
                                const currentDisplayStudentName = stList.length > 0 ? stList.map(st=>st.name).join(', ') : s.studentName;
                                return (
                                <div key={s.id} className="bg-white p-5 rounded-xl border-2 border-blue-100 shadow-sm relative overflow-hidden transition-all hover:border-blue-300">
                                    {(currentUser.role === 'parent' || stList.length > 1) && <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">{currentDisplayStudentName}</div>}
                                    <div className="flex justify-between mb-2 pr-12">
                                        <span className="font-bold text-gray-900 text-lg tracking-tight">{formatDateKo(s.date)}</span>
                                        <Badge status={s.status}/>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700 mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100 w-fit">
                                        <Clock size={16} className="text-blue-600"/>
                                        <span className="font-black text-blue-900">{formatAmPm(s.startTime)} ~ {formatAmPm(s.endTime)}</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-sm font-bold">{s.taName} 선생님</span>
                                    </div>
                                    <div className="bg-indigo-50/50 p-3 rounded-lg text-sm text-gray-600 border border-indigo-50">
                                        <div className="flex gap-2 mb-1.5"><span className="font-black text-indigo-400 w-8 shrink-0">과목</span> <span className="font-bold text-indigo-900">{s.topic}</span></div>
                                        <div className="flex gap-2"><span className="font-black text-indigo-400 w-8 shrink-0">범위</span> <span className="whitespace-pre-wrap font-medium text-gray-700">{s.questionRange}</span></div>
                                    </div>
                                    
                                    {(currentUser.role !== 'student') && (s.status === 'completed' && (s.clinicDetails || s.nextAction || s.clinicContent)) && (
                                        <div className="mt-4 bg-white p-4 rounded-xl text-sm text-gray-700 border-2 border-green-400 shadow-sm">
                                            <div className="font-black text-green-800 mb-3 flex items-center justify-between border-b border-green-200 pb-2">
                                                <span className="flex items-center gap-1.5"><MessageSquare size={18}/> 선생님의 클리닉 피드백</span>
                                                <span className="text-yellow-500 text-lg tracking-widest drop-shadow-sm">{'★'.repeat(Number(s.rating||5))}{'☆'.repeat(Math.max(0, 5 - Number(s.rating||5)))}</span>
                                            </div>
                                            {s.tags && <div className="mb-3"><span className="text-xs font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg">{s.tags}</span></div>}
                                            
                                            {(s.clinicDetails || s.clinicContent) && <div className="whitespace-pre-wrap leading-relaxed mb-3"><span className="font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border mr-1 text-[10px]">진행 내용</span> {s.clinicDetails || s.clinicContent}</div>}
                                            {s.feedback && <div className="whitespace-pre-wrap leading-relaxed mb-3"><span className="font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border mr-1 text-[10px]">문제점</span> {s.feedback}</div>}
                                            
                                            {(s.nextAction || s.improvement) && <div className="whitespace-pre-wrap mt-3 bg-emerald-50/50 p-2 rounded-lg leading-relaxed"><span className="font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 mr-1 text-[10px]">다음 과제</span> <span className="font-bold">{s.nextAction || s.improvement}</span></div>}
                                        </div>
                                    )}
                                </div>
                            )})}
                        </div>
                    )}
                </Card>
                <Card className="w-full">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
                        <h2 className="text-xl font-bold flex items-center gap-2"><PlusCircle className="text-blue-600"/> 새로운 클리닉 예약하기</h2>
                        {currentUser.role === 'student' && <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 w-fit">🗓️ 예약 가능 기간: 당일 ~ 7일 후</span>}
                    </div>
                    <CalendarView 
                        isInteractive={currentUser.role === 'student'} 
                        sessions={groupedSessionsAll} 
                        currentUser={currentUser} 
                        currentDate={currentDate} 
                        setCurrentDate={setCurrentDate} 
                        selectedDateStr={selectedDateStr} 
                        onDateChange={handleDateChange} 
                        onAction={handleAction} 
                        selectedSlots={studentSelectedSlots} 
                        users={users}
                        taSubjectMap={taSubjectMap}
                        onRefresh={() => fetchSessions(true)}
                        isAdminView={false} isMyScheduleView={false}
                        myClassIds={myClassIds}
                    />
                </Card>
                {studentSelectedSlots.length > 0 && currentUser.role === 'student' && (
                    <div className="fixed bottom-6 left-0 right-0 p-4 z-50 flex justify-center animate-in slide-in-from-bottom-4">
                        <Button 
                            className="w-full max-w-md shadow-2xl bg-blue-600 hover:bg-blue-700 text-white border-none py-4 text-xl rounded-2xl flex items-center justify-center gap-3 ring-4 ring-blue-200"
                            onClick={()=>setModalState({type:'student_apply'})}
                        >
                            <span className="bg-white text-blue-600 px-3 py-1 rounded-lg text-base font-black shadow-inner">{studentSelectedSlots.length}건</span>
                            <span className="font-bold">선택한 시간 예약 진행하기</span>
                            <ArrowRight size={24} />
                        </Button>
                    </div>
                )}
            </div>
        )}

      {/* --- Modals --- */}
      <Modal isOpen={modalState.type==='request_change'} onClose={()=>setModalState({type:null})} title="근무 변경/취소 요청">
        <textarea className="w-full border-2 rounded-xl p-4 h-32 mb-4 text-lg outline-none focus:ring-2 focus:ring-blue-300" placeholder="사유를 입력해 주세요 (예: 개인 사정으로 출근 불가)" value={requestData.reason} onChange={e=>setRequestData({...requestData, reason:e.target.value})}/>
        <Button onClick={async()=>{ 
            if(!requestData.reason) return notify('사유입력','error'); 
            const ids = selectedSession.originalIds || [selectedSession.id];
            const batch = writeBatch(db);
            ids.forEach(id => batch.update(doc(db,'artifacts',APP_ID,'public','data','sessions',id),{status:'cancellation_requested', cancelReason:requestData.reason}));
            await batch.commit(); 
            updateLocalAndCacheState(prev => {
                const next = { ...prev };
                ids.forEach(id => { next[id] = { ...(next[id] || {}), status: 'cancellation_requested', cancelReason: requestData.reason }; });
                return next;
            });
            setModalState({type:null}); 
            notify('요청 완료 (관리자에게 전달되었습니다)'); 
        }} className="w-full py-4 text-lg">요청 전송</Button>
      </Modal>
      
      <Modal isOpen={modalState.type==='student_apply'} onClose={()=>setModalState({type:null})} title="클리닉 예약 신청서 작성">
        {applicationItems.map((item,i)=>(
            <div key={i} className="border-2 rounded-xl p-5 mb-3 bg-gray-50 shadow-sm border-blue-100">
                <div className="mb-3">
                    <label className="block text-sm font-bold text-blue-800 mb-1.5 flex items-center gap-1"><BookOpen size={16}/> 질문할 과목명</label>
                    <input placeholder="예시 : 고1 공통수학1" className="w-full border-2 rounded-lg p-3 text-lg font-bold text-gray-800 focus:ring-2 outline-none focus:ring-blue-300" value={item.subject} onChange={e=>{const n=[...applicationItems];n[i].subject=e.target.value;setApplicationItems(n)}}/>
                </div>
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-gray-600 mb-1.5">교재명</label>
                        <input placeholder="예시 : 마플시너지" className="w-full border-2 rounded-lg p-3 text-base focus:ring-2 outline-none focus:ring-blue-300" value={item.workbook} onChange={e=>{const n=[...applicationItems];n[i].workbook=e.target.value;setApplicationItems(n)}}/>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-gray-600 mb-1.5">질문 범위 (페이지/번호)</label>
                        <input placeholder="p.23-25 #61..." className="w-full border-2 rounded-lg p-3 text-base focus:ring-2 outline-none focus:ring-blue-300" value={item.range} onChange={e=>{const n=[...applicationItems];n[i].range=e.target.value;setApplicationItems(n)}}/>
                    </div>
                </div>
            </div>
        ))}
        <Button variant="secondary" className="w-full mb-4 py-3 font-bold border-2 border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-300 bg-white" onClick={()=>setApplicationItems([...applicationItems,{subject:'',workbook:'',range:''}])}><Plus size={20}/> 과목 추가</Button>
        <Button className="w-full py-4 text-xl font-black shadow-lg" onClick={submitStudentApplication} disabled={isSubmittingBooking}>
            {isSubmittingBooking ? <Loader className="animate-spin inline-block text-white" size={24}/> : '최종 예약 접수하기'}
        </Button>
      </Modal>
      
      <Modal isOpen={modalState.type==='feedback'} onClose={()=>setModalState({type:null})} title="입체적 성취 리포트 작성">
        <div className="mb-5 border-b pb-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">이해도 및 학습 태도 평가</label>
            <div className="flex gap-2">
                {[1,2,3,4,5].map(star => (
                    <button key={star} onClick={() => setFeedbackData({...feedbackData, rating: star})} className={`text-3xl transition-transform hover:scale-125 ${feedbackData.rating >= star ? 'text-yellow-400 drop-shadow-sm' : 'text-gray-200'}`}>★</button>
                ))}
            </div>
        </div>
        
        <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">핵심 태그 <span className="font-normal text-xs text-gray-400">(쉼표로 구분)</span></label>
            <input className="w-full border-2 border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-300 font-bold" placeholder="예: #개념보충, #서술형교정, #오답노트" value={feedbackData.tags} onChange={e=>setFeedbackData({...feedbackData, tags:e.target.value})}/>
        </div>

        <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-gray-700">진행 내용 및 특이사항</label>
                {['admin', 'admin_assistant'].includes(currentUser.role) && (
                    <Button size="sm" variant="outline" className="text-purple-600 border-purple-300 bg-purple-50 hover:bg-purple-100 font-bold shadow-sm" onClick={handleAiRefine} disabled={isRefining}>
                        {isRefining ? <Loader className="animate-spin" size={14}/> : <Sparkles size={14}/>} AI 문장 자동 정제
                    </Button>
                )}
            </div>
            <textarea 
                className="w-full border-2 border-gray-200 rounded-xl p-4 h-28 text-base outline-none focus:ring-2 focus:ring-blue-300 transition-colors" 
                placeholder={['admin', 'admin_assistant'].includes(currentUser.role) ? "진행 내용과 학생의 취약점을 편하게 작성하세요. AI가 학부모님용으로 다듬어 드립니다." : "진행 내용과 학생의 취약점을 상세히 작성해 주세요."} 
                value={feedbackData.clinicDetails} 
                onChange={e=>setFeedbackData({...feedbackData, clinicDetails:e.target.value})}
            />
        </div>

        <div className="mb-4">
            <label className="block text-sm font-bold text-emerald-700 mb-2">다음 과제 (Next Action)</label>
            <textarea className="w-full border-2 border-emerald-200 bg-emerald-50 rounded-xl p-4 h-20 text-base outline-none focus:ring-2 focus:ring-emerald-400" placeholder="다음 클리닉 전까지 해와야 할 미션을 명확하게 적어주세요." value={feedbackData.nextAction} onChange={e=>setFeedbackData({...feedbackData, nextAction:e.target.value})}/>
        </div>

        <Button className="w-full py-4 text-lg font-black shadow-lg" onClick={async()=>{ 
            const ids = selectedSession.originalIds || [selectedSession.id];
            const batch = writeBatch(db);
            ids.forEach(id => batch.update(doc(db,'artifacts',APP_ID,'public','data','sessions',id), {...feedbackData,status:'completed',feedbackStatus:'submitted'}));
            await batch.commit();

            updateLocalAndCacheState(prev => {
                const next = { ...prev };
                ids.forEach(id => { next[id] = { ...(next[id] || {}), ...feedbackData, status: 'completed', feedbackStatus: 'submitted' }; });
                return next;
            }); 
            setModalState({type:null}); 
            notify('리포트 작성이 완료되어 데스크로 검수 요청되었습니다.'); 
        }}>저장 및 검수 요청하기</Button>
      </Modal>
      
      <Modal isOpen={modalState.type==='admin_edit'} onClose={()=>setModalState({type:null})} title={selectedSession?.workerRole === 'admin_assistant' ? "행정 업무 지시" : "예약/클리닉 수정"}>
        <div className="space-y-4">
            {selectedSession?.workerRole === 'admin_assistant' ? (
                <div>
                    <label className="block text-sm font-bold text-gray-600 mb-1">오늘의 주요 업무 (예: 교재 복사, 결제 확인 등)</label>
                    <input className="w-full border-2 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-300 outline-none" value={adminEditData.topic} onChange={e=>setAdminEditData({...adminEditData, topic:e.target.value})} placeholder="업무 내용을 입력하세요"/>
                </div>
            ) : (
                <>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">클리닉 배정 학생단 (다중 선택 검색)</label>
                        <AdminStudentMultiSelect 
                            users={users} 
                            selectedStudents={adminEditData.students} 
                            onAdd={(st) => setAdminEditData({ ...adminEditData, students: [...adminEditData.students, st] })}
                            onRemove={(id) => setAdminEditData({ ...adminEditData, students: adminEditData.students.filter(st => st.id !== id) })}
                        />
                    </div>
                    <div><label className="block text-sm font-bold text-gray-600 mb-1">과목</label><input className="w-full border-2 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-300 outline-none" value={adminEditData.topic} onChange={e=>setAdminEditData({...adminEditData, topic:e.target.value})} placeholder="과목"/></div>
                    <div><label className="block text-sm font-bold text-gray-600 mb-1">교재 및 범위</label><input className="w-full border-2 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-300 outline-none" value={adminEditData.questionRange} onChange={e=>setAdminEditData({...adminEditData, questionRange:e.target.value})} placeholder="범위"/></div>
                </>
            )}
            <Button className="w-full py-4 text-lg font-bold" onClick={handleAdminEditSubmit}>그룹 배정 내용 저장</Button>
        </div>
      </Modal>
      
      <Modal isOpen={modalState.type==='admin_stats'} onClose={()=>setModalState({type:null})} title="근무 통계">
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl"><span className="font-bold text-gray-700 text-lg">{currentDate.getFullYear()}년 {currentDate.getMonth()+1}월 근무 현황</span><div className="text-sm text-gray-500">확정(수행) / 전체(오픈)</div></div>
            <div className="overflow-x-auto"><table className="w-full text-base text-left border-collapse"><thead><tr className="bg-gray-100 border-b"><th className="p-3 whitespace-nowrap">조교명</th>{[1,2,3,4,5].map(w=><th key={w} className="p-3 text-center whitespace-nowrap">{w}주</th>)}<th className="p-3 text-center font-bold whitespace-nowrap">합계</th></tr></thead><tbody>{users.filter(u=>u.role==='ta' || u.role==='admin_assistant').map(ta=>{let tConf=0,tSched=0;return(<tr key={ta.id} className="border-b"><td className="p-3 font-medium whitespace-nowrap">{ta.name}</td>{[1,2,3,4,5].map(w=>{const weekSessions=sessions.filter(s=>{const [sy,sm,sd]=String(s.date||'').split('-').map(Number);const sDate=new Date(sy,sm-1,sd);return (s.taId===ta.id || s.taName===ta.name)&&sy===currentDate.getFullYear()&&(sm-1)===currentDate.getMonth()&&getWeekOfMonth(sDate)===w});const conf=weekSessions.filter(s=>s.status==='confirmed'||s.status==='completed').length;const sched=weekSessions.filter(s=>s.status==='open'||s.status==='confirmed'||s.status==='completed').length;tConf+=conf;tSched+=sched;return<td key={w} className="p-3 text-center text-sm">{sched>0?<span className={conf>0?'text-blue-600 font-bold':'text-gray-400'}>{conf}/{sched}</span>:'-'}</td>})}<td className="p-3 text-center font-bold bg-blue-50 text-blue-800">{tConf}/{tSched}</td></tr>)})}</tbody></table></div>
        </div>
      </Modal>
      
      <Modal isOpen={modalState.type==='preview_confirm'} onClose={()=>setModalState({type:null})} title="클리닉 예약 승인 및 학부모 안내문자 발송">
        <div className="bg-indigo-50 p-4 rounded-xl text-sm text-indigo-800 font-bold mb-3 flex items-center gap-2">
            <CheckCircle size={18}/> 승인 시 배정된 모든 학생의 학부모에게 개별 맞춤 문자 분할 발송이 요청됩니다.
        </div>
        <textarea 
            className="w-full bg-white p-5 rounded-xl text-base border-2 border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-400 h-64 custom-scrollbar leading-relaxed" 
            value={previewMessage}
            onChange={(e) => setPreviewMessage(e.target.value)}
        />
        <Button className="w-full mt-4 py-4 text-lg font-black shadow-lg bg-indigo-600 hover:bg-indigo-700" onClick={async ()=>{ 
            try {
                const stList = Array.isArray(selectedSession.students) ? selectedSession.students : [];
                const targetStudents = stList.length > 0 
                    ? stList 
                    : (selectedSession.studentName ? [{ id: selectedSession.studentId || '', name: selectedSession.studentName, phone: selectedSession.studentPhone || '' }] : []);

                let textSentCount = 0;

                for (const st of targetStudents) {
                    let targetPhone = st.phone || '';
                    if (!targetPhone && st.id) {
                        const parentUser = users.find(u => u.role === 'parent' && Array.isArray(u.linkedChildrenIds) && u.linkedChildrenIds.includes(st.id));
                        if (parentUser && parentUser.phone) targetPhone = parentUser.phone;
                        else {
                            const studentUser = users.find(u => u.id === st.id);
                            if (studentUser && studentUser.phone) targetPhone = studentUser.phone; 
                        }
                    }

                    if (targetPhone) {
                        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
                        const customizedMsg = previewMessage.replace(new RegExp(selectedSession.studentName || st.name, 'g'), st.name);
                        
                        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                            phoneNumber: cleanPhone, message: customizedMsg, status: 'pending', type: 'clinic_approval', studentName: st.name, createdAt: serverTimestamp()
                        });
                        textSentCount++;
                    }
                }

                const ids = selectedSession.originalIds || [selectedSession.id];
                const batch = writeBatch(db);
                ids.forEach(id => batch.update(doc(db,'artifacts',APP_ID,'public','data','sessions',id),{status:'confirmed'}));
                await batch.commit();

                updateLocalAndCacheState(prev => {
                    const next = { ...prev };
                    ids.forEach(id => { next[id] = { ...(next[id] || {}), status: 'confirmed' }; });
                    return next;
                }); 
                
                setModalState({type:null}); 
                notify(`그룹 승인 완료! (안내문자 ${textSentCount}명 발송 대기열 적재 완료)`, 'success'); 
            } catch (error) {
                console.error("승인 오류:", error);
                notify(`오류: ${error.message}`, 'error');
            }
        }}>그룹 예약 승인 및 개별 문자 발송하기</Button>
      </Modal>
      
      <Modal isOpen={modalState.type==='message_preview_feedback'} onClose={()=>setModalState({type:null})} title="학부모 발송용 피드백 검수">
        <div className="bg-indigo-50 p-4 rounded-xl text-sm text-indigo-800 font-bold mb-3 flex items-center gap-2">
            <CheckCircle size={18}/> 수정이 필요하면 아래 텍스트 창에서 바로 편집하세요.
        </div>
        <textarea 
            className="w-full bg-white p-5 rounded-xl text-base border-2 border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-400 h-80 custom-scrollbar leading-relaxed" 
            value={previewMessage}
            onChange={(e) => setPreviewMessage(e.target.value)}
        />
        <Button className="w-full mt-4 py-4 text-lg font-black shadow-lg bg-indigo-600 hover:bg-indigo-700" onClick={async ()=>{ 
            try {
                const stList = Array.isArray(selectedSession.students) ? selectedSession.students : [];
                const targetStudents = stList.length > 0 
                    ? stList 
                    : (selectedSession.studentName ? [{ id: selectedSession.studentId || '', name: selectedSession.studentName, phone: selectedSession.studentPhone || '' }] : []);

                let textSentCount = 0;

                for (const st of targetStudents) {
                    let targetPhone = '';
                    if (st.id) {
                        const parentUser = users.find(u => u.role === 'parent' && Array.isArray(u.linkedChildrenIds) && u.linkedChildrenIds.includes(st.id));
                        if (parentUser && parentUser.phone) targetPhone = parentUser.phone;
                        else {
                            const studentUser = users.find(u => u.id === st.id);
                            if (studentUser && studentUser.phone) targetPhone = studentUser.phone; 
                        }
                    }

                    if (targetPhone) {
                        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
                        const customizedMsg = previewMessage.replace(new RegExp(selectedSession.studentName || st.name, 'g'), st.name);
                        
                        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                            phoneNumber: cleanPhone, message: customizedMsg, status: 'pending', type: 'clinic_feedback', studentName: st.name, createdAt: serverTimestamp()
                        });
                        textSentCount++;
                    }
                }

                const ids = selectedSession.originalIds || [selectedSession.id];
                const batch = writeBatch(db);
                ids.forEach(id => batch.update(doc(db,'artifacts',APP_ID,'public','data','sessions',id),{feedbackStatus:'sent'}));
                await batch.commit();

                updateLocalAndCacheState(prev => {
                    const next = { ...prev };
                    ids.forEach(id => { next[id] = { ...(next[id] || {}), feedbackStatus: 'sent' }; });
                    return next;
                }); 
                setModalState({type:null}); 
                notify(`그룹 피드백 ${textSentCount}건 발송 요청 완료!`, 'success'); 
            } catch (error) {
                console.error("문자 발송 큐 적재 실패:", error);
                notify(`발송 요청 실패: ${error.message}`, 'error');
            }
        }}>최종 검수 완료 및 안드로이드 앱으로 발송하기</Button>
      </Modal>
      
      <Modal isOpen={!!confirmConfig} onClose={() => setConfirmConfig(null)} title="시스템 확인">
        <div className="space-y-6">
            <p className="text-lg text-gray-800 text-center font-medium mt-4 whitespace-pre-wrap">{confirmConfig?.message}</p>
            <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setConfirmConfig(null)} className="flex-1 py-3 text-lg">취소</Button>
                <Button variant="danger" onClick={() => { confirmConfig.onConfirm(); setConfirmConfig(null); }} className="flex-1 py-3 text-lg">확인 및 실행</Button>
            </div>
        </div>
      </Modal>
    </div>
  );
};

export default ClinicDashboard;