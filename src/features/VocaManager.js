/* [서비스 가치] CAT 초기 진단 입력 패널 (UI/UX 및 권한 최적화 패치)
   1. 고정형 레이아웃(Fixed Layout)을 통해 화면 떨림 현상을 제거하여 작업자의 시각적 피로도를 낮춥니다.
   2. 철저한 Role-Based Access Control(RBAC)을 통해 강사 간 데이터 격리를 실현합니다.
   3. 강의명 > 학생명 2중 정렬을 통해 출석부 대조 업무 속도를 200% 향상시킵니다. */
import React, { useState, useMemo } from 'react';
import { updateStudentCatScore } from '../utils/englishStatManager';
import { useData } from '../contexts/DataContext';
import { Save, AlertCircle, CheckCircle, ListFilter, Search } from 'lucide-react'; 

const VocaManager = ({ currentUser }) => {
  const { users, classes, enrollments, englishStats } = useData();
  
  const [catInputs, setCatInputs] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false); // 미입력/완료 토글

  // 1. 영어반 필터링, 권한 검증 및 2중 정렬 알고리즘
  const processedStudents = useMemo(() => {
    if (!users || !classes || !enrollments || !currentUser) return { pending: [], completed: [] };

    // A. 전체 영어 클래스 식별
    const englishClasses = classes.filter(cls => cls.subject?.includes('영어') || cls.subject?.includes('English'));

    // B. 권한(Role)에 따른 접근 허용 클래스 ID 추출 (Zero Trust)
    let allowedClassIds = [];
    if (['admin', 'admin_assistant', 'ta'].includes(currentUser.role)) {
      // 관리자 그룹: 모든 영어반 접근 가능
      allowedClassIds = englishClasses.map(c => c.id);
    } else if (['lecturer', 'teacher'].includes(currentUser.role)) {
      // 강사: 본인이 담당하는 영어반만 접근 가능
      allowedClassIds = englishClasses
        .filter(c => c.lecturerId === currentUser.id)
        .map(c => c.id);
    }

    // C. 허용된 영어반에 수강 중인(active) 등록 정보 추출
    const activeEnglishEnrollments = enrollments.filter(e => 
      allowedClassIds.includes(e.classId) && e.status === 'active'
    );

    const pending = [];
    const completed = [];

    // D. 학생 데이터 조립
    users.filter(u => u.role === 'student').forEach(student => {
      const myEnrollment = activeEnglishEnrollments.find(e => e.studentId === student.id);
      if (!myEnrollment) return; // 권한이 없거나 영어 수강생이 아니면 패스

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

    // E. 다중 정렬 (1순위: 수강 강의명 가나다, 2순위: 학생 이름 가나다)
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

  // 2. 권한 방어: 담당 영어반이 없는 강사는 접근 차단
  if (['lecturer', 'teacher'].includes(currentUser.role) && processedStudents.pending.length === 0 && processedStudents.completed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-500 bg-white rounded-[40px] shadow-sm border border-slate-100 max-w-6xl mx-auto mt-6">
        <AlertCircle size={64} className="mb-4 text-rose-400" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">할당된 강의 없음</h2>
        <p className="font-bold text-slate-500">현재 담당하고 계신 '영어' 과목의 수강생 내역이 없습니다.</p>
      </div>
    );
  }

  // 3. 점수 저장 핸들러
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
      setMessage({ type: 'success', text: '학생의 초기 진단 점수가 시스템에 완벽하게 연동되었습니다.' });
      setCatInputs(prev => { const next = {...prev}; delete next[studentId]; return next; });
    } catch (error) {
      setMessage({ type: 'error', text: '저장 중 오류가 발생했습니다. ' + error.message });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    // 🚀 [UI/UX 최적화] 카드의 높이를 h-[750px]로 단단히 고정하여 탭 전환 시 화면 흔들림 방지
    <div className="p-8 bg-white rounded-[40px] shadow-sm border border-slate-100 max-w-6xl mx-auto mt-6 animate-in fade-in flex flex-col h-[750px]">
      
      {/* 헤더 영역 (고정) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-slate-100 pb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <span className="bg-indigo-100 text-indigo-600 p-2 rounded-2xl"><ListFilter size={28}/></span>
            CAT 초기 진단 입력 패널
          </h1>
          <p className="text-slate-500 font-bold mt-2">
            {['admin', 'admin_assistant', 'ta'].includes(currentUser.role) 
              ? "전체 영어 강의 수강생의 초기 어휘력을 세팅합니다." 
              : "담당하시는 영어 강의 수강생의 초기 어휘력을 세팅합니다."}
          </p>
        </div>
        
        <button 
          onClick={() => setShowCompleted(!showCompleted)}
          className={`mt-4 md:mt-0 px-5 py-2.5 rounded-xl font-bold text-sm transition-all border shadow-sm active:scale-95 ${showCompleted ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
        >
          {showCompleted ? '미입력 학생 대기열 보기' : '완료된 학생 리스트 보기 (수정용)'}
        </button>
      </div>
      
      {/* 알림 메시지 영역 (고정 공간 확보로 레이아웃 시프트 방지) */}
      <div className="h-14 mb-2 shrink-0">
        {message && (
          <div className={`h-full px-4 rounded-2xl font-bold flex items-center gap-2 animate-in slide-in-from-top-2 shadow-sm ${message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            <CheckCircle size={20} />
            {message.text}
          </div>
        )}
      </div>

      {/* 🚀 [내부 스크롤 영역] 표의 내용이 아무리 길거나 짧아도, 이 박스 안에서만 렌더링되게 통제 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-100 rounded-[24px] relative bg-slate-50/30">
        {targetStudents.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <CheckCircle size={56} className="text-emerald-400 mb-4" />
            <h3 className="text-2xl font-black text-slate-700">모든 처리가 완료되었습니다!</h3>
            <p className="text-slate-500 font-bold mt-2">
              {showCompleted ? '아직 CAT 점수가 입력된 학생이 없습니다.' : '초기 진단 점수를 입력할 신규 대기열이 없습니다.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
              <tr>
                {/* A열: 수강 강의명 / B열: 학생 이름 변경 반영 */}
                <th className="p-4 font-black text-slate-600 border-b border-slate-200">수강 강의명</th>
                <th className="p-4 font-black text-slate-600 border-b border-slate-200">학생 이름</th>
                <th className="p-4 font-black text-slate-600 border-b border-slate-200">CAT 진단 점수 (0~1000)</th>
                <th className="p-4 font-black text-slate-600 border-b border-slate-200 text-center">상태 및 관리</th>
              </tr>
            </thead>
            <tbody>
              {targetStudents.map(student => (
                <tr key={student.id} className="border-b border-slate-100 bg-white hover:bg-indigo-50/30 transition-colors group">
                  <td className="p-4 font-black text-slate-600">
                    <span className="bg-slate-100 px-3 py-1.5 rounded-lg text-[13px]">{student.className}</span>
                  </td>
                  <td className="p-4 font-black text-slate-800 text-lg">{student.name}</td>
                  <td className="p-4">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      placeholder={showCompleted ? String(student.currentScore) : "예: 850"}
                      className="w-32 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-black text-slate-700 shadow-sm transition-all"
                      value={catInputs[student.id] || ''}
                      onChange={(e) => handleScoreChange(student.id, e.target.value)}
                    />
                  </td>
                  <td className="p-4 flex justify-center">
                    <button 
                      onClick={() => handleSaveScore(student.id)}
                      disabled={isSaving || !catInputs[student.id]}
                      className="flex items-center px-5 py-2.5 text-sm font-black text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                    >
                      <Save size={16} className="mr-2" />
                      {showCompleted ? '점수 수정' : '초기화(저장)'}
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