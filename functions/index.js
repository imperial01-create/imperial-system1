const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.adminResetPassword = functions.https.onCall(async (data, context) => {
  // 1. 요청한 사람이 로그인한 상태인지 확인
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "인증된 사용자만 접근 가능합니다.");
  }

  const uid = data.uid;
  const newPassword = data.newPassword;

  if (!uid || !newPassword || newPassword.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "유효한 UID와 6자리 이상의 새 비밀번호가 필요합니다.");
  }

  try {
    // 2. 먼저 프론트엔드에서 넘어온 UID로 비밀번호 강제 변경 시도
    await admin.auth().updateUser(uid, { password: newPassword });
    return { success: true, message: "비밀번호가 성공적으로 변경되었습니다." };
    
  } catch (error) {
    console.error("1차 변경 실패:", error.code, error.message);

    // 3. [핵심 로직] 과거 생성된 계정이어서 UID 대신 단순 아이디(문서 ID)가 넘어온 경우
    if (error.code === 'auth/user-not-found') {
      try {
        // 학생의 아이디를 이용해 당시 생성했던 가짜 이메일을 역추적
        const fallbackEmail = `${uid}@imperial.com`;
        const userRecord = await admin.auth().getUserByEmail(fallbackEmail);
        
        // 찾아낸 '진짜 Auth UID'로 다시 비밀번호 변경!
        await admin.auth().updateUser(userRecord.uid, { password: newPassword });
        return { success: true, message: "이메일 추적을 통해 비밀번호가 성공적으로 변경되었습니다." };
        
      } catch (fallbackError) {
        console.error("2차 이메일 검색 실패:", fallbackError);
        throw new functions.https.HttpsError("not-found", "해당 사용자의 인증 계정을 찾을 수 없습니다.");
      }
    }

    // 4. 권한(IAM) 문제 등일 경우 에러 메시지를 프론트엔드 화면으로 그대로 전달하기 위해 'unknown' 사용
    // (주의: 'internal'로 던지면 Firebase 보안 정책상 프론트엔드에서 메시지를 강제로 숨겨버립니다.)
    throw new functions.https.HttpsError("unknown", "서버 관리자 권한 에러: " + error.message);
  }
});