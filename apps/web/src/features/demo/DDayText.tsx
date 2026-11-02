import type {DDayView} from './dday.js';

/** Calm D-day label: no accent colour or icon; screen readers hear "4일 남음" instead of "D-4". */
export function DDayText({dday}: {dday: DDayView}) {
  return (
    <span className="dday">
      <span aria-hidden="true">{dday.text}</span>
      <span className="visually-hidden">{dday.spoken}</span>
    </span>
  );
}
