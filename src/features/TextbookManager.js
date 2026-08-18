/* [src/features/TextbookManager.js]
   시중 문제집을 등록해 두는 곳입니다.

   [왜 필요한가]
   지금 숙제는 자유 텍스트 한 줄과 완료 O/X 뿐입니다(clinic_tasks.items[]).
   그래서 '몇 문제를 냈는지' 도 '어느 단원인지' 도 모릅니다.
   숙제는 개념테스트보다 문항 수가 3~5배 많은데, 그 데이터가 통째로 버려지고 있었습니다.

   [비용이 O(교재)인 것이 핵심]
   한 번 등록해 두면 모든 반, 모든 학생, 모든 학기에 다시 쓰입니다.
   학생 수에 곱해지지 않습니다. 강사가 교재 하나에 한 번만 들이는 시간입니다.

   [문항을 하나하나 넣지 않습니다]
   쎈 한 권은 1000문항이 넘습니다. 전부 등록하는 것은 현실적이지 않고 필요하지도 않습니다.
   필요한 것은 '이 범위는 어느 단원이고 몇 문항인가' 뿐입니다.
*/

import React, { useState, useEffect, useMemo } from 'react';
import {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { BookOpen, Plus, Trash2, Edit3, Loader, X, Layers, AlertCircle } from 'lucide-react';
import { Button, Card, Modal } from '../components/UI';
import UnitSelect from '../components/UnitSelect';
import { findUnit, CURRICULUM_UNITS } from '../utils/curriculumUnits';
import { activeMainSubjects } from '../utils/subjectMatch';
import { APP_ID } from '../constants';

const PATH = `artifacts/${APP_ID}/public/data/textbooks`;
const DEPT_DOC = `artifacts/${APP_ID}/public/data/settings`;

/* 과정 목록은 단원 마스터에서 만듭니다. 여기에 따로 적어 두면 두 곳이 어긋납니다.

   ⚠️ 과정 이름만으로는 부족합니다. '수학 2-1' 과 '확률과 통계' 는 2015·2022 개정
   양쪽에 같은 이름으로 있고, 단원 번호(unitId)가 서로 다릅니다.
   교육과정을 같이 정하지 않으면 숙제가 개념테스트와 다른 단원에 쌓입니다. */
const COURSE_OPTIONS = (() => {
    const seen = new Map();
    CURRICULUM_UNITS.forEach(u => {
        const key = `${u.course}|${u.curriculum}`;
        if (!seen.has(key)) seen.set(key, { key, course: u.course, curriculum: u.curriculum, schoolLevel: u.schoolLevel });
    });
    return [...seen.values()].sort((a, b) =>
        (a.curriculum === '2022' ? 0 : 1) - (b.curriculum === '2022' ? 0 : 1)
        || (a.schoolLevel === '중학교' ? 0 : 1) - (b.schoolLevel === '중학교' ? 0 : 1)
        || a.course.localeCompare(b.course));
})();

const COURSE_GROUPS = COURSE_OPTIONS.reduce((acc, c) => {
    const label = `${c.curriculum} 개정 · ${c.schoolLevel}${c.curriculum === '2015' ? ' (고3·재수생)' : ''}`;
    const g = acc.find(x => x.label === label);
    if (g) g.items.push(c); else acc.push({ label, items: [c] });
    return acc;
}, []);

// 과정 목록이 있는 과목만 범위(단원)를 요구합니다. 지금은 수학뿐입니다.
const SUBJECTS_WITH_COURSES = ['수학'];

const emptyBook = () => ({
    title: '', publisher: '', subject: '', course: '', curriculum: '', sections: [], active: true
});

/* startNo: 교재의 뒤쪽 단원은 문항 번호가 1번부터 시작하지 않습니다.
   (예: 3단원이 101번부터 160번) 채점 화면의 번호판이 실제 번호와 같아야
   조교가 답안지와 대조할 수 있습니다. */
const newSection = () => ({
    key: `s_${Math.random().toString(36).slice(2, 9)}`,
    unitId: null, unitName: '', label: '', startNo: 1, count: ''
});

const TextbookManager = ({ currentUser }) => {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);   // { id | null, ...book }
    const [saving, setSaving] = useState(false);

    const canEdit = ['admin', 'admin_assistant', 'lecturer'].includes(currentUser?.role);

    /* 과목 드롭다운은 환경설정에서 켠 대과목만 보여 줍니다.
       학원 전체가 쓰는 과목 어휘와 같아야, 나중에 반·시험과 이어 붙일 수 있습니다. */
    const [subjects, setSubjects] = useState([]);
    useEffect(() => {
        getDoc(doc(db, DEPT_DOC, 'departments'))
            .then(snap => setSubjects(activeMainSubjects(snap.exists() ? snap.data().active : null)))
            .catch(e => { console.error('[교재] 대과목 로드 실패', e); setSubjects(activeMainSubjects(null)); });
    }, []);

    const load = async () => {
        setLoading(true); setError('');
        try {
            const snap = await getDocs(collection(db, PATH));
            setBooks(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => String(a.subject || '').localeCompare(String(b.subject || ''))
                    || String(a.title || '').localeCompare(String(b.title || ''))));
        } catch (e) {
            console.error('[교재] 목록 조회 실패', e);
            setError(`교재를 불러오지 못했습니다. (${e.code || e.message})`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const totalOf = (b) => (b.sections || []).reduce((n, s) => n + (Number(s.count) || 0), 0);

    const save = async () => {
        if (!editing.title.trim()) return alert('교재 이름을 입력해주세요.');
        if (!editing.subject) return alert('교재 과목을 선택해주세요.');
        /* 문항 수는 반드시 있어야 합니다 — 없으면 채점 번호판을 만들 수 없습니다.
           단원은 비워 둘 수 있습니다. 교재에 따라 여러 단원이 한 장(章)에 섞여 있거나
           종합 문제라 한 단원으로 못 묶는 범위가 있기 때문입니다.
           단원이 없으면 정답률(과제 신뢰도)은 그대로 쌓이고, 단원별 현황에만 안 들어갑니다. */
        const bad = (editing.sections || []).filter(s => !(Number(s.count) > 0));
        if (bad.length > 0) return alert('각 범위마다 문항 수를 채워주세요.');

        setSaving(true);
        try {
            const id = editing.id || doc(collection(db, PATH)).id;
            await setDoc(doc(db, PATH, id), {
                title: editing.title.trim(),
                publisher: (editing.publisher || '').trim(),
                subject: editing.subject,
                course: editing.course || '',
                /* 과정 이름만으로는 부족합니다. '수학 2-1' 은 2015·2022 양쪽에 있고
                   단원 번호가 서로 다릅니다. 교육과정을 같이 남겨야 숙제가
                   개념테스트와 같은 단원에 쌓입니다. */
                curriculum: editing.curriculum || '',
                active: editing.active !== false,
                sections: (editing.sections || []).map(s => ({
                    key: s.key,
                    unitId: s.unitId,
                    /* 단원 이름을 함께 저장합니다. 숙제 기록을 읽을 때 마스터를 다시
                       조회하지 않아도 되고, 나중에 마스터가 바뀌어도 그때 무엇을 냈는지 남습니다. */
                    unitName: s.unitName || findUnit(s.unitId)?.unitName || '',
                    label: (s.label || '').trim(),
                    startNo: Math.max(1, Number(s.startNo) || 1),
                    count: Number(s.count)
                })),
                updatedAt: serverTimestamp(),
                ...(editing.id ? {} : { createdAt: serverTimestamp(), createdBy: currentUser?.id || '' })
            }, { merge: true });
            setEditing(null);
            await load();
        } catch (e) {
            alert('저장 실패: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (b) => {
        if (!window.confirm(`'${b.title}' 교재를 삭제하시겠습니까?\n이미 낸 숙제 기록은 그대로 남습니다.`)) return;
        try { await deleteDoc(doc(db, PATH, b.id)); await load(); }
        catch (e) { alert('삭제 실패: ' + e.message); }
    };

    return (
        <div className="space-y-6 w-full animate-in fade-in pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BookOpen className="text-blue-600" /> 교재 관리
                    </h2>
                    <span className="text-sm text-gray-500 font-medium mt-1 block">
                        시중 문제집의 범위와 단원을 등록해 두면, 숙제를 낼 때 골라 쓰고 단원이 자동으로 붙습니다.
                    </span>
                </div>
                {canEdit && (
                    <Button icon={Plus} onClick={() => setEditing({ id: null, ...emptyBook(), sections: [newSection()] })}>
                        <span className="hidden sm:inline">교재 등록</span><span className="sm:hidden">등록</span>
                    </Button>
                )}
            </div>

            <Card className="bg-blue-50/60 border-blue-200">
                <p className="text-sm text-blue-900 font-bold flex items-center gap-1.5 mb-1">
                    <AlertCircle size={16} /> 문항을 하나하나 넣지 않습니다
                </p>
                <p className="text-xs text-blue-800 leading-relaxed">
                    쎈 한 권은 1000문항이 넘습니다. 전부 등록할 필요가 없습니다.
                    필요한 것은 <b>이 범위가 어느 단원이고 몇 문항인가</b> 뿐입니다.
                    한 번 등록하면 모든 반·모든 학기에 다시 쓰입니다.
                </p>
                <p className="text-xs text-blue-800 leading-relaxed mt-2 pt-2 border-t border-blue-200">
                    <b>교재의 한 장에 두 단원이 묶여 있다면</b>(예: '부정적분과 정적분')
                    <b> [범위 쪼개기]</b>로 번호를 나누세요. 채점 번호판은 그대로이고 결과만 단원별로 쌓입니다.
                    정말 섞여 있어 못 나누는 범위는 <b>단원을 비워 두어도 됩니다</b> —
                    정답률은 쌓이고 단원별 현황에만 안 들어갑니다.
                </p>
            </Card>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 font-bold">{error}</div>}

            {loading ? (
                <div className="py-20 flex justify-center"><Loader className="animate-spin text-blue-600" size={32} /></div>
            ) : books.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm font-bold">
                    등록된 교재가 없습니다. 자주 쓰는 문제집부터 하나 등록해 보세요.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {books.map(b => (
                        <Card key={b.id} className="flex flex-col">
                            <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-bold text-gray-900 truncate">{b.title}</h3>
                                    <p className="text-xs text-gray-500 font-bold mt-0.5">
                                        <span className="text-indigo-600">{b.subject || '과목 미지정'}{b.course ? ` · ${b.course}` : ''}</span>
                                        {' · '}{b.publisher || '출판사 미입력'} · 범위 {(b.sections || []).length}개 · 총 {totalOf(b)}문항
                                    </p>
                                </div>
                                {canEdit && (
                                    <div className="flex gap-1 shrink-0">
                                        <button onClick={() => setEditing({ ...b, sections: (b.sections || []).map(s => ({ ...s })) })}
                                                className="p-1.5 text-gray-400 hover:text-blue-600" title="수정"><Edit3 size={16} /></button>
                                        <button onClick={() => remove(b)}
                                                className="p-1.5 text-red-400 hover:text-red-600" title="삭제"><Trash2 size={16} /></button>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {(b.sections || []).slice(0, 8).map(s => (
                                    <span key={s.key} className="text-[11px] font-bold bg-gray-50 border border-gray-200 rounded px-1.5 py-1 text-gray-600">
                                        {s.unitName}{s.label ? ` · ${s.label}` : ''} <span className="text-gray-400">{s.count}문항</span>
                                    </span>
                                ))}
                                {(b.sections || []).length > 8 && (
                                    <span className="text-[11px] font-bold text-gray-400 px-1.5 py-1">외 {(b.sections || []).length - 8}개</span>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.id ? '교재 수정' : '교재 등록'} maxWidthClass="max-w-3xl">
                {editing && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">교재 이름</label>
                                <input className="w-full border-2 border-gray-200 p-2.5 rounded-xl font-bold outline-none focus:border-blue-400"
                                       placeholder="예: 쎈" value={editing.title}
                                       onChange={e => setEditing({ ...editing, title: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">출판사 (선택)</label>
                                <input className="w-full border-2 border-gray-200 p-2.5 rounded-xl font-bold outline-none focus:border-blue-400"
                                       placeholder="예: 좋은책신사고" value={editing.publisher}
                                       onChange={e => setEditing({ ...editing, publisher: e.target.value })} />
                            </div>
                            <div>
                                {/* 환경설정에서 켠 대과목만 나옵니다.
                                    학원 전체가 쓰는 과목 어휘와 같아야 나중에 반·시험과 이어 붙일 수 있습니다. */}
                                <label className="block text-xs font-bold text-gray-600 mb-1">과목</label>
                                <select className="w-full border-2 border-gray-200 p-2.5 rounded-xl font-bold outline-none focus:border-blue-400"
                                        value={editing.subject}
                                        onChange={e => setEditing({ ...editing, subject: e.target.value, course: '' })}>
                                    <option value="">과목을 고르세요</option>
                                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">
                                    과정 <span className="font-normal text-gray-400">(선택 — 고르면 그 과정 단원만 보입니다)</span>
                                </label>
                                <select className="w-full border-2 border-gray-200 p-2.5 rounded-xl font-bold outline-none focus:border-blue-400 disabled:opacity-50"
                                        disabled={!SUBJECTS_WITH_COURSES.includes(editing.subject)}
                                        value={editing.course ? `${editing.course}|${editing.curriculum}` : ''}
                                        onChange={e => {
                                            const [course, curriculum] = (e.target.value || '').split('|');
                                            setEditing({ ...editing, course: course || '', curriculum: curriculum || '' });
                                        }}>
                                    <option value="">
                                        {SUBJECTS_WITH_COURSES.includes(editing.subject) ? '해당 없음 / 여러 과정' : '이 과목은 과정 목록이 없습니다'}
                                    </option>
                                    {SUBJECTS_WITH_COURSES.includes(editing.subject) && COURSE_GROUPS.map(g => (
                                        <optgroup key={g.label} label={g.label}>
                                            {g.items.map(c => <option key={c.key} value={c.key}>{c.course}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                    <Layers size={15} /> 범위
                                </label>
                                <button type="button" onClick={() => setEditing({ ...editing, sections: [...editing.sections, newSection()] })}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800">+ 범위 추가</button>
                            </div>
                            <p className="text-[11px] text-gray-400 font-medium mb-2">
                                교재의 목차 단위로 넣으면 됩니다. 범위 표기는 숙제 낼 때 그대로 보입니다.
                            </p>

                            {/* 예전에는 한 줄에 4칸을 욱여넣어 문항 수 칸이 화면 밖으로 잘렸습니다.
                                단원(넓음)을 위에, 나머지 숫자 칸을 아래 한 줄에 둡니다. */}
                            <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                                {editing.sections.map((s, i) => {
                                    const start = Math.max(1, Number(s.startNo) || 1);
                                    const cnt = Number(s.count) || 0;
                                    const setField = (patch) => setEditing(prev => ({
                                        ...prev, sections: prev.sections.map((x, j) => j === i ? { ...x, ...patch } : x)
                                    }));
                                    return (
                                        <div key={s.key} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[11px] font-black bg-white border border-gray-300 text-gray-500 w-6 h-6 rounded flex items-center justify-center shrink-0">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <UnitSelect
                                                        value={{ unitId: s.unitId, unitName: s.unitName }}
                                                        course={editing.course || null}
                                                        curriculum={editing.curriculum || null}
                                                        onChange={({ unitId, unitName }) => setField({ unitId, unitName })}
                                                        placeholder={editing.course ? `${editing.course} 단원 고르기` : '단원 검색'}
                                                    />
                                                </div>
                                                {/* 교재의 한 장에 두 단원이 묶여 있는 경우
                                                    (예: 마더텅 '부정적분과 정적분').
                                                    번호로 쪼개면 단원별로 쌓입니다.
                                                    손으로 번호를 계산하면 반드시 어긋나므로 여기서 계산합니다. */}
                                                {cnt > 1 && (
                                                    <button
                                                        type="button" title="두 단원이 묶인 범위를 번호로 쪼갭니다"
                                                        onClick={() => setEditing(prev => {
                                                            const half = Math.floor(cnt / 2);
                                                            const rest = cnt - half;
                                                            const next = [...prev.sections];
                                                            next.splice(i, 1,
                                                                { ...s, count: half },
                                                                { ...newSection(), label: '', startNo: start + half, count: rest }
                                                            );
                                                            return { ...prev, sections: next };
                                                        })}
                                                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-2 py-1.5 shrink-0"
                                                    >범위 쪼개기</button>
                                                )}
                                                <button type="button" onClick={() => setEditing(prev => ({ ...prev, sections: prev.sections.filter((_, j) => j !== i) }))}
                                                        className="text-gray-400 hover:text-red-600 shrink-0 p-1"><X size={16} /></button>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-8">
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">범위 표기 (선택)</label>
                                                    <input className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-bold outline-none focus:border-blue-400"
                                                           placeholder="예: p.45-52" value={s.label || ''}
                                                           onChange={e => setField({ label: e.target.value })} />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">시작 번호</label>
                                                    <input type="number" min="1"
                                                           className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-black text-center outline-none focus:border-blue-400"
                                                           value={s.startNo ?? 1}
                                                           onChange={e => setField({ startNo: e.target.value })} />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">문항 수</label>
                                                    <input type="number" min="1"
                                                           className="w-full border-2 border-blue-200 bg-white p-2.5 rounded-lg text-sm font-black text-center outline-none focus:border-blue-500"
                                                           placeholder="60" value={s.count}
                                                           onChange={e => setField({ count: e.target.value })} />
                                                </div>
                                            </div>

                                            {cnt > 0 && (
                                                <p className="text-[11px] font-bold text-blue-700 mt-1.5 pl-8">
                                                    {start}번 ~ {start + cnt - 1}번 · {cnt}문항
                                                </p>
                                            )}

                                            {/* 단원을 비워 두면 무엇을 잃는지 그 자리에서 알려 줍니다.
                                                조용히 빠지면 나중에 왜 단원별 현황이 비었는지 알 수 없습니다. */}
                                            {!s.unitId && cnt > 0 && (
                                                <p className="text-[11px] font-bold text-amber-700 mt-1 pl-8">
                                                    단원을 비워 두면 정답률은 쌓이지만 <b>단원별 현황에는 안 들어갑니다.</b>
                                                    {' '}여러 단원이 섞인 범위라면, 번호로 쪼개면 단원별로 쌓입니다.
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <Button className="w-full py-3.5" onClick={save} disabled={saving}>
                            {saving ? <Loader className="animate-spin mx-auto" size={20} /> : '저장'}
                        </Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default TextbookManager;
