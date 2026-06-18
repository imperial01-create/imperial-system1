/* [서비스 가치] 스마트 아날로그 Voca 코어 엔진 (Ebbinghaus, CAT & 자율주행 Adaptive AI)
   DB의 다의어/반의어/예문 데이터를 활용하여 꼼수 암기를 차단하며, 
   학생의 점수(S)와 단어 난이도(D)를 비교하는 'Elo 레이팅 알고리즘'과 '승급전 방어(Cap)' 로직을 통해 
   아카데미 유니버스의 랭킹 시스템에 완벽한 공정성과 게임적 동기부여를 제공합니다. */

import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

export const VOCA_PRESETS = {
    '밸런스 모드':  { wrong: 15, review: 30, passive: 5, new: 50 },  
    '오답 학습':    { wrong: 60, review: 20, passive: 5, new: 15 },  
    '망각 방어':    { wrong: 40, review: 50, passive: 10, new: 0 },  
    '기초 수리':    { wrong: 10, review: 20, passive: 40, new: 30 }, 
    '스퍼트 모드':  { wrong: 10, review: 15, passive: 5, new: 70 }   
};

const TOTAL_WORDS = 40; 

const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// 🚀 [꼼수 방지 출제 엔진] 1~40번과 41~50번 출제 분기 처리
const generateVariedQuestion = (word, qNumber) => {
    const meaningObj = word.meanings && word.meanings.length > 0 ? word.meanings[0] : null;
    const allMeanings = word.meanings ? word.meanings.map(m => m.koreanMeaning).join(', ') : '뜻 없음';

    const baseQuestion = {
        questionNumber: qNumber,
        wordId: word.wordId,
        queueType: word.queueType || '신규'
    };

    if (qNumber <= 40) {
        return {
            ...baseQuestion, type: 'basic',
            wordText: word.word,
            answerText: allMeanings,
            hint: (word.meanings && word.meanings.length > 1) ? "(다의어 모두 작성)" : ""
        };
    }

    const hasSynonyms = meaningObj?.synonyms && meaningObj.synonyms.length > 0;
    const hasAntonyms = meaningObj?.antonyms && meaningObj.antonyms.length > 0;
    const hasBlank = meaningObj?.blankSentence && meaningObj.blankSentence.length > 0;
    const hasDerivative = word.derivatives && word.derivatives.length > 0;

    const advancedTypes = [];
    if (hasSynonyms) advancedTypes.push(1);
    if (hasBlank) advancedTypes.push(2);
    if (hasAntonyms) advancedTypes.push(3);
    if (hasDerivative) advancedTypes.push(4);

    if (advancedTypes.length === 0) {
        return {
            ...baseQuestion, type: 'basic',
            wordText: word.word,
            answerText: allMeanings,
            hint: (word.meanings && word.meanings.length > 1) ? "(다의어 모두 작성)" : "(심화 데이터 없음)"
        };
    }

    const selectedType = advancedTypes[Math.floor(Math.random() * advancedTypes.length)];

    if (selectedType === 2) {
        return {
            ...baseQuestion, type: 'blank',
            wordText: meaningObj.blankSentence[0], 
            answerText: word.word, 
            hint: "(빈칸에 알맞은 영어 단어 작성)"
        };
    } else if (selectedType === 1) {
        return {
            ...baseQuestion, type: 'synonym',
            wordText: word.word,
            answerText: allMeanings,
            hint: `(유의어 힌트: ${meaningObj.synonyms.join(', ')})`
        };
    } else if (selectedType === 3) {
        return {
            ...baseQuestion, type: 'antonym',
            wordText: word.word,
            answerText: allMeanings,
            hint: `(반의어 힌트: ${meaningObj.antonyms.join(', ')})`
        };
    } else if (selectedType === 4) {
        return {
            ...baseQuestion, type: 'derivative',
            wordText: word.word,
            answerText: allMeanings,
            hint: `(파생어 힌트: ${word.derivatives[0].word} - ${word.derivatives[0].meaning})`
        };
    }
};

/**
 * 🚀 일일 단어 세트 출제기
 */
export const generateDailyVocaSet = async (studentId, requestedPreset = null) => {
    try {
        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
        const statSnap = await getDoc(statRef);
        if (!statSnap.exists()) throw new Error("영어 스탯 데이터가 없습니다. 초기 진단을 먼저 진행하세요.");
        
        const statData = statSnap.data();
        const vocaSession = statData.vocaSession || 1;
        const catScore = Math.max(0, Math.min(1000, statData.catScore || 100)); 
        
        const presetName = statData.adaptivePreset || requestedPreset || statData.vocaPreset || '밸런스 모드';
        const preset = VOCA_PRESETS[presetName] || VOCA_PRESETS['밸런스 모드'];

        const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
        const historySnap = await getDocs(historyRef);
        
        const wrongPool = [];
        const reviewPool = [];
        const seenWordIds = new Set();

        historySnap.forEach(docSnap => {
            const data = docSnap.data();
            seenWordIds.add(docSnap.id);

            if (data.status === 'wrong' || data.status === 'chronic_error') {
                wrongPool.push({ id: docSnap.id, ...data });
            } else if (data.status === 'review' && data.nextReviewSession <= vocaSession) {
                reviewPool.push({ id: docSnap.id, ...data });
            }
        });

        let qWrong = Math.round(TOTAL_WORDS * (preset.wrong / 100));
        let qReview = Math.round(TOTAL_WORDS * (preset.review / 100));
        let qPassive = Math.round(TOTAL_WORDS * (preset.passive / 100));
        let qNew = Math.round(TOTAL_WORDS * (preset.new / 100));

        const requiredOldWordIds = [];
        const finalWordData = [];

        // STEP 1: 패시브 이월
        if (qPassive > 0) {
            const passiveQuery = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '<', catScore), orderBy('rootDifficulty', 'desc'), limit(150));
            const passiveSnap = await getDocs(passiveQuery);
            const passiveCandidates = passiveSnap.docs.filter(d => !seenWordIds.has(d.id));
            
            const selectedPassive = shuffleArray(passiveCandidates).slice(0, qPassive);
            selectedPassive.forEach(d => {
                finalWordData.push({ ...d.data(), queueType: '패시브' });
                seenWordIds.add(d.id);
            });
            qReview += (qPassive - selectedPassive.length); 
        }

        // STEP 2: 복습 이월
        reviewPool.sort((a, b) => a.nextReviewSession - b.nextReviewSession);
        const actualReview = reviewPool.slice(0, qReview);
        actualReview.forEach(item => { requiredOldWordIds.push({ wordId: item.id, queueType: '복습' }); });
        qNew += (qReview - actualReview.length);

        // STEP 3: 오답 이월 
        wrongPool.sort((a, b) => (b.consecutiveWrongCount || 0) - (a.consecutiveWrongCount || 0));
        const actualWrong = wrongPool.slice(0, qWrong);
        actualWrong.forEach(item => { requiredOldWordIds.push({ wordId: item.id, queueType: item.incorrectCount >= 3 ? '만성 오답' : '오답' }); });
        qNew += (qWrong - actualWrong.length);

        // STEP 4: 신규 큐
        let newProgressDifficulty = statData.lastNewWordDifficulty || catScore;
        
        if (qNew > 0) {
            const newQuery = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', newProgressDifficulty), orderBy('rootDifficulty', 'asc'), limit(qNew + 20));
            const newSnap = await getDocs(newQuery);
            const newCandidates = newSnap.docs.filter(d => !seenWordIds.has(d.id));
            
            const selectedNew = newCandidates.slice(0, qNew);
            selectedNew.forEach(d => {
                const wData = d.data();
                finalWordData.push({ ...wData, queueType: '신규' });
                seenWordIds.add(d.id);
                if (wData.rootDifficulty > newProgressDifficulty) {
                    newProgressDifficulty = wData.rootDifficulty; 
                }
            });
        }

        if (requiredOldWordIds.length > 0) {
            const oldWordFetches = requiredOldWordIds.map(async (req) => {
                const wDoc = await getDoc(doc(db, 'VocabularyDB', req.wordId));
                if (wDoc.exists()) {
                    finalWordData.push({ ...wDoc.data(), queueType: req.queueType });
                }
            });
            await Promise.all(oldWordFetches);
        }

        let first40 = shuffleArray(finalWordData).slice(0, 40);

        const advancedCandidates = finalWordData.filter(word => {
            const m = word.meanings && word.meanings.length > 0 ? word.meanings[0] : null;
            return (m?.synonyms?.length > 0 || m?.antonyms?.length > 0 || m?.blankSentence?.length > 0 || (word.derivatives && word.derivatives.length > 0));
        });

        let next10 = [];
        if (advancedCandidates.length >= 10) {
            next10 = shuffleArray(advancedCandidates).slice(0, 10);
        } else {
            const needed = 10 - advancedCandidates.length;
            const otherCandidates = finalWordData.filter(w => !advancedCandidates.includes(w));
            next10 = [...advancedCandidates, ...shuffleArray(otherCandidates).slice(0, needed)];
        }

        let poolForTest = [...first40, ...next10];

        while (poolForTest.length < 50) {
            poolForTest.push(finalWordData[Math.floor(Math.random() * finalWordData.length)]);
        }

        const full50Questions = poolForTest.map((word, index) => {
            return generateVariedQuestion(word, index + 1);
        });

        const testSessionId = `test_${studentId}_s${vocaSession}`;
        const testPayload = {
            testId: testSessionId, studentId, sessionNumber: vocaSession, 
            presetUsed: presetName, wordsForPrint: finalWordData, questionsForTest: full50Questions, 
            status: 'pending', createdAt: serverTimestamp()
        };

        await setDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId), testPayload);
        await updateDoc(statRef, { appliedPreset: presetName, lastNewWordDifficulty: newProgressDifficulty });
        
        return testPayload;

    } catch (error) { 
        console.error("Voca Generation Error:", error); 
        throw error; 
    }
};

/**
 * 🚀 망각 주기 계산 및 [ELO 레이팅 기반 공정 스탯 엔진]
 */
export const processVocaTestResult = async (studentId, sessionNumber, wrongAnswerNumbers) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const { questionsForTest, wordsForPrint } = sessionSnap.data();
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);
    const statData = statSnap.data();
    
    let currentVocaScore = statData.catScore || 100;
    const wrongSet = new Set(wrongAnswerNumbers);

    let sessionTotal = 0; let sessionCorrect = 0;
    let reviewTotal = 0; let reviewCorrect = 0; 
    let wrongWordsDetails = []; 
    
    // 🚀 [신규 추가] 엘로 레이팅 점수 합산을 위한 변수
    let scoreDelta = 0; 
    
    // 출제된 단어들의 난이도를 빠르게 찾기 위한 맵핑
    const difficultyMap = {};
    if (wordsForPrint) {
        wordsForPrint.forEach(w => { difficultyMap[w.wordId] = w.rootDifficulty || currentVocaScore; });
    }

    for (const q of questionsForTest) {
        sessionTotal++;
        const isCorrect = !wrongSet.has(q.questionNumber);
        
        // 🚀 [공정성 완벽 통제] 학생의 점수(S)와 단어 난이도(D)를 비교하는 알고리즘
        const wDifficulty = difficultyMap[q.wordId] || currentVocaScore;
        const diff = wDifficulty - currentVocaScore; 

        if (isCorrect) {
            sessionCorrect++;
            // 맞춘 경우 (S vs D)
            if (diff > 50) scoreDelta += 2.5;         // 대폭 상승 (어려운 단어 맞춤)
            else if (diff >= -50) scoreDelta += 1.5;  // 소폭 상승 (내 수준 단어 맞춤)
            else scoreDelta += 0.1;                   // 거의 오르지 않음 (어뷰징 차단용)
        } else {
            wrongWordsDetails.push({
                word: q.wordId || q.wordText.split(' ')[0], 
                question: q.wordText, meaning: q.answerText, queueType: q.queueType
            });
            // 틀린 경우 (S vs D)
            if (diff < -50) scoreDelta -= 3.0;        // 대폭 하락 (치명적 실수 - 쉬운 단어)
            else if (diff <= 50) scoreDelta -= 1.5;   // 정상 하락
            else scoreDelta -= 0.5;                   // 소폭 하락 (어려운 단어 도전 보상)
        }

        if (q.queueType === '복습') {
            reviewTotal++;
            if (isCorrect) reviewCorrect++;
        }

        // --- (기존의 word_history 상태 업데이트 로직은 그대로 유지) ---
        const historyWordRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`, q.wordId);
        const histSnap = await getDoc(historyWordRef);
        const hist = histSnap.exists() ? histSnap.data() : { consecutiveCorrect: 0, incorrectCount: 0, consecutiveWrongCount: 0 };

        if (isCorrect) {
            const newConsecutive = (hist.consecutiveCorrect || 0) + 1;
            let nextReviewInterval = 1;
            let nextStatus = 'review';
            if (newConsecutive === 1) nextReviewInterval = 1;      
            else if (newConsecutive === 2) nextReviewInterval = 3; 
            else { nextStatus = 'mastered'; nextReviewInterval = 999; }

            await setDoc(historyWordRef, {
                consecutiveCorrect: newConsecutive, consecutiveWrongCount: 0, 
                incorrectCount: hist.incorrectCount || 0,
                nextReviewSession: sessionNumber + nextReviewInterval, status: nextStatus, updatedAt: serverTimestamp()
            }, { merge: true });
        } else {
            const newIncorrect = (hist.incorrectCount || 0) + 1;
            const newConsecutiveWrong = (hist.consecutiveWrongCount || 0) + 1;

            await setDoc(historyWordRef, {
                consecutiveCorrect: 0, consecutiveWrongCount: newConsecutiveWrong, 
                incorrectCount: newIncorrect, lastIncorrectSession: sessionNumber,
                status: newIncorrect >= 3 ? 'chronic_error' : 'wrong',
                nextReviewSession: sessionNumber + 1, updatedAt: serverTimestamp()
            }, { merge: true });
        }
    }

    // 🚀 [신규 추가] 최종 점수 계산 및 승급전(Tier Cap) 방어 로직
    let finalVocaScore = Math.round(currentVocaScore + scoreDelta);
    let autoShiftMessage = '';

    const hasPassed400 = statData.passedMockExam400 === true;
    const hasPassed700 = statData.passedMockExam700 === true;

    // 400점 결계 방어
    if (currentVocaScore < 400 && finalVocaScore >= 400 && !hasPassed400) {
        finalVocaScore = 399;
        autoShiftMessage = "🚨 400점 승급 심사 구간에 도달했습니다. 모의고사 성적 연동 전까지 점수가 오르지 않습니다.";
    } 
    // 700점 결계 방어
    else if (currentVocaScore < 700 && finalVocaScore >= 700 && !hasPassed700) {
        finalVocaScore = 699;
        autoShiftMessage = "🚨 700점 승급 심사 구간에 도달했습니다. 모의고사 성적 연동 전까지 점수가 오르지 않습니다.";
    }

    // 0~1000점 범위 안전망
    finalVocaScore = Math.max(0, Math.min(1000, finalVocaScore));


    // ==========================================
    // AI 자율주행 엔진 분석 (기존 로직)
    // ==========================================
    const adaptiveStats = statData.adaptiveStats || { reviewLowAccuracyCount: 0, queueOverflowCount: 0 };
    let newAdaptivePreset = statData.adaptivePreset || null; 

    const reviewAccuracy = reviewTotal > 0 ? (reviewCorrect / reviewTotal) : 1; 
    if (reviewTotal > 0 && reviewAccuracy < 0.6) adaptiveStats.reviewLowAccuracyCount += 1;
    else adaptiveStats.reviewLowAccuracyCount = 0; 

    const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
    const historySnap = await getDocs(historyRef);
    
    let masteredCount = 0; let totalAttempts = 0; let totalErrors = 0;
    let waitingWrong = 0; let waitingReview = 0;
    const nextSessionNumber = sessionNumber + 1;

    historySnap.forEach(doc => {
        const d = doc.data();
        if (d.status === 'mastered') masteredCount++;
        totalAttempts += (d.consecutiveCorrect || 0) + (d.incorrectCount || 0);
        totalErrors += (d.incorrectCount || 0);

        if (d.status === 'wrong' || d.status === 'chronic_error') waitingWrong++;
        if (d.status === 'review' && d.nextReviewSession <= nextSessionNumber) waitingReview++;
    });

    if ((waitingWrong + waitingReview) > (TOTAL_WORDS * 0.5)) adaptiveStats.queueOverflowCount += 1;
    else adaptiveStats.queueOverflowCount = 0; 

    // 변속기 실행 (승급전 알림이 없을 때만 덮어쓰기)
    if (adaptiveStats.reviewLowAccuracyCount >= 3) {
        newAdaptivePreset = '망각 방어';
        if (!autoShiftMessage) autoShiftMessage = '🚨 복습 정답률 3회 연속 60% 미만 감지 -> [망각 방어] 모드 자동 가동';
        adaptiveStats.reviewLowAccuracyCount = 0;
    } else if (adaptiveStats.queueOverflowCount >= 2 && newAdaptivePreset !== '망각 방어') {
        newAdaptivePreset = '오답 학습';
        if (!autoShiftMessage) autoShiftMessage = '🚨 오답/복습 큐 대기열 포화(50% 초과) 2회 연속 감지 -> [오답 학습] 모드 자동 가동';
        adaptiveStats.queueOverflowCount = 0;
    } else if (adaptiveStats.reviewLowAccuracyCount === 0 && adaptiveStats.queueOverflowCount === 0) {
        if (newAdaptivePreset !== null) {
            if (!autoShiftMessage) autoShiftMessage = '✅ 학습 상태가 안정화되어 AI 자율주행 모드가 해제되고 기본 프리셋으로 복귀합니다.';
        }
        newAdaptivePreset = null;
    }

    const retentionRate = Math.max(0, Math.round(((totalAttempts - totalErrors) / (totalAttempts || 1)) * 100)); 
    const comprehension = Math.min(100, Math.round((sessionCorrect / sessionTotal) * 100)); 
    
    let rubricStr = `기억 유지율 ${retentionRate}%, 다의어 이해도 ${comprehension}%를 기록했습니다.`;
    if (autoShiftMessage) rubricStr = autoShiftMessage; 

    await updateDoc(statRef, {
        catScore: finalVocaScore,  // 🚀 업데이트된 Elo 레이팅 점수 기록
        vocaSession: sessionNumber + 1,
        vocaProgress: Math.min(100, Math.round((masteredCount / 2000) * 100)), 
        vocaComprehension: comprehension,
        vocaRetention: retentionRate,
        vocaRubric: rubricStr,
        adaptiveStats: adaptiveStats,       
        adaptivePreset: newAdaptivePreset,  
        updatedAt: serverTimestamp()
    });

    await updateDoc(sessionRef, { 
        status: 'completed', 
        wrongCount: wrongSet.size,
        sessionScore: Math.round((sessionCorrect / sessionTotal) * 100),
        wrongWordsDetails: wrongWordsDetails, 
        completedAt: serverTimestamp()
    });
};