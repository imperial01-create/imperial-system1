/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 (Static JSON & Focus Mode 적용 버전)
   🚀 가치 1: 단일 JSON 파일(build.json) 로드로 서버 호출 비용 완전 무료화 (Zero Cost).
   🚀 가치 2: Focus Mode(1-Depth 노출)를 통해 학부모와 학생의 시각적 혼란을 제거하고 학습 몰입도를 높임.
   🚀 가치 3: 런타임 에러 방지(Try-Catch) 및 Zero-Trust 토큰 검증 적용.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  useNodesState, useEdgesState, MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { 
  AlertCircle, Loader2, Maximize, Target
} from 'lucide-react';

// --- [1. Dagre 자동 레이아웃 알고리즘] ---
// 공간 기억(Spatial Memory)을 유지하기 위해 노드의 위치를 자동 정렬합니다.
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 130, nodesep: 70 });

  nodes.forEach((node) => { dagreGraph.setNode(node.id, { width: 280, height: 90 }); });
  edges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target); });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        targetPosition: 'left',
        sourcePosition: 'right',
        position: { x: nodeWithPosition.x - 280 / 2, y: nodeWithPosition.y - 90 / 2 },
      };
    }),
    edges
  };
};

export default function OntologyMap() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFocused, setIsFocused] = useState(false); // 포커스 모드 활성화 여부

  // 환경 변수 설정 및 보안 헤더 세팅
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
  
  const getAuthHeaders = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('imperial_auth_token') : '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`
    };
  }, []);

  // --- [2. 단일 JSON 데이터 로드 (Zero Cost 아키텍처)] ---
  const loadOntologyData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 🚀 CI/CD가 생성한 build.json 파일을 Cloudflare에서 한 번에 가져옵니다.
      const response = await fetch(`${API_BASE_URL}/build.json`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`데이터 로드 실패: ${response.status} 상태 코드가 반환되었습니다.`);
      }

      const result = await response.json();
      
      // 방어적 코딩: 데이터 무결성 검증
      if (!result.nodes || !result.edges) {
        throw new Error("서버에서 올바르지 않은 데이터 형식을 반환했습니다.");
      }

      // 프론트엔드 UI용 React Flow 노드 객체로 변환 (UI 렌더링 주입)
      const formattedNodes = result.nodes.map(node => {
        const parsedData = node.data || {};
        return {
          id: node.id,
          data: {
            ...parsedData,
            label: (
              <div className="flex flex-col text-left pointer-events-none">
                <span className="text-[10px] text-indigo-500 font-bold mb-1 truncate">
                  {parsedData.sub_category || '분류 없음'}
                </span>
                <span className="text-sm font-black text-slate-800 leading-tight">
                  {parsedData.title || '제목 없음'}
                </span>
                <span className="text-[9px] text-slate-400 mt-1 font-mono">
                  {node.id}
                </span>
              </div>
            )
          },
          position: { x: 0, y: 0 },
          style: {
            background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: '12px',
            padding: '12px 16px', minWidth: '280px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            transition: 'opacity 0.3s ease', // 포커스 모드 시 부드러운 전환 효과
          },
          hidden: false // 초기 상태는 모두 보임
        };
      });

      const formattedEdges = result.edges.map(edge => ({
        ...edge,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        style: { stroke: '#6366f1', strokeWidth: 2, transition: 'opacity 0.3s ease' },
        animated: true,
        hidden: false
      }));

      // Dagre를 이용해 노드 위치를 계산합니다.
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(formattedNodes, formattedEdges, 'LR');
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

    } catch (err) {
      console.error("[Ontology Fetch Error]:", err);
      setError(err.message || "커리큘럼 맵을 구성하는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE_URL, getAuthHeaders, setNodes, setEdges]);

  // 최초 로딩
  useEffect(() => {
    loadOntologyData();
  }, [loadOntologyData]);

  // --- [3. Focus Mode (1-Depth 이웃 노출) 알고리즘] ---
  const handleNodeClick = useCallback((event, clickedNode) => {
    // 1단계: 클릭한 노드와 연결된(출발지 혹은 도착지) 모든 Edge를 찾습니다.
    const connectedEdges = edges.filter(
      (edge) => edge.source === clickedNode.id || edge.target === clickedNode.id
    );

    // 2단계: 클릭한 노드 + 이웃 노드의 ID를 저장할 Set(중복 방지)을 만듭니다.
    const visibleNodeIds = new Set([clickedNode.id]);
    connectedEdges.forEach((edge) => {
      visibleNodeIds.add(edge.source);
      visibleNodeIds.add(edge.target);
    });

    // 3단계: 노드와 엣지의 hidden 속성을 업데이트하여 화면을 재구성합니다.
    setNodes((currentNodes) => 
      currentNodes.map((node) => ({
        ...node,
        hidden: !visibleNodeIds.has(node.id),
      }))
    );

    setEdges((currentEdges) => 
      currentEdges.map((edge) => ({
        ...edge,
        hidden: !(visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
      }))
    );

    setIsFocused(true); // 전체 보기 버튼을 띄우기 위해 상태 변경
  }, [edges, setNodes, setEdges]);

  // --- [4. 전체 보기 (Reset Focus) 함수] ---
  const resetFocus = useCallback(() => {
    setNodes((currentNodes) => currentNodes.map((n) => ({ ...n, hidden: false })));
    setEdges((currentEdges) => currentEdges.map((e) => ({ ...e, hidden: false })));
    setIsFocused(false);
  }, [setNodes, setEdges]);


  // 렌더링 영역
  return (
    <div className="w-full h-[85vh] bg-slate-50 flex rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
      
      {/* 🚀 에러 및 로딩 UI (학부모의 이탈을 막는 방어 기제) */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl shadow-lg border border-rose-200 font-bold flex items-center gap-2">
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
          <span className="font-black text-indigo-900 text-lg">AI 수학 지식 맵을 렌더링 중입니다...</span>
        </div>
      )}

      {/* 🚀 전체 보기 (Reset Focus) 플로팅 버튼 */}
      {isFocused && !isLoading && (
        <button
          onClick={resetFocus}
          className="absolute top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg font-bold transition-transform active:scale-95 animate-in fade-in"
        >
          <Maximize size={18} />
          맵 전체 보기
        </button>
      )}

      {/* 🚀 React Flow 메인 캔버스 */}
      <div className="flex-1 w-full h-full">
        <ReactFlow
          nodes={nodes} 
          edges={edges}
          onNodesChange={onNodesChange} 
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          fitView 
          minZoom={0.1} 
          maxZoom={1.5}
        >
          <Background color="#cbd5e1" gap={20} size={2} />
          <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
          <MiniMap nodeColor="#818cf8" maskColor="rgba(248, 250, 252, 0.8)" className="rounded-xl shadow-md border border-slate-200" />
        </ReactFlow>
      </div>

    </div>
  );
}