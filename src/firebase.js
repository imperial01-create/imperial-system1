import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBN0Zy0-GOqN0sB0bTouDohZp7B2zfFjWc",
  authDomain: "imperial-system-1221c.firebaseapp.com",
  projectId: "imperial-system-1221c",
  storageBucket: "imperial-system-1221c.firebasestorage.app",
  messagingSenderId: "414889692060",
  appId: "1:414889692060:web:9b6b89d0d918a74f8c1659"
};

// 1. Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// 2. Auth 모듈 제거 완료 (인증 기능 미사용)

// 3. Firestore DB 초기화 (이중 캐시 충돌 방지를 위해 최신 방식으로 단일화)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: persistentMultipleTabManager() 
  })
});

export default app;