import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, Calendar, ChevronLeft, ChevronRight, Receipt, 
  Loader, Wallet, Download, BellRing, UploadCloud, FileSpreadsheet 
} from 'lucide-react';
import { Modal, Button } from '../components/UI'; // 기존 프로젝트의 UI 컴포넌트

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
  const [uploadType, setUploadType] = useState('CARD'); // 'CARD' or 'BANK'
  const [parsedData, setParsedData] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const fileInputRef = useRef(null);

  // 🚀 [진짜 데이터] Firestore 실시간 연동 (지출결의서 & 통장/카드내역)
  useEffect(() => {
    setIsLoading(true);
    
    // 예산 세팅
    setBudgets({
      'MEALS': { name: '식대 및 다과', limit: 5000000 },
      'SUPPLIES': { name: '비품 및 교재', limit: 2000000 },
      'MARKETING': { name: '마케팅 홍보', limit: 3000000 },
    });

    const monthStart = `${selectedMonth}-01`;
    const monthEnd = `${selectedMonth}-31`;

    const expQuery = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'),
      where('expenseDate', '>=', monthStart),
      where('expenseDate', '<=', monthEnd)
    );

    const unsubscribeExp = onSnapshot(expQuery, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    });

    const trxQuery = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'transactions'),
      where('transactionDate', '>=', monthStart),
      where('transactionDate', '<=', monthEnd),
      where('isMatched', '==', false) // 매칭 안 된 내역만 = 영수증 누락자
    );

    const unsubscribeTrx = onSnapshot(trxQuery, (snapshot) => {
      setMissingReceipts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubscribeExp(); unsubscribeTrx(); };
  }, [selectedMonth]);

  const dashboardStats = useMemo(() => {
    let totalApproved = 0, totalPendingAmount = 0, pendingCount = 0;
    const categoryUsage = { MEALS: 0, SUPPLIES: 0, MARKETING: 0 };
    expenses.forEach(exp => {
      if (exp.status === 'APPROVED') {
        totalApproved += exp.amount;
        if (categoryUsage[exp.category] !== undefined) categoryUsage[exp.category] += exp.amount;
      } else if (exp.status === 'PENDING') {
        totalPendingAmount += exp.amount; pendingCount += 1;
      }
    });
    return { totalApproved, totalPendingAmount, pendingCount, categoryUsage };
  }, [expenses]);


  // =========================================================================
  // 🚀 [핵심 로직] 통장 및 카드 엑셀 파일 파싱 (대표님 업로드 양식 맞춤형)
  // =========================================================================
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const workbook = XLSX.read(bstr, { type: 'binary' });
      const wsname = workbook.SheetNames[0];
      const ws = workbook.Sheets[wsname];
      
      // header: 1 옵션으로 2차원 배열 형태로 데이터를 읽음
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const extracted = [];

      try {
        if (uploadType === 'BANK') {
          // [기업통장 양식 파싱] '거래일시'가 포함된 행을 찾아 그 아래부터 읽음
          const headerIdx = data.findIndex(row => row.includes('거래일시'));
          if (headerIdx === -1) throw new Error("통장 양식이 아닙니다. '거래일시' 헤더를 찾을 수 없습니다.");
          
          const headers = data[headerIdx];
          const dateIdx = headers.indexOf('거래일시');
          const nameIdx = headers.indexOf('보낸분/받는분');
          const outIdx = headers.indexOf('출금액(원)');
          const bankIdx = headers.indexOf('처리점');

          for (let i = headerIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            
            const outAmount = Number(String(row[outIdx] || 0).replace(/,/g, ''));
            if (outAmount > 0) { // 출금 내역만 추출
              const rawDate = row[dateIdx]; // "2026.04.30 11:45:43"
              const dateOnly = rawDate.split(' ')[0].replace(/\./g, '-'); // "2026-04-30"
              
              extracted.push({
                transactionDate: dateOnly,
                amount: outAmount,
                merchantName: row[nameIdx] || '알수없음',
                source: row[bankIdx] || '은행출금',
                type: 'BANK',
                rawId: `${dateOnly}_${outAmount}_${i}` // 고유 키 생성
              });
            }
          }
        } 
        else if (uploadType === 'CARD') {
          // [법인카드 양식 파싱] '승인일'이 포함된 행 기준
          const headerIdx = data.findIndex(row => row.includes('승인일'));
          if (headerIdx === -1) throw new Error("카드 양식이 아닙니다. '승인일' 헤더를 찾을 수 없습니다.");
          
          const headers = data[headerIdx];
          const dateIdx = headers.indexOf('승인일');
          const nameIdx = headers.indexOf('가맹점명');
          const amountIdx = headers.indexOf('승인금액');
          const cardIdx = headers.indexOf('카드번호');
          const statusIdx = headers.indexOf('상태');

          for (let i = headerIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            
            // '정상' 승인건만 취급 (취소건 제외)
            if (row[statusIdx] !== '정상') continue;

            const amount = Number(String(row[amountIdx] || 0).replace(/,/g, ''));
            if (amount > 0) {
              const dateOnly = String(row[dateIdx]).replace(/\./g, '-'); // "2026-04-30"
              
              extracted.push({
                transactionDate: dateOnly,
                amount: amount,
                merchantName: row[nameIdx] || '알수없음',
                source: String(row[cardIdx]).split('-')[3] ? `법인카드(끝자리 ${String(row[cardIdx]).split('-')[3]})` : '법인카드',
                type: 'CARD',
                rawId: `${dateOnly}_${amount}_${i}`
              });
            }
          }
        }
        setParsedData(extracted);
      } catch (err) {
        alert("엑셀 변환 오류: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // =========================================================================
  // 🚀 [AI 자동 매칭 로직] 엑셀 데이터 ↔ 직원 지출결의서 O(N) 비교
  // =========================================================================
  const handleMatchAndUpload = async () => {
    if (parsedData.length === 0) return;
    setIsMatching(true);

    try {
      const batch = writeBatch(db);
      let matchCount = 0;
      let missingCount = 0;

      // 비용과 날짜로 해시맵 생성 (매칭 속도 극대화 O(N))
      const pendingExpenses = expenses.filter(e => e.status === 'PENDING');
      const expenseMap = new Map();
      pendingExpenses.forEach(exp => {
        const key = `${exp.expenseDate}_${exp.amount}`;
        if (!expenseMap.has(key)) expenseMap.set(key, []);
        expenseMap.get(key).push(exp);
      });

      for (const trx of parsedData) {
        const key = `${trx.transactionDate}_${trx.amount}`;
        const matchCandidates = expenseMap.get(key);

        const trxDocRef = doc(collection(db, `artifacts/${APP_ID}/public/data/transactions`));

        if (matchCandidates && matchCandidates.length > 0) {
          // 일치하는 영수증(지출결의서)을 찾음 -> 양쪽 모두 업데이트!
          const matchedExpense = matchCandidates.shift();
          
          batch.update(doc(db, `artifacts/${APP_ID}/public/data/expenses`, matchedExpense.id), {
            status: 'APPROVED',
            matchedTransactionId: trxDocRef.id,
            updatedAt: new Date().toISOString()
          });

          batch.set(trxDocRef, {
            ...trx,
            isMatched: true,
            matchedExpenseId: matchedExpense.id,
            createdAt: new Date().toISOString()
          });
          matchCount++;
        } else {
          // 일치하는 영수증이 없음 -> 누락자로 DB에 등록
          batch.set(trxDocRef, {
            ...trx,
            isMatched: false,
            matchedExpenseId: null,
            createdAt: new Date().toISOString()
          });
          missingCount++;
        }
      }

      await batch.commit();
      alert(`장부 동기화 완료!\n✅ 자동 승인 및 매칭된 영수증: ${matchCount}건\n❌ 미제출(누락) 발견: ${missingCount}건`);
      setIsUploadModalOpen(false);
      setParsedData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (error) {
      alert("매칭 저장 중 오류 발생: " + error.message);
    } finally {
      setIsMatching(false);
    }
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
      {/* 헤더 및 컨트롤 */}
      <div className="flex justify-between items-center bg-gray-900 text-white p-6 rounded-2xl shadow-lg">
        <div><h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><PieChart/> 실시간 재무 DB 타워</h1></div>
        <div className="flex gap-2">
          {/* 🚀 신규: 엑셀 업로드 버튼 */}
          <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <UploadCloud size={18}/> 통장/카드내역 엑셀 올리기
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
          {/* KPI 요약 카드 */}
          <div className="grid grid-cols-3 gap-5">
            <div className="bg-white p-6 rounded-2xl shadow-sm border"><p className="text-gray-500 font-bold mb-2">총 지출 (승인/매칭완료)</p><span className="text-3xl font-black">{formatCurrency(dashboardStats.totalApproved)}</span></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border"><p className="text-gray-500 font-bold mb-2">지출결의 결재 대기</p><span className="text-3xl font-black text-amber-600">{formatCurrency(dashboardStats.totalPendingAmount)}</span></div>
            <div className="bg-rose-50 p-6 rounded-2xl shadow-sm border"><p className="text-rose-700 font-bold mb-2">영수증 미제출자</p><span className="text-3xl font-black text-rose-700">{missingReceipts.length}명</span></div>
          </div>

          {/* 영수증 누락자 추적 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-5 border-b pb-3">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <BellRing className="text-rose-500" size={20} /> 엑셀 대조 결과 - 영수증 누락건 추적
              </h2>
            </div>
            {missingReceipts.length === 0 ? <p className="text-emerald-600 font-bold text-center py-6">모든 금융 내역에 영수증이 증빙되었습니다. (누락 없음)</p> : (
              <div className="grid grid-cols-2 gap-3">
                {missingReceipts.map(miss => (
                  <div key={miss.id} className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex justify-between items-center">
                    <div>
                      <span className="text-sm font-bold">{miss.merchantName} <span className="text-rose-500 text-xs">증빙 영수증 없음</span></span>
                      <br/><span className="text-xs text-gray-500">{miss.source} | {miss.transactionDate}</span>
                    </div>
                    <span className="font-black text-rose-700">{formatCurrency(miss.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 🚀 엑셀 파싱 및 매칭 모달창 */}
      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="금융내역 엑셀 파일 업로드 및 장부 동기화">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => { setUploadType('BANK'); setParsedData([]); }} className={`flex-1 py-2 rounded-lg font-bold border transition-colors ${uploadType === 'BANK' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>KB은행 통장내역</button>
            <button onClick={() => { setUploadType('CARD'); setParsedData([]); }} className={`flex-1 py-2 rounded-lg font-bold border transition-colors ${uploadType === 'CARD' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>법인카드 승인내역</button>
          </div>
          
          <div className="border-2 border-dashed border-gray-300 bg-gray-50 p-6 rounded-xl text-center">
            <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} ref={fileInputRef} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-2"/>
            <p className="text-xs text-gray-400">대표님이 올려주신 양식에 맞추어 열(Column)을 자동 분석합니다.</p>
          </div>

          {parsedData.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold text-sm text-gray-700 mb-2">분석된 결제 내역 미리보기 ({parsedData.length}건)</h4>
              <div className="max-h-48 overflow-y-auto bg-gray-50 border rounded-lg p-2 text-xs space-y-1">
                {parsedData.map((d, i) => (
                  <div key={i} className="flex justify-between border-b pb-1">
                    <span>{d.transactionDate} | {d.merchantName}</span>
                    <span className="font-bold text-blue-600">{d.amount.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
              <Button onClick={handleMatchAndUpload} disabled={isMatching} className="w-full mt-4" icon={isMatching ? Loader : FileSpreadsheet}>
                {isMatching ? '장부 대조 중...' : '지출결의서와 자동 매칭 및 DB 업데이트'}
              </Button>
            </div>
          )}
        </div>
      </Modal>

    </div>
  );
};
export default FinancialDashboard;