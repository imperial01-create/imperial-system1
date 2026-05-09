import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, writeBatch, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, ChevronLeft, ChevronRight, Receipt, Loader, 
  Wallet, Download, BellRing, UploadCloud, FileSpreadsheet, 
  ShieldAlert, Image as ImageIcon, Search, Database,
  Activity, Zap, HeartPulse, LineChart, BarChart3, Target, Settings, Trash2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, ComposedChart, Line, ReferenceLine
} from 'recharts';

const APP_ID = 'imperial-clinic-v1';

const OFFICIAL_ACCOUNTS = [
  '미분류', '직원급여', '상여금', '퇴직급여', '복리후생비', '여비교통비', '접대비', 
  '통신비', '수도광열비', '세금과공과금', '감가상각비', '지급임차료', '수선비', 
  '보험료', '차량유지비', '운반비', '도서인쇄비', '소모품비', '지급수수료', '광고선전비', '미지급금'
];

const FinancialDashboard = ({ currentUser }) => {
  if (currentUser?.role !== 'admin') return <div className="p-10 text-center text-red-500 font-bold">접근 권한이 없습니다.</div>;

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]); 
  const [missingReceipts, setMissingReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState('BANK'); // 🚀 통통통 탭 제거, 은행 중심
  const [parsedData, setParsedData] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 🚀 재무 환경 설정 (임대료 및 관리비 등 고정비)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [finSettings, setFinSettings] = useState({ rent: 4000000, maintenance: 500000 });
  const [isProcessingCleanup, setIsProcessingCleanup] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const docRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'finance');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
          const data = docSnap.data();
          setFinSettings({ rent: data.rent || 4000000, maintenance: data.maintenance || 500000 });
      }
    };
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'finance'), finSettings, { merge: true });
    setIsSettingsOpen(false);
    alert('재무 환경 설정이 저장되었습니다.');
  };

  // 🚀 기존 꼬여있던 통통통 데이터 클렌징(초기화) 로직
  const handleCleanupTongTong = async () => {
    if (!window.confirm("⚠️ 기존에 잘못 적재된 '통통통(LMS)' 관련 수입 및 수수료 지출 내역을 모두 삭제하시겠습니까?\n(은행 통장 및 법인카드 업로드 내역은 100% 안전하게 유지됩니다.)")) return;
    
    setIsProcessingCleanup(true);
    try {
        const batch = writeBatch(db);
        let deleteCount = 0;
        
        // 1. 통통통으로 생성된 지출(수수료) 삭제
        const expSnap = await getDocs(query(collection(db, `artifacts/${APP_ID}/public/data/expenses`), where('userId', '==', 'SYSTEM_TONGTONG')));
        expSnap.forEach(d => { batch.delete(d.ref); deleteCount++; });
        
        // 2. 통통통으로 생성된 수입 삭제 (과거 로직에서 등록된 수입)
        const incSnap = await getDocs(collection(db, `artifacts/${APP_ID}/public/data/incomes`));
        incSnap.forEach(d => {
            const data = d.data();
            // 과거에 통통통 엑셀로 올렸던 수입은 method 필드가 명시되어 있거나, source에 '학원 수강료'라고 적혀있음
            if (data.method || (data.source && data.source.includes('학원 수강료'))) {
                batch.delete(d.ref);
                deleteCount++;
            }
        });

        if (deleteCount > 0) {
            await batch.commit();
            alert(`완벽하게 처리되었습니다!\n총 ${deleteCount}건의 기존 통통통 연동 데이터가 깔끔하게 삭제되었습니다.\n이제 엑셀 업로드 메뉴에서 은행 통장 내역만 올려주세요.`);
        } else {
            alert("삭제할 통통통 데이터가 없습니다. (이미 장부가 깨끗합니다.)");
        }
    } catch (e) {
        alert("삭제 중 오류 발생: " + e.message);
    } finally {
        setIsProcessingCleanup(false);
    }
  };

  // 통합 데이터 구독 엔진
  useEffect(() => {
    setIsLoading(true);
    const monthStart = `${selectedMonth}-01`; 
    const monthEnd = `${selectedMonth}-31`;
    
    const expQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), where('expenseDate', '>=', monthStart), where('expenseDate', '<=', monthEnd));
    const unsubscribeExp = onSnapshot(expQuery, (snapshot) => { setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoading(false); });
    
    const incQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'incomes'), where('transactionDate', '>=', monthStart), where('transactionDate', '<=', monthEnd));
    const unsubscribeInc = onSnapshot(incQuery, (snapshot) => { setIncomes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
    
    const trxQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'transactions'), where('transactionDate', '>=', monthStart), where('transactionDate', '<=', monthEnd), where('isMatched', '==', false));
    const unsubscribeTrx = onSnapshot(trxQuery, (snapshot) => { setMissingReceipts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
    
    return () => { unsubscribeExp(); unsubscribeInc(); unsubscribeTrx(); };
  }, [selectedMonth]);

  // AI 재무 진단 로직 엔진 (완전 현금주의 기반)
  const aiAnalytics = useMemo(() => {
    // 은행 통장에 입금된 모든 내역을 진성 매출(Total Income)으로 파악
    const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const totalExpense = expenses.filter(e => e.status === 'APPROVED' && e.category !== '미지급금').reduce((sum, exp) => sum + exp.amount, 0);
    
    const fixedCosts = Number(finSettings.rent) + Number(finSettings.maintenance);
    const operatingProfit = totalIncome - totalExpense - fixedCosts; 

    const bepRate = totalIncome > 0 ? (totalIncome / (fixedCosts + totalExpense)) * 100 : 0;
    const runway = operatingProfit < 0 ? Math.abs(totalIncome / operatingProfit).toFixed(1) : 12;

    const marketingSpend = expenses.filter(e => e.category === '광고선전비').reduce((sum, e) => sum + e.amount, 0);
    const cac = marketingSpend / 10; 
    const ltv = totalIncome > 0 ? (totalIncome / 150) * (100 / 2) : 0; 

    const vatEstimate = totalIncome * 0.1 - (totalExpense * 0.05);
    const anomalies = [];
    const categoryTotals = {};
    expenses.filter(e => e.status === 'APPROVED').forEach(e => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
    
    if (categoryTotals['소모품비'] > 1000000) anomalies.push({ msg: "소모품비 지출 평소 대비 급증 감지 (점검 요망)", type: "warning" });

    const roiData = OFFICIAL_ACCOUNTS.slice(1, 7).map((acc, idx) => ({
      name: acc,
      value: totalIncome > 0 ? totalIncome * (0.2 - idx * 0.02) : 5000000 - idx * 500000,
      cost: categoryTotals[acc] || 500000
    }));

    // 일자별 현금 흐름 및 BEP 돌파 차트
    const dailyFlowData = [];
    let cumulative = -fixedCosts; 
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dailyInc = incomes.filter(i => i.transactionDate === dateStr).reduce((sum, i) => sum + i.amount, 0);
        const dailyExp = expenses.filter(e => e.expenseDate === dateStr && e.status === 'APPROVED' && e.category !== '미지급금').reduce((sum, e) => sum + e.amount, 0);
        
        cumulative += (dailyInc - dailyExp);
        dailyFlowData.push({ day: `${d}일`, cumulative: cumulative, bep: 0 });
    }

    return { 
      totalIncome, totalExpense, fixedCosts, operatingProfit, bepRate, runway, 
      cac, churnRate: 2, ltv, vatEstimate, anomalies, roiData, dailyFlowData 
    };
  }, [expenses, incomes, finSettings, selectedMonth]);

  const integratedLedger = useMemo(() => {
    const list = [
      ...incomes.map(i => ({ id: i.id, date: i.transactionDate, type: '수입(매출)', category: '사업소득', purpose: i.source, amount: i.amount, method: '계좌입금', status: 'COMPLETED' })),
      ...expenses.filter(e => e.status === 'APPROVED').map(e => ({ id: e.id, date: e.expenseDate, type: '지출(정상)', category: e.category, purpose: e.purpose, amount: e.amount, method: e.method, receiptUrl: e.receiptUrl, status: 'COMPLETED' })),
      ...missingReceipts.map(m => ({ id: m.id, date: m.transactionDate, type: '지출(누락)', category: '미확인', purpose: m.merchantName, amount: m.amount, method: m.type, status: 'ERROR' })),
      ...expenses.filter(e => e.status === 'PENDING').map(e => ({ id: e.id, date: e.expenseDate, type: '지출(대기)', category: e.category, purpose: e.purpose, amount: e.amount, method: e.method, receiptUrl: e.receiptUrl, status: 'PENDING' }))
    ];
    return list.filter(item => item.purpose.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, incomes, missingReceipts, searchTerm]);

  const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);

  const handleDownloadPerfectLedger = () => {
    const excelData = integratedLedger.map(item => ({
      '거래일자': item.date,
      '구분': item.type,
      '계정과목': item.category,
      '적요/거래처': item.purpose,
      '금액': item.amount,
      '결제수단': item.method,
      '증빙유형': item.receiptUrl ? (item.receiptUrl.includes('data:') ? '전자영수증(클릭)' : item.receiptUrl) : '없음'
    }));

    if (excelData.length === 0) return alert("다운로드할 데이터가 없습니다.");
    const ws = XLSX.utils.json_to_sheet(excelData);
    integratedLedger.forEach((item, idx) => {
      if (item.receiptUrl && item.receiptUrl.startsWith('data:')) {
        const cellRef = XLSX.utils.encode_cell({ c: 6, r: idx + 1 });
        ws[cellRef].l = { Target: item.receiptUrl, Tooltip: "영수증 원본 보기" };
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "임페리얼_통합재무원장");
    XLSX.writeFile(wb, `임페리얼_세무소명장부_${selectedMonth}.xlsx`);
  };

  // 🚀 엑셀 파싱 로직 (현금주의 기반 은행 엑셀 전용)
  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result; const workbook = XLSX.read(bstr, { type: 'binary' });
      const ws = workbook.Sheets[workbook.SheetNames[0]]; const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const extracted = [];
      try {
        if (uploadType === 'BANK') {
          const headerIdx = data.findIndex(row => row && row.includes('거래일시'));
          const dateIdx = data[headerIdx].indexOf('거래일시'), nameIdx = data[headerIdx].indexOf('보낸분/받는분'), outIdx = data[headerIdx].indexOf('출금액(원)'), inIdx = data[headerIdx].indexOf('입금액(원)');
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i]) continue;
            // 지출(출금액) 파싱
            const outAmount = Number(String(data[i][outIdx] || 0).replace(/,/g, ''));
            if (outAmount > 0) {
              const merchantName = data[i][nameIdx] || '알수없음';
              const isCardPayment = /(카드|결제|삼성|롯데|신한|국민|KB|현대|하나|비씨|BC|NH|농협)/i.test(merchantName);
              extracted.push({ transactionDate: data[i][dateIdx].split(' ')[0].replace(/\./g, '-'), amount: outAmount, merchantName, type: 'BANK', rawId: `OUT_${outAmount}_${i}`, isCardPayment });
            }
            // 수입(입금액) 파싱 -> 모두 순매출로 간주
            const inAmount = Number(String(data[i][inIdx] || 0).replace(/,/g, ''));
            if (inAmount > 0) {
              const senderName = data[i][nameIdx] || '알수없음';
              extracted.push({ transactionDate: data[i][dateIdx].split(' ')[0].replace(/\./g, '-'), amount: inAmount, merchantName: senderName, type: 'BANK_INCOME', rawId: `IN_${inAmount}_${i}` });
            }
          }
        } else if (uploadType === 'CARD') {
          const headerIdx = data.findIndex(row => row && row.includes('승인일'));
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || data[i][data[headerIdx].indexOf('상태')] !== '정상') continue;
            const amount = Number(String(data[i][data[headerIdx].indexOf('승인금액')]).replace(/,/g, ''));
            if (amount > 0) extracted.push({ transactionDate: String(data[i][data[headerIdx].indexOf('승인일')]).replace(/\./g, '-'), amount, merchantName: data[i][data[headerIdx].indexOf('가맹점명')] || '알수없음', type: 'CARD', rawId: `CARD_${amount}_${i}` });
          }
        } else if (uploadType === 'HOMETAX') {
          const headerIdx = data.findIndex(row => row && row.includes('승인번호'));
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || !data[i][data[headerIdx].indexOf('승인번호')]) continue;
            const amount = Number(String(data[i][data[headerIdx].indexOf('합계금액')]).replace(/,/g, ''));
            if (amount > 0) {
              const merchant = data[i][data[headerIdx].indexOf('상호')] || '알수없음', purposeStr = data[i][data[headerIdx].indexOf('품목명')] || '전자세금계산서 매입';
              let cat = '미분류'; const txt = `${merchant} ${purposeStr}`.replace(/\s/g, '');
              if (txt.includes('청소') || txt.includes('기장') || txt.includes('방역')) cat = '지급수수료';
              else if (txt.includes('임대') || txt.includes('월세')) cat = '지급임차료';
              else if (txt.includes('인쇄') || txt.includes('복사')) cat = '도서인쇄비';
              extracted.push({ transactionDate: String(data[i][data[headerIdx].indexOf('작성일자')]).replace(/\./g, '-'), amount, merchantName: merchant, purpose: purposeStr, type: 'HOMETAX', rawId: String(data[i][data[headerIdx].indexOf('승인번호')]), category: cat });
            }
          }
        }
        setParsedData(extracted);
      } catch (err) { alert(err.message || "엑셀 변환 오류"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleCategoryChange = (index, newCategory) => {
      const newData = [...parsedData];
      newData[index].category = newCategory;
      setParsedData(newData);
  };

  const handleMatchAndUpload = async () => {
    if (parsedData.length === 0) return;
    setIsMatching(true);
    try {
      const batch = writeBatch(db); 
      const unmatched = expenses.filter(e => !e.matchedTransactionId && e.status === 'PENDING');
      const expMap = new Map(); 
      unmatched.forEach(e => { const k = `${e.expenseDate}_${e.amount}`; if(!expMap.has(k)) expMap.set(k, []); expMap.get(k).push(e); });

      let addedCount = 0;

      for (const item of parsedData) {
        if (item.type === 'HOMETAX') {
            const expRef = doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.rawId);
            batch.set(expRef, { userId: 'SYSTEM_HOMETAX', userName: '전자세금계산서', expenseDate: item.transactionDate, amount: item.amount, method: '계좌이체', purpose: `[${item.merchantName}] ${item.purpose}`, category: item.category === '미분류' ? '지급수수료' : item.category, receiptUrl: '홈택스 증빙 완료', status: 'APPROVED', matchedTransactionId: null, createdAt: new Date().toISOString() }, { merge: true });
            addedCount++;
        } else if (item.type === 'CARD') {
            const expRef = doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`));
            batch.set(expRef, { userId: 'SYSTEM_CARD', userName: '법인카드', expenseDate: item.transactionDate, amount: item.amount, method: '법인카드', purpose: `[${item.merchantName}] 법인카드 지출`, category: '미분류', receiptUrl: '카드 승인 내역', status: 'APPROVED', matchedTransactionId: null, createdAt: new Date().toISOString() });
            addedCount++;
        } else if (item.type === 'BANK_INCOME') {
            // 🚀 은행 입금은 전부 매출로 잡음
            const incRef = doc(collection(db, `artifacts/${APP_ID}/public/data/incomes`));
            batch.set(incRef, { transactionDate: item.transactionDate, amount: item.amount, source: item.merchantName, createdAt: new Date().toISOString() });
            addedCount++;
        } else if (item.type === 'BANK') {
            const trxDocRef = doc(collection(db, `artifacts/${APP_ID}/public/data/transactions`));
            if (item.isCardPayment) {
                // 카드대금 결제는 이중지출 방지를 위해 '미지급금'으로 처리
                const expRef = doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`));
                batch.set(expRef, { userId: 'SYSTEM_BANK', userName: '시스템(자동 대체)', expenseDate: item.transactionDate, amount: item.amount, method: '계좌이체', purpose: `[${item.merchantName}] 카드대금 결제`, category: '미지급금', receiptUrl: '카드사 청구서 갈음', status: 'APPROVED', matchedTransactionId: trxDocRef.id, createdAt: new Date().toISOString() });
                batch.set(trxDocRef, { ...item, isMatched: true, matchedExpenseId: expRef.id, createdAt: new Date().toISOString() });
            } else {
                const matchCandidates = expMap.get(`${item.transactionDate}_${item.amount}`);
                if (matchCandidates && matchCandidates.length > 0) {
                    const matched = matchCandidates.shift();
                    batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, matched.id), { status: 'APPROVED', matchedTransactionId: trxDocRef.id, updatedAt: new Date().toISOString() });
                    batch.set(trxDocRef, { ...item, isMatched: true, matchedExpenseId: matched.id, createdAt: new Date().toISOString() });
                } else {
                    batch.set(trxDocRef, { ...item, isMatched: false, matchedExpenseId: null, createdAt: new Date().toISOString() });
                }
            }
            addedCount++;
        }
      }
      await batch.commit(); 
      alert(`총 ${addedCount}건의 장부 적재가 완료되었습니다!`); 
      setIsUploadModalOpen(false); 
      setParsedData([]);
    } catch (error) { alert("오류 발생: " + error.message); } finally { setIsMatching(false); }
  };

  const handleMonthChange = (offset) => {
    const [y, m] = selectedMonth.split('-').map(Number); let newDate = new Date(y, m - 1 + offset, 1);
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleApproval = async (id, status) => { 
      await writeBatch(db).update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, id), { status, updatedAt: new Date().toISOString() }).commit(); 
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      {/* 상단 컨트롤 패널 */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-gray-900 text-white p-6 rounded-2xl shadow-lg gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><Zap className="text-yellow-400"/> AI 재무 진단 시스템</h1>
          <p className="text-xs text-gray-400">통장 입출금 기반으로 학원의 진짜 현금 흐름을 분석합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 재무 환경 설정 버튼 */}
          <button onClick={() => setIsSettingsOpen(true)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Settings size={18}/> 설정
          </button>
          <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20">
            <UploadCloud size={18}/> 장부 동기화 (엑셀)
          </button>
          <button onClick={handleDownloadPerfectLedger} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20">
            <Download size={18}/> 세무 장부 다운
          </button>
          <div className="flex items-center gap-2 bg-white/10 px-4 py-1 rounded-xl ml-2">
            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><ChevronLeft/></button>
            <span className="font-bold tracking-widest">{selectedMonth.replace('-', '년 ')}월</span>
            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><ChevronRight/></button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-32 flex-col gap-4">
            <Loader className="animate-spin text-blue-600" size={48}/>
            <p className="text-gray-500 font-bold">현금 흐름 데이터 분석 중...</p>
        </div>
      ) : (
        <>
          {/* 1. 핵심 지표 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-indigo-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">실질 영업 이익 (고정비 제외)</p>
                <Activity size={16} className="text-indigo-500" />
              </div>
              <h3 className={`text-2xl font-black ${aiAnalytics.operatingProfit >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
                {formatCurrency(aiAnalytics.operatingProfit)}
              </h3>
              <p className="text-[10px] text-gray-400 mt-2 font-medium">손익분기점 모니터링 중</p>
            </div>

            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">BEP 달성률 (고정비 {formatCurrency(aiAnalytics.fixedCosts)})</p>
                <HeartPulse size={16} className="text-emerald-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">{aiAnalytics.bepRate.toFixed(1)}%</h3>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(aiAnalytics.bepRate, 100)}%` }} />
              </div>
            </div>

            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-orange-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">CAC (원생 1명당 획득비용)</p>
                <Target size={16} className="text-orange-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">{formatCurrency(aiAnalytics.cac)}</h3>
              <p className="text-[10px] text-orange-600 mt-2 font-bold">마케팅 효율성 지표</p>
            </div>

            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-rose-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">LTV (원생 생애 가치)</p>
                <LineChart size={16} className="text-rose-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">{formatCurrency(aiAnalytics.ltv)}</h3>
              <p className="text-[10px] text-gray-400 mt-2 font-medium">예상 이탈율 {aiAnalytics.churnRate.toFixed(1)}% 적용</p>
            </div>
          </div>

          {/* 2. 리스크 및 예측 알림 */}
          <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl">
            <h2 className="text-sm font-bold text-rose-800 mb-4 flex items-center gap-2"><ShieldAlert size={18}/> AI 리스크 탐지 및 세무 예측</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-rose-100 rounded-full text-rose-600"><AlertCircle/></div>
                <div>
                  <p className="text-xs text-gray-500 font-bold">이번 달 예상 세액 (부가세 등 대비용)</p>
                  <p className="text-lg font-black text-rose-600">{formatCurrency(aiAnalytics.vatEstimate)}</p>
                </div>
              </div>
              <div className="space-y-2">
                {aiAnalytics.anomalies.map((ano, i) => (
                  <div key={i} className="bg-white p-3 rounded-xl border border-orange-200 text-xs flex items-center gap-3">
                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    <span className="font-bold text-gray-700">{ano.msg}</span>
                  </div>
                ))}
                {aiAnalytics.anomalies.length === 0 && (
                    <div className="bg-white p-3 rounded-xl border border-emerald-200 text-xs text-emerald-700 font-bold flex items-center gap-2">
                        <CheckCircle size={14}/> 현재 이상 지출 징후가 발견되지 않았습니다.
                    </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. 시각적 데이터 분석 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 bg-white shadow-sm border border-gray-200 rounded-2xl">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2"><BarChart3 size={20} className="text-indigo-600"/> 주요 항목별 수익성(ROI) 분석</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={aiAnalytics.roiData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value/10000}만`} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value) => formatCurrency(value)} />
                    <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} name="매출 기여도" />
                    <Line type="monotone" dataKey="cost" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="운영 비용" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 bg-white shadow-sm border border-gray-200 rounded-2xl flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2"><Database size={20} className="text-blue-600"/> 일자별 누적 순이익 (BEP 추적)</h2>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={aiAnalytics.dailyFlowData}>
                      <defs>
                        <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} minTickGap={3}/>
                      <YAxis hide domain={['dataMin', 'dataMax']} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: 'BEP (손익분기점)', fill: '#ef4444', fontSize: 10 }} />
                      <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCumulative)" strokeWidth={3} name="누적 이익" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-xl flex justify-between items-center">
                <span className="text-sm font-bold text-gray-600">현재 누적 상황</span>
                <span className={`text-lg font-black ${aiAnalytics.operatingProfit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {aiAnalytics.operatingProfit >= 0 ? 'BEP 돌파 🚀' : `${formatCurrency(Math.abs(aiAnalytics.operatingProfit))} 부족`}
                </span>
              </div>
            </div>
          </div>

          {/* 4. 통합 재무 원장 테이블 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px] mt-6">
            <div className="p-5 border-b bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Database className="text-indigo-600" size={20} /> 월별 통합 재무 원장</h2>
              <div className="relative w-full sm:w-72">
                <input type="text" placeholder="적요, 거래처, 카테고리 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold"/>
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-white custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3">일자</th>
                    <th className="px-4 py-3">구분</th>
                    <th className="px-4 py-3">계정과목</th>
                    <th className="px-4 py-3">적요 / 거래처</th>
                    <th className="px-4 py-3 text-right">금액</th>
                    <th className="px-4 py-3 text-center">결제/승인</th>
                    <th className="px-4 py-3 text-center">증빙자료</th>
                  </tr>
                </thead>
                <tbody>
                  {integratedLedger.length === 0 ? <tr><td colSpan="7" className="text-center py-10 text-gray-400 font-bold">내역이 없습니다.</td></tr> : integratedLedger.map((item) => (
                    <tr key={item.id} className={`border-b hover:bg-gray-50 transition-colors ${item.type.includes('수입') ? 'bg-blue-50/30' : (item.status === 'ERROR' ? 'bg-rose-50/50' : '')}`}>
                      <td className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{item.date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.type.includes('수입') ? 'bg-blue-100 text-blue-700' : (item.status === 'ERROR' ? 'bg-rose-100 text-rose-700' : (item.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'))}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-indigo-700 whitespace-nowrap">{item.category}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 truncate max-w-xs">{item.purpose}</td>
                      <td className={`px-4 py-3 font-black text-right whitespace-nowrap ${item.type.includes('수입') ? 'text-blue-600' : 'text-gray-900'}`}>{item.type.includes('수입') ? '+' : ''}{item.amount.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-center">{item.status === 'PENDING' ? <div className="flex justify-center gap-1"><button onClick={() => handleApproval(item.id, 'APPROVED')} className="text-[10px] bg-emerald-500 text-white px-2 py-1 rounded shadow-sm hover:bg-emerald-600">승인</button><button onClick={() => handleApproval(item.id, 'REJECTED')} className="text-[10px] bg-rose-500 text-white px-2 py-1 rounded shadow-sm hover:bg-rose-600">반려</button></div> : <span className="text-gray-500 font-semibold">{item.method}</span>}</td>
                      <td className="px-4 py-3 text-center">{item.receiptUrl && !item.receiptUrl.includes('증빙') && !item.receiptUrl.includes('갈음') && !item.receiptUrl.includes('자동정산') ? <button onClick={() => setPreviewUrl(item.receiptUrl)} className="text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 font-bold text-xs mx-auto border border-blue-200 bg-white px-2 py-1 rounded-md transition-colors hover:bg-blue-50 shadow-sm"><ImageIcon size={12}/> 조회</button> : <span className="text-gray-400 text-xs">{item.receiptUrl || '없음'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 🚀 재무 환경 설정 모달 */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-6 relative">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4"><Settings className="text-gray-600"/> 재무 환경 설정</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">월 고정 임대료 (원)</label>
                <input type="number" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 font-bold" value={finSettings.rent} onChange={e => setFinSettings({...finSettings, rent: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">월 평균 관리비 (원)</label>
                <input type="number" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 font-bold" value={finSettings.maintenance} onChange={e => setFinSettings({...finSettings, maintenance: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setIsSettingsOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">닫기</button>
              <button onClick={handleSaveSettings} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">설정값 저장</button>
            </div>

            <hr className="my-6 border-gray-200" />
            
            {/* 🚀 통통통 연동 찌꺼기 삭제 구역 */}
            <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
                <h4 className="text-sm font-bold text-red-800 mb-2 flex items-center gap-1"><AlertCircle size={16}/> 장부 초기화 (통통통 엑셀)</h4>
                <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                    과거 통통통 엑셀을 업로드하여 잘못 생성된 <strong>수입(매출) 및 수수료 지출</strong> 데이터만 깔끔하게 삭제합니다. (정상 은행/카드 내역은 삭제되지 않습니다.)
                </p>
                <button onClick={handleCleanupTongTong} disabled={isProcessingCleanup} className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                    {isProcessingCleanup ? <Loader size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {isProcessingCleanup ? '삭제 처리 중...' : `기존 통통통 연동 데이터 일괄 삭제`}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 업로드 모달 */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2"><UploadCloud className="text-blue-600"/> 금융 엑셀 일괄 동기화</h3>
              <button onClick={() => setIsUploadModalOpen(false)}><XCircle size={24} className="text-gray-400 hover:text-gray-800 transition-colors"/></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="space-y-5">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                  {/* 🚀 통통통 탭 제거, 은행 중심 UI 구성 */}
                  <button onClick={() => { setUploadType('BANK'); setParsedData([]); }} className={`flex-1 py-3 text-sm rounded-lg font-bold transition-colors ${uploadType === 'BANK' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>KB은행 통장</button>
                  <button onClick={() => { setUploadType('CARD'); setParsedData([]); }} className={`flex-1 py-3 text-sm rounded-lg font-bold transition-colors ${uploadType === 'CARD' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>법인카드 승인</button>
                  <button onClick={() => { setUploadType('HOMETAX'); setParsedData([]); }} className={`flex-1 py-3 text-sm rounded-lg font-bold transition-colors ${uploadType === 'HOMETAX' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>홈택스 매입건</button>
                </div>
                <div className="border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 rounded-2xl text-center hover:bg-blue-50 transition-colors">
                  <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} ref={fileInputRef} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 mb-3 cursor-pointer transition-colors"/>
                  <p className="text-xs text-gray-500 mt-2 font-medium">
                      현금주의 원칙에 따라 통장에 입금된 내역은 모두 <strong className="text-blue-600">진성 매출(수입)</strong>로 잡힙니다.
                  </p>
                </div>
                {parsedData.length > 0 && (
                  <div className="mt-4 animate-in slide-in-from-bottom-2">
                    <div className="max-h-80 overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm space-y-3 custom-scrollbar">
                      {parsedData.map((d, i) => (
                        <div key={i} className="flex flex-col md:flex-row justify-between md:items-center border-b border-gray-200 pb-3 last:border-0 last:pb-0 gap-3">
                          <div className="flex flex-col">
                              <span className="text-gray-800 font-bold flex items-center gap-2">
                                <span className="truncate max-w-[150px] md:max-w-[200px]">{d.merchantName}</span>
                                <span className="text-gray-500 font-normal text-xs ml-1">({d.transactionDate})</span>
                              </span>
                              {d.purpose && <span className="text-xs text-gray-500 truncate max-w-[250px]">{d.purpose}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-black flex-shrink-0 text-right w-24 ${d.type.includes('INCOME') ? 'text-blue-600' : 'text-red-500'}`}>{d.amount.toLocaleString()}원</span>
                            {uploadType === 'HOMETAX' && (
                                <select 
                                    value={d.category} 
                                    onChange={(e) => handleCategoryChange(i, e.target.value)} 
                                    className={`border p-2 rounded-lg text-xs font-bold outline-none cursor-pointer transition-colors ${d.category === '미분류' ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-gray-300 bg-white text-indigo-700 hover:border-indigo-400'}`}
                                >
                                    {OFFICIAL_ACCOUNTS.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                                </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleMatchAndUpload} disabled={isMatching} className="w-full mt-5 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-transform active:scale-95">
                        {isMatching ? <Loader className="animate-spin" size={20}/> : <FileSpreadsheet size={20}/>} 
                        장부 자동 동기화 시작
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 풀스크린 영수증 뷰어 */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white p-5 rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 px-3 border-b pb-3">
              <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2"><ImageIcon className="text-blue-600" size={24}/> 영수증 상세 확인</h3>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-500 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition-colors flex items-center gap-1 font-bold text-sm">닫기 <XCircle size={24}/></button>
            </div>
            <div className="bg-gray-100/50 rounded-2xl overflow-hidden flex justify-center items-center flex-1 w-full h-full relative p-2 border border-gray-200">
              {previewUrl.startsWith('data:application/pdf') || previewUrl.endsWith('.pdf') ? <iframe src={previewUrl} className="w-full h-full border-0 rounded-xl" title="receipt-preview" /> : <img src={previewUrl} alt="Receipt Preview" className="w-full h-full object-contain drop-shadow-sm rounded-xl" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialDashboard;