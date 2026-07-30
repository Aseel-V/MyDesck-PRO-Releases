import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { fetchUnseenVisaPaymentArrivals, markVisaPaymentArrivalSeen } from '../lib/visaPaymentArrivals';

export function useVisaPaymentArrivals(enabled: boolean) {
  const { t } = useLanguage();
  const { format } = useCurrency();
  const client = useQueryClient();
  const announced = useRef(new Set<string>());
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const query = useQuery({
    queryKey: ['trip-notifications', 'visa-arrivals'],
    queryFn: fetchUnseenVisaPaymentArrivals,
    enabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!documentVisible) return;
    for (const arrival of query.data || []) {
      if (announced.current.has(arrival.id)) continue;
      announced.current.add(arrival.id);
      toast.success(t('notifications.travel.visaPaymentBody', {
        amount: format(arrival.amountMinor / 100, arrival.currency),
        destination: arrival.destination,
        confirmed: arrival.confirmedInstallments,
        total: arrival.installmentCount,
      }));
    }
  }, [documentVisible, format, query.data, t]);

  const markSeen = useMutation({
    mutationFn: markVisaPaymentArrivalSeen,
    onSuccess: () => client.invalidateQueries({ queryKey: ['trip-notifications'] }),
  });
  const arrivals = query.data;
  const byTrip = useMemo(() => {
    const map = new Map<string, NonNullable<typeof arrivals>[number]>();
    for (const arrival of arrivals || []) if (!map.has(arrival.tripId)) map.set(arrival.tripId, arrival);
    return map;
  }, [arrivals]);

  const markArrivalSeen = useCallback((id: string) => markSeen.mutate(id), [markSeen]);
  return { byTrip, markSeen: markArrivalSeen };
}
