import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getDaysInMonth(month, year) {
  if (!month || !year) return 31;
  return new Date(year, month, 0).getDate();
}

function calculateAge(day, month, year) {
  if (!day || !month || !year) return null;
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function AgeVerification({ onDateChange, onAgeValid, minAge = 16 }) {
  const { language } = useI18n();
  const months = language === 'es' ? MONTHS_ES : MONTHS_EN;

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [age, setAge] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  const maxDays = getDaysInMonth(Number(month), Number(year));

  useEffect(() => {
    if (day && month && year) {
      const computed = calculateAge(Number(day), Number(month), Number(year));
      setAge(computed);
      setShowResult(true);

      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      onDateChange?.(dateStr);
      onAgeValid?.(computed >= minAge);
    } else {
      setAge(null);
      setShowResult(false);
      onAgeValid?.(false);
    }
  }, [day, month, year]);

  // Fix day if month/year changed and day exceeds max
  useEffect(() => {
    if (day && Number(day) > maxDays) setDay(String(maxDays));
  }, [maxDays]);

  const isValid = age !== null && age >= minAge;
  const isTooYoung = age !== null && age < minAge;

  return (
    <div className="space-y-3" data-testid="age-verification">
      <div className="flex items-center gap-2">
        <span className="text-base" role="img" aria-label="calendar">
          {showResult ? (isValid ? '\u2705' : '\u26D4') : '\uD83C\uDF82'}
        </span>
        <p className="text-sm font-medium">
          {language === 'es' ? '¿Cuál es tu fecha de nacimiento?' : 'What is your date of birth?'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Day */}
        <Select value={day} onValueChange={setDay}>
          <SelectTrigger className="h-11" data-testid="age-day-select">
            <SelectValue placeholder={language === 'es' ? 'Día' : 'Day'} />
          </SelectTrigger>
          <SelectContent className="max-h-52">
            {Array.from({ length: maxDays }, (_, i) => i + 1).map(d => (
              <SelectItem key={d} value={String(d)}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month */}
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-11" data-testid="age-month-select">
            <SelectValue placeholder={language === 'es' ? 'Mes' : 'Month'} />
          </SelectTrigger>
          <SelectContent className="max-h-52">
            {months.map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Year */}
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="h-11" data-testid="age-year-select">
            <SelectValue placeholder={language === 'es' ? 'Año' : 'Year'} />
          </SelectTrigger>
          <SelectContent className="max-h-52">
            {years.map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Age result badge */}
      {showResult && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
            isValid
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
          data-testid="age-result"
        >
          {isValid ? (
            <>
              <span className="font-semibold">{age} {language === 'es' ? 'años' : 'years old'}</span>
              <span className="text-xs opacity-70">
                {language === 'es' ? '— Puedes continuar' : '— You may continue'}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold">
                {language === 'es'
                  ? `Debes tener al menos ${minAge} años para registrarte`
                  : `You must be at least ${minAge} years old to register`}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
