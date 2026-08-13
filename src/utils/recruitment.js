/* 채용 파이프라인의 단계·포지션·문자 템플릿

   [왜 여기 있나]
   예전에는 이 모든 것이 화면 코드 안에 박혀 있었습니다. 그래서
   - 학원의 CRIMS 기관 아이디·검증번호와 담당자 개인 휴대폰이 공개 JS 파일에 실렸고
   - 포지션이 셋인데 합격 문자는 하나뿐이라 강사에게도 '조교 합격' 문자가 나갔습니다

   이제 단계와 포지션은 이 파일이 정의하고, 학원마다 다른 값(담당자·기관 코드 등)은
   settings/recruitment 문서에서 받아 씁니다. 코드에는 남지 않습니다.
*/

/* ── 포지션 ────────────────────────────────────────────────
   면접 구성이 포지션마다 다릅니다(원장 확인).
   조교 둘은 질문 시간만, 강사는 필기와 시연이 더 있습니다. */
export const POSITIONS = [
  { id: 'ta', label: '수업조교(TA)', kind: '조교', interview: ['질문 시간'] },
  { id: 'desk', label: '행정조교(Desk)', kind: '조교', interview: ['질문 시간'] },
  { id: 'lecturer', label: '강사', kind: '강사', interview: ['질문 시간', '강사 시험(필기)', '수업 시연'] }
];

/** 저장된 포지션 값을 찾습니다. 옛 기록은 라벨 문자열로 저장돼 있습니다. */
export const findPosition = (value) => {
  const v = String(value || '').trim();
  return POSITIONS.find(p => p.id === v)
      || POSITIONS.find(p => p.label === v)
      || POSITIONS.find(p => v.includes(p.kind))
      || POSITIONS[0];
};

/* ── 단계 ──────────────────────────────────────────────────
   서류 접수 → 전화 안내 → 면접 확정 → 합격 → 경력조회 → 근로계약.
   불합격은 어느 단계에서든 갈 수 있습니다. */
export const STAGES = [
  { id: 'applied', label: '서류 접수', tone: 'slate' },
  { id: 'screening', label: '전화 안내 완료', tone: 'amber' },
  { id: 'scheduled', label: '면접 예정', tone: 'blue' },
  { id: 'passed', label: '합격 (경력조회 중)', tone: 'emerald' },
  { id: 'bg_checked', label: '경력조회 완료 (계약 대기)', tone: 'purple' },
  { id: 'contracted', label: '근로계약 완료', tone: 'indigo' },
  { id: 'rejected', label: '불합격', tone: 'rose' }
];

export const stageOf = (id) => STAGES.find(s => s.id === id) || STAGES[0];

/* 각 단계에서 할 수 있는 일.
   sms 가 있으면 문자를 함께 보냅니다(보내기 전에 반드시 내용을 보여 줍니다). */
export const ACTIONS_BY_STAGE = {
  applied: [
    { to: 'screening', label: '전화 안내 완료', hint: '기초 확인과 학원 안내를 마쳤습니다', tone: 'amber' }
  ],
  screening: [
    { to: 'scheduled', label: '면접 일정 확정', hint: '날짜를 정하고 안내 문자를 보냅니다', tone: 'blue', needsSchedule: true, sms: 'interview_scheduled' }
  ],
  scheduled: [
    { to: 'passed', label: '합격 통보', hint: '합격 안내와 경력조회 방법을 보냅니다', tone: 'emerald', sms: 'passed' }
  ],
  passed: [
    { to: 'bg_checked', label: '경력조회 완료', hint: '계약에 필요한 서류를 요청합니다', tone: 'purple', sms: 'bg_check_done' }
  ],
  bg_checked: [
    { to: 'contracted', label: '근로계약 완료', hint: '채용 절차가 끝납니다', tone: 'indigo' }
  ],
  contracted: [],
  rejected: []
};

/** 불합격은 결과가 나오기 전 단계에서만 보낼 수 있습니다. */
export const CAN_REJECT = ['applied', 'screening', 'scheduled'];

/* ── 문자 ──────────────────────────────────────────────────
   config 는 settings/recruitment 문서입니다. 값이 비어 있으면 보내지 않습니다. */

export const REQUIRED_CONFIG = {
  interview_scheduled: ['academyName', 'managerName', 'managerPhone', 'address'],
  passed: ['academyName', 'crimsOrgId', 'crimsCode', 'orgHeadName'],
  rejected: ['academyName'],
  bg_check_done: []
};

/** 이 문자를 보내려면 아직 채워야 할 설정 항목. 비어 있으면 보낼 수 있습니다. */
export const missingConfigFor = (type, config = {}) =>
  (REQUIRED_CONFIG[type] || []).filter(k => !String(config?.[k] || '').trim());

const CONFIG_LABEL = {
  academyName: '학원 이름', managerName: '채용 담당자 이름', managerPhone: '담당자 연락처',
  address: '면접 장소', mapUrl: '찾아오는 길 링크',
  crimsOrgId: 'CRIMS 사설기관 아이디', crimsCode: 'CRIMS 검증번호', orgHeadName: '기관장 이름'
};
export const configLabel = (key) => CONFIG_LABEL[key] || key;

const formatDate = (dateStr) => {
  const [y, m, d] = String(dateStr || '').split('-');
  if (!y || !m || !d) return dateStr || '';
  /* 'YYYY-MM-DD' 를 그대로 Date 에 넣으면 UTC 자정으로 읽힙니다.
     숫자를 따로 넘겨 현지 날짜로 만듭니다. */
  const day = ['일', '월', '화', '수', '목', '금', '토'][new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
  return `${y}년 ${Number(m)}월 ${Number(d)}일 (${day})`;
};

const formatTime = (timeStr) => {
  const [hStr, mStr] = String(timeStr || '').split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return timeStr || '';
  const ampm = h >= 12 ? '오후' : '오전';
  const hh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${ampm} ${hh}:${mStr || '00'}`;
};

/**
 * 실제로 보낼 문자 전문을 만듭니다.
 * 화면은 이 결과를 그대로 보여 주고, 사람이 확인한 뒤에만 발송합니다.
 */
export const buildMessage = (type, { applicant = {}, schedule = null, config = {} } = {}) => {
  const pos = findPosition(applicant.position);
  const academy = config.academyName || '';
  const name = applicant.name || '';

  if (type === 'interview_scheduled') {
    /* 면접 구성이 포지션마다 다릅니다. 강사는 필기와 시연이 있어
       미리 알려 주지 않으면 준비 없이 옵니다. */
    const parts = pos.interview.join(' · ');
    const note = pos.interview.length > 1
      ? `\n면접 구성 : ${parts}\n(필기와 시연이 포함되니 시간을 넉넉히 잡아 주세요.)`
      : `\n면접 구성 : ${parts}`;
    return `[${academy}]\n개인별 면접일정을 아래와 같이 안내드립니다.\n`
      + `면접일 : ${formatDate(schedule?.interviewDate)}\n`
      + `면접 시간 : ${formatTime(schedule?.interviewTime)}\n`
      + `면접장소 : ${config.address || academy}${note}\n`
      + (config.mapUrl ? `찾아오시는 길 : ${config.mapUrl}\n` : '')
      + `담당자 연락처 : ${config.managerPhone} (담당자. ${config.managerName})\n`
      + `해당 일정에 면접이 불가능하시면 담당자 연락처로 사전에 연락주시면 감사하겠습니다.`;
  }

  if (type === 'rejected') {
    return `안녕하세요. ${name} 지원자님, ${academy} 채용담당자입니다.\n`
      + `${academy} 채용 면접에 참석해주셔서 감사드립니다.\n`
      + `지원자님의 인상적인 경력과 열정에도 불구하고, 최종 면접결과 불합격 소식을 전해드리게 되었습니다.\n`
      + `소중한 시간을 할애해 주셨는데, 기대하시는 소식을 전해드리지 못해 진심으로 안타깝게 생각합니다.\n`
      + `제한된 모집 규모로 인해 이번 채용에는 함께하지 못하게 되었으나, 저희 ${academy}에 계속 관심 가져주시고, 기회가 된다면 다음에 다시 뵙기를 기대하겠습니다.\n`
      + `저희 ${academy}은 지원자님의 꿈을 앞으로도 계속 응원하겠습니다.\n감사합니다.`;
  }

  if (type === 'passed') {
    // 포지션에 맞는 말을 씁니다. 예전에는 강사에게도 '조교 합격' 이라고 나갔습니다.
    return `안녕하세요. ${name} 지원자님, ${academy} 채용담당자입니다.\n`
      + `${name} 지원자님의 ${academy} ${pos.kind} 최종 합격을 진심으로 축하드립니다.\n`
      + `이후 일정과 필수 진행사항을 안내드리오니, 문의사항이 있으시면 담당자에게 문자 바랍니다.\n\n`
      + `1. 학원에 근무하는 모든 분은 법적으로 성범죄, 아동학대 범죄경력조회가 필수입니다.\n`
      + `온라인 링크와 방법을 참조해드리오니 계약서 작성 전, 반드시 완료 부탁드립니다.\n`
      + `➀ https://crims.police.go.kr/ 에 접속합니다.\n`
      + `➁ 우측 상단, 간편인증 또는 휴대폰 인증을 통해 로그인합니다.\n`
      + `➂ 메인화면에서 “취업예정자 발급 동의 신청”을 클릭합니다.\n`
      + `➃ 팝업되는 발급동의 신청 유의 사항은 “예”를 선택하시면 됩니다.\n`
      + `➄ 사설 기관 아이디와 검증번호를 입력합니다.\n   아이디 : ${config.crimsOrgId}\n   검증번호 : ${config.crimsCode}\n`
      + `➅ 사설기관장과 사설기관명을 확인 후 동의를 클릭합니다. (${config.orgHeadName}, ${academy})\n`
      + `➆ 회보서 유형은 “성범죄경력 및 아동학대범죄전력 조회 회신서(학원)”, 인쇄유형은 “사설(기관) 출력” 선택하시면 됩니다.\n`
      + `➇ 하단 동의 사유는 “취업예정필수서류 제출용“으로 작성하시면 됩니다.\n`
      + `➈ 주소지 경찰서는 본인의 거주 관할 경찰서를 선택하시면 됩니다.\n`
      + `➉ 하단 왼쪽의 ”본인 범죄경력 확인“ 버튼을 클릭하고, 하단의 ”본인확인완료(시설장출력)“을 클릭하여 팝업하는 창의 ”본인확인“을 클릭합니다.\n\n`
      + `신청 후 학원에 경력조회 신청이 완료되었음을 알려주시면 됩니다.\n   ex) 경력조회 신청 완료하였습니다.\n`
      + `경력조회가 완료되면 이후 진행사항을 안내해 드리겠습니다.`;
  }

  if (type === 'bg_check_done') {
    return `경력조회가 확인되었습니다.\n\n`
      + `2. 근로계약서 작성을 위해 다음 사항을 회신 바랍니다.\n`
      + `- 이메일 주소, 본인 주민등록번호, 거주 주소, 계좌번호, 근무시작 희망 일자, 근로계약서 작성 희망 일자\n\n`
      + `3. 다음 서류를 근로계약서 작성일에 제출 바랍니다.\n`
      + `- 졸업증명서 (또는 수료증명서), 주민등록등본\n\n`
      + `4. 학원 내 프로그램 사용을 위해 이용하실 아이디와 비밀번호를 회신 바랍니다.`;
  }

  return '';
};

/** 전화번호를 숫자만 남깁니다. 10자리 미만이면 null. */
export const cleanPhone = (raw) => {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits : null;
};
