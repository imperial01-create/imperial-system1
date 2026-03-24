import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Target, TrendingUp, AlertTriangle, BookOpen, Award, ArrowLeft } from 'lucide-react';

/**
 * [서비스 가치] 학부모가 직관적으로 아이의 성적표를 확인하고, 뒤로 가기 시 끊김 없이 
 * 자신의 시험 목록으로 돌아가도록 UX(사용자 경험)를 극대화했습니다.
 */
export default function ExamDiagnosticReport({ diagnosticId }) {
  const [data, setData] = useState({ diagnostic: null, exam: null });
  const [analysis, setAnalysis] = useState({ predictedGrade: '-', wrongQuestionsInfo: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchReportData = async () => {
      if (!diagnosticId) return;
      try {
        const diagRef = doc(db, 'artifacts/imperial-clinic-v1/public/data/student_exam_diagnostics', diagnosticId);
        const diagSnap = await getDoc(diagRef);
        if (!diagSnap.exists()) throw new Error('진단 결과를 찾을 수 없습니다.');
        const diagData = diagSnap.data();

        const examRef = doc(db, 'artifacts/imperial-clinic-v1/public/data/integrated_exams', diagData.examDocId);
        const examSnap = await getDoc(examRef);
        if (!examSnap.exists()) throw new Error('시험 마스터 데이터를 찾을 수 없습니다.');
        const examData = examSnap.data();

        setData({ diagnostic: diagData, exam: examData });
        calculateAnalysis(diagData, examData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchReportData();
  }, [diagnosticId]);

  const calculateAnalysis = (diag, exam) => {
    // 1. [요청 반영] 정교한 예상 등급 산출 로직
    let predicted = '4등급'; // 기본값 (3등급 미만)
    if (exam.gradeCuts) {
      const cut1 = exam.gradeCuts["1등급"] || 100;
      const cut2 = exam.gradeCuts["2등급"] || 100;
      const cut3 = exam.gradeCuts["3등급"] || 100;

      if (diag.score >= cut1) {
        predicted = '1등급';
      } else if (diag.score >= cut2) {
        predicted = '2등급';
      } else if (diag.score >= cut3) {
        predicted = '3등급';
      }
    }

    // 2. [요청 반영] 오답 문항 정보 매핑 (마스터 데이터의 questions 배열 활용)
    const wrongQs = [];
    if (exam.questions && diag.wrongQuestionNumbers) {
      diag.wrongQuestionNumbers.forEach(num => {
        const qInfo = exam.questions.find(q => q.number === num);
        if (qInfo) wrongQs.push(qInfo);
        else wrongQs.push({ number: num, concept: '정보 없음', difficulty: '-' });
      });
    }

    // 문항 번호순 정렬
    wrongQs.sort((a, b) => a.number - b.number);

    setAnalysis({ predictedGrade: predicted, wrongQuestionsInfo: wrongQs });
  };

  if (loading) return <div className="p-10 text-center text-gray-500 animate-pulse">리포트를 생성 중입니다...</div>;
  if (error) return <div className="p-10 text-center text-red-500 font-bold">{error}</div>;
  if (!data.diagnostic) return null;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      
      {/* [요청 반영] 강력한 네비게이션 복귀 버튼 */}
      <button 
        onClick={() => navigate('/my-exams')} 
        className="mb-6 flex items-center gap-2 text-indigo-700 hover:text-indigo-900 font-bold bg-indigo-100 hover:bg-indigo-200 px-4 py-2 rounded-xl transition-all w-fit"
      >
        <ArrowLeft size={20} /> 나의 시험 결과 목록으로 가기
      </button>

      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-indigo-900 p-6 text-white text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-2 tracking-tight">스마트 진단 & 성장 리포트</h1>
          <p className="text-indigo-200">{data.diagnostic.examDocId.replace(/_/g, ' ')}</p>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          {/* 상단: 점수 및 등급 */}
          <div className="flex flex-col md:flex-row justify-between items-center bg-indigo-50 p-6 rounded-xl border border-indigo-100">
            <div className="text-center md:text-left mb-4 md:mb-0">
              <p className="text-gray-500 text-sm font-semibold mb-1">IMPERIAL STUDENT</p>
              <p className="text-2xl font-bold text-gray-900">{data.diagnostic.studentName} 학생</p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-gray-500 text-sm mb-1">획득 점수</p>
                <p className="text-3xl font-black text-indigo-700">{data.diagnostic.score}<span className="text-lg text-gray-500 font-normal"> 점</span></p>
              </div>
              <div className="w-px bg-gray-300"></div>
              <div>
                <p className="text-gray-500 text-sm mb-1">예상 등급</p>
                <p className="text-3xl font-black text-red-500">{analysis.predictedGrade}</p>
              </div>
            </div>
          </div>

          {/* 중단: 학원 총평 */}
          <div className="bg-white">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3 border-b pb-2">
              <Target className="text-indigo-600" size={24} /> 학원 공식 총평
            </h3>
            <p className="text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg text-sm">
              {data.exam.review || "등록된 총평이 없습니다."}
            </p>
          </div>

          {/* 하단: [요청 반영] 오답 문항 확인 */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3 border-b pb-2">
              <AlertTriangle className="text-orange-500" size={24} /> 오답 문항 분석
            </h3>
            {analysis.wrongQuestionsInfo.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.wrongQuestionsInfo.map((q, idx) => (
                  <div key={idx} className="flex flex-col p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-black text-orange-700">{q.number}번 문항</span>
                      <span className="text-xs font-bold px-2 py-0.5 bg-white text-gray-600 rounded shadow-sm">
                        난이도: {q.difficulty}
                      </span>
                    </div>
                    <span className="text-sm text-gray-700 font-medium">{q.concept}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center font-bold">🎉 오답이 없습니다. 완벽합니다!</p>
            )}
          </div>

          {/* 최하단: 맞춤 솔루션 */}
          <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
            <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2 mb-4">
              <TrendingUp className="text-blue-600" size={24} /> 담당 선생님 1:1 맞춤 코멘트
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <BookOpen className="text-blue-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-gray-800 mb-1">학습 분석</p>
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{data.diagnostic.instructorComment}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 mt-4">
                <Award className="text-blue-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-gray-800 mb-1">성장 플랜</p>
                  <p className="text-gray-700 text-sm leading-relaxed font-bold text-blue-700 whitespace-pre-wrap">{data.diagnostic.growthPlan}</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}