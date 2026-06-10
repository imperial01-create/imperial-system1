import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

// 배열을 무작위로 섞는 유틸리티 함수 (Fisher-Yates Shuffle)
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

/**
 * 🚀 [핵심 엔진] 학생의 맞춤형 40단어 세트 및 50문항 시험지를 생성합니다.
 * @param {string} studentId - 학생 고유 ID
 */
export const generateDailyVocaSet = async (studentId) => {
    try {
        // 1. 학생의 현재 스탯 및 Voca 메타데이터 가져오기
        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
        const statSnap = await getDoc(statRef);
        if (!statSnap.exists()) throw new Error("영어 스탯 데이터가 없습니다. 먼저 초기화해주세요.");
        
        const { vocaSession, vocaBook, radarChart } = statSnap.data();
        const currentScore = radarChart.voca || 0;

        // 2. 학생의 단어 학습 이력(UserWordHistory) 전체 가져오기
        const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${studentId}/word_history`);
        const historySnap = await getDocs(historyRef);
        const userHistory = {};
        historySnap.forEach(doc => { userHistory[doc.id] = doc.data(); });

        // 3. 마스터 DB에서 단어장 데이터 가져오기 (현재 교재 기준)
        const vocaDBRef = collection(db, 'VocabularyDB');
        const bookQuery = query(vocaDBRef, where('tags', 'array-contains', vocaBook));
        const bookSnap = await getDocs(bookQuery);
        const allBookWords = bookSnap.docs.map(d => d.data());

        // ==========================================
        // 🧠 4중 분할 큐(Queue) 추출 로직 시작
        // ==========================================
        let queue1_Urgent = [];  // 긴급 오답 방어 (최대 6개)
        let queue2_Review = [];  // 망각 곡선 복습 (최대 12개)
        let queue3_Passive = []; // 패시브 스캔 (최대 2개)
        let queue4_New = [];     // 신규 진도 (최대 20개 + 부족분 채우기)

        // 이력(History) 데이터를 바탕으로 Q1, Q2 분류
        for (const [wordId, hist] of Object.entries(userHistory)) {
            if (hist.status === 'chronic_error') continue; // 만성 오답은 제외
            if (hist.status === 'mastered') continue;      // 완벽히 외운 단어 제외

            // [Queue 1] 직전 회차(Session - 1)에 틀린 단어
            if (hist.lastIncorrectSession === vocaSession - 1) {
                const wordData = allBookWords.find(w => w.wordId === wordId);
                if (wordData) queue1_Urgent.push(wordData);
            }
            // [Queue 2] 망각 주기가 도래한 복습 단어
            else if (hist.nextReviewSession && hist.nextReviewSession <= vocaSession) {
                const wordData = allBookWords.find(w => w.wordId === wordId);
                if (wordData) queue2_Review.push(wordData);
            }
        }

        // 우선순위 정렬 및 컷오프 (가장 많이 틀렸거나, 가장 오래된 복습 우선)
        queue1_Urgent = queue1_Urgent.slice(0, 6);
        queue2_Review = queue2_Review.slice(0, 12);

        const selectedWordIds = new Set([...queue1_Urgent, ...queue2_Review].map(w => w.wordId));

        // [Queue 3] 패시브 스캔 (기초 구멍 찾기)
        // 현재 스탯보다 150~200점 낮은 단어 중 한 번도 안 본 단어 추출
        const passiveQuery = query(vocaDBRef, 
            where('meanings.0.meaningDifficulty', '>=', Math.max(0, currentScore - 200)),
            where('meanings.0.meaningDifficulty', '<=', Math.max(0, currentScore - 150))
        );
        const passiveSnap = await getDocs(passiveQuery);
        const candidatePassive = passiveSnap.docs.map(d => d.data()).filter(w => !userHistory[w.wordId]);
        queue3_Passive = shuffleArray(candidatePassive).slice(0, 2);
        queue3_Passive.forEach(w => { w.isPassiveScan = true; selectedWordIds.add(w.wordId); });

        // [Queue 4] 신규 진도 (목표 40개를 채우기 위한 백필 - Backfill)
        const currentTotal = queue1_Urgent.length + queue2_Review.length + queue3_Passive.length;
        const requiredNewCount = 40 - currentTotal; // 기본 20개지만, Q1/Q2가 부족하면 더 많이 뽑음

        const candidateNew = allBookWords.filter(w => !userHistory[w.wordId] && !selectedWordIds.has(w.wordId));
        // 단어장 순서대로 신규 단어 추출 (랜덤이 아님)
        queue4_New = candidateNew.slice(0, requiredNewCount);

        // ==========================================
        // 📝 최종 40단어 취합 및 50문항 시험지 생성
        // ==========================================
        const final40Words = [...queue1_Urgent, ...queue2_Review, ...queue3_Passive, ...queue4_New];

        // Part 1: 기초 인출 (1~40번) - 40개 완전히 무작위 셔플
        const part1_Questions = shuffleArray(final40Words).map((word, index) => ({
            questionNumber: index + 1,
            type: 'basic_meaning',
            wordId: word.wordId,
            wordText: word.word,
            answerText: word.meanings.map(m => m.koreanMeaning).join(', ') // 다의어는 콤마로 연결
        }));

        // Part 2: 초개인화 심화 (41~50번) - 40개 중 난이도 점수 상위 10개 추출
        const sortedByDifficulty = [...final40Words].sort((a, b) => 
            (b.meanings[0]?.meaningDifficulty || 0) - (a.meanings[0]?.meaningDifficulty || 0)
        );
        const top10Words = sortedByDifficulty.slice(0, 10);
        
        const part2_Questions = top10Words.map((word, index) => {
            // 파생어(derivatives)나 예문 빈칸(blankSentence) 활용 로직
            const hasBlank = word.meanings[0]?.blankSentence;
            return {
                questionNumber: 41 + index,
                type: hasBlank ? 'blank_inference' : 'advanced_meaning',
                wordId: word.wordId,
                wordText: hasBlank ? word.meanings[0].blankSentence : word.word,
                answerText: hasBlank ? word.word : word.meanings.map(m => m.koreanMeaning).join(', '),
                hint: hasBlank ? word.meanings[0].koreanMeaning : "다의어/파생어 주의"
            };
        });

        const full50Questions = [...part1_Questions, ...part2_Questions];

        // 4. TestSessions 임시 큐(Queue) 테이블에 시험지 얼려두기 (Freeze)
        const testSessionId = `test_${studentId}_s${vocaSession}`;
        const testPayload = {
            testId: testSessionId,
            studentId: studentId,
            sessionNumber: vocaSession,
            wordsForPrint: final40Words, // 숙제 인쇄용 코넬 노트 데이터
            questionsForTest: full50Questions, // 조교 채점 및 시험지 출력용 50문항
            status: 'pending', // 아직 조교가 채점하지 않음
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId), testPayload);

        return testPayload;

    } catch (error) {
        console.error("Voca Set 생성 중 에러 발생:", error);
        throw error;
    }
};