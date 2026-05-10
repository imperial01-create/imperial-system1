// 최신 2세대(v2) 파이어베이스 함수 라이브러리 불러오기
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// 앱 초기화 (중복 실행 방지 로직 포함)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

exports.adminResetPassword = onCall(async (request) => {
  // 1. 요청한 사람이 로그인한 상태인지 정확히 확인 (v2 전용 문법)
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증 티켓이 만료되었거나 없습니다. 브라우저를 새로고침(F5)한 뒤 다시 시도해 주세요.");
  }

  const uid = request.data.uid;
  const newPassword = request.data.newPassword;

  if (!uid || !newPassword || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "유효한 UID와 6자리 이상의 새 비밀번호가 필요합니다.");
  }

  try {
    // 2. 먼저 프론트엔드에서 넘어온 UID로 강제 변경 시도
    await admin.auth().updateUser(uid, { password: newPassword });
    return { success: true, message: "비밀번호가 성공적으로 변경되었습니다." };
    
  } catch (error) {
    console.error("1차 변경 실패:", error.code, error.message);

    // 3. 과거 생성된 계정이어서 UID 대신 단순 아이디(문서 ID)가 넘어온 경우 역추적
    if (error.code === 'auth/user-not-found') {
      try {
        const fallbackEmail = `${uid}@imperial.com`;
        const userRecord = await admin.auth().getUserByEmail(fallbackEmail);
        
        await admin.auth().updateUser(userRecord.uid, { password: newPassword });
        return { success: true, message: "이메일 추적을 통해 비밀번호가 성공적으로 변경되었습니다." };
        
      } catch (fallbackError) {
        console.error("2차 이메일 검색 실패:", fallbackError);
        throw new HttpsError("not-found", "해당 사용자의 인증 계정을 찾을 수 없습니다.");
      }
    }

    throw new HttpsError("unknown", "서버 오류: " + error.message);
  }
});