import React, { useState } from 'react';
// [Import Check] UI 컴포넌트 및 아이콘 로드
import { Send, FileText, User, Clock, AlertCircle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Card, Button, LoadingSpinner } from '../components/UI';

/* 🔒 [보안 패치] 텔레그램 봇 토큰과 채팅 ID를 코드에서 제거했습니다.
   기존에는 브라우저 번들(build/static/js)에 토큰이 그대로 포함되어
   사이트 방문자 누구나 봇을 탈취할 수 있었습니다.
   이제 서버(Functions의 sendTelegramAlert)가 토큰을 보관하고 대신 발송합니다. */

const PickupRequest = ({ currentUser }) => {
    const [formData, setFormData] = useState({
        studentName: '',
        printName: '',
        deadline: ''
    });
    const [isLoading, setIsLoading] = useState(false);

    // 날짜 포맷팅 (YYYY-MM-DD)
    const formatDeadline = (dateString) => {
        if (!dateString) return '';
        return dateString; 
    };

    const handleSendMessage = async () => {
        // 1. 입력 검증
        if (!formData.studentName.trim() || !formData.printName.trim() || !formData.deadline) {
            alert("모든 항목(학생 이름, 프린트명, 픽업 기한)을 입력해주세요.");
            return;
        }

        setIsLoading(true);

        try {
            // 2. 메시지 구성 (일반 텍스트)
            const messageText = [
                '🖨 픽업 데스크 신청 도착',
                '',
                `👨‍🏫 요청 강사: ${currentUser?.name || '미상'}`,
                `🎓 학생 이름: ${formData.studentName}`,
                `📄 프린트명: ${formData.printName}`,
                `📅 픽업 기한: ${formatDeadline(formData.deadline)}`
            ].join('\n');

            // 3. 서버 경유 발송 (토큰은 서버에만 존재)
            const sendAlert = httpsCallable(functions, 'sendTelegramAlert');
            const result = await sendAlert({ text: messageText });

            if (!result?.data?.success) {
                throw new Error(result?.data?.message || '서버가 발송을 처리하지 못했습니다.');
            }

            // 4. 성공 처리
            alert("데스크에 신청이 완료되었습니다.");
            setFormData({ studentName: '', printName: '', deadline: '' }); // 폼 초기화

        } catch (error) {
            console.error("Telegram Send Error:", error);
            alert("전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.\n" + (error.message || ''));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        // [CTO 수정] max-w-2xl 제거하고 전체 너비 사용. PC에서는 2열 그리드 적용.
        <div className="w-full animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* 좌측: 안내 및 헤더 섹션 (PC에서 1칸 차지) */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100">
                        <div className="bg-blue-100 w-14 h-14 rounded-2xl flex items-center justify-center text-blue-600 mb-4 shadow-sm">
                            <Send size={28} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">픽업 데스크 신청</h2>
                        <p className="text-gray-500 leading-relaxed">
                            학생들이 데스크에서 자료를 바로 수령할 수 있도록 미리 신청해주세요.
                        </p>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 text-blue-800">
                        <h3 className="font-bold flex items-center gap-2 mb-3">
                            <AlertCircle size={20}/> 이용 가이드
                        </h3>
                        <ul className="text-sm space-y-2 list-disc list-inside opacity-90">
                            <li>학생이 학원에 도착하기 전에 신청해주세요.</li>
                            <li>자료는 데스크 '픽업함'에 비치됩니다.</li>
                            <li>픽업 기한이 지나면 자료가 정리될 수 있습니다.</li>
                        </ul>
                    </div>
                </div>

                {/* 우측: 입력 폼 섹션 (PC에서 2칸 차지) */}
                <Card className="lg:col-span-2 p-6 md:p-8 shadow-sm border-t-4 border-t-blue-600">
                    <div className="space-y-6">
                        {/* 학생 이름 입력 */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <User size={16} className="text-blue-500" />
                                학생 이름
                            </label>
                            <input
                                type="text"
                                className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition-all bg-gray-50 focus:bg-white"
                                placeholder="자료를 수령할 학생의 이름을 입력하세요"
                                value={formData.studentName}
                                onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                                disabled={isLoading}
                            />
                        </div>

                        {/* 프린트명 입력 */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <FileText size={16} className="text-green-500" />
                                프린트명 (자료 제목)
                            </label>
                            <input
                                type="text"
                                className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition-all bg-gray-50 focus:bg-white"
                                placeholder="예: 2027 수능특강 변형문제 프린트"
                                value={formData.printName}
                                onChange={(e) => setFormData({ ...formData, printName: e.target.value })}
                                disabled={isLoading}
                            />
                        </div>

                        {/* 픽업 기한 입력 */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <Clock size={16} className="text-red-500" />
                                픽업 기한
                            </label>
                            <input
                                type="date"
                                className="w-full border border-gray-300 p-4 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition-all bg-gray-50 focus:bg-white cursor-pointer"
                                value={formData.deadline}
                                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                                disabled={isLoading}
                            />
                        </div>

                        <hr className="border-gray-100 my-4"/>

                        {/* 전송 버튼 */}
                        <Button 
                            className="w-full py-4 text-lg font-bold shadow-lg shadow-blue-100 hover:shadow-xl transition-all" 
                            onClick={handleSendMessage}
                            disabled={isLoading}
                            icon={isLoading ? null : Send}
                        >
                            {isLoading ? <span className="flex items-center gap-2"><LoadingSpinner size={20} /> 전송 중...</span> : '데스크로 신청하기'}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default PickupRequest;