# 승인 기반 NCP 네트워크 코드

이 모듈은 #192의 **네트워크 부분만** 구현한다. 한국 VPC·Public subnet·전용
ACG/NACL을 정의한다. NIC/서버/공인 IP/호스트 초기화는 후속 작업이다.
Terraform 1.14 이상, NCP provider **4.0.7**과 추적된 lockfile을 사용한다.
실제 계정·과금·자원 생성·접속 검증은 수행하지 않았다. `RELEASE_BLOCKED`.

관리 PC에서 phase 00 입력을 `preview` 필드로 감싸고, 운영자가 확인한
`dnsResolverCidr`(실제 resolver IPv4/32), `serverEphemeral` 및
`clientEphemeral`의 `min`/`max`를 추가한다. 서버 범위는 Ubuntu의
`/proc/sys/net/ipv4/ip_local_port_range`, 클라이언트 범위는 관리자 OS의 실제
SSH 반환 포트를 기준으로 확인한다. 예시 범위를 실측으로 취급하지 않는다.
공인 IP 없는 VPN/bastion 구성은 이 프로필에서 거부한다.

```powershell
Get-Content local_only/ncp-network-input.json -Raw |
  node infra/ncp/setup/01-network-plan.mjs
Get-Content local_only/ncp-network-input.json -Raw |
  node infra/ncp/setup/01-network-plan.mjs --vars |
  Set-Content local_only/network.auto-input.json -Encoding utf8
```

두 번째 출력은 `-var-file`용 JSON이며 기본 승인은 false다. 입력·tfvars·state는
Git/PR/AI에 올리지 않는다. 생성기는 source SHA 형식만 검증한다. **현재 main
조상·CI·비작성자 승인·실제 견적·계정/크레딧·CIDR 충돌**은 운영자가 phase 00
절차와 함께 확인해야 한다. `expected_approval_sha256`는 request 전체의 SHA256이다.
운영 적용은 별도 사용자 승인 후 이서연이 승인 Boolean·참조·동일 digest를
검토한 입력에 명시하는 단계다. 이는 사람의 승인 사실을 암호학적으로 증명하지
않으며 입력 견적도 실제 청구 한도를 만들지 않는다. 이 문서는 적용 승인이 아니다.

ACG 인바운드는 관리자 공인 /32의 TCP 22 하나뿐이다. NACL은 stateless이므로
SSH 반환, 서버 outbound TCP 반환 high ports, 지정 DNS의 UDP 반환을 별도로
허용한다. ACG는 unsolicited high-port ingress를 허용하지 않는다. 마지막
TCP/UDP/ICMP DROP을 명시한다. Outbound 80/443은 패키지 bootstrap용이며
서비스 공개 인바운드는 없다. DNS·시간 동기화·메타데이터·플랫폼 네트워크 예외의
실호스트 적합성, 경로/Internet Gateway, 고정 관리자 IP는 운영 검증 대상이다.
현재 코드는 DNS를 제외한 UDP egress와 ICMP를 허용하지 않는다.

모든 자원에 `prevent_destroy`를 둔다. 무승인 변경/재생성 방지를 위한 추가
보호이며, 코드 제거·state 변경이나 콘솔 권한까지 막는 보안 경계는 아니다.
반납은 실제 ID·의존·보존·백업·비용 확인 후 별도 검토된 도구가 필요하다.

오프라인 재현(공개 provider 패키지만 다운로드, NCP API 호출 없음):

```sh
python3 infra/ncp/terraform/check-offline.py --terraform /absolute/path/to/terraform
node --test tests/security/ncp-network-iac.test.mjs
```

checker는 자격증명/TF 환경 주입을 제거하고 backend 없는 init, validate,
mock-provider test만 실행한다. 승인 기본 OFF, 요청 digest 재사용 거부,
관리자 /32·공인 IP, CIDR 정렬/포함, 반환 포트, 전용 ACL/ACG 연결을 검증한다.
테스트의 `command = apply`는 **mock_provider의 메모리 리소스만** 생성하며
실제 적용 명령을 실행하지 않는다. 실제 자원·과금·quota·통신 성공의 증거가 아니다.

공식 스키마: [고정 provider 문서](https://github.com/NaverCloudPlatform/terraform-provider-ncloud/tree/v4.0.7/docs/resources),
[Terraform mock](https://developer.hashicorp.com/terraform/language/tests/mocking).
