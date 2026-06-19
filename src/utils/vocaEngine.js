/* [서비스 가치] 스마트 아날로그 Voca 코어 엔진 (O(1) Delta Architecture & Continuous SRS)
   🚀 업데이트 3 (영점 조절 엔진): 신규 원생의 '어휘 구멍'을 메우기 위해 [초기 영점 조절] 프리셋을 신설했습니다. 
   Z1(딥 스캔), Z2(의심 스캔), Z3(타겟 진도)로 구역을 분할하며, Z1/Z2 단어는 한 번만 맞춰도 즉시 마스터 처리(Fast-Track)하여 학습 지루함을 없앱니다. 
   약 10회차 진행 후 자동으로 '밸런스 모드'로 정상화(Normalization)됩니다. */

import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, limit, arrayUnion, documentId } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

// 🚀 [CTO 패치] '초기 영점 조절' 프리셋 추가 (비율: 타겟 50%, 의심스캔 40%, 딥스캔 10%)
export const VOCA_PRESETS = {
    '밸런스 모드':  { wrong: 15, review: 30, passive: 5, new: 50 },  
    '오답 학습':    { wrong: 60, review: 20, passive: 5, new: 15 },  
    '망각 방어':    { wrong: 40, review: 50, passive: 10, new: 0 },  
    '기초 수리':    { wrong: 10, review: 20, passive: 40, new: 30 }, 
    '스퍼트 모드':  { wrong: 10, review: 15, passive: 5, new: 70 },
    '초기 영점 조절': { wrong: 0, review: 0, z1_deep: 10, z2_scan: 40, z3_target: 50 } // 신규 등록자 전용
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
            hint: (word.meanings && word.meanings.length > 1) ? "(다의어 모두 작성)" : ""
        };
    }

    const selectedType = advancedTypes[Math.floor(Math.random() * advancedTypes.length)];

    if (selectedType === 2) {
        return {
            ...baseQuestion, type: 'blank',
            wordText: meaningObj.blankSentence[0], 
            answerText: word.word, 
            hint: `(빈칸에 알맞은 영어 단어 작성, 뜻: ${allMeanings})`
        };
    } else if (selectedType === 1) {
        return {
            ...baseQuestion, type: 'synonym',
            wordText: `다음 단어의 유의어(동의어)를 쓰시오: ${word.word}`,
            answerText: meaningObj.synonyms.join(', '),
            hint: `(뜻: ${allMeanings})`
        };
    } else if (selectedType === 3) {
        return {
            ...baseQuestion, type: 'antonym',
            wordText: `다음 단어의 반의어(반대말)를 쓰시오: ${word.word}`,
            answerText: meaningObj.antonyms.join(', '),
            hint: `(뜻: ${allMeanings})`
        };
    } else if (selectedType === 4) {
        return {
            ...baseQuestion, type: 'derivative',
            wordText: `다음 단어의 파생어를 쓰시오: ${word.word}`,
            answerText: word.derivatives[0].word,
            hint: `(${word.derivatives[0].meaning})`
        };
    }
};

export const generateDailyVocaSet = async (studentId, requestedPreset = null) => {
    try {
        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
        const statSnap = await getDoc(statRef);
        if (!statSnap.exists()) throw new Error("영어 스탯 데이터가 없습니다. 초기 진단을 먼저 진행하세요.");
        
        const statData = statSnap.data();
        const vocaSession = statData.vocaSession || 1;
        const catScore = Math.max(0, Math.min(1000, statData.catScore || 100)); 
        
        // 🚀 만약 첫 세션(1회차)이고 프리셋이 지정되지 않았다면 강제로 '초기 영점 조절' 모드 가동
        let presetName = statData.adaptivePreset || requestedPreset || statData.vocaPreset || '밸런스 모드';
        if (vocaSession === 1 && !statData.adaptivePreset && !requestedPreset) {
            presetName = '초기 영점 조절';
        }
        
        const preset = VOCA_PRESETS[presetName] || VOCA_PRESETS['밸런스 모드'];

        const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
        const qDue = query(historyRef, where('nextReviewSession', '<=', vocaSession));
        const historySnap = await getDocs(qDue);
        
        const wrongPool = [];
        const reviewPool = [];
        const seenWordIds = new Set(statData.seenWordIds || []);

        historySnap.forEach(docSnap => {
            const data = docSnap.data();
            seenWordIds.add(docSnap.id);

            if (data.status === 'wrong' || data.status === 'chronic_error') {
                wrongPool.push({ id: docSnap.id, ...data });
            } else if (data.status === 'review' || data.status === 'mastered') {
                reviewPool.push({ id: docSnap.id, ...data });
            }
        });

        const finalWordData = [];
        const requiredOldWordIds = [];
        const newlySeenWordIds = []; 

        // ============================================================================
        // 🚀 [CTO 패치] Phase 1 & 2: '초기 영점 조절' 모드 구동 알고리즘 (Zone Partitioning)
        // ============================================================================
        if (presetName === '초기 영점 조절') {
            const z1_limit = Math.max(0, catScore - 150); // 패스 구역 (너무 쉬운 단어)
            const z2_limit = catScore;                    // 의심 구역 (알아야 하지만 구멍이 있을 수 있는 단어)
            
            let qZ1 = Math.round(TOTAL_WORDS * (preset.z1_deep / 100));
            let qZ2 = Math.round(TOTAL_WORDS * (preset.z2_scan / 100));
            let qZ3 = Math.round(TOTAL_WORDS * (preset.z3_target / 100));

            // [Z1] 패스 구역 딥스캔 추출
            if (qZ1 > 0 && z1_limit > 0) {
                const z1Query = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '<', z1_limit), limit(100));
                const z1Snap = await getDocs(z1Query);
                const z1Candidates = z1Snap.docs.filter(d => !seenWordIds.has(d.id));
                const selectedZ1 = shuffleArray(z1Candidates).slice(0, qZ1);
                selectedZ1.forEach(d => {
                    finalWordData.push({ ...d.data(), queueType: '딥 스캔' });
                    seenWordIds.add(d.id);
                    newlySeenWordIds.push(d.id);
                });
                qZ2 += (qZ1 - selectedZ1.length);
            }

            // [Z2] 의심 구역 스캔 추출
            if (qZ2 > 0) {
                const z2Query = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', z1_limit), where('rootDifficulty', '<', z2_limit), limit(150));
                const z2Snap = await getDocs(z2Query);
                const z2Candidates = z2Snap.docs.filter(d => !seenWordIds.has(d.id));
                const selectedZ2 = shuffleArray(z2Candidates).slice(0, qZ2);
                selectedZ2.forEach(d => {
                    finalWordData.push({ ...d.data(), queueType: '의심 스캔' });
                    seenWordIds.add(d.id);
                    newlySeenWordIds.push(d.id);
                });
                qZ3 += (qZ2 - selectedZ2.length);
            }

            // [Z3] 타겟 진도 추출
            let newProgressDifficulty = statData.lastNewWordDifficulty || catScore;
            if (qZ3 > 0) {
                const z3Query = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', newProgressDifficulty), orderBy('rootDifficulty', 'asc'), limit(qZ3 + 20));
                const z3Snap = await getDocs(z3Query);
                const z3Candidates = z3Snap.docs.filter(d => !seenWordIds.has(d.id));
                const selectedZ3 = z3Candidates.slice(0, qZ3);
                selectedZ3.forEach(d => {
                    const wData = d.data();
                    finalWordData.push({ ...wData, queueType: '신규' });
                    seenWordIds.add(d.id);
                    newlySeenWordIds.push(d.id);
                    if (wData.rootDifficulty > newProgressDifficulty) {
                        newProgressDifficulty = wData.rootDifficulty; 
                    }
                });
            }

            // 영점 조절 모드에서는 기존 오답이 있다면 Z3(신규) 자리를 대체하여 조금씩 섞어줍니다.
            if (wrongPool.length > 0) {
                const qWrong = Math.min(wrongPool.length, 5);
                const actualWrong = wrongPool.slice(0, qWrong);
                actualWrong.forEach(item => { requiredOldWordIds.push({ wordId: item.id, queueType: '오답' }); });
                // 배열 맨 끝의 신규 단어를 빼고 오답을 넣습니다.
                finalWordData.splice(finalWordData.length - qWrong, qWrong); 
            }

            await updateDoc(statRef, { lastNewWordDifficulty: newProgressDifficulty, adaptivePreset: '초기 영점 조절' });

        } else {
            // ============================================================================
            // 일반 모드 (밸런스, 오답학습, 스퍼트 등) 구동 알고리즘
            // ============================================================================
            let qWrong = Math.round(TOTAL_WORDS * (preset.wrong / 100));
            let qReview = Math.round(TOTAL_WORDS * (preset.review / 100));
            let qPassive = Math.round(TOTAL_WORDS * (preset.passive / 100));
            let qNew = Math.round(TOTAL_WORDS * (preset.new / 100));

            if (qPassive > 0) {
                const passiveQuery = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '<', catScore), orderBy('rootDifficulty', 'desc'), limit(150));
                const passiveSnap = await getDocs(passiveQuery);
                const passiveCandidates = passiveSnap.docs.filter(d => !seenWordIds.has(d.id));
                
                const selectedPassive = shuffleArray(passiveCandidates).slice(0, qPassive);
                selectedPassive.forEach(d => {
                    finalWordData.push({ ...d.data(), queueType: '패시브' });
                    seenWordIds.add(d.id);
                    newlySeenWordIds.push(d.id);
                });
                qReview += (qPassive - selectedPassive.length); 
            }

            reviewPool.sort((a, b) => {
                if (a.nextReviewSession !== b.nextReviewSession) return a.nextReviewSession - b.nextReviewSession;
                return (a.consecutiveCorrect || 0) - (b.consecutiveCorrect || 0);
            });
            const actualReview = reviewPool.slice(0, qReview);
            actualReview.forEach(item => { requiredOldWordIds.push({ wordId: item.id, queueType: '복습' }); });
            qNew += (qReview - actualReview.length);

            const chronicCandidates = wrongPool.filter(w => w.incorrectCount >= 3);
            const normalWrongCandidates = wrongPool.filter(w => w.incorrectCount < 3);

            const chronicCap = Math.max(1, Math.floor(qWrong * 0.3));
            
            chronicCandidates.sort((a, b) => (b.consecutiveWrongCount || 0) - (a.consecutiveWrongCount || 0));
            normalWrongCandidates.sort((a, b) => (b.lastIncorrectSession || 0) - (a.lastIncorrectSession || 0));

            let actualWrong = [];
            actualWrong.push(...chronicCandidates.slice(0, chronicCap)); 
            
            const remainingWrongQuota = qWrong - actualWrong.length;
            actualWrong.push(...normalWrongCandidates.slice(0, remainingWrongQuota)); 

            if (actualWrong.length < qWrong) {
                const extraNeeded = qWrong - actualWrong.length;
                const extraChronic = chronicCandidates.slice(chronicCap, chronicCap + extraNeeded);
                actualWrong.push(...extraChronic);
            }

            actualWrong.forEach(item => { requiredOldWordIds.push({ wordId: item.id, queueType: item.incorrectCount >= 3 ? '만성 오답' : '오답' }); });
            qNew += (qWrong - actualWrong.length);

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
                    newlySeenWordIds.push(d.id);
                    if (wData.rootDifficulty > newProgressDifficulty) {
                        newProgressDifficulty = wData.rootDifficulty; 
                    }
                });
            }
            await updateDoc(statRef, { appliedPreset: presetName, lastNewWordDifficulty: newProgressDifficulty });
        }

        // 공통: DB에서 기존 단어 정보 가져오기 (N+1 최적화 chunk)
        if (requiredOldWordIds.length > 0) {
            const chunkSize = 10;
            const fetchPromises = [];
            for (let i = 0; i < requiredOldWordIds.length; i += chunkSize) {
                const chunk = requiredOldWordIds.slice(i, i + chunkSize);
                const chunkIds = chunk.map(c => c.wordId);
                const vocaQ = query(collection(db, 'VocabularyDB'), where(documentId(), 'in', chunkIds));
                fetchPromises.push(
                    getDocs(vocaQ).then(snap => {
                        snap.forEach(d => {
                            const queueInfo = chunk.find(c => c.wordId === d.id);
                            finalWordData.push({ ...d.data(), queueType: queueInfo.queueType });
                        });
                    })
                );
            }
            await Promise.all(fetchPromises);
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
        
        if (newlySeenWordIds.length > 0) {
            await updateDoc(statRef, { seenWordIds: arrayUnion(...newlySeenWordIds) });
        }
        
        return testPayload;

    } catch (error) { 
        console.error("Voca Generation Error:", error); 
        throw error; 
    }
};

export const processVocaTestResult = async (studentId, sessionNumber, wrongAnswerNumbers) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const { questionsForTest, wordsForPrint, presetUsed } = sessionSnap.data();
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);
    const statData = statSnap.data();
    
    let { totalAttempts = 0, totalErrors = 0, masteredCount = 0, waitingWrong = 0, waitingReview = 0 } = statData;
    
    if (statData.totalAttempts === undefined) {
        const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
        const historySnap = await getDocs(historyRef);
        let migratedSeenIds = [];
        historySnap.forEach(doc => {
            const d = doc.data();
            migratedSeenIds.push(doc.id);
            if (d.status === 'mastered') masteredCount++;
            totalAttempts += (d.consecutiveCorrect || 0) + (d.incorrectCount || 0);
            totalErrors += (d.incorrectCount || 0);
            if (d.status === 'wrong' || d.status === 'chronic_error') waitingWrong++;
            if (d.status === 'review' && d.nextReviewSession <= sessionNumber + 1) waitingReview++;
        });
        await updateDoc(statRef, { totalAttempts, totalErrors, masteredCount, waitingWrong, waitingReview, seenWordIds: migratedSeenIds });
    }

    const rollbackData = {
        catScore: statData.catScore || 100,
        vocaSession: statData.vocaSession || 1,
        vocaProgress: statData.vocaProgress || 0,
        vocaComprehension: statData.vocaComprehension || 0,
        vocaRetention: statData.vocaRetention || 0,
        vocaRubric: statData.vocaRubric || '',
        adaptiveStats: statData.adaptiveStats || { reviewLowAccuracyCount: 0, queueOverflowCount: 0 },
        adaptivePreset: statData.adaptivePreset || null,
        lastNewWordDifficulty: statData.lastNewWordDifficulty || statData.catScore || 100,
        totalAttempts, totalErrors, masteredCount, waitingWrong, waitingReview,
        wordHistories: {}
    };

    for (const q of questionsForTest) {
        const historyWordRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`, q.wordId);
        const histSnap = await getDoc(historyWordRef);
        rollbackData.wordHistories[q.wordId] = histSnap.exists() ? histSnap.data() : null;
    }

    let currentVocaScore = statData.catScore || 100;
    const wrongSet = new Set(wrongAnswerNumbers);

    let sessionTotal = 0; let sessionCorrect = 0;
    let reviewTotal = 0; let reviewCorrect = 0; 
    let wrongWordsDetails = []; 
    let scoreDelta = 0; 
    
    let deltaMastered = 0;
    let deltaWaitingWrong = 0;
    let deltaWaitingReview = 0;

    const difficultyMap = {};
    if (wordsForPrint) {
        wordsForPrint.forEach(w => { difficultyMap[w.wordId] = w.rootDifficulty || currentVocaScore; });
    }

    for (const q of questionsForTest) {
        sessionTotal++;
        const isCorrect = !wrongSet.has(q.questionNumber);
        const wDifficulty = difficultyMap[q.wordId] || currentVocaScore;
        const diff = wDifficulty - currentVocaScore; 

        if (isCorrect) {
            sessionCorrect++;
            if (diff > 50) scoreDelta += 2.5;         
            else if (diff >= -50) scoreDelta += 1.5;  
            else scoreDelta += 0.1;                   
        } else {
            wrongWordsDetails.push({
                word: q.wordId || q.wordText.split(' ')[0], 
                question: q.wordText, meaning: q.answerText, queueType: q.queueType
            });
            if (diff < -50) scoreDelta -= 3.0;        
            else if (diff <= 50) scoreDelta -= 1.5;   
            else scoreDelta -= 0.5;                   
        }

        if (q.queueType === '복습') {
            reviewTotal++;
            if (isCorrect) reviewCorrect++;
        }

        const historyWordRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`, q.wordId);
        const oldHist = rollbackData.wordHistories[q.wordId];
        const oldStatus = oldHist ? oldHist.status : 'new';

        if (isCorrect) {
            let newConsecutive = ((oldHist ? oldHist.consecutiveCorrect : 0) || 0) + 1;
            let nextReviewInterval = 1;
            let nextStatus = 'review';
            
            // 🚀 [CTO 패치] Fast-Track 로직: 영점 조절 구역(Z1, Z2) 단어는 1번만 맞춰도 즉시 마스터 처리
            if (q.queueType === '의심 스캔' || q.queueType === '딥 스캔') {
                newConsecutive = 7; // 마스터 진입 조건 충족
                nextReviewInterval = 120; // 4개월 뒤 생존 신고
                nextStatus = 'mastered';
            } else {
                // 정상 간격 반복 (Continuous SRS)
                if (newConsecutive === 1) { nextReviewInterval = 1; nextStatus = 'review'; }
                else if (newConsecutive === 2) { nextReviewInterval = 3; nextStatus = 'review'; }
                else if (newConsecutive === 3) { nextReviewInterval = 7; nextStatus = 'mastered'; }
                else if (newConsecutive === 4) { nextReviewInterval = 14; nextStatus = 'mastered'; }
                else if (newConsecutive === 5) { nextReviewInterval = 30; nextStatus = 'mastered'; }
                else if (newConsecutive === 6) { nextReviewInterval = 60; nextStatus = 'mastered'; }
                else { nextReviewInterval = 120; nextStatus = 'mastered'; } 
            }

            if (oldStatus === 'new') { deltaWaitingReview += 1; }
            else if (oldStatus === 'review' && nextStatus === 'mastered') { deltaWaitingReview -= 1; deltaMastered += 1; }
            else if (oldStatus === 'wrong' || oldStatus === 'chronic_error') {
                deltaWaitingWrong -= 1;
                if (nextStatus === 'mastered') deltaMastered += 1;
                else deltaWaitingReview += 1;
            }

            await setDoc(historyWordRef, {
                consecutiveCorrect: newConsecutive, consecutiveWrongCount: 0, 
                incorrectCount: (oldHist ? oldHist.incorrectCount : 0) || 0,
                nextReviewSession: sessionNumber + nextReviewInterval, status: nextStatus, updatedAt: serverTimestamp()
            }, { merge: true });

        } else {
            const newIncorrect = ((oldHist ? oldHist.incorrectCount : 0) || 0) + 1;
            const newConsecutiveWrong = ((oldHist ? oldHist.consecutiveWrongCount : 0) || 0) + 1;
            
            let nextReviewInterval = 1;
            if (newConsecutiveWrong >= 5) { nextReviewInterval = 3; }

            const nextStatus = newIncorrect >= 3 ? 'chronic_error' : 'wrong';

            if (oldStatus === 'new') { deltaWaitingWrong += 1; }
            else if (oldStatus === 'review') { deltaWaitingReview -= 1; deltaWaitingWrong += 1; }
            else if (oldStatus === 'mastered') { deltaMastered -= 1; deltaWaitingWrong += 1; }

            await setDoc(historyWordRef, {
                consecutiveCorrect: 0, consecutiveWrongCount: newConsecutiveWrong, 
                incorrectCount: newIncorrect, lastIncorrectSession: sessionNumber,
                status: nextStatus,
                nextReviewSession: sessionNumber + nextReviewInterval, updatedAt: serverTimestamp()
            }, { merge: true });
        }
    }

    let finalVocaScore = Math.round(currentVocaScore + scoreDelta);
    let autoShiftMessage = '';

    const hasPassed400 = statData.passedMockExam400 === true;
    const hasPassed700 = statData.passedMockExam700 === true;

    if (currentVocaScore < 400 && finalVocaScore >= 400 && !hasPassed400) {
        finalVocaScore = 399;
        autoShiftMessage = "🚨 400점 승급 심사 구간에 도달했습니다. 모의고사 성적 연동 전까지 점수가 오르지 않습니다.";
    } 
    else if (currentVocaScore < 700 && finalVocaScore >= 700 && !hasPassed700) {
        finalVocaScore = 699;
        autoShiftMessage = "🚨 700점 승급 심사 구간에 도달했습니다. 모의고사 성적 연동 전까지 점수가 오르지 않습니다.";
    }

    finalVocaScore = Math.max(0, Math.min(1000, finalVocaScore));

    const adaptiveStats = statData.adaptiveStats || { reviewLowAccuracyCount: 0, queueOverflowCount: 0 };
    let newAdaptivePreset = statData.adaptivePreset || null; 

    // 🚀 [CTO 패치] Phase 3: 영점 조절 모드 정상화(Normalization)
    // 10회차 이상 진행되었고 현재 영점 조절 모드라면, 스캔이 얼추 끝났다고 판단하여 '밸런스 모드'로 복귀시킵니다.
    if (presetUsed === '초기 영점 조절' && sessionNumber >= 10) {
        newAdaptivePreset = null; // null이 되면 학생의 기본 프리셋(밸런스 모드)으로 돌아갑니다.
        autoShiftMessage = '✅ 기초 어휘 영점 조절(스캔)이 완료되어 표준 진도 모드로 전환됩니다.';
    } else {
        const reviewAccuracy = reviewTotal > 0 ? (reviewCorrect / reviewTotal) : 1; 
        if (reviewTotal > 0 && reviewAccuracy < 0.6) adaptiveStats.reviewLowAccuracyCount += 1;
        else adaptiveStats.reviewLowAccuracyCount = 0; 

        if ((waitingWrong + waitingReview) > (TOTAL_WORDS * 0.5)) adaptiveStats.queueOverflowCount += 1;
        else adaptiveStats.queueOverflowCount = 0; 

        if (adaptiveStats.reviewLowAccuracyCount >= 3) {
            newAdaptivePreset = '망각 방어';
            if (!autoShiftMessage) autoShiftMessage = '🚨 복습 정답률 3회 연속 60% 미만 감지 -> [망각 방어] 모드 자동 가동';
            adaptiveStats.reviewLowAccuracyCount = 0;
        } else if (adaptiveStats.queueOverflowCount >= 2 && newAdaptivePreset !== '망각 방어') {
            newAdaptivePreset = '오답 학습';
            if (!autoShiftMessage) autoShiftMessage = '🚨 오답/복습 큐 대기열 포화(50% 초과) 2회 연속 감지 -> [오답 학습] 모드 자동 가동';
            adaptiveStats.queueOverflowCount = 0;
        } else if (adaptiveStats.reviewLowAccuracyCount === 0 && adaptiveStats.queueOverflowCount === 0) {
            if (newAdaptivePreset !== null && newAdaptivePreset !== '초기 영점 조절') {
                if (!autoShiftMessage) autoShiftMessage = '✅ 학습 상태가 안정화되어 AI 자율주행 모드가 해제되고 기본 프리셋으로 복귀합니다.';
            }
            if (presetUsed !== '초기 영점 조절') newAdaptivePreset = null;
        }
    }

    totalAttempts += sessionTotal;
    totalErrors += wrongSet.size;
    masteredCount += deltaMastered;
    waitingWrong += deltaWaitingWrong;
    waitingReview += deltaWaitingReview;

    const retentionRate = Math.max(0, Math.round(((totalAttempts - totalErrors) / (totalAttempts || 1)) * 100)); 
    const comprehension = Math.min(100, Math.round((sessionCorrect / sessionTotal) * 100)); 
    
    let rubricStr = `기억 유지율 ${retentionRate}%, 다의어 이해도 ${comprehension}%를 기록했습니다.`;
    if (autoShiftMessage) rubricStr = autoShiftMessage; 

    await updateDoc(sessionRef, { 
        status: 'completed', 
        wrongCount: wrongSet.size,
        wrongAnswerNumbers: Array.from(wrongSet), 
        sessionScore: Math.round((sessionCorrect / sessionTotal) * 100),
        wrongWordsDetails: wrongWordsDetails, 
        rollbackData: rollbackData, 
        completedAt: serverTimestamp()
    });

    await updateDoc(statRef, {
        catScore: finalVocaScore,
        vocaSession: sessionNumber + 1,
        vocaProgress: Math.min(100, Math.round((masteredCount / 2000) * 100)), 
        vocaComprehension: comprehension,
        vocaRetention: retentionRate,
        vocaRubric: rubricStr,
        adaptiveStats: adaptiveStats,       
        adaptivePreset: newAdaptivePreset,  
        totalAttempts, totalErrors, masteredCount, waitingWrong, waitingReview, 
        updatedAt: serverTimestamp()
    });
};

export const rollbackVocaTestResult = async (studentId, sessionNumber) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) throw new Error("해당 회차의 시험 데이터가 없습니다.");

    const sessionData = sessionSnap.data();
    if (sessionData.status !== 'completed' || !sessionData.rollbackData) {
        throw new Error("채점 취소가 불가능한 상태이거나 복구 데이터 스냅샷이 존재하지 않습니다.");
    }

    const rb = sessionData.rollbackData;
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);

    const promises = Object.keys(rb.wordHistories).map(wordId => {
        const histRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`, wordId);
        const oldData = rb.wordHistories[wordId];
        if (oldData === null) {
            return deleteDoc(histRef); 
        } else {
            return setDoc(histRef, oldData);
        }
    });
    await Promise.all(promises);

    await updateDoc(statRef, {
        catScore: rb.catScore,
        vocaSession: rb.vocaSession,
        vocaProgress: rb.vocaProgress,
        vocaComprehension: rb.vocaComprehension,
        vocaRetention: rb.vocaRetention,
        vocaRubric: rb.vocaRubric,
        adaptiveStats: rb.adaptiveStats,
        adaptivePreset: rb.adaptivePreset,
        lastNewWordDifficulty: rb.lastNewWordDifficulty,
        totalAttempts: rb.totalAttempts,
        totalErrors: rb.totalErrors,
        masteredCount: rb.masteredCount,
        waitingWrong: rb.waitingWrong,
        waitingReview: rb.waitingReview
    });

    await updateDoc(sessionRef, {
        status: 'ready',
        wrongCount: 0,
        wrongAnswerNumbers: [],
        sessionScore: 0,
        wrongWordsDetails: [],
        completedAt: null
    });

    const nextSessionId = `test_${studentId}_s${sessionNumber + 1}`;
    const nextSessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, nextSessionId);
    const nextSessionSnap = await getDoc(nextSessionRef);
    if (nextSessionSnap.exists() && nextSessionSnap.data().status !== 'completed') {
        await deleteDoc(nextSessionRef);
    }
};