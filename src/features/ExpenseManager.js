import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 
import { Receipt, UploadCloud, CheckCircle, FileText, Calendar, CreditCard, DollarSign, List, Clock, XCircle, AlertCircle, Loader, Edit, Trash2, Image as ImageIcon, AlertTriangle } from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

// 🚀 프론트엔드 이미지 자동 압축 엔진
const compressImageToBase64 = (file) => new Promise((resolve, reject) => {
  if (file.type === 'application/pdf') {
    if (file.size > 700 * 1024) return reject(new Error("PDF 파일은 700KB 이하만 업로드 가능합니다."));
    const reader = new FileReader(); 
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result); 
    reader.onerror = error => reject(error);
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image(); 
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) { 
        height *= MAX_WIDTH / width; 
        width = MAX_WIDTH; 
      }

      canvas.width = width; 
      canvas.height = height;
      const ctx = canvas.getContext('2d'); 
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => reject(new Error("이미지 처리 중 오류가 발생했습니다."));
  };
  reader.onerror = (err) => reject(err);
});

// 🚀 세무사 공식 계정과목 매핑 테이블
const CATEGORY_MAPPING = {
  'MEAL_EMPLOYEE': { label: '직원 회식 및 식대', taxAccount: '복리후생비' },
  'MEAL_CLIENT': { label: '학부모 상담 및 접대', taxAccount: '접대비' },
  'SNACK_STUDENT': { label: '학생 간식 및 행사', taxAccount: '소모품비' },
  'SUPPLIES': { label: '학원 비품 및 사무용품', taxAccount: '소모품비' },
  'PRINTING': { label: '교재 인쇄 및 복사', taxAccount: '도서인쇄비' },
  'MAINTENANCE': { label: '시설 유지보수 및 수리', taxAccount: '수선비' },
  'MARKETING': { label: '마케팅 및 광고홍보', taxAccount: '광고선전비' },
  'DELIVERY': { label: '퀵 및 택배 발송', taxAccount: '운반비' },
  'ETC': { label: '기타 지출', taxAccount: '미분류' }
};

const ExpenseManager = ({ currentUser }) => {
  const [formData, setFormData] = useState({ 
    expenseDate: '', 
    amount: '', 
    paymentMethod: 'CORPORATE_CARD', 
    purpose: '', 
    uiCategory: 'MEAL_EMPLOYEE' 
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [nlpWarning, setNlpWarning] = useState(null);
  const [expensesList, setExpensesList] = useState([]);
  
  const [editingId, setEditingId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    const q = query(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), 
      where('userId', '==', currentUser.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const realData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      realData.sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate));
      setExpensesList(realData);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 🚀 적요 기반 NLP 교차 검증 엔진
  useEffect(() => {
    if (!formData.purpose) { 
      setNlpWarning(null); 
      return; 
    }
    
    const text = formData.purpose.replace(/\s/g, ''); 
    
    if (text.includes('학부모') || text.includes('어머니') || text.includes('아버님') || text.includes('상담') || text.includes('접대')) {
      if (CATEGORY_MAPPING[formData.uiCategory].taxAccount !== '접대비') {
        setNlpWarning({ type: '접대비', msg: "⚠️ '학부모/상담' 관련 지출입니다. 세무법상 이는 '접대비'로 강제 분류되어 한도 관리를 받습니다." });
        return;
      }
    }
    else if (text.includes('학생') || text.includes('간식') || text.includes('피자') || text.includes('치킨') || text.includes('햄버거')) {
      if (CATEGORY_MAPPING[formData.uiCategory].taxAccount === '복리후생비' || CATEGORY_MAPPING[formData.uiCategory].taxAccount === '접대비') {
        setNlpWarning({ type: '소모품비', msg: "💡 학생들을 위한 지출은 '소모품비'로 세무 처리되는 것이 안전합니다." });
        return;
      }
    }
    setNlpWarning(null);
  }, [formData.purpose, formData.uiCategory]);

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
      setErrorMsg('증빙 영수증을 첨부해주세요.'); 
      return; 
    }
    if (!formData.expenseDate || !formData.amount || !formData.purpose) { 
      setErrorMsg('모든 항목을 입력해주세요.'); 
      return; 
    }

    setIsSubmitting(true);
    try {
      const methodLabel = formData.paymentMethod === 'CORPORATE_CARD' ? '법인카드' : (formData.paymentMethod === 'TRANSFER' ? '계좌이체' : '개인카드');
      
      let finalTaxAccount = CATEGORY_MAPPING[formData.uiCategory].taxAccount;
      if (nlpWarning) finalTaxAccount = nlpWarning.type;

      if (editingId) {
        const expRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', editingId);
        const updateData = { 
          expenseDate: formData.expenseDate, 
          amount: Number(formData.amount), 
          method: methodLabel, 
          purpose: formData.purpose, 
          category: finalTaxAccount, 
          updatedAt: serverTimestamp() 
        };
        
        if (receiptFile) {
          updateData.receiptUrl = await compressImageToBase64(receiptFile); 
        }
        await updateDoc(expRef, updateData);
        alert('지출결의서가 성공적으로 수정되었습니다.');
      } else {
        const compressedFileUrl = await compressImageToBase64(receiptFile);
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), {
          userId: currentUser.id, 
          userName: currentUser.name, 
          expenseDate: formData.expenseDate, 
          amount: Number(formData.amount), 
          method: methodLabel, 
          purpose: formData.purpose,
          category: finalTaxAccount, 
          receiptUrl: compressedFileUrl, 
          status: 'PENDING', 
          matchedTransactionId: null, 
          createdAt: serverTimestamp()
        });
        alert('등록 완료! 대시보드로 전송되었습니다.');
      }

      setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '', uiCategory: 'MEAL_EMPLOYEE' });
      setReceiptFile(null); 
      setEditingId(null); 
      setNlpWarning(null);
    } catch (error) { 
      setErrorMsg(error.message || 'DB 전송 중 오류가 발생했습니다.'); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleEdit = (exp) => {
    const reversedUiCategory = Object.keys(CATEGORY_MAPPING).find(key => CATEGORY_MAPPING[key].taxAccount === exp.category) || 'ETC';
    setFormData({
      expenseDate: exp.expenseDate, 
      amount: exp.amount, 
      paymentMethod: exp.method === '법인카드' ? 'CORPORATE_CARD' : (exp.method === '계좌이체' ? 'TRANSFER' : 'PERSONAL_CARD'),
      purpose: exp.purpose, 
      uiCategory: reversedUiCategory
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
        if (editingId === id) setEditingId(null); 
      } catch (err) { 
        alert('삭제 실패'); 
      }
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
        <p className="opacity-90 text-sm">지능형 텍스트 분석이 적용되어 자동으로 세무 계정이 매핑됩니다.</p>
      </div>

      <div className={`bg-white p-6 sm:p-8 rounded-2xl shadow-sm border ${editingId ? 'border-amber-400 ring-4 ring-amber-50' : 'border-gray-100'}`}>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6 border-b pb-3">
          <FileText className={editingId ? "text-amber-600" : "text-emerald-600"} size={20} /> 
          {editingId ? '지출 내역 수정 중...' : '지출 내역 작성'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {errorMsg && (
            <div className="bg-rose-50 text-rose-600 font-bold p-4 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle size={18} /> {errorMsg}
            </div>
          )}
          
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
                <option value="CORPORATE_CARD">법인카드</option>
                <option value="TRANSFER">계좌이체</option>
                <option value="PERSONAL_CARD">개인카드 (청구)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center justify-between">
                지출 성격 (일상 용어) 
                <span className="text-[10px] text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">자동 매핑됨</span>
              </label>
              <select name="uiCategory" value={formData.uiCategory} onChange={handleInputChange} className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-gray-800">
                {Object.keys(CATEGORY_MAPPING).map(key => (
                  <option key={key} value={key}>{CATEGORY_MAPPING[key].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">지출 목적 (상세 적요)</label>
            <input type="text" name="purpose" value={formData.purpose} onChange={handleInputChange} placeholder="예: 고1 기말고사 대비반 간식(피자)" className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-semibold" required />
            
            {nlpWarning && (
              <div className="mt-2 text-sm bg-rose-50 text-rose-700 border border-rose-200 p-3 rounded-lg flex items-start gap-2 animate-in slide-in-from-top-2">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" /> 
                <p className="font-semibold">{nlpWarning.msg}</p>
              </div>
            )}
          </div>

          <div className="mt-2">
            <label className="block text-sm font-bold text-gray-700 mb-2">
              영수증 첨부 {editingId ? <span className="text-gray-400 font-normal">(변경할 경우에만 새로 올려주세요)</span> : <span className="text-rose-500">(필수)</span>}
            </label>
            <label htmlFor="receipt-upload" className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${receiptFile ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {receiptFile ? (
                  <>
                    <CheckCircle className="text-emerald-500 mb-2" size={32} />
                    <p className="text-sm text-emerald-700 font-bold max-w-[200px] truncate">{receiptFile.name}</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="text-gray-400 mb-2" size={32} />
                    <p className="text-sm text-gray-600 font-bold">클릭하여 영수증 이미지 첨부</p>
                    <p className="text-xs text-gray-400 mt-1">자동 압축 처리됩니다.</p>
                  </>
                )}
              </div>
              <input id="receipt-upload" type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
          
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={isSubmitting} className={`flex-1 ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-extrabold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors`}>
              {isSubmitting ? <Loader className="animate-spin" size={24}/> : <CheckCircle size={24} />} 
              {editingId ? '지출결의서 수정 완료' : '지출결의서 제출하기'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '', uiCategory: 'MEAL_EMPLOYEE' }); setReceiptFile(null); setNlpWarning(null); }} className="bg-gray-100 text-gray-600 font-bold py-4 px-6 rounded-xl hover:bg-gray-200 transition-colors">
                수정 취소
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 mt-6">
        <h3 className="text-lg font-bold text-gray-800 mb-6 border-b pb-3 flex items-center gap-2">
          <List size={20} className="text-indigo-600"/> 나의 실제 제출 내역
        </h3>
        <div className="space-y-3">
          {expensesList.length === 0 ? (
            <p className="text-gray-400 font-bold text-center py-6">제출된 내역이 없습니다.</p>
          ) : (
            expensesList.map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border border-gray-200 rounded-xl bg-gray-50 shadow-sm gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600 bg-white px-2 py-1 border border-gray-200 rounded-md">{item.expenseDate}</span>
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-md">{item.category}</span>
                  </div>
                  <strong className="text-lg text-gray-900 mt-1">{item.purpose}</strong>
                  {item.receiptUrl && (
                    <button onClick={() => setPreviewUrl(item.receiptUrl)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 font-semibold w-fit transition-colors">
                      <ImageIcon size={14} /> 증빙 확인
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
                      <button onClick={() => handleEdit(item)} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">수정</button>
                      <button onClick={() => handleDelete(item.id)} className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition-colors">삭제</button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 🚀 풀스크린 영수증 뷰어 모달 */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewUrl(null)}>
          <div className="bg-white p-5 rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 px-3 border-b pb-3">
              <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                <ImageIcon className="text-blue-600" size={24}/> 영수증 상세 확인
              </h3>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-500 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition-colors flex items-center gap-1 font-bold text-sm">
                닫기 <XCircle size={24}/>
              </button>
            </div>
            <div className="bg-gray-100/50 rounded-2xl overflow-hidden flex justify-center items-center flex-1 w-full h-full relative p-2 border border-gray-100">
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
export default ExpenseManager;