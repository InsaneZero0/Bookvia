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
    // Auto-detect on first visit (only if user hasn't manually selected)
    const hasManual = localStorage.getItem(STORAGE_KEY + '_manual');
    if (!hasManual) {
      detectCountry().then(code => {
        setCountryCode(code);
        try { localStorage.setItem(STORAGE_KEY, code); } catch {}
      });
    }
  }, []);

  const setCountry = (code) => {
    setCountryCode(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
      localStorage.setItem(STORAGE_KEY + '_manual', 'true');
    } catch {}
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
