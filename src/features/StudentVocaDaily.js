/* [서비스 가치] 스마트 아날로그 Voca 클라이언트 포털 (학생/학부모용 통합 뷰)
   (🚀 학부모 계정 패치: 학부모 로그인 시 본인을 학생으로 인식하던 버그를 해결하고, 
   연결된 자녀의 데이터를 불러와 학생과 동일한 Voca 단어장 화면을 보여줍니다.) */
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Printer, BookOpen, Clock, FileText, Download, Play, AlertCircle, 
    CheckCircle, RefreshCw, Brain, Target, Users 
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const StudentVocaDaily = ({ currentUser }) => {
  const { users } = useData();
  
  // 🚀 학부모 여부 확인 및 연결된 자녀 리스트 추출
  const isParent = currentUser?.role === 'parent';
  const isStudent = currentUser?.role === 'student';

  const linkedChildren = useMemo(() => {
      if (!isParent) return [];
      return (users || []).filter(u => u.role === 'student' && (currentUser.linkedChildrenIds || []).includes(u.id));
  }, [users, currentUser, isParent]);

  const [selectedChildId, setSelectedChildId] = useState('');
  
  // 자녀가 1명이면 자동 선택
  useEffect(() => {
      if (isParent && linkedChildren.length > 0 && !selectedChildId) {
          setSelectedChildId(linkedChildren[0].id);
      }
  }, [isParent, linkedChildren, selectedChildId]);

  // 실제 렌더링 대상(타겟) 설정
  const activeStudentId = isStudent ? currentUser.id : (isParent ? selectedChildId : null);
  const targetStudent = (users || []).find(s => s.id === activeStudentId) || currentUser;
  const targetStudentName = targetStudent?.name || currentUser.name;

  const [sessionInfo, setSessionInfo] = useState({ sessionNumber: 1, status: 'loading' });
  const [wordsList, setWordsList] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. 데이터 및 오늘의 상태 동기화
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

  // 2. 단어장 생성 엔진 (학부모는 생성 불가)
  const handleGenerateVoca = async () => {
    if (isParent) return alert("단어장 생성은 학생 본인만 가능합니다.");
    setIsGenerating(true);
    setErrorMsg('');
    try {
        // 실제 단어장 생성 로직 호출
        const { generateDailyVocaSet } = await import('../utils/vocaEngine');
        const payload = await generateDailyVocaSet(activeStudentId);
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

  // 🚀 학부모인데 연결된 자녀가 없을 경우 안내
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
      
      {/* 🚀 [프린트 최적화 CSS] 브라우저 헤더/푸터 제거 및 레이아웃 잘림 방지 */}
      <style>{`
        @media print {
            @page { margin: 0; }
            body { 
                margin: 1.5cm !important; 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
            }
            html, body, #root, .h-screen, .overflow-hidden, .overflow-y-auto {
                height: auto !important;
                min-height: auto !important;
                overflow: visible !important;
            }
            .flex.h-screen, main.flex-1 { display: block !important; }
            aside, header { display: none !important; }
        }
      `}</style>

      {/* 🚀 다자녀 학부모 전용 자녀 선택 드롭다운 */}
      {isParent && linkedChildren.length > 1 && (
          <div className="print:hidden bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 flex items-center justify-between mb-4">
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

      {/* 1. 글로벌 배너 */}
      <div className="print:hidden bg-gradient-to-r from-blue-700 to-indigo-800 rounded-[32px] p-8 sm:p-10 text-white shadow-lg mb-6 relative overflow-hidden">
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
          <div className="print:hidden p-4 mb-6 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle size={20} /> {errorMsg}
          </div>
      )}

      {/* 2. 다운로드 버튼 영역 (학생/학부모 공통) */}
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

      {/* 3. 본문 컨텐츠 영역 */}
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
                      이미 {sessionInfo.sessionNumber}회차 어휘 시험 응시 및 채점을 완료했습니다.
                  </p>
              </div>
          )}

          {sessionInfo.status === 'pending' && !isParent && (
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

          {sessionInfo.status === 'pending' && isParent && (
              <div className="print:hidden py-20 text-center flex flex-col items-center justify-center">
                  <Clock size={56} className="text-slate-300 mb-4" />
                  <h3 className="text-2xl font-black text-slate-700 mb-2">단어장 생성 대기 중</h3>
                  <p className="text-slate-500 font-bold">
                      자녀가 아직 오늘의 단어장을 생성하지 않았습니다.
                  </p>
              </div>
          )}

          {/* 데이터 표 렌더링 */}
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