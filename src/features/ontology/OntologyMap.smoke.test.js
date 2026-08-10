/* =========================================================================
   지식 맵 스모크 테스트 — "빌드는 통과했는데 화면에서 죽는" 부류를 잡는다.

   왜 있는가: 현황판 첫 배포가 lucide 의 Map 아이콘이 내장 Map 을 가리는
   바람에 프로덕션에서만 "not a constructor" 로 죽었다. 컴파일 검증으로는
   절대 못 잡는 오류라, 실제 렌더 경로 세 가지를 실행한다.
     1. 데이터 로딩 → 트리 표시
     2. 현황판 토글 클릭 (그래프 지표 계산 포함)
     3. 트리에서 노드 선택 → v1/v2 상세 위키 렌더

   ReactFlow 는 jsdom 에서 못 그리므로 껍데기로 대체한다 — 이 테스트의
   대상은 우리 코드(위키 패널·현황판·간선 매핑)지 ReactFlow 가 아니다.
   ========================================================================= */

import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';

jest.mock('../../firebase', () => ({ functions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: () => jest.fn() }));
jest.mock('../../contexts/DataContext', () => ({
  useData: () => ({ currentUser: { role: 'admin' } }),
}));
jest.mock('@xyflow/react', () => {
  const ReactLib = require('react');
  return {
    ReactFlow: ({ children }) => ReactLib.createElement('div', { 'data-testid': 'reactflow' }, children),
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useNodesState: () => [[], jest.fn(), jest.fn()],
    useEdgesState: () => [[], jest.fn(), jest.fn()],
  };
});

/* 픽스처: 이관된 실데이터 v2 concept 1개(수식 포함) + 합성 skill/trap + v1 노드 1개.
   v1 과 v2 가 섞인 "이관 중" 상태를 그대로 재현한다. */
const V2_CONCEPT = { id: 'NUM-01-01-01', type: 'concept', title: '자연수의 뜻과 십진기수법', major_category: '수와 연산', middle_category: '자연수와 정수', sub_category: '자연수의 체계와 사칙연산', status: 'draft', source: 'ai', updated_at: '2026-08-10', keywords: ['자연수', '십진기수법'], definition: [{ id: 'NUM-01-01-01-C1', title: '자연수(Natural Numbers)의 정의', content: '집합 기호로는 $\\mathbb{N} = \\{1, 2, 3\\}$ 으로 나타낸다.', state: 'filled' }], relations: { prerequisite: [] }, display_order: 10 };
const V2_SKILL = { id: 'SKL-0001', type: 'skill', title: '삼각치환', major_category: '해석학', middle_category: '적분', sub_category: '치환적분', status: 'draft', source: 'ai', updated_at: '2026-08-10', trigger_signals: ['적분 안에 $\\sqrt{a^2-x^2}$ 꼴'], procedure: ['$x = a\\sin\\theta$ 로 치환한다', '구간을 바꾼다'], why_it_works: '피타고라스 항등식으로 근호가 벗겨진다', limits: ['$x^2-a^2$ 꼴이면 sec 치환'], relations: { prerequisite: ['NUM-01-01-01'], applies_to: ['NUM-01-01-01'], alternative_to: ['SKL-0002'] } };
const V2_TRAP = { id: 'TRP-0001', type: 'trap', title: '절댓값 부호 분리 누락', major_category: '대수', middle_category: '방정식', sub_category: '절댓값', status: 'draft', source: 'ai', updated_at: '2026-08-10', symptom: '절댓값을 그냥 벗긴다', why: '부호 조건을 잊는다', diagnosis_message: '경우를 나눴나요?', correction: '양·음 두 경우로 나눈다', relations: { trap_of: ['NUM-01-01-01'] } };
const V2_SKILL2 = { id: 'SKL-0002', type: 'skill', title: '반각치환', major_category: '해석학', middle_category: '적분', sub_category: '치환적분', status: 'draft', source: 'ai', updated_at: '2026-08-10', trigger_signals: ['유리 삼각식'], procedure: ['$t = \\tan(x/2)$'], why_it_works: '유리화된다', limits: ['계산량 큼'], relations: {} };
const V1_NODE = { id: 'NUM-01-01-02', title: '자연수의 덧셈과 뺄셈', level: '세분류', major_category: '수와 연산', middle_category: '자연수와 정수', sub_category: '자연수의 체계와 사칙연산', keywords: [], core_concepts: [{ id: 'NUM-01-01-02-C1', title: '덧셈의 정의', content: '합병과 첨가 상황을 수로 표현한다.' }], practical_concepts: [{ id: 'P1', title: '[2~3단계에서 작성 예정] 실전 포인트', content: '2~3단계 문제은행 피딩을 통해 업데이트됩니다.' }], relations: { prerequisite: ['NUM-01-01-01'] } };

const BUILD_JSON = {
  lastUpdated: '2026-08-10T00:00:00Z',
  nodes: [V2_CONCEPT, V2_SKILL, V2_SKILL2, V2_TRAP, V1_NODE].map(d => ({ id: d.id, data: d, position: { x: 0, y: 0 } })),
  edges: [
    { id: 'e-NUM-01-01-01-NUM-01-01-02', source: 'NUM-01-01-01', target: 'NUM-01-01-02', relation: 'prerequisite', animated: true },
    { id: 'e-NUM-01-01-01-SKL-0001', source: 'NUM-01-01-01', target: 'SKL-0001', relation: 'prerequisite', animated: true },
    { id: 'e-applies_to-SKL-0001-NUM-01-01-01', source: 'SKL-0001', target: 'NUM-01-01-01', relation: 'applies_to', animated: false },
    { id: 'e-alternative_to-SKL-0001-SKL-0002', source: 'SKL-0001', target: 'SKL-0002', relation: 'alternative_to', animated: false },
    { id: 'e-trap_of-TRP-0001-NUM-01-01-01', source: 'TRP-0001', target: 'NUM-01-01-01', relation: 'trap_of', animated: false },
  ],
};

// 컴포넌트는 정적으로 한 번만 불러온다. jest.resetModules() 로 매번 새로 불러오면
// React 인스턴스가 둘이 되어 훅이 깨진다. 모듈 캐시(ontologyCache)는 매 테스트
// 동일한 픽스처라 남아 있어도 무해하다 (fetch 만 생략될 뿐).
// eslint-disable-next-line import/first
import OntologyMap from './OntologyMap';

let container;
let root;

const flush = () => act(async () => { await Promise.resolve(); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const buttonByText = (text) => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text));

beforeEach(async () => {
  process.env.REACT_APP_API_URL = 'http://mock.local';
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(BUILD_JSON) }));
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<OntologyMap />); });
  await flush();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('로딩 후 트리가 표시된다 (v1·v2 혼재 데이터)', () => {
  expect(container.textContent).toContain('전체 5개 개념');
  expect(container.textContent).toContain('수와 연산');
});

test('현황판을 클릭해도 죽지 않고 지표가 계산된다', async () => {
  const dashBtn = buttonByText('현황판');
  expect(dashBtn).toBeTruthy();
  click(dashBtn); // Map 섀도잉 버그가 있으면 여기서 "not a constructor" 로 죽는다
  await flush();
  expect(container.textContent).toContain('대분류별 작성 진행률');
  expect(container.textContent).toContain('관계 종류별 연결');
  expect(container.textContent).toContain('최장 학습 경로');
});

test('v2 concept 선택 시 정의 섹션이 렌더된다', async () => {
  click(buttonByText('수와 연산'));
  await flush();
  click(buttonByText('자연수의 뜻과 십진기수법'));
  await flush();
  expect(container.textContent).toContain('정의');
  expect(container.textContent).toContain('자연수(Natural Numbers)의 정의');
});

test('v2 skill 선택 시 절차·트리거·관계가 렌더된다', async () => {
  click(buttonByText('해석학'));
  await flush();
  click(buttonByText('삼각치환'));
  await flush();
  expect(container.textContent).toContain('언제 꺼내 쓰는가');
  expect(container.textContent).toContain('실행 절차');
  expect(container.textContent).toContain('왜 성립하는가');
  expect(container.textContent).toContain('안 되는 경우');
  expect(container.textContent).toContain('같은 문제를 푸는 다른 방법'); // alternative_to
});

test('v2 trap 선택 시 증상·처방이 렌더된다', async () => {
  click(buttonByText('대수'));
  await flush();
  click(buttonByText('절댓값 부호 분리 누락'));
  await flush();
  expect(container.textContent).toContain('어떻게 틀리는가');
  expect(container.textContent).toContain('AI 튜터 처방');
  expect(container.textContent).toContain('바로잡기');
});

test('v1 노드는 기존 렌더링(대기 문구 정제 포함)이 유지된다', async () => {
  click(buttonByText('수와 연산'));
  await flush();
  click(buttonByText('자연수의 덧셈과 뺄셈'));
  await flush();
  expect(container.textContent).toContain('핵심 개념 노트');
  expect(container.textContent).toContain('덧셈의 정의');
  // 대기 문구("작성 예정")는 화면에 나오면 안 된다
  expect(container.textContent).not.toContain('작성 예정');
  expect(container.textContent).not.toContain('업데이트됩니다');
});
