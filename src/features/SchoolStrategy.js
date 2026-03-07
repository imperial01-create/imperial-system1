// [신규] src/features/SchoolStrategy.js
import React, { useState, useEffect } from 'react';
import { 
    Brain, Search, Plus, TrendingUp, AlertCircle, FileText, Star, 
    BarChart3, MessageCircle, Edit3, Trash2, Loader, School, GraduationCap, ChevronRight
} from 'lucide-react';
import { collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const SchoolStrategy = ({ currentUser }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);
    const [isEditMode, setIsEditMode] = useState(false);
    
    // 권한 설정
    const isAdmin = currentUser.role === 'admin';
    const isLecturer = currentUser.role === 'lecturer';
    const canManage = isAdmin || isLecturer;

    const [formData, setFormData] = useState({
        schoolName: '', grade: '1학년', subject: '수학', term: '1학기 중간고사',
        difficulty: 3, // 1~5
        analysis: '', 
        proportions: { textbook: 40, workbook: 30, mock: 20, external: 10 },
        teacherTip: '',
        killerQuestions: ''
    });

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const reportsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'school_strategy');
            let q = query(reportsRef);

            // [핵심 로직] 학생/학부모는 본인 학교 정보만 필터링하여 보안 유지
            if (currentUser.role === 'student') {
                q = query(reportsRef, where('schoolName', '==', currentUser.schoolName), where('grade', '==', currentUser.grade));
            } else if (currentUser.role === 'parent' && currentUser.childId) {
                // 부모는 연결된 자녀의 학교 정보를 가져옴 (User 데이터에 저장된 값 기준)
                const studentSnap = await getDocs(query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), where('id', '==', currentUser.childId)));
                if (!studentSnap.empty) {
                    const sData = studentSnap.docs[0].data();
                    q = query(reportsRef, where('schoolName', '==', sData.schoolName), where('grade', '==', sData.grade));
                }
            }

            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // 최신순 정렬
            setReports(list.sort((a, b) => b.updatedAt?.seconds - a.updatedAt?.seconds));
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const handleSave = async () => {
        if (!formData.schoolName || !formData.analysis) return alert("필수 정보를 입력하세요.");
        try {
            const data = { ...formData, updatedAt: serverTimestamp(), authorName: currentUser.name };
            if (isEditMode) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'school_strategy', selectedReport.id), data);
            } else {
                data.createdAt = serverTimestamp();
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'school_strategy'), data);
            }
            setIsModalOpen(false);
            fetchReports();
            alert("전략 리포트가 저장되었습니다.");
        } catch (e) { alert(e.message); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'school_strategy', id));
        fetchReports();
    };

    const openEdit = (report) => {
        setFormData(report);
        setSelectedReport(report);
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6 animate-in fade-in pb-20">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-blue-100">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Brain className="text-blue-600" /> 학교별 내신 전략 리포트
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">우리 학교 시험 경향을 완벽하게 분석합니다.</p>
                </div>
                {canManage && <Button onClick={() => { setFormData({ schoolName: '', grade: '1학년', subject: '수학', term: '1학기 중간고사', difficulty: 3, analysis: '', proportions: { textbook: 40, workbook: 30, mock: 20, external: 10 }, teacherTip: '', killerQuestions: '' }); setIsEditMode(false); setIsModalOpen(true); }} icon={Plus}>리포트 작성</Button>}
            </div>

            {loading ? (
                <div className="flex flex-col items-center py-20 gap-3"><Loader className="animate-spin text-blue-600" size={40}/><p className="text-gray-400">리포트를 불러오는 중...</p></div>
            ) : reports.length === 0 ? (
                <Card className="text-center py-20 text-gray-400">아직 등록된 전략 리포트가 없습니다.</Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reports.map(r => (
                        <Card key={r.id} className="p-0 overflow-hidden hover:shadow-xl transition-all border-none shadow-md group">
                            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold uppercase">{r.term}</span>
                                        <span className="bg-yellow-400 text-blue-900 px-2 py-0.5 rounded text-xs font-bold">{r.subject}</span>
                                    </div>
                                    <h3 className="text-xl font-bold">{r.schoolName} {r.grade}</h3>
                                </div>
                                {canManage && (
                                    <div className="flex gap-2">
                                        <button onClick={() => openEdit(r)} className="p-2 bg-white/10 rounded-lg hover:bg-white/30 transition-colors"><Edit3 size={16}/></button>
                                        <button onClick={() => handleDelete(r.id)} className="p-2 bg-white/10 rounded-lg hover:bg-red-500/50 transition-colors"><Trash2 size={16}/></button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="p-6 space-y-5 bg-white">
                                {/* 난이도 및 비중 차트 시뮬레이션 */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <div className="text-[10px] font-bold text-gray-400 mb-1 flex items-center gap-1 uppercase tracking-wider"><Star size={10}/> 난이도</div>
                                        <div className="flex gap-1">
                                            {[1,2,3,4,5].map(lv => <div key={lv} className={`h-2 flex-1 rounded-full ${lv <= r.difficulty ? 'bg-blue-500' : 'bg-gray-200'}`} />)}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <div className="text-[10px] font-bold text-gray-400 mb-1 flex items-center gap-1 uppercase tracking-wider"><BarChart3 size={10}/> 주요 출제처</div>
                                        <div className="text-sm font-bold text-blue-700 truncate">
                                            {r.proportions?.textbook > r.proportions?.workbook ? '교과서 위주' : '부교재 변형 위주'}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="font-bold text-gray-800 flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-blue-500"/> 출제 경향 분석</h4>
                                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{r.analysis}</p>
                                </div>

                                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                                    <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-2 text-sm"><MessageCircle size={16}/> 선생님의 내신 공략 팁</h4>
                                    <p className="text-sm text-blue-700 font-medium">"{r.teacherTip}"</p>
                                </div>

                                <button onClick={() => { setSelectedReport(r); }} className="w-full py-3 bg-gray-50 rounded-xl text-gray-600 font-bold text-sm hover:bg-gray-100 transition-colors flex items-center justify-center gap-2">
                                    상세 분석 전체보기 <ChevronRight size={16}/>
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* 작성/수정 모달 */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`전략 리포트 ${isEditMode ? '수정' : '작성'}`}>
                <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 gap-4">
                        <input className="border p-3 rounded-xl bg-gray-50 w-full" placeholder="학교명 (예: 목동고)" value={formData.schoolName} onChange={e => setFormData({...formData, schoolName: e.target.value})} />
                        <select className="border p-3 rounded-xl bg-gray-50 w-full" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}>
                            <option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <input className="border p-3 rounded-xl bg-gray-50 w-full" placeholder="과목 (예: 수학)" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
                        <select className="border p-3 rounded-xl bg-gray-50 w-full" value={formData.term} onChange={e => setFormData({...formData, term: e.target.value})}>
                            <option value="1학기 중간고사">1학기 중간고사</option><option value="1학기 기말고사">1학기 기말고사</option>
                            <option value="2학기 중간고사">2학기 중간고사</option><option value="2학기 기말고사">2학기 기말고사</option>
                        </select>
                    </div>

                    <hr className="my-2"/>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">종합 난이도 (1: 매우쉬움 ~ 5: 매우어려움)</label>
                        <div className="flex gap-2">
                            {[1,2,3,4,5].map(v => (
                                <button key={v} onClick={() => setFormData({...formData, difficulty: v})} className={`flex-1 py-2 rounded-xl border transition-all ${formData.difficulty === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-400'}`}>{v}</button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">출제 비중 분석 (%)</label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2"><span>교과서</span><input type="number" className="border p-1 w-12 rounded" value={formData.proportions.textbook} onChange={e => setFormData({...formData, proportions: {...formData.proportions, textbook: Number(e.target.value)}})} /></div>
                            <div className="flex items-center gap-2"><span>부교재</span><input type="number" className="border p-1 w-12 rounded" value={formData.proportions.workbook} onChange={e => setFormData({...formData, proportions: {...formData.proportions, workbook: Number(e.target.value)}})} /></div>
                            <div className="flex items-center gap-2"><span>모의고사</span><input type="number" className="border p-1 w-12 rounded" value={formData.proportions.mock} onChange={e => setFormData({...formData, proportions: {...formData.proportions, mock: Number(e.target.value)}})} /></div>
                            <div className="flex items-center gap-2"><span>외부/프린트</span><input type="number" className="border p-1 w-12 rounded" value={formData.proportions.external} onChange={e => setFormData({...formData, proportions: {...formData.proportions, external: Number(e.target.value)}})} /></div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">상세 출제 경향 분석</label>
                        <textarea className="w-full border p-3 rounded-xl bg-gray-50 h-32" placeholder="전반적인 문항 스타일과 출제 포인트를 입력하세요" value={formData.analysis} onChange={e => setFormData({...formData, analysis: e.target.value})} />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">선생님의 한마디 (대비 전략)</label>
                        <input className="w-full border p-3 rounded-xl bg-blue-50 font-bold" placeholder="예: 'OO부교재 3회독이 고득점의 핵심입니다!'" value={formData.teacherTip} onChange={e => setFormData({...formData, teacherTip: e.target.value})} />
                    </div>

                    <Button className="w-full py-4" onClick={handleSave}>저장 및 발행</Button>
                </div>
            </Modal>

            {/* 상세 보기 모달 */}
            {selectedReport && !isModalOpen && (
                <Modal isOpen={!!selectedReport} onClose={() => setSelectedReport(null)} title={`${selectedReport.schoolName} 전략 리포트`}>
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border">
                             <div className="bg-blue-600 text-white p-3 rounded-xl"><School size={24}/></div>
                             <div>
                                 <div className="text-sm font-bold text-gray-500 uppercase">{selectedReport.term}</div>
                                 <h3 className="text-xl font-bold text-gray-800">{selectedReport.schoolName} {selectedReport.grade} {selectedReport.subject}</h3>
                             </div>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-bold text-gray-800 mb-2 flex items-center gap-2"><BarChart3 size={18} className="text-blue-500"/> 출제처 상세 비율</h4>
                                <div className="flex h-8 w-full rounded-full overflow-hidden border">
                                    <div className="bg-blue-500 h-full flex items-center justify-center text-[10px] text-white" style={{width: `${selectedReport.proportions.textbook}%`}}>교과서 {selectedReport.proportions.textbook}%</div>
                                    <div className="bg-indigo-500 h-full flex items-center justify-center text-[10px] text-white" style={{width: `${selectedReport.proportions.workbook}%`}}>부교재 {selectedReport.proportions.workbook}%</div>
                                    <div className="bg-teal-500 h-full flex items-center justify-center text-[10px] text-white" style={{width: `${selectedReport.proportions.mock}%`}}>모의고사 {selectedReport.proportions.mock}%</div>
                                    <div className="bg-gray-400 h-full flex items-center justify-center text-[10px] text-white" style={{width: `${selectedReport.proportions.external}%`}}>기타 {selectedReport.proportions.external}%</div>
                                </div>
                            </div>

                            <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><TrendingUp size={18} className="text-blue-500"/> 분석 리포트</h4>
                                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap text-sm">{selectedReport.analysis}</p>
                            </div>

                            <div className="p-5 bg-yellow-50 rounded-2xl border border-yellow-100 shadow-sm italic text-blue-900 font-medium">
                                <h4 className="font-bold mb-2 flex items-center gap-2 text-sm"><MessageCircle size={18} className="text-blue-600"/> 강사의 한마디</h4>
                                "{selectedReport.teacherTip}"
                            </div>
                        </div>
                        <Button className="w-full" variant="secondary" onClick={() => setSelectedReport(null)}>닫기</Button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default SchoolStrategy;