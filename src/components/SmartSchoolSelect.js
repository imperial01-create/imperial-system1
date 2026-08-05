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
import { Search, X } from 'lucide-react';

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
  onCustomSelect,
  disabled = false,
  size = 'sm',
  className = 'w-full'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const s = SIZES[size] || SIZES.sm;

  const schools = schoolsData?.[schoolType] || [];
  const favorites = schoolsData?.favorites || [];
  const pinned = schools.filter(x => favorites.includes(x) && x.includes(search));
  const others = schools.filter(x => !favorites.includes(x) && x.includes(search));

  const close = () => { setIsOpen(false); setSearch(''); };

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

                  {onCustomSelect && (
                    <div
                      onClick={() => { onCustomSelect(); close(); }}
                      className={`hover:bg-gray-100 rounded-lg cursor-pointer font-bold text-blue-600 mt-1 border border-dashed border-gray-300 text-center ${s.item}`}
                    >
                      ➕ 목록에 없음 (직접 입력)
                    </div>
                  )}
                </div>
              </div>
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
