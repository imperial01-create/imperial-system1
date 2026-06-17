/* [서비스 가치] 스마트 아날로그 Voca 코어 엔진 (Ebbinghaus, CAT & 자율주행 Adaptive AI)
   폭포수 이월(Rollover) 로직과 큐 내부 정렬(Prioritization)을 통해 하루 40단어를 극한의 효율로 믹스합니다.
   또한, 밀린 단어량과 정답률을 AI가 감지하여 프리셋을 스스로 변속(Auto-Shift)하는 자율주행 엔진이 탑재되었습니다. */

import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

// 🚀 [운영 원칙] 강사 프리셋 설정 (40단어 기준 비중)
export const VOCA_PRESETS = {
    '밸런스 모드':  { wrong: 15, review: 30, passive: 5, new: 50 },  // 오답 6, 복습 12, 패시브 2, 신규 20
    '오답 학습':    { wrong: 60, review: 20, passive: 5, new: 15 },  // 오답 24, 복습 8, 패시브 2, 신규 6
    '망각 방어':    { wrong: 40, review: 50, passive: 10, new: 0 },  // 오답 16, 복습 20, 패시브 4, 신규 0
    '기초 수리':    { wrong: 10, review: 20, passive: 40, new: 30 }, // 오답 4, 복습 8, 패시브 16, 신규 12
    '스퍼트 모드':  { wrong: 10, review: 15, passive: 5, new: 70 }   // 오답 4, 복습 6, 패시브 2, 신규 28
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

// [셔플링 엔진] 단어 데이터를 분석하여 무작위로 출제 방식을 비틉니다.
const generateVariedQuestion = (word, qNumber) => {
    const meaningObj = word.meanings && word.meanings.length > 0 ? word.meanings[0] : null;
    const hasSynonyms = meaningObj?.synonyms && meaningObj.synonyms.length > 0;
    const hasBlank = meaningObj?.blankSentence && meaningObj.blankSentence.length > 0;
    
    const possibleTypes = [0]; 
    if (hasSynonyms) possibleTypes.push(1);
    if (hasBlank) possibleTypes.push(2);

    const selectedType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];

    const baseQuestion = {
        questionNumber: qNumber,
        wordId: word.wordId,
        queueType: word.queueType || '신규'
    };

    if (selectedType === 2) {
        return {
            ...baseQuestion, type: 'blank',
            wordText: meaningObj.blankSentence[0], 
            answerText: word.word, 
            hint: "(빈칸 추론)"
        };
    } else if (selectedType === 1) {
        return {
            ...baseQuestion, type: 'synonym',
            wordText: `${word.word} (유의어: ${meaningObj.synonyms.join(', ')})`,
            answerText: word.meanings.map(m => m.koreanMeaning).join(', '),
            hint: "(다의어 모두 작성)"
        };
    } else {
        return {
            ...baseQuestion, type: 'basic',
            wordText: word.word,
            answerText: word.meanings ? word.meanings.map(m => m.koreanMeaning).join(', ') : '뜻 없음',
            hint: (word.meanings && word.meanings.length > 1) ? "(뜻 2개 이상 작성)" : ""
        };
    }
};

/**
 * 🚀 일일 단어 세트 출제기 (폭포수 이월 로직 & 우선순위 정렬)
 */
export const generateDailyVocaSet = async (studentId, requestedPreset = null) => {
    try {
        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
        const statSnap = await getDoc(statRef);
        if (!statSnap.exists()) throw new Error("영어 스탯 데이터가 없습니다. 초기 진단을 먼저 진행하세요.");
        
        const statData = statSnap.data();
        const vocaSession = statData.vocaSession || 1;
        const catScore = statData.catScore || 100;
        
        // 🚀 자율주행 엔진이 덮어씌운 프리셋이 있다면 우선 적용 (없으면 강사 요청 프리셋 -> 밸런스 모드)
        const presetName = statData.adaptivePreset || requestedPreset || '밸런스 모드';
        const preset = VOCA_PRESETS[presetName] || VOCA_PRESETS['밸런스 모드'];

        // 과거 학습 이력 호출
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

        // 1. 초기 할당량(Quota) 계산
        let qWrong = Math.round(TOTAL_WORDS * (preset.wrong / 100));
        let qReview = Math.round(TOTAL_WORDS * (preset.review / 100));
        let qPassive = Math.round(TOTAL_WORDS * (preset.passive / 100));
        let qNew = Math.round(TOTAL_WORDS * (preset.new / 100));

        const requiredOldWordIds = [];
        const finalWordData = [];

        // ==========================================
        // 🚀 폭포수 이월 STEP 1: [패시브 큐] -> 남으면 복습으로 이월
        // ==========================================
        if (qPassive > 0) {
            const passiveQuery = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '<', catScore), orderBy('rootDifficulty', 'desc'), limit(150));
            const passiveSnap = await getDocs(passiveQuery);
            const passiveCandidates = passiveSnap.docs.filter(d => !seenWordIds.has(d.id));
            
            const selectedPassive = shuffleArray(passiveCandidates).slice(0, qPassive);
            selectedPassive.forEach(d => {
                finalWordData.push({ ...d.data(), queueType: '패시브' });
                seenWordIds.add(d.id);
            });
            qReview += (qPassive - selectedPassive.length); // 🚀 잉여분 복습 큐로 이월
        }

        // ==========================================
        // 🚀 폭포수 이월 STEP 2: [복습 큐] -> 남으면 신규로 이월 (우선순위 정렬 적용)
        // ==========================================
        // 우선순위 정렬: 복습 예정일이 가장 오래 지난(숫자가 작은) 단어부터 추출 (Overdue 구출)
        reviewPool.sort((a, b) => a.nextReviewSession - b.nextReviewSession);
        
        const actualReview = reviewPool.slice(0, qReview);
        actualReview.forEach(item => {
            requiredOldWordIds.push({ wordId: item.id, queueType: '복습' });
        });
        qNew += (qReview - actualReview.length); // 🚀 잉여분 신규 큐로 이월

        // ==========================================
        // 🚀 폭포수 이월 STEP 3: [오답 큐] -> 남으면 신규로 이월 (우선순위 정렬 적용)
        // ==========================================
        // 우선순위 정렬: 누적 오답 횟수(incorrectCount)가 가장 높은 단어부터 추출 (악성 단어 저격)
        wrongPool.sort((a, b) => (b.incorrectCount || 0) - (a.incorrectCount || 0));
        
        const actualWrong = wrongPool.slice(0, qWrong);
        actualWrong.forEach(item => {
            requiredOldWordIds.push({ wordId: item.id, queueType: item.incorrectCount >= 3 ? '만성 오답' : '오답' });
        });
        qNew += (qWrong - actualWrong.length); // 🚀 잉여분 신규 큐로 이월

        // ==========================================
        // STEP 4: [신규 큐] (남은 할당량을 모두 털어넣음)
        // ==========================================
        if (qNew > 0) {
            const newQuery = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', catScore), orderBy('rootDifficulty', 'asc'), limit(150));
            const newSnap = await getDocs(newQuery);
            const newCandidates = newSnap.docs.filter(d => !seenWordIds.has(d.id));
            
            const selectedNew = newCandidates.slice(0, qNew); // 진도순 정렬
            selectedNew.forEach(d => {
                finalWordData.push({ ...d.data(), queueType: '신규' });
                seenWordIds.add(d.id);
            });
        }

        // DB 개별 패칭 (오답/복습용 단어 원본)
        if (requiredOldWordIds.length > 0) {
            const oldWordFetches = requiredOldWordIds.map(async (req) => {
                const wDoc = await getDoc(doc(db, 'VocabularyDB', req.wordId));
                if (wDoc.exists()) {
                    finalWordData.push({ ...wDoc.data(), queueType: req.queueType });
                }
            });
            await Promise.all(oldWordFetches);
        }

        // 50문제 렌더링 세팅 (40문제 + 반복 10문제)
        let poolForTest = [...finalWordData];
        if (poolForTest.length === 0) throw new Error("출제할 단어가 부족합니다. DB를 확인하세요.");
        
        while (poolForTest.length < 50) {
            poolForTest = [...poolForTest, ...shuffleArray(finalWordData).slice(0, 50 - poolForTest.length)];
        }

        const full50Questions = shuffleArray(poolForTest).map((word, index) => {
            return generateVariedQuestion(word, index + 1);
        });

        // 시험 세션 생성
        const testSessionId = `test_${studentId}_s${vocaSession}`;
        const testPayload = {
            testId: testSessionId, 
            studentId, 
            sessionNumber: vocaSession, 
            presetUsed: presetName, // 현재 적용된 프리셋 기록
            wordsForPrint: finalWordData, 
            questionsForTest: full50Questions, 
            status: 'pending', 
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId), testPayload);
        
        // 사용된 프리셋 정보 스탯에 기록
        await updateDoc(statRef, { appliedPreset: presetName });
        
        return testPayload;

    } catch (error) { 
        console.error("Voca Generation Error:", error); 
        throw error; 
    }
};

/**
 * 🚀 망각 주기 자동 계산 채점기 및 [자율주행 프리셋 변속기]
 */
export const processVocaTestResult = async (studentId, sessionNumber, wrongAnswerNumbers) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const { questionsForTest, presetUsed } = sessionSnap.data();
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);
    const statData = statSnap.data();
    
    let currentVocaScore = statData.catScore || 100;
    const wrongSet = new Set(wrongAnswerNumbers);

    let sessionTotal = 0; let sessionCorrect = 0;
    let reviewTotal = 0; let reviewCorrect = 0; // 자율주행 변속용 복습 정답률 측정 변수
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

        // 복습 큐(망각 방어)로 출제된 문제의 정답률 별도 추적
        if (q.queueType === '복습') {
            reviewTotal++;
            if (isCorrect) reviewCorrect++;
        }

        const historyWordRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`, q.wordId);
        const histSnap = await getDoc(historyWordRef);
        const hist = histSnap.exists() ? histSnap.data() : { consecutiveCorrect: 0, incorrectCount: 0 };

        if (isCorrect) {
            const newConsecutive = (hist.consecutiveCorrect || 0) + 1;
            let nextReviewInterval = 1;
            let nextStatus = 'review';

            if (newConsecutive === 1) nextReviewInterval = 1;      
            else if (newConsecutive === 2) nextReviewInterval = 3; 
            else { 
                nextStatus = 'mastered'; 
                nextReviewInterval = 999;
            }

            await setDoc(historyWordRef, {
                consecutiveCorrect: newConsecutive,
                incorrectCount: hist.incorrectCount || 0,
                nextReviewSession: sessionNumber + nextReviewInterval,
                status: nextStatus,
                updatedAt: serverTimestamp()
            }, { merge: true });

            currentVocaScore += 1;
        } else {
            const newIncorrect = (hist.incorrectCount || 0) + 1;
            await setDoc(historyWordRef, {
                consecutiveCorrect: 0, 
                incorrectCount: newIncorrect,
                lastIncorrectSession: sessionNumber,
                status: newIncorrect >= 3 ? 'chronic_error' : 'wrong',
                nextReviewSession: sessionNumber + 1, 
                updatedAt: serverTimestamp()
            }, { merge: true });

            currentVocaScore = Math.max(0, currentVocaScore - 1);
        }
    }

    // ==========================================
    // 🚀 자율주행 엔진 (Adaptive Auto-Shifter) 분석 
    // ==========================================
    const adaptiveStats = statData.adaptiveStats || { reviewLowAccuracyCount: 0, queueOverflowCount: 0 };
    let newAdaptivePreset = statData.adaptivePreset || null; // 기본은 수동 프리셋 허용
    let autoShiftMessage = '';

    // 1. 망각 방어 변속: 복습 정답률이 60% 미만인지 체크
    const reviewAccuracy = reviewTotal > 0 ? (reviewCorrect / reviewTotal) : 1; // 출제 안됐으면 100% 처리
    if (reviewTotal > 0 && reviewAccuracy < 0.6) {
        adaptiveStats.reviewLowAccuracyCount += 1;
    } else {
        adaptiveStats.reviewLowAccuracyCount = 0; // 한 번이라도 잘 보면 카운터 리셋
    }

    // 2. 대기 큐 오버플로우 변속: 다음 시험에 출제될 오답+복습 큐의 크기 측정
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

        // 오버플로우 추적용 카운트
        if (d.status === 'wrong' || d.status === 'chronic_error') waitingWrong++;
        if (d.status === 'review' && d.nextReviewSession <= nextSessionNumber) waitingReview++;
    });

    // 오답+복습 대기열이 하루 할당량(40)의 50%(20개)를 초과하는지 확인
    if ((waitingWrong + waitingReview) > (TOTAL_WORDS * 0.5)) {
        adaptiveStats.queueOverflowCount += 1;
    } else {
        adaptiveStats.queueOverflowCount = 0; // 초과 안하면 즉시 리셋
    }

    // 3. 자율주행 기어 변속 실행 (망각 방어가 우선순위가 높음)
    if (adaptiveStats.reviewLowAccuracyCount >= 3) {
        newAdaptivePreset = '망각 방어';
        autoShiftMessage = '🚨 복습 정답률 연속 3회 60% 미만 감지 -> [망각 방어] 모드 자동 가동';
        adaptiveStats.reviewLowAccuracyCount = 0; // 실행 후 리셋
    } else if (adaptiveStats.queueOverflowCount >= 2 && newAdaptivePreset !== '망각 방어') {
        newAdaptivePreset = '오답 학습';
        autoShiftMessage = '🚨 오답/복습 큐 대기열 포화(50% 초과) 연속 2회 감지 -> [오답 학습] 모드 자동 가동';
        adaptiveStats.queueOverflowCount = 0; // 실행 후 리셋
    }

    // ==========================================
    // 스탯 및 리포트 최종 정리
    // ==========================================
    const retentionRate = Math.max(0, Math.round(((totalAttempts - totalErrors) / (totalAttempts || 1)) * 100)); 
    const comprehension = Math.min(100, Math.round((sessionCorrect / sessionTotal) * 100)); 

    let rubricStr = `기억 유지율 ${retentionRate}%, 다의어 이해도 ${comprehension}%를 기록했습니다.`;
    if (autoShiftMessage) rubricStr = autoShiftMessage; // 자율주행 조치가 있으면 학부모 리포트에 최우선 표시

    await updateDoc(statRef, {
        catScore: Math.min(1000, currentVocaScore),
        vocaSession: sessionNumber + 1,
        vocaProgress: Math.min(100, Math.round((masteredCount / 2000) * 100)), // 임시 모수 2000
        vocaComprehension: comprehension,
        vocaRetention: retentionRate,
        vocaRubric: rubricStr,
        adaptiveStats: adaptiveStats,       // AI 상태 메모리 저장
        adaptivePreset: newAdaptivePreset,  // AI가 덮어씌운 프리셋 저장
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