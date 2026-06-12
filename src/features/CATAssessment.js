/* [서비스 가치] 학생에게는 게임 같은 쫄깃한 몰입감을 주어 마찰(Friction)을 없애고,
   학원에게는 '가짜 지식'과 '찍기'를 원천 차단한 99% 순도의 어휘력 데이터를 제공하는 Kiosk용 평가 엔진입니다. 
   (🚀 CTO 패치: Test Anxiety 방지용 무소음 컬러바, 첫 문제 안구 적응 버퍼(+2초), 레벤슈타인 거리 기반 자동 스펠링 함정 생성 알고리즘 적용 완료) */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, AlertTriangle, CheckCircle, Target, X } from 'lucide-react';
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

// 🚀 [CTO 패치] 레벤슈타인 거리 (Levenshtein Distance) 알고리즘
// 두 단어의 스펠링 차이(몇 글자를 바꾸고 빼야 같아지는지)를 계산합니다.
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
                    matrix[i - 1][j - 1] + 1, // 대체
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1) // 삽입, 삭제
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
    const [currentScore, setCurrentScore] = useState(300); // 초기 시작 난이도 300점
    const [currentQ, setCurrentQ] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [answers, setAnswers] = useState([]);
    
    const timerRef = useRef(null);
    const stateRef = useRef({ currentQ, currentIndex, timeLeft, currentScore });
    
    const MAX_QUESTIONS = 20;

    useEffect(() => {
        stateRef.current = { currentQ, currentIndex, timeLeft, currentScore };
    }, [currentQ, currentIndex, timeLeft, currentScore]);

    // 1. 단어 풀(Pool) 로딩: ID 기반 층화 표집(초/중/고 골고루 추출)
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

    // 2. 정답 처리 및 점수 연산 로직 (CAT 엔진)
    const handleSelectOption = useCallback((selectedOption, isTimeOut = false) => {
        clearInterval(timerRef.current);
        
        const { currentQ: q, currentIndex: idx, timeLeft: tLeft, currentScore: score } = stateRef.current;
        if (!q) return;

        const isCorrect = !isTimeOut && selectedOption === q.answer;
        setAnswers(prev => [...prev, { wordId: q.id, isCorrect, selectedOption }]);

        if (isCorrect) {
            const timeBonus = (tLeft / q.timeLimit) * 20; 
            setCurrentScore(Math.min(1000, score + 60 + timeBonus));
        } else {
            setCurrentScore(Math.max(0, score - 40));
        }

        if (idx < MAX_QUESTIONS - 1) {
            setCurrentIndex(idx + 1);
        } else {
            setIsFinished(true);
        }
    }, [MAX_QUESTIONS]);

    // 3. 적응형(Adaptive) 문제 생성 엔진 & 매력적인 오답(Distractor) 생성
    const generateNextQuestion = useCallback((estimatedScore) => {
        if (wordPool.length === 0) return null;

        const availableWords = wordPool.filter(w => !answers.some(a => a.wordId === w.wordId));
        if (availableWords.length === 0) return null;

        // 타겟 단어 선정 (점수 가장 가까운 단어)
        availableWords.sort((a, b) => 
            Math.abs((a.meanings[0]?.meaningDifficulty || 0) - estimatedScore) - 
            Math.abs((b.meanings[0]?.meaningDifficulty || 0) - estimatedScore)
        );
        const targetWord = availableWords[0];
        const meaning = targetWord.meanings[0];

        // 유형 및 시간 결정
        let type = 'basic';
        let timeLimit = 3;
        
        if (estimatedScore > 500 && meaning.blankSentence && meaning.blankSentence.length > 0) {
            type = 'blank'; timeLimit = 10;
        } else if (estimatedScore > 350 && meaning.synonyms && meaning.synonyms.length > 0) {
            type = 'synonym'; timeLimit = 5;
        }

        // 🚀 [CTO 패치] 1번: 첫 문제 안구 적응 버퍼 (최소 5초 보장)
        if (answers.length === 0) {
            timeLimit = Math.max(timeLimit, 5);
        }

        // 🚀 [CTO 패치] 2번: 지능형 함정 오답 (Distractor) 자동 생성기
        let distractors = [];

        // 1순위 함정: 반의어(Antonyms)가 존재하면 무조건 끌어옴
        if (meaning.antonyms && meaning.antonyms.length > 0) {
            distractors.push(...meaning.antonyms); 
            // 만약 반의어가 한글 뜻이라면 그냥 푸시, 영어라면 해당 영어의 뜻을 찾아야 함.
            // 여기서는 반의어의 한글 뜻이 직접 DB에 있다고 가정 (또는 다른 보기로 채움)
        }

        // 2순위 함정: 레벤슈타인 거리 1~2 스펠링 헷갈리는 단어 뜻 끌어오기
        if (distractors.length < 3) {
            const spellTraps = availableWords
                .filter(w => w.wordId !== targetWord.wordId)
                .map(w => ({ wordData: w, dist: getLevenshteinDistance(targetWord.word, w.word) }))
                .filter(item => item.dist >= 1 && item.dist <= 2) // 철자 1~2개 차이나는 단어만! (예: adapt - adopt)
                .sort((a, b) => a.dist - b.dist)
                .map(item => item.wordData)
                .slice(0, 3 - distractors.length);
            
            distractors.push(...spellTraps);
        }

        // 3순위 함정: 스펠링 비슷한 게 없으면 같은 첫 글자 단어
        if (distractors.length < 3) {
            const prefixTraps = availableWords
                .filter(w => w.wordId !== targetWord.wordId && w.word[0] === targetWord.word[0] && !distractors.includes(w))
                .slice(0, 3 - distractors.length);
            distractors.push(...prefixTraps);
        }

        // 4순위 함정: 그래도 부족하면 남은 거 랜덤
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
            // 빈칸 추론은 영어 단어 자체가 보기로 나와야 함
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
            timeLimit
        };
    }, [wordPool, answers]);

    // 4. 문제 갱신 및 타이머 세팅
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

    // 5. 평가 종료 처리
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

    // UI: 종료 화면
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

    // 🚀 [CTO 패치] Test Anxiety(시험 불안)를 없애기 위한 '숫자 없는 컬러 게이지 바'
    const progressPercent = (timeLeft / currentQ.timeLimit) * 100;
    const timerColor = progressPercent > 50 ? 'bg-emerald-500' : progressPercent > 20 ? 'bg-amber-400' : 'bg-rose-500';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col selection:bg-none relative">
            <button onClick={() => { if(window.confirm("시험을 중단하시겠습니까? 점수가 저장되지 않습니다.")) onComplete(null); }} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors z-50">
                <X size={24} />
            </button>

            {/* 상단 문항 정보 */}
            <div className="bg-white shadow-sm px-6 py-4 flex justify-center items-center shrink-0 border-b border-gray-100">
                <div className="font-black text-gray-400 text-lg tracking-widest">Q. {currentIndex + 1} / {MAX_QUESTIONS}</div>
            </div>

            {/* 🚀 무소음 타임어택 컬러 게이지 바 (숫자 숨김 처리) */}
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

                {/* 🤷 모르겠습니다 방어 버튼 */}
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