/* [서비스 가치] 학생/학부모 전용 수강 강의 대시보드
   - 학생이 수강 중인 과목과 진도율을 직관적으로 확인하고 강의를 시청할 수 있는 공간입니다. */
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { BookOpen, Video, PlayCircle, Lock, Loader, ChevronRight, CheckCircle } from 'lucide-react';
import { Button, Card, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const StudentClassroom = ({ currentUser }) => {
    const { enrollments, classes, loadingData } = useData();
    const [loading, setLoading] = useState(true);
    const [lectures, setLectures] = useState({});
    const [selectedClass, setSelectedClass] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);

    // 1. 내 수강 반 목록 가져오기
    const myClasses = useMemo(() => {
        if (!currentUser) return [];
        const studentId = currentUser.role === 'parent' ? currentUser.childId : currentUser.id;
        const myEnrollments = enrollments.filter(e => e.studentId === studentId && e.status === 'active');
        const classIds = myEnrollments.map(e => e.classId);
        
        return classes.filter(c => classIds.includes(c.id));
    }, [currentUser, enrollments, classes]);

    // 2. 수강 반의 강의 목록 가져오기
    useEffect(() => {
        const fetchLectures = async () => {
            if (myClasses.length === 0) {
                setLoading(false);
                return;
            }
            
            try {
                const lecturesData = {};
                for (const cls of myClasses) {
                    const q = query(
                        collection(db, `artifacts/${APP_ID}/public/data/lectures`), 
                        where('classId', '==', cls.id)
                    );
                    const snap = await getDocs(q);
                    lecturesData[cls.id] = snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds); // 최신순
                }
                setLectures(lecturesData);
            } catch (error) {
                console.error("강의 목록 로딩 실패:", error);
            } finally {
                setLoading(false);
            }
        };

        if (!loadingData) {
            fetchLectures();
        }
    }, [myClasses, loadingData]);

    if (loading || loadingData) return <div className="h-full flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-6 animate-in fade-in max-w-6xl mx-auto pb-20">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 md:p-8 rounded-3xl shadow-lg">
                <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2">
                    <BookOpen size={28} /> 나의 수강 강의
                </h1>
                <p className="opacity-90">선생님이 업로드한 지난 수업 영상과 숙제를 확인할 수 있습니다.</p>
            </div>

            {myClasses.length === 0 ? (
                <div className="bg-white p-10 text-center rounded-3xl border border-dashed border-gray-300">
                    <Lock className="mx-auto text-gray-300 mb-4 w-12 h-12" />
                    <h3 className="text-xl font-bold text-gray-700 mb-2">아직 수강 중인 반이 없습니다.</h3>
                    <p className="text-gray-500">데스크에서 반 배정을 완료하면 강의를 보실 수 있습니다.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    
                    {/* 좌측: 수강 중인 반 리스트 */}
                    <div className="md:col-span-4 space-y-4">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2 px-1">
                            <BookOpen size={20} className="text-blue-600"/> 수강 목록
                        </h3>
                        <div className="space-y-3">
                            {myClasses.map(cls => {
                                const classLectures = lectures[cls.id] || [];
                                const isSelected = selectedClass?.id === cls.id;
                                
                                return (
                                    <div 
                                        key={cls.id} 
                                        onClick={() => setSelectedClass(cls)}
                                        className={`p-5 rounded-2xl cursor-pointer transition-all border-2 ${isSelected ? 'bg-blue-50 border-blue-500 shadow-md' : 'bg-white border-gray-100 hover:border-blue-300'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full mb-1 inline-block">{cls.subject || '공통'}</span>
                                                <h4 className="font-black text-gray-900 text-lg leading-tight">{cls.name}</h4>
                                            </div>
                                            <ChevronRight className={isSelected ? 'text-blue-600' : 'text-gray-300'} />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-3 font-medium">
                                            <Video size={16} /> 총 {classLectures.length}개의 영상
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 우측: 선택된 반의 영상 리스트 */}
                    <div className="md:col-span-8 space-y-4">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2 px-1">
                            <Video size={20} className="text-indigo-600"/> 강의 영상 및 숙제
                        </h3>
                        
                        {!selectedClass ? (
                            <div className="bg-gray-50 rounded-3xl border border-gray-200 flex items-center justify-center h-64 text-gray-400 font-bold">
                                좌측에서 반을 선택해주세요.
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-2">
                                <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                                        <BookOpen size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">{selectedClass.name}</h4>
                                        <p className="text-xs text-gray-500">최신 강의가 가장 위에 표시됩니다.</p>
                                    </div>
                                </div>

                                <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {(!lectures[selectedClass.id] || lectures[selectedClass.id].length === 0) ? (
                                        <div className="text-center py-10 text-gray-400 font-bold">아직 업로드된 강의가 없습니다.</div>
                                    ) : (
                                        lectures[selectedClass.id].map(lecture => (
                                            <div key={lecture.id} className="border border-gray-100 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
                                                <div className="flex flex-col sm:flex-row gap-4 justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-bold text-gray-500">{lecture.date}</span>
                                                            {lecture.type && <span className="text-[10px] font-bold bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">{lecture.type}</span>}
                                                        </div>
                                                        <h5 className="font-bold text-gray-900 text-lg mb-2">{lecture.title}</h5>
                                                        
                                                        {lecture.homework && (
                                                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-sm mb-3">
                                                                <span className="font-bold text-blue-800 flex items-center gap-1 mb-1"><CheckCircle size={14}/> 과제 (Homework)</span>
                                                                <span className="text-blue-900 whitespace-pre-wrap">{lecture.homework}</span>
                                                            </div>
                                                        )}
                                                        {lecture.description && (
                                                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{lecture.description}</p>
                                                        )}
                                                    </div>
                                                    
                                                    {lecture.videoUrl && (
                                                        <div className="shrink-0 flex items-center justify-center sm:justify-start">
                                                            <Button 
                                                                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 font-bold shadow-md"
                                                                onClick={() => setSelectedVideo(lecture)}
                                                            >
                                                                <PlayCircle size={18} className="mr-1 inline"/> 영상 보기
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 유튜브/비메오 영상 재생 모달 */}
            <Modal isOpen={!!selectedVideo} onClose={() => setSelectedVideo(null)} title={selectedVideo?.title || "강의 시청"}>
                {selectedVideo && (
                    <div className="space-y-4">
                        <div className="aspect-video w-full bg-black rounded-xl overflow-hidden shadow-inner">
                            <iframe 
                                src={selectedVideo.videoUrl} 
                                title="Lecture Video"
                                className="w-full h-full"
                                frameBorder="0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen
                            ></iframe>
                        </div>
                        {selectedVideo.homework && (
                            <div className="bg-gray-50 p-4 rounded-xl">
                                <h4 className="font-bold text-gray-800 flex items-center gap-1 mb-2"><CheckCircle size={16} className="text-blue-600"/> 숙제 확인</h4>
                                <p className="text-gray-700 whitespace-pre-wrap">{selectedVideo.homework}</p>
                            </div>
                        )}
                        <Button className="w-full py-3" variant="secondary" onClick={() => setSelectedVideo(null)}>닫기</Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default StudentClassroom;