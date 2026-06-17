import { useState } from 'react';

/**
 * SmartImage — Renders an <img> with an elegant fallback when the source
 * fails to load (404, network error, missing CDN file, etc).
 *
 * The fallback shows a coral gradient block with the first letter of `name`
 * centered, so cards never display a broken-image icon to end users.
 *
 * Usage:
 *   <SmartImage src={business.cover_photo} name={business.name} className="..." />
 */
export default function SmartImage({
  src,
  name = '',
  alt,
  className = '',
  fallbackClassName = '',
  ...rest
}) {
  const [errored, setErrored] = useState(false);
  const hasSrc = Boolean(src) && !errored;

  if (hasSrc) {
    return (
      <img
        src={src}
        alt={alt || name}
        onError={() => setErrored(true)}
        className={className}
        loading="lazy"
        {...rest}
      />
    );
  }

  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      aria-label={alt || name}
      className={`flex items-center justify-center bg-gradient-to-br from-[#F05D5E] to-[#c43a3b] text-white font-bold select-none ${className} ${fallbackClassName}`}
      data-testid="smart-image-fallback"
      {...rest}
    >
      <span className="text-[clamp(1.5rem,8vw,4rem)] drop-shadow-sm">{initial}</span>
    </div>
  );
}
