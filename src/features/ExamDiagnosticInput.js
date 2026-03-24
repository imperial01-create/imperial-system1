import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, AlertCircle, CheckCircle, Search, Users, FileText, Target, CheckSquare, Loader } from 'lucide-react';

/**
 * [서비스 가치(Service Value)] 
 * 1. 데이터 비용 최적화: 수천 개의 시험을 한 번에 불러오지 않고, 학교명 기반으로 필요한 데이터만 
 * 스마트하게 쿼리(Lazy Fetch)하여 Firebase 읽기 비용(과금)을 극한으로 방어합니다.
 * 2. 강사 업무 효율화: '강의 관리'와 데이터 스키마를 완벽히 연동하여, 강사가 로그인 시 
 * 본인의 반을 즉시 확인하고 수십 명의 학생 성적을 원클릭으로 일괄 저장할 수 있습니다.
 */
export default function ExamDiagnosticInput({ currentUser }) {
  // 기본 마스터 데이터 (반, 학생)
  const [data, setData] = useState({ classes: [], students: [] });
  const [loadingInitial, setLoadingInitial] = useState(true);
  
  // 시험 검색 관련 상태
  const currentYear = new Date().getFullYear();
  const [filters, setFilters] = useState({
    schoolName: '',
    year: String(currentYear),
    gradeSem: '', // '1-1', '2-2' 등
    term: ''      // '중간고사', '기말고사'
  });
  const [searchedExams, setSearchedExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState('');

  // 반 및 학생 선택 관련 상태
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [inputsByStudent, setInputsByStudent] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. 초기 마스터 데이터 불러오기 (반, 학생 데이터만 로드 - 시험은 검색 시 로드)
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const classSnap = await getDocs(collection(db, 'artifacts/imperial-clinic-v1/public/data/classes'));
        const classesData = classSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        let studentsData = [];
        try {
          const uSnap = await getDocs(query(collection(db, 'artifacts/imperial-clinic-v1/public/data/users'), where('role', '==', 'student')));
          studentsData = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
          const uSnap = await getDocs(collection(db, 'artifacts/imperial-clinic-v1/public/data/users'));
          studentsData = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role === 'student');
        }

        setData({ classes: classesData, students: studentsData });
      } catch (error) {
        console.error("데이터 로딩 에러:", error);
      } finally {
        setLoadingInitial(false);
      }
    };
    fetchInitialData();
  }, []);

  // 2. [비용 최적화] 조건에 맞는 시험만 검색하여 불러오기
  const handleSearchExams = async () => {
    if (!filters.schoolName.trim()) {
      return alert("학교명을 입력해주세요. (예: 목동고, 목동 등 일부 입력 가능)");
    }

    setLoadingExams(true);
    setSelectedExamId('');
    
    try {
      const examsRef = collection(db, 'artifacts/imperial-clinic-v1/public/data/integrated_exams');
      
      // 파이어베이스 최적화: 입력된 학교명으로 시작하는 데이터만 검색 (Prefix Search)
      const q = query(
        examsRef,
        where('schoolName', '>=', filters.schoolName.trim()),
        where('schoolName', '<=', filters.schoolName.trim() + '\uf8ff')
      );
      
      const snap = await getDocs(q);
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 드롭다운 필터를 로컬에서 적용하여 속도 극대화 (N+1 방지)
      if (filters.year) {
        results = results.filter(e => e.year === filters.year);
      }
      if (filters.gradeSem) {
        const [gStr, sStr] = filters.gradeSem.split('-'); // 예: "1-1" -> "1", "1"
        const targetGrade = `${gStr}학년`;
        const targetSem = `${sStr}학기`;
        results = results.filter(e => e.grade === targetGrade && e.semester === targetSem);
      }
      if (filters.term) {
        results = results.filter(e => e.termType === filters.term || e.term === filters.term || e.combinedTerm?.includes(filters.term));
      }

      setSearchedExams(results);
      if (results.length === 0) {
        alert("조건에 맞는 시험이 없습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("시험 검색 중 오류가 발생했습니다.");
    } finally {
      setLoadingExams(false);
    }
  };

  // 3. [오류 수정 완료] 강사 권한에 따른 담당 반 매핑 로직 수정
  const availableClasses = data.classes.filter(c => {
    if (currentUser?.role === 'admin') return true;
    // lecturerId (강의 관리와 연동되는 키값) 매핑 추가 완비
    return c.lecturerId === currentUser?.id || c.instructorId === currentUser?.id || c.teacherId === currentUser?.id || c.teacherName === currentUser?.name;
  });

  // 선택된 반에 소속된 학생 필터링
  const classStudents = data.students.filter(s => {
    if (!selectedClassId) return false;
    const cls = availableClasses.find(c => c.id === selectedClassId);
    if (!cls) return false;
    
    if (s.classId === selectedClassId) return true;
    if (cls.studentIds && cls.studentIds.includes(s.id)) return true;
    if (cls.students && Array.isArray(cls.students)) {
      return cls.students.some(cs => cs === s.id || cs.id === s.id);
    }
    return false;
  });

  const toggleStudent = (sId) => {
    setSelectedStudentIds(prev => {
      const isSelected = prev.includes(sId);
      if (isSelected) return prev.filter(id => id !== sId);
      
      setInputsByStudent(current => ({
        ...current,
        [sId]: current[sId] || { wrongQuestions: [], score: 100, comment: '', plan: '' }
      }));
      return [...prev, sId];
    });
  };

  const selectedExamData = searchedExams.find(e => e.id === selectedExamId);
  const examQuestionsList = selectedExamData?.questions && selectedExamData.questions.length > 0 
    ? selectedExamData.questions 
    : Array.from({ length: 30 }, (_, i) => ({ number: i + 1, point: null }));

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

  const handleInputChange = (sId, field, value) => {
    setInputsByStudent(prev => ({
      ...prev,
      [sId]: { ...prev[sId], [field]: value }
    }));
  };

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
      
      setSelectedStudentIds([]);
      setInputsByStudent({});
    } catch (error) {
      alert("저장 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingInitial) return <div className="p-10 text-center text-gray-500 font-bold animate-pulse">데이터를 불러오는 중입니다...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white p-6 rounded-2xl shadow-md">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><CheckSquare size={28}/> 스마트 시험 진단 일괄 입력</h1>
        <p className="opacity-90 text-sm">조건 검색을 통해 시험을 찾고, 반 전체 학생의 점수와 리포트를 일괄 생성하세요.</p>
      </div>

      {/* Step 1: 조건부 시험 검색 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4 border-b pb-2">
          <Search className="text-blue-600" size={20} /> 1단계: 진단할 시험 검색 및 선택
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <input 
            type="text" 
            placeholder="학교명 타이핑 (예: 목동고)"
            className="border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 w-full font-semibold"
            value={filters.schoolName}
            onChange={e => setFilters({...filters, schoolName: e.target.value})}
            onKeyDown={e => e.key === 'Enter' && handleSearchExams()}
          />
          <select 
            className="border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 w-full"
            value={filters.year}
            onChange={e => setFilters({...filters, year: e.target.value})}
          >
            <option value="">연도 전체</option>
            {[...Array(5)].map((_, i) => <option key={i} value={String(currentYear - i)}>{currentYear - i}년</option>)}
          </select>
          <select 
            className="border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 w-full"
            value={filters.gradeSem}
            onChange={e => setFilters({...filters, gradeSem: e.target.value})}
          >
            <option value="">학년/학기 전체</option>
            <option value="1-1">1학년 1학기</option>
            <option value="1-2">1학년 2학기</option>
            <option value="2-1">2학년 1학기</option>
            <option value="2-2">2학년 2학기</option>
            <option value="3-1">3학년 1학기</option>
            <option value="3-2">3학년 2학기</option>
          </select>
          <select 
            className="border border-gray-300 p-2.5 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 w-full"
            value={filters.term}
            onChange={e => setFilters({...filters, term: e.target.value})}
          >
            <option value="">시험 종류 전체</option>
            <option value="중간고사">중간고사</option>
            <option value="기말고사">기말고사</option>
          </select>
        </div>

        <button 
          onClick={handleSearchExams} 
          disabled={loadingExams}
          className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 mb-4 disabled:opacity-50"
        >
          {loadingExams ? <Loader className="animate-spin" size={18}/> : <Search size={18} />} 
          {loadingExams ? '검색 중...' : '조건에 맞는 시험 검색하기'}
        </button>

        {searchedExams.length > 0 && (
          <div className="animate-in slide-in-from-top-2">
            <select 
              className="w-full border border-indigo-300 p-3 rounded-xl bg-indigo-50 font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" 
              value={selectedExamId} 
              onChange={e => setSelectedExamId(e.target.value)}
            >
              <option value="">🎯 검색된 시험 중 하나를 선택하세요 ({searchedExams.length}건)</option>
              {searchedExams.map(e => <option key={e.id} value={e.id}>{e.id.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Step 2: 반 및 학생 선택 */}
      <div className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-opacity ${!selectedExamId ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4 border-b pb-2">
          <Users className="text-indigo-600" size={20} /> 2단계: 대상 반 및 학생 선택
        </h2>
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">담당 반 선택 (자동 연동됨)</label>
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
              <p className="text-red-500 text-sm font-bold bg-red-50 p-3 rounded-lg">해당 반에 소속된 학생 정보가 없습니다. (사용자 관리 또는 강의 관리에서 반을 매핑해주세요)</p>
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
                
                <div className="flex flex-col md:flex-row justify-between md:items-center bg-gray-50 p-3 rounded-xl border border-gray-100 gap-3">
                  <span className="text-lg font-extrabold text-gray-900">{student?.name} 학생</span>
                  <div className="flex items-center gap-2 self-end md:self-auto">
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
            {isSubmitting ? <Loader className="animate-spin" size={24}/> : <Save size={24} />} 
            {isSubmitting ? '일괄 저장 중...' : `${selectedStudentIds.length}명 학생 리포트 일괄 생성하기`}
          </button>
        </div>
      )}
    </div>
  );
}