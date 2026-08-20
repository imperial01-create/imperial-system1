/* [src/features/HomeworkManager.js]
   숙제 출제와 채점.

   [왜 클리닉에서 분리했는가]
   처음에는 클리닉 임무(clinic_tasks)에 숙제를 얹었습니다. 재사용이라 빨랐지만,
   강사가 '숙제를 내야지' 하고 [개별 클리닉 지시] 를 떠올리기는 어렵습니다.
   학원의 실제 흐름에서도 숙제와 클리닉은 다른 일입니다.

   [체크박스로 여러 학생에게 한 번에]
   예전 구조는 학생 1명 · 날짜 1개였습니다. 반 15명에게 같은 숙제를 내려면
   15번 반복해야 했고, 그러면 현장에서 안 쓰입니다.
   반 전체가 같은 숙제를 받는 경우, 일부만 같은 경우, 혼자만 다른 경우가
   모두 있으므로 학생을 체크해서 고르게 합니다.

   [저장]
   학생 한 명 · 한 번 배정이 문서 하나입니다(집계와 권한이 학생 단위라서).
   같이 낸 것은 batchId 로 묶입니다.
*/

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    collection, doc, getDocs, setDoc, updateDoc, deleteDoc,
    query, where, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    ClipboardList, Plus, Loader, X, Check, Book, Users,
    CheckSquare, Square, Trash2, AlertCircle, CalendarDays
} from 'lucide-react';
import { Button, Card, Modal } from '../components/UI';
import TextbookPicker from '../components/TextbookPicker';
import { pickSeasonForToday } from '../hooks/useSeasonAutoSelect';
import { useData } from '../contexts/DataContext';
import { APP_ID } from '../constants';

const HW_PATH = `artifacts/${APP_ID}/public/data/homework`;
const today = () => new Date().toISOString().split('T')[0];

const newItem = () => ({ key: `i_${Math.random().toString(36).slice(2, 9)}`, taskContent: '' });

const HomeworkManager = ({ currentUser }) => {
    const data = useData();
    const [tab, setTab] = useState('grade');

    /* 시즌은 고르지 않습니다. 숙제는 늘 지금 진행 중인 시즌의 반에 내므로
       오늘 날짜에 해당하는 시즌을 자동으로 적용합니다.
       시험 진단 입력(ExamDiagnosticInput)과 같은 규칙이어야 두 화면의 반 목록이 어긋나지 않습니다. */
    const activeSeason = useMemo(() => {
        const list = Array.isArray(data?.masterData?.seasons) ? data.masterData.seasons : [];
        const id = pickSeasonForToday(list, 'all');
        return { id, name: list.find(s => s.id === id)?.name || '전체 시즌' };
    }, [data?.masterData]);

    const classes = useMemo(() => {
        const seasonId = activeSeason.id;
        return (data?.classes || []).filter(c => {
            if (seasonId !== 'all' && c.season !== seasonId) return false;
            // 아직 승인 전이거나 반려된 반에는 숙제를 낼 수 없습니다.
            if (c.status === 'proposed' || c.status === 'rejected' || c.status === 'inactive') return false;
            /* 강사는 자기 반만, 나머지 교직원은 전부 봅니다.
               조교는 담당 반 정보가 따로 없어 반을 특정할 수 없습니다. */
            if (currentUser?.role === 'lecturer') {
                return c.lecturerId === currentUser?.id || c.instructorId === currentUser?.id || c.teacherId === currentUser?.id;
            }
            return true;
        });
    }, [data?.classes, activeSeason, currentUser]);

    const [classId, setClassId] = useState('');
    /* 시즌이 바뀌어 지금 고른 반이 목록에서 사라지면 선택을 비웁니다.
       안 비우면 지난 시즌 반에 숙제를 내게 됩니다. */
    useEffect(() => {
        if (classId && !classes.some(c => c.id === classId)) { setClassId(''); return; }
        if (!classId && classes.length) setClassId(classes[0].id);
    }, [classes, classId]);
    const selectedClass = classes.find(c => c.id === classId) || null;

    /* ⚠️ 컨텍스트에는 students 가 없습니다. users 에서 걸러 만들어야 합니다.
       (ExamDiagnosticInput 도 같은 방식입니다) data.students 를 그냥 쓰면
       목록이 늘 비어 있고, 화면은 '이 반에 학생이 없습니다' 로만 보입니다. */
    const studentsInClass = useMemo(() => {
        if (!classId) return [];
        const ids = new Set((data?.enrollments || [])
            .filter(e => e.classId === classId && e.status === 'active')
            .map(e => e.studentId));
        return (Array.isArray(data?.users) ? data.users : [])
            .filter(u => u && u.role === 'student' && ids.has(u.id))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }, [classId, data?.enrollments, data?.users]);

    /* ───────── 출제 ───────── */
    const [picked, setPicked] = useState([]);          // studentId[]
    const [items, setItems] = useState([newItem()]);
    const [pickerIdx, setPickerIdx] = useState(null);
    const [dueDate, setDueDate] = useState(today());
    const [assigning, setAssigning] = useState(false);

    useEffect(() => { setPicked([]); }, [classId]);

    const allPicked = studentsInClass.length > 0 && picked.length === studentsInClass.length;
    const toggleAll = () => setPicked(allPicked ? [] : studentsInClass.map(s => s.id));
    const toggleOne = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const assign = async () => {
        const real = items.filter(i => (i.taskContent || '').trim() !== '');
        if (picked.length === 0) return alert('숙제를 받을 학생을 골라주세요.');
        if (real.length === 0) return alert('숙제 항목을 최소 하나 입력해주세요.');

        setAssigning(true);
        try {
            /* 같이 낸 것을 묶어 두면 나중에 '이 숙제를 누구에게 냈나' 를 볼 수 있습니다. */
            const batchId = doc(collection(db, HW_PATH)).id;
            const batch = writeBatch(db);

            picked.forEach(sid => {
                const student = studentsInClass.find(s => s.id === sid);
                const ref = doc(collection(db, HW_PATH));
                batch.set(ref, {
                    batchId,
                    studentId: sid,
                    studentName: student?.name || '',
                    classId, className: selectedClass?.name || '',
                    subject: selectedClass?.subject || '',
                    assignedBy: currentUser?.id || '',
                    assignedByName: currentUser?.name || '',
                    assignedDate: today(),
                    dueDate,
                    status: 'assigned',
                    items: real.map(it => ({
                        key: it.key,
                        taskContent: it.taskContent.trim(),
                        textbookId: it.textbookId || null,
                        textbookTitle: it.textbookTitle || null,
                        sectionKey: it.sectionKey || null,
                        unitId: it.unitId || null,
                        unitName: it.unitName || null,
                        startNo: Math.max(1, Number(it.startNo) || 1),
                        assignedCount: Number(it.assignedCount) || null,
                        /* 조교가 채점하며 채웁니다. 번호를 남기는 이유는,
                           그 번호를 클리닉에서 꺼내 '왜 틀렸는지' 를 붙이기 위해서입니다. */
                        wrongNumbers: [], blankNumbers: [],
                        attemptedCount: null, correctCount: null, gradedAt: null
                    })),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });

            await batch.commit();
            alert(`${picked.length}명에게 숙제를 냈습니다.`);
            setItems([newItem()]); setPicked([]); setPickerIdx(null);
            setTab('grade'); await loadList();
        } catch (e) {
            alert('배정 실패: ' + e.message);
        } finally {
            setAssigning(false);
        }
    };

    /* ───────── 채점 ───────── */
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [savingId, setSavingId] = useState('');
    const [onlyUngraded, setOnlyUngraded] = useState(true);

    const loadList = useCallback(async () => {
        if (!classId) { setList([]); return; }
        setLoading(true); setError('');
        try {
            /* orderBy 를 쓰지 않습니다 — 복합 색인이 필요해지고, 색인이 없으면 조용히 실패합니다. */
            const snap = await getDocs(query(collection(db, HW_PATH), where('classId', '==', classId)));
            setList(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => String(b.assignedDate || '').localeCompare(String(a.assignedDate || ''))
                    || String(a.studentName || '').localeCompare(String(b.studentName || ''))));
        } catch (e) {
            console.error('[숙제] 목록 조회 실패', e);
            setError(`숙제를 불러오지 못했습니다. (${e.code || e.message})`);
        } finally {
            setLoading(false);
        }
    }, [classId]);

    useEffect(() => { loadList(); }, [loadList]);

    const isGraded = (hw) => (hw.items || []).every(it => !it.assignedCount || it.gradedAt);

    const shown = useMemo(
        () => (onlyUngraded ? list.filter(hw => !isGraded(hw)) : list),
        [list, onlyUngraded]
    );

    const patchItem = (hwId, itemIdx, patch) => {
        setList(prev => prev.map(hw => hw.id !== hwId ? hw : {
            ...hw,
            items: hw.items.map((it, j) => j === itemIdx ? { ...it, ...patch } : it)
        }));
    };

    /* 정답 → 오답 → 안 풂 순으로 돕니다. 시험 채점과 같은 조작입니다. */
    const cycleMark = (hw, itemIdx, no) => {
        const it = hw.items[itemIdx];
        const wrongs = it.wrongNumbers || [];
        const blanks = it.blankNumbers || [];
        const asc = (a, b) => a - b;

        let nw = wrongs, nb = blanks;
        if (wrongs.includes(no)) { nw = wrongs.filter(n => n !== no); nb = [...blanks, no].sort(asc); }
        else if (blanks.includes(no)) { nb = blanks.filter(n => n !== no); }
        else { nw = [...wrongs, no].sort(asc); }

        const total = Number(it.assignedCount) || 0;
        patchItem(hw.id, itemIdx, {
            wrongNumbers: nw, blankNumbers: nb,
            // 안 푼 문항은 분모에서 뺍니다 — 시간이 없어 못 푼 것을 '틀렸다' 로 묶으면 안 됩니다.
            attemptedCount: Math.max(0, total - nb.length),
            correctCount: Math.max(0, total - nb.length - nw.length),
            gradedAt: new Date().toISOString()
        });
    };

    const markAllCorrect = (hw, itemIdx) => {
        const it = hw.items[itemIdx];
        const total = Number(it.assignedCount) || 0;
        const nb = it.blankNumbers || [];
        const nw = it.wrongNumbers || [];
        patchItem(hw.id, itemIdx, {
            attemptedCount: total - nb.length,
            correctCount: total - nb.length - nw.length,
            gradedAt: new Date().toISOString()
        });
    };

    const saveHw = async (hw) => {
        setSavingId(hw.id);
        try {
            await updateDoc(doc(db, HW_PATH, hw.id), {
                items: hw.items,
                status: isGraded(hw) ? 'graded' : 'assigned',
                gradedBy: currentUser?.id || '',
                updatedAt: serverTimestamp()
            });
        } catch (e) { alert('저장 실패: ' + e.message); }
        finally { setSavingId(''); }
    };

    const removeHw = async (hw) => {
        if (!window.confirm(`${hw.studentName} 학생의 이 숙제를 삭제하시겠습니까?`)) return;
        try { await deleteDoc(doc(db, HW_PATH, hw.id)); await loadList(); }
        catch (e) { alert('삭제 실패: ' + e.message); }
    };

    /* ───────── 화면 ───────── */
    return (
        <div className="space-y-6 w-full animate-in fade-in pb-20">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <ClipboardList className="text-indigo-600" /> 숙제 관리
                    </h2>
                    <span className="text-sm text-gray-500 font-medium mt-1 block">
                        교재에서 범위를 골라 내고, 틀린 번호로 채점합니다.
                    </span>
                </div>
                {/* 어느 시즌이 적용됐는지 보여 줍니다.
                    안 보이면 '반이 왜 안 뜨지' 를 사람이 원인 모른 채 겪습니다. */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-2 whitespace-nowrap">
                        {activeSeason.name}
                    </span>
                    <select
                        className="border-2 border-gray-200 p-2.5 rounded-xl font-bold outline-none focus:border-indigo-400 min-w-[200px]"
                        value={classId} onChange={e => setClassId(e.target.value)}
                    >
                        {classes.length === 0 && <option value="">이 시즌에 담당 반이 없습니다</option>}
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex gap-2 border-b border-gray-200">
                {[['grade', '채점하기'], ['assign', '숙제 내기']].map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}
                            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                                tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-800'
                            }`}>{label}</button>
                ))}
            </div>

            {/* ── 숙제 내기 ── */}
            {tab === 'assign' && (
                <div className="space-y-4">
                    <Card>
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-bold text-gray-800 flex items-center gap-1.5">
                                <Users size={16} className="text-indigo-600" /> 받을 학생
                                <span className="text-xs font-bold text-indigo-600 ml-1">{picked.length}명 선택</span>
                            </span>
                            <button type="button" onClick={toggleAll} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                                {allPicked ? '전체 해제' : '전체 선택'}
                            </button>
                        </div>
                        {studentsInClass.length === 0 ? (
                            <p className="text-sm font-bold text-gray-400 py-4 text-center">이 반에 학생이 없습니다.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                {studentsInClass.map(s => {
                                    const on = picked.includes(s.id);
                                    return (
                                        <button key={s.id} type="button" onClick={() => toggleOne(s.id)}
                                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-colors ${
                                                    on ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                                }`}>
                                            {on ? <CheckSquare size={16} className="shrink-0" /> : <Square size={16} className="shrink-0 text-gray-300" />}
                                            <span className="truncate">{s.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Card>
                        <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-gray-800">숙제 항목</span>
                            <button type="button" onClick={() => setItems([...items, newItem()])}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800">+ 항목 추가</button>
                        </div>
                        <p className="text-[11px] text-gray-400 font-medium mb-3">
                            📖 로 교재에서 고르면 단원과 문항 수가 자동으로 붙고, 채점 번호판이 만들어집니다.
                        </p>

                        {items.map((it, idx) => (
                            <div key={it.key} className="mb-2">
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs font-bold bg-gray-100 text-gray-500 w-5 h-5 rounded flex items-center justify-center shrink-0">{idx + 1}</span>
                                    <input type="text"
                                           className="w-full border p-2.5 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400"
                                           placeholder="예: 쎈 공통수학1 p.16-24"
                                           value={it.taskContent}
                                           onChange={e => setItems(items.map((x, j) => j === idx ? { ...x, taskContent: e.target.value } : x))} />
                                    <button type="button" title="교재에서 고르기"
                                            onClick={() => setPickerIdx(pickerIdx === idx ? null : idx)}
                                            className={`p-2 rounded-lg shrink-0 ${it.unitId ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                                        <Book size={16} />
                                    </button>
                                    {items.length > 1 && (
                                        <button type="button" onClick={() => { setItems(items.filter((_, j) => j !== idx)); setPickerIdx(null); }}
                                                className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><X size={16} /></button>
                                    )}
                                </div>

                                {it.unitId && (
                                    <div className="ml-7 mt-1 text-[11px] font-bold text-indigo-700">
                                        {it.unitName} · {it.startNo}~{it.startNo + it.assignedCount - 1}번 ({it.assignedCount}문항)
                                        <button type="button"
                                                onClick={() => setItems(items.map((x, j) => j === idx ? { key: x.key, taskContent: x.taskContent } : x))}
                                                className="ml-1.5 text-gray-400 hover:text-red-500">연결 해제</button>
                                    </div>
                                )}

                                {pickerIdx === idx && (
                                    <div className="ml-7 mt-2">
                                        <TextbookPicker
                                            subject={selectedClass?.subject || null}
                                            onClose={() => setPickerIdx(null)}
                                            onPick={(p) => {
                                                setItems(items.map((x, j) => j === idx ? { ...x, ...p, taskContent: p.text } : x));
                                                setPickerIdx(null);
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}

                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                            <CalendarDays size={15} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-600">제출 기한</span>
                            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                                   className="border border-gray-300 p-2 rounded-lg text-sm font-bold outline-none focus:border-indigo-400" />
                        </div>

                        <Button className="w-full mt-4 py-3.5" onClick={assign} disabled={assigning} icon={Plus}>
                            {assigning ? '배정 중...' : `${picked.length}명에게 숙제 내기`}
                        </Button>
                    </Card>
                </div>
            )}

            {/* ── 채점하기 ── */}
            {tab === 'grade' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={onlyUngraded} onChange={e => setOnlyUngraded(e.target.checked)}
                                   className="w-4 h-4 accent-indigo-600" />
                            채점 안 한 것만 보기
                        </label>
                        <span className="text-xs font-bold text-gray-400">{shown.length}건</span>
                    </div>

                    {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 font-bold">{error}</div>}

                    {loading ? (
                        <div className="py-20 flex justify-center"><Loader className="animate-spin text-indigo-600" size={30} /></div>
                    ) : shown.length === 0 ? (
                        <div className="py-16 text-center text-gray-400 text-sm font-bold">
                            {onlyUngraded ? '채점할 숙제가 없습니다.' : '이 반에 낸 숙제가 없습니다.'}
                        </div>
                    ) : shown.map(hw => (
                        <Card key={hw.id}>
                            <div className="flex justify-between items-start gap-2 mb-3">
                                <div>
                                    <span className="font-bold text-gray-900">{hw.studentName}</span>
                                    <span className="text-xs font-bold text-gray-400 ml-2">
                                        {hw.assignedDate} 배정{hw.dueDate ? ` · ${hw.dueDate} 기한` : ''}
                                    </span>
                                </div>
                                <button onClick={() => removeHw(hw)} className="text-gray-300 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                            </div>

                            {(hw.items || []).map((it, idx) => {
                                const total = Number(it.assignedCount) || 0;
                                const start = Math.max(1, Number(it.startNo) || 1);
                                const wrongs = it.wrongNumbers || [];
                                const blanks = it.blankNumbers || [];
                                const attempted = Math.max(0, total - blanks.length);
                                const correct = Math.max(0, attempted - wrongs.length);
                                const pct = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

                                return (
                                    <div key={it.key || idx} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                                        <div className="font-bold text-sm text-gray-800">{it.taskContent}</div>

                                        {total > 0 ? (
                                            <>
                                                <div className="flex items-center gap-2 flex-wrap mt-1.5 mb-2">
                                                    {it.unitName && (
                                                        <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-1">
                                                            {it.unitName}
                                                        </span>
                                                    )}
                                                    <span className="text-xs font-bold text-gray-600">
                                                        {start}~{start + total - 1}번 · 푼 {attempted}개 중 <span className="text-indigo-700 font-black">{correct}개 정답</span>
                                                        {attempted > 0 && <span className="text-gray-400 ml-1">{pct}%</span>}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-3 mb-1.5 text-[10px] font-bold text-gray-400">
                                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-white border border-gray-300 inline-block" />정답</span>
                                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" />오답</span>
                                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-400 inline-block" />안 풂</span>
                                                </div>

                                                <div className="flex flex-wrap gap-1 p-2 bg-gray-50 rounded-xl border border-gray-100">
                                                    {Array.from({ length: total }, (_, i) => start + i).map(no => {
                                                        const w = wrongs.includes(no), b = blanks.includes(no);
                                                        const tone = w ? 'bg-rose-500 text-white border-rose-600'
                                                            : b ? 'bg-gray-400 text-white border-gray-500'
                                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100';
                                                        return (
                                                            <button key={no} type="button" onClick={() => cycleMark(hw, idx, no)}
                                                                    className={`w-9 h-9 rounded-lg text-xs font-black border transition-colors ${tone}`}>
                                                                {no}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* 전부 정답이면 번호를 하나도 안 누르게 됩니다.
                                                    그러면 '채점 안 함' 과 구분되지 않아 집계가 갓 낸 숙제를 100점으로 셉니다. */}
                                                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                                    {it.gradedAt ? (
                                                        <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                                                            ✓ 채점 완료
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <button type="button" onClick={() => markAllCorrect(hw, idx)}
                                                                    className="text-[11px] font-bold text-emerald-700 border border-emerald-300 hover:bg-emerald-50 rounded px-2 py-1">
                                                                전부 정답 — 채점 완료
                                                            </button>
                                                            <span className="text-[11px] font-bold text-amber-600">
                                                                채점 표시가 없으면 지표에 반영되지 않습니다.
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-[11px] font-bold text-gray-400 mt-1">
                                                교재에서 고르지 않은 항목입니다. 채점 번호판이 없습니다.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}

                            <Button size="sm" className="w-full mt-2" onClick={() => saveHw(hw)} disabled={savingId === hw.id}>
                                {savingId === hw.id ? '저장 중...' : '채점 저장'}
                            </Button>
                        </Card>
                    ))}
                </div>
            )}

            <Card className="bg-blue-50/60 border-blue-200">
                <p className="text-xs text-blue-800 leading-relaxed flex items-start gap-1.5">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>
                        <b>틀린 번호를 남기는 이유</b> — 개수만 세면 '몇 개 틀렸나' 로 끝나지만,
                        번호가 있으면 클리닉에서 그 문제를 꺼내 학생에게 <b>왜 막혔는지</b> 물어보고
                        그 자리에서 원인을 붙일 수 있습니다.
                    </span>
                </p>
            </Card>
        </div>
    );
};

export default HomeworkManager;
