/**
 * Gemini REST 호출 래퍼.
 *
 * SDK를 쓰지 않는다 — functions/node_modules 에만 있어서 경로가 지저분해지고,
 * 필요한 것은 generateContent 하나뿐이다. Node 24의 전역 fetch로 충분하다.
 *
 * 구조화 출력(responseSchema)을 쓴다. 자유 텍스트로 받아 정규식으로 긁으면
 * 대학마다 형식이 달라 조용히 틀린다 — 스키마로 강제해야 검수가 가능하다.
 */

import { geminiKey, sleep } from './config.mjs';

const KEY = geminiKey();
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;

/**
 * @param {object} opts
 * @param {string} opts.prompt        사용자 프롬프트
 * @param {string} [opts.system]      시스템 지시
 * @param {object} [opts.schema]      responseSchema (있으면 JSON 강제)
 * @param {string} [opts.model]       기본 gemini-2.5-flash
 * @param {number} [opts.maxRetries]  기본 4
 * @returns {Promise<{data:any, usage:object, raw:string}>}
 */
export async function ask({
  prompt, system, schema, model = 'gemini-2.5-flash', maxRetries = 4,
}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,          // 요강 추출은 창작이 아니다
      maxOutputTokens: 65536,
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(ENDPOINT(model), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status >= 500) {
        // 사용량 제한·일시 장애는 기다렸다 다시 — 지수 백오프
        const wait = Math.min(60000, 4000 * 2 ** (attempt - 1));
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);

      const json = await res.json();
      const cand = json.candidates?.[0];
      const raw = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

      /*
       * 출력 토큰 한도에 걸려 잘린 JSON을 그대로 파싱하면 예외가 나거나
       * 더 나쁘게는 일부만 담긴 결과가 성공처럼 저장된다. 명시적으로 구분한다.
       */
      if (cand?.finishReason && cand.finishReason !== 'STOP') {
        throw new Error(`응답이 정상 종료되지 않음 (${cand.finishReason}) — 출력이 잘렸을 수 있습니다`);
      }
      if (!raw) throw new Error('빈 응답');

      return {
        data: schema ? JSON.parse(raw) : raw,
        usage: json.usageMetadata ?? {},
        raw,
      };
    } catch (e) {
      lastErr = e;
      if (attempt === maxRetries) break;
      await sleep(3000 * attempt);
    }
  }
  throw lastErr ?? new Error('알 수 없는 실패');
}
