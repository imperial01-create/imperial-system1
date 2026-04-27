import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";
// 🚀 [CTO 추가] Firebase Auth 모듈 임포트
import { getAuth } from "firebase/auth"; 

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

// 💡 [CTO 핵심 기술] 관리자가 새 사용자를 등록할 때 기존 세션이 끊기지 않도록 하는 '계정 생성 전용' 그림자 앱
const secondaryApp = initializeApp(firebaseConfig, "Secondary");

// 2. Firestore DB 초기화
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: persistentMultipleTabManager() 
  })
});

// 3. Auth 인스턴스 추출 (Export)
export const auth = getAuth(app); // 학부모/학생 등 일반 로그인용
export const secondaryAuth = getAuth(secondaryApp); // 관리자의 사용자 계정 발급 전용

export default app;