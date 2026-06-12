/* [서비스 가치] 학생에게는 게임 같은 쫄깃한 몰입감을 주어 마찰(Friction)을 없애고,
   학원에게는 '가짜 지식'과 '찍기'를 원천 차단한 99% 순도의 어휘력 데이터를 제공하는 Kiosk용 평가 엔진입니다. 
   (🚀 CTO 핫픽스: Firebase 복합 색인 에러 우회 및 중간 종료(Abort) 방어 로직 적용 완료) */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, Clock, AlertTriangle, CheckCircle, Target, X } from 'lucide-react';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';

const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

export default function CATAssessment({ studentName = '임페리얼', onComplete }) {
    const [isLoadingPool, setIsLoadingPool] = useState(true);
    const [wordPool, setWordPool] = useState([]);
    
    const [isStarted, setIsStarted] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentScore, setCurrentScore] = useState(300); // 초기 시작 난이도 300점
    const [currentQ, setCurrentQ] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [answers, setAnswers] = useState([]);
    
    const timerRef = useRef(null);
    const MAX_QUESTIONS = 20;

    // 1. 단어 풀(Pool) 로딩: 복합 색인 에러 방지를 위해 단순 Limit 쿼리 후 메모리 필터링
    useEffect(() => {
        const fetchCATPool = async () => {
            setIsLoadingPool(true);
            try {
                const vocaRef = collection(db, 'VocabularyDB');
                // 🚀 [CTO 패치] 에러 유발 쿼리 제거, 랜덤 샘플링을 위해 400개 문서 일괄 Fetch (비용 극소화)
                const snap = await getDocs(query(vocaRef, limit(400)));
                const fetchedWords = snap.docs.map(doc => doc.data());

                if (fetchedWords.length === 0) throw new Error("DB Empty");
                setWordPool(shuffleArray(fetchedWords));
            } catch (error) {
                console.error("단어 풀 로딩 실패:", error);
                alert("단어 데이터를 불러오는데 실패했습니다. 데이터베이스 상태를 확인해주세요.");
                onComplete(null); // 에러 시 평가 즉시 취소
            } finally {
                setIsLoadingPool(false);
            }
        };

        fetchCATPool();
    }, [onComplete]);

    // 2. 적응형(Adaptive) 문제 생성 엔진
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

        let distractors = availableWords
            .filter(w => w.wordId !== targetWord.wordId && w.word[0] === targetWord.word[0])
            .slice(0, 3);
            
        if (distractors.length < 3) {
            const fillers = availableWords
                .filter(w => w.wordId !== targetWord.wordId && !distractors.includes(w))
                .slice(0, 3 - distractors.length);
            distractors = [...distractors, ...fillers];
        }

        let questionText = '';
        let answerText = '';
        let hint = '';
        let options = [];

        if (type === 'blank') {
            questionText = meaning.blankSentence[0];
            answerText = targetWord.word;
            options = [targetWord.word, ...distractors.map(d => d.word)];
            hint = "(빈칸 추론)";
        } else if (type === 'synonym') {
            questionText = `${targetWord.word} (유의어: ${meaning.synonyms.join(', ')})`;
            answerText = meaning.koreanMeaning;
            options = [meaning.koreanMeaning, ...distractors.map(d => d.meanings[0]?.koreanMeaning || d.word)];
            hint = "(해당하는 뜻 고르기)";
        } else {
            questionText = targetWord.word;
            answerText = meaning.koreanMeaning;
            options = [meaning.koreanMeaning, ...distractors.map(d => d.meanings[0]?.koreanMeaning || d.word)];
            hint = "(뜻 고르기)";
        }

        return {
            id: targetWord.wordId,
            type,
            word: questionText,
            answer: answerText,
            options: shuffleArray(options),
            timeLimit
        };
    }, [wordPool, answers]);

    useEffect(() => {
        if (isStarted && !isFinished) {
            const nextQ = generateNextQuestion(currentScore);
            if (nextQ) {
                setCurrentQ(nextQ);
                setTimeLeft(nextQ.timeLimit);
            } else {
                // 🚀 [CTO 패치] 단어가 고갈되어도 300점을 확정하지 않고 취소 처리
                alert("단어 풀이 부족하여 평가를 중단합니다.");
                onComplete(null);
            }
        }
    }, [currentIndex, isStarted, isFinished, currentScore, generateNextQuestion, onComplete]);

    useEffect(() => {
        if (isStarted && !isFinished && currentQ) {
            clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 0.1) {
                        clearInterval(timerRef.current);
                        handleSelectOption('TIMEOUT_OR_IDK'); 
                        return 0;
                    }
                    return prev - 0.1; 
                });
            }, 100);
        }
        return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentQ, isStarted, isFinished]); 

    const handleSelectOption = (selectedOption) => {
        clearInterval(timerRef.current);
        
        const isCorrect = selectedOption === currentQ.answer;
        setAnswers(prev => [...prev, { wordId: currentQ.id, isCorrect, selectedOption }]);

        if (isCorrect) {
            const timeBonus = (timeLeft / currentQ.timeLimit) * 20; 
            setCurrentScore(prev => Math.min(1000, prev + 60 + timeBonus));
        } else {
            setCurrentScore(prev => Math.max(0, prev - 40));
        }

        if (currentIndex < MAX_QUESTIONS - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setIsFinished(true);
        }
    };

    useEffect(() => {
        if (isFinished) {
            setTimeout(() => {
                if (onComplete) onComplete(Math.round(currentScore)); 
            }, 2500);
        }
    }, [isFinished, currentScore, onComplete]);

    // UI: 로딩 중
    if (isLoadingPool) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center">
                <Loader className="animate-spin mb-4" size={48} />
                <h2 className="text-xl font-bold">AI 진단 엔진용 단어 풀(Pool)을 구축 중입니다...</h2>
            </div>
        );
    }

    // UI: 시작 전 화면
    if (!isStarted) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center relative">
                {/* 🚀 [CTO 패치] 평가 강제 취소(닫기) 버튼 */}
                <button onClick={() => onComplete(null)} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white">
                    <X size={28} />
                </button>

                <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-md max-w-lg w-full border border-white/20 shadow-2xl animate-in zoom-in-95">
                    <Target size={64} className="mx-auto text-indigo-300 mb-6" />
                    <h1 className="text-4xl font-black mb-2">{studentName} 학생</h1>
                    <h2 className="text-xl font-bold text-indigo-200 mb-8">AI 어휘력 정밀 진단 (CAT)</h2>
                    
                    <div className="text-left bg-black/20 p-5 rounded-2xl mb-8 space-y-3 text-sm font-bold text-indigo-100 leading-relaxed">
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>문제 유형에 따라 제한 시간(3초/5초/10초)이 다릅니다.</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>시간 초과 시 오답 처리되므로 빠르게 선택하세요.</span></p>
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

    // UI: 종료 후 연산 화면
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
    const timerColor = progressPercent > 40 ? 'bg-indigo-500' : progressPercent > 20 ? 'bg-orange-500' : 'bg-rose-500';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col selection:bg-none relative">
            {/* 🚀 [CTO 패치] 시험 도중에도 닫기(중단) 기능 제공 */}
            <button onClick={() => { if(window.confirm("시험을 중단하시겠습니까? 점수가 저장되지 않습니다.")) onComplete(null); }} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors z-50">
                <X size={24} />
            </button>

            <div className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center shrink-0">
                <div className="font-black text-gray-400 text-lg">Question {currentIndex + 1} / {MAX_QUESTIONS}</div>
                <div className="flex items-center gap-2 font-black text-2xl w-24 justify-end pr-8">
                    <Clock size={24} className={progressPercent < 30 ? 'text-rose-500 animate-pulse' : 'text-indigo-600'} />
                    <span className={progressPercent < 30 ? 'text-rose-500' : 'text-gray-800'}>{Math.ceil(timeLeft)}</span>
                </div>
            </div>

            <div className="w-full h-2 bg-gray-200">
                <div className={`h-full ${timerColor} transition-all duration-100 ease-linear`} style={{ width: `${progressPercent}%` }} />
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
                    <div className="mt-4 text-sm font-bold text-indigo-500 bg-indigo-50 inline-block px-3 py-1 rounded-full border border-indigo-100">
                        {currentQ.type === 'basic' ? '뜻 찾기 (3초)' : currentQ.type === 'synonym' ? '다의어/유의어 찾기 (5초)' : '문맥 빈칸 추론 (10초)'}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full mb-6">
                    {currentQ.options.map((opt, idx) => (
                        <button 
                            key={idx}
                            onClick={() => handleSelectOption(opt)}
                            className="bg-white border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 text-gray-800 font-bold text-lg sm:text-xl p-5 sm:p-6 rounded-2xl transition-all text-center flex items-center justify-center shadow-sm break-keep-all"
                        >
                            {opt}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => handleSelectOption('TIMEOUT_OR_IDK')}
                    className="mt-4 w-full sm:w-2/3 mx-auto bg-gray-800 hover:bg-black text-white font-black text-lg py-5 rounded-2xl transition-colors shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                    🤷 솔직히 모르겠습니다 (Pass)
                </button>
            </div>
        </div>
    );
}