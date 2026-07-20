import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../travel-ui/Button';

interface TripPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TripPagination({ page, totalPages, onPageChange }: TripPaginationProps) {
  const { t } = useLanguage();
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800" aria-label={t('trips.paginationLabel')}>
      <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t('trips.previousPage')}
      </Button>
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {t('trips.pageSummary', { page, total: totalPages })}
      </span>
      <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {t('trips.nextPage')}
      </Button>
    </nav>
  );
}
