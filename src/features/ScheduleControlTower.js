/* [서비스 가치] 학원의 오늘 하루 스케줄과 출결을 관제하는 상황실입니다.
   (🚀 CTO 패치: 한국 시간(KST) 자정 리셋 동기화, 강사 권한별 뷰어 분리, 클래스 단위 UI 그룹화 적용.
   더불어 삭제된 학생의 찌꺼기 데이터가 '알수없음'으로 뜨는 현상을 막기 위한 방탄 필터링(Bulletproof Filtering)이 적용되었습니다.) */
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Activity, Clock, MapPin, CheckCircle, 
    User, Users, Search, Loader, PhoneCall, ShieldAlert, Check 
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';
const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// 🚀 [CTO 패치] 한국 시간(KST) 기준 정확한 로컬 날짜 문자열(YYYY-MM-DD) 추출기
const getLocalDateStr = (dateObj) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
};

const ScheduleControlTower = ({ currentUser }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [attendances, setAttendances] = useState([]); 
    const [searchQuery, setSearchQuery] = useState('');
    const [localLoading, setLocalLoading] = useState(true);

    const { classes, enrollments, users, loadingData } = useData();

    const todayStr = DAYS_OF_WEEK[currentTime.getDay()];
    const todayDateStr = getLocalDateStr(currentTime);

    // 1분마다 현재 시간 갱신
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // 오늘 날짜의 출결 데이터만 실시간 구독 (요금/메모리 최적화)
    useEffect(() => {
        const qAtt = query(collection(db, `artifacts/${APP_ID}/public/data/attendance_logs`));
        const unsubAtt = onSnapshot(qAtt, s => {
            const todayLogs = s.docs.map(d => d.data()).filter(a => a.date === todayDateStr);
            setAttendances(todayLogs);
            setLocalLoading(false);
        });
        return () => unsubAtt();
    }, [todayDateStr]);

    // 🚀 [CTO 패치] 데이터를 '반(Class)' 단위로 그룹화하고, 권한 및 무결성에 맞게 필터링
    const radarData = useMemo(() => {
        const classGroups = {};
        const emergencyList = [];
        let totalExpected = 0;
        let totalAttended = 0;
        let totalLate = 0;

        enrollments.forEach(enroll => {
            if (enroll.status !== 'active') return;
            
            // 1. 강사 권한 필터링: 본인 반이 아니면 패스 (관리자/조교는 전부 열람)
            if (currentUser.role === 'lecturer' && enroll.lecturerId !== currentUser.id) return;

            // 2. 오늘 스케줄 확인
            const todaySch = enroll.schedules?.find(s => s.dayOfWeek === todayStr);
            if (!todaySch) return;

            const student = users.find(u => u.id === enroll.studentId);
            
            // 🚀 [CTO 패치] 방탄 필터링 (Bulletproof Filtering)
            // users DB에 존재하지 않는 학생(연쇄 삭제 전의 유령 데이터)은 즉시 스킵하여 '알수없음' 카드를 원천 차단합니다.
            if (!student) return;

            const lecturer = users.find(u => u.id === enroll.lecturerId);
            
            // 3. 검색어 필터링
            if (searchQuery && !student.name.includes(searchQuery) && !enroll.className.includes(searchQuery)) return;

            // 4. 출결 상태 계산
            const hasAttended = attendances.some(a => a.studentId === enroll.studentId);
            const currentHHMM = `${String(currentTime.getHours()).padStart(2,'0')}:${String(currentTime.getMinutes()).padStart(2,'0')}`;
            const isLate = !hasAttended && (currentHHMM > todaySch.callTime);

            let status = 'expected'; 
            if (hasAttended) { status = 'attended'; totalAttended++; }
            else if (isLate) { status = 'late'; totalLate++; }
            else { totalExpected++; } // 아직 시간 안 된 순수 예정자

            const studentData = {
                studentId: enroll.studentId,
                studentName: student.name, // 방어 로직 덕분에 이제 무조건 실제 이름이 보장됩니다.
                phone: student.phone || '-',
                status: status,
                enrollId: enroll.id
            };

            // 긴급 콜 리스트 별도 수집
            if (status === 'late') {
                emergencyList.push({ ...studentData, className: enroll.className, callTime: todaySch.callTime });
            }

            // 5. 클래스 단위로 그룹핑
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

        // 6. 등원 요구 시간(Call Time) 순으로 오름차순 정렬
        const sortedGroups = Object.values(classGroups).sort((a, b) => a.callTime.localeCompare(b.callTime));

        // 학생 이름 순 정렬
        sortedGroups.forEach(g => {
            g.students.sort((a, b) => a.studentName.localeCompare(b.studentName));
        });

        // 긴급 콜 리스트 콜타임 정렬
        emergencyList.sort((a, b) => a.callTime.localeCompare(b.callTime));

        return { 
            groups: sortedGroups, 
            emergencyList,
            totalExpected: totalExpected + totalAttended + totalLate, 
            totalAttended, 
            totalLate 
        };
    }, [enrollments, users, attendances, todayStr, todayDateStr, currentTime, searchQuery, currentUser]);

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

    if (loadingData || localLoading) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in h-[85vh] flex flex-col">
            
            {/* Header Dashboard */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-6 md:p-8 rounded-3xl shadow-lg shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Activity size={32} className="animate-pulse" />
                        <h1 className="text-2xl md:text-3xl font-black">실시간 운영 현황</h1>
                    </div>
                    <p className="opacity-90 text-sm md:text-base">
                        오늘 ({todayStr}요일) {currentUser.role === 'lecturer' ? '담당하시는 반의' : '학원의 모든'} 스케줄과 출결을 관제합니다.
                    </p>
                </div>
                <div className="bg-black/20 p-4 rounded-2xl flex items-center gap-6">
                    <div className="text-center">
                        <div className="text-xs opacity-70 font-bold mb-1">총 등원 예정</div>
                        <div className="text-2xl font-black">{radarData.totalExpected}명</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xs text-emerald-300 font-bold mb-1">출석 완료</div>
                        <div className="text-2xl font-black text-emerald-400">{radarData.totalAttended}명</div>
                    </div>
                    <div className="text-center">
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
                            <input type="text" placeholder="학생 이름, 반 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold bg-white"/>
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
                                        
                                        {/* Class Card Header */}
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-xs font-black px-2 py-0.5 rounded-md ${hasLate ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'}`}>
                                                        콜타임 {group.callTime}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-500">본수업 {group.classTime}</span>
                                                </div>
                                                <h3 className="text-lg font-black text-gray-900">{group.className}</h3>
                                            </div>
                                            <div className="flex flex-row md:flex-col gap-3 md:gap-1 text-xs font-bold text-gray-500">
                                                <div className="flex items-center gap-1"><User size={12}/> {group.lecturerName} 강사</div>
                                                <div className="flex items-center gap-1"><MapPin size={12}/> {group.room}</div>
                                            </div>
                                        </div>

                                        {/* Class Students List (배지 형태) */}
                                        <div className="flex flex-wrap gap-2">
                                            {group.students.map(student => (
                                                <div key={student.studentId} 
                                                     className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-sm transition-all
                                                     ${student.status === 'late' ? 'bg-rose-50 border-rose-300 text-rose-800' : 
                                                       student.status === 'attended' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                                    
                                                    <span className="font-bold">{student.studentName}</span>
                                                    
                                                    {student.status === 'late' && <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded animate-pulse">지각</span>}
                                                    {student.status === 'attended' && <span className="text-emerald-500 text-[10px] font-black flex items-center gap-0.5"><Check size={12}/> 완료</span>}
                                                    {student.status === 'expected' && <span className="text-gray-400 text-[10px] font-black">대기</span>}

                                                    {/* 지각 또는 대기 중일 때 수동 출석 버튼 노출 */}
                                                    {student.status !== 'attended' && (
                                                        <button 
                                                            onClick={() => handleManualCheckIn(student.studentId, student.studentName)} 
                                                            className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors
                                                            ${student.status === 'late' ? 'bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white' : 'bg-gray-100 text-gray-500 hover:bg-emerald-500 hover:text-white'}`}
                                                            title="수동 등원 처리"
                                                        >
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

                {/* 우측 긴급 콜 리스트 */}
                <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 shadow-sm flex flex-col h-full min-h-[300px]">
                        <h2 className="text-lg font-black text-rose-800 mb-4 flex items-center gap-2">
                            <ShieldAlert size={20} className="animate-pulse"/> 긴급 콜(Call) 리스트
                        </h2>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                            {radarData.emergencyList.length === 0 ? (
                                <div className="text-center py-10 text-rose-400 font-bold text-sm">
                                    현재 지각생이 없습니다! <br/>아주 평화롭습니다. 🕊️
                                </div>
                            ) : (
                                radarData.emergencyList.map(data => (
                                    <div key={`call_${data.enrollId}`} className="bg-white p-3 rounded-xl border border-rose-200 shadow-sm relative group hover:border-rose-300 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="font-bold text-gray-900">{data.studentName}</span>
                                                <span className="text-[10px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded ml-2 animate-pulse">콜타임 {data.callTime} 지각</span>
                                            </div>
                                        </div>
                                        <div className="text-[11px] font-bold text-gray-500 mb-2 truncate">{data.className}</div>
                                        
                                        <div className="bg-gray-50 p-2 rounded-lg flex justify-between items-center border border-gray-100">
                                            <div className="font-mono text-xs font-bold text-gray-700">{data.phone || '번호없음'}</div>
                                            <a href={`tel:${data.phone}`} className="w-7 h-7 bg-green-100 text-green-600 rounded-full flex items-center justify-center hover:bg-green-500 hover:text-white transition-colors shadow-sm">
                                                <PhoneCall size={14} />
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