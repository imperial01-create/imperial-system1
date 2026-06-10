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

/**
 * 🚀 [업그레이드 엔진] 3대 프리셋 모드를 반영하여 초개인화 단어 세트를 빌드합니다.
 */
export const generateDailyVocaSet = async (studentId) => {
    try {
        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
        const statSnap = await getDoc(statRef);
        if (!statSnap.exists()) throw new Error("영어 스탯 데이터가 없습니다. 먼저 초기화해주세요.");
        
        const { vocaSession, vocaBook, radarChart, studyMode = 'progress' } = statSnap.data();
        const currentScore = radarChart.voca || 0;

        // 1. 프리셋 모드별 40단어 분할 수량 정의 (원장님 기획 매트릭스 백필 반영)
        let maxNew = 24, maxReview = 12, maxPassive = 4; // 기본 [진도 모드]
        
        if (studyMode === 'basic') {       // [기초 모드]
            maxNew = 12; maxReview = 16; maxPassive = 12;
        } else if (studyMode === 'review') { // [복습 모드]
            maxNew = 0; maxReview = 32; maxPassive = 8;
        }

        const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
        const historySnap = await getDocs(historyRef);
        const userHistory = {};
        historySnap.forEach(doc => { userHistory[doc.id] = doc.data(); });

        const vocaDBRef = collection(db, 'VocabularyDB');
        const bookQuery = query(vocaDBRef, where('tags', 'array-contains', vocaBook));
        const bookSnap = await getDocs(bookQuery);
        const allBookWords = bookSnap.docs.map(d => d.data());

        let queue1_Urgent = [];
        let queue2_Review = [];
        let queue3_Passive = [];
        let queue4_New = [];

        // 2. 역사 데이터 기반 오답(Q1) 및 SRS복습(Q2) 추출
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

        // 복습 총 할당량(maxReview) 내에서 긴급오답을 최우선 채움
        let combinedReview = [...shuffleArray(queue1_Urgent), ...shuffleArray(queue2_Review)];
        combinedReview = combinedReview.slice(0, maxReview);
        const selectedWordIds = new Set(combinedReview.map(w => w.wordId));

        // 3. [Queue 3] 패시브 스캔 추출 (현 점수대 -150 ~ -200점의 공백 탐색)
        const passiveQuery = query(vocaDBRef, 
            where('meanings.0.meaningDifficulty', '>=', Math.max(0, currentScore - 200)),
            where('meanings.0.meaningDifficulty', '<=', Math.max(0, currentScore - 150))
        );
        const passiveSnap = await getDocs(passiveQuery);
        const candidatePassive = passiveSnap.docs.map(d => d.data()).filter(w => !userHistory[w.wordId]);
        queue3_Passive = shuffleArray(candidatePassive).slice(0, maxPassive);
        queue3_Passive.forEach(w => { w.isPassiveScan = true; selectedWordIds.add(w.wordId); });

        // 4. [Queue 4] 신규 진도 및 남은 빈자리 강제 백필(Backfill)
        const currentTotal = combinedReview.length + queue3_Passive.length;
        const requiredNewCount = 40 - currentTotal; // 모드별 부족분 자동 흡수

        const candidateNew = allBookWords.filter(w => !userHistory[w.wordId] && !selectedWordIds.has(w.wordId));
        queue4_New = candidateNew.slice(0, Math.max(0, requiredNewCount));

        const final40Words = [...combinedReview, ...queue3_Passive, ...queue4_New];

        // 5. 50문항 시험지 포장 및 임시 홀딩
        const part1_Questions = shuffleArray(final40Words).map((word, index) => ({
            questionNumber: index + 1,
            type: 'basic_meaning',
            wordId: word.wordId,
            wordText: word.word,
            isPassiveScan: word.isPassiveScan || false, // 소멸 조건 판정용 마크 주입
            answerText: word.meanings.map(m => m.koreanMeaning).join(', ')
        }));

        const sortedByDifficulty = [...final40Words].sort((a, b) => (b.meanings[0]?.meaningDifficulty || 0) - (a.meanings[0]?.meaningDifficulty || 0));
        const part2_Questions = sortedByDifficulty.slice(0, 10).map((word, index) => ({
            questionNumber: 41 + index,
            type: word.meanings[0]?.blankSentence ? 'blank_inference' : 'advanced_meaning',
            wordId: word.wordId,
            wordText: word.meanings[0]?.blankSentence || word.word,
            isPassiveScan: word.isPassiveScan || false,
            answerText: word.meanings[0]?.blankSentence ? word.word : word.meanings.map(m => m.koreanMeaning).join(', ')
        }));

        const testSessionId = `test_${studentId}_s${vocaSession}`;
        const testPayload = {
            testId: testSessionId, studentId, sessionNumber: vocaSession, studyMode,
            wordsForPrint: final40Words, questionsForTest: [...part1_Questions, ...part2_Questions],
            status: 'pending', createdAt: serverTimestamp()
        };

        await setDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId), testPayload);
        return testPayload;
    } catch (error) { console.error(error); throw error; }
};

/**
 * 🚀 [소멸 알고리즘 포함 정산] 조교 채점 완료 시 Elo 점수를 정산하고 패시브 단어를 영구 격리합니다.
 */
export const processVocaTestResult = async (studentId, sessionNumber, wrongAnswerNumbers) => {
    const testSessionId = `test_${studentId}_s${sessionNumber}`;
    const sessionRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const { questionsForTest } = sessionSnap.data();
    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);
    const { radarChart } = statSnap.data();
    
    let currentVocaScore = radarChart.voca || 0;
    const wrongSet = new Set(wrongAnswerNumbers);

    // 문항별 루프 돌며 역사기록(History) 및 Elo 점수 실시간 연산
    for (const q of questionsForTest) {
        const isCorrect = !wrongSet.has(q.questionNumber);
        const historyWordRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`, q.wordId);
        const histSnap = await getDoc(historyWordRef);
        const hist = histSnap.exists() ? histSnap.data() : { consecutiveCorrect: 0, incorrectCount: 0 };

        if (isCorrect) {
            // 🔥 [원장님 핵심 요구사항] 패시브 스캔 단어는 1회 정답 시 무조건 'mastered' 상태로 영구 소멸 제거
            if (q.isPassiveScan) {
                await setDoc(historyWordRef, { status: 'mastered', updatedAt: serverTimestamp() }, { merge: true });
            } else {
                const newConsecutive = (hist.consecutiveCorrect || 0) + 1;
                const nextReview = sessionNumber + (newConsecutive === 1 ? 1 : newConsecutive === 2 ? 3 : 6);
                await setDoc(historyWordRef, {
                    consecutiveCorrect: newConsecutive,
                    nextReviewSession: nextReview,
                    status: newConsecutive >= 4 ? 'mastered' : 'learning',
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
            currentVocaScore += 3; // 정답 가중치
        } else {
            // 오답 처리
            await setDoc(historyWordRef, {
                consecutiveCorrect: 0,
                incorrectCount: (hist.incorrectCount || 0) + 1,
                lastIncorrectSession: sessionNumber,
                status: (hist.incorrectCount || 0) + 1 >= 3 ? 'chronic_error' : 'learning',
                updatedAt: serverTimestamp()
            }, { merge: true });
            currentVocaScore = Math.max(0, currentVocaScore - 2); // 오답 감점
        }
    }

    // 학생 메인 영어 문서 스탯 최종 증폭 업데이트 및 다음 세션 개방
    await updateDoc(statRef, {
        'radarChart.voca': Math.min(1000, currentVocaScore),
        vocaSession: sessionNumber + 1,
        updatedAt: serverTimestamp()
    });

    await updateDoc(sessionRef, { status: 'completed', wrongCount: wrongSet.size });
};