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
    collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp, query, where
} from 'firebase/firestore';
import { db } from '../firebase';
import { BookOpen, Plus, Trash2, Edit3, Loader, X, Layers, AlertCircle } from 'lucide-react';
import { Button, Card, Modal } from '../components/UI';
import UnitSelect from '../components/UnitSelect';
import { findUnit } from '../utils/curriculumUnits';
import { APP_ID } from '../constants';

const PATH = `artifacts/${APP_ID}/public/data/textbooks`;

const emptyBook = () => ({
    title: '', publisher: '', subject: '수학', sections: [], active: true
});

const newSection = () => ({
    key: `s_${Math.random().toString(36).slice(2, 9)}`,
    unitId: null, unitName: '', label: '', count: ''
});

const TextbookManager = ({ currentUser }) => {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);   // { id | null, ...book }
    const [saving, setSaving] = useState(false);

    const canEdit = ['admin', 'admin_assistant', 'lecturer'].includes(currentUser?.role);

    const load = async () => {
        setLoading(true); setError('');
        try {
            const snap = await getDocs(query(collection(db, PATH), where('subject', '==', '수학')));
            setBooks(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))));
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
        const bad = (editing.sections || []).filter(s => !s.unitId || !(Number(s.count) > 0));
        if (bad.length > 0) return alert('각 범위마다 단원과 문항 수를 채워주세요.');

        setSaving(true);
        try {
            const id = editing.id || doc(collection(db, PATH)).id;
            await setDoc(doc(db, PATH, id), {
                title: editing.title.trim(),
                publisher: (editing.publisher || '').trim(),
                subject: '수학',
                active: editing.active !== false,
                sections: (editing.sections || []).map(s => ({
                    key: s.key,
                    unitId: s.unitId,
                    /* 단원 이름을 함께 저장합니다. 숙제 기록을 읽을 때 마스터를 다시
                       조회하지 않아도 되고, 나중에 마스터가 바뀌어도 그때 무엇을 냈는지 남습니다. */
                    unitName: s.unitName || findUnit(s.unitId)?.unitName || '',
                    label: (s.label || '').trim(),
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
                                        {b.publisher || '출판사 미입력'} · 범위 {(b.sections || []).length}개 · 총 {totalOf(b)}문항
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
                                       placeholder="예: 쎈 공통수학1" value={editing.title}
                                       onChange={e => setEditing({ ...editing, title: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">출판사 (선택)</label>
                                <input className="w-full border-2 border-gray-200 p-2.5 rounded-xl font-bold outline-none focus:border-blue-400"
                                       placeholder="예: 좋은책신사고" value={editing.publisher}
                                       onChange={e => setEditing({ ...editing, publisher: e.target.value })} />
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

                            <div className="space-y-2.5 max-h-[42vh] overflow-y-auto pr-1">
                                {editing.sections.map((s, i) => (
                                    <div key={s.key} className="grid grid-cols-12 gap-2 items-start bg-gray-50 border border-gray-200 rounded-xl p-2.5">
                                        <div className="col-span-12 md:col-span-6">
                                            <UnitSelect
                                                value={{ unitId: s.unitId, unitName: s.unitName }}
                                                onChange={({ unitId, unitName }) => setEditing(prev => ({
                                                    ...prev,
                                                    sections: prev.sections.map((x, j) => j === i ? { ...x, unitId, unitName } : x)
                                                }))}
                                                placeholder="단원 검색"
                                            />
                                        </div>
                                        <div className="col-span-7 md:col-span-3">
                                            <input className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-bold outline-none focus:border-blue-400"
                                                   placeholder="범위 표기 (예: p.45-52)" value={s.label}
                                                   onChange={e => setEditing(prev => ({
                                                       ...prev, sections: prev.sections.map((x, j) => j === i ? { ...x, label: e.target.value } : x)
                                                   }))} />
                                        </div>
                                        <div className="col-span-4 md:col-span-2">
                                            <input type="number" min="1" className="w-full border border-gray-300 p-2.5 rounded-lg text-sm font-black text-center outline-none focus:border-blue-400"
                                                   placeholder="문항" value={s.count}
                                                   onChange={e => setEditing(prev => ({
                                                       ...prev, sections: prev.sections.map((x, j) => j === i ? { ...x, count: e.target.value } : x)
                                                   }))} />
                                        </div>
                                        <div className="col-span-1 flex justify-end pt-1.5">
                                            <button type="button" onClick={() => setEditing(prev => ({ ...prev, sections: prev.sections.filter((_, j) => j !== i) }))}
                                                    className="text-gray-400 hover:text-red-600"><X size={16} /></button>
                                        </div>
                                    </div>
                                ))}
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
