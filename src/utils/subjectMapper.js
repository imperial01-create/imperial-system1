/* [src/utils/subjectMapper.js] 
  시공간 과목 분류 엔진 (Spatiotemporal Subject Mapper)
  (🚀 국어/영어/과학 과목 단일화 대통합 및 문/이과 대응 버전)
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

    if (schoolType === '고등학교') {
        // --- 국어과/영어과 (무조건 단일 코드로 병합) ---
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

        // --- 과학과 매핑 (1,2 구분 없이 완벽한 대통합) ---
        if (cleanSubj.includes('통합과학') || cleanSubj === '과학') return 'SCI_INT';
        if (cleanSubj.includes('물리')) return 'SCI_PHY';
        if (cleanSubj.includes('화학')) return 'SCI_CHE';
        if (cleanSubj.includes('생명')) return 'SCI_BIO';
        if (cleanSubj.includes('지구')) return 'SCI_EAS';
    }

    return `CUSTOM_${cleanSubj.toUpperCase()}`; 
};