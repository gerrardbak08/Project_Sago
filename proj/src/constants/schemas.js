const SCHEMA_ACCIDENT = {
  filename: "근로자사고DB_양식",
  sheet: "Sheet1",
  required: [
    { col: "재해일자", type: "date", note: "YYYY-MM-DD 또는 Excel 날짜" },
    { col: "년", type: "number", note: "예: 2025" },
    { col: "월", type: "number", note: "1~12" },
    { col: "재해자명", type: "string" },
    { col: "사번", type: "string", note: "AD로 시작하는 사번 또는 '사번 없음'" },
    { col: "부서", type: "string", note: "예: 강남/구리영업부" },
    { col: "팀명", type: "string", note: "예: 강남팀" },
    { col: "매장명", type: "string" },
    { col: "재해 유형", type: "string", note: "예: 넘어짐, 무리한 동작, 베임 등" },
    { col: "재해 종류", type: "string", note: "사고 / 출퇴근 / 질병 / 불인정" },
    { col: "기인물", type: "string", note: "예: 계단, 박스, 사다리 등" },
    { col: "사고 내용", type: "string", note: "사고 경위 자유 기술" },
    { col: "상병명", type: "string", note: "예: 골절, 염좌 및 긴장" },
  ],
  optional: [
    { col: "성별", type: "string", note: "여 / 남" },
    { col: "나이", type: "number" },
    { col: "나이대", type: "string", note: "예: 50 대" },
    { col: "근속기간 (년)", type: "string", note: "예: 1년 미만, 5-9년" },
    { col: "고용형태", type: "string", note: "연봉 / 임시 / 파트 / 촉탁 / 초단기" },
    { col: "신청유형", type: "string", note: "산재 / 공상 / 출퇴근 / 기타" },
    { col: "근로복지공단 제출", type: "string", note: "제출 / 미제출" },
    { col: "공상 비용 계", type: "number", note: "원 단위" },
    { col: "상해부위 (근골격계)", type: "string", note: "예: 허리, 손, 어깨" },
    { col: "파트장", type: "string" },
  ],
};

const SCHEMA_STORE = {
  filename: "매장현황DB_양식",
  sheet: "Sheet1",
  required: [
    { col: "매장명", type: "string", note: "고유한 매장 식별자" },
    { col: "신주소", type: "string", note: "도로명주소 (시군구 추출용)" },
    { col: "형태", type: "string", note: "직영점 / 유통점 / 유통행사" },
    { col: "구분", type: "string", note: "단품관리 / 금액관리" },
    { col: "지역", type: "string", note: "예: 인천영업부 (사고DB의 부서와 매칭)" },
  ],
  optional: [
    { col: "매장", type: "string", note: "매장 코드" },
    { col: "평수", type: "number" },
    { col: "진열평수", type: "number" },
    { col: "창고", type: "number", note: "창고 평수 (창고비율 계산용)" },
    { col: "오픈일", type: "date" },
    { col: "폐점여부", type: "string", note: "폐점 / 영업중 / 비어있으면 영업중" },
  ],
};

const SCHEMA_WORKER = {
  filename: "현장사원_인원현황_양식",
  sheet: "영업부",
  required: [
    { col: "부문", type: "string", note: "수도권 / 지방" },
    { col: "부서", type: "string" },
    { col: "팀", type: "string" },
    { col: "조직명", type: "string", note: "매장명 (사고DB 매장명과 매칭)" },
    { col: "직책", type: "string", note: "예: 사원, 파트장, 팀장" },
  ],
  optional: [
    { col: "사원상태", type: "string", note: "재직 / 퇴사 (재직만 카운트)" },
    { col: "입사일자", type: "date" },
    { col: "입사일자(YYYYMMDD)", type: "string", note: "8자리 문자열 형식" },
  ],
};

const SCHEMA_CUSTOMER = {
  filename: "고객사고DB_양식",
  sheet: "Sheet1",
  required: [
    { col: "발생일시", type: "date", note: "YYYY-MM-DD HH:MM 또는 YYYY-MM-DD" },
    { col: "년", type: "number", note: "예: 2025" },
    { col: "월", type: "number", note: "1~12" },
    { col: "부문명", type: "string", note: "수도권 / 지방 / 기타" },
    { col: "지역명", type: "string", note: "예: 인천영업부" },
    { col: "매장명", type: "string" },
    { col: "사고유형", type: "string", note: "예: 낙상, 재물파손, 충돌 등" },
    { col: "장소", type: "string", note: "예: 매장내부, 매장외부, 주차장 등" },
    { col: "원인1", type: "string", note: "주요 원인 분류" },
    { col: "처리과정", type: "string", note: "예: 종결, 진행중, 보류" },
  ],
  optional: [
    { col: "원인2", type: "string", note: "보조 원인" },
    { col: "고객명", type: "string" },
    { col: "고객연락처", type: "string" },
    { col: "고객연령대", type: "string", note: "예: 20대, 30대" },
    { col: "고객성별", type: "string", note: "남 / 여" },
    { col: "상해유형", type: "string", note: "예: 골절, 타박상, 찰과상" },
    { col: "보상금액", type: "number", note: "원 단위" },
    { col: "보상유형", type: "string", note: "예: 의료비, 합의금" },
    { col: "보험접수여부", type: "string", note: "Y / N" },
    { col: "응급처치", type: "string" },
    { col: "사고경위", type: "string" },
    { col: "특이사항", type: "string" },
    { col: "담당자", type: "string" },
    { col: "처리일자", type: "date" },
  ],
};

// ── 양식 템플릿 .xlsx 다운로드 ──
export { SCHEMA_ACCIDENT, SCHEMA_STORE, SCHEMA_WORKER, SCHEMA_CUSTOMER };
