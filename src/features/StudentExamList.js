/* 학생·학부모가 보는 시험 결과 목록

   [무엇이 고쳐졌나]
   1. 조회 키가 이름이었습니다. 학부모가 들어오면 '학부모 본인 이름'으로 성적을 찾아
      언제나 0건이었고, 동명이인이 있으면 남의 성적이 섞였습니다. 이제 studentId 로 찾습니다.
   2. 학부모에게 자녀 선택이 없었습니다. 추가했습니다.
   3. 시험 마스터 문서 번호(examDocId)가 반드시 있다고 가정했습니다.
      개념테스트·모의고사는 마스터가 없어서 화면 전체가 오류로 죽었습니다.
      이제 없는 것이 정상이고, 있을 때만 등급컷·총평을 덧붙입니다.
   4. 점수를 100점 만점으로 가정했습니다. 이제 만점(maxScore)을 함께 씁니다.
*/

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Target, AlertCircle, TrendingUp, ChevronRight, MessageSquare, Calendar, Users } from 'lucide-react';
import { LoadingSpinner } from '../components/UI';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useData } from '../contexts/DataContext';
import { APP_ID } from '../constants';

const DIAG_PATH = `artifacts/${APP_ID}/public/data/student_exam_diagnostics`;
const EXAM_PATH = `artifacts/${APP_ID}/public/data/integrated_exams`;

const maxOf = (rec) => {
  const m = Number(rec?.maxScore);
  return Number.isFinite(m) && m > 0 ? m : 100;
};

const percentOf = (rec) => {
  const s = Number(rec?.score);
  if (!Number.isFinite(s)) return 0;
  return Math.round((s / maxOf(rec)) * 1000) / 10;
};

/** 등급컷은 학교 내신 마스터가 있을 때만 계산합니다. 없으면 표시하지 않습니다. */
const predictGrade = (rec, master) => {
  const cuts = master?.gradeCuts;
  if (!cuts) return null;
  const score = Number(rec.score || 0);
  const pick = (k) => Number(cuts[k]);
  for (const [key, label] of [['1등급', '1등급'], ['2등급', '2등급'], ['3등급', '3등급']]) {
    const cut = pick(key);
    if (Number.isFinite(cut) && score >= cut) return label;
  }
  return '4등급 이하';
};

export default function StudentExamList({ currentUser }) {
  const { users } = useData();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isParent = currentUser?.role === 'parent';

  const linkedChildren = useMemo(() => {
    if (!isParent) return [];
    const ids = Array.isArray(currentUser?.linkedChildrenIds) ? currentUser.linkedChildrenIds : [];
    return (users || []).filter(u => u?.role === 'student' && ids.includes(u.id));
  }, [isParent, users, currentUser]);

  const [selectedChildId, setSelectedChildId] = useState('');
  useEffect(() => {
    if (isParent && !selectedChildId && linkedChildren.length > 0) {
      setSelectedChildId(linkedChildren[0].id);
    }
  }, [isParent, linkedChildren, selectedChildId]);

  const targetId = isParent ? selectedChildId : currentUser?.id;
  const targetName = isParent
    ? (linkedChildren.find(c => c.id === selectedChildId)?.name || '자녀')
    : currentUser?.name;

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!targetId) { setLoading(false); return; }
      setLoading(true);
      setError(null);

      try {
        /* studentId 로만 좁힙니다. orderBy 를 함께 걸면 복합 색인이 필요하고,
           색인이 없으면 조회가 통째로 실패합니다. 정렬은 받아서 합니다. */
        const snap = await getDocs(query(collection(db, DIAG_PATH), where('studentId', '==', targetId)));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        const recent = list.slice(0, 5);

        /* 시험 마스터는 학교 내신에만 있습니다. 같은 시험을 여러 명이 봤어도
           문서는 하나뿐이므로 중복을 걷어내고 한 번씩만 읽습니다. */
        const masterIds = [...new Set(recent.map(r => r.examDocId).filter(Boolean))];
        const masters = {};
        await Promise.all(masterIds.map(async (id) => {
          try {
            const s = await getDoc(doc(db, EXAM_PATH, id));
            if (s.exists()) masters[id] = s.data();
          } catch (e) {
            // 마스터를 못 읽어도 성적 자체는 보여줍니다.
            console.warn('[시험 결과] 마스터 조회 실패:', id, e?.code);
          }
        }));

        const enriched = recent.map(rec => {
          const master = rec.examDocId ? masters[rec.examDocId] : null;
          return {
            ...rec,
            master,
            max: maxOf(rec),
            percent: percentOf(rec),
            predictedGrade: predictGrade(rec, master),
            difficulty: master?.difficulty || null,
            review: master?.review || null,
            dateStr: rec.createdAt?.toDate
              ? rec.createdAt.toDate().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
              : '최근'
          };
        });

        if (alive) setExams(enriched);
      } catch (err) {
        console.error('[시험 결과] 조회 실패:', err);
        if (alive) {
          setError(err?.code === 'permission-denied'
            ? '성적을 볼 권한이 없습니다. 학원에 문의해주세요.'
            : '데이터를 불러오지 못했습니다.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    run();
    return () => { alive = false; };
  }, [targetId]);

  const chartData = useMemo(
    () => [...exams].reverse().map((e, i) => ({
      name: (e.examTitle || `시험${i + 1}`).replace(/^\[[^\]]*\]\s*/, '').slice(0, 10),
      비율: e.percent,
      원점수: `${e.score} / ${e.max}점`,
      풀네임: e.examTitle || '시험'
    })),
    [exams]
  );

  if (loading) return <LoadingSpinner />;

  if (isParent && linkedChildren.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Users className="mx-auto mb-3 text-gray-300" size={40} />
          <h3 className="text-xl font-bold text-gray-700 mb-2">연결된 자녀가 없습니다</h3>
          <p className="text-gray-500 text-sm">학원에 자녀 계정 연결을 요청해주세요.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-500 bg-red-50 rounded-xl max-w-2xl mx-auto">
        <AlertCircle className="mx-auto mb-2" />{error}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in pb-12 px-2 md:px-0">

      <div className="bg-gradient-to-r from-indigo-700 to-blue-600 text-white p-6 md:p-8 rounded-3xl shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3">
          <Target size={32} className="shrink-0" /> 나의 시험 결과 대시보드
        </h1>
        <p className="opacity-90 text-sm md:text-lg">
          {targetName} 학생의 최근 5회 성적과 선생님의 맞춤 코멘트를 확인하세요.
        </p>
      </div>

      {/* 자녀가 둘 이상인 학부모용 선택기 */}
      {isParent && linkedChildren.length > 1 && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <label className="block text-xs font-black text-gray-500 uppercase mb-2">자녀 선택</label>
          <div className="flex flex-wrap gap-2">
            {linkedChildren.map(c => (
              <button
                key={c.id} type="button" onClick={() => setSelectedChildId(c.id)}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm border transition-colors ${
                  c.id === selectedChildId
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {exams.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-xl font-bold text-gray-700 mb-2">등록된 시험 결과가 없습니다</h3>
          <p className="text-gray-500">담당 선생님이 리포트를 등록하면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <>
          <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2 mb-1">
              <TrendingUp className="text-blue-600" /> 최근 성적 추이 (최대 5회)
            </h2>
            {/* 시험마다 만점이 다르므로 원점수를 그대로 이으면 오르내림이 뜻을 잃습니다. */}
            <p className="text-xs font-bold text-gray-400 mb-5">만점 대비 비율(%)로 그렸습니다. 원점수는 아래 표에 있습니다.</p>
            <div className="h-[250px] md:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} dy={10} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value, _n, item) => [`${value}% (${item?.payload?.원점수})`, '성취도']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.풀네임 || label}
                  />
                  <Line type="monotone" dataKey="비율" stroke="#4F46E5" strokeWidth={3} dot={{ r: 5, fill: '#4F46E5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 p-5 md:p-6 border-b border-gray-100 bg-gray-50/50">
              시험 기록 및 상세 리포트
            </h2>

            <div className="hidden md:block overflow-x-auto">
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
                    <tr key={exam.id} onClick={() => navigate(`/report/${exam.id}`)} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                      <td className="p-4 text-sm text-gray-500 whitespace-nowrap">{exam.dateStr}</td>
                      <td className="p-4 font-bold text-gray-900 group-hover:text-blue-600">
                        <span className="flex items-center gap-2">
                          {exam.examTitle || '(제목 없음)'}
                          <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity shrink-0" />
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-700">{exam.difficulty || '-'}</td>
                      <td className="p-4 text-center font-black text-indigo-600 whitespace-nowrap">
                        {exam.score}<span className="text-gray-400 font-bold text-sm"> / {exam.max}</span>
                      </td>
                      <td className="p-4 text-center">
                        {exam.predictedGrade ? (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${exam.predictedGrade === '1등급' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                            {exam.predictedGrade}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-bold">-</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-gray-600 truncate max-w-[200px]">{exam.review || '총평 없음'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden flex flex-col divide-y divide-gray-100">
              {exams.map((exam) => (
                <div key={exam.id} onClick={() => navigate(`/report/${exam.id}`)} className="p-4 hover:bg-blue-50/50 cursor-pointer transition-colors active:bg-blue-100">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-gray-400 flex items-center gap-1 mb-1"><Calendar size={12} />{exam.dateStr}</span>
                      <span className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{exam.examTitle || '(제목 없음)'}</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-2">
                      <span className="font-black text-indigo-600 text-lg whitespace-nowrap">{exam.score}<span className="text-gray-400 text-sm"> / {exam.max}</span></span>
                      {exam.predictedGrade && (
                        <span className={`px-2 py-0.5 mt-1 rounded text-[10px] font-bold ${exam.predictedGrade === '1등급' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {exam.predictedGrade}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 flex items-center justify-between mt-3">
                    <span className="truncate mr-2 max-w-[80%]">총평: {exam.review || '없음'}</span>
                    <span className="text-blue-500 font-bold flex items-center shrink-0">상세 <ChevronRight size={14} /></span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-blue-50/50 text-center text-xs md:text-sm text-blue-600 font-semibold border-t border-gray-100">
              💡 <span className="hidden md:inline">행을 클릭하면</span><span className="md:hidden">목록을 터치하면</span> 상세 진단 리포트(오답 문항)를 볼 수 있습니다.
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2 ml-1 md:ml-2">
              <MessageSquare className="text-indigo-600" /> 선생님 1:1 코멘트 보드
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exams.map((exam) => (
                <div key={`comment-${exam.id}`} className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-l-4 border-gray-100 border-l-indigo-500 hover:shadow-md transition-shadow">
                  <div className="text-xs font-bold text-gray-400 mb-1">{exam.dateStr}</div>
                  <h3 className="font-bold text-gray-900 text-sm md:text-base mb-3 truncate">{exam.examTitle || '(제목 없음)'}</h3>

                  <div className="mb-3">
                    <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded mb-1 inline-block">강사 코멘트</span>
                    <p className="text-xs md:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{exam.instructorComment || '코멘트 없음'}</p>
                  </div>

                  <div className="pt-3 border-t border-gray-100">
                    <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded mb-1 inline-block">성장 플랜</span>
                    <p className="text-xs md:text-sm text-gray-800 font-semibold leading-relaxed whitespace-pre-wrap">{exam.growthPlan || '플랜 없음'}</p>
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
