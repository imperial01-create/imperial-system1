import React, { useState, useEffect } from 'react';
import { 
    Plus, Search, Calendar, Clock, Video, FileText, 
    MoreVertical, Trash2, Edit2, CheckCircle, XCircle, PenTool, Youtube 
} from 'lucide-react';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, 
    query, where, onSnapshot, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// --- [내부 컴포넌트] 강의 관리 패널 (모바일 카드 뷰 적용 완료) ---
const LectureManagementPanel = ({ selectedClass, users }) => {
    const [lectures, setLectures] = useState([]);
    const [isLectureModalOpen, setIsLectureModalOpen] = useState(false);
    const [editingLecture, setEditingLecture] = useState(null);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        round: '',
        progress: '',
        homework: '',
        youtubeLink: '',
        youtubeLinks: ['']
    });

    // 강의 목록 불러오기
    useEffect(() => {
        if (!selectedClass?.id) return;
        const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'),
            where('classId', '==', selectedClass.id)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const lectureList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // 날짜 내림차순 정렬
            lectureList.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLectures(lectureList);
        });
 
        return () => unsubscribe();
    }, [selectedClass]);

    const handleOpenModal = (lecture = null) => {
        if (lecture) {
            setEditingLecture(lecture);
            setFormData({
                date: lecture.date,
                round: lecture.round,
                progress: lecture.progress,
                homework: lecture.homework,
                youtubeLink: lecture.youtubeLink || '',
                youtubeLinks: lecture.youtubeLinks || [lecture.youtubeLink || '']
            });
        } else {
            setEditingLecture(null);
            setFormData({
                date: new Date().toISOString().split('T')[0],
                round: (lectures.length + 1) + '회차',
                progress: '',
                homework: '',
                youtubeLink: '',
                youtubeLinks: ['']
            });
        }
        setIsLectureModalOpen(true);
    };

    const handleSaveLecture = async () => {
        try {
            const lectureData = {
                classId: selectedClass.id,
                className: selectedClass.name,
                ...formData,
                updatedAt: serverTimestamp()
            };
            if (editingLecture) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', editingLecture.id), lectureData);
            } else {
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), {
                    ...lectureData,
                    createdAt: serverTimestamp()
                });
            }
            setIsLectureModalOpen(false);
        } catch (error) {
            console.error("Error saving lecture:", error);
            alert("저장 중 오류가 발생했습니다.");
        }
    };

    const handleDeleteLecture = async (id) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', id));
        }
    };

    return (
        <div className="space-y-4 w-full">
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <PenTool size={18} className="text-blue-600"/> 
                    강의 목록 <span className="text-sm text-gray-500 font-normal">({lectures.length})</span>
                </h3>
                <Button size="sm" onClick={() => handleOpenModal()} icon={Plus}>강의 추가</Button>
            </div>

            {/* [핵심 수정 1] 모바일 전용 뷰 (Card List) - md:hidden */}
            <div className="block md:hidden space-y-3">
                {lectures.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-xl">등록된 강의가 없습니다.</div>
                ) : (
                    lectures.map(lecture => (
                        <div key={lecture.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
                            <div className="flex justify-between items-start border-b border-gray-100 pb-2">
                                <div>
                                    <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-md font-bold mb-1">
                                        {lecture.round}
                                    </span>
                                    <div className="font-bold text-gray-900">{lecture.date}</div>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => handleOpenModal(lecture)} className="p-2 bg-gray-50 text-blue-600 rounded-lg"><Edit2 size={16}/></button>
                                    <button onClick={() => handleDeleteLecture(lecture.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={16}/></button>
                                </div>
                            </div>
                            
                            <div className="space-y-2 text-sm">
                                <div className="flex gap-2">
                                    <div className="w-6 shrink-0 text-gray-400"><FileText size={16}/></div>
                                    <div className="text-gray-700 break-all"><span className="font-bold text-gray-500 text-xs block">진도</span>{lecture.progress}</div>
                                </div>
                                <div className="flex gap-2">
                                    <div className="w-6 shrink-0 text-gray-400"><CheckCircle size={16}/></div>
                                    <div className="text-gray-700 break-all"><span className="font-bold text-gray-500 text-xs block">숙제</span>{lecture.homework}</div>
                                </div>
                                {lecture.youtubeLinks && lecture.youtubeLinks.some(link => link) && (
                                    <div className="flex gap-2 items-center text-red-600 bg-red-50 p-2 rounded-lg mt-1">
                                        <Youtube size={16}/> <span className="font-bold text-xs">영상 등록됨</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* [핵심 수정 2] PC 전용 뷰 (Table) - hidden md:block */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b text-gray-500">
                        <tr>
                            <th className="p-3 w-24">날짜</th>
                            <th className="p-3 w-20">회차</th>
                            <th className="p-3">진도 내용</th>
                            <th className="p-3">숙제</th>
                            <th className="p-3 w-20 text-center">영상</th>
                            <th className="p-3 w-24 text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {lectures.map(lecture => (
                            <tr key={lecture.id} className="hover:bg-gray-50">
                                <td className="p-3 font-medium">{lecture.date}</td>
                                <td className="p-3 text-blue-600 font-bold">{lecture.round}</td>
                                <td className="p-3 max-w-xs truncate" title={lecture.progress}>{lecture.progress}</td>
                                <td className="p-3 max-w-xs truncate" title={lecture.homework}>{lecture.homework}</td>
                                <td className="p-3 text-center">
                                    {lecture.youtubeLinks?.some(l=>l) ? <Youtube size={18} className="mx-auto text-red-500"/> : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="p-3 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => handleOpenModal(lecture)} className="text-gray-400 hover:text-blue-600"><Edit2 size={16}/></button>
                                        <button onClick={() => handleDeleteLecture(lecture.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {lectures.length === 0 && (
                            <tr><td colSpan="6" className="p-8 text-center text-gray-400">등록된 강의가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 강의 등록/수정 모달 */}
            <Modal isOpen={isLectureModalOpen} onClose={() => setIsLectureModalOpen(false)} title={editingLecture ? "강의 수정" : "새 강의 등록"}>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-sm font-bold text-gray-600 mb-1 block">수업 날짜</label>
                            <input type="date" className="w-full border p-3 rounded-xl" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                        </div>
                        <div className="flex-1">
                            <label className="text-sm font-bold text-gray-600 mb-1 block">회차</label>
                            <input type="text" className="w-full border p-3 rounded-xl" value={formData.round} onChange={e => setFormData({...formData, round: e.target.value})} placeholder="예: 1회차" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 block">진도 내용</label>
                        <textarea className="w-full border p-3 rounded-xl h-24 resize-none" value={formData.progress} onChange={e => setFormData({...formData, progress: e.target.value})} placeholder="수업한 내용을 입력하세요" />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 block">숙제</label>
                        <textarea className="w-full border p-3 rounded-xl h-24 resize-none" value={formData.homework} onChange={e => setFormData({...formData, homework: e.target.value})} placeholder="내주신 숙제를 입력하세요" />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 block">유튜브 링크</label>
                        {formData.youtubeLinks.map((link, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                                <input 
                                    type="text" 
                                    className="w-full border p-3 rounded-xl" 
                                    value={link} 
                                    onChange={e => {
                                        const newLinks = [...formData.youtubeLinks];
                                        newLinks[idx] = e.target.value;
                                        setFormData({...formData, youtubeLinks: newLinks});
                                    }} 
                                    placeholder="https://youtu.be/..." 
                                />
                                {idx === formData.youtubeLinks.length - 1 ? (
                                    <button onClick={() => setFormData({...formData, youtubeLinks: [...formData.youtubeLinks, '']})} className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Plus size={20}/></button>
                                ) : (
                                    <button onClick={() => {
                                        const newLinks = formData.youtubeLinks.filter((_, i) => i !== idx);
                                        setFormData({...formData, youtubeLinks: newLinks});
                                    }} className="p-3 bg-red-50 text-red-600 rounded-xl"><Trash2 size={20}/></button>
                                )}
                            </div>
                        ))}
                    </div>
                    <Button className="w-full py-4 text-lg mt-4" onClick={handleSaveLecture}>저장하기</Button>
                </div>
            </Modal>
        </div>
    );
};


// --- [메인 컴포넌트] 관리자 강의 매니저 ---
export const AdminLectureManager = ({ users }) => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [isClassModalOpen, setIsClassModalOpen] = useState(false);
    const [newClassName, setNewClassName] = useState('');

    // 반 목록 불러오기
    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setClasses(classList);
        });
        return () => unsubscribe();
    }, []);

    const handleCreateClass = async () => {
        if (!newClassName.trim()) return;
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), {
            name: newClassName,
            createdAt: serverTimestamp(),
            studentIds: []
        });
        setNewClassName('');
        setIsClassModalOpen(false);
    };

    const handleDeleteClass = async (e, classId) => {
        e.stopPropagation();
        if (window.confirm('반을 삭제하면 포함된 강의 기록도 모두 사라집니다. 계속하시겠습니까?')) {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', classId));
            if (selectedClass?.id === classId) setSelectedClass(null);
        }
    };

    return (
        // [핵심] w-full 적용
        <div className="space-y-6 w-full animate-in fade-in">
            {/* 상단: 반 목록 섹션 */}
            <div className="w-full">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-900">반(Class) 목록</h2>
                    <Button onClick={() => setIsClassModalOpen(true)} icon={Plus} size="sm">반 생성</Button>
                </div>
                
                {/* [핵심] grid-cols-1로 모바일 꽉 채우기 */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full">
                    {classes.map(cls => (
                        <div 
                            key={cls.id} 
                            onClick={() => setSelectedClass(cls)} 
                            className={`
                                p-4 md:p-5 rounded-2xl border cursor-pointer transition-all w-full relative group
                                ${selectedClass?.id === cls.id 
                                    ? 'bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-md' 
                                    : 'bg-white border-gray-200 shadow-sm hover:shadow-md'}
                            `}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <h3 className="font-bold text-lg text-gray-900 truncate pr-6">{cls.name}</h3>
                                <button 
                                    onClick={(e) => handleDeleteClass(e, cls.id)}
                                    className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <XCircle size={20} />
                                </button>
                            </div>
                            <div className="text-sm text-gray-500">
                                학생 관리 및 강의 업로드
                            </div>
                        </div>
                    ))}
                    {classes.length === 0 && (
                        <div className="col-span-1 md:col-span-3 lg:col-span-4 text-center py-8 text-gray-400 border-2 border-dashed rounded-xl">
                            생성된 반이 없습니다.
                        </div>
                    )}
                </div>
            </div>

            {/* 하단: 선택된 반의 강의 관리 패널 */}
            {selectedClass && (
                <div className="w-full border-t pt-6 mt-2 animate-in slide-in-from-bottom-2">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <span className="text-blue-600">{selectedClass.name}</span> 강의 관리
                    </h2>
                    {/* 분리한 컴포넌트 렌더링 */}
                    <LectureManagementPanel selectedClass={selectedClass} users={users} />
                </div>
            )}

            {/* 반 생성 모달 */}
            <Modal isOpen={isClassModalOpen} onClose={() => setIsClassModalOpen(false)} title="새로운 반 생성">
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 block">반 이름</label>
                        <input 
                            className="w-full border-2 rounded-xl p-3 text-lg focus:border-blue-500 outline-none" 
                            placeholder="예: 고3 미적분 A반" 
                            value={newClassName} 
                            onChange={e => setNewClassName(e.target.value)}
                        />
                    </div>
                    <Button className="w-full py-4 text-lg" onClick={handleCreateClass}>생성하기</Button>
                </div>
            </Modal>
        </div>
    );
};

// 강사 대시보드 (관리자와 동일하게 AdminLectureManager 재사용하거나 별도 구성)
export const LecturerDashboard = ({ currentUser, users }) => {
    // 강사 권한 로직이 필요하다면 여기에 추가. 현재는 Admin과 동일하게 보여줌.
    return <AdminLectureManager users={users} />;
};

const LectureManager = ({ currentUser, users }) => {
    return <AdminLectureManager users={users} />;
};

export default LectureManager;