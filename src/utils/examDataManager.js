import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';
export const INTEGRATED_COLLECTION = `artifacts/${APP_ID}/public/data/integrated_exams`;

/**
 * [CTO 최적화] 결정적 문서 ID 생성기 (Time Complexity: O(1))
 * 학교, 연도, 학년, 학기, 고사, 과목을 조합하여 절대 중복되지 않는 고유 ID를 만듭니다.
 */
export const generateExamDocId = (examData) => {
    const year = examData.year || '0000';
    const schoolName = (examData.schoolName || examData.school || '').trim();
    const grade = (examData.grade || '1학년').replace(/\s+/g, '');
    const semester = (examData.semester || '1학기').replace(/\s+/g, '');
    const term = (examData.termType || examData.term || '중간고사').replace(/\s+/g, '');
    const subject = (examData.subject || '미정').trim();
    
    return `${year}_${schoolName}_${grade}_${semester}_${term}_${subject}`;
};

/**
 * [CTO 최적화] 데이터 병합 저장 함수 (Upsert 로직)
 * 아카이브와 내신연구소 중 어디서 먼저 등록하든 기존 데이터를 덮어쓰지 않고 병합(Merge)합니다.
 */
export const upsertExamData = async (baseData, updatePayload) => {
    try {
        const docId = generateExamDocId(baseData);
        const docRef = doc(db, INTEGRATED_COLLECTION, docId);

        const finalPayload = {
            ...baseData, 
            ...updatePayload, 
            updatedAt: serverTimestamp()
        };

        // merge: true를 통해 기존 데이터(파일 링크 등)를 보존하며 새로운 분석 데이터를 추가합니다.
        await setDoc(docRef, finalPayload, { merge: true });
        
        return docId;
    } catch (error) {
        console.error("Data Upsert Error:", error);
        throw error;
    }
};