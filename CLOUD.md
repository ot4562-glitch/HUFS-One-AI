# HUFS One AI | 공개 접속 도메인·기관 인증·클라우드 경계

정본: [Architecture.md](Architecture.md) A02·A13·**A14.1a**·A15·A18. 이 문서는 운영 요약이며 실제 인프라·DNS·학교 인증을 구성한 기록이 아니다.

## 사용자가 확보한 도메인과 공개 범위

- **접속 예정 주소:** `https://외대.온라인.한국` (도메인 확보: 2026-10-30 사용자 진술).
- **인터넷에서는 접속 가능하게 배치할 계획이나 제품은 비공개:** 유효한 **한국외국어대학교 계정**으로 로그인해야 UI·API·자료를 볼 수 있다. `example@hufs.ac.kr`은 형식 예시이며 사용 가능한 계정이 아니다.
- **미완료:** DNS 및 TLS 검증, NCP 배포, 기관 IdP/SSO 연동 허가·기술 방식, 인증/권한 부정시험. 도메인 확보만으로 웹 가동·학교 공식 서비스·학교 계정 SSO 완료를 주장하지 않는다. **GitHub 저장소는 Private 유지**; 웹 주소 공개와 코드/학생 자료 공개는 다르다.

## 필수 인증·인가 흐름

```text
Internet → 외대.온라인.한국:443 (TLS)
  → ingress 기본 거부 (미인증은 최소 로그인/IdP 왕복만 허용)
  → 승인된 한국외대 기관 인증 (실제 제공자·허가 미확정)
  → 초기 베타 초대/role 확인
  → React + same-origin Fastify
  → actor/owner/SharingGrant 검사 → 비공개 PostgreSQL
  → 승인된 비식별 요청만 worker → CLOVA
```

**보안 원칙:** 이메일 문자열 `@hufs.ac.kr`만 입력해 통과하는 방식을 금지한다. IdP의 서명/발급자/수신자/만료/재전송 방어 및 신뢰된 이메일 확인이 필요하다. 학교 로그인 비밀번호를 서비스가 직접 받지 않는다. 기관 로그인에 성공해도 초기에는 승인된 초대 계정만 이용하며 개인 원본·다른 학생의 시연 projection은 별도 SharingGrant 없이는 열리지 않는다. 기관 IdP 접근 승인이 없다면 공개 도메인에서 앱을 제공하지 않는다.

미인증 요청은 HTML/JS 앱 번들뿐 아니라 `/api/**`, 파일/다운로드, 이미지/CDN/스토리지, WebSocket/SSE, 관리자·문서/debug, origin IP·staging/preview·다른 포트도 **서버와 ingress에서 기본 거부**한다. 로그인 안내와 필요한 인증 callback만 최소한 공개한다. 인증 판단은 프런트 라우터, `robots.txt`, UI 숨김에 맡기지 않는다. DB·worker·CLOVA 키는 외부에 직접 노출하지 않는다.

세션 쿠키는 Secure·HttpOnly·SameSite·host-only, 상태변경은 CSRF/Origin 검증, 신뢰 프록시만 인증헤더 전달, rate/감사·logout/권한철회를 적용한다. 개인 API는 `Cache-Control: no-store`, 공개 CDN/service worker/오프라인 캐시 사용 금지. 접근권한이 재검증되지 않는 네트워크 단절에서는 실학생 내용을 표시하지 않는다. 합성 로컬 테스트는 별도다.

## 학생 자료·AI·비용

실제 Forms/과목 자료의 제출 목표는 4명이며 시연 선택 슬롯은 5개다. 인증된 학교 계정이라는 이유만으로 CSV/Forms를 NCP에 옮기거나 팀원에게 공유할 수 없다. 원본/개인자료·목적별 동의·자료권한은 [DATA_GOVERNANCE.md](docs/DATA_GOVERNANCE.md)와 Architecture A03을 따른다. 디폴트 이미지·DB seed·로그·CI·정적번들·브라우저 공용 캐시에 실학생 자료를 포함하지 않는다.

제품 CLOVA 작업은 `experience_skills`, `opportunity_terms`, `personal_action_brief`, `graduation_explanation` 네 가지다. 서버만 키에 접근하며 안전 입력·검증 후보·원자적 quota/금액 상한·kill switch를 사용한다. 유료 호출과 서비스 개통은 별도 승인 전 OFF다.

## 출시 차단 조건

운영자는 DNS 소유/레코드·TLS/인증서·기관 IdP 허가·실제 테스트 계정·베타 allowlist·NCP 예산·배포 이미지의 자료 경계를 확인한다. 독립 검증자는 익명·위조토큰·타도메인·미초대 외대 계정·동의철회·직접IP·storage/CDN·뒤로가기·오프라인 캐시 우회를 시험한다. **하나라도 실패하거나 IdP 승인 미확인이면 공개 앱 배포 BLOCKED**다. 실제 승인/운영 로그는 학생 신원·토큰을 마스킹해 남긴다.
