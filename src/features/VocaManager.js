/* [서비스 가치] 학원 운영의 '극단적 투명성(Radical Transparency)'을 실현합니다.
   상세 학습 로그를 지연 로딩(Lazy Loading)으로 구현하여 데이터 요금은 최소화하되, 
   학부모에게는 "내 아이의 회차별 점수 향상과 오답 트래킹"을 가시적으로 증명합니다. */
import React, { useState, useEffect, useMemo } from 'react';
import { Search, Printer, RefreshCw, User, Award, Layers, Zap, FileText, Lock, Target, Crosshair, ShieldCheck, AlertTriangle, BookX, ArrowUpDown, ChevronRight, BarChart2, Calendar, Loader } from 'lucide-react';
import { Button, Card, Toast, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';
import { generateDailyVocaSet, processVocaTestResult } from '../utils/vocaEngine';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

const VocaManager = ({ currentUser }) => {
    const isAuthorized = currentUser?.role === 'admin' || currentUser?.role === 'admin_assistant' || 
                         (['lecturer', 'ta'].includes(currentUser?.role) && currentUser?.subject === '영어') ||
                         ['student', 'parent'].includes(currentUser?.role);

    const { users, classes, enrollments, englishStats } = useData();
    const [searchInput, setSearchInput] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [currentTestSession, setCurrentTestSession] = useState(null);
    const [wrongAnswers, setWrongAnswers] = useState(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState({ message: '', type: 'info' });

    const [viewMode, setViewMode] = useState('class'); 
    const [selectedClassId, setSelectedClassId] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'vocaProgress', direction: 'desc' });
    
    const [hellRoomModal, setHellRoomModal] = useState({ isOpen: false, loading: false, words: [] });
    const [historyLogModal, setHistoryLogModal] = useState({ isOpen: false, loading: false, sessions: [] });

    useEffect(() => {
        if (currentUser?.role === 'student') {
            setSelectedStudent(currentUser);
        } else if (currentUser?.role === 'parent' && currentUser?.linkedChildrenIds?.length > 0) {
            const firstChild = users.find(u => u.id === currentUser.linkedChildrenIds[0]);
            if (firstChild) setSelectedStudent(firstChild);
        }
    }, [currentUser, users]);

    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-5 animate-in fade-in zoom-in-95">
                <div className="bg-red-50 p-6 rounded-full border-4 border-red-100"><Lock className="text-red-500" size={48} /></div>
                <h2 className="text-2xl font-black text-gray-800">접근 권한이 차단되었습니다</h2>
                <p className="text-gray-500 font-bold text-center">영어과 소속 교직원 또는 수강생 전용 메뉴입니다.</p>
            </div>
        );
    }

    const showToast = (msg, type = 'success') => setToast({ message: msg, type });

    const availableClasses = useMemo(() => {
        if (['admin', 'admin_assistant', 'ta'].includes(currentUser?.role)) return classes;
        return classes.filter(c => c.lecturerId === currentUser?.id);
    }, [classes, currentUser]);

    const classStudentStats = useMemo(() => {
        if (!selectedClassId) return [];
        const studentIdsInClass = enrollments.filter(e => e.classId === selectedClassId && e.status === 'active').map(e => e.studentId);
        const rawData = studentIdsInClass.map(id => {
            const user = users.find(u => u.id === id);
            const stat = englishStats.find(s => s.studentId === id) || { vocaProgress: 0, vocaComprehension: 0, vocaRetention: 0, studyMode: 'pending' };
            return { user, stat };
        }).filter(item => item.user);

        return rawData.sort((a, b) => {
            const valA = a.stat[sortConfig.key] || 0;
            const valB = b.stat[sortConfig.key] || 0;
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        });
    }, [selectedClassId, enrollments, users, englishStats, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const handleSearch = () => {
        const student = users.find(u => u.role === 'student' && u.name === searchInput.trim());
        if (!student) return showToast('해당 학생이 존재하지 않습니다.', 'error');
        setSelectedStudent(student); setCurrentTestSession(null); 
    };

    const rawStat = englishStats.find(s => s.studentId === selectedStudent?.id);
    const studentStat = rawStat || null; // Voca 메뉴에서는 임시 데이터 껍데기를 만들지 않습니다.

    const handleChangeMode = async (mode) => {
        if (!selectedStudent || !studentStat || ['student', 'parent'].includes(currentUser?.role)) return;
        if (studentStat.studyMode === 'calibration' && studentStat.calibrationSessionsLeft > 0) {
            if (!window.confirm("현재 '영점 조절 딥스캔'이 진행 중입니다. 강제로 일반 모드로 변경하시겠습니까?")) return;
        }
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, selectedStudent.id);
            await updateDoc(statRef, { studyMode: mode, calibrationSessionsLeft: mode === 'calibration' ? 10 : 0 });
            showToast(`💡 학습 모드가 업데이트되었습니다.`);
        } catch (e) { showToast(e.message, 'error'); }
    };

    const handleGenerateSet = async () => {
        if (!selectedStudent) return;
        setIsGenerating(true);
        try {
            const testPayload = await generateDailyVocaSet(selectedStudent.id);
            setCurrentTestSession(testPayload);
            setWrongAnswers(new Set());
            showToast('🎯 맞춤형 40단어 및 50문항 셔플 시험지가 출고되었습니다.');
        } catch (error) { showToast(error.message, 'error'); } finally { setIsGenerating(false); }
    };

    const toggleAnswer = (num) => {
        setWrongAnswers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(num)) newSet.delete(num);
            else newSet.add(num);
            return newSet;
        });
    };

    const handleSubmitScores = async () => {
        if (!currentTestSession || isSubmitting) return;
        if (!window.confirm("채점 내역을 최종 마감하고 스탯에 반영하시겠습니까?")) return;
        setIsSubmitting(true);
        try {
            await processVocaTestResult(selectedStudent.id, currentTestSession.sessionNumber, Array.from(wrongAnswers));
            showToast('🎉 스탯이 실시간 업데이트되었습니다.', 'success');
            setCurrentTestSession(null); setWrongAnswers(new Set());
        } catch (e) { showToast(e.message, 'error'); } finally { setIsSubmitting(false); }
    };

    const fetchHellRoomWords = async () => {
        if (!selectedStudent) return;
        setHellRoomModal({ isOpen: true, loading: true, words: [] });
        try {
            const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${selectedStudent.id}/word_history`);
            const q = query(historyRef, where("status", "==", "chronic_error")); 
            const snap = await getDocs(q);
            const hellWords = snap.docs.map(d => ({ word: d.id, ...d.data() }));
            setHellRoomModal({ isOpen: true, loading: false, words: hellWords });
        } catch (error) {
            showToast("오답 데이터를 불러오지 못했습니다.", "error");
            setHellRoomModal({ isOpen: false, loading: false, words: [] });
        }
    };

    const fetchDetailedHistoryLog = async () => {
        if (!selectedStudent) return;
        setHistoryLogModal({ isOpen: true, loading: true, sessions: [] });
        try {
            const q = query(
                collection(db, `artifacts/${APP_ID}/public/data/test_sessions`),
                where("studentId", "==", selectedStudent.id),
                where("status", "==", "completed")
            );
            const snap = await getDocs(q);
            let sessions = snap.docs.map(d => d.data());
            
            sessions.sort((a, b) => b.sessionNumber - a.sessionNumber);
            setHistoryLogModal({ isOpen: true, loading: false, sessions: sessions.slice(0, 15) });
        } catch (error) {
            showToast("학습 로그를 불러오는 중 오류가 발생했습니다.", "error");
            setHistoryLogModal({ isOpen: false, loading: false, sessions: [] });
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-20 animate-in fade-in">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-800">
                        {['student', 'parent'].includes(currentUser?.role) ? '영단어 스탯 대시보드' : 'Voca 출제 & 클래스 관리'}
                    </h1>
                    <p className="text-sm font-bold text-gray-500 mt-1">
                        {['student', 'parent'].includes(currentUser?.role) 
                            ? '나의 초개인화 단어장과 숨겨진 약점(오답 지옥방)을 투명하게 확인하세요.' 
                            : '반별 위험군 식별 리더보드 및 초개인화 채점 시스템'}
                    </p>
                </div>

                {currentUser?.role === 'parent' && currentUser?.linkedChildrenIds?.length > 1 && (
                    <select 
                        className="p-3 border-2 border-indigo-200 rounded-xl bg-white font-black text-indigo-800 outline-none"
                        value={selectedStudent?.id || ''}
                        onChange={(e) => {
                            const child = users.find(u => u.id === e.target.value);
                            setSelectedStudent(child); setCurrentTestSession(null);
                        }}
                    >
                        {currentUser.linkedChildrenIds.map(childId => {
                            const child = users.find(u => u.id === childId);
                            return child ? <option key={child.id} value={child.id}>{child.name} 학생의 리포트 보기</option> : null;
                        })}
                    </select>
                )}
            </div>

            {!['student', 'parent'].includes(currentUser?.role) && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                    <div className="flex border-b border-gray-100 bg-gray-50">
                        <button onClick={() => setViewMode('class')} className={`flex-1 py-4 font-black text-sm transition-colors ${viewMode === 'class' ? 'text-blue-600 bg-white border-t-4 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>📋 내 클래스 위험군 뷰</button>
                        <button onClick={() => setViewMode('search')} className={`flex-1 py-4 font-black text-sm transition-colors ${viewMode === 'search' ? 'text-indigo-600 bg-white border-t-4 border-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}>🔍 특정 학생 정밀 검색</button>
                    </div>

                    <div className="p-6">
                        {viewMode === 'search' ? (
                            <div className="flex gap-4 max-w-xl mx-auto">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="text" className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold focus:border-indigo-500 transition-colors" placeholder="학생 이름 검색 (예: 홍길동)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}/>
                                </div>
                                <Button onClick={handleSearch} className="px-8 font-bold bg-indigo-600 hover:bg-indigo-700">조회</Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Layers className="text-blue-500"/>
                                    <select className="border-2 border-blue-200 p-2.5 rounded-xl font-black text-blue-900 outline-none focus:ring-2 focus:ring-blue-100" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                                        <option value="" disabled>확인할 반을 선택하세요</option>
                                        {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>

                                {selectedClassId && classStudentStats.length > 0 && (
                                    <div className="overflow-x-auto border border-gray-200 rounded-xl mt-4">
                                        <table className="w-full text-left bg-white whitespace-nowrap">
                                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-black border-b border-gray-200">
                                                <tr>
                                                    <th className="p-4">학생명</th>
                                                    <th className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('vocaProgress')}>진도율 <ArrowUpDown size={12} className="inline ml-1"/></th>
                                                    <th className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('vocaComprehension')}>이해도 <ArrowUpDown size={12} className="inline ml-1"/></th>
                                                    <th className="p-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('vocaRetention')}>
                                                        기억 유지력 <ArrowUpDown size={12} className="inline ml-1"/>
                                                        {sortConfig.key === 'vocaRetention' && sortConfig.direction === 'asc' && <span className="ml-2 text-rose-500 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">위험군 뷰</span>}
                                                    </th>
                                                    <th className="p-4">현재 모드</th>
                                                    <th className="p-4 text-right">관리</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {classStudentStats.map(({ user, stat }, idx) => (
                                                    <tr key={user.id} className={`hover:bg-blue-50/50 transition-colors ${selectedStudent?.id === user.id ? 'bg-blue-50' : ''}`}>
                                                        <td className="p-4 font-bold text-gray-800 flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs">{idx + 1}</div>
                                                            {user.name}
                                                        </td>
                                                        <td className="p-4 font-bold text-blue-600">{stat.vocaProgress || 0}%</td>
                                                        <td className="p-4 font-bold text-emerald-600">{stat.vocaComprehension || 0}%</td>
                                                        <td className="p-4 font-bold">
                                                            <span className={stat.vocaRetention < 60 ? 'text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full' : 'text-indigo-600'}>{stat.vocaRetention || 0}%</span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${stat.studyMode === 'calibration' ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-gray-100 text-gray-600'}`}>
                                                                {stat.studyMode === 'calibration' ? '🎯 영점 조절 중' : stat.studyMode === 'progress' ? '진도 모드' : stat.studyMode === 'basic' ? '기초 모드' : stat.studyMode === 'review' ? '복습 모드' : '미진행'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <button onClick={() => { setSelectedStudent(user); setCurrentTestSession(null); window.scrollTo(0, document.body.scrollHeight); }} className="text-blue-600 hover:text-blue-800 font-bold text-sm flex items-center justify-end gap-1 w-full">
                                                                상세 보기 <ChevronRight size={16}/>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {selectedClassId && classStudentStats.length === 0 && <div className="text-center p-8 text-gray-400 font-bold">이 반에 등록된 학생이 없습니다.</div>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 🚀 [CTO 패치] CAT 정보가 없는 학생일 경우 상담 메뉴로 유도하는 안내창으로 변경 */}
            {selectedStudent && !rawStat ? (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-10 animate-in fade-in zoom-in-95 text-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                        <Target className="text-gray-400" size={32} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-700 mb-2">초기 진단평가(CAT) 데이터가 없습니다.</h3>
                    <p className="text-gray-500 font-bold mb-2 text-sm leading-relaxed">
                        이 학생은 아직 영어 어휘력 진단(CAT)을 받지 않아 Voca 스탯이 활성화되지 않았습니다.
                    </p>
                    {!['student', 'parent'].includes(currentUser?.role) && (
                        <p className="text-indigo-600 font-black text-sm">
                            👉 좌측 메뉴의 [신규 상담 등록] 탭으로 이동하여 진단평가를 먼저 진행해 주세요.
                        </p>
                    )}
                </div>
            ) : (
            selectedStudent && studentStat && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-5 border-b border-slate-200 pb-4">
                        <div className="flex items-center gap-3">
                            <User className="text-indigo-600" size={28}/>
                            <span className="font-black text-2xl text-slate-800">{selectedStudent.name} <span className="text-lg font-bold text-gray-400">학생 리포트</span></span>
                            <span className="bg-indigo-100 text-indigo-700 font-black text-xs px-3 py-1.5 rounded-lg ml-2">Session {studentStat.vocaSession}</span>
                            
                            {studentStat.studyMode === 'calibration' && (
                                <span className="bg-amber-100 text-amber-700 border border-amber-200 font-black text-xs px-3 py-1.5 rounded-full flex items-center gap-1 ml-2 animate-pulse">
                                    <Crosshair size={12}/> 영점 조절 중 (남은 횟수: {studentStat.calibrationSessionsLeft})
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button onClick={fetchDetailedHistoryLog} className="bg-white border-2 border-blue-200 text-blue-600 hover:bg-blue-50 font-black text-sm px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95">
                                <BarChart2 size={18}/> 📊 성장 로그 및 상세 이력 보기
                            </button>
                            <button onClick={fetchHellRoomWords} className="bg-white border-2 border-rose-200 text-rose-600 hover:bg-rose-50 font-black text-sm px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95">
                                <BookX size={18}/> 나의 오답 지옥방 보기
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                        <div className="col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-wider flex items-center gap-2"><Zap size={14}/> AI Data Matrix</h4>
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100">
                                    <div className="text-[11px] font-bold text-blue-600 mb-1">어휘 진도율</div>
                                    <div className="text-2xl font-black text-blue-900">{studentStat.vocaProgress || 0}%</div>
                                </div>
                                <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100">
                                    <div className="text-[11px] font-bold text-emerald-600 mb-1">뜻 이해도</div>
                                    <div className="text-2xl font-black text-emerald-900">{studentStat.vocaComprehension || 0}%</div>
                                </div>
                                <div className={`rounded-xl p-3 border ${studentStat.vocaRetention < 60 ? 'bg-rose-50/50 border-rose-200' : 'bg-indigo-50/50 border-indigo-100'}`}>
                                    <div className={`text-[11px] font-bold mb-1 ${studentStat.vocaRetention < 60 ? 'text-rose-600' : 'text-indigo-600'}`}>기억 유지력</div>
                                    <div className={`text-2xl font-black flex items-center justify-center gap-1 ${studentStat.vocaRetention < 60 ? 'text-rose-700' : 'text-indigo-900'}`}>
                                        {studentStat.vocaRetention || 0}%
                                        {studentStat.vocaRetention < 60 && <AlertTriangle size={16} className="text-rose-500 animate-pulse"/>}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 bg-gray-800 p-4 rounded-xl border border-gray-700 text-sm font-bold text-white flex items-start gap-3 leading-relaxed shadow-inner">
                                <Award size={20} className="text-yellow-400 shrink-0 mt-0.5"/>
                                <div><span className="block text-gray-400 text-xs mb-1 uppercase tracking-wider">AI 분석 코멘트</span>{studentStat.vocaRubric}</div>
                            </div>
                        </div>

                        <div className="col-span-1 flex flex-col justify-center gap-3">
                            {!['student', 'parent'].includes(currentUser?.role) ? (
                                <Button onClick={handleGenerateSet} disabled={isGenerating} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-black h-16 w-full text-base shadow-lg transition-transform active:scale-95">
                                    {isGenerating ? <Loader className="animate-spin mx-auto" /> : <span className="flex items-center justify-center gap-2"><FileText size={20}/> 오늘의 맞춤 시험지 발급</span>}
                                </Button>
                            ) : (
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center h-16 flex items-center justify-center font-bold text-blue-800 text-sm">
                                    선생님이 시험지를 발급해주시면 아래에서 인쇄할 수 있습니다.
                                </div>
                            )}

                            {currentTestSession && (
                                <button onClick={() => window.print()} className="text-sm font-bold text-slate-600 hover:text-slate-900 bg-white py-3 rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-colors flex justify-center items-center gap-2 shadow-sm">
                                    <Printer size={16}/> {['student', 'parent'].includes(currentUser?.role) ? '내 맞춤 단어장 인쇄하기' : '시험지 인쇄 창 열기'}
                                </button>
                            )}
                        </div>
                    </div>

                    {!['student', 'parent'].includes(currentUser?.role) && (
                        <div className="border-t border-slate-200 pt-5 flex flex-col sm:flex-row items-center gap-4">
                            <div className="text-sm font-black text-slate-600 flex items-center gap-1.5"><Layers size={18} className="text-indigo-500"/> 강사지정 학습 모드 :</div>
                            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1">
                                {[
                                    { id: 'calibration', label: '🎯 영점 조절', desc: 'Z1+Z2 딥스캔' },
                                    { id: 'progress', label: '🚀 진도 모드', desc: '신규 60%' },
                                    { id: 'basic', label: '🧱 기초 모드', desc: '복습 40%' },
                                    { id: 'review', label: '🔄 복습 모드', desc: '복습 80%' }
                                ].map(m => (
                                    <button
                                        key={m.id} onClick={() => handleChangeMode(m.id)}
                                        className={`min-w-[90px] flex-none px-3 py-2.5 rounded-xl border-2 font-black text-xs transition-all flex flex-col items-center justify-center
                                            ${(studentStat.studyMode || 'progress') === m.id 
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md transform -translate-y-0.5' 
                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        <span>{m.label}</span>
                                        <span className={`text-[10px] font-bold mt-0.5 ${(studentStat.studyMode || 'progress') === m.id ? 'text-blue-200' : 'text-slate-400'}`}>{m.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}

            {currentTestSession && !['student', 'parent'].includes(currentUser?.role) && (
                <Card className="p-8 bg-white border-2 border-emerald-100 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-5 mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-gray-800 mb-1 flex items-center gap-2"><ShieldCheck className="text-emerald-500"/> 고속 채점 그리드</h2>
                            <p className="text-sm font-bold text-rose-500">조교님, 학생이 틀린 번호만 클릭하여 빨간색으로 변경해 주세요.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-3 mb-8">
                        {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                            <button
                                key={num} onClick={() => toggleAnswer(num)}
                                className={`h-14 rounded-xl font-black text-xl transition-all border-2 
                                    ${wrongAnswers.has(num) 
                                        ? 'bg-rose-500 text-white border-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.4)] scale-105' 
                                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                                    }`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-50 p-5 rounded-2xl border border-slate-200 gap-4">
                        <div className="text-lg font-bold text-slate-700">
                            오답 문항 수 : <span className="text-rose-600 font-black text-2xl mx-1">{wrongAnswers.size}</span> 개 
                            <span className="mx-3 text-slate-300">|</span>
                            정답률 : <span className="text-emerald-600 font-black text-2xl mx-1">{((50 - wrongAnswers.size) / 50 * 100).toFixed(0)}</span> %
                        </div>
                        <Button onClick={handleSubmitScores} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 font-black text-lg px-10 py-4 shadow-lg w-full sm:w-auto">
                            {isSubmitting ? <Loader className="animate-spin mx-auto" /> : '채점 마감 및 스탯 반영하기'}
                        </Button>
                    </div>
                </Card>
            )}

            <Modal isOpen={historyLogModal.isOpen} onClose={() => setHistoryLogModal({ isOpen: false, loading: false, sessions: [] })} title={`${selectedStudent?.name} 학생의 회차별 상세 로그`}>
                <div className="p-2">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-6 text-sm text-blue-800 font-bold leading-relaxed flex items-start gap-2 shadow-sm">
                        <Award className="shrink-0 text-blue-500 mt-0.5" size={18}/>
                        <div>투명한 데이터가 신뢰를 만듭니다.<br/>학생이 지난 회차에서 어떤 점수를 받았고, 어떤 단어에서 약점을 보였는지 추적합니다. (최근 15회차)</div>
                    </div>
                    
                    {historyLogModal.loading ? (
                        <div className="py-10 flex flex-col items-center justify-center text-gray-400 font-bold gap-3">
                            <Loader className="animate-spin text-blue-500" size={32}/> 학습 이력을 불러오는 중입니다...
                        </div>
                    ) : (
                        historyLogModal.sessions.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 font-black text-lg">아직 완료된 시험 기록이 없습니다.</div>
                        ) : (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                                {historyLogModal.sessions.map((sess, idx) => (
                                    <div key={sess.testId} className="bg-white border-2 border-gray-100 p-5 rounded-2xl shadow-sm flex flex-col gap-3">
                                        <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-blue-600 text-white font-black text-xs px-2.5 py-1 rounded-lg">Session {sess.sessionNumber}</span>
                                                <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Calendar size={12}/> {sess.completedAt ? new Date(sess.completedAt.seconds * 1000).toLocaleDateString() : '날짜 정보 없음'}</span>
                                            </div>
                                            <div className="font-black text-xl text-slate-800">
                                                정답률: <span className={sess.sessionScore >= 80 ? 'text-emerald-600' : 'text-rose-600'}>{sess.sessionScore || 0}%</span>
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <span className="text-xs font-black text-gray-500 mb-2 block">해당 회차 오답 내역 ({sess.wrongCount || 0}개)</span>
                                            {sess.wrongWordsDetails && sess.wrongWordsDetails.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {sess.wrongWordsDetails.map((w, wIdx) => (
                                                        <span key={wIdx} className="bg-rose-50 border border-rose-200 text-rose-700 px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1">
                                                            {w.word} <span className="font-normal text-rose-400">|</span> {w.meaning}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg inline-block">🎉 만점! 틀린 단어가 없습니다.</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </Modal>

            <Modal isOpen={hellRoomModal.isOpen} onClose={() => setHellRoomModal({ isOpen: false, loading: false, words: [] })} title={`${selectedStudent?.name} 학생의 오답 지옥방`}>
                <div className="p-2">
                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 mb-4 text-sm text-rose-800 font-bold leading-relaxed flex items-start gap-2 shadow-sm">
                        <AlertTriangle className="shrink-0 text-rose-500 mt-0.5" size={18}/>
                        <div>여기에 등록된 단어들은 최근 3번 이상 반복해서 틀려 <strong>'만성 오답(Chronic Error)'</strong>으로 분류된 단어들입니다. AI가 다음 숙제 출제 시 최우선 순위로 강제 출제합니다.</div>
                    </div>
                    
                    {hellRoomModal.loading ? (
                        <div className="py-10 flex flex-col items-center justify-center text-gray-400 font-bold gap-3">
                            <Loader className="animate-spin text-rose-500" size={32}/> 데이터를 분석 중입니다...
                        </div>
                    ) : (
                        hellRoomModal.words.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 font-black text-lg">
                                🎉 축하합니다!<br/>현재 지옥방에 갇힌 만성 오답 단어가 없습니다.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                                {hellRoomModal.words.map((w, idx) => (
                                    <div key={idx} className="bg-white border border-gray-200 p-3 rounded-xl shadow-sm text-center flex flex-col gap-1 relative overflow-hidden group hover:border-rose-300 transition-colors">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                                        <span className="font-black text-gray-800 text-lg">{w.word}</span>
                                        <span className="text-[10px] text-gray-400 font-bold">오답 횟수: <span className="text-rose-600">{w.incorrectCount}</span>회</span>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </Modal>

            {currentTestSession && (
                <div className="print-only-section">
                    <div className="p-8">
                        <div className="flex justify-between items-end border-b-4 border-slate-800 pb-4 mb-6">
                            <div>
                                <h1 className="text-3xl font-black text-slate-800 mb-2">초개인화 맞춤 단어장</h1>
                                <p className="text-sm font-bold text-slate-500">
                                    {selectedStudent?.name} 학생 전용 데이터 (Session {currentTestSession.sessionNumber})
                                    {studentStat?.studyMode === 'calibration' && ' - [영점 조절 딥스캔 진행 중]'}
                                </p>
                            </div>
                            <div className="text-right text-sm font-bold text-slate-500">목동임페리얼학원 영어과</div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-10 gap-y-5">
                            {currentTestSession.wordsForPrint.map((word, idx) => (
                                <div key={idx} className="flex border-b border-slate-300 pb-2 items-center">
                                    <div className="w-1/2 font-black text-xl text-slate-800 pr-4 border-r-2 border-dashed border-slate-400 break-words">{word.word}</div>
                                    <div className="w-1/2 pl-4 text-sm font-bold text-slate-700 flex flex-col justify-center">
                                        {word.meanings.map((m, mIdx) => <span key={mIdx} className="mb-0.5">{mIdx + 1}. {m.koreanMeaning}</span>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="page-break p-8">
                        <div className="flex justify-between items-end border-b-4 border-slate-800 pb-4 mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-slate-800 mb-2">데일리 Voca 평가 (10분)</h1>
                                <p className="text-sm font-bold text-slate-500">
                                    {selectedStudent?.name} / 맞은 개수: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 50
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                            {currentTestSession.questionsForTest.map((q, idx) => (
                                <div key={idx} className="flex flex-col">
                                    <div className="flex items-start text-lg">
                                        <span className="w-8 font-black text-slate-400 mt-1">{q.questionNumber}.</span>
                                        <div className="flex-1">
                                            <span className="font-bold text-slate-800 leading-relaxed">{q.wordText}</span>
                                            {q.hint && <span className="ml-2 text-sm font-black text-slate-500">{q.hint}</span>}
                                        </div>
                                    </div>
                                    <div className="ml-8 mt-4 border-b-2 border-slate-400 h-2 w-[90%]"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VocaManager;