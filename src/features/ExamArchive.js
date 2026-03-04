import React, { useState, useEffect } from 'react';
import { 
  Search, FileText, CheckCircle, Link as LinkIcon, AlertCircle, Loader, 
  FileQuestion, BookOpen, PenTool, ExternalLink, Plus, ServerCrash 
} from 'lucide-react';
import { collection, query, where, getDocs, doc, runTransaction, updateDoc, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const FILE_TYPES = [
    { key: 'studentWork', label: '학생풀이(원본)', icon: FileQuestion },
    { key: 'examPaper', label: '시험지', icon: FileText },
    { key: 'quickAnswer', label: '빠른답지', icon: CheckCircle },
    { key: 'solution', label: '해설', icon: BookOpen },
    { key: 'analysis', label: '시험분석', icon: PenTool }
];

const ExamArchive = ({ currentUser }) => {
    const [filters, setFilters] = useState({
        schoolType: '', district: '', schoolName: '', year: '', semester: '', term: '', subject: '', grade: ''
    });
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // [서비스 가치] Alert 창 대신 Inline 에러 처리를 통해 UX 훼손(이탈률) 방지
    const [errorMsg, setErrorMsg] = useState('');
    
    const [modalState, setModalState] = useState({ type: null, exam: null, fileKey: null });
    const [uploadUrl, setUploadUrl] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const [showAdminAddModal, setShowAdminAddModal] = useState(false);
    const [newExamForm, setNewExamForm] = useState({
        schoolType: '고등학교', schoolName: '', year: '2024', semester: '1학기', term: '중간고사', subject: '수학', grade: '1학년', examPaperUrl: ''
    });

    const isAdmin = currentUser.role === 'admin';
    const isWorker = ['admin', 'lecturer', 'ta'].includes(currentUser.role);

    useEffect(() => {
        handleSearch();
        // eslint-disable-next-line
    }, []);

    const handleSearch = async () => {
        setLoading(true);
        setErrorMsg(''); // 검색 시작 시 에러 초기화
        
        try {
            const examsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive');
            let q = query(examsRef, limit(50)); 

            Object.keys(filters).forEach(key => {
                if (filters[key] && filters[key].trim() !== '') {
                    q = query(q, where(key, '==', filters[key].trim()));
                }
            });

            const snapshot = await getDocs(q);
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            results.sort((a, b) => b.year.localeCompare(a.year) || b.semester.localeCompare(a.semester));
            setExams(results);
        } catch (error) {
            console.error("Search Error:", error);
            // [방어적 코딩] 권한 에러와 일반 네트워크 에러를 구분하여 안내
            if (error.code === 'permission-denied') {
                setErrorMsg('데이터베이스 접근 권한이 차단되었습니다. Firebase 보안 규칙을 확인해주세요.');
            } else {
                setErrorMsg('데이터를 불러오는 중 문제가 발생했습니다. 네트워크 상태를 확인해주세요.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAdminSubmitExam = async () => {
        if (!newExamForm.schoolName.trim()) return alert("학교명을 입력해주세요.");
        setIsProcessing(true);
        
        try {
            const docData = {
                schoolType: newExamForm.schoolType,
                schoolName: newExamForm.schoolName,
                year: newExamForm.year,
                semester: newExamForm.semester,
                term: newExamForm.term,
                subject: newExamForm.subject,
                grade: newExamForm.grade,
                region: '서울',   
                district: '양천구', 
                files: {},
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            if (newExamForm.examPaperUrl.trim()) {
                docData.files.examPaper = {
                    status: 'published',
                    url: newExamForm.examPaperUrl,
                    workerId: currentUser.id,
                    workerName: currentUser.name
                };
            }

            const docRef = await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive'), docData);
            
            alert("신규 기출자료가 성공적으로 등록되었습니다.");
            setShowAdminAddModal(false);
            setNewExamForm({ ...newExamForm, schoolName: '', examPaperUrl: '' });
            
            setExams([{ id: docRef.id, ...docData }, ...exams]);
            setErrorMsg(''); // 등록 성공 시 에러 UI 해제
        } catch (error) {
            // [방어적 코딩] 관리자 업로드 시 권한 에러 명확화
            if (error.code === 'permission-denied') {
                alert("보안 에러: 기출문제를 등록할 권한이 없습니다. Firebase 콘솔에서 Firestore 보안 규칙을 먼저 업데이트해주세요.");
            } else {
                alert("등록 실패: " + error.message);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClaimTask = async (exam, fileKey) => {
        const fileLabel = FILE_TYPES.find(f => f.key === fileKey).label;
        if (!window.confirm(`[${fileLabel}] 작업을 시작하시겠습니까?`)) return;
        
        setIsProcessing(true);
        const examRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive', exam.id);

        try {
            let updatedFilesForState = null;
            await runTransaction(db, async (transaction) => {
                const examDoc = await transaction.get(examRef);
                if (!examDoc.exists()) throw new Error("문서를 찾을 수 없습니다.");

                const data = examDoc.data();
                const files = data.files || {};
                const currentFile = files[fileKey] || { status: 'open' };

                if (currentFile.status !== 'open') {
                    throw new Error(`이미 ${currentFile.workerName || '다른 사람'}님이 작업 중이거나 완료된 건입니다.`);
                }

                files[fileKey] = {
                    ...currentFile,
                    status: 'working',
                    workerId: currentUser.id,
                    workerName: currentUser.name
                };
                updatedFilesForState = files;
                transaction.update(examRef, { files, updatedAt: serverTimestamp() });
            });

            alert(`${fileLabel} 작업이 배정되었습니다!`);
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFilesForState } : e));
        } catch (error) { 
            error.code === 'permission-denied' ? alert("보안 권한이 없습니다.") : alert(error.message); 
        } finally { 
            setIsProcessing(false); 
        }
    };

    const handleSubmitLink = async () => {
        if (!uploadUrl.trim()) return alert("구글 드라이브 URL을 입력해주세요.");
        setIsProcessing(true);
        const { exam, fileKey } = modalState;
        const examRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive', exam.id);

        try {
            const updatedFiles = { ...(exam.files || {}) };
            updatedFiles[fileKey] = { ...updatedFiles[fileKey], status: 'pending', url: uploadUrl };

            await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
            alert("관리자에게 최종 승인을 요청했습니다.");
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFiles } : e));
            setModalState({ type: null, exam: null, fileKey: null });
            setUploadUrl('');
        } catch (error) { 
            error.code === 'permission-denied' ? alert("보안 권한이 없습니다.") : alert("제출 실패: " + error.message); 
        } finally { 
            setIsProcessing(false); 
        }
    };

    const handleApprove = async (exam, fileKey) => {
        if (!isAdmin) return;
        setIsProcessing(true);
        const examRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive', exam.id);

        try {
            const updatedFiles = { ...(exam.files || {}) };
            updatedFiles[fileKey] = { ...updatedFiles[fileKey], status: 'published' };
            await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
            
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFiles } : e));
            alert("승인 완료! 학생들에게 자료가 공개되었습니다.");
        } catch (error) { 
            error.code === 'permission-denied' ? alert("보안 권한이 없습니다.") : alert("승인 실패: " + error.message); 
        } finally { 
            setIsProcessing(false); 
        }
    };

    const renderFileBlock = (exam, ft) => {
        const fileData = exam.files?.[ft.key] || { status: 'open' };
        const Icon = ft.icon;
        
        return (
            <div key={ft.key} className="flex flex-col items-center justify-between p-3 rounded-xl border border-gray-200 bg-white h-full w-full shadow-sm hover:shadow-md transition-all">
                <div className="text-center mb-3">
                    <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2 ${fileData.status === 'published' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon size={20} />
                    </div>
                    <span className="text-xs font-bold text-gray-800 break-keep">{ft.label}</span>
                </div>

                <div className="w-full flex flex-col gap-1.5 mt-auto">
                    {fileData.status === 'open' && isWorker && (
                        <Button size="sm" variant="outline" className="w-full text-[11px] py-1 px-0 border-gray-300 text-gray-600 hover:text-blue-600 hover:border-blue-400" onClick={() => handleClaimTask(exam, ft.key)} disabled={isProcessing}>
                            제작하기
                        </Button>
                    )}
                    {fileData.status === 'working' && (
                        <>
                            <div className="bg-yellow-50 text-yellow-700 text-[10px] font-bold py-1 px-2 rounded text-center truncate w-full border border-yellow-200" title={`${fileData.workerName} 작업중`}>{fileData.workerName} 작업중</div>
                            {fileData.workerId === currentUser.id && (
                                <Button size="sm" variant="secondary" className="w-full text-[11px] py-1 px-0 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" onClick={() => setModalState({ type: 'upload_link', exam, fileKey: ft.key })}>
                                    링크 등록
                                </Button>
                            )}
                        </>
                    )}
                    {fileData.status === 'pending' && (
                        <>
                            <div className="bg-purple-50 text-purple-700 text-[10px] font-bold py-1 px-2 rounded text-center w-full border border-purple-200">검수 대기중</div>
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
        <div className="space-y-6 w-full animate-in fade-in">
            <div className="flex justify-between items-center mb-2">
                <div className="flex flex-col">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookOpen className="text-blue-600"/> 기출 아카이브</h2>
                    <span className="text-sm text-gray-500 font-medium mt-1">학교별 세부 자료 현황 관리</span>
                </div>
                {isAdmin && (
                    <Button onClick={() => setShowAdminAddModal(true)} icon={Plus} variant="primary">
                        자료 신규 등록
                    </Button>
                )}
            </div>

            <Card className="bg-white border border-gray-200 shadow-sm p-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.schoolType} onChange={e=>setFilters({...filters, schoolType: e.target.value})}>
                        <option value="">학교급</option><option value="중학교">중학교</option><option value="고등학교">고등학교</option>
                    </select>
                    <input className="border p-3 rounded-xl bg-gray-50" placeholder="학교명 (예: 목동고)" value={filters.schoolName} onChange={e=>setFilters({...filters, schoolName: e.target.value})} />
                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.year} onChange={e=>setFilters({...filters, year: e.target.value})}>
                        <option value="">연도</option><option value="2024">2024년</option><option value="2023">2023년</option>
                    </select>
                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.term} onChange={e=>setFilters({...filters, term: e.target.value})}>
                        <option value="">시험 구분</option><option value="중간">중간고사</option><option value="기말">기말고사</option>
                    </select>
                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.grade} onChange={e=>setFilters({...filters, grade: e.target.value})}>
                        <option value="">학년 전체</option><option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                    </select>
                </div>
                <Button className="w-full py-4 text-lg shadow-md" icon={Search} onClick={handleSearch} disabled={loading}>
                    {loading ? '데이터 불러오는 중...' : '조건 검색하기'}
                </Button>
            </Card>

            <Card className="p-0 overflow-hidden bg-gray-50">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm min-w-[1000px]">
                        <thead className="bg-white border-b text-gray-500">
                            <tr>
                                <th className="p-5 w-[20%]">학교 및 시험 정보</th>
                                <th className="p-5 w-[80%]">자료별 현황 및 관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {/* [서비스 가치] Error 상태일 때 친절한 UI 렌더링으로 학부모/학생 안심 유지 */}
                            {errorMsg ? (
                                <tr>
                                    <td colSpan="2" className="text-center py-16 bg-white">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="bg-red-50 p-4 rounded-full text-red-500"><ServerCrash size={32}/></div>
                                            <p className="text-gray-800 font-bold text-lg">{errorMsg}</p>
                                            <Button variant="outline" size="sm" onClick={handleSearch} className="mt-2">다시 시도하기</Button>
                                        </div>
                                    </td>
                                </tr>
                            ) : exams.length === 0 && !loading ? (
                                <tr><td colSpan="2" className="text-center py-12 text-gray-400 bg-white">조건에 맞는 자료가 없습니다.</td></tr>
                            ) : (
                                exams.map(exam => (
                                    <tr key={exam.id} className="hover:bg-gray-100/50 transition-colors bg-white">
                                        <td className="p-5 align-top border-r border-gray-100">
                                            <div className="font-bold text-gray-900 text-lg">{exam.schoolName}</div>
                                            <div className="text-sm text-gray-500 mb-3">{exam.region} {exam.district}</div>
                                            
                                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                                <div className="font-bold text-gray-700">{exam.year} {exam.semester} {exam.term}</div>
                                                <div className="text-sm font-bold text-blue-600 mt-1">{exam.subject} ({exam.grade})</div>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="grid grid-cols-5 gap-3 h-full">
                                                {FILE_TYPES.map(ft => renderFileBlock(exam, ft))}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* 관리자 신규 업로드 모달 */}
            <Modal isOpen={showAdminAddModal} onClose={() => setShowAdminAddModal(false)} title="기출자료 신규 등록">
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800 mb-4">
                        <p className="font-bold flex items-center gap-1 mb-1"><AlertCircle size={16}/> 데이터 관리 최적화</p>
                        <p>시험지 원본의 구글 드라이브 링크를 입력하면 <strong>즉시 학생들에게 배포(Published)</strong> 처리됩니다.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">학교명</label>
                            <input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50 text-base" placeholder="목동고" value={newExamForm.schoolName} onChange={e => setNewExamForm({...newExamForm, schoolName: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">학교급</label>
                            <select className="w-full border p-3 rounded-xl bg-gray-50" value={newExamForm.schoolType} onChange={e => setNewExamForm({...newExamForm, schoolType: e.target.value})}>
                                <option value="중학교">중학교</option><option value="고등학교">고등학교</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">학년</label>
                            <select className="w-full border p-3 rounded-xl bg-gray-50" value={newExamForm.grade} onChange={e => setNewExamForm({...newExamForm, grade: e.target.value})}>
                                <option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">과목</label>
                            <input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50 text-base" value={newExamForm.subject} onChange={e => setNewExamForm({...newExamForm, subject: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">연도</label>
                            <select className="w-full border p-3 rounded-xl bg-gray-50" value={newExamForm.year} onChange={e => setNewExamForm({...newExamForm, year: e.target.value})}>
                                <option value="2024">2024년</option><option value="2023">2023년</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">학기 및 시험</label>
                            <div className="flex gap-2">
                                <select className="w-1/2 border p-3 rounded-xl bg-gray-50" value={newExamForm.semester} onChange={e => setNewExamForm({...newExamForm, semester: e.target.value})}>
                                    <option value="1학기">1학기</option><option value="2학기">2학기</option>
                                </select>
                                <select className="w-1/2 border p-3 rounded-xl bg-gray-50" value={newExamForm.term} onChange={e => setNewExamForm({...newExamForm, term: e.target.value})}>
                                    <option value="중간고사">중간고사</option><option value="기말고사">기말고사</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <LinkIcon size={16}/> 시험지 원본 구글 드라이브 URL (선택)
                        </label>
                        <input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50 focus:bg-white transition-colors text-base" placeholder="https://drive.google.com/file/d/..." value={newExamForm.examPaperUrl} onChange={e => setNewExamForm({...newExamForm, examPaperUrl: e.target.value})}/>
                    </div>

                    <Button className="w-full mt-6 py-4 text-lg shadow-md" onClick={handleAdminSubmitExam} disabled={isProcessing}>
                        {isProcessing ? <Loader className="animate-spin mx-auto" /> : '아카이브 생성 및 배포'}
                    </Button>
                </div>
            </Modal>

            {/* 조교 작업용 링크 제출 모달 */}
            <Modal isOpen={modalState.type === 'upload_link'} onClose={() => { setModalState({ type: null, exam: null, fileKey: null }); setUploadUrl(''); }} title="자료 링크 등록">
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800 mb-4">
                        <p className="font-bold flex items-center gap-1 mb-1"><AlertCircle size={16}/> 용량 절약을 위한 정책</p>
                        <p>파일을 직접 업로드하지 않고, <strong>구글 드라이브 공유 링크(URL)</strong>를 붙여넣어 주세요.</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <LinkIcon size={16}/> {modalState.fileKey && FILE_TYPES.find(f => f.key === modalState.fileKey)?.label} 구글 드라이브 URL
                        </label>
                        <input className="w-full border p-4 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50 focus:bg-white transition-colors text-base" placeholder="https://drive.google.com/file/d/..." value={uploadUrl} onChange={e => setUploadUrl(e.target.value)}/>
                    </div>
                    <Button className="w-full mt-4 py-4 text-lg shadow-md" onClick={handleSubmitLink} disabled={isProcessing}>
                        {isProcessing ? <Loader className="animate-spin mx-auto" /> : '승인 요청하기'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default ExamArchive;