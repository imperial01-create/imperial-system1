/* 학교명으로 Firestore 문서를 찾는 공용 헬퍼

   [왜 필요한가]
   같은 학교를 찾는데 화면마다 방식이 달랐습니다.
     내신 연구소     : 변형 목록 in 쿼리
     시험 진단 입력  : 접두사 범위 쿼리
     기출 아카이브   : 완전 일치
     학생 대시보드   : 완전 일치 (학사일정)
   그래서 같은 학교인데 어떤 화면에선 나오고 어떤 화면에선 안 나왔습니다.
   이 파일 하나만 쓰도록 모아, 규칙을 한 곳에서 관리합니다.

   [동작]
   1) 있을 법한 표기들로 in 쿼리를 던져 후보를 좁힙니다 (읽기 비용 절감)
   2) 받아온 결과를 isSameSchool 로 다시 걸러 오탐을 제거합니다
   과거에 여러 표기로 저장된 문서도 함께 찾아지므로, 데이터 정리 전에도 동작합니다.
*/

import { query, where, getDocs, limit as fsLimit } from 'firebase/firestore';
import { isSameSchool, buildSchoolQueryVariations } from './schoolName';

/**
 * 학교명으로 문서를 조회합니다.
 *
 * @param baseQuery   collection() 또는 다른 조건이 이미 걸린 query()
 * @param schoolName  찾을 학교명 (표기가 달라도 됩니다)
 * @param options.schoolsData 학교 마스터 목록 (있으면 정본까지 후보에 포함)
 * @param options.field       비교할 필드명 (기본 'schoolName')
 * @param options.max         최대 문서 수. 학생·학부모 화면은 반드시 지정해야 합니다 —
 *                            보안 규칙이 교직원이 아닌 목록 조회에 상한을 요구합니다.
 * @returns 문서 배열. 학교명이 비어 있으면 빈 배열.
 */
export const fetchBySchool = async (baseQuery, schoolName, options = {}) => {
  const { schoolsData = null, field = 'schoolName', max = null } = options;

  const target = String(schoolName || '').trim();
  if (!target) return [];

  const variations = buildSchoolQueryVariations(target, schoolsData);
  if (variations.length === 0) return [];

  // Firestore in 연산자는 최대 30개 (buildSchoolQueryVariations 에서 이미 잘라둠)
  const parts = [where(field, 'in', variations)];
  if (max) parts.push(fsLimit(max));
  const snap = await getDocs(query(baseQuery, ...parts));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // in 쿼리는 '문자열이 정확히 같은 것'만 가져오므로, 여기서 다시 거르는 것은
  // 오탐 제거용입니다. (예: 후보에 넣은 '영일'이 다른 학교와 겹치는 경우)
  return docs.filter(d => isSameSchool(d[field], target));
};

/**
 * 이미 메모리에 있는 목록에서 학교로 거릅니다.
 * (학사일정처럼 전체를 구독해 두는 작은 컬렉션에 씁니다.)
 */
export const filterBySchool = (list, schoolName, field = 'schoolName') => {
  const target = String(schoolName || '').trim();
  if (!target || !Array.isArray(list)) return [];
  return list.filter(item => isSameSchool(item?.[field], target));
};
