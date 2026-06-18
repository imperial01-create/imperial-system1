/* [서비스 가치] 스마트 아날로그 Voca 클라이언트 포털 (학생/학부모용 통합 뷰)
   (🚀 인쇄 렌더링 패치: 상위 DOM의 CSS 제약을 피하기 위해 인쇄 전용 렌더링 트리(printMode)를 구성하여 
   PDF 다운로드 시 백지 현상 및 잘림 버그를 원천 차단했습니다.)
   (🚀 UX/UI 패치: 학부모가 직관적으로 비율을 파악할 수 있도록 텍스트 데이터를 정량화(%)했습니다.) */
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Printer, BookOpen, Clock, FileText, Download, Play, AlertCircle, 
    CheckCircle, RefreshCw, Brain, Target, Users, ShieldAlert, Activity, Info 
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// 🚀 직관성을 극대화한 정량적 프리셋 해설
const PRESET_DESCRIPTIONS = {
    '밸런스 모드': '신규 50% / 복습 30% / 오답 15% / 패시브 5%',
    '오답 학습': '신규 15% / 복습 20% / 오답 60% / 패시브 5%',
    '망각 방어': '신규 0% / 복습 50% / 오답 40% / 패시브 10%',
    '기초 수리': '신규 30% / 복습 20% / 오답 10% / 패시브 40%',
    '스퍼트 모드': '신규 70% / 복습 15% / 오답 10% / 패시브 5%'
};

const StudentVocaDaily = ({ currentUser }) => {
  const { users } = useData();
  
  const isParent = currentUser?.role === 'parent';
  const isStudent = currentUser?.role === 'student';

  const linkedChildren = useMemo(() => {
      if (!isParent) return [];
      return (users || []).filter(u => u.role === 'student' && (currentUser.linkedChildrenIds || []).includes(u.id));
  }, [users, currentUser, isParent]);

  const [selectedChildId, setSelectedChildId] = useState('');
  
  useEffect(() => {
      if (isParent && linkedChildren.length > 0 && !selectedChildId) {
          setSelectedChildId(linkedChildren[0].id);
      }
  }, [isParent, linkedChildren, selectedChildId]);

  const activeStudentId = isStudent ? currentUser.id : (isParent ? selectedChildId : null);
  const targetStudent = (users || []).find(s => s.id === activeStudentId) || currentUser;
  const targetStudentName = targetStudent?.name || currentUser.name;

  const [sessionInfo, setSessionInfo] = useState({ sessionNumber: 1, status: 'loading' });
  const [wordsList, setWordsList] = useState([]);
  const [questionsList, setQuestionsList] = useState([]); // 🚀 시험지 출력용 50문제 데이터 상태 추가
  const [studentStats, setStudentStats] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // 🚀 인쇄 전용 뷰 렌더링 상태
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    const fetchVocaData = async () => {
      try {
        if (isParent && !activeStudentId) {
            if (linkedChildren.length === 0) {
                setErrorMsg("연결된 자녀 정보가 없습니다. 데스크에 문의해주세요.");
                setSessionInfo({ sessionNumber: 0, status: 'no_stat' });
            }
            return;
        }
        if (!activeStudentId) return;

        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, activeStudentId);
        const statSnap = await getDoc(statRef);
        
        if (!statSnap.exists() || !statSnap.data().catScore) {
            setSessionInfo({ sessionNumber: 0, status: 'no_stat' });
            return;
        }

        const stats = statSnap.data();
        setStudentStats(stats);

        const currentSession = stats.vocaSession || 1;
        const testSessionId = `test_${activeStudentId}_s${currentSession}`;
        const testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId));

        if (testSnap.exists()) {
            const testData = testSnap.data();
            if (testData.status === 'completed') {
                setSessionInfo({ sessionNumber: currentSession, status: 'completed' });
            } else {
                setSessionInfo({ sessionNumber: currentSession, status: 'ready' });
                setWordsList(testData.wordsForPrint || []);
                setQuestionsList(testData.questionsForTest || []); // 🚀 50문제 데이터 셋업
            }
        } else {
            setSessionInfo({ sessionNumber: currentSession, status: 'pending' });
        }
      } catch (error) {
        console.error("Data Fetch Error:", error);
        setErrorMsg("데이터를 불러오는 중 오류가 발생했습니다.");
      }
    };

    fetchVocaData();
  }, [activeStudentId, isParent, linkedChildren]);

  const handleGenerateVoca = async () => {
    if (isParent) return alert("단어장 생성은 학생 본인만 가능합니다.");
    setIsGenerating(true);
    setErrorMsg('');
    try {
        const { generateDailyVocaSet } = await import('../utils/vocaEngine');
        const payload = await generateDailyVocaSet(activeStudentId);
        setWordsList(payload.wordsForPrint);
        setQuestionsList(payload.questionsForTest);
        setSessionInfo(prev => ({ ...prev, status: 'ready' }));
        window.location.reload(); 
    } catch (error) {
        console.error(error);
        setErrorMsg(error.message || "단어장 배정에 실패했습니다. 원장님께 문의하세요.");
    } finally {
        setIsGenerating(false);
    }
  };

  // 🚀 [인쇄 로직 패치] CSS 충돌을 피해 컴포넌트를 완전히 새로 그리는 로직
  const handlePrint = () => {
      setPrintMode(true);
      setTimeout(() => {
          window.print();
          setPrintMode(false);
      }, 500); 
  };

  const isPrintReady = sessionInfo.status === 'ready' && questionsList.length > 0;
  const currentPresetName = studentStats?.adaptivePreset || studentStats?.vocaPreset || '밸런스 모드';

  // =====================================================================
  // 🚀 인쇄 모드 전용 렌더링 (일반 컴포넌트 레이아웃 제약 완전 해제)
  // =====================================================================
  if (printMode) {
      return (
          <div className="bg-white text-black p-8 min-h-screen w-full">
              <style>{`
                  @media print {
                      @page { margin: 0; size: A4 portrait; }
                      body { margin: 1.5cm !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                      html, body, #root, .h-screen, .overflow-hidden, .overflow-y-auto, .flex-1, main {
                          height: auto !important; min-height: auto !important; overflow: visible !important; display: block !important;
                      }
                      aside, header { display: none !important; }
                  }
              `}</style>
              <div className="print-page break-after-page mb-10">
                  <div className="flex justify-between border-b-2 border-black pb-4 mb-4">
                      <h2 className="text-2xl font-black">임페리얼 영단어 맞춤형 시험지</h2>
                      <div className="text-right text-sm font-bold">
                          <div>이름: {targetStudentName}</div>
                          <div>날짜: {new Date().toLocaleDateString()} / 점수: _____ / 50</div>
                      </div>
                  </div>
                  <table className="w-full text-left border-collapse text-sm">
                      <thead>
                          <tr className="border-b border-gray-400">
                              <th className="p-2 w-10 text-center">No.</th>
                              <th className="p-2 w-5/12">Question (문제)</th>
                              <th className="p-2 w-7/12">Answer (정답 기재란)</th>
                          </tr>
                      </thead>
                      <tbody>
                          {questionsList.map((q, i) => (
                              <tr key={i} className={`border-b border-gray-200 ${q.questionNumber === 41 ? 'border-t-4 border-t-gray-800' : ''}`}>
                                  <td className="p-2 font-bold text-center">{q.questionNumber}</td>
                                  <td className="p-2 font-black text-lg">
                                      {q.wordText}
                                      {q.hint && <span className="block text-[11px] text-gray-500 font-bold mt-0.5">{q.hint}</span>}
                                  </td>
                                  <td className="p-2 font-semibold text-blue-900">
                                      <div className="border-b border-gray-400 w-full h-7"></div> 
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  <div className="mt-4 text-center text-xs font-bold text-gray-500">
                      * 41번부터 50번 문항은 고차원적 인지 능력을 평가하는 심화 문항입니다.
                  </div>
              </div>
          </div>
      );
  }

  // =====================================================================
  // 일반 화면 렌더링
  // =====================================================================
  if (isParent && linkedChildren.length === 0) {
      return (
          <div className="p-10 text-center flex flex-col items-center">
              <AlertCircle size={48} className="text-gray-300 mb-4" />
              <h2 className="text-xl font-bold text-gray-600">연결된 자녀 정보가 없습니다.</h2>
              <p className="text-gray-400 mt-2">학원 데스크에 자녀 계정 연결을 요청해주세요.</p>
          </div>
      );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 animate-in fade-in pb-20">
      
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

      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-[32px] p-8 sm:p-10 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="relative z-10">
          <Badge variant="outline" className="bg-white/20 text-white border-white/30 mb-3 px-3 py-1">
              {isParent ? '자녀 맞춤형 Voca' : 'Smart Analog Voca Portal'}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black mb-3 flex items-center gap-3">
            <Brain size={36} /> {targetStudentName} 학생의 AI 단어장
          </h1>
          <p className="text-blue-100 font-bold text-sm sm:text-base max-w-2xl break-keep">
            단기 기억에 의존하는 꼼수 암기를 원천 차단합니다. 100% 종이 시험으로 커닝을 방지하고, 
            채점된 결과는 AI가 즉시 분석하여 매일 가장 완벽한 비율의 초개인화 단어장을 배정합니다.
          </p>
        </div>
        <Target className="absolute -right-10 -bottom-10 text-white/10 w-64 h-64 rotate-12 pointer-events-none" />
      </div>

      {errorMsg && (
          <div className="p-4 mb-6 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle size={20} /> {errorMsg}
          </div>
      )}

      {studentStats && sessionInfo.status !== 'no_stat' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-white rounded-[24px] p-6 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <Activity className="text-indigo-600"/> 현재 AI 학습 구동 상태
                    </h3>
                    <Badge className={studentStats.adaptivePreset ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}>
                        {studentStats.adaptivePreset ? '자율주행 개입 중' : '정상 궤도 주행 중'}
                    </Badge>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 mb-4 flex items-center justify-between">
                    <div className="font-black text-xl text-indigo-700">[{currentPresetName}]</div>
                    <div className="text-sm font-bold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                        {PRESET_DESCRIPTIONS[currentPresetName]}
                    </div>
                </div>

                {studentStats.vocaRubric && (
                    <div className={`p-4 rounded-xl text-sm font-bold flex items-start gap-3 
                        ${studentStats.vocaRubric.includes('🚨') ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                        {studentStats.vocaRubric.includes('🚨') ? <ShieldAlert size={20} className="shrink-0 mt-0.5" /> : <Info size={20} className="shrink-0 mt-0.5" />}
                        <span className="leading-relaxed">{studentStats.vocaRubric}</span>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">Core Metrics</h3>
                    <div className="mb-5">
                        <div className="flex justify-between text-sm font-bold mb-1">
                            <span className="text-slate-600">종합 어휘력 지수</span>
                            <span className="text-indigo-700">{studentStats.catScore}점</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, studentStats.catScore / 10)}%` }}></div>
                        </div>
                    </div>
                    <div className="mb-5">
                        <div className="flex justify-between text-sm font-bold mb-1">
                            <span className="text-slate-600">기억 유지율</span>
                            <span className="text-emerald-600">{studentStats.vocaRetention || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div className="bg-emerald-400 h-2.5 rounded-full" style={{ width: `${studentStats.vocaRetention || 0}%` }}></div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-sm font-bold mb-1">
                            <span className="text-slate-600">다의어 이해도</span>
                            <span className="text-amber-600">{studentStats.vocaComprehension || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div className="bg-amber-400 h-2.5 rounded-full" style={{ width: `${studentStats.vocaComprehension || 0}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {!isParent && (
          <div className="flex mb-8">
            <button 
              onClick={handlePrint}
              disabled={!isPrintReady}
              className={`w-full border-2 p-6 rounded-[24px] shadow-sm transition-all flex flex-col items-center justify-center group ${
                isPrintReady 
                  ? 'bg-white border-blue-100 text-blue-600 hover:border-blue-400 hover:shadow-md cursor-pointer' 
                  : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
              }`}
            >
              <div className={`${isPrintReady ? 'bg-blue-50 group-hover:scale-110' : 'bg-slate-200'} p-4 rounded-full mb-3 transition-transform`}>
                <Download size={32} />
              </div>
              <h3 className="text-xl font-black mb-1">단어장 PDF 저장 및 인쇄</h3>
              <p className="text-sm font-bold text-slate-500">대화창이 뜨면 대상을 'PDF로 저장' 또는 '프린터'로 선택하세요</p>
            </button>
          </div>
      )}

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 min-h-[400px]">
          
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-6">
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <FileText className="text-indigo-500" /> 
              {sessionInfo.sessionNumber > 0 ? `임페리얼 ${sessionInfo.sessionNumber}회차 맞춤 어휘 진단` : '임페리얼 프리미엄 Voca'}
            </h2>
            <div className="text-right">
                <div className="text-sm font-bold text-slate-500">이름: {targetStudentName}</div>
                <div className="text-sm font-bold text-slate-500">날짜: {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          {sessionInfo.status === 'no_stat' && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                  <AlertCircle size={56} className="text-slate-300 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">초기 어휘 역량 진단 대기 중</h3>
                  <p className="text-slate-500 font-bold max-w-md break-keep">
                      학원에서 레벨 테스트 점수를 연동하면, 학생의 현재 수준에 완벽히 맞춰진 초개인화 단어장이 이곳에 생성됩니다.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'completed' && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                  <CheckCircle size={56} className="text-emerald-400 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">오늘의 학습 목표 100% 달성!</h3>
                  <p className="text-slate-500 font-bold max-w-md break-keep">
                      이미 {sessionInfo.sessionNumber}회차 어휘 시험 응시 및 채점을 완료했습니다.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'pending' && !isParent && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-indigo-50 p-6 rounded-full mb-6 relative">
                      <Clock size={48} className="text-indigo-500" />
                      {isGenerating && <RefreshCw size={24} className="text-indigo-600 absolute bottom-4 right-4 animate-spin" />}
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 mb-3">오늘의 학습량 배정 대기 중</h3>
                  <p className="text-slate-500 font-bold mb-8 max-w-md break-keep">
                      AI가 {targetStudentName} 학생의 어제 오답과 망각 주기를 0.1초 만에 분석하여 가장 효율적인 40단어를 추출합니다.
                  </p>
                  <button 
                      onClick={handleGenerateVoca}
                      disabled={isGenerating}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-black px-8 py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"
                  >
                      {isGenerating ? 'AI가 최적의 어휘를 배정하는 중...' : '오늘의 단어장 생성하기'} <Play size={20} className={isGenerating ? 'hidden' : ''} />
                  </button>
              </div>
          )}

          {sessionInfo.status === 'pending' && isParent && (
              <div className="py-20 text-center flex flex-col items-center justify-center">
                  <Clock size={56} className="text-slate-300 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">단어장 생성 대기 중</h3>
                  <p className="text-slate-500 font-bold">
                      자녀가 아직 오늘의 단어장을 생성하지 않았습니다.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'ready' && wordsList.length > 0 && (
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-slate-50">
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-16 text-center">No.</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-1/3">Target Vocabulary</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700">Core Meaning (핵심 의미)</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-24 text-center">AI 배정 사유</th>
                      </tr>
                  </thead>
                  <tbody>
                      {wordsList.map((word, idx) => (
                          <tr key={word.wordId} className="border-b border-slate-100">
                              <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                              <td className="p-3 font-black text-lg text-slate-800 tracking-wide">{word.word}</td>
                              <td className="p-3 font-bold text-slate-600">
                                  {word.meanings && word.meanings.length > 0 
                                      ? word.meanings.map(m => m.koreanMeaning).join(', ') 
                                      : '뜻 정보 없음'}
                              </td>
                              <td className="p-3 text-center">
                                  <span className={`text-[11px] px-2 py-1 rounded-md font-black whitespace-nowrap
                                      ${word.queueType === '만성 오답' ? 'bg-rose-100 text-rose-700' : 
                                        word.queueType === '오답' ? 'bg-orange-100 text-orange-700' :
                                        word.queueType === '복습' ? 'bg-emerald-100 text-emerald-700' :
                                        word.queueType === '패시브' ? 'bg-slate-100 text-slate-600' :
                                        'bg-blue-100 text-blue-700'
                                      }`}
                                  >
                                      {word.queueType}
                                  </span>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          )}
      </div>
    </div>
  );
};

export default StudentVocaDaily;