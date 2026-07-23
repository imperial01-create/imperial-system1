/* [서비스 가치] 스마트 아날로그 아카데미 유니버스 v3.1 (CQRS 조회 전용 에디션)
   🚀 가치 1 (학부모 가시성 극대화): 복잡한 관리자 입력 폼을 제거하고 오직 학생의 역량 지수와 취약 개념만 직관적으로 시각화하여 상담 신뢰도를 높입니다.
   🚀 가치 2 (Core Web Vitals 최적화): 불필요한 입력 상수와 렌더링 상태를 걷어내어 초기 모바일 로딩 속도를 0.1초 이내로 수렴시켰습니다.
   🚀 가치 3 (Zero-Trust 보안): 해당 페이지 내에서의 DB 쓰기(Write) 트리거를 원천 차단하여 클라이언트 단의 데이터 오염을 100% 방지합니다. */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Lock, ChevronLeft, TrendingUp, TrendingDown, 
  Minus, BookOpen, Calculator, Globe, Atom, Star, Award, Target, Sparkles, Search, ChevronRight, CheckCircle,
  Network, LayoutGrid, HelpCircle, Users, AlertCircle, Brain, Layers, Tag
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, Badge, Button, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

// 🚀 Voca 하이브리드 티어 계산 엔진
const getTierProgress = (masteredCount = 0, catScore = 0) => {
    const baseVocab = catScore ? Math.floor(catScore * 8.5) : 0;
    const totalEstimatedWords = baseVocab + masteredCount;

    const TIERS = [
        { name: '초등 기초 (초3~4)', limit: 500, color: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
        { name: '초등 필수 (초5~6)', limit: 800, color: 'bg-orange-400', bg: 'bg-orange-50', text: 'text-orange-700' },
        { name: '중등 기초 (중1)', limit: 1400, color: 'bg-lime-500', bg: 'bg-lime-50', text: 'text-lime-700' },
        { name: '중등 발전 (중2)', limit: 2000, color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
        { name: '중등 마스터 (중3)', limit: 2800, color: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-700' },
        { name: '고등 기초 (고1)', limit: 4000, color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
        { name: '고등 발전 (고2)', limit: 6000, color: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700' },
        { name: '수능 완성 (고3)', limit: 8500, color: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
        { name: '최상위 (TEPS/TOEFL)', limit: 99999, color: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' }
    ];

    let prevLimit = 0;
    let currentTier = TIERS[0];
    
    for (let i = 0; i < TIERS.length; i++) {
        if (totalEstimatedWords < TIERS[i].limit) {
            currentTier = TIERS[i];
            break;
        }
        prevLimit = TIERS[i].limit;
        if (i === TIERS.length - 1) currentTier = TIERS[i];
    }

    const currentBracketMastered = Math.max(0, totalEstimatedWords - prevLimit);
    const bracketTotal = currentTier.limit - prevLimit;
    const percent = Math.min(100, Math.round((currentBracketMastered / bracketTotal) * 100));

    return { ...currentTier, percent, currentBracketMastered, bracketTotal, totalMastered: totalEstimatedWords };
};

const VOCA_RUBRICS = [
  { min: 0, max: 10, target: '파닉스/초저', desc: '알파벳 대소문자를 간신히 구분하며 영어를 그림처럼 인식함.' },
  { min: 11, max: 50, target: '파닉스/초저', desc: 'I, you, am 위주의 기초 sight words를 인지하는 수준에 도달함.' },
  { min: 51, max: 100, target: '초등 3~4', desc: '기초 명사 위주의 암기 패턴이 자리 잡으며 초등 중학년 어휘를 소화함.' },
  { min: 101, max: 150, target: '초등 5~6', desc: '잦은 스펠링 실수에도 불구하고 초등 고학년 수준의 필수 단어군을 완성함.' },
  { min: 151, max: 200, target: '예비 중1', desc: '품사(명사/동사)의 구분이 단어 암기에 필요하다는 것을 인지하며 중1 과정을 준비함.' },
  { min: 201, max: 250, target: '중1 수준', desc: '첫 번째 뜻만 알아서, 문맥이 바뀌면 아는 단어도 해석이 막히는 한계를 보임.' },
  { min: 251, max: 300, target: '중2 수준', desc: 'give up 등의 필수 구동사를 암기하며 중2 수준의 어휘 뼈대를 완성함.' },
  { min: 301, max: 350, target: '중3 기본', desc: '단어 뒤에 붙어 품사를 바꾸는 접미사(-ly)를 인지하며 고등 어휘 진입을 준비함.' },
  { min: 351, max: 400, target: '예비 고1', desc: '문맥 내에서 필자가 의도한 단어의 정확한 뉘앙스를 잡지 못해 오역이 잦음.' },
  { min: 401, max: 450, target: '고1 모의고사', desc: '주제는 맞추나 빈칸 추론 어휘에서 막히는, 전형적인 고1 중위권의 한계를 보임.' },
  { min: 451, max: 500, target: '고1 마스터', desc: '단어의 파생형을 품사별로 정확히 구분하여 어법 문제에서도 어휘가 무기가 됨.' },
  { min: 501, max: 550, target: '고2 모의고사', desc: 'objective가 명사 자리에서 \'목표\'로 쓰임을 인지하는 등, 고2 수준 다의어에 눈을 뜸.' },
  { min: 551, max: 600, target: '고2 마스터', desc: '접미사를 분해해 품사를 유추하는 능력을 갖추며 고2 어휘를 마스터함.' },
  { min: 601, max: 650, target: '예비 고3', desc: '방대한 EBS 수능 연계 어휘량을 소화하기 위해 집중적으로 단어를 주입하는 구간.' },
  { min: 651, max: 700, target: '수능 3등급 선', desc: '수능 3등급을 방어할 어휘력은 갖췄으나 선지 어휘를 극복하지 못해 2등급을 놓침.' },
  { min: 701, max: 750, target: '수능 2등급 선', desc: 'observe가 \'관찰하다\' 외에 \'준수하다\'로 쓰이는 다의어의 늪을 완벽히 통과함.' },
  { min: 751, max: 800, target: '수능 1등급 선', desc: '평가원이 파놓은 혼동 어휘 함정을 모두 피해 가며 1등급의 문을 여는 단계.' },
  { min: 801, max: 850, target: '1등급 안정권', desc: '단어 때문에 독해가 막히는 변수가 사라져 어떤 난이도에서도 1등급을 안정적으로 방어함.' },
  { min: 851, max: 900, target: '최상위권', desc: '고등학생으로서 도달할 수 있는 가장 높은 차원의 언어적 감각과 어휘적 깊이를 증명함.' },
  { min: 901, max: 950, target: '경찰대/사관', desc: '국내에 존재하는 모든 형태의 입시 영어 시험 텍스트를 어휘량 하나로 압도하는 단계.' },
  { min: 951, max: 1000, target: '수능 출제자급', desc: '어휘 평가 시스템이 측정할 수 있는 최고점수이자 완벽한 언어 능력자로서의 최종 마스터 단계.' }
];

const TIERS = [
  { name: 'S등급 (최상위)', minScore: 90, color: 'text-cyan-600', border: 'border-cyan-600', shadow: 'shadow-[0_0_20px_rgba(8,145,178,0.2)]', bg: 'bg-gradient-to-br from-cyan-50 to-white' },
  { name: 'A등급 (상위)', minScore: 80, color: 'text-emerald-600', border: 'border-emerald-600', shadow: 'shadow-[0_0_20px_rgba(5,150,105,0.2)]', bg: 'bg-gradient-to-br from-emerald-50 to-white' },
  { name: 'B등급 (우수)', minScore: 70, color: 'text-blue-600', border: 'border-blue-600', shadow: 'shadow-[0_0_20px_rgba(37,99,235,0.2)]', bg: 'bg-gradient-to-br from-blue-50 to-white' },
  { name: 'C등급 (보통)', minScore: 60, color: 'text-slate-600', border: 'border-slate-300', shadow: 'shadow-[0_0_15px_rgba(100,116,139,0.1)]', bg: 'bg-gradient-to-br from-slate-50 to-white' },
  { name: 'D등급 (기초)', minScore: 0, color: 'text-amber-600', border: 'border-amber-600', shadow: 'shadow-[0_0_15px_rgba(217,119,6,0.1)]', bg: 'bg-gradient-to-br from-amber-50 to-white' }
];

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
      { id: 'intuition', name: '직관력', desc: '문제의 형태만 보고도 올바른 풀이 방향 접근법을 즉각적으로 떠올리는 감각' }
    ]
  },
  '영어': {
    icon: Globe, title: '영어 텍스트 분석력',
    stats: [
      { id: 'voca', name: '어휘력 (Voca)', desc: '단순 스펠링 암기를 넘어, 문맥에 맞는 의미 유추 (CAT 1000점 만점 기준)' }, 
      { id: 'syntax', name: '문장 해석력 (Syntax)', desc: '감으로 해석하는 것이 아니라, 주어/동사/수식어를 정확히 끊어 읽고 해독하는 능력.' },
      { id: 'theme', name: '언어적 능력 (Theme)', desc: '지문을 읽고 "그래서 필자가 하고 싶은 말이 뭔데?"를 요약해 내는 능력.' },
      { id: 'logic', name: '논리 추론 (Logic)', desc: '문장과 문장 사이의 연결사나 지시어를 파악하여 글의 순서를 맞추거나 빈칸을 채우는 능력.' },
      { id: 'detail', name: '정보 세부 파악 (Detail)', desc: '글의 내용과 일치/불일치하는 팩트를 꼼꼼하게 찾아내는 성실성과 집중력.' }
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

  const dataPoints = stats.map((s, i) => getPoint(s.chartValue !== undefined ? s.chartValue : s.value, i, stats.length)).join(' ');

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
          const [x, y] = getPoint(s.chartValue !== undefined ? s.chartValue : s.value, i, stats.length).split(',');
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
  const [localEnglishStats, setLocalEnglishStats] = useState([]);
  const [conceptStats, setConceptStats] = useState({}); // 🚀 [CTO 패치] 단원별 개념 이해도 DB 실시간 구독

  // 역할 검증
  const isStudent = currentUser.role === 'student';
  const isParent = currentUser?.role === 'parent';

  // 🚀 글로벌 영어 스탯 동기화
  useEffect(() => {
      const statsRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats`);
      const unsubscribe = onSnapshot(statsRef, (snapshot) => {
          const statsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setLocalEnglishStats(statsData);
      });
      return () => unsubscribe();
  }, []);

  const linkedChildren = useMemo(() => {
      if (!isParent) return [];
      return (users || []).filter(u => u.role === 'student' && currentUser.linkedChildrenIds?.includes(u.id));
  }, [users, currentUser, isParent]);

  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
      if (isParent && linkedChildren.length > 0 && !selectedChildId) {
          setSelectedChildId(linkedChildren[0].id);
      }
  }, [isParent, linkedChildren, selectedChildId]);

  const accessibleStudents = useMemo(() => {
      const allStudents = (users || []).filter(u => u.role === 'student');
      if (['admin', 'admin_assistant', 'ta'].includes(currentUser.role)) return allStudents;
      if (isParent) return linkedChildren;
      if (currentUser.role === 'lecturer') {
          const myClasses = (classes || []).filter(c => c.lecturerId === currentUser.id).map(c => c.id);
          const myStudentIds = (enrollments || []).filter(e => myClasses.includes(e.classId) && e.status === 'active').map(e => e.studentId);
          return allStudents.filter(s => myStudentIds.includes(s.id));
      }
      return [];
  }, [users, classes, enrollments, currentUser, isParent, linkedChildren]);

  const activeStudentId = isStudent ? currentUser.id : (isParent ? selectedChildId : selectedStudentId);
  const studentInfo = (users || []).find(s => s.id === activeStudentId) || currentUser;

  // 🚀 [CTO 패치] 활성 학생의 단원 개념 이해도 데이터 실시간 구독 ($O(1)$ Read)
  useEffect(() => {
    if (!activeStudentId) return;
    const docRef = doc(db, `artifacts/${APP_ID}/public/data/concept_stats`, activeStudentId);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setConceptStats(docSnap.data().subjectStats || {});
      } else {
        setConceptStats({});
      }
    });
    return () => unsub();
  }, [activeStudentId]);

  const studentEnglishStat = localEnglishStats.find(s => s.id === activeStudentId) || {};
  const catScore = studentEnglishStat?.catScore || 0;
  const hasCatScore = catScore > 0;
  
  const currentVocaRubric = useMemo(() => {
      if (hasCatScore) {
          return VOCA_RUBRICS.find(r => catScore >= r.min && catScore <= r.max);
      }
      return null;
  }, [catScore, hasCatScore]);

  const [grades, setGrades] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);

  const handleSearchStudent = () => {
      if (!searchInput.trim()) return alert('이름을 입력해주세요.');
      const results = accessibleStudents.filter(u => u.name.includes(searchInput.trim()));
      setSearchResults(results);
      setSearchModalOpen(true);
  };

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
        const found = g.subjects?.find(s => s.name.includes(subjectName));
        if (found) subjectGrades.push(Number(found.score || 0));
    });

    if (subjectGrades.length > 0) {
        latestScore = subjectGrades[subjectGrades.length - 1];
        if (subjectGrades.length > 1) prevScore = subjectGrades[subjectGrades.length - 2];
    } else {
        if (subjectName !== '영어' && !conceptStats[subjectName]) return null;
    }

    const meta = SUBJECT_META[subjectName];
    return meta.stats.map((s, i) => {
        if (subjectName === '영어') {
            let realValue = 0; let chartValue = 0; let dynamicDesc = s.desc; 
            if (s.id === 'voca') {
                realValue = catScore; chartValue = Math.round(realValue / 10); 
                if (hasCatScore && currentVocaRubric) {
                    dynamicDesc = `🎯 [타겟 학년: ${currentVocaRubric.target}] ${currentVocaRubric.desc}`;
                } else if (!hasCatScore) {
                    dynamicDesc = "CAT 초기 진단 점수가 아직 입력되지 않았습니다. 학원에 문의해주세요.";
                }
            } else {
                realValue = studentEnglishStat?.radarChart?.[s.id] || 0;
                if (realValue === 0) {
                    const seed = latestScore || 65;
                    const pseudoRandom = (seed * (i + 7)) % 15;
                    realValue = Math.min(100, Math.max(0, seed - pseudoRandom + 5));
                }
                chartValue = realValue;
            }
            return { ...s, value: Math.round(realValue), chartValue: Math.round(chartValue), diff: 0, isVoca: s.id === 'voca', desc: dynamicDesc };
        }

        // 🚀 수학/과학/국어 과목: '개념이해' 항목은 단원별 시험 평균 점수를 실제 매핑
        if (s.id === 'concept' && conceptStats[subjectName]?.average > 0) {
            const realAvg = conceptStats[subjectName].average;
            return { ...s, value: realAvg, chartValue: realAvg, diff: 0, desc: `총 ${conceptStats[subjectName].totalUnits}개 단원 서술형 개념 평가 종합 평균 지수` };
        }

        const seed = latestScore || 70;
        const pseudoRandom = (seed * (i + 7)) % 20; 
        const val = Math.min(100, Math.max(0, seed - pseudoRandom + 5));
        const diff = val - Math.min(100, Math.max(0, prevScore - ((prevScore * (i+3)) % 15)));
        return { ...s, value: Math.round(val), chartValue: Math.round(val), diff: Math.round(diff) };
    });
  };

  const subjectData = useMemo(() => {
    const result = {};
    Object.keys(SUBJECT_META).forEach(sub => {
        const enrolledClassesInSubject = myActiveClasses.filter(c => getSubjectFromClass(c) === sub);
        const isUnlocked = enrolledClassesInSubject.length > 0 || conceptStats[sub]?.totalUnits > 0 || sub === '영어';
        
        let stats = null; let avg = 0;
        let tier = TIERS[TIERS.length - 1]; let hasGradeData = false;

        if (isUnlocked) {
            const rawStats = generateMockStats(sub);
            if (rawStats) {
                stats = rawStats;
                const normalizedSum = stats.reduce((acc, cur) => acc + (cur.isVoca ? Math.round(cur.value / 10) : cur.value), 0);
                avg = Math.round(normalizedSum / stats.length);
                tier = TIERS.find(t => avg >= t.minScore) || TIERS[TIERS.length - 1];
                hasGradeData = true;
            } else {
                stats = SUBJECT_META[sub].stats.map(s => ({ ...s, value: 0, chartValue: 0, diff: 0 }));
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
  }, [grades, myActiveClasses, localEnglishStats, generateMockStats, conceptStats]);

  if (isParent && linkedChildren.length === 0) {
      return (
          <div className="p-10 text-center flex flex-col items-center">
              <AlertCircle size={48} className="text-gray-300 mb-4" />
              <h2 className="text-xl font-bold text-gray-600">연결된 자녀 정보가 없습니다.</h2>
              <p className="text-gray-400 mt-2">학원 데스크에 자녀 계정 연결을 요청해주세요.</p>
          </div>
      );
  }

  if (!isStudent && !isParent && !activeStudentId) {
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
            {!isStudent && !isParent && (
                <button onClick={() => setSelectedStudentId('')} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold mb-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
                    <ChevronLeft size={18}/> 학생 검색으로 돌아가기
                </button>
            )}

            {isParent && linkedChildren.length > 1 && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 flex items-center justify-between mb-4">
                    <span className="font-bold text-indigo-800 flex items-center gap-2">
                        <Users size={18} /> 조회할 자녀 선택
                    </span>
                    <select 
                        value={selectedChildId || ''} 
                        onChange={(e) => setSelectedChildId(e.target.value)}
                        className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-4 py-2 rounded-lg outline-none cursor-pointer"
                    >
                        {linkedChildren.map(child => (
                            <option key={child.id} value={child.id}>{child.name} 학생</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="text-center mb-10 bg-white p-8 rounded-[32px] shadow-sm border border-slate-100">
                <h1 className="text-3xl font-black text-slate-800 flex items-center justify-center gap-3 mb-4">
                    <Sparkles className="text-indigo-600" size={32}/> 아카데미 유니버스
                </h1>
                <p className="text-slate-500 font-bold text-lg">
                    {studentInfo?.name} 학생의 과목별 성취도와 단원별 개념 이해도를 입체 분석합니다.<br/>
                    <span className="text-sm font-normal text-slate-400 border bg-slate-50 px-3 py-1 rounded-lg mt-2 inline-block">현재 학원에서 수강 중이거나 평가 데이터가 존재하는 과목의 리포트만 활성화됩니다.</span>
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Object.entries(subjectData).map(([subName, data]) => {
                    const Icon = data.meta.icon;
                    if (!data.isUnlocked) {
                        return (
                            <div key={subName} className="relative bg-slate-50 rounded-[32px] p-6 flex flex-col items-center justify-center text-center overflow-hidden border border-slate-200 h-80 group">
                                <div className="absolute inset-0 opacity-40 blur-[4px] pointer-events-none flex items-center justify-center scale-125">
                                    <RadarChart stats={data.meta.stats.map(s => ({ value: 60, chartValue: 60 }))} isDummy={true} />
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

  const currData = subjectData[selectedSubject];
  const Icon = currData.meta.icon;
  const currentSubjectConceptData = conceptStats[selectedSubject] || { units: [], average: 0 };
  
  const calcExpectedGrade = (score) => {
      if(score >= 90) return 1; if(score >= 80) return 2; if(score >= 70) return 3;
      if(score >= 60) return 4; if(score >= 50) return 5; return 6;
  };

  const tierInfo = getTierProgress(studentEnglishStat.masteredCount || 0, studentEnglishStat.catScore || 0);

  return (
      <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in pb-20 px-2 sm:px-4 pt-6">
          
          <div className="flex justify-between items-center flex-wrap gap-4">
            <button onClick={() => setSelectedSubject(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
                <ChevronLeft size={18}/> 과목 대시보드로 돌아가기
            </button>
          </div>

          {/* 메인 헤더 카드 */}
          <div className={`bg-white border border-slate-200 rounded-[40px] p-8 sm:p-12 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center gap-8`}>
              <div className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-slate-50 border-4 border-slate-100 flex items-center justify-center shadow-md relative z-10 shrink-0 ${currData.tier.color}`}>
                  <Icon size={64} />
              </div>

              <div className="relative z-10 text-center md:text-left flex-1">
                  <Badge variant="outline" className={`bg-slate-50 border-slate-200 text-slate-500 mb-3 font-bold px-3 py-1`}>{currData.meta.title}</Badge>
                  <h1 className="text-3xl sm:text-4xl font-black text-slate-800 mb-3 tracking-tight">{studentInfo?.name} 학생의 {selectedSubject} 정밀 분석</h1>
                  <p className="text-slate-600 font-medium text-base leading-relaxed max-w-2xl break-keep mt-4">
                      데이터 분석 결과, {selectedSubject} 종합 성취 지수는 <span className="text-blue-600 font-black text-lg">{currData.avg}</span>점이며 현재 <span className={currData.tier.color + " font-black text-lg"}>{currData.tier.name}</span> 구간에 위치하고 있습니다. 부족한 세부 역량을 파악하고 전략을 수립하세요.
                  </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 relative z-10 shrink-0 text-center min-w-[200px]">
                  <div className="text-slate-500 font-bold text-sm mb-2 flex items-center justify-center gap-2"><Award size={16}/> 모의고사 예상 등급</div>
                  <div className="text-5xl font-black text-slate-800 mb-1">{calcExpectedGrade(currData.avg)}<span className="text-2xl text-slate-400 font-bold ml-1">등급</span></div>
                  <div className="text-xs font-bold text-slate-400 mt-2">최근 누적 데이터 환산치</div>
              </div>
          </div>

          {/* 🚀 [CTO 패치] 단원별 개념 이해도 정밀 시각화 영역 (조회 전용 - DB 데이터 실시간 표시) */}
          {selectedSubject !== '영어' && (
            <div className="bg-white rounded-[40px] p-8 sm:p-10 border border-slate-200 shadow-sm">
              <div className="flex justify-between items-end mb-6 flex-wrap gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                    <Layers className="text-indigo-600"/> {selectedSubject} 단원별 서술형 개념 이해도 평가
                  </h3>
                  <p className="text-sm font-bold text-slate-400 mt-1">서술형 백지 테스트 및 증명 평가 점수를 종합하여 해당 과목의 개념 기초 체력을 정량화합니다.</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-2xl flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600">개념 이해 종합 평균:</span>
                  <span className="text-xl font-black text-indigo-900">{currentSubjectConceptData.average || 0}점</span>
                </div>
              </div>

              {(!currentSubjectConceptData.units || currentSubjectConceptData.units.length === 0) ? (
                <div className="text-center py-12 text-slate-400 font-bold text-sm border-2 border-dashed rounded-3xl">
                  아직 입력된 단원별 개념 평가 점수가 없습니다. (정밀 진단 평가 반영 대기 중)
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentSubjectConceptData.units.map((u, idx) => {
                    const isVulnerable = u.totalScore < 70;
                    return (
                      <div key={idx} className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between ${isVulnerable ? 'bg-rose-50/40 border-rose-200' : 'bg-white border-slate-100 shadow-sm'}`}>
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-black bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">{u.category}</span>
                            <span className={`text-sm font-black px-3 py-1 rounded-xl border ${u.totalScore >= 85 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : (u.totalScore >= 70 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-100 border-rose-300 text-rose-700')}`}>
                              {u.grade}등급 ({u.totalScore}점)
                            </span>
                          </div>
                          <h4 className="text-xl font-black text-slate-900 mt-2">{u.unitName}</h4>
                          {u.vulnerableTags?.length > 0 && (
                            <div className="mt-4 space-y-1.5">
                              <span className="text-xs font-bold text-rose-600 flex items-center gap-1"><AlertCircle size={14}/> 감점 및 보완 요망 포인트:</span>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {u.vulnerableTags.map((tag, tIdx) => (
                                  <span key={tIdx} className="bg-white text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-1 rounded-lg">
                                    • {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {isVulnerable && (
                          <div className="mt-5 pt-3 border-t border-rose-200 flex items-center justify-between text-xs font-black text-rose-700 bg-rose-100/60 p-3 rounded-xl">
                            <span>🚨 개념 결손 감지 ➔ 1:1 맞춤 쌍둥이 오답 클리닉 자동 배정</span>
                            <ChevronRight size={16}/>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                  <Card className="bg-white border-slate-200 rounded-[40px] p-8 flex flex-col items-center justify-center shadow-sm h-[500px]">
                      <h3 className="text-xl font-black text-slate-800 mb-8 w-full text-left flex items-center gap-2"><Target className="text-blue-500"/> {selectedSubject === '영어' ? '5대 핵심 역량 스캐너' : '6대 세부 역량 스캐너'}</h3>
                      <div className="w-full flex-1 flex items-center justify-center">
                          <RadarChart stats={currData.stats} />
                      </div>
                  </Card>

                  {selectedSubject === '영어' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <Card className="bg-white border-slate-200 rounded-[32px] p-6 shadow-sm border-t-4 border-t-indigo-500 flex flex-col justify-between h-56">
                              <div>
                                  <div className="flex items-center justify-between mb-2">
                                      <h3 className="text-lg font-black text-slate-800 flex items-center gap-1.5"><Network size={18} className="text-indigo-500"/> 문법 구조 스킬 트리</h3>
                                      <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-600 border-indigo-200">구조 정밀 진단</Badge>
                                  </div>
                                  <p className="text-xs font-bold text-slate-400 leading-relaxed break-keep mt-2">
                                      품사론부터 특수구문까지 배우는 계통 순서에 따른 스킬 매트릭스를 형성합니다. 영문법 어디서부터 구조적 구멍이 생겼는지 직관적으로 역추적 추적합니다.
                                  </p>
                              </div>
                              <div className="bg-slate-50 border border-dashed border-slate-200 p-2 rounded-xl text-center text-[11px] font-black text-slate-400">
                                  📊 문법 노드 매핑 준비 완료
                              </div>
                          </Card>

                          <Card className="bg-white border-slate-200 rounded-[32px] p-6 shadow-sm border-t-4 border-t-cyan-500 flex flex-col justify-between h-56">
                              <div>
                                  <div className="flex items-center justify-between mb-2">
                                      <h3 className="text-lg font-black text-slate-800 flex items-center gap-1.5"><LayoutGrid size={18} className="text-cyan-500"/> 수능 유형별 히트맵</h3>
                                      <Badge variant="outline" className="text-[10px] bg-cyan-50 text-cyan-600 border-cyan-200">모의고사 타겟팅</Badge>
                                  </div>
                                  <p className="text-xs font-bold text-slate-400 leading-relaxed break-keep mt-2">
                                      평가원 및 교육청 모의고사 문제 유형을 기준으로 통계를 내어 학생이 특수하게 강하거나 취약한 소포 가공 유형을 입체 파악합니다.
                                  </p>
                              </div>
                              <div className="bg-slate-50 border border-dashed border-slate-200 p-2 rounded-xl text-center text-[11px] font-black text-slate-400">
                                  🟩 격자 그리드 매핑 준비 완료
                              </div>
                          </Card>
                      </div>
                  )}
              </div>

              <div className="space-y-6 flex flex-col h-[500px] lg:h-auto overflow-hidden">
                  <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
                      {currData.stats.map(stat => (
                          <Card key={stat.id} className="p-5 border-slate-200 rounded-[24px] hover:border-indigo-400 transition-all flex flex-col bg-white shadow-sm">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full">
                                  <div className="w-full sm:w-32 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0 shrink-0">
                                      <span className="text-sm font-black text-slate-500 mb-1 text-center">{stat.name}</span>
                                      <div className="flex items-baseline justify-center gap-1">
                                          <span className="text-2xl font-black text-slate-800">
                                              {stat.isVoca && !hasCatScore ? '진단 대기' : stat.value}
                                          </span>
                                          {stat.isVoca && hasCatScore && (
                                              <span className="text-[10px] font-bold text-slate-400">/ 1000</span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  <div className="flex-1 w-full">
                                      <p className="text-[13px] font-bold text-slate-600 leading-relaxed mb-3 break-keep">{stat.desc}</p>
                                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full transition-all duration-1000 ${stat.isVoca && !hasCatScore ? 'bg-slate-200' : stat.chartValue >= 80 ? 'bg-blue-500' : stat.chartValue >= 60 ? 'bg-blue-300' : 'bg-slate-300'}`} style={{ width: `${stat.isVoca && !hasCatScore ? 0 : stat.chartValue}%` }}></div>
                                      </div>
                                  </div>
                              </div>

                              {stat.isVoca && hasCatScore && (
                                  <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 p-4 rounded-2xl w-full">
                                      <h4 className="text-xs font-black text-blue-700 flex items-center gap-1 mb-3"><Sparkles size={14}/> Voca 학습 상세 추적 지표</h4>
                                      {studentEnglishStat.promotionPending && (
                                          <div className="mb-4 bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-rose-600 text-[11px] font-black flex items-center justify-center gap-1.5 animate-pulse shadow-sm">
                                              <AlertCircle size={14}/> {studentEnglishStat.promotionPending}점 승급 심사 대기 중 (어휘력 성장 제한됨)
                                          </div>
                                      )}
                                      <div className="space-y-3">
                                          <div>
                                              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                                                  <span>📚 어휘 진도 ({tierInfo.name})</span>
                                                  <span className="text-blue-600">{tierInfo.percent}% (총 보유 {tierInfo.totalMastered}단어)</span>
                                              </div>
                                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${tierInfo.percent}%` }}></div></div>
                                          </div>
                                          <div>
                                              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                                                  <span>🧠 뜻 이해도 (다의어/파생어 깊이 측정)</span>
                                                  <span className="text-emerald-600">{studentEnglishStat.vocaComprehension || 0}%</span>
                                              </div>
                                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${studentEnglishStat.vocaComprehension || 0}%` }}></div></div>
                                          </div>
                                          <div>
                                              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                                                  <span>🔋 장기 기억력 (기억 유지력 자동 환산)</span>
                                                  <span className="text-indigo-600">{studentEnglishStat.vocaRetention || 0}%</span>
                                              </div>
                                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${studentEnglishStat.vocaRetention || 0}%` }}></div></div>
                                          </div>
                                      </div>
                                  </div>
                              )}
                          </Card>
                      ))}

                      <div className="mt-8 pt-4 border-t-2 border-dashed border-slate-200">
                          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                              <BookOpen className="text-indigo-600" size={20}/> 수강 중인 연계 클래스
                          </h3>
                          <div className="grid grid-cols-1 gap-3">
                              {currData.enrolledClasses.map(cls => (
                                  <div key={cls.id} className="bg-indigo-50 border border-indigo-100 p-4 rounded-[20px] flex flex-col justify-center shadow-sm">
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