/* [서비스 가치] 학생에게는 게임 같은 몰입감을, 학부모에게는 AI 알고리즘의 판단 과정을 100% 투명하게 공개하여 압도적인 등록률을 끌어내는 엔진입니다.
   (🚀 CTO 핫픽스: DB 원본 데이터 보존을 위한 프론트엔드 실시간 정제(Regex) 탑재, 다의어 오답 풀 오류 수정 완결판) */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, AlertTriangle, CheckCircle, Target, X, BarChart2, Clock, MinusCircle, XCircle, BrainCircuit, Maximize, ArrowRight, ChevronRight, ChevronLeft } from 'lucide-react';
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

// 🚀 철자 편집 거리 계산 (레벤슈타인)
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

// 🚀 [CTO 패치] 프론트엔드 전용 텍스트 정제기 (DB 원본 보존용)
// (비밀을) 등 한글 힌트는 살리고 (struck-struck), ((to-v)) 같은 영어 문법 기호만 핀셋 삭제
const cleanMeaning = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\s*\(+[a-zA-Z0-9\s\-\[\]\,~/\.]+\)+\s*/g, '').trim();
};

export default function CATAssessment({ studentName = '임페리얼', initialScore = 300, onComplete }) {
    const [isLoadingPool, setIsLoadingPool] = useState(true);
    const [wordPool, setWordPool] = useState([]);
    
    const [showTutorial, setShowTutorial] = useState(false);
    const [tutorialStep, setTutorialStep] = useState(1);

    const [isStarted, setIsStarted] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [finalStats, setFinalStats] = useState(null); 
    const [rubricReport, setRubricReport] = useState(null); 

    const [transitionState, setTransitionState] = useState(null); 

    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentScore, setCurrentScore] = useState(initialScore); 
    const [currentStep, setCurrentStep] = useState(200); 
    const [currentQ, setCurrentQ] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [answers, setAnswers] = useState([]); 
    
    const timerRef = useRef(null);
    const stateRef = useRef({ currentQ, currentIndex, timeLeft, currentScore, step: currentStep, isTransitioning: false });
    
    const MAX_QUESTIONS = 25; 

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => { alert("이 기기에서는 전체화면이 지원되지 않습니다."); });
        } else {
            if (document.exitFullscreen) { document.exitFullscreen(); }
        }
    };

    useEffect(() => {
        stateRef.current = { currentQ, currentIndex, timeLeft, currentScore, step: currentStep, isTransitioning: !!transitionState };
    }, [currentQ, currentIndex, timeLeft, currentScore, currentStep, transitionState]);

    useEffect(() => {
        const fetchCATPool = async () => {
            setIsLoadingPool(true);
            try {
                const vocaRef = collection(db, 'VocabularyDB');
                const prefixes = ['NVE', 'NVM', 'NVH'];
                let fetchedWords = [];

                const promises = prefixes.map(prefix => {
                    const randomDay = String(Math.floor(Math.random() * 40) + 1).padStart(2, '0');
                    const randomPrefix = `${prefix}1_D${randomDay}`; 
                    return getDocs(query(vocaRef, where(documentId(), '>=', randomPrefix), limit(100)))
                        .then(snap => {
                            if (snap.empty) return getDocs(query(vocaRef, where(documentId(), '>=', prefix), limit(100)));
                            return snap;
                        });
                });

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

    const handleSelectOption = useCallback((selectedOption, isTimeOut = false) => {
        if (stateRef.current.isTransitioning) return; 
        
        clearInterval(timerRef.current);
        stateRef.current.isTransitioning = true;
        
        const { currentQ: q, currentIndex: idx, timeLeft: tLeft, currentScore: score, step } = stateRef.current;
        if (!q) return;

        const isTimeOutOrIdk = isTimeOut || selectedOption === 'TIMEOUT_OR_IDK';
        const isCorrect = !isTimeOutOrIdk && selectedOption === q.answer;

        let tType = 'incorrect';
        if (isTimeOut) tType = 'timeout';
        else if (selectedOption === 'TIMEOUT_OR_IDK') tType = 'pass';
        else if (isCorrect) tType = 'correct';

        setTransitionState({ type: tType, answer: q.answer });

        setTimeout(() => {
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
            }

            newScore = Math.max(0, Math.min(1000, newScore));

            setAnswers(prev => [...prev, { 
                qNum: idx + 1, phase, wordId: q.id, wordText: q.word, correctAnswer: q.answer,
                selectedOption: isTimeOut ? '시간 초과' : (selectedOption === 'TIMEOUT_OR_IDK' ? '모름 (Pass)' : selectedOption),
                isCorrect, difficulty: q.difficulty, scoreBefore: Math.round(score), scoreAfter: Math.round(newScore), type: q.type
            }]);

            setCurrentScore(newScore);
            setTransitionState(null); 

            if (idx < MAX_QUESTIONS - 1) {
                setCurrentIndex(idx + 1);
            } else {
                setIsFinished(true);
            }
        }, 1500); 
    }, [MAX_QUESTIONS]);

    const generateNextQuestion = useCallback((estimatedScore) => {
        if (wordPool.length === 0) return null;
        const availableWords = wordPool.filter(w => !answers.some(a => a.wordId === w.wordId));
        if (availableWords.length === 0) return null;

        availableWords.sort((a, b) => Math.abs((a.meanings[0]?.meaningDifficulty || 0) - estimatedScore) - Math.abs((b.meanings[0]?.meaningDifficulty || 0) - estimatedScore));
        const targetWord = availableWords[0];
        const meaning = targetWord.meanings[0];

        // 🚀 실시간 정제 처리 적용
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
        
        // 🚀 다의어 검증 시 한글 뜻만 사용하도록 로직 정제
        if (desiredType === 'polysemy') {
            let realOpts = targetWord.meanings.map(m => cleanMeaning(m.koreanMeaning));
            realOpts = [...new Set(realOpts)];
            if (realOpts.length < 3) desiredType = 'synonym'; 
        }
        if (desiredType === 'synonym' && (!meaning.synonyms || meaning.synonyms.length === 0)) desiredType = 'basic';

        const type = desiredType;
        let timeLimit = 5; 
        if (type === 'blank') timeLimit = 12;
        else if (type === 'polysemy') timeLimit = 8;
        else if (type === 'synonym') timeLimit = 7;
        
        if (answers.length === 0) timeLimit = Math.max(timeLimit, 7); 

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
            // [Type 1] 기초 뜻: 영어 반의어 철저히 배제 및 실시간 정제
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
            
            // 한글 보기만 남기도록 영문 필터링 강제 적용
            distractors = [...new Set(distractors)].filter(opt => /[가-힣]/.test(opt)).slice(0, 3);

            questionText = targetWord.word; 
            answerText = cleanTargetKorean;
            options = [cleanTargetKorean, ...distractors];
            
            while(options.length < 4) {
                const backup = cleanMeaning(availableWords[Math.floor(Math.random()*availableWords.length)].meanings[0].koreanMeaning);
                if(!options.includes(backup) && /[가-힣]/.test(backup)) options.push(backup);
            }

            hint = answers.length === 0 ? "⚠️ 첫 문제는 UI 적응용 보너스 시간이 주어집니다" : "기초 의미 반사신경 측정";
        }

        return { id: targetWord.wordId, type, word: questionText, answer: answerText, options: shuffleArray(options), timeLimit, difficulty: meaning.meaningDifficulty || 0, hint };
    }, [wordPool, answers]);

    useEffect(() => {
        if (isStarted && !isFinished && !transitionState) { 
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
    }, [currentIndex, isStarted, isFinished, transitionState, currentScore, generateNextQuestion, handleSelectOption, onComplete]);

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
            const stage3Answers = answers.slice(20, 25);
            const stage3CorrectCount = stage3Answers.filter(a => a.isCorrect).length;

            const correctAnswers = answers.filter(a => a.isCorrect).sort((a, b) => b.difficulty - a.difficulty);
            const top5 = correctAnswers.slice(0, 5);
            let top5Avg = 150; 
            if (top5.length > 0) top5Avg = top5.reduce((sum, a) => sum + a.difficulty, 0) / top5.length;

            let lowerErrorPenalty = 0;
            const incorrectAnswers = answers.filter(a => !a.isCorrect);
            incorrectAnswers.forEach(a => {
                if (a.difficulty < top5Avg - 150) lowerErrorPenalty += 30; 
            });

            let finalCalculatedScore = top5Avg - lowerErrorPenalty;
            let bubblePenalty = 0;
            
            if (stage3CorrectCount < 3) {
                finalCalculatedScore -= 150; 
                bubblePenalty = 150;
            }

            const roundedFinalScore = Math.max(0, Math.min(1000, Math.round(finalCalculatedScore)));

            setFinalStats({
                top5Avg: Math.round(top5Avg),
                lowerErrorPenalty,
                stage3CorrectCount,
                bubblePenalty,
                finalScore: roundedFinalScore
            });

            setRubricReport(generateRubricReport(roundedFinalScore, lowerErrorPenalty));
        }
    }, [isFinished, answers, finalStats]);

    // =====================================================================
    // UI 렌더링 영역
    // =====================================================================

    if (isLoadingPool) return <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center text-white"><Loader className="animate-spin mb-4" size={48} /><h2 className="text-xl font-bold">AI 진단 엔진용 단어 풀 구축 중...</h2></div>;

    if (showTutorial) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white selection:bg-none relative">
                <button onClick={() => { setShowTutorial(false); setIsStarted(true); }} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="튜토리얼 건너뛰기"><X size={28} /></button>
                
                <div className="bg-white text-gray-800 p-8 rounded-3xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h2 className="text-2xl font-black text-indigo-900 flex items-center gap-2"><Target size={28}/> 시험 진행 가이드 ({tutorialStep}/4)</h2>
                        <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold">튜토리얼</span>
                    </div>

                    <div className="h-64 flex flex-col justify-center">
                        {tutorialStep === 1 && (
                            <div className="text-center animate-in fade-in slide-in-from-right-4">
                                <h3 className="text-xl font-black text-gray-900 mb-3">유형 1: 뜻 찾기 (기본)</h3>
                                <p className="text-gray-600 mb-6">가장 기본적인 문제입니다. 화면에 영어 단어가 나오면, <br/>제한 시간 내에 알맞은 한국어 뜻을 고르세요.</p>
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
                                onClick={() => { setShowTutorial(false); setIsStarted(true); }}
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
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white text-center relative selection:bg-none">
                <div className="absolute top-6 right-6 flex gap-3">
                    <button onClick={toggleFullScreen} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="전체화면 전환"><Maximize size={28} /></button>
                    <button onClick={() => onComplete(null)} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="시험 닫기"><X size={28} /></button>
                </div>

                <div className="bg-white/10 p-8 rounded-3xl backdrop-blur-md max-w-lg w-full border border-white/20 shadow-2xl animate-in zoom-in-95 mt-10">
                    <Target size={64} className="mx-auto text-indigo-300 mb-6" />
                    <h1 className="text-4xl font-black mb-2">{studentName} 학생</h1>
                    <h2 className="text-xl font-bold text-indigo-200 mb-8">AI 어휘력 정밀 진단 (CAT)</h2>
                    <div className="text-left bg-black/20 p-5 rounded-2xl mb-8 space-y-3 text-sm font-bold text-indigo-100 leading-relaxed">
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>문제 유형(기초 뜻, 다의어, 빈칸추론 등)에 따라 제한 시간이 다르게 주어집니다.</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>시간 내에 풀지 못하거나, 찍어서 맞춘 사실이 AI 알고리즘에 발각되면 거품 점수로 간주되어 강력한 강등 페널티가 부여됩니다.</span></p>
                    </div>
                    <button onClick={() => setShowTutorial(true)} className="w-full py-5 bg-white text-indigo-900 text-xl font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-95">진단평가 시작하기</button>
                </div>
            </div>
        );
    }

    if (isFinished && finalStats && rubricReport) {
        return (
            <div className="fixed inset-0 z-[200] overflow-y-auto bg-gray-50 flex flex-col items-center p-4 sm:p-8" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm text-center">
                                <div className="text-xs font-bold text-gray-400 mb-1">최대 포텐셜 (Top 5 정답 평균)</div>
                                <div className="text-2xl font-black text-indigo-700">{finalStats.top5Avg} 점</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-sm text-center relative">
                                <div className="text-xs font-bold text-gray-400 mb-1">기초 공백 (쉬운 단어 오답)</div>
                                <div className="text-2xl font-black text-rose-600">- {finalStats.lowerErrorPenalty} 점</div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-amber-100 shadow-sm text-center relative">
                                <div className="text-xs font-bold text-gray-400 mb-1">천장 검증 (심화 연속 정답)</div>
                                <div className="text-2xl font-black text-amber-600">{finalStats.stage3CorrectCount} / 5 개</div>
                                {finalStats.bubblePenalty > 0 && <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg rounded-tr-lg">거품 강등 -150</div>}
                            </div>
                        </div>
                    </div>

                    <div className="p-6 md:p-8">
                        <h3 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2"><CheckCircle className="text-emerald-500"/> 전체 문항 상세 트래킹 로그</h3>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar border-2 border-gray-100 rounded-xl bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0 z-10 text-gray-500 font-black">
                                    <tr>
                                        <th className="p-3">문항유형</th>
                                        <th className="p-3">출제 단어 (정답)</th>
                                        <th className="p-3">학생의 선택</th>
                                        <th className="p-3 text-center">결과</th>
                                        <th className="p-3 text-right">점수 변동</th>
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
                                                <div className="text-[10px] font-bold text-emerald-600">정답: {log.correctAnswer}</div>
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
                        <button onClick={() => onComplete(finalStats.finalScore)} className="w-full py-5 bg-gray-900 hover:bg-black text-white text-xl font-black rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                            <Target size={24} /> 데스크로 데이터 연동 및 테스트 종료
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
        <div className="min-h-screen bg-gray-50 flex flex-col selection:bg-none relative overflow-hidden">
            
            {transitionState && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    {transitionState.type === 'correct' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <CheckCircle size={120} className="text-emerald-400 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest">정답!</h2>
                        </div>
                    )}
                    {transitionState.type === 'incorrect' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <XCircle size={120} className="text-rose-500 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest">오답</h2>
                            <p className="mt-6 text-2xl font-bold text-rose-200 bg-black/40 px-6 py-2 rounded-2xl border border-white/10">정답: {transitionState.answer}</p>
                        </div>
                    )}
                    {transitionState.type === 'timeout' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <Clock size={120} className="text-amber-500 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest">시간 초과!</h2>
                            <p className="mt-6 text-2xl font-bold text-amber-200 bg-black/40 px-6 py-2 rounded-2xl border border-white/10">정답: {transitionState.answer}</p>
                        </div>
                    )}
                    {transitionState.type === 'pass' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <MinusCircle size={120} className="text-gray-400 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest">패스 (모름)</h2>
                            <p className="mt-6 text-2xl font-bold text-gray-300 bg-black/40 px-6 py-2 rounded-2xl border border-white/10">정답: {transitionState.answer}</p>
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