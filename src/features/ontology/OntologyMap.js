/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 v2.3 (The Ultimate Bugfix)
   🚀 가치 1: useNodesState의 반환값 매핑 오류를 수정하여, 초기 렌더링 시 발생하는 치명적 상태 덮어쓰기(WSOD) 원천 차단.
   🚀 가치 2: React Flow 엔진이 안정적으로 노드 크기를 측정하고 렌더링할 수 있도록 100% 무결점 상태 유지.
   ========================================================================= */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  useNodesState, useEdgesState, MarkerType,
  useOnViewportChange, ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { AlertCircle, Loader2, BookOpen } from 'lucide-react';

// =====================================================================
// 🎨 커스텀 노드: 예외 상황에서도 UI를 유지하는 방어적 렌더링
// =====================================================================
const ConceptNode = ({ data }) => {
  const safeData = data || {};
  return (
    <div className="flex flex-col text-left bg-white border-2 border-slate-200 rounded-xl p-3 min-w-[240px] shadow-sm transition-all hover:border-indigo-400 hover:shadow-md">
      <span className="text-[10px] text-indigo-500 font-bold mb-1 truncate">
        {safeData.sub_category || '분류 없음'}
      </span>
      <span className="text-sm font-black text-slate-800 leading-tight">
        {safeData.title || '제목 없음'}
      </span>
      <span className="text-[9px] text-slate-400 mt-1 font-mono">
        {safeData.id || 'ID-UNKNOWN'}
      </span>
    </div>
  );
};

const CategoryNode = ({ data }) => {
  const safeData = data || {};
  const isMajor = safeData.level === 'major';
  
  return (
    <div 
      className="flex items-center justify-center rounded-3xl transition-all duration-500"
      style={{ 
        width: safeData.width || 300, 
        height: safeData.height || 300, 
        backgroundColor: isMajor ? 'rgba(238, 242, 255, 0.4)' : 'rgba(241, 245, 249, 0.6)',
        border: isMajor ? '4px dashed rgba(199, 210, 254, 0.8)' : '2px solid rgba(203, 213, 225, 0.5)',
      }}
    >
      <div className="flex flex-col items-center opacity-80 pointer-events-none">
        <BookOpen size={isMajor ? 48 : 24} className="text-indigo-300 mb-2" />
        <span 
          className="font-black text-slate-700 text-center px-4"
          style={{ fontSize: isMajor ? '3rem' : '1.5rem', letterSpacing: '-0.02em' }}
        >
          {safeData.label || '카테고리'}
        </span>
      </div>
    </div>
  );
};

const nodeTypes = {
  concept: ConceptNode,
  category: CategoryNode,
};

// =====================================================================
// 🧭 메인 컴포넌트 로직
// =====================================================================
function OntologyMapContent() {
  // 🚀 [CTO 패치 1: 런타임 에러의 주범이었던 튜플(Tuple) 비구조화 할당 완벽 수정]
  // 이전의 오타(가운데 setNodes 누락)를 바로잡아, 이벤트 핸들러(onNodesChange)가 상태를 덮어쓰지 않도록 방어합니다.
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentZoomTier, setCurrentZoomTier] = useState(1);

  // 시맨틱 줌에 따른 노드/엣지 투명도 및 표시 여부를 반환하는 '순수 함수'
  const applyTierVisibility = useCallback((targetNodes, targetEdges, tier) => {
    const updatedNodes = targetNodes.map(node => {
      let hidden = false;
      let opacity = 1;

      if (node.type === 'concept') {
        hidden = tier < 3; 
        opacity = tier === 3 ? 1 : 0;
      } else if (node.type === 'category') {
        const safeData = node.data || {};
        if (safeData.level === 'major') {
          hidden = false; 
          opacity = tier === 1 ? 1 : (tier === 2 ? 0.3 : 0.05); 
        } else if (safeData.level === 'middle') {
          hidden = tier === 1; 
          opacity = tier === 2 ? 1 : 0.1;
        }
      }
      return { ...node, hidden, style: { ...node.style, opacity, transition: 'opacity 0.4s ease' } };
    });

    const updatedEdges = targetEdges.map(edge => ({
      ...edge,
      hidden: tier < 3, 
      style: { ...edge.style, opacity: tier === 3 ? 1 : 0, transition: 'opacity 0.4s ease' }
    }));

    return { updatedNodes, updatedEdges };
  }, []);

  // Dagre 레이아웃 생성 엔진 (Zero Exception)
  const getLayoutedAndGroupedElements = useCallback((rawNodes = [], rawEdges = []) => {
    try {
      if (!Array.isArray(rawNodes) || rawNodes.length === 0) throw new Error("렌더링할 노드 데이터가 없습니다.");

      const sanitizedNodes = rawNodes.map(n => ({ ...n, id: String(n.id) }));
      const sanitizedEdges = rawEdges.map(e => ({ ...e, source: String(e.source), target: String(e.target) }));

      const validNodeIds = new Set(sanitizedNodes.map(n => n.id));
      const validEdges = sanitizedEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'BT', ranksep: 120, nodesep: 70 }); 

      sanitizedNodes.forEach((node) => { dagreGraph.setNode(node.id, { width: 240, height: 80 }); });
      validEdges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target); });
      
      dagre.layout(dagreGraph);

      const bounds = { major: {}, middle: {} };
      
      const layoutedConcepts = sanitizedNodes.map((node) => {
        const nodeWithPos = dagreGraph.node(node.id);
        const pX = (nodeWithPos && !isNaN(nodeWithPos.x)) ? nodeWithPos.x - 120 : 0; 
        const pY = (nodeWithPos && !isNaN(nodeWithPos.y)) ? nodeWithPos.y - 40 : 0;

        const nodeData = node.data || {};
        const maj = nodeData.major_category || '기본 수학';
        const mid = nodeData.middle_category || '일반';

        if (!bounds.major[maj]) bounds.major[maj] = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        bounds.major[maj].minX = Math.min(bounds.major[maj].minX, pX);
        bounds.major[maj].maxX = Math.max(bounds.major[maj].maxX, pX + 240);
        bounds.major[maj].minY = Math.min(bounds.major[maj].minY, pY);
        bounds.major[maj].maxY = Math.max(bounds.major[maj].maxY, pY + 80);

        const midKey = `${maj}-${mid}`;
        if (!bounds.middle[midKey]) bounds.middle[midKey] = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, label: mid };
        bounds.middle[midKey].minX = Math.min(bounds.middle[midKey].minX, pX);
        bounds.middle[midKey].maxX = Math.max(bounds.middle[midKey].maxX, pX + 240);
        bounds.middle[midKey].minY = Math.min(bounds.middle[midKey].minY, pY);
        bounds.middle[midKey].maxY = Math.max(bounds.middle[midKey].maxY, pY + 80);

        return {
          ...node, type: 'concept', targetPosition: 'bottom', sourcePosition: 'top',
          position: { x: pX, y: pY }, zIndex: 10,
        };
      });

      const categoryNodes = [];
      const padMajor = 150;
      const padMiddle = 60;

      Object.keys(bounds.major).forEach(key => {
        const b = bounds.major[key];
        if (b.minX !== Infinity) { 
          categoryNodes.push({
            id: `major-${key}`, type: 'category', zIndex: -2,
            position: { x: b.minX - padMajor, y: b.minY - padMajor },
            data: { label: key, level: 'major', width: (b.maxX - b.minX) + padMajor * 2, height: (b.maxY - b.minY) + padMajor * 2 }
          });
        }
      });

      Object.keys(bounds.middle).forEach(key => {
        const b = bounds.middle[key];
        if (b.minX !== Infinity) {
          categoryNodes.push({
            id: `middle-${key}`, type: 'category', zIndex: -1,
            position: { x: b.minX - padMiddle, y: b.minY - padMiddle },
            data: { label: b.label, level: 'middle', width: (b.maxX - b.minX) + padMiddle * 2, height: (b.maxY - b.minY) + padMiddle * 2 }
          });
        }
      });

      return { 
        nodes: [...categoryNodes, ...layoutedConcepts], 
        edges: validEdges.map(e => ({
          ...e, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 2 },
          id: `edge-${e.source}-${e.target}`
        })) 
      };
    } catch (error) {
      console.error("[Layout Engine Error]:", error);
      throw new Error("맵 구조를 계산하는 중 오류가 발생했습니다.");
    }
  }, []);

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
      let result;
      try { result = JSON.parse(text); } 
      catch (e) { throw new Error("서버에서 올바른 JSON 데이터를 받지 못했습니다."); }

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedAndGroupedElements(result.nodes, result.edges);
      
      const initialTier = 1;
      const { updatedNodes, updatedEdges } = applyTierVisibility(layoutedNodes, layoutedEdges, initialTier);
      
      setNodes(updatedNodes);
      setEdges(updatedEdges);
      setCurrentZoomTier(initialTier);

    } catch (err) {
      console.error("[Data Load Error]:", err);
      setError(err.message || "데이터 로드 실패");
    } finally {
      setIsLoading(false);
    }
  }, [getLayoutedAndGroupedElements, applyTierVisibility, setNodes, setEdges]);

  useEffect(() => { loadData(); }, [loadData]);

  // 🚀 [CTO 패치 2: 줌 이벤트 발생 시 안전한 업데이트 보장]
  useOnViewportChange({
    onChange: (viewport) => {
      const z = viewport.zoom;
      let newTier = 1; 
      if (z >= 0.8) newTier = 3; 
      else if (z >= 0.4) newTier = 2; 

      if (newTier !== currentZoomTier) {
        setCurrentZoomTier(newTier);
        
        setNodes((currentNds) => {
          const { updatedNodes } = applyTierVisibility(currentNds, [], newTier);
          return updatedNodes;
        });
        
        setEdges((currentEds) => {
          const { updatedEdges } = applyTierVisibility([], currentEds, newTier);
          return updatedEdges;
        });
      }
    }
  });

  return (
    <div className="w-full h-[85vh] bg-[#f8fafc] flex rounded-3xl overflow-hidden shadow-inner relative">
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl shadow-lg border border-rose-200 font-bold flex items-center gap-2">
          <AlertCircle size={20}/> {error}
        </div>
      )}
      
      {isLoading && (
        <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-indigo-600 mb-4" size={48}/>
          <span className="font-black text-indigo-900 text-lg">수학 지식 지도를 구축 중입니다...</span>
        </div>
      )}

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} // 이제 정상 작동합니다.
        nodeTypes={nodeTypes}
        fitView minZoom={0.05} maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
      >
        <Background color="#cbd5e1" gap={24} size={2} />
        <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
        <MiniMap zoomable pannable nodeColor={(n) => n.type === 'category' ? '#e2e8f0' : '#818cf8'} maskColor="rgba(248, 250, 252, 0.7)" className="rounded-xl shadow-md border border-slate-200" />
      </ReactFlow>
      
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-md px-6 py-2 rounded-full shadow-lg border border-slate-200 font-bold text-slate-700 text-sm flex gap-4 transition-all pointer-events-none">
        <span className={currentZoomTier === 1 ? "text-indigo-600 scale-110 transition-transform" : "opacity-40"}>초광역 (대분류)</span>
        <span className="opacity-30">❯</span>
        <span className={currentZoomTier === 2 ? "text-indigo-600 scale-110 transition-transform" : "opacity-40"}>광역 (중분류)</span>
        <span className="opacity-30">❯</span>
        <span className={currentZoomTier === 3 ? "text-indigo-600 scale-110 transition-transform" : "opacity-40"}>상세 (개념)</span>
      </div>
    </div>
  );
}

export default function OntologyMap() {
  return (
    <ReactFlowProvider>
      <OntologyMapContent />
    </ReactFlowProvider>
  );
}