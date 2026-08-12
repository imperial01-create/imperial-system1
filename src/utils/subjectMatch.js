/* 시험 과목과 반 과목이 같은 과목인지 판정합니다.

   [왜 필요한가]
   두 이름이 서로 다른 체계에서 옵니다.
     시험(integrated_exams.subject) : 교육과정 이름   예) '대수', '공통수학1', '수학 2-1'
     반(classes.subject)            : 학원이 정한 이름 예) '대수(수학 I)', '공통수학(1·2)'
   그래서 문자열 비교로는 맞지 않습니다.
   기존 getStandardSubjectCode 도 괄호가 붙으면 CUSTOM_ 으로 떨어져 쓸 수 없습니다.

   [판정 방식]
   교과 계열(수학/국어/영어/과학/사회)만 봅니다.
   대수·미적분·확통 같은 세부 과정까지 맞추지는 않습니다 — 한 반이 여러 과정을
   함께 다루는 경우가 많아, 세부까지 따지면 필요한 반이 사라집니다.

   어느 한쪽이라도 계열을 알 수 없으면 **거르지 않습니다.**
   필요한 반이 조용히 사라지는 것이 잘못 섞여 보이는 것보다 나쁩니다.
*/

const FAMILIES = [
  { id: 'math', test: /수학|대수|미적분|확률과\s*통계|확통|기하|기벡/ },
  { id: 'korean', test: /국어|문학|독서|화법|작문|언어와\s*매체|화작|언매/ },
  { id: 'english', test: /영어|독해|회화|어휘|voca/i },
  { id: 'science', test: /과학|물리|화학|생명|지구/ },
  { id: 'social', test: /사회|한국사|윤리|지리|세계사|동아시아|정치|경제|사문/ }
];

const FAMILY_LABEL = {
  math: '수학', korean: '국어', english: '영어', science: '과학', social: '사회'
};

const clean = (s) => String(s || '').trim();

/** 교과 계열. 알 수 없으면 null. */
export const subjectFamilyOf = (name) => {
  const s = clean(name);
  if (!s) return null;
  const hit = FAMILIES.find(f => f.test.test(s));
  return hit ? hit.id : null;
};

/** 사람에게 보여줄 계열 이름. 알 수 없으면 null. */
export const subjectFamilyLabel = (name) => FAMILY_LABEL[subjectFamilyOf(name)] || null;

/**
 * 이 반이 이 시험의 채점 대상이 될 수 있는가.
 * 판정할 근거가 부족하면 true 를 돌려줍니다(거르지 않음).
 */
export const isSubjectCompatible = (examSubject, classSubject) => {
  const examFam = subjectFamilyOf(examSubject);
  const classFam = subjectFamilyOf(classSubject);

  // 한쪽이라도 계열을 모르면 거르지 않습니다.
  if (!examFam || !classFam) return true;
  return examFam === classFam;
};
