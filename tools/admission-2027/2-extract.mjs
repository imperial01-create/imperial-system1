/**
 * 2단계 — PDF에서 페이지별 텍스트를 뽑는다.
 *
 * 왜 텍스트로 먼저 바꾸는가: 이미지를 그대로 Gemini에 넣으면 비용이 10배 이상이고
 * 느리다. 요강은 대부분 한글 워드/HWP에서 나온 텍스트 PDF라 그대로 읽힌다.
 *
 * 텍스트가 거의 없는 PDF(스캔본)는 값을 지어내지 않고 needsOcr 로 표시한다 —
 * 이 프로젝트 원칙대로, 판정할 수 없으면 없다고 쓴다.
 *
 * 페이지 번호를 살려 둔다. 나중에 조교가 원문을 대조할 때 "몇 페이지"가 없으면
 * 검수가 사실상 불가능하다.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, slug, CATALOG, logger } from './config.mjs';

const log = logger('2-extract');

// Node에서는 legacy 빌드를 쓴다. 워커는 끄고 메인 스레드에서 처리한다.
const pdfjsPath = new URL(
  '../../node_modules/pdfjs-dist/legacy/build/pdf.mjs',
  import.meta.url,
).href;
const pdfjs = await import(pdfjsPath);

/** 한 PDF → { pages: [{ p, text }], chars, needsOcr } */
async function extract(path) {
  const data = new Uint8Array(readFileSync(path));
  const doc = await pdfjs.getDocument({
    data,
    // 폰트·표준 폰트 데이터를 못 찾아도 텍스트 추출은 되므로 경고만 줄인다
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const pages = [];
  let chars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    /*
     * items 를 그냥 이어 붙이면 표의 칸이 한 줄로 뭉개진다.
     * y 좌표가 바뀌면 줄바꿈, 같은 줄이면 탭으로 나눠 표 구조를 최대한 살린다.
     */
    let lastY = null;
    let line = [];
    const lines = [];
    for (const it of content.items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (line.length) lines.push(line.join('\t'));
        line = [];
      }
      line.push(it.str);
      lastY = y;
    }
    if (line.length) lines.push(line.join('\t'));

    const text = lines.join('\n').replace(/[ \t]+/g, (m) => (m.includes('\t') ? '\t' : ' ')).trim();
    chars += text.length;
    pages.push({ p, text });
    page.cleanup();
  }
  await doc.destroy();

  // 페이지당 평균 80자 미만이면 사실상 스캔본이다
  const needsOcr = doc.numPages > 0 && chars / doc.numPages < 80;
  return { numPages: doc.numPages, pages, chars, needsOcr };
}

const targets = CATALOG
  .map((u) => ({ ...u, name: slug(u.n), pdf: join(DIR.pdf, `${slug(u.n)}.pdf`) }))
  .filter((u) => existsSync(u.pdf));

log(`대상 PDF ${targets.length}개 (카탈로그 ${CATALOG.length}개 중)`);

const summary = [];
for (const [i, u] of targets.entries()) {
  const outPath = join(DIR.text, `${u.name}.json`);
  const tag = `[${String(i + 1).padStart(3)}/${targets.length}] ${u.n}`;

  if (existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    summary.push({ univ: u.n, numPages: prev.numPages, chars: prev.chars, needsOcr: prev.needsOcr, cached: true });
    continue;
  }

  try {
    const t0 = Date.now();
    const r = await extract(u.pdf);
    writeFileSync(outPath, JSON.stringify({ univ: u.n, region: u.r, ...r }), 'utf8');
    summary.push({ univ: u.n, numPages: r.numPages, chars: r.chars, needsOcr: r.needsOcr });
    log(`${tag} ${r.numPages}p · ${(r.chars / 1000).toFixed(0)}k자 · ${((Date.now() - t0) / 1000).toFixed(1)}s${r.needsOcr ? ' · ⚠ 스캔본(텍스트 없음)' : ''}`);
  } catch (e) {
    summary.push({ univ: u.n, error: String(e.message) });
    log(`${tag} 실패 — ${e.message}`);
  }
}

writeFileSync(join(DIR.log, 'extract-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

const ocr = summary.filter((s) => s.needsOcr);
const err = summary.filter((s) => s.error);
log(`완료 — 성공 ${summary.length - err.length} · 실패 ${err.length} · 스캔본(OCR 필요) ${ocr.length}`);
if (ocr.length) log(`스캔본: ${ocr.map((s) => s.univ).join(', ')}`);
if (err.length) log(`실패: ${err.map((s) => s.univ).join(', ')}`);
