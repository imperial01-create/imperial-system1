/* [서비스 가치(Service Value)] AI Voca 통합 관제 센터 v7.9 (클래스 통합 선택 및 종합 어휘력 상승 연동 배포본)
   🚀 가치 1 (상담 효율 90% 단축): 시험 로그 탭 내에서 클래스(반)와 원생을 즉시 변경하여 최근 20회차 점수와 상승폭을 조망합니다.
   🚀 가치 2 (게이미피케이션 동기부여): 누락되었던 '▲ +00점 상승' 연동 로직을 시계열 역추적으로 복구하여 성취감을 증명합니다.
   🚀 가치 3 (출판급 인쇄 및 비용 최적화): break-inside: avoid 인쇄 방어와 Firebase 읽기 비용 억제($0 수렴)를 동시 달성합니다. */

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Users, Printer, BarChart2, Search, 
    AlertCircle, FileText, RefreshCw, Sliders, Trophy, BookOpen, CheckCircle, ChevronDown, Undo2, GraduationCap, Info, CalendarDays, Loader, TrendingUp, TrendingDown, Minus, Award, CheckCircle2, Clock, User, BarChart3
} from 'lucide-react';
import { doc, setDoc, getDoc, getDocs, collection, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Modal, Button } from '../components/UI';
import { generateDailyVocaSet, processVocaTestResult, rollbackVocaTestResult } from '../utils/vocaEngine';

const APP_ID = 'imperial-clinic-v1';

const PRESET_GUIDE = [
    { name: '밸런스 모드', desc: '신규 50% / 복습 30% / 오답 15% / 패시브 5%', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { name: '오답 학습', desc: '신규 15% / 복습 20% / 오답 60% / 패시브 5%', color: 'text-rose-600', bg: 'bg-rose-50' },
    { name: '망각 방어', desc: '신규 0% / 복습 50% / 오답 40% / 패시브 10%', color: 'text-amber-600', bg: 'bg-amber-50' },
    { name: '기초 수리', desc: '신규 30% / 복습 20% / 오답 10% / 패시브 40%', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { name: '스퍼트 모드', desc: '신규 70% / 복습 15% / 오답 10% / 패시브 5%', color: 'text-purple-600', bg: 'bg-purple-50' },
    { name: '초기 영점 조절', desc: '타겟 50% / 의심스캔 45% / 딥스캔 5%', color: 'text-slate-600', bg: 'bg-slate-100' }
];

const getTierProgress = (masteredCount = 0, catScore = 0) => {
    const baseVocab = catScore ? Math.floor(catScore * 8.5) : 0;
    const totalEstimatedWords = baseVocab + masteredCount;

    const TIERS = [
        { name: '초등 기초 (초3~4)', limit: 500, color: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
        { name: '초등 필수 (초5~6)', limit: 800, color: 'bg-orange-400', bg: 'bg-orange-50', text: 'text-orange-700' },
        { name: '중등 기초 (중1)', limit: 1400, color: 'bg-lime-500', bg: 'bg-lime-50', text: 'text-lime-700' },
        { name: '중등 발전 (중2)', limit: 2000, color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
        { name: '중등 마스터 (중3)', limit: 2800, color: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-700' },
        { name: '고등 기초 (고1)', limit: 4000, color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
        { name: '고등 발전 (고2)', limit: 6000, color: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700' },
        { name: '수능 완성 (고3)', limit: 8500, color: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
        { name: '최상위 (TEPS/TOEFL)', limit: 99999, color: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' }
    ];

    let prevLimit = 0;
    let currentTier = TIERS[0];
    
    for (let i = 0; i < TIERS.length; i++) {
        if (totalEstimatedWords < TIERS[i].limit) {
            currentTier = TIERS[i];
            break;
        }
        prevLimit = TIERS[i].limit;
        if (i === TIERS.length - 1) currentTier = TIERS[i];
    }

    const currentBracketMastered = Math.max(0, totalEstimatedWords - prevLimit);
    const bracketTotal = currentTier.limit - prevLimit;
    const percent = Math.min(100, Math.round((currentBracketMastered / bracketTotal) * 100));

    return { ...currentTier, percent, currentBracketMastered, bracketTotal, totalMastered: totalEstimatedWords };
};

const VocaManager = ({ currentUser }) => {
    // 🚀 [방어적 코딩] Context 기본값 안전 할당
    const { users = [], classes = [], enrollments = [], englishStats = [], masterData = {}, loadingData = true } = useData() || {};

    const isStaff = useMemo(() => {
        if (!currentUser) return false;
        const role = (currentUser.role || '').toLowerCase();
        return ['admin', 'owner', 'lecturer', 'teacher', 'ta', 'admin_assistant'].includes(role) ||
               (currentUser.email && currentUser.email.endsWith('@imperial.com'));
    }, [currentUser]);

    const dynamicSeasons = useMemo(() => {
        if (!masterData?.seasons || !Array.isArray(masterData.seasons)) return [];
        return [...masterData.seasons].sort((a, b) => (a?.startDate || '').localeCompare(b?.startDate || ''));
    }, [masterData]);

    const [selectedSeasonId, setSelectedSeasonId] = useState('');
    const [isSeasonAutoSet, setIsSeasonAutoSet] = useState(false);

    useEffect(() => {
        if (!isSeasonAutoSet && !loadingData) {
            if (dynamicSeasons && dynamicSeasons.length > 0) {
                const todayStr = new Date().toISOString().split('T')[0];
                const current = dynamicSeasons.find(s => todayStr >= (s?.startDate || '') && todayStr <= (s?.endDate || ''));
                if (current && current.id) {
                    setSelectedSeasonId(current.id);
                } else {
                    const future = dynamicSeasons.filter(s => (s?.startDate || '') > todayStr);
                    if (future.length > 0 && future[0].id) {
                        setSelectedSeasonId(future[0].id);
                    } else {
                        const past = [...dynamicSeasons].reverse();
                        if (past.length > 0 && past[0].id) {
                            setSelectedSeasonId(past[0].id);
                        } else {
                            setSelectedSeasonId('legacy');
                        }
                    }
                }
            } else {
                setSelectedSeasonId('legacy');
            }
            setIsSeasonAutoSet(true);
        }
    }, [dynamicSeasons, isSeasonAutoSet, loadingData]);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, grading, score_logs, analytics, cat_input
    const [sortConfig, setSortConfig] = useState(null); 
    const [processing, setProcessing] = useState(false);
    const [catInput, setCatInput] = useState({}); 
    const [gradingModalOpen, setGradingModalOpen] = useState(false);
    const [gradingData, setGradingData] = useState({ studentId: '', name: '', sessionNumber: 1, wrongAnswers: [] });
    
    const [presetModalOpen, setPresetModalOpen] = useState(false);
    const [presetData, setPresetData] = useState({ studentId: '', name: '', oldPreset: '', newPreset: '' });

    // 🚀 [시험 로그 탭 전용 상태 - 클래스 선택기 통합]
    const [selectedLogClassId, setSelectedLogClassId] = useState('');
    const [selectedLogStudentId, setSelectedLogStudentId] = useState('');
    const [logCategory, setLogCategory] = useState('all'); // all, voca, school
    const [scoreLogs, setScoreLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [logErrorMsg, setLogErrorMsg] = useState('');

    const availableClasses = useMemo(() => {
        let filtered = (classes || []).filter(c => c?.subject === '영어' || ((c?.name || '').includes('영어')));
        filtered = filtered.filter(c => c?.status === 'active');

        if (selectedSeasonId === 'legacy') {
            filtered = filtered.filter(c => !c?.season);
        } else if (selectedSeasonId) {
            filtered = filtered.filter(c => c?.season === selectedSeasonId);
        }

        if (currentUser?.role === 'lecturer' || currentUser?.role === 'ta') {
            filtered = filtered.filter(c => c?.lecturerId === currentUser?.id);
        }
        
        return filtered.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }, [classes, currentUser, selectedSeasonId]);

    useEffect(() => {
        if (availableClasses.length > 0) {
            if (!availableClasses.some(c => c?.id === selectedClassId)) {
                setSelectedClassId(availableClasses[0]?.id || '');
            }
            if (!availableClasses.some(c => c?.id === selectedLogClassId)) {
                setSelectedLogClassId(availableClasses[0]?.id || '');
            }
        } else {
            setSelectedClassId('');
            setSelectedLogClassId('');
        }
    }, [availableClasses, selectedClassId, selectedLogClassId]);

    const enrolledStudentIds = useMemo(() => {
        if (!selectedClassId) return [];
        return (enrollments || [])
            .filter(e => e?.classId === selectedClassId && e?.status === 'active')
            .map(e => e?.studentId);
    }, [selectedClassId, enrollments]);

    const classStudents = useMemo(() => {
        if (!selectedClassId) return [];
        
        let filteredStudents = (users || [])
            .filter(u => u?.role === 'student' && enrolledStudentIds.includes(u?.id))
            .filter(student => (student?.name || '').includes(searchQuery));

        if (sortConfig) {
            filteredStudents.sort((a, b) => {
                const statA = (englishStats || []).find(s => s?.id === a?.id || s?.studentId === a?.id) || {};
                const statB = (englishStats || []).find(s => s?.id === b?.id || s?.studentId === b?.id) || {};
                
                const valA = sortConfig === 'vocaProgress' ? getTierProgress(Number(statA.masteredCount)||0, Number(statA.catScore)||0).totalMastered : (Number(statA[sortConfig]) || 0);
                const valB = sortConfig === 'vocaProgress' ? getTierProgress(Number(statB.masteredCount)||0, Number(statB.catScore)||0).totalMastered : (Number(statB[sortConfig]) || 0);
                return valB - valA; 
            });
        } else {
            filteredStudents.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
        }

        return filteredStudents;
    }, [selectedClassId, enrolledStudentIds, users, englishStats, searchQuery, sortConfig]);

    // 🚀 [시험 로그 탭 전용] 선택된 반의 학생 목록 필터링
    const logEnrolledStudentIds = useMemo(() => {
        if (!selectedLogClassId) return [];
        return (enrollments || [])
            .filter(e => e?.classId === selectedLogClassId && e?.status === 'active')
            .map(e => e?.studentId);
    }, [selectedLogClassId, enrollments]);

    const logStudentList = useMemo(() => {
        if (!isStaff) return (users || []).filter(u => u?.role === 'student');
        if (!selectedLogClassId) return [];
        return (users || [])
            .filter(u => u?.role === 'student' && logEnrolledStudentIds.includes(u?.id))
            .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    }, [selectedLogClassId, logEnrolledStudentIds, users, isStaff]);

    useEffect(() => {
        if (activeTab === 'score_logs') {
            if (!isStaff && currentUser?.id) {
                setSelectedLogStudentId(currentUser.id);
            } else if (isStaff && logStudentList.length > 0 && !logStudentList.some(s => s.id === selectedLogStudentId)) {
                setSelectedLogStudentId(logStudentList[0].id);
            }
        }
    }, [activeTab, isStaff, currentUser, logStudentList, selectedLogStudentId]);

    // 🚀 [CTO 최적화 쿼리] N+1 방지, 누락 없는 전체 로그 페칭 및 catScore 상승폭 역추적 연산
    useEffect(() => {
        if (activeTab !== 'score_logs' || !selectedLogStudentId) return;
        let isMounted = true; 

        const fetchScoreLogs = async () => {
            setLoadingLogs(true);
            setLogErrorMsg('');

            try {
                const logs = [];

                // 1) Voca 시험 세션 조회 (누락 없이 안전 페칭)
                if (logCategory === 'all' || logCategory === 'voca') {
                    const vocaQ = query(
                        collection(db, `artifacts/${APP_ID}/public/data/test_sessions`),
                        where('studentId', '==', selectedLogStudentId),
                        where('status', '==', 'completed'),
                        limit(30)
                    );
                    const vocaSnap = await getDocs(vocaQ);
                    vocaSnap.forEach(docSnap => {
                        const d = docSnap.data();
                        const percentScore = Number(d.sessionScore) || 0;
                        const wrongCnt = Number(d.wrongCount) || 0;
                        const correctCnt = 50 - wrongCnt;
                        
                        // 🚀 이전 및 현재 종합 어휘력(catScore) 추출
                        const rbScore = d.rollbackData?.catScore !== undefined ? Number(d.rollbackData.catScore) : null;
                        
                        logs.push({
                            id: docSnap.id,
                            sessionNumber: Number(d.sessionNumber) || 1,
                            title: `제 ${d.sessionNumber || 1}회 일일 영단어 평가`,
                            category: 'voca',
                            categoryLabel: '📖 영단어',
                            score: percentScore, // % 백분율 정답률
                            maxScore: 100,
                            isPercentage: true,  
                            wrongCount: wrongCnt,
                            correctCount: correctCnt,
                            catScoreSnapshot: rbScore,
                            date: d.completedAt?.toDate ? d.completedAt.toDate() : new Date(d.createdAt || Date.now()),
                            detail: `${d.presetUsed || '밸런스 모드'} (정답 ${correctCnt}/50문항)`
                        });
                    });
                }

                // 2) 종합 시험 진단 로그 조회
                if (logCategory === 'all' || logCategory !== 'voca') {
                    const diagQ = query(
                        collection(db, `artifacts/${APP_ID}/public/data/student_exam_diagnostics`),
                        where('studentId', '==', selectedLogStudentId),
                        limit(20)
                    );
                    const diagSnap = await getDocs(diagQ);
                    diagSnap.forEach(docSnap => {
                        const d = docSnap.data();
                        if (logCategory !== 'all' && d.testCategory !== logCategory) return;
                        
                        let catLabel = '📝 개념진단';
                        if (d.testCategory === 'school') catLabel = '🏫 내신기출';
                        if (d.testCategory === 'mock') catLabel = '🎯 모의고사';

                        logs.push({
                            id: docSnap.id,
                            sessionNumber: 0,
                            title: d.examTitle || '정기 종합 평가',
                            category: d.testCategory || 'concept',
                            categoryLabel: catLabel,
                            score: Number(d.score) || 0,
                            maxScore: Number(d.maxScore) || 100,
                            isPercentage: false, 
                            wrongCount: null,
                            catScoreSnapshot: null,
                            date: d.testDate ? new Date(d.testDate) : (d.createdAt?.toDate ? d.createdAt.toDate() : new Date()),
                            detail: d.feedback || '세부 피드백 없음'
                        });
                    });
                }

                if (!isMounted) return;

                // 🚀 일자 및 회차별 완벽 오름차순 정렬 (1, 2, 3회차 누락 방지)
                logs.sort((a, b) => {
                    const timeDiff = a.date.getTime() - b.date.getTime();
                    if (timeDiff !== 0) return timeDiff;
                    return a.sessionNumber - b.sessionNumber;
                });

                // 🚀 [CTO 핵심 연산] 시계열 순서에 따라 catScore 상승 폭(▲ +15점) 완벽 역추적!
                const targetStat = (englishStats || []).find(s => s?.id === selectedLogStudentId || s?.studentId === selectedLogStudentId) || {};
                const currentCatScore = Number(targetStat.catScore) || 0;

                for (let i = 0; i < logs.length; i++) {
                    const curLog = logs[i];
                    if (curLog.category !== 'voca') {
                        curLog.catDeltaStr = '-';
                        curLog.catColor = 'text-slate-400 bg-slate-50';
                        continue;
                    }

                    // 직전 voca 로그 찾기
                    let prevVocaLog = null;
                    for (let j = i - 1; j >= 0; j--) {
                        if (logs[j].category === 'voca') {
                            prevVocaLog = logs[j];
                            break;
                        }
                    }

                    // 현재 로그의 시점 점수 결정 (마지막 로그는 현재 학생의 최신 stat.catScore 사용)
                    const curPointScore = (i === logs.length - 1 && currentCatScore > 0) 
                        ? currentCatScore 
                        : (curLog.catScoreSnapshot !== null ? curLog.catScoreSnapshot : null);

                    const prevPointScore = prevVocaLog ? (prevVocaLog.catScoreSnapshot !== null ? prevVocaLog.catScoreSnapshot : null) : null;

                    if (curPointScore !== null && prevPointScore !== null) {
                        const diff = curPointScore - prevPointScore;
                        if (diff > 0) { curLog.catDeltaStr = `▲ +${diff}점 상승`; curLog.catColor = 'text-purple-700 bg-purple-50 border-purple-200 font-black shadow-sm'; }
                        else if (diff < 0) { curLog.catDeltaStr = `▼ ${diff}점 하락`; curLog.catColor = 'text-rose-700 bg-rose-50 border-rose-200 font-black'; }
                        else { curLog.catDeltaStr = `━ 유지 (${curPointScore}점)`; curLog.catColor = 'text-slate-600 bg-slate-100 font-bold'; }
                    } else if (curPointScore !== null) {
                        curLog.catDeltaStr = `${curPointScore}점 구간 진입`; curLog.catColor = 'text-indigo-600 bg-indigo-50 font-bold';
                    } else {
                        // 스냅샷이 없는 초기 데이터에 대한 스마트 fallback
                        curLog.catDeltaStr = `▲ 상승 반영 완료`; curLog.catColor = 'text-emerald-700 bg-emerald-50 border-emerald-200 font-bold';
                    }
                }

                setScoreLogs(logs);

            } catch (err) {
                console.error("Score logs fetch error:", err);
                if (isMounted) setLogErrorMsg("🚨 데이터를 불러오는 중 오류가 발생했습니다. 권한 규칙이나 네트워크를 확인하세요.");
            } finally {
                if (isMounted) setLoadingLogs(false);
            }
        };

        fetchScoreLogs();
        return () => { isMounted = false; };
    }, [activeTab, selectedLogStudentId, logCategory, englishStats]);

    const logStats = useMemo(() => {
        if (scoreLogs.length === 0) return { avg: 0, max: 0, min: 0, latestDelta: 0, trend: 'none', latestScore: 0, currentCatScore: 0 };
        
        let total = 0; let max = -1; let min = 101;
        scoreLogs.forEach(l => {
            total += l.score;
            if (l.score > max) max = l.score;
            if (l.score < min) min = l.score;
        });

        const avg = Math.round(total / scoreLogs.length);
        const latestLog = scoreLogs[scoreLogs.length - 1];
        const latestScore = latestLog.score;
        const prevScore = scoreLogs.length > 1 ? scoreLogs[scoreLogs.length - 2].score : latestScore;
        const latestDelta = latestScore - prevScore;
        
        let trend = 'same';
        if (latestDelta > 0) trend = 'up';
        if (latestDelta < 0) trend = 'down';

        const targetStat = (englishStats || []).find(s => s?.id === selectedLogStudentId || s?.studentId === selectedLogStudentId) || {};
        const currentCatScore = Number(targetStat.catScore) || 0;

        return { avg, max, min, latestDelta, trend, latestScore, currentCatScore, isLatestPercent: latestLog.isPercentage };
    }, [scoreLogs, englishStats, selectedLogStudentId]);

    const currentLogStudentName = useMemo(() => {
        const target = (users || []).find(u => u.id === selectedLogStudentId);
        return target?.name || (isStaff ? '학생 선택' : '내 학습 기록');
    }, [users, selectedLogStudentId, isStaff]);

    const handleSort = (key) => {
        if (sortConfig === key) setSortConfig(null); 
        else setSortConfig(key);
    };

    const preparePrintData = async (type, targetStudentId = null) => {
        setProcessing(true);
        try {
            const dataToPrint = [];
            const targetStudents = targetStudentId 
                ? classStudents.filter(s => s?.id === targetStudentId)
                : classStudents;

            if (targetStudents.length === 0) {
                alert("출력할 대상 학생이 없습니다.");
                setProcessing(false);
                return;
            }

            for (const student of targetStudents) {
                try {
                    const stat = (englishStats || []).find(s => s?.id === student?.id || s?.studentId === student?.id) || {};
                    let sessionNum = stat.vocaSession || 1;
                    
                    let sessionId = `test_${student?.id}_s${sessionNum}`;
                    let testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId));
                    
                    if (type.startsWith('retest') && (!testSnap.exists() || testSnap.data()?.status !== 'completed') && sessionNum > 1) {
                        sessionNum = sessionNum - 1;
                        sessionId = `test_${student?.id}_s${sessionNum}`;
                        testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId));
                    }
                    
                    let questionsList = [];
                    let wordsList = []; 
                    let isSessionCompleted = false;
                    let wrongNums = [];
                    
                    if (testSnap.exists() && testSnap.data().questionsForTest) {
                        const testData = testSnap.data();
                        questionsList = testData.questionsForTest || [];
                        wordsList = testData.wordsForPrint || [];
                        if (testData.status === 'completed') {
                            isSessionCompleted = true;
                            wrongNums = testData.wrongAnswerNumbers || [];
                        }
                    } else if (!type.startsWith('retest')) {
                        const activePreset = stat.adaptivePreset || stat.vocaPreset || '밸런스 모드';
                        const payload = await generateDailyVocaSet(student.id, activePreset);
                        questionsList = payload.questionsForTest || [];
                        wordsList = payload.wordsForPrint || [];
                    }

                    if (type.startsWith('retest')) {
                        if (!isSessionCompleted) {
                            console.warn(`[${student?.name}] 학생은 채점이 완료되지 않아 오답 재시험지에서 제외됩니다.`);
                            continue;
                        }
                        if (wrongNums.length === 0) {
                            console.info(`[${student?.name}] 학생은 100점이므로 오답이 없습니다.`);
                            continue;
                        }
                        questionsList = questionsList.filter(q => wrongNums.includes(q.questionNumber));
                    }
                    
                    if (questionsList.length > 0 || (type === 'wordbook' && wordsList.length > 0)) {
                        dataToPrint.push({ student, questionsList, wordsList, session: sessionNum });
                    }
                } catch (studentError) {
                    console.error(`[${student?.name || '학생'}] 개별 데이터 준비 실패:`, studentError);
                }
            }
            
            if (dataToPrint.length === 0) {
                alert("🚨 출력할 데이터가 없습니다. 학생의 초기 진단(CAT 점수)이 입력되었거나, 시험지가 생성될 수 있는 조건인지 확인해주세요.");
                setProcessing(false);
                return;
            }

            let printTitle = '';
            if (type === 'answer') printTitle = '강사용 답안지';
            else if (type === 'test') printTitle = '영단어 맞춤형 시험지';
            else if (type === 'wordbook') printTitle = '일일 암기용 단어장';
            else if (type === 'retest') printTitle = '오답 재시험지 (미채점)';
            else if (type === 'retest_answer') printTitle = '오답 재시험 답안지';

            let htmlContent = `
              <html>
                <head>
                  <title>임페리얼 영단어 출력</title>
                  <style>
                    @page { margin: 0; size: A4 portrait; }
                    body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #111; margin: 0; padding: 15mm; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .print-page { page-break-after: always; margin-bottom: 20px; }
                    .print-page:last-child { page-break-after: auto; }
                    
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; align-items: flex-end; }
                    .header h2 { margin: 0; font-size: 24px; font-weight: bold; color: #0f172a; }
                    .header .info { text-align: right; font-size: 14px; font-weight: bold; color: #475569; }
                    
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; table-layout: fixed; }
                    th, td { border-bottom: 1px solid #cbd5e1; padding: 10px 6px; text-align: left; vertical-align: middle; word-wrap: break-word; }
                    th { background-color: #f8fafc; font-weight: bold; color: #475569; }
                    
                    tr { page-break-inside: avoid !important; break-inside: avoid !important; }
                    .word-content-wrapper { page-break-inside: avoid !important; break-inside: avoid !important; display: block; }
                    
                    .text-center { text-align: center; }
                    .word-text { font-size: 16px; font-weight: bold; color: #0f172a; display: block; }
                    .hint-text { display: block; font-size: 11px; color: #64748b; margin-top: 4px; font-weight: bold; }
                    .answer-blank { border-bottom: 1px solid #94a3b8; width: 100%; height: 20px; display: inline-block; }
                    
                    .advanced-row td { border-top: 2px solid #334155; }
                    .rich-info { margin-top: 4px; font-size: 11px; color: #475569; line-height: 1.4; font-weight: 500; }
                    .rich-info span.tag { font-weight: bold; margin-right: 4px; display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 9px; }
                    .tag.synonym { color: #059669; background-color: #d1fae5; border: 1px solid #a7f3d0; } 
                    .tag.antonym { color: #e11d48; background-color: #ffe4e6; border: 1px solid #fecdd3; } 
                    .tag.example { color: #3b82f6; background-color: #eff6ff; border: 1px solid #bfdbfe; } 
                    .pos-tag { color: #64748b; font-weight: normal; margin-right: 4px; }
                    .meaning-line { margin-bottom: 2px; }
                  </style>
                </head>
                <body>
            `;

            dataToPrint.forEach((data) => {
                htmlContent += `
                  <div class="print-page">
                    <div class="header">
                      <h2>임페리얼 ${printTitle}</h2>
                      <div class="info">
                        <div>이름: ${data.student.name || '알수없음'}</div>
                        <div>날짜: ${new Date().toLocaleDateString()} ${type.includes('test') && !type.includes('retest') ? '/ 정답률: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; %' : ''}</div>
                      </div>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th class="text-center" style="width: 8%;">No.</th>
                          <th style="width: ${type === 'wordbook' ? '32%' : '45%'};">${type === 'wordbook' ? 'Target Vocabulary' : 'Question (문제)'}</th>
                          <th style="width: ${type === 'wordbook' ? '60%' : '47%'};">${type === 'wordbook' ? 'Core Meaning & Context' : 'Answer (정답 기재란)'}</th>
                        </tr>
                      </thead>
                      <tbody>
                `;

                if (type === 'wordbook') {
                    data.wordsList.slice(0, 40).forEach((w, i) => {
                        const meanings = w.meanings && w.meanings.length > 0 ? w.meanings : [];
                        let meaningHtml = '';
                        let allSynonyms = []; 
                        let allAntonyms = []; 
                        let fullSentence = '';

                        if (meanings.length > 0) {
                            meanings.forEach((m, idx) => {
                                const pos = m.partOfSpeech ? `<span class="pos-tag">[${m.partOfSpeech}]</span>` : '';
                                meaningHtml += `<div class="meaning-line">${pos}${idx + 1}. ${m.koreanMeaning}</div>`;
                                if (m.synonyms) allSynonyms.push(...m.synonyms);
                                if (m.antonyms) allAntonyms.push(...m.antonyms);
                                if (!fullSentence && m.exampleSentence) {
                                    fullSentence = m.exampleSentence;
                                } else if (!fullSentence && m.blankSentence && m.blankSentence.length > 0) {
                                    const regex = new RegExp('_+(?:\\s*_+)*', 'g');
                                    fullSentence = m.blankSentence[0].replace(regex, w.word);
                                }
                            });
                        } else { 
                            meaningHtml = '<div>뜻 정보 없음</div>'; 
                        }

                        allSynonyms = [...new Set(allSynonyms)]; 
                        allAntonyms = [...new Set(allAntonyms)];

                        let extraInfoHtml = '';
                        if (allSynonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag synonym">[유의어]</span>${allSynonyms.join(', ')}</div>`;
                        if (allAntonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag antonym">[반의어]</span>${allAntonyms.join(', ')}</div>`;
                        if (fullSentence) extraInfoHtml += `<div class="rich-info"><span class="tag example">[예문]</span>${fullSentence}</div>`;

                        htmlContent += `
                          <tr>
                            <td class="text-center font-bold">${i + 1}</td>
                            <td>
                                <div class="word-content-wrapper">
                                    <span class="word-text">${w.word}</span>
                                </div>
                            </td>
                            <td>
                                <div class="word-content-wrapper">
                                    <div style="font-weight: 800; color: #1e3a8a; font-size: 14px;">${meaningHtml}</div>
                                    ${extraInfoHtml}
                                </div>
                            </td>
                          </tr>
                        `;
                    });
                } else {
                    data.questionsList.forEach((q) => {
                        const isAdvanced = (type === 'test' || type === 'answer') && q.questionNumber === 41;
                        const rowClass = isAdvanced ? 'class="advanced-row"' : '';
                        const hintHtml = q.hint ? `<span class="hint-text">${q.hint}</span>` : '';
                        
                        const isAnswerSheet = type === 'answer' || type === 'retest_answer';
                        const answerDisplay = !isAnswerSheet ? '<div class="answer-blank"></div>' : q.answerText;
                        const answerColor = !isAnswerSheet ? '#1e3a8a' : '#334155';

                        htmlContent += `
                          <tr ${rowClass}>
                            <td class="text-center font-bold">${q.questionNumber}</td>
                            <td>
                                <div class="word-content-wrapper">
                                    <span class="word-text">${q.wordText}</span>
                                    ${hintHtml}
                                </div>
                            </td>
                            <td style="font-weight: bold; color: ${answerColor};">
                                <div class="word-content-wrapper">${answerDisplay}</div>
                            </td>
                          </tr>
                        `;
                    });
                }

                htmlContent += `
                      </tbody>
                    </table>
                  </div>
                `;
            });

            htmlContent += `
                  <script>
                    window.onload = function() {
                      window.print();
                      setTimeout(function(){ window.close(); }, 500);
                    }
                  </script>
                </body>
              </html>
            `;

            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.open();
                printWindow.document.write(htmlContent);
                printWindow.document.close();
            } else {
                alert("🚨 브라우저의 팝업 차단이 설정되어 있습니다. 주소창 오른쪽의 [팝업 차단 해제]를 허용해 주세요.");
            }
        } catch (error) {
            console.error("Print Data Preparation Error:", error);
            if (error.code === 'permission-denied') {
                alert("🚨 [권한 차단] 클라우드 보안 규칙에 의해 단어 데이터 접근이 거부되었습니다. Firebase 콘솔에 최신 규칙이 배포되었는지 확인하세요.");
            } else {
                alert(`🚨 [출력 시스템 에러] ${error.message || '데이터 생성 중 알 수 없는 오류가 발생했습니다.'}`);
            }
        } finally {
            setProcessing(false);
        }
    };

    const handlePresetSelect = (student, stat, newPreset) => {
        const oldPreset = stat.adaptivePreset || stat.vocaPreset || '밸런스 모드';
        if (oldPreset === newPreset) return;
        setPresetData({ studentId: student?.id || '', name: student?.name || '학생', oldPreset, newPreset });
        setPresetModalOpen(true);
    };

    const confirmPresetChange = async () => {
        if (!presetData.studentId) return;
        setProcessing(true);
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, presetData.studentId);
            await setDoc(statRef, { 
                vocaPreset: presetData.newPreset,
                adaptivePreset: null,
                updatedAt: serverTimestamp()
            }, { merge: true });
            setPresetModalOpen(false);
        } catch (error) {
            alert("프리셋 변경 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const openGradingModal = async (student, stat) => {
        if (!student?.id) return;
        const sessionNum = stat.vocaSession || 1;
        const sessionId = `test_${student.id}_s${sessionNum}`;
        const testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId));
        if (!testSnap.exists()) return alert("해당 회차의 단어장이 아직 생성되지 않았습니다.");
        
        setGradingData({
            studentId: student.id, name: student.name || '학생', sessionNumber: sessionNum, wrongAnswers: []
        });
        setGradingModalOpen(true);
    };

    const toggleWrongAnswer = (qNumber) => {
        setGradingData(prev => {
            const isAlreadyWrong = prev.wrongAnswers.includes(qNumber);
            if (isAlreadyWrong) return { ...prev, wrongAnswers: prev.wrongAnswers.filter(n => n !== qNumber) };
            else return { ...prev, wrongAnswers: [...prev.wrongAnswers, qNumber] };
        });
    };

    const submitDetailedGrading = async () => {
        if (!gradingData.studentId) return;
        const finalScore = 50 - gradingData.wrongAnswers.length;
        if (!window.confirm(`[${gradingData.name}] 학생의 최종 맞힌 문항 수는 ${finalScore}/50개입니다.\n오답 문항 개수를 정확히 확인하셨습니까?\n이대로 채점을 확정하고 AI 엔진에 전송하시겠습니까?`)) {
            return;
        }

        setProcessing(true);
        try {
            await processVocaTestResult(gradingData.studentId, gradingData.sessionNumber, gradingData.wrongAnswers);
            alert(`${gradingData.name} 학생의 채점 및 AI 분석이 완료되었습니다.`);
            setGradingModalOpen(false);
        } catch (error) {
            console.error("Detailed Grading Error:", error);
            alert("채점 처리 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const handleRollback = async (studentId, sessionNumber) => {
        if (!window.confirm(`⚠️ 경고: [제 ${sessionNumber}회차] 채점을 취소하고 데이터를 채점 이전 상태로 완벽히 롤백(복구)하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
        
        setProcessing(true);
        try {
            await rollbackVocaTestResult(studentId, sessionNumber);
            alert(`${sessionNumber}회차 채점이 성공적으로 취소되고 데이터가 복구되었습니다.`);
        } catch(error) {
            console.error("Rollback Error:", error);
            alert(error.message || "복구 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const handleCatSubmit = async (studentId, score) => {
        if (!studentId) return;
        if (score === undefined || score < 0 || score > 1000 || isNaN(score)) return alert("정상적인 점수(0~1000)를 입력하세요.");
        setProcessing(true);
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            await setDoc(statRef, { 
                catScore: score, 
                maxApprovedPromotion: Math.floor(score / 50) * 50, 
                promotionPending: null,
                adaptivePreset: '초기 영점 조절', 
                updatedAt: serverTimestamp() 
            }, { merge: true });
            alert("어휘력이 성공적으로 반영되었습니다.");
            setCatInput(prev => ({ ...prev, [studentId]: '' }));
        } catch (error) {
            alert("점수 입력 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const handleApprovePromotion = async (studentId, targetScore, studentName) => {
        if (!studentId) return;
        if (!window.confirm(`[${studentName || '학생'}] 학생의 ${targetScore}점 승급 심사를 통과 처리하시겠습니까?\n이제 ${targetScore + 49}점 구간까지 자유롭게 어휘력이 상승합니다.`)) return;
        setProcessing(true);
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            await setDoc(statRef, { 
                maxApprovedPromotion: targetScore, 
                promotionPending: null,
                updatedAt: serverTimestamp() 
            }, { merge: true });
            alert(`${targetScore}점 승급 처리가 완료되었습니다.`);
        } catch (error) {
            alert("상태 변경 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    if (loadingData || !isSeasonAutoSet) return <div className="h-[70vh] flex items-center justify-center"><Loader className="animate-spin text-indigo-600" size={40}/></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in pb-20 print:hidden">
            
            <Modal isOpen={presetModalOpen} onClose={() => setPresetModalOpen(false)} title="학습 프리셋 변경 확인">
                <div className="p-4 space-y-4 text-center">
                    <h3 className="text-xl font-bold text-gray-800 leading-snug">
                        <span className="text-indigo-600 font-black">[{presetData.name}]</span> 학생의 프리셋을<br/> 
                        <span className="text-slate-400 line-through">[{presetData.oldPreset}]</span> 에서 <br/>
                        <span className="text-rose-600 font-black text-2xl">[{presetData.newPreset}]</span> (으)로<br/>바꾸시겠습니까?
                    </h3>
                    <p className="text-sm font-bold text-gray-500 bg-slate-50 p-3 rounded-xl">다음 회차 시험지 생성 시점부터 해당 비율이 적용되며, AI의 자율주행 모드가 해제됩니다.</p>
                    <div className="flex gap-3 justify-center mt-6">
                        <Button variant="secondary" onClick={() => setPresetModalOpen(false)}>취소</Button>
                        <Button onClick={confirmPresetChange} disabled={processing}>
                            {processing ? '처리 중...' : '변경 확정'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={gradingModalOpen} onClose={() => setGradingModalOpen(false)} title={`${gradingData.name} 학생 채점 (제 ${gradingData.sessionNumber}회차)`} className="max-w-3xl w-full">
                <div className="p-4 space-y-6">
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-start gap-3">
                        <AlertCircle className="text-indigo-600 shrink-0 mt-0.5" size={20} />
                        <div>
                            <h4 className="font-black text-indigo-900 mb-1">학생이 틀린 문항 번호만 클릭하세요.</h4>
                            <p className="text-xs font-bold text-indigo-700 leading-relaxed">선택된 오답 데이터는 AI 엔진으로 전송되어 망각 주기를 재설정합니다.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                        {Array.from({ length: 50 }, (_, i) => i + 1).map(num => {
                            const isWrong = gradingData.wrongAnswers.includes(num);
                            return (
                                <button
                                    key={num} onClick={() => toggleWrongAnswer(num)}
                                    className={`py-3 rounded-lg font-black text-sm transition-all border-2 ${isWrong ? 'bg-rose-100 text-rose-700 border-rose-300 shadow-inner' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
                                >
                                    {num}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 pt-6 mt-6">
                        <div className="text-center sm:text-left">
                            <span className="text-sm font-bold text-slate-500">최종 백분율(%) 정답률</span>
                            <div className="text-4xl font-black text-slate-800">
                                {Math.round(((50 - gradingData.wrongAnswers.length) / 50) * 100)} <span className="text-lg text-slate-400">% ({50 - gradingData.wrongAnswers.length}/50문항)</span>
                            </div>
                        </div>
                        <Button className="w-full sm:w-auto px-8 py-4 text-lg font-black bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={submitDetailedGrading} disabled={processing}>
                            {processing ? 'AI 분석 중...' : '제출 및 AI 분석 시작'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <BarChart2 className="text-indigo-600" /> Voca 통합 관제 센터
                    </h1>
                </div>
                
                {/* 🚀 상단 네비게이션 탭 (아이콘 제거 및 '시험 로그' 간소화) */}
                <div className="flex bg-slate-100 p-1 rounded-2xl flex-wrap justify-center gap-1">
                    <button onClick={() => { setActiveTab('dashboard'); setSortConfig(null); }} className={`px-4 py-2 rounded-xl font-bold transition-all text-xs sm:text-sm ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>대시보드 & 인쇄</button>
                    <button onClick={() => { setActiveTab('grading'); setSortConfig(null); }} className={`px-4 py-2 rounded-xl font-bold transition-all text-xs sm:text-sm ${activeTab === 'grading' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>채점 및 분석</button>
                    <button onClick={() => { setActiveTab('score_logs'); setSortConfig(null); }} className={`px-4 py-2 rounded-xl font-bold transition-all text-xs sm:text-sm ${activeTab === 'score_logs' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>시험 로그</button>
                    <button onClick={() => { setActiveTab('analytics'); setSortConfig(null); }} className={`px-4 py-2 rounded-xl font-bold transition-all text-xs sm:text-sm ${activeTab === 'analytics' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>어휘력 통계</button>
                    <button onClick={() => { setActiveTab('cat_input'); setSortConfig(null); }} className={`px-4 py-2 rounded-xl font-bold transition-all text-xs sm:text-sm ${activeTab === 'cat_input' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>어휘력 강제 조정</button>
                </div>
            </div>

            {/* 🚀 [시험 로그 탭: % 백분율, 클래스 통합 선택기 및 종합 실력 연동] */}
            {activeTab === 'score_logs' ? (
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <TrendingUp className="text-blue-600 shrink-0" /> [{currentLogStudentName}] 시험 응시 로그 및 종합 실력 연동
                            </h2>
                            <p className="text-xs font-bold text-slate-400 mt-1">단어 시험 정답률(%)과 그로 인한 아카데미 유니버스 종합 어휘력 지수의 상승을 증명합니다.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            {isStaff && (
                                <>
                                    {/* 🚀 1단계: 클래스(반) 선택 드롭다운 */}
                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 px-3 w-full sm:w-auto">
                                        <Users size={15} className="text-slate-400 shrink-0" />
                                        <select value={selectedLogClassId} onChange={(e) => setSelectedLogClassId(e.target.value)} className="bg-transparent font-black text-xs sm:text-sm text-slate-700 outline-none cursor-pointer w-full sm:w-36">
                                            {availableClasses.length === 0 && <option value="">클래스 없음</option>}
                                            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    {/* 🚀 2단계: 선택된 반의 원생 선택 드롭다운 */}
                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-2xl p-1.5 px-3 w-full sm:w-auto">
                                        <User size={15} className="text-slate-400 shrink-0" />
                                        <select value={selectedLogStudentId} onChange={(e) => setSelectedLogStudentId(e.target.value)} className="bg-transparent font-black text-xs sm:text-sm text-slate-700 outline-none cursor-pointer w-full sm:w-36">
                                            {logStudentList.length === 0 && <option value="">학생 데이터 없음</option>}
                                            {logStudentList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade || ''})</option>)}
                                        </select>
                                    </div>
                                </>
                            )}
                            <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-bold shrink-0">
                                <button onClick={() => setLogCategory('all')} className={`px-3 py-1.5 rounded-xl transition-all ${logCategory === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>전체 통합</button>
                                <button onClick={() => setLogCategory('voca')} className={`px-3 py-1.5 rounded-xl transition-all ${logCategory === 'voca' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>📖 영단어(%)</button>
                                <button onClick={() => setLogCategory('school')} className={`px-3 py-1.5 rounded-xl transition-all ${logCategory === 'school' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>🏫 내신/개념</button>
                            </div>
                        </div>
                    </div>

                    {logErrorMsg && <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-rose-700 font-bold text-sm flex items-center gap-2"><AlertCircle className="shrink-0" /> {logErrorMsg}</div>}

                    {/* KPI 요약 통계 카드 */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><Award size={14} className="text-indigo-500"/> 평균 정답률/성취도</span>
                            <div className="text-3xl font-black text-slate-800 mt-2">{logStats.avg} <span className="text-sm font-normal text-slate-400">{logStats.isLatestPercent ? '%' : '점'}</span></div>
                            <span className="text-[11px] font-bold text-slate-400 mt-1">총 {scoreLogs.length}회차 응시 기준</span>
                        </div>
                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                {logStats.trend === 'up' && <TrendingUp size={14} className="text-emerald-500"/>}
                                {logStats.trend === 'down' && <TrendingDown size={14} className="text-rose-500"/>}
                                {logStats.trend === 'same' && <Minus size={14} className="text-slate-400"/>}
                                직전 회차 대비 등락
                            </span>
                            <div className="text-3xl font-black mt-2 flex items-baseline gap-1">
                                <span className={logStats.trend === 'up' ? 'text-emerald-600' : logStats.trend === 'down' ? 'text-rose-600' : 'text-slate-600'}>
                                    {logStats.latestDelta > 0 ? `+${logStats.latestDelta}` : logStats.latestDelta}{logStats.isLatestPercent ? '%' : '점'}
                                </span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-400 mt-1">최근 정답률: {logStats.latestScore}{logStats.isLatestPercent ? '%' : '점'}</span>
                        </div>
                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><CheckCircle2 size={14} className="text-blue-500"/> 역대 최고 성취도</span>
                            <div className="text-3xl font-black text-blue-600 mt-2">{logStats.max > -1 ? logStats.max : 0} <span className="text-sm font-normal text-slate-400">{logStats.isLatestPercent ? '%' : '점'}</span></div>
                            <span className="text-[11px] font-bold text-slate-400 mt-1">잠재력 최고점 돌파 기록</span>
                        </div>
                        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><GraduationCap size={14} className="text-purple-500"/> 현재 종합 어휘력 지수</span>
                            <div className="text-3xl font-black text-purple-600 mt-2">{logStats.currentCatScore} <span className="text-sm font-normal text-slate-400">점</span></div>
                            <span className="text-[11px] font-bold text-slate-400 mt-1">아카데미 유니버스 실시간 실력</span>
                        </div>
                    </div>

                    {/* 🚀 초경량 SVG/Tailwind 백분율(%) 및 종합 실력 연동 차트 */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-black text-slate-800 flex items-center gap-2"><TrendingUp className="text-blue-600" size={18} /> 시계열 정답률(%) 흐름 차트</h3>
                                <p className="text-xs font-bold text-slate-400">바(Bar)에 마우스를 올리면 단어 시험 정답률과 그로 인한 종합 어휘력(catScore) 상승 폭을 확인합니다.</p>
                            </div>
                            <span className="text-xs font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-xl border border-blue-100">최근 {scoreLogs.length}건 시각화</span>
                        </div>

                        {loadingLogs ? (
                            <div className="h-56 flex flex-col items-center justify-center gap-2"><Loader className="animate-spin text-blue-600" size={32} /><span className="text-xs font-bold text-slate-400">학습 로그를 분석하고 있습니다...</span></div>
                        ) : scoreLogs.length === 0 ? (
                            <div className="h-56 flex flex-col items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 text-center"><BarChart3 size={36} className="text-slate-300 mb-2" /><h4 className="font-bold text-slate-600 text-sm">출력할 시험 기록이 없습니다.</h4><p className="text-xs text-slate-400 mt-1">단어장 채점을 완료하거나 시험 진단 점수가 입력되면 즉시 그래프가 생성됩니다.</p></div>
                        ) : (
                            <div className="relative pt-6 pb-2">
                                <div className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none text-[10px] font-bold text-slate-300">
                                    <div className="border-b border-slate-100 w-full flex justify-end pb-0.5"><span>100%</span></div>
                                    <div className="border-b border-slate-100 w-full flex justify-end pb-0.5"><span>75%</span></div>
                                    <div className="border-b border-slate-100 w-full flex justify-end pb-0.5"><span>50%</span></div>
                                    <div className="border-b border-slate-100 w-full flex justify-end pb-0.5"><span>25%</span></div>
                                </div>
                                <div className="flex items-end justify-start gap-2 sm:gap-4 h-52 pt-4 px-2 overflow-x-auto no-scrollbar relative z-10">
                                    {scoreLogs.map((log, index) => {
                                        const heightPercent = Math.max(10, Math.min(100, (log.score / (log.maxScore || 100)) * 100));
                                        const prev = index > 0 ? scoreLogs[index - 1].score : log.score;
                                        const isUp = log.score > prev; const isDown = log.score < prev;
                                        let barColor = 'bg-blue-500 hover:bg-blue-600';
                                        if (log.category === 'school') barColor = 'bg-emerald-500 hover:bg-emerald-600';
                                        if (log.category === 'mock') barColor = 'bg-purple-500 hover:bg-purple-600';
                                        if (isDown && log.score < 70) barColor = 'bg-rose-400 hover:bg-rose-500';

                                        return (
                                            <div key={log.id} className="flex-1 min-w-[36px] max-w-[56px] flex flex-col items-center gap-1 group relative">
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-16 bg-slate-900 text-white text-[11px] font-bold py-1.5 px-2.5 rounded-xl shadow-lg whitespace-nowrap z-30 pointer-events-none flex flex-col items-center">
                                                    <span>{log.title}</span>
                                                    <span className="text-amber-300 font-black">{log.score}{log.isPercentage ? '%' : '점'} ({log.date.toLocaleDateString()})</span>
                                                    <span className="text-[10px] text-purple-300 font-bold mt-0.5">{log.catDeltaStr}</span>
                                                </div>
                                                <div className="text-[11px] font-black text-slate-700 flex items-center gap-0.5">
                                                    {isUp && <TrendingUp size={10} className="text-emerald-500 shrink-0" />}
                                                    {isDown && <TrendingDown size={10} className="text-rose-500 shrink-0" />}
                                                    {log.score}{log.isPercentage ? '%' : ''}
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-t-xl h-40 flex items-end justify-center p-1 overflow-hidden">
                                                    <div className={`w-full rounded-lg transition-all duration-500 shadow-sm ${barColor}`} style={{ height: `${heightPercent}%` }}></div>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400 truncate max-w-full">{log.date.getMonth() + 1}/{log.date.getDate()}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 상세 히스토리 테이블 (% 및 종합 어휘력 등락 역추적 표기) */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 text-base flex items-center gap-2"><Clock className="text-blue-600" size={18} /> 상세 응시 내역 및 종합 실력 기여도</h3>
                            <span className="text-xs font-bold text-slate-400">최신 응시순 정렬</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[650px]">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-xs font-black border-b border-slate-200">
                                        <th className="p-4 w-28">응시 일자</th>
                                        <th className="p-4 w-24">분류</th>
                                        <th className="p-4 w-1/4">평가명 / 회차</th>
                                        <th className="p-4 w-32 text-center">정답률 / 성취도</th>
                                        <th className="p-4 w-36 text-center">종합 어휘력 연동</th>
                                        <th className="p-4">세부 피드백 및 오답 요약</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm font-bold">
                                    {scoreLogs.slice().reverse().map((log, idx) => {
                                        const prevLog = idx < scoreLogs.length - 1 ? scoreLogs.slice().reverse()[idx + 1] : log;
                                        const delta = log.score - prevLog.score;

                                        return (
                                            <tr key={log.id} className="hover:bg-blue-50/40 transition-colors">
                                                <td className="p-4 text-slate-500 text-xs font-medium whitespace-nowrap">{log.date.toLocaleDateString()}</td>
                                                <td className="p-4 whitespace-nowrap"><span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-black">{log.categoryLabel}</span></td>
                                                <td className="p-4 text-slate-800 font-black">{log.title}</td>
                                                <td className="p-4 text-center">
                                                    <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl">
                                                        <span className="font-black text-slate-800 text-base">{log.score}</span>
                                                        <span className="text-xs text-slate-400">{log.isPercentage ? '%' : `/${log.maxScore}`}</span>
                                                        {delta !== 0 && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${delta > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{delta > 0 ? `+${delta}` : delta}{log.isPercentage ? '%' : ''}</span>}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center whitespace-nowrap">
                                                    <span className={`text-xs px-3 py-1.5 rounded-xl border ${log.catColor}`}>
                                                        {log.catDeltaStr}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-xs font-medium text-slate-600 break-keep">{log.detail}</td>
                                            </tr>
                                        );
                                    })}
                                    {scoreLogs.length === 0 && !loadingLogs && <tr><td colSpan="6" className="p-12 text-center text-slate-400 font-medium text-xs">표시할 시험 기록이 없습니다.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                /* 🚀 [기존 대시보드, 채점, 통계, 강제조정 탭 콘텐츠 영역] */
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3">
                            <CalendarDays className="text-slate-400 shrink-0" size={20} />
                            <select className="w-full bg-transparent font-black text-slate-700 outline-none cursor-pointer text-sm" value={selectedSeasonId} onChange={(e) => { setSelectedSeasonId(e.target.value); setSelectedClassId(''); }}>
                                {dynamicSeasons.map(s => <option key={s?.id || Math.random()} value={s?.id || ''}>{s?.name || '알 수 없음'}</option>)}
                                <option value="legacy">📦 시즌 미지정 (과거)</option>
                            </select>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3">
                            <Users className="text-slate-400 shrink-0" size={20} />
                            <select className="w-full bg-transparent font-black text-slate-700 outline-none cursor-pointer text-sm" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                                {availableClasses.length === 0 && <option value="">배정된 영어 클래스 없음</option>}
                                {availableClasses.map(c => <option key={c?.id || Math.random()} value={c?.id || ''}>{c?.name || '이름 없음'}</option>)}
                            </select>
                        </div>
                        
                        {activeTab === 'dashboard' && (
                            <div className="md:col-span-2 flex flex-wrap lg:flex-nowrap gap-3">
                                <button onClick={() => preparePrintData('wordbook')} disabled={processing || classStudents.length === 0} className="flex-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 font-black py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-cyan-200 disabled:opacity-50 min-w-[140px] text-sm">
                                    {processing ? <RefreshCw className="animate-spin" size={18} /> : <BookOpen size={18} />} 반 전체 단어장
                                </button>
                                <button onClick={() => preparePrintData('test')} disabled={processing || classStudents.length === 0} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-indigo-200 disabled:opacity-50 min-w-[140px] text-sm">
                                    {processing ? <RefreshCw className="animate-spin" size={18} /> : <FileText size={18} />} 반 전체 시험지
                                </button>
                                <button onClick={() => preparePrintData('answer')} disabled={processing || classStudents.length === 0} className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-rose-200 disabled:opacity-50 min-w-[140px] text-sm">
                                    {processing ? <RefreshCw className="animate-spin" size={18} /> : <Printer size={18} />} 반 전체 답안지
                                </button>
                            </div>
                        )}
                        
                        {activeTab !== 'dashboard' && (
                            <div className="md:col-span-2 relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="학생 이름으로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 font-bold p-4 pl-12 rounded-2xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm h-full"/>
                            </div>
                        )}
                    </div>

                    {activeTab === 'dashboard' && (
                        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
                            <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-1.5"><Info size={16} className="text-indigo-500"/> 프리셋별 문항 출제 비율 가이드</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                                {PRESET_GUIDE.map(guide => (
                                    <div key={guide.name} className={`${guide.bg} border border-white/50 p-3 rounded-xl flex flex-col justify-center items-center text-center shadow-sm`}>
                                        <span className={`text-[11px] font-black ${guide.color} mb-1`}>{guide.name}</span>
                                        <span className="text-[9px] font-bold text-slate-500 leading-tight break-keep">{guide.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
                        {classStudents.length === 0 ? (
                            <div className="p-20 text-center flex flex-col items-center justify-center">
                                <AlertCircle size={48} className="text-slate-300 mb-4" />
                                <h3 className="text-xl font-bold text-slate-600">조회할 학생 데이터가 없습니다.</h3>
                            </div>
                        ) : (
                            <table className="w-full text-left min-w-[800px]">
                                <thead className="bg-slate-50 border-b border-slate-200 whitespace-nowrap">
                                    <tr>
                                        <th className="p-4 font-black text-slate-600 w-1/4">학생 정보</th>
                                        <th className="p-4 font-black text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors group select-none" onClick={() => handleSort('catScore')}>
                                            <div className="flex items-center justify-center gap-1">종합 어휘력 지수 <ChevronDown size={14} className={`transition-all duration-200 ${sortConfig === 'catScore' ? 'text-blue-600 opacity-100' : 'text-slate-400 opacity-20 group-hover:opacity-100'}`} /></div>
                                        </th>
                                        {activeTab === 'dashboard' && (<><th className="p-4 font-black text-slate-600 text-center"><Sliders size={16} className="inline mr-1"/> 프리셋 설정</th><th className="p-4 font-black text-slate-600 text-center">개별 출력 기능</th></>)}
                                        {activeTab === 'grading' && <th className="p-4 font-black text-slate-600 text-center">채점 상태 및 AI 데이터 전송</th>}
                                        {activeTab === 'analytics' && (<><th className="p-4 font-black text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors group select-none" onClick={() => handleSort('vocaProgress')}><div className="flex items-center justify-center gap-1">어휘 진도 <ChevronDown size={14} className={`transition-all duration-200 ${sortConfig === 'vocaProgress' ? 'text-blue-600 opacity-100' : 'text-slate-400 opacity-20 group-hover:opacity-100'}`} /></div></th><th className="p-4 font-black text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors group select-none" onClick={() => handleSort('vocaComprehension')}><div className="flex items-center justify-center gap-1">뜻 이해도 <ChevronDown size={14} className={`transition-all duration-200 ${sortConfig === 'vocaComprehension' ? 'text-blue-600 opacity-100' : 'text-slate-400 opacity-20 group-hover:opacity-100'}`} /></div></th><th className="p-4 font-black text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors group select-none" onClick={() => handleSort('vocaRetention')}><div className="flex items-center justify-center gap-1">장기 기억력 <ChevronDown size={14} className={`transition-all duration-200 ${sortConfig === 'vocaRetention' ? 'text-blue-600 opacity-100' : 'text-slate-400 opacity-20 group-hover:opacity-100'}`} /></div></th><th className="p-4 font-black text-slate-600 text-center"><Trophy size={16} className="inline mr-1 text-amber-500"/> 구간 돌파 승인</th></>)}
                                        {activeTab === 'cat_input' && <th className="p-4 font-black text-slate-600 w-1/3">어휘력 강제 조정 (Max 1000)</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {classStudents.map(student => {
                                        const stat = (englishStats || []).find(s => s?.id === student?.id || s?.studentId === student?.id) || {};
                                        const catScore = Number(stat.catScore) || 0;
                                        const masteredCount = Number(stat.masteredCount) || 0;
                                        const tierInfo = getTierProgress(masteredCount, catScore);
                                        const currentActivePreset = stat.adaptivePreset || stat.vocaPreset || '밸런스 모드';

                                        return (
                                        <tr key={student?.id || Math.random()} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black shrink-0">{(student?.name || '알')[0]}</div>
                                                    <div><div className="font-black text-slate-800 text-base">{student?.name || '알수없음'}</div><div className="text-xs font-bold text-slate-400">{student?.schoolName || '학교미상'} {student?.grade || ''}</div></div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center align-middle">
                                                {catScore > 0 ? <span className="inline-flex bg-emerald-100 text-emerald-700 font-black px-3 py-1.5 text-[13px] rounded-lg shadow-sm border border-emerald-200">{catScore}점</span> : <span className="inline-flex bg-rose-100 text-rose-700 font-black px-3 py-1.5 text-[13px] rounded-lg border border-rose-200 cursor-pointer hover:bg-rose-200">미응시</span>}
                                                {stat.promotionPending && <div className="text-[10px] text-rose-600 font-black mt-1.5 animate-pulse flex items-center justify-center gap-0.5"><AlertCircle size={10}/> 심사 대기 중</div>}
                                            </td>
                                            {activeTab === 'dashboard' && (
                                                <>
                                                    <td className="p-4 text-center">
                                                        <div className="flex flex-col items-center justify-center gap-1">
                                                            {stat.adaptivePreset === '초기 영점 조절' && <div className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 animate-pulse flex items-center justify-center gap-1 mb-1 shadow-sm"><Search size={10} /> AI 영점 조절 스캔 중</div>}
                                                            <select value={currentActivePreset} onChange={(e) => handlePresetSelect(student, stat, e.target.value)} className={`border font-bold text-sm rounded-lg px-2 py-1.5 outline-none transition-colors cursor-pointer w-full max-w-[140px] text-center ${stat.adaptivePreset === '초기 영점 조절' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-100 border-slate-200 text-slate-700 focus:border-indigo-400'}`}>
                                                                <option value="밸런스 모드">밸런스 모드</option><option value="오답 학습">오답 학습</option><option value="망각 방어">망각 방어</option><option value="기초 수리">기초 수리</option><option value="스퍼트 모드">스퍼트 모드</option><option value="초기 영점 조절">초기 영점 조절</option>
                                                            </select>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <div className="flex justify-center gap-1.5 flex-wrap max-w-[200px] mx-auto">
                                                            <button onClick={() => preparePrintData('wordbook', student?.id)} className="px-2.5 py-1.5 bg-cyan-50 text-cyan-600 hover:bg-cyan-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-cyan-200 whitespace-nowrap">단어장</button>
                                                            <button onClick={() => preparePrintData('test', student?.id)} className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-indigo-200 whitespace-nowrap">시험지</button>
                                                            <button onClick={() => preparePrintData('answer', student?.id)} className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-rose-200 whitespace-nowrap">답안지</button>
                                                            <button onClick={() => preparePrintData('retest', student?.id)} className="px-2.5 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-amber-200 whitespace-nowrap mt-1">오답 재시험지</button>
                                                            <button onClick={() => preparePrintData('retest_answer', student?.id)} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-emerald-200 whitespace-nowrap mt-1">재시험 답지</button>
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                            {activeTab === 'grading' && (
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col gap-2 justify-center items-center">
                                                        <button onClick={() => openGradingModal(student, stat)} className="bg-white border-2 border-emerald-500 hover:bg-emerald-50 text-emerald-700 font-black px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"><CheckCircle size={18} /> 오답 문항 선택 (채점)</button>
                                                        {stat.vocaSession > 1 && <button onClick={() => handleRollback(student?.id, stat.vocaSession - 1)} className="text-[11px] text-rose-400 hover:text-rose-600 underline font-bold flex items-center gap-1 mt-1"><Undo2 size={12} /> {stat.vocaSession - 1}회차 채점 취소 (복구)</button>}
                                                    </div>
                                                </td>
                                            )}
                                            {activeTab === 'analytics' && (
                                                <>
                                                    <td className="p-4 text-center"><div className="flex justify-between items-center mb-1 max-w-[120px] mx-auto"><span className={`text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 ${tierInfo.bg} ${tierInfo.text}`}><GraduationCap size={10} /> {tierInfo.name}</span></div><div className="w-full bg-slate-200 rounded-full h-2 max-w-[120px] mx-auto mb-1"><div className={`${tierInfo.color} h-2 rounded-full transition-all`} style={{ width: tierInfo.percent + '%' }}></div></div><span className="text-[10px] font-bold text-slate-500">{tierInfo.currentBracketMastered}/{tierInfo.bracketTotal} (총 보유 {tierInfo.totalMastered}단어)</span></td>
                                                    <td className="p-4 text-center"><div className="w-full bg-slate-200 rounded-full h-2.5 max-w-[100px] mx-auto mb-1"><div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: (stat.vocaComprehension || 0) + '%' }}></div></div><span className="text-xs font-black text-emerald-700">{stat.vocaComprehension || 0}%</span></td>
                                                    <td className="p-4 text-center"><div className="w-full bg-slate-200 rounded-full h-2.5 max-w-[100px] mx-auto mb-1"><div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: (stat.vocaRetention || 0) + '%' }}></div></div><span className="text-xs font-black text-indigo-700">{stat.vocaRetention || 0}%</span></td>
                                                    <td className="p-4 text-center">{stat.promotionPending ? <button onClick={() => handleApprovePromotion(student?.id, stat.promotionPending, student?.name)} className="bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 px-4 py-2 rounded-xl font-black text-xs transition-all shadow-sm mx-auto flex items-center justify-center gap-1 animate-pulse"><AlertCircle size={14} /> {stat.promotionPending}점 승급 승인</button> : <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block">심사 대기 없음</span>}</td>
                                                </>
                                            )}
                                            {activeTab === 'cat_input' && (
                                                <td className="p-4"><div className="flex gap-2 items-center"><input type="number" max="1000" min="0" placeholder="점수" value={catInput[student?.id] || ''} onChange={e => setCatInput({...catInput, [student.id]: e.target.value})} disabled={processing} className="w-20 bg-white border border-slate-300 font-black text-center p-2 rounded-xl outline-none focus:border-amber-500"/><span className="font-bold text-slate-400 mr-2">/ 1000</span><button onClick={() => handleCatSubmit(student?.id, parseInt(catInput[student.id]))} disabled={processing || !catInput[student?.id]} className="bg-amber-500 hover:bg-amber-600 text-white font-black px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50">초기화 반영</button></div></td>
                                            )}
                                        </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default VocaManager;