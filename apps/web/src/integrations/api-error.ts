import type {z} from 'zod';
import type {ApiErrorCode} from '@hufs-one/contracts';

/** Safe public error; never copy provider messages, input values or SQL into it. */
export class HufsApiError extends Error {
  constructor(readonly code:ApiErrorCode,readonly status:number){
    super(code);this.name='HufsApiError';
  }
}
export function clientInput<T>(schema:z.ZodType<T>,input:unknown):T {
  const parsed=schema.safeParse(input);
  if(!parsed.success)throw new HufsApiError('INVALID_INPUT',422);
  return parsed.data;
}
export function requireMatchingReceipt(matches:boolean):void {
  if(!matches)throw new HufsApiError('VERSION_CONFLICT',409);
}
