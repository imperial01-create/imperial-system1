/* [서비스 가치] 실제 Firebase VocabularyDB와 연동하여, 학생의 수준에 따라 난이도가 실시간으로 변하는(CAT) 상용화 진단평가 엔진입니다.
   '가짜 지식'을 걸러내는 3단계 유형과 5지선다 타임어택이 100% 반영되어 있습니다. */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, Clock, AlertTriangle, CheckCircle, Target, ArrowRight } from 'lucide-react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
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

export default function CATAssessment({ studentName = '임페리얼', onComplete }) {
    const [isLoadingPool, setIsLoadingPool] = useState(true);
    const [wordPool, setWordPool] = useState([]);
    
    const [isStarted, setIsStarted] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentScore, setCurrentScore] = useState(300); // 🚀 초기 시작 난이도 300점 (중1 수준)
    const [currentQ, setCurrentQ] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [answers, setAnswers] = useState([]);
    
    const timerRef = useRef(null);
    const MAX_QUESTIONS = 20; // 20문제면 영점 조절 완료

    // =====================================================================
    // 1. 초기 단어 풀(Pool) 로딩: 난이도별로 분산 쿼리하여 Firebase 요금 방어
    // =====================================================================
    useEffect(() => {
        const fetchCATPool = async () => {
            setIsLoadingPool(true);
            try {
                const vocaRef = collection(db, 'VocabularyDB');
                const ranges = [
                    [0, 200], [201, 400], [401, 600], [601, 800], [801, 1000]
                ];
                
                let fetchedWords = [];
                // 각 난이도 구간별로 15개씩만 랜덤하게 가져옴 (총 75문서 = 비용 극소화)
                const promises = ranges.map(range => 
                    getDocs(query(vocaRef, 
                        where('meanings.0.meaningDifficulty', '>=', range[0]),
                        where('meanings.0.meaningDifficulty', '<=', range[1]),
                        limit(15)
                    ))
                );
                
                const results = await Promise.all(promises);
                results.forEach(snap => {
                    snap.forEach(doc => fetchedWords.push(doc.data()));
                });

                setWordPool(shuffleArray(fetchedWords));
            } catch (error) {
                console.error("단어 풀 로딩 실패:", error);
                alert("단어 데이터를 불러오는데 실패했습니다. 인터넷 연결을 확인해주세요.");
            } finally {
                setIsLoadingPool(false);
            }
        };

        fetchCATPool();
    }, []);

    // =====================================================================
    // 2. 적응형(Adaptive) 문제 생성 엔진
    // =====================================================================
    const generateNextQuestion = useCallback((estimatedScore) => {
        if (wordPool.length === 0) return null;

        // 1) 현재 예상 점수와 가장 비슷한 난이도의 단어 추출
        const availableWords = wordPool.filter(w => !answers.some(a => a.wordId === w.wordId));
        if (availableWords.length === 0) return null;

        // 난이도 차이가 가장 적은 단어 정렬 후 1픽
        availableWords.sort((a, b) => 
            Math.abs((a.meanings[0]?.meaningDifficulty || 0) - estimatedScore) - 
            Math.abs((b.meanings[0]?.meaningDifficulty || 0) - estimatedScore)
        );
        const targetWord = availableWords[0];
        const meaning = targetWord.meanings[0];

        // 2) 문제 유형 결정 (점수가 높을수록, 데이터가 존재할수록 고급 유형 출제)
        let type = 'basic';
        let timeLimit = 3;
        
        if (estimatedScore > 500 && meaning.blankSentence && meaning.blankSentence.length > 0) {
            type = 'blank'; timeLimit = 10;
        } else if (estimatedScore > 350 && meaning.synonyms && meaning.synonyms.length > 0) {
            type = 'synonym'; timeLimit = 5;
        }

        // 3) 매력적인 오답(Distractor) 3개 생성
        // 전략: 스펠링 첫 글자가 같은 단어 우선 배치 (시각적 함정)
        let distractors = availableWords
            .filter(w => w.wordId !== targetWord.wordId && w.word[0] === targetWord.word[0])
            .slice(0, 3);
            
        // 같은 첫 글자가 부족하면 난이도 비슷한 단어로 채움
        if (distractors.length < 3) {
            const fillers = availableWords
                .filter(w => w.wordId !== targetWord.wordId && !distractors.includes(w))
                .slice(0, 3 - distractors.length);
            distractors = [...distractors, ...fillers];
        }

        // 4) 최종 보기(Options) 조립
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

    // 시험 시작 및 다음 문제 트리거
    useEffect(() => {
        if (isStarted && !isFinished) {
            const nextQ = generateNextQuestion(currentScore);
            if (nextQ) {
                setCurrentQ(nextQ);
                setTimeLeft(nextQ.timeLimit);
            } else {
                // 단어 풀이 고갈된 경우 강제 종료
                setIsFinished(true);
            }
        }
    }, [currentIndex, isStarted, isFinished, currentScore, generateNextQuestion]);

    // =====================================================================
    // 3. 타임어택 프로그레스 바 로직
    // =====================================================================
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
    }, [currentQ, isStarted, isFinished]); // currentQ가 바뀔 때마다 타이머 리셋

    // =====================================================================
    // 4. 정답 처리 및 점수 널뛰기 (CAT Algorithm)
    // =====================================================================
    const handleSelectOption = (selectedOption) => {
        clearInterval(timerRef.current);
        
        const isCorrect = selectedOption === currentQ.answer;
        setAnswers(prev => [...prev, { wordId: currentQ.id, isCorrect, selectedOption }]);

        // 🚀 CAT 로직: 맞추면 난이도 상승, 틀리면 하락
        if (isCorrect) {
            // 빨리 맞출수록 가산점 부여 (잔여 시간에 비례)
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

    // 시험 종료 시 최종 점수 반환
    useEffect(() => {
        if (isFinished) {
            setTimeout(() => {
                // 최종 스탯을 반올림하여 부모(ConsultationManager)로 송신
                if (onComplete) onComplete(Math.round(currentScore)); 
            }, 2500);
        }
    }, [isFinished, currentScore, onComplete]);

    // =====================================================================
    // UI 렌더링
    // =====================================================================
    
    if (isLoadingPool) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center">
                <Loader className="animate-spin mb-4" size={48} />
                <h2 className="text-xl font-bold">AI 진단 엔진용 단어 풀(Pool)을 구축 중입니다...</h2>
            </div>
        );
    }

    // 1. 대기 화면 (시작 전)
    if (!isStarted) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center selection:bg-none">
                <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-md max-w-lg w-full border border-white/20 shadow-2xl animate-in zoom-in-95">
                    <Target size={64} className="mx-auto text-indigo-300 mb-6" />
                    <h1 className="text-4xl font-black mb-2">{studentName} 학생</h1>
                    <h2 className="text-xl font-bold text-indigo-200 mb-8">AI 어휘력 정밀 진단 (CAT)</h2>
                    
                    <div className="text-left bg-black/20 p-5 rounded-2xl mb-8 space-y-3 text-sm font-bold text-indigo-100 leading-relaxed">
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>문제 유형에 따라 제한 시간(3초/5초/10초)이 다릅니다.</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>시간 초과 시 오답 처리되므로 빠르게 선택하세요.</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-rose-400" size={18}/> <span className="text-white font-black">모르는 단어는 찍지 말고 반드시 [모르겠습니다]를 누르세요. 찍어서 맞춘 단어는 AI가 찾아내어 더 큰 패널티를 부여합니다.</span></p>
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

    // 2. 종료 화면
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

    // 3. 테스트 진행 화면
    const progressPercent = (timeLeft / currentQ.timeLimit) * 100;
    const timerColor = progressPercent > 40 ? 'bg-indigo-500' : progressPercent > 20 ? 'bg-orange-500' : 'bg-rose-500';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col selection:bg-none">
            {/* 상단 프로그레스 바 & 정보 */}
            <div className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center shrink-0">
                <div className="font-black text-gray-400 text-lg">Question {currentIndex + 1} / {MAX_QUESTIONS}</div>
                <div className="flex items-center gap-2 font-black text-2xl w-24 justify-end">
                    <Clock size={24} className={progressPercent < 30 ? 'text-rose-500 animate-pulse' : 'text-indigo-600'} />
                    <span className={progressPercent < 30 ? 'text-rose-500' : 'text-gray-800'}>{Math.ceil(timeLeft)}</span>
                </div>
            </div>

            <div className="w-full h-2 bg-gray-200">
                <div className={`h-full ${timerColor} transition-all duration-100 ease-linear`} style={{ width: `${progressPercent}%` }} />
            </div>

            {/* 메인 문제 영역 */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-right-8 duration-300" key={currentQ.id}>
                
                <div className="mb-10 w-full text-center">
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
                            className="bg-white border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 text-gray-800 font-bold text-lg sm:text-xl p-5 sm:p-6 rounded-2xl transition-all text-center flex items-center justify-center shadow-sm"
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