/* =========================================================================
   [서비스 가치(Service Value)]
   임페리얼 학원 AI 지식 맵 뷰어 v2.0 (Semantic Zoom & Bottom-Up DAG)
   🚀 가치 1: 상향식(Bottom-Up) 배치를 통해 '기초->심화'로 올라가는 스킬 트리 UI 구현 (학생 동기부여)
   🚀 가치 2: 시맨틱 줌을 통한 인지 과부하 방지. 줌 레벨에 따라 대분류 -> 중분류 -> 상세 개념으로 자연스럽게 전환.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  useNodesState, useEdgesState, MarkerType,
  useOnViewportChange, useReactFlow, ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { AlertCircle, Loader2, BookOpen } from 'lucide-react';

// =====================================================================
// 🎨 커스텀 노드 디자인 (Custom Nodes)
// =====================================================================

// 1. 개별 수학 개념 노드 (줌 인 상태에서 표시)
const ConceptNode = ({ data }) => (
  <div className="flex flex-col text-left bg-white border-2 border-slate-200 rounded-xl p-3 min-w-[240px] shadow-sm transition-all hover:border-indigo-400 hover:shadow-md">
    <span className="text-[10px] text-indigo-500 font-bold mb-1 truncate">
      {data.sub_category || '분류 없음'}
    </span>
    <span className="text-sm font-black text-slate-800 leading-tight">
      {data.title || '제목 없음'}
    </span>
    <span className="text-[9px] text-slate-400 mt-1 font-mono">
      {data.id}
    </span>
  </div>
);

// 2. 카테고리 그룹 노드 (줌 아웃/중간 상태에서 표시되는 거대한 배경/텍스트)
const CategoryNode = ({ data }) => (
  <div 
    className="flex items-center justify-center rounded-3xl transition-all duration-500"
    style={{ 
      width: data.width, 
      height: data.height, 
      backgroundColor: data.level === 'major' ? 'rgba(238, 242, 255, 0.4)' : 'rgba(241, 245, 249, 0.6)',
      border: data.level === 'major' ? '4px dashed rgba(199, 210, 254, 0.8)' : '2px solid rgba(203, 213, 225, 0.5)',
    }}
  >
    <div className="flex flex-col items-center opacity-80 pointer-events-none">
      <BookOpen size={data.level === 'major' ? 48 : 24} className="text-indigo-300 mb-2" />
      <span 
        className="font-black text-slate-700 text-center px-4"
        style={{ fontSize: data.level === 'major' ? '3rem' : '1.5rem', letterSpacing: '-0.02em' }}
      >
        {data.label}
      </span>
    </div>
  </div>
);

const nodeTypes = {
  concept: ConceptNode,
  category: CategoryNode,
};

// =====================================================================
// 🧭 하위 컴포넌트: 내부 상태 및 React Flow 로직 제어
// =====================================================================
function OntologyMapContent() {
  const { setNodes, setEdges } = useReactFlow();
  const [nodes, onNodesChange] = useNodesState([]);
  const [edges, onEdgesChange] = useEdgesState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentZoomTier, setCurrentZoomTier] = useState(1); // 1: 대분류, 2: 중분류, 3: 상세

  const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL;

  // 🚀 [CTO 패치 1: 상향식 자동 정렬 및 그룹 바운딩 박스 계산]
  const getLayoutedAndGroupedElements = useCallback((rawNodes, rawEdges) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    // rankdir: 'BT' (Bottom to Top) 상향식 설계 적용
    dagreGraph.setGraph({ rankdir: 'BT', ranksep: 100, nodesep: 60 });

    // 1. 기초 개념 노드 레이아웃 계산
    rawNodes.forEach((node) => { dagreGraph.setNode(node.id, { width: 240, height: 80 }); });
    rawEdges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target); });
    dagre.layout(dagreGraph);

    const layoutedConcepts = rawNodes.map((node) => {
      const nodeWithPos = dagreGraph.node(node.id);
      return {
        ...node,
        type: 'concept',
        targetPosition: 'bottom', // 아래에서 들어와서
        sourcePosition: 'top',    // 위로 나감 (스킬트리 형태)
        position: { x: nodeWithPos.x - 240 / 2, y: nodeWithPos.y - 80 / 2 },
        zIndex: 10,
      };
    });

    // 2. 카테고리별 영역(Bounding Box) 계산
    const bounds = { major: {}, middle: {} };
    
    layoutedConcepts.forEach(node => {
      const p = node.position;
      const maj = node.data?.data?.major_category || '기본 수학';
      const mid = node.data?.data?.middle_category || '일반';

      // 대분류 바운드
      if (!bounds.major[maj]) bounds.major[maj] = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      bounds.major[maj].minX = Math.min(bounds.major[maj].minX, p.x);
      bounds.major[maj].maxX = Math.max(bounds.major[maj].maxX, p.x + 240);
      bounds.major[maj].minY = Math.min(bounds.major[maj].minY, p.y);
      bounds.major[maj].maxY = Math.max(bounds.major[maj].maxY, p.y + 80);

      // 중분류 바운드
      const midKey = `${maj}-${mid}`;
      if (!bounds.middle[midKey]) bounds.middle[midKey] = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, label: mid };
      bounds.middle[midKey].minX = Math.min(bounds.middle[midKey].minX, p.x);
      bounds.middle[midKey].maxX = Math.max(bounds.middle[midKey].maxX, p.x + 240);
      bounds.middle[midKey].minY = Math.min(bounds.middle[midKey].minY, p.y);
      bounds.middle[midKey].maxY = Math.max(bounds.middle[midKey].maxY, p.y + 80);
    });

    // 3. 그룹 노드(카테고리) 생성
    const categoryNodes = [];
    const padMajor = 150;
    const padMiddle = 60;

    Object.keys(bounds.major).forEach(key => {
      const b = bounds.major[key];
      categoryNodes.push({
        id: `major-${key}`, type: 'category', zIndex: -2,
        position: { x: b.minX - padMajor, y: b.minY - padMajor },
        data: { label: key, level: 'major', width: (b.maxX - b.minX) + padMajor * 2, height: (b.maxY - b.minY) + padMajor * 2 }
      });
    });

    Object.keys(bounds.middle).forEach(key => {
      const b = bounds.middle[key];
      categoryNodes.push({
        id: `middle-${key}`, type: 'category', zIndex: -1,
        position: { x: b.minX - padMiddle, y: b.minY - padMiddle },
        data: { label: b.label, level: 'middle', width: (b.maxX - b.minX) + padMiddle * 2, height: (b.maxY - b.minY) + padMiddle * 2 }
      });
    });

    return { 
      nodes: [...categoryNodes, ...layoutedConcepts], 
      edges: rawEdges.map(e => ({
        ...e, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { stroke: '#94a3b8', strokeWidth: 2 }
      })) 
    };
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!API_BASE_URL) throw new Error("API URL이 설정되지 않았습니다.");
      const baseUrl = API_BASE_URL.replace(/\/$/, ''); 
      const endpoint = baseUrl.endsWith('/build.json') ? baseUrl : `${baseUrl}/build.json`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("서버 통신 실패");
      const text = await res.text();
      const result = JSON.parse(text);

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedAndGroupedElements(result.nodes, result.edges);
      
      // 초기 렌더링 시 시맨틱 줌 1단계(대분류) 적용
      applySemanticZoom(layoutedNodes, layoutedEdges, 1);

    } catch (err) {
      console.error(err);
      setError("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL, getLayoutedAndGroupedElements]);

  useEffect(() => { loadData(); }, [loadData]);

  // 🚀 [CTO 패치 2: 시맨틱 줌 레벨에 따른 렌더링 분기 로직]
  const applySemanticZoom = useCallback((currentNodes, currentEdges, tier) => {
    setNodes(currentNodes.map(node => {
      let hidden = false;
      let opacity = 1;

      if (node.type === 'concept') {
        hidden = tier < 3; // 줌인 상태(3)에서만 개념 노드 표시
        opacity = tier === 3 ? 1 : 0;
      } else if (node.type === 'category') {
        if (node.data.level === 'major') {
          hidden = false; // 대분류는 항상 보이지만
          opacity = tier === 1 ? 1 : (tier === 2 ? 0.3 : 0.05); // 줌인될수록 희미해져 배경화됨
        } else if (node.data.level === 'middle') {
          hidden = tier === 1; // 줌아웃 상태(1)에서는 중분류 숨김
          opacity = tier === 2 ? 1 : 0.1;
        }
      }
      return { ...node, hidden, style: { ...node.style, opacity, transition: 'opacity 0.4s ease' } };
    }));

    setEdges(currentEdges.map(edge => ({
      ...edge,
      hidden: tier < 3, // 선(엣지)은 상세 줌(3)에서만 표시하여 복잡도 제거
      style: { ...edge.style, opacity: tier === 3 ? 1 : 0, transition: 'opacity 0.4s ease' }
    })));
  }, [setNodes, setEdges]);

  // 🚀 [CTO 패치 3: 뷰포트 변경 실시간 감지 및 티어 스위칭]
  useOnViewportChange({
    onChange: (viewport) => {
      const z = viewport.zoom;
      let newTier = 1; // 줌 아웃 (대분류)
      if (z >= 0.8) newTier = 3; // 줌 인 (상세 개념)
      else if (z >= 0.4) newTier = 2; // 중간 줌 (중분류)

      // 티어가 변경되었을 때만 상태 업데이트 및 노드 속성 변경 ($O(1) 방어적 렌더링)
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
      {error && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl shadow-lg font-bold flex items-center gap-2"><AlertCircle size={20}/>{error}</div>}
      {isLoading && <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center"><Loader2 className="animate-spin text-indigo-600 mb-4" size={48}/><span className="font-black text-indigo-900">수학 지식 지도를 구축 중입니다...</span></div>}

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView minZoom={0.05} maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbd5e1" gap={24} size={2} />
        <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
        <MiniMap zoomable pannable nodeColor={(n) => n.type === 'category' ? '#e2e8f0' : '#818cf8'} maskColor="rgba(248, 250, 252, 0.7)" className="rounded-xl shadow-md border border-slate-200" />
      </ReactFlow>
      
      {/* 줌 레벨 인디케이터 (학부모 가시성 확보) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-md px-6 py-2 rounded-full shadow-lg border border-slate-200 font-bold text-slate-700 text-sm flex gap-4 transition-all">
        <span className={currentZoomTier === 1 ? "text-indigo-600" : "opacity-40"}>초광역 (대분류)</span>
        <span className="opacity-30">❯</span>
        <span className={currentZoomTier === 2 ? "text-indigo-600" : "opacity-40"}>광역 (중분류)</span>
        <span className="opacity-30">❯</span>
        <span className={currentZoomTier === 3 ? "text-indigo-600" : "opacity-40"}>상세 (개념)</span>
      </div>
    </div>
  );
}

// 최상위 Provider 래퍼
export default function OntologyMap() {
  return (
    <ReactFlowProvider>
      <OntologyMapContent />
    </ReactFlowProvider>
  );
}