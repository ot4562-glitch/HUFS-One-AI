# Laya CPU 급증 방어 설계 — High Memory-g3 4 vCPU·32GB

> **현재 상태 안내:** 2026-11-04: [#161](https://github.com/minseong-hufs/HUFS-One-AI/pull/161)의 격리 child IPC/Linux supervisor/systemd와 Laya 기본 OFF 안전 코드는 [#216](https://github.com/minseong-hufs/HUFS-One-AI/pull/216)을 통해 main에 포함. 그러나 실제 NCP VM/cgroup v2/CPU/RSS/p95·ONNX 모델 권리·유료 실행은 NOT_RUN/RELEASE_BLOCKED. 이 문서의 CPUQuota·MemoryMax 등은 현장 실측 수치가 아닌 설계값. [STATUS](../STATUS.md).

> 최신 가격·예산·개통 승인 [NCP_OPERATIONS_2026.md](NCP_OPERATIONS_2026.md). 위 CPU 1vCPU 상한은 같은 4vCPU 서버에서 25%이며, 확대된 32GB RAM의 충분성은 실측 전 미보장.


> 상태: **설계·오프라인 부하 시험 계획(미배포·미설치·실측 전)** · 작성 2026-10-31, **2026-11-03 코드/운영 소유권 갱신**
> 권한: [Architecture.md](../Architecture.md) A06.9/A13, [RAG 운영 계약](TRUSTED_RAG_MEDIA_VERSIONING.md) §6, [CLOUD.md](../CLOUD.md), [이슈 #22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22).
> Laya는 **322M multilingual ONNX CPU 선택형 조언 모델**이고, 자격·마감·학칙을 확정하는 모델이 아니다. NCP 실제 서버·모델은 아직 사용하지 않았다.

## 1. 무엇이 문제인가

High Memory-g3(4vCPU·32GiB)에서 API/DB, 검색, NCP provider와 Laya 워커가 CPU 시간을 공유한다. 이는 **이서연이 운영하는 NCP 호스트/쿼터 환경**과 **심민성이 개발하는 Laya worker·ONNX/CPU 자동 제어 코드**가 교차하는 작업이다([#22 NCP 운영](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22), [#143 Laya 코드](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)). API의 동기 요청에서 Laya를 직접 실행하지 않는다. Laya는 모델 초기 적재·ONNX 그래프 최적화/weight prepacking·첫 추론·긴 입력·동시 호출 시 순간적으로 CPU와 메모리를 사용할 수 있다. 온디맨드 웹 요청에서 바로 Laya를 실행하면 **심사자 여러 명의 반복 열람이나 높은 API 요청 수가 추론량을 늘려 API p95·DB 응답을 악화**시킬 수 있다.

상위 Laya 자료는 multilingual 322M CPU·ONNX 구동을 지원하며 **CPU 지연이 입력 길이/코어/워밍 상태에 의존**한다고 설명한다. 4코어 환경 수치는 이 VM의 성능 증명이 아니다. 고정된 한글 라벨 평가에서 Laya가 규칙보다 개선 효과를 보이지 않으면 **모델 실행은 영구 선택 기능**으로 두고 기본 규칙을 사용한다. 파인튜닝은 초기 시연 계획에서 제외한다.

## 2. API 우선: 별도 프로세스·CPU 강제 상한 (4단 방어)

| 계층 | 잠금 값(초기 제안) | 효과·의미 |
|---|---|---|
| **0. 기능 스위치** | `LAYA_ENABLED=false` 기본, 배포 승인 + 전용 CPU 부하 시험 후 수동 ON | 실측·승인 전 프로세스 자체 비구동 |
| **1. 실행 격리** | API/DB와 **다른 systemd cgroup·프로세스**, 작업 워커 1개, 모델 하나만 적재 | Node event loop/HTTP handler 내 추론 금지 |
| **2. CPU 절대 한도** | `CPUQuota=100%`, `CPUQuotaPeriodSec=100ms` | 1코어 기준 평균 최대 **1 vCPU**(100ms마다 총 CPU 100ms), **4vCPU 전체 CPU시간의 25% 상한** |
| **3. 우선순위·스레드** | `CPUWeight=10`, `Nice=10`; ONNX `intra_op_num_threads=1`, `inter_op_num_threads=1`, `ORT_SEQUENTIAL`, intra/inter spinning=0; `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, `MKL_NUM_THREADS=1` | 시스템 부하 경쟁과 무의미한 idle spin을 줄인다. 환경변수만으로 ORT thread pool 제어가 보장되는 것은 아님 |
| **4. 메모리·작업량** | `MemoryHigh=2500M`, `MemoryMax=3072M`(초기), `TasksMax=32`; job concurrency=1, queue max=16, 작업 입력 512토큰 이하 | 메모리 조기 압박/서비스 단위 OOM 방어. 3GiB로 모델이 로드되지 않으면 **기능 OFF**, 상한 상향 자동 금지 |

**해석 주의:** `CPUQuota`는 **Laya 프로세스가 쓸 수 있는 CPU 시간 제한**이지 Node/DB에 3vCPU를 물리적으로 예약하는 기능은 아니다. OS 스케줄러/클라우드 noisy neighbor/cgroup parent 제한 때문에 실제 API SLA가 보장되는 것은 아니다. **cgroup v2가 적용되지 않거나 기대한 `cpu.max` 한도를 확인할 수 없으면 Laya는 비활성**으로 유지한다. CPUWeight는 경합 시 상대 우선순위일 뿐 단독 CPU 절대 상한이 아니다.

### 배포 전 참고 systemd 정책 (샘플·아직 활성화하지 않음)

```ini
# /etc/systemd/system/hufs-laya.service.d/resource-limits.conf
# 실제 unit과 실행파일/계정/격리 확인 후 승인된 배포에서만 적용
[Service]
CPUAccounting=yes
CPUQuota=100%
CPUQuotaPeriodSec=100ms
CPUWeight=10
Nice=10
MemoryAccounting=yes
MemoryHigh=2500M
MemoryMax=3072M
TasksMax=32
Environment="OMP_NUM_THREADS=1"
Environment="OPENBLAS_NUM_THREADS=1"
Environment="MKL_NUM_THREADS=1"
Environment="TOKENIZERS_PARALLELISM=false"
Environment="HF_HUB_OFFLINE=1"
Environment="TRANSFORMERS_OFFLINE=1"
```

- **별도 모델 런타임 코드에서** ORT `intra_op_num_threads=1`, `inter_op_num_threads=1`, `execution_mode=ORT_SEQUENTIAL` 및 `session.intra_op.allow_spinning=0`, `session.inter_op.allow_spinning=0`를 명시적으로 검증한다. Ollaya/Node wrapper 등 **설정 불가능한 런타임이면 리소스 상한 실측 전 활성화하지 않는다.**
- `systemctl show hufs-laya -p CPUQuotaPerSecUSec -p CPUWeight -p MemoryHigh -p MemoryMax`, `/sys/fs/cgroup/.../cpu.max`, `cpu.stat`, `memory.current`를 **설정한 동일 서비스 cgroup에서** 확인한다. 예를 들어 cpu.max가 `100000 100000`이면 1vCPU 한도에 해당한다.
- 운영 유닛의 비루트 사용자·`NoNewPrivileges`·외부 네트워크 차단·모델 읽기 전용 파일·비밀키 분리·프로세스 자동 재시작 폭주 방지는 **별도 설치/인프라 PR**에서 검증한다. 위 블록만 붙였다고 안전한 실행이 완성되는 것은 아니다.
- CPUQuota를 `150%`로 높이는 등 한도 완화는 기술 총괄의 **실측/독립 승인** 후 별도 PR로만 가능. GPU·새 VM·CPU 확대 자동 조달 금지.

## 3. 동기 응답 경로에서 제거: 캐시 → 비동기 → 규칙 폴백

1. API/심사자 GET 요청은 **검증된 결과·합성 replay·읽기 전용 snapshot**만 반환한다. **HTTP 요청 하나 때문에 Laya를 새로 실행·재시작·warm-up 하지 않는다.**
2. 공식 출처의 새로운 `SourceRevision`이 **권한·원본 해시·버전 검사**를 통과할 때만 내부 ingest가 `documentClassification/needsReview` 결정 작업을 예약한다. 브라우저는 작업 큐를 직접 제출할 수 없다.
3. **큐 상한 16, worker 동시 실행 1, 같은 (sourceRevisionId, model SHA, pipelineConfigVersion) 중복 제거**, 입력 최대 512 토큰·원문 이미지는 넣지 않음. 큐가 가득 차거나 30초 안에 시작하지 못한 작업은 버리고 **규칙 분류 + 검수대기**로 표시한다. 오래된 작업은 이미 정정/취소됐는지 실행 직전 다시 검사한다.
4. worker 당 **최대 20초(실행 중)**, 모델 시작/준비 시 최대 45초(사람 화면 밖). 초과·프로세스 종료·OOM·부정확 결과는 `UNKNOWN/NEEDS_REVIEW` + 코드 폴백, **무한 재시도·즉시 인라인 호출·예산 없는 외부 LLM 대체 금지**.
5. 워커가 기록한 결과는 `sourceVersion + modelRevision + rulesVersion`에 묶어 캐시하고, 정정·취소·권한철회 시 무효화한다. **REVIEWER는 결과 조회만 허용**, 요청 증가가 워커의 새 작업/과금/모델 적재 증가로 연결되지 않는다.
6. Laya가 꺼지더라도 **General OCR 필수 추출/규칙 검증·Postgres 검색/근거 인용/사용자 최신성 표시**는 정상 유지해야 한다. Laya confidence는 중요 결정의 증거가 아니므로 실패 상태를 숨기지 않는다.

## 4. CPU spike 감지·자동 부하 차단 (초기 가드 값, 미실측)

| 관측창 | **일시 정지(PAUSE)** | **즉시 OFF + 코드 폴백** |
|---|---|---|
| VM 전체 CPU | 10초 간격 관측, **20초 이상 ≥ 70%** (4vCPU 기준 약 2.8vCPU 소비) | **10초 이상 ≥ 90%**, API 오류/지연과 동반 |
| `/proc/pressure/cpu` / cgroup `cpu.pressure` | `some avg10 > 10%`가 20초 연속 | `some avg10 > 20%`가 10초 연속 + API 지연 |
| API P0 GET p95 | baseline의 **1.25배 이상**이거나 **400ms 이상**이 30초 연속 | p95 > baseline 1.5배 또는 HTTP 5xx 비율 ≥ 1%가 30초 지속 |
| 가용 메모리 | `MemAvailable < 3.0GiB` 또는 worker `memory.current > 2.5GiB` | `MemAvailable < 2.0GiB`, cgroup OOM event, memory.max 도달 |
| worker 지연 | queue 길이 > 12 / 16 또는 실행 p95 > 15초 | timeout 2회/10분, 동일 모델 3회 작업 실패, 프로세스 재시작 루프 |

가드는 **앱 내부 조회뿐 아니라 보호 대상인 API p95·DB p95·실제 OS/cgroup 측정**과 연동한다. worker가 중단되면 체크포인트/원장에 `LAYA_DISABLED_RESOURCE` 이유와 당시 리소스를 남기고 **분류 결과를 거짓 VERIFIED로 승격하지 않는다**.

- **PAUSE 상태**: 새 작업 예약 중단·진행 작업 timeout 처리·확정 규칙 우선. 60초 이상 VM CPU < 50%, available memory > 4.0GiB, API p95가 사전 baseline의 1.1배 이내를 모두 만족할 때만 큐 처리를 천천히 재개(기능 자체는 사전 승인된 ON 상태여야 함).
- **OFF 상태**: `LAYA_ENABLED=false` 유지, 반복 실패/pressure로 자동 재활성화하지 않음. 활성 재개는 사람이 회귀 로그를 검토한 후 변경 승인. 안전한 결과 캐시만 제공.
- `cpu.stat.nr_throttled`·`throttled_usec` 증가 자체는 quota 적용 시 정상일 수 있으므로 **그 수치 하나만으로 오류 선언하지 않는다**. API latency와 함께 해석한다.
- 모니터링 agent/DB 스케줄러 자체의 CPU/RSS도 측정한다. 4vCPU에서 관측기/수집기의 비용을 무시하지 않는다.

## 5. 실제 NCP 활성화 전 필수 실험·수용 게이트

**로컬 개발 PC 성공을 High Memory-g3 성능 증거로 인정하지 않는다.** 실제 리전/SKU/OS/CPU throttling·4vCPU·32GB 안에서 동등한 검증을 수행해야 한다.

1. **기준선:** Laya OFF, 동일 synthetic 5 reviewer 동시 조회 + 동일 Node/Postgres/ingest 부하로 P0 GET p50/p95/p99, SQL p95, CPU steal/pressure, VM RSS/메모리 여유, 요청 실패율 30분 측정.
2. **차례대로:** 모델 최초 로드(메모리/CPU spike), warm-up, 512·1024 input 토큰 비교(실 서비스는 512로 제한), 동시 1건과 5/10개 job burst, 10/30분 간헐 요청, 리뷰어 접속 70회 연속 + 브라우저 재접속, OCR burst 동시 상황. 스레드=1/기본 설정, CPUQuota=100% 비교; 예외는 기록.
3. **하드 수용:** API p95 **baseline 대비 1.2배 이하**이면서 P0 GET 500ms 이하(초기 목표), 오류율 **0.5% 미만**, Laya RSS ≤ 3GiB, VM 총 peak < 28GiB, host memory available > 3GiB, **OOM 0**, 권한 우회/미래 자료 누출 0. 성능 변화/비용과 CPU steal로 노이즈가 있으면 보수적으로 다시 검증.
4. **품질 수용:** 라벨링된 합성 공고 30~50개를 규칙-only와 Laya ON으로 비교해 한국어 분류 F1과 **검수 누락(false-skip)**을 따로 기록; 중요한 false-skip 증가 시 정확도가 높아도 채택하지 않는다. 초기 자료량에서는 파인튜닝 불필요/금지; 모델 개정·온도/threshold 튜닝도 분리된 검증 데이터 필요.
5. **실패 주입:** worker SIGKILL/OOM, CPU 상한 적용 누락, DB 쿼리 지연, 심사자 폭주, stale revision 갱신, 토큰 초과, 캐시 무효화 실패, queue overflow·backpressure, 모델 파일 훼손. 전부 API/P0는 계속 응답하거나 명시적 대기·차단 상태를 보여야 하고 **심사자 호출이 유료 HCX fallback을 자동 일으키면 안 된다**.
6. 테스트/CPU·메모리 trace/설정 출력·비용 원장·모델 digest·실제 관측 환경/커밋 SHA와 독립 리뷰가 없는 경우 **`LAYA_ENABLED=false`**를 유지한다.

## 6. 구현 책임·비용·추가 자료

- **현재 문서는 CPU/메모리 운영 계약만 확정한 설계 자료다.** Laya ONNX worker/queue/OS cgroup·systemd 파일·검증·자동화 구현 PR은 **심민성 [#143](https://github.com/ot4562-glitch/HUFS-One-AI/issues/143)** 전담. 이서연 [#22](https://github.com/ot4562-glitch/HUFS-One-AI/issues/22)는 승인된 NCP 계정·CPU/RSS·실요금·운영 환경의 **비코드 실측 증거**만 기록한다. 예시 설정은 실제 배포 승인이나 리소스 개통이 아니다.
- **소유 명확화:** NCP 콘솔·SKU·키/크레딧·호스트·성능/비용 실측/반납은 **이서연 #12/#22**. Laya worker·모델 adapter·ONNX/runtime·Docker/IaC/OS/cgroup 스크립트·상태 감지·offline/CI 검증은 **심민성 #143/#88**, 실제 모델 호출/비용/인프라 변경은 사용자 명시 승인과 별도 리뷰 전 금지. 파인튜닝은 기본 로드맵에 없다.
- 원본 학생 데이터/학교 자료가 모델에 전달되지 않도록 전용 입력 allowlist와 목적별 동의/권한 검사를 유지한다. 총 월 크레딧을 넘기지 않더라도 CPU 스파이크가 일으키는 **사용자 지연·추가 VM 요구**가 숨은 비용이므로 자동 증설하지 않는다.

### 기술 근거 · 설계 참고자료
- [systemd.resource-control: CPUQuota·CPUWeight·MemoryHigh/Max](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
- [Linux cgroup v2: cpu.max, cpu.stat, cpu.pressure](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [ONNX Runtime CPU thread pools & spin controls](https://onnxruntime.ai/docs/performance/tune-performance/threading.html)
- [Laya 로컬 CPU/ONNX·콜드/웜 실행 주의](https://laya.tools/guides/run-laya-locally)
- [Laya 공식 시스템 요구사항·메모리/CPU](https://laya-ai.com/guides/laya-requirements)
