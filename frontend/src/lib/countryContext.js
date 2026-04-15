import { createContext, useContext, useState, useEffect } from 'react';
import { detectCountry } from './detectCountry';
import { getCountryByCode } from './countries';

const STORAGE_KEY = 'bookvia_browsing_country';
const CountryContext = createContext(null);

export function CountryProvider({ children }) {
  const [countryCode, setCountryCode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'MX';
    } catch { return 'MX'; }
  });

  useEffect(() => {
    const hasManual = localStorage.getItem(STORAGE_KEY + '_manual');
    if (!hasManual) {
      detectCountry().then(code => {
        // Only accept MX or US
        const validCode = (code === 'US' || code === 'MX') ? code : 'MX';
        setCountryCode(validCode);
        try { localStorage.setItem(STORAGE_KEY, validCode); } catch {}
        // Auto-set language based on detected country
        const langKey = 'bookvia-language';
        const hasManualLang = localStorage.getItem(langKey + '_manual');
        if (!hasManualLang) {
          const lang = validCode === 'US' ? 'en' : 'es';
          try { localStorage.setItem(langKey, lang); } catch {}
        }
      });
    }
  }, []);

  const setCountry = (code) => {
    setCountryCode(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
      localStorage.setItem(STORAGE_KEY + '_manual', 'true');
    } catch {}
    // Also switch language when manually changing country
    const lang = code === 'US' ? 'en' : 'es';
    try { localStorage.setItem('bookvia-language', lang); } catch {}
    // Reload to apply language change
    window.location.reload();
  };

  const country = getCountryByCode(countryCode) || getCountryByCode('MX');

  return (
    <CountryContext.Provider value={{ countryCode, country, setCountry }}>
      {children}
    </CountryContext.Provider>
  );
}

export function useCountry() {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error('useCountry must be used within CountryProvider');
  return ctx;
}
