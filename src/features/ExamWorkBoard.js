/* [src/features/ExamWorkBoard.js]
   기출 자료 '업무 현황판'.

   [왜 만드는가]
   기출 아카이브는 '찾는 도구'입니다. 검색을 눌러야 뭐라도 나옵니다.
   강사에게는 그게 맞지만, 조교의 업무는 반대 방향입니다.
     조교  : "지금 뭘 작업해야 하지?"
     관리자 : "승인할 게 뭐 있지?"
   지금까지는 둘 다 아무 조건으로나 검색해 눈으로 훑는 수밖에 없었습니다.

   그래서 검색과 별개로 두 가지를 답해 줍니다.
     [할 일]     — 승인 대기 · 내 작업 · 오래 묶인 건
     [구멍 찾기] — 연도·학기·시험·학년을 고정하고 학교별로 빈칸을 보여 줍니다
                   (원장님이 실제로 작업을 지시하는 단위가 이것입니다)

   자료 4칸을 쓰는 방식은 examFileSlots 한 곳만 씁니다. 기출 아카이브와 규칙이 어긋날 수 없습니다.
*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ClipboardCheck, UserCheck, AlertTriangle, Loader, ExternalLink,
    Grid3x3, ListChecks, RefreshCw, Inbox
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Button } from '../components/UI';
import { INTEGRATED_COLLECTION } from '../utils/examDataManager';
import {
    FILE_SLOTS, SLOT_KEYS, slotLabel, daysSince, isStaleSlot,
    claimSlot, releaseSlot, submitSlotLink, publishSlot, STALE_DAYS
} from '../utils/examFileSlots';
import { toMainSubject, activeMainSubjects } from '../utils/subjectMatch';

const TYPE_KOR = { elementary: '초등학교', middle: '중학교', high: '고등학교' };
const TERMS = ['1학기 중간고사', '1학기 기말고사', '2학기 중간고사', '2학기 기말고사'];

const examTitle = (e) =>
    `${e.year} ${String(e.grade || '1학년').replace('학년', '')}-${String(e.semester || '1학기').replace('학기', '')} ${e.termType || '고사'}`;

const ExamWorkBoard = ({ currentUser, isAdmin, schoolsData, activeDepartments, onClose }) => {
    const [tab, setTab] = useState('todo');

    /* ───────────── 할 일 ───────────── */
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [entries, setEntries] = useState([]);   // { exam, slotKey, slot }
    const [bucket, setBucket] = useState('approve');
    const [urlDraft, setUrlDraft] = useState({}); // `${examId}|${slotKey}` → 입력 중인 링크
    const [busy, setBusy] = useState('');         // 처리 중인 칸 (중복 클릭 방지)

    const loadTodo = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const col = collection(db, INTEGRATED_COLLECTION);
            /* 자료 4칸 × 상태 2종. 칸마다 필드 경로가 달라 한 번에 묶을 수 없습니다.
               대신 결과가 작아(진행 중인 건만) 읽기 비용은 전체 조회보다 훨씬 적습니다. */
            const snaps = await Promise.all(
                SLOT_KEYS.flatMap(k => ['working', 'pending'].map(st =>
                    getDocs(query(col, where(`files.${k}.status`, '==', st)))
                ))
            );

            const found = [];
            snaps.forEach(snap => snap.docs.forEach(d => {
                const exam = { id: d.id, ...d.data() };
                SLOT_KEYS.forEach(k => {
                    const slot = exam.files?.[k];
                    if (!slot || !['working', 'pending'].includes(slot.status)) return;
                    // 같은 문서가 여러 쿼리에 걸리므로 중복을 걸러 냅니다.
                    if (found.some(f => f.exam.id === exam.id && f.slotKey === k)) return;
                    found.push({ exam, slotKey: k, slot });
                });
            }));

            found.sort((a, b) =>
                String(a.exam.schoolName || '').localeCompare(String(b.exam.schoolName || '')) ||
                String(b.exam.year || '').localeCompare(String(a.exam.year || ''))
            );
            setEntries(found);
        } catch (e) {
            console.error('[업무 현황판] 할 일 조회 실패', e);
            setError(`할 일을 불러오지 못했습니다. (${e.code || e.message})`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadTodo(); }, [loadTodo]);

    const buckets = useMemo(() => ({
        approve: entries.filter(e => e.slot.status === 'pending'),
        mine:    entries.filter(e => e.slot.status === 'working' && e.slot.workerId === currentUser.id),
        stale:   entries.filter(e => isStaleSlot(e.slot))
    }), [entries, currentUser.id]);

    const act = async (key, fn) => {
        setBusy(key);
        try { await fn(); await loadTodo(); }
        catch (e) { alert(e.message); }
        finally { setBusy(''); }
    };

    /* ───────────── 구멍 찾기 ───────────── */
    const subjects = useMemo(() => activeMainSubjects(activeDepartments), [activeDepartments]);
    const thisYear = String(new Date().getFullYear());

    const [gap, setGap] = useState({
        schoolType: 'middle', year: thisYear, term: '1학기 중간고사', grade: '2학년', subject: ''
    });
    const [gapRows, setGapRows] = useState(null);
    const [gapMissing, setGapMissing] = useState([]);
    const [gapLoading, setGapLoading] = useState(false);
    const [gapError, setGapError] = useState('');

    useEffect(() => {
        if (!gap.subject && subjects.length > 0) setGap(g => ({ ...g, subject: subjects[0] }));
    }, [subjects, gap.subject]);

    const gradeOptions = gap.schoolType === 'elementary'
        ? ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년']
        : gap.schoolType === 'middle' ? ['1학년', '2학년', '3학년'] : ['1학년', '2학년', '3학년'];

    const loadGap = async () => {
        setGapLoading(true); setGapError(''); setGapRows(null);
        try {
            const [sem, tm] = gap.term.split(' ');
            const col = collection(db, INTEGRATED_COLLECTION);
            const snap = await getDocs(query(col,
                where('year', '==', String(gap.year)),
                where('semester', '==', sem),
                where('termType', '==', tm),
                where('grade', '==', gap.grade)
            ));

            const typeKor = TYPE_KOR[gap.schoolType];
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => {
                // 옛 문서에는 schoolType 이 없어 학교 이름으로 가늠합니다.
                const t = e.schoolType || (e.schoolName?.includes('초') ? '초등학교' : e.schoolName?.includes('중') ? '중학교' : '고등학교');
                if (t !== typeKor) return false;
                return !gap.subject || toMainSubject(e.subject) === gap.subject;
            }).sort((a, b) => String(a.schoolName || '').localeCompare(String(b.schoolName || '')));

            /* 문서가 아예 없는 학교도 '구멍'입니다. 학교 마스터와 비교해 따로 알려 줍니다. */
            const master = Array.isArray(schoolsData?.[gap.schoolType]) ? schoolsData[gap.schoolType] : [];
            const have = new Set(rows.map(r => r.schoolName));
            setGapMissing(master.filter(s => !have.has(s)));
            setGapRows(rows);
        } catch (e) {
            console.error('[업무 현황판] 구멍 찾기 실패', e);
            setGapError(`조회하지 못했습니다. (${e.code || e.message})`);
        } finally {
            setGapLoading(false);
        }
    };

    const claimFromGap = async (exam, slotKey) => {
        const key = `${exam.id}|${slotKey}`;
        if (!window.confirm(`[${exam.schoolName}] ${slotLabel(slotKey)} 작업을 시작하시겠습니까?`)) return;
        setBusy(key);
        try {
            await claimSlot(exam.id, slotKey, currentUser);
            await loadGap();
        } catch (e) { alert(e.message); }
        finally { setBusy(''); }
    };

    /* ───────────── 화면 ───────────── */
    const summaryCard = (id, Icon, label, count, tone) => (
        <button
            key={id}
            onClick={() => setBucket(id)}
            className={`flex-1 text-left p-4 rounded-xl border-2 transition-all ${
                bucket === id ? `${tone.active} shadow-sm` : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
        >
            <div className={`flex items-center gap-2 text-xs font-bold ${tone.text}`}>
                <Icon size={15} /> {label}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1.5">{count}<span className="text-sm font-medium text-gray-400 ml-1">건</span></div>
        </button>
    );

    const list = buckets[bucket] || [];

    return (
        <div className="space-y-4">
            <div className="flex gap-2 border-b border-gray-200">
                {[['todo', ListChecks, '할 일'], ['gap', Grid3x3, '구멍 찾기']].map(([id, Icon, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                            tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        <Icon size={15} /> {label}
                    </button>
                ))}
                <div className="ml-auto flex items-center pb-1.5">
                    <button onClick={tab === 'todo' ? loadTodo : loadGap} className="text-gray-400 hover:text-blue-600 p-1.5" title="새로고침">
                        <RefreshCw size={15} className={(loading || gapLoading) ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {tab === 'todo' && (
                <div className="space-y-4">
                    <div className="flex gap-2 md:gap-3">
                        {summaryCard('approve', ClipboardCheck, '승인 대기', buckets.approve.length,
                            { active: 'border-purple-400 bg-purple-50', text: 'text-purple-700' })}
                        {summaryCard('mine', UserCheck, '내 작업', buckets.mine.length,
                            { active: 'border-blue-400 bg-blue-50', text: 'text-blue-700' })}
                        {summaryCard('stale', AlertTriangle, `${STALE_DAYS}일 넘게 묶인 건`, buckets.stale.length,
                            { active: 'border-red-400 bg-red-50', text: 'text-red-700' })}
                    </div>

                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

                    {loading ? (
                        <div className="py-16 flex justify-center"><Loader className="animate-spin text-blue-600" size={28} /></div>
                    ) : list.length === 0 ? (
                        <div className="py-16 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                            <Inbox size={28} className="text-gray-300" />
                            {bucket === 'approve' ? '승인할 자료가 없습니다.'
                                : bucket === 'mine' ? '잡아 둔 작업이 없습니다. [구멍 찾기]에서 작업을 가져오세요.'
                                : `${STALE_DAYS}일 넘게 묶인 작업이 없습니다.`}
                        </div>
                    ) : (
                        <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-[46vh] overflow-y-auto">
                            {list.map(({ exam, slotKey, slot }) => {
                                const key = `${exam.id}|${slotKey}`;
                                const stuck = daysSince(slot.claimedAt);
                                return (
                                    <div key={key} className="p-3 md:p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50/60">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold text-gray-900 text-sm truncate">
                                                {exam.schoolName}
                                                <span className="ml-2 text-xs font-medium text-gray-500">{examTitle(exam)} · {exam.subject}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">{slotLabel(slotKey)}</span>
                                                {slot.status === 'working' && (
                                                    <span className={`text-[11px] ${stuck >= STALE_DAYS ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                                        {slot.workerName} 작업중{stuck !== null ? ` · ${stuck}일째` : ''}
                                                    </span>
                                                )}
                                                {slot.status === 'pending' && <span className="text-[11px] text-purple-600 font-bold">검수 대기</span>}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {bucket === 'approve' && (
                                                <>
                                                    {slot.url && (
                                                        <a href={slot.url} target="_blank" rel="noopener noreferrer"
                                                           className="text-xs font-bold text-gray-600 hover:text-blue-600 flex items-center gap-1 px-2 py-1.5">
                                                            <ExternalLink size={13} /> 확인
                                                        </a>
                                                    )}
                                                    {isAdmin && (
                                                        <Button size="sm" variant="success" disabled={busy === key}
                                                                onClick={() => act(key, () => publishSlot(exam.id, slotKey))}>
                                                            {busy === key ? '처리 중' : '승인'}
                                                        </Button>
                                                    )}
                                                </>
                                            )}

                                            {bucket === 'mine' && (
                                                <>
                                                    <input
                                                        value={urlDraft[key] || ''}
                                                        onChange={e => setUrlDraft(d => ({ ...d, [key]: e.target.value }))}
                                                        placeholder="구글 드라이브 링크"
                                                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs w-44 md:w-56 outline-none focus:border-blue-500"
                                                    />
                                                    <Button size="sm" variant="primary" disabled={busy === key || !(urlDraft[key] || '').trim()}
                                                            onClick={() => act(key, async () => {
                                                                await submitSlotLink(exam.id, slotKey, urlDraft[key]);
                                                                setUrlDraft(d => { const n = { ...d }; delete n[key]; return n; });
                                                            })}>
                                                        등록
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="text-red-500 border-gray-300" disabled={busy === key}
                                                            onClick={() => { if (window.confirm('작업을 취소하시겠습니까?')) act(key, () => releaseSlot(exam.id, slotKey)); }}>
                                                        취소
                                                    </Button>
                                                </>
                                            )}

                                            {bucket === 'stale' && isAdmin && (
                                                <Button size="sm" variant="outline" className="text-red-600 border-red-300" disabled={busy === key}
                                                        onClick={() => {
                                                            if (window.confirm(`${slot.workerName || '다른 사람'}님이 잡아 둔 작업을 해제합니다.\n(관리자 권한) 계속하시겠습니까?`))
                                                                act(key, () => releaseSlot(exam.id, slotKey));
                                                        }}>
                                                    해제
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'gap' && (
                <div className="space-y-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 md:p-4">
                        <p className="text-xs text-gray-500 mb-2.5">같은 연도·학기·시험·학년을 고정하고, 학교별로 빠진 자료를 봅니다.</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            <select className="border p-2 rounded-lg bg-white text-sm font-bold outline-none" value={gap.schoolType}
                                    onChange={e => setGap({ ...gap, schoolType: e.target.value })}>
                                <option value="high">고등학교</option><option value="middle">중학교</option><option value="elementary">초등학교</option>
                            </select>
                            <select className="border p-2 rounded-lg bg-white text-sm font-bold outline-none" value={gap.year}
                                    onChange={e => setGap({ ...gap, year: e.target.value })}>
                                {Array.from({ length: 8 }, (_, i) => String(Number(thisYear) - i)).map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                            <select className="border p-2 rounded-lg bg-white text-sm font-bold outline-none" value={gap.term}
                                    onChange={e => setGap({ ...gap, term: e.target.value })}>
                                {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <select className="border p-2 rounded-lg bg-white text-sm font-bold outline-none" value={gap.grade}
                                    onChange={e => setGap({ ...gap, grade: e.target.value })}>
                                {gradeOptions.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <select className="border p-2 rounded-lg bg-white text-sm font-bold text-indigo-700 outline-none" value={gap.subject}
                                    onChange={e => setGap({ ...gap, subject: e.target.value })}>
                                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <Button className="w-full mt-3 py-2.5" icon={Grid3x3} onClick={loadGap} disabled={gapLoading}>
                            {gapLoading ? '조회 중...' : '빈칸 보기'}
                        </Button>
                    </div>

                    {gapError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{gapError}</div>}

                    {gapRows && (
                        <div className="space-y-3">
                            {gapRows.length === 0 ? (
                                <div className="py-10 text-center text-gray-400 text-sm">이 조건으로 등록된 시험이 없습니다.</div>
                            ) : (
                                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                                    <table className="w-full text-sm min-w-[560px]">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="text-left px-3 py-2.5 font-bold text-gray-600 text-xs">학교 · 과목</th>
                                                {FILE_SLOTS.map(s => (
                                                    <th key={s.key} className="px-2 py-2.5 font-bold text-gray-600 text-xs w-[110px]">{s.short}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {gapRows.map(exam => (
                                                <tr key={exam.id} className="hover:bg-gray-50/60">
                                                    <td className="px-3 py-2.5">
                                                        <div className="font-bold text-gray-900">{exam.schoolName}</div>
                                                        <div className="text-[11px] text-gray-500">{exam.subject}</div>
                                                    </td>
                                                    {FILE_SLOTS.map(s => {
                                                        const slot = exam.files?.[s.key] || { status: 'open' };
                                                        const key = `${exam.id}|${s.key}`;
                                                        if (slot.status === 'published') return (
                                                            <td key={s.key} className="px-2 py-2.5 text-center">
                                                                <a href={slot.url} target="_blank" rel="noopener noreferrer"
                                                                   className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline">
                                                                    <ExternalLink size={12} /> 보기
                                                                </a>
                                                            </td>
                                                        );
                                                        if (slot.status === 'pending') return (
                                                            <td key={s.key} className="px-2 py-2.5 text-center">
                                                                <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-1">검수 대기</span>
                                                            </td>
                                                        );
                                                        if (slot.status === 'working') {
                                                            const stuck = daysSince(slot.claimedAt);
                                                            const stale = isStaleSlot(slot);
                                                            return (
                                                                <td key={s.key} className="px-2 py-2.5 text-center">
                                                                    <span className={`text-[11px] font-bold rounded px-1.5 py-1 border ${stale ? 'text-red-700 bg-red-50 border-red-200' : 'text-yellow-700 bg-yellow-50 border-yellow-200'}`}
                                                                          title={`${slot.workerName} 작업중`}>
                                                                        {slot.workerName}{stale ? ` · ${stuck}일` : ''}
                                                                    </span>
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td key={s.key} className="px-2 py-2.5 text-center">
                                                                <button
                                                                    onClick={() => claimFromGap(exam, s.key)}
                                                                    disabled={busy === key}
                                                                    className="text-[11px] font-bold text-gray-500 hover:text-blue-700 border border-dashed border-gray-300 hover:border-blue-400 rounded px-2 py-1 transition-colors disabled:opacity-50"
                                                                >
                                                                    {busy === key ? '...' : '＋ 작업'}
                                                                </button>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {gapMissing.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
                                    <div className="font-bold text-amber-800 mb-1">시험 자체가 등록되지 않은 학교 {gapMissing.length}곳</div>
                                    <div className="text-amber-700 leading-relaxed">{gapMissing.join(' · ')}</div>
                                    <div className="text-amber-600 mt-1.5">[자료 신규 등록]에서 먼저 시험을 만들어야 작업을 배정할 수 있습니다.</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ExamWorkBoard;
