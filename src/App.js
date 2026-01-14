import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle,
  User,
  MessageSquare,
  AlertCircle,
  Send,
  FileText,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Plus,
  X,
  Lock,
  RefreshCw,
  ExternalLink,
  Copy,
  Trash2,
  Key,
  Settings,
  Edit2,
  Save,
  XCircle,
  PlusCircle,
  ClipboardList,
  Users,
  BookOpen,
  Layers,
  CheckSquare,
  BarChart2,
  AlertTriangle,
  Undo2,
  MapPin,
  UserPlus,
  Eye,
} from 'lucide-react';

// --- Constants ---

const ADMIN_ID = 'imperialsys01';
const ADMIN_PASSWORD = 'qwer1234';

const INITIAL_TAS = [
  { id: 'ta1', userId: 'ta_kim', password: '111', name: '김민성' },
  { id: 'ta2', userId: 'ta_oh', password: '222', name: '오혜원' },
  { id: 'ta3', userId: 'ta_lee', password: '333', name: '이채연' },
  { id: 'ta4', userId: 'ta_han', password: '444', name: '한채영' },
];

const INITIAL_LECTURERS = [
  { id: 'lec1', userId: 'lec_kim', password: '111', name: '김강사' },
];

const INITIAL_STUDENTS = [
  {
    id: 'stu1',
    userId: 'lee12',
    password: '1234',
    name: '이원준',
    phone: '010-1234-5678',
  },
];

const CLASSROOMS = [
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
];

// Helper to get Korean Day of Week
const getDayOfWeek = (dateStr) => {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(dateStr);
  return days[date.getDay()];
};

// Helper to get Week Number of Month
const getWeekOfMonth = (date) => {
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfWeek = firstDay.getDay();
  return Math.ceil((date.getDate() + dayOfWeek) / 7);
};

// Updated Mock Data for 2026
const INITIAL_SESSIONS = [
  {
    id: 1,
    taId: 'ta1',
    taName: '김민성',
    date: '2026-01-14',
    startTime: '14:00',
    endTime: '15:00',
    status: 'completed',
    studentName: '이민수',
    studentPhone: '1234',
    topic: '수1 자이스토리',
    questionRange: 'p.49 #131-149',
    feedback: '계산 실수가 줄어들었음',
    improvement: '오답노트 작성 요망',
    clinicContent: '삼각함수 활용 문제 풀이',
    feedbackStatus: 'submitted',
    source: 'naver',
    classroom: 'Class 1',
  },
  {
    id: 11,
    taId: 'ta1',
    taName: '김민성',
    date: '2026-01-14',
    startTime: '15:00',
    endTime: '16:00',
    status: 'confirmed',
    studentName: '이민수',
    studentPhone: '1234',
    topic: '수1 자이스토리',
    questionRange: '이어짐',
    feedback: '',
    improvement: '',
    clinicContent: '',
    feedbackStatus: 'pending',
    source: 'naver',
    classroom: 'Class 1',
  },
  {
    id: 2,
    taId: 'ta2',
    taName: '오혜원',
    date: '2026-01-15',
    startTime: '18:00',
    endTime: '19:00',
    status: 'open',
    studentName: '',
    studentPhone: '',
    topic: '',
    questionRange: '',
    feedback: '',
    improvement: '',
    clinicContent: '',
    feedbackStatus: 'none',
    source: 'system',
    classroom: '',
  },
  {
    id: 21,
    taId: 'ta2',
    taName: '오혜원',
    date: '2026-01-15',
    startTime: '19:00',
    endTime: '20:00',
    status: 'open',
    studentName: '',
    studentPhone: '',
    topic: '',
    questionRange: '',
    feedback: '',
    improvement: '',
    clinicContent: '',
    feedbackStatus: 'none',
    source: 'system',
    classroom: '',
  },
  {
    id: 3,
    taId: 'ta3',
    taName: '이채연',
    date: '2026-01-14',
    startTime: '18:00',
    endTime: '19:00',
    status: 'open',
    studentName: '',
    studentPhone: '',
    topic: '',
    questionRange: '',
    feedback: '',
    improvement: '',
    clinicContent: '',
    feedbackStatus: 'none',
    source: 'system',
    classroom: '',
  },
];

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const TEMPLATES = {
  confirmStudent: (data) => {
    if (!data) return '';
    const dayOfWeek = getDayOfWeek(data.date);
    return `[클리닉 안내]\n일시 : ${data.date} (${dayOfWeek}) ${data.startTime}~${data.endTime}\n장소 : 목동임페리얼학원 본관 ${data.classroom}`;
  },
  confirmParent: (data) => {
    if (!data) return '';
    return `[목동임페리얼학원]\n${data.studentName}학생의 클리닉 예정을 안내드립니다.\n\n[클리닉 예정 안내]\n일시 : ${data.date} ${data.startTime}~${data.endTime}\n장소 : 목동임페리얼학원 본관 ${data.classroom}\n내용 : [${data.topic}] 개별 Q&A 클리닉\n\n학생이 직접 시간을 선정하였으며 해당 시간은 선생님과의 개인적인 약속이므로 늦지 않도록 지도해주시면 감사하겠습니다.`;
  },
  feedbackParent: (data) => {
    if (!data) return '';
    return `[목동임페리얼학원]\n${
      data.studentName
    }학생의 클리닉 피드백입니다.\n\n클리닉 진행 조교 : ${
      data.taName
    }\n클리닉 진행 내용 : ${data.clinicContent}\n개별 문제점 : ${
      data.feedback
    }\n개선 방향 : ${
      data.improvement || '꾸준한 연습이 필요함'
    }\n\n감사합니다.`;
  },
};

// --- Components ---

const Button = ({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled = false,
  icon: Icon,
  size = 'md',
}) => {
  const baseStyle =
    'rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2';
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  const variants = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 shadow-md disabled:bg-blue-300',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    success: 'bg-green-600 text-white hover:bg-green-700 shadow-md',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    naver: 'bg-[#03C75A] text-white hover:bg-[#02b351] shadow-md',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
  };
  return (
    <button
      onClick={onClick}
      className={`${baseStyle} ${sizes[size]} ${variants[variant]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
      disabled={disabled}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 18} />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}
  >
    {children}
  </div>
);

const Badge = ({ status }) => {
  const styles = {
    open: 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-700 border border-gray-300',
    cancellation_requested: 'bg-red-100 text-red-700',
    addition_requested: 'bg-purple-100 text-purple-700',
  };
  const labels = {
    open: '예약 가능',
    pending: '승인 대기',
    confirmed: '예약 확정',
    completed: '클리닉 완료',
    cancellation_requested: '취소 요청중',
    addition_requested: '신청 대기중',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
        styles[status] || styles.completed
      }`}
    >
      {labels[status] || status}
    </span>
  );
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl transform transition-all max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b shrink-0">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// --- Login Component ---

const LoginScreen = ({ onLogin, taList, studentList, lecturerList }) => {
  const [formData, setFormData] = useState({ id: '', password: '' });
  const [error, setError] = useState('');

  const handleLogin = () => {
    setError('');
    const { id, password } = formData;

    // 1. Admin Login Check
    if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
      onLogin({ role: 'admin', name: '행정직원' });
      return;
    }

    // 2. TA Login Check
    const ta = taList.find((t) => t.userId === id && t.password === password);
    if (ta) {
      onLogin({ role: 'ta', ...ta });
      return;
    }

    // 3. Lecturer Login Check
    const lecturer = lecturerList.find(
      (l) => l.userId === id && l.password === password
    );
    if (lecturer) {
      onLogin({ role: 'lecturer', ...lecturer });
      return;
    }

    // 4. Student Login Check
    const student = studentList.find(
      (s) => s.userId === id && s.password === password
    );
    if (student) {
      onLogin({ role: 'student', ...student });
      return;
    }

    // 5. Failed
    setError('아이디 또는 비밀번호가 일치하지 않습니다.');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <CheckCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Imperial System</h1>
          <p className="text-gray-500 mt-2">임페리얼 시스템 로그인</p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="아이디"
            className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.id}
            onChange={(e) => setFormData({ ...formData, id: e.target.value })}
          />

          <input
            type="password"
            placeholder="비밀번호"
            className="w-full border rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            onKeyDown={handleKeyDown}
          />

          {error && (
            <div className="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded">
              {error}
            </div>
          )}
          <Button onClick={handleLogin} className="w-full py-3 text-lg">
            로그인
          </Button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function ImperialClinicMate() {
  const [currentUser, setCurrentUser] = useState(null);

  // User Data States
  const [taList, setTaList] = useState(INITIAL_TAS);
  const [studentList, setStudentList] = useState(INITIAL_STUDENTS);
  const [lecturerList, setLecturerList] = useState(INITIAL_LECTURERS);

  // Session Data State
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const [notifications, setNotifications] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [modalType, setModalType] = useState(null); // 'user_manage' replaced 'ta_manage'

  // TA Schedule States
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Student Schedule States
  const [studentDate, setStudentDate] = useState(new Date());
  const [studentSelectedDateStr, setStudentSelectedDateStr] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [studentSelectedSlots, setStudentSelectedSlots] = useState([]); // Array of session IDs

  // Admin: Default Schedule Settings State
  const [selectedTaIdForSchedule, setSelectedTaIdForSchedule] = useState('');
  const [batchDateRange, setBatchDateRange] = useState({ start: '', end: '' });
  const [defaultSchedule, setDefaultSchedule] = useState({
    월: { start: '14:00', end: '22:00', active: false },
    화: { start: '14:00', end: '22:00', active: false },
    수: { start: '14:00', end: '22:00', active: false },
    목: { start: '14:00', end: '22:00', active: false },
    금: { start: '14:00', end: '22:00', active: false },
    토: { start: '10:00', end: '18:00', active: false },
    일: { start: '10:00', end: '18:00', active: false },
  });

  // User Management States (Admin)
  const [manageTab, setManageTab] = useState('ta'); // 'ta' | 'student' | 'lecturer'
  const [newUser, setNewUser] = useState({
    name: '',
    userId: '',
    password: '',
    phone: '',
  });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    userId: '',
    password: '',
    phone: '',
  });

  // Request Management States
  const [requestData, setRequestData] = useState({
    reason: '',
    type: '',
    targetTime: '',
  });

  // Delete Management
  const [deleteTargetId, setDeleteTargetId] = useState(null);

  // Student Application State
  const [applicationItems, setApplicationItems] = useState([
    { subject: '', workbook: '', range: '' },
  ]);

  // Feedback State
  const [feedbackData, setFeedbackData] = useState({
    clinicContent: '',
    feedback: '',
    improvement: '',
  });

  // --- Helper Functions ---
  const addNotification = (msg, type = 'success') => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, msg, type }]);
    setTimeout(
      () => setNotifications((prev) => prev.filter((n) => n.id !== id)),
      3000
    );
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++)
      days.push(new Date(year, month, i));
    return days;
  };

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let i = 10; i < 22; i++) slots.push(`${i}:00`);
    return slots;
  };

  // --- Handlers ---

  const handleLogout = () => {
    setCurrentUser(null);
    setModalType(null);
    setStudentSelectedSlots([]);
    addNotification('로그아웃 되었습니다.');
  };

  const handlePrevMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
  const handleNextMonth = () =>
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );

  const handleStudentPrevMonth = () =>
    setStudentDate(
      new Date(studentDate.getFullYear(), studentDate.getMonth() - 1, 1)
    );
  const handleStudentNextMonth = () =>
    setStudentDate(
      new Date(studentDate.getFullYear(), studentDate.getMonth() + 1, 1)
    );

  const toggleDefaultDay = (day) => {
    setDefaultSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], active: !prev[day].active },
    }));
  };

  const updateDefaultTime = (day, type, value) => {
    setDefaultSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], [type]: value },
    }));
  };

  const handleSaveDefaultSchedule = () => {
    if (!selectedTaIdForSchedule) {
      addNotification('근무 시간을 설정할 조교를 선택해주세요.', 'error');
      return;
    }
    if (!batchDateRange.start || !batchDateRange.end) {
      addNotification('시작일과 종료일을 모두 선택해주세요.', 'error');
      return;
    }
    const targetTa = taList.find((t) => t.id === selectedTaIdForSchedule);
    if (!targetTa) return;

    let newSessions = [...sessions];
    const startDate = new Date(batchDateRange.start);
    const endDate = new Date(batchDateRange.end);
    let addedCount = 0;

    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = formatDate(d);
      const dayName = DAYS[d.getDay()];
      const schedule = defaultSchedule[dayName];

      if (schedule && schedule.active && schedule.start && schedule.end) {
        const startHour = parseInt(schedule.start.split(':')[0], 10);
        const endHour = parseInt(schedule.end.split(':')[0], 10);

        for (let h = startHour; h < endHour; h++) {
          const startTime = `${String(h).padStart(2, '0')}:00`;
          const endTime = `${String(h + 1).padStart(2, '0')}:00`;
          const exists = newSessions.some(
            (s) =>
              s.taId === targetTa.id &&
              s.date === dateStr &&
              s.startTime === startTime
          );

          if (!exists) {
            newSessions.push({
              id: Date.now() + Math.random(),
              taId: targetTa.id,
              taName: targetTa.name,
              date: dateStr,
              startTime,
              endTime,
              status: 'open',
              source: 'system',
              studentName: '',
              topic: '',
              questionRange: '',
              feedback: '',
              improvement: '',
              clinicContent: '',
              feedbackStatus: 'none',
              classroom: '', // Default empty
            });
            addedCount++;
          }
        }
      }
    }

    setSessions(newSessions);
    addNotification(
      `${targetTa.name} 조교의 근무 시간이 설정되었습니다. (${addedCount}개 슬롯)`
    );
    setDefaultSchedule((prev) => {
      const resetSchedule = {};
      Object.keys(prev).forEach((day) => {
        resetSchedule[day] = { ...prev[day], active: false };
      });
      return resetSchedule;
    });
  };

  const handleAdminDeleteSessionClick = (sessionId) => {
    setDeleteTargetId(sessionId);
    setModalType('confirm_delete');
  };

  const confirmDeleteSession = () => {
    setSessions((prev) => prev.filter((s) => s.id !== deleteTargetId));
    setModalType(null);
    setDeleteTargetId(null);
    addNotification('스케줄이 취소(삭제)되었습니다.');
  };

  const handleRequestCancel = (session) => {
    setSelectedSession(session);
    setRequestData({
      reason: '',
      type: 'cancel',
      targetTime: `${session.startTime}~${session.endTime}`,
    });
    setModalType('request_change');
  };

  const handleRequestAdd = (timeStr) => {
    const [hour] = timeStr.split(':');
    const start = `${hour.padStart(2, '0')}:00`;
    const end = `${String(Number(hour) + 1).padStart(2, '0')}:00`;
    setRequestData({
      reason: '',
      type: 'add',
      targetTime: `${start}~${end}`,
      startTime: start,
      endTime: end,
    });
    setModalType('request_change');
  };

  // TA: Withdraw Cancellation Request
  const handleWithdrawCancelRequest = (session) => {
    if (window.confirm('근무 취소 요청을 철회하시겠습니까?')) {
      setSessions(
        sessions.map((s) =>
          s.id === session.id ? { ...s, status: 'open', cancelReason: '' } : s
        )
      );
      addNotification('근무 취소 요청이 철회되었습니다.');
    }
  };

  const handleSubmitRequest = () => {
    if (requestData.type === 'cancel') {
      if (!requestData.reason) {
        addNotification('사유를 입력해주세요.', 'error');
        return;
      }
      setSessions(
        sessions.map((s) =>
          s.id === selectedSession.id
            ? {
                ...s,
                status: 'cancellation_requested',
                cancelReason: requestData.reason,
              }
            : s
        )
      );
      addNotification('근무 취소 요청이 전송되었습니다.');
    } else if (requestData.type === 'add') {
      const newSession = {
        id: Date.now(),
        taId: currentUser.id,
        taName: currentUser.name,
        date: selectedDateStr,
        startTime: requestData.startTime,
        endTime: requestData.endTime,
        status: 'addition_requested',
        source: 'system',
        studentName: '',
        topic: '',
        questionRange: '',
        feedback: '',
        improvement: '',
        clinicContent: '',
        feedbackStatus: 'none',
        classroom: '',
      };
      setSessions([...sessions, newSession]);
      addNotification('근무 신청 요청이 전송되었습니다.');
    }
    setModalType(null);
    setRequestData({ reason: '', type: '', targetTime: '' });
  };

  const handleApproveRequest = (session) => {
    if (session.status === 'cancellation_requested') {
      setSessions(sessions.filter((s) => s.id !== session.id));
      addNotification(`${session.taName}의 근무 취소가 승인(삭제)되었습니다.`);
    } else if (session.status === 'addition_requested') {
      setSessions(
        sessions.map((s) =>
          s.id === session.id ? { ...s, status: 'open' } : s
        )
      );
      addNotification(`${session.taName}의 근무 신청이 승인(등록)되었습니다.`);
    }
  };

  // --- User Management Handlers (Admin) ---
  const handleAddUser = () => {
    if (!newUser.name || !newUser.userId || !newUser.password) {
      addNotification('이름, 아이디, 비밀번호를 모두 입력해주세요.', 'error');
      return;
    }

    if (manageTab === 'ta') {
      const newTa = { id: `ta${Date.now()}`, ...newUser };
      setTaList([...taList, newTa]);
      addNotification(`${newUser.name} 조교가 추가되었습니다.`);
    } else if (manageTab === 'student') {
      const newStudent = { id: `stu${Date.now()}`, ...newUser };
      setStudentList([...studentList, newStudent]);
      addNotification(`${newUser.name} 학생이 추가되었습니다.`);
    } else if (manageTab === 'lecturer') {
      const newLecturer = { id: `lec${Date.now()}`, ...newUser };
      setLecturerList([...lecturerList, newLecturer]);
      addNotification(`${newUser.name} 강사가 추가되었습니다.`);
    }
    setNewUser({ name: '', userId: '', password: '', phone: '' });
  };

  const handleDeleteUser = (id) => {
    if (manageTab === 'ta') {
      setTaList(taList.filter((t) => t.id !== id));
    } else if (manageTab === 'student') {
      setStudentList(studentList.filter((s) => s.id !== id));
    } else if (manageTab === 'lecturer') {
      setLecturerList(lecturerList.filter((l) => l.id !== id));
    }
    addNotification('사용자가 삭제되었습니다.');
  };

  const handleStartEditUser = (user) => {
    setEditingUserId(user.id);
    setEditForm({ ...user });
  };

  const handleSaveEditUser = () => {
    if (manageTab === 'ta') {
      setTaList(
        taList.map((t) => (t.id === editingUserId ? { ...t, ...editForm } : t))
      );
    } else if (manageTab === 'student') {
      setStudentList(
        studentList.map((s) =>
          s.id === editingUserId ? { ...s, ...editForm } : s
        )
      );
    } else if (manageTab === 'lecturer') {
      setLecturerList(
        lecturerList.map((l) =>
          l.id === editingUserId ? { ...l, ...editForm } : l
        )
      );
    }
    setEditingUserId(null);
    addNotification('사용자 정보가 수정되었습니다.');
  };

  const handleApproveBooking = (session) => {
    if (!session.classroom) {
      addNotification(
        '클리닉 강의실(반)이 지정되지 않았습니다.\n스케줄 표에서 강의실을 먼저 선택해주세요.',
        'error'
      );
      return;
    }
    setSelectedSession(session);
    setModalType('message_preview_confirm');
  };

  const handleUpdateClassroom = (sessionId, newClassroom) => {
    setSessions(
      sessions.map((s) =>
        s.id === sessionId ? { ...s, classroom: newClassroom } : s
      )
    );
  };

  const handleOpenFeedback = (session) => {
    setSelectedSession(session);
    setFeedbackData({
      clinicContent: session.clinicContent || '',
      feedback: session.feedback || '',
      improvement: session.improvement || '',
    });
    setModalType('feedback');
  };

  const handleSubmitFeedback = () => {
    setSessions(
      sessions.map((s) =>
        s.id === selectedSession.id
          ? {
              ...s,
              clinicContent: feedbackData.clinicContent,
              feedback: feedbackData.feedback,
              improvement: feedbackData.improvement,
              feedbackStatus: 'submitted',
              status: 'completed',
            }
          : s
      )
    );
    setModalType(null);
    addNotification('클리닉 피드백이 제출되었습니다.');
    setFeedbackData({ clinicContent: '', feedback: '', improvement: '' });
  };

  const handleViewFeedback = (session) => {
    setSelectedSession(session);
    setModalType('view_feedback');
  };

  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      addNotification('복사되었습니다.');
    } catch (err) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        addNotification('복사되었습니다.');
      } catch (fallbackErr) {
        addNotification(
          '복사하기가 차단된 환경입니다. 텍스트를 직접 드래그해서 복사해주세요.',
          'error'
        );
      }
    }
  };

  // STUDENT: Multi-select Logic
  const handleSlotToggle = (sessionId) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    setStudentSelectedSlots((prev) => {
      if (prev.includes(sessionId)) {
        return prev.filter((id) => id !== sessionId);
      }

      if (prev.length > 0) {
        const firstSessionId = prev[0];
        const firstSession = sessions.find((s) => s.id === firstSessionId);

        if (firstSession && firstSession.date !== session.date) {
          addNotification(
            '다른 날짜의 클리닉은 함께 신청할 수 없습니다.',
            'error'
          );
          return prev;
        }
      }
      return [...prev, sessionId];
    });
  };

  const handleMultiApplyClick = () => {
    if (studentSelectedSlots.length > 0) {
      const firstSession = sessions.find(
        (s) => s.id === studentSelectedSlots[0]
      );
      setSelectedSession(firstSession);
    }
    setApplicationItems([{ subject: '', workbook: '', range: '' }]);
    setModalType('student_apply');
  };

  const addApplicationItem = () =>
    setApplicationItems([
      ...applicationItems,
      { subject: '', workbook: '', range: '' },
    ]);
  const updateApplicationItem = (index, field, value) => {
    const newItems = [...applicationItems];
    newItems[index][field] = value;
    setApplicationItems(newItems);
  };
  const removeApplicationItem = (index) => {
    if (applicationItems.length === 1) return;
    const newItems = applicationItems.filter((_, i) => i !== index);
    setApplicationItems(newItems);
  };

  const submitStudentApplication = () => {
    for (let item of applicationItems) {
      if (!item.subject || !item.workbook || !item.range) {
        addNotification('정보를 모두 입력해주세요.', 'error');
        return;
      }
    }
    const formattedTopic = applicationItems.map((i) => i.subject).join(', ');
    const formattedRange = applicationItems
      .map((i) => `${i.workbook} (${i.range})`)
      .join('\n');

    setSessions(
      sessions.map((s) =>
        studentSelectedSlots.includes(s.id)
          ? {
              ...s,
              status: 'pending',
              studentName: currentUser.name,
              studentPhone: currentUser.phone || '',
              topic: formattedTopic,
              questionRange: formattedRange,
              source: 'app',
            }
          : s
      )
    );
    setModalType(null);
    setStudentSelectedSlots([]);
    addNotification(
      `${studentSelectedSlots.length}개의 클리닉 신청이 완료되었습니다.`
    );
  };

  // --- Views ---

  const CalendarAndScheduleView = ({ isInteractive }) => {
    const calendarDays = getDaysInMonth(currentDate);
    const timeSlots = generateTimeSlots();
    const today = new Date();
    // For Lecturer, isInteractive is false, same as Admin but limited permissions
    const isLecturer = currentUser.role === 'lecturer';
    const isAdmin = currentUser.role === 'admin';

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 min-h-[400px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <CalendarIcon size={18} className="text-blue-600" />{' '}
              {isInteractive ? '나의 근무 일정' : '전체 조교 통합 스케줄'}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="font-bold text-lg">
                {currentDate.getFullYear()}.{currentDate.getMonth() + 1}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-500 mb-2">
            {DAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, idx) => {
              if (!date) return <div key={idx} className="aspect-square" />;
              const dateStr = formatDate(date);
              const isSelected = dateStr === selectedDateStr;
              const hasSession = sessions.some(
                (s) =>
                  s.date === dateStr &&
                  (isInteractive ? s.taId === currentUser.id : true)
              );
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md scale-105'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className={`text-sm ${isSelected ? 'font-bold' : ''}`}>
                    {date.getDate()}
                  </span>
                  {hasSession && (
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-1 ${
                        isSelected ? 'bg-white' : 'bg-blue-500'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-xl text-gray-900">
                {selectedDateStr} 스케줄
              </h3>
            </div>
            <div className="flex gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-100 rounded"></div>예약가능
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-100 rounded"></div>예약확정
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
                클리닉완료
              </div>
              {isInteractive && (
                <>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-100 rounded"></div>취소요청
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-100 rounded"></div>
                    신청대기
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {timeSlots.map((time, idx) => {
              const slotSessions = sessions.filter(
                (s) =>
                  s.date === selectedDateStr &&
                  s.startTime === time &&
                  (isInteractive ? s.taId === currentUser.id : true)
              );

              if (isInteractive && slotSessions.length === 0) {
                return (
                  <div key={idx} className="flex gap-4 items-start group">
                    <div className="w-16 pt-3 text-right text-sm font-medium text-gray-500">
                      {time}
                    </div>
                    <div className="flex-1 border rounded-xl p-3 bg-gray-50 border-gray-100 border-dashed flex items-center justify-between text-gray-400 gap-2 min-h-[60px]">
                      <div className="text-xs px-2">근무 없음</div>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={PlusCircle}
                        onClick={() => handleRequestAdd(time)}
                      >
                        근무 신청
                      </Button>
                    </div>
                  </div>
                );
              }

              if (!isInteractive && slotSessions.length === 0) {
                return (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="w-16 pt-3 text-right text-sm font-medium text-gray-500">
                      {time}
                    </div>
                    <div className="flex-1 border rounded-xl p-3 bg-gray-50 border-gray-100 min-h-[60px] flex items-center justify-center text-gray-400 text-xs">
                      일정 없음
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="flex gap-4 items-start">
                  <div className="w-16 pt-3 text-right text-sm font-medium text-gray-500">
                    {time}
                  </div>
                  <div className="flex-1 space-y-2">
                    {slotSessions.map((session) => {
                      const isBooked =
                        session.status === 'confirmed' ||
                        session.status === 'pending';
                      const isCompleted = session.status === 'completed';
                      const isOpen = session.status === 'open';
                      const isCancelRequested =
                        session.status === 'cancellation_requested';
                      const isAddRequested =
                        session.status === 'addition_requested';
                      const sessionDate = new Date(
                        session.date + 'T' + session.startTime
                      );
                      const isPast = sessionDate < today;

                      return (
                        <div
                          key={session.id}
                          className={`border rounded-xl p-3 transition-all relative min-h-[80px] flex flex-col justify-center ${
                            isBooked
                              ? 'bg-green-50 border-green-200'
                              : isCompleted
                              ? 'bg-gray-100 border-gray-300'
                              : isOpen
                              ? 'bg-blue-50 border-blue-200'
                              : isCancelRequested
                              ? 'bg-red-50 border-red-200'
                              : isAddRequested
                              ? 'bg-purple-50 border-purple-200'
                              : 'bg-gray-50 border-gray-100 border-dashed'
                          }`}
                        >
                          {!isInteractive && (
                            <div className="flex justify-between items-start mb-2 relative">
                              <div className="text-xs font-bold text-gray-500">
                                담당 조교 : {session.taName}
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Admin: Classroom Selector */}
                                {isAdmin && (
                                  <>
                                    <select
                                      className={`text-xs border rounded p-1 ${
                                        !session.classroom
                                          ? 'border-red-400 bg-red-50'
                                          : 'border-gray-200'
                                      }`}
                                      value={session.classroom || ''}
                                      onChange={(e) =>
                                        handleUpdateClassroom(
                                          session.id,
                                          e.target.value
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="">강의실 선택</option>
                                      {CLASSROOMS.map((room) => (
                                        <option key={room} value={room}>
                                          {room}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAdminDeleteSessionClick(
                                          session.id
                                        );
                                      }}
                                      className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors z-20 relative"
                                      title="스케줄 삭제"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                                {/* Lecturer: Just Show Classroom */}
                                {isLecturer && session.classroom && (
                                  <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                                    {session.classroom}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {isBooked || isCompleted ? (
                            <div className="flex justify-between items-start w-full">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-gray-900">
                                    {session.studentName}
                                  </span>
                                  <Badge status={session.status} />
                                </div>
                                <div className="text-sm text-gray-600 font-medium mb-1 whitespace-pre-line">
                                  {session.topic}
                                  <br />
                                  <span className="text-xs text-gray-500 font-normal">
                                    {session.questionRange}
                                  </span>
                                </div>
                              </div>

                              {/* TA View: Complete/Edit Feedback */}
                              {isInteractive &&
                                (session.status === 'confirmed' ||
                                  session.status === 'completed') && (
                                  <div className="flex flex-col gap-1">
                                    <Button
                                      size="sm"
                                      variant="success"
                                      icon={CheckSquare}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenFeedback(session);
                                      }}
                                    >
                                      {session.status === 'completed'
                                        ? '완료/수정'
                                        : '클리닉 완료'}
                                    </Button>
                                  </div>
                                )}

                              {/* Admin/Lecturer View: View Feedback for Completed Sessions */}
                              {!isInteractive && isCompleted && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleViewFeedback(session)}
                                  className="text-blue-600 text-xs underline"
                                >
                                  피드백 보기
                                </Button>
                              )}

                              {/* Pending status for Admin/Lecturer is handled by bookings status, here just show booked info */}
                            </div>
                          ) : isOpen ? (
                            <div className="flex justify-between items-center text-blue-700 w-full h-full min-h-[40px]">
                              {isInteractive ? (
                                <span className="font-bold flex items-center gap-2">
                                  <CheckCircle size={16} /> 근무 중 (예약 가능)
                                </span>
                              ) : null}
                              {isInteractive && !isPast && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  icon={XCircle}
                                  onClick={() => handleRequestCancel(session)}
                                >
                                  근무 취소
                                </Button>
                              )}
                            </div>
                          ) : isCancelRequested ? (
                            <div className="flex justify-between items-center text-red-700 w-full">
                              <div className="flex items-center gap-2">
                                <span className="font-bold flex items-center gap-2">
                                  <AlertCircle size={16} /> 취소 요청중
                                </span>
                                {isInteractive && (
                                  <div className="text-xs bg-white px-2 py-1 rounded">
                                    승인 대기
                                  </div>
                                )}
                              </div>
                              {isInteractive && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={Undo2}
                                  onClick={() =>
                                    handleWithdrawCancelRequest(session)
                                  }
                                >
                                  요청 취소
                                </Button>
                              )}
                            </div>
                          ) : isAddRequested ? (
                            <div className="flex justify-between items-center text-purple-700 w-full">
                              <span className="font-bold flex items-center gap-2">
                                <Clock size={16} /> 신청 대기중
                              </span>
                              {isInteractive && (
                                <div className="text-xs bg-white px-2 py-1 rounded">
                                  승인 대기
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  };

  const TAFunctions = () => {
    // Calculate Monthly Stats
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    const myMonthlySessions = sessions.filter(
      (s) =>
        s.taId === currentUser.id &&
        new Date(s.date).getMonth() === currentMonth &&
        new Date(s.date).getFullYear() === currentYear
    );
    const performedHours = myMonthlySessions.filter(
      (s) => s.status === 'completed'
    ).length;
    const totalScheduledHours = myMonthlySessions.filter(
      (s) =>
        s.status === 'open' ||
        s.status === 'confirmed' ||
        s.status === 'completed'
    ).length;

    return (
      <div className="space-y-6">
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold mb-1">
                이번 달 근무 현황 ({currentMonth + 1}월)
              </h2>
              <p className="text-sm opacity-90">
                {currentUser.name} TA님, 오늘도 화이팅하세요!
              </p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-3xl font-black">{performedHours}시간</div>
                <div className="text-xs opacity-80">클리닉 수행</div>
              </div>
              <div className="w-px bg-white/20"></div>
              <div>
                <div className="text-3xl font-black">
                  {totalScheduledHours}시간
                </div>
                <div className="text-xs opacity-80">총 근무 예정</div>
              </div>
            </div>
          </div>
        </Card>
        <CalendarAndScheduleView isInteractive={true} />
      </div>
    );
  };

  const LecturerFunctions = () => {
    const pendingBookings = sessions.filter((s) => s.status === 'pending');

    return (
      <div className="space-y-8">
        <div className="bg-white border-b pb-4 mb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Eye className="text-blue-600" /> 전체 조교 통합 스케줄 (열람 전용)
          </h2>
        </div>

        <CalendarAndScheduleView isInteractive={false} />

        <div className="grid grid-cols-1 md:grid-cols-1 gap-6 pt-6 border-t">
          <Card>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <CheckCircle className="text-blue-600" /> 진행 중인 클리닉 신청
            </h2>
            {pendingBookings.length === 0 ? (
              <p className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">
                대기 중인 신청 없음
              </p>
            ) : (
              <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {pendingBookings.map((session) => (
                  <div
                    key={session.id}
                    className="border-l-4 border-green-500 bg-white shadow-sm rounded-r-lg p-4"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {session.source === 'naver' ? (
                        <span className="bg-green-100 text-green-800 text-[10px] font-bold px-1.5 rounded">
                          NAVER
                        </span>
                      ) : (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 rounded">
                          APP
                        </span>
                      )}
                      <span className="font-bold">{session.studentName}</span>
                      <span className="text-xs text-gray-500">
                        ({session.studentPhone}) → {session.taName}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {session.date} {session.startTime}~{session.endTime}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 whitespace-pre-line">
                      {session.topic}
                      <br />
                      <span className="text-gray-400">
                        {session.questionRange}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  };

  const StudentFunctions = () => {
    const calendarDays = getDaysInMonth(studentDate);
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter open sessions for selected date AND ensure it's not in the past
    const openSessions = sessions
      .filter(
        (s) =>
          s.status === 'open' &&
          s.date === studentSelectedDateStr &&
          s.date >= todayStr
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 min-h-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <CalendarIcon size={18} className="text-blue-600" /> 클리닉 일정
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleStudentPrevMonth}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="font-bold text-lg">
                  {studentDate.getFullYear()}.{studentDate.getMonth() + 1}
                </span>
                <button
                  onClick={handleStudentNextMonth}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs font-bold text-gray-500 mb-2">
              {DAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date, idx) => {
                if (!date) return <div key={idx} className="aspect-square" />;
                const dateStr = formatDate(date);
                const isSelected = dateStr === studentSelectedDateStr;
                const isPast = dateStr < todayStr;
                const hasSession = sessions.some(
                  (s) => s.date === dateStr && s.status === 'open'
                );

                return (
                  <button
                    key={idx}
                    disabled={isPast}
                    onClick={() => {
                      setStudentSelectedDateStr(dateStr);
                      setStudentSelectedSlots([]); // Reset selection when date changes
                    }}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all 
                      ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-md scale-105'
                          : isPast
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'hover:bg-gray-100 text-gray-700'
                      }
                    `}
                  >
                    <span
                      className={`text-sm ${isSelected ? 'font-bold' : ''}`}
                    >
                      {date.getDate()}
                    </span>
                    {hasSession && !isPast && (
                      <div
                        className={`w-1.5 h-1.5 rounded-full mt-1 ${
                          isSelected ? 'bg-white' : 'bg-blue-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 justify-between">
              <span>
                <span className="text-blue-600">{studentSelectedDateStr}</span>{' '}
                예약 가능 클리닉
              </span>
              {studentSelectedSlots.length > 0 && (
                <span className="text-sm font-normal text-blue-600 bg-blue-50 px-3 py-1 rounded-full animate-pulse">
                  {studentSelectedSlots.length}개 선택됨
                </span>
              )}
            </h2>

            {openSessions.length === 0 ? (
              <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">
                해당 날짜에 예약 가능한 클리닉이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {openSessions.map((session) => {
                  const isSelected = studentSelectedSlots.includes(session.id);
                  return (
                    <div
                      key={session.id}
                      className={`border rounded-xl p-5 cursor-pointer transition-all relative group
                        ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/50 shadow-md ring-1 ring-blue-500'
                            : 'hover:border-blue-300 bg-white'
                        }
                      `}
                      onClick={() => handleSlotToggle(session.id)}
                    >
                      <div className="absolute top-4 right-4">
                        {isSelected ? (
                          <CheckCircle
                            className="text-blue-600 fill-blue-100"
                            size={24}
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-gray-300 group-hover:border-blue-400" />
                        )}
                      </div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded">
                          {session.taName} TA
                        </span>
                      </div>
                      <p className="text-xl font-bold text-gray-800 mb-1">
                        {session.startTime} ~ {session.endTime}
                      </p>
                      <p className="text-xs text-gray-500">클릭하여 선택</p>
                    </div>
                  );
                })}
              </div>
            )}

            {studentSelectedSlots.length > 0 && (
              <div className="mt-6 pt-4 border-t sticky bottom-0 bg-white p-2 shadow-inner rounded-b-xl flex justify-center">
                <Button
                  className="w-full max-w-sm py-3 text-lg shadow-xl"
                  onClick={handleMultiApplyClick}
                >
                  {studentSelectedSlots.length}개 슬롯 일괄 신청하기
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  };

  const AdminFunctions = () => {
    const pendingBookings = sessions.filter((s) => s.status === 'pending');
    const pendingFeedbacks = sessions.filter(
      (s) => s.feedbackStatus === 'submitted'
    );
    const scheduleRequests = sessions.filter(
      (s) =>
        s.status === 'cancellation_requested' ||
        s.status === 'addition_requested'
    );

    return (
      <div className="space-y-8">
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => setModalType('admin_stats')}
            variant="secondary"
            icon={BarChart2}
          >
            통계 보기
          </Button>
          <Button
            onClick={() => setModalType('user_manage')}
            variant="secondary"
            icon={Settings}
          >
            사용자 관리
          </Button>
        </div>

        {/* Admin: Schedule Change Requests */}
        <Card className="border-purple-200 bg-purple-50/30">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ClipboardList className="text-purple-600" /> 근무 변경 요청 관리
            {scheduleRequests.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 rounded-full">
                {scheduleRequests.length}
              </span>
            )}
          </h2>
          {scheduleRequests.length === 0 ? (
            <p className="text-gray-500 text-center py-4 bg-white rounded-lg border border-gray-100">
              처리할 변경 요청이 없습니다.
            </p>
          ) : (
            <div className="grid gap-3">
              {scheduleRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border p-4 rounded-lg flex justify-between items-center shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge status={req.status} />
                      <span className="font-bold text-gray-800">
                        {req.taName}
                      </span>
                      <span className="text-sm text-gray-500">{req.date}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {req.startTime}~{req.endTime}
                      {req.cancelReason && (
                        <span className="ml-2 text-red-600 font-medium">
                          {' '}
                          (사유: {req.cancelReason})
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleApproveRequest(req)}
                  >
                    승인(확인)
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Default Schedule Settings */}
        <Card className="border-blue-200 bg-blue-50/50">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Clock size={18} className="text-blue-600" /> 조교별 근무 시간
              일괄 설정
            </h3>
            <select
              className="border rounded-lg p-2 text-sm min-w-[200px]"
              value={selectedTaIdForSchedule}
              onChange={(e) => setSelectedTaIdForSchedule(e.target.value)}
            >
              <option value="">설정할 조교 선택</option>
              {taList.map((ta) => (
                <option key={ta.id} value={ta.id}>
                  {ta.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-gray-700 w-16">
                시작일
              </label>
              <input
                type="date"
                className="border rounded p-2 text-sm flex-1"
                value={batchDateRange.start}
                onChange={(e) =>
                  setBatchDateRange({
                    ...batchDateRange,
                    start: e.target.value,
                  })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-bold text-gray-700 w-16">
                종료일
              </label>
              <input
                type="date"
                className="border rounded p-2 text-sm flex-1"
                value={batchDateRange.end}
                onChange={(e) =>
                  setBatchDateRange({ ...batchDateRange, end: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
            {DAYS.map((day) => (
              <div
                key={day}
                className={`border rounded-lg p-2 text-center transition-all bg-white ${
                  defaultSchedule[day].active
                    ? 'border-blue-500 shadow-md ring-1 ring-blue-500'
                    : 'opacity-60'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm">{day}요일</span>
                  <input
                    type="checkbox"
                    checked={defaultSchedule[day].active}
                    onChange={() => toggleDefaultDay(day)}
                    className="w-4 h-4 accent-blue-600"
                  />
                </div>
                <div className="space-y-1">
                  <input
                    type="time"
                    className="w-full text-xs border rounded p-1"
                    value={defaultSchedule[day].start}
                    onChange={(e) =>
                      updateDefaultTime(day, 'start', e.target.value)
                    }
                    disabled={!defaultSchedule[day].active}
                  />
                  <input
                    type="time"
                    className="w-full text-xs border rounded p-1"
                    value={defaultSchedule[day].end}
                    onChange={(e) =>
                      updateDefaultTime(day, 'end', e.target.value)
                    }
                    disabled={!defaultSchedule[day].active}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="md"
              onClick={handleSaveDefaultSchedule}
              disabled={
                !selectedTaIdForSchedule ||
                !batchDateRange.start ||
                !batchDateRange.end
              }
            >
              선택한 기간 근무 일괄 설정
            </Button>
          </div>
        </Card>

        {/* Admin Unified Calendar */}
        <div className="border-t pt-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users className="text-gray-700" /> 전체 조교 통합 스케줄
          </h2>
          <CalendarAndScheduleView isInteractive={false} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t">
          <Card>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <CheckCircle className="text-blue-600" /> 신규 예약 확인{' '}
              {pendingBookings.length > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 rounded-full">
                  {pendingBookings.length}
                </span>
              )}
            </h2>
            {pendingBookings.length === 0 ? (
              <p className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">
                신규 예약 없음
              </p>
            ) : (
              <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {pendingBookings.map((session) => (
                  <div
                    key={session.id}
                    className="border-l-4 border-green-500 bg-white shadow-sm rounded-r-lg p-4 flex flex-col md:flex-row justify-between items-center gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {session.source === 'naver' ? (
                          <span className="bg-green-100 text-green-800 text-[10px] font-bold px-1.5 rounded">
                            NAVER
                          </span>
                        ) : (
                          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 rounded">
                            APP
                          </span>
                        )}
                        <span className="font-bold">{session.studentName}</span>
                        <span className="text-xs text-gray-500">
                          ({session.studentPhone}) → {session.taName}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {session.date} {session.startTime}~{session.endTime}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 whitespace-pre-line">
                        {session.topic}
                        <br />
                        <span className="text-gray-400">
                          {session.questionRange}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => handleApproveBooking(session)}
                    >
                      확인 및 문자발송
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="text-green-600" /> 피드백 전송{' '}
              {pendingFeedbacks.length > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 rounded-full">
                  {pendingFeedbacks.length}
                </span>
              )}
            </h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {pendingFeedbacks.map((session) => (
                <div
                  key={session.id}
                  className="border rounded-lg p-4 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="font-bold mb-1">
                      {session.studentName} 학생 피드백
                    </div>
                    <div className="text-sm text-gray-600 mb-2 truncate">
                      {session.feedback}
                    </div>
                    <div className="text-xs text-gray-400">
                      작성자: {session.taName}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedSession(session);
                      setModalType('message_preview_feedback');
                    }}
                  >
                    전송 미리보기
                  </Button>
                </div>
              ))}
              {pendingFeedbacks.length === 0 && (
                <p className="text-gray-500 text-center py-8">
                  대기 중인 피드백 없음
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  };

  if (!currentUser)
    return (
      <LoginScreen
        onLogin={setCurrentUser}
        taList={taList}
        studentList={studentList}
        lecturerList={lecturerList}
      />
    );

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      {/* Notifications */}
      <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] space-y-2 w-full max-w-md pointer-events-none px-4">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`backdrop-blur text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in-down text-sm pointer-events-auto justify-center ${
              n.type === 'error' ? 'bg-red-500/90' : 'bg-gray-900/90'
            }`}
          >
            {n.type === 'error' ? (
              <AlertTriangle size={16} />
            ) : (
              <CheckCircle size={16} className="text-green-400" />
            )}
            {n.msg}
          </div>
        ))}
      </div>

      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white">
            <CheckCircle size={20} />
          </div>
          <h1 className="text-lg font-bold text-gray-800 hidden md:block">
            Imperial System{' '}
            <span className="text-xs font-normal text-gray-500">v4.3</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-gray-900">
              {currentUser.name}
            </div>
            <div className="text-xs text-gray-500 capitalize">
              {currentUser.role === 'ta'
                ? 'Teaching Assistant'
                : currentUser.role === 'lecturer'
                ? 'Lecturer'
                : currentUser.role}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="로그아웃"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        {currentUser.role === 'admin' && <AdminFunctions />}
        {currentUser.role === 'ta' && <TAFunctions />}
        {currentUser.role === 'student' && <StudentFunctions />}
        {currentUser.role === 'lecturer' && <LecturerFunctions />}
      </main>

      {/* Modals */}
      <Modal
        isOpen={modalType === 'confirm_delete'}
        onClose={() => setModalType(null)}
        title="스케줄 삭제 확인"
      >
        <div className="space-y-4 text-center p-4">
          <div className="text-red-500 mb-2 flex justify-center">
            <AlertTriangle size={48} />
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            정말 삭제하시겠습니까?
          </h3>
          <p className="text-gray-500 text-sm">
            선택한 스케줄이 영구적으로 삭제되며,
            <br />
            복구할 수 없습니다.
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setModalType(null)}
            >
              취소
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={confirmDeleteSession}
            >
              삭제
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'user_manage'}
        onClose={() => setModalType(null)}
        title="사용자 관리"
      >
        <div className="space-y-6">
          {/* Tab Switcher */}
          <div className="flex border-b">
            <button
              className={`flex-1 py-2 text-sm font-bold ${
                manageTab === 'ta'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => {
                setManageTab('ta');
                setEditingUserId(null);
                setNewUser({ name: '', userId: '', password: '', phone: '' });
              }}
            >
              조교 관리
            </button>
            <button
              className={`flex-1 py-2 text-sm font-bold ${
                manageTab === 'student'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => {
                setManageTab('student');
                setEditingUserId(null);
                setNewUser({ name: '', userId: '', password: '', phone: '' });
              }}
            >
              학생 관리
            </button>
            <button
              className={`flex-1 py-2 text-sm font-bold ${
                manageTab === 'lecturer'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => {
                setManageTab('lecturer');
                setEditingUserId(null);
                setNewUser({ name: '', userId: '', password: '', phone: '' });
              }}
            >
              강사 관리
            </button>
          </div>

          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="text-sm font-bold text-gray-700 mb-2">
              신규{' '}
              {manageTab === 'ta'
                ? '조교'
                : manageTab === 'student'
                ? '학생'
                : '강사'}{' '}
              추가
            </h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                placeholder="이름"
                className="border rounded p-2 text-sm"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="전화번호"
                className="border rounded p-2 text-sm"
                value={newUser.phone}
                onChange={(e) =>
                  setNewUser({ ...newUser, phone: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="아이디"
                className="border rounded p-2 text-sm"
                value={newUser.userId}
                onChange={(e) =>
                  setNewUser({ ...newUser, userId: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="비밀번호"
                className="border rounded p-2 text-sm"
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
            </div>
            <Button
              onClick={handleAddUser}
              variant="primary"
              size="sm"
              className="w-full"
            >
              추가하기
            </Button>
          </div>

          <div className="divide-y border rounded-lg max-h-[300px] overflow-y-auto">
            {(manageTab === 'ta'
              ? taList
              : manageTab === 'student'
              ? studentList
              : lecturerList
            ).map((user) => (
              <div
                key={user.id}
                className="p-3 flex justify-between items-center bg-white hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 flex-1">
                  <User size={18} className="text-gray-400 shrink-0" />
                  {editingUserId === user.id ? (
                    <div className="grid grid-cols-2 gap-1 w-full mr-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        className="border rounded p-1 text-xs"
                        placeholder="이름"
                      />
                      <input
                        type="text"
                        value={editForm.userId}
                        onChange={(e) =>
                          setEditForm({ ...editForm, userId: e.target.value })
                        }
                        className="border rounded p-1 text-xs"
                        placeholder="ID"
                      />
                      <input
                        type="text"
                        value={editForm.password}
                        onChange={(e) =>
                          setEditForm({ ...editForm, password: e.target.value })
                        }
                        className="border rounded p-1 text-xs"
                        placeholder="PW"
                      />
                      <input
                        type="text"
                        value={editForm.phone}
                        onChange={(e) =>
                          setEditForm({ ...editForm, phone: e.target.value })
                        }
                        className="border rounded p-1 text-xs"
                        placeholder="전화"
                      />
                    </div>
                  ) : (
                    <div className="text-sm">
                      <span className="font-bold text-gray-800">
                        {user.name}
                      </span>
                      <span className="text-gray-500 text-xs ml-2">
                        ({user.userId})
                      </span>
                      {user.phone && (
                        <div className="text-xs text-gray-400">
                          {user.phone}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {editingUserId === user.id ? (
                    <>
                      <button
                        onClick={handleSaveEditUser}
                        className="text-green-600 p-1"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        onClick={() => setEditingUserId(null)}
                        className="text-gray-400 p-1"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartEditUser(user)}
                        className="text-blue-400 p-1"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-400 p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Admin Stats Modal */}
      <Modal
        isOpen={modalType === 'admin_stats'}
        onClose={() => setModalType(null)}
        title="조교 근무 통계"
      >
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
            <span className="font-bold text-gray-700">
              {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월 근무
              현황
            </span>
            <div className="text-xs text-gray-500">확정(수행) / 전체(오픈)</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="p-2">조교명</th>
                  {[1, 2, 3, 4, 5].map((week) => (
                    <th key={week} className="p-2 text-center">
                      {week}주차
                    </th>
                  ))}
                  <th className="p-2 text-center font-bold">월 합계</th>
                </tr>
              </thead>
              <tbody>
                {taList.map((ta) => {
                  let totalConfirmed = 0;
                  let totalScheduled = 0;

                  return (
                    <tr key={ta.id} className="border-b">
                      <td className="p-2 font-medium">{ta.name}</td>
                      {[1, 2, 3, 4, 5].map((week) => {
                        const weekSessions = sessions.filter((s) => {
                          const d = new Date(s.date);
                          return (
                            s.taId === ta.id &&
                            d.getMonth() === currentDate.getMonth() &&
                            getWeekOfMonth(d) === week
                          );
                        });
                        const confirmed = weekSessions.filter(
                          (s) => s.status === 'confirmed'
                        ).length;
                        const scheduled = weekSessions.filter(
                          (s) => s.status === 'open' || s.status === 'confirmed'
                        ).length;

                        totalConfirmed += confirmed;
                        totalScheduled += scheduled;

                        return (
                          <td key={week} className="p-2 text-center text-xs">
                            {scheduled > 0 ? (
                              <span
                                className={
                                  confirmed > 0
                                    ? 'text-blue-600 font-bold'
                                    : 'text-gray-400'
                                }
                              >
                                {confirmed}/{scheduled}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-bold bg-blue-50 text-blue-800">
                        {totalConfirmed}/{totalScheduled}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Work Request Modal (Add/Cancel) */}
      <Modal
        isOpen={modalType === 'request_change'}
        onClose={() => setModalType(null)}
        title={
          requestData.type === 'cancel' ? '근무 취소 요청' : '근무 신청 요청'
        }
      >
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon size={18} className="text-blue-600" />
              <span className="font-bold text-gray-800">{selectedDateStr}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600 font-medium">
              <Clock size={18} />
              <span>{requestData.targetTime}</span>
            </div>
          </div>

          {requestData.type === 'cancel' ? (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                취소 사유 (필수)
              </label>
              <textarea
                className="w-full border rounded p-3 h-24 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="예: 개인 사정으로 인해 근무가 어렵습니다."
                value={requestData.reason}
                onChange={(e) =>
                  setRequestData({ ...requestData, reason: e.target.value })
                }
              />
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              해당 시간에 근무를 신청하시겠습니까?
              <br />
              관리자 승인 후 근무 일정이 확정됩니다.
            </div>
          )}

          <Button className="w-full py-3" onClick={handleSubmitRequest}>
            요청하기
          </Button>
        </div>
      </Modal>

      {/* Student Apply Modal */}
      <Modal
        isOpen={modalType === 'student_apply'}
        onClose={() => setModalType(null)}
        title="클리닉 예약 신청"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <User size={18} className="text-blue-600" />
              <span className="font-bold text-gray-800">
                {selectedSession?.taName} TA
              </span>
            </div>
            <div className="flex flex-col gap-1 text-sm text-gray-600">
              {studentSelectedSlots.length > 0 ? (
                studentSelectedSlots.map((id) => {
                  const s = sessions.find((sess) => sess.id === id);
                  return (
                    <div key={id} className="flex gap-2">
                      <CalendarIcon size={14} /> {s.date} <Clock size={14} />{' '}
                      {s.startTime}~{s.endTime}
                    </div>
                  );
                })
              ) : (
                <div className="flex gap-2">
                  <CalendarIcon size={16} /> {selectedSession?.date}{' '}
                  <Clock size={16} /> {selectedSession?.startTime} ~{' '}
                  {selectedSession?.endTime}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {applicationItems.map((item, idx) => (
              <div
                key={idx}
                className="border rounded-lg p-3 bg-gray-50 relative group"
              >
                {applicationItems.length > 1 && (
                  <button
                    onClick={() => removeApplicationItem(idx)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="mb-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    클리닉 필요 과목
                  </label>
                  <input
                    type="text"
                    placeholder="예: 미적분1"
                    className="w-full border rounded p-2 text-sm focus:outline-blue-500"
                    value={item.subject}
                    onChange={(e) =>
                      updateApplicationItem(idx, 'subject', e.target.value)
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">
                      문제집
                    </label>
                    <input
                      type="text"
                      placeholder="예: 개념원리"
                      className="w-full border rounded p-2 text-sm focus:outline-blue-500"
                      value={item.workbook}
                      onChange={(e) =>
                        updateApplicationItem(idx, 'workbook', e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">
                      범위
                    </label>
                    <input
                      type="text"
                      placeholder="예: p.30-38 #41-50,61"
                      className="w-full border rounded p-2 text-sm focus:outline-blue-500"
                      value={item.range}
                      onChange={(e) =>
                        updateApplicationItem(idx, 'range', e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            className="w-full border-dashed"
            icon={Plus}
            onClick={addApplicationItem}
          >
            과목 추가
          </Button>

          <div className="pt-2 border-t">
            <Button
              className="w-full py-3 text-lg"
              onClick={submitStudentApplication}
            >
              신청 완료
            </Button>
          </div>
        </div>
      </Modal>

      {/* TA Feedback Modal */}
      <Modal
        isOpen={modalType === 'feedback'}
        onClose={() => setModalType(null)}
        title="클리닉 완료 및 피드백"
      >
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-lg text-gray-900">
                {selectedSession?.studentName} 학생
              </span>
              <Badge status="confirmed" />
            </div>

            <div className="space-y-3">
              <div className="bg-white p-3 rounded border">
                <div className="text-xs font-bold text-blue-600 mb-1">
                  신청 과목
                </div>
                <div className="text-sm font-medium">
                  {selectedSession?.topic}
                </div>
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="text-xs font-bold text-blue-600 mb-1">
                  문제집 및 범위
                </div>
                <div className="text-sm text-gray-600 whitespace-pre-line">
                  {selectedSession?.questionRange}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Edit2 size={16} /> 피드백 작성
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  클리닉 진행 내용
                </label>
                <textarea
                  className="w-full border rounded p-2 h-20 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="예: 수1 삼각함수 개념 설명 및 오답 정리"
                  value={feedbackData.clinicContent}
                  onChange={(e) =>
                    setFeedbackData({
                      ...feedbackData,
                      clinicContent: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  개별 문제점
                </label>
                <textarea
                  className="w-full border rounded p-2 h-20 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="예: 계산 실수가 잦고 공식 적용에 어려움이 있음"
                  value={feedbackData.feedback}
                  onChange={(e) =>
                    setFeedbackData({
                      ...feedbackData,
                      feedback: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  개선 방향
                </label>
                <textarea
                  className="w-full border rounded p-2 h-20 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="예: 풀이 과정 서술 연습 필요"
                  value={feedbackData.improvement}
                  onChange={(e) =>
                    setFeedbackData({
                      ...feedbackData,
                      improvement: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
          <Button className="w-full" onClick={handleSubmitFeedback}>
            제출 및 완료
          </Button>
        </div>
      </Modal>

      {/* Admin View Feedback Modal */}
      <Modal
        isOpen={modalType === 'view_feedback'}
        onClose={() => setModalType(null)}
        title="클리닉 피드백 상세"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 p-3 rounded border border-blue-100">
            <div className="font-bold text-blue-900">
              {selectedSession?.studentName} 학생
            </div>
            <div className="text-xs text-blue-700 mt-1">
              {selectedSession?.date} | {selectedSession?.taName} TA
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-700">
              클리닉 진행 내용
            </h4>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap">
              {selectedSession?.clinicContent || '-'}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-700">개별 문제점</h4>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap">
              {selectedSession?.feedback || '-'}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-700">개선 방향</h4>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap">
              {selectedSession?.improvement || '-'}
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setModalType(null)}
            >
              닫기
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'message_preview_confirm'}
        onClose={() => setModalType(null)}
        title="알림 발송"
      >
        <div className="space-y-4">
          <div
            className="bg-yellow-50 p-3 rounded text-xs border border-yellow-200 whitespace-pre-wrap relative group cursor-pointer"
            onClick={() =>
              copyToClipboard(
                selectedSession && TEMPLATES.confirmStudent(selectedSession)
              )
            }
          >
            <div className="font-bold text-yellow-800 mb-1">
              To. 학생 (클릭하여 복사)
            </div>
            {selectedSession && TEMPLATES.confirmStudent(selectedSession)}
          </div>
          <div
            className="bg-green-50 p-3 rounded text-xs border border-green-200 whitespace-pre-wrap relative group cursor-pointer"
            onClick={() =>
              copyToClipboard(
                selectedSession && TEMPLATES.confirmParent(selectedSession)
              )
            }
          >
            <div className="font-bold text-green-800 mb-1">
              To. 학부모 (클릭하여 복사)
            </div>
            {selectedSession && TEMPLATES.confirmParent(selectedSession)}
          </div>
          <Button
            className="w-full"
            onClick={() => {
              setSessions(
                sessions.map((s) =>
                  s.id === selectedSession.id
                    ? { ...s, status: 'confirmed' }
                    : s
                )
              );
              setModalType(null);
              addNotification('전송 완료 처리됨');
            }}
          >
            전송 완료 및 확정
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modalType === 'message_preview_feedback'}
        onClose={() => setModalType(null)}
        title="피드백 발송"
      >
        <div className="space-y-4">
          <div
            className="bg-green-50 p-3 rounded text-xs border border-green-200 whitespace-pre-wrap relative cursor-pointer"
            onClick={() =>
              copyToClipboard(
                selectedSession && TEMPLATES.feedbackParent(selectedSession)
              )
            }
          >
            <div className="font-bold text-green-800 mb-1">
              To. 학부모 (클릭하여 복사)
            </div>
            {selectedSession && TEMPLATES.feedbackParent(selectedSession)}
          </div>
          <Button
            className="w-full"
            onClick={() => {
              setSessions(
                sessions.map((s) =>
                  s.id === selectedSession.id
                    ? { ...s, feedbackStatus: 'sent' }
                    : s
                )
              );
              setModalType(null);
              addNotification('전송 완료 처리됨');
            }}
          >
            전송 완료 처리
          </Button>
        </div>
      </Modal>
    </div>
  );
}
