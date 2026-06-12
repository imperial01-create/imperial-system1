/* [서비스 가치] 가짜 지식과 운(Guessing)에 의한 '점수 인플레이션'을 완벽하게 파괴하는 상용화 CAT 엔진입니다.
   (🚀 CTO 패치: 3단계 감쇠형 이진탐색, 비대칭 오답 페널티, 천장 검증 및 Top 5 기반 최종 스탯 산출 알고리즘 적용 완료) */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, AlertTriangle, CheckCircle, Target, X } from 'lucide-react';
import { collection, query, getDocs, limit, where, documentId } from 'firebase/firestore';
import { db } from '../firebase';

const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

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
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentScore, setCurrentScore] = useState(300); 
    const [currentStep, setCurrentStep] = useState(200); // 1단계 이진 탐색용 점프 폭
    const [currentQ, setCurrentQ] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [answers, setAnswers] = useState([]);
    
    const timerRef = useRef(null);
    const stateRef = useRef({ currentQ, currentIndex, timeLeft, currentScore, step: currentStep });
    
    const MAX_QUESTIONS = 25; // 🚀 천장 검증을 위해 25문항으로 확장

    useEffect(() => {
        stateRef.current = { currentQ, currentIndex, timeLeft, currentScore, step: currentStep };
    }, [currentQ, currentIndex, timeLeft, currentScore, currentStep]);

    useEffect(() => {
        const fetchCATPool = async () => {
            setIsLoadingPool(true);
            try {
                const vocaRef = collection(db, 'VocabularyDB');
                const prefixes = ['NVE', 'NVM', 'NVH'];
                let fetchedWords = [];

                const promises = prefixes.map(prefix =>
                    getDocs(query(
                        vocaRef,
                        where(documentId(), '>=', prefix),
                        where(documentId(), '<=', prefix + '\uf8ff'),
                        limit(100)
                    ))
                );

                const results = await Promise.all(promises);
                results.forEach(snap => {
                    snap.forEach(doc => fetchedWords.push(doc.data()));
                });

                if (fetchedWords.length === 0) throw new Error("DB Empty");
                setWordPool(shuffleArray(fetchedWords));
            } catch (error) {
                console.error("단어 풀 로딩 실패:", error);
                alert("단어 데이터를 불러오는데 실패했습니다. 인터넷 연결 및 DB를 확인해주세요.");
                onComplete(null); 
            } finally {
                setIsLoadingPool(false);
            }
        };

        fetchCATPool();
    }, [onComplete]);

    // 🚀 [핵심 알고리즘 1 & 2] 구간별 비대칭 가중치 처리
    const handleSelectOption = useCallback((selectedOption, isTimeOut = false) => {
        clearInterval(timerRef.current);
        
        const { currentQ: q, currentIndex: idx, currentScore: score, step } = stateRef.current;
        if (!q) return;

        const isTimeOutOrIdk = isTimeOut || selectedOption === 'TIMEOUT_OR_IDK';
        const isCorrect = !isTimeOutOrIdk && selectedOption === q.answer;

        // 최종 계산을 위해 단어의 고유 난이도(difficulty) 기록
        setAnswers(prev => [...prev, { wordId: q.id, isCorrect, selectedOption, difficulty: q.difficulty }]);

        let newScore = score;
        let newStep = step;

        if (idx < 7) {
            // 1단계: 감쇠형 이진 탐색 (Dampening)
            if (isCorrect) newScore += step;
            else newScore -= step;
            newStep = step / 2;
            setCurrentStep(newStep);
        } else if (idx < 20) {
            // 2단계: 페널티 가중치 IRT (오답 페널티 극대화)
            if (isCorrect) newScore += 10;
            else if (isTimeOutOrIdk) newScore -= 15;
            else newScore -= 40;
        } else {
            // 3단계: 천장 검증 (21~25번). E 점수는 변동시키지 않고 뒷단에서 일괄 정산함.
        }

        setCurrentScore(Math.max(0, Math.min(1000, newScore)));

        if (idx < MAX_QUESTIONS - 1) {
            setCurrentIndex(idx + 1);
        } else {
            setIsFinished(true);
        }
    }, [MAX_QUESTIONS]);

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

        let type = 'basic';
        let timeLimit = 3;
        
        if (estimatedScore > 500 && meaning.blankSentence && meaning.blankSentence.length > 0) {
            type = 'blank'; timeLimit = 10;
        } else if (estimatedScore > 350 && meaning.synonyms && meaning.synonyms.length > 0) {
            type = 'synonym'; timeLimit = 5;
        }

        if (answers.length === 0) {
            timeLimit = Math.max(timeLimit, 5);
        }

        let distractors = [];

        if (meaning.antonyms && meaning.antonyms.length > 0) {
            distractors.push(...meaning.antonyms); 
        }

        if (distractors.length < 3) {
            const spellTraps = availableWords
                .filter(w => w.wordId !== targetWord.wordId)
                .map(w => ({ wordData: w, dist: getLevenshteinDistance(targetWord.word, w.word) }))
                .filter(item => item.dist >= 1 && item.dist <= 2) 
                .sort((a, b) => a.dist - b.dist)
                .map(item => item.wordData)
                .slice(0, 3 - distractors.length);
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

        let questionText = '';
        let answerText = '';
        let hint = '';
        let options = [];

        if (type === 'blank') {
            questionText = meaning.blankSentence[0];
            answerText = targetWord.word;
            options = [targetWord.word, ...distractors.map(d => d.word || d)]; 
            hint = "(빈칸 추론)";
        } else if (type === 'synonym') {
            questionText = `${targetWord.word} (유의어: ${meaning.synonyms.join(', ')})`;
            answerText = meaning.koreanMeaning;
            options = [meaning.koreanMeaning, ...distractors.map(d => d.meanings?.[0]?.koreanMeaning || d)];
            hint = "(해당하는 뜻 고르기)";
        } else {
            questionText = targetWord.word;
            answerText = meaning.koreanMeaning;
            options = [meaning.koreanMeaning, ...distractors.map(d => d.meanings?.[0]?.koreanMeaning || d)];
            hint = answers.length === 0 ? "⚠️ (첫 문제는 UI 적응용 5초가 주어집니다)" : "(뜻 고르기)";
        }

        return {
            id: targetWord.wordId,
            type,
            word: questionText,
            answer: answerText,
            options: shuffleArray(options),
            timeLimit,
            difficulty: meaning.meaningDifficulty || 0, // 🚀 평가 보정을 위한 난이도 패스
            hint
        };
    }, [wordPool, answers]);

    useEffect(() => {
        if (isStarted && !isFinished) {
            const nextQ = generateNextQuestion(currentScore);
            if (nextQ) {
                setCurrentQ(nextQ);
                setTimeLeft(nextQ.timeLimit);
                
                clearInterval(timerRef.current);
                timerRef.current = setInterval(() => {
                    setTimeLeft((prev) => {
                        if (prev <= 0.1) {
                            clearInterval(timerRef.current);
                            handleSelectOption('TIMEOUT_OR_IDK', true); 
                            return 0;
                        }
                        return prev - 0.1; 
                    });
                }, 100);

            } else {
                alert("단어 풀이 부족하여 평가를 중단합니다.");
                onComplete(null);
            }
        }
        return () => clearInterval(timerRef.current);
    }, [currentIndex, isStarted, isFinished, currentScore, generateNextQuestion, handleSelectOption, onComplete]);

    // 🚀 [핵심 알고리즘 3] 최종 어휘력 점수(Top 5 평균 - 하위 오답 페널티) 결산 로직
    useEffect(() => {
        if (isFinished) {
            // 1. Stage 3 검증 (21~25번)
            const stage3Answers = answers.slice(20, 25);
            const stage3CorrectCount = stage3Answers.filter(a => a.isCorrect).length;

            // 2. 최대 포텐셜 측정 (Top 5 정답 평균)
            const correctAnswers = answers.filter(a => a.isCorrect).sort((a, b) => b.difficulty - a.difficulty);
            const top5 = correctAnswers.slice(0, 5);
            
            let top5Avg = 150; 
            if (top5.length > 0) {
                top5Avg = top5.reduce((sum, a) => sum + a.difficulty, 0) / top5.length;
            }

            // 3. 스위스 치즈 현상(하위 구멍) 페널티 스캔
            let lowerErrorPenalty = 0;
            const incorrectAnswers = answers.filter(a => !a.isCorrect);
            incorrectAnswers.forEach(a => {
                if (a.difficulty < top5Avg - 150) {
                    lowerErrorPenalty += 30; // 쉬운 단어 오답 당 감점
                }
            });

            // 4. 최종 루브릭 점수 산출
            let finalCalculatedScore = top5Avg - lowerErrorPenalty;
            
            // 천장 검증 탈락 시 거품 강제 강등 (-150)
            if (stage3CorrectCount < 3) {
                finalCalculatedScore -= 150; 
            }

            const roundedFinalScore = Math.max(0, Math.min(1000, Math.round(finalCalculatedScore)));

            setTimeout(() => {
                if (onComplete) onComplete(roundedFinalScore); 
            }, 2500);
        }
    }, [isFinished, answers, onComplete]);

    if (isLoadingPool) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center">
                <Loader className="animate-spin mb-4" size={48} />
                <h2 className="text-xl font-bold">AI 진단 엔진용 단어 풀(Pool)을 구축 중입니다...</h2>
            </div>
        );
    }

    if (!isStarted) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center relative selection:bg-none">
                <button onClick={() => onComplete(null)} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
                    <X size={28} />
                </button>

                <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-md max-w-lg w-full border border-white/20 shadow-2xl animate-in zoom-in-95">
                    <Target size={64} className="mx-auto text-indigo-300 mb-6" />
                    <h1 className="text-4xl font-black mb-2">{studentName} 학생</h1>
                    <h2 className="text-xl font-bold text-indigo-200 mb-8">AI 어휘력 정밀 진단 (CAT)</h2>
                    
                    <div className="text-left bg-black/20 p-5 rounded-2xl mb-8 space-y-3 text-sm font-bold text-indigo-100 leading-relaxed">
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>문제 유형에 따라 제한 시간이 다릅니다. (상단 게이지 바를 확인하세요)</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>시간이 초과되면 오답 처리되므로 빠르게 생각하고 누르세요.</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-rose-400" size={18}/> <span className="text-white font-black">모르는 단어는 찍지 말고 반드시 [모르겠습니다]를 누르세요. 찍어서 맞춘 단어는 패널티가 부여됩니다.</span></p>
                    </div>

                    <button 
                        onClick={() => setIsStarted(true)}
                        className="w-full py-5 bg-white text-indigo-900 text-xl font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-95"
                    >
                        진단평가 시작하기
                    </button>
                </div>
            </div>
        );
    }

    if (isFinished) {
        return (
            <div className="min-h-screen bg-emerald-600 flex flex-col items-center justify-center p-6 text-white text-center">
                <div className="animate-in zoom-in-95 duration-500 flex flex-col items-center">
                    <CheckCircle size={80} className="mb-6 animate-bounce" />
                    <h1 className="text-4xl font-black mb-4">진단평가 종료</h1>
                    <p className="text-lg font-bold text-emerald-100 mb-2">총 {MAX_QUESTIONS}문항 분석 완료</p>
                    <p className="text-sm font-bold text-emerald-200">AI가 데이터를 분석하여 데스크로 전송하고 있습니다...</p>
                    <Loader className="animate-spin mt-8 text-white" size={32} />
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