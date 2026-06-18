/* [서비스 가치] 스마트 아날로그 Voca 클라이언트 포털 (UI/UX 뼈대 고정 및 프리미엄 UX 라이팅 적용)
   학생이 점수가 없더라도 에러 화면으로 튕기지 않고, '인쇄 버튼'과 '단어장 틀'을 그대로 보여주어
   서비스의 안정감을 줍니다. 데이터가 없는 경우 우아하게(Graceful) 빈 상태(Empty State)를 안내하며,
   모든 워딩(Wording)은 학부모와 학생의 신뢰도를 높이는 에듀테크 전문 용어로 구성되었습니다. */
import React, { useState, useEffect } from 'react';
import { Printer, BookOpen, Clock, FileText, Download, Play, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { generateDailyVocaSet } from '../utils/vocaEngine';

// 🚀 [CTO 버그 픽스] 빈 화면(Crash)의 원인이었던 Badge 컴포넌트 Import 추가 완료!
import { Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const StudentVocaDaily = ({ currentUser }) => {
  const [sessionInfo, setSessionInfo] = useState({ sessionNumber: 1, status: 'loading' });
  const [wordsList, setWordsList] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. 오늘의 회차 및 상태 확인
  useEffect(() => {
    const checkTodaySession = async () => {
      try {
        if (!currentUser || currentUser.role !== 'student') return;

        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, currentUser.id);
        const statSnap = await getDoc(statRef);
        
        // CAT 점수가 없는 경우 에러로 튕기지 않고 'no_stat' 상태만 부여
        if (!statSnap.exists() || !statSnap.data().catScore) {
            setSessionInfo({ sessionNumber: 0, status: 'no_stat' });
            return;
        }

        const currentSession = statSnap.data().vocaSession || 1;
        const testSessionId = `test_${currentUser.id}_s${currentSession}`;
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
        console.error("Session Check Error:", error);
        setErrorMsg("데이터를 불러오는 중 오류가 발생했습니다.");
      }
    };

    checkTodaySession();
  }, [currentUser]);

  // 2. 단어장 생성 엔진 구동
  const handleGenerateVoca = async () => {
    setIsGenerating(true);
    setErrorMsg('');
    try {
        const payload = await generateDailyVocaSet(currentUser.id, '밸런스 모드');
        setWordsList(payload.wordsForPrint);
        setSessionInfo(prev => ({ ...prev, status: 'ready' }));
    } catch (error) {
        console.error(error);
        setErrorMsg(error.message || "단어장 배정에 실패했습니다. 원장님께 문의하세요.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handlePrint = () => {
      window.print();
  };

  // 버튼 활성화 조건: 'ready' 상태이고 단어 리스트가 있을 때만 클릭 가능
  const isPrintReady = sessionInfo.status === 'ready' && wordsList.length > 0;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 animate-in fade-in pb-20">
      
      {/* 1. 화면 상단 배너 (항상 고정 노출) */}
      <div className="print:hidden bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[32px] p-8 sm:p-10 text-white shadow-lg mb-8 relative overflow-hidden">
        <div className="relative z-10">
          <Badge variant="outline" className="bg-white/20 text-white border-white/30 mb-3 px-3 py-1">
              {sessionInfo.sessionNumber > 0 ? `제 ${sessionInfo.sessionNumber} 회차 어휘 역량 진단` : 'AI Voca 엔진 대기 중'}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black mb-3 flex items-center gap-3">
            <BookOpen size={36} /> AI 기반 초개인화 영단어장
          </h1>
          <p className="text-blue-100 font-bold text-sm sm:text-base max-w-xl break-keep">
            에빙하우스 망각 주기와 누적 오답 데이터를 AI가 분석하여, 오늘 반드시 마스터해야 할 최적의 어휘 40개를 배정했습니다. 단어장을 출력하여 스펠링과 뜻을 완벽히 숙지하세요.
          </p>
        </div>
        <BookOpen className="absolute -right-10 -bottom-10 text-white/10 w-64 h-64 rotate-12 pointer-events-none" />
      </div>

      {errorMsg && (
          <div className="print:hidden p-4 mb-6 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle size={20} /> {errorMsg}
          </div>
      )}

      {/* 2. 다운로드 및 인쇄 버튼 영역 */}
      <div className="print:hidden flex flex-col sm:flex-row gap-6 mb-8">
        <button 
          onClick={handlePrint}
          disabled={!isPrintReady}
          className={`flex-1 border-2 p-6 rounded-[24px] shadow-sm transition-all flex flex-col items-center justify-center group ${
            isPrintReady 
              ? 'bg-white border-indigo-100 text-indigo-600 hover:border-indigo-400 hover:shadow-md cursor-pointer' 
              : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
          }`}
        >
          <div className={`${isPrintReady ? 'bg-indigo-50 group-hover:scale-110' : 'bg-slate-200'} p-4 rounded-full mb-4 transition-transform`}>
            <Printer size={32} />
          </div>
          <h3 className="text-xl font-black mb-2">초개인화 단어장 인쇄하기</h3>
          <p className="text-sm font-bold text-slate-500">A4 용지 규격 흑백 최적화</p>
        </button>

        <button 
          onClick={handlePrint}
          disabled={!isPrintReady}
          className={`flex-1 border-2 p-6 rounded-[24px] shadow-sm transition-all flex flex-col items-center justify-center group ${
            isPrintReady 
              ? 'bg-white border-emerald-100 text-emerald-600 hover:border-emerald-400 hover:shadow-md cursor-pointer' 
              : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
          }`}
        >
          <div className={`${isPrintReady ? 'bg-emerald-50 group-hover:scale-110' : 'bg-slate-200'} p-4 rounded-full mb-4 transition-transform`}>
            <Download size={32} />
          </div>
          <h3 className="text-xl font-black mb-2">PDF 학습자료 다운로드</h3>
          <p className="text-sm font-bold text-slate-500">태블릿 열람용 (인쇄 메뉴 활용)</p>
        </button>
      </div>

      {/* 3. 본문 컨텐츠 영역 (상태에 따라 내부 메시지 교체) */}
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 print:shadow-none print:border-none print:p-0 print:m-0 min-h-[400px]">
          
          {/* 본문 헤더 */}
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-6 print:mb-4">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <FileText className="text-indigo-500 print:hidden" /> 
              {sessionInfo.sessionNumber > 0 ? `임페리얼 ${sessionInfo.sessionNumber}회차 맞춤 어휘 진단` : '임페리얼 프리미엄 Voca'}
            </h2>
            <div className="text-right">
                <div className="text-sm font-bold text-slate-500">이름: {currentUser.name}</div>
                <div className="text-sm font-bold text-slate-500">날짜: {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          {/* 상태별 렌더링 분기 */}
          {sessionInfo.status === 'no_stat' && (
              <div className="print:hidden flex flex-col items-center justify-center py-20 text-center">
                  <AlertCircle size={56} className="text-slate-300 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">초기 어휘 역량 진단이 필요합니다</h3>
                  <p className="text-slate-500 font-bold max-w-md break-keep">
                      강사님이 레벨 테스트(CAT) 결과를 시스템에 연동하면, 학생의 현재 수준에 완벽히 맞춰진 초개인화 단어장이 즉시 자동 생성됩니다.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'completed' && (
              <div className="print:hidden flex flex-col items-center justify-center py-20 text-center">
                  <CheckCircle size={56} className="text-emerald-400 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">오늘의 권장 학습 목표 100% 달성!</h3>
                  <p className="text-slate-500 font-bold max-w-md break-keep">
                      이미 {sessionInfo.sessionNumber}회차 어휘 역량 진단 및 채점을 완료했습니다. 다음 등원일에 새로운 맞춤형 단어장이 배정됩니다.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'pending' && (
              <div className="print:hidden flex flex-col items-center justify-center py-10 text-center">
                  <div className="bg-indigo-50 p-6 rounded-full mb-6 relative">
                      <Clock size={48} className="text-indigo-500" />
                      {isGenerating && <RefreshCw size={24} className="text-indigo-600 absolute bottom-4 right-4 animate-spin" />}
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 mb-3">맞춤 어휘 배정 대기 중</h3>
                  <p className="text-slate-500 font-bold mb-8 max-w-md break-keep">
                      학생의 누적 학습 데이터와 취약점을 AI가 분석하여, 가장 학습 효율이 높은 최적의 40단어를 추출합니다.
                  </p>
                  <button 
                      onClick={handleGenerateVoca}
                      disabled={isGenerating}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-black px-8 py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      {isGenerating ? 'AI가 최적의 어휘를 배정하는 중...' : '일일 어휘 역량 진단 시작'} <Play size={20} className={isGenerating ? 'hidden' : ''} />
                  </button>
              </div>
          )}

          {/* 데이터가 생성된 후 표 렌더링 */}
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