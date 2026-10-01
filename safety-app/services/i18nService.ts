// stub for i18nService
export function t(key: string): string {
  // simple fallback stub
  const dict: Record<string, string> = {
    'home.greeting_morning': 'Good morning',
    'home.greeting_afternoon': 'Good afternoon',
    'home.greeting_evening': 'Good evening',
    'home.subtitle': 'You\'re safe. Stay aware.',
    'home.dongle_status': 'Dongle Status',
    'home.status': 'Status',
    'home.connected': 'Connected',
    'home.battery': 'Battery',
    'home.active_circles': 'Active Circles',
    'home.no_circles': 'No active circles yet. Tap to set up your safety network.',
    'home.current_location': 'Current Location',
    'home.locating': 'Locating…',
    'home.risk_level': 'Risk Level',
    'home.safe_risk': 'Safe · 20%',
    'sos.hold_instruction': 'Hold for 3 seconds to send SOS',
    'sos.alert_sent': 'SOS Alert Sent'
  };
  return dict[key] || key;
}

export function setLanguage(id: string): void {
  // stub
}
