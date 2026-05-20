import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Users, Search, Plus, Calendar, Clock, Edit2, Trash2, CheckCircle, 
  BookOpen, UserPlus, AlertCircle, Save, X, BookMarked
} from 'lucide-react';

const APP_ID = 'imperial-clinic-v1';

const EnrollmentManager = ({ currentUser }) => {
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 폼 상태 관리
  const [formData, setFormData] = useState({
    id: '', className: '', lecturerId: '', status: 'active', schedules: []
  });

  // DB에서 학생 목록과 수강 이력 불러오기
  useEffect(() => {
    const qStudents = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudents(allUsers.filter(u => u.role === 'student'));
    });

    const qEnrollments = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'enrollments'));
    const unsubEnrollments = onSnapshot(qEnrollments, (snapshot) => {
      setEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubStudents(); unsubEnrollments(); };
  }, []);

  const filteredStudents = useMemo(() => {
    return students.filter(s => 
      s.name.includes(searchQuery) || (s.schoolName || '').includes(searchQuery) || (s.userId || '').includes(searchQuery)
    );
  }, [students, searchQuery]);

  const studentEnrollments = useMemo(() => {
    if (!selectedStudent) return [];
    return enrollments.filter(e => e.studentId === selectedStudent.id);
  }, [selectedStudent, enrollments]);

  const handleOpenModal = (enrollment = null) => {
    if (enrollment) {
      setFormData({ ...enrollment });
    } else {
      setFormData({
        id: '', className: '', lecturerId: '', status: 'active',
        schedules: [{ dayOfWeek: '월', callTime: '18:00', classTime: '20:00', endTime: '22:00', room: '1강의실' }]
      });
    }
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleAddSchedule = () => {
    setFormData(prev => ({
      ...prev,
      schedules: [...prev.schedules, { dayOfWeek: '수', callTime: '18:00', classTime: '20:00', endTime: '22:00', room: '1강의실' }]
    }));
  };

  const handleRemoveSchedule = (index) => {
    setFormData(prev => {
      const newSchedules = [...prev.schedules];
      newSchedules.splice(index, 1);
      return { ...prev, schedules: newSchedules };
    });
  };

  const handleScheduleChange = (index, field, value) => {
    setFormData(prev => {
      const newSchedules = [...prev.schedules];
      newSchedules[index][field] = value;
      return { ...prev, schedules: newSchedules };
    });
  };

  const handleSaveEnrollment = async () => {
    if (!formData.className) return setErrorMsg('강의명을 입력해주세요.');
    if (formData.schedules.length === 0) return setErrorMsg('최소 1개의 스케줄(요일/시간)을 추가해주세요.');

    setLoading(true);
    try {
      // 클래스 ID는 강의명을 기반으로 자동 생성 (중복 방지)
      const safeClassId = `cls_${encodeURIComponent(formData.className.trim()).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      const enrollmentId = formData.id || `${selectedStudent.id}_${safeClassId}`;

      const payload = {
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        classId: safeClassId,
        className: formData.className.trim(),
        lecturerId: formData.lecturerId.trim() || '미지정',
        status: formData.status,
        schedules: formData.schedules,
        updatedAt: serverTimestamp()
      };

      if (!formData.id) {
        payload.enrolledAt = serverTimestamp();
      }

      await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'enrollments', enrollmentId), payload, { merge: true });
      setIsModalOpen(false);
    } catch (err) {
      setErrorMsg('저장에 실패했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEnrollment = async (enrollmentId) => {
    if (!window.confirm('정말 이 수강 이력을 삭제하시겠습니까?\n\n* 단순 휴원/퇴원인 경우 삭제하지 말고 상태를 [퇴원]으로 변경하는 것을 권장합니다.')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'enrollments', enrollmentId));
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-6 md:p-8 rounded-3xl shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2"><UserPlus size={28}/> 수강 및 등원 배정 관리</h1>
        <p className="opacity-90 text-sm md:text-base">학생별로 강의를 배정하고, 요일별로 맞춤형 '등원 요구 시간(Call Time)'을 설정합니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 학생 검색 및 리스트 */}
        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-[700px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
            <div className="relative">
              <input type="text" placeholder="이름, 학교 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"/>
              <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm font-bold">검색 결과가 없습니다.</div>
            ) : (
              <div className="space-y-1">
                {filteredStudents.map(student => (
                  <button key={student.id} onClick={() => setSelectedStudent(student)} className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between ${selectedStudent?.id === student.id ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-gray-50 border border-transparent'}`}>
                    <div>
                      <div className="font-bold text-gray-900">{student.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{student.schoolName} ({student.grade})</div>
                    </div>
                    {enrollments.some(e => e.studentId === student.id && e.status === 'active') && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 선택된 학생의 수강 이력 관리 */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-[700px]">
          {!selectedStudent ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <Users size={48} className="opacity-20" />
              <p className="font-bold">좌측에서 학생을 선택해주세요.</p>
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50/30 rounded-t-2xl">
                <div>
                  <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                    {selectedStudent.name} <span className="text-sm font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">수강 이력</span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">{selectedStudent.schoolName} / PIN: <span className="font-mono text-gray-800">{selectedStudent.attendancePin || '없음'}</span></p>
                </div>
                <button onClick={() => handleOpenModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1 shadow-sm transition-colors">
                  <Plus size={16} /> 신규 수강 배정
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-gray-50">
                {studentEnrollments.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 font-bold border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                    현재 배정된 강의가 없습니다.<br/><span className="text-xs font-normal mt-2 block">우측 상단의 버튼을 눌러 강의를 배정해주세요.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {studentEnrollments.map(enroll => (
                      <div key={enroll.id} className={`bg-white border rounded-2xl p-5 shadow-sm relative overflow-hidden ${enroll.status === 'active' ? 'border-indigo-100' : 'border-gray-200 opacity-70'}`}>
                        {enroll.status === 'active' ? <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div> : <div className="absolute top-0 left-0 w-1 h-full bg-gray-400"></div>}
                        
                        <div className="flex justify-between items-start mb-4 pl-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${enroll.status === 'active' ? 'bg-emerald-100 text-emerald-700' : (enroll.status === 'resting' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}`}>
                                {enroll.status === 'active' ? '수강중' : (enroll.status === 'resting' ? '휴원' : '퇴원/취소')}
                              </span>
                              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">강사: {enroll.lecturerId}</span>
                            </div>
                            <h3 className="text-lg font-black text-gray-900">{enroll.className}</h3>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleOpenModal(enroll)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"><Edit2 size={16}/></button>
                            <button onClick={() => handleDeleteEnrollment(enroll.id)} className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 size={16}/></button>
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                          <p className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1"><Calendar size={12}/> 요일별 맞춤 등원 스케줄</p>
                          {enroll.schedules.map((sch, idx) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2 text-xs md:text-sm bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center shrink-0">{sch.dayOfWeek}</span>
                              <span className="font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded flex items-center gap-1"><Clock size={12}/> 등원요구 {sch.callTime}</span>
                              <span className="font-bold text-gray-700">본수업 {sch.classTime} ~ {sch.endTime}</span>
                              <span className="text-gray-500 font-medium ml-auto">({sch.room})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 모달 창 (수강 등록/수정) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b bg-indigo-50/50 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2"><BookMarked size={20}/> 수강 및 스케줄 {formData.id ? '수정' : '배정'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors"><X size={24}/></button>
            </div>
            
            <div className="p-5 md:p-6 overflow-y-auto flex-1 custom-scrollbar space-y-5 bg-gray-50">
              {errorMsg && <div className="bg-rose-50 text-rose-600 font-bold p-3 rounded-xl flex items-center gap-2 text-sm"><AlertCircle size={16}/> {errorMsg}</div>}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">강의명 (반 이름)</label>
                  <input type="text" className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm bg-white" placeholder="예: 고1 수학 정규반" value={formData.className} onChange={e => setFormData({...formData, className: e.target.value})} disabled={!!formData.id} title={formData.id ? "강의명은 수정할 수 없습니다." : ""}/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">담당 강사 이름</label>
                  <input type="text" className="w-full border p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white" placeholder="예: 신요한" value={formData.lecturerId} onChange={e => setFormData({...formData, lecturerId: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">수강 상태</label>
                <div className="flex gap-2">
                  {['active', 'resting', 'dropped'].map(s => (
                    <button key={s} type="button" onClick={() => setFormData({...formData, status: s})} className={`flex-1 py-2.5 text-sm font-bold rounded-xl border transition-colors ${formData.status === s ? (s === 'active' ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : s === 'resting' ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-gray-200 border-gray-400 text-gray-800') : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {s === 'active' ? '수강중 (정상)' : (s === 'resting' ? '휴원' : '퇴원/취소')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-5">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-bold text-gray-800 flex items-center gap-1"><Clock size={16} className="text-indigo-600"/> 요일별 개인화 스케줄</label>
                  <button onClick={handleAddSchedule} className="text-xs font-bold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1"><Plus size={14}/> 요일 추가</button>
                </div>
                
                <div className="space-y-3">
                  {formData.schedules.map((sch, idx) => (
                    <div key={idx} className="bg-white p-3 md:p-4 rounded-xl border border-indigo-100 shadow-sm relative group">
                      <button onClick={() => handleRemoveSchedule(idx)} className="absolute -top-2 -right-2 bg-white text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-100 rounded-full p-1 transition-colors shadow-sm"><X size={14}/></button>
                      
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">요일</label>
                          <select className="w-full border p-2 rounded-lg text-sm font-bold outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50" value={sch.dayOfWeek} onChange={e => handleScheduleChange(idx, 'dayOfWeek', e.target.value)}>
                            {['월', '화', '수', '목', '금', '토', '일'].map(d => <option key={d} value={d}>{d}요일</option>)}
                          </select>
                        </div>
                        <div className="col-span-1 md:col-span-1 border-r-2 border-dashed border-rose-200 pr-3">
                          <label className="block text-[10px] font-black text-rose-600 mb-1 text-center bg-rose-50 rounded">등원요구(Call)</label>
                          <input type="time" className="w-full border p-2 rounded-lg text-sm font-bold outline-none text-rose-700 bg-rose-50" value={sch.callTime} onChange={e => handleScheduleChange(idx, 'callTime', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">본수업 시작</label>
                          <input type="time" className="w-full border p-2 rounded-lg text-sm font-bold outline-none bg-gray-50" value={sch.classTime} onChange={e => handleScheduleChange(idx, 'classTime', e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">수업 종료</label>
                          <input type="time" className="w-full border p-2 rounded-lg text-sm font-bold outline-none bg-gray-50" value={sch.endTime} onChange={e => handleScheduleChange(idx, 'endTime', e.target.value)} />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">강의실</label>
                          <input type="text" placeholder="301호" className="w-full border p-2 rounded-lg text-sm font-bold outline-none bg-gray-50" value={sch.room} onChange={e => handleScheduleChange(idx, 'room', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {formData.schedules.length === 0 && <div className="text-center py-6 text-sm text-gray-400 font-bold bg-gray-100 rounded-xl">설정된 스케줄이 없습니다.</div>}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-white shrink-0">
              <button onClick={handleSaveEnrollment} disabled={loading} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                {loading ? <Loader className="animate-spin" size={20} /> : <Save size={20} />} {formData.id ? '수정 내용 저장' : '수강 및 스케줄 배정 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnrollmentManager;