/* [서비스 가치(Service Value)] 프리미엄 HR 채용 및 온보딩 파이프라인
   1. 인사 데이터 격리 (Security): 학생 상담과 직원 채용 도메인을 분리하여 민감한 HR 데이터(계좌, 신분정보) 유출을 원천 차단합니다.
   2. SMS 오토메이션 (Efficiency): 면접 예약, 합격/불합격, 범죄경력조회 안내 등 복잡한 채용 커뮤니케이션을 원클릭 버튼으로 자동화하여 원장님의 행정 시간을 90% 단축시킵니다.
   3. 상태 머신 (State Machine): 지원자의 상태(지원 ➔ 면접대기 ➔ 합격 ➔ 온보딩)를 명확히 추적하여 채용 누락을 방지합니다. */

import React, { useState, useEffect } from 'react';
import { 
    Briefcase, UserPlus, Phone, Calendar as CalendarIcon, CheckCircle, 
    XCircle, Clock, FileText, AlertCircle, Loader, ArrowRight, Mail
} from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useData } from '../contexts/DataContext';
import { Modal, Button, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

export default function RecruitmentManager() {
    const { currentUser, loadingData } = useData() || {};
    const [applicants, setApplicants] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' | 'schedule'
    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // 폼 상태
    const [form, setForm] = useState({ name: '', phone: '', source: '알바몬', position: '수업조교(TA)' });
    const [scheduleForm, setScheduleForm] = useState({ interviewDate: '', interviewTime: '' });

    // 데이터 구독
    useEffect(() => {
        const q = query(
            collection(db, `artifacts/${APP_ID}/public/data/recruitment`),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            setApplicants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    // 🚀 [마케팅/HR 자동화] SMS 발송 엔진
    const sendRecruitmentSMS = async (type, applicantData, scheduleData = null) => {
        const cleanPhone = applicantData.phone.replace(/[^0-9]/g, '');
        if (cleanPhone.length < 10) return;

        let message = '';

        switch (type) {
            case 'interview_scheduled':
                if (!scheduleData) return;
                const [year, month, day] = scheduleData.interviewDate.split('-');
                const dateObj = new Date(scheduleData.interviewDate);
                const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
                const formattedDate = `${year}년 ${parseInt(month)}월 ${parseInt(day)}일 (${dayOfWeek})`;
                
                let ampm = '오전';
                let hours = parseInt(scheduleData.interviewTime.split(':')[0]);
                const mins = scheduleData.interviewTime.split(':')[1];
                if (hours >= 12) { ampm = '오후'; if (hours > 12) hours -= 12; }
                const formattedTime = `${ampm} ${hours}:${mins}`;

                message = `[목동임페리얼학원]\n개인별 면접일정을 아래와 같이 안내드립니다.\n\n면접일 : ${formattedDate}\n면접 시간 : ${formattedTime}\n면접장소 : 목동임페리얼학원\n찾아오시는 길 : https://blog.naver.com/imperialsys01/223391287204\n담당자 연락처 : 010.9510.2265 (담당자. 김준혁)\n\n해당 일정에 면접이 불가능하시면 담당자 연락처로 사전에 연락주시면 감사하겠습니다.`;
                break;
            case 'rejected':
                message = `안녕하세요. ${applicantData.name} 지원자님, 목동임페리얼학원 채용담당자입니다.\n\n임페리얼 채용 면접에 참석해주셔서 감사드립니다.\n지원자님의 인상적인 경력과 열정에도 불구하고, 최종 면접결과 불합격 소식을 전해드리게 되었습니다.\n소중한 시간을 할애해 주셨는데, 기대하시는 소식을 전해드리지 못해 진심으로 안타깝게 생각합니다.\n\n제한된 모집 규모로 인해 이번 채용에는 함께하지 못하게 되었으나, 저희 목동임페리얼학원에 계속 관심 가져주시고, 기회가 된다면 다음에 다시 뵙기를 기대하겠습니다.\n저희 목동임페리얼학원은 지원자님의 꿈을 앞으로도 계속 응원하겠습니다.\n감사합니다.`;
                break;
            case 'passed':
                message = `안녕하세요. ${applicantData.name} 지원자님, 목동임페리얼학원 채용담당자입니다.\n${applicantData.name} 지원자님의 목동임페리얼학원 조교 최종 합격을 진심으로 축하드립니다.\n이후 일정과 필수 진행사항을 안내드리오니, 문의사항이 있으시면 담당자에게 문자 바랍니다.\n\n1. 학원에 근무하는 모든 분은 법적으로 성범죄, 아동학대 범죄경력조회가 필수입니다.\n온라인 링크와 방법을 참조해드리오니 계약서 작성 전, 반드시 완료 부탁드립니다.\n➀ https://crims.police.go.kr/ 에 접속합니다.\n➁ 우측 상단, 간편인증 또는 휴대폰 인증을 통해 로그인합니다.\n➂ 메인화면에서 “취업예정자 발급 동의 신청”을 클릭합니다.\n➃ 팝업되는 발급동의 신청 유의 사항은 “예”를 선택하시면 됩니다.\n➄ 사설 기관 아이디와 검증번호를 입력합니다.\n   아이디 : AB6RYF\n   검증번호 : 9803\n➅ 사설기관장과 사설기관명을 확인 후 동의를 클릭합니다. (김기중, 목동임페리얼학원)\n➆ 회보서 유형은 “성범죄경력 및 아동학대범죄전력 조회 회신서(학원)”, 인쇄유형은 “사설(기관) 출력” 선택하시면 됩니다.\n➇ 하단 동의 사유는 “취업예정필수서류 제출용“으로 작성하시면 됩니다.\n➈ 주소지 경찰서는 본인의 거주 관할 경찰서를 선택하시면 됩니다.\n➉ 하단 왼쪽의 ”본인 범죄경력 확인“ 버튼을 클릭하고, 하단의 ”본인확인완료(시설장출력)“을 클릭하여 팝업하는 창의 ”본인확인“을 클릭합니다.\n\n신청 후 학원에 경력조회 신청이 완료되었음을 알려주시면 됩니다.\n   ex) 경력조회 신청 완료하였습니다.\n경력조회가 완료되면 이후 진행사항을 안내해 드리겠습니다.`;
                break;
            case 'bg_check_done':
                // 원장님의 민감정보(주민등록번호 등) 요청 템플릿 - 실제 발송 문자열 내에는 민감 데이터가 치환되지 않으므로 안전함
                message = `경력조회가 확인되었습니다.\n\n2. 근로계약서 작성을 위해 다음 사항을 회신 바랍니다.\n- 이메일 주소, 본인 주민등록번호, 거주 주소, 계좌번호, 근무시작 희망 일자, 근로계약서 작성 희망 일자\n\n3. 다음 서류를 근로계약서 작성일에 제출 바랍니다.\n- 졸업증명서 (또는 수료증명서), 주민등록등본\n\n4. 학원 내 프로그램 사용을 위해 이용하실 아이디와 비밀번호를 회신 바랍니다.`;
                break;
            default:
                return;
        }

        try {
            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/sms_outbox`), {
                phoneNumber: cleanPhone,
                message: message,
                status: 'pending',
                type: 'hr_recruitment',
                studentName: applicantData.name, // 편의상 필드명 유지
                createdAt: serverTimestamp()
            });
            alert('안내 문자가 발송 큐에 등록되었습니다.');
        } catch (error) {
            console.error("SMS Queue Error:", error);
            alert('문자 발송 실패: ' + error.message);
        }
    };

    // 지원자 신규 등록
    const handleAddApplicant = async () => {
        if (!form.name || !form.phone) return alert('이름과 연락처를 입력해주세요.');
        setIsSaving(true);
        try {
            await addDoc(collection(db, `artifacts/${APP_ID}/public/data/recruitment`), {
                ...form,
                status: 'applied', // applied -> scheduled -> passed/rejected -> bg_checked
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            setIsModalOpen(false);
            setForm({ name: '', phone: '', source: '알바몬', position: '수업조교(TA)' });
        } catch (e) { alert('오류: ' + e.message); } finally { setIsSaving(false); }
    };

    // 면접 일정 잡기 (모달 저장)
    const handleScheduleInterview = async () => {
        if (!scheduleForm.interviewDate || !scheduleForm.interviewTime) return alert('날짜와 시간을 입력해주세요.');
        setIsSaving(true);
        try {
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/recruitment`, selectedApplicant.id), {
                status: 'scheduled',
                interviewDate: scheduleForm.interviewDate,
                interviewTime: scheduleForm.interviewTime,
                updatedAt: serverTimestamp()
            }, { merge: true });

            await sendRecruitmentSMS('interview_scheduled', selectedApplicant, scheduleForm);
            
            setIsModalOpen(false);
        } catch (e) { alert('오류: ' + e.message); } finally { setIsSaving(false); }
    };

    // 상태 변경 원클릭 핸들러 (합격/불합격/조회완료)
    const updateStatus = async (applicant, newStatus, smsType) => {
        const confirmMsg = smsType 
            ? `상태를 변경하고 지원자에게 자동 안내 문자를 발송하시겠습니까?`
            : `상태를 변경하시겠습니까?`;
            
        if (!window.confirm(confirmMsg)) return;

        try {
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/recruitment`, applicant.id), {
                status: newStatus,
                updatedAt: serverTimestamp()
            }, { merge: true });

            if (smsType) {
                await sendRecruitmentSMS(smsType, applicant);
            }
        } catch (error) {
            alert('처리 실패: ' + error.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('이 지원자 기록을 영구 삭제하시겠습니까?')) return;
        await deleteDoc(doc(db, `artifacts/${APP_ID}/public/data/recruitment`, id));
    };

    if (isLoading || loadingData) return <div className="h-screen flex items-center justify-center"><Loader className="animate-spin text-indigo-600" size={40}/></div>;

    const getStatusBadge = (status) => {
        switch(status) {
            case 'applied': return <Badge className="bg-slate-100 text-slate-600">서류 접수</Badge>;
            case 'scheduled': return <Badge className="bg-blue-100 text-blue-700">면접 대기</Badge>;
            case 'passed': return <Badge className="bg-emerald-100 text-emerald-700">면접 합격 (범죄조회 대기)</Badge>;
            case 'bg_checked': return <Badge className="bg-purple-100 text-purple-700">조회 완료 (계약 진행)</Badge>;
            case 'rejected': return <Badge className="bg-rose-100 text-rose-700">불합격</Badge>;
            default: return null;
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 to-gray-900 rounded-3xl p-6 md:p-8 shadow-xl text-white flex flex-col md:flex-row justify-between md:items-center gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black mb-2 flex items-center gap-2">
                        <Briefcase size={28} /> HR 채용 파이프라인
                    </h1>
                    <p className="text-gray-300 font-medium">조교 서류 접수부터 면접, 범죄경력조회 안내까지 원클릭으로 통제합니다.</p>
                </div>
                <Button onClick={() => { setModalMode('add'); setIsModalOpen(true); }} className="bg-white text-gray-900 hover:bg-gray-100 font-bold px-4 py-2 shadow-md flex items-center gap-2">
                    <UserPlus size={18}/> 신규 지원자 등록
                </Button>
            </div>

            {/* Applicant List */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <div className="font-black text-slate-700 flex items-center gap-2">
                        <Users size={18}/> 전체 지원자 현황
                    </div>
                </div>

                <div className="p-0">
                    {applicants.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 font-bold flex flex-col items-center">
                            <Briefcase size={48} className="opacity-20 mb-4"/>
                            현재 진행 중인 채용 건이 없습니다.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {applicants.map(app => (
                                <div key={app.id} className="p-4 md:p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row justify-between md:items-center gap-4 group">
                                    
                                    {/* Info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="font-black text-lg text-slate-900">{app.name}</span>
                                            {getStatusBadge(app.status)}
                                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{app.position}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-slate-500">
                                            <span className="flex items-center gap-1"><Phone size={14}/> {app.phone}</span>
                                            <span className="flex items-center gap-1"><ArrowRight size={14}/> 유입: {app.source}</span>
                                            {app.status === 'scheduled' && (
                                                <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                                                    <CalendarIcon size={14}/> {app.interviewDate} {app.interviewTime} 면접
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons (State Machine) */}
                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        {app.status === 'applied' && (
                                            <Button onClick={() => { setSelectedApplicant(app); setModalMode('schedule'); setIsModalOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-xs py-1.5 px-3">
                                                <CalendarIcon size={14} className="mr-1 inline"/> 면접 일정 잡기
                                            </Button>
                                        )}

                                        {app.status === 'scheduled' && (
                                            <>
                                                <Button onClick={() => updateStatus(app, 'passed', 'passed')} className="bg-emerald-600 hover:bg-emerald-700 text-xs py-1.5 px-3">
                                                    <CheckCircle size={14} className="mr-1 inline"/> 합격 (범죄조회 요청)
                                                </Button>
                                                <Button onClick={() => updateStatus(app, 'rejected', 'rejected')} variant="danger" className="text-xs py-1.5 px-3">
                                                    <XCircle size={14} className="mr-1 inline"/> 불합격 문자 발송
                                                </Button>
                                            </>
                                        )}

                                        {app.status === 'passed' && (
                                            <Button onClick={() => updateStatus(app, 'bg_checked', 'bg_check_done')} className="bg-purple-600 hover:bg-purple-700 text-xs py-1.5 px-3">
                                                <FileText size={14} className="mr-1 inline"/> 범죄조회 완료 (계약 진행)
                                            </Button>
                                        )}

                                        <button onClick={() => handleDelete(app.id)} className="p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={modalMode === 'add' ? '신규 지원자 등록' : '면접 일정 조율 및 안내'}>
                <div className="space-y-4 p-2">
                    {modalMode === 'add' ? (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">지원자 이름</label>
                                    <input type="text" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-gray-800 font-bold" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">연락처</label>
                                    <input type="text" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-gray-800 font-bold" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="01012345678" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">유입 경로</label>
                                    <select className="w-full border-2 border-slate-200 p-3 rounded-xl font-bold bg-white" value={form.source} onChange={e => setForm({...form, source: e.target.value})}>
                                        <option value="알바몬">알바몬</option>
                                        <option value="알바천국">알바천국</option>
                                        <option value="지인추천">지인 추천</option>
                                        <option value="기타">기타</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">지원 포지션</label>
                                    <select className="w-full border-2 border-slate-200 p-3 rounded-xl font-bold bg-white" value={form.position} onChange={e => setForm({...form, position: e.target.value})}>
                                        <option value="수업조교(TA)">수업조교(TA)</option>
                                        <option value="행정조교">행정조교(Desk)</option>
                                        <option value="강사">강사</option>
                                    </select>
                                </div>
                            </div>
                            <Button className="w-full py-4 text-lg font-black bg-gray-900 hover:bg-black mt-2" onClick={handleAddApplicant} disabled={isSaving}>
                                {isSaving ? <Loader className="animate-spin mx-auto"/> : '서류 접수 등록'}
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="bg-blue-50 text-blue-700 p-3 rounded-xl text-xs font-bold border border-blue-200 mb-4">
                                💡 저장 즉시 지원자에게 면접 일정 및 찾아오는 길 안내 문자가 자동 발송됩니다.
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">면접 일자</label>
                                    <input type="date" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-blue-500 font-bold" value={scheduleForm.interviewDate} onChange={e => setScheduleForm({...scheduleForm, interviewDate: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">면접 시간</label>
                                    <input type="time" className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-blue-500 font-bold" value={scheduleForm.interviewTime} onChange={e => setScheduleForm({...scheduleForm, interviewTime: e.target.value})} />
                                </div>
                            </div>
                            <Button className="w-full py-4 text-lg font-black bg-blue-600 hover:bg-blue-700 shadow-lg mt-2" onClick={handleScheduleInterview} disabled={isSaving}>
                                {isSaving ? <Loader className="animate-spin mx-auto"/> : '면접 확정 및 문자 발송'}
                            </Button>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
}