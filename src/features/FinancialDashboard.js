import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, writeBatch, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, ChevronLeft, ChevronRight, Receipt, Loader, 
  Wallet, Download, BellRing, UploadCloud, FileSpreadsheet, 
  ShieldAlert, Image as ImageIcon, Search, Database,
  Activity, LineChart, Settings, RefreshCcw, Trash2,
  Calendar, Target, AlertTriangle // 🚀 누락되었던 아이콘 및 신규 달력 아이콘 추가
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, ComposedChart, Line, ReferenceLine
} from 'recharts';

const APP_ID = 'imperial-clinic-v1';

const OFFICIAL_ACCOUNTS = [
  '미분류', '직원급여', '상여금', '퇴직급여', '복리후생비', '여비교통비', '접대비', 
  '통신비', '수도광열비', '세금과공과금', '감가상각비', '지급임차료', '건물관리비', '수선비', 
  '보험료', '차량유지비', '운반비', '도서인쇄비', '소모품비', '지급수수료', '광고선전비', '미지급금'
];

// 🚀 [신규 추가] 카테고리별 예산 분배 비율 (매출 100% 기준)
const BUDGET_CATEGORIES = [
    { id: 'labor', name: '인건비', ratio: 0.50, accounts: ['직원급여', '상여금', '퇴직급여', '보험료', '세금과공과금'] },
    { id: 'facility', name: '시설/공간비', ratio: 0.10, accounts: ['지급임차료', '건물관리비', '수도광열비', '수선비'] },
    { id: 'marketing', name: '마케팅비용', ratio: 0.10, accounts: ['광고선전비', '도서인쇄비'] },
    { id: 'operation', name: '학원운영비', ratio: 0.10, accounts: ['지급수수료', '통신비', '차량유지비', '운반비', '여비교통비'] },
    { id: 'welfare', name: '복리후생/소모품', ratio: 0.05, accounts: ['복리후생비', '소모품비', '접대비'] },
];

const AUTO_PROOF_KEYWORDS = [
  { key: /(월세|임대료)/, cat: '지급임차료', note: '전자세금계산서 갈음' },
  { key: /(관리비)/, cat: '수도광열비', note: '전자세금계산서 갈음' },
  { key: /(전기|한국전력|가스)/, cat: '수도광열비', note: '전자세금계산서/지로 갈음' },
  { key: /(CCTV|에스원|캡스|세콤)/, cat: '지급수수료', note: '전자세금계산서 갈음' },
  { key: /(급여|월급)/, cat: '직원급여', note: '급여대장/명세서 갈음' },
  { key: /(세무|회계|기장)/, cat: '지급수수료', note: '전자세금계산서 갈음' },
  { key: /(프로그램|LMS|통통통)/, cat: '지급수수료', note: '전자세금계산서 갈음' },
  { key: /(렌탈|복사기|정수기)/, cat: '지급임차료', note: '전자세금계산서 갈음' },
  { key: /(건강보험|국민연금|고용보험|산재보험|보험료|국민건강)/, cat: '세금과공과금', note: '자동이체 고지서 갈음' },
  { key: /(청소|방역)/, cat: '지급수수료', note: '전자세금계산서 갈음' },
];

const normalizeDateStr = (dateVal) => {
    if (!dateVal) return '';
    const s = String(dateVal).trim();
    if (!isNaN(s) && Number(s) > 10000 && Number(s) < 99999) {
        const excelEpoch = new Date(1899, 11, 30);
        const dateObj = new Date(excelEpoch.getTime() + Number(s) * 86400000);
        return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    }
    const matches = s.match(/(\d{4})[^0-9]*(\d{1,2})[^0-9]*(\d{1,2})/);
    if (matches) return `${matches[1]}-${matches[2].padStart(2, '0')}-${matches[3].padStart(2, '0')}`;
    return s.replace(/\./g, '-').replace(/\//g, '-').split(' ')[0];
};

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
  const [uploadType, setUploadType] = useState('BANK'); 
  const [parsedData, setParsedData] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const [extractedInitialBalance, setExtractedInitialBalance] = useState(null);

  const fileInputRef = useRef(null);
  
  const [previewReceipts, setPreviewReceipts] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [finSettings, setFinSettings] = useState({ rent: 4000000, maintenance: 500000, initialBalance: 0, customAutoProof: [] });
  const [isProcessingCleanup, setIsProcessingCleanup] = useState(false);
  const [newKeyword, setNewKeyword] = useState({ key: '', cat: '지급수수료', note: '전자세금계산서 갈음' });

  // 🚀 [신규 추가] 원인 지출 내역 보기 모달 상태
  const [culpritModalData, setCulpritModalData] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
          const docRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'finance');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              const data = docSnap.data();
              setFinSettings({ 
                  rent: data.rent || 4000000, 
                  maintenance: data.maintenance || 500000, 
                  initialBalance: data.initialBalance || 0,
                  customAutoProof: data.customAutoProof || []
              });
          }
      } catch (err) {
          console.error("설정 로드 실패:", err);
      }
    };
    loadSettings();
  }, []);

  const handleReverifyMissing = async (isSilent = false) => {
    setIsProcessingCleanup(!isSilent);
    try {
        const dynamicAutoProofKeywords = [
            ...AUTO_PROOF_KEYWORDS,
            ...(finSettings.customAutoProof || []).map(k => ({ key: new RegExp(k.key), cat: k.cat, note: k.note }))
        ];

        const batch = writeBatch(db);
        let updatedCount = 0;
        
        const unmatchedExps = expenses.filter(e => e.status === 'PENDING' && !e.matchedTransactionId);

        for (const trx of missingReceipts) {
            let isMatched = false;

            const expIdx = unmatchedExps.findIndex(e => 
                normalizeDateStr(e.expenseDate) === normalizeDateStr(trx.transactionDate) && 
                Number(e.amount) === Number(trx.amount)
            );

            if (expIdx > -1) {
                const matchedExp = unmatchedExps.splice(expIdx, 1)[0];
                batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, matchedExp.id), {
                    status: 'APPROVED',
                    matchedTransactionId: trx.id,
                    updatedAt: new Date().toISOString()
                });
                batch.update(doc(db, `artifacts/${APP_ID}/public/data/transactions`, trx.id), {
                    isMatched: true,
                    matchedExpenseId: matchedExp.id,
                    updatedAt: new Date().toISOString()
                });
                updatedCount++;
                isMatched = true;
            }

            if (!isMatched) {
                for (const rule of dynamicAutoProofKeywords) {
                    if (rule.key.test(trx.merchantName)) {
                        const expRef = doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`));
                        batch.set(expRef, {
                            userId: 'SYSTEM_AUTO', userName: '시스템(자동증빙)',
                            expenseDate: trx.transactionDate, amount: trx.amount,
                            method: '자동이체', purpose: `[${trx.merchantName}] 자동 증빙 완료건`,
                            category: rule.cat, receiptUrl: rule.note, receiptUrls: [],
                            status: 'APPROVED', matchedTransactionId: trx.id,
                            createdAt: new Date().toISOString()
                        });
                        batch.update(doc(db, `artifacts/${APP_ID}/public/data/transactions`, trx.id), {
                            isMatched: true,
                            matchedExpenseId: expRef.id,
                            updatedAt: new Date().toISOString()
                        });
                        updatedCount++;
                        isMatched = true;
                        break;
                    }
                }
            }
        }

        if (updatedCount > 0) {
            await batch.commit();
            if (!isSilent) alert(`완료되었습니다!\n총 ${updatedCount}건의 누락 지출이 결의서 또는 자동 증빙과 재매칭되었습니다.`);
        } else {
            if (!isSilent) alert('새롭게 매칭할 누락 내역이 없습니다.');
        }
    } catch(e) {
        if (!isSilent) alert("재매칭 중 오류 발생: " + e.message);
    } finally {
        setIsProcessingCleanup(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsProcessingCleanup(true);
    try {
        await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'finance'), finSettings, { merge: true });
        await handleReverifyMissing(true); 
        setIsSettingsOpen(false);
        alert('재무 환경 설정이 저장되었으며, 과거 누락 내역에 설정값이 소급 반영되었습니다!');
    } catch (err) {
        alert('설정 저장 중 오류가 발생했습니다.');
    } finally {
        setIsProcessingCleanup(false);
    }
  };

  const handleAddKeyword = () => {
      if (!newKeyword.key.trim()) return;
      setFinSettings(prev => ({
          ...prev,
          customAutoProof: [...(prev.customAutoProof || []), { ...newKeyword, key: newKeyword.key.trim() }]
      }));
      setNewKeyword({ key: '', cat: '지급수수료', note: '전자세금계산서 갈음' });
  };

  const handleRemoveKeyword = (index) => {
      setFinSettings(prev => {
          const newArr = [...prev.customAutoProof];
          newArr.splice(index, 1);
          return { ...prev, customAutoProof: newArr };
      });
  };

  const handleResetExcelData = async () => {
    if (!window.confirm(`⚠️ [${selectedMonth}월]의 모든 엑셀 업로드 내역을 초기화하시겠습니까?\n\n* 통장(수입) 및 누락 지출 데이터가 삭제됩니다.\n* 지출결의서는 안전하게 '대기' 상태로 복구됩니다.`)) return;
    setIsProcessingCleanup(true);
    try {
        const batch = writeBatch(db); let opCount = 0;
        const monthStart = `${selectedMonth}-01`, monthEnd = `${selectedMonth}-31`;
        
        const incSnap = await getDocs(query(collection(db, `artifacts/${APP_ID}/public/data/incomes`), where('transactionDate', '>=', monthStart), where('transactionDate', '<=', monthEnd)));
        incSnap.forEach(d => { batch.delete(d.ref); opCount++; });
        
        const trxSnap = await getDocs(query(collection(db, `artifacts/${APP_ID}/public/data/transactions`), where('transactionDate', '>=', monthStart), where('transactionDate', '<=', monthEnd)));
        trxSnap.forEach(d => { 
            const data = d.data(); batch.delete(d.ref); opCount++; 
            if (data.matchedExpenseId) batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, data.matchedExpenseId), { matchedTransactionId: null, status: 'PENDING', updatedAt: new Date().toISOString() });
        });

        const expSnap = await getDocs(query(collection(db, `artifacts/${APP_ID}/public/data/expenses`), where('expenseDate', '>=', monthStart), where('expenseDate', '<=', monthEnd)));
        expSnap.forEach(d => {
            const data = d.data();
            if (data.userId && (String(data.userId).startsWith('SYSTEM_') || data.userId === 'SYSTEM_AUTO')) { batch.delete(d.ref); opCount++; } 
            else if (data.matchedTransactionId || data.status === 'APPROVED') { batch.update(d.ref, { matchedTransactionId: null, status: 'PENDING', updatedAt: new Date().toISOString() }); opCount++; }
        });

        if (opCount > 0) { await batch.commit(); alert(`초기화 완료!\n총 ${opCount}건의 데이터가 정리 및 롤백되었습니다.\n이제 엑셀을 다시 업로드해 주세요.`); } 
        else { alert(`[${selectedMonth}월]에는 초기화할 엑셀 연동 데이터가 없습니다.`); }
    } catch (e) { alert("초기화 중 오류 발생: " + e.message); } 
    finally { setIsProcessingCleanup(false); }
  };

  useEffect(() => {
    setIsLoading(true);
    try {
        const monthStart = `${selectedMonth}-01`, monthEnd = `${selectedMonth}-31`;
        const expQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), where('expenseDate', '>=', monthStart), where('expenseDate', '<=', monthEnd));
        const unsubscribeExp = onSnapshot(expQuery, (snapshot) => { setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoading(false); });
        
        const incQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'incomes'), where('transactionDate', '>=', monthStart), where('transactionDate', '<=', monthEnd));
        const unsubscribeInc = onSnapshot(incQuery, (snapshot) => { setIncomes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
        
        const trxQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'transactions'), where('transactionDate', '>=', monthStart), where('transactionDate', '<=', monthEnd), where('isMatched', '==', false));
        const unsubscribeTrx = onSnapshot(trxQuery, (snapshot) => { setMissingReceipts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
        
        return () => { unsubscribeExp(); unsubscribeInc(); unsubscribeTrx(); };
    } catch (err) {
        console.error("데이터 구독 에러", err);
        setIsLoading(false);
    }
  }, [selectedMonth]);

  const aiAnalytics = useMemo(() => {
    const totalIncome = incomes.reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0);
    const totalExpense = expenses.filter(e => e.status === 'APPROVED' && e.category !== '미지급금').reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
    
    const fixedCosts = Number(finSettings.rent || 0) + Number(finSettings.maintenance || 0);
    const operatingProfit = totalIncome - totalExpense - fixedCosts; 

    const denom = fixedCosts + totalExpense;
    const bepRate = denom > 0 ? (totalIncome / denom) * 100 : 0;
    const runway = operatingProfit < 0 ? Math.abs(totalIncome / operatingProfit).toFixed(1) : '12+';

    const marketingSpend = expenses.filter(e => e.category === '광고선전비').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const cac = marketingSpend / 10; 
    const ltv = totalIncome > 0 ? (totalIncome / 150) * (100 / 2) : 0; 

    const vatEstimate = totalIncome * 0.1 - (totalExpense * 0.05);

    // 🚀 [신규 추가] 카테고리별 예산 소진 자동 계산 (매출 기반)
    const budgetTracking = BUDGET_CATEGORIES.map(cat => {
        const allocated = totalIncome * cat.ratio;
        const spent = expenses
            .filter(e => e.status === 'APPROVED' && cat.accounts.includes(e.category))
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        
        const utilization = allocated > 0 ? (spent / allocated) * 100 : (spent > 0 ? 100 : 0);
        
        const topExpenses = expenses
            .filter(e => e.status === 'APPROVED' && cat.accounts.includes(e.category))
            .sort((a, b) => Number(b.amount) - Number(a.amount));

        return { ...cat, allocated, spent, utilization, topExpenses };
    });

    const totalBudgetAllocated = totalIncome * 0.85; 
    const totalBudgetSpent = budgetTracking.reduce((sum, c) => sum + c.spent, 0);
    const totalBudgetUtilization = totalBudgetAllocated > 0 ? (totalBudgetSpent / totalBudgetAllocated) * 100 : (totalBudgetSpent > 0 ? 100 : 0);

    let budgetStatus = { color: 'emerald', text: '현재 예산이 건강하게 관리되고 있습니다.', icon: CheckCircle };
    if (totalBudgetUtilization >= 91) {
        budgetStatus = { color: 'rose', text: '목표 예산을 초과할 위험이 있습니다!', icon: AlertTriangle };
    } else if (totalBudgetUtilization >= 71) {
        budgetStatus = { color: 'amber', text: '예산 소진이 빠릅니다. 추가 지출을 확인하세요.', icon: AlertCircle };
    }

    const budgetAlerts = budgetTracking.filter(cat => cat.utilization >= 85);

    // 🚀 [원본 유지] 기존 이상 탐지 로직 (Anomalies) 및 카테고리별 합산
    const anomalies = [];
    const categoryTotals = {};
    expenses.filter(e => e.status === 'APPROVED').forEach(e => { 
        const cat = e.category || '미분류';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(e.amount) || 0); 
    });
    if (categoryTotals['소모품비'] > 1000000) anomalies.push({ msg: "소모품비 지출 평소 대비 급증 감지 (점검 요망)", type: "warning" });

    // 🚀 [원본 유지] 기존 수익성 ROI 차트 데이터
    const roiData = OFFICIAL_ACCOUNTS.slice(1, 7).map((acc, idx) => ({
      name: acc,
      value: totalIncome > 0 ? totalIncome * (0.2 - idx * 0.02) : 5000000 - idx * 500000,
      cost: categoryTotals[acc] || 500000
    }));

    // 🚀 [원본 유지] 기존 일자별 흐름 데이터
    const dailyFlowData = [];
    let cumulative = -fixedCosts; 
    try {
        const [y, m] = selectedMonth.split('-').map(Number);
        if (y && m) {
            const daysInMonth = new Date(y, m, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dailyInc = incomes.filter(i => i.transactionDate === dateStr).reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
                const dailyExp = expenses.filter(e => e.expenseDate === dateStr && e.status === 'APPROVED' && e.category !== '미지급금').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                cumulative += (dailyInc - dailyExp);
                dailyFlowData.push({ day: `${d}일`, cumulative: cumulative, bep: 0 });
            }
        }
    } catch(e) {}

    return { 
      totalIncome, totalExpense, fixedCosts, operatingProfit, bepRate, runway, 
      cac, churnRate: 2, ltv, vatEstimate, anomalies, roiData, dailyFlowData,
      budgetTracking, totalBudgetAllocated, totalBudgetSpent, totalBudgetUtilization, budgetStatus, budgetAlerts 
    };
  }, [expenses, incomes, finSettings, selectedMonth]);

  const integratedLedger = useMemo(() => {
    const list = [
      ...incomes.map(i => ({ id: `inc_${i.id}`, realId: i.id, date: i.transactionDate || '', type: i.isPgSettlement ? 'PG정산(참고용)' : '수입(매출)', category: i.isPgSettlement ? '미수금회수' : '사업소득', purpose: i.source || '알수없음', amount: Number(i.amount) || 0, method: i.method || '계좌입금', status: 'COMPLETED', receiptUrl: '', receiptUrls: [] })),
      ...expenses.filter(e => e.status === 'APPROVED').map(e => ({ id: `exp_${e.id}`, realId: e.id, date: e.expenseDate || '', type: e.category === '미지급금' ? '카드대금결제' : '지출(정상)', category: e.category || '미분류', purpose: e.purpose || '알수없음', amount: Number(e.amount) || 0, method: e.method || '알수없음', receiptUrl: e.receiptUrl || '', receiptUrls: e.receiptUrls || [], status: 'COMPLETED' })),
      ...missingReceipts.map(m => ({ id: `mis_${m.id}`, realId: m.id, date: m.transactionDate || '', type: '지출(누락)', category: '미확인', purpose: m.merchantName || '알수없음', amount: Number(m.amount) || 0, method: m.type || '알수없음', status: 'ERROR', receiptUrl: '', receiptUrls: [] })),
      ...expenses.filter(e => e.status === 'PENDING').map(e => ({ id: `pen_${e.id}`, realId: e.id, date: e.expenseDate || '', type: '지출(대기)', category: e.category || '미분류', purpose: e.purpose || '알수없음', amount: Number(e.amount) || 0, method: e.method || '알수없음', receiptUrl: e.receiptUrl || '', receiptUrls: e.receiptUrls || [], status: 'PENDING' }))
    ];
    const safeSearch = (searchTerm || '').toLowerCase();
    return list.filter(item => (item.purpose || '').toLowerCase().includes(safeSearch) || (item.category || '').toLowerCase().includes(safeSearch)).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [expenses, incomes, missingReceipts, searchTerm]);

  const formatCurrency = (num) => {
      if (isNaN(num)) return "0원";
      return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num);
  };

  const handleDownloadPerfectLedger = () => {
    const sortedList = [...integratedLedger].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    let currentBalance = Number(finSettings.initialBalance || 0);
    const excelData = sortedList.map(item => {
      const isIncome = (item.type || '').includes('수입');
      if (isIncome) currentBalance += item.amount; else currentBalance -= item.amount;
      const primaryUrl = (item.receiptUrls && item.receiptUrls.length > 0) ? item.receiptUrls[0] : item.receiptUrl;
      const isElectronic = primaryUrl && String(primaryUrl).includes('data:');
      return { '거래일자': item.date, '구분': item.type, '계정과목': item.category, '적요/거래처': item.purpose, '입금액(차변)': isIncome ? item.amount : 0, '출금액(대변)': !isIncome ? item.amount : 0, '통장잔액': currentBalance, '결제수단': item.method, '증빙유형': isElectronic ? `전자영수증(${(item.receiptUrls?.length || 1)}장)` : (primaryUrl || '없음') };
    });
    if (excelData.length === 0) return alert("다운로드할 데이터가 없습니다.");
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws['!cols'] = [ {wch: 12}, {wch: 15}, {wch: 12}, {wch: 25}, {wch: 12}, {wch: 12}, {wch: 15}, {wch: 10}, {wch: 20} ];
    integratedLedger.forEach((item, idx) => {
      const primaryUrl = (item.receiptUrls && item.receiptUrls.length > 0) ? item.receiptUrls[0] : item.receiptUrl;
      if (primaryUrl && String(primaryUrl).startsWith('data:')) {
        const cellRef = XLSX.utils.encode_cell({ c: 8, r: idx + 1 }); ws[cellRef].l = { Target: primaryUrl, Tooltip: "영수증 원본 보기" };
      }
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "임페리얼_통합재무원장(복식)"); XLSX.writeFile(wb, `임페리얼_복식장부_${selectedMonth}.xlsx`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result; const workbook = XLSX.read(bstr, { type: 'binary' });
      const ws = workbook.Sheets[workbook.SheetNames[0]]; const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const extracted = [];
      const unmatchedExps = [...expenses.filter(e => !e.matchedTransactionId || e.matchedTransactionId === 'SYSTEM_CARD_VERIFIED')];
      const dynamicAutoProofKeywords = [...AUTO_PROOF_KEYWORDS, ...(finSettings.customAutoProof || []).map(k => ({ key: new RegExp(k.key), cat: k.cat, note: k.note }))];
      setExtractedInitialBalance(null);
      try {
        if (uploadType === 'BANK') {
          const headerIdx = data.findIndex(row => row && row.includes('거래일시'));
          if (headerIdx === -1) throw new Error("은행 엑셀 형식이 아닙니다.");
          const dateIdx = data[headerIdx].indexOf('거래일시'), nameIdx = data[headerIdx].indexOf('보낸분/받는분'), outIdx = data[headerIdx].indexOf('출금액(원)'), inIdx = data[headerIdx].indexOf('입금액(원)');
          const balIdx = data[headerIdx].findIndex(col => String(col || '').includes('잔액'));
          if (balIdx > -1) {
              for (let i = data.length - 1; i > headerIdx; i--) {
                  if (data[i] && data[i][dateIdx]) {
                      const oldestBal = Number(String(data[i][balIdx] || 0).replace(/,/g, ''));
                      const oldestOut = Number(String(data[i][outIdx] || 0).replace(/,/g, ''));
                      const oldestIn = Number(String(data[i][inIdx] || 0).replace(/,/g, ''));
                      setExtractedInitialBalance(oldestBal + oldestOut - oldestIn); break;
                  }
              }
          }
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i]) continue;
            const transactionDate = normalizeDateStr(data[i][dateIdx]);
            const outAmount = Number(String(data[i][outIdx] || 0).replace(/,/g, ''));
            if (outAmount > 0) {
              const merchantName = data[i][nameIdx] || '알수없음';
              const isCardPayment = /(카드|결제|삼성|롯데|신한|국민|KB|현대|하나|비씨|BC|NH|농협)/i.test(merchantName);
              let matchedExpense = null, isAutoProof = false, matchedRule = null;
              if (!isCardPayment) { 
                  const matchIdx = unmatchedExps.findIndex(e => normalizeDateStr(e.expenseDate) === transactionDate && Number(e.amount) === outAmount);
                  if (matchIdx > -1) matchedExpense = unmatchedExps.splice(matchIdx, 1)[0]; 
                  else { for (const rule of dynamicAutoProofKeywords) { if (rule.key.test(merchantName)) { isAutoProof = true; matchedRule = rule; break; } } }
              }
              extracted.push({ transactionDate, amount: outAmount, merchantName, type: 'BANK', rawId: `OUT_${outAmount}_${i}`, isCardPayment, matchedExpense, isAutoProof, matchedRule });
            }
            const inAmount = Number(String(data[i][inIdx] || 0).replace(/,/g, ''));
            if (inAmount > 0) extracted.push({ transactionDate, amount: inAmount, merchantName: data[i][nameIdx] || '알수없음', type: 'BANK_INCOME', rawId: `IN_${inAmount}_${i}` });
          }
        } else if (uploadType === 'CARD') {
          const headerIdx = data.findIndex(row => row && row.includes('승인일'));
          if (headerIdx === -1) throw new Error("법인카드 엑셀 형식이 아닙니다.");
          const deptCodeIdx = data[headerIdx].findIndex(col => String(col || '').includes('부서'));
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || data[i][data[headerIdx].indexOf('상태')] !== '정상') continue;
            if (deptCodeIdx > -1) { const cleanDeptCode = String(data[i][deptCodeIdx] || '').trim().replace(/['"]/g, ''); if (cleanDeptCode === '00001' || cleanDeptCode === '1' || cleanDeptCode === '0001') continue; }
            const amount = Number(String(data[i][data[headerIdx].indexOf('승인금액')]).replace(/,/g, ''));
            if (amount > 0) {
                const transactionDate = normalizeDateStr(data[i][data[headerIdx].indexOf('승인일')]);
                const matchIdx = unmatchedExps.findIndex(e => normalizeDateStr(e.expenseDate) === transactionDate && Number(e.amount) === amount);
                extracted.push({ transactionDate, amount, merchantName: data[i][data[headerIdx].indexOf('가맹점명')] || '알수없음', type: 'CARD', rawId: `CARD_${amount}_${i}`, matchedExpense: matchIdx > -1 ? unmatchedExps.splice(matchIdx, 1)[0] : null });
            }
          }
        }
        setParsedData(extracted);
      } catch (err) { alert(err.message || "엑셀 변환 오류"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleMatchAndUpload = async () => {
    if (parsedData.length === 0) return;
    setIsMatching(true);
    try {
      const batch = writeBatch(db); let addedCount = 0, missingProofCount = 0;
      if (uploadType === 'BANK' && extractedInitialBalance !== null) {
          const newSettings = { ...finSettings, initialBalance: extractedInitialBalance };
          await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'finance'), newSettings, { merge: true }); setFinSettings(newSettings);
      }
      for (const item of parsedData) {
        const { matchedExpense, matchedRule, isAutoProof, ...safeItem } = item;
        if (item.type === 'CARD') {
            if (item.matchedExpense) {
                batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.matchedExpense.id), { status: 'APPROVED', matchedTransactionId: 'SYSTEM_CARD_VERIFIED', updatedAt: new Date().toISOString() });
            } else {
                batch.set(doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`)), { userId: 'SYSTEM_CARD', userName: '미등록 법인카드', expenseDate: safeItem.transactionDate, amount: safeItem.amount, method: '법인카드', purpose: `[${safeItem.merchantName}] 증빙 누락 지출`, category: '미분류', receiptUrl: '증빙 필요', receiptUrls: [], status: 'APPROVED', matchedTransactionId: 'SYSTEM_CARD_VERIFIED', createdAt: new Date().toISOString() });
            }
            addedCount++;
        } else if (item.type === 'BANK_INCOME') {
            batch.set(doc(collection(db, `artifacts/${APP_ID}/public/data/incomes`)), { transactionDate: safeItem.transactionDate, amount: safeItem.amount, source: safeItem.merchantName, createdAt: new Date().toISOString() });
            addedCount++;
        } else if (item.type === 'BANK') {
            const trxDocRef = doc(collection(db, `artifacts/${APP_ID}/public/data/transactions`));
            if (item.matchedExpense) {
                batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.matchedExpense.id), { status: 'APPROVED', matchedTransactionId: trxDocRef.id, updatedAt: new Date().toISOString() });
                batch.set(trxDocRef, { ...safeItem, isMatched: true, matchedExpenseId: item.matchedExpense.id, createdAt: new Date().toISOString() });
            } else {
                if (/(카드|결제|대금|삼성|현대|롯데|신한|국민|KB|하나|비씨|BC|농협)/i.test(safeItem.merchantName)) {
                    const expRef = doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`));
                    batch.set(expRef, { userId: 'SYSTEM_BANK', userName: '시스템(자동 대체)', expenseDate: safeItem.transactionDate, amount: safeItem.amount, method: '계좌이체', purpose: `[${safeItem.merchantName}] 신용카드 대금 일괄 납부`, category: '미지급금', receiptUrl: '카드사 청구서 갈음', receiptUrls: [], status: 'APPROVED', matchedTransactionId: trxDocRef.id, createdAt: new Date().toISOString() });
                    batch.set(trxDocRef, { ...safeItem, isMatched: true, matchedExpenseId: expRef.id, createdAt: new Date().toISOString() });
                } else if (item.isAutoProof && item.matchedRule) {
                    const expRef = doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`));
                    batch.set(expRef, { userId: 'SYSTEM_AUTO', userName: '시스템(자동증빙)', expenseDate: safeItem.transactionDate, amount: safeItem.amount, method: '자동이체', purpose: `[${safeItem.merchantName}] 자동 증빙 완료건`, category: item.matchedRule.cat, receiptUrl: item.matchedRule.note, receiptUrls: [], status: 'APPROVED', matchedTransactionId: trxDocRef.id, createdAt: new Date().toISOString() });
                    batch.set(trxDocRef, { ...safeItem, isMatched: true, matchedExpenseId: expRef.id, createdAt: new Date().toISOString() });
                } else {
                    batch.set(trxDocRef, { ...safeItem, isMatched: false, matchedExpenseId: null, createdAt: new Date().toISOString() });
                    missingProofCount++;
                }
            }
            addedCount++;
        }
      }
      await batch.commit(); 
      let alertMsg = `총 ${addedCount}건 장부 적재 완료!`;
      if (extractedInitialBalance !== null && uploadType === 'BANK') alertMsg += `\n✅ 월초 기초 잔액 자동 설정 완료.`;
      if (missingProofCount > 0) alertMsg += `\n⚠️ ${missingProofCount}건의 통장 출금이 증빙 누락으로 등록됨.`;
      alert(alertMsg); setIsUploadModalOpen(false); setParsedData([]);
    } catch (error) { alert("오류 발생: " + error.message); } finally { setIsMatching(false); }
  };

  const handleMonthChange = (offset) => {
    const [y, m] = selectedMonth.split('-').map(Number); let newDate = new Date(y, m - 1 + offset, 1);
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleApproval = async (id, status) => { 
      const realId = id.replace(/^(inc|exp|mis|pen)_/, '');
      await writeBatch(db).update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, realId), { status, updatedAt: new Date().toISOString() }).commit(); 
  };

  // 🚀 [신규 기능] 귀속월(예산 차감월) 보정 처리 로직
  const handleChangeExpenseDate = async (item) => {
      if (!item.id.startsWith('exp_') && !item.id.startsWith('pen_')) {
          return alert("지출 결의서가 등록된 내역만 귀속 일자를 변경할 수 있습니다.");
      }

      const newDate = window.prompt(
          `[${item.purpose}] 지출의 귀속 일자(예산 반영 기준일)를 변경합니다.\n\n은행 출금일과 상관없이, 예산이 차감되길 원하는 달의 특정 일자(YYYY-MM-DD)로 수정해 주시면 해당 월의 대시보드로 이동합니다.\n\n현재 설정된 귀속 일자:`,
          item.date
      );

      if (!newDate || newDate === item.date) return;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          return alert("날짜 형식(YYYY-MM-DD)이 올바르지 않습니다.");
      }

      try {
          await writeBatch(db).update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.realId), {
              expenseDate: newDate,
              updatedAt: new Date().toISOString()
          }).commit();
          alert("귀속 일자가 성공적으로 변경되어 예산이 이동되었습니다.");
      } catch(e) {
          alert("변경 실패: " + e.message);
      }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      <div className="flex flex-col md:flex-row justify-between items-center bg-gray-900 text-white p-6 rounded-2xl shadow-lg gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><Activity className="text-yellow-400"/> AI 재무 진단 시스템</h1>
          <p className="text-xs text-gray-400">통장 입출금 기반으로 학원의 진짜 현금 흐름을 분석합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleReverifyMissing(false)} className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-amber-900/20">
            <RefreshCcw size={18}/> 누락건 재매칭
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <Settings size={18}/> 설정
          </button>
          <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20">
            <UploadCloud size={18}/> 장부 동기화 (엑셀)
          </button>
          <button onClick={handleDownloadPerfectLedger} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20">
            <Download size={18}/> 세무 장부 다운로드
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
          {/* 상단: 주요 지표 카드 (원본 복구) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-indigo-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">실질 영업 이익 (고정비 제외)</p>
                <Activity size={16} className="text-indigo-500" />
              </div>
              <h3 className={`text-2xl font-black ${aiAnalytics.operatingProfit >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
                {formatCurrency(aiAnalytics.operatingProfit)}
              </h3>
            </div>

            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-emerald-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">BEP 달성률</p>
                <Activity size={16} className="text-emerald-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">{aiAnalytics.bepRate.toFixed(1)}%</h3>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(aiAnalytics.bepRate || 0, 100)}%` }} />
              </div>
            </div>

            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-orange-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">CAC (원생 1명당 획득비용)</p>
                <TrendingUp size={16} className="text-orange-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">{formatCurrency(aiAnalytics.cac)}</h3>
            </div>

            <div className="p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-rose-500 bg-white">
              <div className="flex justify-between items-start mb-2">
                <p className="text-gray-500 text-xs font-bold uppercase">LTV (원생 생애 가치)</p>
                <LineChart size={16} className="text-rose-500" />
              </div>
              <h3 className="text-2xl font-black text-gray-900">{formatCurrency(aiAnalytics.ltv)}</h3>
            </div>
          </div>

          {/* 🚀 [신규 추가] 카테고리별 예산 분배 및 알림 센터 */}
          <div className="bg-white border border-gray-200 p-6 sm:p-8 rounded-2xl shadow-sm mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <ShieldAlert className="text-rose-500" size={24}/> AI 예산 통제 및 리스크 관리
            </h2>

            {/* 상단: 전체 예산 신호등 */}
            <div className={`p-6 rounded-2xl border mb-8 flex items-center gap-5 sm:gap-6 ${
                aiAnalytics.budgetStatus.color === 'emerald' ? 'bg-emerald-50 border-emerald-200' : 
                (aiAnalytics.budgetStatus.color === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200')
            }`}>
                <div className={`p-4 rounded-full bg-white text-${aiAnalytics.budgetStatus.color}-500 shadow-sm shrink-0`}>
                    <aiAnalytics.budgetStatus.icon size={36} />
                </div>
                <div className="flex-1 w-full">
                    <p className={`font-black text-lg md:text-xl text-${aiAnalytics.budgetStatus.color}-700 mb-1`}>{aiAnalytics.budgetStatus.text}</p>
                    <div className="flex justify-between text-xs sm:text-sm mt-2 font-bold text-gray-600 mb-2">
                        <span>현재 총 지출: {formatCurrency(aiAnalytics.totalBudgetSpent)}</span>
                        <span>전체 예산 한도 (매출의 85%): {formatCurrency(aiAnalytics.totalBudgetAllocated)}</span>
                    </div>
                    <div className="w-full bg-white/60 h-4 rounded-full overflow-hidden border border-white/50 shadow-inner">
                        <div className={`h-full bg-${aiAnalytics.budgetStatus.color}-500 transition-all duration-1000 ease-out`} style={{ width: `${Math.min(aiAnalytics.totalBudgetUtilization, 100)}%` }} />
                    </div>
                </div>
                <div className={`hidden sm:block text-4xl font-black shrink-0 text-${aiAnalytics.budgetStatus.color}-600`}>
                    {aiAnalytics.totalBudgetUtilization.toFixed(1)}%
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
                {/* 중단: 카테고리별 소진율 프로그레스 바 */}
                <div className="lg:col-span-2 space-y-6 lg:border-r pr-0 lg:pr-8 border-gray-100">
                    <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChart size={18}/> 카테고리별 세부 소진 현황</h3>
                    <div className="space-y-5">
                        {aiAnalytics.budgetTracking.map(cat => {
                            let barColor = 'bg-emerald-500';
                            let textColor = 'text-emerald-700';
                            if (cat.utilization >= 90) { barColor = 'bg-rose-500'; textColor = 'text-rose-700'; }
                            else if (cat.utilization >= 75) { barColor = 'bg-amber-500'; textColor = 'text-amber-700'; }

                            return (
                                <div key={cat.id} className="relative">
                                    <div className="flex justify-between items-end mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-800 text-sm">{cat.name}</span>
                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">기준 {cat.ratio * 100}%</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-gray-500">{formatCurrency(cat.spent)} / {formatCurrency(cat.allocated)}</span>
                                            <span className={`text-xs font-black ${textColor} w-12 text-right`}>{cat.utilization.toFixed(0)}%</span>
                                        </div>
                                    </div>
                                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                                        <div className={`h-full ${barColor} transition-all duration-700`} style={{ width: `${Math.min(cat.utilization, 100)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 하단: 실시간 초과 알림 센터 */}
                <div className="flex flex-col">
                    <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2"><BellRing size={18} className="text-rose-500"/> 실시간 초과 알림 센터</h3>
                    {aiAnalytics.budgetAlerts.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                            <CheckCircle size={32} className="text-emerald-400 mb-2"/>
                            <span className="text-sm font-bold text-gray-500">현재 예산을 85% 이상 초과한<br/>위험 항목이 없습니다.</span>
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                            {aiAnalytics.budgetAlerts.map(alert => (
                                <div key={alert.id} className="bg-white border-2 border-rose-100 shadow-sm p-4 rounded-xl relative overflow-hidden animate-in slide-in-from-right-2">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-sm font-black text-rose-700">{alert.name}</span>
                                        <span className="text-xs font-black text-white bg-rose-500 px-2 py-0.5 rounded-full animate-pulse">{alert.utilization.toFixed(0)}% 소진</span>
                                    </div>
                                    <p className="text-xs text-gray-600 font-semibold mb-3">할당된 예산 {formatCurrency(alert.allocated)} 중<br/><span className="text-rose-600">{formatCurrency(alert.spent)}</span>을 사용했습니다.</p>
                                    <button onClick={() => setCulpritModalData(alert)} className="w-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 py-2.5 rounded-lg hover:bg-rose-600 hover:text-white transition-colors flex items-center justify-center gap-1">
                                        <Search size={14}/> 원인 지출 내역 보기
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
          </div>

          {/* 🚀 [원본 복구] 세무 예측 및 이상 지출 탐지 */}
          <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl mt-6">
            <h2 className="text-sm font-bold text-rose-800 mb-4 flex items-center gap-2"><ShieldAlert size={18}/> AI 세무 예측 및 이상 탐지</h2>
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

          {/* 🚀 [원본 복구] 수익성 분석(ROI) 차트 및 BEP 차트 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="p-6 bg-white shadow-sm border border-gray-200 rounded-2xl flex flex-col justify-between">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2"><PieChart size={20} className="text-indigo-600"/> 주요 항목별 수익성(ROI) 분석</h2>
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

          {/* 하단: 월별 통합 재무 원장 */}
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
                    <tr key={item.id} className={`border-b hover:bg-gray-50 transition-colors ${(item.type || '').includes('수입') ? 'bg-blue-50/30' : (item.status === 'ERROR' ? 'bg-rose-50/50' : '')}`}>
                      
                      {/* 🚀 [신규 기능 적용] 달력 아이콘을 통해 귀속일자 보정 가능 */}
                      <td className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{item.date}</span>
                          {(item.id.startsWith('exp_') || item.id.startsWith('pen_')) && (
                            <button 
                              onClick={() => handleChangeExpenseDate(item)}
                              className="p-1 text-blue-400 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                              title="해당 지출을 다른 월의 예산으로 이월(귀속월 변경)합니다"
                            >
                              <Calendar size={14} />
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${(item.type || '').includes('수입') ? 'bg-blue-100 text-blue-700' : ((item.type || '').includes('대금') ? 'bg-purple-100 text-purple-700' : (item.status === 'ERROR' ? 'bg-rose-100 text-rose-700' : (item.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700')))}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-indigo-700 whitespace-nowrap">{item.category}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 truncate max-w-xs">{item.purpose}</td>
                      <td className={`px-4 py-3 font-black text-right whitespace-nowrap ${(item.type || '').includes('수입') ? 'text-blue-600' : 'text-gray-900'}`}>{(item.type || '').includes('수입') ? '+' : ''}{item.amount.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-center">{item.status === 'PENDING' ? <div className="flex justify-center gap-1"><button onClick={() => handleApproval(item.id, 'APPROVED')} className="text-[10px] bg-emerald-500 text-white px-2 py-1 rounded shadow-sm hover:bg-emerald-600">승인</button><button onClick={() => handleApproval(item.id, 'REJECTED')} className="text-[10px] bg-rose-500 text-white px-2 py-1 rounded shadow-sm hover:bg-rose-600">반려</button></div> : <span className="text-gray-500 font-semibold">{item.method}</span>}</td>
                      
                      <td className="px-4 py-3 text-center">
                        {(() => {
                            const urls = item.receiptUrls?.length > 0 ? item.receiptUrls : (item.receiptUrl && String(item.receiptUrl).startsWith('data:') ? [item.receiptUrl] : []);
                            const isTextOnly = item.receiptUrl && !String(item.receiptUrl).startsWith('data:');

                            if (urls.length > 0) {
                                return (
                                    <button onClick={() => { setPreviewReceipts(urls); setPreviewIndex(0); }} className="text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 font-bold text-xs mx-auto border border-blue-200 bg-white px-2 py-1 rounded-md transition-colors hover:bg-blue-50 shadow-sm">
                                        <ImageIcon size={12}/> 조회 {urls.length > 1 ? `(${urls.length}장)` : ''}
                                    </button>
                                );
                            } else if (isTextOnly) {
                                return <span className="text-gray-400 text-[10px] font-bold">{item.receiptUrl}</span>;
                            } else {
                                return <span className="text-gray-400 text-xs font-bold">없음</span>;
                            }
                        })()}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 🚀 [신규 추가] 원인 지출 내역 보기 모달 (범인 색출용) */}
      {culpritModalData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setCulpritModalData(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center bg-rose-50">
              <div>
                  <h3 className="text-lg font-bold text-rose-900 flex items-center gap-2">
                    <Search className="text-rose-600" size={20}/> [{culpritModalData.name}] 원인 지출 내역
                  </h3>
                  <p className="text-xs text-rose-600 mt-1">해당 카테고리에서 가장 지출이 큰 순서대로 표시됩니다.</p>
              </div>
              <button onClick={() => setCulpritModalData(null)} className="p-2 hover:bg-rose-100 rounded-full transition-colors"><XCircle size={24} className="text-rose-400 hover:text-rose-700"/></button>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar bg-gray-50 flex-1">
              {culpritModalData.topExpenses.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 font-bold">승인된 지출 내역이 없습니다.</div>
              ) : (
                  <div className="space-y-3">
                      {culpritModalData.topExpenses.map((exp, idx) => (
                          <div key={exp.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                              <div className="flex items-start gap-3">
                                  <div className="bg-gray-100 text-gray-500 font-black text-sm w-8 h-8 rounded-full flex items-center justify-center shrink-0">{idx + 1}</div>
                                  <div>
                                      <p className="font-bold text-gray-900">{exp.purpose}</p>
                                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                          <span>{exp.expenseDate}</span>
                                          <span className="bg-gray-100 px-1.5 py-0.5 rounded">{exp.userName || exp.userId}</span>
                                          <span className="text-indigo-600 font-semibold">{exp.category}</span>
                                      </p>
                                  </div>
                              </div>
                              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto gap-2">
                                  <span className="text-lg font-black text-rose-600">{formatCurrency(exp.amount)}</span>
                                  {(exp.receiptUrls?.length > 0 || exp.receiptUrl) && (
                                      <button onClick={() => { 
                                          const urls = exp.receiptUrls?.length > 0 ? exp.receiptUrls : (exp.receiptUrl && String(exp.receiptUrl).startsWith('data:') ? [exp.receiptUrl] : []);
                                          if (urls.length > 0) { setPreviewReceipts(urls); setPreviewIndex(0); }
                                      }} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors flex items-center gap-1">
                                          <ImageIcon size={12}/> 영수증 확인
                                      </button>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              )}
            </div>
            <div className="p-4 border-t bg-white">
                <button onClick={() => setCulpritModalData(null)} className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-black transition-colors">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 설정 모달 */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-6 relative flex flex-col max-h-[90vh]">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4"><Settings className="text-gray-600"/> 재무 환경 설정</h3>
            <div className="overflow-y-auto custom-scrollbar flex-1 pr-2 space-y-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">월 고정 임대료 (원)</label>
                    <input type="number" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 font-bold" value={finSettings.rent} onChange={e => setFinSettings({...finSettings, rent: e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">월 평균 관리비 (원)</label>
                    <input type="number" className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 font-bold" value={finSettings.maintenance} onChange={e => setFinSettings({...finSettings, maintenance: e.target.value})} />
                </div>
                <div className="mt-4 border-t pt-4">
                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><Activity size={14}/> 자동 증빙 키워드 (개인사업자 등)</label>
                    <div className="flex gap-2 mb-3">
                        <input type="text" placeholder="키워드(예: 홍길동)" className="border p-2 rounded-lg w-1/3 text-xs" value={newKeyword.key} onChange={e => setNewKeyword({...newKeyword, key: e.target.value})} />
                        <select className="border p-2 rounded-lg w-1/3 text-xs outline-none" value={newKeyword.cat} onChange={e => setNewKeyword({...newKeyword, cat: e.target.value})}>
                            {OFFICIAL_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <button onClick={handleAddKeyword} className="bg-gray-800 text-white flex-1 rounded-lg text-xs font-bold hover:bg-black transition-colors">추가</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(finSettings.customAutoProof || []).map((k, i) => (
                            <span key={i} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold border border-indigo-100">
                                {k.key} ({k.cat}) <button onClick={() => handleRemoveKeyword(i)} className="text-rose-500 hover:text-rose-700 ml-1">x</button>
                            </span>
                        ))}
                    </div>
                </div>
                <hr className="my-2 border-gray-200" />
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
                    <h4 className="text-sm font-bold text-red-800 mb-2 flex items-center gap-1"><AlertCircle size={16}/> 엑셀 데이터 초기화</h4>
                    <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                        선택하신 <strong>[{selectedMonth}월]</strong>에 엑셀로 잘못 업로드된 내역을 모두 지우고, 영수증 결의서만 <strong>안전하게 '대기'로 복구</strong>합니다.
                    </p>
                    <button onClick={handleResetExcelData} disabled={isProcessingCleanup} className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                        {isProcessingCleanup ? <Loader size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                        {isProcessingCleanup ? '처리 중...' : `[${selectedMonth}월] 엑셀 연동 초기화`}
                    </button>
                </div>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <button onClick={() => setIsSettingsOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">닫기</button>
              <button onClick={handleSaveSettings} disabled={isProcessingCleanup} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50">저장 및 반영</button>
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
                  <button onClick={() => { setUploadType('BANK'); setParsedData([]); }} className={`flex-1 py-3 text-sm rounded-lg font-bold transition-colors ${uploadType === 'BANK' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>KB은행 통장</button>
                  <button onClick={() => { setUploadType('CARD'); setParsedData([]); }} className={`flex-1 py-3 text-sm rounded-lg font-bold transition-colors ${uploadType === 'CARD' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>법인카드 승인</button>
                </div>
                <div className="border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 rounded-2xl text-center hover:bg-blue-50 transition-colors">
                  <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} ref={fileInputRef} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 mb-3 cursor-pointer transition-colors"/>
                  <p className="text-xs text-gray-500 mt-2 font-medium">통장 엑셀 업로드 시 기초 잔액이 자동 추출되어 반영됩니다.</p>
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
                                {(d.type === 'CARD' || (d.type === 'BANK' && d.amount > 0 && !d.isCardPayment)) && (
                                    d.matchedExpense ? <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-200">✅ 결의서 병합</span> : (d.isAutoProof ? <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-200">🤖 자동 증빙</span> : <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-200">⚠️ 증빙 누락</span>)
                                )}
                              </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-black flex-shrink-0 text-right w-24 ${(d.type || '').includes('INCOME') ? 'text-blue-600' : 'text-gray-900'}`}>{d.amount.toLocaleString()}원</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleMatchAndUpload} disabled={isMatching} className="w-full mt-5 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-transform active:scale-95">
                        {isMatching ? <Loader className="animate-spin" size={20}/> : <FileSpreadsheet size={20}/>} 장부 자동 동기화 시작
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 영수증 뷰어 모달 */}
      {previewReceipts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewReceipts([])}>
          <div className="bg-white p-5 rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 px-3 border-b pb-3">
              <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                  <ImageIcon className="text-blue-600" size={24}/> 영수증 원본 확인 
                  {previewReceipts.length > 1 && <span className="text-sm font-bold text-blue-600 ml-2 bg-blue-100 px-2 py-0.5 rounded-full">({previewIndex + 1} / {previewReceipts.length})</span>}
              </h3>
              <button onClick={() => setPreviewReceipts([])} className="text-gray-500 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition-colors flex items-center gap-1 font-bold text-sm">닫기 <XCircle size={24}/></button>
            </div>
            <div className="bg-gray-100/50 rounded-2xl overflow-hidden flex justify-between items-center flex-1 w-full h-full relative p-2 border border-gray-200">
              {previewReceipts.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); setPreviewIndex(prev => Math.max(0, prev - 1)); }} disabled={previewIndex === 0} className="absolute left-2 z-10 p-2 bg-white/90 rounded-full shadow-md hover:bg-white hover:scale-110 disabled:opacity-30 transition-all">
                      <ChevronLeft size={32} className="text-gray-800"/>
                  </button>
              )}
              <div className="w-full h-full flex justify-center items-center">
                  {String(previewReceipts[previewIndex]).startsWith('data:application/pdf') || String(previewReceipts[previewIndex]).endsWith('.pdf') ? 
                    <iframe src={previewReceipts[previewIndex]} className="w-full h-full border-0 rounded-xl" title="receipt-preview" /> : 
                    <img src={previewReceipts[previewIndex]} alt="Receipt Preview" className="max-w-full max-h-full object-contain drop-shadow-sm rounded-xl" />
                  }
              </div>
              {previewReceipts.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); setPreviewIndex(prev => Math.min(previewReceipts.length - 1, prev + 1)); }} disabled={previewIndex === previewReceipts.length - 1} className="absolute right-2 z-10 p-2 bg-white/90 rounded-full shadow-md hover:bg-white hover:scale-110 disabled:opacity-30 transition-all">
                      <ChevronRight size={32} className="text-gray-800"/>
                  </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialDashboard;