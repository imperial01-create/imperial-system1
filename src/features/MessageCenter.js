/* [서비스 가치] 통합 메시지 센터 - 스마트 변수 치환, 반별 타겟 추출, 무한 템플릿을 지원하여 
   학원의 모든 소통(안내, 출결, 성적, 결제)을 한 곳에서 자동화합니다. */
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Send, Users, BookOpen, MessageSquare, Plus, Trash2, Search, CheckSquare, 
  Square, Clock, History, AlertCircle, FileText, ChevronRight, CheckCircle,
  Smartphone, Filter
} from 'lucide-react';
import { collection, addDoc, writeBatch, doc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Button, Card, Badge, Modal } from '../components/UI';
import { useData } from '../contexts/DataContext';

const APP_ID = 'imperial-clinic-v1';

// 기본 템플릿 프리셋
const DEFAULT_TEMPLATES = [
  { id: 't1', name: '일반 공지사항', content: '[목동임페리얼학원]\n안녕하세요 #{학부모이름} 학부모님.\n\n#{내용}\n\n감사합니다.' },
  { id: 't2', name: '결석 안내', content: '[목동임페리얼학원]\n#{학생이름} 학생이 오늘(#{오늘날짜}) #{반이름} 수업에 결석하였습니다.\n\n보충 수업 일정은 추후 안내드리겠습니다.' },
  { id: 't3', name: '보충/클리닉 안내', content: '[목동임페리얼학원]\n#{학생이름} 학생의 보충/클리닉 일정이 확정되어 안내드립니다.\n\n- 일시: #{일시}\n- 과목: #{과목}\n\n늦지 않게 등원 지도 부탁드립니다.' },
  { id: 't4', name: '월 수강료 결제 안내', content: '[목동임페리얼학원 결제안내]\n안녕하세요, #{학생이름} 학부모님.\n#{다음달}월 수강료 결제 기간이 도래하여 안내드립니다.\n\n- 결제 금액: #{금액}원\n- 납부 계좌: #{계좌번호}\n\n항상 믿고 맡겨주셔서 감사합니다.' }
];

const MessageCenter = ({ currentUser }) => {
  const { users = [], classes = [], enrollments = [] } = useData();

  const [activeTab, setActiveTab] = useState('send'); // 'send', 'templates', 'history'
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [outboxHistory, setOutboxHistory] = useState([]);

  // --- 발송 탭 상태 ---
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [messageBody, setMessageBody] = useState('');
  
  // 수신자 타겟팅 상태
  const [targetType, setTargetType] = useState('parent'); // 'parent', 'student', 'staff'
  const [selectedClassId, setSelectedClassId] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  
  const [isSending, setIsSending] = useState(false);

  // --- 실시간 발송 내역 로드 ---
  useEffect(() => {
    if (activeTab !== 'history') return;
    const q = query(
        collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'), 
        orderBy('createdAt', 'desc'), 
        limit(100)
    );
    const unsub = onSnapshot(q, (snapshot) => {
        setOutboxHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [activeTab]);

  // --- 수신자 명단 필터링 및 조립 로직 ---
  const filteredUsers = useMemo(() => {
    let baseUsers = [];
    
    // 1. 반(Class) 기반 추출
    if (selectedClassId !== 'ALL' && (targetType === 'student' || targetType === 'parent')) {
      const activeEnrollments = enrollments.filter(e => e.classId === selectedClassId && e.status === 'active');
      const studentIdsInClass = activeEnrollments.map(e => e.studentId);
      
      if (targetType === 'student') {
        baseUsers = users.filter(u => u.role === 'student' && studentIdsInClass.includes(u.id));
      } else if (targetType === 'parent') {
        // 해당 반 학생들의 ID를 가지고 있는 학부모 추출
        baseUsers = users.filter(u => 
          u.role === 'parent' && 
          u.linkedChildrenIds && 
          u.linkedChildrenIds.some(childId => studentIdsInClass.includes(childId))
        );
      }
    } 
    // 2. 전체 조건 추출
    else {
      if (targetType === 'student') baseUsers = users.filter(u => u.role === 'student');
      else if (targetType === 'parent') baseUsers = users.filter(u => u.role === 'parent');
      else baseUsers = users.filter(u => ['ta', 'admin_assistant', 'lecturer', 'admin'].includes(u.role));
    }

    // 3. 검색어 필터링
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      baseUsers = baseUsers.filter(u => 
        (u.name || '').toLowerCase().includes(q) || 
        (u.phone || '').includes(q)
      );
    }

    // 4. 유효한 전화번호가 있는 사람만 필터링 및 이름 가공
    return baseUsers.filter(u => u.phone && u.phone.length > 8).map(u => {
      let linkedStudentNames = '';
      if (u.role === 'parent' && u.linkedChildrenIds) {
          const children = users.filter(s => u.linkedChildrenIds.includes(s.id)).map(s => s.name);
          if (children.length > 0) linkedStudentNames = children.join(', ');
      }
      return { ...u, linkedStudentNames };
    });
  }, [users, enrollments, selectedClassId, targetType, searchQuery]);

  // --- 핸들러 함수 ---
  const handleApplyTemplate = (tplId) => {
    setSelectedTemplate(tplId);
    if (!tplId) {
        setMessageBody('');
        return;
    }
    const tpl = templates.find(t => t.id === tplId);
    if (tpl) setMessageBody(tpl.content);
  };

  const handleInsertVariable = (variable) => {
    const textarea = document.getElementById('messageTextarea');
    if (!textarea) {
        setMessageBody(prev => prev + variable);
        return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = messageBody;
    const newText = text.substring(0, start) + variable + text.substring(end);
    setMessageBody(newText);
    
    // 커서 위치 재조정
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
      textarea.focus();
    }, 0);
  };

  const handleToggleRecipient = (user) => {
    setSelectedRecipients(prev => {
      const exists = prev.find(p => p.id === user.id);
      if (exists) return prev.filter(p => p.id !== user.id);
      return [...prev, user];
    });
  };

  const handleToggleAllRecipients = () => {
    if (selectedRecipients.length === filteredUsers.length) {
      setSelectedRecipients([]);
    } else {
      setSelectedRecipients(filteredUsers);
    }
  };

  // 🚀 실제 메시지 텍스트 조립 (변수 치환)
  const compileMessage = (rawMsg, user) => {
      let msg = rawMsg;
      const todayStr = new Date().toISOString().split('T')[0];
      const nextMonthStr = String((new Date().getMonth() + 2) > 12 ? 1 : new Date().getMonth() + 2);
      
      // 학부모 이름, 학생 이름 치환 로직
      let sName = user.name;
      let pName = user.name;
      
      if (user.role === 'parent') {
          sName = user.linkedStudentNames || '자녀';
      } else if (user.role === 'student') {
          pName = '학부모'; // 학생 본인에게 보낼 때는 부모 이름 추정 불가
      }

      const cName = selectedClassId !== 'ALL' ? classes.find(c => c.id === selectedClassId)?.name || '' : '학원';

      msg = msg.replace(/#{학생이름}/g, sName);
      msg = msg.replace(/#{학부모이름}/g, pName);
      msg = msg.replace(/#{오늘날짜}/g, todayStr);
      msg = msg.replace(/#{다음달}/g, nextMonthStr);
      msg = msg.replace(/#{반이름}/g, cName);
      
      return msg;
  };

  const handleSendMessage = async () => {
    if (selectedRecipients.length === 0) return alert('수신자를 최소 1명 이상 선택해주세요.');
    if (!messageBody.trim()) return alert('발송할 메시지 내용이 비어있습니다.');
    
    const confirmMsg = `총 ${selectedRecipients.length}명에게 메시지를 발송하시겠습니까?\n발송 요청 즉시 안드로이드 앱을 통해 문자가 순차 발송됩니다.`;
    if (!window.confirm(confirmMsg)) return;

    setIsSending(true);
    try {
      const batch = writeBatch(db);
      
      selectedRecipients.forEach(user => {
          // 🚀 [CTO 패치] 폰 번호 살균(하이픈 제거) 및 변수 치환
          const cleanPhone = user.phone.replace(/[^0-9]/g, '');
          const finalMessage = compileMessage(messageBody, user);
          
          const newDocRef = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'sms_outbox'));
          batch.set(newDocRef, {
              phoneNumber: cleanPhone,
              message: finalMessage,
              status: 'pending',
              type: 'manual_notice',
              recipientId: user.id,
              recipientName: user.name,
              recipientRole: user.role,
              targetClassId: selectedClassId === 'ALL' ? null : selectedClassId,
              createdAt: serverTimestamp()
          });
      });

      await batch.commit();
      
      alert(`성공적으로 ${selectedRecipients.length}건의 발송 요청이 등록되었습니다!`);
      setSelectedRecipients([]);
      setMessageBody('');
      setSelectedTemplate('');
      setActiveTab('history');
      
    } catch (e) {
      alert(`발송 오류: ${e.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // 날짜/시간 포맷팅 유틸
  const formatTime = (timestamp) => {
      if (!timestamp) return '-';
      const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return `${d.getFullYear().toString().substr(2,2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="space-y-6 w-full animate-in fade-in pb-20">
        
      {/* --- 상단 헤더 & 탭 --- */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-3xl border border-gray-200 shadow-sm shrink-0 gap-4">
          <div>
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <MessageSquare className="text-blue-600" size={28}/> 
                  통합 메시지 센터 <Badge variant="primary" className="ml-2">BETA</Badge>
              </h2>
              <p className="text-gray-500 text-sm mt-1 font-bold">학생, 학부모, 강사진에게 알림과 공지를 일괄 발송하고 관리합니다.</p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto p-1.5 bg-gray-100 rounded-xl">
              <button onClick={() => setActiveTab('send')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm ${activeTab === 'send' ? 'bg-white text-blue-700' : 'text-gray-500 hover:bg-gray-200 shadow-none'}`}>새 메시지</button>
              <button onClick={() => setActiveTab('templates')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm ${activeTab === 'templates' ? 'bg-white text-indigo-700' : 'text-gray-500 hover:bg-gray-200 shadow-none'}`}>템플릿 관리</button>
              <button onClick={() => setActiveTab('history')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm ${activeTab === 'history' ? 'bg-white text-gray-900' : 'text-gray-500 hover:bg-gray-200 shadow-none'}`}>발송 내역</button>
          </div>
      </div>

      {/* ========================================================= */}
      {/* 1. 새 메시지 발송 탭 */}
      {/* ========================================================= */}
      {activeTab === 'send' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
              
              {/* 왼쪽: 메시지 편집기 영역 */}
              <Card className="flex flex-col h-[700px] border-2 border-blue-100 shadow-md p-0 overflow-hidden">
                  <div className="bg-blue-50/50 p-5 border-b border-blue-100 flex justify-between items-center">
                      <h3 className="font-black text-lg text-blue-900 flex items-center gap-2"><FileText size={20}/> 메시지 작성</h3>
                      <select 
                          className="border border-blue-200 rounded-lg p-2 text-sm font-bold text-blue-800 bg-white outline-none focus:ring-2 focus:ring-blue-400"
                          value={selectedTemplate}
                          onChange={(e) => handleApplyTemplate(e.target.value)}
                      >
                          <option value="">직접 작성하기</option>
                          {templates.map(t => <option key={t.id} value={t.id}>[{t.name}]</option>)}
                      </select>
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col gap-4">
                      {/* 변수 삽입 툴바 */}
                      <div className="flex flex-wrap gap-2">
                          <span className="text-xs font-bold text-gray-400 w-full mb-1">스마트 변수 삽입 (클릭 시 커서 위치에 들어갑니다)</span>
                          {['#{학생이름}', '#{학부모이름}', '#{반이름}', '#{오늘날짜}'].map(v => (
                              <button key={v} onClick={() => handleInsertVariable(v)} className="bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 px-3 py-1.5 rounded-md text-xs font-black transition-colors border border-gray-200">
                                  {v}
                              </button>
                          ))}
                      </div>

                      {/* 에디터 */}
                      <textarea 
                          id="messageTextarea"
                          className="w-full flex-1 border-2 border-gray-200 rounded-2xl p-5 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 resize-none transition-all custom-scrollbar leading-relaxed"
                          placeholder="발송할 메시지 내용을 입력하세요.&#13;&#10;우측에서 대상을 선택하면 하단에 실제 발송될 예시가 나타납니다."
                          value={messageBody}
                          onChange={(e) => setMessageBody(e.target.value)}
                      />
                  </div>

                  {/* 미리보기 (1명 샘플) */}
                  {selectedRecipients.length > 0 && messageBody && (
                      <div className="bg-indigo-50 border-t border-indigo-100 p-5 shrink-0">
                          <h4 className="text-xs font-black text-indigo-600 mb-2 flex items-center gap-1"><Eye size={14}/> 발송 미리보기 ({selectedRecipients[0].name} 기준)</h4>
                          <div className="bg-white rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap border border-indigo-200 h-32 overflow-y-auto custom-scrollbar shadow-inner leading-relaxed">
                              {compileMessage(messageBody, selectedRecipients[0])}
                          </div>
                      </div>
                  )}
              </Card>

              {/* 오른쪽: 타겟(수신자) 선택 영역 */}
              <Card className="flex flex-col h-[700px] border border-gray-200 p-0 overflow-hidden">
                  <div className="p-5 border-b border-gray-100 bg-gray-50 flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                          <h3 className="font-black text-lg text-gray-800 flex items-center gap-2"><Users size={20} className="text-indigo-600"/> 발송 대상 선택</h3>
                          <Badge variant={selectedRecipients.length > 0 ? 'primary' : 'secondary'}>총 {selectedRecipients.length}명 선택됨</Badge>
                      </div>

                      {/* 필터 툴바 */}
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="block text-[10px] font-bold text-gray-500 mb-1">대상 그룹</label>
                              <select className="w-full border p-2 rounded-lg text-sm font-bold outline-none" value={targetType} onChange={e => {setTargetType(e.target.value); setSelectedRecipients([]);}}>
                                  <option value="parent">👨‍👩‍👧‍👦 학부모</option>
                                  <option value="student">🎓 학생 본인</option>
                                  <option value="staff">👨‍🏫 교직원/강사</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-gray-500 mb-1">반(Class) 필터링</label>
                              <select className="w-full border p-2 rounded-lg text-sm font-bold outline-none" value={selectedClassId} onChange={e => {setSelectedClassId(e.target.value); setSelectedRecipients([]);}} disabled={targetType === 'staff'}>
                                  <option value="ALL">전체 (모든 인원)</option>
                                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                          </div>
                      </div>
                      
                      <div className="relative">
                          <input 
                              type="text" 
                              className="w-full border border-gray-300 p-2.5 pl-9 rounded-xl text-sm outline-none focus:border-indigo-500 transition-colors" 
                              placeholder="이름 또는 전화번호로 명단 검색" 
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          <Search className="absolute left-3 top-2.5 text-gray-400" size={16}/>
                      </div>
                  </div>

                  {/* 명단 리스트 */}
                  <div className="flex-1 overflow-y-auto bg-white p-2 custom-scrollbar">
                      <div className="flex justify-between items-center p-3 mb-1 bg-white sticky top-0 border-b z-10">
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-gray-700">
                              <button onClick={handleToggleAllRecipients} className={`p-0.5 rounded transition-colors ${selectedRecipients.length === filteredUsers.length && filteredUsers.length > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                                  {selectedRecipients.length === filteredUsers.length && filteredUsers.length > 0 ? <CheckSquare size={20} className="fill-indigo-50"/> : <Square size={20}/>}
                              </button>
                              전체 선택 ({filteredUsers.length}명)
                          </label>
                          <span className="text-xs text-rose-500 font-bold">* 번호가 없는 사람은 제외됨</span>
                      </div>

                      {filteredUsers.length === 0 ? (
                          <div className="text-center py-20 text-gray-400 font-bold flex flex-col items-center">
                              <Filter size={32} className="mb-2 opacity-20"/>
                              조건에 맞는 발송 대상이 없습니다.
                          </div>
                      ) : (
                          <div className="space-y-1 p-2">
                              {filteredUsers.map(user => {
                                  const isSelected = selectedRecipients.some(r => r.id === user.id);
                                  return (
                                      <div key={user.id} onClick={() => handleToggleRecipient(user)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-transparent hover:bg-gray-50 border-b-gray-100'}`}>
                                          <div className="flex items-center gap-3">
                                              <button className={`transition-colors ${isSelected ? 'text-indigo-600' : 'text-gray-300'}`}>
                                                  {isSelected ? <CheckSquare size={20} className="fill-indigo-50"/> : <Square size={20}/>}
                                              </button>
                                              <div>
                                                  <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                                                      {user.name} 
                                                      {user.role === 'parent' && <Badge variant="secondary" className="text-[9px]">학부모</Badge>}
                                                  </div>
                                                  <div className="text-xs text-gray-500 font-mono mt-0.5">{user.phone}</div>
                                              </div>
                                          </div>
                                          {user.role === 'parent' && user.linkedStudentNames && (
                                              <div className="text-[10px] text-right text-gray-400 font-bold max-w-[120px] truncate">
                                                  자녀: <span className="text-blue-600">{user.linkedStudentNames}</span>
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>

                  {/* 발송 버튼 영역 */}
                  <div className="p-4 border-t border-gray-200 bg-white shrink-0">
                      <Button 
                          className="w-full py-4 text-lg font-black shadow-lg bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-2"
                          disabled={selectedRecipients.length === 0 || !messageBody || isSending}
                          onClick={handleSendMessage}
                      >
                          {isSending ? <Loader className="animate-spin" size={24}/> : <Send size={24}/>}
                          {selectedRecipients.length}명에게 메시지 전송하기
                      </Button>
                  </div>
              </Card>

          </div>
      )}

      {/* ========================================================= */}
      {/* 2. 발송 내역 / 대기열 탭 */}
      {/* ========================================================= */}
      {activeTab === 'history' && (
          <Card className="w-full">
              <h3 className="font-black text-xl text-gray-900 mb-6 flex items-center gap-2"><History className="text-gray-700"/> 최근 발송 내역 (최대 100건)</h3>
              
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                          <tr>
                              <th className="p-4 rounded-tl-xl w-32">상태</th>
                              <th className="p-4">수신자</th>
                              <th className="p-4">전화번호</th>
                              <th className="p-4">구분</th>
                              <th className="p-4 w-96">메시지 내용</th>
                              <th className="p-4 rounded-tr-xl w-40 text-right">요청 일시</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {outboxHistory.length === 0 ? (
                              <tr><td colSpan="6" className="p-12 text-center text-gray-400 font-bold">발송 내역이 없습니다.</td></tr>
                          ) : outboxHistory.map(item => (
                              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="p-4 font-black">
                                      {item.status === 'pending' && <span className="text-yellow-600 bg-yellow-50 px-2 py-1 rounded flex items-center w-fit gap-1"><Clock size={12}/> 대기중</span>}
                                      {item.status === 'sent' && <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded flex items-center w-fit gap-1"><CheckCircle size={12}/> 발송완료</span>}
                                      {item.status === 'failed' && <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded flex items-center w-fit gap-1"><AlertCircle size={12}/> 실패</span>}
                                  </td>
                                  <td className="p-4 font-bold text-gray-800">{item.recipientName || item.studentName || '이름없음'}</td>
                                  <td className="p-4 font-mono text-gray-500">{item.phoneNumber}</td>
                                  <td className="p-4">
                                      {item.type === 'manual_notice' && <Badge variant="primary">수동 공지</Badge>}
                                      {item.type === 'clinic_feedback' && <Badge variant="secondary">클리닉 리포트</Badge>}
                                  </td>
                                  <td className="p-4">
                                      <div className="max-w-md truncate text-gray-600" title={item.message}>{item.message}</div>
                                  </td>
                                  <td className="p-4 text-right text-gray-400 font-mono text-xs">{formatTime(item.createdAt)}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </Card>
      )}

      {/* ========================================================= */}
      {/* 3. 템플릿 관리 탭 (UI 껍데기만 구성 - 향후 DB 연동 가능) */}
      {/* ========================================================= */}
      {activeTab === 'templates' && (
          <Card className="w-full text-center py-20 flex flex-col items-center justify-center">
              <BookOpen size={48} className="text-indigo-200 mb-4"/>
              <h2 className="text-2xl font-black text-gray-800 mb-2">템플릿 커스텀 매니저 (준비 중)</h2>
              <p className="text-gray-500 font-bold mb-6">현재 기본 제공되는 4가지 프리셋 템플릿만 사용 가능합니다.<br/>추후 학원만의 고유한 템플릿을 무한대로 생성하고 저장하는 기능이 오픈될 예정입니다.</p>
              <Button onClick={() => setActiveTab('send')}>새 메시지 작성하러 가기</Button>
          </Card>
      )}

    </div>
  );
};

export default MessageCenter;