/* 학생·학부모가 보는 상세 진단 리포트

   [무엇이 고쳐졌나]
   1. 시험 마스터(integrated_exams)가 반드시 있다고 가정했습니다.
      개념테스트·모의고사는 마스터가 없어서 화면이 통째로 오류였고,
      게다가 오류 원문(자바스크립트 메시지)이 학부모에게 그대로 노출됐습니다.
   2. 점수를 100점 만점으로 가정했습니다. 이제 만점(maxScore)을 함께 씁니다.
   3. 오답 분석이 마스터의 questions 에만 의존했습니다.
      이제 기록 자신이 가진 responses(문항별 정오·배점)를 먼저 씁니다.
*/

import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { Target, TrendingUp, AlertTriangle, BookOpen, Award, ArrowLeft } from 'lucide-react';
import { getDynamicSubjectLabel } from '../utils/subjectMapper';
import { APP_ID } from '../constants';

const DIAG_PATH = `artifacts/${APP_ID}/public/data/student_exam_diagnostics`;
const EXAM_PATH = `artifacts/${APP_ID}/public/data/integrated_exams`;

const maxOf = (rec) => {
  const m = Number(rec?.maxScore);
  return Number.isFinite(m) && m > 0 ? m : 100;
};

/** 등급컷은 학교 내신 마스터가 있을 때만. 없으면 아예 표시하지 않습니다. */
const predictGrade = (diag, exam) => {
  const cuts = exam?.gradeCuts;
  if (!cuts) return null;
  const score = Number(diag.score || 0);
  for (const key of ['1등급', '2등급', '3등급']) {
    const cut = Number(cuts[key]);
    if (Number.isFinite(cut) && score >= cut) return key;
  }
  return '4등급 이하';
};

/* 오답 문항 목록.
   기록에 responses 가 있으면 그것이 정본입니다 — 배점까지 들어 있습니다.
   옛 기록은 wrongQuestionNumbers 밖에 없어서 마스터의 문항 정보에 기댑니다. */
const buildWrongList = (diag, exam) => {
  const findInfo = (numStr) => {
    const qs = Array.isArray(exam?.questions) ? exam.questions : [];
    let q = qs.find(x => String(x.number ?? x.qNum) === numStr);
    if (!q) q = qs.find(x => String(x.number ?? x.qNum).replace(/[^0-9]/g, '') === numStr);
    return q || null;
  };

  const rows = [];
  if (Array.isArray(diag.responses) && diag.responses.length > 0) {
    diag.responses.forEach(r => {
      if (r.verdict !== 'wrong') return;
      const numStr = String(r.no);
      const info = findInfo(numStr);
      rows.push({
        number: numStr,
        sort: Number(String(numStr).replace(/[^0-9]/g, '')) || 0,
        points: Number(r.points),
        concept: info?.concept || info?.unit || null,
        difficulty: info?.difficulty || info?.diff || (info?.idiTotal ? `IDI ${info.idiTotal}` : null)
      });
    });
  } else if (Array.isArray(diag.wrongQuestionNumbers)) {
    diag.wrongQuestionNumbers.forEach(n => {
      const numStr = String(n).trim();
      const info = findInfo(numStr);
      rows.push({
        number: info ? String(info.number ?? info.qNum) : numStr,
        sort: Number(numStr.replace(/[^0-9]/g, '')) || 0,
        points: Number(info?.score) || null,
        concept: info?.concept || info?.unit || null,
        difficulty: info?.difficulty || info?.diff || null
      });
    });
  }

  rows.sort((a, b) => a.sort - b.sort);
  return rows;
};

export default function ExamDiagnosticReport({ diagnosticId }) {
  const [diag, setDiag] = useState(null);
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!diagnosticId) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, DIAG_PATH, diagnosticId));
        if (!snap.exists()) throw new Error('NOT_FOUND');
        const d = snap.data();
        if (!alive) return;
        setDiag(d);

        /* 마스터는 학교 내신에만 있습니다. 없는 것이 오류가 아닙니다.
           예전에는 여기서 던진 예외가 화면 전체를 덮었습니다. */
        if (d.examDocId) {
          try {
            const es = await getDoc(doc(db, EXAM_PATH, d.examDocId));
            if (alive && es.exists()) setExam(es.data());
          } catch (e) {
            console.warn('[진단 리포트] 시험 마스터 조회 실패:', e?.code);
          }
        }
      } catch (err) {
        console.error('[진단 리포트] 조회 실패:', err);
        if (!alive) return;
        setError(
          err.message === 'NOT_FOUND' ? '진단 결과를 찾을 수 없습니다.'
            : err?.code === 'permission-denied' ? '이 리포트를 볼 권한이 없습니다.'
            : '리포트를 불러오지 못했습니다.'
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    run();
    return () => { alive = false; };
  }, [diagnosticId]);

  if (loading) return <div className="p-10 text-center text-gray-500 animate-pulse">리포트를 생성 중입니다...</div>;
  if (error) return <div className="p-10 text-center text-red-500 font-bold">{error}</div>;
  if (!diag) return null;

  const max = maxOf(diag);
  const grade = predictGrade(diag, exam);
  const wrongList = buildWrongList(diag, exam);

  /* 제목: 내신은 마스터로 예쁘게 만들고, 나머지는 저장된 제목을 씁니다. */
  let reportTitle = diag.examTitle || '진단 평가';
  if (exam) {
    const { year, schoolName, grade: g, semester, termType, term, subject, standardCode, schoolType } = exam;
    const pretty = getDynamicSubjectLabel(standardCode, schoolType, year, g, subject);
    reportTitle = `[${year}] ${schoolName} ${g} ${semester} ${termType || term || '고사'} ${pretty}`;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 bg-slate-50 min-h-screen">
      <button
        onClick={() => navigate('/my-exams')}
        className="mb-6 flex items-center gap-2 text-indigo-700 hover:text-indigo-900 font-bold bg-indigo-100 hover:bg-indigo-200 px-4 py-2 rounded-xl transition-all w-fit"
      >
        <ArrowLeft size={20} /> 나의 시험 결과 목록으로 가기
      </button>

      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-indigo-900 p-6 text-white text-center">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-2 tracking-tight">스마트 진단 &amp; 성장 리포트</h1>
          <p className="text-indigo-200">{reportTitle}</p>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-center bg-indigo-50 p-6 rounded-xl border border-indigo-100">
            <div className="text-center md:text-left mb-4 md:mb-0">
              <p className="text-gray-500 text-sm font-semibold mb-1">IMPERIAL STUDENT</p>
              <p className="text-2xl font-bold text-gray-900">{diag.studentName} 학생</p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-gray-500 text-sm mb-1">획득 점수</p>
                <p className="text-3xl font-black text-indigo-700">
                  {diag.score}<span className="text-lg text-gray-500 font-normal"> / {max}점</span>
                </p>
              </div>
              {grade && (
                <>
                  <div className="w-px bg-gray-300" />
                  <div>
                    <p className="text-gray-500 text-sm mb-1">예상 등급</p>
                    <p className="text-3xl font-black text-red-500">{grade}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {exam?.review && (
            <div className="bg-white">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3 border-b pb-2">
                <Target className="text-indigo-600" size={24} /> 학원 공식 총평
              </h3>
              <p className="text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg text-sm">{exam.review}</p>
            </div>
          )}

          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-3 border-b pb-2">
              <AlertTriangle className="text-orange-500" size={24} /> 오답 문항 분석
            </h3>
            {wrongList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {wrongList.map((q, idx) => (
                  <div key={`${q.number}-${idx}`} className="flex flex-col p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <div className="flex justify-between items-center mb-1 gap-2">
                      <span className="font-black text-orange-700">
                        {q.number}번 문항
                        {Number.isFinite(q.points) && <span className="text-xs font-bold text-orange-500 ml-1">({q.points}점)</span>}
                      </span>
                      {q.difficulty && (
                        <span className="text-xs font-bold px-2 py-0.5 bg-white text-gray-600 rounded shadow-sm border border-gray-200 shrink-0">
                          난이도: {q.difficulty}
                        </span>
                      )}
                    </div>
                    {q.concept && <span className="text-sm text-gray-700 font-medium">{q.concept}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic p-4 bg-gray-50 rounded-lg text-center font-bold">🎉 오답이 없습니다. 완벽합니다!</p>
            )}
          </div>

          <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
            <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2 mb-4">
              <TrendingUp className="text-blue-600" size={24} /> 담당 선생님 1:1 맞춤 코멘트
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <BookOpen className="text-blue-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-gray-800 mb-1">학습 분석</p>
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {diag.instructorComment || '작성된 코멘트가 없습니다.'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 mt-4">
                <Award className="text-blue-500 mt-1 flex-shrink-0" size={20} />
                <div>
                  <p className="font-semibold text-gray-800 mb-1">성장 플랜</p>
                  <p className="text-gray-700 text-sm leading-relaxed font-bold text-blue-700 whitespace-pre-wrap">
                    {diag.growthPlan || '등록된 플랜이 없습니다.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
