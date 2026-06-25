/* [서비스 가치] 글로벌 Context 데이터를 구독하여 Firebase 서버 요금을 극적으로 절감하고,
   학생 수강 이력(Enrollments)과 강의 일지의 출결 현황을 완벽하게 동기화합니다.
   (🚀 CTO 패치: 하드코딩된 시즌을 폐기하고, 환경설정(Settings) 마스터 데이터를 구독하여 
   오늘 날짜(Today)를 분석, 현재 학원의 운영 시즌을 자동으로 선택해주는 'Auto-Routing 타임머신 엔진'을 이식했습니다.) */

import React, { useState, useMemo, useEffect } from 'react';
import { 
    Plus, Trash2, Edit2, Check, Search, BookOpen, PenTool, Video, Users, 
    ChevronLeft, ChevronRight, Loader, CheckCircle, X, Youtube, Link as LinkIcon,
    FileText, Upload, Clock, Calendar, ChevronDown, AlertTriangle, ClipboardList,
    CalendarDays, Filter, Inbox, CheckSquare, XSquare, Send, Copy, Map
} from 'lucide-react';
import { 
    collection, addDoc, updateDoc, deleteDoc, doc, 
    query, where, onSnapshot, serverTimestamp, writeBatch, getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';
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

const normalizeString = (str) => {
    return (str || '').replace(/\s+/g, '').toLowerCase();
};

const getMatchedMasterRoom = (rawRoom, masterRooms) => {
    if (!rawRoom) return '';
    const normRaw = normalizeString(rawRoom);
    const matched = (masterRooms || []).find(r => {
        const rName = typeof r === 'string' ? r : r.name;
        return normalizeString(rName) === normRaw;
    });
    return matched ? (typeof matched === 'string' ? matched : matched.name) : rawRoom; 
};

// 🚀 시뮬레이터 절대좌표 엔진 설정 (오후 1시 ~ 밤 11시)
const SIM_START_HOUR = 13; 
const SIM_END_HOUR = 23;
const HOUR_HEIGHT = 80;

const getSimTop = (timeStr) => {
    if(!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return ((h - SIM_START_HOUR) + (m / 60)) * HOUR_HEIGHT;
};

const getSimHeight = (start, end) => {
    if(!start || !end) return HOUR_HEIGHT;
    return getSimTop(end) - getSimTop(start);
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
        const d = new Date(currentDate); d.setDate(1); d.setMonth(d.getMonth()-1);
        setCurrentDate(d);
    };
    const handleNext = () => {
        const d = new Date(currentDate);
        d.setDate(1); d.setMonth(d.getMonth()+1); setCurrentDate(d);
    };

    return (
        <div className="p-4 md:p-6 border rounded-2xl bg-white shadow-sm w-full">
            <div className="flex justify-between items-center mb-6">
                <span className="font-bold text-lg md:text-xl text-gray-800">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
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
                    const hasLecture = (lectures || []).some(l => l.date === dStr);
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

const LectureManagementPanel = ({ selectedClass }) => {
    const { users = [], enrollments = [] } = useData();
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

    const [isClinicModalOpen, setIsClinicModalOpen] = useState(false);
    const [clinicTargetStudent, setClinicTargetStudent] = useState('');
    const [clinicTargetDate, setClinicTargetDate] = useState(new Date().toISOString().split('T')[0]);
    const [clinicDayTotalCount, setClinicDayTotalCount] = useState(0);
    const [clinicItems, setClinicItems] = useState(['']);
    const [isClinicSaving, setIsClinicSaving] = useState(false);

    const studentsInClass = useMemo(() => {
        if (!selectedClass?.id) return [];
        const activeStudentIds = (enrollments || []).filter(e => e?.classId === selectedClass.id && e?.status === 'active').map(e => e.studentId);
        return (users || []).filter(u => u?.role === 'student' && activeStudentIds.includes(u.id));
    }, [selectedClass, enrollments, users]);

    useEffect(() => {
        if (!selectedClass?.id) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'lectures'), where('classId', '==', selectedClass.id));
        const unsub = onSnapshot(q, (snapshot) => {
            const lectureList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            lectureList.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLectures(lectureList);
        });
        return () => unsub();
    }, [selectedClass]);

    const currentLectures = (lectures || []).filter(l => l?.date === selectedDate);

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

    useEffect(() => {
        if (!isClinicModalOpen) return;
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks'), where('targetDate', '==', clinicTargetDate));
        getDocs(q).then(snap => setClinicDayTotalCount(snap.size)).catch(err => console.error(err));
    }, [clinicTargetDate, isClinicModalOpen]);

    const handleOpenClinicModal = () => {
        setClinicTargetStudent(studentsInClass[0]?.id || '');
        setClinicTargetDate(new Date().toISOString().split('T')[0]);
        setClinicItems(['']);
        setIsClinicModalOpen(true);
    };

    const handleSaveClinicTask = async () => {
        const filteredItems = clinicItems.filter(i => i.trim() !== '');
        if (!clinicTargetStudent) return alert('대상 학생을 선택해주세요.');
        if (filteredItems.length === 0) return alert('최소 1개 이상의 과제/미션을 추가해주세요.');

        setIsClinicSaving(true);
        try {
            const studentObj = studentsInClass.find(s => s.id === clinicTargetStudent);
            const docId = `${clinicTargetStudent}_${clinicTargetDate}_${selectedClass.id}`;
            
            const taskPayload = {
                studentId: clinicTargetStudent,
                studentName: studentObj?.name || '미지정',
                classId: selectedClass.id,
                className: selectedClass.name,
                lecturerId: selectedClass.lecturerId,
                targetDate: clinicTargetDate,
                items: filteredItems.map(content => ({ taskContent: content, isCompleted: false, incompleteDetails: '' })),
                callStatus: 'pending',
                attendanceStatus: 'waiting',
                finalComment: '',
                updatedAt: serverTimestamp()
            };
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks', docId), taskPayload)
                .catch(async () => {
                    await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks'), { ...taskPayload, createdAt: serverTimestamp() });
                });
            alert(`${studentObj?.name} 학생에게 클리닉 임무가 배정되어 조교 관리 창으로 인수인계되었습니다.`);
            setIsClinicModalOpen(false);
        } catch (e) {
            alert('클리닉 배정 실패: ' + e.message);
        } finally {
            setIsClinicSaving(false);
        }
    };

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
                date: selectedDate, round: ((lectures || []).length + 1) + '회차', progress: '', homework: '',
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
    const handleRemoveLink = (i) => setFormData(p => ({ ...p, youtubeLinks: (p.youtubeLinks || []).filter((_, idx) => idx !== i) }));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full animate-in fade-in">
            <div className="space-y-6 w-full">
                 <LectureCalendar selectedDate={selectedDate} onDateChange={setSelectedDate} lectures={lectures || []} />
            </div>
            
            <div className="lg:col-span-2 space-y-4 w-full">
                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <PenTool size={18} className="text-blue-600"/> 
                        {selectedDate.split('-')[2]}일 강의 목록
                    </h3>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={handleOpenClinicModal} icon={ClipboardList} className="border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 hidden md:flex">개별 클리닉 지시</Button>
                        <Button size="sm" onClick={() => handleOpenModal()} icon={Plus}>강의 일지 작성</Button>
                    </div>
                </div>

                <div className="block md:hidden">
                    <Button size="sm" variant="outline" onClick={handleOpenClinicModal} icon={ClipboardList} className="w-full border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100">개별 클리닉 지시</Button>
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
                                    <h5 className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><Users size={12}/> 수강 현황 ({(completions || []).filter(c=>c.lectureId===lecture.id).length}/{studentsInClass.length})</h5>
                                    <div className="flex flex-wrap gap-1">
                                        {studentsInClass.map(std => {
                                            const isDone = (completions || []).some(c => c.lectureId === lecture.id && c.studentId === std.id);
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
                                                const isDone = (completions || []).some(c => c.lectureId === lecture.id && c.studentId === std.id);
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

            <Modal isOpen={isClinicModalOpen} onClose={() => setIsClinicModalOpen(false)} title={`[${selectedClass.name}] 개별 클리닉/보충 지시`}>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-600 mb-1 block">대상 학생 선택</label>
                        <select className="w-full border p-3 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold" value={clinicTargetStudent} onChange={e => setClinicTargetStudent(e.target.value)}>
                            {studentsInClass.map(s => <option key={s.id} value={s.id}>{s.name} 학생</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3 items-center">
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1 block">보충 수행 날짜</label>
                            <input type="date" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold" value={clinicTargetDate} onChange={e => setClinicTargetDate(e.target.value)} />
                        </div>
                        <div className="bg-gray-50 border p-3 rounded-xl mt-4 flex items-center gap-2">
                            <Users className="text-indigo-600 shrink-0" size={18} />
                            <div>
                                <div className="text-[10px] font-bold text-gray-400">당일 원내 총 예약</div>
                                <div className="text-sm font-black text-gray-800"><span className="text-indigo-600">{clinicDayTotalCount}</span> 명 대기 중</div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-600 mb-1.5 flex justify-between">항목별 클리닉 임무 명세 <button onClick={() => setClinicItems([...clinicItems, ''])} className="text-xs text-indigo-600 font-bold">+ 할일 추가</button></label>
                        {clinicItems.map((item, idx) => (
                            <div key={idx} className="flex gap-2 mb-2 items-center animate-in fade-in-50">
                                <span className="text-xs font-bold bg-gray-100 text-gray-500 w-5 h-5 rounded flex items-center justify-center shrink-0">{idx+1}</span>
                                <input type="text" className="w-full border p-2.5 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500" value={item} onChange={e => { const copy = [...clinicItems]; copy[idx] = e.target.value; setClinicItems(copy); }} placeholder="예: 쎈 수학 p.20-25 오답 완수" />
                                {clinicItems.length > 1 && (
                                    <button onClick={() => setClinicItems(clinicItems.filter((_, i) => i !== idx))} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><X size={16}/></button>
                                )}
                            </div>
                        ))}
                    </div>
                    <Button className="w-full py-3.5 text-base font-bold bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveClinicTask} disabled={isClinicSaving}>{isClinicSaving ? '배정 데이터 전송 중...' : '구두 확약 완료 - 조교 인수인계'}</Button>
                </div>
            </Modal>

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
                        {(formData.youtubeLinks || []).map((link, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                                <input type="text" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-500" value={link} onChange={e => handleLinkChange(idx, e.target.value)} placeholder="https://youtu.be/..." />
                                {idx === (formData.youtubeLinks || []).length - 1 ? (
                                    <button onClick={() => setFormData({...formData, youtubeLinks: [...(formData.youtubeLinks||[]), '']})} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"><Plus size={20}/></button>
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

export const AdminLectureManager = () => {
    const { users = [], classes = [], masterData = {}, loadingData } = useData();
    
    // 🚀 [CTO 패치] 동적 시즌 데이터 연동
    const dynamicSeasons = useMemo(() => {
        const customSeasons = (masterData?.seasons || []).sort((a, b) => a.startDate.localeCompare(b.startDate));
        return [
            { id: 'all', name: '전체 시즌 (All)' },
            { id: 'legacy', name: '📦 시즌 미지정 (과거 데이터)' },
            ...customSeasons
        ];
    }, [masterData]);

    const [adminTab, setAdminTab] = useState('master');
    const [selectedSeason, setSelectedSeason] = useState('');
    const [isSeasonAutoSet, setIsSeasonAutoSet] = useState(false);

    // 🚀 [CTO 패치] 타임머신 자동 시즌 선택 엔진
    useEffect(() => {
        if (!isSeasonAutoSet && !loadingData) {
            const seasons = masterData?.seasons || [];
            if (seasons.length > 0) {
                const todayStr = new Date().toISOString().split('T')[0];
                const current = seasons.find(s => todayStr >= s.startDate && todayStr <= s.endDate);
                if (current) {
                    setSelectedSeason(current.id);
                } else {
                    const future = seasons.filter(s => s.startDate > todayStr).sort((a, b) => a.startDate.localeCompare(b.startDate));
                    if (future.length > 0) {
                        setSelectedSeason(future[0].id);
                    } else {
                        const past = seasons.filter(s => s.endDate < todayStr).sort((a, b) => b.endDate.localeCompare(a.endDate));
                        if (past.length > 0) {
                            setSelectedSeason(past[0].id);
                        } else {
                            setSelectedSeason('all');
                        }
                    }
                }
            } else {
                setSelectedSeason('all');
            }
            setIsSeasonAutoSet(true);
        }
    }, [masterData, isSeasonAutoSet, loadingData]);

    const [selectedLecturerId, setSelectedLecturerId] = useState(null);
    const [selectedClass, setSelectedClass] = useState(null);
    
    const [isClassModalOpen, setIsClassModalOpen] = useState(false);
    const [editingClassId, setEditingClassId] = useState(null);
    
    const [newClass, setNewClass] = useState({ name: '', lecturerId: '', subject: '', schedules: [], season: '', status: 'active' });
    const [isSaving, setIsSaving] = useState(false);
    
    const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
    const [csvLecturerFile, setCsvLecturerFile] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
    const [cloneForm, setCloneForm] = useState({ sourceSeason: '', targetSeason: '', prefix: '' });
    const [simulatorDay, setSimulatorDay] = useState('월');

    const seasonFilteredClasses = useMemo(() => {
        return (classes || []).filter(c => {
            if (selectedSeason === 'all') return true;
            if (selectedSeason === 'legacy') return !c.season;
            return c.season === selectedSeason;
        });
    }, [classes, selectedSeason]);

    const masterClasses = useMemo(() => seasonFilteredClasses.filter(c => c.status !== 'proposed' && c.status !== 'rejected'), [seasonFilteredClasses]);
    const proposedClasses = useMemo(() => seasonFilteredClasses.filter(c => c.status === 'proposed'), [seasonFilteredClasses]);

    const lecturers = useMemo(() => {
        return (users || []).filter(u => u.role === 'lecturer' || u.role === 'admin' || u.role === 'ta').sort((a,b) => a.name.localeCompare(b.name));
    }, [users]);

    const orphanedClasses = useMemo(() => {
        return masterClasses.filter(c => !c.lecturerId || !lecturers.some(l => l.id === c.lecturerId));
    }, [masterClasses, lecturers]);

    const displayedClasses = useMemo(() => {
        if (!selectedLecturerId) return [];
        if (selectedLecturerId === 'UNASSIGNED_ORPHANS') {
            return orphanedClasses;
        }
        return masterClasses.filter(c => c.lecturerId === selectedLecturerId);
    }, [masterClasses, selectedLecturerId, orphanedClasses]);

    const handleSelectLecturer = (lecturerId) => {
        setSelectedLecturerId(lecturerId);
        setSelectedClass(null); 
    };

    const handleOpenCreateClass = () => {
        const defaultLecturerId = selectedLecturerId === 'UNASSIGNED_ORPHANS' ? '' : selectedLecturerId;
        const validDefaultSeason = selectedSeason !== 'all' && selectedSeason !== 'legacy' ? selectedSeason : (dynamicSeasons[2]?.id || '');
        setNewClass({ 
            name: '', 
            lecturerId: defaultLecturerId, 
            subject: '', 
            schedules: [{ dayOfWeek: '월', startTime: '18:00', endTime: '20:00', room: '' }],
            season: validDefaultSeason,
            status: 'active'
        });
        setEditingClassId(null);
        setIsClassModalOpen(true);
    };

    const handleOpenEditClass = (e, cls, isApproving = false) => {
        if(e) e.stopPropagation();
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
            subject: cls.subject || '', 
            schedules: initialSchedules,
            season: cls.season || '',
            status: isApproving ? 'active' : (cls.status || 'active')
        });
        setEditingClassId(cls.id);
        setIsClassModalOpen(true);
    };

    const handleApproveProposal = async (clsId) => {
        if (!window.confirm("이 강의 기획안을 승인하여 정규 시간표로 확정하시겠습니까?")) return;
        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', clsId), { status: 'active', updatedAt: serverTimestamp() });
            alert("강의가 승인되어 정규 클래스로 편입되었습니다.");
        } catch(e) { alert("승인 오류: " + e.message); }
    };

    const handleRejectProposal = async (clsId) => {
        if (!window.confirm("이 강의 기획안을 반려 처리하시겠습니까? (강사 화면에서도 삭제됩니다)")) return;
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', clsId));
            alert("기획안이 반려 및 삭제되었습니다.");
        } catch(e) { alert("반려 오류: " + e.message); }
    };

    const openCloneModal = () => {
        setCloneForm({ sourceSeason: '', targetSeason: selectedSeason !== 'all' && selectedSeason !== 'legacy' ? selectedSeason : '', prefix: '' });
        setIsCloneModalOpen(true);
    };

    const handleCloneSeason = async () => {
        if(!cloneForm.sourceSeason) return alert('복사해올 이전 시즌을 선택하세요.');
        if(!cloneForm.targetSeason) return alert('저장될 타겟 시즌을 선택하세요.');
        if(cloneForm.sourceSeason === cloneForm.targetSeason) return alert('동일한 시즌으로는 복제할 수 없습니다.');

        const sourceClasses = classes.filter(c => {
            if (cloneForm.sourceSeason === 'legacy') return !c.season;
            return c.season === cloneForm.sourceSeason;
        });

        if(sourceClasses.length === 0) return alert('선택하신 이전 시즌에 복제할 강의가 없습니다.');
        if(!window.confirm(`총 ${sourceClasses.length}개의 강의를 [${dynamicSeasons.find(s=>s.id===cloneForm.targetSeason)?.name}]으로 복제하시겠습니까?\n(기존 스케줄과 담당 강사 정보가 그대로 유지됩니다.)`)) return;

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            sourceClasses.forEach(cls => {
                const newRef = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
                const newName = cloneForm.prefix ? `${cloneForm.prefix} ${cls.name}` : cls.name;
                batch.set(newRef, {
                    name: newName,
                    lecturerId: cls.lecturerId,
                    subject: cls.subject || '',
                    schedules: cls.schedules || [],
                    season: cloneForm.targetSeason,
                    status: 'active', 
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });
            await batch.commit();
            alert('시즌 복제가 완벽하게 완료되었습니다!');
            setIsCloneModalOpen(false);
            setSelectedSeason(cloneForm.targetSeason);
        } catch(e) {
            alert('복제 실패: ' + e.message);
        } finally {
            setIsSaving(false);
        }
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
        if (!newClass.subject) return alert('과목을 필수로 선택해야 합니다.');
        if (!newClass.season) return alert('이 클래스가 운영될 시즌을 선택해주세요.');
        if (newClass.schedules.length === 0) return alert('최소 1개의 스케줄(요일/시간)을 등록해주세요.');

        setIsSaving(true);
        try {
            const payload = { 
                name: newClass.name.trim(),
                lecturerId: newClass.lecturerId,
                subject: newClass.subject, 
                schedules: newClass.schedules,
                season: newClass.season,
                status: newClass.status || 'active',
                updatedAt: serverTimestamp() 
            };
            
            if (editingClassId) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'classes', editingClassId), payload);
                if (selectedLecturerId === 'UNASSIGNED_ORPHANS' && displayedClasses.length === 1) {
                    setSelectedLecturerId(null);
                }
            } else {
                payload.createdAt = serverTimestamp();
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), payload);
            }
            setIsClassModalOpen(false);
            if(adminTab === 'proposals' && newClass.status === 'active') {
                alert("기획안이 스케줄 수정과 함께 승인 확정되었습니다!");
            }
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
        if (!csvLecturerFile) return alert("업로드할 CSV 파일을 선택해주세요.");
        if (selectedSeason === 'all' || selectedSeason === 'legacy') {
            return alert("🚨 CSV 덮어쓰기를 진행할 특정 '시즌'을 상단에서 먼저 선택해주세요. 전체 또는 과거 데이터 탭에서는 덮어쓰기가 불가능합니다.");
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
                                const classroom = getMatchedMasterRoom(rawClassroom, masterData?.classrooms || []);
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
            (masterClasses || []).forEach(c => { existingClassesMap[c.name] = c; });

            Object.values(parsedClasses).forEach(newClsData => {
                const matchedLecturers = lecturers.filter(u => u.name === newClsData.lecturerName);
                let safeLecturerId = '';
                
                if (matchedLecturers.length === 1) {
                    safeLecturerId = matchedLecturers[0].id;
                } else if (matchedLecturers.length > 1) {
                    console.warn(`동명이인 강사 감지됨: ${newClsData.lecturerName}`);
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
                        season: selectedSeason,
                        status: 'active',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    writeCount++;
                }
            });

            if (writeCount > 0) {
                await batch.commit();
                alert(`[${dynamicSeasons.find(s=>s.id===selectedSeason)?.name}] 시간표 완전 동기화가 완료되었습니다! (적용된 반: ${writeCount}개)`);
            } else {
                alert("적용할 반 데이터가 없습니다. 파일을 다시 확인해주세요.");
            }
            
            setIsCsvModalOpen(false);
            setCsvLecturerFile(null);

        } catch (error) {
            console.error("CSV Sync Error:", error);
            alert("파일 동기화 중 오류가 발생했습니다.");
        } finally {
            setIsSyncing(false);
        }
    };

    if (loadingData || !isSeasonAutoSet) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="space-y-6 w-full animate-in fade-in h-[85vh] flex flex-col">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white p-6 rounded-2xl border border-gray-200 shadow-sm shrink-0 gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookOpen className="text-blue-600"/> 클래스 마스터 관리</h2>
                        <p className="text-gray-500 text-sm mt-1">학원의 모든 반과 스케줄을 시즌별, 강사별로 기획하고 통제합니다.</p>
                    </div>
                </div>
                
                <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto items-center">
                    <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-200 w-full md:w-auto shadow-sm shrink-0">
                        <CalendarDays size={18} className="text-indigo-600 shrink-0" />
                        <select
                            value={selectedSeason}
                            onChange={e => {
                                setSelectedSeason(e.target.value);
                                setSelectedLecturerId(null);
                                setSelectedClass(null);
                            }}
                            className="bg-transparent border-none outline-none font-black text-indigo-900 text-sm cursor-pointer pr-2 w-full"
                        >
                            {dynamicSeasons.map(season => (
                                <option key={season.id} value={season.id}>{season.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        <Button variant="outline" onClick={openCloneModal} icon={Copy} className="w-full md:w-auto bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 font-bold">
                            시즌 복제
                        </Button>
                        <Button variant="outline" onClick={() => setIsCsvModalOpen(true)} icon={Upload} className="w-full md:w-auto bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 font-bold">
                            시간표 덮어쓰기
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden shrink-0">
                <button 
                    onClick={() => setAdminTab('master')} 
                    className={`flex-1 py-3.5 font-bold transition-colors flex justify-center items-center gap-2 ${adminTab === 'master' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <BookOpen size={18}/> 클래스 운영 마스터
                </button>
                <button 
                    onClick={() => setAdminTab('proposals')} 
                    className={`flex-1 py-3.5 font-bold transition-colors flex justify-center items-center gap-2 ${adminTab === 'proposals' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <Inbox size={18}/> 강의 기획 결재함 
                    {proposedClasses.length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce">{proposedClasses.length}</span>}
                </button>
                <button 
                    onClick={() => setAdminTab('simulator')} 
                    className={`flex-1 py-3.5 font-bold transition-colors flex justify-center items-center gap-2 ${adminTab === 'simulator' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <Map size={18}/> 타임테이블 시뮬레이터
                </button>
            </div>

            {/* 📍 Tab 1: 클래스 운영 마스터 뷰 */}
            {adminTab === 'master' && (
                <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 animate-in slide-in-from-bottom-4">
                    <div className="w-full lg:w-1/4 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col shrink-0 min-h-[300px]">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl flex justify-between items-center">
                            <h3 className="font-bold text-gray-800">강사 목록</h3>
                            <div className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded text-gray-500 font-bold flex items-center gap-1">
                                <Filter size={12}/> {dynamicSeasons.find(s=>s.id === selectedSeason)?.name}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                            <button 
                                onClick={() => handleSelectLecturer('UNASSIGNED_ORPHANS')} 
                                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between mb-2 border-2 ${selectedLecturerId === 'UNASSIGNED_ORPHANS' ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-white hover:bg-gray-50 border-gray-100'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-black shrink-0"><AlertTriangle size={16}/></div>
                                    <span className={`font-bold ${selectedLecturerId === 'UNASSIGNED_ORPHANS' ? 'text-red-900' : 'text-gray-800'}`}>미배정/오류 클래스</span>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${orphanedClasses.length > 0 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                                    {orphanedClasses.length}개
                                </span>
                            </button>
                            <hr className="my-2 border-gray-100"/>
                            {lecturers.map(lecturer => {
                                const myClassesCount = masterClasses.filter(c => c.lecturerId === lecturer.id).length;
                                return (
                                    <button 
                                        key={lecturer.id} 
                                        onClick={() => handleSelectLecturer(lecturer.id)} 
                                        className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between mb-1 ${selectedLecturerId === lecturer.id ? 'bg-blue-50 border border-blue-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black uppercase shrink-0">{lecturer.name[0]}</div>
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
                                            <><span className="text-blue-600">{lecturers.find(l => l.id === selectedLecturerId)?.name}</span> 강사님의 운영 클래스</>
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
                                                개설된 반이 없습니다. 우측 상단 버튼을 눌러 개설해주세요.
                                            </div>
                                        ) : (
                                            displayedClasses.map(cls => {
                                                const displaySchedules = cls.schedules || [];
                                                return (
                                                    <div key={cls.id} className={`bg-white rounded-2xl border-2 transition-all overflow-hidden flex flex-col h-full ${selectedClass?.id === cls.id ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-gray-100 hover:border-blue-300'}`}>
                                                        <div className="p-4 cursor-pointer" onClick={() => setSelectedClass(cls)}>
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex-1 pr-2">
                                                                    {cls.subject && <span className="inline-block bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded border border-indigo-100 mb-1">{cls.subject}</span>}
                                                                    <h3 className="font-black text-lg text-gray-800 break-keep leading-tight">{cls.name}</h3>
                                                                </div>
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
            )}

            {/* 📍 Tab 2: 강의 기획 결재함 뷰 */}
            {adminTab === 'proposals' && (
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl p-6 overflow-y-auto custom-scrollbar shadow-inner animate-in slide-in-from-bottom-4">
                    {proposedClasses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 mt-20">
                            <CheckSquare size={64} className="opacity-20 text-emerald-500" />
                            <p className="font-bold text-lg text-gray-500">결재 대기 중인 기획안이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {proposedClasses.map(proposal => {
                                const displaySchedules = proposal.schedules || [];
                                const lecturerName = users.find(u => u.id === proposal.lecturerId)?.name || '미지정';
                                return (
                                    <div key={proposal.id} className="bg-white p-5 rounded-2xl border-2 border-amber-200 shadow-md flex flex-col hover:border-amber-400 transition-colors">
                                        <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3">
                                            <div>
                                                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-1 rounded border border-amber-200 mb-2 inline-flex items-center gap-1"><Inbox size={12}/> 강사 기획안 제출됨</span>
                                                <h3 className="font-black text-xl text-gray-900 leading-tight mt-1">{proposal.name}</h3>
                                                <p className="text-sm font-bold text-gray-500 mt-1">담당: <span className="text-indigo-600">{lecturerName} 강사</span></p>
                                            </div>
                                            {proposal.subject && <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">{proposal.subject}</span>}
                                        </div>
                                        
                                        <div className="space-y-2 flex-1 mb-4">
                                            <p className="text-xs font-bold text-gray-400 mb-1">희망 스케줄 및 강의실</p>
                                            {displaySchedules.length === 0 ? (
                                                <div className="text-xs text-rose-500 font-bold bg-rose-50 p-2 rounded-lg">스케줄 미등록 오류</div>
                                            ) : (
                                                displaySchedules.map((s, idx) => (
                                                    <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-xs">
                                                        <span className="w-6 h-6 flex items-center justify-center bg-indigo-100 text-indigo-700 font-black rounded-md shrink-0">{s.dayOfWeek}</span>
                                                        <span className="font-bold text-gray-700 flex items-center gap-1"><Clock size={12} className="text-gray-400"/> {s.startTime}~{s.endTime}</span>
                                                        <span className="text-gray-500 font-semibold ml-auto border border-gray-300 bg-white px-2 py-1 rounded-md">{s.room || '강의실 미정'}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-100">
                                            <button onClick={() => handleRejectProposal(proposal.id)} className="flex flex-col items-center justify-center gap-1 py-2 bg-gray-50 text-gray-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors font-bold text-xs">
                                                <XSquare size={16}/> 반려
                                            </button>
                                            <button onClick={() => handleOpenEditClass(null, proposal, true)} className="flex flex-col items-center justify-center gap-1 py-2 bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors font-bold text-xs">
                                                <Edit2 size={16}/> 수정 후 승인
                                            </button>
                                            <button onClick={() => handleApproveProposal(proposal.id)} className="flex flex-col items-center justify-center gap-1 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-500 hover:text-white border border-emerald-200 rounded-xl transition-colors font-black text-xs">
                                                <CheckSquare size={16}/> 즉시 승인
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* 📍 Tab 3: 타임테이블 시뮬레이터 (Sandbox) 뷰 */}
            {adminTab === 'simulator' && (
                <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden animate-in slide-in-from-bottom-4">
                    <div className="p-4 border-b border-gray-100 bg-indigo-50/50 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                        <div>
                            <h3 className="font-black text-lg text-indigo-900 flex items-center gap-2"><Map size={20}/> 샌드박스 시뮬레이터</h3>
                            <p className="text-xs font-bold text-indigo-700 mt-1 opacity-80">정규 강의와 강사 기획안이 겹치지 않는지 시각적으로 확인하고 마우스로 클릭하여 즉시 조정하세요.</p>
                        </div>
                        <div className="flex gap-2">
                            {DAYS.map(d => (
                                <button 
                                    key={d} 
                                    onClick={() => setSimulatorDay(d)}
                                    className={`w-10 h-10 rounded-full font-black text-sm transition-all shadow-sm ${simulatorDay === d ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-gray-500 hover:bg-indigo-100 border border-gray-200'}`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50 relative p-4">
                        <div className="flex gap-4 min-w-max">
                            {/* 좌측 시간축 */}
                            <div className="w-16 shrink-0 relative" style={{ height: `${(SIM_END_HOUR - SIM_START_HOUR + 1) * HOUR_HEIGHT}px` }}>
                                {Array.from({length: SIM_END_HOUR - SIM_START_HOUR + 1}).map((_, i) => (
                                    <div key={i} className="absolute w-full text-right pr-2 text-xs font-black text-gray-400" style={{ top: `${i * HOUR_HEIGHT - 8}px` }}>
                                        {SIM_START_HOUR + i}:00
                                    </div>
                                ))}
                            </div>

                            {/* 강의실별 컬럼 (절대 좌표 렌더링) */}
                            {[{name: '미정'}, ...(masterData?.classrooms || [])].map((room, rIdx) => {
                                const rName = typeof room === 'string' ? room : room.name;
                                
                                const classesInRoom = seasonFilteredClasses.filter(c => 
                                    c.schedules?.some(s => s.dayOfWeek === simulatorDay && (s.room || '미정') === rName)
                                );

                                return (
                                    <div key={rIdx} className="w-48 shrink-0 flex flex-col">
                                        <div className="text-center font-black text-sm text-gray-700 bg-white border border-gray-200 py-2 rounded-t-xl shadow-sm z-10 sticky top-0">
                                            {rName}
                                        </div>
                                        <div className="flex-1 bg-white border-x border-b border-gray-200 rounded-b-xl relative overflow-hidden" style={{ height: `${(SIM_END_HOUR - SIM_START_HOUR + 1) * HOUR_HEIGHT}px` }}>
                                            {/* 가로 그리드 라인 */}
                                            {Array.from({length: SIM_END_HOUR - SIM_START_HOUR + 1}).map((_, i) => (
                                                <div key={`grid_${i}`} className="absolute w-full border-b border-gray-100" style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}></div>
                                            ))}
                                            
                                            {/* 강의 블록 렌더링 */}
                                            {classesInRoom.map(cls => {
                                                const sch = cls.schedules.find(s => s.dayOfWeek === simulatorDay && (s.room || '미정') === rName);
                                                if(!sch) return null;

                                                const top = getSimTop(sch.startTime);
                                                const height = getSimHeight(sch.startTime, sch.endTime);
                                                const isProposed = cls.status === 'proposed';
                                                
                                                return (
                                                    <div 
                                                        key={cls.id}
                                                        onClick={() => handleOpenEditClass(null, cls, isProposed)}
                                                        className={`absolute w-[90%] left-[5%] rounded-lg p-2 text-xs shadow-md cursor-pointer transition-all hover:scale-105 overflow-hidden border-2 flex flex-col justify-start
                                                            ${isProposed ? 'bg-amber-100/90 border-amber-400 text-amber-900 z-20' : 'bg-blue-100/90 border-blue-400 text-blue-900 z-10'}`}
                                                        style={{ 
                                                            top: `${top}px`, 
                                                            height: `${height}px`,
                                                            backgroundImage: isProposed ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0, rgba(255,255,255,0.4) 10px, transparent 10px, transparent 20px)' : 'none'
                                                        }}
                                                    >
                                                        {isProposed && <span className="bg-amber-500 text-white text-[8px] font-black px-1 py-0.5 rounded w-fit mb-1">기획안</span>}
                                                        <div className="font-black truncate">{cls.name}</div>
                                                        <div className="font-bold opacity-80 mt-1">{users.find(u=>u.id===cls.lecturerId)?.name} T</div>
                                                        <div className="text-[10px] mt-auto bg-white/60 w-fit px-1 rounded font-mono">{sch.startTime}~{sch.endTime}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={isClassModalOpen} onClose={() => setIsClassModalOpen(false)} title={editingClassId ? "클래스 정보 수정" : "새로운 클래스 마스터 개설"}>
                <div className="space-y-5 w-full bg-gray-50 p-2 md:p-4 rounded-xl">
                    <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        {newClass.status === 'proposed' && (
                            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-800 text-sm font-bold flex items-center gap-2 mb-2">
                                <AlertTriangle size={18}/> 강사님이 제출하신 기획안입니다. 내용을 수정하여 승인할 수 있습니다.
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-blue-600 mb-1.5 block">운영 시즌 지정 (필수)</label>
                                <select 
                                    className="w-full border-2 border-indigo-200 p-3.5 rounded-xl font-black bg-indigo-50 text-indigo-900 outline-none focus:border-indigo-500" 
                                    value={newClass.season} 
                                    onChange={e => setNewClass({...newClass, season: e.target.value})}
                                >
                                    <option value="" disabled>시즌을 선택해주세요</option>
                                    {dynamicSeasons.filter(s => s.id !== 'all' && s.id !== 'legacy').map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                    {newClass.season === 'legacy' && <option value="legacy">📦 시즌 미지정 (과거 데이터)</option>}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-blue-600 mb-1.5 block">강의명 (반 이름)</label>
                                <input 
                                    type="text"
                                    className="w-full border-2 border-gray-200 p-3.5 rounded-xl font-bold text-gray-900 focus:border-blue-500 focus:ring-0 outline-none transition-colors" 
                                    placeholder="예: 고1 수학(상) 정규반" 
                                    value={newClass.name} 
                                    onChange={e => setNewClass({...newClass, name: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-blue-600 mb-1.5 block">과목 (아카데미 유니버스 연동 필수)</label>
                                <select className={`w-full border-2 border-gray-200 p-3.5 rounded-xl font-bold bg-white outline-none transition-colors ${!newClass.subject ? 'text-red-500 border-red-300 focus:border-red-500' : 'text-gray-700 focus:border-blue-500'}`} value={newClass.subject} onChange={e => setNewClass({...newClass, subject: e.target.value})}>
                                    <option value="">과목을 선택해주세요 (필수)</option>
                                    {(masterData?.subjects || []).map((sub, idx) => <option key={idx} value={sub}>{sub}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-blue-600 mb-1.5 block">담당 강사</label>
                                <select className={`w-full border-2 border-gray-200 p-3.5 rounded-xl font-bold bg-white outline-none transition-colors ${!newClass.lecturerId ? 'text-red-500 border-red-300 focus:border-red-500' : 'text-gray-700 focus:border-blue-500'}`} value={newClass.lecturerId} onChange={e => setNewClass({...newClass, lecturerId: e.target.value})}>
                                    <option value="">강사를 선택해주세요 (필수)</option>
                                    {lecturers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
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
                                        <label className="text-[10px] font-bold text-gray-500 mb-1 block">강의실 (요청)</label>
                                        <select className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none focus:ring-1 focus:ring-blue-500 bg-white" value={sch.room} onChange={e => handleScheduleChange(idx, 'room', e.target.value)}>
                                            <option value="">미정/선택</option>
                                            {(masterData?.classrooms || []).map((room, rIdx) => {
                                                const rName = typeof room === 'string' ? room : room.name;
                                                const rCap = typeof room === 'string' ? '' : ` (최대: ${room.capacity}명)`;
                                                return <option key={rIdx} value={rName}>{rName}{rCap}</option>;
                                            })}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button className="w-full py-4 text-lg font-black shadow-lg" onClick={handleSaveClass} disabled={isSaving}>
                            {isSaving ? <Loader className="animate-spin mx-auto"/> : (newClass.status === 'active' && adminTab === 'proposals' ? '스케줄 확정 및 즉시 승인' : '클래스 마스터 저장')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isCloneModalOpen} onClose={() => setIsCloneModalOpen(false)} title="🔄 시즌 강의 일괄 복제">
                <div className="space-y-6 w-full">
                    <div className="bg-indigo-50 p-4 rounded-xl text-sm text-indigo-800">
                        <p className="font-bold mb-2 flex items-center gap-1"><Copy size={16}/> 지난 학기의 강의 세팅을 그대로 가져옵니다.</p>
                        <p className="opacity-90">선택한 시즌에 있던 강의들의 이름, 시간, 요일, 강의실 정보를 새로운 시즌으로 똑같이 복사합니다. 복제된 후 이름을 수정할 수 있습니다.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-bold text-gray-700 mb-2 block">1. 원본 (가져올 시즌)</label>
                            <select 
                                className="w-full border-2 border-gray-300 p-3 rounded-xl font-bold outline-none focus:border-indigo-500"
                                value={cloneForm.sourceSeason}
                                onChange={e => setCloneForm({...cloneForm, sourceSeason: e.target.value})}
                            >
                                <option value="" disabled>어느 시즌을 가져올까요?</option>
                                {dynamicSeasons.filter(s => s.id !== 'all').map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-gray-700 mb-2 block">2. 타겟 (저장될 시즌)</label>
                            <select 
                                className="w-full border-2 border-indigo-400 p-3 rounded-xl font-bold bg-indigo-50 text-indigo-900 outline-none"
                                value={cloneForm.targetSeason}
                                onChange={e => setCloneForm({...cloneForm, targetSeason: e.target.value})}
                            >
                                {dynamicSeasons.filter(s => s.id !== 'all' && s.id !== 'legacy').map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-bold text-gray-700 mb-2 flex justify-between">
                            <span>3. 일괄 이름 추가 (Prefix)</span> <span className="text-xs text-gray-400 font-normal">선택사항</span>
                        </label>
                        <input 
                            type="text" 
                            className="w-full border-2 border-gray-300 p-3 rounded-xl outline-none focus:border-indigo-500 font-bold"
                            placeholder="예: [여름특강]"
                            value={cloneForm.prefix}
                            onChange={e => setCloneForm({...cloneForm, prefix: e.target.value})}
                        />
                        <p className="text-xs text-gray-500 mt-2 font-bold">👉 예시: 기존 <span className="text-gray-800">'고1 수학(상)'</span> ➔ 복사 후 <span className="text-indigo-600">'{cloneForm.prefix ? cloneForm.prefix + ' ' : ''}고1 수학(상)'</span></p>
                    </div>

                    <Button className="w-full py-4 text-lg font-black bg-indigo-600 hover:bg-indigo-700" onClick={handleCloneSeason} disabled={isSaving}>
                        {isSaving ? <Loader className="animate-spin mx-auto"/> : '선택한 시즌으로 일괄 복제 실행'}
                    </Button>
                </div>
            </Modal>

            <Modal isOpen={isCsvModalOpen} onClose={() => !isSyncing && setIsCsvModalOpen(false)} title="시간표 덮어쓰기 (동기화)">
                <div className="space-y-6 w-full">
                    <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800">
                        <p className="font-bold mb-2 flex items-center gap-1"><BookOpen size={16}/> 시간표 덮어쓰기 안내</p>
                        <div className="opacity-90 leading-relaxed space-y-1">
                            <p>• <b>통통통 &gt; 학사관리 &gt; 반 &gt; 시간/강의실 현황</b> 엑셀(CSV) 파일을 올려주세요.</p>
                            <p>• 기존 반의 <span className="font-bold text-red-500">시간표만 완벽하게 덮어쓰기</span> 됩니다. (과거 일지 보존)</p>
                            <p>• 현재 상단에 지정된 <strong>[{dynamicSeasons.find(s=>s.id===selectedSeason)?.name}]</strong> 시즌으로 모든 시간표가 덮어씌워집니다.</p>
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

                    <Button className="w-full py-4 text-lg" onClick={handleSyncCsv} disabled={isSyncing}>
                        {isSyncing ? <Loader className="animate-spin mx-auto"/> : '시간표 완벽 덮어쓰기 실행'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export const LecturerDashboard = ({ currentUser }) => {
    const { classes: allClasses = [], users = [], masterData = {}, loadingData } = useData();
    
    const dynamicSeasons = useMemo(() => {
        const customSeasons = (masterData?.seasons || []).sort((a, b) => a.startDate.localeCompare(b.startDate));
        return [
            { id: 'all', name: '전체 시즌 (All)' },
            { id: 'legacy', name: '📦 시즌 미지정 (과거 데이터)' },
            ...customSeasons
        ];
    }, [masterData]);

    const [selectedSeason, setSelectedSeason] = useState('');
    const [isSeasonAutoSet, setIsSeasonAutoSet] = useState(false);

    useEffect(() => {
        if (!isSeasonAutoSet && !loadingData) {
            const seasons = masterData?.seasons || [];
            if (seasons.length > 0) {
                const todayStr = new Date().toISOString().split('T')[0];
                const current = seasons.find(s => todayStr >= s.startDate && todayStr <= s.endDate);
                if (current) {
                    setSelectedSeason(current.id);
                } else {
                    const future = seasons.filter(s => s.startDate > todayStr).sort((a, b) => a.startDate.localeCompare(b.startDate));
                    if (future.length > 0) {
                        setSelectedSeason(future[0].id);
                    } else {
                        const past = seasons.filter(s => s.endDate < todayStr).sort((a, b) => b.endDate.localeCompare(a.endDate));
                        if (past.length > 0) {
                            setSelectedSeason(past[0].id);
                        } else {
                            setSelectedSeason('all');
                        }
                    }
                }
            } else {
                setSelectedSeason('all');
            }
            setIsSeasonAutoSet(true);
        }
    }, [masterData, isSeasonAutoSet, loadingData]);

    const [selectedClass, setSelectedClass] = useState(null);

    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
    const [newProposal, setNewProposal] = useState({ name: '', subject: '', schedules: [], season: '' });
    const [isSavingProposal, setIsSavingProposal] = useState(false);

    const myClasses = useMemo(() => {
        if (!currentUser) return [];
        return (allClasses || []).filter(c => {
            const isMyClass = c?.lecturerId === currentUser.id;
            if (!isMyClass) return false;
            if (c.status === 'rejected') return false; 
            
            if (selectedSeason === 'all') return true;
            if (selectedSeason === 'legacy') return !c.season;
            return c.season === selectedSeason;
        });
    }, [allClasses, currentUser, selectedSeason]);

    useEffect(() => {
        if(myClasses.length > 0 && !selectedClass) setSelectedClass(myClasses[0]);
        if(selectedClass && !myClasses.some(c => c.id === selectedClass.id)) {
            setSelectedClass(myClasses.length > 0 ? myClasses[0] : null);
        }
    }, [myClasses, selectedClass]);

    const handleOpenProposal = () => {
        const validDefaultSeason = selectedSeason !== 'all' && selectedSeason !== 'legacy' ? selectedSeason : (dynamicSeasons[2]?.id || '');
        setNewProposal({ 
            name: '', 
            subject: currentUser.subject || '', 
            schedules: [{ dayOfWeek: '월', startTime: '18:00', endTime: '20:00', room: '' }],
            season: validDefaultSeason
        });
        setIsProposalModalOpen(true);
    };

    const handleProposalScheduleChange = (index, field, value) => {
        setNewProposal(prev => {
            const updated = [...prev.schedules];
            updated[index][field] = value;
            return { ...prev, schedules: updated };
        });
    };

    const handleSaveProposal = async () => {
        if (!newProposal.name.trim()) return alert('희망하는 반 이름을 입력하세요');
        if (!newProposal.subject) return alert('과목을 필수로 선택해야 합니다.');
        if (!newProposal.season) return alert('기획안을 제출할 시즌을 선택해주세요.');
        if (newProposal.schedules.length === 0) return alert('최소 1개의 희망 스케줄을 등록해주세요.');

        setIsSavingProposal(true);
        try {
            const payload = { 
                name: newProposal.name.trim(),
                lecturerId: currentUser.id,
                subject: newProposal.subject, 
                schedules: newProposal.schedules,
                season: newProposal.season,
                status: 'proposed', 
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp() 
            };
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'), payload);
            setIsProposalModalOpen(false);
            alert("데스크로 강의 기획안이 제출되었습니다. 결재 대기 중입니다.");
        } catch (e) { alert("제출 실패: " + e.message); } finally { setIsSavingProposal(false); }
    };

    if (loadingData || !isSeasonAutoSet) return <div className="flex justify-center items-center h-full w-full min-h-[50vh]"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="space-y-6 w-full animate-in fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <span className="font-bold text-gray-700 flex items-center gap-1"><Filter size={18}/> 운영 시즌:</span>
                    <select
                        value={selectedSeason}
                        onChange={e => setSelectedSeason(e.target.value)}
                        className="bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl outline-none font-black text-indigo-900 text-sm cursor-pointer flex-1 sm:flex-none"
                    >
                        {dynamicSeasons.map(season => (
                            <option key={season.id} value={season.id}>{season.name}</option>
                        ))}
                    </select>
                </div>
                
                <Button onClick={handleOpenProposal} icon={Send} className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-md">
                    새 강의 기획안 제출
                </Button>
            </div>

            {myClasses.length > 0 ? (
                <>
                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {myClasses.map(c => {
                            const isProposed = c.status === 'proposed';
                            return (
                                <button key={c.id} onClick={() => setSelectedClass(c)} className={`px-4 py-2.5 rounded-xl border whitespace-nowrap transition-all font-bold flex flex-col items-start gap-1 min-w-max ${selectedClass?.id === c.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                    <div className="flex items-center gap-2">
                                        {c.name}
                                        {isProposed && <span className={`text-[10px] px-1.5 py-0.5 rounded font-black border ${selectedClass?.id === c.id ? 'bg-amber-400 text-amber-900 border-amber-500' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>결재대기</span>}
                                    </div>
                                    <div className={`text-[10px] font-normal opacity-80 ${selectedClass?.id === c.id ? 'text-blue-100' : 'text-gray-400'}`}>
                                        {(c.schedules||[]).map(s=>`${s.dayOfWeek} ${s.startTime}`).join(', ')}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                    {selectedClass ? (
                        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                            {selectedClass.status === 'proposed' ? (
                                <div className="py-20 flex flex-col items-center justify-center text-amber-600 bg-amber-50/50 rounded-2xl border-2 border-dashed border-amber-200">
                                    <Inbox size={48} className="mb-4 opacity-50"/>
                                    <h3 className="text-xl font-black mb-2">데스크 결재 대기 중인 기획안입니다</h3>
                                    <p className="font-bold text-sm opacity-80">원장님(데스크)의 스케줄 승인이 완료되면 일지 작성이 활성화됩니다.</p>
                                </div>
                            ) : (
                                <LectureManagementPanel selectedClass={selectedClass} />
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">선택된 반이 없습니다.</div>
                    )}
                </>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-300 text-gray-400">
                    <BookOpen size={48} className="mx-auto mb-3 opacity-20"/>
                    <p className="font-bold">선택하신 시즌에 담당하는 반이 없습니다.</p>
                </div>
            )}

            <Modal isOpen={isProposalModalOpen} onClose={() => setIsProposalModalOpen(false)} title="📝 신규 강의 기획안 작성 (데스크 결재)">
                <div className="space-y-5 w-full bg-gray-50 p-2 md:p-4 rounded-xl">
                    <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-800 text-sm font-bold flex items-center gap-2">
                            원하시는 시간과 요일을 기획하여 올리시면 데스크에서 학원 전체 스케줄과 맞춰본 뒤 최종 승인해 드립니다.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-blue-600 mb-1.5 block">오픈 희망 시즌</label>
                                <select 
                                    className="w-full border-2 border-indigo-200 p-3.5 rounded-xl font-black bg-indigo-50 text-indigo-900 outline-none focus:border-indigo-500" 
                                    value={newProposal.season} 
                                    onChange={e => setNewProposal({...newProposal, season: e.target.value})}
                                >
                                    {dynamicSeasons.filter(s => s.id !== 'all' && s.id !== 'legacy').map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-blue-600 mb-1.5 block">강의명 (반 이름)</label>
                                <input 
                                    type="text"
                                    className="w-full border-2 border-gray-200 p-3.5 rounded-xl font-bold text-gray-900 focus:border-blue-500 outline-none transition-colors" 
                                    placeholder="예: 윈터 특강 수능국어 정복" 
                                    value={newProposal.name} 
                                    onChange={e => setNewProposal({...newProposal, name: e.target.value})} 
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-blue-600 mb-1.5 block">과목</label>
                                <select className="w-full border-2 border-gray-200 p-3.5 rounded-xl font-bold bg-white outline-none focus:border-blue-500" value={newProposal.subject} onChange={e => setNewProposal({...newProposal, subject: e.target.value})}>
                                    <option value="">과목 선택</option>
                                    {(masterData?.subjects || []).map((sub, idx) => <option key={idx} value={sub}>{sub}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Calendar size={16} className="text-blue-600"/> 희망 요일 및 시간</label>
                            <button onClick={() => setNewProposal(p => ({...p, schedules: [...p.schedules, {dayOfWeek: '월', startTime: '18:00', endTime: '20:00', room: ''}]}))} className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100"><Plus size={14}/> 스케줄 추가</button>
                        </div>
                        
                        <div className="space-y-3 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                            {newProposal.schedules.map((sch, idx) => (
                                <div key={idx} className="flex flex-col md:flex-row gap-2 md:gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 relative group">
                                    <button onClick={() => setNewProposal(p => { const s = [...p.schedules]; s.splice(idx,1); return {...p, schedules: s};})} className="absolute -top-2 -right-2 bg-white border border-red-200 text-red-500 hover:bg-red-500 hover:text-white rounded-full p-1 shadow-sm opacity-100 md:opacity-0 group-hover:opacity-100"><X size={14}/></button>
                                    
                                    <div className="w-full md:w-20 shrink-0">
                                        <label className="text-[10px] font-bold text-gray-500 mb-1 block">요일</label>
                                        <select className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none bg-white" value={sch.dayOfWeek} onChange={e => handleProposalScheduleChange(idx, 'dayOfWeek', e.target.value)}>
                                            {DAYS.map(d => <option key={d} value={d}>{d}요일</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1 flex gap-2">
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-500 mb-1 block">시작 시간</label>
                                            <input type="time" className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none bg-white" value={sch.startTime} onChange={e => handleProposalScheduleChange(idx, 'startTime', e.target.value)} />
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-500 mb-1 block">종료 시간</label>
                                            <input type="time" className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none bg-white" value={sch.endTime} onChange={e => handleProposalScheduleChange(idx, 'endTime', e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="w-full md:w-32 shrink-0">
                                        <label className="text-[10px] font-bold text-gray-500 mb-1 block">희망 강의실</label>
                                        <select className="w-full border p-2.5 rounded-lg text-sm font-bold outline-none bg-white" value={sch.room} onChange={e => handleProposalScheduleChange(idx, 'room', e.target.value)}>
                                            <option value="">어디든 좋음</option>
                                            {(masterData?.classrooms || []).map((room, rIdx) => {
                                                const rName = typeof room === 'string' ? room : room.name;
                                                return <option key={rIdx} value={rName}>{rName}</option>;
                                            })}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button className="w-full py-4 text-lg font-black shadow-lg bg-amber-500 hover:bg-amber-600" onClick={handleSaveProposal} disabled={isSavingProposal}>
                            {isSavingProposal ? <Loader className="animate-spin mx-auto"/> : '기획안 데스크 제출하기'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AdminLectureManager;