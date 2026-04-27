import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx'; // 엑셀 변환 라이브러리 추가
import { 
  TrendingUp, AlertCircle, CheckCircle, XCircle, DollarSign, 
  PieChart, Calendar, ChevronLeft, ChevronRight, Receipt, Loader, Wallet, Download, BellRing 
} from 'lucide-react';

const FinancialDashboard = ({ currentUser }) => {
  if (currentUser?.role !== 'admin') {
    return <div className="p-10 text-center text-red-500 font-bold">접근 권한이 없습니다.</div>;
  }

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [missingReceipts, setMissingReceipts] = useState([]); // 누락자 목록 상태 추가
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    const fetchFinancialData = async () => {
      setIsLoading(true);
      try {
        setBudgets({
          'MEALS': { name: '식대 및 다과', limit: 500000 },
          'SUPPLIES': { name: '비품 및 교재', limit: 1000000 },
          'MARKETING': { name: '마케팅 홍보', limit: 2000000 },
        });

        setTimeout(() => {
          setExpenses([
            { id: 'EXP-001', userName: '김강사', category: 'MEALS', expenseDate: `${selectedMonth}-05`, amount: 45000, method: '법인카드', purpose: '야근 식대', status: 'PENDING', receiptUrl: 'https://via.placeholder.com/150' },
            { id: 'EXP-002', userName: '박조교', category: 'SUPPLIES', expenseDate: `${selectedMonth}-12`, amount: 850000, method: '계좌이체', purpose: '복사용지 대량 구매', status: 'APPROVED', receiptUrl: 'https://via.placeholder.com/150' },
            { id: 'EXP-003', userName: '이강사', category: 'MEALS', expenseDate: `${selectedMonth}-15`, amount: 420000, method: '개인카드', purpose: '학부모 간담회 케이터링', status: 'APPROVED', receiptUrl: 'https://via.placeholder.com/150' },
            { id: 'EXP-004', userName: '최강사', category: 'MARKETING', expenseDate: `${selectedMonth}-20`, amount: 150000, method: '법인카드', purpose: '당근마켓 지역광고 충전', status: 'PENDING', receiptUrl: 'https://via.placeholder.com/150' },
          ]);
          
          // [기능 추가] 영수증 누락 가상 데이터 (스크래핑은 되었으나 지출결의서가 없는 건)
          setMissingReceipts([
            { id: 'MISS-01', userName: '김강사', date: `${selectedMonth}-08`, amount: 12000, store: '파리바게뜨 목동점' },
            { id: 'MISS-02', userName: '정조교', date: `${selectedMonth}-18`, amount: 5500, store: 'GS25' }
          ]);

          setIsLoading(false);
        }, 600);
      } catch (error) {
        setIsLoading(false);
      }
    };
    fetchFinancialData();
  }, [selectedMonth]);

  const dashboardStats = useMemo(() => {
    let totalApproved = 0;
    let totalPendingAmount = 0;
    let pendingCount = 0;
    const categoryUsage = { MEALS: 0, SUPPLIES: 0, MARKETING: 0 };

    expenses.forEach(exp => {
      if (exp.status === 'APPROVED') {
        totalApproved += exp.amount;
        if (categoryUsage[exp.category] !== undefined) {
          categoryUsage[exp.category] += exp.amount;
        }
      } else if (exp.status === 'PENDING') {
        totalPendingAmount += exp.amount;
        pendingCount += 1;
      }
    });

    return { totalApproved, totalPendingAmount, pendingCount, categoryUsage };
  }, [expenses]);

  const handleMonthChange = (offset) => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + offset;
    if (month > 12) { month = 1; year += 1; } 
    else if (month < 1) { month = 12; year -= 1; }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleApproval = async (expenseId, newStatus) => {
    setProcessingId(expenseId);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setExpenses(prev => prev.map(exp => exp.id === expenseId ? { ...exp, status: newStatus } : exp));
    } finally {
      setProcessingId(null);
    }
  };

  // 🚀 [신규 추가] 세무사 제출용 엑셀 다운로드 로직
  const handleDownloadExcel = () => {
    const approvedExpenses = expenses.filter(exp => exp.status === 'APPROVED');
    
    if (approvedExpenses.length === 0) {
      alert("다운로드할 승인 완료 내역이 없습니다.");
      return;
    }

    // 엑셀에 들어갈 데이터 포맷팅
    const exportData = approvedExpenses.map((exp, index) => ({
      '연번': index + 1,
      '결제일자': exp.expenseDate,
      '계정과목': budgets[exp.category]?.name || '기타',
      '지출목적(적요)': exp.purpose,
      '결제수단': exp.method,
      '지출금액': exp.amount,
      '작성자': exp.userName,
      '증빙영수증(URL)': exp.receiptUrl
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "지출결의내역");
    
    XLSX.writeFile(workbook, `임페리얼학원_재무보고서_${selectedMonth}.xlsx`);
  };

  // 🚀 [신규 추가] 카카오톡 독촉 알림 발송 로직 (시뮬레이션)
  const handleSendReminder = () => {
    if (missingReceipts.length === 0) {
      alert("현재 영수증 누락자가 없습니다! 완벽합니다.");
      return;
    }

    const confirmMsg = `[카카오톡 발송 확인]\n현재 영수증 누락자 ${missingReceipts.length}명에게 지출결의서 작성 독촉 알림톡을 일괄 발송하시겠습니까?`;
    if (window.confirm(confirmMsg)) {
      alert("✅ 카카오톡 알림톡이 성공적으로 발송되었습니다.\n\n[발송 내용 예시]\n'선생님, 지난 법인카드 사용 내역에 대한 영수증이 누락되었습니다. 임페리얼 시스템에 접속하여 지출결의서를 작성해주세요.'");
      // 발송 후 리스트를 비우는 연출
      setMissingReceipts([]);
    }
  };

  const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num);

  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader className="animate-spin text-blue-600" size={48}/></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      {/* 1. 헤더 및 월 이동 */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-gradient-to-r from-gray-900 to-slate-800 text-white p-6 rounded-2xl shadow-lg gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><PieChart size={28}/> 재무 컨트롤 타워</h1>
          <p className="opacity-80 text-sm font-medium">임페리얼 학원의 자금 흐름과 예산을 실시간으로 통제합니다.</p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 🚀 신규: 엑셀 다운로드 버튼 */}
          <button onClick={handleDownloadExcel} className="hidden md:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-sm">
            <Download size={18}/> 세무사 제출용 엑셀
          </button>
          
          <div className="flex items-center gap-4 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/20 ml-2">
            <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronLeft size={24}/></button>
            <span className="text-xl font-bold tracking-widest">{selectedMonth.replace('-', '년 ')}월</span>
            <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><ChevronRight size={24}/></button>
          </div>
        </div>
      </div>

      {/* 2. KPI 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 font-bold text-sm">이번 달 총 지출 (승인완료)</span>
            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg"><Wallet size={20}/></div>
          </div>
          <span className="text-3xl font-black text-gray-900">{formatCurrency(dashboardStats.totalApproved)}</span>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-gray-500 font-bold text-sm">결재 대기 중인 금액</span>
            <div className="bg-amber-100 text-amber-600 p-2 rounded-lg"><DollarSign size={20}/></div>
          </div>
          <span className="text-3xl font-black text-amber-600">{formatCurrency(dashboardStats.totalPendingAmount)}</span>
        </div>

        <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <span className="text-rose-700 font-bold text-sm">미처리 결재 건수</span>
            <div className="bg-rose-200 text-rose-700 p-2 rounded-lg"><AlertCircle size={20}/></div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-700">{dashboardStats.pendingCount}</span>
            <span className="text-rose-600 font-bold">건</span>
          </div>
        </div>
      </div>

      {/* 🚀 3. [신규] 영수증 누락 추적 (Reverse Tracking) */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-5 border-b pb-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <BellRing className="text-rose-500" size={20} /> 영수증 누락자 추적 (카드내역 ↔ 지출결의 미스매치)
          </h2>
          <button 
            onClick={handleSendReminder}
            disabled={missingReceipts.length === 0}
            className="flex items-center gap-1 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-4 py-2 rounded-lg font-extrabold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            카카오톡 일괄 독촉
          </button>
        </div>
        
        {missingReceipts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-emerald-600 font-bold flex items-center justify-center gap-2"><CheckCircle size={18}/> 이번 달 영수증 누락건이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {missingReceipts.map(miss => (
              <div key={miss.id} className="flex justify-between items-center p-3 bg-rose-50/50 border border-rose-100 rounded-xl">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-800">{miss.userName} <span className="text-xs text-rose-500 ml-1">미제출</span></span>
                  <span className="text-xs text-gray-500">{miss.date} | {miss.store}</span>
                </div>
                <span className="font-black text-rose-700">{formatCurrency(miss.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. 예산 통제 (Budget Warning) 현황 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h2 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2 border-b pb-3">
          <TrendingUp className="text-indigo-600" size={20} /> 카테고리별 예산 소진율
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.keys(budgets).map(category => {
            const limit = budgets[category].limit;
            const used = dashboardStats.categoryUsage[category] || 0;
            const percentage = Math.min((used / limit) * 100, 100).toFixed(1);
            const isWarning = percentage >= 80;

            return (
              <div key={category} className="space-y-2">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-gray-700">{budgets[category].name}</span>
                  <span className={isWarning ? 'text-rose-600' : 'text-emerald-600'}>{percentage}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div 
                    className={`h-3 rounded-full transition-all duration-1000 ${isWarning ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>사용: {formatCurrency(used)}</span>
                  <span>한도: {formatCurrency(limit)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. 지출결의 승인 대기열 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h2 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2 border-b pb-3">
          <Receipt className="text-amber-500" size={20} /> 결재 대기 문서 ({dashboardStats.pendingCount}건)
        </h2>
        
        <div className="space-y-4">
          {expenses.filter(e => e.status === 'PENDING').length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <CheckCircle className="mx-auto text-gray-300 mb-2" size={40}/>
              <p className="text-gray-500 font-bold">모든 결재가 완료되었습니다.</p>
            </div>
          ) : (
            expenses.filter(e => e.status === 'PENDING').map(exp => (
              <div key={exp.id} className="flex flex-col lg:flex-row justify-between lg:items-center p-5 border border-amber-200 bg-amber-50/30 rounded-xl gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-1 rounded-md">{exp.userName}</span>
                    <span className="text-xs font-bold text-gray-500 flex items-center gap-1"><Calendar size={12}/> {exp.expenseDate}</span>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">{budgets[exp.category]?.name}</span>
                  </div>
                  <strong className="text-lg text-gray-900 block">{exp.purpose}</strong>
                </div>

                <div className="flex flex-col items-start lg:items-end gap-1">
                  <span className="text-2xl font-black text-gray-900">{formatCurrency(exp.amount)}</span>
                  <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                    <Receipt size={12}/> 영수증 이미지
                  </a>
                </div>

                <div className="flex gap-2 border-t lg:border-none pt-4 lg:pt-0 mt-2 lg:mt-0">
                  <button 
                    onClick={() => handleApproval(exp.id, 'APPROVED')}
                    disabled={processingId === exp.id}
                    className="flex-1 lg:flex-none px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                  >
                    {processingId === exp.id ? <Loader className="animate-spin" size={18}/> : <CheckCircle size={18}/>} 승인
                  </button>
                  <button 
                    onClick={() => handleApproval(exp.id, 'REJECTED')}
                    disabled={processingId === exp.id}
                    className="flex-1 lg:flex-none px-6 py-3 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold rounded-xl flex items-center justify-center gap-2"
                  >
                    <XCircle size={18}/> 반려
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default FinancialDashboard;