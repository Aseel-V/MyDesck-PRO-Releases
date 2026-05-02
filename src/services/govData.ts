
export interface GovVehicleData {
  _id: number;
  mispar_rechev: number; // Plate Number
  tozeret_cd: number;
  sug_degem: string;
  tozeret_nm: string; // Manufacturer (e.g., "Toyota")
  degem_cd: number;
  degem_nm: string; // Model Code
  ramat_gimur: string; // Trim Level
  ramat_eivzur_betihuty: number;
  kvutzat_zihum: number;
  shnat_yitzur: number; // Year
  degem_manoa: string;
  mivchan_acharon_dt: string; // Last Test Date
  tokef_dt: string; // Test Expiry Date
  baalut: string; // Ownership
  misgeret: string;
  tzeva_cd: number;
  tzeva_rechev: string; // Color
  zmig_kidmi: string;
  zmig_ahori: string;
  sug_delek_nm: string; // Fuel Type
  horaat_rishum: number;
  moed_aliya_lakvish: string;
  kinuy_mishari: string; // Commercial Name (e.g. "Corolla")
}

interface GovApiResponse {
  success: boolean;
  result: {
    records: GovVehicleData[];
    total: number;
  };
}

const RESOURCE_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3';
const API_BASE_URL = 'https://data.gov.il/api/3/action/datastore_search';

// Translation Maps
const HE_EN_COLORS: Record<string, string> = {
  'לבן': 'White',
  'שחור': 'Black',
  'כסף': 'Silver',
  'אפור': 'Gray',
  'כחול': 'Blue',
  'אדום': 'Red',
  'ירוק': 'Green',
  'בז': 'Beige',
  'חום': 'Brown',
  'זהב': 'Gold',
  'תכלת': 'Light Blue',
  'ברונזה': 'Bronze',
  'שנהב לבן': 'Ivory White',
  'צהוב': 'Yellow',
  'כתום': 'Orange',
  'סגול': 'Purple',
  'בזק': 'Beige',
  'אפור מטאלי': 'Metallic Gray',
  'כסף מטאלי': 'Metallic Silver',
  'כחול מטאלי': 'Metallic Blue',
  'שחור מטאלי': 'Metallic Black',
  'לבן פנינה': 'Pearl White'
};

const HE_EN_OWNERSHIP: Record<string, string> = {
  'פרטי': 'Private',
  'חברה': 'Company',
  'השכרה': 'Rental',
  'ליסינג': 'Leasing',
  'ממשלתי': 'Government',
  'מונית': 'Taxi',
  'סוחר': 'Dealer'
};

const HE_EN_FUEL: Record<string, string> = {
  'בנזין': 'Petrol',
  'דיזל': 'Diesel',
  'חשמל': 'Electric',
  'היברידי': 'Hybrid',
  'גז': 'Gas'
};

const HE_EN_MANUFACTURERS: Record<string, string> = {
  'טויוטה': 'Toyota',
  'מאזדה': 'Mazda',
  'יונדאי': 'Hyundai',
  'קיה': 'Kia',
  'סקודה': 'Skoda',
  'פולקסווגן': 'Volkswagen',
  'סיאט': 'Seat',
  'אאודי': 'Audi',
  'ב.מ.וו': 'BMW',
  'ב מ וו': 'BMW',
  'מרצדס': 'Mercedes',
  'סוזוקי': 'Suzuki',
  'הונדה': 'Honda',
  'ניסאן': 'Nissan',
  'מיצובישי': 'Mitsubishi',
  'סובארו': 'Subaru',
  'שברולט': 'Chevrolet',
  'פורד': 'Ford',
  'פיג\'ו': 'Peugeot',
  'סיטרואן': 'Citroen',
  'רנו': 'Renault',
  'פיאט': 'Fiat',
  'פורשה': 'Porsche',
  'לקסוס': 'Lexus',
  'אינפיניטי': 'Infiniti',
  'וולבו': 'Volvo',
  'טסלה': 'Tesla',
  'קאדילק': 'Cadillac',
  'ג\'יפ': 'Jeep',
  'לנד רובר': 'Land Rover',
  'מיני': 'Mini',
  'סמארט': 'Smart',
  'איסוזו': 'Isuzu',
  'דאצ\'יה': 'Dacia',
  'מ.ג.': 'MG',
  'צ\'רי': 'Chery',
  'ג\'ילי': 'Geely',
  'בי.וי.די': 'BYD',
  'איווייז': 'Aiways',
  'סרס': 'Seres',
  'סקיוול': 'Skywell'
};

export async function fetchVehicleByPlate(plate: string): Promise<GovVehicleData | null> {
  try {
    // Clean plate number (remove dashes, spaces)
    const cleanPlate = plate.replace(/\D/g, '');
    
    if (!cleanPlate) return null;

    // const url = `${API_BASE_URL}?resource_id=${RESOURCE_ID}&q=${cleanPlate}&limit=1`;
    
    // Note: The 'q' parameter in CKAN performs a full text search. 
    // To be more precise we could use filters, but 'q' is usually robust enough for unique IDs like plates if they are exact matches.
    // Ideally: &filters={"mispar_rechev":"${cleanPlate}"} but CKAN API syntax can be tricky with stringified JSON in GET.
    // 'q' is simplest. Let's try 'q' first. If it returns irrelevant results, we will switch to filters.
    
    // Using filters for exact match to avoid partial matches on other fields
    const filter = JSON.stringify({ mispar_rechev: cleanPlate });
    const preciseUrl = `${API_BASE_URL}?resource_id=${RESOURCE_ID}&filters=${encodeURIComponent(filter)}&limit=1`;

    const response = await fetch(preciseUrl);
    
    if (!response.ok) {
      throw new Error(`Gov API Error: ${response.statusText}`);
    }

    const data: GovApiResponse = await response.json();

    if (data.success && data.result.records.length > 0) {
      const vehicle = data.result.records[0];
      
      // Apply translations
      if (vehicle.tzeva_rechev) {
        // Try exact match or partial match for color
        const colorKey = Object.keys(HE_EN_COLORS).find(k => vehicle.tzeva_rechev.includes(k));
        if (colorKey) {
            vehicle.tzeva_rechev = HE_EN_COLORS[colorKey];
        } else if (HE_EN_COLORS[vehicle.tzeva_rechev]) {
             vehicle.tzeva_rechev = HE_EN_COLORS[vehicle.tzeva_rechev];
        }
      }
      
      if (vehicle.baalut) {
         vehicle.baalut = HE_EN_OWNERSHIP[vehicle.baalut] || vehicle.baalut;
      }
      
      if (vehicle.sug_delek_nm) {
        vehicle.sug_delek_nm = HE_EN_FUEL[vehicle.sug_delek_nm] || vehicle.sug_delek_nm;
      }

      if (vehicle.tozeret_nm) {
        // Try strict match first, then partial
        let manufacturer = HE_EN_MANUFACTURERS[vehicle.tozeret_nm];
        if (!manufacturer) {
            // Check if any key is part of the string (e.g. "טויוטה יפן")
            const key = Object.keys(HE_EN_MANUFACTURERS).find(k => vehicle.tozeret_nm.includes(k));
            if (key) manufacturer = HE_EN_MANUFACTURERS[key];
        }
        if (manufacturer) vehicle.tozeret_nm = manufacturer;
      }

      return vehicle;
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch vehicle data:', error);
    throw error;
  }
}
