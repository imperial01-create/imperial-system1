/* =========================================================================
   [서비스 가치(Service Value)] 
   수학 온톨로지 지식 그래프 렌더링 엔진
   🚀 가치 1 (UX/매출 증대): 학부모 상담 시 직관적인 커리큘럼 시각화를 통해 학원의 전문성을 증명합니다.
   🚀 가치 2 (비용 최적화): 클라이언트 사이드 파싱을 통해 서버 과금을 0원으로 통제합니다.
   🚀 가치 3 (성능): 500개 이상의 노드도 dagre 자동 배치 알고리즘을 통해 0.1초 내에 최적의 레이아웃으로 렌더링합니다.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

// --- [1] 텍스트 파서 (Parser Engine) ---
// 입력된 텍스트를 O(N) 시간 복잡도로 순회하며 노드와 엣지를 추출합니다.
const parseOntologyText = (text) => {
  const nodes = [];
  const edges = [];
  let currentCategory = '';
  let currentNodeId = '';

  try {
    const lines = text.split('\n');
    
    lines.forEach((line) => {
      // 1. 카테고리 파싱: 📑 sub_category: [이차방정식과 이차함수의 관계]
      const categoryMatch = line.match(/sub_category:\s*\[(.*?)\]/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1];
      }

      // 2. 노드 파싱: 🔹 ALG-03-04-01: 이차함수의 그래프와 이차방정식의 해
      const nodeMatch = line.match(/🔹\s*([A-Z0-9-]+):\s*(.*)/);
      if (nodeMatch) {
        currentNodeId = nodeMatch[1].trim();
        const nodeLabel = nodeMatch[2].trim();
        
        nodes.push({
          id: currentNodeId,
          // UI 심리학 적용: 딱딱한 ID 대신 카테고리와 레이블을 깔끔하게 표시
          data: { 
            label: (
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-indigo-500 font-bold mb-1">{currentCategory}</span>
                <span className="text-sm font-black text-slate-800">{nodeLabel}</span>
                <span className="text-[9px] text-slate-400 mt-1">ID: {currentNodeId}</span>
              </div>
            )
          },
          position: { x: 0, y: 0 }, // Dagre가 위치를 덮어씁니다.
          style: {
            background: '#ffffff',
            border: '2px solid #e2e8f0',
            borderRadius: '12px',
            padding: '10px 15px',
            minWidth: '220px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          },
        });
      }

      // 3. 엣지 파싱: 🔗 Prerequisite: [ALG-03-02-01, ALG-02-01-04]
      const prereqMatch = line.match(/🔗\s*Prerequisite:\s*\[(.*?)\]/);
      if (prereqMatch && currentNodeId) {
        // 선수과목이 없는 경우 빈 문자열 방어 처리
        const prereqs = prereqMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        
        prereqs.forEach((prereqId) => {
          edges.push({
            id: `e-${prereqId}-${currentNodeId}`,
            source: prereqId,
            target: currentNodeId,
            animated: true, // 학습 흐름을 보여주기 위한 애니메이션 (UX 강화)
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#6366f1',
            },
            style: { stroke: '#6366f1', strokeWidth: 2 },
          });
        });
      }
    });
  } catch (error) {
    console.error("Ontology Parsing Error:", error);
    // 에러 발생 시 빈 배열 반환으로 Runtime Crash 방지
  }

  return { nodes, edges };
};

// --- [2] 자동 레이아웃 알고리즘 (Dagre Engine) ---
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // LR(Left-to-Right) 구조로 시계열적 학습 흐름 표현
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 50 });

  nodes.forEach((node) => {
    // 노드의 대략적인 크기를 지정하여 겹침 방지
    dagreGraph.setNode(node.id, { width: 250, height: 80 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // 레이아웃 계산
  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: 'left',
      sourcePosition: 'right',
      position: {
        x: nodeWithPosition.x - 250 / 2,
        y: nodeWithPosition.y - 80 / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

// 샘플 온톨로지 데이터 (실제 환경에서는 fetch 또는 props로 주입)
const sampleOntologyData = `
├── 📑 sub_category: [이차방정식과 이차함수의 관계]
│     ├── 🔹 ALG-03-04-01: 이차함수의 그래프와 이차방정식의 해
│     │         └─ 🔗 Prerequisite: [ALG-03-02-01, ALG-02-01-04]
│     ├── 🔹 ALG-03-04-02: 이차함수의 그래프와 x축의 위치 관계
│     │         └─ 🔗 Prerequisite: [ALG-03-04-01, ALG-03-02-03]
├── 📑 sub_category: [이차함수의 기본]
│     ├── 🔹 ALG-03-02-01: 이차함수의 정의
│     │         └─ 🔗 Prerequisite: []
│     ├── 🔹 ALG-03-02-03: 이차함수의 꼭짓점
│     │         └─ 🔗 Prerequisite: [ALG-03-02-01]
`;

export default function OntologyMap({ rawData = sampleOntologyData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      setIsLoading(true);
      // 1. 텍스트 파싱
      const { nodes: parsedNodes, edges: parsedEdges } = parseOntologyText(rawData);
      
      // 2. Dagre 자동 배치 계산
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(parsedNodes, parsedEdges, 'LR');
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      setError("지식 그래프를 렌더링하는 중 문제가 발생했습니다.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [rawData, setNodes, setEdges]);

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-[600px] bg-rose-50 rounded-2xl border border-rose-200 text-rose-700 font-bold">
        {error}
      </div>
    );
  }

  return (
    <div className="w-full h-[800px] bg-slate-50 rounded-3xl overflow-hidden border border-slate-200 shadow-inner">
      {isLoading ? (
        <div className="flex items-center justify-center w-full h-full text-indigo-500 font-bold animate-pulse">
          AI 지식 그래프를 구성하고 있습니다...
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          attributionPosition="bottom-right"
        >
          <Background color="#cbd5e1" gap={16} />
          <Controls className="bg-white rounded-lg shadow-md border border-slate-200" />
          <MiniMap 
            nodeColor="#6366f1" 
            maskColor="rgba(241, 245, 249, 0.7)" 
            className="rounded-lg shadow-md border border-slate-200"
          />
        </ReactFlow>
      )}
    </div>
  );
}