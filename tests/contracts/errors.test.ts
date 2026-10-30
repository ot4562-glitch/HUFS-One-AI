import {describe,it,expect} from 'vitest';
import {ApiErrorSchema,API_ERROR_HTTP_STATUS,makeApiError,httpStatusForError,ApiErrorCodeSchema} from '@hufs-one/contracts';

describe('A13 public error boundary',()=>{
  it.each(Object.entries(API_ERROR_HTTP_STATUS))('%s maps to HTTP %i',(code,status)=>{
    const response=makeApiError(ApiErrorCodeSchema.parse(code),'SYN-REQ-1');
    expect(httpStatusForError(response)).toBe(status);
    expect(ApiErrorSchema.safeParse(response).success).toBe(true);
  });
  it('never copies a provider or database error into a client payload',()=>{
    const e=makeApiError('PROVIDER_UNAVAILABLE','SYN-REQ-1');
    expect(JSON.stringify(e)).not.toMatch(/SQL|Bearer|API_KEY|student/i);
    expect(e.retryable).toBe(true);
    expect(makeApiError('FORBIDDEN','SYN-REQ-2').retryable).toBe(false);
  });
  it('rejects missing requestId, unknown code and raw trace',()=>{
    const e=makeApiError('VERSION_CONFLICT','SYN-REQ-3');
    expect(ApiErrorSchema.safeParse({...e,requestId:''}).success).toBe(false);
    expect(ApiErrorSchema.safeParse({...e,code:'LEAKED_DB_ERROR'}).success).toBe(false);
    expect(ApiErrorSchema.safeParse({...e,stack:'SYN-PRIVATE-STACK'}).success).toBe(false);
  });
});
