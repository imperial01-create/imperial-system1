/* =========================================================================
   임페리얼 학원 AI 수학 지식 맵 뷰어

   [이번 수정에서 고친 것]
   1. 스키마 v2 대응 (STATUS.md 0-9)
      - v2 노드(type: concept|skill|pattern|trap)의 몸체 키(definition,
        trigger_signals, procedure, recognition, symptom …)가 하나도 렌더링되지
        않아 이관 후 상세 화면이 전부 빈칸이 될 상태였다.
      - v1 키(core_concepts …) 렌더링은 그대로 두고, type 필드 유무로 분기한다.
        이관 전(v1)·이관 중(혼재)·이관 후(v2) 모두에서 동작한다.
      - 관계 6종(applies_to, combines, alternative_to, faster_than, trap_of)을
        상세 패널(이동 버튼)과 연결도(색·점선·라벨)에 표시한다.
        기존에는 prerequisite 하나만 그렸으므로 새 노드가 외딴 상자가 됐다.
   2. 현황판 탭 추가 (STATUS.md 0-10)
      - 교직원에게만 보이는 대시보드. 서버 없이 build.json 만으로 계산한다:
        대분류별 진행률(목표는 STATUS.md 의 1,121개 계획), 관계별 간선 수,
        중복(조상 재지정) 간선, 최장 학습 경로, v1→v2 이관 진행률, 원고 보유율.
   ------------------------------------------------------------------------
   [이전 수정 이력] Edit Source 404, practical_concepts 미렌더, 모바일 탭 재구성,
   h-screen 이중 스크롤, 오류 원인 노출, 세션 캐시, "작성 예정" 문구 차단.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MarkerType,
  useNodesState, useEdgesState, Handle, Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  Search, Target, AlertCircle, Loader2, BookOpen, Key,
  AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Map, Github, Edit3,
  Tag, Wrench, ArrowUpRight, RefreshCw, ListTree, FileText,
  LayoutDashboard, Zap, Clock, GitBranch, Lightbulb, Ban, Stethoscope
} from 'lucide-react';

import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { useData } from '../../contexts/DataContext';

const STAFF_ROLES = ['admin', 'admin_assistant', 'lecturer', 'ta'];

/* 화면을 드나들 때마다 2.7MB를 다시 받지 않도록 세션 동안 메모리에 보관한다. */
let ontologyCache = null;

// =====================================================================
// 1. 텍스트 & 수식(LaTeX) 자동 분리 렌더러
// =====================================================================
const MathText = ({ content }) => {
  if (content === null || content === undefined) return null;
  if (typeof content !== 'string') return <span>{String(content)}</span>;

  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);

  return (
    <span className="leading-relaxed">
      {parts.map((part, index) => {
        try {
          if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
            return <BlockMath key={index} math={part.slice(2, -2)} />;
          }
          if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
            return <InlineMath key={index} math={part.slice(1, -1)} />;
          }
        } catch (e) {
          // 수식 문법이 깨져도 화면 전체가 죽지 않도록 원문을 그대로 보여준다
          return <span key={index} className="text-rose-600">{part}</span>;
        }
        return <span key={index} className="whitespace-pre-wrap">{part}</span>;
      })}
    </span>
  );
};

// =====================================================================
// 2. 대분류 기반 색상 테마 + v2 노드 타입 메타
// =====================================================================
const getCategoryTheme = (majorCategory) => {
  const major = (majorCategory || '').toLowerCase();
  if (major.includes('대수')) return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', handle: 'bg-blue-500', bar: 'bg-blue-500' };
  if (major.includes('해석') || major.includes('미적')) return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700', handle: 'bg-red-500', bar: 'bg-red-500' };
  if (major.includes('기하')) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700', handle: 'bg-green-500', bar: 'bg-green-500' };
  if (major.includes('확률') || major.includes('통계')) return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700', handle: 'bg-orange-500', bar: 'bg-orange-500' };
  return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700', handle: 'bg-purple-500', bar: 'bg-purple-500' };
};

/* v2 노드 4종. 색은 대분류 테마와 겹치지 않게 타입 전용으로 둔다. */
const TYPE_META = {
  concept: { label: '개념', badge: 'bg-slate-100 text-slate-600', icon: BookOpen },
  skill: { label: '스킬', badge: 'bg-emerald-100 text-emerald-700', icon: Zap },
  pattern: { label: '유형', badge: 'bg-amber-100 text-amber-700', icon: Target },
  trap: { label: '함정', badge: 'bg-rose-100 text-rose-700', icon: AlertTriangle },
};

/* 관계 6종의 간선 표현. prerequisite 는 기존 모양 그대로(회색 실선). */
const RELATION_STYLE = {
  prerequisite: { label: null, stroke: '#cbd5e1', dash: null, arrow: true },
  applies_to: { label: '적용', stroke: '#6366f1', dash: '6 3', arrow: true },
  combines: { label: '결합', stroke: '#a855f7', dash: '6 3', arrow: true },
  alternative_to: { label: '대안', stroke: '#f59e0b', dash: '2 4', arrow: false }, // 상호 관계 — 화살표 없음
  faster_than: { label: '더 빠름', stroke: '#10b981', dash: null, arrow: true },
  trap_of: { label: '함정', stroke: '#f43f5e', dash: '6 3', arrow: true },
};

/* 상세 패널에서 prerequisite 외 관계를 보여줄 순서와 제목 */
const RELATION_SECTIONS = [
  ['applies_to', '적용되는 개념'],
  ['combines', '결합된 스킬'],
  ['alternative_to', '같은 문제를 푸는 다른 방법'],
  ['faster_than', '이 방법이 더 빠른 대상'],
  ['trap_of', '이 함정이 나오는 곳'],
];

// =====================================================================
// 3. 커스텀 노드
// =====================================================================
const ConceptNode = ({ data }) => {
  const safeData = data || {};
  const isSelected = safeData.isSelected;
  const theme = getCategoryTheme(safeData.major_category);
  const typeMeta = safeData.type ? TYPE_META[safeData.type] : null;

  return (
    <div className={`flex flex-col text-left border-2 rounded-xl p-3 min-w-[220px] max-w-[260px] shadow-sm transition-all duration-300 relative bg-white ${
      isSelected ? `border-indigo-600 shadow-lg ring-4 ring-indigo-100 scale-105 z-50` : `${theme.border} hover:border-slate-400 opacity-95`
    }`}>
      <Handle type="target" position={Position.Top} className={`w-3 h-3 ${theme.handle} border-2 border-white`} />

      {isSelected && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-sm whitespace-nowrap">
          <Target size={12} /> 현재 목표
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1 mt-2">
        {/* v2 노드는 타입(스킬/유형/함정)이 분류보다 먼저 읽혀야 한다 */}
        {typeMeta && typeMeta.label !== '개념' && (
          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${typeMeta.badge}`}>{typeMeta.label}</span>
        )}
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${theme.badge}`}>{safeData.major_category || '분류 없음'}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{safeData.middle_category || '일반'}</span>
      </div>
      <span className="text-sm font-black text-slate-800 leading-tight mb-1 break-keep">{safeData.title || '제목 없음'}</span>

      <Handle type="source" position={Position.Bottom} className={`w-3 h-3 ${theme.handle} border-2 border-white`} />
    </div>
  );
};
const nodeTypes = { concept: ConceptNode };

// =====================================================================
// 4. 우측 위키 패널
// =====================================================================
// 온톨로지 v1 원본에는 아직 채우지 못한 항목이 "[2~3단계에서 작성 예정] …" 형태로 남아 있다.
// 표식 뒤에 실제 원고가 이어지는 경우가 대부분이므로 표식만 떼어내고,
// 남는 것이 대기 문구뿐일 때만 화면에서 감춘다.
// 세 가지 형태가 섞여 있다.
//   "[2~3단계에서 작성 예정] 실제 원고"   → 표식만 떼면 원고가 나온다
//   "…기록 예정. (예고: 실제 원고)"       → 괄호 안이 원고다
//   "…기록 예정"                          → 내용이 없다. 감춘다.
// v2 노드에는 대기 문구가 금지(검증기 규칙 11)라 이 정제를 거치지 않는다.
const DRAFT_MARK = /\[[^\]]*단계에서\s*(?:작성|입력|기록)\s*예정\]/g;
const DRAFT_PREVIEW = /^[\s\S]*?예정\.?\s*\(\s*예고\s*:\s*([\s\S]+?)\s*\)\s*$/;
const DRAFT_ONLY = /예정\.?$/;
const DRAFT_FIELDS = ['title', 'situation', 'symptom', 'content', 'action', 'diagnosis_message'];

const cleanDraftText = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.replace(DRAFT_MARK, '').trim();
  if (!text) return null;
  const preview = text.match(DRAFT_PREVIEW);
  if (preview) return preview[1];
  return DRAFT_ONLY.test(text) ? null : text;
};

const cleanDraftItem = (item) => {
  if (typeof item !== 'object' || item === null) return cleanDraftText(item);
  const cleaned = { ...item };
  let hasContent = false;
  DRAFT_FIELDS.forEach((field) => {
    if (!(field in cleaned)) return;
    cleaned[field] = cleanDraftText(cleaned[field]);
    if (cleaned[field]) hasContent = true;
  });
  return hasContent ? cleaned : null;
};

const cleanDraftList = (list) => (Array.isArray(list) ? list.map(cleanDraftItem).filter(Boolean) : []);

const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

const WikiPanel = ({ selectedNodeData, selectedNodeId, theme, nodeTitleById, onJumpToNode, canEditSource }) => {
  const [isResolving, setIsResolving] = useState(false);

  if (!selectedNodeData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-300">
        <BookOpen size={48} className="mb-4 opacity-50" />
        <p className="font-bold text-slate-400">개념을 선택하시면<br />상세 분석 데이터가 표시됩니다.</p>
      </div>
    );
  }

  /* 원본 YAML 편집 링크.
     원본 저장소가 비공개라 브라우저에서는 경로를 알 수 없다.
     서버가 GitHub 토큰으로 실제 경로를 찾아 편집 주소를 만들어 준다.
     (팝업 차단을 피하려고 창을 먼저 연 뒤 주소를 채운다) */
  const handleEditClick = async () => {
    if (isResolving) return;
    const win = window.open('about:blank', '_blank');
    if (win) win.opener = null;
    setIsResolving(true);
    try {
      const resolve = httpsCallable(functions, 'resolveOntologySource');
      const res = await resolve({
        nodeId: selectedNodeId,
        majorCategory: selectedNodeData.major_category || ''
      });
      const url = res?.data?.url;
      if (!url) throw new Error('편집 주소를 받지 못했습니다.');
      if (res.data.found === false && res.data.message) alert(res.data.message);
      if (win) win.location.href = url; else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (win) win.close();
      alert('원본 파일 위치를 찾지 못했습니다.\n' + (err.message || ''));
    } finally {
      setIsResolving(false);
    }
  };

  const isV2 = typeof selectedNodeData.type === 'string';
  const typeMeta = TYPE_META[selectedNodeData.type] || null;

  const relations = selectedNodeData?.relations || {};
  const prerequisites = asList(relations.prerequisite);
  const keywords = asList(selectedNodeData.keywords);

  // v1 몸체 (대기 문구 정제를 거친다)
  const coreConcepts = isV2 ? [] : cleanDraftList(selectedNodeData.core_concepts);
  const practicalConcepts = isV2 ? [] : cleanDraftList(selectedNodeData.practical_concepts);
  const actionGuidelines = isV2 ? [] : cleanDraftList(selectedNodeData.action_guidelines);
  const misconceptions = isV2 ? [] : cleanDraftList(selectedNodeData.misconceptions);

  // v2 몸체 (정제 불필요 — 검증기가 대기 문구를 차단한다)
  const definition = isV2 ? asList(selectedNodeData.definition) : [];
  const properties = isV2 ? asList(selectedNodeData.properties) : [];
  const representativeExamples = isV2 ? asList(selectedNodeData.representative_examples) : [];
  const triggerSignals = isV2 ? asList(selectedNodeData.trigger_signals) : [];
  const procedure = isV2 ? asList(selectedNodeData.procedure) : [];
  const limits = isV2 ? asList(selectedNodeData.limits) : [];
  const recognition = isV2 ? asList(selectedNodeData.recognition) : [];
  const requiredSkills = isV2 ? asList(selectedNodeData.required_skills) : [];
  const typicalTraps = isV2 ? asList(selectedNodeData.typical_traps) : [];

  const renderBlock = (item, idx, accent) => {
    if (typeof item !== 'object' || item === null) return <MathText content={item} />;
    return (
      <div className="flex flex-col gap-2">
        {item.title && (
          <strong className={`block font-black ${accent}`}>
            <MathText content={item.title} />
            {item.state === 'draft' && (
              <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">초안</span>
            )}
          </strong>
        )}
        {item.situation && (
          <div className="text-xs bg-white px-2 py-1.5 rounded font-bold border border-current/10">
            <MathText content={`상황: ${item.situation}`} />
          </div>
        )}
        {item.symptom && (
          <div className="text-xs font-bold flex items-start gap-1 bg-white p-2 rounded-md border border-current/10">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span><MathText content={`증상: ${item.symptom}`} /></span>
          </div>
        )}
        {(item.content || item.action) && (
          <span><MathText content={item.action || item.content} /></span>
        )}
        {item.diagnosis_message && (
          <div className="text-sm leading-relaxed bg-white/60 p-3 rounded-lg">
            💡 처방: <MathText content={item.diagnosis_message} />
          </div>
        )}
      </div>
    );
  };

  const Section = ({ icon: Icon, title, color, iconColor, children }) => (
    <section>
      <h3 className={`text-sm font-black ${color} flex items-center gap-2 mb-3`}>
        <Icon size={16} className={iconColor} /> {title}
      </h3>
      {children}
    </section>
  );

  /* id 목록을 "클릭하면 이동" 버튼 묶음으로. 선수 개념·관계·필요 스킬이 전부 이걸 쓴다. */
  const JumpList = ({ ids }) => (
    <div className="flex flex-col gap-1.5">
      {ids.map((pid) => (
        <button
          key={pid}
          onClick={() => onJumpToNode(String(pid))}
          disabled={!nodeTitleById[String(pid)]}
          className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <span className="text-sm font-bold text-slate-700 break-keep">
            {nodeTitleById[String(pid)] || `${pid} (지식맵에 없음)`}
          </span>
          {nodeTitleById[String(pid)] && (
            <ArrowUpRight size={14} className="shrink-0 text-slate-400 group-hover:text-indigo-600" />
          )}
        </button>
      ))}
    </div>
  );

  const StringItems = ({ items, box }) => (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className={`text-sm text-slate-700 p-3 rounded-xl border ${box}`}>
          <MathText content={s} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-7 custom-scrollbar bg-white">

      <header className="relative">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-1.5">
            {isV2 && typeMeta && (
              <span className={`px-2.5 py-1 text-[11px] font-black rounded-md ${typeMeta.badge}`}>{typeMeta.label}</span>
            )}
            <span className={`px-2.5 py-1 text-[11px] font-black rounded-md ${theme.badge || 'bg-slate-100 text-slate-600'}`}>{selectedNodeData.major_category || '대분류'}</span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.middle_category || '중분류'}</span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.sub_category || '소분류'}</span>
            {selectedNodeData.grade && (
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-[11px] font-black rounded-md">{selectedNodeData.grade}</span>
            )}
            {selectedNodeData.tier && (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-[11px] font-black rounded-md">{selectedNodeData.tier}</span>
            )}
          </div>

          {/* 원본 수정은 교직원에게만 노출한다. (예전에는 학생·학부모에게도 보였다) */}
          {canEditSource && (
            <button
              onClick={handleEditClick}
              disabled={isResolving}
              title="GitHub에서 이 개념의 원본 YAML 수정하기"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-600 transition-colors active:scale-95 focus:outline-none disabled:opacity-60"
            >
              {isResolving ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
              <span className="hidden sm:inline">{isResolving ? '위치 확인 중' : '원본 수정'}</span>
              {!isResolving && <Edit3 size={14} className="ml-0.5 opacity-70" />}
            </button>
          )}
        </div>

        <h2 className="text-xl md:text-2xl font-black text-slate-900 mb-2 leading-tight break-keep">
          <MathText content={selectedNodeData.title || '제목 없음'} />
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded w-fit">ID: {selectedNodeId}</div>
          {/* 검수 상태는 교직원에게만 의미가 있다 */}
          {canEditSource && isV2 && selectedNodeData.status && (
            <div className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded w-fit">
              {selectedNodeData.status}{selectedNodeData.source ? ` · ${selectedNodeData.source}` : ''}
            </div>
          )}
          {typeof selectedNodeData.time_budget === 'number' && (
            <div className="text-[10px] font-black bg-teal-50 text-teal-700 px-2 py-1 rounded w-fit flex items-center gap-1">
              <Clock size={10} /> 목표 {selectedNodeData.time_budget}초
            </div>
          )}
        </div>
      </header>

      {/* 검색 키워드 */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k, i) => (
            <span key={i} className="text-[11px] font-bold px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
              <Tag size={10} /> {k}
            </span>
          ))}
        </div>
      )}

      <hr className="border-slate-100" />

      {/* 선수 개념 — 클릭하면 해당 개념으로 이동 */}
      {prerequisites.length > 0 && (
        <Section icon={ListTree} title="먼저 알아야 하는 개념" color="text-slate-800" iconColor="text-slate-500">
          <JumpList ids={prerequisites} />
        </Section>
      )}

      {/* ============ v2 몸체 ============ */}

      {/* concept: 정의 / 성질 / 대표 예시 */}
      {definition.length > 0 && (
        <Section icon={Key} title="정의" color="text-indigo-900" iconColor="text-indigo-500">
          <ul className="space-y-3">
            {definition.map((item, idx) => (
              <li key={item?.id || idx} className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {renderBlock(item, idx, 'text-indigo-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {properties.length > 0 && (
        <Section icon={BookOpen} title="성질" color="text-indigo-900" iconColor="text-indigo-500">
          <ul className="space-y-3">
            {properties.map((item, idx) => (
              <li key={item?.id || idx} className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {renderBlock(item, idx, 'text-indigo-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {representativeExamples.length > 0 && (
        <Section icon={FileText} title="대표 예시" color="text-slate-800" iconColor="text-slate-500">
          <StringItems items={representativeExamples} box="bg-slate-50 border-slate-100" />
        </Section>
      )}

      {/* skill: 트리거 / 절차 / 근거 / 한계 */}
      {triggerSignals.length > 0 && (
        <Section icon={Lightbulb} title="언제 꺼내 쓰는가" color="text-amber-900" iconColor="text-amber-500">
          <StringItems items={triggerSignals} box="bg-amber-50/50 border-amber-100" />
        </Section>
      )}
      {procedure.length > 0 && (
        <Section icon={Zap} title="실행 절차" color="text-emerald-900" iconColor="text-emerald-500">
          <ol className="space-y-2">
            {procedure.map((s, i) => (
              <li key={i} className="text-sm text-slate-700 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="flex-1"><MathText content={s} /></div>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {isV2 && selectedNodeData.why_it_works && (
        <Section icon={CheckCircle2} title="왜 성립하는가" color="text-teal-900" iconColor="text-teal-500">
          <div className="text-sm text-slate-700 bg-teal-50/50 p-4 rounded-xl border border-teal-100">
            <MathText content={selectedNodeData.why_it_works} />
          </div>
        </Section>
      )}
      {limits.length > 0 && (
        <Section icon={Ban} title="안 되는 경우" color="text-rose-800" iconColor="text-rose-500">
          <StringItems items={limits} box="bg-rose-50/50 border-rose-100" />
        </Section>
      )}

      {/* pattern: 알아보는 법 / 필요한 스킬 / 자주 나오는 함정 */}
      {recognition.length > 0 && (
        <Section icon={Search} title="이 유형을 알아보는 법" color="text-amber-900" iconColor="text-amber-500">
          <StringItems items={recognition} box="bg-amber-50/50 border-amber-100" />
        </Section>
      )}
      {requiredSkills.length > 0 && (
        <Section icon={Zap} title="필요한 스킬" color="text-emerald-900" iconColor="text-emerald-500">
          <JumpList ids={requiredSkills} />
        </Section>
      )}
      {typicalTraps.length > 0 && (
        <Section icon={AlertTriangle} title="자주 나오는 함정" color="text-rose-800" iconColor="text-rose-500">
          <JumpList ids={typicalTraps} />
        </Section>
      )}

      {/* trap: 증상 / 원인 / 처방 / 교정 */}
      {isV2 && selectedNodeData.symptom && (
        <Section icon={AlertCircle} title="어떻게 틀리는가" color="text-rose-800" iconColor="text-rose-500">
          <div className="text-sm text-slate-700 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
            <MathText content={selectedNodeData.symptom} />
          </div>
        </Section>
      )}
      {isV2 && selectedNodeData.why && (
        <Section icon={Search} title="왜 그렇게 생각하는가" color="text-rose-800" iconColor="text-rose-500">
          <div className="text-sm text-slate-700 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
            <MathText content={selectedNodeData.why} />
          </div>
        </Section>
      )}
      {isV2 && selectedNodeData.diagnosis_message && (
        <Section icon={Stethoscope} title="AI 튜터 처방" color="text-teal-900" iconColor="text-teal-500">
          <div className="text-sm text-slate-700 bg-teal-50/50 p-4 rounded-xl border border-teal-100">
            💡 <MathText content={selectedNodeData.diagnosis_message} />
          </div>
        </Section>
      )}
      {isV2 && selectedNodeData.correction && (
        <Section icon={CheckCircle2} title="바로잡기" color="text-emerald-900" iconColor="text-emerald-500">
          <div className="text-sm text-slate-700 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
            <MathText content={selectedNodeData.correction} />
          </div>
        </Section>
      )}

      {/* ============ v1 몸체 (이관 전 데이터) ============ */}

      {coreConcepts.length > 0 && (
        <Section icon={Key} title="핵심 개념 노트" color="text-indigo-900" iconColor="text-indigo-500">
          <ul className="space-y-3">
            {coreConcepts.map((concept, idx) => (
              <li key={concept?.id || idx} className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {renderBlock(concept, idx, 'text-indigo-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {practicalConcepts.length > 0 && (
        <Section icon={Wrench} title="실전 적용 포인트" color="text-amber-900" iconColor="text-amber-500">
          <ul className="space-y-3">
            {practicalConcepts.map((item, idx) => (
              <li key={item?.id || idx} className="text-sm text-slate-700 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                {renderBlock(item, idx, 'text-amber-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {actionGuidelines.length > 0 && (
        <Section icon={Target} title="실전 학습 지침" color="text-teal-900" iconColor="text-teal-500">
          <ul className="space-y-3">
            {actionGuidelines.map((guide, idx) => (
              <li key={guide?.id || idx} className="text-sm text-slate-700 bg-teal-50/50 p-4 rounded-xl border border-teal-100">
                <div className="flex gap-2">
                  <CheckCircle2 size={16} className="text-teal-500 shrink-0 mt-1" />
                  <div className="flex-1">{renderBlock(guide, idx, 'text-teal-900')}</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {misconceptions.length > 0 && (
        <Section icon={AlertTriangle} title="취약점 진단 및 오개념" color="text-rose-800" iconColor="text-rose-500">
          <ul className="space-y-3">
            {misconceptions.map((miscon, idx) => (
              <li key={miscon?.id || idx} className="text-sm text-slate-700 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                {renderBlock(miscon, idx, 'text-rose-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ============ 나머지 관계 (양쪽 스키마 공용) ============ */}
      {RELATION_SECTIONS.map(([key, title]) => {
        const ids = asList(relations[key]);
        if (ids.length === 0) return null;
        return (
          <Section key={key} icon={GitBranch} title={title} color="text-slate-800" iconColor="text-slate-500">
            <JumpList ids={ids} />
          </Section>
        );
      })}
    </div>
  );
};

// =====================================================================
// 5. 현황판 (교직원 전용) — 서버 없이 build.json 만으로 계산한다
// =====================================================================
/* 대분류별 목표치. STATUS.md 의 계획(현재+추가 = 1,121개)을 그대로 옮겼다.
   계획이 바뀌면 여기 숫자만 고치면 된다. */
const CATEGORY_TARGETS = {
  '수와 연산': 89,
  '대수': 173,
  '해석학': 364,
  '기하': 267,
  '확률과 통계': 228,
};

const StatTile = ({ label, value, sub, icon: Icon }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1">
    <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
      {Icon && <Icon size={12} />} {label}
    </span>
    <span className="text-2xl font-black text-slate-800 tabular-nums">{value}</span>
    {sub && <span className="text-[11px] font-bold text-slate-400">{sub}</span>}
  </div>
);

const OntologyDashboard = ({ allNodes, allEdges }) => {
  const stats = useMemo(() => {
    const nodes = allNodes.map(n => n.data || {});
    const total = nodes.length;
    const v2 = nodes.filter(d => typeof d.type === 'string');
    const typeCounts = { concept: 0, skill: 0, pattern: 0, trap: 0 };
    v2.forEach(d => { if (d.type in typeCounts) typeCounts[d.type] += 1; });

    // 대분류 분포
    const byCategory = {};
    nodes.forEach(d => {
      const major = d.major_category || '미분류';
      byCategory[major] = (byCategory[major] || 0) + 1;
    });

    // 관계별 간선 수 (relation 필드가 없는 옛 build.json 은 전부 prerequisite)
    const byRelation = {};
    allEdges.forEach(e => {
      const rel = e.relation || 'prerequisite';
      byRelation[rel] = (byRelation[rel] || 0) + 1;
    });

    // 선수관계 그래프 지표 — 중복(조상 재지정) 간선, 최장 학습 경로.
    // 순환이 있어도 멈추지 않도록 진행 중 노드를 미리 등록한다(검증기와 같은 방식).
    const prereqOf = new Map();
    allNodes.forEach(n => prereqOf.set(n.id, []));
    allEdges.forEach(e => {
      if ((e.relation || 'prerequisite') !== 'prerequisite') return;
      if (prereqOf.has(e.target)) prereqOf.get(e.target).push(e.source);
    });

    const ancestors = new Map();
    const anc = (id) => {
      if (ancestors.has(id)) return ancestors.get(id);
      const set = new Set();
      ancestors.set(id, set);
      (prereqOf.get(id) || []).forEach(p => {
        set.add(p);
        anc(p).forEach(a => set.add(a));
      });
      return set;
    };
    let redundant = 0;
    prereqOf.forEach((prereqs, id) => {
      prereqs.forEach(p => {
        if (prereqs.some(q => q !== p && anc(q).has(p))) redundant += 1;
      });
    });

    const depth = new Map();
    const depthOf = (id) => {
      if (depth.has(id)) return depth.get(id);
      depth.set(id, 1); // 순환 방어
      const prereqs = prereqOf.get(id) || [];
      const d = prereqs.length === 0 ? 1 : 1 + Math.max(...prereqs.map(depthOf));
      depth.set(id, d);
      return d;
    };
    let longestPath = 0;
    prereqOf.forEach((_, id) => { longestPath = Math.max(longestPath, depthOf(id)); });

    // v1 원고 보유율 — "일타강사 층" 자산이 어디까지 채워졌는가
    const manuscript = { practical_concepts: 0, action_guidelines: 0, misconceptions: 0 };
    nodes.forEach(d => {
      if (typeof d.type === 'string') return; // v2 는 별도 지표(state)로 본다
      Object.keys(manuscript).forEach(sec => {
        if (cleanDraftList(d[sec]).length > 0) manuscript[sec] += 1;
      });
    });

    return { total, v2Count: v2.length, typeCounts, byCategory, byRelation, redundant, longestPath, manuscript, edgeTotal: allEdges.length };
  }, [allNodes, allEdges]);

  const categoryRows = Object.entries(CATEGORY_TARGETS).map(([cat, target]) => ({
    cat, target, count: stats.byCategory[cat] || 0, theme: getCategoryTheme(cat),
  }));
  const plannedTotal = Object.values(CATEGORY_TARGETS).reduce((a, b) => a + b, 0);
  const relationLabels = {
    prerequisite: '선수관계', applies_to: '적용', combines: '결합',
    alternative_to: '대안', faster_than: '더 빠름', trap_of: '함정',
  };
  const manuscriptLabels = {
    practical_concepts: '실전 적용 포인트', action_guidelines: '실전 학습 지침', misconceptions: '오개념 진단',
  };
  const v1Count = stats.total - stats.v2Count;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-slate-50/60 space-y-6">

      {/* 헤드라인 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Map} label="개념 노드" value={stats.total.toLocaleString()} sub={`계획 ${plannedTotal.toLocaleString()}개 중 ${Math.round(stats.total / plannedTotal * 100)}%`} />
        <StatTile icon={GitBranch} label="연결(간선)" value={stats.edgeTotal.toLocaleString()} sub={`중복(조상 재지정) ${stats.redundant.toLocaleString()}개`} />
        <StatTile icon={ListTree} label="최장 학습 경로" value={`${stats.longestPath}단계`} sub="선수관계를 따라 가장 긴 사슬" />
        <StatTile icon={Zap} label="v2 이관" value={`${stats.v2Count.toLocaleString()}개`} sub={stats.v2Count === 0 ? 'v1 노드만 있음 (이관 전)' : `v1 ${v1Count.toLocaleString()}개 남음`} />
      </div>

      {/* 대분류별 진행률 — 색은 지식맵 전체에서 쓰는 대분류 고정색 그대로 */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
        <h3 className="text-sm font-black text-slate-800 mb-4">대분류별 작성 진행률 <span className="font-bold text-slate-400">(목표: 확정 중분류 33개 기준 {plannedTotal.toLocaleString()}개)</span></h3>
        <div className="space-y-3">
          {categoryRows.map(({ cat, target, count, theme }) => {
            const pct = Math.min(100, Math.round((count / target) * 100));
            return (
              <div key={cat}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${theme.handle}`} /> {cat}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 tabular-nums">{count.toLocaleString()} / {target.toLocaleString()} ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden" title={`${cat}: ${count}/${target}`}>
                  <div className={`h-full ${theme.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 관계 종류별 간선 */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
          <h3 className="text-sm font-black text-slate-800 mb-3">관계 종류별 연결</h3>
          <div className="space-y-1.5">
            {Object.entries(relationLabels).map(([rel, label]) => {
              const count = stats.byRelation[rel] || 0;
              const style = RELATION_STYLE[rel];
              return (
                <div key={rel} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-2">
                    <svg width="20" height="6" aria-hidden="true">
                      <line x1="0" y1="3" x2="20" y2="3" stroke={style.stroke} strokeWidth="2.5" strokeDasharray={style.dash || undefined} />
                    </svg>
                    {label} <span className="font-mono text-[10px] text-slate-400">{rel}</span>
                  </span>
                  <span className="text-sm font-black text-slate-800 tabular-nums">{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          {stats.v2Count === 0 && (
            <p className="text-[11px] font-bold text-slate-400 mt-3">선수관계 외 5종은 v2 이관 후에 생깁니다.</p>
          )}
        </section>

        {/* 일타강사 층 원고 보유율 (v1) + v2 타입 분포 */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
          <h3 className="text-sm font-black text-slate-800 mb-3">"일타강사 층" 원고 보유율 <span className="font-bold text-slate-400">(v1 {v1Count.toLocaleString()}개 기준)</span></h3>
          <div className="space-y-3">
            {Object.entries(manuscriptLabels).map(([sec, label]) => {
              const count = stats.manuscript[sec];
              const pct = v1Count > 0 ? Math.round((count / v1Count) * 100) : 0;
              return (
                <div key={sec}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs font-black text-slate-700">{label}</span>
                    <span className="text-[11px] font-bold text-slate-500 tabular-nums">{count.toLocaleString()}개 노드 ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden" title={`${label}: ${count}/${v1Count}`}>
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {stats.v2Count > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <h4 className="text-xs font-black text-slate-700 mb-2">v2 타입 분포</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.typeCounts).map(([t, c]) => (
                  <span key={t} className={`text-[11px] font-black px-2 py-1 rounded-md ${TYPE_META[t].badge}`}>
                    {TYPE_META[t].label} {c.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] font-bold text-slate-400 mt-3 leading-relaxed">
            대기 문구를 걷어낸 뒤 실제 원고가 남는 노드의 비율입니다.
            상세 검증(규칙 위반·기존 결함)은 데이터 저장소 CI 와 validation-baseline.json 이 관리합니다.
          </p>
        </section>
      </div>
    </div>
  );
};

// =====================================================================
// 6. 메인 컴포넌트
// =====================================================================
export default function OntologyMap() {
  const { currentUser } = useData() || {};
  const canEditSource = STAFF_ROLES.includes(currentUser?.role);

  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [expandedMajors, setExpandedMajors] = useState(new Set());

  // 지식맵 | 현황판 (현황판은 교직원 전용)
  const [view, setView] = useState('map');

  // 모바일 전용 탭 ('tree' | 'map' | 'wiki'). lg 이상에서는 세 패널이 함께 보인다.
  const [mobileTab, setMobileTab] = useState('tree');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const loadData = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);

    if (!force && ontologyCache) {
      setAllNodes(ontologyCache.nodes);
      setAllEdges(ontologyCache.edges);
      setIsLoading(false);
      return;
    }

    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL;
      if (!API_BASE_URL) {
        throw new Error('지식 맵 서버 주소(REACT_APP_API_URL)가 설정되지 않았습니다. 배포 환경변수를 확인해주세요.');
      }

      const endpoint = `${API_BASE_URL.replace(/\/$/, '')}/build.json`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error(`지식 맵 서버가 응답하지 않습니다. (HTTP ${res.status} ${res.statusText || ''})`.trim());
      }

      const result = await res.json();
      const parsedNodes = (result.nodes || []).map(n => ({ ...n, id: String(n.id) }));
      const parsedEdges = (result.edges || []).map(e => ({ ...e, source: String(e.source), target: String(e.target) }));

      if (parsedNodes.length === 0) {
        throw new Error('지식 맵 데이터가 비어 있습니다. 원본 저장소의 빌드 상태를 확인해주세요.');
      }

      ontologyCache = { nodes: parsedNodes, edges: parsedEdges };
      setAllNodes(parsedNodes);
      setAllEdges(parsedEdges);
    } catch (err) {
      console.error('[OntologyMap] 데이터 로딩 실패:', err);
      // 원인을 감추지 않는다. 감추면 문제 해결이 불가능해진다.
      setError(
        err instanceof TypeError
          ? '지식 맵 서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요.'
          : (err.message || '알 수 없는 오류가 발생했습니다.')
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const nodeTitleById = useMemo(() => {
    const map = {};
    allNodes.forEach(n => { map[n.id] = n.data?.title || n.id; });
    return map;
  }, [allNodes]);

  // 좌측 트리 (대분류 > 중분류 > 개념)
  const treeData = useMemo(() => {
    const tree = {};
    const q = searchQuery.trim().toLowerCase();
    allNodes.forEach(node => {
      const d = node.data || {};
      const major = d.major_category || '미분류';
      const middle = d.middle_category || '일반';
      if (q) {
        const haystack = [
          d.title, middle, major, d.sub_category,
          ...(Array.isArray(d.keywords) ? d.keywords : [])
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return;
      }
      if (!tree[major]) tree[major] = {};
      if (!tree[major][middle]) tree[major][middle] = [];
      tree[major][middle].push(node);
    });
    return tree;
  }, [allNodes, searchQuery]);

  const matchCount = useMemo(
    () => Object.values(treeData).reduce((sum, mids) => sum + Object.values(mids).reduce((s, arr) => s + arr.length, 0), 0),
    [treeData]
  );

  const toggleMajor = useCallback((major) => {
    setExpandedMajors(prev => {
      const next = new Set(prev);
      if (next.has(major)) next.delete(major); else next.add(major);
      return next;
    });
  }, []);

  const selectNode = useCallback((id) => {
    setSelectedNodeId(id);
    setView('map');
    setMobileTab('wiki'); // 모바일에서는 선택 즉시 상세로 이동
  }, []);

  const handleNodeClick = useCallback((event, node) => setSelectedNodeId(node.id), []);

  // 선택된 개념과 직접 연결된 이웃만 그린다 (시멘틱 줌)
  useEffect(() => {
    if (!selectedNodeId || allNodes.length === 0) { setNodes([]); setEdges([]); return; }
    try {
      const rawLocalEdges = allEdges.filter(e => e.source === selectedNodeId || e.target === selectedNodeId);
      const localNodeIds = new Set([selectedNodeId]);
      rawLocalEdges.forEach(e => { localNodeIds.add(e.source); localNodeIds.add(e.target); });

      const localNodesRaw = allNodes.filter(n => localNodeIds.has(n.id));
      const validNodeIds = new Set(localNodesRaw.map(n => n.id));
      const safeLocalEdges = rawLocalEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 120 });

      localNodesRaw.forEach(n => { dagreGraph.setNode(n.id, { width: 240, height: 100 }); });
      safeLocalEdges.forEach(e => { dagreGraph.setEdge(e.source, e.target); });
      dagre.layout(dagreGraph);

      setNodes(localNodesRaw.map(node => {
        const pos = dagreGraph.node(node.id);
        return {
          id: String(node.id),
          type: 'concept',
          position: { x: pos?.x ? pos.x - 120 : 0, y: pos?.y ? pos.y - 50 : 0 },
          data: { ...node.data, id: node.id, isSelected: node.id === selectedNodeId }
        };
      }));

      // 관계 종류별로 색·점선·라벨을 달리 그린다. relation 필드가 없으면 선수관계다.
      setEdges(safeLocalEdges.map(e => {
        const style = RELATION_STYLE[e.relation] || RELATION_STYLE.prerequisite;
        return {
          id: `edge-${e.relation || 'prerequisite'}-${e.source}-${e.target}`,
          source: String(e.source),
          target: String(e.target),
          type: 'default',
          animated: (e.relation || 'prerequisite') === 'prerequisite' && e.target === selectedNodeId,
          label: style.label || undefined,
          labelStyle: { fontSize: 10, fontWeight: 700, fill: '#475569' },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
          markerEnd: style.arrow ? { type: MarkerType.ArrowClosed, color: style.stroke } : undefined,
          style: { stroke: style.stroke, strokeWidth: 2.5, strokeDasharray: style.dash || undefined }
        };
      }));
    } catch (err) {
      console.error('[OntologyMap] 그래프 배치 실패:', err);
      setNodes([]); setEdges([]);
    }
  }, [selectedNodeId, allNodes, allEdges, setNodes, setEdges]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    return allNodes.find(n => n.id === selectedNodeId)?.data || null;
  }, [selectedNodeId, allNodes]);

  /* 앱 레이아웃(사이드바 + 상단 헤더 + 여백) 안에 들어가므로 h-screen을 쓰면
     아래가 잘리고 스크롤이 두 번 생긴다. 남는 높이에 맞춘다. */
  const shellHeight = 'h-[calc(100vh-9rem)] md:h-[calc(100vh-7rem)] min-h-[520px]';

  if (isLoading) {
    return (
      <div className={`w-full ${shellHeight} bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center`}>
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <span className="font-black text-indigo-900 text-lg">지식 맵을 불러오는 중입니다...</span>
        <span className="text-sm text-slate-400 font-bold mt-1">개념 데이터를 정리하고 있어요</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-full ${shellHeight} bg-white rounded-2xl border border-rose-200 flex flex-col items-center justify-center p-6 text-center`}>
        <div className="bg-rose-50 p-4 rounded-full text-rose-500 mb-4"><AlertCircle size={40} /></div>
        <h3 className="text-xl font-black text-slate-800 mb-2">지식 맵을 불러오지 못했습니다</h3>
        <p className="text-sm font-bold text-slate-500 mb-6 max-w-md break-keep leading-relaxed">{error}</p>
        <button
          onClick={() => loadData(true)}
          className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw size={18} /> 다시 시도
        </button>
      </div>
    );
  }

  const TabButton = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setMobileTab(id)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-lg transition-colors ${
        mobileTab === id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      <Icon size={16} /> {label}
    </button>
  );

  const ViewButton = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setView(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black rounded-lg transition-colors ${
        view === id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className={`w-full ${shellHeight} flex flex-col gap-3`}>

      {/* 상단 바: 모바일 탭 + (교직원) 현황판 전환 */}
      <div className="flex gap-2 shrink-0">
        {view === 'map' && (
          <div className="lg:hidden flex-1 flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <TabButton id="tree" icon={Search} label="탐색" />
            <TabButton id="map" icon={Map} label="연결도" />
            <TabButton id="wiki" icon={FileText} label="상세" />
          </div>
        )}
        {canEditSource && (
          <div className={`flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm ${view === 'map' ? 'ml-auto' : ''}`}>
            <ViewButton id="map" icon={Map} label="지식맵" />
            <ViewButton id="dash" icon={LayoutDashboard} label="현황판" />
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {view === 'dash' && canEditSource ? (
          <OntologyDashboard allNodes={allNodes} allEdges={allEdges} />
        ) : (
          <>
            {/* 좌측: 개념 탐색 트리 */}
            <aside className={`${mobileTab === 'tree' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[320px] shrink-0 bg-white lg:border-r border-slate-200 flex-col min-h-0`}>
              <div className="p-4 border-b border-slate-100 bg-slate-50/60 shrink-0">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2 mb-3">
                  <Map size={18} className="text-indigo-600" /> 수학 지식 내비게이터
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="개념 · 키워드 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 outline-none"
                  />
                </div>
                <div className="text-[11px] font-bold text-slate-400 mt-2">
                  {searchQuery ? `검색 결과 ${matchCount}개` : `전체 ${allNodes.length}개 개념`}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                {matchCount === 0 && (
                  <div className="text-center py-10 text-sm font-bold text-slate-400">검색 결과가 없습니다.</div>
                )}
                {Object.entries(treeData).map(([major, middles]) => {
                  const isOpen = expandedMajors.has(major) || !!searchQuery;
                  return (
                    <div key={major} className="mb-1">
                      <button onClick={() => toggleMajor(major)} className="w-full flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg">
                        <span className="font-black text-sm text-slate-700 flex gap-2 items-center">
                          <div className={`w-2 h-2 rounded-full ${getCategoryTheme(major).handle}`} />{major}
                        </span>
                        {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                      </button>
                      {isOpen && (
                        <div className="ml-3 pl-3 border-l-2 border-slate-100 mt-1 space-y-2">
                          {Object.entries(middles).map(([middle, nodesList]) => (
                            <div key={middle}>
                              <div className="text-xs font-bold text-slate-400 mb-1">{middle}</div>
                              {nodesList.map(node => (
                                <button
                                  key={node.id}
                                  onClick={() => selectNode(node.id)}
                                  className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-all break-keep ${
                                    selectedNodeId === node.id
                                      ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100'
                                      : 'text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {node.data?.type && node.data.type !== 'concept' && TYPE_META[node.data.type] && (
                                    <span className={`inline-block mr-1.5 text-[9px] font-black px-1 py-0.5 rounded align-middle ${TYPE_META[node.data.type].badge}`}>
                                      {TYPE_META[node.data.type].label}
                                    </span>
                                  )}
                                  {node.data?.title || node.id}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* 가운데: 연결도 */}
            <main className={`${mobileTab === 'map' ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 min-h-0 relative bg-[#f8fafc] flex-col`}>
              {!selectedNodeId ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                  <Map size={56} className="mb-4 text-slate-200" />
                  <h3 className="text-lg md:text-xl font-black text-slate-400 break-keep">
                    왼쪽에서 개념을 선택하면<br />연결 관계가 표시됩니다
                  </h3>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={handleNodeClick}
                  nodeTypes={nodeTypes}
                  fitView
                  minZoom={0.3}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  nodesConnectable={false}
                >
                  <Background color="#cbd5e1" gap={24} size={2} />
                  <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
                </ReactFlow>
              )}
            </main>

            {/* 우측: 상세 위키 */}
            <aside className={`${mobileTab === 'wiki' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[400px] shrink-0 bg-white lg:border-l border-slate-200 flex-col min-h-0 overflow-hidden`}>
              <WikiPanel
                selectedNodeData={selectedNodeData}
                selectedNodeId={selectedNodeId}
                theme={selectedNodeData ? getCategoryTheme(selectedNodeData.major_category) : {}}
                nodeTitleById={nodeTitleById}
                onJumpToNode={selectNode}
                canEditSource={canEditSource}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
