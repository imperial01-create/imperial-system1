import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, Calendar, ChevronLeft, ChevronRight, Receipt, 
  Loader, Wallet, Download, BellRing, UploadCloud, FileSpreadsheet, ShieldAlert, Image as ImageIcon, CreditCard
} from 'lucide-react';
import { Modal, Button } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// 🚀 세무사 제공 엑셀 공식 계정과목 (+ 카드대금 처리용 '미지급금' 추가)
const OFFICIAL_ACCOUNTS = [
  '미분류', '직원급여', '상여금', '퇴직급여', '복리후생비', '여비교통비', '접대비', 
  '통신비', '수도광열비', '세금과공과금', '감가상각비', '지급임차료', '수선비', 
  '보험료', '차량유지비', '운반비', '도서인쇄비', '소모품비', '지급수수료', '광고선전비', '미지급금'
];

const FinancialDashboard = ({ currentUser }) => {
  if (currentUser?.role !== 'admin') {
    return <div className="p-10 text-center text-red-500 font-bold">접근 권한이 없습니다.</div>;
  }

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date(); 
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [expenses, setExpenses] = useState([]);
  const [missingReceipts, setMissingReceipts] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState('BANK'); 
  const [parsedData, setParsedData] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    setBudgets({
      '복리후생비': { name: '복리후생비 (직원 식대 등)', limit: 3000000 },
      '소모품비': { name: '소모품비 (비품/교재/간식)', limit: 2000000 },
      '접대비': { name: '접대비 (학부모/외부)', limit: 1000000 },
      '광고선전비': { name: '광고선전비 (마케팅)', limit: 2500000 },
      '지급임차료': { name: '지급임차료 (월세 등)', limit: 10000000 },
    });

    const monthStart = `${selectedMonth}-01`; 
    const monthEnd = `${selectedMonth}-31`;
    
    const expQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), where('expenseDate', '>=', monthStart), where('expenseDate', '<=', monthEnd));
    const unsubscribeExp = onSnapshot(expQuery, (snapshot) => { 
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); 
      setIsLoading(false); 
    });
    
    const trxQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'transactions'), where('transactionDate', '>=', monthStart), where('transactionDate', '<=', monthEnd), where('isMatched', '==', false));
    const unsubscribeTrx = onSnapshot(trxQuery, (snapshot) => { 
      setMissingReceipts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); 
    });

    return () => { unsubscribeExp(); unsubscribeTrx(); };
  }, [selectedMonth]);

  const dashboardStats = useMemo(() => {
    let totalApproved = 0, totalPendingAmount = 0, pendingCount = 0;
    const categoryUsage = {};
    const anomalies = [];

    expenses.forEach(exp => {
      if (exp.status === 'APPROVED') {
        // 🚀 [CTO 회계 로직] '미지급금(카드대금)'은 이중 지출(Double Counting) 방지를 위해 총 지출액 및 예산에서 제외!
        if (exp.category !== '미지급금') {
          totalApproved += exp.amount;
          if (!categoryUsage[exp.category]) categoryUsage[exp.category] = 0;
          categoryUsage[exp.category] += exp.amount;
          
          if (exp.amount >= 500000 && exp.userId !== 'SYSTEM_HOMETAX') {
            anomalies.push(exp);
          }
        }
      } else if (exp.status === 'PENDING') {
        totalPendingAmount += exp.amount; 
        pendingCount += 1;
      }
    });
    return { totalApproved, totalPendingAmount, pendingCount, categoryUsage, anomalies };
  }, [expenses]);

  const guessCategoryFromHometax = (merchant, purpose) => {
    const text = `${merchant} ${purpose}`.replace(/\s/g, '');
    if (text.includes('청소') || text.includes('기장') || text.includes('수수료') || text.includes('방역')) return '지급수수료';
    if (text.includes('임대') || text.includes('월세')) return '지급임차료';
    if (text.includes('인쇄') || text.includes('복사') || text.includes('토너') || text.includes('제본')) return '도서인쇄비';
    if (text.includes('광고') || text.includes('블로그') || text.includes('마케팅')) return '광고선전비';
    if (text.includes('수리') || text.includes('인테리어') || text.includes('에어컨')) return '수선비';
    if (text.includes('전기') || text.includes('수도') || text.includes('가스')) return '수도광열비';
    if (text.includes('통신') || text.includes('전화') || text.includes('인터넷')) return '통신비';
    return '미분류';
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; 
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result; 
      const workbook = XLSX.read(bstr, { type: 'binary' });
      const ws = workbook.Sheets[workbook.SheetNames[0]]; 
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const extracted = [];

      try {
        if (uploadType === 'BANK') {
          const headerIdx = data.findIndex(row => row && row.includes('거래일시'));
          if (headerIdx === -1) throw new Error("통장 양식이 아닙니다.");
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || !data[i][data[headerIdx].indexOf('출금액(원)')]) continue;
            const amount = Number(String(data[i][data[headerIdx].indexOf('출금액(원)')]).replace(/,/g, ''));
            if (amount > 0) {
              const merchantName = data[i][data[headerIdx].indexOf('보낸분/받는분')] || '알수없음';
              // 🚀 [신규 엔진] 카드 대금 출금 여부 강력 식별 (대표님 엑셀 양식의 '롯데카드', '현870...', '우601...' 등 캐치)
              const isCardPayment = /(카드|결제|삼성|롯데|신한|국민|KB|현대|하나|비씨|BC|NH|농협|현\d|우\d|삼\d|롯\d)/i.test(merchantName);
              
              extracted.push({ 
                transactionDate: data[i][data[headerIdx].indexOf('거래일시')].split(' ')[0].replace(/\./g, '-'), 
                amount, 
                merchantName, 
                type: 'BANK', 
                rawId: `${amount}_${i}`,
                isCardPayment 
              });
            }
          }
        } 
        else if (uploadType === 'CARD') {
          const headerIdx = data.findIndex(row => row && row.includes('승인일'));
          if (headerIdx === -1) throw new Error("카드 양식이 아닙니다.");
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || data[i][data[headerIdx].indexOf('상태')] !== '정상') continue;
            const amount = Number(String(data[i][data[headerIdx].indexOf('승인금액')]).replace(/,/g, ''));
            if (amount > 0) {
              extracted.push({ 
                transactionDate: String(data[i][data[headerIdx].indexOf('승인일')]).replace(/\./g, '-'), 
                amount, 
                merchantName: data[i][data[headerIdx].indexOf('가맹점명')] || '알수없음', 
                type: 'CARD', 
                rawId: `${amount}_${i}` 
              });
            }
          }
        } 
        else if (uploadType === 'HOMETAX') {
          const headerIdx = data.findIndex(row => row && row.includes('승인번호'));
          if (headerIdx === -1) throw new Error("홈택스 양식이 아닙니다.");
          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || !data[i][data[headerIdx].indexOf('승인번호')]) continue;
            const amount = Number(String(data[i][data[headerIdx].indexOf('합계금액')]).replace(/,/g, ''));
            if (amount > 0) {
              const merchant = data[i][data[headerIdx].indexOf('상호')] || '알수없음';
              const purposeStr = data[i][data[headerIdx].indexOf('품목명')] || '전자세금계산서 매입';
              const guessedCategory = guessCategoryFromHometax(merchant, purposeStr);
              extracted.push({ 
                transactionDate: String(data[i][data[headerIdx].indexOf('작성일자')]).replace(/\./g, '-'), 
                amount, 
                merchantName: merchant, 
                purpose: purposeStr, 
                type: 'HOMETAX', 
                rawId: String(data[i][data[headerIdx].indexOf('승인번호')]), 
                category: guessedCategory 
              });
            }
          }
        }
        setParsedData(extracted);
      } catch (err) { alert("엑셀 변환 오류: " + err.message); }
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
      let matchCount = 0, missingCount = 0, createdCount = 0, cardPayCount = 0;

      if (uploadType === 'HOMETAX') {
        for (const item of parsedData) {
          const finalCategory = item.category === '미분류' ? '지급수수료' : item.category;
          const expRef = doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.rawId);
          batch.set(expRef, {
            userId: 'SYSTEM_HOMETAX', userName: '전자세금계산서', expenseDate: item.transactionDate, amount: item.amount, method: '계좌이체',
            purpose: `[${item.merchantName}] ${item.purpose}`, category: finalCategory, receiptUrl: '홈택스 증빙 완료', status: 'APPROVED', matchedTransactionId: null, createdAt: new Date().toISOString()
          }, { merge: true });
          createdCount++;
        }
        await batch.commit(); 
        alert(`✅ 홈택스 ${createdCount}건이 선택된 계정과목으로 적재되었습니다.`);
      } else {
        const unmatchedExpenses = expenses.filter(e => !e.matchedTransactionId);
        const expenseMap = new Map();
        unmatchedExpenses.forEach(exp => { 
          const key = `${exp.expenseDate}_${exp.amount}`; 
          if (!expenseMap.has(key)) expenseMap.set(key, []); 
          expenseMap.get(key).push(exp); 
        });

        for (const trx of parsedData) {
          const trxDocRef = doc(collection(db, `artifacts/${APP_ID}/public/data/transactions`));
          
          // 🚀 [핵심 엔진] 카드 대금 출금 건일 경우, 영수증을 찾지 않고 즉시 [미지급금] 카테고리로 승인 처리
          if (trx.isCardPayment) {
            const expRef = doc(collection(db, `artifacts/${APP_ID}/public/data/expenses`));
            batch.set(expRef, {
              userId: 'SYSTEM_BANK', userName: '시스템(자동 대체)', expenseDate: trx.transactionDate, amount: trx.amount, method: '계좌이체',
              purpose: `[${trx.merchantName}] 신용카드 대금 출금`, category: '미지급금', receiptUrl: '카드사 청구서로 갈음', status: 'APPROVED', matchedTransactionId: trxDocRef.id, createdAt: new Date().toISOString()
            });
            batch.set(trxDocRef, { ...trx, isMatched: true, matchedExpenseId: expRef.id, createdAt: new Date().toISOString() });
            cardPayCount++;
          } 
          // 일반 결제/이체 건일 경우 기존 매칭 진행
          else {
            const matchCandidates = expenseMap.get(`${trx.transactionDate}_${trx.amount}`);
            if (matchCandidates && matchCandidates.length > 0) {
              const matchedExpense = matchCandidates.shift();
              batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, matchedExpense.id), { status: 'APPROVED', matchedTransactionId: trxDocRef.id, updatedAt: new Date().toISOString() });
              batch.set(trxDocRef, { ...trx, isMatched: true, matchedExpenseId: matchedExpense.id, createdAt: new Date().toISOString() });
              matchCount++;
            } else {
              batch.set(trxDocRef, { ...trx, isMatched: false, matchedExpenseId: null, createdAt: new Date().toISOString() });
              missingCount++;
            }
          }
        }
        await batch.commit(); 
        let alertMsg = `✅ 일반 지출 자동 매칭: ${matchCount}건\n`;
        if (cardPayCount > 0) alertMsg += `💳 카드 대금 외상 결제 처리: ${cardPayCount}건\n`;
        alertMsg += `❌ 증빙 누락: ${missingCount}건`;
        alert(alertMsg);
      }
      setIsUploadModalOpen(false); 
      setParsedData([]); 
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) { alert("매칭 오류: " + error.message); } 
    finally { setIsMatching(false); }
  };

  const handleDownloadPerfectLedger = () => {
    const approvedData = expenses.filter(exp => exp.status === 'APPROVED').map(exp => ({
      '거래일자': exp.expenseDate, 
      '계정과목': exp.category || '미분류', 
      '적요(지출목적)': exp.purpose, 
      '출금금액': exp.amount,
      '결제수단': exp.method, 
      '증빙유형': exp.category === '미지급금' ? '카드사 청구서' : (exp.userId === 'SYSTEM_HOMETAX' ? '세금계산서' : (exp.receiptUrl ? '영수증/카드' : '증빙없음')), 
      '담당자': exp.userName, 
      '매칭상태': exp.matchedTransactionId ? '통장/카드 대조완료' : '금융내역 미확인'
    }));
    
    const missingData = missingReceipts.map(miss => ({
      '거래일자': miss.transactionDate, 
      '계정과목': '미확인(위험)', 
      '적요(지출목적)': `[증빙누락] ${miss.merchantName}`, 
      '출금금액': miss.amount,
      '결제수단': miss.type === 'BANK' ? '계좌출금' : '법인카드', 
      '증빙유형': '증빙누락', 
      '담당자': '확인요망', 
      '매칭상태': '지출결의서 없음'
    }));
    
    const combinedData = [...approvedData, ...missingData].sort((a, b) => new Date(a.거래일자) - new Date(b.거래일자));
    if (combinedData.length === 0) return alert("데이터가 없습니다.");
    
    const ws = XLSX.utils.json_to_sheet(combinedData); 
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "종합재무원장");
    XLSX.writeFile(wb, `임페리얼_세무소명용_장부_${selectedMonth}.xlsx`);
  };

  const handleMonthChange = (offset) => {
    const [yearStr, monthStr] = selectedMonth.split('-'); 
    let year = parseInt(yearStr, 10); 
    let month = parseInt(monthStr, 10) + offset;
    if (month > 12) { month = 1; year += 1; } 
    else if (month < 1) { month = 12; year -= 1; }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);

  const handleApproval = async (expenseId, newStatus) => { 
    try { 
      await writeBatch(db).update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, expenseId), { 
        status: newStatus, 
        updatedAt: new Date().toISOString() 
      }).commit(); 
    } catch(err) { alert("상태 변경 오류"); } 
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
      {/* 1. 상단 컨트롤 패널 */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-gray-900 text-white p-6 rounded-2xl shadow-lg gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><PieChart/> 실시간 재무 DB 타워</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <UploadCloud size={18}/> 엑셀 일괄 업로드
          </button>
          <button onClick={handleDownloadPerfectLedger} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(16,185,129,0.4)]">
            <Download size={18}/> 세무사 제출용 장부 (Excel)
          </button>
          <div className="flex items-center gap-2 bg-white/10 px-4 rounded-xl ml-2">
            <button onClick={() => handleMonthChange(-1)} className="p-2"><ChevronLeft/></button>
            <span className="font-bold">{selectedMonth}</span>
            <button onClick={() => handleMonthChange(1)} className="p-2"><ChevronRight/></button>
          </div>
        </div>
      </div>

      {isLoading ? <Loader className="animate-spin text-blue-600 mx-auto mt-20" size={48}/> : (
        <>
          {/* 2. 세무 리스크 및 예산 감지 */}
          <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><ShieldAlert size={100} /></div>
            <h2 className="text-lg font-bold text-rose-800 mb-4 flex items-center gap-2 border-b border-rose-200 pb-2 relative z-10">
              <ShieldAlert size={24} /> 세무 리스크 및 예산 감지
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
              <div>
                <h3 className="text-sm font-bold text-rose-700 mb-3 flex items-center gap-1"><AlertCircle size={16}/> 50만 원 이상 고액 지출 (주의내역)</h3>
                {dashboardStats.anomalies.length === 0 ? (
                  <p className="text-sm text-emerald-600 font-bold bg-white p-3 rounded-xl border border-emerald-100 flex items-center gap-2"><CheckCircle size={16}/> 특이사항 없음</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {dashboardStats.anomalies.map(ano => (
                      <li key={ano.id} className="text-sm bg-white p-3 rounded-xl border border-rose-100 flex justify-between items-center shadow-sm">
                        <span className="font-bold text-gray-800 truncate">{ano.purpose}</span>
                        <span className="font-black text-rose-600">{formatCurrency(ano.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-700 mb-3 flex items-center gap-1"><TrendingUp size={16}/> 세무 계정과목별 예산 초과 위험 (90% 이상)</h3>
                <ul className="space-y-2">
                  {Object.keys(budgets).map(cat => {
                    const percent = ((dashboardStats.categoryUsage[cat] || 0) / budgets[cat].limit) * 100;
                    if (percent >= 90) return (
                      <li key={cat} className="text-sm bg-white p-3 rounded-xl border border-rose-100 flex flex-col gap-2 shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-800">{budgets[cat].name}</span>
                          <span className="text-rose-600 font-black">{percent.toFixed(1)}% 소진</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${percent}%` }}></div>
                        </div>
                      </li>
                    );
                    return null;
                  })}
                  {Object.keys(budgets).every(cat => ((dashboardStats.categoryUsage[cat] || 0) / budgets[cat].limit) * 100 < 90) && (
                    <p className="text-sm text-emerald-600 font-bold bg-white p-3 rounded-xl border border-emerald-100 flex items-center gap-2"><CheckCircle size={16}/> 모든 계정과목이 예산 내 통제 중입니다.</p>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* 3. KPI 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-gray-500 font-bold mb-2 flex items-center gap-2"><Wallet size={18}/> 총 지출 (카드대금 제외)</p>
              <span className="text-3xl font-black text-gray-900">{formatCurrency(dashboardStats.totalApproved)}</span>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <p className="text-gray-500 font-bold mb-2 flex items-center gap-2"><Receipt size={18}/> 결재 대기</p>
              <span className="text-3xl font-black text-amber-600">{formatCurrency(dashboardStats.totalPendingAmount)}</span>
            </div>
            <div className="bg-rose-50 p-6 rounded-2xl shadow-sm border border-rose-100">
              <p className="text-rose-700 font-bold mb-2 flex items-center gap-2"><BellRing size={18}/> 영수증 미제출</p>
              <span className="text-3xl font-black text-rose-700">{missingReceipts.length}건</span>
            </div>
          </div>
          
          {/* 4. 증빙 누락건 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2 border-b pb-3">
              <BellRing className="text-rose-500" size={20} /> 증빙 누락건 (스크래핑 ↔ 영수증 미스매치)
            </h2>
            {missingReceipts.length === 0 ? (
               <p className="text-emerald-600 font-bold text-center py-6">모든 금융 내역에 영수증/세금계산서가 완벽히 증빙되었습니다.</p> 
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {missingReceipts.map(miss => (
                  <div key={miss.id} className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex justify-between items-center shadow-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-bold text-gray-900">{miss.merchantName} <span className="text-white bg-rose-500 px-2 py-0.5 rounded-full text-[10px] ml-1">증빙 없음</span></span>
                      <span className="text-xs text-gray-500 font-semibold">{miss.type} | {miss.transactionDate}</span>
                    </div>
                    <span className="font-black text-rose-700 text-lg">{formatCurrency(miss.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. 지출결의 결재 대기 리스트 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2 border-b pb-3">
              <Receipt className="text-amber-500" size={20} /> 지출결의 결재 대기 ({dashboardStats.pendingCount}건)
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              {expenses.filter(e => e.status === 'PENDING').length === 0 ? (
                <p className="text-gray-400 font-bold text-center py-6">결재 대기 중인 문서가 없습니다.</p>
              ) : (
                expenses.filter(e => e.status === 'PENDING').map(exp => (
                  <div key={exp.id} className="flex flex-col md:flex-row justify-between md:items-center p-4 border border-amber-200 rounded-xl bg-amber-50/50 gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-md">{exp.userName}</span>
                        <span className="text-xs font-bold text-indigo-600 border border-indigo-200 px-2 py-1 rounded-md bg-white">{exp.category}</span>
                        <span className="text-xs text-gray-500">{exp.expenseDate}</span>
                      </div>
                      <strong className="text-base text-gray-900 mt-1">{exp.purpose}</strong>
                      
                      {exp.receiptUrl && exp.receiptUrl !== '홈택스 증빙 완료' && exp.receiptUrl !== '카드사 청구서 갈음' && (
                        <button 
                          onClick={() => setPreviewUrl(exp.receiptUrl)} 
                          className="text-sm text-blue-700 hover:text-blue-900 flex items-center gap-1 mt-2 font-bold w-fit bg-blue-100 px-3 py-1.5 rounded-lg transition-colors border border-blue-200 shadow-sm"
                        >
                          <ImageIcon size={16} /> 영수증 이미지 확인
                        </button>
                      )}
                    </div>
                    <div className="flex gap-4 items-center justify-between md:justify-end border-t md:border-none pt-3 md:pt-0 border-amber-100">
                      <span className="text-xl font-black text-gray-900">{formatCurrency(exp.amount)}</span>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproval(exp.id, 'APPROVED')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors">승인</button>
                        <button onClick={() => handleApproval(exp.id, 'REJECTED')} className="bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors">반려</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* 🚀 엑셀 업로드 모달 */}
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
                  <p className="text-xs text-gray-500 font-medium">
                    {uploadType === 'HOMETAX' ? "국세청 홈택스의 '매입전자세금계산서' 엑셀을 올려주세요." : "해당 금융사의 표준 엑셀 다운로드 양식을 업로드해주세요."}
                  </p>
                </div>

                {parsedData.length > 0 && (
                  <div className="mt-4 animate-in slide-in-from-bottom-2">
                    <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center justify-between">
                      <span>분석된 내역 미리보기</span>
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs">{parsedData.length}건 확인됨</span>
                    </h4>
                    <div className="max-h-80 overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm space-y-3 custom-scrollbar">
                      {parsedData.map((d, i) => (
                        <div key={i} className="flex flex-col md:flex-row justify-between md:items-center border-b border-gray-200 pb-3 last:border-0 last:pb-0 gap-3">
                          <div className="flex flex-col">
                            <span className="text-gray-800 font-bold flex items-center gap-2">
                              <span className="truncate max-w-[150px] md:max-w-[200px]">{d.merchantName}</span> 
                              <span className="text-gray-500 font-normal text-xs">({d.transactionDate})</span>
                              {/* 🚀 카드 대금일 경우 뱃지 부착 */}
                              {d.isCardPayment && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold ml-1 flex items-center gap-1"><CreditCard size={12}/> 카드대금 출금</span>}
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
                      {uploadType === 'HOMETAX' ? '세금계산서 장부 강제 적재 (계정 적용)' : '지출결의서 장부 자동 매칭 및 동기화'}
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
              <button onClick={() => setPreviewUrl(null)} className="text-gray-500 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition-colors flex items-center gap-1 font-bold text-sm">
                닫기 <XCircle size={24}/>
              </button>
            </div>
            <div className="bg-gray-100/50 rounded-2xl flex justify-center items-center flex-1 w-full h-full relative p-2 border border-gray-200">
              {previewUrl.startsWith('data:application/pdf') || previewUrl.endsWith('.pdf') ? (
                <iframe src={previewUrl} className="w-full h-full border-0 rounded-xl" title="receipt-preview" />
              ) : (
                <img src={previewUrl} alt="Receipt Preview" className="w-full h-full object-contain drop-shadow-sm rounded-xl" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialDashboard;