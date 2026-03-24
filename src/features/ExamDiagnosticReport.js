import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Target, TrendingUp, AlertTriangle, BookOpen, Award } from 'lucide-react';

/**
 * [서비스 가치(Service Value)] 
 * 학부모에게 내 아이의 현재 위치(예상 등급)와 취약점, 그리고 '어떻게 보완할 것인가(성장 플랜)'를
 * 한 장의 세련된 리포트로 제공하여, 학원에 대한 신뢰를 극대화하고 이탈률(Churn Rate)을 방어합니다.
 */
export default function ExamDiagnosticReport({ diagnosticId }) {
  const [data, setData] = useState({ diagnostic: null, exam: null });
  const [analysis, setAnalysis] = useState({ predictedGrade: '-', weakConcepts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReportData = async () => {
      if (!diagnosticId) return;
      try {
        // 1. 학생 진단 데이터 가져오기 (1회 읽기)
        const diagRef = doc(db, 'artifacts/imperial-clinic-v1/public/data/student_exam_diagnostics', diagnosticId);
        const diagSnap = await getDoc(diagRef);
        
        if (!diagSnap.exists()) throw new Error('진단 결과를 찾을 수 없습니다.');
        const diagData = diagSnap.data();

        // 2. 연결된 마스터 시험 데이터 가져오기 (1회 읽기)
        const examRef = doc(db, 'artifacts/imperial-clinic-v1/public/data/integrated_exams', diagData.examDocId);
        const examSnap = await getDoc(examRef);
        
        if (!examSnap.exists()) throw new Error('시험 마스터 데이터를 찾을 수 없습니다.');
        const examData = examSnap.data();

        setData({ diagnostic: diagData, exam: examData });

        // 3. 비즈니스 로직 연산 (Frontend Join)
        calculateAnalysis(diagData, examData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [diagnosticId]);

  // Frontend 연산 로직: 서버 연산을 줄여 비용을 최적화하고, 사용자 기기의 리소스를 활용
  const calculateAnalysis = (diag, exam) => {
    // 로직 1: 예상 등급 산출 (시간 복잡도: O(K), K는 등급 컷의 개수로 상수에 가까움)
    let predicted = '등급 외';
    // gradeCuts 예: {"1등급": 90, "2등급": 82, ...} -> 점수가 높은 순으로 정렬하여 비교
    const cuts = Object.entries(exam.gradeCuts || {}).sort((a, b) => b[1] - a[1]);
    for (let [grade, cutScore] of cuts) {
      if (diag.score >= cutScore) {
        predicted = grade;
        break;
      }
    }

    // 로직 2: 취약 단원 분석 (시간 복잡도: O(N), N은 틀린 문항 수)
    const conceptCounts = {};
    diag.wrongQuestionNumbers.forEach(num => {
      // 마스터 데이터에서 해당 문항 메타데이터 찾기
      const questionMeta = exam.questions?.find(q => q.number === num);
      if (questionMeta && questionMeta.concept) {
        conceptCounts[questionMeta.concept] = (conceptCounts[questionMeta.concept] || 0) + 1;
      }
    });

    // 빈도가 높은 순으로 정렬 (가장 많이 틀린 단원 추출)
    const sortedConcepts = Object.entries(conceptCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([concept, count]) => ({ concept, count }));

    setAnalysis({ predictedGrade: predicted, weakConcepts: sortedConcepts });
  };

  // 로딩 상태 (UX 심리학: 스켈레톤 UI나 깔끔한 스피너로 이탈 방지)
  if (loading) return <div className="p-10 text-center text-gray-500 animate-pulse">리포트를 생성 중입니다...</div>;
  if (error) return <div className="p-10 text-center text-red-500 font-bold">{error}</div>;
  if (!data.diagnostic) return null;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* Header Section */}
        <div className="bg-indigo-900 p-6 text-white text-center">
          <h1 className="text-3xl font-extrabold mb-2 tracking-tight">스마트 진단 & 성장 리포트</h1>
          <p className="text-indigo-200">{data.diagnostic.examDocId.replace(/_/g, ' ')}</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Top: Student Profile & Score */}
          <div className="flex flex-col md:flex-row justify-between items-center bg-indigo-50 p-6 rounded-xl border border-indigo-100">
            <div>
              <p className="text-gray-500 text-sm font-semibold mb-1">IMPERIAL STUDENT</p>
              <p className="text-2xl font-bold text-gray-900">{data.diagnostic.studentName} 학생</p>
            </div>
            <div className="flex gap-6 mt-4 md:mt-0 text-center">
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

          {/* Middle: Official Review */}
          <div className="bg-white">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3 border-b pb-2">
              <Target className="text-indigo-600" size={24} /> 학원 공식 총평
            </h3>
            <p className="text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg text-sm">
              {data.exam.review}
            </p>
          </div>

          {/* Bottom: Weakness Analysis */}
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3 border-b pb-2">
              <AlertTriangle className="text-orange-500" size={24} /> 취약 단원 분석
            </h3>
            {analysis.weakConcepts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {analysis.weakConcepts.map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-4 bg-orange-50 rounded-lg border border-orange-100">
                    <span className="font-semibold text-gray-800">{item.concept}</span>
                    <span className="px-3 py-1 bg-white text-orange-600 rounded-full text-sm font-bold shadow-sm">
                      {item.count}문항 오답
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic p-4 bg-gray-50 rounded-lg">오답 분석 결과가 없습니다. 훌륭합니다!</p>
            )}
          </div>

          {/* Bottom-most: 1:1 Solution (CTA & Reassurance) */}
          <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
            <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2 mb-4">
              <TrendingUp className="text-blue-600" size={24} /> 임페리얼 1:1 맞춤 솔루션
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <BookOpen className="text-blue-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-gray-800 mb-1">담당 강사 분석</p>
                  <p className="text-gray-700 text-sm leading-relaxed">{data.diagnostic.instructorComment}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 mt-4">
                <Award className="text-blue-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-gray-800 mb-1">성장 플랜</p>
                  <p className="text-gray-700 text-sm leading-relaxed font-bold text-blue-700">{data.diagnostic.growthPlan}</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}