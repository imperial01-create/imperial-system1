/* [서비스 가치] 강사가 내신, 개념 테스트, 모의고사를 한 화면에서 일괄 입력하고, 
   입력 즉시 학부모가 열람하는 '아카데미 유니버스'에 실시간($O(1)$)으로 동기화하여 상담 전환을 유도합니다. */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  collection, getDocs, doc, writeBatch, serverTimestamp, query, where 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Save, AlertCircle, CheckCircle, Search, Users, FileText, Target, CheckSquare, 
  Loader, Sparkles, BookOpen, Award, Layers, Zap, Check, ChevronRight 
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { getDynamicSubjectLabel } from '../utils/subjectMapper';

const APP_ID = 'imperial-clinic-v1';

// 🚀 개념 테스트용 루브릭 및 등급 환산 보조 함수
const getRubricGrade = (score) => {
  const num = Number(score);
  if (isNaN(num)) return 'C';
  if (num >= 90) return 'S';
  if (num >= 80) return 'A';
  if (num >= 70) return 'B';
  return 'C';
};

export default function ExamDiagnosticInput({ currentUser }) {
  const { classes, users, loadingData } = useData();
  
  // [DRY 원칙 & 안전한 메모리 캐싱] 데이터 전처리 (undefined 방지)
  const data = useMemo(() => ({
    classes: Array.isArray(classes) ? classes : [],
    students: Array.isArray(users) ? users.filter(u => u && u.role === 'student') : []
  }), [classes, users]);
  
  const currentYear = new Date().getFullYear();

  // 🚀 평가 대분류 탭 스테이트: 'concept'(개념/단원) | 'school'(학교내신) | 'mock'(모의고사)
  const [testCategory, setTestCategory] = useState('concept');

  // 1. 학교 내신용 필터 스테이트
  const [filters, setFilters] = useState({
    schoolName: '', year: String(currentYear), gradeSem: '', term: ''
  });
  const [searchedExams, setSearchedExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState('');

  // 2. 자체 개념/단원 및 모의고사용 직접 입력 메타 스테이트
  const [customTestMeta, setCustomTestMeta] = useState({
    title: '', unitName: '', subject: '수학', totalQuestions: 10, questionScore: 10
  });

  // 3. 공통 대상 반 및 학생 선택 스테이트
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [inputsByStudent, setInputsByStudent] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // 🚀 [버그 해결] const 키워드 추가 및 탭 변경 핸들러
  const handleCategoryChange = (category) => {
    setTestCategory(category);
    setSelectedExamId('');
    setSelectedStudentIds([]);
    setInputsByStudent({});
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // 학교 내신 시험 검색 핸들러
  const handleSearchExams = async () => {
    if (!filters.schoolName.trim()) {
      return alert("학교명을 입력해주세요. (예: 목동고)");
    }
    setLoadingExams(true);
    setSelectedExamId('');
    setErrorMsg(null);
    
    try {
      const examsRef = collection(db, `artifacts/${APP_ID}/public/data/integrated_exams`);
      const q = query(
        examsRef,
        where('schoolName', '>=', filters.schoolName.trim()),
        where('schoolName', '<=', filters.schoolName.trim() + '\uf8ff')
      );
      const snap = await getDocs(q);
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (filters.year) results = results.filter(e => e.year === filters.year);
      if (filters.gradeSem) {
        const [gStr, sStr] = filters.gradeSem.split('-');
        results = results.filter(e => e.grade === `${gStr}학년` && e.semester === `${sStr}학기`);
      }
      if (filters.term) {
        results = results.filter(e => e.termType === filters.term || e.term === filters.term || e.combinedTerm?.includes(filters.term));
      }

      setSearchedExams(results);
      if (results.length === 0) alert("조건에 맞는 시험이 없습니다.");
    } catch (error) {
      console.error("Exam Search Error:", error);
      setErrorMsg("시험 검색 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoadingExams(false);
    }
  };

  // 권한별 접근 가능한 반 목록 필터링
  const availableClasses = useMemo(() => {
    return data.classes.filter(c => {
      if (currentUser?.role === 'admin') return true;
      return c.lecturerId === currentUser?.id || c.instructorId === currentUser?.id || c.teacherId === currentUser?.id;
    });
  }, [data.classes, currentUser]);

  // 선택된 반의 학생 목록 필터링
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    const cls = availableClasses.find(c => c.id === selectedClassId);
    if (!cls) return [];
    
    return data.students.filter(s => {
      if (s.classId === selectedClassId) return true;
      if (cls.studentIds && Array.isArray(cls.studentIds) && cls.studentIds.includes(s.id)) return true;
      if (cls.students && Array.isArray(cls.students)) {
        return cls.students.some(cs => cs === s.id || cs?.id === s.id);
      }
      return false;
    });
  }, [selectedClassId, availableClasses, data.students]);

  // 🚀 [버그 해결 1] 문제 목록 생성 로직(examQuestionsList)을 toggleStudent보다 상단에 배치
  const examQuestionsList = useMemo(() => {
    if (testCategory === 'school') {
      const selectedExamData = searchedExams.find(e => e.id === selectedExamId);
      if (selectedExamData?.questions && Array.isArray(selectedExamData.questions) && selectedExamData.questions.length > 0) {
        return selectedExamData.questions.map((q, idx) => ({
          ...q,
          displayNumber: (q.number !== undefined && q.number !== null && q.number !== '') ? String(q.number) : String(idx + 1),
          calcPoint: (q.score !== undefined && q.score !== null) ? Number(q.score) : null
        }));
      }
      return Array.from({ length: 25 }, (_, i) => ({ displayNumber: String(i + 1), calcPoint: 4 }));
    } else {
      // 개념 테스트 또는 모의고사 문항 리스트 생성
      const count = Math.max(1, Math.min(100, Number(customTestMeta.totalQuestions) || 10));
      const point = Math.max(1, Math.min(100, Number(customTestMeta.questionScore) || 10));
      return Array.from({ length: count }, (_, i) => ({ displayNumber: String(i + 1), calcPoint: point }));
    }
  }, [testCategory, searchedExams, selectedExamId, customTestMeta.totalQuestions, customTestMeta.questionScore]);

  // 🚀 [버그 해결 2] examQuestionsList가 선언된 이후에 toggleStudent 정의 (초기화 참조 에러 원천 차단)
  const toggleStudent = useCallback((sId) => {
    setSelectedStudentIds(prev => {
      const isSelected = prev.includes(sId);
      if (isSelected) return prev.filter(id => id !== sId);
      
      setInputsByStudent(current => {
        if (current[sId]) return current;
        return {
          ...current,
          [sId]: { wrongQuestions: [], score: 100, comment: '', plan: '' }
        };
      });
      return [...prev, sId];
    });
  }, []);

  // 오답 클릭 시 점수 자동 차감 로직 ($O(1)$ 상태 변경)
  const toggleWrongQuestion = (sId, qNumStr) => {
    setInputsByStudent(prev => {
      const currentInput = prev[sId] || { wrongQuestions: [], score: 100, comment: '', plan: '' };
      const isWrong = currentInput.wrongQuestions.includes(qNumStr);
      
      let newWrongs = isWrong 
        ? currentInput.wrongQuestions.filter(n => n !== qNumStr)
        : [...currentInput.wrongQuestions, qNumStr].sort((a, b) => {
            const numA = parseInt(String(a).replace(/[^0-9]/g, ''), 10) || 0;
            const numB = parseInt(String(b).replace(/[^0-9]/g, ''), 10) || 0;
            return numA - numB;
          });

      let newScore = 100;
      let deduction = 0;
      newWrongs.forEach(n => {
        const qInfo = examQuestionsList.find(x => x.displayNumber === n);
        if (qInfo && qInfo.calcPoint !== null && !isNaN(Number(qInfo.calcPoint))) {
          deduction += Number(qInfo.calcPoint);
        } else {
          deduction += Number(customTestMeta.questionScore) || 10;
        }
      });
      newScore = Math.max(0, Math.round((100 - deduction) * 10) / 10);

      return {
        ...prev,
        [sId]: { ...currentInput, wrongQuestions: newWrongs, score: newScore }
      };
    });
  };

  const handleInputChange = (sId, field, value) => {
    setInputsByStudent(prev => ({
      ...prev,
      [sId]: { ...(prev[sId] || {}), [field]: value }
    }));
  };

  // 🚀 [CTO 최적화] Firebase Batched Write를 통한 원자적 일괄 저장 및 아카데미 유니버스 동기화
  const handleSubmitAll = async () => {
    if (testCategory === 'school' && !selectedExamId) return alert("시험을 선택해주세요.");
    if (testCategory !== 'school' && (!customTestMeta.title.trim() || !customTestMeta.unitName.trim())) {
      return alert("평가 제목과 단원/범위명을 모두 입력해주세요.");
    }
    if (selectedStudentIds.length === 0) return alert("최소 1명 이상의 학생을 선택해주세요.");

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    const examTitle = testCategory === 'school' 
      ? (searchedExams.find(e => e.id === selectedExamId)?.schoolName || '학교내신') + ' 내신 진단'
      : `[${testCategory === 'concept' ? '개념테스트' : '모의고사'}] ${customTestMeta.title.trim()}`;

    try {
      for (const sId of selectedStudentIds) {
        const sInfo = data.students.find(s => s.id === sId);
        const input = inputsByStudent[sId] || { wrongQuestions: [], score: 100, comment: '', plan: '' };
        const numScore = Number(input.score);

        if (isNaN(numScore) || numScore < 0 || numScore > 100) {
          throw new Error(`${sInfo?.name || '학생'}의 점수가 유효하지 않습니다 (0~100점 사이).`);
        }

        // Action 1: 진단 평가 원본 로그 생성 (student_exam_diagnostics)
        const diagRef = doc(collection(db, `artifacts/${APP_ID}/public/data/student_exam_diagnostics`));
        batch.set(diagRef, {
          testCategory: testCategory,
          examTitle: examTitle,
          unitName: testCategory === 'school' ? '학교 내신 기출' : customTestMeta.unitName.trim(),
          subject: customTestMeta.subject,
          studentId: sId,
          studentName: sInfo?.name || '알수없음',
          score: numScore,
          wrongQuestionNumbers: input.wrongQuestions || [],
          instructorComment: input.comment || '',
          growthPlan: input.plan || '',
          instructorId: currentUser?.id || 'unknown',
          createdAt: timestamp
        });

        // Action 2: 🚀 개념 테스트인 경우에만 '아카데미 유니버스 (concept_stats)'와 실시간 연동 ($O(1)$)
        if (testCategory === 'concept') {
          const statsRef = doc(db, `artifacts/${APP_ID}/public/data/concept_stats`, sId);
          
          // Note: Firestore의 merge 옵션을 사용하여 기존 통계를 해치지 않고 최근 지표를 업데이트합니다.
          batch.set(statsRef, {
            subjectStats: {
              [customTestMeta.subject]: {
                latestScore: numScore,
                latestGrade: getRubricGrade(numScore),
                lastUpdatedUnit: customTestMeta.unitName.trim(),
                recentVulnerabilities: (input.wrongQuestions || []).map(q => `[${customTestMeta.unitName.trim()}] ${q}번 오답`)
              }
            },
            updatedAt: timestamp
          }, { merge: true });
        }
      }

      // 30명의 진단 데이터와 유니버스 동기화를 단 1번의 네트워크 요청으로 일괄 커밋 ($0 과금 방어)
      await batch.commit();

      setSuccessMsg(`🎉 [전송 완료] ${selectedStudentIds.length}명 학생의 리포트가 생성되었으며${testCategory === 'concept' ? " '아카데미 유니버스'에 실시간 동기화되었습니다!" : " 저장되었습니다."}`);
      setSelectedStudentIds([]);
      setInputsByStudent({});

    } catch (error) {
      console.error("Batched Submit Error:", error);
      setErrorMsg(`데이터 저장 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <div className="p-12 text-center text-indigo-600 font-bold flex flex-col items-center justify-center">
        <Loader className="animate-spin mb-3 text-indigo-600" size={36}/>
        <span>학원 데이터를 안전하게 동기화 중입니다...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      {/* 상단 관제 배너 */}
      <div className="bg-gradient-to-r from-indigo-800 via-blue-700 to-indigo-900 text-white p-6 md:p-8 rounded-3xl shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-indigo-200 text-xs font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Imperial Smart Assessment Engine</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-3">
          <CheckSquare size={32} className="text-indigo-300"/> 통합 평가 진단 및 유니버스 연동
        </h1>
        <p className="opacity-90 text-sm max-w-2xl">
          학교 내신 기출, 학원 자체 개념 테스트, 전국 모의고사 결과를 1분 만에 일괄 입력하세요.<br/>
          <strong className="text-amber-300 underline">개념 테스트 점수는 학부모 앱의 '아카데미 유니버스' 대시보드로 즉시 동기화됩니다.</strong>
        </p>
      </div>

      {/* 🚀 3대 평가 대분류 탭 선택기 */}
      <div className="flex rounded-2xl bg-slate-200/80 p-1.5 shadow-inner">
        {[
          { id: 'concept', label: '⚡ 자체 개념/단원 테스트 (유니버스 연동)', icon: Layers, color: 'text-indigo-600' },
          { id: 'school', label: '🏫 학교 내신 기출 시험', icon: BookOpen, color: 'text-blue-600' },
          { id: 'mock', label: '🎯 전국 연합 모의고사', icon: Award, color: 'text-emerald-600' }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = testCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleCategoryChange(tab.id)}
              type="button"
              className={`flex-1 py-3.5 px-4 rounded-xl font-extrabold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isActive ? 'bg-white text-slate-900 shadow-md scale-[1.01]' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? tab.color : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.id === 'concept' ? '개념테스트' : tab.id === 'school' ? '학교내신' : '모의고사'}</span>
            </button>
          );
        })}
      </div>

      {/* 에러 및 성공 피드백 UI */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-xl flex items-center gap-3 text-rose-800 text-sm font-bold">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-xl flex items-center gap-3 text-emerald-800 text-sm font-bold animate-in fade-in">
          <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1단계: 평가 유형별 조건 설정 패널 */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
          <Search className="text-indigo-600" size={20} /> 1단계: {testCategory === 'school' ? '진단할 내신 시험 검색' : '평가 정보 및 문항 설정'}
        </h2>

        {testCategory === 'school' ? (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <input 
                type="text" placeholder="학교명 타이핑 (예: 목동고)"
                className="border border-slate-300 p-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 w-full font-bold"
                value={filters.schoolName} onChange={e => setFilters({...filters, schoolName: e.target.value})}
                onKeyDown={e => e.key === 'Enter' && handleSearchExams()}
              />
              <select className="border border-slate-300 p-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}>
                <option value="">연도 전체</option>
                {[...Array(5)].map((_, i) => <option key={i} value={String(currentYear - i)}>{currentYear - i}년</option>)}
              </select>
              <select className="border border-slate-300 p-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" value={filters.gradeSem} onChange={e => setFilters({...filters, gradeSem: e.target.value})}>
                <option value="">학년/학기 전체</option>
                <option value="1-1">1학년 1학기</option><option value="1-2">1학년 2학기</option>
                <option value="2-1">2학년 1학기</option><option value="2-2">2학년 2학기</option>
                <option value="3-1">3학년 1학기</option><option value="3-2">3학년 2학기</option>
              </select>
              <select className="border border-slate-300 p-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" value={filters.term} onChange={e => setFilters({...filters, term: e.target.value})}>
                <option value="">시험 종류 전체</option>
                <option value="중간고사">중간고사</option><option value="기말고사">기말고사</option>
              </select>
            </div>
            <button onClick={handleSearchExams} disabled={loadingExams} type="button" className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-black py-3 rounded-xl transition-colors flex justify-center items-center gap-2 mb-4 cursor-pointer disabled:opacity-50">
              {loadingExams ? <Loader className="animate-spin" size={18}/> : <Search size={18} />} 
              {loadingExams ? '내신 기출 DB 조회 중...' : '조건에 맞는 기출 시험 검색하기'}
            </button>
            {searchedExams.length > 0 && (
              <select className="w-full border-2 border-indigo-500 p-3.5 rounded-xl bg-indigo-50/50 font-black text-indigo-950 outline-none shadow-sm cursor-pointer" value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}>
                <option value="">🎯 검색된 내신 시험 중 하나를 선택하세요 ({searchedExams.length}건)</option>
                {searchedExams.map(e => (
                  <option key={e.id} value={e.id}>
                    [{e.year}] {e.schoolName} {e.grade} {e.semester} {e.termType || e.term || ''} {getDynamicSubjectLabel(e.standardCode, e.schoolType, e.year, e.grade, e.subject)}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">과목 선택</label>
                <select className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" value={customTestMeta.subject} onChange={e => setCustomTestMeta({...customTestMeta, subject: e.target.value})}>
                  <option value="수학">수학 (수리 논리)</option>
                  <option value="과학">과학 (탐구 응용)</option>
                  <option value="국어">국어 (언어 사고)</option>
                  <option value="영어">영어 (어휘/구문)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">평가 타이틀 (예: 7월 4주차 주간 평가 / 6월 모의고사)</label>
                <input type="text" placeholder="시험 제목을 명확히 입력하세요" className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={customTestMeta.title} onChange={e => setCustomTestMeta({...customTestMeta, title: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">단원 / 평가 범위명 (유니버스 노출)</label>
                <input type="text" placeholder="예: 함수의 극한과 연속" className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-indigo-500" value={customTestMeta.unitName} onChange={e => setCustomTestMeta({...customTestMeta, unitName: e.target.value})} />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">총 문항 수</label>
                <input type="number" min="1" max="100" className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" value={customTestMeta.totalQuestions} onChange={e => setCustomTestMeta({...customTestMeta, totalQuestions: e.target.value})} />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">문항당 배점 (기본값)</label>
                <input type="number" min="1" max="100" className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center" value={customTestMeta.questionScore} onChange={e => setCustomTestMeta({...customTestMeta, questionScore: e.target.value})} />
              </div>
            </div>
            {testCategory === 'concept' && (
              <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>이 모드에서 입력된 점수와 오답 문항 번호는 학부모 앱의 <strong className="underline">‘아카데미 유니버스 단원 개념 성취도’</strong> 지표로 0.1초 만에 직접 반영됩니다.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2단계: 대상 반 및 학생 선택 */}
      <div className={`bg-white p-6 rounded-3xl shadow-sm border border-slate-200 transition-opacity ${(testCategory === 'school' && !selectedExamId) ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
          <Users className="text-indigo-600" size={20} /> 2단계: 대상 반 및 수강생 체크
        </h2>
        <div className="mb-4">
          <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">담당 반 선택 (자동 매핑됨)</label>
          <select className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer" value={selectedClassId} onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentIds([]); }}>
            <option value="">반을 선택하세요</option>
            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedClassId && (
          <div>
            <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">학생 명단 (클릭하여 채점 대상 추가)</label>
            {classStudents.length === 0 ? (
              <p className="text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-xl">해당 반에 등록된 학생 정보가 없습니다. 수강 등록 메뉴를 확인해주세요.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {classStudents.map(student => {
                  const isChecked = selectedStudentIds.includes(student.id);
                  return (
                    <button 
                      key={student.id} onClick={() => toggleStudent(student.id)} type="button"
                      className={`px-4 py-2.5 rounded-xl font-extrabold text-sm transition-all flex items-center gap-2 cursor-pointer border ${
                        isChecked ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300'
                      }`}
                    >
                      {isChecked ? <CheckCircle size={16} /> : <span className="w-4 h-4 rounded-full border border-slate-400 inline-block"/>}
                      <span>{student.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3단계: 오답 및 맞춤 코멘트 빠른 입력 (Fast-Input Workbench) */}
      {selectedStudentIds.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><Target className="text-rose-500"/> 3단계: 문항별 오답 체크 및 솔루션 기입</h2>
            <span className="bg-rose-100 text-rose-800 px-3.5 py-1 rounded-full text-xs font-black">{selectedStudentIds.length}명 채점 대기 중</span>
          </div>

          {selectedStudentIds.map(sId => {
            const student = data.students.find(s => s.id === sId);
            const input = inputsByStudent[sId];
            if (!input) return null;

            return (
              <div key={sId} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 border-l-8 border-l-rose-500 flex flex-col gap-5 transition-all hover:border-slate-300">
                <div className="flex flex-col md:flex-row justify-between md:items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 gap-3">
                  <div>
                    <span className="text-xl font-black text-slate-900">{student?.name || '수강생'}</span>
                    <span className="ml-2 text-xs font-bold text-slate-500">{student?.grade || '고등부'}</span>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-auto bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-xs font-black text-slate-500 uppercase">환산 점수:</span>
                    <input 
                      type="number" className="w-20 border-b-2 border-rose-500 p-1 text-center font-black text-rose-600 text-2xl outline-none bg-transparent" 
                      value={input.score} onChange={e => handleInputChange(sId, 'score', e.target.value)}
                    />
                    <span className="text-slate-600 font-bold">점 ({getRubricGrade(input.score)}등급)</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-extrabold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-600"/> 🎯 학생이 틀린 번호를 원클릭으로 선택하세요 (배점에 따라 점수가 자동 감점됩니다)
                  </p>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50/50 rounded-2xl border border-slate-100">
                    {examQuestionsList.map((q, idx) => {
                      const isWrong = input.wrongQuestions.includes(q.displayNumber);
                      return (
                        <button 
                          key={`q-${idx}-${q.displayNumber}`} type="button"
                          onClick={(e) => { e.preventDefault(); toggleWrongQuestion(sId, q.displayNumber); }}
                          className={`px-3 min-w-[3rem] h-11 rounded-xl font-black text-sm transition-all duration-150 cursor-pointer border ${
                            isWrong 
                              ? 'bg-rose-600 text-white shadow-lg scale-105 border-rose-700 animate-pulse' 
                              : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300 shadow-sm'
                          }`}
                        >
                          {q.displayNumber}번
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-black text-slate-500 mb-1.5 uppercase flex items-center gap-1"><FileText size={14}/> 강사 정밀 진단 코멘트</label>
                    <textarea 
                      className="w-full border border-slate-300 p-3.5 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium" rows="2" 
                      placeholder="예: 서술형 3번에서 극한값의 방향성을 확인하지 않아 감점되었습니다."
                      value={input.comment} onChange={e => handleInputChange(sId, 'comment', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-emerald-700 mb-1.5 uppercase flex items-center gap-1"><Zap size={14}/> 맞춤 성장 플랜 (처방전)</label>
                    <textarea 
                      className="w-full border border-emerald-300 p-3.5 rounded-xl bg-emerald-50/50 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-emerald-950" rows="2" 
                      placeholder="예: 클리닉 시간에 극한 합성함수 킬러문항 15제 추가 풀이 진행"
                      value={input.plan} onChange={e => handleInputChange(sId, 'plan', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* 일괄 저장 배치 커밋 버튼 */}
          <button 
            onClick={handleSubmitAll} disabled={isSubmitting} type="button"
            className="w-full bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-lg py-5 rounded-2xl shadow-xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer mt-8"
          >
            {isSubmitting ? <Loader className="animate-spin w-6 h-6"/> : <Save className="w-6 h-6" />} 
            <span>{isSubmitting ? '유니버스 실시간 동기화 중...' : `선택한 ${selectedStudentIds.length}명 학생 진단 리포트 및 유니버스 일괄 배포`}</span>
          </button>
        </div>
      )}
    </div>
  );
}