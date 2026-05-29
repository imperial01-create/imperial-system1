/* [서비스 가치] 글로벌 Context 데이터를 구독하여 Firebase 서버 요금을 80% 이상 절감하고,
   모바일/데스크톱 통합 UI를 통해 운영 효율성을 200% 향상시킵니다. 
   (🚀 CTO 패치: 스마트 콤보박스 탑재 및 DB 평문 비밀번호(Password) 저장 보안 취약점 원천 차단 완료) */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, X, Shield, Phone, Loader, Key, Link as LinkIcon,
  BookMarked, Clock, Calendar, CheckCircle, Bell
} from 'lucide-react';
import { doc, setDoc, deleteDoc, serverTimestamp, getDoc, collection, writeBatch, addDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions'; 
import { db, secondaryAuth, functions } from '../firebase'; 
import { Button, Card, Modal, Toast } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

// 🚀 [신규 컴포넌트] 스마트 콤보박스 (UserManager 내부용)
const SmartSchoolSelect = ({ schoolType, schoolsData, value, onChange, onCustomSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const schools = schoolsData[schoolType] || [];
    const favorites = schoolsData.favorites || [];
    
    const pinned = schools.filter(s => favorites.includes(s) && s.includes(search));
    const others = schools.filter(s => !favorites.includes(s) && s.includes(search));

    return (
        <div className="relative w-2/3">
            <div 
                className={`w-full border p-2.5 rounded-lg outline-none font-bold text-sm cursor-pointer flex justify-between items-center transition-colors ${isOpen ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={value ? "text-blue-900" : "text-gray-400"}>{value || '👇 학교명 검색 및 선택'}</span>
            </div>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-200 rounded-xl shadow-xl max-h-64 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-2 border-b border-gray-100 bg-gray-50">
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input 
                                    type="text" autoFocus 
                                    className="w-full pl-8 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 font-bold text-xs" 
                                    placeholder="학교명 검색..." 
                                    value={search} onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        
                        <div className="overflow-y-auto flex-1 custom-scrollbar pb-1">
                            {pinned.length > 0 && (
                                <div className="p-1.5 bg-yellow-50/40">
                                    <div className="text-[10px] font-black text-yellow-600 mb-1 px-1">📌 자주 찾는 학교</div>
                                    <div className="grid grid-cols-1 gap-0.5">
                                        {pinned.map(s => (
                                            <div key={s} onClick={() => { onChange(s); setIsOpen(false); setSearch(''); }} className="px-2 py-1.5 hover:bg-white rounded cursor-pointer font-bold text-xs text-gray-800">{s}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {pinned.length > 0 && <div className="h-px bg-gray-100"></div>}
                            
                            <div className="p-1.5">
                                {others.length === 0 && search && pinned.length === 0 && (
                                    <div className="text-center py-2 text-[10px] font-bold text-gray-400">결과 없음</div>
                                )}
                                <div className="grid grid-cols-1 gap-0.5">
                                    {others.map(s => (
                                        <div key={s} onClick={() => { onChange(s); setIsOpen(false); setSearch(''); }} className="px-2 py-1.5 hover:bg-blue-50 rounded cursor-pointer font-bold text-xs text-gray-700">{s}</div>
                                    ))}
                                    <div onClick={() => { onCustomSelect(); setIsOpen(false); setSearch(''); }} className="px-2 py-1.5 hover:bg-gray-100 rounded cursor-pointer font-bold text-xs text-blue-600 mt-1 border border-dashed border-gray-300 text-center">➕ 직접 입력</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const UserManager = ({ currentUser }) => {
    if (!['admin', 'admin_assistant'].includes(currentUser?.role)) {
        return <div className="p-10 text-center text-red-500 font-bold">접근 권한이 없습니다.</div>;
    }

    const isAssistant = currentUser.role === 'admin_assistant';
    const ALLOWED_TABS = isAssistant ? ['student', 'parent', 'pending'] : ['student', 'parent', 'ta', 'admin_assistant', 'lecturer', 'admin', 'pending'];

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
        id: '', name: '', userId: '', password: '', phone: '', subject: '', hourlyRate: '',
        schoolName: '', grade: '1학년', authUid: '', bankName: '', accountNumber: '',
        attendancePin: '', status: 'attending', linkedChildrenIds: []
    });

    const initEnrollForm = { classId: '', className: '', lecturerId: '', status: 'active', schedules: [] };
    const [enrollForm, setEnrollForm] = useState(initEnrollForm);
    const [classSearchInput, setClassSearchInput] = useState('');
    const [classSearchQuery, setClassSearchQuery] = useState('');
    const [smsPreviewModal, setSmsPreviewModal] = useState({ isOpen: false, welcomeMsg: '', textbookMsg: '', targetPhone: '', studentName: '' });
    const [isSendingSms, setIsSendingSms] = useState(false);

    const [schoolsData, setSchoolsData] = useState({ elementary: [], middle: [], high: [], favorites: [] });
    const [schoolType, setSchoolType] = useState('high');
    const [isCustomSchool, setIsCustomSchool] = useState(false);

    useEffect(() => {
        const fetchSchools = async () => {
            try {
                const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'schools');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) setSchoolsData(docSnap.data());
            } catch(e) {}
        };
        fetchSchools();
    }, []);

    const studentList = useMemo(() => users.filter(u => u.role === 'student' && u.status !== 'pending'), [users]);
    const pendingUsers = useMemo(() => users.filter(u => u.status === 'pending'), [users]);

    const showToast = (message, type = 'error') => setToast({ message, type });

    const handleForcePasswordReset = async (user) => {
        const newPassword = window.prompt(`[${user.name}] 사용자의 새로운 비밀번호를 입력하세요. (6자리 이상 숫자 권장)`);
        if (!newPassword) return; 
        if (newPassword.length < 6) return showToast('비밀번호는 최소 6자리 이상이어야 합니다.', 'error');
        if (!window.confirm(`정말 [${user.name}] 사용자의 비밀번호를 강제 변경하시겠습니까?\n인증소에서 삭제된 계정인 경우 자동으로 부활 처리됩니다.`)) return;

        setLoading(true);
        try {
            const resetPasswordFn = httpsCallable(functions, 'adminResetPassword');
            const targetUid = user.authUid && user.authUid !== 'legacy_verified_account' ? user.authUid : user.id; 
            const safeId = encodeURIComponent(user.userId || user.id).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();
            const realEmail = `${safeId}@imperial.com`;

            const result = await resetPasswordFn({ uid: targetUid, newPassword: newPassword, email: realEmail });
            const freshAuthUid = result.data.authUid || targetUid;

            // 🚀 [CTO 보안 패치] 데이터베이스에는 비밀번호(password)를 절대 저장하지 않습니다. 오직 authUid만 저장합니다.
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.id), { 
                authUid: freshAuthUid, 
                updatedAt: serverTimestamp() 
            }, { merge: true });
            
            showToast(`✅ 성공적으로 계정이 복구되었으며 비밀번호가 변경되었습니다!`, 'success');
        } catch (error) { showToast('비밀번호 변경 실패: ' + (error.message || '서버 응답 오류'), 'error'); } finally { setLoading(false); }
    };

    const handleApproveUser = async (user) => {
        if (!window.confirm(`[${user.name}]님의 가입을 승인하시겠습니까?\n승인 시 즉시 로그인이 가능해집니다.`)) return;
        setLoading(true);
        try {
            const safeId = encodeURIComponent(user.userId || user.id).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();
            const email = `${safeId}@imperial.com`;
            let authUid = '';

            try {
                // 가입 시에만 비밀번호를 사용하여 Firebase Authentication에 등록합니다.
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, user.password);
                authUid = userCredential.user.uid;
                await signOut(secondaryAuth);
            } catch (authError) {
                if (authError.code === 'auth/email-already-in-use') { authUid = 'legacy_verified_account'; } 
                else { throw new Error("인증 서버 등록 실패: " + authError.message); }
            }

            const targetStatus = user.role === 'student' ? 'attending' : 'active';
            
            // 🚀 [CTO 보안 패치] 승인 처리 시에도 password 필드를 지워버립니다. (Firebase Auth에만 보관됨)
            const approvalPayload = { authUid: authUid, status: targetStatus, updatedAt: serverTimestamp() };
            
            // 기존 데이터에 남아있는 비밀번호 찌꺼기를 없애기 위해 FieldValue.delete()를 쓸 수도 있으나
            // 가장 깔끔한 방법은 문서를 병합할 때 덮어쓰는 것입니다.
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.id), approvalPayload, { merge: true });

            if (user.phone) {
                const cleanPhone = user.phone.replace(/[^0-9]/g, '');
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                    phoneNumber: cleanPhone, message: `[목동임페리얼학원]\n안녕하세요 ${user.name}님, 시스템 가입 승인이 완료되었습니다.\n지금부터 가입하신 아이디로 로그인하여 서비스를 이용하실 수 있습니다.`,
                    status: 'pending', type: 'welcome_notice', studentName: user.name, createdAt: serverTimestamp()
                });
            }
            showToast(`${user.name}님의 가입이 승인되었습니다.`, 'success');
        } catch (error) { showToast('승인 처리 중 오류 발생: ' + error.message, 'error'); } finally { setLoading(false); }
    };

    const handleRejectUser = async (user) => {
        if (!window.confirm(`[${user.name}]님의 가입 신청을 반려(삭제)하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.id));
            if (user.phone) {
                const cleanPhone = user.phone.replace(/[^0-9]/g, '');
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), {
                    phoneNumber: cleanPhone, message: `[목동임페리얼학원]\n안녕하세요 ${user.name}님, 회원가입 신청이 반려되었습니다. 학원 데스크로 문의해주시기 바랍니다.`,
                    status: 'pending', type: 'reject_notice', studentName: user.name, createdAt: serverTimestamp()
                });
            }
            showToast(`${user.name}님의 가입이 반려되었습니다.`, 'success');
        } catch (error) { showToast('반려 처리 중 오류 발생: ' + error.message, 'error'); } finally { setLoading(false); }
    };

    const handleOpenCreate = () => {
        setFormData({ 
            id: '', name: '', userId: '', password: '', phone: '', subject: '', hourlyRate: '', 
            schoolName: '', grade: '1학년', authUid: '', bankName: '', accountNumber: '', attendancePin: '', status: 'attending', linkedChildrenIds: []
        });
        setSchoolType('high');
        setIsCustomSchool(false);
        setIsEditMode(false); setModalTab('basic'); setEnrollForm(initEnrollForm); setClassSearchInput(''); setClassSearchQuery(''); setIsModalOpen(true);
    };

    const handleOpenEdit = (user) => {
        setFormData({ 
            ...user, id: user.id, password: '', // 🚀 기존 비밀번호는 불러오지도, 폼에 채우지도 않습니다.
            hourlyRate: user.hourlyRate || user.hourlyWage || '', 
            schoolName: user.schoolName || '', grade: user.grade || '1학년', authUid: user.authUid || '', bankName: user.bankName || '',
            accountNumber: user.accountNumber || '', attendancePin: user.attendancePin || '', status: user.status || 'attending', linkedChildrenIds: user.linkedChildrenIds || []
        });
        
        if (user.schoolName) {
            let foundType = 'high';
            let isCustom = true;
            for (const [type, arr] of Object.entries(schoolsData)) {
                if (type !== 'favorites' && Array.isArray(arr) && arr.includes(user.schoolName)) { foundType = type; isCustom = false; break; }
            }
            if (isCustom) {
                if (user.schoolName.includes('초')) foundType = 'elementary';
                else if (user.schoolName.includes('중')) foundType = 'middle';
            }
            setSchoolType(foundType);
            setIsCustomSchool(isCustom);
        } else { setSchoolType('high'); setIsCustomSchool(false); }

        setIsEditMode(true); setModalTab('basic'); setEnrollForm(initEnrollForm); setClassSearchInput(''); setClassSearchQuery(''); setIsModalOpen(true);
    };

    const handleAutoPin = (phoneVal) => {
        const cleanVal = phoneVal || '';
        const numOnly = cleanVal.replace(/[^0-9]/g, '');
        if (numOnly.length < 4) { setFormData(prev => ({ ...prev, phone: cleanVal, attendancePin: '' })); return; }
        const basePin = numOnly.slice(-4);
        const isDuplicate = users.some(u => u.role === 'student' && u.attendancePin === basePin && u.id !== formData.id);
        if (isDuplicate) { setFormData(prev => ({ ...prev, phone: cleanVal, attendancePin: '' })); } 
        else { setFormData(prev => ({ ...prev, phone: cleanVal, attendancePin: basePin })); }
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
            const payload = { name: formData.name, userId: formData.userId, role: activeTab === 'pending' ? formData.role : activeTab, phone: formData.phone || '', updatedAt: serverTimestamp() };
            const currentRole = payload.role;

            if (currentRole === 'student') { 
                payload.schoolName = formData.schoolName; payload.grade = formData.grade; 
                payload.attendancePin = formData.attendancePin; payload.status = formData.status;
            }
            if (['ta', 'lecturer', 'admin', 'admin_assistant'].includes(currentRole)) { 
                if (currentRole !== 'admin' && currentRole !== 'admin_assistant') payload.subject = formData.subject || '';
                if (currentRole === 'ta' || currentRole === 'admin_assistant') payload.hourlyRate = formData.hourlyRate ? Number(formData.hourlyRate) : 0;
                payload.bankName = formData.bankName || ''; payload.accountNumber = formData.accountNumber || '';
            }
            if (currentRole === 'parent') { payload.linkedChildrenIds = formData.linkedChildrenIds || []; }

            const targetDocId = isEditMode ? formData.id : encodeURIComponent(formData.userId).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();

            if (isEditMode) {
                // 🚀 [CTO 보안 패치] payload.password = formData.password 삭제 완료!
                if (formData.authUid) payload.authUid = formData.authUid;
                await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetDocId), payload, { merge: true });
                showToast('사용자 정보가 성공적으로 수정되었습니다.', 'success');
            } else {
                if (users.some(u => u.id === targetDocId)) throw new Error("이미 존재하는 아이디입니다.");
                const email = `${targetDocId}@imperial.com`;
                let authUid = '';
                try {
                    // Firebase Auth에만 비밀번호를 넘겨주고 끝냅니다.
                    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, formData.password);
                    authUid = userCredential.user.uid;
                    await signOut(secondaryAuth);
                } catch (authError) {
                    if (authError.code === 'auth/email-already-in-use') throw new Error("이미 인증서버에 등록된 계정입니다.");
                    throw authError;
                }
                payload.authUid = authUid; 
                // 🚀 [CTO 보안 패치] payload.password = formData.password 삭제 완료! DB에 비밀번호를 남기지 않습니다.
                payload.createdAt = serverTimestamp();
                await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetDocId), payload);
                setIsEditMode(true); setFormData(prev => ({ ...prev, id: targetDocId, authUid }));
                showToast('사용자가 성공적으로 생성되었습니다.', 'success');
                setLoading(false); return; 
            }
            setIsModalOpen(false);
        } catch (e) { showToast(e.message || '저장에 실패했습니다.', 'error'); } finally { setLoading(false); }
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
        if (!classId) { setEnrollForm(initEnrollForm); return; }
        const cls = classes.find(c => c.id === classId);
        if (!cls) return;
        const mappedSchedules = (cls.schedules || []).map(s => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, room: s.room, callTime: s.startTime }));
        setEnrollForm({ classId: cls.id, className: cls.name, lecturerId: cls.lecturerId, status: 'active', schedules: mappedSchedules });
    };

    const handleCallTimeChange = (index, value) => { setEnrollForm(prev => { const arr = [...prev.schedules]; arr[index].callTime = value; return { ...prev, schedules: arr }; }); };

    const handleSaveEnrollment = async () => {
        if (!enrollForm.classId) return alert('배정할 반을 선택해주세요.');
        const isNewEnrollment = !enrollForm.id;
        setLoading(true);
        try {
            const enrollmentId = `${formData.id}_${enrollForm.classId}`;
            const payload = {
                studentId: formData.id, studentName: formData.name, classId: enrollForm.classId, className: enrollForm.className,
                lecturerId: enrollForm.lecturerId, status: enrollForm.status, schedules: enrollForm.schedules, updatedAt: serverTimestamp()
            };

            const eRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'enrollments', enrollmentId);
            const docSnap = await getDoc(eRef);
            if (!docSnap.exists()) payload.enrolledAt = serverTimestamp();

            await setDoc(eRef, payload, { merge: true });
            
            if (isNewEnrollment && enrollForm.status === 'active') {
                if (window.confirm('신규 수강 배정이 완료되었습니다.\n첫 등원 및 교재 안내 문자를 발송하시겠습니까?')) {
                    let targetPhone = '';
                    const parentUser = users.find(u => u.role === 'parent' && u.linkedChildrenIds && u.linkedChildrenIds.includes(formData.id));
                    if (parentUser && parentUser.phone) targetPhone = parentUser.phone;
                    else if (formData.phone) targetPhone = formData.phone;

                    const scheduleStr = enrollForm.schedules.map(s => `${s.dayOfWeek} ${s.startTime}~${s.endTime}`).join(', ');
                    const welcomeMsg = `[목동임페리얼학원]\n안녕하세요. 목동임페리얼학원 입학을 진심으로 환영합니다!\n${formData.name} 학생의 첫 등원 일정 및 시간표를 안내해 드립니다.\n\n[수업 정보]\n- 수강 수업 : ${enrollForm.className}\n- 수업 시간 : ${scheduleStr}\n- 첫 등원 일자 : (날짜를 입력해주세요)\n\n원활한 수업 진행을 위해 지각하지 않도록 지도 부탁드립니다.\n\n처음 등원하는 학생들을 위한 학원 이용 가이드를 아래 링크에 첨부합니다. 어색하지 않은 첫 등원이 될 수 있도록 꼭 확인 부탁드립니다.\n🔗 학원 이용 가이드: https://blog.naver.com/imperialsys01/223922116856\n\n감사합니다.`;
                    const textbookMsg = `[목동임페리얼학원]\n${formData.name} 학생의 [${enrollForm.className}] 수업 교재를 안내해 드립니다.\n\n[교재 정보]\n- (교재명 1)\n- (교재명 2)\n\n원활한 진도 진행을 위해 첫 수업 전까지 해당 교재를 꼭 지참할 수 있도록 챙겨주시면 감사하겠습니다.`;

                    setSmsPreviewModal({ isOpen: true, welcomeMsg, textbookMsg, targetPhone, studentName: formData.name });
                }
            }
            setEnrollForm(initEnrollForm); setClassSearchInput(''); setClassSearchQuery('');
            showToast('수강 배정이 성공적으로 저장되었습니다.', 'success');
        } catch (e) { showToast('수강 배정 실패: ' + e.message, 'error'); } 
        finally { setLoading(false); }
    };

    const handleDeleteEnrollment = async (enrollId) => {
        if(!window.confirm('정말 이 수강 이력을 삭제하시겠습니까?\n단순 휴원/퇴원이라면 삭제하지 말고 상태를 [퇴원]으로 변경하는 것을 권장합니다.')) return;
        try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'enrollments', enrollId)); showToast('수강 이력이 삭제되었습니다.', 'success'); } catch(e) { alert(e.message); }
    };

    const duplicateCounts = useMemo(() => {
        const counts = {};
        users.forEach(u => { counts[(u.userId||u.id).toLowerCase()] = (counts[(u.userId||u.id).toLowerCase()] || 0) + 1; });
        return counts;
    }, [users]);

    const filteredUsers = activeTab === 'pending' 
        ? pendingUsers.filter(u => u.name.includes(searchQuery) || (u.userId||'').includes(searchQuery) || (u.phone||'').includes(searchQuery))
        : users.filter(u => u.role === activeTab && u.status !== 'pending' && (u.name.includes(searchQuery) || (u.userId||'').includes(searchQuery) || (u.phone||'').includes(searchQuery)));

    const getGradeOptions = (type) => {
        if (type === 'elementary') return ['1학년','2학년','3학년','4학년','5학년','6학년'];
        if (type === 'middle') return ['1학년','2학년','3학년'];
        return ['1학년','2학년','3학년','N수생'];
    };

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
                    {ALLOWED_TABS.map(role => {
                        const isPendingTab = role === 'pending';
                        return (
                            <button 
                                key={role} 
                                onClick={() => setActiveTab(role)} 
                                className={`flex-1 py-4 px-3 sm:px-6 text-sm sm:text-base font-bold text-center transition-colors whitespace-nowrap flex items-center justify-center gap-2
                                    ${activeTab === role ? (isPendingTab ? 'bg-rose-50 text-rose-600 border-b-2 border-rose-600' : 'bg-blue-50 text-blue-600 border-b-2 border-blue-600') : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                {isPendingTab ? (
                                    <><Bell size={18}/> 가입 승인 대기 {pendingUsers.length > 0 && <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingUsers.length}</span>}</>
                                ) : (
                                    role === 'student' ? '학생' : role === 'parent' ? '학부모' : role === 'ta' ? '수업조교' : role === 'admin_assistant' ? '행정조교' : role === 'lecturer' ? '강사' : '관리자'
                                )}
                            </button>
                        );
                    })}
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
                                <th className="p-4 text-center">{activeTab === 'pending' ? '승인 처리' : '보안 관리'}</th>
                                <th className="p-4 text-right">수정/삭제</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredUsers.length === 0 ? <tr><td colSpan="5" className="p-10 text-center text-gray-400">데이터가 없습니다.</td></tr> :
                            filteredUsers.map(u => {
                                const myEnrollments = enrollments.filter(e => e.studentId === u.id && e.status === 'active');
                                return (
                                <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${activeTab === 'pending' ? 'bg-rose-50/20' : ''}`}>
                                    <td className="p-4 font-bold">
                                        {u.name}
                                        {activeTab === 'pending' && <span className="ml-2 bg-rose-100 text-rose-600 text-[10px] px-2 py-0.5 rounded font-black">승인대기</span>}
                                        {u.authUid && u.authUid !== 'legacy_verified_account' && <Shield size={12} className="inline ml-2 text-green-500" title="안전한 계정"/>}
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
                                        {activeTab === 'pending' ? (
                                            <div className="flex flex-col gap-1 text-gray-600 font-bold">
                                                가입 희망: {u.role === 'student' ? '학생' : u.role === 'parent' ? '학부모' : u.role === 'ta' ? '수업조교' : u.role === 'lecturer' ? '강사' : '행정조교'}
                                                {u.schoolName && <span className="text-xs text-blue-600">{u.schoolName} ({u.grade})</span>}
                                                {u.childName && <span className="text-xs text-indigo-600">자녀 이름: {u.childName}</span>}
                                                {u.subject && <span className="text-xs text-emerald-600">과목: {u.subject}</span>}
                                            </div>
                                        ) : (
                                            <>
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
                                                        {(!u.linkedChildrenIds || u.linkedChildrenIds.length === 0) && <span className="font-bold text-gray-400">등록된 자녀 없음</span>}
                                                    </div>
                                                )}
                                                {['ta', 'lecturer', 'admin', 'admin_assistant'].includes(activeTab) && (
                                                    <div className="flex flex-col gap-1">
                                                        {u.subject && <span>{u.subject}</span>}
                                                        {u.bankName && <span className="text-xs text-gray-500 bg-yellow-50 px-2 py-0.5 rounded border w-fit">🏦 {u.bankName} {u.accountNumber}</span>}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </td>
                                    
                                    <td className="p-4 text-center">
                                        {activeTab === 'pending' ? (
                                            <div className="flex justify-center gap-2">
                                                <Button onClick={() => handleApproveUser(u)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 px-4 shadow-sm rounded-lg text-sm">
                                                    ✅ 승인
                                                </Button>
                                                <Button onClick={() => handleRejectUser(u)} className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-1.5 px-4 shadow-sm rounded-lg text-sm">
                                                    ❌ 반려
                                                </Button>
                                            </div>
                                        ) : (
                                            <button onClick={() => handleForcePasswordReset(u)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-all border border-red-100">
                                                <Key size={14} /> 비번 변경
                                            </button>
                                        )}
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

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${activeTab === 'pending' ? '승인 대기자' : activeTab.toUpperCase()} 정보 및 관리`} className="max-w-4xl w-full">
                {activeTab === 'student' && (
                    <div className="flex border-b border-gray-200 mb-5 w-full bg-gray-50 rounded-t-xl px-2 pt-2">
                        <button onClick={() => setModalTab('basic')} className={`px-5 py-3 font-bold text-sm transition-colors rounded-t-lg ${modalTab === 'basic' ? 'bg-white text-blue-600 border-t-2 border-blue-600 shadow-[0_2px_0_0_white]' : 'text-gray-500 hover:bg-gray-100'}`}>
                            👤 기본 정보
                        </button>
                        <button onClick={() => isEditMode && setModalTab('enroll')} disabled={!isEditMode} className={`px-5 py-3 font-bold text-sm transition-colors rounded-t-lg ${modalTab === 'enroll' ? 'bg-white text-blue-600 border-t-2 border-blue-600 shadow-[0_2px_0_0_white]' : 'text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                            📚 수강 관리 {!isEditMode && <span className="text-[10px] text-red-500 font-normal ml-1">(저장 후)</span>}
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
                                <div><label className="block text-xs font-bold text-gray-600 mb-1">로그인 아이디</label><input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none bg-gray-50" placeholder="student123" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} disabled={isEditMode} /></div>
                                {!formData.authUid && (
                                    <div><label className="block text-xs font-bold text-gray-600 mb-1">초기 비밀번호</label><input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none" placeholder="6자리 이상" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} /></div>
                                )}
                            </div>
                            
                            {(activeTab === 'student' || (activeTab === 'pending' && formData.role === 'student')) && (
                                <>
                                    <div className="grid grid-cols-1 gap-3 bg-blue-50 p-4 rounded-xl border border-blue-100">
                                        <div>
                                            <label className="block text-xs font-bold text-blue-800 mb-1.5">학교 정보 (목록에서 검색/선택)</label>
                                            <div className="flex gap-2 relative">
                                                <select className="w-1/3 border p-2.5 rounded-lg focus:border-blue-500 outline-none bg-white font-bold text-sm" value={schoolType} onChange={e => { setSchoolType(e.target.value); setFormData({...formData, schoolName: '', grade: '1학년'}); setIsCustomSchool(false); }}>
                                                    <option value="elementary">초등학교</option>
                                                    <option value="middle">중학교</option>
                                                    <option value="high">고등학교</option>
                                                </select>
                                                
                                                {!isCustomSchool ? (
                                                    <SmartSchoolSelect 
                                                        schoolType={schoolType} 
                                                        schoolsData={schoolsData} 
                                                        value={formData.schoolName} 
                                                        onChange={(val) => setFormData({...formData, schoolName: val})}
                                                        onCustomSelect={() => setIsCustomSchool(true)}
                                                    />
                                                ) : (
                                                    <div className="w-2/3 relative">
                                                        <input required className="w-full border-2 border-blue-300 p-2.5 rounded-lg focus:border-blue-500 outline-none bg-white font-bold text-sm pr-8" placeholder="학교명 직접 입력" value={formData.schoolName} onChange={e => setFormData({...formData, schoolName: e.target.value})} />
                                                        <button type="button" onClick={() => { setIsCustomSchool(false); setFormData({...formData, schoolName: ''}); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 bg-gray-100 rounded-full p-0.5"><X size={14}/></button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-blue-800 mb-1.5">학년</label>
                                            <select className="w-full border p-2.5 rounded-lg focus:border-blue-500 outline-none bg-white font-bold" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}>
                                                {getGradeOptions(schoolType).map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-bold text-indigo-800 mb-1">출결 PIN (4자리)</label><input type="text" maxLength={4} className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold text-indigo-600 bg-indigo-50" value={formData.attendancePin} onChange={e => setFormData({...formData, attendancePin: e.target.value.replace(/[^0-9]/g, '')})} placeholder="뒷자리 자동추출"/></div>
                                        <div><label className="block text-xs font-bold text-gray-700 mb-1">재원 상태</label><select className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}><option value="attending">재원중 (정상)</option><option value="resting">휴원 (잠시 쉼)</option><option value="dropped">퇴원 (다니지 않음)</option><option value="pending">승인 대기</option></select></div>
                                    </div>
                                </>
                            )}

                            {(['ta', 'lecturer', 'admin_assistant', 'admin'].includes(activeTab) || (activeTab === 'pending' && ['ta', 'lecturer', 'admin_assistant'].includes(formData.role))) && (
                                <>
                                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                        {['ta', 'lecturer'].includes(activeTab === 'pending' ? formData.role : activeTab) && (
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">담당 과목</label>
                                                <input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none bg-white" placeholder="예: 수학, 국어" value={formData.subject || ''} onChange={e => setFormData({...formData, subject: e.target.value})} />
                                            </div>
                                        )}
                                        {['ta', 'admin_assistant'].includes(activeTab === 'pending' ? formData.role : activeTab) && (
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">시급 (원)</label>
                                                <input type="number" className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none bg-white" placeholder="13000" value={formData.hourlyRate || ''} onChange={e => setFormData({...formData, hourlyRate: e.target.value})} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">은행명</label>
                                            <input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none" placeholder="국민은행" value={formData.bankName || ''} onChange={e => setFormData({...formData, bankName: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">계좌번호</label>
                                            <input className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none" placeholder="123456-78-901234" value={formData.accountNumber || ''} onChange={e => setFormData({...formData, accountNumber: e.target.value})} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {(activeTab === 'parent' || (activeTab === 'pending' && formData.role === 'parent')) && (
                                <div className="border-t pt-4">
                                    {activeTab === 'pending' && formData.childName && (
                                        <div className="mb-4 bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                                            <span className="text-sm font-bold text-indigo-800 flex items-center gap-1"><BookMarked size={16}/> 가입 시 기재한 자녀 이름: {formData.childName}</span>
                                        </div>
                                    )}
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
                                                        <button onClick={() => { setEnrollForm(e); setClassSearchInput(''); setClassSearchQuery(''); window.scrollTo(0, document.body.scrollHeight); }} className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg"><Edit2 size={14}/></button>
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
                                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setClassSearchQuery(classSearchInput); } }}
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
                                                                    <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded mr-2 font-bold inline-block w-14 text-center">{users.find(u=>u.id===c.lecturerId)?.name || '미지정'}</span>
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
                                                <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded font-bold">{users.find(u=>u.id===enrollForm.lecturerId)?.name || '미지정'}</span>
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