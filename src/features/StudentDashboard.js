/* [서비스 가치(Service Value)] 초개인화 학생 대시보드 (My Imperial Day)
   🚀 CTO 패치 (학사일정 연동): 
   학원 전체의 'academic_calendars' 마스터 데이터를 실시간으로 읽어와, 본인 학교의 시험 D-Day가 30일 이내로 떨어지면 최상단에 압도적인 텐션의 붉은색 경고 배너를 노출하여 내신 몰입도를 극대화합니다. */

import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Clock, MapPin, ChevronRight, Calendar, BookOpen, User, Loader, Target, Flame, AlertTriangle } from 'lucide-react';
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
    
    // 🚀 학사일정 D-Day 상태
    const [upcomingExam, setUpcomingExam] = useState(null);
    const [dDayCount, setDDayCount] = useState(null);

    const now = new Date();
    const todayDayStr = DAYS_OF_WEEK[now.getDay()];
    const pad = (n) => String(n).padStart(2, '0');
    const todayDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

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
                    type: 'class', id: `class_${classObj.id}`, title: classObj.name || '정규 수업',
                    startTime: todaySch.startTime || '00:00', endTime: todaySch.endTime || '종료 미정',
                    room: todaySch.room || '강의실 미정', lecturer: lecturer?.name || '담당 강사',
                    color: 'bg-blue-50 border-blue-200 text-blue-800'
                });
            }
        });

        todaySessions.forEach(session => {
            events.push({
                type: 'clinic', id: `clinic_${session.id}`, title: session.topic || '개별 밀착 클리닉',
                startTime: session.startTime || '00:00', endTime: session.endTime || '종료 미정',
                room: session.classroom || '클리닉실', lecturer: session.taName || '담당 조교',
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
                // 1. 클리닉 세션 로드
                const sessionQ = query(collection(db, `artifacts/imperial-clinic-v1/public/data/sessions`), where('date', '==', todayDateStr), where('status', '==', 'confirmed'));
                const sessionSnap = await getDocs(sessionQ);
                const mySessions = sessionSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(s => {
                        const stList = Array.isArray(s.students) ? s.students : (s.studentName ? [{name: s.studentName}] : []);
                        const isNameMatch = stList.some(st => st.name === currentUser.name);
                        const isClassMatch = s.classId ? enrollments.some(e => e.studentId === currentUser.id && e.classId === s.classId && e.status === 'active') : false;
                        return isNameMatch || isClassMatch;
                    });
                if (isMounted) setTodaySessions(mySessions);

                // 🚀 2. [CTO 패치] 내 학교의 다가오는 학사일정(D-Day) 로드
                if (currentUser.schoolName) {
                    const calQ = query(collection(db, `artifacts/imperial-clinic-v1/public/data/academic_calendars`), where('schoolName', '==', currentUser.schoolName));
                    const calSnap = await getDocs(calQ);
                    const cals = calSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    
                    // 종료일이 지나지 않은 일정 중 가장 가까운 시작일 찾기
                    const validExams = cals.filter(c => c.endDate >= todayDateStr).sort((a, b) => a.startDate.localeCompare(b.startDate));
                    
                    if (validExams.length > 0) {
                        const targetExam = validExams[0];
                        const dDay = Math.ceil((new Date(targetExam.startDate) - new Date()) / (1000 * 60 * 60 * 24));
                        
                        // D-Day가 30일 이내로 남았거나 현재 시험기간 중일 때만 노출
                        if (dDay <= 30) {
                            if (isMounted) {
                                setUpcomingExam(targetExam);
                                setDDayCount(dDay);
                            }
                        }
                    }
                }

                // 3. 백그라운드 AI 브리핑 호출
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
            <div className="flex justify-between items-end mb-6">
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

            {/* 🚀 [초강력 D-Day 배너] 시험 기간 30일 이내에만 렌더링됩니다 */}
            {upcomingExam && (
                <div className="bg-gradient-to-r from-rose-600 to-orange-500 rounded-3xl p-6 md:p-8 shadow-2xl text-white relative overflow-hidden group hover:scale-[1.01] transition-transform duration-300">
                    <div className="absolute right-0 top-0 opacity-10 translate-x-4 -translate-y-4">
                        <Flame size={180} />
                    </div>
                    
                    <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="bg-white text-rose-600 text-xs font-black px-2 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                    <Target size={14}/> 내신 초집중 모드
                                </span>
                                <span className="text-rose-100 text-sm font-bold">{upcomingExam.schoolName}</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-black mb-1">{upcomingExam.examName}</h2>
                            <p className="text-rose-100 font-bold text-sm">
                                {upcomingExam.isAttendanceExempt ? '※ 시험 집중을 위해 정규 출결이 임시 면제된 상태입니다.' : '※ 마지막까지 최선을 다해 좋은 결과를 만들어봅시다!'}
                            </p>
                        </div>

                        <div className="bg-black/20 backdrop-blur-sm rounded-2xl p-5 border border-white/20 text-center shrink-0 min-w-[140px] shadow-inner">
                            <p className="text-rose-200 text-xs font-black uppercase mb-1 tracking-widest">Countdown</p>
                            <div className="text-4xl md:text-5xl font-black text-white drop-shadow-md font-mono">
                                {dDayCount > 0 ? `D-${dDayCount}` : 'D-Day'}
                            </div>
                            {dDayCount <= 0 && <p className="text-yellow-300 text-xs font-bold mt-2 animate-pulse">🔥 현재 시험 진행 중</p>}
                        </div>
                    </div>
                </div>
            )}

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
                        <div className="absolute left-[39px] top-4 bottom-4 w-0.5 bg-slate-100"></div>
                        
                        <div className="space-y-8">
                            {todayTimeline.map((event) => (
                                <div key={event.id} className="relative flex items-start gap-6 group">
                                    <div className="w-20 shrink-0 text-right pt-1">
                                        <div className="font-black text-slate-800 text-lg">{event.startTime}</div>
                                        <div className="text-xs font-bold text-slate-400">~ {event.endTime}</div>
                                    </div>

                                    <div className={`relative z-10 w-4 h-4 rounded-full mt-2 ring-4 ring-white ${event.type === 'class' ? 'bg-blue-500' : 'bg-purple-500'}`}></div>

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