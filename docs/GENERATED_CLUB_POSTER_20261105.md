# HUFS One AI — 가상 동아리 포스터 현재 자산 계약

**자산:** `packages/fixtures/synthetic/clubs/generated/ai-club-poster-v1.png` · `SYN-POSTER-CLUB-090`. 내용은 완전히 **가상의 창작 기술 동아리**에서 활동하는 비실존 학생 3명/노트북·소형 로봇·아이디어 카드를 단순화한 이미지. 실제 학교/동아리 모집글·인물/연락처/공식 로고·QR 또는 진짜 프로그램을 묘사하지 않는다.

| 항목 | 확인 가능한 값 |
| --- | --- |
| 생성 방식 | OpenAI 내장 이미지 생성 도구를 사용한 **합성 포스터** |
| 파일 | PNG, **1672 × 941**, **1,528,702 bytes** |
| SHA-256 | `93446df5cc9a2859585e4801df7a74b7f602d71ae8084a4a51f5b563855af842` |
| alt | “가상의 학생 세 명이 노트북과 작은 로봇 주위에서 창작 아이디어를 함께 나누는 그림” |
| 접근 정책 | `ADMIN`의 합성 게시→승인/정정·재승인/철회 뒤 현재 active approval·권한 있는 BETA/REVIEWER만 이미지 접근 |
| 부하 | 게시 API의 **2MiB hard limit 이내**이나 **1MiB 선호 한도 초과**. 이미지 전송·메타데이터/반응형 로딩·실기기 UX 최적화 판단 필요 |
| 인수 | 사람 독립 품질·저작/이용조건/실기기 검수 **NOT_RUN**. 학교/실동아리 게시 권한을 부여하지 않음 |

포스터/외부 모델용 입력에는 실제 학교/학번/학생·교수/상표·기업 원본을 포함하지 않는다. 시연 글의 제목·자격/일시는 제품 HTML과 SourceRevision/승인 상태로 관리하고 이미지의 장식 글자·합성 속 내용을 공식 원본의 근거로 사용하지 않는다.

**현재 인수와 구현:** [#252 D02/A04](https://github.com/minseong-hufs/HUFS-One-AI/issues/252) · [#253 이미지/서버 최적화](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) · [합성 시연](OPERATIONS.md#empty-demo-runbook).
