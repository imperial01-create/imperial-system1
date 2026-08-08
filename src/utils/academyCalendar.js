/**
 * [학원 달력] 날짜 하나에 대해 "이 날이 어떤 날인가"를 한 번에 알려주는 도구.
 *
 * 왜 필요한가
 * -----------
 * 달력을 그리는 화면이 9곳인데 각자 따로 그리고 있었다. 그래서
 *   - 설날에도 클리닉 예약 슬롯이 열리고
 *   - 학원 방학 기간에 강의가 생성되고
 *   - 시즌이 화면마다 다르게 보이는
 * 일이 생겼다. 판단 기준을 여기 한 곳에 모은다.
 *
 * 데이터 출처
 *   - academy_calendar : 공휴일(서버가 자동), 휴원일, 학원 행사
 *   - settings.seasons : 시즌 (윈터/중간/기말/서머)
 *   - academic_calendars : 학교별 시험 일정 (참고 표시용)
 */

/** Date 객체 → 'YYYY-MM-DD' (로컬 시간 기준. toISOString 을 쓰면 하루가 밀린다) */
export const toDateStr = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const inRange = (dateStr, start, end) => {
    if (!start) return false;
    const s = String(start);
    const e = String(end || start);
    return dateStr >= s && dateStr <= e;
};

/** 해당 날짜에 걸리는 달력 항목들 */
export const getEntriesOn = (dateStr, calendar) =>
    (Array.isArray(calendar) ? calendar : []).filter((c) => c && inRange(dateStr, c.startDate, c.endDate));

/**
 * 이 날 학원이 쉬는가?
 * 공휴일이든 자체 휴원이든 isClosed 가 true 인 항목이 하나라도 있으면 휴원으로 본다.
 *
 * ⚠️ 공휴일이라고 무조건 쉬는 건 아니다. 학원은 공휴일에도 특강을 열 수 있다.
 *    그래서 데스크가 그 날 항목의 isClosed 를 false 로 바꾸면 정상 운영일이 된다.
 */
export const isClosedDay = (dateStr, calendar) =>
    getEntriesOn(dateStr, calendar).some((c) => c.isClosed === true);

/** 오늘이 속한 시즌 (없으면 null) */
export const getSeasonOn = (dateStr, seasons) =>
    (Array.isArray(seasons) ? seasons : []).find((s) => s && inRange(dateStr, s.startDate, s.endDate)) || null;

/**
 * 날짜 하나에 대한 모든 정보를 한 번에.
 * 달력 셀을 그릴 때 이것만 부르면 된다.
 */
export const getDayInfo = (dateStr, { calendar = [], seasons = [], schoolCalendars = [] } = {}) => {
    const entries = getEntriesOn(dateStr, calendar);
    const holidays = entries.filter((c) => c.type === 'holiday');
    const closures = entries.filter((c) => c.type === 'closure');
    const events = entries.filter((c) => c.type === 'event');
    const schoolExams = (Array.isArray(schoolCalendars) ? schoolCalendars : [])
        .filter((c) => c && inRange(dateStr, c.startDate, c.endDate));

    const dow = new Date(`${dateStr}T00:00:00`).getDay();

    return {
        date: dateStr,
        dayOfWeek: dow,
        isSunday: dow === 0,
        isSaturday: dow === 6,
        isClosed: entries.some((c) => c.isClosed === true),
        holidayName: holidays.length ? holidays[0].title : null,
        holidays,
        closures,
        events,
        schoolExams,
        season: getSeasonOn(dateStr, seasons),
    };
};

/** 달력 셀에 쓸 색/표시. 화면마다 다르게 칠하던 것을 통일한다. */
export const getDayStyle = (info) => {
    if (!info) return { tone: 'normal', label: '' };
    if (info.holidayName) return { tone: 'holiday', label: info.holidayName };
    if (info.closures.length) return { tone: 'closure', label: info.closures[0].title };
    if (info.events.length) return { tone: 'event', label: info.events[0].title };
    if (info.isSunday) return { tone: 'sunday', label: '' };
    return { tone: 'normal', label: '' };
};

/* Tailwind 는 소스를 문자열로 훑기 때문에 클래스 이름을 조립하면 안 된다.
   (bg-${tone}-50 처럼 쓰면 그 스타일이 CSS 에서 통째로 빠진다 — 이 저장소에서 실제로 겪은 문제)
   그래서 완성된 이름을 미리 적어 둔다. */
export const DAY_TONE_CLASS = {
    holiday: 'bg-red-50 text-red-700 border-red-200',
    closure: 'bg-slate-100 text-slate-500 border-slate-200',
    event: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    sunday: 'text-red-500',
    normal: '',
};

export const CALENDAR_TYPE_LABEL = {
    holiday: '공휴일',
    closure: '휴원',
    event: '학원 행사',
};
