import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, BusinessProfile } from '../lib/supabase';
import type { Database } from '../types/supabase';
import { RestaurantStaff } from '../types/restaurant';
import { safeImageSrc } from '../lib/safeUrl';
import { getFriendlyAuthError } from '../lib/authNetwork';

const CACHE_KEY_BUSINESS_PROFILE = 'app_business_profile';
const CACHE_KEY_USER_PROFILE = 'app_user_profile';
const CACHE_KEY_STAFF_USER = 'app_staff_user';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type PreferredCurrency = BusinessProfile['preferred_currency'];
type PreferredLanguage = BusinessProfile['preferred_language'];

interface AuthContextType {
  user: User | null;
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

const sanitizeBusinessProfileUpdates = (
  updates: Partial<BusinessProfile>
): Partial<BusinessProfile> => ({
  ...updates,
  ...(Object.prototype.hasOwnProperty.call(updates, 'logo_url')
    ? { logo_url: safeImageSrc(updates.logo_url) }
    : {}),
  ...(Object.prototype.hasOwnProperty.call(updates, 'signature_url')
    ? { signature_url: safeImageSrc(updates.signature_url) }
    : {}),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
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
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return sanitizeBusinessProfile(data as BusinessProfile | null);
    } catch (e) {
      console.error('Error fetching profile:', e);
      return null;
    }
  }, []);

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as UserProfile | null;
    } catch (e) {
      console.error('Error fetching user profile:', e);
      return null;
    }
  }, []);

  // دالة لتحديث البيانات وحفظها في الكاش (تعمل في الخلفية)
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
          await supabase.auth.signOut();
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
    let mounted = true;

    // 1. تحميل الكاش فوراً قبل أي اتصال بالإنترنت
    loadFromCache();

    const initSession = async () => {
      try {
        // 2. التحقق من الجلسة (سريع عادةً)
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (!mounted) return;

        if (session?.user) {
           setUser(session.user);
           lastUserIdRef.current = session.user.id;
           
           // 3. نطلب تحديث البيانات في الخلفية، ولا ننتظرها (لا نستخدم await هنا لتعطيل الـ loading)
           refreshUserData(session.user.id);
        } else {
           // إذا لم يكن هناك جلسة، نمسح البيانات
           setUser(null);
           setProfile(null);
           setUserProfile(null);
           // Do not clear staffUser here immediately if we want to allow offline/refresh, 
           // but normally staff session is tied to... local state. 
           // We'll keep staffUser if it exists in cache.
           lastUserIdRef.current = null;
        }
      } catch (err: unknown) {
        console.error('Auth load error:', err);
        const e = err as { message?: string };

        // Handle invalid refresh token by clearing local data
        // Handle invalid refresh token by clearing local data
        const errorMessage = e?.message || (e as { error_description?: string })?.error_description || JSON.stringify(e);
        if (
          errorMessage.includes('Invalid Refresh Token') || 
          errorMessage.includes('Refresh Token Not Found') ||
          errorMessage.includes('not found') // Catch generic "not found" which sometimes happens with tokens
        ) {
          console.warn('[Auth] Critical session error detected, wiping storage and resetting...');
          
          // 1. Attempt standard sign out
          await supabase.auth.signOut().catch(() => console.warn('SignOut failed during recovery'));
          
          // 2. Aggressively clear ALL Supabase-related keys from localStorage
          Object.keys(localStorage).forEach(key => {
            if (
              key.startsWith('sb-') || 
              key.startsWith('supabase.') || 
              key.startsWith('supabase.') || 
              key === CACHE_KEY_BUSINESS_PROFILE || 
              key === CACHE_KEY_USER_PROFILE ||
              key === CACHE_KEY_STAFF_USER
            ) {
              localStorage.removeItem(key);
            }
          });

          // 3. Reset internal state immediately
          if (mounted) {
            setUser(null);
            setProfile(null);
            setUserProfile(null);
            setStaffUser(null);
            lastUserIdRef.current = null;
          }
        }
      } finally {
        // 4. نوقف التحميل فوراً (لأن لدينا بيانات الكاش والجلسة، لا داعي لانتظار تحميل الملفات من النت)
        if (mounted) setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        // إذا كان نفس المستخدم، لا داعي لعمل أي شيء ثقيل
        if (session.user.id === lastUserIdRef.current) {
             return; 
        }

        setUser(session.user);
        lastUserIdRef.current = session.user.id;
        
        // تحديث في الخلفية
        refreshUserData(session.user.id);
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
      subscription.unsubscribe();
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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      // Create profiles...
      await supabase.from('business_profiles').insert([{
        user_id: data.user.id,
        business_name: businessName,
        logo_url: safeImageSrc(logoUrl),
        preferred_currency: currency || 'USD',
        preferred_language: language || 'en'
      }]);
      await supabase.from('user_profiles').insert([{
        user_id: data.user.id, 
        full_name: businessName || email, 
        role: 'user' as const, 
        is_suspended: false
      }]);
      // Refresh immediately
      await refreshUserData(data.user.id);
    }
  }, [refreshUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('[Auth] Primary sign-in failed:', {
        message: error.message,
        status: 'status' in error ? error.status : undefined,
      });
      throw new Error(getFriendlyAuthError(error));
    }
    if (data.user) {
       await refreshUserData(data.user.id);
    }
  }, [refreshUserData]);

  const signInStaff = useCallback(async (email: string, password: string) => {
    // Call RPC function
    const { data, error } = await supabase.rpc('authenticate_staff', {
      p_email: email,
      p_password: password
    });

    if (error) {
      console.warn('[Auth] Staff sign-in RPC failed:', {
        message: error.message,
        status: 'status' in error ? error.status : undefined,
      });
      throw new Error(getFriendlyAuthError(error));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = data as any;

    if (!result.success) {
      throw new Error(result.error || 'Login failed');
    }

    // Set persistence
    const staff = result.staff;
    const businessProfile = sanitizeBusinessProfile(result.business_profile);

    setStaffUser(staff);
    setProfile(businessProfile); // Reuse profile for business settings context
    localStorage.setItem(CACHE_KEY_STAFF_USER, JSON.stringify(staff));
    localStorage.setItem(CACHE_KEY_BUSINESS_PROFILE, JSON.stringify(businessProfile));
    
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('[Auth] SignOut warning:', error.message);
      }
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
    const { error } = await supabase.from('business_profiles').update({ 
      ...sanitizedUpdates,
      updated_at: new Date().toISOString() 
    }).eq('user_id', user.id);
    
    if (error) throw error;
    
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
