/* [서비스 가치] 스마트 아날로그 Voca 코어 엔진 (Ebbinghaus, CAT & 자율주행 Adaptive AI)
   DB의 다의어/반의어/예문 데이터를 100% 활용하여 꼼수 암기를 원천 차단합니다.
   1~40번은 기본형(영단어->뜻 쓰기)으로 출제하고, 41~50번은 심화형(빈칸, 파생어, 유의어)으로 출제하여
   학생들의 장기 기억력과 고차원적 인지 능력을 극대화합니다. */

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

const TOTAL_WORDS = 40; // 추출할 고유 단어 개수 (출제는 50문제)

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

    // 🚀 [구간 1] 1~40번: 기본형 (영단어 -> 한글 뜻 쓰기)
    if (qNumber <= 40) {
        return {
            ...baseQuestion, type: 'basic',
            wordText: word.word,
            answerText: allMeanings,
            hint: (word.meanings && word.meanings.length > 1) ? "(다의어 모두 작성)" : ""
        };
    }

    // 🚀 [구간 2] 41~50번: 고차원 문제 (유의어, 반의어, 빈칸, 파생어)
    const hasSynonyms = meaningObj?.synonyms && meaningObj.synonyms.length > 0;
    const hasAntonyms = meaningObj?.antonyms && meaningObj.antonyms.length > 0;
    const hasBlank = meaningObj?.blankSentence && meaningObj.blankSentence.length > 0;
    const hasDerivative = word.derivatives && word.derivatives.length > 0;

    const advancedTypes = [];
    if (hasSynonyms) advancedTypes.push(1);
    if (hasBlank) advancedTypes.push(2);
    if (hasAntonyms) advancedTypes.push(3);
    if (hasDerivative) advancedTypes.push(4);

    // 만약 DB에 심화 데이터가 부족한 단어라면 기본형으로 방어 출제
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
            answerText: word.word, // 빈칸 문제는 정답이 영단어임
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

        // STEP 3: 오답 이월 (연속 오답 우선순위)
        wrongPool.sort((a, b) => (b.consecutiveWrongCount || 0) - (a.consecutiveWrongCount || 0));
        const actualWrong = wrongPool.slice(0, qWrong);
        actualWrong.forEach(item => { requiredOldWordIds.push({ wordId: item.id, queueType: item.incorrectCount >= 3 ? '만성 오답' : '오답' }); });
        qNew += (qWrong - actualWrong.length);

        // STEP 4: 신규 큐 (비용 최적화 진도 트래킹 반영)
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

        // DB 개별 패칭 (오답/복습)
        if (requiredOldWordIds.length > 0) {
            const oldWordFetches = requiredOldWordIds.map(async (req) => {
                const wDoc = await getDoc(doc(db, 'VocabularyDB', req.wordId));
                if (wDoc.exists()) {
                    finalWordData.push({ ...wDoc.data(), queueType: req.queueType });
                }
            });
            await Promise.all(oldWordFetches);
        }

        // 🚀 [50문제 렌더링 세팅 고도화]
        let first40 = shuffleArray(finalWordData).slice(0, 40);

        // 41~50번에 들어갈 10문제는 최대한 고차원 문제 출제가 가능한 단어로 우선 선별
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

        // 부족할 경우 채우기
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
 * 🚀 망각 주기 자동 계산 채점기 및 자율주행 엔진
 */
export const processVocaTestResult = async (studentId, sessionNumber, wrongAnswerNumbers) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const { questionsForTest } = sessionSnap.data();
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);
    const statData = statSnap.data();
    
    let currentVocaScore = statData.catScore || 100;
    const wrongSet = new Set(wrongAnswerNumbers);

    let sessionTotal = 0; let sessionCorrect = 0;
    let reviewTotal = 0; let reviewCorrect = 0; 
    let wrongWordsDetails = []; 

    for (const q of questionsForTest) {
        sessionTotal++;
        const isCorrect = !wrongSet.has(q.questionNumber);
        
        if (isCorrect) sessionCorrect++;
        else {
            wrongWordsDetails.push({
                word: q.wordId || q.wordText.split(' ')[0], 
                question: q.wordText,
                meaning: q.answerText,
                queueType: q.queueType
            });
        }

        if (q.queueType === '복습') {
            reviewTotal++;
            if (isCorrect) reviewCorrect++;
        }

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
                consecutiveCorrect: newConsecutive,
                consecutiveWrongCount: 0, 
                incorrectCount: hist.incorrectCount || 0,
                nextReviewSession: sessionNumber + nextReviewInterval,
                status: nextStatus,
                updatedAt: serverTimestamp()
            }, { merge: true });

            currentVocaScore += 1; // 1000점 만점 체계 상승
        } else {
            const newIncorrect = (hist.incorrectCount || 0) + 1;
            const newConsecutiveWrong = (hist.consecutiveWrongCount || 0) + 1;

            await setDoc(historyWordRef, {
                consecutiveCorrect: 0, 
                consecutiveWrongCount: newConsecutiveWrong, 
                incorrectCount: newIncorrect,
                lastIncorrectSession: sessionNumber,
                status: newIncorrect >= 3 ? 'chronic_error' : 'wrong',
                nextReviewSession: sessionNumber + 1, 
                updatedAt: serverTimestamp()
            }, { merge: true });

            currentVocaScore -= 1; // 1000점 만점 체계 하락
        }
    }

    // AI 엔진 분석
    const adaptiveStats = statData.adaptiveStats || { reviewLowAccuracyCount: 0, queueOverflowCount: 0 };
    let newAdaptivePreset = statData.adaptivePreset || null; 
    let autoShiftMessage = '';

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

    // 변속기 실행
    if (adaptiveStats.reviewLowAccuracyCount >= 3) {
        newAdaptivePreset = '망각 방어';
        autoShiftMessage = '🚨 복습 정답률 3회 연속 60% 미만 감지 -> [망각 방어] 모드 자동 가동';
        adaptiveStats.reviewLowAccuracyCount = 0;
    } else if (adaptiveStats.queueOverflowCount >= 2 && newAdaptivePreset !== '망각 방어') {
        newAdaptivePreset = '오답 학습';
        autoShiftMessage = '🚨 오답/복습 큐 대기열 포화(50% 초과) 2회 연속 감지 -> [오답 학습] 모드 자동 가동';
        adaptiveStats.queueOverflowCount = 0;
    } else if (adaptiveStats.reviewLowAccuracyCount === 0 && adaptiveStats.queueOverflowCount === 0) {
        if (newAdaptivePreset !== null) autoShiftMessage = '✅ 학습 상태가 안정화되어 AI 자율주행 모드가 해제되고 기본 프리셋으로 복귀합니다.';
        newAdaptivePreset = null;
    }

    const retentionRate = Math.max(0, Math.round(((totalAttempts - totalErrors) / (totalAttempts || 1)) * 100)); 
    const comprehension = Math.min(100, Math.round((sessionCorrect / sessionTotal) * 100)); 
    let rubricStr = `기억 유지율 ${retentionRate}%, 다의어 이해도 ${comprehension}%를 기록했습니다.`;
    if (autoShiftMessage) rubricStr = autoShiftMessage; 

    const safeCatScore = Math.max(0, Math.min(1000, currentVocaScore));

    await updateDoc(statRef, {
        catScore: safeCatScore,
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