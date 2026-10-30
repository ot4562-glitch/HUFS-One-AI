import {z} from 'zod';

export const ApiErrorCodeSchema=z.enum([
  'UNAUTHENTICATED','FORBIDDEN','SHARING_REVOKED','VERSION_CONFLICT',
  'INVALID_INPUT','UNVERIFIED_EVIDENCE','RATE_LIMITED','PROVIDER_UNAVAILABLE',
]);
export type ApiErrorCode=z.infer<typeof ApiErrorCodeSchema>;
export const API_ERROR_HTTP_STATUS:Record<ApiErrorCode,401|403|409|422|429|503>={
  UNAUTHENTICATED:401,FORBIDDEN:403,SHARING_REVOKED:403,
  VERSION_CONFLICT:409,INVALID_INPUT:422,UNVERIFIED_EVIDENCE:422,
  RATE_LIMITED:429,PROVIDER_UNAVAILABLE:503,
};
export const ApiErrorSchema=z.strictObject({
  code:ApiErrorCodeSchema,message:z.string().min(1).max(300),
  requestId:z.string().min(1),retryable:z.boolean(),contextId:z.string().min(1).optional(),
});
export type ApiError=z.infer<typeof ApiErrorSchema>;
/** Status mappings are protocol contracts, not automatic authorization checks. */
export function httpStatusForError(err:ApiError):401|403|409|422|429|503 {
  return API_ERROR_HTTP_STATUS[err.code];
}
export const DEFAULT_ERROR_MESSAGES:Record<ApiErrorCode,string>={
  UNAUTHENTICATED:'로그인이 필요합니다.',
  FORBIDDEN:'이 정보를 볼 권한이 없습니다.',
  SHARING_REVOKED:'공유 허용이 변경되었습니다.',
  VERSION_CONFLICT:'다른 변경이 반영되었습니다. 새로고침 후 다시 확인해 주세요.',
  INVALID_INPUT:'입력 형식을 확인해 주세요.',
  UNVERIFIED_EVIDENCE:'근거를 확인할 수 없습니다.',
  RATE_LIMITED:'요청 한도를 초과했습니다.',
  PROVIDER_UNAVAILABLE:'현재 외부 서비스를 사용할 수 없습니다.',
};
/** Safe public response: never interpolate provider errors, tokens, raw data, or SQL. */
export function makeApiError(code:ApiErrorCode,requestId:string,contextId?:string):ApiError {
  return ApiErrorSchema.parse({code,requestId,retryable:code==='RATE_LIMITED'||code==='PROVIDER_UNAVAILABLE',
    message:DEFAULT_ERROR_MESSAGES[code],...(contextId?{contextId}:{})});
}
