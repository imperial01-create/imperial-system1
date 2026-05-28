/* [서비스 가치] 클리닉 V2.9.5 - 발송 후 빈 화면 Crash 완벽 방어 및 클리닉 승인 시 문자 검수/편집 기능 추가 
   (🚀 CTO 패치: 관리자 스케줄 반려 기능 추가 및 학생 캘린더 당일 하이라이트 & 7일 예약 제한 완벽 적용) */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar as CalendarIcon, Clock, CheckCircle, MessageSquare, Plus, Trash2, 
  Settings, Edit2, XCircle, PlusCircle, ClipboardList, BarChart2, CheckSquare, 
  Send, RefreshCw, ChevronLeft, ChevronRight, Check, Search, Eye, ArrowRight, Loader, RefreshCcw,
  AlertTriangle, BookOpen, Star, Sparkles
} from 'lucide-react';
import { collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, onSnapshot, getDocs, getDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { Button, Card, Badge, Modal } from '../components/UI';

import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const TEMPLATES = {
  confirmParent: (d) => `[목동임페리얼학원]\n안녕하세요. ${d.studentName} 학생의 개인 클리닉 일정이 승인되어 안내해 드립니다.\n\n[클리닉 확정 안내]\n- 일시 : ${d.date} ${d.startTime}~${d.endTime || String(parseInt((d.startTime||'00:00').split(':')[0])+1).padStart(2,'0')+':00'}\n- 장소 : 본관 ${d.classroom || '미정'}\n- 내용 : ${d.topic}\n\n학생이 직접 필요한 시간을 선정하여 신청한 일정입니다. 해당 시간은 담당 선생님과의 1:1 약속이므로 늦거나 결석하지 않도록 각별한 지도 부탁드립니다. 감사합니다.`,
  
  feedbackParent: (d) => `[목동임페리얼학원]\n${d.studentName} 학생의 클리닉 성취 리포트입니다.\n\n🗓️ 클리닉 일시 : ${d.date} ${d.startTime}~${d.endTime || String(parseInt((d.startTime||'00:00').split(':')[0])+1).padStart(2,'0')+':00'}\n👨‍🏫 담당 선생님 : ${d.taName}\n\n⭐ 이해도/태도 : ${'★'.repeat(Number(d.rating || 5))}${'☆'.repeat(Math.max(0, 5 - Number(d.rating || 5)))}\n🏷️ 핵심 태그 : ${d.tags || '없음'}\n\n📝 진행 내용 및 피드백 :\n${d.clinicDetails || d.clinicContent || ''}\n\n🎯 다음 과제 (Next Action) :\n${d.nextAction || '수업 시간에 안내됨'}\n\n감사합니다.`
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

const CalendarView = React.memo(({ isInteractive, sessions, currentUser, currentDate, setCurrentDate, selectedDateStr, onDateChange, onAction, selectedSlots = [], users, taSubjectMap, onRefresh, isAdminView, isMyScheduleView, checkRoomAvailability, masterClassrooms, myClassIds }) => {
  
  const mySessions = useMemo(() => {
     if (isMyScheduleView) {
        return sessions.filter(s => (s.taId === currentUser.id || s.taName === currentUser.name) && s.date === selectedDateStr);
     }
     return sessions.filter(s => s.date === selectedDateStr);
  }, [sessions, currentUser, selectedDateStr, isMyScheduleView]);

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
    const alreadyBooked = sessions.some(s => 
        s.studentId === currentUser.id && 
        s.date === selectedDateStr && 
        s.startTime === time && 
        (s.status === 'confirmed' || s.status === 'pending')
    );
    if (alreadyBooked) return true;
    
    const selectedSessionTimes = selectedSlots.map(id => sessions.find(s => s.id === id)?.startTime).filter(Boolean);
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
            
            // 🚀 [CTO 패치] 학생은 7일 이내 스케줄만 활성화
            const maxDateStr = getFutureDate(7);
            const isAllowedDateForStudent = isStudent ? (dStr >= getLocalToday() && dStr <= maxDateStr) : true;

            let hasEvent = false;
            if (isStudent) { 
                if (isAllowedDateForStudent) {
                    hasEvent = sessions.some(s => {
                        const workerRole = s.workerRole || taSubjectMap.byId?.[s.taId]?.role || taSubjectMap.byName?.[s.taName]?.role || 'ta';
                        if (workerRole === 'admin_assistant') return false;
                        if (s.targetClassId && !myClassIds?.includes(s.targetClassId)) return false;
                        return s.date === dStr && s.status === 'open'; 
                    });
                } 
            }
            else if (isMyScheduleView) { hasEvent = sessions.some(s => s.date === dStr && (s.taId === currentUser.id || s.taName === currentUser.name)); }
            else { hasEvent = sessions.some(s => s.date === dStr); }

            // 🚀 [CTO 패치] 날짜 버튼의 직관적인 디자인 및 당일 하이라이트
            let dayClass = 'text-gray-700 hover:bg-gray-100';
            if (isStudent && !isAllowedDateForStudent) {
                dayClass = 'opacity-30 cursor-not-allowed bg-gray-50'; // 7일 밖의 날짜는 비활성화
            } else if (isSel) {
                dayClass = 'bg-blue-600 text-white shadow-md scale-105 ring-2 ring-blue-200';
            } else if (isToday) {
                dayClass = 'bg-indigo-100 text-indigo-800 font-black ring-2 ring-indigo-400 shadow-sm'; // 오늘 날짜 찐하게 하이라이트
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
                {/* 오늘 날짜 우측 상단에 깜빡이는 보라색 점 추가 */}
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
                // 7일 밖의 상세 스케줄도 표시하지 않음
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
                    const isSelected = selectedSlots.includes(s.id);
                    const isBlocked = isStudent && !isSelected && isTimeSlotBlockedForStudent(s.startTime);
                    
                    const workerRole = s.workerRole || taSubjectMap.byId?.[s.taId]?.role || taSubjectMap.byName?.[s.taName]?.role || 'ta';
                    const isAsstSlot = workerRole === 'admin_assistant'; 
                    const taSubject = s.taSubject || taSubjectMap.byId?.[s.taId]?.subject || taSubjectMap.byName?.[s.taName]?.subject || (isAsstSlot ? '행정 업무' : '개별 클리닉');

                    if (isStudent) {
                        if (s.status !== 'open') return null;
                        if (new Date(`${s.date}T${s.startTime}`) < now) return null;
                        
                        return (
                             <div key={s.id} onClick={()=> !isBlocked && onAction('toggle_slot', s)} className={`border-2 rounded-2xl p-3 md:p-4 flex justify-between items-center transition-all active:scale-[0.98] cursor-pointer w-full ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : isBlocked ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' : 'bg-white border-gray-200 hover:shadow-md'}`}>
                                <div className="flex-1 flex flex-col justify-center">
                                    <div className={`font-bold text-base md:text-lg leading-tight flex flex-wrap gap-2 items-center ${isBlocked ? 'text-gray-400' : 'text-gray-800'}`}>
                                        {s.taName} 선생님
                                        {s.targetClassName && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-black border border-indigo-200">{s.targetClassName} 전용</span>}
                                    </div>
                                    <div className={`text-xs md:text-sm mt-1 font-bold ${isBlocked ? 'text-gray-400' : 'text-blue-600'}`}>
                                        {taSubject} {s.classroom ? `· ${s.classroom}` : ''}
                                    </div>
                                </div>
                                <div className="ml-3 shrink-0">
                                  <Button size="sm" variant={isSelected ? "selected" : "outline"} onClick={(e)=> { e.stopPropagation(); !isBlocked && onAction('toggle_slot', s); }} icon={isSelected ? Check : Plus} disabled={isBlocked}>
                                      {isSelected ? '선택됨' : isBlocked ? '불가' : '선택'}
                                  </Button>
                                </div>
                            </div>
                        );
                    }

                    if (isParent) {
                        const isMyChild = (currentUser.linkedChildrenIds && currentUser.linkedChildrenIds.includes(s.studentId)) || (s.studentName === currentUser.childName);
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
                                <span className="font-bold text-lg text-gray-900">{s.studentName || s.taName}</span>
                                <Badge status={s.status}/>
                                {isAsstSlot && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">행정조교</span>}
                            </div>
                            
                            <div className="text-sm text-gray-600 font-medium mt-1">
                                {s.targetClassName && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded mr-1 font-bold">대상: {s.targetClassName}</span>}
                                {isAsstSlot ? (
                                    <span className="text-indigo-600">{s.topic || '행정 근무 예정'}</span>
                                ) : (
                                    <>
                                        {taSubject !== '개별 클리닉' && <span className="text-blue-600 font-bold mr-1">[{taSubject}]</span>}
                                        {s.topic || (isAdminView ? `${s.taName} 근무` : '예약 대기 중')}
                                    </>
                                )}
                            </div>

                            {(isAdminView || isLecturer || isMyScheduleView) && !isAsstSlot && s.studentName && (
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
                                        onChange={(e) => onAction('update_classroom', { id: s.id, val: e.target.value })}
                                    >
                                      <option value="">장소 미지정</option>
                                      {masterClassrooms?.map(r => {
                                          const occupiedStatus = checkRoomAvailability && checkRoomAvailability(s.date, s.startTime, s.endTime, r, s.id);
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
                                <button onClick={(e)=>{ e.stopPropagation(); onAction('delete', s.id); }} className="text-gray-500 hover:text-red-600 p-2" title="삭제"><Trash2 size={18}/></button>
                                
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
                            {isInteractive && !isParent && s.status==='addition_requested' && <Button size="sm" variant="secondary" onClick={()=>onAction('withdraw_add', s.id)}>철회</Button>}
                            
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
    const [adminEditData, setAdminEditData] = useState({ studentName: '', topic: '', questionRange: '' });
    
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

    const checkRoomAvailability = useCallback((dateStr, startTime, endTime, clinicRoom, currentSessionId = null) => {
        const dayOfWeek = DAYS[new Date(dateStr).getDay()];
        
        const normTargetRoom = (clinicRoom || '').replace(/\s+/g, '').toLowerCase().replace('class', 'classroom');

        const isOccupiedByClass = activeSchedules.some(s => {
            const normS = (s.room || '').replace(/\s+/g, '').toLowerCase().replace('class', 'classroom');
            if (normS !== normTargetRoom) return false;
            if (s.targetDate && s.targetDate !== dateStr) return false;
            if (!s.targetDate && s.day !== dayOfWeek) return false;
            
            const startA = s.startTime;
            const endA = s.endTime || `${String(parseInt(startA.split(':')[0]) + 1).padStart(2,'0')}:00`;
            const startB = startTime;
            const endB = endTime || `${String(parseInt(startB.split(':')[0]) + 1).padStart(2,'0')}:00`;
            return (startA < endB && endA > startB); 
        });

        if (isOccupiedByClass) return 'class';

        const isOccupiedByClinic = sessions.some(s => {
            if (currentSessionId && s.id === currentSessionId) return false; 
            if (s.date !== dateStr) return false;
            
            const normS = (s.classroom || '').replace(/\s+/g, '').toLowerCase().replace('class', 'classroom');
            if (!normS || normS !== normTargetRoom) return false;
            if (['addition_requested', 'cancellation_requested'].includes(s.status)) return false; 
            
            const startA = s.startTime;
            const endA = s.endTime || `${String(parseInt(startA.split(':')[0]) + 1).padStart(2,'0')}:00`;
            const startB = startTime;
            const endB = endTime || `${String(parseInt(startB.split(':')[0]) + 1).padStart(2,'0')}:00`;
            return (startA < endB && endA > startB);
        });

        if (isOccupiedByClinic) return 'clinic';

        return null;
    }, [activeSchedules, sessions]);

    const taSubjectMap = useMemo(() => {
        const mapById = {};
        const mapByName = {};
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
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const cacheKey = `imperial_sessions_${year}-${month}`;

        try {
            if (!forceRefresh) {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        const cacheTTL = currentUser.role === 'admin' ? 60000 : 3600000; 
                        if (Date.now() - parsed.timestamp < cacheTTL) { 
                            setSessionMap(parsed.data);
                            setAppLoading(false);
                            return; 
                        }
                    } catch (e) { localStorage.removeItem(cacheKey); }
                }
            }

            const startOfMonth = `${year}-${String(month).padStart(2,'0')}-01`;
            const endOfMonth = `${year}-${String(month).padStart(2,'0')}-31`;
            let sessionQuery;

            if (currentUser.role === 'student' || currentUser.role === 'parent') {
                const today = getLocalToday();
                const endDate = getFutureDate(21); // 대시보드 열람을 위해 여유있게 가져오되, 렌더링은 7일로 제한
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

    useEffect(() => {
        if (['ta', 'admin_assistant'].includes(currentUser.role) && sessions.length > 0) {
            const staleSessions = sessions.filter(s => s.taName === currentUser.name && s.taId !== currentUser.id);
            if (staleSessions.length > 0) {
                staleSessions.forEach(s => { updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', s.id), { taId: currentUser.id }).catch(()=>{}); });
            }
        }
    }, [sessions, currentUser]);

    const updateLocalAndCacheState = (updater) => {
        setSessionMap(prev => {
            const newState = typeof updater === 'function' ? updater(prev) : updater;
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            const cacheKey = `imperial_sessions_${year}-${month}`;
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: newState }));
            return newState;
        });
    };

    useEffect(() => {
        const sorted = Object.values(sessionMap).sort((a,b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''));
        setSessions(sorted);
    }, [sessionMap]);

    const notify = (msg, type = 'success') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, msg, type }]);
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
            setFeedbackData(prev => ({ 
                ...prev, 
                clinicDetails: response.data.refinedText 
            }));
            notify('✨ AI가 학부모님 전용 문장으로 깔끔하게 정제했습니다.', 'success');
        } catch (error) {
            console.error("AI Error:", error);
            notify(`AI 정제 실패: ${error.message}`, 'error');
        } finally {
            setIsRefining(false);
        }
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
            const h = parseInt(payload.time.split(':')[0]);
            if (h < 8 || h >= 22) return notify('운영 시간(08:00~22:00) 외 신청 불가', 'error');
            const newSession = {
                taId: currentUser.id, taName: currentUser.name, taSubject: currentUser.subject || '', workerRole: currentUser.role,
                date: selectedDateStr, startTime: payload.time, endTime: `${String(h+1).padStart(2,'0')}:00`, 
                status: 'addition_requested', source: 'system', classroom: ''
            };
            const ref = await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), newSession);
            updateLocalAndCacheState(prev => ({ ...prev, [ref.id]: { id: ref.id, ...newSession } }));
            notify('근무 신청 완료');
        } else if (action === 'cancel_request') {
             setSelectedSession(payload); setRequestData({reason:'', type:'cancel'}); setModalState({ type: 'request_change' });
        } else if (action === 'delete') {
            if(payload) askConfirm("정말 이 클리닉 기록 전체를 삭제하시겠습니까?\n데이터가 완전히 사라집니다.", async () => {
                await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload));
                updateLocalAndCacheState(prev => { const next = { ...prev }; delete next[payload]; return next; });
                notify('기록 삭제 완료', 'success');
            });
        
        } else if (action === 'skip_feedback_msg') {
            askConfirm("학부모님께 문자를 발송하지 않고,\n내부 기록용으로만 보관(발송 생략)하시겠습니까?", async () => {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { feedbackStatus: 'sent' });
                updateLocalAndCacheState(prev => {
                    const current = prev[payload.id] || {};
                    return { ...prev, [payload.id]: { ...current, feedbackStatus: 'sent' } };
                });
                notify('문자 발송이 생략되고 내부 기록으로 보관되었습니다.', 'success');
            });
        
        } else if (action === 'withdraw_cancel') {
            askConfirm("철회하시겠습니까?", async () => {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open', cancelReason: '' });
                updateLocalAndCacheState(prev => {
                    const current = prev[payload.id] || {};
                    return { ...prev, [payload.id]: { ...current, status: 'open', cancelReason: '' } };
                });
            });
        } else if (action === 'withdraw_add') {
            if(payload) askConfirm("철회하시겠습니까?", async () => {
                await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload));
                updateLocalAndCacheState(prev => { const next = { ...prev }; delete next[payload]; return next; });
            });
        
        } else if (action === 'approve_booking') {
            setSelectedSession(payload); 
            setPreviewMessage(TEMPLATES.confirmParent(payload));
            setModalState({ type: 'preview_confirm' });

        } else if (action === 'cancel_booking_admin') { 
            askConfirm("이 신청을 취소하고 슬롯을 초기화하시겠습니까?", async () => {
                const resetData = { status: 'open', studentId: '', studentName: '', studentPhone: '', topic: '', questionRange: '', source: 'system', classroom: payload.classroom || '' };
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), resetData);
                updateLocalAndCacheState(prev => {
                    const current = prev[payload.id] || {};
                    return { ...prev, [payload.id]: { ...current, ...resetData } };
                });
                notify('예약 신청이 취소되었습니다.');
            });
        } else if (action === 'update_classroom') {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { classroom: payload.val });
            updateLocalAndCacheState(prev => {
                const current = prev[payload.id] || {};
                return { ...prev, [payload.id]: { ...current, classroom: payload.val } };
            });
        } else if (action === 'write_feedback') {
            setSelectedSession(payload); 
            setFeedbackData({
                rating: payload.rating || 5,
                tags: payload.tags || '',
                clinicDetails: payload.clinicDetails || payload.clinicContent || '',
                nextAction: payload.nextAction || payload.improvement || ''
            }); 
            setModalState({ type: 'feedback' });
        } else if (action === 'admin_edit') {
            setSelectedSession(payload); 
            setAdminEditData({ studentName: payload.studentName||'', topic: payload.topic||'', questionRange: payload.questionRange||'' }); 
            setModalState({ type: 'admin_edit' });
        
        // 🚀 [CTO 패치] 관리자 근무 변경 요청 승인 및 반려 로직
        } else if (action === 'approve_schedule_change') { 
             if (payload.status === 'cancellation_requested') { 
                 await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id)); 
                 updateLocalAndCacheState(prev => { const next = { ...prev }; delete next[payload.id]; return next; });
                 notify('취소 요청이 승인되었습니다.', 'success'); 
             } 
             else if (payload.status === 'addition_requested') { 
                 await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: 'open' }); 
                 updateLocalAndCacheState(prev => {
                     const current = prev[payload.id] || {};
                     return { ...prev, [payload.id]: { ...current, status: 'open' } };
                 });
                 notify('추가 요청이 승인되었습니다.', 'success'); 
             }
        } else if (action === 'reject_schedule_change') {
             askConfirm("이 근무 변경 요청을 반려하시겠습니까?", async () => {
                 if (payload.status === 'cancellation_requested') { 
                     const revertStatus = payload.studentName ? 'confirmed' : 'open';
                     await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id), { status: revertStatus, cancelReason: '' }); 
                     updateLocalAndCacheState(prev => {
                         const current = prev[payload.id] || {};
                         return { ...prev, [payload.id]: { ...current, status: revertStatus, cancelReason: '' } };
                     });
                     notify('취소 요청이 반려되어 기존 상태로 복구되었습니다.', 'success'); 
                 } 
                 else if (payload.status === 'addition_requested') { 
                     await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', payload.id)); 
                     updateLocalAndCacheState(prev => { const next = { ...prev }; delete next[payload.id]; return next; });
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

      const batch = writeBatch(db);
      let count = 0;
      for (let d = new Date(batchDateRange.start); d <= new Date(batchDateRange.end); d.setDate(d.getDate() + 1)) {
        const dStr = formatDate(d);
        const dayName = DAYS[d.getDay()];
        const sched = defaultSchedule[dayName];
        
        if (sched && sched.active) {
          const sH = parseInt(sched.start.split(':')[0]), eH = parseInt(sched.end.split(':')[0]);
          for (let h = sH; h < eH; h++) {
            if (h >= 22) break;
            const sT = `${String(h).padStart(2,'0')}:00`, eT = `${String(h+1).padStart(2,'0')}:00`;
            
            if (!sessions.some(s => (s.taId === targetTa.id || s.taName === targetTa.name) && s.date === dStr && s.startTime === sT)) {
              batch.set(doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions')), {
                taId: targetTa.id, taName: targetTa.name, taSubject: targetTa.subject || '', workerRole: targetTa.role,
                date: dStr, startTime: sT, endTime: eT, 
                status: 'open', source: 'system', studentName: '', topic: '', questionRange: '', 
                classroom: batchClassroom || ''
              });
              count++;
            }
          }
        }
      }
      await batch.commit(); 
      notify(`${count}개의 스케줄이 일괄 생성되었습니다!`);
      fetchSessions(true); 
  };

  const submitStudentApplication = async () => {
      if (isSubmittingBooking) return; 
      setIsSubmittingBooking(true);
      
      try {
          const validItems = applicationItems.filter(i => i.subject || i.workbook || i.range);
          const formattedTopic = validItems.length > 0 ? validItems.map(i => i.subject).join(', ') : '개별 Q&A';
          const formattedRange = validItems.length > 0 ? validItems.map(i => `${i.workbook} (${i.range})`).join('\n') : '현장 지참';
          
          const batch = writeBatch(db);
          const updates = {};
          
          studentSelectedSlots.forEach(id => {
              const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', id);
              const updateData = { 
                  status: 'pending', 
                  studentId: currentUser?.id || 'unknown_student',
                  studentName: currentUser?.name || '알수없음', 
                  studentPhone: currentUser?.phone || '', 
                  topic: formattedTopic, 
                  questionRange: formattedRange, 
                  source: 'app' 
              };
              batch.update(ref, updateData);
              updates[id] = { id, ...updateData }; 
          });

          await batch.commit(); 
          
          updateLocalAndCacheState(prev => {
              const next = { ...prev };
              Object.keys(updates).forEach(id => { next[id] = { ...next[id], ...updates[id] }; });
              return next;
          });
          
          try {
              const telegramMsg = `[🔔 클리닉 예약 신청]\n\n👨‍🎓 학생명: ${currentUser?.name}\n📚 과목/내용: ${formattedTopic}\n📖 교재/범위: ${formattedRange.replace(/\n/g, ' ')}\n⏰ 신청 슬롯: 총 ${studentSelectedSlots.length}건\n\n원장님, 시스템에서 승인을 진행해 주세요!`;
              
              const sendTelegram = httpsCallable(functions, 'sendTelegramAlert');
              await sendTelegram({ text: telegramMsg });
          } catch (teleErr) {
              console.error("텔레그램 알림 발송 실패:", teleErr);
          }

          setModalState({type:null}); 
          setStudentSelectedSlots([]); 
          notify('신청이 성공적으로 완료되었습니다!', 'success');
      } catch(e) { 
          notify(`예약 실패: ${e.message || '네트워크 오류가 발생했습니다.'}`, 'error'); 
      } finally {
          setIsSubmittingBooking(false); 
      }
  };

  const handleAdminEditSubmit = async () => {
    const isAsst = selectedSession.workerRole === 'admin_assistant';
    
    let newStatus = selectedSession.status;
    let updateData = {};

    if (isAsst) {
        newStatus = (selectedSession.status === 'open' && adminEditData.topic) ? 'confirmed' : selectedSession.status;
        updateData = { topic: adminEditData.topic, status: newStatus };
    } else {
        newStatus = adminEditData.studentName ? (selectedSession.status === 'open' ? 'confirmed' : selectedSession.status) : 'open';
        updateData = { studentName: adminEditData.studentName, topic: adminEditData.topic, questionRange: adminEditData.questionRange, status: newStatus };
    }
    
    try {
        await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id), updateData); 
        updateLocalAndCacheState(prev => {
            const current = prev[selectedSession.id] || {};
            return { ...prev, [selectedSession.id]: { ...current, ...updateData } };
        });
        setModalState({type:null}); notify('수정완료', 'success'); 
    } catch (e) { notify('수정 권한이 거부되었습니다.', 'error'); }
  };

  const pendingBookings = sessions.filter(s => s.status === 'pending');
  const scheduleRequests = sessions.filter(s => s.status === 'cancellation_requested' || s.status === 'addition_requested');
  const pendingFeedbacks = sessions.filter(s => s.feedbackStatus === 'submitted');
  
  const studentMyClinics = useMemo(() => {
    return sessions.filter(s => {
        if (currentUser.role === 'parent') {
            const isMatchedByArray = currentUser.linkedChildrenIds && currentUser.linkedChildrenIds.includes(s.studentId);
            const isMatchedByName = s.studentName === currentUser.childName; 
            return (isMatchedByArray || isMatchedByName) && (s.status === 'confirmed' || s.status === 'pending' || s.status === 'completed');
        }
        return (s.studentId === currentUser.id || s.studentName === currentUser.name) && (s.status === 'confirmed' || s.status === 'pending' || s.status === 'completed');
    }).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || '')); 
  }, [sessions, currentUser]);

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
                  <div className="flex gap-2">
                      <Button variant="secondary" size="sm" icon={BarChart2} onClick={()=>setModalState({type:'admin_stats'})}>통계</Button>
                  </div>
              </div>
              <Card className="border-purple-200 bg-purple-50/30 w-full">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><ClipboardList className="text-purple-600"/> 근무 변경 요청 {scheduleRequests.length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{scheduleRequests.length}</span>}</h2>
                  {scheduleRequests.length === 0 ? <p className="text-gray-500 text-center py-6 bg-white rounded-2xl border border-gray-100">처리할 요청이 없습니다.</p> : (
                    <div className="grid gap-3">{scheduleRequests.map(req => (
                      <div key={req.id} className="bg-white border p-4 rounded-xl flex justify-between items-center shadow-sm">
                        <div>
                            <div className="flex items-center gap-2 mb-1"><Badge status={req.status}/><span className="font-bold">{req.taName}</span><span className="text-sm text-gray-500">{req.date}</span></div>
                            <div className="text-sm text-gray-600">{req.startTime}~{req.endTime}{req.cancelReason && <span className="ml-2 text-red-600 font-medium"> (사유: {req.cancelReason})</span>}</div>
                        </div>
                        {/* 🚀 [CTO 패치] 근무 변경 요청 반려 버튼 추가 */}
                        <div className="flex gap-2 shrink-0">
                            <Button variant="primary" size="sm" onClick={() => handleAction('approve_schedule_change', req)}>승인</Button>
                            <Button variant="danger" size="sm" onClick={() => handleAction('reject_schedule_change', req)}>반려</Button>
                        </div>
                      </div>
                    ))}</div>
                  )}
              </Card>

              <Card className="bg-blue-50/50 border-blue-100 w-full">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold flex items-center gap-2 text-lg text-blue-900"><Clock size={20}/> 스케줄 일괄 오픈 (마스터 권한)</h3>
                  </div>
                  
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
                  isInteractive={false} sessions={sessions} currentUser={currentUser} 
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
                        <div className="space-y-3">{pendingBookings.map(s => (
                            <div key={s.id} className="border border-green-100 bg-green-50/30 p-4 rounded-xl flex justify-between items-center shadow-sm">
                                <div className="flex-1 pr-3">
                                    <div className="font-bold text-gray-900 text-lg">{s.studentName} <span className="font-normal text-sm text-gray-500">({s.studentPhone})</span></div>
                                    <div className="text-sm font-bold text-gray-600 mt-1">{s.date} <span className="text-blue-600">{s.startTime}</span> ({s.taName})</div>
                                    
                                    <div className="text-sm text-gray-600 mt-2 p-2 bg-white rounded-lg border border-green-100">
                                        <div className="font-bold text-xs text-green-700 mb-0.5">신청 상세</div>
                                        <div className="whitespace-pre-wrap">{s.topic} / {s.questionRange}</div>
                                    </div>
                                    
                                    <div className="mt-2">
                                        <select 
                                            className={`text-sm border rounded-lg p-2 font-bold focus:ring-2 focus:ring-green-200 outline-none w-full ${!s.classroom ? 'bg-red-50 border-red-300 text-red-700' : 'bg-green-50 border-green-300 text-green-800 shadow-inner'}`} 
                                            value={s.classroom || ''} 
                                            onChange={(e) => handleAction('update_classroom', { id: s.id, val: e.target.value })}
                                        >
                                            <option value="">강의실 미배정 (선택 필수)</option>
                                            {masterData?.classrooms?.map(r => {
                                                const occupiedStatus = checkRoomAvailability && checkRoomAvailability(s.date, s.startTime, s.endTime, r, s.id);
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
                        ))}</div>
                    }
                </Card>
                <Card>
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><MessageSquare className="text-blue-600"/> 학부모 발송 대기 (피드백)</h2>
                    {pendingFeedbacks.length === 0 ? <div className="text-center py-10 bg-gray-50 rounded-xl text-gray-400">발송 대기 중인 피드백 없음</div> :
                        <div className="space-y-3">{pendingFeedbacks.map(s => (
                            <div key={s.id} className="border border-gray-200 p-4 rounded-xl flex justify-between items-center hover:bg-gray-50 transition-all shadow-sm">
                                <div className="overflow-hidden mr-2 flex-1">
                                    <div className="font-bold text-gray-900 flex items-center gap-2">
                                        {s.studentName} 학생 
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
                        ))}</div>
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
                    isInteractive={true} sessions={sessions} currentUser={currentUser} 
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
                  isInteractive={false} sessions={sessions} currentUser={currentUser} 
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
                            {studentMyClinics.map(s => (
                                <div key={s.id} className="bg-white p-5 rounded-xl border-2 border-blue-100 shadow-sm relative overflow-hidden transition-all hover:border-blue-300">
                                    {currentUser.role === 'parent' && <div className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">{s.studentName}</div>}
                                    <div className="flex justify-between mb-2 pr-12">
                                        <span className="font-bold text-gray-900 text-lg tracking-tight">{s.date}</span>
                                        <Badge status={s.status}/>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-700 mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100 w-fit">
                                        <Clock size={16} className="text-blue-600"/>
                                        <span className="font-black text-blue-900">{s.startTime} ~ {s.endTime}</span>
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
                            ))}
                        </div>
                    )}
                </Card>
                <Card className="w-full">
                    {/* 🚀 [CTO 패치] 예약 가능 기간 안내 라벨 추가 */}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-2">
                        <h2 className="text-xl font-bold flex items-center gap-2"><PlusCircle className="text-blue-600"/> 새로운 클리닉 예약하기</h2>
                        {currentUser.role === 'student' && <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 w-fit">🗓️ 예약 가능 기간: 당일 ~ 7일 후</span>}
                    </div>
                    <CalendarView 
                        isInteractive={currentUser.role === 'student'} 
                        sessions={sessions} 
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
            await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{status:'cancellation_requested', cancelReason:requestData.reason}); 
            updateLocalAndCacheState(prev => {
                const current = prev[selectedSession.id] || {};
                return { ...prev, [selectedSession.id]: { ...current, status: 'cancellation_requested', cancelReason: requestData.reason } };
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
            await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{...feedbackData,status:'completed',feedbackStatus:'submitted'}); 
            updateLocalAndCacheState(prev => {
                const current = prev[selectedSession.id] || {};
                return { ...prev, [selectedSession.id]: { ...current, ...feedbackData, status: 'completed', feedbackStatus: 'submitted' } };
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
                    <div><label className="block text-sm font-bold text-gray-600 mb-1">학생 이름 (직접 입력 시 예약 처리됨)</label><input className="w-full border-2 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-300 outline-none" value={adminEditData.studentName} onChange={e=>setAdminEditData({...adminEditData, studentName:e.target.value})} placeholder="학생 이름"/></div>
                    <div><label className="block text-sm font-bold text-gray-600 mb-1">과목</label><input className="w-full border-2 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-300 outline-none" value={adminEditData.topic} onChange={e=>setAdminEditData({...adminEditData, topic:e.target.value})} placeholder="과목"/></div>
                    <div><label className="block text-sm font-bold text-gray-600 mb-1">교재 및 범위</label><input className="w-full border-2 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-300 outline-none" value={adminEditData.questionRange} onChange={e=>setAdminEditData({...adminEditData, questionRange:e.target.value})} placeholder="범위"/></div>
                </>
            )}
            <Button className="w-full py-4 text-lg font-bold" onClick={handleAdminEditSubmit}>저장하기</Button>
        </div>
      </Modal>
      
      <Modal isOpen={modalState.type==='admin_stats'} onClose={()=>setModalState({type:null})} title="근무 통계">
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl"><span className="font-bold text-gray-700 text-lg">{currentDate.getFullYear()}년 {currentDate.getMonth()+1}월 근무 현황</span><div className="text-sm text-gray-500">확정(수행) / 전체(오픈)</div></div>
            <div className="overflow-x-auto"><table className="w-full text-base text-left border-collapse"><thead><tr className="bg-gray-100 border-b"><th className="p-3 whitespace-nowrap">조교명</th>{[1,2,3,4,5].map(w=><th key={w} className="p-3 text-center whitespace-nowrap">{w}주</th>)}<th className="p-3 text-center font-bold whitespace-nowrap">합계</th></tr></thead><tbody>{users.filter(u=>u.role==='ta' || u.role==='admin_assistant').map(ta=>{let tConf=0,tSched=0;return(<tr key={ta.id} className="border-b"><td className="p-3 font-medium whitespace-nowrap">{ta.name}</td>{[1,2,3,4,5].map(w=>{const weekSessions=sessions.filter(s=>{const [sy,sm,sd]=s.date.split('-').map(Number);const sDate=new Date(sy,sm-1,sd);return (s.taId===ta.id || s.taName===ta.name)&&sy===currentDate.getFullYear()&&(sm-1)===currentDate.getMonth()&&getWeekOfMonth(sDate)===w});const conf=weekSessions.filter(s=>s.status==='confirmed'||s.status==='completed').length;const sched=weekSessions.filter(s=>s.status==='open'||s.status==='confirmed'||s.status==='completed').length;tConf+=conf;tSched+=sched;return<td key={w} className="p-3 text-center text-sm">{sched>0?<span className={conf>0?'text-blue-600 font-bold':'text-gray-400'}>{conf}/{sched}</span>:'-'}</td>})}<td className="p-3 text-center font-bold bg-blue-50 text-blue-800">{tConf}/{tSched}</td></tr>)})}</tbody></table></div>
        </div>
      </Modal>
      
      <Modal isOpen={modalState.type==='preview_confirm'} onClose={()=>setModalState({type:null})} title="클리닉 예약 승인 및 학부모 안내문자 발송">
        <div className="bg-indigo-50 p-4 rounded-xl text-sm text-indigo-800 font-bold mb-3 flex items-center gap-2">
            <CheckCircle size={18}/> 아래 내용을 확인하신 후 승인하시면 학부모님께 문자가 즉시 발송됩니다. (수정 가능)
        </div>
        <textarea 
            className="w-full bg-white p-5 rounded-xl text-base border-2 border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-400 h-64 custom-scrollbar leading-relaxed" 
            value={previewMessage}
            onChange={(e) => setPreviewMessage(e.target.value)}
        />
        <Button className="w-full mt-4 py-4 text-lg font-black shadow-lg bg-indigo-600 hover:bg-indigo-700" onClick={async ()=>{ 
            try {
                let targetPhone = '';
                let targetStudentId = selectedSession.studentId;

                if (!targetStudentId && selectedSession.studentName) {
                    const foundStudent = users.find(u => u.role === 'student' && u.name === selectedSession.studentName);
                    if (foundStudent) targetStudentId = foundStudent.id;
                }
                
                if (targetStudentId) {
                    const parentUser = users.find(u => u.role === 'parent' && u.linkedChildrenIds && u.linkedChildrenIds.includes(targetStudentId));
                    if (parentUser && parentUser.phone) targetPhone = parentUser.phone;
                    else {
                        const studentUser = users.find(u => u.id === targetStudentId);
                        if (studentUser && studentUser.phone) targetPhone = studentUser.phone; 
                    }
                }
                if (!targetPhone && selectedSession.studentPhone) {
                    targetPhone = selectedSession.studentPhone;
                }

                if (!targetPhone) {
                    notify('연락처가 없어 문자를 발송할 수 없습니다. 예약만 승인됩니다.', 'error');
                } else {
                    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
                    await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                        phoneNumber: cleanPhone, 
                        message: previewMessage,
                        status: 'pending',
                        type: 'clinic_approval',
                        studentName: selectedSession.studentName,
                        createdAt: serverTimestamp()
                    });
                }

                await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{status:'confirmed'}); 
                updateLocalAndCacheState(prev => {
                    const current = prev[selectedSession.id] || {};
                    return { ...prev, [selectedSession.id]: { ...current, status: 'confirmed' } };
                }); 
                
                setModalState({type:null}); 
                notify(targetPhone ? '승인 완료 및 안내문자 발송 요청됨!' : '승인 완료!', 'success'); 
            } catch (error) {
                console.error("승인 오류:", error);
                notify(`오류: ${error.message}`, 'error');
            }
        }}>예약 승인 및 문자 발송하기</Button>
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
                let targetPhone = '';
                let targetStudentId = selectedSession.studentId;

                if (!targetStudentId && selectedSession.studentName) {
                    const foundStudent = users.find(u => u.role === 'student' && u.name === selectedSession.studentName);
                    if (foundStudent) targetStudentId = foundStudent.id;
                }
                
                if (targetStudentId) {
                    const parentUser = users.find(u => u.role === 'parent' && u.linkedChildrenIds && u.linkedChildrenIds.includes(targetStudentId));
                    if (parentUser && parentUser.phone) {
                        targetPhone = parentUser.phone;
                    } else {
                        const studentUser = users.find(u => u.id === targetStudentId);
                        if (studentUser && studentUser.phone) targetPhone = studentUser.phone; 
                    }
                }

                if (!targetPhone && selectedSession.studentPhone) {
                    targetPhone = selectedSession.studentPhone;
                }

                if (!targetPhone) {
                    notify('이 학생과 연결된 학부모 연락처나 학생 본인의 연락처가 시스템에 없습니다.', 'error');
                    return;
                }

                const cleanPhone = targetPhone.replace(/[^0-9]/g, '');

                await updateDoc(doc(db,'artifacts',APP_ID,'public','data','sessions',selectedSession.id),{feedbackStatus:'sent'}); 
                
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                    phoneNumber: cleanPhone, 
                    message: previewMessage,
                    status: 'pending',
                    type: 'clinic_feedback',
                    studentName: selectedSession.studentName,
                    createdAt: serverTimestamp()
                });

                updateLocalAndCacheState(prev => {
                    const current = prev[selectedSession.id] || {};
                    return { ...prev, [selectedSession.id]: { ...current, feedbackStatus: 'sent' } };
                }); 
                setModalState({type:null}); 
                notify('학원 폰으로 자동 발송이 요청되었습니다!', 'success'); 
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