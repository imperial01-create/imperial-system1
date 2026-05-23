// 최신 2세대(v2) 파이어베이스 함수 및 파이어베이스 어드민 라이브러리
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore"); 
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
    return { success: true, message: "비밀번호가 성공적으로 변경되었습니다." };
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

// [기능 2] Gemini AI 기반 학부모 피드백 문장 자동 정제 엔진 (🚀 2026년형 3.5 Flash 엔진 탑재 완료)
exports.refineFeedback = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "로그인한 사용자만 AI를 사용할 수 있습니다.");
    }
    const rawText = request.data.rawText;
    if (!rawText) {
        throw new HttpsError("invalid-argument", "정제할 텍스트가 없습니다.");
    }
    
    try {
        const rawKey = process.env.GEMINI_API_KEY || "";
        const apiKey = rawKey.trim().replace(/['"]/g, ''); 
        
        if (!apiKey) {
            console.error("🔥 서버 환경변수(GEMINI_API_KEY)가 비어있습니다. .env 파일을 확인하세요.");
            throw new Error("서버 API 키가 설정되지 않았습니다.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        
        const prompt = `
            당신은 대한민국 최고 수준의 프리미엄 학원의 교육 전문가이자 원장님입니다. 
            학원 조교가 작성한 아래의 날것의 클리닉 피드백을 학부모님께 바로 발송할 수 있도록, 
            매우 정중하고 전문적이며 신뢰감을 주는 어투로 다듬어주세요. 
            단, 원본의 사실(문제점 등)은 절대 왜곡하거나 과장하지 마세요. 불필요한 인사말 없이 정제된 본문만 출력하세요.

            원본 피드백:
            "${rawText}"
        `;

        let result;
        try {
            // 🚀 [CTO 패치] 원장님 지적사항 완벽 반영: 현재 구글 서버에 실존하는 2026년 최신 3.5 Flash 모델 호출!
            const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
            result = await model.generateContent(prompt);
        } catch (fallbackError) {
            console.warn("🔥 3.5-flash 모델 호출 실패. 3.1 Pro 모델로 자동 우회합니다.", fallbackError);
            // 🚀 우회용 모델 역시 구글의 최신 3.1 Pro 엔진으로 업그레이드!
            const fallbackModel = genAI.getGenerativeModel({ model: "gemini-3.1-pro" });
            result = await fallbackModel.generateContent(prompt);
        }

        return { refinedText: result.response.text().trim() };
    } catch (error) {
        console.error("🔥 [Gemini API 정밀 에러 로그]:", error);
        throw new HttpsError("internal", `AI API 오류 발생: ${error.message}`);
    }
});

// [기능 3] 통합 메시지 센터 FCM 오토 트리거 
exports.onSmsOutboxCreated = onDocumentCreated("artifacts/imperial-clinic-v1/public/data/sms_outbox/{docId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return null;
    
    const smsData = snapshot.data();

    if (smsData.status === "pending") {
        const pushMessage = {
            data: {
                action: "TRIGGER_SMS_SEND",
                docId: event.params.docId 
            },
            topic: "imperial_sms_gateway" 
        };

        try {
            await admin.messaging().send(pushMessage);
            console.log(`[통합메시지] 문서번호 ${event.params.docId}에 대한 학원폰 깨우기 신호 전송 성공!`);
        } catch (error) {
            console.error("🔥 FCM 백그라운드 무전 송신 실패:", error);
        }
    }
    return null;
});