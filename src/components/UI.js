import React from 'react';
import { Loader, X, Check, Plus } from 'lucide-react';

// --- UI Components ---
export const Button = React.memo(({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon, size = 'md' }) => {
  const sizes = { sm: 'px-4 py-2 text-sm', md: 'px-5 py-3 text-base', lg: 'px-8 py-4 text-xl' };
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95',
    secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:scale-95',
    success: 'bg-green-600 text-white hover:bg-green-700 shadow-md active:scale-95',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 active:scale-95',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200',
    outline: 'border-2 border-blue-600 text-blue-600 bg-white hover:bg-blue-50 active:scale-95', 
    selected: 'bg-blue-600 text-white border-2 border-blue-600 shadow-inner'
  };
  return (
    <button onClick={onClick} className={`rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`} disabled={disabled}>
      {Icon && <Icon size={size === 'sm' ? 18 : 22} />} {children}
    </button>
  );
});

export const Card = ({ children, className = '' }) => <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 ${className}`}>{children}</div>;

export const Badge = React.memo(({ status }) => {
  const styles = { 
    open: 'bg-blue-50 text-blue-700 border border-blue-100', 
    pending: 'bg-yellow-50 text-yellow-700 border border-yellow-100', 
    confirmed: 'bg-green-50 text-green-700 border border-green-100', 
    completed: 'bg-gray-50 text-gray-600 border border-gray-200', 
    cancellation_requested: 'bg-red-50 text-red-700 border border-red-100', 
    addition_requested: 'bg-purple-50 text-purple-700 border border-purple-100' 
  };
  const labels = { open: '예약 가능', pending: '승인 대기', confirmed: '예약 확정', completed: '클리닉 완료', cancellation_requested: '취소 요청', addition_requested: '추가 신청' };
  return <span className={`px-2.5 py-1 rounded-lg text-xs md:text-sm font-bold whitespace-nowrap ${styles[status] || styles.completed}`}>{labels[status] || status}</span>;
});

export const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col scale-100 animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} className="text-gray-400" /></button>
        </div>
        <div className="p-5 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};

export const LoadingSpinner = () => (
  <div className="h-full flex items-center justify-center min-h-[200px]">
    <Loader className="animate-spin text-blue-600" size={40}/>
  </div>
);