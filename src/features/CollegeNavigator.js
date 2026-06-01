/* [서비스 가치] 입시 내비게이터 3.0 (학생 주도형 목표 설정 및 Gap 분석)
   - 데이터 관리는 외부(VS Code)로 분리하고, 화면은 가볍고 직관적인 UI에 집중합니다.
   - 학생이 직관적으로 이해할 수 있는 [상향/적정/하향] 명칭 사용
   - 항목 클릭 시, 다음 학기 목표 등급을 자동으로 계산해 주는 '학습 동기부여 엔진' 탑재
   - [안정성 보장] 구조 분해 할당 오류 완벽 해결 및 Zero Trust 방어적 코딩 적용 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Compass, TrendingUp, Camera, CheckCircle, ChevronRight, 
  X, Plus, Loader, History, Search, Trash2, Target, Lock,
  MapPin, Info, Sparkles, Flame, ArrowUpRight, ArrowDownRight, Calculator
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { Button, Card, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';
import { useParams, useNavigate } from 'react-router-dom';

const APP_ID = 'imperial-clinic-v1';

const CollegeNavigator = ({ currentUser }) => {
  const { studentId } = useParams(); 
  const navigate = useNavigate();
  const { users } = useData();
  
  const isAdminView = ['admin', 'admin_assistant', 'lecturer'].includes(currentUser?.role);
  
  const [searchInput, setSearchInput] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || '');

  const activeStudentId = isAdminView ? selectedStudentId : currentUser?.id;
  const studentInfo = isAdminView ? (users || []).find(s => s.id === activeStudentId) : currentUser;

  const [grades, setGrades] = useState([]);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  
  const fileInputRef = useRef(null);

  // 입시 데이터 (정적 JSON 파일 기반)
  const [admissionsDB, setAdmissionsDB] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // 목표 대학/학과 검색 및 설정용 상태
  const [searchUniv, setSearchUniv] = useState('');
  const [searchDept, setSearchDept] = useState('');
  const [targetDept, setTargetDept] = useState(null);

  // 다음 시험 목표 계산기 모달 상태
  const [selectedUnivForNextExam, setSelectedUnivForNextExam] = useState(null);

  // --- 성적 입력 폼 초기화 데이터 ---
  const initForm = { 
      id: null, type: 'school', termGrade: '1학년', termExam: '1학기 중간고사', 
      subjects: [{ name: '', score: '', rank: '', tiedRank: '', total: '', grade: '' }] 
  };
  const [inputForm, setInputForm] = useState(initForm);
  const isReadOnly = !isAdminView && !!inputForm.id;

  // --- DB 연동 (성적 불러오기) ---
  useEffect(() => {
    if (!activeStudentId) { setGrades([]); return; }
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), where('studentId', '==', activeStudentId));
    const unsub = onSnapshot(q, (snapshot) => {
        setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.createdAt?.seconds - b.createdAt?.seconds));
    });
    return () => unsub();
  }, [activeStudentId]);

  // --- 정적 입결 데이터 로드 ---
  useEffect(() => {
    const fetchStaticData = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/data/admissions_data.json');
            if(response.ok) {
                const data = await response.json();
                setAdmissionsDB(Array.isArray(data) ? data : []);
            } else {
                setAdmissionsDB([]); 
            }
        } catch (error) {
            console.error("데이터 로드 실패:", error);
            setAdmissionsDB([]);
        } finally {
            setIsLoading(false);
        }
    };
    fetchStaticData();
  }, []);

  // 🚀 [수정 완료] Zero Trust 방어적 코딩 (이름이 없는 비정상 데이터 에러 방지)
  const handleSearchStudent = () => {
      if (!searchInput.trim()) return alert('이름을 입력해주세요.');
      const results = (users || []).filter(u => 
          u.role === 'student' && 
          u.name?.includes(searchInput.trim())
      );
      setSearchResults(results);
      setSearchModalOpen(true);
  };

  const calc5Grade = (rank, tiedRank, total) => {
      if (!rank || !total) return '';
      const r = Number(rank); const tr = Number(tiedRank) || 1; const t = Number(total);
      if (t <= 0) return '';
      const midRank = r + (tr - 1) / 2;
      const pct = (midRank / t) * 100;
      if (pct <= 10) return 1; if (pct <= 34) return 2; if (pct <= 66) return 3; if (pct <= 90) return 4; return 5;
  };

  const handleSubjectChange = (idx, field, val) => {
      if (isReadOnly) return;
      const newSubjects = [...inputForm.subjects];
      newSubjects[idx][field] = val;
      if (inputForm.type === 'school' && (field === 'rank' || field === 'tiedRank' || field === 'total')) {
          newSubjects[idx].grade = calc5Grade(newSubjects[idx].rank, newSubjects[idx].tiedRank, newSubjects[idx].total) || newSubjects[idx].grade;
      }
      setInputForm({ ...inputForm, subjects: newSubjects });
  };

  const handleRemoveSubject = (idx) => {
      if (isReadOnly) return;
      setInputForm(prev => ({ ...prev, subjects: prev.subjects.filter((_, i) => i !== idx) }));
  };

  const handleEditEntry = (g) => {
      let parsedGrade = '1학년', parsedExam = '1학기 중간고사';
      if (g.term) {
          const parts = g.term.split(' ');
          if (parts.length >= 2) { parsedGrade = parts[0]; parsedExam = parts.slice(1).join(' '); }
      }
      setInputForm({ id: g.id, type: g.type, termGrade: parsedGrade, termExam: parsedExam, subjects: g.subjects || [] });
      setIsInputOpen(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- AI OCR (성적표 파싱) ---
  const handleFileChange = async (e) => {
      if (isReadOnly) return;
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

  const handleSaveClick = () => {
      const validSubjects = inputForm.subjects.filter(s => s.name && s.grade);
      if (validSubjects.length === 0) return alert('과목명과 등급을 정확히 입력해주세요.');
      if (!isAdminView && !inputForm.id) setIsConfirmModalOpen(true);
      else executeSaveGrade();
  };

  const executeSaveGrade = async () => {
      const validSubjects = inputForm.subjects.filter(s => s.name && s.grade);
      try {
          const combinedTerm = `${inputForm.termGrade} ${inputForm.termExam}`;
          const payload = { studentId: activeStudentId, type: inputForm.type, term: combinedTerm, subjects: validSubjects, isLocked: !isAdminView, updatedAt: serverTimestamp() };
          
          if (inputForm.id) { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'grades', inputForm.id), payload); } 
          else { payload.createdAt = serverTimestamp(); await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), payload); }
          setIsInputOpen(false); setInputForm(initForm); setIsConfirmModalOpen(false);
      } catch(e) { alert(e.message); setIsConfirmModalOpen(false); }
  };

  // 🚀 [수정 완료] 내신 평균 계산 리팩토링 (객체 구조 분해 할당 일치)
  const { avgGrades, numSchoolExams } = useMemo(() => {
      const schoolGrades = grades.filter(g => g.type === 'school');
      const calcAvg = (type) => {
          const arr = grades.filter(g => g.type === type);
          if(arr.length === 0) return 0;
          let sum = 0, count = 0;
          arr.forEach(g => { 
              const subs = g.subjects || [];
              subs.forEach(s => { 
                  if (s.grade && !isNaN(Number(s.grade))) { sum += Number(s.grade); count++; }
              }); 
          });
          return count > 0 ? (sum / count).toFixed(2) : 0;
      };
      
      // avgGrades 래퍼 객체로 명확하게 묶어 반환
      return { 
          avgGrades: {
              school: Number(calcAvg('school')), 
              mock: Number(calcAvg('mock'))
          },
          numSchoolExams: schoolGrades.length
      };
  }, [grades]);

  const myGpa = avgGrades.school; // 이제 오류 없이 안전하게 참조 가능!

  // 다음 시험 목표 계산기 알고리즘
  const calculateNextTermGoal = (targetCut) => {
      if (numSchoolExams === 0) return null;
      if (numSchoolExams >= 5) return { possible: false, required: 0, msg: "이미 3학년 1학기까지 주요 내신이 모두 반영되었습니다. 수능 최저 준비와 면접에 집중하세요." };

      const targetTotal = targetCut * (numSchoolExams + 1);
      const currentTotal = myGpa * numSchoolExams;
      let required = targetTotal - currentTotal;
      required = Number(required.toFixed(2));

      if (required < 1.0) {
          return { possible: false, required, msg: `다음 학기에 올 1등급(1.0)을 받아도 목표 내신(${targetCut})에 도달하기 어렵습니다. (산술적 필요 등급: ${required})\n학생부종합전형이나 정시를 병행해야 합니다.` };
      } else if (required > 5.0) {
          return { possible: true, required, msg: `다음 학기에 평균 ${required}등급 이내만 유지해도 안정적으로 합격선에 안착합니다.` };
      } else {
          return { possible: true, required, msg: `목표 합격선에 도달하려면 다음 시험에서 평균 [ ${required} 등급 ]을 받아야 합니다!` };
      }
  };

  // 목표 학과 검색 리스트
  const searchResultsNav = useMemo(() => {
    if (!searchUniv && !searchDept) return [];
    if (!Array.isArray(admissionsDB)) return [];
    return admissionsDB.filter(item => {
        const matchUniv = searchUniv ? item.univ?.includes(searchUniv) : true;
        const matchDept = searchDept ? item.dept?.includes(searchDept) : true;
        return matchUniv && matchDept && item.cut !== null && item.cut !== undefined;
    }).slice(0, 50); 
  }, [admissionsDB, searchUniv, searchDept]);

  // 목표 대학과의 Gap 분석 로직 (게이지바 용)
  const gapAnalysis = useMemo(() => {
      if (!targetDept || myGpa === 0) return null;
      if (!targetDept.cut) return { status: 'unknown', text: '데이터 집계 중' };

      const diff = Number((myGpa - targetDept.cut).toFixed(2));
      let status = 'danger'; let message = ''; let gapText = '';
      
      if (targetDept.min && myGpa <= targetDept.min) {
          status = 'success'; message = "🎉 하향(안정) 지원 가능합니다!"; gapText = `안정선보다 ${Math.abs(diff)}등급 여유가 있습니다.`;
      } else if (myGpa <= targetDept.cut) {
          status = 'success'; message = "✅ 적정 지원 구간입니다."; gapText = `예측컷 이내에 안정적으로 진입했습니다.`;
      } else if (targetDept.max && myGpa <= targetDept.max) {
          status = 'warning'; message = "🔥 상향 지원 (스나이핑 노림수) 구간입니다."; gapText = `안전하게 합격하려면 내신 평균 ${diff}등급 향상이 필요합니다.`;
      } else {
          status = 'danger'; message = "🚨 현재 성적으로는 합격 확률이 희박합니다."; gapText = `평균 ${diff}등급 이상의 획기적인 점수 향상이 필요합니다.`;
      }
      return { status, message, gapText, diff };
  }, [targetDept, myGpa]);

  // 상향/적정/하향 자동 분류 알고리즘
  const categorizedList = useMemo(() => {
      if (myGpa === 0 || !Array.isArray(admissionsDB) || admissionsDB.length === 0) return { safety: [], match: [], reach: [] };
      const safety = []; const match = []; const reach = [];
      
      admissionsDB.filter(d => d.cut !== null && d.cut !== undefined).forEach(d => {
          if (d.min && myGpa <= d.min) safety.push(d);            // 하향 (안정지원)
          else if (myGpa <= d.cut) match.push(d);                 // 적정 (주력지원)
          else if (d.max && myGpa <= d.max) reach.push(d);        // 상향 (소신/스나이핑)
      });

      const shuffle = (array) => array.sort(() => 0.5 - Math.random()).slice(0, 7);
      return { safety: shuffle(safety), match: shuffle(match), reach: shuffle(reach) };
  }, [myGpa, admissionsDB]);

  const renderGraph = (type) => {
      const targetGrades = grades.filter(g => g.type === type);
      if (targetGrades.length < 2) return <div className="text-center text-sm text-gray-400 py-8 bg-gray-50 rounded-xl border border-dashed w-full mx-4 flex items-center justify-center">데이터가 2회 이상 누적되면 생성됩니다.</div>;

      const maxGrade = type === 'school' ? 5 : 9;
      const points = targetGrades.map((g, i) => {
          const subs = g.subjects || [];
          let sum = 0, count = 0; 
          subs.forEach(s => { if(s.grade && !isNaN(Number(s.grade))) { sum += Number(s.grade); count++; }});
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

  // --- 관리자 학생 검색 UI ---
  if (isAdminView && !activeStudentId) {
      return (
        <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in pb-20 px-2 sm:px-4">
            <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl text-center md:text-left relative">
                <h1 className="text-3xl font-black mb-2 flex items-center justify-center md:justify-start gap-3"><Compass className="text-blue-400" size={32}/> 입시 내비게이터 (학생 검색)</h1>
                <p className="text-slate-400 font-bold mb-8">상담할 학생의 이름을 검색해주세요.</p>
                
                <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20 max-w-lg mx-auto md:mx-0 mb-6">
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

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in pb-20 px-2 sm:px-4">
        
        <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] shadow-2xl relative overflow-hidden">
            <div className="absolute right-0 top-0 w-64 h-64 bg-blue-600/20 rounded-full blur-[100px]"></div>
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black mb-2 flex items-center gap-3"><Compass className="text-blue-400" size={32}/> {studentInfo?.name || '학생'} 입시 내비게이터</h1>
                    <p className="text-slate-400 font-bold text-sm sm:text-base">현재 내신 점수({myGpa > 0 ? myGpa : '-'}등급)를 진단하고 상위 대학 진입을 위한 실질적인 Gap을 분석합니다.</p>
                </div>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <Button onClick={() => { if(!isInputOpen) setInputForm(initForm); setIsInputOpen(!isInputOpen); }} className="bg-white text-slate-900 hover:bg-slate-100 font-black px-6 py-3 sm:px-8 sm:py-4 rounded-2xl shadow-xl flex-1 md:flex-none justify-center">
                        {isInputOpen ? '닫기' : '새로운 성적 입력'}
                    </Button>
                    {isAdminView && (
                        <Button variant="secondary" onClick={() => setSelectedStudentId('')} className="bg-slate-800 text-white hover:bg-slate-700 border-slate-700 font-bold px-6 py-3 sm:px-6 sm:py-4 rounded-2xl flex-1 md:flex-none justify-center">다른 학생 검색</Button>
                    )}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 space-y-6">
                <Card className="p-5 sm:p-6 border-none shadow-sm">
                    <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4"><History size={20} className="text-blue-600"/> 기존 성적 내역</h3>
                    <p className="text-xs text-slate-400 font-bold mb-4 bg-slate-50 p-2 rounded-lg">클릭 시 수정 및 시뮬레이션 가능</p>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                        {grades.length === 0 ? <p className="text-center py-10 text-slate-400 font-bold">등록된 성적이 없습니다.</p> :
                        grades.map(g => {
                            const subs = g.subjects || [];
                            const avg = subs.length > 0 ? (subs.reduce((a,b)=>a+(Number(b.grade)||0),0)/subs.length).toFixed(2) : '-';
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

            <div className="lg:col-span-3 space-y-8">
                {isInputOpen && (
                    <Card className="border-4 border-blue-600 shadow-2xl p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] animate-in slide-in-from-top-4">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-blue-900">{inputForm.id ? '성적 수정 및 시뮬레이션' : '새로운 성적 등록'}</h3>
                            <button onClick={()=>setIsInputOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"><X size={20}/></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div><label className="block text-xs font-black text-slate-500 mb-2">시험구분</label><select disabled={isReadOnly} className="w-full border-2 rounded-2xl p-3 bg-slate-50 font-black text-blue-600 outline-none disabled:opacity-60" value={inputForm.type} onChange={e => setInputForm({...inputForm, type: e.target.value})}><option value="school">내신 5등급제</option><option value="mock">모의고사 9등급제</option></select></div>
                            <div><label className="block text-xs font-black text-slate-500 mb-2">학년</label><select disabled={isReadOnly} className="w-full border-2 rounded-2xl p-3 bg-white font-black outline-none disabled:opacity-60" value={inputForm.termGrade} onChange={e => setInputForm({...inputForm, termGrade: e.target.value})}><option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option><option value="N수생">N수생</option></select></div>
                            <div><label className="block text-xs font-black text-slate-500 mb-2">종류</label><select disabled={isReadOnly} className="w-full border-2 rounded-2xl p-3 bg-white font-black outline-none disabled:opacity-60" value={inputForm.termExam} onChange={e => setInputForm({...inputForm, termExam: e.target.value})}><option value="1학기 중간고사">1학기 중간고사</option><option value="1학기 기말고사">1학기 기말고사</option><option value="2학기 중간고사">2학기 중간고사</option><option value="2학기 기말고사">2학기 기말고사</option><option value="모의고사">모의고사</option></select></div>
                        </div>

                        {!isReadOnly && (
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
                                <div>
                                    <h4 className="font-black text-indigo-900 mb-1 flex items-center gap-2"><Camera size={18}/> 성적표 사진 자동 파싱</h4>
                                    <p className="text-xs text-indigo-700 font-bold">1초 만에 사진에서 과목명, 등급을 모두 추출합니다.</p>
                                </div>
                                <Button variant="secondary" className="bg-white text-indigo-600 border-indigo-200 shadow-sm w-full md:w-auto font-black" onClick={() => fileInputRef.current.click()} disabled={isOcrLoading}>
                                    {isOcrLoading ? <Loader className="animate-spin" size={18}/> : '사진 업로드'}
                                </Button>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf" onChange={handleFileChange}/>
                            </div>
                        )}
                        
                        <div className="space-y-3 mb-8">
                            {inputForm.subjects.map((sub, idx) => (
                                <div key={idx} className={`flex flex-wrap md:flex-nowrap gap-2 items-center p-2 sm:p-3 rounded-2xl border ${isReadOnly ? 'bg-slate-100 border-transparent opacity-80' : 'bg-slate-50 hover:border-blue-300'}`}>
                                    <input disabled={isReadOnly} className="w-full md:flex-1 border-none bg-white p-3 rounded-xl font-black text-sm outline-none" placeholder="과목명" value={sub.name} onChange={e=>handleSubjectChange(idx, 'name', e.target.value)}/>
                                    <input disabled={isReadOnly} className="w-[calc(50%-4px)] md:w-24 border-none bg-white p-3 rounded-xl font-black text-center text-sm outline-none" placeholder="원점수" value={sub.score} onChange={e=>handleSubjectChange(idx, 'score', e.target.value)}/>
                                    
                                    {inputForm.type === 'school' && (
                                        <div className={`w-full md:w-48 flex items-center gap-1 px-2 rounded-xl bg-white`}>
                                            <input disabled={isReadOnly} className="w-full p-3 font-bold text-center text-sm outline-none" placeholder="석차" value={sub.rank} onChange={e=>handleSubjectChange(idx, 'rank', e.target.value)}/>
                                            <span className="text-slate-300">/</span>
                                            <input disabled={isReadOnly} className="w-full p-3 font-bold text-center text-sm outline-none" placeholder="인원" value={sub.total} onChange={e=>handleSubjectChange(idx, 'total', e.target.value)}/>
                                        </div>
                                    )}
                                    <input disabled={isReadOnly} className={`w-[calc(50%-4px)] md:w-24 border-none p-3 rounded-xl font-black text-center text-sm ${sub.grade && !isReadOnly ? 'bg-blue-600 text-white' : 'bg-white text-slate-800'}`} placeholder="등급" value={sub.grade} onChange={e=>handleSubjectChange(idx, 'grade', e.target.value)}/>
                                    
                                    {!isReadOnly && <button onClick={() => handleRemoveSubject(idx)} className="w-full md:w-10 p-3 flex justify-center text-slate-300 hover:text-red-500 bg-white rounded-xl"><Trash2 size={20}/></button>}
                                </div>
                            ))}
                            {!isReadOnly && <Button variant="ghost" onClick={() => setInputForm(prev=>({...prev, subjects: [...prev.subjects, {name:'', score:'', rank:'', tiedRank:'', total:'', grade:''}]}))} className="text-blue-600 font-bold mt-2"><Plus size={16} className="mr-1"/> 과목 추가</Button>}
                        </div>
                        
                        {isReadOnly ? (
                            <div className="text-center p-5 bg-slate-100 rounded-2xl text-slate-500 font-bold"><Lock className="inline mb-1" /> 열람 전용 모드</div>
                        ) : (
                            <Button className="w-full py-5 text-lg font-black bg-blue-600 hover:bg-blue-700 shadow-xl rounded-2xl" onClick={handleSaveClick}>성적 안전하게 저장하기</Button>
                        )}
                    </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="flex flex-col h-64 sm:h-72 p-4 sm:p-6 rounded-[32px] border-none shadow-sm">
                        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-2"><TrendingUp size={20} className="text-indigo-600"/> 내신성적 성장 곡선</h3>
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden">{renderGraph('school')}</div>
                    </Card>
                    <Card className="flex flex-col h-64 sm:h-72 p-4 sm:p-6 rounded-[32px] border-none shadow-sm">
                        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-2"><TrendingUp size={20} className="text-blue-600"/> 모의고사 성장 곡선</h3>
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden">{renderGraph('mock')}</div>
                    </Card>
                </div>

                {myGpa === 0 ? (
                    <div className="bg-white p-10 text-center rounded-[32px] shadow-sm border border-slate-200">
                        <Info className="text-indigo-500 w-12 h-12 mx-auto mb-4"/>
                        <h3 className="text-xl font-black text-slate-800 mb-2">내신 성적이 아직 입력되지 않았습니다.</h3>
                        <p className="text-slate-500 font-bold">성적을 먼저 입력하시면 입시 판별 데이터가 활성화됩니다.</p>
                    </div>
                ) : (
                    <Card className="p-6 sm:p-8 overflow-hidden border border-slate-100 shadow-xl rounded-[32px] animate-in fade-in">
                        <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-6"><Target className="text-blue-500" size={28}/> 초정밀 지원 판별기</h3>
                        
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            
                            {/* 좌측: 목표 학과 검색 및 Gap 시각화 */}
                            <div className="space-y-6">
                                <div className="bg-slate-50 p-5 sm:p-6 rounded-3xl border border-slate-200">
                                    <h4 className="font-black text-slate-800 mb-4 flex items-center gap-2"><MapPin className="text-rose-500"/> 나의 목표 학과 설정</h4>
                                    
                                    <div className="flex flex-col sm:flex-row gap-2 mb-4">
                                        <input type="text" placeholder="대학명 (예: 홍익대)" value={searchUniv} onChange={(e) => setSearchUniv(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" />
                                        <input type="text" placeholder="학과명 (예: 컴퓨터)" value={searchDept} onChange={(e) => setSearchDept(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl font-bold outline-none focus:border-indigo-400" />
                                    </div>

                                    {targetDept ? (
                                        <div className="bg-white rounded-2xl p-5 border border-slate-200 relative overflow-hidden shadow-sm mt-4">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded mb-2">{targetDept.type}</span>
                                                    <h3 className="text-lg font-black text-slate-800">{targetDept.univ} {targetDept.dept}</h3>
                                                </div>
                                                <button onClick={() => setTargetDept(null)} className="text-xs font-bold text-slate-400 hover:text-rose-500 underline underline-offset-2">취소</button>
                                            </div>

                                            <div className={`p-4 rounded-xl mb-6 ${gapAnalysis?.status === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : gapAnalysis?.status === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-rose-50 text-rose-800 border border-rose-100'}`}>
                                                <p className="font-black text-sm">{gapAnalysis?.message}</p>
                                                <p className="font-bold text-xs mt-1">{gapAnalysis?.gapText}</p>
                                            </div>

                                            {targetDept.cut && (
                                                <div className="mt-8 mb-4 px-2 relative cursor-pointer" onClick={() => setSelectedUnivForNextExam(targetDept)} title="클릭하여 다음 시험 목표 확인">
                                                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="absolute top-0 h-full bg-gradient-to-r from-emerald-400 to-amber-400" style={{ left: '0%', width: `${Math.max(0, Math.min(100, ((targetDept.cut - 1) / 4) * 100))}%` }}></div>
                                                    </div>
                                                    <div className="absolute top-1/2 -translate-y-1/2 h-5 w-1 bg-slate-800 rounded-full" style={{ left: `${Math.max(0, Math.min(100, ((targetDept.cut - 1) / 4) * 100))}%` }}>
                                                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-800 whitespace-nowrap">목표 {targetDept.cut}</span>
                                                    </div>
                                                    <div className="absolute -bottom-6 transform -translate-x-1/2 transition-all duration-1000 z-10" style={{ left: `${Math.max(0, Math.min(100, ((myGpa - 1) / 4) * 100))}%` }}>
                                                        <div className="flex flex-col items-center">
                                                            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-indigo-600 mb-1"></div>
                                                            <div className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-black shadow-md whitespace-nowrap">나 {myGpa}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="mt-4 text-center">
                                                <Button size="sm" variant="outline" className="w-full border-slate-200 font-black text-slate-600 hover:bg-slate-50" onClick={() => setSelectedUnivForNextExam(targetDept)}>
                                                    <Calculator size={14} className="mr-1 inline"/> 이 학과에 가려면 다음 시험에 몇 등급을 받아야 할까?
                                                </Button>
                                            </div>
                                        </div>
                                    ) : searchResultsNav.length > 0 ? (
                                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar border border-slate-200 rounded-2xl bg-white mt-4">
                                            {searchResultsNav.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                    <div>
                                                        <span className="font-black text-slate-700 text-sm">{item.univ} {item.dept}</span>
                                                        <span className="ml-2 text-xs font-bold text-indigo-500">예측컷: {item.cut}</span>
                                                    </div>
                                                    <button onClick={() => setTargetDept(item)} className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-colors">
                                                        목표 📌
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (searchUniv || searchDept) ? (
                                        <div className="text-center py-8 text-slate-400 font-bold text-sm bg-white rounded-2xl mt-4 border border-dashed">검색 결과가 없습니다.</div>
                                    ) : (
                                        <div className="text-center py-10 text-slate-400 font-bold text-sm bg-white rounded-2xl mt-4 border border-dashed">
                                            가고 싶은 대학이나 학과를 검색하여<br/>나만의 목표로 설정해 보세요.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 우측: 내 점수 기반 3단계 지원 가능 리스트 */}
                            <div className="space-y-6">
                                <div className="bg-indigo-50 p-5 sm:p-6 rounded-3xl border border-indigo-100 h-full">
                                    <h4 className="font-black text-indigo-900 mb-2 flex items-center gap-2"><Sparkles className="text-indigo-500"/> 내 성적 지원 가능 라인</h4>
                                    <p className="text-xs font-bold text-indigo-600 mb-6">현재 {myGpa}등급 기준으로 스캔한 엑셀 추천 리스트입니다. <br/>항목을 클릭하면 <b>다음 시험 목표 점수</b>를 확인할 수 있습니다.</p>

                                    <div className="space-y-6">
                                        <div>
                                            <h5 className="text-sm font-black text-rose-600 mb-3 flex items-center gap-1"><ArrowUpRight size={16}/> 상향 (소신지원)</h5>
                                            <div className="space-y-2">
                                                {categorizedList.reach.length > 0 ? categorizedList.reach.map((d, i) => (
                                                    <div key={i} onClick={() => setSelectedUnivForNextExam(d)} className="bg-white p-3 rounded-xl border border-rose-100 shadow-sm flex justify-between items-center cursor-pointer hover:border-rose-400 transition-all group">
                                                        <div>
                                                            <div className="font-black text-sm text-slate-800 group-hover:text-rose-600">{d.univ} <span className="text-[10px] text-slate-500 font-normal ml-1">{d.dept}</span></div>
                                                        </div>
                                                        <div className="text-xs font-black text-rose-500">{d.cut}</div>
                                                    </div>
                                                )) : <div className="text-xs text-slate-400 bg-white p-3 rounded-xl border border-dashed">지원 가능한 데이터가 없습니다.</div>}
                                            </div>
                                        </div>

                                        <div>
                                            <h5 className="text-sm font-black text-emerald-600 mb-3 flex items-center gap-1"><Target size={16}/> 적정 (주력지원)</h5>
                                            <div className="space-y-2">
                                                {categorizedList.match.length > 0 ? categorizedList.match.map((d, i) => (
                                                    <div key={i} onClick={() => setSelectedUnivForNextExam(d)} className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm flex justify-between items-center cursor-pointer hover:border-emerald-400 transition-all group">
                                                        <div>
                                                            <div className="font-black text-sm text-slate-800 group-hover:text-emerald-600">{d.univ} <span className="text-[10px] text-slate-500 font-normal ml-1">{d.dept}</span></div>
                                                        </div>
                                                        <div className="text-xs font-black text-emerald-600">{d.cut}</div>
                                                    </div>
                                                )) : <div className="text-xs text-slate-400 bg-white p-3 rounded-xl border border-dashed">적정권 데이터가 부족합니다.</div>}
                                            </div>
                                        </div>

                                        <div>
                                            <h5 className="text-sm font-black text-blue-600 mb-3 flex items-center gap-1"><ArrowDownRight size={16}/> 하향 (안정지원)</h5>
                                            <div className="space-y-2">
                                                {categorizedList.safety.length > 0 ? categorizedList.safety.map((d, i) => (
                                                    <div key={i} onClick={() => setSelectedUnivForNextExam(d)} className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm flex justify-between items-center cursor-pointer hover:border-blue-400 transition-all group">
                                                        <div>
                                                            <div className="font-black text-sm text-slate-800 group-hover:text-blue-600">{d.univ} <span className="text-[10px] text-slate-500 font-normal ml-1">{d.dept}</span></div>
                                                        </div>
                                                        <div className="text-xs font-black text-blue-500">{d.cut}</div>
                                                    </div>
                                                )) : <div className="text-xs text-slate-400 bg-white p-3 rounded-xl border border-dashed">하향(안정권) 데이터가 없습니다.</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </div>

        {/* 다음 시험 목표 계산기 모달 */}
        <Modal isOpen={!!selectedUnivForNextExam} onClose={() => setSelectedUnivForNextExam(null)} title="다음 시험 목표 계산기">
            {selectedUnivForNextExam && (() => {
                const result = calculateNextTermGoal(selectedUnivForNextExam.cut);
                return (
                    <div className="p-4 space-y-4 text-center">
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                            <p className="text-xs font-black text-indigo-500 mb-1">{selectedUnivForNextExam.type}</p>
                            <h3 className="text-2xl font-black text-slate-800 mb-2">{selectedUnivForNextExam.univ} {selectedUnivForNextExam.dept}</h3>
                            <div className="flex justify-center gap-4 text-sm mt-4">
                                <div className="bg-white border rounded-xl p-2 px-4 shadow-sm">
                                    <span className="text-slate-400 font-bold block text-xs">현재 내 평균</span>
                                    <span className="font-black text-slate-800 text-lg">{myGpa}</span>
                                </div>
                                <div className="bg-white border rounded-xl p-2 px-4 shadow-sm">
                                    <span className="text-slate-400 font-bold block text-xs">합격 예측컷</span>
                                    <span className="font-black text-rose-500 text-lg">{selectedUnivForNextExam.cut}</span>
                                </div>
                            </div>
                        </div>

                        {!result ? (
                            <div className="py-6 font-bold text-slate-500">계산을 위한 내신 성적 기록이 부족합니다.</div>
                        ) : (
                            <div className={`p-6 rounded-2xl border-2 ${result.possible ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-200'}`}>
                                <h4 className={`text-lg font-black mb-2 ${result.possible ? 'text-indigo-900' : 'text-rose-900'}`}>
                                    {result.possible ? '🎯 합격 목표 달성을 위해!' : '🚨 현실적인 전략 수정 필요'}
                                </h4>
                                <p className={`font-bold leading-relaxed whitespace-pre-wrap ${result.possible ? 'text-indigo-700' : 'text-rose-700'}`}>
                                    {result.msg}
                                </p>
                            </div>
                        )}
                        <Button className="w-full mt-4 bg-slate-800 hover:bg-slate-900 text-white font-black py-4 rounded-xl" onClick={() => setSelectedUnivForNextExam(null)}>확인</Button>
                    </div>
                );
            })()}
        </Modal>

        <Modal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} title="최종 제출 확인">
            <div className="p-4 text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4"><Lock size={32}/></div>
                <h3 className="text-xl font-black text-slate-800">새로운 성적을 최종 제출하시겠습니까?</h3>
                <p className="text-slate-500 font-bold leading-relaxed">제출된 데이터는 학원 데이터베이스에 안전하게 기록되며,<br/><span className="text-rose-500">이후 학생 계정에서는 직접 수정이나 삭제가 불가능합니다.</span></p>
                <div className="flex gap-3 mt-6">
                    <Button variant="secondary" className="flex-1 py-4 font-black bg-slate-100 text-slate-600" onClick={() => setIsConfirmModalOpen(false)}>취소</Button>
                    <Button className="flex-1 py-4 bg-blue-600 font-black shadow-lg hover:bg-blue-700" onClick={executeSaveGrade}>네, 제출합니다</Button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default CollegeNavigator;