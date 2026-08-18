/* [src/components/TextbookPicker.js]
   등록해 둔 교재에서 숙제 범위를 골라 옵니다.

   [왜 필요한가]
   지금 숙제는 '쎈 수학 p.20-25 오답 완수' 같은 자유 텍스트 한 줄입니다.
   사람은 읽지만 시스템은 아무것도 모릅니다 — 몇 문제인지, 어느 단원인지.
   그래서 숙제에서 나오는 데이터가 통째로 버려집니다.

   교재에서 고르면 문항 수와 단원이 자동으로 붙습니다.
   조교가 따로 입력할 것이 없습니다.
*/

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Book, Loader, X } from 'lucide-react';
import { APP_ID } from '../constants';

const PATH = `artifacts/${APP_ID}/public/data/textbooks`;

const TextbookPicker = ({ onPick, onClose }) => {
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openId, setOpenId] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, PATH), where('subject', '==', '수학')));
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(b => b.active !== false && (b.sections || []).length > 0)
                    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
                setBooks(list);
                setOpenId(list[0]?.id || null);
            } catch (e) {
                console.error('[교재 선택] 조회 실패', e);
                setError(`교재를 불러오지 못했습니다. (${e.code || e.message})`);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return (
        <div className="border-2 border-indigo-200 bg-indigo-50/40 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-indigo-800 flex items-center gap-1.5">
                    <Book size={14} /> 교재에서 범위 고르기
                </span>
                <button type="button" onClick={onClose} className="text-indigo-400 hover:text-indigo-700"><X size={15} /></button>
            </div>

            {loading ? (
                <div className="py-5 flex justify-center"><Loader className="animate-spin text-indigo-500" size={20} /></div>
            ) : error ? (
                <div className="text-xs font-bold text-red-600">{error}</div>
            ) : books.length === 0 ? (
                <div className="text-xs font-bold text-gray-500 py-2">
                    등록된 교재가 없습니다. [교재 관리] 에서 먼저 등록해 주세요.
                </div>
            ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {books.map(b => (
                        <div key={b.id} className="bg-white border border-indigo-100 rounded-lg overflow-hidden">
                            <button
                                type="button" onClick={() => setOpenId(openId === b.id ? null : b.id)}
                                className="w-full text-left px-2.5 py-2 text-xs font-bold text-gray-800 hover:bg-indigo-50"
                            >
                                {b.title}
                                <span className="text-gray-400 font-medium ml-1.5">범위 {(b.sections || []).length}개</span>
                            </button>
                            {openId === b.id && (
                                <div className="px-2 pb-2 flex flex-wrap gap-1.5">
                                    {(b.sections || []).map(s => (
                                        <button
                                            key={s.key} type="button"
                                            onClick={() => onPick({
                                                textbookId: b.id, textbookTitle: b.title, sectionKey: s.key,
                                                unitId: s.unitId, unitName: s.unitName,
                                                assignedCount: Number(s.count) || 0,
                                                text: `${b.title} ${s.label || s.unitName} (${s.count}문항)`
                                            })}
                                            className="text-[11px] font-bold border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 rounded px-2 py-1.5 text-left"
                                        >
                                            {s.unitName}
                                            {s.label && <span className="text-gray-400 ml-1">{s.label}</span>}
                                            <span className="text-indigo-600 ml-1">{s.count}문항</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TextbookPicker;
