import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Target, ChevronRight, Award, AlertCircle } from 'lucide-react';
import { Card, LoadingSpinner } from '../components/UI';

export default function StudentExamList({ currentUser }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMyExams = async () => {
      if (!currentUser?.name) return;
      
      try {
        const examsRef = collection(db, 'artifacts/imperial-clinic-v1/public/data/student_exam_diagnostics');
        const q = query(examsRef, where('studentName', '==', currentUser.name));
        
        const querySnapshot = await getDocs(q);
        const examList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // 최신순 정렬
        examList.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setExams(examList);
      } catch (err) {
        console.error("시험 데이터를 불러오는 중 에러 발생:", err);
        setError("시험 결과를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchMyExams();
  }, [currentUser]);

  if (loading) return <LoadingSpinner />;
  
  if (error) return (
    <div className="p-6 text-center text-red-500 bg-red-50 rounded-xl flex items-center justify-center gap-2">
      <AlertCircle /> {error}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-8 rounded-3xl shadow-lg flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Target size={32} /> 나의 스마트 진단 리포트
          </h1>
          <p className="opacity-90 text-lg">
            {currentUser.name} 학생의 누적된 시험 결과와 맞춤 솔루션을 확인하세요.
          </p>
        </div>
      </div>

      {exams.length === 0 ? (
        <Card className="text-center py-16">
          <Award size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-bold text-gray-700 mb-2">아직 등록된 시험 결과가 없습니다</h3>
          <p className="text-gray-500">담당 선생님이 진단 리포트를 등록하면 이곳에 나타납니다.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exams.map((exam) => (
            <div 
              key={exam.id} 
              onClick={() => navigate(`/report/${exam.id}`)}
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 cursor-pointer group active:scale-95 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {exam.examDocId.replace(/_/g, ' ')}
                  </h3>
                  <span className="bg-blue-50 text-blue-700 font-black px-3 py-1 rounded-lg text-lg">
                    {exam.score}점
                  </span>
                </div>
                <p className="text-gray-500 text-sm line-clamp-2 mb-4">
                  <span className="font-semibold text-gray-700">강사 코멘트:</span> {exam.instructorComment || "코멘트가 없습니다."}
                </p>
              </div>
              <div className="flex justify-end items-center text-blue-600 font-semibold text-sm gap-1 group-hover:gap-2 transition-all">
                상세 리포트 보기 <ChevronRight size={16} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}