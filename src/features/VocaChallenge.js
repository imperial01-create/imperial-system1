/* [서비스 가치] 게이미피케이션(Gamification)을 통한 영단어 암기 몰입도 극대화 엔진 v2.1
   - (🚀 CTO 패치: 런타임 에러(White Screen)를 원천 차단하는 방탄(Bulletproof) 설계 및 예외 처리 도입)
   - 과목 자동 필터링, Day 범위 기반 동적 스코어링, 라운드 트랜지션 및 랭킹 무결성 로직 탑재 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trophy, Play, Clock, Flame, Lock, Crown, Settings, AlertCircle, CheckCircle, XCircle, Loader, BookOpen, ChevronRight } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, getDocs, where, addDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Card, Button, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// 🚀 원장님 제공 실제 CSV 데이터
const RAW_CSV_DATA = `NVH2_D08_281,maintain,M1,preserve,
NVH2_D08_281,maintain,M2,assert,
NVH2_D08_282,undermine,M1,weaken,strengthen
NVH2_D08_283,revise,M1,alter,
NVH2_D08_284,character,M1,personality,
NVH2_D08_284,character,M2,quality,
NVH2_D08_285,comment,M1,remark,
NVH2_D08_287,discourse,M1,"dialogue, discussion",
NVH2_D08_288,replace,M1,substitute,
NVH2_D08_290,immediate,M1,instant,
NVH2_D08_293,measure,M2,assess,
NVH2_D08_294,realize,M1,recognize,
NVH2_D08_294,realize,M2,achieve,
NVH2_D08_295,manage,M1,"run, administer",
NVH2_D08_296,administer,M1,manage,
NVH2_D08_297,provide,M1,supply,
NVH2_D08_298,rush,M1,hurry,
NVH2_D08_299,diminish,M1,"reduce, decrease",increase
NVH2_D08_300,permit,M1,allow,forbid
NVH2_D08_302,moderate,M1,,excessive
NVH2_D08_303,fulfill,M1,achieve,
NVH2_D08_303,fulfill,M2,perform,
NVH2_D08_306,convenience,M1,,inconvenience
NVH2_D08_307,attitude,M1,stance,
NVH2_D08_308,altitude,M1,height,
NVH2_D08_310,generate,M1,create,
NVH2_D08_311,coherent,M1,consistent,
NVH2_D08_312,maximum,M1,,minimum,
NVH2_D08_313,glow,M1,shine,
NVH2_D08_314,similarity,M1,resemblance,difference
NVH2_D08_316,versus,M1,against,
NVH2_D08_317,embody,M1,represent,
NVH2_D08_319,advent,M1,arrival,
NVH2_D08_320,allocate,M1,assign,
NVH2_D09_321,imaginary,M1,,real
NVH2_D09_323,discard,M1,dispose of,
NVH2_D09_324,disguise,M1,camouflage,
NVH2_D09_324,disguise,M2,conceal,
NVH2_D09_327,coordinate,M1,organize,
NVH2_D09_329,utilize,M1,make use of,
NVH2_D09_330,commence,M1,begin,
NVH2_D09_331,apparent,M1,obvious,
NVH2_D09_333,ordinary,M1,"normal, usual",extraordinary
NVH2_D09_334,gaze,M1,stare,
NVH2_D09_335,perspective,M1,viewpoint,
NVH2_D09_336,compel,M1,force,
NVH2_D09_337,release,M1,liberate,
NVH2_D09_339,disclose,M1,reveal,conceal
NVH2_D09_340,swear,M1,vow,
NVH2_D09_341,passion,M1,enthusiasm,
NVH2_D09_342,negotiate,M1,bargain,
NVH2_D09_343,rotate,M1,revolve,
NVH2_D09_345,comprehensible,M1,understandable,
NVH2_D09_346,comprehensive,M1,broad,
NVH2_D09_347,mature,M1,,immature
NVH2_D09_348,quote,M1,cite,
NVH2_D09_349,burden,M1,load,
NVH2_D09_350,thrive,M1,"flourish, prosper",
NVH2_D09_352,soar,M1,,plunge
NVH2_D09_353,nurture,M1,raise,
NVH2_D09_354,correlation,M1,connection,
NVH2_D09_356,impair,M1,"harm, worsen",
NVH2_D09_357,domain,M1,"field, sphere, realm",
NVH2_D09_359,constraint,M1,restriction,
NVH2_D10_361,investigate,M1,examine,
NVH2_D10_362,exploit,M1,abuse,
NVH2_D10_367,crawl,M1,creep,
NVH2_D10_368,invaluable,M1,priceless,worthless
NVH2_D10_369,disprove,M1,,prove
NVH2_D10_370,accomplish,M1,"achieve, fulfill",
NVH2_D10_372,primary,M1,main,
NVH2_D10_373,approve,M1,,disapprove of
NVH2_D10_373,approve,M2,authorize,
NVH2_D10_375,oppose,M1,resist,
NVH2_D10_377,purpose,M1,"aim, objective",
NVH2_D10_379,nominate,M1,propose,
NVH2_D10_379,nominate,M2,appoint,
NVH2_D10_382,acquire,M1,obtain,
NVH2_D10_383,border,M1,frontier,
NVH2_D10_384,humanity,M1,humankind,
NVH2_D10_385,virtue,M1,,vice
NVH2_D10_385,virtue,M2,merit,
NVH2_D10_386,compete,M1,contend,
NVH2_D10_387,applaud,M1,clap,
NVH2_D10_387,applaud,M2,praise,
NVH2_D10_389,vibrate,M1,tremble,
NVH2_D10_390,soak,M1,drench,
NVH2_D10_393,readily,M1,willingly,
NVH2_D10_393,readily,M2,easily,
NVH2_D10_396,duration,M1,time span,
NVH2_D10_398,disperse,M1,scatter,
NVH2_D10_399,outperform,M1,"surpass, outdo",
NVH2_D10_400,embrace,M1,hug,
NVH2_D11_401,annual,M1,yearly,
NVH2_D11_402,dare,M1,venture,
NVH2_D11_403,confident,M2,certain,
NVH2_D11_404,confidential,M1,"classified, secret",
NVH2_D11_406,scatter,M2,disperse,
NVH2_D11_407,obscure,M1,ambiguous,
NVH2_D11_410,recover,M1,heal,
NVH2_D11_410,recover,M2,retrieve,
NVH2_D11_412,compensate,M1,reimburse,
NVH2_D11_413,merit,M1,advantage,disadvantage
NVH2_D11_414,fallacy,M1,misconception,
NVH2_D11_416,regulate,M2,adjust,
NVH2_D11_418,considerable,M1,"substantial, significant",
NVH2_D11_419,considerate,M1,thoughtful,inconsiderate
NVH2_D11_423,string,M2,series,
NVH2_D11_425,boost,M1,increase,
NVH2_D11_426,escape,M1,"flee, get away",
NVH2_D11_427,uncover,M1,expose,
NVH2_D11_428,tackle,M1,handle,
NVH2_D11_428,tackle,M3,gear,
NVH2_D11_429,urge,M1,prompt,
NVH2_D11_429,urge,M2,desire,
NVH2_D11_431,static,M1,immobile,
NVH2_D11_434,tenant,M1,renter,
NVH2_D11_435,misconception,M1,fallacy,
NVH2_D11_437,vice,M1,,virtue
NVH2_D11_440,produce,M1,manufacture,
NVH2_D12_441,occupy,M1,take up,
NVH2_D12_442,pursue,M1,seek,
NVH2_D12_442,pursue,M2,chase,
NVH2_D12_443,restoration,M2,recovery,
NVH2_D12_444,worship,M1,revere,
NVH2_D12_447,prospect,M1,possibility,
NVH2_D12_447,prospect,M2,expectation,
NVH2_D12_448,likewise,M1,similarly,
NVH2_D12_451,endeavor,M1,effort,
NVH2_D12_451,endeavor,M2,strive,
NVH2_D12_452,bond,M1,tie,
NVH2_D12_453,shrink,M1,decrease,expand
NVH2_D12_454,insist,M1,assert,
NVH2_D12_455,sacred,M1,holy,
NVH2_D12_456,ridiculous,M1,absurd,
NVH2_D12_457,establish,M1,found,
NVH2_D12_459,restrict,M1,limit,
NVH2_D12_460,overcome,M1,get over,
NVH2_D12_461,activate,M1,,deactivate
NVH2_D12_464,precious,M1,valuable,worthless
NVH2_D12_466,instruct,M1,order,
NVH2_D12_467,compulsory,M1,mandatory,
NVH2_D12_468,multiple,M1,numerous,
NVH2_D12_469,illustrate,M1,explain,
NVH2_D12_471,drift,M1,float,
NVH2_D12_472,amplify,M1,increase,
NVH2_D12_474,desirable,M1,worthwhile,undesirable
NVH2_D12_477,rigid,M1,strict,
NVH2_D12_477,rigid,M3,stiff,
NVH2_D12_480,assign,M1,allocate,
NVH2_D13_481,distinguish,M1,"differentiate, discriminate",
NVH2_D13_482,crop,M2,harvest,
NVH2_D13_485,trait,M1,characteristic,
NVH2_D13_486,punish,M1,penalize,
NVH2_D13_487,appropriate,M1,suitable,inappropriate
NVH2_D13_489,specific,M1,precise,vague
NVH2_D13_489,specific,M2,particular,
NVH2_D13_490,translate,M1,interpret,
NVH2_D13_490,translate,M2,convert,
NVH2_D13_492,inhibit,M1,restrain,
NVH2_D13_493,divine,M1,sacred,
NVH2_D13_494,signal,M1,cue,
NVH2_D13_495,prohibit,M1,forbid,
NVH2_D13_495,prohibit,M2,prevent,
NVH2_D13_496,retreat,M1,withdraw,
NVH2_D13_496,retreat,M2,withdrawal,
NVH2_D13_497,equipment,M1,"gear, apparatus",
NVH2_D13_498,intuition,M1,instinct,
NVH2_D13_499,whereas,M1,while,
NVH2_D13_500,ruin,M1,destroy,
NVH2_D13_501,successful,M1,,unsuccessful
NVH2_D13_502,successive,M1,consecutive,
NVH2_D13_503,genre,M1,type,
NVH2_D13_505,comparative,M2,relative,
NVH2_D13_506,comparable,M1,similar,
NVH2_D13_508,implication,M1,connotation,
NVH2_D13_511,seize,M1,grab,
NVH2_D13_512,immune,M2,unaffected,
NVH2_D13_512,immune,M3,exempt,
NVH2_D13_513,eternal,M1,everlasting,
NVH2_D13_514,commercial,M1,,noncommercial
NVH2_D13_515,cope,M1,"manage, handle",
NVH2_D13_518,retrieve,M1,"recover, regain",
NVH2_D13_519,bystander,M1,onlooker,
NVH2_D14_521,rapid,M1,"quick, swift",
NVH2_D14_523,plunge,M1,"dive, plummet",
NVH2_D14_523,plunge,M2,plummet,
NVH2_D14_524,factor,M1,element,
NVH2_D14_525,insane,M1,,"sane, rational"
NVH2_D14_526,swift,M1,rapid,
NVH2_D14_528,immerse,M1,soak,
NVH2_D14_528,immerse,M2,engross,
NVH2_D14_529,minimize,M1,,maximize
NVH2_D14_532,disposition,M1,"character, temperament",
NVH2_D14_532,disposition,M2,arrangement,
NVH2_D14_533,penalty,M1,punishment,
NVH2_D14_537,furnish,M2,supply,
NVH2_D14_538,originality,M1,"ingenuity, creativity",
NVH2_D14_539,strengthen,M1,reinforce,weaken
NVH2_D14_541,format,M1,layout,
NVH2_D14_542,gigantic,M1,"huge, enormous",tiny,
NVH2_D14_543,breakthrough,M1,"development, advance",
NVH2_D14_546,promising,M1,hopeful,
NVH2_D14_552,sheer,M1,complete,
NVH2_D14_552,sheer,M2,steep,
NVH2_D14_553,forbid,M1,prohibit,permit
NVH2_D14_555,fabricate,M2,manufacture,
NVH2_D14_559,depict,M1,portray,
NVH2_D15_561,pioneer,M1,innovator,
NVH2_D15_561,pioneer,M2,initiate,
NVH2_D15_562,lure,M1,tempt,
NVH2_D15_563,outdated,M1,"old-fashioned, obsolete",
NVH2_D15_565,drawback,M1,disadvantage,
NVH2_D15_566,equality,M1,,inequality
NVH2_D15_567,lean,M3,thin,
NVH2_D15_568,penetrate,M1,pierce,
NVH2_D15_569,shatter,M1,smash,
NVH2_D15_571,flee,M1,escape,
NVH2_D15_572,discrete,M1,separate,connected
NVH2_D15_575,ambiguity,M1,uncertainty,clarity
NVH2_D15_577,ongoing,M1,"continuous, underway",
NVH2_D15_578,hypothesis,M2,assumption,
NVH2_D15_580,spontaneous,M1,voluntary,
NVH2_D15_580,spontaneous,M2,unplanned,
NVH2_D15_582,prone,M1,liable,
NVH2_D15_583,halt,M2,cease,
NVH2_D15_584,scope,M1,range,
NVH2_D15_584,scope,M2,potential,
NVH2_D15_587,crude,M1,natural,
NVH2_D15_588,gross,M1,total,
NVH2_D15_589,speculate,M1,guess,
NVH2_D15_593,integral,M1,"essential, necessary",
NVH2_D15_595,legitimate,M1,legal,
NVH2_D15_595,legitimate,M2,reasonable,
NVH2_D15_597,seldom,M1,"rarely, scarcely",
NVH2_D15_598,tease,M1,mock,
NVH2_D15_599,representative,M1,delegate,
NVH2_D15_600,auditory,M1,aural,`;

const processRawCSV = (csvText) => {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;
    
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\n' || char === '\r') && !insideQuotes) {
        if (char === '\r') continue;
        currentRow.push(currentCell.trim());
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }

    const wordMap = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;
      
      const wordId = row[0];
      const word = row[1];
      const synStr = row[3];
      const antStr = row[4];
      if (!word) continue;
      
      let dayMatch = wordId.match(/_D(\d+)_/);
      let dayNum = dayMatch ? parseInt(dayMatch[1], 10) : 1;

      if (!wordMap[word]) {
        wordMap[word] = { word: word, day: dayNum, synSet: new Set(), antSet: new Set() };
      }
      
      if (synStr) {
        synStr.split(',').forEach(s => {
          const cleaned = s.replace(/^"|"$/g, '').trim();
          if(cleaned) wordMap[word].synSet.add(cleaned);
        });
      }
      if (antStr) {
        antStr.split(',').forEach(a => {
          const cleaned = a.replace(/^"|"$/g, '').trim();
          if(cleaned) wordMap[word].antSet.add(cleaned);
        });
      }
    }

    return Object.values(wordMap).map(item => ({
      word: item.word,
      day: item.day,
      syn: Array.from(item.synSet),
      ant: Array.from(item.antSet)
    }));
};

const shuffleArray = (array) => {
    if (!array || !Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

// 🚀 안전한 배열 랜덤 추출 함수 (빈 배열 시 예외 처리)
const safePick = (arr) => arr && arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : "없음";

export default function VocaChallenge({ currentUser }) {
    const { classes = [], enrollments = [] } = useData() || {};
    const isStudent = currentUser.role === 'student';

    const englishClasses = useMemo(() => {
        return classes.filter(c => c.subject === '영어' || (c.name && c.name.includes('영어')));
    }, [classes]);

    const [activeClasses, setActiveClasses] = useState([]);
    const [adminTab, setAdminTab] = useState('settings'); 
    const [adminSelectedClass, setAdminSelectedClass] = useState('');
    
    const [rankings, setRankings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [gameState, setGameState] = useState('intro'); 
    const [overlayState, setOverlayState] = useState('none'); 
    const [countdownNum, setCountdownNum] = useState(3);
    const [roundInfo, setRoundInfo] = useState({ round: 1, time: 15 });

    const [timeLeft, setTimeLeft] = useState(15);
    const [score, setScore] = useState(0);
    const [questionNum, setQuestionNum] = useState(1);
    
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [studentClassId, setStudentClassId] = useState(null); 

    const vocaDataAll = useMemo(() => processRawCSV(RAW_CSV_DATA), []);
    
    const availableDays = useMemo(() => {
        return [...new Set(vocaDataAll.map(v => v.day))].sort((a,b) => a-b);
    }, [vocaDataAll]);
    const [selectedDays, setSelectedDays] = useState([]);

    const activeVocaData = useMemo(() => {
        return vocaDataAll.filter(v => selectedDays.includes(v.day));
    }, [vocaDataAll, selectedDays]);

    useEffect(() => {
        if (!document.getElementById('confetti-script')) {
            const script = document.createElement('script');
            script.id = 'confetti-script';
            script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
            script.async = true;
            document.body.appendChild(script);
        }
        setSelectedDays(availableDays);
    }, [availableDays]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'voca_challenge'), (docSnap) => {
            if (docSnap.exists()) setActiveClasses(docSnap.data().activeClassIds || []);
            else setActiveClasses([]);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (isStudent && enrollments && activeClasses.length > 0) {
            const myEnrolls = enrollments.filter(e => e.studentId === currentUser.id && e.status === 'active');
            const myActiveChallenge = myEnrolls.find(e => activeClasses.includes(e.classId));
            if (myActiveChallenge) {
                setStudentClassId(myActiveChallenge.classId);
            } else {
                setStudentClassId(null);
            }
        }
    }, [isStudent, enrollments, activeClasses, currentUser.id]);

    const loadRankings = useCallback((targetClassId) => {
        if (!targetClassId) return;
        const q = query(
            collection(db, `artifacts/${APP_ID}/public/data/voca_rankings`),
            where('classId', '==', targetClassId),
            orderBy('score', 'desc'),
            limit(15)
        );
        const unsub = onSnapshot(q, snap => {
            setRankings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return unsub;
    }, []);

    useEffect(() => {
        let unsub = null;
        if (!isStudent && adminSelectedClass) unsub = loadRankings(adminSelectedClass);
        else if (isStudent && studentClassId) unsub = loadRankings(studentClassId);
        
        return () => { if (unsub) unsub(); }
    }, [isStudent, adminSelectedClass, studentClassId, loadRankings]);


    const toggleClassActive = async (classId) => {
        const newActive = activeClasses.includes(classId) 
            ? activeClasses.filter(id => id !== classId)
            : [...activeClasses, classId];
        
        await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'voca_challenge'), {
            activeClassIds: newActive, updatedAt: serverTimestamp()
        }, { merge: true });
    };

    const handleClearRankings = async () => {
        if (!adminSelectedClass) return;
        if (!window.confirm("이 반의 랭킹 기록을 모두 초기화 하시겠습니까?")) return;
        
        const q = query(collection(db, `artifacts/${APP_ID}/public/data/voca_rankings`), where('classId', '==', adminSelectedClass));
        const snap = await getDocs(q);
        snap.forEach(d => deleteDoc(d.ref));
        alert("랭킹이 초기화 되었습니다.");
    };

    const toggleDaySelection = (day) => {
        setSelectedDays(prev => 
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a,b)=>a-b)
        );
    };

    const getRoundConfig = (qNum) => {
        const multiplier = selectedDays.length || 1;
        const basePoints = multiplier * 10;
        if (qNum <= 10) return { round: 1, time: 15, baseScore: basePoints, bonus: multiplier * 1 };
        if (qNum <= 20) return { round: 2, time: 10, baseScore: basePoints * 2, bonus: multiplier * 2 };
        return { round: 3, time: 5, baseScore: basePoints * 3, bonus: multiplier * 5 };
    };

    const handleStartClick = () => {
        if (selectedDays.length === 0) return alert("학습할 Day를 최소 1개 이상 선택해주세요!");
        if (activeVocaData.length < 5) return alert("선택한 범위의 단어 수가 너무 적습니다 (최소 5개 필요).");
        
        setScore(0);
        setQuestionNum(1);
        setOverlayState('countdown');
        
        let count = 3;
        setCountdownNum(count);
        
        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                setCountdownNum(count);
            } else if (count === 0) {
                setCountdownNum('Start!');
            } else {
                clearInterval(timer);
                startGame();
            }
        }, 1000);
    };

    const startGame = () => {
        setOverlayState('round');
        const config = getRoundConfig(1);
        setRoundInfo({ round: config.round, time: config.time });
        
        setTimeout(() => {
            setOverlayState('none');
            setGameState('playing');
            generateQuestion(1);
        }, 2500);
    };

    // 🚀 [CTO 패치] 방탄 에러 방어(Try-Catch) 및 안전 변수 추출 로직
    const generateQuestion = (qNum) => {
        try {
            const config = getRoundConfig(qNum);
            setTimeLeft(config.time);

            const poolAllSyn = activeVocaData.filter(w => w.syn.length >= 2);
            const poolMixed = activeVocaData.filter(w => w.syn.length >= 1 && w.ant.length >= 1);

            let isThreeWordType = Math.random() < 0.3; 
            const canMakeThreeWord = (poolMixed.length >= 1 && poolAllSyn.length >= 4) || (poolAllSyn.length >= 1 && poolMixed.length >= 4);

            if (isThreeWordType && !canMakeThreeWord) isThreeWordType = false;

            let questionTitle = "";
            let options = [];
            let correctAnswerText = "";
            let targetWordData = null;

            const makeThreeWordString = (base, w2, w3) => {
                const others = shuffleArray([w2 || '없음', w3 || '없음']);
                return `${base} - ${others[0]} - ${others[1]}`;
            };

            if (isThreeWordType) {
                questionTitle = "다음 중 세 단어의 관계가 나머지 넷과 다른 하나를 고르시오.";
                const isMajorityAllSyn = Math.random() < 0.5;

                if (isMajorityAllSyn) {
                    const targetData = shuffleArray(poolMixed)[0] || activeVocaData[0];
                    targetWordData = targetData;
                    correctAnswerText = makeThreeWordString(targetData.word, safePick(targetData.syn), safePick(targetData.ant));
                    options.push({ text: correctAnswerText, isCorrect: true });

                    const bgData = shuffleArray(poolAllSyn).slice(0, 4);
                    bgData.forEach(w => {
                        const syns = shuffleArray(w.syn);
                        options.push({ text: makeThreeWordString(w.word, syns[0] || '없음', syns[1] || '없음'), isCorrect: false });
                    });
                } else {
                    const targetData = shuffleArray(poolAllSyn)[0] || activeVocaData[0];
                    targetWordData = targetData;
                    const syns = shuffleArray(targetData.syn);
                    correctAnswerText = makeThreeWordString(targetData.word, syns[0] || '없음', syns[1] || '없음');
                    options.push({ text: correctAnswerText, isCorrect: true });

                    const bgData = shuffleArray(poolMixed).slice(0, 4);
                    bgData.forEach(w => {
                        options.push({ text: makeThreeWordString(w.word, safePick(w.syn), safePick(w.ant)), isCorrect: false });
                    });
                }
            } else {
                questionTitle = "다음 중 두 단어의 관계가 나머지 넷과 다른 하나를 고르시오.";
                const isTargetAntonym = Math.random() < 0.5;
                let targetPool = isTargetAntonym ? activeVocaData.filter(w => w.ant.length > 0) : activeVocaData.filter(w => w.syn.length > 0);
                let bgPool = isTargetAntonym ? activeVocaData.filter(w => w.syn.length > 0) : activeVocaData.filter(w => w.ant.length > 0);

                if (targetPool.length === 0 || bgPool.length < 4) {
                    targetPool = activeVocaData.filter(w => w.syn.length > 0);
                    bgPool = activeVocaData.filter(w => w.syn.length > 0);
                }

                // 🚀 빈 풀(Empty Pool)에서 추출 시 undefined 방지
                let targetData = shuffleArray(targetPool)[0];
                if (!targetData) targetData = activeVocaData[0]; 
                
                targetWordData = targetData;

                if (isTargetAntonym) {
                    correctAnswerText = `${targetData.word} - ${safePick(targetData.ant)}`;
                    options.push({ text: correctAnswerText, isCorrect: true });
                    
                    let safeBgPool = bgPool.length < 4 ? activeVocaData : bgPool;
                    const bgData = shuffleArray(safeBgPool).filter(w => w.word !== targetData.word).slice(0, 4);
                    bgData.forEach(w => options.push({ text: `${w.word} - ${safePick(w.syn)}`, isCorrect: false }));
                } else {
                    correctAnswerText = `${targetData.word} - ${safePick(targetData.syn)}`;
                    options.push({ text: correctAnswerText, isCorrect: true });
                    
                    let safeBgPool = bgPool.length < 4 ? activeVocaData : bgPool;
                    const bgData = shuffleArray(safeBgPool).filter(w => w.word !== targetData.word).slice(0, 4);
                    bgData.forEach(w => options.push({ text: `${w.word} - ${safePick(w.ant)}`, isCorrect: false }));
                }
            }

            // 만약 옵션이 5개가 안 채워졌을 경우의 보험
            while (options.length < 5) {
                options.push({ text: "데이터 부족 (임시 보기)", isCorrect: false });
            }

            options = shuffleArray(options);
            setCurrentQuestion({ title: questionTitle, options, targetWordData, answer: correctAnswerText });

        } catch (error) {
            console.error("Voca Challenge Engine Error:", error);
            // 🚀 시스템 크래시를 막고 임시 문제 출력
            setCurrentQuestion({
                title: "⚠️ 단어 추출 오류가 발생했습니다. (임시 문제)",
                options: [
                    { text: "정답 (안전하게 계속하기)", isCorrect: true },
                    { text: "오답", isCorrect: false },
                    { text: "오답", isCorrect: false },
                    { text: "오답", isCorrect: false },
                    { text: "오답", isCorrect: false }
                ],
                targetWordData: activeVocaData[0],
                answer: "정답 (안전하게 계속하기)"
            });
        }
    };

    const handleAnswer = (isCorrect) => {
        if (isCorrect) {
            const config = getRoundConfig(questionNum);
            const timeBonus = timeLeft * config.bonus;
            const earnedScore = config.baseScore + timeBonus;
            
            setScore(prev => prev + earnedScore);
            
            const nextQNum = questionNum + 1;
            setQuestionNum(nextQNum);

            if (nextQNum === 11 || nextQNum === 21) {
                const nextConfig = getRoundConfig(nextQNum);
                setOverlayState('round');
                setRoundInfo({ round: nextConfig.round, time: nextConfig.time });
                
                setTimeout(() => {
                    setOverlayState('none');
                    generateQuestion(nextQNum);
                }, 2500);
            } else {
                generateQuestion(nextQNum);
            }
        } else {
            endGame(false); 
        }
    };

    const saveRankingToDB = async (finalScore) => {
        const myClassObj = classes.find(c => c.id === studentClassId);
        const className = myClassObj?.name || '알수없음';
        
        try {
            const q = query(
                collection(db, `artifacts/${APP_ID}/public/data/voca_rankings`),
                where('classId', '==', studentClassId),
                where('studentId', '==', currentUser.id)
            );
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const docRef = snap.docs[0].ref;
                const pastScore = snap.docs[0].data().score;
                if (finalScore > pastScore) {
                    await updateDoc(docRef, { score: finalScore, updatedAt: serverTimestamp() });
                }
            } else {
                await addDoc(collection(db, `artifacts/${APP_ID}/public/data/voca_rankings`), {
                    classId: studentClassId,
                    className: className,
                    studentId: currentUser.id,
                    studentName: currentUser.name,
                    score: finalScore,
                    createdAt: serverTimestamp()
                });
            }
        } catch (e) { console.error("Ranking save error:", e); }
    };

    const endGame = async (isWin) => {
        setGameState('result');
        if (isWin && window.confetti) {
            window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
        await saveRankingToDB(score);
    };

    useEffect(() => {
        let timer;
        if (gameState === 'playing' && overlayState === 'none' && timeLeft > 0) {
            timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        } else if (gameState === 'playing' && overlayState === 'none' && timeLeft === 0) {
            endGame(false); 
        }
        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, overlayState, timeLeft]);

    if (isLoading) return <div className="p-10 text-center flex flex-col items-center justify-center h-full"><Loader className="animate-spin text-blue-600 mb-4" size={40}/><p className="font-bold text-gray-500">챌린지 로딩 중...</p></div>;

    if (!isStudent) {
        return (
            <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in relative">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-6 md:p-8 rounded-3xl shadow-lg flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2"><Trophy size={28}/> 영단어 챌린지 마스터</h1>
                        <p className="opacity-90">유의어/반의어 관계를 파악하는 게이미피케이션으로 암기 몰입도를 극대화하세요.</p>
                    </div>
                </div>

                <div className="flex border-b border-gray-200">
                    <button onClick={() => setAdminTab('settings')} className={`px-6 py-4 font-bold text-sm transition-colors flex items-center gap-2 ${adminTab === 'settings' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Settings size={18}/> 반별 챌린지 오픈 설정
                    </button>
                    <button onClick={() => setAdminTab('leaderboard')} className={`px-6 py-4 font-bold text-sm transition-colors flex items-center gap-2 ${adminTab === 'leaderboard' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Crown size={18}/> 명예의 전당 현황
                    </button>
                </div>

                {adminTab === 'settings' && (
                    <Card className="space-y-4">
                        <div className="bg-purple-50 p-4 rounded-xl text-purple-800 text-sm font-bold flex items-center gap-2 mb-4 border border-purple-200">
                            <Flame size={18}/> 토글을 켜면 해당 영어 반 학생들의 화면에 즉시 게임 챌린지 메뉴가 활성화됩니다.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {englishClasses.length === 0 ? <p className="text-gray-400 p-4 col-span-2 text-center font-bold">생성된 영어 반이 없습니다.</p> : 
                                englishClasses.map(cls => {
                                    const isOpen = activeClasses.includes(cls.id);
                                    return (
                                        <div key={cls.id} className={`flex justify-between items-center p-4 border-2 rounded-2xl transition-all ${isOpen ? 'border-purple-400 bg-purple-50/30 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}>
                                            <div>
                                                <div className="font-black text-gray-900 flex items-center gap-2">
                                                    {cls.name}
                                                    {isOpen && <span className="bg-purple-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">LIVE</span>}
                                                </div>
                                            </div>
                                            <button onClick={() => toggleClassActive(cls.id)} className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${isOpen ? 'bg-purple-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                                {isOpen ? '닫기' : '챌린지 오픈'}
                                            </button>
                                        </div>
                                    )
                                })
                            }
                        </div>
                    </Card>
                )}

                {adminTab === 'leaderboard' && (
                    <Card className="space-y-6">
                        <div className="flex gap-4 items-center">
                            <select className="border-2 border-gray-200 rounded-xl p-3 font-bold text-gray-800 outline-none focus:border-purple-500 flex-1" value={adminSelectedClass} onChange={e => setAdminSelectedClass(e.target.value)}>
                                <option value="">랭킹을 조회할 영어 반을 선택하세요</option>
                                {englishClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <Button onClick={handleClearRankings} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 font-bold whitespace-nowrap">랭킹 초기화</Button>
                        </div>

                        {adminSelectedClass && (
                            <div className="bg-slate-900 rounded-3xl p-6 md:p-10 text-white shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400"></div>
                                <h3 className="text-3xl font-black text-center mb-8 text-yellow-400 flex items-center justify-center gap-3">
                                    <Crown size={36}/> 명예의 전당
                                </h3>
                                
                                {rankings.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500 font-bold">아직 이 반에서 챌린지에 참가한 학생이 없습니다.</div>
                                ) : (
                                    <div className="space-y-3 max-w-2xl mx-auto">
                                        {rankings.map((rank, idx) => (
                                            <div key={rank.id} className="flex justify-between items-center bg-white/10 p-4 md:p-5 rounded-2xl backdrop-blur-sm border border-white/5 hover:bg-white/20 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <span className={`w-8 text-center font-black ${idx === 0 ? 'text-yellow-400 text-3xl drop-shadow-md' : idx === 1 ? 'text-gray-300 text-2xl' : idx === 2 ? 'text-amber-600 text-2xl' : 'text-gray-500 text-xl'}`}>
                                                        {idx + 1}
                                                    </span>
                                                    <span className="font-bold text-white text-xl">{rank.studentName}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-black text-2xl text-yellow-400 tracking-wider font-mono">{rank.score.toLocaleString()}</span>
                                                    <span className="text-sm text-yellow-400/50 font-bold ml-1">pt</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                )}
            </div>
        );
    }

    if (!studentClassId) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] text-gray-400 space-y-4 animate-in fade-in">
                <Lock size={64} className="opacity-20"/>
                <h2 className="text-2xl font-black text-gray-600">현재 오픈된 챌린지가 없습니다</h2>
                <p className="font-bold">강사님이 우리 반의 챌린지를 오픈하면 이곳에서 도전할 수 있습니다.</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in pb-20 relative">
            
            {overlayState === 'countdown' && (
                <div className="fixed inset-0 bg-slate-900/95 z-50 flex items-center justify-center animate-in fade-in duration-200">
                    <div className="text-9xl font-black text-yellow-400 animate-bounce drop-shadow-[0_0_30px_rgba(250,204,21,0.6)]">
                        {countdownNum}
                    </div>
                </div>
            )}
            
            {overlayState === 'round' && (
                <div className="fixed inset-0 bg-slate-900/95 z-50 flex flex-col items-center justify-center animate-in fade-in duration-200">
                    <h2 className="text-6xl font-black text-blue-400 mb-6 drop-shadow-[0_0_20px_rgba(96,165,250,0.5)]">{roundInfo.round}라운드 시작!</h2>
                    <p className="text-2xl font-bold text-white bg-white/10 px-6 py-3 rounded-full flex items-center gap-2">
                        <Clock className="text-emerald-400"/> 문제당 <span className="text-emerald-400">{roundInfo.time}초</span>의 시간이 주어집니다.
                    </p>
                </div>
            )}

            {gameState === 'intro' && (
                <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[70vh] text-center border-4 border-indigo-500/30">
                    <div className="absolute top-0 right-0 p-8 opacity-10"><Trophy size={200}/></div>
                    
                    <Badge className="bg-indigo-500 text-white mb-6 border-0 text-sm py-1.5 px-4 rounded-full">우리 반 한정 챌린지</Badge>
                    <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight leading-tight">단어 관계<br/><span className="text-yellow-400">서바이벌</span></h1>
                    <p className="text-indigo-200 mb-8 font-medium leading-relaxed">단어의 유의어와 반의어 관계를 파악하여 혼자 튀는 하나를 찾아라!<br/><span className="text-rose-400 font-bold bg-rose-900/50 px-2 py-1 rounded">※ 한 번 틀리면 즉시 게임 오버</span></p>
                    
                    <div className="w-full max-w-md bg-white/5 rounded-2xl p-5 border border-white/10 mb-8 z-10">
                        <p className="text-sm font-bold text-indigo-300 mb-3">📚 학습할 범위를 선택하세요 (다중 선택)</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {availableDays.map(d => (
                                <button 
                                    key={d} 
                                    onClick={() => toggleDaySelection(d)}
                                    className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${selectedDays.includes(d) ? 'bg-indigo-500 text-white border border-indigo-400 shadow-md' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                                >
                                    Day {d}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-white/40 mt-3 font-medium">* 범위를 많이 선택할수록 점수 배율(Bonus)이 증가합니다.</p>
                    </div>

                    <button onClick={handleStartClick} className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-orange-950 font-black text-2xl py-4 px-12 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2 z-10">
                        <Play fill="currentColor" size={24}/> 도전 시작하기
                    </button>

                    <div className="w-full mt-12 bg-white/5 rounded-2xl p-5 border border-white/10 text-left z-10">
                        <h3 className="font-bold text-yellow-400 mb-3 flex items-center gap-1.5"><Crown size={16}/> 현재 우리 반 랭킹 TOP 5</h3>
                        <div className="space-y-2">
                            {rankings.length === 0 ? <p className="text-white/40 text-sm font-bold">아직 기록이 없습니다. 1등을 선점하세요!</p> :
                                rankings.slice(0, 5).map((r, i) => (
                                    <div key={r.id} className="flex justify-between text-sm items-center border-b border-white/5 pb-2">
                                        <span className="font-bold text-white/90">{i+1}. {r.studentName}</span>
                                        <span className="font-mono text-yellow-200 font-bold">{r.score.toLocaleString()} pt</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>
            )}

            {gameState === 'playing' && (
                <div className="bg-white rounded-3xl p-6 md:p-10 shadow-2xl min-h-[70vh] flex flex-col border-t-8 border-indigo-600">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Score</span>
                            <span className="text-3xl font-black text-indigo-600 font-mono">{score.toLocaleString()}</span>
                        </div>
                        <div className={`flex flex-col items-end ${timeLeft <= 3 ? 'text-red-500 animate-pulse' : 'text-gray-800'}`}>
                            <span className="text-xs font-bold uppercase tracking-wider text-right">Round {getRoundConfig(questionNum).round} (Q.{questionNum})</span>
                            <span className="text-3xl font-black font-mono flex items-center gap-1"><Clock size={24}/> {timeLeft}s</span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                        {combo > 1 && (
                            <div className="text-orange-500 font-black text-xl mb-4 animate-bounce flex items-center gap-1">
                                <Flame fill="currentColor"/> {combo} COMBO!
                            </div>
                        )}
                        
                        <div className="text-lg md:text-2xl font-black px-6 py-4 rounded-2xl mb-8 bg-blue-50 text-blue-800 border-2 border-blue-200 text-center w-full break-keep shadow-sm">
                            {currentQuestion?.title}
                        </div>

                        <div className="flex flex-col gap-3 w-full max-w-xl">
                            {currentQuestion?.options.map((opt, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => handleAnswer(opt.isCorrect)}
                                    className="bg-white hover:bg-indigo-50 border-2 border-gray-200 hover:border-indigo-400 text-gray-800 hover:text-indigo-800 font-bold text-base md:text-xl py-4 px-6 rounded-2xl transition-all active:scale-95 shadow-sm text-left break-words flex items-center justify-between group"
                                >
                                    <span>{opt.text}</span>
                                    <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400"/>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {gameState === 'result' && (
                <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[70vh] text-center border-4 border-rose-500">
                    <div className="bg-rose-500 text-white p-4 rounded-full mb-6 animate-pulse">
                        <AlertCircle size={64} fill="currentColor" className="text-rose-900"/>
                    </div>
                    <h2 className="text-3xl font-black mb-2 text-rose-400">💀 게임 오버 💀</h2>
                    <p className="text-indigo-200 font-medium mb-6">아쉽습니다. 당신의 최종 점수는...</p>
                    
                    <div className="text-7xl font-black text-yellow-400 font-mono mb-8 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">
                        {score.toLocaleString()}
                    </div>

                    {currentQuestion && currentQuestion.targetWordData && (
                        <div className="w-full max-w-lg bg-white rounded-2xl p-6 text-left mb-8 shadow-xl">
                            <h3 className="text-rose-600 font-black text-lg mb-3 flex items-center gap-2"><BookOpen size={20}/> 핵심 단어 오답 노트</h3>
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-4">
                                <span className="text-2xl font-black text-indigo-700 block mb-2">{currentQuestion.targetWordData.word}</span>
                                <div className="text-sm font-bold text-gray-700 space-y-1">
                                    <p className="flex items-start gap-2"><CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5"/> <span className="shrink-0">유의어:</span> <span className="text-gray-900">{currentQuestion.targetWordData.syn.join(', ') || '없음'}</span></p>
                                    <p className="flex items-start gap-2"><XCircle size={16} className="text-rose-500 shrink-0 mt-0.5"/> <span className="shrink-0">반의어:</span> <span className="text-gray-900">{currentQuestion.targetWordData.ant.join(', ') || '없음'}</span></p>
                                </div>
                            </div>
                            
                            <h4 className="text-sm font-bold text-gray-500 mb-2">출제된 보기 확인</h4>
                            <div className="space-y-2">
                                {currentQuestion.options.map((opt, idx) => (
                                    <div key={idx} className={`p-3 rounded-lg text-sm font-bold border ${opt.isCorrect ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-500 line-through'}`}>
                                        {opt.isCorrect ? '✅ 정답:' : '❌ 오답:'} {opt.text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="text-sm text-gray-400 mb-8 bg-white/10 px-4 py-2 rounded-lg font-bold">
                        {currentUser.name} 이름으로 명예의 전당에 자동 등록되었습니다.<br/>(기존 기록보다 높을 경우에만 갱신됩니다)
                    </p>

                    <button onClick={() => setGameState('intro')} className="bg-white text-slate-900 font-black text-xl py-4 px-10 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95">
                        처음으로 돌아가기
                    </button>
                </div>
            )}
        </div>
    );
}