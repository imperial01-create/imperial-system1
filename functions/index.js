// 최신 2세대(v2) 파이어베이스 함수 및 파이어베이스 어드민 라이브러리
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore"); // 🚀 Firestore 트리거 라이브러리 추가
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// [기능 1] 관리자 비밀번호 강제 초기화
exports.adminResetPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증 티켓이 만료되었습니다. 다시 로그인 해주세요.");
  }
  const uid = request.data.uid;
  const newPassword = request.data.newPassword;
  if (!uid || !newPassword || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "유효한 인자 값이 아닙니다.");
  }
  try {
    await admin.auth().updateUser(uid, { password: newPassword });
    return { success: true, message: "비밀번호가 성공되었습니다." };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      try {
        const fallbackEmail = `${uid}@imperial.com`;
        const userRecord = await admin.auth().getUserByEmail(fallbackEmail);
        await admin.auth().updateUser(userRecord.uid, { password: newPassword });
        return { success: true };
      } catch (fError) {
        throw new HttpsError("not-found", "계정을 찾을 수 없습니다.");
      }
    }
    throw new HttpsError("unknown", error.message);
  }
});

// [기능 2] Gemini AI 기반 학부모 피드백 문장 자동 정제 엔진
exports.refineFeedback = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "로그인한 사용자만 AI를 사용할 수 있습니다.");
    }
    const rawText = request.data.rawText;
    if (!rawText) {
        throw new HttpsError("invalid-argument", "정제할 텍스트가 없습니다.");
    }
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            당신은 대한민국 최고 수준의 프리미엄 학원의 교육 전문가이자 원장님입니다. 
            학원 조교가 작성한 아래의 날것의 클리닉 피드백을 학부모님께 바로 발송할 수 있도록, 
            매우 정중하고 전문적이며 신뢰감을 주는 어투로 다듬어주세요. 
            단, 원본의 사실(문제점 등)은 절대 왜곡하거나 과장하지 마세요. 불필요한 인사말 없이 정제된 본문만 출력하세요.

            원본 피드백:
            "${rawText}"
        `;

        const result = await model.generateContent(prompt);
        return { refinedText: result.response.text().trim() };
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new HttpsError("internal", "AI 정제 중 서버 오류가 발생했습니다.");
    }
});

// 🚀 [기능 3] 통합 메시지 센터 FCM 오토 트리거 (새로운 혁신)
// 데스크 웹에서 어떤 종류의 문자든 발송 대기열(sms_outbox)에 집어넣는 순간 '실시간'으로 작동합니다.
exports.onSmsOutboxCreated = onDocumentCreated("artifacts/imperial-clinic-v1/public/data/sms_outbox/{docId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return null;
    
    const smsData = snapshot.data();

    // 상태가 'pending(발송 대기)'인 문자 데이터가 생성되었을 때만 작동
    if (smsData.status === "pending") {
        
        // 주머니 속 갤럭시 S25 울트라를 깨울 투명한 데이터 푸시 팩키지 구성
        const pushMessage = {
            data: {
                action: "TRIGGER_SMS_SEND",
                docId: event.params.docId // 안드로이드 폰에게 어떤 문서 번호를 보낼지 인덱스 전달
            },
            // 학원폰 무전 채널인 'imperial_sms_gateway' 주소로 일제히 사격
            topic: "imperial_sms_gateway" 
        };

        try {
            // 구글 FCM 서버를 통해 주머니 속 폰을 무선으로 원격 조종 유도
            await admin.messaging().send(pushMessage);
            console.log(`[통합메시지] 문서번호 ${event.params.docId}에 대한 학원폰 깨우기 신호 전송 성공!`);
        } catch (error) {
            console.error("FCM 백그라운드 무전 송신 실패:", error);
        }
    }
    return null;
});