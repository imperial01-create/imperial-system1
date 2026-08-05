/* [서비스 가치] 학원의 모든 기초 데이터(SSOT)를 중앙에서 통제합니다.
   (🚀 CTO 패치: 시즌 네이밍 룰(Naming Convention) 표준화. 시즌 이름을 자유 입력 방식에서 
   '연도 + 하드코딩된 드롭다운(윈터/중간/기말/서머)' 방식으로 강제하여 데이터 파편화를 원천 차단했습니다.) */
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc, getDocsFromServer, collection, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { 
  Settings, Building, Phone, Hash, DoorOpen, BookOpen, 
  Plus, Save, Loader, MapPin, ShieldCheck, X, ShieldAlert,
  AlertTriangle, Database, School, Trash2, Star, Search,
  ToggleRight, ToggleLeft, Layers, Users, CalendarDays 
} from 'lucide-react';
import { Button, Card, Toast } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

const DEPT_INFO = [
    { 
        id: 'DEPT_KOR', label: '국어과', color: 'rose',
        subjects: ['국어 (모든 국어 과목 통합)'] 
    },
    { 
        id: 'DEPT_ENG', label: '영어과', color: 'orange',
        subjects: ['영어 (모든 영어 과목 통합)'] 
    },
    { 
        id: 'DEPT_MATH', label: '수학과', color: 'blue',
        subjects: ['공통수학(1·2)', '대수(수학 I)', '미적분 I(수학 II)', '미적분 II(미적분)', '확률과 통계', '기하'] 
    },
    { 
        id: 'DEPT_SCI', label: '과학과', color: 'emerald',
        subjects: ['통합과학', '물리학 (I·II통합)', '화학 (I·II통합)', '생명과학 (I·II통합)', '지구과학 (I·II통합)'] 
    },
    { 
        id: 'DEPT_SOC', label: '사회과', color: 'purple',
        subjects: ['통합사회(1·2)', '한국사', '생활과윤리', '한국지리', '세계사', '정치와법', '사회문화', '경제'] 
    }
];

const SettingsManager = ({ currentUser }) => {
    const { users, loadingData } = useData();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingSchools, setSavingSchools] = useState(false);
    const [systemProcessing, setSystemProcessing] = useState(false);
    const [migrationProcessing, setMigrationProcessing] = useState(false);
    const [staffDirProcessing, setStaffDirProcessing] = useState(false);

    const [activeTab, setActiveTab] = useState('master');
    const [toast, setToast] = useState({ message: '', type: 'info' });
    const showToast = (message, type = 'success') => setToast({ message, type });

    const [settings, setSettings] = useState({
        academyName: '', businessNumber: '', phone: '', address: '', classrooms: [], subjects: [], seasons: []
    });

    const [newClassroomName, setNewClassroomName] = useState('');
    const [newClassroomCapacity, setNewClassroomCapacity] = useState('');
    
    // 🚀 [CTO 패치] 시즌 생성 폼 상태 (연도와 타입 분리)
    const currentYear = new Date().getFullYear();
    const [newSeason, setNewSeason] = useState({ year: currentYear, type: '윈터시즌', startDate: '', endDate: '' });
    
    const [activeDepartments, setActiveDepartments] = useState(['DEPT_MATH']);

    const [schools, setSchools] = useState({ elementary: [], middle: [], high: [], favorites: [] });
    const [newSchool, setNewSchool] = useState({ type: 'high', name: '' });

    useEffect(() => {
        const fetchAllSettings = async () => {
            try {
                const masterRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data');
                const schoolRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'schools');
                const deptRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'departments'); 
                
                const [masterSnap, schoolSnap, deptSnap] = await Promise.all([getDoc(masterRef), getDoc(schoolRef), getDoc(deptRef)]);
                
                if (masterSnap.exists()) {
                    const data = masterSnap.data();
                    setSettings({
                        academyName: data.academyName || '', businessNumber: data.businessNumber || '',
                        phone: data.phone || '', address: data.address || '',
                        classrooms: (data.classrooms || []).map(c => typeof c === 'string' ? { name: c, capacity: 10 } : c), 
                        subjects: data.subjects || [],
                        seasons: data.seasons || [] 
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

                if (deptSnap.exists()) {
                    setActiveDepartments(deptSnap.data().active || ['DEPT_MATH']);
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

    const handleSaveMaster = async () => {
        setSaving(true);
        try {
            const batch = writeBatch(db);
            const masterRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'master_data');
            const deptRef = doc(db, `artifacts/${APP_ID}/public/data/settings`, 'departments');
            
            batch.set(masterRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
            batch.set(deptRef, { active: activeDepartments, updatedAt: serverTimestamp() }, { merge: true });
            
            await batch.commit();
            alert("✅ 학원 환경설정이 성공적으로 저장되었습니다.\n\n등록하신 강의실, 시즌 일정 및 부서 리스트는 이제 전체 시스템으로 자동 연동됩니다.");
        } catch (error) { 
            alert("저장 중 오류가 발생했습니다: " + error.message); 
        } finally { 
            setSaving(false); 
        }
    };

    const addClassroom = () => {
        const name = newClassroomName.trim();
        const cap = parseInt(newClassroomCapacity) || 0;
        
        if (!name) return alert("강의실 이름을 입력해주세요.");
        if (cap <= 0) return alert("올바른 수용 인원(명)을 숫자로 입력해주세요.");
        
        if (settings.classrooms.some(c => (typeof c === 'string' ? c : c.name) === name)) {
            return alert("이미 등록된 강의실 이름입니다.");
        }
        
        setSettings(prev => ({
            ...prev,
            classrooms: [...prev.classrooms, { name: name, capacity: cap }]
        }));
        
        setNewClassroomName('');
        setNewClassroomCapacity('');
    };

    const removeClassroom = (index) => {
        if (!window.confirm("이 강의실을 목록에서 삭제하시겠습니까?")) return;
        setSettings(prev => { 
            const arr = [...prev.classrooms]; 
            arr.splice(index, 1); 
            return { ...prev, classrooms: arr }; 
        });
    };

    const handleUpdateCapacity = (index, value) => {
        setSettings(prev => {
            const arr = [...prev.classrooms];
            const current = arr[index];
            const rName = typeof current === 'string' ? current : current.name;
            arr[index] = { name: rName, capacity: value === '' ? '' : (parseInt(value, 10) || 0) };
            return { ...prev, classrooms: arr };
        });
    };

    // 🚀 [CTO 패치] 드롭다운 기반 시즌 추가 핸들러
    const addSeason = () => {
        if (!newSeason.year || !newSeason.type || !newSeason.startDate || !newSeason.endDate) {
            return alert("시즌 연도, 종류, 시작일, 종료일을 모두 선택/입력해주세요.");
        }
        if (newSeason.startDate > newSeason.endDate) {
            return alert("시작일은 종료일보다 이전이어야 합니다.");
        }
        
        // 연도와 하드코딩된 시즌 타입을 결합하여 이름 생성 (예: "2026 윈터시즌")
        const combinedName = `${newSeason.year} ${newSeason.type}`;

        // 중복 방지
        if ((settings.seasons || []).some(s => s.name === combinedName)) {
            return alert(`이미 [${combinedName}] 시즌이 존재합니다.`);
        }

        const seasonId = `season_${Date.now()}`;
        setSettings(prev => ({
            ...prev,
            seasons: [...(prev.seasons || []), { id: seasonId, name: combinedName, startDate: newSeason.startDate, endDate: newSeason.endDate }]
        }));
        
        // 폼 초기화 (연도와 타입은 유지, 날짜만 리셋)
        setNewSeason(prev => ({ ...prev, startDate: '', endDate: '' }));
    };

    const removeSeason = (index) => {
        if (!window.confirm("이 시즌을 삭제하시겠습니까?\n(이미 이 시즌으로 개설된 강의들은 '과거 데이터'로 분류될 수 있습니다.)")) return;
        setSettings(prev => {
            const arr = [...(prev.seasons || [])];
            arr.splice(index, 1);
            return { ...prev, seasons: arr };
        });
    };

    const toggleDepartment = (deptId) => {
        setActiveDepartments(prev => 
            prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
        );
    };

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

    /* 🔒 [보안 패치] 이 스크립트에서 '인증 계정 일괄 생성' 부분을 제거했습니다.
       기존 방식의 문제:
         - 비밀번호가 없는 계정에 소스코드에 적힌 고정 비밀번호를 그대로 부여했습니다.
           (같은 값이 SMS 게이트웨이 앱에도 하드코딩되어 사실상 공개된 비밀번호였습니다)
         - 부여한 비밀번호를 Firestore에 평문으로 다시 저장했습니다.
       대체 방식:
         - 인증 계정은 사용자가 처음 로그인할 때 서버(legacyLoginBridge)가 자동으로 만들어 주고,
           그 즉시 평문 비밀번호를 삭제합니다. 별도 스크립트가 필요 없습니다.
       따라서 이 버튼은 이제 '중복 문서 정리'만 수행합니다. */
    const handleAuthSyncAndDedupe = async () => {
        if (!window.confirm("⚠️ [최고 관리자 전용]\n같은 아이디로 중복 생성된 사용자 문서를 정리합니다.\n\n* 인증 계정이 연결된 문서를 우선 남기고 나머지를 삭제합니다.\n* 롤백이 불가능하므로 신중하게 실행하십시오.")) return;

        setSystemProcessing(true);
        try {
            let dedupeCount = 0;
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
                if (seenIds.has(canonicalId)) duplicatesToDelete.push(u);
                else seenIds.add(canonicalId);
            }

            for (const dupe of duplicatesToDelete) {
                await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', dupe.id));
                dedupeCount++;
            }

            alert(`✅ 중복 문서 정리 완료!\n\n* 제거된 중복 계정 문서: ${dedupeCount}건\n\n인증 계정 연동은 각 사용자가 다음 로그인 시 자동으로 처리됩니다.`);
        } catch (err) {
            alert("작업 중 오류가 발생했습니다: " + err.message);
        } finally {
            setSystemProcessing(false);
        }
    };

    /* 🔒 교직원 명부(staff_directory) 채우기
       학생/학부모 화면은 '담당 강사 이름'만 필요한데, 예전에는 그걸 위해 전체 사용자 목록을
       내려받았습니다(전 원생 연락처와 교직원 계좌번호까지 함께 노출).
       이제는 이름/역할/과목만 담긴 명부를 따로 두고 그것만 읽습니다.
       앞으로 추가되는 교직원은 서버가 자동 반영하므로, 이 버튼은 기존 인원을 한 번 채울 때만 씁니다. */
    const handleSyncStaffDirectory = async () => {
        if (!window.confirm("현재 등록된 교직원(관리자·행정조교·강사·수업조교)을 학생/학부모용 명부에 반영합니다.\n\n안전한 작업이며 여러 번 눌러도 문제없습니다. 진행할까요?")) return;
        setStaffDirProcessing(true);
        try {
            const backfill = httpsCallable(functions, 'backfillStaffDirectory');
            const res = await backfill({});
            alert(`✅ 교직원 명부 동기화 완료!\n\n반영된 인원: ${res?.data?.count ?? 0}명\n\n이제 학생/학부모 화면에서도 담당 강사 이름이 정상 표시됩니다.`);
        } catch (err) {
            alert("동기화 중 오류가 발생했습니다: " + (err.message || ''));
        } finally {
            setStaffDirProcessing(false);
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
                <div className="space-y-6 animate-in fade-in">
                    
                    {/* 🚀 학사 일정 및 시즌 마스터 관리 */}
                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-indigo-200 space-y-6">
                        <div className="border-b pb-4">
                            <h2 className="text-xl font-black text-indigo-900 flex items-center gap-2 mb-2">
                                <CalendarDays className="text-indigo-600"/> 학사 일정 및 글로벌 시즌 관리
                            </h2>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                학원의 1년 커리큘럼(시즌)을 자유롭게 등록하세요. 설정된 기간에 맞춰 <strong>강사/데스크의 시간표 시스템이 해당 시즌으로 완벽하게 자동 전환(Auto-Routing)</strong>됩니다.
                            </p>
                        </div>
                        
                        <div className="flex flex-col xl:flex-row gap-2 bg-indigo-50 p-3 rounded-xl border border-indigo-100 shadow-inner">
                            {/* 🚀 [CTO 패치] 연도 입력 */}
                            <div className="flex items-center gap-2 shrink-0">
                                <input 
                                    type="number" 
                                    className="w-24 border-2 border-indigo-200 p-2.5 rounded-lg outline-none font-bold text-sm bg-white focus:border-indigo-500 text-center" 
                                    value={newSeason.year} 
                                    onChange={e => setNewSeason({...newSeason, year: e.target.value})} 
                                    placeholder="연도" 
                                />
                                <span className="font-black text-indigo-900">년</span>
                            </div>

                            {/* 🚀 [CTO 패치] 하드코딩된 시즌 드롭다운 */}
                            <select 
                                className="flex-1 border-2 border-indigo-200 p-2.5 rounded-lg outline-none font-bold text-sm bg-white text-indigo-900 focus:border-indigo-500 min-w-[150px]"
                                value={newSeason.type}
                                onChange={e => setNewSeason({...newSeason, type: e.target.value})}
                            >
                                <option value="윈터시즌">❄️ 윈터시즌</option>
                                <option value="1학기 중간고사">🌸 1학기 중간고사</option>
                                <option value="1학기 기말고사">🌿 1학기 기말고사</option>
                                <option value="서머시즌">☀️ 서머시즌</option>
                                <option value="2학기 중간고사">🍁 2학기 중간고사</option>
                                <option value="2학기 기말고사">⛄ 2학기 기말고사</option>
                            </select>

                            {/* 날짜 선택 */}
                            <div className="flex items-center gap-2 w-full xl:w-auto">
                                <input 
                                    type="date" 
                                    className="flex-1 xl:w-auto border-2 border-indigo-200 p-2.5 rounded-lg outline-none font-bold text-sm bg-white text-gray-700 focus:border-indigo-500" 
                                    value={newSeason.startDate} 
                                    onChange={e => setNewSeason({...newSeason, startDate: e.target.value})} 
                                />
                                <span className="text-indigo-400 font-black">~</span>
                                <input 
                                    type="date" 
                                    className="flex-1 xl:w-auto border-2 border-indigo-200 p-2.5 rounded-lg outline-none font-bold text-sm bg-white text-gray-700 focus:border-indigo-500" 
                                    value={newSeason.endDate} 
                                    onChange={e => setNewSeason({...newSeason, endDate: e.target.value})} 
                                />
                                <Button onClick={addSeason} className="bg-indigo-600 hover:bg-indigo-700 border-0 h-[42px] px-4 shadow-md shrink-0"><Plus size={18}/></Button>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar p-1">
                            {(!settings.seasons || settings.seasons.length === 0) && <div className="text-sm text-gray-400 font-bold text-center py-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">등록된 시즌 데이터가 없습니다. 상단에서 시즌을 추가해 주세요.</div>}
                            {(settings.seasons || []).sort((a,b) => a.startDate.localeCompare(b.startDate)).map((season, idx) => (
                                <div key={season.id} className="bg-white border-2 border-gray-100 p-3 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm hover:border-indigo-200 transition-colors">
                                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                                        <span className="font-black text-indigo-900 text-base">{season.name}</span>
                                        <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md border border-gray-200 flex items-center gap-1 w-fit">
                                            <CalendarDays size={12}/> {season.startDate} ~ {season.endDate}
                                        </span>
                                    </div>
                                    <button onClick={() => removeSeason(settings.seasons.findIndex(s => s.id === season.id))} className="text-gray-400 hover:bg-rose-100 hover:text-rose-500 p-2 rounded-lg transition-colors flex justify-center w-full md:w-auto"><Trash2 size={16}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        {/* 1-1. 학원 기본 정보 */}
                        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200 space-y-6 h-fit">
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

                        {/* 1-2. 강의실 및 수용 인원 목록 관리 */}
                        <div className="space-y-6">
                            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200 space-y-6">
                                <h2 className="text-xl font-bold text-gray-900 border-b pb-4 flex items-center gap-2">
                                    <DoorOpen className="text-emerald-600"/> 강의실 및 수용 인원 관리
                                </h2>
                                
                                <div className="flex flex-col sm:flex-row gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <input 
                                        type="text" 
                                        className="flex-1 border-2 border-gray-200 p-2.5 rounded-lg focus:border-emerald-500 outline-none font-bold text-sm" 
                                        value={newClassroomName} 
                                        onChange={e => setNewClassroomName(e.target.value)} 
                                        placeholder="강의실명 (예: 1관 301호)" 
                                    />
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-white border-2 border-gray-200 rounded-lg overflow-hidden focus-within:border-emerald-500 transition-colors">
                                            <Users size={16} className="text-gray-400 ml-3" />
                                            <input 
                                                type="number" 
                                                min="1"
                                                className="w-20 p-2.5 outline-none font-black text-sm text-center text-emerald-700 bg-transparent" 
                                                value={newClassroomCapacity} 
                                                onChange={e => setNewClassroomCapacity(e.target.value)} 
                                                placeholder="인원수" 
                                                onKeyDown={e => e.key === 'Enter' && addClassroom()}
                                            />
                                            <span className="text-xs font-bold text-gray-400 pr-3">명</span>
                                        </div>
                                        <Button onClick={addClassroom} className="bg-emerald-600 hover:bg-emerald-700 border-0 h-[42px] px-4"><Plus size={18}/></Button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto custom-scrollbar p-1">
                                    {settings.classrooms.length === 0 && <div className="col-span-full text-sm text-gray-400 font-bold text-center py-4 border-2 border-dashed rounded-xl">등록된 강의실이 없습니다.</div>}
                                    {settings.classrooms.map((room, idx) => {
                                        const rName = typeof room === 'string' ? room : room.name;
                                        const rCap = typeof room === 'string' ? '' : (room.capacity || '');
                                        return (
                                        <div key={idx} className="bg-emerald-50 border border-emerald-200 pl-3 pr-2 py-2 rounded-xl flex items-center justify-between gap-2 shadow-sm">
                                            <span className="text-sm font-black text-gray-800 break-keep leading-tight">{rName}</span>
                                            
                                            <div className="flex items-center gap-1 shrink-0">
                                                <div className="flex items-center bg-white border border-emerald-200 rounded-md overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-emerald-400 transition-shadow">
                                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-1">최대</span>
                                                    <input 
                                                        type="number" 
                                                        className="w-10 text-center text-[11px] font-black text-emerald-800 outline-none py-1 bg-transparent"
                                                        value={rCap}
                                                        onChange={(e) => handleUpdateCapacity(idx, e.target.value)}
                                                        placeholder="인원"
                                                    />
                                                    <span className="text-[10px] font-bold text-emerald-600 pr-1.5 py-1">명</span>
                                                </div>
                                                <button onClick={() => removeClassroom(idx)} className="text-gray-400 hover:bg-rose-100 hover:text-rose-500 p-1.5 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>

                            {/* 1-3. 계층형 부서(대과목) 관리 UI */}
                            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200 space-y-6">
                                <div className="border-b pb-4">
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
                                        <BookOpen className="text-purple-600"/> 학원 운영 부서 (대과목) 활성화
                                    </h2>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        아래 대과목 토글 스위치를 켜면, 해당 부서에 속한 <b className="text-purple-700">모든 세부 과목(표준 코드) 전체가 시스템의 드롭다운에 자동으로 연동</b>됩니다.
                                    </p>
                                </div>
                                
                                <div className="grid grid-cols-1 gap-4">
                                    {DEPT_INFO.map(dept => {
                                        const isActive = activeDepartments.includes(dept.id);
                                        return (
                                            <div key={dept.id} onClick={() => toggleDepartment(dept.id)} className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-3 ${isActive ? `bg-${dept.color}-50 border-${dept.color}-500 shadow-sm` : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`font-black text-lg flex items-center gap-2 ${isActive ? `text-${dept.color}-900` : 'text-gray-400'}`}>
                                                        <Layers size={20} /> {dept.label}
                                                    </span>
                                                    {isActive ? <ToggleRight size={32} className={`text-${dept.color}-600`} /> : <ToggleLeft size={32} className="text-gray-300" />}
                                                </div>
                                                
                                                <div className={`flex flex-wrap gap-1.5 ${isActive ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                                                    {dept.subjects.map(subj => (
                                                        <span key={subj} className={`text-[10px] md:text-xs font-bold px-2 py-1 rounded-md border ${isActive ? `bg-white text-${dept.color}-700 border-${dept.color}-200` : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                                            {subj}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <Button onClick={handleSaveMaster} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 font-bold py-4 text-lg border-0 shadow-lg mt-6">
                        {saving ? <Loader className="animate-spin mx-auto" size={24}/> : <><Save size={20} className="inline mr-2"/> 인프라, 일정 및 부서 통합 저장</>}
                    </Button>
                </div>
            )}

            {/* 탭 2. 학교 마스터 데이터 관리 */}
            {activeTab === 'school_mdm' && (
                <div className="space-y-6 animate-in fade-in">
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

                        <div className="flex flex-col md:flex-row gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
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

                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-emerald-200 space-y-6 md:col-span-2">
                        <h2 className="text-xl font-black text-emerald-800 border-b border-emerald-100 pb-4 flex items-center gap-2">
                            <Users className="text-emerald-600"/> 교직원 명부 동기화 (개인정보 보호)
                        </h2>

                        <div className="bg-emerald-50 text-emerald-900 p-5 rounded-2xl border border-emerald-200 space-y-2 text-sm">
                            <p className="font-bold flex items-center gap-1.5 text-base mb-3"><ShieldCheck size={18}/> 왜 필요한가요?</p>
                            <p>• 예전에는 학생·학부모 화면이 <strong>담당 강사 이름 하나</strong> 때문에 전체 사용자 목록을 내려받았습니다.</p>
                            <p>• 그 과정에서 <strong>전 원생의 연락처</strong>와 <strong>교직원의 계좌번호</strong>까지 함께 전달되고 있었습니다.</p>
                            <p>• 이제는 이름·역할·과목만 담은 별도 명부를 사용합니다.</p>
                            <p className="text-emerald-700 font-bold mt-2 pt-2 border-t border-emerald-200">※ 도입 시 <strong>한 번만</strong> 실행하면 됩니다. 이후 추가되는 교직원은 자동 반영됩니다.</p>
                        </div>

                        <Button
                            onClick={handleSyncStaffDirectory}
                            disabled={staffDirProcessing}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold py-4 text-lg shadow-md border-0"
                        >
                            {staffDirProcessing ? <Loader className="animate-spin mx-auto" size={24}/> : '교직원 명부 채우기 실행'}
                        </Button>
                    </div>

                </div>
            )}
        </div>
    );
};

export default SettingsManager;