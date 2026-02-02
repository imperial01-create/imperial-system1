import React, { useState, useEffect } from 'react';
// [Import Check] 아이콘 완벽 확인
import { Plus, Trash2, Edit2, Check, Search, BookOpen, PenTool, Video, Users, ChevronLeft, ChevronRight, Loader, CheckCircle, X } from 'lucide-react';
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// LectureCalendar (Responsive Grid)
const LectureCalendar = ({ selectedDate, onDateChange, lectures }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // ... (getDays, isToday 등 기존 로직 동일) ...
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

const LectureManagementPanel = ({ selectedClass, users }) => {
    // ... (기존 로직 동일) ...
    const [lectures, setLectures] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingLecture, setEditingLecture] = useState({ progress: '', homework: '', youtubeLinks: [''] });
    const [completions, setCompletions] = useState([]);
    const [studentsInClass, setStudentsInClass] = useState([]);

    useEffect(() => {
        if (!selectedClass) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', '==', selectedClass.id));
        const unsub = onSnapshot(q, (s) => setLectures(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.date.localeCompare(a.date))));
        
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
        return onSnapshot(q, (s) => setCompletions(s.docs.map(d => d.data())));
    }, [selectedDate, lectures.length]);

    const handleAddLink = () => setEditingLecture(p => ({ ...p, youtubeLinks: [...(p.youtubeLinks || []), ''] }));
    const handleLinkChange = (i, v) => {
        const n = [...(editingLecture.youtubeLinks || [''])];
        n[i] = v;
        setEditingLecture(p => ({ ...p, youtubeLinks: n }));
    };
    const handleRemoveLink = (i) => setEditingLecture(p => ({ ...p, youtubeLinks: p.youtubeLinks.filter((_, idx) => idx !== i) }));

    const handleSave = async () => {
        const validLinks = (editingLecture.youtubeLinks || []).filter(l => l.trim() !== '');
        const data = {
            classId: selectedClass.id,
            date: editingLecture.date || selectedDate,
            progress: editingLecture.progress,
            homework: editingLecture.homework,
            youtubeLinks: validLinks,
            youtubeLink: validLinks[0] || '',
            updatedAt: serverTimestamp()
        };
        try {
            if (editingLecture.id) await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', editingLecture.id), data);
            else await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), data);
            setIsEditModalOpen(false);
        } catch (e) { alert('Error: ' + e.message); }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full animate-in fade-in">
            <div className="space-y-6 w-full">
                 <LectureCalendar selectedDate={selectedDate} onDateChange={setSelectedDate} lectures={lectures} />
            </div>
            
            <div className="lg:col-span-2 space-y-4 w-full">
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 w-full">
                    <h3 className="font-bold text-xl text-gray-800">{selectedDate.split('-')[2]}일 강의</h3>
                    <Button size="sm" icon={Plus} onClick={() => { setEditingLecture({ date: selectedDate, progress: '', homework: '', youtubeLinks: [''] }); setIsEditModalOpen(true); }}>강의 추가</Button>
                </div>

                {currentLectures.length === 0 ? <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200 w-full">등록된 강의가 없습니다.</div> : 
                    currentLectures.map(lec => (
                        <Card key={lec.id} className="w-full">
                            <div className="flex justify-between items-start mb-4 border-b pb-3">
                                <div className="flex-1 w-full overflow-hidden">
                                    <div className="font-bold text-lg mb-1 flex items-center gap-2"><BookOpen size={18} className="text-blue-600"/> 진도</div>
                                    <div className="whitespace-pre-wrap text-gray-800 mb-3 pl-2 border-l-2 border-blue-100 break-words">{lec.progress}</div>
                                    <div className="font-bold text-lg mb-1 flex items-center gap-2"><PenTool size={18} className="text-purple-600"/> 숙제</div>
                                    <div className="whitespace-pre-wrap text-gray-800 pl-2 border-l-2 border-purple-100 break-words">{lec.homework}</div>
                                    {(lec.youtubeLinks || [lec.youtubeLink]).filter(Boolean).map((link, i) => (
                                        <div key={i} className="mt-2 text-sm text-red-600 flex items-center gap-1 bg-red-50 w-fit px-2 py-1 rounded truncate max-w-full"><Video size={14}/> 영상 {i+1} 등록됨</div>
                                    ))}
                                </div>
                                <div className="flex gap-1 ml-2">
                                    <button onClick={() => { setEditingLecture({...lec, youtubeLinks: lec.youtubeLinks || (lec.youtubeLink ? [lec.youtubeLink] : [''])}); setIsEditModalOpen(true); }} className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-blue-600"><Edit2 size={18}/></button>
                                    <button onClick={async () => { if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', lec.id)) }} className="p-2 bg-gray-50 rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={18}/></button>
                                </div>
                            </div>
                            <div>
                                <h5 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-1"><CheckCircle size={12}/> 수강 현황 ({completions.filter(c=>c.lectureId===lec.id).length}/{studentsInClass.length})</h5>
                                <div className="flex flex-wrap gap-2">
                                    {studentsInClass.map(std => {
                                        const isDone = completions.some(c => c.lectureId === lec.id && c.studentId === std.id);
                                        return <span key={std.id} className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${isDone ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>{std.name} {isDone && <CheckCircle size={10}/>}</span>
                                    })}
                                </div>
                            </div>
                        </Card>
                    ))
                }
            </div>

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="강의 내용 수정">
                <div className="space-y-4 w-full">
                    <div><label className="text-xs font-bold text-gray-500">진도</label><textarea className="w-full border p-3 rounded-xl mt-1 h-20" value={editingLecture.progress} onChange={e => setEditingLecture({...editingLecture, progress: e.target.value})} /></div>
                    <div><label className="text-xs font-bold text-gray-500">숙제</label><textarea className="w-full border p-3 rounded-xl mt-1 h-20" value={editingLecture.homework} onChange={e => setEditingLecture({...editingLecture, homework: e.target.value})} /></div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 flex justify-between">영상 링크 <button onClick={handleAddLink} className="text-blue-600">+추가</button></label>
                        {editingLecture.youtubeLinks?.map((link, i) => (
                            <div key={i} className="flex gap-2 mb-2">
                                <input className="w-full border p-2 rounded-lg" value={link} onChange={e => handleLinkChange(i, e.target.value)} placeholder="https://youtu.be/..."/>
                                {editingLecture.youtubeLinks.length > 1 && <button onClick={() => handleRemoveLink(i)} className="text-red-400"><X size={20}/></button>}
                            </div>
                        ))}
                    </div>
                    <Button className="w-full" onClick={handleSave}>저장하기</Button>
                </div>
            </Modal>
        </div>
    );
};

// --- Admin Unified Component (Responsive Grid Fix) ---
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

    return (
        <div className="space-y-8 w-full max-w-[1600px] mx-auto animate-in fade-in">
            {/* 1. Class Management Section */}
            <div className="w-full">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">반(Class) 목록</h2>
                    <Button onClick={handleOpenCreateClass} icon={Plus} className="w-full md:w-auto">반 생성</Button>
                </div>
                {/* [UI 수정] 모바일 grid-cols-1 */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
                    {classes.map(cls => (
                        <div key={cls.id} onClick={() => setSelectedClass(cls)} className={`p-5 rounded-2xl border cursor-pointer transition-all ${selectedClass?.id === cls.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:shadow-md'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-lg">{cls.name}</h3>
                                <div className="flex gap-1">
                                    <button onClick={(e) => handleOpenEditClass(e, cls)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><Edit2 size={16}/></button>
                                    <button onClick={async (e) => { e.stopPropagation(); if(window.confirm('삭제?')) await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', cls.id)) }} className="p-1.5 hover:bg-red-50 rounded text-red-400"><Trash2 size={16}/></button>
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

export const LecturerDashboard = ({ currentUser, users }) => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), where('lecturerId', '==', currentUser.id));
        return onSnapshot(q, (s) => {
            const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setClasses(list);
            if(list.length > 0 && !selectedClass) setSelectedClass(list[0]);
        });
    }, [currentUser]);

    return (
        <div className="space-y-6 w-full max-w-[1600px] mx-auto animate-in fade-in">
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
                <div className="text-center py-12 text-gray-500">담당하는 반이 없습니다.</div>
            )}
        </div>
    );
};