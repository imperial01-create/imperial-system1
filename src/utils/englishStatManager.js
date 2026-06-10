import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

/**
 * 학생의 영어 종합 스탯(english_stats) 문서를 조회하고, 
 * 만약 없다면 기본값(0점)으로 초기화하여 생성해 줍니다.
 */
export const initializeEnglishStats = async (studentId) => {
    if (!studentId) return null;

    const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
    const statSnap = await getDoc(statRef);

    if (statSnap.exists()) {
        return statSnap.data(); // 이미 스탯창이 있다면 그대로 반환
    }

    // 🚀 처음 영어를 듣는 학생을 위한 '기본 스탯창' 생성
    const initialPayload = {
        studentId: studentId,
        // 원장님이 기획하신 5대 핵심 지표 (초기값 0점)
        radarChart: {
            voca: 0,      // 어휘력
            syntax: 0,    // 문장 해석력
            theme: 0,     // 언어적 능력 (주제 파악)
            logic: 0,     // 논리 추론력
            detail: 0     // 정보 파악력
        },
        grammarTree: {},  // 문법 스킬 트리 해금 데이터 보관소
        typeHeatmap: {},  // 모의고사 유형별 정답률 보관소
        
        // Voca 시스템 작동을 위한 제어 변수
        vocaSession: 1,                 // 현재 단어 시험 회차
        vocaBook: "능률VOCA수능필수", // 현재 배정된 기본 단어장
        updatedAt: serverTimestamp()
    };

    await setDoc(statRef, initialPayload);
    return initialPayload;
};