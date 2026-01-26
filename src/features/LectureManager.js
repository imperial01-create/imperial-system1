import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, Search, BookOpen, PenTool, Video, Users, Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot, query, serverTimestamp, where, getDocs, getDoc } from 'firebase/firestore';
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

    return (
        <div className="p-4 border rounded-xl bg-white shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <span className="font-bold text-lg">{currentDate.getMonth() + 1}월</span>
                <div className="flex gap-1">
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={20}/></button>
                    <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={20}/></button>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-400 mb-2">{DAYS.map(d => <div key={d}>{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
                {getDays(currentDate).map((d, i) => {
                    if (!d) return <div key={i} />;
                    const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    const hasLecture = lectures.some(l => l.date === dStr);
                    const isSelected = dStr === selectedDate;
                    
                    return (
                        <button key={i} onClick={() => onDateChange(dStr)} 
                            className={`h-10 rounded-lg flex flex-col items-center justify-center relative transition-all 
                            ${isSelected ? 'bg-blue-600 text-white font-bold' : 'hover:bg-gray-50 text-gray-700'} 
                            ${isToday(d) && !isSelected ? 'text-blue-600 font-bold' : ''}`}>
                            <span>{d.getDate()}</span>
                            {hasLecture && <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-green-500'}`} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// --- Admin Component ---
export const AdminLectureManager = ({ users }) => {
    const [classes, setClasses] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newClass, setNewClass] = useState({ name: '', days: [], lecturerId: '', studentIds: [] });
    const [studentSearch, setStudentSearch] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
        return onSnapshot(q, (s) => setClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, []);

    const handleCreateClass = async () => {
        if(!newClass.name) return alert('반 이름을 입력하세요');
        if(!newClass.lecturerId) return alert('담당 강사를 선택하세요');
        
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), {
            ...newClass, createdAt: serverTimestamp()
        });
        setIsModalOpen(false); setNewClass({ name: '', days: [], lecturerId: '', studentIds: [] });
    };

    const toggleArrayItem = (field, value) => {
        setNewClass(prev => ({
            ...prev, [field]: prev[field].includes(value) ? prev[field].filter(v => v !== value) : [...prev[field], value]
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">반(Class) 관리</h2>
                <Button onClick={() => setIsModalOpen(true)} icon={Plus}>반 생성</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classes.map(cls => (
                    <Card key={cls.id}>
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg">{cls.name}</h3>
                            <button onClick={async () => { if(window.confirm('삭제 시 복구 불가합니다.')) await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', cls.id)) }} className="text-gray-400 hover:text-red-500"><Trash2 size={18}/></button>
                        </div>
                        <div className="flex gap-1 mb-3">
                            {cls.days.map(d => <span key={d} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">{d}</span>)}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-1"><Users size={14}/> 학생 {cls.studentIds?.length || 0}명</div>
                        <div className="text-sm text-gray-500 mt-1">강사: {users.find(u => u.id === cls.lecturerId)?.name || '미정'}</div>
                    </Card>
                ))}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="클래스 설정">
                <div className="space-y-4">
                    <input className="w-full border p-3 rounded-xl" placeholder="반 이름 (예: 고1 수학 A반)" value={newClass.name} onChange={e => setNewClass({...newClass, name: e.target.value})} />
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">담당 강사</label>
                        <select className="w-full border p-3 rounded-xl bg-white" value={newClass.lecturerId} onChange={e => setNewClass({...newClass, lecturerId: e.target.value})}>
                            <option value="">선택</option>
                            {users.filter(u => u.role === 'lecturer').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">수업 요일</label>
                        <div className="flex gap-2 flex-wrap">
                            {DAYS.map(d => (
                                <button key={d} onClick={() => toggleArrayItem('days', d)} className={`px-3 py-2 rounded-lg text-sm transition-colors ${newClass.days.includes(d) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{d}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-2">학생 배정</label>
                        <div className="relative mb-2">
                             <input className="w-full border p-2 pl-8 rounded-lg text-sm" placeholder="학생 검색" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                             <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                        </div>
                        <div className="max-h-40 overflow-y-auto border rounded-xl p-2 divide-y custom-scrollbar">
                            {users.filter(u => u.role === 'student' && u.name.includes(studentSearch)).map(u => {
                                const isSelected = newClass.studentIds.includes(u.id);
                                return (
                                    <div key={u.id} className={`flex items-center p-2 hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`} onClick={() => toggleArrayItem('studentIds', u.id)}>
                                        <div className={`w-5 h-5 mr-3 rounded-full flex items-center justify-center border ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>{isSelected && <Check size={14} className="text-white" />}</div>
                                        <span>{u.name} ({u.userId})</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <Button className="w-full" onClick={handleCreateClass}>저장하기</Button>
                </div>
            </Modal>
        </div>
    );
};

// --- Lecturer Component ---
export const LecturerDashboard = ({ currentUser }) => {
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [lectures, setLectures] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingLecture, setEditingLecture] = useState({});
    const [completions, setCompletions] = useState([]);
    const [studentsInClass, setStudentsInClass] = useState([]);

    // 1. 담당 반 목록 조회
    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), where('lecturerId', '==', currentUser.id));
        return onSnapshot(q, (s) => {
            const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
            setClasses(list);
            if(list.length > 0 && !selectedClass) setSelectedClass(list[0]);
        });
    }, [currentUser]);

    // 2. 선택된 반의 강의 목록 조회
    useEffect(() => {
        if (!selectedClass) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', '==', selectedClass.id));
        const unsubLectures = onSnapshot(q, (s) => setLectures(s.docs.map(d => ({ id: d.id, ...d.data() }))));
        
        // 학생 정보 조회 (수강 확인용)
        if (selectedClass.studentIds?.length > 0) {
            // Firestore 'in' limit is 10, better to fetch all users and filter locally or use batch if many students
            // Simplified: Fetch all users first (cached in App.js) or fetch specifically. 
            // For efficiency here, we assume user data is available or we fetch explicitly.
            // Let's just fetch relevant students for display.
            const fetchStudents = async () => {
                // This part assumes we have a way to get student names. 
                // In a real app with many students, we might need a better way.
                // Here we simply query the users collection by IDs (chunked if needed)
                const students = [];
                // Simple workaround for demo: fetch all students and filter. 
                // Production: Use 'in' queries with batches.
                const userQ = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), where('role', '==', 'student'));
                const snap = await getDocs(userQ);
                snap.forEach(d => {
                    if (selectedClass.studentIds.includes(d.id)) students.push({ id: d.id, ...d.data() });
                });
                setStudentsInClass(students);
            };
            fetchStudents();
        } else {
            setStudentsInClass([]);
        }

        return () => unsubLectures();
    }, [selectedClass]);

    // 3. 수강 현황 조회 (해당 반의 모든 강의에 대한 완료 기록)
    useEffect(() => {
        if(!lectures.length) return;
        // Optimization: Fetch completions only for displayed lectures or current view
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lecture_completions')); // Broad for now, can be optimized
        return onSnapshot(q, (s) => setCompletions(s.docs.map(d => d.data())));
    }, [lectures]);

    const handleSaveLecture = async () => {
        const data = {
            classId: selectedClass.id,
            date: editingLecture.date || selectedDate,
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

    const currentLectures = lectures.filter(l => l.date === selectedDate);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Class & Calendar */}
            <div className="space-y-6">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <label className="block text-sm font-bold text-gray-500 mb-2">담당 반 선택</label>
                    <select className="w-full p-3 border rounded-xl bg-gray-50 font-bold text-gray-800 outline-none" value={selectedClass?.id || ''} onChange={e => setSelectedClass(classes.find(c => c.id === e.target.value))}>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <LectureCalendar selectedDate={selectedDate} onDateChange={setSelectedDate} lectures={lectures} />
            </div>

            {/* Right: Lecture Details */}
            <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-xl text-gray-800">{selectedDate.split('-')[2]}일 강의 관리</h3>
                    <Button size="sm" icon={Plus} onClick={() => { setEditingLecture({ date: selectedDate }); setIsEditModalOpen(true); }}>강의 추가</Button>
                </div>

                {currentLectures.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">등록된 강의가 없습니다.</div>
                ) : (
                    currentLectures.map(lec => (
                        <Card key={lec.id}>
                            <div className="flex justify-between items-start mb-4 border-b pb-3">
                                <div>
                                    <h4 className="font-bold text-lg text-gray-900">진도: {lec.progress}</h4>
                                    <p className="text-sm text-gray-500">숙제: {lec.homework}</p>
                                </div>
                                <button onClick={() => { setEditingLecture(lec); setIsEditModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg"><Edit2 size={18}/></button>
                            </div>
                            
                            {/* 수강 현황 */}
                            <div>
                                <h5 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-1"><CheckCircle size={12}/> 수강 현황</h5>
                                <div className="flex flex-wrap gap-2">
                                    {studentsInClass.map(std => {
                                        const isDone = completions.some(c => c.lectureId === lec.id && c.studentId === std.id);
                                        return (
                                            <span key={std.id} className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${isDone ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                                                {std.name} {isDone && <Check size={10} strokeWidth={4}/>}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="강의 정보 입력">
                <div className="space-y-4">
                    <div><label className="text-xs font-bold text-gray-500">진도 내용</label><input className="w-full border p-3 rounded-xl mt-1" value={editingLecture.progress || ''} onChange={e => setEditingLecture({...editingLecture, progress: e.target.value})} placeholder="예: 3단원 인수분해 완료"/></div>
                    <div><label className="text-xs font-bold text-gray-500">숙제 내용</label><input className="w-full border p-3 rounded-xl mt-1" value={editingLecture.homework || ''} onChange={e => setEditingLecture({...editingLecture, homework: e.target.value})} placeholder="예: p.30~45 문제풀이"/></div>
                    <div><label className="text-xs font-bold text-gray-500">유튜브 링크</label><input className="w-full border p-3 rounded-xl mt-1" value={editingLecture.youtubeLink || ''} onChange={e => setEditingLecture({...editingLecture, youtubeLink: e.target.value})} placeholder="https://youtu.be/..."/></div>
                    <Button className="w-full" onClick={handleSaveLecture}>저장하기</Button>
                </div>
            </Modal>
        </div>
    );
};