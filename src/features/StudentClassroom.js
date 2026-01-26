import React, { useState, useEffect } from 'react';
import YouTube from 'react-youtube';
import { X, CheckCircle, Video } from 'lucide-react';
import { collection, doc, setDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const getYouTubeID = (url) => {
    if(!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

const StudentClassroom = ({ currentUser }) => {
    const [myClasses, setMyClasses] = useState([]);
    const [lectures, setLectures] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [completions, setCompletions] = useState([]);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), where('studentIds', 'array-contains', currentUser.id));
        return onSnapshot(q, (s) => setMyClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [currentUser]);

    useEffect(() => {
        if (myClasses.length === 0) return;
        const classIds = myClasses.map(c => c.id);
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', 'in', classIds.slice(0, 10)));
        return onSnapshot(q, (s) => setLectures(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.date.localeCompare(a.date))));
    }, [myClasses]);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions'), where('studentId', '==', currentUser.id));
        return onSnapshot(q, (s) => setCompletions(s.docs.map(d => d.data().lectureId)));
    }, [currentUser]);

    const handleVideoEnd = async (lectureId) => {
        const docId = `${lectureId}_${currentUser.id}`;
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions', docId), {
            lectureId,
            studentId: currentUser.id,
            studentName: currentUser.name,
            status: 'completed',
            completedAt: serverTimestamp()
        });
        alert('학습 완료가 저장되었습니다!');
        setSelectedVideo(null);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">내 강의실</h2>
            
            <div className="space-y-4">
                {lectures.map(lecture => {
                    const cls = myClasses.find(c => c.id === lecture.classId);
                    const isCompleted = completions.includes(lecture.id);
                    const videoId = getYouTubeID(lecture.youtubeLink);

                    return (
                        <Card key={lecture.id} className={`border-l-4 ${isCompleted ? 'border-l-green-500' : 'border-l-gray-300'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md mb-1 inline-block">{cls?.name}</span>
                                    <div className="font-bold text-lg">{lecture.date} 수업</div>
                                </div>
                                {isCompleted ? (
                                    <div className="flex items-center gap-1 text-green-600 font-bold text-sm"><CheckCircle size={16} /> 학습 완료</div>
                                ) : (
                                    <span className="text-gray-400 text-sm font-medium">미완료</span>
                                )}
                            </div>
                            <div className="space-y-2 mb-4 text-sm text-gray-700">
                                <div className="bg-gray-50 p-3 rounded-lg"><span className="font-bold mr-2">진도:</span>{lecture.progress}</div>
                                <div className="bg-purple-50 p-3 rounded-lg"><span className="font-bold mr-2">숙제:</span>{lecture.homework}</div>
                            </div>
                            {videoId && (
                                <Button 
                                    className={`w-full ${isCompleted ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-red-600 text-white hover:bg-red-700'}`} 
                                    icon={Video} 
                                    onClick={() => setSelectedVideo({ id: videoId, lectureId: lecture.id })}
                                >
                                    {isCompleted ? '다시 보기' : '영상 학습하기'}
                                </Button>
                            )}
                        </Card>
                    );
                })}
            </div>

            {selectedVideo && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col justify-center items-center p-4">
                    <div className="w-full max-w-4xl aspect-video bg-black shadow-2xl relative">
                        <button onClick={() => setSelectedVideo(null)} className="absolute -top-12 right-0 text-white p-2"><X size={32}/></button>
                        <YouTube
                            videoId={selectedVideo.id}
                            opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }}
                            className="w-full h-full"
                            onEnd={() => handleVideoEnd(selectedVideo.lectureId)}
                        />
                    </div>
                    <p className="text-white mt-4 text-center">영상을 끝까지 시청하면 자동으로 완료 처리됩니다.</p>
                </div>
            )}
        </div>
    );
};

export default StudentClassroom;