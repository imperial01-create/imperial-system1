/** @type {import('tailwindcss').Config} */
//
// ⚠️ 파일명은 반드시 정확히 'tailwind.config.js' 여야 합니다.
//    react-scripts 5.0.1은 config/webpack.config.js:72 에서
//      fs.existsSync(path.join(paths.appPath, 'tailwind.config.js'))
//    만 검사합니다. .cjs / .mjs / .ts 는 인식되지 않으며,
//    이 파일이 없으면 PostCSS 플러그인 목록에 tailwindcss가 들어가지 않아
//    Tailwind가 통째로 빌드되지 않습니다.
//
// ⚠️ Tailwind v4로 올리지 마세요. CRA는 플러그인을 문자열 'tailwindcss'로
//    하드코딩하고 postcssOptions.config=false 로 postcss.config.js를 차단하므로
//    v4의 @tailwindcss/postcss 를 주입할 방법이 없습니다.
//    (같은 이유로 postcss.config.js를 만들어도 무시됩니다.)

module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html',
  ],

  theme: {
    extend: {},
  },

  // ───────────────────────────────────────────────────────────────────────────
  // safelist — 소스에 '완성된 문자열'로 존재하지 않아 JIT 스캐너가 못 찾는 클래스
  //
  // Tailwind 빌드는 소스코드를 '문자열'로 훑어 완성된 클래스명만 CSS에 넣습니다.
  // 따라서 `bg-${color}-50` 처럼 이름을 조립하면 그 스타일은 생성되지 않습니다.
  //
  // 이건 어디까지나 안전망입니다. 근본 해결은 클래스 이름을 조립하지 않고
  // 완성된 문자열을 상수로 매핑하는 것이며(아래 파일들에서 그렇게 처리했습니다),
  // 그럼에도 이 safelist는 재발 방지용으로 남겨둡니다. 비용은 약 4KB입니다.
  //
  // 관련 지점:
  //   src/features/SettingsManager.js   부서 색상 / 학교급 색상
  //   src/features/FinancialDashboard.js 예산 경고 색상
  //   src/features/SchoolStrategy.js    InfoBox 그리드 col-span
  // ───────────────────────────────────────────────────────────────────────────
  safelist: [
    {
      pattern:
        /^(bg|text|border)-(rose|orange|blue|emerald|purple|amber)-(50|100|200|500|600|700|800|900)$/,
    },
    'col-span-1',
    'col-span-2',
  ],

  plugins: [
    // animate-in / fade-in / zoom-in-95 / slide-in-from-* 를 실제로 동작시킵니다.
    // 이 클래스들은 코드에 211곳 쓰여 있지만 Play CDN 환경에서는 한 번도
    // 동작한 적이 없습니다(Play CDN은 서드파티 플러그인을 로드할 수 없음).
    // 즉 이 줄은 '회귀 방지'가 아니라 '신규 기능 활성화'입니다.
    require('tailwindcss-animate'),
  ],
};
