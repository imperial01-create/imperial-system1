/* 학교 검색·선택 드롭다운 (공용)

   기존에는 App.js / SchoolStrategy.js / UserManager.js / ExamArchive.js 네 곳에
   같은 컴포넌트가 복사되어 있었습니다.
   - SchoolStrategy와 ExamArchive의 사본은 완전히 동일했고
   - App.js와 UserManager.js의 사본은 여백·글자 크기만 달랐습니다.
   즐겨찾기 정렬이나 검색 방식을 바꾸려면 네 곳을 모두 고쳐야 했고,
   한 곳만 놓치면 그 화면만 다르게 동작했습니다.

   크기 차이는 size 옵션으로 흡수했으므로 화면 모양은 기존과 동일합니다.
     size="lg" : 회원가입 화면처럼 크게 (기존 App.js 사본)
     size="sm" : 관리 화면처럼 조밀하게 (기존 나머지 사본, 기본값)
*/

import React, { useState } from 'react';
import { Search, X, Plus, Loader, AlertCircle } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { APP_ID } from '../constants';
import { normalizeSchoolName, findCanonicalSchool, detectSchoolType } from '../utils/schoolName';

const SIZES = {
  lg: {
    trigger: 'p-3 rounded-xl border-2',
    triggerOpen: 'border-blue-500 bg-blue-50/50',
    triggerIdle: 'bg-white hover:bg-gray-50',
    panel: 'mt-2 rounded-2xl shadow-2xl max-h-72',
    searchWrap: 'p-3 bg-gray-50/80',
    searchIcon: 16,
    searchInput: 'pl-9 pr-3 py-2 text-sm',
    listPad: 'pb-2',
    favWrap: 'p-2',
    favLabel: 'text-[11px] mb-1.5 px-2',
    item: 'px-3 py-2.5 text-sm',
    gap: 'gap-1'
  },
  sm: {
    trigger: 'p-2.5 rounded-lg border',
    triggerOpen: 'border-blue-500 bg-blue-50',
    triggerIdle: 'bg-white hover:bg-gray-50',
    panel: 'mt-1 rounded-xl shadow-xl max-h-64',
    searchWrap: 'p-2 bg-gray-50',
    searchIcon: 14,
    searchInput: 'pl-8 pr-2 py-1.5 text-xs',
    listPad: 'pb-1',
    favWrap: 'p-1.5',
    favLabel: 'text-[10px] mb-1 px-1',
    item: 'px-2 py-1.5 text-xs',
    gap: 'gap-0.5'
  }
};

const SmartSchoolSelect = ({
  schoolType,
  schoolsData,
  value,
  onChange,
  onCustomSelect,        // (선택) 예전 방식의 자유 입력 전환. 새 코드에서는 쓰지 마세요.
  onSchoolAdded,         // 마스터 목록에 학교가 추가됐을 때 부모에게 알림
  allowAddNew = true,    // 목록에 없는 학교를 마스터에 추가할 수 있게 할지
  disabled = false,
  size = 'sm',
  className = 'w-full'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const s = SIZES[size] || SIZES.sm;

  const schools = schoolsData?.[schoolType] || [];
  const favorites = schoolsData?.favorites || [];

  /* '영일고'를 쳐도 '영일고등학교'가 나오도록 공백·접미사 차이를 무시하고 찾습니다.
     검색 결과가 0건이면 사용자가 '새 학교로 추가'를 눌러 중복 표기를 만들게 되므로,
     검색이 잘 되는 것 자체가 오염을 막는 장치입니다. */
    const matches = (name) => {
    const q = search.trim();
    if (!q) return true;
    if (name.includes(q)) return true;
    const nq = normalizeSchoolName(q);
    return !!nq && normalizeSchoolName(name).includes(nq.replace(/(초등학교|중학교|고등학교)$/, ''));
  };

  const pinned = schools.filter(x => favorites.includes(x) && matches(x));
  const others = schools.filter(x => !favorites.includes(x) && matches(x));

  const close = () => { setIsOpen(false); setSearch(''); setAddMode(false); setNewName(''); setAddError(''); };

  /* 목록에 없는 학교를 '마스터 목록에 등록'하고 그 값을 선택합니다.

     예전에는 여기가 '직접 입력'이라, 입력한 문자열이 아무 검증 없이 그대로 저장됐습니다.
     그 결과 같은 학교가 '영일고' / '영일 고등학교' / '영일고등학교' 로 흩어져
     학사일정·기출 검색이 서로 다른 결과를 냈습니다.
     이제는 추가한 즉시 정본이 되어, 다음 사람은 목록에서 고르게 됩니다. */
  const handleAddNew = async () => {
    const raw = newName.trim();
    setAddError('');
    if (!raw) return setAddError('학교 이름을 입력해주세요.');

    // 이미 같은 학교가 등록돼 있으면 새로 만들지 않고 그것을 고릅니다.
    const existing = findCanonicalSchool(raw, schoolsData);
    if (existing) {
      onChange(existing);
      close();
      return;
    }

    const canonical = normalizeSchoolName(raw);
    if (!/(초등학교|중학교|고등학교)$/.test(canonical)) {
      return setAddError("'○○고', '○○중학교' 처럼 학교 종류가 드러나게 입력해주세요.");
    }

    // 입력 내용으로 학교급을 판단해 엉뚱한 칸에 들어가지 않게 합니다.
    const targetType = detectSchoolType(canonical) || schoolType;

    setSaving(true);
    try {
      const nextList = [...new Set([...(schoolsData?.[targetType] || []), canonical])]
        .sort((a, b) => a.localeCompare(b, 'ko-KR'));

      await setDoc(
        doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schools'),
        { ...schoolsData, [targetType]: nextList },
        { merge: true }
      );

      onChange(canonical);
      if (onSchoolAdded) onSchoolAdded(targetType, canonical, nextList);
      close();
    } catch (e) {
      console.error('학교 추가 실패:', e);
      setAddError(
        e?.code === 'permission-denied'
          ? '학교 목록에 추가할 권한이 없습니다. 데스크에 학교 등록을 요청해주세요.'
          : '학교 추가 중 오류가 발생했습니다: ' + (e.message || '')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`relative ${className}`}
      style={disabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
    >
      <div
        className={`w-full outline-none font-bold text-sm cursor-pointer flex justify-between items-center transition-colors ${s.trigger} ${isOpen ? s.triggerOpen : s.triggerIdle}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={value ? 'text-blue-900' : 'text-gray-400'}>
          {value || '👇 학교명 검색 및 선택'}
        </span>
      </div>

      {isOpen && (
        <>
          {/* 바깥을 누르면 닫히도록 하는 투명 덮개 */}
          <div className="fixed inset-0 z-40" onClick={close} />

          <div className={`absolute z-50 w-full bg-white border-2 border-blue-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${s.panel}`}>
            <div className={`border-b border-gray-100 ${s.searchWrap}`}>
              <div className="relative">
                <Search size={s.searchIcon} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  className={`w-full bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 font-bold ${s.searchInput}`}
                  placeholder="학교명 검색..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className={`overflow-y-auto flex-1 custom-scrollbar ${s.listPad}`}>
              {pinned.length > 0 && (
                <>
                  <div className={`bg-yellow-50/40 ${s.favWrap}`}>
                    <div className={`font-black text-yellow-600 tracking-tight ${s.favLabel}`}>📌 자주 찾는 학교</div>
                    <div className={`grid grid-cols-1 ${s.gap}`}>
                      {pinned.map(name => (
                        <div
                          key={name}
                          onClick={() => { onChange(name); close(); }}
                          className={`hover:bg-white border border-transparent hover:border-yellow-200 rounded-lg cursor-pointer font-bold text-gray-800 transition-all ${s.item}`}
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="h-px bg-gray-100" />
                </>
              )}

              <div className={s.favWrap}>
                {others.length === 0 && search && pinned.length === 0 && (
                  <div className="text-center py-3 text-[11px] font-bold text-gray-400">검색 결과가 없습니다.</div>
                )}
                <div className={`grid grid-cols-1 ${s.gap}`}>
                  {others.map(name => (
                    <div
                      key={name}
                      onClick={() => { onChange(name); close(); }}
                      className={`hover:bg-blue-50 rounded-lg cursor-pointer font-bold text-gray-700 transition-colors ${s.item}`}
                    >
                      {name}
                    </div>
                  ))}

                  {/* 목록에 없는 학교 → 마스터 목록에 등록한 뒤 선택 */}
                  {allowAddNew && !addMode && (
                    <div
                      onClick={() => { setAddMode(true); setNewName(search); }}
                      className={`hover:bg-blue-50 rounded-lg cursor-pointer font-bold text-blue-600 mt-1 border border-dashed border-blue-300 text-center flex items-center justify-center gap-1 ${s.item}`}
                    >
                      <Plus size={14} /> 목록에 없음 — 새 학교로 추가
                    </div>
                  )}

                  {/* 예전 방식(자유 입력). 호환용이며 새로 쓰지 않습니다. */}
                  {!allowAddNew && onCustomSelect && (
                    <div
                      onClick={() => { onCustomSelect(); close(); }}
                      className={`hover:bg-gray-100 rounded-lg cursor-pointer font-bold text-blue-600 mt-1 border border-dashed border-gray-300 text-center ${s.item}`}
                    >
                      ➕ 목록에 없음 (직접 입력)
                    </div>
                  )}
                </div>
              </div>

              {addMode && (
                <div className="p-3 border-t border-blue-100 bg-blue-50/50 space-y-2">
                  <div className="text-[11px] font-bold text-blue-800 leading-relaxed">
                    새 학교를 목록에 추가합니다.<br />추가하면 이후 모든 화면에서 같은 이름으로 쓰입니다.
                  </div>
                  <input
                    type="text"
                    autoFocus
                    className="w-full border-2 border-blue-300 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
                    placeholder="예: 목동고 (또는 목동고등학교)"
                    value={newName}
                    onChange={e => { setNewName(e.target.value); setAddError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNew(); } }}
                  />
                  {newName.trim() && !addError && (
                    <div className="text-[11px] font-bold text-slate-600">
                      저장될 이름: <span className="text-blue-700">{normalizeSchoolName(newName) || '-'}</span>
                    </div>
                  )}
                  {addError && (
                    <div className="text-[11px] font-bold text-rose-600 flex items-start gap-1">
                      <AlertCircle size={13} className="shrink-0 mt-0.5" /> <span>{addError}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddNew}
                      disabled={saving}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2 rounded-lg flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                      {saving ? '추가 중' : '추가하고 선택'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddMode(false); setAddError(''); }}
                      className="px-3 bg-white border border-gray-300 text-gray-600 font-bold text-sm py-2 rounded-lg hover:bg-gray-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/** 직접 입력 상태일 때 쓰는 입력창. 네 화면에서 같은 형태로 반복되던 마크업입니다. */
export const CustomSchoolInput = ({ value, onChange, onCancel, className = 'w-full' }) => (
  <div className={`relative ${className}`}>
    <input
      className="w-full border-2 border-blue-400 p-2.5 rounded-lg bg-white font-bold text-sm pr-8 outline-none focus:border-blue-500"
      placeholder="학교명 직접 입력"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
    <button
      type="button"
      onClick={onCancel}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 bg-gray-100 rounded-full p-1 transition-colors"
    >
      <X size={14} />
    </button>
  </div>
);

export default SmartSchoolSelect;
