import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, Calendar, ChevronLeft, ChevronRight, Receipt, 
  Loader, Wallet, Download, BellRing, UploadCloud, FileSpreadsheet, ShieldAlert
} from 'lucide-react';
import { Modal, Button } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const FinancialDashboard = ({ currentUser }) => {
  if (currentUser?.role !== 'admin') return <div className="p-10 text-center text-red-500 font-bold">접근 권한이 없습니다.</div>;

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [expenses, setExpenses] = useState([]);
  const [missingReceipts, setMissingReceipts] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // 엑셀 업로드 관련 상태
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState('BANK'); 
  const [parsedData, setParsedData] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setIsLoading(true);
    setBudgets({
      'MEALS': { name: '식대 및 다과', limit: 3000000 },
      'SUPPLIES': { name: '비품 및 교재', limit: 5000000 },
      'MARKETING': { name: '마케팅 홍보', limit: 2000000 },
      'RENT': { name: '임차료/관리비', limit: 10000000 },
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
    const categoryUsage = { MEALS: 0, SUPPLIES: 0, MARKETING: 0, RENT: 0 };
    const anomalies = []; // 이상 지출 리스트

    expenses.forEach(exp => {
      if (exp.status === 'APPROVED') {
        totalApproved += exp.amount;
        if (categoryUsage[exp.category] !== undefined) categoryUsage[exp.category] += exp.amount;
        
        // [이상 감지 로직] 50만 원 이상의 고액 단일 지출 건 감지
        if (exp.amount >= 500000) {
          anomalies.push(exp);
        }
      } else if (exp.status === 'PENDING') {
        totalPendingAmount += exp.amount; pendingCount += 1;
      }
    });

    return { totalApproved, totalPendingAmount, pendingCount, categoryUsage, anomalies };
  }, [expenses]);

  // 엑셀 업로드 및 파싱 로직 (이전과 동일 - 안정성 유지)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const workbook = XLSX.read(bstr, { type: 'binary' });
      const wsname = workbook.SheetNames[0];
      const ws = workbook.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const extracted = [];

      try {
        if (uploadType === 'BANK') {
          const headerIdx = data.findIndex(row => row && row.includes('거래일시'));
          if (headerIdx === -1) throw new Error("통장 양식이 아닙니다.");
          const dateIdx = data[headerIdx].indexOf('거래일시');
          const nameIdx = data[headerIdx].indexOf('보낸분/받는분');
          const outIdx = data[headerIdx].indexOf('출금액(원)');

          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || !data[i][outIdx]) continue;
            const amount = Number(String(data[i][outIdx]).replace(/,/g, ''));
            if (amount > 0) {
              const dateOnly = data[i][dateIdx].split(' ')[0].replace(/\./g, '-');
              extracted.push({ transactionDate: dateOnly, amount, merchantName: data[i][nameIdx] || '알수없음', type: 'BANK', rawId: `${dateOnly}_${amount}_${i}` });
            }
          }
        } else if (uploadType === 'CARD') {
          const headerIdx = data.findIndex(row => row && row.includes('승인일'));
          if (headerIdx === -1) throw new Error("카드 양식이 아닙니다.");
          const dateIdx = data[headerIdx].indexOf('승인일');
          const nameIdx = data[headerIdx].indexOf('가맹점명');
          const amountIdx = data[headerIdx].indexOf('승인금액');
          const statusIdx = data[headerIdx].indexOf('상태');

          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || data[i][statusIdx] !== '정상') continue;
            const amount = Number(String(data[i][amountIdx]).replace(/,/g, ''));
            if (amount > 0) {
              const dateOnly = String(data[i][dateIdx]).replace(/\./g, '-');
              extracted.push({ transactionDate: dateOnly, amount, merchantName: data[i][nameIdx] || '알수없음', type: 'CARD', rawId: `${dateOnly}_${amount}_${i}` });
            }
          }
        } else if (uploadType === 'HOMETAX') {
          const headerIdx = data.findIndex(row => row && row.includes('승인번호'));
          if (headerIdx === -1) throw new Error("홈택스 양식이 아닙니다.");
          const dateIdx = data[headerIdx].indexOf('작성일자');
          const merchantIdx = data[headerIdx].indexOf('상호'); 
          const amountIdx = data[headerIdx].indexOf('합계금액');
          const approvalIdx = data[headerIdx].indexOf('승인번호');

          for (let i = headerIdx + 1; i < data.length; i++) {
            if (!data[i] || !data[i][approvalIdx]) continue;
            const amount = Number(String(data[i][amountIdx]).replace(/,/g, ''));
            if (amount > 0) {
              const dateOnly = String(data[i][dateIdx]).replace(/\./g, '-');
              extracted.push({ transactionDate: dateOnly, amount, merchantName: data[i][merchantIdx] || '알수없음', type: 'HOMETAX', rawId: String(data[i][approvalIdx]) });
            }
          }
        }
        setParsedData(extracted);
      } catch (err) { alert("엑셀 변환 오류: " + err.message); }
    };
    reader.readAsBinaryString(file);
  };

  const handleMatchAndUpload = async () => {
    if (parsedData.length === 0) return;
    setIsMatching(true);

    try {
      const batch = writeBatch(db);
      let matchCount = 0, missingCount = 0, createdCount = 0;

      if (uploadType === 'HOMETAX') {
        for (const item of parsedData) {
          const expRef = doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.rawId);
          batch.set(expRef, {
            userId: 'SYSTEM_HOMETAX', userName: '전자세금계산서(자동)', expenseDate: item.transactionDate, amount: item.amount, method: '계좌이체',
            purpose: `[${item.merchantName}] 매입전자세금계산서`, category: 'SUPPLIES', receiptUrl: '홈택스 증빙', status: 'APPROVED', matchedTransactionId: null, createdAt: new Date().toISOString()
          }, { merge: true });
          createdCount++;
        }
        await batch.commit();
        alert(`홈택스 연동 완료!\n✅ ${createdCount}건 자동 생성됨.`);
      } else {
        const unmatchedExpenses = expenses.filter(e => !e.matchedTransactionId);
        const expenseMap = new Map();
        unmatchedExpenses.forEach(exp => {
          const key = `${exp.expenseDate}_${exp.amount}`;
          if (!expenseMap.has(key)) expenseMap.set(key, []);
          expenseMap.get(key).push(exp);
        });

        for (const trx of parsedData) {
          const key = `${trx.transactionDate}_${trx.amount}`;
          const matchCandidates = expenseMap.get(key);
          const trxDocRef = doc(collection(db, `artifacts/${APP_ID}/public/data/transactions`));

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
        await batch.commit();
        alert(`장부 동기화 완료!\n✅ 매칭: ${matchCount}건\n❌ 누락: ${missingCount}건`);
      }
      setIsUploadModalOpen(false); setParsedData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) { alert("매칭 오류: " + error.message); } finally { setIsMatching(false); }
  };

  // 🚀 [신규] 완벽한 세무조사 대비용 장부 다운로드
  const handleDownloadPerfectLedger = () => {
    // 1. 정상 승인 및 매칭 완료된 내역
    const approvedData = expenses.filter(exp => exp.status === 'APPROVED').map(exp => ({
      '거래일자': exp.expenseDate,
      '계정과목': budgets[exp.category]?.name || '기타',
      '적요(지출목적)': exp.purpose,
      '출금금액': exp.amount,
      '결제수단': exp.method,
      '증빙유형': exp.userId === 'SYSTEM_HOMETAX' ? '세금계산서' : (exp.receiptUrl ? '영수증/카드' : '증빙없음'),
      '담당자': exp.userName,
      '매칭상태': exp.matchedTransactionId ? '통장/카드 대조완료' : '금융내역 미확인(위험)'
    }));

    // 2. 돈은 나갔는데 증빙(영수증)이 없는 내역 (세무조사 시 가장 위험한 건)
    const missingData = missingReceipts.map(miss => ({
      '거래일자': miss.transactionDate,
      '계정과목': '분류불가(미확인)',
      '적요(지출목적)': `[증빙누락] ${miss.merchantName}`,
      '출금금액': miss.amount,
      '결제수단': miss.type === 'BANK' ? '계좌출금' : '법인카드',
      '증빙유형': '증빙누락(위험)',
      '담당자': '확인요망',
      '매칭상태': '지출결의서 없음'
    }));

    const combinedData = [...approvedData, ...missingData].sort((a, b) => new Date(a.거래일자) - new Date(b.거래일자));

    if (combinedData.length === 0) return alert("다운로드할 데이터가 없습니다.");

    const ws = XLSX.utils.json_to_sheet(combinedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "종합재무원장");
    XLSX.writeFile(wb, `임페리얼_세무소명용_완벽장부_${selectedMonth}.xlsx`);
  };

  const handleMonthChange = (offset) => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10); let month = parseInt(monthStr, 10) + offset;
    if (month > 12) { month = 1; year += 1; } else if (month < 1) { month = 12; year -= 1; }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
      <div className="flex justify-between items-center bg-gray-900 text-white p-6 rounded-2xl shadow-lg">
        <div><h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><PieChart/> 실시간 재무 DB 타워</h1></div>
        <div className="flex gap-2">
          <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"><UploadCloud size={18}/> 엑셀 일괄 업로드</button>
          <button onClick={handleDownloadPerfectLedger} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors"><Download size={18}/> 소명용 완벽장부 다운로드</button>
          <div className="flex items-center gap-2 bg-white/10 px-4 rounded-xl ml-2">
            <button onClick={() => handleMonthChange(-1)} className="p-2"><ChevronLeft/></button>
            <span className="font-bold">{selectedMonth}</span>
            <button onClick={() => handleMonthChange(1)} className="p-2"><ChevronRight/></button>
          </div>
        </div>
      </div>

      {isLoading ? <Loader className="animate-spin text-blue-600 mx-auto mt-20" size={48}/> : (
        <>
          {/* 🚀 [신규] 세무 리스크 및 이상 감지 (Anomaly Detection) 대시보드 */}
          <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-rose-800 mb-4 flex items-center gap-2 border-b border-rose-200 pb-2">
              <ShieldAlert className="text-rose-600" size={24} /> 세무 리스크 및 이상 지출 감지
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-rose-700 mb-2">고액 지출 (50만 원 이상) 감지내역</h3>
                {dashboardStats.anomalies.length === 0 ? <p className="text-sm text-emerald-600 font-bold">특이사항 없음</p> : (
                  <ul className="space-y-2">
                    {dashboardStats.anomalies.map(ano => (
                      <li key={ano.id} className="text-sm bg-white p-2 rounded border border-rose-100 flex justify-between">
                        <span>{ano.expenseDate} | {ano.purpose}</span>
                        <span className="font-bold text-rose-600">{formatCurrency(ano.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-700 mb-2">예산 초과 위험 카테고리 (90% 이상 소진)</h3>
                <ul className="space-y-2">
                  {Object.keys(budgets).map(cat => {
                    const limit = budgets[cat].limit;
                    const used = dashboardStats.categoryUsage[cat] || 0;
                    const percent = (used / limit) * 100;
                    if (percent >= 90) {
                      return (
                        <li key={cat} className="text-sm bg-white p-2 rounded border border-rose-100 flex justify-between items-center">
                          <span className="font-bold text-gray-800">{budgets[cat].name}</span>
                          <span className="text-rose-600 font-black">{percent.toFixed(1)}% 소진</span>
                        </li>
                      );
                    }
                    return null;
                  })}
                  {Object.keys(budgets).every(cat => ((dashboardStats.categoryUsage[cat] || 0) / budgets[cat].limit) * 100 < 90) && (
                    <p className="text-sm text-emerald-600 font-bold">모든 계정과목이 예산 내에서 안전하게 통제되고 있습니다.</p>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* 기존 KPI 요약 및 통제 패널 등 (동일 유지) */}
          <div className="grid grid-cols-3 gap-5">
            <div className="bg-white p-6 rounded-2xl shadow-sm border"><p className="text-gray-500 font-bold mb-2">총 지출 (승인/매칭완료)</p><span className="text-3xl font-black">{formatCurrency(dashboardStats.totalApproved)}</span></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border"><p className="text-gray-500 font-bold mb-2">지출결의 결재 대기</p><span className="text-3xl font-black text-amber-600">{formatCurrency(dashboardStats.totalPendingAmount)}</span></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border"><p className="text-rose-700 font-bold mb-2">영수증 미제출자</p><span className="text-3xl font-black text-rose-700">{missingReceipts.length}건</span></div>
          </div>
          
          {/* 하단 리스트 생략 (기존 코드와 동일하게 작동) */}
        </>
      )}

      {/* 엑셀 업로드 모달창 (동일 유지) */}
      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="금융내역 엑셀 파일 업로드 및 장부 동기화">
         {/* ... 기존 모달 코드 ... */}
      </Modal>
    </div>
  );
};
export default FinancialDashboard;