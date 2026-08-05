/* 시즌 자동 선택 훅

   기존에는 LectureManager(2곳) / AttendanceManager / CareReportManager / VocaManager
   다섯 군데에 같은 로직이 복사되어 있었고, 조금씩 달라져 있었습니다.

   특히 '현재도 미래도 없을 때 어떤 지난 시즌을 고르는가'가 갈렸습니다.
     - LectureManager : 종료일이 가장 최근인 시즌   ← 의도에 맞는 동작
     - 나머지         : 시작일이 가장 늦은 시즌
   시즌 기간이 겹치거나 길이가 다르면 서로 다른 시즌이 선택되어,
   같은 날 같은 학원인데 화면마다 다른 시즌을 보여줄 수 있었습니다.

   여기서는 '종료일이 가장 최근인 시즌'으로 통일했습니다.
   방금 끝난 시즌을 보여주는 것이 사용자가 기대하는 동작이기 때문입니다.
*/

import { useState, useEffect } from 'react';

/** 오늘 날짜를 기준으로 보여줄 시즌 ID를 고릅니다. (순수 함수 — 테스트/재사용 가능) */
export const pickSeasonForToday = (seasons, fallbackId = 'all') => {
  const list = Array.isArray(seasons) ? seasons.filter(s => s && s.id) : [];
  if (list.length === 0) return fallbackId;

  const todayStr = new Date().toISOString().split('T')[0];

  // 1) 오늘이 포함된 시즌
  const current = list.find(s => todayStr >= (s.startDate || '') && todayStr <= (s.endDate || ''));
  if (current) return current.id;

  // 2) 가장 가까운 미래 시즌
  const future = list
    .filter(s => (s.startDate || '') > todayStr)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  if (future.length > 0) return future[0].id;

  // 3) 가장 최근에 끝난 시즌
  const past = list
    .filter(s => (s.endDate || '') < todayStr)
    .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
  if (past.length > 0) return past[0].id;

  return fallbackId;
};

/**
 * 데이터 로딩이 끝나면 오늘에 해당하는 시즌을 한 번만 자동 선택합니다.
 * 이후에는 사용자가 고른 값을 그대로 유지합니다.
 *
 * @param seasons      원본 시즌 배열 (masterData.seasons). 'all'/'legacy' 같은 가상 항목은 넣지 마세요.
 * @param loadingData  전역 데이터 로딩 여부
 * @param fallbackId   고를 시즌이 없을 때 사용할 값 ('all' 또는 'legacy')
 */
export const useSeasonAutoSelect = (seasons, loadingData, fallbackId = 'all') => {
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [isSeasonAutoSet, setIsSeasonAutoSet] = useState(false);

  useEffect(() => {
    if (isSeasonAutoSet || loadingData) return;
    setSelectedSeasonId(pickSeasonForToday(seasons, fallbackId));
    setIsSeasonAutoSet(true);
  }, [seasons, loadingData, isSeasonAutoSet, fallbackId]);

  return { selectedSeasonId, setSelectedSeasonId, isSeasonAutoSet };
};
