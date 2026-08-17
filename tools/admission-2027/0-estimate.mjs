/**
 * 0단계 — 파싱 전에 **비용을 먼저 보여 준다.** API를 한 건도 호출하지 않는다.
 *
 * 이 파일이 있는 이유: 2026-08-16에 비용을 알리지 않고 파싱을 돌려 프로젝트
 * 월 지출 한도를 소진했고, 같은 키를 쓰는 운영 기능(성적표 OCR·시험지 분석·
 * 클리닉 피드백·통화 분석·아침 브리핑)이 함께 멈췄다.
 *
 * 실측 기준: 대학 27개를 파싱한 결과 원문 2,007,393자 → 입력 약 1.43M 토큰.
 * 즉 한글 요강은 대략 1.4자당 1토큰이다.
 *
 * 3단계 스크립트는 이 추정을 보여 주고 --yes 를 붙이지 않으면 실행되지 않는다.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, slug, CATALOG } from './config.mjs';

/** gemini-2.5-flash 단가 (USD / 1M 토큰). 바뀌면 여기만 고친다. */
export const PRICE = { input: 0.30, output: 2.50 };

/** 한글 요강 실측 비율 — 문자 수 ÷ 1.4 ≈ 토큰 수 */
const CHARS_PER_TOKEN = 1.4;
/** 대학당 출력 + 사고 토큰 실측 근사 */
const OUTPUT_TOKENS_PER_UNIV = 14_000;
/** 스캔본은 PDF 페이지당 약 258 토큰으로 계산된다 */
const TOKENS_PER_SCAN_PAGE = 258;

export function estimate() {
  const rows = [];
  for (const u of CATALOG) {
    const name = slug(u.n);
    const textPath = join(DIR.text, `${name}.json`);
    const parsedPath = join(DIR.parsed, `${name}.json`);

    if (!existsSync(textPath)) {
      rows.push({ 대학: u.n, 상태: 'PDF 없음', inTok: 0, outTok: 0 });
      continue;
    }
    const t = JSON.parse(readFileSync(textPath, 'utf8'));

    // 이미 파싱된 대학은 건너뛰므로 비용이 0이다 (이어받기)
    const already = existsSync(parsedPath)
      && (JSON.parse(readFileSync(parsedPath, 'utf8')).전형?.length ?? 0) > 0;
    if (already) {
      rows.push({ 대학: u.n, 상태: '이미 완료', inTok: 0, outTok: 0 });
      continue;
    }

    if (t.needsOcr) {
      rows.push({
        대학: u.n, 상태: `스캔본 ${t.numPages}p`,
        inTok: t.numPages * TOKENS_PER_SCAN_PAGE,
        outTok: OUTPUT_TOKENS_PER_UNIV,
      });
    } else {
      rows.push({
        대학: u.n, 상태: `텍스트 ${(t.chars / 1000).toFixed(0)}k자`,
        inTok: Math.round(t.chars / CHARS_PER_TOKEN),
        outTok: OUTPUT_TOKENS_PER_UNIV,
      });
    }
  }

  const todo = rows.filter((r) => r.inTok > 0);
  const inTok = todo.reduce((n, r) => n + r.inTok, 0);
  const outTok = todo.reduce((n, r) => n + r.outTok, 0);
  const usd = (inTok / 1e6) * PRICE.input + (outTok / 1e6) * PRICE.output;

  return { rows, todo, inTok, outTok, usd };
}

/** 3단계에서 부르는 게이트. --yes 가 없으면 여기서 멈춘다. */
export function requireConsent(argv) {
  const e = estimate();
  const done = e.rows.filter((r) => r.상태 === '이미 완료').length;
  const noPdf = e.rows.filter((r) => r.상태 === 'PDF 없음').length;

  console.log('');
  console.log('─'.repeat(64));
  console.log('  이 실행은 Gemini API를 유료로 호출합니다.');
  console.log('─'.repeat(64));
  console.log(`  처리할 대학      ${e.todo.length}개  (이미 완료 ${done} · PDF 없음 ${noPdf})`);
  console.log(`  입력 토큰 추정   ${(e.inTok / 1e6).toFixed(2)}M`);
  console.log(`  출력 토큰 추정   ${(e.outTok / 1e6).toFixed(2)}M  (사고 토큰 포함 근사)`);
  console.log(`  예상 비용        약 $${e.usd.toFixed(2)}  (gemini-2.5-flash 기준)`);
  console.log('');
  console.log('  ⚠ 프로젝트 월 지출 한도를 넘기면 그 키를 쓰는 다른 기능도 함께 멈춥니다.');
  console.log('    이 도구는 전용 키(ADMISSION_GEMINI_KEY)만 받습니다.');
  console.log('─'.repeat(64));

  if (!argv.includes('--yes')) {
    console.log('');
    console.log('  실행하지 않았습니다. 위 비용을 확인하신 뒤 --yes 를 붙여 주십시오.');
    console.log('    node 3-parse.mjs --yes');
    console.log('');
    process.exit(0);
  }
  console.log('  --yes 확인됨 — 시작합니다.');
  console.log('');
  return e;
}

// 직접 실행하면 추정만 출력한다
if (process.argv[1] && process.argv[1].endsWith('0-estimate.mjs')) {
  const e = estimate();
  console.table(e.todo.slice(0, 15).map((r) => ({
    대학: r.대학, 상태: r.상태, 입력토큰: r.inTok.toLocaleString(),
  })));
  console.log(`... 처리 대상 ${e.todo.length}개 중 15개만 표시`);
  console.log('');
  console.log(`처리 대상        ${e.todo.length}개`);
  console.log(`입력 토큰 추정   ${(e.inTok / 1e6).toFixed(2)}M`);
  console.log(`출력 토큰 추정   ${(e.outTok / 1e6).toFixed(2)}M`);
  console.log(`예상 비용        약 $${e.usd.toFixed(2)}`);
}
