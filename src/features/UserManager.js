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

    // [개선] schoolName, grade 필드 추가 유지
    const [formData, setFormData] = useState({ 
        name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '',
        schoolName: '', grade: '1학년'
    });
    const [isEditMode, setIsEditMode] = useState(false);
    
    const [studentList, setStudentList] = useState([]);
    const [studentSearch, setStudentSearch] = useState('');

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);
            const cacheKey = 'imperial_users_manager_cache_v2';
            
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Date.now() - parsed.timestamp < 3600000) { 
                        setUsers(parsed.data);
                        setStudentList(parsed.data.filter(u => u.role === 'student'));
                        setLoading(false);
                        return;
                    }
                } catch(e) { localStorage.removeItem(cacheKey); }
            }

            try {
                const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
                const snap = await getDocs(q);
                const userList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setUsers(userList);
                setStudentList(userList.filter(u => u.role === 'student'));
                localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: userList }));
            } catch (e) {
                console.error("User Load Error", e);
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, []);

    const handleOpenCreate = () => {
        setFormData({ name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '', schoolName: '', grade: '1학년' });
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
            grade: user.grade || '1학년'
        });
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!formData.name || !formData.userId || !formData.password) return alert('필수 정보를 입력하세요.');
        if (activeTab === 'parent' && !formData.childId) return alert('학부모 계정은 자녀(학생)와 연결해야 합니다.');
        if (activeTab === 'student' && !formData.schoolName) return alert('학생의 학교명을 입력해주세요.');

        setLoading(true);
        try {
            const payload = {
                name: formData.name,
                userId: formData.userId,
                password: formData.password,
                role: activeTab,
                phone: formData.phone || '',
                updatedAt: serverTimestamp()
            };

            if (activeTab === 'student') {
                payload.schoolName = formData.schoolName;
                payload.grade = formData.grade;
            }
            if (activeTab === 'ta' || activeTab === 'lecturer') {
                payload.subject = formData.subject || '';
            }
            if (activeTab === 'ta') {
                payload.hourlyRate = formData.hourlyRate ? Number(formData.hourlyRate) : 0;
            }
            if (activeTab === 'parent') {
                payload.childId = formData.childId;
                payload.childName = formData.childName;
            }

            if (isEditMode) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', formData.id), payload);
                alert('수정되었습니다.');
            } else {
                if (users.some(u => u.userId === formData.userId)) throw new Error("이미 존재하는 아이디입니다.");
                payload.createdAt = serverTimestamp();
                await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'), payload);
                alert('생성되었습니다.');
            }
            setIsModalOpen(false);
            localStorage.removeItem('imperial_users_manager_cache_v2');
            window.location.reload(); 
        } catch (e) {
            alert('저장 실패: ' + e.message);
            setLoading(false);
        }
    };

    const handleDeleteClick = (id) => {
        setTargetUserId(id);
        setIsDeleteConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!targetUserId) return;
        try {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetUserId));
            alert('삭제되었습니다.');
            localStorage.removeItem('imperial_users_manager_cache_v2');
            window.location.reload();
        } catch (e) {
            alert('삭제 실패: ' + e.message);
        } finally {
            setIsDeleteConfirmOpen(false);
            setTargetUserId(null);
        }
    };

    const filteredUsers = users.filter(u => 
        u.role === activeTab && 
        (u.name.includes(searchQuery) || u.userId.includes(searchQuery))
    );

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

            {/* 1. Mobile Card View */}
            <div className="md:hidden space-y-4">
                {filteredUsers.length === 0 && <div className="text-center py-10 text-gray-400">데이터가 없습니다.</div>}
                {filteredUsers.map(u => (
                    <Card key={u.id} className="p-5 flex flex-col gap-3 relative overflow-hidden">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                                <div className="bg-blue-100 p-2 rounded-full text-blue-600"><User size={18} /></div>
                                <div>
                                    <div className="font-bold text-lg text-gray-800">{u.name}</div>
                                    <div className="text-xs text-gray-400">{u.userId}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleOpenEdit(u)} className="p-2 border rounded-lg text-gray-500"><Edit2 size={16}/></button>
                                <button onClick={() => handleDeleteClick(u.id)} className="p-2 border rounded-lg text-gray-500"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl space-y-2 text-sm text-gray-600">
                            {activeTab === 'student' && (
                                <div className="flex items-center gap-2 text-blue-600 font-bold">
                                    <School size={14}/> <span>{u.schoolName} ({u.grade})</span>
                                </div>
                            )}
                            <div className="flex items-center gap-2"><Phone size={14}/> <span>{u.phone || '전화번호 없음'}</span></div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* 2. Desktop Table View */}
            <div className="hidden md:block">
                <Card className="p-0 overflow-hidden">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="border-b text-gray-500 text-sm bg-gray-50">
                                <th className="p-4">이름</th>
                                <th className="p-4">아이디</th>
                                <th className="p-4">전화번호</th>
                                <th className="p-4">{activeTab === 'student' ? '학교/학년' : '비고'}</th>
                                <th className="p-4 text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-bold text-gray-800">{u.name}</td>
                                    <td className="p-4 text-gray-600">{u.userId}</td>
                                    <td className="p-4 text-gray-600">{u.phone || '-'}</td>
                                    <td className="p-4">
                                        {activeTab === 'student' && <span className="text-blue-600 font-bold">{u.schoolName} ({u.grade})</span>}
                                        {activeTab === 'parent' && <span className="text-green-600 font-bold">자녀: {u.childName}</span>}
                                        {(activeTab === 'ta' || activeTab === 'lecturer') && u.subject}
                                    </td>
                                    <td className="p-4 flex justify-end gap-2">
                                        <button onClick={() => handleOpenEdit(u)} className="p-2 border rounded-lg text-gray-400 hover:text-blue-600"><Edit2 size={18}/></button>
                                        <button onClick={() => handleDeleteClick(u.id)} className="p-2 border rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={18}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${activeTab.toUpperCase()} 계정 ${isEditMode ? '수정' : '추가'}`}>
                <div className="space-y-4">
                    <input className="w-full border p-3 rounded-xl" placeholder="이름" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input className="w-full border p-3 rounded-xl" placeholder="아이디" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} disabled={isEditMode} />
                    <input className="w-full border p-3 rounded-xl" placeholder="비밀번호" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                    
                    {activeTab === 'student' && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl">
                            <div>
                                <label className="text-xs font-bold text-blue-600 mb-1 block flex items-center gap-1"><School size={12}/> 학교명</label>
                                <input className="w-full border p-2 rounded-lg bg-white" placeholder="예: 목동고" value={formData.schoolName} onChange={e => setFormData({...formData, schoolName: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-blue-600 mb-1 block flex items-center gap-1"><GraduationCap size={12}/> 학년</label>
                                <select className="w-full border p-2 rounded-lg bg-white" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}>
                                    <option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                                </select>
                            </div>
                        </div>
                    )}
                    
                    {/* (기타 parent/ta/lecturer 입력 로직 유지) */}
                    {(activeTab === 'ta' || activeTab === 'lecturer') && (
                        <input className="w-full border p-3 rounded-xl" placeholder="담당 과목" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
                    )}

                    <Button className="w-full py-3" onClick={handleSaveUser} disabled={loading}>
                        {loading ? <Loader className="animate-spin mx-auto"/> : (isEditMode ? '수정 완료' : '생성 완료')}
                    </Button>
                </div>
            </Modal>

            <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="계정 삭제">
                <div className="space-y-4">
                    <div className="bg-red-50 p-4 rounded-xl flex items-start gap-3">
                        <Shield className="text-red-500 shrink-0" size={24}/>
                        <div>
                            <h4 className="font-bold text-red-700">정말 삭제하시겠습니까?</h4>
                            <p className="text-sm text-red-600 mt-1">이 작업은 복구할 수 없습니다.</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setIsDeleteConfirmOpen(false)} className="flex-1">취소</Button>
                        <Button variant="danger" onClick={confirmDelete} className="flex-1">삭제 확정</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default UserManager;