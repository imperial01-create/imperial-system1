import React, { useState, useEffect, useMemo } from 'react';
// [Import Check] Image, ExternalLink 아이콘 확인
import { 
  ChevronLeft, ChevronRight, BookOpen, PenTool, CheckCircle, 
  AlertCircle, Image, ExternalLink, Loader 
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// --- Helper Functions ---
const getMonthRange = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { 
        startStr: `${year}-${String(month+1).padStart(2,'0')}-01`, 
        endStr: `${year}-${String(month+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`,
        year, 
        month: month + 1
    };
};

const getWeekNumber = (date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const dayOfWeek = firstDay.getDay(); // 0(Sun) ~ 6(Sat)
    return Math.ceil((date.getDate() + dayOfWeek) / 7);
};

const formatShortDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return {
        formatted: `${String(m).padStart(2,'0')}.${String(d).padStart(2,'0')}`,
        day: DAYS[dateObj.getDay()]
    };
};

// --- Sub Component: Weekly Card ---
const WeeklyCard = ({ weekNum, lectures, completions }) => {
    const total = lectures.length;
    const completedCount = lectures.filter(l => completions.includes(l.id)).length;
    const progress = total === 0 ? 0 : Math.round((completedCount / total) * 100);
    
    const sortedDates = lectures.map(l => l.date).sort();
    const rangeStr = sortedDates.length > 0 
        ? `${formatShortDate(sortedDates[0]).formatted} ~ ${formatShortDate(sortedDates[sortedDates.length-1]).formatted}`
        : '';

    const isPerfect = progress === 100;
    const barColor = isPerfect ? 'bg-green-500' : 'bg-blue-600';
    const textColor = isPerfect ? 'text-green-600' : 'text-blue-600';

    return (
        <Card className="w-full overflow-hidden border border-gray-200 shadow-sm">
            <div className="bg-gray-50 p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">{weekNum}주차 <span className="text-sm font-normal text-gray-500 ml-2">({rangeStr})</span></h3>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="flex-1 sm:w-32 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${progress}%` }} />
                    </div>
                    <span className={`font-bold ${textColor} w-12 text-right`}>{progress}%</span>
                </div>
            </div>

            <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[600px] md:min-w-0">
                    <thead className="bg-white border-b text-gray-500">
                        <tr>
                            <th className="p-4 w-[15%]">날짜</th>
                            <th className="p-4 w-[70%]">학습 내용</th>
                            <th className="p-4 w-[15%] text-center">인증</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {lectures.map(lecture => {
                            const { formatted, day } = formatShortDate(lecture.date);
                            const isDone = completions.includes(lecture.id);

                            return (
                                <tr key={lecture.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 align-top">
                                        <div className="font-bold text-gray-800">{formatted} <span className="text-gray-400 font-normal">({day})</span></div>
                                    </td>
                                    <td className="p-4 align-top space-y-2">
                                        <div className="flex gap-2">
                                            <span className="shrink-0 bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded font-bold h-fit mt-0.5">진도</span>
                                            <span className="text-gray-700 whitespace-pre-wrap">{lecture.progress}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="shrink-0 bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded font-bold h-fit mt-0.5">숙제</span>
                                            <span className="text-gray-700 whitespace-pre-wrap">{lecture.homework}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 align-top text-center">
                                        {lecture.proofImageUrl ? (
                                            <a 
                                                href={lecture.proofImageUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors border border-gray-200"
                                                title="인증 사진 보기"
                                            >
                                                <Image size={20} />
                                                <span className="md:hidden ml-1 text-xs">보기</span>
                                            </a>
                                        ) : (
                                            <span className="text-gray-300 text-xs">-</span>
                                        )}
                                        {isDone && <div className="mt-1 text-green-500 text-xs font-bold flex items-center justify-center gap-1"><CheckCircle size={10}/> 완료</div>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

// --- Main Component ---
const StudentClassroom = ({ currentUser }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [groupedLectures, setGroupedLectures] = useState({});
    const [completions, setCompletions] = useState([]); 
    const [isLoading, setIsLoading] = useState(false);

    const targetStudentId = currentUser.role === 'parent' ? currentUser.childId : currentUser.id;
    const targetStudentName = currentUser.role === 'parent' ? currentUser.childName : currentUser.name;

    useEffect(() => {
        if (!targetStudentId) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const { startStr, endStr } = getMonthRange(currentDate);

                // 1. 해당 학생이 속한 반(Class) 찾기
                const classQuery = query(
                    collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'),
                    where('studentIds', 'array-contains', targetStudentId)
                );
                const classSnapshot = await getDocs(classQuery);
                const myClassIds = classSnapshot.docs.map(d => d.id);

                if (myClassIds.length === 0) {
                    setGroupedLectures({});
                    setCompletions([]);
                    setIsLoading(false);
                    return;
                }

                // 2. [CTO FIX] 복합 쿼리 대신 단순 IN 쿼리 실행 후 메모리 필터링
                // 이유: Firestore Index 미생성으로 인한 데이터 미노출 방지 (Zero Runtime Error)
                const lecturesQuery = query(
                    collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'),
                    where('classId', 'in', myClassIds) // 최대 10개 반까지만 지원됨에 유의
                );
                
                const lecturesSnapshot = await getDocs(lecturesQuery);
                
                // 메모리에서 날짜 필터링 수행 (NoSQL Optimization)
                const lecturesData = lecturesSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(l => l.date >= startStr && l.date <= endStr); // 날짜 범위 필터링

                // 3. 완료 기록 가져오기
                const lectureIds = lecturesData.map(l => l.id);
                let completedIds = [];
                if (lectureIds.length > 0) {
                    const compQuery = query(
                        collection(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions'),
                        where('studentId', '==', targetStudentId)
                    );
                    const compSnapshot = await getDocs(compQuery);
                    completedIds = compSnapshot.docs
                        .map(d => d.data())
                        .filter(c => lectureIds.includes(c.lectureId))
                        .map(c => c.lectureId);
                }

                // 4. 주차별 그룹핑 (Grouping by Week)
                const grouping = {};
                lecturesData.forEach(lec => {
                    const d = new Date(lec.date);
                    const weekNum = getWeekNumber(d);
                    if (!grouping[weekNum]) grouping[weekNum] = [];
                    grouping[weekNum].push(lec);
                });

                // 날짜순 정렬
                Object.keys(grouping).forEach(key => {
                    grouping[key].sort((a, b) => a.date.localeCompare(b.date));
                });

                setGroupedLectures(grouping);
                setCompletions(completedIds);

            } catch (e) {
                console.error("Student Classroom Fetch Error:", e);
                // 에러 발생 시 사용자에게 빈 화면보다 안내 메시지가 나을 수 있음
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [currentDate, targetStudentId]);

    const handlePrevMonth = () => {
        const d = new Date(currentDate);
        d.setDate(1); 
        d.setMonth(d.getMonth() - 1);
        setCurrentDate(d);
    };

    const handleNextMonth = () => {
        const d = new Date(currentDate);
        d.setDate(1); 
        d.setMonth(d.getMonth() + 1);
        setCurrentDate(d);
    };

    return (
        <div className="space-y-6 w-full animate-in fade-in">
            {/* Header */}
            <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BookOpen className="text-blue-600" />
                        수강 강의실
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">
                        <span className="font-bold text-blue-600">{targetStudentName}</span> 학생의 학습 현황입니다.
                    </p>
                </div>
                
                <div className="flex items-center bg-gray-100 rounded-xl p-1">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all"><ChevronLeft size={20}/></button>
                    <span className="font-bold text-lg w-32 text-center">{currentDate.getFullYear()}. {String(currentDate.getMonth()+1).padStart(2,'0')}</span>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-white rounded-lg shadow-sm transition-all"><ChevronRight size={20}/></button>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="py-20 flex justify-center"><Loader className="animate-spin text-blue-600" size={40}/></div>
            ) : Object.keys(groupedLectures).length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed text-gray-400">
                    <AlertCircle className="mx-auto mb-2 opacity-50" size={48} />
                    해당 월에 등록된 강의가 없습니다.
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.keys(groupedLectures).sort().map(weekNum => (
                        <WeeklyCard 
                            key={weekNum} 
                            weekNum={weekNum} 
                            lectures={groupedLectures[weekNum]} 
                            completions={completions} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default StudentClassroom;