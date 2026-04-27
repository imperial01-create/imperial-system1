import React, { useState, useEffect } from 'react';
import { 
  Receipt, UploadCloud, CheckCircle, FileText, Calendar, 
  CreditCard, DollarSign, List, Clock, XCircle, AlertCircle, Loader, ScanFace 
} from 'lucide-react';

const ExpenseManager = () => {
  // 폼 상태 관리
  const [formData, setFormData] = useState({
    expenseDate: '',
    amount: '',
    paymentMethod: 'CORPORATE_CARD',
    purpose: '',
  });
  const [receiptFile, setReceiptFile] = useState(null);
  
  // UI 상태 관리
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(''); // AI 분석 상태 텍스트
  const [errorMsg, setErrorMsg] = useState('');
  const [expensesList, setExpensesList] = useState([]);

  // 임시 데이터 로드
  useEffect(() => {
    setExpensesList([
      { id: '1', date: '2026-04-26', amount: 12000, method: '법인카드', purpose: '야근 식대', status: 'APPROVED' },
      { id: '2', date: '2026-04-27', amount: 35000, method: '계좌이체', purpose: '복사용지 구매', status: 'PENDING' },
    ]);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      setErrorMsg('이미지(JPG, PNG) 또는 PDF 파일만 업로드 가능합니다.');
      setReceiptFile(null);
      return;
    }
    setErrorMsg('');
    setReceiptFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.expenseDate || !formData.amount || !formData.purpose || !receiptFile) {
      setErrorMsg('모든 항목을 입력하고 영수증을 첨부해주세요.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      // [프로토타입 가상 로직] 1. 파일 업로드 대기
      setOcrStatus('영수증 이미지를 서버에 업로드 중입니다...');
      await new Promise(resolve => setTimeout(resolve, 800));

      // [프로토타입 가상 로직] 2. Cloud Vision AI OCR 분석 시뮬레이션
      setOcrStatus('AI가 영수증 텍스트와 금액을 교차 검증하고 있습니다...');
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 3. 리스트에 가짜 데이터 추가
      const newExpense = {
        id: `EXP-TEMP-${Date.now()}`,
        date: formData.expenseDate,
        amount: Number(formData.amount),
        method: formData.paymentMethod === 'CORPORATE_CARD' ? '법인카드' : (formData.paymentMethod === 'TRANSFER' ? '계좌이체' : '개인카드'),
        purpose: formData.purpose,
        status: 'PENDING' // 대시보드에서 승인 대기 상태로 등록
      };

      setExpensesList(prev => [newExpense, ...prev]);
      alert('AI 분석 및 지출결의서 제출이 완료되었습니다.\n관리자 대시보드에서 결재를 진행해주세요!');
      
      // 폼 초기화
      setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
      setReceiptFile(null);
      setOcrStatus('');

    } catch (error) {
      setErrorMsg('제출 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED': 
        return <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full"><CheckCircle size={12}/> 승인완료</span>;
      case 'REJECTED': 
        return <span className="flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full"><XCircle size={12}/> 반려됨</span>;
      default: 
        return <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full"><Clock size={12}/> 결재대기</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in">
      
      {/* 페이지 헤더 */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 rounded-2xl shadow-md">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><Receipt size={28}/> 지출결의서 등록 (AI 자동화)</h1>
        <p className="opacity-90 text-sm">영수증을 업로드하시면 AI가 자동으로 금액과 내역을 대조하여 교차 검증합니다.</p>
      </div>

      {/* 지출결의 입력 폼 카드 */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 relative">
        
        {/* 제출 중 오버레이 화면 (AI 분석 연출) */}
        {isSubmitting && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl animate-in fade-in">
            <ScanFace className="text-emerald-500 animate-pulse mb-4" size={56} />
            <h3 className="text-lg font-bold text-gray-800 mb-2">스마트 재무 처리 중...</h3>
            <p className="text-sm text-emerald-600 font-semibold">{ocrStatus}</p>
          </div>
        )}

        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6 border-b pb-3">
          <FileText className="text-emerald-600" size={20} /> 지출 내역 작성
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {errorMsg && (
            <div className="bg-rose-50 text-rose-600 font-bold p-4 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle size={18} /> {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><Calendar size={16}/> 결제 일자</label>
              <input type="date" name="expenseDate" value={formData.expenseDate} onChange={handleInputChange} className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all" required />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><DollarSign size={16}/> 결제 금액 (원)</label>
              <input type="number" name="amount" min="1" value={formData.amount} onChange={handleInputChange} placeholder="예: 15000" className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all" required />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><CreditCard size={16}/> 결제 수단</label>
              <select name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all">
                <option value="CORPORATE_CARD">법인카드</option>
                <option value="PERSONAL_CARD">개인카드 (청구)</option>
                <option value="TRANSFER">계좌이체</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><FileText size={16}/> 지출 목적 (적요)</label>
              <input type="text" name="purpose" value={formData.purpose} onChange={handleInputChange} placeholder="예: 학부모 상담용 다과 구매" className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all" required />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">영수증 첨부 (필수)</label>
            <label htmlFor="receipt-upload" className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${receiptFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {receiptFile ? (
                  <>
                    <CheckCircle className="text-emerald-500 mb-2" size={32} />
                    <p className="text-sm text-emerald-700 font-bold">{receiptFile.name}</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="text-gray-400 mb-2" size={32} />
                    <p className="text-sm text-gray-600 font-bold">클릭하여 영수증 이미지 촬영 또는 업로드</p>
                  </>
                )}
              </div>
              <input id="receipt-upload" type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:bg-emerald-400 mt-4">
            {isSubmitting ? <Loader className="animate-spin" size={24}/> : <CheckCircle size={24} />} 
            {isSubmitting ? 'AI 분석 중...' : '지출결의서 제출하기'}
          </button>
        </form>
      </div>

      {/* 나의 제출 내역 리스트 카드 */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 mt-6">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6 border-b pb-3">
          <List className="text-indigo-600" size={20} /> 나의 지출결의 내역
        </h3>
        
        <div className="space-y-3">
          {expensesList.map((item) => (
            <div key={item.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border border-gray-100 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-200">{item.date}</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">{item.method}</span>
                </div>
                <strong className="text-base sm:text-lg text-gray-800 mt-1">{item.purpose}</strong>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                <span className="text-xl font-black text-gray-900">{item.amount.toLocaleString()}원</span>
                {getStatusBadge(item.status)}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default ExpenseManager;