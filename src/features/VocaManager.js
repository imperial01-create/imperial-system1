import React, { useState } from 'react';
import { Search, Printer, CheckCircle, RefreshCw, User, Award, Layers, Zap } from 'lucide-react';
import { Button, Card, Toast } from '../components/UI';
import { useData } from '../contexts/DataContext';
import { generateDailyVocaSet, processVocaTestResult } from '../utils/vocaEngine';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const APP_ID = 'imperial-clinic-v1';

const VocaManager = ({ currentUser }) => {
    const { users, englishStats } = useData();
    const [searchInput, setSearchInput] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [currentTestSession, setCurrentTestSession] = useState(null);
    const [wrongAnswers, setWrongAnswers] = useState(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState({ message: '', type: 'info' });

    const showToast = (msg, type = 'success') => setToast({ message: msg, type });

    const studentStat = englishStats.find(s => s.studentId === selectedStudent?.id);

    const handleSearch = () => {
        const student = users.find(u => u.role === 'student' && u.name === searchInput.trim());
        if (!student) return showToast('해당 학생이 존재하지 않습니다.', 'error');
        setSelectedStudent(student);
        setCurrentTestSession(null);
    };

    // 🚀 강사의 3대 프리셋 학습 모드 즉시 원클릭 변경 스위치
    const handleChangeMode = async (mode) => {
        if (!selectedStudent) return;
        try {
            const statRef = doc(db, `artifacts/${APP_ID}/public/data/english_stats`, selectedStudent.id);
            await updateDoc(statRef, { studyMode: mode });
            showToast(`💡 학습 모드가 [${mode === 'progress' ? '진도 모드' : mode === 'basic' ? '기초 모드' : '복습 모드'}]로 업그레이드되었습니다.`);
        } catch (e) { showToast(e.message, 'error'); }
    };

    const handleGenerateSet = async () => {
        if (!selectedStudent) return;
        setIsGenerating(true);
        try {
            const testPayload = await generateDailyVocaSet(selectedStudent.id);
            setCurrentTestSession(testPayload);
            setWrongAnswers(new Set());
            showToast('🎯 맞춤형 40단어 및 50분항 시험지가 출고되었습니다.');
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

    // 🚀 Elo 레이팅 스탯 점수 자동 환산 및 다음 회차 자동 개방 트리거
    const handleSubmitScores = async () => {
        if (!currentTestSession || isSubmitting) return;
        if (!window.confirm("채점 내역을 최종 마감하고 캐릭터 능력치 창에 반영하시겠습니까?")) return;

        setIsSubmitting(true);
        try {
            await processVocaTestResult(selectedStudent.id, currentTestSession.sessionNumber, Array.from(wrongAnswers));
            showToast('🎉 채점 연산이 종료되었습니다! 학생 능력치가 실시간 펌핑되었습니다.', 'success');
            setCurrentTestSession(null);
            setWrongAnswers(new Set());
        } catch (e) { showToast(e.message, 'error'); } 
        finally { setIsSubmitting(false); }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

            <div className="flex items-center gap-3 mb-8">
                <Award className="text-blue-600" size={32} />
                <h1 className="text-3xl font-black text-gray-800">Voca 데스크 클리닉 콘솔</h1>
            </div>

            <Card className="p-6 bg-white shadow-sm border-2 border-blue-50">
                <div className="flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold focus:border-blue-500" placeholder="학생 이름을 입력하세요 (예: 홍길동)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}/>
                    </div>
                    <Button onClick={handleSearch} className="px-8 font-bold">학생 조회</Button>
                </div>

                {selectedStudent && studentStat && (
                    <div className="mt-6 p-5 bg-slate-50 border rounded-2xl space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <User className="text-indigo-600" />
                                <span className="font-black text-lg text-slate-800">{selectedStudent.name}</span>
                                <span className="bg-indigo-100 text-indigo-700 font-mono font-black text-xs px-2.5 py-1 rounded-lg">현재 어휘력 스탯: {studentStat.radarChart?.voca || 0} 점</span>
                            </div>
                            <Button onClick={handleGenerateSet} disabled={isGenerating} className="bg-indigo-600 font-black flex items-center gap-2">
                                {isGenerating ? <RefreshCw className="animate-spin" /> : <Zap size={16}/>} 오늘의 시험지 세트 생성
                            </Button>
                        </div>

                        {/* 🚀 강사 전용 프리셋 제어 인터페이스 */}
                        <div className="border-t pt-4 flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
                            <div className="text-sm font-black text-slate-600 flex items-center gap-1"><Layers size={16}/> 강사지정 학습 모드:</div>
                            <div className="flex gap-2">
                                {[
                                    { id: 'progress', label: '🚀 진도 모드', desc: '신구비율 6:3:1' },
                                    { id: 'basic', label: '🧱 기초 모드', desc: '신구비율 3:4:3' },
                                    { id: 'review', label: '🔄 복습 모드', desc: '신구비율 0:8:2' }
                                ].map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => handleChangeMode(m.id)}
                                        className={`px-4 py-2 rounded-xl border font-black text-xs transition-all flex flex-col items-center
                                            ${(studentStat.studyMode || 'progress') === m.id 
                                                ? 'bg-blue-600 border-blue-700 text-white shadow-md scale-105' 
                                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        <span>{m.label}</span>
                                        <span className={`text-[9px] font-normal mt-0.5 ${(studentStat.studyMode || 'progress') === m.id ? 'text-blue-100' : 'text-slate-400'}`}>{m.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {currentTestSession && (
                <Card className="p-8 bg-white border-2 border-emerald-50 shadow-md">
                    <div className="flex justify-between items-center border-b pb-4 mb-6">
                        <h2 className="text-2xl font-black text-gray-800">바둑판 고속 채점 그리드</h2>
                        <Button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-2">
                            <Printer size={18} /> 시험지 인쇄 창 열기
                        </Button>
                    </div>

                    <div className="grid grid-cols-10 gap-2 mb-8">
                        {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                            <button key={num} onClick={() => toggleAnswer(num)} className={`h-12 rounded-lg font-black text-lg transition-all border-2 ${wrongAnswers.has(num) ? 'bg-rose-500 text-white border-rose-600 scale-105 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>
                                {num}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border">
                        <div className="text-base font-bold text-slate-700">
                            오답 문항 수: <span className="text-rose-600 font-black">{wrongAnswers.size}</span> 개 / 정답률: {((50 - wrongAnswers.size) / 50 * 100).toFixed(0)}%
                        </div>
                        <Button onClick={handleSubmitScores} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 font-black text-lg px-8">
                            {isSubmitting ? '연산 처리 중...' : '채점 마감 및 스탯 반영'}
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
                                <h1 className="text-3xl font-black text-slate-800 mb-2">초개인화 누적 단어장</h1>
                                <p className="text-sm font-bold text-slate-500">
                                    {selectedStudent?.name} 학생 맞춤형 데이터 (Session {currentTestSession.sessionNumber})
                                </p>
                            </div>
                            <div className="text-right text-sm font-bold text-slate-500">
                                목동임페리얼학원 영어과
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                            {currentTestSession.wordsForPrint.map((word, idx) => (
                                <div key={idx} className="flex border-b border-slate-200 pb-2">
                                    {/* 왼쪽: 영단어 (접어서 외울 수 있도록 공간 확보) */}
                                    <div className="w-1/2 font-black text-lg text-slate-800 pr-4 border-r-2 border-dashed border-slate-300">
                                        {word.word}
                                    </div>
                                    {/* 오른쪽: 뜻 */}
                                    <div className="w-1/2 pl-4 text-sm font-bold text-slate-600 flex flex-col justify-center">
                                        {word.meanings.map((m, mIdx) => (
                                            <span key={mIdx}>{mIdx + 1}. {m.koreanMeaning}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* [페이지 2] 10분 평가 시험지 (강제 페이지 넘김) */}
                    <div className="page-break p-8">
                        <div className="flex justify-between items-end border-b-4 border-slate-800 pb-4 mb-6">
                            <div>
                                <h1 className="text-3xl font-black text-slate-800 mb-2">데일리 Voca 평가 (10분)</h1>
                                <p className="text-sm font-bold text-slate-500">
                                    {selectedStudent?.name} / 맞은 개수: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 50
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                            {currentTestSession.questionsForTest.map((q, idx) => (
                                <div key={idx} className="flex items-center text-lg">
                                    <span className="w-8 font-black text-slate-400">{q.questionNumber}.</span>
                                    <span className="w-40 font-bold text-slate-800">{q.wordText}</span>
                                    {/* 학생이 답을 적을 빈칸 (밑줄) */}
                                    <div className="flex-1 border-b border-slate-400 h-6"></div>
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

           