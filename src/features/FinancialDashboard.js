import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, Calendar, ChevronLeft, ChevronRight, Receipt, 
  Loader, Wallet, Download, BellRing, UploadCloud, FileSpreadsheet 
} from 'lucide-react';
import { Modal, Button } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const FinancialDashboard = ({ currentUser }) => {
  // [보안 최우선] 관리자 외 접근 원천 차단
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
  const [uploadType, setUploadType] = useState('BANK'); // 'BANK', 'CARD', 'HOMETAX'
  const [parsedData, setParsedData] = useState([]);
  const [isMatching, setIsMatching] = useState(false);
  const fileInputRef = useRef(null);

  // 🚀 DB 실시간 연동
  useEffect(() => {
    setIsLoading(true);
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
      where('isMatched', '==', false) 
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
  // 🚀 [엑셀 파싱 엔진] 통장, 카드, 홈택스 각 양식별 지능형 추출
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
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const extracted = [];

      try {
        if (uploadType === 'BANK') {
          const headerIdx = data.findIndex(row => row && row.includes('거래일시'));
          if (headerIdx === -1) throw new Error("통장 양식이 아닙니다.");
          const headers = data[headerIdx];
          const dateIdx = headers.indexOf('거래일시');
          const nameIdx = headers.indexOf('보낸분/받는분');
          const outIdx = headers.indexOf('출금액(원)');

          for (let i = headerIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            const outAmount = Number(String(row[outIdx] || 0).replace(/,/g, ''));
            if (outAmount > 0) {
              const dateOnly = row[dateIdx].split(' ')[0].replace(/\./g, '-');
              extracted.push({
                transactionDate: dateOnly, amount: outAmount, merchantName: row[nameIdx] || '알수없음', type: 'BANK', rawId: `${dateOnly}_${outAmount}_${i}`
              });
            }
          }
        } 
        else if (uploadType === 'CARD') {
          const headerIdx = data.findIndex(row => row && row.includes('승인일'));
          if (headerIdx === -1) throw new Error("카드 양식이 아닙니다.");
          const headers = data[headerIdx];
          const dateIdx = headers.indexOf('승인일');
          const nameIdx = headers.indexOf('가맹점명');
          const amountIdx = headers.indexOf('승인금액');
          const statusIdx = headers.indexOf('상태');

          for (let i = headerIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0 || row[statusIdx] !== '정상') continue;
            const amount = Number(String(row[amountIdx] || 0).replace(/,/g, ''));
            if (amount > 0) {
              const dateOnly = String(row[dateIdx]).replace(/\./g, '-');
              extracted.push({
                transactionDate: dateOnly, amount: amount, merchantName: row[nameIdx] || '알수없음', type: 'CARD', rawId: `${dateOnly}_${amount}_${i}`
              });
            }
          }
        }
        else if (uploadType === 'HOMETAX') {
          // [홈택스 전용 파싱 로직] 승인번호를 고유 키로 활용하여 중복 완벽 방지
          const headerIdx = data.findIndex(row => row && row.includes('승인번호'));
          if (headerIdx === -1) throw new Error("홈택스 양식이 아닙니다. '승인번호' 열을 찾을 수 없습니다.");
          
          const headers = data[headerIdx];
          const dateIdx = headers.indexOf('작성일자');
          const merchantIdx = headers.indexOf('상호'); // 첫 번째 등장하는 상호(공급자)
          const amountIdx = headers.indexOf('합계금액');
          const purposeIdx = headers.indexOf('품목명');
          const approvalIdx = headers.indexOf('승인번호');

          for (let i = headerIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0 || !row[approvalIdx]) continue;
            
            const amount = Number(String(row[amountIdx] || 0).replace(/,/g, ''));
            if (amount > 0) {
              const dateOnly = String(row[dateIdx]).replace(/\./g, '-');
              extracted.push({
                transactionDate: dateOnly, 
                amount: amount, 
                merchantName: row[merchantIdx] || '알수없음', 
                purpose: row[purposeIdx] || '전자세금계산서 매입', 
                type: 'HOMETAX', 
                rawId: String(row[approvalIdx]) // 국세청 고유 식별번호
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
  // 🚀 [AI 자동화] 매칭 및 DB 업데이트 로직 ($O(N)$ 최적화)
  // =========================================================================
  const handleMatchAndUpload = async () => {
    if (parsedData.length === 0) return;
    setIsMatching(true);

    try {
      const batch = writeBatch(db);
      let matchCount = 0;
      let missingCount = 0;
      let createdCount = 0;

      // 1. [홈택스 분기] 홈택스 엑셀인 경우, 지출결의서(Expenses)를 자동 생성
      if (uploadType === 'HOMETAX') {
        for (const item of parsedData) {
          // 문서 ID를 승인번호로 강제하여, 여러 번 업로드해도 중복 생성이 절대 발생하지 않음 (비용 절감)
          const expRef = doc(db, `artifacts/${APP_ID}/public/data/expenses`, item.rawId);
          batch.set(expRef, {
            userId: 'SYSTEM_HOMETAX',
            userName: '전자세금계산서(자동)',
            expenseDate: item.transactionDate,
            amount: item.amount,
            method: '계좌이체',
            purpose: `[${item.merchantName}] ${item.purpose}`,
            category: 'SUPPLIES', 
            receiptUrl: '홈택스 증빙 완료(전자세금계산서)',
            status: 'APPROVED',        // 바로 승인 완료 처리
            matchedTransactionId: null, // 이후 통장 엑셀 업로드 시 매칭 대기
            createdAt: new Date().toISOString()
          }, { merge: true });
          createdCount++;
        }
        await batch.commit();
        alert(`홈택스 세금계산서 연동 완료!\n✅ 총 ${createdCount}건의 법적 지출 증빙이 자동 생성되었습니다.\n이제 'KB은행 통장내역'을 업로드하시면 자동으로 짝지어집니다.`);
      } 
      // 2. [통장/카드 분기] 기존 지출결의서(수동 작성 + 홈택스 생성)와 고속 교차 매칭
      else {
        // [알고리즘 최적화] 매칭 대기 중인 모든 지출결의서(PENDING, 또는 HOMETAX 생성건)를 해시맵화
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
            // 매칭 성공 -> 양쪽 연결 고리 업데이트
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
            // 매칭 실패 -> 누락자로 등록
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
        alert(`장부 동기화 완료!\n✅ 자동 매칭 완료: ${matchCount}건\n❌ 영수증 미제출(누락): ${missingCount}건`);
      }

      // 초기화
      setIsUploadModalOpen(false);
      setParsedData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (error) {
      alert("데이터 처리 중 오류 발생: " + error.message);
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
      <div className="flex justify-between items-center bg-gray-900 text-white p-6 rounded-2xl shadow-lg">
        <div><h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><PieChart/> 실시간 재무 DB 타워</h1></div>
        <div className="flex gap-2">
          <button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors">
            <UploadCloud size={18}/> 엑셀 일괄 업로드
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
          <div className="grid grid-cols-3 gap-5">
            <div className="bg-white p-6 rounded-2xl shadow-sm border"><p className="text-gray-500 font-bold mb-2">총 지출 (승인/매칭완료)</p><span className="text-3xl font-black">{formatCurrency(dashboardStats.totalApproved)}</span></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border"><p className="text-gray-500 font-bold mb-2">지출결의 결재 대기</p><span className="text-3xl font-black text-amber-600">{formatCurrency(dashboardStats.totalPendingAmount)}</span></div>
            <div className="bg-rose-50 p-6 rounded-2xl shadow-sm border"><p className="text-rose-700 font-bold mb-2">영수증 미제출자</p><span className="text-3xl font-black text-rose-700">{missingReceipts.length}건</span></div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-5 border-b pb-3">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <BellRing className="text-rose-500" size={20} /> 엑셀 대조 결과 - 증빙 누락건 (스크래핑 ↔ 영수증 미스매치)
              </h2>
            </div>
            {missingReceipts.length === 0 ? <p className="text-emerald-600 font-bold text-center py-6">모든 금융 내역에 영수증/세금계산서가 완벽히 증빙되었습니다.</p> : (
              <div className="grid grid-cols-2 gap-3">
                {missingReceipts.map(miss => (
                  <div key={miss.id} className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex justify-between items-center">
                    <div>
                      <span className="text-sm font-bold">{miss.merchantName} <span className="text-rose-500 text-xs">증빙 자료 없음</span></span>
                      <br/><span className="text-xs text-gray-500">{miss.type} | {miss.transactionDate}</span>
                    </div>
                    <span className="font-black text-rose-700">{formatCurrency(miss.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 엑셀 업로드 모달창 */}
      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="금융내역 엑셀 파일 업로드 및 장부 동기화">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => { setUploadType('BANK'); setParsedData([]); }} className={`flex-1 py-2 text-sm rounded-lg font-bold border ${uploadType === 'BANK' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>KB은행 통장내역</button>
            <button onClick={() => { setUploadType('CARD'); setParsedData([]); }} className={`flex-1 py-2 text-sm rounded-lg font-bold border ${uploadType === 'CARD' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>법인카드 승인내역</button>
            <button onClick={() => { setUploadType('HOMETAX'); setParsedData([]); }} className={`flex-1 py-2 text-sm rounded-lg font-bold border ${uploadType === 'HOMETAX' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>홈택스 매입건</button>
          </div>
          
          <div className="border-2 border-dashed border-gray-300 bg-gray-50 p-6 rounded-xl text-center">
            <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileUpload} ref={fileInputRef} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-2"/>
            <p className="text-xs text-gray-400">
              {uploadType === 'HOMETAX' ? "국세청 홈택스의 '매입전자세금계산서' 엑셀을 올려주세요." : "해당 금융사의 표준 엑셀 양식을 업로드해주세요."}
            </p>
          </div>

          {parsedData.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold text-sm text-gray-700 mb-2">분석된 내역 미리보기 ({parsedData.length}건)</h4>
              <div className="max-h-48 overflow-y-auto bg-gray-50 border rounded-lg p-2 text-xs space-y-1">
                {parsedData.map((d, i) => (
                  <div key={i} className="flex justify-between border-b pb-1">
                    <span className="truncate mr-2">{d.transactionDate} | {d.merchantName} {d.purpose && `(${d.purpose})`}</span>
                    <span className="font-bold text-blue-600 flex-shrink-0">{d.amount.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
              <Button onClick={handleMatchAndUpload} disabled={isMatching} className="w-full mt-4" icon={isMatching ? Loader : FileSpreadsheet}>
                {isMatching ? '처리 중...' : uploadType === 'HOMETAX' ? '전자세금계산서 증빙 자동 생성' : '지출결의서와 자동 매칭 (동기화)'}
              </Button>
            </div>
          )}
        </div>
      </Modal>

    </div>
  );
};
export default FinancialDashboard;