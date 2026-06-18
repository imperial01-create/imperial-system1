/* [서비스 가치(Service Value)] 스마트 아날로그 Voca 클라이언트 포털 v2.2
   에듀테크 프리미엄 브랜딩: RPG 게임식 티어를 폐지하고, 공교육 과정 기반의 '학년별 어휘 진도 시스템(Grade-Level Equivalency)'을 도입했습니다. 
   학부모는 자녀의 선행 학습 수준을 직관적으로 체감하며, 학원 시스템에 대한 압도적인 신뢰를 갖게 됩니다.
   비용 효율성: 오답 리스트 조회 시 Lazy Loading을 적용하고, VocabularyDB 참조 시 in 쿼리를 활용해 N+1 Read 과금 문제를 원천 차단했습니다. */
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Printer, BookOpen, Clock, FileText, Download, Play, AlertCircle, 
    CheckCircle, RefreshCw, Brain, Target, Users, ShieldAlert, Activity, Info,
    AlertTriangle, TrendingDown, GraduationCap
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, documentId } from 'firebase/firestore';
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

// 🚀 [CTO 패치] 공교육 교과 과정 기반 학년별 어휘 티어 계산기
const getTierProgress = (masteredCount = 0) => {
    const TIERS = [
        { name: '초등 기초 (초3~4)', limit: 500, color: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700' },
        { name: '초등 필수 (초5~6)', limit: 800, color: 'bg-orange-400', bg: 'bg-orange-50', text: 'text-orange-700' },
        { name: '중등 기초 (중1)', limit: 1400, color: 'bg-lime-500', bg: 'bg-lime-50', text: 'text-lime-700' },
        { name: '중등 발전 (중2)', limit: 2000, color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
        { name: '중등 마스터 (중3)', limit: 2800, color: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-700' },
        { name: '고등 기초 (고1)', limit: 4000, color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
        { name: '고등 발전 (고2)', limit: 6000, color: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700' },
        { name: '수능 완성 (고3)', limit: 8500, color: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
        { name: '최상위 (TEPS/TOEFL)', limit: 99999, color: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' }
    ];

    let prevLimit = 0;
    let currentTier = TIERS[0];
    
    for (let i = 0; i < TIERS.length; i++) {
        if (masteredCount < TIERS[i].limit) {
            currentTier = TIERS[i];
            break;
        }
        prevLimit = TIERS[i].limit;
        if (i === TIERS.length - 1) currentTier = TIERS[i];
    }

    const currentBracketMastered = Math.max(0, masteredCount - prevLimit);
    const bracketTotal = currentTier.limit - prevLimit;
    const percent = Math.min(100, Math.round((currentBracketMastered / bracketTotal) * 100));

    return { ...currentTier, percent, currentBracketMastered, bracketTotal, totalMastered: masteredCount };
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

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'vulnerable'
  const [sessionInfo, setSessionInfo] = useState({ sessionNumber: 1, status: 'loading' });
  const [wordsList, setWordsList] = useState([]); 
  const [questionsList, setQuestionsList] = useState([]); 
  const [studentStats, setStudentStats] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 🚀 [CTO 패치] 취약 어휘 리포트 상태 관리 (Lazy Loading 용도)
  const [vulnerableWords, setVulnerableWords] = useState([]);
  const [isVulnerableLoading, setIsVulnerableLoading] = useState(false);
  const [vulnerableLoaded, setVulnerableLoaded] = useState(false);

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

        // 학생이 바뀌면 탭과 취약 어휘 캐시를 초기화합니다.
        setActiveTab('daily');
        setVulnerableLoaded(false);
        setVulnerableWords([]);

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

  // 🚀 [CTO 패치] 취약 어휘 30개 고속 추출 로직 (N+1 문제 해결)
  const fetchVulnerableWords = async () => {
      if (vulnerableLoaded || !activeStudentId) return;
      setIsVulnerableLoading(true);
      try {
          // 1. 오답 히스토리에서 가장 많이 틀린 순으로 30개를 추출합니다. (복합 인덱스 불필요)
          const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${activeStudentId}/word_history`);
          const q = query(historyRef, where('incorrectCount', '>', 0), orderBy('incorrectCount', 'desc'), limit(30));
          const historySnap = await getDocs(q);

          if (historySnap.empty) {
              setVulnerableWords([]);
              setVulnerableLoaded(true);
              return;
          }

          const historyDataMap = {};
          const wordIds = [];
          historySnap.forEach(doc => {
              historyDataMap[doc.id] = doc.data();
              wordIds.push(doc.id);
          });

          // 2. N+1 문제를 막기 위해 배열을 10개 단위로 쪼개어 in 쿼리로 가져옵니다.
          const chunkSize = 10;
          let enrichedWords = [];
          
          for (let i = 0; i < wordIds.length; i += chunkSize) {
              const chunkIds = wordIds.slice(i, i + chunkSize);
              const vocaQuery = query(collection(db, 'VocabularyDB'), where(documentId(), 'in', chunkIds));
              const vocaSnap = await getDocs(vocaQuery);
              
              vocaSnap.forEach(vDoc => {
                  const wData = vDoc.data();
                  const hData = historyDataMap[vDoc.id];
                  enrichedWords.push({
                      ...wData,
                      wordId: vDoc.id,
                      incorrectCount: hData.incorrectCount,
                      consecutiveWrongCount: hData.consecutiveWrongCount,
                      status: hData.status
                  });
              });
          }

          // 틀린 횟수로 다시 정렬 (in 쿼리는 순서를 보장하지 않으므로)
          enrichedWords.sort((a, b) => b.incorrectCount - a.incorrectCount);
          
          setVulnerableWords(enrichedWords);
          setVulnerableLoaded(true);
      } catch (error) {
          console.error("Fetch Vulnerable Error:", error);
          alert("취약 어휘 데이터를 불러오지 못했습니다.");
      } finally {
          setIsVulnerableLoading(false);
      }
  };

  const handleTabChange = (tab) => {
      setActiveTab(tab);
      if (tab === 'vulnerable') {
          fetchVulnerableWords();
      }
  };

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

  // 🚀 인쇄 로직에 취약 어휘(vulnerable) 모드 추가
  const handlePrint = (type = 'wordbook') => {
    let dataToPrint = type === 'vulnerable' ? vulnerableWords : wordsList.slice(0, 40);
    
    if (!dataToPrint || dataToPrint.length === 0) {
        return alert("인쇄할 데이터가 없습니다.");
    }

    const title = type === 'vulnerable' ? '우리아이 맞춤 오답 집중 케어' : '임페리얼 일일 암기용 단어장';

    let htmlContent = `
      <html>
        <head>
          <title>임페리얼 맞춤형 어휘 리포트</title>
          <style>
            @page { margin: 0; size: A4 portrait; }
            body { 
                font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
                color: #111; margin: 0; padding: 15mm 15mm 15mm 15mm; box-sizing: border-box;
                -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; 
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
            .wrong-badge { display: inline-block; padding: 2px 6px; background-color: #ffe4e6; color: #e11d48; border-radius: 4px; font-size: 10px; font-weight: 900; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${title}</h2>
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

    dataToPrint.forEach((w, i) => {
      const meanings = w.meanings && w.meanings.length > 0 ? w.meanings : [];
      let meaningHtml = '';
      let allSynonyms = [];
      let allAntonyms = [];
      let fullSentence = '';

      if (meanings.length > 0) {
          meanings.forEach((m, idx) => {
              const pos = m.partOfSpeech ? `<span class="pos-tag">[${m.partOfSpeech}]</span>` : '';
              meaningHtml += `<div class="meaning-line">${pos}${idx + 1}. ${m.koreanMeaning}</div>`;
              
              if (m.synonyms) {
                  allSynonyms.push(...m.synonyms);
              }
              if (m.antonyms) {
                  allAntonyms.push(...m.antonyms);
              }
              
              if (!fullSentence && m.exampleSentence) {
                  fullSentence = m.exampleSentence;
              } else if (!fullSentence && m.blankSentence && m.blankSentence.length > 0) {
                  const regex = new RegExp('_+(?:\\s*_+)*', 'g');
                  fullSentence = m.blankSentence[0].replace(regex, w.word);
              }
          });
      } else {
          meaningHtml = '<div>뜻 정보 없음</div>';
      }

      allSynonyms = [...new Set(allSynonyms)];
      allAntonyms = [...new Set(allAntonyms)];

      let extraInfoHtml = '';
      if (allSynonyms.length > 0) {
          extraInfoHtml += `<div class="rich-info"><span class="tag">유의어</span>${allSynonyms.join(', ')}</div>`;
      }
      if (allAntonyms.length > 0) {
          extraInfoHtml += `<div class="rich-info"><span class="tag">반의어</span>${allAntonyms.join(', ')}</div>`;
      }
      if (fullSentence) {
          extraInfoHtml += `<div class="rich-info"><span class="tag">예문</span>${fullSentence}</div>`;
      }

      // 취약 어휘 리포트일 경우 몇 번 틀렸는지 표기
      const wrongCountHtml = type === 'vulnerable' && w.incorrectCount 
        ? `<div class="wrong-badge">누적 ${w.incorrectCount}회 오답</div>` 
        : '';

      htmlContent += `
        <tr>
          <td class="text-center font-bold">${i + 1}</td>
          <td><span class="word-text">${w.word}</span><br/>${wrongCountHtml}</td>
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
  const tierInfo = studentStats ? getTierProgress(studentStats.masteredCount || 0) : null;

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

      <div className="print:hidden bg-gradient-to-r from-blue-700 to-indigo-800 rounded-[32px] p-8 sm:p-10 text-white shadow-lg mb-6 relative overflow-hidden">
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
          <div className="print:hidden p-4 mb-6 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle size={20} /> {errorMsg}
          </div>
      )}

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
                    
                    {/* 🚀 [에러 수정 완료] 스타일 문자열 결합 방식으로 안전하게 변경 */}
                    {tierInfo && (
                        <div className="mb-5">
                            <div className="flex justify-between items-end mb-1">
                                <span className={`text-xs font-black px-2 py-1 rounded-md flex items-center gap-1 ${tierInfo.bg} ${tierInfo.text}`}>
                                    <GraduationCap size={14} /> {tierInfo.name} 진입
                                </span>
                                <span className="text-xs font-bold text-slate-400">
                                    {tierInfo.currentBracketMastered} / {tierInfo.bracketTotal} (누적 {tierInfo.totalMastered}단어)
                                </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5">
                                <div className={`${tierInfo.color} h-2.5 rounded-full transition-all duration-1000`} style={{ width: tierInfo.percent + '%' }}></div>
                            </div>
                        </div>
                    )}

                    <div className="mb-5">
                        <div className="flex justify-between text-sm font-bold mb-1">
                            <span className="text-slate-600">기억 유지율</span>
                            <span className="text-emerald-600">{studentStats.vocaRetention || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div className="bg-emerald-400 h-2.5 rounded-full" style={{ width: (studentStats.vocaRetention || 0) + '%' }}></div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-sm font-bold mb-1">
                            <span className="text-slate-600">다의어 이해도</span>
                            <span className="text-amber-600">{studentStats.vocaComprehension || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div className="bg-amber-400 h-2.5 rounded-full" style={{ width: (studentStats.vocaComprehension || 0) + '%' }}></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* 🚀 학부모를 위한 투명한 탭 분리 (오늘의 단어장 vs 취약 어휘 리포트) */}
      <div className="flex bg-slate-100 p-1 rounded-2xl flex-wrap justify-center gap-1 mb-6 print:hidden">
          <button 
              onClick={() => handleTabChange('daily')} 
              className={`flex-1 py-3 rounded-xl font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
              <BookOpen size={18} /> 오늘의 단어장
          </button>
          <button 
              onClick={() => handleTabChange('vulnerable')} 
              className={`flex-1 py-3 rounded-xl font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'vulnerable' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
              <AlertTriangle size={18} /> 취약 어휘 집중 분석
          </button>
      </div>

      {activeTab === 'daily' && (
          <>
              {!isParent && (
                  <div className="flex mb-8 print:hidden">
                    <button 
                      onClick={() => handlePrint('wordbook')}
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
                      <div className="flex flex-col items-center justify-center py-20 text-center print:hidden">
                          <AlertCircle size={56} className="text-slate-300 mb-4" />
                          <h3 className="text-2xl font-black text-slate-700 mb-2">초기 어휘 역량 진단 대기 중</h3>
                          <p className="text-slate-500 font-bold max-w-md break-keep">
                              학원에서 레벨 테스트 점수를 연동하면, 학생의 현재 수준에 완벽히 맞춰진 초개인화 단어장이 이곳에 생성됩니다.
                          </p>
                      </div>
                  )}

                  {sessionInfo.status === 'completed' && (
                      <div className="flex flex-col items-center justify-center py-20 text-center print:hidden">
                          <CheckCircle size={56} className="text-emerald-400 mb-4" />
                          <h3 className="text-2xl font-black text-slate-700 mb-2">오늘의 학습 목표 100% 달성!</h3>
                          <p className="text-slate-500 font-bold max-w-md break-keep">
                              이미 {sessionInfo.sessionNumber}회차 어휘 시험 응시 및 채점을 완료했습니다. 위 대시보드에서 학습 결과를 확인하세요.
                          </p>
                      </div>
                  )}

                  {sessionInfo.status === 'pending' && !isParent && (
                      <div className="flex flex-col items-center justify-center py-10 text-center print:hidden">
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
                      <div className="py-20 text-center flex flex-col items-center justify-center print:hidden">
                          <Clock size={56} className="text-slate-300 mb-4" />
                          <h3 className="text-2xl font-black text-slate-700 mb-2">단어장 생성 대기 중</h3>
                          <p className="text-slate-500 font-bold">
                              학생이 아직 오늘의 학습 세션을 생성하지 않았습니다.
                          </p>
                      </div>
                  )}

                  {sessionInfo.status === 'ready' && wordsList.length > 0 && (
                      <table className="w-full text-left border-collapse print:w-full print:text-black">
                          <thead>
                              <tr className="bg-slate-50 print:bg-transparent">
                                  <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-16 text-center">No.</th>
                                  <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-1/3">Target Vocabulary</th>
                                  <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700">Core Meaning (핵심 의미)</th>
                              </tr>
                          </thead>
                          <tbody>
                              {wordsList.slice(0, 40).map((word, idx) => {
                                  const meanings = word.meanings && word.meanings.length > 0 ? word.meanings : [];
                                  return (
                                      <tr key={word.wordId} className="border-b border-slate-100 print:border-slate-300">
                                          <td className="p-3 text-center font-bold text-slate-400 align-top print:text-black">{idx + 1}</td>
                                          <td className="p-3 font-black text-lg text-slate-800 tracking-wide align-top print:text-black">{word.word}</td>
                                          <td className="p-3 font-bold text-slate-600 align-top print:text-black">
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
                                                          if (m.synonyms) {
                                                              allSynonyms.push(...m.synonyms);
                                                          }
                                                          if (m.antonyms) {
                                                              allAntonyms.push(...m.antonyms);
                                                          }
                                                          if (!fullSentence && m.exampleSentence) {
                                                              fullSentence = m.exampleSentence;
                                                          } else if (!fullSentence && m.blankSentence && m.blankSentence.length > 0) {
                                                              const regex = new RegExp('_+(?:\\s*_+)*', 'g');
                                                              fullSentence = m.blankSentence[0].replace(regex, word.word);
                                                          }
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
          </>
      )}

      {/* 🚀 취약 어휘 분석 리포트 렌더링 영역 */}
      {activeTab === 'vulnerable' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
              <div className="flex flex-col sm:flex-row justify-between items-center mb-6 bg-rose-50 p-6 rounded-3xl border border-rose-100">
                  <div>
                      <h2 className="text-xl font-black text-rose-800 flex items-center gap-2 mb-2">
                          <TrendingDown className="text-rose-500" /> 누적 취약 어휘 (Top 30)
                      </h2>
                      <p className="text-sm font-bold text-rose-600 break-keep">
                          AI가 분석한 학생의 가장 취약한 단어 목록입니다. 해당 단어들을 가정에서 집중적으로 점검해주세요.
                      </p>
                  </div>
                  <button 
                      onClick={() => handlePrint('vulnerable')}
                      disabled={isVulnerableLoading || vulnerableWords.length === 0}
                      className="mt-4 sm:mt-0 px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black shadow-md flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
                  >
                      <Printer size={18} /> 오답 노트 인쇄
                  </button>
              </div>

              <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 min-h-[400px]">
                  {isVulnerableLoading ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                          <RefreshCw size={40} className="text-rose-400 animate-spin mb-4" />
                          <h3 className="text-xl font-bold text-slate-600">취약 어휘 데이터를 분석 중입니다...</h3>
                      </div>
                  ) : vulnerableWords.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                          <CheckCircle size={56} className="text-emerald-400 mb-4" />
                          <h3 className="text-2xl font-black text-slate-700 mb-2">취약 어휘가 없습니다!</h3>
                          <p className="text-slate-500 font-bold">학생이 현재까지 틀린 단어가 없거나 데이터가 부족합니다.</p>
                      </div>
                  ) : (
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="bg-slate-50">
                                  <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-16 text-center">오답 수</th>
                                  <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700 w-1/3">Target Vocabulary</th>
                                  <th className="p-3 border-b-2 border-slate-300 font-black text-slate-700">Core Meaning (핵심 의미)</th>
                              </tr>
                          </thead>
                          <tbody>
                              {vulnerableWords.map((word) => {
                                  const meanings = word.meanings && word.meanings.length > 0 ? word.meanings : [];
                                  return (
                                      <tr key={word.wordId} className="border-b border-slate-100">
                                          <td className="p-3 text-center align-top">
                                              <div className={`font-black text-sm w-10 h-10 mx-auto rounded-full flex items-center justify-center ${word.status === 'chronic_error' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
                                                  {word.incorrectCount}회
                                              </div>
                                          </td>
                                          <td className="p-3 font-black text-lg text-slate-800 tracking-wide align-top">
                                              {word.word}
                                              {word.status === 'chronic_error' && <span className="block mt-1 text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded border border-rose-100 w-fit">만성 오답</span>}
                                          </td>
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
                                                          if (m.synonyms) {
                                                              allSynonyms.push(...m.synonyms);
                                                          }
                                                          if (m.antonyms) {
                                                              allAntonyms.push(...m.antonyms);
                                                          }
                                                          if (!fullSentence && m.exampleSentence) {
                                                              fullSentence = m.exampleSentence;
                                                          } else if (!fullSentence && m.blankSentence && m.blankSentence.length > 0) {
                                                              const regex = new RegExp('_+(?:\\s*_+)*', 'g');
                                                              fullSentence = m.blankSentence[0].replace(regex, word.word);
                                                          }
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
      )}
    </div>
  );
};

export default StudentVocaDaily;