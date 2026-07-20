/* [서비스 가치] 스마트 아날로그 Voca 코어 엔진 (O(1) Delta Architecture)
   🚀 업데이트 6 (동적 50점 승급 심사): 특정 점수가 아닌 '매 50점 단위(50, 100, 150...)'마다 승급 심사를 강제하는 알고리즘을 도입했습니다. 
   🚀 업데이트 7 (고급 어휘력 확장): 41~50번 구간에서 유의어/반의어를 묻는 객관식(Multiple Choice) 알고리즘을 적용하여 수능형 어휘 응용력을 강화합니다. 
   🚀 핫픽스 (단어 기아 현상 방지): Z1 쿼터 증발을 막고 limit 버퍼를 확장하여 무조건 40단어가 출제되도록 안정성을 강화했습니다. */

import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, limit, arrayUnion, documentId } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

export const VOCA_PRESETS = {
    '밸런스 모드':  { wrong: 15, review: 30, passive: 5, new: 50 },  
    '오답 학습':    { wrong: 60, review: 20, passive: 5, new: 15 },  
    '망각 방어':    { wrong: 40, review: 50, passive: 10, new: 0 },  
    '기초 수리':    { wrong: 10, review: 20, passive: 40, new: 30 }, 
    '스퍼트 모드':  { wrong: 10, review: 15, passive: 5, new: 70 },
    '초기 영점 조절': { wrong: 0, review: 0, z1_deep: 5, z2_scan: 45, z3_target: 50 } 
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

// [수정] 오답 보기를 추출하기 위해 poolForTest(당일 출제 전체 단어)를 인자로 추가로 받습니다.
const generateVariedQuestion = (word, qNumber, poolForTest = []) => {
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

    // [CTO 최적화 로직] 유의어(1) 또는 반의어(3) 일 때 객관식 형태(Options)의 데이터 구조 생성
    if (selectedType === 1 || selectedType === 3) {
        const isSynonym = selectedType === 1;
        const targetArray = isSynonym ? meaningObj.synonyms : meaningObj.antonyms;
        
        const correctAnswer = targetArray[0]; // 첫 번째 유의어/반의어를 정답으로 설정
        const distractors = [];
        let attempts = 0;
        
        // 메모리에 로드된 poolForTest를 활용하여 O(1) 방식으로 랜덤 오답 3개 추출 (Firebase 추가 비용 발생 0원)
        while (distractors.length < 3 && attempts < poolForTest.length * 2) {
            attempts++;
            if (!poolForTest || poolForTest.length === 0) break; // 안전 장치

            const randomWord = poolForTest[Math.floor(Math.random() * poolForTest.length)].word;
            
            // 오답이 정답과 같지 않고, 원본 단어와도 같지 않으며, 중복되지 않을 때만 추가
            if (randomWord && randomWord !== correctAnswer && randomWord !== word.word && !distractors.includes(randomWord)) {
                distractors.push(randomWord);
            }
        }

        // 만약 추출 풀이 너무 적어 오답이 3개가 안 채워질 경우를 대비한 안전 장치(Fallback)
        while (distractors.length < 3) {
            distractors.push(`dummy_${Math.floor(Math.random()*1000)}`);
        }

        const options = shuffleArray([correctAnswer, ...distractors]); // 정답 1 + 오답 3 셔플

        return {
            ...baseQuestion, 
            type: isSynonym ? 'synonym' : 'antonym',
            wordText: `다음 단어의 ${isSynonym ? '유의어(Synonym)' : '반의어(Antonym)'}를 고르시오: ${word.word}`,
            answerText: correctAnswer,
            hint: `(뜻: ${allMeanings})`,
            options: options // 클라이언트 UI에서 이를 바탕으로 버튼식 객관식 렌더링 가능
        };
    } else if (selectedType === 2) {
        return {
            ...baseQuestion, type: 'blank',
            wordText: meaningObj.blankSentence[0], 
            answerText: word.word, 
            hint: `(빈칸에 알맞은 영어 단어 작성, 뜻: ${allMeanings})`
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

        if (presetName === '초기 영점 조절') {
            const z1_limit = Math.max(0, catScore - 150); 
            const z2_limit = catScore;                    
            
            let qZ1 = Math.round(TOTAL_WORDS * (preset.z1_deep / 100)); 
            let qZ2 = Math.round(TOTAL_WORDS * (preset.z2_scan / 100)); 
            let qZ3 = Math.round(TOTAL_WORDS * (preset.z3_target / 100)); 

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
            // 💡 [핫픽스 1] Z1 구간을 건너뛸 경우 할당량을 Z2로 보존 (단어 수 증발 방지)
            else {
                qZ2 += qZ1;
            }

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

            let newProgressDifficulty = statData.lastNewWordDifficulty || catScore;
            if (qZ3 > 0) {
                // 💡 [핫픽스 2] 중복 단어 필터링을 대비해 넉넉한 버퍼(150) 제공 (기존 qZ3 + 20에서 변경)
                const z3Query = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', newProgressDifficulty), orderBy('rootDifficulty', 'asc'), limit(150));
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

            if (wrongPool.length > 0) {
                const qWrong = Math.min(wrongPool.length, 5);
                const actualWrong = wrongPool.slice(0, qWrong);
                actualWrong.forEach(item => { requiredOldWordIds.push({ wordId: item.id, queueType: '오답' }); });
                finalWordData.splice(finalWordData.length - qWrong, qWrong); 
            }

            await updateDoc(statRef, { lastNewWordDifficulty: newProgressDifficulty, adaptivePreset: '초기 영점 조절' });

        } else {
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
                // 💡 [핫픽스 3] 2회차 이후 시험에서도 신규 단어가 고갈되지 않도록 안전 버퍼(150) 적용
                const newQuery = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', newProgressDifficulty), orderBy('rootDifficulty', 'asc'), limit(150));
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

        // [수정] 오답 보기를 추출할 수 있도록 poolForTest 데이터를 인자로 넘겨줍니다.
        const full50Questions = poolForTest.map((word, index) => {
            return generateVariedQuestion(word, index + 1, poolForTest);
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
        promotionPending: statData.promotionPending || null,
        maxApprovedPromotion: statData.maxApprovedPromotion || 0,
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
            
            if (q.queueType === '의심 스캔' || q.queueType === '딥 스캔') {
                newConsecutive = 7; 
                nextReviewInterval = 120; 
                nextStatus = 'mastered';
            } else {
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

    // ============================================================================
    // 🚀 [CTO 패치] 50점 단위 동적 승급 심사 (Hard-Cap) 알고리즘
    // ============================================================================
    const nextBoundary = Math.floor(currentVocaScore / 50) * 50 + 50; 
    const maxApprovedPromotion = statData.maxApprovedPromotion || 0;
    let promotionPending = statData.promotionPending || null;

    if (finalVocaScore >= nextBoundary && maxApprovedPromotion < nextBoundary) {
        finalVocaScore = nextBoundary - 1; // 허들에서 -1점으로 강제 정지
        promotionPending = nextBoundary;
        autoShiftMessage = `🚨 ${nextBoundary}점 승급 심사 구간에 도달했습니다. 담당 강사의 승인 전까지 점수가 오르지 않습니다.`;
    } else {
        promotionPending = null;
    }

    finalVocaScore = Math.max(0, Math.min(1000, finalVocaScore));

    const adaptiveStats = statData.adaptiveStats || { reviewLowAccuracyCount: 0, queueOverflowCount: 0 };
    let newAdaptivePreset = statData.adaptivePreset || null; 

    if (presetUsed === '초기 영점 조절') {
        if (sessionNumber >= 10 || (sessionNumber >= 5 && waitingWrong < 10)) {
            newAdaptivePreset = null; 
            autoShiftMessage = sessionNumber < 10 
                ? '✅ 기초 어휘 스캔 결과가 매우 우수하여, 조기 졸업 및 표준 진도 모드로 전환됩니다.' 
                : '✅ 기초 어휘 영점 조절(스캔)이 완료되어 표준 진도 모드로 전환됩니다.';
        } else {
            newAdaptivePreset = '초기 영점 조절';
        }
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
            if (newAdaptivePreset !== null) {
                if (!autoShiftMessage) autoShiftMessage = '✅ 학습 상태가 안정화되어 AI 자율주행 모드가 해제되고 기본 프리셋으로 복귀합니다.';
            }
            newAdaptivePreset = null;
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
        promotionPending: promotionPending,
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
        waitingReview: rb.waitingReview,
        promotionPending: rb.promotionPending !== undefined ? rb.promotionPending : null,
        maxApprovedPromotion: rb.maxApprovedPromotion !== undefined ? rb.maxApprovedPromotion : 0
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