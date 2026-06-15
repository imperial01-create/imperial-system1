/* [서비스 가치] 신규 원생 온보딩 및 자동 계정 생성 시스템
   (🚀 CTO 패치: 클라이언트 사이드 CAT 모듈 완전 제거 및 수동 점수 입력 방식으로 전환하여 보안 무결성 확보) */
import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../firebase';
import { Button, Card, Toast } from '../components/UI';
import { CheckCircle, ArrowRight, UserPlus, Phone, BookOpen, Calculator, Languages, FlaskConical, Sparkles, Loader } from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

export default function ConsultationManager({ isKiosk = false }) {
    const [toast, setToast] = useState({ message: '', type: 'info' });
    const [loading, setLoading] = useState(false);
    const [currentTab, setCurrentTab] = useState('basic');

    const [leadForm, setLeadForm] = useState({
        name: '', phone: '', schoolName: '', 
        schoolType: '중등', gradeLevel: '2', 
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

    const handleConvertAndSubmit = async () => {
        if (!leadForm.name || !leadForm.phone) return showToast("학생 이름과 휴대폰 번호는 필수 항목입니다.", "error");
        
        for (const [sub, isChecked] of Object.entries(leadForm.checkedSubjects)) {
            if (isChecked) {
                if (sub === '국어' && !leadForm.korean.lastScore) return showToast("국어 점수/등급을 마저 채워주세요.", "error");
                if (sub === '수학' && !leadForm.math.currentProgress) return showToast("수학 현 진도를 마저 채워주세요.", "error");
                if (sub === '영어' && !leadForm.english.catScore) return showToast("영어 어휘력 진단 점수를 입력해야 마감됩니다.", "error");
            }
        }

        setLoading(true);
        try {
            const cleanPhone = leadForm.phone.replace(/[^0-9]/g, '');
            const targetDocId = `imp_${cleanPhone.slice(-8)}`; 
            const generatedPw = cleanPhone.slice(-4) + '00'; 
            const mergedGrade = `${leadForm.schoolType} ${leadForm.gradeLevel}학년`; 

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
                schoolName: leadForm.schoolName, grade: mergedGrade, attendancePin: cleanPhone.slice(-4),
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
                    vocaProgress: 0, vocaComprehension: 0, vocaRetention: 0, vocaBook: '능률VOCA수능고난도', 
                    vocaRubric: `[상담 연동 세팅] 초기 진단평가 ${score}점 기준 영점 조절 프리셋 10회가 예약 가동되었습니다.`,
                    updatedAt: serverTimestamp()
                });
            }

            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/consult_history`, targetDocId), {
                studentId: targetDocId, studentName: leadForm.name,
                korean: leadForm.korean, math: leadForm.math, science: leadForm.science,
                checkedSubjects: leadForm.checkedSubjects, updatedAt: serverTimestamp()
            });

            const welcomeSmsMessage = `[목동임페리얼학원]\n안녕하세요. 프리미엄 임페리얼 학원입니다.\n${leadForm.name} 학생의 상담 등록 및 계정 발급이 완료되었습니다.\n\n[로그인 자격증명]\n- 접속 주소: https://imperial-sys.web.app\n- 로그인 ID: ${targetDocId}\n- 초기 비밀번호: ${generatedPw}\n\n* 로그인 시 첫 등원 전 맞춤 단어장 세팅이 이미 완료되어 있습니다.`;
            
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                phoneNumber: cleanPhone, message: welcomeSmsMessage, status: 'pending', type: 'auto_onboarding', studentName: leadForm.name, createdAt: serverTimestamp()
            });

            alert(`🎉 대성공!\n정식 계정(${targetDocId})이 발급되었으며, 첫 등원 안내 문자가 발송 큐에 적재되었습니다.`);
            
            setLeadForm({ name: '', phone: '', schoolName: '', schoolType: '중등', gradeLevel: '2', checkedSubjects: { "국어": false, "수학": false, "영어": false, "과학": false }, korean: { lastScore: '', weakType: '', note: '' }, math: { currentProgress: '', hardestConcept: '', note: '' }, english: { catScore: '', readingLevel: '', vocabularyNote: '' }, science: { selectedSubject: '', note: '' } });
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
                <p className="text-sm font-bold text-gray-500 mt-1">상담 데이터를 바탕으로 계정을 선발급하고 어휘 진단 데이터를 원천 동기화합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1 flex flex-col gap-2 bg-white p-3 rounded-2xl border shadow-sm h-fit">
                    <button onClick={() => setCurrentTab('basic')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${currentTab === 'basic' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}>👤 1. 기본 인적사항</button>
                    {leadForm.checkedSubjects["국어"] && <button onClick={() => setCurrentTab('국어')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${currentTab === '국어' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><BookOpen size={14}/> 국어 체크리스트</button>}
                    {leadForm.checkedSubjects["수학"] && <button onClick={() => setCurrentTab('수학')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${currentTab === '수학' ? 'bg-emerald-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><Calculator size={14}/> 수학 체크리스트</button>}
                    {leadForm.checkedSubjects["영어"] && <button onClick={() => setCurrentTab('영어')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${currentTab === '영어' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><Languages size={14}/> 영어 체크리스트</button>}
                    {leadForm.checkedSubjects["과학"] && <button onClick={() => setCurrentTab('과학')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 transition-all ${currentTab === '과학' ? 'bg-purple-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}><FlaskConical size={14}/> 과학 체크리스트</button>}
                    <button onClick={() => setCurrentTab('final')} className={`p-3 rounded-xl font-black text-xs text-left flex items-center gap-2 border border-dashed transition-all mt-4 ${currentTab === 'final' ? 'bg-gray-900 text-white shadow-md border-transparent' : 'text-gray-700 hover:bg-gray-50 border-gray-300'}`}><UserPlus size={14}/> 3. 원클릭 학생 전환</button>
                </div>

                <div className="md:col-span-3">
                    {currentTab === 'basic' && (
                        <Card className="space-y-4 animate-in fade-in">
                            <h2 className="text-lg font-black text-gray-800 border-b pb-2">1단계: 가망고객 기본 정보 및 상담 과목 선택</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학생 실명 *</label>
                                    <input required className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500 transition-all" placeholder="홍길동" value={leadForm.name} onChange={e=>setLeadForm({...leadForm, name: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학부모 휴대폰 번호 *</label>
                                    <input required className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500 transition-all" placeholder="01012345678" value={leadForm.phone} onChange={e=>setLeadForm({...leadForm, phone: e.target.value})}/>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학교명</label>
                                    <input className="w-full border p-3 rounded-xl outline-none font-bold bg-gray-50 focus:bg-white focus:border-blue-500 transition-all" placeholder="목동중학교" value={leadForm.schoolName} onChange={e=>setLeadForm({...leadForm, schoolName: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">학교급 및 학년 *</label>
                                    <div className="flex gap-2">
                                        <select className="w-1/2 border p-3 rounded-xl font-bold bg-gray-50 outline-none focus:border-blue-500" value={leadForm.schoolType} onChange={e=>{
                                            const newType = e.target.value;
                                            let newGrade = leadForm.gradeLevel;
                                            if (newType !== '초등' && Number(newGrade) > 3) newGrade = '1';
                                            setLeadForm({...leadForm, schoolType: newType, gradeLevel: newGrade});
                                        }}>
                                            <option value="초등">초등학교</option>
                                            <option value="중등">중학교</option>
                                            <option value="고등">고등학교</option>
                                        </select>
                                        <select className="w-1/2 border p-3 rounded-xl font-bold bg-gray-50 outline-none focus:border-blue-500" value={leadForm.gradeLevel} onChange={e=>setLeadForm({...leadForm, gradeLevel: e.target.value})}>
                                            <option value="1">1학년</option>
                                            <option value="2">2학년</option>
                                            <option value="3">3학년</option>
                                            {leadForm.schoolType === '초등' && (
                                                <>
                                                    <option value="4">4학년</option>
                                                    <option value="5">5학년</option>
                                                    <option value="6">6학년</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-xs font-black text-blue-900 mb-3">📍 오늘 상담을 희망하는 과목을 모두 체크하세요</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {["국어", "수학", "영어", "과학"].map(sub => (
                                        <label key={sub} className={`flex items-center justify-center gap-2 p-4 border rounded-xl font-black text-sm cursor-pointer transition-all active:scale-95 ${leadForm.checkedSubjects[sub] ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-sm' : 'bg-white hover:bg-gray-50 text-gray-500 border-gray-200'}`}>
                                            <input type="checkbox" className="accent-blue-600 h-4 w-4" checked={leadForm.checkedSubjects[sub]} onChange={() => handleSubjectCheck(sub)}/>
                                            {sub}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    )}

                    {currentTab === '국어' && (
                        <Card className="space-y-4 border-2 border-orange-100 animate-in fade-in slide-in-from-right-4">
                            <h2 className="text-lg font-black text-orange-900 border-b border-orange-100 pb-2 flex items-center gap-2"><BookOpen className="text-orange-500"/> 국어과 정밀 필터링 질문지</h2>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">최근 시험 점수 또는 모의고사 등급 *</label>
                                <input required className="w-full border p-3 rounded-xl outline-none font-bold focus:border-orange-400 focus:bg-orange-50/30 transition-all" placeholder="예: 88점 또는 모의고사 2등급" value={leadForm.korean.lastScore} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, lastScore: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">취약한 영역 (현대시, 비문학, 문법 중 선택)</label>
                                <input className="w-full border p-3 rounded-xl outline-none font-bold focus:border-orange-400 focus:bg-orange-50/30 transition-all" placeholder="예: 비문학 경제 지문 독해 불가능" value={leadForm.korean.weakType} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, weakType: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">강사 인수인계용 데스크 특이사항</label>
                                <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 focus:border-orange-400 focus:bg-orange-50/30 transition-all resize-none" placeholder="과외 경험 유무 등을 작성해 주세요." value={leadForm.korean.note} onChange={e=>setLeadForm({...leadForm, korean: { ...leadForm.korean, note: e.target.value}})}/>
                            </div>
                        </Card>
                    )}

                    {currentTab === '수학' && (
                        <Card className="space-y-4 border-2 border-emerald-100 animate-in fade-in slide-in-from-right-4">
                            <h2 className="text-lg font-black text-emerald-900 border-b border-emerald-100 pb-2 flex items-center gap-2"><Calculator className="text-emerald-500"/> 수학과 진도 측정 질문지</h2>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">현재 선행 학습 완료 및 진행 구역 *</label>
                                <input required className="w-full border p-3 rounded-xl outline-none font-bold focus:border-emerald-400 focus:bg-emerald-50/30 transition-all" placeholder="예: 수학(상) 개념원리 수준 진행 중" value={leadForm.math.currentProgress} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, currentProgress: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">가장 오답률이 높은 취약 단원</label>
                                <input className="w-full border p-3 rounded-xl outline-none font-bold focus:border-emerald-400 focus:bg-emerald-50/30 transition-all" placeholder="예: 도형의 방정식 파트 응용문제 무너짐" value={leadForm.math.hardestConcept} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, hardestConcept: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">기타 수학적 연산 습관 기술</label>
                                <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 focus:border-emerald-400 focus:bg-emerald-50/30 transition-all resize-none" placeholder="풀이 과정을 안 적는 습관 있음 등" value={leadForm.math.note} onChange={e=>setLeadForm({...leadForm, math: { ...leadForm.math, note: e.target.value}})}/>
                            </div>
                        </Card>
                    )}

                    {/* 🚀 [CTO 패치] 영어 탭: CAT 진단 모듈 완전 삭제 및 수동 점수 입력 폼으로 변경 */}
                    {currentTab === '영어' && (
                        <Card className="space-y-4 border-2 border-indigo-200 bg-indigo-50/30 animate-in fade-in slide-in-from-right-4">
                            <h2 className="text-lg font-black text-indigo-900 border-b border-indigo-200 pb-2 flex items-center gap-2"><Languages className="text-indigo-600"/> 영어과 진단평가 기록지</h2>
                            
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">영어 진단평가 점수 (수동 입력) *</label>
                                    <input required type="number" className="w-full border p-3 rounded-xl outline-none font-bold bg-white focus:border-indigo-400 transition-all" placeholder="예: 85 (숫자만 입력)" value={leadForm.english.catScore} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, catScore: e.target.value}})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">독해력 지표 수준 (자체 교재 레벨용)</label>
                                    <input className="w-full border p-3 rounded-xl outline-none font-bold bg-white focus:border-indigo-400 transition-all" placeholder="예: 고1 학평 기준 안정적 2등급" value={leadForm.english.readingLevel} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, readingLevel: e.target.value}})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">영어 대면 상담 일지 코멘트</label>
                                    <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 bg-white focus:border-indigo-400 transition-all resize-none" placeholder="단어 암기 시 발음을 전혀 모름 등" value={leadForm.english.vocabularyNote} onChange={e=>setLeadForm({...leadForm, english: { ...leadForm.english, vocabularyNote: e.target.value}})}/>
                                </div>
                            </div>
                        </Card>
                    )}

                    {currentTab === '과학' && (
                        <Card className="space-y-4 border-2 border-purple-100 animate-in fade-in slide-in-from-right-4">
                            <h2 className="text-lg font-black text-purple-900 border-b border-purple-100 pb-2 flex items-center gap-2"><FlaskConical className="text-purple-500"/> 과학과 선택과목 질문지</h2>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">희망 수강 과목 (물리, 화학, 생명, 지학 고등 선행) *</label>
                                <input required className="w-full border p-3 rounded-xl outline-none font-bold focus:border-purple-400 focus:bg-purple-50/30 transition-all" placeholder="예: 고1 통합과학 및 화학1 선행 희망" value={leadForm.science.selectedSubject} onChange={e=>setLeadForm({...leadForm, science: { ...leadForm.science, selectedSubject: e.target.value}})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">수업 조율 관련 특이사항</label>
                                <textarea className="w-full border p-3 rounded-xl outline-none font-bold h-24 focus:border-purple-400 focus:bg-purple-50/30 transition-all resize-none" placeholder="실험 위주 학원 다닌 이력 있음 등" value={leadForm.science.note} onChange={e=>setLeadForm({...leadForm, science: { ...leadForm.science, note: e.target.value}})}/>
                            </div>
                        </Card>
                    )}

                    {currentTab === 'final' && (
                        <Card className="space-y-6 border-2 border-gray-900 bg-gray-50 text-center py-10 animate-in fade-in slide-in-from-right-4 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gray-900"></div>
                            
                            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner border border-blue-200">
                                <CheckCircle size={40}/>
                            </div>
                            
                            <div>
                                <h3 className="text-2xl font-black text-gray-900">3단계: 상담 최종 마감 및 정식 원생 승급</h3>
                                <p className="text-sm font-bold text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
                                    아래 버튼을 누르면 즉시 아이디와 비밀번호가 <span className="text-blue-600">자동 발급(Auto-generation)</span>되며, 
                                    학부모님께 첫 등원 가이드 문자가 자동 발송됩니다.
                                </p>
                            </div>
                            
                            <div className="max-w-md mx-auto bg-white p-5 rounded-2xl border text-left text-sm font-bold space-y-3 text-gray-600 shadow-sm">
                                <div className="font-black text-base text-gray-800 border-b pb-2 mb-3 flex items-center gap-2"><CheckCircle size={18} className="text-emerald-500"/> 입력 상태 체크보드</div>
                                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg"><span>• 대상 학생</span> <span className="text-gray-900 font-black">{leadForm.name || '미입력'} ({leadForm.schoolType} {leadForm.gradeLevel}학년)</span></div>
                                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg"><span>• 안내 연락처</span> <span className="text-gray-900 font-black">{leadForm.phone || '미입력'}</span></div>
                                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg"><span>• 상담 과목</span> <span className="text-blue-600 font-black">{Object.entries(leadForm.checkedSubjects).filter(([_, v]) => v).map(([k]) => k).join(', ') || '없음'}</span></div>
                                {leadForm.checkedSubjects['영어'] && (
                                    <div className="flex justify-between items-center bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                                        <span className="text-indigo-800">• 어휘 진단 점수</span> 
                                        <span className={leadForm.english.catScore ? 'text-indigo-600 font-black' : 'text-rose-500 font-black'}>{leadForm.english.catScore ? `${leadForm.english.catScore}점 측정완료` : '미입력 (필수)'}</span>
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={handleConvertAndSubmit} 
                                disabled={loading} 
                                className="w-full max-w-md mx-auto py-5 bg-gray-900 text-white font-black rounded-2xl text-xl shadow-[0_10px_20px_rgba(0,0,0,0.2)] hover:bg-black hover:-translate-y-1 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:bg-gray-400 disabled:transform-none disabled:shadow-none"
                            >
                                {loading ? <Loader className="animate-spin" size={28}/> : <><UserPlus size={24}/> 정식 등록 및 등원문자 발송</>}
                            </button>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}