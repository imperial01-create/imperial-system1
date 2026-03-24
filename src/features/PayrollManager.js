import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  DollarSign, Calendar, Calculator, Download, Save, Search, 
  FileText, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Loader, X, Wallet, RefreshCcw, Plus
} from 'lucide-react';
import { collection, doc, setDoc, getDoc, getDocs, getDocFromServer, getDocsFromServer, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

// 🚀 [신규 추가] PDF 자동 분석 컴포넌트 임포트
import PdfAutoFiller from './PdfAutoFiller';

const APP_ID = 'imperial-clinic-v1';

const DEDUCTION_KEYS = [
    '국민연금', '건강보험', '고용보험', '장기요양보험료', '소득세', '지방소득세'
];

// --- Helper Functions ---
const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);

const getMonthRange = (yearMonth) => {
    const [y, m] = yearMonth.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const startStr = `${y}-${String(m).padStart(2,'0')}-01`;
    const endStr = `${y}-${String(m).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
    return { start, end, startStr, endStr };
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
        const currentDate = new Date(y, m - 1, d);
        const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        
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
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    
    const [payrolls, setPayrolls] = useState({});
    const [isLoading, setIsLoading] = useState(false); 
    const [lastUpdated, setLastUpdated] = useState(null); 
    
    const [monthlySessions, setMonthlySessions] = useState([]);
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPayroll, setEditingPayroll] = useState(null);
    const [calcProcessing, setCalcProcessing] = useState(false); 

    const isManagementMode = viewMode === 'management';

    const targetUsers = useMemo(() => {
        if (!isManagementMode) return [currentUser];
        const filtered = (users || []).filter(u => ['admin', 'lecturer', 'ta'].includes(u.role));
        
        const userMap = new Map();
        filtered.forEach(user => {
            const existingUser = userMap.get(user.userId);
            if (!existingUser) {
                userMap.set(user.userId, user);
            } else {
                const isNewer = user.updatedAt && existingUser.updatedAt && (user.updatedAt > existingUser.updatedAt);
                const hasAuth = user.authUid && !existingUser.authUid;
                if (isNewer || hasAuth) {
                    userMap.set(user.userId, user);
                }
            }
        });
        return Array.from(userMap.values());
    }, [isManagementMode, users, currentUser]);

    const fetchPayrolls = useCallback(async (forceRefresh = false) => {
        if (!currentUser) return;
        setIsLoading(true);
        const cacheKey = `imperial_payroll_v7_${selectedMonth}_${isManagementMode ? 'admin' : currentUser.id}`;
        
        try {
            const cacheTTL = isManagementMode ? 300000 : 0;

            if (!forceRefresh && cacheTTL > 0) {
                const cached = localStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        if (Date.now() - parsed.timestamp < cacheTTL) { 
                            setPayrolls(parsed.data);
                            setLastUpdated(parsed.timestamp);
                            setIsLoading(false);
                            return; 
                        }
                    } catch (e) { localStorage.removeItem(cacheKey); }
                }
            }

            const fetchedData = {};
            
            if (isManagementMode) {
                const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls'), where('yearMonth', '==', selectedMonth));
                let snapshot;
                try {
                    snapshot = await getDocsFromServer(q);
                } catch (err) {
                    snapshot = await getDocs(q);
                }
                snapshot.forEach(doc => { fetchedData[doc.data().userId] = doc.data(); });
            } else {
                const docId = `${currentUser.id}_${selectedMonth}`;
                const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId);
                
                let snapshot;
                try {
                    snapshot = await getDocFromServer(docRef);
                } catch (err) {
                    snapshot = await getDoc(docRef);
                }

                if (snapshot.exists()) {
                    fetchedData[currentUser.id] = snapshot.data();
                }
            }

            setPayrolls(fetchedData);
            const now = Date.now();
            setLastUpdated(now);
            
            if (cacheTTL > 0) {
                localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data: fetchedData }));
            }

        } catch (e) { 
            console.error("Payroll Fetch Error:", e); 
            setPayrolls({}); 
        } finally { 
            setIsLoading(false); 
        }
    }, [selectedMonth, isManagementMode, currentUser]);

    const fetchMonthlySessions = useCallback(async () => {
        if (!isManagementMode) { setMonthlySessions([]); return; }
        setIsSessionsLoading(true);
        try {
            const { startStr, endStr } = getMonthRange(selectedMonth);
            const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', startStr), where('date', '<=', endStr));
            const snapshot = await getDocs(q);
            const sessions = snapshot.docs.map(d => d.data());
            setMonthlySessions(sessions);
        } catch (e) { console.error("Session Fetch Error:", e); } 
        finally { setIsSessionsLoading(false); }
    }, [selectedMonth, isManagementMode]);

    useEffect(() => { setPayrolls({}); fetchPayrolls(false); fetchMonthlySessions(); }, [selectedMonth, fetchPayrolls, fetchMonthlySessions]);

    // 🚀 [신규 기능] PDF 추출 데이터 일괄 적용 및 DB 자동 저장 핸들러
    const handlePdfDataExtracted = async (extractedData) => {
        setCalcProcessing(true);
        try {
            const updatedPayrolls = { ...payrolls };
            const promises = [];
            let updateCount = 0;

            for (const user of targetUsers) {
                const autoData = extractedData[user.id];
                if (autoData) {
                    let currentPayroll = updatedPayrolls[user.id];
                    
                    // 만약 해당 월의 정산 내역이 아예 없는 직원이면, 기본 뼈대를 우선 생성합니다.
                    if (!currentPayroll) {
                        currentPayroll = {
                            userId: user.id,
                            userName: user.name,
                            userRole: user.role,
                            yearMonth: selectedMonth,
                            hourlyRate: Number(user.hourlyRate) || 0,
                            baseSalary: 0,
                            totalHours: 0,
                            weeklyHolidayPay: 0,
                            mealAllowance: 0,
                            bonus: 0,
                            totalGross: 0,
                            deductions: { '국민연금': 0, '건강보험': 0, '고용보험': 0, '장기요양보험료': 0, '소득세': 0, '지방소득세': 0 },
                            netSalary: 0,
                            status: 'calculated',
                            updatedAt: serverTimestamp()
                        };
                    }

                    // 추출된 공제 데이터 덮어쓰기
                    const newDeductions = {
                        ...currentPayroll.deductions,
                        '국민연금': autoData.nationalPension || 0,
                        '건강보험': autoData.healthInsurance || 0,
                        '고용보험': autoData.employmentInsurance || 0,
                        '장기요양보험료': autoData.longTermCare || 0,
                        '소득세': autoData.taxIncome || 0,
                        '지방소득세': autoData.taxLocal || 0
                    };

                    // 실수령액(Net Salary) 재계산 방어 로직
                    const safeBaseSalary = Number(currentPayroll.baseSalary) || 0;
                    const safeHolidayPay = Number(currentPayroll.weeklyHolidayPay) || 0;
                    const safeBonus = Number(currentPayroll.bonus) || 0;
                    const safeMeal = Number(currentPayroll.mealAllowance) || 0;
                    const gross = safeBaseSalary + safeHolidayPay + safeBonus + safeMeal;
                    const totalDeductions = Object.values(newDeductions).reduce((a, b) => a + (Number(b) || 0), 0);
                    const net = gross - totalDeductions;

                    const newData = {
                        ...currentPayroll,
                        totalGross: gross,
                        deductions: newDeductions,
                        netSalary: net,
                        status: 'confirmed', // 자동 파싱 완료 시 확정 상태로 변경
                        updatedAt: serverTimestamp()
                    };

                    updatedPayrolls[user.id] = newData;
                    const docId = `${user.id}_${selectedMonth}`;
                    // 서버로 즉시 일괄 저장 (Batch Promise)
                    promises.push(setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), newData, { merge: true }));
                    updateCount++;
                }
            }

            if (promises.length > 0) {
                await Promise.all(promises);
                setPayrolls(updatedPayrolls);
                
                // 로컬 캐시 업데이트
                const cacheKey = `imperial_payroll_v7_${selectedMonth}_admin`;
                localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));
                
                alert(`성공! 총 ${updateCount}명의 공제 내역이 완벽하게 계산되어 서버에 저장되었습니다.`);
            }
        } catch (e) {
            console.error(e);
            alert("공제 내역 자동 적용 중 오류가 발생했습니다: " + e.message);
        } finally {
            setCalcProcessing(false);
        }
    };

    const handleCalculate = async (targetUser) => {
        if (!isManagementMode) return;
        if (targetUser.role === 'ta' && !targetUser.hourlyRate) { 
            alert(`${targetUser.name}님의 시급 정보가 없습니다. 먼저 사용자 관리에서 시급을 설정해주세요.`); 
            return; 
        }
        
        setCalcProcessing(true);
        
        try {
            let baseSalary = 0, totalHours = 0, weeklyHolidayPay = 0, hourlyRate = 0;
            
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
            
            const safeBaseSalary = Number(baseSalary) || 0;
            const safeHolidayPay = Number(weeklyHolidayPay) || 0;
            const safeTotalGross = safeBaseSalary + safeHolidayPay;

            const newData = { 
                userId: targetUser.id, 
                userName: targetUser.name, 
                userRole: targetUser.role, 
                yearMonth: selectedMonth, 
                hourlyRate: Number(hourlyRate) || 0, 
                baseSalary: safeBaseSalary, 
                totalHours: Number(totalHours) || 0, 
                weeklyHolidayPay: safeHolidayPay, 
                mealAllowance: 0, 
                bonus: 0, 
                totalGross: safeTotalGross, 
                deductions: initialDeductions, 
                netSalary: safeTotalGross, 
                status: 'calculated',
                updatedAt: serverTimestamp() 
            };
            
            const docId = `${targetUser.id}_${selectedMonth}`;
            
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), newData, { merge: true });
            
            const updatedPayrolls = { ...payrolls, [targetUser.id]: newData };
            setPayrolls(updatedPayrolls);
            
            const cacheKey = `imperial_payroll_v7_${selectedMonth}_admin`;
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));
            
        } catch (e) { 
            console.error("Calculation Sync Error:", e);
            alert("서버와 동기화 중 오류가 발생했습니다.\n" + e.message); 
        } finally { 
            setCalcProcessing(false); 
        }
    };

    const handleSaveEdit = async () => {
        if (!editingPayroll) return;
        
        setCalcProcessing(true);
        
        try {
            const safeBaseSalary = Number(editingPayroll.baseSalary) || 0;
            const safeHolidayPay = Number(editingPayroll.weeklyHolidayPay) || 0;
            const safeBonus = Number(editingPayroll.bonus) || 0;
            const safeMeal = Number(editingPayroll.mealAllowance) || 0;
            
            const gross = safeBaseSalary + safeHolidayPay + safeBonus + safeMeal;
            const totalDeductions = Object.values(editingPayroll.deductions).reduce((a, b) => a + (Number(b) || 0), 0);
            const net = gross - totalDeductions;
            
            const updatedData = { 
                ...editingPayroll, 
                baseSalary: safeBaseSalary,
                bonus: safeBonus,
                mealAllowance: safeMeal,
                totalGross: gross, 
                netSalary: net, 
                status: 'confirmed', 
                updatedAt: serverTimestamp() 
            };
            
            const docId = `${editingPayroll.userId}_${editingPayroll.yearMonth}`;
            
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), updatedData, { merge: true });
            
            const updatedPayrolls = { ...payrolls, [editingPayroll.userId]: updatedData };
            setPayrolls(updatedPayrolls);
            
            const cacheKey = `imperial_payroll_v7_${selectedMonth}_${isManagementMode ? 'admin' : currentUser.id}`;
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));
            
            setIsEditModalOpen(false);
        } catch(e) { 
            alert('상세 내역 저장에 실패했습니다: ' + e.message); 
        } finally {
            setCalcProcessing(false);
        }
    };

    const handleDownloadExcel = () => {
        const data = Object.values(payrolls).map(p => {
            const row = { '이름': p.userName, '직책': p.userRole === 'ta' ? '조교' : (p.userRole === 'lecturer' ? '강사' : '관리자'), '기본급/시급급여': p.baseSalary, '주휴수당': p.weeklyHolidayPay, '식대': p.mealAllowance, '상여금': p.bonus, '지급총액(세전)': p.totalGross };
            DEDUCTION_KEYS.forEach(key => { row[key] = p.deductions[key] || 0; });
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
        if (month > 12) { month = 1; year += 1; } else if (month < 1) { month = 12; year -= 1; }
        const newMonthStr = `${year}-${String(month).padStart(2, '0')}`;
        setSelectedMonth(newMonthStr);
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="space-y-6 w-full animate-in fade-in">
            {/* Header */}
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
                    <Button size="sm" variant="ghost" icon={RefreshCcw} onClick={() => { fetchPayrolls(true); fetchMonthlySessions(); }} title="데이터 새로고침" disabled={isLoading || isSessionsLoading} />
                    {isManagementMode && <Button onClick={handleDownloadExcel} icon={Download} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50 ml-2">엑셀</Button>}
                </div>
            </div>

            {/* Content Area */}
            {isManagementMode ? (
                <>
                    {/* 🚀 PDF 업로드 및 공제 자동입력 컴포넌트 */}
                    <PdfAutoFiller users={targetUsers} onExtractSuccess={handlePdfDataExtracted} />

                    {/* 모바일 카드 뷰 */}
                    <div className="md:hidden space-y-4">
                        {targetUsers.length === 0 && <div className="text-center py-10 text-gray-400">데이터가 없습니다.</div>}
                        {targetUsers.map(user => {
                            const payroll = payrolls[user.id];
                            const roleLabel = user.role === 'ta' ? '조교' : (user.role === 'lecturer' ? '강사' : '관리자');
                            return (
                                <Card key={user.id} className="p-5 flex flex-col gap-3">
                                    <div className="flex justify-between items-center border-b pb-2">
                                        <div>
                                            <span className="font-bold text-lg">{user.name}</span>
                                            <span className="text-xs text-gray-400 ml-1">({roleLabel})</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400">실수령액</span>
                                            <span className="font-bold text-green-600">{payroll ? formatCurrency(payroll.netSalary) : '-'}</span>
                                        </div>
                                    </div>
                                    <div className="text-sm space-y-1 text-gray-600">
                                        <div className="flex justify-between"><span>기본급/시급</span><span>{user.role === 'ta' ? (user.hourlyRate ? `${formatCurrency(user.hourlyRate)}/hr` : '미설정') : (payroll ? formatCurrency(payroll.baseSalary) : '미정')}</span></div>
                                        <div className="flex justify-between"><span>근무시간</span><span>{payroll ? `${payroll.totalHours} hrs` : '-'}</span></div>
                                        <div className="flex justify-between"><span>주휴수당</span><span className="text-blue-500">{payroll ? formatCurrency(payroll.weeklyHolidayPay) : '-'}</span></div>
                                        <div className="flex justify-between font-bold text-gray-800 border-t pt-1 mt-1"><span>지급총액(세전)</span><span>{payroll ? formatCurrency(payroll.totalGross) : '-'}</span></div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-2">
                                        {payroll ? (
                                            <Button size="sm" variant="secondary" icon={FileText} onClick={() => { setEditingPayroll(payroll); setIsEditModalOpen(true); }}>상세/공제 수정</Button>
                                        ) : (
                                            <Button size="sm" icon={calcProcessing ? Loader : Calculator} onClick={() => handleCalculate(user)} disabled={calcProcessing}>
                                                {calcProcessing ? '처리 중...' : '정산 하기'}
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>

                    {/* PC 테이블 뷰 */}
                    <div className="hidden md:block">
                        <Card className="overflow-hidden w-full p-0">
                            <div className="w-full overflow-x-auto">
                                <table className="w-full text-left text-sm min-w-[1000px]">
                                    <thead className="bg-gray-50 border-b text-gray-500">
                                        <tr>
                                            <th className="p-4 whitespace-nowrap">이름</th>
                                            <th className="p-4 whitespace-nowrap">역할</th>
                                            <th className="p-4 whitespace-nowrap">시급/기본급</th>
                                            <th className="p-4 whitespace-nowrap">근무시간</th>
                                            <th className="p-4 whitespace-nowrap">주휴수당</th>
                                            <th className="p-4 whitespace-nowrap">지급총액(세전)</th>
                                            <th className="p-4 whitespace-nowrap">실수령액(세후)</th>
                                            <th className="p-4 text-right whitespace-nowrap">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {targetUsers.map(user => {
                                            const payroll = payrolls[user.id];
                                            const roleLabel = user.role === 'ta' ? '조교' : (user.role === 'lecturer' ? '강사' : '관리자');
                                            return (
                                                <tr key={user.id} className="hover:bg-gray-50">
                                                    <td className="p-4 font-bold">{user.name}</td>
                                                    <td className="p-4 uppercase text-xs font-bold text-gray-400">{roleLabel}</td>
                                                    <td className="p-4">
                                                        {user.role === 'ta' ? (user.hourlyRate ? `${formatCurrency(user.hourlyRate)}/hr` : '미설정') : (payroll ? formatCurrency(payroll.baseSalary) : '미정')}
                                                    </td>
                                                    <td className="p-4">{payroll ? `${payroll.totalHours} hrs` : '-'}</td>
                                                    <td className="p-4 text-blue-600">{payroll ? formatCurrency(payroll.weeklyHolidayPay) : '-'}</td>
                                                    <td className="p-4 font-bold">{payroll ? formatCurrency(payroll.totalGross) : '-'}</td>
                                                    <td className="p-4 font-bold text-green-600">{payroll ? formatCurrency(payroll.netSalary) : '-'}</td>
                                                    <td className="p-4 flex justify-end gap-2">
                                                        {payroll ? (
                                                            <Button size="sm" variant="secondary" icon={FileText} onClick={() => { setEditingPayroll(payroll); setIsEditModalOpen(true); }}>상세/공제 수정</Button>
                                                        ) : (
                                                            <Button size="sm" icon={calcProcessing ? Loader : Calculator} onClick={() => handleCalculate(user)} disabled={calcProcessing}>
                                                                {calcProcessing ? '처리 중...' : '정산 하기'}
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
                    </div>
                </>
            ) : (
                <div className="w-full animate-in fade-in">
                    {payrolls[currentUser.id] ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* 좌측: 요약 카드 */}
                            <Card className="lg:col-span-1 border-t-4 border-t-blue-600 shadow-lg h-fit">
                                <div className="text-center mb-6 border-b pb-4">
                                    <h3 className="text-2xl font-bold text-gray-800">급여 명세서</h3>
                                    <Badge status="confirmed" />
                                    <p className="text-gray-500 mt-2">{selectedMonth} 귀속분</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-lg p-3 bg-gray-50 rounded-xl">
                                        <span className="text-gray-600">성명</span>
                                        <span className="font-bold">{currentUser.name}</span>
                                    </div>
                                    <div className="bg-blue-600 text-white p-5 rounded-xl flex flex-col items-center justify-center shadow-md">
                                        <span className="text-blue-100 text-sm mb-1">실수령액</span>
                                        <span className="text-3xl font-bold">{formatCurrency(payrolls[currentUser.id].netSalary)}</span>
                                    </div>
                                </div>
                            </Card>

                            {/* 우측: 상세 내역 */}
                            <Card className="lg:col-span-2 h-fit">
                                <h4 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-800">
                                    <FileText className="text-gray-500"/> 상세 내역
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                                        <p className="font-bold text-blue-600 mb-3 flex items-center gap-2"><Plus size={16}/> 지급 내역</p>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm"><span>기본급</span><span>{formatCurrency(payrolls[currentUser.id].baseSalary)}</span></div>
                                            <div className="flex justify-between text-sm"><span>주휴수당</span><span>{formatCurrency(payrolls[currentUser.id].weeklyHolidayPay)}</span></div>
                                            <div className="flex justify-between text-sm"><span>식대</span><span>{formatCurrency(payrolls[currentUser.id].mealAllowance)}</span></div>
                                            <div className="flex justify-between text-sm font-bold text-blue-600 bg-blue-50 p-1 rounded"><span>상여금</span><span>{formatCurrency(payrolls[currentUser.id].bonus)}</span></div>
                                            <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-lg"><span>지급계</span><span>{formatCurrency(payrolls[currentUser.id].totalGross)}</span></div>
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                                        <p className="font-bold text-red-500 mb-3 flex items-center gap-2"><DollarSign size={16}/> 공제 내역</p>
                                        <div className="space-y-2">
                                            {DEDUCTION_KEYS.map((key) => (
                                                <div key={key} className="flex justify-between text-sm text-gray-600">
                                                    <span>{key}</span><span>{formatCurrency(payrolls[currentUser.id].deductions?.[key])}</span>
                                                </div>
                                            ))}
                                            <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-lg text-gray-700"><span>공제계</span><span>{formatCurrency(Object.values(payrolls[currentUser.id].deductions || {}).reduce((a,b)=>a+(b||0),0))}</span></div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed text-gray-400 w-full flex flex-col items-center">
                            <AlertCircle className="mb-2 opacity-50 text-gray-400" size={48} />
                            <p className="text-lg">해당 월의 급여 내역이 아직 정산되지 않았습니다.</p>
                            <p className="text-sm mt-2">관리자 정산 직후라면 우측 상단의 <strong className="text-gray-600">새로고침</strong> 버튼을 눌러주세요.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Admin Edit Modal */}
            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="급여 상세 수정 (세무 입력)">
                {editingPayroll && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <Button className="w-full mt-4" onClick={handleSaveEdit} icon={calcProcessing ? Loader : Save} disabled={calcProcessing}>
                            {calcProcessing ? '저장 및 동기화 중...' : '저장 및 확정'}
                        </Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default PayrollManager;