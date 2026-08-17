/**
 * 3b단계 — 스캔본 PDF를 Gemini File API로 직접 판독한다.
 *
 * 요강의 12%(18개 대학)는 종이를 스캔한 PDF라 텍스트가 한 글자도 없다.
 * 그냥 두면 "그 대학은 요강이 없다"가 되어 상담에서 조용히 빠진다 — 가장 나쁜 실패다.
 *
 * 왜 이미지 렌더링이 아니라 File API인가
 *   · 페이지를 PNG로 굽자면 canvas 백엔드를 새로 깔아야 한다(의존성 추가).
 *   · inlineData 는 요청당 20MB 한도라 60~96MB 스캔본이 안 들어간다.
 *   · File API는 2GB까지 받고, Gemini가 PDF를 페이지 단위로 알아서 판독한다.
 *     페이지 번호도 문서 자체에서 세므로 근거페이지가 어긋나지 않는다.
 *
 * 업로드한 파일은 처리 후 지운다 — 남겨 두면 요강 원문이 계정에 계속 쌓인다.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, slug, CATALOG, geminiKey, sleep, logger } from './config.mjs';
import { requireConsent } from './0-estimate.mjs';
import { UNIV_SCHEMA, SYSTEM } from './schema.mjs';

// 비용을 먼저 보여 주고 --yes 가 없으면 여기서 끝난다.
requireConsent(process.argv);

const log = logger('3b-parse-scan');
const KEY = geminiKey();
const BASE = 'https://generativelanguage.googleapis.com';

/** 재개 가능한 업로드로 PDF를 올린다 → { uri, name } */
async function upload(path, displayName) {
  const bytes = statSync(path).size;

  const start = await fetch(`${BASE}/upload/v1beta/files?key=${KEY}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes),
      'X-Goog-Upload-Header-Content-Type': 'application/pdf',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!start.ok) throw new Error(`업로드 시작 실패 HTTP ${start.status} ${(await start.text()).slice(0, 200)}`);

  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('업로드 URL을 받지 못했습니다');

  const put = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: readFileSync(path),
  });
  if (!put.ok) throw new Error(`업로드 실패 HTTP ${put.status} ${(await put.text()).slice(0, 200)}`);

  const { file } = await put.json();

  // ACTIVE 가 될 때까지 기다린다 — PROCESSING 상태로 쓰면 400이 난다
  for (let i = 0; i < 60; i++) {
    const st = await fetch(`${BASE}/v1beta/${file.name}?key=${KEY}`).then((r) => r.json());
    if (st.state === 'ACTIVE') return { uri: st.uri, name: st.name };
    if (st.state === 'FAILED') throw new Error(`파일 처리 실패: ${JSON.stringify(st.error ?? {})}`);
    await sleep(3000);
  }
  throw new Error('파일이 ACTIVE 상태가 되지 않았습니다 (3분 초과)');
}

async function remove(name) {
  try { await fetch(`${BASE}/v1beta/${name}?key=${KEY}`, { method: 'DELETE' }); } catch { /* 정리 실패는 무해 */ }
}

async function readScan(fileUri, univ, numPages) {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { fileData: { mimeType: 'application/pdf', fileUri } },
        {
          text: `위 문서는 ${univ}의 2027학년도 수시 모집요강(전체 ${numPages}페이지) 스캔본입니다.\n`
            + `스캔 이미지이므로 표를 눈으로 읽어야 합니다. 흐릿해서 확실하지 않은 값은 확신도를 low 로 두고,\n`
            + `아예 읽을 수 없으면 그 행을 만들지 말고 누락 항목에 어느 페이지가 판독 불가인지 적으십시오.\n`
            + `근거페이지는 문서의 실제 페이지 번호(인쇄된 쪽번호가 아니라 PDF 몇 번째 장)를 씁니다.`,
        },
      ],
    }],
    systemInstruction: { parts: [{ text: SYSTEM }] },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseSchema: UNIV_SCHEMA,
    },
  };

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) { await sleep(Math.min(90000, 6000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const cand = json.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== 'STOP') {
      throw new Error(`응답 비정상 종료 (${cand.finishReason}) — 출력이 잘렸을 수 있습니다`);
    }
    const raw = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!raw) throw new Error('빈 응답');
    return { data: JSON.parse(raw), usage: json.usageMetadata ?? {} };
  }
  throw new Error('재시도 소진');
}

const scans = CATALOG
  .map((u) => ({ ...u, name: slug(u.n) }))
  .filter((u) => {
    const p = join(DIR.text, `${u.name}.json`);
    return existsSync(p) && JSON.parse(readFileSync(p, 'utf8')).needsOcr === true;
  });

const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = ONLY.length ? scans.filter((s) => ONLY.includes(s.n)) : scans;

log(`스캔본 ${targets.length}개: ${targets.map((s) => s.n).join(', ')}`);

let ok = 0; let fail = 0; let skip = 0;
for (const [i, u] of targets.entries()) {
  const outPath = join(DIR.parsed, `${u.name}.json`);
  const tag = `[${i + 1}/${targets.length}] ${u.n}`;

  const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
  if (prev?.전형?.length > 0) { skip++; continue; }

  const pdfPath = join(DIR.pdf, `${u.name}.pdf`);
  const mb = statSync(pdfPath).size / 1048576;
  const doc = JSON.parse(readFileSync(join(DIR.text, `${u.name}.json`), 'utf8'));

  let uploaded = null;
  try {
    const t0 = Date.now();
    log(`${tag} 업로드 중 (${mb.toFixed(0)}MB, ${doc.numPages}p)...`);
    uploaded = await upload(pdfPath, `${u.name}-2027.pdf`);
    const r = await readScan(uploaded.uri, u.n, doc.numPages);
    writeFileSync(outPath, JSON.stringify({
      univ: u.n, region: u.r, numPages: doc.numPages,
      parsedAt: new Date().toISOString(),
      model: 'gemini-2.5-flash (스캔본 이미지 판독)',
      fromScan: true,
      ...r.data,
    }, null, 2), 'utf8');
    const rows = r.data.전형?.length ?? 0;
    const lows = (r.data.전형 ?? []).filter((t) => t.확신도 === 'low').length;
    log(`${tag} 전형 ${rows}행 (low ${lows}) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    ok++;
  } catch (e) {
    log(`${tag} 실패 — ${String(e.message).slice(0, 200)}`);
    fail++;
  } finally {
    if (uploaded) await remove(uploaded.name);
  }
  await sleep(1500);
}

log(`완료 — 성공 ${ok} · 실패 ${fail} · 건너뜀 ${skip}`);
