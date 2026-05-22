/* [서비스 가치] 학원의 모든 기초 데이터(SSOT)를 중앙에서 통제하고, 
   최고 관리자 전용 보안 및 시스템 최적화 스크립트를 안전하게 보호합니다. */
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc, getDocs, query, collection } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../firebase';
import { 
  Settings, Building, Phone, Hash, DoorOpen, BookOpen, 
  Plus, Save, Loader, MapPin, ShieldCheck, X, ShieldAlert 
} from 'lucide-react';
import { Button } from '../components/UI';

// 🚀 [CTO 패치] 글로벌 데이터 연결
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

const SettingsManager = ({ currentUser }) => {
    const { users, loadingData } = useData();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [systemProcessing, setSystemProcessing] = useState(false);

    // 🚀 탭 분리: 마스터 데이터 vs 시스템 도구
    const [activeTab, setActiveTab] = useState('master');

    const [settings, setSettings] = useState({
        academyName: '', businessNumber: '', phone: '', address: '', classrooms: [], subjects: []
    });

    const [newClassroom, setNewClassroom] = useState('');
    const [newSubject, setNewSubject] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setSettings({
                        academyName: data.academyName || '', businessNumber: data.businessNumber || '',
                        phone: data.phone || '', address: data.address || '',
                        classrooms: data.classrooms || [], subjects: data.subjects || []
                    });
                }
            } catch (error) {
                console.error("환경설정 로딩 실패:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data'), {
                ...settings, updatedAt: serverTimestamp()
            }, { merge: true });
            alert("✅ 학원 환경설정이 성공적으로 저장되었습니다.\n\n등록하신 강의실 및 과목 리스트는 이제 전체 시스템의 드롭다운 메뉴로 연동됩니다.");
        } catch (error) {
            alert("저장 중 오류가 발생했습니다: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const addArrayItem = (field, value, setter) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (settings[field].includes(trimmed)) return alert("이미 등록된 항목입니다.");
        setSettings(prev => ({ ...prev, [field]: [...prev[field], trimmed] }));
        setter('');
    };

    const removeArrayItem = (field, index) => {
        if (!window.confirm("항목을 삭제하시겠습니까?\n이미 이 항목을 사용 중인 기존 데이터에는 영향을 주지 않습니다.")) return;
        setSettings(prev => {
            const arr = [...prev[field]];
            arr.splice(index, 1);
            return { ...prev, [field]: arr };
        });
    };

    // 🚀 [CTO 패치] 보안이 강화된 공간으로 이사온 계정 최적화 스크립트
    const handleAuthSyncAndDedupe = async () => {
        if (!window.confirm("⚠️ [최고 관리자 전용 스크립트]\n시스템에 남아있는 모든 직군의 '중복 계정'을 완벽하게 삭제하고, '회색 방패 계정'을 '초록 방패(안전 연동)'로 일괄 변환하시겠습니까?\n\n* 중복 문서는 진짜(인증된 것)만 남기고 완벽히 삭제됩니다.\n* 데이터베이스 롤백이 불가능하므로 신중하게 실행하십시오.")) return;
        
        setSystemProcessing(true);
        try {
            let dedupeCount = 0;
            let authSyncCount = 0;

            const seenIds = new Set();
            const duplicatesToDelete = [];
            
            const sortedUsers = [...users].sort((a, b) => {
                if (a.authUid && !b.authUid) return -1;
                if (!a.authUid && b.authUid) return 1;
                if (a.id === a.id.toLowerCase() && b.id !== b.id.toLowerCase()) return -1;
                if (a.id !== a.id.toLowerCase() && b.id === b.id.toLowerCase()) return 1;
                return 0;
            });

            for (const u of sortedUsers) {
                const canonicalId = (u.userId || u.id).toLowerCase();
                if (seenIds.has(canonicalId)) {
                    duplicatesToDelete.push(u); 
                } else {
                    seenIds.add(canonicalId); 
                }
            }

            for (const dupe of duplicatesToDelete) {
                await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', dupe.id));
                dedupeCount++;
            }

            const freshSnap = await getDocs(query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users')));
            const freshUsers = freshSnap.docs.map(d => ({id: d.id, ...d.data()}));

            for (const u of freshUsers) {
                if (!u.authUid) {
                    const safeId = encodeURIComponent(u.userId || u.id).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();
                    const email = `${safeId}@imperial.com`;
                    const userPassword = (u.password && String(u.password).length >= 6) ? String(u.password) : 'imperial123!';

                    try {
                        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, userPassword);
                        const newAuthUid = userCredential.user.uid;
                        await signOut(secondaryAuth); 
                        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', u.id), {
                            authUid: newAuthUid,
                            password: userPassword,
                            updatedAt: serverTimestamp()
                        });
                        authSyncCount++;
                    } catch (authError) {
                        if (authError.code === 'auth/email-already-in-use') {
                            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', u.id), {
                                authUid: 'legacy_verified_account',
                                updatedAt: serverTimestamp()
                            });
                            authSyncCount++;
                        } else {
                            console.error(`가입 실패: ${email}`, authError);
                        }
                    }
                }
            }
            alert(`✅ 계정 최적화 및 보안망 동기화 완료!\n\n* 삭제된 중복 찌꺼기 계정: ${dedupeCount}건\n* 초록 방패(안전망) 변환 완료: ${authSyncCount}건`);
        } catch (err) {
            alert("작업 중 오류가 발생했습니다: " + err.message);
        } finally {
            setSystemProcessing(false);
        }
    };

    if (loading || loadingData) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-6 md:p-8 rounded-3xl shadow-lg flex justify-between items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2"><Settings size={28}/> 학원 환경설정 (마스터 데이터)</h1>
                    <p className="opacity-90 text-sm md:text-base">이곳에서 등록한 학원 인프라 정보는 전체 시스템의 기준 데이터(SSOT)로 활용됩니다.</p>
                </div>
                {activeTab === 'master' && (
                    <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold border-0 shadow-lg px-6 py-3">
                        {saving ? <Loader className="animate-spin" size={20}/> : <Save size={20}/>} <span className="ml-2">전체 설정 저장</span>
                    </Button>
                )}
            </div>

            <div className="flex border-b border-gray-200">
                <button onClick={() => setActiveTab('master')} className={`px-6 py-4 font-bold text-sm transition-colors ${activeTab === 'master' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                    기본 인프라 관리
                </button>
                <button onClick={() => setActiveTab('system')} className={`px-6 py-4 font-bold text-sm transition-colors ${activeTab === 'system' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                    시스템 고급 도구
                </button>
            </div>

            {activeTab === 'master' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200 space-y-6">
                        <h2 className="text-xl font-bold text-gray-900 border-b pb-4 flex items-center gap-2">
                            <Building className="text-blue-600"/> 학원 기본 정보
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1"><ShieldCheck size={16}/> 학원명</label>
                                <input type="text" className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-900" value={settings.academyName} onChange={e => setSettings({...settings, academyName: e.target.value})} placeholder="예: 목동 임페리얼 학원" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1"><Hash size={16}/> 사업자등록번호</label>
                                <input type="text" className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-900" value={settings.businessNumber} onChange={e => setSettings({...settings, businessNumber: e.target.value})} placeholder="예: 123-45-67890" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1"><Phone size={16}/> 대표 전화번호</label>
                                <input type="text" className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-900" value={settings.phone} onChange={e => setSettings({...settings, phone: e.target.value})} placeholder="예: 02-1234-5678" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5 flex items-center gap-1"><MapPin size={16}/> 학원 주소</label>
                                <input type="text" className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-blue-500 outline-none font-bold text-gray-900" value={settings.address} onChange={e => setSettings({...settings, address: e.target.value})} placeholder="도로명 주소 입력" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200 space-y-6">
                            <h2 className="text-xl font-bold text-gray-900 border-b pb-4 flex items-center gap-2">
                                <DoorOpen className="text-emerald-600"/> 강의실 목록 관리
                            </h2>
                            <div className="flex gap-2">
                                <input type="text" className="flex-1 border-2 border-gray-200 p-3 rounded-xl focus:border-emerald-500 outline-none font-bold" value={newClassroom} onChange={e => setNewClassroom(e.target.value)} onKeyDown={e => e.key === 'Enter' && addArrayItem('classrooms', newClassroom, setNewClassroom)} placeholder="예: 301호, 대강의실" />
                                <Button onClick={() => addArrayItem('classrooms', newClassroom, setNewClassroom)} className="bg-emerald-600 hover:bg-emerald-700 border-0"><Plus size={20}/></Button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {settings.classrooms.length === 0 && <span className="text-sm text-gray-400 font-bold">등록된 강의실이 없습니다.</span>}
                                {settings.classrooms.map((room, idx) => (
                                    <div key={idx} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-bold">
                                        {room} <button onClick={() => removeArrayItem('classrooms', idx)} className="text-emerald-400 hover:text-emerald-700 transition-colors"><X size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200 space-y-6">
                            <h2 className="text-xl font-bold text-gray-900 border-b pb-4 flex items-center gap-2">
                                <BookOpen className="text-purple-600"/> 정규 과목/학년 목록 관리
                            </h2>
                            <div className="flex gap-2">
                                <input type="text" className="flex-1 border-2 border-gray-200 p-3 rounded-xl focus:border-purple-500 outline-none font-bold" value={newSubject} onChange={e => setNewSubject(e.target.value)} onKeyDown={e => e.key === 'Enter' && addArrayItem('subjects', newSubject, setNewSubject)} placeholder="예: 고1 수학, 중3 영어" />
                                <Button onClick={() => addArrayItem('subjects', newSubject, setNewSubject)} className="bg-purple-600 hover:bg-purple-700 border-0"><Plus size={20}/></Button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                {settings.subjects.length === 0 && <span className="text-sm text-gray-400 font-bold">등록된 과목이 없습니다.</span>}
                                {settings.subjects.map((subj, idx) => (
                                    <div key={idx} className="bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-bold">
                                        {subj} <button onClick={() => removeArrayItem('subjects', idx)} className="text-purple-400 hover:text-purple-700 transition-colors"><X size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-rose-200 space-y-6 animate-in fade-in max-w-2xl">
                    <h2 className="text-xl font-black text-rose-800 border-b border-rose-100 pb-4 flex items-center gap-2">
                        <ShieldAlert className="text-rose-600"/> 시스템 데이터 정리 스크립트
                    </h2>
                    
                    <div className="bg-rose-50 text-rose-900 p-5 rounded-2xl border border-rose-200 space-y-2 text-sm">
                        <p className="font-bold flex items-center gap-1.5 text-base mb-3"><AlertTriangle size={18}/> 주의사항</p>
                        <p>• 이 스크립트는 시스템에 남아있는 모든 직군의 <strong>'중복 계정 찌꺼기'</strong>를 완벽하게 삭제합니다.</p>
                        <p>• 이전에 수동으로 생성되었던 회색 방패 계정들을 <strong>'초록 방패(안전 연동)'</strong>로 일괄 변환합니다.</p>
                        <p className="text-rose-600 font-bold mt-2 pt-2 border-t border-rose-200">※ 실행 전, 현재 시스템 사용자가 없는 새벽 시간에 작동하시는 것을 권장합니다.</p>
                    </div>

                    <Button 
                        onClick={handleAuthSyncAndDedupe} 
                        disabled={systemProcessing} 
                        className="w-full bg-rose-600 hover:bg-rose-700 font-bold py-4 text-lg shadow-md border-0"
                    >
                        {systemProcessing ? <Loader className="animate-spin mx-auto" size={24}/> : '계정 최적화 (중복제거 및 보안 연동) 실행'}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default SettingsManager;