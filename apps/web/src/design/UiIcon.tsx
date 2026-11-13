import type {ReactNode, SVGProps} from 'react';

/**
 * Small, original and consistent stroke icons. Inspired by the organisation of
 * Iconly/3dicons galleries; no third-party icon artwork is copied into the repo.
 * The icon is decorative: every interactive destination retains visible text.
 */
export type UiIconName = 'search' | 'briefcase' | 'calendar' | 'book' | 'folder' | 'help' | 'check' | 'arrow' | 'layers';
type SvgProps = Pick<SVGProps<SVGSVGElement>, 'className' | 'width' | 'height'>;

export function UiIcon({name, className, width = 20, height = 20}: {name: UiIconName} & SvgProps) {
  const shared = {fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  const drawing = {
    search: <><circle cx="10.9" cy="10.9" r="6.4"/><path d="m15.7 15.7 4.3 4.3"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3 10h18M8 15h3M14 15h2M8 18h3"/></>,
    book: <><path d="M12 6C9.5 4.5 6.5 4 3 5v14c3.5-1 6.5-.5 9 1 2.5-1.5 5.5-2 9-1V5c-3.5-1-6.5-.5-9 1ZM12 6v14"/></>,
    folder: <><path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/><path d="M3 10h18"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.5 2.5 0 0 1 4.7 1.3c0 2.2-2.5 2.1-2.5 4.2M12 17.6h.01"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
  } satisfies Record<UiIconName, ReactNode>;
  return <svg {...shared} className={className} width={width} height={height} viewBox="0 0 24 24"
    aria-hidden="true" focusable="false">{drawing[name]}</svg>;
}
