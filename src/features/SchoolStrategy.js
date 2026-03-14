import React, { useState, useEffect } from 'react';
import { db } from '../firebase'; 
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';

// --- [아이콘 컴포넌트 추가/수정] ---
const IconChart = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>;
const IconFile = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>;
const IconLock = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>;
const IconArrowLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>;
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconEdit = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconX = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconChevronDown = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
const IconChevronUp = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>;

// 통합 DB 경로 상수 설정
const APP_ID = 'imperial-clinic-v1';
const DB_COLLECTION = `artifacts/${APP_ID}/public/data/school_strategies`;

export default function SchoolStrategy({ currentUser }) {
  const user = currentUser || { role: 'admin', school: '영일고' }; 
  
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 글로벌 설정 (관리자 필터링 로직)
  const [activeTerm, setActiveTerm] = useState("1-1 중간고사");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [tempActiveTerm, setTempActiveTerm] = useState("");

  // viewState.view: 'list' | 'detail' | 'form'
  const [viewState, setViewState] = useState({ view: 'list', selectedId: null, selectedQuestion: null });
  const [memoInputs, setMemoInputs] = useState({});
  const [formData, setFormData] = useState(null);

  // UX 상태 관리: 세부정보 및 문항 리스트 아코디언 상태
  const [showDetails, setShowDetails] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);

  const isStaff = ['admin', 'lecturer', 'ta'].includes(user.role);
  const isAdmin = user.role === 'admin';
  const isStudentOrParent = ['student', 'parent'].includes(user.role);

  // 1. 활성 학기 설정 가져오기
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'school_strategy'));
        if (docSnap.exists() && docSnap.data().activeTerm) {
          setActiveTerm(docSnap.data().activeTerm);
        }
      } catch (e) {
        console.error("설정 불러오기 실패:", e);
      }
    };
    fetchSettings();
  }, []);

  // 2. 리포트 데이터 실시간 구독
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, DB_COLLECTION), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const filteredData = data.filter(report => {
          if (isStudentOrParent) {
            // [버그 픽스 및 최적화] 공백 제거 후 비교하여 매칭 오류 방지
            const reportTerm = report.term ? report.term.trim() : "";
            const currentActiveTerm = activeTerm ? activeTerm.trim() : "";
            const reportSchool = report.school ? report.school.trim() : "";
            const userSchool = user.school ? user.school.trim() : "";

            return !report.isDeleted && reportTerm === currentActiveTerm && reportSchool === userSchool;
          } else if (isAdmin) {
            return true; 
          } else {
            return !report.isDeleted; 
          }
        });

        filteredData.sort((a, b) => {
          if (a.type === 'trend' && b.type !== 'trend') return -1;
          if (a.type !== 'trend' && b.type === 'trend') return 1;
          return new Date(b.createdAt) - new Date(a.createdAt); 
        });

        setReports(filteredData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore 데이터 불러오기 에러:", error);
        alert("데이터를 불러오는데 실패했습니다. 권한을 확인해주세요.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user, isStudentOrParent, isAdmin, activeTerm]);

  // --- 관리자 활성 학기 설정 ---
  const handleSaveActiveTerm = async () => {
    try {
      await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'school_strategy'), { activeTerm: tempActiveTerm }, { merge: true });
      setActiveTerm(tempActiveTerm);
      setIsSettingsModalOpen(false);
      alert('활성 학기 설정이 저장되었습니다.');
    } catch (e) {
      alert('설정 저장 실패: 권한을 확인하세요.');
    }
  };

  // --- 삭제 및 복구 로직 ---
  const handleSoftDelete = async (id) => {
    if (window.confirm('이 리포트를 휴지통으로 이동하시겠습니까? (관리자만 복구 가능)')) {
      await updateDoc(doc(db, DB_COLLECTION, id), { isDeleted: true });
      if(viewState.view === 'detail') setViewState({ view: 'list', selectedId: null, selectedQuestion: null });
    }
  };

  const handleRestore = async (id) => {
    if (window.confirm('이 리포트를 다시 복구하시겠습니까?')) {
      await updateDoc(doc(db, DB_COLLECTION, id), { isDeleted: false });
    }
  };

  const handleHardDelete = async (id) => {
    if (window.confirm('정말 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      await deleteDoc(doc(db, DB_COLLECTION, id));
      if(viewState.view === 'detail') setViewState({ view: 'list', selectedId: null, selectedQuestion: null });
    }
  };

  // --- 폼(Form) 핸들링 로직 ---
  const openForm = (existingReport = null) => {
    if (existingReport) {
      setFormData({ ...existingReport });
    } else {
      setFormData({
        type: 'individual', year: new Date().getFullYear().toString(), school: '', term: activeTerm, subject: '', 
        teacher: '', difficulty: '중', mcCount: 0, saCount: 0, essayCount: 0, 
        suppBook: '', print: '', scope: '', review: '', specialNotes: '', 
        gradeCuts: { grade1: '', grade2: '' }, questions: [],
        trendData: [], scopeChanges: [], teacherStyles: [], isDeleted: false
      });
    }
    setViewState({ view: 'form', selectedId: existingReport ? existingReport.id : null, selectedQuestion: null });
  };

  const handleSaveReport = async () => {
    if(!formData.school || !formData.subject || !formData.year) {
      alert("년도, 학교명, 과목은 필수 입력입니다."); return;
    }
    setLoading(true);
    try {
      const payload = { ...formData, updatedAt: new Date().toISOString() };
      if (viewState.selectedId) {
        await updateDoc(doc(db, DB_COLLECTION, viewState.selectedId), payload);
        alert('성공적으로 수정되었습니다.');
        setViewState({ view: 'detail', selectedId: viewState.selectedId, selectedQuestion: null });
      } else {
        payload.createdAt = new Date().toISOString();
        const newDoc = await addDoc(collection(db, DB_COLLECTION), payload);
        alert('새 리포트가 추가되었습니다.');
        setViewState({ view: 'detail', selectedId: newDoc.id, selectedQuestion: null });
      }
    } catch (e) {
      console.error(e);
      alert('저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleArrayChange = (field, index, key, value) => {
    const newArray = [...formData[field]];
    newArray[index][key] = value;
    setFormData({ ...formData, [field]: newArray });
  };
  
  // IDI 점수 변경 및 난이도 자동 계산 로직
  const handleIdiChange = (index, key, value) => {
    let numVal = parseInt(value, 10);
    if (isNaN(numVal)) numVal = 1;
    if (numVal < 1) numVal = 1;
    if (numVal > 5) numVal = 5;

    const newArray = [...formData.questions];
    newArray[index][key] = numVal;

    // 총점 계산
    const q = newArray[index];
    const totalIdi = (q.idiSource || 1) + (q.idiLogic || 1) + (q.idiConcept || 1) + (q.idiCalc || 1) + (q.idiProg || 1);
    
    // 자동 난이도 산정
    let calculatedDiff = '하';
    if (totalIdi >= 20) calculatedDiff = '최상';
    else if (totalIdi >= 15) calculatedDiff = '상';
    else if (totalIdi >= 10) calculatedDiff = '중';

    newArray[index].idiTotal = totalIdi;
    newArray[index].diff = calculatedDiff;

    setFormData({ ...formData, questions: newArray });
  };

  const addArrayItem = (field, defaultObj) => {
    setFormData({ ...formData, [field]: [...(formData[field] || []), defaultObj] });
  };

  const removeArrayItem = (field, index) => {
    const newArray = [...formData[field]];
    newArray.splice(index, 1);
    setFormData({ ...formData, [field]: newArray });
  };

  const saveInternalMemo = async (id) => {
    if (!memoInputs[id]) return;
    await updateDoc(doc(db, DB_COLLECTION, id), { internalMemo: memoInputs[id] });
    alert('교직원 전용 메모가 저장되었습니다.');
  };

  if (loading) return <div className="flex justify-center items-center h-64 text-gray-500">데이터를 처리하는 중입니다...</div>;

  // ======================================================================
  // VIEW: LIST
  // ======================================================================
  if (viewState.view === 'list') {
    const trends = reports.filter(r => r.type === 'trend');
    const individuals = reports.filter(r => r.type === 'individual');

    return (
      <div className="p-6 max-w-6xl mx-auto space-y-8 bg-gray-50 min-h-screen">
        <div className="flex justify-between items-end border-b pb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">내신 연구소</h1>
            {!isStudentOrParent && (
              <p className="text-sm text-gray-500 mt-2">
                우리 학원만의 철저한 학교별 내신 분석 및 경향 자료입니다.
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            {isAdmin && (
              <button 
                onClick={() => { setTempActiveTerm(activeTerm); setIsSettingsModalOpen(true); }} 
                className="flex items-center gap-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg shadow-sm hover:bg-gray-300 text-sm font-bold"
              >
                <IconSettings /> 활성 학기 설정
              </button>
            )}
            {isStaff && (
              <button 
                onClick={() => openForm(null)} 
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 text-sm font-bold"
              >
                + 리포트 작성
              </button>
            )}
          </div>
        </div>

        {/* 학생 계정 안내 메시지 (빈 상태 처리) */}
        {isStudentOrParent && reports.length === 0 && (
           <div className="bg-white p-8 text-center rounded-xl shadow-sm border border-gray-200">
             <div className="inline-flex justify-center items-center w-16 h-16 rounded-full bg-indigo-50 mb-4">
                <IconFile className="text-indigo-500 w-8 h-8" />
             </div>
             <h3 className="text-xl font-bold text-gray-800 mb-2">아직 {user.school} 내신 분석 리포트가 준비되지 않았습니다.</h3>
             <p className="text-gray-500">현재 {activeTerm} 시험 분석 자료를 준비 중입니다. 업데이트를 기다려주세요.</p>
           </div>
        )}

        {/* 1. 경향 분석 리스트 */}
        {(trends.length > 0 || !isStudentOrParent) && (
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <IconChart /> 과목 경향 분석
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trends.length === 0 && !isStudentOrParent ? <p className="text-gray-400 text-sm">등록된 경향 분석이 없습니다.</p> : trends.map(report => (
                <div key={report.id} className={`bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer relative ${report.isDeleted ? 'opacity-50 grayscale' : 'border-indigo-100'}`} onClick={() => setViewState({ view: 'detail', selectedId: report.id })}>
                  {report.isDeleted && <span className="absolute top-2 right-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">삭제됨</span>}
                  <div className="flex justify-between">
                    <h3 className="font-bold text-lg text-indigo-900">[{report.year}] {report.school} {report.term} 경향 분석</h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">과목: {report.subject} | 업데이트: {new Date(report.updatedAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. 개별 시험 분석 리스트 */}
        {(individuals.length > 0 || !isStudentOrParent) && (
          <section>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 mt-8">
              <IconFile /> 개별 시험 과목 분석
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {individuals.length === 0 && !isStudentOrParent ? <p className="text-gray-400 text-sm">등록된 시험 분석이 없습니다.</p> : individuals.map(report => (
                <div key={report.id} className={`bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer relative ${report.isDeleted ? 'opacity-50' : ''}`} onClick={() => {
                  setViewState({ view: 'detail', selectedId: report.id });
                  // 초기화
                  setShowDetails(false);
                  setShowQuestions(false);
                }}>
                  {report.isDeleted && <span className="absolute top-2 right-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">삭제됨</span>}
                  <h3 className="font-bold text-gray-800">[{report.year}] {report.school} {report.term} {report.subject} 분석</h3>
                  <div className="mt-3 text-sm text-gray-600 space-y-1">
                    {/* [요구사항 1] 담당 선생님 -> 출제 선생님 */}
                    <p>• 출제: {report.teacher || '-'} 선생님</p>
                    <p>• 난이도: <span className="font-medium text-indigo-600">{report.difficulty || '-'}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 관리자 모달 */}
        {isSettingsModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-xl max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-bold mb-4">학생 공개 활성 학기 설정</h3>
              <p className="text-sm text-gray-500 mb-4">학생과 학부모에게 보여질 학기 정보를 입력하세요.<br/>(예: 1-1 중간고사, 2-2 기말고사)</p>
              <input type="text" value={tempActiveTerm} onChange={e => setTempActiveTerm(e.target.value)} className="w-full border p-3 rounded mb-4" placeholder="예: 1-1 중간고사"/>
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsSettingsModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded">취소</button>
                <button onClick={handleSaveActiveTerm} className="px-4 py-2 bg-indigo-600 text-white rounded">저장</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ======================================================================
  // VIEW: FORM (CREATE / EDIT)
  // ======================================================================
  if (viewState.view === 'form' && formData) {
    const goBack = () => setViewState({ view: viewState.selectedId ? 'detail' : 'list', selectedId: viewState.selectedId, selectedQuestion: null });
    
    return (
      <div className="p-6 max-w-4xl mx-auto bg-gray-50 min-h-screen">
        <div className="flex justify-between items-center mb-6">
          <button onClick={goBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium">
            <IconArrowLeft /> 취소하고 돌아가기
          </button>
          <button onClick={handleSaveReport} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700">
            저장하기
          </button>
        </div>

        <div className="bg-white rounded-xl shadow border p-8 space-y-6">
          <h2 className="text-2xl font-bold border-b pb-4">리포트 {viewState.selectedId ? '수정' : '작성'}</h2>
          
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <label className="block text-sm font-bold mb-1">리포트 종류</label>
              <select className="w-full border p-2 rounded" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="individual">개별 시험 과목 분석</option>
                <option value="trend">과목 경향 분석 (설명회용)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">년도</label>
              <input type="number" className="w-full border p-2 rounded" placeholder="예: 2024" value={formData.year || ''} onChange={e => setFormData({...formData, year: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">학교명</label>
              <input type="text" className="w-full border p-2 rounded" placeholder="예: 영일고" value={formData.school} onChange={e => setFormData({...formData, school: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">학기 및 시험</label>
              <input type="text" className="w-full border p-2 rounded" placeholder="예: 1-1 중간고사" value={formData.term} onChange={e => setFormData({...formData, term: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">과목</label>
              <input type="text" className="w-full border p-2 rounded" placeholder="예: 수학(상)" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
            </div>
          </div>

          {/* ================= 개별 시험 분석 폼 ================= */}
          {formData.type === 'individual' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold border-b pb-2">시험 상세 정보</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* [요구사항 1] 담당 선생님 -> 출제 선생님 */}
                <div><label className="block text-xs font-bold mb-1">출제 선생님</label><input type="text" className="w-full border p-2 text-sm rounded" value={formData.teacher} onChange={e => setFormData({...formData, teacher: e.target.value})}/></div>
                <div><label className="block text-xs font-bold mb-1">총평 난이도</label><input type="text" className="w-full border p-2 text-sm rounded" placeholder="예: 상" value={formData.difficulty} onChange={e => setFormData({...formData, difficulty: e.target.value})}/></div>
                <div><label className="block text-xs font-bold mb-1">객관식 문항수</label><input type="number" className="w-full border p-2 text-sm rounded" value={formData.mcCount} onChange={e => setFormData({...formData, mcCount: Number(e.target.value)})}/></div>
                <div><label className="block text-xs font-bold mb-1">서술/단답 문항수</label><input type="number" className="w-full border p-2 text-sm rounded" value={formData.saCount} onChange={e => setFormData({...formData, saCount: Number(e.target.value)})}/></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {/* [요구사항 4] 1등급 컷 입력 필드 추가 */}
                <div>
                   <label className="block text-xs font-bold mb-1">예상 1등급 컷</label>
                   <input type="text" className="w-full border p-2 text-sm rounded" placeholder="예: 92점" value={formData.gradeCuts?.grade1 || ''} onChange={e => setFormData({...formData, gradeCuts: { ...formData.gradeCuts, grade1: e.target.value }})}/>
                </div>
                <div><label className="block text-xs font-bold mb-1">부교재</label><input type="text" className="w-full border p-2 text-sm rounded" value={formData.suppBook} onChange={e => setFormData({...formData, suppBook: e.target.value})}/></div>
                <div><label className="block text-xs font-bold mb-1">프린트/기타 출처</label><input type="text" className="w-full border p-2 text-sm rounded" value={formData.print} onChange={e => setFormData({...formData, print: e.target.value})}/></div>
              </div>
              <div><label className="block text-xs font-bold mb-1">시험 범위</label><input type="text" className="w-full border p-2 text-sm rounded" value={formData.scope} onChange={e => setFormData({...formData, scope: e.target.value})}/></div>
              <div><label className="block text-xs font-bold mb-1">시험 총평</label><textarea className="w-full border p-2 text-sm rounded min-h-[100px]" value={formData.review} onChange={e => setFormData({...formData, review: e.target.value})}/></div>
              <div><label className="block text-xs font-bold mb-1">특이사항</label><textarea className="w-full border p-2 text-sm rounded min-h-[80px]" value={formData.specialNotes} onChange={e => setFormData({...formData, specialNotes: e.target.value})}/></div>
              
              <h3 className="text-lg font-bold border-b pb-2 pt-4 flex justify-between items-center">
                문항별 상세 분석
                <button onClick={() => addArrayItem('questions', { qNum: (formData.questions?.length || 0) + 1, tags: '', unit: '', diff: '하', score: '', source: '', analysis: '', qImage: '', simImage: '', idiSource: 1, idiLogic: 1, idiConcept: 1, idiCalc: 1, idiProg: 1, idiTotal: 5 })} className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded flex items-center gap-1"><IconPlus/> 문항 추가</button>
              </h3>
              {formData.questions?.map((q, idx) => (
                <div key={idx} className="bg-gray-50 border p-4 rounded relative">
                  <button onClick={() => removeArrayItem('questions', idx)} className="absolute top-2 right-2 text-red-500"><IconX/></button>
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2 mb-2">
                    <div><label className="text-xs text-gray-500">번호</label><input type="number" className="w-full border p-1 text-sm" value={q.qNum} onChange={e=>handleArrayChange('questions', idx, 'qNum', e.target.value)}/></div>
                    <div><label className="text-xs text-gray-500">배점</label><input type="number" className="w-full border p-1 text-sm" value={q.score} onChange={e=>handleArrayChange('questions', idx, 'score', e.target.value)}/></div>
                    <div className="col-span-2"><label className="text-xs text-gray-500">단원</label><input type="text" className="w-full border p-1 text-sm" value={q.unit} onChange={e=>handleArrayChange('questions', idx, 'unit', e.target.value)}/></div>
                    <div><label className="text-xs text-gray-500">난이도 (자동)</label><input type="text" className="w-full border p-1 text-sm bg-gray-200 text-gray-600" readOnly value={`${q.diff || '하'} (${q.idiTotal || 5}점)`} /></div>
                    <div><label className="text-xs text-gray-500">태그</label><input type="text" className="w-full border p-1 text-sm" placeholder="킬러, 기본 등" value={q.tags} onChange={e=>handleArrayChange('questions', idx, 'tags', e.target.value)}/></div>
                  </div>

                  {/* IDI 입력 폼 추가 */}
                  <div className="grid grid-cols-5 gap-2 mb-2 bg-indigo-50/50 p-2 rounded border border-indigo-100">
                    <div><label className="text-[10px] text-indigo-700 font-bold">출처 친숙도(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm" value={q.idiSource || 1} onChange={e=>handleIdiChange(idx, 'idiSource', e.target.value)}/></div>
                    <div><label className="text-[10px] text-indigo-700 font-bold">변형 로직(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm" value={q.idiLogic || 1} onChange={e=>handleIdiChange(idx, 'idiLogic', e.target.value)}/></div>
                    <div><label className="text-[10px] text-indigo-700 font-bold">개념 결합도(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm" value={q.idiConcept || 1} onChange={e=>handleIdiChange(idx, 'idiConcept', e.target.value)}/></div>
                    <div><label className="text-[10px] text-indigo-700 font-bold">연산 복잡도(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm" value={q.idiCalc || 1} onChange={e=>handleIdiChange(idx, 'idiCalc', e.target.value)}/></div>
                    <div><label className="text-[10px] text-indigo-700 font-bold">논리 전개(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm" value={q.idiProg || 1} onChange={e=>handleIdiChange(idx, 'idiProg', e.target.value)}/></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                    <div><label className="text-xs text-gray-500">출처 분석</label><input type="text" className="w-full border p-1 text-sm" value={q.source} onChange={e=>handleArrayChange('questions', idx, 'source', e.target.value)}/></div>
                    <div><label className="text-xs text-gray-500">분석 코멘트</label><input type="text" className="w-full border p-1 text-sm" value={q.analysis} onChange={e=>handleArrayChange('questions', idx, 'analysis', e.target.value)}/></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500">실제 문제 이미지 (URL)</label><input type="text" className="w-full border p-1 text-sm" value={q.qImage} onChange={e=>handleArrayChange('questions', idx, 'qImage', e.target.value)}/></div>
                    <div><label className="text-xs text-gray-500">유사 적중 문항 이미지 (URL)</label><input type="text" className="w-full border p-1 text-sm" value={q.simImage} onChange={e=>handleArrayChange('questions', idx, 'simImage', e.target.value)}/></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* ... 경향분석 폼 생략 (동일) ... */}
        </div>
      </div>
    );
  }

  // ======================================================================
  // VIEW: DETAIL
  // ======================================================================
  const report = reports.find(r => r.id === viewState.selectedId);
  if (!report && viewState.view === 'detail') return null;

  if (viewState.view === 'detail') {
    const goBack = () => setViewState({ view: 'list', selectedId: null, selectedQuestion: null });

    // 난이도 온도계 계산 로직 (최상=100%, 상=80%, 중=60%, 하=40%, 최하=20%)
    const getDifficultyPercentage = (diff) => {
      switch(diff) {
        case '최상': return 100; case '상': return 80; case '중': return 60; case '하': return 40; case '최하': return 20; default: return 60;
      }
    };

    // 출제 비중 계산 로직 (단원별 문항수 비율 계산)
    const getUnitDistribution = () => {
      if (!report.questions || report.questions.length === 0) return [];
      const counts = report.questions.reduce((acc, q) => {
        const unit = q.unit || '기타';
        acc[unit] = (acc[unit] || 0) + 1;
        return acc;
      }, {});
      
      const total = report.questions.length;
      let cumulativePercent = 0;
      
      const colors = ['#4f46e5', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#8b5cf6', '#d946ef'];
      
      return Object.entries(counts).map(([unit, count], index) => {
        const percent = Math.round((count / total) * 100);
        const start = cumulativePercent;
        cumulativePercent += percent;
        return { 
          unit, percent, count, 
          color: colors[index % colors.length],
          startAngle: `${start}%`, 
          endAngle: `${cumulativePercent}%` 
        };
      });
    };

    const diffPercent = getDifficultyPercentage(report.difficulty);
    const unitDistributions = getUnitDistribution();

    // CSS Conic Gradient 생성 (도넛 차트용)
    const donutBackground = `conic-gradient(${unitDistributions.map(d => `${d.color} ${d.startAngle} ${d.endAngle}`).join(', ')})`;

    return (
      <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen">
        <div className="flex justify-between items-center mb-6">
          <button onClick={goBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium">
            <IconArrowLeft /> 목록으로 돌아가기
          </button>
          
          {/* 액션 버튼 그룹 */}
          {isStaff && (
            <div className="flex gap-2">
              <button onClick={() => openForm(report)} className="flex items-center gap-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 text-sm font-bold">
                <IconEdit /> 편집/수정
              </button>
              {/* ... 삭제 버튼들 생략 ... */}
            </div>
          )}
        </div>

        <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${report.isDeleted ? 'opacity-70 grayscale' : 'border-gray-100'}`}>
          <div className="bg-indigo-900 px-8 py-6 text-white">
            <div className="inline-block px-3 py-1 bg-indigo-800 rounded-full text-xs font-semibold mb-3 tracking-wider">
              {report.type === 'trend' ? '경향 분석 리포트' : '시험 정밀 분석 리포트'}
            </div>
            <h1 className="text-3xl font-bold">
              [{report.year}] {report.school} {report.term} {report.subject} {report.type === 'trend' ? '경향 분석' : '분석'}
            </h1>
          </div>

          <div className="p-8">
            {report.type === 'individual' && (
              <div className="space-y-8">
                
                {/* [요구사항 3] 핵심 요약 대시보드 (Above the Fold) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  
                  {/* 1. 난이도 온도계 */}
                  <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col items-center">
                    <h3 className="text-sm font-bold text-gray-500 mb-4">체감 난이도</h3>
                    <div className="relative w-12 h-32 bg-gray-200 rounded-full flex flex-col justify-end p-1">
                      <div className="w-full bg-gradient-to-t from-orange-400 to-red-500 rounded-full transition-all duration-1000" style={{ height: `${diffPercent}%` }}></div>
                      {/* 온도계 눈금 */}
                      <div className="absolute top-1/2 left-full ml-2 text-xs text-gray-400">- 중</div>
                      <div className="absolute top-4 left-full ml-2 text-xs text-gray-400">- 상</div>
                    </div>
                    <p className="mt-4 text-2xl font-black text-indigo-900">{report.difficulty}</p>
                  </div>

                  {/* 2. 출제 비중 도넛 차트 */}
                  <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center">
                    <h3 className="text-sm font-bold text-gray-500 mb-4">출제 단원 비중</h3>
                    {unitDistributions.length > 0 ? (
                      <div className="relative w-32 h-32 rounded-full" style={{ background: donutBackground }}>
                        {/* 도넛 가운데 구멍 (흰색 원) */}
                        <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
                           <span className="text-xs font-bold text-gray-500">총 {report.questions.length}문항</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center text-xs text-gray-400">데이터 없음</div>
                    )}
                    
                    {/* 차트 범례 */}
                    <div className="mt-4 flex flex-wrap gap-2 justify-center w-full text-[10px]">
                       {unitDistributions.slice(0,4).map((d, i) => (
                         <div key={i} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{backgroundColor: d.color}}></span>{d.unit.slice(0,4)}</div>
                       ))}
                    </div>
                  </div>

                  {/* 3. 총평 요약 */}
                  <div className="bg-white border rounded-xl p-6 shadow-sm lg:col-span-1 md:col-span-2">
                     <h3 className="text-sm font-bold text-gray-500 mb-2">총평 요약</h3>
                     <p className="text-gray-800 text-sm leading-relaxed line-clamp-6">{report.review}</p>
                  </div>
                </div>

                {/* --- [요구사항 3] 아코디언: 세부정보 --- */}
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                  <button 
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full px-6 py-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="font-bold text-gray-800 flex items-center gap-2">세부 정보 <span className="text-xs text-gray-500 font-normal">(출제 선생님, 1등급 컷, 시험 범위 등)</span></span>
                    {showDetails ? <IconChevronUp /> : <IconChevronDown />}
                  </button>
                  
                  {showDetails && (
                    <div className="p-6 space-y-6 animate-fade-in border-t">
                      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* [요구사항 1] 담당 선생님 -> 출제 선생님 */}
                        <InfoBox label="출제 선생님" value={report.teacher} />
                        <InfoBox label="예상 1등급 컷" value={report.gradeCuts?.grade1} />
                        <InfoBox label="객관식 / 주관식" value={`${report.mcCount || 0}문항 / ${(report.saCount||0) + (report.essayCount||0)}문항`} />
                        <InfoBox label="부교재" value={report.suppBook} />
                      </section>
                      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InfoBox label="학교 프린트/기타출처" value={report.print} />
                        <InfoBox label="시험 범위" value={report.scope} />
                      </section>
                      <div className="border border-red-100 rounded-xl p-5 bg-white shadow-sm">
                        <h3 className="font-bold text-red-800 mb-2 text-sm">💡 특이사항</h3>
                        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{report.specialNotes}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* --- [요구사항 3] 아코디언: 상세 문항 분석 --- */}
                {report.questions?.length > 0 && (
                  <div className="border border-indigo-200 rounded-xl overflow-hidden bg-white">
                    <button 
                      onClick={() => setShowQuestions(!showQuestions)}
                      className="w-full px-6 py-4 flex justify-between items-center bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <span className="font-bold text-indigo-900 flex items-center gap-2">상세 문항 분석 <span className="text-xs text-indigo-500 font-normal">(문항별 난이도 및 분석 확인)</span></span>
                      {showQuestions ? <IconChevronUp /> : <IconChevronDown />}
                    </button>
                    
                    {showQuestions && (
                      <div className="p-0 animate-fade-in border-t border-indigo-100">
                        {/* 리스트형 문항 테이블 */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="p-4 font-bold text-gray-600 text-center w-16">번호</th>
                                <th className="p-4 font-bold text-gray-600">단원</th>
                                <th className="p-4 font-bold text-gray-600 text-center w-24">난이도</th>
                                <th className="p-4 font-bold text-gray-600 w-24">상세보기</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.questions.map((q, idx) => (
                                <tr key={idx} className={`border-b hover:bg-gray-50 transition-colors ${viewState.selectedQuestion?.qNum === q.qNum ? 'bg-indigo-50/50' : ''}`}>
                                  <td className="p-4 text-center font-bold">{q.qNum}</td>
                                  <td className="p-4">
                                    <div className="flex items-center gap-2">
                                      {q.unit}
                                      {q.tags && <span className={`text-[10px] px-2 py-0.5 rounded ${q.tags.includes('킬러') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{q.tags}</span>}
                                    </div>
                                  </td>
                                  <td className="p-4 text-center">
                                    <span className={`font-medium ${q.diff==='최상'?'text-red-600':q.diff==='상'?'text-orange-500':q.diff==='중'?'text-green-600':'text-blue-500'}`}>{q.diff}</span>
                                  </td>
                                  <td className="p-4 text-center">
                                    <button 
                                      onClick={() => setViewState({ ...viewState, selectedQuestion: q })}
                                      className="text-indigo-600 hover:text-indigo-800 text-xs font-bold px-3 py-1 bg-indigo-50 rounded"
                                    >
                                      분석 확인
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 선택된 문항 상세 정보 창 */}
                {viewState.selectedQuestion && showQuestions && (
                  <div className="mt-6 border-2 border-indigo-200 rounded-xl p-6 bg-white shadow-lg animate-fade-in">
                      {/* ... (기존과 동일한 문항 상세 내용 유지) ... */}
                      <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <h3 className="text-2xl font-bold text-indigo-900">{viewState.selectedQuestion.qNum}번 문항 상세 분석</h3>
                        <button onClick={() => setViewState({...viewState, selectedQuestion: null})} className="text-gray-400 hover:text-gray-600">닫기 ✕</button>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div className="border rounded bg-gray-50 p-2 text-center h-48 flex items-center justify-center text-gray-400 overflow-hidden">
                            {viewState.selectedQuestion.qImage ? <img src={viewState.selectedQuestion.qImage} alt="실제문제" className="max-h-full object-contain" /> : "[실제 학교 문제 이미지 (URL 없음)]"}
                          </div>
                          <div className="border-2 border-dashed border-indigo-200 rounded bg-indigo-50/30 p-2 text-center h-48 flex items-center justify-center text-indigo-400 font-medium overflow-hidden">
                            {viewState.selectedQuestion.simImage ? <img src={viewState.selectedQuestion.simImage} alt="학원교재 유사문항" className="max-h-full object-contain" /> : "[우리 학원 교재 유사 문항 (URL 없음)]"}
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          <DetailRow label="단원 및 평가내용" value={viewState.selectedQuestion.unit} />
                          <DetailRow label="최종 난이도" value={`${viewState.selectedQuestion.diff || '하'} (IDI: ${viewState.selectedQuestion.idiTotal || 5}점)`} />
                          <DetailRow label="배점" value={`${viewState.selectedQuestion.score}점`} />
                          <DetailRow label="출처 분석" value={viewState.selectedQuestion.source} />
  
                          <div className="pt-4 mt-2 border-t border-gray-100">
                            <p className="text-sm text-gray-600 leading-relaxed"><span className="font-bold text-indigo-800">문항 분석평: </span>{viewState.selectedQuestion.analysis}</p>
                          </div>
                        </div>
                      </div>
                  </div>
                )}
              </div>
            )}
            {/* ... 경향분석 디테일 렌더링 유지 ... */}
          </div>
        </div>
      </div>
    );
  }

  function InfoBox({ label, value, colSpan = 1 }) {
    return (
      <div className={`bg-white border rounded-lg p-4 shadow-sm col-span-${colSpan}`}>
        <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
        <p className="font-bold text-gray-800">{value || '-'}</p>
      </div>
    );
  }

  function DetailRow({ label, value }) {
    return (
      <div className="flex border-b border-gray-100 pb-2">
        <span className="w-1/3 text-sm font-bold text-gray-500">{label}</span>
        <span className="w-2/3 text-sm text-gray-800 font-medium">{value || '-'}</span>
      </div>
    );
  }
}