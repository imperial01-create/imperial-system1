/* [서비스 가치(Service Value)] 초개인화 학생 대시보드 (My Imperial Day)
   🚀 CTO 패치: 
   1. Build Crash 완벽 해결: ESLint 플러그인 충돌을 유발했던 예외 주석(disable-next-line)을 완전히 제거.
   2. 데이터 동기화 알고리즘 개선: 클리닉 세션 호출과 AI 브리핑 호출 파이프라인을 직렬화(Sequential)하여 무한 루프 원천 차단.
   3. 메모리 누수 방지: 컴포넌트 언마운트 시 비동기 작업을 안전하게 종료(isMounted)하는 방어 로직 추가. */

import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Clock, MapPin, ChevronRight, Calendar, BookOpen, User, Loader } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export default function StudentDashboard({ currentUser }) {
    const dataContext = useData() || {};
    const { enrollments = [], classes = [], masterData = {}, users = [], loadingData = false } = dataContext;
    
    const [briefing, setBriefing] = useState('');
    const [isLoadingBriefing, setIsLoadingBriefing] = useState(true);
    const [todaySessions, setTodaySessions] = useState([]);

    const now = new Date();
    const todayDayStr = DAYS_OF_WEEK[now.getDay()];
    const pad = (n) => String(n).padStart(2, '0');
    const todayDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // 🚀 [리팩토링 1] 화면에 렌더링할 타임라인 배열 (UI 전용)
    const todayTimeline = useMemo(() => {
        const events = [];
        if (loadingData || !currentUser || !currentUser.id) return events;

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

        return events.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    }, [enrollments, classes, users, todayDayStr, todaySessions, currentUser, loadingData]);

    // 🚀 [리팩토링 2] 빌드 에러를 유발했던 의존성 배열(Dependency Array) 로직 완벽 분리
    useEffect(() => {
        if (!currentUser || !currentUser.id || loadingData) return;

        let isMounted = true; // 메모리 누수 방지용 플래그

        const fetchDashboardData = async () => {
            try {
                // A. 클리닉 세션 로드
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
                        return stList.some(st => st.name === currentUser.name || String(st.name || '').includes('[반 단체]'));
                    });
                
                if (isMounted) setTodaySessions(mySessions);

                // B. 백그라운드에서 AI 브리핑 호출 (의존성 무한루프 방지를 위해 자체적으로 스케줄 계산)
                try {
                    const functions = getFunctions(db.app, 'asia-northeast3');
                    const generateBriefing = httpsCallable(functions, 'generateMorningBriefing');
                    
                    // 현재 가져온 세션과 정규 수업을 결합하여 요약본 생성 (Effect 내부 변수 활용)
                    const myEnrolls = enrollments.filter(e => e.studentId === currentUser.id && e.status === 'active');
                    const classSummaries = myEnrolls.map(enroll => {
                        const classObj = classes.find(c => c.id === enroll.classId);
                        const todaySch = classObj?.schedules?.find(s => s.dayOfWeek === todayDayStr);
                        return todaySch ? `${todaySch.startTime} ${classObj.name}` : null;
                    }).filter(Boolean);
                    
                    const clinicSummaries = mySessions.map(s => `${s.startTime} ${s.topic || '클리닉'}`);
                    const scheduleSummary = [...classSummaries, ...clinicSummaries].join(', ');

                    const ctxSnap = await getDocs(query(collection(db, `artifacts/imperial-clinic-v1/public/data/student_context`), where('studentId', '==', currentUser.id)));
                    const latestContext = !ctxSnap.empty ? ctxSnap.docs[0].data().tag : '';

                    const response = await generateBriefing({
                        studentId: currentUser.id,
                        studentName: currentUser.name,
                        todaySchedules: scheduleSummary,
                        contextTag: latestContext
                    });

                    if (isMounted) {
                        if (response.data && response.data.success) {
                            setBriefing(response.data.briefing);
                        } else {
                            setBriefing(`${currentUser.name} 학생, 오늘도 임페리얼과 함께 힘찬 하루를 시작해봅시다!`);
                        }
                    }
                } catch (funcErr) {
                    console.error("Functions Error:", funcErr);
                    if (isMounted) setBriefing(`${currentUser.name} 학생, 오늘도 임페리얼과 함께 힘찬 하루를 시작해봅시다!`);
                }

            } catch (error) {
                console.error("Dashboard Load Error:", error);
                if (isMounted) setBriefing(`${currentUser?.name || '학생'}님, 오늘도 힘찬 하루 보내세요!`);
            } finally {
                if (isMounted) setIsLoadingBriefing(false);
            }
        };

        fetchDashboardData();

        // 클린업 함수: 컴포넌트가 닫히면 상태 업데이트 중단
        return () => {
            isMounted = false;
        };
    }, [currentUser, todayDateStr, loadingData, todayDayStr, enrollments, classes]); 

    // 안전한 로딩 화면 렌더링
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