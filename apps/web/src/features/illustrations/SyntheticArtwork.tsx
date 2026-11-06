import {useState, type ReactNode} from 'react';
import type {Artwork} from './artwork.js';
import './illustrations.css';

/** The parent keys by artwork identity so a failure cannot carry into another card. */
export function SyntheticArtwork({art, fallback, className = ''}: {art: Artwork; fallback?: ReactNode; className?: string}) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback ?? <div className={`synthetic-art synthetic-art--missing ${className}`} role="img" aria-label="합성 예시 이미지 없음"><span>합성 예시 · 이미지 없음</span></div>;
  return <figure className={`synthetic-art ${className}`}>
    <picture>
      <source type="image/webp" srcSet={`${art.small} 480w, ${art.large} 960w`} sizes="(max-width: 767px) 90vw, (max-width: 1199px) 45vw, 420px" />
      <img src={art.small} width="960" height="540" loading="lazy" decoding="async" alt={art.alt} onError={() => setFailed(true)} />
    </picture>
    <figcaption>합성 예시 · 실제 모집 아님</figcaption>
  </figure>;
}
