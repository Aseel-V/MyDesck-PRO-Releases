import { useAuth } from '../contexts/AuthContext';
import KitchenDisplaySystem from '../components/restaurant/KitchenDisplaySystem';
import RestaurantDashboardV2 from '../components/restaurant/RestaurantDashboardV2';

export default function StaffSessionApp() {
  const { staffUser } = useAuth();
  if (!staffUser) return null;
  if (staffUser.role === 'Kitchen' || staffUser.role === 'Chef' || staffUser.restaurant_role === 'kitchen_staff') {
    return <div className="min-h-screen bg-slate-900 text-white"><KitchenDisplaySystem /></div>;
  }
  return <RestaurantDashboardV2 />;
}

