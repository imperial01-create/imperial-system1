/* [서비스 가치] CAT 초기 진단 입력 패널 (모바일 반응형 + 레이아웃 안정화 패치)
   1. overflow-auto와 min-w-[800px]를 결합하여, 모바일 환경에서도 화면 잘림 없이 쾌적한 점수 입력이 가능합니다.
   2. 데스크탑 환경에서는 탭 전환 시 표의 너비가 1px도 흔들리지 않아 작업 피로도를 최소화합니다. */
import React, { useState, useMemo } from 'react';
import { updateStudentCatScore } from '../utils/englishStatManager';
import { useData } from '../contexts/DataContext';
import { Save, AlertCircle, CheckCircle, ListFilter } from 'lucide-react'; 

const VocaManager = ({ currentUser }) => {
  const { users, classes, enrollments, englishStats } = useData();
  
  const [catInputs, setCatInputs] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const processedStudents = useMemo(() => {
    if (!users || !classes || !enrollments || !currentUser) return { pending: [], completed: [] };

    const englishClasses = classes.filter(cls => cls.subject?.includes('영어') || cls.subject?.includes('English'));

    let allowedClassIds = [];
    if (['admin', 'admin_assistant', 'ta'].includes(currentUser.role)) {
      allowedClassIds = englishClasses.map(c => c.id);
    } else if (['lecturer', 'teacher'].includes(currentUser.role)) {
      allowedClassIds = englishClasses
        .filter(c => c.lecturerId === currentUser.id)
        .map(c => c.id);
    }

    const activeEnglishEnrollments = enrollments.filter(e => 
      allowedClassIds.includes(e.classId) && e.status === 'active'
    );

    const pending = [];
    const completed = [];

    users.filter(u => u.role === 'student').forEach(student => {
      const myEnrollment = activeEnglishEnrollments.find(e => e.studentId === student.id);
      if (!myEnrollment) return; 

      const myClass = classes.find(c => c.id === myEnrollment.classId);
      const studentData = {
        ...student,
        className: myClass ? myClass.name : '미지정'
      };

      const studentStat = (englishStats || []).find(stat => stat.studentId === student.id);
      const hasCatScore = studentStat && studentStat.catScore !== undefined && studentStat.catScore > 0;

      if (hasCatScore) {
        studentData.currentScore = studentStat.catScore;
        completed.push(studentData);
      } else {
        pending.push(studentData);
      }
    });

    const sortStudents = (arr) => {
      return arr.sort((a, b) => {
        if (a.className === b.className) {
          return a.name.localeCompare(b.name);
        }
        return a.className.localeCompare(b.className);
      });
    };

    return { 
      pending: sortStudents(pending), 
      completed: sortStudents(completed) 
    };
  }, [users, classes, enrollments, englishStats, currentUser]);

  const targetStudents = showCompleted ? processedStudents.completed : processedStudents.pending;

  if (['lecturer', 'teacher'].includes(currentUser.role) && processedStudents.pending.length === 0 && processedStudents.completed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 sm:p-20 text-slate-500 bg-white rounded-[24px] sm:rounded-[40px] shadow-sm border border-slate-100 w-full max-w-6xl mx-auto mt-6">
        <AlertCircle size={64} className="mb-4 text-rose-400" />
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 mb-2">할당된 강의 없음</h2>
        <p className="font-bold text-slate-500 text-center text-sm sm:text-base">현재 담당하고 계신 '영어' 과목의 수강생 내역이 없습니다.</p>
      </div>
    );
  }

  const handleScoreChange = (studentId, value) => {
    setCatInputs(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSaveScore = async (studentId) => {
    const score = catInputs[studentId];
    if (!score) return;

    setIsSaving(true);
    setMessage(null);
    try {
      await updateStudentCatScore(studentId, score);
      setMessage({ type: 'success', text: '학생의 초기 진단 점수가 정상 반영되었습니다.' });
      setCatInputs(prev => { const next = {...prev}; delete next[studentId]; return next; });
    } catch (error) {
      setMessage({ type: 'error', text: '저장 중 오류가 발생했습니다. ' + error.message });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    // 🚀 모바일 대응: 여백(p)과 모서리 둥글기(rounded)를 화면 크기에 맞춰 조절, 너비는 유연하게(w-full)
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-8 bg-white rounded-[24px] sm:rounded-[40px] shadow-sm border border-slate-100 mt-6 animate-in fade-in flex flex-col h-[750px]">
      
      {/* 헤더 영역 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-6 border-b border-slate-100 pb-4 sm:pb-6 shrink-0 w-full">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 flex items-center gap-2 sm:gap-3">
            <span className="bg-indigo-100 text-indigo-600 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl"><ListFilter size={24} className="sm:w-7 sm:h-7"/></span>
            CAT 초기 진단 입력
          </h1>
          <p className="text-slate-500 font-bold mt-2 text-xs sm:text-sm">
            {['admin', 'admin_assistant', 'ta'].includes(currentUser.role) 
              ? "전체 영어 강의 수강생의 초기 어휘력을 세팅합니다." 
              : "담당하시는 영어 강의 수강생의 초기 어휘력을 세팅합니다."}
          </p>
        </div>
        
        <button 
          onClick={() => setShowCompleted(!showCompleted)}
          className={`mt-4 md:mt-0 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all border shadow-sm active:scale-95 shrink-0 ${showCompleted ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
        >
          {showCompleted ? '미입력 학생 대기열 보기' : '완료된 학생 리스트 (수정)'}
        </button>
      </div>
      
      {/* 알림 메시지 영역 */}
      <div className="h-12 sm:h-14 mb-2 shrink-0 w-full">
        {message && (
          <div className={`h-full px-3 sm:px-4 rounded-xl sm:rounded-2xl font-bold flex items-center gap-2 animate-in slide-in-from-top-2 shadow-sm text-xs sm:text-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            <CheckCircle size={18} className="shrink-0" />
            <span className="truncate">{message.text}</span>
          </div>
        )}
      </div>

      {/* 🚀 핵심: overflow-auto 적용으로 상하좌우 모든 스크롤 허용 */}
      <div className="flex-1 overflow-auto custom-scrollbar border border-slate-100 rounded-[16px] sm:rounded-[24px] relative bg-slate-50/30 w-full">
        {targetStudents.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <CheckCircle size={48} className="text-emerald-400 mb-3 sm:mb-4" />
            <h3 className="text-lg sm:text-2xl font-black text-slate-700">모든 처리가 완료되었습니다!</h3>
            <p className="text-slate-500 font-bold mt-1 sm:mt-2 text-xs sm:text-sm">
              {showCompleted ? '아직 CAT 점수가 입력된 학생이 없습니다.' : '초기 진단 점수를 입력할 신규 대기열이 없습니다.'}
            </p>
          </div>
        ) : (
          // 🚀 표 자체에 min-w-[800px] 설정: 데이터가 뭉개지지 않도록 방어. 모바일에서는 좌우 스크롤 생성!
          <table className="w-full min-w-[800px] text-left border-collapse relative table-fixed">
            <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
              <tr>
                <th className="w-[25%] p-3 sm:p-4 font-black text-slate-600 border-b border-slate-200 text-xs sm:text-base">수강 강의명</th>
                <th className="w-[20%] p-3 sm:p-4 font-black text-slate-600 border-b border-slate-200 text-xs sm:text-base">학생 이름</th>
                <th className="w-[25%] p-3 sm:p-4 font-black text-slate-600 border-b border-slate-200 text-xs sm:text-base">CAT 진단 (0~1000)</th>
                <th className="w-[30%] p-3 sm:p-4 font-black text-slate-600 border-b border-slate-200 text-center text-xs sm:text-base">상태 및 관리</th>
              </tr>
            </thead>
            <tbody>
              {targetStudents.map(student => (
                <tr key={student.id} className="border-b border-slate-100 bg-white hover:bg-indigo-50/30 transition-colors group">
                  <td className="p-3 sm:p-4 font-black text-slate-600 truncate">
                    <span className="bg-slate-100 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-[11px] sm:text-[13px] whitespace-nowrap">{student.className}</span>
                  </td>
                  <td className="p-3 sm:p-4 font-black text-slate-800 text-sm sm:text-lg truncate">{student.name}</td>
                  <td className="p-3 sm:p-4">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      placeholder={showCompleted ? String(student.currentScore) : "예: 850"}
                      className="w-24 sm:w-32 p-2 sm:p-3 border border-slate-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-black text-slate-700 shadow-sm transition-all text-sm sm:text-base"
                      value={catInputs[student.id] || ''}
                      onChange={(e) => handleScoreChange(student.id, e.target.value)}
                    />
                  </td>
                  <td className="p-3 sm:p-4 flex justify-center">
                    <button 
                      onClick={() => handleSaveScore(student.id)}
                      disabled={isSaving || !catInputs[student.id]}
                      className="flex items-center px-3 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-black text-white bg-indigo-600 rounded-lg sm:rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                    >
                      <Save size={16} className="mr-1 sm:mr-2 shrink-0" />
                      <span className="whitespace-nowrap">{showCompleted ? '수정' : '초기화(저장)'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default VocaManager;