import React, { useState, useEffect } from 'react';
import { db } from '../firebase'; 
import { collection, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';

// --- [아이콘 컴포넌트] ---
const IconChart = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>;
const IconFile = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>;
const IconLock = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>;
const IconArrowLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>;

// 통합 DB 경로 상수 설정
const APP_ID = 'imperial-clinic-v1';
const DB_COLLECTION = `artifacts/${APP_ID}/public/data/school_strategies`;

export default function SchoolStrategy({ currentUser }) {
  const user = currentUser || { role: 'admin', school: '영일고' }; 
  
  // 관리자 설정: 현재 활성화된 내신 기간
  const currentActiveTerm = "1-1 중간고사"; 

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState({ view: 'list', selectedId: null, selectedQuestion: null });
  const [memoInputs, setMemoInputs] = useState({});

  // App.js 기준 직급명으로 권한 확인 (instructor, assistant -> lecturer, ta 로 수정)
  const isStaff = ['admin', 'lecturer', 'ta'].includes(user.role);
  const isAdmin = user.role === 'admin';
  const isStudentOrParent = ['student', 'parent'].includes(user.role);

  // Firestore 데이터 실시간 구독 (에러 핸들링 포함)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, DB_COLLECTION), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // 인메모리 필터링
        const filteredData = data.filter(report => {
          if (isStudentOrParent) {
            // 학생/학부모: 본인 학교 + 현재 활성 학기 + 삭제되지 않은 리포트만
            return !report.isDeleted && 
                   report.term === currentActiveTerm && 
                   report.school === user.school;
          } else if (isAdmin) {
            // 관리자: 전부 볼 수 있음 (삭제된 것도 복구를 위해 노출)
            return true;
          } else {
            // 강사/조교: 삭제되지 않은 리포트만
            return !report.isDeleted;
          }
        });

        // 정렬: 경향 분석(trend)이 항상 위로, 그 다음 최신순
        filteredData.sort((a, b) => {
          if (a.type === 'trend' && b.type !== 'trend') return -1;
          if (a.type !== 'trend' && b.type === 'trend') return 1;
          return b.createdAt - a.createdAt; 
        });

        setReports(filteredData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore 데이터 불러오기 에러:", error);
        alert("데이터를 불러오는데 실패했습니다. 권한을 확인해주세요.");
        setLoading(false); // 무한 로딩 방지
      }
    );

    return () => unsubscribe();
  }, [user, isStudentOrParent, isAdmin]);

  // Soft Delete 로직
  const handleSoftDelete = async (id) => {
    if (window.confirm('이 리포트를 삭제하시겠습니까? (관리자만 복구 가능)')) {
      await updateDoc(doc(db, DB_COLLECTION, id), { isDeleted: true });
    }
  };

  // 관리자 복구 로직
  const handleRestore = async (id) => {
    if (window.confirm('이 리포트를 다시 복구하시겠습니까?')) {
      await updateDoc(doc(db, DB_COLLECTION, id), { isDeleted: false });
    }
  };

  // 교직원 전용 메모 저장
  const saveInternalMemo = async (id) => {
    if (!memoInputs[id]) return;
    await updateDoc(doc(db, DB_COLLECTION, id), {
      internalMemo: memoInputs[id]
    });
    alert('교직원 전용 메모가 저장되었습니다.');
  };

  if (loading) return <div className="flex justify-center items-center h-64 text-gray-500">데이터를 불러오는 중입니다...</div>;

  // ----------------------------------------------------------------------
  // VIEW: LIST
  // ----------------------------------------------------------------------
  if (viewState.view === 'list') {
    const trends = reports.filter(r => r.type === 'trend');
    const individuals = reports.filter(r => r.type === 'individual');

    return (
      <div className="p-6 max-w-6xl mx-auto space-y-8 bg-gray-50 min-h-screen">
        <div className="flex justify-between items-center border-b pb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">내신 연구소</h1>
            <p className="text-sm text-gray-500 mt-2">
              {isStudentOrParent 
                ? `현재 [${user.school} ${currentActiveTerm}] 맞춤 분석 자료가 제공되고 있습니다.` 
                : "우리 학원만의 철저한 학교별 내신 분석 및 경향 자료입니다."}
            </p>
          </div>
          {isStaff && (
            <button 
              onClick={() => addSampleData()} 
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 text-sm"
            >
              + 리포트 작성
            </button>
          )}
        </div>

        {/* 1. 경향 분석 리스트 */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <IconChart /> 과목 경향 분석
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trends.length === 0 ? (
              <p className="text-gray-400 text-sm">등록된 경향 분석이 없습니다.</p>
            ) : (
              trends.map(report => (
                <div key={report.id} className={`bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer relative ${report.isDeleted ? 'opacity-50 grayscale' : 'border-indigo-100'}`} onClick={() => setViewState({ view: 'detail', selectedId: report.id })}>
                  {report.isDeleted && <span className="absolute top-2 right-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">삭제됨</span>}
                  <div className="flex justify-between">
                    <h3 className="font-bold text-lg text-indigo-900">{report.school} {report.grade} {report.term} 경향 분석</h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">과목: {report.subject} | 업데이트: {report.updatedAt}</p>
                  
                  {isStaff && (
                    <div className="mt-4 flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                      {!report.isDeleted && <button onClick={() => handleSoftDelete(report.id)} className="text-red-500 hover:text-red-700 p-1"><IconTrash /></button>}
                      {isAdmin && report.isDeleted && <button onClick={() => handleRestore(report.id)} className="text-green-600 hover:text-green-800 p-1"><IconRefresh /></button>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* 2. 개별 시험 분석 리스트 */}
        <section>
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2 mt-8">
            <IconFile /> 개별 시험 과목 분석
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {individuals.length === 0 ? (
              <p className="text-gray-400 text-sm">등록된 시험 분석이 없습니다.</p>
            ) : (
              individuals.map(report => (
                <div key={report.id} className={`bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer relative ${report.isDeleted ? 'opacity-50' : ''}`} onClick={() => setViewState({ view: 'detail', selectedId: report.id })}>
                  {report.isDeleted && <span className="absolute top-2 right-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded">삭제됨</span>}
                  <h3 className="font-bold text-gray-800">{report.school} {report.grade} {report.term} {report.subject} 분석</h3>
                  <div className="mt-3 text-sm text-gray-600 space-y-1">
                    <p>• 담당: {report.teacher} 선생님</p>
                    <p>• 난이도: <span className="font-medium text-indigo-600">{report.difficulty}</span></p>
                  </div>
                  
                  {isStaff && (
                    <div className="mt-4 flex justify-end gap-2 border-t pt-2" onClick={e => e.stopPropagation()}>
                      {!report.isDeleted && <button onClick={() => handleSoftDelete(report.id)} className="text-red-500 hover:text-red-700 p-1"><IconTrash /></button>}
                      {isAdmin && report.isDeleted && <button onClick={() => handleRestore(report.id)} className="text-green-600 hover:text-green-800 p-1"><IconRefresh /></button>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // VIEW: DETAIL
  // ----------------------------------------------------------------------
  const report = reports.find(r => r.id === viewState.selectedId);
  if (!report) return null;

  const goBack = () => setViewState({ view: 'list', selectedId: null, selectedQuestion: null });

  return (
    <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen">
      <button onClick={goBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 font-medium">
        <IconArrowLeft /> 목록으로 돌아가기
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 헤더 부분 */}
        <div className="bg-indigo-900 px-8 py-6 text-white">
          <div className="inline-block px-3 py-1 bg-indigo-800 rounded-full text-xs font-semibold mb-3 tracking-wider">
            {report.type === 'trend' ? '경향 분석 리포트' : '시험 정밀 분석 리포트'}
          </div>
          <h1 className="text-3xl font-bold">
            {report.school} {report.grade} {report.term} {report.subject} {report.type === 'trend' ? '경향 분석' : '분석'}
          </h1>
        </div>

        {/* 교직원 전용 메모 (학생/학부모에게는 절대 노출 안 됨) */}
        {isStaff && (
          <div className="bg-yellow-50 border-b border-yellow-200 p-6">
            <h3 className="text-yellow-800 font-bold flex items-center gap-2 mb-2">
              <IconLock /> 교직원 정보 공유 (학생/학부모 미노출)
            </h3>
            <textarea 
              className="w-full bg-white border border-yellow-300 rounded p-3 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="해당 시험에 대한 조교, 강사, 관리자 간의 특이사항이나 정보를 기록하세요."
              value={memoInputs[report.id] !== undefined ? memoInputs[report.id] : (report.internalMemo || '')}
              onChange={(e) => setMemoInputs({...memoInputs, [report.id]: e.target.value})}
            />
            <div className="flex justify-end mt-2">
              <button onClick={() => saveInternalMemo(report.id)} className="px-4 py-1.5 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700">메모 저장</button>
            </div>
          </div>
        )}

        <div className="p-8">
          {report.type === 'trend' && (
            <div className="space-y-12">
              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-6 border-l-4 border-indigo-500 pl-3">난이도 변화 추이</h2>
                <div className="bg-gray-50 rounded-xl p-6 border flex items-end justify-around h-64">
                  {report.trendData?.map((data, idx) => (
                    <div key={idx} className="flex flex-col items-center w-1/5 group">
                      <span className="text-indigo-600 font-bold mb-2 opacity-0 group-hover:opacity-100 transition-opacity">{data.score}점</span>
                      <div className="w-16 bg-gradient-to-t from-indigo-300 to-indigo-500 rounded-t-sm relative transition-all duration-500 group-hover:bg-indigo-600" style={{ height: `${data.score}%` }}></div>
                      <span className="mt-4 text-sm font-medium text-gray-600">{data.examName}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-6 border-l-4 border-blue-500 pl-3">주요 출제 범위 및 특징 변화</h2>
                <div className="space-y-4">
                  {report.scopeChanges?.map((change, idx) => (
                    <div key={idx} className="flex items-start gap-4 bg-white border p-4 rounded-lg shadow-sm">
                      <div className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded text-sm whitespace-nowrap">{change.year}</div>
                      <p className="text-gray-700 leading-relaxed">{change.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-6 border-l-4 border-emerald-500 pl-3">선생님별 출제 스타일 비교</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700">
                        <th className="p-3 border">선생님</th>
                        <th className="p-3 border">주요 출제 유형</th>
                        <th className="p-3 border">특징 및 대비 전략</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.teacherStyles?.map((teacher, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-3 border font-bold text-emerald-800">{teacher.name}</td>
                          <td className="p-3 border text-gray-600">{teacher.type}</td>
                          <td className="p-3 border text-gray-600 text-sm">{teacher.strategy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {report.type === 'individual' && (
            <div className="space-y-8">
              <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoBox label="출제 선생님" value={report.teacher} />
                <InfoBox label="시험 난이도" value={report.difficulty} />
                <InfoBox label="예상 1등급 컷" value={report.gradeCuts?.grade1} />
                <InfoBox label="객관식 / 주관식" value={`${report.mcCount}문항 / ${report.saCount + report.essayCount}문항`} />
                <InfoBox label="부교재" value={report.suppBook} colSpan={2} />
                <InfoBox label="학교 프린트" value={report.print} colSpan={2} />
              </section>

              <section className="bg-gray-50 p-5 rounded-xl border">
                <h3 className="font-bold text-gray-800 mb-2">시험 범위</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{report.scope || '시험 범위 정보가 없습니다.'}</p>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-indigo-100 rounded-xl p-5 bg-white shadow-sm">
                  <h3 className="font-bold text-indigo-900 mb-3 text-lg">📝 시험 총평</h3>
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{report.review}</p>
                </div>
                <div className="border border-red-100 rounded-xl p-5 bg-white shadow-sm">
                  <h3 className="font-bold text-red-800 mb-3 text-lg">💡 특이사항 및 킬러문항</h3>
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{report.specialNotes}</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-bold text-gray-800 mb-4 border-l-4 border-indigo-500 pl-3">상세 문항 분석</h2>
                <div className="flex flex-wrap gap-3">
                  {report.questions?.map((q) => (
                    <button
                      key={q.qNum}
                      onClick={() => setViewState({ ...viewState, selectedQuestion: q })}
                      className={`px-4 py-2 rounded-lg border transition-all flex flex-col items-center min-w-[80px] ${viewState.selectedQuestion?.qNum === q.qNum ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700'}`}
                    >
                      <span className="font-bold text-lg">{q.qNum}번</span>
                      {q.tags && <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 ${q.tags.includes('킬러') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{q.tags}</span>}
                    </button>
                  ))}
                </div>
              </section>

              {viewState.selectedQuestion && (
                <div className="mt-6 border-2 border-indigo-100 rounded-xl p-6 bg-white animate-fade-in">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h3 className="text-2xl font-bold text-indigo-900">{viewState.selectedQuestion.qNum}번 문항 상세 분석</h3>
                    <button onClick={() => setViewState({...viewState, selectedQuestion: null})} className="text-gray-400 hover:text-gray-600">닫기 ✕</button>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="border rounded bg-gray-50 p-2 text-center h-48 flex items-center justify-center text-gray-400">
                        {viewState.selectedQuestion.qImage ? <img src={viewState.selectedQuestion.qImage} alt="실제문제" className="max-h-full" /> : "[실제 학교 문제 이미지]"}
                      </div>
                      <div className="border-2 border-dashed border-indigo-200 rounded bg-indigo-50/30 p-2 text-center h-48 flex items-center justify-center text-indigo-400 font-medium">
                        {viewState.selectedQuestion.simImage ? <img src={viewState.selectedQuestion.simImage} alt="학원교재 유사문항" className="max-h-full" /> : "[우리 학원 교재 적중 유사 문항 이미지]"}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <DetailRow label="단원 및 평가내용" value={viewState.selectedQuestion.unit} />
                      <DetailRow label="난이도" value={viewState.selectedQuestion.diff} />
                      <DetailRow label="배점" value={`${viewState.selectedQuestion.score}점`} />
                      <DetailRow label="출처 분석" value={viewState.selectedQuestion.source} />
                      <div className="pt-4 mt-4 border-t border-gray-100">
                        <p className="text-sm text-gray-600 leading-relaxed"><span className="font-bold text-indigo-800">문항 분석평: </span>{viewState.selectedQuestion.analysis || '해당 문항은 기본 개념을 응용한 문항으로... (분석평 내용)'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function InfoBox({ label, value, colSpan = 1 }) {
    return (
      <div className={`bg-white border rounded-lg p-4 shadow-sm col-span-${colSpan}`}>
        <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
        <p className="font-bold text-gray-800">{value || '-'}</p>
      </div>
    );
  }

  function DetailRow({ label, value }) {
    return (
      <div className="flex border-b border-gray-100 pb-2">
        <span className="w-1/3 text-sm font-bold text-gray-500">{label}</span>
        <span className="w-2/3 text-sm text-gray-800 font-medium">{value}</span>
      </div>
    );
  }

  // --- 샘플 데이터 주입 함수 ---
  async function addSampleData() {
    try {
      await addDoc(collection(db, DB_COLLECTION), {
        type: 'individual',
        school: '영일고', grade: '1학년', term: '1-1 중간고사', subject: '수학',
        teacher: '김수학', difficulty: '상',
        mcCount: 15, saCount: 5, essayCount: 2,
        suppBook: '올림포스 고난도', print: '학교 자체 제공 20제',
        scope: '다항식의 연산 ~ 이차방정식과 이차함수',
        review: '전반적으로 계산이 복잡하고 시간이 부족했을 것으로 예상됨. 특히 서술형에서 감점 요소가 많음.',
        specialNotes: '서술형 2번은 작년 수능특강 연계 문항으로 킬러 문항이었음.',
        gradeCuts: { grade1: '88점', grade2: '79점' },
        internalMemo: '김수학 선생님은 항상 부교재 뒷부분에서 서술형을 내는 경향이 있음. 다음 기말 대비때 부교재 3회독 필수.',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: '2024.04.28',
        questions: [
          { qNum: 1, tags: '기본', unit: '다항식의 연산', diff: '하', score: 3.5, source: '교과서' },
          { qNum: 15, tags: '킬러', unit: '이차방정식과 이차함수', diff: '상', score: 5.5, source: '모의고사 기출 변형', analysis: '판별식을 두 번 써야 하는 복합 유형입니다.' }
        ]
      });

      await addDoc(collection(db, DB_COLLECTION), {
        type: 'trend',
        school: '영일고', grade: '1학년', term: '1-1 중간고사', subject: '수학',
        updatedAt: '2024.04.30',
        isDeleted: false,
        createdAt: new Date(),
        trendData: [
          { examName: '22년 1학기', score: 65 },
          { examName: '22년 2학기', score: 70 },
          { examName: '23년 1학기', score: 85 },
          { examName: '23년 2학기', score: 80 },
          { examName: '24년 1학기', score: 95 }
        ],
        scopeChanges: [
          { year: '2022~2023', desc: '주로 교과서와 기본 프린트 위주의 평이한 출제 방식 유지' },
          { year: '2024 현재', desc: '부교재(고난도) 반영 비율이 40% 이상으로 증가하며, 모의고사 기출 변형이 본격적으로 등장함.' }
        ],
        teacherStyles: [
          { name: '김수학', type: '서술형 깐깐함, 모의고사 변형', strategy: '풀이 과정을 정확히 쓰는 연습과 고난도 기출 3회독 필요' },
          { name: '이개념', type: '교과서 구석구석 꼼꼼한 출제', strategy: '교과서 예제, 유제 및 날개 문제까지 암기 수준으로 학습' }
        ]
      });
      alert('샘플 리포트가 추가되었습니다.');
    } catch (e) {
      console.error(e);
      alert('샘플 데이터 추가 실패: 권한이나 네트워크 상태를 확인해주세요.');
    }
  }
}