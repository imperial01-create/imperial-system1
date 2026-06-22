/* [서비스 가치] 게이미피케이션(Gamification)을 통한 영단어 암기 몰입도 극대화 엔진 v4.0
   - (🚀 CTO 패치: 낙관적 UI(Optimistic UI) 업데이트를 적용하여 게임 종료 즉시 도파민(성취감)을 제공합니다.)
   - Firebase 최적화: 불필요한 Read 쿼리를 제거하고 메모리 캐싱을 통해 과금을 방어합니다. 
   - UX 개선: '나의 최고 기록' 패널을 추가하여 중하위권 학생들의 동기부여를 유도합니다. */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Trophy, Play, Lock, Crown, Settings, Flame, Loader, BookOpen, ChevronRight, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, addDoc, orderBy, limit, deleteDoc, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Card, Button, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// 🚀 원장님 제공 실제 CSV 데이터 (수정 금지)
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

// 🚀 [CTO 패치] 독립된 Iframe 게임 엔진 HTML (내부적으로 React와 통신)
const GET_GAME_HTML = () => `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>영단어 챌린지</title>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
  <style>
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Pretendard', sans-serif; }
    body { background-color: #0f172a; display: flex; flex-direction: column; height: 100vh; overflow: hidden; color: white; }
    
    .header { background-color: #4f46e5; color: white; padding: 15px; text-align: center; font-size: 20px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .status-bar { display: flex; justify-content: space-between; padding: 15px 20px; font-size: 18px; font-weight: 900; background: white; color: #1f2937; border-bottom: 2px solid #e5e7eb; }
    .score-highlight { color: #4f46e5; }
    .timer-container { width: 100%; height: 10px; background-color: #e5e7eb; }
    .timer-bar { height: 100%; background-color: #10b981; transition: width 1s linear, background-color 0.3s; }
    .timer-warning { background-color: #ef4444 !important; }
    
    .game-area { flex: 1; padding: 20px; display: flex; flex-direction: column; justify-content: center; overflow-y: auto; background-color: #f0f2f5;}
    .question-box { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; margin-bottom: 20px; }
    .question-title { font-size: 18px; color: #374151; margin-bottom: 10px; font-weight: bold; }
    .question-type { font-size: 22px; font-weight: 900; color: #4f46e5; word-break: keep-all; }
    
    .options { display: flex; flex-direction: column; gap: 10px; }
    .option-btn { background: white; border: 2px solid #e5e7eb; padding: 18px; border-radius: 12px; font-size: 18px; font-weight: bold; color: #1f2937; cursor: pointer; text-align: left; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);}
    .option-btn:active { background: #e0e7ff; border-color: #4f46e5; transform: scale(0.98); }
    
    .screen { display: none; flex: 1; flex-direction: column; justify-content: flex-start; align-items: center; padding: 30px 20px; text-align: center; overflow-y: auto; }
    .active { display: flex; }
    
    .start-container { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 20px; width: 100%; max-width: 600px; margin: auto; }
    
    .day-selection-title { font-size: 16px; font-weight: bold; color: #9ca3af; margin-bottom: 15px; }
    .day-selection { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 30px; width: 100%; }
    .day-btn { padding: 10px 18px; border: 2px solid #374151; border-radius: 20px; cursor: pointer; font-weight: bold; font-size: 15px; color: #9ca3af; background: transparent; transition: all 0.2s; }
    .day-btn.selected { border-color: #6366f1; background: #6366f1; color: white; box-shadow: 0 4px 10px rgba(99,102,241,0.3); }
    .day-btn:active { transform: scale(0.95); }
    
    .result-title { font-size: 40px; font-weight: 900; margin-bottom: 10px; color: #f87171; text-shadow: 0 2px 10px rgba(248,113,113,0.3); }
    .result-score { font-size: 64px; color: #facc15; font-weight: 900; margin-bottom: 15px; font-family: monospace; drop-shadow: 0 0 10px rgba(250,204,21,0.5);}
    .result-msg { font-size: 18px; color: #9ca3af; margin-bottom: 30px; line-height: 1.5; }
    
    .explanation-box { display: none; background: white; border: 2px solid #fecaca; padding: 20px; border-radius: 16px; margin-bottom: 30px; text-align: left; width: 100%; max-width: 500px; color: #1f2937; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .exp-label { font-size: 16px; font-weight: 900; color: #e11d48; margin-bottom: 10px; margin-top: 15px; display: flex; align-items: center; gap: 5px; }
    .exp-label:first-child { margin-top: 0; }
    .exp-detail { font-size: 16px; color: #4b5563; line-height: 1.5; word-break: keep-all; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .exp-word { font-weight: 900; color: #4f46e5; font-size: 22px; display: block; margin-bottom: 8px;}
    .exp-options { display: flex; flex-direction: column; gap: 8px; }
    .exp-opt-item { padding: 12px; border-radius: 10px; font-size: 15px; font-weight: bold; line-height: 1.3; }
    .exp-opt-correct { border: 2px solid #10b981; color: #065f46; background: #d1fae5; }
    .exp-opt-wrong { border: 1px solid #e5e7eb; color: #9ca3af; text-decoration: line-through; background: #f9fafb; }
    
    .btn-group { display: flex; flex-direction: column; gap: 15px; width: 100%; max-width: 400px; }
    .action-btn { padding: 18px 20px; font-size: 20px; font-weight: 900; border-radius: 16px; cursor: pointer; border: none; transition: all 0.2s; display: flex; justify-content: center; align-items: center; gap: 10px;}
    .action-btn:active { transform: scale(0.96); }
    
    .btn-primary { background: linear-gradient(to right, #fbbf24, #f97316); color: #431407; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4); }
    .btn-secondary { background: white; color: #1f2937; border: 2px solid #e5e7eb; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    
    .overlay { display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.95); flex-direction: column; justify-content: center; align-items: center; z-index: 9999; }
    .overlay.active { display: flex; }
    .countdown-text { font-size: 150px; font-weight: 900; color: #facc15; animation: pop 1s infinite; text-shadow: 0 0 30px rgba(250,204,21,0.5);}
    .feedback-title { font-size: 50px; font-weight: 900; margin-bottom: 15px; text-shadow: 2px 2px 10px rgba(0,0,0,0.5); text-align: center; word-break: keep-all; line-height: 1.2; color: #60a5fa;}
    .feedback-time { font-size: 24px; color: white; margin-bottom: 5px; font-weight: bold; text-align: center; background: rgba(255,255,255,0.1); padding: 10px 20px; border-radius: 30px;}
    
    @keyframes pop { 0% { transform: scale(0.8); opacity: 0.5; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
  </style>
</head>
<body>

  <!-- 인트로 화면 -->
  <div id="startScreen" class="screen active" style="justify-content: center;">
    <div class="start-container">
      <span style="background: #6366f1; color: white; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; margin-bottom: 10px;">우리 반 한정 챌린지</span>
      <h1 style="font-size: 50px; font-weight: 900; margin-bottom: 10px; word-break: keep-all; line-height: 1.1;">영단어<br><span style="color: #facc15;">챌린지</span></h1>
      <p style="margin-bottom: 30px; color: #9ca3af; font-weight: bold; font-size: 16px; line-height: 1.5;">
        단어의 유의어와 반의어 관계를 파악하여<br>혼자 튀는 하나를 찾아라!<br>
        <span style="color: #fca5a5; display: block; margin-top: 5px;">※ 한 번 틀리면 즉시 게임 오버 (서든데스)</span>
      </p>
      
      <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 20px; width: 100%; border: 1px solid rgba(255,255,255,0.1);">
          <div class="day-selection-title">📚 학습할 범위를 선택하세요 (다중 선택)</div>
          <div id="daySelectionContainer" class="day-selection"></div>
          <p style="font-size: 12px; color: #6b7280; margin-top: -15px;">* 범위를 많이 선택할수록 점수 배율이 기하급수적으로 증가합니다.</p>
      </div>
      
      <button id="mainStartBtn" class="action-btn btn-primary" style="width: 100%; margin-top: 10px;">▶ 도전 시작하기</button>
      <button onclick="exitGame()" class="action-btn btn-secondary" style="width: 100%; font-size: 16px; padding: 12px;">✖ 나가기</button>
    </div>
  </div>

  <!-- 게임 플레이 화면 -->
  <div id="gameScreen" style="display: none; height: 100%; flex-direction: column;">
    <div class="header" id="roundText">Round 1 - Q.1</div>
    <div class="status-bar">
      <div id="scoreText" class="score-highlight">0 pt</div>
      <div id="timeText" style="color: #10b981;">15s</div>
    </div>
    <div class="timer-container">
      <div id="timerBar" class="timer-bar" style="width: 100%;"></div>
    </div>
    <div class="game-area">
      <div class="question-box">
        <div class="question-title" id="qTitle">다음 중 두 단어의 관계가</div>
        <div class="question-type">나머지 넷과 다른 하나를 고르시오.</div>
      </div>
      <div class="options" id="optionsContainer"></div>
    </div>
  </div>

  <!-- 결과 화면 -->
  <div id="resultScreen" class="screen" style="justify-content: center;">
    <div class="result-title" id="resultTitle">💀 게임 오버 💀</div>
    <div class="result-msg" id="resultMsg">당신의 최종 점수는...</div>
    <div class="result-score" id="finalScore">0</div>
    
    <div style="color: #10b981; font-weight: bold; font-size: 14px; margin-bottom: 25px; background: rgba(16, 185, 129, 0.1); padding: 10px 20px; border-radius: 20px;">
        🚀 최고 기록 경신 시 자동으로 명예의 전당에 반영됩니다.
    </div>

    <!-- 오답 노트 -->
    <div id="explanationBox" class="explanation-box">
      <div class="exp-label">💡 핵심 단어 오답 노트</div>
      <div id="expDetail" class="exp-detail" style="margin-bottom: 15px;"></div>
      <div class="exp-label">📝 출제된 보기 확인</div>
      <div id="expOptions" class="exp-options"></div>
    </div>

    <!-- 액션 버튼 -->
    <div class="btn-group">
      <button onclick="retryGame()" class="action-btn btn-primary">🔥 챌린지 한 번 더!</button>
      <button onclick="exitGame()" class="action-btn btn-secondary">🏆 명예의 전당 보러가기 (나가기)</button>
    </div>
  </div>

  <div id="countdownOverlay" class="overlay">
    <div id="countdownNumber" class="countdown-text">3</div>
  </div>

  <div id="roundTransitionOverlay" class="overlay">
    <div id="roundTransitionTitle" class="feedback-title">1라운드 시작!</div>
    <div id="roundTransitionDesc" class="feedback-time">문제당 15초의 시간이 주어집니다.</div>
  </div>

  <div id="feedbackOverlay" class="overlay">
    <div id="feedbackTitle" class="feedback-title">정답!</div>
    <div id="feedbackTime" class="feedback-time" style="display: none;"></div>
    <div id="feedbackScore" class="feedback-score"></div>
    <div id="feedbackBonus" class="feedback-bonus" style="display: none;"></div>
  </div>

  <script>
    const rawCsvString = \`${RAW_CSV_DATA}\`;

    function processRawCSV(csvText) {
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
        } else if ((char === '\\n' || char === '\\r') && !insideQuotes) {
          if (char === '\\r') continue;
          currentRow.push(currentCell.trim());
          if (currentRow.length > 1 || currentRow[0] !== '') rows.push(currentRow);
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
        if (row.length < 5) continue;
        const word_id = row[0];
        const word = row[1];
        const syn = row[3];
        const ant = row[4];
        if (!word) continue;
        
        let dayMatch = word_id.match(/_D(\\d+)_/);
        let day = dayMatch ? parseInt(dayMatch[1], 10) : 1;
        if (!wordMap[word]) wordMap[word] = { word: word, synSet: new Set(), antSet: new Set(), day: day };
        
        if (syn) syn.split(',').forEach(s => { if(s.trim()) wordMap[word].synSet.add(s.trim()); });
        if (ant) ant.split(',').forEach(a => { if(a.trim()) wordMap[word].antSet.add(a.trim()); });
      }

      return Object.values(wordMap).map(item => {
        return {
          word: item.word,
          syn: item.synSet.size > 0 ? Array.from(item.synSet).join(', ') : null,
          ant: item.antSet.size > 0 ? Array.from(item.antSet).join(', ') : null,
          day: item.day
        };
      });
    }

    const rawVocaData = processRawCSV(rawCsvString);
    let currentVocaData = [];
    let selectedDays = [];
    let currentTotalQuestion = 1;
    let score = 0;
    let timeLeft = 0;
    let timerInterval;
    let maxTime = 15;
    let isTransitioning = false;
    let currentCorrectAnswerText = "";
    let currentTargetWordData = null;
    let currentOptions = [];

    document.addEventListener("DOMContentLoaded", function() {
      initDaySelection();
      document.getElementById("mainStartBtn").addEventListener("click", checkAndStart);
    });

    function initDaySelection() {
      const days = [...new Set(rawVocaData.map(v => v.day))].sort((a,b)=>a-b);
      const container = document.getElementById('daySelectionContainer');
      container.innerHTML = '';
      if(days.length === 0) return;
      days.forEach(d => {
        const btn = document.createElement('div');
        btn.className = 'day-btn selected';
        btn.innerText = 'Day ' + d;
        btn.dataset.day = d;
        btn.onclick = () => btn.classList.toggle('selected');
        container.appendChild(btn);
      });
    }

    function checkAndStart() {
      const selectedDayEls = document.querySelectorAll('.day-btn.selected');
      if(selectedDayEls.length === 0) {
        alert("학습할 Day를 최소 1개 이상 선택해주세요!");
        return;
      }
      selectedDays = Array.from(selectedDayEls).map(el => parseInt(el.dataset.day));
      currentVocaData = rawVocaData.filter(w => selectedDays.includes(w.day));
      if(currentVocaData.length < 5) {
        alert("선택된 Day의 단어가 너무 적습니다. 범위를 더 넓혀주세요.");
        return;
      }
      startPreparation();
    }

    function shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
      return array;
    }

    function pickOneRandomWord(wordString) {
      if (!wordString) return '없음';
      const wordsArray = wordString.split(',').map(w => w.trim());
      return wordsArray[Math.floor(Math.random() * wordsArray.length)];
    }

    function makeThreeWordString(baseWord, word2, word3) {
      let others = [word2, word3];
      shuffle(others);
      return baseWord + ' - ' + others[0] + ' - ' + others[1];
    }

    function startPreparation() {
      document.getElementById('startScreen').classList.remove('active');
      document.getElementById('resultScreen').classList.remove('active');
      document.getElementById('gameScreen').style.display = 'flex';
      
      const overlay = document.getElementById('countdownOverlay');
      const numberText = document.getElementById('countdownNumber');
      overlay.classList.add('active');
      let count = 3;
      numberText.innerText = count;
      const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
          numberText.innerText = count;
        } else if (count === 0) {
          numberText.innerText = "Start!";
          numberText.style.color = "#10b981";
        } else {
          clearInterval(countInterval);
          overlay.classList.remove('active');
          numberText.style.color = "#facc15"; 
          startGame();
        }
      }, 1000);
    }

    function startGame() {
      currentTotalQuestion = 1;
      score = 0;
      isTransitioning = false;
      document.getElementById('explanationBox').style.display = 'none'; 
      showRoundTransition();
    }

    function getRoundConfig() {
      const multiplier = selectedDays.length;
      const basePoints = multiplier * 10;
      if (currentTotalQuestion <= 10) return { round: 1, qNum: currentTotalQuestion, time: 15, baseScore: basePoints, bonus: multiplier * 1, prob3: 0.2 };
      else if (currentTotalQuestion <= 20) return { round: 2, qNum: currentTotalQuestion - 10, time: 10, baseScore: basePoints * 2, bonus: multiplier * 2, prob3: 0.4 };
      else return { round: 3, qNum: currentTotalQuestion - 20, time: 5, baseScore: basePoints * 3, bonus: multiplier * 5, prob3: 0.6 };
    }

    function showRoundTransition() {
      const config = getRoundConfig();
      if (config.qNum === 1) {
        const overlay = document.getElementById('roundTransitionOverlay');
        document.getElementById('roundTransitionTitle').innerText = config.round + '라운드 시작!';
        document.getElementById('roundTransitionDesc').innerText = '제한시간: ' + config.time + '초';
        overlay.classList.add('active');
        setTimeout(() => {
          overlay.classList.remove('active');
          nextQuestion();
        }, 2000);
      } else {
        nextQuestion();
      }
    }

    function nextQuestion() {
      const config = getRoundConfig();
      maxTime = config.time;
      timeLeft = maxTime;
      document.getElementById('roundText').innerText = 'Round ' + config.round + ' - Q.' + config.qNum;
      document.getElementById('scoreText').innerText = score.toLocaleString() + ' pt';
      updateTimerUI();
      generateQuestion(config.prob3);
      startTimer();
    }

    function generateQuestion(threeWordProb) {
      const qTitle = document.getElementById('qTitle');
      let isThreeWordType = Math.random() < threeWordProb;
      let options = [];

      const poolAllSyn = currentVocaData.filter(w => w.syn && w.syn.includes(','));
      const poolMixed = currentVocaData.filter(w => w.syn && w.ant);

      const canMakeThreeWord = (poolMixed.length >= 1 && poolAllSyn.length >= 4) || (poolAllSyn.length >= 1 && poolMixed.length >= 4);
      if(isThreeWordType && !canMakeThreeWord) isThreeWordType = false;

      if (isThreeWordType) {
        qTitle.innerText = "다음 중 세 단어의 관계가";
        shuffle(poolAllSyn); shuffle(poolMixed);
        const isMajorityAllSyn = Math.random() < 0.5;

        if (isMajorityAllSyn) {
          const targetData = poolMixed[0];
          currentTargetWordData = targetData;
          currentCorrectAnswerText = makeThreeWordString(targetData.word, pickOneRandomWord(targetData.syn), pickOneRandomWord(targetData.ant));
          options.push({ text: currentCorrectAnswerText, isCorrect: true });

          const backgroundData = poolAllSyn.slice(0, 4);
          backgroundData.forEach(w => {
            const syns = w.syn.split(',').map(s => s.trim());
            shuffle(syns);
            options.push({ text: makeThreeWordString(w.word, syns[0], syns[1]), isCorrect: false });
          });
        } else {
          const targetData = poolAllSyn[0];
          currentTargetWordData = targetData;
          const targetSyns = targetData.syn.split(',').map(s => s.trim());
          shuffle(targetSyns);
          currentCorrectAnswerText = makeThreeWordString(targetData.word, targetSyns[0], targetSyns[1]);
          options.push({ text: currentCorrectAnswerText, isCorrect: true });

          const backgroundData = poolMixed.slice(0, 4);
          backgroundData.forEach(w => {
            options.push({ text: makeThreeWordString(w.word, pickOneRandomWord(w.syn), pickOneRandomWord(w.ant)), isCorrect: false });
          });
        }
      } else {
        qTitle.innerText = "다음 중 두 단어의 관계가";
        const isTargetAntonym = Math.random() < 0.5; 
        let targetWordList = []; let backgroundWordList = [];
        if (isTargetAntonym) {
          targetWordList = currentVocaData.filter(w => w.ant);
          backgroundWordList = currentVocaData.filter(w => w.syn);
        } else {
          targetWordList = currentVocaData.filter(w => w.syn);
          backgroundWordList = currentVocaData.filter(w => w.ant);
        }
        if(targetWordList.length === 0 || backgroundWordList.length < 4) {
             targetWordList = currentVocaData.filter(w => w.syn);
             backgroundWordList = currentVocaData.filter(w => w.syn);
             shuffle(targetWordList); shuffle(backgroundWordList);
             const fallbackTarget = targetWordList[0] || currentVocaData[0];
             currentTargetWordData = fallbackTarget;
             currentCorrectAnswerText = fallbackTarget.word + ' - ' + pickOneRandomWord(fallbackTarget.syn);
             options.push({ text: currentCorrectAnswerText, isCorrect: true });
             const bgData = backgroundWordList.filter(w => w.word !== fallbackTarget.word).slice(0, 4);
             bgData.forEach(w => options.push({ text: w.word + ' - ' + pickOneRandomWord(w.syn), isCorrect: false }));
        } else {
            shuffle(targetWordList); shuffle(backgroundWordList);
            const targetData = targetWordList[0];
            currentTargetWordData = targetData;
            const backgroundData = backgroundWordList.filter(w => w.word !== targetData.word).slice(0, 4);
            if (isTargetAntonym) {
              currentCorrectAnswerText = targetData.word + ' - ' + pickOneRandomWord(targetData.ant);
              options.push({ text: currentCorrectAnswerText, isCorrect: true });
              backgroundData.forEach(w => options.push({ text: w.word + ' - ' + pickOneRandomWord(w.syn), isCorrect: false }));
            } else {
              currentCorrectAnswerText = targetData.word + ' - ' + pickOneRandomWord(targetData.syn);
              options.push({ text: currentCorrectAnswerText, isCorrect: true });
              backgroundData.forEach(w => options.push({ text: w.word + ' - ' + pickOneRandomWord(w.ant), isCorrect: false }));
            }
        }
      }

      shuffle(options);
      currentOptions = options; 
      const container = document.getElementById('optionsContainer');
      container.innerHTML = '';
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt.text;
        btn.onclick = () => handleAnswer(opt.isCorrect, false);
        container.appendChild(btn);
      });
    }

    function startTimer() {
      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerUI();
        if (timeLeft <= 0) {
          clearInterval(timerInterval);
          handleAnswer(false, true); 
        }
      }, 1000);
    }

    function updateTimerUI() {
      const timeText = document.getElementById('timeText');
      const timerBar = document.getElementById('timerBar');
      timeText.innerText = timeLeft + 's';
      const percentage = (timeLeft / maxTime) * 100;
      timerBar.style.width = percentage + '%';
      if (timeLeft <= 3) {
        timeText.style.color = '#ef4444';
        timerBar.classList.add('timer-warning');
      } else {
        timeText.style.color = '#10b981';
        timerBar.classList.remove('timer-warning');
      }
    }

    function handleAnswer(isCorrect, isTimeout) {
      if (isTransitioning) return;
      isTransitioning = true;
      clearInterval(timerInterval); 

      if (isCorrect) {
        const config = getRoundConfig();
        const bonusPoints = timeLeft * config.bonus;
        const earnedScore = config.baseScore + bonusPoints;
        score += earnedScore;
        document.getElementById('scoreText').innerText = score.toLocaleString() + ' pt';
        
        currentTotalQuestion++; 
        isTransitioning = false;
        showRoundTransition();
      } else {
        endGame(false);
      }
    }

    function endGame(isWin) {
      clearInterval(timerInterval);
      document.getElementById('gameScreen').style.display = 'none';
      const resultScreen = document.getElementById('resultScreen');
      resultScreen.classList.add('active');
      
      const title = document.getElementById('resultTitle');
      const msg = document.getElementById('resultMsg');
      const expBox = document.getElementById('explanationBox');
      
      document.getElementById('finalScore').innerText = score.toLocaleString();
      
      if (isWin) {
        title.innerText = "🎉 챌린지 클리어! 🎉";
        title.style.color = "#10b981";
        msg.innerHTML = "영일고의 자랑!<br>모든 단어를 완벽하게 숙지하셨군요!";
        expBox.style.display = "none"; 
        if (typeof confetti === "function") {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
      } else {
        const failedRound = getRoundConfig().round;
        title.innerText = "💀 게임 오버 💀";
        title.style.color = "#f87171";
        msg.innerHTML = '아쉽습니다. Round ' + failedRound + '에서 탈락했습니다.<br>아래 오답 노트를 확인하고 다시 도전하세요!';
        
        const synText = currentTargetWordData.syn ? currentTargetWordData.syn : "없음";
        const antText = currentTargetWordData.ant ? currentTargetWordData.ant : "없음";
        document.getElementById('expDetail').innerHTML = '<span class="exp-word">' + currentTargetWordData.word + '</span>✔️ 유의어: ' + synText + '<br>❌ 반의어: ' + antText;
        let optionsHtml = '';
        currentOptions.forEach(opt => {
          if(opt.isCorrect) optionsHtml += '<div class="exp-opt-item exp-opt-correct">✅ 정답: ' + opt.text + '</div>';
          else optionsHtml += '<div class="exp-opt-item exp-opt-wrong">❌ 오답: ' + opt.text + '</div>';
        });
        document.getElementById('expOptions').innerHTML = optionsHtml;
        expBox.style.display = "block";
      }

      // 🚀 백그라운드에서 React(부모) 창으로 점수 조용히 전송
      window.parent.postMessage({ type: 'VOCA_GAME_OVER', score: score }, '*');
    }

    function exitGame() {
      window.parent.postMessage({ type: 'CLOSE_GAME' }, '*');
    }

    function retryGame() {
      document.getElementById('resultScreen').classList.remove('active');
      document.getElementById('startScreen').classList.add('active');
    }
  </script>
</body>
</html>
`;

export default function VocaChallenge({ currentUser }) {
    const { classes = [], enrollments = [] } = useData() || {};
    const isStudent = currentUser.role === 'student';

    // 🚀 [CTO 패치] Role(역할) 기반 접근 제어 (RBAC) 및 과목 필터링 최적화
    const englishClasses = useMemo(() => {
        // 1. 1차 필터링: 영어 과목 반만 추출
        const baseEnglishClasses = classes.filter(c => c.subject === '영어' || (c.name && c.name.includes('영어')));
        
        // 2. 2차 필터링: 권한에 따른 노출 제어 (Zero Trust)
        if (['admin', 'admin_assistant'].includes(currentUser.role)) {
            // 관리자 및 행정조교: 모든 영어 반 관제 가능
            return baseEnglishClasses;
        } else if (['lecturer', 'ta'].includes(currentUser.role)) {
            // 강사 및 수업조교: 본인이 담당하는 반만 노출 (다양한 스키마 호환성 방어 로직 적용)
            return baseEnglishClasses.filter(c => 
                c.lecturerId === currentUser.id || 
                c.teacherId === currentUser.id || 
                (c.taIds && Array.isArray(c.taIds) && c.taIds.includes(currentUser.id)) ||
                c.teacher === currentUser.name // 기존 시스템 호환성(Fallback) 유지
            );
        }
        // 예외 상황 방어
        return [];
    }, [classes, currentUser]);

    const [activeClasses, setActiveClasses] = useState([]);
    const [adminTab, setAdminTab] = useState('settings'); 
    const [adminSelectedClass, setAdminSelectedClass] = useState('');
    
    const [rankings, setRankings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [studentClassId, setStudentClassId] = useState(null); 
    const [isGameActive, setIsGameActive] = useState(false);
    
    // 🚀 [CTO 패치] 나의 최고 기록 상태 추가 (낙관적 UI용)
    const [myRecordData, setMyRecordData] = useState({ score: 0, docId: null });

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

    // 🚀 [CTO 패치] 나의 최고 기록(1개 문서)만 가볍게 읽어옵니다 (비용 최적화)
    useEffect(() => {
        if (!isStudent || !studentClassId) return;
        const q = query(
            collection(db, `artifacts/${APP_ID}/public/data/voca_rankings`),
            where('classId', '==', studentClassId),
            where('studentId', '==', currentUser.id)
        );
        const unsub = onSnapshot(q, snap => {
            if (!snap.empty) {
                setMyRecordData({ score: snap.docs[0].data().score || 0, docId: snap.docs[0].id });
            } else {
                setMyRecordData({ score: 0, docId: null });
            }
        });
        return unsub;
    }, [isStudent, studentClassId, currentUser.id]);

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

    // 🚀 [CTO 패치] 낙관적 UI(Optimistic UI) 및 Read-Cost 0원 통신망 구축
    const studentClassIdRef = useRef(studentClassId);
    const currentUserRef = useRef(currentUser);
    const classesRef = useRef(classes);
    const myRecordDataRef = useRef(myRecordData); // Firebase 조회 비용 제거를 위한 로컬 캐시

    useEffect(() => { studentClassIdRef.current = studentClassId; }, [studentClassId]);
    useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
    useEffect(() => { classesRef.current = classes; }, [classes]);
    useEffect(() => { myRecordDataRef.current = myRecordData; }, [myRecordData]);

    useEffect(() => {
        const handleMessage = async (event) => {
            if (!event.data) return;

            if (event.data.type === 'CLOSE_GAME') {
                setIsGameActive(false);
                return;
            }

            if (event.data.type === 'VOCA_GAME_OVER') {
                const finalScore = Number(event.data.score) || 0;
                if (finalScore === 0) return; 

                try {
                    const sClassId = studentClassIdRef.current;
                    const cUser = currentUserRef.current;
                    const cList = classesRef.current;
                    const { score: currentBest, docId: myDocId } = myRecordDataRef.current;
                    
                    if (!sClassId || !cUser || !cUser.id) return; 

                    const myClassObj = cList.find(c => c.id === sClassId);
                    
                    // 🚀 Firebase Read 쿼리($)를 제거하고, 메모리에 캐싱된 내 기록과 즉시 비교합니다.
                    if (finalScore > currentBest) {
                        // 1. 낙관적 UI 업데이트 (학생에게 0.001초 만에 피드백 제공)
                        setMyRecordData({ score: finalScore, docId: myDocId }); 
                        
                        // 2. 백그라운드 DB 덮어쓰기 (Write 연산만 수행)
                        if (myDocId) {
                            await updateDoc(doc(db, `artifacts/${APP_ID}/public/data/voca_rankings`, myDocId), { 
                                score: finalScore, 
                                updatedAt: serverTimestamp() 
                            });
                        } else {
                            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/voca_rankings`), {
                                classId: sClassId,
                                className: myClassObj?.name || '알수없음',
                                studentId: cUser.id,
                                studentName: cUser.name,
                                score: finalScore,
                                createdAt: serverTimestamp()
                            });
                        }
                    }
                } catch (e) {
                    console.error("Optimistic score sync error:", e);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []); 


    if (isLoading) return <div className="p-10 text-center flex flex-col items-center justify-center h-full"><Loader className="animate-spin text-indigo-600 mb-4" size={40}/><p className="font-bold text-gray-500">챌린지 로딩 중...</p></div>;

    if (isGameActive) {
        return (
            <div className="fixed inset-0 z-[9999] bg-slate-900 animate-in fade-in duration-300">
                <iframe 
                    title="Voca Game Engine"
                    srcDoc={GET_GAME_HTML()} 
                    className="w-full h-full border-0"
                />
            </div>
        );
    }

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
            <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[70vh] text-center border-4 border-indigo-500/30">
                <div className="absolute top-0 right-0 p-8 opacity-10"><Trophy size={200}/></div>
                
                <Badge className="bg-indigo-500 text-white mb-6 border-0 text-sm py-1.5 px-4 rounded-full">우리 반 한정 챌린지</Badge>
                <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight leading-tight">영단어<br/><span className="text-yellow-400">챌린지</span></h1>
                <p className="text-indigo-200 mb-8 font-medium leading-relaxed">단어의 유의어와 반의어 관계를 파악하여 혼자 튀는 하나를 찾아라!<br/><span className="text-rose-400 font-bold bg-rose-900/50 px-2 py-1 rounded">※ 한 번 틀리면 즉시 게임 오버</span></p>
                
                <button onClick={() => setIsGameActive(true)} className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-300 hover:to-orange-400 text-orange-950 font-black text-2xl py-4 px-12 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2 z-10">
                    <Play fill="currentColor" size={24}/> 게임 시작 (전체 화면)
                </button>

                <div className="w-full mt-12 bg-white/5 rounded-2xl p-5 border border-white/10 text-left z-10">
                    <h3 className="font-bold text-yellow-400 mb-3 flex items-center gap-1.5"><Crown size={16}/> 실시간 명예의 전당 TOP 5</h3>
                    <div className="space-y-3">
                        {rankings.length === 0 ? <p className="text-white/40 text-sm font-bold">아직 기록이 없습니다. 1등을 선점하세요!</p> :
                            rankings.slice(0, 5).map((r, i) => (
                                <div key={r.id} className={`flex justify-between text-sm items-center border-b pb-2 ${r.studentId === currentUser.id ? 'border-yellow-400/50' : 'border-white/5'}`}>
                                    <span className={`font-bold ${r.studentId === currentUser.id ? 'text-yellow-400' : 'text-white/90'}`}>{i+1}. {r.studentName} {r.studentId === currentUser.id && '(나)'}</span>
                                    <span className={`font-mono font-bold ${r.studentId === currentUser.id ? 'text-yellow-400' : 'text-yellow-200'}`}>{r.score?.toLocaleString() || 0} pt</span>
                                </div>
                            ))
                        }
                    </div>

                    {/* 🚀 [CTO 패치] 나의 최고 기록 패널 (동기부여 제공) */}
                    <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center bg-indigo-500/20 p-4 rounded-xl border border-indigo-400/30">
                        <span className="font-bold text-indigo-200">⭐ 나의 최고 기록</span>
                        <span className="font-black text-2xl text-white font-mono">{myRecordData.score.toLocaleString()} pt</span>
                    </div>
                </div>
            </div>
        </div>
    );
}