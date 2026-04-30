import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 
import { Receipt, UploadCloud, CheckCircle, FileText, Calendar, CreditCard, DollarSign, List, Clock, XCircle, AlertCircle, Loader, Edit, Trash2 } from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

const ExpenseManager = ({ currentUser }) => {
  const [formData, setFormData] = useState({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
  const [receiptFile, setReceiptFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expensesList, setExpensesList] = useState([]);
  
  // 🚀 수정 모드 상태 관리
  const [editingId, setEditingId] = useState(null);

  // 🚀 [진짜 데이터] 실시간 DB 연동
  useEffect(() => {
    if (!currentUser?.id) return;

    // 현재 로그인한 사용자의 데이터만 가져옴
    const q = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'),
      where('userId', '==', currentUser.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const realData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // 클라이언트에서 최신순으로 정렬 (인덱스 에러 방지)
      realData.sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate));
      setExpensesList(realData);
    });

    return () => unsubscribe();
  }, [currentUser]);

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
    if (!formData.expenseDate || !formData.amount || !formData.purpose) {
      setErrorMsg('모든 항목을 입력해주세요.'); return;
    }

    setIsSubmitting(true);
    try {
      // (임시) 파일 URL - 실제 Storage 연동 시 교체
      let fileUrl = 'https://via.placeholder.com/300x600?text=Receipt+Image'; 

      const methodLabel = formData.paymentMethod === 'CORPORATE_CARD' ? '법인카드' : (formData.paymentMethod === 'TRANSFER' ? '계좌이체' : '개인카드');

      if (editingId) {
        // 🚀 기존 내역 수정 로직
        const expRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', editingId);
        await updateDoc(expRef, {
          expenseDate: formData.expenseDate,
          amount: Number(formData.amount),
          method: methodLabel,
          purpose: formData.purpose,
          updatedAt: serverTimestamp()
        });
        alert('지출결의서가 성공적으로 수정되었습니다.');
      } else {
        // 🚀 신규 등록 로직
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), {
          userId: currentUser.id,
          userName: currentUser.name,
          expenseDate: formData.expenseDate,
          amount: Number(formData.amount),
          method: methodLabel,
          purpose: formData.purpose,
          category: 'SUPPLIES', // 관리자가 대시보드에서 수정 가능
          receiptUrl: fileUrl,
          status: 'PENDING',
          matchedTransactionId: null,
          createdAt: serverTimestamp()
        });
        alert('지출결의서가 등록되어 대표님 결재 대기열에 추가되었습니다.');
      }

      // 폼 초기화
      setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
      setReceiptFile(null);
      setEditingId(null);

    } catch (error) {
      setErrorMsg('DB 전송 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🚀 수정 버튼 클릭 핸들러
  const handleEdit = (exp) => {
    setFormData({
      expenseDate: exp.expenseDate,
      amount: exp.amount,
      paymentMethod: exp.method === '법인카드' ? 'CORPORATE_CARD' : (exp.method === '계좌이체' ? 'TRANSFER' : 'PERSONAL_CARD'),
      purpose: exp.purpose
    });
    setEditingId(exp.id);
    window.scrollTo({ top: 0, behavior: 'smooth' }); // 화면 맨 위로 스크롤
  };

  // 🚀 삭제 버튼 클릭 핸들러
  const handleDelete = async (id) => {
    if (window.confirm('정말 이 지출결의서를 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', id));
        alert('삭제되었습니다.');
        if (editingId === id) setEditingId(null); // 수정 중이던 항목을 삭제한 경우 폼 초기화
      } catch (err) {
        alert('삭제 실패: ' + err.message);
      }
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'APPROVED') return <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full"><CheckCircle size={12}/> 승인완료</span>;
    if (status === 'REJECTED') return <span className="flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full"><XCircle size={12}/> 반려됨</span>;
    return <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full"><Clock size={12}/> 결재대기</span>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 rounded-2xl shadow-md">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2"><Receipt size={28}/> 지출결의서 {editingId ? '수정' : '등록'}</h1>
        <p className="opacity-90 text-sm">결재 대기 중인 항목에 한하여 수정 및 삭제가 가능합니다.</p>
      </div>

      <div className={`bg-white p-6 sm:p-8 rounded-2xl shadow-sm border ${editingId ? 'border-amber-400 ring-4 ring-amber-50' : 'border-gray-100'}`}>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6 border-b pb-3">
          <FileText className={editingId ? "text-amber-600" : "text-emerald-600"} size={20} /> 
          {editingId ? '지출 내역 수정 중...' : '지출 내역 작성'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {errorMsg && <div className="bg-rose-50 text-rose-600 font-bold p-4 rounded-xl flex items-center gap-2 text-sm"><AlertCircle size={18} /> {errorMsg}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">결제 일자</label>
              <input type="date" name="expenseDate" value={formData.expenseDate} onChange={handleInputChange} className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">결제 금액 (원)</label>
              <input type="number" name="amount" value={formData.amount} onChange={handleInputChange} className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">결제 수단</label>
              <select name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="CORPORATE_CARD">법인카드</option><option value="TRANSFER">계좌이체</option><option value="PERSONAL_CARD">개인카드 (청구)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">지출 목적 (적요)</label>
              <input type="text" name="purpose" value={formData.purpose} onChange={handleInputChange} placeholder="예: 상담용 다과 구매" className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500" required />
            </div>
          </div>
          
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={isSubmitting} className={`flex-1 ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-extrabold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50`}>
              {isSubmitting ? <Loader className="animate-spin" size={24}/> : <CheckCircle size={24} />} 
              {editingId ? '지출결의서 수정 완료' : '지출결의서 실제 DB에 전송'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' }); }} className="bg-gray-100 text-gray-600 font-bold py-4 px-6 rounded-xl hover:bg-gray-200 transition-colors">
                수정 취소
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 mt-6">
        <h3 className="text-lg font-bold text-gray-800 mb-6 border-b pb-3 flex items-center gap-2"><List size={20} className="text-indigo-600"/> 나의 실제 제출 내역</h3>
        
        <div className="space-y-3">
          {expensesList.length === 0 ? (
             <p className="text-gray-400 font-bold text-center py-6">제출된 내역이 없습니다.</p>
          ) : (
            expensesList.map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border border-gray-200 rounded-xl bg-gray-50 hover:bg-white transition-colors shadow-sm gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600 bg-white px-2 py-1 border border-gray-200 rounded-md">{item.expenseDate}</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">{item.method}</span>
                  </div>
                  <strong className="text-lg text-gray-900 mt-1">{item.purpose}</strong>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-black text-gray-900">{item.amount.toLocaleString()}원</span>
                    {getStatusBadge(item.status)}
                  </div>
                  
                  {/* 상태가 PENDING(결재대기)일 때만 수정/삭제 버튼 노출 */}
                  {item.status === 'PENDING' && (
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => handleEdit(item)} className="text-xs font-bold flex items-center gap-1 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                        <Edit size={14}/> 수정
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="text-xs font-bold flex items-center gap-1 text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors">
                        <Trash2 size={14}/> 삭제
                      </button>
                    </div>
                  )}
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