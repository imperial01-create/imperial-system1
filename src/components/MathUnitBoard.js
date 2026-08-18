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

                                {/* 어떻게 쟀는가 / 몇 문제로 쟀는가 / 마지막 본 날 — 세 줄은 필수입니다. */}
                                <div className="mt-3 text-[11px] font-bold text-slate-400 leading-relaxed">
                                    개념테스트 {u.testCount}회로 측정
                                    {u.blank > 0 && <> · 무응답 {u.blank}개는 제외</>}
                                    {u.lastAt && <> · 마지막 {fmtDate(u.lastAt)}</>}
                                </div>
                            </div>
                        );
                    })}
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
