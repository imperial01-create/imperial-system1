import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 
import { Receipt, UploadCloud, CheckCircle, FileText, Calendar, CreditCard, DollarSign, List, Clock, XCircle, AlertCircle, Loader, Edit, Trash2, Image as ImageIcon } from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

// 파일을 Base64 문자열로 변환하는 함수 (Storage 없이 DB에 직접 이미지를 저장하기 위한 꼼수)
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

const ExpenseManager = ({ currentUser }) => {
  const [formData, setFormData] = useState({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
  const [receiptFile, setReceiptFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expensesList, setExpensesList] = useState([]);
  
  // 수정 모드 및 이미지 뷰어 상태
  const [editingId, setEditingId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null); // 영수증 팝업 뷰어용

  useEffect(() => {
    if (!currentUser?.id) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), where('userId', '==', currentUser.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const realData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

    if (!editingId && !receiptFile) {
      setErrorMsg('모든 항목을 입력하고 증빙 영수증을 첨부해주세요.'); return;
    }
    if (!formData.expenseDate || !formData.amount || !formData.purpose) {
      setErrorMsg('모든 항목을 입력해주세요.'); return;
    }

    setIsSubmitting(true);
    try {
      const methodLabel = formData.paymentMethod === 'CORPORATE_CARD' ? '법인카드' : (formData.paymentMethod === 'TRANSFER' ? '계좌이체' : '개인카드');

      if (editingId) {
        const expRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', editingId);
        const updateData = {
          expenseDate: formData.expenseDate,
          amount: Number(formData.amount),
          method: methodLabel,
          purpose: formData.purpose,
          updatedAt: serverTimestamp()
        };
        // 🚀 새로운 파일을 올렸다면 Base64로 변환하여 덮어쓰기
        if (receiptFile) {
          updateData.receiptUrl = await fileToBase64(receiptFile); 
        }
        await updateDoc(expRef, updateData);
        alert('지출결의서가 성공적으로 수정되었습니다.');
      } else {
        // 🚀 신규 등록 시 업로드한 파일을 Base64로 변환
        const fileDataUrl = await fileToBase64(receiptFile);
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), {
          userId: currentUser.id,
          userName: currentUser.name,
          expenseDate: formData.expenseDate,
          amount: Number(formData.amount),
          method: methodLabel,
          purpose: formData.purpose,
          category: 'SUPPLIES', 
          receiptUrl: fileDataUrl, // 변환된 실제 이미지 데이터 저장
          status: 'PENDING',
          matchedTransactionId: null,
          createdAt: serverTimestamp()
        });
        alert('지출결의서가 등록되어 대표님 결재 대기열에 추가되었습니다.');
      }

      setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
      setReceiptFile(null);
      setEditingId(null);
    } catch (error) {
      setErrorMsg('DB 전송 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (exp) => {
    setFormData({
      expenseDate: exp.expenseDate,
      amount: exp.amount,
      paymentMethod: exp.method === '법인카드' ? 'CORPORATE_CARD' : (exp.method === '계좌이체' ? 'TRANSFER' : 'PERSONAL_CARD'),
      purpose: exp.purpose
    });
    setEditingId(exp.id);
    setReceiptFile(null); 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const handleDelete = async (id) => {
    if (window.confirm('정말 이 지출결의서를 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', id));
        alert('삭제되었습니다.');
        if (editingId === id) {
          setEditingId(null);
          setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
        }
      } catch (err) { alert('삭제 실패: ' + err.message); }
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'APPROVED') return <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full"><CheckCircle size={12}/> 승인완료</span>;
    if (status === 'REJECTED') return <span className="flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full"><XCircle size={12}/> 반려됨</span>;
    return <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full"><Clock size={12}/> 결재대기</span>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in relative">
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

          <div className="mt-4">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              영수증 첨부 {editingId ? <span className="text-gray-400 font-normal">(변경할 경우에만 새로 올려주세요)</span> : <span className="text-rose-500">(필수)</span>}
            </label>
            <label htmlFor="receipt-upload" className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${receiptFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {receiptFile ? (
                  <>
                    <CheckCircle className="text-emerald-500 mb-2" size={32} />
                    <p className="text-sm text-emerald-700 font-bold">{receiptFile.name}</p>
                    <p className="text-xs text-emerald-500 mt-1">클릭하여 다른 영수증으로 변경</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="text-gray-400 mb-2" size={32} />
                    <p className="text-sm text-gray-600 font-bold">클릭하여 영수증 이미지 촬영 또는 업로드</p>
                    <p className="text-xs text-gray-400 mt-1">지원 형식: JPG, PNG, PDF (최대 1MB 권장)</p>
                  </>
                )}
              </div>
              <input id="receipt-upload" type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
          
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={isSubmitting} className={`flex-1 ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-extrabold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50`}>
              {isSubmitting ? <Loader className="animate-spin" size={24}/> : <CheckCircle size={24} />} 
              {editingId ? '지출결의서 수정 완료' : '지출결의서 실제 DB에 전송'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' }); setReceiptFile(null); }} className="bg-gray-100 text-gray-600 font-bold py-4 px-6 rounded-xl hover:bg-gray-200 transition-colors">
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
                  {item.receiptUrl && (
                    <button onClick={() => setPreviewUrl(item.receiptUrl)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 font-semibold w-fit">
                      <ImageIcon size={14} /> 영수증 이미지 보기
                    </button>
                  )}
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-black text-gray-900">{item.amount.toLocaleString()}원</span>
                    {getStatusBadge(item.status)}
                  </div>
                  
                  {item.status === 'PENDING' && (
                    <div className="flex gap-2 mt-1">
                      <button onClick={() => handleEdit(item)} className="text-xs font-bold flex items-center gap-1 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"><Edit size={14}/> 수정</button>
                      <button onClick={() => handleDelete(item.id)} className="text-xs font-bold flex items-center gap-1 text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors"><Trash2 size={14}/> 삭제</button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 🚀 인앱 영수증 뷰어 모달 */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white p-4 rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="font-bold text-lg flex items-center gap-2"><ImageIcon className="text-blue-600"/> 증빙 자료 확인</h3>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-400 hover:text-gray-800 transition-colors"><XCircle size={28}/></button>
            </div>
            <div className="bg-gray-100 rounded-2xl overflow-hidden flex justify-center items-center flex-1 h-[65vh]">
              <iframe src={previewUrl} className="w-full h-full border-0" title="receipt-preview" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ExpenseManager;