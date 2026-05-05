export type TripFilterState = {
  search: string;
  paymentStatus: string;
  tripStatus: string;
  year: string;
  month: string;
  destination: string;
};

export interface TripFilterPreset {
  id: string;
  name: string;
  filters: TripFilterState;
}

export const DEFAULT_TRIP_FILTERS: TripFilterState = {
  search: '',
  paymentStatus: '',
  tripStatus: '',
  year: new Date().getFullYear().toString(),
  month: '',
  destination: '',
};
