import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

const STORAGE_KEY = 'bookvia-active-branch-id';

/**
 * Global branch selector for the Business Dashboard.
 * Persists the active branch in localStorage so reloads remember the choice.
 *
 * Props:
 *   - value: current branch_id (or null for "All branches")
 *   - onChange(branch_id | null): called when user picks a different branch
 *   - language: 'es' | 'en'
 *   - className: optional extra classes
 */
export default function BranchSelector({ value, onChange, language = 'es', className = '' }) {
  const t = (es, en) => (language === 'es' ? es : en);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/businesses/me/branches');
        if (!mounted) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setBranches(list);
        // If no value yet but localStorage has one, restore it (if still active)
        if (!value) {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved && list.some(b => b.id === saved && b.is_active)) {
            onChange?.(saved);
          }
        }
      } catch { /* ignore — selector hides if no branches */ }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selection
  useEffect(() => {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  }, [value]);

  // If only 1 branch (legacy single-location), hide the selector entirely.
  const activeBranches = branches.filter(b => b.is_active);
  if (loading || activeBranches.length <= 1) return null;

  const current = activeBranches.find(b => b.id === value);
  const displayLabel = current ? current.name : t('Todas las sucursales', 'All branches');

  return (
    <div className={className} data-testid="branch-selector-wrapper">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-background hover:bg-muted/40 transition-colors text-sm font-medium" data-testid="branch-selector-trigger">
          <Building2 className="h-3.5 w-3.5 text-[#F05D5E]" />
          <span className="max-w-[180px] truncate" data-testid="branch-selector-current">{displayLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[240px]" data-testid="branch-selector-menu">
          <DropdownMenuItem
            onClick={() => onChange?.(null)}
            className="cursor-pointer"
            data-testid="branch-selector-all"
          >
            <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <span className="flex-1">{t('Todas las sucursales', 'All branches')}</span>
            {!value && <Check className="h-3.5 w-3.5 text-[#F05D5E]" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {activeBranches.map(b => (
            <DropdownMenuItem
              key={b.id}
              onClick={() => onChange?.(b.id)}
              className="cursor-pointer"
              data-testid={`branch-selector-option-${b.id}`}
            >
              <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate">{b.name}</span>
                  {b.is_primary && <Badge className="bg-[#F05D5E] text-white text-[9px] h-4 px-1">{t('Principal', 'Primary')}</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{b.city}</p>
              </div>
              {value === b.id && <Check className="h-3.5 w-3.5 text-[#F05D5E]" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
