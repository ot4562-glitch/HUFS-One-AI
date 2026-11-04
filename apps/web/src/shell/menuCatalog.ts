import {getHufsAbilityManifest, type HufsAbilityMenuManifest} from '@hufs-one/contracts';

/**
 * #124 / #141 HUFSAbility 메뉴 수용 — UI-side menu catalog.
 *
 * HUFSAbility's own menus come from the versioned capability manifest (packages/contracts
 * hufsability/manifest, the single source of truth). The UI never decides that an original function
 * works: an item opens an in-app screen only when the manifest marks it DEMO_AVAILABLE with a reviewed
 * route. Today that is none of them, so all 24 are shown disabled, and the 4 public areas only link to
 * the official HUFSAbility home. HUFS One AI's own screens are listed separately as 확장, never as
 * something HUFSAbility already offers.
 */

export type MenuStatus = HufsAbilityMenuManifest['publicEntries'][number]['state'];
/** ORIGINAL = HUFSAbility's own function (manifest); EXTENSION = new in HUFS One AI. */
export type MenuKind = 'ORIGINAL' | 'EXTENSION';

export interface MenuItem {
  readonly id: string;
  /** Official display name for HUFSAbility items, our name for extensions. */
  readonly label: string;
  readonly kind: MenuKind;
  readonly status: MenuStatus;
  /** In-app route; present only when status is DEMO_AVAILABLE. */
  readonly route?: string;
  /** Official HUFSAbility address; present only when status is OFFICIAL_LINK_ONLY. */
  readonly officialUrl?: string;
  /** Manifest wording, e.g. "🚫 미지원"; absent only for working screens. */
  readonly disabledText?: string;
}

export interface MenuGroup {
  readonly id: string;
  readonly label: string;
  readonly origin: 'HUFS_ONE_AI' | 'HUFSABILITY' | 'HUFSABILITY_PUBLIC';
  readonly items: readonly MenuItem[];
}

const manifest = getHufsAbilityManifest();

export const MENU_SOURCE = {
  title: 'HUFSAbility 공식 기능 소개(학생지원)',
  url: manifest.source.url,
  observedOn: manifest.source.observedOn,
  version: manifest.version,
} as const;

/** Verified public address from the manifest; opening it leaves our service. */
export const OFFICIAL_HUFSABILITY_URL = manifest.officialHomepage;

type ManifestItem = HufsAbilityMenuManifest['publicEntries'][number];
const original = (i: ManifestItem): MenuItem => ({
  id: i.id, label: i.label, kind: 'ORIGINAL', status: i.state,
  ...(i.state === 'DEMO_AVAILABLE' && i.internalRoute ? {route: i.internalRoute} : {}),
  ...(i.state === 'OFFICIAL_LINK_ONLY' && i.officialUrl ? {officialUrl: i.officialUrl} : {}),
  ...(i.disabledText ? {disabledText: i.disabledText} : {}),
});
const ext = (id: string, label: string, route: string): MenuItem => ({id, label, kind: 'EXTENSION', status: 'DEMO_AVAILABLE', route});

export const MENU_GROUPS: readonly MenuGroup[] = [
  {id: 'hufs-one-ai', label: 'HUFS One AI 확장', origin: 'HUFS_ONE_AI', items: [
    ext('ext-today', '오늘', '/'),
    ext('ext-opportunities', '맞춤 기회', '/opportunities'),
    ext('ext-notices', '학사 공지', '/notices'),
    ext('ext-graduation', '졸업지원', '/graduation'),
    ext('ext-experience', '나의 경험', '/experience'),
    ext('ext-saved', '보관함', '/saved'),
    ext('ext-applications', '지원 현황', '/applications'),
    ext('ext-clubs', '동아리 모집', '/clubs'),
  ]},
  ...manifest.categories.map((c): MenuGroup => ({id: c.id, label: c.label, origin: 'HUFSABILITY', items: c.items.map(original)})),
  {id: 'public', label: '공개 안내', origin: 'HUFSABILITY_PUBLIC', items: manifest.publicEntries.map(original)},
];

/** Screen-reader wording per state (the visible tag is the manifest's disabledText). */
export const STATUS_TEXT: Readonly<Record<MenuStatus, string>> = {
  DEMO_AVAILABLE: '시연 가능',
  OFFICIAL_LINK_ONLY: '이 서비스에서는 제공하지 않으며 학교 공식 HUFSAbility 첫 화면으로 이동합니다',
  NOT_IMPLEMENTED: '이번 시연 미지원',
  UNVERIFIED: '검증 전',
};
