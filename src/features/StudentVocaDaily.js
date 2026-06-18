/* [서비스 가치] 스마트 아날로그 Voca 클라이언트 포털 (학생/학부모용 통합 뷰)
   100% 종이 시험의 아날로그적 꼼수 차단 효과와, AI의 디지털 데이터 분석 리포트를 결합했습니다.
   (🚀 CTO 프린트 패치: 인쇄/PDF 저장 시 내용이 잘리는 현상 해결 및 브라우저 URL, 날짜 헤더 완벽 제거) */
import React, { useState, useEffect } from 'react';
import { 
    Printer, BookOpen, Clock, FileText, Download, Play, AlertCircle, 
    CheckCircle, RefreshCw, Brain, Target, ShieldAlert, Activity, Info 
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { generateDailyVocaSet } from '../utils/vocaEngine';
import { Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const PRESET_DESCRIPTIONS = {
    '밸런스 모드': '신규 단어 진도(50%)와 누적 복습(30%)을 가장 이상적인 비율로 혼합하여 진행하는 표준 모드입니다.',
    '오답 학습': '학생의 오답 대기열이 포화 상태입니다. 진도보다는 취약점(오답 60%)을 집중 공략하여 학습 결손을 메웁니다.',
    '망각 방어': '단기 기억이 장기 기억으로 전환되지 못하고 있습니다. 신규 진도를 멈추고 복습(50%)에 전념하여 기초를 다집니다.',
    '기초 수리': '하위 레벨의 쉬운 단어(패시브 40%)부터 빠르게 스캔하여 어휘력의 빈틈을 촘촘하게 수리하는 모드입니다.',
    '스퍼트 모드': '학생의 성취도가 매우 우수합니다. 신규 단어(70%)를 공격적으로 투입하여 진도를 폭발적으로 끌어올립니다.'
};

const StudentVocaDaily = ({ currentUser }) => {
  const { users } = useData();
  const [sessionInfo, setSessionInfo] = useState({ sessionNumber: 1, status: 'loading' });
  const [wordsList, setWordsList] = useState([]);
  const [studentStats, setStudentStats] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const targetStudent = currentUser.role === 'parent' 
      ? users.find(u => u.name === currentUser.childName && u.role === 'student') 
      : currentUser;
      
  const targetStudentId = targetStudent?.id || currentUser.id;
  const targetStudentName = targetStudent?.name || currentUser.name;
  const isParentView = currentUser.role === 'parent';

  useEffect(() => {
    const fetchVocaData = async () => {
      try {
        if (!targetStudentId) {
            setErrorMsg("자녀 정보를 시스템에서 찾을 수 없습니다. 데스크에 문의해주세요.");
            setSessionInfo({ sessionNumber: 0, status: 'no_stat' });
            return;
        }

        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, targetStudentId);
        const statSnap = await getDoc(statRef);
        
        if (!statSnap.exists() || !statSnap.data().catScore) {
            setSessionInfo({ sessionNumber: 0, status: 'no_stat' });
            return;
        }

        const stats = statSnap.data();
        setStudentStats(stats); 

        const currentSession = stats.vocaSession || 1;
        const testSessionId = `test_${targetStudentId}_s${currentSession}`;
        const testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId));

        if (testSnap.exists()) {
            const testData = testSnap.data();
            if (testData.status === 'completed') {
                setSessionInfo({ sessionNumber: currentSession, status: 'completed' });
            } else {
                setSessionInfo({ sessionNumber: currentSession, status: 'ready' });
                setWordsList(testData.wordsForPrint || []);
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
  }, [targetStudentId]);

  const handleGenerateVoca = async () => {
    if (isParentView) return alert("단어장 생성은 학생 본인만 가능합니다.");
    setIsGenerating(true);
    setErrorMsg('');
    try {
        const payload = await generateDailyVocaSet(targetStudentId);
        setWordsList(payload.wordsForPrint);
        setSessionInfo(prev => ({ ...prev, status: 'ready' }));
        window.location.reload(); 
    } catch (error) {
        console.error(error);
        setErrorMsg(error.message || "단어장 배정에 실패했습니다. 원장님께 문의하세요.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handlePrint = () => window.print();
  const isPrintReady = sessionInfo.status === 'ready' && wordsList.length > 0;
  const currentPresetName = studentStats?.adaptivePreset || studentStats?.vocaPreset || '밸런스 모드';

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 animate-in fade-in pb-20">
      
      {/* 🚀 [프린트 최적화 CSS] 브라우저 헤더/푸터 제거 및 레이아웃 잘림 방지 */}
      <style>{`
        @media print {
            /* 브라우저 상하단 URL, 시간, 페이지 번호 제거 */
            @page { margin: 0; }
            
            /* 프린트 여백 생성 및 색상 강제 유지 */
            body { 
                margin: 1.5cm !important; 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
            }

            /* React 레이아웃의 overflow-hidden 때문에 데이터가 안 나오는 현상 완전 해결 */
            html, body, #root, .h-screen, .overflow-hidden, .overflow-y-auto {
                height: auto !important;
                min-height: auto !important;
                overflow: visible !important;
            }
            
            /* 스크롤 영역을 block으로 풀어주어 모든 페이지가 출력되게 함 */
            .flex.h-screen, main.flex-1 {
                display: block !important;
            }

            /* 사이드바 및 헤더 강제 숨김 */
            aside, header { display: none !important; }
        }
      `}</style>

      {/* 1. 글로벌 배너 */}
      <div className="print:hidden bg-gradient-to-r from-blue-700 to-indigo-800 rounded-[32px] p-8 sm:p-10 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="relative z-10">
          <Badge variant="outline" className="bg-white/20 text-white border-white/30 mb-3 px-3 py-1">
              {isParentView ? '학부모 안심 리포트' : 'Smart Analog Voca Portal'}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black mb-3 flex items-center gap-3">
            <Brain size={36} /> {targetStudentName} 학생의 맞춤형 Voca 엔진
          </h1>
          <p className="text-blue-100 font-bold text-sm sm:text-base max-w-2xl break-keep">
            단기 기억에 의존하는 꼼수 암기를 원천 차단합니다. 100% 종이 시험으로 커닝을 방지하고, 
            채점된 결과는 AI가 즉시 분석하여 매일 가장 완벽한 비율의 초개인화 단어장을 배정합니다.
          </p>
        </div>
        <Target className="absolute -right-10 -bottom-10 text-white/10 w-64 h-64 rotate-12 pointer-events-none" />
      </div>

      {errorMsg && (
          <div className="print:hidden p-4 mb-6 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle size={20} /> {errorMsg}
          </div>
      )}

      {/* 2. 투명한 데이터 공유 대시보드 */}
      {studentStats && sessionInfo.status !== 'no_stat' && (
        <div className="print:hidden grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-white rounded-[24px] p-6 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <Activity className="text-indigo-600"/> 현재 AI 학습 구동 상태
                    </h3>
                    <Badge className={studentStats.adaptivePreset ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}>
                        {studentStats.adaptivePreset ? '자율주행 개입 중' : '정상 궤도 주행 중'}
                    </Badge>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 mb-4">
                    <div className="font-black text-xl text-indigo-700 mb-2">[{currentPresetName}] 가동 중</div>
                    <p className="text-sm font-bold text-slate-600 leading-relaxed">
                        {PRESET_DESCRIPTIONS[currentPresetName]}
                    </p>
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
                            <span className="text-slate-600">초기 진단 (CAT) 레벨</span>
                            <span className="text-indigo-700">{studentStats.catScore}점</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, studentStats.catScore / 10)}%` }}></div>
                        </div>
                    </div>
                    <div className="mb-5">
                        <div className="flex justify-between text-sm font-bold mb-1">
                            <span className="text-slate-600">기억 유지율 (Retention)</span>
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

      {/* 🚀 3. 버튼 1개로 통일 (PDF 다운로드 전용) */}
      {!isParentView && (
          <div className="print:hidden flex mb-8">
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

      {/* 4. 본문 컨텐츠 영역 */}
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 print:shadow-none print:border-none print:p-0 print:m-0 min-h-[400px]">
          
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-6 print:mb-4">
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <FileText className="text-indigo-500 print:hidden" /> 
              {sessionInfo.sessionNumber > 0 ? `임페리얼 ${sessionInfo.sessionNumber}회차 맞춤 어휘 진단` : '임페리얼 프리미엄 Voca'}
            </h2>
            <div className="text-right">
                <div className="text-sm font-bold text-slate-500">이름: {targetStudentName}</div>
                <div className="text-sm font-bold text-slate-500">날짜: {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          {sessionInfo.status === 'no_stat' && (
              <div className="print:hidden flex flex-col items-center justify-center py-20 text-center">
                  <AlertCircle size={56} className="text-slate-300 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">초기 어휘 역량 진단 대기 중</h3>
                  <p className="text-slate-500 font-bold max-w-md break-keep">
                      학원에서 레벨 테스트(CAT) 점수를 연동하면, 학생의 현재 수준에 완벽히 맞춰진 초개인화 단어장이 이곳에 생성됩니다.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'completed' && (
              <div className="print:hidden flex flex-col items-center justify-center py-20 text-center">
                  <CheckCircle size={56} className="text-emerald-400 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">오늘의 학습 목표 100% 달성!</h3>
                  <p className="text-slate-500 font-bold max-w-md break-keep">
                      이미 {sessionInfo.sessionNumber}회차 어휘 시험 응시 및 채점을 완료했습니다. 위 대시보드에서 학습 결과를 확인하세요.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'pending' && !isParentView && (
              <div className="print:hidden flex flex-col items-center justify-center py-10 text-center">
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

          {sessionInfo.status === 'pending' && isParentView && (
              <div className="print:hidden py-20 text-center text-slate-500 font-bold">
                  자녀가 아직 오늘의 단어장을 생성하지 않았습니다.
              </div>
          )}

          {sessionInfo.status === 'ready' && wordsList.length > 0 && (
              <table className="w-full text-left border-collapse print:w-full print:text-black">
                  <thead>
                      <tr className="bg-slate-50 print:bg-transparent">
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-16 text-center">No.</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-1/3">Target Vocabulary</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700">Core Meaning (핵심 의미)</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-24 text-center print:hidden">AI 배정 사유</th>
                      </tr>
                  </thead>
                  <tbody>
                      {wordsList.map((word, idx) => (
                          <tr key={word.wordId} className="border-b border-slate-100 print:border-slate-300">
                              <td className="p-3 text-center font-bold text-slate-400 print:text-black">{idx + 1}</td>
                              <td className="p-3 font-black text-lg text-slate-800 print:text-black tracking-wide">{word.word}</td>
                              <td className="p-3 font-bold text-slate-600 print:text-black">
                                  {word.meanings && word.meanings.length > 0 
                                      ? word.meanings.map(m => m.koreanMeaning).join(', ') 
                                      : '뜻 정보 없음'}
                              </td>
                              <td className="p-3 text-center print:hidden">
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