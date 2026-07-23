/* [서비스 가치(Service Value)] 스마트 아날로그 Voca 코어 엔진 (O(1) Delta Architecture v7.3)
   🚀 가치 1 (인쇄 100% 보장): 기존 학생의 과거 기록 조회 충돌을 해결하고 3단계 폴백으로 언제나 50문항을 생성합니다.
   🚀 가치 2 (에빙하우스 망각 곡선): 1, 3, 7, 14, 30, 60, 120일 주기로 오답을 재출제하여 장기 기억 전환율을 극대화합니다.
   🚀 가치 3 (학부모 가시성): 채점 즉시 학부모용 AI 분석 리포트 JSON을 사전 조립(O(1))하여 실시간 앱으로 동기화합니다. */

import { 
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, 
  deleteDoc, serverTimestamp, orderBy, limit, arrayUnion, documentId 
} from 'firebase/firestore';
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

const generateVariedQuestion = (word, qNumber, poolForTest = []) => {
    const meaningObj = word.meanings && word.meanings.length > 0 ? word.meanings[0] : null;
    const allMeanings = word.meanings ? word.meanings.map(m => m.koreanMeaning).join(', ') : '뜻 없음';

    const baseQuestion = {
        questionNumber: qNumber,
        wordId: word.wordId || word.id || `word_${qNumber}`,
        queueType: word.queueType || '신규'
    };

    if (qNumber <= 40) {
        return {
            ...baseQuestion, type: 'basic',
            wordText: word.word || 'Vocabulary',
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
            wordText: word.word || 'Vocabulary',
            answerText: allMeanings,
            hint: (word.meanings && word.meanings.length > 1) ? "(다의어 모두 작성)" : ""
        };
    }

    const selectedType = advancedTypes[Math.floor(Math.random() * advancedTypes.length)];

    if (selectedType === 1 || selectedType === 3) {
        const isSynonym = selectedType === 1;
        const targetArray = isSynonym ? meaningObj.synonyms : meaningObj.antonyms;
        
        const correctAnswer = targetArray[0]; 
        const distractors = [];
        let attempts = 0;
        
        while (distractors.length < 3 && attempts < poolForTest.length * 2) {
            attempts++;
            if (!poolForTest || poolForTest.length === 0) break;

            const randomWord = poolForTest[Math.floor(Math.random() * poolForTest.length)]?.word;
            
            if (randomWord && randomWord !== correctAnswer && randomWord !== word.word && !distractors.includes(randomWord)) {
                distractors.push(randomWord);
            }
        }

        while (distractors.length < 3) {
            distractors.push(`dummy_${Math.floor(Math.random()*1000)}`);
        }

        const options = shuffleArray([correctAnswer, ...distractors]); 

        return {
            ...baseQuestion, 
            type: isSynonym ? 'synonym' : 'antonym',
            wordText: `다음 단어의 ${isSynonym ? '유의어(Synonym)' : '반의어(Antonym)'}를 고르시오: ${word.word}`,
            answerText: correctAnswer,
            hint: `(뜻: ${allMeanings})`,
            options: options 
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
        
        // 🚀 [CTO 방탄 패치] 스탯 데이터가 없어도 에러를 던지지 않고 기본 스탯으로 안전하게 초기화합니다!
        const statData = statSnap.exists() ? statSnap.data() : {
            vocaSession: 1, catScore: 300, vocaPreset: '밸런스 모드', seenWordIds: [], totalAttempts: 0, totalErrors: 0, masteredCount: 0
        };

        const vocaSession = statData.vocaSession || 1;
        const catScore = Math.max(0, Math.min(1000, statData.catScore || 300)); 
        
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
                    finalWordData.push({ ...d.data(), wordId: d.id, id: d.id, queueType: '딥 스캔' });
                    seenWordIds.add(d.id);
                    newlySeenWordIds.push(d.id);
                });
                qZ2 += (qZ1 - selectedZ1.length);
            } else {
                qZ2 += qZ1;
            }

            if (qZ2 > 0) {
                const z2Query = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', z1_limit), where('rootDifficulty', '<', z2_limit), limit(150));
                const z2Snap = await getDocs(z2Query);
                const z2Candidates = z2Snap.docs.filter(d => !seenWordIds.has(d.id));
                const selectedZ2 = shuffleArray(z2Candidates).slice(0, qZ2);
                selectedZ2.forEach(d => {
                    finalWordData.push({ ...d.data(), wordId: d.id, id: d.id, queueType: '의심 스캔' });
                    seenWordIds.add(d.id);
                    newlySeenWordIds.push(d.id);
                });
                qZ3 += (qZ2 - selectedZ2.length);
            }

            let newProgressDifficulty = statData.lastNewWordDifficulty || catScore;
            if (qZ3 > 0) {
                const z3Query = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', newProgressDifficulty), orderBy('rootDifficulty', 'asc'), limit(150));
                const z3Snap = await getDocs(z3Query);
                const z3Candidates = z3Snap.docs.filter(d => !seenWordIds.has(d.id));
                const selectedZ3 = z3Candidates.slice(0, qZ3);
                selectedZ3.forEach(d => {
                    const wData = d.data();
                    finalWordData.push({ ...wData, wordId: d.id, id: d.id, queueType: '신규' });
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

            await setDoc(statRef, { lastNewWordDifficulty: newProgressDifficulty, adaptivePreset: '초기 영점 조절', updatedAt: serverTimestamp() }, { merge: true });

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
                    finalWordData.push({ ...d.data(), wordId: d.id, id: d.id, queueType: '패시브' });
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
                const newQuery = query(collection(db, 'VocabularyDB'), where('rootDifficulty', '>=', newProgressDifficulty), orderBy('rootDifficulty', 'asc'), limit(150));
                const newSnap = await getDocs(newQuery);
                const newCandidates = newSnap.docs.filter(d => !seenWordIds.has(d.id));
                
                const selectedNew = newCandidates.slice(0, qNew);
                selectedNew.forEach(d => {
                    const wData = d.data();
                    finalWordData.push({ ...wData, wordId: d.id, id: d.id, queueType: '신규' });
                    seenWordIds.add(d.id);
                    newlySeenWordIds.push(d.id);
                    if (wData.rootDifficulty > newProgressDifficulty) {
                        newProgressDifficulty = wData.rootDifficulty; 
                    }
                });
            }
            await setDoc(statRef, { appliedPreset: presetName, lastNewWordDifficulty: newProgressDifficulty, updatedAt: serverTimestamp() }, { merge: true });
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
                            if (queueInfo && !finalWordData.some(fw => (fw.wordId || fw.id) === d.id)) {
                                finalWordData.push({ ...d.data(), wordId: d.id, id: d.id, queueType: queueInfo.queueType });
                            }
                        });
                    })
                );
            }
            await Promise.all(fetchPromises);
        }

        // 🚀 [2단계] DB 내 여유 신규 단어 우선 소진 (기존 원생 데이터 불일치 완벽 방어)
        if (finalWordData.length < 40) {
            const shortage = 40 - finalWordData.length;
            console.warn(`[VocaEngine] 1단계 추출 단어 부족(${finalWordData.length}개). DB에서 신규 단어 ${shortage}개를 추가 조회합니다.`);
            try {
                const extraQuery = query(collection(db, 'VocabularyDB'), limit(shortage + 30));
                const extraSnap = await getDocs(extraQuery);
                extraSnap.docs.forEach(docSnap => {
                    if (finalWordData.length < 40 && !finalWordData.some(w => (w.wordId || w.id) === docSnap.id)) {
                        const extraWord = docSnap.data();
                        finalWordData.push({ ...extraWord, wordId: docSnap.id, id: docSnap.id, queueType: '신규(추가)' });
                        seenWordIds.add(docSnap.id);
                        newlySeenWordIds.push(docSnap.id);
                    }
                });
            } catch (fallbackErr) {
                console.error("2단계 DB 추가 추출 중 에러:", fallbackErr);
            }
        }

        // 🚀 [3단계] 최후의 서킷 브레이커: 긴급 수능 풀 가동 (WSOD 및 출력 불가 에러 원천 봉쇄)
        if (finalWordData.length < 10) {
            console.error(`🚨 [Critical Warning] DB 단어 총량 부족! 강사의 수업 진행을 위해 긴급 수능 필수 어휘 풀을 가동합니다.`);
            const emergencyWords = [
                { wordId: 'em_1', id: 'em_1', word: 'Absolute', meanings: [{ koreanMeaning: '절대적인, 완전한', partOfSpeech: 'adj.' }], rootDifficulty: 200 },
                { wordId: 'em_2', id: 'em_2', word: 'Benevolent', meanings: [{ koreanMeaning: '자비로운, 인자한', partOfSpeech: 'adj.' }], rootDifficulty: 400 },
                { wordId: 'em_3', id: 'em_3', word: 'Cognitive', meanings: [{ koreanMeaning: '인식의, 인지의', partOfSpeech: 'adj.' }], rootDifficulty: 500 },
                { wordId: 'em_4', id: 'em_4', word: 'Dilemma', meanings: [{ koreanMeaning: '진퇴양난, 딜레마', partOfSpeech: 'n.' }], rootDifficulty: 300 },
                { wordId: 'em_5', id: 'em_5', word: 'Empirical', meanings: [{ koreanMeaning: '실증적인, 경험적인', partOfSpeech: 'adj.' }], rootDifficulty: 600 },
                { wordId: 'em_6', id: 'em_6', word: 'Fluctuate', meanings: [{ koreanMeaning: '변동하다, 오르내리다', partOfSpeech: 'v.' }], rootDifficulty: 550 },
                { wordId: 'em_7', id: 'em_7', word: 'Guaranteed', meanings: [{ koreanMeaning: '보장된, 확실한', partOfSpeech: 'adj.' }], rootDifficulty: 250 },
                { wordId: 'em_8', id: 'em_8', word: 'Hypothesis', meanings: [{ koreanMeaning: '가설, 가정', partOfSpeech: 'n.' }], rootDifficulty: 450 },
                { wordId: 'em_9', id: 'em_9', word: 'Inevitable', meanings: [{ koreanMeaning: '피할 수 없는, 필연적인', partOfSpeech: 'adj.' }], rootDifficulty: 350 },
                { wordId: 'em_10', id: 'em_10', word: 'Judicious', meanings: [{ koreanMeaning: '현명한, 신중한', partOfSpeech: 'adj.' }], rootDifficulty: 650 }
            ];
            emergencyWords.forEach((ew, idx) => {
                if (!finalWordData.some(fw => (fw.wordId || fw.id) === ew.wordId)) {
                    finalWordData.push({ ...ew, queueType: '신규(긴급)' });
                }
            });
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
            const safeRandomIndex = Math.floor(Math.random() * finalWordData.length);
            const safeWord = finalWordData[safeRandomIndex] || {
                wordId: `dummy_${poolForTest.length}`,
                id: `dummy_${poolForTest.length}`,
                word: `Vocabulary_${poolForTest.length}`,
                meanings: [{ koreanMeaning: '필수 고등 어휘', partOfSpeech: 'n.' }],
                queueType: '신규'
            };
            poolForTest.push(safeWord);
        }

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
            await setDoc(statRef, { seenWordIds: arrayUnion(...newlySeenWordIds), updatedAt: serverTimestamp() }, { merge: true });
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
    const statData = statSnap.data() || {};
    
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
        await setDoc(statRef, { totalAttempts, totalErrors, masteredCount, waitingWrong, waitingReview, seenWordIds: migratedSeenIds }, { merge: true });
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
        wordsForPrint.forEach(w => { difficultyMap[w.wordId || w.id] = w.rootDifficulty || currentVocaScore; });
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

    const nextBoundary = Math.floor(currentVocaScore / 50) * 50 + 50; 
    const maxApprovedPromotion = statData.maxApprovedPromotion || 0;
    let promotionPending = statData.promotionPending || null;

    if (finalVocaScore >= nextBoundary && maxApprovedPromotion < nextBoundary) {
        finalVocaScore = nextBoundary - 1; 
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

    const passiveCheckedCount = wordsForPrint ? wordsForPrint.filter(w => w.queueType === '패시브').length : 0;
    const chronicCount = wrongWordsDetails.filter(w => w.queueType === '만성 오답').length;

    const parentReport = {
        summary: {
            retentionRate: retentionRate,
            comprehension: comprehension,
            mainComment: autoShiftMessage || `현재 학생의 장기 기억 전환율은 ${retentionRate}%로 매우 안정적입니다.`
        },
        metrics: {
            defended: reviewTotal, 
            passiveChecked: passiveCheckedCount, 
            chronic: chronicCount 
        },
        vulnerableWords: wrongWordsDetails.map(w => {
            let aiComment = '';
            if (w.queueType === '만성 오답') {
                aiComment = '3회 이상 반복 틀림. 내일 예문 빈칸 채우기 등 다른 형태로 자동 변형되어 집중 재출제됩니다.';
            } else if (w.queueType === '복습') {
                aiComment = '망각 주기가 도래하여 재점검 중 혼동이 발생했습니다. 단기 기억을 장기 기억으로 전환하기 위해 주기를 재설정합니다.';
            } else if (w.queueType === '패시브') {
                aiComment = '기초 단어 무작위 점검 중 누수가 발견되었습니다. 어학의 뼈대를 흔들지 않도록 기초 구간을 다시 메꿉니다.';
            } else {
                aiComment = '새롭게 학습한 단어입니다. 뇌에 완전히 각인될 때까지 내일 1차 복습 시스템이 가동됩니다.';
            }
            return {
                word: w.word,
                meaning: w.meaning,
                type: w.queueType,
                aiComment: aiComment
            };
        }),
        updatedAt: new Date().toISOString()
    };

    await setDoc(sessionRef, { 
        status: 'completed', 
        wrongCount: wrongSet.size,
        wrongAnswerNumbers: Array.from(wrongSet), 
        sessionScore: Math.round((sessionCorrect / sessionTotal) * 100),
        wrongWordsDetails: wrongWordsDetails, 
        rollbackData: rollbackData, 
        completedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(statRef, {
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
        parentReport: parentReport, 
        updatedAt: serverTimestamp()
    }, { merge: true });
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

    await setDoc(statRef, {
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
    }, { merge: true });

    await setDoc(sessionRef, {
        status: 'ready',
        wrongCount: 0,
        wrongAnswerNumbers: [],
        sessionScore: 0,
        wrongWordsDetails: [],
        completedAt: null
    }, { merge: true });

    const nextSessionId = `test_${studentId}_s${sessionNumber + 1}`;
    const nextSessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, nextSessionId);
    const nextSessionSnap = await getDoc(nextSessionRef);
    if (nextSessionSnap.exists() && nextSessionSnap.data().status !== 'completed') {
        await deleteDoc(nextSessionRef);
    }
};