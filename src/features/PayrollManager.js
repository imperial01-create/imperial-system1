import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
// [Import Check] 모든 아이콘 및 라이브러리 확인 완료
import { 
  DollarSign, Calendar, Calculator, Download, Save, Search, 
  FileText, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Loader, X, Wallet, RefreshCcw
} from 'lucide-react';
import { collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const DEDUCTION_KEYS = [
    '국민연금', '건강보험', '고용보험', '장기요양보험료', '소득세', '지방소득세'
];

// --- Helper Functions ---
const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);

const getMonthRange = (yearMonth) => {
    const [y, m] = yearMonth.split('-').map(Number);
    // 해당 월의 1일
    const startStr = `${y}-${String(m).padStart(2,'0')}-01`;
    // 해당 월의 마지막 날 계산
    const lastDay = new Date(y, m, 0).getDate();
    const endStr = `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    
    return { startStr, endStr };
};

const calculateWeeklyHolidayPay = (sessions, hourlyRate) => {
    if (!sessions || sessions.length === 0) return { totalHours: 0, holidayPay: 0 };

    const dailyHours = {};
    sessions.forEach(s => {
        const date = s.date; 
        const startH = parseInt(s.startTime.split(':')[0], 10);
        const endH = parseInt(s.endTime.split(':')[0], 10);
        const duration = endH - startH;
        dailyHours[date] = (dailyHours[date] || 0) + duration;
    });

    const sortedDates = Object.keys(dailyHours).sort();
    if (sortedDates.length === 0) return { totalHours: 0, holidayPay: 0 };

    const firstDateStr = sortedDates[0];
    const [y, m] = firstDateStr.split('-').map(Number);
    const monthEnd = new Date(y, m, 0);

    const weeks = {}; 

    for (let d = 1; d <= monthEnd.getDate(); d++) {
        const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
        const currentDate = new Date(y, m - 1, d);
        const dayOfWeek = currentDate.getDay(); 
        const distToSat = 6 - dayOfWeek;
        const saturdayDate = new Date(y, m - 1, d + distToSat);
        const weekKey = saturdayDate.toISOString().split('T')[0];

        if (!weeks[weekKey]) weeks[weekKey] = 0;
        weeks[weekKey] += (dailyHours[dateStr] || 0);
    }

    let totalHolidayPay = 0;
    let grandTotalHours = 0;

    Object.values(weeks).forEach(hours => {
        grandTotalHours += hours;
        if (hours >= 15) {
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

const PayrollManager = ({ currentUser, users, viewMode = 'personal' }) => {
    // 날짜 상태 관리
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    
    const [payrolls, setPayrolls] = useState({});
    const [isLoading, setIsLoading] = useState(false); 
    const [lastUpdated, setLastUpdated] = useState(null); 
    
    // [데이터 효율화] 이번 달 전체 세션 캐싱 (관리자용)
    const [monthlySessions, setMonthlySessions] = useState([]);
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);

    // Admin Modal & Process State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPayroll, setEditingPayroll] = useState(null);
    const [calcProcessing, setCalcProcessing] = useState(false); 

    const isManagementMode = viewMode === 'management';

    const targetUsers = useMemo(() => {
        if (!isManagementMode) return [currentUser];
        // users가 로드되지 않았을 때 안전하게 빈 배열 반환
        return (users || []).filter(u => ['admin', 'lecturer', 'ta'].includes(u.role));
    }, [isManagementMode, users, currentUser]);

    // --- 1. Data Fetching (Payrolls) ---
    const fetchPayrolls = useCallback(async (forceRefresh = false) => {
        if (!currentUser) return;

        setIsLoading(true);
        const cacheKey = `imperial_payroll_v3_${selectedMonth}_${isManagementMode ? 'admin' : currentUser.id}`;
        
        try {
            // 1. 캐시 확인
            if (!forceRefresh) {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        if (Date.now() - parsed.timestamp < 3600000) { 
                            setPayrolls(parsed.data);
                            setLastUpdated(parsed.timestamp);
                            setIsLoading(false);
                            return; 
                        }
                    } catch (e) {
                        localStorage.removeItem(cacheKey);
                    }
                }
            }

            // 2. Firestore 요청
            const fetchedData = {};

            if (isManagementMode) {
                // [관리 모드] 해당 월 전체 데이터
                const q = query(
                    collection(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls'),
                    where('yearMonth', '==', selectedMonth)
                );
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    fetchedData[doc.data().userId] = doc.data();
                });
            } else {
                // [개인 모드] 내 데이터 직접 조회 (getDoc - 효율적)
                const docId = `${currentUser.id}_${selectedMonth}`;
                const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId);
                const snapshot = await getDoc(docRef);
                
                if (snapshot.exists()) {
                    fetchedData[currentUser.id] = snapshot.data();
                }
            }

            // 3. 상태 업데이트 및 캐시 저장
            setPayrolls(fetchedData);
            const now = Date.now();
            setLastUpdated(now);
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data: fetchedData }));

        } catch (e) {
            console.error("Payroll Fetch Error:", e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedMonth, isManagementMode, currentUser]);

    // --- 2. Fetch Monthly Sessions (Only for Admin Calculation) ---
    const fetchMonthlySessions = useCallback(async () => {
        // 관리자가 아니면 전체 세션을 로드할 필요 없음
        if (!isManagementMode) {
            setMonthlySessions([]);
            return;
        }

        setIsSessionsLoading(true);
        try {
            const { startStr, endStr } = getMonthRange(selectedMonth);
            
            // [핵심] taId 필터 없이 날짜로만 쿼리 -> 복합 색인 오류 방지
            const q = query(
                collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'),
                where('date', '>=', startStr),
                where('date', '<=', endStr)
            );

            const snapshot = await getDocs(q);
            const sessions = snapshot.docs.map(d => d.data());
            setMonthlySessions(sessions);
        } catch (e) {
            console.error("Session Fetch Error:", e);
        } finally {
            setIsSessionsLoading(false);
        }
    }, [selectedMonth, isManagementMode]);

    // 초기 로드 및 월 변경 시 실행
    useEffect(() => {
        fetchPayrolls(false);
        fetchMonthlySessions();
    }, [fetchPayrolls, fetchMonthlySessions]);


    // --- 3. Calculation Logic (Pure Memory Filtering) ---
    const handleCalculate = async (targetUser) => {
        if (!isManagementMode) return;
        
        if (targetUser.role === 'ta' && !targetUser.hourlyRate) {
            alert(`${targetUser.name}님의 시급 정보가 없습니다. 사용자 관리에서 시급을 설정해주세요.`);
            return;
        }

        setCalcProcessing(true);
        try {
            let baseSalary = 0;
            let totalHours = 0;
            let weeklyHolidayPay = 0;
            let hourlyRate = 0;

            // [핵심 수정] DB 조회 없이 미리 로드된 monthlySessions에서 필터링
            // -> Index Error 원천 차단 + N+1 문제 해결
            if (targetUser.role === 'ta') {
                const userSessions = monthlySessions.filter(s => s.taId === targetUser.id);
                
                hourlyRate = parseInt(targetUser.hourlyRate || 0, 10);
                const calcResult = calculateWeeklyHolidayPay(userSessions, hourlyRate);
                totalHours = calcResult.totalHours;
                weeklyHolidayPay = calcResult.holidayPay;
                baseSalary = Math.floor(totalHours * hourlyRate);
            } 
            
            const initialDeductions = {};
            DEDUCTION_KEYS.forEach(key => initialDeductions[key] = 0);

            const newData = {
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
                deductions: initialDeductions,
                netSalary: baseSalary + weeklyHolidayPay,
                status: 'pending',
                updatedAt: serverTimestamp() 
            };

            const docId = `${targetUser.id}_${selectedMonth}`;
            
            // DB 저장
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), newData);

            // 캐시 및 로컬 상태 업데이트
            const updatedPayrolls = { ...payrolls, [targetUser.id]: newData };
            setPayrolls(updatedPayrolls);
            
            const cacheKey = `imperial_payroll_v3_${selectedMonth}_admin`;
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));
            
        } catch (e) {
            console.error(e);
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
        
        try {
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), updatedData);
            
            const updatedPayrolls = { ...payrolls, [editingPayroll.userId]: updatedData };
            setPayrolls(updatedPayrolls);
            
            const cacheKey = `imperial_payroll_v3_${selectedMonth}_${isManagementMode ? 'admin' : currentUser.id}`;
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));

            setIsEditModalOpen(false);
        } catch(e) {
            alert('저장 실패: ' + e.message);
        }
    };

    // 5. Excel Export
    const handleDownloadExcel = () => {
        const data = Object.values(payrolls).map(p => {
            const roleName = p.userRole === 'ta' ? '조교' : (p.userRole === 'lecturer' ? '강사' : '관리자');
            const row = {
                '이름': p.userName,
                '직책': roleName,
                '기본급/시급급여': p.baseSalary,
                '주휴수당': p.weeklyHolidayPay,
                '식대': p.mealAllowance,
                '상여금': p.bonus,
                '지급총액(세전)': p.totalGross,
            };
            
            DEDUCTION_KEYS.forEach(key => {
                row[key] = p.deductions[key] || 0;
            });

            row['공제총액'] = Object.values(p.deductions).reduce((a, b) => a + (b || 0), 0);
            row['실수령액(세후)'] = p.netSalary;
            
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Payroll");
        XLSX.writeFile(wb, `Imperial_Payroll_${selectedMonth}.xlsx`);
    };

    const handleMonthChange = (offset) => {
        const [yearStr, monthStr] = selectedMonth.split('-');
        let year = parseInt(yearStr, 10);
        let month = parseInt(monthStr, 10);

        month += offset;
        if (month > 12) {
            month = 1;
            year += 1;
        } else if (month < 1) {
            month = 12;
            year -= 1;
        }

        const newMonthStr = `${year}-${String(month).padStart(2, '0')}`;
        setSelectedMonth(newMonthStr);
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
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
                
                <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-400 mr-2 flex items-center gap-1">
                        {isLoading ? <span className="text-blue-500 flex items-center gap-1"><Loader size={12} className="animate-spin"/> 로딩 중</span> : 
                         (lastUpdated ? `업데이트: ${formatTime(lastUpdated)}` : '')}
                    </div>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        icon={RefreshCcw} 
                        onClick={() => { fetchPayrolls(true); fetchMonthlySessions(); }} 
                        title="데이터 새로고침 (DB 읽기 발생)"
                        disabled={isLoading || isSessionsLoading}
                    />
                    
                    {isManagementMode && (
                        <Button onClick={handleDownloadExcel} icon={Download} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50 ml-2">
                            엑셀 다운로드
                        </Button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            {isManagementMode ? (
                <Card className="overflow-hidden w-full">
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
                                {targetUsers.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="p-8 text-center text-gray-400">
                                            {users && users.length === 0 ? "사용자 데이터를 불러오는 중입니다..." : "표시할 직원이 없습니다."}
                                        </td>
                                    </tr>
                                )}
                                {targetUsers.map(user => {
                                    const payroll = payrolls[user.id];
                                    const roleLabel = user.role === 'ta' ? '조교' : (user.role === 'lecturer' ? '강사' : '관리자');
                                    return (
                                        <tr key={user.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-bold">{user.name}</td>
                                            <td className="p-4 uppercase text-xs font-bold text-gray-400">{roleLabel}</td>
                                            <td className="p-4">
                                                {user.role === 'ta' 
                                                    ? (user.hourlyRate ? `${formatCurrency(user.hourlyRate)}/hr` : '미설정') 
                                                    : (payroll ? formatCurrency(payroll.baseSalary) : '미정')
                                                }
                                            </td>
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
                                        {DEDUCTION_KEYS.map((key) => (
                                            <div key={key} className="flex justify-between text-sm mb-1 text-gray-600">
                                                <span>{key}</span><span>{formatCurrency(payrolls[currentUser.id].deductions?.[key])}</span>
                                            </div>
                                        ))}
                                        <div className="border-t mt-2 pt-2 flex justify-between font-bold text-red-500"><span>공제계</span><span>{formatCurrency(Object.values(payrolls[currentUser.id].deductions || {}).reduce((a,b)=>a+(b||0),0))}</span></div>
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
                                {DEDUCTION_KEYS.map(key => (
                                    <div key={key}>
                                        <label className="block text-xs text-gray-500">{key}</label>
                                        <input 
                                            type="number" 
                                            className="w-full border p-2 rounded text-right" 
                                            value={editingPayroll.deductions?.[key] || 0} 
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