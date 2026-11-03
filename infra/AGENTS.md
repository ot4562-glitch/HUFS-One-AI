# NCP 인프라 운영 · 배포 코드 경계

**2026-11-03 사용자 최신 지시** · [루트 AGENTS](../AGENTS.md), [WORKSTREAMS](../docs/WORKSTREAMS.md), [NCP 운영](../docs/NCP_OPERATIONS_2026.md), [#12](https://github.com/ot4562-glitch/HUFS-One-AI/issues/12)/[#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22)/[#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143) 우선.

- **이서연 `lhh42001` = NCP 비코드 운영 담당:** 사용권·크레딧/SKU·VPC·콘솔·ACG/TLS·IAM/secret 권한·실호스트 CPU/RSS·비용·백업/종료 증빙. 이 디렉터리의 코드를 작성하지 않는다.
- **심민성 `ot4562-glitch` = 이 디렉터리의 모든 코드·설정 파일·배포 자동화 소유:** Docker/IaC/YAML/systemd/cgroup/shell/CLI·비밀 노출 차단·NCP SDK/client·worker/비용/CPU 코드·CI 검증. 공통 API/계약 소비자 리뷰 후 진행한다. 이서연의 운영 환경 정보·사용 승인 없이 리소스를 실제 생성/변경하지 않는다.
- Cloud 사용 전 **사용자 별도 승인**·실제 본선/크레딧/요금/권리 확인 필수. 비승인 모델 다운로드·NCP 서버/키 생성/유료 호출·학생 원본/학교 저작물 외부 전송은 금지. `LAYA_ENABLED=false`가 기본이며 4vCPU·32GB/가격은 운영 설계 가정이다.
- `main` 직접 코드 변경/force push·타인 dirty worktree reset 금지. 비작성자 최신 HEAD 리뷰와 필수 CI 후 병합. [#46 개인정보 감사](https://github.com/ot4562-glitch/HUFS-One-AI/issues/46)·[#89 출시 게이트](https://github.com/ot4562-glitch/HUFS-One-AI/issues/89)는 `RELEASE_BLOCKED`.
