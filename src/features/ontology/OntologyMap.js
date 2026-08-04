/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 v3.1 (Zero WSOD & Strict Type Defense)
   🚀 가치 1: Handle 누락, 고아 엣지, Array.map 런타임 에러 등 화면을 뻗게 만드는 모든 요소를 원천 차단.
   🚀 가치 2: 클릭 시 1-Depth 연산을 브라우저 내부에서 처리하여 Firebase 읽기 비용 100% 방어.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MarkerType,
  useNodesState, useEdgesState, Handle, Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Search, ChevronRight, Target, AlertCircle, Loader2, BookOpen, Key, Link as LinkIcon } from 'lucide-react';

// =====================================================================
// 🎨 커스텀 노드: Handle(연결점) 명시적 추가 (에러 방어 1)
// =====================================================================
const ConceptNode = ({ data }) => {
  const safeData = data || {};
  const isSelected = safeData.isSelected;

  return (
    <div className={`flex flex-col text-left bg-white border-2 rounded-xl p-4 min-w-[220px] shadow-sm transition-all duration-300 relative ${
      isSelected 
        ? 'border-indigo-600 shadow-md ring-4 ring-indigo-100 scale-105 z-50' 
        : 'border-slate-200 hover:border-indigo-300 opacity-90'
    }`}>
      {/* 🔥 CRITICAL FIX: React Flow가 선을 연결할 수 있도록 위/아래 Handle(연결점) 필수 추가 */}
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-indigo-400 border-none" />
      
      {isSelected && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <Target size={10} /> 현재 목표
        </div>
      )}
      <span className="text-xs text-indigo-500 font-bold mb-1 truncate">
        {safeData.major_category || ''} &gt; {safeData.sub_category || '분류 없음'}
      </span>
      <span className="text-base font-black text-slate-800 leading-tight">
        {safeData.title || '제목 없음'}
      </span>
      <span className="text-[10px] text-slate-400 mt-2 font-mono bg-slate-50 px-2 py-1 rounded inline-block w-fit">
        ID: {safeData.id || 'UNKNOWN'}
      </span>

      {/* 하단 연결점 */}
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-indigo-400 border-none" />
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

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

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
      setError(err.message || "데이터 로드 실패");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return allNodes;
    const lowerQ = searchQuery.toLowerCase();
    return allNodes.filter(n => {
      const title = (n.data?.title || '').toLowerCase();
      const sub = (n.data?.sub_category || '').toLowerCase();
      return title.includes(lowerQ) || sub.includes(lowerQ);
    });
  }, [allNodes, searchQuery]);

  // =====================================================================
  // 🎯 [중앙 패널] 1-Depth 연산 및 유령 노드 방어 로직
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
      rawLocalEdges.forEach(e => {
        localNodeIds.add(e.source);
        localNodeIds.add(e.target);
      });

      const localNodesRaw = allNodes.filter(n => localNodeIds.has(n.id));
      
      // 🔥 CRITICAL FIX 2: 실제로 존재하는 노드의 ID만 추출하여 '고아 엣지(유령 선)' 필터링
      const validNodeIds = new Set(localNodesRaw.map(n => n.id));
      const safeLocalEdges = rawLocalEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'BT', ranksep: 120, nodesep: 100 });

      localNodesRaw.forEach(n => { dagreGraph.setNode(n.id, { width: 220, height: 100 }); });
      safeLocalEdges.forEach(e => { dagreGraph.setEdge(e.source, e.target); });
      
      dagre.layout(dagreGraph);

      const layoutedNodes = localNodesRaw.map(node => {
        const nodeWithPos = dagreGraph.node(node.id);
        const pX = (nodeWithPos && !isNaN(nodeWithPos.x)) ? nodeWithPos.x - 110 : 0;
        const pY = (nodeWithPos && !isNaN(nodeWithPos.y)) ? nodeWithPos.y - 50 : 0;

        return {
          id: String(node.id),
          type: 'concept',
          position: { x: pX, y: pY },
          data: {
            ...node.data,
            id: node.id,
            isSelected: node.id === selectedNodeId
          }
        };
      });

      const layoutedEdges = safeLocalEdges.map(e => ({
        id: `edge-${e.source}-${e.target}`,
        source: String(e.source),
        target: String(e.target),
        type: 'smoothstep',
        animated: e.target === selectedNodeId, 
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        style: { stroke: '#6366f1', strokeWidth: 2 },
      }));

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

    } catch (err) {
      console.error("[Local Graph Render Error]:", err);
    }
  }, [selectedNodeId, allNodes, allEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = allNodes.find(n => n.id === selectedNodeId);
    return node ? node.data : null;
  }, [selectedNodeId, allNodes]);

  if (isLoading) return (
    <div className="w-full h-screen bg-slate-50 flex flex-col items-center justify-center">
      <Loader2 className="animate-spin text-indigo-600 mb-4" size={48}/>
      <span className="font-black text-indigo-900 text-lg">데이터베이스를 동기화 중입니다...</span>
    </div>
  );

  return (
    <div className="w-full h-screen bg-slate-50 flex overflow-hidden font-sans text-slate-800">
      
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-xl font-black text-indigo-900 flex items-center gap-2 mb-4">
            <BookOpen size={24} className="text-indigo-600"/> 수학 지식 사전
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="수학 개념 검색..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all outline-none font-medium"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {filteredNodes.length === 0 ? (
            <p className="text-center text-slate-400 text-sm mt-10">검색 결과가 없습니다.</p>
          ) : (
            filteredNodes.map(node => (
              <button
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                  selectedNodeId === node.id 
                    ? 'bg-indigo-50 border-indigo-200 border text-indigo-700' 
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex flex-col truncate pr-2">
                  <span className="text-[10px] text-slate-400 font-bold mb-0.5 truncate">
                    {node.data?.sub_category || '기타'}
                  </span>
                  <span className={`text-sm font-bold truncate ${selectedNodeId === node.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                    {node.data?.title || '이름 없음'}
                  </span>
                </div>
                <ChevronRight size={16} className={`${selectedNodeId === node.id ? 'text-indigo-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'} transition-all`} />
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 relative bg-[#f8fafc]">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl shadow-lg border border-rose-200 font-bold flex items-center gap-2">
            <AlertCircle size={20}/> {error}
          </div>
        )}

        {!selectedNodeId ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Target size={64} className="mb-4 text-slate-200" />
            <h3 className="text-2xl font-black text-slate-300 mb-2">개념을 선택해주세요</h3>
            <p className="text-sm">좌측 목록에서 수학 개념을 클릭하면 연결된 학습 흐름이 나타납니다.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.5} maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
          >
            <Background color="#cbd5e1" gap={24} size={2} />
            <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
          </ReactFlow>
        )}
      </main>

      <aside className="w-96 bg-white border-l border-slate-200 shadow-sm z-10 flex flex-col overflow-hidden">
        {!selectedNodeData ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <BookOpen size={48} className="mb-4 text-slate-200" />
            <p className="font-bold">선택된 개념의 상세 정보가<br/>이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.major_category || '대분류'}</span>
                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.middle_category || '중분류'}</span>
                <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[11px] font-black rounded-md">{selectedNodeData.sub_category || '소분류'}</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2 leading-tight">
                {selectedNodeData.title || '제목 없음'}
              </h2>
              <div className="text-xs text-slate-400 font-mono">ID: {selectedNodeId}</div>
            </div>

            <hr className="border-slate-100" />

            {/* 🔥 CRITICAL FIX 3: 배열(Array)인지 엄격하게 검증하여 map 크래시 원천 차단 */}
            {Array.isArray(selectedNodeData.core_concepts) && selectedNodeData.core_concepts.length > 0 && (
              <section>
                <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2 mb-3">
                  <Key size={16} className="text-indigo-500"/> 핵심 개념 (Core Concepts)
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
                <h3 className="text-sm font-black text-teal-900 flex items-center gap-2 mb-3">
                  <Target size={16} className="text-teal-500"/> 학습 행동 지침 (Action)
                </h3>
                <ul className="space-y-2">
                  {selectedNodeData.action_guidelines.map((guide, idx) => (
                    <li key={idx} className="text-sm text-slate-600 flex items-start gap-2 leading-relaxed">
                      <span className="text-teal-500 mt-1">•</span>
                      <span>{guide}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {Array.isArray(selectedNodeData.keywords) && selectedNodeData.keywords.length > 0 && (
              <section>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-3">
                  <LinkIcon size={16} className="text-slate-400"/> 연관 키워드
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedNodeData.keywords.map((kw, idx) => (
                    <span key={idx} className="px-3 py-1 bg-white border border-slate-200 text-slate-500 text-xs rounded-full shadow-sm">
                      #{kw}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}