import type {SubjectAlias} from '@hufs-one/contracts';
import {useRef} from 'react';
import type {DemoViewState} from '../app/demo-controller.js';
import {buildSelectorSlots} from '../features/demo/selectorSlots.js';

interface Props {
  readonly state: DemoViewState;
  readonly onSelect: (subject: SubjectAlias) => void;
}

/**
 * Five-slot demo subject switcher (accordion). Native radios give arrow-key navigation;
 * non-selectable slots (PENDING/REVOKED/no shared section) stay visible but disabled.
 */
export function DemoSelector({state, onSelect}: Props) {
  const summary = useRef<HTMLElement>(null);
  const result = state.profiles.length ? buildSelectorSlots({profiles: state.profiles}) : null;
  const slots = result?.ok ? result.slots : [];
  const current = slots.find(s => s.demoSubjectId === state.selected);
  const displayName = current?.label.split(' · ')[0]?.trim();
  return (
    <details className="selector" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; summary.current?.focus(); }
    }}>
      <summary className="selector__summary" ref={summary}>
        <span className="selector__caption">계정</span>
        <span className="selector__current">{displayName ? `${displayName}님, 안녕하세요` : '계정을 선택해 주세요'}</span>
      </summary>
      {result && !result.ok && <p role="alert">시연 대상 목록을 확인할 수 없습니다.</p>}
      {!result && (state.status === 'IDLE' || state.status === 'LOADING') && (
        <p className="selector__loading muted" aria-busy="true">시연 대상 목록을 불러오는 중</p>
      )}
      {slots.length > 0 && (
        <fieldset className="selector__list">
          <legend className="visually-hidden">시연 대상 선택 (5개 중 1개)</legend>
          {slots.map(slot => (
            <label key={slot.demoSubjectId} className={'selector__row' + (slot.selectable ? '' : ' is-disabled')}>
              <input
                type="radio"
                name="demo-subject"
                value={slot.demoSubjectId}
                checked={state.selected === slot.demoSubjectId}
                disabled={!slot.selectable}
                aria-label={slot.ariaLabel}
                onChange={() => onSelect(slot.demoSubjectId)}
              />
              <span className="selector__label">{slot.label}</span>
              <span className="badge">{slot.dataBadge}</span>
              <span className="selector__status">{slot.statusText}</span>
            </label>
          ))}
        </fieldset>
      )}
    </details>
  );
}
