/* [서비스 가치] 아카데미 유니버스 - 데이터 시각화를 적용한 프리미엄 학습 역량 대시보드.
   학생의 약점을 입체적으로 분석하고, 미수강 과목에 대한 수강 동기를 강력하게 부여합니다. */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Lock, ChevronLeft, TrendingUp, TrendingDown, 
  Minus, BookOpen, Calculator, Globe, Atom, Star, Award, Target, Sparkles, Users, Search, ChevronRight
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, Badge, Button } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

// --- 성취 레벨(Tier) 정의 ---
const TIERS = [
  { name: '다이아', minScore: 90, color: 'text-cyan-400', border: 'border-cyan-400', shadow: 'shadow-[0_0_20px_rgba(34,211,238,0.6)]', bg: 'bg-gradient-to-br from-cyan-900 to-slate-900' },
  { name: '플래티넘', minScore: 80, color: 'text-emerald-400', border: 'border-emerald-400', shadow: 'shadow-[0_0_20px_rgba(52,211,153,0.5)]', bg: 'bg-gradient-to-br from-emerald-900 to-slate-900' },
  { name: '골드', minScore: 70, color: 'text-yellow-400', border: 'border-yellow-400', shadow: 'shadow-[0_0_20px_rgba(250,204,21,0.4)]', bg: 'bg-gradient-to-br from-yellow-900 to-slate-900' },
  { name: '실버', minScore: 60, color: 'text-slate-300', border: 'border-slate-300', shadow: 'shadow-[0_0_15px_rgba(203,213,225,0.3)]', bg: 'bg-gradient-to-br from-slate-700 to-slate-900' },
  { name: '브론즈', minScore: 0, color: 'text-amber-600', border: 'border-amber-700', shadow: 'shadow-[0_0_15px_rgba(180,83,9,0.3)]', bg: 'bg-gradient-to-br from-amber-950 to-slate-900' }
];

// --- 과목별 세부 역량 및 성향 메타데이터 ---
const SUBJECT_META = {
  '국어': {
    icon: BookOpen, title: '구조적 독해 마스터',
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
    icon: Calculator, title: '수리 논리 마스터',
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
    icon: Globe, title: '글로벌 소통 마스터',
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
    icon: Atom, title: '과학적 탐구 마스터',
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

// 미수강 과목 호기심 유발용 가짜 데이터 배열
const DUMMY_STATS = [
  { value: 90 }, { value: 70 }, { value: 85 }, { value: 60 }, { value: 95 }, { value: 75 }
];

// SVG 레이더 차트 컴포넌트
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
    return <polygon key={level} points={points} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
  });

  const dataPoints = stats.map((s, i) => getPoint(s.value, i, stats.length)).join(' ');

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-square flex items-center justify-center">
      <svg width={size} height={size} className="overflow-visible filter drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
        {webLines}
        {stats.map((_, i) => {
           const [x, y] = getPoint(100, i, stats.length).split(',');
           return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        })}
        <polygon points={dataPoints} fill="rgba(59,130,246,0.4)" stroke="#60a5fa" strokeWidth="3" strokeLinejoin="round" />
        {stats.map((s, i) => {
          const [x, y] = getPoint(s.value, i, stats.length).split(',');
          return <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#3b82f6" strokeWidth="2" />
        })}
        {!isDummy && stats.map((s, i) => {
          const [x, y] = getPoint(115, i, stats.length).split(',');
          return (
            <text key={i} x={x} y={y} fill="#cbd5e1" fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" className="drop-shadow-md">
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
  
  // 🚀 [CTO 패치] 권한별 학생 명단 필터링 로직
  const accessibleStudents = useMemo(() => {
      const allStudents = (users || []).filter(u => u.role === 'student');
      
      // 관리자 및 조교: 전체 학생
      if (['admin', 'admin_assistant', 'ta'].includes(currentUser.role)) {
          return allStudents;
      }
      // 학부모: 연결된 자녀만
      if (currentUser.role === 'parent') {
          return allStudents.filter(s => (currentUser.linkedChildrenIds || []).includes(s.id));
      }
      // 강사: 본인이 담당하는 수업의 수강생만
      if (currentUser.role === 'lecturer') {
          const myClasses = (classes || []).filter(c => c.lecturerId === currentUser.id).map(c => c.id);
          const myStudentIds = (enrollments || [])
              .filter(e => myClasses.includes(e.classId) && e.status === 'active')
              .map(e => e.studentId);
          return allStudents.filter(s => myStudentIds.includes(s.id));
      }
      return [];
  }, [users, classes, enrollments, currentUser]);

  const isStudent = currentUser.role === 'student';
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const activeStudentId = isStudent ? currentUser.id : selectedStudentId;
  const studentInfo = (users || []).find(s => s.id === activeStudentId) || currentUser;

  const [grades, setGrades] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);

  // 성적 데이터 연동
  useEffect(() => {
    if (!activeStudentId) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), where('studentId', '==', activeStudentId));
    const unsub = onSnapshot(q, (snapshot) => {
        setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.createdAt?.seconds - b.createdAt?.seconds));
    });
    return () => unsub();
  }, [activeStudentId]);

  // DB 점수 기반 가상 세부 역량 산출
  const generateMockStats = (subjectName) => {
    let latestScore = 0;
    let prevScore = 0;
    
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
        const stats = generateMockStats(sub);
        if (stats) {
            const avg = Math.round(stats.reduce((acc, cur) => acc + cur.value, 0) / stats.length);
            const tier = TIERS.find(t => avg >= t.minScore) || TIERS[TIERS.length - 1];
            result[sub] = { isUnlocked: true, stats, avg, tier, meta: SUBJECT_META[sub] };
        } else {
            result[sub] = { isUnlocked: false, meta: SUBJECT_META[sub] };
        }
    });
    return result;
  }, [grades]);

  // --- 비학생 계정용 학생 선택 화면 ---
  if (!isStudent && !activeStudentId) {
      const displayStudents = accessibleStudents.filter(s => s.name.includes(searchQuery));
      return (
          <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in pb-20 px-4 pt-10">
              <div className="text-center mb-12">
                  <h1 className="text-3xl font-black text-slate-800 flex items-center justify-center gap-3 mb-4">
                      <Target className="text-indigo-600" size={36}/> 아카데미 유니버스 학생 선택
                  </h1>
                  <p className="text-slate-500 font-bold text-base">분석 리포트를 열람할 학생을 선택해 주세요.</p>
              </div>

              {currentUser.role !== 'parent' && (
                  <div className="relative max-w-md mx-auto mb-8">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                      <input 
                          type="text" 
                          className="w-full bg-white border-2 border-slate-200 rounded-2xl p-4 pl-12 font-bold outline-none focus:border-indigo-500 shadow-sm"
                          placeholder="학생 이름 검색" 
                          value={searchQuery} 
                          onChange={e => setSearchQuery(e.target.value)}
                      />
                  </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
                  {displayStudents.length === 0 ? <p className="col-span-full text-center py-10 text-slate-400 font-bold">열람 가능한 학생이 없습니다.</p> :
                  displayStudents.map(s => (
                      <div key={s.id} onClick={() => setSelectedStudentId(s.id)} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-lg cursor-pointer transition-all flex items-center justify-between group">
                          <div>
                              <div className="font-black text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">{s.name}</div>
                              <div className="text-xs font-bold text-slate-400">{s.schoolName || '소속학교 미상'}</div>
                          </div>
                          <ChevronRight className="text-slate-300 group-hover:text-indigo-500"/>
                      </div>
                  ))}
              </div>
          </div>
      );
  }

  // --- 과목 대시보드 (메인) ---
  if (!selectedSubject) {
      return (
        <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in pb-20 px-4 pt-6">
            {!isStudent && (
                <button onClick={() => setSelectedStudentId('')} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold mb-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
                    <ChevronLeft size={18}/> 학생 목록으로 돌아가기
                </button>
            )}

            <div className="text-center mb-10">
                <h1 className="text-4xl font-black text-slate-800 flex items-center justify-center gap-3 mb-4">
                    <Sparkles className="text-indigo-600" size={40}/> 아카데미 유니버스
                </h1>
                <p className="text-slate-500 font-bold text-lg">
                    {studentInfo?.name} 학생의 과목별 역량을 입체적으로 진단합니다.<br/>
                    <span className="text-sm font-normal text-slate-400">데이터가 확보된 과목의 분석 리포트만 활성화됩니다.</span>
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Object.entries(subjectData).map(([subName, data]) => {
                    const Icon = data.meta.icon;
                    if (!data.isUnlocked) {
                        return (
                            <div key={subName} className="relative bg-slate-900 rounded-[32px] p-6 flex flex-col items-center justify-center text-center overflow-hidden border-2 border-slate-700 h-80 group shadow-lg">
                                {/* 호기심 유발 블러 레이더 차트 */}
                                <div className="absolute inset-0 opacity-20 blur-[6px] pointer-events-none flex items-center justify-center scale-125">
                                    <RadarChart stats={DUMMY_STATS} isDummy={true} />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/80 to-slate-900 z-0"></div>

                                <Lock size={36} className="text-blue-400 mb-4 relative z-10 group-hover:scale-110 transition-transform"/>
                                <h3 className="text-2xl font-black text-white mb-3 relative z-10">{subName} 역량 미확인</h3>
                                <p className="text-xs font-bold text-slate-300 relative z-10 px-2 leading-relaxed mb-6">
                                    임페리얼의 {subName} 정규반에 합류하여<br/>숨겨진 6대 세부 역량을 진단하고<br/>최적화된 성적 향상 솔루션을 경험하세요.
                                </p>
                                <Button variant="outline" className="relative z-10 border-blue-500 text-blue-400 bg-slate-900/50 hover:bg-blue-500 hover:text-white rounded-xl text-xs py-2 h-auto" onClick={() => alert('해당 과목 수강 및 성적 입력 후 정밀 분석 데이터가 활성화됩니다. 수강 상담은 데스크로 문의해주세요!')}>
                                    프리미엄 분석 잠금해제
                                </Button>
                            </div>
                        );
                    }

                    return (
                        <div key={subName} onClick={() => setSelectedSubject(subName)} 
                             className={`relative bg-white rounded-[32px] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:-translate-y-2 group border-4 ${data.tier.border} ${data.tier.shadow} h-80`}>
                            
                            <div className={`absolute inset-0 opacity-10 rounded-[28px] ${data.tier.bg}`}></div>
                            
                            <Badge variant="outline" className={`absolute top-4 right-4 font-black bg-white shadow-sm ${data.tier.color}`}>{data.tier.name} 레벨</Badge>
                            
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-xl ${data.tier.bg} text-white border-2 border-white/20 relative z-10 group-hover:scale-110 transition-transform`}>
                                <Icon size={40} />
                            </div>
                            <div className="relative z-10">
                                <p className="text-xs font-black text-slate-400 mb-1">{data.meta.title}</p>
                                <h3 className="text-3xl font-black text-slate-800 mb-2">{subName}</h3>
                                <p className="text-base font-black text-slate-600 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100 shadow-sm">
                                    성취 지수 <span className="text-indigo-600">{data.avg}</span>
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
  
  // 예상 등급 환산 (수능 모의고사 9등급제 기준 예시)
  const calcExpectedGrade = (score) => {
      if(score >= 90) return 1; if(score >= 80) return 2; if(score >= 70) return 3;
      if(score >= 60) return 4; if(score >= 50) return 5; return 6;
  };

  return (
      <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in pb-20 px-2 sm:px-4 pt-6">
          
          <button onClick={() => setSelectedSubject(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold mb-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
              <ChevronLeft size={18}/> 과목 대시보드로 돌아가기
          </button>

          {/* 상단 프로필 헤더 */}
          <div className={`${currData.tier.bg} border border-white/10 rounded-[40px] p-8 sm:p-12 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center gap-8`}>
              <div className="absolute right-0 top-0 w-96 h-96 bg-white/5 rounded-full blur-[100px]"></div>
              
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-black/30 border-4 border-white/20 flex items-center justify-center text-white shadow-2xl relative z-10 shrink-0">
                  <Icon size={64} />
              </div>

              <div className="relative z-10 text-center md:text-left flex-1">
                  <Badge variant="outline" className={`bg-black/40 border-white/20 text-white mb-3 font-bold px-3 py-1`}>{currData.meta.title}</Badge>
                  <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">{studentInfo?.name} 학생의 {selectedSubject} 분석</h1>
                  <p className="text-white/80 font-medium text-lg leading-relaxed max-w-2xl break-keep">
                      데이터 분석 결과, 종합 성취 지수는 <span className="text-white font-black">{currData.avg}</span>점이며 현재 <span className={currData.tier.color + " font-black"}>{currData.tier.name}</span> 학습 레벨에 도달했습니다. 세부 역량을 확인하고 다음 목표를 설정하세요.
                  </p>
              </div>

              {/* 종합 예상 등급 */}
              <div className="bg-black/40 border border-white/10 rounded-3xl p-6 relative z-10 shrink-0 text-center min-w-[200px]">
                  <div className="text-white/60 font-bold text-sm mb-2 flex items-center justify-center gap-2"><Award size={16}/> 모의고사 예상 등급</div>
                  <div className="text-5xl font-black text-white mb-1">{calcExpectedGrade(currData.avg)}<span className="text-2xl text-white/60 font-bold ml-1">등급</span></div>
                  <div className="text-xs font-bold text-white/40 mt-2">최근 누적 데이터 환산치</div>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* 좌측: 레이더 차트 영역 */}
              <Card className="bg-slate-900 border-slate-800 rounded-[40px] p-8 flex flex-col items-center justify-center shadow-2xl h-[500px]">
                  <h3 className="text-xl font-black text-white mb-8 w-full text-left flex items-center gap-2"><Target className="text-blue-500"/> 6대 세부 역량 스캐너</h3>
                  <div className="w-full flex-1 flex items-center justify-center">
                      <RadarChart stats={currData.stats} />
                  </div>
              </Card>

              {/* 우측: 세부 역량 분석 영역 */}
              <div className="space-y-4">
                  {currData.stats.map(stat => (
                      <Card key={stat.id} className="p-5 border-slate-200 rounded-[24px] hover:border-indigo-400 hover:shadow-lg transition-all group flex flex-col sm:flex-row items-center gap-4 sm:gap-6 bg-white">
                          <div className="w-full sm:w-32 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100 pb-4 sm:pb-0 shrink-0">
                              <span className="text-sm font-black text-slate-400 mb-1">{stat.name}</span>
                              <div className="flex items-center gap-2">
                                  <span className="text-3xl font-black text-slate-800">{stat.value}</span>
                                  <div className="flex flex-col">
                                      {stat.diff > 0 ? <span className="flex items-center text-xs font-black text-emerald-500"><TrendingUp size={12}/> {Math.abs(stat.diff)}</span> :
                                       stat.diff < 0 ? <span className="flex items-center text-xs font-black text-rose-500"><TrendingDown size={12}/> {Math.abs(stat.diff)}</span> :
                                       <span className="flex items-center text-xs font-black text-slate-300"><Minus size={12}/> 0</span>}
                                  </div>
                              </div>
                          </div>
                          
                          <div className="flex-1">
                              <p className="text-sm font-bold text-slate-600 leading-relaxed mb-3 break-keep">
                                  {stat.desc}
                              </p>
                              {/* 시각적 성취 바 */}
                              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-1000 ${stat.value >= 80 ? 'bg-indigo-500' : stat.value >= 60 ? 'bg-blue-400' : 'bg-slate-300'}`} style={{ width: `${stat.value}%` }}></div>
                              </div>
                          </div>
                      </Card>
                  ))}
              </div>
          </div>
      </div>
  );
};

export default AcademyUniverse;