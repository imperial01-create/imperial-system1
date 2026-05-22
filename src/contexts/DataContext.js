import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';

const DataContext = createContext();
const APP_ID = 'imperial-clinic-v1';

export const DataProvider = ({ children, currentUser }) => {
    const [users, setUsers] = useState([]);
    const [classes, setClasses] = useState([]);
    const [enrollments, setEnrollments] = useState([]);
    const [masterData, setMasterData] = useState({ classrooms: [], subjects: [] });
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        // 로그인이 안 되어있거나, 권한이 없는 유저면 데이터를 당겨오지 않음 (보안/요금 최적화)
        if (!currentUser) {
            setLoadingData(false);
            return;
        }

        const isStaff = ['admin', 'admin_assistant', 'lecturer', 'ta'].includes(currentUser.role);
        if (!isStaff) {
            setLoadingData(false);
            return;
        }

        // 1. 유저 명단 글로벌 리스너
        const unsubUsers = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/users`), (snapshot) => {
            setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 2. 클래스 명단 글로벌 리스너
        const unsubClasses = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/classes`), (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
            setClasses(list);
        });

        // 3. 수강 이력 글로벌 리스너
        const unsubEnrollments = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/enrollments`), (snapshot) => {
            setEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 4. 환경설정(마스터 데이터) 글로벌 리스너
        const unsubSettings = onSnapshot(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data'), (docSnap) => {
            if (docSnap.exists()) {
                setMasterData({
                    classrooms: docSnap.data().classrooms || [],
                    subjects: docSnap.data().subjects || []
                });
            }
        });

        setLoadingData(false);

        // 앱이 꺼지거나 로그아웃 시 리스너 안전하게 메모리 해제
        return () => { unsubUsers(); unsubClasses(); unsubEnrollments(); unsubSettings(); };
    }, [currentUser]);

    return (
        <DataContext.Provider value={{ users, classes, enrollments, masterData, loadingData }}>
            {children}
        </DataContext.Provider>
    );
};

// 훅(Hook)을 통해 다른 파일에서 쉽게 데이터를 꺼내 쓸 수 있도록 모듈화
export const useData = () => useContext(DataContext);