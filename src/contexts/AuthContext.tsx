import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, BusinessProfile } from '../lib/supabase';
import type { Database } from '../types/supabase';

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
  const [profile, setProfile] = useState<Database['public']['Tables']['business_profiles']['Row'] | null>(null);
  const [userProfile, setUserProfile] = useState<Database['public']['Tables']['user_profiles']['Row'] | null>(null);
  const [loading, setLoading] = useState(true);

  // Prevent loading from hanging forever if a query stalls (never throws)
  const fetchWithTimeoutOrNull = async <T,>(promise: Promise<T>, ms = 60000): Promise<T | null> => {

    try {
      // console.log(`[Auth] Starting fetch with timeout: ${ms}ms`);
      const result = await Promise.race<Promise<T>>([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms)),
      ]);
      // console.log(`[Auth] Fetch completed in ${Date.now() - start}ms`);
      return result;
    } catch (e: any) {
      console.warn('[Auth] fetch timed out or failed -> returning null. Error:', e?.message || e);
      if (e?.message !== 'Timed out') {
        console.error('[Auth] Detailed error:', e);
      }
      return null;
    }
  };

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      // console.log('[Auth] fetchProfile calling supabase...');
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as BusinessProfile | null;
    } catch (e) {
      console.error('Error fetching profile (exception):', e);
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

      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }

      return data as UserProfile | null;
    } catch (e) {
      console.error('Error fetching user profile (exception):', e);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      try {
        console.log('[Auth] initial load start');
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Auth] getSession resolved, session user id =', session?.user?.id);
        
        if (!mounted) return;

        if (session?.user) {
           setUser(session.user);
           console.log('[Auth] fetching profiles for', session.user.id);
           const [profileData, userProfileData] = await Promise.all([
             fetchWithTimeoutOrNull(fetchProfile(session.user.id), 60000),
             fetchWithTimeoutOrNull(fetchUserProfile(session.user.id), 60000),
           ]);
           
           if (!mounted) return;

           setProfile(profileData);
           setUserProfile(userProfileData);
           
           if (userProfileData?.is_suspended) {
             await supabase.auth.signOut();
             if (mounted) {
                 setUser(null);
                 setProfile(null);
                 setUserProfile(null);
             }
           }
        } else {
           setUser(null);
           setProfile(null);
           setUserProfile(null);
        }
      } catch (e) {
        console.error('Initial auth session load error:', e);
        if (mounted) {
            setUser(null);
            setProfile(null);
            setUserProfile(null);
        }
      } finally {
        console.log('[Auth] initial load finally -> setLoading(false)');
        if (mounted) setLoading(false);
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      
      console.log('[Auth] onAuthStateChange', _event, 'session user =', session?.user?.id);

      // Optimization: Do nothing if the user ID is the same (e.g. token refresh)
      // We check 'user' from closure (which might be stale if we didn't use refs, but in useEffect without deps it is stale).
      // However, typical pattern:
      
      // Actually simpler:
      // If we strictly rely on session.user, we can set it.
      // But we want to avoid duplicate fetching.
      
      if (session?.user) {
        setUser((prev) => {
            if (prev?.id === session.user.id) return prev; // Keep strict equality reference if same ID
            return session.user;
        });

        // We can't easily access the *current* user state here to compare ID for fetching without ref/deps.
        // But we can check if we already have a profile for this user ID to avoid re-fetch?
        // Let's just fetch to be safe but lightweight.
        
        // BETTER: Check if we just did this? 
        // For now, let's keep the fetch but ensuring we only update state if valid.
        
        // Wait, if we use setUser above, we trigger re-render? No, state setter batching.
        
        // Fetch profiles
        const [profileData, userProfileData] = await Promise.all([
             fetchWithTimeoutOrNull(fetchProfile(session.user.id), 60000),
             fetchWithTimeoutOrNull(fetchUserProfile(session.user.id), 60000),
        ]);
        
        if (!mounted) return;
        
        // Only update if changed - React does this automatically for prims/refs, but objects are new.
        setProfile(prev => (JSON.stringify(prev) === JSON.stringify(profileData) ? prev : profileData));
        setUserProfile(prev => (JSON.stringify(prev) === JSON.stringify(userProfileData) ? prev : userProfileData));

        if (userProfileData?.is_suspended) {
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            setUserProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, fetchUserProfile]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    businessName: string,
    logoUrl?: string,
    currency: string = 'USD',
    language: string = 'en'
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      const userId = data.user.id;

      // 1) business_profiles
      const { error: profileError } = await supabase
        .from('business_profiles')
        .insert([
          {
            user_id: userId,
            business_name: businessName,
            logo_url: logoUrl || null,
            preferred_currency: currency as 'USD' | 'EUR' | 'ILS',
            preferred_language: language as 'en' | 'ar' | 'he',
          },
        ]);

      if (profileError) throw profileError;

      // 2) user_profiles (مهم لـ isAdmin و Dashboard)
      const { error: userProfError } = await supabase
        .from('user_profiles')
        .insert([
          {
            user_id: userId,
            full_name: businessName || email,
            phone_number: '',
            role: 'user',
            is_suspended: false,
          },
        ]);

      if (userProfError) throw userProfError;

      const newProfile = await fetchProfile(userId);
      setProfile(newProfile);
      const newUserProfile = await fetchUserProfile(userId);
      setUserProfile(newUserProfile);
    }
  }, [fetchProfile, fetchUserProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      const profileData = await fetchProfile(data.user.id);
      setProfile(profileData);
      const userProfileData = await fetchUserProfile(data.user.id);
      setUserProfile(userProfileData);
      if (userProfileData?.is_suspended) {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setUserProfile(null);
        throw new Error('Account is suspended. Contact admin.');
      }
    }
  }, [fetchProfile, fetchUserProfile]);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } finally {
      setUser(null);
      setProfile(null);
      setUserProfile(null);

      // تنظيف الكاش تبع الرحلات
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith('elite_travels_')) {
          localStorage.removeItem(key);
        }
      });
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<BusinessProfile>) => {
    if (!user) throw new Error('No user logged in'); // NOTE: Reference to 'user' in useCallback dependency

    const { error } = await supabase
      .from('business_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (error) throw error;

    const updatedProfile = await fetchProfile(user.id);
    setProfile(updatedProfile);
  }, [user, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user) return; // NOTE: Reference to 'user'
    const profileData = await fetchProfile(user.id);
    setProfile(profileData);
    const userProfileData = await fetchUserProfile(user.id);
    setUserProfile(userProfileData);
  }, [user, fetchProfile, fetchUserProfile]);

  const isAdmin = userProfile?.role === 'admin';

  // Optimization: Memoize the context value
  const value = useMemo(() => ({
    user,
    profile,
    userProfile,
    loading,
    isAdmin,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
  }), [user, profile, userProfile, loading, isAdmin, signUp, signIn, signOut, updateProfile, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
