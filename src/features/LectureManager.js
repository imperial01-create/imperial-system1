import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, Search, BookOpen, PenTool, Video } from 'lucide-react';
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const getLocalToday = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

export const AdminLectureManager = ({ users }) => {
    const [classes, setClasses] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newClass, setNewClass] = useState({ name: '', days: [], lecturerId: '' });
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [studentSearch, setStudentSearch] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
        return onSnapshot(q, (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, []);

    const handleCreateClass = async () => {
        if(!newClass.name) return alert('반 이름을 입력하세요');
        if(!newClass.lecturerId) return alert('담당 강사를 선택하세요');

        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), {
            ...newClass, studentIds: selectedStudents, createdAt: serverTimestamp()
        });
        setIsModalOpen(false); setNewClass({ name: '', days: [], lecturerId: '' }); setSelectedStudents([]);
    };

    const toggleDay = (day) => {
        setNewClass(prev => ({
            ...prev, days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">강의 및 반 관리</h2>
                <Button onClick={() => setIsModalOpen(true)} icon={Plus}>반 생성</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classes.map(cls => (
                    <Card key={cls.id} className="hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg">{cls.name}</h3>
                            <button onClick={async () => { if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', cls.id)) }} className="text-gray-400 hover:text-red-500"><Trash2 size={18}/></button>
                        </div>
                        <div className="flex gap-1 mb-3">
                            {cls.days.map(d => <span key={d} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{d}</span>)}
                        </div>
                        <div className="text-sm text-gray-500">배정된 학생: {cls.studentIds?.length || 0}명</div>
                        <div className="text-sm text-gray-400 mt-1">
                             강사: {users.find(u => u.id === cls.lecturerId)?.name || '미정'}
                        </div>
                    </Card>
                ))}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="새로운 반 생성">
                <div className="space-y-4">
                    <input className="w-full border p-3 rounded-xl" placeholder="반 이름 (예: 고1 수학 A반)" value={newClass.name} onChange={e => setNewClass({...newClass, name: e.target.value})} />
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">담당 강사</label>
                        <select className="w-full border p-3 rounded-xl bg-white" value={newClass.lecturerId} onChange={e => setNewClass({...newClass, lecturerId: e.target.value})}>
                            <option value="">강사 선택</option>
                            {users.filter(u => u.role === 'lecturer').map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">수업 요일</label>
                        <div className="flex gap-2 flex-wrap">
                            {DAYS.map(d => (
                                <button key={d} onClick={() => toggleDay(d)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${newClass.days.includes(d) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{d}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">학생 배정</label>
                        <div className="relative mb-2">
                             <input className="w-full border p-2 pl-8 rounded-lg text-sm" placeholder="학생 이름 검색" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                             <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                        </div>

                        <div className="max-h-40 overflow-y-auto border rounded-xl p-2 divide-y">
                            {users.filter(u => u.role === 'student' && u.name.includes(studentSearch)).map(u => {
                                const isSelected = selectedStudents.includes(u.id);
                                return (
                                    <div key={u.id} className={`flex items-center p-2 hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`} onClick={() => setSelectedStudents(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}>
                                        <div className={`w-5 h-5 mr-3 rounded-full flex items-center justify-center border ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                            {isSelected && <Check size={14} className="text-white" />}
                                        </div>
                                        <span>{u.name} ({u.userId})</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <Button className="w-full" onClick={handleCreateClass}>생성하기</Button>
                </div>
            </Modal>
        </div>
    );
};

export const LecturerDashboard = ({ currentUser }) => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [lectures, setLectures] = useState([]);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingLecture, setEditingLecture] = useState({});

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), where('lecturerId', '==', currentUser.id));
        return onSnapshot(q, (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [currentUser]);

    useEffect(() => {
        if (!selectedClass) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', '==', selectedClass.id));
        return onSnapshot(q, (s) => setLectures(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.date.localeCompare(a.date))));
    }, [selectedClass]);

    const handleSaveLecture = async () => {
        const data = {
            classId: selectedClass.id,
            date: editingLecture.date || getLocalToday(),
            progress: editingLecture.progress || '',
            homework: editingLecture.homework || '',
            youtubeLink: editingLecture.youtubeLink || '',
            updatedAt: serverTimestamp()
        };

        if (editingLecture.id) {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', editingLecture.id), data);
        } else {
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), data);
        }
        setIsEditModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 overflow-x-auto pb-2">
                {classes.map(cls => (
                    <button key={cls.id} onClick={() => setSelectedClass(cls)} className={`px-5 py-3 rounded-xl border whitespace-nowrap transition-all ${selectedClass?.id === cls.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {cls.name}
                    </button>
                ))}
            </div>

            {selectedClass ? (
                <>
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-xl">{selectedClass.name} 강의 기록</h3>
                        <Button size="sm" icon={Plus} onClick={() => { setEditingLecture({ date: getLocalToday() }); setIsEditModalOpen(true); }}>강의 기록 추가</Button>
                    </div>

                    <div className="space-y-4">
                        {lectures.map(lecture => (
                            <Card key={lecture.id} className="border-l-4 border-l-blue-500">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="font-bold text-lg text-gray-800">{lecture.date}</div>
                                    <button onClick={() => { setEditingLecture(lecture); setIsEditModalOpen(true); }} className="text-gray-400 hover:text-blue-600"><Edit2 size={18} /></button>
                                </div>
                                <div className="space-y-2 text-sm text-gray-600">
                                    <div className="flex gap-2"><BookOpen size={16} className="shrink-0 text-blue-600" /> <span className="font-medium text-gray-800">진도:</span> {lecture.progress}</div>
                                    <div className="flex gap-2"><PenTool size={16} className="shrink-0 text-purple-600" /> <span className="font-medium text-gray-800">숙제:</span> {lecture.homework}</div>
                                    {lecture.youtubeLink && <div className="flex gap-2"><Video size={16} className="shrink-0 text-red-600" /> <a href={lecture.youtubeLink} target="_blank" rel="noreferrer" className="text-blue-500 underline truncate">강의 영상 보기</a></div>}
                                </div>
                            </Card>
                        ))}
                    </div>
                </>
            ) : (
                <div className="text-center py-10 text-gray-500">
                    관리자가 배정한 반이 없습니다.
                </div>
            )}

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="강의 내용 입력">
                <div className="space-y-4">
                    <input type="date" className="w-full border rounded-lg p-3" value={editingLecture.date} onChange={e => setEditingLecture({...editingLecture, date: e.target.value})} />
                    <textarea placeholder="진도 내용" className="w-full border rounded-lg p-3 h-20" value={editingLecture.progress} onChange={e => setEditingLecture({...editingLecture, progress: e.target.value})} />
                    <textarea placeholder="숙제 내용" className="w-full border rounded-lg p-3 h-20" value={editingLecture.homework} onChange={e => setEditingLecture({...editingLecture, homework: e.target.value})} />
                    <input placeholder="YouTube 영상 링크" className="w-full border rounded-lg p-3" value={editingLecture.youtubeLink} onChange={e => setEditingLecture({...editingLecture, youtubeLink: e.target.value})} />
                    <Button className="w-full" onClick={handleSaveLecture}>저장하기</Button>
                </div>
            </Modal>
        </div>
    );
};