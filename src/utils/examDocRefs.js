/* 기출·내신 자료의 문서 번호가 바뀔 때 참조를 함께 옮기는 로직

   [배경]
   integrated_exams 의 문서 번호는 '연도_학교명_학년_학기_고사_과목' 으로 만들어집니다.
   그래서 리포트의 학교명·연도·학년·과목을 수정하면 번호가 새로 만들어지고,
   기존 코드는 새 번호로 저장한 뒤 옛 문서를 지웠습니다.

   그런데 학생 성적 진단(student_exam_diagnostics)의 examDocId 는 옛 번호를 그대로
   가리킨 채 남았습니다. 갱신하는 코드가 어디에도 없었습니다.
   결과적으로 리포트를 수정할 때마다 그 시험을 본 학생들의 시험 마스터 연결이 끊겨
   등급컷과 예측등급이 조용히 사라졌습니다. 오류 메시지는 나오지 않습니다.

   이 파일은 그 연결을 함께 옮겨 줍니다.
*/

import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { APP_ID } from '../constants';

const DIAG_PATH = `artifacts/${APP_ID}/public/data/student_exam_diagnostics`;

// Firestore 일괄 쓰기 상한은 500건입니다. 여유를 둡니다.
const CHUNK = 400;

/**
 * 시험 문서 번호를 참조하는 학생 진단 기록을 새 번호로 옮깁니다.
 *
 * @returns { moved: number, failed: number }
 */
export const reassignExamReferences = async (oldId, newId) => {
  if (!oldId || !newId || oldId === newId) return { moved: 0, failed: 0 };

  const snap = await getDocs(
    query(collection(db, DIAG_PATH), where('examDocId', '==', oldId))
  );
  if (snap.empty) return { moved: 0, failed: 0 };

  const docs = snap.docs;
  let moved = 0;
  let failed = 0;

  for (let i = 0; i < docs.length; i += CHUNK) {
    const slice = docs.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    slice.forEach(d => batch.update(doc(db, DIAG_PATH, d.id), { examDocId: newId }));
    try {
      await batch.commit();
      moved += slice.length;
    } catch (e) {
      // 진단 기록의 점수/구분 값이 규칙 조건을 벗어나면 이 묶음만 실패할 수 있습니다.
      console.error('[examDocRefs] 참조 이동 실패:', e);
      failed += slice.length;
    }
  }

  return { moved, failed };
};

/** 특정 시험 문서를 참조하는 진단 기록 수를 셉니다. (미리보기용) */
export const countExamReferences = async (examDocId) => {
  if (!examDocId) return 0;
  const snap = await getDocs(
    query(collection(db, DIAG_PATH), where('examDocId', '==', examDocId))
  );
  return snap.size;
};
