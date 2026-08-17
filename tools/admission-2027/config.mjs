/**
 * 2027학년도 수시 모집요강 수집·파싱 파이프라인 — 공통 설정.
 *
 * 이 폴더는 앱 번들과 무관합니다 (CRA는 src/ 와 public/ 만 봅니다).
 * 산출물은 OneDrive 밖(AppData\Local)에 둡니다 — PDF 원문이 1.3GB라
 * OneDrive 동기화에 올리면 다른 작업까지 느려집니다.
 */

import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..');

export const WORK = join(process.env.LOCALAPPDATA, 'imperial-admission-2027');
export const DIR = {
  pdf: join(WORK, 'pdf'),
  text: join(WORK, 'text'),
  parsed: join(WORK, 'parsed'),
  out: join(WORK, 'out'),
  log: join(WORK, 'log'),
};
for (const d of Object.values(DIR)) mkdirSync(d, { recursive: true });

/** 151개 대학 { n: 대학명, id: Google Drive 파일 ID, mb: 용량, r: 지역 } */
export const CATALOG = JSON.parse(readFileSync(join(HERE, 'catalog.json'), 'utf8'));

/**
 * 파일명에 쓸 안전한 이름. 대학명에 괄호·공백이 있어(강원대(춘천 삼척))
 * 그대로 쓰면 셸·경로에서 문제가 생긴다.
 */
export const slug = (name) => String(name).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');

/**
 * Gemini API 키.
 *
 * **운영 키(functions/.env 의 GEMINI_API_KEY)를 쓰지 않는다.**
 * 그 키는 성적표 OCR(parseReportCard)·시험지 분석(analyzeExamPaper)·클리닉
 * 피드백(refineFeedback)·통화 기록 분석·아침 브리핑이 함께 쓰는 자원이다.
 * 이 도구는 대학 151개를 한 번에 돌리므로, 같은 키를 쓰면 월 지출 한도를
 * 소진해 운영 기능을 통째로 멈춘다 — 2026-08-16에 실제로 그렇게 멈췄다.
 *
 * 그래서 전용 키를 환경변수로 **명시적으로** 넘겨야만 동작한다. 파일에서
 * 자동으로 찾아 쓰지 않는다. 실수로 운영 키가 쓰이는 경로 자체를 없앤다.
 *
 *   PowerShell:  $env:ADMISSION_GEMINI_KEY = "..."
 */
export function geminiKey() {
  const key = (process.env.ADMISSION_GEMINI_KEY ?? '').trim();
  if (!key) {
    throw new Error(
      '전용 Gemini 키가 없습니다.\n\n'
      + '  이 도구는 운영 키(functions/.env)를 쓰지 않습니다 — 같은 키를 쓰면\n'
      + '  성적표 OCR·시험지 분석·클리닉 피드백이 함께 멈춥니다.\n\n'
      + '  요강 수집 전용 키를 만들어 환경변수로 넘기십시오:\n'
      + '    $env:ADMISSION_GEMINI_KEY = "여기에 전용 키"\n',
    );
  }
  if (process.env.ADMISSION_GEMINI_KEY === readProductionKeyIfAny()) {
    throw new Error(
      '넘긴 키가 functions/.env 의 운영 키와 같습니다.\n'
      + '  운영 기능과 지출 한도를 공유하므로 이 도구에는 쓸 수 없습니다.\n'
      + '  별도 프로젝트에서 전용 키를 발급해 주십시오.\n',
    );
  }
  return key;
}

/** 운영 키와 같은지 비교하기 위해서만 읽는다. 없으면 null. */
function readProductionKeyIfAny() {
  try {
    const env = readFileSync(join(REPO, 'functions', '.env'), 'utf8');
    return env.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 진행 상황을 한 줄씩 남긴다 — 중간에 끊겨도 어디까지 됐는지 알아야 한다. */
export function logger(name) {
  const path = join(DIR.log, `${name}.log`);
  return (msg) => {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    try { appendFileSync(path, line + '\n'); } catch { /* 로그 실패는 무해 */ }
  };
}
