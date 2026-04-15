// Country data — MIRROR of backend/data/countries.py (SINGLE SOURCE OF TRUTH)
// If you add/edit countries, update backend/data/countries.py to match.
// Fields: code, name (es), nameEn, phone (prefix), flag, currency, currencySymbol, timezone, language

export const countries = [
  { code: "MX", name: "México", nameEn: "Mexico", phone: "+52", flag: "🇲🇽", currency: "MXN", currencySymbol: "$", timezone: "America/Mexico_City", language: "es" },
  { code: "US", name: "Estados Unidos", nameEn: "United States", phone: "+1", flag: "🇺🇸", currency: "USD", currencySymbol: "$", timezone: "America/New_York", language: "en" },
];

export function getCountryByCode(code) {
  return countries.find(c => c.code === code);
}
