/* [서비스 가치(Service Value)] AI Voca 통합 관제 센터 v4.7
   강사 상담 역량 강화: 강사용 관제 센터에도 '학년별 어휘 진도(Grade-Level)'를 노출하여, 학부모 상담 시 
   "현재 철수는 중2 교과 필수 어휘를 정복 중입니다"와 같이 구체적이고 신뢰감 있는 브리핑이 가능하도록 지원합니다. */
import React, { useState, useMemo, useEffect } from 'react';
import { 
    Users, Printer, BarChart2, Search, 
    AlertCircle, FileText, RefreshCw, Sliders, Trophy, BookOpen, CheckCircle, ChevronDown, Undo2, GraduationCap
} from 'lucide-react';
import { collection, doc, setDoc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Badge, Modal, Button } from '../components/UI';
import { generateDailyVocaSet, processVocaTestResult, rollbackVocaTestResult } from '../utils/vocaEngine';

const APP_ID = 'imperial-clinic-v1';

const getTierProgress = (masteredCount = 0) => {
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
        if (masteredCount < TIERS[i].limit) {
            currentTier = TIERS[i];
            break;
        }
        prevLimit = TIERS[i].limit;
        if (i === TIERS.length - 1) currentTier = TIERS[i];
    }

    const currentBracketMastered = Math.max(0, masteredCount - prevLimit);
    const bracketTotal = currentTier.limit - prevLimit;
    const percent = Math.min(100, Math.round((currentBracketMastered / bracketTotal) * 100));

    return { ...currentTier, percent, currentBracketMastered, bracketTotal, totalMastered: masteredCount };
};

const VocaManager = ({ currentUser }) => {
    const { users, classes, enrollments } = useData();
    const [localEnglishStats, setLocalEnglishStats] = useState([]);

    useEffect(() => {
        const statsRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats`);
        const unsubscribe = onSnapshot(statsRef, (snapshot) => {
            const statsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLocalEnglishStats(statsData);
        });
        return () => unsubscribe();
    }, []);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('dashboard'); 
    
    const [sortConfig, setSortConfig] = useState(null); 

    const [processing, setProcessing] = useState(false);
    const [catInput, setCatInput] = useState({}); 

    const [gradingModalOpen, setGradingModalOpen] = useState(false);
    const [gradingData, setGradingData] = useState({ studentId: '', name: '', sessionNumber: 1, wrongAnswers: [] });

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

    const classStudents = useMemo(() => {
        if (!selectedClassId) return [];
        const enrolledStudentIds = enrollments
            .filter(e => e.classId === selectedClassId && e.status === 'active')
            .map(e => e.studentId);

        let filteredStudents = users
            .filter(u => u.role === 'student' && enrolledStudentIds.includes(u.id))
            .map(student => {
                const stat = localEnglishStats.find(s => s.id === student.id) || { 
                    catScore: null, vocaSession: 1, totalWords: 0, accuracy: 0, vocaPreset: '밸런스 모드',
                    vocaProgress: 0, vocaComprehension: 0, vocaRetention: 0, masteredCount: 0,
                    passedMockExam400: false, passedMockExam700: false
                };
                return { ...student, stat: { ...stat, vocaPreset: stat.vocaPreset || '밸런스 모드' } };
            })
            .filter(student => student.name.includes(searchQuery));

        if (activeTab === 'analytics' && sortConfig) {
            filteredStudents.sort((a, b) => {
                const valA = sortConfig === 'vocaProgress' ? (a.stat.masteredCount || 0) : (a.stat[sortConfig] || 0);
                const valB = sortConfig === 'vocaProgress' ? (b.stat.masteredCount || 0) : (b.stat[sortConfig] || 0);
                return valB - valA; 
            });
        } else {
            filteredStudents.sort((a, b) => a.name.localeCompare(b.name));
        }

        return filteredStudents;
    }, [selectedClassId, enrollments, users, localEnglishStats, searchQuery, activeTab, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(key);
    };

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
                let wordsList = []; 
                let isSessionCompleted = false;
                let wrongNums = [];
                
                if (testSnap.exists() && testSnap.data().questionsForTest) {
                    const testData = testSnap.data();
                    questionsList = testData.questionsForTest;
                    wordsList = testData.wordsForPrint;
                    if (testData.status === 'completed') {
                        isSessionCompleted = true;
                        wrongNums = testData.wrongAnswerNumbers || [];
                    }
                } else if (student.stat.catScore) {
                    const payload = await generateDailyVocaSet(student.id, student.stat.vocaPreset);
                    questionsList = payload.questionsForTest;
                    wordsList = payload.wordsForPrint;
                }

                if (type.startsWith('retest')) {
                    if (!isSessionCompleted) {
                        alert(`${student.name} 학생의 채점이 완료되지 않아 오답 재시험지를 출력할 수 없습니다.`);
                        continue;
                    }
                    if (wrongNums.length === 0) {
                        alert(`${student.name} 학생은 100점이므로 재시험지가 없습니다!`);
                        continue;
                    }
                    questionsList = questionsList.filter(q => wrongNums.includes(q.questionNumber));
                }
                
                if (questionsList.length > 0 || (type === 'wordbook' && wordsList.length > 0)) {
                    dataToPrint.push({ student, questionsList, wordsList, session: student.stat.vocaSession || 1 });
                }
            }
            
            if (dataToPrint.length === 0) {
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
                    .text-center { text-align: center; }
                    .word-text { font-size: 16px; font-weight: bold; color: #0f172a; }
                    .hint-text { display: block; font-size: 11px; color: #64748b; margin-top: 4px; font-weight: bold; }
                    .answer-blank { border-bottom: 1px solid #94a3b8; width: 100%; height: 20px; display: inline-block; }
                    .advanced-row td { border-top: 2px solid #334155; }
                    .rich-info { margin-top: 4px; font-size: 11px; color: #475569; line-height: 1.4; font-weight: 500; }
                    .rich-info span.tag { font-weight: bold; color: #3b82f6; margin-right: 4px; }
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
                        <div>이름: ${data.student.name}</div>
                        <div>날짜: ${new Date().toLocaleDateString()} ${type.includes('test') && !type.includes('retest') ? '/ 점수: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 50' : ''}</div>
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
                        let allSynonyms = []; let allAntonyms = []; let fullSentence = '';

                        if (meanings.length > 0) {
                            meanings.forEach((m, idx) => {
                                const pos = m.partOfSpeech ? `<span class="pos-tag">[${m.partOfSpeech}]</span>` : '';
                                meaningHtml += `<div class="meaning-line">${pos}${idx + 1}. ${m.koreanMeaning}</div>`;
                                if (m.synonyms) allSynonyms.push(...m.synonyms);
                                if (m.antonyms) allAntonyms.push(...m.antonyms);
                                if (!fullSentence && m.exampleSentence) fullSentence = m.exampleSentence;
                                else if (!fullSentence && m.blankSentence && m.blankSentence.length > 0) {
                                    const regex = new RegExp('_+(?:\\s*_+)*', 'g');
                                    fullSentence = m.blankSentence[0].replace(regex, w.word);
                                }
                            });
                        } else { meaningHtml = '<div>뜻 정보 없음</div>'; }

                        allSynonyms = [...new Set(allSynonyms)]; allAntonyms = [...new Set(allAntonyms)];

                        let extraInfoHtml = '';
                        if (allSynonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag">[유의어]</span>${allSynonyms.join(', ')}</div>`;
                        if (allAntonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag">[반의어]</span>${allAntonyms.join(', ')}</div>`;
                        if (fullSentence) extraInfoHtml += `<div class="rich-info"><span class="tag">[예문]</span>${fullSentence}</div>`;

                        htmlContent += `
                          <tr>
                            <td class="text-center font-bold">${i + 1}</td>
                            <td><div class="word-text">${w.word}</div></td>
                            <td><div style="font-weight: 800; color: #1e3a8a; font-size: 14px;">${meaningHtml}</div>${extraInfoHtml}</td>
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
                            <td><span class="word-text">${q.wordText}</span>${hintHtml}</td>
                            <td style="font-weight: bold; color: ${answerColor};">${answerDisplay}</td>
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
                alert("팝업 차단이 설정되어 있습니다. 팝업 차단을 해제해 주세요.");
            }
        } catch (error) {
            console.error("Print Data Preparation Error:", error);
            alert("출력 데이터 준비 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    const openGradingModal = async (student) => {
        const sessionId = `test_${student.id}_s${student.stat.vocaSession || 1}`;
        const testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId));
        if (!testSnap.exists()) return alert("해당 회차의 단어장이 아직 생성되지 않았습니다.");
        
        setGradingData({
            studentId: student.id, name: student.name, sessionNumber: student.stat.vocaSession || 1, wrongAnswers: []
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
        const finalScore = 50 - gradingData.wrongAnswers.length;
        if (!window.confirm(`[${gradingData.name}] 학생의 최종 점수는 ${finalScore}점입니다.\n오답 문항 개수를 정확히 확인하셨습니까?\n이대로 채점을 확정하고 AI 엔진에 전송하시겠습니까?`)) {
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
        if (score === undefined || score < 0 || score > 1000) return alert("정상적인 점수(0~1000)를 입력하세요.");
        setProcessing(true);
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            await setDoc(statRef, { catScore: score, updatedAt: serverTimestamp() }, { merge: true });
            alert("어휘력이 성공적으로 반영되었습니다.");
            setCatInput(prev => ({ ...prev, [studentId]: '' }));
        } catch (error) {
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
            alert("상태 변경 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in pb-20 print:hidden">
            
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
                            <span className="text-sm font-bold text-slate-500">최종 점수 산출</span>
                            <div className="text-4xl font-black text-slate-800">
                                {50 - gradingData.wrongAnswers.length} <span className="text-lg text-slate-400">/ 50점</span>
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
                
                <div className="flex bg-slate-100 p-1 rounded-2xl flex-wrap justify-center gap-1">
                    <button onClick={() => { setActiveTab('dashboard'); setSortConfig(null); }} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>대시보드 & 인쇄</button>
                    <button onClick={() => { setActiveTab('grading'); setSortConfig(null); }} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'grading' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>채점 및 분석</button>
                    <button onClick={() => setActiveTab('analytics')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'analytics' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>어휘력 통계</button>
                    <button onClick={() => { setActiveTab('cat_input'); setSortConfig(null); }} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'cat_input' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>어휘력 강제 조정</button>
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
                        <input 
                            type="text" placeholder="학생 이름으로 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
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
                    </div>
                ) : (
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-50 border-b border-slate-200 whitespace-nowrap">
                            <tr>
                                <th className="p-4 font-black text-slate-600 w-1/4">학생 정보</th>
                                <th className="p-4 font-black text-slate-600 text-center">종합 어휘력 지수</th>
                                
                                {activeTab === 'dashboard' && (
                                    <>
                                        <th className="p-4 font-black text-slate-600 text-center"><Sliders size={16} className="inline mr-1"/> 프리셋 설정</th>
                                        <th className="p-4 font-black text-slate-600 text-center">개별 출력 기능</th>
                                    </>
                                )}
                                {activeTab === 'grading' && <th className="p-4 font-black text-slate-600 text-center">채점 상태 및 AI 데이터 전송</th>}
                                
                                {activeTab === 'analytics' && (
                                    <>
                                        <th className="p-4 font-black text-slate-600 text-center cursor-pointer hover:bg-slate-200 transition-colors group" onClick={() => handleSort('vocaProgress')}>
                                            어휘 진도 {sortConfig === 'vocaProgress' && <ChevronDown size={14} className="inline text-blue-600" />}
                                        </th>
                                        <th className="p-4 font-black text-slate-600 text-center cursor-pointer hover:bg-slate-200 transition-colors group" onClick={() => handleSort('vocaComprehension')}>
                                            뜻 이해도 {sortConfig === 'vocaComprehension' && <ChevronDown size={14} className="inline text-blue-600" />}
                                        </th>
                                        <th className="p-4 font-black text-slate-600 text-center cursor-pointer hover:bg-slate-200 transition-colors group" onClick={() => handleSort('vocaRetention')}>
                                            장기 기억력 {sortConfig === 'vocaRetention' && <ChevronDown size={14} className="inline text-blue-600" />}
                                        </th>
                                        <th className="p-4 font-black text-slate-600 text-center"><Trophy size={16} className="inline mr-1 text-amber-500"/> 승급 심사 관리</th>
                                    </>
                                )}
                                
                                {activeTab === 'cat_input' && <th className="p-4 font-black text-slate-600 w-1/3">어휘력 강제 조정 (Max 1000)</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {classStudents.map(student => {
                                const tierInfo = getTierProgress(student.stat.masteredCount || 0);

                                return (
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
                                                    className="bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 transition-colors cursor-pointer w-full max-w-[140px]"
                                                >
                                                    <option value="밸런스 모드">밸런스 모드</option>
                                                    <option value="오답 학습">오답 학습</option>
                                                    <option value="망각 방어">망각 방어</option>
                                                    <option value="기초 수리">기초 수리</option>
                                                    <option value="스퍼트 모드">스퍼트 모드</option>
                                                </select>
                                            </td>
                                            
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-1.5 flex-wrap max-w-[200px] mx-auto">
                                                    <button onClick={() => preparePrintData('wordbook', student.id)} className="px-2.5 py-1.5 bg-cyan-50 text-cyan-600 hover:bg-cyan-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-cyan-200 whitespace-nowrap">단어장</button>
                                                    <button onClick={() => preparePrintData('test', student.id)} className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-indigo-200 whitespace-nowrap">시험지</button>
                                                    <button onClick={() => preparePrintData('answer', student.id)} className="px-2.5 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-rose-200 whitespace-nowrap">답안지</button>
                                                    <button onClick={() => preparePrintData('retest', student.id)} className="px-2.5 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-amber-200 whitespace-nowrap mt-1">오답 재시험지</button>
                                                    <button onClick={() => preparePrintData('retest_answer', student.id)} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-md font-bold text-[11px] transition-colors border border-emerald-200 whitespace-nowrap mt-1">재시험 답지</button>
                                                </div>
                                            </td>
                                        </>
                                    )}

                                    {activeTab === 'grading' && (
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col gap-2 justify-center items-center">
                                                <button onClick={() => openGradingModal(student)} className="bg-white border-2 border-emerald-500 hover:bg-emerald-50 text-emerald-700 font-black px-6 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2">
                                                    <CheckCircle size={18} /> 오답 문항 선택 (채점)
                                                </button>
                                                {student.stat.vocaSession > 1 && (
                                                    <button onClick={() => handleRollback(student.id, student.stat.vocaSession - 1)} className="text-[11px] text-rose-400 hover:text-rose-600 underline font-bold flex items-center gap-1 mt-1">
                                                        <Undo2 size={12} /> {student.stat.vocaSession - 1}회차 채점 취소 (복구)
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}

                                    {activeTab === 'analytics' && (
                                        <>
                                            <td className="p-4 text-center">
                                                {/* 🚀 [구문 오류 해결] style width 속성 문자열 결합 처리 */}
                                                <div className="flex justify-between items-center mb-1 max-w-[120px] mx-auto">
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 ${tierInfo.bg} ${tierInfo.text}`}>
                                                        <GraduationCap size={10} /> {tierInfo.name}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-2 max-w-[120px] mx-auto mb-1">
                                                    <div className={`${tierInfo.color} h-2 rounded-full transition-all`} style={{ width: tierInfo.percent + '%' }}></div>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500">
                                                    {tierInfo.currentBracketMastered}/{tierInfo.bracketTotal} (누적 {tierInfo.totalMastered})
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="w-full bg-slate-200 rounded-full h-2.5 max-w-[100px] mx-auto mb-1">
                                                    <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: (student.stat.vocaComprehension || 0) + '%' }}></div>
                                                </div>
                                                <span className="text-xs font-black text-emerald-700">{student.stat.vocaComprehension || 0}%</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="w-full bg-slate-200 rounded-full h-2.5 max-w-[100px] mx-auto mb-1">
                                                    <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: (student.stat.vocaRetention || 0) + '%' }}></div>
                                                </div>
                                                <span className="text-xs font-black text-indigo-700">{student.stat.vocaRetention || 0}%</span>
                                            </td>
                                            
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleTogglePromotion(student.id, 400, student.stat.passedMockExam400)} className={`px-3 py-1.5 rounded-md font-bold text-xs transition-colors border ${student.stat.passedMockExam400 ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>400점 심사 {student.stat.passedMockExam400 ? '완료' : '대기'}</button>
                                                    <button onClick={() => handleTogglePromotion(student.id, 700, student.stat.passedMockExam700)} className={`px-3 py-1.5 rounded-md font-bold text-xs transition-colors border ${student.stat.passedMockExam700 ? 'bg-purple-100 text-purple-700 border-purple-200 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>700점 심사 {student.stat.passedMockExam700 ? '완료' : '대기'}</button>
                                                </div>
                                            </td>
                                        </>
                                    )}

                                    {activeTab === 'cat_input' && (
                                        <td className="p-4">
                                            <div className="flex gap-2 items-center">
                                                <input type="number" max="1000" min="0" placeholder="점수 입력" value={catInput[student.id] || ''} onChange={e => setCatInput({...catInput, [student.id]: e.target.value})} disabled={processing} className="w-24 bg-white border border-slate-300 font-black text-center p-2 rounded-xl outline-none focus:border-amber-500"/>
                                                <span className="font-bold text-slate-400 mr-2">/ 1000</span>
                                                <button onClick={() => handleCatSubmit(student.id, parseInt(catInput[student.id]))} disabled={processing || !catInput[student.id]} className="bg-amber-500 hover:bg-amber-600 text-white font-black px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50">반영</button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default VocaManager;