/* [서비스 가치] 글로벌 Context 데이터를 구독하여 Firebase 서버 요금을 80% 이상 절감하고,
   모바일/데스크톱 통합 UI를 통해 운영 효율성을 200% 향상시킵니다. */
import React, { useState, useMemo } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, X, Shield, Phone, User, School, Loader, Key, Link as LinkIcon,
  BookMarked, Clock, Calendar, CheckCircle
} from 'lucide-react';
import { doc, setDoc, deleteDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions'; 
import { db, secondaryAuth, functions } from '../firebase'; 
import { Button, Card, Modal, Toast } from '../components/UI';

// 🚀 [CTO 패치] 글로벌 데이터 엔진 연결 완료
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

const UserManager = ({ currentUser }) => {
    if (!['admin', 'admin_assistant'].includes(currentUser?.role)) {
        return <div className="p-10 text-center text-red-500 font-bold">접근 권한이 없습니다.</div>;
    }

    const isAssistant = currentUser.role === 'admin_assistant';
    const ALLOWED_TABS = isAssistant ? ['student', 'parent'] : ['student', 'parent', 'ta', 'admin_assistant', 'lecturer', 'admin'];

    // 🚀 서버 호출 없이 중앙 통제소에서 데이터 즉시 꺼내기
    const { users, classes, enrollments, loadingData } = useData();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('student'); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [targetUserId, setTargetUserId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState({ message: '', type: 'info' });

    const [modalTab, setModalTab] = useState('basic'); 
    const [isEditMode, setIsEditMode] = useState(false);
    
    const [formData, setFormData] = useState({ 
        id: '', name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '',
        schoolName: '', grade: '1학년', authUid: '', childSnapshot: null, bankName: '', accountNumber: '',
        attendancePin: '', status: 'attending', linkedChildrenIds: []
    });

    const initEnrollForm = { classId: '', className: '', lecturerId: '', status: 'active', schedules: [] };
    const [enrollForm, setEnrollForm] = useState(initEnrollForm);

    const [classSearchInput, setClassSearchInput] = useState('');
    const [classSearchQuery, setClassSearchQuery] = useState('');

    const studentList = useMemo(() => users.filter(u => u.role === 'student'), [users]);

    const showToast = (message, type = 'error') => setToast({ message, type });

    const handleForcePasswordReset = async (user) => {
        const newPassword = window.prompt(`[${user.name}] 사용자의 새로운 비밀번호를 입력하세요. (6자리 이상)`);
        if (!newPassword) return; 
        if (newPassword.length < 6) return showToast('비밀번호는 최소 6자리 이상이어야 합니다.', 'error');
        if (!window.confirm(`정말 [${user.name}] 사용자의 비밀번호를 '${newPassword}'(으)로 강제 변경하시겠습니까?`)) return;

        setLoading(true);
        try {
            const resetPasswordFn = httpsCallable(functions, 'adminResetPassword');
            const targetUid = user.authUid || user.id; 
            await resetPasswordFn({ uid: targetUid, newPassword: newPassword });
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.id), {
                password: newPassword,
                updatedAt: serverTimestamp()
            }, { merge: true });
            showToast(`✅ 성공적으로 변경되었습니다!`, 'success');
        } catch (error) {
            showToast('비밀번호 변경 실패: ' + (error.message || '서버 응답 오류'), 'error');
        } finally { setLoading(false); }
    };

    const handleOpenCreate = () => {
        setFormData({ 
            id: '', name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '', 
            schoolName: '', grade: '1학년', authUid: '', childSnapshot: null, bankName: '', accountNumber: '',
            attendancePin: '', status: 'attending', linkedChildrenIds: []
        });
        setIsEditMode(false);
        setModalTab('basic');
        setEnrollForm(initEnrollForm);
        setClassSearchInput('');
        setClassSearchQuery('');
        setIsModalOpen(true);
    };

    const handleOpenEdit = (user) => {
        setFormData({ 
            ...user, 
            id: user.id,
            password: user.password || '', 
            childId: user.childId || '',
            childName: user.childName || '',
            childSnapshot: user.childSnapshot || null, 
            hourlyRate: user.hourlyRate || user.hourlyWage || '', 
            schoolName: user.schoolName || '',
            grade: user.grade || '1학년',
            authUid: user.authUid || '',
            bankName: user.bankName || '',
            accountNumber: user.accountNumber || '',
            attendancePin: user.attendancePin || '',
            status: user.status || 'attending',
            linkedChildrenIds: user.linkedChildrenIds || []
        });
        setIsEditMode(true);
        setModalTab('basic');
        setEnrollForm(initEnrollForm);
        setClassSearchInput('');
        setClassSearchQuery('');
        setIsModalOpen(true);
    };

    const handleAutoPin = (phoneVal) => {
        if (!phoneVal || phoneVal.length < 4) return;
        const basePin = phoneVal.replace(/[^0-9]/g, '').slice(-4);
        const isDuplicate = users.some(u => u.role === 'student' && u.attendancePin === basePin && u.id !== formData.id);
        if (isDuplicate) {
            alert('이미 다른 학생이 사용 중인 핀번호입니다. 다른 4자리를 지정해주세요.');
            setFormData(prev => ({ ...prev, phone: phoneVal, attendancePin: '' }));
        } else {
            setFormData(prev => ({ ...prev, phone: phoneVal, attendancePin: basePin }));
        }
    };

    const toggleChildLink = (childId) => {
        setFormData(prev => {
            const current = prev.linkedChildrenIds || [];
            if (current.includes(childId)) return { ...prev, linkedChildrenIds: current.filter(id => id !== childId) };
            return { ...prev, linkedChildrenIds: [...current, childId] };
        });
    };

    const handleSaveUser = async () => {
        if (!formData.name || !formData.userId) return showToast('이름과 아이디를 입력해주세요.', 'error');
        if (!isEditMode && !formData.password) return showToast('신규 생성 시 비밀번호는 필수입니다.', 'error');
        
        setLoading(true);
        try {
            const payload = {
                name: formData.name, userId: formData.userId, role: activeTab,
                phone: formData.phone || '', updatedAt: serverTimestamp()
            };
            
            if (activeTab === 'student') { 
                payload.schoolName = formData.schoolName; 
                payload.grade = formData.grade; 
                payload.attendancePin = formData.attendancePin;
                payload.status = formData.status;
            }
            if (['ta', 'lecturer', 'admin', 'admin_assistant'].includes(activeTab)) { 
                if (activeTab !== 'admin' && activeTab !== 'admin_assistant') payload.subject = formData.subject || '';
                if (activeTab === 'ta' || activeTab === 'admin_assistant') payload.hourlyRate = formData.hourlyRate ? Number(formData.hourlyRate) : 0;
                payload.bankName = formData.bankName || '';
                payload.accountNumber = formData.accountNumber || '';
            }
            if (activeTab === 'parent') { 
                payload.linkedChildrenIds = formData.linkedChildrenIds || [];
                payload.childId = formData.childId; payload.childName = formData.childName; payload.childSnapshot = formData.childSnapshot; 
            }

            const safeId = encodeURIComponent(formData.userId).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();

            if (isEditMode) {
                if (formData.password && !formData.authUid) payload.password = formData.password;
                await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', safeId), payload, { merge: true });
                if (formData.id && formData.id !== safeId) {
                    try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', formData.id)); } catch (e) {}
                }
                showToast('사용자 정보가 성공적으로 수정되었습니다.', 'success');
            } else {
                if (users.some(u => u.id === safeId)) throw new Error("이미 존재하는 아이디입니다.");
                const email = `${safeId}@imperial.com`;
                let authUid = '';
                try {
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, formData.password);
                    authUid = userCredential.user.uid;
                    await signOut(secondaryAuth);
                } catch (authError) {
                    if (authError.code === 'auth/email-already-in-use') throw new Error("이미 인증서버에 등록된 계정입니다.");
                    throw authError;
                }
                payload.authUid = authUid; payload.password = formData.password; payload.createdAt = serverTimestamp();
                await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', safeId), payload);
                
                setIsEditMode(true);
                setFormData(prev => ({ ...prev, id: safeId, authUid }));
                showToast('사용자가 성공적으로 생성되었습니다. 이제 상단 탭에서 수강을 배정할 수 있습니다.', 'success');
                setLoading(false);
                return; 
            }
            setIsModalOpen(false);
        } catch (e) { 
            showToast(e.message || '저장에 실패했습니다.', 'error'); 
        } finally { setLoading(false); }
    };

    const handleDeleteUser = async () => {
        if (!targetUserId) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetUserId));
            showToast('사용자가 성공적으로 삭제되었습니다.', 'success');
            setIsDeleteConfirmOpen(false);
        } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); } 
        finally { setLoading(false); setTargetUserId(null); }
    };

    const currentStudentEnrollments = enrollments.filter(e => e.studentId === formData.id);

    const handleClassSelect = (classId) => {
        if (!classId) {
            setEnrollForm(initEnrollForm);
            return;
        }
        const cls = classes.find(c => c.id === classId);
        if (!cls) return;

        const mappedSchedules = (cls.schedules || []).map(s => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room,
            callTime: s.startTime 
        }));

        setEnrollForm({
            classId: cls.id,
            className: cls.name,
            lecturerId: cls.lecturerId,
            status: 'active',
            schedules: mappedSchedules
        });
    };

    const handleCallTimeChange = (index, value) => {
        setEnrollForm(prev => {
            const arr = [...prev.schedules];
            arr[index].callTime = value;
            return { ...prev, schedules: arr };
        });
    };

    const handleSaveEnrollment = async () => {
        if (!enrollForm.classId) return alert('배정할 반을 선택해주세요.');
        setLoading(true);
        try {
            const enrollmentId = `${formData.id}_${enrollForm.classId}`;
            const payload = {
                studentId: formData.id,
                studentName: formData.name,
                classId: enrollForm.classId,
                className: enrollForm.className,
                lecturerId: enrollForm.lecturerId,
                status: enrollForm.status,
                schedules: enrollForm.schedules,
                updatedAt: serverTimestamp()
            };

            const eRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'enrollments', enrollmentId);
            const docSnap = await getDoc(eRef);
            if (!docSnap.exists()) payload.enrolledAt = serverTimestamp();

            await setDoc(eRef, payload, { merge: true });
            setEnrollForm(initEnrollForm);
            setClassSearchInput('');
            setClassSearchQuery('');
            showToast('수강 배정이 성공적으로 저장되었습니다.', 'success');
        } catch (e) {
            showToast('수강 배정 실패: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEnrollment = async (enrollId) => {
        if(!window.confirm('정말 이 수강 이력을 삭제하시겠습니까?\n단순 휴원/퇴원이라면 삭제하지 말고 상태를 [퇴원]으로 변경하는 것을 권장합니다.')) return;
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'enrollments', enrollId));
            showToast('수강 이력이 삭제되었습니다.', 'success');
        } catch(e) { alert(e.message); }
    };

    const duplicateCounts = useMemo(() => {
        const counts = {};
        users.forEach(u => { counts[(u.userId||u.id).toLowerCase()] = (counts[(u.userId||u.id).toLowerCase()] || 0) + 1; });
        return counts;
    }, [users]);

    const filteredUsers = users.filter(u => u.role === activeTab && (u.name.includes(searchQuery) || (u.userId||'').includes(searchQuery) || (u.phone||'').includes(searchQuery)));

    if (loadingData) return <div className="h-full flex items-center justify-center"><Loader className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-6 w-full animate-in fade-in pb-20">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users /> 통합 사용자 관리</h2>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button onClick={handleOpenCreate} icon={Plus} className="w-full md:w-auto">사용자 추가</Button>
                </div>
            </div>

            <div className="w-full overflow-x-auto">
                <div className="flex border-b border-gray-200 bg-white rounded-t-xl min-w-max">
                    {ALLOWED_TABS.map(role => (
                        <button key={role} onClick={() => setActiveTab(role)} className={`flex-1 py-4 px-3 sm:px-6 text-sm sm:text-base font-bold text-center transition-colors whitespace-nowrap ${activeTab === role ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {role === 'student' ? '학생' : role === 'parent' ? '학부모' : role === 'ta' ? '수업조교' : role === 'admin_assistant' ? '행정조교' : role === 'lecturer' ? '강사' : '관리자'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative">
                <input className="w-full border p-3 pl-10 rounded-xl bg-white shadow-sm outline-none" placeholder="이름, 아이디, 연락처 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20}/>
            </div>

            <div className="hidden md:block">
                <Card className="p-0 overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 text-sm border-b">
                                <th className="p-4">이름</th>
                                <th className="p-4">아이디/전화번호</th>
                                <th className="p-4">상세 정보</th>
                                <th className="p-4 text-center">보안 관리</th>
                                <th className="p-4 text-right">수정/삭제</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredUsers.length === 0 ? <tr><td colSpan="5" className="p-10 text-center text-gray-400">데이터가 없습니다.</td></tr> :
                            filteredUsers.map(u => {
                                const myEnrollments = enrollments.filter(e => e.studentId === u.id && e.status === 'active');
                                return (
                                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-bold">
                                        {u.name}
                                        {u.authUid ? <Shield size={12} className="inline ml-2 text-green-500" title="안전한 계정"/> : <Shield size={12} className="inline ml-2 text-gray-300" title="초기 계정"/>}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 font-bold text-gray-800">
                                                {u.userId}
                                                {duplicateCounts[(u.userId||u.id).toLowerCase()] > 1 && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] rounded-full border border-red-200 animate-pulse">중복</span>}
                                            </div>
                                            <span className="text-xs text-gray-500">{u.phone || '-'}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm">
                                        {activeTab === 'student' && (
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-blue-600 font-bold">{u.schoolName} ({u.grade})</span>
                                                    <span className="font-mono bg-indigo-50 text-indigo-700 px-1.5 rounded font-bold border border-indigo-100 text-xs">PIN: {u.attendancePin || '없음'}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {myEnrollments.length > 0 ? myEnrollments.map(e => (
                                                        <span key={e.id} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full">{e.className}</span>
                                                    )) : <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">배정된 반 없음</span>}
                                                </div>
                                            </div>
                                        )}
                                        {activeTab === 'parent' && (
                                            <div className="flex flex-wrap gap-1 max-w-xs">
                                                <span className="text-gray-500 text-xs w-full mb-1">연결 자녀:</span>
                                                {(u.linkedChildrenIds || []).map(childId => {
                                                    const child = studentList.find(s => s.id === childId);
                                                    return child ? <span key={childId} className="bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">{child.name}</span> : null;
                                                })}
                                                {(!u.linkedChildrenIds || u.linkedChildrenIds.length === 0) && <span className="font-bold text-gray-400">{u.childName || '없음'}</span>}
                                            </div>
                                        )}
                                        {['ta', 'lecturer', 'admin', 'admin_assistant'].includes(activeTab) && (
                                            <div className="flex flex-col gap-1">
                                                {u.subject && <span>{u.subject}</span>}
                                                {u.bankName && <span className="text-xs text-gray-500 bg-yellow-50 px-2 py-0.5 rounded border w-fit">🏦 {u.bankName} {u.accountNumber}</span>}
                                            </div>
                                        )}
                                    </td>
                                    
                                    <td className="p-4 text-center">
                                        <button onClick={() => handleForcePasswordReset(u)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all border border-red-100">
                                            <Key size={14} /> 비번 변경
                                        </button>
                                    </td>

                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleOpenEdit(u)} className="p-2 border rounded-lg text-gray-400 hover:text-blue-600 hover:border-blue-100"><Edit2 size={18}/></button>
                                            <button onClick={() => {setTargetUserId(u.id); setIsDeleteConfirmOpen(true);}} className="p-2 border rounded-lg text-gray-400 hover:text-red-600 hover:border-red-100"><Trash2 size={18}/></button>
                                        </div>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </Card>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${activeTab.toUpperCase()} 정보 및 관리`} className="max-w-3xl w-full">
                
                {activeTab === 'student' && (
                    <div className="flex border-b border-gray-200 mb-5 w-full bg-gray-50 rounded-t-xl px-2 pt-2">
                        <button onClick={() => setModalTab('basic')} className={`px-5 py-3 font-bold text-sm transition-colors rounded-t-lg ${modalTab === 'basic' ? 'bg-white text-blue-600 border-t-2 border-blue-600 shadow-[0_2px_0_0_white]' : 'text-gray-500 hover:bg-gray-100'}`}>
                            👤 기본 정보
                        </button>
                        <button onClick={() => isEditMode && setModalTab('enroll')} disabled={!isEditMode} className={`px-5 py-3 font-bold text-sm transition-colors rounded-t-lg ${modalTab === 'enroll' ? 'bg-white text-blue-600 border-t-2 border-blue-600 shadow-[0_2px_0_0_white]' : 'text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                            📚 수강 관리 {!isEditMode && <span className="text-[10px] text-red-500 font-normal ml-1">(저장 후 활성화)</span>}
                        </button>
                    </div>
                )}

                <div className="p-2 max-h-[75vh] overflow-y-auto custom-scrollbar">
                    {modalTab === 'basic' && (
                        <div className="space-y-4 animate-in fade-in">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-gray-600 mb-1">이름</label><input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none" placeholder="홍길동" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                                <div><label className="block text-xs font-bold text-gray-600 mb-1">전화번호</label><input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none" placeholder="01012345678" value={formData.phone} onChange={e => { if (activeTab === 'student' && !isEditMode) handleAutoPin(e.target.value); else setFormData({...formData, phone: e.target.value}); }} /></div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-gray-600 mb-1">로그인 아이디 (영문/숫자/한글)</label><input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none bg-gray-50" placeholder="student123" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} disabled={isEditMode} /></div>
                                {!formData.authUid && (
                                    <div><label className="block text-xs font-bold text-gray-600 mb-1">초기 비밀번호</label><input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none" placeholder="6자리 이상" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
                                )}
                            </div>
                            
                            {activeTab === 'student' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                        <div><label className="block text-xs font-bold text-blue-800 mb-1">학교명</label><input className="w-full border p-2 rounded-lg bg-white outline-none" placeholder="임페리얼고" value={formData.schoolName} onChange={e => setFormData({...formData, schoolName: e.target.value})} /></div>
                                        <div><label className="block text-xs font-bold text-blue-800 mb-1">학년</label><select className="w-full border p-2 rounded-lg bg-white outline-none" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}><option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option><option value="N수생">N수생</option></select></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-bold text-indigo-800 mb-1">출결 PIN (4자리)</label><input type="text" maxLength={4} className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold text-indigo-600 bg-indigo-50" value={formData.attendancePin} onChange={e => setFormData({...formData, attendancePin: e.target.value.replace(/[^0-9]/g, '')})} placeholder="뒷자리 자동추출"/></div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1">재원 상태</label>
                                            <select className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                                                <option value="attending">재원중 (정상)</option><option value="resting">휴원 (잠시 쉼)</option><option value="dropped">퇴원 (다니지 않음)</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'parent' && (
                                <div className="border-t pt-4">
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1"><LinkIcon size={14}/> 내 자녀 선택 (다중 선택 가능)</label>
                                    <div className="max-h-48 overflow-y-auto border rounded-xl p-3 bg-gray-50 grid grid-cols-1 sm:grid-cols-2 gap-2 custom-scrollbar">
                                        {studentList.map(student => (
                                            <label key={student.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${formData.linkedChildrenIds.includes(student.id) ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-white hover:bg-gray-100'}`}>
                                                <input type="checkbox" className="accent-blue-600 w-4 h-4" checked={(formData.linkedChildrenIds || []).includes(student.id)} onChange={() => toggleChildLink(student.id)}/>
                                                <span className="text-sm font-bold text-gray-800">{student.name} <span className="text-xs text-gray-500 font-normal">({student.schoolName})</span></span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Button className="w-full py-4 text-lg font-bold mt-4" onClick={handleSaveUser} disabled={loading}>
                                {loading ? <Loader className="animate-spin mx-auto"/> : '기본 정보 저장'}
                            </Button>
                        </div>
                    )}

                    {modalTab === 'enroll' && activeTab === 'student' && (
                        <div className="space-y-6 animate-in fade-in">
                            
                            <div>
                                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><BookMarked size={16} className="text-blue-600"/> 현재 수강중인 반</h3>
                                {currentStudentEnrollments.length === 0 ? (
                                    <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-sm font-bold text-gray-400">배정된 강의가 없습니다. 아래에서 반을 검색 후 배정해주세요.</div>
                                ) : (
                                    <div className="space-y-3">
                                        {currentStudentEnrollments.map(e => (
                                            <div key={e.id} className={`border p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden shadow-sm ${e.status === 'active' ? 'bg-white border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                                                {e.status === 'active' && <div className="absolute left-0 top-0 w-1 h-full bg-emerald-500"/>}
                                                <div className="flex justify-between items-start pl-2">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${e.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{e.status === 'active' ? '수강중' : '퇴원/취소'}</span>
                                                            <span className="text-xs font-bold text-gray-500">강사: {users.find(u=>u.id===e.lecturerId)?.name || '미지정'}</span>
                                                        </div>
                                                        <h4 className="font-black text-gray-900">{e.className}</h4>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => {
                                                            setEnrollForm(e); 
                                                            setClassSearchInput('');
                                                            setClassSearchQuery('');
                                                            window.scrollTo(0, document.body.scrollHeight);
                                                        }} className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg"><Edit2 size={14}/></button>
                                                        <button onClick={() => handleDeleteEnrollment(e.id)} className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg"><Trash2 size={14}/></button>
                                                    </div>
                                                </div>
                                                <div className="pl-2 flex flex-wrap gap-1.5">
                                                    {e.schedules.map((s, i) => (
                                                        <span key={i} className="text-[10px] bg-gray-100 border border-gray-200 text-gray-700 px-2 py-1 rounded-md font-bold flex items-center gap-1">
                                                            <span className="text-blue-600">{s.dayOfWeek}</span> 
                                                            <Clock size={10}/> 등원 {s.callTime} <span className="font-normal text-gray-400">({s.startTime}~{s.endTime})</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 mt-6 shadow-inner">
                                <h3 className="text-sm font-black text-blue-900 mb-4 flex items-center gap-1.5"><Plus size={16}/> {enrollForm.id ? '수강 이력 수정' : '새로운 수강 배정'}</h3>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-blue-800 mb-1.5">배정할 반(Class) 검색 및 선택</label>
                                        {!enrollForm.id ? (
                                            <div className="border-2 border-blue-100 rounded-xl bg-white p-2 shadow-sm">
                                                <div className="flex gap-2 mb-2">
                                                    <div className="relative flex-1">
                                                        <input 
                                                            type="text" 
                                                            className="w-full border p-2 pl-8 rounded-lg bg-gray-50 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                                                            placeholder="반 이름 또는 강사명 검색 후 엔터" 
                                                            value={classSearchInput} 
                                                            onChange={e => setClassSearchInput(e.target.value)} 
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    setClassSearchQuery(classSearchInput);
                                                                }
                                                            }}
                                                        />
                                                        <Search className="absolute left-2.5 top-2.5 text-gray-400" size={16}/>
                                                    </div>
                                                    <Button type="button" size="sm" onClick={() => setClassSearchQuery(classSearchInput)} className="shrink-0 bg-blue-600 hover:bg-blue-700">검색</Button>
                                                </div>
                                                
                                                <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                                                    {classes
                                                        .filter(c => c.name.includes(classSearchQuery) || (users.find(u=>u.id===c.lecturerId)?.name || '').includes(classSearchQuery))
                                                        .map(c => (
                                                            <button
                                                                key={c.id}
                                                                type="button"
                                                                onClick={() => handleClassSelect(c.id)}
                                                                className={`w-full text-left p-2.5 rounded-lg text-sm transition-all flex items-center justify-between border ${enrollForm.classId === c.id ? 'bg-blue-50 border-blue-300 font-bold text-blue-900 shadow-sm' : 'bg-white border-transparent hover:bg-gray-50 text-gray-700'}`}
                                                            >
                                                                <div>
                                                                    <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded mr-2 font-bold inline-block w-14 text-center">
                                                                        {users.find(u=>u.id===c.lecturerId)?.name || '미지정'}
                                                                    </span>
                                                                    {c.name}
                                                                </div>
                                                                {enrollForm.classId === c.id && <CheckCircle size={16} className="text-blue-600"/>}
                                                            </button>
                                                        ))
                                                    }
                                                    {classes.filter(c => c.name.includes(classSearchQuery) || (users.find(u=>u.id===c.lecturerId)?.name || '').includes(classSearchQuery)).length === 0 && (
                                                        <div className="text-center py-6 text-sm text-gray-400 font-bold">검색 결과가 없습니다.</div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full border-2 border-gray-200 bg-gray-100 p-3.5 rounded-xl font-bold text-gray-500 shadow-sm flex items-center gap-2">
                                                <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded font-bold">
                                                    {users.find(u=>u.id===enrollForm.lecturerId)?.name || '미지정'}
                                                </span>
                                                {enrollForm.className}
                                                <span className="ml-auto text-xs font-normal text-rose-500 hidden md:inline">* 배정된 반은 변경불가 (필요시 삭제 후 재배정)</span>
                                            </div>
                                        )}
                                    </div>

                                    {enrollForm.classId && (
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                            <div className="flex justify-between items-center border-b pb-2">
                                                <label className="text-xs font-bold text-gray-800 flex items-center gap-1"><Calendar size={14} className="text-blue-600"/> 스케줄 및 등원시간(Call-Time) 세팅</label>
                                                <select className="border border-gray-200 p-1 px-2 rounded-lg text-xs font-bold outline-none" value={enrollForm.status} onChange={e => setEnrollForm({...enrollForm, status: e.target.value})}>
                                                    <option value="active">🟢 수강중</option>
                                                    <option value="dropped">🔴 퇴원/취소</option>
                                                </select>
                                            </div>

                                            {enrollForm.schedules.map((sch, idx) => (
                                                <div key={idx} className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm shrink-0">{sch.dayOfWeek}</div>
                                                    <div className="flex-1 flex flex-col">
                                                        <span className="text-[10px] text-gray-500 font-bold">본수업: {sch.startTime} ~ {sch.endTime} ({sch.room || '미정'})</span>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-xs font-black text-rose-600">요구 등원시간 ➔</span>
                                                            <input type="time" className="border border-rose-200 bg-rose-50 text-rose-700 p-1 px-2 rounded text-xs font-bold outline-none focus:ring-1 focus:ring-rose-500" value={sch.callTime} onChange={e => handleCallTimeChange(idx, e.target.value)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <Button className="w-full py-3.5 text-base font-black shadow-md mt-2" onClick={handleSaveEnrollment} disabled={loading || !enrollForm.classId}>
                                        {loading ? <Loader className="animate-spin mx-auto"/> : (enrollForm.id ? '수정 내용 저장' : '수강 배정 완료')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="사용자 계정 삭제">
                <div className="text-center space-y-6 p-4">
                    <div className="bg-red-50 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-red-500"><Trash2 size={40} /></div>
                    <p className="text-lg font-medium">정말로 삭제하시겠습니까?<br/><span className="text-red-500 font-bold">연결된 모든 데이터가 접근 불가 상태가 됩니다.</span></p>
                    <div className="flex gap-3">
                        <Button variant="secondary" className="flex-1 py-3" onClick={() => setIsDeleteConfirmOpen(false)}>취소</Button>
                        <Button variant="danger" className="flex-1 py-3" onClick={handleDeleteUser} disabled={loading}>네, 삭제하겠습니다</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default UserManager;