import {DEFAULT_ERROR_MESSAGES} from '@hufs-one/contracts';
import type {DemoViewState} from '../app/demo-controller.js';
import {googleSignInPath} from '../integrations/api-client.js';

interface Props {
  readonly state: DemoViewState;
  readonly onRetry: () => void;
}

/** Architecture A11.3 state wording. Errors use the contract's safe messages only. */
export function StatusBanner({state, onRetry}: Props) {
  const message = state.error ? DEFAULT_ERROR_MESSAGES[state.error] : null;
  const label = state.profiles.find(p => p.demoSubjectId === state.selected)?.displayLabel;
  switch (state.status) {
    case 'IDLE':
      return <p className="banner" role="status">시연 대상을 선택해 주세요.</p>;
    case 'LOADING':
      return <p className="banner" role="status" aria-busy="true">선택한 학생의 정보를 불러오는 중</p>;
    case 'READY':
      return <p className="banner banner--ok" role="status">시연 대상: {label ?? state.selected}</p>;
    case 'REVOKED':
      return (
        <div className="banner banner--warn" role="alert">
          <p>{message ?? DEFAULT_ERROR_MESSAGES.SHARING_REVOKED} 이전 화면 정보는 지웠습니다.</p>
          <p>다른 시연 대상을 선택해 주세요.</p>
        </div>
      );
    case 'CONFLICT':
    case 'UNAVAILABLE':
    case 'INVALID':
      return (
        <div className="banner banner--warn" role="alert">
          <p>{state.status === 'INVALID' ? '받은 자료의 형식을 확인할 수 없어 표시하지 않았습니다.' : message}</p>
          <button type="button" className="button" onClick={onRetry}>
            {state.status === 'CONFLICT' ? '새로 불러오기' : '다시 시도'}
          </button>
        </div>
      );
    case 'SIGNED_OUT':
      return (
        <div className="banner banner--warn" role="alert">
          <p>{DEFAULT_ERROR_MESSAGES.UNAUTHENTICATED} 화면의 정보는 모두 지웠습니다.</p>
          {/* Full top-level navigation; never fetch an OAuth redirect. */}
          <a className="button" href={googleSignInPath('BETA')}>Google로 다시 로그인</a>
        </div>
      );
  }
}
