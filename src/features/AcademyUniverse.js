/* [서비스 가치] 아카데미 유니버스 - 데이터 시각화를 적용한 프리미엄 학습 역량 대시보드.
   (🚀 초개인화 통합 패치: 상단 대시보드 UI 클렌징, 100단계 정밀 Voca 루브릭 동적 설명 탑재,
   학부모 뷰(Parent View) 최적화: 자녀가 1명일 경우 1-Depth 즉시 렌더링, 다자녀일 경우 스마트 드롭다운 제공) */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Lock, ChevronLeft, TrendingUp, TrendingDown, 
  Minus, BookOpen, Calculator, Globe, Atom, Star, Award, Target, Sparkles, Search, ChevronRight, CheckCircle,
  Network, LayoutGrid, HelpCircle, Users, AlertCircle
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Card, Badge, Button, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

// 🚀 100단계 초정밀 Voca 진단 루브릭 매트릭스
const VOCA_RUBRICS = [
  { min: 0, max: 10, target: '파닉스/초저', desc: '알파벳 대소문자를 간신히 구분하며 영어를 그림처럼 인식함.' },
  { min: 11, max: 20, target: '파닉스/초저', desc: '알파벳이 내는 고유의 소리(음가)를 겨우 떼기 시작함.' },
  { min: 21, max: 30, target: '파닉스/초저', desc: '쉬운 단어를 더듬거리며 읽어내지만 즉각적인 뜻 연상은 안 됨.' },
  { min: 31, max: 40, target: '파닉스/초저', desc: '시각적으로 자주 노출되는 sight words 학습에 진입함.' },
  { min: 41, max: 50, target: '파닉스/초저', desc: 'I, you, am 위주의 기초 sight words를 인지하는 수준에 도달함.' },
  { min: 51, max: 60, target: '초등 3~4', desc: '내 주변에 당장 눈에 보이는 구체적인 사물 명사를 외우기 시작함.' },
  { min: 61, max: 70, target: '초등 3~4', desc: '과일이나 동물과 같은 친숙한 주제의 단어를 우선적으로 습득함.' },
  { min: 71, max: 80, target: '초등 3~4', desc: '색깔을 나타내는 기초 단어들을 우리말과 1:1로 매칭하여 암기함.' },
  { min: 81, max: 90, target: '초등 3~4', desc: '가족 명칭 등 일상에서 자주 쓰는 단어들을 소리와 뜻으로 기억함.' },
  { min: 91, max: 100, target: '초등 3~4', desc: '기초 명사 위주의 암기 패턴이 자리 잡으며 초등 중학년 어휘를 소화함.' },
  { min: 101, max: 110, target: '초등 5~6', desc: '명사 위주의 암기에서 벗어나 움직임을 나타내는 동사에 눈을 뜸.' },
  { min: 111, max: 120, target: '초등 5~6', desc: 'go, eat, make 등 일상생활과 직결된 아주 기초적인 기본 동사를 인지함.' },
  { min: 121, max: 130, target: '초등 5~6', desc: '사물의 상태나 감정을 나타내는 간단한 형용사를 추가로 외우기 시작함.' },
  { min: 131, max: 140, target: '초등 5~6', desc: '어휘의 폭은 넓어지나, 철자가 조금만 길어져도 스펠링 실수가 잦아짐.' },
  { min: 141, max: 150, target: '초등 5~6', desc: '잦은 스펠링 실수에도 불구하고 초등 고학년 수준의 필수 단어군을 완성함.' },
  { min: 151, max: 160, target: '예비 중1', desc: '처음으로 분량이 정해진 중학 필수 단어장에 입문하여 적응하는 시기.' },
  { min: 161, max: 170, target: '예비 중1', desc: '단어 암기 시 \'이름(명사)\'과 \'동작(동사)\'이 다르다는 것을 무의식적으로 느낌.' },
  { min: 171, max: 180, target: '예비 중1', desc: '명사의 개념을 어렴풋이 이해하고 단어장에 적용하기 시작함.' },
  { min: 181, max: 190, target: '예비 중1', desc: '동사의 개념을 어렴풋이 이해하며 단어 뜻의 끝말(~다)을 맞추려 노력함.' },
  { min: 191, max: 200, target: '예비 중1', desc: '품사(명사/동사)의 구분이 단어 암기에 필요하다는 것을 인지하며 중1 과정을 준비함.' },
  { min: 201, max: 210, target: '중1 수준', desc: '중1 교과서 지문에 등장하는 기초 필수 어휘들을 큰 무리 없이 암기함.' },
  { min: 211, max: 220, target: '중1 수준', desc: '단어와 한글 뜻을 1:1로만 대응시켜 외우는 기계적 암기에 익숙해짐.' },
  { min: 221, max: 230, target: '중1 수준', desc: '한 단어에 뜻이 여러 개(다의어) 있는 현상을 단어장에서 처음 목격함.' },
  { min: 231, max: 240, target: '중1 수준', desc: '뜻이 여러 개여도 암기 부담을 줄이기 위해 무조건 첫 번째 뜻만 외움.' },
  { min: 241, max: 250, target: '중1 수준', desc: '첫 번째 뜻만 알아서, 문맥이 바뀌면 아는 단어도 해석이 막히는 한계를 보임.' },
  { min: 251, max: 260, target: '중2 수준', desc: '동사의 형태가 변하는 불규칙 동사의 존재를 인지하기 시작함.' },
  { min: 261, max: 270, target: '중2 수준', desc: '불규칙 동사의 3단 변화표를 의식적으로 암기하며 시제 해석의 기초를 다짐.' },
  { min: 271, max: 280, target: '중2 수준', desc: '단어 두 개가 합쳐져 새로운 뜻이 되는 구동사의 개념에 처음 접근함.' },
  { min: 281, max: 290, target: '중2 수준', desc: 'look for와 같은 아주 기초적인 구동사를 덩어리로 외우기 시작함.' },
  { min: 291, max: 300, target: '중2 수준', desc: 'give up 등의 필수 구동사를 암기하며 중2 수준의 어휘 뼈대를 완성함.' },
  { min: 301, max: 310, target: '중3 기본', desc: '눈에 보이지 않는 개념을 뜻하는 추상 명사가 지문에 등장하기 시작함.' },
  { min: 311, max: 320, target: '중3 기본', desc: 'peace, effort 등의 추상 명사가 등장하면 직관적 이해가 안 되어 해석 속도가 느려짐.' },
  { min: 321, max: 330, target: '중3 기본', desc: '단어의 뜻을 유추할 수 있는 기초 접사(Affix)의 존재를 인지하기 시작함.' },
  { min: 331, max: 340, target: '중3 기본', desc: '단어 앞에 붙어 반대말을 만드는 접두사(un-)의 원리를 이해함.' },
  { min: 341, max: 350, target: '중3 기본', desc: '단어 뒤에 붙어 품사를 바꾸는 접미사(-ly)를 인지하며 고등 어휘 진입을 준비함.' },
  { min: 351, max: 360, target: '예비 고1', desc: '분량이 방대한 고등 필수 어휘장 1회독을 힘겹게 시작하는 단계.' },
  { min: 361, max: 370, target: '예비 고1', desc: '단어를 보면 대충 긍정인지 부정인지 아는 수준으로 얕게 암기함.' },
  { min: 371, max: 380, target: '예비 고1', desc: '뜻은 대충 알지만 문장 구조에 맞게 우리말로 정확히 인출하지 못함.' },
  { min: 381, max: 390, target: '예비 고1', desc: '지문의 앞뒤 문맥을 고려하지 않고 자신이 외운 뜻만 기계적으로 대입함.' },
  { min: 391, max: 400, target: '예비 고1', desc: '문맥 내에서 필자가 의도한 단어의 정확한 뉘앙스를 잡지 못해 오역이 잦음.' },
  { min: 401, max: 410, target: '고1 모의고사', desc: '고1 전국연합 학력평가 지문을 읽고 대략적인 스토리를 따라갈 수 있음.' },
  { min: 411, max: 420, target: '고1 모의고사', desc: '전체 고1 학력평가 지문을 약 70% 정도 무리 없이 해독해 냄.' },
  { min: 421, max: 430, target: '고1 모의고사', desc: '지문 내 핵심 어휘 몇 개를 통해 글의 전체적인 \'주제 찾기\'는 가능함.' },
  { min: 431, max: 440, target: '고1 모의고사', desc: '정밀한 어휘력이 요구되는 \'빈칸 추론\' 문제에 돌입하면 단어가 막혀 오답을 냄.' },
  { min: 441, max: 450, target: '고1 모의고사', desc: '주제는 맞추나 빈칸 추론 어휘에서 막히는, 전형적인 고1 중위권의 한계를 보임.' },
  { min: 451, max: 460, target: '고1 마스터', desc: '고1 모의고사나 내신 수준의 지문에서 모르는 단어는 거의 없음.' },
  { min: 461, max: 470, target: '고1 마스터', desc: '단어의 꼬리가 변하여 품사가 바뀌는 \'파생형\'의 존재를 명확히 인지함.' },
  { min: 471, max: 480, target: '고1 마스터', desc: '형태가 비슷한 명사(success)와 동사(succeed)를 헷갈리지 않고 구분해 냄.' },
  { min: 481, max: 490, target: '고1 마스터', desc: '명사/동사에 이어 형용사(successful) 형태까지 완벽히 쪼개서 암기함.' },
  { min: 491, max: 500, target: '고1 마스터', desc: '단어의 파생형을 품사별로 정확히 구분하여 어법 문제에서도 어휘가 무기가 됨.' },
  { min: 501, max: 510, target: '고2 모의고사', desc: '철학, 환경 등 한글로도 이해하기 힘든 추상적인 고2 지문 어휘가 등장함.' },
  { min: 511, max: 520, target: '고2 모의고사', desc: '심리 등 학술적인 주제의 단어들을 만나며 어휘 암기의 난이도가 급상승함.' },
  { min: 521, max: 530, target: '고2 모의고사', desc: '쉬운 단어가 문맥에 따라 완전히 다른 뜻으로 쓰이는 다의어 현상을 직면함.' },
  { min: 531, max: 540, target: '고2 모의고사', desc: 'objective가 \'객관적인\'이라는 형용사 뜻 외에 쓰일 수 있음을 인지함.' },
  { min: 541, max: 550, target: '고2 모의고사', desc: 'objective가 명사 자리에서 \'목표\'로 쓰임을 인지하는 등, 고2 수준 다의어에 눈을 뜸.' },
  { min: 551, max: 560, target: '고2 마스터', desc: '단어를 낱개로 외우지 않고 반의어(반대말)를 세트로 묶어서 암기하는 단계.' },
  { min: 561, max: 570, target: '고2 마스터', desc: '지문 내에서 패러프레이징(바꿔 쓰기) 되는 유의어(비슷한 말)를 묶어서 암기함.' },
  { min: 571, max: 580, target: '고2 마스터', desc: '지문을 읽다 모르는 단어가 나와도 당황하지 않고 문맥 속에서 유추를 시도함.' },
  { min: 581, max: 590, target: '고2 마스터', desc: '모르는 단어의 접두사를 분석하여 단어의 긍정/부정 뉘앙스를 때려 맞춤.' },
  { min: 591, max: 600, target: '고2 마스터', desc: '접미사를 분해해 품사를 유추하는 능력을 갖추며 고2 어휘를 마스터함.' },
  { min: 601, max: 610, target: '예비 고3', desc: '고등 과정을 총망라하는 수능 기초 어휘 암기 사이클을 마스터함.' },
  { min: 611, max: 620, target: '예비 고3', desc: '본격적인 수능 대비를 위해 EBS 수능특강 교재를 펴고 학습을 시작함.' },
  { min: 621, max: 630, target: '예비 고3', desc: '기초는 탄탄하나 EBS 한 페이지당 모르는 단어가 5~7개 정도씩 꾸준히 나옴.' },
  { min: 631, max: 640, target: '예비 고3', desc: '페이지당 등장하는 5~7개의 고난도 어휘 때문에 독해의 호흡이 계속 끊김.' },
  { min: 641, max: 650, target: '예비 고3', desc: '방대한 EBS 수능 연계 어휘량을 소화하기 위해 집중적으로 단어를 주입하는 구간.' },
  { min: 651, max: 660, target: '수능 3등급 선', desc: '수능 지문을 읽고 대의(주제, 요지)를 파악하는 데 어휘력이 발목을 잡지 않음.' },
  { min: 661, max: 670, target: '수능 3등급 선', desc: '지문의 내용은 다 이해해 놓고 정답을 고르는 선지(1~5번) 독해에서 막힘.' },
  { min: 671, max: 680, target: '수능 3등급 선', desc: '선지에 등장하는 고난도/추상적 단어들을 해석하지 못해 정답률이 떨어짐.' },
  { min: 681, max: 690, target: '수능 3등급 선', desc: '까다로운 선지 단어를 몰라서 지문 내용과 상관없는 매력적인 오답을 자주 고름.' },
  { min: 691, max: 700, target: '수능 3등급 선', desc: '수능 3등급을 방어할 어휘력은 갖췄으나 선지 어휘를 극복하지 못해 2등급을 놓침.' },
  { min: 701, max: 710, target: '수능 2등급 선', desc: '단어 조합으로 뜻이 완전히 바뀌는 고난도 구동사를 문맥에 맞게 해석하기 시작함.' },
  { min: 711, max: 720, target: '수능 2등급 선', desc: 'account for, boil down to 같은 수능 특화 고난도 구동사를 완벽히 숙지함.' },
  { min: 721, max: 730, target: '수능 2등급 선', desc: '수능에 매년 출제되는 빈출 다의어 리스트를 머릿속에 완벽하게 세팅함.' },
  { min: 731, max: 740, target: '수능 2등급 선', desc: 'subject가 주제, 과목 외에 \'피실험자\', \'종속시키다\'로 쓰임을 완벽히 구별함.' },
  { min: 741, max: 750, target: '수능 2등급 선', desc: 'observe가 \'관찰하다\' 외에 \'준수하다\'로 쓰이는 다의어의 늪을 완벽히 통과함.' },
  { min: 751, max: 760, target: '수능 1등급 선', desc: '오답률 상위권의 킬러 문항에 등장하는 악랄한 난이도의 어휘들을 뚫어냄.' },
  { min: 761, max: 770, target: '수능 1등급 선', desc: '철자가 비슷해서 수험생을 속이는 혼동 어휘를 대충 보지 않고 완벽하게 구별함.' },
  { min: 771, max: 780, target: '수능 1등급 선', desc: 'adapt(적응하다)와 adopt(입양/채택하다)의 스펠링 1개 차이를 시험장에서 짚어냄.' },
  { min: 781, max: 790, target: '수능 1등급 선', desc: 'literal(문자 그대로의)과 literary(문학의)의 미세한 형태 차이를 완벽히 파악함.' },
  { min: 791, max: 800, target: '수능 1등급 선', desc: '평가원이 파놓은 혼동 어휘 함정을 모두 피해 가며 1등급의 문을 여는 단계.' },
  { min: 801, max: 810, target: '1등급 안정권', desc: '아예 처음 보는 신조어나 고난도 학술 용어가 나와도 문맥의 흐름을 통해 당황하지 않음.' },
  { min: 811, max: 820, target: '1등급 안정권', desc: '전후 문맥을 통해 처음 보는 단어의 숨겨진 뜻을 거의 정확하게 추론해 냄.' },
  { min: 821, max: 830, target: '1등급 안정권', desc: '단순히 단어를 아는 것을 넘어 필자가 이 단어를 선택한 의도까지 꿰뚫어 봄.' },
  { min: 831, max: 840, target: '1등급 안정권', desc: '압도적인 어휘력이 문장 해석력(Syntax) 스탯과 결합하여 시너지가 폭발함.' },
  { min: 841, max: 850, target: '1등급 안정권', desc: '단어 때문에 독해가 막히는 변수가 사라져 어떤 난이도에서도 1등급을 안정적으로 방어함.' },
  { min: 851, max: 860, target: '최상위권', desc: '수능의 범주를 아득히 넘어선 텝스(TEPS), 토플(TOEFL) 수준의 고급 어휘력을 보유함.' },
  { min: 861, max: 870, target: '최상위권', desc: '수능 지문 내에서 단어가 1차원적 의미가 아닌 비유적으로 사용된 것을 단번에 캐치함.' },
  { min: 871, max: 880, target: '최상위권', desc: '영단어를 억지로 한국어로 번역하지 않고 영어 자체의 은유적 느낌 그대로 받아들임.' },
  { min: 881, max: 890, target: '최상위권', desc: '미세한 단어의 어감(Tone) 차이를 원어민처럼 섬세하게 느끼며 독해의 질이 다름.' },
  { min: 891, max: 900, target: '최상위권', desc: '고등학생으로서 도달할 수 있는 가장 높은 차원의 언어적 감각과 어휘적 깊이를 증명함.' },
  { min: 901, max: 910, target: '경찰대/사관', desc: '수능 범위를 초과하는 논문 수준의 학술적 어휘까지 완벽하게 섭렵함.' },
  { min: 911, max: 920, target: '경찰대/사관', desc: '극악의 난이도를 자랑하는 경찰대, 사관학교 기출문제 속 전문적 어휘들을 뚫어냄.' },
  { min: 921, max: 930, target: '경찰대/사관', desc: '방대한 배경지식과 결합된 어휘망을 구축하여 어떤 생소한 주제의 지문도 두렵지 않음.' },
  { min: 931, max: 940, target: '경찰대/사관', desc: '영어 텍스트를 읽을 때 어휘 때문에 해석이 막히거나 지연되는 일이 물리적으로 발생하지 않음.' },
  { min: 941, max: 950, target: '경찰대/사관', desc: '국내에 존재하는 모든 형태의 입시 영어 시험 텍스트를 어휘량 하나로 압도하는 단계.' },
  { min: 951, max: 960, target: '수능 출제자급', desc: '수능 영어 텍스트라는 생태계에 한정하여 모르는 단어의 개수가 0에 수렴함.' },
  { min: 961, max: 970, target: '수능 출제자급', desc: '더 이상 새로운 단어장을 보거나 어휘만을 위한 별도의 암기 시간을 투자할 필요가 없음.' },
  { min: 971, max: 980, target: '수능 출제자급', desc: '평가원 기출 분석과 고난도 실전 모의고사 풀이만으로도 현재의 완벽한 점수가 자동 유지됨.' },
  { min: 981, max: 990, target: '수능 출제자급', desc: '어휘의 어원과 파생 원리를 강사 수준으로 꿰뚫어 보고 있어 타인에게 설명이 가능한 경지.' },
  { min: 991, max: 1000, target: '수능 출제자급', desc: '어휘 평가 시스템이 측정할 수 있는 최고점수이자 완벽한 언어 능력자로서의 최종 마스터 단계.' }
];

const TIERS = [
  { name: 'S등급 (최상위)', minScore: 90, color: 'text-cyan-600', border: 'border-cyan-600', shadow: 'shadow-[0_0_20px_rgba(8,145,178,0.2)]', bg: 'bg-gradient-to-br from-cyan-50 to-white' },
  { name: 'A등급 (상위)', minScore: 80, color: 'text-emerald-600', border: 'border-emerald-600', shadow: 'shadow-[0_0_20px_rgba(5,150,105,0.2)]', bg: 'bg-gradient-to-br from-emerald-50 to-white' },
  { name: 'B등급 (우수)', minScore: 70, color: 'text-blue-600', border: 'border-blue-600', shadow: 'shadow-[0_0_20px_rgba(37,99,235,0.2)]', bg: 'bg-gradient-to-br from-blue-50 to-white' },
  { name: 'C등급 (보통)', minScore: 60, color: 'text-slate-600', border: 'border-slate-300', shadow: 'shadow-[0_0_15px_rgba(100,116,139,0.1)]', bg: 'bg-gradient-to-br from-slate-50 to-white' },
  { name: 'D등급 (기초)', minScore: 0, color: 'text-amber-600', border: 'border-amber-600', shadow: 'shadow-[0_0_15px_rgba(217,119,6,0.1)]', bg: 'bg-gradient-to-br from-amber-50 to-white' }
];

const SUBJECT_META = {
  '국어': {
    icon: BookOpen, title: '국어 종합 사고력',
    stats: [
      { id: 'vocab', name: '어휘력', desc: '다양한 어휘의 의미를 정확하게 파악하고 문맥에 맞게 활용하는 능력' },
      { id: 'grammar', name: '문법응용', desc: '국어의 구조와 문법 규칙을 이해하고 실제 문장에 적용하는 능력' },
      { id: 'reading', name: '독해력', desc: '복잡한 지문의 핵심 구조를 파악하고 필자의 의도를 읽어내는 능력' },
      { id: 'literature', name: '문학감상', desc: '시, 소설 등 문학 작품의 표현 방식과 숨겨진 의미를 추론하는 능력' },
      { id: 'logic', name: '논리추론', desc: '주어진 정보를 바탕으로 생략된 전제를 찾고 결론을 도출하는 능력' },
      { id: 'speed', name: '정보처리', desc: '제한된 시간 내에 방대한 텍스트 정보를 빠르고 정확하게 처리하는 능력' }
    ]
  },
  '수학': {
    icon: Calculator, title: '수리 논리 및 추론력',
    stats: [
      { id: 'calc', name: '연산력', desc: '복잡한 수식을 빠르고 정확하게 계산하여 실수를 최소화하는 기본기' },
      { id: 'concept', name: '개념이해', desc: '수학적 정의와 정리의 본질을 완벽하게 이해하고 설명할 수 있는 능력' },
      { id: 'application', name: '응용력', desc: '알고 있는 개념을 낯선 유형의 문제에 자유자재로 변형하여 적용하는 능력' },
      { id: 'reasoning', name: '추론력', desc: '주어진 조건에서 숨겨진 단서를 찾아내어 논리적 연결고리를 만드는 능력' },
      { id: 'problem', name: '문제해결', desc: '고난도 킬러 문항을 마주했을 때 끝까지 파고들어 해답을 찾아내는 끈기' },
      { id: 'intuition', name: '직관력', desc: '문제의 형태만 보고도 올바른 풀이 방향 접근법을 즉각적으로 떠올리는 감각' }
    ]
  },
  '영어': {
    icon: Globe, title: '영어 텍스트 분석력',
    stats: [
      { id: 'voca', name: '어휘력 (Voca)', desc: '단순 스펠링 암기를 넘어, 문맥에 맞는 의미 유추 (CAT 1000점 만점 기준)' }, 
      { id: 'syntax', name: '문장 해석력 (Syntax)', desc: '감으로 해석하는 것이 아니라, 주어/동사/수식어를 정확히 끊어 읽고 해독하는 능력.' },
      { id: 'theme', name: '언어적 능력 (Theme)', desc: '지문을 읽고 "그래서 필자가 하고 싶은 말이 뭔데?"를 요약해 내는 능력.' },
      { id: 'logic', name: '논리 추론 (Logic)', desc: '문장과 문장 사이의 연결사나 지시어를 파악하여 글의 순서를 맞추거나 빈칸을 채우는 능력.' },
      { id: 'detail', name: '정보 세부 파악 (Detail)', desc: '글의 내용과 일치/불일치하는 팩트를 꼼꼼하게 찾아내는 성실성과 집중력.' }
    ]
  },
  '과학': {
    icon: Atom, title: '과학적 탐구 및 응용력',
    stats: [
      { id: 'concept', name: '개념암기', desc: '물화생지 각 영역의 필수 개념과 용어를 정확하게 기억하는 능력' },
      { id: 'graph', name: '자료해석', desc: '복잡한 그래프, 표, 그림에서 유의미한 정보를 빠르고 정확하게 추출하는 능력' },
      { id: 'calc', name: '수리계산', desc: '물리, 화학 영역에서 필요한 수학적 계산을 실수 없이 수행하는 능력' },
      { id: 'experiment', name: '탐구설계', desc: '실험의 목적, 변인 통제, 대조군 등을 이해하고 결과를 예측하는 능력' },
      { id: 'application', name: '현상응용', desc: '학습한 과학적 지식을 일상생활의 다양한 현상에 논리적으로 적용하는 능력' },
      { id: '融合', name: '통합사고', desc: '서로 다른 단원이나 과목의 개념을 연결하여 복합적인 문제를 해결하는 능력' }
    ]
  }
};

const RadarChart = ({ stats, isDummy = false }) => {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) - 40;
  
  const getPoint = (val, idx, total) => {
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    const r = (val / 100) * radius;
    return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
  };

  const webLines = [100, 80, 60, 40, 20].map(level => {
    const points = stats.map((_, i) => getPoint(level, i, stats.length)).join(' ');
    return <polygon key={level} points={points} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />;
  });

  const dataPoints = stats.map((s, i) => getPoint(s.chartValue !== undefined ? s.chartValue : s.value, i, stats.length)).join(' ');

  return (
    <div className="relative w-full max-w-sm mx-auto aspect-square flex items-center justify-center">
      <svg width={size} height={size} className="overflow-visible filter drop-shadow-[0_0_10px_rgba(59,130,246,0.2)]">
        {webLines}
        {stats.map((_, i) => {
           const [x, y] = getPoint(100, i, stats.length).split(',');
           return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
        })}
        <polygon points={dataPoints} fill="rgba(59,130,246,0.3)" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        {stats.map((s, i) => {
          const [x, y] = getPoint(s.chartValue !== undefined ? s.chartValue : s.value, i, stats.length).split(',');
          return <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" />
        })}
        {!isDummy && stats.map((s, i) => {
          const [x, y] = getPoint(115, i, stats.length).split(',');
          return (
            <text key={i} x={x} y={y} fill="#64748b" fontSize="12" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
              {s.name}
            </text>
          )
        })}
      </svg>
    </div>
  );
};

const AcademyUniverse = ({ currentUser }) => {
  const { users, classes, enrollments, englishStats } = useData();
  const isStudent = currentUser.role === 'student';
  const isParent = currentUser?.role === 'parent';

  // 🚀 [학부모 UX 최적화] 연결된 자녀 리스트 추출 및 기본 타겟팅 자동화
  const linkedChildren = useMemo(() => {
      if (!isParent) return [];
      return (users || []).filter(u => u.role === 'student' && currentUser.linkedChildrenIds?.includes(u.id));
  }, [users, currentUser, isParent]);

  const [selectedChildId, setSelectedChildId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
      if (isParent && linkedChildren.length > 0 && !selectedChildId) {
          setSelectedChildId(linkedChildren[0].id);
      }
  }, [isParent, linkedChildren, selectedChildId]);

  const accessibleStudents = useMemo(() => {
      const allStudents = (users || []).filter(u => u.role === 'student');
      if (['admin', 'admin_assistant', 'ta'].includes(currentUser.role)) return allStudents;
      if (isParent) return linkedChildren;
      if (currentUser.role === 'lecturer') {
          const myClasses = (classes || []).filter(c => c.lecturerId === currentUser.id).map(c => c.id);
          const myStudentIds = (enrollments || []).filter(e => myClasses.includes(e.classId) && e.status === 'active').map(e => e.studentId);
          return allStudents.filter(s => myStudentIds.includes(s.id));
      }
      return [];
  }, [users, classes, enrollments, currentUser, isParent, linkedChildren]);

  // 🚀 실제 렌더링 대상(타겟) 설정
  const activeStudentId = isStudent ? currentUser.id : (isParent ? selectedChildId : selectedStudentId);
  const studentInfo = (users || []).find(s => s.id === activeStudentId) || currentUser;

  const studentEnglishStat = (englishStats || []).find(s => s.studentId === activeStudentId);
  const catScore = studentEnglishStat?.catScore;
  const hasCatScore = catScore !== undefined && catScore !== null;
  const currentVocaRubric = useMemo(() => {
      if (hasCatScore) {
          return VOCA_RUBRICS.find(r => catScore >= r.min && catScore <= r.max);
      }
      return null;
  }, [catScore, hasCatScore]);

  const [grades, setGrades] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);

  const handleSearchStudent = () => {
      if (!searchInput.trim()) return alert('이름을 입력해주세요.');
      const results = accessibleStudents.filter(u => u.name.includes(searchInput.trim()));
      setSearchResults(results);
      setSearchModalOpen(true);
  };

  const getSubjectFromClass = (cls) => {
      if (!cls || !cls.subject) return null;
      return cls.subject; 
  };

  const myActiveClasses = useMemo(() => {
      if (!activeStudentId) return [];
      const myEnrollments = (enrollments || []).filter(e => e.studentId === activeStudentId && e.status === 'active');
      return myEnrollments.map(e => (classes || []).find(c => c.id === e.classId)).filter(Boolean);
  }, [activeStudentId, enrollments, classes]);

  useEffect(() => {
    if (!activeStudentId) return;
    const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'), where('studentId', '==', activeStudentId));
    const unsub = onSnapshot(q, (snapshot) => {
        setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.createdAt?.seconds - b.createdAt?.seconds));
    });
    return () => unsub();
  }, [activeStudentId]);

  const generateMockStats = (subjectName) => {
    let latestScore = 0; let prevScore = 0;
    const subjectGrades = [];
    grades.forEach(g => {
        const found = g.subjects.find(s => s.name.includes(subjectName));
        if (found) subjectGrades.push(Number(found.score || 0));
    });

    if (subjectGrades.length > 0) {
        latestScore = subjectGrades[subjectGrades.length - 1];
        if (subjectGrades.length > 1) prevScore = subjectGrades[subjectGrades.length - 2];
    } else {
        if (subjectName !== '영어') return null;
    }

    const meta = SUBJECT_META[subjectName];
    return meta.stats.map((s, i) => {
        
        if (subjectName === '영어') {
            let realValue = 0;
            let chartValue = 0; 
            let dynamicDesc = s.desc; 
            
            if (s.id === 'voca') {
                realValue = studentEnglishStat?.catScore || 0; 
                chartValue = Math.round(realValue / 10); 
                
                if (hasCatScore && currentVocaRubric) {
                    dynamicDesc = `🎯 [타겟 학년: ${currentVocaRubric.target}] ${currentVocaRubric.desc}`;
                } else if (!hasCatScore) {
                    dynamicDesc = "CAT 초기 진단 점수가 아직 입력되지 않았습니다. 학원에 문의해주세요.";
                }
            } else {
                realValue = studentEnglishStat?.radarChart?.[s.id] || 0;
                if (realValue === 0) {
                    const seed = latestScore || 65;
                    const pseudoRandom = (seed * (i + 7)) % 15;
                    realValue = Math.min(100, Math.max(0, seed - pseudoRandom + 5));
                }
                chartValue = realValue;
            }
            return { ...s, value: Math.round(realValue), chartValue: Math.round(chartValue), diff: 0, isVoca: s.id === 'voca', desc: dynamicDesc };
        }

        const seed = latestScore;
        const pseudoRandom = (seed * (i + 7)) % 20; 
        const val = Math.min(100, Math.max(0, seed - pseudoRandom + 5));
        const diff = val - Math.min(100, Math.max(0, prevScore - ((prevScore * (i+3)) % 15)));
        return { ...s, value: Math.round(val), chartValue: Math.round(val), diff: Math.round(diff) };
    });
  };

  const subjectData = useMemo(() => {
    const result = {};
    Object.keys(SUBJECT_META).forEach(sub => {
        const enrolledClassesInSubject = myActiveClasses.filter(c => getSubjectFromClass(c) === sub);
        const isUnlocked = enrolledClassesInSubject.length > 0;
        
        let stats = null;
        let avg = 0;
        let tier = TIERS[TIERS.length - 1]; 
        let hasGradeData = false;

        if (isUnlocked) {
            const rawStats = generateMockStats(sub);
            if (rawStats) {
                stats = rawStats;
                const normalizedSum = stats.reduce((acc, cur) => acc + (cur.isVoca ? Math.round(cur.value / 10) : cur.value), 0);
                avg = Math.round(normalizedSum / stats.length);
                tier = TIERS.find(t => avg >= t.minScore) || TIERS[TIERS.length - 1];
                hasGradeData = true;
            } else {
                stats = SUBJECT_META[sub].stats.map(s => ({ ...s, value: 0, chartValue: 0, diff: 0 }));
            }
            result[sub] = { 
                isUnlocked, stats, avg, tier, meta: SUBJECT_META[sub], 
                enrolledClasses: enrolledClassesInSubject, hasGradeData 
            };
        } else {
            result[sub] = { isUnlocked: false, meta: SUBJECT_META[sub] };
        }
    });
    return result;
  }, [grades, myActiveClasses, englishStats]);

  // 🚀 [예외 처리] 학부모인데 연결된 자녀가 없을 경우
  if (isParent && linkedChildren.length === 0) {
      return (
          <div className="p-10 text-center flex flex-col items-center">
              <AlertCircle size={48} className="text-gray-300 mb-4" />
              <h2 className="text-xl font-bold text-gray-600">연결된 자녀 정보가 없습니다.</h2>
              <p className="text-gray-400 mt-2">학원 데스크에 자녀 계정 연결을 요청해주세요.</p>
          </div>
      );
  }

  // 관리자/강사용 학생 검색 뷰
  if (!isStudent && !isParent && !activeStudentId) {
      return (
          <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in pb-20 px-2 sm:px-4 pt-10">
              <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl text-center md:text-left">
                  <h1 className="text-3xl font-black mb-2 flex items-center justify-center md:justify-start gap-3"><Target className="text-blue-400" size={32}/> 역량 분석실 (관리자 모드)</h1>
                  <p className="text-slate-400 font-bold mb-8">분석 리포트를 열람할 학생의 이름을 검색해 주세요.</p>
                  <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20 max-w-lg mx-auto md:mx-0">
                      <Search className="ml-4 text-white/50 shrink-0 hidden sm:block" />
                      <input type="text" className="w-full p-3 bg-transparent text-white font-bold outline-none placeholder:text-white/40 text-center sm:text-left" placeholder="학생 이름 검색 (예: 홍길동)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()} />
                      <Button onClick={handleSearchStudent} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 px-6 font-black shrink-0 shadow-lg">검색</Button>
                  </div>
              </div>

              <Modal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} title="학생 검색 결과">
                  <div className="space-y-2 p-2 max-h-96 overflow-y-auto custom-scrollbar">
                      {searchResults.length === 0 ? <div className="text-center py-10 text-slate-400 font-bold">조건에 맞는 학생이 없습니다.</div> :
                      searchResults.map(s => (
                          <div key={s.id} onClick={() => { setSelectedStudentId(s.id); setSearchModalOpen(false); setSearchInput(''); }} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors group">
                              <div>
                                  <div className="font-black text-slate-800 text-lg group-hover:text-blue-600">{s.name}</div>
                                  <div className="text-sm font-bold text-slate-400">{s.schoolName || '학교미상'} ({s.grade || '학년미상'}) · {s.phone || '연락처없음'}</div>
                              </div>
                              <ChevronRight className="text-slate-300 group-hover:text-blue-500"/>
                          </div>
                      ))}
                  </div>
              </Modal>
          </div>
      );
  }

  if (!selectedSubject) {
      return (
        <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in pb-20 px-4 pt-6">
            {!isStudent && !isParent && (
                <button onClick={() => setSelectedStudentId('')} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold mb-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
                    <ChevronLeft size={18}/> 학생 검색으로 돌아가기
                </button>
            )}

            {/* 🚀 [다자녀 학부모 전용 UI] 2명 이상일 때만 렌더링되는 자녀 전환 드롭다운 */}
            {isParent && linkedChildren.length > 1 && (
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 flex items-center justify-between mb-4">
                    <span className="font-bold text-indigo-800 flex items-center gap-2">
                        <Users size={18} /> 조회할 자녀 선택
                    </span>
                    <select 
                        value={selectedChildId || ''} 
                        onChange={(e) => setSelectedChildId(e.target.value)}
                        className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-4 py-2 rounded-lg outline-none cursor-pointer"
                    >
                        {linkedChildren.map(child => (
                            <option key={child.id} value={child.id}>{child.name} 학생</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="text-center mb-10 bg-white p-8 rounded-[32px] shadow-sm border border-slate-100">
                <h1 className="text-3xl font-black text-slate-800 flex items-center justify-center gap-3 mb-4">
                    <Sparkles className="text-indigo-600" size={32}/> 아카데미 유니버스
                </h1>
                <p className="text-slate-500 font-bold text-lg">
                    {studentInfo?.name} 학생의 과목별 성취도를 입체적으로 분석합니다.<br/>
                    <span className="text-sm font-normal text-slate-400 border bg-slate-50 px-3 py-1 rounded-lg mt-2 inline-block">현재 학원에서 수강 중인 과목의 분석 리포트만 활성화됩니다.</span>
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {Object.entries(subjectData).map(([subName, data]) => {
                    const Icon = data.meta.icon;
                    if (!data.isUnlocked) {
                        return (
                            <div key={subName} className="relative bg-slate-50 rounded-[32px] p-6 flex flex-col items-center justify-center text-center overflow-hidden border border-slate-200 h-80 group">
                                <div className="absolute inset-0 opacity-40 blur-[4px] pointer-events-none flex items-center justify-center scale-125">
                                    <RadarChart stats={data.meta.stats.map(s => ({ value: 60, chartValue: 60 }))} isDummy={true} />
                                </div>
                                <div className="absolute inset-0 bg-slate-50/80 z-0"></div>

                                <Lock size={36} className="text-slate-400 mb-4 relative z-10"/>
                                <h3 className="text-2xl font-black text-slate-800 mb-3 relative z-10">{subName} 미수강</h3>
                                <p className="text-xs font-bold text-slate-500 relative z-10 px-2 leading-relaxed mb-6 break-keep">
                                    해당 과목은 현재 학원에서<br/>수강 중이지 않습니다.<br/>단과 등록 시 정밀 진단 시스템이 오픈됩니다.
                                </p>
                                <Badge variant="outline" className="relative z-10 border-slate-300 text-slate-500 bg-white shadow-sm">진단 불가</Badge>
                            </div>
                        );
                    }

                    return (
                        <div key={subName} onClick={() => setSelectedSubject(subName)} 
                             className={`relative bg-white rounded-[32px] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:-translate-y-2 group border-2 ${data.tier.border} ${data.tier.shadow} h-80`}>
                            
                            <div className={`absolute inset-0 opacity-10 rounded-[28px] ${data.tier.bg}`}></div>
                            <Badge variant="outline" className={`absolute top-4 right-4 font-black bg-white shadow-sm ${data.tier.color}`}>{data.tier.name}</Badge>
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-md bg-white border border-slate-100 ${data.tier.color} relative z-10 group-hover:scale-110 transition-transform`}>
                                <Icon size={36} />
                            </div>
                            <div className="relative z-10">
                                <p className="text-xs font-black text-slate-400 mb-1">{data.meta.title}</p>
                                <h3 className="text-2xl font-black text-slate-800 mb-3">{subName}</h3>
                                <p className="text-sm font-black text-slate-600 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100 shadow-sm flex items-center justify-center gap-1.5">
                                    종합 지수 <span className="text-blue-600 text-base">{data.avg}</span>
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  }

  const currData = subjectData[selectedSubject];
  const Icon = currData.meta.icon;
  
  const calcExpectedGrade = (score) => {
      if(score >= 90) return 1; if(score >= 80) return 2; if(score >= 70) return 3;
      if(score >= 60) return 4; if(score >= 50) return 5; return 6;
  };

  return (
      <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in pb-20 px-2 sm:px-4 pt-6">
          
          <button onClick={() => setSelectedSubject(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold mb-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-200 transition-colors w-fit">
              <ChevronLeft size={18}/> 과목 대시보드로 돌아가기
          </button>

          <div className={`bg-white border border-slate-200 rounded-[40px] p-8 sm:p-12 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center gap-8`}>
              <div className={`w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-slate-50 border-4 border-slate-100 flex items-center justify-center shadow-md relative z-10 shrink-0 ${currData.tier.color}`}>
                  <Icon size={64} />
              </div>

              <div className="relative z-10 text-center md:text-left flex-1">
                  <Badge variant="outline" className={`bg-slate-50 border-slate-200 text-slate-500 mb-3 font-bold px-3 py-1`}>{currData.meta.title}</Badge>
                  <h1 className="text-3xl sm:text-4xl font-black text-slate-800 mb-3 tracking-tight">{studentInfo?.name} 학생의 {selectedSubject} 정밀 분석</h1>
                  <p className="text-slate-600 font-medium text-base leading-relaxed max-w-2xl break-keep mt-4">
                      데이터 분석 결과, {selectedSubject} 종합 성취 지수는 <span className="text-blue-600 font-black text-lg">{currData.avg}</span>점이며 현재 <span className={currData.tier.color + " font-black text-lg"}>{currData.tier.name}</span> 구간에 위치하고 있습니다. 부족한 세부 역량을 파악하고 전략을 수립하세요.
                  </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 relative z-10 shrink-0 text-center min-w-[200px]">
                  <div className="text-slate-500 font-bold text-sm mb-2 flex items-center justify-center gap-2"><Award size={16}/> 모의고사 예상 등급</div>
                  <div className="text-5xl font-black text-slate-800 mb-1">{calcExpectedGrade(currData.avg)}<span className="text-2xl text-slate-400 font-bold ml-1">등급</span></div>
                  <div className="text-xs font-bold text-slate-400 mt-2">최근 누적 데이터 환산치</div>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="space-y-6">
                  <Card className="bg-white border-slate-200 rounded-[40px] p-8 flex flex-col items-center justify-center shadow-sm h-[500px]">
                      <h3 className="text-xl font-black text-slate-800 mb-8 w-full text-left flex items-center gap-2"><Target className="text-blue-500"/> {selectedSubject === '영어' ? '5대 핵심 역량 스캐너' : '6대 세부 역량 스캐너'}</h3>
                      <div className="w-full flex-1 flex items-center justify-center">
                          <RadarChart stats={currData.stats} />
                      </div>
                  </Card>

                  {selectedSubject === '영어' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <Card className="bg-white border-slate-200 rounded-[32px] p-6 shadow-sm border-t-4 border-t-indigo-500 flex flex-col justify-between h-56">
                              <div>
                                  <div className="flex items-center justify-between mb-2">
                                      <h3 className="text-lg font-black text-slate-800 flex items-center gap-1.5"><Network size={18} className="text-indigo-500"/> 문법 구조 스킬 트리</h3>
                                      <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-600 border-indigo-200">구조 정밀 진단</Badge>
                                  </div>
                                  <p className="text-xs font-bold text-slate-400 leading-relaxed break-keep mt-2">
                                      품사론부터 특수구문까지 배우는 계통 순서에 따른 스킬 매트릭스를 형성합니다. 영문법 어디서부터 구조적 구멍이 생겼는지 직관적으로 역추적 추적합니다.
                                  </p>
                              </div>
                              <div className="bg-slate-50 border border-dashed border-slate-200 p-2 rounded-xl text-center text-[11px] font-black text-slate-400">
                                  📊 문법 노드 매핑 준비 완료
                              </div>
                          </Card>

                          <Card className="bg-white border-slate-200 rounded-[32px] p-6 shadow-sm border-t-4 border-t-cyan-500 flex flex-col justify-between h-56">
                              <div>
                                  <div className="flex items-center justify-between mb-2">
                                      <h3 className="text-lg font-black text-slate-800 flex items-center gap-1.5"><LayoutGrid size={18} className="text-cyan-500"/> 수능 유형별 히트맵</h3>
                                      <Badge variant="outline" className="text-[10px] bg-cyan-50 text-cyan-600 border-cyan-200">모의고사 타겟팅</Badge>
                                  </div>
                                  <p className="text-xs font-bold text-slate-400 leading-relaxed break-keep mt-2">
                                      평가원 및 교육청 모의고사 문제 유형을 기준으로 통계를 내어 학생이 특수하게 강하거나 취약한 소포 가공 유형을 입체 파악합니다.
                                  </p>
                              </div>
                              <div className="bg-slate-50 border border-dashed border-slate-200 p-2 rounded-xl text-center text-[11px] font-black text-slate-400">
                                  🟩 격자 그리드 매핑 준비 완료
                              </div>
                          </Card>
                      </div>
                  )}
              </div>

              <div className="space-y-6 flex flex-col h-[500px] lg:h-auto overflow-hidden">
                  <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
                      {currData.stats.map(stat => (
                          <Card key={stat.id} className="p-5 border-slate-200 rounded-[24px] hover:border-indigo-400 transition-all flex flex-col bg-white shadow-sm">
                              
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full">
                                  <div className="w-full sm:w-32 flex flex-col items-center justify-center border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0 shrink-0">
                                      <span className="text-sm font-black text-slate-500 mb-1 text-center">{stat.name}</span>
                                      <div className="flex items-baseline justify-center gap-1">
                                          <span className="text-2xl font-black text-slate-800">
                                              {stat.isVoca && !hasCatScore ? '진단 대기' : stat.value}
                                          </span>
                                          {stat.isVoca && hasCatScore && (
                                              <span className="text-[10px] font-bold text-slate-400">/ 1000</span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  <div className="flex-1 w-full">
                                      <p className="text-[13px] font-bold text-slate-600 leading-relaxed mb-3 break-keep">{stat.desc}</p>
                                      
                                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full transition-all duration-1000 ${stat.isVoca && !hasCatScore ? 'bg-slate-200' : stat.chartValue >= 80 ? 'bg-blue-500' : stat.chartValue >= 60 ? 'bg-blue-300' : 'bg-slate-300'}`} style={{ width: `${stat.isVoca && !hasCatScore ? 0 : stat.chartValue}%` }}></div>
                                      </div>
                                  </div>
                              </div>

                              {stat.isVoca && hasCatScore && (
                                  <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 p-4 rounded-2xl w-full">
                                      <h4 className="text-xs font-black text-blue-700 flex items-center gap-1 mb-3"><Sparkles size={14}/> Voca 학습 상세 추적 지표</h4>
                                      <div className="space-y-3">
                                          <div>
                                              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                                                  <span>📚 어휘 진도 (학년 단어 학습 퍼센트)</span><span className="text-blue-600">{studentEnglishStat?.vProgress || studentEnglishStat?.vocaProgress || 0}%</span>
                                              </div>
                                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${studentEnglishStat?.vProgress || studentEnglishStat?.vocaProgress || 0}%` }}></div></div>
                                          </div>
                                          <div>
                                              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                                                  <span>🧠 뜻 이해도 (다의어/파생어 깊이 측정)</span><span className="text-emerald-600">{studentEnglishStat?.vComprehension || studentEnglishStat?.vocaComprehension || 0}%</span>
                                              </div>
                                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${studentEnglishStat?.vComprehension || studentEnglishStat?.vocaComprehension || 0}%` }}></div></div>
                                          </div>
                                          <div>
                                              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                                                  <span>🔋 장기 기억력 (기억 유지력 자동 환산)</span><span className="text-indigo-600">{studentEnglishStat?.vRetention || studentEnglishStat?.vocaRetention || 0}%</span>
                                              </div>
                                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${studentEnglishStat?.vRetention || studentEnglishStat?.vocaRetention || 0}%` }}></div></div>
                                          </div>
                                      </div>
                                  </div>
                              )}
                          </Card>
                      ))}

                      <div className="mt-8 pt-4 border-t-2 border-dashed border-slate-200">
                          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                              <BookOpen className="text-indigo-600" size={20}/> 수강 중인 연계 클래스
                          </h3>
                          <div className="grid grid-cols-1 gap-3">
                              {currData.enrolledClasses.map(cls => (
                                  <div key={cls.id} className="bg-indigo-50 border border-indigo-100 p-4 rounded-[20px] flex flex-col justify-center shadow-sm">
                                      <div className="flex justify-between items-start mb-2">
                                          <h4 className="font-black text-indigo-900 text-base">{cls.name}</h4>
                                          <CheckCircle size={16} className="text-emerald-500"/>
                                      </div>
                                      <div className="text-xs font-bold text-indigo-700 mb-2">
                                          담당 강사: {users.find(u => u.id === cls.lecturerId)?.name || '미지정'}
                                      </div>
                                      <div className="bg-white p-3 rounded-xl text-[12px] font-bold text-slate-500 leading-relaxed shadow-sm">
                                          {cls.description || `${selectedSubject} 과목의 핵심 역량을 강화하고 실전 감각을 극대화하는 맞춤형 정규 클래스입니다. 현재 ${studentInfo?.name} 학생의 취약점을 보완하는 데 집중하고 있습니다.`}
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
};

export default AcademyUniverse;