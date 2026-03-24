import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase'; // Firebase 초기화 객체
import { Save, AlertCircle, CheckCircle } from 'lucide-react';

/**
 * [서비스 가치(Service Value)] 
 * 강사가 시험 결과를 입력하는 시간을 학생 1명당 3분에서 30초로 단축시킵니다.
 * 절약된 시간은 오직 '학생과의 상담'과 '수업 연구'에 투자되어 교육의 질을 높입니다.
 */
export default function ExamDiagnosticInput({ currentUser }) {
  const [exams, setExams] = useState([]);
  const [formData, setFormData] = useState({
    examDocId: '',
    studentId: '',
    studentName: '',
    score: '',
    wrongQuestionNumbers: '', // 콤마로 구분된 문자열로 받음
    instructorComment: '',
    growthPlan: ''
  });
  const [status, setStatus] = useState({ loading: false, error: null, success: false });

  // 마스터 시험 데이터 불러오기 (최적화: 컴포넌트 마운트 시 1회만 호출)
  useEffect(() => {
    const fetchExams = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'artifacts/imperial-clinic-v1/public/data/integrated_exams'));
        const examList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setExams(examList);
      } catch (error) {
        setStatus(prev => ({ ...prev, error: '시험 목록을 불러오는 데 실패했습니다.' }));
      }
    };
    fetchExams();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, error: null, success: false });

    // 방어적 코딩: 유효성 검사 (Validation)
    if (!formData.examDocId || !formData.studentName || !formData.score) {
      setStatus({ loading: false, error: '필수 항목(시험, 이름, 점수)을 모두 입력해주세요.', success: false });
      return;
    }

    try {
      // 문자열로 입력된 오답 번호를 숫자 배열로 파싱 및 공백 제거
      const wrongNumbersArray = formData.wrongQuestionNumbers
        .split(',')
        .map(num => parseInt(num.trim(), 10))
        .filter(num => !isNaN(num));

      const payload = {
        ...formData,
        score: Number(formData.score),
        wrongQuestionNumbers: wrongNumbersArray,
        instructorId: currentUser?.uid || 'unknown',
        createdAt: serverTimestamp()
      };

      // 파이어베이스 저장 (비용 효율화: onSnapshot 대신 addDoc 1회 수행)
      await addDoc(collection(db, 'artifacts/imperial-clinic-v1/public/data/student_exam_diagnostics'), payload);
      
      setStatus({ loading: false, error: null, success: true });
      // 폼 초기화
      setFormData({ ...formData, studentName: '', studentId: '', score: '', wrongQuestionNumbers: '', instructorComment: '', growthPlan: '' });
      
      // 3초 후 성공 메시지 제거
      setTimeout(() => setStatus(prev => ({ ...prev, success: false })), 3000);
    } catch (error) {
      console.error("Error adding document: ", error);
      setStatus({ loading: false, error: '저장 중 오류가 발생했습니다. 다시 시도해주세요.', success: false });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">시험 진단 결과 입력 (강사용)</h2>
      
      {status.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center gap-2">
          <AlertCircle size={20} />
          <span>{status.error}</span>
        </div>
      )}
      
      {status.success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center gap-2">
          <CheckCircle size={20} />
          <span>성공적으로 저장되었습니다! 학생 리포트가 즉시 생성됩니다.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">대상 시험 (마스터 데이터) *</label>
          <select 
            name="examDocId" 
            value={formData.examDocId} 
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">시험을 선택하세요</option>
            {exams.map(exam => (
              <option key={exam.id} value={exam.id}>{exam.id.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">학생 이름 *</label>
            <input 
              type="text" name="studentName" value={formData.studentName} onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500" placeholder="예: 홍길동"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">학생 ID</label>
            <input 
              type="text" name="studentId" value={formData.studentId} onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500" placeholder="선택사항"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">획득 총점 *</label>
            <input 
              type="number" name="score" value={formData.score} onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500" placeholder="예: 85"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">틀린 문항 번호 (콤마로 구분)</label>
            <input 
              type="text" name="wrongQuestionNumbers" value={formData.wrongQuestionNumbers} onChange={handleChange}
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500" placeholder="예: 3, 14, 21"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">담당 강사 분석 코멘트 (1:1 맞춤)</label>
          <textarea 
            name="instructorComment" value={formData.instructorComment} onChange={handleChange} rows="3"
            className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500" placeholder="학생의 강/약점을 분석해주세요."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">성장 플랜 (솔루션 제안)</label>
          <textarea 
            name="growthPlan" value={formData.growthPlan} onChange={handleChange} rows="2"
            className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500" placeholder="예: 주말 클리닉 서술형 20제 추가 풀이"
          />
        </div>

        <button 
          type="submit" 
          disabled={status.loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md transition duration-200 flex items-center justify-center gap-2 disabled:bg-blue-300"
        >
          {status.loading ? '저장 중...' : <><Save size={20} /> 진단 결과 저장 및 리포트 생성</>}
        </button>
      </form>
    </div>
  );
}