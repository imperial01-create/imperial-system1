/* [서비스 가치] 글로벌 Context 데이터를 구독하여 Firebase 서버 요금을 극적으로 절감하고,
   학생 수강 이력(Enrollments)과 강의 일지의 출결 현황을 완벽하게 동기화합니다. */
import React, { useState, useMemo } from 'react';
import { 
    Plus, Trash2, Edit2, Check, Search, BookOpen, PenTool, Video, Users, 
    ChevronLeft, ChevronRight, Loader, CheckCircle, X, Youtube, Link as LinkIcon,
    FileText, Upload, Clock, Calendar, ChevronDown, AlertTriangle
} from 'lucide-react';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, 
    query, where, onSnapshot, serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

// 🚀 [CTO 패치] 글로벌 데이터 연결
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const parseCSV = (str) => {
    const result = [];
    let row = [];
    let inQuotes = false;
    let val = "";
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(val.trim());
            val = "";
        } else if (char === '\n' && !inQuotes) {
            row.push(val.trim());
            result.push(row);
            row = [];
            val = "";
        } else {
            if (char !== '\r') val += char;
        }
    }
    row.push(val.trim());
    if (row.length > 0 && row.some(v => v)) result.push(row);
    return result;
};

const cleanClassName = (rawName) => {
    if (!rawName) return '';
    return rawName.replace(/\(.*?\)/g, '').trim();
};

const cleanStudentName = (rawName) => {
    if (!rawName) return '';
    return rawName.replace(/^\[.*?\]\s*/, '').replace(/\s*\(.*?\)$/, '').trim();
};

const normalizeString = (str) => {
    return (str || '').replace(/\s+/g, '').toLowerCase();
};

const getMatchedMasterRoom = (rawRoom, masterRooms) => {
    if (!rawRoom) return '';
    const normRaw = normalizeString(rawRoom);
    const matched = masterRooms.find(r => normalizeString(r) === normRaw);
    return matched || rawRoom; 
};


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
const LectureManagementPanel = ({ selectedClass }) => {
    // 🚀 글로벌 데이터 엔진에서 꺼내 쓰기
    const { users, enrollments } = useData();

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

    // 🚀 [CTO 패치] 죽은 코드(studentIds) 대신 진짜 수강 이력(Enrollments) 데이터에서 내 반 학생 추출
    const studentsInClass = useMemo(() => {
        if (!selectedClass?.id) return [];
        const activeStudentIds = enrollments.filter(e => e.classId === selectedClass.id && e.status === 'active').map(e => e.studentId);
        return users.filter(u => u.role === 'student' && activeStudentIds.includes(u.id));
    }, [selectedClass, enrollments, users]);

    React.useEffect(() => {
        if (!selectedClass?.id) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', '==', selectedClass.id));
        const unsub = onSnapshot(q, (snapshot) => {
            const lectureList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            lectureList.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLectures(lectureList);
        });
        return () => unsub();
    }, [selectedClass]);

    const currentLectures = lectures.filter(l => l.date === selectedDate);

    React.useEffect(() => {
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
                date: lecture.date, round: lecture.round, progress: lecture.progress, homework: lecture.homework,
                youtubeLink: lecture.youtubeLink || '', youtubeLinks: lecture.youtubeLinks || [lecture.youtubeLink || ''], proofImageUrl: lecture.proofImageUrl || '' 
            });
        } else {
            setEditingLecture(null);
            setFormData({
                date: selectedDate, round: (lectures.length + 1) + '회차', progress: '', homework: '',
                youtubeLink: '', youtubeLinks: [''], proofImageUrl: '' 
            });
        }
        setIsLectureModalOpen(true);
    };

    const handleSaveLecture = async () => {
        try {
            const lectureData = { classId: selectedClass.id, className: selectedClass.name, ...formData, updatedAt: serverTimestamp() };
            if (editingLecture) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', editingLecture.id), lectureData);
            } else {
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), { ...lectureData, createdAt: serverTimestamp() });
            }
            setIsLectureModalOpen(false);
        } catch (error) { alert("저장 중 오류가 발생했습니다."); }
    };

    const handleDeleteLecture = async (id) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'lectures', id));
        }
    };

    const handleAddLink = () => setFormData(p => ({ ...p, youtubeLinks: [...(p.youtubeLinks || []), ''] }));
    const handleLinkChange = (i, v) => { const n = [...(formData.youtubeLinks || [''])]; n[i] = v; setFormData(p => ({ ...p, youtubeLinks: n })); };
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
                    <Button size="sm" onClick={() => handleOpenModal()} icon={Plus}>강의 일지 작성</Button>
                </div>

                <div className="block md:hidden space-y-3">
                    {currentLectures.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-xl">해당 날짜에 일지가 없습니다.</div>
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

                <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b text-gray-500">
                            <tr>
                                <th className="p-3 w-16">회차</th>
                                <th className="p-3">진도 내용</th>
                                <th className="p-3">숙제</th>
                                <th className="p-3 text-center w-20">인증</th>
                                <th className="p-3 w-48">수강 현황</th>
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
                                    <td className="p-3">
                                        <div className="flex flex-wrap gap-1">
                                            {studentsInClass.map(std => {
                                                const isDone = completions.some(c => c.lectureId === lecture.id && c.studentId === std.id);
                                                return <span key={std.id} className={`text-[10px] px-1.5 py-0.5 rounded border ${isDone ? 'bg-green-100 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-400'}`}>{std.name}</span>
                                            })}
                                        </div>
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
                                <tr><td colSpan="6" className="p-8 text-center text-gray-400">해당 날짜에 일지가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={isLectureModalOpen} onClose={() => setIsLectureModalOpen(false)} title={editingLecture ? "강의 일지 수정" : "새 강의 일지 등록"}>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="text-sm font-bold text-gray-600 mb-1 block">수업 날짜</label>
                            <input type="date" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                        </div>
                        <div className="flex-1">
                            <label className="text-sm font-bold text-gray-600 mb-1 block">회차</label>
                            <input type="text" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={formData.round} onChange={e => setFormData({...formData, round: e.target.value})} placeholder="예: 1회차" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 block">진도 내용</label>
                        <textarea className="w-full border p-3 rounded-xl h-24 resize-none outline-none focus:ring-2 focus:ring-blue-500" value={formData.progress} onChange={e => setFormData({...formData, progress: e.target.value})} placeholder="수업한 내용을 입력하세요" />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 block">숙제</label>
                        <textarea className="w-full border p-3 rounded-xl h-24 resize-none outline-none focus:ring-2 focus:ring-blue-500" value={formData.homework} onChange={e => setFormData({...formData, homework: e.target.value})} placeholder="내주신 숙제를 입력하세요" />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 flex items-center gap-1"><LinkIcon size={14} className="text-green-600"/> 판서/현장 인증 사진 링크 (선택)</label>
                        <input type="text" className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-green-500 transition-colors" value={formData.proofImageUrl} onChange={e => setFormData({...formData, proofImageUrl: e.target.value})} placeholder="Google Drive 공유 링크 또는 이미지 URL" />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-600 mb-1 flex justify-between">복습용 영상 링크 <button onClick={handleAddLink} className="text-blue-600">+추가</button></label>
                        {formData.youtubeLinks.map((link, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                                <input type="text" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500" value={link} onChange={e => handleLinkChange(idx, e.target.value)} placeholder="https://youtu.be/..." />
                                {idx === formData.youtubeLinks.length - 1 ? (
                                    <button onClick={() => setFormData({...formData, youtubeLinks: [...formData.youtubeLinks, '']})} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"><Plus size={20}/></button>
                                ) : (
                                    <button onClick={() => handleRemoveLink(idx)} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"><Trash2 size={20}/></button>
                                )}
                            </div>
                        ))}
                    </div>
                    <Button className="w-full py-4 text-lg mt-4 font-bold" onClick={handleSaveLecture}>일지 저장하기</Button>
                </div>
            </Modal>
        </div>
    );
};

// --- Admin Unified Component ---
export const AdminLectureManager = () => {
    // 🚀 글로벌 데이터 엔진에서 꺼내 쓰기
    const { users, classes, masterData, loadingData } = useData();
    
    const [selectedLecturerId, setSelectedLecturerId] = useState(null);
    const [selectedClass, setSelectedClass] = useState(null);
    
    const [isClassModalOpen, setIsClassModalOpen] = useState(false);
    const [editingClassId, setEditingClassId] = useState(null);
    const [newClass, setNewClass] = useState({ name: '', lecturerId: '', schedules: [] });
    const [isSaving, setIsSaving] = useState(false);

    const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
    const [csvLecturerFile, setCsvLecturerFile] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const lecturers = useMemo(() => {
        return users.filter(u => u.role === 'lecturer' || u.role === 'admin' || u.role === 'ta').sort((a,b) => a.name.localeCompare(b.name));
    }, [users]);

    const orphanedClasses = useMemo(() => {
        return classes.filter(c => !c.lecturerId || !lecturers.some(l => l.id === c.lecturerId));
    }, [classes, lecturers]);

    const displayedClasses = useMemo(() => {
        if (!selectedLecturerId) return [];
        if (selectedLecturerId === 'UNASSIGNED_ORPHANS') {
            return orphanedClasses;
        }
        return classes.filter(c => c.lecturerId === selectedLecturerId);
    }, [classes, selectedLecturerId, orphanedClasses]);

    const handleSelectLecturer = (lecturerId) => {
        setSelectedLecturerId(lecturerId);
        setSelectedClass(null); 
    };

    const handleOpenCreateClass = () => {
        const defaultLecturerId = selectedLecturerId === 'UNASSIGNED_ORPHANS' ? '' : selectedLecturerId;
        setNewClass({ 
            name: '', 
            lecturerId: defaultLecturerId, 
            schedules: [{ dayOfWeek: '월', startTime: '18:00', endTime: '20:00', room: '' }] 
        });
        setEditingClassId(null);
        setIsClassModalOpen(true);
    };

    const handleOpenEditClass = (e, cls) => {
        e.stopPropagation();
        
        let initialSchedules = cls.schedules || [];
        if (initialSchedules.length === 0 && cls.days && cls.days.length > 0) {
            let sTime = "18:00", eTime = "20:00";
            if (cls.time && cls.time.includes('~')) {
                const pts = cls.time.split('~');
                sTime = pts[0].trim(); eTime = pts[1].trim();
            }
            initialSchedules = cls.days.map(d => ({
                dayOfWeek: d,
                startTime: sTime,
                endTime: eTime,
                room: cls.classroom || ''
            }));
        }

        setNewClass({
            name: cls.name,
            lecturerId: cls.lecturerId || '',
            schedules: initialSchedules
        });
        setEditingClassId(cls.id);
        setIsClassModalOpen(true);
    };

    const handleAddScheduleRow = () => {
        setNewClass(prev => ({
            ...prev,
            schedules: [...prev.schedules, { dayOfWeek: '월', startTime: '18:00', endTime: '20:00', room: '' }]
        }));
    };

    const handleScheduleChange = (index, field, value) => {
        setNewClass(prev => {
            const updated = [...prev.schedules];
            updated[index][field] = value;
            return { ...prev, schedules: updated };
        });
    };

    const handleRemoveScheduleRow = (index) => {
        setNewClass(prev => {
            const updated = [...prev.schedules];
            updated.splice(index, 1);
            return { ...prev, schedules: updated };
        });
    };

    const handleSaveClass = async () => {
        if (!newClass.name.trim()) return alert('반 이름을 입력하세요');
        if (!newClass.lecturerId) return alert('담당 강사를 선택하세요');
        if (newClass.schedules.length === 0) return alert('최소 1개의 스케줄(요일/시간)을 등록해주세요.');

        setIsSaving(true);
        try {
            const payload = { 
                name: newClass.name.trim(),
                lecturerId: newClass.lecturerId,
                schedules: newClass.schedules,
                updatedAt: serverTimestamp() 
            };
            
            if (editingClassId) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', editingClassId), payload);
                if (selectedLecturerId === 'UNASSIGNED_ORPHANS' && displayedClasses.length === 1) {
                    setSelectedLecturerId(null);
                }
            } else {
                payload.createdAt = serverTimestamp();
                // 🚀 [CTO 패치] 죽은 코드(studentIds: [])를 만들지 않음. 이제 모든 학생관리는 Enrollments가 함.
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), payload);
            }
            setIsClassModalOpen(false);
        } catch (e) { alert(e.message); } finally { setIsSaving(false); }
    };

    const handleDeleteClass = async (e, classId) => {
        e.stopPropagation();
        if (window.confirm('반을 삭제하면 포함된 강의 기록도 모두 사라집니다. 계속하시겠습니까?')) {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', classId));
            if (selectedClass?.id === classId) setSelectedClass(null);
            if (selectedLecturerId === 'UNASSIGNED_ORPHANS' && displayedClasses.length === 1) {
                setSelectedLecturerId(null);
            }
        }
    };

    const readCsvFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'UTF-8');
        });
    };

    const handleSyncCsv = async () => {
        if (!csvLecturerFile) {
            return alert("업로드할 CSV 파일을 선택해주세요.");
        }
        
        setIsSyncing(true);
        try {
            const lecturerRaw = await readCsvFile(csvLecturerFile);
            const lecturerData = parseCSV(lecturerRaw);

            const parsedClasses = {};
            let currentTeacherName = '';
            const DAYS_OF_WEEK = ['월', '화', '수', '목', '금', '토', '일'];

            lecturerData.forEach((row) => {
                if (row.length === 0) return;
                
                if (row[0] && row[0].startsWith('* 강사명')) {
                    currentTeacherName = row[0].replace('* 강사명', '').replace(':', '').trim();
                    return;
                }

                const timeStr = row[0];
                if (timeStr && timeStr.includes('~')) {
                    const timeParts = timeStr.split('~');
                    const startTime = timeParts[0].trim();
                    const endTime = timeParts[1].trim();

                    for (let col = 1; col <= 7; col++) {
                        const cell = row[col];
                        if (cell) {
                            const lines = cell.split('\n').map(l => l.trim()).filter(l => l);
                            if (lines.length >= 2) {
                                const rawClassName = lines[1];
                                const rawClassroom = lines[2] || '';
                                
                                const className = cleanClassName(rawClassName);
                                const classroom = getMatchedMasterRoom(rawClassroom, masterData.classrooms);
                                const day = DAYS_OF_WEEK[col - 1];

                                if (className) {
                                    if (!parsedClasses[className]) {
                                        parsedClasses[className] = {
                                            name: className,
                                            lecturerName: currentTeacherName,
                                            schedules: []
                                        };
                                    }
                                    
                                    if (!parsedClasses[className].schedules.some(s => s.dayOfWeek === day && s.startTime === startTime)) {
                                        parsedClasses[className].schedules.push({
                                            dayOfWeek: day,
                                            startTime: startTime,
                                            endTime: endTime,
                                            room: classroom
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const batch = writeBatch(db);
            let writeCount = 0;

            const existingClassesMap = {};
            classes.forEach(c => { existingClassesMap[c.name] = c; });

            Object.values(parsedClasses).forEach(newClsData => {
                const matchedLecturers = lecturers.filter(u => u.name === newClsData.lecturerName);
                let safeLecturerId = '';
                
                if (matchedLecturers.length === 1) {
                    safeLecturerId = matchedLecturers[0].id;
                } else if (matchedLecturers.length > 1) {
                    console.warn(`동명이인 강사 감지됨: ${newClsData.lecturerName}. 오류 탭으로 이동합니다.`);
                }

                const existing = existingClassesMap[newClsData.name];
                
                if (existing) {
                    const classRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', existing.id);
                    batch.update(classRef, {
                        lecturerId: safeLecturerId || existing.lecturerId, 
                        schedules: newClsData.schedules, 
                        updatedAt: serverTimestamp()
                    });
                    writeCount++;
                } else {
                    const classRef = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
                    batch.set(classRef, {
                        name: newClsData.name,
                        lecturerId: safeLecturerId,
                        schedules: newClsData.schedules,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    writeCount++;
                }
            });

            if (writeCount > 0) {
                await batch.commit();
                alert(`시간표 완전 동기화가 완료되었습니다! (적용된 반: ${writeCount}개)\n\n* 동명이인 강사나 미등록 강사의 반은 [미배정/오류 클래스] 탭에서 확인해주세요.`);
            } else {
                alert("적용할 반 데이터가 없습니다. 파일을 다시 확인해주세요.");
            }
            
            setIsCsvModalOpen(false);
            setCsvLecturerFile(null);

        } catch (error) {
            console.error("CSV Sync Error:", error);
            alert("파일 동기화 중 오류가 발생했습니다. 파일 형식을 확인해주세요.");
        } finally {
            setIsSyncing(false);
        }
    };

    if (loadingData) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="space-y-6 w-full animate-in fade-in h-[85vh] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm shrink-0 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookOpen className="text-blue-600"/> 클래스 마스터 관리</h2>
                    <p className="text-gray-500 text-sm mt-1">학원의 모든 반과 스케줄을 강사별로 직관적으로 관리합니다.</p>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" onClick={() => setIsCsvModalOpen(true)} icon={Upload} className="w-full md:w-auto bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 font-bold">
                        통통통 시간표 덮어쓰기
                    </Button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                <div className="w-full lg:w-1/4 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col shrink-0 min-h-[300px]">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
                        <h3 className="font-bold text-gray-800">강사 목록</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        
                        <button 
                            onClick={() => handleSelectLecturer('UNASSIGNED_ORPHANS')} 
                            className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between mb-2 border-2 ${selectedLecturerId === 'UNASSIGNED_ORPHANS' ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-white hover:bg-gray-50 border-gray-100'}`}
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-black shrink-0">
                                    <AlertTriangle size={16}/>
                                </div>
                                <span className={`font-bold ${selectedLecturerId === 'UNASSIGNED_ORPHANS' ? 'text-red-900' : 'text-gray-800'}`}>미배정/오류 클래스</span>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${orphanedClasses.length > 0 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                                {orphanedClasses.length}개
                            </span>
                        </button>
                        
                        <hr className="my-2 border-gray-100"/>

                        {lecturers.map(lecturer => {
                            const myClassesCount = classes.filter(c => c.lecturerId === lecturer.id).length;
                            return (
                                <button 
                                    key={lecturer.id} 
                                    onClick={() => handleSelectLecturer(lecturer.id)} 
                                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between mb-1 ${selectedLecturerId === lecturer.id ? 'bg-blue-50 border border-blue-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black uppercase shrink-0">
                                            {lecturer.name[0]}
                                        </div>
                                        <span className={`font-bold ${selectedLecturerId === lecturer.id ? 'text-blue-900' : 'text-gray-800'}`}>{lecturer.name}</span>
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${myClassesCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                                        {myClassesCount}개
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden relative">
                    {!selectedLecturerId ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
                            <Users size={48} className="opacity-20" />
                            <p className="font-bold text-lg">좌측에서 강사를 선택해주세요.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full absolute inset-0">
                            <div className={`p-4 border-b border-gray-100 flex justify-between items-center shrink-0 ${selectedLecturerId === 'UNASSIGNED_ORPHANS' ? 'bg-red-50/50' : 'bg-blue-50/30'}`}>
                                <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
                                    {selectedLecturerId === 'UNASSIGNED_ORPHANS' ? (
                                        <><span className="text-red-600">미배정/오류</span> 클래스 목록</>
                                    ) : (
                                        <><span className="text-blue-600">{lecturers.find(l => l.id === selectedLecturerId)?.name}</span> 강사님의 배정 클래스</>
                                    )}
                                </h3>
                                {selectedLecturerId !== 'UNASSIGNED_ORPHANS' && (
                                    <Button size="sm" onClick={handleOpenCreateClass} icon={Plus} className="font-bold shadow-md">새 반 개설</Button>
                                )}
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50/50">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {displayedClasses.length === 0 ? (
                                        <div className="col-span-full text-center py-12 text-gray-400 font-bold border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                                            {selectedLecturerId === 'UNASSIGNED_ORPHANS' 
                                                ? "🎉 미배정되거나 오류가 있는 반이 없습니다! 모든 데이터가 완벽합니다."
                                                : "개설된 반이 없습니다. 우측 상단 버튼을 눌러 개설해주세요."}
                                        </div>
                                    ) : (
                                        displayedClasses.map(cls => {
                                            const displaySchedules = cls.schedules || [];
                                            return (
                                                <div key={cls.id} className={`bg-white rounded-2xl border-2 transition-all overflow-hidden flex flex-col h-full ${selectedClass?.id === cls.id ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-gray-100 hover:border-blue-300'}`}>
                                                    <div className="p-4 cursor-pointer" onClick={() => setSelectedClass(cls)}>
                                                        <div className="flex justify-between items-start mb-3">
                                                            <h3 className="font-black text-lg text-gray-800 break-keep leading-tight">{cls.name}</h3>
                                                            <div className="flex gap-1 shrink-0">
                                                                <button onClick={(e) => handleOpenEditClass(e, cls)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"><Edit2 size={16}/></button>
                                                                <button onClick={(e) => handleDeleteClass(e, cls.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="space-y-1.5 min-h-[60px]">
                                                            {displaySchedules.length === 0 ? (
                                                                <div className="text-xs text-gray-400 font-bold bg-gray-50 p-2 rounded-lg text-center">등록된 스케줄이 없습니다.</div>
                                                            ) : (
                                                                displaySchedules.map((s, idx) => (
                                                                    <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-2 rounded-xl text-xs">
                                                                        <span className="w-5 h-5 flex items-center justify-center bg-blue-100 text-blue-700 font-black rounded-md shrink-0">{s.dayOfWeek}</span>
                                                                        <span className="font-bold text-gray-700 flex items-center gap-1"><Clock size={12} className="text-gray-400"/> {s.startTime}~{s.endTime}</span>
                                                                        <span className="text-gray-500 font-semibold ml-auto border border-gray-200 bg-white px-2 py-0.5 rounded-full truncate max-w-[80px]" title={s.room}>{s.room || '미정'}</span>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                </div>

                                {selectedClass && selectedLecturerId !== 'UNASSIGNED_ORPHANS' && (
                                    <div className="mt-6 border-t border-gray-200 pt-6 animate-in slide-in-from-bottom-4">
                                        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2"><PenTool className="text-blue-600"/> <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-lg">{selectedClass.name}</span> 일지 및 숙제 기록</h2>
                                        <LectureManagementPanel selectedClass={selectedClass} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Modal isOpen={isClassModalOpen} onClose={() => setIsClassModalOpen(false)} title={editingClassId ? "클래스 정보 수정" : "새로운 클래스 마스터 개설"}>
                <div className="space-y-5 w-full bg-gray-50 p-2 md:p-4 rounded-xl">
                    
                    <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div>
                            <label className="text-xs font-bold text-blue-600 mb-1.5 block">강의명 (반 이름)</label>
                            <div className="relative">
                                <input 
                                    list="subject-options"
                                    className="w-full border-2 border-gray-200 p-3.5 rounded-xl font-bold text-gray-900 focus:border-blue-500 focus:ring-0 outline-none transition-colors" 
                                    placeholder="예: 고1 수학(상) 정규반" 
                                    value={newClass.name} 
                                    onChange={e => setNewClass({...newClass, name: e.target.value})} 
                                />
                                <datalist id="subject-options">
                                    {masterData.subjects.map((sub, idx) => <option key={idx} value={sub} />)}
                                </datalist>
                                <p className="text-[10px] text-gray-400 mt-1">* 환경설정의 과목명과 조합하여 직접 입력하실 수 있습니다.</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-blue-600 mb-1.5 block">담당 강사</label>
                            <select className={`w-full border-2 border-gray-200 p-3.5 rounded-xl font-bold bg-white outline-none transition-colors ${!newClass.lecturerId ? 'text-red-500 border-red-300 focus:border-red-500' : 'text-gray-700 focus:border-blue-500'}`} value={newClass.lecturerId} onChange={e => setNewClass({...newClass, lecturerId: e.target.value})}>
                                <option value="">강사를 선택해주세요 (필수)</option>
                                {lecturers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Calendar size={16} className="text-blue-600"/> 정규 스케줄 뼈대 설정</label>
                            <button onClick={handleAddScheduleRow} className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"><Plus size={14}/> 스케줄 추가</button>
                        </div>
                        
                        <div className="space-y-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                            {newClass.schedules.map((sch, idx) => (
                                <div key={idx} className="flex flex-col md:flex-row gap-2 md:gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 relative group">
                                    <button onClick={() => handleRemoveScheduleRow(idx)} className="absolute -top-2 -right-2 bg-white border border-red-200 text-red-500 hover:bg-red-500 hover:text-white rounded-full p-1 shadow-sm transition-all opacity-100 md:opacity-0 group-hover:opacity-100"><X size={14}/></button>
                                    
                                    <div className="w-full md:w-20 shrink-0">
                                        <label className="text-[10px] font-bold text-gray-500 mb-1 block">요일</label>
                                        <select className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-white" value={sch.dayOfWeek} onChange={e => handleScheduleChange(idx, 'dayOfWeek', e.target.value)}>
                                            {DAYS.map(d => <option key={d} value={d}>{d}요일</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1 flex gap-2">
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-500 mb-1 block">시작 시간</label>
                                            <input type="time" className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-white" value={sch.startTime} onChange={e => handleScheduleChange(idx, 'startTime', e.target.value)} />
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-500 mb-1 block">종료 시간</label>
                                            <input type="time" className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-white" value={sch.endTime} onChange={e => handleScheduleChange(idx, 'endTime', e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="w-full md:w-32 shrink-0">
                                        <label className="text-[10px] font-bold text-gray-500 mb-1 block">강의실</label>
                                        <select className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-white" value={sch.room} onChange={e => handleScheduleChange(idx, 'room', e.target.value)}>
                                            <option value="">미정/선택</option>
                                            {masterData.classrooms.map((room, rIdx) => <option key={rIdx} value={room}>{room}</option>)}
                                            {sch.room && !masterData.classrooms.includes(sch.room) && <option value={sch.room}>{sch.room} (이전 데이터)</option>}
                                        </select>
                                    </div>
                                </div>
                            ))}
                            {newClass.schedules.length === 0 && <div className="text-center py-6 text-sm text-gray-400 font-bold">등록된 스케줄이 없습니다. 상단의 추가 버튼을 눌러주세요.</div>}
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button className="w-full py-4 text-lg font-black shadow-lg" onClick={handleSaveClass} disabled={isSaving}>
                            {isSaving ? <Loader className="animate-spin mx-auto"/> : '클래스 마스터 저장'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isCsvModalOpen} onClose={() => !isSyncing && setIsCsvModalOpen(false)} title="시간표 덮어쓰기 (동기화)">
                <div className="space-y-6 w-full">
                    <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800">
                        <p className="font-bold mb-2 flex items-center gap-1"><BookOpen size={16}/> 시간표 덮어쓰기 안내</p>
                        <div className="opacity-90 leading-relaxed space-y-1">
                            <p>• <b>통통통 &gt; 학사관리 &gt; 반 &gt; 시간/강의실 현황</b> 엑셀(CSV) 파일을 올려주세요.</p>
                            <p>• 기존 반의 <span className="font-bold text-red-500">시간표만 완벽하게 덮어쓰기</span> 됩니다. (과거 일지 보존)</p>
                            <p>• 학년 및 괄호 속 내용은 자동으로 정제됩니다.</p>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-bold text-gray-700 mb-2 block">강사별 현황 (CSV)</label>
                        <input 
                            type="file" 
                            accept=".csv"
                            onChange={e => setCsvLecturerFile(e.target.files[0])}
                            className="w-full border p-3 rounded-xl bg-gray-50 cursor-pointer" 
                        />
                    </div>

                    <Button 
                        className="w-full py-4 text-lg" 
                        onClick={handleSyncCsv} 
                        disabled={isSyncing}
                    >
                        {isSyncing ? <Loader className="animate-spin mx-auto"/> : '시간표 완벽 덮어쓰기 실행'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export const LecturerDashboard = ({ currentUser }) => {
    // 🚀 글로벌 데이터 엔진에서 꺼내 쓰기
    const { classes: allClasses, users } = useData();
    const [selectedClass, setSelectedClass] = useState(null);

    const myClasses = useMemo(() => {
        if (!currentUser) return [];
        return allClasses.filter(c => c.lecturerId === currentUser.id);
    }, [allClasses, currentUser]);

    useEffect(() => {
        if(myClasses.length > 0 && !selectedClass) setSelectedClass(myClasses[0]);
    }, [myClasses, selectedClass]);

    return (
        <div className="space-y-6 w-full animate-in fade-in">
            {myClasses.length > 0 ? (
                <>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {myClasses.map(c => (
                            <button key={c.id} onClick={() => setSelectedClass(c)} className={`px-4 py-2 rounded-xl border whitespace-nowrap transition-all font-bold ${selectedClass?.id === c.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                    {selectedClass ? (
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                            <LectureManagementPanel selectedClass={selectedClass} />
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">선택된 반이 없습니다.</div>
                    )}
                </>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-300 text-gray-400">
                    <BookOpen size={48} className="mx-auto mb-3 opacity-20"/>
                    <p className="font-bold">담당하는 반이 없습니다. 관리자에게 문의하세요.</p>
                </div>
            )}
        </div>
    );
};

export default AdminLectureManager;