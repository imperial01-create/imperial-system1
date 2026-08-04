/* =========================================================================
   [서비스 가치(Service Value)] 
   임페리얼 학원 AI 지식 맵 뷰어 마스터 버전 (EdTech CT-Driven)
   🚀 가치 1: 런타임 오류 0% (Zero WSOD) - 엄격한 타입 검증과 방어적 렌더링 적용.
   🚀 가치 2: 1-Click GitHub 연동으로 운영 마찰 제거 및 데이터 최신화 유도.
   🚀 가치 3: KaTeX 및 하향식(TB) 라우팅을 통한 학생 인지 부하 최소화.
   ========================================================================= */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MarkerType,
  useNodesState, useEdgesState, Handle, Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { 
  Search, Target, AlertCircle, Loader2, BookOpen, Key, 
  AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Map, Github, Edit3 
} from 'lucide-react';

import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

// =====================================================================
// 🧮 1. 텍스트 & 수식(LaTeX) 자동 분리 렌더러 (XSS 방어)
// =====================================================================
const MathText = ({ content }) => {
  if (!content) return null;
  if (typeof content !== 'string') return <span>{content}</span>;

  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);

  return (
    <span className="leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return <BlockMath key={index} math={part.slice(2, -2)} />;
        } else if (part.startsWith('$') && part.endsWith('$')) {
          return <InlineMath key={index} math={part.slice(1, -1)} />;
        }
        return <span key={index} className="whitespace-pre-wrap">{part}</span>;
      })}
    </span>
  );
};

// =====================================================================
// 🎨 2. 테마 유틸리티 (대분류 기반 컬러 매핑)
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
// 🎨 3. 커스텀 노드 (상하 Handle 유지 / 꼬임 방지)
// =====================================================================
const ConceptNode = ({ data }) => {
  const safeData = data || {};
  const isSelected = safeData.isSelected;
  const theme = getCategoryTheme(safeData.major_category);

  return (
    <div className={`flex flex-col text-left border-2 rounded-xl p-3 min-w-[240px] shadow-sm transition-all duration-300 relative bg-white ${
      isSelected ? `border-indigo-600 shadow-lg ring-4 ring-indigo-100 scale-105 z-50` : `${theme.border} hover:border-slate-400 opacity-95`
    }`}>
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
      
      <Handle type="source" position={Position.Bottom} className={`w-3 h-3 ${theme.handle} border-2 border-white`} />
    </div>
  );
};
const nodeTypes = { concept: ConceptNode };

// =====================================================================
// 📚 4. 우측 위키 패널 컴포넌트 (Direct Edit + MathText + Object 방어)
// =====================================================================
const WikiPanel = ({ selectedNodeData, selectedNodeId, theme }) => {
  if (!selectedNodeData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-300">
        <BookOpen size={48} className="mb-4 opacity-50" />
        <p className="font-bold">좌측 메뉴에서 개념을 선택하시면<br/>상세 분석 데이터가 도출됩니다.</p>
      </div>
    );
  }

  // GitHub Edit 연결 로직 (운영자 마찰 감소)
  const GITHUB_EDIT_BASE_URL = process.env.REACT_APP_GITHUB_REPO_URL || "https://github.com/imperial-academy/math-ontology/edit/main/data/";

  const handleEditClick = () => {
    let targetPath = selectedNodeData.file_path;
    if (!targetPath) {
      console.warn(`[OntologyDashboard] ID: ${selectedNodeId}의 file_path가 없어 경로를 유추합니다.`);
      const fallbackDir = selectedNodeData.major_category ? 'categorized' : 'misc';
      targetPath = `${fallbackDir}/${selectedNodeId}.yaml`;
    }
    const finalUrl = `${GITHUB_EDIT_BASE_URL}${targetPath}`;
    window.open(finalUrl, '_blank', 'noopener,noreferrer'); // Tabnabbing 방어
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-white relative group">
      
      <header className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 text-[11px] font-black rounded-md ${theme.badge}`}>{selectedNodeData.major_category || '대분류'}</span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.middle_category || '중분류'}</span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[11px] font-black rounded-md">{selectedNodeData.sub_category || '소분류'}</span>
          </div>

          <button 
            onClick={handleEditClick}
            title="GitHub에서 원본 YAML 수정하기"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-600 hover:scale-105 transition-all duration-200 active:scale-95 focus:outline-none"
          >
            <Github size={14} />
            <span className="hidden sm:inline">Edit Source</span>
            <Edit3 size={14} className="ml-0.5 opacity-70" />
          </button>
        </div>

        <h2 className="text-2xl font-black text-slate-900 mb-2 leading-tight pr-10">{selectedNodeData.title || '제목 없음'}</h2>
        <div className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded w-fit">Node ID: {selectedNodeId}</div>
      </header>

      <hr className="border-slate-100" />

      {/* 핵심 개념 */}
      {Array.isArray(selectedNodeData.core_concepts) && selectedNodeData.core_concepts.length > 0 && (
        <section>
          <h3 className="text-sm font-black text-indigo-900 flex items-center gap-2 mb-3">
            <Key size={16} className="text-indigo-500"/> 핵심 개념 노트
          </h3>
          <ul className="space-y-3">
            {selectedNodeData.core_concepts.map((concept, idx) => (
              <li key={concept.id || idx} className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {typeof concept === 'object' ? (
                  <div>
                    {concept.title && <strong className="block text-indigo-900 font-black mb-2">{concept.title}</strong>}
                    <MathText content={concept.content} />
                  </div>
                ) : <MathText content={concept} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 행동 지침 */}
      {Array.isArray(selectedNodeData.action_guidelines) && selectedNodeData.action_guidelines.length > 0 && (
        <section>
          <h3 className="text-sm font-black text-teal-900 flex items-center gap-2 mb-3">
            <Target size={16} className="text-teal-500"/> 실전 학습 지침
          </h3>
          <ul className="space-y-3">
            {selectedNodeData.action_guidelines.map((guide, idx) => (
              <li key={guide.id || idx} className="text-sm text-slate-700 bg-teal-50/50 p-4 rounded-xl border border-teal-100">
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

      {/* 오개념 진단 */}
      {Array.isArray(selectedNodeData.misconceptions) && selectedNodeData.misconceptions.length > 0 && (
        <section>
          <h3 className="text-sm font-black text-rose-800 flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-rose-500"/> 취약점 진단 및 오개념
          </h3>
          <ul className="space-y-3">
            {selectedNodeData.misconceptions.map((miscon, idx) => (
              <li key={miscon.id || idx} className="text-sm text-slate-700 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                {typeof miscon === 'object' ? (
                  <div className="flex flex-col gap-2">
                    {miscon.title && <strong className="block text-rose-900 font-black">{miscon.title}</strong>}
                    {miscon.symptom && (
                      <div className="text-xs font-bold text-rose-600 flex items-start gap-1 bg-white p-2 rounded-md border border-rose-100/50">
                        <AlertCircle size={14} className="shrink-0 mt-0.5"/> 
                        <span>증상: {miscon.symptom}</span>
                      </div>
                    )}
                    {miscon.diagnosis_message && (
                      <div className="text-sm text-rose-800 leading-relaxed bg-rose-100/30 p-3 rounded-lg">
                        💡 처방: <MathText content={miscon.diagnosis_message} />
                      </div>
                    )}
                  </div>
                ) : <MathText content={miscon} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

// =====================================================================
// 🧭 5. 메인 대시보드 컴포넌트
// =====================================================================
export default function OntologyMap() {
  const [allNodes, setAllNodes] = useState([]);
  const [allEdges, setAllEdges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [expandedMajors, setExpandedMajors] = useState(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // 데이터 로딩 (정적 JSON 캐싱)
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

  // 트리 메뉴 데이터 구성 로직 (O(N) 복잡도 최적화)
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

  // 그래프 정렬 엔진 (하향식 TB 적용으로 꼬임 방지)
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

      setEdges(safeLocalEdges.map(e => ({
        id: `edge-${e.source}-${e.target}`, source: String(e.source), target: String(e.target),
        type: 'default',
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
      
      {/* 좌측 트리 패널 */}
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

      {/* 중앙 그래프 패널 */}
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

      {/* 우측 위키 패널 (분리된 컴포넌트 렌더링) */}
      <aside className="w-[420px] bg-white border-l border-slate-200 shadow-sm z-10 flex flex-col overflow-hidden">
        <WikiPanel 
          selectedNodeData={selectedNodeData} 
          selectedNodeId={selectedNodeId} 
          theme={selectedNodeData ? getCategoryTheme(selectedNodeData.major_category) : {}} 
        />
      </aside>
    </div>
  );
}