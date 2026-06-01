const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 💡 엑셀 파일 이름이 다를 경우 아래 이름을 수정해주세요.
const EXCEL_FILE_PATH = path.join(__dirname, '목동임페리얼학원_학생맞춤_지원판별기.xlsx');
const OUTPUT_JSON_PATH = path.join(__dirname, 'public', 'data', 'admissions_data.json');

try {
  console.log('⏳ 엑셀 파일을 읽는 중입니다...');
  const wb = XLSX.readFile(EXCEL_FILE_PATH);
  
  let allAdmissions = [];
  
  // '학생부교과', '학생부종합' 시트 데이터를 각각 추출
  ['학생부교과', '학생부종합'].forEach(sheetName => {
    if (wb.SheetNames.includes(sheetName)) {
      const ws = wb.Sheets[sheetName];
      // 3번째 줄부터 데이터 시작이므로 range: 2 옵션 사용
      const data = XLSX.utils.sheet_to_json(ws, { range: 2 });
      
      data.forEach(row => {
        if (row['대학'] && row['학과명']) {
          allAdmissions.push({
            region: row['지역'] || '기타',
            univ: row['대학'],
            type: row['전형'] || sheetName,
            dept: row['학과명'],
            cut: Number(row['5등급제 예측컷']) || null,
            min: Number(row['구간 Min']) || null,
            max: Number(row['구간 Max']) || null,
            strategy: row['지원 전략 판별기'] || '예측 불가'
          });
        }
      });
      console.log(`✅ [${sheetName}] 시트 추출 완료`);
    }
  });

  if (allAdmissions.length === 0) {
      throw new Error("추출된 데이터가 없습니다. 엑셀 파일의 시트명이나 구조를 확인해주세요.");
  }

  // public/data 폴더가 없으면 자동 생성
  const dir = path.dirname(OUTPUT_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // JSON 파일로 저장
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(allAdmissions, null, 2), 'utf-8');
  console.log(`\n🎉 성공! 총 ${allAdmissions.length}개의 데이터가 JSON으로 변환되었습니다.`);
  console.log(`📁 저장 위치: ${OUTPUT_JSON_PATH}`);

} catch (error) {
  console.error('\n🚨 오류가 발생했습니다:', error.message);
  console.log('엑셀 파일 이름이 "목동임페리얼학원_학생맞춤_지원판별기.xlsx"가 맞는지, 최상위 폴더에 들어있는지 확인해주세요.');
}