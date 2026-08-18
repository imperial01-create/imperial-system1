/* [src/components/MathUnitBoard.js]
   수학 단원별 현황. 서버(Functions 의 syncMathProfile)가 만들어 둔 것을 읽기만 합니다.

   [왜 점수가 아니라 개수인가]
   '개념이해 62점' 은 이 표본 규모에서 만들 수 없는 숫자입니다.
   그러나 '10문제 중 7개' 는 만들 수 있고, 표본이 적어도 언제나 참입니다.
   그리고 표본 크기가 숫자 안에 그대로 보여서 따로 주의 문구가 필요 없습니다 —
   '3문제 중 3개' 를 보면 사람이 알아서 감을 잡습니다.

   [라벨은 표본이 충분할 때만]
   3문제를 다 맞은 학생에게 '익힘' 을 붙이면, 실제 실력이 44% 일 가능성도
   통계적으로 열려 있습니다. 부정확한 게 아니라 임의적입니다.
   서버가 Wilson 구간으로 판정해 label 을 채우고, 모자라면 null 로 둡니다.
*/

import React from 'react';
import { Layers, AlertCircle } from 'lucide-react';

const LABEL_TONE = {
    '익힘': 'bg-indigo-50 border-indigo-200 text-indigo-700',
    '익히는 중': 'bg-emerald-50 border-emerald-200 text-emerald-700',
    '아직': 'bg-rose-50 border-rose-300 text-rose-700'
};

const fmtDate = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

const MathUnitBoard = ({ profile }) => {
    const units = profile?.units || [];
    const overall = profile?.overall || null;
    const unmapped = profile?.unmapped || [];
    const reliability = profile?.reliability || null;
    const assignment = profile?.assignment || null;

    return (
        <div className="bg-white rounded-[40px] p-8 sm:p-10 border border-slate-200 shadow-sm">
            <div className="flex justify-between items-end mb-6 flex-wrap gap-4 border-b border-slate-100 pb-4">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <Layers className="text-indigo-600" /> 배운 단원, 어디까지 왔나
                    </h3>
                    <p className="text-sm font-bold text-slate-400 mt-1">
                        점수가 아니라 <b className="text-slate-500">실제로 푼 문제의 개수</b>입니다. 개념테스트에서 모읍니다.
                    </p>
                </div>
                {overall && overall.attempted > 0 && (
                    <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-2xl text-sm font-bold text-slate-600">
                        전체 {overall.attempted}문제 중 <span className="text-indigo-700 font-black">{overall.correct}개</span>
                        <span className="text-slate-400 font-medium ml-1.5">· 평가 {overall.testCount}회</span>
                    </div>
                )}
            </div>

            {units.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold text-sm border-2 border-dashed rounded-3xl">
                    아직 쌓인 개념테스트가 없습니다.<br />
                    <span className="font-medium text-slate-400">개념테스트를 채점해 저장하면 여기에 단원별로 쌓입니다.</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {units.map(u => {
                        const pct = u.attempted > 0 ? Math.round((u.correct / u.attempted) * 100) : 0;
                        const tone = u.label ? LABEL_TONE[u.label] : 'bg-slate-50 border-slate-200 text-slate-500';
                        return (
                            <div key={u.unitId} className="p-6 rounded-3xl border-2 border-slate-100 bg-white shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start gap-2 mb-2">
                                        <span className="font-black text-slate-800">{u.unitName || u.unitId}</span>
                                        <span className={`text-xs font-black px-2.5 py-1 rounded-xl border shrink-0 ${tone}`}>
                                            {u.label || '자료 모으는 중'}
                                        </span>
                                    </div>

                                    {/* 개수가 먼저, 비율은 보조. 비율만 크게 쓰면 3문제 중 3개가 100% 로 보입니다. */}
                                    <div className="text-2xl font-black text-slate-900">
                                        {u.attempted}문제 중 <span className="text-indigo-700">{u.correct}개</span>
                                        <span className="text-sm font-bold text-slate-400 ml-2">{pct}%</span>
                                    </div>

                                    <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>

                                {/* 숙제는 시험과 합치지 않습니다. 시간 제한 없이 참고서를 보며
                                    푸는 것이라 정답률이 체계적으로 높고, 합치면 시험 성적이
                                    실제보다 좋아 보입니다. 둘의 차이 자체가 신호입니다. */}
                                {u.hw && u.hw.attempted > 0 && (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <div className="text-xs font-bold text-slate-500">
                                            숙제 {u.hw.attempted}문제 중 <span className="text-slate-800 font-black">{u.hw.correct}개</span>
                                            <span className="text-slate-400 ml-1.5">
                                                {Math.round((u.hw.correct / u.hw.attempted) * 100)}%
                                            </span>
                                            <span className="text-slate-300 ml-1.5 font-medium">· {u.hw.taskCount}회</span>
                                        </div>
                                    </div>
                                )}

                                {/* 어떻게 쟀는가 / 몇 문제로 쟀는가 / 마지막 본 날 — 세 줄은 필수입니다. */}
                                <div className="mt-3 text-[11px] font-bold text-slate-400 leading-relaxed">
                                    위 숫자는 개념테스트 {u.testCount}회로 측정
                                    {u.blank > 0 && <> · 무응답 {u.blank}개는 제외</>}
                                    {u.lastAt && <> · 마지막 {fmtDate(u.lastAt)}</>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 과제 신뢰도 — 숙제와 시험 사이의 괴리.
                숙제는 시간 제한이 없어 모든 학생에게 괴리가 있습니다.
                그래서 '몇 %p 벌어졌다' 를 판정으로 쓰지 않고, 두 값을 나란히 보여줍니다.
                또래 대비(반 평균 차감)가 붙기 전까지는 참고용입니다. */}
            {reliability?.ready && (
                <div className="mt-5 bg-slate-50 border border-slate-200 rounded-2xl p-5">
                    <h4 className="font-black text-slate-800 mb-1">숙제와 시험, 얼마나 붙어 있나</h4>
                    <p className="text-xs text-slate-400 font-bold mb-3">
                        숙제는 시간 제한 없이 풀기 때문에 누구나 더 높습니다. 많이 벌어질 때만 의미가 있습니다.
                    </p>
                    <div className="flex flex-wrap items-end gap-6">
                        <div>
                            <div className="text-[11px] font-bold text-slate-400">숙제</div>
                            <div className="text-xl font-black text-slate-800">
                                {reliability.homework.attempted}문제 중 {reliability.homework.correct}개
                                <span className="text-sm text-slate-400 ml-1.5">{Math.round(reliability.homework.pct * 100)}%</span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold text-slate-400">개념테스트</div>
                            <div className="text-xl font-black text-slate-800">
                                {reliability.test.attempted}문제 중 {reliability.test.correct}개
                                <span className="text-sm text-slate-400 ml-1.5">{Math.round(reliability.test.pct * 100)}%</span>
                            </div>
                        </div>
                        {reliability.gap !== null && (
                            <div className={`px-3 py-2 rounded-xl border text-sm font-black ${
                                reliability.gap >= 0.3 ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600'
                            }`}>
                                차이 {Math.round(reliability.gap * 100)}%p
                            </div>
                        )}
                    </div>
                    {reliability.gap >= 0.3 && (
                        <p className="text-xs font-bold text-amber-700 mt-3 leading-relaxed">
                            숙제에서는 잘 맞는데 시험에서 떨어집니다. 공부하는 방식을 함께 봐야 할 수 있습니다.
                            <span className="text-amber-600 font-medium"> (또래와 비교하는 기준은 아직 준비 중입니다)</span>
                        </p>
                    )}
                </div>
            )}

            {/* 실행 지구력 — 비율이 아니라 개수입니다.
                '70%' 는 학부모에게 '게으르다' 로 읽히고 '12건 중 9건' 은 사실로 읽힙니다. */}
            {assignment?.assigned > 0 && (
                <div className="mt-4 flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-2xl p-4">
                    <span className="text-sm font-black text-slate-700">과제 이행</span>
                    <div className="flex gap-1">
                        {Array.from({ length: Math.min(assignment.assigned, 24) }, (_, i) => (
                            <span key={i} className={`w-3 h-6 rounded-sm ${i < assignment.completed ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                        ))}
                    </div>
                    <span className="text-sm font-bold text-slate-600">
                        {assignment.assigned}건 중 <span className="text-indigo-700 font-black">{assignment.completed}건</span> 완료
                    </span>
                    {assignment.gradedItems < assignment.assigned && (
                        <span className="text-[11px] font-bold text-slate-400">
                            그중 {assignment.gradedItems}건 채점됨
                        </span>
                    )}
                </div>
            )}

            {/* 조용히 빠지면 나중에 왜 비었는지 알 수 없습니다. */}
            {unmapped.length > 0 && (
                <div className="mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs">
                    <div className="font-black text-amber-800 mb-1 flex items-center gap-1.5">
                        <AlertCircle size={14} /> 단원이 지정되지 않은 평가가 있습니다
                    </div>
                    <div className="text-amber-700 font-bold leading-relaxed">
                        {unmapped.map(u => `${u.name} (${u.attempted}문제)`).join(' · ')}
                    </div>
                    <div className="text-amber-600 mt-1.5 font-medium">
                        채점할 때 단원을 목록에서 고르면 여기가 아니라 위 단원별 현황에 쌓입니다.
                    </div>
                </div>
            )}
        </div>
    );
};

export default MathUnitBoard;
