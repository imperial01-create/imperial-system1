import React, { useState, useEffect } from 'react';
// import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { db, storage, auth } from '../firebase'; // 실제 연동 시 주석 해제
import { 
  Receipt, UploadCloud, CheckCircle, FileText, Calendar, 
  CreditCard, DollarSign, List, Clock, XCircle, AlertCircle, Loader 
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
  const [errorMsg, setErrorMsg] = useState('');
  const [expensesList, setExpensesList] = useState([]);

  // 임시 데이터 로드
  useEffect(() => {
    // 실제 연동 시 onSnapshot 활용
    setExpensesList([
      { id: '1', date: '2026-04-26', amount: 12000, method: '법인카드', purpose: '야근 식대', status: 'APPROVED' },
      { id: '2', date: '2026-04-27', amount: 35000, method: '계좌이체', purpose: '복사용지 구매', status: 'PENDING' },
      { id: '3', date: '2026-04-25', amount: 8000, method: '개인카드 (청구)', purpose: '학생 다과', status: 'REJECTED' }
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
      // 1. Storage 업로드 로직 (주석)
      // 2. Firestore 저장 로직 (주석)
      
      // 데모용 딜레이
      await new Promise(resolve => setTimeout(resolve, 1000));

      alert('지출결의서가 성공적으로 제출되었습니다.');
      
      setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
      setReceiptFile(null);

    } catch (error) {
      console.error('Submit Error:', error);
      setErrorMsg('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
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
      
      {/* 1. 페이지 헤더 (통일된 디자인) */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 rounded-2xl shadow-md">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><Receipt size={28}/> 지출결의서 등록</h1>
        <p className="opacity-90 text-sm">법인카드 사용 내역 및 개인 지출 청구 내역을 증빙 영수증과 함께 등록해주세요.</p>
      </div>

      {/* 2. 지출결의 입력 폼 카드 */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100">
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
            {/* 결제 일자 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><Calendar size={16}/> 결제 일자</label>
              <input 
                type="date" 
                name="expenseDate" 
                value={formData.expenseDate} 
                onChange={handleInputChange} 
                className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all"
                required 
              />
            </div>

            {/* 결제 금액 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><DollarSign size={16}/> 결제 금액 (원)</label>
              <input 
                type="number" 
                name="amount" 
                min="1" 
                value={formData.amount} 
                onChange={handleInputChange} 
                placeholder="예: 15000" 
                className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all"
                required 
              />
            </div>

            {/* 결제 수단 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><CreditCard size={16}/> 결제 수단</label>
              <select 
                name="paymentMethod" 
                value={formData.paymentMethod} 
                onChange={handleInputChange}
                className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all"
              >
                <option value="CORPORATE_CARD">법인카드</option>
                <option value="PERSONAL_CARD">개인카드 (청구)</option>
                <option value="TRANSFER">계좌이체</option>
              </select>
            </div>

            {/* 지출 목적 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><FileText size={16}/> 지출 목적 (적요)</label>
              <input 
                type="text" 
                name="purpose" 
                value={formData.purpose} 
                onChange={handleInputChange} 
                placeholder="예: 학부모 상담용 다과 구매" 
                className="w-full border border-gray-300 p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800 transition-all"
                required 
              />
            </div>
          </div>

          {/* 영수증 파일 첨부 UI (Drag & Drop 느낌의 스타일링) */}
          <div className="mt-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">영수증 첨부 (필수)</label>
            <label htmlFor="receipt-upload" className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${receiptFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {receiptFile ? (
                  <>
                    <CheckCircle className="text-emerald-500 mb-2" size={32} />
                    <p className="text-sm text-emerald-700 font-bold">{receiptFile.name}</p>
                    <p className="text-xs text-emerald-500 mt-1">클릭하여 파일 변경</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="text-gray-400 mb-2" size={32} />
                    <p className="text-sm text-gray-600 font-bold">클릭하여 영수증 이미지 촬영 또는 업로드</p>
                    <p className="text-xs text-gray-400 mt-1">지원 형식: JPG, PNG, PDF</p>
                  </>
                )}
              </div>
              <input id="receipt-upload" type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {/* 제출 버튼 */}
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-lg py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:bg-emerald-400 mt-4"
          >
            {isSubmitting ? <Loader className="animate-spin" size={24}/> : <CheckCircle size={24} />} 
            {isSubmitting ? '안전하게 전송 중...' : '지출결의서 제출하기'}
          </button>
        </form>
      </div>

      {/* 3. 나의 제출 내역 리스트 카드 */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 mt-6">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6 border-b pb-3">
          <List className="text-indigo-600" size={20} /> 나의 지출결의 내역
        </h3>
        
        <div className="space-y-3">
          {expensesList.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl bg-gray-50">
              <p className="text-gray-400 font-bold">아직 제출한 지출결의 내역이 없습니다.</p>
            </div>
          ) : (
            expensesList.map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border border-gray-100 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-200">{item.date}</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">{item.method}</span>
                  </div>
                  <strong className="text-base sm:text-lg text-gray-800 mt-1">{item.purpose}</strong>
                </div>
                
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 border-t sm:border-none pt-3 sm:pt-0 border-gray-200">
                  <span className="text-xl font-black text-gray-900">{item.amount.toLocaleString()}원</span>
                  {getStatusBadge(item.status)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default ExpenseManager;