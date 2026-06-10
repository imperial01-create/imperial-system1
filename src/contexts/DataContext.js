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
    // 🚀 [추가됨] 영어 5대 지표 및 종합 스탯 상태 관리
    const [englishStats, setEnglishStats] = useState([]); 
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setLoadingData(false);
            return;
        }

        const isStaff = ['admin', 'admin_assistant', 'lecturer', 'ta'].includes(currentUser.role);
        // (선택) 학생과 학부모도 본인의 데이터를 읽어야 한다면 isStaff 체크를 우회하는 로직이 추후 필요할 수 있습니다.
        if (!isStaff && currentUser.role !== 'student' && currentUser.role !== 'parent') {
            setLoadingData(false);
            return;
        }

        // 1. 유저 명단 리스너
        const unsubUsers = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/users`), (snapshot) => {
            setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 2. 클래스 명단 리스너
        const unsubClasses = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/classes`), (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
            setClasses(list);
        });

        // 3. 수강 이력 리스너
        const unsubEnrollments = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/enrollments`), (snapshot) => {
            setEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 4. 환경설정 리스너
        const unsubSettings = onSnapshot(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data'), (docSnap) => {
            if (docSnap.exists()) {
                setMasterData({
                    classrooms: docSnap.data().classrooms || [],
                    subjects: docSnap.data().subjects || []
                });
            }
        });

        // 🚀 [추가됨] 5. 영어 스탯 글로벌 리스너 연결
        const unsubEnglishStats = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/english_stats`), (snapshot) => {
            setEnglishStats(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        setLoadingData(false);

        // 앱이 꺼질 때 리스너 안전하게 메모리 해제
        return () => { 
            unsubUsers(); 
            unsubClasses(); 
            unsubEnrollments(); 
            unsubSettings(); 
            unsubEnglishStats(); // 🚀 [추가됨] 해제 함수 추가
        };
    }, [currentUser]);

    // 🚀 [추가됨] 반환하는 value에 englishStats 추가
    return (
        <DataContext.Provider value={{ users, classes, enrollments, masterData, englishStats, loadingData }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => useContext(DataContext);   