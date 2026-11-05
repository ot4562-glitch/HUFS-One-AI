# 현재 남은 코드와 실제 구성·검증

**승인:** OWNER_CONFIRMED_APPROVED. 이 목록은 승인 대기가 아니라 실제 구현/구성/실행의 작업 목록입니다. 사용자 소유 #253/#257, 실제 결과 #252, 협업 조정 #255.

## PR #264에 구현된 범위

- 명시적 production 구성의 무조건 거부를 제거하고 OIDC/메일·HTTPS origin·실제 서버 포트를 검사.
- 기본 7개 SQL 역할 + 기존 owner/경험/추천/학업/Source 서비스 13종의 별도 managed pool 구성·중복/원시 pool 거부·시작/실패/종료 정리.
- 서버 비공개 factory 기반 `production-main` plan/apply와 systemd unit.
- 기존 경험 목록에 선택형 `view=portfolio`를 추가, 현재 승인 태그/내용/동의 버전·변경/철회 재검사·정확한 근거 ID 집계.
- 구성된 AI provider의 별도 승인 기본false 제거, 명시적 중지·현재 입력/세션/예산 검증 유지.
- 승인 상태와 실제 실행 결과를 구분한 문서 및 release evidence 보고.

## 아직 완료로 표시하지 않은 범위

- 경험 선택→provider input 등록→AI 태그 후보/원문 근거→학생 확인을 묶는 전체 어댑터와 UI/추천 소비자 종단 연결.
- loader-only `majorWhatIf` 관리형 운영 연결과 설계 API 9경로의 현재 대체/미구현/의도적 제외 판단 정리.
- 실제 운영 host/DB migration·계정/메일·가격/AI 입력·TLS/Proxy/복구 구성을 사용한 시험과 비용/품질 측정.
- 광범위한 #253의 source/native worker·전체 문서/API inventory·공급망/현장 인수 전 항목의 정확한 완료 근거.

UI·추천 순수 코어·학업 알고리즘은 다른 협업자 소유입니다. 본 PR의 코드/합성 테스트만으로 전체 서비스 또는 민성 담당 모든 이슈가 완료됐다고 계산하지 않습니다. 현재 PR HEAD의 결과를 [Actions](https://github.com/minseong-hufs/HUFS-One-AI/actions)에서 확인합니다.