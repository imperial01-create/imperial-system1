/* [서비스 가치] 강사가 내신, 개념 테스트, 모의고사를 한 화면에서 일괄 입력하고, 
   입력 즉시 학부모가 열람하는 '아카데미 유니버스'에 실시간($O(1)$)으로 동기화하여 상담 전환을 유도합니다. */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, getDocs, getDoc, doc, writeBatch, serverTimestamp, query, where
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Save, AlertCircle, CheckCircle, Search, Users, FileText, Target, CheckSquare,
  Loader, Sparkles, BookOpen, Award, Layers, Zap, Check, ChevronRight
} from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { getDynamicSubjectLabel } from '../utils/subjectMapper';
import { fetchBySchool } from '../utils/schoolQuery';
import SmartSchoolSelect from '../components/SmartSchoolSelect';
import { useSeasonAutoSelect } from '../hooks/useSeasonAutoSelect';
import { APP_ID } from '../constants';

/* 기출 아카이브(ExamArchive.js:28)와 같은 범위를 씁니다.
   예전에는 최근 5년만 고를 수 있어서 그 이전 기출을 아예 찾을 수 없었습니다. */
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2000 + 1 }, (_, i) => String(CURRENT_YEAR - i));

const SCHOOL_TYPE_LABEL = { high: '고등학교', middle: '중학교', elementary: '초등학교' };


/* 개념 테스트용 루브릭. 점수가 원점수(만점이 100 이 아닐 수 있음)이므로
   백분율로 환산한 뒤 판정합니다. */
const getRubricGrade = (score, maxScore) => {
  const num = Number(score);
  const max = Number(maxScore);
  if (!Number.isFinite(num) || !Number.isFinite(max) || max <= 0) return '-';
  const percent = (num / max) * 100;
  if (percent >= 90) return 'S';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B';
  return 'C';
};

export default function ExamDiagnosticInput({ currentUser }) {
  const { classes, users, enrollments, masterData, loadingData } = useData();

  // [DRY 원칙 & 안전한 메모리 캐싱] 데이터 전처리 (undefined 방지)
  const data = useMemo(() => ({
    classes: Array.isArray(classes) ? classes : [],
    students: Array.isArray(users) ? users.filter(u => u && u.role === 'student') : []
  }), [classes, users]);
  
  // 🚀 평가 대분류 탭 스테이트: 'concept'(개념/단원) | 'school'(학교내신) | 'mock'(모의고사)
  const [testCategory, setTestCategory] = useState('concept');

  /* 1. 학교 내신용 필터.
     연도 기본값을 '전체'로 둡니다. 예전에는 올해로 고정돼 있어서
     지난 기출을 찾으려면 매번 연도를 먼저 바꿔야 했습니다. */
  const [filters, setFilters] = useState({
    schoolType: 'high', schoolName: '', year: '', gradeSem: '', term: ''
  });

  // 학교 마스터 목록. 다른 화면과 같은 드롭다운(SmartSchoolSelect)을 쓰기 위해 필요합니다.
  const [schoolsData, setSchoolsData] = useState({ elementary: [], middle: [], high: [], favorites: [] });
  useEffect(() => {
    getDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schools'))
      .then(snap => { if (snap.exists()) setSchoolsData(snap.data()); })
      .catch(e => console.error('학교 목록 로드 실패', e));
  }, []);
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

  /* 탭이나 반을 바꾸면 입력 중이던 채점 결과가 지워집니다.
     예전에는 확인 없이 지워져서, 잘못 누르면 30명분이 한 번에 사라졌습니다. */
  const confirmDiscardInputs = (action) => {
    const typed = Object.values(inputsByStudent).filter(
      v => (v?.wrongQuestions?.length || 0) > 0 || v?.comment || v?.plan || v?.manualScore
    ).length;
    if (typed === 0) return true;
    return window.confirm(`입력 중인 ${typed}명의 채점 내용이 지워집니다. ${action}하시겠습니까?`);
  };

  const handleCategoryChange = (category) => {
    if (category === testCategory) return;
    if (!confirmDiscardInputs('평가 유형을 변경')) return;

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
      /* \uc608\uc804\uc5d0\ub294 \uc811\ub450\uc0ac \ubc94\uc704 \uac80\uc0c9\uc774\ub77c '\uc601\uc77c\uace0'\ub85c\ub294 '\uc11c\uc6b8\uc601\uc77c\uace0\ub4f1\ud559\uad50'\ub97c \ubabb \ucc3e\uace0,
         \uc774\ub984 \uc911\uac04\uc5d0 \uacf5\ubc31\uc774 \uc788\uc73c\uba74 \ub193\ucce4\uc2b5\ub2c8\ub2e4. \ub2e4\ub978 \ud654\uba74\uacfc \uac19\uc740 \uaddc\uce59\uc73c\ub85c \ud1b5\uc77c\ud569\ub2c8\ub2e4. */
      const examsRef = collection(db, `artifacts/${APP_ID}/public/data/integrated_exams`);
      // schoolsData 를 넘기면 정본 표기까지 후보에 넣어 표기가 달라도 찾습니다.
      let results = await fetchBySchool(examsRef, filters.schoolName, { schoolsData });

      /* 초·중·고 구분. 옛 자료는 schoolType 이 비어 있는데, 그것까지 걸러내면
         찾을 수 있던 시험이 사라집니다. 값이 있는 자료에만 적용합니다. */
      const typeKor = SCHOOL_TYPE_LABEL[filters.schoolType];
      if (typeKor) results = results.filter(e => !e.schoolType || e.schoolType === typeKor);

      if (filters.year) results = results.filter(e => String(e.year) === String(filters.year));
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

  /* 시즌. 반은 시즌마다 새로 만들어지므로, 지난 시즌 반까지 모두 보이면
     같은 이름의 반이 여러 개 나열되어 잘못 고르기 쉽습니다.
     강의 관리(LectureManager.js:602)와 같은 규칙을 씁니다. */
  const dynamicSeasons = useMemo(() => {
    const custom = [...(masterData?.seasons || [])]
      .sort((a, b) => String(a?.startDate || '').localeCompare(String(b?.startDate || '')));
    return [
      { id: 'all', name: '전체 시즌' },
      { id: 'legacy', name: '📦 시즌 미지정 (과거 데이터)' },
      ...custom
    ];
  }, [masterData]);

  const { selectedSeasonId: selectedSeason, setSelectedSeasonId: setSelectedSeason } =
    useSeasonAutoSelect(masterData?.seasons, loadingData, 'all');

  // 권한별 접근 가능한 반 목록
  const availableClasses = useMemo(() => {
    return data.classes.filter(c => {
      if (selectedSeason === 'legacy') { if (c.season) return false; }
      else if (selectedSeason !== 'all' && c.season !== selectedSeason) return false;

      // 아직 승인 전이거나 반려된 반은 채점 대상이 아닙니다.
      if (c.status === 'proposed' || c.status === 'rejected') return false;

      /* 강사는 자기 반만, 나머지 교직원(원장·데스크·조교)은 전부 봅니다.
         조교는 담당 반 정보가 따로 없어 반을 특정할 수 없습니다. */
      if (currentUser?.role === 'lecturer') {
        return c.lecturerId === currentUser?.id || c.instructorId === currentUser?.id || c.teacherId === currentUser?.id;
      }
      return true;
    });
  }, [data.classes, currentUser, selectedSeason]);

  // 시즌을 바꿔 목록에서 사라진 반이 선택된 채로 남지 않게 합니다.
  useEffect(() => {
    if (selectedClassId && !availableClasses.some(c => c.id === selectedClassId)) {
      setSelectedClassId('');
      setSelectedStudentIds([]);
    }
  }, [availableClasses, selectedClassId]);

  /* 선택된 반의 학생 목록.

     수강 등록은 enrollments 컬렉션에 있습니다(UserManager.js:358 이 여기에 씁니다).
     users 문서의 classId 나 classes 문서의 studentIds 에 쓰는 코드는 저장소에 없습니다.
     예전에는 그 두 곳을 뒤졌기 때문에 명단이 항상 비어 있었습니다.
     LectureManager.js:184 · AttendanceManager.js:222 와 같은 기준으로 맞춥니다. */
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];

    const enrolledIds = new Set(
      (Array.isArray(enrollments) ? enrollments : [])
        .filter(e => e?.classId === selectedClassId && e?.status === 'active')
        .map(e => e.studentId)
    );
    if (enrolledIds.size === 0) return [];

    return data.students.filter(s => enrolledIds.has(s.id));
  }, [selectedClassId, data.students, enrollments]);

  /* 문항 목록. 각 문항이 자기 배점(points)을 가집니다.

     예전에는 점수를 항상 100 에서 깎았습니다. 만점이 100 이 아닌 시험
     (예: 20문항 × 4점 = 80점)은 전부 오채점됐습니다.
     이제 만점은 배점의 합계이고, 점수는 원점수입니다. */
  const examQuestions = useMemo(() => {
    // 시험 자체에 배점이 없을 때 쓰는 기본 배점. 두 탭 모두 화면에서 고칠 수 있습니다.
    const fallbackPoint = Math.max(1, Math.min(100, Number(customTestMeta.questionScore) || 10));

    if (testCategory === 'school') {
      const exam = searchedExams.find(e => e.id === selectedExamId);
      const questions = Array.isArray(exam?.questions) ? exam.questions : [];
      if (questions.length > 0) {
        return questions.map((q, idx) => {
          /* 내신연구소는 배점을 선택 입력으로 두어 빈 문자열이 들어옵니다(SchoolStrategy.js:1254).
             Number('') 은 0 이라 예전 검사(!== null)를 통과해 감점이 0 이 됐고,
             오답을 아무리 눌러도 100 점으로 저장됐습니다.

             '비어 있음'과 '0점'은 다릅니다. 전원 정답 처리된 문항은 배점이 진짜 0 이므로,
             숫자로 바꾸기 전에 빈 값인지를 먼저 봅니다. */
          const isBlank = q.score === undefined || q.score === null || String(q.score).trim() === '';
          const raw = Number(q.score);
          const hasPoint = !isBlank && Number.isFinite(raw) && raw >= 0;
          // 문항 번호 필드는 화면마다 number / qNum 두 이름을 씁니다.
          const label = [q.number, q.qNum].find(v => v !== undefined && v !== null && v !== '');
          return {
            /* 화면 번호가 아니라 순번으로 문항을 구별합니다.
               번호가 겹치는 자료(오타이거나, 번호 없는 문항이 idx+1 로 채워져 충돌)에서
               한 문항을 누르면 같은 번호의 다른 문항까지 함께 깎이기 때문입니다. */
            key: String(idx),
            displayNumber: label !== undefined ? String(label) : String(idx + 1),
            points: hasPoint ? raw : fallbackPoint,
            pointFromExam: hasPoint
          };
        });
      }
    }

    const count = Math.max(1, Math.min(100, Number(customTestMeta.totalQuestions) || 10));
    return Array.from({ length: count }, (_, i) => ({
      key: String(i), displayNumber: String(i + 1), points: fallbackPoint, pointFromExam: false
    }));
  }, [testCategory, searchedExams, selectedExamId, customTestMeta.totalQuestions, customTestMeta.questionScore]);

  const maxScore = useMemo(
    () => Math.round(examQuestions.reduce((sum, q) => sum + q.points, 0) * 10) / 10,
    [examQuestions]
  );
  // 배점을 시험에서 읽지 못해 기본값으로 채운 문항 수. 0 이면 기본 배점 칸을 숨깁니다.
  const filledPointCount = useMemo(
    () => (testCategory === 'school' ? examQuestions.filter(q => !q.pointFromExam).length : 0),
    [testCategory, examQuestions]
  );

  /* 고른 내신 시험에 문항 자료가 아예 없는 경우.
     이때는 문항 수도 배점도 알 수 없으므로 강사가 직접 정해야 합니다. */
  const schoolExamHasQuestions = useMemo(() => {
    if (testCategory !== 'school' || !selectedExamId) return true;
    const exam = searchedExams.find(e => e.id === selectedExamId);
    return Array.isArray(exam?.questions) && exam.questions.length > 0;
  }, [testCategory, selectedExamId, searchedExams]);

  const scoreOf = useCallback((wrongList) => {
    const wrong = new Set(wrongList || []);
    const lost = examQuestions.reduce((sum, q) => sum + (wrong.has(q.key) ? q.points : 0), 0);
    return Math.max(0, Math.round((maxScore - lost) * 10) / 10);
  }, [examQuestions, maxScore]);

  /* 문항 구성이 바뀌면(총 문항 수·배점 변경, 다른 시험 선택) 이미 찍어 둔 오답을 다시 맞춥니다.
     예전에는 점수를 클릭할 때만 계산해서, 배점을 나중에 고치면 옛 점수가 그대로 저장됐고
     사라진 문항 번호도 남아 있었습니다. */
  useEffect(() => {
    const valid = new Set(examQuestions.map(q => q.key));
    setInputsByStudent(prev => {
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([sId, v]) => {
        const kept = (v.wrongQuestions || []).filter(n => valid.has(n));
        const recalculated = scoreOf(kept);
        if (kept.length !== (v.wrongQuestions || []).length || v.score !== recalculated) {
          changed = true;
          next[sId] = { ...v, wrongQuestions: kept, score: recalculated, manualScore: false };
        } else {
          next[sId] = v;
        }
      });
      return changed ? next : prev;
    });
  }, [examQuestions, scoreOf]);

  /* 두 개의 setState 를 중첩하지 않고 나란히 부릅니다.
     예전에는 setSelectedStudentIds 의 업데이터 안에서 setInputsByStudent 를 불렀는데,
     업데이터는 순수해야 하고 StrictMode 에서 두 번 실행됩니다. */
  const toggleStudent = useCallback((sId) => {
    setSelectedStudentIds(prev => (prev.includes(sId) ? prev.filter(id => id !== sId) : [...prev, sId]));
    setInputsByStudent(prev => (prev[sId] ? prev : {
      ...prev,
      [sId]: { wrongQuestions: [], score: maxScore, manualScore: false, comment: '', plan: '' }
    }));
  }, [maxScore]);

  const toggleWrongQuestion = (sId, qKey) => {
    setInputsByStudent(prev => {
      const current = prev[sId] || { wrongQuestions: [], comment: '', plan: '' };
      const isWrong = (current.wrongQuestions || []).includes(qKey);
      // 시험지에 실린 순서대로 정렬합니다(키가 곧 순번).
      const newWrongs = isWrong
        ? current.wrongQuestions.filter(n => n !== qKey)
        : [...(current.wrongQuestions || []), qKey].sort((a, b) => Number(a) - Number(b));

      // 문항을 다시 만지면 자동 계산으로 되돌립니다.
      return { ...prev, [sId]: { ...current, wrongQuestions: newWrongs, score: scoreOf(newWrongs), manualScore: false } };
    });
  };

  const handleInputChange = (sId, field, value) => {
    setInputsByStudent(prev => ({
      ...prev,
      // 점수를 손으로 고치면 그 값을 지킵니다. 예전에는 오답을 하나 더 누르는 순간 100 으로 되돌아갔습니다.
      [sId]: { ...(prev[sId] || {}), [field]: value, ...(field === 'score' ? { manualScore: true } : {}) }
    }));
  };

  // 🚀 [CTO 최적화] Firebase Batched Write를 통한 원자적 일괄 저장 및 아카데미 유니버스 동기화
  const handleSubmitAll = async () => {
    if (testCategory === 'school' && !selectedExamId) return alert("시험을 선택해주세요.");
    if (testCategory !== 'school' && (!customTestMeta.title.trim() || !customTestMeta.unitName.trim())) {
      return alert("평가 제목과 단원/범위명을 모두 입력해주세요.");
    }
    if (selectedStudentIds.length === 0) return alert("최소 1명 이상의 학생을 선택해주세요.");
    /* 모든 문항의 배점이 0 이면 만점이 0 이 됩니다. 저장 규칙이 만점을 0 보다 크게 요구하므로
       여기서 막지 않으면 권한 오류처럼 보이는 메시지가 뜹니다. */
    if (!(maxScore > 0)) {
      return alert("이 시험은 만점이 0점입니다. 문항 배점을 확인해주세요.");
    }

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
        const input = inputsByStudent[sId] || {};
        const numScore = Number(input.score);

        // 빈 칸은 예전에 Number('') = 0 이라 검사를 통과해 0 점으로 저장됐습니다.
        if (input.score === '' || input.score === null || input.score === undefined || !Number.isFinite(numScore)) {
          throw new Error(`${sInfo?.name || '학생'}의 점수가 비어 있습니다.`);
        }
        if (numScore < 0 || numScore > maxScore) {
          throw new Error(`${sInfo?.name || '학생'}의 점수가 범위를 벗어났습니다 (0~${maxScore}점).`);
        }

        const wrongSet = new Set(input.wrongQuestions || []);

        // Action 1: 진단 평가 원본 로그 생성 (student_exam_diagnostics)
        const diagRef = doc(collection(db, `artifacts/${APP_ID}/public/data/student_exam_diagnostics`));
        batch.set(diagRef, {
          schemaVersion: 2,
          testCategory: testCategory,
          /* 내신일 때만 시험 마스터를 가리킵니다. 개념테스트·모의고사는 마스터가 없으므로
             빈 값이 정상입니다. 읽는 쪽은 없을 때를 정상으로 처리해야 합니다. */
          examDocId: testCategory === 'school' ? (selectedExamId || null) : null,
          examTitle: examTitle,
          unitName: testCategory === 'school' ? '학교 내신 기출' : customTestMeta.unitName.trim(),
          subject: customTestMeta.subject,
          studentId: sId,
          studentName: sInfo?.name || '알수없음',
          score: numScore,
          maxScore: maxScore,
          /* 문항별 기록. 지금은 정오만 담지만, 나중에 개념 태그(conceptIds)나
             오류 유형(errorType)을 더해도 기존 기록은 그대로 동작합니다. */
          responses: examQuestions.map(q => ({
            no: q.displayNumber,
            points: q.points,
            verdict: wrongSet.has(q.key) ? 'wrong' : 'correct'
          })),
          // 화면에서는 순번으로 다루지만, 저장은 시험지의 실제 문항 번호로 합니다.
          wrongQuestionNumbers: examQuestions.filter(q => wrongSet.has(q.key)).map(q => q.displayNumber),
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
                // 원점수만으로는 잘함/못함을 알 수 없으므로 만점을 함께 남깁니다.
                latestMaxScore: maxScore,
                latestGrade: getRubricGrade(numScore, maxScore),
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <select
                className="border border-slate-300 p-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                value={filters.schoolType}
                onChange={e => setFilters({ ...filters, schoolType: e.target.value, schoolName: '', gradeSem: '' })}
              >
                <option value="high">고등학교</option>
                <option value="middle">중학교</option>
                <option value="elementary">초등학교</option>
              </select>

              {/* 다른 화면과 같은 학교 드롭다운. 직접 타이핑하면 표기가 갈려 검색이 0건이 됩니다. */}
              <div className="col-span-1">
                <SmartSchoolSelect
                  schoolType={filters.schoolType}
                  schoolsData={schoolsData}
                  value={filters.schoolName}
                  onChange={(val) => setFilters({ ...filters, schoolName: val })}
                />
              </div>

              <select className="border border-slate-300 p-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}>
                <option value="">연도 전체</option>
                {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select className="border border-slate-300 p-3 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold" value={filters.gradeSem} onChange={e => setFilters({...filters, gradeSem: e.target.value})}>
                <option value="">학년/학기 전체</option>
                {Array.from({ length: filters.schoolType === 'elementary' ? 6 : 3 }, (_, i) => i + 1)
                  .flatMap(g => [1, 2].map(s => (
                    <option key={`${g}-${s}`} value={`${g}-${s}`}>{g}학년 {s}학기</option>
                  )))}
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

            {/* 배점이 시험에 모두 등록돼 있으면 기본 배점 칸을 띄우지 않습니다.
                쓰이지도 않는 값을 보여 주면 강사가 그걸 고치면 점수가 바뀐다고 오해합니다. */}
            {selectedExamId && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className={`p-3.5 border rounded-xl text-sm font-bold ${
                  !schoolExamHasQuestions ? 'md:col-span-1 bg-amber-50 border-amber-200 text-amber-900'
                    : filledPointCount > 0 ? 'md:col-span-2 bg-amber-50 border-amber-200 text-amber-900'
                    : 'md:col-span-3 bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}>
                  총 <strong>{examQuestions.length}문항</strong> · 만점 <strong>{maxScore}점</strong>
                  {!schoolExamHasQuestions ? (
                    <span className="block mt-1 text-xs font-bold">
                      ⚠ 이 시험에는 문항 자료가 등록되어 있지 않습니다.
                      아래에서 문항 수와 배점을 직접 정해 주세요.
                      (내신연구소에서 문항을 등록하면 실제 배점이 자동으로 반영됩니다.)
                    </span>
                  ) : filledPointCount > 0 ? (
                    <span className="block mt-1 text-xs font-bold">
                      ⚠ {examQuestions.length}개 중 {filledPointCount}개 문항의 배점이 비어 있어 기본 배점을 적용했습니다.
                      실제 배점과 다르면 내신연구소에서 문항 배점을 채워 주세요.
                    </span>
                  ) : (
                    <span className="block mt-1 text-xs font-bold">
                      ✓ 모든 문항의 배점이 시험 자료에 등록되어 있습니다. 그대로 채점합니다.
                    </span>
                  )}
                </div>

                {!schoolExamHasQuestions && (
                  <div>
                    <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">총 문항 수</label>
                    <input
                      type="number" min="1" max="100"
                      className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                      value={customTestMeta.totalQuestions}
                      onChange={e => setCustomTestMeta({ ...customTestMeta, totalQuestions: e.target.value })}
                    />
                  </div>
                )}

                {filledPointCount > 0 && (
                  <div>
                    <label className="block text-xs font-extrabold text-slate-500 uppercase mb-1">
                      {schoolExamHasQuestions ? '기본 배점 (배점이 빈 문항용)' : '문항당 배점'}
                    </label>
                    <input
                      type="number" min="1" max="100"
                      className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                      value={customTestMeta.questionScore}
                      onChange={e => setCustomTestMeta({ ...customTestMeta, questionScore: e.target.value })}
                    />
                  </div>
                )}
              </div>
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
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
              총 <strong className="text-indigo-700">{examQuestions.length}문항</strong> ·
              만점 <strong className="text-indigo-700">{maxScore}점</strong>
              <span className="ml-1 text-xs font-bold text-slate-500">— 점수는 이 만점 기준 원점수로 저장됩니다.</span>
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
          <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">시즌</label>
          <select
            className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer mb-4"
            value={selectedSeason}
            onChange={e => { if (confirmDiscardInputs('시즌을 변경')) { setSelectedSeason(e.target.value); setInputsByStudent({}); } }}
          >
            {dynamicSeasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">
            담당 반 선택 <span className="normal-case font-bold text-slate-400">— {availableClasses.length}개 반</span>
          </label>
          <select className="w-full border border-slate-300 p-3 rounded-xl bg-slate-50 font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer" value={selectedClassId} onChange={e => {
            if (!confirmDiscardInputs('반을 변경')) return;
            setSelectedClassId(e.target.value); setSelectedStudentIds([]); setInputsByStudent({});
          }}>
            <option value="">반을 선택하세요</option>
            {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedClassId && (
          <div>
            <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">학생 명단 (클릭하여 채점 대상 추가)</label>
            {classStudents.length === 0 ? (
              <p className="text-rose-600 text-xs font-bold bg-rose-50 p-3 rounded-xl leading-relaxed">
                이 반에 <strong>수강 중(active)</strong>인 학생이 없습니다.<br />
                회원 관리 → 해당 학생 → 수강 등록에서 이 반에 등록되어 있는지 확인해 주세요.
              </p>
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
                    <span className="text-xs font-black text-slate-500 uppercase">원점수</span>
                    <input
                      type="number" min="0" max={maxScore} step="0.5"
                      className="w-20 border-b-2 border-rose-500 p-1 text-center font-black text-rose-600 text-2xl outline-none bg-transparent"
                      value={input.score} onChange={e => handleInputChange(sId, 'score', e.target.value)}
                    />
                    <span className="text-slate-600 font-bold">/ {maxScore}점</span>
                    <span className="text-xs font-black text-slate-400 border-l border-slate-200 pl-2 ml-1">
                      루브릭 {getRubricGrade(input.score, maxScore)}
                      {input.manualScore && <span className="block text-[10px] text-amber-600">직접 입력</span>}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-extrabold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-600"/> 🎯 학생이 틀린 번호를 원클릭으로 선택하세요 (배점에 따라 점수가 자동 감점됩니다)
                  </p>
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50/50 rounded-2xl border border-slate-100">
                    {examQuestions.map((q) => {
                      const isWrong = (input.wrongQuestions || []).includes(q.key);
                      return (
                        <button
                          key={q.key} type="button"
                          onClick={(e) => { e.preventDefault(); toggleWrongQuestion(sId, q.key); }}
                          className={`px-3 min-w-[3.25rem] h-12 rounded-xl font-black text-sm transition-colors duration-150 cursor-pointer border flex flex-col items-center justify-center leading-tight ${
                            isWrong
                              ? 'bg-rose-600 text-white border-rose-700 shadow-md'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300 shadow-sm'
                          }`}
                        >
                          <span>{q.displayNumber}번</span>
                          <span className={`text-[10px] font-bold ${isWrong ? 'text-rose-100' : 'text-slate-400'}`}>{q.points}점</span>
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