/* [서비스 가치] 스마트 아날로그 Voca 클라이언트 포털 (프론트엔드-백엔드 융합)
   학생은 꼼수 없는 100% 종이 시험지를 출력하기 위해 이 화면에 진입합니다.
   'print:hidden' 등의 미디어 쿼리를 사용하여, 화면에서는 수려한 UI를 제공하되 
   인쇄 시에는 잉크를 절약하는 완벽한 흑백 A4 시험지로 렌더링되도록 최적화했습니다. */
import React, { useState, useEffect } from 'react';
import { Printer, BookOpen, Clock, FileText, Download, Play, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { generateDailyVocaSet } from '../utils/vocaEngine';

const APP_ID = 'imperial-clinic-v1';

const StudentVocaDaily = ({ currentUser }) => {
  const [sessionInfo, setSessionInfo] = useState({ sessionNumber: 1, status: 'loading' });
  const [wordsList, setWordsList] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. 오늘의 회차 및 기생성된 단어장 여부 확인 (Check-then-Act 방어 로직)
  useEffect(() => {
    const checkTodaySession = async () => {
      try {
        if (!currentUser || currentUser.role !== 'student') return;

        // 학생 스탯 확인
        const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, currentUser.id);
        const statSnap = await getDoc(statRef);
        
        if (!statSnap.exists() || !statSnap.data().catScore) {
            setSessionInfo({ sessionNumber: 0, status: 'no_stat' });
            return;
        }

        const currentSession = statSnap.data().vocaSession || 1;
        
        // 이번 회차(currentSession)의 시험지가 이미 만들어져 있는지 확인
        const testSessionId = `test_${currentUser.id}_s${currentSession}`;
        const testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, testSessionId));

        if (testSnap.exists()) {
            // 이미 생성됨
            const testData = testSnap.data();
            if (testData.status === 'completed') {
                setSessionInfo({ sessionNumber: currentSession, status: 'completed' });
            } else {
                setSessionInfo({ sessionNumber: currentSession, status: 'ready' });
                setWordsList(testData.wordsForPrint || []);
            }
        } else {
            // 아직 안 만들어짐 -> 생성 대기 상태
            setSessionInfo({ sessionNumber: currentSession, status: 'pending' });
        }
      } catch (error) {
        console.error("Session Check Error:", error);
        setErrorMsg("데이터를 불러오는 중 오류가 발생했습니다.");
      }
    };

    checkTodaySession();
  }, [currentUser]);

  // 2. 백엔드 엔진 구동 (Voca Engine 호출)
  const handleGenerateVoca = async () => {
    setIsGenerating(true);
    setErrorMsg('');
    try {
        // 백엔드 출제 알고리즘 호출 (기본 밸런스 모드 적용)
        const payload = await generateDailyVocaSet(currentUser.id, '밸런스 모드');
        
        setWordsList(payload.wordsForPrint);
        setSessionInfo(prev => ({ ...prev, status: 'ready' }));
    } catch (error) {
        console.error(error);
        setErrorMsg(error.message || "단어장 생성에 실패했습니다. 원장님께 문의하세요.");
    } finally {
        setIsGenerating(false);
    }
  };

  // 3. 인쇄 트리거
  const handlePrint = () => {
      window.print();
  };

  // 🚀 예외 상태 처리 UI
  if (sessionInfo.status === 'no_stat') {
      return (
          <div className="max-w-5xl mx-auto p-8 text-center bg-white rounded-3xl shadow-sm mt-10">
              <AlertCircle size={64} className="mx-auto text-rose-400 mb-4" />
              <h2 className="text-2xl font-black text-slate-800 mb-2">초기 진단이 필요합니다</h2>
              <p className="text-slate-500 font-bold">원장님 또는 강사님이 CAT 초기 진단 점수를 입력해야 맞춤형 단어장이 생성됩니다.</p>
          </div>
      );
  }

  if (sessionInfo.status === 'completed') {
      return (
          <div className="max-w-5xl mx-auto p-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200 mt-10">
              <CheckCircle size={64} className="mx-auto text-emerald-500 mb-4" />
              <h2 className="text-2xl font-black text-slate-800 mb-2">오늘의 Voca 미션 완료!</h2>
              <p className="text-slate-500 font-bold">이미 {sessionInfo.sessionNumber}회차 시험을 통과했습니다. 다음 회차를 기다려주세요.</p>
          </div>
      );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 animate-in fade-in pb-20">
      
      {/* 🚀 화면 표시용 헤더 (인쇄 시 숨김 처리: print:hidden) */}
      <div className="print:hidden bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[32px] p-8 sm:p-10 text-white shadow-lg mb-8 relative overflow-hidden">
        <div className="relative z-10">
          <Badge variant="outline" className="bg-white/20 text-white border-white/30 mb-3 px-3 py-1">
              제 {sessionInfo.sessionNumber} 회차 단어장
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black mb-3 flex items-center gap-3">
            <BookOpen size={36} /> 오늘의 맞춤 영단어 미션
          </h1>
          <p className="text-blue-100 font-bold text-sm sm:text-base max-w-xl break-keep">
            에빙하우스 망각 주기에 맞춰 오늘 반드시 외워야 할 40개의 단어가 준비됩니다. 
            단어장을 출력하여 스펠링과 뜻을 확실히 암기하세요.
          </p>
        </div>
        <BookOpen className="absolute -right-10 -bottom-10 text-white/10 w-64 h-64 rotate-12 pointer-events-none" />
      </div>

      {errorMsg && (
          <div className="print:hidden p-4 mb-6 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle size={20} /> {errorMsg}
          </div>
      )}

      {/* 🚀 생성 전 상태 UI (인쇄 시 숨김) */}
      {sessionInfo.status === 'pending' && (
          <div className="print:hidden flex flex-col items-center justify-center p-12 bg-white border border-slate-200 rounded-[32px] shadow-sm text-center">
              <div className="bg-indigo-50 p-6 rounded-full mb-6 relative">
                  <Clock size={48} className="text-indigo-500" />
                  {isGenerating && <RefreshCw size={24} className="text-indigo-600 absolute bottom-4 right-4 animate-spin" />}
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-3">단어 출제 엔진 대기 중</h3>
              <p className="text-slate-500 font-bold mb-8 max-w-md break-keep">
                  학생의 최근 오답 기록과 망각 주기를 분석하여 오늘 외워야 할 완벽한 조합의 40단어를 생성합니다.
              </p>
              <button 
                  onClick={handleGenerateVoca}
                  disabled={isGenerating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-black px-8 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {isGenerating ? 'AI가 단어를 섞는 중...' : '오늘의 단어장 생성하기'} <Play size={20} className={isGenerating ? 'hidden' : ''} />
              </button>
          </div>
      )}

      {/* 🚀 단어가 생성된 후 UI (제어 버튼 영역 - 인쇄 시 숨김) */}
      {sessionInfo.status === 'ready' && wordsList.length > 0 && (
          <>
            <div className="print:hidden flex flex-col sm:flex-row gap-6 mb-8">
              <button 
                onClick={handlePrint}
                className="flex-1 bg-white border-2 border-indigo-100 p-6 rounded-[24px] shadow-sm hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center justify-center text-indigo-600 group"
              >
                <div className="bg-indigo-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <Printer size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2">오늘의 단어장 인쇄하기</h3>
                <p className="text-sm font-bold text-slate-500">A4 용지 규격 흑백 최적화</p>
              </button>

              <button 
                onClick={handlePrint} // PDF로 저장은 인쇄 메뉴에서 'PDF로 저장'을 선택하도록 유도하는 것이 웹 표준입니다.
                className="flex-1 bg-white border-2 border-emerald-100 p-6 rounded-[24px] shadow-sm hover:border-emerald-400 hover:shadow-md transition-all flex flex-col items-center justify-center text-emerald-600 group"
              >
                <div className="bg-emerald-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <Download size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2">PDF로 저장하기</h3>
                <p className="text-sm font-bold text-slate-500">태블릿 열람용 (인쇄 메뉴 활용)</p>
              </button>
            </div>

            {/* 🚀 인쇄 시 보여질 영역 (print:block, 데스크탑에서는 예쁜 카드로) */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 print:shadow-none print:border-none print:p-0 print:m-0">
              
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-6 print:mb-4">
                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                  <FileText className="text-indigo-500 print:hidden" /> 
                  임페리얼 {sessionInfo.sessionNumber}회차 단어장
                </h2>
                <div className="text-right">
                    <div className="text-sm font-bold text-slate-500">이름: {currentUser.name}</div>
                    <div className="text-sm font-bold text-slate-500">날짜: {new Date().toLocaleDateString()}</div>
                </div>
              </div>

              {/* 🚀 인쇄용 테이블: 불필요한 색상을 빼고 선명한 흑백(text-black)으로 렌더링 */}
              <table className="w-full text-left border-collapse print:w-full print:text-black">
                  <thead>
                      <tr className="bg-slate-50 print:bg-transparent">
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-16 text-center">번호</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-1/3">영단어 (스펠링)</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700">한글 뜻 / 설명</th>
                          <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-24 text-center print:hidden">출제 사유</th>
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
                                  {/* 화면에만 보여주는 학생 메타인지(동기부여)용 뱃지 */}
                                  <span className={`text-[11px] px-2 py-1 rounded-md font-black whitespace-nowrap
                                      ${word.queueType === '만성 오답' ? 'bg-rose-100 text-rose-700' : 
                                        word.queueType === '오답' ? 'bg-orange-100 text-orange-700' :
                                        word.queueType === '복습' ? 'bg-emerald-100 text-emerald-700' :
                                        word.queueType === '패시브' ? 'bg-slate-100 text-slate-600' :
                                        'bg-blue-100 text-blue-700' // 신규
                                      }`}
                                  >
                                      {word.queueType}
                                  </span>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
            </div>
          </>
      )}
    </div>
  );
};

export default StudentVocaDaily;