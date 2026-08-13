/* [src/utils/driveLink.js]
   자료 링크가 쓸 수 있는 주소인지 확인합니다.

   [왜 필요한가]
   지금까지는 아무 문자열이나 저장됐습니다.
   오타가 난 링크도 그대로 '공개' 상태가 되고, 나중에 강사가 눌렀을 때에야
   열리지 않는 걸 알게 됩니다. 그때는 누가 언제 잘못 넣었는지 되짚기 어렵습니다.

   [판정 기준]
   - 주소 형식이 아니면  → 막습니다 (등록 불가)
   - 주소지만 구글이 아니면 → 경고만 합니다 (다른 저장소를 쓸 수도 있으므로 막지 않습니다)
   링크가 실제로 열리는지, 공유 설정이 됐는지는 확인할 수 없습니다.
   브라우저에서 남의 사이트로 요청을 보낼 수 없기 때문입니다.
*/

const GOOGLE_HOSTS = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'];

/**
 * @returns {{ ok: boolean, empty?: boolean, reason?: string, warn?: string }}
 *          ok=false 면 등록을 막고 reason 을 보여 줍니다.
 *          warn 이 있으면 등록은 되지만 경고를 띄웁니다.
 */
export const checkDriveLink = (raw) => {
    const url = String(raw || '').trim();
    if (!url) return { ok: true, empty: true };

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return { ok: false, reason: '주소 형식이 아닙니다. https:// 로 시작하는 링크를 붙여넣어 주세요.' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: 'http 또는 https 링크만 등록할 수 있습니다.' };
    }

    // 설명까지 같이 복사해 붙인 경우 (예: "해설 https://...")
    if (/\s/.test(url)) {
        return { ok: false, reason: '링크에 공백이 섞여 있습니다. 주소만 붙여넣어 주세요.' };
    }

    const host = parsed.hostname.toLowerCase();
    const isGoogle = GOOGLE_HOSTS.some(g => host === g || host.endsWith('.' + g));
    if (isGoogle) return { ok: true };

    return { ok: true, warn: `구글 드라이브 주소가 아닙니다 (${host}). 맞는 링크인지 확인해 주세요.` };
};

/**
 * 여러 링크를 한 번에 확인합니다.
 * @param entries [{ label, url }]
 * @returns {{ errors: string[], warns: string[] }}
 */
export const checkDriveLinks = (entries) => {
    const errors = [];
    const warns = [];
    entries.forEach(({ label, url }) => {
        const r = checkDriveLink(url);
        if (r.empty) return;
        if (!r.ok) errors.push(`${label}: ${r.reason}`);
        else if (r.warn) warns.push(`${label}: ${r.warn}`);
    });
    return { errors, warns };
};
