# NCP·OS·배포 코드 책임

심민성은 NCP SDK/IaC/Terraform·PowerShell/OS·systemd/worker·배포/복구·CI의 코드 소유자이고 이서연은 계정/IAM·리전/SKU·가격·실호스트·청구/반납의 비코드 담당입니다.

프로젝트에 필요한 운영·자료/모델 전송·출시 승인은 소유자가 모두 완료 확인했습니다. 승인 미취득을 이유로 같은 요청을 반복하지 않습니다. 실제 명령은 구체적인 대상 계정/주소/자격증명·비용 설정과 rollback 대상을 확인한 환경에서 실행합니다. 이것이 없으면 CONFIGURATION_REQUIRED입니다.

계획 명령은 부작용 없이 유지하고, 실제 적용은 명시적으로 선택합니다. TLS·host key·네트워크·역할/비밀·실 client IP·서비스 종료/청구·복구를 실제 결과로 검증합니다. 승인 완료와 실행 성공은 다릅니다. [승인 정본](../docs/AUTHORIZATION.md) · [production 실행](../docs/PRODUCTION_RUNTIME.md).