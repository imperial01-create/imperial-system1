// 최신 2세대(v2) 파이어베이스 함수 라이브러리 불러오기
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai"); // 🚀 Gemini 라이브러리 추가

// 앱 초기화 (중복 실행 방지 로직 포함)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// 1. 기존 기능: 관리자 비밀번호 강제 초기화
exports.adminResetPassword = onCall(async (request) => {
  // 요청한 사람이 로그인한 상태인지 정확히 확인 (v2 전용 문법)
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증 티켓이 만료되었거나 없습니다. 브라우저를 새로고침(F5)한 뒤 다시 시도해 주세요.");
  }

  const uid = request.data.uid;
  const newPassword = request.data.newPassword;

  if (!uid || !newPassword || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "유효한 UID와 6자리 이상의 새 비밀번호가 필요합니다.");
  }

  try {
    // 먼저 프론트엔드에서 넘어온 UID로 강제 변경 시도
    await admin.auth().updateUser(uid, { password: newPassword });
    return { success: true, message: "비밀번호가 성공적으로 변경되었습니다." };
    
  } catch (error) {
    console.error("1차 변경 실패:", error.code, error.message);

    // 과거 생성된 계정이어서 UID 대신 단순 아이디(문서 ID)가 넘어온 경우 역추적
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

// 🚀 2. 신규 기능: Gemini AI 기반 피드백 자동 정제 엔진
exports.refineFeedback = onCall(async (request) => {
    // 보안: 로그인한 사용자(관리자/조교)만 AI 서버를 호출할 수 있도록 통제
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "로그인한 사용자만 AI를 사용할 수 있습니다.");
    }

    const rawText = request.data.rawText;
    if (!rawText) {
        throw new HttpsError("invalid-argument", "정제할 텍스트가 없습니다.");
    }

    try {
        // .env 파일에서 숨겨둔 API 키를 안전하게 불러옴
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("서버에 GEMINI_API_KEY가 설정되지 않았습니다.");
        }

        // Gemini AI 모델 초기화 (가장 빠르고 가성비 좋은 1.5-flash 모델 사용)
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 원장님급 퀄리티를 뽑아내기 위한 프롬프트 엔지니어링
        const prompt = `
            당신은 대한민국 최고 수준의 프리미엄 학원의 교육 전문가이자 원장님입니다. 
            학원 조교가 작성한 아래의 날것의 클리닉 피드백을 학부모님께 바로 발송할 수 있도록, 
            매우 정중하고 전문적이며 신뢰감을 주는 어투로 다듬어주세요. 
            단, 원본의 사실(문제점 등)은 절대 왜곡하거나 과장하지 마세요. 불필요한 인사말 없이 정제된 본문만 출력하세요.

            원본 피드백:
            "${rawText}"
        `;

        // AI 호출 및 답변 생성
        const result = await model.generateContent(prompt);
        const refinedText = result.response.text();

        return { refinedText: refinedText.trim() };
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new HttpsError("internal", "AI 정제 중 서버 오류가 발생했습니다.");
    }
});