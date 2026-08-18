/* [src/components/UnitSelect.js]
   단원 마스터에서 단원 하나를 고르는 입력칸입니다.

   [왜 검색인가]
   이 학원은 반마다 강사마다 나가는 과정이 다릅니다.
   한 반이 중1-1·중2-1·중3-1·공통수학1 에서 일부씩 뽑아 나가기도 합니다.
   그래서 '과정을 고른 뒤 그 안에서 단원을 고르는' 2단계 방식은,
   조교에게 "이 단원이 어느 과정이더라"를 매번 묻는 셈이 됩니다.

   여기서는 단원 이름만 치면 찾습니다. 어느 과정인지는 결과에 적어 줍니다.
   교재 표기로 쳐도 찾아집니다(별칭까지 훑습니다).

   [직접 입력]
   특강·혼합 범위는 마스터에 없습니다. 직접 적을 수 있게 두되,
   그 기록이 단원별 현황에 쌓이지 않는다는 사실을 화면에서 알립니다.
   조용히 빠지면 나중에 왜 비었는지 알 수 없습니다.
*/

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, AlertTriangle, Check } from 'lucide-react';
import { searchUnits, findUnit, isAmbiguousUnit } from '../utils/curriculumUnits';

/* 두 교육과정에 같은 이름으로 있는 단원에만 개정 연도를 붙입니다.
   전부에 붙이면 잡음이고, 안 붙이면 똑같은 줄이 두 번 떠서 고를 수가 없습니다. */
const CurriculumTag = ({ unit }) => (
    isAmbiguousUnit(unit)
        ? <span className={`ml-1.5 px-1 rounded text-[10px] font-black ${unit.curriculum === '2015' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {unit.curriculum} 개정
          </span>
        : null
);

/**
 * @param value      { unitId, unitName } — unitId 가 null 이면 직접 입력한 범위
 * @param onChange   ({ unitId, unitName, unit }) => void   unit 은 마스터 원본(직접 입력이면 null)
 * @param preferUnitIds 위로 올릴 단원들 (예: 이 반이 이미 다룬 단원)
 */
const UnitSelect = ({ value, onChange, preferUnitIds = [], disabled = false, course = null, curriculum = null, placeholder = '단원 이름으로 검색 (예: 이차함수)' }) => {
    const [queryText, setQueryText] = useState('');
    const [open, setOpen] = useState(false);
    const [customMode, setCustomMode] = useState(false);
    const boxRef = useRef(null);

    const selectedUnit = value?.unitId ? findUnit(value.unitId) : null;

    /* 과정이 정해져 있으면 그 과정 단원을 전부 보여 줍니다(6~10개라 상한에 안 걸립니다).
       과정이 없으면 194개 중 일부만 보이므로, 잘렸다는 사실을 화면에 적습니다.
       예전에는 20개만 돌려주면서 그 말을 안 해 '단원이 다 안 뜬다' 로만 보였습니다. */
    const results = useMemo(
        () => (open ? searchUnits(queryText, { limit: course ? 200 : 40, course, curriculum, preferUnitIds }) : []),
        [queryText, open, preferUnitIds, course, curriculum]
    );

    // 바깥을 누르면 닫습니다.
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const pick = (u) => {
        onChange({ unitId: u.unitId, unitName: u.unitName, unit: u });
        setQueryText('');
        setOpen(false);
        setCustomMode(false);
    };

    const clear = () => {
        onChange({ unitId: null, unitName: '', unit: null });
        setQueryText('');
        setCustomMode(false);
    };

    /* ── 직접 입력 상태 ── */
    if (customMode || (value && !value.unitId && value.unitName)) {
        return (
            <div>
                <div className="flex gap-2">
                    <input
                        type="text" disabled={disabled}
                        placeholder="예: 중간고사 대비 종합"
                        className="flex-1 border-2 border-amber-300 bg-amber-50 p-3 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300"
                        value={value?.unitName || ''}
                        onChange={e => onChange({ unitId: null, unitName: e.target.value, unit: null })}
                    />
                    <button
                        type="button" onClick={clear}
                        className="px-3 rounded-xl border border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                        title="목록에서 고르기로 돌아가기"
                    ><X size={16} /></button>
                </div>
                <p className="text-[11px] text-amber-700 font-bold mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={12} /> 목록에 없는 범위입니다. 단원별 현황에는 쌓이지 않습니다.
                </p>
            </div>
        );
    }

    /* ── 고른 상태 ── */
    if (selectedUnit) {
        return (
            <div className="flex items-center gap-2 border-2 border-indigo-200 bg-indigo-50 p-2.5 rounded-xl">
                <Check size={16} className="text-indigo-600 shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="font-bold text-indigo-900 text-sm truncate">{selectedUnit.unitName}</div>
                    <div className="text-[11px] text-indigo-600 font-bold truncate">
                        {selectedUnit.course} · {selectedUnit.category}
                        <CurriculumTag unit={selectedUnit} />
                    </div>
                </div>
                <button
                    type="button" onClick={clear} disabled={disabled}
                    className="p-1 text-indigo-400 hover:text-indigo-700 shrink-0" title="다시 고르기"
                ><X size={16} /></button>
            </div>
        );
    }

    /* ── 검색 상태 ── */
    return (
        <div className="relative" ref={boxRef}>
            <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                    type="text" disabled={disabled} placeholder={placeholder}
                    className="w-full border border-slate-300 pl-9 pr-3 py-3 rounded-xl bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    value={queryText}
                    onChange={e => { setQueryText(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                />
            </div>

            {open && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
                    {results.truncated && (
                        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-800">
                            전체 {results.total}개 중 {results.length}개만 보입니다 — 단원 이름을 더 입력하세요.
                        </div>
                    )}
                    {results.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 font-bold text-center">
                            찾는 단원이 없습니다
                        </div>
                    ) : results.map(u => (
                        <button
                            key={u.unitId} type="button" onClick={() => pick(u)}
                            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
                        >
                            <div className="font-bold text-slate-800 text-sm">{u.unitName}</div>
                            <div className="text-[11px] text-slate-500 font-bold">
                                {u.course} · {u.category}
                                <CurriculumTag unit={u} />
                            </div>
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => { setCustomMode(true); setOpen(false); onChange({ unitId: null, unitName: queryText, unit: null }); }}
                        className="w-full text-left px-3 py-2.5 bg-slate-50 hover:bg-amber-50 text-xs font-bold text-slate-600 border-t border-slate-200"
                    >
                        목록에 없음 — 직접 입력
                    </button>
                </div>
            )}
        </div>
    );
};

export default UnitSelect;
