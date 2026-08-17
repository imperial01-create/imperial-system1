/**
 * [보안 규칙 자동 테스트]
 *
 * 왜 필요한가
 * -----------
 * 지금까지 규칙을 고칠 때마다 배포한 뒤 화면을 눌러보며 확인했다.
 * 그 방식은 (1) 실제 운영 데이터가 필요하고 (2) 없는 상황은 확인할 수 없다.
 * 실제로 '자녀가 2명인 학부모' 계정이 학원에 없어서 그 경우를 확인하지 못한 채
 * 배포한 규칙이 있다.
 *
 * 이 테스트는 로컬 에뮬레이터에 가짜 학원을 하나 만들어서, 규칙만 진짜로 돌려본다.
 * 운영 데이터는 전혀 건드리지 않는다.
 *
 * 실행 방법
 * ---------
 *   npm run test:rules
 *
 * (자바는 Android Studio 안에 있는 것을 쓴다. 따로 설치할 필요 없다.)
 */

import { readFileSync } from 'fs';
import assert from 'assert';
import {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails,
} from '@firebase/rules-unit-testing';
import {
    doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch,
    orderBy, limit,
} from 'firebase/firestore';

const APP_ID = 'imperial-clinic-v1';
const BASE = `artifacts/${APP_ID}/public/data`;

let env;
const results = [];

/** 로그인한 사용자를 흉내 낸다. 토큰에 들어가는 값이 실제 서비스와 같아야 의미가 있다. */
const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const guest = () => env.unauthenticatedContext().firestore();

const staffToken = (did) => ({ email: `${did}@imperial.com`, role: 'admin', did, approved: true });
const studentToken = (did) => ({ email: `${did}@imperial.com`, role: 'student', did, approved: true });
const parentToken = (did) => ({ email: `${did}@imperial.com`, role: 'parent', did, approved: true });

const check = async (name, fn) => {
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.push({ name, ok: false, error: e.message });
        console.log(`  ✗ ${name}\n      ${String(e.message).split('\n')[0]}`);
    }
};

// ────────────────────────────────────────────────────────────
// 가짜 학원 데이터 (규칙을 우회해 심는다)
// ────────────────────────────────────────────────────────────
const seed = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, `${BASE}/users/teacher1`), { id: 'teacher1', name: '김강사', role: 'lecturer', status: 'active', monthlySalary: 3000000, accountNumber: '123-456', phone: '01011112222' });
        await setDoc(doc(db, `${BASE}/users/stu1`), { id: 'stu1', name: '학생일', role: 'student', status: 'active', phone: '01033334444', attendancePin: '3344' });
        await setDoc(doc(db, `${BASE}/users/stu2`), { id: 'stu2', name: '학생이', role: 'student', status: 'active', phone: '01055556666' });
        await setDoc(doc(db, `${BASE}/users/mom2`), { id: 'mom2', name: '학부모둘', role: 'parent', status: 'active', linkedChildrenIds: ['stu1', 'stu2'] });
        await setDoc(doc(db, `${BASE}/users/pending1`), { id: 'pending1', name: '승인대기', role: 'lecturer', status: 'pending' });

        await setDoc(doc(db, `${BASE}/enrollments/e1`), { studentId: 'stu1', studentName: '학생일', classId: 'c1' });
        await setDoc(doc(db, `${BASE}/enrollments/e2`), { studentId: 'stu2', studentName: '학생이', classId: 'c1' });
        await setDoc(doc(db, `${BASE}/enrollments/e3`), { studentId: 'other', studentName: '남의아이', classId: 'c2' });

        await setDoc(doc(db, `${BASE}/sessions/open1`), { date: '2026-08-10', startTime: '14:00', endTime: '15:00', taId: 'ta1', status: 'open', studentId: '', clinicDetails: '' });
        await setDoc(doc(db, `${BASE}/sessions/mine1`), { date: '2026-08-10', startTime: '15:00', endTime: '16:00', taId: 'ta1', status: 'pending', studentId: 'stu1', clinicDetails: '' });
        await setDoc(doc(db, `${BASE}/sessions/others1`), { date: '2026-08-10', startTime: '16:00', endTime: '17:00', taId: 'ta1', status: 'pending', studentId: 'stu2', clinicDetails: '강사 피드백 원문' });

        await setDoc(doc(db, `${BASE}/clinic_feedbacks/mine1`), { sessionId: 'mine1', studentId: 'stu1', taId: 'ta1', date: '2026-08-10', rating: 5, clinicDetails: '집중력이 좋아졌습니다', nextAction: '워크북 3장' });
        await setDoc(doc(db, `${BASE}/clinic_feedbacks/others1`), { sessionId: 'others1', studentId: 'stu2', taId: 'ta1', date: '2026-08-10', rating: 3, clinicDetails: '남의 아이에 대한 강사 코멘트', nextAction: '보충 필요' });
        await setDoc(doc(db, `${BASE}/student_directory/stu1`), { id: 'stu1', name: '학생일', schoolName: '목동중', grade: '2학년' });
        await setDoc(doc(db, `${BASE}/attendance_logs/a1`), { studentId: 'stu2', status: 'absent', reason: '병결' });
        await setDoc(doc(db, `${BASE}/payrolls/teacher1_2026-07`), { userId: 'teacher1', netSalary: 2800000 });
    });
};

// ────────────────────────────────────────────────────────────
const run = async () => {
    env = await initializeTestEnvironment({
        projectId: 'imperial-rules-test',
        firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    });
    await env.clearFirestore();
    await seed();

    console.log('\n[1] 권한 상승 — 사용자 문서 자기수정');
    await check('학부모가 자녀 목록을 스스로 늘릴 수 없다', () =>
        assertFails(updateDoc(doc(as('mom2', parentToken('mom2')), `${BASE}/users/mom2`), { linkedChildrenIds: ['stu1', 'stu2', 'other'] })));
    await check('교직원이 자기 월급을 올릴 수 없다', () =>
        assertFails(updateDoc(doc(as('teacher1', { email: 'teacher1@imperial.com', role: 'lecturer', did: 'teacher1', approved: true }), `${BASE}/users/teacher1`), { monthlySalary: 9000000 })));
    await check('교직원이 자기 이체 계좌를 바꿀 수 없다', () =>
        assertFails(updateDoc(doc(as('teacher1', { email: 'teacher1@imperial.com', role: 'lecturer', did: 'teacher1', approved: true }), `${BASE}/users/teacher1`), { accountNumber: '999-999' })));
    await check('본인 이름 수정은 여전히 된다', () =>
        assertSucceeds(updateDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/users/stu1`), { name: '학생일(개명)' })));
    await check('관리자는 무엇이든 수정할 수 있다', () =>
        assertSucceeds(updateDoc(doc(as('admin1', staffToken('admin1')), `${BASE}/users/teacher1`), { monthlySalary: 3100000 })));

    console.log('\n[2] 가입 승인 게이트');
    await check('승인 대기(pending) 계정은 교직원 권한이 없다', () =>
        assertFails(getDocs(collection(as('pending1', { email: 'pending1@imperial.com', role: 'lecturer', did: 'pending1', approved: false }), `${BASE}/users`))));
    await check('승인된 교직원은 사용자 목록을 볼 수 있다', () =>
        assertSucceeds(getDocs(collection(as('admin1', staffToken('admin1')), `${BASE}/users`))));

    console.log('\n[3] 대량 조회 차단');
    await check('학생이 사용자 목록 전체를 못 긁는다', () =>
        assertFails(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/users`))));
    await check('학생이 전 원생 출결을 못 긁는다', () =>
        assertFails(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/attendance_logs`))));
    await check('학생이 수강 정보 전체를 못 긁는다', () =>
        assertFails(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/enrollments`))));
    await check('학생이 자기 수강 정보는 조회할 수 있다', () =>
        assertSucceeds(getDocs(query(collection(as('stu1', studentToken('stu1')), `${BASE}/enrollments`), where('studentId', 'in', ['stu1'])))));

    console.log('\n[4] ★ 자녀 2명 학부모 (실계정이 없어 확인 못 했던 경우)');
    await check('자녀 2명을 한 번에 조회할 수 있다', () =>
        assertSucceeds(getDocs(query(collection(as('mom2', parentToken('mom2')), `${BASE}/enrollments`), where('studentId', 'in', ['stu1', 'stu2'])))));
    await check('자녀가 아닌 아이를 섞으면 거부된다', () =>
        assertFails(getDocs(query(collection(as('mom2', parentToken('mom2')), `${BASE}/enrollments`), where('studentId', 'in', ['stu1', 'other'])))));
    await check('두 자녀의 사용자 문서를 각각 볼 수 있다', async () => {
        const db = as('mom2', parentToken('mom2'));
        await assertSucceeds(getDoc(doc(db, `${BASE}/users/stu1`)));
        await assertSucceeds(getDoc(doc(db, `${BASE}/users/stu2`)));
    });
    await check('남의 아이 문서는 볼 수 없다', () =>
        assertFails(getDoc(doc(as('mom2', parentToken('mom2')), `${BASE}/users/teacher1`))));

    console.log('\n[5] 클리닉 예약 쓰기');
    await check('빈 슬롯을 내 이름으로 예약할 수 있다', () =>
        assertSucceeds(updateDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/sessions/open1`), { status: 'pending', studentId: 'stu1', studentName: '학생일', topic: '수학' })));
    await check('남의 예약을 가로챌 수 없다', () =>
        assertFails(updateDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/sessions/others1`), { status: 'pending', studentId: 'stu1', studentName: '학생일' })));
    await check('강사 피드백을 위조할 수 없다', () =>
        assertFails(updateDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/sessions/mine1`), { clinicDetails: '조작된 피드백' })));
    await check('예약 문서를 통째로 백지화할 수 없다', () =>
        assertFails(updateDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/sessions/others1`), { status: 'open', studentId: '', studentName: '', clinicDetails: '' })));
    await check('여러 시간대 동시 신청이 된다 (조회 한도 재발 방지)', async () => {
        const db = as('stu1', studentToken('stu1'));
        const b = writeBatch(db);
        // 실제 예약 코드(submitStudentApplication)가 보내는 것과 같은 payload여야 의미가 있다.
        // 전화번호는 더 이상 저장하지 않는다.
        ['open1', 'mine1'].forEach((id) => b.update(doc(db, `${BASE}/sessions/${id}`), {
            status: 'pending', studentId: 'stu1', studentName: '학생일',
            students: [{ id: 'stu1', name: '학생일' }], topic: '수학', questionRange: '1~10', source: 'app',
        }));
        await assertSucceeds(b.commit());
    });
    await check('학생이 예약 문서에 전화번호를 저장할 수 없다', () =>
        assertFails(updateDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/sessions/open1`), { status: 'pending', studentId: 'stu1', studentName: '학생일', studentPhone: '01033334444' })));
    await check('교직원은 피드백을 쓸 수 있다', () =>
        assertSucceeds(updateDoc(doc(as('admin1', staffToken('admin1')), `${BASE}/sessions/mine1`), { clinicDetails: '오늘 잘했습니다' })));

    console.log('\n[6] 강사 피드백 분리');
    await check('학생이 남의 피드백을 읽을 수 없다', () =>
        assertFails(getDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/clinic_feedbacks/others1`))));
    await check('학생이 피드백을 통째로 긁을 수 없다', () =>
        assertFails(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/clinic_feedbacks`))));
    await check('학생은 자기 피드백은 읽을 수 있다', () =>
        assertSucceeds(getDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/clinic_feedbacks/mine1`))));
    await check('학부모는 자녀 피드백을 조회할 수 있다 (자녀 2명 in 쿼리)', () =>
        assertSucceeds(getDocs(query(collection(as('mom2', parentToken('mom2')), `${BASE}/clinic_feedbacks`), where('studentId', 'in', ['stu1', 'stu2'])))));
    await check('학생이 피드백을 위조할 수 없다', () =>
        assertFails(setDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/clinic_feedbacks/mine1`), { studentId: 'stu1', clinicDetails: '조작' })));
    await check('교직원은 피드백을 작성하고 월 범위로 조회할 수 있다', async () => {
        const db = as('admin1', staffToken('admin1'));
        await assertSucceeds(setDoc(doc(db, `${BASE}/clinic_feedbacks/open1`), { sessionId: 'open1', studentId: 'stu1', date: '2026-08-10', clinicDetails: '작성' }));
        await assertSucceeds(getDocs(query(collection(db, `${BASE}/clinic_feedbacks`), where('date', '>=', '2026-08-01'), where('date', '<=', '2026-08-31'))));
    });

    // 실제 저장 버튼이 하는 것과 똑같은 배치: 예약 update + 피드백 set 을 한 번에
    await check('조교(ta)가 피드백 저장 배치를 커밋할 수 있다', async () => {
        const db = as('ta1', { email: 'ta1@imperial.com', role: 'ta', did: 'ta1', approved: true });
        const b = writeBatch(db);
        ['mine1'].forEach((id) => {
            b.update(doc(db, `${BASE}/sessions/${id}`), { status: 'completed', feedbackStatus: 'submitted' });
            b.set(doc(db, `${BASE}/clinic_feedbacks/${id}`), {
                sessionId: id, studentId: 'stu1', taId: 'ta1', date: '2026-08-10',
                rating: 5, tags: '', clinicDetails: '오늘 잘했습니다', nextAction: '워크북 3장',
            }, { merge: true });
        });
        await assertSucceeds(b.commit());
    });
    await check('강사(lecturer)도 같은 배치를 커밋할 수 있다', async () => {
        const db = as('teacher1', { email: 'teacher1@imperial.com', role: 'lecturer', did: 'teacher1', approved: true });
        const b = writeBatch(db);
        b.update(doc(db, `${BASE}/sessions/others1`), { status: 'completed', feedbackStatus: 'submitted' });
        b.set(doc(db, `${BASE}/clinic_feedbacks/others1`), { sessionId: 'others1', studentId: 'stu2', clinicDetails: 'x' }, { merge: true });
        await assertSucceeds(b.commit());
    });

    console.log('\n[7] 학원 달력');
    await check('학생·학부모도 학원 달력을 읽을 수 있다 (휴원일 판단에 필요)', async () => {
        await assertSucceeds(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/academy_calendar`)));
        await assertSucceeds(getDocs(collection(as('mom2', parentToken('mom2')), `${BASE}/academy_calendar`)));
    });
    await check('학생은 달력을 고칠 수 없다', () =>
        assertFails(setDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/academy_calendar/holiday_20260101`), { type: 'holiday', title: '가짜' })));
    await check('강사(교직원)도 달력을 고칠 수 없다 (데스크 전용)', () =>
        assertFails(setDoc(doc(as('teacher1', { email: 'teacher1@imperial.com', role: 'lecturer', did: 'teacher1', approved: true }), `${BASE}/academy_calendar/x`), { type: 'closure', title: '임의 휴원' })));
    await check('데스크는 휴원일을 등록할 수 있다', () =>
        assertSucceeds(setDoc(doc(as('admin1', staffToken('admin1')), `${BASE}/academy_calendar/closure_1`), { type: 'closure', title: '여름 휴원', startDate: '2026-08-01', endDate: '2026-08-03', isClosed: true, source: 'manual' })));
    await check('비로그인은 달력을 읽을 수 없다', () =>
        assertFails(getDocs(collection(guest(), `${BASE}/academy_calendar`))));

    console.log('\n[8] 급여·게이트웨이·비로그인');
    await check('남의 급여는 못 본다', () =>
        assertFails(getDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/payrolls/teacher1_2026-07`))));
    await check('본인 급여는 볼 수 있다', () =>
        assertSucceeds(getDoc(doc(as('teacher1', { email: 'teacher1@imperial.com', role: 'lecturer', did: 'teacher1', approved: true }), `${BASE}/payrolls/teacher1_2026-07`))));
    const gw = () => as('gw', { email: 'smsgw@imperial.com', role: 'gateway', approved: true });
    await check('폐기된 게이트웨이 계정(admin)은 아무것도 못 본다', () =>
        assertFails(getDocs(collection(as('oldgw', { email: 'admin@imperial.com', role: 'gateway', approved: true }), `${BASE}/student_directory`))));
    await check('게이트웨이는 이제 users 를 읽을 수 없다 (출결PIN·계좌·급여 차단)', () =>
        assertFails(getDocs(collection(gw(), `${BASE}/users`))));
    await check('게이트웨이는 학생 문서 단건도 읽을 수 없다', () =>
        assertFails(getDoc(doc(gw(), `${BASE}/users/stu1`))));
    await check('게이트웨이는 학생 명부(이름·학교·학년)는 읽을 수 있다', () =>
        assertSucceeds(getDocs(collection(gw(), `${BASE}/student_directory`))));
    await check('게이트웨이는 상담 원본을 등록할 수 있다', () =>
        assertSucceeds(setDoc(doc(gw(), `${BASE}/raw_call_logs/log1`), { studentId: 'stu1', studentName: '학생일', rawText: '통화 요약', source: 's25_integrated_app', status: 'pending_ai_parsing' })));
    await check('학생은 학생 명부를 읽을 수 없다', () =>
        assertFails(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/student_directory`))));
    await check('학생 명부는 아무도 쓸 수 없다 (서버 전용)', () =>
        assertFails(setDoc(doc(as('admin1', staffToken('admin1')), `${BASE}/student_directory/stu1`), { name: '위조' })));
    await check('비로그인은 사용자 문서를 못 본다', () =>
        assertFails(getDoc(doc(guest(), `${BASE}/users/stu1`))));
    await check('비로그인도 학교 목록은 볼 수 있다 (가입 화면용)', () =>
        assertSucceeds(getDoc(doc(guest(), `${BASE}/settings/schools`))));

    // ── 시험 진단(원점수) ────────────────────────────────────
    // 점수는 원점수다. 만점이 100 이 아닌 시험이 있으므로 상한은 maxScore 다.
    const diag = (over) => ({
        testCategory: 'concept', studentId: 'stu1', studentName: '학생일',
        score: 64, maxScore: 80, ...over,
    });
    const putDiag = (who, id, over) =>
        setDoc(doc(who, `${BASE}/student_exam_diagnostics/${id}`), diag(over));

    await check('만점 80점 시험에 64점을 저장할 수 있다', () =>
        assertSucceeds(putDiag(as('admin1', staffToken('admin1')), 'd1')));
    await check('만점 120점 시험에 110점을 저장할 수 있다 (예전엔 100점 상한에 막혔다)', () =>
        assertSucceeds(putDiag(as('admin1', staffToken('admin1')), 'd2', { score: 110, maxScore: 120 })));
    await check('만점을 넘는 점수는 거부된다', () =>
        assertFails(putDiag(as('admin1', staffToken('admin1')), 'd3', { score: 81, maxScore: 80 })));
    await check('음수 점수는 거부된다', () =>
        assertFails(putDiag(as('admin1', staffToken('admin1')), 'd4', { score: -1 })));
    await check('점수가 문자열이면 거부된다', () =>
        assertFails(putDiag(as('admin1', staffToken('admin1')), 'd5', { score: '64' })));
    await check('maxScore 가 없는 옛 형식은 100 을 만점으로 본다 (100점 통과)', () =>
        assertSucceeds(setDoc(doc(as('admin1', staffToken('admin1')), `${BASE}/student_exam_diagnostics/d6`),
            { testCategory: 'school', studentId: 'stu1', studentName: '학생일', score: 100 })));
    await check('maxScore 가 없는데 100점을 넘으면 거부된다', () =>
        assertFails(setDoc(doc(as('admin1', staffToken('admin1')), `${BASE}/student_exam_diagnostics/d7`),
            { testCategory: 'school', studentId: 'stu1', studentName: '학생일', score: 101 })));
    await check('만점을 1000점 넘게 부풀릴 수 없다', () =>
        assertFails(putDiag(as('admin1', staffToken('admin1')), 'd8', { score: 5000, maxScore: 5000 })));
    await check('조교(ta)도 채점 결과를 저장할 수 있다', () =>
        assertSucceeds(putDiag(as('ta1', { ...staffToken('ta1'), role: 'ta' }), 'd9')));
    await check('학생은 자기 점수를 위조할 수 없다', () =>
        assertFails(putDiag(as('stu1', studentToken('stu1')), 'd10')));
    await check('학생은 자기 진단 결과를 읽을 수 있다', () =>
        assertSucceeds(getDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/student_exam_diagnostics/d1`))));
    await check('학생은 남의 진단 결과를 읽을 수 없다', () =>
        assertFails(getDoc(doc(as('stu2', studentToken('stu2')), `${BASE}/student_exam_diagnostics/d1`))));

    // ── 진단 기록 수정·삭제 (기록 관리 화면) ─────────────────
    const lecturerToken = (did) => ({ ...staffToken(did), role: 'lecturer' });
    const taToken = (did) => ({ ...staffToken(did), role: 'ta' });
    const asstToken = (did) => ({ ...staffToken(did), role: 'admin_assistant' });
    const diagDoc = (who, id) => doc(who, `${BASE}/student_exam_diagnostics/${id}`);

    await check('교직원은 기록 목록을 최신순으로 조회할 수 있다', () =>
        assertSucceeds(getDocs(query(
            collection(as('admin1', staffToken('admin1')), `${BASE}/student_exam_diagnostics`),
            orderBy('createdAt', 'desc'), limit(50)))));
    await check('학생은 기록 전체를 긁을 수 없다', () =>
        assertFails(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/student_exam_diagnostics`))));

    await check('교직원은 저장된 점수를 고칠 수 있다', () =>
        assertSucceeds(updateDoc(diagDoc(as('admin1', staffToken('admin1')), 'd1'), { score: 70 })));
    await check('조교도 점수를 고칠 수 있다', () =>
        assertSucceeds(updateDoc(diagDoc(as('ta1', taToken('ta1')), 'd1'), { score: 60 })));
    await check('고칠 때도 만점(80)을 넘으면 거부된다', () =>
        assertFails(updateDoc(diagDoc(as('admin1', staffToken('admin1')), 'd1'), { score: 81 })));
    await check('옛 기록을 고치며 만점을 함께 넣으면 통과한다', () =>
        assertSucceeds(updateDoc(diagDoc(as('admin1', staffToken('admin1')), 'd6'), { score: 64, maxScore: 80, schemaVersion: 2 })));
    await check('학생은 자기 점수를 고칠 수 없다', () =>
        assertFails(updateDoc(diagDoc(as('stu1', studentToken('stu1')), 'd1'), { score: 100 })));

    await check('조교는 기록을 지울 수 없다', () =>
        assertFails(deleteDoc(diagDoc(as('ta1', taToken('ta1')), 'd9'))));
    await check('데스크는 기록을 지울 수 없다', () =>
        assertFails(deleteDoc(diagDoc(as('desk1', asstToken('desk1')), 'd9'))));
    await check('학생은 기록을 지울 수 없다', () =>
        assertFails(deleteDoc(diagDoc(as('stu1', studentToken('stu1')), 'd1'))));
    await check('강사는 기록을 지울 수 있다', () =>
        assertSucceeds(deleteDoc(diagDoc(as('lec1', lecturerToken('lec1')), 'd9'))));
    await check('원장은 기록을 지울 수 있다', () =>
        assertSucceeds(deleteDoc(diagDoc(as('admin1', staffToken('admin1')), 'd2'))));

    // 전체 삭제는 개념테스트 지표(concept_stats)까지 함께 비운다.
    const statDoc = (who, id) => doc(who, `${BASE}/concept_stats/${id}`);
    await check('교직원은 개념테스트 지표를 쓸 수 있다', () =>
        assertSucceeds(setDoc(statDoc(as('admin1', staffToken('admin1')), 'stu1'), { subjectStats: { 수학: { latestScore: 64 } } })));
    await check('지표를 subjectStats 없이 쓸 수 없다', () =>
        assertFails(setDoc(statDoc(as('admin1', staffToken('admin1')), 'stu2'), { foo: 1 })));
    await check('강사는 지표를 지울 수 없다', () =>
        assertFails(deleteDoc(statDoc(as('lec1', lecturerToken('lec1')), 'stu1'))));
    await check('조교는 지표를 지울 수 없다', () =>
        assertFails(deleteDoc(statDoc(as('ta1', taToken('ta1')), 'stu1'))));
    await check('원장은 지표를 지울 수 있다 (전체 삭제에 필요)', () =>
        assertSucceeds(deleteDoc(statDoc(as('admin1', staffToken('admin1')), 'stu1'))));

    /* 학생·학부모 화면('나의 시험 결과')이 실제로 쓰는 조회 방식.
       이름이 아니라 studentId 로 좁힌다. 색인이 필요 없도록 orderBy 는 걸지 않는다. */
    const myDiags = (who, sid) => getDocs(query(
        collection(who, `${BASE}/student_exam_diagnostics`), where('studentId', '==', sid)));

    await check('학생은 studentId 로 자기 성적 목록을 조회할 수 있다', () =>
        assertSucceeds(myDiags(as('stu1', studentToken('stu1')), 'stu1')));
    await check('학생이 남의 studentId 로 조회하면 막힌다', () =>
        assertFails(myDiags(as('stu1', studentToken('stu1')), 'stu2')));
    await check('학부모는 자녀 studentId 로 조회할 수 있다', () =>
        assertSucceeds(myDiags(as('mom2', parentToken('mom2')), 'stu1')));
    await check('학부모가 자녀가 아닌 학생으로 조회하면 막힌다', () =>
        assertFails(myDiags(as('mom2', parentToken('mom2')), 'other')));
    await check('학생이 조건 없이 전체를 긁으면 막힌다', () =>
        assertFails(getDocs(collection(as('stu1', studentToken('stu1')), `${BASE}/student_exam_diagnostics`))));

    /* 내신 연구소(SchoolStrategy)는 학생·학부모에게도 자기 학교 리포트를 보여준다.
       목록 조회가 필요하지만 통째로 긁어 가지는 못하게 개수 상한을 요구한다. */
    const examsCol = (who) => collection(who, `${BASE}/integrated_exams`);
    await check('교직원은 시험 마스터를 제한 없이 조회할 수 있다', () =>
        assertSucceeds(getDocs(examsCol(as('admin1', staffToken('admin1'))))));
    await check('학생은 개수를 제한하면 시험 마스터를 조회할 수 있다', () =>
        assertSucceeds(getDocs(query(examsCol(as('stu1', studentToken('stu1'))), limit(300)))));
    await check('학부모도 개수를 제한하면 조회할 수 있다', () =>
        assertSucceeds(getDocs(query(examsCol(as('mom2', parentToken('mom2'))), limit(300)))));
    await check('학생이 상한을 넘겨 조회하면 막힌다', () =>
        assertFails(getDocs(query(examsCol(as('stu1', studentToken('stu1'))), limit(301)))));
    await check('학생이 제한 없이 통째로 긁으면 막힌다', () =>
        assertFails(getDocs(examsCol(as('stu1', studentToken('stu1'))))));
    await check('비로그인은 개수를 제한해도 막힌다', () =>
        assertFails(getDocs(query(examsCol(guest()), limit(10)))));

    /* 시험을 지우면 그 시험을 본 학생의 등급컷·예측등급까지 사라진다.
       화면은 관리자·행정조교에게만 삭제 버튼을 보여주므로, 규칙도 같은 범위여야 한다.
       (버튼을 숨기는 것만으로는 서버에 직접 보내는 요청을 막지 못한다) */
    const examDoc = (who, id) => doc(who, `${BASE}/integrated_exams/${id}`);

    /* 영단어 능력치(catScore)는 학부모 화면에 '어휘력 n/1000' 으로 표시된다.
       예전에는 학생이 문서 전체를 쓸 수 있어 자기 능력치를 직접 고칠 수 있었다.
       학생이 실제로 필요한 쓰기(단어 세트 뽑기)는 살아 있어야 한다. */
    const engDoc = (who, sid) => doc(who, `${BASE}/english_stats/${sid}`);

    await check('학생은 자기 어휘력 점수(catScore)를 바꿀 수 없다', async () => {
        await setDoc(engDoc(as('admin1', staffToken('admin1')), 'stu1'), { catScore: 300, seenWordIds: [] });
        await assertFails(updateDoc(engDoc(as('stu1', studentToken('stu1')), 'stu1'), { catScore: 999 }));
    });
    await check('학생은 단어 학습 진행은 쓸 수 있다 (보카 기능 유지)', () =>
        assertSucceeds(updateDoc(engDoc(as('stu1', studentToken('stu1')), 'stu1'),
            { adaptivePreset: '밸런스 모드', lastNewWordDifficulty: 3 })));
    await check('학생이 허용 필드에 catScore 를 섞어도 막힌다', () =>
        assertFails(updateDoc(engDoc(as('stu1', studentToken('stu1')), 'stu1'),
            { adaptivePreset: '밸런스 모드', catScore: 999 })));
    await check('학생은 남의 어휘력 문서를 쓸 수 없다', () =>
        assertFails(updateDoc(engDoc(as('stu1', studentToken('stu1')), 'stu2'), { adaptivePreset: 'x' })));
    await check('학생은 어휘력 문서를 새로 만들 수 없다', () =>
        assertFails(setDoc(engDoc(as('stu1', studentToken('stu1')), 'stu1_new'), { catScore: 999 })));
    await check('조교는 어휘력 점수를 쓸 수 있다', () =>
        assertSucceeds(updateDoc(engDoc(as('ta1', taToken('ta1')), 'stu1'), { catScore: 640 })));
    await check('학생은 단어 학습 이력을 직접 쓸 수 없다', () =>
        assertFails(setDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/english_stats/stu1/word_history/w1`), { status: 'mastered' })));
    await check('학부모는 자녀 어휘력을 읽을 수 있다', () =>
        assertSucceeds(getDoc(engDoc(as('mom2', parentToken('mom2')), 'stu1'))));

    /* 순위표는 읽기가 전교생 실명이다. 남의 문서 번호를 알면 점수를 바꿀 수 있었다. */
    const rankDoc = (who, id) => doc(who, `${BASE}/voca_rankings/${id}`);

    await check('학생은 자기 순위 기록을 만들 수 있다', () =>
        assertSucceeds(setDoc(rankDoc(as('stu1', studentToken('stu1')), 'r_stu1'),
            { studentId: 'stu1', studentName: '학생일', score: 120 })));
    await check('학생은 남의 이름으로 순위를 만들 수 없다', () =>
        assertFails(setDoc(rankDoc(as('stu1', studentToken('stu1')), 'r_fake'),
            { studentId: 'stu2', studentName: '학생이', score: 999 })));
    await check('학생은 남의 순위 기록을 고칠 수 없다', async () => {
        await setDoc(rankDoc(as('admin1', staffToken('admin1')), 'r_stu2'), { studentId: 'stu2', studentName: '학생이', score: 50 });
        await assertFails(updateDoc(rankDoc(as('stu1', studentToken('stu1')), 'r_stu2'), { score: 1 }));
    });
    await check('학생은 자기 순위 기록의 주인을 바꿀 수 없다', () =>
        assertFails(updateDoc(rankDoc(as('stu1', studentToken('stu1')), 'r_stu1'), { studentId: 'stu2' })));
    await check('학생은 순위 기록을 지울 수 없다', () =>
        assertFails(deleteDoc(rankDoc(as('stu1', studentToken('stu1')), 'r_stu1'))));

    await check('강사는 시험을 등록·수정할 수 있다', () =>
        assertSucceeds(setDoc(examDoc(as('teacher1', lecturerToken('teacher1')), 'exam_del_1'), { schoolName: '목동중', year: '2026' })));
    await check('강사는 시험을 삭제할 수 없다', () =>
        assertFails(deleteDoc(examDoc(as('teacher1', lecturerToken('teacher1')), 'exam_del_1'))));
    await check('수업조교는 시험을 삭제할 수 없다', () =>
        assertFails(deleteDoc(examDoc(as('ta1', taToken('ta1')), 'exam_del_1'))));
    await check('학생은 시험을 삭제할 수 없다', () =>
        assertFails(deleteDoc(examDoc(as('stu1', studentToken('stu1')), 'exam_del_1'))));
    await check('행정조교는 시험을 삭제할 수 있다', () =>
        assertSucceeds(deleteDoc(examDoc(as('asst1', asstToken('asst1')), 'exam_del_1'))));
    await check('관리자는 시험을 삭제할 수 있다', async () => {
        await setDoc(examDoc(as('admin1', staffToken('admin1')), 'exam_del_2'), { schoolName: '목동고', year: '2026' });
        await assertSucceeds(deleteDoc(examDoc(as('admin1', staffToken('admin1')), 'exam_del_2')));
    });

    /* 동결한 저장 형식(v2) 전체가 규칙을 통과하는지.
       필드를 늘렸을 때 규칙이 막지 않는지 확인하는 것이 목적이다. */
    const frozenPayload = {
        schemaVersion: 2, testCategory: 'school',
        examDocId: '2026_목동고_2학년_1학기_중간고사_수학',
        examTitle: '목동고 내신 진단', unitName: '학교 내신 기출', subject: '수학',
        studentId: 'stu1', studentName: '학생일',
        batchId: 'batch_abc', classId: 'c1', className: '고2 심화', season: 'summer2026',
        gradedBy: 'ta1', score: 64, maxScore: 80,
        questionCount: 2, questionSignature: 'nkkv6i',
        responses: [
            { no: '1', qIndex: 0, points: 4, unitRaw: '이차함수', verdict: 'correct', errorType: null },
            { no: '2', qIndex: 1, points: 4, unitRaw: '이차함수', verdict: 'wrong', errorType: 'calc' }
        ],
        wrongQuestionNumbers: ['2'], instructorComment: '', growthPlan: '', instructorId: 'ta1'
    };
    await check('동결한 저장 형식 전체가 규칙을 통과한다', () =>
        assertSucceeds(setDoc(diagDoc(as('ta1', taToken('ta1')), 'frozen1'), frozenPayload)));
    await check('오답 원인만 나중에 채워 넣을 수 있다', () =>
        assertSucceeds(updateDoc(diagDoc(as('ta1', taToken('ta1')), 'frozen1'), {
            responses: [
                { no: '1', qIndex: 0, points: 4, unitRaw: '이차함수', verdict: 'correct', errorType: null },
                { no: '2', qIndex: 1, points: 4, unitRaw: '이차함수', verdict: 'wrong', errorType: 'time' }
            ]
        })));
    await check('학생은 오답 원인을 고칠 수 없다', () =>
        assertFails(updateDoc(diagDoc(as('stu1', studentToken('stu1')), 'frozen1'), { responses: [] })));

    await env.cleanup();

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`총 ${results.length}건 중 ${results.length - failed.length}건 통과, ${failed.length}건 실패`);
    if (failed.length) {
        console.log('\n실패 항목:');
        failed.forEach((f) => console.log(`  ✗ ${f.name}`));
    }
    process.exit(failed.length ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
