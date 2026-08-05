/* 시스템 전역 상수.
   기존에는 28개 파일이 각자 `const APP_ID = 'imperial-clinic-v1'`을 선언하고 있었습니다.
   값이 하나뿐인 데이터인데 선언이 28벌이면, 바꿔야 할 때 한 곳만 빠뜨려도
   그 화면만 조용히 다른 곳을 바라보게 됩니다. */

export const APP_ID = 'imperial-clinic-v1';

/** Firestore 공용 데이터 경로를 만듭니다. 예: dataPath('users') */
export const dataPath = (collectionName) =>
  `artifacts/${APP_ID}/public/data/${collectionName}`;
