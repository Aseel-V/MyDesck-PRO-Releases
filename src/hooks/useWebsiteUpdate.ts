import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { APP_VERSION, deferWebsiteUpdate, fetchWebsiteVersionMetadata, isNewerWebsiteVersion, shouldDeferWebsiteUpdate, type WebsiteVersionMetadata } from '../lib/websiteRelease';

interface WebsiteUpdateState {
  metadata: WebsiteVersionMetadata | null;
  serviceWorkerReady: boolean;
}

export function useWebsiteUpdate(enabled: boolean) {
  const [state, setState] = useState<WebsiteUpdateState>({ metadata: null, serviceWorkerReady: false });
  const updateServiceWorker = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const reloaded = useRef(false);
  const reloadTriggered = useRef(false);

  const safeReload = useCallback(() => {
    if (reloadTriggered.current) return;
    reloadTriggered.current = true;
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void fetchWebsiteVersionMetadata().then((metadata) => {
      if (!active || !metadata || !isNewerWebsiteVersion(metadata.version, APP_VERSION) || shouldDeferWebsiteUpdate(metadata.version)) return;
      setState((previous) => ({ ...previous, metadata }));
    });
    updateServiceWorker.current = registerSW({
      immediate: true,
      onNeedRefresh() { if (active) setState((previous) => ({ ...previous, serviceWorkerReady: true })); },
    });
    return () => { active = false; };
  }, [enabled]);

  const dismiss = useCallback(() => {
    if (state.metadata) deferWebsiteUpdate(state.metadata.version);
    setState((previous) => ({ ...previous, metadata: null }));
  }, [state.metadata]);

  const updateNow = useCallback(async () => {
    if (reloaded.current) return;
    reloaded.current = true;
    try {
      if (state.serviceWorkerReady && updateServiceWorker.current) {
        const timer = setTimeout(() => {
          safeReload();
        }, 1500);

        const onControllerChange = () => {
          clearTimeout(timer);
          safeReload();
        };

        if (navigator.serviceWorker) {
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        }

        await updateServiceWorker.current(true);
        return;
      }
    } catch (error) {
      console.error('Service worker update failed, reloading:', error);
    }
    safeReload();
  }, [state.serviceWorkerReady, safeReload]);

  return { metadata: state.metadata, dismiss, updateNow };
}
