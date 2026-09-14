import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo, useRef } from 'react';
import { getBackend } from '../data/backend';
import { AuthSessionResetError, type AppUser } from '../data/domain/auth';
import type { BusinessProfile, PreferredCurrency, PreferredLanguage, UserProfile } from '../data/domain/profiles';
import { RestaurantStaff } from '../types/restaurant';
import { safeImageSrc } from '../lib/safeUrl';
import { getFriendlyAuthError } from '../lib/authNetwork';
import { canonicalBusinessImage, resolveBusinessImage, resolvePrivateSignature } from '../lib/businessImages';

const CACHE_KEY_BUSINESS_PROFILE = 'app_business_profile';
const CACHE_KEY_USER_PROFILE = 'app_user_profile';
const CACHE_KEY_STAFF_USER = 'app_staff_user';

interface AuthContextType {
  user: AppUser | null;
  profile: BusinessProfile | null;
  userProfile: UserProfile | null;
  staffUser: RestaurantStaff | null;
  loading: boolean;
  isAdmin: boolean;
  signUp: (
    email: string,
    password: string,
    businessName: string,
    logoUrl?: string,
    currency?: PreferredCurrency,
    language?: PreferredLanguage
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInStaff: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<BusinessProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sanitizeBusinessProfile = (profile: BusinessProfile | null): BusinessProfile | null => {
  if (!profile) return null;

  return {
    ...profile,
    logo_url: safeImageSrc(profile.logo_url),
    signature_url: safeImageSrc(profile.signature_url),
  };
};

/**
 * A resolved image is a display value, never a stored reference.
 *
 * `profile.logo_url` and `profile.signature_url` are resolved on read: a private signature
 * becomes a `data:` URL so it can render. Forms hold that resolved value in state, so a plain
 * save would write the whole base64 payload back over the storage reference and destroy it.
 * Dropping the key leaves the stored column untouched, which is what a form that did not change
 * the image should do. A genuine upload still passes, because uploadPrivateFile returns an
 * authenticated object reference rather than inline data.
 */
const isResolvedDisplayValue = (value: unknown): boolean =>
  typeof value === 'string' && /^(data:|blob:)/i.test(value.trim());

const sanitizeBusinessProfileUpdates = (
  updates: Partial<BusinessProfile>
): Partial<BusinessProfile> => {
  const { logo_url: _logo, signature_url: _signature, ...rest } = updates;
  void _logo;
  void _signature;
  return {
    ...rest,
    ...(Object.prototype.hasOwnProperty.call(updates, 'logo_url') && !isResolvedDisplayValue(updates.logo_url)
      ? { logo_url: canonicalBusinessImage(safeImageSrc(updates.logo_url)) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'signature_url') && !isResolvedDisplayValue(updates.signature_url)
      ? { signature_url: canonicalBusinessImage(safeImageSrc(updates.signature_url)) }
      : {}),
  };
};

export const __testing = { isResolvedDisplayValue, sanitizeBusinessProfileUpdates };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [staffUser, setStaffUser] = useState<RestaurantStaff | null>(null);
  const [loading, setLoading] = useState(true);

  // Track current user ID to avoid redundant fetches
  const lastUserIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  // Helper: Load from cache safely
  const loadFromCache = useCallback(() => {
    try {
      const cachedBusiness = localStorage.getItem(CACHE_KEY_BUSINESS_PROFILE);
      const cachedUser = localStorage.getItem(CACHE_KEY_USER_PROFILE);
      const cachedStaff = localStorage.getItem(CACHE_KEY_STAFF_USER);

      if (cachedBusiness) setProfile(sanitizeBusinessProfile(JSON.parse(cachedBusiness)));
      if (cachedUser) setUserProfile(JSON.parse(cachedUser));
      if (cachedStaff) setStaffUser(JSON.parse(cachedStaff));
    } catch (e) {
      console.error('Cache parse error', e);
    }
  }, []);

  const fetchWithTimeoutOrNull = async <T,>(promise: Promise<T>, ms = 60000): Promise<T | null> => {
    try {
      const result = await Promise.race<Promise<T>>([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms)),
      ]);
      return result;
    } catch (e) {
      console.warn('[Auth] fetch timed out or failed', e);
      return null;
    }
  };

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const data = await getBackend().profiles.fetchBusinessProfile(userId);
      if (!data) return null;
      const [logo_url, signature_url] = await Promise.all([
        resolveBusinessImage(data.logo_url), resolvePrivateSignature(data.signature_url),
      ]);
      return sanitizeBusinessProfile({ ...data, logo_url, signature_url } as BusinessProfile);
    } catch (e) {
      console.error('Error fetching profile:', e);
      return null;
    }
  }, []);

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      return await getBackend().profiles.fetchUserProfile(userId);
    } catch (e) {
      console.error('Error fetching user profile:', e);
      return null;
    }
  }, []);

  // Refresh profile data in the background and keep the cache current.
  const refreshUserData = useCallback(async (userId: string) => {
    if (refreshInFlightRef.current?.userId === userId) {
      return refreshInFlightRef.current.promise;
    }

    const refreshPromise = (async () => {
      console.log('[Auth] Refreshing data in background...');
      const [profileData, userProfileData] = await Promise.all([
        fetchWithTimeoutOrNull(fetchProfile(userId)),
        fetchWithTimeoutOrNull(fetchUserProfile(userId)),
      ]);

      if (profileData) {
        setProfile((prev: BusinessProfile | null) => {
          if (JSON.stringify(prev) !== JSON.stringify(profileData)) {
            localStorage.setItem(CACHE_KEY_BUSINESS_PROFILE, JSON.stringify(profileData));
            return profileData;
          }
          return prev;
        });
      }

      if (userProfileData) {
        setUserProfile((prev: UserProfile | null) => {
          if (JSON.stringify(prev) !== JSON.stringify(userProfileData)) {
            localStorage.setItem(CACHE_KEY_USER_PROFILE, JSON.stringify(userProfileData));
            return userProfileData;
          }
          return prev;
        });

        if (userProfileData.is_suspended) {
          await getBackend().auth.signOut();
          window.location.reload();
        }
      }
    })().finally(() => {
      if (refreshInFlightRef.current?.promise === refreshPromise) {
        refreshInFlightRef.current = null;
      }
    });

    refreshInFlightRef.current = { userId, promise: refreshPromise };
    return refreshPromise;
  }, [fetchProfile, fetchUserProfile]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => { void refreshUserData(user.id); }, 300000);
    return () => window.clearInterval(timer);
  }, [user, refreshUserData]);

  useEffect(() => {
    let mounted = true;

    // 1. Load the cache before any network call.
    loadFromCache();

    const initSession = async () => {
      try {
        // 2. Resolve the session (usually fast).
        const sessionUser = await getBackend().auth.getSessionUser();

        if (!mounted) return;

        if (sessionUser) {
           setUser(sessionUser);
           lastUserIdRef.current = sessionUser.id;

           // 3. Refresh profile data in the background without holding the loading state.
           refreshUserData(sessionUser.id);
        } else {
           // No session: clear account data. A cached staff session is kept for offline refresh.
           setUser(null);
           setProfile(null);
           setUserProfile(null);
           lastUserIdRef.current = null;
        }
      } catch (err: unknown) {
        console.error('Auth load error:', err);
        if (err instanceof AuthSessionResetError) {
          // The gateway wiped an unusable stored session; clear the app caches and reset state.
          Object.keys(localStorage).forEach(key => {
            if (
              key === CACHE_KEY_BUSINESS_PROFILE ||
              key === CACHE_KEY_USER_PROFILE ||
              key === CACHE_KEY_STAFF_USER
            ) {
              localStorage.removeItem(key);
            }
          });

          if (mounted) {
            setUser(null);
            setProfile(null);
            setUserProfile(null);
            setStaffUser(null);
            lastUserIdRef.current = null;
          }
        }
      } finally {
        // 4. Stop loading: the cache and session are enough to render.
        if (mounted) setLoading(false);
      }
    };

    initSession();

    const unsubscribe = getBackend().auth.onAuthStateChange(async (sessionUser) => {
      if (!mounted) return;

      if (sessionUser) {
        // Same user: nothing heavy to do.
        if (sessionUser.id === lastUserIdRef.current) {
             return;
        }

        setUser(sessionUser);
        lastUserIdRef.current = sessionUser.id;

        // Background refresh.
        refreshUserData(sessionUser.id);
      } else {
        setUser(null);
        setProfile(null);
        setUserProfile(null);
        // Note: Staff logout is handled manually usually.
        lastUserIdRef.current = null;
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [loadFromCache, refreshUserData]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    businessName: string,
    logoUrl?: string,
    currency: PreferredCurrency = 'USD',
    language: PreferredLanguage = 'en'
  ) => {
    const created = await getBackend().auth.signUp(email, password);
    if (created) {
      await getBackend().profiles.createOwnerProfiles(created.id, email, {
        businessName,
        logoUrl: safeImageSrc(logoUrl),
        currency: currency || 'USD',
        language: language || 'en',
      });
      // Refresh immediately
      await refreshUserData(created.id);
    }
  }, [refreshUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const signedIn = await getBackend().auth.signIn(email, password);
    if (signedIn) {
       await refreshUserData(signedIn.id);
    }
  }, [refreshUserData]);

  const signInStaff = useCallback(async (email: string, password: string) => {
    let result;
    try {
      result = await getBackend().auth.signInStaff(email, password);
    } catch (error) {
      throw new Error(getFriendlyAuthError(error));
    }

    // Set persistence
    const staff = result.staff;
    const businessProfile = sanitizeBusinessProfile(result.businessProfile);

    setStaffUser(staff);
    setProfile(businessProfile); // Reuse profile for business settings context
    localStorage.setItem(CACHE_KEY_STAFF_USER, JSON.stringify(staff));
    localStorage.setItem(CACHE_KEY_BUSINESS_PROFILE, JSON.stringify(businessProfile));

  }, []);

  const signOut = useCallback(async () => {
    try {
      await getBackend().auth.signOut();
    } catch (err) {
      console.warn('[Auth] SignOut error:', err);
    } finally {
      setUser(null);
      setProfile(null);
      setUserProfile(null);
      setStaffUser(null);
      lastUserIdRef.current = null;
      localStorage.removeItem(CACHE_KEY_BUSINESS_PROFILE);
      localStorage.removeItem(CACHE_KEY_USER_PROFILE);
      localStorage.removeItem(CACHE_KEY_STAFF_USER);
      localStorage.removeItem('new_trip_draft');
      // Clean trip cache
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('elite_travels_') || key.startsWith('new_trip_draft:')) {
          localStorage.removeItem(key);
        }
      });
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<BusinessProfile>) => {
    if (!user) throw new Error('No user');

    // We no longer filter out these fields as they are now in the schema
    const sanitizedUpdates = sanitizeBusinessProfileUpdates(updates);
    await getBackend().profiles.updateBusinessProfile(user.id, sanitizedUpdates);

    // We update the local state manually with ALL fields so the UI reflects the change (until refresh)
    setProfile((prev: BusinessProfile | null) => prev ? ({ ...prev, ...sanitizedUpdates }) : null);

    // await refreshUserData(user.id); // This would overwrite our optimistic update if DB doesn't have fields
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user) await refreshUserData(user.id);
  }, [user, refreshUserData]);

  const value = useMemo(() => ({
    user, profile, userProfile, loading, isAdmin: userProfile?.role === 'admin',
    signUp, signIn, signOut, updateProfile, refreshProfile,
    staffUser, signInStaff
  }), [user, profile, userProfile, loading, staffUser, signUp, signIn, signInStaff, signOut, updateProfile, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
