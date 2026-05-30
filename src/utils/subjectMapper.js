/* [src/utils/subjectMapper.js] 
  시공간 과목 분류 엔진 (Spatiotemporal Subject Mapper)
  (🚀 과학 과목 편입 및 중등부 세분화 업데이트 버전)
*/

export const STANDARD_CODES = [
    // --- 고등 수학 ---
    { code: 'MATH_H1_S1', label: '고1 1학기 (공통수학1, 수학 상)' },
    { code: 'MATH_H1_S2', label: '고1 2학기 (공통수학2, 수학 하)' },
    { code: 'MATH_H2_ALG', label: '지수/로그/수열 (대수, 수학 I)' },
    { code: 'MATH_H2_CALC1', label: '다항 미적분 (미적분 I, 수학 II)' },
    { code: 'MATH_H3_CALC2', label: '초월 미적분 (미적분 II, 미적분)' },
    { code: 'MATH_PROB_STAT', label: '확률과 통계 (확통)' },
    { code: 'MATH_GEOMETRY', label: '기하 (기하와 벡터)' },
    
    // --- 고등 과학 ---
    { code: 'SCI_H_INT', label: '고1 통합과학' },
    { code: 'SCI_H_PHY1', label: '물리학 I (물리학)' },
    { code: 'SCI_H_PHY2', label: '물리학 II' },
    { code: 'SCI_H_CHE1', label: '화학 I (화학)' },
    { code: 'SCI_H_CHE2', label: '화학 II' },
    { code: 'SCI_H_BIO1', label: '생명과학 I (생명과학)' },
    { code: 'SCI_H_BIO2', label: '생명과학 II' },
    { code: 'SCI_H_EAS1', label: '지구과학 I (지구과학)' },
    { code: 'SCI_H_EAS2', label: '지구과학 II' },

    // --- 중등 수학/과학 ---
    { code: 'MATH_M1', label: '중1 수학' },
    { code: 'MATH_M2', label: '중2 수학' },
    { code: 'MATH_M3', label: '중3 수학' },
    { code: 'SCI_M1', label: '중1 과학' },
    { code: 'SCI_M2', label: '중2 과학' },
    { code: 'SCI_M3', label: '중3 과학' },

    // --- 초등부 ---
    { code: 'ELEM_MATH', label: '초등 수학 공통' },
    { code: 'ELEM_SCI', label: '초등 과학 공통' }
];

const SUBJECT_LISTS = {
    HIGH_2015: [
        // 수학
        '수학(상)', '수학(하)', '수학 I', '수학 II', '미적분', '확률과 통계', '기하', '기본수학',
        // 과학
        '통합과학', '물리학 I', '화학 I', '생명과학 I', '지구과학 I', '물리학 II', '화학 II', '생명과학 II', '지구과학 II'
    ],
    HIGH_2022: [
        // 수학 (2022 개정)
        '공통수학1', '공통수학2', '대수', '미적분 I', '미적분 II', '확률과 통계', '기하', '기본수학1', '기본수학2',
        // 과학 (2022 개정)
        '통합과학1', '통합과학2', '물리학', '화학', '생명과학', '지구과학'
    ],
    MIDDLE: [
        '수학 1-1', '수학 1-2', '수학 2-1', '수학 2-2', '수학 3-1', '수학 3-2',
        '과학 1-1', '과학 1-2', '과학 2-1', '과학 2-2', '과학 3-1', '과학 3-2'
    ],
    ELEMENTARY: ['초등 수학', '초등 과학']
};

// 1. 연도와 학년에 맞는 동적 드롭다운 과목 배열 반환
export const getAvailableSubjects = (schoolType, yearStr, gradeStr) => {
    if (!yearStr || !gradeStr || !schoolType) return [];
    const year = parseInt(yearStr, 10);
    const grade = parseInt(String(gradeStr).replace(/[^0-9]/g, ''), 10) || 1;

    if (schoolType === '초등학교') return SUBJECT_LISTS.ELEMENTARY;
    if (schoolType === '중학교') return SUBJECT_LISTS.MIDDLE;
    if (schoolType === '고등학교') {
        let is2022Curriculum = false;
        if (year >= 2027) is2022Curriculum = true;
        else if (year === 2026 && grade <= 2) is2022Curriculum = true;
        else if (year === 2025 && grade === 1) is2022Curriculum = true;
        
        return is2022Curriculum ? SUBJECT_LISTS.HIGH_2022 : SUBJECT_LISTS.HIGH_2015;
    }
    return [];
};

// 2. 과거/현재 과목명을 불변하는 '표준 식별 코드'로 자동 번역
export const getStandardSubjectCode = (schoolType, subjectName) => {
    if (!subjectName) return 'UNKNOWN';
    const cleanSubj = subjectName.replace(/\s+/g, '');

    if (schoolType === '고등학교') {
        // 수학
        if (['공통수학1', '수학(상)', '수학상'].includes(cleanSubj)) return 'MATH_H1_S1';
        if (['공통수학2', '수학(하)', '수학하'].includes(cleanSubj)) return 'MATH_H1_S2';
        if (['대수', '수학1', '수학I'].includes(cleanSubj)) return 'MATH_H2_ALG';
        if (['미적분1', '미적분I', '수학2', '수학II'].includes(cleanSubj)) return 'MATH_H2_CALC1';
        if (['미적분2', '미적분II', '미적분'].includes(cleanSubj)) return 'MATH_H3_CALC2';
        if (['확률과통계', '확통'].includes(cleanSubj)) return 'MATH_PROB_STAT';
        if (['기하', '기하와벡터', '기벡'].includes(cleanSubj)) return 'MATH_GEOMETRY';

        // 과학 (과거 I, II 와 현재 일반 과목명 매핑)
        if (cleanSubj.includes('통합과학')) return 'SCI_H_INT';
        if (cleanSubj.includes('물리')) {
            if (cleanSubj.includes('2') || cleanSubj.includes('II')) return 'SCI_H_PHY2';
            return 'SCI_H_PHY1';
        }
        if (cleanSubj.includes('화학')) {
            if (cleanSubj.includes('2') || cleanSubj.includes('II')) return 'SCI_H_CHE2';
            return 'SCI_H_CHE1';
        }
        if (cleanSubj.includes('생명')) {
            if (cleanSubj.includes('2') || cleanSubj.includes('II')) return 'SCI_H_BIO2';
            return 'SCI_H_BIO1';
        }
        if (cleanSubj.includes('지구')) {
            if (cleanSubj.includes('2') || cleanSubj.includes('II')) return 'SCI_H_EAS2';
            return 'SCI_H_EAS1';
        }

    } else if (schoolType === '중학교') {
        if (cleanSubj.includes('수학1')) return 'MATH_M1';
        if (cleanSubj.includes('수학2')) return 'MATH_M2';
        if (cleanSubj.includes('수학3')) return 'MATH_M3';
        if (cleanSubj.includes('과학1')) return 'SCI_M1';
        if (cleanSubj.includes('과학2')) return 'SCI_M2';
        if (cleanSubj.includes('과학3')) return 'SCI_M3';
        
        if (cleanSubj.includes('수학')) return 'MATH_M_COMMON'; 
        if (cleanSubj.includes('과학')) return 'SCI_M_COMMON';  
    } else if (schoolType === '초등학교') {
        if (cleanSubj.includes('수학')) return 'ELEM_MATH';
        if (cleanSubj.includes('과학')) return 'ELEM_SCI';
    }
    
    return `CUSTOM_${cleanSubj.toUpperCase()}`; // 미분류 특수 과목 처리
};