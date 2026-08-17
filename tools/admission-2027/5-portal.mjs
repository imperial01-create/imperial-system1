/**
 * 5단계 — 151개 대학의 입학처 주소를 확보하고 실제로 열리는지 검증한다.
 *
 * 왜 필요한가: 요강 PDF에 없는 것이 홈페이지에 따로 올라온다.
 *   · 개인별 면접 시간·순번  (원서접수 마감 후에 배정된다 — 지금은 아직 없다)
 *   · 고사장 배치 안내
 *   · **요강 정정·변경 공고**  ← 지금 당장 있고, 방금 파싱한 데이터를 뒤집는다
 *
 * Gemini가 아는 주소를 받아 쓰되 **반드시 HTTP로 확인한다.** 모델이 만들어 낸
 * 그럴듯한 주소를 그대로 저장하면 6단계가 조용히 빈 결과를 내놓는다.
 * 확인에 실패한 대학은 지어내지 않고 '주소 미확인'으로 남긴다.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, CATALOG, sleep, logger } from './config.mjs';
import { ask } from './gemini.mjs';

const log = logger('5-portal');
const OUT = join(DIR.out, 'portals.json');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    대학: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          이름: { type: 'STRING', description: '입력으로 준 대학명을 그대로' },
          입학처: { type: 'STRING', description: '입학처 홈페이지 URL. 확실하지 않으면 빈 문자열' },
          공지사항: { type: 'STRING', description: '입학처 공지사항 목록 페이지 URL. 모르면 빈 문자열' },
          확신도: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['이름', '입학처', '공지사항', '확신도'],
      },
    },
  },
  required: ['대학'],
};

const SYSTEM = `당신은 한국 대학 입학처 홈페이지 주소를 정리합니다.
확실히 아는 것만 적고, 모르는 것은 빈 문자열과 확신도 low 를 씁니다.
그럴듯한 주소를 추측해서 만들지 마십시오 — 틀린 주소는 없는 주소보다 나쁩니다.
캠퍼스가 나뉜 대학(강원대(원주), 상명대(천안) 등)은 해당 캠퍼스 입학처가 따로 있으면 그것을, 없으면 본교 입학처를 씁니다.`;

/** 이미 검증된 것은 다시 묻지 않는다. */
const known = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const todo = CATALOG.filter((u) => !known[u.n]?.verified);
log(`주소가 필요한 대학 ${todo.length}개 (전체 ${CATALOG.length})`);

/* ── 1) 주소 후보 받기 (30개씩 묶어서) ── */
const candidates = {};
for (let i = 0; i < todo.length; i += 30) {
  const batch = todo.slice(i, i + 30);
  try {
    const r = await ask({
      system: SYSTEM,
      schema: SCHEMA,
      prompt: `다음 대학들의 입학처 홈페이지와 입학처 공지사항 페이지 주소를 알려주십시오.\n\n${batch.map((u) => `- ${u.n} (${u.r})`).join('\n')}`,
    });
    for (const row of r.data.대학 ?? []) candidates[row.이름] = row;
    log(`  후보 수집 ${i + batch.length}/${todo.length}`);
  } catch (e) {
    log(`  후보 수집 실패 (${i}~) — ${e.message}`);
  }
  await sleep(1000);
}

/* ── 2) 실제로 열리는지 확인 ── */
/** 대학명의 핵심 토큰이 페이지에 있는지 — 엉뚱한 사이트를 걸러낸다. */
function looksRight(html, univName) {
  const core = univName.replace(/\(.*?\)/g, '').replace(/대$/, '').trim();
  const lower = html.toLowerCase();
  return html.includes(core) || html.includes(`${core}대`)
    || /입학|admission|모집요강|수시/.test(html) && lower.includes('<title');
}

let verified = 0; let unknown = 0;
for (const [i, u] of todo.entries()) {
  const c = candidates[u.n];
  const tag = `[${String(i + 1).padStart(3)}/${todo.length}] ${u.n}`;

  if (!c?.입학처) {
    known[u.n] = { verified: false, reason: '모델이 주소를 모름', 확신도: c?.확신도 ?? 'low' };
    log(`${tag} 주소 미확인`);
    unknown++;
    continue;
  }

  const tryUrls = [c.입학처, c.공지사항].filter(Boolean);
  let hit = null;
  for (const url of tryUrls) {
    try {
      const ctl = AbortSignal.timeout(15000);
      const res = await fetch(url, { redirect: 'follow', signal: ctl, headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      if (looksRight(html, u.n)) { hit = { url: res.url, bytes: html.length }; break; }
    } catch { /* 다음 후보 */ }
  }

  if (hit) {
    known[u.n] = {
      verified: true, 입학처: c.입학처, 공지사항: c.공지사항 || '',
      확인된주소: hit.url, 확신도: c.확신도, 확인시각: new Date().toISOString(),
    };
    verified++;
    log(`${tag} 확인 — ${hit.url}`);
  } else {
    known[u.n] = { verified: false, reason: '주소가 열리지 않거나 다른 사이트', 후보: tryUrls, 확신도: c.확신도 };
    unknown++;
    log(`${tag} 열리지 않음`);
  }
  writeFileSync(OUT, JSON.stringify(known, null, 2), 'utf8');
  await sleep(700);
}

log(`완료 — 확인 ${verified} · 미확인 ${unknown} → ${OUT}`);
