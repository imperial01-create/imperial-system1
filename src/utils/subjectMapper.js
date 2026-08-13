/* [src/utils/subjectMapper.js] 
  시공간 과목 분류 엔진 (Spatiotemporal Subject Mapper)
  (🚀 과거 데이터(schoolType 누락) 완벽 대응 및 다이내믹 디스플레이 번역기 탑재 버전)
*/

import { toMainSubject, activeMainSubjects, MAIN_SUBJECTS as MAIN_SUBJECTS_ORDER } from './subjectMatch';

// 1. 대분류(부서) 마스터 정의
export const DEPARTMENTS = [
    { id: 'DEPT_KOR', label: '국어과' },
    { id: 'DEPT_ENG', label: '영어과' },
    { id: 'DEPT_MATH', label: '수학과' },
    { id: 'DEPT_SOC', label: '사회과' },
    { id: 'DEPT_SCI', label: '과학과' }
];

// 2. 불변하는 표준 과목 식별자 (Standard Codes)
export const STANDARD_CODES = [
    // --- 국어/영어 (대통합) ---
    { code: 'KOR_ALL', label: '국어 공통' },
    { code: 'ENG_ALL', label: '영어 공통' },

    // --- 수학과 ---
    { code: 'MATH_H1_S1', label: '고1 1학기 (공통수학1, 수학 상)' },
    { code: 'MATH_H1_S2', label: '고1 2학기 (공통수학2, 수학 하)' },
    { code: 'MATH_H2_ALG', label: '지수/로그/수열 (대수, 수학 I)' },
    { code: 'MATH_H2_CALC1', label: '다항 미적분 (미적분 I, 수학 II)' },
    { code: 'MATH_H3_CALC2', label: '초월 미적분 (미적분 II, 미적분)' },
    { code: 'MATH_PROB_STAT', label: '확률과 통계 (확통)' },
    { code: 'MATH_GEOMETRY', label: '기하' },

    // --- 사회과 (유지) ---
    { code: 'SOC_H_INT', label: '통합사회' },
    { code: 'SOC_H_HIS', label: '한국사' },
    { code: 'SOC_H_LIFE', label: '생활과 윤리 (생윤)' },
    { code: 'SOC_H_ETHICS', label: '윤리와 사상 (윤사)' },
    { code: 'SOC_H_GEO_K', label: '한국지리 (한지)' },
    { code: 'SOC_H_GEO_W', label: '세계지리 (세지)' },
    { code: 'SOC_H_HIS_E', label: '동아시아사' },
    { code: 'SOC_H_HIS_W', label: '세계사' },
    { code: 'SOC_H_LAW', label: '정치와 법 (정법)' },
    { code: 'SOC_H_ECON', label: '경제' },
    { code: 'SOC_H_CULT', label: '사회문화 (사문)' },

    // --- 과학과 (I, II 대통합) ---
    { code: 'SCI_INT', label: '통합과학' },
    { code: 'SCI_PHY', label: '물리학 (물리1, 2 통합)' },
    { code: 'SCI_CHE', label: '화학 (화학1, 2 통합)' },
    { code: 'SCI_BIO', label: '생명과학 (생명1, 2 통합)' },
    { code: 'SCI_EAS', label: '지구과학 (지구1, 2 통합)' },

    /* --- 중등 (과목별) ---
       예전에는 중학교 시험이 학년·과목과 무관하게 MIDDLE_ALL 하나였습니다.
       그래서 '수학 2-1' 과 '영어' 가 같은 코드였고 과목 필터가 무의미했습니다.
       학년은 문서에 grade 로 따로 있으므로 코드에는 과목만 담습니다. */
    { code: 'MATH_MID', label: '중등 수학' },
    { code: 'ENG_MID', label: '중등 영어' },
    { code: 'KOR_MID', label: '중등 국어' },
    { code: 'SCI_MID', label: '중등 과학' },
    { code: 'SOC_MID', label: '중등 사회·역사' },

    // --- 초등 (과목별) ---
    { code: 'MATH_ELEM', label: '초등 수학' },
    { code: 'ENG_ELEM', label: '초등 영어' },
    { code: 'KOR_ELEM', label: '초등 국어' },
    { code: 'SCI_ELEM', label: '초등 과학' },
    { code: 'SOC_ELEM', label: '초등 사회' },

    /* 옛 자료용. 새로 만들어지지 않습니다.
       과목별로 나누기 전에 등록된 문서가 이 값을 갖고 있습니다. */
    { code: 'MIDDLE_ALL', label: '중등 교과 공통 (구 형식)' },
    { code: 'ELEM_ALL', label: '초등 교과 공통 (구 형식)' }
];

/** 학교급별 과목 표준 코드. 대과목 이름으로 찾습니다. */
export const MID_CODE_BY_SUBJECT = {
    '수학': 'MATH_MID', '영어': 'ENG_MID', '국어': 'KOR_MID',
    '과학': 'SCI_MID', '사회': 'SOC_MID'
};
export const ELEM_CODE_BY_SUBJECT = {
    '수학': 'MATH_ELEM', '영어': 'ENG_ELEM', '국어': 'KOR_ELEM',
    '과학': 'SCI_ELEM', '사회': 'SOC_ELEM'
};

// 3. 부서별/교육과정별 실제 화면에 노출될 텍스트 (국어/영어/과학 축소)
const SUBJECT_LISTS = {
    HIGH_2015: {
        '국어': ['국어'],
        '영어': ['영어'],
        '수학': ['수학(상)', '수학(하)', '수학 I', '수학 II', '미적분', '확률과 통계', '기하'],
        '사회': ['통합사회', '한국사', '생활과 윤리', '윤리와 사상', '한국지리', '세계지리', '동아시아사', '세계사', '정치와 법', '경제', '사회·문화'],
        '과학': ['통합과학', '물리학', '화학', '생명과학', '지구과학']
    },
    HIGH_2022: {
        '국어': ['국어'],
        '영어': ['영어'],
        '수학': ['공통수학1', '공통수학2', '대수', '미적분 I', '미적분 II', '확률과 통계', '기하'],
        '사회': ['통합사회1', '통합사회2', '한국사1', '한국사2', '세계시민과 지리', '세계사', '사회와 문화', '현대사회와 법', '경제'],
        '과학': ['통합과학1', '통합과학2', '물리학', '화학', '생명과학', '지구과학']
    }
};

/**
 * 활성화된 부서(activeDepartments)와 시공간을 기반으로 드롭다운용 과목 리스트를 반환
 */
export const getAvailableSubjects = (schoolType, yearStr, gradeStr, activeDepartments = ['수학']) => {
    if (!yearStr || !gradeStr || !schoolType) return [];
    const year = parseInt(yearStr, 10);
    const grade = parseInt(String(gradeStr).replace(/[^0-9]/g, ''), 10) || 1;

    /* 학원이 가르치는 과목만 보여 줍니다.
       activeMainSubjects 가 옛 ID 형식('DEPT_MATH')과 새 형식('수학')을 모두 받습니다. */
    const teaching = activeMainSubjects(activeDepartments);
    const teaches = (s) => teaching.length === 0 || teaching.includes(s);

    if (schoolType === '초등학교') {
        return ['국어', '영어', '수학', '사회', '과학']
            .filter(teaches).map(s => `초등 ${s}`);
    }
    if (schoolType === '중학교') {
        let ms = [];
        if (teaches('국어')) ms.push('국어');
        if (teaches('영어')) ms.push('영어');
        if (teaches('수학')) ms.push(`수학 ${grade}-1`, `수학 ${grade}-2`);
        if (teaches('사회')) ms.push(`사회 ${grade}-1`, `역사 ${grade}-1`);
        if (teaches('과학')) ms.push(`과학 ${grade}-1`, `과학 ${grade}-2`);
        return ms;
    }

    if (schoolType === '고등학교') {
        let is2022 = false;
        if (year >= 2027) is2022 = true;
        else if (year === 2026 && grade <= 2) is2022 = true;
        else if (year === 2025 && grade === 1) is2022 = true;
        
        const targetList = is2022 ? SUBJECT_LISTS.HIGH_2022 : SUBJECT_LISTS.HIGH_2015;
        
        const wanted = teaching.length > 0 ? teaching : MAIN_SUBJECTS_ORDER;
        let result = [];
        wanted.forEach(sub => {
            if (targetList[sub]) result = [...result, ...targetList[sub]];
        });
        return result;
    }
    return [];
};

/**
 * 중등 과목명은 학기를 이름에 담고 있습니다 ('수학 2-1' = 2학년 1학기).
 * 한 번에 여러 학기를 등록할 때 이 이름을 학기에 맞춰 주지 않으면
 * 2학기 시험에 '수학 2-1' 이 붙어 자료가 엉뚱한 곳에 쌓입니다.
 *
 * '수학 2-1' + 2학기 → '수학 2-2'
 * '영어', '미적분 I', '통합과학1' 처럼 학기를 담지 않는 이름은 그대로 둡니다.
 */
export const alignSubjectToSemester = (subjectName, semesterNumber) => {
    const name = String(subjectName || '');
    const sem = Number(semesterNumber);
    if (sem !== 1 && sem !== 2) return name;

    const m = name.match(/^(.+?)\s(\d)-(\d)$/);
    return m ? `${m[1]} ${m[2]}-${sem}` : name;
};

/**
 * 텍스트(과거 데이터 포함)를 불변하는 표준 코드로 마이그레이션 매핑
 */
export const getStandardSubjectCode = (schoolType, subjectName) => {
    if (!subjectName) return 'UNKNOWN';
    
    // 과거 문/이과, 가/나형 수식어를 제거하여 알맹이만 남김
    let cleanSubj = subjectName.replace(/\s+/g, '');
    cleanSubj = cleanSubj.replace(/\(문과\)|\(이과\)|\(가형\)|\(나형\)|\(A형\)|\(B형\)|\(인문\)|\(자연\)/gi, '');
    cleanSubj = cleanSubj.replace(/문과|이과|가형|나형|A형|B형|인문|자연/gi, '');

    /* 초등도 중등과 같은 방식으로 과목을 나눕니다.
       판정할 수 없으면 옛 값으로 두어 엉뚱한 과목이 되지 않게 합니다. */
    if (schoolType === '초등학교') {
        const main = toMainSubject(subjectName);
        return (main && ELEM_CODE_BY_SUBJECT[main]) || 'ELEM_ALL';
    }
    /* 중등도 과목을 나눕니다. 과목 판정은 subjectMatch 한 곳에서만 합니다.
       알아낼 수 없으면 옛 값(MIDDLE_ALL)으로 두어 조용히 엉뚱한 과목이 되지 않게 합니다. */
    if (schoolType === '중학교') {
        const main = toMainSubject(subjectName);
        return (main && MID_CODE_BY_SUBJECT[main]) || 'MIDDLE_ALL';
    }

    if (schoolType === '고등학교' || !schoolType) { // 과거 데이터 기본 고등부 처리
        // --- 국어과/영어과 ---
        if (cleanSubj.includes('국어') || cleanSubj.includes('문학') || cleanSubj.includes('독서') || cleanSubj.includes('화법') || cleanSubj.includes('작문') || cleanSubj.includes('언어') || cleanSubj.includes('매체')) return 'KOR_ALL';
        if (cleanSubj.includes('영어') || cleanSubj.includes('독해') || cleanSubj.includes('회화')) return 'ENG_ALL';

        // --- 수학과 매핑 ---
        if (['공통수학1', '수학(상)', '수학상'].includes(cleanSubj)) return 'MATH_H1_S1';
        if (['공통수학2', '수학(하)', '수학하'].includes(cleanSubj)) return 'MATH_H1_S2';
        if (['대수', '수학1', '수학I'].includes(cleanSubj)) return 'MATH_H2_ALG';
        if (['미적분1', '미적분I', '수학2', '수학II'].includes(cleanSubj)) return 'MATH_H2_CALC1';
        if (['미적분2', '미적분II', '미적분'].includes(cleanSubj)) return 'MATH_H3_CALC2';
        if (['확률과통계', '확통'].includes(cleanSubj)) return 'MATH_PROB_STAT';
        if (['기하', '기하와벡터', '기벡'].includes(cleanSubj)) return 'MATH_GEOMETRY';

        // --- 사회과 매핑 ---
        if (cleanSubj.includes('통합사회')) return 'SOC_H_INT';
        if (cleanSubj.includes('한국사')) return 'SOC_H_HIS';
        if (cleanSubj.includes('생활과윤리') || cleanSubj.includes('생윤')) return 'SOC_H_LIFE';
        if (cleanSubj.includes('윤리와사상') || cleanSubj.includes('윤사')) return 'SOC_H_ETHICS';
        if (cleanSubj.includes('한국지리') || cleanSubj.includes('한지')) return 'SOC_H_GEO_K';
        if (cleanSubj.includes('세계지리') || cleanSubj.includes('세지')) return 'SOC_H_GEO_W';
        if (cleanSubj.includes('동아시아')) return 'SOC_H_HIS_E';
        if (cleanSubj.includes('세계사')) return 'SOC_H_HIS_W';
        if (cleanSubj.includes('법')) return 'SOC_H_LAW';
        if (cleanSubj.includes('경제')) return 'SOC_H_ECON';
        if (cleanSubj.includes('문화') || cleanSubj.includes('사문')) return 'SOC_H_CULT';

        // --- 과학과 매핑 ---
        if (cleanSubj.includes('통합과학') || cleanSubj === '과학') return 'SCI_INT';
        if (cleanSubj.includes('물리')) return 'SCI_PHY';
        if (cleanSubj.includes('화학')) return 'SCI_CHE';
        if (cleanSubj.includes('생명')) return 'SCI_BIO';
        if (cleanSubj.includes('지구')) return 'SCI_EAS';
    }

    return `CUSTOM_${cleanSubj.toUpperCase()}`; 
};

/**
 * 🚀 [CTO 패치] 시공간 동적 번역기 (Dynamic Subject Labeler)
 * 시스템 코드를 바탕으로 해당 연도/학년에 맞는 가장 완벽한 텍스트(예: "공통수학1" 또는 "수학(상)")로 번역하여 반환합니다.
 */
export const getDynamicSubjectLabel = (code, schoolType, yearStr, gradeStr, originalSubject) => {
    if (!code || code === 'UNKNOWN' || code.startsWith('CUSTOM_')) return originalSubject || '미지정';

    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const grade = parseInt(String(gradeStr).replace(/[^0-9]/g, ''), 10) || 1;
    
    // 🚀 과거 데이터(schoolType 누락)를 고등부로 강제 편입시켜 번역기 작동 보장
    const typeK = schoolType || '고등학교';

    if (typeK === '고등학교') {
        let is2022 = false;
        if (year >= 2027) is2022 = true;
        else if (year === 2026 && grade <= 2) is2022 = true;
        else if (year === 2025 && grade === 1) is2022 = true;

        const map2015 = {
            'MATH_H1_S1': '수학(상)', 'MATH_H1_S2': '수학(하)', 'MATH_H2_ALG': '수학 I',
            'MATH_H2_CALC1': '수학 II', 'MATH_H3_CALC2': '미적분', 'MATH_PROB_STAT': '확률과 통계',
            'MATH_GEOMETRY': '기하', 'KOR_ALL': '국어', 'ENG_ALL': '영어',
            'SCI_INT': '통합과학', 'SCI_PHY': '물리학', 'SCI_CHE': '화학', 'SCI_BIO': '생명과학', 'SCI_EAS': '지구과학',
            'SOC_H_INT': '통합사회', 'SOC_H_HIS': '한국사', 'SOC_H_LIFE': '생활과 윤리', 'SOC_H_ETHICS': '윤리와 사상',
            'SOC_H_GEO_K': '한국지리', 'SOC_H_GEO_W': '세계지리', 'SOC_H_HIS_E': '동아시아사', 'SOC_H_HIS_W': '세계사',
            'SOC_H_LAW': '정치와 법', 'SOC_H_ECON': '경제', 'SOC_H_CULT': '사회·문화'
        };

        const map2022 = {
            'MATH_H1_S1': '공통수학1', 'MATH_H1_S2': '공통수학2', 'MATH_H2_ALG': '대수',
            'MATH_H2_CALC1': '미적분 I', 'MATH_H3_CALC2': '미적분 II', 'MATH_PROB_STAT': '확률과 통계',
            'MATH_GEOMETRY': '기하', 'KOR_ALL': '국어', 'ENG_ALL': '영어',
            'SCI_INT': '통합과학', 'SCI_PHY': '물리학', 'SCI_CHE': '화학', 'SCI_BIO': '생명과학', 'SCI_EAS': '지구과학',
            'SOC_H_INT': '통합사회', 'SOC_H_HIS': '한국사', 'SOC_H_LIFE': '생활과 윤리', 'SOC_H_ETHICS': '윤리와 사상',
            'SOC_H_GEO_K': '한국지리', 'SOC_H_GEO_W': '세계지리', 'SOC_H_HIS_E': '동아시아사', 'SOC_H_HIS_W': '세계사',
            'SOC_H_LAW': '정치와 법', 'SOC_H_ECON': '경제', 'SOC_H_CULT': '사회·문화'
        };

        const targetMap = is2022 ? map2022 : map2015;
        if (targetMap[code]) return targetMap[code];
    } else if (typeK === '중학교') {
         const mapMiddle = {
             'MATH_MID': '수학', 'ENG_MID': '영어', 'KOR_MID': '국어',
             'SCI_MID': '과학', 'SOC_MID': '사회·역사',
             // 마이그레이션 전 문서용
             'MIDDLE_ALL': '중등 교과 공통'
         };
         if (mapMiddle[code]) return mapMiddle[code];
    } else if (typeK === '초등학교') {
         const mapElem = {
             'MATH_ELEM': '수학', 'ENG_ELEM': '영어', 'KOR_ELEM': '국어',
             'SCI_ELEM': '과학', 'SOC_ELEM': '사회',
             'ELEM_ALL': '초등 교과 공통'   // 나누기 전 문서용
         };
         if (mapElem[code]) return mapElem[code];
    }

    return originalSubject || '미지정';
};