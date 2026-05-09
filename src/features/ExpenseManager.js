import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 
import { 
  Receipt, UploadCloud, CheckCircle, FileText, Calendar, CreditCard, 
  DollarSign, List, Clock, XCircle, AlertCircle, Loader, Edit, Trash2, 
  Image as ImageIcon, AlertTriangle, PlusCircle, ChevronLeft, ChevronRight, FileSpreadsheet
} from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

// 🚀 프론트엔드 이미지 자동 압축 엔진 (기존 원본 유지)
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

// 🚀 세무사 공식 계정과목 매핑 테이블 (기존 원본 유지)
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
  
  // 🚀 다중 영수증 상태 관리
  const [previewUrls, setPreviewUrls] = useState([]);
  const [isCompressing, setIsCompressing] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [nlpWarning, setNlpWarning] = useState(null);
  const [expensesList, setExpensesList] = useState([]);
  
  const [editingId, setEditingId] = useState(null);
  
  // 🚀 다중 뷰어 상태
  const [previewReceipts, setPreviewReceipts] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);

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

  // 🚀 적요 기반 NLP 교차 검증 엔진 (기존 원본 유지)
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

  // 🚀 다중 파일 업로드 및 압축 핸들러
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // 이미지 파일 및 PDF 검증
    const validFiles = files.filter(f => ['image/jpeg', 'image/png', 'application/pdf'].includes(f.type));
    if (validFiles.length !== files.length) {
        setErrorMsg('이미지(JPG, PNG) 또는 PDF 파일만 업로드 가능합니다.');
    }

    if (previewUrls.length + validFiles.length > 5) {
      setErrorMsg("영수증은 최대 5장까지 첨부할 수 있습니다.");
      return;
    }

    setIsCompressing(true);
    setErrorMsg('');
    try {
      const compressedImages = [];
      for (let file of validFiles) {
        const base64 = await compressImageToBase64(file);
        compressedImages.push(base64);
      }
      setPreviewUrls(prev => [...prev, ...compressedImages]);
    } catch (error) {
      setErrorMsg(error.message || "이미지 처리 중 오류가 발생했습니다.");
    } finally {
      setIsCompressing(false);
    }
    e.target.value = ''; // 동일 파일 재선택 허용
  };

  const removeImage = (indexToRemove) => {
    setPreviewUrls(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!editingId && previewUrls.length === 0) { 
      setErrorMsg('증빙 영수증을 1장 이상 첨부해주세요.'); 
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
        
        // 🚀 수정 시 배열로 덮어쓰기 (과거 하위호환성을 위해 첫 번째 이미지는 receiptUrl에도 저장)
        if (previewUrls.length > 0) {
          updateData.receiptUrls = previewUrls;
          updateData.receiptUrl = previewUrls[0];
        } else {
          updateData.receiptUrls = [];
          updateData.receiptUrl = '';
        }

        await updateDoc(expRef, updateData);
        alert('지출결의서가 성공적으로 수정되었습니다.');
      } else {
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), {
          userId: currentUser.id, 
          userName: currentUser.name, 
          expenseDate: formData.expenseDate, 
          amount: Number(formData.amount), 
          method: methodLabel, 
          purpose: formData.purpose,
          category: finalTaxAccount, 
          receiptUrls: previewUrls,             // 🚀 배열 저장
          receiptUrl: previewUrls[0] || '',     // 🚀 하위 호환성용 메인 이미지
          status: 'PENDING', 
          matchedTransactionId: null, 
          createdAt: serverTimestamp()
        });
        alert('등록 완료! 대시보드로 전송되었습니다.');
      }

      setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '', uiCategory: 'MEAL_EMPLOYEE' });
      setPreviewUrls([]); 
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
    // 🚀 수정 모드 시 다중 영수증 로드
    setPreviewUrls(exp.receiptUrls?.length > 0 ? exp.receiptUrls : (exp.receiptUrl ? [exp.receiptUrl] : []));
    setNlpWarning(null);
    setErrorMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const handleDelete = async (id) => {
    if (window.confirm('정말 이 지출결의서를 삭제하시겠습니까?')) {
      try { 
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', id)); 
        alert('삭제되었습니다.'); 
        if (editingId === id) {
            setEditingId(null);
            setPreviewUrls([]);
            setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '', uiCategory: 'MEAL_EMPLOYEE' });
        }
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

          {/* 🚀 다중 영수증 업로드 영역 */}
          <div className="space-y-3 pt-4 border-t border-gray-100">
            <div className="flex justify-between items-end">
              <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <ImageIcon size={18} className="text-emerald-600"/> 영수증 첨부 
                <span className="text-xs font-normal text-gray-400">(최대 5장)</span>
              </label>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">{previewUrls.length}장 첨부됨</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* 업로드된 이미지 썸네일 */}
              {previewUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square bg-gray-100 rounded-2xl border-2 border-gray-200 overflow-hidden group">
                      {url.includes('application/pdf') ? (
                          <div className="w-full h-full flex flex-col items-center justify-center text-rose-500 bg-white">
                              <FileSpreadsheet size={32} />
                              <span className="text-[10px] font-bold mt-1">PDF 파일</span>
                          </div>
                      ) : (
                          <img src={url} alt={`receipt-${idx}`} className="w-full h-full object-cover" />
                      )}
                      <button type="button" onClick={() => removeImage(idx)} className="absolute top-2 right-2 bg-white/90 text-rose-500 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:scale-110 transition-all shadow-sm">
                          <XCircle size={20} />
                      </button>
                      {idx === 0 && <div className="absolute bottom-0 left-0 right-0 bg-emerald-600/80 text-white text-[10px] font-bold text-center py-1">대표 영수증</div>}
                  </div>
              ))}

              {/* 이미지 추가 버튼 (5장 미만일 때만 보임) */}
              {previewUrls.length < 5 && (
                  <label className="aspect-square bg-emerald-50/50 border-2 border-dashed border-emerald-200 rounded-2xl flex flex-col items-center justify-center text-emerald-600 hover:bg-emerald-50 hover:border-emerald-400 cursor-pointer transition-all group">
                      {isCompressing ? (
                          <Loader className="animate-spin text-emerald-400" size={32} />
                      ) : (
                          <>
                              <PlusCircle size={32} className="group-hover:scale-110 transition-transform mb-2" />
                              <span className="text-xs font-bold">사진 추가</span>
                          </>
                      )}
                      {/* multiple 속성으로 여러 파일 동시 선택 가능 */}
                      <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} className="hidden" disabled={isCompressing} />
                  </label>
              )}
            </div>
            <p className="text-[10px] text-gray-400 flex items-center gap-1"><AlertCircle size={12}/> 스마트폰으로 여러 장의 사진을 한 번에 선택하여 올릴 수 있습니다.</p>
          </div>
          
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={isSubmitting || isCompressing} className={`flex-1 ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-extrabold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors`}>
              {isSubmitting ? <Loader className="animate-spin" size={24}/> : <CheckCircle size={24} />} 
              {editingId ? '지출결의서 수정 완료' : '지출결의서 제출하기'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '', uiCategory: 'MEAL_EMPLOYEE' }); setPreviewUrls([]); setNlpWarning(null); setErrorMsg(''); }} className="bg-gray-100 text-gray-600 font-bold py-4 px-6 rounded-xl hover:bg-gray-200 transition-colors">
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
            expensesList.map((item) => {
              // 🚀 배열 호환성 처리
              const urls = item.receiptUrls?.length > 0 ? item.receiptUrls : (item.receiptUrl ? [item.receiptUrl] : []);
              
              return (
                <div key={item.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border border-gray-200 rounded-xl bg-gray-50 shadow-sm gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-600 bg-white px-2 py-1 border border-gray-200 rounded-md">{item.expenseDate}</span>
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-md">{item.category}</span>
                    </div>
                    <strong className="text-lg text-gray-900 mt-1">{item.purpose}</strong>
                    
                    {urls.length > 0 && (
                      <button onClick={() => { setPreviewReceipts(urls); setPreviewIndex(0); }} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 font-semibold w-fit transition-colors">
                        <ImageIcon size={14} /> 영수증 조회 {urls.length > 1 ? `(${urls.length}장)` : ''}
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
              );
            })
          )}
        </div>
      </div>

      {/* 🚀 다중 영수증 슬라이더 모달 (Viewer) */}
      {previewReceipts.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setPreviewReceipts([])}>
          <div className="bg-white p-5 rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 px-3 border-b pb-3">
              <h3 className="font-bold text-xl text-gray-900 flex items-center gap-2">
                <ImageIcon className="text-blue-600" size={24}/> 영수증 상세 확인
                {previewReceipts.length > 1 && <span className="text-sm font-bold text-blue-600 ml-2 bg-blue-100 px-2 py-0.5 rounded-full">({previewIndex + 1} / {previewReceipts.length})</span>}
              </h3>
              <button onClick={() => setPreviewReceipts([])} className="text-gray-500 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition-colors flex items-center gap-1 font-bold text-sm">
                닫기 <XCircle size={24}/>
              </button>
            </div>
            <div className="bg-gray-100/50 rounded-2xl overflow-hidden flex justify-between items-center flex-1 w-full h-full relative p-2 border border-gray-100">
              
              {/* 이전 장 보기 버튼 */}
              {previewReceipts.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); setPreviewIndex(prev => Math.max(0, prev - 1)); }} disabled={previewIndex === 0} className="absolute left-2 z-10 p-2 bg-white/90 rounded-full shadow-md hover:bg-white hover:scale-110 disabled:opacity-30 transition-all">
                      <ChevronLeft size={32} className="text-gray-800"/>
                  </button>
              )}

              <div className="w-full h-full flex justify-center items-center">
                  {String(previewReceipts[previewIndex]).startsWith('data:application/pdf') || String(previewReceipts[previewIndex]).endsWith('.pdf') ? (
                    <iframe src={previewReceipts[previewIndex]} className="w-full h-full border-0 rounded-xl" title="receipt-preview" />
                  ) : (
                    <img src={previewReceipts[previewIndex]} alt="Receipt Preview" className="max-w-full max-h-full object-contain drop-shadow-sm rounded-xl" />
                  )}
              </div>

              {/* 다음 장 보기 버튼 */}
              {previewReceipts.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); setPreviewIndex(prev => Math.min(previewReceipts.length - 1, prev + 1)); }} disabled={previewIndex === previewReceipts.length - 1} className="absolute right-2 z-10 p-2 bg-white/90 rounded-full shadow-md hover:bg-white hover:scale-110 disabled:opacity-30 transition-all">
                      <ChevronRight size={32} className="text-gray-800"/>
                  </button>
              )}
            </div>

            {/* 인디케이터 (점) */}
            {previewReceipts.length > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    {previewReceipts.map((_, idx) => (
                        <button key={idx} onClick={() => setPreviewIndex(idx)} className={`w-3 h-3 rounded-full transition-all ${previewIndex === idx ? 'bg-blue-600 scale-125' : 'bg-gray-300 hover:bg-gray-400'}`} />
                    ))}
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseManager;