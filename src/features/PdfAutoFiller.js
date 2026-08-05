import React, { useState, useMemo, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadCloud, Loader, CheckCircle, AlertCircle, FileText, AlertTriangle, Download, Users } from 'lucide-react';
import { Button, Modal } from '../components/UI';
import {
  parsePayrollRegister, verifyTotals, matchEmployees,
  isAmountLike, parseAmount, isDateLike, FIELD_LABELS,
} from '../utils/payrollPdf';

/**
 * [세무사 PDF 자동 공제 스캐너]
 *
 * 매달 세무사가 보내주는 급여대장 PDF를 읽어 공제 내역을 채웁니다.
 *
 * 이 화면의 원칙은 하나입니다 — **확인 전에는 저장하지 않는다.**
 * 급여는 실제로 돈이 나가는 곳이라, 잘못 읽힌 숫자가 조용히 저장되는 것이
 * 읽기에 실패하는 것보다 훨씬 위험합니다.
 * 그래서 읽어들인 표를 먼저 그대로 보여주고, 급여대장 자체의 검산식
 * (공제 6종 합 = 공제합계, 지급합계 − 공제합계 = 차인지급액, 개인합 = 맨 아래 합계)
 * 을 통과한 사람만 '적용' 대상이 됩니다.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');

const PREVIEW_COLUMNS = [
  'baseSalary', 'allowance', 'grossTotal',
  'nationalPension', 'healthInsurance', 'employmentInsurance',
  'longTermCare', 'taxIncome', 'taxLocal', 'deductionTotal', 'netPay',
];

// ────────────────────────────────────────────────────────────
// 사업소득명세서 파서
// 급여대장과 서식이 완전히 달라(사람마다 세로 폭이 들쭉날쭉) 기존 로직을 유지하되,
// 날짜를 금액으로 잘못 읽는 문제와 음수 미처리만 바로잡았습니다.
// ────────────────────────────────────────────────────────────
const parseBusinessIncome = (items) => {
  const results = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  let globalColumns = [];

  pages.forEach((page) => {
    const pageItems = items.filter((i) => i.page === page);
    const rawHeaders = [];

    pageItems.forEach((i) => {
      const text = String(i.str).replace(/\s+/g, '');
      if (text.includes('지급액')) rawHeaders.push({ key: 'dummy_payment', x: i.x, y: i.y });
      if (text.replace('지방소득세', '').includes('소득세') || text.includes('세액')) rawHeaders.push({ key: 'taxIncome', x: i.x, y: i.y });
      if (text.includes('지방소득세') || text.includes('주민세')) rawHeaders.push({ key: 'taxLocal', x: i.x, y: i.y });
    });

    let columns = [];
    rawHeaders.forEach((rh) => {
      const col = columns.find((c) => Math.abs(c.avgX - rh.x) < 50);
      if (col) {
        col.headers.push(rh);
        col.avgX = col.headers.reduce((sum, h) => sum + h.x, 0) / col.headers.length;
      } else {
        columns.push({ avgX: rh.x, headers: [rh] });
      }
    });
    columns.forEach((c) => c.headers.sort((a, b) => b.y - a.y));

    if (columns.length > 0) globalColumns = columns;
    else columns = globalColumns;
    if (columns.length === 0) return;

    // 사람 이름 후보: 숫자도 날짜도 아닌 2~4글자 한글
    const nameItems = pageItems
      .filter((i) => /^[가-힣]{2,4}$/.test(String(i.str).replace(/\s+/g, '')))
      .map((i) => ({ name: String(i.str).replace(/\s+/g, ''), y: i.y, x: i.x }))
      .sort((a, b) => b.y - a.y);

    nameItems.forEach((found, idx) => {
      const upperBound = idx === 0 ? found.y + 40 : (nameItems[idx - 1].y + found.y) / 2;
      const lowerBound = idx === nameItems.length - 1 ? found.y - 80 : (found.y + nameItems[idx + 1].y) / 2;

      const rowNumbers = pageItems.filter(
        (i) => i.y <= upperBound && i.y > lowerBound && isAmountLike(i.str) && !isDateLike(i.str)
      );

      const amounts = { taxIncome: 0, taxLocal: 0 };
      const rowColumns = [];

      rowNumbers.forEach((numItem) => {
        let closest = null;
        let minDiff = 80;
        columns.forEach((hc) => {
          const diff = Math.abs(hc.avgX - numItem.x);
          if (diff < minDiff) { minDiff = diff; closest = hc; }
        });
        if (!closest) return;
        const col = rowColumns.find((c) => c.headerCol === closest);
        if (col) col.items.push(numItem);
        else rowColumns.push({ headerCol: closest, items: [numItem] });
      });

      rowColumns.forEach((rowCol) => {
        rowCol.items.sort((a, b) => b.y - a.y);
        const hCol = rowCol.headerCol;
        for (let i = 0; i < Math.min(hCol.headers.length, rowCol.items.length); i += 1) {
          const key = hCol.headers[i].key;
          if (key !== 'dummy_payment') amounts[key] = parseAmount(rowCol.items[i].str);
        }
      });

      if (amounts.taxIncome !== 0 || amounts.taxLocal !== 0) {
        results.push({
          page,
          name: found.name,
          employeeNo: '',
          hireDate: '',
          amounts: {
            baseSalary: 0, allowance: 0, grossTotal: 0,
            nationalPension: 0, healthInsurance: 0, employmentInsurance: 0, longTermCare: 0,
            taxIncome: amounts.taxIncome, taxLocal: amounts.taxLocal,
            deductionTotal: amounts.taxIncome + amounts.taxLocal, netPay: 0,
          },
          checks: [],
          ok: true,
          hasSoftWarning: false,
        });
      }
    });
  });

  return { employees: results, totals: null, warnings: [], axisFound: results.length > 0 };
};

// ────────────────────────────────────────────────────────────

export default function PdfAutoFiller({ users, onExtractSuccess }) {
  const [status, setStatus] = useState({ state: 'idle', msg: '' });
  const [preview, setPreview] = useState(null);
  const [applyGross, setApplyGross] = useState(false);

  const readPdfItems = useCallback(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const base = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}`;
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: `${base}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}/standard_fonts/`,
    }).promise;

    try {
      const all = [];
      for (let i = 1; i <= pdf.numPages; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const page = await pdf.getPage(i);
        // eslint-disable-next-line no-await-in-loop
        const textContent = await page.getTextContent();
        (textContent?.items || []).forEach((item) => {
          const str = String(item.str || '').trim();
          if (!str) return;
          all.push({
            str,
            x: item.transform[4],
            y: item.transform[5],
            width: Number(item.width) || 0,
            height: Number(item.height) || 0,
            page: i,
          });
        });
      }
      return all;
    } finally {
      pdf.destroy();
    }
  }, []);

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    e.target.value = null;
    if (!file) return;

    const label = type === 'regular' ? '급여대장' : '사업소득명세서';
    setStatus({ state: 'loading', msg: `[${label}] 표 구조를 읽는 중…` });

    try {
      const items = await readPdfItems(file);

      if (items.length === 0) {
        setStatus({
          state: 'error',
          msg: 'PDF에서 글자를 하나도 읽지 못했습니다. 스캔한 이미지 PDF는 인식할 수 없습니다. 세무사에게 원본(텍스트) PDF를 요청해 주세요.',
        });
        return;
      }

      const parsed = type === 'regular' ? parsePayrollRegister(items) : parseBusinessIncome(items);

      if (!parsed.axisFound || parsed.employees.length === 0) {
        setStatus({
          state: 'error',
          msg: type === 'regular'
            ? '급여대장 표를 인식하지 못했습니다. 사업소득명세서를 올리신 건 아닌지 확인해 주세요. (아래 진단 데이터를 저장해 알려주시면 서식을 맞춰 드립니다)'
            : '사업소득명세서 표를 인식하지 못했습니다.',
        });
        setPreview({
          type, fileName: file.name, rows: [], totalsCheck: null,
          warnings: parsed.warnings, missingUsers: [], rawItems: items,
        });
        return;
      }

      const { matched, missingUsers } = matchEmployees(parsed.employees, users);
      const totalsCheck = verifyTotals(parsed.employees, parsed.totals);

      setStatus({ state: 'idle', msg: '' });
      setApplyGross(false);
      setPreview({
        type, fileName: file.name, rows: matched, totals: parsed.totals,
        totalsCheck, warnings: parsed.warnings, missingUsers, rawItems: items,
      });
    } catch (error) {
      console.error('[PDF 파싱 오류]:', error);
      setStatus({ state: 'error', msg: `PDF 분석 중 오류가 발생했습니다: ${error.message}` });
    }
  };

  const applicable = useMemo(
    () => (preview?.rows || []).filter((r) => r.matchStatus === 'matched' && r.ok),
    [preview]
  );

  const handleDiagnosticDownload = () => {
    if (!preview) return;
    const blob = new Blob([JSON.stringify({
      fileName: preview.fileName,
      type: preview.type,
      parsedRows: preview.rows,
      warnings: preview.warnings,
      items: preview.rawItems,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `급여PDF_진단_${preview.fileName.replace(/\.pdf$/i, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = () => {
    if (applicable.length === 0) return;
    onExtractSuccess({
      rows: applicable,
      applyGross: preview.type === 'regular' ? applyGross : false,
      source: preview.type,
    });
    setPreview(null);
    setStatus({ state: 'success', msg: `${applicable.length}명의 공제 내역을 반영했습니다.` });
  };

  const failedRows = (preview?.rows || []).filter((r) => !r.ok);
  const unmatchedRows = (preview?.rows || []).filter((r) => r.ok && r.matchStatus !== 'matched');

  return (
    <div className="bg-white border border-indigo-100 p-6 rounded-2xl shadow-sm mb-6 animate-in fade-in">
      <div className="mb-6">
        <h3 className="font-bold text-xl text-indigo-900 flex items-center gap-2">
          <UploadCloud size={24} className="text-indigo-600" /> 세무사 PDF 자동 공제 스캐너
        </h3>
        <p className="text-sm text-gray-500 mt-2">
          업로드하면 <strong className="text-gray-700">먼저 읽은 내용을 표로 보여드립니다.</strong> 확인 후 적용을 눌러야 저장됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative group">
          <input type="file" accept="application/pdf" onChange={(e) => handleFileUpload(e, 'regular')}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="정규직 급여대장 업로드" />
          <div className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center group-hover:bg-blue-50 group-hover:border-blue-400 transition-all flex flex-col items-center justify-center gap-3">
            <FileText size={32} className="text-blue-500" />
            <div>
              <div className="font-bold text-blue-900">정규직/조교 급여대장</div>
              <div className="text-xs text-blue-500 mt-1">3줄 블록 구조 · 검산 후 적용</div>
            </div>
          </div>
        </div>

        <div className="relative group">
          <input type="file" accept="application/pdf" onChange={(e) => handleFileUpload(e, 'freelancer')}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="프리랜서 사업소득명세서 업로드" />
          <div className="border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center group-hover:bg-emerald-50 group-hover:border-emerald-400 transition-all flex flex-col items-center justify-center gap-3">
            <FileText size={32} className="text-emerald-500" />
            <div>
              <div className="font-bold text-emerald-900">프리랜서 사업소득명세서</div>
              <div className="text-xs text-emerald-500 mt-1">소득세 · 지방소득세</div>
            </div>
          </div>
        </div>
      </div>

      {status.state !== 'idle' && (
        <div className={`mt-4 flex items-start gap-2 text-sm font-bold p-4 rounded-xl
          ${status.state === 'loading' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
            : status.state === 'success' ? 'bg-green-50 text-green-700 border border-green-100'
              : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {status.state === 'loading' && <Loader size={18} className="animate-spin shrink-0 mt-0.5" />}
          {status.state === 'success' && <CheckCircle size={18} className="shrink-0 mt-0.5" />}
          {status.state === 'error' && <AlertCircle size={18} className="shrink-0 mt-0.5" />}
          <span className="leading-relaxed">{status.msg}</span>
        </div>
      )}

      <Modal
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        title={`읽어온 내용 확인 — ${preview?.fileName || ''}`}
        maxWidthClass="max-w-6xl"
      >
        {preview && (
          <div className="space-y-4">
            {/* 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['인식된 인원', `${preview.rows.length}명`, 'text-gray-800'],
                ['적용 가능', `${applicable.length}명`, 'text-green-600'],
                ['검산 실패', `${failedRows.length}명`, failedRows.length ? 'text-red-600' : 'text-gray-400'],
                ['직원 매칭 안 됨', `${unmatchedRows.length}명`, unmatchedRows.length ? 'text-orange-600' : 'text-gray-400'],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                  <div className="text-[11px] text-gray-500 font-bold">{label}</div>
                  <div className={`text-xl font-black ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* 합계 대조 — 사람이 통째로 빠졌는지 잡아내는 최종 안전망 */}
            {preview.totalsCheck && (
              <div className={`p-3 rounded-xl border text-sm font-bold flex items-start gap-2
                ${preview.totalsCheck.ok ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                {preview.totalsCheck.ok
                  ? <CheckCircle size={16} className="shrink-0 mt-0.5" />
                  : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                <div>
                  {preview.totalsCheck.ok
                    ? '대장 맨 아래 「합계」 행과 개인별 합계가 원 단위까지 일치합니다. 빠진 사람이 없습니다.'
                    : '「합계」 행과 개인별 합계가 다릅니다. 인식하지 못한 줄이 있을 수 있습니다.'}
                  {!preview.totalsCheck.ok && (
                    <ul className="font-normal mt-1 list-disc pl-5">
                      {preview.totalsCheck.rows.filter((r) => !r.ok).map((r) => (
                        <li key={r.key}>{r.label}: 개인합 {won(r.actual)} / 대장 {won(r.expected)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {preview.warnings?.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-100 bg-amber-50 text-amber-800 text-sm">
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* 표 */}
            {preview.rows.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-x-auto">
                <table className="text-xs min-w-[1100px] w-full">
                  <thead className="bg-gray-50 text-gray-500 border-b">
                    <tr>
                      <th className="p-2 text-left whitespace-nowrap">성명</th>
                      <th className="p-2 text-left whitespace-nowrap">시스템 직원</th>
                      {PREVIEW_COLUMNS.map((k) => (
                        <th key={k} className="p-2 text-right whitespace-nowrap">{FIELD_LABELS[k]}</th>
                      ))}
                      <th className="p-2 text-center whitespace-nowrap">검산</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.rows.map((row, idx) => {
                      const usable = row.matchStatus === 'matched' && row.ok;
                      return (
                        <tr key={`${row.name}-${idx}`} className={!row.ok ? 'bg-red-50/60' : (usable ? '' : 'bg-orange-50/50')}>
                          <td className="p-2 font-bold whitespace-nowrap">{row.name}</td>
                          <td className="p-2 whitespace-nowrap">
                            {row.matchStatus === 'matched' && <span className="text-green-700">{row.userName}</span>}
                            {row.matchStatus === 'unmatched' && <span className="text-orange-600 font-bold">미등록</span>}
                            {row.matchStatus === 'ambiguous' && <span className="text-red-600 font-bold">동명이인 {row.candidateCount}명</span>}
                          </td>
                          {PREVIEW_COLUMNS.map((k) => (
                            <td key={k} className={`p-2 text-right tabular-nums whitespace-nowrap ${row.amounts[k] < 0 ? 'text-red-600 font-bold' : ''}`}>
                              {row.amounts[k] ? won(row.amounts[k]) : <span className="text-gray-300">·</span>}
                            </td>
                          ))}
                          <td className="p-2 text-center whitespace-nowrap">
                            {row.ok
                              ? <CheckCircle size={14} className="text-green-500 inline" />
                              : <span className="text-red-600 font-bold">불일치</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 검산 실패 상세 */}
            {failedRows.length > 0 && (
              <div className="p-3 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertTriangle size={15} /> 아래 인원은 저장하지 않습니다 (숫자를 잘못 읽었을 수 있음)
                </p>
                <ul className="list-disc pl-5 space-y-0.5 font-normal">
                  {failedRows.map((r, i) => (
                    <li key={i}>
                      <strong>{r.name}</strong> — {r.checks.filter((c) => !c.ok && c.critical)
                        .map((c) => `${c.label} (읽은 값 ${won(c.actual)} ≠ 대장 ${won(c.expected)})`).join(' / ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 매칭 안 된 인원 */}
            {(unmatchedRows.length > 0 || preview.missingUsers?.length > 0) && (
              <div className="p-3 rounded-xl border border-orange-100 bg-orange-50 text-orange-800 text-sm space-y-1">
                {unmatchedRows.length > 0 && (
                  <p>
                    <strong>PDF에는 있지만 시스템에 없는 사람:</strong> {unmatchedRows.map((r) => r.name).join(', ')}
                    <span className="block text-xs opacity-80 mt-0.5">
                      직원 관리에서 이름이 정확히 같은지 확인해 주세요. 동명이인은 자동 배정하지 않습니다.
                    </span>
                  </p>
                )}
                {preview.missingUsers?.length > 0 && (
                  <p className="flex items-start gap-1.5">
                    <Users size={15} className="shrink-0 mt-0.5" />
                    <span><strong>시스템에는 있지만 이번 PDF에 없는 사람:</strong> {preview.missingUsers.map((u) => u.name).join(', ')}</span>
                  </p>
                )}
              </div>
            )}

            {/* 지급액 반영 여부 */}
            {preview.type === 'regular' && applicable.length > 0 && (
              <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={applyGross} onChange={(e) => setApplyGross(e.target.checked)} />
                <span className="text-sm">
                  <strong className="text-gray-800">지급액(기본급·수당·지급합계·실수령액)도 대장 값으로 맞추기</strong>
                  <span className="block text-xs text-gray-500 mt-1 leading-relaxed">
                    켜면 급여대장과 명세서가 완전히 같아집니다. 대신 시스템이 계산한 <strong>주휴수당·상여금·식대 항목은 0으로 정리</strong>되고,
                    지급합계는 대장의 값으로 대체됩니다. (대장의 기본급에 이미 다 포함되어 있기 때문입니다)
                    <br />꺼두면 <strong>공제 내역만</strong> 반영하고, 지급액이 다를 경우 급여 목록에 경고로 표시됩니다.
                  </span>
                </span>
              </label>
            )}

            <div className="flex flex-col md:flex-row gap-2 pt-2 border-t">
              <Button variant="ghost" icon={Download} onClick={handleDiagnosticDownload} className="md:w-auto">진단 데이터 저장</Button>
              <div className="flex-1" />
              <Button variant="secondary" onClick={() => setPreview(null)}>취소</Button>
              <Button onClick={handleConfirm} disabled={applicable.length === 0} icon={CheckCircle}>
                {applicable.length > 0 ? `${applicable.length}명 적용` : '적용할 인원 없음'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
