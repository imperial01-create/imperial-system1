import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, ChevronLeft, ChevronRight, Receipt, Loader, 
  Wallet, Download, BellRing, UploadCloud, FileSpreadsheet, 
  ShieldAlert, Image as ImageIcon, Search, Database
} from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

const OFFICIAL_ACCOUNTS = [
  '미분류', '직원급여', '상여금', '퇴직급여', '복리후생비', '여비교통비', '접대비', 
  '통신비', '수도광열비', '세금과공과금', '감가상각비', '지급임차료', '수선비', 
  '보험료', '차량유지비', '운반비', '도서인쇄비', '소모품비', '지급수수료', '광고선전비', '미지급금'
];

const CHART_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-blue-500', 'bg-purple-500'];

const FinancialDashboard = ({ currentUser }) => {
  if (currentUser?.role !== 'admin') return <div className="p-10 text-center text-red-500 font-bold">접근 권한이 없습니다.</div>;

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]); 
  const [missingReceipts, setMissingReceipts] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [isLoading, setIsLoading] = useState(true); // 🚀 초기 진입 시 바로 로딩 시작
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState('BANK'); 
  const [parsedData, setParsedData] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 🚀 데이터 구독 엔진 (메뉴 진입 시 자동 동기화)
  useEffect(() => {
    setIsLoading(true);
    setBudgets({
      '복리후생비': { name: '복리후생비', limit: 3000000 },
      '소모품비': { name: '소모품비', limit: 2000000 },
      '접대비': { name: '접대비', limit: 1000000 },
      '광고선전비': { name: '광고선전비', limit: 2500000 },
      '지급임차료': { name: '지급임차료', limit: 10000000 },
    });
    
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

  const dashboardStats = useMemo(() => {
    let totalApproved = 0, totalPendingAmount = 0, pendingCount = 0;
    const categoryUsage = {};
    const anomalies = [];
    expenses.forEach(exp => {
      if (exp.status === 'APPROVED' && exp.category !== '미지급금') {
        totalApproved += exp.amount;
        categoryUsage[exp.category] = (categoryUsage[exp.category] || 0) + exp.amount;
        if (exp.amount >= 500000 && exp.userId !== 'SYSTEM_HOMETAX') anomalies.push(exp);
      } else if (exp.status === 'PENDING') {
        totalPendingAmount += exp.amount; pendingCount += 1;
      }
    });
    const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
    const netIncome = totalIncome - totalApproved;
    const categoryChartData = Object.keys(categoryUsage).map(key => ({ name: key, amount: categoryUsage[key], percent: totalApproved > 0 ? (categoryUsage[key] / totalApproved) * 100 : 0 })).sort((a, b) => b.amount - a.amount);
    return { totalApproved, totalPendingAmount, pendingCount, categoryUsage, anomalies, totalIncome, netIncome, categoryChartData };
  }, [expenses, incomes]);

  const integratedLedger = useMemo(() => {
    const list = [
      ...incomes.map(i => ({ id: i.id, date: i.transactionDate, type: '수입', category: '사업소득', purpose: i.source, amount: i.amount, method: '계좌입금', status: 'COMPLETED' })),
      ...expenses.filter(e => e.status === 'APPROVED').map(e => ({ id: e.id, date: e.expenseDate, type: '지출(정상)', category: e.category, purpose: e.purpose, amount: e.amount, method: e.method, receiptUrl: e.receiptUrl, status: 'COMPLETED' })),
      ...missingReceipts.map(m => ({ id: m.id, date: m.transactionDate, type: '지출(누락)', category: '미확인', purpose: m.merchantName, amount: m.amount, method: m.type, status: 'ERROR' })),
      ...expenses.filter(e => e.status === 'PENDING').map(e => ({ id: e.id, date: e.expenseDate, type: '지출(대기)', category: e.category, purpose: e.purpose, amount: e.amount, method: e.method, receiptUrl: e.receiptUrl, status: 'PENDING' }))
    ];
    return list.filter(item => item.purpose.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, incomes, missingReceipts, searchTerm]);

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
            const outAmount = Number(String(data[i][outIdx] || 0).replace(/,/g, ''));
            if (outAmount > 0) {
              const merchantName = data[i][nameIdx] || '알수없음';
              const isCardPayment = /(카드|결제|삼성|롯데|신한|국민|KB|현대|하나|비씨|BC|NH|농협)/i.test(merchantName);
              extracted.push({ transactionDate: data[i][dateIdx].split(' ')[0].replace(/\./g, '-'), amount: outAmount, merchantName, type: 'BANK', rawId: `OUT_${outAmount}_${i}`, isCardPayment });
            }
            const inAmount = Number(String(data[i][inIdx] || 0).replace(/,/g, ''));
            if (inAmount > 0) extracted.push({ transactionDate: data[i][dateIdx].split(' ')[0].replace(/\./g, '-'), amount: inAmount, merchantName: data[i][nameIdx] || '알수없음', type: 'BANK_INCOME', rawId: `IN_${inAmount}_${i}` });
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
      } catch (err) { alert("엑셀 변환 오류"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleMatchAndUpload = async () => {
    if (parsedData.length === 0) return;
    setIsMatching(true);
    try {
      const batch = writeBatch(db); let mCount = 0, iCount = 0, cCount = 0, misCount = 0;
      if (uploadType === 'HOMETAX') {
        for (const item of parsedData) {
          const expRef = doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.rawId);
          batch.set(expRef, { userId: 'SYSTEM_HOMETAX', userName: '전자세금계산서', expenseDate: item.transactionDate, amount: item.amount, method: '계좌이체', purpose: `[${item.merchantName}] ${item.purpose}`, category: item.category === '미분류' ? '지급수수료' : item.category, receiptUrl: '홈택스 증빙 완료', status: 'APPROVED', matchedTransactionId: null, createdAt: new Date().toISOString() }, { merge: true });
          mCount++;
        }
      } else {
        const unmatched = expenses.filter(e => !e.matchedTransactionId);
        const expMap = new Map(); unmatched.forEach(e => { const k = `${e.expenseDate}_${e.amount}`; if(!expMap.has(k)) expMap.set(k, []); expMap.get(k).push(e); });
        for (const trx of parsedData) {
          if (trx.type === 'BANK_INCOME') {
            const incRef = doc(collection(db, `artifacts/${APP_ID}/public/data/incomes`));
            batch.set(incRef, { transactionDate: trx.transactionDate, amount: trx.amount, source: trx.merchantName, createdAt: new Date().toISOString() });
            iCount++; continue;
          }
          const trxDocRef = doc(collection(db, `artifacts/${APP_ID}/public/data/transactions`));
          if (trx.isCardPayment) {
            const expRef = doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`));
            batch.set(expRef, { userId: 'SYSTEM_BANK', userName: '시스템(자동 대체)', expenseDate: trx.transactionDate, amount: trx.amount, method: '계좌이체', purpose: `[${trx.merchantName}] 카드대금 결제`, category: '미지급금', receiptUrl: '카드사 청구서 갈음', status: 'APPROVED', matchedTransactionId: trxDocRef.id, createdAt: new Date().toISOString() });
            batch.set(trxDocRef, { ...trx, isMatched: true, matchedExpenseId: expRef.id, createdAt: new Date().toISOString() });
            cCount++;
          } else {
            const matchCandidates = expMap.get(`${trx.transactionDate}_${trx.amount}`);
            if (matchCandidates && matchCandidates.length > 0) {
              const matched = matchCandidates.shift();
              batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, matched.id), { status: 'APPROVED', matchedTransactionId: trxDocRef.id, updatedAt: new Date().toISOString() });
              batch.set(trxDocRef, { ...trx, isMatched: true, matchedExpenseId: matched.id, createdAt: new Date().toISOString() });
              mCount++;
            } else {
              batch.set(trxDocRef, { ...trx, isMatched: false, matchedExpenseId: null, createdAt: new Date().toISOString() });
              misCount++;
            }
          }
        }
      }
      await batch.commit(); alert("적재 완료!"); setIsUploadModalOpen(false); setParsedData([]);
    } catch (error) { alert("오류 발생"); } finally { setIsMatching(false); }
  };

  const handleMonthChange = (offset) => {
    const [y, m] = selectedMonth.split('-').map(Number); let newDate = new Date(y, m - 1 + offset, 1);
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);
  const handleApproval = async (id, status) => { await writeBatch(db).update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, id), { status, updatedAt: new Date().toISOString() }).commit(); };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      {/* 상단 컨트롤 패널 */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-gray-900 text-white p-6 rounded-2xl shadow-lg gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><PieChart/> 전사적 자원 관리 (ERP)</h1>
          <p className="text-xs text-gray-400">학원의 전체 재무 및 지출 현황을 실시간으로 동기화합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <UploadCloud size={18}/> 엑셀 일괄 업로드
          </button>
          <button onClick={handleDownloadPerfectLedger} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/20">
            <Download size={18}/> 세무사 제출용 장부 (Excel)
          </button>
          <div className="flex items-center gap-2 bg-white/10 px-4 rounded-xl ml-2">
            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><ChevronLeft/></button>
            <span className="font-bold tracking-widest">{selectedMonth.replace('-', '년 ')}월</span>
            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><ChevronRight/></button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-32 flex-col gap-4">
            <Loader className="animate-spin text-blue-600" size={48}/>
            <p className="text-gray-500 font-bold">재무 데이터를 불러오는 중입니다...</p>
        </div>
      ) : (
        <>
          {/* 상단 경영 지표 (KPI) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-gradient-to-br from-indigo-500 to-blue-600 text-white p-6 rounded-2xl shadow-lg border border-indigo-400">
              <p className="text-indigo-100 font-bold mb-2 flex items-center gap-2"><TrendingUp size={18}/> 이번 달 총 수입</p>
              <span className="text-3xl font-black">{formatCurrency(dashboardStats.totalIncome)}</span>
            </div>
            <div className="bg-gradient-to-br from-rose-500 to-orange-500 text-white p-6 rounded-2xl shadow-lg border border-rose-400">
              <p className="text-rose-100 font-bold mb-2 flex items-center gap-2"><Wallet size={18}/> 총 지출 (실제 비용)</p>
              <span className="text-3xl font-black">{formatCurrency(dashboardStats.totalApproved)}</span>
            </div>
            <div className={`p-6 rounded-2xl shadow-lg border ${dashboardStats.netIncome >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400 text-white' : 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 text-white'}`}>
              <p className="opacity-80 font-bold mb-2 flex items-center gap-2"><DollarSign size={18}/> 순이익 (Net Income)</p>
              <span className="text-3xl font-black">{formatCurrency(dashboardStats.netIncome)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChart className="text-blue-600"/> 계정과목별 지출 점유율</h2>
              {dashboardStats.totalApproved === 0 ? <p className="text-sm text-gray-400">내역 없음</p> : (
                <div className="space-y-5 mt-6">
                  <div className="w-full h-6 rounded-full flex overflow-hidden shadow-inner">
                    {dashboardStats.categoryChartData.map((data, idx) => (
                      <div key={data.name} style={{ width: `${data.percent}%` }} className={`${CHART_COLORS[idx % CHART_COLORS.length]} h-full transition-all hover:opacity-80 cursor-help`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {dashboardStats.categoryChartData.map((data, idx) => (
                      <div key={data.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${CHART_COLORS[idx % CHART_COLORS.length]}`}></span>
                          <span className="font-bold text-gray-700">{data.name}</span>
                        </div>
                        <span className="text-gray-500 font-bold">{data.percent.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl shadow-sm">
              <h2 className="text-lg font-bold text-rose-800 mb-4 flex items-center gap-2 border-b border-rose-200 pb-2"><ShieldAlert size={20} /> 세무 리스크 및 예산 감지</h2>
              <div className="space-y-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {missingReceipts.length > 0 && <div className="text-sm bg-white p-3 rounded-xl border border-rose-100 flex justify-between items-center"><span className="font-bold text-rose-700 flex items-center gap-2"><BellRing size={16}/> 증빙 누락 건수 존재</span><span className="bg-rose-100 text-rose-800 px-2 py-1 rounded font-black">{missingReceipts.length}건</span></div>}
                {dashboardStats.anomalies.map(ano => <div key={ano.id} className="text-sm bg-white p-3 rounded-xl border border-rose-100 flex justify-between items-center"><span className="font-bold text-gray-800 truncate flex items-center gap-2"><AlertCircle size={16} className="text-amber-500"/> {ano.purpose}</span><span className="font-black text-rose-600">{formatCurrency(ano.amount)}</span></div>)}
                {dashboardStats.anomalies.length === 0 && missingReceipts.length === 0 && <p className="text-sm text-emerald-600 font-bold bg-white p-3 rounded-xl border border-emerald-100 flex items-center gap-2"><CheckCircle size={16}/> 이상 없음</p>}
              </div>
            </div>
          </div>

          {/* 월별 통합 재무 원장 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]">
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
                    <tr key={item.id} className={`border-b hover:bg-gray-50 transition-colors ${item.type === '수입' ? 'bg-blue-50/30' : (item.status === 'ERROR' ? 'bg-rose-50/50' : '')}`}>
                      <td className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{item.date}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-[10px] font-bold ${item.type === '수입' ? 'bg-blue-100 text-blue-700' : (item.status === 'ERROR' ? 'bg-rose-100 text-rose-700' : (item.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'))}`}>{item.type}</span></td>
                      <td className="px-4 py-3 font-bold text-indigo-700 whitespace-nowrap">{item.category}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 truncate max-w-xs">{item.purpose}</td>
                      <td className={`px-4 py-3 font-black text-right whitespace-nowrap ${item.type === '수입' ? 'text-blue-600' : 'text-gray-900'}`}>{item.type === '수입' ? '+' : ''}{item.amount.toLocaleString()}원</td>
                      <td className="px-4 py-3 text-center">{item.status === 'PENDING' ? <div className="flex justify-center gap-1"><button onClick={() => handleApproval(item.id, 'APPROVED')} className="text-[10px] bg-emerald-500 text-white px-2 py-1 rounded shadow-sm hover:bg-emerald-600">승인</button><button onClick={() => handleApproval(item.id, 'REJECTED')} className="text-[10px] bg-rose-500 text-white px-2 py-1 rounded shadow-sm hover:bg-rose-600">반려</button></div> : <span className="text-gray-500 font-semibold">{item.method}</span>}</td>
                      <td className="px-4 py-3 text-center">{item.receiptUrl && !item.receiptUrl.includes('증빙') && !item.receiptUrl.includes('갈음') ? <button onClick={() => setPreviewUrl(item.receiptUrl)} className="text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 font-bold text-xs mx-auto border border-blue-200 bg-white px-2 py-1 rounded-md transition-colors hover:bg-blue-50 shadow-sm"><ImageIcon size={12}/> 조회</button> : <span className="text-gray-400 text-xs">{item.receiptUrl || '없음'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
                  <button onClick={() => { setUploadType('HOMETAX'); setParsedData([]); }} className={`flex-1 py-3 text-sm rounded-lg font-bold transition-colors ${uploadType === 'HOMETAX' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}>홈택스 매입건</button>
                </div>
                <div className="border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 rounded-2xl text-center hover:bg-blue-50 transition-colors">
                  <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} ref={fileInputRef} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 mb-3 cursor-pointer transition-colors"/>
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
                            <span className="font-black text-blue-600 flex-shrink-0 text-right w-24">{d.amount.toLocaleString()}원</span>
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
                        {uploadType === 'HOMETAX' ? '세금계산서 장부 강제 적재 (계정 적용)' : '장부 자동 동기화 시작'}
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