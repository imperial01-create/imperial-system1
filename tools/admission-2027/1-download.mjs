/**
 * 1단계 — 151개 대학의 2027학년도 수시 모집요강 PDF를 받는다.
 *
 * 출처는 Google Drive에 공개된 원문 PDF다. 각 대학 입학처가 공개한 공문서이며
 * 로그인 없이 열람 가능하다. 예의상 요청 간 간격을 두고 순차로 받는다.
 *
 * 이어받기: 이미 받은 파일(크기 검증 통과)은 건너뛴다. 중간에 끊고 다시 실행해도 된다.
 * 실패 기록: HTML(용량 초과 경고 페이지)이 오면 PDF가 아니라고 표시하고 넘어간다 —
 *            조용히 0바이트를 남기면 다음 단계가 "요강이 없는 대학"으로 착각한다.
 */

import { writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG, DIR, slug, sleep, logger } from './config.mjs';

const log = logger('1-download');
const STATE = join(DIR.log, 'download-state.json');

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2), 'utf8');

/**
 * 받은 것이 정말 PDF인가. Drive는 실패 시 HTML 안내 페이지를 200으로 준다.
 *
 * 앞쪽 공백·줄바꿈을 넘겨 가며 찾는다 — 상명대 파일은 `\r\n%PDF-1.6` 으로
 * 시작해서 0바이트부터 검사하면 PDF가 아니라고 판정된다(실제로 그렇게 3건을 놓쳤다).
 * PDF 리더는 앞쪽 1024바이트 안의 %PDF- 를 찾도록 되어 있으니 같은 규칙을 쓴다.
 */
function isPdf(buf) {
  if (buf.length <= 1024) return false;
  const head = buf.subarray(0, 1024).toString('latin1');
  return head.indexOf('%PDF-') >= 0;
}

/** 앞쪽 쓰레기 바이트를 잘라 %PDF- 부터 시작하게 만든다. */
function normalizePdf(buf) {
  const at = buf.subarray(0, 1024).toString('latin1').indexOf('%PDF-');
  return at > 0 ? buf.subarray(at) : buf;
}

async function fetchOne(univ) {
  const url = `https://drive.usercontent.google.com/download?id=${univ.id}&export=download&confirm=t`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const total = CATALOG.length;
let done = 0; let skipped = 0; let failed = 0;

for (const [i, univ] of CATALOG.entries()) {
  const name = slug(univ.n);
  const path = join(DIR.pdf, `${name}.pdf`);
  const tag = `[${String(i + 1).padStart(3)}/${total}] ${univ.n}`;

  // 이미 받았고 크기가 그럴듯하면 건너뛴다 (카탈로그 용량의 80% 이상)
  if (existsSync(path)) {
    const mb = statSync(path).size / 1048576;
    if (mb >= Math.max(0.05, univ.mb * 0.8)) { skipped++; continue; }
  }

  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    try {
      const buf = await fetchOne(univ);
      if (!isPdf(buf)) {
        // 무엇이 왔는지 남겨 둔다 — 원인 파악에 필요하다
        writeFileSync(join(DIR.log, `notpdf-${name}.html`), buf);
        throw new Error(`PDF 아님 (${(buf.length / 1024).toFixed(0)}KB) — Drive 안내 페이지일 수 있음`);
      }
      const pdf = normalizePdf(buf);
      writeFileSync(path, pdf);
      state[univ.n] = { ok: true, mb: +(pdf.length / 1048576).toFixed(2), at: new Date().toISOString() };
      log(`${tag} 받음 ${(buf.length / 1048576).toFixed(1)}MB`);
      ok = true; done++;
    } catch (e) {
      if (attempt === 3) {
        state[univ.n] = { ok: false, error: String(e.message), at: new Date().toISOString() };
        log(`${tag} 실패 — ${e.message}`);
        failed++;
      } else {
        await sleep(2500 * attempt);
      }
    }
  }
  save();
  await sleep(1500); // 예의
}

log(`완료 — 새로 받음 ${done} · 건너뜀 ${skipped} · 실패 ${failed} (전체 ${total})`);
