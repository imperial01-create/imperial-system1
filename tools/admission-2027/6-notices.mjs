/**
 * 6단계 — 입학처 공지사항에서 요강 밖의 정보를 긁는다.
 *
 * 노리는 것 세 가지.
 *   ① **요강 정정·변경 공고**  — 지금 있고, 3단계에서 파싱한 값을 무효로 만든다.
 *      요강 PDF는 6월에 확정되지만 그 뒤 정정 공고가 붙는다. 이걸 놓치면
 *      "출처가 원문 PDF"라는 이유로 틀린 값을 자신 있게 읽어 주게 된다.
 *   ② 고사장·면접 안내 — 논술·면접 시행 세부 안내.
 *   ③ 개인별 면접 시간 — **원서접수 마감(9월 중순) 이후에 올라온다.**
 *      지금 실행하면 대부분 '해당 공지 없음'이 정상 결과다. 9월 하순에 다시 돌린다.
 *
 * 사이트 구조가 151개 제각각이라 선택자(selector)로 긁지 않는다. 홈페이지·공지목록
 * HTML을 텍스트로 눌러 Gemini에게 "입시 일정과 관련된 공지만 골라라"고 시킨다.
 * 정확한 페이징까지 따라가지는 않는다 — 최신 공지는 첫 화면에 있다.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, sleep, logger } from './config.mjs';
import { ask } from './gemini.mjs';

const log = logger('6-notices');
const PORTALS = join(DIR.out, 'portals.json');
const OUT = join(DIR.out, 'notices.json');

if (!existsSync(PORTALS)) {
  log('portals.json 이 없습니다. 5-portal.mjs 를 먼저 실행하십시오.');
  process.exit(1);
}

const portals = JSON.parse(readFileSync(PORTALS, 'utf8'));
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    공지: {
      type: 'ARRAY',
      description: '2027학년도 입시와 관련된 공지만. 관련 없는 것(채용, 행사, 장학)은 넣지 않는다.',
      items: {
        type: 'OBJECT',
        properties: {
          제목: { type: 'STRING' },
          분류: {
            type: 'STRING',
            enum: ['요강정정', '면접고사안내', '개인별면접시간', '고사장안내', '원서접수안내', '기타입시'],
          },
          게시일: { type: 'STRING', description: 'YYYY-MM-DD. 목록에 있으면 그대로, 없으면 빈 문자열' },
          링크: { type: 'STRING', description: '상세 페이지 URL 또는 빈 문자열' },
          요지: { type: 'STRING', description: '제목에서 알 수 있는 내용만 한 줄로. 추측 금지' },
        },
        required: ['제목', '분류', '게시일', '링크', '요지'],
      },
    },
    관련공지없음: { type: 'BOOLEAN', description: '입시 관련 공지를 하나도 찾지 못했으면 true' },
  },
  required: ['공지', '관련공지없음'],
};

const SYSTEM = `당신은 대학 입학처 공지 목록에서 2027학년도 입시 일정 관련 공지만 골라냅니다.
제목에 없는 내용을 추측해 요지에 쓰지 마십시오. 날짜가 목록에 없으면 빈 문자열입니다.
'요강정정'은 이미 배포된 모집요강의 내용이 바뀌었다는 공고입니다 — 가장 중요하므로 놓치지 마십시오.
채용·학사·장학·행사 공지는 제외합니다.`;

/** HTML을 사람이 읽는 텍스트로 눌러 준다. 링크는 [텍스트](주소) 로 남긴다. */
function flatten(html, baseUrl) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const clean = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!clean) return ' ';
      let abs = href;
      try { abs = new URL(href, baseUrl).href; } catch { /* 상대경로 실패는 그대로 */ }
      return ` [${clean}](${abs}) `;
    })
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (s.length > 60000) s = s.slice(0, 60000);
  return s;
}

const targets = Object.entries(portals).filter(([, p]) => p.verified);
log(`확인된 입학처 ${targets.length}개 점검 시작`);

let found = 0; let empty = 0; let fail = 0;

for (const [i, [univ, p]] of targets.entries()) {
  const tag = `[${String(i + 1).padStart(3)}/${targets.length}] ${univ}`;
  if (prev[univ]?.checkedAt && !process.argv.includes('--force')) { continue; }

  const urls = [...new Set([p.공지사항, p.확인된주소, p.입학처].filter(Boolean))];
  const chunks = [];
  for (const url of urls.slice(0, 2)) {
    try {
      const res = await fetch(url, {
        redirect: 'follow', signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (!res.ok) continue;
      chunks.push(`### ${res.url}\n${flatten(await res.text(), res.url)}`);
    } catch { /* 다음 주소 */ }
  }

  if (!chunks.length) {
    prev[univ] = { checkedAt: new Date().toISOString(), error: '페이지를 읽지 못함', 공지: [] };
    log(`${tag} 읽기 실패`);
    fail++;
  } else {
    try {
      const r = await ask({
        system: SYSTEM,
        schema: SCHEMA,
        prompt: `대학: ${univ}\n오늘: ${new Date().toISOString().slice(0, 10)}\n\n`
          + `아래는 이 대학 입학처 페이지 내용입니다. 2027학년도 입시 관련 공지만 골라 주십시오.\n\n`
          + chunks.join('\n\n'),
      });
      prev[univ] = { checkedAt: new Date().toISOString(), ...r.data };
      const n = r.data.공지?.length ?? 0;
      const 정정 = (r.data.공지 ?? []).filter((c) => c.분류 === '요강정정').length;
      const 면접시간 = (r.data.공지 ?? []).filter((c) => c.분류 === '개인별면접시간').length;
      if (n) { found++; log(`${tag} 공지 ${n}건 (요강정정 ${정정} · 개인별면접시간 ${면접시간})`); }
      else { empty++; }
    } catch (e) {
      prev[univ] = { checkedAt: new Date().toISOString(), error: String(e.message).slice(0, 200), 공지: [] };
      log(`${tag} 판독 실패 — ${e.message}`);
      fail++;
    }
  }
  writeFileSync(OUT, JSON.stringify(prev, null, 2), 'utf8');
  await sleep(1200);
}

/* 요약 — 요강정정이 있으면 3단계 결과를 다시 봐야 한다 */
const 정정목록 = [];
for (const [univ, v] of Object.entries(prev)) {
  for (const c of v.공지 ?? []) if (c.분류 === '요강정정') 정정목록.push({ 대학: univ, ...c });
}
writeFileSync(join(DIR.out, 'notices-corrections.json'), JSON.stringify(정정목록, null, 2), 'utf8');

log(`완료 — 공지 발견 ${found} · 관련공지 없음 ${empty} · 실패 ${fail}`);
log(`⚠ 요강 정정 공고 ${정정목록.length}건 — 해당 대학은 파싱값을 다시 확인해야 합니다`);
for (const c of 정정목록.slice(0, 20)) log(`   ${c.대학}: ${c.제목}`);
