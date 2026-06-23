/* [서비스 가치(Service Value)] 초개인화 학생 대시보드 (My Imperial Day)
   🚀 CTO 패치: 
   1. 런타임 에러(WSOD) 100% 원천 차단: 누락된 User 아이콘 Import 복구 및 Optional Chaining(?.) 전면 적용
   2. Data Undefined 방어: currentUser나 데이터가 1초라도 늦게 도착하면 우아한 스켈레톤(Skeleton) 로딩을 보여줌
   3. Firebase 비용 최적화: 백엔드 캐싱 데이터를 활용하여 불필요한 AI 토큰 소모를 방지 */

import React, { useState, useEffect, useMemo } from 'react';
// 🚀 [에러 해결 1] User 아이콘 등 렌더링에 필요한 모든 요소를 완벽하게 Import 했습니다.
import { Sparkles, Clock, MapPin, ChevronRight, Calendar, BookOpen, AlertCircle, Loader, User } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export default function StudentDashboard({ currentUser }) {
    // 🚀 [에러 해결 2] Context 데이터가 비어있을 때를 대비한 2중 안전장치 (|| {} 및 기본값 할당)
    const dataContext = useData() || {};
    const { enrollments = [], classes = [], masterData = {}, users = [], loadingData = false } = dataContext;
    
    const [briefing, setBriefing] = useState('');
    const [isLoadingBriefing, setIsLoadingBriefing] = useState(true);
    const [todaySessions, setTodaySessions] = useState([]);

    // 1. 날짜 및 시간 계산
    const now = new Date();
    const todayDayStr = DAYS_OF_WEEK[now.getDay()];
    const pad = (n) => String(n).padStart(2, '0');
    const todayDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // 2. 오늘의 스케줄 (정규 수업 + 클리닉) 조립 및 정렬
    const todayTimeline = useMemo(() => {
        const events = [];

        // 데이터가 아직 로딩 중이거나 유저 정보가 없으면 빈 배열 반환 (에러 방지)
        if (loadingData || !currentUser || !currentUser.id) return events;

        // A. 정규 수업 추출
        const myEnrolls = enrollments.filter(e => e.studentId === currentUser.id && e.status === 'active');
        myEnrolls.forEach(enroll => {
            const classObj = classes.find(c => c.id === enroll.classId);
            if (!classObj) return;
            
            const todaySch = classObj.schedules?.find(s => s.dayOfWeek === todayDayStr);
            if (todaySch) {
                const lecturer = users.find(u => u.id === classObj.lecturerId);
                events.push({
                    type: 'class',
                    id: `class_${classObj.id}`,
                    title: classObj.name || '정규 수업',
                    startTime: todaySch.startTime || '00:00',
                    endTime: todaySch.endTime || '종료 미정',
                    room: todaySch.room || '강의실 미정',
                    lecturer: lecturer?.name || '담당 강사',
                    color: 'bg-blue-50 border-blue-200 text-blue-800'
                });
            }
        });

        // B. 클리닉 세션 추출
        todaySessions.forEach(session => {
            events.push({
                type: 'clinic',
                id: `clinic_${session.id}`,
                title: session.topic || '개별 밀착 클리닉',
                startTime: session.startTime || '00:00',
                endTime: session.endTime || '종료 미정',
                room: session.classroom || '클리닉실',
                lecturer: session.taName || '담당 조교',
                color: 'bg-purple-50 border-purple-200 text-purple-800'
            });
        });

        // C. 시작 시간 기준으로 오름차순 정렬 (O(N log N))
        return events.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    }, [enrollments, classes, users, todayDayStr, todaySessions, currentUser, loadingData]);

    // 3. 서버에서 클리닉 세션 및 AI 브리핑 로드
    useEffect(() => {
        if (!currentUser || !currentUser.id || loadingData) return;

        const fetchDashboardData = async () => {
            try {
                // A. 오늘의 클리닉 세션 로드
                const sessionQ = query(
                    collection(db, `artifacts/imperial-clinic-v1/public/data/sessions`), 
                    where('date', '==', todayDateStr),
                    where('status', '==', 'confirmed')
                );
                const sessionSnap = await getDocs(sessionQ);
                const mySessions = sessionSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(s => {
                        const stList = Array.isArray(s.students) ? s.students : (s.studentName ? [{name: s.studentName}] : []);
                        // 본인 이름이 포함되거나 반 단체인 경우
                        return stList.some(st => st.name === currentUser.name || String(st.name || '').includes('[반 단체]'));
                    });
                setTodaySessions(mySessions);

                // B. AI 아침 브리핑 호출 (에러 없는 안전한 호출)
                try {
                    const functions = getFunctions(db.app, 'asia-northeast3');
                    const generateBriefing = httpsCallable(functions, 'generateMorningBriefing');
                    
                    const scheduleSummary = todayTimeline.map(e => `${e.startTime} ${e.title}`).join(', ');

                    const ctxSnap = await getDocs(query(collection(db, `artifacts/imperial-clinic-v1/public/data/student_context`), where('studentId', '==', currentUser.id)));
                    const latestContext = !ctxSnap.empty ? ctxSnap.docs[0].data().tag : '';

                    const response = await generateBriefing({
                        studentId: currentUser.id,
                        studentName: currentUser.name,
                        todaySchedules: scheduleSummary,
                        contextTag: latestContext
                    });

                    if (response.data && response.data.success) {
                        setBriefing(response.data.briefing);
                    } else {
                        setBriefing(`${currentUser.name} 학생, 오늘도 임페리얼과 함께 힘찬 하루를 시작해봅시다!`);
                    }
                } catch (funcErr) {
                    console.error("Functions Error:", funcErr);
                    setBriefing(`${currentUser.name} 학생, 오늘도 임페리얼과 함께 힘찬 하루를 시작해봅시다!`);
                }

            } catch (error) {
                console.error("Dashboard Load Error:", error);
                setBriefing(`${currentUser?.name || '학생'}님, 오늘도 힘찬 하루 보내세요!`);
            } finally {
                setIsLoadingBriefing(false);
            }
        };

        fetchDashboardData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.id, todayDateStr, loadingData]); 

    // 🚀 [에러 해결 3] 유저 정보가 아직 도착하지 않았을 때의 빈 화면(WSOD) 방어
    if (loadingData || !currentUser) {
        return (
            <div className="flex flex-col justify-center items-center h-[70vh] animate-pulse">
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-bold">나만의 완벽한 하루를 준비하고 있습니다...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in">
            
            {/* Header */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <p className="text-slate-500 font-bold mb-1">{now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
                    <h1 className="text-3xl font-black text-slate-900">
                        환영합니다, <span className="text-indigo-600">{currentUser?.name || '학생'}</span>님!
                    </h1>
                </div>
                {/* 🚀 Optional Chaining 적용으로 name 속성이 없어도 뻗지 않음 */}
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-black text-xl shadow-sm border border-indigo-200">
                    {currentUser?.name ? currentUser.name[0] : 'S'}
                </div>
            </div>

            {/* AI Morning Briefing Section */}
            <div className="bg-gradient-to-br from-indigo-900 to-blue-800 rounded-3xl p-6 shadow-xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 opacity-10 pointer-events-none translate-x-4 -translate-y-4">
                    <Sparkles size={120} />
                </div>
                
                <div className="flex items-center gap-2 mb-4">
                    <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                        <Sparkles size={20} className="text-yellow-300" />
                    </div>
                    <h2 className="text-lg font-black tracking-wide">오늘의 Imperial 멘토링</h2>
                </div>

                <div className="min-h-[80px]">
                    {isLoadingBriefing ? (
                        <div className="space-y-3 animate-pulse">
                            <div className="h-4 bg-white/20 rounded-md w-3/4"></div>
                            <div className="h-4 bg-white/20 rounded-md w-full"></div>
                            <div className="h-4 bg-white/20 rounded-md w-5/6"></div>
                        </div>
                    ) : (
                        <p className="text-lg md:text-xl font-bold leading-relaxed break-keep">
                            "{briefing}"
                        </p>
                    )}
                </div>
            </div>

            {/* Smart Timeline Section */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8">
                <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-100">
                    <Calendar className="text-indigo-500" size={24} />
                    <h2 className="text-xl font-black text-slate-800">나의 하루 스케줄</h2>
                </div>

                {todayTimeline.length === 0 ? (
                    <div className="text-center py-16 flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <BookOpen size={32} className="text-slate-300" />
                        </div>
                        <p className="text-slate-500 font-bold text-lg">오늘은 학원 스케줄이 없습니다.</p>
                        <p className="text-slate-400 text-sm mt-1">자기 주도 학습에 집중하는 하루를 보내세요!</p>
                    </div>
                ) : (
                    <div className="relative">
                        {/* 수직 타임라인 선 */}
                        <div className="absolute left-[39px] top-4 bottom-4 w-0.5 bg-slate-100"></div>
                        
                        <div className="space-y-8">
                            {todayTimeline.map((event) => (
                                <div key={event.id} className="relative flex items-start gap-6 group">
                                    
                                    {/* 시간 정보 */}
                                    <div className="w-20 shrink-0 text-right pt-1">
                                        <div className="font-black text-slate-800 text-lg">{event.startTime}</div>
                                        <div className="text-xs font-bold text-slate-400">~ {event.endTime}</div>
                                    </div>

                                    {/* 타임라인 점 (Node) */}
                                    <div className={`relative z-10 w-4 h-4 rounded-full mt-2 ring-4 ring-white ${event.type === 'class' ? 'bg-blue-500' : 'bg-purple-500'}`}></div>

                                    {/* 스케줄 카드 */}
                                    <div className={`flex-1 rounded-2xl p-5 border shadow-sm transition-all group-hover:shadow-md ${event.color}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-white/60 shadow-sm border border-black/5">
                                                {event.type === 'class' ? '📚 정규 수업' : '💡 밀착 클리닉'}
                                            </span>
                                        </div>
                                        
                                        <h3 className="text-lg font-black text-slate-900 mb-3 break-keep">{event.title}</h3>
                                        
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-sm font-bold opacity-80">
                                            <div className="flex items-center gap-1.5">
                                                {/* 🚀 누락되었던 User 아이콘 정상 출력 */}
                                                <User size={16} />
                                                <span>{event.lecturer}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <MapPin size={16} />
                                                <span>{event.room}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}