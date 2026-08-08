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
    doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, writeBatch,
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
        ['open1', 'mine1'].forEach((id) => b.update(doc(db, `${BASE}/sessions/${id}`), {
            status: 'pending', studentId: 'stu1', studentName: '학생일', studentPhone: '01033334444',
            students: [{ id: 'stu1', name: '학생일' }], topic: '수학', questionRange: '1~10', source: 'app',
        }));
        await assertSucceeds(b.commit());
    });
    await check('교직원은 피드백을 쓸 수 있다', () =>
        assertSucceeds(updateDoc(doc(as('admin1', staffToken('admin1')), `${BASE}/sessions/mine1`), { clinicDetails: '오늘 잘했습니다' })));

    console.log('\n[6] 급여·게이트웨이·비로그인');
    await check('남의 급여는 못 본다', () =>
        assertFails(getDoc(doc(as('stu1', studentToken('stu1')), `${BASE}/payrolls/teacher1_2026-07`))));
    await check('본인 급여는 볼 수 있다', () =>
        assertSucceeds(getDoc(doc(as('teacher1', { email: 'teacher1@imperial.com', role: 'lecturer', did: 'teacher1', approved: true }), `${BASE}/payrolls/teacher1_2026-07`))));
    await check('폐기된 게이트웨이 계정(admin)은 사용자 목록을 못 본다', () =>
        assertFails(getDocs(collection(as('oldgw', { email: 'admin@imperial.com', role: 'gateway', approved: true }), `${BASE}/users`))));
    await check('새 게이트웨이 계정(smsgw)은 사용자 목록을 볼 수 있다', () =>
        assertSucceeds(getDocs(collection(as('gw', { email: 'smsgw@imperial.com', role: 'gateway', approved: true }), `${BASE}/users`))));
    await check('비로그인은 사용자 문서를 못 본다', () =>
        assertFails(getDoc(doc(guest(), `${BASE}/users/stu1`))));
    await check('비로그인도 학교 목록은 볼 수 있다 (가입 화면용)', () =>
        assertSucceeds(getDoc(doc(guest(), `${BASE}/settings/schools`))));

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
