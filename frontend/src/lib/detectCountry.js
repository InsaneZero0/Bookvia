import { countries } from './countries';

const STORAGE_KEY = 'bookvia_detected_country';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Timezone → country code mapping (fallback)
const TIMEZONE_TO_COUNTRY = {
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Merida': 'MX',
  'America/Cancun': 'MX', 'America/Tijuana': 'MX', 'America/Chihuahua': 'MX',
  'America/Mazatlan': 'MX', 'America/Hermosillo': 'MX',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/Guatemala': 'GT', 'America/Belize': 'BZ', 'America/El_Salvador': 'SV',
  'America/Tegucigalpa': 'HN', 'America/Managua': 'NI', 'America/Costa_Rica': 'CR',
  'America/Panama': 'PA', 'America/Bogota': 'CO', 'America/Caracas': 'VE',
  'America/Guayaquil': 'EC', 'America/Lima': 'PE', 'America/Sao_Paulo': 'BR',
  'America/La_Paz': 'BO', 'America/Santiago': 'CL',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Montevideo': 'UY',
  'America/Asuncion': 'PY', 'America/Havana': 'CU',
  'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR',
  'America/Port-au-Prince': 'HT', 'America/Jamaica': 'JM',
  'America/Port_of_Spain': 'TT',
  'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/London': 'GB',
  'Europe/Dublin': 'IE', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bucharest': 'RO',
  'Europe/Budapest': 'HU', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR',
  'Europe/Moscow': 'RU', 'Europe/Kyiv': 'UA',
  'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Seoul': 'KR',
  'Asia/Kolkata': 'IN', 'Asia/Manila': 'PH', 'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY',
  'Asia/Singapore': 'SG', 'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE',
  'Asia/Jerusalem': 'IL', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
  'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP', 'Asia/Taipei': 'TW',
  'Asia/Hong_Kong': 'HK',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
  'Pacific/Auckland': 'NZ',
  'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG',
  'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA',
};

function getCountryFromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_TO_COUNTRY[tz] || null;
  } catch {
    return null;
  }
}

function getCached() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { code, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return code;
  } catch {
    return null;
  }
}

function setCache(code) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, ts: Date.now() }));
  } catch {}
}

export async function detectCountry() {
  // 1. Check cache
  const cached = getCached();
  if (cached) return cached;

  // 2. Try IP-based detection
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const code = data.country_code;
      // Verify it's a country we support
      if (code && countries.some(c => c.code === code)) {
        setCache(code);
        return code;
      }
    }
  } catch {}

  // 3. Fallback to timezone detection
  const tzCountry = getCountryFromTimezone();
  if (tzCountry) {
    setCache(tzCountry);
    return tzCountry;
  }

  // 4. Default
  setCache('MX');
  return 'MX';
}

export function getDetectedCountry() {
  return getCached() || getCountryFromTimezone() || 'MX';
}
