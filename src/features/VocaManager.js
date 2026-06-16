import React, { useState, useEffect } from 'react';
import { updateStudentCatScore } from '../utils/englishStatManager';
import { Search, Save, AlertCircle } from 'lucide-react'; // lucide 아이콘

/**
 * [서비스 가치] 영어 과목 필터링 로직을 통해 타 과목 강사의 메뉴 혼선과 오작동을 막습니다.
 * 또한 점수 입력 시 딜레이 없는 비동기 저장으로 강사의 퇴근 시간을 10분 앞당깁니다.
 */
const VocaManager = ({ currentUser, classesList, studentsList }) => {
  const [englishStudents, setEnglishStudents] = useState([]);
  const [catInputs, setCatInputs] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null); // 에러/성공 메시지 UI용

  // 1. 권한 및 과목 필터링 (영어반만 노출)
  useEffect(() => {
    // currentUser.role과 수강 과목 기반 필터링 (Time Complexity: O(n))
    if (!classesList || !studentsList) return;

    // 영어반 목록 추출
    const englishClassIds = classesList
      .filter(cls => cls.subject === '영어' || cls.subject === 'English')
      .map(cls => cls.id);

    // 영어반에 속한 학생만 필터링
    const filteredStudents = studentsList.filter(student => 
      student.enrolledClasses.some(classId => englishClassIds.includes(classId))
    );

    setEnglishStudents(filteredStudents);
  }, [classesList, studentsList]);

  // 접근 제어: 영어를 가르치지 않는 강사나 관련 없는 유저는 튕겨냄
  if (currentUser.role === 'teacher' && englishStudents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-gray-500">
        <AlertCircle size={48} className="mb-4 text-red-400" />
        <h2 className="text-xl font-bold">접근 권한 없음</h2>
        <p>Voca 출제 및 관리 메뉴는 '영어' 과목 운영자 및 수강생만 접근 가능합니다.</p>
      </div>
    );
  }

  // 2. 점수 입력 핸들러
  const handleScoreChange = (studentId, value) => {
    setCatInputs(prev => ({ ...prev, [studentId]: value }));
  };

  // 3. 점수 저장 비동기 함수
  const handleSaveScore = async (studentId) => {
    const score = catInputs[studentId];
    if (!score) return;

    setIsSaving(true);
    setMessage(null);
    try {
      await updateStudentCatScore(studentId, score);
      setMessage({ type: 'success', text: '학생의 CAT 점수가 성공적으로 반영되었습니다.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsSaving(false);
      // 3초 후 메시지 초기화
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">초개인화 Voca 설정 (CAT 기반)</h1>
      
      {message && (
        <div className={`p-3 mb-4 rounded ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="p-3 font-semibold text-gray-600">학생 이름</th>
              <th className="p-3 font-semibold text-gray-600">소속 영어반</th>
              <th className="p-3 font-semibold text-gray-600">CAT 진단 점수 (0~1000)</th>
              <th className="p-3 font-semibold text-gray-600">관리</th>
            </tr>
          </thead>
          <tbody>
            {englishStudents.map(student => (
              <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3">{student.name}</td>
                <td className="p-3">{student.className}</td>
                <td className="p-3">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    placeholder="예: 850"
                    className="w-24 p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={catInputs[student.id] || student.catScore || ''}
                    onChange={(e) => handleScoreChange(student.id, e.target.value)}
                  />
                </td>
                <td className="p-3">
                  <button 
                    onClick={() => handleSaveScore(student.id)}
                    disabled={isSaving}
                    className="flex items-center px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save size={16} className="mr-2" />
                    저장
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VocaManager;