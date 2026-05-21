import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Settings, Building, Phone, Hash, DoorOpen, BookOpen, 
  Plus, Trash2, Save, Loader, MapPin, ShieldCheck 
} from 'lucide-react';
import { Button } from '../components/UI';

const APP_ID = 'imperial-clinic-v1';

const SettingsManager = ({ currentUser }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        academyName: '',
        businessNumber: '',
        phone: '',
        address: '',
        classrooms: [],
        subjects: []
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
                        academyName: data.academyName || '',
                        businessNumber: data.businessNumber || '',
                        phone: data.phone || '',
                        address: data.address || '',
                        classrooms: data.classrooms || [],
                        subjects: data.subjects || []
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
                ...settings,
                updatedAt: serverTimestamp()
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

    if (loading) return <div className="flex justify-center items-center h-full"><Loader className="animate-spin text-blue-600" size={40}/></div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-6 md:p-8 rounded-3xl shadow-lg flex justify-between items-center">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2"><Settings size={28}/> 학원 환경설정 (마스터 데이터)</h1>
                    <p className="opacity-90 text-sm md:text-base">이곳에서 등록한 학원 인프라 정보는 전체 시스템의 기준 데이터(SSOT)로 활용됩니다.</p>
                </div>
                <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold border-0 shadow-lg px-6 py-3">
                    {saving ? <Loader className="animate-spin" size={20}/> : <Save size={20}/>} <span className="ml-2">전체 설정 저장</span>
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 기본 정보 설정 */}
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

                {/* 인프라 마스터 데이터 (강의실/과목) */}
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
        </div>
    );
};

export default SettingsManager;