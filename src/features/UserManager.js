/* [서비스 가치] 사용자 계정 생성 시 보안 검증을 위한 authUid 필드를 미리 확보하여 Rules 충돌을 방지합니다. */
import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, Save, X, Link as LinkIcon, Check, Loader, UserPlus, Shield, DollarSign, Phone, BookOpen, User, School, GraduationCap
} from 'lucide-react';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const UserManager = ({ currentUser }) => {
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('student'); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [targetUserId, setTargetUserId] = useState(null);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({ 
        name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '',
        schoolName: '', grade: '1학년', authUid: ''
    });
    const [isEditMode, setIsEditMode] = useState(false);
    const [studentList, setStudentList] = useState([]);
    const [studentSearch, setStudentSearch] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
            const snap = await getDocs(q);
            const userList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setUsers(userList);
            setStudentList(userList.filter(u => u.role === 'student'));
        } catch (e) { console.error("User Load Error", e); } finally { setLoading(false); }
    };

    const handleOpenCreate = () => {
        setFormData({ name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '', schoolName: '', grade: '1학년', authUid: '' });
        setIsEditMode(false);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (user) => {
        setFormData({ 
            ...user, 
            password: user.password || '', 
            childId: user.childId || '',
            childName: user.childName || '',
            hourlyRate: user.hourlyRate || '',
            schoolName: user.schoolName || '',
            grade: user.grade || '1학년',
            authUid: user.authUid || ''
        });
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!formData.name || !formData.userId || !formData.password) return alert('필수 정보를 입력하세요.');
        setLoading(true);
        try {
            const payload = {
                name: formData.name, userId: formData.userId, password: formData.password, role: activeTab,
                phone: formData.phone || '', updatedAt: serverTimestamp(),
                authUid: formData.authUid || '' // 보안 연결용 필드 유지
            };
            if (activeTab === 'student') { payload.schoolName = formData.schoolName; payload.grade = formData.grade; }
            if (activeTab === 'ta' || activeTab === 'lecturer') payload.subject = formData.subject || '';
            if (activeTab === 'ta') payload.hourlyRate = formData.hourlyRate ? Number(formData.hourlyRate) : 0;
            if (activeTab === 'parent') { payload.childId = formData.childId; payload.childName = formData.childName; }

            if (isEditMode) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', formData.id), payload);
            } else {
                if (users.some(u => u.userId === formData.userId)) throw new Error("이미 존재하는 아이디입니다.");
                payload.createdAt = serverTimestamp();
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), payload);
            }
            setIsModalOpen(false);
            fetchUsers();
        } catch (e) { alert('저장 실패: ' + e.message); } finally { setLoading(false); }
    };

    const handleDeleteUser = async () => {
        if (!targetUserId) return;
        setLoading(true);
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetUserId));
            setIsDeleteConfirmOpen(false);
            fetchUsers();
        } catch (e) { alert('삭제 실패: ' + e.message); } finally { setLoading(false); }
    };

    const filteredUsers = users.filter(u => u.role === activeTab && (u.name.includes(searchQuery) || u.userId.includes(searchQuery)));

    return (
        <div className="space-y-6 w-full animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users /> 사용자 관리</h2>
                <Button onClick={handleOpenCreate} icon={Plus} className="w-full md:w-auto">사용자 추가</Button>
            </div>

            <div className="w-full overflow-x-auto">
                <div className="flex border-b border-gray-200 bg-white rounded-t-xl min-w-[350px]">
                    {['student', 'parent', 'ta', 'lecturer'].map(role => (
                        <button key={role} onClick={() => setActiveTab(role)} className={`flex-1 py-4 px-4 font-bold text-center transition-colors ${activeTab === role ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {role === 'student' ? '학생' : role === 'parent' ? '학부모' : role === 'ta' ? '조교' : '강사'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative">
                <input className="w-full border p-3 pl-10 rounded-xl bg-white shadow-sm outline-none" placeholder="이름 또는 아이디 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20}/>
            </div>

            <div className="hidden md:block">
                <Card className="p-0 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead><tr className="bg-gray-50 text-gray-500 text-sm border-b"><th className="p-4">이름</th><th className="p-4">아이디</th><th className="p-4">정보</th><th className="p-4 text-right">관리</th></tr></thead>
                        <tbody className="divide-y">
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-bold">{u.name}</td><td className="p-4">{u.userId}</td>
                                    <td className="p-4">
                                        {activeTab === 'student' && <span className="text-blue-600 font-bold">{u.schoolName} ({u.grade})</span>}
                                        {activeTab === 'parent' && <span className="text-green-600 font-bold">자녀: {u.childName}</span>}
                                        {(activeTab === 'ta' || activeTab === 'lecturer') && u.subject}
                                    </td>
                                    <td className="p-4 flex justify-end gap-2">
                                        <button onClick={() => handleOpenEdit(u)} className="p-2 border rounded-lg text-gray-400 hover:text-blue-600"><Edit2 size={18}/></button>
                                        <button onClick={() => {setTargetUserId(u.id); setIsDeleteConfirmOpen(true);}} className="p-2 border rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={18}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${activeTab.toUpperCase()} 정보`}>
                <div className="space-y-4">
                    <input className="w-full border p-3 rounded-xl" placeholder="이름" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input className="w-full border p-3 rounded-xl" placeholder="아이디" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} disabled={isEditMode} />
                    <input className="w-full border p-3 rounded-xl" placeholder="비밀번호" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                    {activeTab === 'student' && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl">
                            <input className="border p-2 rounded-lg" placeholder="학교명" value={formData.schoolName} onChange={e => setFormData({...formData, schoolName: e.target.value})} />
                            <select className="border p-2 rounded-lg" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}>
                                <option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                            </select>
                        </div>
                    )}
                    <Button className="w-full py-3" onClick={handleSaveUser} disabled={loading}>{loading ? <Loader className="animate-spin mx-auto"/> : '저장하기'}</Button>
                </div>
            </Modal>

            <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="사용자 삭제">
                <div className="text-center space-y-4">
                    <p className="text-lg">정말로 이 사용자를 삭제하시겠습니까?<br/><span className="text-red-500 font-bold">이 작업은 되돌릴 수 없습니다.</span></p>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setIsDeleteConfirmOpen(false)}>취소</Button>
                        <Button variant="danger" className="flex-1" onClick={handleDeleteUser} disabled={loading}>삭제</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default UserManager;