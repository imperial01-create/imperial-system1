import React, { useState, useEffect } from 'react';
import YouTube from 'react-youtube';
import { X, CheckCircle, Video, BookOpen, PenTool, ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, doc, setDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const getYouTubeID = (url) => {
    if(!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// --- Student Calendar ---
const StudentCalendar = ({ lectures, selectedDate, onSelectDate }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const getDays = () => {
        const y = currentDate.getFullYear(), m = currentDate.getMonth();
        const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
        const days = [];
        for (let i = 0; i < first.getDay(); i++) days.push(null);
        for (let i = 1; i <= last.getDate(); i++) days.push(new Date(y, m, i));
        return days;
    };

    return (
        <Card className="p-4 md:p-6 w-full">
            <div className="flex justify-between items-center mb-4">
                <span className="font-bold text-lg">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-1 hover:bg-white rounded"><ChevronLeft size={20}/></button>
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-1 hover:bg-white rounded"><ChevronRight size={20}/></button>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-400 mb-2">{DAYS.map(d => <div key={d}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
                {getDays().map((d, i) => {
                    if (!d) return <div key={i} />;
                    const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    const dailyLectures = lectures.filter(l => l.date === dStr);
                    const isSelected = dStr === selectedDate;
                    
                    return (
                        <button key={i} onClick={() => onSelectDate(dStr)} 
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all 
                            ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-gray-50 text-gray-700'} 
                            ${dailyLectures.length > 0 && !isSelected ? 'ring-1 ring-blue-100 bg-blue-50/50' : ''}`}>
                            <span className="text-sm font-medium">{d.getDate()}</span>
                            {dailyLectures.length > 0 && (
                                <div className="flex gap-0.5 mt-1">
                                    {dailyLectures.slice(0,3).map((_, idx) => <div key={idx} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />)}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </Card>
    );
};

const StudentClassroom = ({ currentUser }) => {
    const [myClasses, setMyClasses] = useState([]);
    const [lectures, setLectures] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [completions, setCompletions] = useState([]);

    // [중요] 학부모일 경우 자녀 ID 사용
    const targetStudentId = currentUser.role === 'parent' ? currentUser.childId : currentUser.id;
    const isParent = currentUser.role === 'parent';

    // 1. 배정된 반 가져오기 (타겟 학생 기준)
    useEffect(() => {
        if (!targetStudentId) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), where('studentIds', 'array-contains', targetStudentId));
        return onSnapshot(q, (s) => setMyClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [targetStudentId]);

    // 2. 해당 반들의 강의 목록 가져오기
    useEffect(() => {
        if (myClasses.length === 0) return;
        const classIds = myClasses.map(c => c.id);
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', 'in', classIds.slice(0, 10)));
        return onSnapshot(q, (s) => setLectures(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.date.localeCompare(a.date))));
    }, [myClasses]);

    const dailyLectures = lectures.filter(l => l.date === selectedDate);

    // 3. 수강 기록 가져오기 (타겟 학생 기준)
    useEffect(() => {
        if (dailyLectures.length === 0 || !targetStudentId) {
            setCompletions([]);
            return;
        }
        
        const lectureIds = dailyLectures.map(l => l.id);
        const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions'), 
            where('studentId', '==', targetStudentId),
            where('lectureId', 'in', lectureIds)
        );
        return onSnapshot(q, (s) => setCompletions(s.docs.map(d => d.data().lectureId)));
    }, [selectedDate, lectures.length, targetStudentId]);

    const handleVideoEnd = async (lectureId) => {
        if (isParent) return; // 학부모는 시청 완료 처리 불가
        if (completions.includes(lectureId)) return; 
        
        const docId = `${lectureId}_${currentUser.id}`;
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions', docId), {
            lectureId,
            studentId: currentUser.id,
            studentName: currentUser.name,
            status: 'completed',
            completedAt: serverTimestamp()
        });
        alert('🎉 학습을 완료했습니다!');
        setSelectedVideo(null);
    };

    if (isParent && !targetStudentId) {
        return <div className="text-center py-20 text-gray-500">연결된 자녀 정보가 없습니다. 관리자에게 문의하세요.</div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full animate-in fade-in">
            <div className="lg:col-span-1 space-y-4">
                 <StudentCalendar lectures={lectures} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
                 <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800 w-full">
                    <p className="font-bold mb-1">💡 {isParent ? '자녀 학습 안내' : '학습 안내'}</p>
                    <p>날짜를 선택하면 {isParent ? '자녀의' : ''} 수업 내용과 숙제를 확인할 수 있습니다.</p>
                 </div>
            </div>
            
            <div className="lg:col-span-2 space-y-4 w-full">
                <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
                    <span className="text-blue-600">{selectedDate.split('-')[2]}일</span> 수업 목록
                </h3>
                
                {dailyLectures.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm w-full">
                        수업 일정이 없습니다.
                    </div>
                ) : (
                    dailyLectures.map(lecture => {
                        const cls = myClasses.find(c => c.id === lecture.classId);
                        const isCompleted = completions.includes(lecture.id);
                        const links = lecture.youtubeLinks && lecture.youtubeLinks.length > 0 
                            ? lecture.youtubeLinks 
                            : (lecture.youtubeLink ? [lecture.youtubeLink] : []);

                        return (
                            <Card key={lecture.id} className={`border-l-4 transition-all hover:shadow-md w-full ${isCompleted ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md mb-2 inline-block">{cls?.name}</span>
                                        <h4 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                            {isCompleted ? <span className="text-green-600 flex items-center gap-1 text-sm bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle size={14}/> 학습 완료</span> : <span className="text-red-500 text-sm bg-red-50 px-2 py-0.5 rounded-full">미완료</span>}
                                        </h4>
                                    </div>
                                </div>
                                <div className="space-y-4 mb-5">
                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0"><BookOpen size={16}/></div>
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-gray-400">진도</div>
                                            <div className="text-gray-800 font-medium whitespace-pre-wrap">{lecture.progress}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0"><PenTool size={16}/></div>
                                        <div className="flex-1">
                                            <div className="text-xs font-bold text-gray-400">숙제</div>
                                            <div className="text-gray-800 font-medium whitespace-pre-wrap">{lecture.homework}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-2">
                                    {links.length > 0 ? (
                                        links.map((link, idx) => {
                                            const videoId = getYouTubeID(link);
                                            if (!videoId) return null;
                                            return (
                                                <Button 
                                                    key={idx}
                                                    className={`w-full ${isCompleted ? 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`} 
                                                    icon={Video} 
                                                    onClick={() => setSelectedVideo({ id: videoId, lectureId: lecture.id })}
                                                >
                                                    {isParent ? `영상 ${idx+1} 보기 (학부모 모드)` : (isCompleted ? `다시 보기 (영상 ${idx + 1})` : `영상 ${idx + 1} 학습하기`)}
                                                </Button>
                                            );
                                        })
                                    ) : (
                                        <div className="w-full py-3 text-center text-gray-400 bg-gray-50 rounded-xl text-sm border border-gray-100">영상 없음</div>
                                    )}
                                </div>
                            </Card>
                        );
                    })
                )}
            </div>

            {selectedVideo && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col justify-center items-center p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-4xl aspect-video bg-black shadow-2xl relative rounded-2xl overflow-hidden">
                        <button onClick={() => setSelectedVideo(null)} className="absolute top-4 right-4 text-white/80 hover:text-white p-2 bg-black/50 rounded-full backdrop-blur-sm transition-colors z-10"><X size={24}/></button>
                        <YouTube
                            videoId={selectedVideo.id}
                            opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }}
                            className="w-full h-full"
                            onEnd={() => !isParent && handleVideoEnd(selectedVideo.lectureId)}
                        />
                    </div>
                    <p className="text-white/80 mt-6 text-center font-medium">
                        {isParent ? '학부모 모드: 시청 기록이 저장되지 않습니다.' : '영상을 끝까지 시청하면 자동으로 완료 처리됩니다.'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default StudentClassroom;