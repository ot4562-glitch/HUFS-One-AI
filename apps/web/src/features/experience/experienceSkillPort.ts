import type {ExperienceTagApprovalDelete, ExperienceTagApprovalPut} from '@hufs-one/contracts';

export interface ExperienceCandidateSelection {
  readonly experienceId: string;
  readonly contentVersion: number;
  readonly consentVersion: number;
}
export interface ExperienceCandidateRequestResult {
  readonly ready: number;
  readonly pending: number;
  readonly unavailable: number;
}

/** Every operation is enclosed by a current owner-session or synthetic context guard. */
export interface ExperienceSkillPort {
  load(signal: AbortSignal): Promise<unknown>;
  approve(experienceId: string, input: ExperienceTagApprovalPut, signal: AbortSignal): Promise<unknown>;
  revoke(experienceId: string, input: ExperienceTagApprovalDelete, signal: AbortSignal): Promise<unknown>;
  requestCandidates?(selection: readonly ExperienceCandidateSelection[], signal: AbortSignal): Promise<ExperienceCandidateRequestResult>;
  create?(input: {title: string; summary: string}, signal: AbortSignal): Promise<unknown>;
  remove?(experienceId: string, contentVersion: number, signal: AbortSignal): Promise<unknown>;
  /** Remove private request metadata on logout, owner epoch changes or unmount. */
  clear?(): void;
}
