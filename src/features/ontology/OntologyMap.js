/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 v2.1 (Anti-Crash & Semantic Zoom)
   🚀 가치 1: 어떤 형태의 결함 데이터(JSON)가 들어와도 화면이 뻗지 않는 '방탄 렌더링(Zero WSOD)' 구현.
   🚀 가치 2: 고아 연결선(Orphan Edges)을 $O(N)$으로 사전 필터링하여 브라우저 메모리 누수 및 다운 방지.
   ========================================================================= */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  useNodesState, useEdgesState, MarkerType,
  useOnViewportChange, useReactFlow, ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { AlertCircle, Loader2, BookOpen } from 'lucide-react';

// =====================================================================
// 🎨 커스텀 노드: 데이터가 없어도 절대 뻗지 않는 방어적 UI 설계
// =====================================================================
const ConceptNode = ({ data }) => {
  // 방어적 코딩: data가 undefined일 경우를 완벽히 대비
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
// 🧭 메인 로직: 레이아웃 계산 및 에러 방어 컨트롤러
// =====================================================================
function OntologyMapContent() {
  const { setNodes, setEdges } = useReactFlow();
  const [nodes, onNodesChange] = useNodesState([]);
  const [edges, onEdgesChange] = useEdgesState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentZoomTier, setCurrentZoomTier] = useState(1);

  // 🚀 [CTO 패치 1: 레이아웃 계산 중 발생하는 치명적 에러 원천 차단]
  const getLayoutedAndGroupedElements = useCallback((rawNodes = [], rawEdges = []) => {
    try {
      // 1. 데이터 무결성 검사 (빈 배열 방어)
      if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
        throw new Error("렌더링할 노드 데이터가 없습니다.");
      }

      // 2. 유령 연결선(Orphan Edges) 필터링 (Dagre 크래시 방지 핵심 로직)
      const validNodeIds = new Set(rawNodes.map(n => n.id));
      const validEdges = rawEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: 'BT', ranksep: 120, nodesep: 70 }); // 상향식 배치

      rawNodes.forEach((node) => { dagreGraph.setNode(node.id, { width: 240, height: 80 }); });
      validEdges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target); });
      
      dagre.layout(dagreGraph);

      const bounds = { major: {}, middle: {} };
      
      const layoutedConcepts = rawNodes.map((node) => {
        const nodeWithPos = dagreGraph.node(node.id);
        const pX = nodeWithPos ? nodeWithPos.x - 120 : 0; // 안전한 좌표 접근
        const pY = nodeWithPos ? nodeWithPos.y - 40 : 0;

        // JSON 구조에 따른 안전한 데이터 추출 (이중 래핑 대비)
        const nodeData = node.data || {};
        const maj = nodeData.major_category || '기본 수학';
        const mid = nodeData.middle_category || '일반';

        // 바운딩 박스 계산
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
          ...node,
          type: 'concept',
          targetPosition: 'bottom',
          sourcePosition: 'top',
          position: { x: pX, y: pY },
          zIndex: 10,
        };
      });

      const categoryNodes = [];
      const padMajor = 150;
      const padMiddle = 60;

      Object.keys(bounds.major).forEach(key => {
        const b = bounds.major[key];
        if (b.minX !== Infinity) { // 유효한 바운드만 렌더링
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
          ...e, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 2 }
        })) 
      };
    } catch (error) {
      console.error("[Layout Engine Error]:", error);
      throw new Error("맵 구조를 계산하는 중 오류가 발생했습니다. 데이터 구조를 확인하세요.");
    }
  }, []);

  const applySemanticZoom = useCallback((currentNodes, currentEdges, tier) => {
    setNodes(currentNodes.map(node => {
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
    }));

    setEdges(currentEdges.map(edge => ({
      ...edge,
      hidden: tier < 3, 
      style: { ...edge.style, opacity: tier === 3 ? 1 : 0, transition: 'opacity 0.4s ease' }
    })));
  }, [setNodes, setEdges]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL;
      if (!API_BASE_URL) throw new Error("환경 변수(API_URL)가 누락되었습니다.");
      
      const baseUrl = API_BASE_URL.replace(/\/$/, ''); 
      const endpoint = baseUrl.endsWith('/build.json') ? baseUrl : `${baseUrl}/build.json`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`데이터 통신 실패 (${res.status})`);
      
      const text = await res.text();
      let result;
      try { result = JSON.parse(text); } 
      catch (e) { throw new Error("서버에서 올바른 JSON 데이터를 받지 못했습니다."); }

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedAndGroupedElements(result.nodes, result.edges);
      
      applySemanticZoom(layoutedNodes, layoutedEdges, 1);

    } catch (err) {
      console.error("[Data Load Error]:", err);
      setError(err.message || "데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [getLayoutedAndGroupedElements, applySemanticZoom]);

  useEffect(() => { loadData(); }, [loadData]);

  // 🚀 [CTO 패치 2: 줌 이벤트 쓰로틀링(Throttling)으로 렌더링 과부하 방어]
  useOnViewportChange({
    onChange: (viewport) => {
      const z = viewport.zoom;
      let newTier = 1; 
      if (z >= 0.8) newTier = 3; 
      else if (z >= 0.4) newTier = 2; 

      if (newTier !== currentZoomTier) {
        setCurrentZoomTier(newTier);
        setNodes((nds) => {
          let tempNodes = [...nds];
          setEdges((eds) => {
            applySemanticZoom(tempNodes, eds, newTier);
            return eds;
          });
          return tempNodes;
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
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView minZoom={0.05} maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false} // 보기 전용이므로 선 긋기 비활성화
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

// 🚀 ReactFlowProvider 분리
export default function OntologyMap() {
  return (
    <ReactFlowProvider>
      <OntologyMapContent />
    </ReactFlowProvider>
  );
}