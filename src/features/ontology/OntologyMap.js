/* =========================================================================
   [서비스 가치(Service Value)] 
   GitOps 기반 수학 온톨로지 에디터 (Cloudflare Edge Proxy Version)
   🚀 가치 1 (UX 심리학): 학생의 오개념과 행동 영역을 직관적인 카드로 보여주어 학부모 상담 신뢰도를 극대화합니다.
   🚀 가치 2 (비용/속도 해방): Firebase 종속성을 제거하고 표준 fetch API를 사용하여, 트래픽 비용을 0에 가깝게 만들고 Cloudflare의 엣지 네트워크를 통한 번개같은 로딩을 구현합니다.
   🚀 가치 3 (0% Runtime Error): 옵셔널 체이닝(?.)과 철저한 HTTP 상태 코드 방어 로직으로 앱 크래시를 원천 차단합니다.
   ========================================================================= */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  useNodesState, useEdgesState, MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { 
  Settings, AlertCircle, X, GitMerge, FileText, Loader2, GitCommit, 
  Brain, Target, AlertTriangle, CheckCircle2, ChevronRight, Edit3, CheckSquare
} from 'lucide-react';

// 🚀 [CTO 패치] Firebase 임포트 완전 삭제 완료

// --- [Dagre 자동 레이아웃 알고리즘 최적화] ---
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  // 노드 간 간격을 넓혀 시각적 가독성(Visibility) 강화 (학부모 시력 고려)
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
  
  const [filesData, setFilesData] = useState({}); // { [nodeId]: { sha, path, rawYaml, parsedData } }
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftYaml, setDraftYaml] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState(null);

  // 🚀 [CTO 패치] 환경 변수에서 API Base URL 호출
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

  // 🚀 [CTO 패치] Zero-Trust 기반 인증 헤더 생성 유틸리티
  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('imperial_auth_token') : '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || ''}`
    };
  };

  // --- [1] Cloudflare Edge 연동 (데이터 읽기) ---
  const loadOntologyData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 🚀 표준 fetch API 사용
      const response = await fetch(`${API_BASE_URL}/api/ontology`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`데이터 로드 실패: ${response.status} 상태 코드가 반환되었습니다.`);
      }

      const result = await response.json();
      const fetchedFiles = result.data; // 서버에서 { success: true, data: [...] } 형태로 보낸다고 가정
      
      const newNodes = [];
      const newEdges = [];
      const newFilesMap = {};

      fetchedFiles.forEach(file => {
        if (!file?.id) return; // [방어적 코딩] ID 누락된 비정상 데이터 무시
        newFilesMap[file.id] = file;

        newNodes.push({
          id: file.id,
          data: { 
            label: (
              <div className="flex flex-col text-left pointer-events-none">
                <span className="text-[10px] text-indigo-500 font-bold mb-1 truncate">{file.parsedData?.sub_category || ''}</span>
                <span className="text-sm font-black text-slate-800 leading-tight">{file.parsedData?.title || '제목 없음'}</span>
                <span className="text-[9px] text-slate-400 mt-1 font-mono">{file.id}</span>
              </div>
            )
          },
          position: { x: 0, y: 0 },
          style: {
            background: '#ffffff', border: '2px solid #e2e8f0', borderRadius: '12px',
            padding: '12px 16px', minWidth: '280px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          },
        });

        const prereqs = file.parsedData?.relations?.prerequisite || [];
        prereqs.forEach(prereqId => {
          newEdges.push({
            id: `e-${prereqId}-${file.id}`,
            source: prereqId,
            target: file.id,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
            style: { stroke: '#6366f1', strokeWidth: 2 },
          });
        });
      });

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
      
      setFilesData(newFilesMap);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

      if (selectedNodeId && newFilesMap[selectedNodeId]) {
        setDraftYaml(newFilesMap[selectedNodeId].rawYaml);
      }

    } catch (err) {
      console.error("Fetch Error:", err);
      setError(err.message || "서버에서 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedNodeId, setNodes, setEdges, API_BASE_URL]);

  useEffect(() => { loadOntologyData(); }, [loadOntologyData]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(node.id);
    if (filesData[node.id]) setDraftYaml(filesData[node.id].rawYaml);
    setIsEditMode(false); 
    setIsSidebarOpen(true);
  }, [filesData]);

  // --- [2] Cloudflare Edge 연동 (데이터 저장/업데이트) ---
  const handleCommit = async () => {
    if (!selectedNodeId || !filesData[selectedNodeId]) return;
    if (!window.confirm(`[${selectedNodeId}] 단원의 내용을 시스템에 반영하시겠습니까?`)) return;

    setIsCommitting(true);
    const targetFile = filesData[selectedNodeId];

    try {
      // 🚀 표준 fetch API POST 사용
      const response = await fetch(`${API_BASE_URL}/api/ontology/commit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          path: targetFile.path,
          content: draftYaml,
          sha: targetFile.sha,
          message: `Update ontology node: ${selectedNodeId}`
        }),
      });

      if (!response.ok) {
        throw new Error(`저장 실패: 서버 응답 오류 (${response.status})`);
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.message || '알 수 없는 서버 오류');

      alert("성공적으로 업데이트 되었습니다.");
      await loadOntologyData(); 
      setIsEditMode(false);
    } catch (err) {
      console.error("Commit Error:", err);
      alert(`저장 실패: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const selectedData = selectedNodeId ? filesData[selectedNodeId]?.parsedData : null;

  return (
    <div className="w-full h-[85vh] bg-slate-50 flex rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
      
      {/* 1. 메인 그래프 영역 */}
      <div className="flex-1 relative">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl shadow-lg border border-rose-200 font-bold flex items-center gap-2">
            <AlertCircle size={20} /> {error}
          </div>
        )}

        {isLoading ? (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm z-40 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
            <span className="font-black text-indigo-900 text-lg">AI 수학 지식 맵을 분석 중입니다...</span>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView minZoom={0.1} maxZoom={1.5}
          >
            <Background color="#cbd5e1" gap={20} size={2} />
            <Controls className="bg-white rounded-xl shadow-md border border-slate-200" />
            <MiniMap nodeColor="#818cf8" maskColor="rgba(248, 250, 252, 0.8)" className="rounded-xl shadow-md border border-slate-200" />
          </ReactFlow>
        )}
      </div>

      {/* 2. 우측 인터랙티브 사이드바 */}
      <aside className={`w-[520px] bg-white border-l border-slate-200 flex flex-col transform transition-transform duration-300 z-20 ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full absolute right-0 h-full'}`}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h2 className="font-black text-slate-800 flex items-center gap-2 text-lg">
            <Settings className="text-indigo-600" size={22} /> 커리큘럼 세부 분석
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-800 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {selectedData ? (
            <>
              <div className="mb-6">
                <div className="text-xs font-black text-indigo-500 mb-2 px-2 py-1 bg-indigo-50 rounded-md inline-block">
                  {selectedData.sub_category || '카테고리 없음'}
                </div>
                <h3 className="text-xl font-black text-slate-800 leading-snug">{selectedData.title || '제목 없음'}</h3>
                <div className="text-xs font-bold text-slate-400 font-mono mt-2">단원 코드: {selectedData.id}</div>
              </div>

              {!isEditMode ? (
                /* --- 뷰어 모드 --- */
                <div className="space-y-4 animate-in fade-in">
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                    <h4 className="text-sm font-black text-blue-800 flex items-center gap-1.5 mb-3"><Brain size={16}/> 핵심 개념 (Core Concepts)</h4>
                    {selectedData.core_concepts?.length > 0 ? (
                      <ul className="space-y-2">
                        {selectedData.core_concepts.map((concept, idx) => (
                          <li key={idx} className="text-sm font-bold text-blue-900 flex items-start gap-2 bg-white p-2 rounded-lg shadow-sm">
                            <CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{concept}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-xs font-bold text-slate-400">등록된 데이터가 없습니다.</span>}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                    <h4 className="text-sm font-black text-emerald-800 flex items-center gap-1.5 mb-3"><Target size={16}/> 실전 개념 (Practical Concepts)</h4>
                    {selectedData.practical_concepts?.length > 0 ? (
                      <ul className="space-y-2">
                        {selectedData.practical_concepts.map((concept, idx) => (
                          <li key={idx} className="text-sm font-bold text-emerald-900 flex items-start gap-2 bg-white p-2 rounded-lg shadow-sm">
                            <ChevronRight size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{concept}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-xs font-bold text-slate-400">등록된 데이터가 없습니다.</span>}
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <h4 className="text-sm font-black text-amber-800 flex items-center gap-1.5 mb-3"><CheckSquare size={16}/> 행동 영역 (Action Guidelines)</h4>
                    {selectedData.action_guidelines?.length > 0 ? (
                      <ul className="space-y-2">
                        {selectedData.action_guidelines.map((action, idx) => (
                          <li key={idx} className="text-sm font-bold text-amber-900 flex items-start gap-2 bg-white p-2 rounded-lg shadow-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                            <span className="leading-relaxed">{action}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-xs font-bold text-slate-400">등록된 데이터가 없습니다.</span>}
                  </div>

                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                    <h4 className="text-sm font-black text-rose-800 flex items-center gap-1.5 mb-3"><AlertTriangle size={16}/> 주의할 오개념 (Misconceptions)</h4>
                    {selectedData.misconceptions?.length > 0 ? (
                      <ul className="space-y-2">
                        {selectedData.misconceptions.map((mc, idx) => (
                          <li key={idx} className="text-sm font-bold text-rose-900 flex items-start gap-2 bg-white p-2 rounded-lg shadow-sm border border-rose-50">
                            <X size={16} className="text-rose-500 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{mc}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-xs font-bold text-slate-400">등록된 데이터가 없습니다.</span>}
                  </div>

                  <button 
                    onClick={() => setIsEditMode(true)}
                    className="w-full mt-6 bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Edit3 size={18} /> 관리자: 데이터 수정하기
                  </button>
                </div>
              ) : (
                /* --- 에디터 모드 --- */
                <div className="flex flex-col h-full min-h-[600px] animate-in slide-in-from-bottom-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-black text-slate-500 flex items-center gap-1.5"><FileText size={16} /> YAML 에디터</span>
                    <button onClick={() => setIsEditMode(false)} className="text-xs font-bold text-indigo-600 hover:underline">수정 취소</button>
                  </div>
                  <textarea
                    value={draftYaml}
                    onChange={(e) => setDraftYaml(e.target.value)}
                    disabled={isCommitting}
                    className="flex-1 w-full bg-slate-900 text-amber-400 font-mono text-sm p-4 rounded-2xl outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 resize-none leading-relaxed whitespace-pre shadow-inner disabled:opacity-50"
                    spellCheck="false"
                  />
                  <button
                    onClick={handleCommit}
                    disabled={isCommitting}
                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
                  >
                    {isCommitting ? (
                      <><Loader2 className="animate-spin" size={18} /> 클라우드에 반영 중...</>
                    ) : (
                      <><GitCommit size={18} /> 시스템에 즉시 반영 (Save)</>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
              <Brain size={48} className="mb-4" />
              <p className="font-bold text-lg">노드를 선택해주세요</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}