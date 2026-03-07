import React, { useState } from 'react';
import { 
  Search, FileText, CheckCircle, Link as LinkIcon, AlertCircle, Loader, 
  FileQuestion, BookOpen, PenTool, ExternalLink, ShieldCheck, Plus
} from 'lucide-react';
import { collection, query, where, getDocs, doc, runTransaction, updateDoc, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const FILE_TYPES = [
    { key: 'studentWork', label: '학생풀이(원본)', icon: FileQuestion },
    { key: 'examPaper', label: '시험지', icon: FileText },
    { key: 'quickAnswer', label: '빠른답지', icon: CheckCircle },
    { key: 'solution', label: '해설', icon: BookOpen },
    { key: 'analysis', label: '시험분석', icon: PenTool }
];

const EXAM_TYPES = ['1학기 중간고사', '1학기 기말고사', '2학기 중간고사', '2학기 기말고사'];
const GRADES = ['1학년', '2학년', '3학년'];

const ExamArchive = ({ currentUser }) => {
    // 1. 명시적 검색을 위한 필터 상태
    const [filters, setFilters] = useState({
        schoolType: '', schoolName: '', year: '', examType: '', grade: '', subject: ''
    });
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false); // [비용 최적화] 초기 진입 시 로딩 방지용
    
    // 모달 관리
    const [modalState, setModalState] = useState({ type: null, exam: null, fileKey: null });
    const [uploadUrl, setUploadUrl] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // 신규 자료 등록 폼 상태
    const [newExam, setNewExam] = useState({
        region: '서울특별시', district: '양천구', schoolType: '', schoolName: '', 
        year: '', examType: '', grade: '', subject: ''
    });

    const isAdmin = currentUser.role === 'admin';
    const isWorker = ['admin', 'lecturer', 'ta'].includes(currentUser.role);

    // --- 1. 신규 기출자료 등록 (중복 검사 포함) ---
    const handleCreateExam = async () => {
        if (!newExam.schoolName || !newExam.year || !newExam.examType || !newExam.grade || !newExam.subject) {
            return alert("필수 항목(학교, 연도, 시험, 학년, 과목)을 모두 입력해주세요.");
        }
        
        setIsProcessing(true);
        try {
            const archiveRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive');
            
            // [서비스 가치] 복합 쿼리를 통한 완벽한 중복 등록 방지 (DB 오염 방지)
            const duplicateQuery = query(archiveRef, 
                where('schoolName', '==', newExam.schoolName.trim()),
                where('year', '==', newExam.year),
                where('examType', '==', newExam.examType),
                where('grade', '==', newExam.grade),
                where('subject', '==', newExam.subject.trim())
            );
            
            const snapshot = await getDocs(duplicateQuery);
            if (!snapshot.empty) {
                alert(`⚠️ 중복 등록 방지\n이미 동일한 자료(${newExam.schoolName} ${newExam.year} ${newExam.examType} ${newExam.grade} ${newExam.subject})가 시스템에 등록되어 있습니다.\n목록에서 검색하여 파일 작업을 진행해주세요.`);
                setIsProcessing(false);
                return;
            }

            // 신규 데이터 구조화 (초기 상태는 모두 'open')
            const payload = {
                ...newExam,
                schoolName: newExam.schoolName.trim(),
                subject: newExam.subject.trim(),
                files: {
                    studentWork: { status: 'open' },
                    examPaper: { status: 'open' },
                    quickAnswer: { status: 'open' },
                    solution: { status: 'open' },
                    analysis: { status: 'open' }
                },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await addDoc(archiveRef, payload);
            alert("신규 기출자료 베이스가 성공적으로 생성되었습니다. 이제 검색을 통해 작업을 시작할 수 있습니다.");
            setModalState({ type: null });
            
            // 폼 초기화
            setNewExam(prev => ({ ...prev, schoolName: '', subject: '' })); 
            
        } catch (error) {
            console.error(error);
            alert("등록 중 오류가 발생했습니다: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- 2. 명시적 검색 로직 (비용 최적화) ---
    const handleSearch = async () => {
        setLoading(true);
        setHasSearched(true); // 첫 검색 실행 마킹
        
        try {
            const examsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive');
            let q = query(examsRef, limit(50)); // 최대 50건 제한으로 요금 폭탄 방지

            Object.keys(filters).forEach(key => {
                if (filters[key] && filters[key].trim() !== '') {
                    q = query(q, where(key, '==', filters[key].trim()));
                }
            });

            const snapshot = await getDocs(q);
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // 프론트엔드 정렬 (연도 최신순)
            results.sort((a, b) => b.year.localeCompare(a.year) || b.examType.localeCompare(a.examType));
            setExams(results);
            
            if(results.length === 0) alert('검색 조건에 맞는 기출자료가 없습니다.');
        } catch (error) {
            console.error("Search Error:", error);
            alert("검색 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // --- 3. 동시성 제어 및 파일별 중복 방지 (Transaction) ---
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

            alert(`${fileLabel} 작업이 배정되었습니다! 자료 제작 후 링크를 등록해주세요.`);
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFilesForState } : e));
            
        } catch (error) {
            alert(error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- 4. 개별 파일 링크 제출 (용량 최적화) ---
    const handleSubmitLink = async () => {
        if (!uploadUrl.trim()) return alert("구글 드라이브 URL을 입력해주세요.");
        
        setIsProcessing(true);
        const { exam, fileKey } = modalState;
        const examRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive', exam.id);

        try {
            const updatedFiles = { ...(exam.files || {}) };
            updatedFiles[fileKey] = {
                ...updatedFiles[fileKey],
                status: 'pending',
                url: uploadUrl
            };

            await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
            
            alert("관리자에게 최종 승인을 요청했습니다.");
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFiles } : e));
            setModalState({ type: null, exam: null, fileKey: null });
            setUploadUrl('');
        } catch (error) {
            alert("제출 실패: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- 5. 관리자 개별 파일 승인 ---
    const handleApprove = async (exam, fileKey) => {
        if (!isAdmin) return;
        setIsProcessing(true);
        const examRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive', exam.id);

        try {
            const updatedFiles = { ...(exam.files || {}) };
            updatedFiles[fileKey] = {
                ...updatedFiles[fileKey],
                status: 'published'
            };

            await updateDoc(examRef, { files: updatedFiles, updatedAt: serverTimestamp() });
            
            setExams(prev => prev.map(e => e.id === exam.id ? { ...e, files: updatedFiles } : e));
            alert("승인 완료! 자료가 공식적으로 등록되었습니다.");
        } catch (error) {
            alert("승인 실패: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- 6. 보조 컴포넌트: 파일 상태별 UI 렌더링 ---
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
                            <div className="bg-yellow-50 text-yellow-700 text-[10px] font-bold py-1 px-2 rounded text-center truncate w-full border border-yellow-200" title={`${fileData.workerName} 작업중`}>
                                {fileData.workerName} 작업중
                            </div>
                            {fileData.workerId === currentUser.id && (
                                <Button size="sm" variant="secondary" className="w-full text-[11px] py-1 px-0 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" onClick={() => setModalState({ type: 'upload_link', exam, fileKey: ft.key })}>
                                    링크 등록
                                </Button>
                            )}
                        </>
                    )}

                    {fileData.status === 'pending' && (
                        <>
                            <div className="bg-purple-50 text-purple-700 text-[10px] font-bold py-1 px-2 rounded text-center w-full border border-purple-200">
                                검수 대기중
                            </div>
                            {isAdmin && (
                                <Button size="sm" variant="success" className="w-full text-[11px] py-1 px-0" onClick={() => handleApprove(exam, ft.key)} disabled={isProcessing}>
                                    승인
                                </Button>
                            )}
                        </>
                    )}

                    {fileData.status === 'published' && (
                        <a href={fileData.url} target="_blank" rel="noopener noreferrer" className="w-full block">
                            <Button size="sm" variant="primary" className="w-full text-[11px] py-1.5 px-0 flex items-center justify-center gap-1 shadow-sm">
                                <ExternalLink size={12}/> 자료 보기
                            </Button>
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
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookOpen className="text-blue-600"/> 기출문제 클라우드</h2>
                    <span className="text-sm text-gray-500 font-medium mt-1 inline-block">학교별 세부 자료 현황 관리</span>
                </div>
                {/* [서비스 가치] 스태프 전용 '신규 자료 등록' 버튼 노출 */}
                {isWorker && (
                    <Button onClick={() => setModalState({ type: 'create_exam' })} icon={Plus} variant="primary">
                        신규 자료 등록
                    </Button>
                )}
            </div>

            {/* 필터 바 */}
            <Card className="bg-white border border-gray-200 shadow-sm p-5">
                {/* [CTO 반영] 요청하신 [학교 - 연도 - 시험 - 학년 - 과목] 순서 재배치 */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.schoolType} onChange={e=>setFilters({...filters, schoolType: e.target.value})}>
                        <option value="">학교급</option><option value="중학교">중학교</option><option value="고등학교">고등학교</option>
                    </select>
                    <input className="border p-3 rounded-xl bg-gray-50" placeholder="학교명 (예: 목동고)" value={filters.schoolName} onChange={e=>setFilters({...filters, schoolName: e.target.value})} />
                    
                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.year} onChange={e=>setFilters({...filters, year: e.target.value})}>
                        <option value="">연도</option><option value="2024">2024년</option><option value="2023">2023년</option>
                    </select>
                    
                    {/* [CTO 반영] 1학기 중간고사 형태 통합 */}
                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.examType} onChange={e=>setFilters({...filters, examType: e.target.value})}>
                        <option value="">시험 종류</option>
                        {EXAM_TYPES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                    </select>

                    <select className="border p-3 rounded-xl bg-gray-50" value={filters.grade} onChange={e=>setFilters({...filters, grade: e.target.value})}>
                        <option value="">학년</option>
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>

                    <input className="border p-3 rounded-xl bg-gray-50" placeholder="과목 (예: 수학)" value={filters.subject} onChange={e=>setFilters({...filters, subject: e.target.value})} />
                </div>
                <Button className="w-full py-4 text-lg shadow-md" icon={Search} onClick={handleSearch} disabled={loading}>
                    {loading ? '데이터 불러오는 중...' : '조건 검색하기'}
                </Button>
            </Card>

            {/* 결과 테이블 */}
            <Card className="p-0 overflow-hidden bg-gray-50 min-h-[400px]">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm min-w-[1000px]">
                        <thead className="bg-white border-b text-gray-500">
                            <tr>
                                <th className="p-5 w-[25%]">학교 및 시험 정보</th>
                                <th className="p-5 w-[75%]">자료별 현황 및 관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {/* [CTO 반영] 첫 진입 시 아무 데이터도 불러오지 않고 안내 문구만 렌더링 */}
                            {!hasSearched && !loading && (
                                <tr>
                                    <td colSpan="2" className="text-center py-20 bg-white">
                                        <div className="flex flex-col items-center justify-center text-gray-400">
                                            <Search size={48} className="mb-3 opacity-20" />
                                            <p className="text-lg font-bold text-gray-600">상단에서 검색 조건을 설정하고 검색하기 버튼을 눌러주세요.</p>
                                            <p className="text-sm mt-1">서버 부하와 데이터 과금을 방지하기 위해 초기에는 자료를 표시하지 않습니다.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            
                            {hasSearched && exams.length === 0 && !loading && (
                                <tr><td colSpan="2" className="text-center py-12 text-gray-400 bg-white">조건에 맞는 기출자료가 없습니다.</td></tr>
                            )}

                            {exams.map(exam => (
                                <tr key={exam.id} className="hover:bg-gray-100/50 transition-colors bg-white">
                                    <td className="p-5 align-top border-r border-gray-100">
                                        <div className="font-bold text-gray-900 text-lg">{exam.schoolName}</div>
                                        <div className="text-sm text-gray-500 mb-3">{exam.region} {exam.district}</div>
                                        
                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                            <div className="font-bold text-gray-700">{exam.year} {exam.examType}</div>
                                            <div className="text-sm font-bold text-blue-600 mt-1">{exam.subject} ({exam.grade})</div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="grid grid-cols-5 gap-3 h-full">
                                            {FILE_TYPES.map(ft => renderFileBlock(exam, ft))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* 신규 자료 등록 모달 */}
            <Modal isOpen={modalState.type === 'create_exam'} onClose={() => setModalState({ type: null })} title="신규 기출자료 베이스 생성">
                <div className="space-y-4">
                    <div className="bg-yellow-50 p-4 rounded-xl text-sm text-yellow-800 mb-4 border border-yellow-200">
                        <p className="font-bold flex items-center gap-1 mb-1"><AlertCircle size={16}/> 중복 방지 시스템 가동중</p>
                        <p>새로운 자료를 생성하기 전, 시스템이 자동으로 중복(동일 학교, 연도, 시험, 과목 등) 여부를 검사합니다.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">학교급</label>
                            <select className="w-full border p-3 rounded-xl" value={newExam.schoolType} onChange={e=>setNewExam({...newExam, schoolType: e.target.value})}>
                                <option value="">선택</option><option value="중학교">중학교</option><option value="고등학교">고등학교</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">학교명</label>
                            <input className="w-full border p-3 rounded-xl" placeholder="예: 목동고" value={newExam.schoolName} onChange={e=>setNewExam({...newExam, schoolName: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">연도</label>
                            <select className="w-full border p-3 rounded-xl" value={newExam.year} onChange={e=>setNewExam({...newExam, year: e.target.value})}>
                                <option value="">선택</option><option value="2024">2024년</option><option value="2023">2023년</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">시험 종류</label>
                            <select className="w-full border p-3 rounded-xl" value={newExam.examType} onChange={e=>setNewExam({...newExam, examType: e.target.value})}>
                                <option value="">선택</option>
                                {EXAM_TYPES.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">학년</label>
                            <select className="w-full border p-3 rounded-xl" value={newExam.grade} onChange={e=>setNewExam({...newExam, grade: e.target.value})}>
                                <option value="">선택</option>
                                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">과목</label>
                            <input className="w-full border p-3 rounded-xl" placeholder="예: 수학" value={newExam.subject} onChange={e=>setNewExam({...newExam, subject: e.target.value})} />
                        </div>
                    </div>
                    
                    <Button className="w-full mt-4 py-4 text-lg shadow-md" onClick={handleCreateExam} disabled={isProcessing}>
                        {isProcessing ? <Loader className="animate-spin mx-auto" /> : '베이스 생성하기'}
                    </Button>
                </div>
            </Modal>

            {/* 링크 제출 모달 */}
            <Modal isOpen={modalState.type === 'upload_link'} onClose={() => { setModalState({ type: null, exam: null, fileKey: null }); setUploadUrl(''); }} title="자료 링크 등록">
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800 mb-4">
                        <p className="font-bold flex items-center gap-1 mb-1"><AlertCircle size={16}/> 용량 절약을 위한 정책</p>
                        <p>파일을 직접 업로드하지 않고, <strong>구글 드라이브 공유 링크(URL)</strong>를 붙여넣어 주세요.</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <LinkIcon size={16}/> 
                            {modalState.fileKey && FILE_TYPES.find(f => f.key === modalState.fileKey)?.label} 구글 드라이브 URL
                        </label>
                        <input 
                            className="w-full border p-4 rounded-xl focus:ring-2 focus:ring-blue-200 outline-none bg-gray-50 focus:bg-white transition-colors text-base" 
                            placeholder="https://drive.google.com/file/d/..." 
                            value={uploadUrl} 
                            onChange={e => setUploadUrl(e.target.value)}
                        />
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