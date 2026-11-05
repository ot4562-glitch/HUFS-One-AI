# HUFS One AI — NCP private network Terraform

**현재:** NCP VPC/독립 subnet·route/IGW·관리자 공인 IPv4/32 ACG·stateless NACL 설계/검증용 Terraform 및 오프라인 mock. **실 계정 apply·상용 네트워크 개통 전**, `RELEASE_BLOCKED`. 인접 [host module](../host/README.md)과 실제 리소스/권한은 별도.

## PLAN ONLY

Terraform 버전·NCP provider/lockfile은 **실제 체크아웃의 잠금 파일과 공식 제공 버전**을 확인한다. 사용자 명시 승인 없는 provider upgrade·최초 `apply`/네트워크/공인 IP/보안그룹 생성을 허용하지 않는다.

- 승인된 VPC/서브넷/CIDR·라우트/IGW/독립 ACG, 관리자 현재 IPv4/32, NACL stateless 요청·반환 포트/Ubuntu·클라이언트 OS의 실제 ephemeral 범위·resolver·SSH 관리 정책을 비공개 `local_only/`에 입력.
- 기본 VPC/기존 사용자 ACG·다른 서비스의 접근권을 임의 재활용하거나 공개 HTTP/HTTPS/PG/API/worker 포트를 열지 않는다.
- `node infra/ncp/setup/01-network-plan.mjs`의 JSON→검증/vars와 `python3 infra/ncp/terraform/check-offline.py --terraform <승인된_terraform_실행파일>`을 로컬/mock으로 실행.
- `node --test tests/security/ncp-network-iac.test.mjs`와 실제 출판/비밀·CIDR·SSH admin 범위를 검사. **오프라인 PASS=실 NCP 정책 적용 PASS가 아님**.
- 실제 provider/plan SHA·사용자 비용/권리 승인과 이서연 운영/심민성 코드 책임이 검토된 다음에만 `terraform apply`를 별도 요청할 수 있다.

[상위 NCP 가이드](../../README.md) · [운영 인계](../../OPERATIONS_HANDOFF_TEMPLATE.md) · [실환경 수락 #252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
