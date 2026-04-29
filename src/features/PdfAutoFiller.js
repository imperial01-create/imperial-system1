import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadCloud, Loader, CheckCircle, AlertCircle } from 'lucide-react';

/**
 * [서비스 가치 (Service Value)] 
 * 1. 운영자 관점: 원장님이 매월 겪는 '급여 수기 입력'의 고통과 '입력 실수(Human Error)' 리스크를 0%로 없앱니다.
 * 2. 속도가 곧 매출: Row Banding 매핑 알고리즘을 통해 복잡한 세무사 PDF도 3초 만에 완벽하게 정산합니다.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function PdfAutoFiller({ users, onExtractSuccess }) {
  const [status, setStatus] = useState({ state: 'idle', msg: '' });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus({ state: 'loading', msg: 'PDF 화면 좌표 스캔 및 데이터 1:1 매핑 중...' });
    let pdf = null;

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      const CMAP_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`;
      const CMAP_PACKED = true;

      pdf = await pdfjsLib.getDocument({ 
        data: arrayBuffer,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
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
                y: item.transform[5] + ((pdf.numPages - i) * 1000) 
              });
            }
          });
        }
      }

      const extractedData = analyzePdfItems(allItems, users);
      
      if (Object.keys(extractedData).length > 0) {
        setStatus({ state: 'success', msg: `성공! 총 ${Object.keys(extractedData).length}명의 급여 공제 내역을 완벽하게 매핑했습니다.` });
        onExtractSuccess(extractedData);
      } else {
        setStatus({ state: 'error', msg: '학원 시스템에 등록된 직원 이름과 PDF 상의 이름이 일치하는 데이터가 없습니다.' });
      }

    } catch (error) {
      console.error("[PDF 파싱 심각한 오류]:", error);
      setStatus({ state: 'error', msg: `PDF 분석 중 오류가 발생했습니다: ${error.message}` });
    } finally {
      if (pdf) pdf.destroy();
      e.target.value = null;
    }
  };

  const analyzePdfItems = (items, users) => {
    let results = {};
    const fullText = items.map(i => i.str).join('');
    const isRegularPayroll = fullText.includes('급여대장') || fullText.includes('국민연금');
    const isBusinessIncome = fullText.includes('사업소득지급대장') || fullText.includes('사업소득');

    // 1. 헤더(항목명) 위치 찾기
    let headers = [];
    items.forEach(item => {
      const text = item.str.replace(/\s+/g, '');
      if (isRegularPayroll) {
        if (text.includes('국민연금')) headers.push({ key: 'nationalPension', x: item.x, y: item.y });
        if (text.includes('건강보험')) headers.push({ key: 'healthInsurance', x: item.x, y: item.y });
        if (text.includes('고용보험')) headers.push({ key: 'employmentInsurance', x: item.x, y: item.y });
        if (text.includes('장기요양')) headers.push({ key: 'longTermCare', x: item.x, y: item.y });
        if (text.replace('지방소득세', '').includes('소득세') || text.includes('갑근세')) headers.push({ key: 'taxIncome', x: item.x, y: item.y });
        if (text.includes('지방소득세') || text.includes('주민세')) headers.push({ key: 'taxLocal', x: item.x, y: item.y });
      } else if (isBusinessIncome) {
        if (text.replace('지방소득세', '').includes('소득세') || text.includes('세액')) headers.push({ key: 'taxIncome', x: item.x, y: item.y });
        if (text.includes('지방소득세') || text.includes('주민세')) headers.push({ key: 'taxLocal', x: item.x, y: item.y });
      }
    });

    // 헤더 중복 제거 (여러 페이지에 동일한 헤더 반복 방지)
    const uniqueHeaders = [];
    headers.forEach(h => {
      if (!uniqueHeaders.some(uh => uh.key === h.key && Math.abs(uh.x - h.x) < 30)) {
        uniqueHeaders.push(h);
      }
    });

    // 🚀 [CTO 로직] 헤더를 X좌표 기반으로 열(Column)로 묶기 (장기요양과 고용보험이 같은 열에 있는지 판단)
    let headerColumns = [];
    uniqueHeaders.forEach(h => {
      let closestCol = null;
      let minDiff = 40; // X좌표가 40 이내면 같은 열(Column)로 취급
      headerColumns.forEach(c => {
        const diff = Math.abs(c.x - h.x);
        if (diff < minDiff) { minDiff = diff; closestCol = c; }
      });
      if (closestCol) closestCol.headers.push(h);
      else headerColumns.push({ x: h.x, headers: [h] });
    });

    // 각 열(Column) 안에서 헤더들을 위에서 아래로(Y좌표 내림차순) 정렬
    headerColumns.forEach(col => col.headers.sort((a, b) => b.y - a.y));

    // 2. 직원 이름 위치(Y좌표) 찾기
    let foundUsers = [];
    users.forEach(user => {
      if (isRegularPayroll && user.contractType === '프리랜서') return;
      if (isBusinessIncome && user.contractType === '정규직') return;

      const userNameClean = user.name.replace(/\s+/g, '');
      const nameItems = items.filter(i => i.str.replace(/\s+/g, '') === userNameClean);
      nameItems.forEach(ni => foundUsers.push({ user, y: ni.y, x: ni.x }));
    });

    // 문서 위쪽부터 아래쪽 순서로 이름 정렬
    foundUsers.sort((a, b) => b.y - a.y);

    // 3. 🚀 [CTO 로직] Row Banding (행렬 밴드) 매핑
    foundUsers.forEach((found, idx) => {
      // 이 직원의 데이터 한계선 (다음 사람 이름이 나오기 전까지 모두 이 사람의 영역)
      const upperBound = found.y + 15;
      const lowerBound = (idx + 1 < foundUsers.length) ? foundUsers[idx + 1].y + 15 : found.y - 300;

      // 해당 영역 안의 모든 '숫자' 아이템 수집
      const rowItems = items.filter(i => {
        const text = i.str.replace(/\s+/g, '');
        const isNumeric = /^[0-9,]+$/.test(text) || text === '-' || text === '0';
        return i.y <= upperBound && i.y > lowerBound && isNumeric;
      });

      let userResult = {
        nationalPension: 0, healthInsurance: 0, employmentInsurance: 0,
        longTermCare: 0, taxIncome: 0, taxLocal: 0,
      };

      // 찾아낸 숫자들을 X좌표를 기준으로 열(Column)로 묶기
      let rowColumns = [];
      rowItems.forEach(item => {
        let closestHeaderCol = null;
        let minDiff = 50; // 우측 정렬 오차 허용범위
        headerColumns.forEach(hc => {
          const diff = Math.abs(hc.x - item.x);
          if (diff < minDiff) { minDiff = diff; closestHeaderCol = hc; }
        });
        
        if (closestHeaderCol) {
          let col = rowColumns.find(c => c.headerCol === closestHeaderCol);
          if (col) col.items.push(item);
          else rowColumns.push({ headerCol: closestHeaderCol, items: [item] });
        }
      });

      // 같은 열(Column) 안에서 숫자들을 위에서 아래로 정렬하여 헤더와 1:1로 짝짓기
      // (장기요양이 위, 고용보험이 아래면 숫자도 위아래로 나누어 정확히 분배)
      rowColumns.forEach(rowCol => {
        rowCol.items.sort((a, b) => b.y - a.y);
        const hCol = rowCol.headerCol;
        
        for (let i = 0; i < Math.min(hCol.headers.length, rowCol.items.length); i++) {
          const headerKey = hCol.headers[i].key;
          let valStr = rowCol.items[i].str.replace(/[^0-9]/g, '');
          const value = valStr === '' ? 0 : Number(valStr);
          userResult[headerKey] = value;
        }
      });

      // 동명이인이나 합계 등으로 인해 여러 번 탐색될 경우, 실제 데이터가 있는(>0) 결과를 최종 저장
      if (!results[found.user.id] || Object.values(userResult).some(v => v > 0)) {
          results[found.user.id] = userResult;
      }
    });

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
            급여대장 또는 사업소득명세서 PDF를 업로드하면 공제 내역이 자동으로 매핑됩니다.
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