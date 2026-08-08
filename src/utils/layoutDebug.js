/**
 * [레이아웃 진단] 화면 밖으로 삐져나간 요소를 찾아 보여줍니다.
 *
 * 왜 필요한가
 * -----------
 * 모바일에서 "오른쪽이 잘려 보인다"는 증상은 원인을 코드만 보고 찾기가 매우 어렵습니다.
 * 어떤 요소 하나가 화면보다 넓어지면 그 조상들이 함께 밀려나고, 정작 눈에 보이는 것은
 * 엉뚱한 카드가 잘린 모습이기 때문입니다. 실제로 배지 → 표 → 고정폭 순으로
 * 세 번 헛짚었습니다.
 *
 * 이 도구는 실제 렌더된 화면에서 '화면 오른쪽 끝을 넘어간 요소'를 직접 재서
 * 가장 넓은 것부터 알려줍니다.
 *
 * 사용법
 * ------
 * 주소 끝에 ?debug=layout 을 붙여서 접속합니다.
 *   예) https://.../settings?debug=layout
 * 화면 아래에 빨간 띠가 뜨고 범인 목록이 나옵니다. 그 내용을 알려주시면 됩니다.
 *
 * 평소에는 아무 것도 하지 않습니다(주소에 debug=layout 이 없으면 즉시 종료).
 */

const PANEL_ID = 'imperial-layout-debug';

const describe = (el) => {
    const cls = (el.className && typeof el.className === 'string')
        ? el.className.trim().split(/\s+/).slice(0, 6).join(' ')
        : '';
    const text = (el.textContent || '').trim().slice(0, 18);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls.replace(/\s+/g, '.') : ''}${text ? ` "${text}"` : ''}`;
};

export const runLayoutDebug = () => {
    if (typeof window === 'undefined') return;
    if (!window.location.search.includes('debug=layout')) return;

    const scan = () => {
        const vw = document.documentElement.clientWidth;
        const offenders = [];

        document.querySelectorAll('body *').forEach((el) => {
            if (el.id === PANEL_ID || el.closest(`#${PANEL_ID}`)) return;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return;
            // 화면 오른쪽 끝을 2px 넘게 벗어난 요소만
            if (r.right > vw + 2) {
                offenders.push({ el, over: Math.round(r.right - vw), width: Math.round(r.width) });
            }
        });

        // 부모가 이미 범인이면 자식은 따라 나온 것이므로, 가장 바깥쪽(=조상)만 남긴다
        const roots = offenders.filter(o => !offenders.some(p => p.el !== o.el && p.el.contains(o.el)));
        roots.sort((a, b) => b.over - a.over);

        const old = document.getElementById(PANEL_ID);
        if (old) old.remove();

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = [
            'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:99999',
            'background:#7f1d1d', 'color:#fff', 'font:11px/1.45 monospace',
            'padding:10px 12px', 'max-height:45vh', 'overflow:auto',
            'box-shadow:0 -4px 12px rgba(0,0,0,.3)'
        ].join(';');

        const lines = [`화면 폭 ${vw}px · 밖으로 나간 요소 ${roots.length}개`];
        if (roots.length === 0) {
            lines.push('이 화면에는 넘치는 요소가 없습니다.');
        } else {
            roots.slice(0, 6).forEach((o, i) => {
                lines.push(`${i + 1}) +${o.over}px 초과 / 폭 ${o.width}px`);
                lines.push(`   ${describe(o.el)}`);
                const p = o.el.parentElement;
                if (p) lines.push(`   ↑부모: ${describe(p)}`);
            });
        }
        panel.textContent = lines.join('\n');
        panel.style.whiteSpace = 'pre-wrap';

        const close = document.createElement('button');
        close.textContent = '닫기';
        close.style.cssText = 'position:sticky;top:0;float:right;background:#fff;color:#7f1d1d;border:0;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer';
        close.onclick = () => panel.remove();
        panel.prepend(close);

        document.body.appendChild(panel);
    };

    // 화면이 다 그려진 뒤에 재야 정확하다
    setTimeout(scan, 1200);
    window.addEventListener('resize', () => setTimeout(scan, 300));
};
