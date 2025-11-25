import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  const fetchWithTimeoutOrNull = async <T,>(promise: Promise<T>, ms = 8000): Promise<T | null> => {
    try {
      return await Promise.race<Promise<T>>([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms)),
      ]);
    } catch (e) {
      console.warn('[Auth] fetch timed out or failed -> returning null');
      return null;
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
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
  };

  const fetchUserProfile = async (userId: string) => {
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
  };

  useEffect(() => {
    (async () => {
      try {
        console.log('[Auth] initial load start');
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Auth] getSession resolved, session user id =', session?.user?.id);
        setUser(session?.user ?? null);
        if (session?.user) {
          console.log('[Auth] fetching profiles for', session.user.id);
          const [profileData, userProfileData] = await Promise.all([
            fetchWithTimeoutOrNull(fetchProfile(session.user.id), 8000),
            fetchWithTimeoutOrNull(fetchUserProfile(session.user.id), 8000),
          ]);
          setProfile(profileData);
          setUserProfile(userProfileData);
          if (userProfileData?.is_suspended) {
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            setUserProfile(null);
          }
        } else {
          setProfile(null);
          setUserProfile(null);
        }
      } catch (e) {
        console.error('Initial auth session load error:', e);
        setUser(null);
        setProfile(null);
        setUserProfile(null);
      } finally {
        console.log('[Auth] initial load finally -> setLoading(false)');
        setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        console.log('[Auth] onAuthStateChange', _event, 'session user =', session?.user?.id);
        setUser(session?.user ?? null);
        if (session?.user) {
          const [profileData, userProfileData] = await Promise.all([
            fetchWithTimeoutOrNull(fetchProfile(session.user.id), 8000),
            fetchWithTimeoutOrNull(fetchUserProfile(session.user.id), 8000),
          ]);
          setProfile(profileData);
          setUserProfile(userProfileData);
          if (userProfileData?.is_suspended) {
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            setUserProfile(null);
          }
        } else {
          setProfile(null);
          setUserProfile(null);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        // في حال مشكلة ريفرش توكن
        if (_event === 'TOKEN_REFRESHED' && !session) {
          setUser(null);
          setProfile(null);
          setUserProfile(null);
        }
      } finally {
        console.log('[Auth] onAuthStateChange finally -> setLoading(false)');
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
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
  };

  const signIn = async (email: string, password: string) => {
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
  };

  const signOut = async () => {
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
  };

  const updateProfile = async (updates: Partial<BusinessProfile>) => {
    if (!user) throw new Error('No user logged in');

    const { error } = await supabase
      .from('business_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (error) throw error;

    const updatedProfile = await fetchProfile(user.id);
    setProfile(updatedProfile);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const profileData = await fetchProfile(user.id);
    setProfile(profileData);
    const userProfileData = await fetchUserProfile(user.id);
    setUserProfile(userProfileData);
  };

  const isAdmin = userProfile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
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
