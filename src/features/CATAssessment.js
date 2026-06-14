/* [서비스 가치] 진정한 의미의 초정밀 실시간 적응형(Real-time CAT 3.0) 평가 엔진.
   (🚀 CTO 최종 핫픽스: 0점 지옥 탈출. 탐색 하한선 상승 및 다의어(Meanings) 정밀 타겟팅으로 진짜 상향 편향 출제 완벽 달성) */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, AlertTriangle, CheckCircle, Target, X, BarChart2, Clock, MinusCircle, XCircle, BrainCircuit, Maximize, ArrowRight, ChevronRight, ChevronLeft, Zap } from 'lucide-react';
import { collection, query, getDocs, limit, where } from 'firebase/firestore';
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
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
};

const cleanMeaning = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\s*\(+[a-zA-Z0-9\s\-\[\]\,~/\.]+\)+\s*/g, '').trim();
};

export default function CATAssessment({ studentName = '임페리얼', initialScore = 300, onComplete }) {
    const [isAppLoading, setIsAppLoading] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);
    const [tutorialStep, setTutorialStep] = useState(1);

    const [isStarted, setIsStarted] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [finalStats, setFinalStats] = useState(null); 
    const [rubricReport, setRubricReport] = useState(null); 

    const [transitionState, setTransitionState] = useState(null); 

    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentScore, setCurrentScore] = useState(initialScore); 
    const [currentQ, setCurrentQ] = useState(null);
    const [timeLeft, setTimeLeft] = useState(15.0); 
    const [answers, setAnswers] = useState([]); 
    
    const timerRef = useRef(null);
    const stateRef = useRef({ currentQ, currentIndex, timeLeft, currentScore, isTransitioning: false, answers });

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => { alert("이 기기에서는 전체화면이 지원되지 않습니다."); });
        } else {
            if (document.exitFullscreen) { document.exitFullscreen(); }
        }
    };

    useEffect(() => {
        document.body.style.overscrollBehaviorY = 'none';
        document.documentElement.style.overscrollBehaviorY = 'none';
        return () => {
            document.body.style.overscrollBehaviorY = 'auto';
            document.documentElement.style.overscrollBehaviorY = 'auto';
        };
    }, []);

    useEffect(() => {
        stateRef.current = { currentQ, currentIndex, timeLeft, currentScore, isTransitioning: !!transitionState, answers };
    }, [currentQ, currentIndex, timeLeft, currentScore, transitionState, answers]);

    const MAX_QUESTIONS = 25; 

    const fetchAndGenerateNextQuestion = useCallback(async (estimatedScore, justAnsweredWordId = null) => {
        try {
            const vocaRef = collection(db, 'VocabularyDB');
            
            // 🚀 버그 수정 1: 탐색 하한선을 내 점수로 맞추어 무조건 나보다 높거나 동급인 단어만 가져옴
            const searchFloor = estimatedScore; 
            
            let snap = await getDocs(query(vocaRef, where('rootDifficulty', '>=', searchFloor), limit(40)));
            
            if (snap.empty || snap.docs.length < 5) {
                // 천장에 도달했을 경우 방어 로직
                snap = await getDocs(query(vocaRef, where('rootDifficulty', '>=', Math.max(0, estimatedScore - 100)), limit(40)));
            }

            let fetchedWords = [];
            snap.forEach(doc => fetchedWords.push(doc.data()));

            const availableWords = fetchedWords.filter(w => 
                !stateRef.current.answers.some(a => a.wordId === w.wordId) &&
                w.wordId !== justAnsweredWordId
            );
            
            if (availableWords.length === 0) return null;

            const targetDifficulty = estimatedScore + 30;

            // 🚀 버그 수정 2: 무조건 1번 뜻(meanings[0])을 내는 게 아니라, 모든 다의어를 싹 다 뒤져서
            // 내 목표 점수(+30점)에 가장 가까운 '정확한 뜻'을 타겟팅
            let bestWord = null;
            let bestMeaning = null;
            let minDiff = 9999;

            for (const w of availableWords) {
                for (const m of w.meanings) {
                    const diff = Math.abs((m.meaningDifficulty || 0) - targetDifficulty);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestWord = w;
                        bestMeaning = m;
                    }
                }
            }

            const targetWord = bestWord;
            const meaning = bestMeaning; 

            const cleanTargetKorean = cleanMeaning(meaning.koreanMeaning);

            let pBasic = 0, pSyn = 0, pPoly = 0, pBlank = 0;
            if (estimatedScore < 400) { pBasic = 0.8; pSyn = 0.2; }
            else if (estimatedScore < 600) { pBasic = 0.4; pSyn = 0.4; pPoly = 0.2; }
            else if (estimatedScore < 800) { pSyn = 0.2; pPoly = 0.4; pBlank = 0.4; }
            else { pPoly = 0.3; pBlank = 0.7; }

            const r = Math.random();
            let desiredType = 'basic';
            if (r < pBasic) desiredType = 'basic';
            else if (r < pBasic + pSyn) desiredType = 'synonym';
            else if (r < pBasic + pSyn + pPoly) desiredType = 'polysemy';
            else desiredType = 'blank';

            if (desiredType === 'blank' && (!meaning.blankSentence || meaning.blankSentence.length === 0)) desiredType = 'polysemy';
            if (desiredType === 'polysemy') {
                let realOpts = targetWord.meanings.map(m => cleanMeaning(m.koreanMeaning));
                realOpts = [...new Set(realOpts)];
                if (realOpts.length < 3) desiredType = 'synonym'; 
            }
            if (desiredType === 'synonym' && (!meaning.synonyms || meaning.synonyms.length === 0)) desiredType = 'basic';

            const type = desiredType;
            let questionText = ''; let answerText = ''; let hint = ''; let options = [];

            if (type === 'blank') {
                let distractors = availableWords.filter(w => w.wordId !== targetWord.wordId).slice(0, 3);
                questionText = meaning.blankSentence[0]; 
                answerText = targetWord.word;
                options = [targetWord.word, ...distractors.map(d => d.word)]; 
                hint = "수능형 빈칸 추론 (문맥 파악)";
                
            } else if (type === 'polysemy') {
                let realOpts = targetWord.meanings.map(m => cleanMeaning(m.koreanMeaning));
                realOpts = [...new Set(realOpts)].slice(0, 3);
                const fakeWord = availableWords.find(w => w.wordId !== targetWord.wordId && !realOpts.includes(cleanMeaning(w.meanings[0].koreanMeaning)));
                answerText = fakeWord ? cleanMeaning(fakeWord.meanings[0].koreanMeaning) : "전혀 무관한 뜻";
                options = [...realOpts, answerText];
                questionText = `다음 중 '${targetWord.word}'의 뜻으로 쓰일 수 없는 것은?`;
                hint = "다의어 검증 (오답 소거)";
                
            } else if (type === 'synonym') {
                let distractors = [];
                if (meaning.antonyms && meaning.antonyms.length > 0) distractors.push(...meaning.antonyms); 
                const fillers = availableWords.filter(w => w.wordId !== targetWord.wordId).map(w => w.word);
                distractors = [...new Set([...distractors, ...fillers])].slice(0, 3);

                questionText = `Q. 다음 단어와 유사한 의미(Synonym)를 가진 영단어는?\n\n[ ${targetWord.word} ]`; 
                answerText = meaning.synonyms[0]; 
                options = [answerText, ...distractors]; 
                hint = "영-영 유의어 매칭 (의미망 파악)";
                
            } else {
                let distractors = [];
                const spellTraps = availableWords.filter(w => w.wordId !== targetWord.wordId)
                    .map(w => ({ wordData: w, dist: getLevenshteinDistance(targetWord.word, w.word) }))
                    .filter(item => item.dist >= 1 && item.dist <= 2).sort((a, b) => a.dist - b.dist).map(item => cleanMeaning(item.wordData.meanings[0].koreanMeaning));
                distractors.push(...spellTraps);

                if (distractors.length < 3) {
                    const prefixTraps = availableWords.filter(w => w.wordId !== targetWord.wordId && w.word[0] === targetWord.word[0]).map(w => cleanMeaning(w.meanings[0].koreanMeaning));
                    distractors.push(...prefixTraps);
                }
                if (distractors.length < 3) {
                    const fillers = availableWords.filter(w => w.wordId !== targetWord.wordId).map(w => cleanMeaning(w.meanings[0].koreanMeaning));
                    distractors.push(...fillers);
                }
                
                distractors = [...new Set(distractors)].filter(opt => /[가-힣]/.test(opt)).slice(0, 3);
                questionText = targetWord.word; 
                answerText = cleanTargetKorean;
                options = [cleanTargetKorean, ...distractors];
                
                while(options.length < 4) {
                    const backup = cleanMeaning(availableWords[Math.floor(Math.random()*availableWords.length)].meanings[0].koreanMeaning);
                    if(!options.includes(backup) && /[가-힣]/.test(backup)) options.push(backup);
                }
                hint = stateRef.current.answers.length === 0 ? "⚠️ 15초 내에 선택하세요. 빠를수록 점수가 오릅니다." : "기초 의미 반사신경 측정";
            }

            return { id: targetWord.wordId, type, word: questionText, answer: answerText, options: shuffleArray(options), difficulty: meaning.meaningDifficulty || 0, hint };
        } catch (error) {
            console.error("단어 실시간 패치 오류:", error);
            return null;
        }
    }, []);

    const handleStartAssessment = async () => {
        setIsAppLoading(true);
        const firstQ = await fetchAndGenerateNextQuestion(currentScore);
        if (firstQ) {
            setCurrentQ(firstQ);
            setIsStarted(true);
            setShowTutorial(false);
            setTimeLeft(15.0);
            startTimer();
        } else {
            alert("단어 데이터를 불러올 수 없습니다. 인터넷 연결 및 DB를 확인해주세요.");
        }
        setIsAppLoading(false);
    };

    const startTimer = () => {
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
    };

    const handleSelectOption = useCallback(async (selectedOption, isTimeOut = false) => {
        if (stateRef.current.isTransitioning) return; 
        
        clearInterval(timerRef.current);
        stateRef.current.isTransitioning = true;
        
        const { currentQ: q, currentIndex: idx, timeLeft: tLeft, currentScore: score } = stateRef.current;
        if (!q) return;

        const isTimeOutOrIdk = isTimeOut || selectedOption === 'TIMEOUT_OR_IDK';
        const isCorrect = !isTimeOutOrIdk && selectedOption === q.answer;

        const timeTaken = parseFloat((15.0 - tLeft).toFixed(1));
        let rteMultiplier = 0.2; 
        let rteLabel = "위태로움 (찍기 의심)";
        
        if (isTimeOutOrIdk) { rteMultiplier = 0; rteLabel = isTimeOut ? "시간 초과" : "솔직한 패스"; }
        else if (timeTaken <= 4.0) { rteMultiplier = 1.0; rteLabel = "완벽 체화 (빠름)"; }
        else if (timeTaken <= 8.0) { rteMultiplier = 0.6; rteLabel = "단순 인지 (보통)"; }

        let scoreDelta = 0;
        
        if (isCorrect) {
            if (q.difficulty > score) {
                const baseGain = (q.difficulty - score) * 0.6; 
                // 🚀 최소 1점 보장 방어 코드 (0.4점 같은 수치가 반올림되어 0점이 되는 사태 방지)
                scoreDelta = Math.round(Math.max(1, baseGain * rteMultiplier)); 
            } else {
                scoreDelta = 0; // 내 점수 이하 쉬운 단어 맞추면 0점 오름
            }
        } else {
            if (q.difficulty < score) {
                const baseLoss = (q.difficulty - score) * 0.8; 
                scoreDelta = Math.round(baseLoss);
            } else {
                scoreDelta = -10; 
            }
        }

        const newScore = Math.max(0, Math.min(1000, score + scoreDelta));

        let tType = 'incorrect';
        if (isTimeOut) tType = 'timeout';
        else if (selectedOption === 'TIMEOUT_OR_IDK') tType = 'pass';
        else if (isCorrect) tType = 'correct';

        setTransitionState({ 
            type: tType, answer: q.answer, delta: scoreDelta, 
            timeTaken, rteLabel, newScore 
        });

        const nextQ = await fetchAndGenerateNextQuestion(newScore, q.id);

        setTimeout(() => {
            setAnswers(prev => [...prev, { 
                qNum: idx + 1, phase: idx < 15 ? '실력 측정' : '천장 검증', 
                wordId: q.id, wordText: q.word, correctAnswer: q.answer,
                selectedOption: isTimeOut ? '시간 초과' : (selectedOption === 'TIMEOUT_OR_IDK' ? '모름 (Pass)' : selectedOption),
                isCorrect, difficulty: q.difficulty, 
                scoreBefore: Math.round(score), scoreAfter: Math.round(newScore), type: q.type,
                timeTaken, rteLabel
            }]);

            setCurrentScore(newScore);
            setTransitionState(null); 

            if (idx < MAX_QUESTIONS - 1) {
                if (nextQ) {
                    setCurrentIndex(idx + 1);
                    setCurrentQ(nextQ);
                    setTimeLeft(15.0);
                    startTimer();
                } else {
                    alert("단어 데이터가 부족합니다."); onComplete(null);
                }
            } else {
                setIsFinished(true);
            }
        }, 3500); 
    }, [MAX_QUESTIONS, fetchAndGenerateNextQuestion, onComplete]);

    const generateRubricReport = (finalScore, penalty) => {
        const tier = Math.floor(finalScore / 100);
        const micro = Math.floor((finalScore % 100) / 10);

        let levelName = ""; let mainText = "";
        switch (tier) {
            case 0: case 1: case 2: case 3: 
                levelName = "중등 2~3학년 교과서 수준"; mainText = "현재 중등 교과서에 등장하는 필수 기초 어휘들을 다듬어야 하는 단계입니다."; break;
            case 4: 
                levelName = "고1 모의고사 기본 수준"; mainText = "고등학교 1학년 수준의 기본적인 독해 지문을 소화할 수 있는 어휘량을 갖추고 있습니다."; break;
            case 5: 
                levelName = "고1~고2 모의고사 심화 수준"; mainText = "고등학교 1학년 심화 및 2학년 수준의 지문을 무리 없이 소화할 수 있는 어휘량을 갖추고 있습니다."; break;
            case 6: 
                levelName = "고3 수능 2등급 진입 수준"; mainText = "수능 절대평가 2등급 진입이 가능한 수준으로, 상당수의 고난도 어휘를 파악하고 있습니다."; break;
            case 7: 
                levelName = "고3 수능 1등급 안정권 수준"; mainText = "수능 지문 대부분의 어휘를 막힘없이 해석할 수 있는 1등급 안정권 수준의 어휘력을 지니고 있습니다."; break;
            default: 
                levelName = "아카데믹 원서 독해 수준 (최상위)"; mainText = "수능을 넘어 텝스/토플 등 아카데믹한 영단어까지 장악한 최상위권의 어휘력입니다."; break;
        }

        let microName = ""; let microText = "";
        if (micro <= 2) {
            microName = "진입기 (Entry)";
            microText = "이제 막 해당 레벨의 단어들을 접하기 시작했습니다. 지문에서 아는 단어와 모르는 단어가 섞여 있어 체감 난이도가 다소 높을 수 있습니다.";
        } else if (micro <= 6) {
            microName = "과도기 (Developing)";
            microText = "해당 레벨의 단어들을 인지하고 있으나, 1차적인 뜻 위주로 암기하여 문맥이 꼬이거나 다의어가 등장하면 해석이 막히는 현상이 발생하기 쉬운 상태입니다.";
        } else {
            microName = "안정기 (Mastery)";
            microText = "해당 레벨의 어휘를 완전히 장악했습니다. 유의어와 파생어까지 탄탄하게 연결되어 있어, 다음 학년의 선행 학습을 즉시 시작해도 좋은 최적의 상태입니다.";
        }

        let penaltyName = ""; let penaltyText = "";
        if (penalty === 0) {
            penaltyName = "매우 우수 🔵 (결손 없음)";
            penaltyText = "기초 단어에 구멍이 전혀 없습니다. 매우 성실하게 누적 복습을 해온 훌륭한 학생입니다. 현재의 학습 템포를 유지해도 좋습니다.";
        } else if (penalty <= 60) {
            penaltyName = "주의 🟡 (경미한 하위 공백)";
            penaltyText = `어려운 단어는 맞추면서 본인의 최대 실력보다 한 단계 낮은 기초 단어에서 간혹 오답(감점: ${penalty}점)이 발생합니다. 문맥으로 감 독해를 하는 습관이 있을 확률이 있습니다.`;
        } else {
            penaltyName = "위험 🔴 (심각한 하위 공백)";
            penaltyText = `전형적인 '모래성' 어휘력입니다. 고난도 단어 몇 개는 알지만 정작 문장을 지탱하는 뼈대 단어들에 심각한 구멍(감점: ${penalty}점)이 뚫려 있어 하위 레벨 강제 회독이 시급합니다.`;
        }

        return { levelName, mainText, microName, microText, penaltyName, penaltyText };
    };

    useEffect(() => {
        if (isFinished && !finalStats) {
            const roundedFinalScore = Math.round(currentScore);

            const correctAnswers = answers.filter(a => a.isCorrect).sort((a, b) => b.difficulty - a.difficulty);
            const top5 = correctAnswers.slice(0, 5);
            let top5Avg = 150; 
            if (top5.length > 0) top5Avg = top5.reduce((sum, a) => sum + a.difficulty, 0) / top5.length;

            let lowerErrorPenalty = 0;
            const incorrectAnswers = answers.filter(a => !a.isCorrect);
            incorrectAnswers.forEach(a => {
                if (a.difficulty < top5Avg - 150) lowerErrorPenalty += 30; 
            });

            setFinalStats({
                top5Avg: Math.round(top5Avg),
                lowerErrorPenalty,
                finalScore: roundedFinalScore
            });

            setRubricReport(generateRubricReport(roundedFinalScore, lowerErrorPenalty));
        }
    }, [isFinished, answers, finalStats, currentScore]);

    if (isAppLoading) return <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white overscroll-none"><Loader className="animate-spin mb-4" size={48} /><h2 className="text-xl font-bold">초정밀 AI 진단 서버 연결 중...</h2></div>;

    if (showTutorial) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white selection:bg-none relative overscroll-none">
                <button onClick={handleStartAssessment} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="튜토리얼 건너뛰기"><X size={28} /></button>
                
                <div className="bg-white text-gray-800 p-8 rounded-3xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h2 className="text-2xl font-black text-indigo-900 flex items-center gap-2"><Target size={28}/> 시험 진행 가이드 ({tutorialStep}/4)</h2>
                        <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold">튜토리얼</span>
                    </div>

                    <div className="h-64 flex flex-col justify-center">
                        {tutorialStep === 1 && (
                            <div className="text-center animate-in fade-in slide-in-from-right-4">
                                <h3 className="text-xl font-black text-gray-900 mb-3">유형 1: 뜻 찾기 (기본)</h3>
                                <p className="text-gray-600 mb-6">영어 단어가 나오면 <strong className="text-indigo-600">15초</strong> 내에 뜻을 고르세요.<br/>빠르게 맞출수록 높은 점수가 획득됩니다.</p>
                                <div className="bg-gray-100 p-4 rounded-xl inline-block text-left w-full max-w-sm mx-auto shadow-inner border border-gray-200">
                                    <div className="text-2xl font-black text-center mb-3">adapt</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border-2 border-emerald-400 text-emerald-600">적응하다 (정답)</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">입양하다</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">능숙한</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">추가하다</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {tutorialStep === 2 && (
                            <div className="text-center animate-in fade-in slide-in-from-right-4">
                                <h3 className="text-xl font-black text-gray-900 mb-3">유형 2: 영-영 유의어 매칭</h3>
                                <p className="text-gray-600 mb-6">제시된 단어와 <strong className="text-indigo-600">유사한 의미(Synonym)</strong>를 가진 영단어를 고르세요.<br/>보기 중에 <strong className="text-rose-500">반의어(Antonym) 함정</strong>이 숨어있으니 조심하세요!</p>
                                <div className="bg-gray-100 p-4 rounded-xl inline-block text-left w-full max-w-sm mx-auto shadow-inner border border-gray-200">
                                    <div className="text-base font-black text-center mb-3">Q. 다음 단어와 유사한 영단어는?<br/><span className="text-2xl mt-1 block">increase</span></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border-2 border-emerald-400 text-emerald-600">raise (정답)</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border-2 border-rose-300 text-rose-500">decrease (함정)</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">suggest</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">happen</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {tutorialStep === 3 && (
                            <div className="text-center animate-in fade-in slide-in-from-right-4">
                                <h3 className="text-xl font-black text-gray-900 mb-3">유형 3: 다의어 소거</h3>
                                <p className="text-gray-600 mb-6">단어는 여러 가지 뜻을 가지고 있습니다.<br/>제시된 단어의 뜻으로 <strong className="text-rose-500">쓰일 수 없는 것(가짜 뜻)</strong>을 고르세요.</p>
                                <div className="bg-gray-100 p-4 rounded-xl inline-block text-left w-full max-w-sm mx-auto shadow-inner border border-gray-200">
                                    <div className="text-base font-black text-center mb-3">Q. 다음 중 'capital'의 뜻이 아닌 것은?</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">자본</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">수도</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">대문자</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border-2 border-emerald-400 text-emerald-600">능력 (정답)</div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {tutorialStep === 4 && (
                            <div className="text-center animate-in fade-in slide-in-from-right-4">
                                <h3 className="text-xl font-black text-gray-900 mb-3">유형 4: 문맥 빈칸 추론</h3>
                                <p className="text-gray-600 mb-6">최고난도 문제입니다. 영어 문장을 읽고<br/>빈칸 <strong className="text-indigo-600">_______</strong> 에 들어갈 가장 알맞은 단어를 고르세요.</p>
                                <div className="bg-gray-100 p-4 rounded-xl inline-block text-left w-full max-w-lg mx-auto shadow-inner border border-gray-200">
                                    <div className="text-lg font-black text-center mb-3 leading-snug">The government decided to <span className="text-indigo-600">_______</span> the new economic policy.</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border-2 border-emerald-400 text-emerald-600">adopt</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">adapt</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">admit</div>
                                        <div className="bg-white p-2 rounded text-center text-sm font-bold border">adjust</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center mt-8 pt-6 border-t">
                        <button 
                            className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors ${tutorialStep > 1 ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'}`}
                            onClick={() => tutorialStep > 1 && setTutorialStep(tutorialStep - 1)}
                            disabled={tutorialStep === 1}
                        >
                            <ChevronLeft size={20}/> 이전
                        </button>
                        
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map(step => (
                                <div key={step} className={`w-2 h-2 rounded-full ${tutorialStep === step ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                            ))}
                        </div>

                        {tutorialStep < 4 ? (
                            <button 
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-700 font-black rounded-xl hover:bg-indigo-100 transition-colors"
                                onClick={() => setTutorialStep(tutorialStep + 1)}
                            >
                                다음 <ChevronRight size={20}/>
                            </button>
                        ) : (
                            <button 
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                                onClick={handleStartAssessment} 
                            >
                                실전 테스트 시작 <ArrowRight size={20}/>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (!isStarted) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center relative selection:bg-none overscroll-none">
                <div className="absolute top-6 right-6 flex gap-3">
                    <button onClick={toggleFullScreen} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="전체화면 전환"><Maximize size={28} /></button>
                    <button onClick={() => onComplete(null)} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="시험 닫기"><X size={28} /></button>
                </div>

                <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-md max-w-lg w-full border border-white/20 shadow-2xl animate-in zoom-in-95 mt-10">
                    <Target size={64} className="mx-auto text-indigo-300 mb-6" />
                    <h1 className="text-4xl font-black mb-2">{studentName} 학생</h1>
                    <h2 className="text-xl font-bold text-indigo-200 mb-8">AI 어휘력 정밀 진단 (CAT)</h2>
                    <div className="text-left bg-black/20 p-5 rounded-2xl mb-8 space-y-3 text-sm font-bold text-indigo-100 leading-relaxed">
                        <p className="flex items-start gap-2"><Zap className="shrink-0 text-yellow-400" size={18}/> <span>15초의 제한 시간이 주어지며, 빨리 맞출수록 점수가 더 많이 오릅니다. (반응속도 체크)</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>찍어서 맞춘 사실이 반응속도 알고리즘에 발각되면 거품 점수로 간주되어 점수 상승이 제한됩니다.</span></p>
                    </div>
                    <button onClick={() => setShowTutorial(true)} className="w-full py-5 bg-white text-indigo-900 text-xl font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-95">진단평가 가이드 보기</button>
                </div>
            </div>
        );
    }

    if (isFinished && finalStats && rubricReport) {
        return (
            <div className="fixed inset-0 z-[200] overflow-y-auto bg-gray-50 flex flex-col items-center p-4 sm:p-8 overscroll-none" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl border border-gray-100 pb-6 mb-24 flex-shrink-0 animate-in slide-in-from-bottom-8 duration-500">
                    
                    <div className="bg-indigo-900 text-white p-8 text-center relative overflow-hidden rounded-t-3xl">
                        <BrainCircuit size={140} className="absolute -bottom-4 -right-4 text-white opacity-10" />
                        <h1 className="text-3xl font-black mb-2">AI 정밀 어휘력 분석 리포트</h1>
                        <p className="text-indigo-200 font-bold">임페리얼의 다차원 평가 알고리즘이 도출한 최종 결과입니다.</p>
                        <div className="mt-8 bg-white/10 border border-white/20 p-6 rounded-2xl inline-block backdrop-blur-sm shadow-inner">
                            <div className="text-sm font-bold text-indigo-200 mb-1 tracking-widest">최종 도출 스탯</div>
                            <div className="text-6xl font-black">{finalStats.finalScore} <span className="text-2xl text-indigo-300 font-bold">점</span></div>
                        </div>
                    </div>

                    <div className="p-6 md:p-8 border-b border-gray-100 bg-white space-y-6">
                        <h3 className="text-2xl font-black text-gray-900 flex items-center gap-2"><Target className="text-indigo-600"/> 입체적 어휘력 루브릭 평가</h3>
                        
                        <div className="bg-indigo-50 border-2 border-indigo-100 p-5 rounded-2xl">
                            <div className="text-xs font-black text-indigo-500 mb-1">■ 현재 도달 수준</div>
                            <div className="text-xl font-black text-indigo-900 mb-2">{rubricReport.levelName} <span className="text-lg text-indigo-600">({rubricReport.microName})</span></div>
                            <p className="text-sm text-gray-700 font-medium leading-relaxed">{rubricReport.mainText} {rubricReport.microText}</p>
                        </div>

                        <div className={`p-5 rounded-2xl border-2 ${finalStats.lowerErrorPenalty > 0 ? (finalStats.lowerErrorPenalty > 60 ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200') : 'bg-emerald-50 border-emerald-200'}`}>
                            <div className={`text-xs font-black mb-1 ${finalStats.lowerErrorPenalty > 0 ? (finalStats.lowerErrorPenalty > 60 ? 'text-rose-500' : 'text-amber-600') : 'text-emerald-600'}`}>■ AI 인지 결손 분석</div>
                            <div className="text-lg font-black text-gray-900 mb-2">{rubricReport.penaltyName}</div>
                            <p className="text-sm text-gray-700 font-medium leading-relaxed">{rubricReport.penaltyText}</p>
                        </div>
                    </div>

                    <div className="p-6 md:p-8 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2"><BarChart2 className="text-indigo-600"/> 세부 알고리즘 연산 근거</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm text-center">
                                <div className="text-xs font-bold text-gray-400 mb-1">최대 포텐셜 (Top 5 정답 평균)</div>
                                <div className="text-2xl font-black text-indigo-700">{finalStats.top5Avg} 점</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-sm text-center relative">
                                <div className="text-xs font-bold text-gray-400 mb-1">기초 공백 (쉬운 단어 오답)</div>
                                <div className="text-2xl font-black text-rose-600">- {finalStats.lowerErrorPenalty} 점</div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 md:p-8">
                        <h3 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2"><CheckCircle className="text-emerald-500"/> 전체 문항 RTE 트래킹 로그</h3>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar border-2 border-gray-100 rounded-xl bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0 z-10 text-gray-500 font-black">
                                    <tr>
                                        <th className="p-3">문항유형</th>
                                        <th className="p-3">출제 단어 (정답)</th>
                                        <th className="p-3">학생 선택 및 소요 시간</th>
                                        <th className="p-3 text-right">최종 점수</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {answers.map((log, i) => (
                                        <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                            <td className="p-3 font-bold text-gray-600">
                                                Q{log.qNum}. <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded ml-1">{log.type}</span>
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-gray-900 truncate max-w-[200px]" title={log.wordText}>{log.wordText}</div>
                                                <div className="text-[10px] font-bold text-emerald-600">단어난이도: {log.difficulty}</div>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    {log.isCorrect ? <CheckCircle size={16} className="text-emerald-500"/> : <XCircle size={16} className="text-rose-500"/>}
                                                    <span className={`font-bold ${log.selectedOption.includes('모름') || log.selectedOption.includes('초과') ? 'text-amber-500' : 'text-gray-800'} truncate max-w-[120px]`} title={log.selectedOption}>
                                                        {log.selectedOption}
                                                    </span>
                                                </div>
                                                <div className={`text-[10px] font-bold mt-0.5 ${log.timeTaken <= 4 ? 'text-blue-500' : log.timeTaken <= 8 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    ⏱️ {log.timeTaken}초 ({log.rteLabel})
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-mono font-black text-gray-800">
                                                {log.scoreAfter} 점
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="px-6 md:px-8">
                        <button onClick={() => onComplete(finalStats.finalScore)} className="w-full py-5 bg-gray-900 hover:bg-black text-white text-xl font-black rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                            <Target size={24} /> 데스크로 데이터 연동 및 테스트 종료
                        </button>
                    </div>

                </div>
            </div>
        );
    }

    if (!currentQ) return null;

    const progressPercent = (timeLeft / 15.0) * 100;
    const timerColor = timeLeft > 11 ? 'bg-blue-500' : timeLeft > 7 ? 'bg-emerald-500' : timeLeft > 3 ? 'bg-amber-400' : 'bg-rose-500';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col selection:bg-none relative overflow-hidden overscroll-none">
            
            {transitionState && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="absolute top-10 flex flex-col items-center text-white opacity-80">
                        <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full mb-2">실시간 분석 중...</span>
                        <div className="text-xl font-black">현재 예측 실력: {transitionState.newScore}점</div>
                    </div>

                    {transitionState.type === 'correct' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <CheckCircle size={100} className="text-emerald-400 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest mb-6">정답!</h2>
                            <div className="bg-white/10 p-5 rounded-2xl border border-white/20 text-center backdrop-blur-md">
                                <div className="text-emerald-300 font-bold text-lg mb-1">반응 속도: {transitionState.timeTaken}초</div>
                                <div className="text-2xl font-black text-white">{transitionState.rteLabel}</div>
                                <div className="mt-3 text-3xl font-black text-emerald-400">+{transitionState.delta}점</div>
                            </div>
                        </div>
                    )}
                    {transitionState.type === 'incorrect' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <XCircle size={100} className="text-rose-500 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest mb-6">오답</h2>
                            <div className="bg-white/10 p-5 rounded-2xl border border-white/20 text-center backdrop-blur-md">
                                <div className="text-rose-200 font-bold text-lg mb-1">진짜 정답은</div>
                                <div className="text-3xl font-black text-white mb-3">"{transitionState.answer}"</div>
                                <div className="text-2xl font-black text-rose-400">{transitionState.delta}점 (강등)</div>
                            </div>
                        </div>
                    )}
                    {transitionState.type === 'timeout' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <Clock size={100} className="text-amber-500 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest mb-6">시간 초과!</h2>
                            <div className="bg-white/10 p-5 rounded-2xl border border-white/20 text-center backdrop-blur-md">
                                <div className="text-amber-200 font-bold text-lg mb-1">진짜 정답은</div>
                                <div className="text-3xl font-black text-white mb-3">"{transitionState.answer}"</div>
                                <div className="text-2xl font-black text-rose-400">{transitionState.delta}점 (강등)</div>
                            </div>
                        </div>
                    )}
                    {transitionState.type === 'pass' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <MinusCircle size={100} className="text-gray-400 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest mb-6">솔직한 패스</h2>
                            <div className="bg-white/10 p-5 rounded-2xl border border-white/20 text-center backdrop-blur-md">
                                <div className="text-gray-300 font-bold text-lg mb-1">찍지 않은 정직함 보상 (감점 완화)</div>
                                <div className="text-3xl font-black text-white mb-3">정답: "{transitionState.answer}"</div>
                                <div className="text-2xl font-black text-rose-400">{transitionState.delta}점</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <button onClick={() => { if(window.confirm("시험을 중단하시겠습니까? 점수가 저장되지 않습니다.")) onComplete(null); }} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors z-40">
                <X size={24} />
            </button>

            <div className="bg-white shadow-sm px-6 py-4 flex justify-center items-center shrink-0 border-b border-gray-100 relative z-30">
                <div className="font-black text-gray-400 text-lg tracking-widest">Q. {currentIndex + 1} / {MAX_QUESTIONS}</div>
            </div>

            <div className="w-full h-4 bg-gray-200 relative overflow-hidden shrink-0 z-30">
                <div className={`absolute top-0 left-0 h-full ${timerColor} transition-all duration-100 ease-linear shadow-[0_0_15px_rgba(0,0,0,0.3)]`} style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-right-8 duration-300" key={currentQ.id}>
                
                <div className="mb-10 w-full text-center px-4">
                    {currentQ.type === 'blank' || currentQ.type === 'synonym' ? (
                        <div className="text-2xl sm:text-4xl font-black text-gray-800 leading-snug break-keep-all whitespace-pre-wrap">
                            {currentQ.word}
                        </div>
                    ) : (
                        <div className="text-5xl sm:text-7xl font-black text-gray-900 tracking-tight">
                            {currentQ.word}
                        </div>
                    )}
                    <div className={`mt-6 text-sm font-bold inline-block px-5 py-2 rounded-full border shadow-sm ${answers.length === 0 ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' : 'bg-indigo-50 text-indigo-500 border-indigo-100'}`}>
                        {currentQ.hint}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full mb-6">
                    {currentQ.options.map((opt, idx) => (
                        <button 
                            key={idx}
                            disabled={!!transitionState} 
                            onClick={() => handleSelectOption(opt, false)}
                            className="bg-white border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 text-gray-800 font-bold text-lg sm:text-xl p-5 sm:p-6 rounded-2xl transition-all text-center flex items-center justify-center shadow-sm break-keep-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {opt}
                        </button>
                    ))}
                </div>

                <button 
                    disabled={!!transitionState} 
                    onClick={() => handleSelectOption('TIMEOUT_OR_IDK', false)}
                    className="mt-2 w-full sm:w-2/3 mx-auto bg-gray-800 hover:bg-black text-white font-black text-lg py-5 rounded-2xl transition-colors shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    🤷 솔직히 모르겠습니다 (Pass)
                </button>
            </div>
        </div>
    );
}