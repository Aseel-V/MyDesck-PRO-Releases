/**
 * Kitchen Display System (KDS) Real-Time Hook
 * 
 * Provides real-time subscription to kitchen tickets using Supabase Realtime.
 * The kitchen screen automatically updates without refreshing when:
 * - New orders come in (INSERT)
 * - Tickets are updated (UPDATE) - e.g., marked as cooking/ready
 * - Tickets are cancelled (DELETE/UPDATE)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type TicketStatus = 'new' | 'in_progress' | 'ready' | 'served' | 'cancelled';
export type TicketItemStatus = 'pending' | 'cooking' | 'ready' | 'cancelled';

export interface TicketItem {
  id: string;
  ticket_id: string;
  order_item_id: string;
  item_name: string;
  quantity: number;
  notes: string | null;
  modifiers_text: string | null;
  status: TicketItemStatus;
  created_at: string;
}

export interface KitchenTicket {
  id: string;
  business_id: string;
  order_id: string;
  table_name: string | null;
  station: string | null;
  status: TicketStatus;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  served_at: string | null;
  // Computed/joined
  items?: TicketItem[];
  elapsed_seconds?: number;
}

export interface UseKitchenDisplayOptions {
  /** Filter by station (e.g., "Grill", "Fry", "Expo") */
  station?: string;
  /** Only show tickets with these statuses */
  statusFilter?: TicketStatus[];
  /** Auto-sort by priority and time */
  autoSort?: boolean;
  /** Enable sound notifications for new tickets */
  enableSound?: boolean;
  /** Callback when new ticket arrives */
  onNewTicket?: (ticket: KitchenTicket) => void;
}

export interface UseKitchenDisplayReturn {
  /** All active tickets */
  tickets: KitchenTicket[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Connection status */
  isConnected: boolean;
  /** Mark a ticket as in progress */
  startTicket: (ticketId: string) => Promise<void>;
  /** Mark a ticket item as ready */
  markItemReady: (itemId: string) => Promise<void>;
  /** Mark entire ticket as ready */
  completeTicket: (ticketId: string) => Promise<void>;
  /** Mark ticket as served (final state) */
  serveTicket: (ticketId: string) => Promise<void>;
  /** Recall a bumped ticket */
  recallTicket: (ticketId: string) => Promise<void>;
  /** Refresh tickets manually */
  refetch: () => Promise<void>;
  /** Count of new tickets (for badge) */
  newTicketCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const QUERY_KEY = 'kitchen-tickets';
const NEW_TICKET_SOUND_URL = '/sounds/new-order.mp3'; // Add this sound file to public/sounds/

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useKitchenDisplay(
  options: UseKitchenDisplayOptions = {}
): UseKitchenDisplayReturn {
  const {
    station,
    statusFilter = ['new', 'in_progress', 'ready'],
    autoSort = true,
    enableSound = true,
    onNewTicket,
  } = options;

  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // State
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Refs
  const channelRef = useRef<RealtimeChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ticketIdsRef = useRef<Set<string>>(new Set());

  // Initialize audio
  useEffect(() => {
    if (enableSound && typeof window !== 'undefined') {
      audioRef.current = new Audio(NEW_TICKET_SOUND_URL);
      audioRef.current.volume = 0.7;
    }
    return () => {
      audioRef.current = null;
    };
  }, [enableSound]);

  // Play notification sound
  const playNewTicketSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Autoplay might be blocked, ignore
      });
    }
  }, []);

  // Sort tickets by priority and time
  const sortTickets = useCallback((ticketList: KitchenTicket[]): KitchenTicket[] => {
    if (!autoSort) return ticketList;
    
    return [...ticketList].sort((a, b) => {
      // Higher priority first
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Status order: new > in_progress > ready
      const statusOrder: Record<TicketStatus, number> = {
        new: 0,
        in_progress: 1,
        ready: 2,
        served: 3,
        cancelled: 4,
      };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      // Older tickets first (FIFO)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [autoSort]);

  // Calculate elapsed time for each ticket
  const addElapsedTime = useCallback((ticketList: KitchenTicket[]): KitchenTicket[] => {
    const now = Date.now();
    return ticketList.map(ticket => ({
      ...ticket,
      elapsed_seconds: Math.floor((now - new Date(ticket.created_at).getTime()) / 1000),
    }));
  }, []);

  // Fetch tickets with items
  const fetchTickets = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setIsLoading(true);
      
      // Build query - using 'any' cast since these tables are created by the production migration
      // After running restaurant_production_migration.sql and regenerating types, remove the cast
      const baseQuery = (supabase as any)
        .from('restaurant_kitchen_tickets')
        .select(`
          *,
          items:restaurant_ticket_items(*)
        `)
        .eq('business_id', user.id)
        .in('status', statusFilter)
        .order('created_at', { ascending: true });
      
      // Filter by station if specified
      const query = station ? baseQuery.eq('station', station) : baseQuery;
      
      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      
      // Process and sort
      let processedTickets = addElapsedTime((data || []) as KitchenTicket[]);
      processedTickets = sortTickets(processedTickets);
      
      // Track existing ticket IDs
      ticketIdsRef.current = new Set(processedTickets.map(t => t.id));
      
      setTickets(processedTickets);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tickets'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, station, statusFilter, sortTickets, addElapsedTime]);


  // Handle realtime events
  const handleRealtimeChange = useCallback(
    (payload: RealtimePostgresChangesPayload<KitchenTicket>) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      setTickets(currentTickets => {
        let updatedTickets = [...currentTickets];
        
        switch (eventType) {
          case 'INSERT': {
            const newTicket = newRecord as KitchenTicket;
            
            // Check if this ticket belongs to our filter
            if (station && newTicket.station !== station) {
              return currentTickets;
            }
            if (!statusFilter.includes(newTicket.status)) {
              return currentTickets;
            }
            
            // Check if not already in list
            if (!ticketIdsRef.current.has(newTicket.id)) {
              ticketIdsRef.current.add(newTicket.id);
              updatedTickets.push(addElapsedTime([newTicket])[0]);
              
              // Play sound and trigger callback
              playNewTicketSound();
              onNewTicket?.(newTicket);
            }
            break;
          }
          
          case 'UPDATE': {
            const updatedTicket = newRecord as KitchenTicket;
            const index = updatedTickets.findIndex(t => t.id === updatedTicket.id);
            
            if (index !== -1) {
              // Check if it should still be visible
              if (!statusFilter.includes(updatedTicket.status)) {
                updatedTickets.splice(index, 1);
                ticketIdsRef.current.delete(updatedTicket.id);
              } else {
                // Keep existing items if not in update
                updatedTickets[index] = {
                  ...updatedTickets[index],
                  ...updatedTicket,
                  items: updatedTicket.items || updatedTickets[index].items,
                };
              }
            }
            break;
          }
          
          case 'DELETE': {
            const deletedId = (oldRecord as KitchenTicket)?.id;
            if (deletedId) {
              updatedTickets = updatedTickets.filter(t => t.id !== deletedId);
              ticketIdsRef.current.delete(deletedId);
            }
            break;
          }
        }
        
        return sortTickets(addElapsedTime(updatedTickets));
      });
    },
    [station, statusFilter, sortTickets, addElapsedTime, playNewTicketSound, onNewTicket]
  );

  // Set up realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    
    // Initial fetch
    fetchTickets();
    
    // Create channel with unique name
    const channelName = `kds-${user.id}-${station || 'all'}`;
    
    channelRef.current = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_kitchen_tickets',
          filter: `business_id=eq.${user.id}`,
        },
        handleRealtimeChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_ticket_items',
        },
        () => {
          // Refetch when items change (simpler than tracking individual items)
          fetchTickets();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Cleanup
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, station, handleRealtimeChange, fetchTickets]);

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTickets(current => addElapsedTime(current));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [addElapsedTime]);

  // ============================================================================
  // ACTION FUNCTIONS
  // Note: Using 'any' cast since tables are created by production migration
  // After running restaurant_production_migration.sql and regenerating types, remove casts
  // ============================================================================

  const startTicket = useCallback(async (ticketId: string) => {
    if (!user?.id) throw new Error('Not authenticated');
    
    const { error: updateError } = await (supabase as any)
      .from('restaurant_kitchen_tickets')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('business_id', user.id);
    
    if (updateError) throw updateError;
    
    // Optimistic update handled by realtime
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  }, [user?.id, queryClient]);

  const markItemReady = useCallback(async (itemId: string) => {
    const { error: updateError } = await (supabase as any)
      .from('restaurant_ticket_items')
      .update({ status: 'ready' })
      .eq('id', itemId);
    
    if (updateError) throw updateError;
    
    // Check if all items ready, then complete ticket
    // This could be done in a database trigger for better reliability
  }, []);

  const completeTicket = useCallback(async (ticketId: string) => {
    if (!user?.id) throw new Error('Not authenticated');
    
    const { error: updateError } = await (supabase as any)
      .from('restaurant_kitchen_tickets')
      .update({
        status: 'ready',
        completed_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('business_id', user.id);
    
    if (updateError) throw updateError;
    
    // Also update all items
    await (supabase as any)
      .from('restaurant_ticket_items')
      .update({ status: 'ready' })
      .eq('ticket_id', ticketId);
    
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  }, [user?.id, queryClient]);

  const serveTicket = useCallback(async (ticketId: string) => {
    if (!user?.id) throw new Error('Not authenticated');
    
    const { error: updateError } = await (supabase as any)
      .from('restaurant_kitchen_tickets')
      .update({
        status: 'served',
        served_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('business_id', user.id);
    
    if (updateError) throw updateError;
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  }, [user?.id, queryClient]);

  const recallTicket = useCallback(async (ticketId: string) => {
    if (!user?.id) throw new Error('Not authenticated');
    
    const { error: updateError } = await (supabase as any)
      .from('restaurant_kitchen_tickets')
      .update({
        status: 'in_progress',
        completed_at: null,
        served_at: null,
      })
      .eq('id', ticketId)
      .eq('business_id', user.id);
    
    if (updateError) throw updateError;
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  }, [user?.id, queryClient]);


  const refetch = useCallback(async () => {
    await fetchTickets();
  }, [fetchTickets]);

  // Count new tickets for badge
  const newTicketCount = tickets.filter(t => t.status === 'new').length;

  return {
    tickets,
    isLoading,
    error,
    isConnected,
    startTicket,
    markItemReady,
    completeTicket,
    serveTicket,
    recallTicket,
    refetch,
    newTicketCount,
  };
}

// ============================================================================
// UTILITY HOOK: ELAPSED TIME DISPLAY
// ============================================================================

/**
 * Format elapsed seconds into display string
 */
export function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Get color based on elapsed time
 */
export function getTicketTimeColor(seconds: number): 'green' | 'yellow' | 'red' {
  if (seconds < 300) return 'green';  // < 5 min
  if (seconds < 600) return 'yellow'; // 5-10 min
  return 'red';                       // > 10 min
}
