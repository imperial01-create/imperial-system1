/* [서비스 가치] 입시 내비게이터 2.0 (독립 메뉴판) - 
   관리자는 학생을 직접 선택하여 시뮬레이션을 진행할 수 있으며, 
   동석차 계산, AI 파싱, 로고 깨짐 방지 등 모든 기능이 완벽하게 독립 구동됩니다. */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Compass, TrendingUp, Camera, CheckCircle, Edit2, ChevronRight, Award, 
  X, Plus, Loader, History, Search, ArrowRight, Trash2, Users
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { Button, Card, Badge, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

// --- 대학 로고 맵 (위키백과 등 공용 URL) ---
const UNIV_LOGOS = {
  "서울대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/4/44/Seoul_National_University_emblem.svg/200px-Seoul_National_University_emblem.svg.png",
  "연세대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/e/e0/Yonsei_University_emblem.svg/200px-Yonsei_University_emblem.svg.png",
  "고려대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/4/4b/Korea_University_emblem.png/200px-Korea_University_emblem.png",
  "성균관대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/c/cd/Sungkyunkwan_University_emblem.svg/200px-Sungkyunkwan_University_emblem.svg.png",
  "한양대학교": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Hanyang_University_emblem.svg/200px-Hanyang_University_emblem.svg.png",
  "중앙대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/5/52/Chung-Ang_University_emblem.svg/200px-Chung-Ang_University_emblem.svg.png",
  "경희대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/e/e8/Kyung_Hee_University_emblem.png/200px-Kyung_Hee_University_emblem.png",
  "건국대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/f/f6/Konkuk_University_emblem.png/200px-Konkuk_University_emblem.png",
  "동국대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/b/b3/Dongguk_University_emblem.png/200px-Dongguk_University_emblem.png",
  "홍익대학교": "https://upload.wikimedia.org/wikipedia/ko/thumb/e/ef/Hongik_University_emblem.png/200px-Hongik_University_emblem.png"
};

const SUSI_DB = [
  { level: 1, primaryUniv: "서울대학교 (의예)", minGrade: 1.00, maxGrade: 1.02, tierName: "전국 최상위 메디컬" },
  { level: 2, primaryUniv: "연세대학교 (의예)", minGrade: 1.02, maxGrade: 1.04, tierName: "메이저 의대" },
  { level: 3, primaryUniv: "경희대학교 (의예/치의예)", minGrade: 1.04, maxGrade: 1.06, tierName: "인서울 의치한" },
  { level: 4, primaryUniv: "가천대학교 (의예/약학)", minGrade: 1.06, maxGrade: 1.08, tierName: "수도권 의약학" },
  { level: 5, primaryUniv: "서울대학교", minGrade: 1.08, maxGrade: 1.12, tierName: "최상위 종합대" },
  { level: 6, primaryUniv: "연세대학교", minGrade: 1.12, maxGrade: 1.16, tierName: "SKY" },
  { level: 7, primaryUniv: "고려대학교", minGrade: 1.16, maxGrade: 1.20, tierName: "SKY" },
  { level: 8, primaryUniv: "서강대학교", minGrade: 1.20, maxGrade: 1.25, tierName: "서성한" },
  { level: 9, primaryUniv: "성균관대학교", minGrade: 1.25, maxGrade: 1.30, tierName: "서성한" },
  { level: 10, primaryUniv: "한양대학교", minGrade: 1.30, maxGrade: 1.35, tierName: "서성한" },
  { level: 11, primaryUniv: "중앙대학교", minGrade: 1.35, maxGrade: 1.40, tierName: "중경외시" },
  { level: 12, primaryUniv: "경희대학교", minGrade: 1.40, maxGrade: 1.45, tierName: "중경외시" },
  { level: 13, primaryUniv: "서울시립대학교", minGrade: 1.45, maxGrade: 1.50, tierName: "중경외시" },
  { level: 14, primaryUniv: "한국외국어대학교", minGrade: 1.50, maxGrade: 1.55, tierName: "중경외시" },
  { level: 15, primaryUniv: "이화여자대학교", minGrade: 1.55, maxGrade: 1.60, tierName: "최상위 여대" },
  { level: 16, primaryUniv: "건국대학교", minGrade: 1.60, maxGrade: 1.68, tierName: "건동홍숙" },
  { level: 17, primaryUniv: "동국대학교", minGrade: 1.68, maxGrade: 1.76, tierName: "건동홍숙" },
  { level: 18, primaryUniv: "홍익대학교", minGrade: 1.76, maxGrade: 1.84, tierName: "건동홍숙" },
  { level: 19, primaryUniv: "숙명여자대학교", minGrade: 1.84, maxGrade: 1.92, tierName: "건동홍숙" },
  { level: 20, primaryUniv: "국민대학교", minGrade: 1.92, maxGrade: 2.00, tierName: "국숭세단" },
  { level: 21, primaryUniv: "숭실대학교", minGrade: 2.00, maxGrade: 2.10, tierName: "국숭세단" },
  { level: 22, primaryUniv: "세종대학교", minGrade: 2.10, maxGrade: 2.20, tierName: "국숭세단" },
  { level: 23, primaryUniv: "단국대학교", minGrade: 2.20, maxGrade: 2.30, tierName: "국숭세단" },
  { level: 24, primaryUniv: "인하대학교", minGrade: 2.30, maxGrade: 2.45, tierName: "수도권 주요" },
  { level: 25, primaryUniv: "광운대학교", minGrade: 2.45, maxGrade: 2.60, tierName: "인서울 중위" },
  { level: 26, primaryUniv: "부산대학교", minGrade: 2.60, maxGrade: 2.80, tierName: "지거국 최상위" },
  { level: 27, primaryUniv: "가천대학교", minGrade: 2.80, maxGrade: 3.00, tierName: "수도권 중위" },
  { level: 28, primaryUniv: "충남대학교", minGrade: 3.00, maxGrade: 3.50, tierName: "지거국 주요" },
  { level: 29, primaryUniv: "지방 주요 4년제", minGrade: 3.50, maxGrade: 5.01, tierName: "기타 대학" }
];

const JUNGSI_DB = [
    { level: 1, primaryUniv: "서울대학교 (의예)", minGrade: 1.00, maxGrade: 1.03, tierName: "전국 최상위 메디컬" },
    { level: 2, primaryUniv: "연세대학교 (의예)", minGrade: 1.03, maxGrade: 1.06, tierName: "메이저 의대" },
    { level: 3, primaryUniv: "가톨릭대학교 (의예)", minGrade: 1.06, maxGrade: 1.09, tierName: "인서울 의치한약" },
    { level: 4, primaryUniv: "가천대학교 (의예/약학)", minGrade: 1.09, maxGrade: 1.13, tierName: "수도권/지방 의약학" },
    { level: 5, primaryUniv: "서울대학교", minGrade: 1.13, maxGrade: 1.25, tierName: "최상위 종합대" },
    { level: 6, primaryUniv: "연세대학교", minGrade: 1.25, maxGrade: 1.35, tierName: "SKY" },
    { level: 7, primaryUniv: "고려대학교", minGrade: 1.35, maxGrade: 1.45, tierName: "SKY" },
    { level: 8, primaryUniv: "서강대학교", minGrade: 1.45, maxGrade: 1.55, tierName: "서성한" },
    { level: 9, primaryUniv: "성균관대학교", minGrade: 1.55, maxGrade: 1.65, tierName: "서성한" },
    { level: 10, primaryUniv: "한양대학교", minGrade: 1.65, maxGrade: 1.75, tierName: "서성한" },
    { level: 11, primaryUniv: "중앙대학교", minGrade: 1.75, maxGrade: 1.85, tierName: "중경외시" },
    { level: 12, primaryUniv: "경희대학교", minGrade: 1.85, maxGrade: 1.95, tierName: "중경외시" },
    { level: 13, primaryUniv: "서울시립대학교", minGrade: 1.95, maxGrade: 2.05, tierName: "중경외시" },
    { level: 14, primaryUniv: "한국외국어대학교", minGrade: 2.05, maxGrade: 2.15, tierName: "중경외시" },
    { level: 15, primaryUniv: "이화여자대학교", minGrade: 2.15, maxGrade: 2.25, tierName: "최상위 여대" },
    { level: 16, primaryUniv: "건국대학교", minGrade: 2.25, maxGrade: 2.35, tierName: "건동홍숙" },
    { level: 17, primaryUniv: "동국대학교", minGrade: 2.35, maxGrade: 2.45, tierName: "건동홍숙" },
    { level: 18, primaryUniv: "홍익대학교", minGrade: 2.45, maxGrade: 2.55, tierName: "건동홍숙" },
    { level: 19, primaryUniv: "숙명여자대학교", minGrade: 2.55, maxGrade: 2.65, tierName: "건동홍숙" },
    { level: 20, primaryUniv: "국민대학교", minGrade: 2.65, maxGrade: 2.75, tierName: "국숭세단" },
    { level: 21, primaryUniv: "숭실대학교", minGrade: 2.75, maxGrade: 2.85, tierName: "국숭세단" },
    { level: 22, primaryUniv: "세종대학교", minGrade: 2.85, maxGrade: 2.95, tierName: "국숭세단" },
    { level: 23, primaryUniv: "단국대학교", minGrade: 2.95, maxGrade: 3.05, tierName: "국숭세단" },
    { level: 24, primaryUniv: "인하대학교", minGrade: 3.05, maxGrade: 3.15, tierName: "수도권 주요" },
    { level: 25, primaryUniv: "아주대학교", minGrade: 3.15, maxGrade: 3.25, tierName: "수도권 주요" },
    { level: 26, primaryUniv: "부산대학교", minGrade: 3.25, maxGrade: 3.40, tierName: "지거국 상위" },
    { level: 27, primaryUniv: "경북대학교", minGrade: 3.40, maxGrade: 3.55, tierName: "지거국 상위" },
    { level: 28, primaryUniv: "광운대학교", minGrade: 3.55, maxGrade: 3.70, tierName: "광명상가" },
    { level: 29, primaryUniv: "가천대학교", minGrade: 3.70, maxGrade: 3.85, tierName: "인가경" },
    { level: 30, primaryUniv: "충남대학교", minGrade: 3.85, maxGrade: 4.05, tierName: "지거국 중위" },
    { level: 31, primaryUniv: "전남대학교", minGrade: 4.05, maxGrade: 4.25, tierName: "지거국 중위" },
    { level: 32, primaryUniv: "경기대학교", minGrade: 4.25, maxGrade: 4.50, tierName: "수도권 중위" },
    { level: 33, primaryUniv: "한성대학교", minGrade: 4.50, maxGrade: 4.80, tierName: "인서울 하위/수도권" },
    { level: 34, primaryUniv: "지방 거점 국립대", minGrade: 4.80, maxGrade: 5.50, tierName: "지거국 하위" },
    { level: 35, primaryUniv: "지방 주요 4년제", minGrade: 5.50, maxGrade: 9.01, tierName: "기타 대학" }
  ];

const CollegeNavigator = ({ currentUser }) => {
  const { users } = useData();
  const isAdminView = ['admin', 'admin_assistant'].includes(currentUser?.role);
  
  // 🚀 [CTO 패치] 관리자용 학생 리스트 및 선택기 로직
  const studentList = useMemo(() => (users || []).filter(u => u.role === 'student'), [users]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  const activeStudentId = isAdminView ? selectedStudentId : currentUser.id;
  const studentInfo = isAdminView ? studentList.find(s => s.id === activeStudentId) : currentUser;

  const [grades, setGrades] = useState([]);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [isUpperListOpen, setIsUpperListOpen] = useState(false);
  
  const fileInputRef = useRef(null);

  // --- 성적 입력 폼 ---
  const initForm = { 
      id: null, type: 'school', termGrade: '1학년', termExam: '1학기 중간고사', 
      subjects: [{ name: '', score: '', rank: '', tiedRank: '', total: '', grade: '' }] 
  };
  const [inputForm, setInputForm] = useState(initForm);

  // --- DB 연동 ---
  useEffect(() => {
    if (!activeStudentId) {
        setGrades([]); // 선택 해제 시 성적 초기화
        return;
    }
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), where('studentId', '==', activeStudentId));
    const unsub = onSnapshot(q, (snapshot) => {
        setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.createdAt?.seconds - b.createdAt?.seconds));
    });
    return () => unsub();
  }, [activeStudentId]);

  // --- 5등급제 정밀 계산 ---
  const calc5Grade = (rank, tiedRank, total) => {
      if (!rank || !total) return '';
      const r = Number(rank);
      const tr = Number(tiedRank) || 1; 
      const t = Number(total);
      if (t <= 0) return '';
      
      const midRank = r + (tr - 1) / 2;
      const pct = (midRank / t) * 100;
      
      if (pct <= 10) return 1; if (pct <= 34) return 2; if (pct <= 66) return 3; if (pct <= 90) return 4; return 5;
  };

  const handleSubjectChange = (idx, field, val) => {
      const newSubjects = [...inputForm.subjects];
      newSubjects[idx][field] = val;
      if (inputForm.type === 'school' && (field === 'rank' || field === 'tiedRank' || field === 'total')) {
          newSubjects[idx].grade = calc5Grade(newSubjects[idx].rank, newSubjects[idx].tiedRank, newSubjects[idx].total) || newSubjects[idx].grade;
      }
      setInputForm({ ...inputForm, subjects: newSubjects });
  };

  // 🚀 [CTO 패치] 폼 휴지통 삭제 기능 오류 해결
  const handleRemoveSubject = (idx) => {
      setInputForm(prev => ({
          ...prev, 
          subjects: prev.subjects.filter((_, i) => i !== idx)
      }));
  };

  const handleEditEntry = (g) => {
      let parsedGrade = '1학년';
      let parsedExam = '1학기 중간고사';
      if (g.term) {
          const parts = g.term.split(' ');
          if (parts.length >= 2) {
              parsedGrade = parts[0];
              parsedExam = parts.slice(1).join(' ');
          }
      }
      setInputForm({ 
          id: g.id, type: g.type, termGrade: parsedGrade, termExam: parsedExam, 
          subjects: g.subjects || [] 
      });
      setIsInputOpen(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileChange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setIsOcrLoading(true);
      try {
          const reader = new FileReader();
          reader.onloadend = async () => {
              const parseFn = httpsCallable(functions, 'parseReportCard');
              const result = await parseFn({ fileData: reader.result, type: inputForm.type });
              const parsedSubjects = (result.data.subjects || []).map(sub => ({
                  ...sub, grade: inputForm.type === 'school' ? calc5Grade(sub.rank, sub.tiedRank, sub.total) || sub.grade : sub.grade
              }));
              setInputForm(prev => ({ ...prev, subjects: parsedSubjects }));
              setIsOcrLoading(false);
          };
          reader.readAsDataURL(file);
      } catch (error) { alert(error.message); setIsOcrLoading(false); }
  };

  const handleSaveGrade = async () => {
      const validSubjects = inputForm.subjects.filter(s => s.name && s.grade);
      if (validSubjects.length === 0) return alert('과목명과 등급을 정확히 입력해주세요.');
      try {
          const combinedTerm = `${inputForm.termGrade} ${inputForm.termExam}`;
          const payload = {
              studentId: activeStudentId, type: inputForm.type, term: combinedTerm,
              subjects: validSubjects, isLocked: !isAdminView, updatedAt: serverTimestamp()
          };
          
          if (inputForm.id) {
              await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'grades', inputForm.id), payload);
          } else {
              payload.createdAt = serverTimestamp();
              await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), payload);
          }
          setIsInputOpen(false); setInputForm(initForm);
      } catch(e) { alert(e.message); }
  };

  const avgGrades = useMemo(() => {
      const calcAvg = (type) => {
          const arr = grades.filter(g => g.type === type);
          if(arr.length === 0) return 0;
          let sum = 0, count = 0;
          arr.forEach(g => { (g.subjects || []).forEach(s => { 
              if (s.grade && !isNaN(Number(s.grade))) { sum += Number(s.grade); count++; }
          }); });
          return count > 0 ? (sum / count).toFixed(2) : 0;
      };
      return { school: Number(calcAvg('school')), mock: Number(calcAvg('mock')) };
  }, [grades]);

  const getUniversities = (score, isSusi) => {
      if (!score || score === 0) return null;
      const DB = isSusi ? SUSI_DB : JUNGSI_DB;
      let matchIdx = DB.findIndex(univ => score >= univ.minGrade && score < univ.maxGrade);
      if (matchIdx === -1) matchIdx = score < DB[0].minGrade ? 0 : DB.length - 1;
      return { 
          up: DB[Math.max(0, matchIdx - 2)], 
          match: DB[matchIdx], 
          down: DB[Math.min(DB.length - 1, matchIdx + 2)], 
          score, type: isSusi ? '수시' : '정시' 
      };
  };

  const susiResult = getUniversities(avgGrades.school, true);
  const jungsiResult = getUniversities(avgGrades.mock, false);

  const upperUnivList = useMemo(() => {
      if (!susiResult) return [];
      const matchIdx = SUSI_DB.findIndex(u => u.primaryUniv === susiResult.match.primaryUniv);
      return SUSI_DB.slice(Math.max(0, matchIdx - 5), matchIdx);
  }, [susiResult]);

  // --- UI Components ---
  const renderGraph = (type) => {
      const targetGrades = grades.filter(g => g.type === type);
      if (targetGrades.length < 2) return <div className="text-center text-sm text-gray-400 py-8 bg-gray-50 rounded-xl border border-dashed w-full mx-4 flex items-center justify-center">데이터가 2회 이상 누적되면 생성됩니다.</div>;

      const maxGrade = type === 'school' ? 5 : 9;
      const points = targetGrades.map((g, i) => {
          let sum = 0, count = 0; 
          (g.subjects || []).forEach(s => { if(s.grade && !isNaN(Number(s.grade))) { sum += Number(s.grade); count++; }});
          const avg = count > 0 ? sum / count : 0;
          const y = ((avg - 1) / Math.max(1, maxGrade - 1)) * 100; 
          return { x: i * (100 / Math.max(1, targetGrades.length - 1)), y, term: g.term, avg: avg.toFixed(1) };
      });

      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

      return (
          <div className="relative w-full h-40 pt-4 pb-6 px-8 flex-1">
              <svg className="w-full h-full overflow-visible" viewBox="0 -10 100 120" preserveAspectRatio="none">
                  <line x1="0" y1="0" x2="100" y2="0" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="2,2" />
                  <line x1="0" y1="100" x2="100" y2="100" stroke="#f1f5f9" strokeWidth="1" />
                  <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {points.map((p, i) => (
                      <g key={i}>
                          <circle cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke="#4f46e5" strokeWidth="2" />
                          <text x={p.x} y={p.y - 8} fontSize="4.5" fontWeight="bold" fill="#4f46e5" textAnchor="middle">{p.avg}</text>
                          <text x={p.x} y={115} fontSize="4" fill="#64748b" textAnchor="middle" fontWeight="bold">{p.term}</text>
                      </g>
                  ))}
              </svg>
          </div>
      );
  };

  const renderUnivCard = (data, category, typeLabel, currentScore) => {
      if (!data) return <div className="h-24 bg-gray-50 rounded-xl border border-dashed flex items-center justify-center text-gray-400 text-sm font-bold">데이터 부족</div>;
      const isUp = category === '상향';
      const isMatch = category === '적정';
      const logoUrl = UNIV_LOGOS[data.primaryUniv.split(' ')[0]];
      
      // 🚀 [CTO 패치] 이미지 깨짐 텍스트 대체 안전장치 (onError)
      const handleImageError = (e) => {
          e.target.style.display = 'none';
          if (e.target.nextElementSibling) {
              e.target.nextElementSibling.style.display = 'flex';
          }
      };

      return (
          <div 
            onClick={() => setSelectedTarget({ ...data, category, typeLabel, score: currentScore })}
            className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 overflow-hidden group
                ${isUp ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200' : isMatch ? 'bg-gradient-to-br from-blue-50 to-white border-blue-200' : 'bg-gradient-to-br from-slate-50 to-white border-slate-200'}
            `}
          >
              <div className="flex justify-between items-start mb-2 relative z-10">
                  <Badge variant={isUp ? 'secondary' : isMatch ? 'primary' : 'outline'} className="shadow-sm">{category} 지원</Badge>
                  <span className="text-[10px] font-black text-gray-400">{data.tierName}</span>
              </div>
              <div className="flex items-center gap-3 relative z-10 mt-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-slate-400 font-black text-xs shadow-md shrink-0 bg-white border border-gray-100 p-1.5 relative">
                      {logoUrl ? (
                          <>
                              <img src={logoUrl} className="w-full h-full object-contain" alt="logo" onError={handleImageError} />
                              <span style={{display: 'none'}} className="absolute inset-0 flex items-center justify-center bg-slate-50 rounded-full">{data.primaryUniv.substring(0,2)}</span>
                          </>
                      ) : <span className="absolute inset-0 flex items-center justify-center bg-slate-50 rounded-full">{data.primaryUniv.substring(0,2)}</span>}
                  </div>
                  <h4 className="font-black text-gray-900 text-lg md:text-xl leading-tight">{data.primaryUniv}</h4>
              </div>
          </div>
      );
  };

  // --- 관리자 선택 UI 렌더링 ---
  if (isAdminView && !activeStudentId) {
      return (
        <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in pb-20 px-2 sm:px-4">
            <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl">
                <h1 className="text-3xl font-black mb-2 flex items-center gap-3"><Compass className="text-blue-400" size={32}/> 입시 상담실 (관리자 모드)</h1>
                <p className="text-slate-400 font-bold mb-6">아래에서 상담할 학생을 선택해 주세요.</p>
                <div className="flex items-center gap-4 bg-white/10 p-2 rounded-2xl border border-white/20 max-w-lg">
                    <Users className="ml-4 text-white/50" />
                    <select 
                        className="w-full p-4 bg-transparent text-white font-bold outline-none appearance-none"
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                    >
                        <option value="" className="text-gray-900">학생을 선택해주세요</option>
                        {studentList.map(s => <option key={s.id} value={s.id} className="text-gray-900">{s.name} ({s.schoolName || '학교미상'})</option>)}
                    </select>
                </div>
            </div>
            <div className="text-center py-20 text-gray-400 font-bold">학생을 선택하면 성적 데이터와 6-Block 대학 분석이 표시됩니다.</div>
        </div>
      );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in pb-20 px-2 sm:px-4">
        
        {/* 상단 통합 대시보드 Header */}
        <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] shadow-2xl relative overflow-hidden">
            <div className="absolute right-0 top-0 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px]"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black mb-2 flex items-center gap-3"><Compass className="text-blue-400" size={32}/> {studentInfo?.name || '학생'} 입시 상담실</h1>
                    <p className="text-slate-400 font-bold text-sm sm:text-base">현재 위치를 진단하고 상위 대학 진입을 위한 실질적인 Gap을 분석합니다.</p>
                </div>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <Button onClick={() => setIsInputOpen(!isInputOpen)} className="bg-white text-slate-900 hover:bg-slate-100 font-black px-6 py-3 sm:px-8 sm:py-4 rounded-2xl shadow-xl flex-1 md:flex-none justify-center">
                        {isInputOpen ? '닫기' : '새로운 성적 입력'}
                    </Button>
                    {isAdminView && (
                        <Button variant="secondary" onClick={() => setSelectedStudentId('')} className="bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-bold px-6 py-3 sm:px-6 sm:py-4 rounded-2xl flex-1 md:flex-none justify-center">다른 학생 선택</Button>
                    )}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* 좌측: 과거 성적 히스토리 */}
            <div className="lg:col-span-1 space-y-6">
                <Card className="p-5 sm:p-6 border-none shadow-sm bg-white rounded-3xl">
                    <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4"><History size={20} className="text-blue-600"/> 기존 성적 내역</h3>
                    <p className="text-xs text-slate-400 font-bold mb-4 bg-slate-50 p-2 rounded-lg">클릭 시 우측 폼으로 불러와 점수를 수정/시뮬레이션 할 수 있습니다.</p>
                    <div className="space-y-3">
                        {grades.length === 0 ? <p className="text-center py-10 text-slate-400 font-bold">등록된 성적이 없습니다.</p> :
                        grades.map(g => {
                            const avg = g.subjects.length > 0 ? (g.subjects.reduce((a,b)=>a+(Number(b.grade)||0),0)/g.subjects.length).toFixed(2) : '-';
                            return (
                            <div key={g.id} onClick={() => handleEditEntry(g)} className={`p-4 rounded-2xl border transition-all cursor-pointer group ${inputForm.id === g.id ? 'bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-100' : 'bg-slate-50 border-slate-100 hover:border-blue-200'}`}>
                                <div className={`text-[10px] font-black mb-1 ${g.type==='school'?'text-indigo-500':'text-blue-500'}`}>{g.type === 'school' ? '학교내신' : '모의고사'}</div>
                                <div className="font-black text-slate-800 text-sm sm:text-base">{g.term}</div>
                                <div className="text-sm font-bold text-slate-500 mt-1">평균 <span className="text-slate-800">{avg}</span>등급</div>
                            </div>
                        )})}
                    </div>
                </Card>
            </div>

            {/* 우측: 메인 분석 및 입력 영역 */}
            <div className="lg:col-span-3 space-y-8">
                {isInputOpen && (
                    <Card className="border-4 border-blue-600 shadow-2xl p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] animate-in slide-in-from-top-4">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-blue-900">{inputForm.id ? '성적 수정 및 시뮬레이션' : '새로운 성적 등록'}</h3>
                            <button onClick={()=>setIsInputOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"><X size={20}/></button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div><label className="block text-xs font-black text-slate-500 mb-2">시험구분</label><select className="w-full border-2 rounded-2xl p-3 bg-slate-50 font-black text-blue-600 outline-none" value={inputForm.type} onChange={e => setInputForm({...inputForm, type: e.target.value})}><option value="school">내신 5등급제</option><option value="mock">모의고사 9등급제</option></select></div>
                            <div><label className="block text-xs font-black text-slate-500 mb-2">학년</label><select className="w-full border-2 rounded-2xl p-3 bg-white font-black outline-none" value={inputForm.termGrade} onChange={e => setInputForm({...inputForm, termGrade: e.target.value})}><option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option><option value="N수생">N수생</option></select></div>
                            <div><label className="block text-xs font-black text-slate-500 mb-2">종류</label><select className="w-full border-2 rounded-2xl p-3 bg-white font-black outline-none" value={inputForm.termExam} onChange={e => setInputForm({...inputForm, termExam: e.target.value})}><option value="1학기 중간고사">1학기 중간고사</option><option value="1학기 기말고사">1학기 기말고사</option><option value="2학기 중간고사">2학기 중간고사</option><option value="2학기 기말고사">2학기 기말고사</option><option value="모의고사">모의고사</option></select></div>
                        </div>

                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div>
                                <h4 className="font-black text-indigo-900 mb-1 flex items-center gap-2"><Camera size={18}/> 성적표 사진(리로스쿨) 자동 파싱</h4>
                                <p className="text-xs text-indigo-700 font-bold">1초 만에 사진에서 과목명, 합계점수, 석차를 모두 추출합니다.</p>
                            </div>
                            <Button variant="secondary" className="bg-white text-indigo-600 border-indigo-200 shadow-sm w-full md:w-auto font-black" onClick={() => fileInputRef.current.click()} disabled={isOcrLoading}>
                                {isOcrLoading ? <Loader className="animate-spin" size={18}/> : '사진 업로드'}
                            </Button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={handleFileChange}/>
                        </div>
                        
                        <div className="space-y-3 mb-8">
                            <div className="hidden md:flex gap-2 text-xs font-black text-slate-400 px-2">
                                <div className="flex-1">과목명</div>
                                <div className="w-24 text-center">원점수</div>
                                {inputForm.type === 'school' && <div className="w-48 text-center">석차 / 동석 / 인원</div>}
                                <div className="w-24 text-center">등급</div>
                                <div className="w-10"></div>
                            </div>
                            {inputForm.subjects.map((sub, idx) => (
                                <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-center bg-slate-50 p-2 sm:p-3 rounded-2xl border border-slate-200 transition-all hover:border-blue-300">
                                    <input className="w-full md:flex-1 border-none bg-white p-3 rounded-xl font-black text-sm md:text-base outline-none focus:ring-2 focus:ring-blue-100" placeholder="과목명" value={sub.name} onChange={e=>handleSubjectChange(idx, 'name', e.target.value)}/>
                                    <input className="w-[calc(50%-4px)] md:w-24 border-none bg-white p-3 rounded-xl font-black text-center text-sm outline-none" placeholder="원점수" value={sub.score} onChange={e=>handleSubjectChange(idx, 'score', e.target.value)}/>
                                    
                                    {inputForm.type === 'school' && (
                                        <div className="w-full md:w-48 flex items-center gap-1 bg-white px-2 rounded-xl border border-transparent focus-within:border-blue-200">
                                            <input className="w-full p-3 font-bold text-center text-sm bg-transparent outline-none" placeholder="석차" value={sub.rank} onChange={e=>handleSubjectChange(idx, 'rank', e.target.value)}/>
                                            <span className="text-slate-300">/</span>
                                            <input className="w-full p-3 font-bold text-center text-sm bg-transparent outline-none" placeholder="동석" value={sub.tiedRank} onChange={e=>handleSubjectChange(idx, 'tiedRank', e.target.value)}/>
                                            <span className="text-slate-300">/</span>
                                            <input className="w-full p-3 font-bold text-center text-sm bg-transparent outline-none" placeholder="인원" value={sub.total} onChange={e=>handleSubjectChange(idx, 'total', e.target.value)}/>
                                        </div>
                                    )}
                                    
                                    <input className={`w-[calc(50%-4px)] md:w-24 border-none p-3 rounded-xl font-black text-center text-sm md:text-base outline-none ${sub.grade ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-800'}`} placeholder="등급" value={sub.grade} onChange={e=>handleSubjectChange(idx, 'grade', e.target.value)}/>
                                    
                                    <button onClick={() => handleRemoveSubject(idx)} className="w-full md:w-10 p-3 flex justify-center text-slate-300 hover:text-red-500 bg-white rounded-xl md:bg-transparent"><Trash2 size={20}/></button>
                                </div>
                            ))}
                            <Button variant="ghost" onClick={() => setInputForm(prev=>({...prev, subjects: [...prev.subjects, {name:'', score:'', rank:'', tiedRank:'', total:'', grade:''}]}))} className="text-blue-600 font-bold mt-2"><Plus size={16} className="mr-1"/> 과목 추가</Button>
                        </div>
                        
                        <Button className="w-full py-5 text-lg font-black bg-blue-600 hover:bg-blue-700 shadow-xl rounded-2xl" onClick={handleSaveGrade}>
                            {inputForm.id ? '수정 및 시뮬레이션 적용' : '성적 안전하게 저장하기'}
                        </Button>
                    </Card>
                )}

                {/* 그래프 2종 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="flex flex-col h-64 sm:h-72 p-4 sm:p-6 rounded-[32px] border-none shadow-sm bg-white">
                        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-2"><TrendingUp size={20} className="text-indigo-600"/> 내신성적 성장 곡선</h3>
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden">
                            {renderGraph('school')}
                        </div>
                    </Card>
                    <Card className="flex flex-col h-64 sm:h-72 p-4 sm:p-6 rounded-[32px] border-none shadow-sm bg-white">
                        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-2"><TrendingUp size={20} className="text-blue-600"/> 모의고사 성장 곡선</h3>
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden">
                            {renderGraph('mock')}
                        </div>
                    </Card>
                </div>

                {/* 6-Block 대학 추천 시스템 */}
                <Card className="p-0 overflow-hidden border-none shadow-xl bg-slate-100 rounded-[32px]">
                    <div className="p-6 sm:p-8 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Award className="text-rose-500" size={28}/> 나의 목표 대학 6-Block</h3>
                        <div className="text-sm font-black text-slate-500 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200">
                            내신 평균: <span className="text-indigo-600 text-lg">{avgGrades.school > 0 ? avgGrades.school : '-'}</span> / 모의 평균: <span className="text-blue-600 text-lg">{avgGrades.mock > 0 ? avgGrades.mock : '-'}</span>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-slate-200">
                        {/* 수시 섹션 */}
                        <div className="bg-slate-50 p-6 sm:p-8 space-y-4">
                            <div className="flex justify-between items-center mb-6">
                                <div><h2 className="text-xl font-black text-slate-800">수시 지원 (내신)</h2></div>
                                <Button size="sm" variant="outline" className="rounded-xl font-bold border-indigo-200 text-indigo-600 bg-white" onClick={() => setIsUpperListOpen(true)}>상향 대학 리스트 <ChevronRight size={16}/></Button>
                            </div>
                            {['상향', '적정', '하향'].map(cat => {
                                const data = cat === '상향' ? susiResult?.up : cat === '적정' ? susiResult?.match : susiResult?.down;
                                return renderUnivCard(data, cat, '수시 내신', susiResult?.score);
                            })}
                        </div>
                        
                        {/* 정시 섹션 */}
                        <div className="bg-slate-50 p-6 sm:p-8 space-y-4">
                            <div className="flex justify-between items-center mb-6">
                                <div><h2 className="text-xl font-black text-slate-800">정시 지원 (수능)</h2></div>
                            </div>
                            {['상향', '적정', '하향'].map(cat => {
                                const data = cat === '상향' ? jungsiResult?.up : cat === '적정' ? jungsiResult?.match : jungsiResult?.down;
                                return renderUnivCard(data, cat, '정시 모의', jungsiResult?.score);
                            })}
                        </div>
                    </div>
                </Card>

            </div>
        </div>

        {/* 정밀 분석 팝업 (Gap Analysis) */}
        <Modal isOpen={!!selectedTarget} onClose={() => setSelectedTarget(null)} title={`${selectedTarget?.primaryUniv} 목표 분석`}>
            {selectedTarget && (
                <div className="text-center p-2 sm:p-6">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full bg-white flex items-center justify-center shadow-xl mb-6 ring-4 ring-slate-100 p-2 relative overflow-hidden">
                        {UNIV_LOGOS[selectedTarget.primaryUniv.split(' ')[0]] ? (
                            <>
                                <img src={UNIV_LOGOS[selectedTarget.primaryUniv.split(' ')[0]]} className="w-full h-full object-contain" alt="logo" onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }}/>
                                <span style={{display: 'none'}} className="absolute inset-0 flex items-center justify-center bg-slate-50 rounded-full text-slate-400 font-black text-3xl">{selectedTarget.primaryUniv.substring(0,2)}</span>
                            </>
                        ) : <span className="text-slate-400 font-black text-3xl">{selectedTarget.primaryUniv.substring(0,2)}</span>}
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">{selectedTarget.primaryUniv}</h2>
                    <p className="text-blue-600 font-bold mb-8 text-sm sm:text-base">{selectedTarget.tierName} · {selectedTarget.category} 지원 권장</p>
                    
                    <div className="bg-slate-50 rounded-[32px] p-6 sm:p-8 border-2 border-slate-100 shadow-inner">
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-6 text-sm font-black text-slate-400 border-b border-slate-200 pb-4">
                            <span>현재 {selectedTarget.typeLabel} : <span className="text-slate-800 text-base">{Number(selectedTarget.score || 0).toFixed(2)}등급</span></span>
                            <span className="hidden sm:inline"><ArrowRight size={16}/></span>
                            <span>합격 안정선 : <span className="text-indigo-600 text-base">{selectedTarget.maxGrade}등급</span> 이내</span>
                        </div>
                        {Number(selectedTarget.score || 0) > selectedTarget.maxGrade ? (
                            <div className="space-y-4">
                                <p className="text-slate-500 font-bold text-base sm:text-lg">해당 대학 안정권 진입을 위해</p>
                                <div className="text-3xl sm:text-4xl font-black text-rose-600 bg-white inline-block px-6 py-3 rounded-2xl shadow-sm border border-rose-100">평균 {(Number(selectedTarget.score || 0) - selectedTarget.maxGrade).toFixed(2)}등급</div>
                                <p className="text-slate-500 font-bold text-base sm:text-lg">을 더 올려야 합니다. 🔥</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-slate-500 font-bold text-base sm:text-lg">🎉 현재 매우 안정적인 성적입니다!</p>
                                <div className="text-3xl sm:text-4xl font-black text-emerald-600 bg-white inline-block px-6 py-3 rounded-2xl shadow-sm border border-emerald-100">합격 유력</div>
                                <p className="text-slate-500 font-bold text-base sm:text-lg">성적 유지에 집중해 주세요. ✨</p>
                            </div>
                        )}
                    </div>
                    <Button onClick={()=>setSelectedTarget(null)} className="w-full mt-8 py-4 sm:py-5 text-lg sm:text-xl font-black rounded-2xl shadow-xl bg-slate-900 hover:bg-slate-800">분석 내용 확인 완료</Button>
                </div>
            )}
        </Modal>

        {/* 상향 대학 리스트 팝업 */}
        <Modal isOpen={isUpperListOpen} onClose={() => setIsUpperListOpen(false)} title="도전! 상향 추천 대학 리스트">
            <div className="space-y-3 p-1">
                <p className="text-slate-400 font-bold mb-4 text-center text-sm">현재 수준에서 1~2단계 상위에 위치한 대학군입니다.</p>
                {upperUnivList.length === 0 ? <p className="text-center text-slate-400 py-10 font-bold">표시할 상위 대학이 없습니다.</p> :
                upperUnivList.map(u => {
                    const logoUrl = UNIV_LOGOS[u.primaryUniv.split(' ')[0]];
                    return (
                    <div key={u.level} onClick={() => { setSelectedTarget({...u, category: '상향', typeLabel: '수시 내신', score: avgGrades.school}); setIsUpperListOpen(false); }} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all group">
                         <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 p-1.5 relative overflow-hidden">
                            {logoUrl ? (
                                <>
                                    <img src={logoUrl} className="w-full h-full object-contain" alt="logo" onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }}/>
                                    <span style={{display: 'none'}} className="absolute inset-0 flex items-center justify-center font-black text-slate-400 text-xs bg-slate-50">{u.primaryUniv.substring(0,2)}</span>
                                </>
                            ) : <span className="font-black text-slate-400 text-xs">{u.primaryUniv.substring(0,2)}</span>}
                         </div>
                         <div className="flex-1">
                            <div className="font-black text-slate-800 text-base group-hover:text-blue-600 transition-colors">{u.primaryUniv}</div>
                            <div className="text-[10px] font-bold text-slate-400 mt-0.5">{u.tierName} · 목표합격선 {u.maxGrade}</div>
                         </div>
                         <ChevronRight size={20} className="text-slate-200 group-hover:text-blue-500"/>
                    </div>
                )})}
            </div>
        </Modal>
    </div>
  );
};

export default CollegeNavigator;