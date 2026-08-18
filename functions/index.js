/* =========================================================================
   [서비스 가치(Service Value)]
   임페리얼 학원 통합 백엔드 코어 (Firebase Functions v2)
   🚀 가치 1: AI, 메시징, 데이터 정리 로직을 하나의 서버리스 아키텍처로 통합.
   🚀 가치 2: 모든 외부 통신(Gemini, Telegram) 토큰을 서버에 격리하여 100% 보안 유지.
   🚀 가치 3: 불필요한 레거시(GitHub Proxy) 로직을 제거하여 Cold Start 속도를 극대화.
   ========================================================================= */

const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 🚀 [CTO 패치] Firebase Params API 임포트 (확정적 환경변수 로딩)
const { defineString } = require("firebase-functions/params");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// 🚀 [CTO 패치] CORS 원천 차단 및 리전 통일
// cors: true 를 설정하여 브라우저의 OPTIONS(Preflight) 요청이 거부되는 현상을 방지합니다.
setGlobalOptions({ 
    region: "asia-northeast3",
    cors: true 
});

const APP_ID = 'imperial-clinic-v1';

// 🚀 [CTO 패치] 환경변수 선언: 배포 시점에 값을 강제로 검증합니다. 
// (사용하지 않는 GITHUB 관련 변수 제거 완료하여 런타임 에러 방지)
const geminiApiKey = defineString('GEMINI_API_KEY');
const telegramBotToken = defineString('TELEGRAM_BOT_TOKEN', { default: '' });
const telegramChatId = defineString('TELEGRAM_CHAT_ID', { default: '' });

// 공공데이터포털(한국천문연구원 특일 정보) 인증키. 공휴일을 서버가 받아온다.
const dataGoKrKey = defineString('DATA_GO_KR_KEY', { default: '' });

// 온톨로지 원본 저장소(비공개) 접근용. 토큰은 서버에만 존재한다.
const githubToken = defineString('REACT_APP_GITHUB_TOKEN', { default: '' });
const githubOwner = defineString('REACT_APP_GITHUB_REPO_OWNER', { default: '' });
const githubRepo = defineString('REACT_APP_GITHUB_REPO_NAME', { default: '' });

// [유틸리티] Gemini API Key 로드
const getGeminiKey = () => {
    const key = geminiApiKey.value();
    if (!key) {
        throw new Error("서버에 Gemini API Key가 입력되지 않았습니다. .env 파일을 확인해주세요.");
    }
    return key.trim().replace(/['"]/g, '');
};

// ============================================================================
// [보안 유틸리티] 호출자 신원 및 권한 검증
// onCall 함수는 '로그인 여부'만으로는 안전하지 않다. 반드시 역할까지 확인한다.
// ============================================================================
const crypto = require("crypto");

const STAFF_ROLES = ['admin', 'admin_assistant', 'lecturer', 'ta'];
const DESK_ROLES = ['admin', 'admin_assistant'];

// 다른 사람이 선점하면 권한 상승으로 이어지는 예약 아이디
const RESERVED_USER_IDS = [
    'admin', 'master', 'owner', 'director', 'root', 'system',
    'imperialsys01', 'superuser', 'manager',
    // 문자 게이트웨이 전용 계정. 남이 선점하면 학원 문자 발송함을 가져간다.
    'smsgw', 'gateway', 'sms'
];

// 문자 게이트웨이(안드로이드 앱) 전용 계정의 로그인 아이디
const GATEWAY_ID = 'smsgw';

const toSafeId = (raw) =>
    encodeURIComponent(String(raw || '')).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();

const usersCol = () => admin.firestore().collection(`artifacts/${APP_ID}/public/data/users`);

/** 호출한 사용자의 Firestore 프로필을 조회한다. (문서 ID = safeId, 없으면 uid로 재시도) */
const getCallerProfile = async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const email = (request.auth.token && request.auth.token.email) || '';
    const safeId = email.split('@')[0];

    let snap = safeId ? await usersCol().doc(safeId).get() : null;
    if (!snap || !snap.exists) snap = await usersCol().doc(request.auth.uid).get();
    if (!snap.exists) return { id: safeId || request.auth.uid, role: 'none' };
    return { id: snap.id, ...snap.data() };
};

const assertRole = async (request, allowed, message) => {
    const profile = await getCallerProfile(request);
    if (!allowed.includes(profile.role)) {
        throw new HttpsError("permission-denied", message || "이 작업을 수행할 권한이 없습니다.");
    }
    return profile;
};

const assertStaff = (request) => assertRole(request, STAFF_ROLES, "교직원만 사용할 수 있는 기능입니다.");
const assertDesk = (request) => assertRole(request, DESK_ROLES, "관리자/행정조교만 사용할 수 있는 기능입니다.");

/** 문자 발송함에 적재 (서버 전용 경로) */
const queueSms = (batchOrDb, phoneNumber, message, type, studentName) => {
    const ref = admin.firestore().collection(`artifacts/${APP_ID}/public/data/sms_outbox`).doc();
    const payload = {
        phoneNumber: String(phoneNumber || '').replace(/[^0-9]/g, ''),
        message,
        status: 'pending',
        type,
        studentName: studentName || '시스템',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (batchOrDb && typeof batchOrDb.set === 'function' && batchOrDb.commit) {
        batchOrDb.set(ref, payload);
        return ref;
    }
    return ref.set(payload).then(() => ref);
};

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/* ────────────────────────────────────────────────────────────────────────────
   [비용 방어] 호출 횟수 제한기
   Gemini·문자처럼 건당 돈이 나가는 기능은 '누가 부를 수 있는가'만으로는 부족하다.
   정상 사용자 한 명이 스크립트를 돌려도 요금이 폭증하기 때문에 횟수 자체를 막는다.
   저장 위치(ai_quota)는 보안 규칙에 없는 컬렉션이라 서버(admin SDK)만 접근한다.
   ──────────────────────────────────────────────────────────────────────────── */
const QUOTA_PATH = `artifacts/${APP_ID}/public/data/ai_quota`;

const consumeQuota = async (key, limit, windowMs, message) => {
    const ref = admin.firestore().doc(`${QUOTA_PATH}/${toSafeId(key)}`);
    const now = Date.now();
    await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : null;
        const fresh = !d || (now - (d.windowStart || 0) >= windowMs);
        const windowStart = fresh ? now : d.windowStart;
        const count = (fresh ? 0 : (d.count || 0)) + 1;
        if (count > limit) throw new HttpsError("resource-exhausted", message);
        tx.set(ref, { windowStart, count, updatedAt: now }, { merge: true });
    });
};

/** 비밀번호 초기화·조회 대상을 실제 사용자 문서로 특정한다. */
const findUserDoc = async ({ uid, email }) => {
    if (email) {
        const safeId = String(email).split('@')[0];
        const s = await usersCol().doc(safeId).get();
        if (s.exists) return { id: s.id, ...s.data() };
    }
    if (uid) {
        const s = await usersCol().doc(uid).get();
        if (s.exists) return { id: s.id, ...s.data() };
        const q = await usersCol().where('authUid', '==', uid).limit(1).get();
        if (!q.empty) return { id: q.docs[0].id, ...q.docs[0].data() };
    }
    return null;
};

// ============================================================================
// [기능 1] 관리자 비밀번호 강제 초기화 및 유령 계정 복구 엔진
// ============================================================================
exports.adminResetPassword = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "인증 티켓이 만료되었습니다. 다시 로그인 해주세요.");
  // 🔒 [보안 패치] 기존에는 로그인만 하면 누구나 타인의 비밀번호를 바꿀 수 있었다.
  const caller = await assertDesk(request);
  const { uid, newPassword, email } = request.data;

  if (!newPassword || newPassword.length < 6) throw new HttpsError("invalid-argument", "비밀번호는 최소 6자리 이상이어야 합니다.");

  /* 🔒 [보안 패치] '데스크면 누구나' 였던 것을 '누구의 비밀번호인가'까지 본다.
     이 검사가 없으면 행정조교가 원장 계정의 비밀번호를 바꿔 시스템을 통째로 가져갈 수 있고,
     아래 '유령 계정 복구' 경로로 존재하지 않는 이메일의 인증 계정을 마음대로 찍어낼 수 있었다. */
  if (caller.role !== 'admin') {
      const target = await findUserDoc({ uid, email });
      if (!target) {
          throw new HttpsError("permission-denied", "등록된 사용자만 초기화할 수 있습니다. 관리자에게 문의해주세요.");
      }
      if (!['student', 'parent'].includes(target.role)) {
          throw new HttpsError("permission-denied", "행정조교는 학생/학부모 계정만 초기화할 수 있습니다.");
      }
  }

  if (email) {
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(userRecord.uid, { password: newPassword });
      return { success: true, authUid: userRecord.uid, message: "기존 인증 계정 비밀번호 동기화 성공" };
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
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
    // 💰 [비용 보호] Gemini 호출은 건당 과금된다. 교직원만 사용할 수 있게 제한한다.
    await assertStaff(request);
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
    /* 💰 [비용 보호] 이 함수는 Gemini 비전 모델을 부르므로 호출 1건마다 돈이 나간다.
       예전에는 '로그인만 하면' 누구나 무제한으로 이미지를 밀어 넣을 수 있었다.
       입시 내비게이터는 학생·학부모·데스크가 쓰는 화면이라 역할로 완전히 막을 수는 없으니,
       화면에 접근 가능한 역할로 좁히고 하루 호출 횟수를 함께 제한한다. */
    const caller = await assertRole(request, ['admin', 'admin_assistant', 'student', 'parent'],
        "성적표 분석을 사용할 수 없는 계정입니다.");
    await consumeQuota(`ocr_${caller.id}`, 20, 24 * 60 * 60 * 1000,
        "오늘 성적표 분석 가능 횟수(20회)를 모두 사용했습니다. 내일 다시 시도해주세요.");

    const { fileData, type } = request.data;
    if (!fileData) throw new HttpsError("invalid-argument", "업로드된 파일이 없습니다.");
    if (String(fileData).length > 8 * 1024 * 1024) {
        throw new HttpsError("invalid-argument", "이미지 용량이 너무 큽니다. 8MB 이하로 올려주세요.");
    }

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

    /* 🔒 [보안 패치] 봇 토큰은 서버에만 존재한다. (기존에는 PickupRequest.js에 하드코딩되어
       브라우저 번들로 공개되었다.)
       학생도 클리닉 예약 시 알림을 보내야 하므로 역할로 막지는 않되,
       익명 스팸을 막기 위해 보낸 사람을 서버가 직접 붙이고 길이를 제한한다. */
    const sender = await getCallerProfile(request);

    const botToken = telegramBotToken.value();
    const chatId = telegramChatId.value();
    if (!botToken || !chatId) return { success: false, message: "환경변수 누락" };

    const rawText = String(request.data?.text || '').slice(0, 3000);
    if (!rawText.trim()) throw new HttpsError("invalid-argument", "메시지가 없습니다.");

    const text = `${rawText}\n\n— 보낸 사람: ${sender.name || '이름없음'} (${sender.role || 'unknown'} / ${sender.id})`;

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
    // 💰 [비용 보호] 시험지 전체를 Vision 모델에 넣는 가장 비싼 호출이다. 교직원 전용.
    await assertStaff(request);

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

    if (!rawText || rawData.status !== 'pending_ai_parsing') return null;

    try {
        const genAI = new GoogleGenerativeAI(getGeminiKey());
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" } 
        });

        const prompt = `
        너는 학원 데스크의 통화 요약본을 분석하는 AI 어시스턴트야.
        다음 텍스트를 분석하여 지정된 JSON 형식으로만 반환해.
        
        텍스트: "${rawText}"
        
        [출력 JSON 구조 및 조건]
        {
          "dailyAttendance": {
            "status": "absent", 
            "reason": "결석/지각 사유 짧게 요약"
          },
          "longTermContext": {
            "type": "medical_psych", 
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
        
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstDate = new Date(now.getTime() + kstOffset);
        const dateStr = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(kstDate.getUTCDate()).padStart(2, '0')}`;

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
    if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    const { todaySchedules, contextTag } = request.data || {};

    /* 💰 [비용 보호] 예전에는 브라우저가 보낸 studentId 로 캐시 문서 이름을 만들었다.
       studentId 를 매번 아무 값으로 바꾸면 캐시가 항상 빗나가 Gemini 가 무한히 호출됐고,
       남의 이름으로 브리핑을 만들어 넣는 것도 가능했다. 이제 서버가 호출자 본인으로 정한다. */
    const caller = await getCallerProfile(request);
    let studentId = caller.id;
    let studentName = caller.name || '학생';

    // 학부모는 '연결된 자녀'의 브리핑만 볼 수 있다.
    const requestedId = String(request.data?.studentId || '').trim();
    if (caller.role === 'parent' && requestedId && requestedId !== caller.id) {
        const kids = Array.isArray(caller.linkedChildrenIds) ? caller.linkedChildrenIds : [];
        if (!kids.includes(requestedId)) {
            throw new HttpsError("permission-denied", "연결된 자녀의 브리핑만 볼 수 있습니다.");
        }
        studentId = requestedId;
        const kidSnap = await usersCol().doc(requestedId).get();
        studentName = kidSnap.exists ? (kidSnap.data().name || '학생') : '학생';
    }

    const db = admin.firestore();
    
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const dateStr = `${kstDate.getUTCFullYear()}-${String(kstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(kstDate.getUTCDate()).padStart(2, '0')}`;

    const briefingRef = db.collection(`artifacts/${APP_ID}/public/data/daily_briefings`).doc(`${dateStr}_${studentId}`);
    const docSnap = await briefingRef.get();
    
    if (docSnap.exists) {
        return { success: true, briefing: docSnap.data().message, cached: true };
    }

    // 캐시가 비었을 때만 AI를 부른다. 하루 5회를 넘기면 더 이상 돈을 쓰지 않는다.
    await consumeQuota(`brief_${studentId}`, 5, 24 * 60 * 60 * 1000,
        "오늘의 브리핑은 이미 생성되었습니다. 잠시 후 다시 확인해주세요.");

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

        await briefingRef.set({
            studentId: studentId,
            date: dateStr,
            message: briefingText,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, briefing: briefingText, cached: false };

    } catch (error) {
        console.error("🔥 AI Briefing Error:", error);
        return { success: true, briefing: `${studentName} 학생, 오늘도 임페리얼 학원과 함께 목표를 향해 한 걸음 더 나아가는 멋진 하루를 만들어 봅시다!`, cached: false, error: true };
    }
});

// ============================================================================
// 🚀 [기능 11] 신규 상담 1일 전 자동 리마인드 발송 (매일 오전 11시 KST)
// ============================================================================
exports.consultationReminderCron = onSchedule({
    schedule: "0 11 * * *", 
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
        
        const pad = (n) => String(n).padStart(2, '0');
        const tomorrowStr = `${kstTime.getFullYear()}-${pad(kstTime.getMonth() + 1)}-${pad(kstTime.getDate())}`;
        
        const consultSnapshot = await db.collection(`artifacts/${APP_ID}/public/data/consultations`)
            .where('date', '==', tomorrowStr)
            .where('status', '==', 'scheduled')
            .where('type', '==', 'new')
            .get();

        if (consultSnapshot.empty) return null;

        const batch = db.batch();
        let count = 0;

        consultSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.parentPhone) return;

            const cleanPhone = data.parentPhone.replace(/[^0-9]/g, '');
            const ampm = parseInt(data.time.split(':')[0]) >= 12 ? '오후' : '오전';
            const displayTime = `${data.date} ${ampm} ${data.time}`;

            const message = `[목동임페리얼학원]\n안녕하세요. 목동임페리얼학원입니다.\n\n${data.studentName} 학생의 상담이 내일 ${displayTime}에 예약되었습니다. 일정에 참고하시어, 변경이 필요하신 경우에는 학원으로 연락주시면 감사하겠습니다.\n\n<임페리얼 오시는 길>\n▷영일고등학교 건너편 배드민턴 마켓 건물 4층\n▷임페리얼학원 오시는 길 안내링크\nhttps://blog.naver.com/imperialsys01/223391287204\n\n[목동임페리얼학원]\n☎ 대표전화 : 02-2644-1178\n◆ 대표메일 : imperialsys01@naver.com`;

            const outboxRef = db.collection(`artifacts/${APP_ID}/public/data/sms_outbox`).doc();
            batch.set(outboxRef, {
                phoneNumber: cleanPhone,
                message: message,
                status: 'pending',
                type: 'consultation_reminder',
                studentName: data.studentName,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
        });

        if (count > 0) await batch.commit();
        console.log(`[Success] 발송된 상담 리마인드 건수: ${count}건`);

    } catch (error) {
        console.error("🔥 상담 리마인드(Cron) 에러:", error);
    }
    return null;
});

// ============================================================================
// 🔒 [기능 12] 회원가입 휴대폰 인증번호 발급
// 기존에는 브라우저가 Math.random()으로 번호를 만들고 브라우저가 스스로 채점했기 때문에
// 개발자도구만 열면 누구나 인증을 통과할 수 있었다. 이제 서버가 발급하고 서버가 채점한다.
// ============================================================================
const CODES_PATH = `artifacts/${APP_ID}/public/data/signup_codes`;

exports.requestSignupCode = onCall({ timeoutSeconds: 30 }, async (request) => {
    const phone = String(request.data?.phone || '').replace(/[^0-9]/g, '');
    const name = String(request.data?.name || '신규가입자').slice(0, 30);
    if (phone.length < 10 || phone.length > 11) {
        throw new HttpsError("invalid-argument", "유효한 휴대폰 번호가 아닙니다.");
    }

    /* 💰 [비용 보호] 이 함수는 로그인 없이 부를 수 있다(가입 전이므로 어쩔 수 없다).
       아래 '번호별' 제한만 있었을 때는 번호를 계속 바꾸면 그대로 뚫려서,
       학원 법인폰이 임의 번호로 문자를 쏘는 스팸 발신기가 될 수 있었다.
       그래서 '보내는 쪽(IP)'과 '학원 전체 하루 총량'을 함께 막는다. */
    const rawIp = String(
        request.rawRequest?.headers?.['x-forwarded-for'] || request.rawRequest?.ip || 'unknown'
    ).split(',')[0].trim();
    await consumeQuota(`sms_ip_${sha256(rawIp).slice(0, 24)}`, 10, 60 * 60 * 1000,
        "인증 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.");
    await consumeQuota('sms_signup_global', 200, 24 * 60 * 60 * 1000,
        "오늘 인증문자 발송 한도에 도달했습니다. 학원으로 문의해주세요.");

    const db = admin.firestore();
    const ref = db.doc(`${CODES_PATH}/${phone}`);
    const existing = await ref.get();

    // 재전송 남용 방지: 60초 이내 재요청 차단
    if (existing.exists) {
        const last = existing.data().issuedAt;
        if (last && Date.now() - last < 60 * 1000) {
            throw new HttpsError("resource-exhausted", "인증번호는 1분에 한 번만 요청할 수 있습니다.");
        }
        if ((existing.data().issueCount || 0) >= 5) {
            const firstIssued = existing.data().firstIssuedAt || 0;
            if (Date.now() - firstIssued < 60 * 60 * 1000) {
                throw new HttpsError("resource-exhausted", "인증 요청 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.");
            }
        }
    }

    // 암호학적으로 안전한 6자리 코드
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const now = Date.now();
    const withinHour = existing.exists && (now - (existing.data().firstIssuedAt || 0) < 60 * 60 * 1000);

    await ref.set({
        phone,
        codeHash: sha256(code),
        expiresAt: now + 3 * 60 * 1000,
        attempts: 0,
        verified: false,
        ticket: null,
        issuedAt: now,
        firstIssuedAt: withinHour ? existing.data().firstIssuedAt : now,
        issueCount: withinHour ? (existing.data().issueCount || 0) + 1 : 1
    });

    await queueSms(
        null,
        phone,
        `[목동임페리얼학원]\n회원가입 본인인증 번호는 [${code}] 입니다. 3분 이내에 입력해주세요.`,
        'auth_code',
        name
    );

    return { success: true };
});

exports.verifySignupCode = onCall({ timeoutSeconds: 30 }, async (request) => {
    const phone = String(request.data?.phone || '').replace(/[^0-9]/g, '');
    const code = String(request.data?.code || '').trim();

    const ref = admin.firestore().doc(`${CODES_PATH}/${phone}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "인증번호를 먼저 요청해주세요.");

    const data = snap.data();
    if (Date.now() > data.expiresAt) throw new HttpsError("deadline-exceeded", "인증 시간이 만료되었습니다. 다시 요청해주세요.");
    if ((data.attempts || 0) >= 5) throw new HttpsError("resource-exhausted", "입력 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.");

    if (sha256(code) !== data.codeHash) {
        await ref.update({ attempts: (data.attempts || 0) + 1 });
        throw new HttpsError("invalid-argument", "인증번호가 일치하지 않습니다.");
    }

    // 가입 완료 단계에서 제시해야 하는 1회용 티켓 (10분 유효)
    const ticket = crypto.randomBytes(24).toString('hex');
    await ref.update({ verified: true, ticket, ticketExpiresAt: Date.now() + 10 * 60 * 1000 });

    return { verified: true, ticket };
});

// ============================================================================
// 🔒 [기능 13] 회원가입 처리
// 평문 비밀번호를 Firestore에 저장하지 않는다. 비밀번호는 Firebase Auth에만 존재한다.
// ============================================================================
exports.registerUser = onCall({ timeoutSeconds: 60 }, async (request) => {
    const { ticket, phone, userId, password, name, role } = request.data || {};
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    const safeId = toSafeId(userId);

    if (!userId || !password || !name) throw new HttpsError("invalid-argument", "필수 정보가 누락되었습니다.");
    if (String(password).length < 6) throw new HttpsError("invalid-argument", "비밀번호는 6자리 이상이어야 합니다.");
    /* 🔒 [보안 패치 — 가장 중요한 한 줄]
       예전에는 가입 화면에서 '강사'나 '행정조교'를 고르면 서버가 그대로 믿고 교직원 역할을
       부여했다. 승인 대기(status:'pending') 검사는 브라우저 화면에만 있어서, 개발자도구로
       로그인 함수를 직접 부르면 그냥 통과했다. 즉 휴대폰 번호 하나만 있으면 누구나
       교직원 권한을 얻어 전 원생 개인정보와 급여·계좌를 읽고 원장 비밀번호까지 바꿀 수 있었다.
       교직원 계정은 이제 데스크가 adminCreateUser(직원 관리 메뉴)로만 만든다. */
    if (!['student', 'parent'].includes(role)) {
        throw new HttpsError("permission-denied",
            "학생·학부모만 직접 가입할 수 있습니다. 교직원 계정은 학원 데스크에서 발급해 드립니다.");
    }
    if (RESERVED_USER_IDS.includes(safeId)) {
        throw new HttpsError("permission-denied", "사용할 수 없는 아이디입니다. 다른 아이디를 입력해주세요.");
    }

    // 1) 인증 티켓 검증
    const codeRef = admin.firestore().doc(`${CODES_PATH}/${cleanPhone}`);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) throw new HttpsError("failed-precondition", "휴대폰 본인 인증을 먼저 완료해주세요.");
    const codeData = codeSnap.data();
    if (!codeData.verified || !codeData.ticket || codeData.ticket !== ticket) {
        throw new HttpsError("failed-precondition", "휴대폰 본인 인증을 먼저 완료해주세요.");
    }
    if (Date.now() > (codeData.ticketExpiresAt || 0)) {
        throw new HttpsError("deadline-exceeded", "인증 유효시간이 지났습니다. 처음부터 다시 진행해주세요.");
    }

    // 2) 아이디 중복 확인
    if ((await usersCol().doc(safeId).get()).exists) {
        throw new HttpsError("already-exists", "이미 사용 중인 아이디입니다.");
    }

    // 3) Firebase Auth 계정 생성 (비밀번호는 여기에만 저장된다)
    const email = `${safeId}@imperial.com`;
    let authUid;
    try {
        const rec = await admin.auth().createUser({ email, password, emailVerified: true });
        authUid = rec.uid;
    } catch (e) {
        if (e.code === 'auth/email-already-exists') {
            throw new HttpsError("already-exists", "이미 사용 중인 아이디입니다.");
        }
        throw new HttpsError("internal", `계정 생성 실패: ${e.message}`);
    }

    // 4) 프로필 문서 생성 (password 필드 없음)
    const payload = {
        id: safeId,
        userId: String(userId),
        name: String(name),
        phone: cleanPhone,
        role,
        authUid,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const d = request.data || {};
    if (role === 'student') {
        payload.schoolName = d.schoolName || '';
        payload.grade = d.grade || '1학년';
        payload.attendancePin = cleanPhone.slice(-4);
    } else if (role === 'parent') {
        payload.childName = d.childName || '';
        payload.schoolName = d.schoolName || '';
        payload.grade = d.grade || '1학년';
    } else {
        payload.subject = d.subject || '';
    }

    await usersCol().doc(safeId).set(payload);
    await codeRef.delete();

    // 5) 데스크 알림
    const deskSnap = await usersCol().where('role', '==', 'admin').limit(5).get();
    const batch = admin.firestore().batch();
    deskSnap.forEach(doc => {
        const p = doc.data().phone;
        if (p) queueSms(batch, p, `[시스템 알림] 새로운 가입 승인 대기자가 있습니다.\n- 이름: ${name}\n데스크에서 승인해주세요.`, 'system_alert', '시스템');
    });
    await batch.commit();

    return { success: true };
});

// ============================================================================
// 🔒 [기능 14] 레거시 계정 로그인 브리지
// 과거 계정은 Firestore에 평문 비밀번호만 있고 Auth 계정이 없거나 비밀번호가 어긋나 있다.
// 이 함수가 서버에서 대조한 뒤 Auth 계정을 만들어 주고, 평문 비밀번호를 즉시 삭제한다.
// 즉 사용자는 한 번 로그인하는 것만으로 자동으로 안전한 계정으로 이관된다.
// ============================================================================
exports.legacyLoginBridge = onCall({ timeoutSeconds: 60 }, async (request) => {
    const rawId = String(request.data?.userId || '').trim();
    const password = String(request.data?.password || '');
    if (!rawId || !password) throw new HttpsError("invalid-argument", "아이디와 비밀번호를 입력해주세요.");

    const safeId = toSafeId(rawId);

    // 1) 문서 탐색: safeId → userId 필드 역조회
    let snap = await usersCol().doc(safeId).get();
    let docId = safeId;
    if (!snap.exists) {
        const q = await usersCol().where('userId', '==', rawId).limit(1).get();
        if (q.empty) throw new HttpsError("not-found", "아이디 또는 비밀번호를 확인해주세요.");
        snap = q.docs[0];
        docId = snap.id;
    }

    const data = snap.data();

    // 2) 무차별 대입 방어
    const failCount = data.loginFailCount || 0;
    const lockedUntil = data.loginLockedUntil || 0;
    if (Date.now() < lockedUntil) {
        throw new HttpsError("resource-exhausted", "로그인 시도가 많아 잠시 잠겼습니다. 5분 후 다시 시도해주세요.");
    }

    // 3) 저장된 평문 비밀번호와 대조 (이관 대상 계정만 이 경로를 탄다)
    const stored = data.password;
    if (!stored || String(stored) !== password) {
        const nextFail = failCount + 1;
        await snap.ref.update({
            loginFailCount: nextFail,
            loginLockedUntil: nextFail >= 5 ? Date.now() + 5 * 60 * 1000 : 0
        });
        throw new HttpsError("permission-denied", "아이디 또는 비밀번호를 확인해주세요.");
    }

    // 4) Auth 계정 생성 또는 비밀번호 동기화
    /* ⚠️ Firebase Auth는 6자리 미만 비밀번호를 허용하지 않는다.
       과거 프론트엔드가 쓰던 것과 동일한 규칙('0'으로 채우기)을 유지해야
       이관 후에도 사용자가 기존 비밀번호로 계속 로그인할 수 있다.
       (클라이언트도 원본/패딩본을 모두 시도한다 — src/App.js handleLogin 참고) */
    const authPassword = password.length < 6 ? password.padEnd(6, '0') : password;

    const email = `${toSafeId(data.userId || docId)}@imperial.com`;
    let authUid;
    try {
        const rec = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(rec.uid, { password: authPassword });
        authUid = rec.uid;
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            const rec = await admin.auth().createUser({ email, password: authPassword, emailVerified: true });
            authUid = rec.uid;
        } else {
            throw new HttpsError("internal", `계정 이관 실패: ${e.message}`);
        }
    }

    // 5) 평문 비밀번호 영구 삭제 + 이관 완료 표시
    await snap.ref.update({
        authUid,
        password: admin.firestore.FieldValue.delete(),
        loginFailCount: 0,
        loginLockedUntil: 0,
        migratedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const token = await admin.auth().createCustomToken(authUid);
    return { token, docId, authUid };
});

// ============================================================================
// 🔒 [기능 15] 데스크가 사용자를 직접 생성
// 기존에는 브라우저에서 '그림자 앱(secondaryAuth)'으로 계정을 만들고 Firestore에
// 평문 비밀번호를 함께 저장했다. 이제 서버가 만들고 비밀번호는 Auth에만 둔다.
// ============================================================================
exports.adminCreateUser = onCall({ timeoutSeconds: 60 }, async (request) => {
    const caller = await assertDesk(request);
    const { userId, password, name, role, profile = {} } = request.data || {};

    const safeId = toSafeId(userId);
    if (!userId || !password || !name || !role) throw new HttpsError("invalid-argument", "필수 정보가 누락되었습니다.");
    if (String(password).length < 6) throw new HttpsError("invalid-argument", "비밀번호는 6자리 이상이어야 합니다.");
    if (RESERVED_USER_IDS.includes(safeId)) throw new HttpsError("permission-denied", "사용할 수 없는 아이디입니다.");

    // 행정조교는 학생/학부모만 생성할 수 있다 (권한 상승 차단)
    if (caller.role === 'admin_assistant' && !['student', 'parent'].includes(role)) {
        throw new HttpsError("permission-denied", "행정조교는 학생/학부모 계정만 생성할 수 있습니다.");
    }
    if (role === 'admin' && caller.role !== 'admin') {
        throw new HttpsError("permission-denied", "관리자 계정은 관리자만 생성할 수 있습니다.");
    }

    if ((await usersCol().doc(safeId).get()).exists) {
        throw new HttpsError("already-exists", "이미 존재하는 아이디입니다.");
    }

    const email = `${safeId}@imperial.com`;
    let authUid;
    try {
        const rec = await admin.auth().createUser({ email, password, emailVerified: true });
        authUid = rec.uid;
    } catch (e) {
        if (e.code === 'auth/email-already-exists') {
            const rec = await admin.auth().getUserByEmail(email);
            await admin.auth().updateUser(rec.uid, { password });
            authUid = rec.uid;
        } else {
            throw new HttpsError("internal", `계정 생성 실패: ${e.message}`);
        }
    }

    // 클라이언트가 보낸 값 중 위험한 키는 제거하고 저장한다
    const { password: _p, role: _r, authUid: _a, id: _i, ...safeProfile } = profile;

    await usersCol().doc(safeId).set({
        ...safeProfile,
        id: safeId,
        userId: String(userId),
        name: String(name),
        role,
        authUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, id: safeId, authUid };
});

// ============================================================================
// 🔒 [기능 16] 문자 게이트웨이 전용 계정 발급
//
// [배경] 법인폰의 문자 발송 앱은 admin@imperial.com 계정으로 로그인했고,
//        그 비밀번호가 웹 저장소 소스코드에도 똑같이 적혀 있었다.
//        저장소가 공개라서 과거 커밋에서 그대로 꺼낼 수 있는 값이 되었다.
//        게다가 아이디가 'admin' 이라 진짜 관리자 계정처럼 보여 혼란스럽다.
//
// [해결] 'smsgw@imperial.com' 전용 계정으로 옮긴다.
//        비밀번호는 서버가 만들어 호출한 관리자 화면에 '한 번만' 돌려준다.
//        Firestore 에도, 로그에도, 소스코드에도 남기지 않는다.
//
// 이 계정에는 교직원 역할을 주지 않는다. 권한은 오직 보안 규칙의 isGateway()가
// 허용하는 범위(문자 발송함 읽기·수정, 통화기록 등록, 학생 조회)뿐이다.
// ============================================================================
exports.provisionSmsGateway = onCall({ timeoutSeconds: 60 }, async (request) => {
    await assertRole(request, ['admin'], "원장(관리자) 계정만 실행할 수 있습니다.");

    const email = `${GATEWAY_ID}@imperial.com`;
    // base64url 32자 — 사람이 외울 필요가 없으므로 길고 무작위여도 된다
    const password = crypto.randomBytes(24).toString('base64url');

    let uid;
    let created = false;
    try {
        const rec = await admin.auth().getUserByEmail(email);
        uid = rec.uid;
        await admin.auth().updateUser(uid, { password });
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            const rec = await admin.auth().createUser({ email, password, emailVerified: true });
            uid = rec.uid;
            created = true;
        } else {
            throw new HttpsError("internal", `게이트웨이 계정 처리 실패: ${e.message}`);
        }
    }

    /* 역할 클레임을 'gateway' 로 못박는다.
       어떤 역할 목록(STAFF/MEMBERS)에도 없는 값이라 교직원 권한이 생기지 않고,
       보안 규칙이 이 계정 때문에 users 문서를 조회하는 일도 없앤다. */
    try {
        await admin.auth().setCustomUserClaims(uid, { role: 'gateway', approved: true });
    } catch (e) {
        console.error('[provisionSmsGateway] 클레임 설정 실패', e);
    }

    // 비밀번호는 이 응답이 유일한 전달 경로다. 서버는 저장하지 않는다.
    return { email, password, created };
});

// ============================================================================
// 🔒 [기능 18] 온톨로지 원본 YAML 편집 링크 생성
//
// 문제: 지식 맵의 [원본 수정] 버튼이 항상 404였다.
//       - build.json에는 file_path가 없다(571개 노드 중 0개).
//       - 원본 저장소는 비공개라 브라우저에서 경로를 찾을 방법이 없다.
//       - 저장소의 ontology_index.json에는 file_path가 있지만
//         'C:\Users\...' 형태의 로컬 PC 경로라 웹에서 쓸 수 없다.
//
// 해결: 서버가 GitHub 토큰으로 저장소 파일 목록을 읽고, 개념 ID의 번호 체계로
//       실제 경로를 계산한다. (571개 전부에 대해 정확도 100% 확인)
//         예) ALG-03-03-01 + 대분류 '대수'
//             → 02_대수 / 03_방정식 / 03_근과_계수의_관계 / 01_....yaml
//       토큰은 브라우저로 나가지 않으며, 교직원만 호출할 수 있다.
// ============================================================================
let ontologyTreeCache = { at: 0, files: [] };

exports.resolveOntologySource = onCall({ timeoutSeconds: 30 }, async (request) => {
    await assertStaff(request);

    const nodeId = String(request.data?.nodeId || '').trim();
    const majorCategory = String(request.data?.majorCategory || '').trim();
    if (!nodeId) throw new HttpsError("invalid-argument", "개념 ID가 없습니다.");

    const token = githubToken.value().trim();
    const owner = githubOwner.value().trim();
    const repo = githubRepo.value().trim();
    if (!token || !owner || !repo) {
        throw new HttpsError("failed-precondition", "서버에 GitHub 연동 정보(토큰/소유자/저장소)가 설정되지 않았습니다.");
    }

    const BRANCH = 'main';
    const repoHome = `https://github.com/${owner}/${repo}`;

    // 저장소 파일 목록은 자주 바뀌지 않으므로 10분간 재사용한다 (API 호출 절약)
    const now = Date.now();
    if (ontologyTreeCache.files.length === 0 || now - ontologyTreeCache.at > 10 * 60 * 1000) {
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${BRANCH}?recursive=1`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'imperial-system'
                }
            }
        );
        if (!res.ok) {
            throw new HttpsError("internal", `원본 저장소를 읽지 못했습니다. (HTTP ${res.status}) 토큰 권한을 확인해주세요.`);
        }
        const data = await res.json();
        ontologyTreeCache = {
            at: now,
            files: (data.tree || [])
                .filter(f => f.type === 'blob'
                    && /\.ya?ml$/i.test(f.path)
                    && !f.path.startsWith('.github')
                    && f.path.split('/').length === 4)
                .map(f => f.path)
        };
    }

    // 문장부호·공백·밑줄 차이를 무시하고 이름을 비교한다
    const loose = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '');
    const stripNum = (s) => String(s).replace(/^\d+_/, '');

    const nums = nodeId.split('-').slice(1); // 예: ALG-03-03-01 → ['03','03','01']
    let matches = [];

    if (nums.length >= 3) {
        matches = ontologyTreeCache.files.filter(p => {
            const seg = p.split('/');
            const majorOk = !majorCategory || loose(stripNum(seg[0])) === loose(majorCategory);
            return majorOk
                && seg[1].startsWith(nums[0] + '_')
                && seg[2].startsWith(nums[1] + '_')
                && seg[3].startsWith(nums[2] + '_');
        });
    }

    if (matches.length !== 1) {
        // 경로를 특정하지 못하면 감추지 말고 저장소 첫 화면으로 보낸다
        return {
            found: false,
            url: `${repoHome}/tree/${BRANCH}`,
            message: matches.length === 0
                ? '해당 개념의 원본 파일을 찾지 못했습니다. 저장소 첫 화면으로 이동합니다.'
                : `조건에 맞는 파일이 ${matches.length}개라 하나로 특정하지 못했습니다.`
        };
    }

    const path = matches[0];
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return { found: true, path, url: `${repoHome}/edit/${BRANCH}/${encoded}` };
});

// ============================================================================
// 🔒 [기능 19] 역할(role)을 로그인 토큰에 심는다 — Custom Claims 동기화
//
// [왜 필요한가]
// 보안 규칙이 "이 사람이 학생인가?"를 판단하려면 users 문서를 읽어야 했다.
// 그런데 Firestore 규칙에는 문서 조회 횟수 제한이 있다(일괄 작업 20회).
// 학생이 클리닉 시간대를 여러 개 골라 한 번에 신청하면 이 한도를 넘어
// 'missing or insufficient permissions' 오류가 났다.
// 또 과거 계정처럼 문서 ID가 로그인 아이디와 다르면 조회 자체가 빗나갔다.
//
// [해결]
// 역할을 로그인 토큰(Custom Claims)에 넣으면 규칙이 문서를 한 번도 읽지 않는다.
// 토큰은 authUid 기준이라 문서 ID가 달라도 정확하다.
// ============================================================================

/** 사용자 문서로부터 실제 Firebase Auth uid를 알아낸다.
 *  과거 계정은 문서 ID·userId·이메일이 서로 다를 수 있어 여러 후보를 차례로 시도한다. */
const resolveAuthUid = async (docId, data) => {
    const stored = data?.authUid;
    if (stored && stored !== 'legacy_verified_account') return stored;

    // toSafeId(userId) → toSafeId(문서ID) → 문서ID 원문 순으로 이메일을 만들어 찾는다
    const candidates = [...new Set([
        toSafeId(data?.userId || docId),
        toSafeId(docId),
        String(docId).toLowerCase()
    ].filter(Boolean))];

    for (const id of candidates) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const rec = await admin.auth().getUserByEmail(`${id}@imperial.com`);
            return rec.uid;
        } catch (e) { /* 다음 후보 시도 */ }
    }
    return null;
};

exports.syncUserClaims = onDocumentWritten(
    `artifacts/${APP_ID}/public/data/users/{userId}`,
    async (event) => {
        const userId = event.params.userId;
        const before = event.data?.before?.exists ? event.data.before.data() : null;
        const after = event.data?.after?.exists ? event.data.after.data() : null;

        if (!after) return null; // 삭제는 onUserDeleted가 계정을 통째로 지운다

        /* 역할·인증연결·승인상태가 바뀔 때만 처리 (lastLogin 갱신 등으로는 동작하지 않게).
           ⚠️ status 비교를 빠뜨리면, 데스크가 '승인'을 눌러 status만 바꿨을 때 토큰이
              갱신되지 않아 승인해도 계속 막히는 문제가 생긴다. */
        if (before
            && before.role === after.role
            && before.authUid === after.authUid
            && before.status === after.status) return null;

        const uid = await resolveAuthUid(userId, after);
        if (!uid) {
            console.warn(`[syncUserClaims] 인증 계정을 찾지 못함: ${userId}`);
            return null;
        }

        try {
            /* 토큰에 세 가지를 담는다. 보안 규칙이 문서를 한 번도 읽지 않고 판정하기 위해서다.
               - role     : 역할
               - did      : 이 사람의 users 문서 ID. 과거 계정은 문서 ID와 로그인 아이디가
                            다를 수 있어서, '이게 내 예약인가' 같은 판정에 반드시 필요하다.
               - approved : 가입 승인 여부. 승인 대기 계정은 규칙에서 권한을 주지 않는다. */
            await admin.auth().setCustomUserClaims(uid, {
                role: after.role || 'none',
                did: userId,
                approved: String(after.status || 'active') !== 'pending'
            });
        } catch (e) {
            console.error(`[syncUserClaims] 실패: ${userId}`, e);
        }
        return null;
    }
);

/** 기존 사용자 전원에게 역할 토큰을 한 번에 부여한다. (도입 시 1회 실행)
 *  인증 계정이 없어 실패한 사용자는 '왜 실패했고 어떻게 해결되는지'까지 함께 알려준다. */
exports.backfillUserClaims = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    await assertRole(request, ['admin'], "관리자만 실행할 수 있습니다.");

    const snap = await usersCol().get();
    let done = 0;
    const failed = [];

    // Auth 서버 부하를 고려해 소규모 묶음으로 순차 처리한다
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 10) {
        const chunk = docs.slice(i, i + 10);
        await Promise.all(chunk.map(async (d) => {
            const data = d.data();
            const uid = await resolveAuthUid(d.id, data);

            const describe = (reason) => {
                // 평문 비밀번호가 남아 있으면 다음 로그인 때 서버가 계정을 만들어 주므로 저절로 해결된다
                const canSelfHeal = !!data.password;
                return {
                    id: d.id,
                    name: data.name || d.id,
                    userId: data.userId || d.id,
                    role: data.role || 'none',
                    status: data.status || '-',
                    reason,
                    canSelfHeal,
                    advice: canSelfHeal
                        ? '이 사용자가 다음에 로그인하면 인증 계정이 자동 생성되고 역할도 함께 부여됩니다. 별도 조치가 필요 없습니다.'
                        : '비밀번호 정보가 없어 자동 복구가 불가능합니다. [사용자 관리]에서 이 사용자의 [비번 변경]을 눌러 새 비밀번호를 지정해 주세요.'
                };
            };

            if (!uid) { failed.push(describe('인증 계정 없음')); return; }
            try {
                // syncUserClaims 와 반드시 같은 모양이어야 한다 (role / did / approved)
                await admin.auth().setCustomUserClaims(uid, {
                    role: data.role || 'none',
                    did: d.id,
                    approved: String(data.status || 'active') !== 'pending'
                });
                done++;
            } catch (e) {
                failed.push(describe(`토큰 부여 실패: ${e.message}`));
            }
        }));
    }

    /* 2차: 인증 계정 쪽에서 거꾸로 훑는다.
       1차는 '사용자 문서 → 인증 계정' 방향이라, 문서 ID·userId·이메일이 서로 어긋난
       과거 계정은 끝내 못 찾는 경우가 있다. 실제로 토큰이 하나도 없는 계정이 남았고,
       그런 계정은 규칙이 문서를 조회해도 ID가 안 맞아 역할이 'none' 으로 떨어진다.
       그 결과 교직원인데도 사용자·수강·피드백 접근이 전부 거부된다. */
    const byAuthUid = new Map();
    const byDocId = new Map();
    const bySafeUserId = new Map();
    docs.forEach((d) => {
        const u = d.data();
        if (u.authUid) byAuthUid.set(u.authUid, d);
        byDocId.set(String(d.id).toLowerCase(), d);
        if (u.userId) bySafeUserId.set(toSafeId(u.userId), d);
    });

    const orphans = [];
    let repaired = 0;
    let pageToken;
    do {
        // eslint-disable-next-line no-await-in-loop
        const page = await admin.auth().listUsers(1000, pageToken);
        pageToken = page.pageToken;

        for (const rec of page.users) {
            const hasClaim = rec.customClaims && rec.customClaims.role;
            if (hasClaim) continue;

            const emailId = String(rec.email || '').split('@')[0].toLowerCase();
            const match = byAuthUid.get(rec.uid) || byDocId.get(emailId) || bySafeUserId.get(emailId);

            if (!match) {
                orphans.push({ email: rec.email || rec.uid, uid: rec.uid });
                continue;
            }

            const u = match.data();
            try {
                // eslint-disable-next-line no-await-in-loop
                await admin.auth().setCustomUserClaims(rec.uid, {
                    role: u.role || 'none',
                    did: match.id,
                    approved: String(u.status || 'active') !== 'pending'
                });
                // 다음부터는 문서에서 바로 찾도록 연결을 기록해 둔다
                // eslint-disable-next-line no-await-in-loop
                if (!u.authUid || u.authUid === 'legacy_verified_account') {
                    await match.ref.update({ authUid: rec.uid });
                }
                repaired++;
                done++;
            } catch (e) {
                orphans.push({ email: rec.email || rec.uid, uid: rec.uid, reason: e.message });
            }
        }
    } while (pageToken);

    return {
        total: docs.length,
        done,
        repaired,
        failedCount: failed.length,
        failed,
        selfHealCount: failed.filter(f => f.canSelfHeal).length,
        needsActionCount: failed.filter(f => !f.canSelfHeal).length,
        // 인증 계정은 있는데 짝이 되는 사용자 문서가 없는 것들 (키오스크·시험 계정 등일 수 있다)
        orphanCount: orphans.length,
        orphans
    };
});

// ============================================================================
// 🔒 [기능 17] 교직원 명부(staff_directory) 자동 동기화
//
// 문제: 학생/학부모 화면도 '담당 강사 이름'이 필요해서 users 컬렉션 전체를 구독했다.
//       그 결과 학생 한 명이 로그인하면 전 원생의 전화번호는 물론
//       강사·조교의 은행 계좌번호까지 브라우저로 내려갔다.
// 해결: 이름/역할/과목만 담은 별도 명부를 서버가 유지하고, 학생/학부모는 이것만 읽는다.
// ============================================================================
const STAFF_DIR_PATH = `artifacts/${APP_ID}/public/data/staff_directory`;

/* 문자 게이트웨이(법인폰 앱)가 쓰는 학생 명부.
   앱은 '상담 내용을 어느 학생에게 붙일지' 고르는 목록만 있으면 되고,
   실제로 쓰는 값은 이름·학교·학년 셋뿐이다(MainActivity 의 Student 모델).
   그런데 지금까지는 users 컬렉션 전체를 읽고 있었다. 그 문서에는
   출결PIN·계좌번호·월급·전화번호까지 들어 있어서, 법인폰이나 그 계정이
   털리면 학원 전체 개인정보가 함께 나간다.
   그래서 필요한 세 값만 담은 사본을 서버가 유지하고, 게이트웨이는 이것만 읽는다. */
const STUDENT_DIR_PATH = `artifacts/${APP_ID}/public/data/student_directory`;

exports.syncStaffDirectory = onDocumentWritten(
    `artifacts/${APP_ID}/public/data/users/{userId}`,
    async (event) => {
        const userId = event.params.userId;
        const before = event.data?.before?.exists ? event.data.before.data() : null;
        const after = event.data?.after?.exists ? event.data.after.data() : null;
        const ref = admin.firestore().doc(`${STAFF_DIR_PATH}/${userId}`);

        // 교직원이 아니거나 삭제된 경우 → 명부에서 제거
        if (!after || !STAFF_ROLES.includes(after.role)) {
            if (before && STAFF_ROLES.includes(before.role)) {
                await ref.delete().catch(() => {});
            }
            return null;
        }

        // 마지막 로그인 시각 갱신 등으로도 트리거되므로, 실제 변경이 있을 때만 쓴다
        if (before &&
            before.name === after.name &&
            before.role === after.role &&
            (before.subject || '') === (after.subject || '')) {
            return null;
        }

        await ref.set({
            id: userId,
            name: after.name || '',
            role: after.role,
            subject: after.subject || ''
        });
        return null;
    }
);

/** 기존 교직원을 명부에 한 번에 채워 넣는다. (도입 시 1회 실행) */
/** 학생 명부 사본 유지 (문자 게이트웨이 전용). 이름·학교·학년만 담는다. */
exports.syncStudentDirectory = onDocumentWritten(
    `artifacts/${APP_ID}/public/data/users/{userId}`,
    async (event) => {
        const userId = event.params.userId;
        const before = event.data?.before?.exists ? event.data.before.data() : null;
        const after = event.data?.after?.exists ? event.data.after.data() : null;
        const ref = admin.firestore().doc(`${STUDENT_DIR_PATH}/${userId}`);

        // 승인 대기 중이거나 학생이 아니거나 삭제됨 → 명부에서 제거
        const isListable = (u) => u && u.role === 'student' && String(u.status || 'active') !== 'pending';

        if (!isListable(after)) {
            if (isListable(before)) await ref.delete().catch(() => {});
            return null;
        }

        // 마지막 로그인 갱신 등으로도 트리거되므로 실제 변경이 있을 때만 쓴다
        if (before &&
            before.name === after.name &&
            (before.schoolName || '') === (after.schoolName || '') &&
            (before.grade || '') === (after.grade || '') &&
            before.role === after.role &&
            before.status === after.status) {
            return null;
        }

        await ref.set({
            id: userId,
            name: after.name || '',
            schoolName: after.schoolName || '',
            grade: after.grade || ''
        });
        return null;
    }
);

/* 이미 저장된 예약 문서에서 전화번호를 걷어낸다.
   예약(sessions)은 예약 화면 특성상 로그인한 누구나 읽을 수 있어서, 여기에 남은
   번호는 다른 학생이 브라우저로 그대로 가져갈 수 있다. 앞으로는 저장하지 않지만
   과거 문서에는 남아 있으므로 한 번 정리해야 한다.
   문자 발송 경로는 모두 users 에서 번호를 먼저 조회하므로 기능에는 영향이 없다. */
/* 예약 문서 안에 들어 있던 강사 피드백 본문을 clinic_feedbacks 로 옮긴다.
   예약(sessions)은 예약 화면 특성상 로그인한 누구나 읽어야 해서, 피드백이 거기 있으면
   '강사가 특정 학생에 대해 쓴 코멘트'를 같은 반 친구가 브라우저로 읽을 수 있다.
   본문을 옮긴 뒤 예약 문서에서는 지운다. '작성됨' 표시(feedbackStatus)는 남겨둔다 —
   목록 필터에 필요하고 민감하지 않다. */
// ============================================================================
// [학원 달력] 공휴일 가져오기
//
// 한국 공휴일은 계산만으로 알 수 없다.
//   - 설날·추석·부처님오신날은 음력이라 매년 날짜가 다르다
//   - 대체공휴일 규칙이 있다 (예: 2026-03-02 대체공휴일(삼일절))
//   - 임시공휴일이 생긴다 (예: 2026-06-03 전국동시지방선거)
// 그래서 하드코딩하지 않고 한국천문연구원 특일 정보를 받아 저장한다.
//
// 문서 ID를 holiday_YYYYMMDD 로 고정해 여러 번 실행해도 중복이 쌓이지 않는다.
// 원장이 손으로 고친 항목(source: 'manual')은 덮어쓰지 않는다.
// ============================================================================
const CALENDAR_PATH = `artifacts/${APP_ID}/public/data/academy_calendar`;

const fetchHolidaysOfYear = async (year) => {
    const raw = String(dataGoKrKey.value() || '').trim();
    console.log(`[syncPublicHolidays] ${year}년 조회 시작 (키 길이 ${raw.length})`);
    if (!raw) throw new HttpsError("failed-precondition", "공휴일 인증키가 설정되지 않았습니다. (DATA_GO_KR_KEY)");

    // data.go.kr 은 Encoding/Decoding 두 형태의 키를 준다.
    // '%' 가 들어 있으면 이미 URL 인코딩된 값이므로 다시 인코딩하면 안 된다.
    const key = raw.includes('%') ? raw : encodeURIComponent(raw);
    const url = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'
        + `?serviceKey=${key}&solYear=${year}&_type=json&numOfRows=100`;

    const res = await fetch(url);
    const text = await res.text();
    if (!text.trim().startsWith('{')) {
        // 인증키 오류 등은 XML 로 돌아온다
        const reason = (text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/) || [])[1]
            || (text.match(/<errMsg>(.*?)<\/errMsg>/) || [])[1] || '알 수 없는 응답';
        throw new HttpsError("failed-precondition", `공휴일 조회 실패(${year}): ${reason}`);
    }

    const json = JSON.parse(text);
    const header = json?.response?.header;
    if (header && header.resultCode !== '00') {
        throw new HttpsError("failed-precondition", `공휴일 조회 실패(${year}): ${header.resultMsg || header.resultCode}`);
    }

    let items = json?.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = [items];
    return items
        .filter((it) => it && it.locdate)
        .map((it) => {
            const s = String(it.locdate);
            return {
                date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
                name: String(it.dateName || '공휴일').trim(),
                isHoliday: String(it.isHoliday || 'Y') === 'Y'
            };
        });
};

exports.syncPublicHolidays = onCall({ timeoutSeconds: 120 }, async (request) => {
    await assertDesk(request);
    try {
        return await runHolidaySync(request);
    } catch (e) {
        /* HttpsError 가 아닌 예외는 클라이언트에 그냥 'INTERNAL' 로만 전달되어
           무엇이 잘못됐는지 알 수 없다. 원인을 로그와 화면에 함께 남긴다. */
        if (e instanceof HttpsError) throw e;
        console.error('[syncPublicHolidays] 실패:', e && e.stack ? e.stack : e);
        throw new HttpsError('internal', `공휴일 동기화 실패: ${e && e.message ? e.message : String(e)}`);
    }
});

const runHolidaySync = async (request) => {
    const thisYear = new Date().getFullYear();
    const years = Array.isArray(request.data?.years) && request.data.years.length
        ? request.data.years.map(Number).filter((y) => y >= 2000 && y <= 2100)
        : [thisYear, thisYear + 1]; // 12월에 내년 일정을 짜야 하므로 내년까지 받아둔다

    const db = admin.firestore();
    let added = 0;
    let updated = 0;
    let keptManual = 0;
    const collected = [];

    for (const y of years) {
        // eslint-disable-next-line no-await-in-loop
        const list = await fetchHolidaysOfYear(y);
        collected.push(...list);
    }

    let batch = db.batch();
    let pending = 0;
    for (const h of collected) {
        if (!h.isHoliday) continue;
        const ref = db.doc(`${CALENDAR_PATH}/holiday_${h.date.replace(/-/g, '')}`);
        // eslint-disable-next-line no-await-in-loop
        const snap = await ref.get();

        // 원장이 직접 손댄 항목은 건드리지 않는다
        if (snap.exists && snap.data().source === 'manual') { keptManual++; continue; }

        batch.set(ref, {
            type: 'holiday',
            title: h.name,
            startDate: h.date,
            endDate: h.date,
            /* ⚠️ 공휴일이라고 자동으로 휴원 처리하지 않는다.
               학원은 공휴일에도 조교가 나와 업무를 보거나 필요한 학생 클리닉을 진행한다.
               달력에 '빨간날'로 알려주기만 하고, 실제 휴원 여부는 학원이 직접 지정한다.
               (달력 목록에서 '정상 운영 ↔ 학원 쉼' 을 눌러 바꾼다) */
            isClosed: false,
            source: 'system',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (snap.exists) updated++; else added++;
        pending++;
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    if (pending > 0) await batch.commit();

    return { years, total: collected.length, added, updated, keptManual };
};

exports.migrateClinicFeedbacks = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    await assertRole(request, ['admin'], "관리자만 실행할 수 있습니다.");

    const db = admin.firestore();
    const col = db.collection(`artifacts/${APP_ID}/public/data/sessions`);
    const snap = await col.get();

    const CONTENT = ['rating', 'tags', 'clinicDetails', 'nextAction', 'clinicContent', 'improvement', 'feedback'];
    let moved = 0;
    let batch = db.batch();
    let pending = 0;

    for (const d of snap.docs) {
        const s = d.data();
        const hasContent = CONTENT.some((k) => s[k] !== undefined && s[k] !== null && s[k] !== '');
        if (!hasContent) continue;

        // 옛 필드명(clinicContent/improvement/feedback)도 새 이름으로 정리해 옮긴다
        const payload = {
            sessionId: d.id,
            studentId: s.studentId || '',
            taId: s.taId || '',
            date: s.date || '',
            rating: s.rating ?? 5,
            tags: s.tags || '',
            clinicDetails: s.clinicDetails || s.clinicContent || s.feedback || '',
            nextAction: s.nextAction || s.improvement || '',
            migratedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(db.doc(`artifacts/${APP_ID}/public/data/clinic_feedbacks/${d.id}`), payload, { merge: true });

        const strip = {};
        CONTENT.forEach((k) => { if (s[k] !== undefined) strip[k] = admin.firestore.FieldValue.delete(); });
        batch.update(d.ref, strip);

        moved++;
        pending += 2;
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    if (pending > 0) await batch.commit();

    return { scanned: snap.size, moved };
});

exports.purgeSessionPhones = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    await assertRole(request, ['admin'], "관리자만 실행할 수 있습니다.");

    const db = admin.firestore();
    const col = db.collection(`artifacts/${APP_ID}/public/data/sessions`);
    const snap = await col.get();

    let cleaned = 0;
    let batch = db.batch();
    let pending = 0;

    for (const d of snap.docs) {
        const s = d.data();
        const hadPhoneField = Object.prototype.hasOwnProperty.call(s, 'studentPhone') && s.studentPhone;
        const students = Array.isArray(s.students) ? s.students : null;
        const hadPhoneInList = students && students.some((st) => st && st.phone);
        if (!hadPhoneField && !hadPhoneInList) continue;

        const patch = {};
        if (hadPhoneField) patch.studentPhone = admin.firestore.FieldValue.delete();
        if (hadPhoneInList) {
            patch.students = students.map((st) => {
                const { phone, ...rest } = st || {};
                return rest;
            });
        }
        batch.update(d.ref, patch);
        cleaned++;
        pending++;
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    if (pending > 0) await batch.commit();

    return { scanned: snap.size, cleaned };
});

exports.backfillStudentDirectory = onCall({ timeoutSeconds: 300 }, async (request) => {
    await assertRole(request, ['admin'], "관리자만 실행할 수 있습니다.");

    const snap = await usersCol().get();
    const db = admin.firestore();
    let count = 0;

    // 학생 수가 많을 수 있으므로 배치를 400건 단위로 끊는다 (한 배치 상한 500)
    let batch = db.batch();
    let pending = 0;
    for (const d of snap.docs) {
        const u = d.data();
        if (u.role !== 'student' || String(u.status || 'active') === 'pending') continue;
        batch.set(db.doc(`${STUDENT_DIR_PATH}/${d.id}`), {
            id: d.id,
            name: u.name || '',
            schoolName: u.schoolName || '',
            grade: u.grade || ''
        });
        count++;
        pending++;
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    if (pending > 0) await batch.commit();

    return { count };
});

exports.backfillStaffDirectory = onCall({ timeoutSeconds: 120 }, async (request) => {
    await assertRole(request, ['admin'], "관리자만 실행할 수 있습니다.");

    const snap = await usersCol().get();
    const db = admin.firestore();
    const batch = db.batch();
    let count = 0;

    snap.forEach(d => {
        const u = d.data();
        if (STAFF_ROLES.includes(u.role)) {
            batch.set(db.doc(`${STAFF_DIR_PATH}/${d.id}`), {
                id: d.id,
                name: u.name || '',
                role: u.role,
                subject: u.subject || ''
            });
            count++;
        }
    });

    await batch.commit();
    return { count };
});

// ============================================================================
// 🔒 [기능 16] 남아 있는 평문 비밀번호 일괄 소거 (원장님 1회 실행용)
// 이관되지 않은 계정은 비밀번호를 임시값으로 재설정하고 안내 문자를 보낸다.
// ============================================================================
exports.purgeStoredPasswords = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    await assertRole(request, ['admin'], "관리자만 실행할 수 있습니다.");
    const dryRun = request.data?.dryRun !== false; // 기본값: 미리보기

    const snap = await usersCol().get();
    const targets = snap.docs.filter(d => d.data().password);

    if (dryRun) {
        return {
            dryRun: true,
            count: targets.length,
            names: targets.slice(0, 50).map(d => d.data().name || d.id)
        };
    }

    let cleared = 0;
    for (const doc of targets) {
        try {
            await doc.ref.update({
                password: admin.firestore.FieldValue.delete(),
                passwordPurgedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            cleared++;
        } catch (e) {
            console.error(`평문 비밀번호 삭제 실패: ${doc.id}`, e);
        }
    }
    return { dryRun: false, cleared, total: targets.length };
});
/* =========================================================================
   수학 능력 지표 — 단원별 집계
   student_exam_diagnostics 가 바뀌면 student_math_profile 을 다시 만든다.

   [왜 서버인가]
   화면에서 집계하면 (1) 화면마다 다른 값이 나오고 (2) 반 인원수만큼 읽기 요금이
   곱해지며 (3) 계산을 위해 규칙을 학생에게 열어야 한다.
   마지막 것이 실제로 사고를 냈다 — english_stats 가 그렇게 뚫려 있었다.

   계산 자체는 functions/mathProfile.js 에 순수 함수로 있다.
   트리거 안에 묻어 두면 배포해야만 확인할 수 있기 때문이다.
   ========================================================================= */
const { buildMathProfile, aggregationSignature, taskAggregationSignature } = require("./mathProfile");

const DIAG_PATH = `artifacts/${APP_ID}/public/data/student_exam_diagnostics`;
const MATH_PROFILE_PATH = `artifacts/${APP_ID}/public/data/student_math_profile`;

const CLINIC_TASKS_PATH = `artifacts/${APP_ID}/public/data/clinic_tasks`;

/* 한 학생의 프로필을 통째로 다시 만든다.
   개념테스트와 숙제 두 곳을 모두 읽는다 — 어느 쪽이 바뀌어도 같은 결과가 나와야 한다. */
async function rebuildMathProfile(studentId, studentName) {
    const db = admin.firestore();
    const [diagSnap, taskSnap] = await Promise.all([
        db.collection(DIAG_PATH).where('studentId', '==', studentId).get(),
        db.collection(CLINIC_TASKS_PATH).where('studentId', '==', studentId).get()
    ]);

    const profile = buildMathProfile({
        diagnostics: diagSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        tasks: taskSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    });

    await db.doc(`${MATH_PROFILE_PATH}/${studentId}`).set({
        studentId,
        studentName: studentName || '',
        ...profile,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: false });   // 지운 기록이 남지 않도록 통째로 갈아끼운다

    console.log(`[수학 프로필] ${studentId} — 단원 ${profile.units.length}개 / 시험 ${profile.overall.attempted}문항 / 숙제 ${profile.overall.hw.attempted}문항`);
    return profile;
}

exports.syncMathProfile = onDocumentWritten(
    { document: `artifacts/${APP_ID}/public/data/student_exam_diagnostics/{docId}`, timeoutSeconds: 120 },
    async (event) => {
        const before = event.data?.before?.exists ? event.data.before.data() : null;
        const after = event.data?.after?.exists ? event.data.after.data() : null;

        const studentId = after?.studentId || before?.studentId;
        if (!studentId) return null;

        /* 클리닉에서 오답 원인 칩을 누를 때마다 responses 가 바뀐다.
           그때마다 전 기록을 다시 읽으면 클리닉 한 번에 수백 번 읽게 된다.
           집계에 실제로 쓰이는 값이 그대로면 아무것도 하지 않는다. */
        if (before && after && aggregationSignature(before) === aggregationSignature(after)) {
            return null;
        }

        try {
            await rebuildMathProfile(studentId, after?.studentName || before?.studentName);
        } catch (e) {
            console.error(`[수학 프로필] 집계 실패: ${studentId}`, e);
        }
        return null;
    }
);

/* 숙제(클리닉 임무)가 바뀌어도 같은 프로필을 다시 만든다.
   조교가 교재 범위를 채점하면 그 결과가 단원별 현황과 과제 신뢰도로 간다. */
exports.syncMathProfileFromHomework = onDocumentWritten(
    { document: `artifacts/${APP_ID}/public/data/clinic_tasks/{docId}`, timeoutSeconds: 120 },
    async (event) => {
        const before = event.data?.before?.exists ? event.data.before.data() : null;
        const after = event.data?.after?.exists ? event.data.after.data() : null;

        const studentId = after?.studentId || before?.studentId;
        if (!studentId) return null;

        /* 클리닉 문서는 전화 상태·출석 같은 값으로도 자주 바뀐다.
           집계에 쓰이는 값이 그대로면 다시 계산하지 않는다. */
        if (before && after && taskAggregationSignature(before) === taskAggregationSignature(after)) {
            return null;
        }

        try {
            await rebuildMathProfile(studentId, after?.studentName || before?.studentName);
        } catch (e) {
            console.error(`[수학 프로필] 숙제 집계 실패: ${studentId}`, e);
        }
        return null;
    }
);
