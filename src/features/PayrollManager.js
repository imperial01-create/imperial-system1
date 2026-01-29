import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx'; // npm install xlsx
// [Import Check] 아이콘 및 라이브러리 완벽 확인
import { 
  DollarSign, Calendar, Calculator, Download, Save, Search, 
  FileText, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Loader 
} from 'lucide-react';
import { collection, doc, setDoc, getDocs, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

// --- Helper Functions ---
const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);

const getMonthRange = (yearMonth) => {
    const [y, m] = yearMonth.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    // Firestore 쿼리용 문자열 (YYYY-MM-DD)
    const startStr = `${y}-${String(m).padStart(2,'0')}-01`;
    const endStr = `${y}-${String(m).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
    return { start, end, startStr, endStr };
};

/**
 * 주휴수당 계산 로직 (일~토 기준 주 15시간 이상 근무 시)
 * - sessions: 해당 월의 모든 세션 중 특정 조교의 세션만 필터링된 배열
 */
const calculateWeeklyHolidayPay = (sessions, hourlyRate) => {
    if (!sessions || sessions.length === 0) return { totalHours: 0, holidayPay: 0 };

    // 1. 일별 근무 시간 집계
    const dailyHours = {};
    sessions.forEach(s => {
        const date = s.date; // YYYY-MM-DD
        const startH = parseInt(s.startTime.split(':')[0], 10);
        const endH = parseInt(s.endTime.split(':')[0], 10);
        const duration = endH - startH;
        dailyHours[date] = (dailyHours[date] || 0) + duration;
    });

    // 2. 주 단위 그룹화 (일요일 ~ 토요일)
    const sortedDates = Object.keys(dailyHours).sort();
    if (sortedDates.length === 0) return { totalHours: 0, holidayPay: 0 };

    const firstDateStr = sortedDates[0];
    const [y, m] = firstDateStr.split('-').map(Number);
    const monthEnd = new Date(y, m, 0);

    const weeks = {}; 

    // 월의 1일부터 말일까지 순회하며 주차별로 버킷팅
    for (let d = 1; d <= monthEnd.getDate(); d++) {
        const currentDate = new Date(y, m - 1, d);
        const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        // 해당 날짜가 속한 주의 "토요일" 날짜를 Key로 사용 (일~토 주기를 묶기 위함)
        const dayOfWeek = currentDate.getDay(); // 0(일) ~ 6(토)
        const distToSat = 6 - dayOfWeek;
        const saturdayDate = new Date(y, m - 1, d + distToSat);
        const weekKey = saturdayDate.toISOString().split('T')[0];

        if (!weeks[weekKey]) weeks[weekKey] = 0;
        weeks[weekKey] += (dailyHours[dateStr] || 0);
    }

    // 3. 주휴수당 계산
    let totalHolidayPay = 0;
    let grandTotalHours = 0;

    Object.values(weeks).forEach(hours => {
        grandTotalHours += hours;
        if (hours >= 15) {
            // 공식: (1주일 총 근무시간 / 40시간) * 8 * 시급 (최대 40시간 한도)
            const cappedHours = Math.min(hours, 40);
            const pay = (cappedHours / 40) * 8 * hourlyRate;
            totalHolidayPay += pay;
        }
    });

    return {
        totalHours: grandTotalHours,
        holidayPay: Math.floor(totalHolidayPay)
    };
};

const PayrollManager = ({ currentUser, users }) => {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [payrolls, setPayrolls] = useState({});
    
    // [데이터 효율화] 전체 세션을 한 번만 로드하여 캐싱
    const [monthlySessions, setMonthlySessions] = useState([]); 
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);

    // Admin Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPayroll, setEditingPayroll] = useState(null);
    const [calcProcessing, setCalcProcessing] = useState(false);

    const isAdmin = currentUser.role === 'admin';
    const targetUsers = isAdmin 
        ? users.filter(u => u.role === 'lecturer' || u.role === 'ta')
        : [currentUser];

    // 1. Fetch Payrolls (이미 정산된 내역)
    useEffect(() => {
        const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls'),
            where('yearMonth', '==', selectedMonth)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const data = {};
            snapshot.forEach(doc => {
                data[doc.data().userId] = doc.data();
            });
            setPayrolls(data);
        });
        return () => unsub();
    }, [selectedMonth]);

    // 2. [효율화] Fetch Sessions Once for the Month
    // [수정 사항] 상태(status) 필터를 제거하여 예정된 모든 근무(Open, Confirmed 등)를 가져옵니다.
    useEffect(() => {
        const fetchMonthlySessions = async () => {
            setIsSessionsLoading(true);
            try {
                const { startStr, endStr } = getMonthRange(selectedMonth);
                
                let q;
                if (isAdmin) {
                    q = query(
                        collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'),
                        where('date', '>=', startStr),
                        where('date', '<=', endStr)
                        // [수정] status 필터 삭제: 모든 세션 조회 (예정된 근무 포함)
                    );
                } else if (currentUser.role === 'ta') {
                    q = query(
                        collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'),
                        where('taId', '==', currentUser.id),
                        where('date', '>=', startStr),
                        where('date', '<=', endStr)
                        // [수정] status 필터 삭제
                    );
                } else {
                    setMonthlySessions([]);
                    setIsSessionsLoading(false);
                    return;
                }

                const snapshot = await getDocs(q);
                const fetchedSessions = snapshot.docs.map(d => d.data());
                setMonthlySessions(fetchedSessions);

            } catch (e) {
                console.error("Session Fetch Error:", e);
            } finally {
                setIsSessionsLoading(false);
            }
        };

        fetchMonthlySessions();
    }, [selectedMonth, isAdmin, currentUser]);

    // 3. Calculation Logic (Memory-based, No DB Read)
    const handleCalculate = async (targetUser) => {
        if (!isAdmin) return;
        
        if (targetUser.role === 'ta' && !targetUser.hourlyRate) {
            alert(`${targetUser.name}님의 시급 정보가 없습니다. 사용자 관리에서 시급을 설정해주세요.`);
            return;
        }

        setCalcProcessing(true);
        try {
            let baseSalary = 0;
            let totalHours = 0;
            let weeklyHolidayPay = 0;
            let hourlyRate = parseInt(targetUser.hourlyRate || 0, 10);

            // TA: Calculate from cached 'monthlySessions'
            if (targetUser.role === 'ta') {
                // [수정] DB에 존재하는 해당 조교의 모든 세션을 근무 시간으로 인정
                // (ClinicDashboard의 카운트 방식과 동일하게 taId만 체크)
                const userSessions = monthlySessions.filter(s => s.taId === targetUser.id);
                
                const calcResult = calculateWeeklyHolidayPay(userSessions, hourlyRate);
                totalHours = calcResult.totalHours;
                weeklyHolidayPay = calcResult.holidayPay;
                baseSalary = Math.floor(totalHours * hourlyRate);
            } 
            // Lecturer: Default 0 (Manual Entry)
            else {
                baseSalary = 0; 
            }

            const initialData = {
                userId: targetUser.id,
                userName: targetUser.name,
                userRole: targetUser.role,
                yearMonth: selectedMonth,
                hourlyRate: hourlyRate,
                baseSalary: baseSalary,
                totalHours: totalHours,
                weeklyHolidayPay: weeklyHolidayPay,
                mealAllowance: 0, 
                bonus: 0,         
                totalGross: baseSalary + weeklyHolidayPay,
                deductions: {
                    national: 0, health: 0, employment: 0, care: 0, income: 0, localIncome: 0
                },
                netSalary: baseSalary + weeklyHolidayPay,
                status: 'pending',
                updatedAt: serverTimestamp()
            };

            const docId = `${targetUser.id}_${selectedMonth}`;
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), initialData);
            
        } catch (e) {
            alert("계산 중 오류 발생: " + e.message);
        } finally {
            setCalcProcessing(false);
        }
    };

    // 4. Save Manual Edits
    const handleSaveEdit = async () => {
        if (!editingPayroll) return;
        
        const gross = parseInt(editingPayroll.baseSalary || 0) + 
                      parseInt(editingPayroll.weeklyHolidayPay || 0) + 
                      parseInt(editingPayroll.bonus || 0) + 
                      parseInt(editingPayroll.mealAllowance || 0);
        
        const totalDeductions = Object.values(editingPayroll.deductions).reduce((a, b) => a + parseInt(b || 0), 0);
        const net = gross - totalDeductions;

        const updatedData = {
            ...editingPayroll,
            totalGross: gross,
            netSalary: net,
            status: 'confirmed',
            updatedAt: serverTimestamp()
        };

        const docId = `${editingPayroll.userId}_${editingPayroll.yearMonth}`;
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), updatedData);
        setIsEditModalOpen(false);
    };

    // 5. Excel Export
    const handleDownloadExcel = () => {
        const data = Object.values(payrolls).map(p => ({
            '이름': p.userName,
            '직책': p.userRole === 'ta' ? '조교' : '강사',
            '기본급(시급계산)': p.baseSalary,
            '주휴수당': p.weeklyHolidayPay,
            '식대': p.mealAllowance,
            '상여금': p.bonus,
            '지급총액(세전)': p.totalGross,
            '국민연금': p.deductions.national,
            '건강보험': p.deductions.health,
            '고용보험': p.deductions.employment,
            '장기요양': p.deductions.care,
            '소득세': p.deductions.income,
            '지방소득세': p.deductions.localIncome,
            '공제총액': Object.values(p.deductions).reduce((a, b) => a + b, 0),
            '실수령액(세후)': p.netSalary
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Payroll");
        XLSX.writeFile(wb, `Imperial_Payroll_${selectedMonth}.xlsx`);
    };

    const handleMonthChange = (offset) => {
        const d = new Date(selectedMonth + "-01");
        d.setMonth(d.getMonth() + offset);
        setSelectedMonth(d.toISOString().slice(0, 7));
    };

    return (
        <div className="space-y-6 w-full max-w-[1600px] mx-auto animate-in fade-in">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>
                    <h2 className="text-2xl font-bold text-gray-800">{selectedMonth.split('-')[0]}년 {selectedMonth.split('-')[1]}월 급여</h2>
                    <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight /></button>
                </div>
                {isAdmin && (
                    <Button onClick={handleDownloadExcel} icon={Download} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50">
                        엑셀 다운로드
                    </Button>
                )}
            </div>

            {/* Content Area */}
            {isAdmin ? (
                <Card className="overflow-hidden w-full">
                    {isSessionsLoading && <div className="p-4 text-center text-gray-500 text-sm flex items-center justify-center gap-2"><Loader className="animate-spin" size={16}/> 근무 데이터를 불러오는 중...</div>}
                    
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left text-sm min-w-[1000px]">
                            <thead className="bg-gray-50 border-b text-gray-500">
                                <tr>
                                    <th className="p-4">이름</th>
                                    <th className="p-4">역할</th>
                                    <th className="p-4">시급/기본급</th>
                                    <th className="p-4">근무시간</th>
                                    <th className="p-4">주휴수당</th>
                                    <th className="p-4">지급총액(세전)</th>
                                    <th className="p-4">실수령액(세후)</th>
                                    <th className="p-4 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {targetUsers.map(user => {
                                    const payroll = payrolls[user.id];
                                    return (
                                        <tr key={user.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-bold">{user.name}</td>
                                            <td className="p-4 uppercase text-xs font-bold text-gray-400">{user.role}</td>
                                            <td className="p-4">{user.role === 'ta' ? `${formatCurrency(user.hourlyRate)}/hr` : '변동급'}</td>
                                            <td className="p-4">{payroll ? `${payroll.totalHours} hrs` : '-'}</td>
                                            <td className="p-4 text-blue-600">{payroll ? formatCurrency(payroll.weeklyHolidayPay) : '-'}</td>
                                            <td className="p-4 font-bold">{payroll ? formatCurrency(payroll.totalGross) : '-'}</td>
                                            <td className="p-4 font-bold text-green-600">{payroll ? formatCurrency(payroll.netSalary) : '-'}</td>
                                            <td className="p-4 flex justify-end gap-2">
                                                {payroll ? (
                                                    <Button size="sm" variant="secondary" icon={FileText} onClick={() => { setEditingPayroll(payroll); setIsEditModalOpen(true); }}>상세/공제</Button>
                                                ) : (
                                                    <Button size="sm" icon={Calculator} onClick={() => handleCalculate(user)} disabled={calcProcessing || isSessionsLoading}>
                                                        {calcProcessing ? <Loader className="animate-spin" size={14}/> : '정산 하기'}
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : (
                // Staff View
                <div className="max-w-2xl mx-auto w-full">
                    {payrolls[currentUser.id] ? (
                        <Card className="border-t-4 border-t-blue-600 shadow-lg w-full">
                            <div className="text-center mb-6 border-b pb-4">
                                <h3 className="text-2xl font-bold text-gray-800">급여 명세서</h3>
                                <p className="text-gray-500">{selectedMonth} 귀속분</p>
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-lg">
                                    <span className="text-gray-600">성명</span>
                                    <span className="font-bold">{currentUser.name}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">지급 내역</p>
                                        <div className="flex justify-between text-sm mb-1"><span>기본급</span><span>{formatCurrency(payrolls[currentUser.id].baseSalary)}</span></div>
                                        <div className="flex justify-between text-sm mb-1"><span>주휴수당</span><span>{formatCurrency(payrolls[currentUser.id].weeklyHolidayPay)}</span></div>
                                        <div className="flex justify-between text-sm mb-1"><span>식대</span><span>{formatCurrency(payrolls[currentUser.id].mealAllowance)}</span></div>
                                        <div className="flex justify-between text-sm font-bold text-blue-600"><span>상여금</span><span>{formatCurrency(payrolls[currentUser.id].bonus)}</span></div>
                                        <div className="border-t mt-2 pt-2 flex justify-between font-bold"><span>지급계</span><span>{formatCurrency(payrolls[currentUser.id].totalGross)}</span></div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">공제 내역</p>
                                        {Object.entries(payrolls[currentUser.id].deductions).map(([key, val]) => (
                                            <div key={key} className="flex justify-between text-sm mb-1 text-gray-600">
                                                <span className="capitalize">{key}</span><span>{formatCurrency(val)}</span>
                                            </div>
                                        ))}
                                        <div className="border-t mt-2 pt-2 flex justify-between font-bold text-red-500"><span>공제계</span><span>{formatCurrency(Object.values(payrolls[currentUser.id].deductions).reduce((a,b)=>a+b,0))}</span></div>
                                    </div>
                                </div>
                                <div className="bg-blue-600 text-white p-4 rounded-xl flex justify-between items-center text-xl font-bold shadow-md">
                                    <span>실수령액</span>
                                    <span>{formatCurrency(payrolls[currentUser.id].netSalary)}</span>
                                </div>
                            </div>
                        </Card>
                    ) : (
                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed text-gray-400 w-full">
                            <AlertCircle className="mx-auto mb-2 opacity-50" size={48} />
                            해당 월의 급여 내역이 아직 정산되지 않았습니다.
                        </div>
                    )}
                </div>
            )}

            {/* Admin Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="급여 상세 수정 (세무 입력)">
                {editingPayroll && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">기본급 (수동 조정)</label>
                                <input type="number" className="w-full border p-2 rounded" value={editingPayroll.baseSalary} onChange={e => setEditingPayroll({...editingPayroll, baseSalary: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">상여금</label>
                                <input type="number" className="w-full border p-2 rounded" value={editingPayroll.bonus} onChange={e => setEditingPayroll({...editingPayroll, bonus: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">식대</label>
                                <input type="number" className="w-full border p-2 rounded" value={editingPayroll.mealAllowance} onChange={e => setEditingPayroll({...editingPayroll, mealAllowance: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">주휴수당 (자동계산됨)</label>
                                <input type="number" className="w-full border p-2 rounded bg-gray-100" value={editingPayroll.weeklyHolidayPay} readOnly />
                            </div>
                        </div>
                        
                        <div className="border-t pt-4">
                            <h4 className="font-bold text-sm text-red-500 mb-2">공제 내역 입력 (세무사 전달값)</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {['national', 'health', 'employment', 'care', 'income', 'localIncome'].map(key => (
                                    <div key={key}>
                                        <label className="block text-xs text-gray-500 capitalize">{key}</label>
                                        <input 
                                            type="number" 
                                            className="w-full border p-2 rounded text-right" 
                                            value={editingPayroll.deductions[key]} 
                                            onChange={e => setEditingPayroll({
                                                ...editingPayroll, 
                                                deductions: { ...editingPayroll.deductions, [key]: Number(e.target.value) }
                                            })} 
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Button className="w-full mt-4" onClick={handleSaveEdit} icon={Save}>저장 및 확정</Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default PayrollManager;