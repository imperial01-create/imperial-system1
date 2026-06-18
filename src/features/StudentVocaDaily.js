/* [서비스 가치(Service Value)] 스마트 아날로그 Voca 클라이언트 포털
   학습 효율 (Learner): 단어장 출력 및 화면 표시 시, 품사별 뜻 넘버링과 완전한 예문(Full Context)을 결합 노출하여 단편적 암기를 방지하고 입체적인 장기기억을 유도합니다. */
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
  const [questionsList, setQuestionsList] = useState([]); 
  const [studentStats, setStudentStats] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
                setQuestionsList(testData.questionsForTest || []); 
            }
        } else {
            setSessionInfo({ sessionNumber: currentSession, status: 'pending' });
        }
      } catch (error) {
        console.error("Data Fetch Error:", error);
        setErrorMsg("데이터를 동기화하는 데 문제가 발생했습니다. (권한 대기 중이거나 네트워크를 확인해주세요)");
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

  // =====================================================================
  // 🚀 순수 HTML 생성 및 새 창 인쇄 엔진 (단어장 출력)
  // =====================================================================
  const handlePrint = () => {
    if (!wordsList || wordsList.length === 0) return alert("인쇄할 데이터가 없습니다.");

    let htmlContent = `
      <html>
        <head>
          <title>임페리얼 맞춤형 어휘 리포트</title>
          <style>
            @page { margin: 0; size: A4 portrait; }
            body { 
                font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
                color: #111; 
                margin: 0; 
                padding: 15mm 15mm 15mm 15mm; 
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
            }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; align-items: flex-end; }
            .header h2 { margin: 0; font-size: 24px; font-weight: bold; color: #0f172a; }
            .header .info { text-align: right; font-size: 14px; font-weight: bold; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; table-layout: fixed; }
            th, td { border-bottom: 1px solid #cbd5e1; padding: 12px 8px; text-align: left; vertical-align: top; word-break: break-word; }
            th { background-color: #f8fafc; font-weight: bold; color: #475569; }
            .text-center { text-align: center; }
            .word-text { font-size: 16px; font-weight: bold; color: #0f172a; }
            .rich-info { margin-top: 6px; font-size: 12px; color: #475569; line-height: 1.5; font-weight: 500; }
            .rich-info span.tag { font-weight: 900; color: #3b82f6; margin-right: 4px; display: inline-block; padding: 2px 6px; background-color: #eff6ff; border-radius: 4px; font-size: 10px; }
            .pos-tag { color: #64748b; font-weight: normal; margin-right: 4px; }
            .meaning-line { margin-bottom: 3px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>임페리얼 일일 암기용 단어장</h2>
            <div class="info">
              <div>이름: ${targetStudentName}</div>
              <div>날짜: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th class="text-center" style="width: 8%;">No.</th>
                <th style="width: 32%;">Target Vocabulary</th>
                <th style="width: 60%;">Core Meaning & Context</th>
              </tr>
            </thead>
            <tbody>
    `;

    wordsList.slice(0, 40).forEach((w, i) => {
      const meanings = w.meanings && w.meanings.length > 0 ? w.meanings : [];
      
      let meaningHtml = '';
      let allSynonyms = [];
      let allAntonyms = [];
      let fullSentence = '';

      if (meanings.length > 0) {
          meanings.forEach((m, idx) => {
              const pos = m.partOfSpeech ? `<span class="pos-tag">[${m.partOfSpeech}]</span>` : '';
              meaningHtml += `<div class="meaning-line">${pos}${idx + 1}. ${m.koreanMeaning}</div>`;
              
              if (m.synonyms) allSynonyms.push(...m.synonyms);
              if (m.antonyms) allAntonyms.push(...m.antonyms);
              
              // 빈칸 문장이든 예문이든 완전한 문장 추출
              if (!fullSentence && m.blankSentence && m.blankSentence.length > 0) {
                  fullSentence = m.blankSentence[0]; // replace 처리 없이 원본 그대로 사용
              } else if (!fullSentence && m.exampleSentence) {
                  fullSentence = m.exampleSentence;
              }
          });
      } else {
          meaningHtml = '<div>뜻 정보 없음</div>';
      }

      // 중복 제거
      allSynonyms = [...new Set(allSynonyms)];
      allAntonyms = [...new Set(allAntonyms)];

      let extraInfoHtml = '';
      if (allSynonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag">[유의어]</span>${allSynonyms.join(', ')}</div>`;
      if (allAntonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag">[반의어]</span>${allAntonyms.join(', ')}</div>`;
      if (fullSentence) extraInfoHtml += `<div class="rich-info"><span class="tag">[예문]</span>${fullSentence}</div>`;

      htmlContent += `
        <tr>
          <td class="text-center font-bold">${i + 1}</td>
          <td><span class="word-text">${w.word}</span></td>
          <td>
            <div style="font-weight: 800; color: #1e3a8a; font-size: 15px;">${meaningHtml}</div>
            ${extraInfoHtml}
          </td>
        </tr>
      `;
    });

    htmlContent += `
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function(){ window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    } else {
        alert("팝업 차단이 설정되어 있습니다. 팝업 차단을 해제해 주세요.");
    }
  };

  const isPrintReady = sessionInfo.status === 'ready' && wordsList.length > 0;
  const currentPresetName = studentStats?.adaptivePreset || studentStats?.vocaPreset || '밸런스 모드';

  // 일반 화면 렌더링
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
              {isParent ? '자녀 맞춤형 Voca 리포트' : 'Smart Analog Voca Portal'}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black mb-3 flex items-center gap-3">
            <Brain size={36} /> {targetStudentName} 학생의 AI 단어장
          </h1>
          <p className="text-blue-100 font-bold text-sm sm:text-base max-w-2xl break-keep">
            표면적인 단기 암기를 지양하고, 본질적인 장기 기억력 향상에 집중합니다. 오프라인 지필 고사를 통해 학습의 밀도를 높이며, 채점 결과는 AI가 즉각적으로 분석하여 매일 학생의 인지 주기에 맞춘 최적의 어휘를 배정합니다.
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
              onClick={() => handlePrint()}
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
                      이미 {sessionInfo.sessionNumber}회차 어휘 시험 응시 및 채점을 완료했습니다. 위 대시보드에서 학습 결과를 확인하세요.
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
                      학생이 아직 오늘의 학습 세션을 생성하지 않았습니다.
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
                      </tr>
                  </thead>
                  <tbody>
                      {/* 화면상 단어 리스트도 1~40번 및 프리미엄 포맷팅 적용 */}
                      {wordsList.slice(0, 40).map((word, idx) => {
                          const meanings = word.meanings && word.meanings.length > 0 ? word.meanings : [];
                          return (
                              <tr key={word.wordId} className="border-b border-slate-100">
                                  <td className="p-3 text-center font-bold text-slate-400 align-top">{idx + 1}</td>
                                  <td className="p-3 font-black text-lg text-slate-800 tracking-wide align-top">{word.word}</td>
                                  <td className="p-3 font-bold text-slate-600 align-top">
                                      {meanings.length > 0 ? (
                                          <div className="space-y-1">
                                              {meanings.map((m, i) => (
                                                  <div key={i} className="text-[15px] font-black text-blue-900">
                                                      {m.partOfSpeech && <span className="text-slate-400 font-normal mr-1">[{m.partOfSpeech}]</span>}
                                                      {i + 1}. {m.koreanMeaning}
                                                  </div>
                                              ))}
                                          </div>
                                      ) : '뜻 정보 없음'}
                                      
                                      <div className="mt-2 space-y-1">
                                          {(() => {
                                              let allSynonyms = [];
                                              let allAntonyms = [];
                                              let fullSentence = '';
                                              
                                              meanings.forEach(m => {
                                                  if (m.synonyms) allSynonyms.push(...m.synonyms);
                                                  if (m.antonyms) allAntonyms.push(...m.antonyms);
                                                  if (!fullSentence && m.blankSentence && m.blankSentence.length > 0) fullSentence = m.blankSentence[0];
                                                  else if (!fullSentence && m.exampleSentence) fullSentence = m.exampleSentence;
                                              });

                                              allSynonyms = [...new Set(allSynonyms)];
                                              allAntonyms = [...new Set(allAntonyms)];

                                              return (
                                                  <>
                                                      {allSynonyms.length > 0 && <div className="text-xs font-bold text-slate-500"><span className="text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded mr-1 text-[10px]">유의어</span> {allSynonyms.join(', ')}</div>}
                                                      {allAntonyms.length > 0 && <div className="text-xs font-bold text-slate-500"><span className="text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded mr-1 text-[10px]">반의어</span> {allAntonyms.join(', ')}</div>}
                                                      {fullSentence && <div className="text-xs font-bold text-slate-500"><span className="text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded mr-1 text-[10px]">예문</span> {fullSentence}</div>}
                                                  </>
                                              );
                                          })()}
                                      </div>
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          )}
      </div>
    </div>
  );
};

export default StudentVocaDaily;