import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, AlertCircle, CheckCircle, Search, Users, FileText, Target, CheckSquare } from 'lucide-react';

/**
 * [서비스 가치] 반 단위 일괄 입력 및 오답 자동 점수 계산을 통해 
 * 강사의 행정 업무 시간을 학생당 30초에서 5초로 혁신적으로 단축합니다.
 */
export default function ExamDiagnosticInput({ currentUser }) {
  const [data, setData] = useState({ exams: [], classes: [], students: [] });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: 시험 검색 및 선택 필터
  const [filters, setFilters] = useState({ school: '', grade: '', term: '' });
  const [selectedExamId, setSelectedExamId] = useState('');

  // Step 2: 반 및 학생 선택
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  // Step 3: 학생별 입력 데이터 상태
  // 구조: { [studentId]: { wrongQuestions: [1, 3], score: 100, comment: '', plan: '' } }
  const [inputsByStudent, setInputsByStudent] = useState({});

  // 1. 초기 마스터 데이터 불러오기
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [examSnap, classSnap] = await Promise.all([
          getDocs(collection(db, 'artifacts/imperial-clinic-v1/public/data/integrated_exams')),
          getDocs(collection(db, 'artifacts/imperial-clinic-v1/public/data/classes'))
        ]);

        const examsData = examSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const classesData = classSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 학생 목록 가져오기 (인덱스 에러 방지를 위한 방어적 폴백 구현)
        let studentsData = [];
        try {
          const uSnap = await getDocs(query(collection(db, 'artifacts/imperial-clinic-v1/public/data/users'), where('role', '==', 'student')));
          studentsData = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
          const uSnap = await getDocs(collection(db, 'artifacts/imperial-clinic-v1/public/data/users'));
          studentsData = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role === 'student');
        }

        setData({ exams: examsData, classes: classesData, students: studentsData });
      } catch (error) {
        console.error("데이터 로딩 에러:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // 필터링에 필요한 고유값 추출
  const uniqueSchools = [...new Set(data.exams.map(e => e.schoolName))].filter(Boolean);
  const uniqueGrades = [...new Set(data.exams.map(e => e.grade))].filter(Boolean);
  const uniqueTerms = [...new Set(data.exams.map(e => `${e.semester || ''} ${e.termType || ''}`.trim()))].filter(Boolean);

  // 시험 필터링 로직
  const filteredExams = data.exams.filter(e => {
    if (filters.school && e.schoolName !== filters.school) return false;
    if (filters.grade && e.grade !== filters.grade) return false;
    const termStr = `${e.semester || ''} ${e.termType || ''}`.trim();
    if (filters.term && !termStr.includes(filters.term)) return false;
    return true;
  });

  // 강사 권한에 따른 반 필터링
  const availableClasses = data.classes.filter(c => {
    if (currentUser?.role === 'admin') return true;
    return c.instructorId === currentUser?.id || c.teacherId === currentUser?.id || c.teacherName === currentUser?.name;
  });

  // 선택된 반에 소속된 학생 필터링
  const classStudents = data.students.filter(s => {
    if (!selectedClassId) return false;
    const cls = availableClasses.find(c => c.id === selectedClassId);
    if (!cls) return false;
    
    // DB 스키마 구조의 다양성을 고려한 완벽한 맵핑 로직
    if (s.classId === selectedClassId) return true;
    if (cls.studentIds && cls.studentIds.includes(s.id)) return true;
    if (cls.students && Array.isArray(cls.students)) {
      return cls.students.some(cs => cs === s.id || cs.id === s.id);
    }
    return false;
  });

  // 학생 체크박스 토글
  const toggleStudent = (sId) => {
    setSelectedStudentIds(prev => {
      const isSelected = prev.includes(sId);
      if (isSelected) return prev.filter(id => id !== sId);
      
      // 새로 선택된 경우 초기 입력 폼 생성
      setInputsByStudent(current => ({
        ...current,
        [sId]: current[sId] || { wrongQuestions: [], score: 100, comment: '', plan: '' }
      }));
      return [...prev, sId];
    });
  };

  const selectedExamData = data.exams.find(e => e.id === selectedExamId);
  // 시험에 등록된 문항이 없으면 기본 30문항으로 생성
  const examQuestionsList = selectedExamData?.questions && selectedExamData.questions.length > 0 
    ? selectedExamData.questions 
    : Array.from({ length: 30 }, (_, i) => ({ number: i + 1, point: null }));

  // 오답 문항 토글 및 자동 점수 계산 로직
  const toggleWrongQuestion = (sId, qNum) => {
    setInputsByStudent(prev => {
      const currentInput = prev[sId];
      const isWrong = currentInput.wrongQuestions.includes(qNum);
      
      let newWrongs;
      if (isWrong) {
        newWrongs = currentInput.wrongQuestions.filter(n => n !== qNum);
      } else {
        newWrongs = [...currentInput.wrongQuestions, qNum].sort((a, b) => a - b);
      }

      // [자동 점수 계산] 문항별 배점(point)이 있으면 차감, 없으면 균등 차감
      let newScore = 100;
      const totalQs = examQuestionsList.length;
      const hasPoints = examQuestionsList.some(q => q.point);

      if (hasPoints) {
        let deduction = 0;
        newWrongs.forEach(n => {
          const qInfo = examQuestionsList.find(x => Number(x.number) === Number(n));
          if (qInfo && qInfo.point) deduction += Number(qInfo.point);
        });
        newScore = Math.max(0, 100 - deduction);
      } else {
        const deductionPerQ = 100 / totalQs;
        newScore = Math.max(0, Math.round(100 - (newWrongs.length * deductionPerQ)));
      }

      return {
        ...prev,
        [sId]: { ...currentInput, wrongQuestions: newWrongs, score: newScore }
      };
    });
  };

  // 텍스트 및 점수 수동 변경 핸들러
  const handleInputChange = (sId, field, value) => {
    setInputsByStudent(prev => ({
      ...prev,
      [sId]: { ...prev[sId], [field]: value }
    }));
  };

  // 일괄 저장 (Batch Submit)
  const handleSubmitAll = async () => {
    if (!selectedExamId) return alert("시험을 선택해주세요.");
    if (selectedStudentIds.length === 0) return alert("최소 1명 이상의 학생을 선택해주세요.");

    setIsSubmitting(true);
    try {
      const promises = selectedStudentIds.map(sId => {
        const sInfo = data.students.find(s => s.id === sId);
        const input = inputsByStudent[sId];
        
        const payload = {
          examDocId: selectedExamData.id,
          studentId: sId,
          studentName: sInfo?.name || '알수없음',
          score: Number(input.score),
          wrongQuestionNumbers: input.wrongQuestions,
          instructorComment: input.comment,
          growthPlan: input.plan,
          instructorId: currentUser?.id || 'unknown',
          createdAt: serverTimestamp()
        };
        
        return addDoc(collection(db, 'artifacts/imperial-clinic-v1/public/data/student_exam_diagnostics'), payload);
      });

      await Promise.all(promises);
      alert(`성공적으로 ${selectedStudentIds.length}명 학생의 진단 리포트가 생성되었습니다!`);
      
      // 저장 후 초기화
      setSelectedStudentIds([]);
      setInputsByStudent({});
    } catch (error) {
      alert("저장 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-gray-500 font-bold animate-pulse">데이터를 불러오는 중입니다...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white p-6 rounded-2xl shadow-md">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><CheckSquare size={28}/> 스마트 시험 진단 일괄 입력</h1>
        <p className="opacity-90 text-sm">반을 선택하고 학생들의 오답 번호를 체크하면 점수가 자동 계산됩니다.</p>
      </div>

      {/* Step 1: 시험 선택 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4 border-b pb-2">
          <FileText className="text-blue-600" size={20} /> 1단계: 진단할 시험 검색 및 선택
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <select className="border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" value={filters.school} onChange={e => setFilters({...filters, school: e.target.value})}>
            <option value="">학교 전체</option>
            {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" value={filters.grade} onChange={e => setFilters({...filters, grade: e.target.value})}>
            <option value="">학년 전체</option>
            {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select className="border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" value={filters.term} onChange={e => setFilters({...filters, term: e.target.value})}>
            <option value="">학기/고사 전체</option>
            {uniqueTerms.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <select 
            className="w-full border border-blue-300 p-3 rounded-xl bg-blue-50 font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-500" 
            value={selectedExamId} 
            onChange={e => setSelectedExamId(e.target.value)}
          >
            <option value="">👇 검색된 시험 중 하나를 선택하세요</option>
            {filteredExams.map(e => <option key={e.id} value={e.id}>{e.id.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {/* Step 2: 반 및 학생 선택 */}
      <div className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-opacity ${!selectedExamId ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4 border-b pb-2">
          <Users className="text-indigo-600" size={20} /> 2단계: 대상 반 및 학생 선택
        </h2>
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">담당 반 선택</label>
          <select 
            className="w-full border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500" 
            value={selectedClassId} 
            onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentIds([]); }}
          >
            <option value="">반을 선택하세요</option>
            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedClassId && (
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">학생 목록 (체크박스 선택)</label>
            {classStudents.length === 0 ? (
              <p className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-lg">해당 반에 소속된 학생 정보가 없습니다. (사용자 관리에서 반을 매핑해주세요)</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {classStudents.map(student => (
                  <button 
                    key={student.id}
                    onClick={() => toggleStudent(student.id)}
                    className={`px-4 py-2 border rounded-full font-bold text-sm transition-all flex items-center gap-2
                      ${selectedStudentIds.includes(student.id) ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                  >
                    {selectedStudentIds.includes(student.id) && <CheckCircle size={14} />} {student.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 3: 학생별 입력 섹션 */}
      {selectedStudentIds.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Target className="text-rose-500"/> 3단계: 오답 및 맞춤 코멘트 입력</h2>
            <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-sm font-black">{selectedStudentIds.length}명 선택됨</span>
          </div>

          {selectedStudentIds.map(sId => {
            const student = data.students.find(s => s.id === sId);
            const input = inputsByStudent[sId];
            if (!input) return null;

            return (
              <div key={sId} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 border-l-4 border-l-rose-500 flex flex-col gap-4">
                
                {/* 상단: 이름 및 점수 */}
                <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <span className="text-lg font-extrabold text-gray-900">{student?.name} 학생</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-500">최종 획득 점수:</span>
                    <input 
                      type="number" 
                      className="w-20 border border-gray-300 p-1.5 rounded-lg text-center font-black text-rose-600 text-lg outline-none focus:ring-2 focus:ring-rose-400 bg-white" 
                      value={input.score} 
                      onChange={e => handleInputChange(sId, 'score', e.target.value)}
                    />
                    <span className="text-gray-500 font-bold">점</span>
                  </div>
                </div>

                {/* 중단: 오답 체크보드 */}
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-2">🎯 오답 문항을 클릭하세요 (자동 점수 차감)</p>
                  <div className="flex flex-wrap gap-2">
                    {examQuestionsList.map(q => {
                      const isWrong = input.wrongQuestions.includes(q.number);
                      return (
                        <button 
                          key={q.number}
                          onClick={() => toggleWrongQuestion(sId, q.number)}
                          className={`w-10 h-10 rounded-xl font-black text-sm transition-all duration-200 
                            ${isWrong ? 'bg-rose-500 text-white shadow-lg scale-110 border-rose-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border-gray-200 border'}`}
                        >
                          {q.number}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 하단: 코멘트 및 플랜 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">선생님 1:1 학습 분석</label>
                    <textarea 
                      className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 text-sm" 
                      rows="3" placeholder="예: 서술형 답안 작성 시 조건 누락이 잦습니다..."
                      value={input.comment} onChange={e => handleInputChange(sId, 'comment', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-emerald-600 mb-1 uppercase">성장 플랜 (솔루션)</label>
                    <textarea 
                      className="w-full border border-emerald-200 p-3 rounded-xl bg-emerald-50 outline-none focus:ring-2 focus:ring-emerald-500 text-sm" 
                      rows="3" placeholder="예: 주말 클리닉 서술형 20제 추가 풀이 진행"
                      value={input.plan} onChange={e => handleInputChange(sId, 'plan', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <button 
            onClick={handleSubmitAll}
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-lg py-4 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:bg-blue-400 mt-6"
          >
            {isSubmitting ? '일괄 저장 중...' : <><Save size={24} /> {selectedStudentIds.length}명 학생 리포트 일괄 생성하기</>}
          </button>
        </div>
      )}
    </div>
  );
}