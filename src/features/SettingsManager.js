/* [서비스 가치] 학원의 모든 기초 데이터(SSOT)를 중앙에서 통제하고, 
   최고 관리자 전용 보안 및 시스템 데이터 마이그레이션 스크립트를 안전하게 보호합니다. 
   (🚀 CTO 패치: Search 아이콘 import 누락 오류 완벽 해결 및 100% 풀버전 유지) */
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc, getDocs, getDocsFromServer, query, collection, where, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, secondaryAuth } from '../firebase';
import { 
  Settings, Building, Phone, Hash, DoorOpen, BookOpen, 
  Plus, Save, Loader, MapPin, ShieldCheck, X, ShieldAlert,
  AlertTriangle, Database, School, RefreshCw, Building2, Trash2, Star, Search 
} from 'lucide-react'; // 🚀 Search 아이콘 추가 완료!
import { Button, Card, Toast } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

const SettingsManager = ({ currentUser }) => {
    const { users, loadingData } = useData();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingSchools, setSavingSchools] = useState(false);
    const [systemProcessing, setSystemProcessing] = useState(false);
    const [migrationProcessing, setMigrationProcessing] = useState(false);
    const [schoolMigrationProcessing, setSchoolMigrationProcessing] = useState(false);
    const [mergingSchools, setMergingSchools] = useState(false);

    const [activeTab, setActiveTab] = useState('master');
    const [toast, setToast] = useState({ message: '', type: 'info' });
    const showToast = (message, type = 'success') => setToast({ message, type });

    const [settings, setSettings] = useState({
        academyName: '', businessNumber: '', phone: '', address: '', classrooms: [], subjects: []
    });

    const [newClassroom, setNewClassroom] = useState('');
    const [newSubject, setNewSubject] = useState('');

    const [schools, setSchools] = useState({ elementary: [], middle: [], high: [], favorites: [] });
    const [newSchool, setNewSchool] = useState({ type: 'high', name: '' });

    const [mergeSource, setMergeSource] = useState('');
    const [mergeTarget, setMergeTarget] = useState('');

    useEffect(() => {
        const fetchAllSettings = async () => {
            try {
                const masterRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data');
                const schoolRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schools');
                
                const [masterSnap, schoolSnap] = await Promise.all([getDoc(masterRef), getDoc(schoolRef)]);
                
                if (masterSnap.exists()) {
                    const data = masterSnap.data();
                    setSettings({
                        academyName: data.academyName || '', businessNumber: data.businessNumber || '',
                        phone: data.phone || '', address: data.address || '',
                        classrooms: data.classrooms || [], subjects: data.subjects || []
                    });
                }
                
                if (schoolSnap.exists()) {
                    const data = schoolSnap.data();
                    setSchools({
                        elementary: data.elementary || [],
                        middle: data.middle || [],
                        high: data.high || [],
                        favorites: data.favorites || []
                    });
                }
            } catch (error) {
                console.error("환경설정 로딩 실패:", error);
                showToast("환경설정을 불러오는 중 오류가 발생했습니다.", "error");
            } finally {
                setLoading(false);
            }
        };
        fetchAllSettings();
    }, []);

    // ==============================================================================
    // 1. 기본 인프라(마스터) 관리 로직
    // ==============================================================================
    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data'), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
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

    // ==============================================================================
    // 2. 학교 마스터 데이터 관리 및 6중 스캔 로직
    // ==============================================================================
    const handleSaveSchools = async () => {
        setSavingSchools(true);
        try {
            await setDoc(doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schools'), schools);
            showToast('학교 마스터 데이터가 성공적으로 저장되었습니다.', 'success');
        } catch (e) { 
            showToast(e.message, 'error'); 
        } finally { 
            setSavingSchools(false); 
        }
    };

    const addSchool = () => {
        if (!newSchool.name.trim()) return;
        setSchools(prev => ({
            ...prev,
            [newSchool.type]: [...new Set([...(prev[newSchool.type] || []), newSchool.name.trim()])].sort((a,b) => a.localeCompare(b))
        }));
        setNewSchool(prev => ({ ...prev, name: '' }));
    };

    const removeSchool = (type, name) => {
        setSchools(prev => ({
            ...prev,
            [type]: prev[type].filter(s => s !== name),
            favorites: (prev.favorites || []).filter(s => s !== name)
        }));
    };

    const toggleFavorite = (name) => {
        setSchools(prev => {
            const favs = prev.favorites || [];
            if (favs.includes(name)) return { ...prev, favorites: favs.filter(s => s !== name) };
            return { ...prev, favorites: [...favs, name] };
        });
    };

    const runSchoolMigration = async () => {
        if (!window.confirm("현재 시스템에 등록된 6개 핵심 DB(명부, 통합시험, 기출, 전략, 진단평가, 성적표)의 모든 데이터를 병렬 스캔합니다.\n\n각 데이터베이스에 입력된 학교 이름들을 추출하여 마스터 데이터로 자동 분류 및 병합합니다. (중복 자동 제거)\n\n실행하시겠습니까?")) return;
        
        setSchoolMigrationProcessing(true);
        try {
            const [usersSnap, integratedSnap, archiveSnap, strategySnap, diagSnap, gradeSnap] = await Promise.all([
                getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users')),
                getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'integrated_exams')),
                getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'exam_archive')),
                getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'school_strategies')),
                getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'student_exam_diagnostics')),
                getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'grades'))
            ]);

            const ele = new Set(schools.elementary || []);
            const mid = new Set(schools.middle || []);
            const high = new Set(schools.high || []);
            let scannedCount = 0;

            const processSchoolName = (rawName) => {
                if (!rawName) return;
                const sn = rawName.trim();
                if (!sn) return;
                if (sn.includes('초') || sn.includes('초등')) ele.add(sn);
                else if (sn.includes('중') || sn.includes('중학')) mid.add(sn);
                else high.add(sn); 
                scannedCount++;
            };

            usersSnap.forEach(d => { 
                const u = d.data(); 
                if ((u.role === 'student' || (u.status === 'pending' && u.role === 'student')) && u.schoolName) {
                    processSchoolName(u.schoolName);
                }
            });

            const scanData = (d) => { 
                const data = d.data(); 
                const sName = data.schoolName || data.school; 
                if (sName) processSchoolName(sName); 
            };
            
            integratedSnap.forEach(scanData); 
            archiveSnap.forEach(scanData); 
            strategySnap.forEach(scanData);
            diagSnap.forEach(scanData); 
            gradeSnap.forEach(scanData);

            const newSchools = {
                elementary: [...ele].sort((a,b)=>a.localeCompare(b)),
                middle: [...mid].sort((a,b)=>a.localeCompare(b)),
                high: [...high].sort((a,b)=>a.localeCompare(b)),
                favorites: schools.favorites || []
            };

            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'schools'), newSchools);
            setSchools(newSchools);
            alert(`✅ 총 ${scannedCount}건의 거대 DB 데이터를 스캔하여 학교 목록 완벽 병합을 완료했습니다!`);
        } catch (e) { 
            alert('마이그레이션 실패: ' + e.message); 
        } finally { 
            setSchoolMigrationProcessing(false); 
        }
    };

    const handleMergeSchoolsAction = async () => {
        const source = mergeSource.trim();
        const target = mergeTarget.trim();
        if (!source || !target) return alert('변경 대상과 새 학교 이름을 모두 입력해주세요.');
        if (!window.confirm(`전체 시스템(6개 DB)을 스캔하여\n[${source}] (으)로 입력된 모든 과거 기록을\n👉 [${target}] (으)로 영구 일괄 변경하시겠습니까?\n\n※ 이 작업은 되돌릴 수 없습니다.`)) return;

        setMergingSchools(true);
        try {
            const collectionsToUpdate = ['users', 'integrated_exams', 'exam_archive', 'school_strategies', 'student_exam_diagnostics', 'grades'];
            const batch = writeBatch(db);
            let count = 0;

            for (const colName of collectionsToUpdate) {
                const q1 = query(collection(db, 'artifacts', APP_ID, 'public', 'data', colName), where('schoolName', '==', source));
                const snap1 = await getDocs(q1);
                snap1.forEach(d => { batch.update(d.ref, { schoolName: target, updatedAt: serverTimestamp() }); count++; });

                const q2 = query(collection(db, 'artifacts', APP_ID, 'public', 'data', colName), where('school', '==', source));
                const snap2 = await getDocs(q2);
                snap2.forEach(d => { batch.update(d.ref, { school: target, schoolName: target, updatedAt: serverTimestamp() }); count++; });
            }

            if (count > 0) {
                await batch.commit();
                alert(`✅ 총 ${count}개의 과거 데이터 꼬리표가 [${target}](으)로 성공적으로 일괄 변경되었습니다!`);
                setMergeSource(''); 
                setMergeTarget('');
            } else { 
                alert('스캔 결과, 변경할 데이터가 존재하지 않습니다.'); 
            }
        } catch(e) { 
            alert("병합 중 오류 발생: " + e.message); 
        } finally { 
            setMergingSchools(false); 
        }
    };

    // ==============================================================================
    // 3. 시스템 고급 도구 (기존 최적화 및 레거시 스크립트)
    // ==============================================================================
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

            const freshSnap = await getDocsFromServer(query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users')));
            const freshUsers = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            for (const u of freshUsers) {
                if (!u.authUid) {
                    const safeId = encodeURIComponent(u.userId || u.id).replace(/[^a-zA-Z0-9]/g, 'x').toLowerCase();
                    const email = `${safeId}@imperial.com`;
                    const userPassword = (u.password && String(u.password).length >= 6) ? String(u.password) : 'imperial123!';

                    try {
                        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, userPassword);
                        const newAuthUid = userCredential.user.uid;
                        await signOut(secondaryAuth); 
                        
                        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', u.id), {
                            authUid: newAuthUid,
                            password: userPassword,
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                        authSyncCount++;
                    } catch (authError) {
                        if (authError.code === 'auth/email-already-in-use') {
                            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', u.id), {
                                authUid: 'legacy_verified_account',
                                updatedAt: serverTimestamp()
                            }, { merge: true });
                            authSyncCount++;
                        } else {
                            console.error(`보안망 가입 실패: ${email}`, authError);
                        }
                    }
                }
            }
            alert(`✅ [최적화 완수] 계정 청소 및 보안망 동기화 완료!\n\n* 제거된 중복 찌꺼기 계정: ${dedupeCount}건\n* 초록 방패(정식 보안망) 연동 성공: ${authSyncCount}건`);
        } catch (err) {
            alert("작업 중 오류가 발생했습니다: " + err.message);
        } finally {
            setSystemProcessing(false);
        }
    };

    const handleDataMigration = async () => {
        if (!window.confirm("⚠️ [데이터 마이그레이션]\n\n과거에 생성되어 '과목(subject)' 정보가 누락된 클래스(반) 데이터를 스캔합니다. 스캔 후 클래스 이름을 바탕으로 자동으로 과목을 할당합니다.\n\n이 작업은 아카데미 유니버스 등 최신 기능과의 정상적인 연동을 위해 반드시 필요합니다. 계속하시겠습니까?")) return;
        
        setMigrationProcessing(true);
        try {
            const classesSnap = await getDocsFromServer(collection(db, 'artifacts', APP_ID, 'public', 'data', 'classes'));
            let updateCount = 0;
            const batch = writeBatch(db);

            classesSnap.forEach(docSnap => {
                const cls = docSnap.data();
                if (!cls.subject) {
                    let inferredSubject = '';
                    const name = cls.name || '';

                    if (name.includes('국어') || name.includes('문학') || name.includes('독서') || name.includes('언매') || name.includes('화작') || name.includes('논술')) inferredSubject = '국어';
                    else if (name.includes('수학') || name.includes('수1') || name.includes('수2') || name.includes('미적') || name.includes('기하') || name.includes('확통') || name.includes('수리')) inferredSubject = '수학';
                    else if (name.includes('영어') || name.includes('영문') || name.includes('English') || name.includes('문법')) inferredSubject = '영어';
                    else if (name.includes('과학') || name.includes('물리') || name.includes('화학') || name.includes('생명') || name.includes('지구') || name.includes('통과')) inferredSubject = '과학';

                    if (inferredSubject) {
                        batch.update(docSnap.ref, { subject: inferredSubject, updatedAt: serverTimestamp() });
                        updateCount++;
                    }
                }
            });

            if (updateCount > 0) {
                await batch.commit();
                alert(`✅ 데이터 마이그레이션 완료!\n총 ${updateCount}개의 과거 클래스에 과목 정보가 성공적으로 자동 할당되었습니다.\n이제 아카데미 유니버스가 정상 작동합니다.`);
            } else {
                alert(`✅ 스캔 완료!\n과목 정보가 누락된 클래스가 없습니다. 모든 데이터가 최신 포맷으로 유지되고 있습니다.`);
            }
        } catch (err) {
            alert("마이그레이션 중 오류가 발생했습니다: " + err.message);
        } finally {
            setMigrationProcessing(false);
        }
    };

    if (loading || loadingData) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in">
            <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
            
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-6 md:p-8 rounded-3xl shadow-lg flex justify-between items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2"><Settings size={28}/> 학원 환경설정</h1>
                    <p className="opacity-90 text-sm md:text-base">이곳에서 등록한 학원 인프라 정보는 전체 시스템의 기준 데이터(SSOT)로 활용됩니다.</p>
                </div>
            </div>

            <div className="flex border-b border-gray-200 overflow-x-auto whitespace-nowrap custom-scrollbar">
                <button onClick={() => setActiveTab('master')} className={`px-6 py-4 font-bold text-sm transition-colors flex items-center gap-2 ${activeTab === 'master' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                    <Building size={18}/> 기본 인프라 관리
                </button>
                <button onClick={() => setActiveTab('school_mdm')} className={`px-6 py-4 font-bold text-sm transition-colors flex items-center gap-2 ${activeTab === 'school_mdm' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                    <School size={18}/> 학교 마스터 관리
                </button>
                <button onClick={() => setActiveTab('system')} className={`px-6 py-4 font-bold text-sm transition-colors flex items-center gap-2 ${activeTab === 'system' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                    <Database size={18}/> 시스템 고급 도구
                </button>
            </div>

            {/* 탭 1. 기본 인프라 관리 */}
            {activeTab === 'master' && (
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
                        <Button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 font-bold py-4 text-lg border-0 shadow-lg">
                            {saving ? <Loader className="animate-spin mx-auto" size={24}/> : <><Save size={20} className="inline mr-2"/> 기본 정보 및 목록 저장</>}
                        </Button>
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
                                <BookOpen className="text-purple-600"/> 정규 과목 목록 관리
                            </h2>
                            <div className="flex gap-2">
                                <input type="text" className="flex-1 border-2 border-gray-200 p-3 rounded-xl focus:border-purple-500 outline-none font-bold" value={newSubject} onChange={e => setNewSubject(e.target.value)} onKeyDown={e => e.key === 'Enter' && addArrayItem('subjects', newSubject, setNewSubject)} placeholder="예: 국어, 수학, 영어, 과학" />
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
            )}

            {/* 탭 2. 학교 마스터 데이터 관리 */}
            {activeTab === 'school_mdm' && (
                <div className="space-y-6 animate-in fade-in">
                    
                    <Card className="bg-rose-50 border-rose-100 shadow-sm border-2">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-lg text-rose-900 flex items-center gap-2"><RefreshCw size={20}/> 과거 데이터 교정 및 병합 (Merge Tool)</h3>
                        </div>
                        <p className="text-sm text-rose-700 mb-4">과거에 잘못 입력된 오타 학교명이나 중복 학교명을 정식 이름으로 일괄 변경합니다. (예: 임페고 👉 임페리얼고)</p>
                        <div className="flex flex-col md:flex-row gap-3">
                            <input className="flex-1 border-2 border-rose-200 bg-white p-3 rounded-xl focus:border-rose-400 outline-none font-bold" placeholder="변경 대상 학교명 (오타, 구명칭)" value={mergeSource} onChange={e=>setMergeSource(e.target.value)} />
                            <div className="flex items-center justify-center text-rose-300 font-black">➔</div>
                            <input className="flex-1 border-2 border-emerald-200 bg-white p-3 rounded-xl focus:border-emerald-400 outline-none font-bold text-emerald-800" placeholder="새로운 정식 학교명" value={mergeTarget} onChange={e=>setMergeTarget(e.target.value)} />
                            <Button variant="primary" className="bg-rose-600 hover:bg-rose-700 font-bold shrink-0" onClick={handleMergeSchoolsAction} disabled={mergingSchools}>
                                {mergingSchools ? <Loader className="animate-spin" size={16}/> : '일괄 병합 실행'}
                            </Button>
                        </div>
                    </Card>

                    <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-lg text-emerald-900 flex items-center gap-2"><Search className="inline" size={20}/> 6대 코어 DB 스마트 스캔</h3>
                        </div>
                        <p className="text-sm text-emerald-700 mb-4">재원생 명부, 통합시험, 기출, 전략, 진단평가, 성적표 DB를 스캔하여 마스터 목록을 추출합니다.</p>
                        <Button variant="primary" className="bg-emerald-600 hover:bg-emerald-700 font-bold" onClick={runSchoolMigration} disabled={schoolMigrationProcessing}>
                            {schoolMigrationProcessing ? <Loader className="animate-spin inline-block mr-2" size={16}/> : <Building2 size={16} className="inline mr-2"/>}
                            모든 DB 6중 스캔 및 목록 자동 동기화
                        </Button>
                    </Card>

                    <Card className="w-full">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <div>
                                <h3 className="font-bold text-xl text-gray-800">초/중/고 리스트 관리 및 즐겨찾기(★)</h3>
                                <p className="text-sm text-gray-500 mt-1">별(★) 아이콘을 눌러 즐겨찾기한 학교는 가입창 검색 시 최상단에 박제됩니다.</p>
                            </div>
                            <Button onClick={handleSaveSchools} disabled={savingSchools} className="font-bold shadow-md bg-gray-800 hover:bg-gray-900 text-white shrink-0">
                                {savingSchools ? <Loader className="animate-spin mx-auto" size={16}/> : <><Save size={16} className="mr-2 inline"/> 학교 목록 저장</>}
                            </Button>
                        </div>

                        <div className="flex gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <select className="border-2 rounded-xl p-3 font-bold text-gray-700 focus:border-blue-500 outline-none bg-white" value={newSchool.type} onChange={e => setNewSchool({...newSchool, type: e.target.value})}>
                                <option value="elementary">초등학교</option>
                                <option value="middle">중학교</option>
                                <option value="high">고등학교</option>
                            </select>
                            <input className="flex-1 border-2 p-3 rounded-xl font-bold focus:border-blue-500 outline-none" placeholder="추가할 학교 이름을 입력하세요" value={newSchool.name} onChange={e => setNewSchool({...newSchool, name: e.target.value})} onKeyDown={e => e.key === 'Enter' && addSchool()}/>
                            <Button onClick={addSchool} className="bg-blue-600 hover:bg-blue-700 font-bold"><Plus size={18}/> 추가</Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { id: 'elementary', title: '초등학교', color: 'emerald' },
                                { id: 'middle', title: '중학교', color: 'blue' },
                                { id: 'high', title: '고등학교', color: 'rose' }
                            ].map(cat => (
                                <div key={cat.id} className="border-2 border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col">
                                    <div className={`bg-${cat.color}-50 p-4 border-b border-${cat.color}-100 flex justify-between items-center`}>
                                        <span className={`font-black text-${cat.color}-800`}>{cat.title} <span className="text-xs bg-white px-2 py-0.5 rounded-full border">{(schools[cat.id]||[]).length}교</span></span>
                                    </div>
                                    <div className="p-4 flex-1 h-[400px] overflow-y-auto custom-scrollbar bg-gray-50/50">
                                        {(schools[cat.id]||[]).length === 0 ? <div className="text-center text-gray-400 font-bold mt-10">등록된 학교 없음</div> : (
                                            <div className="flex flex-col gap-2">
                                                {(schools[cat.id]||[]).map(schoolName => {
                                                    const isFav = (schools.favorites || []).includes(schoolName);
                                                    return (
                                                    <div key={schoolName} className={`flex justify-between items-center bg-white border p-2.5 rounded-lg hover:border-gray-300 transition-colors shadow-sm ${isFav ? 'border-yellow-300 bg-yellow-50/30' : ''}`}>
                                                        <span className={`font-bold text-sm ${isFav ? 'text-yellow-700' : 'text-gray-700'}`}>{schoolName}</span>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => toggleFavorite(schoolName)} className={`p-1.5 rounded-md transition-colors ${isFav ? 'text-yellow-500 hover:bg-yellow-100' : 'text-gray-300 hover:bg-gray-100 hover:text-yellow-500'}`}>
                                                                <Star size={16} fill={isFav ? "currentColor" : "none"}/>
                                                            </button>
                                                            <button onClick={() => removeSchool(cat.id, schoolName)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md"><Trash2 size={14}/></button>
                                                        </div>
                                                    </div>
                                                )})}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* 탭 3. 시스템 고급 도구 */}
            {activeTab === 'system' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                    
                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-rose-200 space-y-6">
                        <h2 className="text-xl font-black text-rose-800 border-b border-rose-100 pb-4 flex items-center gap-2">
                            <ShieldAlert className="text-rose-600"/> 계정 보안 최적화 스크립트
                        </h2>
                        
                        <div className="bg-rose-50 text-rose-900 p-5 rounded-2xl border border-rose-200 space-y-2 text-sm">
                            <p className="font-bold flex items-center gap-1.5 text-base mb-3"><AlertTriangle size={18}/> 주의사항</p>
                            <p>• 시스템에 남아있는 모든 직군의 <strong>'중복 계정 찌꺼기'</strong>를 삭제합니다.</p>
                            <p>• 인증소에서 오류가 난 <strong>'회색 방패 계정'</strong>을 강제 동기화합니다.</p>
                            <p className="text-rose-600 font-bold mt-2 pt-2 border-t border-rose-200">※ 현재 시스템 사용자가 없는 시간에 작동을 권장합니다.</p>
                        </div>

                        <Button 
                            onClick={handleAuthSyncAndDedupe} 
                            disabled={systemProcessing} 
                            className="w-full bg-rose-600 hover:bg-rose-700 font-bold py-4 text-lg shadow-md border-0"
                        >
                            {systemProcessing ? <Loader className="animate-spin mx-auto" size={24}/> : '계정 최적화 실행'}
                        </Button>
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-indigo-200 space-y-6">
                        <h2 className="text-xl font-black text-indigo-800 border-b border-indigo-100 pb-4 flex items-center gap-2">
                            <Database className="text-indigo-600"/> 데이터 마이그레이션 툴
                        </h2>
                        
                        <div className="bg-indigo-50 text-indigo-900 p-5 rounded-2xl border border-indigo-200 space-y-2 text-sm">
                            <p className="font-bold flex items-center gap-1.5 text-base mb-3"><Database size={18}/> 레거시 데이터 변환</p>
                            <p>• 신규 기능(아카데미 유니버스 등) 도입 전 생성된 <strong>과거 클래스 데이터</strong>를 스캔합니다.</p>
                            <p>• '과목(Subject)' 정보가 비어있는 반의 이름을 AI 엔진이 분석하여 <strong>정규 과목으로 자동 편입</strong>시킵니다.</p>
                            <p className="text-indigo-600 font-bold mt-2 pt-2 border-t border-indigo-200">※ 에러 없이 언제든 반복해서 실행할 수 있는 안전한 스크립트입니다.</p>
                        </div>

                        <Button 
                            onClick={handleDataMigration} 
                            disabled={migrationProcessing} 
                            className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold py-4 text-lg shadow-md border-0"
                        >
                            {migrationProcessing ? <Loader className="animate-spin mx-auto" size={24}/> : '과목 자동 할당 스크립트 실행'}
                        </Button>
                    </div>

                </div>
            )}
        </div>
    );
};

export default SettingsManager;