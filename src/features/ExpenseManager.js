import React, { useState, useEffect } from 'react';
// import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { db, storage, auth } from '../firebase'; // 실제 연동 시 주석 해제

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

  // 임시 데이터 로드 (실제로는 Firebase onSnapshot 활용)
  useEffect(() => {
    // [효율성 감사] DB 호출 최적화: 현재 사용자의 '최근 1개월' 내역만 가져오도록 limit/where 활용 필수
    // const q = query(collection(db, "expenses"), where("userId", "==", auth.currentUser.uid), orderBy("createdAt", "desc"));
    // const unsubscribe = onSnapshot(q, (snapshot) => { ... });
    // return () => unsubscribe(); // 메모리 누수 방지

    // 퍼블리싱용 Mock 데이터
    setExpensesList([
      { id: '1', date: '2026-04-26', amount: 12000, method: '법인카드', purpose: '야근 식대', status: 'APPROVED' },
      { id: '2', date: '2026-04-27', amount: 35000, method: '계좌이체', purpose: '복사용지 구매', status: 'PENDING' }
    ]);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    // [보안 최우선] 확장자 검사로 악성 파일 업로드 방어
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

    // 유효성 검사 (방어적 코딩)
    if (!formData.expenseDate || !formData.amount || !formData.purpose || !receiptFile) {
      setErrorMsg('모든 항목을 입력하고 영수증을 첨부해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Firebase Storage에 영수증 업로드 (비동기)
      // const storageRef = ref(storage, `receipts/${auth.currentUser.uid}/${Date.now()}_${receiptFile.name}`);
      // await uploadBytes(storageRef, receiptFile);
      // const fileUrl = await getDownloadURL(storageRef);

      // 2. Firestore에 지출결의 데이터 생성
      // await addDoc(collection(db, 'expenses'), {
      //   userId: auth.currentUser.uid,
      //   userName: auth.currentUser.displayName, // RDB Join 방지용 반정규화
      //   expenseDate: formData.expenseDate,
      //   amount: Number(formData.amount),
      //   paymentMethod: formData.paymentMethod,
      //   purpose: formData.purpose,
      //   receiptUrl: fileUrl,
      //   status: 'PENDING',
      //   createdAt: serverTimestamp()
      // });

      alert('지출결의서가 성공적으로 제출되었습니다.');
      
      // 폼 초기화
      setFormData({ expenseDate: '', amount: '', paymentMethod: 'CORPORATE_CARD', purpose: '' });
      setReceiptFile(null);
      e.target.reset();

    } catch (error) {
      console.error('Submit Error:', error);
      setErrorMsg('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 상태값에 따른 뱃지 색상 렌더링
  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED': return <span className="status-badge approved">승인됨</span>;
      case 'REJECTED': return <span className="status-badge rejected">반려됨</span>;
      default: return <span className="status-badge pending">대기중</span>;
    }
  };

  return (
    <div className="expense-container">
      <header className="expense-header">
        <h2>영수증 제출 및 지출결의</h2>
        <p>법인카드 및 개인 지출 내역을 증빙과 함께 등록해주세요.</p>
      </header>

      {/* 지출결의 폼 */}
      <section className="expense-form-section">
        <form className="expense-form" onSubmit={handleSubmit}>
          {errorMsg && <div className="error-message">{errorMsg}</div>}

          <div className="form-group">
            <label htmlFor="expenseDate">결제 일자</label>
            <input type="date" id="expenseDate" name="expenseDate" value={formData.expenseDate} onChange={handleInputChange} required />
          </div>

          <div className="form-group">
            <label htmlFor="amount">결제 금액 (원)</label>
            <input type="number" id="amount" name="amount" min="1" value={formData.amount} onChange={handleInputChange} placeholder="예: 15000" required />
          </div>

          <div className="form-group">
            <label htmlFor="paymentMethod">결제 수단</label>
            <select id="paymentMethod" name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange}>
              <option value="CORPORATE_CARD">법인카드</option>
              <option value="PERSONAL_CARD">개인카드 (청구)</option>
              <option value="TRANSFER">계좌이체</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="purpose">지출 목적 (적요)</label>
            <input type="text" id="purpose" name="purpose" value={formData.purpose} onChange={handleInputChange} placeholder="예: 학부모 상담용 다과 구매" required />
          </div>

          <div className="form-group">
            <label htmlFor="receipt">영수증 첨부</label>
            <input type="file" id="receipt" accept="image/*,.pdf" onChange={handleFileChange} required />
            <small>※ 추후 OCR 자동 추출을 위해 글씨가 잘 보이게 촬영해주세요.</small>
          </div>

          <button type="submit" className="btn-submit" disabled={isSubmitting}>
            {isSubmitting ? '제출 중...' : '지출결의서 제출'}
          </button>
        </form>
      </section>

      {/* 나의 제출 내역 리스트 */}
      <section className="expense-history-section">
        <h3>나의 지출결의 내역</h3>
        <div className="expense-list">
          {expensesList.length === 0 ? (
            <p className="no-data">제출한 내역이 없습니다.</p>
          ) : (
            <ul className="history-list">
              {expensesList.map((item) => (
                <li key={item.id} className="history-item">
                  <div className="history-info">
                    <span className="history-date">{item.date}</span>
                    <strong className="history-purpose">{item.purpose}</strong>
                    <span className="history-method">{item.method}</span>
                  </div>
                  <div className="history-status">
                    <strong className="history-amount">{item.amount.toLocaleString()}원</strong>
                    {getStatusBadge(item.status)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};

export default ExpenseManager;