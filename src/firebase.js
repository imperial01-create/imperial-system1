import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  enableIndexedDbPersistence 
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

// 2. 인증 모듈 초기화
export const auth = getAuth(app);

// 3. Firestore DB 초기화 (비용 절감 및 속도 최적화 적용)
// 로컬 캐시를 활성화하여 읽기 비용을 줄이고 로딩 속도를 높입니다.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: persistentMultipleTabManager() 
  })
});

// 4. 오프라인 지속성 활성화 (선택적)
// 인터넷이 끊겨도 앱이 작동하도록 돕습니다.
try { 
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('다중 탭 오픈으로 인해 지속성 모드를 사용할 수 없습니다.');
    } else if (err.code === 'unimplemented') {
      console.warn('브라우저가 이 기능을 지원하지 않습니다.');
    }
  }); 
} catch(e) {
  // 환경에 따라 지원되지 않을 수 있으므로 에러는 무시합니다.
}

export default app;