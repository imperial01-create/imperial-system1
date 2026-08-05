import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
// 🚀 [CTO 추가] 서버(Cloud Functions) 모듈 임포트
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBN0Zy0-GOqN0sB0bTouDohZp7B2zfFjWc",
  authDomain: "imperial-system-1221c.firebaseapp.com",
  projectId: "imperial-system-1221c",
  storageBucket: "imperial-system-1221c.firebasestorage.app",
  messagingSenderId: "414889692060",
  appId: "1:414889692060:web:9b6b89d0d918a74f8c1659"
};

// 1. Firebase 메인 앱 초기화
const app = initializeApp(firebaseConfig);

/* 🔒 [보안 패치] '계정 생성 전용 그림자 앱(secondaryApp)'을 제거했습니다.
   사용자 계정 생성은 이제 서버(Functions의 adminCreateUser / registerUser)가 담당하며,
   서버가 호출자의 권한을 검증하므로 브라우저에서 계정을 만들 필요가 없습니다. */

// 2. Firestore DB 초기화
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: persistentMultipleTabManager() 
  })
});

// 3. Auth 인스턴스 추출 (Export)
export const auth = getAuth(app);

// 🚀 4. [신규 추가] 비밀번호 강제 변경 등 백엔드 기능용 Functions 인스턴스 추출
export const functions = getFunctions(app, 'asia-northeast3');

export default app;