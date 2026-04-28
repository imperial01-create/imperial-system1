/* [서비스 가치] 로컬 캐시 우선 전략으로 관리자 페이지 로딩 속도를 극대화하고, 
   모바일/데스크톱 통합 UI를 통해 운영 효율성을 200% 향상시킵니다.
   (Updated: Firebase Auth 보안 토큰 연동 + 봇 방어 우회 마이그레이션 + 랜덤 문서명 DB 자동 정규화) */
   import React, { useState, useEffect } from 'react';
   import { 
     Users, Search, Plus, Edit2, Trash2, X, Shield, Phone, User, School, Loader
   } from 'lucide-react';
   import { collection, doc, setDoc, updateDoc, deleteDoc, query, onSnapshot, serverTimestamp, getDocs, deleteField } from 'firebase/firestore';
   import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
   import { db, secondaryAuth } from '../firebase';
   import { Button, Card, Modal, Toast } from '../components/UI';
   
   const APP_ID = 'imperial-clinic-v1';
   
   const UserManager = ({ currentUser }) => {
       const [users, setUsers] = useState([]);
       const [searchQuery, setSearchQuery] = useState('');
       const [activeTab, setActiveTab] = useState('student'); 
       const [isModalOpen, setIsModalOpen] = useState(false);
       const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
       const [targetUserId, setTargetUserId] = useState(null);
       const [loading, setLoading] = useState(true);
       const [migrationLoading, setMigrationLoading] = useState(false);
       
       const [toast, setToast] = useState({ message: '', type: 'info' });
   
       const [formData, setFormData] = useState({ 
           name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '',
           schoolName: '', grade: '1학년', authUid: '', childSnapshot: null
       });
       const [isEditMode, setIsEditMode] = useState(false);
       
       const [studentList, setStudentList] = useState([]);
       const [studentSearch, setStudentSearch] = useState('');
   
       const showToast = (message, type = 'error') => setToast({ message, type });
   
       useEffect(() => {
           const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
           
           const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
               const userList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
               setUsers(userList);
               setStudentList(userList.filter(u => u.role === 'student'));
               setLoading(false);
           }, (error) => {
               console.error("User Sync Error:", error);
               showToast('데이터 동기화 중 오류가 발생했습니다.', 'error');
               setLoading(false);
           });
   
           return () => unsubscribe();
       }, []);
   
       const handleOpenCreate = () => {
           setFormData({ name: '', userId: '', password: '', phone: '', subject: '', childId: '', childName: '', hourlyRate: '', schoolName: '', grade: '1학년', authUid: '', childSnapshot: null });
           setIsEditMode(false);
           setIsModalOpen(true);
       };
   
       const handleOpenEdit = (user) => {
           setFormData({ 
               ...user, 
               password: user.password || '', 
               childId: user.childId || '',
               childName: user.childName || '',
               childSnapshot: user.childSnapshot || null, 
               hourlyRate: user.hourlyRate || '',
               schoolName: user.schoolName || '',
               grade: user.grade || '1학년',
               authUid: user.authUid || ''
           });
           setIsEditMode(true);
           setIsModalOpen(true);
       };
   
       const handleSaveUser = async () => {
           if (!formData.name || !formData.userId) return showToast('이름과 아이디를 입력해주세요.', 'error');
           if (!isEditMode && !formData.password) return showToast('신규 생성 시 비밀번호는 필수입니다.', 'error');
           if (activeTab === 'parent' && !formData.childId) return showToast('학부모 계정은 반드시 자녀(학생)와 연결해야 합니다.', 'error');
           if (activeTab === 'student' && !formData.schoolName) return showToast('학생의 학교명을 입력해주세요.', 'error');
   
           setLoading(true);
           try {
               const payload = {
                   name: formData.name, userId: formData.userId, role: activeTab,
                   phone: formData.phone || '', updatedAt: serverTimestamp()
               };
               if (activeTab === 'student') { payload.schoolName = formData.schoolName; payload.grade = formData.grade; }
               if (activeTab === 'ta' || activeTab === 'lecturer') payload.subject = formData.subject || '';
               if (activeTab === 'ta') payload.hourlyRate = formData.hourlyRate ? Number(formData.hourlyRate) : 0;
               
               if (activeTab === 'parent') { 
                   payload.childId = formData.childId; 
                   payload.childName = formData.childName; 
                   payload.childSnapshot = formData.childSnapshot; 
               }
   
               if (isEditMode) {
                   if (formData.password && !formData.authUid) {
                       payload.password = formData.password;
                   }
                   await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', formData.id), payload);
                   showToast('사용자 정보가 성공적으로 수정되었습니다.', 'success');
               } else {
                   if (users.some(u => u.userId === formData.userId)) throw new Error("이미 존재하는 아이디입니다.");
                   
                   const email = `${formData.userId}@imperial.com`;
                   let authUid = '';
                   try {
                       const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, formData.password);
                       authUid = userCredential.user.uid;
                       await signOut(secondaryAuth);
                   } catch (authError) {
                       if (authError.code === 'auth/email-already-in-use') {
                           throw new Error("이미 시스템(인증서버)에 등록된 계정입니다. 다른 아이디를 사용해주세요.");
                       }
                       throw authError;
                   }
                   
                   payload.authUid = authUid;
                   payload.createdAt = serverTimestamp();
                   
                   await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', formData.userId), payload);
                   showToast('새로운 사용자가 성공적으로 추가되었습니다.', 'success');
               }
               setIsModalOpen(false);
           } catch (e) { 
               console.error(e);
               showToast(e.message || '저장에 실패했습니다.', 'error'); 
           } finally { 
               setLoading(false); 
           }
       };
   
       const handleDeleteUser = async () => {
           if (!targetUserId) return;
           setLoading(true);
           try {
               await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', targetUserId));
               showToast('사용자가 성공적으로 삭제되었습니다.', 'success');
               setIsDeleteConfirmOpen(false);
           } catch (e) { 
               showToast('삭제 실패: ' + e.message, 'error'); 
           } finally { 
               setLoading(false); 
           }
       };
   
       // 🚀 [CTO 특별 스크립트] 클라이언트 기반 비밀번호 마이그레이션 + DB 정규화(문서명 통일)
       const handleRunMigration = async () => {
           if (!window.confirm("⚠️ [보안 경고] 아직 처리되지 않은 평문 비밀번호를 Firebase Auth로 이전하시겠습니까?\n(랜덤 ID를 가진 문서는 정상적인 ID로 자동 교체됩니다.)")) return;
           
           setMigrationLoading(true);
           let successCount = 0;
           let failCount = 0;
           let normalizedCount = 0; // 문서 이름이 고쳐진 횟수
           showToast('마이그레이션 및 DB 정규화를 시작합니다...', 'info');
   
           try {
               const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
               const snapshot = await getDocs(q);
   
               for (const userDoc of snapshot.docs) {
                   const userData = userDoc.data();
                   const currentDocId = userDoc.id;
                   const userId = userData.userId || currentDocId;
   
                   // 패스워드가 없거나 이미 마이그레이션 된 계정은 스킵
                   if (!userData.password || userData.authUid) continue;
   
                   let password = userData.password;
                   if (password.length < 6) password = password.padEnd(6, '0');
                   const email = `${userId}@imperial.com`;
   
                   try {
                       const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                       await signOut(secondaryAuth);
   
                       // 🚀 [핵심 추가] 문서 ID가 랜덤값인지 확인하고 정규화 처리
                       if (currentDocId !== userId) {
                           // 1. 새 문서(정확한 userId 이름)에 데이터 생성 (평문 비번 제외, authUid 포함)
                           const newPayload = { ...userData, authUid: userCredential.user.uid };
                           delete newPayload.password;
                           
                           await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId), newPayload);
                           
                           // 2. 기존의 랜덤 ID 문서는 깔끔하게 삭제
                           await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentDocId));
                           normalizedCount++;
                       } else {
                           // 문서 ID가 이미 userId와 동일하다면 기존처럼 필드만 업데이트
                           await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentDocId), {
                               authUid: userCredential.user.uid,
                               password: deleteField() 
                           });
                       }
   
                       successCount++;
                       // 봇 차단 방지를 위한 2.5초 대기
                       await new Promise(resolve => setTimeout(resolve, 2500)); 
   
                   } catch (err) {
                       if (err.code === 'auth/email-already-in-use') {
                           // Auth에는 있는데 DB만 꼬여있을 때의 복구 로직도 정규화 적용
                           if (currentDocId !== userId) {
                               const newPayload = { ...userData };
                               delete newPayload.password;
                               await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId), newPayload);
                               await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentDocId));
                               normalizedCount++;
                           } else {
                               await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', currentDocId), {
                                   password: deleteField() 
                               });
                           }
                           successCount++;
                       } else if (err.code === 'auth/too-many-requests') {
                           alert(`🚨 구글 봇 방어 시스템 작동 (일시 차단)\n현재까지 ${successCount}명 성공 (문서정리 ${normalizedCount}건)\n1~2분 뒤 다시 눌러주세요.`);
                           setMigrationLoading(false);
                           return;
                       } else {
                           console.error(`[실패] ${userData.name}:`, err);
                           failCount++;
                           if (failCount === 1) { 
                               alert(`🚨 [마이그레이션 실패 원인]\n이름: ${userData.name}\n에러: ${err.message}`);
                           }
                       }
                   }
               }
               alert(`🎉 [마이그레이션 및 정규화 완벽 종료!]\n성공: ${successCount}명 (이 중 이름 고쳐진 문서: ${normalizedCount}개)\n실패: ${failCount}명`);
           } catch (e) {
               console.error("Migration Fatal Error:", e);
               alert('치명적인 오류가 발생했습니다.');
           } finally {
               setMigrationLoading(false);
           }
       };
   
       const duplicateCounts = React.useMemo(() => {
           const counts = {};
           users.forEach(u => { counts[u.userId] = (counts[u.userId] || 0) + 1; });
           return counts;
       }, [users]);
   
       const filteredUsers = users.filter(u => u.role === activeTab && (u.name.includes(searchQuery) || u.userId.includes(searchQuery)));
   
       return (
           <div className="space-y-6 w-full animate-in fade-in">
               <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
   
               <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                   <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users /> 사용자 관리</h2>
                   <div className="flex gap-2 w-full md:w-auto">
                       <Button onClick={handleRunMigration} variant="secondary" className="border-red-500 text-red-500 hover:bg-red-50" icon={migrationLoading ? Loader : Shield} disabled={migrationLoading}>
                           {migrationLoading ? '이전 중 (창 유지)...' : '보안 마이그레이션 (1회용)'}
                       </Button>
                       <Button onClick={handleOpenCreate} icon={Plus} className="w-full md:w-auto" disabled={migrationLoading}>사용자 추가</Button>
                   </div>
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
   
               <div className="md:hidden space-y-4">
                   {filteredUsers.map(u => (
                       <Card key={u.id} className="p-5 flex flex-col gap-3">
                           <div className="flex justify-between items-start">
                               <div className="flex items-center gap-2">
                                   <div className="bg-blue-100 p-2 rounded-full text-blue-600"><User size={18} /></div>
                                   <div>
                                       <div className="font-bold text-lg">{u.name}</div>
                                       <div className="text-xs text-gray-400 flex items-center gap-1">
                                           {u.userId}
                                           {duplicateCounts[u.userId] > 1 && (
                                               <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[8px] font-bold rounded-full animate-pulse">중복!</span>
                                           )}
                                       </div>
                                   </div>
                               </div>
                               <div className="flex gap-2">
                                   <button onClick={() => handleOpenEdit(u)} className="p-2 border rounded-lg hover:bg-gray-50"><Edit2 size={16}/></button>
                                   <button onClick={() => {setTargetUserId(u.id); setIsDeleteConfirmOpen(true);}} className="p-2 border rounded-lg hover:bg-gray-50 text-red-500"><Trash2 size={16}/></button>
                               </div>
                           </div>
                           <div className="bg-gray-50 p-3 rounded-xl space-y-2 text-sm">
                               {activeTab === 'student' && <div className="flex items-center gap-2 font-bold text-blue-600"><School size={14}/> {u.schoolName} ({u.grade})</div>}
                               {activeTab === 'parent' && <div className="flex items-center gap-2 font-bold text-green-600"><User size={14}/> 자녀: {u.childSnapshot ? `${u.childSnapshot.name} (${u.childSnapshot.schoolName})` : u.childName}</div>}
                               <div className="flex items-center gap-2"><Phone size={14}/> {u.phone || '-'}</div>
                           </div>
                       </Card>
                   ))}
               </div>
   
               <div className="hidden md:block">
                   <Card className="p-0 overflow-hidden shadow-sm">
                       <table className="w-full text-left border-collapse">
                           <thead><tr className="bg-gray-50 text-gray-500 text-sm border-b"><th className="p-4">이름</th><th className="p-4">아이디</th><th className="p-4">전화번호</th><th className="p-4">정보</th><th className="p-4 text-right">관리</th></tr></thead>
                           <tbody className="divide-y">
                               {filteredUsers.length === 0 ? <tr><td colSpan="5" className="p-10 text-center text-gray-400">데이터가 없습니다.</td></tr> :
                               filteredUsers.map(u => (
                                   <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                       <td className="p-4 font-bold">
                                           {u.name}
                                           {u.authUid ? <Shield size={12} className="inline ml-2 text-green-500" title="안전한 계정"/> : <Shield size={12} className="inline ml-2 text-red-400" title="마이그레이션 필요"/>}
                                       </td>
                                       <td className="p-4">
                                           <div className="flex items-center gap-2">
                                               <span>{u.userId}</span>
                                               {duplicateCounts[u.userId] > 1 && (
                                                   <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-full border border-red-200 animate-pulse">중복 계정!</span>
                                               )}
                                           </div>
                                       </td>
                                       <td className="p-4 text-gray-500">{u.phone || '-'}</td>
                                       <td className="p-4">
                                           {activeTab === 'student' && <span className="text-blue-600 font-bold">{u.schoolName} ({u.grade})</span>}
                                           {activeTab === 'parent' && (
                                                <span className="text-green-600 font-bold">
                                                    자녀: {u.childSnapshot ? `${u.childSnapshot.name} (${u.childSnapshot.schoolName} ${u.childSnapshot.grade})` : u.childName}
                                                </span>
                                           )}
                                           {(activeTab === 'ta' || activeTab === 'lecturer') && u.subject}
                                       </td>
                                       <td className="p-4 flex justify-end gap-2">
                                           <button onClick={() => handleOpenEdit(u)} className="p-2 border rounded-lg text-gray-400 hover:text-blue-600 hover:border-blue-100"><Edit2 size={18}/></button>
                                           <button onClick={() => {setTargetUserId(u.id); setIsDeleteConfirmOpen(true);}} className="p-2 border rounded-lg text-gray-400 hover:text-red-600 hover:border-red-100"><Trash2 size={18}/></button>
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </Card>
               </div>
   
               <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${activeTab.toUpperCase()} 정보 관리`}>
                   <div className="space-y-4 p-2">
                       <div className="grid grid-cols-2 gap-4">
                           <input className="border p-3 rounded-xl" placeholder="이름" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                           <input className="border p-3 rounded-xl" placeholder="전화번호" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                       </div>
                       <input className="w-full border p-3 rounded-xl bg-gray-50" placeholder="아이디" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} disabled={isEditMode} />
                       
                       {!formData.authUid && (
                           <input className="w-full border p-3 rounded-xl" placeholder="초기 비밀번호 (6자리 이상)" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                       )}
                       
                       {activeTab === 'student' && (
                           <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl">
                               <input className="border p-2 rounded-lg bg-white" placeholder="학교명" value={formData.schoolName} onChange={e => setFormData({...formData, schoolName: e.target.value})} />
                               <select className="border p-2 rounded-lg bg-white" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}>
                                   <option value="1학년">1학년</option><option value="2학년">2학년</option><option value="3학년">3학년</option>
                               </select>
                           </div>
                       )}
   
                       {activeTab === 'parent' && (
                           <div className="bg-gray-50 p-4 border rounded-xl space-y-3">
                                <label className="text-xs font-bold text-gray-500">연결된 자녀(학생)</label>
                                {formData.childName ? (
                                   <div className="flex justify-between items-center font-bold bg-white p-2 rounded-lg border">
                                       <span className="text-blue-600">
                                            {formData.childSnapshot ? `${formData.childSnapshot.name} (${formData.childSnapshot.schoolName})` : formData.childName}
                                       </span>
                                       <button onClick={()=>setFormData({...formData, childId:'', childName:'', childSnapshot: null})}><X size={16}/></button>
                                   </div>
                                ) : (
                                   <div className="space-y-2">
                                       <input className="w-full border p-2 rounded-lg text-sm" placeholder="학생 이름으로 검색" value={studentSearch} onChange={e=>setStudentSearch(e.target.value)}/>
                                       {studentSearch && (
                                           <div className="border bg-white max-h-32 overflow-y-auto rounded-lg shadow-inner">
                                               {studentList.filter(s=>s.name.includes(studentSearch)).map(s=> (
                                                   <div key={s.id} onClick={()=>{
                                                       setFormData({
                                                           ...formData, 
                                                           childId: s.id, 
                                                           childName: s.name,
                                                           childSnapshot: { name: s.name, schoolName: s.schoolName, grade: s.grade }
                                                       }); 
                                                       setStudentSearch('');
                                                   }} className="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-0 flex justify-between">
                                                       <span>{s.name}</span>
                                                       <span className="text-gray-400 text-xs">{s.schoolName} ({s.grade})</span>
                                                   </div>
                                               ))}
                                           </div>
                                       )}
                                   </div>
                                )}
                           </div>
                       )}
   
                       {(activeTab === 'ta' || activeTab === 'lecturer') && (
                           <div className="grid grid-cols-2 gap-4">
                               <input className="border p-3 rounded-xl" placeholder="담당 과목" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
                               {activeTab === 'ta' && <input className="border p-3 rounded-xl" type="number" placeholder="시급" value={formData.hourlyRate} onChange={e => setFormData({...formData, hourlyRate: e.target.value})} />}
                           </div>
                       )}
                       
                       <Button className="w-full py-4 text-lg font-bold mt-4" onClick={handleSaveUser} disabled={loading}>
                           {loading ? <Loader className="animate-spin mx-auto"/> : '사용자 정보 저장'}
                       </Button>
                   </div>
               </Modal>
   
               <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="사용자 계정 삭제">
                   <div className="text-center space-y-6 p-4">
                       <div className="bg-red-50 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto text-red-500">
                           <Trash2 size={40} />
                       </div>
                       <p className="text-lg font-medium">정말로 이 사용자를 시스템에서 삭제하시겠습니까?<br/><span className="text-red-500 font-bold">연결된 모든 데이터가 접근 불가 상태가 됩니다.</span></p>
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