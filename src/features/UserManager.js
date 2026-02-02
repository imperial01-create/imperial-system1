import React, { useState, useEffect } from 'react';
// [Import Check] DollarSign 아이콘 확인
import { 
  Users, Search, Plus, Edit2, Trash2, Save, X, Link as LinkIcon, Check, Loader, UserPlus, Shield, DollarSign 
} from 'lucide-react';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Modal, Badge } from '../components/UI';

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
        name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: ''
    });
    const [isEditMode, setIsEditMode] = useState(false);
    
    const [studentList, setStudentList] = useState([]);
    const [studentSearch, setStudentSearch] = useState('');

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);
            const cacheKey = 'imperial_users_manager_cache';
            
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
        setFormData({ name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '' });
        setIsEditMode(false);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (user) => {
        setFormData({ 
            ...user, 
            password: user.password || '', 
            childId: user.childId || '',
            childName: user.childName || '',
            hourlyRate: user.hourlyRate || ''
        });
        setIsEditMode(true);
        setIsModalOpen(true);
    };

    const handleSaveUser = async () => {
        if (!formData.name || !formData.userId || !formData.password) return alert('필수 정보를 입력하세요.');
        if (activeTab === 'parent' && !formData.childId) return alert('학부모 계정은 자녀(학생)와 연결해야 합니다.');

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
            localStorage.removeItem('imperial_users_manager_cache');
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
            localStorage.removeItem('imperial_users_manager_cache');
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
        // [UI 수정] 최상위 여백 제거 및 모바일 패딩 조정 X (App.js의 p-4 사용)
        <div className="space-y-6 w-full max-w-[1600px] mx-auto animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users /> 사용자 관리</h2>
                <Button onClick={handleOpenCreate} icon={Plus} className="w-full md:w-auto">사용자 추가</Button>
            </div>

            <div className="w-full overflow-x-auto">
                <div className="flex border-b border-gray-200 bg-white rounded-t-xl min-w-[350px]">
                    {['student', 'parent', 'ta', 'lecturer'].map(role => (
                        <button 
                            key={role}
                            onClick={() => setActiveTab(role)}
                            className={`flex-1 py-4 px-4 font-bold text-center capitalize transition-colors whitespace-nowrap ${activeTab === role ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            {role === 'student' && '학생'}
                            {role === 'parent' && '학부모'}
                            {role === 'ta' && '조교'}
                            {role === 'lecturer' && '강사'}
                        </button>
                    ))}
                </div>
            </div>

            {/* [UI 수정] Card의 패딩을 0으로 하고 overflow hidden 적용 */}
            <Card className="min-h-[500px] overflow-hidden w-full p-0">
                {/* 검색창에만 별도 패딩 적용 */}
                <div className="p-4 relative">
                    <input 
                        className="w-full border p-3 pl-10 rounded-xl bg-gray-50 focus:bg-white transition-all outline-none focus:ring-2 focus:ring-blue-100" 
                        placeholder="이름 또는 아이디 검색"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" size={20}/>
                </div>

                {/* 테이블 영역 스크롤 설정 */}
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="border-b border-gray-100 text-gray-500 text-sm">
                                <th className="p-4 w-[15%] whitespace-nowrap">이름</th>
                                <th className="p-4 w-[20%] whitespace-nowrap">아이디</th>
                                <th className="p-4 w-[15%] whitespace-nowrap">전화번호</th>
                                <th className="p-4 w-[15%] whitespace-nowrap">
                                    {(activeTab === 'ta' || activeTab === 'lecturer') ? (activeTab === 'ta' ? '시급' : '비고') : '비고'}
                                </th>
                                <th className="p-4 w-[15%] whitespace-nowrap">
                                    {activeTab === 'parent' ? '자녀' : (activeTab === 'ta' || activeTab === 'lecturer' ? '담당 과목' : '')}
                                </th>
                                <th className="p-4 w-[10%] text-right whitespace-nowrap">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-bold text-gray-800">{u.name}</td>
                                    <td className="p-4 text-gray-600">{u.userId}</td>
                                    <td className="p-4 text-gray-600">{u.phone || '-'}</td>
                                    <td className="p-4 font-mono text-blue-600">
                                        {activeTab === 'ta' && u.hourlyRate ? `${Number(u.hourlyRate).toLocaleString()}원` : '-'}
                                    </td>
                                    <td className="p-4">
                                        {activeTab === 'parent' && (
                                            <span className="bg-green-50 text-green-700 px-2 py-1 rounded-lg text-sm font-bold flex w-fit items-center gap-1">
                                                <UserPlus size={14}/> {u.childName || '미지정'}
                                            </span>
                                        )}
                                        {(activeTab === 'ta' || activeTab === 'lecturer') && u.subject}
                                    </td>
                                    <td className="p-4 flex justify-end gap-2">
                                        <button onClick={() => handleOpenEdit(u)} className="p-2 bg-white border rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all"><Edit2 size={18}/></button>
                                        <button onClick={() => handleDeleteClick(u.id)} className="p-2 bg-white border rounded-lg text-gray-500 hover:text-red-600 hover:border-red-200 transition-all"><Trash2 size={18}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredUsers.length === 0 && <div className="text-center py-10 text-gray-400">데이터가 없습니다.</div>}
                </div>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${isEditMode ? '수정' : '추가'} - ${activeTab.toUpperCase()}`}>
                {/* Modal Content - Existing Code */}
                <div className="space-y-4">
                    <input className="w-full border p-3 rounded-xl" placeholder="이름" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input className="w-full border p-3 rounded-xl" placeholder="아이디" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} disabled={isEditMode} />
                    <input className="w-full border p-3 rounded-xl" placeholder="비밀번호" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                    <input className="w-full border p-3 rounded-xl" placeholder="전화번호 (선택)" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    
                    {(activeTab === 'ta' || activeTab === 'lecturer') && (
                        <input className="w-full border p-3 rounded-xl" placeholder="담당 과목" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
                    )}

                    {activeTab === 'ta' && (
                        <div className="relative">
                            <input 
                                type="number"
                                className="w-full border p-3 pl-10 rounded-xl" 
                                placeholder="시급 (숫자만 입력)" 
                                value={formData.hourlyRate} 
                                onChange={e => setFormData({...formData, hourlyRate: e.target.value})} 
                            />
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                        </div>
                    )}

                    {activeTab === 'parent' && (
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><LinkIcon size={16}/> 연결할 자녀 선택</label>
                            {formData.childName ? (
                                <div className="flex justify-between items-center bg-blue-100 p-3 rounded-lg text-blue-800 font-bold mb-2">
                                    <span>{formData.childName}</span>
                                    <button onClick={() => setFormData({...formData, childId: '', childName: ''})} className="bg-white p-1 rounded-full text-red-500 hover:bg-red-50"><X size={16}/></button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <input 
                                        className="w-full border p-2 pl-8 rounded-lg text-sm bg-white" 
                                        placeholder="학생 이름 검색" 
                                        value={studentSearch} 
                                        onChange={e => setStudentSearch(e.target.value)} 
                                    />
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    
                                    {studentSearch && (
                                        <div className="mt-2 max-h-32 overflow-y-auto border rounded-lg bg-white divide-y">
                                            {studentList.filter(s => s.name.includes(studentSearch)).map(s => (
                                                <div key={s.id} onClick={() => { setFormData({...formData, childId: s.id, childName: s.name}); setStudentSearch(''); }} className="p-2 text-sm hover:bg-blue-50 cursor-pointer flex justify-between">
                                                    <span>{s.name}</span>
                                                    <span className="text-gray-400 text-xs">({s.userId})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <Button className="w-full" onClick={handleSaveUser} disabled={loading}>
                        {loading ? <Loader className="animate-spin"/> : (isEditMode ? '수정 완료' : '생성 완료')}
                    </Button>
                </div>
            </Modal>

            <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="계정 삭제">
                <div className="space-y-4">
                    <div className="bg-red-50 p-4 rounded-xl flex items-start gap-3">
                        <Shield className="text-red-500 shrink-0" size={24}/>
                        <div>
                            <h4 className="font-bold text-red-700">정말 삭제하시겠습니까?</h4>
                            <p className="text-sm text-red-600 mt-1">이 작업은 되돌릴 수 없으며, 해당 사용자의 모든 데이터 접근 권한이 즉시 차단됩니다.</p>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <Button variant="secondary" onClick={() => setIsDeleteConfirmOpen(false)} className="flex-1">취소</Button>
                        <Button variant="danger" onClick={confirmDelete} className="flex-1">삭제 확정</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default UserManager;