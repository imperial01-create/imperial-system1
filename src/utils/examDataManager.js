import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';
export const INTEGRATED_COLLECTION = `artifacts/${APP_ID}/public/data/integrated_exams`;

/**
 * 🚀 [CTO 패치] 찌꺼기 데이터 딥 클렌징 (Undefined 크래시 원천 차단)
 */
const removeUndefined = (obj) => {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj.constructor && obj.constructor.name === 'FieldValue') return obj;
    if (Array.isArray(obj)) return obj.map(removeUndefined);
    const res = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) res[key] = removeUndefined(obj[key]);
    });
    return res;
};

/**
 * 🚀 [CTO 패치] 결정적 문서 ID 생성기 (특수기호 '/' 크래시 완벽 방어)
 */
export const generateExamDocId = (examData) => {
    // 슬래시(/), 백슬래시(\), 마침표(.), 공백을 모두 언더바(_)로 강제 치환
    const safe = (str) => String(str || '').replace(/[\/\\.\s]+/g, '_');
    
    const year = safe(examData.year || '0000');
    const schoolName = safe(examData.schoolName || examData.school || '');
    const grade = safe(examData.grade || '1학년');
    const semester = safe(examData.semester || '1학기');
    const term = safe(examData.termType || examData.term || '중간고사');
    const subject = safe(examData.subject || '미정');
    
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
            ...removeUndefined(baseData), 
            ...removeUndefined(updatePayload), 
            updatedAt: serverTimestamp()
        };

        await setDoc(docRef, finalPayload, { merge: true });
        return docId;
    } catch (error) {
        console.error("Data Upsert Error:", error);
        throw error;
    }
};