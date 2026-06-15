/* [서비스 가치] 인터넷 연결 없이도 작동하는 압도적 속도의 초정밀 오프라인 CAT 4.0 엔진.
   (🚀 업데이트: 20단계 초정밀 루브릭(50점 단위) 및 구간 내 마이크로 지수(진입/과도/안정) 적용) */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Target, X, BarChart2, Clock, MinusCircle, XCircle, CheckCircle, BrainCircuit, Maximize, ArrowRight, ChevronRight, ChevronLeft, Zap, AlertTriangle } from 'lucide-react';
import vocaData from '../data/vocaDB.json';

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
    const [showTutorial, setShowTutorial] = useState(false);
    const [tutorialStep, setTutorialStep] = useState(1);
    const [countdown, setCountdown] = useState(null); 
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
    
    const stateRef = useRef({ 
        currentQ, currentIndex, timeLeft, currentScore, isTransitioning: false, answers, 
        correctStreak: 0, wrongStreak: 0, maxRight: 0, minWrong: 1000, 
        oscillationCount: 0, lastAnswerIsCorrect: null 
    });

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => { console.log(err); });
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
        stateRef.current = { 
            ...stateRef.current,
            currentQ, currentIndex, timeLeft, currentScore, isTransitioning: !!transitionState, answers 
        };
    }, [currentQ, currentIndex, timeLeft, currentScore, transitionState, answers]);

    const MAX_QUESTIONS = 25; 

    const fetchAndGenerateNextQuestion = useCallback((estimatedScore, justAnsweredWordId = null) => {
        try {
            const availableWords = vocaData.filter(w => 
                !stateRef.current.answers.some(a => a.wordId === w.wordId) &&
                w.wordId !== justAnsweredWordId
            );
            
            if (availableWords.length === 0) return null;

            const { correctStreak, wrongStreak, oscillationCount } = stateRef.current;
            
            let targetDifficulty = estimatedScore;
            
            if (oscillationCount === 0) {
                if (correctStreak > 0) targetDifficulty += 30 + (correctStreak * 20); 
                else if (wrongStreak > 0) targetDifficulty -= 30 + (wrongStreak * 20); 
                else targetDifficulty += 30; 
            } else if (oscillationCount === 1) {
                if (correctStreak > 0) targetDifficulty += 10 + (correctStreak * 10); 
                else if (wrongStreak > 0) targetDifficulty -= 10 + (wrongStreak * 10); 
                else targetDifficulty += 10; 
            } else {
                targetDifficulty += (Math.random() > 0.5 ? 5 : -5);
            }

            const jitter = Math.floor(Math.random() * 15) - 7; 
            targetDifficulty += jitter;

            let bestWord = null;
            let bestMeaning = null;
            let minDiff = 9999;

            const shuffledAvailableWords = shuffleArray([...availableWords]);

            for (const w of shuffledAvailableWords) {
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
            const targetPOS = meaning.partOfSpeech || '';
            const cleanTargetKorean = cleanMeaning(meaning.koreanMeaning);

            let pBasic = 0, pSyn = 0, pPoly = 0;
            if (estimatedScore < 400) { pBasic = 0.8; pSyn = 0.2; }
            else if (estimatedScore < 600) { pBasic = 0.4; pSyn = 0.4; pPoly = 0.2; }
            else if (estimatedScore < 800) { pSyn = 0.2; pPoly = 0.4; }
            else { pPoly = 0.3; }

            const r = Math.random();
            let desiredType = 'basic';
            if (r < pBasic) desiredType = 'basic';
            else if (r < pBasic + pSyn) desiredType = 'synonym';
            else if (r < pBasic + pSyn + pPoly) desiredType = 'polysemy';
            else desiredType = 'blank';

            let uniqueMeanings = [];
            let seen = new Set();
            for (let m of targetWord.meanings) {
                let clean = cleanMeaning(m.koreanMeaning);
                if (!seen.has(clean) && clean.length > 0) {
                    seen.add(clean);
                    uniqueMeanings.push(m);
                }
            }

            if (desiredType === 'blank' && (!meaning.blankSentence || meaning.blankSentence.length === 0)) desiredType = 'polysemy';
            if (desiredType === 'polysemy' && uniqueMeanings.length < 3) desiredType = 'synonym'; 
            if (desiredType === 'synonym' && (!meaning.synonyms || meaning.synonyms.length === 0)) desiredType = 'basic';

            const type = desiredType;
            let questionText = ''; let answerText = ''; let hint = ''; let options = [];
            let finalDifficulty = meaning.meaningDifficulty || 0;

            if (type === 'blank') {
                let distractors = availableWords.filter(w => w.wordId !== targetWord.wordId).map(w => w.word);
                distractors = shuffleArray(distractors).filter(opt => opt !== targetWord.word).slice(0, 3);
                questionText = meaning.blankSentence[0]; 
                answerText = targetWord.word;
                options = [targetWord.word, ...distractors]; 
                hint = "수능형 빈칸 추론 (문맥 파악)";
            } else if (type === 'polysemy') {
                let selectedMeanings = shuffleArray(uniqueMeanings).slice(0, 3);
                let realOpts = selectedMeanings.map(m => cleanMeaning(m.koreanMeaning));
                finalDifficulty = Math.max(...selectedMeanings.map(m => m.meaningDifficulty || 0));

                const fakeWord = shuffleArray([...availableWords]).find(w => 
                    w.wordId !== targetWord.wordId && 
                    !realOpts.includes(cleanMeaning(w.meanings[0].koreanMeaning))
                );
                answerText = fakeWord ? cleanMeaning(fakeWord.meanings[0].koreanMeaning) : "전혀 무관한 뜻";
                options = [...realOpts, answerText];
                questionText = `다음 중 '${targetWord.word}'의 뜻으로 쓰일 수 없는 것은?`;
                hint = "다의어 검증 (오답 소거)";
            } else if (type === 'synonym') {
                let distractors = [];
                if (meaning.antonyms && meaning.antonyms.length > 0) distractors.push(...meaning.antonyms); 
                const fillers = availableWords.filter(w => w.wordId !== targetWord.wordId);
                const shuffledFillers = shuffleArray(fillers).map(w => w.word);
                distractors = [...new Set([...distractors, ...shuffledFillers])];
                answerText = meaning.synonyms[0]; 
                distractors = distractors.filter(opt => opt !== answerText).slice(0, 3);
                questionText = `Q. 다음 단어와 유사한 의미(Synonym)를 가진 영단어는?\n\n[ ${targetWord.word} ]`; 
                options = [answerText, ...distractors]; 
                hint = "영-영 유의어 매칭 (의미망 파악)";
            } else {
                let distractors = [];
                let posFilteredWords = availableWords;
                if (targetPOS) {
                    posFilteredWords = availableWords.filter(w => w.meanings.some(m => m.partOfSpeech === targetPOS));
                    if (posFilteredWords.length < 10) posFilteredWords = availableWords; 
                }
                const spellTraps = shuffleArray([...posFilteredWords])
                    .filter(w => w.wordId !== targetWord.wordId)
                    .map(w => ({ wordData: w, dist: getLevenshteinDistance(targetWord.word, w.word) }))
                    .filter(item => item.dist >= 1 && item.dist <= 2)
                    .sort((a, b) => a.dist - b.dist)
                    .map(item => cleanMeaning(item.wordData.meanings[0].koreanMeaning));
                const validSpellTrap = spellTraps.find(t => /[가-힣]/.test(t) && t !== cleanTargetKorean);
                if (validSpellTrap) distractors.push(validSpellTrap);

                let attempts = 0;
                while(distractors.length < 3 && attempts < 50) {
                    attempts++;
                    const randomFiller = posFilteredWords[Math.floor(Math.random() * posFilteredWords.length)];
                    const randomMeaning = cleanMeaning(randomFiller.meanings[0].koreanMeaning);
                    if(/[가-힣]/.test(randomMeaning) && randomMeaning !== cleanTargetKorean && !distractors.includes(randomMeaning)) {
                        distractors.push(randomMeaning);
                    }
                }
                distractors = distractors.slice(0, 3);
                questionText = targetWord.word; 
                answerText = cleanTargetKorean;
                options = [cleanTargetKorean, ...distractors];
                hint = stateRef.current.answers.length === 0 ? "⚠️ 15초 내에 선택하세요." : `기초 의미 인지 측정${targetPOS ? ` [${targetPOS}]` : ''}`;
            }

            return { id: targetWord.wordId, type, word: questionText, answer: answerText, options: shuffleArray(options), difficulty: finalDifficulty, hint };
        } catch (error) {
            console.error("로컬 오프라인 문제 생성 오류:", error);
            return null;
        }
    }, []);

    const startTimer = useCallback(() => {
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
    }, []); 

    const handlePrepareStart = () => {
        setShowTutorial(false);
        setCountdown(3);
    };

    useEffect(() => {
        if (countdown === null) return;
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            handleStartAssessment();
            setCountdown(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countdown]);

    const handleStartAssessment = () => {
        const firstQ = fetchAndGenerateNextQuestion(currentScore);
        if (firstQ) {
            setCurrentQ(firstQ);
            setIsStarted(true);
            setTimeLeft(15.0);
            startTimer();
        } else {
            alert("단어 데이터 로드에 실패했습니다.");
        }
    };

    const handleSelectOption = useCallback((selectedOption, isTimeOut = false) => {
        if (stateRef.current.isTransitioning) return; 
        
        clearInterval(timerRef.current);
        stateRef.current.isTransitioning = true;
        
        const { currentQ: q, currentIndex: idx, timeLeft: tLeft, currentScore: score } = stateRef.current;
        let { correctStreak, wrongStreak, maxRight, minWrong, oscillationCount, lastAnswerIsCorrect } = stateRef.current;
        if (!q) return;

        const isTimeOutOrIdk = isTimeOut || selectedOption === 'TIMEOUT_OR_IDK';
        const isCorrect = !isTimeOutOrIdk && selectedOption === q.answer;

        const timeTaken = parseFloat((15.0 - tLeft).toFixed(1));
        let rteMultiplier = 0.2; 
        let rteLabel = "";
        
        if (isTimeOutOrIdk) { rteMultiplier = 0; rteLabel = isTimeOut ? "시간 초과" : "Pass (판단 유보)"; }
        else if (timeTaken <= 4.0) { rteMultiplier = 1.0; rteLabel = "빠른 정답 (완벽 체화)"; }
        else if (timeTaken <= 8.0) { rteMultiplier = 0.6; rteLabel = "정상 반응 (단순 인지)"; }
        else { rteMultiplier = 0.4; rteLabel = "지연 반응 (불안정/찍기 의심)"; }

        let scoreDelta = 0;

        if (isCorrect) maxRight = Math.max(maxRight, q.difficulty);
        else minWrong = Math.min(minWrong, q.difficulty);

        let isTurningPoint = false;
        if (stateRef.current.answers.length > 0 && lastAnswerIsCorrect !== null && isCorrect !== lastAnswerIsCorrect) {
            oscillationCount += 1;
            isTurningPoint = true;
        }
        lastAnswerIsCorrect = isCorrect;

        if (isTurningPoint && oscillationCount === 1) {
            let midPoint = (maxRight + minWrong) / 2;
            if (minWrong === 1000 || maxRight === 0) midPoint = (score + q.difficulty) / 2;

            scoreDelta = Math.round(midPoint - score);
            
            if (isCorrect && scoreDelta < 0) scoreDelta = Math.max(2, Math.round(Math.abs(scoreDelta) * 0.1)); 
            if (!isCorrect && scoreDelta > 0) scoreDelta = -Math.max(2, Math.round(Math.abs(scoreDelta) * 0.1)); 

            if (!isCorrect) {
                rteLabel = "오답 (상위 임계점 감지 ➔ 중심점 회귀)";
            } else {
                rteLabel = "정답 (하위 임계점 방어 ➔ 중심점 회귀)";
            }
            
            if (isCorrect) { correctStreak = 1; wrongStreak = 0; }
            else { wrongStreak = 1; correctStreak = 0; }

        } else if (isTurningPoint && oscillationCount >= 2) {
            let micro = Math.max(3, Math.min(7, 3 + Math.abs(q.difficulty - score) * 0.05));
            if (isCorrect) {
                scoreDelta = Math.round(micro * (rteMultiplier > 0 ? 1 : 0.5));
                rteLabel = "정답 (실력 핀포인트 안착 ⚖️)";
                correctStreak = 1; wrongStreak = 0;
            } else {
                scoreDelta = -Math.round(micro);
                rteLabel = "오답 (실력 핀포인트 안착 ⚖️)";
                wrongStreak = 1; correctStreak = 0;
            }

        } else if (oscillationCount === 0) {
            if (isCorrect) {
                correctStreak += 1;
                let streakBonus = 0;
                if (correctStreak === 2) streakBonus = 20;
                else if (correctStreak === 3) streakBonus = 40;
                else if (correctStreak >= 4) streakBonus = 70; 

                let baseGain = q.difficulty > score ? (q.difficulty - score) * 0.5 : 15;
                scoreDelta = Math.round(Math.max(15, baseGain) * rteMultiplier) + streakBonus;
                if (streakBonus > 0) rteLabel += ` (${correctStreak}연속 정답 / 쾌속 상향 🚀)`;
            } else {
                wrongStreak += 1;
                let dropPenalty = isTimeOutOrIdk ? 40 : 30;
                if (q.difficulty < score) dropPenalty += (score - q.difficulty) * 0.4; 
                let streakDrop = 0;
                if (wrongStreak === 2) streakDrop = 20;
                else if (wrongStreak >= 3) streakDrop = 40;

                scoreDelta = -Math.round(dropPenalty + streakDrop);
                if (streakDrop > 0) rteLabel += ` (${wrongStreak}연속 오답 / 쾌속 하향 📉)`;
            }

        } else if (oscillationCount === 1) {
            if (isCorrect) {
                correctStreak += 1;
                let baseGain = q.difficulty > score ? (q.difficulty - score) * 0.3 : 10;
                scoreDelta = Math.round(Math.max(12, baseGain) * rteMultiplier);
                rteLabel += " (감속 탐색 중 / 구간 좁히기 🔍)";
            } else {
                wrongStreak += 1;
                let dropPenalty = isTimeOutOrIdk ? 25 : 15;
                if (q.difficulty < score) dropPenalty += (score - q.difficulty) * 0.2;
                scoreDelta = -Math.round(Math.max(12, dropPenalty));
                rteLabel += " (감속 탐색 중 / 구간 좁히기 🔍)";
            }
            
        } else {
            let micro = Math.max(3, Math.min(7, 3 + Math.abs(q.difficulty - score) * 0.05));
            if (isCorrect) {
                correctStreak += 1;
                scoreDelta = Math.round(micro * (rteMultiplier > 0 ? 1 : 0.5));
                rteLabel += " (구간 안착 / 미세 조정 ⚖️)";
            } else {
                wrongStreak += 1;
                scoreDelta = -Math.round(micro);
                rteLabel += " (구간 안착 / 미세 조정 ⚖️)";
            }
        }

        const newScore = Math.max(0, Math.min(1000, score + scoreDelta));
        
        stateRef.current.correctStreak = correctStreak; 
        stateRef.current.wrongStreak = wrongStreak;
        stateRef.current.oscillationCount = oscillationCount;
        stateRef.current.lastAnswerIsCorrect = lastAnswerIsCorrect;
        stateRef.current.maxRight = maxRight;
        stateRef.current.minWrong = minWrong;

        let tType = 'incorrect';
        if (isTimeOut) tType = 'timeout';
        else if (selectedOption === 'TIMEOUT_OR_IDK') tType = 'pass';
        else if (isCorrect) tType = 'correct';

        setTransitionState({ 
            type: tType, answer: q.answer, delta: scoreDelta, 
            timeTaken, rteLabel, newScore 
        });

        const nextQ = fetchAndGenerateNextQuestion(newScore, q.id);

        setTimeout(() => {
            
            let phaseStr = '쾌속 탐색기';
            if (oscillationCount === 1) phaseStr = '감속 탐색기';
            if (oscillationCount >= 2) phaseStr = '티어 안착기';

            setAnswers(prev => [...prev, { 
                qNum: idx + 1, phase: phaseStr, 
                wordId: q.id, wordText: q.word, correctAnswer: q.answer,
                selectedOption: isTimeOut ? '시간 초과' : (selectedOption === 'TIMEOUT_OR_IDK' ? 'Pass' : selectedOption),
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
                    onComplete(null);
                }
            } else {
                setIsFinished(true);
            }
        }, 1800); 
    }, [MAX_QUESTIONS, fetchAndGenerateNextQuestion, onComplete, startTimer]);

    // 🚀 [CTO 패치] 20단계 (50점 단위) 정밀 평가 매핑 로직
    const generateRubricReport = (finalScore, penalty) => {
        
        let levelName = ""; 
        let mainText = "";

        if (finalScore <= 50) { levelName = "파닉스/초저"; mainText = "알파벳 음가를 겨우 떼었으며, sight words(I, you, am) 위주의 인지 수준입니다."; }
        else if (finalScore <= 100) { levelName = "초등 3~4학년"; mainText = "과일, 색깔, 가족 등 주변의 구체적인 사물을 지칭하는 기초 명사 위주 암기 수준입니다."; }
        else if (finalScore <= 150) { levelName = "초등 5~6학년"; mainText = "일상생활과 관련된 기본 동사(go, eat, make)와 간단한 형용사를 인지하나 스펠링 실수가 잦습니다."; }
        else if (finalScore <= 200) { levelName = "예비 중1"; mainText = "중학 필수 단어장에 입문하며, 품사(명사/동사)의 개념을 어렴풋이 이해하기 시작합니다."; }
        else if (finalScore <= 250) { levelName = "중1 수준"; mainText = "교과서 지문에 나오는 필수 어휘를 암기하지만, 다의어의 경우 첫 번째 뜻만 아는 경향이 있습니다."; }
        else if (finalScore <= 300) { levelName = "중2 수준"; mainText = "불규칙 동사의 3단 변화를 인지하며, 기초적인 구동사(look for, give up)를 외우기 시작합니다."; }
        else if (finalScore <= 350) { levelName = "중3 기본"; mainText = "추상 명사가 등장하면 해석 속도가 느려지나, 기초 접사(un-, -ly)를 인지하기 시작합니다."; }
        else if (finalScore <= 400) { levelName = "예비 고1"; mainText = "고등 필수 어휘장 1회독을 시작할 단계로, 뜻은 알지만 문맥 내 뉘앙스 파악은 아직 부족합니다."; }
        else if (finalScore <= 450) { levelName = "고1 모의고사"; mainText = "고1 학력평가 지문의 70% 정도 해독 가능하며, 주제 찾기는 되나 빈칸 추론 어휘에서 막힙니다."; }
        else if (finalScore <= 500) { levelName = "고1 마스터"; mainText = "고1 수준에서 모르는 단어는 거의 없으며, 단어의 파생형(success/succeed/successful) 구분이 가능합니다."; }
        else if (finalScore <= 550) { levelName = "고2 모의고사"; mainText = "철학, 환경, 심리 등 추상적인 고2 지문 어휘 및 다의어(objective 등)의 심화 뜻을 인지합니다."; }
        else if (finalScore <= 600) { levelName = "고2 마스터"; mainText = "반의어/유의어를 묶어서 암기하고, 모르는 단어가 나와도 접두/접미사로 유추를 시도할 수 있습니다."; }
        else if (finalScore <= 650) { levelName = "예비 고3"; mainText = "수능 기초 어휘를 마스터했습니다. EBS 수능특강 기준 한 페이지당 모르는 단어가 5~7개 정도입니다."; }
        else if (finalScore <= 700) { levelName = "수능 3등급 선"; mainText = "어휘 때문에 주제를 틀리진 않으나, 선지에 나온 까다로운 단어를 몰라서 오답을 고르는 단계입니다."; }
        else if (finalScore <= 750) { levelName = "수능 2등급 선"; mainText = "고난도 구동사 및 수능 빈출 다의어를 완벽 숙지하여 2등급 진입이 안정적인 수준입니다."; }
        else if (finalScore <= 800) { levelName = "수능 1등급 선"; mainText = "킬러 문항에 등장하는 철자가 비슷하고 헷갈리는 혼동어휘를 완벽히 구별해 냅니다."; }
        else if (finalScore <= 850) { levelName = "1등급 안정권"; mainText = "문맥을 통해 처음 보는 단어의 뜻을 거의 정확하게 추론해 내며, 문장 해석력과 시너지를 냅니다."; }
        else if (finalScore <= 900) { levelName = "최상위권"; mainText = "텝스/토플 수준의 고급 어휘력을 보유하여, 비유적/은유적 단어 사용을 원어민처럼 느낍니다."; }
        else if (finalScore <= 950) { levelName = "경찰대/사관학교"; mainText = "수능 범위를 초과하는 학술적/전문적 어휘까지 섭렵하여 어휘로 인해 해석이 막히는 일이 없습니다."; }
        else { levelName = "수능 출제자급"; mainText = "수능 영어 텍스트에 한정하여 모르는 단어가 0에 수렴하며, 기출 분석만으로 점수 유지가 가능합니다."; }

        // 🚀 50점 구간 내 마이크로 지표 정밀 세분화 (16점 / 33점 / 50점 기준)
        const remainder = finalScore % 50;
        let microName = ""; 
        let microText = "";
        
        if (remainder <= 16 || finalScore === 0) {
            microName = "진입기 (Entry)";
            microText = "해당 레벨에 막 진입했습니다. 아직은 낯선 어휘가 많아 문맥에 따라 체감 난이도가 변동될 수 있습니다.";
        } else if (remainder <= 33) {
            microName = "과도기 (Developing)";
            microText = "해당 레벨의 어휘들을 활발하게 인지하고 체화하는 중입니다. 점차 해석 속도가 안정화되고 있습니다.";
        } else {
            microName = "안정기 (Mastery)";
            microText = "해당 레벨의 어휘를 완벽히 장악해 나가고 있습니다. 머지않아 다음 단계 선행 학습을 시작해도 좋습니다.";
        }

        let penaltyName = ""; let penaltyText = "";
        if (penalty === 0) {
            penaltyName = "매우 우수 (결손 없음)";
            penaltyText = "실력에 뼈대 구멍이 없는 탄탄한 어휘력을 갖추고 있습니다.";
        } else if (penalty <= 60) {
            penaltyName = "주의 (경미한 하위 공백)";
            penaltyText = `전반적인 실력에 비해 간혹 기초 단어에서 인지 오류가 발견되었습니다. 점검이 필요합니다.`;
        } else {
            penaltyName = "위험 (심각한 하위 공백)";
            penaltyText = `본인 레벨보다 한참 쉬운 단어들에 심각한 구멍이 뚫려 있어 강제 회독이 시급합니다.`;
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
                if (a.difficulty < top5Avg - 150) lowerErrorPenalty += 40; 
            });

            setFinalStats({
                top5Avg: Math.round(top5Avg),
                lowerErrorPenalty,
                finalScore: roundedFinalScore
            });

            setRubricReport(generateRubricReport(roundedFinalScore, lowerErrorPenalty));
        }
    }, [isFinished, answers, finalStats, currentScore]);

    if (countdown !== null) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white selection:bg-none relative overscroll-none animate-in fade-in duration-300">
                <div className="text-2xl font-bold text-indigo-300 mb-8 animate-pulse">테스트가 곧 시작됩니다</div>
                <div className="text-[150px] md:text-[200px] font-black tracking-tighter drop-shadow-2xl animate-in zoom-in duration-300">
                    {countdown > 0 ? countdown : "START!"}
                </div>
            </div>
        );
    }

    if (showTutorial) {
        return (
            <div className="min-h-screen bg-indigo-900 flex flex-col items-center justify-center p-6 text-white selection:bg-none relative overscroll-none">
                <button onClick={() => { setShowTutorial(false); setTutorialStep(1); }} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white" title="가이드 닫기"><X size={28} /></button>
                
                <div className="bg-white text-gray-800 p-8 rounded-3xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h2 className="text-2xl font-black text-indigo-900 flex items-center gap-2"><Target size={28}/> 시험 진행 가이드 ({tutorialStep}/5)</h2>
                        <span className="bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold">튜토리얼</span>
                    </div>

                    <div className="h-64 flex flex-col justify-center">
                        {tutorialStep === 1 && (
                            <div className="text-center animate-in fade-in slide-in-from-right-4">
                                <h3 className="text-xl font-black text-gray-900 mb-3">유형 1: 뜻 찾기 (기본)</h3>
                                <p className="text-gray-600 mb-6">영어 단어가 나오면 <strong className="text-indigo-600">15초</strong> 내에 뜻 고르세요.<br/>빠르게 맞출수록 높은 점수가 획득됩니다.</p>
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
                        {tutorialStep === 5 && (
                            <div className="text-center animate-in fade-in slide-in-from-right-4">
                                <h3 className="text-xl font-black text-rose-600 mb-3 flex items-center justify-center gap-2">
                                    <AlertTriangle /> 모르면 절대 찍지 마세요!
                                </h3>
                                <p className="text-gray-700 mb-5 font-bold leading-relaxed">
                                    이 테스트는 높은 점수를 받는 것이 아니라,<br/>
                                    <span className="text-indigo-600 font-black">내 진짜 실력의 위치</span>를 정확히 찾는 것이 목적입니다.
                                </p>
                                <div className="bg-rose-50 p-5 rounded-xl border border-rose-100 shadow-inner max-w-sm mx-auto">
                                    <p className="text-rose-800 text-sm font-bold mb-4 leading-relaxed">
                                        모르는 단어를 우연히 찍어서 맞추면 알고리즘이 혼란을 일으켜 <br/>나에게 맞지 않는 <strong className="text-rose-900 font-black">이상한 난이도로 세팅</strong>됩니다.
                                    </p>
                                    <div className="bg-gray-800 text-white font-black text-lg py-3 rounded-xl shadow-md flex items-center justify-center gap-2">
                                        🤷 모름 (Pass)
                                    </div>
                                    <p className="text-gray-600 text-xs mt-3 font-bold">↑ 헷갈릴 땐 망설이지 말고 꼭 이 버튼을 눌러주세요!</p>
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
                            {[1, 2, 3, 4, 5].map(step => (
                                <div key={step} className={`w-2 h-2 rounded-full ${tutorialStep === step ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                            ))}
                        </div>

                        {tutorialStep < 5 ? (
                            <button 
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-700 font-black rounded-xl hover:bg-indigo-100 transition-colors"
                                onClick={() => setTutorialStep(tutorialStep + 1)}
                            >
                                다음 <ChevronRight size={20}/>
                            </button>
                        ) : (
                            <button 
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                                onClick={handlePrepareStart} 
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
                        <p className="flex items-start gap-2"><Zap className="shrink-0 text-yellow-400" size={18}/> <span>15초의 제한 시간이 주어지며, 연속 정답 시 상위 레벨 난이도가 배정됩니다.</span></p>
                        <p className="flex items-start gap-2"><AlertTriangle className="shrink-0 text-yellow-400" size={18}/> <span>모르는 문항은 반드시 'Pass'를 선택하여 정확한 실력 측정을 유도해 주세요.</span></p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={() => setShowTutorial(true)} className="flex-1 py-5 bg-indigo-800 text-white border border-indigo-500 text-lg font-black rounded-2xl hover:bg-indigo-700 transition-all active:scale-95">가이드 보기</button>
                        <button onClick={handlePrepareStart} className="flex-[2] py-5 bg-white text-indigo-900 text-xl font-black rounded-2xl hover:bg-indigo-50 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-95">바로 시작하기</button>
                    </div>
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
                        <p className="text-indigo-200 font-bold">임페리얼 다차원 평가 알고리즘을 통한 최종 분석 결과입니다.</p>
                        <div className="mt-8 bg-white/10 border border-white/20 p-6 rounded-2xl inline-block backdrop-blur-sm shadow-inner">
                            <div className="text-sm font-bold text-indigo-200 mb-1 tracking-widest">최종 도출 실력 지수</div>
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
                                <div className="text-xs font-bold text-gray-400 mb-1">하위 난이도 결손 인지 지수</div>
                                <div className="text-2xl font-black text-rose-600">- {finalStats.lowerErrorPenalty} 점</div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 md:p-8">
                        <h3 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2"><CheckCircle className="text-emerald-500"/> 전체 문항 트래킹 로그</h3>
                        <div className="max-h-80 overflow-y-auto custom-scrollbar border-2 border-gray-100 rounded-xl bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0 z-10 text-gray-500 font-black">
                                    <tr>
                                        <th className="p-3">문항/위상</th>
                                        <th className="p-3">출제 단어 (난이도)</th>
                                        <th className="p-3">반응 및 소요 시간</th>
                                        <th className="p-3 text-right">점수 변동 (결과)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {answers.map((log, i) => {
                                        const delta = log.scoreAfter - log.scoreBefore;
                                        return (
                                            <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                                <td className="p-3 font-bold text-gray-600">
                                                    <div>Q{log.qNum}</div>
                                                    <div className={`text-[10px] ${log.phase.includes('안착') || log.phase.includes('감속') ? 'text-indigo-500' : 'text-rose-500'}`}>{log.phase}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-bold text-gray-900 truncate max-w-[200px]">{log.wordText}</div>
                                                    <div className="text-[10px] font-bold text-emerald-600">Diff: {log.difficulty}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        {log.isCorrect ? <CheckCircle size={16} className="text-emerald-500"/> : <XCircle size={16} className="text-rose-500"/>}
                                                        <span className={`font-bold ${log.selectedOption.includes('모름') || log.selectedOption.includes('초과') ? 'text-amber-500' : 'text-gray-800'} truncate max-w-[120px]`}>
                                                            {log.selectedOption}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-gray-500 mt-0.5">⏱️ {log.timeTaken}초</div>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <span className={`font-black text-lg ${delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-rose-500' : 'text-gray-400'}`}>
                                                        {delta > 0 ? '+' : ''}{delta}
                                                    </span>
                                                    <span className="text-gray-400 text-xs font-bold ml-1">({log.scoreAfter})</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="px-6 md:px-8">
                        <button onClick={() => onComplete(finalStats.finalScore)} className="w-full py-5 bg-gray-900 hover:bg-black text-white text-xl font-black rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                            <Target size={24} /> 결과 확인 완료 및 종료
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
                        <span className="text-sm font-bold bg-white/20 px-3 py-1 rounded-full mb-2">실시간 데이터 분석 중...</span>
                        <div className="text-xl font-black">실시간 산출 지수: {transitionState.newScore}점</div>
                    </div>

                    {transitionState.type === 'correct' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <CheckCircle size={100} className="text-emerald-400 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest mb-6">정답</h2>
                            <div className="bg-white/10 p-5 rounded-2xl border border-white/20 text-center backdrop-blur-md">
                                <div className="text-emerald-300 font-bold text-lg mb-1">반응 속도: {transitionState.timeTaken}초</div>
                                <div className="text-3xl font-black text-emerald-400">+{transitionState.delta}점</div>
                                <div className="text-white font-bold mt-2">{transitionState.rteLabel}</div>
                            </div>
                        </div>
                    )}
                    {transitionState.type === 'incorrect' && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <XCircle size={100} className="text-rose-500 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest mb-6">오답</h2>
                            <div className="bg-white/10 p-5 rounded-2xl border border-white/20 text-center backdrop-blur-md">
                                <div className="text-rose-200 font-bold text-lg mb-1">정답 확인</div>
                                <div className="text-3xl font-black text-white mb-3">"{transitionState.answer}"</div>
                                <div className="text-2xl font-black text-rose-400">{transitionState.delta > 0 ? '+' : ''}{transitionState.delta}점</div>
                                <div className="text-white font-bold mt-2">{transitionState.rteLabel}</div>
                            </div>
                        </div>
                    )}
                    {(transitionState.type === 'timeout' || transitionState.type === 'pass') && (
                        <div className="flex flex-col items-center animate-in zoom-in-50 duration-300">
                            <MinusCircle size={100} className="text-gray-400 mb-4 drop-shadow-lg" />
                            <h2 className="text-5xl font-black text-white drop-shadow-md tracking-widest mb-6">Pass</h2>
                            <div className="bg-white/10 p-5 rounded-2xl border border-white/20 text-center backdrop-blur-md">
                                <div className="text-gray-300 font-bold text-lg mb-1">정확한 레벨 측정을 위해 하위 난이도로 재조정됩니다</div>
                                <div className="text-3xl font-black text-white mb-3">정답: "{transitionState.answer}"</div>
                                <div className="text-2xl font-black text-rose-400">{transitionState.delta > 0 ? '+' : ''}{transitionState.delta}점</div>
                                <div className="text-white font-bold mt-2">{transitionState.rteLabel}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <button onClick={() => { if(window.confirm("시험을 중단하시겠습니까? 데이터가 저장되지 않습니다.")) onComplete(null); }} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors z-40">
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
                    <div className="mt-6 text-sm font-bold inline-block px-5 py-2 rounded-full border shadow-sm bg-indigo-50 text-indigo-500 border-indigo-100">
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
                    🤷 모름 (Pass)
                </button>
            </div>
        </div>
    );
}