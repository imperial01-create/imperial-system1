import React, { useState } from 'react';
// [Import Check] UI 컴포넌트 및 아이콘 로드
import { Send, FileText, User, Clock, AlertCircle } from 'lucide-react';
import { Card, Button, LoadingSpinner } from '../components/UI';

const TELEGRAM_API_URL = "https://api.telegram.org/bot8435500018:AAGY4gcNhiRBx2fHf8OzbHy74wIkzN5qvB0/sendMessage";
const CHAT_ID = "8466973475";

const PickupRequest = ({ currentUser }) => {
    const [formData, setFormData] = useState({
        studentName: '',
        printName: '',
        deadline: ''
    });
    const [isLoading, setIsLoading] = useState(false);

    // 날짜 포맷팅 (YYYY-MM-DD) - 시간 제외
    const formatDeadline = (dateString) => {
        if (!dateString) return '';
        // input type="date"는 YYYY-MM-DD 형태의 문자열을 반환하므로 그대로 사용하거나 가공
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
            // 2. 메시지 구성 (HTML 모드)
            const messageText = `
<b>🖨 픽업 데스크 신청 도착</b>

<b>👨‍🏫 요청 강사:</b> ${currentUser.name}
<b>🎓 학생 이름:</b> ${formData.studentName}
<b>📄 프린트명:</b> ${formData.printName}
<b>📅 픽업 기한:</b> ${formatDeadline(formData.deadline)}
            `.trim();

            // 3. Telegram API 호출
            const response = await fetch(TELEGRAM_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: CHAT_ID,
                    text: messageText,
                    parse_mode: 'HTML'
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            // 4. 성공 처리
            alert("데스크에 신청이 완료되었습니다.");
            setFormData({ studentName: '', printName: '', deadline: '' }); // 폼 초기화

        } catch (error) {
            console.error("Telegram Send Error:", error);
            alert("전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.\n" + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <Card className="p-6 md:p-8 shadow-lg border-t-4 border-t-blue-600">
                <div className="flex items-center gap-3 mb-6 border-b pb-4">
                    <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                        <Send size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">픽업 데스크 신청</h2>
                        <p className="text-gray-500 text-sm">픽업데스크 안내 문자를 데스크에 요청합니다.</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* 학생 이름 입력 */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <User size={16} className="text-blue-500" />
                            학생 이름
                        </label>
                        <input
                            type="text"
                            className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition-all"
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
                            className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition-all"
                            placeholder="예: 2027 수능특강 변형문제 프린트"
                            value={formData.printName}
                            onChange={(e) => setFormData({ ...formData, printName: e.target.value })}
                            disabled={isLoading}
                        />
                    </div>

                    {/* 픽업 기한 입력 (수정됨: Date Type) */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Clock size={16} className="text-red-500" />
                            {/* [수정] 라벨 텍스트 변경 */}
                            픽업 기한 (언제까지 픽업하게 할까요?)
                        </label>
                        <input
                            // [수정] type="date"로 변경하여 날짜만 선택
                            type="date"
                            className="w-full border border-gray-300 p-3 rounded-xl focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition-all cursor-pointer"
                            value={formData.deadline}
                            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                            disabled={isLoading}
                        />
                    </div>

                    {/* 안내 문구 (수정됨) */}
                    <div className="bg-blue-50 p-4 rounded-xl flex gap-3 items-start text-sm text-blue-700">
                        <AlertCircle size={20} className="shrink-0 mt-0.5" />
                        <p>
                            {/* [수정] 안내 멘트 변경 */}
                            신청 버튼을 누르면 데스크로 신청됩니다.<br />
                            자료는 픽업데스크에 준비 바랍니다.
                        </p>
                    </div>

                    {/* 전송 버튼 */}
                    <Button 
                        className="w-full py-4 text-lg font-bold shadow-md hover:shadow-lg transition-all" 
                        onClick={handleSendMessage}
                        disabled={isLoading}
                        icon={isLoading ? null : Send}
                    >
                        {isLoading ? <span className="flex items-center gap-2"><LoadingSpinner size={20} /> 전송 중...</span> : '신청하기'}
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default PickupRequest;