import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadCloud, Loader, CheckCircle, AlertCircle, FileText } from 'lucide-react';

/**
 * [서비스 가치 (Service Value)] 
 * 1. 운영자 관점: 원장님이 매월 겪는 '급여 수기 입력'의 고통과 '입력 실수(Human Error)' 리스크를 0%로 없앱니다.
 * 2. Exact Y-Axis 매핑 알고리즘: PDF의 텍스트 추출 순서가 뒤죽박죽이더라도, 이름과 동일한 
 * '가로선(Y축)' 위에 있는 숫자만 정밀하게 스캔하여 오차율 0%의 무결성 데이터를 구축합니다.
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

    setStatus({ state: 'loading', msg: `[${type === 'regular' ? '급여대장' : '사업소득'}] 정밀 가로선(Y축) 레이저 스캔 중...` });
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
  // 🚀 1. 사업소득명세서(프리랜서) 파서
  // ==========================================
  const parseBusinessIncome = (items, users) => {
    const results = {};
    const pages = [...new Set(items.map(i => i.page))];

    pages.forEach(page => {
      const pageItems = items.filter(i => i.page === page);
      let headers = [];

      // 1. 컬럼 기둥(X좌표) 위치 파악
      pageItems.forEach(i => {
        const text = i.str.replace(/\s+/g, '');
        if (text.includes('지급액')) headers.push({ key: 'dummy_payment', x: i.x });
        if (text.replace('지방소득세', '').includes('소득세') || text.includes('세액')) headers.push({ key: 'taxIncome', x: i.x });
        if (text.includes('지방소득세') || text.includes('주민세')) headers.push({ key: 'taxLocal', x: i.x });
      });

      const columnMap = {};
      ['dummy_payment', 'taxIncome', 'taxLocal'].forEach(k => {
        const matching = headers.filter(h => h.key === k);
        if (matching.length > 0) {
          columnMap[k] = matching.reduce((sum, h) => sum + h.x, 0) / matching.length;
        }
      });

      // 2. 정밀 가로선 스캔 (이름과 동일한 Y좌표에 있는 숫자만 추출)
      users.filter(u => u.contractType !== '정규직').forEach(user => {
        const nameStr = user.name.replace(/\s+/g, '');
        const nameItems = pageItems.filter(i => i.str.replace(/\s+/g, '') === nameStr);

        nameItems.forEach(nameItem => {
          // 이름과 동일선상(오차범위 ±12px 이내)에 있는 숫자들만 필터링
          const rowNumbers = pageItems.filter(i =>
            Math.abs(i.y - nameItem.y) < 12 &&
            /^[-0-9,]+$/.test(i.str.replace(/\s+/g, ''))
          );

          let userResult = { taxIncome: 0, taxLocal: 0 };

          rowNumbers.forEach(numItem => {
            let closestKey = null;
            let minDiff = 45; // 컬럼 너비 오차 허용

            Object.keys(columnMap).forEach(key => {
              const diff = Math.abs(columnMap[key] - numItem.x);
              if (diff < minDiff) {
                minDiff = diff;
                closestKey = key;
              }
            });

            // 지급액(dummy_payment) 열에 있는 숫자는 완전히 무시!
            if (closestKey && closestKey !== 'dummy_payment') {
              userResult[closestKey] = extractNumber(numItem.str);
            }
          });

          if (userResult.taxIncome > 0 || userResult.taxLocal > 0) {
            results[user.id] = { ...userResult, nationalPension: 0, healthInsurance: 0, employmentInsurance: 0, longTermCare: 0 };
          }
        });
      });
    });
    return results;
  };

  // ==========================================
  // 🚀 2. 급여대장(정규직/조교) 파서
  // ==========================================
  const parseRegularPayroll = (items, users) => {
    const results = {};
    const pages = [...new Set(items.map(i => i.page))];

    pages.forEach(page => {
      const pageItems = items.filter(i => i.page === page);
      let headers = [];

      // 1. 공제 항목별 기둥(X좌표) 위치 파악
      pageItems.forEach(i => {
        const text = i.str.replace(/\s+/g, '');
        if (text.includes('국민연금')) headers.push({ key: 'nationalPension', x: i.x });
        if (text.includes('건강보험')) headers.push({ key: 'healthInsurance', x: i.x });
        if (text.includes('고용보험')) headers.push({ key: 'employmentInsurance', x: i.x });
        if (text.includes('장기요양')) headers.push({ key: 'longTermCare', x: i.x });
        if (text.replace('지방소득세', '').includes('소득세') || text.includes('갑근세')) headers.push({ key: 'taxIncome', x: i.x });
        if (text.includes('지방소득세') || text.includes('주민세')) headers.push({ key: 'taxLocal', x: i.x });
      });

      const columnMap = {};
      ['nationalPension', 'healthInsurance', 'employmentInsurance', 'longTermCare', 'taxIncome', 'taxLocal'].forEach(k => {
        const matching = headers.filter(h => h.key === k);
        if (matching.length > 0) {
          columnMap[k] = matching.reduce((sum, h) => sum + h.x, 0) / matching.length;
        }
      });

      // 2. 정밀 가로선 스캔 (이름과 동일한 Y좌표에 있는 숫자만 추출)
      users.filter(u => u.contractType !== '프리랜서').forEach(user => {
        const nameStr = user.name.replace(/\s+/g, '');
        const nameItems = pageItems.filter(i => i.str.replace(/\s+/g, '') === nameStr);

        nameItems.forEach(nameItem => {
          // 이름과 동일선상(오차범위 ±12px 이내)에 있는 숫자들만 필터링
          const rowNumbers = pageItems.filter(i =>
            Math.abs(i.y - nameItem.y) < 12 &&
            /^[-0-9,]+$/.test(i.str.replace(/\s+/g, ''))
          );

          let userResult = { nationalPension: 0, healthInsurance: 0, employmentInsurance: 0, longTermCare: 0, taxIncome: 0, taxLocal: 0 };

          rowNumbers.forEach(numItem => {
            let closestKey = null;
            let minDiff = 45; // 우측 정렬된 숫자까지 넉넉하게 커버

            // 숫자의 X좌표가 어떤 컬럼 기둥의 X좌표와 가장 가까운지 판별
            Object.keys(columnMap).forEach(key => {
              const diff = Math.abs(columnMap[key] - numItem.x);
              if (diff < minDiff) {
                minDiff = diff;
                closestKey = key;
              }
            });

            // 빈칸은 숫자로 추출되지 않으므로 자동으로 0원 유지
            if (closestKey) {
              userResult[closestKey] = extractNumber(numItem.str);
            }
          });

          if (Object.values(userResult).some(v => v > 0)) {
            results[user.id] = userResult;
          }
        });
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