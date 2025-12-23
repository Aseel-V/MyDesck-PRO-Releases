import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Calculator,
  Calendar,
  Settings,
  User,
  Search,
  LayoutDashboard,
  LogOut,
  Plane
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Trip } from '@/types/trip';

interface CommandPaletteProps {
  onNavigate?: (page: 'home' | 'trips' | 'analytics' | 'settings' | 'admin') => void;
  onSelectTrip?: (trip: Trip) => void;
  onCreateTrip?: () => void;
}

export function CommandPalette({ onNavigate, onSelectTrip, onCreateTrip }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { signOut, isAdmin, user } = useAuth();

  const { data: trips = [] } = useQuery({
    queryKey: ['trips-search', user?.id],
    queryFn: async () => {
      if (!user?.id || isAdmin) return [];
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as unknown as Trip[];
    },
    enabled: !!user?.id && !isAdmin && open, // Only fetch when open
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-200/60 backdrop-blur-sm dark:bg-slate-950/60"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90"
          >

            <Command label="Command Menu" className="w-full">
              <div className="flex items-center border-b border-slate-200 px-3 dark:border-slate-800" cmdk-input-wrapper="">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-slate-500 dark:text-slate-400" />
                <Command.Input
                  placeholder={t('search', 'Type a command or search...')}
                  className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-400 text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-slate-500 dark:text-slate-100"
                />
              </div>
              <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
                <Command.Empty className="py-6 text-center text-sm text-slate-500">
                  No results found.
                </Command.Empty>

                <Command.Group heading="Quick Actions" className="text-xs font-medium text-slate-500 px-2 py-1.5">
                  <Command.Item
                    onSelect={() => runCommand(() => onCreateTrip?.())}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                  >
                    <Plane className="h-4 w-4" />
                    <span>Create New Trip</span>
                    <span className="ml-auto text-xs text-slate-500">Ctrl+N</span>
                  </Command.Item>
                </Command.Group>

                <Command.Separator className="my-1 h-px bg-slate-800" />

                <Command.Group heading="Navigation" className="text-xs font-medium text-slate-500 px-2 py-1.5">
                  <Command.Item
                    onSelect={() => runCommand(() => onNavigate?.('home'))}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => runCommand(() => onNavigate?.('trips'))}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                  >
                    <Calendar className="h-4 w-4" />
                    <span>Trips</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => runCommand(() => onNavigate?.('analytics'))}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                  >
                    <Calculator className="h-4 w-4" />
                    <span>Analytics</span>
                  </Command.Item>
                  <Command.Item
                    onSelect={() => runCommand(() => onNavigate?.('settings'))}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Command.Item>
                  {isAdmin && (
                    <Command.Item
                      onSelect={() => runCommand(() => onNavigate?.('admin'))}
                      className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                    >
                      <User className="h-4 w-4" />
                      <span>Admin Panel</span>
                    </Command.Item>
                  )}
                </Command.Group>

                <Command.Separator className="my-1 h-px bg-slate-800" />

                <Command.Group heading="Trips" className="text-xs font-medium text-slate-500 px-2 py-1.5">
                  {trips.map((trip) => (
                    <Command.Item
                      key={trip.id}
                      onSelect={() => runCommand(() => onSelectTrip?.(trip))}
                      className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                      value={`${trip.destination} ${trip.client_name}`}
                    >
                      <Plane className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span>{trip.destination}</span>
                        <span className="text-[10px] text-slate-400">{trip.client_name}</span>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Separator className="my-1 h-px bg-slate-800" />

                <Command.Group heading="Settings" className="text-xs font-medium text-slate-500 px-2 py-1.5">
                  <Command.Item
                    onSelect={() => runCommand(() => setLanguage(language === 'en' ? 'ar' : 'en'))}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-200 aria-selected:bg-sky-500/20 aria-selected:text-sky-300 cursor-pointer"
                  >
                    {language === 'en' ? '🇦🇪' : '🇺🇸'}
                    <span>Switch to {language === 'en' ? 'Arabic' : 'English'}</span>
                  </Command.Item>
                </Command.Group>

                <Command.Separator className="my-1 h-px bg-slate-800" />

                <Command.Group heading="Account" className="text-xs font-medium text-slate-500 px-2 py-1.5">
                  <Command.Item
                    onSelect={() => runCommand(() => signOut())}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-rose-300 aria-selected:bg-rose-500/20 aria-selected:text-rose-200 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div >
      )
      }
    </AnimatePresence >
  );
}
