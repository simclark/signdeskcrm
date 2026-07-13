/** Curated IANA timezones for the Settings timezone Select. */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New_York (Eastern)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain)' },
  { value: 'America/Phoenix', label: 'America/Phoenix (Arizona)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Pacific)' },
  { value: 'America/Anchorage', label: 'America/Anchorage (Alaska)' },
  { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu (Hawaii)' },
  { value: 'America/Toronto', label: 'America/Toronto' },
  { value: 'America/Vancouver', label: 'America/Vancouver' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Dublin', label: 'Europe/Dublin' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid' },
  { value: 'Europe/Rome', label: 'Europe/Rome' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw' },
  { value: 'Europe/Athens', label: 'Europe/Athens' },
  { value: 'Europe/Istanbul', label: 'Europe/Istanbul' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne' },
  { value: 'Australia/Perth', label: 'Australia/Perth' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
]

export function timezoneSelectData(current?: string | null) {
  const value = (current || '').trim()
  if (value && !TIMEZONE_OPTIONS.some((o) => o.value === value)) {
    return [{ value, label: `${value} (current)` }, ...TIMEZONE_OPTIONS]
  }
  return TIMEZONE_OPTIONS
}
