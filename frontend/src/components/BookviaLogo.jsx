import { Link } from 'react-router-dom';

const StarIcon = ({ className = '', style = {} }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2Z" />
  </svg>
);

export function BookviaLogo({ variant = 'dark', size = 'text-xl', asLink = false, className = '', ...props }) {
  const bookColor = variant === 'dark' ? 'text-white' : 'text-[#1F2430]';

  const content = (
    <span className={`font-heading font-bold ${size} tracking-tight ${className}`} data-testid="bookvia-logo" {...props}>
      <span className={bookColor}>Book</span>
      <span className="text-[#F05D5E]">v</span>
      <span className="text-[#F05D5E] relative">
        i
        <StarIcon className="absolute text-[#F05D5E]" style={{ 
          width: '0.55em', height: '0.55em', 
          top: '-0.45em', left: '50%', transform: 'translateX(-50%)'
        }} />
      </span>
      <span className="text-[#F05D5E]">a</span>
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
