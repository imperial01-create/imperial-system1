import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Target, AlertCircle, TrendingUp, ChevronRight, MessageSquare } from 'lucide-react';
import { LoadingSpinner } from '../components/UI';
// 🚀 [신규] 차트 라이브러리 임포트 (npm install recharts 필수)
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * [서비스 가치] 학부모에게 성적 상승 곡선을 시각적으로 증명하여, 
 * 학원의 교육 시스템에 대한 강한 신뢰를 형성하고 장기 등록을 유도합니다.
 */
export default function StudentExamList({ currentUser }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMyExamsAndMaster = async () => {
      if (!currentUser?.name) return;
      
      try {
        // 1. 학생의 진단 데이터 불러오기
        const diagRef = collection(db, 'artifacts/imperial-clinic-v1/public/data/student_exam_diagnostics');
        const q = query(diagRef, where('studentName', '==', currentUser.name));
        const snap = await getDocs(q);
        
        let diagList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 최신순 정렬 후 최근 5회만 추출
        diagList.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        const recent5Exams = diagList.slice(0, 5);

        // 2. 표에 난이도와 총평을 표시하기 위해 마스터 데이터(integrated_exams) 조인
        const enrichedExams = await Promise.all(recent5Exams.map(async (diag) => {
          const masterRef = doc(db, 'artifacts/imperial-clinic-v1/public/data/integrated_exams', diag.examDocId);
          const masterSnap = await getDoc(masterRef);
          const masterData = masterSnap.exists() ? masterSnap.data() : {};
          
          // 등급컷 계산
          let grade = '4등급';
          if (masterData.gradeCuts) {
            const c1 = masterData.gradeCuts['1등급'] || 100;
            const c2 = masterData.gradeCuts['2등급'] || 100;
            const c3 = masterData.gradeCuts['3등급'] || 100;
            if(diag.score >= c1) grade = '1등급';
            else if(diag.score >= c2) grade = '2등급';
            else if(diag.score >= c3) grade = '3등급';
          }

          // 날짜 포맷 (createdAt이 있으면 사용, 없으면 임시 텍스트)
          const dateStr = diag.createdAt ? 
            diag.createdAt.toDate().toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit'}) 
            : '최근';

          return {
            ...diag,
            date: dateStr,
            difficulty: masterData.difficulty || '-',
            review: masterData.review || '총평 없음',
            predictedGrade: grade
          };
        }));

        setExams(enrichedExams);
      } catch (err) {
        console.error(err);
        setError("데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchMyExamsAndMaster();
  }, [currentUser]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-500 bg-red-50 rounded-xl"><AlertCircle className="mx-auto mb-2"/>{error}</div>;

  // 그래프용 데이터: 과거부터 최신순으로 그려야 하므로 배열을 역순(Reverse) 처리
  const chartData = [...exams].reverse().map((exam, index) => {
    // X축 라벨을 짧게 만들기 위해 examDocId 파싱 (예: 2024_목동고_1학년_수학 -> 수학)
    const nameParts = exam.examDocId.split('_');
    const shortName = nameParts.length > 3 ? `${nameParts[1]} ${nameParts[nameParts.length-1]}` : `시험${index+1}`;
    return { name: shortName, 점수: exam.score, 풀네임: exam.examDocId.replace(/_/g, ' ') };
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in pb-12">
      
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-700 to-blue-600 text-white p-8 rounded-3xl shadow-lg">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Target size={32} /> 나의 시험 결과 대시보드
        </h1>
        <p className="opacity-90 text-lg">
          {currentUser.name} 학생의 최근 5회 성적 추이와 선생님의 맞춤 코멘트를 확인하세요.
        </p>
      </div>

      {exams.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-xl font-bold text-gray-700 mb-2">등록된 시험 결과가 없습니다</h3>
          <p className="text-gray-500">담당 선생님이 리포트를 등록하면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* 섹션 1: 최근 성적 추이 그래프 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-6">
              <TrendingUp className="text-blue-600" /> 최근 성적 추이 (최대 5회)
            </h2>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value) => [`${value}점`, '획득 점수']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.풀네임 || label}
                  />
                  <Line type="monotone" dataKey="점수" stroke="#4F46E5" strokeWidth={4} dot={{ r: 6, fill: '#4F46E5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 섹션 2: 최근 5회 시험 요약 표 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <h2 className="text-xl font-bold text-gray-800 p-6 border-b border-gray-100 bg-gray-50/50">
              시험 기록 및 상세 리포트
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                    <th className="p-4 font-bold whitespace-nowrap">응시일</th>
                    <th className="p-4 font-bold min-w-[200px]">시험명</th>
                    <th className="p-4 font-bold">난이도</th>
                    <th className="p-4 font-bold text-center">점수</th>
                    <th className="p-4 font-bold text-center">예상 등급</th>
                    <th className="p-4 font-bold">학원 총평 요약</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {exams.map((exam) => (
                    <tr 
                      key={exam.id} 
                      onClick={() => navigate(`/report/${exam.id}`)}
                      className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                    >
                      <td className="p-4 text-sm text-gray-500">{exam.date}</td>
                      <td className="p-4 font-bold text-gray-900 group-hover:text-blue-600 flex items-center gap-2">
                        {exam.examDocId.replace(/_/g, ' ')} <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                      </td>
                      <td className="p-4 text-sm text-gray-700">{exam.difficulty}</td>
                      <td className="p-4 text-center font-black text-indigo-600">{exam.score}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${exam.predictedGrade === '1등급' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {exam.predictedGrade}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-600 truncate max-w-[200px]">
                        {exam.review}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-blue-50/50 text-center text-sm text-blue-600 font-semibold border-t border-gray-100">
              💡 행을 클릭하면 상세 진단 리포트(오답 문항 확인)를 볼 수 있습니다.
            </div>
          </div>

          {/* 섹션 3: 시험별 선생님 코멘트 및 성장 플랜 */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 ml-2">
              <MessageSquare className="text-indigo-600" /> 선생님 1:1 코멘트 보드
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exams.map((exam) => (
                <div key={`comment-${exam.id}`} className="bg-white p-5 rounded-2xl shadow-sm border border-l-4 border-gray-100 border-l-indigo-500 hover:shadow-md transition-shadow">
                  <div className="text-xs font-bold text-gray-400 mb-1">{exam.date}</div>
                  <h3 className="font-bold text-gray-900 mb-3 truncate">{exam.examDocId.replace(/_/g, ' ')}</h3>
                  
                  <div className="mb-3">
                    <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded mb-1 inline-block">강사 코멘트</span>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{exam.instructorComment || "코멘트 없음"}</p>
                  </div>
                  
                  <div className="pt-3 border-t border-gray-100">
                    <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded mb-1 inline-block">성장 플랜</span>
                    <p className="text-sm text-gray-800 font-semibold leading-relaxed whitespace-pre-wrap">{exam.growthPlan || "플랜 없음"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}