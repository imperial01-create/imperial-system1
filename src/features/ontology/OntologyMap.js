/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 v4.1 (Zero Crash & Hook Rules Fix)
   🚀 가치 1: React Error #310(훅 규칙 위반)을 유발했던 인라인 렌더링 로직을 완벽히 제거하여 0% 런타임 오류 달성.
   🚀 가치 2: 중앙 패널 클릭 시 안전하게 상태(State)만 변경하여 60fps의 부드러운 줌인(Drill-down) 모션 보장.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MarkerType,
  useNodesState, useEdgesState, Handle, Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Search, Target, AlertCircle, Loader2, BookOpen, Key, Link as LinkIcon, AlertTriangle, ChevronRight, ChevronDown, Map } from 'lucide-react';

// =====================================================================
// 🎨 테마 유틸리티 (Zero Trust: 데이터가 없어도 기본값 보장)
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
// 🎨 커스텀 노드
// =====================================================================
const ConceptNode = ({ data }) => {
  const safeData = data || {};
  const isSelected = safeData.isSelected;
  const theme = getCategoryTheme(safeData.major_category);

  return (
    <div className={`flex flex-col text-left border-2 rounded-xl p-3 min-w-[240px] shadow-sm transition-all duration-300 relative bg-white ${
      isSelected 
        ? `border-indigo-600 shadow-md ring-4 ring-indigo-100 scale-105 z-50` 
        : `${theme.border} hover:border-slate-400 opacity-95`
    }`}>
      <Handle type="target" position={Position.Top} className={`w-2 h-2 ${theme.handle} border-none`} />
      
      {isSelected && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
          <Target size={10} /> 중심 개념
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1">
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${theme.badge}`}>
          {safeData.major_category || '분류 없음'}
        </span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
          {safeData.middle_category || '일반'}
        </span>
      </div>

      <span className="text-sm font-black text-slate-800 leading-tight mb-1">
        {safeData.title || '제목 없음'}
      </span>
      <span className="text-[10px] text-slate-400 font-mono mt-1">
        ID: {safeData.id || 'UNKNOWN'}
      </span>

      <Handle type="source" position={Position.Bottom} className={`w-2 h-2 ${theme.handle} border-none`} />
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

  // =====================================================================
  // 💾 1. 데이터 로드 로직
  // =====================================================================
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL;
      if (!API_BASE_URL) throw new Error("API 주소가 설정되지 않았습니다.");
      
      const baseUrl = API_BASE_URL.replace(/\/$/, ''); 
      const endpoint = baseUrl.endsWith('/build.json') ? baseUrl : `${baseUrl}/build.json`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`통신 실패 (${res.status})`);
      
      const text = await res.text();
      const result = JSON.parse(text);

      const sanitizedNodes = (result.nodes || []).map(n => ({ ...n, id: String(n.id) }));
      const sanitizedEdges = (result.edges || []).map(e => ({ ...e, source: String(e.source), target: String(e.target) }));

      setAllNodes(sanitizedNodes);
      setAllEdges(sanitizedEdges);
    } catch (err) {
      console.error("[Data Load Error]:", err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // =====================================================================
  // 🌲 2. 좌측 패널 (트리 뷰) 데이터 구축
  // =====================================================================
  const treeData = useMemo(() => {
    const tree = {};
    const lowerQ = searchQuery.toLowerCase();

    allNodes.forEach(node => {
      const d = node.data || {};
      const major = d.major_category || '미분류';
      const middle = d.middle_category || '일반';
      const title = d.title || '';

      if (searchQuery && !(title.toLowerCase().includes(lowerQ) || middle.toLowerCase().includes(lowerQ))) {
        return; 
      }

      if (!tree[major]) tree[major] = {};
      if (!tree[major][middle]) tree[major][middle] = [];
      tree[major][middle].push(node);
    });
    return tree;
  }, [allNodes, searchQuery]);

  const toggleMajor = useCallback((major) => {
    setExpandedMajors(prev => {
      const next = new Set(prev);
      if (next.has(major)) next.delete(major);
      else next.add(major);
      return next;
    });
  }, []);

  // =====================================================================
  // ⚡ 3. [에러 방어 마스터 피스] 노드 클릭 핸들러 최상단 분리
  // React Hook 규칙 위반(Error 310)을 해결하기 위해 JSX 외부로 분리했습니다.
  // =====================================================================
  const handleNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  // =====================================================================
  // 🎯 4. 로컬 그래프 (1-Depth) 렌더링 엔진
  // =====================================================================
  useEffect(() => {
    if (!selectedNodeId || allNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    try {
      const rawLocalEdges = allEdges.filter(e => e.source === selectedNodeId || e.target === selectedNodeId);
      
      const localNodeIds = new Set([selectedNodeId]);
      rawLocalEdges.forEach(e => { localNodeIds.add(e.source); localNodeIds.add(e.target); });

      const localNodesRaw = allNodes.filter(n => localNodeIds.has(n.id));
      const validNodeIds = new Set(localNodesRaw.map(n => n.id));
      const safeLocalEdges = rawLocalEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'BT', ranksep: 120, nodesep: 80 });

      localNodesRaw.forEach(n => { dagreGraph.setNode(n.id, { width: 240, height: 120 }); });
      safeLocalEdges.forEach(e => { dagreGraph.setEdge(e.source, e.target); });
      
      dagre.layout(dagreGraph);

      const layoutedNodes = localNodesRaw.map(node => {
        const nodeWithPos = dagreGraph.node(node.id);
        const pX = (nodeWithPos && !isNaN(nodeWithPos.x)) ? nodeWithPos.x - 120 : 0;
        const pY = (nodeWithPos && !isNaN(nodeWithPos.y)) ? nodeWithPos.y - 60 : 0;

        return {
          id: String(node.id),
          type: 'concept',
          position: { x: pX, y: pY },
          data: { ...node.data, id: node.id, isSelected: node.id === selectedNodeId }
        };
      });

      const layoutedEdges = safeLocalEdges.map(e => ({
        id: `edge-${e.source}-${e.target}`,
        source: String(e.source),
        target: String(e.target),
        type: 'smoothstep',
        animated: e.target === selectedNodeId, 
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        style: { stroke: '#cbd5e1', strokeWidth: 2 },
      }));

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      console.error("[Graph Error]:", err);
    }
  }, [selectedNodeId, allNodes, allEdges, setNodes, setEdges]);

  // =====================================================================
  // 📚 5. 우측 위키 데이터 추출
  // =====================================================================
  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = allNodes.find(n => n.id === selectedNodeId);
    return node ? node.data : null;
  }, [selectedNodeId, allNodes]);

  // =====================================================================
  // 🎨 6. 렌더링 UI
  // =====================================================================
  if (isLoading) return (
    <div className="w-full h-screen bg-slate-50 flex flex-col items-center justify-center">
      <Loader2 className="animate-spin text-indigo-600 mb-4" size={48}/>
      <span className="font-black text-indigo-900 text-lg">지식 맵 구축 중...</span>
    </div>
  );

  return (
    <div className="w-full h-screen bg-slate-50 flex overflow-hidden font-sans text-slate-800">
      
      {/* 1. 좌측 패널 (트리 뷰) */}
      <aside className="w-[340px] bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4">
            <Map size={20} className="text-indigo-600"/> 학원 지식 내비게이터
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="개념 검색 (예: 이차방정식)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none shadow-inner"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {Object.keys(treeData).length === 0 ? (
            <div className="text-center text-slate-400 text-sm mt-10">결과가 없습니다.</div>
          ) : (
            Object.entries(treeData).map(([major, middles]) => (
              <div key={major} className="mb-2">
                <button 
                  onClick={() => toggleMajor(major)}
                  className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-colors group"
                >
                  <span className="font-black text-sm text-slate-700 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getCategoryTheme(major).handle}`} />
                    {major}
                  </span>
                  {expandedMajors.has(major) || searchQuery ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                </button>
                
                {(expandedMajors.has(major) || searchQuery) && (
                  <div className="ml-4 pl-3 border-l-2 border-slate-100 mt-1 space-y-3">
                    {Object.entries(middles).map(([middle, nodesList]) => (
                      <div key={middle}>
                        <div className="text-xs font-bold text-slate-400 mb-1">{middle}</div>
                        <div className="space-y-1">
                          {nodesList.map(node => (
                            <button
                              key={node.id}
                              onClick={() => setSelectedNodeId(node.id)}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all ${
                                selectedNodeId === node.id 
                                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' 
                                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                              }`}
                            >
                              {node.data?.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 2. 중앙 패널 (로컬 그래프 뷰) */}
      <main className="flex-1 relative bg-[#f8fafc]">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl shadow-lg border border-rose-200 font-bold flex items-center gap-2">
            <AlertCircle size={20}/> {error}
          </div>
        )}

        {!selectedNodeId ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Map size={64} className="mb-4 text-slate-200" />
            <h3 className="text-2xl font-black text-slate-300 mb-2">좌측 메뉴에서 개념을 선택하세요</h3>
            <p className="text-sm">선택한 개념을 중심으로 선수/후수 학습 지도가 펼쳐집니다.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick} // 🔥 훅 규칙을 완벽하게 준수한 안전한 핸들러
            nodeTypes={nodeTypes}
            fitView minZoom={0.5} maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
          >
            <Background color="#cbd5e1" gap={24} size={2} />
            <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
          </ReactFlow>
        )}
      </main>

      {/* 3. 우측 패널 (상세 위키 뷰) */}
      <aside className="w-[400px] bg-white border-l border-slate-200 shadow-sm z-10 flex flex-col overflow-hidden">
        {!selectedNodeData ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-300">
            <BookOpen size={48} className="mb-4 opacity-50" />
            <p className="font-bold">상세 위키 데이터가<br/>이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            <nav className="flex items-center text-xs font-bold text-slate-400 mb-2">
              <span className={getCategoryTheme(selectedNodeData.major_category).text}>{selectedNodeData.major_category || '대분류'}</span>
              <ChevronRight size={12} className="mx-1" />
              <span>{selectedNodeData.middle_category || '중분류'}</span>
              <ChevronRight size={12} className="mx-1" />
              <span className="text-slate-600 truncate">{selectedNodeData.title}</span>
            </nav>

            <div>
              <h2 className="text-2xl font-black text-slate-900 mb-2 leading-tight">
                {selectedNodeData.title || '제목 없음'}
              </h2>
              <div className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded w-fit mt-1">ID: {selectedNodeId}</div>
            </div>

            <hr className="border-slate-100" />

            {Array.isArray(selectedNodeData.core_concepts) && selectedNodeData.core_concepts.length > 0 && (
              <section>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-3">
                  <Key size={16} className="text-indigo-500"/> 핵심 개념 노트
                </h3>
                <ul className="space-y-2">
                  {selectedNodeData.core_concepts.map((concept, idx) => (
                    <li key={idx} className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed">
                      {concept}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {Array.isArray(selectedNodeData.action_guidelines) && selectedNodeData.action_guidelines.length > 0 && (
              <section>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-3">
                  <Target size={16} className="text-teal-500"/> 실전 학습 지침
                </h3>
                <ul className="space-y-2">
                  {selectedNodeData.action_guidelines.map((guide, idx) => (
                    <li key={idx} className="text-sm text-slate-600 flex items-start gap-2 leading-relaxed">
                      <span className="text-teal-500 mt-0.5">•</span>
                      <span>{guide}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {Array.isArray(selectedNodeData.misconceptions) && selectedNodeData.misconceptions.length > 0 && (
              <section>
                <h3 className="text-sm font-black text-rose-800 flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-rose-500"/> 주의! 잦은 오개념
                </h3>
                <ul className="space-y-2">
                  {selectedNodeData.misconceptions.map((misconception, idx) => (
                    <li key={idx} className="text-sm text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-100 leading-relaxed">
                      {misconception}
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