/* [서비스 가치] 강사, 데스크, 조교가 서로를 부르거나 카톡을 남길 필요 없이, 
  비동기적으로 업무를 예약하고 결과를 보고받는 '무결성 업무 관제 센터(Daily Task Hub)'입니다.
  (🚀 CTO 패치: 클리닉 지시 외에 [일반 업무 요청] 기능이 통합되었으며, 직군별 진척도 UI가 탑재되었습니다.) */
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Badge, Modal } from '../components/UI';
import { 
    Phone, CheckCircle, Clock, AlertTriangle, MessageSquare, UserCheck, 
    Search, FileText, Calendar, Loader, Plus, Trash2, ListTodo, Send
} from 'lucide-react';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

const ClinicTaskManager = ({ currentUser }) => {
    const { users } = useData();

    // --- State: View & Date ---
    const [currentTab, setCurrentTab] = useState(
        ['ta'].includes(currentUser.role) ? 'ta' : 
        ['lecturer'].includes(currentUser.role) ? 'my_requests' : 'desk'
    ); 
    const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTask, setSelectedTask] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // --- State: Data ---
    const [clinicTasks, setClinicTasks] = useState([]);
    const [dailyRequests, setDailyRequests] = useState([]);

    // --- State: Modal (새 업무 요청) ---
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [reqForm, setReqForm] = useState({
        targetDate: new Date().toISOString().split('T')[0],
        assignedRole: 'desk', // 'desk' 또는 'ta'
        studentId: '',
        title: '',
        content: ''
    });

    // 🚀 [CTO 패치] 클리닉 태스크와 일반 업무 태스크 동시 실시간 구독
    useEffect(() => {
        setIsLoading(true);

        const qClinic = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks'), where('targetDate', '==', targetDate));
        const unsubClinic = onSnapshot(qClinic, (snapshot) => {
            setClinicTasks(snapshot.docs.map(d => ({ id: d.id, _collection: 'clinic', ...d.data() })));
            setIsLoading(false);
        });

        const qDaily = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'daily_requests'), where('targetDate', '==', targetDate));
        const unsubDaily = onSnapshot(qDaily, (snapshot) => {
            setDailyRequests(snapshot.docs.map(d => ({ id: d.id, _collection: 'request', ...d.data() })));
        });

        return () => { unsubClinic(); unsubDaily(); };
    }, [targetDate]);

    // 🚀 [선택된 문서 동기화 유지]
    useEffect(() => {
        if (selectedTask) {
            let updated = null;
            if (selectedTask._collection === 'clinic') updated = clinicTasks.find(t => t.id === selectedTask.id);
            else if (selectedTask._collection === 'request') updated = dailyRequests.find(t => t.id === selectedTask.id);
            
            if (updated) setSelectedTask(updated);
            else setSelectedTask(null);
        }
    }, [clinicTasks, dailyRequests]);

    // --- 업무 분류 엔진 (부서별 필터링 병합) ---
    const tasksByTab = useMemo(() => {
        const deskTasks = [
            ...clinicTasks, // 데스크는 클리닉의 '전화업무'를 담당
            ...dailyRequests.filter(r => r.assignedRole === 'desk')
        ];
        
        const taTasks = [
            ...clinicTasks, // 조교는 클리닉의 '학습지도'를 담당
            ...dailyRequests.filter(r => r.assignedRole === 'ta')
        ];

        const myRequests = [
            ...clinicTasks.filter(c => c.lecturerId === currentUser.id),
            ...dailyRequests.filter(r => r.requesterId === currentUser.id)
        ];

        return { desk: deskTasks, ta: taTasks, my_requests: myRequests };
    }, [clinicTasks, dailyRequests, currentUser.id]);

    const activeList = tasksByTab[currentTab] || [];
    const filteredTasks = activeList.filter(t => 
        (t.studentName && t.studentName.includes(searchQuery)) || 
        (t.className && t.className.includes(searchQuery)) ||
        (t.title && t.title.includes(searchQuery))
    );

    // --- 진척도 계산 엔진 ---
    const progressStats = useMemo(() => {
        const deskTotal = tasksByTab.desk.length;
        const deskDone = tasksByTab.desk.filter(t => t._collection === 'clinic' ? t.callStatus === 'confirmed' : t.status === 'completed').length;
        
        const taTotal = tasksByTab.ta.length;
        const taDone = tasksByTab.ta.filter(t => t._collection === 'clinic' ? t.attendanceStatus === 'completed' : t.status === 'completed').length;

        return {
            desk: deskTotal === 0 ? 100 : Math.round((deskDone / deskTotal) * 100),
            ta: taTotal === 0 ? 100 : Math.round((taDone / taTotal) * 100)
        };
    }, [tasksByTab]);


    // =====================================================================
    // 🛠 액션 컨트롤러 (클리닉 및 일반 업무 업데이트)
    // =====================================================================
    const handleUpdateCallStatus = async (taskId, status) => {
        try { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks', taskId), { callStatus: status, updatedAt: serverTimestamp() }); } 
        catch (e) { alert('상태 변경 실패: ' + e.message); }
    };

    const handleItemCheckToggle = (index, isChecked) => {
        if (!selectedTask || selectedTask._collection !== 'clinic') return;
        const updatedItems = [...selectedTask.items];
        updatedItems[index].isCompleted = isChecked;
        if (isChecked) updatedItems[index].incompleteDetails = ''; 
        setSelectedTask({ ...selectedTask, items: updatedItems });
    };

    const handleItemDetailChange = (index, text) => {
        if (!selectedTask || selectedTask._collection !== 'clinic') return;
        const updatedItems = [...selectedTask.items];
        updatedItems[index].incompleteDetails = text;
        setSelectedTask({ ...selectedTask, items: updatedItems });
    };

    const handleSaveClinicReport = async () => {
        if (!selectedTask || selectedTask._collection !== 'clinic') return;
        const hasOmits = selectedTask.items.some(item => !item.isCompleted && !item.incompleteDetails.trim());
        if (hasOmits) return alert('완료하지 못한 임무는 반드시 [어디까지 했는지 사유/진도]를 기입해야 저장 가능합니다.');
        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks', selectedTask.id), { items: selectedTask.items, attendanceStatus: 'completed', finalComment: selectedTask.finalComment, updatedAt: serverTimestamp() });
            alert('클리닉 결과 조치 보고가 완료되었습니다.');
        } catch (e) { alert('저장 실패: ' + e.message); }
    };

    const handleCompleteGeneralRequest = async () => {
        if (!selectedTask || selectedTask._collection !== 'request') return;
        if (!window.confirm("이 요청 업무를 '완료' 처리하시겠습니까?")) return;
        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'daily_requests', selectedTask.id), { status: 'completed', completedAt: serverTimestamp(), completedBy: currentUser.name });
        } catch (e) { alert('완료 처리 실패: ' + e.message); }
    };

    const handleDeleteGeneralRequest = async () => {
        if (!selectedTask || selectedTask._collection !== 'request') return;
        if (!window.confirm("이 요청을 삭제하시겠습니까?")) return;
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'daily_requests', selectedTask.id));
            setSelectedTask(null);
        } catch (e) { alert('삭제 실패: ' + e.message); }
    };

    const handleSubmitNewRequest = async () => {
        if (!reqForm.title.trim()) return alert("업무 제목을 입력해주세요.");
        if (!reqForm.content.trim()) return alert("업무 내용을 구체적으로 작성해주세요.");
        
        setIsSubmitting(true);
        try {
            let sName = '일반 (학생 무관)';
            if (reqForm.studentId) {
                const sObj = users.find(u => u.id === reqForm.studentId);
                if (sObj) sName = sObj.name;
            }

            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'daily_requests'), {
                targetDate: reqForm.targetDate,
                assignedRole: reqForm.assignedRole,
                studentId: reqForm.studentId || null,
                studentName: sName,
                title: reqForm.title.trim(),
                content: reqForm.content.trim(),
                requesterId: currentUser.id,
                requesterName: currentUser.name,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            alert(`업무 요청이 성공적으로 전달되었습니다.`);
            setIsRequestModalOpen(false);
            setReqForm({ targetDate: targetDate, assignedRole: 'desk', studentId: '', title: '', content: '' });
        } catch (error) { alert("요청 실패: " + error.message); } finally { setIsSubmitting(false); }
    };

    // =====================================================================
    // 🎨 UI 렌더링
    // =====================================================================
    return (
        <div className="space-y-6 w-full animate-in fade-in max-w-7xl mx-auto pb-20">
            
            {/* Header Dashboard */}
            <div className="bg-white p-5 md:p-6 rounded-3xl border border-gray-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2 mb-2">
                        <ListTodo className="text-indigo-600"/> 오늘의 할 일 (Task Hub)
                    </h1>
                    <p className="text-sm text-gray-500 font-medium break-keep">
                        지정된 날짜에 해야 할 클리닉 감독, 확인 전화, 개별 업무 요청을 부서별로 완벽하게 관리합니다.
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                    {/* 날짜 선택기 */}
                    <div className="flex items-center gap-2 bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-100 w-full sm:w-auto shrink-0">
                        <Calendar size={18} className="text-indigo-600" />
                        <input type="date" className="bg-transparent outline-none text-sm font-black text-gray-800" value={targetDate} onChange={e => { setTargetDate(e.target.value); setSelectedTask(null); }} />
                    </div>

                    <button onClick={() => { setReqForm({...reqForm, targetDate}); setIsRequestModalOpen(true); }} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-2xl shadow-md transition-colors flex items-center justify-center gap-2 shrink-0">
                        <Plus size={18}/> 새 업무 요청
                    </button>
                </div>
            </div>

            {/* 메인 워크스페이스 구조 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 좌측 리스트 보드 */}
                <div className="lg:col-span-1 bg-white border border-gray-200 rounded-3xl shadow-sm flex flex-col h-[700px] overflow-hidden">
                    {/* 탭 컨트롤러 */}
                    <div className="flex border-b border-gray-100 bg-gray-50/50 shrink-0">
                        <button onClick={() => { setCurrentTab('desk'); setSelectedTask(null); }} className={`flex-1 py-3 text-xs font-black transition-colors border-b-2 flex flex-col items-center gap-1 ${currentTab === 'desk' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-100'}`}>
                            📞 데스크 업무
                            {progressStats.desk === 100 && currentTab !== 'desk' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                        </button>
                        <button onClick={() => { setCurrentTab('ta'); setSelectedTask(null); }} className={`flex-1 py-3 text-xs font-black transition-colors border-b-2 flex flex-col items-center gap-1 ${currentTab === 'ta' ? 'border-emerald-600 text-emerald-700 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-100'}`}>
                            🔥 조교 업무
                            {progressStats.ta === 100 && currentTab !== 'ta' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                        </button>
                        <button onClick={() => { setCurrentTab('my_requests'); setSelectedTask(null); }} className={`flex-1 py-3 text-xs font-black transition-colors border-b-2 flex flex-col items-center gap-1 ${currentTab === 'my_requests' ? 'border-amber-600 text-amber-700 bg-white' : 'border-transparent text-gray-500 hover:bg-gray-100'}`}>
                            📤 내 요청 확인
                        </button>
                    </div>

                    <div className="p-3 border-b border-gray-100 bg-white shrink-0 relative">
                        <input type="text" placeholder="학생, 반, 내용 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                        <Search className="absolute left-6 top-5 text-gray-400" size={14} />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar bg-gray-50/30">
                        {isLoading ? (
                            <div className="py-20 text-center"><Loader className="animate-spin text-gray-400 mx-auto" /></div>
                        ) : filteredTasks.length === 0 ? (
                            <div className="text-center py-20 text-xs text-gray-400 font-bold border-2 border-dashed rounded-xl mx-2 mt-2">지정된 업무가 없습니다.</div>
                        ) : (
                            filteredTasks.map(task => {
                                const isCurrent = selectedTask?.id === task.id;
                                
                                // 태스크 상태 뱃지 계산 로직
                                let statusText = ''; let statusColor = '';
                                if (task._collection === 'clinic') {
                                    if (currentTab === 'desk') {
                                        if (task.callStatus === 'confirmed') { statusText = '통화완료'; statusColor = 'bg-green-100 text-green-700'; }
                                        else if (task.callStatus === 'no_answer') { statusText = '부재중'; statusColor = 'bg-amber-100 text-amber-700'; }
                                        else { statusText = '전화대기'; statusColor = 'bg-gray-200 text-gray-600'; }
                                    } else {
                                        if (task.attendanceStatus === 'completed') { statusText = '퇴실(완료)'; statusColor = 'bg-blue-100 text-blue-700'; }
                                        else if (task.attendanceStatus === 'arrived') { statusText = '학습중'; statusColor = 'bg-emerald-100 text-emerald-700'; }
                                        else { statusText = '입실대기'; statusColor = 'bg-gray-200 text-gray-600'; }
                                    }
                                } else {
                                    if (task.status === 'completed') { statusText = '처리완료'; statusColor = 'bg-blue-100 text-blue-700'; }
                                    else { statusText = '요청대기'; statusColor = 'bg-rose-100 text-rose-700 animate-pulse'; }
                                }

                                return (
                                    <button key={task.id} onClick={() => setSelectedTask(task)} className={`w-full text-left p-3.5 rounded-2xl border transition-all flex flex-col gap-2 relative overflow-hidden ${isCurrent ? 'bg-white border-indigo-400 shadow-md ring-1 ring-indigo-400' : 'border-gray-200 bg-white hover:border-indigo-300 shadow-sm hover:shadow'}`}>
                                        {task._collection === 'request' && <div className="absolute top-0 left-0 w-1 h-full bg-rose-400"></div>}
                                        {task._collection === 'clinic' && <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400"></div>}
                                        
                                        <div className="flex justify-between items-start w-full pl-1">
                                            <div className="flex-1 pr-2">
                                                <span className="font-black text-sm text-gray-900 leading-tight">
                                                    {task._collection === 'clinic' ? `${task.studentName} 학생 클리닉` : task.title}
                                                </span>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-black shrink-0 ${statusColor}`}>
                                                {statusText}
                                            </span>
                                        </div>
                                        <div className="text-[11px] font-bold text-gray-500 pl-1 flex justify-between">
                                            <span className="truncate">{task._collection === 'clinic' ? `반: ${task.className}` : `대상: ${task.studentName}`}</span>
                                            {task._collection === 'request' && <span className="text-rose-500 shrink-0">From. {task.requesterName}</span>}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 우측 인스펙션 피드백 패널 */}
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-3xl shadow-sm flex flex-col h-[700px] overflow-hidden">
                    {!selectedTask ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 bg-gray-50/50">
                            <ListTodo size={48} className="opacity-20" />
                            <p className="font-bold text-sm">좌측 목록에서 업무 카드를 선택해 주세요.</p>
                            
                            {/* 데일리 진척도 게이지 */}
                            <div className="mt-8 w-64 bg-white p-4 rounded-2xl border shadow-sm">
                                <p className="text-xs font-black text-gray-600 mb-2 flex justify-between">데스크 전화 업무 <span className="text-indigo-600">{progressStats.desk}% 완료</span></p>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4"><div className="h-full bg-indigo-500 transition-all duration-1000" style={{width: `${progressStats.desk}%`}}></div></div>
                                <p className="text-xs font-black text-gray-600 mb-2 flex justify-between">조교 클리닉/요청 <span className="text-emerald-600">{progressStats.ta}% 완료</span></p>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-1000" style={{width: `${progressStats.ta}%`}}></div></div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full absolute inset-0 p-5 md:p-8 space-y-5 overflow-y-auto custom-scrollbar relative">
                            
                            {/* [헤더 섹션] */}
                            <div className="border-b border-gray-100 pb-5 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className={`font-black px-2 py-0.5 border ${selectedTask._collection === 'clinic' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                            {selectedTask._collection === 'clinic' ? '정규 클리닉/보충' : '일반 업무 요청'}
                                        </Badge>
                                        <span className="text-xs font-bold text-gray-400">{selectedTask.targetDate}</span>
                                    </div>
                                    <h2 className="text-2xl font-black text-gray-900 leading-tight">
                                        {selectedTask._collection === 'clinic' ? `${selectedTask.studentName} 학생 클리닉 파일` : selectedTask.title}
                                    </h2>
                                    {selectedTask._collection === 'clinic' && <p className="text-sm text-indigo-600 font-bold mt-2">배정 코스: {selectedTask.className}</p>}
                                    {selectedTask._collection === 'request' && <p className="text-sm text-rose-600 font-bold mt-2">관련 학생: {selectedTask.studentName}</p>}
                                </div>

                                {selectedTask._collection === 'request' && currentTab === 'my_requests' && (
                                    <button onClick={handleDeleteGeneralRequest} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="요청 삭제">
                                        <Trash2 size={20}/>
                                    </button>
                                )}
                            </div>

                            {/* ==========================================
                                1. [클리닉 업무 렌더링 블록]
                            =========================================== */}
                            {selectedTask._collection === 'clinic' && (
                                <>
                                    {/* 데스크용 전화 모듈 */}
                                    {(currentTab === 'desk' || currentTab === 'my_requests') && (
                                        <div className="space-y-4 bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100 animate-in fade-in-50">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Phone className="text-indigo-600 shrink-0" size={18} />
                                                <span className="text-sm font-black text-indigo-900">1단계: 데스크 등원 확인(확약) 전화 조치</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button onClick={() => handleUpdateCallStatus(selectedTask.id, 'confirmed')} className={`py-3 rounded-xl border text-xs font-black transition-all ${selectedTask.callStatus === 'confirmed' ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>🟢 통화 완료 (확약)</button>
                                                <button onClick={() => handleUpdateCallStatus(selectedTask.id, 'no_answer')} className={`py-3 rounded-xl border text-xs font-black transition-all ${selectedTask.callStatus === 'no_answer' ? 'bg-amber-500 text-white border-amber-500 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>🟡 부재중</button>
                                                <button onClick={() => handleUpdateCallStatus(selectedTask.id, 'pending')} className={`py-3 rounded-xl border text-xs font-black transition-all ${selectedTask.callStatus === 'pending' || !selectedTask.callStatus ? 'bg-gray-700 text-white border-gray-700 shadow-md' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>⚪ 미확인 상태</button>
                                            </div>
                                        </div>
                                    )}

                                    {/* 조교용 미션 체크 모듈 */}
                                    {(currentTab === 'ta' || currentTab === 'my_requests') && (
                                        <div className="space-y-5 flex-1 animate-in fade-in-50">
                                            
                                            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center border-b border-gray-100 pb-4">
                                                <span className="text-sm font-black text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-2"><Clock size={16}/> 2단계: 현장 입실 상태</span>
                                                <div className="flex gap-2 w-full sm:w-auto">
                                                    {['waiting', 'arrived'].map((status) => (
                                                        <button key={status} onClick={async () => await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks', selectedTask.id), { attendanceStatus: status, updatedAt: serverTimestamp() })} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black border transition-all ${selectedTask.attendanceStatus === status ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                                            {status === 'waiting' ? '대기중' : '학습 시작 (입실)'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <label className="text-sm font-black text-gray-800 flex items-center gap-1.5 mb-2"><UserCheck size={18} className="text-emerald-600"/> 강사 지시 상세 미션 리스트</label>
                                                {selectedTask.items.map((item, idx) => (
                                                    <div key={idx} className={`p-4 md:p-5 rounded-2xl border transition-all flex flex-col gap-3 ${item.isCompleted ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                                                        <div className="flex items-start gap-3">
                                                            <input type="checkbox" checked={item.isCompleted} onChange={(e) => handleItemCheckToggle(idx, e.target.checked)} className="w-5 h-5 accent-emerald-600 rounded cursor-pointer mt-0.5" id={`item_check_${idx}`} />
                                                            <label htmlFor={`item_check_${idx}`} className={`text-base font-bold cursor-pointer ${item.isCompleted ? 'text-emerald-800 line-through opacity-60' : 'text-gray-900'}`}>
                                                                {item.taskContent}
                                                            </label>
                                                        </div>

                                                        {!item.isCompleted && (
                                                            <div className="pl-8 animate-in slide-in-from-top-2 duration-200">
                                                                <div className="flex gap-1 items-center text-[11px] font-black text-rose-500 mb-1.5"><AlertTriangle size={14}/> 미완료 시 사유/진도 기입 필수</div>
                                                                <input type="text" value={item.incompleteDetails || ''} onChange={(e) => handleItemDetailChange(idx, e.target.value)} placeholder="예: 쎈 22번 풀다가 시간 종료됨" className="w-full border-2 border-rose-100 p-2.5 rounded-xl text-sm font-bold bg-white outline-none focus:border-rose-400" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-2 border-t border-gray-100">
                                                <label className="text-sm font-black text-gray-800 flex items-center gap-1.5 mb-3"><MessageSquare size={16} className="text-blue-500" /> 주관식 종합 피드백 (강사 전달용)</label>
                                                <textarea value={selectedTask.finalComment || ''} onChange={(e) => setSelectedTask({ ...selectedTask, finalComment: e.target.value })} placeholder="태도 불량, 특이사항 등 자유롭게 기록해주세요." className="w-full border-2 border-gray-200 p-4 rounded-2xl h-24 resize-none text-sm font-bold outline-none focus:border-indigo-400 bg-gray-50" />
                                            </div>

                                            <button onClick={handleSaveClinicReport} className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-2xl text-base shadow-lg transition-colors flex justify-center items-center gap-2">
                                                <CheckCircle size={20}/> 클리닉 최종 완료 및 피드백 전송
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ==========================================
                                2. [일반 업무 요청 렌더링 블록]
                            =========================================== */}
                            {selectedTask._collection === 'request' && (
                                <div className="space-y-6 flex-1 flex flex-col animate-in fade-in-50">
                                    <div className="bg-rose-50/30 border border-rose-100 rounded-2xl p-5 md:p-6 shadow-sm">
                                        <h3 className="font-bold text-xs text-rose-500 mb-2">업무 상세 내용</h3>
                                        <p className="text-sm md:text-base font-bold text-gray-800 leading-relaxed whitespace-pre-wrap">
                                            {selectedTask.content}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 text-sm font-bold text-gray-500 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                        <span>요청자:</span> <span className="text-gray-900">{selectedTask.requesterName}</span>
                                        <span className="mx-2">|</span>
                                        <span>배정 부서:</span> <span className="text-gray-900">{selectedTask.assignedRole === 'desk' ? '데스크/행정' : '클리닉/조교'}</span>
                                    </div>

                                    <div className="flex-1"></div>

                                    {/* 처리 액션 바 */}
                                    {selectedTask.status === 'completed' ? (
                                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center flex flex-col items-center justify-center">
                                            <CheckCircle size={32} className="text-blue-500 mb-2"/>
                                            <span className="font-black text-blue-900 text-lg">처리가 완료된 업무입니다.</span>
                                            <span className="text-xs font-bold text-blue-600 mt-1">처리자: {selectedTask.completedBy}</span>
                                        </div>
                                    ) : (
                                        (currentTab === 'desk' || currentTab === 'ta') && (
                                            <button onClick={handleCompleteGeneralRequest} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl text-base shadow-lg transition-colors flex justify-center items-center gap-2">
                                                <CheckCircle size={20}/> 이 업무를 완료 처리합니다
                                            </button>
                                        )
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </div>

            {/* 🚀 신규 업무 요청 모달 */}
            <Modal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} title="새로운 업무 요청 작성">
                <div className="space-y-5 p-1 pb-4">
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1.5 block">수행 날짜</label>
                            <input type="date" className="w-full border-2 p-3.5 rounded-xl font-bold bg-white outline-none focus:border-indigo-500" value={reqForm.targetDate} onChange={e => setReqForm({...reqForm, targetDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 mb-1.5 block">배정 부서 (수신처)</label>
                            <select className="w-full border-2 p-3.5 rounded-xl font-bold bg-white outline-none focus:border-indigo-500" value={reqForm.assignedRole} onChange={e => setReqForm({...reqForm, assignedRole: e.target.value})}>
                                <option value="desk">데스크 (전화, 수납, 행정)</option>
                                <option value="ta">조교 (학습지도, 채점, 복사)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-600 mb-1.5 block flex justify-between">
                            관련 학생 지정 <span className="text-indigo-400 font-normal">(선택사항)</span>
                        </label>
                        <select className="w-full border-2 p-3.5 rounded-xl font-bold bg-white outline-none focus:border-indigo-500" value={reqForm.studentId} onChange={e => setReqForm({...reqForm, studentId: e.target.value})}>
                            <option value="">일반 행정 업무 (특정 학생 없음)</option>
                            {users.filter(u=>u.role==='student').map(s => <option key={s.id} value={s.id}>{s.name} 학생</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-600 mb-1.5 block">업무 제목 (핵심 요약)</label>
                        <input type="text" placeholder="예: 에어컨 수리기사 안내 / 홍길동 지각 전송" className="w-full border-2 p-3.5 rounded-xl font-bold bg-white outline-none focus:border-indigo-500 text-gray-900" value={reqForm.title} onChange={e => setReqForm({...reqForm, title: e.target.value})} />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-600 mb-1.5 block">상세 요청 내용</label>
                        <textarea placeholder="조교나 데스크가 보고 바로 이해할 수 있도록 구체적으로 적어주세요." className="w-full border-2 p-4 rounded-xl font-bold bg-gray-50 outline-none focus:border-indigo-500 text-sm h-32 resize-none leading-relaxed" value={reqForm.content} onChange={e => setReqForm({...reqForm, content: e.target.value})} />
                    </div>

                    <button onClick={handleSubmitNewRequest} disabled={isSubmitting} className="w-full py-4 text-base font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg flex justify-center items-center gap-2">
                        {isSubmitting ? <Loader className="animate-spin" size={20}/> : <><Send size={18}/> 업무 지시서 전송</>}
                    </button>

                </div>
            </Modal>
        </div>
    );
};

export default ClinicTaskManager;