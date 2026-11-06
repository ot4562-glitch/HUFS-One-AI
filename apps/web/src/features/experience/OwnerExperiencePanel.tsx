import {useEffect, useMemo, useSyncExternalStore} from 'react';
import type {OwnerSessionController} from '../../app/owner-session-controller.js';
import {attachDemoResumeRevalidation} from '../../app/resume-listener.js';
import {attachCrossTabSessionClosure, SESSION_CLOSE_CHANNEL} from '../../app/session-broadcast.js';
import {ExperienceReviewPanel, type ExperienceReviewScope} from './ExperienceSkillReview.js';
import type {ExperienceSkillPort} from './experienceSkillPort.js';

export interface OwnerExperiencePort {
  readonly session: OwnerSessionController;
  readonly skills: ExperienceSkillPort;
}

/** BETA owner identity is independent of the selected S01–S05 demo subject. */
export function OwnerExperiencePanel({port}: {port: OwnerExperiencePort}) {
  const state = useSyncExternalStore(port.session.subscribe, port.session.getState, port.session.getState);
  useEffect(() => { void port.session.initialize(); }, [port]);
  useEffect(() => attachDemoResumeRevalidation(port.session, {page: document, view: window}), [port.session]);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SESSION_CLOSE_CHANNEL);
    const detach = attachCrossTabSessionClosure(port.session, channel);
    return () => { detach(); channel.close(); };
  }, [port.session]);
  useEffect(() => {
    const clearIfClosed = () => {
      const status = port.session.getState().status;
      if (status !== 'IDLE' && status !== 'CHECKING' && status !== 'READY') port.skills.clear?.();
    };
    // The controller proves the same actor across harmless focus/resume checks.
    // Retain only submit receipts so returning to this route cannot duplicate a paid request.
    // Epoch/AbortSignal guards still erase the visible page and reject late results.
    clearIfClosed();
    return port.session.subscribe(clearIfClosed);
  }, [port]);
  const scope = useMemo<ExperienceReviewScope>(() => ({key: `owner:${state.epoch}`, ready: state.status === 'READY',
    read: run => port.session.runLatest('owner-experience-review', run),
    mutate: run => port.session.runMutation(run),
  }), [port, state.epoch, state.status]);
  if (state.status === 'IDLE' || state.status === 'CHECKING') return <p aria-busy="true">본인 경험의 권한과 현재 동의를 확인하고 있습니다.</p>;
  if (state.status !== 'READY') return <p role="alert">본인 경험의 인증·공유 허용 또는 현재 동의를 확인할 수 없습니다. 이전 경험과 AI 후보를 비웠습니다. 다시 로그인하거나 권한을 확인해 주세요.</p>;
  return <ExperienceReviewPanel key={scope.key} scope={scope} port={port.skills} />;
}
