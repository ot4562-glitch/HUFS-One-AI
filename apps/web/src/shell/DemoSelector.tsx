import type {SubjectAlias} from '@hufs-one/contracts';
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
  const result = state.profiles.length ? buildSelectorSlots({profiles: state.profiles}) : null;
  const slots = result?.ok ? result.slots : [];
  const current = slots.find(s => s.demoSubjectId === state.selected);
  return (
    <details className="selector">
      <summary className="selector__summary">
        <span className="selector__caption">시연 대상</span>
        <span className="selector__current">{current ? current.label : '선택 안 됨'}</span>
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
