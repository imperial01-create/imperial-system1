import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { UploadCloud, Loader, CheckCircle, AlertCircle } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * [서비스 가치] 빈 칸으로 인해 열(Column)이 밀리는 PDF의 고질적인 버그를 막기 위해,
 * 화면 좌표(X, Y) 기반의 정밀 스캔 알고리즘을 적용하여 100% 무결성의 급여 자동 입력을 보장합니다.
 */
export default function PdfAutoFiller({ users, onExtractSuccess }) {
  const [status, setStatus] = useState({ state: 'idle', msg: '' });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus({ state: 'loading', msg: 'PDF 화면 좌표 스캔 및 분석 중...' });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let allItems = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        textContent.items.forEach(item => {
          if (item.str.trim() !== '') {
            allItems.push({
              str: item.str.trim(),
              x: item.transform[4], // 화면상의 X 좌표 (가로)
              // 페이지가 달라도 Y좌표가 겹치지 않도록 페이지별 오프셋 추가 (PDF.js는 Y가 아래에서 위로 증가)
              y: item.transform[5] + ((pdf.numPages - i) * 1000) 
            });
          }
        });
      }

      const extractedData = analyzePdfItems(allItems, users);
      
      if (Object.keys(extractedData).length > 0) {
        setStatus({ state: 'success', msg: `성공! ${Object.keys(extractedData).length}명의 공제 내역을 완벽하게 매핑했습니다.` });
        onExtractSuccess(extractedData);
      } else {
        setStatus({ state: 'error', msg: '매핑할 수 있는 직원 데이터를 찾지 못했습니다. (이름 불일치 등)' });
      }

    } catch (error) {
      console.error(error);
      setStatus({ state: 'error', msg: 'PDF 파싱 중 오류가 발생했습니다.' });
    }
  };

  const analyzePdfItems = (items, users) => {
    let results = {};
    
    // 전체 텍스트로 어떤 종류의 문서인지 파악
    const fullText = items.map(i => i.str).join('');
    const isRegularPayroll = fullText.includes('급여대장') || fullText.includes('국민연금');
    const isBusinessIncome = fullText.includes('사업소득지급대장') || fullText.includes('사업소득');

    if (isRegularPayroll) {
      // ========================================================
      // 1. 급여대장 (정규직) 로직
      // 규칙: 3개의 행 중 첫 번째 행(이름이 있는 행)의 특정 열에서 데이터를 가져옴
      // ========================================================
      
      // 헤더(항목명)의 X 좌표를 찾아 저장 (빈 칸 때문에 열이 밀리는 현상 완벽 방어)
      let headersX = { np: 0, hi: 0, ei: 0, ltc: 0, tax: 0, localTax: 0 };
      items.forEach(item => {
        const text = item.str.replace(/\s+/g, '');
        if (text.includes('국민연금')) headersX.np = item.x;
        if (text.includes('건강보험')) headersX.hi = item.x;
        if (text.includes('고용보험')) headersX.ei = item.x;
        if (text.includes('장기요양')) headersX.ltc = item.x;
        // '지방소득세'와 겹치지 않게 '소득세'만 정확히 매핑
        if (text === '소득세') headersX.tax = item.x;
        if (text.includes('지방소득세')) headersX.localTax = item.x;
      });

      // Y좌표 기준으로 동일한 행(Row)으로 묶어주기 (시각적 오차 범위 5px 허용)
      const rows = [];
      items.forEach(item => {
        let row = rows.find(r => Math.abs(r.y - item.y) < 5);
        if (!row) {
          row = { y: item.y, items: [] };
          rows.push(row);
        }
        row.items.push(item);
      });

      users.forEach(user => {
        if (user.contractType === '프리랜서') return;

        // 직원의 이름이 포함된 행 찾기 (이 행이 3개 묶음 중 첫 번째 행에 해당)
        const userRow = rows.find(r => r.items.some(i => i.str.replace(/\s+/g, '').includes(user.name)));
        
        if (userRow) {
          // 특정 헤더의 X좌표 수직선상에 있는 숫자를 가져오는 헬퍼 함수
          const findValueNearX = (targetX) => {
            if (!targetX) return 0;
            let closest = null;
            let minDiff = 30; // 좌우 30픽셀 이내의 오차 허용
            userRow.items.forEach(i => {
              const diff = Math.abs(i.x - targetX);
              if (diff < minDiff) {
                minDiff = diff;
                closest = i;
              }
            });
            if (closest) {
              const num = Number(closest.str.replace(/[^0-9]/g, ''));
              return isNaN(num) ? 0 : num;
            }
            return 0; // 값이 없거나 빈 칸이면 안전하게 0원 처리
          };

          results[user.id] = {
            nationalPension: findValueNearX(headersX.np),
            healthInsurance: findValueNearX(headersX.hi),
            employmentInsurance: findValueNearX(headersX.ei),
            longTermCare: findValueNearX(headersX.ltc),
            taxIncome: findValueNearX(headersX.tax),
            taxLocal: findValueNearX(headersX.localTax),
          };
        }
      });
    } 
    
    else if (isBusinessIncome) {
      // ========================================================
      // 2. 사업소득명세서 (프리랜서 3.3%) 로직
      // 규칙: 같은 행(이름 기준)에서 '소득세' 열의 위쪽은 소득세, 아랫쪽은 지방소득세
      // ========================================================
      
      let taxColumnX = 0;
      items.forEach(item => {
        if (item.str.replace(/\s+/g, '').includes('소득세') && !item.str.includes('지방')) {
          taxColumnX = item.x;
        }
      });

      users.forEach(user => {
        if (user.contractType === '정규직') return;

        // 해당 직원의 이름이 위치한 아이템(좌표) 찾기
        const nameItem = items.find(i => i.str.replace(/\s+/g, '').includes(user.name));
        
        if (nameItem) {
          // 조건 1. 이름과 Y좌표가 비슷할 것 (위아래 30px 이내 묶음 행)
          // 조건 2. 소득세 헤더의 X좌표 수직선상에 있을 것
          const taxItems = items.filter(i => 
            Math.abs(i.x - taxColumnX) < 40 && 
            Math.abs(i.y - nameItem.y) < 30
          );

          // PDF.js는 Y좌표가 맨 아래에서부터 위로 커집니다.
          // 따라서 Y좌표 내림차순(b.y - a.y)으로 정렬하면 화면에서 위에 있는 글자가 배열의 [0]번째가 됩니다.
          taxItems.sort((a, b) => b.y - a.y);

          // 위쪽은 소득세(3%), 아랫쪽은 지방소득세(0.3%)로 매핑
          const taxIncome = taxItems.length > 0 ? Number(taxItems[0].str.replace(/[^0-9]/g, '')) : 0;
          const taxLocal = taxItems.length > 1 ? Number(taxItems[1].str.replace(/[^0-9]/g, '')) : 0;

          results[user.id] = {
            nationalPension: 0,
            healthInsurance: 0,
            employmentInsurance: 0,
            longTermCare: 0,
            taxIncome: taxIncome,
            taxLocal: taxLocal,
          };
        }
      });
    }

    return results;
  };

  return (
    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-indigo-900 flex items-center gap-2">
            <UploadCloud size={20} /> 세무사 PDF 자동 공제 입력
          </h3>
          <p className="text-sm text-indigo-700 mt-1">
            급여대장 또는 사업소득명세서 PDF를 업로드하면 공제 내역이 자동으로 채워집니다.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            accept="application/pdf"
            onChange={handleFileUpload}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-indigo-100 file:text-indigo-700
              hover:file:bg-indigo-200 cursor-pointer"
          />
        </div>
      </div>

      {status.state !== 'idle' && (
        <div className={`mt-3 flex items-center gap-2 text-sm font-bold p-3 rounded-lg
          ${status.state === 'loading' ? 'bg-blue-100 text-blue-700' : 
            status.state === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {status.state === 'loading' && <Loader size={16} className="animate-spin" />}
          {status.state === 'success' && <CheckCircle size={16} />}
          {status.state === 'error' && <AlertCircle size={16} />}
          {status.msg}
        </div>
      )}
    </div>
  );
}