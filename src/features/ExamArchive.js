import React, { useState, useEffect } from 'react';
import { 
  Search, FileText, CheckCircle, Link as LinkIcon, AlertCircle, Loader, 
  FileQuestion, BookOpen, PenTool, ExternalLink, Plus, ServerCrash, 
  XCircle, Edit3, Trash2
} from 'lucide-react';
import { collection, query, where, getDocs, doc, runTransaction, updateDoc, serverTimestamp, limit, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal } from '../components/UI';
import { upsertExamData, INTEGRATED_COLLECTION } from '../utils/examDataManager'; 

const APP_ID = 'imperial-clinic-v1';

const FILE_TYPES = [
    { key: 'studentWork', label: '학생풀이(원본)', icon: FileQuestion },
    { key: 'examPaper', label: '시험지', icon: FileText },
    { key: 'quickAnswer', label: '빠른답지', icon: CheckCircle },
    { key: 'solution', label: '해설', icon: BookOpen },
    { key: 'analysis', label: '시험분석', icon: PenTool }
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2000 + 1 }, (_, i) => String(currentYear - i));

const ExamArchive = ({ currentUser }) => {
    const [filters, setFilters] = useState({
        schoolType: '', district: '', schoolName: '', year: '', combinedTerm: '', subject: '', grade: ''
    });
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [hasSearched, setHasSearched] = useState(false);
    
    const [modalState, setModalState] = useState({ type: null, exam: null, fileKey: null });
    const [uploadUrl, setUploadUrl] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const [showAddModal, setShowAddModal] = useState(false);
    
    const [newExamForm, setNewExamForm] = useState({
        schoolType: '고등학교', schoolName: '', year: String(currentYear), combinedTerm: '1학기 중간고사', subject: '수학', grade: '1학년', 
        urls: { studentWork: '', examPaper: '', quickAnswer: '', solution: '', analysis: '' }
    });

    const isAdmin = currentUser.role === 'admin';
    const isWorker = ['admin', 'lecturer', 'ta'].includes(currentUser.role);
    const canAddExam = ['admin', 'ta'].includes(currentUser.role);

    useEffect(() => {
    }, []);

    const handleSearch = async () => {
        setLoading(true);
        setErrorMsg('');
        setHasSearched(true); 
        
        try {
            const examsRef = collection(db, INTEGRATED_COLLECTION);
            let q = query(examsRef, limit(50)); 

            // [CTO 최적화] 검색 시 모든 파라미터를 강제 문자열로 비교
            Object.keys(filters).forEach(key => {
                if (key === 'combinedTerm' && filters.combinedTerm) {
                    const [sem, tm] = filters.combinedTerm.split(' ');
                    q = query(q, where('semester', '==', String(sem)), where('termType', '==', String(tm)));
                } else if (key !== 'combinedTerm' && filters[key] && filters[key].trim() !== '') {
                    q = query(q, where(key, '==', String(filters[key].trim())));
                }
            });

            const snapshot = await getDocs(q);
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            results.sort((a, b) => 
                String(a.schoolName || "").localeCompare(String(b.schoolName || "")) || 
                String(b.year || "").localeCompare(String(a.year || "")) || 
                String(b.semester || "").localeCompare(String(a.semester || ""))
            );
            setExams(results);
        } catch (error) {
            if (error.code === 'permission-denied') {
                setErrorMsg('데이터베이스 접근 권한이 차단되었습니다. Firebase 보안 규칙을 확인해주세요.');
            } else {
                setErrorMsg('데이터를 불러오는 중 문제가 발생했습니다. 네트워크 상태를 확인해주세요.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAddSubmitExam = async () => {
        if (!newExamForm.schoolName.trim()) return alert("학교명을 입력해주세요.");
        setIsProcessing(true);
        
        try {
            const [parsedSemester, parsedTerm] = newExamForm.combinedTerm.split(' ');

            const baseData = {
                schoolType: newExamForm.schoolType,
                schoolName: newExamForm.schoolName.trim(),
                year: String(newExamForm.year), // 강제 문자열 변환
                semester: parsedSemester,
                termType: parsedTerm,
                subject: newExamForm.subject,
                grade: newExamForm.grade,
                region: '서울',   
                district: '양천구', 
            };

            const updatePayload = {
                createdAt: serverTimestamp(), 
                files: {} 
            };

            FILE_TYPES.forEach(ft => {
                if (newExamForm.urls[ft.key]?.trim()) {
                    updatePayload.files[ft.key] = {
                        status: 'published',
                        url: newExamForm.urls[ft.key].trim(),
                        workerId: currentUser.id,
                        workerName: currentUser.name
                    };
                }
            });

            const docId = await upsertExamData(baseData, updatePayload);
            
            alert("신규 기출자료가 성공적으로 등록/병합되었습니다.");
            setShowAddModal(false);
            setNewExamForm({ 
                ...newExamForm, schoolName: '', 
                urls: { studentWork: '', examPaper: '', quickAnswer: '', solution: '', analysis: '' } 
            });
            
            setExams([{ id: docId, ...baseData, ...updatePayload }, ...exams.filter(e => e.id !== docId)]);
            setErrorMsg('');
        } catch (error) {
            error.code === 'permission-denied' 
                ? alert("보안 에러: 기출문제를 등록할 권한이 없습니다.") 
                : alert("등록 실패: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteExam = async (examId) => {
        if (!isAdmin) return;
        if (!window.confirm("정말로 이 통합 기출자료를 삭제하시겠습니까?\n(아카이브와 내신연구소에서 모두 삭제됩니다)")) return;
        
        setIsProcessing(true);
        try {
            await deleteDoc(doc(db, INTEGRATED_COLLECTION, examId));
            setExams(prev => prev.filter(e => e.id !== examId));
            alert("자료가 성공적으로 삭제되었습니다.");
        } catch (error) {
            alert("삭제 실패: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClaimTask = async (exam, fileKey) => {
        const fileLabel = FILE_TYPES.find(f => f.key === fileKey).label;
        if (!window.confirm(`[${fileLabel}] 작업을 시작하시겠습니까?`)) return;
        
        setIsProcessing(true);
        const examRef = doc(db, INTEGRATED_COLLECTION, exam.id);

        try {
            let updatedFilesForState = null;
            await runTransaction(db, async (transaction) => {
                const examDoc = await transaction.get(examRef);
                if (!examDoc.exists()) throw new Error("문서를 찾을 수 없습니다.");

                const data = examDoc.data();
                const files = data.files || {};
                const currentFile = files[fileKey] || { status: 'open' };

                if (currentFile.status !== 'open') throw new Error(`이미 ${currentFile.workerName || '다른 사람'}님이 작업 중이거나 완료된 건입니다.`);

                files[fileKey] = {
                    ...currentFile,
                    status: 'working',
                    workerId: currentUser.id,
                    workerName: currentUser.name
                };
                updatedFilesForState = files;
                transaction.update(examRef, { files: updatedFilesForState, updatedAt: serverTimestamp() });
            });

            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFilesForState } : e));
        } catch (error) { 
            error.code === 'permission-denied' ? alert("보안 권한이 없습니다.") : alert(error.message); 
        } finally { setIsProcessing(false); }
    };

    const handleCancelTask = async (exam, fileKey) => {
        if (!window.confirm("작업을 취소하시겠습니까?")) return;
        setIsProcessing(true);
        const examRef = doc(db, INTEGRATED_COLLECTION, exam.id);

        try {
            const updatedFiles = { ...(exam.files || {}) };
            delete updatedFiles[fileKey].workerId;
            delete updatedFiles[fileKey].workerName;
            updatedFiles[fileKey].status = 'open';

            await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFiles } : e));
        } catch (error) {
            alert("취소 실패: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSubmitLink = async () => {
        const { exam, fileKey, type } = modalState;
        
        if (type !== 'edit_link' && !uploadUrl.trim()) {
            return alert("구글 드라이브 URL을 입력해주세요.");
        }
        
        setIsProcessing(true);
        const examRef = doc(db, INTEGRATED_COLLECTION, exam.id);

        try {
            const updatedFiles = { ...(exam.files || {}) };
            
            if (type === 'edit_link') {
                if (!uploadUrl.trim()) {
                    delete updatedFiles[fileKey].workerId;
                    delete updatedFiles[fileKey].workerName;
                    delete updatedFiles[fileKey].url;
                    updatedFiles[fileKey].status = 'open';
                    
                    await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
                    alert("링크가 삭제되어 미작업(작업 대기) 상태로 돌아갔습니다.");
                } else {
                    updatedFiles[fileKey] = { ...updatedFiles[fileKey], url: uploadUrl };
                    await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
                    alert("링크가 성공적으로 수정되었습니다.");
                }
            } else {
                updatedFiles[fileKey] = { ...updatedFiles[fileKey], status: 'pending', url: uploadUrl };
                await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
                alert("관리자에게 최종 승인을 요청했습니다.");
            }

            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFiles } : e));
            setModalState({ type: null, exam: null, fileKey: null });
            setUploadUrl('');
        } catch (error) { 
            error.code === 'permission-denied' ? alert("보안 권한이 없습니다.") : alert("요청 실패: " + error.message); 
        } finally { setIsProcessing(false); }
    };

    const handleApprove = async (exam, fileKey) => {
        if (!isAdmin) return;
        setIsProcessing(true);
        const examRef = doc(db, INTEGRATED_COLLECTION, exam.id);

        try {
            const updatedFiles = { ...(exam.files || {}) };
            updatedFiles[fileKey] = { ...updatedFiles[fileKey], status: 'published' };
            await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
            
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFiles } : e));
            alert("승인 완료! 교직원에게 자료가 공개되었습니다.");
        } catch (error) { alert("승인 실패: " + error.message); } finally { setIsProcessing(false); }
    };

    const renderFileBlock = (exam, ft) => {
        const fileData = exam.files?.[ft.key] || { status: 'open' };
        const Icon = ft.icon;
        
        return (
            <div key={ft.key} className="flex flex-col items-center justify-between p-3 rounded-xl border border-gray-200 bg-white h-full w-full shadow-sm hover:shadow-md transition-all">
                <div className="text-center mb-3 relative w-full">
                    {isAdmin && fileData.status === 'published' && (
                        <button onClick={() => { setUploadUrl(fileData.url); setModalState({ type: 'edit_link', exam, fileKey: ft.key }); }} className="absolute top-0 right-0 p-1 text-gray-400 hover:text-blue-600 transition-colors" title="링크 수정">
                            <Edit3 size={14} />
                        </button>
                    )}
                    <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2 ${fileData.status === 'published' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon size={20} />
                    </div>
                    <span className="text-xs font-bold text-gray-800 break-keep">{ft.label}</span>
                </div>

                <div className="w-full flex flex-col gap-1.5 mt-auto">
                    {fileData.status === 'open' && isWorker && (
                        <Button size="sm" variant="outline" className="w-full text-[11px] py-1 px-0 border-gray-300 text-gray-600 hover:text-blue-600 hover:border-blue-400" onClick={() => handleClaimTask(exam, ft.key)} disabled={isProcessing}>
                            작업하기
                        </Button>
                    )}
                    {fileData.status === 'working' && (
                        <>
                            <div className="bg-yellow-50 text-yellow-700 text-[10px] font-bold py-1 px-2 rounded text-center truncate w-full border border-yellow-200" title={`${fileData.workerName} 작업중`}>{fileData.workerName}</div>
                            {fileData.workerId === currentUser.id && (
                                <div className="flex gap-1 w-full">
                                    <Button size="sm" variant="secondary" className="flex-1 text-[11px] py-1 px-0 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" onClick={() => { setUploadUrl(''); setModalState({ type: 'upload_link', exam, fileKey: ft.key }); }}>
                                        등록
                                    </Button>
                                    <Button size="sm" variant="outline" className="px-2 py-1 border-gray-300 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleCancelTask(exam, ft.key)} title="작업 취소">
                                        <XCircle size={14}/>
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                    {fileData.status === 'pending' && (
                        <>
                            <div className="bg-purple-50 text-purple-700 text-[10px] font-bold py-1 px-2 rounded text-center w-full border border-purple-200">검수 대기</div>
                            {isAdmin && (
                                <Button size="sm" variant="success" className="w-full text-[11px] py-1 px-0" onClick={() => handleApprove(exam, ft.key)} disabled={isProcessing}>
                                    승인
                                </Button>
                            )}
                        </>
                    )}
                    {fileData.status === 'published' && (
                        <a href={fileData.url} target="_blank" rel="noopener noreferrer" className="w-full block">
                            <Button size="sm" variant="primary" className="w-full text-[11px] py-1.5 px-0 flex items-center justify-center gap-1 shadow-sm"><ExternalLink size={12}/> 보기</Button>
                        </a>
                    )}
                    {fileData.status === 'open' && !isWorker && (
                         <div className="text-[11px] text-gray-400 text-center py-1">미등록</div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 w-full animate-in fade-in pb-20">
            <div className="flex justify-between items-center mb-2">
                <div className="flex flex-col">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookOpen className="text-blue-600"/> 기출 아카이브</h2>
                    <span className="text-sm text-gray-500 font-medium mt-1">학원 내부용 세부 자료 현황 관리 (학부모 접근 불가)</span>
                </div>
                {canAddExam && (
                    <Button onClick={() => setShowAddModal(true)} icon={Plus} variant="primary">
                        <span className="hidden sm:inline">자료 신규 등록</span><span className="sm:hidden">신규</span>
                    </Button>
                )}
            </div>

            <Card className="bg-white border border-gray-200 shadow-sm p-4 md:p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                    <select className="border p-3 rounded-xl bg-gray-50 w-full" value={filters.schoolType} onChange={e=>setFilters({...filters, schoolType: e.target.value})}>
                        <option value="">학교급</option><option value="중학교">중학교</option><option value="고등학교">고등학교</option>
                    </select>
                    <input className="border p-3 rounded-xl bg-gray-50 w-full" placeholder="학교명 (예: 목동고)" value={filters.schoolName} onChange={e=>setFilters({...filters, schoolName: e.target.value})} />
                    
                    <select className="border p-3 rounded-xl bg-gray-50 w-full" value={filters.year} onChange={e=>setFilters({...filters, year: e.target.value})}>
                        <option value="">연도 전체</option>
                        {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>

                    <select className="border p-3 rounded-xl bg-gray-50 w-full" value={filters.grade} onChange={e=>setFilters({...filters, grade: e.target.value})}>
                        <option value="">학년 전체</option><option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                    </select>
                    
                    <select className="col-span-2 md:col-span-1 lg:col-span-1 border p-3 rounded-xl bg-gray-50 w-full" value={filters.combinedTerm} onChange={e=>setFilters({...filters, combinedTerm: e.target.value})}>
                        <option value="">시험 전체</option>
                        <option value="1학기 중간고사">1학기 중간고사</option>
                        <option value="1학기 기말고사">1학기 기말고사</option>
                        <option value="2학기 중간고사">2학기 중간고사</option>
                        <option value="2학기 기말고사">2학기 기말고사</option>
                    </select>
                </div>
                <Button className="w-full py-3 md:py-4 text-base md:text-lg shadow-md" icon={Search} onClick={handleSearch} disabled={loading}>
                    {loading ? '검색 중...' : '조건 검색하기'}
                </Button>
            </Card>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                {errorMsg ? (
                    <div className="p-10 flex flex-col items-center gap-3 bg-white">
                        <div className="bg-red-50 p-4 rounded-full text-red-500"><ServerCrash size={32}/></div>
                        <p className="text-gray-800 font-bold text-center text-sm md:text-lg">{errorMsg}</p>
                        <Button variant="outline" size="sm" onClick={handleSearch} className="mt-2">다시 시도하기</Button>
                    </div>
                ) : exams.length === 0 && !loading ? (
                    <div className="text-center py-16 text-gray-400">
                        {!hasSearched ? "검색 조건을 설정하고 검색하기 버튼을 눌러주세요." : "조건에 맞는 기출 자료가 없습니다."}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {exams.map(exam => (
                            <div key={exam.id} className="p-4 md:p-6 flex flex-col lg:flex-row gap-4 lg:gap-6 hover:bg-gray-50/50 transition-colors">
                                <div className="w-full lg:w-1/4 shrink-0 flex flex-col justify-center">
                                    <div className="flex justify-between items-start">
                                        <div className="font-bold text-gray-900 text-lg md:text-xl">{exam.schoolName}</div>
                                        {isAdmin && (
                                            <button onClick={() => handleDeleteExam(exam.id)} className="text-red-400 hover:text-red-600 transition-colors mt-1" title="기출자료 전체 삭제">
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="bg-blue-50/50 p-2 md:p-3 rounded-lg border border-blue-100 w-fit mt-2">
                                        <div className="font-bold text-gray-700 text-sm">
                                            {exam.year} {String(exam.grade || '1학년').replace('학년', '')}-{String(exam.semester || '1학기').replace('학기', '')} {exam.termType || exam.term || '고사'} {exam.subject}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="w-full lg:w-3/4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
                                    {FILE_TYPES.map(ft => renderFileBlock(exam, ft))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="기출자료 신규 등록">
                <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-2 pb-4">
                    <div className="bg-blue-50 p-4 rounded-xl text-xs md:text-sm text-blue-800 mb-4">
                        <p className="font-bold flex items-center gap-1 mb-1"><AlertCircle size={16}/> 일괄 업로드 지원 (내신연구소 연동)</p>
                        <p>여기서 등록한 자료 정보는 <strong>내신 연구소에도 자동 연동</strong>됩니다.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">학교명</label>
                            <input className="w-full border p-2.5 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50" placeholder="목동고" value={newExamForm.schoolName} onChange={e => setNewExamForm({...newExamForm, schoolName: e.target.value})}/>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">학교급</label>
                            <select className="w-full border p-2.5 rounded-xl bg-gray-50" value={newExamForm.schoolType} onChange={e => setNewExamForm({...newExamForm, schoolType: e.target.value})}>
                                <option value="중학교">중학교</option><option value="고등학교">고등학교</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">학년</label>
                            <select className="w-full border p-2.5 rounded-xl bg-gray-50" value={newExamForm.grade} onChange={e => setNewExamForm({...newExamForm, grade: e.target.value})}>
                                <option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">과목</label>
                            <input className="w-full border p-2.5 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50" value={newExamForm.subject} onChange={e => setNewExamForm({...newExamForm, subject: e.target.value})}/>
                        </div>
                        
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">연도</label>
                            <select className="w-full border p-2.5 rounded-xl bg-gray-50" value={newExamForm.year} onChange={e => setNewExamForm({...newExamForm, year: e.target.value})}>
                                {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                        </div>
                        
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">학기 및 시험</label>
                            <select className="w-full border p-2.5 rounded-xl bg-gray-50 text-sm" value={newExamForm.combinedTerm} onChange={e => setNewExamForm({...newExamForm, combinedTerm: e.target.value})}>
                                <option value="1학기 중간고사">1학기 중간고사</option>
                                <option value="1학기 기말고사">1학기 기말고사</option>
                                <option value="2학기 중간고사">2학기 중간고사</option>
                                <option value="2학기 기말고사">2학기 기말고사</option>
                            </select>
                        </div>
                    </div>

                    <hr className="my-4 border-gray-200" />
                    <h3 className="font-bold text-gray-800">자료 링크 일괄 등록 (선택 사항)</h3>

                    {FILE_TYPES.map(ft => (
                        <div key={ft.key} className="pt-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
                                <LinkIcon size={14}/> {ft.label} URL
                            </label>
                            <input 
                                className="w-full border p-2.5 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50 text-sm" 
                                placeholder="링크가 없으면 비워두세요" 
                                value={newExamForm.urls[ft.key]} 
                                onChange={e => setNewExamForm({...newExamForm, urls: { ...newExamForm.urls, [ft.key]: e.target.value }})}
                            />
                        </div>
                    ))}

                    <Button className="w-full mt-6 py-4 text-base md:text-lg shadow-md" onClick={handleAddSubmitExam} disabled={isProcessing}>
                        {isProcessing ? <Loader className="animate-spin mx-auto" /> : '아카이브 생성 및 배포'}
                    </Button>
                </div>
            </Modal>

            <Modal isOpen={['upload_link', 'edit_link'].includes(modalState.type)} onClose={() => { setModalState({ type: null, exam: null, fileKey: null }); setUploadUrl(''); }} title={modalState.type === 'edit_link' ? "자료 링크 수정" : "자료 링크 등록"}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <LinkIcon size={16}/> {modalState.fileKey && FILE_TYPES.find(f => f.key === modalState.fileKey)?.label} URL
                        </label>
                        <input className="w-full border p-4 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50 text-base" placeholder="https://drive.google.com/file/d/..." value={uploadUrl} onChange={e => setUploadUrl(e.target.value)}/>
                    </div>
                    <Button className="w-full mt-4 py-3 md:py-4 text-base md:text-lg shadow-md" onClick={handleSubmitLink} disabled={isProcessing}>
                        {isProcessing ? <Loader className="animate-spin mx-auto" /> : modalState.type === 'edit_link' ? '수정 완료' : '승인 요청하기'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default ExamArchive;