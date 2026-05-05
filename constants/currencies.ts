export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',  EUR: '€',  GBP: '£',  JPY: '¥',  CAD: 'CA$', AUD: 'A$',
  CHF: 'Fr', CNY: '¥',  INR: '₹',  MXN: '$',  BRL: 'R$',  KRW: '₩',
  SGD: 'S$', HKD: 'HK$',NOK: 'kr', SEK: 'kr', DKK: 'kr',  NZD: 'NZ$',
  ZAR: 'R',  AED: 'د.إ',SAR: '﷼', THB: '฿',  MYR: 'RM',  IDR: 'Rp',
  PHP: '₱',  PLN: 'zł', TRY: '₺',  EGP: 'E£', COP: '$',   ARS: '$',
};

export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'TRY', name: 'Turkish Lira' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'COP', name: 'Colombian Peso' },
  { code: 'ARS', name: 'Argentine Peso' },
];

// Maps lowercase destination keywords → currency code.
const DESTINATION_CURRENCY_MAP: Record<string, string> = {
  // Eurozone
  france: 'EUR', paris: 'EUR', europe: 'EUR', eurozone: 'EUR',
  germany: 'EUR', berlin: 'EUR', munich: 'EUR',
  spain: 'EUR', barcelona: 'EUR', madrid: 'EUR', seville: 'EUR',
  italy: 'EUR', rome: 'EUR', milan: 'EUR', venice: 'EUR', florence: 'EUR',
  netherlands: 'EUR', amsterdam: 'EUR',
  portugal: 'EUR', lisbon: 'EUR', porto: 'EUR',
  greece: 'EUR', athens: 'EUR', santorini: 'EUR', mykonos: 'EUR',
  austria: 'EUR', vienna: 'EUR',
  belgium: 'EUR', brussels: 'EUR',
  ireland: 'EUR', dublin: 'EUR',
  finland: 'EUR', helsinki: 'EUR',
  // UK
  uk: 'GBP', 'united kingdom': 'GBP', london: 'GBP', england: 'GBP',
  scotland: 'GBP', edinburgh: 'GBP', wales: 'GBP',
  // Japan
  japan: 'JPY', tokyo: 'JPY', osaka: 'JPY', kyoto: 'JPY', hiroshima: 'JPY',
  // Canada
  canada: 'CAD', toronto: 'CAD', vancouver: 'CAD', montreal: 'CAD', calgary: 'CAD',
  // Australia
  australia: 'AUD', sydney: 'AUD', melbourne: 'AUD', brisbane: 'AUD',
  // Switzerland
  switzerland: 'CHF', zurich: 'CHF', geneva: 'CHF', bern: 'CHF',
  // China
  china: 'CNY', beijing: 'CNY', shanghai: 'CNY', shenzhen: 'CNY',
  // India
  india: 'INR', delhi: 'INR', mumbai: 'INR', bangalore: 'INR',
  // Mexico
  mexico: 'MXN', cancun: 'MXN', 'mexico city': 'MXN', guadalajara: 'MXN',
  // Brazil
  brazil: 'BRL', 'sao paulo': 'BRL', 'rio de janeiro': 'BRL', rio: 'BRL',
  // South Korea
  korea: 'KRW', 'south korea': 'KRW', seoul: 'KRW', busan: 'KRW',
  // Singapore
  singapore: 'SGD',
  // Hong Kong
  'hong kong': 'HKD',
  // Norway
  norway: 'NOK', oslo: 'NOK',
  // Sweden
  sweden: 'SEK', stockholm: 'SEK',
  // Denmark
  denmark: 'DKK', copenhagen: 'DKK',
  // New Zealand
  'new zealand': 'NZD', auckland: 'NZD', queenstown: 'NZD',
  // South Africa
  'south africa': 'ZAR', 'cape town': 'ZAR', johannesburg: 'ZAR',
  // UAE
  uae: 'AED', 'united arab emirates': 'AED', dubai: 'AED', 'abu dhabi': 'AED',
  // Saudi Arabia
  'saudi arabia': 'SAR', riyadh: 'SAR', jeddah: 'SAR',
  // Thailand
  thailand: 'THB', bangkok: 'THB', phuket: 'THB', chiang: 'THB',
  // Malaysia
  malaysia: 'MYR', 'kuala lumpur': 'MYR',
  // Indonesia
  indonesia: 'IDR', bali: 'IDR', jakarta: 'IDR',
  // Philippines
  philippines: 'PHP', manila: 'PHP', cebu: 'PHP',
  // Poland
  poland: 'PLN', warsaw: 'PLN', krakow: 'PLN',
  // Turkey
  turkey: 'TRY', istanbul: 'TRY', ankara: 'TRY',
  // Egypt
  egypt: 'EGP', cairo: 'EGP',
  // Colombia
  colombia: 'COP', bogota: 'COP',
  // Argentina
  argentina: 'ARS', 'buenos aires': 'ARS',
};

export function inferDestinationCurrency(destination: string): string | null {
  if (!destination) return null;
  const lower = destination.toLowerCase();
  for (const [keyword, code] of Object.entries(DESTINATION_CURRENCY_MAP)) {
    if (lower.includes(keyword)) return code;
  }
  return null;
}
