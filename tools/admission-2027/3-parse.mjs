/**
 * 3단계 — 요강 텍스트를 Gemini로 구조화한다.
 *
 * 문서 전체를 넣는다. 키워드로 페이지를 골라 넣으면 입력은 줄지만 표가 여러
 * 페이지에 걸친 경우 뒷장을 잃는다. gemini-2.5-flash 는 100만 토큰을 받으므로
 * 요강 하나(보통 8만~15만 자 ≈ 5만~9만 토큰)는 통째로 들어간다.
 *
 * 아주 큰 문서만 관련 페이지 + 앞뒤 1장으로 좁힌다.
 *
 * 이어서 실행 가능: 이미 파싱된 대학은 건너뛴다.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, slug, CATALOG, sleep, logger } from './config.mjs';
import { requireConsent } from './0-estimate.mjs';
import { UNIV_SCHEMA, SYSTEM } from './schema.mjs';

// 비용을 먼저 보여 주고 --yes 가 없으면 여기서 끝난다. API 호출 전에 막는다.
requireConsent(process.argv);

const { ask } = await import('./gemini.mjs');
const log = logger('3-parse');
const CONCURRENCY = 3;
const FULL_DOC_LIMIT = 400_000; // 자. 이보다 크면 관련 페이지만
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const KEYWORDS = /최저학력기준|모집인원|전형방법|전형요소|고사|면접|논술|실기|일정|접수|발표|변경|반영비율|지원자격|수능/;

/** 큰 문서는 관련 페이지와 그 앞뒤 한 장씩만 남긴다. */
function selectPages(pages) {
  const keep = new Set();
  for (const pg of pages) {
    if (KEYWORDS.test(pg.text)) {
      keep.add(pg.p - 1); keep.add(pg.p); keep.add(pg.p + 1);
    }
  }
  return pages.filter((pg) => keep.has(pg.p));
}

function buildPrompt(doc) {
  let pages = doc.pages;
  let note = '';
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  if (total > FULL_DOC_LIMIT) {
    pages = selectPages(pages);
    note = `\n(주의: 원문이 매우 길어 관련 페이지 ${pages.length}/${doc.numPages}장만 발췌했습니다. `
      + '발췌에 없는 내용은 누락 항목에 적어 주십시오.)\n';
  }
  const body = pages.map((p) => `\n===== p.${p.p} =====\n${p.text}`).join('\n');
  return `대학: ${doc.univ}\n학년도: 2027학년도\n전체 ${doc.numPages}페이지${note}\n`
    + `아래는 이 대학의 2027학년도 수시 모집요강 원문 텍스트입니다. `
    + `페이지 구분(===== p.N =====)을 근거페이지로 사용하십시오.\n${body}`;
}

const targets = CATALOG
  .map((u) => ({ ...u, name: slug(u.n) }))
  .filter((u) => existsSync(join(DIR.text, `${u.name}.json`)))
  .filter((u) => (ONLY.length ? ONLY.includes(u.n) : true));

log(`대상 ${targets.length}개 대학${ONLY.length ? ` (지정: ${ONLY.join(', ')})` : ''}`);

let ok = 0; let fail = 0; let skip = 0; let tokensIn = 0; let tokensOut = 0;

async function work(u) {
  const outPath = join(DIR.parsed, `${u.name}.json`);
  if (existsSync(outPath)) { skip++; return; }

  const doc = JSON.parse(readFileSync(join(DIR.text, `${u.name}.json`), 'utf8'));

  if (doc.needsOcr) {
    // 스캔본은 텍스트가 없다. 지어내지 않고 표시만 남긴다 (4단계에서 별도 처리).
    writeFileSync(outPath, JSON.stringify({
      univ: u.n, region: u.r, numPages: doc.numPages,
      needsOcr: true, 전형: [], 주요변경사항: [],
      누락: ['스캔본 PDF로 텍스트가 없습니다 — 이미지 판독(OCR)이 필요합니다.'],
    }, null, 2), 'utf8');
    log(`  ${u.n} — 스캔본, 텍스트 파싱 건너뜀`);
    skip++;
    return;
  }

  try {
    const t0 = Date.now();
    const r = await ask({ system: SYSTEM, prompt: buildPrompt(doc), schema: UNIV_SCHEMA });
    const data = {
      univ: u.n, region: u.r, numPages: doc.numPages,
      parsedAt: new Date().toISOString(),
      model: 'gemini-2.5-flash',
      ...r.data,
    };
    writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    tokensIn += r.usage.promptTokenCount ?? 0;
    tokensOut += r.usage.candidatesTokenCount ?? 0;
    const rows = data.전형?.length ?? 0;
    const lows = (data.전형 ?? []).filter((t) => t.확신도 === 'low').length;
    log(`  ${u.n} — 전형 ${rows}행 (low ${lows}) · 변경 ${data.주요변경사항?.length ?? 0}건 · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    ok++;
  } catch (e) {
    writeFileSync(join(DIR.log, `parse-error-${u.name}.txt`), String(e.stack ?? e), 'utf8');
    log(`  ${u.n} — 실패: ${String(e.message).slice(0, 200)}`);
    fail++;
  }
}

// 동시 3개. 사용량 제한에 걸리면 gemini.mjs 가 백오프한다.
const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const u = queue.shift();
    await work(u);
    await sleep(600);
  }
}));

log(`완료 — 성공 ${ok} · 실패 ${fail} · 건너뜀 ${skip}`);
log(`토큰 — 입력 ${(tokensIn / 1e6).toFixed(2)}M · 출력 ${(tokensOut / 1e6).toFixed(2)}M`);
