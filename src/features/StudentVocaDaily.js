/* [서비스 가치] 스마트 아날로그 Voca 엔진의 클라이언트 포털.
   학생은 꼼수 없는 100% 종이 시험지를 출력하고, 앱에서는 당일 할당된 단어 리스트만 직관적으로 확인합니다. */
import React from 'react';
import { Printer, BookOpen, Clock, AlertCircle, FileText, Download } from 'lucide-react';

const StudentVocaDaily = ({ currentUser }) => {
  // 추후 englishStatManager 및 vocaEngine에서 데이터를 끌어올 예정입니다.
  const isPending = false; // 임시: 단어 세팅 대기 상태

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 animate-in fade-in pb-20">
      
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[32px] p-8 sm:p-10 text-white shadow-lg mb-8 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-black mb-3 flex items-center gap-3">
            <BookOpen size={36} /> 오늘의 영단어 미션
          </h1>
          <p className="text-blue-100 font-bold text-sm sm:text-base max-w-xl break-keep">
            에빙하우스 망각 주기에 맞춰 오늘 반드시 외워야 할 맞춤형 단어들이 세팅되었습니다. 
            시험지를 출력하여 스마트 아날로그 방식으로 학습을 시작하세요.
          </p>
        </div>
        <BookOpen className="absolute -right-10 -bottom-10 text-white/10 w-64 h-64 rotate-12 pointer-events-none" />
      </div>

      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <button 
          onClick={() => window.print()}
          className="flex-1 bg-white border-2 border-indigo-100 p-6 rounded-[24px] shadow-sm hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center justify-center text-indigo-600 group"
        >
          <div className="bg-indigo-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
            <Printer size={32} />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">오늘의 시험지 인쇄하기</h3>
          <p className="text-sm font-bold text-slate-500">A4 용지 규격 최적화</p>
        </button>

        <button 
          className="flex-1 bg-white border-2 border-emerald-100 p-6 rounded-[24px] shadow-sm hover:border-emerald-400 hover:shadow-md transition-all flex flex-col items-center justify-center text-emerald-600 group"
        >
          <div className="bg-emerald-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
            <Download size={32} />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">단어장 PDF 다운로드</h3>
          <p className="text-sm font-bold text-slate-500">태블릿 및 스마트폰 열람용</p>
        </button>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="text-indigo-500" /> 오늘 할당된 단어 리스트
          </h2>
          <span className="bg-slate-100 text-slate-600 font-bold px-4 py-1.5 rounded-full text-sm">
            총 0 단어 (준비중)
          </span>
        </div>

        {isPending ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Clock size={48} className="mb-4 text-slate-300" />
            <p className="font-bold">아직 오늘의 단어가 배정되지 않았습니다.</p>
          </div>
        ) : (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-10 text-center">
            <p className="text-slate-500 font-bold mb-2">🚀 Voca 출제 알고리즘 연결 대기중</p>
            <p className="text-sm text-slate-400">곧 이 공간에 학생 개인의 취약점에 맞춘 단어 리스트가 렌더링됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentVocaDaily;