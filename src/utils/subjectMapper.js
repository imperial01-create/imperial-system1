/* [src/utils/subjectMapper.js] 
  시공간 과목 분류 엔진 (Spatiotemporal Subject Mapper)
  (🚀 과거 데이터(schoolType 누락) 완벽 대응 및 다이내믹 디스플레이 번역기 탑재 버전)
*/

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

    // --- 중등/초등 공통 ---
    { code: 'MIDDLE_ALL', label: '중등 교과 공통' },
    { code: 'ELEM_ALL', label: '초등 교과 공통' }
];

// 3. 부서별/교육과정별 실제 화면에 노출될 텍스트 (국어/영어/과학 축소)
const SUBJECT_LISTS = {
    HIGH_2015: {
        DEPT_KOR: ['국어'],
        DEPT_ENG: ['영어'],
        DEPT_MATH: ['수학(상)', '수학(하)', '수학 I', '수학 II', '미적분', '확률과 통계', '기하'],
        DEPT_SOC: ['통합사회', '한국사', '생활과 윤리', '윤리와 사상', '한국지리', '세계지리', '동아시아사', '세계사', '정치와 법', '경제', '사회·문화'],
        DEPT_SCI: ['통합과학', '물리학', '화학', '생명과학', '지구과학']
    },
    HIGH_2022: {
        DEPT_KOR: ['국어'],
        DEPT_ENG: ['영어'],
        DEPT_MATH: ['공통수학1', '공통수학2', '대수', '미적분 I', '미적분 II', '확률과 통계', '기하'],
        DEPT_SOC: ['통합사회1', '통합사회2', '한국사1', '한국사2', '세계시민과 지리', '세계사', '사회와 문화', '현대사회와 법', '경제'],
        DEPT_SCI: ['통합과학1', '통합과학2', '물리학', '화학', '생명과학', '지구과학']
    }
};

/**
 * 활성화된 부서(activeDepartments)와 시공간을 기반으로 드롭다운용 과목 리스트를 반환
 */
export const getAvailableSubjects = (schoolType, yearStr, gradeStr, activeDepartments = ['DEPT_MATH']) => {
    if (!yearStr || !gradeStr || !schoolType) return [];
    const year = parseInt(yearStr, 10);
    const grade = parseInt(String(gradeStr).replace(/[^0-9]/g, ''), 10) || 1;

    if (schoolType === '초등학교') return ['초등 국어', '초등 영어', '초등 수학', '초등 사회', '초등 과학'];
    if (schoolType === '중학교') {
        let ms = [];
        if (activeDepartments.includes('DEPT_KOR')) ms.push('국어');
        if (activeDepartments.includes('DEPT_ENG')) ms.push('영어');
        if (activeDepartments.includes('DEPT_MATH')) ms.push(`수학 ${grade}-1`, `수학 ${grade}-2`);
        if (activeDepartments.includes('DEPT_SOC')) ms.push(`사회 ${grade}-1`, `역사 ${grade}-1`);
        if (activeDepartments.includes('DEPT_SCI')) ms.push(`과학 ${grade}-1`, `과학 ${grade}-2`);
        return ms;
    }

    if (schoolType === '고등학교') {
        let is2022 = false;
        if (year >= 2027) is2022 = true;
        else if (year === 2026 && grade <= 2) is2022 = true;
        else if (year === 2025 && grade === 1) is2022 = true;
        
        const targetList = is2022 ? SUBJECT_LISTS.HIGH_2022 : SUBJECT_LISTS.HIGH_2015;
        
        let result = [];
        activeDepartments.forEach(dept => {
            if (targetList[dept]) result = [...result, ...targetList[dept]];
        });
        return result;
    }
    return [];
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

    if (schoolType === '초등학교') return 'ELEM_ALL';
    if (schoolType === '중학교') return 'MIDDLE_ALL';

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
             'MATH_M1': '수학 1', 'MATH_M2': '수학 2', 'MATH_M3': '수학 3',
             'SCI_M1': '과학 1', 'SCI_M2': '과학 2', 'SCI_M3': '과학 3',
             'MIDDLE_ALL': '중등 교과 공통'
         };
         if (mapMiddle[code]) return mapMiddle[code];
    } else if (typeK === '초등학교') {
         if (code === 'ELEM_ALL') return '초등 교과 공통';
    }

    return originalSubject || '미지정';
};