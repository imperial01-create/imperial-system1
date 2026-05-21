import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Clock, MapPin, AlertCircle, CheckCircle, 
    User, Search, Loader, PhoneCall, ShieldAlert, Check
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';
const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const ScheduleControlTower = ({ currentUser }) => {
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    
    const [classes, setClasses] = useState([]);
    const [enrollments, setEnrollments] = useState([]);
    const [users, setUsers] = useState([]);
    const [attendances, setAttendances] = useState([]); // 오늘의 출결 로그 (mock)
    
    const [searchQuery, setSearchQuery] = useState('');

    const todayStr = DAYS_OF_WEEK[currentTime.getDay()];
    const todayDateStr = currentTime.toISOString().split('T')[0];

    // --- 시계 틱 (1분마다 갱신하여 지각 판별) ---
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // --- DB 리스너 ---
    useEffect(() => {
        const unsubClasses = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/classes`), s => {
            setClasses(s.docs.map(d => ({id: d.id, ...d.data()})));
        });
        
        const unsubEnroll = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/enrollments`), s => {
            setEnrollments(s.docs.map(d => ({id: d.id, ...d.data()})));
        });

        const unsubUsers = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/users`), s => {
            setUsers(s.docs.map(d => ({id: d.id, ...d.data()})));
        });

        // 🚀 출결 로그 (임시 컬렉션)
        const qAtt = query(collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`));
        const unsubAtt = onSnapshot(qAtt, s => {
            setAttendances(s.docs.map(d => d.data()));
            setLoading(false);
        });

        return () => { unsubClasses(); unsubEnroll(); unsubUsers(); unsubAtt(); };
    }, []);

    // --- 데이터 가공 로직 ---
    
    // 1. 오늘 열리는 반 리스트 추출
    const todaysClasses = useMemo(() => {
        return classes.filter(c => c.schedules?.some(s => s.dayOfWeek === todayStr));
    }, [classes, todayStr]);

    // 2. 오늘 학원에 와야 할 학생 리스트 & 상태 계산
    const todaysRadarData = useMemo(() => {
        const radar = [];
        
        enrollments.forEach(enroll => {
            if (enroll.status !== 'active') return;
            
            const todaySch = enroll.schedules?.find(s => s.dayOfWeek === todayStr);
            if (!todaySch) return; // 오늘 안 오는 학생

            const student = users.find(u => u.id === enroll.studentId);
            const lecturer = users.find(u => u.id === enroll.lecturerId);
            
            // 오늘 이 학생이 출결을 찍었는가?
            const hasAttended = attendances.some(a => a.studentId === enroll.studentId && a.date === todayDateStr);
            
            // 지각 판별 (Call Time vs Current Time)
            const currentHHMM = `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`;
            const isLate = !hasAttended && (currentHHMM > todaySch.callTime);

            let status = 'expected'; // ⚪
            if (hasAttended) status = 'attended'; // 🟢
            else if (isLate) status = 'late'; // 🔴

            if (searchQuery && !student?.name.includes(searchQuery) && !enroll.className.includes(searchQuery)) return;

            radar.push({
                enrollId: enroll.id,
                studentId: enroll.studentId,
                studentName: student?.name || '알수없음',
                phone: student?.phone || '-',
                classId: enroll.classId,
                className: enroll.className,
                lecturerName: lecturer?.name || '미지정',
                callTime: todaySch.callTime,
                classTime: todaySch.startTime,
                room: todaySch.room || '미정',
                status: status
            });
        });
        
        // 정렬: 지각자 먼저, 그 다음 CallTime 빠른 순
        return radar.sort((a, b) => {
            if (a.status === 'late' && b.status !== 'late') return -1;
            if (a.status !== 'late' && b.status === 'late') return 1;
            return a.callTime.localeCompare(b.callTime);
        });
    }, [enrollments, users, attendances, todayStr, todayDateStr, currentTime, searchQuery]);

    const lateStudents = todaysRadarData.filter(d => d.status === 'late');
    const attendedStudents = todaysRadarData.filter(d => d.status === 'attended');

    // --- 수동 출결(임시) 처리 ---
    const handleManualCheckIn = async (studentId) => {
        if (!window.confirm("이 학생을 즉시 등원(출석) 처리하시겠습니까?")) return;
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

    if (loading) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in h-[85vh] flex flex-col">
            
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 md:p-8 rounded-3xl shadow-lg shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Activity size={32} className="animate-pulse" />
                        <h1 className="text-2xl md:text-3xl font-black">실시간 운영 현황</h1>
                    </div>
                    <p className="opacity-90 text-sm md:text-base">오늘 ({todayStr}요일) 학원의 모든 스케줄과 출결을 실시간으로 관제합니다.</p>
                </div>
                <div className="bg-black/20 p-4 rounded-2xl flex items-center gap-6">
                    <div className="text-center">
                        <div className="text-xs opacity-70 font-bold mb-1">총 등원 예정</div>
                        <div className="text-2xl font-black">{todaysRadarData.length}명</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-emerald-300 font-bold mb-1">출석 완료</div>
                        <div className="text-2xl font-black text-emerald-400">{attendedStudents.length}명</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-rose-300 font-bold mb-1">지각/미등원</div>
                        <div className="text-2xl font-black text-rose-400 animate-pulse">{lateStudents.length}명</div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* 🚀 좌측 메인 패널: 전체 학생 레이더 */}
                <div className="flex-1 bg-white border border-gray-200 rounded-3xl shadow-sm flex flex-col min-h-[400px]">
                    <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 bg-gray-50/50 rounded-t-3xl">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18}/> 오늘 출결 현황 리스트</h2>
                        <div className="relative w-full sm:w-64">
                            <input type="text" placeholder="이름, 반 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-emerald-500 text-sm"/>
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {todaysRadarData.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Activity size={48} className="opacity-20 mb-4"/>
                                <p className="font-bold">오늘 예정된 스케줄이 없습니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {todaysRadarData.map(data => (
                                    <div key={data.enrollId} className={`border p-3 rounded-2xl relative overflow-hidden transition-all flex flex-col
                                        ${data.status === 'late' ? 'bg-rose-50 border-rose-200 shadow-sm' : 
                                          data.status === 'attended' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-gray-200'}`}>
                                        
                                        {/* Status Indicator */}
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="font-black text-gray-900">{data.studentName}</div>
                                                {data.status === 'late' && <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded animate-pulse">지각</span>}
                                                {data.status === 'attended' && <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5"><Check size={10}/> 출석</span>}
                                                {data.status === 'expected' && <span className="bg-gray-200 text-gray-600 text-[10px] font-black px-1.5 py-0.5 rounded">예정</span>}
                                            </div>
                                            
                                            {data.status !== 'attended' && (
                                                <button onClick={() => handleManualCheckIn(data.studentId)} className="text-[10px] bg-white border border-gray-300 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 font-bold px-2 py-1 rounded-lg transition-colors">
                                                    수동 등원
                                                </button>
                                            )}
                                        </div>

                                        {/* Class Info */}
                                        <div className="flex-1 space-y-1.5">
                                            <div className="text-xs font-bold text-blue-700 truncate">{data.className}</div>
                                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                                                <User size={12}/> {data.lecturerName} 강사
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                                                <MapPin size={12}/> {data.room}
                                            </div>
                                        </div>

                                        {/* Time Box */}
                                        <div className={`mt-3 p-2 rounded-xl flex items-center justify-between text-xs font-bold border
                                            ${data.status === 'late' ? 'bg-white border-rose-100' : 'bg-gray-50 border-gray-100'}`}>
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={14} className={data.status === 'late' ? 'text-rose-500' : 'text-gray-400'}/>
                                                <span className={data.status === 'late' ? 'text-rose-600' : 'text-gray-600'}>
                                                    콜타임 {data.callTime}
                                                </span>
                                            </div>
                                            <span className="text-gray-400 text-[10px] font-normal">(수업 {data.classTime})</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 🚨 우측 사이드 패널: 긴급 콜 리스트 */}
                <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 shadow-sm flex flex-col h-full min-h-[300px]">
                        <h2 className="text-lg font-black text-rose-800 mb-4 flex items-center gap-2">
                            <ShieldAlert size={20} className="animate-pulse"/> 긴급 콜(Call) 리스트
                        </h2>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                            {lateStudents.length === 0 ? (
                                <div className="text-center py-10 text-rose-300 font-bold text-sm">
                                    현재 지각생이 없습니다! <br/>아주 평화롭습니다. 🕊️
                                </div>
                            ) : (
                                lateStudents.map(data => (
                                    <div key={`call_${data.enrollId}`} className="bg-white p-3 rounded-xl border border-rose-100 shadow-sm relative group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="font-bold text-gray-900">{data.studentName}</span>
                                                <span className="text-[10px] font-black text-rose-500 ml-2">지각중</span>
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-gray-500 mb-2 truncate">{data.className}</div>
                                        
                                        <div className="bg-gray-50 p-2 rounded-lg flex justify-between items-center">
                                            <div className="font-mono text-xs font-bold text-gray-700">{data.phone || '번호없음'}</div>
                                            <a href={`tel:${data.phone}`} className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-500 hover:text-white transition-colors">
                                                <PhoneCall size={12} />
                                            </a>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleControlTower;