import React, { useState, useEffect } from 'react';
import { 
    Plus, Trash2, Edit2, Check, Search, BookOpen, PenTool, Video, Users, 
    ChevronLeft, ChevronRight, Loader, CheckCircle, X, Youtube, Link as LinkIcon 
} from 'lucide-react';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, 
    query, where, onSnapshot, serverTimestamp, getDocs 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// --- Helper: Simple Calendar ---
const LectureCalendar = ({ selectedDate, onDateChange, lectures }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    
    const getDays = (d) => {
        const y = d.getFullYear(), m = d.getMonth();
        const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
        const days = [];
        for (let i = 0; i < first.getDay(); i++) days.push(null);
        for (let i = 1; i <= last.getDate(); i++) days.push(new Date(y, m, i));
        return days;
    };

    const isToday = (d) => {
        const today = new Date();
        return d && d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
    };

    const handlePrev = () => {
        const d = new Date(currentDate); d.setDate(1); d.setMonth(d.getMonth()-1); setCurrentDate(d);
    };
    const handleNext = () => {
        const d = new Date(currentDate); d.setDate(1); d.setMonth(d.getMonth()+1); setCurrentDate(d);
    };

    return (
        <div className="p-4 md:p-6 border rounded-2xl bg-white shadow-sm w-full">
            <div className="flex justify-between items-center mb-6">
                <span className="font-bold text-lg md:text-xl text-gray-800">{currentDate.getMonth() + 1}월</span>
                <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                    <button onClick={handlePrev} className="p-1 hover:bg-white rounded shadow-sm transition-all"><ChevronLeft size={20}/></button>
                    <button onClick={handleNext} className="p-1 hover:bg-white rounded shadow-sm transition-all"><ChevronRight size={20}/></button>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs md:text-sm font-bold text-gray-400 mb-2">{DAYS.map(d => <div key={d}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">
                {getDays(currentDate).map((d, i) => {
                    if (!d) return <div key={i} />;
                    const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    const hasLecture = lectures.some(l => l.date === dStr);
                    const isSelected = dStr === selectedDate;
                    
                    return (
                        <button key={i} onClick={() => onDateChange(dStr)} 
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all 
                            ${isSelected ? 'bg-blue-600 text-white font-bold shadow-md scale-105' : 'hover:bg-gray-50 text-gray-700'} 
                            ${isToday(d) && !isSelected ? 'text-blue-600 font-bold bg-blue-50' : ''}`}>
                            <span className="text-sm md:text-base">{d.getDate()}</span>
                            {hasLecture && <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-green-500'}`} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// --- Lecture Management Panel ---
const LectureManagementPanel = ({ selectedClass, users }) => {
    const [lectures, setLectures] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isLectureModalOpen, setIsLectureModalOpen] = useState(false);
    const [editingLecture, setEditingLecture] = useState(null);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        round: '',
        progress: '',
        homework: '',
        youtubeLink: '',
        youtubeLinks: [''],
        proofImageUrl: '' 
    });
    const [completions, setCompletions] = useState([]);
    const [studentsInClass, setStudentsInClass] = useState([]);

    useEffect(() => {
        if (!selectedClass?.id) return;
        const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'),
            where('classId', '==', selectedClass.id)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const lectureList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            lectureList.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLectures(lectureList);
        });
        
        if (selectedClass.studentIds?.length > 0 && users && users.length > 0) {
            setStudentsInClass(users.filter(u => u.role === 'student' && selectedClass.studentIds.includes(u.id)));
        } else {
            setStudentsInClass([]);
        }

        return () => unsub();
    }, [selectedClass, users]);

    const currentLectures = lectures.filter(l => l.date === selectedDate);

    useEffect(() => {
        if (currentLectures.length === 0) {
            setCompletions([]);
            return;
        }
        const lectureIds = currentLectures.map(l => l.id);
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions'), where('lectureId', 'in', lectureIds));
        const unsub = onSnapshot(q, (s) => setCompletions(s.docs.map(d => d.data())));
        return () => unsub();
    }, [selectedDate, currentLectures.length]);

    const handleOpenModal = (lecture = null) => {
        if (lecture) {
            setEditingLecture(lecture);
            setFormData({
                date: lecture.date,
                round: lecture.round,
                progress: lecture.progress,
                homework: lecture.homework,
                youtubeLink: lecture.youtubeLink || '',
                youtubeLinks: lecture.youtubeLinks || [lecture.youtubeLink || ''],
                proofImageUrl: lecture.proofImageUrl || '' 
            });
        } else {
            setEditingLecture(null);
            setFormData({
                date: new Date().toISOString().split('T')[0],
                round: (lectures.length + 1) + '회차',
                progress: '',
                homework: '',
                youtubeLink: '',
                youtubeLinks: [''],
                proofImageUrl: '' 
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

    const handleAddLink = () => setFormData(p => ({ ...p, youtubeLinks: [...(p.youtubeLinks || []), ''] }));
    const handleLinkChange = (i, v) => {
        const n = [...(formData.youtubeLinks || [''])];
        n[i] = v;
        setFormData(p => ({ ...p, youtubeLinks: n }));
    };
    const handleRemoveLink = (i) => setFormData(p => ({ ...p, youtubeLinks: p.youtubeLinks.filter((_, idx) => idx !== i) }));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full animate-in fade-in">
            <div className="space-y-6 w-full">
                 <LectureCalendar selectedDate={selectedDate} onDateChange={setSelectedDate} lectures={lectures} />
            </div>
            
            <div className="lg:col-span-2 space-y-4 w-full">
                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <PenTool size={18} className="text-blue-600"/> 
                        {selectedDate.split('-')[2]}일 강의 목록
                    </h3>
                    <Button size="sm" onClick={() => handleOpenModal()} icon={Plus}>강의 추가</Button>
                </div>

                {/* Mobile Card List */}
                <div className="block md:hidden space-y-3">
                    {currentLectures.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-xl">해당 날짜에 강의가 없습니다.</div>
                    ) : (
                        currentLectures.map(lecture => (
                            <div key={lecture.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
                                <div className="flex justify-between items-start border-b border-gray-100 pb-2">
                                    <div>
                                        <span className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-md font-bold mb-1">{lecture.round}</span>
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
                                    {lecture.proofImageUrl && (
                                        <div className="flex gap-2 items-center text-blue-600 bg-blue-50 p-2 rounded-lg mt-1">
                                            <LinkIcon size={16}/> <span className="font-bold text-xs truncate max-w-[200px]">인증 사진 링크 등록됨</span>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-gray-50 p-2 rounded-lg mt-1">
                                    <h5 className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><Users size={12}/> 수강 현황 ({completions.filter(c=>c.lectureId===lecture.id).length}/{studentsInClass.length})</h5>
                                    <div className="flex flex-wrap gap-1">
                                        {studentsInClass.map(std => {
                                            const isDone = completions.some(c => c.lectureId === lecture.id && c.studentId === std.id);
                                            return <span key={std.id} className={`text-[10px] px-1.5 py-0.5 rounded border ${isDone ? 'bg-green-100 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-400'}`}>{std.name}</span>
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* PC Table View */}
                <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b text-gray-500">
                            <tr>
                                <th className="p-3 w-20">회차</th>
                                <th className="p-3">진도 내용</th>
                                <th className="p-3">숙제</th>
                                <th className="p-3 w-20 text-center">인증</th>
                                <th className="p-3 w-24 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {currentLectures.map(lecture => (
                                <tr key={lecture.id} className="hover:bg-gray-50">
                                    <td className="p-3 text-blue-600 font-bold">{lecture.round}</td>
                                    <td className="p-3 max-w-xs truncate" title={lecture.progress}>{lecture.progress}</td>
                                    <td className="p-3 max-w-xs truncate" title={lecture.homework}>{lecture.homework}</td>
                                    <td className="p-3 text-center">
                                        {lecture.proofImageUrl ? <CheckCircle size={18} className="mx-auto text-green-500"/> : <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleOpenModal(lecture)} className="text-gray-400 hover:text-blue-600"><Edit2 size={16}/></button>
                                            <button onClick={() => handleDeleteLecture(lecture.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {currentLectures.length === 0 && (
                                <tr><td colSpan="5" className="p-8 text-center text-gray-400">해당 날짜에 강의가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
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
                        <label className="text-sm font-bold text-gray-600 mb-1 block flex items-center gap-1"><LinkIcon size={14} className="text-green-600"/> 인증 사진 링크 (선택)</label>
                        <input type="text" className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors" value={formData.proofImageUrl} onChange={e => setFormData({...formData, proofImageUrl: e.target.value})} placeholder="Google Drive 공유 링크 또는 이미지 URL" />
                        <p className="text-xs text-gray-400 mt-1 ml-1">* 서버 용량 절약을 위해 사진을 직접 업로드하지 않고, 링크를 붙여넣어 주세요.</p>
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 flex justify-between">영상 링크 <button onClick={handleAddLink} className="text-blue-600">+추가</button></label>
                        {formData.youtubeLinks.map((link, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                                <input type="text" className="w-full border p-3 rounded-xl" value={link} onChange={e => handleLinkChange(idx, e.target.value)} placeholder="https://youtu.be/..." />
                                {idx === formData.youtubeLinks.length - 1 ? (
                                    <button onClick={() => setFormData({...formData, youtubeLinks: [...formData.youtubeLinks, '']})} className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Plus size={20}/></button>
                                ) : (
                                    <button onClick={() => handleRemoveLink(idx)} className="p-3 bg-red-50 text-red-600 rounded-xl"><Trash2 size={20}/></button>
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

// --- Admin & Lecturer Unified Component ---
export const AdminLectureManager = ({ users }) => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [isClassModalOpen, setIsClassModalOpen] = useState(false);
    const [editingClassId, setEditingClassId] = useState(null);
    const [newClass, setNewClass] = useState({ name: '', days: [], lecturerId: '', studentIds: [] });
    const [studentSearch, setStudentSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
        return onSnapshot(q, (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, []);

    const handleOpenCreateClass = () => {
        setNewClass({ name: '', days: [], lecturerId: '', studentIds: [] });
        setEditingClassId(null);
        setIsClassModalOpen(true);
    };

    const handleOpenEditClass = (e, cls) => {
        e.stopPropagation();
        setNewClass({
            name: cls.name,
            days: cls.days || [],
            lecturerId: cls.lecturerId || '',
            studentIds: cls.studentIds || []
        });
        setEditingClassId(cls.id);
        setIsClassModalOpen(true);
    };

    const handleSaveClass = async () => {
        if (!newClass.name.trim()) return alert('반 이름을 입력하세요');
        if (!newClass.lecturerId) return alert('담당 강사를 선택하세요');
        setIsSaving(true);
        try {
            const payload = { ...newClass, updatedAt: serverTimestamp() };
            if (editingClassId) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', editingClassId), payload);
            } else {
                payload.createdAt = serverTimestamp();
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), payload);
            }
            setIsClassModalOpen(false);
        } catch (e) { alert(e.message); } finally { setIsSaving(false); }
    };

    const toggleArrayItem = (field, value) => {
        setNewClass(prev => ({ ...prev, [field]: prev[field].includes(value) ? prev[field].filter(v => v !== value) : [...prev[field], value] }));
    };

    const handleDeleteClass = async (e, classId) => {
        e.stopPropagation();
        if (window.confirm('반을 삭제하면 포함된 강의 기록도 모두 사라집니다. 계속하시겠습니까?')) {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', classId));
            if (selectedClass?.id === classId) setSelectedClass(null);
        }
    };

    return (
        // [핵심 수정] 패딩 제거 및 w-full 적용
        <div className="space-y-8 w-full animate-in fade-in">
            {/* 1. Class Management Section */}
            <div className="w-full">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">반(Class) 목록</h2>
                    <Button onClick={handleOpenCreateClass} icon={Plus} className="w-full md:w-auto">반 생성</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
                    {classes.map(cls => (
                        <div key={cls.id} onClick={() => setSelectedClass(cls)} className={`p-5 rounded-2xl border cursor-pointer transition-all ${selectedClass?.id === cls.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:shadow-md'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg">{cls.name}</h3>
                                <div className="flex gap-1">
                                    <button onClick={(e) => handleOpenEditClass(e, cls)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><Edit2 size={16}/></button>
                                    <button onClick={(e) => handleDeleteClass(e, cls.id)} className="p-1.5 hover:bg-red-50 rounded text-red-400"><Trash2 size={16}/></button>
                                </div>
                            </div>
                            <div className="flex gap-1 mb-2 flex-wrap">
                                {cls.days.map(d => <span key={d} className="bg-white border border-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{d}</span>)}
                            </div>
                            <div className="text-sm text-gray-500">강사: {users.find(u => u.id === cls.lecturerId)?.name}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. Lecture Management Section */}
            {selectedClass ? (
                <div className="border-t pt-8 animate-in slide-in-from-bottom-4 w-full">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2"><PenTool className="text-blue-600"/> {selectedClass.name} 강의 관리</h2>
                    <LectureManagementPanel selectedClass={selectedClass} users={users} />
                </div>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed text-gray-400 w-full">
                    관리할 반을 선택해주세요.
                </div>
            )}

            {/* Create/Edit Class Modal */}
            <Modal isOpen={isClassModalOpen} onClose={() => setIsClassModalOpen(false)} title={editingClassId ? "반 수정" : "반 생성"}>
                <div className="space-y-4 w-full">
                    <input className="w-full border p-3 rounded-xl" placeholder="반 이름" value={newClass.name} onChange={e => setNewClass({...newClass, name: e.target.value})} />
                    <div>
                        <label className="text-xs font-bold text-gray-500">담당 강사</label>
                        <select className="w-full border p-3 rounded-xl bg-white" value={newClass.lecturerId} onChange={e => setNewClass({...newClass, lecturerId: e.target.value})}>
                            <option value="">선택</option>
                            {users.filter(u => u.role === 'lecturer').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">요일</label>
                        <div className="flex gap-2 flex-wrap">{DAYS.map(d => <button key={d} onClick={() => toggleArrayItem('days', d)} className={`px-3 py-2 rounded-lg text-sm ${newClass.days.includes(d) ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{d}</button>)}</div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">학생 배정</label>
                        <input className="w-full border p-2 mb-2 rounded-lg text-sm" placeholder="이름 검색" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                        <div className="max-h-40 overflow-y-auto border rounded-xl divide-y">
                            {users.filter(u => u.role === 'student' && u.name.includes(studentSearch)).map(u => (
                                <div key={u.id} onClick={() => toggleArrayItem('studentIds', u.id)} className={`p-2 flex items-center cursor-pointer ${newClass.studentIds.includes(u.id) ? 'bg-blue-50' : ''}`}>
                                    <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${newClass.studentIds.includes(u.id) ? 'bg-blue-600 border-blue-600' : ''}`}>{newClass.studentIds.includes(u.id) && <Check size={10} className="text-white"/>}</div>
                                    <span className="text-sm">{u.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Button className="w-full" onClick={handleSaveClass} disabled={isSaving}>{isSaving ? <Loader className="animate-spin"/> : '저장'}</Button>
                </div>
            </Modal>
        </div>
    );
};

// [수정] 강사 계정 뷰 복구 및 빈 화면 방지
export const LecturerDashboard = ({ currentUser, users }) => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), where('lecturerId', '==', currentUser.id));
        const unsub = onSnapshot(q, (s) => {
            const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setClasses(list);
            if(list.length > 0 && !selectedClass) setSelectedClass(list[0]);
            setLoading(false);
        });
        return () => unsub();
    }, [currentUser]); // 의존성 단순화

    if (loading) return <div className="flex justify-center items-center h-64"><Loader className="animate-spin text-blue-600"/></div>;

    return (
        // [핵심 수정] 패딩 제거 및 w-full 적용
        <div className="space-y-6 w-full animate-in fade-in">
            {classes.length > 0 ? (
                <>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {classes.map(c => (
                            <button key={c.id} onClick={() => setSelectedClass(c)} className={`px-4 py-2 rounded-xl border whitespace-nowrap transition-all ${selectedClass?.id === c.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white hover:bg-gray-50'}`}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                    {selectedClass ? (
                        <LectureManagementPanel selectedClass={selectedClass} users={users} />
                    ) : (
                        <div className="text-center py-12 text-gray-500">선택된 반이 없습니다.</div>
                    )}
                </>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed text-gray-400">
                    담당하는 반이 없습니다. 관리자에게 문의하세요.
                </div>
            )}
        </div>
    );
};

export default AdminLectureManager;