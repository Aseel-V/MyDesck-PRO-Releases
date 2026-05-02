import { useState } from 'react';
import { X, Save, CarFront, User, Calendar, Palette, FileBadge, Info } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { fetchVehicleByPlate } from '../../services/govData';
import { Search, Loader2 } from 'lucide-react';

interface NewCarFormProps {
  onClose: () => void;
  onSave: () => void;
}

const carSchema = z.object({
  plate_number: z.string().min(1, "Plate number is required"),
  model: z.string().min(1, "Vehicle model is required"),
  owner_name: z.string().min(1, "Owner name is required"),
  owner_phone: z.string().optional(),
  odometer: z.number().min(0).optional(),
  notes: z.string().optional(),
  color: z.string().optional(),
  year: z.number().optional(),
  test_expiry: z.string().optional(),
  trim_level: z.string().optional(),
  ownership: z.string().optional(),
});

type CarFormValues = z.infer<typeof carSchema>;

export default function NewCarForm({ onClose, onSave }: NewCarFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CarFormValues>({
    resolver: zodResolver(carSchema),
    defaultValues: {
      odometer: 0,
    },
  });

  const plateNumber = watch('plate_number');

  const handleSearch = async () => {
    if (!plateNumber || plateNumber.length < 5) {
      toast.error('Please enter a valid plate number first');
      return;
    }
    
    setSearching(true);
    try {
      const vehicle = await fetchVehicleByPlate(plateNumber);
      if (vehicle) {
        // Construct the model string: "Manufacturer Model"
        const modelString = `${vehicle.tozeret_nm} ${vehicle.kinuy_mishari}`.trim();
        
        setValue('model', modelString);
        setValue('year', vehicle.shnat_yitzur);
        setValue('color', vehicle.tzeva_rechev);
        setValue('trim_level', vehicle.ramat_gimur);
        setValue('ownership', vehicle.baalut);
        
        if (vehicle.tokef_dt) {
             // API returns date string, keep it as string or format YYYY-MM-DD for input type="date"
             // Assuming input type="text" for now or date picker. 
             // Let's standardise on a simple string or YYYY-MM-DD if using date input.
             // Given the designs usually prefer text for flexibility unless strict.
             // Let's use the local date string for display if text, or ISO for date input.
             // We'll use text input for flexibility.
             const date = new Date(vehicle.tokef_dt);
             setValue('test_expiry', date.toLocaleDateString('en-GB')); // DD/MM/YYYY
        }

        setValue('owner_name', ''); // Clear as we don't have this info
        
        toast.success('Vehicle details found!');
      } else {
        toast.error('Vehicle not found in government database');
      }
    } catch (err) {
      toast.error('Failed to fetch vehicle details');
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const onSubmit = async (data: CarFormValues) => {
    if (!profile?.id) return;
    setLoading(true);

    try {
      // 1. Upsert Vehicle (Identify by plate + business_id)
      const { data: existingVehicle } = await supabase
        .from('customer_vehicles')
        .select('id')
        .eq('business_id', profile.id)
        .eq('plate_number', data.plate_number)
        .maybeSingle();

      let vehicleId = existingVehicle?.id;

      let testExpiryDate = null;
      if (data.test_expiry) {
          // Try to parse DD/MM/YYYY or YYYY-MM-DD
          const parts = data.test_expiry.split(/[-/.]/);
          if (parts.length === 3) {
              if (parts[0].length === 4) {
                   testExpiryDate = data.test_expiry; // YYYY-MM-DD
              } else {
                  // Assume DD/MM/YYYY -> YYYY-MM-DD
                  testExpiryDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
              }
          }
      }

      const vehicleData = {
            business_id: profile.id,
            plate_number: data.plate_number,
            model: data.model,
            owner_name: data.owner_name,
            owner_phone: data.owner_phone,
            color: data.color,
            year: data.year,
            test_expiry: testExpiryDate, // Ensure DB accepts date or text. Plan said date.
            trim_level: data.trim_level,
            ownership: data.ownership,
            updated_at: new Date().toISOString()
      };

      if (!vehicleId) {
        // Create new vehicle
        const { data: newVehicle, error: vehicleError } = await supabase
          .from('customer_vehicles')
          .insert([{ ...vehicleData, created_at: new Date().toISOString() }])
          .select()
          .single();

        if (vehicleError) throw vehicleError;
        vehicleId = newVehicle.id;
      } else {
        // Update existing
         await supabase
          .from('customer_vehicles')
          .update(vehicleData)
          .eq('id', vehicleId);
      }

      // 2. Create Repair Order
      const { error: orderError } = await supabase
        .from('repair_orders')
        .insert([{
            business_id: profile.id,
            vehicle_id: vehicleId,
            status: 'working',
            odometer_reading: data.odometer,
            notes: data.notes,
            total_amount: 0,
            currency: profile.preferred_currency || 'USD',
            created_at: new Date().toISOString()
        }]);

      if (orderError) throw orderError;

      toast.success('New car added successfully');
      onSave(); // Refresh list
      onClose();

    } catch (error: any) {
      console.error('Error creating car:', error);
      toast.error(error.message || 'Failed to create car');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xl flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="relative max-w-2xl w-full bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Add New Car</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Create a new repair job and register vehicle</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="overflow-y-auto custom-scrollbar">
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
                
                {/* Vehicle Identification */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <CarFront className="w-4 h-4" />
                        Vehicle Identification
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Plate Number *
                            </label>
                            <div className="relative">
                                <FileBadge className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    {...register('plate_number')}
                                    className="w-full pl-9 pr-12 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none uppercase font-mono tracking-wider font-bold"
                                    placeholder="12-345-67"
                                />
                                <button
                                type="button"
                                onClick={handleSearch}
                                disabled={searching}
                                className="absolute right-2 top-1.5 p-1.5 rounded-lg bg-sky-100 text-sky-600 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50 transition-colors disabled:opacity-50"
                                title="Search vehicle details"
                                >
                                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                </button>
                            </div>
                            {errors.plate_number && <p className="text-xs text-rose-500 mt-1">{errors.plate_number.message}</p>}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Car Model *
                            </label>
                             <div className="relative">
                                <CarFront className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    {...register('model')}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                    placeholder="Toyota Corolla"
                                />
                            </div>
                            {errors.model && <p className="text-xs text-rose-500 mt-1">{errors.model.message}</p>}
                        </div>
                    </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* Technical Specs */}
                <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Technical Details
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                         <div className="col-span-1">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Year
                            </label>
                            <input
                                type="number"
                                {...register('year', { valueAsNumber: true })}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                placeholder="2024"
                            />
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Color
                            </label>
                            <div className="relative">
                                <Palette className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    {...register('color')}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                    placeholder="White"
                                />
                            </div>
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Trim Level
                            </label>
                            <input
                                {...register('trim_level')}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                placeholder="GLI"
                            />
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Test Expires
                            </label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    {...register('test_expiry')}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                    placeholder="DD/MM/YYYY"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                 <hr className="border-slate-100 dark:border-slate-800" />

                {/* Owner Info */}
                <div className="space-y-4">
                     <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Owner Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Owner Name *
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    {...register('owner_name')}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                    placeholder="John Doe"
                                />
                            </div>
                            {errors.owner_name && <p className="text-xs text-rose-500 mt-1">{errors.owner_name.message}</p>}
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Owner Phone
                            </label>
                            <input
                                {...register('owner_phone')}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                placeholder="050-0000000"
                            />
                        </div>
                         <div className="col-span-1">
                             <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Ownership Type
                            </label>
                            <input
                                {...register('ownership')}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                placeholder="Private / Company"
                            />
                        </div>
                         <div className="col-span-1">
                             <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Odometer (km)
                            </label>
                            <input
                                type="number"
                                {...register('odometer', { valueAsNumber: true })}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />
                
                 <div>
                     <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Additional Notes (Issues)
                    </label>
                    <textarea
                        {...register('notes')}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 outline-none min-h-[80px]"
                        placeholder="Describe the issue..."
                    />
                </div>

            </form>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0 flex justify-end gap-3">
             <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={handleSubmit(onSubmit)}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold text-white bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50"
            >
                {loading ? 'Saving...' : (
                    <>
                        <Save className="w-4 h-4" />
                        <span>Save Car</span>
                    </>
                )}
            </button>
        </div>

      </div>
    </div>
  );
}
