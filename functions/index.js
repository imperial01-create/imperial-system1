const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.adminResetPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "인증된 사용자만 접근 가능합니다.");
  }
  const uid = data.uid;
  const newPassword = data.newPassword;
  if (!uid || !newPassword || newPassword.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "유효한 UID와 6자리 이상의 새 비밀번호가 필요합니다.");
  }
  try {
    await admin.auth().updateUser(uid, { password: newPassword });
    return { success: true, message: "비밀번호가 성공적으로 변경되었습니다." };
  } catch (error) {
    console.error("Password reset error:", error);
    throw new functions.https.HttpsError("internal", "서버 오류: " + error.message);
  }
});