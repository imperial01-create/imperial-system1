import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';

const DataContext = createContext();
const APP_ID = 'imperial-clinic-v1';

export const DataProvider = ({ children, currentUser }) => {
    const [users, setUsers] = useState([]);
    const [classes, setClasses] = useState([]);
    const [enrollments, setEnrollments] = useState([]);
    // 🚀 [CTO 패치] masterData 기본값에 seasons 배열 추가
    const [masterData, setMasterData] = useState({ classrooms: [], subjects: [], seasons: [] });
    const [englishStats, setEnglishStats] = useState([]); 
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setLoadingData(false);
            return;
        }

        const isStaff = ['admin', 'admin_assistant', 'lecturer', 'ta'].includes(currentUser.role);
        if (!isStaff && currentUser.role !== 'student' && currentUser.role !== 'parent') {
            setLoadingData(false);
            return;
        }

        const unsubUsers = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/users`), (snapshot) => {
            setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubClasses = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/classes`), (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
            setClasses(list);
        });

        const unsubEnrollments = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/enrollments`), (snapshot) => {
            setEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 🚀 [CTO 패치] 환경설정(Settings)에서 설정한 시즌 데이터를 실시간으로 가져옵니다.
        const unsubSettings = onSnapshot(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data'), (docSnap) => {
            if (docSnap.exists()) {
                setMasterData({
                    classrooms: docSnap.data().classrooms || [],
                    subjects: docSnap.data().subjects || [],
                    seasons: docSnap.data().seasons || [] // 시즌 데이터 연동
                });
            }
        });

        const unsubEnglishStats = onSnapshot(collection(db, `artifacts/${APP_ID}/public/data/english_stats`), (snapshot) => {
            setEnglishStats(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        setLoadingData(false);

        return () => { 
            unsubUsers(); 
            unsubClasses(); 
            unsubEnrollments(); 
            unsubSettings(); 
            unsubEnglishStats(); 
        };
    }, [currentUser]);

    return (
        <DataContext.Provider value={{ users, classes, enrollments, masterData, englishStats, loadingData }}>
            {children}
        </DataContext.Provider>
    );
};

export const useData = () => useContext(DataContext);