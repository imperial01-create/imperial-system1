/* [서비스 가치] 권한이 없는 타 과목 강사의 Voca 데이터 무단 접근을 UI단에서 즉각 차단하여 
   학원 내 학생 PII(개인식별정보) 보안 위협을 제로(Zero Trust) 상태로 유지합니다. */
import React, { useState } from 'react';
import { Search, Printer, RefreshCw, User, Award, Layers, Zap, FileText, Lock } from 'lucide-react';
import { Button, Card, Toast } from '../components/UI';
import { useData } from '../contexts/DataContext';
import { generateDailyVocaSet, processVocaTestResult } from '../utils/vocaEngine';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

const VocaManager = ({ currentUser }) => {
    // 🚀 [CTO 보안 패치] 컴포넌트 마운트 즉시, 강제 접근 여부를 판별합니다.
    const isAuthorized = currentUser?.role === 'admin' || currentUser?.role === 'admin_assistant' || 
                         (['lecturer', 'ta'].includes(currentUser?.role) && currentUser?.subject === '영어');

    const { users, englishStats } = useData();
    const [searchInput, setSearchInput] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [currentTestSession, setCurrentTestSession] = useState(null);
    const [wrongAnswers, setWrongAnswers] = useState(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState({ message: '', type: 'info' });

    // 권한이 없으면 컴포넌트 렌더링 자체를 차단하고 보안 경고창을 띄웁니다.
    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-5 animate-in fade-in zoom-in-95">
                <div className="bg-red-50 p-6 rounded-full border-4 border-red-100">
                    <Lock className="text-red-500" size={48} />
                </div>
                <h2 className="text-2xl font-black text-gray-800">접근 권한이 차단되었습니다</h2>
                <p className="text-gray-500 font-bold text-center">
                    이 페이지는 <span className="text-red-500">영어 전문 강사 및 최고 관리자</span> 전용 메뉴입니다.<br/>
                    본인의 담당 과목 설정이 올바른지 관리자에게 문의해 주세요.
                </p>
            </div>
        );
    }

    const showToast = (msg, type = 'success') => setToast({ message: msg, type });

    const studentStat = englishStats.find(s => s.studentId === selectedStudent?.id);

    const handleSearch = () => {
        const student = users.find(u => u.role === 'student' && u.name === searchInput.trim());
        if (!student) return showToast('해당 학생이 존재하지 않습니다.', 'error');
        setSelectedStudent(student);
        setCurrentTestSession(null);
    };

    // 🚀 강사의 3대 프리셋 학습 모드 원클릭 변경 스위치
    const handleChangeMode = async (mode) => {
        if (!selectedStudent || !studentStat) return;
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, selectedStudent.id);
            await updateDoc(statRef, { studyMode: mode });
            showToast(`💡 학습 모드가 [${mode === 'progress' ? '진도 모드' : mode === 'basic' ? '기초 모드' : '복습 모드'}]로 업데이트되었습니다.`);
        } catch (e) { showToast(e.message, 'error'); }
    };

    const handleGenerateSet = async () => {
        if (!selectedStudent) return;
        setIsGenerating(true);
        try {
            const testPayload = await generateDailyVocaSet(selectedStudent.id);
            setCurrentTestSession(testPayload);
            setWrongAnswers(new Set());
            showToast('🎯 맞춤형 40단어 및 50문항 셔플 시험지가 출고되었습니다.');
        } catch (error) { showToast(error.message, 'error'); } 
        finally { setIsGenerating(false); }
    };

    const toggleAnswer = (num) => {
        setWrongAnswers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(num)) newSet.delete(num);
            else newSet.add(num);
            return newSet;
        });
    };

    // 🚀 Elo 레이팅 정산, 루브릭 생성 및 소멸 알고리즘 작동 트리거
    const handleSubmitScores = async () => {
        if (!currentTestSession || isSubmitting) return;
        if (!window.confirm("채점 내역을 최종 마감하고 학생의 3대 스탯창에 반영하시겠습니까?")) return;

        setIsSubmitting(true);
        try {
            await processVocaTestResult(selectedStudent.id, currentTestSession.sessionNumber, Array.from(wrongAnswers));
            showToast('🎉 채점 연산 종료! 학생의 장기기억력 및 이해도 스탯이 실시간 업데이트되었습니다.', 'success');
            setCurrentTestSession(null);
            setWrongAnswers(new Set());
        } catch (e) { showToast(e.message, 'error'); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-20">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

            <div className="flex items-center gap-3 mb-8">
                <Award className="text-blue-600" size={32} />
                <div>
                    <h1 className="text-3xl font-black text-gray-800">Voca 데스크 클리닉 콘솔</h1>
                    <p className="text-sm font-bold text-gray-500 mt-1">학생 스탯 관리 및 초고속 채점 시스템</p>
                </div>
            </div>

            <Card className="p-6 bg-white shadow-sm border-2 border-blue-50">
                <div className="flex gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold focus:border-blue-500 transition-colors" placeholder="학생 이름을 검색하세요 (예: 홍길동)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}/>
                    </div>
                    <Button onClick={handleSearch} className="px-8 font-bold">학생 조회</Button>
                </div>

                {selectedStudent && studentStat && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                        <div className="flex items-center gap-3 mb-5 border-b border-slate-200 pb-4">
                            <User className="text-indigo-600" size={28}/>
                            <span className="font-black text-2xl text-slate-800">{selectedStudent.name}</span>
                            <span className="bg-indigo-100 text-indigo-700 font-black text-xs px-3 py-1.5 rounded-lg ml-2">Session {studentStat.vocaSession}</span>
                        </div>

                        {/* 🚀 관리자/강사 전용: 학생 정밀 스탯 및 루브릭 뷰 */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                            <div className="col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-wider flex items-center gap-2"><Zap size={14}/> AI Data Matrix</h4>
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100">
                                        <div className="text-[11px] font-bold text-blue-600 mb-1">어휘 진도</div>
                                        <div className="text-2xl font-black text-blue-900">{studentStat.vocaProgress || 0}%</div>
                                    </div>
                                    <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100">
                                        <div className="text-[11px] font-bold text-emerald-600 mb-1">뜻 이해도</div>
                                        <div className="text-2xl font-black text-emerald-900">{studentStat.vocaComprehension || 0}%</div>
                                    </div>
                                    <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100">
                                        <div className="text-[11px] font-bold text-indigo-600 mb-1">기억 유지력</div>
                                        <div className="text-2xl font-black text-indigo-900">{studentStat.vocaRetention || 0}%</div>
                                    </div>
                                </div>
                                <div className="mt-4 bg-amber-50/50 p-3.5 rounded-xl border border-amber-100 text-sm font-bold text-slate-700 flex items-start gap-2 leading-relaxed">
                                    <Award size={18} className="text-amber-500 shrink-0 mt-0.5"/>
                                    {studentStat.vocaRubric || "성적 데이터가 수집되는 중입니다. 꾸준히 시험을 진행해 주세요."}
                                </div>
                            </div>

                            <div className="col-span-1 flex flex-col justify-center gap-3">
                                <Button onClick={handleGenerateSet} disabled={isGenerating} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-black h-16 w-full text-base shadow-lg transition-transform active:scale-95">
                                    {isGenerating ? <RefreshCw className="animate-spin mx-auto" /> : <span className="flex items-center justify-center gap-2"><FileText size={20}/> 오늘의 맞춤 시험지 발급</span>}
                                </Button>
                                {currentTestSession && (
                                    <button onClick={() => window.print()} className="text-sm font-bold text-slate-600 hover:text-slate-900 bg-white py-3 rounded-xl border-2 border-slate-200 hover:border-slate-300 transition-colors flex justify-center items-center gap-2 shadow-sm">
                                        <Printer size={16}/> 시험지 인쇄 창 열기
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 🚀 강사 전용 프리셋 제어 인터페이스 */}
                        <div className="border-t border-slate-200 pt-5 flex flex-col sm:flex-row items-center gap-4">
                            <div className="text-sm font-black text-slate-600 flex items-center gap-1.5"><Layers size={18} className="text-indigo-500"/> 강사지정 학습 모드 :</div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                {[
                                    { id: 'progress', label: '🚀 진도 모드', desc: '신규 60%' },
                                    { id: 'basic', label: '🧱 기초 모드', desc: '복습 40%' },
                                    { id: 'review', label: '🔄 복습 모드', desc: '복습 80%' }
                                ].map(m => (
                                    <button
                                        key={m.id} onClick={() => handleChangeMode(m.id)}
                                        className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl border-2 font-black text-sm transition-all flex flex-col items-center justify-center
                                            ${(studentStat.studyMode || 'progress') === m.id 
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md transform -translate-y-0.5' 
                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        <span>{m.label}</span>
                                        <span className={`text-[10px] font-bold mt-0.5 ${(studentStat.studyMode || 'progress') === m.id ? 'text-blue-200' : 'text-slate-400'}`}>{m.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {/* 🚀 바둑판 고속 채점 그리드 */}
            {currentTestSession && (
                <Card className="p-8 bg-white border-2 border-emerald-100 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-5 mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-gray-800 mb-1">고속 채점 그리드</h2>
                            <p className="text-sm font-bold text-rose-500">조교님, 학생이 틀린 번호만 클릭하여 빨간색으로 변경해 주세요.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-3 mb-8">
                        {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                            <button
                                key={num} onClick={() => toggleAnswer(num)}
                                className={`h-14 rounded-xl font-black text-xl transition-all border-2 
                                    ${wrongAnswers.has(num) 
                                        ? 'bg-rose-500 text-white border-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.4)] scale-105' 
                                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                                    }`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-50 p-5 rounded-2xl border border-slate-200 gap-4">
                        <div className="text-lg font-bold text-slate-700">
                            오답 문항 수 : <span className="text-rose-600 font-black text-2xl mx-1">{wrongAnswers.size}</span> 개 
                            <span className="mx-3 text-slate-300">|</span>
                            정답률 : <span className="text-emerald-600 font-black text-2xl mx-1">{((50 - wrongAnswers.size) / 50 * 100).toFixed(0)}</span> %
                        </div>
                        <Button onClick={handleSubmitScores} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 font-black text-lg px-10 py-4 shadow-lg w-full sm:w-auto">
                            {isSubmitting ? '연산 처리 중...' : '채점 마감 및 스탯 반영하기'}
                        </Button>
                    </div>
                </Card>
            )}

            {/* ==========================================
                🖨️ [인쇄 전용 컴포넌트] 화면엔 숨겨짐, 인쇄 시 출력됨
                ========================================== */}
            {currentTestSession && (
                <div className="print-only-section">
                    
                    {/* [페이지 1] 코넬식 누적 복습 단어장 (40단어) */}
                    <div className="p-8">
                        <div className="flex justify-between items-end border-b-4 border-slate-800 pb-4 mb-6">
                            <div>
                                <h1 className="text-3xl font-black text-slate-800 mb-2">초개인화 맞춤 단어장</h1>
                                <p className="text-sm font-bold text-slate-500">
                                    {selectedStudent?.name} 학생 전용 데이터 (Session {currentTestSession.sessionNumber})
                                </p>
                            </div>
                            <div className="text-right text-sm font-bold text-slate-500">목동임페리얼학원 영어과</div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-10 gap-y-5">
                            {currentTestSession.wordsForPrint.map((word, idx) => (
                                <div key={idx} className="flex border-b border-slate-300 pb-2 items-center">
                                    <div className="w-1/2 font-black text-xl text-slate-800 pr-4 border-r-2 border-dashed border-slate-400 break-words">
                                        {word.word}
                                    </div>
                                    <div className="w-1/2 pl-4 text-sm font-bold text-slate-700 flex flex-col justify-center">
                                        {word.meanings.map((m, mIdx) => (
                                            <span key={mIdx} className="mb-0.5">{mIdx + 1}. {m.koreanMeaning}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* [페이지 2] 10분 평가 시험지 (강제 페이지 넘김) */}
                    <div className="page-break p-8">
                        <div className="flex justify-between items-end border-b-4 border-slate-800 pb-4 mb-8">
                            <div>
                                <h1 className="text-3xl font-black text-slate-800 mb-2">데일리 Voca 평가 (10분)</h1>
                                <p className="text-sm font-bold text-slate-500">
                                    {selectedStudent?.name} / 맞은 개수: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 50
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                            {currentTestSession.questionsForTest.map((q, idx) => (
                                <div key={idx} className="flex flex-col">
                                    <div className="flex items-start text-lg">
                                        <span className="w-8 font-black text-slate-400 mt-1">{q.questionNumber}.</span>
                                        <div className="flex-1">
                                            <span className="font-bold text-slate-800 leading-relaxed">{q.wordText}</span>
                                            {q.hint && <span className="ml-2 text-sm font-black text-slate-500">{q.hint}</span>}
                                        </div>
                                    </div>
                                    <div className="ml-8 mt-4 border-b-2 border-slate-400 h-2 w-[90%]"></div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default VocaManager;