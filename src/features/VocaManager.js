/* [서비스 가치(Service Value)] AI Voca 통합 관제 센터 v3.2
   운영자 관점: 단순 점수 입력을 넘어 반별 시험지 일괄 출력, 고속 채점, 학생별 어휘력 분석을 원스톱으로 제공합니다.
   비용 및 성능 최적화: DataContext에 누락된 english_stats 데이터를 컴포넌트 내부에서 직접 실시간(Real-time) 구독하여, 
   점수 입력 즉시 화면에 렌더링되도록 결함을 완벽히 패치했습니다. 강사의 중복 입력 실수를 원천 차단합니다. */
import React, { useState, useMemo, useEffect } from 'react';
import { 
    Users, Printer, BarChart2, Search, 
    AlertCircle, FileText, RefreshCw, Sliders, Trophy, BookOpen
} from 'lucide-react';
import { collection, doc, updateDoc, setDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Badge } from '../components/UI';
import { generateDailyVocaSet } from '../utils/vocaEngine';

const APP_ID = 'imperial-clinic-v1';

const VocaManager = ({ currentUser }) => {
    const { users, classes, enrollments } = useData();
    
    // 🚀 [CTO 핵심 패치] DataContext에 누락된 english_stats를 로컬에서 실시간으로 직접 가져옵니다.
    const [localEnglishStats, setLocalEnglishStats] = useState([]);

    useEffect(() => {
        const statsRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats`);
        const unsubscribe = onSnapshot(statsRef, (snapshot) => {
            const statsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLocalEnglishStats(statsData);
        });
        
        // 컴포넌트 언마운트 시 메모리 누수 방지
        return () => unsubscribe();
    }, []);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, grading, analytics, cat_input
    
    const [processing, setProcessing] = useState(false);
    const [gradeInput, setGradeInput] = useState({}); 
    const [catInput, setCatInput] = useState({}); 

    // 영어 과목 전용 클래스 필터링 & 정확한 강사 매핑
    const availableClasses = useMemo(() => {
        let filtered = classes.filter(c => c.subject === '영어' || (c.name && c.name.includes('영어')));
        if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
            filtered = filtered.filter(c => c.lecturerId === currentUser.id);
        }
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }, [classes, currentUser]);

    useEffect(() => {
        if (availableClasses.length > 0 && !selectedClassId) {
            setSelectedClassId(availableClasses[0].id);
        }
    }, [availableClasses, selectedClassId]);

    // 선택된 반의 학생 데이터 결합 (실시간 스탯 연동)
    const classStudents = useMemo(() => {
        if (!selectedClassId) return [];
        const enrolledStudentIds = enrollments
            .filter(e => e.classId === selectedClassId && e.status === 'active')
            .map(e => e.studentId);

        return users
            .filter(u => u.role === 'student' && enrolledStudentIds.includes(u.id)) // userId 대신 id 매핑으로 안전성 보장
            .map(student => {
                const stat = localEnglishStats.find(s => s.id === student.id) || { 
                    catScore: null, vocaSession: 1, totalWords: 0, accuracy: 0, vocaPreset: '밸런스 모드',
                    passedMockExam400: false, passedMockExam700: false
                };
                return { ...student, stat: { ...stat, vocaPreset: stat.vocaPreset || '밸런스 모드' } };
            })
            .filter(student => student.name.includes(searchQuery))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [selectedClassId, enrollments, users, localEnglishStats, searchQuery]);

    // =====================================================================
    // 🚀 [인쇄 최적화 엔진] Native HTML Injection 방식 (+ 단어장 모드 추가)
    // =====================================================================
    const preparePrintData = async (type, targetStudentId = null) => {
        setProcessing(true);
        try {
            const dataToPrint = [];
            const targetStudents = targetStudentId 
                ? classStudents.filter(s => s.id === targetStudentId)
                : classStudents;

            for (const student of targetStudents) {
                const sessionId = `test_${student.id}_s${student.stat.vocaSession || 1}`;
                const testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId));
                
                let questionsList = [];
                if (testSnap.exists() && testSnap.data().questionsForTest) {
                    questionsList = testSnap.data().questionsForTest;
                } else if (student.stat.catScore) {
                    const payload = await generateDailyVocaSet(student.id, student.stat.vocaPreset);
                    questionsList = payload.questionsForTest;
                }
                
                if (questionsList.length > 0) {
                    dataToPrint.push({ student, questionsList, session: student.stat.vocaSession || 1 });
                }
            }
            
            if (dataToPrint.length === 0) {
                alert("출력할 수 있는 데이터가 없습니다. (어휘력이 입력되었는지 확인하세요)");
                setProcessing(false);
                return;
            }

            let printTitle = '';
            if (type === 'answer') printTitle = '강사용 답안지';
            else if (type === 'test') printTitle = '영단어 맞춤형 시험지';
            else if (type === 'wordbook') printTitle = '일일 암기용 단어장';

            let htmlContent = `
              <html>
                <head>
                  <title>임페리얼 영단어 일괄 출력</title>
                  <style>
                    @page { margin: 15mm; size: A4 portrait; }
                    body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #111; margin: 0; padding: 0; }
                    .print-page { page-break-after: always; margin-bottom: 20px; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; align-items: flex-end; }
                    .header h2 { margin: 0; font-size: 24px; font-weight: bold; color: #0f172a; }
                    .header .info { text-align: right; font-size: 14px; font-weight: bold; color: #475569; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
                    th, td { border-bottom: 1px solid #cbd5e1; padding: 12px 8px; text-align: left; }
                    th { background-color: #f8fafc; font-weight: bold; color: #475569; }
                    .text-center { text-align: center; }
                    .word-text { font-size: 16px; font-weight: bold; color: #0f172a; }
                    .hint-text { display: block; font-size: 11px; color: #64748b; margin-top: 4px; font-weight: bold; }
                    .answer-blank { border-bottom: 1px solid #94a3b8; width: 100%; height: 24px; display: inline-block; }
                    .advanced-row td { border-top: 3px solid #334155; }
                    .footer { text-align: center; font-size: 12px; font-weight: bold; color: #64748b; margin-top: 20px; }
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
                        <div>이름: ${data.student.name}</div>
                        <div>날짜: ${new Date().toLocaleDateString()} ${type !== 'wordbook' ? '/ 점수: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 50' : ''}</div>
                      </div>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th class="text-center" style="width: 10%;">No.</th>
                          <th style="width: 45%;">${type === 'test' ? 'Question (문제)' : 'Target Vocabulary'}</th>
                          <th style="width: 45%;">${type === 'test' ? 'Answer (정답 기재란)' : 'Core Meaning (핵심 의미)'}</th>
                        </tr>
                      </thead>
                      <tbody>
                `;

                data.questionsList.forEach((q) => {
                  const isAdvanced = q.questionNumber === 41;
                  const rowClass = isAdvanced ? 'class="advanced-row"' : '';
                  const hintHtml = q.hint ? `<span class="hint-text">${q.hint}</span>` : '';
                  
                  const answerDisplay = type === 'test' ? '<div class="answer-blank"></div>' : q.answerText;
                  const answerColor = type === 'test' ? '#1e3a8a' : '#334155';

                  htmlContent += `
                    <tr ${rowClass}>
                      <td class="text-center font-bold">${q.questionNumber}</td>
                      <td>
                        <span class="word-text">${q.wordText}</span>
                        ${hintHtml}
                      </td>
                      <td style="font-weight: bold; color: ${answerColor};">
                        ${answerDisplay}
                      </td>
                    </tr>
                  `;
                });

                htmlContent += `
                      </tbody>
                    </table>
                    <div class="footer">
                      * 41번부터 50번 문항은 고차원적 인지 능력을 평가하는 심화 문항입니다.
                    </div>
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
                alert("팝업 차단이 설정되어 있습니다. 팝업 차단을 해제해 주세요.");
            }
        } catch (error) {
            console.error("Print Data Preparation Error:", error);
            alert("출력 데이터 준비 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const handleGradeSubmit = async (studentId, currentSession, score) => {
        if (score === undefined || score < 0 || score > 50) return alert("정상적인 점수(0~50)를 입력하세요.");
        setProcessing(true);
        try {
            const sessionId = `test_${studentId}_s${currentSession}`;
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            const testRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId);

            await updateDoc(testRef, {
                status: 'completed', score: score, gradedAt: serverTimestamp(), gradedBy: currentUser.name
            });
            await setDoc(statRef, {
                vocaSession: currentSession + 1, lastTestScore: score, lastTestDate: serverTimestamp()
            }, { merge: true });

            alert("채점이 완료되었습니다.");
            setGradeInput(prev => ({ ...prev, [studentId]: '' })); 
        } catch (error) {
            console.error("Grading Error:", error);
            alert("채점 처리 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const handleCatSubmit = async (studentId, score) => {
        if (score === undefined || score < 0 || score > 1000) return alert("정상적인 점수(0~1000)를 입력하세요.");
        setProcessing(true);
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            await setDoc(statRef, {
                catScore: score, updatedAt: serverTimestamp()
            }, { merge: true });
            
            alert("어휘력이 성공적으로 반영되었습니다.");
            setCatInput(prev => ({ ...prev, [studentId]: '' }));
        } catch (error) {
            console.error("CAT Input Error:", error);
            alert("점수 입력 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const handlePresetChange = async (studentId, newPreset) => {
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            await setDoc(statRef, { vocaPreset: newPreset }, { merge: true });
        } catch (error) {
            console.error("Preset Update Error:", error);
            alert("프리셋 변경 중 오류가 발생했습니다.");
        }
    };

    const handleTogglePromotion = async (studentId, tier, currentValue) => {
        if (!window.confirm(`해당 학생의 ${tier}점 승급 심사(모의고사 통과) 상태를 변경하시겠습니까?`)) return;
        setProcessing(true);
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            const fieldName = `passedMockExam${tier}`;
            await setDoc(statRef, { [fieldName]: !currentValue }, { merge: true });
            alert(`${tier}점 승급 심사 상태가 변경되었습니다.`);
        } catch (error) {
            console.error("Promotion Toggle Error:", error);
            alert("상태 변경 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in pb-20 print:hidden">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <BarChart2 className="text-indigo-600" /> Voca 통합 관제 센터
                    </h1>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-2xl flex-wrap justify-center gap-1">
                    <button onClick={() => setActiveTab('dashboard')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>대시보드 & 인쇄</button>
                    <button onClick={() => setActiveTab('grading')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'grading' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>고속 채점</button>
                    <button onClick={() => setActiveTab('analytics')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'analytics' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>어휘력 분석</button>
                    <button onClick={() => setActiveTab('cat_input')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'cat_input' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>어휘력 강제 조정</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3 md:col-span-1">
                    <Users className="text-slate-400" />
                    <select 
                        className="w-full bg-transparent font-black text-slate-700 outline-none cursor-pointer"
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                        {availableClasses.length === 0 && <option value="">배정된 영어 클래스 없음</option>}
                        {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                
                {activeTab === 'dashboard' && (
                    <div className="md:col-span-2 flex flex-wrap lg:flex-nowrap gap-3">
                        <button 
                            onClick={() => preparePrintData('wordbook')} 
                            disabled={processing || classStudents.length === 0}
                            className="flex-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 font-black py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-cyan-200 disabled:opacity-50 min-w-[140px] text-sm"
                        >
                            {processing ? <RefreshCw className="animate-spin" size={18} /> : <BookOpen size={18} />} 
                            반 전체 단어장 인쇄
                        </button>
                        <button 
                            onClick={() => preparePrintData('test')} 
                            disabled={processing || classStudents.length === 0}
                            className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-indigo-200 disabled:opacity-50 min-w-[140px] text-sm"
                        >
                            {processing ? <RefreshCw className="animate-spin" size={18} /> : <FileText size={18} />} 
                            반 전체 시험지 인쇄
                        </button>
                        <button 
                            onClick={() => preparePrintData('answer')} 
                            disabled={processing || classStudents.length === 0}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-rose-200 disabled:opacity-50 min-w-[140px] text-sm"
                        >
                            {processing ? <RefreshCw className="animate-spin" size={18} /> : <Printer size={18} />} 
                            강사용 답안지 일괄 출력
                        </button>
                    </div>
                )}
                
                {activeTab !== 'dashboard' && (
                    <div className="md:col-span-2 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="학생 이름으로 검색..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 font-bold p-4 pl-12 rounded-2xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                    </div>
                )}
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
                {classStudents.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center justify-center">
                        <AlertCircle size={48} className="text-slate-300 mb-4" />
                        <h3 className="text-xl font-bold text-slate-600">조회할 학생 데이터가 없습니다.</h3>
                        <p className="text-slate-400 font-semibold mt-2">영어 클래스를 변경하거나 학생을 등록해주세요.</p>
                    </div>
                ) : (
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-50 border-b border-slate-200 whitespace-nowrap">
                            <tr>
                                <th className="p-4 font-black text-slate-600 w-1/4">학생 정보</th>
                                {/* 🚀 [텍스트 교정 완료] */}
                                <th className="p-4 font-black text-slate-600 text-center">어휘력</th>
                                
                                {activeTab === 'dashboard' && (
                                    <>
                                        <th className="p-4 font-black text-slate-600 text-center"><Sliders size={16} className="inline mr-1"/> 단어 비중 프리셋</th>
                                        <th className="p-4 font-black text-slate-600 text-center">개별 인쇄</th>
                                    </>
                                )}
                                {activeTab === 'grading' && <th className="p-4 font-black text-slate-600 w-1/3">고속 채점 입력 (Max 50)</th>}
                                {activeTab === 'analytics' && (
                                    <>
                                        <th className="p-4 font-black text-slate-600 text-center">정답률 / 누적 어휘</th>
                                        <th className="p-4 font-black text-slate-600 text-center"><Trophy size={16} className="inline mr-1 text-amber-500"/> 승급 심사 관리</th>
                                    </>
                                )}
                                {/* 🚀 [텍스트 교정 완료] */}
                                {activeTab === 'cat_input' && <th className="p-4 font-black text-slate-600 w-1/3">어휘력 강제 조정 (Max 1000)</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {classStudents.map(student => (
                                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black shrink-0">
                                                {student.name[0]}
                                            </div>
                                            <div>
                                                <div className="font-black text-slate-800 text-base">{student.name}</div>
                                                <div className="text-xs font-bold text-slate-400">{student.schoolName} {student.grade}</div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    <td className="p-4 text-center">
                                        {student.stat.catScore !== null && student.stat.catScore !== undefined
                                            ? <Badge className="bg-emerald-100 text-emerald-700 font-black px-3">{student.stat.catScore}점</Badge> 
                                            : <Badge className="bg-rose-100 text-rose-700 font-black px-3 cursor-pointer hover:bg-rose-200">미응시</Badge>
                                        }
                                    </td>

                                    {activeTab === 'dashboard' && (
                                        <>
                                            <td className="p-4 text-center">
                                                <select 
                                                    value={student.stat.vocaPreset}
                                                    onChange={(e) => handlePresetChange(student.id, e.target.value)}
                                                    className="bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 transition-colors cursor-pointer"
                                                >
                                                    <option value="밸런스 모드">밸런스 (오답+신규)</option>
                                                    <option value="누적 복습 위주">누적 복습 위주</option>
                                                    <option value="신규 단어 집중">신규 단어 집중</option>
                                                    <option value="고난도 어휘">고난도 어휘 위주</option>
                                                </select>
                                            </td>
                                            
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-1.5">
                                                    <button 
                                                        onClick={() => preparePrintData('wordbook', student.id)}
                                                        className="px-2.5 py-1.5 bg-cyan-50 text-cyan-600 hover:bg-cyan-600 hover:text-white rounded-md font-bold text-xs transition-colors border border-cyan-200 whitespace-nowrap"
                                                    >
                                                        단어장
                                                    </button>
                                                    <button 
                                                        onClick={() => preparePrintData('test', student.id)}
                                                        className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-md font-bold text-xs transition-colors border border-indigo-200 whitespace-nowrap"
                                                    >
                                                        시험지
                                                    </button>
                                                    <button 
                                                        onClick={() => preparePrintData('answer', student.id)}
                                                        className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-md font-bold text-xs transition-colors border border-rose-200 whitespace-nowrap"
                                                    >
                                                        답안지
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    )}

                                    {activeTab === 'grading' && (
                                        <td className="p-4">
                                            <div className="flex gap-2 items-center">
                                                <input 
                                                    type="number" max="50" min="0" placeholder="점수"
                                                    className="w-20 bg-white border border-slate-300 font-black text-center p-2 rounded-xl outline-none focus:border-indigo-500"
                                                    value={gradeInput[student.id] || ''}
                                                    onChange={e => setGradeInput({...gradeInput, [student.id]: e.target.value})}
                                                    disabled={processing}
                                                />
                                                <span className="font-bold text-slate-400 mr-2">/ 50</span>
                                                <button 
                                                    onClick={() => handleGradeSubmit(student.id, student.stat.vocaSession, parseInt(gradeInput[student.id]))}
                                                    disabled={processing || !gradeInput[student.id]}
                                                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
                                                >
                                                    저장
                                                </button>
                                            </div>
                                        </td>
                                    )}

                                    {activeTab === 'analytics' && (
                                        <>
                                            <td className="p-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="w-full bg-slate-200 rounded-full h-2 max-w-[150px]">
                                                        <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${student.stat.accuracy || 0}%` }}></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-500">
                                                        정답률 {student.stat.accuracy || 0}% (누적 {student.stat.totalWords || 0}단어)
                                                    </span>
                                                </div>
                                            </td>
                                            
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button 
                                                        onClick={() => handleTogglePromotion(student.id, 400, student.stat.passedMockExam400)}
                                                        className={`px-3 py-1.5 rounded-md font-bold text-xs transition-colors border ${
                                                            student.stat.passedMockExam400 
                                                                ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-sm' 
                                                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        400점 심사 {student.stat.passedMockExam400 ? '완료' : '대기'}
                                                    </button>
                                                    <button 
                                                        onClick={() => handleTogglePromotion(student.id, 700, student.stat.passedMockExam700)}
                                                        className={`px-3 py-1.5 rounded-md font-bold text-xs transition-colors border ${
                                                            student.stat.passedMockExam700 
                                                                ? 'bg-purple-100 text-purple-700 border-purple-200 shadow-sm' 
                                                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        700점 심사 {student.stat.passedMockExam700 ? '완료' : '대기'}
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    )}

                                    {activeTab === 'cat_input' && (
                                        <td className="p-4">
                                            <div className="flex gap-2 items-center">
                                                <input 
                                                    type="number" max="1000" min="0" placeholder="점수 입력"
                                                    className="w-24 bg-white border border-slate-300 font-black text-center p-2 rounded-xl outline-none focus:border-amber-500"
                                                    value={catInput[student.id] || ''}
                                                    onChange={e => setCatInput({...catInput, [student.id]: e.target.value})}
                                                    disabled={processing}
                                                />
                                                <span className="font-bold text-slate-400 mr-2">/ 1000</span>
                                                <button 
                                                    onClick={() => handleCatSubmit(student.id, parseInt(catInput[student.id]))}
                                                    disabled={processing || !catInput[student.id]}
                                                    className="bg-amber-500 hover:bg-amber-600 text-white font-black px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
                                                >
                                                    반영
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default VocaManager;