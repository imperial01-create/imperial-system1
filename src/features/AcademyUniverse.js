/* [서비스 가치] 아카데미 유니버스 - 데이터 시각화를 적용한 프리미엄 학습 역량 대시보드.
   (🚀 CTO 패치: 강의 관리에서 할당한 '과목' 데이터를 기준으로 잠금 해제가 작동하는 엄격한 로직 적용 완료) */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Lock, ChevronLeft, TrendingUp, TrendingDown, 
  Minus, BookOpen, Calculator, Globe, Atom, Star, Award, Target, Sparkles, Users, Search, ChevronRight, CheckCircle
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, Badge, Button, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

// --- 성취 레벨(Tier) 정의 ---
const TIERS = [
  { name: 'S등급 (최상위)', minScore: 90, color: 'text-cyan-600', border: 'border-cyan-600', shadow: 'shadow-[0_0_20px_rgba(8,145,178,0.2)]', bg: 'bg-gradient-to-br from-cyan-50 to-white' },
  { name: 'A등급 (상위)', minScore: 80, color: 'text-emerald-600', border: 'border-emerald-600', shadow: 'shadow-[0_0_20px_rgba(5,150,105,0.2)]', bg: 'bg-gradient-to-br from-emerald-50 to-white' },
  { name: 'B등급 (우수)', minScore: 70, color: 'text-blue-600', border: 'border-blue-600', shadow: 'shadow-[0_0_20px_rgba(37,99,235,0.2)]', bg: 'bg-gradient-to-br from-blue-50 to-white' },
  { name: 'C등급 (보통)', minScore: 60, color: 'text-slate-600', border: 'border-slate-300', shadow: 'shadow-[0_0_15px_rgba(100,116,139,0.1)]', bg: 'bg-gradient-to-br from-slate-50 to-white' },
  { name: 'D등급 (기초)', minScore: 0, color: 'text-amber-600', border: 'border-amber-600', shadow: 'shadow-[0_0_15px_rgba(217,119,6,0.1)]', bg: 'bg-gradient-to-br from-amber-50 to-white' }
];

// --- 과목별 세부 역량 및 성향 메타데이터 ---
const SUBJECT_META = {
  '국어': {
    icon: BookOpen, title: '국어 종합 사고력',
    stats: [
      { id: 'vocab', name: '어휘력', desc: '다양한 어휘의 의미를 정확하게 파악하고 문맥에 맞게 활용하는 능력' },
      { id: 'grammar', name: '문법응용', desc: '국어의 구조와 문법 규칙을 이해하고 실제 문장에 적용하는 능력' },
      { id: 'reading', name: '독해력', desc: '복잡한 지문의 핵심 구조를 파악하고 필자의 의도를 읽어내는 능력' },
      { id: 'literature', name: '문학감상', desc: '시, 소설 등 문학 작품의 표현 방식과 숨겨진 의미를 추론하는 능력' },
      { id: 'logic', name: '논리추론', desc: '주어진 정보를 바탕으로 생략된 전제를 찾고 결론을 도출하는 능력' },
      { id: 'speed', name: '정보처리', desc: '제한된 시간 내에 방대한 텍스트 정보를 빠르고 정확하게 처리하는 능력' }
    ]
  },
  '수학': {
    icon: Calculator, title: '수리 논리 및 추론력',
    stats: [
      { id: 'calc', name: '연산력', desc: '복잡한 수식을 빠르고 정확하게 계산하여 실수를 최소화하는 기본기' },
      { id: 'concept', name: '개념이해', desc: '수학적 정의와 정리의 본질을 완벽하게 이해하고 설명할 수 있는 능력' },
      { id: 'application', name: '응용력', desc: '알고 있는 개념을 낯선 유형의 문제에 자유자재로 변형하여 적용하는 능력' },
      { id: 'reasoning', name: '추론력', desc: '주어진 조건에서 숨겨진 단서를 찾아내어 논리적 연결고리를 만드는 능력' },
      { id: 'problem', name: '문제해결', desc: '고난도 킬러 문항을 마주했을 때 끝까지 파고들어 해답을 찾아내는 끈기' },
      { id: 'intuition', name: '직관력', desc: '문제의 형태만 보고도 올바른 풀이 방향과 접근법을 즉각적으로 떠올리는 감각' }
    ]
  },
  '영어': {
    icon: Globe, title: '영어 텍스트 분석력',
    stats: [
      { id: 'voca', name: '어휘/숙어', desc: '수능 및 내신 빈출 영단어와 숙어를 문맥 속에서 정확히 인지하는 능력' },
      { id: 'grammar', name: '구문문법', desc: '복잡하고 긴 문장의 구조를 파악하여 정확하게 끊어 읽고 해석하는 능력' },
      { id: 'reading', name: '독해력', desc: '영어 지문의 주제, 요지, 필자의 주장을 빠르고 정확하게 파악하는 능력' },
      { id: 'logic', name: '논리전개', desc: '순서 배열, 문장 삽입 등 글의 논리적 흐름과 단서를 파악하는 능력' },
      { id: 'listening', name: '청해력', desc: '원어민의 발음과 연음을 듣고 대화의 상황과 세부 정보를 파악하는 능력' },
      { id: 'speed', name: '속독속해', desc: '시간 압박 속에서도 글의 뉘앙스를 놓치지 않고 빠르게 훑어 읽는 능력' }
    ]
  },
  '과학': {
    icon: Atom, title: '과학적 탐구 및 응용력',
    stats: [
      { id: 'concept', name: '개념암기', desc: '물화생지 각 영역의 필수 개념과 용어를 정확하게 기억하는 능력' },
      { id: 'graph', name: '자료해석', desc: '복잡한 그래프, 표, 그림에서 유의미한 정보를 빠르고 정확하게 추출하는 능력' },
      { id: 'calc', name: '수리계산', desc: '물리, 화학 영역에서 필요한 수학적 계산을 실수 없이 수행하는 능력' },
      { id: 'experiment', name: '탐구설계', desc: '실험의 목적, 변인 통제, 대조군 등을 이해하고 결과를 예측하는 능력' },
      { id: 'application', name: '현상응용', desc: '학습한 과학적 지식을 일상생활의 다양한 현상에 논리적으로 적용하는 능력' },
      { id: '융합', name: '통합사고', desc: '서로 다른 단원이나 과목의 개념을 연결하여 복합적인 문제를 해결하는 능력' }
    ]
  }
};

const DUMMY_STATS = [ { value: 90 }, { value: 70 }, { value: 85 }, { value: 60 }, { value: 95 }, { value: 75 } ];

const RadarChart = ({ stats, isDummy = false }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 40;
  
  const getPoint = (val, idx, total) => {
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    const r = (val / 100) * radius;
    return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
  };

  const webLines = [100, 80, 60, 40, 20].map(level => {
    const points = stats.map((_, i) => getPoint(level, i, stats.length)).join(' ');
    return <polygon key={level} points={points} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />;
  });

  const dataPoints = stats.map((s, i) => getPoint(s.value, i, stats.length)).join(' ');

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-square flex items-center justify-center">
      <svg width={size} height={size} className="overflow-visible filter drop-shadow-[0_0_10px_rgba(59,130,246,0.2)]">
        {webLines}
        {stats.map((_, i) => {
           const [x, y] = getPoint(100, i, stats.length).split(',');
           return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
        })}
        <polygon points={dataPoints} fill="rgba(59,130,246,0.3)" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        {stats.map((s, i) => {
          const [x, y] = getPoint(s.value, i, stats.length).split(',');
          return <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />
        })}
        {!isDummy && stats.map((s, i) => {
          const [x, y] = getPoint(115, i, stats.length).split(',');
          return (
            <text key={i} x={x} y={y} fill="#64748b" fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
              {s.name}
            </text>
          )
        })}
      </svg>
    </div>
  );
};

const AcademyUniverse = ({ currentUser }) => {
  const { users, classes, enrollments } = useData();
  
  const accessibleStudents = useMemo(() => {
      const allStudents = (users || []).filter(u => u.role === 'student');
      if (['admin', 'admin_assistant', 'ta'].includes(currentUser.role)) return allStudents;
      if (currentUser.role === 'parent') return allStudents.filter(s => (currentUser.linkedChildrenIds || []).includes(s.id));
      if (currentUser.role === 'lecturer') {
          const myClasses = (classes || []).filter(c => c.lecturerId === currentUser.id).map(c => c.id);
          const myStudentIds = (enrollments || []).filter(e => myClasses.includes(e.classId) && e.status === 'active').map(e => e.studentId);
          return allStudents.filter(s => myStudentIds.includes(s.id));
      }
      return [];
  }, [users, classes, enrollments, currentUser]);

  const isStudent = currentUser.role === 'student';
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const activeStudentId = isStudent ? currentUser.id : selectedStudentId;
  const studentInfo = (users || []).find(s => s.id === activeStudentId) || currentUser;

  const [grades, setGrades] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);

  const handleSearchStudent = () => {
      if (!searchInput.trim()) return alert('이름을 입력해주세요.');
      const results = accessibleStudents.filter(u => u.name.includes(searchInput.trim()));
      setSearchResults(results);
      setSearchModalOpen(true);
  };

  // 🚀 [CTO 패치] 강의 관리에서 부여한 명시적 '과목(subject)'만 100% 신뢰하여 추출
  const getSubjectFromClass = (cls) => {
      if (!cls || !cls.subject) return null;
      return cls.subject; 
  };

  const myActiveClasses = useMemo(() => {
      if (!activeStudentId) return [];
      const myEnrollments = (enrollments || []).filter(e => e.studentId === activeStudentId && e.status === 'active');
      return myEnrollments.map(e => (classes || []).find(c => c.id === e.classId)).filter(Boolean);
  }, [activeStudentId, enrollments, classes]);

  useEffect(() => {
    if (!activeStudentId) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), where('studentId', '==', activeStudentId));
    const unsub = onSnapshot(q, (snapshot) => {
        setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.createdAt?.seconds - b.createdAt?.seconds));
    });
    return () => unsub();
  }, [activeStudentId]);

  const generateMockStats = (subjectName) => {
    let latestScore = 0; let prevScore = 0;
    const subjectGrades = [];
    grades.forEach(g => {
        const found = g.subjects.find(s => s.name.includes(subjectName));
        if (found) subjectGrades.push(Number(found.score || 0));
    });

    if (subjectGrades.length > 0) {
        latestScore = subjectGrades[subjectGrades.length - 1];
        if (subjectGrades.length > 1) prevScore = subjectGrades[subjectGrades.length - 2];
    } else {
        return null; 
    }

    const meta = SUBJECT_META[subjectName];
    const seed = latestScore;
    return meta.stats.map((s, i) => {
        const pseudoRandom = (seed * (i + 7)) % 20; 
        const val = Math.min(100, Math.max(0, seed - pseudoRandom + 5));
        const diff = val - Math.min(100, Math.max(0, prevScore - ((prevScore * (i+3)) % 15)));
        return { ...s, value: Math.round(val), diff: Math.round(diff) };
    });
  };

  const subjectData = useMemo(() => {
    const result = {};
    Object.keys(SUBJECT_META).forEach(sub => {
        // 수강 중인 클래스의 '명시적 과목(subject)' 속성이 해당 과목(sub)과 일치하는 경우 필터링
        const enrolledClassesInSubject = myActiveClasses.filter(c => getSubjectFromClass(c) === sub);
        
        const isUnlocked = enrolledClassesInSubject.length > 0;
        
        let stats = null;
        let avg = 0;
        let tier = TIERS[TIERS.length - 1]; 
        let hasGradeData = false;

        if (isUnlocked) {
            const rawStats = generateMockStats(sub);
            if (rawStats) {
                stats = rawStats;
                avg = Math.round(stats.reduce((acc, cur) => acc + cur.value, 0) / stats.length);
                tier = TIERS.find(t => avg >= t.minScore) || TIERS[TIERS.length - 1];
                hasGradeData = true;
            } else {
                stats = SUBJECT_META[sub].stats.map(s => ({ ...s, value: 0, diff: 0 }));
            }
            result[sub] = { 
                isUnlocked, stats, avg, tier, meta: SUBJECT_META[sub], 
                enrolledClasses: enrolledClassesInSubject, hasGradeData 
            };
        } else {
            result[sub] = { isUnlocked: false, meta: SUBJECT_META[sub] };
        }
    });
    return result;
  }, [grades, myActiveClasses]);


  if (!isStudent && !activeStudentId) {
      return (
          <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in pb-20 px-2 sm:px-4 pt-10">
              <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl text-center md:text-left">
                  <h1 className="text-3xl font-black mb-2 flex items-center justify-center md:justify-start gap-3"><Target className="text-blue-400" size={32}/> 역량 분석실 (관리자 모드)</h1>
                  <p className="text-slate-400 font-bold mb-8">분석 리포트를 열람할 학생의 이름을 검색해 주세요.</p>
                  <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20 max-w-lg mx-auto md:mx-0">
                      <Search className="ml-4 text-white/50 shrink-0 hidden sm:block" />
                      <input type="text" className="w-full p-3 bg-transparent text-white font-bold outline-none placeholder:text-white/40 text-center sm:text-left" placeholder="학생 이름 검색 (예: 홍길동)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()} />
                      <Button onClick={handleSearchStudent} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-6 font-black shrink-0 shadow-lg">검색</Button>
                  </div>
              </div>

              <Modal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} title="학생 검색 결과">
                  <div className="space-y-2 p-2 max-h-96 overflow-y-auto custom-scrollbar">
                      {searchResults.length === 0 ? <div className="text-center py-10 text-slate-400 font-bold">조건에 맞는 학생이 없습니다.</div> :
                      searchResults.map(s => (
                          <div key={s.id} onClick={() => { setSelectedStudentId(s.id); setSearchModalOpen(false); setSearchInput(''); }} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors group">
                              <div>
                                  <div className="font-black text-slate-800 text-lg group-hover:text-blue-600">{s.name}</div>
                                  <div className="text-sm font-bold text-slate-400">{s.schoolName || '학교미상'} ({s.grade || '학년미상'}) · {s.phone || '연락처없음'}</div>
                              </div>
                              <ChevronRight className="text-slate-300 group-hover:text-blue-500"/>
                          </div>
                      ))}
                  </div>
              </Modal>
          </div>
      );
  }

  if (!selectedSubject) {
      return (
        <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in pb-20 px-4 pt-6">
            {!isStudent && (
                <button onClick={() => setSelectedStudentId('')} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold mb-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
                    <ChevronLeft size={18}/> 학생 검색으로 돌아가기
                </button>
            )}

            <div className="text-center mb-10 bg-white p-8 rounded-[32px] shadow-sm border border-slate-100">
                <h1 className="text-3xl font-black text-slate-800 flex items-center justify-center gap-3 mb-4">
                    <Sparkles className="text-indigo-600" size={32}/> 아카데미 유니버스
                </h1>
                <p className="text-slate-500 font-bold text-lg">
                    {studentInfo?.name} 학생의 과목별 성취도를 입체적으로 분석합니다.<br/>
                    <span className="text-sm font-normal text-slate-400 border bg-slate-50 px-3 py-1 rounded-lg mt-2 inline-block">현재 학원에서 수강 중인 과목의 분석 리포트만 활성화됩니다.</span>
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Object.entries(subjectData).map(([subName, data]) => {
                    const Icon = data.meta.icon;
                    if (!data.isUnlocked) {
                        return (
                            <div key={subName} className="relative bg-slate-50 rounded-[32px] p-6 flex flex-col items-center justify-center text-center overflow-hidden border border-slate-200 h-80 group">
                                <div className="absolute inset-0 opacity-40 blur-[4px] pointer-events-none flex items-center justify-center scale-125">
                                    <RadarChart stats={DUMMY_STATS} isDummy={true} />
                                </div>
                                <div className="absolute inset-0 bg-slate-50/80 z-0"></div>

                                <Lock size={36} className="text-slate-400 mb-4 relative z-10"/>
                                <h3 className="text-2xl font-black text-slate-800 mb-3 relative z-10">{subName} 미수강</h3>
                                <p className="text-xs font-bold text-slate-500 relative z-10 px-2 leading-relaxed mb-6 break-keep">
                                    해당 과목은 현재 학원에서<br/>수강 중이지 않습니다.<br/>단과 등록 시 정밀 진단 시스템이 오픈됩니다.
                                </p>
                                <Badge variant="outline" className="relative z-10 border-slate-300 text-slate-500 bg-white shadow-sm">진단 불가</Badge>
                            </div>
                        );
                    }

                    return (
                        <div key={subName} onClick={() => setSelectedSubject(subName)} 
                             className={`relative bg-white rounded-[32px] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:-translate-y-2 group border-2 ${data.tier.border} ${data.tier.shadow} h-80`}>
                            
                            <div className={`absolute inset-0 opacity-10 rounded-[28px] ${data.tier.bg}`}></div>
                            
                            <Badge variant="outline" className={`absolute top-4 right-4 font-black bg-white shadow-sm ${data.tier.color}`}>{data.tier.name}</Badge>
                            
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-md bg-white border border-slate-100 ${data.tier.color} relative z-10 group-hover:scale-110 transition-transform`}>
                                <Icon size={36} />
                            </div>
                            <div className="relative z-10">
                                <p className="text-xs font-black text-slate-400 mb-1">{data.meta.title}</p>
                                <h3 className="text-2xl font-black text-slate-800 mb-3">{subName}</h3>
                                <p className="text-sm font-black text-slate-600 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100 shadow-sm flex items-center justify-center gap-1.5">
                                    종합 지수 <span className="text-blue-600 text-base">{data.avg}</span>
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  }

// --- 세부 역량 스캔 화면 ---
  const currData = subjectData[selectedSubject];
  const Icon = currData.meta.icon;
  
  // 🚀 [신규 추가] 학생 본인이 직접 출력할 수 있도록 실시간 세션 데이터 바인딩
  const studentEnglishStat = englishStats.find(s => s.studentId === activeStudentId);
  const activeSessionData = studentEnglishStat ? studentEnglishStat.vocaSession : null;

  const calcExpectedGrade = (score) => {
      if(score >= 90) return 1; if(score >= 80) return 2; if(score >= 70) return 3;
      if(score >= 60) return 4; if(score >= 50) return 5; return 6;
  };

  return (
      <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in pb-20 px-2 sm:px-4 pt-6">
          <button onClick={() => setSelectedSubject(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold mb-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
              <ChevronLeft size={18}/> 과목 대시보드로 돌아가기
          </button>

          <div className={`bg-white border border-slate-200 rounded-[40px] p-8 sm:p-12 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center gap-8`}>
              <div className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-slate-50 border-4 border-slate-100 flex items-center justify-center shadow-md relative z-10 shrink-0 ${currData.tier.color}`}>
                  <Icon size={64} />
              </div>

              <div className="relative z-10 text-center md:text-left flex-1">
                  <Badge variant="outline" className={`bg-slate-50 border-slate-200 text-slate-500 mb-3 font-bold px-3 py-1`}>{currData.meta.title}</Badge>
                  <h1 className="text-3xl sm:text-4xl font-black text-slate-800 mb-2 tracking-tight">{studentInfo?.name} 학생의 {selectedSubject} 정밀 분석</h1>
                  
                  {/* 🚀 [영어 특화] Voca 3대 스탯 및 분실방지 인쇄 UI */}
                  {selectedSubject === '영어' && studentEnglishStat && (
                      <div className="mt-4 mb-4 bg-white/50 p-5 rounded-2xl border border-blue-100 shadow-inner">
                          <div className="flex justify-between items-center mb-3 border-b border-blue-200 pb-2">
                              <h3 className="font-black text-blue-900 text-sm flex items-center gap-1.5"><BookOpen size={16}/> Voca 종합 스탯 리포트</h3>
                              <button onClick={() => window.print()} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1.5 transition-transform active:scale-95">
                                  <Printer size={14}/> 📥 [결석/분실] 맞춤 시험지 PDF 다운로드
                              </button>
                          </div>
                          
                          <div className="space-y-3 mb-4">
                              {/* 스탯 1: 어휘 진도 */}
                              <div>
                                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                      <span>📚 어휘 진도 (학습량)</span><span>{studentEnglishStat.vocaProgress || 0}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${studentEnglishStat.vocaProgress || 0}%` }}></div></div>
                              </div>
                              {/* 스탯 2: 뜻 이해도 */}
                              <div>
                                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                      <span>🧠 뜻 이해도 (다의어/추론)</span><span>{studentEnglishStat.vocaComprehension || 0}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${studentEnglishStat.vocaComprehension || 0}%` }}></div></div>
                              </div>
                              {/* 스탯 3: 장기 기억력 */}
                              <div>
                                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                      <span>🔋 장기 기억 유지력</span><span>{studentEnglishStat.vocaRetention || 0}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${studentEnglishStat.vocaRetention || 0}%` }}></div></div>
                              </div>
                          </div>

                          {/* 루브릭 한 줄 요약 */}
                          <div className="bg-blue-50 text-blue-800 text-xs font-bold p-3 rounded-xl border border-blue-200 flex items-start gap-2">
                              <Sparkles size={16} className="shrink-0 mt-0.5 text-blue-500"/>
                              <p className="leading-relaxed break-keep">{studentEnglishStat.vocaRubric || "성적 데이터가 수집되는 중입니다. 꾸준히 시험을 진행해 주세요."}</p>
                          </div>
                      </div>
                  )}

                  <p className="text-slate-600 font-medium text-base leading-relaxed max-w-2xl break-keep">
                      데이터 분석 결과, {selectedSubject} 종합 성취 지수는 <span className="text-blue-600 font-black text-lg">{currData.avg}</span>점이며 현재 <span className={currData.tier.color + " font-black text-lg"}>{currData.tier.name}</span> 구간에 위치하고 있습니다.
                  </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 relative z-10 shrink-0 text-center min-w-[200px]">
                  <div className="text-slate-500 font-bold text-sm mb-2 flex items-center justify-center gap-2"><Award size={16}/> 모의고사 예상 등급</div>
                  <div className="text-5xl font-black text-slate-800 mb-1">{calcExpectedGrade(currData.avg)}<span className="text-2xl text-slate-400 font-bold ml-1">등급</span></div>
                  <div className="text-xs font-bold text-slate-400 mt-2">최근 누적 데이터 환산치</div>
              </div>
          </div>
          
          {/* (이하 6대 역량 스캐너 바인딩 및 레이아웃 코드는 기존과 동일 유지) */}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="space-y-6">
                  <Card className="bg-white border-slate-200 rounded-[40px] p-8 flex flex-col items-center justify-center shadow-sm h-[500px]">
                      <h3 className="text-xl font-black text-slate-800 mb-8 w-full text-left flex items-center gap-2"><Target className="text-blue-500"/> 6대 세부 역량 스캐너</h3>
                      
                      {!currData.hasGradeData ? (
                          <div className="w-full flex-1 flex flex-col items-center justify-center text-center space-y-4">
                              <RadarChart stats={currData.stats} />
                              <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border border-rose-200 text-sm font-bold w-full max-w-sm mt-4">
                                  ⚠️ 성적 데이터가 입력되지 않았습니다.<br/>
                                  <span className="text-xs font-medium">정확한 역량 진단을 위해 입시 내비게이터에 성적표를 등록해 주세요. 현재 기본 스탯(0점)으로 렌더링 중입니다.</span>
                              </div>
                          </div>
                      ) : (
                          <div className="w-full flex-1 flex items-center justify-center">
                              <RadarChart stats={currData.stats} />
                          </div>
                      )}
                  </Card>
              </div>

              <div className="space-y-6 flex flex-col h-[500px] overflow-hidden">
                  
                  <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
                      {currData.stats.map(stat => (
                          <Card key={stat.id} className="p-4 border-slate-200 rounded-[24px] hover:border-indigo-400 transition-all flex flex-col sm:flex-row items-center gap-4 sm:gap-6 bg-white shrink-0">
                              <div className="w-full sm:w-28 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100 pb-2 sm:pb-0 shrink-0">
                                  <span className="text-sm font-black text-slate-500 mb-1">{stat.name}</span>
                                  <div className="flex items-center gap-2">
                                      <span className="text-2xl font-black text-slate-800">{stat.value}</span>
                                      <div className="flex flex-col">
                                          {stat.diff > 0 ? <span className="flex items-center text-[10px] font-black text-emerald-500"><TrendingUp size={10}/> {Math.abs(stat.diff)}</span> :
                                           stat.diff < 0 ? <span className="flex items-center text-[10px] font-black text-rose-500"><TrendingDown size={10}/> {Math.abs(stat.diff)}</span> :
                                           <span className="flex items-center text-[10px] font-black text-slate-300"><Minus size={10}/> 0</span>}
                                      </div>
                                  </div>
                              </div>
                              
                              <div className="flex-1 w-full">
                                  <p className="text-[13px] font-bold text-slate-600 leading-relaxed mb-2 break-keep">{stat.desc}</p>
                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all duration-1000 ${stat.value >= 80 ? 'bg-blue-500' : stat.value >= 60 ? 'bg-blue-300' : 'bg-slate-300'}`} style={{ width: `${stat.value}%` }}></div>
                                  </div>
                              </div>
                          </Card>
                      ))}

                      <div className="mt-8 pt-4 border-t-2 border-dashed border-slate-200">
                          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                              <BookOpen className="text-indigo-600" size={20}/> 수강 중인 연계 클래스
                          </h3>
                          <div className="grid grid-cols-1 gap-3">
                              {currData.enrolledClasses.map(cls => (
                                  <div key={cls.id} className="bg-indigo-50 border border-indigo-100 p-4 rounded-[20px] flex flex-col justify-center">
                                      <div className="flex justify-between items-start mb-2">
                                          <h4 className="font-black text-indigo-900 text-base">{cls.name}</h4>
                                          <CheckCircle size={16} className="text-emerald-500"/>
                                      </div>
                                      <div className="text-xs font-bold text-indigo-700 mb-2">
                                          담당 강사: {users.find(u => u.id === cls.lecturerId)?.name || '미지정'}
                                      </div>
                                      <div className="bg-white p-3 rounded-xl text-[12px] font-bold text-slate-500 leading-relaxed shadow-sm">
                                          {cls.description || `${selectedSubject} 과목의 핵심 역량을 강화하고 실전 감각을 극대화하는 맞춤형 정규 클래스입니다. 현재 ${studentInfo?.name} 학생의 취약점을 보완하는 데 집중하고 있습니다.`}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
};

export default AcademyUniverse;