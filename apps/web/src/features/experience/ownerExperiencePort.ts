import type {ProviderAccepted} from '@hufs-one/contracts';
import type {HufsOwnerApiClient} from '../../integrations/owner-api-client.js';
import {HufsApiError} from '../../integrations/api-error.js';
import {ExperienceReviewPageSchema} from './skillReviewView.js';
import type {ExperienceCandidateSelection, ExperienceSkillPort} from './experienceSkillPort.js';

type Job = ExperienceCandidateSelection & {
  inputRef: string; asOf: string; key: string; accepted?: ProviderAccepted;
};
const aborted = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); };

/** No server "latest job" exists. Keep only this owner's explicit submit receipts in memory.
 * Never infer a job from an experience ID. Same-owner resume/route remount retains
 * retry keys, while the owner controller rejects actor changes and clears terminal sessions.
 * Portfolio coverage remains PAGE; this adapter never calls withApprovedExperience.
 */
export function ownerExperienceSkillPort(api: HufsOwnerApiClient): ExperienceSkillPort {
  const jobs = new Map<string, Job>();
  let generation = 0;
  const guard = (signal: AbortSignal) => {
    const epoch = generation;
    return () => { aborted(signal); if (epoch !== generation) throw new DOMException('Aborted', 'AbortError'); };
  };
  const loadPage=async(afterId:string|undefined,signal:AbortSignal)=>{
      const currentRequest = guard(signal);
      const page = await api.getExperiencePortfolio(afterId?{limit:20,afterId}:{limit:20}, signal);
      currentRequest();
      const items = [];
      for (const [index, item] of page.items.entries()) {
        if (item.value.kind !== 'EXPERIENCE') throw new HufsApiError('PROVIDER_UNAVAILABLE', 503);
        const evidence = page.portfolio.evidence[index]!;
        const job = jobs.get(item.itemId);
        const current = job && job.contentVersion === item.version && job.consentVersion === page.portfolio.consentVersion;
        if (job && !current) jobs.delete(item.itemId);
        const candidate = current && job.accepted?.state === 'NEEDS_REVIEW'
          ? await api.getExperienceSkillCandidate(item.itemId, job.accepted.jobId, signal) : null;
        currentRequest();
        if (candidate && (candidate.contentVersion !== item.version || candidate.consentVersion !== page.portfolio.consentVersion))
          throw new HufsApiError('VERSION_CONFLICT', 409);
        items.push({experienceId: item.itemId, title: item.value.title, summary: item.value.summary,
          dataMode: item.value.dataMode, contentVersion: item.version, approval: evidence.approval,
          candidate, candidateState: current && job.accepted?.state === 'PENDING' ? 'PENDING' : 'NOT_REQUESTED'});
      }
      return ExperienceReviewPageSchema.parse({asOf: page.portfolio.asOf, consentVersion: page.portfolio.consentVersion,
        complete: page.portfolio.complete, nextCursor: page.nextCursor, items});
  };
  return {
    clear: () => { generation++; jobs.clear(); },
    load: signal => loadPage(undefined, signal),
    loadPage,
    approve: (id, input, signal) => api.approveExperienceTags(id, input, signal),
    revoke: (id, input, signal) => api.revokeExperienceTags(id, input, signal),
    async create(input, signal) {
      return api.createWorkspace({itemId: 'experience-' + crypto.randomUUID().replaceAll('-', ''),
        value: {kind: 'EXPERIENCE', dataMode: 'OWNER_CONSENTED', state: 'SELF_REPORTED', ...input}}, signal);
    },
    async remove(id, contentVersion, signal) {
      const receipt = await api.deleteWorkspace('EXPERIENCE', id, contentVersion, signal);
      jobs.delete(id);
      return receipt;
    },
    async requestCandidates(selection, signal) {
      const currentRequest = guard(signal);
      const prepared = await api.prepareExperienceSkills({experienceIds: selection.map(i => i.experienceId)}, signal);
      currentRequest();
      // Validate the entire batch before any paid provider request can begin.
      for (const input of prepared.items) {
        const shown = selection.find(i => i.experienceId === input.experienceId);
        if (!shown || shown.contentVersion !== input.contentVersion || shown.consentVersion !== input.consentVersion)
          throw new HufsApiError('VERSION_CONFLICT', 409);
      }
      let ready = 0, pending = 0;
      for (const input of prepared.items) {
        currentRequest();
        const previous = jobs.get(input.experienceId);
        const job: Job = previous && previous.contentVersion === input.contentVersion
          && previous.consentVersion === input.consentVersion && previous.inputRef === input.inputRef && previous.asOf === input.asOf
          ? previous : {...input, key: crypto.randomUUID().replaceAll('-', '')};
        // Retain the key even on an uncertain network/503 result: retrying cannot create a second charge.
        jobs.set(input.experienceId, job);
        const accepted = job.accepted?.state === 'NEEDS_REVIEW' ? job.accepted
          : await api.submitApprovedProvider({inputRef: input.inputRef, operation: input.operation,
            asOf: input.asOf, expiresAt: input.expiresAt, task: 'experience_skills'}, 'experience-skills', job.key, signal);
        currentRequest();
        job.accepted = accepted;
        if (accepted.state === 'NEEDS_REVIEW') ready++; else pending++;
      }
      return {ready, pending, unavailable: prepared.unavailable.length};
    },
  };
}
