/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 v4.3 (KaTeX 수식 렌더러 & 스마트 라우팅 적용)
   🚀 가치 1: react-katex를 도입하여 텍스트 내부의 LaTeX 수식을 교과서 수준의 그래픽으로 렌더링.
   🚀 가치 2: Dagre rankdir을 'TB'로 전환하고 화살표 동선을 최적화하여 직관적인 UI 제공.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MarkerType,
  useNodesState, useEdgesState, Handle, Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Search, Target, AlertCircle, Loader2, BookOpen, Key, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Map } from 'lucide-react';

// 🔥 CTO 추가: 수식 렌더링을 위한 KaTeX 임포트
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

// =====================================================================
// 🧮 텍스트 & 수식(LaTeX) 자동 분리 렌더러 (XSS 방어 및 클라이언트 파싱)
// =====================================================================
const MathText = ({ content }) => {
  if (!content) return null;
  if (typeof content !== 'string') return <span>{content}</span>;

  // 정규식을 사용해 $$블록수식$$ 과 $인라인수식$을 분리 (O(N) 복잡도로 매우 빠름)
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);

  return (
    <span className="leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return <BlockMath key={index} math={part.slice(2, -2)} />;
        } else if (part.startsWith('$') && part.endsWith('$')) {
          return <InlineMath key={index} math={part.slice(1, -1)} />;
        }
        // 일반 텍스트 영역: 줄바꿈 허용
        return <span key={index} className="whitespace-pre-wrap">{part}</span>;
      })}
    </span>
  );
};

// =====================================================================
// 🎨 테마 유틸리티
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
// 🎨 커스텀 노드: 상하 Handle 유지하되 화살표 꼬임 방지 설계
// =====================================================================
const ConceptNode = ({ data }) => {
  const safeData = data || {};
  const isSelected = safeData.isSelected;
  const theme = getCategoryTheme(safeData.major_category);

  return (
    <div className={`flex flex-col text-left border-2 rounded-xl p-3 min-w-[240px] shadow-sm transition-all duration-300 relative bg-white ${
      isSelected ? `border-indigo-600 shadow-lg ring-4 ring-indigo-100 scale-105 z-50` : `${theme.border} hover:border-slate-400 opacity-95`
    }`}>
      {/* Target: 데이터가 들어오는 곳 (위쪽) */}
      <Handle type="target" position={Position.Top} className={`w-3 h-3 ${theme.handle} border-2 border-white`} />
      
      {isSelected && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-sm">
          <Target size={12} /> 현재 목표
        </div>
      )}
      
      <div className="mb-2 flex flex-wrap gap-1 mt-2">
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${theme.badge}`}>{safeData.major_category || '분류 없음'}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{safeData.middle_category || '일반'}</span>
      </div>
      <span className="text-sm font-black text-slate-800 leading-tight mb-1">{safeData.title || '제목 없음'}</span>
      
      {/* Source: 데이터가 나가는 곳 (아래쪽) */}
      <Handle type="source" position={Position.Bottom} className={`w-3 h-3 ${theme.handle} border-2 border-white`} />
    </div>
  );
};
const nodeTypes = { concept: ConceptNode };

// =====================================================================
// 🧭 메인 대시보드 컴포넌트
// =====================================================================
export default function OntologyDashboard() {
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [expandedMajors, setExpandedMajors] = useState(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const loadData = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL;
      if (!API_BASE_URL) throw new Error("API 주소가 설정되지 않았습니다.");
      const endpoint = `${API_BASE_URL.replace(/\/$/, '')}/build.json`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`통신 실패 (${res.status})`);
      const result = await res.json();

      setAllNodes((result.nodes || []).map(n => ({ ...n, id: String(n.id) })));
      setAllEdges((result.edges || []).map(e => ({ ...e, source: String(e.source), target: String(e.target) })));
    } catch (err) {
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 트리 메뉴 데이터 구성 로직 생략 (기존과 동일하여 속도 유지)
  const treeData = useMemo(() => {
    const tree = {};
    const lowerQ = searchQuery.toLowerCase();
    allNodes.forEach(node => {
      const d = node.data || {};
      const major = d.major_category || '미분류';
      const middle = d.middle_category || '일반';
      if (searchQuery && !(d.title?.toLowerCase().includes(lowerQ) || middle.toLowerCase().includes(lowerQ))) return; 
      if (!tree[major]) tree[major] = {};
      if (!tree[major][middle]) tree[major][middle] = [];
      tree[major][middle].push(node);
    });
    return tree;
  }, [allNodes, searchQuery]);

  const toggleMajor = useCallback((major) => {
    setExpandedMajors(prev => {
      const next = new Set(prev);
      next.has(major) ? next.delete(major) : next.add(major);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((event, node) => setSelectedNodeId(node.id), []);

  // =====================================================================
  // 🎯 그래프 정렬 엔진: 화살표 꼬임 완벽 해결 (Top-to-Bottom)
  // =====================================================================
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
      // 🔥 CTO FIX: rankdir을 'TB'(Top-to-Bottom)로 변경하여 화살표가 위에서 아래로 깔끔하게 떨어지게 함
      dagreGraph.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 150 });

      localNodesRaw.forEach(n => { dagreGraph.setNode(n.id, { width: 240, height: 100 }); });
      safeLocalEdges.forEach(e => { dagreGraph.setEdge(e.source, e.target); });
      dagre.layout(dagreGraph);

      setNodes(localNodesRaw.map(node => {
        const pos = dagreGraph.node(node.id);
        return {
          id: String(node.id), type: 'concept',
          position: { x: pos?.x ? pos.x - 120 : 0, y: pos?.y ? pos.y - 50 : 0 },
          data: { ...node.data, id: node.id, isSelected: node.id === selectedNodeId }
        };
      }));

      // 🔥 CTO FIX: edge 타입을 default(bezier)로 변경하여 꼬불꼬불한 선 대신 우아한 곡선 제공
      setEdges(safeLocalEdges.map(e => ({
        id: `edge-${e.source}-${e.target}`, source: String(e.source), target: String(e.target),
        type: 'default', // smoothstep 보다 직관적인 곡선
        animated: e.target === selectedNodeId, 
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        style: { stroke: '#cbd5e1', strokeWidth: 2.5 },
      })));
    } catch (err) { console.error("[Graph Error]:", err); }
  }, [selectedNodeId, allNodes, allEdges, setNodes, setEdges]);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    return allNodes.find(n => n.id === selectedNodeId)?.data || null;
  }, [selectedNodeId, allNodes]);

  if (isLoading) return (
    <div className="w-full h-screen bg-slate-50 flex flex-col items-center justify-center">
      <Loader2 className="animate-spin text-indigo-600 mb-4" size={48}/>
      <span className="font-black text-indigo-900 text-lg">지식 맵 구축 중...</span>
    </div>
  );

  return (
    <div className="w-full h-screen bg-slate-50 flex overflow-hidden font-sans text-slate-800">
      
      {/* 1. 좌측 패널 (트리 뷰 - 기존 동일) */}
      <aside className="w-[340px] bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4">
            <Map size={20} className="text-indigo-600"/> 수학 지식 내비게이터
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" placeholder="개념 검색..." 
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 outline-none"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {Object.entries(treeData).map(([major, middles]) => (
            <div key={major} className="mb-2">
              <button onClick={() => toggleMajor(major)} className="w-full flex justify-between p-2 hover:bg-slate-50 rounded-lg">
                <span className="font-black text-sm text-slate-700 flex gap-2 items-center">
                  <div className={`w-2 h-2 rounded-full ${getCategoryTheme(major).handle}`} />{major}
                </span>
                {expandedMajors.has(major) || searchQuery ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
              </button>
              {(expandedMajors.has(major) || searchQuery) && (
                <div className="ml-4 pl-3 border-l-2 border-slate-100 mt-1 space-y-2">
                  {Object.entries(middles).map(([middle, nodesList]) => (
                    <div key={middle}>
                      <div className="text-xs font-bold text-slate-400 mb-1">{middle}</div>
                      {nodesList.map(node => (
                        <button key={node.id} onClick={() => setSelectedNodeId(node.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-all ${
                            selectedNodeId === node.id ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'
                          }`}>
                          {node.data?.title}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* 2. 중앙 패널 (그래프 뷰) */}
      <main className="flex-1 relative bg-[#f8fafc]">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl shadow-lg font-bold">
            <AlertCircle size={20} className="inline mr-2"/> {error}
          </div>
        )}
        {!selectedNodeId ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Map size={64} className="mb-4 text-slate-200" />
            <h3 className="text-2xl font-black text-slate-300 mb-2">좌측 메뉴에서 개념을 선택하세요</h3>
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={handleNodeClick} nodeTypes={nodeTypes} fitView minZoom={0.5} maxZoom={2} proOptions={{ hideAttribution: true }} nodesConnectable={false}>
            <Background color="#cbd5e1" gap={24} size={2} />
            <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
          </ReactFlow>
        )}
      </main>

      {/* 3. 우측 패널 (위키 뷰) - 🔥 MathText 렌더러 적용 완료 */}
      <aside className="w-[420px] bg-white border-l border-slate-200 shadow-sm z-10 flex flex-col overflow-hidden">
        {!selectedNodeData ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-300">
            <BookOpen size={48} className="mb-4 opacity-50" />
            <p className="font-bold">상세 위키 데이터가<br/>이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            
            <nav className="flex items-center text-xs font-bold text-slate-400 mb-2">
              <span className={getCategoryTheme(selectedNodeData.major_category).text}>{selectedNodeData.major_category}</span>
              <ChevronRight size={12} className="mx-1" />
              <span>{selectedNodeData.middle_category}</span>
            </nav>

            <h2 className="text-2xl font-black text-slate-900 mb-2 leading-tight">{selectedNodeData.title}</h2>
            <hr className="border-slate-100" />

            {/* 핵심 개념 (MathText 렌더링 적용) */}
            {Array.isArray(selectedNodeData.core_concepts) && (
              <section>
                <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2 mb-3">
                  <Key size={16} className="text-indigo-500"/> 핵심 개념 노트
                </h3>
                <ul className="space-y-3">
                  {selectedNodeData.core_concepts.map((concept, idx) => (
                    <li key={idx} className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      {typeof concept === 'object' ? (
                        <div>
                          {concept.title && <strong className="block text-indigo-900 font-black mb-2">{concept.title}</strong>}
                          {/* 🔥 여기에 MathText를 주입하여 수식을 깨끗하게 렌더링합니다 */}
                          <MathText content={concept.content} />
                        </div>
                      ) : <MathText content={concept} />}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 행동 지침 (MathText 렌더링 적용) */}
            {Array.isArray(selectedNodeData.action_guidelines) && (
              <section>
                <h3 className="text-sm font-black text-teal-900 flex items-center gap-2 mb-3">
                  <Target size={16} className="text-teal-500"/> 실전 학습 지침
                </h3>
                <ul className="space-y-3">
                  {selectedNodeData.action_guidelines.map((guide, idx) => (
                    <li key={idx} className="text-sm text-slate-700 bg-teal-50/50 p-4 rounded-xl border border-teal-100">
                      {typeof guide === 'object' ? (
                        <div className="flex flex-col gap-2">
                          {guide.title && <strong className="text-teal-900 font-black">{guide.title}</strong>}
                          {guide.situation && <div className="text-xs bg-white px-2 py-1.5 rounded text-teal-700 font-bold border border-teal-100"><MathText content={`상황: ${guide.situation}`} /></div>}
                          <div className="flex gap-2 mt-1">
                            <CheckCircle2 size={16} className="text-teal-500 shrink-0 mt-1"/>
                            <span><MathText content={guide.action || guide.content || ''} /></span>
                          </div>
                        </div>
                      ) : <MathText content={guide} />}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            
          </div>
        )}
      </aside>
    </div>
  );
}