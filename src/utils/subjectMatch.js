/* 시험 과목을 학원의 대과목으로 옮깁니다.

   [왜 필요한가]
   반과 시험은 과목을 다른 단위로 다룹니다.

     반(classes.subject)            학원이 정한 **대과목 5개 중 하나**
                                    수학 · 과학 · 국어 · 영어 · 사회
     시험(integrated_exams.subject) 학교 교육과정 이름. 학원이 정하지 않습니다.
                                    '대수', '미적분 I', '공통수학1', '수학 2-1' …

   시험 과목이 세분화되는 것은 학교가 그렇게 나누기 때문이라 없앨 수 없습니다.
   그래서 **한 방향으로만** 옮깁니다 — 시험 과목 → 대과목.
   반 과목은 이미 대과목이므로 옮길 것이 없습니다.

   [거르지 않는 경우]
   시험 과목이나 반 과목을 대과목으로 판정할 수 없으면 거르지 않습니다.
   필요한 반이 조용히 사라지는 것이 잘못 섞여 보이는 것보다 나쁩니다.
*/

/** 학원의 대과목. 반 과목 드롭다운에 뜨는 값과 같습니다. */
export const MAIN_SUBJECTS = ['수학', '과학', '국어', '영어', '사회'];

/* 교육과정 이름에서 대과목을 알아내는 단서.
   위에서부터 먼저 걸리는 것을 씁니다. */
const HINTS = [
  { subject: '수학', test: /수학|대수|미적분|확률과\s*통계|확통|기하|기벡/ },
  { subject: '과학', test: /과학|물리|화학|생명|지구/ },
  { subject: '국어', test: /국어|문학|독서|화법|작문|언어와\s*매체|화작|언매/ },
  { subject: '영어', test: /영어|독해|회화|어휘/i },
  { subject: '사회', test: /사회|한국사|윤리|지리|세계사|동아시아|정치|경제|사문/ }
];

/**
 * 과목 이름을 대과목 5개 중 하나로 옮깁니다.
 * 이미 대과목이면 그대로, 알아낼 수 없으면 null.
 */
export const toMainSubject = (name) => {
  const s = String(name || '').trim();
  if (!s) return null;
  if (MAIN_SUBJECTS.includes(s)) return s;
  const hit = HINTS.find(h => h.test.test(s));
  return hit ? hit.subject : null;
};

/**
 * 이 반이 이 시험의 채점 대상이 될 수 있는가.
 * 판정할 근거가 부족하면 true 를 돌려줍니다(거르지 않음).
 */
export const isSubjectCompatible = (examSubject, classSubject) => {
  const exam = toMainSubject(examSubject);
  if (!exam) return true;

  /* 반 과목은 대과목 그대로 저장됩니다.
     예전에 만들어진 반이 세부 과목명을 갖고 있을 수 있어 한 번 더 옮겨 봅니다. */
  const cls = toMainSubject(classSubject);
  if (!cls) return true;

  return exam === cls;
};
