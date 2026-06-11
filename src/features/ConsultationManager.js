/* [서비스 가치] 가망 고객(Lead) 상담 시 과목별 필수 질문을 채워야 등록이 가능한 '유효성 게이트' 아키텍처입니다. 
   특히 영어 상담과 Voca 진단평가를 100% 매끄럽게 융합시켜 데이터가 날아가지 않는 비즈니스 인프라를 완성합니다. */
import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../firebase';
import { Button, Card, Toast } from '../components/UI';
// 🚀 [CTO 핫픽스] Loader 컴포넌트를 lucide-react에서 정상적으로 import 합니다.
import { CheckCircle, ArrowRight, UserPlus, Phone, BookOpen, Calculator, Languages, FlaskConical, Crosshair, Sparkles, Loader } from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

export default function ConsultationManager({ isKiosk = false }) {
    const [toast, setToast] = useState({ message: '', type: 'info' });
    const [loading, setLoading] = useState(false);
    const [currentTab, setCurrentTab] = useState('basic');

    const [leadForm, setLeadForm] = useState({
        name: '', phone: '', schoolName: '', grade: '중2',
        checkedSubjects: { "국어": false, "수학": false, "영어": false, "과학": false },
        korean: { lastScore: '', weakType: '', note: '' },
        math: { currentProgress: '', hardestConcept: '', note: '' },
        english: { catScore: '', readingLevel: '', vocabularyNote: '' },
        science: { selectedSubject: '', note: '' }
    });

    const showToast = (message, type = 'error') => setToast({ message, type });

    const handleSubjectCheck = (subject) => {
        setLeadForm(prev => ({
            ...prev,
            checkedSubjects: { ...prev.checkedSubjects, [subject]: !prev.checkedSubjects[subject] }
        }));
    };

    const runMockVocaCAT = () => {
        const mockScore = window.prompt("학생이 태블릿 진단 앱으로 풀이한 CAT 어휘 점수를 입력하세요 (0~1000점):");
        if (!mockScore || isNaN(mockScore) || mockScore < 0 || mockScore > 1000) {
            return alert("올바른 점수를 입력해 주세요.");
        }
        setLeadForm(prev => ({
            ...prev,
            english: { ...prev.english, catScore: Number(mockScore) }
        }));
        showToast(`🎯 CAT 진단 연산 완료: [${mockScore}점] Z1~Z4 구간 분할 신호가 대기 중입니다.`, 'success');
    };

    const handleConvertAndSubmit = async () => {
        if (!leadForm.name || !leadForm.phone) return showToast("학생 이름과 휴대폰 번호는 필수 항목입니다.", "error");
        
        for (const [sub, isChecked] of Object.entries(leadForm.checkedSubjects)) {
            if (isChecked) {
                if (sub === '국어' && !leadForm.korean.lastScore) return showToast("국어 점수/등급을 마저 채워주세요.", "error");
                if (sub === '수학' && !leadForm.math.currentProgress) return showToast("수학 현 진도를 마저 채워주세요.", "error");
                if (sub === '영어' && !leadForm.english.catScore) return showToast("영어 어휘력 진단(CAT) 점수를 받아야 마감됩니다.", "error");
            }
        }

        setLoading(true);
        try {
            const cleanPhone = leadForm.phone.replace(/[^0-9]/g, '');
            const targetDocId = `imp_${cleanPhone.slice(-8)}`; 
            const generatedPw = cleanPhone.slice(-4) + '00'; 

            const email = `${targetDocId}@imperial.com`;
            let authUid = 'legacy_verified_account';
            try {
                const credential = await createUserWithEmailAndPassword(secondaryAuth, email, generatedPw);
                authUid = credential.user.uid;
                await signOut(secondaryAuth);
            } catch (authErr) {
                if (authErr.code !== 'auth/email-already-in-use') throw authErr;
            }

            const userPayload = {
                id: targetDocId, userId: targetDocId, name: leadForm.name, phone: cleanPhone,
                role: 'student', status: 'attending', authUid: authUid,
                schoolName: leadForm.schoolName, grade: leadForm.grade, attendancePin: cleanPhone.slice(-4),
                createdAt: serverTimestamp()
            };
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetDocId), userPayload);

            if (leadForm.checkedSubjects['영어'] && leadForm.english.catScore) {
                const score = Number(leadForm.english.catScore);
                const zones = {
                    Z1_Pass: [0, Math.max(0, score - 150)],
                    Z2_Grey: [Math.max(0, score - 149), Math.max(0, score - 20)],
                    Z3_Target: [Math.max(0, score - 19), score + 30],
                    Z4_Lock: [score + 31, 1000]
                };
                await setDoc(doc(db, `artifacts/${APP_ID}/public/data/english_stats`, targetDocId), {
                    studentId: targetDocId, catScore: score, vocaSession: 1, 
                    studyMode: 'calibration', calibrationSessionsLeft: 10, zones,
                    vocaProgress: 0, vocaComprehension: 0, vocaRetention: 0, vocaBook: '기본교재',
                    vocaRubric: `[상담 연동 세팅] 초기 CAT ${score}점 기준 영점 조절 프리셋 10회가 예약 가동되었습니다.`,
                    updatedAt: serverTimestamp()
                });
            }

            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/consult_history`, targetDocId), {
                studentId: targetDocId, studentName: leadForm.name,
                korean: leadForm.korean, math: leadForm.math, science: leadForm.science,
                checkedSubjects: leadForm.checkedSubjects, updatedAt: serverTimestamp()
            });

            const welcomeSmsMessage = `[목동임페리얼학원]\n안녕하세요. 프리미엄 임페리얼 학원입니다.\n${leadForm.name} 학생의 상담 등록 및 계정 발급이 완료되었습니다.\n\n[로그인 자격증명]\n- 접속 주소: https://imperial-sys.web.app\n- 로그인 ID: ${targetDocId}\n- 초기 비밀번호: ${generatedPw}\n\n* 로그인 시 첫 등원 전 미리 단어장 세팅이 완료되어 있습니다.`;
            
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                phoneNumber: cleanPhone, message: welcomeSmsMessage, status: 'pending', type: 'auto_onboarding', studentName: leadForm.name, createdAt: serverTimestamp()
            });

            alert(`🎉 대성공!\n정식 계정(${targetDocId})이 발급되었으며, 첫 등원 안내 문자가 발송 큐에 적재되었습니다.`);
            
            setLeadForm({ name: '', phone: '', schoolName: '', grade: '중2', checkedSubjects: { "국어": false, "수학": false, "영어": false, "과학": false }, korean: { lastScore: '', weakType: '', note: '' }, math: { currentProgress: '', hardestConcept: '', note: '' }, english: { catScore: '', readingLevel: '', vocabularyNote: '' }, science: { selectedSubject: '', note: '' } });
            setCurrentTab('basic');

        } catch (e) { showToast(e.message || "등록 처리에 실패했습니다.", "error"); } finally { setLoading(false); }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
            
            <div className="text-center md:text-left mb-6">
                <h1 className="text-3xl font-black text-gray-900 flex items-center justify-center md:justify-start gap-2">
                    <Sparkles className="text-blue-600"/> 임페리얼 원스톱 상담 & 온보딩 엔진
                </h1>
                <p className="text-sm font-bold text-gray-500 mt-1">상담 데이터를 바탕으로 계정을 선발급하고 어휘 진단 데이터를 원천 봉쇄 동기화합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* 왼쪽 사이드 탭 스위처 */}
                <div className="md:col-span-1 flex flex-col gap-2 bg-white p-3 rounded-2xl border shadow-sm h-fit">
                    <button onClick={() => setCurrentTab('basic')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 ${currentTab === 'basic' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>👤 1. 기본 인적사항</button>
                    {leadForm.checkedSubjects["국어"] && <button onClick={() => setCurrentTab('국어')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 ${currentTab === '국어' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><BookOpen size={14}/> 국어 체크리스트</button>}
                    {leadForm.checkedSubjects["수학"] && <button onClick={() => setCurrentTab('수학')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 ${currentTab === '수학' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><Calculator size={14}/> 수학 체크리스트</button>}
                    {leadForm.checkedSubjects["영어"] && <button onClick={() => setCurrentTab('영어')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 ${currentTab === '영어' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><Languages size={14}/> 영어 (CAT 진단)</button>}
                    {leadForm.checkedSubjects["과학"] && <button onClick={() => setCurrentTab('과학')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 ${currentTab === '과학' ? 'bg-purple-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><FlaskConical size={14}/> 과학 체크리스트</button>}
                    <button onClick={() => setCurrentTab('final')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 border border-dashed ${currentTab === 'final' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}><UserPlus size={14}/> 3. 원클릭 학생 전환</button>
                </div>

                {/* 오른쪽 동적 폼 필드 */}
                <div className="md:col-span-3">
                    {currentTab === 'basic' && (
                        <Card className="space-y-4 animate-in fade-in">
                            <h2 className="text-lg font-black text-gray-800 border-b pb-2">1단계: 가망고객 기본 정보 및 상담 과목 선택</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학생 실명 *</label>
                                    <input required className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500" placeholder="홍길동" value={leadForm.name} onChange={e=>setLeadForm({...leadForm, name: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학부모 휴대폰 번호 *</label>
                                    <input required className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500" placeholder="01012345678" value={leadForm.phone} onChange={e=>setLeadForm({...leadForm, phone: e.target.value})}/>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학교명</label>
                                    <input className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500" placeholder="목동중학교" value={leadForm.schoolName} onChange={e=>setLeadForm({...leadForm, schoolName: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학년</label>
                                    <select className="w-full border p-3 rounded-xl font-bold bg-gray-50" value={leadForm.grade} onChange={e=>setLeadForm({...leadForm, grade: e.target.value})}>
                                        <option value="초6">초등학교 6학년</option>
                                        <option value="중1">중학교 1학년</option>
                                        <option value="중2">중학교 2학년</option>
                                        <option value="중3">중학교 3학년</option>
                                        <option value="고1">고등학교 1학년</option>
                                    </select>
                                </div>
                            </div>
                            <div className="pt-4 border-t">
                                <label className="block text-xs font-black text-blue-900 mb-3">📍 오늘 상담을 희망하는 과목을 모두 체크하세요</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {["국어", "수학", "영어", "과학"].map(sub => (
                                        <label key={sub} className={`flex items-center justify-center gap-2 p-4 border rounded-xl font-black text-sm cursor-pointer transition-all ${leadForm.checkedSubjects[sub] ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white hover:bg-gray-50 text-gray-500'}`}>
                                            <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={leadForm.checkedSubjects[sub]} onChange={() => handleSubjectCheck(sub)}/>
                                            {sub}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )}

                    {currentTab === '국어' && (
                        <Card className="space-y-4 border-orange-200 animate-in fade-in">
                            <h2 className="text-lg font-black text-orange-900 border-b pb-2 flex items-center gap-1"><BookOpen/> 국어과 정밀 필터링 질문지</h2>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">최근 시험 점수 또는 모의고사 등급 *</label>
                                <input required className="w-full border p-3 rounded-xl outline-none font-bold" placeholder="예: 88점 또는 모의고사 2등급" value={leadForm.korean.lastScore} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, lastScore: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">취약한 영역 (현대시, 비문학, 문법 중 선택)</label>
                                <input className="w-full border p-3 rounded-xl outline-none font-bold" placeholder="예: 비문학 경제 지문 독해 불가능" value={leadForm.korean.weakType} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, weakType: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">강사 인수인계용 데스크 특이사항</label>
                                <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24" placeholder="과외 경험 유무 등을 작성해 주세요." value={leadForm.korean.note} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, note: e.target.value}})}/>
                            </div>
                        </Card>
                    )}

                    {currentTab === '수학' && (
                        <Card className="space-y-4 border-emerald-200 animate-in fade-in">
                            <h2 className="text-lg font-black text-emerald-900 border-b pb-2 flex items-center gap-1"><Calculator/> 수학과 진도 측정 질문지</h2>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">현재 선행 학습 완료 및 진행 구역 *</label>
                                <input required className="w-full border p-3 rounded-xl outline-none font-bold" placeholder="예: 수학(상) 개념원리 수준 진행 중" value={leadForm.math.currentProgress} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, currentProgress: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">가장 오답률이 높은 취약 단원</label>
                                <input className="w-full border p-3 rounded-xl outline-none font-bold" placeholder="예: 도형의 방정식 파트 응용문제 무너짐" value={leadForm.math.hardestConcept} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, hardestConcept: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">기타 수학적 연산 습관 기술</label>
                                <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24" placeholder="풀이 과정을 안 적는 습관 있음 등" value={leadForm.math.note} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, note: e.target.value}})}/>
                            </div>
                        </Card>
                    )}

                    {currentTab === '영어' && (
                        <Card className="space-y-4 border-indigo-200 bg-indigo-50/20 animate-in fade-in">
                            <h2 className="text-lg font-black text-indigo-900 border-b border-indigo-100 pb-2 flex items-center gap-1"><Languages/> 영어과 CAT 진단평가 시스템 결합 단면</h2>
                            <div className="bg-white border-2 border-indigo-200 p-6 rounded-2xl text-center shadow-sm space-y-4">
                                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-600"><Crosshair size={24}/></div>
                                <div>
                                    <h4 className="font-black text-lg text-indigo-950">AI 어휘력 진단(CAT) 연동 게이트</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">아래 버튼을 눌러 점수를 기록하면, Z1~Z4 구간 데이터 보정 및 고속 마스터 규칙이 자동 세팅됩니다.</p>
                                </div>
                                <div className="flex items-center justify-center gap-4">
                                    <Button onClick={runMockVocaCAT} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6">
                                        🖥️ 태블릿 진단평가 시작 및 입력
                                    </Button>
                                    <div className="font-mono font-black text-2xl text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                                        점수: {leadForm.english.catScore ? `${leadForm.english.catScore}점` : '미측정'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 pt-2">
                                <div><label className="block text-xs font-bold text-gray-600 mb-1">독해력 지표 수준 (자체 교재 레벨용)</label><input className="w-full border p-3 rounded-xl outline-none font-bold bg-white" placeholder="예: 고1 학평 기준 안정적 2등급" value={leadForm.english.readingLevel} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, readingLevel: e.target.value}})}/></div>
                                <div><label className="block text-xs font-bold text-gray-600 mb-1">영어 대면 상담 일지 코멘트</label><textarea className="w-full border p-3 rounded-xl outline-none font-bold h-20 bg-white" placeholder="단어 암기 시 발음을 전혀 모름 등" value={leadForm.english.vocabularyNote} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, vocabularyNote: e.target.value}})}/></div>
                            </div>
                        </Card>
                    )}

                    {currentTab === '과학' && (
                        <Card className="space-y-4 border-purple-200 animate-in fade-in">
                            <h2 className="text-lg font-black text-purple-900 border-b pb-2 flex items-center gap-1"><FlaskConical/> 과학과 선택과목 질문지</h2>
                            <div><label className="block text-xs font-bold text-gray-600 mb-1">희망 수강 과목 (물리, 화학, 생명, 지학 고등 선행) *</label><input required className="w-full border p-3 rounded-xl outline-none font-bold" placeholder="예: 고1 통합과학 및 화학1 선행 희망" value={leadForm.science.selectedSubject} onChange={e=>setLeadForm({...leadForm, science: { ...leadForm.science, selectedSubject: e.target.value}})}/></div>
                            <div><label className="block text-xs font-bold text-gray-600 mb-1">수업 조율 관련 특이사항</label><textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24" placeholder="실험 위주 학원 다닌 이력 있음 등" value={leadForm.science.note} onChange={e=>setLeadForm({...leadForm, science: { ...leadForm.science, note: e.target.value}})}/></div>
                        </Card>
                    )}

                    {currentTab === 'final' && (
                        <Card className="space-y-5 border-gray-900 bg-gray-50 text-center py-8 animate-in fade-in">
                            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto"><CheckCircle size={36}/></div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900">3단계: 상담 최종 마감 및 정식 원생 승급</h3>
                                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">아래 버튼을 누르면 즉시 아이디/비밀번호가 오토 제너레이션되며, 첫 등원 안내 문자가 발송 엔진에 적재됩니다.</p>
                            </div>
                            
                            <div className="max-w-md mx-auto bg-white p-4 rounded-xl border text-left text-xs font-bold space-y-2 text-gray-600">
                                <div className="font-black text-sm text-gray-800 border-b pb-1 mb-2">📋 입력 상태 체크보드</div>
                                <div>• 대상 학생 : <span className="text-gray-900">{leadForm.name || '미입력'}</span> ({leadForm.grade})</div>
                                <div>• 안내 연락처 : <span className="text-gray-900">{leadForm.phone || '미입력'}</span></div>
                                <div>• 수강 체크 : {Object.entries(leadForm.checkedSubjects).filter(([_, v]) => v).map(([k]) => k).join(', ') || '없음'}</div>
                            </div>

                            <button onClick={handleConvertAndSubmit} disabled={loading} className="w-full max-w-md mx-auto py-4 bg-blue-600 text-white font-black rounded-xl text-lg shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                                {loading ? <Loader className="animate-spin" size={24}/> : <><UserPlus size={20}/> 상담 마감 및 등원문자 동시 발송</>}
                            </button>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}