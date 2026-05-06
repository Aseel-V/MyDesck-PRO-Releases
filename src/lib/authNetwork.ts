const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface SupabasePublicConfig {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
}

export interface SupabaseRequestDebugInfo {
  url: string;
  method: string;
  origin: string | null;
  isSecureContext: boolean | null;
}

const getWindowContext = () => {
  if (typeof window === 'undefined') {
    return {
      origin: null,
      isSecureContext: null,
      hostname: null,
      protocol: null,
    };
  }

  return {
    origin: window.location.origin,
    isSecureContext: window.isSecureContext,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
  };
};

export const resolveSupabaseRequestInfo = (
  input: RequestInfo | URL,
  init?: RequestInit
): SupabaseRequestDebugInfo => {
  const request = input instanceof Request ? input : null;
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : request?.url ?? 'unknown';
  const method = init?.method ?? request?.method ?? 'GET';
  const { origin, isSecureContext } = getWindowContext();

  return {
    url,
    method: method.toUpperCase(),
    origin,
    isSecureContext,
  };
};

export const isAuthTransportError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    normalized.includes('network request failed') ||
    normalized.includes('fetch failed')
  );
};

export const shouldAttemptStaffFallback = (error: unknown): boolean => {
  if (isAuthTransportError(error)) {
    return false;
  }

  const authError = error as { status?: number; message?: string; code?: string };
  const status = authError?.status;
  const message = authError?.message?.toLowerCase() ?? '';

  return (
    status === 400 ||
    status === 401 ||
    status === 422 ||
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    message.includes('email not confirmed') ||
    message.includes('invalid_grant')
  );
};

export const getFriendlyAuthError = (error: unknown): string => {
  const authError = error as { message?: string };
  const message = authError?.message ?? '';

  if (isAuthTransportError(error)) {
    return 'Unable to reach the sign-in service. If you opened the app from another device, verify the app server is reachable on the network and that the browser can access Supabase over HTTPS.';
  }

  if (!message) {
    return 'Sign-in failed. Please try again.';
  }

  if (message.toLowerCase().includes('invalid login credentials')) {
    return 'Invalid email or password.';
  }

  return message;
};

export const validateSupabasePublicConfig = (
  config: SupabasePublicConfig
): { valid: boolean; apiBaseUrl: string | null } => {
  const { supabaseUrl, supabaseAnonKey } = config;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[Auth Config] Missing public Supabase environment variables. Expected VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );

    return { valid: false, apiBaseUrl: null };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch (error) {
    console.error('[Auth Config] Invalid VITE_SUPABASE_URL value.', error);
    return { valid: false, apiBaseUrl: null };
  }

  const { origin, hostname, protocol } = getWindowContext();
  const apiBaseUrl = parsedUrl.origin;

  console.info('[Auth Config] Runtime auth diagnostics', {
    appOrigin: origin,
    apiBaseUrl,
    isSecureContext: getWindowContext().isSecureContext,
  });

  if (
    hostname &&
    !LOCAL_HOSTS.has(hostname) &&
    LOCAL_HOSTS.has(parsedUrl.hostname)
  ) {
    console.warn(
      '[Auth Config] The app is opened from another device, but the configured auth/API host points to localhost. Replace it with a network-reachable URL.'
    );
  }

  if (protocol === 'https:' && parsedUrl.protocol !== 'https:') {
    console.warn(
      '[Auth Config] Mixed content risk detected: the app is served over HTTPS but the configured auth/API URL is not HTTPS.'
    );
  }

  return { valid: true, apiBaseUrl };
};

export const createSupabaseFetchWithLogging = () => {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestInfo = resolveSupabaseRequestInfo(input, init);

    try {
      const response = await fetch(input, init);

      if (!response.ok) {
        console.warn('[Supabase Request] Non-OK response', {
          url: requestInfo.url,
          method: requestInfo.method,
          status: response.status,
          origin: requestInfo.origin,
        });
      }

      return response;
    } catch (error) {
      console.error('[Supabase Request] Fetch failed', {
        url: requestInfo.url,
        method: requestInfo.method,
        origin: requestInfo.origin,
        isSecureContext: requestInfo.isSecureContext,
        message: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
};
