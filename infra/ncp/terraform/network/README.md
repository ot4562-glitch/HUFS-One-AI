# HUFS One AI — NCP private network Terraform

**현재:** NCP VPC/독립 subnet·route/IGW·관리자 공인 IPv4/32 ACG·stateless NACL 설계/검증용 Terraform 및 오프라인 mock. **실 계정 apply·상용 네트워크 개통 전**, `RELEASE_BLOCKED`. 인접 [host module](../host/README.md)과 실제 리소스/권한은 별도.

## PLAN ONLY

Terraform 버전·NCP provider/lockfile은 **실제 체크아웃의 잠금 파일과 공식 제공 버전**을 확인한다. 사용자 명시 승인 없는 provider upgrade·최초 `apply`/네트워크/공인 IP/보안그룹 생성을 허용하지 않는다.

- 승인된 VPC/서브넷/CIDR·라우트/IGW/독립 ACG, 관리자 현재 IPv4/32, NACL stateless 요청·반환 포트/Ubuntu·클라이언트 OS의 실제 ephemeral 범위·resolver·SSH 관리 정책을 비공개 `local_only/`에 입력.
- 기본 VPC/기존 사용자 ACG·다른 서비스의 접근권을 임의 재활용하거나 공개 HTTP/HTTPS/PG/API/worker 포트를 열지 않는다.
- `node infra/ncp/setup/01-network-plan.mjs`는 승인받은 JSON→검증/vars용이다. Terraform mock CI는 다음처럼 **검증된 공급자 로컬 미러**를 인자로 사용한다. CI용 공개 ZIP과 해시만 취급하며 NCP 계정·실 비밀·과금 API는 사용하지 않는다.

  ```sh
  python3 infra/ncp/terraform/provider-mirror.py --mirror /tmp/hufs-ncloud-provider-mirror
  python3 infra/ncp/terraform/check-offline.py --module network --terraform /path/to/terraform --provider-mirror /tmp/hufs-ncloud-provider-mirror
  python3 infra/ncp/terraform/check-offline.py --module host --terraform /path/to/terraform --provider-mirror /tmp/hufs-ncloud-provider-mirror
  ```

  공급자 `v4.0.7/linux_amd64` ZIP은 lockfile과 별도로 고정한 SHA-256을 검증한다. 이후 `terraform init/validate/test`는 파일시스템 미러만 사용하며 **GitHub/registry 서명 조회를 하지 않는다**. 다운로드 불가·검증 실패는 FAIL이지 SKIP이 아니다.
- `node --test tests/security/ncp-network-iac.test.mjs`와 실제 출판/비밀·CIDR·SSH admin 범위를 검사. **오프라인 PASS=실 NCP 정책 적용 PASS가 아님**.
- 실제 provider/plan SHA·사용자 비용/권리 승인과 이서연 운영/심민성 코드 책임이 검토된 다음에만 `terraform apply`를 별도 요청할 수 있다.

[상위 NCP 가이드](../../README.md) · [운영 인계](../../OPERATIONS_HANDOFF_TEMPLATE.md) · [실환경 수락 #252](https://github.com/minseong-hufs/HUFS-One-AI/issues/252).
