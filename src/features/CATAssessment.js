/* [서비스 가치] 학생에게는 게임 같은 몰입감을, 학부모에게는 AI 알고리즘의 판단 과정을 100% 투명하게 공개하여 
   압도적인 신뢰를 구축하는 Kiosk용 CAT 평가 및 리포트 엔진입니다. 
   (🚀 CTO 패치: 평가 종료 후 극단적 투명성(Radical Transparency)을 보장하는 상세 로그 리포트 화면 탑재) */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, AlertTriangle, CheckCircle, Target, X, BarChart2, TrendingUp, TrendingDown, MinusCircle, XCircle } from 'lucide-react';
import { collection, query, getDocs, limit, where, documentId } from 'firebase/firestore';
import { db } from '../firebase';

// 🚀 배열 셔플 유틸리티
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// 🚀 레벤슈타인 거리 (Levenshtein Distance)
const getLevenshteinDistance = (a, b) => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

export default function CATAssessment({ studentName = '임페리얼', onComplete }) {
    const [isLoadingPool, setIsLoadingPool] = useState(true);
    const [wordPool, setWordPool] = useState([]);
    
    const [isStarted, setIsStarted] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [finalStats, setFinalStats] = useState(null); // 🚀 최종 리포트 데이터 저장용
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentScore, setCurrentScore] = useState(300); 
    const [currentStep, setCurrentStep] = useState(200); 
    const [currentQ, setCurrentQ] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [answers, setAnswers] = useState([]); // 🚀 모든 로그 기록
    
    const timerRef = useRef(null);
    const stateRef = useRef({ currentQ, currentIndex, timeLeft, currentScore, step: currentStep });
    
    const MAX_QUESTIONS = 25; 

    useEffect(() => {
        stateRef.current = { currentQ, currentIndex, timeLeft, currentScore, step: currentStep };
    }, [currentQ, currentIndex, timeLeft, currentScore, currentStep]);

    // 1. 단어 풀(Pool) 로딩
    useEffect(() => {
        const fetchCATPool = async () => {
            setIsLoadingPool(true);
            try {
                const vocaRef = collection(db, 'VocabularyDB');
                const prefixes = ['NVE', 'NVM', 'NVH'];
                let fetchedWords = [];

                const promises = prefixes.map(prefix =>
                    getDocs(query(vocaRef, where(documentId(), '>=', prefix), where(documentId(), '<=', prefix + '\uf8ff'), limit(100)))
                );

                const results = await Promise.all(promises);
                results.forEach(snap => { snap.forEach(doc => fetchedWords.push(doc.data())); });

                if (fetchedWords.length === 0) throw new Error("DB Empty");
                setWordPool(shuffleArray(fetchedWords));
            } catch (error) {
                alert("단어 데이터를 불러오는데 실패했습니다.");
                onComplete(null); 
            } finally {
                setIsLoadingPool(false);
            }
        };

        fetchCATPool();
    }, [onComplete]);

    // 2. 정답 처리 및 로그 기록 (상세 트래킹)
    const handleSelectOption = useCallback((selectedOption, isTimeOut = false) => {
        clearInterval(timerRef.current);
        
        const { currentQ: q, currentIndex: idx, timeLeft: tLeft, currentScore: score, step } = stateRef.current;
        if (!q) return;

        const isTimeOutOrIdk = isTimeOut || selectedOption === 'TIMEOUT_OR_IDK';
        const isCorrect = !isTimeOutOrIdk && selectedOption === q.answer;

        let newScore = score;
        let newStep = step;
        let phase = '';

        if (idx < 7) {
            phase = '초기 탐색';
            if (isCorrect) newScore += step;
            else newScore -= step;
            newStep = step / 2;
            setCurrentStep(newStep);
        } else if (idx < 20) {
            phase = '정밀 타격';
            if (isCorrect) {
                const timeBonus = (tLeft / q.timeLimit) * 15;
                newScore += (10 + timeBonus);
            }
            else if (isTimeOutOrIdk) newScore -= 15;
            else newScore -= 40;
        } else {
            phase = '천장 검증';
            // 천장 검증 시엔 내부 스코어 유지, 최종 정산 때 일괄 처리
        }

        newScore = Math.max(0, Math.min(1000, newScore));

        // 🚀 극단적 투명성을 위한 1개 문항의 완벽한 로그 저장
        setAnswers(prev => [...prev, { 
            qNum: idx + 1,
            phase,
            wordId: q.id, 
            wordText: q.word,
            correctAnswer: q.answer,
            selectedOption: isTimeOut ? '시간 초과' : (selectedOption === 'TIMEOUT_OR_IDK' ? '모름 (Pass)' : selectedOption),
            isCorrect, 
            difficulty: q.difficulty,
            scoreBefore: Math.round(score),
            scoreAfter: Math.round(newScore)
        }]);

        setCurrentScore(newScore);

        if (idx < MAX_QUESTIONS - 1) {
            setCurrentIndex(idx + 1);
        } else {
            setIsFinished(true);
        }
    }, [MAX_QUESTIONS]);

    // 3. 적응형(Adaptive) 문제 생성 엔진 
    const generateNextQuestion = useCallback((estimatedScore) => {
        if (wordPool.length === 0) return null;
        const availableWords = wordPool.filter(w => !answers.some(a => a.wordId === w.wordId));
        if (availableWords.length === 0) return null;

        availableWords.sort((a, b) => 
            Math.abs((a.meanings[0]?.meaningDifficulty || 0) - estimatedScore) - 
            Math.abs((b.meanings[0]?.meaningDifficulty || 0) - estimatedScore)
        );
        const targetWord = availableWords[0];
        const meaning = targetWord.meanings[0];

        let type = 'basic'; let timeLimit = 3;
        
        if (estimatedScore > 500 && meaning.blankSentence && meaning.blankSentence.length > 0) {
            type = 'blank'; timeLimit = 10;
        } else if (estimatedScore > 350 && meaning.synonyms && meaning.synonyms.length > 0) {
            type = 'synonym'; timeLimit = 5;
        }
        if (answers.length === 0) timeLimit = Math.max(timeLimit, 5);

        let distractors = [];
        if (meaning.antonyms && meaning.antonyms.length > 0) distractors.push(...meaning.antonyms); 

        if (distractors.length < 3) {
            const spellTraps = availableWords
                .filter(w => w.wordId !== targetWord.wordId)
                .map(w => ({ wordData: w, dist: getLevenshteinDistance(targetWord.word, w.word) }))
                .filter(item => item.dist >= 1 && item.dist <= 2) 
                .sort((a, b) => a.dist - b.dist).map(item => item.wordData).slice(0, 3 - distractors.length);
            distractors.push(...spellTraps);
        }

        if (distractors.length < 3) {
            const prefixTraps = availableWords
                .filter(w => w.wordId !== targetWord.wordId && w.word[0] === targetWord.word[0] && !distractors.includes(w))
                .slice(0, 3 - distractors.length);
            distractors.push(...prefixTraps);
        }

        if (distractors.length < 3) {
            const fillers = availableWords
                .filter(w => w.wordId !== targetWord.wordId && !distractors.includes(w))
                .slice(0, 3 - distractors.length);
            distractors.push(...fillers);
        }

        let questionText = ''; let answerText = ''; let hint = ''; let options = [];

        if (type === 'blank') {
            questionText = meaning.blankSentence[0]; answerText = targetWord.word;
            options = [targetWord.word, ...distractors.map(d => d.word || d)]; hint = "(빈칸 추론)";
        } else if (type === 'synonym') {
            questionText = `${targetWord.word} (유의어: ${meaning.synonyms.join(', ')})`; answerText = meaning.koreanMeaning;
            options = [meaning.koreanMeaning, ...distractors.map(d => d.meanings?.[0]?.koreanMeaning || d)]; hint = "(해당하는 뜻 고르기)";
        } else {
            questionText = targetWord.word; answerText = meaning.koreanMeaning;
            options = [meaning.koreanMeaning, ...distractors.map(d => d.meanings?.[0]?.koreanMeaning || d)];
            hint = answers.length === 0 ? "⚠️ (첫 문제는 UI 적응용 5초가 주어집니다)" : "(뜻 고르기)";
        }

        return { id: targetWord.wordId, type, word: questionText, answer: answerText, options: shuffleArray(options), timeLimit, difficulty: meaning.meaningDifficulty || 0, hint };
    }, [wordPool, answers]);

    // 4. 타이머 
    useEffect(() => {
        if (isStarted && !isFinished) {
            const nextQ = generateNextQuestion(currentScore);
            if (nextQ) {
                setCurrentQ(nextQ); setTimeLeft(nextQ.timeLimit);
                clearInterval(timerRef.current);
                timerRef.current = setInterval(() => {
                    setTimeLeft((prev) => {
                        if (prev <= 0.1) { clearInterval(timerRef.current); handleSelectOption('TIMEOUT_OR_IDK', true); return 0; }
                        return prev - 0.1; 
                    });
                }, 100);
            } else { alert("단어 풀이 부족하여 평가를 중단합니다."); onComplete(null); }
        }
        return () => clearInterval(timerRef.current);
    }, [currentIndex, isStarted, isFinished, currentScore, generateNextQuestion, handleSelectOption, onComplete]);

    // 🚀 5. 평가 종료 후 [투명성 리포트 통계 연산]
    useEffect(() => {
        if (isFinished && !finalStats) {
            // Stage 3 천장 검증 내역
            const stage3Answers = answers.slice(20, 25);
            const stage3CorrectCount = stage3Answers.filter(a => a.isCorrect).length;

            // 최대 포텐셜: 정답 중 난이도 상위 5개 평균
            const correctAnswers = answers.filter(a => a.isCorrect).sort((a, b) => b.difficulty - a.difficulty);
            const top5 = correctAnswers.slice(0, 5);
            let top5Avg = 150; 
            if (top5.length > 0) top5Avg = top5.reduce((sum, a) => sum + a.difficulty, 0) / top5.length;

            // 스위스 치즈(하위 공백) 페널티
            let lowerErrorPenalty = 0;
            const incorrectAnswers = answers.filter(a => !a.isCorrect);
            incorrectAnswers.forEach(a => {
                if (a.difficulty < top5Avg - 150) lowerErrorPenalty += 30; 
            });

            // 최종 계산
            let finalCalculatedScore = top5Avg - lowerErrorPenalty;
            let bubblePenalty = 0;
            
            if (stage3CorrectCount < 3) {
                finalCalculatedScore -= 150; 
                bubblePenalty = 150;
            }

            const roundedFinalScore = Math.max(0, Math.min(1000, Math.round(finalCalculatedScore)));

            // 리포트를 화면에 뿌리기 위해 State에 저장
            setFinalStats({
                top5Avg: Math.round(top5Avg),
                lowerErrorPenalty,
                stage3CorrectCount,
                bubblePenalty,
                finalScore: roundedFinalScore
            });
        }
    }, [isFinished, answers, finalStats]);

    // =====================================================================
    // UI 렌더링 영역
    // =====================================================================

    if (isLoadingPool) return <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white"><Loader className="animate-spin mb-4" size={48} /><h2 className="text-xl font-bold">AI 진단 엔진용 단어 풀 구축 중...</h2></div>;

    if (!isStarted) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center relative selection:bg-none">
                <button onClick={() => onComplete(null)} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white"><X size={28} /></button>
                <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-md max-w-lg w-full border border-white/20 shadow-2xl animate-in zoom-in-95">
                    <Target size={64} className="mx-auto text-indigo-300 mb-6" />
                    <h1 className="text-4xl font-black mb-2">{studentName} 학생</h1>
                    <h2 className="text-xl font-bold text-indigo-200 mb-8">AI 어휘력 정밀 진단 (CAT)</h2>
                    <div className="text-left bg-black/20 p-5 rounded-2xl mb-8 space-y-3 text-sm font-bold text-indigo-100 leading-relaxed">
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>문제 유형에 따라 제한 시간이 다릅니다. (게이지 바 확인)</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>모르는 단어는 찍지 말고 반드시 [모르겠습니다]를 누르세요. 찍어서 맞춘 사실이 AI 알고리즘에 발각되면 거품 점수로 간주되어 강력한 강등 페널티가 부여됩니다.</span></p>
                    </div>
                    <button onClick={() => setIsStarted(true)} className="w-full py-5 bg-white text-indigo-900 text-xl font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-95">진단평가 시작하기</button>
                </div>
            </div>
        );
    }

    // 🚀 [CTO 패치] 평가가 종료되면 곧바로 꺼지는 게 아니라 투명성 리포트를 화면에 노출합니다.
    if (isFinished && finalStats) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-8 animate-in slide-in-from-bottom-8 duration-500">
                <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 pb-6">
                    
                    {/* 리포트 헤더 */}
                    <div className="bg-indigo-900 text-white p-8 text-center relative overflow-hidden">
                        <BarChart2 size={120} className="absolute -bottom-4 -right-4 text-white opacity-10" />
                        <h1 className="text-3xl font-black mb-2">AI 적응형 진단 투명성 리포트</h1>
                        <p className="text-indigo-200 font-bold">임페리얼의 AI는 학생의 모든 선택을 분석하고 기록합니다.</p>
                        
                        <div className="mt-8 bg-white/10 border border-white/20 p-6 rounded-2xl inline-block backdrop-blur-sm shadow-inner">
                            <div className="text-sm font-bold text-indigo-200 mb-1 tracking-widest">최종 도출 스탯</div>
                            <div className="text-6xl font-black">{finalStats.finalScore} <span className="text-2xl text-indigo-300 font-bold">점</span></div>
                        </div>
                    </div>

                    {/* 알고리즘 산출 공식 설명 (학부모 설득용) */}
                    <div className="p-6 md:p-8 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2"><Target className="text-indigo-600"/> 스탯 산출 알고리즘</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm text-center">
                                <div className="text-xs font-bold text-gray-400 mb-1">최대 포텐셜 (Top 5 정답 평균)</div>
                                <div className="text-2xl font-black text-indigo-700">{finalStats.top5Avg} 점</div>
                                <div className="text-[10px] text-gray-500 mt-2 font-medium">학생이 맞춘 가장 어려운 단어 5개의 평균값입니다.</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-sm text-center relative">
                                <div className="text-xs font-bold text-gray-400 mb-1">기초 공백 (쉬운 단어 오답)</div>
                                <div className="text-2xl font-black text-rose-600">- {finalStats.lowerErrorPenalty} 점</div>
                                <div className="text-[10px] text-gray-500 mt-2 font-medium">실력에 비해 너무 쉬운 단어를 틀렸을 때 부여된 페널티입니다.</div>
                                {finalStats.lowerErrorPenalty > 0 && <AlertTriangle size={16} className="absolute top-3 right-3 text-rose-400 animate-pulse"/>}
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm text-center relative">
                                <div className="text-xs font-bold text-gray-400 mb-1">천장 검증 (심화 연속 정답)</div>
                                <div className="text-2xl font-black text-amber-600">{finalStats.stage3CorrectCount} / 5 개</div>
                                <div className="text-[10px] text-gray-500 mt-2 font-medium">막판 고난이도 문항에서 거품 점수를 최종 검증한 결과입니다.</div>
                                {finalStats.bubblePenalty > 0 && <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg rounded-tr-lg">거품 강등 -150</div>}
                            </div>
                        </div>
                    </div>

                    {/* 25문항 상세 트래킹 로그 */}
                    <div className="p-6 md:p-8">
                        <h3 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2"><CheckCircle className="text-emerald-500"/> 상세 트래킹 로그 (전 문항)</h3>
                        <div className="max-h-96 overflow-y-auto custom-scrollbar border-2 border-gray-100 rounded-xl bg-white">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0 z-10 text-gray-500 font-black">
                                    <tr>
                                        <th className="p-3">문항 (알고리즘 페이즈)</th>
                                        <th className="p-3">출제 단어 (정답)</th>
                                        <th className="p-3">학생의 선택</th>
                                        <th className="p-3 text-center">결과</th>
                                        <th className="p-3 text-right">점수 변동 트래킹</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {answers.map((log, i) => (
                                        <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="p-3 font-bold text-gray-600">
                                                Q{log.qNum}. <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded ml-1">{log.phase}</span>
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-gray-900 truncate max-w-[200px]" title={log.wordText}>{log.wordText}</div>
                                                <div className="text-[10px] font-bold text-indigo-500">정답: {log.correctAnswer}</div>
                                            </td>
                                            <td className="p-3">
                                                <span className={`font-bold ${log.selectedOption.includes('모름') || log.selectedOption.includes('초과') ? 'text-amber-500' : 'text-gray-800'} truncate max-w-[150px] block`} title={log.selectedOption}>
                                                    {log.selectedOption}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                {log.isCorrect ? <CheckCircle size={18} className="text-emerald-500 mx-auto"/> : <XCircle size={18} className="text-rose-500 mx-auto"/>}
                                            </td>
                                            <td className="p-3 text-right font-mono font-bold text-gray-500">
                                                <span className="opacity-60">{log.scoreBefore}</span>
                                                <span className="mx-1 text-gray-300">➔</span>
                                                <span className={log.scoreAfter > log.scoreBefore ? 'text-emerald-600' : log.scoreAfter < log.scoreBefore ? 'text-rose-600' : 'text-gray-600'}>
                                                    {log.scoreAfter}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="px-6 md:px-8">
                        <button 
                            onClick={() => onComplete(finalStats.finalScore)}
                            className="w-full py-5 bg-gray-900 hover:bg-black text-white text-xl font-black rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <Target size={24} /> 상담 데스크로 데이터 연동 및 종료하기
                        </button>
                    </div>

                </div>
            </div>
        );
    }

    if (!currentQ) return null;

    const progressPercent = (timeLeft / currentQ.timeLimit) * 100;
    const timerColor = progressPercent > 50 ? 'bg-emerald-500' : progressPercent > 20 ? 'bg-amber-400' : 'bg-rose-500';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col selection:bg-none relative">
            <button onClick={() => { if(window.confirm("시험을 중단하시겠습니까? 점수가 저장되지 않습니다.")) onComplete(null); }} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors z-50">
                <X size={24} />
            </button>

            <div className="bg-white shadow-sm px-6 py-4 flex justify-center items-center shrink-0 border-b border-gray-100">
                <div className="font-black text-gray-400 text-lg tracking-widest">Q. {currentIndex + 1} / {MAX_QUESTIONS}</div>
            </div>

            <div className="w-full h-3 bg-gray-200 relative overflow-hidden">
                <div className={`absolute top-0 left-0 h-full ${timerColor} transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(0,0,0,0.2)]`} style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-right-8 duration-300" key={currentQ.id}>
                
                <div className="mb-10 w-full text-center px-4">
                    {currentQ.type === 'blank' ? (
                        <div className="text-2xl sm:text-4xl font-black text-gray-800 leading-snug break-keep-all">
                            {currentQ.word}
                        </div>
                    ) : (
                        <div className="text-5xl sm:text-7xl font-black text-gray-900 tracking-tight">
                            {currentQ.word}
                        </div>
                    )}
                    <div className={`mt-5 text-sm font-bold inline-block px-4 py-1.5 rounded-full border ${answers.length === 0 ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse' : 'bg-indigo-50 text-indigo-500 border-indigo-100'}`}>
                        {currentQ.hint}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full mb-6">
                    {currentQ.options.map((opt, idx) => (
                        <button 
                            key={idx}
                            onClick={() => handleSelectOption(opt, false)}
                            className="bg-white border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 text-gray-800 font-bold text-lg sm:text-xl p-5 sm:p-6 rounded-2xl transition-all text-center flex items-center justify-center shadow-sm break-keep-all"
                        >
                            {opt}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => handleSelectOption('TIMEOUT_OR_IDK', false)}
                    className="mt-2 w-full sm:w-2/3 mx-auto bg-gray-800 hover:bg-black text-white font-black text-lg py-5 rounded-2xl transition-colors shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                    🤷 솔직히 모르겠습니다 (Pass)
                </button>
            </div>
        </div>
    );
}