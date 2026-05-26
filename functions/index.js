// 최신 2세대(v2) 파이어베이스 함수 및 파이어베이스 어드민 라이브러리
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore"); 
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const APP_ID = 'imperial-clinic-v1';

// ============================================================================
// [기능 1] 관리자 비밀번호 강제 초기화
// ============================================================================
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

// ============================================================================
// [기능 2] Gemini AI 기반 학부모 피드백 문장 자동 정제 엔진 
// ============================================================================
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
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

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
            result = await model.generateContent(prompt);
        } catch (fallbackError) {
            console.warn("🔥 3.5-flash 모델 호출 실패. 3.1 Pro 모델로 자동 우회합니다.", fallbackError);
            const fallbackModel = genAI.getGenerativeModel({ model: "gemini-3.1-pro" });
            result = await fallbackModel.generateContent(prompt);
        }

        return { refinedText: result.response.text().trim() };
    } catch (error) {
        console.error("🔥 [Gemini API 정밀 에러 로그]:", error);
        throw new HttpsError("internal", `AI API 오류 발생: ${error.message}`);
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

// ============================================================================
// [기능 4] 클리닉 하루 전날 밤 10시 리마인드 자동 발송 (Cron 스케줄러)
// ============================================================================
exports.clinicReminderCron = onSchedule({
    schedule: "0 22 * * *", // 매일 밤 22시 00분
    timeZone: "Asia/Seoul", // 한국 시간 기준
    timeoutSeconds: 300,
    memory: "512MiB"
}, async (event) => {
    try {
        const db = admin.firestore();

        // 1. 서버 시간을 KST(한국 시간)로 변환하여 내일 날짜 계산
        const now = new Date();
        const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000);
        const kstTime = new Date(utcNow + (9 * 3600000));
        kstTime.setDate(kstTime.getDate() + 1); // 하루 더하기 (내일)
        
        const tomorrowStr = `${kstTime.getFullYear()}-${String(kstTime.getMonth() + 1).padStart(2, '0')}-${String(kstTime.getDate()).padStart(2, '0')}`;
        
        console.log(`[예약발송 시작] ${tomorrowStr} 일자 클리닉 리마인드 대상자 조회 중...`);

        // 2. 내일 날짜로 예정된 '승인(confirmed)' 상태의 클리닉만 색출
        const sessionsSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/sessions`)
            .where('date', '==', tomorrowStr)
            .where('status', '==', 'confirmed')
            .get();

        if (sessionsSnapshot.empty) {
            console.log("발송할 리마인드 대상이 없습니다.");
            return null;
        }

        // 3. 연락처 매칭을 위해 전체 유저 정보 로드
        const usersSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/users`).get();
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const batch = db.batch();
        let count = 0;

        sessionsSnapshot.forEach(docSnap => {
            const session = docSnap.data();
            
            // 번호 찾기 알고리즘 (학부모 > 학생 본인 > 수기 입력 번호)
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
            if (!targetPhone && session.studentPhone) {
                targetPhone = session.studentPhone;
            }

            if (targetPhone) {
                const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
                
                // 종료 시간이 없으면 시작 시간 + 1시간으로 자동 계산
                const endTime = session.endTime || String(parseInt((session.startTime||'00:00').split(':')[0])+1).padStart(2,'0')+':00';
                
                // 템플릿 조립
                const message = `[목동임페리얼학원]\n${session.studentName || '학생'} 학생, 내일은 클리닉이 있는 날입니다! ⏰\n\n[내일 클리닉 안내]\n- 일시 : 내일(${session.date}) ${session.startTime}~${endTime}\n- 장소 : 본관 ${session.classroom || '미정'}\n- 내용 : ${session.topic || '개별 클리닉'}\n\n담당 선생님께서 ${session.studentName || '학생'} 학생을 위해 비워두신 시간입니다. 늦거나 무단결석 시 페널티가 부여될 수 있으니 꼭 시간 맞춰 등원해 주세요. 내일 만나요! 😊`;

                const outboxRef = db.collection(`artifacts/${APP_ID}/public/data/sms_outbox`).doc();
                batch.set(outboxRef, {
                    phoneNumber: cleanPhone,
                    message: message,
                    status: 'pending',
                    type: 'clinic_reminder',
                    studentName: session.studentName || '알수없음',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                count++;
            }
        });

        // 4. 대기열(sms_outbox)에 일괄 삽입
        if (count > 0) {
            await batch.commit();
            console.log(`[예약발송 완료] 총 ${count}건의 내일자 리마인드 문자가 대기열에 성공적으로 등록되었습니다!`);
        }

    } catch (error) {
        console.error("🔥 예약 발송(Cron) 에러:", error);
    }
    return null;
});

// ============================================================================
// 🚀 [기능 5] 입시 내비게이터용 성적표 파싱 (과목명 괄호 삭제 및 합계 점수 추출 완벽 지원)
// ============================================================================
exports.parseReportCard = onCall({ timeoutSeconds: 120, memory: "1GiB" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    }
    
    const { fileData, type } = request.data; // fileData는 base64 형태의 문자열
    if (!fileData) {
        throw new HttpsError("invalid-argument", "업로드된 파일이 없습니다.");
    }

    try {
        const rawKey = process.env.GEMINI_API_KEY || "";
        const apiKey = rawKey.trim().replace(/['"]/g, ''); 
        
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // JSON을 명확하게 뱉어내도록 모델 세팅
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const mimeType = fileData.split(';')[0].split(':')[1];
        const base64String = fileData.split(',')[1];

        // 🚀 [CTO 패치] 원장님의 특별 지침이 완벽하게 들어간 최종 프롬프트
        const prompt = `
        첨부된 이미지는 대한민국의 ${type === 'school' ? '학교 내신' : '모의고사'} 성적표(또는 리로스쿨 성적표 캡처본)입니다.
        이 이미지에서 모든 과목별 성적 데이터를 추출하여 반드시 아래 포맷의 JSON 배열로 반환하세요.
        
        { "subjects": [ { "name": "과목명", "score": "원점수", "rank": "석차", "tiedRank": "동석차수", "total": "수강자수", "grade": "등급숫자" } ] }
        
        [특명 지침사항]
        1. 과목명(name): '공통국어1(3)' 처럼 괄호 안에 숫자가 있는 경우, 괄호와 숫자는 완전히 지우고 '공통국어1'만 추출하세요.
        2. 원점수(score): 학교 내신 성적표(종이/리로스쿨)의 경우, 단순 '원점수' 칸의 반올림된 숫자가 아니라, 반드시 소수점이 포함된 '합계' 또는 '합계점수' 칸에 적힌 점수를 우선적으로 추출하세요.
        3. 동석차(tiedRank): 표기된 경우 그 숫자를 추출하고, 표기가 없거나 공란이면 "1"을 기재하세요.
        4. rank는 '석차', total은 '수강자수' 또는 '응시자수'를 의미합니다.
        5. 모의고사일 경우 rank, tiedRank, total은 빈 문자열("")로 두셔도 좋습니다.
        6. OCR 노이즈가 있더라도 상식적인 '과목명'과 숫자를 정확히 파싱하세요.
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64String, mimeType: mimeType } }
        ]);

        return JSON.parse(result.response.text());
    } catch (error) {
        console.error("🔥 OCR 파싱 실패:", error);
        throw new HttpsError("internal", `성적표 분석 중 오류 발생: ${error.message}`);
    }
});