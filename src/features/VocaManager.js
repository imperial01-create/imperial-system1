/* [서비스 가치] AI Voca 통합 관제 센터 v2.0 (초개인화 제어 및 운영 효율화)
   1) 영어 클래스 전용 필터링으로 휴먼 에러 원천 차단
   2) 학생별 개별 인쇄 및 단어 생성 프리셋 제어 기능으로 프리미엄 맞춤형 학습 실현
   3) 글로벌 데이터 캐시를 활용하여 반을 전환하거나 설정을 바꿀 때 발생하는 Firebase 과금 최소화 */
import React, { useState, useMemo, useEffect } from 'react';
import { 
    Users, Printer, CheckSquare, BarChart2, Search, Play, 
    CheckCircle, AlertCircle, FileText, Download, UserCircle, RefreshCw,
    Sliders
} from 'lucide-react';
import { doc, updateDoc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Badge } from '../components/UI';
import { generateDailyVocaSet } from '../utils/vocaEngine';

const APP_ID = 'imperial-clinic-v1';

const VocaManager = ({ currentUser }) => {
    const { users, classes, enrollments, englishStats } = useData();
    const [selectedClassId, setSelectedClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, grading, analytics, cat_input
    
    // 채점 및 상태 관리
    const [processing, setProcessing] = useState(false);
    const [gradeInput, setGradeInput] = useState({}); // { studentId: score }
    const [catInput, setCatInput] = useState({}); // { studentId: catScore }
    const [printMode, setPrintMode] = useState(null); // 'test' or 'answer'
    const [printData, setPrintData] = useState([]); // 출력용 데이터 캐싱

    // 🚀 [Req 1] 영어 과목 전용 클래스 필터링
    const availableClasses = useMemo(() => {
        let filtered = classes.filter(c => c.subject === '영어' || (c.name && c.name.includes('영어')));
        if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
            filtered = filtered.filter(c => c.instructorId === currentUser.userId);
        }
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }, [classes, currentUser]);

    useEffect(() => {
        if (availableClasses.length > 0 && !selectedClassId) {
            setSelectedClassId(availableClasses[0].id);
        }
    }, [availableClasses, selectedClassId]);

    // 선택된 반의 학생 데이터 결합
    const classStudents = useMemo(() => {
        if (!selectedClassId) return [];
        const enrolledStudentIds = enrollments
            .filter(e => e.classId === selectedClassId && e.status === 'active')
            .map(e => e.studentId);

        return users
            .filter(u => u.role === 'student' && enrolledStudentIds.includes(u.userId))
            .map(student => {
                const stat = englishStats.find(s => s.id === student.id) || { 
                    catScore: null, vocaSession: 1, totalWords: 0, accuracy: 0, vocaPreset: '밸런스 모드' 
                };
                return { ...student, stat: { ...stat, vocaPreset: stat.vocaPreset || '밸런스 모드' } };
            })
            .filter(student => student.name.includes(searchQuery))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [selectedClassId, enrollments, users, englishStats, searchQuery]);

    // 🚀 [Req 3] 일괄 및 개별 시험지/답지 데이터 준비 (targetStudentId 파라미터 추가)
    const preparePrintData = async (type, targetStudentId = null) => {
        setProcessing(true);
        try {
            const dataToPrint = [];
            const targetStudents = targetStudentId 
                ? classStudents.filter(s => s.id === targetStudentId)
                : classStudents;

            for (const student of targetStudents) {
                const sessionId = `test_${student.id}_s${student.stat.vocaSession || 1}`;
                const testSnap = await getDoc(doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId));
                
                let wordsList = [];
                if (testSnap.exists() && testSnap.data().wordsForPrint) {
                    wordsList = testSnap.data().wordsForPrint;
                } else if (student.stat.catScore) {
                    // 미생성 상태면 즉시 생성 (현재 설정된 프리셋 반영)
                    const payload = await generateDailyVocaSet(student.id, student.stat.vocaPreset);
                    wordsList = payload.wordsForPrint;
                }
                
                if (wordsList.length > 0) {
                    dataToPrint.push({ student, wordsList, session: student.stat.vocaSession || 1 });
                }
            }
            
            if (dataToPrint.length === 0) {
                alert("출력할 수 있는 데이터가 없습니다. (CAT 점수가 입력되었는지 확인하세요)");
                setProcessing(false);
                return;
            }

            setPrintData(dataToPrint);
            setPrintMode(type);
            setTimeout(() => { window.print(); setPrintMode(null); }, 500); 
        } catch (error) {
            console.error("Print Data Preparation Error:", error);
            alert("출력 데이터 준비 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    // [고속 채점] 개별 학생 점수 반영
    const handleGradeSubmit = async (studentId, currentSession, score) => {
        if (score === undefined || score < 0 || score > 40) return alert("정상적인 점수(0~40)를 입력하세요.");
        setProcessing(true);
        try {
            const sessionId = `test_${studentId}_s${currentSession}`;
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            const testRef = doc(db, `artifacts/${APP_ID}/public/data/test_sessions`, sessionId);

            await updateDoc(testRef, {
                status: 'completed', score: score, gradedAt: serverTimestamp(), gradedBy: currentUser.name
            });
            await setDoc(statRef, {
                vocaSession: currentSession + 1, lastTestScore: score, lastTestDate: serverTimestamp()
            }, { merge: true });

            alert("채점이 완료되었습니다.");
            setGradeInput(prev => ({ ...prev, [studentId]: '' })); 
        } catch (error) {
            console.error("Grading Error:", error);
            alert("채점 처리 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    // 🚀 [Req 2] CAT 초기 진단 점수 반영 로직
    const handleCatSubmit = async (studentId, score) => {
        if (score === undefined || score < 0 || score > 100) return alert("정상적인 점수(0~100)를 입력하세요.");
        setProcessing(true);
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            await setDoc(statRef, {
                catScore: score, updatedAt: serverTimestamp()
            }, { merge: true });
            
            alert("CAT 점수가 반영되었습니다.");
            setCatInput(prev => ({ ...prev, [studentId]: '' }));
        } catch (error) {
            console.error("CAT Input Error:", error);
            alert("CAT 점수 입력 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    // 🚀 [Req 5] 프리셋 변경 로직
    const handlePresetChange = async (studentId, newPreset) => {
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, studentId);
            await setDoc(statRef, { vocaPreset: newPreset }, { merge: true });
            // Firestore 리스너가 자동 업데이트하므로 추가 조치 불필요
        } catch (error) {
            console.error("Preset Update Error:", error);
            alert("프리셋 변경 중 오류가 발생했습니다.");
        }
    };

    // --- 렌더링 영역 (인쇄 모드 분리) ---
    if (printMode) {
        return (
            <div className="bg-white text-black p-8 min-h-screen">
                {printData.map((data, idx) => (
                    <div key={data.student.id} className="print-page break-after-page mb-10">
                        <div className="flex justify-between border-b-2 border-black pb-4 mb-4">
                            <h2 className="text-2xl font-black">
                                임페리얼 {printMode === 'answer' ? '강사용 답안지' : '영단어 시험지'} 
                            </h2>
                            <div className="text-right text-sm font-bold">
                                <div>이름: {data.student.name}</div>
                                <div>날짜: {new Date().toLocaleDateString()} / 점수: _____ / 40</div>
                            </div>
                        </div>
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-gray-400">
                                    <th className="p-2 w-10">No.</th>
                                    <th className="p-2 w-1/3">Target Vocabulary</th>
                                    <th className="p-2">Core Meaning (핵심 의미)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.wordsList.map((word, i) => (
                                    <tr key={word.wordId} className="border-b border-gray-200">
                                        <td className="p-2 font-bold">{i + 1}</td>
                                        <td className="p-2 font-black text-lg">{word.word}</td>
                                        <td className="p-2 font-semibold">
                                            {printMode === 'answer' 
                                                ? (word.meanings?.map(m => m.koreanMeaning).join(', ') || '뜻 정보 없음')
                                                : <div className="border-b border-gray-300 w-full h-6"></div> // 학생용 빈칸
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in pb-20 print:hidden">
            {/* 1. 글로벌 헤더 및 통제 센터 */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                        <BarChart2 className="text-indigo-600" /> Voca 통합 관제 센터
                    </h1>
                    <p className="text-slate-500 font-bold mt-1">영어반 시험지 출력, 고속 채점, 성취도 분석, CAT 진단 원스톱 관리</p>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-2xl flex-wrap justify-center gap-1">
                    <button onClick={() => setActiveTab('dashboard')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>대시보드 & 인쇄</button>
                    <button onClick={() => setActiveTab('grading')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'grading' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>고속 채점</button>
                    <button onClick={() => setActiveTab('analytics')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'analytics' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>어휘력 분석</button>
                    {/* 🚀 [Req 2] CAT 진단 탭 추가 */}
                    <button onClick={() => setActiveTab('cat_input')} className={`px-5 py-2 rounded-xl font-bold transition-all ${activeTab === 'cat_input' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>CAT 진단 입력</button>
                </div>
            </div>

            {/* 2. 컨트롤 패널 (클래스 선택 및 일괄 출력) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3 md:col-span-1">
                    <Users className="text-slate-400" />
                    <select 
                        className="w-full bg-transparent font-black text-slate-700 outline-none cursor-pointer"
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                        {availableClasses.length === 0 && <option value="">배정된 영어 클래스 없음</option>}
                        {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                
                {activeTab === 'dashboard' && (
                    <div className="md:col-span-2 flex gap-3">
                        <button 
                            onClick={() => preparePrintData('test')} 
                            disabled={processing || classStudents.length === 0}
                            className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-indigo-200 disabled:opacity-50"
                        >
                            {processing ? <RefreshCw className="animate-spin" size={20} /> : <FileText size={20} />} 
                            반 전체 시험지 인쇄
                        </button>
                        <button 
                            onClick={() => preparePrintData('answer')} 
                            disabled={processing || classStudents.length === 0}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors border border-rose-200 disabled:opacity-50"
                        >
                            {processing ? <RefreshCw className="animate-spin" size={20} /> : <Printer size={20} />} 
                            강사용 답안지 일괄 출력
                        </button>
                    </div>
                )}
                
                {activeTab !== 'dashboard' && (
                    <div className="md:col-span-2 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="학생 이름으로 검색..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 font-bold p-4 pl-12 rounded-2xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                    </div>
                )}
            </div>

            {/* 3. 메인 콘텐츠 영역 (Tab에 따른 분기) */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
                {classStudents.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center justify-center">
                        <AlertCircle size={48} className="text-slate-300 mb-4" />
                        <h3 className="text-xl font-bold text-slate-600">조회할 학생 데이터가 없습니다.</h3>
                        <p className="text-slate-400 font-semibold mt-2">영어 클래스를 변경하거나 학생을 등록해주세요.</p>
                    </div>
                ) : (
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-slate-50 border-b border-slate-200 whitespace-nowrap">
                            <tr>
                                <th className="p-4 font-black text-slate-600 w-1/4">학생 정보</th>
                                <th className="p-4 font-black text-slate-600 text-center">초기 진단 (CAT)</th>
                                {/* 🚀 [Req 4] 진행 회차 열 삭제 완료 */}
                                {activeTab === 'dashboard' && (
                                    <>
                                        <th className="p-4 font-black text-slate-600 text-center"><Sliders size={16} className="inline mr-1"/> 단어 비중 프리셋</th>
                                        <th className="p-4 font-black text-slate-600 text-center">개별 인쇄</th>
                                    </>
                                )}
                                {activeTab === 'grading' && <th className="p-4 font-black text-slate-600 w-1/3">고속 채점 입력 (Max 40)</th>}
                                {activeTab === 'analytics' && <th className="p-4 font-black text-slate-600 text-center">정답률 / 누적 어휘</th>}
                                {activeTab === 'cat_input' && <th className="p-4 font-black text-slate-600 w-1/3">CAT 점수 직접 입력 (Max 100)</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {classStudents.map(student => (
                                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black shrink-0">
                                                {student.name[0]}
                                            </div>
                                            <div>
                                                <div className="font-black text-slate-800 text-base">{student.name}</div>
                                                <div className="text-xs font-bold text-slate-400">{student.schoolName} {student.grade}</div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    <td className="p-4 text-center">
                                        {student.stat.catScore 
                                            ? <Badge className="bg-emerald-100 text-emerald-700 font-black px-3">{student.stat.catScore}점</Badge> 
                                            : <Badge className="bg-rose-100 text-rose-700 font-black px-3 cursor-pointer hover:bg-rose-200">미응시</Badge>
                                        }
                                    </td>

                                    {activeTab === 'dashboard' && (
                                        <>
                                            {/* 🚀 [Req 5] 프리셋 설정 셀렉트 박스 */}
                                            <td className="p-4 text-center">
                                                <select 
                                                    value={student.stat.vocaPreset}
                                                    onChange={(e) => handlePresetChange(student.id, e.target.value)}
                                                    className="bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 transition-colors cursor-pointer"
                                                >
                                                    <option value="밸런스 모드">밸런스 (오답+신규)</option>
                                                    <option value="누적 복습 위주">누적 복습 위주</option>
                                                    <option value="신규 단어 집중">신규 단어 집중</option>
                                                    <option value="고난도 어휘">고난도 어휘 위주</option>
                                                </select>
                                            </td>
                                            
                                            {/* 🚀 [Req 3] 개별 인쇄 액션 버튼 */}
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button 
                                                        onClick={() => preparePrintData('test', student.id)}
                                                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-md font-bold text-xs transition-colors border border-indigo-200"
                                                    >
                                                        시험지
                                                    </button>
                                                    <button 
                                                        onClick={() => preparePrintData('answer', student.id)}
                                                        className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-md font-bold text-xs transition-colors border border-rose-200"
                                                    >
                                                        답안지
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    )}

                                    {activeTab === 'grading' && (
                                        <td className="p-4">
                                            <div className="flex gap-2 items-center">
                                                <input 
                                                    type="number" max="40" min="0" placeholder="점수"
                                                    className="w-20 bg-white border border-slate-300 font-black text-center p-2 rounded-xl outline-none focus:border-indigo-500"
                                                    value={gradeInput[student.id] || ''}
                                                    onChange={e => setGradeInput({...gradeInput, [student.id]: e.target.value})}
                                                    disabled={processing}
                                                />
                                                <span className="font-bold text-slate-400 mr-2">/ 40</span>
                                                <button 
                                                    onClick={() => handleGradeSubmit(student.id, student.stat.vocaSession, parseInt(gradeInput[student.id]))}
                                                    disabled={processing || !gradeInput[student.id]}
                                                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
                                                >
                                                    저장
                                                </button>
                                            </div>
                                        </td>
                                    )}

                                    {activeTab === 'analytics' && (
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="w-full bg-slate-200 rounded-full h-2 max-w-[150px]">
                                                    <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${student.stat.accuracy || 0}%` }}></div>
                                                </div>
                                                <span className="text-xs font-bold text-slate-500">
                                                    정답률 {student.stat.accuracy || 0}% (누적 {student.stat.totalWords || 0}단어)
                                                </span>
                                            </div>
                                        </td>
                                    )}

                                    {/* 🚀 [Req 2] CAT 입력 UI */}
                                    {activeTab === 'cat_input' && (
                                        <td className="p-4">
                                            <div className="flex gap-2 items-center">
                                                <input 
                                                    type="number" max="100" min="0" placeholder="CAT 점수"
                                                    className="w-24 bg-white border border-slate-300 font-black text-center p-2 rounded-xl outline-none focus:border-amber-500"
                                                    value={catInput[student.id] || ''}
                                                    onChange={e => setCatInput({...catInput, [student.id]: e.target.value})}
                                                    disabled={processing}
                                                />
                                                <span className="font-bold text-slate-400 mr-2">/ 100</span>
                                                <button 
                                                    onClick={() => handleCatSubmit(student.id, parseInt(catInput[student.id]))}
                                                    disabled={processing || !catInput[student.id]}
                                                    className="bg-amber-500 hover:bg-amber-600 text-white font-black px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
                                                >
                                                    반영
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default VocaManager;