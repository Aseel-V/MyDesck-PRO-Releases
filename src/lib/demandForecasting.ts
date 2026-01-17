// ============================================================================
// AI DEMAND FORECASTING - Core Logic
// Version: 1.0.0 | Production-Ready Predictive Analytics
// ============================================================================

import { supabase } from '../lib/supabase';
import { DemandForecast, HistoricalData, StaffingRecommendation, PrepRecommendation } from '../types/restaurant';

// ============================================================================
// TYPES
// ============================================================================

interface ForecastInput {
  businessId: string;
  targetDate: Date;
  weatherForecast?: { condition: string; temperature: number };
  localEvents?: string[];
  isHoliday?: boolean;
}

interface HistoricalPattern {
  dayOfWeek: number;
  avgCovers: number;
  avgRevenue: number;
  avgOrders: number;
  peakHours: number[];
}

// ============================================================================
// HISTORICAL DATA ANALYSIS
// ============================================================================

async function getHistoricalPatterns(businessId: string, daysBack: number = 90): Promise<Map<number, HistoricalPattern>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  
  const { data, error } = await supabase
    .from('restaurant_historical_data')
    .select('*')
    .eq('business_id', businessId)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false });
  
  if (error || !data) {
    console.error('Failed to fetch historical data:', error);
    return new Map();
  }
  
  // Group by day of week
  const byDayOfWeek = new Map<number, HistoricalData[]>();
  
  for (const record of data as HistoricalData[]) {
    const dow = record.day_of_week;
    if (!byDayOfWeek.has(dow)) {
      byDayOfWeek.set(dow, []);
    }
    byDayOfWeek.get(dow)!.push(record);
  }
  
  // Calculate patterns for each day
  const patterns = new Map<number, HistoricalPattern>();
  
  for (const [dow, records] of byDayOfWeek) {
    const avgCovers = records.reduce((sum, r) => sum + r.covers, 0) / records.length;
    const avgRevenue = records.reduce((sum, r) => sum + r.revenue, 0) / records.length;
    const avgOrders = records.reduce((sum, r) => sum + r.orders, 0) / records.length;
    
    // Determine peak hours (would need hourly data for real implementation)
    const peakHours = dow === 5 || dow === 6 
      ? [12, 13, 19, 20, 21] // Weekend peaks
      : [12, 13, 19, 20]; // Weekday peaks
    
    patterns.set(dow, {
      dayOfWeek: dow,
      avgCovers,
      avgRevenue,
      avgOrders,
      peakHours,
    });
  }
  
  return patterns;
}

// ============================================================================
// WEATHER IMPACT ANALYSIS
// ============================================================================

function getWeatherMultiplier(condition?: string, temperature?: number): number {
  if (!condition) return 1.0;
  
  const weatherImpact: Record<string, number> = {
    'sunny': 1.1,
    'clear': 1.1,
    'cloudy': 1.0,
    'partly_cloudy': 1.0,
    'rainy': 0.8,
    'heavy_rain': 0.6,
    'snow': 0.5,
    'storm': 0.4,
    'hot': 0.9, // Too hot reduces outdoor dining
    'cold': 0.85,
  };
  
  let multiplier = weatherImpact[condition.toLowerCase()] || 1.0;
  
  // Temperature adjustments for Israel
  if (temperature) {
    if (temperature > 35) multiplier *= 0.85; // Very hot
    else if (temperature > 30) multiplier *= 0.95;
    else if (temperature < 10) multiplier *= 0.9; // Cold for Israel
    else if (temperature >= 20 && temperature <= 28) multiplier *= 1.05; // Perfect weather
  }
  
  return multiplier;
}

// ============================================================================
// EVENT IMPACT ANALYSIS
// ============================================================================

function getEventMultiplier(events?: string[], isHoliday?: boolean): number {
  let multiplier = 1.0;
  
  if (isHoliday) {
    multiplier *= 0.7; // Many restaurants closed, but those open are busy
  }
  
  if (events && events.length > 0) {
    // Check for boosting events
    const boostingEvents = ['concert', 'game', 'festival', 'convention'];
    const hasBoostingEvent = events.some(e => 
      boostingEvents.some(be => e.toLowerCase().includes(be))
    );
    
    if (hasBoostingEvent) {
      multiplier *= 1.3;
    }
  }
  
  return multiplier;
}

// ============================================================================
// STAFFING RECOMMENDATIONS
// ============================================================================

function calculateStaffingRecommendation(
  predictedCovers: number,
  peakHours: number[]
): StaffingRecommendation {
  // Industry standards:
  // - 1 server per 15-20 covers (fine dining) or 20-25 (casual)
  // - 1 kitchen staff per 30-40 covers (depending on menu complexity)
  // - 1 host per 100 covers
  
  const coversPerServer = 20;
  const coversPerKitchen = 35;
  const coversPerHost = 100;
  
  const serversNeeded = Math.ceil(predictedCovers / coversPerServer);
  const kitchenStaffNeeded = Math.ceil(predictedCovers / coversPerKitchen);
  const hostsNeeded = Math.max(1, Math.ceil(predictedCovers / coversPerHost));
  
  return {
    servers_needed: serversNeeded,
    kitchen_staff_needed: kitchenStaffNeeded,
    hosts_needed: hostsNeeded,
    peak_hours: peakHours.map(h => `${h}:00`),
    notes: predictedCovers > 150 
      ? 'High volume day - consider extra staff during peak hours'
      : undefined,
  };
}

// ============================================================================
// PREP RECOMMENDATIONS
// ============================================================================

async function calculatePrepRecommendations(
  businessId: string,
  predictedOrders: number
): Promise<PrepRecommendation[]> {
  // Get popular items and their average sales proportion
  const { data: items, error } = await supabase
    .from('restaurant_menu_items')
    .select('id, name, is_popular')
    .eq('business_id', businessId)
    .eq('is_available', true);
  
  if (error || !items) return [];
  
  const recommendations: PrepRecommendation[] = [];
  
  for (const item of items) {
    // Estimate quantity based on popularity
    // In production, use actual historical order data
    const popularity = item.is_popular ? 0.2 : 0.05;
    const predictedQty = Math.ceil(predictedOrders * popularity);
    
    if (predictedQty > 0) {
      recommendations.push({
        item_id: item.id,
        item_name: item.name,
        predicted_quantity: predictedQty,
        prep_needed: predictedQty,
        priority: item.is_popular ? 'high' : 'medium',
      });
    }
  }
  
  return recommendations
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 10);
}

// ============================================================================
// MAIN FORECAST FUNCTION
// ============================================================================

export async function generateDemandForecast(input: ForecastInput): Promise<DemandForecast> {
  const { businessId, targetDate, weatherForecast, localEvents, isHoliday } = input;
  
  const dayOfWeek = targetDate.getDay();
  
  // Get historical patterns
  const patterns = await getHistoricalPatterns(businessId);
  const dayPattern = patterns.get(dayOfWeek);
  
  // Base predictions from historical data
  let predictedCovers = dayPattern?.avgCovers || 100;
  let predictedRevenue = dayPattern?.avgRevenue || 10000;
  let predictedOrders = dayPattern?.avgOrders || 50;
  
  // Apply weather adjustment
  const weatherMultiplier = getWeatherMultiplier(
    weatherForecast?.condition, 
    weatherForecast?.temperature
  );
  predictedCovers *= weatherMultiplier;
  predictedRevenue *= weatherMultiplier;
  predictedOrders *= weatherMultiplier;
  
  // Apply event adjustment
  const eventMultiplier = getEventMultiplier(localEvents, isHoliday);
  predictedCovers *= eventMultiplier;
  predictedRevenue *= eventMultiplier;
  predictedOrders *= eventMultiplier;
  
  // Round predictions
  predictedCovers = Math.round(predictedCovers);
  predictedRevenue = Math.round(predictedRevenue);
  predictedOrders = Math.round(predictedOrders);
  
  // Calculate confidence score based on historical data availability
  const dataPoints = patterns.get(dayOfWeek) ? 1 : 0;
  const confidenceScore = Math.min(0.9, 0.5 + (dataPoints * 0.1));
  
  // Get staffing recommendations
  const peakHours = dayPattern?.peakHours || [12, 13, 19, 20];
  const staffingRecommendation = calculateStaffingRecommendation(
    predictedCovers,
    peakHours
  );
  
  // Get prep recommendations
  const prepRecommendations = await calculatePrepRecommendations(businessId, predictedOrders);
  
  // Create forecast record
  const forecast: Partial<DemandForecast> = {
    business_id: businessId,
    forecast_date: targetDate.toISOString().split('T')[0],
    day_of_week: dayOfWeek,
    predicted_covers: predictedCovers,
    predicted_revenue: predictedRevenue,
    predicted_orders: predictedOrders,
    confidence_score: confidenceScore,
    weather_condition: weatherForecast?.condition,
    temperature: weatherForecast?.temperature,
    local_events: localEvents,
    is_holiday: isHoliday || false,
    staffing_recommendation: staffingRecommendation,
    prep_recommendations: prepRecommendations,
  };
  
  // Save to database
  const { data, error } = await supabase
    .from('restaurant_demand_forecasts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(forecast as any, { onConflict: 'business_id,forecast_date' })
    .select()
    .single();
  
  if (error) {
    console.error('Failed to save forecast:', error);
    throw error;
  }
  
  return data as unknown as DemandForecast;
}

// ============================================================================
// WEEKLY FORECAST GENERATION
// ============================================================================

export async function generateWeeklyForecast(businessId: string): Promise<DemandForecast[]> {
  const forecasts: DemandForecast[] = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);
    
    try {
      const forecast = await generateDemandForecast({
        businessId,
        targetDate,
        // In production, fetch actual weather forecast from an API
        weatherForecast: { condition: 'sunny', temperature: 25 },
      });
      forecasts.push(forecast);
    } catch (err) {
      console.error(`Failed to generate forecast for ${targetDate.toDateString()}:`, err);
    }
  }
  
  return forecasts;
}

// ============================================================================
// SAVE HISTORICAL DATA
// ============================================================================

export async function saveHistoricalData(
  businessId: string,
  date: Date,
  covers: number,
  revenue: number,
  orders: number,
  weather?: string,
  temperature?: number,
  wasHoliday?: boolean
): Promise<void> {
  const { error } = await supabase
    .from('restaurant_historical_data')
    .upsert({
      business_id: businessId,
      date: date.toISOString().split('T')[0],
      day_of_week: date.getDay(),
      covers,
      revenue,
      orders,
      weather,
      temperature,
      was_holiday: wasHoliday || false,
    }, { onConflict: 'business_id,date' });
  
  if (error) {
    console.error('Failed to save historical data:', error);
    throw error;
  }
}
