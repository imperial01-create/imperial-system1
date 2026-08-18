/* [src/components/ClinicWrongAnswerTagger.js]
   클리닉에서 학생의 최근 오답에 '왜 막혔는지' 를 문항 단위로 붙입니다.

   [왜 여기인가]
   막힌 지점은 세션이 아니라 문항에 붙어야 합니다.
   세션에 붙이면 "오늘 개념이 약했다" 까지만 남고,
   "이 문제를 왜 못 풀었나" 에 답하지 못합니다.

   그리고 클리닉은 이유를 **알아내는** 자리입니다.
   답안지만 보고는 '조건을 빠뜨렸는지' 와 '개념을 몰랐는지' 를 가릴 수 없습니다.
   학생이 앞에 있어서 물어볼 수 있는 유일한 자리가 여기입니다.

   기록 관리 화면까지 찾아가서 입력하게 하면 실제로는 아무도 하지 않습니다.
   그래서 클리닉 화면 안에서 바로 붙입니다.

   [비용]
   한 클리닉에서 실제로 다루는 문항은 서너 개입니다. 전수 판정이 아니라 표본입니다.
   조교가 오답마다 풀이를 다시 읽는 구조(원장이 이미 폐기한 lucky 판정)와 다릅니다.
*/

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Loader, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { ERROR_TAGS, errorLabelOf, ERROR_TAG_BY_CODE } from '../utils/errorTaxonomy';
import { APP_ID } from '../constants';

const DIAG_PATH = `artifacts/${APP_ID}/public/data/student_exam_diagnostics`;

const toMillis = (v) => {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return 0;
};

const ClinicWrongAnswerTagger = ({ studentId, onSummaryChange }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [records, setRecords] = useState([]);
    const [openId, setOpenId] = useState(null);
    const [savingKey, setSavingKey] = useState('');

    const load = useCallback(async () => {
        if (!studentId) { setRecords([]); return; }
        setLoading(true); setError('');
        try {
            /* orderBy 를 쓰지 않습니다 — studentId + createdAt 복합 색인이 필요해지고,
               색인이 없으면 조용히 실패합니다. 받아서 정렬합니다. */
            const snap = await getDocs(query(collection(db, DIAG_PATH), where('studentId', '==', studentId)));
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => Array.isArray(r.responses) && r.responses.some(x => x.verdict === 'wrong'))
                .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
                .slice(0, 5);   // 최근 5건이면 클리닉에서 다루는 범위를 덮습니다
            setRecords(list);
            setOpenId(list[0]?.id || null);
        } catch (e) {
            console.error('[클리닉] 최근 오답 조회 실패', e);
            setError(`최근 오답을 불러오지 못했습니다. (${e.code || e.message})`);
        } finally {
            setLoading(false);
        }
    }, [studentId]);

    useEffect(() => { load(); }, [load]);

    /* 붙인 원인들을 위로 올려 줍니다. 학부모 문자 문구가 여기서 만들어집니다.

       ⚠️ 부모는 인라인 화살표 함수를 넘깁니다. 그것을 의존성에 넣으면
          매 렌더마다 새 함수가 되어 effect → setState → 렌더 → effect 로 무한히 돕니다.
          그래서 콜백은 ref 에 담고, 값이 실제로 바뀐 때만 부릅니다. */
    const summaryCbRef = useRef(onSummaryChange);
    summaryCbRef.current = onSummaryChange;
    const lastSummary = useRef('');

    useEffect(() => {
        const codes = [];
        records.forEach(r => (r.responses || []).forEach(x => {
            if (x.errorType && ERROR_TAG_BY_CODE[x.errorType] && !codes.includes(x.errorType)) codes.push(x.errorType);
        }));
        const key = codes.join('|');
        if (key === lastSummary.current) return;
        lastSummary.current = key;
        if (summaryCbRef.current) summaryCbRef.current(codes);
    }, [records]);

    const setErrorType = async (rec, idx, code) => {
        const key = `${rec.id}|${idx}`;
        setSavingKey(key);
        try {
            const next = rec.responses.map((x, i) => (i === idx ? { ...x, errorType: code || null } : x));
            await updateDoc(doc(db, DIAG_PATH, rec.id), { responses: next, updatedAt: serverTimestamp() });
            setRecords(prev => prev.map(r => (r.id === rec.id ? { ...r, responses: next } : r)));
        } catch (e) {
            alert('저장 실패: ' + e.message);
        } finally {
            setSavingKey('');
        }
    };

    if (!studentId) return null;

    return (
        <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-1">
                오늘 본 문제, 왜 막혔나 <span className="font-normal text-xs text-gray-400">(다룬 문항만)</span>
            </label>
            <p className="text-[11px] text-gray-400 font-medium mb-2">
                한 문제에서 여러 개가 겹치면 <b>가장 먼저 막힌 것</b>을 고르세요. 전부 채우지 않아도 됩니다.
            </p>

            {loading ? (
                <div className="py-6 flex justify-center"><Loader className="animate-spin text-blue-500" size={22} /></div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl p-3">{error}</div>
            ) : records.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-bold text-gray-400 text-center">
                    최근 채점된 오답이 없습니다.
                </div>
            ) : (
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-72 overflow-y-auto">
                    {records.map(rec => {
                        const wrongs = (rec.responses || [])
                            .map((r, i) => ({ ...r, idx: i }))
                            .filter(r => r.verdict === 'wrong');
                        const tagged = wrongs.filter(r => r.errorType).length;
                        const isOpen = openId === rec.id;
                        return (
                            <div key={rec.id}>
                                <button
                                    type="button"
                                    onClick={() => setOpenId(isOpen ? null : rec.id)}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                                >
                                    {isOpen ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-bold text-gray-900 truncate">{rec.examTitle || '제목 없음'}</span>
                                        <span className="block text-[11px] text-gray-500 font-bold">
                                            {rec.unitName || '범위 미지정'} · 오답 {wrongs.length}개
                                        </span>
                                    </span>
                                    {tagged > 0 && (
                                        <span className="text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 shrink-0">
                                            {tagged}/{wrongs.length}
                                        </span>
                                    )}
                                </button>

                                {isOpen && (
                                    <div className="px-3 pb-3 space-y-2 bg-gray-50/60">
                                        {wrongs.map(r => (
                                            <div key={`${rec.id}-${r.idx}`} className="flex items-start gap-2">
                                                <span className="w-12 shrink-0 text-sm font-black text-rose-600 pt-2">{r.no}번</span>
                                                <div className="flex-1 flex flex-wrap gap-1.5">
                                                    {ERROR_TAGS.map(t => {
                                                        const on = r.errorType === t.code;
                                                        const key = `${rec.id}|${r.idx}`;
                                                        return (
                                                            <button
                                                                key={t.code} type="button" title={t.hint}
                                                                disabled={savingKey === key}
                                                                onClick={() => setErrorType(rec, r.idx, on ? null : t.code)}
                                                                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-50 ${
                                                                    on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400'
                                                                }`}
                                                            >
                                                                {on && <Check size={11} className="inline mr-0.5" />}{t.label}
                                                            </button>
                                                        );
                                                    })}
                                                    {/* 옛 분류가 저장돼 있으면 그대로 보여 줍니다. 새로 고를 수는 없습니다. */}
                                                    {r.errorType && !ERROR_TAG_BY_CODE[r.errorType] && (
                                                        <span className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-amber-300 bg-amber-50 text-amber-700">
                                                            {errorLabelOf(r.errorType) || r.errorType} (옛 분류)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ClinicWrongAnswerTagger;
