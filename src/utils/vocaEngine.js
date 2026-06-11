/* [서비스 가치] 학생의 CAT 점수를 기반으로 Z1~Z3 구간을 나누어 맞춤 출제하고, 
   영점 조절 기간에는 '고속 마스터(Fast-Track)'를 적용하여 아는 단어를 지루하게 반복하지 않게 해주는 핵심 AI 엔진입니다. */
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

    const baseQuestion = {
        questionNumber: qNumber,
        wordId: word.wordId,
        isPassiveScan: word.isPassiveScan || false,
        zone: word.zone || 'normal' // 🚀 Z1, Z2, Z3 출처 추적용 데이터 추가
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
        
        // 🚀 CAT 진단으로 세팅된 데이터들 불러오기
        const { vocaSession, vocaBook, radarChart, studyMode = 'progress', calibrationSessionsLeft = 0, zones } = statSnap.data();
        const currentScore = radarChart?.voca || 0;

        const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
        const historySnap = await getDocs(historyRef);
        const userHistory = {};
        historySnap.forEach(doc => { userHistory[doc.id] = doc.data(); });

        const vocaDBRef = collection(db, 'VocabularyDB');
        const bookQuery = query(vocaDBRef, where('tags', 'array-contains', vocaBook || '기본교재'));
        const bookSnap = await getDocs(bookQuery);
        const allBookWords = bookSnap.docs.map(d => d.data());

        let final40Words = [];
        const selectedWordIds = new Set();

        // =========================================================================
        // 🚀 Phase 2. 영점 조절 모드 가동 (Calibration Mode)
        // =========================================================================
        if (studyMode === 'calibration' && calibrationSessionsLeft > 0 && zones) {
            
            // 난이도 데이터가 있는 미학습 단어들 추출
            const unlearnedWords = allBookWords.filter(w => !userHistory[w.wordId]);

            // [Z1] 초등 완전 패스 구역 딥스캔 (4단어)
            const z1Words = shuffleArray(unlearnedWords.filter(w => 
                w.meanings[0]?.meaningDifficulty >= zones.Z1_Pass[0] && w.meanings[0]?.meaningDifficulty <= zones.Z1_Pass[1]
            )).slice(0, 4);
            z1Words.forEach(w => { w.zone = 'Z1'; selectedWordIds.add(w.wordId); });

            // [Z2] 중1~2 의심 구역 스캔 (24단어)
            const z2Words = shuffleArray(unlearnedWords.filter(w => 
                !selectedWordIds.has(w.wordId) && w.meanings[0]?.meaningDifficulty >= zones.Z2_Grey[0] && w.meanings[0]?.meaningDifficulty <= zones.Z2_Grey[1]
            )).slice(0, 24);
            z2Words.forEach(w => { w.zone = 'Z2'; selectedWordIds.add(w.wordId); });

            // [Z3] 타겟 학습 구역 (12단어)
            const z3Words = shuffleArray(unlearnedWords.filter(w => 
                !selectedWordIds.has(w.wordId) && w.meanings[0]?.meaningDifficulty >= zones.Z3_Target[0] && w.meanings[0]?.meaningDifficulty <= zones.Z3_Target[1]
            )).slice(0, 12);
            z3Words.forEach(w => { w.zone = 'Z3'; selectedWordIds.add(w.wordId); });

            final40Words = [...z1Words, ...z2Words, ...z3Words];

            // 40개가 안 채워졌을 경우 (Z1, Z2 단어가 고갈된 경우) 남은 단어 아무거나 욱여넣어 40개 맞춤
            if (final40Words.length < 40) {
                const fillers = shuffleArray(unlearnedWords.filter(w => !selectedWordIds.has(w.wordId))).slice(0, 40 - final40Words.length);
                fillers.forEach(w => w.zone = 'Z3'); // 부족분은 전부 타겟으로 취급
                final40Words = [...final40Words, ...fillers];
            }

        } 
        // =========================================================================
        // 🚀 Phase 3. 정상화 모드 (일반 프리셋)
        // =========================================================================
        else {
            let maxNew = 24, maxReview = 12, maxPassive = 4; 
            if (studyMode === 'basic') { maxNew = 12; maxReview = 16; maxPassive = 12; } 
            else if (studyMode === 'review') { maxNew = 0; maxReview = 32; maxPassive = 8; }

            let queue1_Urgent = [], queue2_Review = [], queue3_Passive = [], queue4_New = [];

            for (const [wordId, hist] of Object.entries(userHistory)) {
                if (hist.status === 'chronic_error' || hist.status === 'mastered') continue;
                
                if (hist.lastIncorrectSession === vocaSession - 1) {
                    const wordData = allBookWords.find(w => w.wordId === wordId);
                    if (wordData) queue1_Urgent.push(wordData); // 어제 틀린 단어 무조건 재출제 (지옥방)
                } else if (hist.nextReviewSession && hist.nextReviewSession <= vocaSession) {
                    const wordData = allBookWords.find(w => w.wordId === wordId);
                    if (wordData) queue2_Review.push(wordData); // 주기적 누적 복습 단어
                }
            }

            let combinedReview = [...shuffleArray(queue1_Urgent), ...shuffleArray(queue2_Review)].slice(0, maxReview);
            combinedReview.forEach(w => { w.zone = 'Review'; selectedWordIds.add(w.wordId); });

            // 패시브 스캔 (Z2구역 잔여 찌꺼기들)
            const passiveQuery = query(vocaDBRef, 
                where('meanings.0.meaningDifficulty', '>=', Math.max(0, currentScore - 200)),
                where('meanings.0.meaningDifficulty', '<=', Math.max(0, currentScore - 150))
            );
            const passiveSnap = await getDocs(passiveQuery);
            queue3_Passive = shuffleArray(passiveSnap.docs.map(d => d.data()).filter(w => !userHistory[w.wordId])).slice(0, maxPassive);
            queue3_Passive.forEach(w => { w.isPassiveScan = true; w.zone = 'Z2'; selectedWordIds.add(w.wordId); });

            // 신규 진도 (Z3)
            const candidateNew = allBookWords.filter(w => !userHistory[w.wordId] && !selectedWordIds.has(w.wordId));
            queue4_New = candidateNew.slice(0, Math.max(0, 40 - (combinedReview.length + queue3_Passive.length)));
            queue4_New.forEach(w => { w.zone = 'Z3'; });

            final40Words = [...combinedReview, ...queue3_Passive, ...queue4_New];
        }

        // 40단어를 섞어서 50문제로 뻥튀기(10문제는 반복 변주 출제)
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
    } catch (error) { console.error("Voca Generation Error:", error); throw error; }
};

export const processVocaTestResult = async (studentId, sessionNumber, wrongAnswerNumbers) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const { questionsForTest } = sessionSnap.data();
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);
    const statData = statSnap.data();
    
    let currentVocaScore = statData.radarChart?.voca || 0;
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
            // 🚀 [고속 마스터 규칙(Fast-Track)] 
            // 영점 조절 모드에서 출제된 Z1(초등), Z2(중1~2) 구역 단어이거나, 일상 패시브 스캔인 경우 단 한 번만 맞아도 즉시 마스터!
            if (q.isPassiveScan || (statData.studyMode === 'calibration' && (q.zone === 'Z1' || q.zone === 'Z2'))) {
                await setDoc(historyWordRef, { status: 'mastered', updatedAt: serverTimestamp() }, { merge: true });
            } else {
                // Z3 타겟 단어이거나 일반 진도인 경우 -> 3번은 반복해서 맞아야 마스터 인정
                const newConsecutive = (hist.consecutiveCorrect || 0) + 1;
                await setDoc(historyWordRef, {
                    consecutiveCorrect: newConsecutive,
                    nextReviewSession: sessionNumber + (newConsecutive === 1 ? 1 : newConsecutive === 2 ? 3 : 6),
                    status: newConsecutive >= 3 ? 'mastered' : 'learning',
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
            currentVocaScore += 3;
        } else {
            // 틀린 단어는 오답 지옥방(chronic_error)으로 보냄
            await setDoc(historyWordRef, {
                consecutiveCorrect: 0,
                incorrectCount: (hist.incorrectCount || 0) + 1,
                lastIncorrectSession: sessionNumber, // 바로 다음 세션에서 지옥방 큐(Queue1)로 빨려들어감
                status: (hist.incorrectCount || 0) + 1 >= 3 ? 'chronic_error' : 'learning',
                updatedAt: serverTimestamp()
            }, { merge: true });
            currentVocaScore = Math.max(0, currentVocaScore - 2);
        }
    }

    // 🚀 [스탯 자동 정산 및 정상화 엔진]
    const vocaDBRef = collection(db, 'VocabularyDB');
    const bookQuery = query(vocaDBRef, where('tags', 'array-contains', statData.vocaBook || '기본교재'));
    const bookSnap = await getDocs(bookQuery);
    const totalWordsInBook = bookSnap.docs.length || 1000;

    const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
    const historySnap = await getDocs(historyRef);
    let masteredCount = 0; let totalAttempts = 0; let totalErrors = 0;
    
    historySnap.forEach(doc => {
        const d = doc.data();
        if (d.status === 'mastered') masteredCount++;
        totalAttempts += (d.consecutiveCorrect || 0) + (d.incorrectCount || 0);
        totalErrors += (d.incorrectCount || 0);
    });

    const vocaProgress = Math.min(100, Math.round((masteredCount / totalWordsInBook) * 100));
    const retentionRate = Math.max(0, Math.round(((totalAttempts - totalErrors) / (totalAttempts || 1)) * 100)); 
    const comprehension = Math.min(100, Math.round((sessionCorrect / sessionTotal) * 100)); 

    // 🚀 모드 전환 로직 (영점 조절 -> 정상화)
    let newStudyMode = statData.studyMode;
    let newCalibrationLeft = statData.calibrationSessionsLeft || 0;
    let rubricStr = "";

    if (newStudyMode === 'calibration') {
        newCalibrationLeft -= 1;
        if (newCalibrationLeft <= 0) {
            newStudyMode = 'progress'; // 10회 끝나면 일반 진도 모드로 정상화
            rubricStr = `[영점 조절 완료] 숨어있던 약점 스캔이 마무리되어, 표준 진도 모드로 전환되었습니다.`;
        } else {
            rubricStr = `[영점 조절 중] 학생의 진짜 빈틈(Z2 구역)을 스캔하며 지옥방으로 분류 중입니다. (남은 횟수: ${newCalibrationLeft}회)`;
        }
    } else {
        if (vocaProgress < 20) {
            rubricStr = `현재 교재에 적응 중입니다. 기초 누적 학습을 진행합니다.`;
        } else if (retentionRate < 60) {
            rubricStr = `기억 버팀도(${retentionRate}%)가 일시적으로 낮아져 [복습 모드]로 궤도를 수정, 오답을 방어합니다.`;
        } else if (comprehension < 70) {
            rubricStr = `스펠링은 외우나 다의어, 문맥 활용(${comprehension}%)에서 약점이 보입니다. 예문 빈칸 훈련을 강화합니다.`;
        } else {
            rubricStr = `장기 기억력(${retentionRate}%)과 뜻 이해도(${comprehension}%) 모두 훌륭합니다. 진도(${vocaProgress}%)를 공격적으로 뺍니다.`;
        }
    }

    await updateDoc(statRef, {
        'radarChart.voca': Math.min(1000, currentVocaScore),
        vocaSession: sessionNumber + 1,
        studyMode: newStudyMode,
        calibrationSessionsLeft: Math.max(0, newCalibrationLeft),
        vocaProgress: vocaProgress,
        vocaComprehension: comprehension,
        vocaRetention: retentionRate,
        vocaRubric: rubricStr,
        updatedAt: serverTimestamp()
    });

    await updateDoc(sessionRef, { status: 'completed', wrongCount: wrongSet.size });
};