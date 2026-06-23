/* [서비스 가치(Service Value)] 초개인화 학생 대시보드 (My Imperial Day)
   🚀 CTO 패치: 
   1. 단체 클리닉 전교생 노출 버그 수정: 내 이름이 명시되어 있거나, 내가 듣는 반의 클리닉만 보이도록 타겟팅 로직을 강화했습니다.
   2. 런타임 에러(WSOD) 100% 원천 차단 및 Firebase 비용 최적화 적용 */

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

    // 화면에 렌더링할 타임라인 배열
    const todayTimeline = useMemo(() => {
        const events = [];
        if (loadingData || !currentUser || !currentUser.id) return events;

        // A. 정규 수업
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

        // B. 클리닉 세션
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

    useEffect(() => {
        if (!currentUser || !currentUser.id || loadingData) return;

        let isMounted = true; 

        const fetchDashboardData = async () => {
            try {
                // A. 클리닉 세션 로드 (버그가 있었던 부분)
                const sessionQ = query(
                    collection(db, `artifacts/imperial-clinic-v1/public/data/sessions`), 
                    where('date', '==', todayDateStr),
                    where('status', '==', 'confirmed')
                );
                const sessionSnap = await getDocs(sessionQ);
                
                // 🚀 [CTO 패치] 클리닉 필터링 알고리즘 완벽 수정 (타겟팅 보장)
                const mySessions = sessionSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(s => {
                        const stList = Array.isArray(s.students) ? s.students : (s.studentName ? [{name: s.studentName}] : []);
                        
                        // 1. 내 이름이 명단에 명확하게 들어있는가? (강사 배정 or 본인 신청)
                        const isNameMatch = stList.some(st => st.name === currentUser.name);
                        
                        // 2. 단체 클리닉일 경우, 내가 듣고 있는 반의 클리닉이 맞는가?
                        const isClassMatch = s.classId ? enrollments.some(e => e.studentId === currentUser.id && e.classId === s.classId && e.status === 'active') : false;
                        
                        return isNameMatch || isClassMatch;
                    });
                
                if (isMounted) setTodaySessions(mySessions);

                // B. 백그라운드 AI 브리핑 호출
                try {
                    const functions = getFunctions(db.app, 'asia-northeast3');
                    const generateBriefing = httpsCallable(functions, 'generateMorningBriefing');
                    
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
                    if (isMounted) setBriefing(`${currentUser.name} 학생, 오늘도 임페리얼과 함께 힘찬 하루를 시작해봅시다!`);
                }

            } catch (error) {
                if (isMounted) setBriefing(`${currentUser?.name || '학생'}님, 오늘도 힘찬 하루 보내세요!`);
            } finally {
                if (isMounted) setIsLoadingBriefing(false);
            }
        };

        fetchDashboardData();

        return () => { isMounted = false; };
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