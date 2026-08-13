/* [src/utils/examFileSlots.js]
   기출 시험 문서 안의 '자료 4칸'을 다루는 유일한 경계입니다.

   [왜 한 곳에 모으는가]
   시험 문서 하나에는 학생풀이·시험지·빠른답지·해설 4칸이 있고,
   한 시험을 여러 명이 나눠 맡습니다.
   예전에는 저장할 때마다 files 전체를 다시 썼는데, 그 files 는
   '검색을 눌렀던 시점'의 낡은 사본이라 그 사이 다른 사람이 잡은 칸이 통째로 지워졌습니다.
   여기 있는 함수들은 전부 'files.해설.status' 처럼 칸 하나만 지정해 씁니다.

   기출 아카이브(검색)와 업무 현황판이 같은 함수를 쓰므로, 두 화면의 규칙이 어긋날 수 없습니다.
*/

import { doc, updateDoc, runTransaction, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { INTEGRATED_COLLECTION } from './examDataManager';

/* 자료 4종. 표시 순서도 이 순서를 따릅니다. */
export const FILE_SLOTS = [
    { key: 'studentWork', label: '학생풀이(원본)', short: '학생풀이' },
    { key: 'examPaper',   label: '시험지',        short: '시험지' },
    { key: 'quickAnswer', label: '빠른답지',      short: '빠른답지' },
    { key: 'solution',    label: '해설',          short: '해설' }
];

export const SLOT_KEYS = FILE_SLOTS.map(s => s.key);
export const slotLabel = (key) => FILE_SLOTS.find(s => s.key === key)?.label || key;

/* 'files.해설.status' 를 만듭니다. field 를 생략하면 칸 전체를 가리킵니다. */
export const slotPath = (fileKey, field) => `files.${fileKey}${field ? '.' + field : ''}`;

/* 며칠째 잡고 있는지 계산합니다.
   서버 타임스탬프(저장된 값)와 방금 만든 Date(화면에서 낙관적으로 반영한 값)를 함께 받습니다. */
export const toDateSafe = (v) => {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    return null;
};

export const daysSince = (v) => {
    const d = toDateSafe(v);
    return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null;
};

/* 며칠 이상 잡혀 있으면 '묶였다'고 볼지. 화면 색과 현황판 집계가 같은 기준을 씁니다. */
export const STALE_DAYS = 3;
export const isStaleSlot = (slot) => {
    if (!slot || slot.status !== 'working') return false;
    const d = daysSince(slot.claimedAt);
    return d !== null && d >= STALE_DAYS;
};

const examRef = (examId) => doc(db, INTEGRATED_COLLECTION, examId);

/* 작업 선점. 두 명이 동시에 눌러도 한 명만 잡도록 트랜잭션으로 확인 후 씁니다. */
export const claimSlot = async (examId, fileKey, user) => {
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(examRef(examId));
        if (!snap.exists()) throw new Error("문서를 찾을 수 없습니다.");

        const slot = (snap.data().files || {})[fileKey] || { status: 'open' };
        if (slot.status !== 'open') {
            throw new Error(`이미 ${slot.workerName || '다른 사람'}님이 작업 중이거나 완료된 건입니다.`);
        }

        tx.update(examRef(examId), {
            [slotPath(fileKey, 'status')]: 'working',
            [slotPath(fileKey, 'workerId')]: user.id,
            [slotPath(fileKey, 'workerName')]: user.name,
            // 언제 잡았는지 남겨야 '며칠째 묶여 있는지'를 알 수 있습니다.
            [slotPath(fileKey, 'claimedAt')]: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });
    return { status: 'working', workerId: user.id, workerName: user.name, claimedAt: new Date() };
};

/* 작업 해제(취소). 담당자 정보를 지우고 미등록으로 되돌립니다. */
export const releaseSlot = async (examId, fileKey, { clearUrl = false } = {}) => {
    const payload = {
        [slotPath(fileKey, 'status')]: 'open',
        [slotPath(fileKey, 'workerId')]: deleteField(),
        [slotPath(fileKey, 'workerName')]: deleteField(),
        [slotPath(fileKey, 'claimedAt')]: deleteField(),
        updatedAt: serverTimestamp()
    };
    if (clearUrl) payload[slotPath(fileKey, 'url')] = deleteField();

    await updateDoc(examRef(examId), payload);
    return { removed: ['workerId', 'workerName', 'claimedAt', ...(clearUrl ? ['url'] : [])], changes: { status: 'open' } };
};

/* 링크 등록 → 검수 대기로 넘김 */
export const submitSlotLink = async (examId, fileKey, url) => {
    const clean = String(url || '').trim();
    await updateDoc(examRef(examId), {
        [slotPath(fileKey, 'status')]: 'pending',
        [slotPath(fileKey, 'url')]: clean,
        updatedAt: serverTimestamp()
    });
    return { status: 'pending', url: clean };
};

/* 이미 공개된 자료의 링크만 교체 */
export const updateSlotLink = async (examId, fileKey, url) => {
    const clean = String(url || '').trim();
    await updateDoc(examRef(examId), {
        [slotPath(fileKey, 'url')]: clean,
        updatedAt: serverTimestamp()
    });
    return { url: clean };
};

/* 관리자 승인 → 교직원에게 공개 */
export const publishSlot = async (examId, fileKey) => {
    await updateDoc(examRef(examId), {
        [slotPath(fileKey, 'status')]: 'published',
        updatedAt: serverTimestamp()
    });
    return { status: 'published' };
};
