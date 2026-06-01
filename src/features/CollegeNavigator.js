/* [서비스 가치] 입시 내비게이터 3.0 (학생 주도형 목표 설정 및 Gap 분석)
   - 관리자의 엑셀 업로드 기능 및 AI 성적표 파싱(OCR) 기능 완벽 유지
   - 학생이 원하는 '과'를 검색하여 목표로 설정하고, 현재 점수와의 격차를 시각화(Gauge Bar)
   - 내 점수로 갈 수 있는 [안정/적정/소신/상향] 대학 리스트를 즉석에서 매칭하여 동기부여 극대화 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
// 🚀 [CTO 패치] Database 아이콘 import 누락 수정 완료
import { 
  Compass, TrendingUp, Camera, CheckCircle, Edit2, ChevronRight, Award, 
  X, Plus, Loader, History, Search, ArrowRight, Trash2, Users, Target, Lock,
  MapPin, AlertTriangle, Info, Sparkles, Flame, Database 
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { Button, Card, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';
import { useParams, useNavigate } from 'react-router-dom';

const APP_ID = 'imperial-clinic-v1';

// --- 대학 로고 맵 (유지) ---
const UNIV_LOGOS = {
  "서울대학교": "https://i.postimg.cc/SNx2knJ9/seouldaehaggyo.png",
  "연세대학교": "https://i.postimg.cc/k4ZJCgZp/yeonsedaehaggyo.png",
  "고려대학교": "https://i.postimg.cc/d3rLSC1R/keugibyeonhwan-golyeodaehaggyo.jpg",
  "성균관대학교": "https://i.postimg.cc/J0VhJhQg/seong-gyungwandaehaggyo.png",
  "한양대학교": "https://i.postimg.cc/D0T20Mv7/han-yangdaehaggyo.jpg",
  "중앙대학교": "https://i.postimg.cc/Pqvh4jNz/jung-angdaehaggyo.png",
  "경희대학교": "https://i.postimg.cc/m2ZsnMtx/keugibyeonhwan-gyeonghuidaehaggyo.png",
  "건국대학교": "https://i.postimg.cc/MHWhh2Z4/geongugdaehaggyo.jpg",
  "동국대학교": "https://i.postimg.cc/VkS3yF1Y/dong-gugdaehaggyo.png",
  "홍익대학교": "https://i.postimg.cc/sDxLSJMC/hong-igdaehaggyo.jpg",
  "서강대학교": "https://i.postimg.cc/j2hr56SK/seogangdaehaggyo.gif",
  "한국외국어대학교": "https://i.postimg.cc/7Zfp8r0P/hangug-oegug-eodaehaggyo.gif",
  "서울시립대학교": "https://i.postimg.cc/yxLrtLNT/seoulsilibdaehaggyo.png",
  "국민대학교": "https://i.postimg.cc/h4ZsFzrm/gugmindaehaggyo.png",
  "숭실대학교": "https://i.postimg.cc/PqMbSPJ8/sungsildaehaggyo.jpg",
  "세종대학교": "https://i.postimg.cc/6pJdwdGC/sejongdaehaggyo.png",
  "단국대학교": "https://i.postimg.cc/J0HkCnrZ/dangugdaehaggyo.png",
  "가천대학교": "https://i.postimg.cc/K82JQXQ2/gacheondaehaggyo.jpg",
  "가톨릭대학교": "https://i.postimg.cc/QtwqTvVT/gatolligdaehaggyo.jpg",
  "인하대학교": "https://i.postimg.cc/W186ndhT/inhadaehaggyo.png",
  "아주대학교": "https://i.postimg.cc/fLGxLXrn/ajudaehaggyo.jpg",
  "광운대학교": "https://i.postimg.cc/CLHjhRCc/gwang-undaehaggyo.png",
  "경기대학교": "https://i.postimg.cc/43hy3Mky/logo-1947-01-10.png",
  "한성대학교": "https://i.postimg.cc/kX1gv9qp/hanseongdaehaggyo.jpg",
  "부산대학교": "https://i.postimg.cc/XYtNt8ZR/busandaehaggyo.png",
  "경북대학교": "https://i.postimg.cc/L4v9mRYq/gyeongbugdaehaggyo.png",
  "충남대학교": "https://i.postimg.cc/bvX8mwWY/chungnamdaehaggyo.jpg",
  "전남대학교": "https://i.postimg.cc/ZnqhWBB0/jeonnamdaehaggyo.png",
  "가야대학교": "https://i.postimg.cc/0j0jZ0Z0/default.png", 
  "지방": ""
};

// 🚀 백엔드 연결 전 테스트용 임베디드 엑셀 데이터
const DEMO_ADMISSIONS_DB = [
  { region: '서울', univ: '홍익대학교', type: '학생부교과', dept: '법학부', cut: 1.34, min: 1.29, max: 1.39, strategy: '안정적 유지' },
  { region: '서울', univ: '홍익대학교', type: '학생부교과', dept: '산업데이터공학과', cut: 1.31, min: 1.21, max: 1.36, strategy: '최근 입결 상승(주의)' },
  { region: '서울', univ: '홍익대학교', type: '학생부교과', dept: '수학교육과', cut: 1.37, min: 1.27, max: 1.47, strategy: '소폭 변동' },
  { region: '서울', univ: '홍익대학교', type: '학생부교과', dept: '역사교육과', cut: 1.49, min: 1.44, max: 1.64, strategy: '최근 입결 하락(기회)' },
  { region: '서울', univ: '홍익대학교', type: '학생부종합', dept: '신소재화공시스템공학부', cut: 1.63, min: 1.53, max: 1.68, strategy: '최근 입결 상승(주의)' },
  { region: '경기', univ: '가천대학교', type: '학생부종합', dept: '건축학부', cut: 2.48, min: 2.43, max: 2.63, strategy: '최근 입결 하락(기회)' },
  { region: '경기', univ: '가천대학교', type: '학생부종합', dept: 'AI인문대학', cut: 2.64, min: 2.54, max: 2.79, strategy: '변동성 큼(스나이핑 유의)' },
  { region: '경남', univ: '가야대학교', type: '학생부교과', dept: '간호학과', cut: 1.98, min: 1.88, max: 2.47, strategy: '변동성 큼(스나이핑 유의)' },
  { region: '경남', univ: '가야대학교', type: '학생부교과', dept: '사회복지상담학과', cut: 4.35, min: 4.25, max: 4.86, strategy: '변동성 큼(스나이핑 유의)' },
];

const CollegeNavigator = ({ currentUser }) => {
  const { studentId } = useParams(); 
  const navigate = useNavigate();
  const { users } = useData();
  const isAdminView = ['admin', 'admin_assistant'].includes(currentUser?.role);
  
  const [searchInput, setSearchInput] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || '');

  const activeStudentId = isAdminView ? selectedStudentId : currentUser.id;
  const studentInfo = isAdminView ? (users || []).find(s => s.id === activeStudentId) : currentUser;

  const [grades, setGrades] = useState([]);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  
  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);

  // 입시 데이터 (Firestore 기반)
  const [admissionsDB, setAdmissionsDB] = useState([]);

  // 🚀 [신규] 목표 대학/학과 검색 및 설정용 상태
  const [searchUniv, setSearchUniv] = useState('');
  const [searchDept, setSearchDept] = useState('');
  const [targetDept, setTargetDept] = useState(null);

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

  // --- 입결 데이터 로드 (Firestore) ---
  useEffect(() => {
    const fetchAdmissions = async () => {
        try {
            const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'college_admissions'));
            const snap = await getDocs(q);
            if (!snap.empty) {
                setAdmissionsDB(snap.docs.map(d => ({id: d.id, ...d.data()})));
            } else {
                setAdmissionsDB(DEMO_ADMISSIONS_DB); // 백엔드 업로드 전 폴백(Fallback)
            }
        } catch (e) {
            console.error(e);
            setAdmissionsDB(DEMO_ADMISSIONS_DB);
        }
    };
    fetchAdmissions();
  }, []);

  const handleSearchStudent = () => {
      if (!searchInput.trim()) return alert('이름을 입력해주세요.');
      const results = (users || []).filter(u => u.role === 'student' && u.name.includes(searchInput.trim()));
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

  // --- 관리자 엑셀 업로드 ---
  const [isExcelUploading, setIsExcelUploading] = useState(false);
  const handleExcelUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setIsExcelUploading(true);
      try {
          const reader = new FileReader();
          reader.onload = async (evt) => {
              try {
                  const bstr = evt.target.result;
                  const wb = XLSX.read(bstr, { type: 'binary' });
                  let allAdmissions = [];
                  ['학생부교과', '학생부종합'].forEach(sheetName => {
                      if (wb.SheetNames.includes(sheetName)) {
                          const ws = wb.Sheets[sheetName];
                          const data = XLSX.utils.sheet_to_json(ws, { range: 2 });
                          data.forEach(row => {
                              if (row['대학'] && row['학과명']) {
                                  allAdmissions.push({
                                      region: row['지역'] || '기타', univ: row['대학'], type: row['전형'] || sheetName,
                                      dept: row['학과명'], cut: Number(row['5등급제 예측컷']) || null, min: Number(row['구간 Min']) || null,
                                      max: Number(row['구간 Max']) || null, strategy: row['지원 전략 판별기'] || '예측 불가'
                                  });
                              }
                          });
                      }
                  });
                  if (allAdmissions.length === 0) throw new Error("추출된 데이터가 없습니다.");

                  const updateDB = httpsCallable(functions, 'updateAdmissionsDB', { timeout: 300000 });
                  const result = await updateDB({ admissionsData: allAdmissions });

                  alert(`🎉 성공! 총 ${result.data.count}개의 대학/학과 입시 데이터가 업데이트되었습니다.`);
                  const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'college_admissions'));
                  const snap = await getDocs(q);
                  setAdmissionsDB(snap.docs.map(d => ({id: d.id, ...d.data()})));

              } catch (err) { alert(`업로드 실패: ${err.message}`); } finally {
                  setIsExcelUploading(false);
                  if (excelInputRef.current) excelInputRef.current.value = '';
              }
          };
          reader.readAsBinaryString(file);
      } catch (error) { setIsExcelUploading(false); alert("파일 읽기 오류"); }
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

  // --- 내신 평균 계산 ---
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

  const myGpa = avgGrades.school;

  // 🚀 [신규] 엑셀 데이터 기반 부서 검색 리스트
  const searchResultsNav = useMemo(() => {
    if (!searchUniv && !searchDept) return [];
    return admissionsDB.filter(item => {
        const matchUniv = searchUniv ? item.univ.includes(searchUniv) : true;
        const matchDept = searchDept ? item.dept.includes(searchDept) : true;
        return matchUniv && matchDept && item.cut !== null;
    }).slice(0, 50); // 상위 50개만
  }, [admissionsDB, searchUniv, searchDept]);

  // 🚀 [신규] 목표 대학과의 Gap 분석 로직
  const gapAnalysis = useMemo(() => {
      if (!targetDept || myGpa === 0) return null;
      if (!targetDept.cut) return { status: 'unknown', text: '데이터 집계 중' };

      const diff = Number((myGpa - targetDept.cut).toFixed(2));
      let status = 'danger'; let message = ''; let gapText = '';
      
      if (myGpa <= targetDept.min) {
          status = 'success'; message = "🎉 훌륭합니다! 최초 합격 보장(안정권)입니다."; gapText = `안정선보다 ${Math.abs(diff)}등급 여유가 있습니다.`;
      } else if (myGpa <= targetDept.cut) {
          status = 'success'; message = "✅ 좋은 성적입니다! 주력 지원 구간(적정권)입니다."; gapText = `예측컷 이내에 안정적으로 진입했습니다.`;
      } else if (myGpa <= targetDept.max) {
          status = 'warning'; message = "🔥 조금만 더! 추가합격/스나이핑 노림수(소신권) 구간입니다."; gapText = `안전하게 합격하려면 내신 평균 ${diff}등급 향상이 필요합니다.`;
      } else {
          status = 'danger'; message = "🚨 현재 성적으로는 합격 확률이 희박(상향)합니다."; gapText = `목표 달성을 위해 평균 ${diff}등급 이상의 획기적인 향상이 필요합니다.`;
      }
      return { status, message, gapText, diff };
  }, [targetDept, myGpa]);

  // 🚀 [신규] 내 점수 기반 4단계 자동 분류 (안정/적정/소신/상향)
  const categorizedList = useMemo(() => {
      if (myGpa === 0 || admissionsDB.length === 0) return { safe: [], reach: [], challenge: [], danger: [] };
      const safe = []; const reach = []; const challenge = []; const danger = [];
      
      admissionsDB.filter(d => d.cut !== null).forEach(d => {
          if (myGpa <= d.min) safe.push(d);
          else if (myGpa <= d.cut) reach.push(d);
          else if (myGpa <= d.max) challenge.push(d);
          // else danger.push(d); // 상향은 너무 많으므로 추천에서 제외
      });

      const shuffle = (array) => array.sort(() => 0.5 - Math.random()).slice(0, 6);
      return { safe: shuffle(safe), reach: shuffle(reach), challenge: shuffle(challenge) };
  }, [myGpa, admissionsDB]);

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

  // --- 관리자 선택 UI ---
  if (isAdminView && !activeStudentId) {
      return (
        <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in pb-20 px-2 sm:px-4">
            <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl text-center md:text-left relative">
                <h1 className="text-3xl font-black mb-2 flex items-center justify-center md:justify-start gap-3"><Compass className="text-blue-400" size={32}/> 초정밀 입시 내비게이터 (관리자)</h1>
                <p className="text-slate-400 font-bold mb-8">지원 판별 엑셀 데이터를 기반으로 4단계 합격 가능성을 분석합니다.</p>
                
                <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20 max-w-lg mx-auto md:mx-0 mb-6">
                    <Search className="ml-4 text-white/50 shrink-0 hidden sm:block" />
                    <input type="text" className="w-full p-3 bg-transparent text-white font-bold outline-none placeholder:text-white/40 text-center sm:text-left" placeholder="학생 이름 검색 (예: 홍길동)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()} />
                    <Button onClick={handleSearchStudent} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-6 font-black shrink-0 shadow-lg">검색</Button>
                </div>

                {/* 관리자 엑셀 업로드 존 유지 */}
                <div className="border-t border-slate-700 pt-6 mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                        <h4 className="font-bold text-slate-300 flex items-center gap-2"><Database size={16}/> 입시 예측 컷 DB 업데이트</h4>
                        <p className="text-xs text-slate-500 mt-1">학원의 [지원판별기 엑셀]을 업로드하면 최신 예측 데이터가 시스템에 덮어씌워집니다.</p>
                    </div>
                    <div>
                        <input type="file" ref={excelInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleExcelUpload} />
                        <Button variant="secondary" className="bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-lg font-black" onClick={() => excelInputRef.current?.click()} disabled={isExcelUploading}>
                            {isExcelUploading ? <Loader className="animate-spin mr-2" size={16} /> : <Camera className="mr-2" size={16} />}
                            {isExcelUploading ? '데이터 추출 중...' : '최신 엑셀 업로드'}
                        </Button>
                    </div>
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

        {/* 기존 상단부 UI: 성적 히스토리 및 그래프 영역 완벽 유지 */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1 space-y-6">
                <Card className="p-5 sm:p-6 border-none shadow-sm bg-white rounded-3xl">
                    <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4"><History size={20} className="text-blue-600"/> 기존 성적 내역</h3>
                    <p className="text-xs text-slate-400 font-bold mb-4 bg-slate-50 p-2 rounded-lg">클릭 시 수정 및 시뮬레이션 가능</p>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
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

                        {/* AI OCR 성적표 자동 파싱 유지 */}
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
                    <Card className="flex flex-col h-64 sm:h-72 p-4 sm:p-6 rounded-[32px] border-none shadow-sm bg-white">
                        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-2"><TrendingUp size={20} className="text-indigo-600"/> 내신성적 성장 곡선</h3>
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden">{renderGraph('school')}</div>
                    </Card>
                    <Card className="flex flex-col h-64 sm:h-72 p-4 sm:p-6 rounded-[32px] border-none shadow-sm bg-white">
                        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-2"><TrendingUp size={20} className="text-blue-600"/> 모의고사 성장 곡선</h3>
                        <div className="flex-1 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden">{renderGraph('mock')}</div>
                    </Card>
                </div>

                {/* ========================================================= */}
                {/* 🚀 [NEW] 학생 주도형 타겟 설정 & 자동 추천 시스템 UI */}
                {/* ========================================================= */}
                {myGpa === 0 ? (
                    <div className="bg-white p-10 text-center rounded-[32px] shadow-sm border border-slate-200">
                        <Info className="text-indigo-500 w-12 h-12 mx-auto mb-4"/>
                        <h3 className="text-xl font-black text-slate-800 mb-2">내신 성적이 아직 입력되지 않았습니다.</h3>
                        <p className="text-slate-500 font-bold">성적을 먼저 입력하시면 입시 판별 데이터가 활성화됩니다.</p>
                    </div>
                ) : (
                    <Card className="p-6 sm:p-8 overflow-hidden border-none shadow-xl bg-white rounded-[32px] animate-in fade-in">
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
                                                    {targetDept.strategy && <p className="text-xs font-bold text-rose-500 mt-1">{targetDept.strategy}</p>}
                                                </div>
                                                <button onClick={() => setTargetDept(null)} className="text-xs font-bold text-slate-400 hover:text-rose-500 underline underline-offset-2">취소</button>
                                            </div>

                                            <div className={`p-4 rounded-xl mb-6 ${gapAnalysis?.status === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : gapAnalysis?.status === 'warning' ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-rose-50 text-rose-800 border border-rose-100'}`}>
                                                <p className="font-black text-sm">{gapAnalysis?.message}</p>
                                                <p className="font-bold text-xs mt-1">{gapAnalysis?.gapText}</p>
                                            </div>

                                            {/* 시각적 Gap 게이지 바 */}
                                            {targetDept.cut && (
                                                <div className="mt-8 mb-4 px-2 relative">
                                                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                                                        {/* Cut을 기준으로 한 그라데이션 채우기 */}
                                                        <div className="absolute top-0 h-full bg-gradient-to-r from-emerald-400 to-amber-400" style={{ left: '0%', width: `${Math.max(0, Math.min(100, ((targetDept.cut - 1) / 4) * 100))}%` }}></div>
                                                    </div>
                                                    {/* 목표 핀 */}
                                                    <div className="absolute top-1/2 -translate-y-1/2 h-5 w-1 bg-slate-800 rounded-full" style={{ left: `${Math.max(0, Math.min(100, ((targetDept.cut - 1) / 4) * 100))}%` }}>
                                                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-800 whitespace-nowrap">목표 {targetDept.cut}</span>
                                                    </div>
                                                    {/* 학생 내신 핀 */}
                                                    <div className="absolute -bottom-6 transform -translate-x-1/2 transition-all duration-1000 z-10" style={{ left: `${Math.max(0, Math.min(100, ((myGpa - 1) / 4) * 100))}%` }}>
                                                        <div className="flex flex-col items-center">
                                                            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-indigo-600 mb-1"></div>
                                                            <div className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-black shadow-md whitespace-nowrap">나 {myGpa}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
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

                            {/* 우측: 내 점수 기반 4단계 지원 가능 리스트 */}
                            <div className="space-y-6">
                                <div className="bg-indigo-50 p-5 sm:p-6 rounded-3xl border border-indigo-100 h-full">
                                    <h4 className="font-black text-indigo-900 mb-2 flex items-center gap-2"><Sparkles className="text-indigo-500"/> 내 성적으로 갈 수 있는 곳</h4>
                                    <p className="text-xs font-bold text-indigo-600 mb-6">현재 {myGpa}등급 기준으로 스캔한 엑셀 추천 리스트입니다.</p>

                                    <div className="space-y-6">
                                        {/* 안정권 라인 */}
                                        <div>
                                            <h5 className="text-sm font-black text-blue-700 mb-3 flex items-center gap-1"><CheckCircle size={16}/> 1. 안정권 (합격 유력)</h5>
                                            <div className="space-y-2">
                                                {categorizedList.safe.length > 0 ? categorizedList.safe.map((d, i) => (
                                                    <div key={i} className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm flex justify-between items-center">
                                                        <div>
                                                            <div className="font-black text-sm text-slate-800">{d.univ} <span className="text-[10px] text-slate-500 font-normal ml-1">{d.dept}</span></div>
                                                        </div>
                                                        <div className="text-xs font-black text-blue-600">{d.cut}</div>
                                                    </div>
                                                )) : <div className="text-xs text-slate-400 bg-white p-3 rounded-xl border border-dashed">지원 가능한 안정권 데이터가 없습니다.</div>}
                                            </div>
                                        </div>

                                        {/* 적정권 라인 */}
                                        <div>
                                            <h5 className="text-sm font-black text-emerald-700 mb-3 flex items-center gap-1"><TrendingUp size={16}/> 2. 적정권 (주력 지원)</h5>
                                            <div className="space-y-2">
                                                {categorizedList.reach.length > 0 ? categorizedList.reach.map((d, i) => (
                                                    <div key={i} className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm flex justify-between items-center">
                                                        <div>
                                                            <div className="font-black text-sm text-slate-800">{d.univ} <span className="text-[10px] text-slate-500 font-normal ml-1">{d.dept}</span></div>
                                                        </div>
                                                        <div className="text-xs font-black text-emerald-600">{d.cut}</div>
                                                    </div>
                                                )) : <div className="text-xs text-slate-400 bg-white p-3 rounded-xl border border-dashed">적정권 데이터가 부족합니다.</div>}
                                            </div>
                                        </div>

                                        {/* 소신권 라인 */}
                                        <div>
                                            <h5 className="text-sm font-black text-amber-600 mb-3 flex items-center gap-1"><Flame size={16}/> 3. 소신권 (추합/스나이핑)</h5>
                                            <div className="space-y-2">
                                                {categorizedList.challenge.length > 0 ? categorizedList.challenge.map((d, i) => (
                                                    <div key={i} className="bg-white p-3 rounded-xl border border-amber-100 shadow-sm flex justify-between items-center">
                                                        <div>
                                                            <div className="font-black text-sm text-slate-800">{d.univ} <span className="text-[10px] text-slate-500 font-normal ml-1">{d.dept}</span></div>
                                                        </div>
                                                        <div className="text-xs font-black text-amber-600">{d.cut}</div>
                                                    </div>
                                                )) : <div className="text-xs text-slate-400 bg-white p-3 rounded-xl border border-dashed">소신 지원 데이터가 없습니다.</div>}
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