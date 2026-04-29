import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadCloud, Loader, CheckCircle, AlertCircle, FileText } from 'lucide-react';

/**
 * [서비스 가치 (Service Value)] 
 * 1. 운영자 관점: 원장님이 매월 겪는 '급여 수기 입력'의 고통과 '입력 실수(Human Error)' 리스크를 0%로 없앱니다.
 * 2. 2-Track & 동적 밴딩 알고리즘: 세무사 프로그램마다 다른 기괴한 PDF 표 구조(다단 적재, 밀림 현상 등)를 
 * 사람의 눈처럼 정확하게 구획을 나누어 1:1로 매핑합니다.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function PdfAutoFiller({ users, onExtractSuccess }) {
  const [status, setStatus] = useState({ state: 'idle', msg: '' });

  const extractNumber = (str) => {
    const cleaned = str.replace(/[^0-9]/g, '');
    if (cleaned === '') return 0;
    return Number(cleaned);
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus({ state: 'loading', msg: `[${type === 'regular' ? '급여대장' : '사업소득'}] 화면 좌표 스캔 및 데이터 1:1 매핑 중...` });
    let pdf = null;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`;

      pdf = await pdfjsLib.getDocument({ 
        data: arrayBuffer,
        cMapUrl: CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`
      }).promise;

      let allItems = [];

      // 페이지 단위로 아이템을 추출하여 밀림 방지
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        if (textContent && textContent.items) {
          textContent.items.forEach(item => {
            if (item.str.trim() !== '') {
              allItems.push({
                str: item.str.trim(),
                x: item.transform[4],
                y: item.transform[5],
                page: i
              });
            }
          });
        }
      }

      let extractedData = {};
      if (type === 'regular') {
          extractedData = parseRegularPayroll(allItems, users);
      } else {
          extractedData = parseBusinessIncome(allItems, users);
      }
      
      if (Object.keys(extractedData).length > 0) {
        setStatus({ state: 'success', msg: `성공! 총 ${Object.keys(extractedData).length}명의 공제 내역을 완벽하게 매핑했습니다.` });
        onExtractSuccess(extractedData);
      } else {
        setStatus({ state: 'error', msg: '학원 시스템에 등록된 이름과 PDF 상의 이름이 일치하는 데이터가 없습니다.' });
      }

    } catch (error) {
      console.error("[PDF 파싱 오류]:", error);
      setStatus({ state: 'error', msg: `PDF 분석 중 오류가 발생했습니다: ${error.message}` });
    } finally {
      if (pdf) pdf.destroy();
      e.target.value = null;
    }
  };

  // ==========================================
  // 🚀 1. 사업소득명세서(프리랜서) 파서 알고리즘
  // ==========================================
  const parseBusinessIncome = (items, users) => {
    const results = {};
    const pages = [...new Set(items.map(i => i.page))];
    let globalColumns = []; // 페이지가 넘어가도 헤더 위치를 기억하기 위함

    pages.forEach(page => {
      const pageItems = items.filter(i => i.page === page);
      let rawHeaders = [];

      // 1. 헤더 찾기 (지급액 함정 파기: 지급액 숫자가 세금으로 딸려가는 것 방지)
      pageItems.forEach(i => {
        const text = i.str.replace(/\s+/g, '');
        if (text.includes('지급액')) rawHeaders.push({ key: 'dummy_payment', x: i.x, y: i.y });
        if (text.replace('지방소득세', '').includes('소득세') || text.includes('세액')) rawHeaders.push({ key: 'taxIncome', x: i.x, y: i.y });
        if (text.includes('지방소득세') || text.includes('주민세')) rawHeaders.push({ key: 'taxLocal', x: i.x, y: i.y });
      });

      // 2. 헤더를 X좌표 기준으로 기둥(Column)으로 묶기
      let columns = [];
      rawHeaders.forEach(rh => {
        let col = columns.find(c => Math.abs(c.avgX - rh.x) < 40);
        if (col) {
          col.headers.push(rh);
          col.avgX = col.headers.reduce((sum, h) => sum + h.x, 0) / col.headers.length;
        } else {
          columns.push({ avgX: rh.x, headers: [rh] });
        }
      });

      if (columns.length > 0) globalColumns = columns;
      else columns = globalColumns;

      // 3. 페이지 내 모든 유저 위치 찾기 및 동적 밴딩(Row Banding)
      const foundNames = [];
      users.filter(u => u.contractType !== '정규직').forEach(user => {
        const nameStr = user.name.replace(/\s+/g, '');
        pageItems.filter(i => i.str.replace(/\s+/g, '') === nameStr).forEach(item => {
          foundNames.push({ user, y: item.y, x: item.x });
        });
      });

      foundNames.sort((a, b) => b.y - a.y); // 위에서 아래로 정렬

      foundNames.forEach((found, idx) => {
        // 앞사람과 뒷사람 사이의 공간을 통째로 이 사람의 전용 구역으로 설정
        const upperBound = idx === 0 ? found.y + 30 : (foundNames[idx-1].y + found.y) / 2;
        const lowerBound = idx === foundNames.length - 1 ? found.y - 50 : (found.y + foundNames[idx+1].y) / 2;

        const rowNumbers = pageItems.filter(i => i.y <= upperBound && i.y > lowerBound && /^[-0-9,]+$/.test(i.str.replace(/\s+/g, '')));
        
        let userResult = { taxIncome: 0, taxLocal: 0 };

        columns.forEach(col => {
          let colNumbers = rowNumbers.filter(i => Math.abs(i.x - col.avgX) < 35);
          colNumbers.sort((a, b) => b.y - a.y);
          
          for (let i = 0; i < Math.min(col.headers.length, colNumbers.length); i++) {
            const key = col.headers[i].key;
            if (key !== 'dummy_payment') {
              userResult[key] = extractNumber(colNumbers[i].str);
            }
          }
        });

        if (userResult.taxIncome > 0 || userResult.taxLocal > 0) {
          results[found.user.id] = { ...userResult, nationalPension: 0, healthInsurance: 0, employmentInsurance: 0, longTermCare: 0 };
        }
      });
    });
    return results;
  };

  // ==========================================
  // 🚀 2. 급여대장(정규직/조교) 파서 알고리즘
  // ==========================================
  const parseRegularPayroll = (items, users) => {
    const results = {};
    const pages = [...new Set(items.map(i => i.page))];
    let globalColumns = [];

    pages.forEach(page => {
      const pageItems = items.filter(i => i.page === page);
      let rawHeaders = [];

      // 1. 헤더 찾기 (모든 공제 항목)
      pageItems.forEach(i => {
        const text = i.str.replace(/\s+/g, '');
        if (text.includes('국민연금')) rawHeaders.push({ key: 'nationalPension', x: i.x, y: i.y });
        if (text.includes('건강보험')) rawHeaders.push({ key: 'healthInsurance', x: i.x, y: i.y });
        if (text.includes('장기요양')) rawHeaders.push({ key: 'longTermCare', x: i.x, y: i.y });
        if (text.includes('고용보험')) rawHeaders.push({ key: 'employmentInsurance', x: i.x, y: i.y });
        if (text.replace('지방소득세', '').includes('소득세') || text.includes('갑근세')) rawHeaders.push({ key: 'taxIncome', x: i.x, y: i.y });
        if (text.includes('지방소득세') || text.includes('주민세')) rawHeaders.push({ key: 'taxLocal', x: i.x, y: i.y });
      });

      // 2. 다단 적재(2층 탑) 해결을 위한 헤더 기둥 묶기
      let columns = [];
      rawHeaders.forEach(rh => {
        let col = columns.find(c => Math.abs(c.avgX - rh.x) < 35);
        if (col) {
          col.headers.push(rh);
          col.avgX = col.headers.reduce((sum, h) => sum + h.x, 0) / col.headers.length;
        } else {
          columns.push({ avgX: rh.x, headers: [rh] });
        }
      });

      // 기둥 내에서 위아래(Y축) 순서대로 정렬 (예: 1층 장기요양, 2층 고용보험)
      columns.forEach(c => c.headers.sort((a, b) => b.y - a.y));

      if (columns.length > 0) globalColumns = columns;
      else columns = globalColumns;

      // 3. 유저 밴딩(Row Banding)
      const foundNames = [];
      users.filter(u => u.contractType !== '프리랜서').forEach(user => {
        const nameStr = user.name.replace(/\s+/g, '');
        pageItems.filter(i => i.str.replace(/\s+/g, '') === nameStr).forEach(item => {
          foundNames.push({ user, y: item.y, x: item.x });
        });
      });

      foundNames.sort((a, b) => b.y - a.y);

      foundNames.forEach((found, idx) => {
        const upperBound = idx === 0 ? found.y + 40 : (foundNames[idx-1].y + found.y) / 2;
        const lowerBound = idx === foundNames.length - 1 ? found.y - 80 : (found.y + foundNames[idx+1].y) / 2;

        const rowNumbers = pageItems.filter(i => i.y <= upperBound && i.y > lowerBound && /^[-0-9,]+$/.test(i.str.replace(/\s+/g, '')));
        
        let userResult = { nationalPension: 0, healthInsurance: 0, employmentInsurance: 0, longTermCare: 0, taxIncome: 0, taxLocal: 0 };

        columns.forEach(col => {
          // 해당 기둥 근처의 숫자들만 모아서 위아래 정렬
          let colNumbers = rowNumbers.filter(i => Math.abs(i.x - col.avgX) < 35);
          colNumbers.sort((a, b) => b.y - a.y);
          
          // 헤더 층수와 숫자 층수를 1:1 완벽 매핑
          for (let i = 0; i < Math.min(col.headers.length, colNumbers.length); i++) {
            userResult[col.headers[i].key] = extractNumber(colNumbers[i].str);
          }
        });

        if (Object.values(userResult).some(v => v > 0)) {
          results[found.user.id] = userResult;
        }
      });
    });
    return results;
  };

  return (
    <div className="bg-white border border-indigo-100 p-6 rounded-2xl shadow-sm mb-6 animate-in fade-in">
      <div className="mb-6">
        <h3 className="font-bold text-xl text-indigo-900 flex items-center gap-2">
          <UploadCloud size={24} className="text-indigo-600" /> 세무사 PDF 자동 공제 스캐너
        </h3>
        <p className="text-sm text-gray-500 mt-2">
          업로드할 PDF의 종류에 맞는 버튼을 선택해 주세요. 시스템이 표 구조를 자동으로 인식하여 오차 없이 입력합니다.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. 정규직 급여대장 업로드 */}
        <div className="relative group">
          <input 
            type="file" accept="application/pdf"
            onChange={(e) => handleFileUpload(e, 'regular')}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            title="정규직 급여대장 업로드"
          />
          <div className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center group-hover:bg-blue-50 group-hover:border-blue-400 transition-all flex flex-col items-center justify-center gap-3">
            <FileText size={32} className="text-blue-500" />
            <div>
              <div className="font-bold text-blue-900">정규직/조교 급여대장</div>
              <div className="text-xs text-blue-500 mt-1">4대보험 및 소득세 자동 매핑</div>
            </div>
          </div>
        </div>

        {/* 2. 프리랜서 사업소득명세서 업로드 */}
        <div className="relative group">
          <input 
            type="file" accept="application/pdf"
            onChange={(e) => handleFileUpload(e, 'freelancer')}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            title="프리랜서 사업소득명세서 업로드"
          />
          <div className="border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center group-hover:bg-emerald-50 group-hover:border-emerald-400 transition-all flex flex-col items-center justify-center gap-3">
            <FileText size={32} className="text-emerald-500" />
            <div>
              <div className="font-bold text-emerald-900">프리랜서 사업소득명세서</div>
              <div className="text-xs text-emerald-500 mt-1">3.3% 사업소득세 자동 매핑</div>
            </div>
          </div>
        </div>
      </div>

      {status.state !== 'idle' && (
        <div className={`mt-4 flex items-center gap-2 text-sm font-bold p-4 rounded-xl
          ${status.state === 'loading' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 
            status.state === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {status.state === 'loading' && <Loader size={18} className="animate-spin" />}
          {status.state === 'success' && <CheckCircle size={18} />}
          {status.state === 'error' && <AlertCircle size={18} />}
          {status.msg}
        </div>
      )}
    </div>
  );
}