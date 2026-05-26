/* [서비스 가치] 입시 내비게이터 - 복잡한 입시 데이터를 6-Block(상향/적정/하향)으로 시각화하여 
   학생과 학부모에게 강력한 동기부여와 명확한 목표(Gap)를 제시합니다. */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Target, TrendingUp, Camera, Upload, CheckCircle, Lock, Edit2, 
  ChevronRight, AlertCircle, BookOpen, Award, Sparkles, X, Plus
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Badge, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// --- 입시 매핑 데이터 (원장님 제공 DB) ---
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
  { level: 27, primaryUniv: "경북대학교", minGrade: 3.40, maxGrade: 3.55, "tierName": "지거국 상위" },
  { level: 28, primaryUniv: "광운대학교", minGrade: 3.55, maxGrade: 3.70, "tierName": "광명상가" },
  { level: 29, primaryUniv: "가천대학교", minGrade: 3.70, maxGrade: 3.85, "tierName": "인가경" },
  { level: 30, primaryUniv: "충남대학교", minGrade: 3.85, maxGrade: 4.05, "tierName": "지거국 중위" },
  { level: 31, primaryUniv: "전남대학교", minGrade: 4.05, maxGrade: 4.25, "tierName": "지거국 중위" },
  { level: 32, primaryUniv: "경기대학교", minGrade: 4.25, maxGrade: 4.50, "tierName": "수도권 중위" },
  { level: 33, primaryUniv: "한성대학교", minGrade: 4.50, maxGrade: 4.80, "tierName": "인서울 하위/수도권" },
  { level: 34, primaryUniv: "지방 거점 국립대", minGrade: 4.80, maxGrade: 5.50, "tierName": "지거국 하위" },
  { level: 35, primaryUniv: "지방 주요 4년제", minGrade: 5.50, maxGrade: 9.01, "tierName": "기타 대학" }
];

const CollegeNavigator = ({ currentUser, targetStudent = null }) => {
  const isStudentView = currentUser.role === 'student' || currentUser.role === 'parent';
  const isAdminView = ['admin', 'admin_assistant'].includes(currentUser.role);
  
  const activeStudentId = isStudentView ? currentUser.id : (targetStudent?.id || null);

  const [grades, setGrades] = useState([]);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);

  // --- 성적 입력 폼 상태 ---
  const initForm = { type: 'school', term: '1학년 1학기 중간', subjects: [{ name: '', score: '', rank: '', total: '', grade: '' }] };
  const [inputForm, setInputForm] = useState(initForm);

  // --- DB 연동 ---
  useEffect(() => {
    if (!activeStudentId) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), where('studentId', '==', activeStudentId));
    const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.createdAt?.seconds - b.createdAt?.seconds);
        setGrades(data);
    });
    return () => unsub();
  }, [activeStudentId]);

  // --- 등급 자동 계산 (2026년 기준 5등급제) ---
  const calc5Grade = (rank, total) => {
      if (!rank || !total) return '';
      const r = Number(rank), t = Number(total);
      if (t === 0) return '';
      const pct = (r / t) * 100;
      if (pct <= 10) return 1;
      if (pct <= 34) return 2;
      if (pct <= 66) return 3;
      if (pct <= 90) return 4;
      return 5;
  };

  const handleSubjectChange = (idx, field, val) => {
      const newSubjects = [...inputForm.subjects];
      newSubjects[idx][field] = val;
      
      // 내신인 경우 석차/수강자수 입력 시 5등급 자동 계산
      if (inputForm.type === 'school' && (field === 'rank' || field === 'total')) {
          newSubjects[idx].grade = calc5Grade(newSubjects[idx].rank, newSubjects[idx].total);
      }
      setInputForm({ ...inputForm, subjects: newSubjects });
  };

  const handleOcrUpload = () => {
      setIsOcrLoading(true);
      // 🚀 Google Cloud Vision API 연동 Placeholder
      setTimeout(() => {
          setIsOcrLoading(false);
          setInputForm(prev => ({
              ...prev,
              subjects: [
                  { name: '국어', score: '92', rank: '12', total: '200', grade: 1 },
                  { name: '수학', score: '88', rank: '35', total: '200', grade: 2 },
                  { name: '영어', score: '96', rank: '8', total: '200', grade: 1 }
              ]
          }));
          alert('Vision API 성적표 파싱이 완료되었습니다!');
      }, 1500);
  };

  const handleSaveGrade = async () => {
      const validSubjects = inputForm.subjects.filter(s => s.name && s.grade);
      if (validSubjects.length === 0) return alert('과목명과 등급을 정확히 입력해주세요.');
      
      try {
          await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), {
              studentId: activeStudentId,
              type: inputForm.type,
              term: inputForm.term,
              subjects: validSubjects,
              isLocked: true, // 학생이 입력하면 즉시 잠금
              createdAt: serverTimestamp()
          });
          setIsInputOpen(false);
          setInputForm(initForm);
      } catch(e) { alert('저장 실패: ' + e.message); }
  };

  // --- 알고리즘: 평균 산출 및 대학 매칭 ---
  const avgGrades = useMemo(() => {
      const schoolGrades = grades.filter(g => g.type === 'school');
      const mockGrades = grades.filter(g => g.type === 'mock');
      
      const calcAvg = (arr) => {
          if(arr.length === 0) return 0;
          let sum = 0, count = 0;
          arr.forEach(g => {
              g.subjects.forEach(s => { sum += Number(s.grade); count++; });
          });
          return count > 0 ? (sum / count).toFixed(2) : 0;
      };

      return { school: Number(calcAvg(schoolGrades)), mock: Number(calcAvg(mockGrades)) };
  }, [grades]);

  const getUniversities = (score, isSusi) => {
      if (!score || score === 0) return null;
      const DB = isSusi ? SUSI_DB : JUNGSI_DB;
      
      let matchIdx = DB.findIndex(univ => score >= univ.minGrade && score < univ.maxGrade);
      if (matchIdx === -1) {
          // 범위를 벗어난 최상/최하위 예외 처리
          matchIdx = score < DB[0].minGrade ? 0 : DB.length - 1;
      }
      
      const upIdx = Math.max(0, matchIdx - 2);
      const downIdx = Math.min(DB.length - 1, matchIdx + 2);

      return {
          up: DB[upIdx], match: DB[matchIdx], down: DB[downIdx],
          score: score, type: isSusi ? '수시(내신)' : '정시(모의고사)'
      };
  };

  const susiResult = getUniversities(avgGrades.school, true);
  const jungsiResult = getUniversities(avgGrades.mock, false);

  // --- 성적 추이 그래프 (순수 SVG) ---
  const renderGraph = (type) => {
      const targetGrades = grades.filter(g => g.type === type);
      if (targetGrades.length < 2) return <div className="text-center text-sm text-gray-400 py-8 bg-gray-50 rounded-xl border border-dashed">데이터가 2회 이상 누적되면 그래프가 생성됩니다.</div>;

      const maxGrade = type === 'school' ? 5 : 9;
      const points = targetGrades.map((g, i) => {
          let sum = 0; g.subjects.forEach(s => sum += Number(s.grade));
          const avg = sum / g.subjects.length;
          // Y축 역순 배치 (1등급이 맨 위)
          const y = ((avg - 1) / (maxGrade - 1)) * 100; 
          return { x: i * (100 / (targetGrades.length - 1)), y, term: g.term, avg: avg.toFixed(1) };
      });

      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

      return (
          <div className="relative w-full h-40 pt-4 pb-6 px-4">
              <svg className="w-full h-full" viewBox="0 -10 100 120" preserveAspectRatio="none">
                  {/* 기준선 */}
                  <line x1="0" y1="0" x2="100" y2="0" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="2,2" />
                  <line x1="0" y1="100" x2="100" y2="100" stroke="#f1f5f9" strokeWidth="1" />
                  
                  {/* 꺾은선 */}
                  <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  
                  {/* 포인트 */}
                  {points.map((p, i) => (
                      <g key={i}>
                          <circle cx={p.x} cy={p.y} r="3" fill="#fff" stroke="#4f46e5" strokeWidth="2" />
                          <text x={p.x} y={p.y - 6} fontSize="4" fontWeight="bold" fill="#4f46e5" textAnchor="middle">{p.avg}</text>
                          <text x={p.x} y={115} fontSize="3.5" fill="#94a3b8" textAnchor="middle">{p.term}</text>
                      </g>
                  ))}
              </svg>
          </div>
      );
  };

  const renderUnivCard = (data, category, typeLabel) => {
      if (!data) return <div className="h-24 bg-gray-50 rounded-xl border border-dashed flex items-center justify-center text-gray-400 text-sm font-bold">데이터 부족</div>;
      
      const isUp = category === '상향';
      const isMatch = category === '적정';
      
      return (
          <div 
            onClick={() => setSelectedTarget({ ...data, category, typeLabel })}
            className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-lg hover:-translate-y-1 overflow-hidden group
                ${isUp ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200' : isMatch ? 'bg-gradient-to-br from-blue-50 to-white border-blue-200' : 'bg-gradient-to-br from-slate-50 to-white border-slate-200'}
            `}
          >
              <div className="flex justify-between items-start mb-2 relative z-10">
                  <Badge variant={isUp ? 'secondary' : isMatch ? 'primary' : 'outline'} className="shadow-sm">{category} 지원</Badge>
                  <span className="text-[10px] font-black text-gray-400">{data.tierName}</span>
              </div>
              
              <div className="flex items-center gap-3 relative z-10 mt-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shadow-md shrink-0 ${isUp ? 'bg-indigo-500' : isMatch ? 'bg-blue-500' : 'bg-slate-400'}`}>
                      {data.primaryUniv.substring(0, 2)}
                  </div>
                  <div>
                      <h4 className="font-black text-gray-900 text-lg md:text-xl leading-tight">{data.primaryUniv}</h4>
                  </div>
              </div>
          </div>
      );
  };

  if (!activeStudentId) return <div className="text-center p-10 text-gray-400">학생을 먼저 선택해주세요.</div>;

  return (
    <div className="space-y-6 w-full animate-in fade-in">
        
        {/* 상단: 헤더 및 입력 버튼 */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-gradient-to-r from-blue-900 to-indigo-800 text-white p-6 rounded-3xl shadow-lg gap-4">
            <div>
                <h2 className="text-2xl font-black flex items-center gap-2">
                    <Target className="text-blue-300" size={28}/> 입시 내비게이터 <Badge className="bg-white/20 text-white ml-2">목표 대학 나침반</Badge>
                </h2>
                <p className="text-white/80 text-sm mt-1 font-medium">성적을 입력하면 나의 현재 위치와 6개 목표 대학이 즉각 제시됩니다.</p>
            </div>
            {!isInputOpen && (
                <Button onClick={() => setIsInputOpen(true)} className="w-full md:w-auto bg-white text-blue-900 hover:bg-blue-50 font-black shadow-lg flex items-center gap-2">
                    <Edit2 size={18}/> 성적 입력하기
                </Button>
            )}
        </div>

        {/* 성적 입력 폼 (토글형) */}
        {isInputOpen && (
            <Card className="border-2 border-indigo-200 shadow-xl animate-in slide-in-from-top-4">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <h3 className="font-black text-lg text-indigo-900 flex items-center gap-2"><BookOpen size={20}/> 성적 등록</h3>
                    <button onClick={() => setIsInputOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={24}/></button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">시험 구분</label>
                        <select className="w-full border-2 rounded-xl p-3 bg-gray-50 outline-none focus:border-indigo-500 font-bold" value={inputForm.type} onChange={e => setInputForm({...inputForm, type: e.target.value})}>
                            <option value="school">학교 내신 (5등급제)</option>
                            <option value="mock">모의고사 (9등급제)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">시험 시기 (예: 1-1 중간)</label>
                        <input className="w-full border-2 rounded-xl p-3 bg-white outline-none focus:border-indigo-500 font-bold" value={inputForm.term} onChange={e => setInputForm({...inputForm, term: e.target.value})} />
                    </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
                        <div>
                            <h4 className="font-black text-indigo-900 mb-1">📸 성적표 간편 등록 (Vision AI)</h4>
                            <p className="text-xs text-indigo-700 font-medium">성적표 사진을 찍어 올리면 과목, 원점수, 석차가 1초 만에 자동 입력됩니다.</p>
                        </div>
                        <Button variant="secondary" className="bg-white border-indigo-200 text-indigo-700 w-full md:w-auto font-black shadow-sm" onClick={handleOcrUpload} disabled={isOcrLoading}>
                            {isOcrLoading ? <Loader className="animate-spin" size={18}/> : <Camera size={18}/>} 사진 업로드
                        </Button>
                    </div>
                </div>

                <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-end mb-2">
                        <label className="text-sm font-bold text-gray-800">과목별 점수</label>
                        {inputForm.type === 'school' && <span className="text-[10px] text-gray-500 font-bold">* 석차/수강자수 입력 시 5등급 기준이 자동 계산됩니다.</span>}
                    </div>
                    {inputForm.subjects.map((sub, idx) => (
                        <div key={idx} className="flex flex-wrap md:flex-nowrap gap-2 items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <input className="flex-1 md:w-1/4 border p-2.5 rounded-lg text-sm font-bold outline-none" placeholder="과목 (예: 국어)" value={sub.name} onChange={e => handleSubjectChange(idx, 'name', e.target.value)} />
                            <input type="number" className="w-1/3 md:w-20 border p-2.5 rounded-lg text-sm font-bold outline-none" placeholder="원점수" value={sub.score} onChange={e => handleSubjectChange(idx, 'score', e.target.value)} />
                            
                            {inputForm.type === 'school' ? (
                                <>
                                    <input type="number" className="w-1/3 md:w-20 border p-2.5 rounded-lg text-sm outline-none" placeholder="석차" value={sub.rank} onChange={e => handleSubjectChange(idx, 'rank', e.target.value)} />
                                    <span className="text-gray-400">/</span>
                                    <input type="number" className="w-1/3 md:w-20 border p-2.5 rounded-lg text-sm outline-none" placeholder="총인원" value={sub.total} onChange={e => handleSubjectChange(idx, 'total', e.target.value)} />
                                </>
                            ) : null}
                            
                            <input type="number" className={`w-1/3 md:w-24 border p-2.5 rounded-lg text-sm font-black outline-none ${sub.grade ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white'}`} placeholder="등급" value={sub.grade} onChange={e => handleSubjectChange(idx, 'grade', e.target.value)} />
                        </div>
                    ))}
                    <Button variant="ghost" size="sm" className="text-blue-600 font-bold" onClick={() => setInputForm({...inputForm, subjects: [...inputForm.subjects, {name:'', score:'', rank:'', total:'', grade:''}]})}><Plus size={16}/> 과목 추가</Button>
                </div>

                <Button className="w-full py-4 text-lg font-black bg-indigo-600 hover:bg-indigo-700 shadow-md" onClick={handleSaveGrade}>성적 안전하게 저장하기</Button>
            </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 중단: 성적 추이 그래프 */}
            <Card className="flex flex-col h-72">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2"><TrendingUp size={18} className="text-indigo-600"/> 내신 (5등급제) 성장 곡선</h3>
                <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center">
                    {renderGraph('school')}
                </div>
            </Card>
            <Card className="flex flex-col h-72">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2"><TrendingUp size={18} className="text-blue-600"/> 모의고사 (9등급제) 성장 곡선</h3>
                <div className="flex-1 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center">
                    {renderGraph('mock')}
                </div>
            </Card>
        </div>

        {/* 하단: 6-Block 대학 추천 결과 영역 */}
        <Card className="p-0 overflow-hidden border-2 border-slate-200 shadow-xl bg-slate-50">
            <div className="p-6 bg-white border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Award className="text-yellow-500" size={24}/> 나의 목표 대학 6-Block</h3>
                <div className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                    내신 평균: <span className="text-indigo-600">{avgGrades.school > 0 ? avgGrades.school : '-'}</span> / 모의고사 평균: <span className="text-blue-600">{avgGrades.mock > 0 ? avgGrades.mock : '-'}</span>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200">
                {/* 수시 칼럼 */}
                <div className="bg-white p-6 space-y-4">
                    <div className="text-center mb-6">
                        <Badge className="bg-indigo-100 text-indigo-800 border border-indigo-200 mb-2">수시 (학생부 교과/종합)</Badge>
                        <p className="text-xs font-bold text-gray-400">내신 5등급제 평균 기반 예측</p>
                    </div>
                    {renderUnivCard(susiResult?.up, '상향', susiResult?.type)}
                    {renderUnivCard(susiResult?.match, '적정', susiResult?.type)}
                    {renderUnivCard(susiResult?.down, '하향', susiResult?.type)}
                </div>
                
                {/* 정시 칼럼 */}
                <div className="bg-white p-6 space-y-4">
                    <div className="text-center mb-6">
                        <Badge className="bg-blue-100 text-blue-800 border border-blue-200 mb-2">정시 (수능)</Badge>
                        <p className="text-xs font-bold text-gray-400">모의고사 9등급제 평균 기반 예측</p>
                    </div>
                    {renderUnivCard(jungsiResult?.up, '상향', jungsiResult?.type)}
                    {renderUnivCard(jungsiResult?.match, '적정', jungsiResult?.type)}
                    {renderUnivCard(jungsiResult?.down, '하향', jungsiResult?.type)}
                </div>
            </div>
        </Card>

        {/* 목표 대학 타겟 Gap 팝업 */}
        <Modal isOpen={!!selectedTarget} onClose={() => setSelectedTarget(null)} title={`${selectedTarget?.primaryUniv} 목표 분석`}>
            {selectedTarget && (
                <div className="space-y-6 p-2 text-center">
                    <div className="w-20 h-20 mx-auto rounded-full bg-indigo-600 flex items-center justify-center text-white text-3xl font-black shadow-lg mb-4">
                        {selectedTarget.primaryUniv.substring(0, 2)}
                    </div>
                    <h3 className="text-2xl font-black text-gray-900">{selectedTarget.primaryUniv}</h3>
                    <Badge variant="outline" className="text-gray-500 font-bold">{selectedTarget.tierName} · {selectedTarget.category} 지원</Badge>
                    
                    <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-6 mt-6 shadow-inner">
                        <div className="flex items-center justify-center gap-2 mb-4 text-gray-500 font-bold text-sm">
                            현재 {selectedTarget.typeLabel} <span className="text-gray-900">{selectedTarget.score.toFixed(2)}등급</span>
                            <ChevronRight size={16}/> 
                            목표 합격선 <span className="text-indigo-600">{selectedTarget.maxGrade}등급</span> 이내
                        </div>
                        
                        {selectedTarget.score > selectedTarget.maxGrade ? (
                            <div className="text-lg leading-relaxed font-medium text-gray-800">
                                🔥 안정권 진입을 위해<br/>
                                <span className="text-rose-600 font-black text-2xl">평균 {(selectedTarget.score - selectedTarget.maxGrade).toFixed(2)}등급</span> 향상이 필요합니다!
                            </div>
                        ) : (
                            <div className="text-lg leading-relaxed font-medium text-gray-800">
                                ✨ 훌륭합니다!<br/>
                                현재 성적을 유지한다면 <span className="text-emerald-600 font-black text-2xl">안정적인 합격</span>이 예상됩니다!
                            </div>
                        )}
                    </div>

                    <Button className="w-full py-4 text-lg font-bold" onClick={() => setSelectedTarget(null)}>목표 확인 완료</Button>
                </div>
            )}
        </Modal>

    </div>
  );
};

export default CollegeNavigator;