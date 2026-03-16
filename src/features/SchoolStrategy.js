import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase'; 
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';

// --- [아이콘 컴포넌트] ---
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
const IconChevronLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IconChevronRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;

const APP_ID = 'imperial-clinic-v1';
const DB_COLLECTION = `artifacts/${APP_ID}/public/data/school_strategies`;

export default function SchoolStrategy({ currentUser }) {
  const user = currentUser || { role: 'admin', school: '영일고' }; 
  
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTerm, setActiveTerm] = useState("-1 중간고사");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [tempActiveTerm, setTempActiveTerm] = useState("");

  const [viewState, setViewState] = useState({ view: 'list', selectedId: null, selectedQuestion: null });
  const [memoInputs, setMemoInputs] = useState({});
  const [formData, setFormData] = useState(null);

  const [showDetails, setShowDetails] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showInternalMemo, setShowInternalMemo] = useState(false);

  const isStaff = ['admin', 'lecturer', 'ta'].includes(user.role);
  const isAdmin = user.role === 'admin';
  const isStudentOrParent = ['student', 'parent'].includes(user.role);

  useEffect(() => {
      const handlePopState = (e) => {
          setViewState(prev => {
              if (prev.selectedQuestion) {
                  return { ...prev, selectedQuestion: null };
              } else if (prev.view === 'detail' || prev.view === 'form') {
                  return { view: 'list', selectedId: null, selectedQuestion: null };
              }
              return prev;
          });
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const pushHistory = useCallback((layer) => {
      window.history.pushState({ layer }, '');
  }, []);

  const handleOpenDetail = (id) => {
      pushHistory('detail');
      setViewState({ view: 'detail', selectedId: id, selectedQuestion: null });
      setShowDetails(false); setShowQuestions(false); setShowInternalMemo(false);
  };

  const handleOpenModal = (q) => {
      pushHistory('modal');
      setViewState(prev => ({ ...prev, selectedQuestion: q }));
  };

  const handleGoBack = () => window.history.back();

  const handleOpenForm = (existingReport = null) => {
      pushHistory('form');
      if (existingReport) {
          setFormData({ ...existingReport });
      } else {
          setFormData({ 
              type: 'individual', year: new Date().getFullYear().toString(), school: '', term: '', subject: '', 
              teacher: '', difficulty: '중', suppBook: '', print: '', scope: '', review: '', specialNotes: '', 
              gradeCuts: { grade1: '', grade2: '', grade3: '' }, questions: [], trendData: [], scopeChanges: [], teacherStyles: [], isDeleted: false 
          });
      }
      setViewState({ view: 'form', selectedId: existingReport ? existingReport.id : null, selectedQuestion: null });
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'school_strategy'));
        if (docSnap.exists() && docSnap.data().activeTerm) setActiveTerm(docSnap.data().activeTerm);
      } catch (e) { console.error("설정 불러오기 실패:", e); }
    };
    fetchSettings();
  }, []);

  const getStudentTargetTerm = (baseTerm, currentUserObj) => {
    if (!baseTerm) return "";
    const base = baseTerm.trim();
    
    let gradeNum = "";
    if (currentUserObj && currentUserObj.grade) {
      const gradeMatch = String(currentUserObj.grade).match(/\d+/);
      if (gradeMatch) gradeNum = gradeMatch[0];
    }
    
    if (!gradeNum) return base; 

    if (base.startsWith('-')) {
      return gradeNum + base; 
    }
    
    return base.replace(/^\d+/, gradeNum);
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, DB_COLLECTION), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filteredData = data.filter(report => {
          if (isStudentOrParent) {
            const reportTerm = report.term ? report.term.trim() : "";
            const currentActiveTerm = activeTerm ? activeTerm.trim() : "";
            
            const targetTerm = getStudentTargetTerm(currentActiveTerm, user);
            const userSchoolRaw = user.schoolname || user.schoolName || user.school || "";
            const reportSchool = report.school ? report.school.trim() : "";
            
            return !report.isDeleted && reportTerm === targetTerm && reportSchool === userSchoolRaw.trim();
          } else if (isAdmin) return true; 
          else return !report.isDeleted; 
        });

        filteredData.sort((a, b) => {
          if (a.type === 'trend' && b.type !== 'trend') return -1;
          if (a.type !== 'trend' && b.type === 'trend') return 1;
          return new Date(b.createdAt) - new Date(a.createdAt); 
        });
        setReports(filteredData); setLoading(false);
      },
      (error) => { console.error("Firestore 에러:", error); alert("데이터를 불러오는데 실패했습니다."); setLoading(false); }
    );
    return () => unsubscribe();
  }, [user, isStudentOrParent, isAdmin, activeTerm]);

  const handleSaveActiveTerm = async () => {
    try {
      await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'school_strategy'), { activeTerm: tempActiveTerm }, { merge: true });
      setActiveTerm(tempActiveTerm); setIsSettingsModalOpen(false); alert('활성 학기 설정이 저장되었습니다.');
    } catch (e) { alert('설정 저장 실패: 권한을 확인하세요.'); }
  };

  const handleSoftDelete = async (id) => {
    if (window.confirm('이 리포트를 휴지통으로 이동하시겠습니까?')) {
      await updateDoc(doc(db, DB_COLLECTION, id), { isDeleted: true });
      if(viewState.view === 'detail') handleGoBack();
    }
  };

  const handleRestore = async (id) => {
    if (window.confirm('이 리포트를 다시 복구하시겠습니까?')) await updateDoc(doc(db, DB_COLLECTION, id), { isDeleted: false });
  };

  const handleHardDelete = async (id) => {
    if (window.confirm('정말 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      await deleteDoc(doc(db, DB_COLLECTION, id));
      if(viewState.view === 'detail') handleGoBack();
    }
  };

  const getAutomaticDifficulty = (questions) => {
    const totalIdi = questions?.reduce((sum, q) => sum + (q.idiTotal || 0), 0) || 0;
    let level = '하';
    let percent = 40;
    if (totalIdi >= 295) { level = '최상'; percent = 100; }
    else if (totalIdi > 262 && totalIdi < 295) { level = '상'; percent = 80; }
    else if (totalIdi > 210 && totalIdi <= 262) { level = '중'; percent = 60; }
    else { level = '하'; percent = 40; }
    return { totalIdi, level, percent };
  };

  const handleSaveReport = async () => {
    if(!formData.school || !formData.subject || !formData.year) return alert("년도, 학교명, 과목은 필수 입력입니다.");
    if(!formData.term) return alert("시험 학기(예: 1-1 중간고사)를 정확히 입력해주세요.");
    
    setLoading(true);
    try {
      const diffInfoForm = getAutomaticDifficulty(formData.questions);
      const payload = { ...formData, difficulty: diffInfoForm.level, updatedAt: new Date().toISOString() };
      
      if (viewState.selectedId) {
        await updateDoc(doc(db, DB_COLLECTION, viewState.selectedId), payload);
        alert('성공적으로 수정되었습니다.');
      } else {
        payload.createdAt = new Date().toISOString();
        await addDoc(collection(db, DB_COLLECTION), payload);
        alert('새 리포트가 추가되었습니다.');
      }
      handleGoBack(); 
    } catch (e) { console.error(e); alert('저장에 실패했습니다.'); } finally { setLoading(false); }
  };

  const handleArrayChange = (field, index, key, value) => {
    const newArray = [...formData[field]];
    newArray[index][key] = value;
    setFormData({ ...formData, [field]: newArray });
  };
  
  const handleIdiChange = (index, key, value) => {
    let numVal = parseInt(value, 10);
    if (isNaN(numVal)) numVal = 1;
    if (numVal < 1) numVal = 1;
    if (numVal > 5) numVal = 5;

    const newArray = [...formData.questions];
    newArray[index][key] = numVal;

    const q = newArray[index];
    const totalIdi = (q.idiSource || 1) + (q.idiLogic || 1) + (q.idiConcept || 1) + (q.idiCalc || 1) + (q.idiProg || 1);
    
    let calculatedDiff = '하';
    if (totalIdi >= 20) calculatedDiff = '최상';
    else if (totalIdi >= 15) calculatedDiff = '상';
    else if (totalIdi >= 10) calculatedDiff = '중';

    newArray[index].idiTotal = totalIdi;
    newArray[index].diff = calculatedDiff;
    setFormData({ ...formData, questions: newArray });
  };

  const addArrayItem = (field, defaultObj) => setFormData({ ...formData, [field]: [...(formData[field] || []), defaultObj] });
  const removeArrayItem = (field, index) => {
    const newArray = [...formData[field]]; newArray.splice(index, 1); setFormData({ ...formData, [field]: newArray });
  };

  const saveInternalMemo = async (id) => {
    if (!memoInputs[id]) return;
    await updateDoc(doc(db, DB_COLLECTION, id), { internalMemo: memoInputs[id] });
    alert('교직원 전용 메모가 저장되었습니다.');
  };

  const getUnitDistribution = (questions) => {
    if (!questions || questions.length === 0) return [];
    const counts = questions.reduce((acc, q) => {
      const unit = (q.unit && q.unit.trim()) ? q.unit.trim() : '기타';
      acc[unit] = (acc[unit] || 0) + 1;
      return acc;
    }, {});
    const total = questions.length;
    return Object.entries(counts).map(([unit, count]) => ({
        unit, count, percent: Math.round((count / total) * 100)
    })).sort((a,b) => b.count - a.count);
  };

  const getSourceDistribution = (questions) => {
    if (!questions || questions.length === 0) return [];
    const counts = questions.reduce((acc, q) => {
      const source = (q.source && q.source.trim()) ? q.source.trim() : '기타 출처';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});
    const total = questions.length;
    return Object.entries(counts).map(([source, count]) => ({
        source, count, percent: Math.round((count / total) * 100)
    })).sort((a,b) => b.count - a.count);
  };

  if (loading) return <div className="flex justify-center items-center h-64 text-gray-500">데이터를 처리하는 중입니다...</div>;

  const targetDisplayTerm = isStudentOrParent ? getStudentTargetTerm(activeTerm, user) : activeTerm;
  const userSchoolName = user.schoolname || user.schoolName || user.school || "소속 학교";

  // ======================================================================
  // VIEW: LIST
  // ======================================================================
  if (viewState.view === 'list') {
    const trends = reports.filter(r => r.type === 'trend');
    const individuals = reports.filter(r => r.type === 'individual');

    return (
      <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-6 md:space-y-8 bg-gray-50 min-h-screen">
        <div className="flex justify-between items-end border-b pb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">내신 연구소</h1>
            {!isStudentOrParent && (
              <p className="text-xs md:text-sm text-gray-500 mt-2">우리 학원만의 철저한 학교별 내신 분석 및 경향 자료입니다.</p>
            )}
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <button onClick={() => { setTempActiveTerm(activeTerm); setIsSettingsModalOpen(true); }} className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-gray-200 text-gray-700 rounded-lg shadow-sm hover:bg-gray-300 text-xs md:text-sm font-bold">
                <IconSettings /> <span className="hidden md:inline">활성 학기 설정</span>
              </button>
            )}
            {isStaff && (
              <button onClick={() => handleOpenForm(null)} className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 text-xs md:text-sm font-bold">
                + <span className="hidden md:inline">리포트 작성</span><span className="md:hidden">작성</span>
              </button>
            )}
          </div>
        </div>

        {isStudentOrParent && reports.length === 0 && (
           <div className="bg-white p-8 text-center rounded-xl shadow-sm border border-gray-200 mt-4">
             <div className="inline-flex justify-center items-center w-16 h-16 rounded-full bg-indigo-50 mb-4"><IconFile className="text-indigo-500 w-8 h-8" /></div>
             <h3 className="text-lg md:text-xl font-bold text-gray-800 mb-2">아직 {userSchoolName} 내신 분석 리포트가 준비되지 않았습니다.</h3>
             <p className="text-sm md:text-base text-gray-500">현재 {targetDisplayTerm} 시험 분석 자료를 준비 중입니다.</p>
           </div>
        )}

        {(trends.length > 0 || !isStudentOrParent) && (
          <section>
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><IconChart /> 과목 경향 분석</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {trends.length === 0 && !isStudentOrParent ? <p className="text-gray-400 text-sm pl-2">등록된 분석이 없습니다.</p> : trends.map(report => (
                <div key={report.id} className={`bg-white border rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md transition cursor-pointer relative ${report.isDeleted ? 'opacity-50 grayscale' : 'border-indigo-100'}`} onClick={() => handleOpenDetail(report.id)}>
                  {report.isDeleted && <span className="absolute top-2 right-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">삭제됨</span>}
                  <h3 className="font-bold text-base md:text-lg text-indigo-900">[{report.year}] {report.school} {report.term} 경향 분석</h3>
                  <p className="text-xs md:text-sm text-gray-600 mt-2">과목: {report.subject}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {(individuals.length > 0 || !isStudentOrParent) && (
          <section>
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 mt-6 md:mt-8"><IconFile /> 개별 시험 과목 분석</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
              {individuals.length === 0 && !isStudentOrParent ? <p className="text-gray-400 text-sm pl-2">등록된 시험 분석이 없습니다.</p> : individuals.map(report => {
                const diffInfo = getAutomaticDifficulty(report.questions);

                return (
                  <div key={report.id} className={`bg-white border rounded-xl p-4 md:p-5 shadow-sm hover:shadow-md transition cursor-pointer relative ${report.isDeleted ? 'opacity-50' : ''}`} onClick={() => handleOpenDetail(report.id)}>
                    {report.isDeleted && <span className="absolute top-2 right-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">삭제됨</span>}
                    <h3 className="font-bold text-gray-800 text-base md:text-lg break-keep leading-tight mb-4">[{report.year}] {report.school} {report.term} {report.subject} 분석</h3>
                    
                    <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-center gap-3 border-r border-gray-100">
                            <div className="relative w-3.5 h-12 md:w-4 md:h-14 bg-gray-200 rounded-full flex flex-col justify-end p-[1.5px] md:p-0.5">
                                <div className="w-full bg-gradient-to-t from-orange-400 to-red-500 rounded-full transition-all duration-1000" style={{ height: `${diffInfo.percent}%` }}></div>
                            </div>
                            <div className="flex flex-col items-start justify-center">
                                <span className="text-[10px] font-bold text-gray-500 mb-1">체감 난이도</span>
                                <span className="text-sm md:text-base font-black text-indigo-900 leading-none mb-1">{diffInfo.level}</span>
                                <span className="text-[9px] md:text-[10px] text-gray-400 font-medium">IDI {diffInfo.totalIdi}점</span>
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-center w-full px-2">
                            <span className="text-[10px] font-bold text-gray-500 mb-1.5">등급컷</span>
                            <div className="w-full flex justify-between text-[9px] md:text-[10px] text-gray-600 mb-1"><span>1등급</span><span className="font-bold text-gray-800">{report.gradeCuts?.grade1 || '-'}</span></div>
                            <div className="w-full flex justify-between text-[9px] md:text-[10px] text-gray-600 mb-1"><span>2등급</span><span className="font-bold text-gray-800">{report.gradeCuts?.grade2 || '-'}</span></div>
                            <div className="w-full flex justify-between text-[9px] md:text-[10px] text-gray-600"><span>3등급</span><span className="font-bold text-gray-800">{report.gradeCuts?.grade3 || '-'}</span></div>
                        </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {isSettingsModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-bold mb-4">학생 공개 활성 학기 설정</h3>
              {/* JSX 구문 에러를 방지하기 위해 '->' 대신 유니코드 ➔ 사용 또는 - &gt; 형태 적용 */}
              <p className="text-sm text-gray-500 mb-4">학생과 학부모에게 보여질 학기 정보를 입력하세요.<br/>(예: -1 중간고사, -2 기말고사)<br/><br/>* 앞에 '-'를 붙여 입력하면, 접속한 학생의 학년에 맞게 자동 변환되어 노출됩니다. (예: 1학년 접속 시 ➔ 1-1 중간고사)</p>
              <input type="text" value={tempActiveTerm} onChange={e => setTempActiveTerm(e.target.value)} className="w-full border p-3 rounded mb-4 focus:ring-2 focus:ring-indigo-300 outline-none" placeholder="예: -1 중간고사"/>
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsSettingsModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded font-bold text-gray-700">취소</button>
                <button onClick={handleSaveActiveTerm} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold">저장</button>
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
    const diffInfoForm = getAutomaticDifficulty(formData.questions);

    return (
      <div className="p-3 md:p-6 max-w-4xl mx-auto bg-gray-50 min-h-screen">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <button onClick={handleGoBack} className="flex items-center gap-1 md:gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm md:text-base">
            <IconArrowLeft /> 돌아가기
          </button>
          <button onClick={handleSaveReport} className="px-4 py-1.5 md:px-6 md:py-2 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700 text-sm md:text-base">
            저장하기
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 md:p-8 space-y-6">
          <h2 className="text-xl md:text-2xl font-bold border-b pb-4">리포트 {viewState.selectedId ? '수정' : '작성'}</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 bg-gray-50 p-3 md:p-4 rounded-lg">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs md:text-sm font-bold mb-1">리포트 종류</label>
              <select className="w-full border p-2 rounded text-sm outline-none" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="individual">개별 시험 과목 분석</option>
                <option value="trend">과목 경향 분석 (설명회용)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs md:text-sm font-bold mb-1">년도</label>
              <input type="number" className="w-full border p-2 rounded text-sm outline-none" placeholder="예: 2024" value={formData.year || ''} onChange={e => setFormData({...formData, year: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs md:text-sm font-bold mb-1">학교명</label>
              <input type="text" className="w-full border p-2 rounded text-sm outline-none" placeholder="예: 영일고" value={formData.school} onChange={e => setFormData({...formData, school: e.target.value})} />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs md:text-sm font-bold mb-1">학기 및 시험</label>
              <input type="text" className="w-full border p-2 rounded text-sm outline-none" placeholder="예: 1-1 중간고사" value={formData.term} onChange={e => setFormData({...formData, term: e.target.value})} />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="block text-xs md:text-sm font-bold mb-1">과목</label>
              <input type="text" className="w-full border p-2 rounded text-sm outline-none" placeholder="예: 수학(상)" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
            </div>
          </div>

          {formData.type === 'individual' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold border-b pb-2">시험 상세 정보</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-4 mb-4">
                <div><label className="block text-xs font-bold mb-1">출제 선생님</label><input type="text" className="w-full border p-2 text-sm rounded outline-none" value={formData.teacher} onChange={e => setFormData({...formData, teacher: e.target.value})}/></div>
                <div><label className="block text-xs font-bold mb-1">체감 난이도 (자동 계산)</label><input type="text" className="w-full border p-2 text-sm rounded bg-gray-100 text-gray-600 outline-none" readOnly value={`${diffInfoForm.level} (${diffInfoForm.totalIdi}점)`}/></div>
              </div>
              
              <div className="mb-4">
                 <label className="block text-xs font-bold mb-1">등급컷</label>
                 <div className="flex gap-2">
                    <input type="text" className="w-1/3 border p-2 text-sm rounded outline-none text-center" placeholder="1등급 (예: 92)" value={formData.gradeCuts?.grade1 || ''} onChange={e => setFormData({...formData, gradeCuts: { ...formData.gradeCuts, grade1: e.target.value }})}/>
                    <input type="text" className="w-1/3 border p-2 text-sm rounded outline-none text-center" placeholder="2등급 (예: 85)" value={formData.gradeCuts?.grade2 || ''} onChange={e => setFormData({...formData, gradeCuts: { ...formData.gradeCuts, grade2: e.target.value }})}/>
                    <input type="text" className="w-1/3 border p-2 text-sm rounded outline-none text-center" placeholder="3등급 (예: 78)" value={formData.gradeCuts?.grade3 || ''} onChange={e => setFormData({...formData, gradeCuts: { ...formData.gradeCuts, grade3: e.target.value }})}/>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div><label className="block text-xs font-bold mb-1">부교재</label><input type="text" className="w-full border p-2 text-sm rounded outline-none" value={formData.suppBook} onChange={e => setFormData({...formData, suppBook: e.target.value})}/></div>
                <div><label className="block text-xs font-bold mb-1">프린트/기타 출처</label><input type="text" className="w-full border p-2 text-sm rounded outline-none" value={formData.print} onChange={e => setFormData({...formData, print: e.target.value})}/></div>
              </div>
              <div><label className="block text-xs font-bold mb-1">시험 범위</label><input type="text" className="w-full border p-2 text-sm rounded outline-none" value={formData.scope} onChange={e => setFormData({...formData, scope: e.target.value})}/></div>
              <div><label className="block text-xs font-bold mb-1">시험 총평</label><textarea className="w-full border p-2 text-sm rounded min-h-[100px] outline-none" value={formData.review} onChange={e => setFormData({...formData, review: e.target.value})}/></div>
              <div><label className="block text-xs font-bold mb-1">특이사항</label><textarea className="w-full border p-2 text-sm rounded min-h-[80px] outline-none" value={formData.specialNotes} onChange={e => setFormData({...formData, specialNotes: e.target.value})}/></div>
              
              <h3 className="text-lg font-bold border-b pb-2 pt-4 flex justify-between items-center">
                문항별 상세 분석
                <button onClick={() => addArrayItem('questions', { qNum: '', tags: '', unit: '', diff: '하', score: '', source: '', analysis: '', qImage: '', simImage: '', idiSource: 1, idiLogic: 1, idiConcept: 1, idiCalc: 1, idiProg: 1, idiTotal: 5 })} className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded flex items-center gap-1 font-bold"><IconPlus/> 문항 추가</button>
              </h3>
              <div className="space-y-4">
                {formData.questions?.map((q, idx) => (
                  <div key={idx} className="bg-gray-50 border p-3 md:p-4 rounded-xl relative shadow-sm">
                    <button onClick={() => removeArrayItem('questions', idx)} className="absolute top-3 right-3 text-red-500 hover:bg-red-100 rounded-full p-1"><IconX/></button>
                    <div className="grid grid-cols-4 md:grid-cols-6 gap-2 mb-3">
                      <div><label className="text-[10px] text-gray-500 font-bold">번호 (예: 객관식1)</label><input type="text" placeholder="객관식1" className="w-full border p-1.5 text-sm rounded outline-none" value={q.qNum} onChange={e=>handleArrayChange('questions', idx, 'qNum', e.target.value)}/></div>
                      <div><label className="text-[10px] text-gray-500 font-bold">배점</label><input type="number" className="w-full border p-1.5 text-sm rounded outline-none" value={q.score} onChange={e=>handleArrayChange('questions', idx, 'score', e.target.value)}/></div>
                      <div className="col-span-2"><label className="text-[10px] text-gray-500 font-bold">단원</label><input type="text" className="w-full border p-1.5 text-sm rounded outline-none" value={q.unit} onChange={e=>handleArrayChange('questions', idx, 'unit', e.target.value)}/></div>
                      <div><label className="text-[10px] text-gray-500 font-bold">난이도 (자동)</label><input type="text" className="w-full border p-1.5 text-sm bg-gray-200 text-gray-600 rounded" readOnly value={`${q.diff || '하'} (${q.idiTotal || 5})`} /></div>
                      <div><label className="text-[10px] text-gray-500 font-bold">태그</label><input type="text" className="w-full border p-1.5 text-sm rounded outline-none" placeholder="킬러, 기본 등" value={q.tags} onChange={e=>handleArrayChange('questions', idx, 'tags', e.target.value)}/></div>
                    </div>

                    <div className="grid grid-cols-5 gap-1 md:gap-2 mb-3 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                      <div><label className="text-[9px] md:text-[10px] text-indigo-700 font-bold break-keep">출처친숙도(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm rounded text-center outline-none" value={q.idiSource || 1} onChange={e=>handleIdiChange(idx, 'idiSource', e.target.value)}/></div>
                      <div><label className="text-[9px] md:text-[10px] text-indigo-700 font-bold break-keep">변형로직(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm rounded text-center outline-none" value={q.idiLogic || 1} onChange={e=>handleIdiChange(idx, 'idiLogic', e.target.value)}/></div>
                      <div><label className="text-[9px] md:text-[10px] text-indigo-700 font-bold break-keep">개념결합(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm rounded text-center outline-none" value={q.idiConcept || 1} onChange={e=>handleIdiChange(idx, 'idiConcept', e.target.value)}/></div>
                      <div><label className="text-[9px] md:text-[10px] text-indigo-700 font-bold break-keep">연산복잡(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm rounded text-center outline-none" value={q.idiCalc || 1} onChange={e=>handleIdiChange(idx, 'idiCalc', e.target.value)}/></div>
                      <div><label className="text-[9px] md:text-[10px] text-indigo-700 font-bold break-keep">논리전개(1-5)</label><input type="number" min="1" max="5" className="w-full border p-1 text-sm rounded text-center outline-none" value={q.idiProg || 1} onChange={e=>handleIdiChange(idx, 'idiProg', e.target.value)}/></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                      <div><label className="text-[10px] text-gray-500 font-bold">출처 분석</label><input type="text" className="w-full border p-1.5 text-sm rounded outline-none" value={q.source} onChange={e=>handleArrayChange('questions', idx, 'source', e.target.value)}/></div>
                      <div><label className="text-[10px] text-gray-500 font-bold">분석 코멘트</label><input type="text" className="w-full border p-1.5 text-sm rounded outline-none" value={q.analysis} onChange={e=>handleArrayChange('questions', idx, 'analysis', e.target.value)}/></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div><label className="text-[10px] text-gray-500 font-bold">실제 문제 이미지 (URL)</label><input type="text" className="w-full border p-1.5 text-sm rounded outline-none" value={q.qImage} onChange={e=>handleArrayChange('questions', idx, 'qImage', e.target.value)}/></div>
                      <div><label className="text-[10px] text-gray-500 font-bold">유사 적중 문항 이미지 (URL)</label><input type="text" className="w-full border p-1.5 text-sm rounded outline-none" value={q.simImage} onChange={e=>handleArrayChange('questions', idx, 'simImage', e.target.value)}/></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formData.type === 'trend' && (
            <div className="space-y-6">
               <div className="border p-4 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-sm font-bold mb-3 flex justify-between">
                  난이도 변화 추이 (최대 5개 권장)
                  <button onClick={() => addArrayItem('trendData', { examName: '', score: 50 })} className="text-blue-600 text-xs flex items-center gap-1 font-bold">+ 추가</button>
                </h3>
                {formData.trendData?.map((data, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" placeholder="시험명 (예: 23년 1학기)" className="flex-1 border p-2 text-sm rounded" value={data.examName} onChange={e=>handleArrayChange('trendData', idx, 'examName', e.target.value)} />
                    <input type="number" placeholder="점수(0~100)" className="w-24 border p-2 text-sm rounded" value={data.score} onChange={e=>handleArrayChange('trendData', idx, 'score', e.target.value)} />
                    <button onClick={() => removeArrayItem('trendData', idx)} className="text-red-500 px-2 hover:bg-red-100 rounded"><IconX/></button>
                  </div>
                ))}
              </div>
              <div className="border p-4 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-sm font-bold mb-3 flex justify-between">
                  출제 범위 및 특징 변화
                  <button onClick={() => addArrayItem('scopeChanges', { year: '', desc: '' })} className="text-blue-600 text-xs flex items-center gap-1 font-bold">+ 추가</button>
                </h3>
                {formData.scopeChanges?.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input type="text" placeholder="기간/연도" className="w-1/3 border p-2 text-sm rounded" value={item.year} onChange={e=>handleArrayChange('scopeChanges', idx, 'year', e.target.value)} />
                    <input type="text" placeholder="설명" className="flex-1 border p-2 text-sm rounded" value={item.desc} onChange={e=>handleArrayChange('scopeChanges', idx, 'desc', e.target.value)} />
                    <button onClick={() => removeArrayItem('scopeChanges', idx)} className="text-red-500 px-2 hover:bg-red-100 rounded"><IconX/></button>
                  </div>
                ))}
              </div>
              <div className="border p-4 rounded-xl bg-gray-50 shadow-sm">
                <h3 className="text-sm font-bold mb-3 flex justify-between">
                  선생님별 스타일 비교
                  <button onClick={() => addArrayItem('teacherStyles', { name: '', type: '', strategy: '' })} className="text-blue-600 text-xs flex items-center gap-1 font-bold">+ 추가</button>
                </h3>
                {formData.teacherStyles?.map((t, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row gap-2 mb-3 bg-white p-2 rounded border">
                    <div className="flex gap-2">
                        <input type="text" placeholder="선생님 이름" className="w-1/2 md:w-32 border p-2 text-sm rounded" value={t.name} onChange={e=>handleArrayChange('teacherStyles', idx, 'name', e.target.value)} />
                        <input type="text" placeholder="출제 유형" className="w-1/2 md:w-32 border p-2 text-sm rounded" value={t.type} onChange={e=>handleArrayChange('teacherStyles', idx, 'type', e.target.value)} />
                    </div>
                    <div className="flex gap-2 flex-1">
                        <input type="text" placeholder="대비 전략" className="flex-1 border p-2 text-sm rounded" value={t.strategy} onChange={e=>handleArrayChange('teacherStyles', idx, 'strategy', e.target.value)} />
                        <button onClick={() => removeArrayItem('teacherStyles', idx)} className="text-red-500 px-2 hover:bg-red-50 rounded"><IconX/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

    let mcqCount = 0, mcqScore = 0, saqCount = 0, saqScore = 0;
    (report.questions || []).forEach(q => {
        const qNumStr = String(q.qNum || '');
        const isSAQ = qNumStr.includes('주관식') || qNumStr.includes('서술') || qNumStr.includes('단답');
        const score = Number(q.score) || 0;
        if (isSAQ) { saqCount++; saqScore += score; } 
        else { mcqCount++; mcqScore += score; }
    });
    const mcqSaqText = `${mcqCount}문제(${mcqScore}점) / ${saqCount}문제(${saqScore}점)`;

    const currentQIndex = viewState.selectedQuestion ? (report.questions || []).findIndex(q => q.qNum === viewState.selectedQuestion.qNum) : -1;
    
    const handlePrevQuestion = () => {
        if (currentQIndex > 0) setViewState({ ...viewState, selectedQuestion: report.questions[currentQIndex - 1] });
    };
    const handleNextQuestion = () => {
        if (currentQIndex !== -1 && currentQIndex < report.questions.length - 1) {
            setViewState({ ...viewState, selectedQuestion: report.questions[currentQIndex + 1] });
        }
    };

    return (
      <div className="p-3 md:p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen relative">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <button onClick={handleGoBack} className="flex items-center gap-1 md:gap-2 text-gray-600 hover:text-gray-900 font-medium text-sm md:text-base">
            <IconArrowLeft /> 목록으로 돌아가기
          </button>
          
          {isStaff && (
            <div className="flex gap-1 md:gap-2">
              <button onClick={() => handleOpenForm(report)} className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 text-xs md:text-sm font-bold">
                <IconEdit /> 수정
              </button>
              {!report.isDeleted && <button onClick={() => handleSoftDelete(report.id)} className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg shadow-sm hover:bg-red-100 text-xs md:text-sm font-bold">
                <IconTrash /> <span className="hidden md:inline">삭제</span>
              </button>}
              {isAdmin && report.isDeleted && <button onClick={() => handleRestore(report.id)} className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg shadow-sm hover:bg-green-100 text-xs md:text-sm font-bold">
                <IconRefresh /> 복구
              </button>}
              {isAdmin && <button onClick={() => handleHardDelete(report.id)} className="flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 bg-gray-800 text-white rounded-lg shadow-sm hover:bg-gray-900 text-xs md:text-sm font-bold">
                <IconTrash /> <span className="hidden md:inline">영구 삭제</span>
              </button>}
            </div>
          )}
        </div>

        <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${report.isDeleted ? 'opacity-70 grayscale' : 'border-gray-100'}`}>
          <div className="bg-indigo-900 px-5 md:px-8 py-5 md:py-6 text-white">
            <div className="inline-block px-2 md:px-3 py-1 bg-indigo-800 rounded-full text-[10px] md:text-xs font-semibold mb-2 md:mb-3 tracking-wider">
              {report.type === 'trend' ? '경향 분석 리포트' : '시험 정밀 분석 리포트'}
            </div>
            <h1 className="text-xl md:text-3xl font-bold">[{report.year}] {report.school} {report.term} {report.subject} {report.type === 'trend' ? '경향 분석' : '분석'}</h1>
          </div>

          <div className="p-4 md:p-8">
            {report.type === 'trend' && (
              <div className="space-y-8 md:space-y-12">
                {report.trendData?.length > 0 && <section>
                  <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 md:mb-6 border-l-4 border-indigo-500 pl-3">난이도 변화 추이</h2>
                  <div className="bg-gray-50 rounded-xl p-4 md:p-6 border flex items-end justify-around h-48 md:h-64 overflow-x-auto">
                    {report.trendData.map((data, idx) => (
                      <div key={idx} className="flex flex-col items-center w-1/5 min-w-[60px] group">
                        <span className="text-indigo-600 font-bold mb-1 md:mb-2 text-xs md:text-base">{data.score}</span>
                        <div className="w-10 md:w-16 bg-gradient-to-t from-indigo-300 to-indigo-500 rounded-t-sm relative transition-all duration-500 group-hover:bg-indigo-600" style={{ height: `${data.score}%` }}></div>
                        <span className="mt-2 md:mt-4 text-[10px] md:text-sm font-medium text-gray-600 text-center break-keep">{data.examName}</span>
                      </div>
                    ))}
                  </div>
                </section>}
                {report.scopeChanges?.length > 0 && <section>
                  <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 md:mb-6 border-l-4 border-blue-500 pl-3">주요 출제 범위 및 특징 변화</h2>
                  <div className="space-y-3 md:space-y-4">
                    {report.scopeChanges.map((change, idx) => (
                      <div key={idx} className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4 bg-white border p-3 md:p-4 rounded-lg shadow-sm">
                        <div className="bg-blue-100 text-blue-700 font-bold px-2 py-1 md:px-3 md:py-1 rounded text-xs md:text-sm w-fit whitespace-nowrap">{change.year}</div>
                        <p className="text-gray-700 text-sm leading-relaxed">{change.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>}
                {report.teacherStyles?.length > 0 && <section>
                  <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 md:mb-6 border-l-4 border-emerald-500 pl-3">선생님별 출제 스타일 비교</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead><tr className="bg-gray-100 text-gray-700 text-sm"><th className="p-2 md:p-3 border w-1/4">선생님</th><th className="p-2 md:p-3 border w-1/4">주요 출제 유형</th><th className="p-2 md:p-3 border w-1/2">특징 및 대비 전략</th></tr></thead>
                      <tbody>
                        {report.teacherStyles.map((teacher, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50 text-sm"><td className="p-2 md:p-3 border font-bold text-emerald-800">{teacher.name}</td><td className="p-2 md:p-3 border text-gray-600">{teacher.type}</td><td className="p-2 md:p-3 border text-gray-600 text-xs md:text-sm">{teacher.strategy}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>}
              </div>
            )}

            {report.type === 'individual' && (
              <div className="space-y-6 md:space-y-8">
                
                <div className="bg-white border border-indigo-100 rounded-xl p-4 md:p-6 shadow-sm mb-6">
                    <h3 className="text-sm md:text-base font-bold text-indigo-900 mb-2">📝 시험 총평 요약</h3>
                    <p className="text-gray-800 text-sm md:text-base leading-relaxed whitespace-pre-wrap">{report.review}</p>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                  <button onClick={() => setShowDetails(!showDetails)} className="w-full px-4 md:px-6 py-3 md:py-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className="font-bold text-gray-800 flex items-center gap-2 text-sm md:text-base">세부 정보 <span className="hidden md:inline text-xs text-gray-500 font-normal">(출제 선생님, 등급컷, 출제 비중 등)</span></span>
                    {showDetails ? <IconChevronUp /> : <IconChevronDown />}
                  </button>
                  
                  {showDetails && (
                    <div className="p-4 md:p-6 space-y-4 md:space-y-6 animate-fade-in border-t">
                      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        <InfoBox label="출제 선생님" value={report.teacher} />
                        
                        <div className="bg-white border rounded-xl p-3 md:p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-center">
                            <p className="text-[10px] md:text-xs text-gray-500 font-medium mb-1.5">등급컷</p>
                            <div className="flex flex-col gap-1 text-xs md:text-sm">
                                <div className="flex justify-between border-b border-gray-50 pb-1"><span>1등급</span><span className="font-bold text-gray-800">{report.gradeCuts?.grade1 || '-'}</span></div>
                                <div className="flex justify-between border-b border-gray-50 pb-1"><span>2등급</span><span className="font-bold text-gray-800">{report.gradeCuts?.grade2 || '-'}</span></div>
                                <div className="flex justify-between"><span>3등급</span><span className="font-bold text-gray-800">{report.gradeCuts?.grade3 || '-'}</span></div>
                            </div>
                        </div>

                        <InfoBox label="객관식 / 주관식" value={mcqSaqText} colSpan={2} />
                      </section>
                      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <InfoBox label="부교재" value={report.suppBook} />
                        <InfoBox label="학교 프린트/기타출처" value={report.print} />
                      </section>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                          <div className="border border-blue-100 rounded-xl p-4 md:p-5 bg-blue-50/30">
                              <h3 className="font-bold text-blue-900 mb-3 text-xs md:text-sm">📊 출제 근거 (문항 출처 비중)</h3>
                              <ul className="space-y-2">
                                  {getSourceDistribution(report.questions).map(d => (
                                      <li key={d.source} className="flex justify-between items-center text-xs md:text-sm text-gray-700 bg-white p-2.5 rounded-lg border border-blue-50 shadow-sm">
                                          <span className="font-medium text-gray-800">{d.source}</span>
                                          <span className="font-bold text-blue-600">{d.count}문항 <span className="text-blue-400 font-normal">({d.percent}%)</span></span>
                                      </li>
                                  ))}
                              </ul>
                          </div>

                          <div className="border border-purple-100 rounded-xl p-4 md:p-5 bg-purple-50/30">
                              <h3 className="font-bold text-purple-900 mb-3 text-xs md:text-sm">📚 단원별 출제 비중</h3>
                              <ul className="space-y-2">
                                  {getUnitDistribution(report.questions).map(d => (
                                      <li key={d.unit} className="flex justify-between items-center text-xs md:text-sm text-gray-700 bg-white p-2.5 rounded-lg border border-purple-50 shadow-sm">
                                          <span className="font-medium text-gray-800">{d.unit}</span>
                                          <span className="font-bold text-purple-600">{d.count}문항 <span className="text-purple-400 font-normal">({d.percent}%)</span></span>
                                      </li>
                                  ))}
                              </ul>
                          </div>
                      </div>

                      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                          <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-white shadow-sm">
                              <h3 className="font-bold text-gray-800 mb-2 text-xs md:text-sm">시험 범위</h3>
                              <p className="text-gray-600 text-xs md:text-sm leading-relaxed">{report.scope || '-'}</p>
                          </div>
                          <div className="border border-red-100 rounded-xl p-4 md:p-5 bg-white shadow-sm">
                              <h3 className="font-bold text-red-800 mb-2 text-xs md:text-sm">💡 특이사항</h3>
                              <p className="text-gray-700 text-xs md:text-sm leading-relaxed whitespace-pre-wrap">{report.specialNotes || '-'}</p>
                          </div>
                      </section>
                    </div>
                  )}
                </div>

                <div className="border border-indigo-200 rounded-xl overflow-hidden bg-white">
                  <button onClick={() => setShowQuestions(!showQuestions)} className="w-full px-4 md:px-6 py-3 md:py-4 flex justify-between items-center bg-indigo-50 hover:bg-indigo-100 transition-colors">
                    <span className="font-bold text-indigo-900 flex items-center gap-2 text-sm md:text-base">상세 문항 리스트 <span className="hidden md:inline text-xs text-indigo-500 font-normal">(표를 클릭하면 분석 확인)</span></span>
                    {showQuestions ? <IconChevronUp /> : <IconChevronDown />}
                  </button>
                  
                  {showQuestions && (
                    <div className="p-0 animate-fade-in border-t border-indigo-100">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs md:text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="p-3 md:p-4 font-bold text-gray-600 text-center w-16 md:w-20">번호</th>
                              <th className="p-3 md:p-4 font-bold text-gray-600">단원</th>
                              <th className="p-3 md:p-4 font-bold text-gray-600 text-center w-24 md:w-32">난이도(IDI점수)</th>
                              <th className="p-3 md:p-4 font-bold text-gray-600 w-24 md:w-32 text-center">출제 근거</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.questions.map((q, idx) => (
                              <tr key={idx} onClick={() => handleOpenModal(q)} className="border-b hover:bg-indigo-50 transition-colors cursor-pointer group">
                                <td className="p-3 md:p-4 text-center font-bold text-indigo-900 group-hover:text-indigo-600">{q.qNum}</td>
                                <td className="p-3 md:p-4">
                                  <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                                    <span className="truncate max-w-[120px] md:max-w-[200px]">{q.unit}</span>
                                    {q.tags && <span className={`text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded w-fit whitespace-nowrap ${q.tags.includes('킬러') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{q.tags}</span>}
                                  </div>
                                </td>
                                <td className="p-3 md:p-4 text-center">
                                  <span className={`font-medium ${q.diff==='최상'?'text-red-600':q.diff==='상'?'text-orange-500':q.diff==='중'?'text-green-600':'text-blue-500'}`}>{q.diff} ({q.idiTotal}점)</span>
                                </td>
                                <td className="p-3 md:p-4 text-center text-gray-600 text-[10px] md:text-xs">
                                    <span className="truncate max-w-[80px] md:max-w-[100px] block mx-auto">{q.source}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {isStaff && (
          <div className="mt-6 md:mt-8 border border-yellow-300 rounded-xl overflow-hidden bg-white shadow-sm">
            <button onClick={() => setShowInternalMemo(!showInternalMemo)} className="w-full px-4 md:px-6 py-3 md:py-4 flex justify-between items-center bg-yellow-50 hover:bg-yellow-100 transition-colors">
              <span className="font-bold text-yellow-800 flex items-center gap-2 text-sm md:text-base"><IconLock /> 교직원 전용 정보 <span className="hidden md:inline text-xs text-yellow-600 font-normal">(학생/학부모 미노출)</span></span>
              {showInternalMemo ? <IconChevronUp /> : <IconChevronDown />}
            </button>
            {showInternalMemo && (
              <div className="p-4 md:p-6 bg-yellow-50/30 border-t border-yellow-200 animate-fade-in">
                <textarea className="w-full bg-white border border-yellow-300 rounded-lg p-3 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="강사의 특별한 출제 성향, 다음 학기 대비 전략 등 내부적으로 공유할 내용을 기록하세요." value={memoInputs[report.id] !== undefined ? memoInputs[report.id] : (report.internalMemo || '')} onChange={(e) => setMemoInputs({...memoInputs, [report.id]: e.target.value})}/>
                <div className="flex justify-end mt-3">
                  <button onClick={() => saveInternalMemo(report.id)} className="px-4 py-1.5 md:px-5 md:py-2 bg-yellow-600 text-white font-bold text-sm rounded-lg hover:bg-yellow-700 shadow-sm transition-colors">메모 저장</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 모달 뷰 영역 */}
        {viewState.selectedQuestion && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 md:p-4 backdrop-blur-sm animate-fade-in overflow-hidden">
            
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] md:max-h-[90vh] flex flex-col relative z-40">
                
                <button onClick={handlePrevQuestion} disabled={currentQIndex <= 0} className="absolute -left-2 md:-left-6 top-1/2 -translate-y-1/2 z-50 bg-black/40 hover:bg-black/70 text-white rounded-full p-3 md:p-4 transition-all disabled:opacity-0 disabled:cursor-not-allowed shadow-lg">
                    <IconChevronLeft />
                </button>
                <button onClick={handleNextQuestion} disabled={currentQIndex === -1 || currentQIndex >= (report.questions?.length - 1)} className="absolute -right-2 md:-right-6 top-1/2 -translate-y-1/2 z-50 bg-black/40 hover:bg-black/70 text-white rounded-full p-3 md:p-4 transition-all disabled:opacity-0 disabled:cursor-not-allowed shadow-lg">
                    <IconChevronRight />
                </button>

                <div className="px-5 md:px-8 py-3 md:py-4 border-b bg-indigo-50 flex justify-between items-center shrink-0 rounded-t-2xl">
                    <div className="flex items-center gap-2 pl-4 md:pl-0">
                        <span className="bg-indigo-600 text-white px-2 py-1 md:px-3 md:py-1 rounded-lg text-sm md:text-lg font-black">{viewState.selectedQuestion.qNum}번</span>
                        <h3 className="text-sm md:text-xl font-black text-indigo-900">문항 상세 분석</h3>
                    </div>
                    <button onClick={handleGoBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 hover:text-indigo-900 transition-colors font-bold z-50">
                        <IconX />
                    </button>
                </div>
              
                <div className="p-5 md:p-8 overflow-y-auto space-y-6 md:space-y-8 flex-1 custom-scrollbar">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 px-2 md:px-4">
                        <div className="space-y-3 md:space-y-4">
                            <div className="border border-gray-200 rounded-xl bg-gray-50 p-2 text-center h-48 md:h-64 flex flex-col items-center justify-center text-gray-400 overflow-hidden relative group">
                                <span className="absolute top-2 left-2 text-[10px] md:text-xs font-bold bg-gray-200 text-gray-700 px-2 py-1 rounded shadow-sm">실제 출제 문제</span>
                                {viewState.selectedQuestion.qImage ? <img src={viewState.selectedQuestion.qImage} alt="실제문제" loading="lazy" className="max-h-full object-contain" /> : <p className="text-xs md:text-sm">이미지 등록 안됨</p>}
                            </div>
                            <div className="border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50 p-2 text-center h-48 md:h-64 flex flex-col items-center justify-center text-indigo-400 font-medium overflow-hidden relative">
                                <span className="absolute top-2 left-2 text-[10px] md:text-xs font-bold bg-indigo-200 text-indigo-800 px-2 py-1 rounded shadow-sm">적중/유사 문항</span>
                                {viewState.selectedQuestion.simImage ? <img src={viewState.selectedQuestion.simImage} alt="학원교재 유사문항" loading="lazy" className="max-h-full object-contain" /> : <p className="text-xs md:text-sm">이미지 등록 안됨</p>}
                            </div>
                        </div>
                        
                        <div className="space-y-2 md:space-y-3">
                            <DetailRow label="단원 및 내용" value={viewState.selectedQuestion.unit} />
                            <DetailRow label="출처 분석" value={viewState.selectedQuestion.source} />
                            <DetailRow label="최종 난이도" value={`${viewState.selectedQuestion.diff || '하'} (총 ${viewState.selectedQuestion.idiTotal || 5}점)`} />
                            <DetailRow label="문항 배점" value={`${viewState.selectedQuestion.score}점`} />

                            <div className="pt-3 md:pt-4 mt-2">
                                <p className="text-xs md:text-sm font-bold text-indigo-800 mb-2 md:mb-3">
                                    📊 세부 난이도 지수 (IDI 총합 : {viewState.selectedQuestion.idiTotal} <span className="text-[10px] md:text-xs text-indigo-400 font-normal">/ 25점</span>)
                                </p>
                                <div className="grid grid-cols-5 gap-1.5 md:gap-2 text-center text-sm">
                                    <div className="bg-indigo-50 border border-indigo-100 p-1.5 md:p-2 rounded-lg flex flex-col items-center justify-center"><span className="text-[8px] md:text-[10px] text-indigo-600 mb-0.5 md:mb-1 break-keep">출처친숙도</span><span className="font-bold text-indigo-900">{viewState.selectedQuestion.idiSource || 1} <span className="text-[8px] md:text-[9px] text-indigo-400 font-normal">/5</span></span></div>
                                    <div className="bg-indigo-50 border border-indigo-100 p-1.5 md:p-2 rounded-lg flex flex-col items-center justify-center"><span className="text-[8px] md:text-[10px] text-indigo-600 mb-0.5 md:mb-1 break-keep">변형로직</span><span className="font-bold text-indigo-900">{viewState.selectedQuestion.idiLogic || 1} <span className="text-[8px] md:text-[9px] text-indigo-400 font-normal">/5</span></span></div>
                                    <div className="bg-indigo-50 border border-indigo-100 p-1.5 md:p-2 rounded-lg flex flex-col items-center justify-center"><span className="text-[8px] md:text-[10px] text-indigo-600 mb-0.5 md:mb-1 break-keep">개념결합도</span><span className="font-bold text-indigo-900">{viewState.selectedQuestion.idiConcept || 1} <span className="text-[8px] md:text-[9px] text-indigo-400 font-normal">/5</span></span></div>
                                    <div className="bg-indigo-50 border border-indigo-100 p-1.5 md:p-2 rounded-lg flex flex-col items-center justify-center"><span className="text-[8px] md:text-[10px] text-indigo-600 mb-0.5 md:mb-1 break-keep">연산복잡도</span><span className="font-bold text-indigo-900">{viewState.selectedQuestion.idiCalc || 1} <span className="text-[8px] md:text-[9px] text-indigo-400 font-normal">/5</span></span></div>
                                    <div className="bg-indigo-50 border border-indigo-100 p-1.5 md:p-2 rounded-lg flex flex-col items-center justify-center"><span className="text-[8px] md:text-[10px] text-indigo-600 mb-0.5 md:mb-1 break-keep">논리전개</span><span className="font-bold text-indigo-900">{viewState.selectedQuestion.idiProg || 1} <span className="text-[8px] md:text-[9px] text-indigo-400 font-normal">/5</span></span></div>
                                </div>
                            </div>

                            <div className="pt-3 md:pt-4 mt-3 md:mt-4 border-t border-gray-100">
                                <h4 className="font-bold text-gray-800 mb-1.5 md:mb-2 text-sm md:text-base">📝 담당 강사 코멘트</h4>
                                <div className="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-100 text-gray-700 text-xs md:text-sm leading-relaxed whitespace-pre-wrap min-h-[80px]">
                                    {viewState.selectedQuestion.analysis || "코멘트가 없습니다."}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function InfoBox({ label, value, colSpan = 1 }) {
    return (
      <div className={`bg-white border rounded-xl p-3 md:p-4 shadow-sm col-span-${colSpan} hover:shadow-md transition-shadow`}>
        <p className="text-[10px] md:text-xs text-gray-500 font-medium mb-1">{label}</p>
        <p className="font-bold text-gray-800 text-xs md:text-sm">{value || '-'}</p>
      </div>
    );
  }

  function DetailRow({ label, value }) {
    return (
      <div className="flex border-b border-gray-100 pb-2 md:pb-3 mt-2 md:mt-3">
        <span className="w-1/3 text-xs md:text-sm font-bold text-gray-500">{label}</span>
        <span className="w-2/3 text-xs md:text-sm text-gray-900 font-bold leading-tight">{value || '-'}</span>
      </div>
    );
  }
}