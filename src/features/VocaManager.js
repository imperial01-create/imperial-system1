import React, { useState, useEffect } from 'react';
import { Search, Printer, CheckCircle, XCircle, RefreshCw, User, Award } from 'lucide-react';
import { Button, Card, Toast } from '../components/UI';
import { useData } from '../contexts/DataContext';
import { generateDailyVocaSet } from '../utils/vocaEngine';

const VocaManager = ({ currentUser }) => {
    const { users, englishStats } = useData();
    const [searchInput, setSearchInput] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    
    // 현재 진행 중인 시험 세션 데이터 (인쇄 및 채점용)
    const [currentTestSession, setCurrentTestSession] = useState(null);
    
    // 고속 채점판 (오답 번호를 기록하는 Set)
    const [wrongAnswers, setWrongAnswers] = useState(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [toast, setToast] = useState({ message: '', type: 'info' });

    const showToast = (msg, type = 'success') => setToast({ message: msg, type });

    // 1. 학생 검색
    const handleSearch = () => {
        const student = users.find(u => u.role === 'student' && u.name === searchInput.trim());
        if (!student) return showToast('해당 이름의 학생을 찾을 수 없습니다.', 'error');
        setSelectedStudent(student);
        setCurrentTestSession(null); // 다른 학생 검색 시 초기화
    };

    // 2. 단어 세트 알고리즘 호출 및 인쇄 준비
    const handleGenerateSet = async () => {
        if (!selectedStudent) return;
        setIsGenerating(true);
        try {
            // Step 2에서 만든 엔진 호출!
            const testPayload = await generateDailyVocaSet(selectedStudent.id);
            setCurrentTestSession(testPayload);
            setWrongAnswers(new Set()); // 채점판 초기화
            showToast('시험지가 성공적으로 생성되었습니다. [인쇄] 버튼을 눌러주세요.');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // 3. 고속 채점 토글 로직
    const toggleAnswer = (questionNumber) => {
        setWrongAnswers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(questionNumber)) newSet.delete(questionNumber);
            else newSet.add(questionNumber);
            return newSet;
        });
    };

    // 4. 인쇄 마법사 호출
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

            <div className="flex items-center gap-3 mb-8">
                <Award className="text-blue-600" size={32} />
                <h1 className="text-3xl font-black text-gray-800">Voca 데스크 클리닉</h1>
            </div>

            {/* --- 조교용 검색 및 컨트롤 대시보드 --- */}
            <Card className="p-6 bg-white shadow-sm border-2 border-blue-50">
                <div className="flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold focus:border-blue-500" 
                            placeholder="학생 이름을 입력하세요 (예: 홍길동)"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <Button onClick={handleSearch} className="px-8 font-bold">학생 검색</Button>
                </div>

                {selectedStudent && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-xl flex justify-between items-center border border-blue-100">
                        <div className="flex items-center gap-4">
                            <div className="bg-white p-3 rounded-full shadow-sm">
                                <User className="text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-blue-900">{selectedStudent.name} 학생</h3>
                                <p className="text-sm font-bold text-blue-600 mt-1">
                                    Voca 스탯: {englishStats.find(s => s.studentId === selectedStudent.id)?.radarChart?.voca || 0}점
                                </p>
                            </div>
                        </div>
                        <Button 
                            onClick={handleGenerateSet} 
                            disabled={isGenerating}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2"
                        >
                            {isGenerating ? <RefreshCw className="animate-spin" /> : '새로운 시험지 세트 생성하기'}
                        </Button>
                    </div>
                )}
            </Card>

            {/* --- 고속 채점판 UI (시험지가 생성되었을 때만 보임) --- */}
            {currentTestSession && (
                <Card className="p-8 bg-white border-2 border-emerald-50">
                    <div className="flex justify-between items-center border-b pb-4 mb-6">
                        <h2 className="text-2xl font-black text-gray-800">
                            초고속 채점 콘솔 <span className="text-sm font-bold text-gray-500 ml-2">(Session: {currentTestSession.sessionNumber})</span>
                        </h2>
                        <Button onClick={handlePrint} className="bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-2">
                            <Printer size={18} /> 시험지 및 단어장 인쇄
                        </Button>
                    </div>

                    <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl mb-6 text-rose-600 font-bold text-sm">
                        ⚠️ 조교님, 학생이 틀린 번호만 마우스로 클릭하여 빨간색으로 변경해 주세요.
                    </div>

                    <div className="grid grid-cols-10 gap-2 mb-8">
                        {Array.from({ length: 50 }, (_, i) => i + 1).map(num => (
                            <button
                                key={num}
                                onClick={() => toggleAnswer(num)}
                                className={`h-12 rounded-lg font-black text-lg transition-all border-2 
                                    ${wrongAnswers.has(num) 
                                        ? 'bg-rose-500 text-white border-rose-600 scale-105 shadow-md' 
                                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
                                    }`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div className="text-lg font-bold text-gray-700">
                            총 50문항 중 <span className="text-rose-600 font-black">{wrongAnswers.size}</span>개 오답
                            <span className="ml-2 text-emerald-600 font-black">(정답률: {((50 - wrongAnswers.size) / 50 * 100).toFixed(0)}%)</span>
                        </div>
                        <Button className="bg-emerald-600 hover:bg-emerald-700 px-8 py-3 text-lg font-black shadow-lg">
                            채점 완료 및 점수 정산
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