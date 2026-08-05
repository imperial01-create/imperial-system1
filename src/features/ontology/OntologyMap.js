/* =========================================================================
   임페리얼 학원 AI 수학 지식 맵 뷰어

   [이번 수정에서 고친 것]
   1. Edit Source 버튼이 항상 404로 가던 문제
      - 기본 저장소 주소가 실제와 달랐고(imperial-academy/math-ontology),
        데이터에 file_path가 아예 없어서(571개 노드 중 0개) 경로 추측도 실패했다.
      - 파일 경로를 모르더라도 확실히 찾아가도록 저장소 코드 검색으로 연결한다.
        (나중에 Worker가 file_path를 넣어주면 자동으로 직접 편집 링크를 쓴다)
   2. 작성한 내용이 화면에 안 나오던 문제
      - practical_concepts(571개 전부 보유)와 keywords가 렌더링되지 않고 있었다.
      - 선수 개념(relations.prerequisite)도 클릭해서 바로 이동할 수 있게 추가했다.
   3. 모바일에서 화면이 깨지던 문제
      - 320px 트리 + 그래프 + 400px 위키가 가로로 나란히 고정되어 있어
        휴대폰에서는 사용할 수 없었다. 탭 전환 방식으로 재구성했다.
   4. h-screen 때문에 앱 레이아웃 안에서 잘리고 스크롤이 두 번 생기던 문제
   5. 오류가 나도 이유를 알 수 없던 문제 ("오류가 발생했습니다" 한 줄)
      - 실제 원인과 다시 시도 버튼을 노출한다.
   6. 화면을 드나들 때마다 2.7MB를 다시 받던 문제
      - 세션 동안 메모리에 캐시한다.
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
  Tag, Wrench, ArrowUpRight, RefreshCw, ListTree, FileText
} from 'lucide-react';

import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

/* 온톨로지 원본 저장소. 환경변수로 덮어쓸 수 있다. */
const ONTOLOGY_REPO = process.env.REACT_APP_ONTOLOGY_REPO || 'imperial01-create/math-ontology-data';

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
// 2. 대분류 기반 색상 테마
// =====================================================================
const getCategoryTheme = (majorCategory) => {
  const major = (majorCategory || '').toLowerCase();
  if (major.includes('대수')) return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', handle: 'bg-blue-500' };
  if (major.includes('해석') || major.includes('미적')) return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700', handle: 'bg-red-500' };
  if (major.includes('기하')) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', badge: 'bg-green-100 text-green-700', handle: 'bg-green-500' };
  if (major.includes('확률') || major.includes('통계')) return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700', handle: 'bg-orange-500' };
  return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700', handle: 'bg-purple-500' };
};

// =====================================================================
// 3. 커스텀 노드
// =====================================================================
const ConceptNode = ({ data }) => {
  const safeData = data || {};
  const isSelected = safeData.isSelected;
  const theme = getCategoryTheme(safeData.major_category);

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
const WikiPanel = ({ selectedNodeData, selectedNodeId, theme, nodeTitleById, onJumpToNode }) => {
  if (!selectedNodeData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-300">
        <BookOpen size={48} className="mb-4 opacity-50" />
        <p className="font-bold text-slate-400">개념을 선택하시면<br />상세 분석 데이터가 표시됩니다.</p>
      </div>
    );
  }

  /* 원본 YAML 편집 링크.
     데이터에 file_path가 없으므로(현재 571개 전부 없음) 저장소 코드 검색으로 보낸다.
     검색어가 개념 ID라 파일이 어느 폴더에 있든 정확히 찾아진다. */
  const handleEditClick = () => {
    const filePath = selectedNodeData.file_path;
    const url = filePath
      ? `https://github.com/${ONTOLOGY_REPO}/edit/main/${String(filePath).replace(/^\/+/, '')}`
      : `https://github.com/search?q=${encodeURIComponent(`repo:${ONTOLOGY_REPO} "${selectedNodeId}"`)}&type=code`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const prerequisites = Array.isArray(selectedNodeData?.relations?.prerequisite)
    ? selectedNodeData.relations.prerequisite
    : [];
  const keywords = Array.isArray(selectedNodeData.keywords) ? selectedNodeData.keywords : [];

  const renderBlock = (item, idx, accent) => {
    if (typeof item !== 'object' || item === null) return <MathText content={item} />;
    return (
      <div className="flex flex-col gap-2">
        {item.title && <strong className={`block font-black ${accent}`}><MathText content={item.title} /></strong>}
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

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-7 custom-scrollbar bg-white">

      <header className="relative">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2.5 py-1 text-[11px] font-black rounded-md ${theme.badge || 'bg-slate-100 text-slate-600'}`}>{selectedNodeData.major_category || '대분류'}</span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.middle_category || '중분류'}</span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.sub_category || '소분류'}</span>
          </div>

          <button
            onClick={handleEditClick}
            title={selectedNodeData.file_path ? 'GitHub에서 원본 YAML 수정하기' : 'GitHub 저장소에서 이 개념의 원본 파일 찾기'}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-600 transition-colors active:scale-95 focus:outline-none"
          >
            <Github size={14} />
            <span className="hidden sm:inline">원본 수정</span>
            <Edit3 size={14} className="ml-0.5 opacity-70" />
          </button>
        </div>

        <h2 className="text-xl md:text-2xl font-black text-slate-900 mb-2 leading-tight break-keep">
          <MathText content={selectedNodeData.title || '제목 없음'} />
        </h2>
        <div className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded w-fit">ID: {selectedNodeId}</div>
      </header>

      {/* 검색 키워드 (기존에는 화면에 나오지 않던 데이터) */}
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
          <div className="flex flex-col gap-1.5">
            {prerequisites.map((pid) => (
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
        </Section>
      )}

      {/* 핵심 개념 */}
      {Array.isArray(selectedNodeData.core_concepts) && selectedNodeData.core_concepts.length > 0 && (
        <Section icon={Key} title="핵심 개념 노트" color="text-indigo-900" iconColor="text-indigo-500">
          <ul className="space-y-3">
            {selectedNodeData.core_concepts.map((concept, idx) => (
              <li key={concept?.id || idx} className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {renderBlock(concept, idx, 'text-indigo-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 실전 적용 개념 — 기존에는 화면에 전혀 나오지 않던 데이터 */}
      {Array.isArray(selectedNodeData.practical_concepts) && selectedNodeData.practical_concepts.length > 0 && (
        <Section icon={Wrench} title="실전 적용 포인트" color="text-amber-900" iconColor="text-amber-500">
          <ul className="space-y-3">
            {selectedNodeData.practical_concepts.map((item, idx) => (
              <li key={item?.id || idx} className="text-sm text-slate-700 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                {renderBlock(item, idx, 'text-amber-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 행동 지침 */}
      {Array.isArray(selectedNodeData.action_guidelines) && selectedNodeData.action_guidelines.length > 0 && (
        <Section icon={Target} title="실전 학습 지침" color="text-teal-900" iconColor="text-teal-500">
          <ul className="space-y-3">
            {selectedNodeData.action_guidelines.map((guide, idx) => (
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

      {/* 오개념 진단 */}
      {Array.isArray(selectedNodeData.misconceptions) && selectedNodeData.misconceptions.length > 0 && (
        <Section icon={AlertTriangle} title="취약점 진단 및 오개념" color="text-rose-800" iconColor="text-rose-500">
          <ul className="space-y-3">
            {selectedNodeData.misconceptions.map((miscon, idx) => (
              <li key={miscon?.id || idx} className="text-sm text-slate-700 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                {renderBlock(miscon, idx, 'text-rose-900')}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};

// =====================================================================
// 5. 메인 컴포넌트
// =====================================================================
export default function OntologyMap() {
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [expandedMajors, setExpandedMajors] = useState(new Set());

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

      setEdges(safeLocalEdges.map(e => ({
        id: `edge-${e.source}-${e.target}`,
        source: String(e.source),
        target: String(e.target),
        type: 'default',
        animated: e.target === selectedNodeId,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        style: { stroke: '#cbd5e1', strokeWidth: 2.5 }
      })));
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

  return (
    <div className={`w-full ${shellHeight} flex flex-col gap-3`}>

      {/* 모바일 전용 탭 바 */}
      <div className="lg:hidden flex gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm shrink-0">
        <TabButton id="tree" icon={Search} label="탐색" />
        <TabButton id="map" icon={Map} label="연결도" />
        <TabButton id="wiki" icon={FileText} label="상세" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

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
          />
        </aside>
      </div>
    </div>
  );
}
