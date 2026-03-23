import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';
export const INTEGRATED_COLLECTION = `artifacts/${APP_ID}/public/data/integrated_exams`;

/**
 * [CTO 최적화] 결정적 문서 ID 생성기 (Time Complexity: O(1))
 * 공백을 완벽히 제거하고 모든 데이터를 강제 문자열로 변환하여 중복 생성을 원천 차단합니다.
 */
export const generateExamDocId = (examData) => {
    const year = String(examData.year || '0000').trim();
    const schoolName = String(examData.schoolName || examData.school || '').replace(/\s+/g, '');
    const grade = String(examData.grade || '1학년').replace(/\s+/g, '');
    const semester = String(examData.semester || '1학기').replace(/\s+/g, '');
    const term = String(examData.termType || examData.term || '중간고사').replace(/\s+/g, '');
    const subject = String(examData.subject || '미정').replace(/\s+/g, '');
    
    return `${year}_${schoolName}_${grade}_${semester}_${term}_${subject}`;
};

/**
 * [CTO 최적화] 데이터 병합 저장 함수 (Upsert 로직)
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

        await setDoc(docRef, finalPayload, { merge: true });
        return docId;
    } catch (error) {
        console.error("Data Upsert Error:", error);
        throw error;
    }
};