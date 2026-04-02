import { Link } from 'react-router-dom';

const StarIcon = ({ className = '' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
    <path d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2Z" />
  </svg>
);

/**
 * Bookvia Logo with sparkle accent on the "i"
 * @param {'dark'|'light'} variant - 'dark' for dark backgrounds, 'light' for light backgrounds
 * @param {string} size - tailwind text size class (e.g., 'text-xl', 'text-2xl')
 * @param {boolean} asLink - wrap in Link to home
 * @param {string} className - additional classes
 */
export function BookviaLogo({ variant = 'dark', size = 'text-xl', asLink = false, className = '', ...props }) {
  const bookColor = variant === 'dark' ? 'text-white' : 'text-[#1F2430]';
  const viaColor = 'text-[#F05D5E]';

  const content = (
    <span className={`font-heading font-bold ${size} tracking-tight inline-flex items-baseline ${className}`} {...props}>
      <span className={bookColor}>Book</span>
      <span className={`${viaColor} relative`}>
        v
        <span className="relative inline-block">
          <span className="invisible">i</span>
          <span className="absolute inset-0 flex items-center justify-center">i</span>
          <StarIcon className="absolute -top-[0.55em] left-1/2 -translate-x-1/2 w-[0.5em] h-[0.5em] text-[#F05D5E]" />
        </span>
        a
      </span>
    </span>
  );

  if (asLink) {
    return (
      <Link to="/" className="no-underline hover:opacity-90 transition-opacity" data-testid="logo-link">
        {content}
      </Link>
    );
  }

  return content;
}
