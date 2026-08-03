/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 (Resilient Data Fetching Patch 적용)
   🚀 가치 1: 깐깐한 Header 검사를 유연한 JSON 파싱 검증으로 대체하여 CORS 환경에서도 끊김 없는 데이터 로딩 보장.
   🚀 가치 2: 환경변수 URL 오입력(/build.json 중복)을 시스템이 자동 교정하여 운영자의 휴먼 에러 원천 방지.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  useNodesState, useEdgesState, MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { 
  AlertCircle, Loader2, Maximize
} from 'lucide-react';

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
  const [isFocused, setIsFocused] = useState(false);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
  
  const getAuthHeaders = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('imperial_auth_token') : '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`
    };
  }, []);

const loadOntologyData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 🚀 [CTO 패치: CRA 및 Next.js 환경변수 동시 지원]
      const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.NEXT_PUBLIC_API_URL;
      
      // 환경 변수 누락 원천 차단 (Fail-Fast)
      if (!API_BASE_URL || API_BASE_URL.trim() === '') {
        throw new Error("[환경 변수 누락] REACT_APP_API_URL이 설정되지 않았습니다. .env 파일을 확인하고 서버를 재시작해주세요.");
      }

      const baseUrl = API_BASE_URL.replace(/\/$/, ''); 
      const endpoint = baseUrl.endsWith('/build.json') ? baseUrl : `${baseUrl}/build.json`;

      console.log(`[Imperial API] 다음 주소로 데이터 요청을 시작합니다: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`데이터 통신 실패 (${response.status}): 서버 주소를 확인해주세요.`);
      }

      const textData = await response.text();
      
      let result;
      try {
        result = JSON.parse(textData);
      } catch (parseError) {
        console.error("[Data Parse Error] 수신된 데이터의 일부:", textData.substring(0, 150));
        throw new Error("서버에서 올바른 JSON 데이터를 받지 못했습니다. API 주소를 다시 확인해주세요.");
      }
      
      if (!result || !Array.isArray(result.nodes) || !Array.isArray(result.edges)) {
        throw new Error("데이터 구조가 올바르지 않습니다. (nodes 또는 edges 배열 누락)");
      }

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
            transition: 'opacity 0.3s ease',
          },
          hidden: false
        };
      });

      const formattedEdges = result.edges.map(edge => ({
        ...edge,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        style: { stroke: '#6366f1', strokeWidth: 2, transition: 'opacity 0.3s ease' },
        animated: true,
        hidden: false
      }));

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

  useEffect(() => {
    loadOntologyData();
  }, [loadOntologyData]);

  const handleNodeClick = useCallback((event, clickedNode) => {
    const connectedEdges = edges.filter(
      (edge) => edge.source === clickedNode.id || edge.target === clickedNode.id
    );

    const visibleNodeIds = new Set([clickedNode.id]);
    connectedEdges.forEach((edge) => {
      visibleNodeIds.add(edge.source);
      visibleNodeIds.add(edge.target);
    });

    setNodes((currentNodes) => 
      currentNodes.map((node) => ({ ...node, hidden: !visibleNodeIds.has(node.id) }))
    );

    setEdges((currentEdges) => 
      currentEdges.map((edge) => ({
        ...edge,
        hidden: !(visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
      }))
    );

    setIsFocused(true);
  }, [edges, setNodes, setEdges]);

  const resetFocus = useCallback(() => {
    setNodes((currentNodes) => currentNodes.map((n) => ({ ...n, hidden: false })));
    setEdges((currentEdges) => currentEdges.map((e) => ({ ...e, hidden: false })));
    setIsFocused(false);
  }, [setNodes, setEdges]);

  return (
    <div className="w-full h-[85vh] bg-slate-50 flex rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
      
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

      {isFocused && !isLoading && (
        <button
          onClick={resetFocus}
          className="absolute top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg font-bold transition-transform active:scale-95 animate-in fade-in"
        >
          <Maximize size={18} />
          맵 전체 보기
        </button>
      )}

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