/* [서비스 가치] 로컬 캐시 우선 전략으로 관리자 페이지 로딩 속도를 극대화하고, 
   PdfAutoFiller 세무 연동 및 실시간 스케줄 대조(Dynamic Sync)를 통해 완벽한 급여 정산을 실현합니다.
   (Updated: 강사(Lecturer) 고정급 정산 로직 추가 및 권한 우회 쿼리 완벽 적용) */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  DollarSign, Calendar, Calculator, Download, Save, Search, 
  FileText, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Loader, X, Wallet, RefreshCcw, Plus,
  AlertTriangle 
} from 'lucide-react';
import { collection, doc, setDoc, getDoc, getDocs, getDocFromServer, getDocsFromServer, query, where, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';
import PdfAutoFiller from './PdfAutoFiller';

const APP_ID = 'imperial-clinic-v1';

const DEDUCTION_KEYS = [
    '국민연금', '건강보험', '고용보험', '장기요양보험료', '소득세', '지방소득세'
];

const formatCurrency = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num || 0);

const getMonthRange = (yearMonth) => {
    const [y, m] = yearMonth.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const startStr = `${y}-${String(m).padStart(2,'0')}-01`;
    const endStr = `${y}-${String(m).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
    return { start, end, startStr, endStr };
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

    const [personalTab, setPersonalTab] = useState('summary'); 

    const isManagementMode = viewMode === 'management';

    const targetUsers = useMemo(() => {
        if (!isManagementMode) return [currentUser];
        const filtered = (users || []).filter(u => ['admin', 'lecturer', 'ta', 'admin_assistant'].includes(u.role));
        
        const userMap = new Map();
        filtered.forEach(user => {
            const existingUser = userMap.get(user.userId || user.id);
            if (!existingUser) {
                userMap.set(user.userId || user.id, user);
            } else {
                const isNewer = user.updatedAt && existingUser.updatedAt && (user.updatedAt > existingUser.updatedAt);
                const hasAuth = user.authUid && !existingUser.authUid;
                if (isNewer || hasAuth) {
                    userMap.set(user.userId || user.id, user);
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
                try { snapshot = await getDocsFromServer(q); } catch (err) { snapshot = await getDocs(q); }

                snapshot.forEach(docSnap => { 
                    const data = docSnap.data();
                    const userId = data.userId;
                    if (!userId) return; 

                    const expectedDocId = `${userId}_${selectedMonth}`;
                    if (docSnap.id !== expectedDocId) {
                        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', expectedDocId), data, { merge: true })
                            .then(() => deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docSnap.id)))
                            .catch(console.error);
                        fetchedData[userId] = { ...data, _docId: expectedDocId };
                    } else {
                        fetchedData[userId] = { ...data, _docId: expectedDocId };
                    }
                });
            } else {
                // 🚀 [CTO 패치] 권한 우회 쿼리 (본인 아이디로 명시적 검색)
                const q = query(
                    collection(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls'), 
                    where('userId', '==', currentUser.id), 
                    where('yearMonth', '==', selectedMonth)
                );
                let snapshot;
                try { snapshot = await getDocsFromServer(q); } catch (err) { snapshot = await getDocs(q); }
                if (!snapshot.empty) {
                    const docSnap = snapshot.docs[0];
                    fetchedData[currentUser.id] = { ...docSnap.data(), _docId: docSnap.id };
                }
            }

            setPayrolls(fetchedData);
            const now = Date.now();
            setLastUpdated(now);
            if (cacheTTL > 0) localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data: fetchedData }));

        } catch (e) { 
            console.error("Payroll Fetch Error:", e); 
            setPayrolls({}); 
        } finally { 
            setIsLoading(false); 
        }
    }, [selectedMonth, isManagementMode, currentUser]);

    const fetchMonthlyData = useCallback(async () => {
        setIsSessionsLoading(true);
        try {
            const { startStr, endStr } = getMonthRange(selectedMonth);
            const sQuery = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions'), where('date', '>=', startStr), where('date', '<=', endStr));
            const sSnap = await getDocs(sQuery);
            let sessions = sSnap.docs.map(d => d.data());
            
            if (!isManagementMode && currentUser) {
                sessions = sessions.filter(s => s.taId === currentUser.id || s.taName === currentUser.name);
            }
            setMonthlySessions(sessions);
        } catch (e) { console.error("Session Fetch Error:", e); } 
        finally { setIsSessionsLoading(false); }
    }, [selectedMonth, isManagementMode, currentUser]);

    useEffect(() => { setPayrolls({}); fetchPayrolls(false); fetchMonthlyData(); }, [selectedMonth, fetchPayrolls, fetchMonthlyData]);

    const myWeeklyBreakdown = useMemo(() => {
        if (isManagementMode || !['ta', 'admin_assistant'].includes(currentUser?.role)) return [];
        
        const wage = currentUser.hourlyRate || currentUser.hourlyWage || 10030;
        const hourlyRate = parseInt(wage, 10);
        
        const validLogs = monthlySessions.filter(s => ['open', 'confirmed', 'completed', 'pending'].includes(s.status)).map(s => {
            const startH = parseInt((s.startTime||'00:00').split(':')[0], 10);
            const endH = parseInt((s.endTime||'00:00').split(':')[0], 10);
            return { date: s.date, hours: endH - startH };
        });

        const weekGroups = {};
        validLogs.forEach(log => {
            const d = new Date(log.date);
            const day = d.getDay(); 
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const weekStart = new Date(d.setDate(diff));
            const weekKey = weekStart.toISOString().split('T')[0];
            weekGroups[weekKey] = (weekGroups[weekKey] || 0) + log.hours;
        });

        const sortedWeeks = Object.keys(weekGroups).sort();
        
        return sortedWeeks.map((weekKey, index) => {
            const hours = weekGroups[weekKey];
            const meetsHolidayPay = hours >= 15;
            const holidayPay = meetsHolidayPay ? Math.round((Math.min(hours, 40) / 40) * 8 * hourlyRate) : 0;
            const basePay = hours * hourlyRate;
            
            const wStart = new Date(weekKey);
            const wEnd = new Date(wStart);
            wEnd.setDate(wStart.getDate() + 6);
            const weekEndStr = wEnd.toISOString().split('T')[0].substring(5).replace('-', '/');
            const weekStartStr = weekKey.substring(5).replace('-', '/');
            
            return {
                label: `${index + 1}주차 (${weekStartStr} ~ ${weekEndStr})`,
                hours,
                meetsHolidayPay,
                holidayPay,
                basePay
            };
        });
    }, [monthlySessions, currentUser, isManagementMode]);

    // 🚀 [CTO 패치] 강사(Lecturer) 고정급 추출 로직 추가!
    const getRealtimeCalculation = useCallback((targetUser) => {
        const uid = targetUser.id || targetUser.userId;
        let baseSalary = 0, totalHours = 0, weeklyHolidayPay = 0, hourlyRate = 0;
        let completedHours = 0, expectedHours = 0;

        if (targetUser.role === 'ta' || targetUser.role === 'admin_assistant') {
            const wage = targetUser.hourlyRate || targetUser.hourlyWage || 10030;
            hourlyRate = parseInt(wage, 10);
            const todayStr = new Date().toISOString().split('T')[0];

            const userSessions = monthlySessions.filter(s =>
                (s.taId === uid || s.taName === targetUser.name) &&
                ['open', 'confirmed', 'completed', 'pending'].includes(s.status)
            );

            const validLogs = userSessions.map(s => {
                const startH = parseInt((s.startTime||'00:00').split(':')[0], 10);
                const endH = parseInt((s.endTime||'00:00').split(':')[0], 10);
                return { date: s.date, hours: endH - startH };
            });

            completedHours = validLogs.filter(l => l.date <= todayStr).reduce((sum, l) => sum + l.hours, 0);
            expectedHours = validLogs.filter(l => l.date > todayStr).reduce((sum, l) => sum + l.hours, 0);
            totalHours = completedHours + expectedHours;

            const weekGroups = {};
            validLogs.forEach(log => {
                const d = new Date(log.date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const weekKey = new Date(d.setDate(diff)).toISOString().split('T')[0];
                weekGroups[weekKey] = (weekGroups[weekKey] || 0) + log.hours;
            });

            Object.values(weekGroups).forEach(hours => {
                if (hours >= 15) {
                    weeklyHolidayPay += (Math.min(hours, 40) / 40) * 8 * hourlyRate;
                }
            });

            weeklyHolidayPay = Math.round(weeklyHolidayPay);
            baseSalary = Math.floor(totalHours * hourlyRate);
        } else {
            // 🚀 강사 및 관리자는 DB에 등록된 월급/기본급을 1순위로 가져옵니다.
            baseSalary = parseInt(targetUser.monthlySalary || targetUser.baseSalary || targetUser.fixedSalary || targetUser.hourlyRate || targetUser.hourlyWage || 0, 10);
            if (isNaN(baseSalary)) baseSalary = 0;
        }

        return { baseSalary, weeklyHolidayPay, totalHours, completedHours, expectedHours, totalGross: baseSalary + weeklyHolidayPay, hourlyRate };
    }, [monthlySessions]);

    const handlePdfDataExtracted = async (extractedData) => {
        setCalcProcessing(true);
        try {
            const updatedPayrolls = { ...payrolls };
            const promises = [];
            let updateCount = 0;
            const nowISO = new Date().toISOString(); 

            for (const user of targetUsers) {
                const autoData = extractedData[user.id || user.userId];
                if (autoData) {
                    let currentPayroll = updatedPayrolls[user.id || user.userId];
                    
                    if (!currentPayroll) {
                        currentPayroll = {
                            userId: user.id || user.userId, userName: user.name, userRole: user.role, yearMonth: selectedMonth, hourlyRate: Number(user.hourlyRate || user.hourlyWage) || 0,
                            baseSalary: 0, totalHours: 0, weeklyHolidayPay: 0, mealAllowance: 0, bonus: 0, totalGross: 0,
                            deductions: { '국민연금': 0, '건강보험': 0, '고용보험': 0, '장기요양보험료': 0, '소득세': 0, '지방소득세': 0 },
                            netSalary: 0, status: 'calculated'
                        };
                    }

                    const newDeductions = {
                        ...currentPayroll.deductions,
                        '국민연금': autoData.nationalPension || 0, '건강보험': autoData.healthInsurance || 0, '고용보험': autoData.employmentInsurance || 0,
                        '장기요양보험료': autoData.longTermCare || 0, '소득세': autoData.taxIncome || 0, '지방소득세': autoData.taxLocal || 0
                    };

                    const gross = (Number(currentPayroll.baseSalary) || 0) + (Number(currentPayroll.weeklyHolidayPay) || 0) + (Number(currentPayroll.bonus) || 0) + (Number(currentPayroll.mealAllowance) || 0);
                    const totalDeductions = Object.values(newDeductions).reduce((a, b) => a + (Number(b) || 0), 0);
                    const net = gross - totalDeductions;

                    const dbPayload = { ...currentPayroll, totalGross: gross, deductions: newDeductions, netSalary: net, status: 'confirmed', updatedAt: serverTimestamp() };
                    delete dbPayload._docId; 

                    const localPayload = { ...dbPayload, updatedAt: nowISO, _docId: `${user.id || user.userId}_${selectedMonth}` };
                    updatedPayrolls[user.id || user.userId] = localPayload;
                    
                    promises.push(setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', localPayload._docId), dbPayload, { merge: true }));
                    updateCount++;
                }
            }
            if (promises.length > 0) {
                await Promise.all(promises);
                setPayrolls(updatedPayrolls);
                localStorage.setItem(`imperial_payroll_v7_${selectedMonth}_admin`, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));
                alert(`성공! 총 ${updateCount}명의 공제 내역이 적용되었습니다.`);
            }
        } catch (e) { alert("공제 내역 오류: " + e.message); } finally { setCalcProcessing(false); }
    };

    const handleCalculate = async (targetUser) => {
        if (!isManagementMode) return;
        const uid = targetUser.id || targetUser.userId;
        const wage = targetUser.hourlyRate || targetUser.hourlyWage;

        if ((targetUser.role === 'ta' || targetUser.role === 'admin_assistant') && !wage) { 
            alert(`${targetUser.name}님의 시급 정보가 없습니다. 직원 관리 메뉴에서 시급을 설정해주세요.`); 
            return; 
        }
        
        setCalcProcessing(true);
        try {
            const rt = getRealtimeCalculation(targetUser);
            
            const existingPayroll = payrolls[uid];
            const initialDeductions = existingPayroll?.deductions || Object.fromEntries(DEDUCTION_KEYS.map(k => [k, 0]));
            const savedBonus = existingPayroll?.bonus || 0;
            const savedMeal = existingPayroll?.mealAllowance || 0;

            const newTotalGross = rt.baseSalary + rt.weeklyHolidayPay + savedBonus + savedMeal;
            const totalDeductionsAmount = Object.values(initialDeductions).reduce((a,b) => a + (Number(b)||0), 0);
            
            const dbPayload = { 
                userId: uid, userName: targetUser.name, userRole: targetUser.role, yearMonth: selectedMonth, 
                hourlyRate: rt.hourlyRate, 
                baseSalary: rt.baseSalary, 
                totalHours: rt.totalHours, 
                completedHours: rt.completedHours, 
                expectedHours: rt.expectedHours, 
                weeklyHolidayPay: rt.weeklyHolidayPay, 
                mealAllowance: savedMeal, 
                bonus: savedBonus, 
                totalGross: newTotalGross, 
                deductions: initialDeductions, 
                netSalary: newTotalGross - totalDeductionsAmount, 
                status: existingPayroll?.status || 'calculated', 
                updatedAt: serverTimestamp() 
            };
            
            const docId = `${uid}_${selectedMonth}`;
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), dbPayload, { merge: true });
            
            const localPayload = { ...dbPayload, updatedAt: new Date().toISOString(), _docId: docId };
            const updatedPayrolls = { ...payrolls, [uid]: localPayload };
            setPayrolls(updatedPayrolls);
            localStorage.setItem(`imperial_payroll_v7_${selectedMonth}_admin`, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));
            
        } catch (e) { alert("동기화 오류: " + e.message); } finally { setCalcProcessing(false); }
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
            
            const dbPayload = { ...editingPayroll, baseSalary: safeBaseSalary, bonus: safeBonus, mealAllowance: safeMeal, totalGross: gross, netSalary: net, status: 'confirmed', updatedAt: serverTimestamp() };
            delete dbPayload._docId;
            
            const docId = `${editingPayroll.userId}_${editingPayroll.yearMonth}`;
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'payrolls', docId), dbPayload, { merge: true });
            
            const localPayload = { ...dbPayload, updatedAt: new Date().toISOString(), _docId: docId };
            const updatedPayrolls = { ...payrolls, [editingPayroll.userId]: localPayload };
            setPayrolls(updatedPayrolls);
            localStorage.setItem(`imperial_payroll_v7_${selectedMonth}_${isManagementMode ? 'admin' : currentUser.id}`, JSON.stringify({ timestamp: Date.now(), data: updatedPayrolls }));
            setIsEditModalOpen(false);
        } catch(e) { alert('수정 실패: ' + e.message); } finally { setCalcProcessing(false); }
    };

    const handleDownloadExcel = () => {
        const data = Object.values(payrolls).map((p, index) => {
            const user = targetUsers.find(u => (u.id || u.userId) === p.userId) || {};
            return {
                '순번': index + 1, '입금은행': user.bankName || '', '입금계좌예금주명': p.userName,
                '입금계좌번호': user.accountNumber || '', '입금금액': p.netSalary
            };
        });
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "이체대행목록");
        XLSX.writeFile(wb, `급여 이체대행 목록_${selectedMonth}.xlsx`);
    };

    const handleMonthChange = (offset) => {
        const [yearStr, monthStr] = selectedMonth.split('-');
        let year = parseInt(yearStr, 10); let month = parseInt(monthStr, 10) + offset;
        if (month > 12) { month = 1; year += 1; } else if (month < 1) { month = 12; year -= 1; }
        setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
    };

    const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div className="space-y-6 w-full animate-in fade-in pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>
                    <h2 className="text-2xl font-bold text-gray-800">{selectedMonth.split('-')[0]}년 {selectedMonth.split('-')[1]}월 급여</h2>
                    <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight /></button>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-400 mr-2 flex items-center gap-1">
                        {isLoading ? <span className="text-blue-500 flex items-center gap-1"><Loader size={12} className="animate-spin"/> 로딩 중</span> : (lastUpdated ? `업데이트: ${formatTime(lastUpdated)}` : '')}
                    </div>
                    <Button size="sm" variant="ghost" icon={RefreshCcw} onClick={() => { fetchPayrolls(true); fetchMonthlyData(); }} disabled={isLoading || isSessionsLoading} />
                    {isManagementMode && <Button onClick={handleDownloadExcel} icon={Download} variant="outline" className="border-green-200 text-green-700 hover:bg-green-50 ml-2">이체용 엑셀</Button>}
                </div>
            </div>

            {/* Content Area */}
            {isManagementMode ? (
                <>
                    <PdfAutoFiller users={targetUsers} onExtractSuccess={handlePdfDataExtracted} />

                    <div className="md:hidden space-y-4">
                        {targetUsers.length === 0 && <div className="text-center py-10 text-gray-400">데이터가 없습니다.</div>}
                        {targetUsers.map(user => {
                            const uid = user.id || user.userId;
                            const payroll = payrolls[uid];
                            const roleLabel = user.role === 'ta' ? '수업조교' : (user.role === 'admin_assistant' ? '행정조교' : (user.role === 'lecturer' ? '강사' : '관리자'));
                            const wage = user.hourlyRate || user.hourlyWage;
                            
                            // 🚀 [CTO 패치] 강사의 화면 표시 시급(기본급)
                            const wageDisplay = ['ta', 'admin_assistant'].includes(user.role) 
                                ? (wage ? `${formatCurrency(wage)}/hr` : '미설정') 
                                : (user.monthlySalary || user.baseSalary || user.fixedSalary ? formatCurrency(user.monthlySalary || user.baseSalary || user.fixedSalary) : '미정');

                            let needsSync = false;
                            if (payroll && ['ta', 'admin_assistant'].includes(user.role)) {
                                const rt = getRealtimeCalculation(user);
                                if (payroll.totalHours !== rt.totalHours || (payroll.baseSalary + payroll.weeklyHolidayPay) !== (rt.baseSalary + rt.weeklyHolidayPay)) {
                                    needsSync = true;
                                }
                            }

                            return (
                                <Card key={uid} className={`p-5 flex flex-col gap-3 transition-all ${needsSync ? 'border-orange-300 shadow-md ring-2 ring-orange-50' : ''}`}>
                                    <div className="flex justify-between items-center border-b pb-2">
                                        <div>
                                            <span className="font-bold text-lg">{user.name}</span>
                                            <span className={`text-xs ml-2 px-2 py-0.5 rounded-full font-bold ${user.role==='admin_assistant' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>{roleLabel}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400">실수령액</span>
                                            <span className="font-bold text-green-600 text-lg">{payroll ? formatCurrency(payroll.netSalary) : '-'}</span>
                                        </div>
                                    </div>
                                    <div className="text-sm space-y-1 text-gray-600">
                                        <div className="flex justify-between"><span>시급/기본급</span><span>{wageDisplay}</span></div>
                                        <div className="flex justify-between items-center">
                                            <span>근무시간</span>
                                            <div className="text-right">
                                                <span>{payroll ? (payroll.totalHours > 0 ? `${payroll.totalHours} hrs` : '-') : '-'}</span>
                                                {payroll && payroll.expectedHours > 0 && <p className="text-[10px] text-purple-500 font-bold">(예정 {payroll.expectedHours}h 포함)</p>}
                                            </div>
                                        </div>
                                        <div className="flex justify-between"><span>주휴수당</span><span className="text-blue-500">{payroll ? formatCurrency(payroll.weeklyHolidayPay) : '-'}</span></div>
                                        <div className="flex justify-between font-bold text-gray-800 border-t pt-1 mt-1"><span>지급총액(세전)</span><span>{payroll ? formatCurrency(payroll.totalGross) : '-'}</span></div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-2 mt-2">
                                        {payroll ? (
                                            <>
                                                {needsSync && (
                                                    <div className="flex flex-col gap-2 items-end w-full">
                                                        <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded text-center animate-pulse flex items-center justify-center gap-1 w-full border border-orange-200">
                                                            <AlertTriangle size={12}/> 스케줄 변동 감지됨
                                                        </span>
                                                        <Button size="sm" onClick={() => handleCalculate(user)} disabled={calcProcessing} className="bg-orange-500 hover:bg-orange-600 border-0 text-white w-full shadow-md">
                                                            {calcProcessing ? <Loader className="animate-spin" size={14}/> : <RefreshCcw size={14}/>} 변동 갱신 (재정산)
                                                        </Button>
                                                    </div>
                                                )}
                                                <Button size="sm" variant="secondary" icon={FileText} onClick={() => { setEditingPayroll(payroll); setIsEditModalOpen(true); }} className="w-full">
                                                    상세/공제 수정
                                                </Button>
                                            </>
                                        ) : (
                                            <Button size="sm" icon={calcProcessing ? Loader : Calculator} onClick={() => handleCalculate(user)} disabled={calcProcessing} className="w-full">
                                                {calcProcessing ? '처리 중...' : '정산 하기'}
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>

                    <div className="hidden md:block">
                        <Card className="overflow-hidden w-full p-0">
                            <div className="w-full overflow-x-auto">
                                <table className="w-full text-left text-sm min-w-[1000px]">
                                    <thead className="bg-gray-50 border-b text-gray-500">
                                        <tr>
                                            <th className="p-4 whitespace-nowrap">이름</th>
                                            <th className="p-4 whitespace-nowrap">역할</th>
                                            <th className="p-4 whitespace-nowrap">시급/기본급</th>
                                            <th className="p-4 whitespace-nowrap">근무시간 (가마감)</th>
                                            <th className="p-4 whitespace-nowrap">주휴수당</th>
                                            <th className="p-4 whitespace-nowrap">지급총액(세전)</th>
                                            <th className="p-4 whitespace-nowrap">실수령액(세후)</th>
                                            <th className="p-4 text-right whitespace-nowrap w-48">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {targetUsers.map(user => {
                                            const uid = user.id || user.userId;
                                            const payroll = payrolls[uid];
                                            const roleLabel = user.role === 'ta' ? '수업조교' : (user.role === 'admin_assistant' ? '행정조교' : (user.role === 'lecturer' ? '강사' : '관리자'));
                                            const wage = user.hourlyRate || user.hourlyWage;

                                            const wageDisplay = ['ta', 'admin_assistant'].includes(user.role) 
                                                ? (wage ? `${formatCurrency(wage)}/hr` : '미설정') 
                                                : (user.monthlySalary || user.baseSalary || user.fixedSalary ? formatCurrency(user.monthlySalary || user.baseSalary || user.fixedSalary) : '미정');

                                            let needsSync = false;
                                            if (payroll && ['ta', 'admin_assistant'].includes(user.role)) {
                                                const rt = getRealtimeCalculation(user);
                                                if (payroll.totalHours !== rt.totalHours || (payroll.baseSalary + payroll.weeklyHolidayPay) !== (rt.baseSalary + rt.weeklyHolidayPay)) {
                                                    needsSync = true;
                                                }
                                            }

                                            return (
                                                <tr key={uid} className={`hover:bg-gray-50 ${needsSync ? 'bg-orange-50/30' : ''}`}>
                                                    <td className="p-4 font-bold">{user.name}</td>
                                                    <td className="p-4 text-xs font-bold"><span className={`px-2 py-1 rounded-md ${user.role==='admin_assistant' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>{roleLabel}</span></td>
                                                    <td className="p-4">{wageDisplay}</td>
                                                    <td className="p-4">
                                                        {payroll ? (payroll.totalHours > 0 ? <span className="font-bold">{payroll.totalHours} hrs</span> : '-') : '-'}
                                                        {payroll && payroll.expectedHours > 0 && <span className="ml-2 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-bold">예정 {payroll.expectedHours}h 포함</span>}
                                                    </td>
                                                    <td className="p-4 text-blue-600 font-bold">{payroll ? formatCurrency(payroll.weeklyHolidayPay) : '-'}</td>
                                                    <td className="p-4 font-bold">{payroll ? formatCurrency(payroll.totalGross) : '-'}</td>
                                                    <td className="p-4 font-bold text-green-600">{payroll ? formatCurrency(payroll.netSalary) : '-'}</td>
                                                    <td className="p-4 flex flex-col items-end gap-2">
                                                        {payroll ? (
                                                            <>
                                                                {needsSync && (
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded flex items-center gap-1 animate-pulse border border-orange-200 whitespace-nowrap">
                                                                            <AlertTriangle size={12}/> 스케줄 변동
                                                                        </span>
                                                                        <Button size="sm" icon={calcProcessing ? Loader : RefreshCcw} onClick={() => handleCalculate(user)} disabled={calcProcessing} className="bg-orange-500 hover:bg-orange-600 border-0 text-white shadow-sm whitespace-nowrap">
                                                                            재정산
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                                <Button size="sm" variant="secondary" icon={FileText} onClick={() => { setEditingPayroll(payroll); setIsEditModalOpen(true); }} className={needsSync ? "w-full" : "whitespace-nowrap"}>
                                                                    상세/공제 수정
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Button size="sm" icon={calcProcessing ? Loader : Calculator} onClick={() => handleCalculate(user)} disabled={calcProcessing} className="whitespace-nowrap">
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
                            <Card className="lg:col-span-1 border-t-4 border-t-blue-600 shadow-lg h-fit">
                                <div className="text-center mb-6 border-b pb-4">
                                    <h3 className="text-2xl font-bold text-gray-800">급여 명세서</h3>
                                    <Badge status="confirmed" />
                                    <p className="text-gray-500 mt-2">{selectedMonth} 귀속분</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-lg p-3 bg-gray-50 rounded-xl">
                                        <span className="text-gray-600">성명</span><span className="font-bold">{currentUser.name}</span>
                                    </div>
                                    <div className="bg-blue-600 text-white p-5 rounded-xl flex flex-col items-center justify-center shadow-md">
                                        <span className="text-blue-100 text-sm mb-1">실수령액</span><span className="text-3xl font-bold">{formatCurrency(payrolls[currentUser.id].netSalary)}</span>
                                    </div>
                                </div>
                            </Card>

                            <Card className="lg:col-span-2 h-fit p-0 overflow-hidden">
                                <div className="flex border-b bg-gray-50">
                                    <button onClick={() => setPersonalTab('summary')} className={`flex-1 py-4 font-bold text-sm transition-colors ${personalTab === 'summary' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>
                                        급여 요약 내역
                                    </button>
                                    {['ta', 'admin_assistant'].includes(currentUser.role) && (
                                        <button onClick={() => setPersonalTab('weekly')} className={`flex-1 py-4 font-bold text-sm transition-colors ${personalTab === 'weekly' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}>
                                            주차별 산출 상세
                                        </button>
                                    )}
                                </div>

                                <div className="p-6">
                                    {personalTab === 'summary' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
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
                                                        <div key={key} className="flex justify-between text-sm text-gray-600"><span>{key}</span><span>{formatCurrency(payrolls[currentUser.id].deductions?.[key])}</span></div>
                                                    ))}
                                                    <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-lg text-gray-700"><span>공제계</span><span>{formatCurrency(Object.values(payrolls[currentUser.id].deductions || {}).reduce((a,b)=>a+(b||0),0))}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {personalTab === 'weekly' && (
                                        <div className="space-y-4 animate-in fade-in">
                                            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm leading-relaxed">
                                                <p className="font-black flex items-center gap-1.5 mb-2"><Calculator size={16}/> 임페리얼 학원 수당 산출 공식</p>
                                                <ul className="list-disc pl-5 opacity-90 space-y-1.5 font-medium">
                                                    <li><strong className="text-blue-900">기본급:</strong> 주차별 근무시간 × 나의 시급({formatCurrency(currentUser.hourlyRate || currentUser.hourlyWage || 10030)})</li>
                                                    <li><strong className="text-blue-900">주휴수당 조건:</strong> 1주(월~일) 간 <span className="underline decoration-blue-400">15시간 이상 근무 시</span> 1일 유급휴일 수당 지급</li>
                                                    <li><strong className="text-blue-900">주휴수당 계산식:</strong> (주 근무시간 ÷ 40시간) × 8시간 × 시급 <span className="text-[10px] bg-blue-100 px-1 rounded">(주 40시간 초과 시 최대 40시간까지만 인정)</span></li>
                                                </ul>
                                            </div>
                                            
                                            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-gray-50 text-gray-500 border-b">
                                                        <tr>
                                                            <th className="p-3">주차 (월~일 기준)</th>
                                                            <th className="p-3 text-center">주간 총 근무시간</th>
                                                            <th className="p-3 text-right">산출 기본급</th>
                                                            <th className="p-3 text-center">주휴조건(15h)</th>
                                                            <th className="p-3 text-right">산출 주휴수당</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {myWeeklyBreakdown.length === 0 ? (
                                                            <tr><td colSpan="5" className="p-8 text-center text-gray-400 font-bold">이번 달 확정된 클리닉 근무 내역이 없습니다.</td></tr>
                                                        ) : myWeeklyBreakdown.map((week, idx) => (
                                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                                <td className="p-3 font-bold text-gray-700">{week.label}</td>
                                                                <td className="p-3 text-center font-black text-blue-600">{week.hours}시간</td>
                                                                <td className="p-3 text-right text-gray-700 font-medium">{formatCurrency(week.basePay)}</td>
                                                                <td className="p-3 text-center">
                                                                    {week.meetsHolidayPay ? (
                                                                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-black flex items-center justify-center w-fit mx-auto gap-1"><CheckCircle size={10}/> 충족</span>
                                                                    ) : (
                                                                        <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-xs font-bold">미달</span>
                                                                    )}
                                                                </td>
                                                                <td className={`p-3 text-right font-black ${week.meetsHolidayPay ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                                    {formatCurrency(week.holidayPay)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                    <tfoot className="bg-blue-50/50 border-t-2 border-blue-200 font-black">
                                                        <tr>
                                                            <td className="p-3 text-blue-900">월간 총 합계</td>
                                                            <td className="p-3 text-center text-blue-700">{myWeeklyBreakdown.reduce((sum, w) => sum + w.hours, 0)}시간</td>
                                                            <td className="p-3 text-right text-blue-900">{formatCurrency(myWeeklyBreakdown.reduce((sum, w) => sum + w.basePay, 0))}</td>
                                                            <td className="p-3"></td>
                                                            <td className="p-3 text-right text-emerald-600">{formatCurrency(myWeeklyBreakdown.reduce((sum, w) => sum + w.holidayPay, 0))}</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed text-gray-400 w-full flex flex-col items-center">
                            <AlertCircle className="mb-2 opacity-50 text-gray-400" size={48} />
                            <p className="text-lg">해당 월의 급여 내역이 아직 정산되지 않았습니다.</p>
                            <p className="text-sm mt-2">관리자가 정산을 완료하면 이곳에서 급여 명세서를 확인하실 수 있습니다.</p>
                        </div>
                    )}
                </div>
            )}

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="급여 상세 수정 (세무 입력)">
                {editingPayroll && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">기본급 (수동 조정)</label><input type="number" className="w-full border p-2 rounded" value={editingPayroll.baseSalary} onChange={e => setEditingPayroll({...editingPayroll, baseSalary: Number(e.target.value)})} /></div>
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">상여금</label><input type="number" className="w-full border p-2 rounded" value={editingPayroll.bonus} onChange={e => setEditingPayroll({...editingPayroll, bonus: Number(e.target.value)})} /></div>
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">식대</label><input type="number" className="w-full border p-2 rounded" value={editingPayroll.mealAllowance} onChange={e => setEditingPayroll({...editingPayroll, mealAllowance: Number(e.target.value)})} /></div>
                            <div><label className="block text-xs font-bold text-gray-500 mb-1">주휴수당 (자동계산됨)</label><input type="number" className="w-full border p-2 rounded bg-gray-100" value={editingPayroll.weeklyHolidayPay} readOnly /></div>
                        </div>
                        <div className="border-t pt-4">
                            <h4 className="font-bold text-sm text-red-500 mb-2">공제 내역 입력 (세무사 전달값 자동입력됨)</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {DEDUCTION_KEYS.map(key => (
                                    <div key={key}>
                                        <label className="block text-xs text-gray-500">{key}</label>
                                        <input type="number" className="w-full border p-2 rounded text-right" value={editingPayroll.deductions?.[key] || 0} onChange={e => setEditingPayroll({...editingPayroll, deductions: { ...editingPayroll.deductions, [key]: Number(e.target.value) }})} />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Button className="w-full mt-4" onClick={handleSaveEdit} icon={calcProcessing ? Loader : Save} disabled={calcProcessing}>{calcProcessing ? '저장 중...' : '저장 및 확정'}</Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default PayrollManager;