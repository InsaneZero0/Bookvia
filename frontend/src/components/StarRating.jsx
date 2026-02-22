import { Star, StarHalf } from 'lucide-react';
import { generateStars } from '@/lib/utils';

export function StarRating({ rating, showValue = true, size = 'default' }) {
  const { fullStars, hasHalfStar, emptyStars } = generateStars(rating);
  
  const starSize = size === 'small' ? 'h-3 w-3' : size === 'large' ? 'h-6 w-6' : 'h-4 w-4';
  const textSize = size === 'small' ? 'text-xs' : size === 'large' ? 'text-lg' : 'text-sm';

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[...Array(fullStars)].map((_, i) => (
          <Star key={`full-${i}`} className={`${starSize} fill-yellow-400 text-yellow-400`} />
        ))}
        {hasHalfStar && (
          <StarHalf className={`${starSize} fill-yellow-400 text-yellow-400`} />
        )}
        {[...Array(emptyStars)].map((_, i) => (
          <Star key={`empty-${i}`} className={`${starSize} text-slate-300 dark:text-slate-600`} />
        ))}
      </div>
      {showValue && (
        <span className={`${textSize} font-medium text-slate-600 dark:text-slate-400 ml-1`}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
