import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// 🚀 [셔플링 엔진] 단어 데이터를 분석하여 무작위로 출제 방식을 비틉니다.
const generateVariedQuestion = (word, qNumber) => {
    const meaningObj = word.meanings[0];
    const hasSynonyms = meaningObj?.synonyms && meaningObj.synonyms.length > 0;
    const hasBlank = meaningObj?.blankSentence && meaningObj.blankSentence.length > 0;
    
    // 0: 기본(뜻 모두 쓰기), 1: 유의어 제시 후 뜻 쓰기, 2: 예문 빈칸에 들어갈 영어 스펠링 쓰기
    const possibleTypes = [0]; 
    if (hasSynonyms) possibleTypes.push(1);
    if (hasBlank) possibleTypes.push(2);

    const selectedType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];

    if (selectedType === 2) {
        return {
            questionNumber: qNumber, type: 'blank', wordId: word.wordId,
            wordText: meaningObj.blankSentence[0], // 예문
            isPassiveScan: word.isPassiveScan || false,
            answerText: word.word, // 정답은 영단어 스펠링
            hint: "(빈칸 추론)"
        };
    } else if (selectedType === 1) {
        return {
            questionNumber: qNumber, type: 'synonym', wordId: word.wordId,
            wordText: `${word.word} (유의어: ${meaningObj.synonyms.join(', ')})`,
            isPassiveScan: word.isPassiveScan || false,
            answerText: word.meanings.map(m => m.koreanMeaning).join(', '),
            hint: "(다의어 모두 작성)"
        };
    } else {
        return {
            questionNumber: qNumber, type: 'basic', wordId: word.wordId,
            wordText: word.word,
            isPassiveScan: word.isPassiveScan || false,
            answerText: word.meanings.map(m => m.koreanMeaning).join(', '),
            hint: word.meanings.length > 1 ? "(뜻 2개 이상 작성)" : ""
        };
    }
};

export const generateDailyVocaSet = async (studentId) => {
    try {
        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
        const statSnap = await getDoc(statRef);
        if (!statSnap.exists()) throw new Error("영어 스탯 데이터가 없습니다.");
        const { vocaSession, vocaBook, radarChart, studyMode = 'progress' } = statSnap.data();
        const currentScore = radarChart.voca || 0;

        let maxNew = 24, maxReview = 12, maxPassive = 4; 
        if (studyMode === 'basic') { maxNew = 12; maxReview = 16; maxPassive = 12; } 
        else if (studyMode === 'review') { maxNew = 0; maxReview = 32; maxPassive = 8; }

        const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
        const historySnap = await getDocs(historyRef);
        const userHistory = {};
        historySnap.forEach(doc => { userHistory[doc.id] = doc.data(); });

        const vocaDBRef = collection(db, 'VocabularyDB');
        const bookQuery = query(vocaDBRef, where('tags', 'array-contains', vocaBook));
        const bookSnap = await getDocs(bookQuery);
        const allBookWords = bookSnap.docs.map(d => d.data());

        let queue1_Urgent = [], queue2_Review = [], queue3_Passive = [], queue4_New = [];

        for (const [wordId, hist] of Object.entries(userHistory)) {
            if (hist.status === 'chronic_error' || hist.status === 'mastered') continue;
            if (hist.lastIncorrectSession === vocaSession - 1) {
                const wordData = allBookWords.find(w => w.wordId === wordId);
                if (wordData) queue1_Urgent.push(wordData);
            } else if (hist.nextReviewSession && hist.nextReviewSession <= vocaSession) {
                const wordData = allBookWords.find(w => w.wordId === wordId);
                if (wordData) queue2_Review.push(wordData);
            }
        }

        let combinedReview = [...shuffleArray(queue1_Urgent), ...shuffleArray(queue2_Review)].slice(0, maxReview);
        const selectedWordIds = new Set(combinedReview.map(w => w.wordId));

        const passiveQuery = query(vocaDBRef, 
            where('meanings.0.meaningDifficulty', '>=', Math.max(0, currentScore - 200)),
            where('meanings.0.meaningDifficulty', '<=', Math.max(0, currentScore - 150))
        );
        const passiveSnap = await getDocs(passiveQuery);
        queue3_Passive = shuffleArray(passiveSnap.docs.map(d => d.data()).filter(w => !userHistory[w.wordId])).slice(0, maxPassive);
        queue3_Passive.forEach(w => { w.isPassiveScan = true; selectedWordIds.add(w.wordId); });

        const candidateNew = allBookWords.filter(w => !userHistory[w.wordId] && !selectedWordIds.has(w.wordId));
        queue4_New = candidateNew.slice(0, Math.max(0, 40 - (combinedReview.length + queue3_Passive.length)));

        const final40Words = [...combinedReview, ...queue3_Passive, ...queue4_New];

        // 🚀 셔플링 엔진 통과 (1번~50번 전체에 다이나믹 변주 적용)
        const full50Questions = shuffleArray([...final40Words, ...shuffleArray(final40Words).slice(0, 10)]).map((word, index) => {
            return generateVariedQuestion(word, index + 1);
        });

        const testSessionId = `test_${studentId}_s${vocaSession}`;
        const testPayload = {
            testId: testSessionId, studentId, sessionNumber: vocaSession, studyMode,
            wordsForPrint: final40Words, questionsForTest: full50Questions,
            status: 'pending', createdAt: serverTimestamp()
        };

        await setDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId), testPayload);
        return testPayload;
    } catch (error) { console.error(error); throw error; }
};

export const processVocaTestResult = async (studentId, sessionNumber, wrongAnswerNumbers) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const { questionsForTest } = sessionSnap.data();
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);
    const { radarChart, vocaBook } = statSnap.data();
    
    let currentVocaScore = radarChart.voca || 0;
    const wrongSet = new Set(wrongAnswerNumbers);

    let sessionTotal = 0; let sessionCorrect = 0;

    for (const q of questionsForTest) {
        sessionTotal++;
        const isCorrect = !wrongSet.has(q.questionNumber);
        if (isCorrect) sessionCorrect++;

        const historyWordRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`, q.wordId);
        const histSnap = await getDoc(historyWordRef);
        const hist = histSnap.exists() ? histSnap.data() : { consecutiveCorrect: 0, incorrectCount: 0 };

        if (isCorrect) {
            if (q.isPassiveScan) {
                await setDoc(historyWordRef, { status: 'mastered', updatedAt: serverTimestamp() }, { merge: true });
            } else {
                const newConsecutive = (hist.consecutiveCorrect || 0) + 1;
                await setDoc(historyWordRef, {
                    consecutiveCorrect: newConsecutive,
                    nextReviewSession: sessionNumber + (newConsecutive === 1 ? 1 : newConsecutive === 2 ? 3 : 6),
                    status: newConsecutive >= 4 ? 'mastered' : 'learning',
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
            currentVocaScore += 3;
        } else {
            await setDoc(historyWordRef, {
                consecutiveCorrect: 0,
                incorrectCount: (hist.incorrectCount || 0) + 1,
                lastIncorrectSession: sessionNumber,
                status: (hist.incorrectCount || 0) + 1 >= 3 ? 'chronic_error' : 'learning',
                updatedAt: serverTimestamp()
            }, { merge: true });
            currentVocaScore = Math.max(0, currentVocaScore - 2);
        }
    }

    // 🚀 [스탯 자동 정산 엔진]
    // 1. 전체 마스터 데이터 가져오기 (비율 계산용)
    const vocaDBRef = collection(db, 'VocabularyDB');
    const bookQuery = query(vocaDBRef, where('tags', 'array-contains', vocaBook));
    const bookSnap = await getDocs(bookQuery);
    const totalWordsInBook = bookSnap.docs.length || 1000;

    // 2. 학생의 역사 데이터 분석
    const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
    const historySnap = await getDocs(historyRef);
    let masteredCount = 0; let totalAttempts = 0; let totalErrors = 0;
    
    historySnap.forEach(doc => {
        const d = doc.data();
        if (d.status === 'mastered') masteredCount++;
        totalAttempts += (d.consecutiveCorrect || 0) + (d.incorrectCount || 0);
        totalErrors += (d.incorrectCount || 0);
    });

    const vocaProgress = Math.min(100, Math.round((masteredCount / totalWordsInBook) * 100)); // 진도율
    const retentionRate = Math.max(0, Math.round(((totalAttempts - totalErrors) / (totalAttempts || 1)) * 100)); // 장기 기억 유지력
    const comprehension = Math.min(100, Math.round((sessionCorrect / sessionTotal) * 100)); // 당일 뜻 이해도 (다의어/빈칸 정답률)

    // 🚀 [루브릭 자동 생성기]
    let rubricStr = "";
    if (vocaProgress < 20) {
        rubricStr = `현재 ${vocaBook} 교재에 적응 중입니다. 기초 누적 학습을 진행합니다.`;
    } else if (retentionRate < 60) {
        rubricStr = `기억 버팀도(${retentionRate}%)가 일시적으로 낮아져 시스템이 [복습 모드]로 궤도를 수정하여 오답을 밀착 방어 중입니다.`;
    } else if (comprehension < 70) {
        rubricStr = `스펠링은 외우나 다의어, 파생어 등 깊이 있는 문맥 활용(${comprehension}%)에서 시간이 걸립니다. 예문 빈칸 훈련을 강화합니다.`;
    } else {
        rubricStr = `장기 기억력(${retentionRate}%)과 뜻 이해도(${comprehension}%) 모두 최상위권 궤도에 올랐습니다. 진도율(${vocaProgress}%)을 공격적으로 뺍니다.`;
    }

    await updateDoc(statRef, {
        'radarChart.voca': Math.min(1000, currentVocaScore),
        vocaSession: sessionNumber + 1,
        // UI 표시용 3대 스탯 및 루브릭 
        vocaProgress: vocaProgress,
        vocaComprehension: comprehension,
        vocaRetention: retentionRate,
        vocaRubric: rubricStr,
        updatedAt: serverTimestamp()
    });

    await updateDoc(sessionRef, { status: 'completed', wrongCount: wrongSet.size });
};