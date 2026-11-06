import type {ClubCardView} from './clubView.js';
import {clubArtwork} from '../illustrations/artwork.js';
import {SyntheticArtwork} from '../illustrations/SyntheticArtwork.js';

/** Calm two-tone palettes from the HUFS tokens family; chosen by category, never meaning anything. */
const PALETTE: readonly [string, string][] = [
  ['#002D56', '#146E7A'], ['#146E7A', '#002D56'], ['#002D56', '#8D7150'], ['#3B4A5A', '#146E7A'], ['#0F4C5C', '#002D56'],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Synthetic poster drawn from the post's own fields (not an AI-generated image and not a real club poster).
 * Always carries the "가상 동아리 · 데모" mark, also inside the image itself.
 */
function FallbackPoster({club, size = 'card'}: {club: ClubCardView; size?: 'card' | 'detail'}) {
  const [bg, accent] = PALETTE[hash(club.posterSeed) % PALETTE.length]!;
  const h = hash(club.posterSeed + club.category);
  const title = club.name.replace(/^가상동아리\s*/, '');
  return (
    <svg className={`poster poster--${size}`} viewBox="0 0 300 200" role="img" aria-label={`${club.name} 가상 포스터 (데모)`}>
      <rect width="300" height="200" rx="16" fill={bg} />
      <circle cx={220 + (h % 40)} cy={40 + (h % 30)} r={60 + (h % 20)} fill={accent} opacity="0.55" />
      <circle cx={40 + (h % 50)} cy={170} r={36 + (h % 16)} fill="#FFFFFF" opacity="0.08" />
      <text x="20" y="34" fill="#FFFFFF" fontSize="12" opacity="0.85">{club.categoryText} · {club.campusText}</text>
      <text x="20" y="96" fill="#FFFFFF" fontSize={title.length > 9 ? 22 : 28} fontWeight="700">{title}</text>
      <text x="20" y="124" fill="#FFFFFF" fontSize="13" opacity="0.9">{club.lifecycleText}</text>
      <rect x="20" y="152" width="112" height="26" rx="13" fill="#FFFFFF" />
      <text x="76" y="170" fill={bg} fontSize="12" fontWeight="700" textAnchor="middle">가상 동아리 · 데모</text>
    </svg>
  );
}

/** Approved synthetic IDs use local responsive art; unknown IDs and failed loads retain the SVG. */
export function ClubPoster({club, size = 'card'}: {club: ClubCardView; size?: 'card' | 'detail'}) {
  const art = clubArtwork(club);
  const fallback = <FallbackPoster club={club} size={size} />;
  return art ? <SyntheticArtwork key={`${club.id}:${art.id}`} art={art} className={`poster--${size}`} fallback={fallback} /> : fallback;
}
