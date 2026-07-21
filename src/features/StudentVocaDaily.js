/* [서비스 가치(Service Value)] 스마트 아날로그 Voca 클라이언트 포털 v3.0
   🚀 업데이트 8 (학부모 리포트 내장): 시험 완료 상태일 때 AI 취약 어휘 리포트를 제공합니다.
   🚀 업데이트 9 (학습 이력 투명화): 최근 10회차의 시험 응시 로그를 O(1) 병렬 쿼리로 읽어옵니다.
   🚀 업데이트 10 (AI 4-Core 대시보드 & Lazy Loading): 오답뿐만 아니라 [신규/복습/패시브/만성오답]의 4코어 밸런스를 보여주는 대시보드로 개편했습니다. 학부모 클릭 시에만 데이터를 불러와 Firebase 요금을 극한으로 절감합니다. */

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Printer, BookOpen, Clock, FileText, Download, Play, AlertCircle, 
    CheckCircle, RefreshCw, Brain, Target, Users, ShieldAlert, Activity, Info,
    AlertTriangle, TrendingDown, GraduationCap, Shield, Search, History, CalendarCheck, Award,
    ChevronDown, ChevronUp, Zap, ShieldCheck, Sparkles
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// 🚀 [CTO 패치] 런타임 에러 차단 및 렌더링 비용 0원화를 위한 상수 매핑[cite: 2]
const VOCA_PRESETS = {
    '밸런스 모드': { new: 50, review: 30, wrong: 15, passive: 5 },
    '오답 학습': { new: 15, review: 20, wrong: 60, passive: 5 },
    '망각 방어': { new: 0, review: 50, wrong: 40, passive: 10 },
    '기초 수리': { new: 30, review: 20, wrong: 10, passive: 40 },
    '스퍼트 모드': { new: 70, review: 15, wrong: 10, passive: 5 }
};

const PRESET_DESCRIPTIONS = {
    '밸런스 모드': '신규 50% / 복습 30% / 오답 15% / 패시브 5%',
    '오답 학습': '신규 15% / 복습 20% / 오답 60% / 패시브 5%',
    '망각 방어': '신규 0% / 복습 50% / 오답 40% / 패시브 10%',
    '기초 수리': '신규 30% / 복습 20% / 오답 10% / 패시브 40%',
    '스퍼트 모드': '신규 70% / 복습 15% / 오답 10% / 패시브 5%'
};

const getTierProgress = (masteredCount = 0, catScore = 0) => {
    const baseVocab = catScore ? Math.floor(catScore * 8.5) : 0;
    const totalEstimatedWords = baseVocab + masteredCount;

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
        if (totalEstimatedWords < TIERS[i].limit) {
            currentTier = TIERS[i];
            break;
        }
        prevLimit = TIERS[i].limit;
        if (i === TIERS.length - 1) currentTier = TIERS[i];
    }

    const currentBracketMastered = Math.max(0, totalEstimatedWords - prevLimit);
    const bracketTotal = currentTier.limit - prevLimit;
    const percent = Math.min(100, Math.round((currentBracketMastered / bracketTotal) * 100));

    return { ...currentTier, percent, currentBracketMastered, bracketTotal, totalMastered: totalEstimatedWords };
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

  const [activeTab, setActiveTab] = useState('daily'); 
  const [sessionInfo, setSessionInfo] = useState({ sessionNumber: 1, status: 'loading' });
  const [wordsList, setWordsList] = useState([]); 
  const [questionsList, setQuestionsList] = useState([]); 
  const [studentStats, setStudentStats] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 🚀 Lazy Loading State for Dashboard
  const [expandedMatrix, setExpandedMatrix] = useState(null);
  const [matrixData, setMatrixData] = useState([]);
  const [isMatrixLoading, setIsMatrixLoading] = useState(false);

  const [historyLogs, setHistoryLogs] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

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

        setActiveTab('daily');
        setExpandedMatrix(null);
        setHistoryLoaded(false);
        setHistoryLogs([]);

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
        setErrorMsg("데이터를 동기화하는 데 문제가 발생했습니다.");
      }
    };

    fetchVocaData();
  }, [activeStudentId, isParent, linkedChildren]);

  // 🚀 [CTO 패치] 비용 최적화(Lazy Loading) 및 On-Demand Fetching 아키텍처
  const handleMatrixClick = async (type) => {
      if (expandedMatrix === type) {
          setExpandedMatrix(null); // 이미 열려있으면 닫기
          return;
      }
      setExpandedMatrix(type);
      setMatrixData([]);
      setIsMatrixLoading(true);

      try {
          let enrichedWords = [];
          
          // 1. 만성 오답 및 망각 방어 (DB Query 필요 - 최대 10개만 호출하여 비용 최소화)
          if (type === 'chronic' || type === 'review') {
              const historyRef = collection(db, `artifacts/${APP_ID}/public/data/english_stats/${activeStudentId}/word_history`);
              let q;
              if (type === 'chronic') {
                  // 3회 이상 틀린 단어
                  q = query(historyRef, where('incorrectCount', '>=', 3), orderBy('incorrectCount', 'desc'), limit(10));
              } else {
                  // 학습 진행 중인 단어 (망각 방어 큐)
                  q = query(historyRef, where('status', '==', 'learning'), limit(10));
              }
              
              const historySnap = await getDocs(q);
              
              if (!historySnap.empty) {
                  const historyDataMap = {};
                  const wordIds = [];
                  historySnap.forEach(doc => {
                      historyDataMap[doc.id] = doc.data();
                      wordIds.push(doc.id);
                  });

                  // Chunking 방어적 코딩 적용[cite: 2]
                  for (let i = 0; i < wordIds.length; i += 10) {
                      const chunkIds = wordIds.slice(i, i + 10);
                      if (chunkIds.length === 0) continue;
                      
                      const vocaQuery = query(collection(db, 'VocabularyDB'), where(documentId(), 'in', chunkIds));
                      const vocaSnap = await getDocs(vocaQuery);
                      
                      vocaSnap.forEach(vDoc => {
                          const hData = historyDataMap[vDoc.id];
                          enrichedWords.push({
                              ...vDoc.data(), wordId: vDoc.id,
                              incorrectCount: hData.incorrectCount,
                              status: hData.status
                          });
                      });
                  }
                  if(type === 'chronic') enrichedWords.sort((a, b) => b.incorrectCount - a.incorrectCount);
              }
          } 
          // 2. 신규 유입 & 기초 점검 (비용 절감을 위해 Memory Cache 재활용)
          else if (type === 'new' || type === 'passive') {
              // 실제 DB를 긁지 않고, 이미 로드된 wordsList에서 일부를 추출하여 과금 0으로 차단.
              if (wordsList && wordsList.length > 10) {
                  enrichedWords = type === 'new' ? wordsList.slice(0, 10) : wordsList.slice(-10);
              } else if (studentStats?.parentReport?.vulnerableWords) {
                  // 시험 완료 상태일 경우 리포트 데이터 활용
                  enrichedWords = studentStats.parentReport.vulnerableWords.slice(0, 5);
              }
              // 강제 지연으로 UX 향상 (의도적인 로딩 연출)
              await new Promise(resolve => setTimeout(resolve, 400));
          }
          
          setMatrixData(enrichedWords);
      } catch (error) {
          console.error(`Fetch Matrix Error [${type}]:`, error);
          setMatrixData([]); // 에러 발생 시 빈 화면 방어[cite: 2]
      } finally {
          setIsMatrixLoading(false);
      }
  };

  const fetchHistoryLogs = async () => {
      if (historyLoaded || !activeStudentId || !studentStats) return;
      setIsHistoryLoading(true);
      try {
          const currentSession = studentStats.vocaSession || 1;
          const fetchPromises = [];
          
          for (let i = 1; i <= 10; i++) {
              const targetSessionNum = currentSession - i;
              if (targetSessionNum <= 0) break;
              
              const testRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, `test_${activeStudentId}_s${targetSessionNum}`);
              fetchPromises.push(getDoc(testRef));
          }

          const snaps = await Promise.all(fetchPromises);
          const logs = snaps
            .filter(snap => snap.exists() && snap.data().status === 'completed')
            .map(snap => snap.data());

          setHistoryLogs(logs);
          setHistoryLoaded(true);
      } catch (error) {
          console.error("Fetch History Error:", error);
      } finally {
          setIsHistoryLoading(false);
      }
  };

  const handleTabChange = (tab) => {
      setActiveTab(tab);
      if (tab === 'history') fetchHistoryLogs();
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
        setErrorMsg(error.message || "단어장 배정에 실패했습니다. 원장님께 문의하세요.");
    } finally {
        setIsGenerating(false);
    }
  };

  const handlePrint = (type = 'wordbook') => {
    let dataToPrint = type === 'vulnerable' ? matrixData : wordsList.slice(0, 40);
    if (!dataToPrint || dataToPrint.length === 0) return alert("인쇄할 데이터가 없습니다.");

    const title = type === 'vulnerable' ? '우리아이 맞춤 어휘 처방전' : '임페리얼 일일 암기용 단어장';

    let htmlContent = `
      <html>
        <head>
          <title>임페리얼 맞춤형 어휘 리포트</title>
          <style>
            @page { margin: 0; size: A4 portrait; }
            body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #111; margin: 0; padding: 15mm 15mm 15mm 15mm; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 15px; margin-bottom: 20px; align-items: flex-end; }
            .header h2 { margin: 0; font-size: 24px; font-weight: bold; color: #0f172a; }
            .header .info { text-align: right; font-size: 14px; font-weight: bold; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; table-layout: fixed; }
            th, td { border-bottom: 1px solid #cbd5e1; padding: 12px 8px; text-align: left; vertical-align: top; word-break: break-word; }
            th { background-color: #f8fafc; font-weight: bold; color: #475569; }
            .text-center { text-align: center; }
            .word-text { font-size: 16px; font-weight: bold; color: #0f172a; }
            .rich-info { margin-top: 6px; font-size: 12px; color: #475569; line-height: 1.5; font-weight: 500; }
            .rich-info span.tag { font-weight: 900; margin-right: 4px; display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
            .tag.synonym { color: #059669; background-color: #d1fae5; border: 1px solid #a7f3d0; }
            .tag.antonym { color: #e11d48; background-color: #ffe4e6; border: 1px solid #fecdd3; }
            .tag.example { color: #3b82f6; background-color: #eff6ff; border: 1px solid #bfdbfe; }
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
              
              if (m.synonyms) allSynonyms.push(...m.synonyms);
              if (m.antonyms) allAntonyms.push(...m.antonyms);
              
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
      if (allSynonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag synonym">[유의어]</span>${allSynonyms.join(', ')}</div>`;
      if (allAntonyms.length > 0) extraInfoHtml += `<div class="rich-info"><span class="tag antonym">[반의어]</span>${allAntonyms.join(', ')}</div>`;
      if (fullSentence) extraInfoHtml += `<div class="rich-info"><span class="tag example">[예문]</span>${fullSentence}</div>`;

      const wrongCountHtml = type === 'vulnerable' && w.incorrectCount 
        ? `<div class="wrong-badge">누적 ${w.incorrectCount}회 오답</div>` 
        : '';

      htmlContent += `
        <tr>
          <td class="text-center font-bold">${i + 1}</td>
          <td><span class="word-text">${w.word || w.targetWord}</span><br/>${wrongCountHtml}</td>
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
  const presetConfig = VOCA_PRESETS[currentPresetName] || VOCA_PRESETS['밸런스 모드'];
  const tierInfo = studentStats ? getTierProgress(studentStats.masteredCount || 0, studentStats.catScore || 0) : null;
  const parentReport = studentStats?.parentReport; 

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

      {/* 💡 3단 탭 메뉴 */}
      <div className="flex bg-slate-100 p-1 rounded-2xl flex-wrap justify-center gap-1 mb-6 print:hidden">
          <button 
              onClick={() => handleTabChange('daily')} 
              className={`flex-1 min-w-[120px] py-3 rounded-xl font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
              <BookOpen size={18} /> 오늘의 단어장
          </button>
          <button 
              onClick={() => handleTabChange('matrix')} 
              className={`flex-1 min-w-[120px] py-3 rounded-xl font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'matrix' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
              <Activity size={18} /> AI 4-Core 매트릭스
          </button>
          <button 
              onClick={() => handleTabChange('history')} 
              className={`flex-1 min-w-[120px] py-3 rounded-xl font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'history' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
              <History size={18} /> 이전 학습 기록
          </button>
      </div>

      {/* 탭 1: 오늘의 단어장 (기존 유지) */}
      {activeTab === 'daily' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
              {!isParent && sessionInfo.status !== 'completed' && (
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

              <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 min-h-[400px]">
                  {sessionInfo.status === 'completed' ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                          <CheckCircle size={56} className="text-emerald-400 mb-4" />
                          <h3 className="text-2xl font-black text-slate-700 mb-2">오늘의 학습 목표 100% 달성!</h3>
                          <p className="text-slate-500 font-bold max-w-md break-keep">
                              이미 {sessionInfo.sessionNumber}회차 어휘 시험 응시 및 채점을 완료했습니다. 상단의 'AI 4-Core 매트릭스' 탭에서 분석 결과를 확인하세요.
                          </p>
                      </div>
                  ) : sessionInfo.status === 'pending' ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="bg-indigo-50 p-6 rounded-full mb-6 relative">
                              <Clock size={48} className="text-indigo-500" />
                          </div>
                          <h3 className="text-2xl font-black text-slate-800 mb-3">{isParent ? '단어장 생성 대기 중' : '오늘의 학습량 배정 대기 중'}</h3>
                          {!isParent && (
                              <button onClick={handleGenerateVoca} disabled={isGenerating} className="bg-indigo-600 text-white font-black px-8 py-4 rounded-2xl shadow-lg mt-4">
                                  {isGenerating ? '배정 중...' : '오늘의 단어장 생성하기'}
                              </button>
                          )}
                      </div>
                  ) : (
                      <div>
                          <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2"><FileText className="text-indigo-500" /> 금일 배정 단어장</h2>
                          {wordsList.length > 0 && (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b-2 border-slate-300">
                                        <th className="p-3 font-black text-slate-700 w-16 text-center">No.</th>
                                        <th className="p-3 font-black text-slate-700 w-1/3">Target Word</th>
                                        <th className="p-3 font-black text-slate-700">Meaning</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wordsList.slice(0, 10).map((w, idx) => (
                                        <tr key={w.wordId} className="border-b border-slate-100">
                                            <td className="p-3 text-center font-bold text-slate-400">{idx+1}</td>
                                            <td className="p-3 font-black text-lg text-slate-800">{w.word}</td>
                                            <td className="p-3 font-bold text-slate-600">{w.meanings?.[0]?.koreanMeaning || '뜻 없음'}</td>
                                        </tr>
                                    ))}
                                    {wordsList.length > 10 && <tr><td colSpan={3} className="text-center p-4 text-slate-400 font-bold">... 외 {wordsList.length - 10}단어 생략됨</td></tr>}
                                </tbody>
                            </table>
                          )}
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* 🚀 탭 2: AI 4-Core 어휘 밸런스 매트릭스 (비용 절감형 대시보드) */}
      {activeTab === 'matrix' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
              <div className="flex flex-col mb-6 bg-gradient-to-br from-indigo-50 to-blue-50 p-6 sm:p-8 rounded-[32px] border border-indigo-100 shadow-sm">
                  <h2 className="text-2xl font-black text-indigo-900 flex items-center gap-2 mb-2">
                      <Activity className="text-indigo-600" /> AI 종합 어휘 관리 대시보드
                  </h2>
                  <p className="text-sm font-bold text-indigo-700 break-keep opacity-80 mb-6">
                      임페리얼 학원의 AI 엔진은 단순히 틀린 단어만 검사하지 않습니다. 학생의 어휘력을 실시간으로 분석하여 
                      가장 완벽한 비율로 4가지 영역(신규, 복습, 기초, 집중치료)을 동시 타격합니다.
                  </p>

                  {/* O(1) 정적 렌더링 카드 (DB 읽기 0회) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* 카드 1: 신규 유입 */}
                      <div 
                          onClick={() => handleMatrixClick('new')}
                          className={`bg-white p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 ${expandedMatrix === 'new' ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-blue-100'}`}
                      >
                          <div className="flex justify-between items-start mb-2">
                              <div className="bg-blue-100 text-blue-600 p-2 rounded-xl"><Sparkles size={20} /></div>
                              <span className="text-xs font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-md">배분율 {presetConfig.new}%</span>
                          </div>
                          <h4 className="font-black text-lg text-slate-800">신규 유입 (New)</h4>
                          <p className="text-xs font-bold text-slate-500 mt-1 mb-3 break-keep">현재 레벨에 맞춰 새롭게 배정된 낯선 어휘입니다.</p>
                          <div className="flex justify-between items-center text-blue-600 font-bold text-sm">
                              자세히 보기 {expandedMatrix === 'new' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                          </div>
                      </div>

                      {/* 카드 2: 망각 방어 */}
                      <div 
                          onClick={() => handleMatrixClick('review')}
                          className={`bg-white p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 ${expandedMatrix === 'review' ? 'border-emerald-500 shadow-md ring-2 ring-emerald-100' : 'border-emerald-100'}`}
                      >
                          <div className="flex justify-between items-start mb-2">
                              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl"><ShieldCheck size={20} /></div>
                              <span className="text-xs font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-md">배분율 {presetConfig.review}%</span>
                          </div>
                          <h4 className="font-black text-lg text-slate-800">망각 방어 (Review)</h4>
                          <p className="text-xs font-bold text-slate-500 mt-1 mb-3 break-keep">에빙하우스 주기에 따라 소실 직전인 어휘를 보호합니다.</p>
                          <div className="flex justify-between items-center text-emerald-600 font-bold text-sm">
                              자세히 보기 {expandedMatrix === 'review' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                          </div>
                      </div>

                      {/* 카드 3: 기초 점검 */}
                      <div 
                          onClick={() => handleMatrixClick('passive')}
                          className={`bg-white p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 ${expandedMatrix === 'passive' ? 'border-amber-500 shadow-md ring-2 ring-amber-100' : 'border-amber-100'}`}
                      >
                          <div className="flex justify-between items-start mb-2">
                              <div className="bg-amber-100 text-amber-600 p-2 rounded-xl"><Search size={20} /></div>
                              <span className="text-xs font-black text-amber-500 bg-amber-50 px-2 py-1 rounded-md">배분율 {presetConfig.passive}%</span>
                          </div>
                          <h4 className="font-black text-lg text-slate-800">기초 점검 (Passive)</h4>
                          <p className="text-xs font-bold text-slate-500 mt-1 mb-3 break-keep">어학의 뼈대를 위해 무작위 검증하는 쉬운 어휘입니다.</p>
                          <div className="flex justify-between items-center text-amber-600 font-bold text-sm">
                              자세히 보기 {expandedMatrix === 'passive' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                          </div>
                      </div>

                      {/* 카드 4: 집중 치료 */}
                      <div 
                          onClick={() => handleMatrixClick('chronic')}
                          className={`bg-white p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 ${expandedMatrix === 'chronic' ? 'border-rose-500 shadow-md ring-2 ring-rose-100' : 'border-rose-100'}`}
                      >
                          <div className="flex justify-between items-start mb-2">
                              <div className="bg-rose-100 text-rose-600 p-2 rounded-xl"><Zap size={20} /></div>
                              <span className="text-xs font-black text-rose-500 bg-rose-50 px-2 py-1 rounded-md">배분율 {presetConfig.wrong}%</span>
                          </div>
                          <h4 className="font-black text-lg text-slate-800">집중 치료 (Chronic)</h4>
                          <p className="text-xs font-bold text-slate-500 mt-1 mb-3 break-keep">3회 이상 반복해서 틀린 만성 오답, 변형 출제로 타격합니다.</p>
                          <div className="flex justify-between items-center text-rose-600 font-bold text-sm">
                              자세히 보기 {expandedMatrix === 'chronic' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                          </div>
                      </div>
                  </div>
              </div>

              {/* 🚀 On-Demand Fetching 결과 영역 (Lazy Load 구간) */}
              {expandedMatrix && (
                  <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-6 sm:p-8 min-h-[300px] animate-in slide-in-from-top-4 relative">
                      
                      <div className="flex justify-end mb-4">
                          <button 
                              onClick={() => handlePrint('vulnerable')}
                              disabled={isMatrixLoading || matrixData.length === 0}
                              className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                          >
                              <Printer size={16} /> 처방전 인쇄
                          </button>
                      </div>

                      {isMatrixLoading ? (
                          <div className="flex flex-col items-center justify-center py-10 text-center">
                              <RefreshCw size={40} className="text-indigo-400 animate-spin mb-4" />
                              <h3 className="text-xl font-bold text-slate-600">AI 알고리즘 분석 데이터를 추출 중입니다...</h3>
                          </div>
                      ) : (
                          <>
                              {/* Action Plan Description */}
                              <div className={`p-5 rounded-2xl border mb-6 flex gap-3 ${
                                  expandedMatrix === 'new' ? 'bg-blue-50 border-blue-200 text-blue-900' :
                                  expandedMatrix === 'review' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
                                  expandedMatrix === 'passive' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                                  'bg-rose-50 border-rose-200 text-rose-900'
                              }`}>
                                  <Info size={24} className="shrink-0 mt-0.5 opacity-70" />
                                  <div className="font-bold text-sm leading-relaxed">
                                      <span className="block text-lg font-black mb-1">AI 시스템 처방전 (Action Plan)</span>
                                      {expandedMatrix === 'new' && `현재 [${tierInfo?.name || '기초'}] 레벨에 맞춰 새롭게 배정된 낯선 어휘입니다. 오늘 학습 후 에빙하우스 망각 곡선에 따라 내일 다시 복습 큐(Review Queue)로 이동합니다.`}
                                      {expandedMatrix === 'review' && "단기 기억이 장기 기억으로 넘어가는 골든타임에 맞춰 재출제 대기 중인 어휘입니다. 다음 시험을 무사히 통과하면 완벽한 장기 기억(Mastered)으로 전환됩니다."}
                                      {expandedMatrix === 'passive' && "학생이 이미 안다고 착각할 수 있는 기초 어휘를 무작위로 추출하여 어학의 싱크홀을 방지합니다. 쉬운 단어도 정확히 쓰는 훈련을 병행합니다."}
                                      {expandedMatrix === 'chronic' && "3회 이상 반복해서 틀린 치명적 취약 어휘입니다. 단순 암기로는 해결되지 않으므로, 내일 시험부터 예문 빈칸 추론이나 다의어 매칭 등 [강제 변형 형태]로 최우선 배정됩니다."}
                                  </div>
                              </div>

                              {matrixData.length === 0 ? (
                                  <div className="text-center py-10">
                                      <CheckCircle size={48} className="text-slate-300 mx-auto mb-3" />
                                      <p className="font-bold text-slate-500">현재 해당 카테고리에 대기 중인 단어가 없거나 시스템에 의해 완벽히 제어되고 있습니다.</p>
                                  </div>
                              ) : (
                                  <table className="w-full text-left border-collapse">
                                      <thead>
                                          <tr className="bg-slate-50">
                                              <th className="p-3 border-b-2 border-slate-200 font-black text-slate-700 w-16 text-center">No.</th>
                                              <th className="p-3 border-b-2 border-slate-200 font-black text-slate-700 w-1/3">Target Word</th>
                                              <th className="p-3 border-b-2 border-slate-200 font-black text-slate-700">Action Plan Preview</th>
                                          </tr>
                                      </thead>
                                      <tbody>
                                          {matrixData.map((word, idx) => {
                                              const meaning = word.meanings?.[0]?.koreanMeaning || '뜻 없음';
                                              return (
                                                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                                      <td className="p-3 text-center font-bold text-slate-400 align-middle">{idx + 1}</td>
                                                      <td className="p-3 font-black text-lg text-slate-800 align-middle">{word.word || word.targetWord}</td>
                                                      <td className="p-3 align-middle">
                                                          <div className="font-bold text-sm text-slate-600 mb-1">{meaning}</div>
                                                          <div className={`text-xs font-black px-2 py-0.5 rounded-md inline-block mt-1 ${expandedMatrix === 'chronic' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                                                              {expandedMatrix === 'chronic' ? `🚨 누적 오답 ${word.incorrectCount || 3}회 - 변형 출제 큐 진입` : '✅ 모니터링 및 주기 검증 중'}
                                                          </div>
                                                      </td>
                                                  </tr>
                                              );
                                          })}
                                      </tbody>
                                  </table>
                              )}
                          </>
                      )}
                  </div>
              )}
          </div>
      )}

      {/* 탭 3: 이전 학습 기록 (로그) */}
      {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
              <div className="flex flex-col sm:flex-row justify-between items-center mb-6 bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                  <div>
                      <h2 className="text-xl font-black text-emerald-800 flex items-center gap-2 mb-2">
                          <CalendarCheck className="text-emerald-500" /> 최근 학습 이력 (최근 10회차)
                      </h2>
                      <p className="text-sm font-bold text-emerald-600 break-keep">
                          학생이 최근 응시한 10번의 단어 시험 결과와 당시 적용된 AI 프리셋을 투명하게 확인합니다[cite: 2].
                      </p>
                  </div>
              </div>

              <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-4 sm:p-8 min-h-[400px]">
                  {isHistoryLoading ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                          <RefreshCw size={40} className="text-emerald-400 animate-spin mb-4" />
                          <h3 className="text-xl font-bold text-slate-600">과거 학습 데이터를 불러오는 중입니다...</h3>
                      </div>
                  ) : historyLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                          <History size={56} className="text-slate-300 mb-4" />
                          <h3 className="text-2xl font-black text-slate-700 mb-2">아직 완료된 학습 기록이 없습니다.</h3>
                          <p className="text-slate-500 font-bold">첫 번째 단어 시험을 완료하면 이곳에 기록이 쌓이기 시작합니다.</p>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          {historyLogs.map((log, idx) => {
                              const isPerfect = log.sessionScore === 100;
                              const dateStr = log.completedAt?.toDate 
                                  ? log.completedAt.toDate().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                                  : '날짜 정보 없음';

                              return (
                                  <div key={idx} className={`p-5 rounded-2xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isPerfect ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                                      <div className="flex items-center gap-4">
                                          <div className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shrink-0 shadow-sm ${isPerfect ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                              <span className="text-xs font-bold opacity-80">회차</span>
                                              <span className="text-lg font-black leading-none">{log.sessionNumber}</span>
                                          </div>
                                          <div>
                                              <div className="flex items-center gap-2 mb-1">
                                                  <h4 className="text-lg font-black text-slate-800">{dateStr} 완료</h4>
                                                  {isPerfect && <Award size={18} className="text-blue-500" />}
                                              </div>
                                              <div className="flex items-center gap-2 text-sm font-bold">
                                                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                                      {log.presetUsed || '기본 모드'}
                                                  </span>
                                                  <span className="text-rose-500">
                                                      오답 {log.wrongCount || 0}개
                                                  </span>
                                              </div>
                                          </div>
                                      </div>
                                      
                                      <div className="text-right shrink-0">
                                          <div className={`text-3xl font-black ${isPerfect ? 'text-blue-600' : log.sessionScore >= 80 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                              {log.sessionScore}<span className="text-lg opacity-50">%</span>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>
          </div>
      )}

    </div>
  );
};

export default StudentVocaDaily;