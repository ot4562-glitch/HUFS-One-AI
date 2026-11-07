import type {ProviderAccepted,ProviderStoredJob} from '@hufs-one/contracts';

/** Display labels for observed provenance; a cached read never counts as a new paid call.
 * No model id, exact cost or latency is invented if the server did not return it. */
export type AiRunMode='NOT_RUN'|'PENDING'|'LIVE_PROVIDER_RUN'|'CACHED_PREVIOUS_RUN'|'SYNTHETIC';
export function providerRunMode(accepted:ProviderAccepted|null,stored:ProviderStoredJob|null,
  synthetic=false):AiRunMode{
  if(synthetic)return 'SYNTHETIC';
  if(accepted?.state==='PENDING')return 'PENDING';
  if(accepted?.state==='NEEDS_REVIEW')
    return accepted.provenance==='LIVE'?'LIVE_PROVIDER_RUN':'CACHED_PREVIOUS_RUN';
  return stored?'CACHED_PREVIOUS_RUN':'NOT_RUN';
}
export const AI_RUN_MODE_TEXT:Record<AiRunMode,string>={
  NOT_RUN:'실제 또는 보존된 모델 실행이 확인되지 않았습니다.',
  PENDING:'실행 결과 확인 대기 중입니다. 성공이나 비용을 단정하지 않습니다.',
  LIVE_PROVIDER_RUN:'서버가 신규 실모델 실행으로 보고한 결과입니다. 독립 검토 전 후보입니다.',
  CACHED_PREVIOUS_RUN:'서버에서 보존된 이전 실행 결과를 다시 읽었습니다. 신규 실행·재과금이 아닙니다.',
  SYNTHETIC:'실제 모델을 호출하지 않은 합성 예시입니다. 실모델 정확도나 비용 증거가 아닙니다.',
};
