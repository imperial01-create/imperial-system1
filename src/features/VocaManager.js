/* [서비스 가치] CAT 초기 진단 점수 입력 엔진. 
   'Inbox Zero' 철학을 도입하여 아직 점수가 없는 신규 학생만 노출함으로써, 
   운영자의 불필요한 탐색 시간을 없애고 데이터베이스 읽기(Read) 비용을 극한으로 최적화합니다. */
import React, { useState, useMemo } from 'react';
import { updateStudentCatScore } from '../utils/englishStatManager';
import { useData } from '../contexts/DataContext';
import { Search, Save, AlertCircle, CheckCircle, ListFilter } from 'lucide-react'; 

const VocaManager = ({ currentUser }) => {
  // 🚀 [에러 해결] 분리된 enrollments 테이블을 교차 검증하여 완벽하게 데이터를 가져옵니다.
  const { users, classes, enrollments, englishStats } = useData();
  
  const [catInputs, setCatInputs] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false); // 수정용 토글

  // 1. 영어반 및 초기화 대상 학생 필터링 로직 (Time Complexity: O(N))
  const processedStudents = useMemo(() => {
    if (!users || !classes || !enrollments) return { pending: [], completed: [] };

    // A. 영어 과목 클래스 ID 추출 ('영어'라는 단어가 포함되면 모두 인정)
    const englishClassIds = classes
      .filter(cls => cls.subject?.includes('영어') || cls.subject?.includes('English'))
      .map(cls => cls.id);

    // B. 영어반에 수강 중인(active) 등록 정보 추출
    const activeEnglishEnrollments = enrollments.filter(e => 
      englishClassIds.includes(e.classId) && e.status === 'active'
    );

    const pending = [];
    const completed = [];

    // C. 학생들 분류 작업
    users.filter(u => u.role === 'student').forEach(student => {
      // 해당 학생이 영어반을 듣고 있는지 확인
      const myEnrollment = activeEnglishEnrollments.find(e => e.studentId === student.id);
      if (!myEnrollment) return; // 영어 안 들으면 패스

      const myClass = classes.find(c => c.id === myEnrollment.classId);
      const studentData = {
        ...student,
        className: myClass ? myClass.name : '미지정'
      };

      // 이미 CAT 점수가 있는지 확인 (englishStats 컬렉션 조회)
      const studentStat = (englishStats || []).find(stat => stat.studentId === student.id);
      const hasCatScore = studentStat && studentStat.catScore !== undefined && studentStat.catScore > 0;

      if (hasCatScore) {
        studentData.currentScore = studentStat.catScore;
        completed.push(studentData);
      } else {
        pending.push(studentData);
      }
    });

    return { pending, completed };
  }, [users, classes, enrollments, englishStats]);

  const targetStudents = showCompleted ? processedStudents.completed : processedStudents.pending;

  // 2. 권한 방어
  if (currentUser.role === 'teacher' && processedStudents.pending.length === 0 && processedStudents.completed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-gray-500 bg-white rounded-[32px] shadow-sm">
        <AlertCircle size={64} className="mb-4 text-rose-400" />
        <h2 className="text-2xl font-black text-slate-800 mb-2">접근 권한 없음</h2>
        <p className="font-bold text-slate-500">Voca 출제 엔진은 '영어' 과목 운영자만 접근할 수 있습니다.</p>
      </div>
    );
  }

  // 3. 핸들러
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
      setMessage({ type: 'success', text: '학생의 초기 진단 점수가 시스템에 연동되었습니다.' });
      // 저장 완료 후 input 초기화 (리스트에서 사라지거나 완료탭으로 넘어가므로)
      setCatInputs(prev => { const next = {...prev}; delete next[studentId]; return next; });
    } catch (error) {
      setMessage({ type: 'error', text: '저장 중 오류가 발생했습니다. ' + error.message });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="p-8 bg-white rounded-[40px] shadow-sm border border-slate-100 max-w-6xl mx-auto mt-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <span className="bg-indigo-100 text-indigo-600 p-2 rounded-2xl"><ListFilter size={28}/></span>
            CAT 초기 진단 입력 패널
          </h1>
          <p className="text-slate-500 font-bold mt-2">영어 수강생의 초기 어휘력(0~1000점)을 1회 세팅합니다. 입력된 학생은 리스트에서 자동으로 지워집니다.</p>
        </div>
        
        <button 
          onClick={() => setShowCompleted(!showCompleted)}
          className={`mt-4 md:mt-0 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${showCompleted ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
        >
          {showCompleted ? '미입력 학생 대기열 보기' : '완료된 학생 리스트 보기 (수정용)'}
        </button>
      </div>
      
      {message && (
        <div className={`p-4 mb-6 rounded-2xl font-bold flex items-center gap-2 animate-in slide-in-from-top-2 ${message.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          <CheckCircle size={20} />
          {message.text}
        </div>
      )}

      {targetStudents.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
          <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
          <h3 className="text-xl font-black text-slate-700">모든 처리가 완료되었습니다!</h3>
          <p className="text-slate-500 font-bold mt-2">
            {showCompleted ? '아직 CAT 점수가 입력된 학생이 없습니다.' : '초기 진단 점수를 입력할 신규 대기열이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-4 font-black text-slate-600 rounded-tl-2xl">학생 이름</th>
                <th className="p-4 font-black text-slate-600">소속 영어반</th>
                <th className="p-4 font-black text-slate-600">CAT 진단 점수 (0~1000)</th>
                <th className="p-4 font-black text-slate-600 rounded-tr-2xl">상태 및 관리</th>
              </tr>
            </thead>
            <tbody>
              {targetStudents.map(student => (
                <tr key={student.id} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors group">
                  <td className="p-4 font-bold text-slate-800">{student.name}</td>
                  <td className="p-4 font-bold text-slate-500">
                    <span className="bg-slate-100 px-3 py-1 rounded-lg text-sm">{student.className}</span>
                  </td>
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
                  <td className="p-4">
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
        </div>
      )}
    </div>
  );
};

export default VocaManager;