// 최신 2세대(v2) 파이어베이스 함수 및 파이어베이스 어드민 라이브러리
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore"); 
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const APP_ID = 'imperial-clinic-v1';

// 🚀 [CTO 패치] 확실한 API 키 로드 (여기에 원장님의 실제 키를 꼭 넣어주세요!)
const getGeminiKey = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        throw new Error("서버에 Gemini API Key가 입력되지 않았습니다. .env 파일을 확인해주세요.");
    }
    return key.trim().replace(/['"]/g, '');
};

// ============================================================================
// [기능 1] 관리자 비밀번호 강제 초기화 및 유령 계정 복구 엔진
// ============================================================================
exports.adminResetPassword = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "인증 티켓이 만료되었습니다. 다시 로그인 해주세요.");
  const { uid, newPassword, email } = request.data; 

  if (!newPassword || newPassword.length < 6) throw new HttpsError("invalid-argument", "비밀번호는 최소 6자리 이상이어야 합니다.");

  if (email) {
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(userRecord.uid, { password: newPassword });
      return { success: true, authUid: userRecord.uid, message: "기존 인증 계정 비밀번호 동기화 성공" };
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        const newUserRecord = await admin.auth().createUser({ email: email, password: newPassword, emailVerified: true });
        return { success: true, authUid: newUserRecord.uid, message: "유령 계정 인증소 복구 및 비밀번호 설정 성공" };
      }
      throw new HttpsError("unknown", error.message);
    }
  }

  try {
    await admin.auth().updateUser(uid, { password: newPassword });
    return { success: true, authUid: uid };
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      try {
        const fallbackEmail = `${uid}@imperial.com`;
        const userRecord = await admin.auth().getUserByEmail(fallbackEmail);
        await admin.auth().updateUser(userRecord.uid, { password: newPassword });
        return { success: true, authUid: userRecord.uid };
      } catch (fError) {
        throw new HttpsError("not-found", "인증 서버에서 계정을 식별할 수 없습니다. 이메일을 명시해 주세요.");
      }
    }
    throw new HttpsError("unknown", error.message);
  }
});

// ============================================================================
// [기능 2] Gemini AI 기반 학부모 피드백 문장 자동 정제 엔진 
// ============================================================================
exports.refineFeedback = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인한 사용자만 AI를 사용할 수 있습니다.");
    const rawText = request.data.rawText;
    if (!rawText) throw new HttpsError("invalid-argument", "정제할 텍스트가 없습니다.");
    
    try {
        const genAI = new GoogleGenerativeAI(getGeminiKey());
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            당신은 대한민국 최고 수준의 프리미엄 학원의 교육 전문가이자 원장님입니다. 
            학원 조교가 작성한 아래의 날것의 클리닉 피드백을 학부모님께 바로 발송할 수 있도록, 
            매우 정중하고 전문적이며 신뢰감을 주는 어투로 다듬어주세요. 
            단, 원본의 사실(문제점 등)은 절대 왜곡하거나 과장하지 마세요. 불필요한 인사말 없이 정제된 본문만 출력하세요.
            원본 피드백: "${rawText}"
        `;

        const result = await model.generateContent(prompt);
        return { refinedText: result.response.text().trim() };
    } catch (error) {
        console.error("🔥 Gemini API Error:", error);
        // 'internal' 대신 'failed-precondition'을 써야 프론트엔드에 진짜 에러 메시지가 뜹니다.
        throw new HttpsError("failed-precondition", `AI 정제 오류: ${error.message}`);
    }
});

// ============================================================================
// [기능 3] 통합 메시지 센터 FCM 오토 트리거 (학원폰 깨우기)
// ============================================================================
exports.onSmsOutboxCreated = onDocumentCreated(`artifacts/${APP_ID}/public/data/sms_outbox/{docId}`, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return null;
    const smsData = snapshot.data();

    if (smsData.status === "pending") {
        const pushMessage = {
            data: { action: "TRIGGER_SMS_SEND", docId: event.params.docId },
            topic: "imperial_sms_gateway" 
        };
        try {
            await admin.messaging().send(pushMessage);
        } catch (error) {
            console.error("🔥 FCM 백그라운드 무전 송신 실패:", error);
        }
    }
    return null;
});

// ============================================================================
// [기능 4] 클리닉 하루 전날 밤 10시 리마인드 자동 발송 (Cron 스케줄러)
// ============================================================================
exports.clinicReminderCron = onSchedule({
    schedule: "0 22 * * *", 
    timeZone: "Asia/Seoul", 
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (event) => {
    try {
        const db = admin.firestore();
        const now = new Date();
        const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000);
        const kstTime = new Date(utcNow + (9 * 3600000));
        kstTime.setDate(kstTime.getDate() + 1); 
        
        const tomorrowStr = `${kstTime.getFullYear()}-${String(kstTime.getMonth() + 1).padStart(2, '0')}-${String(kstTime.getDate()).padStart(2, '0')}`;
        
        const sessionsSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/sessions`).where('date', '==', tomorrowStr).where('status', '==', 'confirmed').get();
        if (sessionsSnapshot.empty) return null;

        const usersSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/users`).get();
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const batch = db.batch();
        let count = 0;

        sessionsSnapshot.forEach(docSnap => {
            const session = docSnap.data();
            let targetPhone = '';
            let targetStudentId = session.studentId;

            if (!targetStudentId && session.studentName) {
                const foundStudent = users.find(u => u.role === 'student' && u.name === session.studentName);
                if (foundStudent) targetStudentId = foundStudent.id;
            }
            
            if (targetStudentId) {
                const parentUser = users.find(u => u.role === 'parent' && u.linkedChildrenIds && u.linkedChildrenIds.includes(targetStudentId));
                if (parentUser && parentUser.phone) targetPhone = parentUser.phone;
                else {
                    const studentUser = users.find(u => u.id === targetStudentId);
                    if (studentUser && studentUser.phone) targetPhone = studentUser.phone;
                }
            }
            if (!targetPhone && session.studentPhone) targetPhone = session.studentPhone;

            if (targetPhone) {
                const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
                const endTime = session.endTime || String(parseInt((session.startTime||'00:00').split(':')[0])+1).padStart(2,'0')+':00';
                const message = `[목동임페리얼학원]\n${session.studentName || '학생'} 학생, 내일은 클리닉이 있는 날입니다! ⏰\n\n[내일 클리닉 안내]\n- 일시 : 내일(${session.date}) ${session.startTime}~${endTime}\n- 장소 : 본관 ${session.classroom || '미정'}\n- 내용 : ${session.topic || '개별 클리닉'}\n\n담당 선생님께서 ${session.studentName || '학생'} 학생을 위해 비워두신 시간입니다. 늦거나 무단결석 시 페널티가 부여될 수 있으니 꼭 시간 맞춰 등원해 주세요. 내일 만나요! 😊`;

                const outboxRef = db.collection(`artifacts/${APP_ID}/public/data/sms_outbox`).doc();
                batch.set(outboxRef, {
                    phoneNumber: cleanPhone, message: message, status: 'pending', type: 'clinic_reminder', studentName: session.studentName || '알수없음', createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                count++;
            }
        });

        if (count > 0) await batch.commit();
    } catch (error) {
        console.error("🔥 예약 발송(Cron) 에러:", error);
    }
    return null;
});

// ============================================================================
// [기능 5] 입시 내비게이터용 성적표 파싱 (과목명 괄호 삭제 및 합계 점수 추출)
// ============================================================================
exports.parseReportCard = onCall({ timeoutSeconds: 120, memory: "1GiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    const { fileData, type } = request.data; 
    if (!fileData) throw new HttpsError("invalid-argument", "업로드된 파일이 없습니다.");

    try {
        const genAI = new GoogleGenerativeAI(getGeminiKey());
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const mimeType = fileData.split(';')[0].split(':')[1];
        const base64String = fileData.split(',')[1];

        const prompt = `
        첨부된 이미지는 대한민국의 ${type === 'school' ? '학교 내신' : '모의고사'} 성적표입니다.
        과목별 성적 데이터를 추출하여 {"subjects": [{"name": "과목명", "score": "원점수", "rank": "석차", "tiedRank": "동석차수", "total": "수강자수", "grade": "등급숫자"}]} 포맷의 JSON 배열로 반환하세요.
        1. 과목명의 괄호 속 숫자는 완전히 지우세요.
        2. 소수점이 포함된 '합계' 점수를 우선 추출하세요.
        3. 동석차가 없으면 1을 기재하세요.
        4. rank는 석차, total은 수강자수를 의미합니다.
        `;

        const result = await model.generateContent([ prompt, { inlineData: { data: base64String, mimeType: mimeType } } ]);
        return JSON.parse(result.response.text());
    } catch (error) {
        console.error("🔥 OCR 파싱 실패:", error);
        throw new HttpsError("failed-precondition", `성적표 분석 오류: ${error.message}`);
    }
});

// ============================================================================
// [기능 6] 텔레그램 봇 보안 알림 전송 (프론트엔드 은닉용)
// ============================================================================
exports.sendTelegramAlert = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) return { success: false, message: "환경변수 누락" };
    const text = request.data.text;
    if (!text) throw new HttpsError("invalid-argument", "메시지가 없습니다.");

    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: text })
        });
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        console.error("텔레그램 발송 실패:", error);
        throw new HttpsError("internal", "텔레그램 전송 중 서버 오류");
    }
});

// ============================================================================
// [기능 7] 데이터 연쇄 청소기 (유저 삭제 시 Auth 동반 삭제 트리거)
// ============================================================================
exports.onUserDeleted = onDocumentDeleted(`artifacts/${APP_ID}/public/data/users/{userId}`, async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const deletedUser = snap.data();
    const targetAuthUid = deletedUser.authUid;

    try {
        if (targetAuthUid && targetAuthUid !== 'legacy_verified_account') {
            await admin.auth().deleteUser(targetAuthUid);
        } else {
            const fallbackEmail = `${event.params.userId}@imperial.com`;
            const userRecord = await admin.auth().getUserByEmail(fallbackEmail);
            await admin.auth().deleteUser(userRecord.uid);
        }
    } catch (error) { /* 무시 */ }
    return null;
});

// ============================================================================
// 🚀 [기능 8] Gemini Vision AI 기반 시험지 자동 스캐너
// ============================================================================
exports.analyzeExamPaper = onCall({ timeoutSeconds: 300, memory: "1GiB", region: "asia-northeast3" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

    const { fileBase64, mimeType, year, grade, subject } = request.data;

    const numYear = parseInt(year);
    const numGrade = parseInt(grade.replace(/[^0-9]/g, '')) || 1;
    let is2022 = false;
    if (numYear >= 2026 && numGrade <= 2) is2022 = true;
    else if (numYear >= 2027) is2022 = true;

    const taxonomyGuide = is2022 ? 
        `[2022 개정 교육과정 적용] 단원명은 반드시 다음 중 하나여야 함: 
        (대수): 지수와 로그, 지수함수와 로그함수, 지수함수와 로그함수의 활용, 삼각함수, 삼각함수의 그래프, 삼각함수의 활용, 등차수열과 등비수열, 수열의 합, 수학적 귀납법
        (미적분I): 함수의 극한, 함수의 연속, 미분계수와 도함수, 도함수의 활용, 부정적분, 정적분, 정적분의 활용
        (기하): 이차곡선, 이차곡선의 접선, 평면벡터, 공간도형, 공간좌표, 공간벡터` 
        : 
        `[2015 개정 교육과정 적용] 단원명은 반드시 다음 중 하나여야 함:
        (수학I): 지수와 로그, 지수함수와 로그함수, 지수함수와 로그함수의 활용, 삼각함수, 삼각함수의 그래프, 삼각함수의 활용, 등차수열과 등비수열, 수열의 합, 수학적 귀납법
        (수학II): 함수의 극한, 함수의 연속, 미분계수와 도함수, 도함수의 활용, 부정적분, 정적분, 정적분의 활용`;

    const prompt = `
    당신은 대한민국 대치동 최고 수준의 고등학교 수학 입시 분석가입니다.
    첨부된 시험지(이미지/PDF)를 분석하여 아래의 JSON 구조로만 정확하게 답변하세요. 마크다운(\`\`\`json) 없이 순수 JSON 객체만 출력해야 합니다.
    
    학생 타겟: ${year}년도 ${grade} ${subject} 시험
    ${taxonomyGuide}
    
    [IDI: Imperial Difficulty Index 5대 지표 세부 측정 기준] (각 1~5점 부여)
    1) 출처 친숙도 (idiSource): 1(교과서)~5(특이 사설/신유형)
    2) 변형 로직 (idiLogic): 1(단순 숫자 변형)~5(킬러 하이브리드)
    3) 개념 결합도 (idiConcept): 1(단일 개념)~5(추상적 추론)
    4) 연산 복잡도 (idiCalc): 1(암산 3줄 이내)~5(극악 연산/케이스 분류)
    5) 논리 전개 (idiProg): 1(단방향)~5(발견적 추론)

    [출력 JSON 구조]
    {
      "review": "시험의 전반적인 난이도와 출제 경향을 3~4문장으로 요약 (출제자 노림수, 학생 심리 포함)",
      "gradeCuts": { "grade1": "1등급 예상(예: 88)", "grade2": "2등급 예상(예: 76)", "grade3": "3등급 예상(예: 62)" },
      "questions": [
        {
          "qNum": "문제번호 (예: 객관식1)",
          "score": "배점 (숫자만, 모르면 4.0)",
          "unit": "위 가이드라인에 맞는 단원명",
          "tags": "기본, 킬러 등 태그",
          "idiSource": 정수(1~5), "idiLogic": 정수, "idiConcept": 정수, "idiCalc": 정수, "idiProg": 정수,
          "source": "출처 예상",
          "analysis": "핵심 발상 분석 (1~2문장)"
        }
      ]
    }`;

    try {
        const genAI = new GoogleGenerativeAI(getGeminiKey());
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); 
        
        const imageParts = [{ inlineData: { data: fileBase64, mimeType: mimeType } }];
        
        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();
        
        const cleanJsonString = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJsonString);

    } catch (error) {
        console.error("🔥 Gemini API Error:", error);
        // 'internal' 대신 'failed-precondition'을 써야 프론트엔드에 진짜 에러 메시지가 뜹니다.
        throw new HttpsError('failed-precondition', `AI 분석 중단됨: ${error.message}`);
    }
});