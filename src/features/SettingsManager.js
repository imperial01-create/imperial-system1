/* [서비스 가치] 학원의 모든 기초 데이터(SSOT)를 중앙에서 통제합니다.
   (🚀 CTO 패치: 시즌 네이밍 룰(Naming Convention) 표준화. 시즌 이름을 자유 입력 방식에서 
   '연도 + 하드코딩된 드롭다운(윈터/중간/기말/서머)' 방식으로 강제하여 데이터 파편화를 원천 차단했습니다.) */
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc, getDocsFromServer, collection, writeBatch, deleteField } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { normalizeSchoolName, findCanonicalSchool } from '../utils/schoolName';
import { reassignExamReferences, countExamReferences } from '../utils/examDocRefs';
import { 
  Settings, Building, Phone, Hash, DoorOpen, BookOpen, 
  Plus, Save, Loader, MapPin, ShieldCheck, X, ShieldAlert,
  AlertTriangle, Database, School, Trash2, Star, Search,
  ToggleRight, ToggleLeft, Layers, Users, CalendarDays 
} from 'lucide-react';
import { Button, Card, Toast } from '../components/UI';
import { useData } from '../contexts/DataContext';
import { APP_ID } from '../constants';


/* ⚠️ Tailwind 클래스 이름은 절대 조립하지 마세요.
   `bg-${color}-50` 처럼 이름 중간에 변수를 넣으면, 빌드가 소스를 문자열로 훑을 때
   완성된 이름을 찾지 못해 그 스타일이 CSS에서 통째로 빠집니다.
   (예전에 이 파일이 그랬고, 영어과·사회과 카드의 테두리 색이 실제로 사라졌습니다.)
   그래서 완성된 클래스 문자열을 아래 표에 미리 적어 둡니다. */
const DEPT_STYLES = {
    rose:    { box: 'bg-rose-50 border-rose-500',       title: 'text-rose-900',    toggle: 'text-rose-600',    chip: 'bg-white text-rose-700 border-rose-200' },
    orange:  { box: 'bg-orange-50 border-orange-500',   title: 'text-orange-900',  toggle: 'text-orange-600',  chip: 'bg-white text-orange-700 border-orange-200' },
    blue:    { box: 'bg-blue-50 border-blue-500',       title: 'text-blue-900',    toggle: 'text-blue-600',    chip: 'bg-white text-blue-700 border-blue-200' },
    emerald: { box: 'bg-emerald-50 border-emerald-500', title: 'text-emerald-900', toggle: 'text-emerald-600', chip: 'bg-white text-emerald-700 border-emerald-200' },
    purple:  { box: 'bg-purple-50 border-purple-500',   title: 'text-purple-900',  toggle: 'text-purple-600',  chip: 'bg-white text-purple-700 border-purple-200' }
};

/** 학교급 목록 카드 색상 (아래 school_mdm 탭에서 사용) */
const SCHOOL_CAT_STYLES = {
    emerald: { head: 'bg-emerald-50 border-emerald-100', title: 'text-emerald-800' },
    blue:    { head: 'bg-blue-50 border-blue-100',       title: 'text-blue-800' },
    rose:    { head: 'bg-rose-50 border-rose-100',       title: 'text-rose-800' }
};

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
    const [studentDirProcessing, setStudentDirProcessing] = useState(false);
    const [claimsProcessing, setClaimsProcessing] = useState(false);
    const [claimsResult, setClaimsResult] = useState(null);
    // 문자 게이트웨이 계정 발급 — 비밀번호는 화면에만 잠시 존재하고 어디에도 저장하지 않는다
    const [gatewayProcessing, setGatewayProcessing] = useState(false);
    const [gatewayCred, setGatewayCred] = useState(null);

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
    /* 문자 게이트웨이(법인폰 앱) 전용 계정을 발급한다.
       비밀번호는 서버가 만들어 이 응답으로만 내려준다. 화면을 닫으면 사라지며
       Firestore·로그·소스코드 어디에도 남지 않는다. 그래서 '한 번만 보인다'. */
    const handleProvisionGateway = async () => {
        if (currentUser?.role !== 'admin') return;
        if (!window.confirm(
            "문자 게이트웨이 전용 계정(smsgw)의 비밀번호를 새로 발급합니다.\n\n" +
            "• 새 비밀번호는 이 화면에 딱 한 번만 표시됩니다.\n" +
            "• 법인폰 앱에 새 비밀번호를 넣기 전까지는 기존 계정(admin)으로 문자가 계속 나갑니다.\n" +
            "• 이미 smsgw 계정이 있다면 비밀번호가 교체되며, 그 폰은 재입력이 필요합니다.\n\n" +
            "계속할까요?"
        )) return;

        setGatewayProcessing(true);
        try {
            const fn = httpsCallable(functions, 'provisionSmsGateway');
            const res = await fn({});
            setGatewayCred(res.data);
        } catch (e) {
            showToast('게이트웨이 계정 발급 실패: ' + (e.message || '서버 오류'), 'error');
        } finally {
            setGatewayProcessing(false);
        }
    };

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
    /* 문자 게이트웨이(법인폰 앱)가 상담 대상을 고를 때 쓰는 학생 명부를 채운다.
       앱이 users 컬렉션 전체를 읽던 것을 대체하기 위한 최소 사본이다. */
    const handleSyncStudentDirectory = async () => {
        if (!window.confirm("문자 게이트웨이 앱이 쓸 학생 명부(이름·학교·학년)를 채웁니다.\n\n안전한 작업이며 여러 번 눌러도 문제없습니다. 진행할까요?")) return;
        setStudentDirProcessing(true);
        try {
            const backfill = httpsCallable(functions, 'backfillStudentDirectory');
            const res = await backfill({});
            alert(`✅ 학생 명부 동기화 완료!\n\n반영된 인원: ${res?.data?.count ?? 0}명\n\n이제 법인폰 앱을 새 버전으로 교체하시면 됩니다.`);
        } catch (err) {
            alert("동기화 중 오류가 발생했습니다: " + (err.message || ''));
        } finally {
            setStudentDirProcessing(false);
        }
    };

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

    /* 🔑 역할 토큰(Custom Claims) 일괄 부여
       보안 규칙이 권한을 판단할 때 사용자 문서를 조회하지 않고 로그인 토큰만 보게 합니다.
       조회 한도에 걸려 '권한 없음' 오류가 나던 문제(클리닉 예약 실패 등)를 없앱니다. */
    const handleBackfillClaims = async () => {
        if (!window.confirm("전체 사용자에게 역할 정보를 로그인 토큰에 부여합니다.\n\n인원 수에 따라 1~2분 걸릴 수 있습니다. 안전한 작업이며 여러 번 눌러도 됩니다.\n진행할까요?")) return;
        setClaimsProcessing(true);
        setClaimsResult(null);
        try {
            const backfill = httpsCallable(functions, 'backfillUserClaims');
            const res = await backfill({});
            setClaimsResult(res?.data || null);
        } catch (err) {
            alert("역할 토큰 부여 중 오류가 발생했습니다: " + (err.message || ''));
        } finally {
            setClaimsProcessing(false);
        }
    };

    /* ─────────────────────────────────────────────────────────────────────
       학교명 표기 통합

       [무엇을 하나]
       같은 학교가 '영일고' / '영일 고등학교' / '영일고등학교' 로 흩어져 저장된 것을
       학교 마스터 목록의 정식 명칭 하나로 맞춥니다.

       [무엇을 하지 않나 — 중요]
       기출·내신 자료(integrated_exams)의 학교명은 '진단만' 하고 고치지 않습니다.
       그 컬렉션은 문서 번호 자체에 학교명이 들어 있어서, 학교명을 바꾸면 다음에
       그 리포트를 수정할 때 문서 번호가 새로 만들어지고 옛 문서가 지워집니다.
       그러면 학생 성적 진단이 참조하던 연결이 끊어져 예측 등급이 사라집니다.
       조회는 이미 표기가 달라도 찾도록 고쳐 두었으므로 실사용에는 지장이 없습니다.
       ───────────────────────────────────────────────────────────────────── */
    const SCHOOL_FIX_TARGETS = [
        { id: 'users', label: '학생/학부모 계정', writable: true },
        { id: 'academic_calendars', label: '학사일정', writable: true },
        { id: 'integrated_exams', label: '기출·내신 자료', writable: false }
    ];

    // Firestore 일괄 쓰기 상한은 500건입니다. 초과하면 묶음 전체가 취소되므로 여유를 둡니다.
    const SCHOOL_FIX_CHUNK = 400;

    const [schoolScan, setSchoolScan] = useState(null);
    const [schoolFixProcessing, setSchoolFixProcessing] = useState(false);

    const scanSchoolNames = async () => {
        const report = [];
        for (const t of SCHOOL_FIX_TARGETS) {
            const snap = await getDocsFromServer(collection(db, 'artifacts', APP_ID, 'public', 'data', t.id));
            const pending = [];
            const groups = new Map();

            snap.forEach(d => {
                const v = d.data();

                /* 학부모 계정은 '자녀 학교'를 childSchool 에 갖고 있고, 화면(내신 연구소)도
                   그 필드를 먼저 읽습니다. schoolName 만 보면 학부모가 통째로 누락됩니다. */
                const fields = t.id === 'users' ? ['schoolName', 'school', 'childSchool'] : ['schoolName', 'school'];

                fields.forEach(field => {
                    const raw = v[field];
                    if (!raw) return;

                    const key = normalizeSchoolName(raw);
                    if (!key) return;

                    if (!groups.has(key)) groups.set(key, new Set());
                    groups.get(key).add(raw);

                    // 마스터 목록에 정식 명칭이 있고 현재 값이 그것과 다르면 정리 대상
                    const canonical = findCanonicalSchool(raw, schools);
                    if (t.writable && canonical && canonical !== raw) {
                        pending.push({
                            id: d.id,
                            field,
                            from: raw,
                            to: canonical,
                            // 이미 원본이 보관돼 있으면 다시 덮어쓰지 않습니다.
                            hasOriginal: v[`${field}Original`] !== undefined
                        });
                    }
                });
            });

            const merged = [...groups.entries()]
                .filter(([, names]) => names.size > 1)
                .map(([key, names]) => ({ key, names: [...names] }));

            report.push({ ...t, total: snap.size, pending, merged });
        }
        return report;
    };

    const handleScanSchoolNames = async () => {
        setSchoolFixProcessing(true);
        try {
            setSchoolScan(await scanSchoolNames());
        } catch (e) {
            alert('진단 중 오류가 발생했습니다: ' + e.message);
        } finally {
            setSchoolFixProcessing(false);
        }
    };

    const handleApplySchoolNames = async () => {
        if (!schoolScan) return alert('먼저 [1) 진단하기]를 눌러 무엇이 바뀌는지 확인해주세요.');
        const total = schoolScan.reduce((s, t) => s + t.pending.length, 0);
        if (total === 0) return alert('정리할 항목이 없습니다. 이미 모두 통일되어 있습니다.');

        if (!window.confirm(
            `총 ${total}건의 학교명을 마스터 목록의 정식 명칭으로 맞춥니다.\n\n` +
            `원래 이름은 따로 보관하므로 [되돌리기]로 언제든 취소할 수 있습니다.\n` +
            `여러 번 눌러도 문제없습니다.\n\n진행할까요?`
        )) return;

        setSchoolFixProcessing(true);
        let written = 0;
        const failed = [];
        try {
            for (const t of schoolScan) {
                if (!t.writable) continue;
                for (let i = 0; i < t.pending.length; i += SCHOOL_FIX_CHUNK) {
                    const slice = t.pending.slice(i, i + SCHOOL_FIX_CHUNK);
                    const batch = writeBatch(db);
                    slice.forEach(p => {
                        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', t.id, p.id);
                        const patch = { [p.field]: p.to };
                        // 원본은 '최초 한 번만' 보관합니다. 다시 덮어쓰면 되돌릴 수 없게 됩니다.
                        if (!p.hasOriginal) patch[`${p.field}Original`] = p.from;
                        batch.update(ref, patch);
                    });
                    try {
                        await batch.commit();
                        written += slice.length;
                    } catch (e) {
                        /* 권한 거부는 대부분 '역할 토큰'이 없어서 생깁니다.
                           보안 규칙이 역할을 확인하려고 문서를 조회하는데, 일괄 쓰기에는
                           조회 횟수 제한이 있어 묶음 전체가 거부됩니다. */
                        if (e?.code === 'permission-denied') {
                            throw new Error(
                                '권한이 거부되었습니다.\n\n' +
                                '위쪽 [전체 사용자 역할 토큰 부여]를 먼저 실행한 뒤,\n' +
                                '로그아웃했다가 다시 로그인하고 시도해주세요.'
                            );
                        }
                        failed.push(`${t.label} ${i + 1}~${i + slice.length}번째 (${e.message})`);
                    }
                }
            }
            alert(
                `✅ 학교명 통합 완료!\n\n정리된 항목: ${written}건` +
                (failed.length ? `\n\n실패한 묶음 ${failed.length}개:\n${failed.join('\n')}\n\n[진단하기]를 다시 눌러 남은 건수를 확인해주세요.` : '')
            );
            setSchoolScan(await scanSchoolNames());
        } catch (e) {
            // 중간에 멈춰도 이미 반영된 건수는 알려드립니다. (부분 적용 상태를 감추지 않습니다)
            alert(
                `작업이 중단되었습니다.\n\n${e.message}\n\n` +
                `여기까지 반영된 항목: ${written}건\n` +
                `[진단하기]를 다시 눌러 남은 건수를 확인한 뒤 재실행하면 이어서 진행됩니다.`
            );
        } finally {
            setSchoolFixProcessing(false);
        }
    };

    const handleRollbackSchoolNames = async () => {
        if (!window.confirm('학교명을 통합 이전의 원래 표기로 되돌립니다.\n\n진행할까요?')) return;
        setSchoolFixProcessing(true);
        let restored = 0;
        try {
            for (const t of SCHOOL_FIX_TARGETS) {
                if (!t.writable) continue;
                const snap = await getDocsFromServer(collection(db, 'artifacts', APP_ID, 'public', 'data', t.id));
                const FIELDS = t.id === 'users' ? ['schoolName', 'school', 'childSchool'] : ['schoolName', 'school'];
                const targets = snap.docs.filter(d => FIELDS.some(f => d.data()[`${f}Original`] !== undefined));

                for (let i = 0; i < targets.length; i += SCHOOL_FIX_CHUNK) {
                    const slice = targets.slice(i, i + SCHOOL_FIX_CHUNK);
                    const batch = writeBatch(db);
                    slice.forEach(d => {
                        const v = d.data();
                        const patch = {};
                        FIELDS.forEach(f => {
                            if (v[`${f}Original`] !== undefined) {
                                patch[f] = v[`${f}Original`];
                                patch[`${f}Original`] = deleteField();
                            }
                        });
                        batch.update(d.ref, patch);
                    });
                    await batch.commit();
                    restored += slice.length;
                }
            }
            alert(`되돌리기 완료: ${restored}건`);
            setSchoolScan(null);
        } catch (e) {
            alert('되돌리기 중 오류가 발생했습니다: ' + e.message);
        } finally {
            setSchoolFixProcessing(false);
        }
    };

    /* ─────────────────────────────────────────────────────────────────────
       중복 기출·내신 자료 병합

       학교명 표기가 갈려서 검색이 안 되면, 담당자가 "없네" 하고 같은 시험을
       다시 등록하게 됩니다. 그 결과 같은 시험이 두 문서로 쪼개집니다.
       (예: '영일 고등학교 2025 1학년 1학기 중간고사 수학' 과
             '영일고등학교 2025 1학년 1학기 중간고사 수학')

       이 도구는 그런 쌍을 찾아 하나로 합칩니다.
       - 내용이 가장 충실한 문서를 남기고
       - 나머지 문서에만 있는 정보는 빈 칸을 채우는 식으로 옮기며
       - 학생 성적 진단의 연결도 함께 옮긴 뒤
       - 빈 문서를 지웁니다.
       ───────────────────────────────────────────────────────────────────── */
    const [dupScan, setDupScan] = useState(null);
    const [dupProcessing, setDupProcessing] = useState(false);

    /** 같은 시험인지 판단하는 열쇠. 학교명은 표기 차이를 흡수해 비교합니다. */
    const buildExamKey = (v) => {
        const school = normalizeSchoolName(v.schoolName || v.school || '');
        if (!school) return null;
        const norm = (x) => String(x || '').replace(/\s+/g, '');
        return [
            school,
            norm(v.year),
            norm(v.grade || '1학년'),
            norm(v.semester || '1학기'),
            norm(v.termType || v.term || '중간고사'),
            norm(v.standardCode || v.subject)
        ].join('|');
    };

    /** 내용이 얼마나 충실한지 점수화해 남길 문서를 고릅니다. */
    const richnessOf = (v) => {
        let s = 0;
        if (v.review) s += 5;
        s += Math.min((v.questions || []).length, 60);
        if (v.gradeCuts && (v.gradeCuts.grade1 || v.gradeCuts.grade2)) s += 5;
        if (v.files && Object.values(v.files).some(f => f && f.url)) s += 5;
        if (v.internalMemo) s += 2;
        if (v.trendData?.length) s += 2;
        return s;
    };

    const handleScanDuplicateExams = async () => {
        setDupProcessing(true);
        try {
            const snap = await getDocsFromServer(collection(db, 'artifacts', APP_ID, 'public', 'data', 'integrated_exams'));
            const groups = new Map();

            snap.forEach(d => {
                const v = d.data();
                if (v.isDeleted) return;
                const key = buildExamKey(v);
                if (!key) return;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push({ id: d.id, data: v, richness: richnessOf(v) });
            });

            const dups = [];
            for (const [key, docs] of groups.entries()) {
                if (docs.length < 2) continue;
                // 문서 번호가 실제로 다른 것만 (같은 번호면 애초에 한 문서입니다)
                const uniqueIds = new Set(docs.map(x => x.id));
                if (uniqueIds.size < 2) continue;

                const sorted = [...docs].sort((a, b) => b.richness - a.richness);
                const keeper = sorted[0];
                const losers = sorted.slice(1);

                // 각 문서를 참조하는 학생 진단 건수도 함께 보여줍니다
                const refCounts = {};
                for (const x of docs) {
                    try { refCounts[x.id] = await countExamReferences(x.id); }
                    catch (e) { refCounts[x.id] = -1; }
                }

                dups.push({ key, keeper, losers, refCounts });
            }

            setDupScan(dups);
        } catch (e) {
            alert('중복 검사 중 오류가 발생했습니다: ' + e.message);
        } finally {
            setDupProcessing(false);
        }
    };

    const handleMergeDuplicateExams = async () => {
        if (!dupScan || dupScan.length === 0) return alert('먼저 [중복 찾기]를 눌러주세요.');

        const totalRemoved = dupScan.reduce((s, g) => s + g.losers.length, 0);
        if (!window.confirm(
            `같은 시험으로 판단된 ${dupScan.length}묶음을 합칩니다.\n` +
            `문서 ${totalRemoved}개가 정리되고, 학생 성적 진단 연결은 남는 문서로 옮겨집니다.\n\n` +
            `⚠️ 이 작업은 되돌릴 수 없습니다. 위 목록을 확인하셨나요?`
        )) return;

        setDupProcessing(true);
        let merged = 0, movedRefs = 0;
        const problems = [];

        try {
            for (const g of dupScan) {
                const keepRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'integrated_exams', g.keeper.id);

                for (const loser of g.losers) {
                    try {
                        // 남길 문서에 비어 있는 항목만 채웁니다 (기존 내용은 덮어쓰지 않습니다)
                        const patch = {};
                        const k = g.keeper.data, l = loser.data;
                        if (!k.review && l.review) patch.review = l.review;
                        if (!(k.questions || []).length && (l.questions || []).length) patch.questions = l.questions;
                        if (!k.internalMemo && l.internalMemo) patch.internalMemo = l.internalMemo;
                        if (!k.specialNotes && l.specialNotes) patch.specialNotes = l.specialNotes;
                        if (!(k.gradeCuts?.grade1) && l.gradeCuts?.grade1) patch.gradeCuts = l.gradeCuts;
                        if (!k.files && l.files) patch.files = l.files;
                        if (Object.keys(patch).length > 0) {
                            patch.updatedAt = serverTimestamp();
                            await setDoc(keepRef, patch, { merge: true });
                        }

                        const r = await reassignExamReferences(loser.id, g.keeper.id);
                        movedRefs += r.moved;
                        if (r.failed > 0) problems.push(`${loser.id}: 진단 ${r.failed}건 이동 실패`);

                        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'integrated_exams', loser.id));
                        merged++;
                    } catch (e) {
                        problems.push(`${loser.id}: ${e.message}`);
                    }
                }
            }

            alert(
                `✅ 중복 자료 병합 완료!\n\n합쳐진 문서: ${merged}개\n옮겨진 학생 성적 진단: ${movedRefs}건` +
                (problems.length ? `\n\n문제 ${problems.length}건:\n${problems.slice(0, 5).join('\n')}` : '')
            );
            setDupScan(null);
        } finally {
            setDupProcessing(false);
        }
    };

    /** 마스터 목록 자체에 같은 학교가 두 표기로 등록돼 있는지 찾습니다. */
    const masterDuplicates = React.useMemo(() => {
        const out = [];
        for (const type of ['elementary', 'middle', 'high']) {
            const map = new Map();
            (schools[type] || []).forEach(name => {
                const key = normalizeSchoolName(name);
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(name);
            });
            [...map.entries()].filter(([, names]) => names.length > 1)
                .forEach(([key, names]) => out.push({ type, key, names }));
        }
        return out;
    }, [schools]);

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
                            {/* ⚠️ 렌더링 중에 원본 배열을 직접 정렬하면 상태가 훼손되므로 복사본을 정렬합니다 */}
                            {[...(settings.seasons || [])].sort((a, b) => String(a?.startDate || '').localeCompare(String(b?.startDate || ''))).map((season, idx) => (
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
                                        const st = DEPT_STYLES[dept.color] || DEPT_STYLES.blue;
                                        return (
                                            <div key={dept.id} onClick={() => toggleDepartment(dept.id)} className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-3 ${isActive ? `${st.box} shadow-sm` : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                                                <div className="flex justify-between items-center w-full">
                                                    <span className={`font-black text-lg flex items-center gap-2 ${isActive ? st.title : 'text-gray-400'}`}>
                                                        <Layers size={20} /> {dept.label}
                                                    </span>
                                                    {isActive ? <ToggleRight size={32} className={st.toggle} /> : <ToggleLeft size={32} className="text-gray-300" />}
                                                </div>

                                                <div className={`flex flex-wrap gap-1.5 ${isActive ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                                                    {dept.subjects.map(subj => (
                                                        <span key={subj} className={`text-[10px] md:text-xs font-bold px-2 py-1 rounded-md border ${isActive ? st.chip : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
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
                            ].map(cat => {
                                const cs = SCHOOL_CAT_STYLES[cat.color] || SCHOOL_CAT_STYLES.blue;
                                return (
                                <div key={cat.id} className="border-2 border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col">
                                    <div className={`${cs.head} p-4 border-b flex justify-between items-center`}>
                                        <span className={`font-black ${cs.title}`}>{cat.title} <span className="text-xs bg-white px-2 py-0.5 rounded-full border">{(schools[cat.id]||[]).length}교</span></span>
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
                                );
                            })}
                        </div>
                    </Card>
                </div>
            )}

            {/* 탭 3. 시스템 고급 도구 */}
            {activeTab === 'system' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">

                    {/* 문자 게이트웨이 계정 — 원장(admin) 계정에서만 보입니다 */}
                    {currentUser?.role === 'admin' && (
                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-amber-300 space-y-6 md:col-span-2">
                        <h2 className="text-xl font-black text-amber-800 border-b border-amber-100 pb-4 flex items-center gap-2">
                            <ShieldCheck className="text-amber-600"/> 문자 게이트웨이 전용 계정 발급
                        </h2>

                        <div className="bg-amber-50 text-amber-900 p-5 rounded-2xl border border-amber-200 space-y-2 text-sm">
                            <p className="font-bold flex items-center gap-1.5 text-base mb-3"><AlertTriangle size={18}/> 왜 필요한가요?</p>
                            <p>• 법인폰 문자 앱이 쓰던 <strong>admin</strong> 계정의 비밀번호가 예전 소스코드에 그대로 적혀 있었고, 저장소가 공개라 <strong>과거 기록에서 꺼낼 수 있는 값</strong>이 되었습니다.</p>
                            <p>• 전용 계정 <strong>smsgw</strong> 로 옮기면 그 값은 아무 쓸모가 없어집니다.</p>
                            <p className="text-amber-700 font-bold mt-2 pt-2 border-t border-amber-200">
                                ※ 지금은 두 계정이 모두 동작하므로 <strong>문자가 멈추지 않습니다.</strong> 법인폰 교체를 마친 뒤 옛 계정을 폐기합니다.
                            </p>
                        </div>

                        {gatewayCred ? (
                            <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl space-y-3">
                                <p className="font-black text-amber-300 flex items-center gap-1.5">
                                    <AlertTriangle size={16}/> 이 비밀번호는 지금 이 화면에서만 볼 수 있습니다
                                </p>
                                <p className="text-xs text-slate-400">
                                    서버에도 저장되지 않습니다. 법인폰 앱에 입력하기 전에는 이 창을 닫지 마세요.
                                </p>
                                <div className="space-y-2">
                                    <div>
                                        <div className="text-[11px] text-slate-400 font-bold mb-1">아이디(이메일)</div>
                                        <div className="font-mono text-sm bg-slate-800 rounded-lg px-3 py-2 break-all">{gatewayCred.email}</div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-slate-400 font-bold mb-1">비밀번호</div>
                                        <div className="font-mono text-sm bg-slate-800 rounded-lg px-3 py-2 break-all">{gatewayCred.password}</div>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                    <Button
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${gatewayCred.email}\n${gatewayCred.password}`)
                                                .then(() => showToast('복사했습니다. 법인폰 앱에 붙여넣으세요.'))
                                                .catch(() => showToast('복사 실패 — 화면의 값을 직접 입력해주세요.', 'error'));
                                        }}
                                        className="bg-amber-500 hover:bg-amber-600 border-0 text-white font-bold"
                                    >아이디·비밀번호 복사</Button>
                                    <Button
                                        variant="secondary"
                                        onClick={() => { if (window.confirm('닫으면 이 비밀번호를 다시 볼 수 없습니다. 법인폰에 입력을 마치셨나요?')) setGatewayCred(null); }}
                                    >입력 완료 — 닫기</Button>
                                </div>
                            </div>
                        ) : (
                            <Button
                                onClick={handleProvisionGateway}
                                disabled={gatewayProcessing}
                                className="w-full bg-amber-600 hover:bg-amber-700 font-bold py-4 text-lg shadow-md border-0"
                            >
                                {gatewayProcessing ? <Loader className="animate-spin mx-auto" size={24}/> : '전용 계정 발급 / 비밀번호 재발급'}
                            </Button>
                        )}
                    </div>
                    )}

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

                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-indigo-200 space-y-6 md:col-span-2">
                        <h2 className="text-xl font-black text-indigo-800 border-b border-indigo-100 pb-4 flex items-center gap-2">
                            <School className="text-indigo-600"/> 학교명 표기 통합
                        </h2>

                        <div className="bg-indigo-50 text-indigo-900 p-5 rounded-2xl border border-indigo-200 space-y-2 text-sm">
                            <p>• 같은 학교가 <strong>'영일고' / '영일 고등학교' / '영일고등학교'</strong> 처럼 다르게 적혀 있는 것을 하나로 맞춥니다.</p>
                            <p>• 원래 이름을 따로 보관하므로 <strong>언제든 되돌릴 수 있습니다.</strong></p>
                            <p className="pt-2 border-t border-indigo-200 mt-2">
                                <strong>기출·내신 자료는 진단만 하고 고치지 않습니다.</strong> 그 자료는 문서 번호에 학교명이
                                들어 있어, 이름을 바꾸면 나중에 리포트를 수정할 때 학생 성적 진단과의 연결이 끊어집니다.
                                검색은 이미 표기가 달라도 찾도록 고쳐 두었으니 사용에는 지장이 없습니다.
                            </p>
                        </div>

                        {masterDuplicates.length > 0 && (
                            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm">
                                <p className="font-black text-rose-800 mb-2 flex items-center gap-1.5">
                                    <AlertTriangle size={16}/> 학교 목록에 같은 학교가 두 번 등록돼 있습니다
                                </p>
                                <p className="text-rose-700 mb-3 text-xs font-bold">
                                    아래는 자동으로 합칠 수 없습니다. [학교 마스터 관리] 탭에서 하나만 남기고 지워주세요.
                                </p>
                                {masterDuplicates.map(d => (
                                    <div key={d.type + d.key} className="font-bold text-rose-900 py-0.5">
                                        {d.names.join('  ·  ')} <span className="text-rose-500">→ 같은 학교</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <Button onClick={handleScanSchoolNames} disabled={schoolFixProcessing}
                                className="bg-white border-2 border-indigo-300 text-indigo-700 font-black py-3 px-5 hover:bg-indigo-50">
                                {schoolFixProcessing ? <Loader className="animate-spin" size={20}/> : '1) 진단하기'}
                            </Button>
                            <Button onClick={handleApplySchoolNames} disabled={schoolFixProcessing || !schoolScan}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-5 border-0 disabled:opacity-40">
                                2) 통합 실행
                            </Button>
                            <Button onClick={handleRollbackSchoolNames} disabled={schoolFixProcessing}
                                className="ml-auto bg-white border-2 border-gray-300 text-gray-500 font-bold py-3 px-5 hover:bg-gray-50">
                                되돌리기
                            </Button>
                        </div>

                        {schoolScan && (
                            <div className="space-y-3">
                                {schoolScan.map(t => (
                                    <div key={t.id} className="bg-white rounded-xl p-4 border border-slate-200">
                                        <div className="font-black text-sm text-slate-800">
                                            {t.label} — 전체 {t.total}건 중{' '}
                                            {!t.writable ? (
                                                <span className="text-slate-500">진단 전용 (수정하지 않음)</span>
                                            ) : (
                                                <span className={t.pending.length ? 'text-rose-600' : 'text-emerald-600'}>
                                                    {t.pending.length ? `${t.pending.length}건 정리 필요` : '정리 완료 ✓'}
                                                </span>
                                            )}
                                        </div>

                                        {t.merged.length > 0 && (
                                            <div className="mt-2 text-xs font-bold text-slate-600">
                                                <div className="mb-1">같은 학교로 묶이는 표기 ({t.merged.length}건):</div>
                                                {t.merged.slice(0, 10).map(g => (
                                                    <div key={g.key} className="pl-2 py-0.5">
                                                        {g.names.join('  ,  ')} <span className="text-indigo-600">→ {g.key}</span>
                                                    </div>
                                                ))}
                                                {t.merged.length > 10 && (
                                                    <div className="pl-2 text-slate-400">…외 {t.merged.length - 10}건</div>
                                                )}
                                            </div>
                                        )}

                                        {t.writable && t.pending.length > 0 && (
                                            <div className="mt-2 text-xs font-bold text-slate-600">
                                                <div className="mb-1">바뀔 내용 (앞 5건):</div>
                                                {t.pending.slice(0, 5).map((p, i) => (
                                                    <div key={p.id + p.field + i} className="pl-2 py-0.5">
                                                        {p.from} <span className="text-indigo-600">→ {p.to}</span>
                                                        {p.field !== 'schoolName' && (
                                                            <span className="ml-1 text-slate-400">
                                                                ({p.field === 'childSchool' ? '자녀 학교' : p.field})
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-purple-200 space-y-6 md:col-span-2">
                        <h2 className="text-xl font-black text-purple-800 border-b border-purple-100 pb-4 flex items-center gap-2">
                            <BookOpen className="text-purple-600"/> 중복 기출·내신 자료 병합
                        </h2>

                        <div className="bg-purple-50 text-purple-900 p-5 rounded-2xl border border-purple-200 space-y-2 text-sm">
                            <p>• 학교명 표기가 갈려 검색이 안 되면, 담당자가 같은 시험을 다시 등록하게 됩니다. 그렇게 <strong>두 문서로 쪼개진 자료</strong>를 찾아 합칩니다.</p>
                            <p>• 내용이 가장 충실한 문서를 남기고, 나머지에만 있던 내용은 <strong>빈 칸을 채우는 식</strong>으로 옮깁니다. 기존 내용은 덮어쓰지 않습니다.</p>
                            <p>• <strong>학생 성적 진단 연결도 함께 옮깁니다.</strong> 그래서 예측등급이 사라지지 않습니다.</p>
                            <p className="text-rose-700 font-bold mt-2 pt-2 border-t border-purple-200">
                                ⚠️ 병합은 되돌릴 수 없습니다. 반드시 [중복 찾기]로 목록을 확인한 뒤 실행하세요.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button onClick={handleScanDuplicateExams} disabled={dupProcessing}
                                className="bg-white border-2 border-purple-300 text-purple-700 font-black py-3 px-5 hover:bg-purple-50">
                                {dupProcessing ? <Loader className="animate-spin" size={20}/> : '1) 중복 찾기'}
                            </Button>
                            <Button onClick={handleMergeDuplicateExams} disabled={dupProcessing || !dupScan || dupScan.length === 0}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-black py-3 px-5 border-0 disabled:opacity-40">
                                2) 병합 실행
                            </Button>
                        </div>

                        {dupScan && (
                            dupScan.length === 0 ? (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm font-bold text-emerald-800">
                                    ✓ 중복된 기출 자료가 없습니다.
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                                    <div className="text-sm font-black text-slate-800">
                                        같은 시험으로 판단된 묶음 {dupScan.length}개
                                    </div>
                                    {dupScan.map(g => (
                                        <div key={g.key} className="bg-white border border-slate-200 rounded-xl p-4 text-xs">
                                            <div className="font-black text-emerald-700 mb-1">
                                                남길 자료: {g.keeper.data.schoolName || g.keeper.data.school}
                                                <span className="ml-2 font-bold text-slate-500">
                                                    (문항 {(g.keeper.data.questions || []).length}개
                                                    {g.keeper.data.review ? ', 총평 있음' : ''}
                                                    , 학생 진단 {g.refCounts[g.keeper.id] ?? '?'}건)
                                                </span>
                                            </div>
                                            <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">{g.keeper.id}</div>
                                            {g.losers.map(l => (
                                                <div key={l.id} className="pl-3 border-l-2 border-rose-200 py-1">
                                                    <span className="font-bold text-rose-700">합쳐질 자료: {l.data.schoolName || l.data.school}</span>
                                                    <span className="ml-2 font-bold text-slate-500">
                                                        (문항 {(l.data.questions || []).length}개
                                                        {l.data.review ? ', 총평 있음' : ''}
                                                        , 학생 진단 {g.refCounts[l.id] ?? '?'}건 → 옮겨짐)
                                                    </span>
                                                    <div className="font-mono text-[10px] text-slate-400 break-all">{l.id}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-amber-300 space-y-6 md:col-span-2">
                        <h2 className="text-xl font-black text-amber-800 border-b border-amber-100 pb-4 flex items-center gap-2">
                            <ShieldCheck className="text-amber-600"/> 역할 토큰 일괄 부여 (권한 오류 해결)
                        </h2>

                        <div className="bg-amber-50 text-amber-900 p-5 rounded-2xl border border-amber-200 space-y-2 text-sm">
                            <p className="font-bold flex items-center gap-1.5 text-base mb-3"><AlertTriangle size={18}/> 언제 필요한가요?</p>
                            <p>• 학생이 <strong>클리닉을 여러 시간대 신청</strong>할 때 '권한 없음' 오류가 나는 경우</p>
                            <p>• 그 외 정상적인 사용자가 저장·신청에서 권한 오류를 겪는 경우</p>
                            <p className="pt-2 border-t border-amber-200 mt-2">보안 규칙이 권한을 확인할 때마다 사용자 정보를 조회하면 횟수 제한에 걸립니다. 역할을 로그인 정보에 미리 넣어두면 조회 없이 즉시 판단합니다.</p>
                            <p className="text-amber-700 font-bold">※ 새로 가입하는 분은 자동 처리됩니다. 이 버튼은 기존 인원용입니다.</p>
                        </div>

                        <Button
                            onClick={handleBackfillClaims}
                            disabled={claimsProcessing}
                            className="w-full bg-amber-600 hover:bg-amber-700 font-bold py-4 text-lg shadow-md border-0"
                        >
                            {claimsProcessing ? <Loader className="animate-spin mx-auto" size={24}/> : '전체 사용자 역할 토큰 부여'}
                        </Button>

                        {claimsResult && (
                            <div className="space-y-4 animate-in fade-in">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                                        <div className="text-[11px] font-bold text-slate-500 mb-1">전체</div>
                                        <div className="text-2xl font-black text-slate-800">{claimsResult.total ?? 0}</div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                                        <div className="text-[11px] font-bold text-emerald-600 mb-1">성공</div>
                                        <div className="text-2xl font-black text-emerald-700">{claimsResult.done ?? 0}</div>
                                    </div>
                                    <div className={`border rounded-xl p-3 text-center ${claimsResult.failedCount ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className={`text-[11px] font-bold mb-1 ${claimsResult.failedCount ? 'text-rose-600' : 'text-slate-500'}`}>미완료</div>
                                        <div className={`text-2xl font-black ${claimsResult.failedCount ? 'text-rose-700' : 'text-slate-400'}`}>{claimsResult.failedCount ?? 0}</div>
                                    </div>
                                </div>

                                {claimsResult.failedCount > 0 && (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 text-sm font-black text-slate-700">
                                            인증 계정이 없는 사용자 ({claimsResult.failedCount}명)
                                        </div>
                                        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto custom-scrollbar">
                                            {(claimsResult.failed || []).map(u => (
                                                <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-black text-slate-800">{u.name}</span>
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{u.role}</span>
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{u.status}</span>
                                                            <span className="text-[10px] font-mono text-slate-400">{u.userId}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-600 mt-1.5 break-keep leading-relaxed">{u.advice}</p>
                                                    </div>
                                                    <span className={`shrink-0 text-[11px] font-black px-2.5 py-1.5 rounded-lg whitespace-nowrap ${
                                                        u.canSelfHeal ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    }`}>
                                                        {u.canSelfHeal ? '조치 불필요' : '비번 변경 필요'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <p className="text-xs font-bold text-slate-500">
                                    ※ 이미 로그인 중인 사용자는 다시 로그인하면 즉시 반영됩니다.
                                </p>
                            </div>
                        )}
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

                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-emerald-200 space-y-6 md:col-span-2">
                        <h2 className="text-xl font-black text-emerald-800 border-b border-emerald-100 pb-4 flex items-center gap-2">
                            <Users className="text-emerald-600"/> 학생 명부 동기화 (문자 앱 전용)
                        </h2>

                        <div className="bg-emerald-50 text-emerald-900 p-5 rounded-2xl border border-emerald-200 space-y-2 text-sm">
                            <p className="font-bold flex items-center gap-1.5 text-base mb-3"><ShieldCheck size={18}/> 왜 필요한가요?</p>
                            <p>• 법인폰 문자 앱은 상담 대상을 고르려고 <strong>전체 사용자 목록</strong>을 내려받고 있었습니다.</p>
                            <p>• 앱이 실제로 쓰는 값은 <strong>이름·학교·학년</strong> 셋뿐인데, 그 과정에 <strong>출결PIN·계좌번호·월급·연락처</strong>까지 함께 전달됐습니다.</p>
                            <p>• 이제 세 값만 담은 별도 명부를 사용합니다. 폰을 분실해도 나가는 정보가 최소화됩니다.</p>
                            <p className="text-emerald-700 font-bold mt-2 pt-2 border-t border-emerald-200">
                                ※ <strong>법인폰 앱을 새 버전으로 교체하기 전에</strong> 먼저 실행해 주세요. 이후 등록되는 학생은 자동 반영됩니다.
                            </p>
                        </div>

                        <Button
                            onClick={handleSyncStudentDirectory}
                            disabled={studentDirProcessing}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold py-4 text-lg shadow-md border-0"
                        >
                            {studentDirProcessing ? <Loader className="animate-spin mx-auto" size={24}/> : '학생 명부 채우기 실행'}
                        </Button>
                    </div>

                </div>
            )}
        </div>
    );
};

export default SettingsManager;