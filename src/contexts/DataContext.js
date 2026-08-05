/* [DataContext] 전역 데이터 구독 계층

   🔒 [2단계 패치] 역할별 데이터 격리
   이전에는 로그인한 사람의 역할과 무관하게 users / enrollments / english_stats
   컬렉션 '전체'를 실시간 구독했습니다. 그래서 학생 한 명이 로그인하면
     - 전 원생의 이름·전화번호·학교
     - 강사/조교의 은행명·계좌번호
     - 전 학생의 영어 어휘 점수
   가 그대로 그 학생 브라우저로 내려갔고, 원생 수에 비례해 Firestore 읽기 요금도 늘었습니다.

   이제는 이렇게 나눕니다.
     교직원      : 기존과 동일하게 전체 구독 (업무상 필요)
     학생/학부모 : 본인 + 자녀 문서 + 교직원 명부(이름/역할/과목만) + 본인 수강 이력

   화면 코드는 그대로 둡니다. users 배열의 '모양'은 같고 담기는 범위만 좁아지므로
   users.find(u => u.id === lecturerId)?.name 같은 기존 코드가 그대로 동작합니다.
*/

import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const DataContext = createContext();
const APP_ID = 'imperial-clinic-v1';
const BASE = `artifacts/${APP_ID}/public/data`;

const STAFF_ROLES = ['admin', 'admin_assistant', 'lecturer', 'ta'];

export const DataProvider = ({ children, currentUser }) => {
    const [users, setUsers] = useState([]);
    const [classes, setClasses] = useState([]);
    const [enrollments, setEnrollments] = useState([]);
    const [masterData, setMasterData] = useState({ classrooms: [], subjects: [], seasons: [] });
    const [englishStats, setEnglishStats] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setLoadingData(false);
            return;
        }

        const role = currentUser.role;
        const isStaff = STAFF_ROLES.includes(role);
        if (!isStaff && role !== 'student' && role !== 'parent') {
            setLoadingData(false);
            return;
        }

        const unsubs = [];
        // 권한 문제로 구독이 끊겼을 때 조용히 죽지 않도록 항상 오류를 남깁니다.
        const onErr = (label) => (e) => console.error(`[DataContext] ${label} 구독 실패:`, e);

        // ── 공통: 반 목록과 학원 마스터 설정 (개인정보 없음) ──────────────
        unsubs.push(onSnapshot(collection(db, `${BASE}/classes`), (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR'));
            setClasses(list);
        }, onErr('classes')));

        unsubs.push(onSnapshot(doc(db, `${BASE}/settings`, 'master_data'), (docSnap) => {
            if (docSnap.exists()) {
                setMasterData({
                    classrooms: docSnap.data().classrooms || [],
                    subjects: docSnap.data().subjects || [],
                    seasons: docSnap.data().seasons || []
                });
            }
        }, onErr('settings/master_data')));

        if (isStaff) {
            // ── 교직원: 업무상 전체 데이터가 필요합니다 ────────────────────
            unsubs.push(onSnapshot(collection(db, `${BASE}/users`), (snapshot) => {
                setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            }, onErr('users')));

            unsubs.push(onSnapshot(collection(db, `${BASE}/enrollments`), (snapshot) => {
                setEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            }, onErr('enrollments')));

            unsubs.push(onSnapshot(collection(db, `${BASE}/english_stats`), (snapshot) => {
                setEnglishStats(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            }, onErr('english_stats')));

        } else {
            // ── 학생/학부모: 꼭 필요한 것만 ───────────────────────────────
            const childIds = Array.isArray(currentUser.linkedChildrenIds) ? currentUser.linkedChildrenIds : [];
            const ownerIds = [...new Set([currentUser.id, ...childIds])].filter(Boolean);

            let selfAndChildren = [];
            let staffList = [];
            const mergeUsers = () => setUsers([...selfAndChildren, ...staffList]);

            // 교직원 명부: 이름 / 역할 / 과목만 담긴 별도 컬렉션 (서버가 자동 동기화)
            unsubs.push(onSnapshot(collection(db, `${BASE}/staff_directory`), (snapshot) => {
                staffList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                mergeUsers();
            }, onErr('staff_directory')));

            // 본인 / 자녀 문서: 목록 조회가 아니라 문서 단위로 직접 구독합니다.
            ownerIds.forEach((id) => {
                unsubs.push(onSnapshot(doc(db, `${BASE}/users`, id), (snap) => {
                    if (!snap.exists()) return;
                    const u = { id: snap.id, ...snap.data() };
                    selfAndChildren = [...selfAndChildren.filter(x => x.id !== u.id), u];
                    mergeUsers();
                }, onErr(`users/${id}`)));
            });

            // 수강 이력: 본인(또는 자녀) 것만
            if (ownerIds.length > 0) {
                // Firestore 'in' 연산자는 최대 30개까지 지원합니다.
                const targets = ownerIds.slice(0, 30);
                unsubs.push(onSnapshot(
                    query(collection(db, `${BASE}/enrollments`), where('studentId', 'in', targets)),
                    (snapshot) => setEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
                    onErr('enrollments(mine)')
                ));
            }

            // english_stats 전체 구독은 하지 않습니다.
            // 이 값을 쓰는 화면(VocaManager)은 교직원 전용이며,
            // 학생 화면(StudentVocaDaily)은 본인 문서를 직접 읽습니다.
            setEnglishStats([]);
        }

        setLoadingData(false);

        return () => { unsubs.forEach(fn => { try { fn(); } catch (e) { /* 이미 해제됨 */ } }); };
    }, [currentUser]);

    /* 🐛 [버그 수정] currentUser를 Context에 함께 제공합니다.
       ConsultationManager / RecruitmentManager / AcademicCalendarManager는
       useData()에서 currentUser를 꺼내 쓰고 있었지만 Provider가 넘겨주지 않아
       항상 undefined였습니다. (예: 상담 등록 시 담당자가 비어 있던 원인) */
    return (
        <DataContext.Provider value={{ currentUser, users, classes, enrollments, masterData, englishStats, loadingData }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => useContext(DataContext);
