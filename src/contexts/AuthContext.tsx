import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, BusinessProfile } from '../lib/supabase';
import type { Database } from '../types/supabase';

const CACHE_KEY_BUSINESS_PROFILE = 'app_business_profile';
const CACHE_KEY_USER_PROFILE = 'app_user_profile';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

interface AuthContextType {
  user: User | null;
  profile: BusinessProfile | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signUp: (
    email: string,
    password: string,
    businessName: string,
    logoUrl?: string,
    currency?: string,
    language?: string
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<BusinessProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Track current user ID to avoid redundant fetches
  const lastUserIdRef = useRef<string | null>(null);

  // Helper: Load from cache safely
  const loadFromCache = useCallback(() => {
    try {
      const cachedBusiness = localStorage.getItem(CACHE_KEY_BUSINESS_PROFILE);
      const cachedUser = localStorage.getItem(CACHE_KEY_USER_PROFILE);
      
      if (cachedBusiness) setProfile(JSON.parse(cachedBusiness));
      if (cachedUser) setUserProfile(JSON.parse(cachedUser));
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
      return data as BusinessProfile | null;
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
    console.log('[Auth] Refreshing data in background...');
    const [profileData, userProfileData] = await Promise.all([
      fetchWithTimeoutOrNull(fetchProfile(userId)),
      fetchWithTimeoutOrNull(fetchUserProfile(userId)),
    ]);

    if (profileData) {
      setProfile(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(profileData)) {
          localStorage.setItem(CACHE_KEY_BUSINESS_PROFILE, JSON.stringify(profileData));
          return profileData;
        }
        return prev;
      });
    }

    if (userProfileData) {
      setUserProfile(prev => {
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
  }, [fetchProfile, fetchUserProfile]);

  useEffect(() => {
    let mounted = true;

    // 1. تحميل الكاش فوراً قبل أي اتصال بالإنترنت
    loadFromCache();

    const initSession = async () => {
      try {
        // 2. التحقق من الجلسة (سريع عادةً)
        const { data: { session } } = await supabase.auth.getSession();
        
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
           lastUserIdRef.current = null;
        }
      } catch (e) {
        console.error('Auth load error:', e);
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
    email: string, password: string, businessName: string, logoUrl?: string, currency = 'USD', language = 'en'
  ) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      // Create profiles...
      await supabase.from('business_profiles').insert([{
        user_id: data.user.id,
        business_name: businessName,
        logo_url: logoUrl || null,
        preferred_currency: currency as 'USD' | 'EUR' | 'ILS',
        preferred_language: language as 'en' | 'ar' | 'he'
      }]);
      await supabase.from('user_profiles').insert([{
        user_id: data.user.id, full_name: businessName || email, role: 'user', is_suspended: false
      }]);
      // Refresh immediately
      await refreshUserData(data.user.id);
    }
  }, [refreshUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
       await refreshUserData(data.user.id);
    }
  }, [refreshUserData]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setProfile(null);
      setUserProfile(null);
      lastUserIdRef.current = null;
      localStorage.removeItem(CACHE_KEY_BUSINESS_PROFILE);
      localStorage.removeItem(CACHE_KEY_USER_PROFILE);
      // Clean trip cache
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('elite_travels_')) localStorage.removeItem(key);
      });
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<BusinessProfile>) => {
    if (!user) throw new Error('No user');
    const { error } = await supabase.from('business_profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) throw error;
    await refreshUserData(user.id);
  }, [user, refreshUserData]);

  const refreshProfile = useCallback(async () => {
    if (user) await refreshUserData(user.id);
  }, [user, refreshUserData]);

  const value = useMemo(() => ({
    user, profile, userProfile, loading, isAdmin: userProfile?.role === 'admin',
    signUp, signIn, signOut, updateProfile, refreshProfile
  }), [user, profile, userProfile, loading, signUp, signIn, signOut, updateProfile, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}