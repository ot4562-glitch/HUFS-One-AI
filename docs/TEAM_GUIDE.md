# 코딩을 몰라도 알 수 있는 전체 흐름

> **2026-11-04 통합 후 현재 판단:** 2026-11-04 팀 전체 실제 현황: [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216) 통합 병합, OPEN PR 0건 / OPEN 일반 이슈 40건, main 3 CI SUCCESS. 팀별 코드 주요 변경은 반영했으나 실 Google/PG·학교/학사자료·NCP·독립 gold/스크린리더는 미수락으로 RELEASE_BLOCKED. 아래 2026-11-02~03 당시 요청·리뷰 문구는 과거 기록이고 지금 협업자에게 PR 처리를 요청하라는 지시가 아니다. [STATUS](../STATUS.md).

## 2026-11-02 최근 협업 정리 — 사용자 화면의 새 방향

**기존 HUFSAbility의 익숙한 메뉴는 없애지 않습니다.** [관찰 보고서](HUFSABILITY_UI_COMPONENT_ATLAS.md)의 11개 학생 화면 분류·76개 화면과 [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)의 공식 공개 안내 5분류·24기능/공개 4영역을 대조해 **전체 메뉴에서 모두 찾아볼 수 있게** 만듭니다. 하지만 지금 쓸 수 없는 기능은 **🚫 미지원/검증 전**, 현재 검증된 합성 시연 기능만 실행합니다. 이의상 UI, 심민성 학생가치/공식성 검토·기능/권한/manifest를 맡아 [**새 UX 디자인 이슈 #141**](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)로 작업합니다. 과거 HUFSAbility와 똑같은 모양을 만드는 것이 아니라, 학생이 익숙하게 찾되 **더 쉽고 멋지고 접근성이 좋은 새 화면**을 목표로 합니다. 학교가 공식 업데이트한 사이트라고 표현하지 않습니다.

**2026-11-03 최신 검토:** #145 OCR/HCX 오프라인 wire·#148 원자 비용 원장·#131 맞춤 설정 UI에 이어 **[#149 시간표 CSV](https://github.com/ot4562-glitch/HUFS-One-AI/pull/149)**의 UNKNOWN 캠퍼스 오류가 수정됐고 HEAD `f797787` 비작성자 승인·합성/PG/Chrome CI 3/3 후 **main `efa13368` 병합**됐습니다. **열린 PR 2건:** [#134](https://github.com/ot4562-glitch/HUFS-One-AI/pull/134) 시연 프로필 UI는 #131 squash 이후 재기반 충돌, [#150](https://github.com/ot4562-glitch/HUFS-One-AI/pull/150) owner provider·Laya/API는 Draft·통합 충돌·타인 승인 없음. **열린 일반 이슈 34 / 닫힌 7**: [담당별 번호·주관/지원 41건 전수 원장](WORKSTREAMS.md). 학교 원본 승인·실 4인/Google·NCP·실PG/출시는 여전히 미완료이고 **#46/#89 RELEASE_BLOCKED**. [STATUS](../STATUS.md) 우선.

## 2026-11-02 동아리 기능 담당자용 최신 병합 인수인계

- [x] 김채윤의 [#125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125) 가상 동아리 노출·추천 **순수 코어**는 이전 #125 변경요청의 미래시점/수정 후 승인 결함을 고쳐 새 HEAD `8e88a4b` 비작성자 APPROVED·GitHub Actions 2/2 SUCCESS 후 **main `8f76c388` 실제 병합**.
- [ ] 이의상: 모집 게시판·실제 생성된 AI 가상 포스터 이미지/접근성 UI. 심민성: 서버의 **진짜 가상 관리자 권한 확인/게시 승인 contract·API**. 심민성: 기획·학교 공식성 표현 검토. **#123 상위 Issue OPEN**.
- [ ] HUFSAbility의 기존 메뉴 관찰 11분류/76화면 전체 기능·UI 독립 고도화 [#124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124)·[#141](https://github.com/ot4562-glitch/HUFS-One-AI/issues/141)는 여전히 OPEN. #129은 공개 메뉴 셸, #130은 합성 동아리 UI 하위 구현 main이며 실제 학교 전체 서비스 이식이 아님. #46/#89 RELEASE_BLOCKED.

## 2026-11-02 새 기능 이슈/담당 및 협업 순서

- **[Issue #124](https://github.com/ot4562-glitch/HUFS-One-AI/issues/124) HUFSAbility 기존 기능/메뉴 수용(P0):** 이의상(`uisang2004-maker`) UI/메뉴·🚫/360px·접근성, 심민성(`ot4562-glitch`) route/권한/capability manifest·통합, 심민성(`ot4562-glitch`) 학교 공식성/제품가치 주장 검토. 원래 메뉴 5대 분류·24 하위 기능과 공개 진입 4영역 **누락 없이 보이되 구현되지 않은 메뉴는 작동 금지**. 학교 공식 운영 허가/전 기능 이식이 아님.
- **[Issue #123](https://github.com/ot4562-glitch/HUFS-One-AI/issues/123) 가상 동아리 모집(P1):** 이의상 UI·독창적 합성 포스터, 김채윤(`qamarrchae`) 승인된 가상 동아리만 추천하는 코어, 심민성 가상 관리자 승인 gate·합성 DTO/API·안전 검토. 실동아리/에브리타임 원문·학생 개인정보 사용 금지. [#125](https://github.com/ot4562-glitch/HUFS-One-AI/pull/125) 가상 동아리 승인 시점 코어와 [#130](https://github.com/ot4562-glitch/HUFS-One-AI/pull/130) 합성 게시판·수작업 SVG 포스터 UI는 main. 실제 AI 생성 포스터나 기관 동아리 승인/게시 권한 전체 수락은 별개.
- **현재 통합:** [#122](https://github.com/ot4562-glitch/HUFS-One-AI/pull/122) source revision 회귀, [#72](https://github.com/ot4562-glitch/HUFS-One-AI/pull/72) 달력 UI, [#73](https://github.com/ot4562-glitch/HUFS-One-AI/pull/73)·[#74](https://github.com/ot4562-glitch/HUFS-One-AI/pull/74)·[#75](https://github.com/ot4562-glitch/HUFS-One-AI/pull/75) 심사/졸업/합성 기능, [#76](https://github.com/ot4562-glitch/HUFS-One-AI/pull/76) 브라우저 CI, [#117](https://github.com/ot4562-glitch/HUFS-One-AI/pull/117) 추천 제외 이유 코어, [#131](https://github.com/ot4562-glitch/HUFS-One-AI/pull/131) 임시 설정 비교 모두 main. #120/#121은 미병합 종료됐고 권한/계약의 후속 안전 경계는 #137 main. 합성 검증을 실학생 권한 인증·실공고 검수로 읽지 않습니다.
- **해결 정책:** 구현·검증된 세부 항목만 [x], 상위 서비스/배포/학교 공식 자료·Google/학생 동의·#46/#89은 계속 별도 검증. 코드 PR에는 타인 최신 HEAD APPROVED와 동일 HEAD 성공한 관련 CI가 필요.


**담당 GitHub 작업 계정(현재 이슈 배정 확인):** 심민성 `ot4562-glitch`(계약·일반 API), 이의상 `uisang2004-maker`(UI), 김채윤 `qamarrchae`(추천·공지), 박준영 `taewangim-alt`(학업), 이서연 `lhh42001`(NCP 비코드 계정·환경·크레딧/요금·호스트 운영). **일반 웹/외부 API와 모든 OCR/HCX SDK·Laya worker·CI/OS 자동화 코딩은 심민성 담당**이며 실제 서버·Google OIDC/DB/OCR·모델·클라우드 개통은 별도 검증/승인 전 완료로 표시하지 않는다. 역할/근거: [WORKSTREAMS.md](WORKSTREAMS.md).

**접속 전:** 주소는 `https://외대.온라인.한국`으로 계획한다(아직 DNS/TLS·배포 확인 전). 학교의 공식 로그인 연결 없이도 **Google 계정 로그인 → 외대 이메일 수신함 확인 → 베타 초대 승인**을 거치게 한다. 학교가 실제 Google Workspace를 운영한다면 검증된 조직 정보로 메일 소유를 확인할 수 있고, 그렇지 않으면 외대 이메일로 보낸 인증코드를 입력한다. **개인 Gmail로만 로그인하거나 `example@hufs.ac.kr`을 입력했다고 해서 접속되는 것은 아니다.** 로그인 후에도 타인의 데이터는 별도 공유 허용 범위를 확인한다. 학교 공식 서비스가 아닌 독립 팀 프로젝트다.

**로그인 및 승인 이후 흐름:**

1. 상단 작은 버튼에서 학생 A 대신 학생 B를 선택한다. 로그인 계정은 그대로이고 **시연 대상**만 바뀐다.
2. API가 로그인한 팀원이 B의 어떤 자료를 볼 수 있는지 SharingGrant로 확인한다.
3. 추천 코어가 B의 관심·경험과 공고의 주제를 동일한 24개 코드로 비교한다.
4. CLOVA가 허용된 공고 문장/활동의 의미를 추출하고, **코드가 지원자격·관련성을 검증**한다.
5. 중요한 기회는 큰 카드, 일반 정보는 작은 목록으로 보이고 근거/마감/다음 행동을 제시한다.
6. 졸업지원 탭에서는 공식 학사요건에 따라 부족 학점·필수과목·계획·개설 전망을 본다.
7. 다른 학생으로 바꿀 때 이전 학생의 늦은 API 응답을 섞지 않는다.

**다섯 팀원이 할 일:** 심민성은 웹·외부 API·인증·DB/검색/계약·NCP SDK/HTTP·OCR/HCX·Laya ONNX/worker·OS/systemd/IaC·CI와 PR 코드를 통합하고, 이의상은 웹 UI/모바일, 김채윤은 추천·공지, 박준영은 학업, **이서연은 코드 없이 NCP 계정·크레딧·서비스 사용권·VPC/TLS/IAM·비용·호스트 CPU/RSS·종료 영수증**을 전담한다. 누구나 자신 영역의 입력→처리→출력과 실패 시 상태를 두 문장으로 설명할 수 있어야 한다.

## 새 화면: '내 주요 일정' 미니 캘린더 (2026-10-31 기획 추가)

오늘 화면 하단에 **서류 제출 마감**, **공고 신청 마감**, **시험·행사 날짜**를 구분해 보여주는 작은 달력을 추가한다. 날짜가 없는 상시/미정 공고는 별도 목록, 내게 적용되는지 불확실한 학업 일정은 **'적용 확인 필요'**로 두고 중요한 확정 마감인 것처럼 알리지 않는다. 학생이 공유하지 않은 전공·졸업 상황·경험 정보도 일정으로 짐작할 수 없도록 서버에서 권한을 확인한다. 색뿐 아니라 아이콘·텍스트/스크린리더를 지원한다.

**현재 실제 구현 상태:** [#53 캘린더 결과 계약](https://github.com/ot4562-glitch/HUFS-One-AI/pull/53)과 김채윤 [계산 코어 #50](https://github.com/ot4562-glitch/HUFS-One-AI/pull/50)은 **main 병합 완료**. 단, 이의상 [화면 #51](https://github.com/ot4562-glitch/HUFS-One-AI/issues/51), 심민성 [인증된 API #52](https://github.com/ot4562-glitch/HUFS-One-AI/issues/52)는 실제 연결 전이다. ICS 내보내기/휴대폰 푸시는 새 기능 범위 밖이다. [기술 규칙](../Architecture.md) A07.3 참조.

## 새 신뢰형 AI를 쉽게 설명하기 (설계 단계)

**공고가 바뀌었는지 확인**하고, 이미지 포스터는 **General OCR로 글자 위치까지 읽고**, 어려운 포스터만 **HCX-005 Vision**으로 시각적 해석 후보를 추가한다. **Temporal RAG**는 허용된 문서 중 해당 날짜에 유효한 근거를 검색하고, **HCX-007**은 그 근거에서 조건 후보를 정리하며, **규칙 코드**가 최종 검증한다. **Laya**는 4vCPU·32GB CPU 서버에서 '이 문서를 추가 검수해야 하는가'만 보조하고 재학·자격·마감을 단정하지 않는다. 예산/시간/권한 문제가 생기면 검증된 코드로 폴백한다. 정본: `Architecture.md` A06.9 및 `docs/TRUSTED_RAG_MEDIA_VERSIONING.md`.

## 학교 심사자 접근 (계획·API 합성 구현 중)

학교 심사 담당자용 **공용 REVIEWER 초대장**을 별도로 발급한다. 담당자는 Google 로그인과 메일 확인 후 최초 한 번 코드를 등록하고 심사 시작일~종료일 사이에 **횟수 제한 없이 다시 접속**할 수 있다. 종료 시각/초대 철회 이후는 기존 로그인 상태라도 화면과 API가 차단된다. 심사자는 팀원 5명과 별개이고 **실학생 파일이 아닌 SYNTHETIC 리플레이**만 볼 수 있다. 실제 사이트/Google 로그인·메일 초대 발송은 아직 연결되지 않았다. [REVIEWER_ACCESS.md](REVIEWER_ACCESS.md), [이슈 #25](https://github.com/ot4562-glitch/HUFS-One-AI/issues/25).

## Laya 때문에 사이트가 느려지지 않도록

심사자가 자주 접속해도 Laya가 새로 추론하지 않고, **이미 검증된 시연 결과만 조회**한다. Laya는 나중에 승인될 백그라운드 분류 작업에만 사용하며 4vCPU 서버에서 CPU 상한 1vCPU·동시 1건·메모리 상한을 둔다. 문제가 생기면 자동으로 Laya를 끄고 규칙 코드로 처리한다. 현재 이 기능은 [운영 설계](LAYA_CPU_SPIKE_PROTECTION.md)이며 실제 클라우드 서버에서 시험한 것은 아니다.

**최신 운영·예산:** 11/06~12/09은 816h 비용 산정 상한, 학교 본선 발표는 11/16. 실제 VM/NCP 리소스 생성은 진출·크레딧·사용자 승인 이후. KR VPC Linux High Memory-g3 4vCPU/32GB 326원/h + 50GB CB 8원/h, 전체 기간 서버+CB 272,544원(그 밖의 공인 IP/VAT/AI 별도). [정본](NCP_OPERATIONS_2026.md). **심사자 웹 체험의 출시 조건**은 Google OAuth·DB·프런트엔드 E2E 통과다.
