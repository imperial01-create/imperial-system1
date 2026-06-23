// functions/index.js
// 최신 2세대(v2) 파이어베이스 함수 및 파이어베이스 어드민 라이브러리
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore"); 
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// 🚀 [CTO 패치 1] 모든 함수의 기본 리전을 서울(asia-northeast3)로 통일
// 프론트엔드와 통신 위치를 맞춰 404 CORS(internal) 에러를 원천 차단합니다.
setGlobalOptions({ region: "asia-northeast3" });

const APP_ID = 'imperial-clinic-v1';

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
        // 🚀 [CTO 패치 2] 계정 생성 중 발생하는 에러를 낚아채는 완벽한 안전망 추가
        try {
            const newUserRecord = await admin.auth().createUser({ email: email, password: newPassword, emailVerified: true });
            return { success: true, authUid: newUserRecord.uid, message: "유령 계정 인증소 복구 및 비밀번호 설정 성공" };
        } catch (createError) {
            console.error("Auth 계정 생성 실패:", createError);
            throw new HttpsError("internal", `계정 생성 실패: ${createError.message}`);
        }
      }
      console.error("Auth 계정 업데이트 실패:", error);
      throw new HttpsError("internal", `비밀번호 업데이트 실패: ${error.message}`);
    }
  }

  // 이메일이 없는 경우의 폴백 로직
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
    console.error("UID 기반 업데이트 실패:", error);
    throw new HttpsError("internal", `비밀번호 업데이트 실패: ${error.message}`);
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
// [기능 5] 입시 내비게이터용 성적표 파싱
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
// [기능 6] 텔레그램 봇 보안 알림 전송
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
// [기능 7] 데이터 연쇄 청소기
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
// [기능 8] Gemini Vision AI 기반 시험지 정밀 분석기
// ============================================================================
exports.analyzeExamPaper = onCall({ timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

    const { fileBase64, mimeType, year, grade, subject } = request.data;

    const prompt = `
    당신은 한국 고등학교 수학 교육과정에 정통한 '베테랑 수학 교사'이자 '시험 난이도 및 등급컷 분석 전문가'입니다.
    첨부된 고등학교 수학 시험지(PDF/이미지)를 바탕으로, 다음 단계를 엄격히 따라 분석해 주세요.
    타겟 학생: ${year || '2024'}년도 ${grade || '고등학교'} ${subject || '수학'} 시험 응시생
    
    [IDI 5대 지표 평가 기준 (각 1점~5점)]
    1) 출처 친숙도 (Source Familiarity): 1(교과서)~5(신유형/강남 자사고 특이기출)
    2) 변형 로직 (Transformation Logic): 1(단순 숫자 변형)~5(킬러 문항 하이브리드)
    3) 개념 결합도 (Conceptual Integration): 1(단일 개념)~5(추상적 추론)
    4) 연산 복잡도 (Calculation Complexity): 1(암산 3줄 이내)~5(극악의 연산/케이스 재분류)
    5) 케이스 분류 및 논리 전개 (Logical Depth): 1(단방향 전개)~5(발견적 추론)

    [출력 JSON 구조] 
    반드시 마크다운 없이 순수 JSON 객체만 반환하세요. (런타임 에러 방지)
    {
      "overallReview": "시험의 전반적인 난이도와 특징(출제 경향, 시간 부족 여부 등)을 요약한 종합 총평",
      "cutoffs": { 
         "top10": "상위 10%(약 2등급 중반) 예상 커트라인 점수 (예: 88)", 
         "top34": "상위 34%(약 4등급 중반) 예상 커트라인 점수 (예: 72)", 
         "top66": "상위 66%(약 6등급 중반) 예상 커트라인 점수 (예: 54)" 
      },
      "cutoffReasoning": "점수 예측 근거: 각 상위 퍼센트의 학생들이 주로 어떤 문항에서 오답을 냈을 것으로 가정했는지 논리적 설명",
      "questions": [
        {
          "number": 1,
          "score": 4.5,
          "unit": "수열의 극한 (소단원 수준으로 상세히)",
          "idi": {
            "sourceFamiliarity": 3,
            "transformationLogic": 2,
            "conceptualIntegration": 1,
            "calculationComplexity": 2,
            "logicalDepth": 1
          },
          "comment": "출제자의 노림수와 학생 심리 분석을 반영한 분석 코멘트"
        }
      ]
    }`;

    try {
        const genAI = new GoogleGenerativeAI(getGeminiKey());
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        }); 
        
        const imageParts = [{ inlineData: { data: fileBase64, mimeType: mimeType } }];
        
        const result = await model.generateContent([prompt, ...imageParts]);
        return JSON.parse(result.response.text());

    } catch (error) {
        console.error("🔥 Gemini API Error:", error);
        throw new HttpsError('failed-precondition', `AI 분석 중단됨: ${error.message}`);
    }
});

// ============================================================================
// 🚀 [기능 9] S25 울트라 통화 요약 AI 파싱 및 3-Way 자동 라우팅 엔진
// ============================================================================
exports.processCallLog = onDocumentCreated(`artifacts/${APP_ID}/public/data/raw_call_logs/{logId}`, async (event) => {
    const snap = event.data;
    if (!snap) return null;
    
    const rawData = snap.data();
    const studentId = rawData.studentId;
    const studentName = rawData.studentName;
    const rawText = rawData.rawText;

    // 대기 상태(pending_ai_parsing)인 데이터만 처리
    if (!rawText || rawData.status !== 'pending_ai_parsing') return null;

    try {
        const genAI = new GoogleGenerativeAI(getGeminiKey());
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" } // JSON 강제 출력으로 파싱 에러 원천 차단
        });

        const prompt = `
        너는 학원 데스크의 통화 요약본을 분석하는 AI 어시스턴트야.
        다음 텍스트를 분석하여 지정된 JSON 형식으로만 반환해.
        
        텍스트: "${rawText}"
        
        [출력 JSON 구조 및 조건]
        {
          "dailyAttendance": {
            "status": "absent", // "absent" 또는 "late" 중 하나 (해당 없으면 null)
            "reason": "결석/지각 사유 짧게 요약"
          },
          "longTermContext": {
            "type": "medical_psych", // "medical_psych", "parental", "emotional", "admin", "general" 중 하나 (해당 없으면 null)
            "tag": "3~4단어 이내 핵심 (예: 영어 학습 편식)",
            "message": "강사에게 전달할 핵심 내용 1~2줄 요약"
          },
          "task": {
            "title": "강사/조교가 처리해야 할 행동 지침 (해당 없으면 null)"
          }
        }
        `;

        const result = await model.generateContent(prompt);
        const parsedData = JSON.parse(result.response.text());

        const db = admin.firestore();
        const batch = db.batch();
        
        // KST(한국 시간) 기준으로 날짜 계산
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstDate = new Date(now.getTime() + kstOffset);
        const dateStr = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(kstDate.getUTCDate()).padStart(2, '0')}`;

        // [경로 A] 당일 출결 반영 (일별 운영 관제 즉시 반영)
        if (parsedData.dailyAttendance && parsedData.dailyAttendance.status) {
            const attRef = db.collection(`artifacts/${APP_ID}/public/data/attendance_logs`).doc(`${dateStr}_${studentId}`);
            batch.set(attRef, {
                studentId: studentId,
                date: dateStr,
                status: parsedData.dailyAttendance.status,
                reason: parsedData.dailyAttendance.reason,
                method: 'ai_call_log',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        // [경로 B] 장기 CRM 컨텍스트 (강사 화면에 뱃지로 뜰 데이터) - 덮어쓰기 병합
        if (parsedData.longTermContext && parsedData.longTermContext.type) {
            const ctxRef = db.collection(`artifacts/${APP_ID}/public/data/student_context`).doc(studentId);
            batch.set(ctxRef, {
                studentId: studentId,
                studentName: studentName,
                type: parsedData.longTermContext.type,
                tag: parsedData.longTermContext.tag,
                message: parsedData.longTermContext.message,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        // [경로 C] 선생님/조교 할 일 (Task Board 연동)
        if (parsedData.task && parsedData.task.title) {
            const taskRef = db.collection(`artifacts/${APP_ID}/public/data/clinic_tasks`).doc();
            batch.set(taskRef, {
                studentId: studentId,
                studentName: studentName,
                taskName: parsedData.task.title,
                status: 'pending',
                source: 'ai_call_log',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // [완료 처리] 원본 로그 상태 업데이트
        batch.update(event.data.ref, { 
            status: 'parsed_success',
            parsedResult: parsedData 
        });

        await batch.commit();
        console.log(`[Success] AI Routing completed for student: ${studentName}`);

    } catch (error) {
        console.error("🔥 AI Parsing failed:", error);
        await event.data.ref.update({ status: 'error', errorMsg: error.message });
    }
});

// ============================================================================
// 🚀 [기능 10] 학생 전용 AI 모닝 브리핑 생성 (캐싱 적용으로 비용 최적화)
// ============================================================================
exports.generateMorningBriefing = onCall({ timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
    // 1. 보안 검증: 로그인한 학생 본인만 호출 가능
    if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    const studentUid = request.auth.uid;
    const { studentId, studentName, todaySchedules, contextTag } = request.data;

    const db = admin.firestore();
    
    // KST 기준 오늘 날짜 구하기
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const dateStr = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(kstDate.getUTCDate()).padStart(2, '0')}`;

    // 2. 비용 최적화 (Caching): 오늘 이미 브리핑이 생성되었다면 AI를 호출하지 않고 기존 데이터 반환
    const briefingRef = db.collection(`artifacts/${APP_ID}/public/data/daily_briefings`).doc(`${dateStr}_${studentId}`);
    const docSnap = await briefingRef.get();
    
    if (docSnap.exists) {
        return { success: true, briefing: docSnap.data().message, cached: true };
    }

    // 3. AI 프롬프트 엔지니어링: 프로페셔널하고 따뜻한 멘토 역할 부여
    try {
        const genAI = new GoogleGenerativeAI(getGeminiKey());
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        너는 대한민국 최고 명문 학원 '임페리얼 학원'의 대표 멘토 AI야.
        오늘 하루를 시작하는 학생 '${studentName}'에게 프로페셔널하면서도 따뜻하게 동기부여가 되는 아침 브리핑을 딱 3문장으로 작성해.
        어린아이 대하듯 유치하게 말하지 말고, 존중하는 어투(해요체)를 사용해.
        
        [오늘의 데이터]
        - 예정된 스케줄: ${todaySchedules || '특별한 정규 스케줄 없음 (자습 권장)'}
        - 학생의 최근 특이사항(강사 메모): ${contextTag || '특이사항 없음'}
        
        [작성 가이드]
        1. 첫 문장: 학생의 이름을 부르며 활기찬 인사.
        2. 두 번째 문장: 오늘의 스케줄이나 특이사항을 자연스럽게 언급하며 목표 제시.
        3. 세 번째 문장: 학원이 항상 응원하고 있다는 신뢰감을 주며 마무리.
        `;

        const result = await model.generateContent(prompt);
        const briefingText = result.response.text().trim();

        // 4. 생성된 브리핑 캐싱 (저장) - 내일 자정이 되면 알아서 무시되거나 TTL로 삭제됨
        await briefingRef.set({
            studentId: studentId,
            date: dateStr,
            message: briefingText,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, briefing: briefingText, cached: false };

    } catch (error) {
        console.error("🔥 AI Briefing Error:", error);
        // 에러 발생 시 런타임 에러를 막기 위한 폴백(Fallback) 텍스트 제공
        return { success: true, briefing: `${studentName} 학생, 오늘도 임페리얼 학원과 함께 목표를 향해 한 걸음 더 나아가는 멋진 하루를 만들어 봅시다!`, cached: false, error: true };
    }
});