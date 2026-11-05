# HUFS One AI — 생성형 AI·OCR/HCX 계약

**현재 상태:** `packages/ai`에는 CLOVA request/response와 검증·4제품 task의 안전한 계약이 있으며 Fastify의 provider/budget/SQL/권리·worker/CPU 경계는 `apps/api`와 `infra/ai`가 통합한다. **실 OCR/HCX/유료 공급자 계정/모델·학생 원본 외부 전송은 승인 전 비활성**. `AI_ENABLED=false`, Laya OFF, RELEASE_BLOCKED.

## 승인된 4개 제품 task

| task | 제한된 생성 후보 | 코드가 최종 판단 |
| --- | --- | --- |
| `experience_skills` | 경험에서 추출된 Topic/Skill 후보 | 실제 활동·승인 태그/허용 경험 |
| `opportunity_terms` | 공고 지원 자격/마감·우대조건 근거 후보 | ELIGIBLE/INELIGIBLE/UNKNOWN·공식 source |
| `personal_action_brief` | 근거가 있는 준비 행동 요약 | 실제 신청/행동/저장 상태 |
| `graduation_explanation` | 정해진 RulePack/학점 코드 결과 설명 | 공식 학칙/졸업 확정·불명확 요건 |

각 입력은 검증된 actor/SharingGrant/Consent/SourceRevision/asOf/원본 SHA·출처별 AI 전송 권리·허용된 문장/paragraph·policy/model/schema/prompt 버전을 포함해야 한다. JSON/Zod strict enum·원문 exact citation/숫자·마감·조건 검증 실패시 NEEDS_REVIEW/AI_SKIPPED_PRIVACY로 폴백. LLM이 임의 학교 규칙·지원 적격을 만들거나 실계정/원본 PII를 echo해서는 안 된다.

## 자원·청구/취소

승인 전/후 권한 확인·입력 최소화, OCR 필요 여부→필요시 Vision→RAG→HCX, atomic RESERVE/DISPATCH/SETTLE·UNKNOWN_BILLING 보수적 처리, 429/503/timeout/late response/재시도·0 외부호출 fallback을 구현/시험한다. 실제 tokenizer/structured outputs/usage·finishReason/실 요금, provider 권리/제한과 CPU/RSS/AI 품질은 **실환경 수락**에 남는다.

Laya 보조 worker/ONNX는 서버 주 경로 밖/CPUQuota·OOM/kill switch/노드 격리, 현재 기본 OFF. 외부 모델 다운로드·유료 호출/배포 금지.

**관련:** [Architecture A06](../../Architecture.md) · [RAG](../../docs/TRUSTED_RAG_MEDIA_VERSIONING.md) · [CPU 가드](../../docs/LAYA_CPU_SPIKE_PROTECTION.md) · [코드 #253](https://github.com/minseong-hufs/HUFS-One-AI/issues/253) · [실인수 #252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
