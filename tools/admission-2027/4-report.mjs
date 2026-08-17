/**
 * 4단계 — 파싱 결과를 검수용 엑셀 한 부로 조립한다.
 *
 * 이 파일의 목적은 "데이터"가 아니라 **검수**다. 자동 추출은 반드시 일부가 틀리므로,
 * 조교가 원문과 대조할 수 있는 형태여야 한다. 그래서 모든 행에
 *   · 근거페이지  · 확신도  · PDF 파일명
 * 을 달고, 빈 [검수] / [검수메모] 열을 둔다. 사람이 채우는 칸이 없으면 검수가 안 굴러간다.
 *
 * 시트 구성
 *   전형        판정에 직접 쓰이는 본 데이터 (수능최저·고사일·모집인원)
 *   대학일정    원서접수·서류마감·발표·면접시간 공지방식
 *   변경사항    2026 → 2027 무엇이 바뀌었나 (가장 먼저 읽어야 하는 시트)
 *   점검필요    확신도 low · 스캔본 · 누락 신고 — 여기부터 손대면 된다
 *   수집현황    151개 대학 각각 어디까지 됐는지
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, slug, CATALOG, logger } from './config.mjs';

const log = logger('4-report');
const xlsx = await import(new URL('../../node_modules/xlsx/xlsx.mjs', import.meta.url).href);

const state = existsSync(join(DIR.log, 'download-state.json'))
  ? JSON.parse(readFileSync(join(DIR.log, 'download-state.json'), 'utf8'))
  : {};

const rows전형 = [];
const rows일정 = [];
const rows변경 = [];
const rows현황 = [];

for (const u of CATALOG) {
  const name = slug(u.n);
  const pdfPath = join(DIR.pdf, `${name}.pdf`);
  const textPath = join(DIR.text, `${name}.json`);
  const parsedPath = join(DIR.parsed, `${name}.json`);

  const has = { pdf: existsSync(pdfPath), text: existsSync(textPath), parsed: existsSync(parsedPath) };
  const text = has.text ? JSON.parse(readFileSync(textPath, 'utf8')) : null;
  const d = has.parsed ? JSON.parse(readFileSync(parsedPath, 'utf8')) : null;

  let 상태 = '미수집';
  if (!has.pdf) 상태 = `PDF 실패 (${state[u.n]?.error ?? '원인 미기록'})`;
  else if (text?.needsOcr) 상태 = '스캔본 — 이미지 판독 필요';
  else if (!has.parsed) 상태 = '파싱 대기';
  else if ((d?.전형?.length ?? 0) === 0) 상태 = '파싱됐으나 전형 0행 — 확인 필요';
  else 상태 = '완료';

  rows현황.push({
    대학: u.n, 지역: u.r, 상태,
    PDF용량MB: has.pdf ? state[u.n]?.mb ?? '' : '',
    페이지: text?.numPages ?? '',
    추출문자수: text?.chars ?? '',
    전형행수: d?.전형?.length ?? 0,
    확신도low: (d?.전형 ?? []).filter((t) => t.확신도 === 'low').length,
    변경사항: d?.주요변경사항?.length ?? 0,
    누락신고: (d?.누락 ?? []).join(' / '),
  });

  if (!d) continue;

  rows일정.push({
    대학: u.n, 지역: u.r,
    원서접수시작: d.원서접수_시작 ?? '', 원서접수마감: d.원서접수_마감 ?? '',
    서류제출마감: d.서류제출_마감 ?? '', 합격발표: d.합격발표 ?? '',
    면접시간_공지방식: d.면접시간_공지방식 ?? '',
    이미지판독: d.fromScan ? 'Y' : '',
    누락: (d.누락 ?? []).join(' / '),
    검수: '', 검수메모: '',
  });

  for (const c of d.주요변경사항 ?? []) {
    rows변경.push({
      대학: u.n, 항목: c.항목 ?? '', 전형명: c.전형명 ?? '',
      '2026학년도': c.변경전 ?? '', '2027학년도': c.변경후 ?? '',
      근거페이지: c.근거페이지 ?? '', PDF: `${name}.pdf`,
      검수: '', 검수메모: '',
    });
  }

  for (const t of d.전형 ?? []) {
    const dates = Array.isArray(t.고사일) ? t.고사일 : [];
    rows전형.push({
      대학: u.n, 지역: u.r,
      모집시기: t.모집시기 ?? '', 전형유형: t.전형유형 ?? '', 전형명: t.전형명 ?? '',
      모집단위: t.모집단위 ?? '',
      모집인원: Number.isFinite(t.모집인원) && t.모집인원 >= 0 ? t.모집인원 : '',
      전형방법: t.전형방법 ?? '',
      수능최저적용: t.수능최저_적용 ? 'Y' : 'N',
      수능최저_원문: t.수능최저_원문 ?? '',
      고사종류: t.고사종류 ?? '',
      고사일_원문: t.고사일_원문 ?? '',
      고사일1: dates[0] ?? '', 고사일2: dates[1] ?? '', 고사일3: dates[2] ?? '',
      고사시간: t.고사시간 ?? '',
      확신도: t.확신도 ?? '',
      근거페이지: (t.근거페이지 ?? []).join(','),
      PDF: `${name}.pdf`,
      이미지판독: d.fromScan ? 'Y' : '',
      검수: '', 검수메모: '',
    });
  }
}

/* 점검필요 — 어디서부터 손대야 하는지 우선순위대로 */
const rows점검 = [];
for (const r of rows현황) {
  if (r.상태 !== '완료') {
    rows점검.push({ 우선순위: 1, 대학: r.대학, 사유: r.상태, 상세: r.누락신고, 검수: '', 검수메모: '' });
  }
}
for (const t of rows전형) {
  if (t.확신도 === 'low') {
    rows점검.push({
      우선순위: 2, 대학: t.대학,
      사유: `확신도 low — ${t.전형명} / ${t.모집단위}`,
      상세: `최저: ${t.수능최저_원문 || '없음'} · 고사일: ${t.고사일_원문 || '없음'} · p.${t.근거페이지}`,
      검수: '', 검수메모: '',
    });
  }
}
for (const t of rows전형) {
  // 최저를 적용한다면서 원문이 비어 있으면 그건 못 쓰는 값이다
  if (t.수능최저적용 === 'Y' && !t.수능최저_원문) {
    rows점검.push({
      우선순위: 1, 대학: t.대학,
      사유: `최저 적용인데 원문 없음 — ${t.전형명} / ${t.모집단위}`,
      상세: `p.${t.근거페이지}`, 검수: '', 검수메모: '',
    });
  }
  // 면접·논술인데 날짜가 없으면 상담에서 고사일 충돌을 못 본다
  if (/면접|논술|실기/.test(t.고사종류) && !t.고사일1) {
    rows점검.push({
      우선순위: 3, 대학: t.대학,
      사유: `${t.고사종류}인데 날짜 없음 — ${t.전형명} / ${t.모집단위}`,
      상세: t.고사일_원문 || '문서에 일정 표기 없음', 검수: '', 검수메모: '',
    });
  }
}
rows점검.sort((a, b) => a.우선순위 - b.우선순위 || a.대학.localeCompare(b.대학, 'ko'));

/* ------------------------------------------------------------ 엑셀 */

const wb = xlsx.utils.book_new();
const add = (name, rows, widths) => {
  const ws = xlsx.utils.json_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  xlsx.utils.book_append_sheet(wb, ws, name);
};

add('변경사항', rows변경, [12, 20, 18, 40, 40, 8, 20, 8, 30]);
add('전형', rows전형, [12, 12, 8, 12, 20, 30, 8, 40, 10, 60, 8, 22, 12, 12, 12, 16, 8, 14, 18, 8, 8, 30]);
add('대학일정', rows일정, [12, 12, 12, 12, 12, 12, 45, 8, 40, 8, 30]);
add('점검필요', rows점검, [8, 12, 50, 60, 8, 30]);
add('수집현황', rows현황, [12, 12, 28, 10, 8, 10, 8, 8, 8, 50]);

const stamp = new Date().toISOString().slice(0, 10);
const outPath = join(DIR.out, `2027_모집요강_수집본_${stamp}.xlsx`);
xlsx.writeFile(wb, outPath);

// JSON도 함께 남긴다 — 앱에 붙일 때는 엑셀이 아니라 이쪽을 쓴다
writeFileSync(join(DIR.out, 'admission-2027.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  admissionYear: 2027,
  source: '각 대학 2027학년도 수시 모집요강 원문 PDF (Gemini 2.5 Flash 자동 추출)',
  counts: {
    대학_카탈로그: CATALOG.length,
    대학_완료: rows현황.filter((r) => r.상태 === '완료').length,
    전형행: rows전형.length,
    변경사항: rows변경.length,
    점검필요: rows점검.length,
  },
  전형: rows전형, 대학일정: rows일정, 변경사항: rows변경, 점검필요: rows점검, 수집현황: rows현황,
}, null, 2), 'utf8');

log(`엑셀: ${outPath}`);
log(`대학 완료 ${rows현황.filter((r) => r.상태 === '완료').length}/${CATALOG.length} · 전형 ${rows전형.length}행 · 변경 ${rows변경.length}건 · 점검필요 ${rows점검.length}건`);
for (const [사유, n] of Object.entries(rows현황.reduce((a, r) => { a[r.상태] = (a[r.상태] ?? 0) + 1; return a; }, {}))) {
  log(`  ${사유}: ${n}`);
}
