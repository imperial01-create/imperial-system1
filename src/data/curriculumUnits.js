/* [src/data/curriculumUnits.js]
   수학 단원 마스터. 194단원 (중등 90 / 고등 104).

   [왜 코드 파일로 두는가]
   교육과정 단원 목록은 몇 년에 한 번 바뀌는 참조 자료다.
   Firestore 에 두면 화면마다 읽기 비용이 붙고, 네트워크가 느릴 때 드롭다운이 빈다.
   변하지 않는 뼈대는 여기 두고, 나중에 강사가 채우는 값(nodeIds 등)만
   Firestore 오버레이로 얹는다.

   [출처] docs/academy-universe/CURRICULUM_UNITS.md — 교육과정 대조 검증을 거친 확정본.
   이 파일을 손으로 고치지 말 것. 문서를 고치고 다시 생성한다.

   ⚠️ course 문자열은 subjectMapper 의 과목명과 글자까지 같아야 한다.
      한 글자만 달라도 반·시험과 연결이 조용히 끊긴다.
*/

export const CURRICULUM_UNITS = [
  {
    "unitId": "MATH_MID_1_1-2022-010",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 10,
    "category": "소인수분해",
    "unitName": "소인수분해",
    "order": 10,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "9수01-01",
    "aliases": [
      "소수와 합성수",
      "거듭제곱",
      "소인수분해와 최대공약수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2022-020",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 10,
    "category": "소인수분해",
    "unitName": "최대공약수와 최소공배수",
    "order": 20,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "9수01-02",
    "aliases": [
      "최대공약수",
      "최소공배수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2022-030",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 20,
    "category": "정수와 유리수",
    "unitName": "정수와 유리수",
    "order": 30,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "9수01-03~04",
    "aliases": [
      "정수와 유리수의 뜻",
      "절댓값과 대소 관계"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2022-040",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 20,
    "category": "정수와 유리수",
    "unitName": "정수와 유리수의 계산",
    "order": 40,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "9수01-05",
    "aliases": [
      "유리수의 사칙계산",
      "정수와 유리수의 사칙계산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2022-050",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 30,
    "category": "문자와 식",
    "unitName": "문자의 사용과 식의 계산",
    "order": 50,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-01~02",
    "aliases": [
      "문자와 식",
      "문자의 사용",
      "일차식의 계산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2022-060",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 30,
    "category": "문자와 식",
    "unitName": "일차방정식",
    "order": 60,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-03~04",
    "aliases": [
      "일차방정식의 풀이",
      "일차방정식의 활용",
      "방정식과 등식의 성질"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2022-070",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 40,
    "category": "좌표평면과 그래프",
    "unitName": "좌표평면과 그래프",
    "order": 70,
    "areaName": "변화와 관계",
    "ontologyArea": "ANA",
    "standards": "9수02-05~06",
    "aliases": [
      "순서쌍과 좌표",
      "그래프의 해석"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2022-080",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 40,
    "category": "좌표평면과 그래프",
    "unitName": "정비례와 반비례",
    "order": 80,
    "areaName": "변화와 관계",
    "ontologyArea": "ANA",
    "standards": "9수02-07",
    "aliases": [
      "정비례",
      "반비례"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-010",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 10,
    "category": "기본 도형",
    "unitName": "기본 도형과 위치 관계",
    "order": 10,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-01",
    "aliases": [
      "기본 도형",
      "점 선 면",
      "위치 관계"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-020",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 10,
    "category": "기본 도형",
    "unitName": "평행선의 성질",
    "order": 20,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-02",
    "aliases": [
      "동위각과 엇각",
      "평행선"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-030",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 10,
    "category": "기본 도형",
    "unitName": "작도와 합동",
    "order": 30,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-03~04",
    "aliases": [
      "삼각형의 작도",
      "삼각형의 합동"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-040",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 20,
    "category": "평면도형",
    "unitName": "다각형",
    "order": 40,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-05",
    "aliases": [
      "다각형의 성질",
      "다각형의 내각과 외각"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-050",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 20,
    "category": "평면도형",
    "unitName": "원과 부채꼴",
    "order": 50,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-06",
    "aliases": [
      "부채꼴",
      "원과 부채꼴의 넓이"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-060",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 30,
    "category": "입체도형",
    "unitName": "다면체와 회전체",
    "order": 60,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-07",
    "aliases": [
      "다면체",
      "회전체"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-070",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 30,
    "category": "입체도형",
    "unitName": "입체도형의 겉넓이와 부피",
    "order": 70,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-08",
    "aliases": [
      "겉넓이와 부피"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2022-080",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 40,
    "category": "통계",
    "unitName": "자료의 정리와 해석",
    "order": 80,
    "areaName": "자료와 가능성",
    "ontologyArea": "PRB",
    "standards": "9수04-02~04",
    "aliases": [
      "도수분포표와 히스토그램",
      "줄기와 잎 그림",
      "상대도수",
      "자료의 정리"
    ],
    "note": "9수04-04(통계적 탐구 문제 설정·수집·분석)는 교과서에서 단원 말미 활동이 될 가능성이 높아 별도 행을 만들지 않고 여기에 붙였다."
  },
  {
    "unitId": "MATH_MID_1_2-2022-090",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 40,
    "category": "통계",
    "unitName": "대푯값",
    "order": 90,
    "areaName": "자료와 가능성",
    "ontologyArea": "PRB",
    "standards": "9수04-01",
    "aliases": [
      "자료의 분석",
      "중앙값과 최빈값",
      "평균 중앙값 최빈값"
    ],
    "note": "★2015 대비 최대 변화. 대푯값(중앙값·최빈값)이 중3에서 중1로 내려왔다. 2015로 배운 학생에게 이 행을 붙이면 배우지 않은 내용이 '아직'으로 찍힌다 — 중등 2015 마스터를 별도로 둔 이유."
  },
  {
    "unitId": "MATH_MID_2_1-2022-010",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 10,
    "category": "유리수와 순환소수",
    "unitName": "유리수와 순환소수",
    "order": 10,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "9수01-06",
    "aliases": [
      "순환소수",
      "유한소수와 무한소수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2022-020",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 20,
    "category": "식의 계산",
    "unitName": "단항식의 계산",
    "order": 20,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-08",
    "aliases": [
      "지수법칙",
      "단항식의 곱셈과 나눗셈"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2022-030",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 20,
    "category": "식의 계산",
    "unitName": "다항식의 계산",
    "order": 30,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-09~10",
    "aliases": [
      "다항식의 덧셈과 뺄셈",
      "식의 계산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2022-040",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 30,
    "category": "일차부등식과 연립일차방정식",
    "unitName": "일차부등식",
    "order": 40,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-11~12",
    "aliases": [
      "부등식의 성질",
      "일차부등식의 활용"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2022-050",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 30,
    "category": "일차부등식과 연립일차방정식",
    "unitName": "연립일차방정식",
    "order": 50,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-13",
    "aliases": [
      "연립방정식",
      "연립방정식의 활용",
      "가감법과 대입법"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2022-060",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 40,
    "category": "일차함수",
    "unitName": "일차함수와 그 그래프",
    "order": 60,
    "areaName": "변화와 관계",
    "ontologyArea": "ANA",
    "standards": "9수02-14~16",
    "aliases": [
      "일차함수와 그래프",
      "함수의 뜻",
      "일차함수와 그래프(1)",
      "일차함수와 그래프(2)"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2022-070",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 40,
    "category": "일차함수",
    "unitName": "일차함수와 일차방정식의 관계",
    "order": 70,
    "areaName": "변화와 관계",
    "ontologyArea": "ANA",
    "standards": "9수02-17~18",
    "aliases": [
      "직선의 방정식",
      "일차함수와 방정식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2022-010",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 10,
    "category": "삼각형과 사각형의 성질",
    "unitName": "삼각형의 성질",
    "order": 10,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-09~10",
    "aliases": [
      "이등변삼각형",
      "삼각형의 외심과 내심"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2022-020",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 10,
    "category": "삼각형과 사각형의 성질",
    "unitName": "사각형의 성질",
    "order": 20,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-11",
    "aliases": [
      "평행사변형",
      "여러 가지 사각형"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2022-030",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 20,
    "category": "도형의 닮음",
    "unitName": "도형의 닮음",
    "order": 30,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-12~13",
    "aliases": [
      "닮음의 뜻",
      "삼각형의 닮음 조건"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2022-040",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 20,
    "category": "도형의 닮음",
    "unitName": "평행선과 선분의 길이의 비",
    "order": 40,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-14",
    "aliases": [
      "닮음의 활용",
      "닮음의 응용",
      "중점연결정리",
      "삼각형의 무게중심"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2022-050",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 30,
    "category": "피타고라스 정리",
    "unitName": "피타고라스 정리",
    "order": 50,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-15",
    "aliases": [
      "피타고라스 정리의 활용"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2022-060",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 40,
    "category": "확률",
    "unitName": "경우의 수",
    "order": 60,
    "areaName": "자료와 가능성",
    "ontologyArea": "PRB",
    "standards": "9수04-05",
    "aliases": [
      "경우의 수와 확률",
      "합의 법칙과 곱의 법칙"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2022-070",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 40,
    "category": "확률",
    "unitName": "확률",
    "order": 70,
    "areaName": "자료와 가능성",
    "ontologyArea": "PRB",
    "standards": "9수04-06",
    "aliases": [
      "확률의 뜻과 성질",
      "여사건의 확률"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-010",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 10,
    "category": "실수와 그 계산",
    "unitName": "제곱근과 실수",
    "order": 10,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "9수01-07~09",
    "aliases": [
      "제곱근과 무리수",
      "실수와 그 계산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-020",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 10,
    "category": "실수와 그 계산",
    "unitName": "근호를 포함한 식의 계산",
    "order": 20,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "9수01-10",
    "aliases": [
      "제곱근의 계산",
      "분모의 유리화"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-030",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 20,
    "category": "다항식의 곱셈과 인수분해",
    "unitName": "다항식의 곱셈",
    "order": 30,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-19(전반)",
    "aliases": [
      "곱셈공식",
      "다항식의 전개"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-040",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 20,
    "category": "다항식의 곱셈과 인수분해",
    "unitName": "인수분해",
    "order": 40,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-19(후반)",
    "aliases": [
      "다항식의 곱셈과 인수분해",
      "인수분해 공식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-050",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 30,
    "category": "이차방정식",
    "unitName": "이차방정식의 풀이",
    "order": 50,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-20(전반)",
    "aliases": [
      "이차방정식",
      "근의 공식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-060",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 30,
    "category": "이차방정식",
    "unitName": "이차방정식의 활용",
    "order": 60,
    "areaName": "변화와 관계",
    "ontologyArea": "ALG",
    "standards": "9수02-20(후반)",
    "aliases": [
      "이차방정식의 근과 활용"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-070",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 40,
    "category": "이차함수",
    "unitName": "이차함수와 그 그래프",
    "order": 70,
    "areaName": "변화와 관계",
    "ontologyArea": "ANA",
    "standards": "9수02-21~22",
    "aliases": [
      "이차함수",
      "이차함수의 그래프"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2022-080",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 40,
    "category": "이차함수",
    "unitName": "이차함수의 최대와 최소",
    "order": 80,
    "areaName": "변화와 관계",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "이차함수의 활용",
      "최대와 최소"
    ],
    "note": "★2022 신설(고1→중3 하향). x의 범위가 실수 전체인 경우만. 제한된 구간의 최대·최소는 여전히 고1(공통수학1). 성취기준 귀속은 §4-A3 확인 필요 — 그래서 std를 비웠다."
  },
  {
    "unitId": "MATH_MID_3_2-2022-010",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 10,
    "category": "삼각비",
    "unitName": "삼각비",
    "order": 10,
    "areaName": "도형과 측정",
    "ontologyArea": "ANA",
    "standards": "9수03-16",
    "aliases": [
      "삼각비의 뜻",
      "특수각의 삼각비"
    ],
    "note": "2022 고시 명시: 삼각비 사이의 관계는 다루지 않는다. ontologyArea가 ANA인 것은 온톨로지가 삼각비를 해석학>초월함수에 두었기 때문이며 화면에는 노출하지 않는다."
  },
  {
    "unitId": "MATH_MID_3_2-2022-020",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 10,
    "category": "삼각비",
    "unitName": "삼각비의 활용",
    "order": 20,
    "areaName": "도형과 측정",
    "ontologyArea": "ANA",
    "standards": "9수03-17",
    "aliases": [
      "삼각비의 응용",
      "삼각형의 넓이"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_2-2022-030",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 20,
    "category": "원의 성질",
    "unitName": "원과 직선",
    "order": 30,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-18",
    "aliases": [
      "현의 성질",
      "접선의 성질",
      "원의 성질"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_2-2022-040",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 20,
    "category": "원의 성질",
    "unitName": "원주각",
    "order": 40,
    "areaName": "도형과 측정",
    "ontologyArea": "GEO",
    "standards": "9수03-19",
    "aliases": [
      "원주각의 성질",
      "원에 내접하는 사각형"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_2-2022-050",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "산포도",
    "order": 50,
    "areaName": "자료와 가능성",
    "ontologyArea": "PRB",
    "standards": "9수04-07",
    "aliases": [
      "분산과 표준편차",
      "편차"
    ],
    "note": "★2015에서는 '대푯값과 산포도' 한 단원이었다. 2022에서 대푯값이 중1로 내려가 이 행은 산포도만 남는다."
  },
  {
    "unitId": "MATH_MID_3_2-2022-060",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "상자 그림",
    "order": 60,
    "areaName": "자료와 가능성",
    "ontologyArea": "PRB",
    "standards": "9수04-08",
    "aliases": [
      "상자그림",
      "사분위수"
    ],
    "note": "★2022 신설. [9수04-08] 공학 도구를 이용하여 자료를 상자 그림으로 나타내고 분포를 비교한다. 교육과정 용어는 사분위수·상자 그림 둘뿐이다. '사분위수 범위'·'다섯 수치 요약'은 교육과정 용어가 아니며 교재가 나오면 별칭·확장으로 다시 판단한다."
  },
  {
    "unitId": "MATH_MID_3_2-2022-070",
    "curriculum": "2022",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "상관관계",
    "order": 70,
    "areaName": "자료와 가능성",
    "ontologyArea": "PRB",
    "standards": "9수04-09",
    "aliases": [
      "산점도와 상관관계",
      "산점도"
    ],
    "note": "[9수04-09] 자료를 산점도로 나타내고 상관관계를 말한다. 용어: 산점도, 상관관계(양·음·상관관계 없음). 공학 도구 조건은 이 성취기준에 없다."
  },
  {
    "unitId": "MATH_MID_1_1-2015-010",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 10,
    "category": "소인수분해",
    "unitName": "소인수분해",
    "order": 10,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "",
    "aliases": [
      "소수와 합성수",
      "거듭제곱"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2015-020",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 10,
    "category": "소인수분해",
    "unitName": "최대공약수와 최소공배수",
    "order": 20,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "",
    "aliases": [
      "최대공약수",
      "최소공배수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2015-030",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 20,
    "category": "정수와 유리수",
    "unitName": "정수와 유리수",
    "order": 30,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "",
    "aliases": [
      "절댓값과 대소 관계"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2015-040",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 20,
    "category": "정수와 유리수",
    "unitName": "정수와 유리수의 계산",
    "order": 40,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "",
    "aliases": [
      "유리수의 사칙계산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2015-050",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 30,
    "category": "문자와 식",
    "unitName": "문자의 사용과 식의 계산",
    "order": 50,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "문자와 식",
      "일차식의 계산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2015-060",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 30,
    "category": "문자와 식",
    "unitName": "일차방정식",
    "order": 60,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "일차방정식의 풀이",
      "일차방정식의 활용"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2015-070",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 40,
    "category": "좌표평면과 그래프",
    "unitName": "좌표평면과 그래프",
    "order": 70,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "순서쌍과 좌표",
      "그래프의 해석"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_1-2015-080",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_1",
    "course": "수학 1-1",
    "categoryOrder": 40,
    "category": "좌표평면과 그래프",
    "unitName": "정비례와 반비례",
    "order": 80,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "정비례",
      "반비례"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-010",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 10,
    "category": "기본 도형",
    "unitName": "기본 도형과 위치 관계",
    "order": 10,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "기본 도형",
      "위치 관계"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-020",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 10,
    "category": "기본 도형",
    "unitName": "평행선의 성질",
    "order": 20,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "동위각과 엇각"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-030",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 10,
    "category": "기본 도형",
    "unitName": "작도와 합동",
    "order": 30,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "삼각형의 작도",
      "삼각형의 합동"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-040",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 20,
    "category": "평면도형",
    "unitName": "다각형",
    "order": 40,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "다각형의 성질"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-050",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 20,
    "category": "평면도형",
    "unitName": "원과 부채꼴",
    "order": 50,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "부채꼴"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-060",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 30,
    "category": "입체도형",
    "unitName": "다면체와 회전체",
    "order": 60,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "다면체",
      "회전체"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-070",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 30,
    "category": "입체도형",
    "unitName": "입체도형의 겉넓이와 부피",
    "order": 70,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "겉넓이와 부피"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_1_2-2015-080",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_1_2",
    "course": "수학 1-2",
    "categoryOrder": 40,
    "category": "통계",
    "unitName": "자료의 정리와 해석",
    "order": 80,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "도수분포표와 히스토그램",
      "줄기와 잎 그림",
      "상대도수"
    ],
    "note": "★2022와 차이 — 2015 중1에는 대푯값이 없다(중3-2 소관). 2015로 배운 학생에게 2022의 '대푯값' 행을 붙이면 안 된다."
  },
  {
    "unitId": "MATH_MID_2_1-2015-010",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 10,
    "category": "유리수와 순환소수",
    "unitName": "유리수와 순환소수",
    "order": 10,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "",
    "aliases": [
      "순환소수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2015-020",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 20,
    "category": "식의 계산",
    "unitName": "단항식의 계산",
    "order": 20,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "지수법칙"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2015-030",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 20,
    "category": "식의 계산",
    "unitName": "다항식의 계산",
    "order": 30,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "식의 계산",
      "다항식의 덧셈과 뺄셈"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2015-040",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 30,
    "category": "일차부등식과 연립일차방정식",
    "unitName": "일차부등식",
    "order": 40,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "부등식의 성질"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2015-050",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 30,
    "category": "일차부등식과 연립일차방정식",
    "unitName": "연립일차방정식",
    "order": 50,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "연립방정식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2015-060",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 40,
    "category": "일차함수",
    "unitName": "일차함수와 그 그래프",
    "order": 60,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "일차함수와 그래프"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_1-2015-070",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_1",
    "course": "수학 2-1",
    "categoryOrder": 40,
    "category": "일차함수",
    "unitName": "일차함수와 일차방정식의 관계",
    "order": 70,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "직선의 방정식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2015-010",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 10,
    "category": "삼각형과 사각형의 성질",
    "unitName": "삼각형의 성질",
    "order": 10,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "이등변삼각형",
      "외심과 내심"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2015-020",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 10,
    "category": "삼각형과 사각형의 성질",
    "unitName": "사각형의 성질",
    "order": 20,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "평행사변형",
      "여러 가지 사각형"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2015-030",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 20,
    "category": "도형의 닮음",
    "unitName": "도형의 닮음",
    "order": 30,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "닮음의 뜻",
      "삼각형의 닮음 조건"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2015-040",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 20,
    "category": "도형의 닮음",
    "unitName": "평행선과 선분의 길이의 비",
    "order": 40,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "닮음의 활용",
      "닮음의 응용",
      "무게중심"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2015-050",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 30,
    "category": "피타고라스 정리",
    "unitName": "피타고라스 정리",
    "order": 50,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "피타고라스 정리의 활용"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2015-060",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 40,
    "category": "확률",
    "unitName": "경우의 수",
    "order": 60,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "경우의 수와 확률"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_2_2-2015-070",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_2_2",
    "course": "수학 2-2",
    "categoryOrder": 40,
    "category": "확률",
    "unitName": "확률",
    "order": 70,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "확률의 뜻과 성질"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-010",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 10,
    "category": "실수와 그 계산",
    "unitName": "제곱근과 실수",
    "order": 10,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "",
    "aliases": [
      "제곱근과 무리수",
      "실수와 그 계산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-020",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 10,
    "category": "실수와 그 계산",
    "unitName": "근호를 포함한 식의 계산",
    "order": 20,
    "areaName": "수와 연산",
    "ontologyArea": "NUM",
    "standards": "",
    "aliases": [
      "제곱근의 계산",
      "분모의 유리화"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-030",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 20,
    "category": "다항식의 곱셈과 인수분해",
    "unitName": "다항식의 곱셈",
    "order": 30,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "곱셈공식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-040",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 20,
    "category": "다항식의 곱셈과 인수분해",
    "unitName": "인수분해",
    "order": 40,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "다항식의 곱셈과 인수분해",
      "인수분해와 이차방정식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-050",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 30,
    "category": "이차방정식",
    "unitName": "이차방정식의 풀이",
    "order": 50,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "이차방정식",
      "근의 공식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-060",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 30,
    "category": "이차방정식",
    "unitName": "이차방정식의 활용",
    "order": 60,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-070",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 40,
    "category": "이차함수",
    "unitName": "이차함수와 그 그래프",
    "order": 70,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "이차함수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_1-2015-080",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_1",
    "course": "수학 3-1",
    "categoryOrder": 40,
    "category": "이차함수",
    "unitName": "이차함수 y=ax^2+bx+c의 그래프",
    "order": 80,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "이차함수의 활용",
      "이차함수의 그래프"
    ],
    "note": "★2022와 차이 — 2015 중3에는 이차함수의 최대·최소가 없다(고1 수학(상) 소관). 2015 중3에게 최대·최소를 출제하면 교육과정 밖이다."
  },
  {
    "unitId": "MATH_MID_3_2-2015-010",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 10,
    "category": "삼각비",
    "unitName": "삼각비",
    "order": 10,
    "areaName": "기하",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "삼각비의 뜻",
      "특수각의 삼각비"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_2-2015-020",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 10,
    "category": "삼각비",
    "unitName": "삼각비의 활용",
    "order": 20,
    "areaName": "기하",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "삼각비의 응용"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_2-2015-030",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 20,
    "category": "원의 성질",
    "unitName": "원과 직선",
    "order": 30,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "현의 성질",
      "접선의 성질"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_2-2015-040",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 20,
    "category": "원의 성질",
    "unitName": "원주각",
    "order": 40,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "원주각의 성질",
      "원에 내접하는 사각형"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_MID_3_2-2015-050",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "대푯값과 산포도",
    "order": 50,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "대푯값",
      "산포도",
      "분산과 표준편차",
      "통계"
    ],
    "note": "★2022와 차이 — 2015에서는 대푯값(평균·중앙값·최빈값)이 여기 있다. 온톨로지의 PRB-02-01(대푯값)은 grade=중1로 태깅돼 있어 2022 기준이다. 2015 중3 판정에 온톨로지 grade를 그대로 쓰면 어긋난다."
  },
  {
    "unitId": "MATH_MID_3_2-2015-060",
    "curriculum": "2015",
    "schoolLevel": "중학교",
    "courseCode": "MATH_MID_3_2",
    "course": "수학 3-2",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "상관관계",
    "order": 60,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "산점도와 상관관계"
    ],
    "note": "2015에는 사분위수·상자 그림이 없다."
  },
  {
    "unitId": "MATH_H1_S1-2022-010",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 10,
    "category": "다항식",
    "unitName": "다항식의 연산",
    "order": 10,
    "areaName": "다항식",
    "ontologyArea": "ALG",
    "standards": "10공수1-01-01",
    "aliases": [
      "다항식의 사칙연산",
      "곱셈공식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2022-020",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 10,
    "category": "다항식",
    "unitName": "나머지정리와 인수분해",
    "order": 20,
    "areaName": "다항식",
    "ontologyArea": "ALG",
    "standards": "10공수1-01-02~03",
    "aliases": [
      "나머지정리",
      "항등식과 나머지정리",
      "인수분해",
      "조립제법"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2022-030",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "복소수",
    "order": 30,
    "areaName": "방정식과 부등식",
    "ontologyArea": "NUM",
    "standards": "10공수1-02-01",
    "aliases": [
      "복소수와 이차방정식",
      "허수단위",
      "켤레복소수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2022-040",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "이차방정식",
    "order": 40,
    "areaName": "방정식과 부등식",
    "ontologyArea": "ALG",
    "standards": "10공수1-02-02~03",
    "aliases": [
      "판별식",
      "근과 계수의 관계"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2022-050",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "이차방정식과 이차함수",
    "order": 50,
    "areaName": "방정식과 부등식",
    "ontologyArea": "ALG",
    "standards": "10공수1-02-04~06",
    "aliases": [
      "이차함수와 그래프",
      "이차함수의 최대와 최소",
      "이차함수 최대최소"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2022-060",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "여러 가지 방정식",
    "order": 60,
    "areaName": "방정식과 부등식",
    "ontologyArea": "ALG",
    "standards": "10공수1-02-07~08",
    "aliases": [
      "삼차방정식과 사차방정식",
      "연립이차방정식"
    ],
    "note": "삼원연립일차방정식은 2022에서 삭제."
  },
  {
    "unitId": "MATH_H1_S1-2022-070",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "여러 가지 부등식",
    "order": 70,
    "areaName": "방정식과 부등식",
    "ontologyArea": "ALG",
    "standards": "10공수1-02-09~11",
    "aliases": [
      "연립일차부등식",
      "이차부등식",
      "절댓값을 포함한 부등식",
      "연립이차부등식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2022-080",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 30,
    "category": "경우의 수",
    "unitName": "순열과 조합",
    "order": 80,
    "areaName": "경우의 수",
    "ontologyArea": "PRB",
    "standards": "10공수1-03-01~03",
    "aliases": [
      "경우의 수와 순열",
      "조합",
      "합의 법칙과 곱의 법칙"
    ],
    "note": "⚠ 확률과 통계의 '여러 가지 순열과 조합'과 다른 단원이다. courseCode로 구분."
  },
  {
    "unitId": "MATH_H1_S1-2022-090",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "공통수학1",
    "categoryOrder": 40,
    "category": "행렬",
    "unitName": "행렬과 그 연산",
    "order": 90,
    "areaName": "행렬",
    "ontologyArea": "ALG",
    "standards": "10공수1-04-01~02",
    "aliases": [
      "행렬",
      "행렬의 연산"
    ],
    "note": "★2022 신설. 2015 수학(상)에 없다. 역행렬은 제외."
  },
  {
    "unitId": "MATH_H1_S2-2022-010",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 10,
    "category": "도형의 방정식",
    "unitName": "평면좌표",
    "order": 10,
    "areaName": "도형의 방정식",
    "ontologyArea": "GEO",
    "standards": "10공수2-01-01",
    "aliases": [
      "두 점 사이의 거리",
      "선분의 내분점"
    ],
    "note": "선분의 외분은 2022에서 삭제."
  },
  {
    "unitId": "MATH_H1_S2-2022-020",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 10,
    "category": "도형의 방정식",
    "unitName": "직선의 방정식",
    "order": 20,
    "areaName": "도형의 방정식",
    "ontologyArea": "GEO",
    "standards": "10공수2-01-02~03",
    "aliases": [
      "두 직선의 위치 관계",
      "점과 직선 사이의 거리"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2022-030",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 10,
    "category": "도형의 방정식",
    "unitName": "원의 방정식",
    "order": 30,
    "areaName": "도형의 방정식",
    "ontologyArea": "GEO",
    "standards": "10공수2-01-04~05",
    "aliases": [
      "원과 직선의 위치 관계",
      "원의 접선"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2022-040",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 10,
    "category": "도형의 방정식",
    "unitName": "도형의 이동",
    "order": 40,
    "areaName": "도형의 방정식",
    "ontologyArea": "GEO",
    "standards": "10공수2-01-06~07",
    "aliases": [
      "평행이동",
      "대칭이동"
    ],
    "note": "부등식의 영역은 2015 개정에서 이미 삭제되어 경제 수학으로 이동했고, 2015 수학(상)·2022 공통수학2 어느 쪽에도 없다. 2015에서는 도형의 방정식 전체가 '수학(상)'에 있었으나 2022에서 공통수학2로 이동했다."
  },
  {
    "unitId": "MATH_H1_S2-2022-050",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 20,
    "category": "집합과 명제",
    "unitName": "집합",
    "order": 50,
    "areaName": "집합과 명제",
    "ontologyArea": "ALG",
    "standards": "10공수2-02-01~03",
    "aliases": [
      "집합의 뜻과 포함 관계",
      "집합의 연산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2022-060",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 20,
    "category": "집합과 명제",
    "unitName": "명제",
    "order": 60,
    "areaName": "집합과 명제",
    "ontologyArea": "ALG",
    "standards": "10공수2-02-04~08",
    "aliases": [
      "명제와 조건",
      "필요조건과 충분조건",
      "절대부등식"
    ],
    "note": "'산술·기하 평균'은 2022에서 용어로 명시되지 않는다(절대부등식 안에서 다룸)."
  },
  {
    "unitId": "MATH_H1_S2-2022-070",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 30,
    "category": "함수와 그래프",
    "unitName": "함수",
    "order": 70,
    "areaName": "함수와 그래프",
    "ontologyArea": "ANA",
    "standards": "10공수2-03-01~03",
    "aliases": [
      "함수와 그래프",
      "합성함수",
      "역함수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2022-080",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "공통수학2",
    "categoryOrder": 30,
    "category": "함수와 그래프",
    "unitName": "유리함수와 무리함수",
    "order": 80,
    "areaName": "함수와 그래프",
    "ontologyArea": "ANA",
    "standards": "10공수2-03-04~05",
    "aliases": [
      "유리함수",
      "무리함수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2022-010",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 10,
    "category": "지수함수와 로그함수",
    "unitName": "지수와 로그",
    "order": 10,
    "areaName": "지수함수와 로그함수",
    "ontologyArea": "ANA",
    "standards": "12대수01-01~05",
    "aliases": [
      "지수",
      "로그",
      "거듭제곱근",
      "상용로그"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2022-020",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 10,
    "category": "지수함수와 로그함수",
    "unitName": "지수함수와 로그함수",
    "order": 20,
    "areaName": "지수함수와 로그함수",
    "ontologyArea": "ANA",
    "standards": "12대수01-06~08",
    "aliases": [
      "지수함수",
      "로그함수",
      "지수방정식과 로그방정식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2022-030",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 20,
    "category": "삼각함수",
    "unitName": "삼각함수",
    "order": 30,
    "areaName": "삼각함수",
    "ontologyArea": "ANA",
    "standards": "12대수02-01 + 02-02(뜻)",
    "aliases": [
      "일반각과 호도법",
      "삼각함수의 뜻",
      "삼각함수(1)"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2022-040",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 20,
    "category": "삼각함수",
    "unitName": "삼각함수의 그래프",
    "order": 40,
    "areaName": "삼각함수",
    "ontologyArea": "ANA",
    "standards": "12대수02-02(그래프)",
    "aliases": [
      "삼각방정식과 삼각부등식",
      "삼각함수(2)"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2022-050",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 20,
    "category": "삼각함수",
    "unitName": "사인법칙과 코사인법칙",
    "order": 50,
    "areaName": "삼각함수",
    "ontologyArea": "ANA",
    "standards": "12대수02-03",
    "aliases": [
      "삼각함수의 활용",
      "삼각형에의 활용"
    ],
    "note": "교재 대부분은 '삼각함수의 활용'으로 표기한다 — alias 없으면 강사가 찾지 못한다."
  },
  {
    "unitId": "MATH_H2_ALG-2022-060",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 30,
    "category": "수열",
    "unitName": "등차수열과 등비수열",
    "order": 60,
    "areaName": "수열",
    "ontologyArea": "ANA",
    "standards": "12대수03-01~03",
    "aliases": [
      "등차수열",
      "등비수열",
      "수열의 뜻"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2022-070",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 30,
    "category": "수열",
    "unitName": "수열의 합",
    "order": 70,
    "areaName": "수열",
    "ontologyArea": "ANA",
    "standards": "12대수03-04~05",
    "aliases": [
      "시그마",
      "여러 가지 수열의 합",
      "계차수열"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2022-080",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "대수",
    "categoryOrder": 30,
    "category": "수열",
    "unitName": "수학적 귀납법",
    "order": 80,
    "areaName": "수열",
    "ontologyArea": "ANA",
    "standards": "12대수03-06~07",
    "aliases": [
      "수열의 귀납적 정의"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2022-010",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 10,
    "category": "함수의 극한과 연속",
    "unitName": "함수의 극한",
    "order": 10,
    "areaName": "함수의 극한과 연속",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-01-01~02",
    "aliases": [
      "극한",
      "좌극한과 우극한"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2022-020",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 10,
    "category": "함수의 극한과 연속",
    "unitName": "함수의 연속",
    "order": 20,
    "areaName": "함수의 극한과 연속",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-01-03~04",
    "aliases": [
      "연속함수",
      "사잇값 정리",
      "함수의 극한과 연속"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2022-030",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 20,
    "category": "미분",
    "unitName": "미분계수와 도함수",
    "order": 30,
    "areaName": "미분",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-02-01~04",
    "aliases": [
      "미분계수",
      "도함수",
      "평균변화율",
      "미분법"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2022-040",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 20,
    "category": "미분",
    "unitName": "접선의 방정식",
    "order": 40,
    "areaName": "미분",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-02-05~06",
    "aliases": [
      "평균값 정리",
      "롤의 정리",
      "접선"
    ],
    "note": "02-06이 평균값 정리다. 개념원리는 이 내용을 '도함수의 활용' 안에 넣으므로 출판사가 갈린다."
  },
  {
    "unitId": "MATH_H2_CALC1-2022-050",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 20,
    "category": "미분",
    "unitName": "도함수의 활용",
    "order": 50,
    "areaName": "미분",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-02-07~10",
    "aliases": [
      "함수의 증가와 감소",
      "극대와 극소",
      "그래프의 개형",
      "속도와 가속도"
    ],
    "note": "⚠ 미적분 II에 같은 이름의 단원이 있다. 굵은 행이라 첫 시즌 뒤 분할 검토 대상(§4-E3)."
  },
  {
    "unitId": "MATH_H2_CALC1-2022-060",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 30,
    "category": "적분",
    "unitName": "부정적분",
    "order": 60,
    "areaName": "적분",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-03-01~02",
    "aliases": [],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2022-070",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 30,
    "category": "적분",
    "unitName": "정적분",
    "order": 70,
    "areaName": "적분",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-03-03~04",
    "aliases": [
      "미적분의 기본정리",
      "정적분으로 정의된 함수"
    ],
    "note": "2022에서 정적분의 도입이 넓이 시각화 중심으로 재구성되었다."
  },
  {
    "unitId": "MATH_H2_CALC1-2022-080",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "미적분 I",
    "categoryOrder": 30,
    "category": "적분",
    "unitName": "정적분의 활용",
    "order": 80,
    "areaName": "적분",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅰ-03-05~06",
    "aliases": [
      "넓이",
      "속도와 거리"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2022-010",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분 II",
    "categoryOrder": 10,
    "category": "수열의 극한",
    "unitName": "수열의 극한",
    "order": 10,
    "areaName": "수열의 극한",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅱ-01-01~03",
    "aliases": [
      "등비수열의 극한",
      "수렴과 발산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2022-020",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분 II",
    "categoryOrder": 10,
    "category": "수열의 극한",
    "unitName": "급수",
    "order": 20,
    "areaName": "수열의 극한",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅱ-01-04~05",
    "aliases": [
      "등비급수",
      "급수의 수렴과 발산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2022-030",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분 II",
    "categoryOrder": 20,
    "category": "미분법",
    "unitName": "여러 가지 함수의 미분",
    "order": 30,
    "areaName": "미분법",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅱ-02-01~03",
    "aliases": [
      "지수함수와 로그함수의 미분",
      "삼각함수의 미분",
      "삼각함수의 덧셈정리"
    ],
    "note": "02-01 지수·로그의 극한과 미분 / 02-02 삼각함수의 덧셈정리 / 02-03 삼각함수의 극한과 미분. 교재 대부분이 2행으로 분리한다."
  },
  {
    "unitId": "MATH_H3_CALC2-2022-040",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분 II",
    "categoryOrder": 20,
    "category": "미분법",
    "unitName": "여러 가지 미분법",
    "order": 40,
    "areaName": "미분법",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅱ-02-04~07",
    "aliases": [
      "몫의 미분법",
      "합성함수의 미분법",
      "음함수와 역함수의 미분법",
      "매개변수 미분"
    ],
    "note": "sec·csc·cot는 2015·2022 모두 교육과정 내용 요소가 아니며, 교재에 따라 몫의 미분법에서 부수적으로 다룬다."
  },
  {
    "unitId": "MATH_H3_CALC2-2022-050",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분 II",
    "categoryOrder": 20,
    "category": "미분법",
    "unitName": "도함수의 활용",
    "order": 50,
    "areaName": "미분법",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅱ-02-08~11",
    "aliases": [
      "다양한 곡선의 접선",
      "그래프의 개형",
      "변곡점",
      "속도와 가속도"
    ],
    "note": "이계도함수는 변곡점 설명 범위에서 다룬다. 삼계 이상 고계도함수와 미분방정식의 풀이는 2015 개정부터 제외되어 2022에도 없다. ⚠ 미적분 I에 같은 이름의 단원이 있다."
  },
  {
    "unitId": "MATH_H3_CALC2-2022-060",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분 II",
    "categoryOrder": 30,
    "category": "적분법",
    "unitName": "여러 가지 함수의 적분법",
    "order": 60,
    "areaName": "적분법",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅱ-03-01~03",
    "aliases": [
      "여러 가지 함수의 적분",
      "치환적분법",
      "부분적분법"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2022-070",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분 II",
    "categoryOrder": 30,
    "category": "적분법",
    "unitName": "정적분의 활용",
    "order": 70,
    "areaName": "적분법",
    "ontologyArea": "ANA",
    "standards": "12미적Ⅱ-03-04~07",
    "aliases": [
      "정적분과 급수",
      "구분구적법",
      "넓이",
      "입체도형의 부피",
      "속도와 거리"
    ],
    "note": "03-04 정적분과 급수의 합 사이의 관계(수능 빈출). y축 기준 넓이는 2022에서 부활. 입체도형의 부피는 단면적 적분에 한정되며 회전체의 부피는 2015에서 이미 제외되어 2022에도 없다."
  },
  {
    "unitId": "MATH_PROB_STAT-2022-010",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 10,
    "category": "경우의 수",
    "unitName": "여러 가지 순열과 조합",
    "order": 10,
    "areaName": "경우의 수",
    "ontologyArea": "PRB",
    "standards": "12확통01-01~02",
    "aliases": [
      "순열과 조합",
      "여러 가지 순열",
      "중복순열",
      "중복조합",
      "같은 것이 있는 순열"
    ],
    "note": "교육과정 내용 요소 표기는 '순열과 조합'이지만 공통수학1과 글자가 같아 교재 표기를 정본으로 삼았다. 원순열은 2022에서 일반계 과정 최초로 삭제되어 진로선택으로 이동."
  },
  {
    "unitId": "MATH_PROB_STAT-2022-020",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 10,
    "category": "경우의 수",
    "unitName": "이항정리",
    "order": 20,
    "areaName": "경우의 수",
    "ontologyArea": "PRB",
    "standards": "12확통01-03",
    "aliases": [
      "파스칼의 삼각형",
      "이항계수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_PROB_STAT-2022-030",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 20,
    "category": "확률",
    "unitName": "확률의 뜻과 활용",
    "order": 30,
    "areaName": "확률",
    "ontologyArea": "PRB",
    "standards": "12확통02-01~03",
    "aliases": [
      "확률의 개념과 활용",
      "확률의 덧셈정리",
      "여사건의 확률"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_PROB_STAT-2022-040",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 20,
    "category": "확률",
    "unitName": "조건부확률",
    "order": 40,
    "areaName": "확률",
    "ontologyArea": "PRB",
    "standards": "12확통02-04~06",
    "aliases": [
      "사건의 독립과 종속",
      "확률의 곱셈정리",
      "독립시행의 확률"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_PROB_STAT-2022-050",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "확률분포",
    "order": 50,
    "areaName": "통계",
    "ontologyArea": "PRB",
    "standards": "12확통03-01~04",
    "aliases": [
      "이산확률변수와 이항분포",
      "연속확률변수와 정규분포",
      "확률변수",
      "정규분포"
    ],
    "note": "이 마스터에서 가장 굵은 행이다. 관측이 몰리면 '이산확률변수와 이항분포'/'연속확률변수와 정규분포' 2행 분할을 검토(§4-E3)."
  },
  {
    "unitId": "MATH_PROB_STAT-2022-060",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "통계적 추정",
    "order": 60,
    "areaName": "통계",
    "ontologyArea": "PRB",
    "standards": "12확통03-05~07",
    "aliases": [
      "모평균의 추정",
      "표본평균의 분포",
      "모비율의 추정"
    ],
    "note": "모집단과 표본, 표본추출, 표본평균과 모평균 / 표본비율과 모비율의 관계, 모평균 및 모비율의 추정, 공학 도구를 사용한 결과 해석. 모비율의 추정은 2015에서 빠졌다가 2022에서 부활한 실질 신설분이다."
  },
  {
    "unitId": "MATH_GEOMETRY-2022-010",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 10,
    "category": "이차곡선",
    "unitName": "이차곡선",
    "order": 10,
    "areaName": "이차곡선",
    "ontologyArea": "GEO",
    "standards": "12기하01-01~03",
    "aliases": [
      "포물선",
      "타원",
      "쌍곡선"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_GEOMETRY-2022-020",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 10,
    "category": "이차곡선",
    "unitName": "이차곡선의 접선",
    "order": 20,
    "areaName": "이차곡선",
    "ontologyArea": "GEO",
    "standards": "12기하01-04",
    "aliases": [
      "이차곡선과 직선"
    ],
    "note": "2022는 이차곡선과 직선의 관계를 '접하는 경우만' 다룬다 — 위치 관계(교점 개수)는 삭제. 2015의 '이차곡선과 직선'과 범위가 다르다."
  },
  {
    "unitId": "MATH_GEOMETRY-2022-030",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 20,
    "category": "공간도형과 공간좌표",
    "unitName": "공간도형",
    "order": 30,
    "areaName": "공간도형과 공간좌표",
    "ontologyArea": "GEO",
    "standards": "12기하02-01~03",
    "aliases": [
      "삼수선의 정리",
      "정사영",
      "직선과 평면의 위치 관계"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_GEOMETRY-2022-040",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 20,
    "category": "공간도형과 공간좌표",
    "unitName": "공간좌표",
    "order": 40,
    "areaName": "공간도형과 공간좌표",
    "ontologyArea": "GEO",
    "standards": "12기하02-04~05",
    "aliases": [
      "구의 방정식",
      "좌표공간"
    ],
    "note": "선분의 외분은 제외(내분만)."
  },
  {
    "unitId": "MATH_GEOMETRY-2022-050",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 30,
    "category": "벡터",
    "unitName": "벡터의 연산",
    "order": 50,
    "areaName": "벡터",
    "ontologyArea": "GEO",
    "standards": "12기하03-01",
    "aliases": [
      "벡터의 뜻",
      "벡터의 덧셈과 실수배"
    ],
    "note": "2022에서 평면벡터와 공간벡터를 한 대단원으로 통합하고 과목 마지막에 배치했다. order를 2015 교재 순서로 두면 진도가 어긋난다(§4-C2)."
  },
  {
    "unitId": "MATH_GEOMETRY-2022-060",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 30,
    "category": "벡터",
    "unitName": "벡터의 성분과 내적",
    "order": 60,
    "areaName": "벡터",
    "ontologyArea": "GEO",
    "standards": "12기하03-02~03",
    "aliases": [
      "위치벡터",
      "벡터의 내적",
      "평면벡터의 성분과 내적"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_GEOMETRY-2022-070",
    "curriculum": "2022",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 30,
    "category": "벡터",
    "unitName": "도형의 방정식",
    "order": 70,
    "areaName": "벡터",
    "ontologyArea": "GEO",
    "standards": "12기하03-04~05",
    "aliases": [
      "벡터와 직선의 방정식",
      "평면의 방정식",
      "공간벡터"
    ],
    "note": "⚠ 공통수학2의 대단원 '도형의 방정식'과 글자가 같다. 화면에 course를 함께 찍어야 한다."
  },
  {
    "unitId": "MATH_H1_S1-2015-010",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 10,
    "category": "다항식",
    "unitName": "다항식의 연산",
    "order": 10,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "다항식의 사칙연산",
      "곱셈공식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2015-020",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 10,
    "category": "다항식",
    "unitName": "나머지정리",
    "order": 20,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "항등식과 나머지정리",
      "항등식",
      "조립제법",
      "나머지정리와 인수분해"
    ],
    "note": "확인한 교재(쎈, 천재 유형해결의법칙)는 3중단원을 유지하면서 이름만 '항등식과 나머지정리'로 쓴다 — 백필에서 실제로 부딪히는 문자열."
  },
  {
    "unitId": "MATH_H1_S1-2015-030",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 10,
    "category": "다항식",
    "unitName": "인수분해",
    "order": 30,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2015-040",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "복소수와 이차방정식",
    "order": 40,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "복소수",
      "이차방정식",
      "판별식",
      "근과 계수의 관계"
    ],
    "note": "★출판사 분할선이 여기다. 쎈·천재 유형해결의법칙은 '복소수'/'이차방정식' 2중단원으로 끊는다. 교재 중단원명 '이차방정식'은 order 50이 아니라 이 행에 대응한다."
  },
  {
    "unitId": "MATH_H1_S1-2015-050",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "이차방정식과 이차함수",
    "order": 50,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "이차함수와 그래프",
      "이차함수의 최대와 최소"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2015-060",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 20,
    "category": "방정식과 부등식",
    "unitName": "여러 가지 방정식과 부등식",
    "order": 60,
    "areaName": "문자와 식",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "여러 가지 방정식",
      "여러 가지 부등식",
      "삼차방정식과 사차방정식",
      "연립이차방정식",
      "이차부등식"
    ],
    "note": "이 과목에서 가장 굵은 행. 교재도 2중단원으로 끊는다 — 첫 시즌 뒤 분할 검토 1순위(§4-E3)."
  },
  {
    "unitId": "MATH_H1_S1-2015-070",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 30,
    "category": "도형의 방정식",
    "unitName": "평면좌표",
    "order": 70,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "두 점 사이의 거리",
      "선분의 내분점과 외분점"
    ],
    "note": "2015는 외분점을 포함한다(2022 공통수학2는 내분만)."
  },
  {
    "unitId": "MATH_H1_S1-2015-080",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 30,
    "category": "도형의 방정식",
    "unitName": "직선의 방정식",
    "order": 80,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "두 직선의 위치 관계",
      "점과 직선 사이의 거리"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2015-090",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 30,
    "category": "도형의 방정식",
    "unitName": "원의 방정식",
    "order": 90,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "원과 직선의 위치 관계"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S1-2015-100",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S1",
    "course": "수학(상)",
    "categoryOrder": 30,
    "category": "도형의 방정식",
    "unitName": "도형의 이동",
    "order": 100,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "평행이동",
      "대칭이동"
    ],
    "note": "2022에서는 도형의 방정식 영역 전체가 공통수학2로 이동한다. 부등식의 영역은 2015에서 이미 삭제되어 여기에도 없다."
  },
  {
    "unitId": "MATH_H1_S2-2015-010",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "수학(하)",
    "categoryOrder": 10,
    "category": "집합과 명제",
    "unitName": "집합",
    "order": 10,
    "areaName": "수와 연산",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "집합의 뜻과 포함 관계",
      "집합의 연산"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2015-020",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "수학(하)",
    "categoryOrder": 10,
    "category": "집합과 명제",
    "unitName": "명제",
    "order": 20,
    "areaName": "수와 연산",
    "ontologyArea": "ALG",
    "standards": "",
    "aliases": [
      "명제와 조건",
      "필요조건과 충분조건",
      "절대부등식",
      "부등식의 증명"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2015-030",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "수학(하)",
    "categoryOrder": 20,
    "category": "함수와 그래프",
    "unitName": "함수",
    "order": 30,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "합성함수",
      "역함수"
    ],
    "note": "교과서 대단원명이 '함수'인 곳이 많다 — 대단원명 alias 필요."
  },
  {
    "unitId": "MATH_H1_S2-2015-040",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "수학(하)",
    "categoryOrder": 20,
    "category": "함수와 그래프",
    "unitName": "유리함수와 무리함수",
    "order": 40,
    "areaName": "함수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "유리함수",
      "무리함수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2015-050",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "수학(하)",
    "categoryOrder": 30,
    "category": "경우의 수",
    "unitName": "경우의 수",
    "order": 50,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "합의 법칙과 곱의 법칙"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H1_S2-2015-060",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H1_S2",
    "course": "수학(하)",
    "categoryOrder": 30,
    "category": "경우의 수",
    "unitName": "순열과 조합",
    "order": 60,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "순열",
      "조합"
    ],
    "note": "⚠ 확률과 통계의 '여러 가지 순열과 조합'과 범위가 다르다(원순열·중복순열·중복조합은 확통 소관). 문자열만으로 매칭하면 섞인다."
  },
  {
    "unitId": "MATH_H2_ALG-2015-010",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 10,
    "category": "지수함수와 로그함수",
    "unitName": "지수와 로그",
    "order": 10,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "지수",
      "로그",
      "거듭제곱근",
      "상용로그"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2015-020",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 10,
    "category": "지수함수와 로그함수",
    "unitName": "지수함수와 로그함수",
    "order": 20,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "지수함수",
      "로그함수",
      "지수방정식과 로그방정식"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2015-030",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 20,
    "category": "삼각함수",
    "unitName": "삼각함수",
    "order": 30,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "12수학Ⅰ02-01 + 02-02(뜻)",
    "aliases": [
      "일반각과 호도법",
      "삼각함수의 뜻"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2015-040",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 20,
    "category": "삼각함수",
    "unitName": "삼각함수의 그래프",
    "order": 40,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "12수학Ⅰ02-02(그래프)",
    "aliases": [
      "삼각방정식과 삼각부등식"
    ],
    "note": "★초안 수정 — 쎈 수학Ⅰ 목차가 '05 삼각함수 / 06 삼각함수의 그래프 / 07 삼각함수의 활용' 3중단원이다."
  },
  {
    "unitId": "MATH_H2_ALG-2015-050",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 20,
    "category": "삼각함수",
    "unitName": "삼각함수의 활용",
    "order": 50,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "12수학Ⅰ02-03",
    "aliases": [
      "사인법칙과 코사인법칙",
      "삼각형에의 활용"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2015-060",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 30,
    "category": "수열",
    "unitName": "등차수열과 등비수열",
    "order": 60,
    "areaName": "대수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "등차수열",
      "등비수열"
    ],
    "note": "고시 영역은 '대수'지만 ontologyArea는 온톨로지 배치(해석학>수열)를 따라 ANA로 둔다."
  },
  {
    "unitId": "MATH_H2_ALG-2015-070",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 30,
    "category": "수열",
    "unitName": "수열의 합",
    "order": 70,
    "areaName": "대수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "시그마",
      "여러 가지 수열의 합"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_ALG-2015-080",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_ALG",
    "course": "수학 I",
    "categoryOrder": 30,
    "category": "수열",
    "unitName": "수학적 귀납법",
    "order": 80,
    "areaName": "대수",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "수열의 귀납적 정의"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2015-010",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 10,
    "category": "함수의 극한과 연속",
    "unitName": "함수의 극한",
    "order": 10,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "극한",
      "좌극한과 우극한"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2015-020",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 10,
    "category": "함수의 극한과 연속",
    "unitName": "함수의 연속",
    "order": 20,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "연속함수",
      "사잇값 정리"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2015-030",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 20,
    "category": "미분",
    "unitName": "미분계수",
    "order": 30,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "평균변화율",
      "미분계수와 도함수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2015-040",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 20,
    "category": "미분",
    "unitName": "도함수",
    "order": 40,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "미분법"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2015-050",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 20,
    "category": "미분",
    "unitName": "도함수의 활용",
    "order": 50,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "접선의 방정식",
      "극대와 극소",
      "그래프의 개형",
      "속도와 가속도"
    ],
    "note": "성취기준 6개로 이 과목에서 가장 굵다. ⚠ 미적분에 같은 이름의 단원이 있다."
  },
  {
    "unitId": "MATH_H2_CALC1-2015-060",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 30,
    "category": "적분",
    "unitName": "부정적분",
    "order": 60,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2015-070",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 30,
    "category": "적분",
    "unitName": "정적분",
    "order": 70,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "미적분의 기본정리"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H2_CALC1-2015-080",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H2_CALC1",
    "course": "수학 II",
    "categoryOrder": 30,
    "category": "적분",
    "unitName": "정적분의 활용",
    "order": 80,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "넓이",
      "속도와 거리"
    ],
    "note": "⚠ 미적분에 같은 이름의 단원이 있다."
  },
  {
    "unitId": "MATH_H3_CALC2-2015-010",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분",
    "categoryOrder": 10,
    "category": "수열의 극한",
    "unitName": "수열의 극한",
    "order": 10,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "등비수열의 극한"
    ],
    "note": "2015 '미적분'(초월미적분)과 2022 '미적분 II'는 범위가 비슷하지만 동일하지 않다 — 자동 매칭 금지."
  },
  {
    "unitId": "MATH_H3_CALC2-2015-020",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분",
    "categoryOrder": 10,
    "category": "수열의 극한",
    "unitName": "급수",
    "order": 20,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "등비급수"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2015-030",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분",
    "categoryOrder": 20,
    "category": "미분법",
    "unitName": "여러 가지 함수의 미분",
    "order": 30,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "지수함수와 로그함수의 미분",
      "삼각함수의 미분",
      "삼각함수의 덧셈정리"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2015-040",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분",
    "categoryOrder": 20,
    "category": "미분법",
    "unitName": "여러 가지 미분법",
    "order": 40,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "몫의 미분법",
      "합성함수의 미분법",
      "음함수와 역함수의 미분법"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2015-050",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분",
    "categoryOrder": 20,
    "category": "미분법",
    "unitName": "도함수의 활용",
    "order": 50,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "접선의 방정식",
      "그래프의 개형",
      "속도와 가속도"
    ],
    "note": "⚠ 수학 II에 같은 이름의 단원이 있다."
  },
  {
    "unitId": "MATH_H3_CALC2-2015-060",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분",
    "categoryOrder": 30,
    "category": "적분법",
    "unitName": "여러 가지 적분법",
    "order": 60,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "치환적분법",
      "부분적분법",
      "여러 가지 함수의 적분"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_H3_CALC2-2015-070",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_H3_CALC2",
    "course": "미적분",
    "categoryOrder": 30,
    "category": "적분법",
    "unitName": "정적분의 활용",
    "order": 70,
    "areaName": "해석",
    "ontologyArea": "ANA",
    "standards": "",
    "aliases": [
      "넓이",
      "부피",
      "속도와 거리"
    ],
    "note": "⚠ 수학 II에 같은 이름의 단원이 있다."
  },
  {
    "unitId": "MATH_PROB_STAT-2015-010",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 10,
    "category": "경우의 수",
    "unitName": "여러 가지 순열과 조합",
    "order": 10,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "순열과 조합",
      "여러 가지 순열",
      "원순열",
      "중복순열",
      "중복조합"
    ],
    "note": "2015에는 원순열이 있다(2022에서 삭제). 수학(하)의 '순열과 조합'과 충돌을 피하려고 교재 표기를 정본으로 삼았다."
  },
  {
    "unitId": "MATH_PROB_STAT-2015-020",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 10,
    "category": "경우의 수",
    "unitName": "이항정리",
    "order": 20,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "파스칼의 삼각형"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_PROB_STAT-2015-030",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 20,
    "category": "확률",
    "unitName": "확률의 뜻과 활용",
    "order": 30,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "확률의 덧셈정리",
      "여사건의 확률"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_PROB_STAT-2015-040",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 20,
    "category": "확률",
    "unitName": "조건부확률",
    "order": 40,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "독립과 종속",
      "확률의 곱셈정리",
      "독립시행"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_PROB_STAT-2015-050",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "확률분포",
    "order": 50,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "이산확률분포",
      "연속확률분포",
      "이항분포",
      "정규분포"
    ],
    "note": "이 과목에서 가장 굵은 행."
  },
  {
    "unitId": "MATH_PROB_STAT-2015-060",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_PROB_STAT",
    "course": "확률과 통계",
    "categoryOrder": 30,
    "category": "통계",
    "unitName": "통계적 추정",
    "order": 60,
    "areaName": "확률과 통계",
    "ontologyArea": "PRB",
    "standards": "",
    "aliases": [
      "모평균의 추정",
      "표본평균의 분포"
    ],
    "note": "2015에서는 모평균 추정만 다루고 모비율 추정은 제외된다 — 2022와 다른 지점."
  },
  {
    "unitId": "MATH_GEOMETRY-2015-010",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 10,
    "category": "이차곡선",
    "unitName": "이차곡선",
    "order": 10,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "12기하01-01~03",
    "aliases": [
      "포물선",
      "타원",
      "쌍곡선"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_GEOMETRY-2015-020",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 10,
    "category": "이차곡선",
    "unitName": "이차곡선과 직선",
    "order": 20,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "12기하01-04",
    "aliases": [
      "이차곡선의 접선"
    ],
    "note": "2015는 위치 관계와 접선을 모두 다룬다 — 2022('이차곡선의 접선')와 범위가 다르다."
  },
  {
    "unitId": "MATH_GEOMETRY-2015-030",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 20,
    "category": "평면벡터",
    "unitName": "벡터의 연산",
    "order": 30,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "벡터의 뜻",
      "벡터의 덧셈과 실수배"
    ],
    "note": "2015 대단원 순서는 이차곡선 → 평면벡터 → 공간도형과 공간좌표다(2022와 다르다)."
  },
  {
    "unitId": "MATH_GEOMETRY-2015-040",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 20,
    "category": "평면벡터",
    "unitName": "평면벡터의 성분과 내적",
    "order": 40,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "",
    "aliases": [
      "위치벡터",
      "벡터의 내적"
    ],
    "note": ""
  },
  {
    "unitId": "MATH_GEOMETRY-2015-050",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 30,
    "category": "공간도형과 공간좌표",
    "unitName": "공간도형",
    "order": 50,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "12기하03-01~03",
    "aliases": [
      "삼수선의 정리",
      "정사영",
      "직선과 평면"
    ],
    "note": "별책8 111쪽은 (3) 공간도형과 공간좌표 안에서 ① 공간도형 03-01~03 / ② 공간좌표 03-04~07로 번호를 다시 시작한다. 고시 내용 체계표는 '직선과 평면/정사영/공간좌표' 3개로 적어 고시가 자기 안에서 어긋나 있고, 여기서는 성취기준·교과서 쪽을 택했다. 정사영을 별도 행으로 두면 기하는 7행이 된다(분할 후보)."
  },
  {
    "unitId": "MATH_GEOMETRY-2015-060",
    "curriculum": "2015",
    "schoolLevel": "고등학교",
    "courseCode": "MATH_GEOMETRY",
    "course": "기하",
    "categoryOrder": 30,
    "category": "공간도형과 공간좌표",
    "unitName": "공간좌표",
    "order": 60,
    "areaName": "기하",
    "ontologyArea": "GEO",
    "standards": "12기하03-04~07",
    "aliases": [
      "구의 방정식",
      "좌표공간"
    ],
    "note": "⚠ 2015 '기하'와 2022 '기하'는 과목명이 글자까지 같은 유일한 쌍이다. courseCode(MATH_GEOMETRY)만으로 조회하면 두 교육과정 단원이 섞인다."
  }
];
