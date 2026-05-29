/* [서비스 가치] 행정 및 클리닉 조교들의 수동 작업 피로도를 최소화하고 강사와의 비동기식 
  인수인계 루프를 정밀화하여 '구멍 없는 밀착 관리 학원 시스템'을 완성하는 조교 종합 관제 센터입니다.
  (🚀 CTO 핫픽스: 빈 화면 렌더링 에러의 원인이었던 누락 아이콘 Calendar, Loader 완벽 추가) */
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, Badge } from '../components/UI';
// 🚨 에러 원인 해결: Calendar, Loader 아이콘 import 추가
import { Phone, CheckCircle, Clock, AlertTriangle, MessageSquare, UserCheck, Search, FileText, Calendar, Loader } from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

const ClinicTaskManager = ({ currentUser }) => {
    const [currentTab, setCurrentTab] = useState('admin_call'); // admin_call 또는 clinic_floor
    const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
    const [tasks, setTasks] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTask, setSelectedTask] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // 실시간 데이터 구독 (소통 비용 제로화 아키텍처)
    useEffect(() => {
        setIsLoading(true);
        const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks'),
            where('targetDate', '==', targetDate)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setTasks(list);
            setIsLoading(false);
            
            // 실시간 업데이트 시 선택된 문서 동기화 유지
            if (selectedTask) {
                const updated = list.find(t => t.id === selectedTask.id);
                if (updated) setSelectedTask(updated);
            }
        }, (err) => {
            console.error(err);
            setIsLoading(false);
        });

        return () => unsub();
    }, [targetDate]);

    const filteredTasks = tasks.filter(t => 
        t.studentName.includes(searchQuery) || t.className.includes(searchQuery)
    );

    // 🚀 [행정조교 전용] 가벼운 확인 전화 상태 저장 퀵 토글
    const handleUpdateCallStatus = async (taskId, status) => {
        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks', taskId), {
                callStatus: status,
                updatedAt: serverTimestamp()
            });
        } catch (e) { alert('상태 변경 실패: ' + e.message); }
    };

    // 🚀 [클리닉조교 전용] 개별 학습 미션 항목별 체크박스 & 사유 동기화 모듈
    const handleItemCheckToggle = (index, isChecked) => {
        if (!selectedTask) return;
        const updatedItems = [...selectedTask.items];
        updatedItems[index].isCompleted = isChecked;
        if (isChecked) {
            updatedItems[index].incompleteDetails = ''; // 완료 체크 시 미완료 사유 자동 초기화
        }
        setSelectedTask({ ...selectedTask, items: updatedItems });
    };

    const handleItemDetailChange = (index, text) => {
        if (!selectedTask) return;
        const updatedItems = [...selectedTask.items];
        updatedItems[index].incompleteDetails = text;
        setSelectedTask({ ...selectedTask, items: updatedItems });
    };

    // 🚀 [클리닉조교 전용] 피드백 최종 저장 기능
    const handleSaveClinicReport = async () => {
        if (!selectedTask) return;
        
        // 유효성 검사: 완료 체크 안 된 항목 중 사유가 비어있는지 확인 (방어적 코딩)
        const hasOmits = selectedTask.items.some(item => !item.isCompleted && !item.incompleteDetails.trim());
        if (hasOmits) {
            return alert('완료하지 못한 임무는 반드시 [어디까지 했는지 사유/진도]를 기입해야 저장 가능합니다.');
        }

        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks', selectedTask.id), {
                items: selectedTask.items,
                attendanceStatus: 'completed', // 퇴실/완료 처리
                finalComment: selectedTask.finalComment,
                updatedAt: serverTimestamp()
            });
            alert('클리닉 결과 조치 보고가 완료되었습니다. 해당 피드백은 담당 강사 창으로 즉각 리포트됩니다.');
        } catch (e) { alert('저장 실패: ' + e.message); }
    };

    return (
        <div className="space-y-6 w-full animate-in fade-in max-w-7xl mx-auto pb-20">
            {/* 상단 컨트롤 라운지 */}
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button onClick={() => setCurrentTab('admin_call')} className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${currentTab === 'admin_call' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        📞 행정 데스크 (확인 전화 명단)
                    </button>
                    <button onClick={() => setCurrentTab('clinic_floor')} className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${currentTab === 'clinic_floor' ? 'bg-emerald-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        🔥 클리닉 룸 (학습 미션 수행)
                    </button>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Calendar size={18} className="text-gray-400" />
                    <input type="date" className="border p-2 rounded-xl outline-none text-sm font-bold bg-gray-50" value={targetDate} onChange={e => { setTargetDate(e.target.value); setSelectedTask(null); }} />
                </div>
            </div>

            {/* 메인 워크스페이스 구조 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 좌측 리스트 보드 */}
                <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-[650px]">
                    <div className="p-4 border-b bg-gray-50 rounded-t-2xl relative">
                        <input type="text" placeholder="학생 이름 또는 반 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-indigo-500" />
                        <Search className="absolute left-7 top-7 text-gray-400" size={14} />
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {isLoading ? (
                            <div className="py-20 text-center"><Loader className="animate-spin text-gray-400 mx-auto" /></div>
                        ) : filteredTasks.length === 0 ? (
                            <div className="text-center py-20 text-xs text-gray-400 font-bold">지정된 클리닉 태스크가 없습니다.</div>
                        ) : (
                            filteredTasks.map(task => {
                                const isCurrent = selectedTask?.id === task.id;
                                return (
                                    <button key={task.id} onClick={() => setSelectedTask(task)} className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${isCurrent ? 'bg-indigo-50/50 border-indigo-400 shadow-sm' : 'border-transparent bg-white hover:bg-gray-50'}`}>
                                        <div className="flex justify-between items-center w-full">
                                            <span className="font-black text-sm text-gray-900">{task.studentName} 학생</span>
                                            {currentTab === 'admin_call' ? (
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-black ${task.callStatus === 'confirmed' ? 'bg-green-100 text-green-700' : task.callStatus === 'no_answer' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {task.callStatus === 'confirmed' ? '통화완료' : task.callStatus === 'no_answer' ? '부재중' : '전화 미인증'}
                                                </span>
                                            ) : (
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-black ${task.attendanceStatus === 'completed' ? 'bg-blue-100 text-blue-700' : task.attendanceStatus === 'arrived' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {task.attendanceStatus === 'completed' ? '퇴실완료' : task.attendanceStatus === 'arrived' ? '학습중' : '입실대기'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-500 font-bold truncate max-w-full">반: {task.className}</div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 우측 인스펙션 피드백 패널 */}
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-[650px] overflow-hidden">
                    {!selectedTask ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2"><FileText size={48} className="opacity-20" /><p className="font-bold text-sm">좌측 리스트에서 관리할 학생 대상을 선택해 주세요.</p></div>
                    ) : (
                        <div className="flex flex-col h-full absolute inset-0 p-5 md:p-6 space-y-4 overflow-y-auto custom-scrollbar">
                            <div className="border-b pb-4 flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900">{selectedTask.studentName} <span className="text-xs font-normal text-gray-500">클리닉 마스터 프로필</span></h2>
                                    <p className="text-xs text-indigo-600 font-bold mt-1">배정 코스: {selectedTask.className}</p>
                                </div>
                                <Badge variant="outline" className="bg-gray-50 text-gray-700 font-bold">지시 날짜: {selectedTask.targetDate}</Badge>
                            </div>

                            {/* 📱 탭 A: 행정조교 확인전화 트래킹 관제탑 */}
                            {currentTab === 'admin_call' && (
                                <div className="space-y-6 animate-in fade-in-50">
                                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex items-center gap-3">
                                        <Phone className="text-indigo-600 shrink-0" size={20} />
                                        <div className="text-xs text-indigo-900 leading-relaxed font-medium">강사 구두 확약 완료건입니다. 학생에게 가볍게 <b>오늘 등원 의무 리마인드 통화</b>를 1회 돌려주시고 스위치를 조치해 주세요.</div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-600 block">확인 전화 콜 업무 조치</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button onClick={() => handleUpdateCallStatus(selectedTask.id, 'confirmed')} className={`py-3 rounded-xl border text-xs font-black transition-all ${selectedTask.callStatus === 'confirmed' ? 'bg-green-600 text-white border-green-600 shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>🟢 통화 완료 (확약)</button>
                                            <button onClick={() => handleUpdateCallStatus(selectedTask.id, 'no_answer')} className={`py-3 rounded-xl border text-xs font-black transition-all ${selectedTask.callStatus === 'no_answer' ? 'bg-amber-600 text-white border-amber-600 shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>🟡 통화 부재중</button>
                                            <button onClick={() => handleUpdateCallStatus(selectedTask.id, 'pending')} className={`py-3 rounded-xl border text-xs font-black transition-all ${selectedTask.callStatus === 'pending' || !selectedTask.callStatus ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>⚪ 미확인 상태로 리셋</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ✏️ 탭 B: 클리닉조교 항목 체크 및 사유 입력 엔진 */}
                            {currentTab === 'clinic_floor' && (
                                <div className="space-y-4 flex-1 flex flex-col min-h-0 animate-in fade-in-50">
                                    {/* 입실 현황 제어기 */}
                                    <div className="flex gap-2 items-center border-b pb-3 shrink-0">
                                        <span className="text-xs font-bold text-gray-600">입실 상태 조정:</span>
                                        {['waiting', 'arrived'].map((status) => (
                                            <button key={status} onClick={async () => await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'clinic_tasks', selectedTask.id), { attendanceStatus: status, updatedAt: serverTimestamp() })} className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${selectedTask.attendanceStatus === status ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                                {status === 'waiting' ? '입실 대기' : '공부 시작 (입실)'}
                                            </button>
                                        ))}
                                    </div>

                                    {/* 항목형 미션 리스트 */}
                                    <div className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                        <label className="text-xs font-black text-gray-700 flex items-center gap-1"><UserCheck size={14} className="text-emerald-600"/> 강사 인수인계 미션 목록 및 수행 검증</label>
                                        {selectedTask.items.map((item, idx) => (
                                            <div key={idx} className={`p-4 rounded-xl border transition-all flex flex-col gap-3 ${item.isCompleted ? 'bg-green-50/40 border-green-200' : 'bg-gray-50/50 border-gray-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <input type="checkbox" checked={item.isCompleted} onChange={(e) => handleItemCheckToggle(idx, e.target.checked)} className="w-5 h-5 accent-emerald-600 rounded cursor-pointer" id={`item_check_${idx}`} />
                                                    <label htmlFor={`item_check_${idx}`} className={`text-sm font-bold cursor-pointer ${item.isCompleted ? 'text-green-800 line-through' : 'text-gray-800'}`}>
                                                        {item.taskContent}
                                                    </label>
                                                </div>

                                                {/* 🚀 [CTO 패치] 미완료 체크 시 사유 및 진도 입력 인풋창 필수 노출 */}
                                                {!item.isCompleted && (
                                                    <div className="pl-8 animate-in slide-in-from-top-2 duration-200">
                                                        <div className="flex gap-1 items-center text-[11px] font-black text-amber-600 mb-1">
                                                            <AlertTriangle size={12}/> 완료하지 못한 경우 진도/사유 기입 필수
                                                        </div>
                                                        <input type="text" value={item.incompleteDetails || ''} onChange={(e) => handleItemDetailChange(idx, e.target.value)} placeholder="예: 쎈수학 p.22번 오답 하다가 퇴실함 / 재시험 60점으로 불합격" className="w-full border p-2 rounded-xl text-xs font-medium bg-white outline-none focus:ring-1 focus:ring-amber-500" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* 주관식 종합 코멘트 */}
                                    <div className="space-y-1.5 shrink-0 pt-2 border-t">
                                        <label className="text-xs font-black text-gray-700 flex items-center gap-1"><MessageSquare size={14} className="text-blue-500" /> 주관식 종합 특이사항 코멘트 (선택)</label>
                                        <textarea value={selectedTask.finalComment || ''} onChange={(e) => setSelectedTask({ ...selectedTask, finalComment: e.target.value })} placeholder="형식적인 코멘트여도 좋으나 태도 불량이나 특이사항 유무 시 기록 바랍니다." className="w-full border p-3 rounded-xl h-16 resize-none text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500" />
                                    </div>

                                    {/* 종합 전송 제어 단추 */}
                                    <button onClick={handleSaveClinicReport} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl text-sm shadow-md transition-colors shrink-0">
                                        🏁 클리닉 완료 처리 및 강사 리포트 전송
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClinicTaskManager;