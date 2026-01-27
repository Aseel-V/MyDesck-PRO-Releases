// ============================================================================
// RESTAURANT DASHBOARD - Main Navigation Hub
// Version: 2.0.0 | Production-Ready Role-Based Dashboard
// ============================================================================

import { useState, useEffect } from 'react';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useRestaurant, useRestaurantKPIs } from '../../hooks/useRestaurant';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

// Import all restaurant components
import FloorPlanEditor from './FloorPlanEditor';
import KitchenDisplaySystem from './KitchenDisplaySystem';
import ReservationsBoard from './ReservationsBoard';
import GuestProfiles from './GuestProfiles';
import AnalyticsDashboard from './AnalyticsDashboard';
import OrderEntry from './OrderEntry';
import RestaurantSettings from './RestaurantSettings';
import { RestaurantTable, RolePermissions } from '../../types/restaurant';


import {
  LayoutGrid,
  ChefHat,
  Calendar,
  Users,
  BarChart3,
  Settings,
  Coffee,
  DollarSign,
  Clock,
  AlertTriangle,
  Menu as MenuIcon,
  X,
  Bell,
  LogOut,
  Store,
  Globe,
  Utensils,
} from 'lucide-react';

import { Language } from '../../types/language';

// ============================================================================
// TYPES
// ============================================================================

type ViewType = 'floor' | 'kds' | 'reservations' | 'guests' | 'analytics' | 'menu' | 'staff' | 'settings';

interface NavItem {
  id: ViewType;
  labelKey: string;
  icon: React.ReactNode;
  permission: keyof RolePermissions;
}

// ============================================================================
// NAVIGATION ITEMS
// ============================================================================

const NAV_ITEMS: NavItem[] = [
  { id: 'floor', labelKey: 'restaurant.nav.floor', icon: <LayoutGrid size={20} />, permission: 'canTakeOrders' },
  { id: 'kds', labelKey: 'restaurant.nav.kitchen', icon: <ChefHat size={20} />, permission: 'canViewKDS' },
  { id: 'reservations', labelKey: 'restaurant.nav.reservations', icon: <Calendar size={20} />, permission: 'canManageReservations' },
  { id: 'guests', labelKey: 'restaurant.nav.guests', icon: <Users size={20} />, permission: 'canViewGuestProfiles' },
  { id: 'analytics', labelKey: 'restaurant.nav.analytics', icon: <BarChart3 size={20} />, permission: 'canViewDashboard' },
  { id: 'menu', labelKey: 'restaurant.nav.menu', icon: <Coffee size={20} />, permission: 'canEditMenu' },
  { id: 'staff', labelKey: 'restaurant.nav.staff', icon: <Users size={20} />, permission: 'canManageStaff' },
  { id: 'settings', labelKey: 'restaurant.nav.settings', icon: <Settings size={20} />, permission: 'canAccessSettings' },
];

// ============================================================================
// QUICK STATS BAR
// ============================================================================

function QuickStats() {
  const { kpis } = useRestaurantKPIs();
  const { kitchenTickets } = useRestaurant();
  const { t, formatCurrency } = useLanguage();
  
  const criticalTickets = kitchenTickets.filter(t => t.urgency_level === 'critical').length;
  
  return (
    <div className="flex items-center gap-6 text-sm">
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
        <DollarSign size={14} className="text-green-500" />
        <span>{formatCurrency(kpis?.todays_revenue || 0)}</span>
      </div>
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
        <Users size={14} className="text-blue-500" />
        <span>{kpis?.covers_today || 0} {t('restaurant.covers')}</span>
      </div>
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
        <LayoutGrid size={14} className="text-purple-500" />
        <span>{kpis?.occupied_tables || 0}/{(kpis?.open_tables || 0) + (kpis?.occupied_tables || 0)} {t('restaurant.tables')}</span>
      </div>
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
        <Clock size={14} className="text-amber-500" />
        <span>{kpis?.pending_kitchen_tickets || 0} {t('restaurant.pending')}</span>
      </div>
      <div className="flex items-center gap-2 text-emerald-500 font-bold">
        <Utensils size={14} />
        <span>{kitchenTickets.filter(t => t.status === 'ready').length} {t('kds.readyForPickup')}</span>
      </div>
      {criticalTickets > 0 && (
        <div className="flex items-center gap-2 text-red-500 animate-pulse">
          <AlertTriangle size={14} />
          <span>{criticalTickets} {t('restaurant.critical')}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SIDEBAR
// ============================================================================

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function Sidebar({ activeView, onViewChange, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { can, currentRole, isManager } = useRestaurantRole();
  const { signOut } = useAuth();
  const { t } = useLanguage();
  
  // Filter nav items based on permissions
  const visibleItems = NAV_ITEMS.filter(item => can(item.permission as keyof RolePermissions));
  
  return (
    <aside className={`
      bg-slate-900 text-white flex flex-col transition-all duration-300
      ${isCollapsed ? 'w-16' : 'w-60'}
    `}>
      {/* Logo/Brand */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Store size={24} className="text-blue-400" />
            <span className="font-bold text-lg">{t('restaurant.title')}</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-800 rounded"
        >
          {isCollapsed ? <MenuIcon size={20} /> : <X size={20} />}
        </button>
      </div>
      
      {/* Role Badge */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-b border-slate-800">
          <span className={`
            text-xs px-2 py-1 rounded-full font-medium
            ${isManager ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}
          `}>
            {currentRole.replace('_', ' ').toUpperCase()}
          </span>
        </div>
      )}
      
      {/* Navigation */}
      <nav className="flex-1 py-4">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
              w-full flex items-center gap-3 px-4 py-3 transition-colors
              ${activeView === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }
              ${isCollapsed ? 'justify-center' : ''}
            `}
            title={isCollapsed ? t(item.labelKey) : undefined}
          >
            {item.icon}
            {!isCollapsed && <span>{t(item.labelKey)}</span>}
          </button>
        ))}
      </nav>
      
      {/* User/Logout */}
      <div className="border-t border-slate-800 p-4">
        <button
          onClick={() => signOut()}
          className={`
            flex items-center gap-3 text-slate-400 hover:text-white transition-colors
            ${isCollapsed ? 'justify-center' : ''}
          `}
          title={isCollapsed ? t('auth.signOut') : undefined}
        >
          <LogOut size={18} />
          {!isCollapsed && <span className="text-sm">{t('auth.signOut')}</span>}
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// TOP BAR
// ============================================================================

// Language options for picker
const LANGUAGES = [
  { code: 'en' as Language, label: 'English', flag: '🇺🇸' },
  { code: 'he' as Language, label: 'עברית', flag: '🇮🇱' },
  { code: 'ar' as Language, label: 'العربية', flag: '🇵🇸' },
];

function TopBar() {
  const { profile } = useAuth();
  const { currentStaff } = useRestaurantRole();
  const { language, setLanguage, t } = useLanguage();
  const { kitchenTickets } = useRestaurant();
  
  const readyTickets = kitchenTickets.filter(t => t.status === 'ready').length;
  const criticalTickets = kitchenTickets.filter(t => t.urgency_level === 'critical').length;
  
  const [showLangMenu, setShowLangMenu] = useState(false);
  
  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between">
      <QuickStats />
      
      <div className="flex items-center gap-4">
        {/* Language Picker */}
        <div className="relative">
          <button 
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title={t('restaurant.languagePicker')}
          >
            <Globe size={20} className="text-slate-500" />
            <span className="text-sm">{LANGUAGES.find(l => l.code === language)?.flag}</span>
          </button>
          
          {showLangMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 rounded-lg shadow-xl z-50 border dark:border-slate-700 py-1">
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setShowLangMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 text-sm ${
                    language === lang.code ? 'bg-slate-50 dark:bg-slate-700 font-medium' : ''
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span className="text-slate-800 dark:text-white">{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Notifications */}
        <button className="relative p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg group">
          <Bell size={20} className="text-slate-500 group-hover:text-indigo-500 transition-colors" />
          {(readyTickets > 0 || criticalTickets > 0) && (
            <span className={`absolute -top-1 -right-1 w-5 h-5 border-2 border-white dark:border-slate-900 rounded-full flex items-center justify-center text-[9px] text-white font-bold ${criticalTickets > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}>
              {criticalTickets > 0 ? criticalTickets : readyTickets}
            </span>
          )}
        </button>
        
        {/* User */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {currentStaff?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-slate-800 dark:text-white">
              {currentStaff?.full_name || t('restaurant.user')}
            </div>
            <div className="text-xs text-slate-500">
              {profile?.business_name}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// STUB COMPONENTS (Working placeholders with full UI)
// ============================================================================

// ============================================================================
// MAIN RESTAURANT DASHBOARD COMPONENT
// ============================================================================

export default function RestaurantDashboardV2() {
  const { direction } = useLanguage();
  const { defaultView } = useRestaurantRole();
  const [activeView, setActiveView] = useState<ViewType>('floor');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedTableForOrder, setSelectedTableForOrder] = useState<RestaurantTable | null>(null);
  
  // Set initial view based on role
  useEffect(() => {
    const roleView = defaultView.split('/').pop() as ViewType;
    if (roleView && NAV_ITEMS.some(n => n.id === roleView)) {
      setActiveView(roleView);
    }
  }, [defaultView]);
  
  // Render the active view
  const renderView = () => {
    switch (activeView) {
      case 'floor':
        return <FloorPlanEditor onTableClick={(table) => setSelectedTableForOrder(table)} />;
      case 'kds':
        return <KitchenDisplaySystem />;
      case 'reservations':
        return <ReservationsBoard />;
      case 'guests':
        return <GuestProfiles />;
      case 'analytics':
        return <AnalyticsDashboard />;
      case 'menu':
        return <RestaurantSettings defaultTab="menu" />;
      case 'staff':
        return <RestaurantSettings defaultTab="staff" />;
      case 'settings':
        return <RestaurantSettings defaultTab="tables" />;
      default:
        return <FloorPlanEditor onTableClick={(table) => setSelectedTableForOrder(table)} />;
    }
  };
  
  const isRTL = direction === 'rtl';
  
  return (
    <div 
      className={`h-screen flex bg-slate-50 dark:bg-slate-950 ${isRTL ? 'flex-row-reverse' : ''}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <main className="flex-1 overflow-auto">
          {renderView()}
        </main>
      </div>

      {/* Order Entry Overlay */}
      {selectedTableForOrder && (
        <OrderEntry 
          tableId={selectedTableForOrder.id}
          onClose={() => setSelectedTableForOrder(null)}
        />
      )}
    </div>
  );
}

// Also export the floor plan with order entry integration
export function FloorPlanWithOrders() {
  return (
    <>
      <FloorPlanEditor />
    </>
  );
}
