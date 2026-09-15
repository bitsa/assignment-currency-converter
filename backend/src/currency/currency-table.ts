export interface CurrencyInfo {
  readonly alpha: string;
  readonly numeric: number;
  readonly minorUnits: 0 | 2 | 3;
  readonly name: string;
}

function currency(
  alpha: string,
  numeric: number,
  minorUnits: 0 | 2 | 3,
  name: string,
): CurrencyInfo {
  return Object.freeze({ alpha, numeric, minorUnits, name });
}

/**
 * ISO 4217 List One (2026-01-01): currencies with numeric minor units, without fund codes,
 * plus BGN, HRK and SLL, which ISO has withdrawn but Monobank still publishes.
 */
export const CURRENCY_TABLE: readonly CurrencyInfo[] = Object.freeze([
  currency('AED', 784, 2, 'UAE Dirham'),
  currency('AFN', 971, 2, 'Afghani'),
  currency('ALL', 8, 2, 'Lek'),
  currency('AMD', 51, 2, 'Armenian Dram'),
  currency('AOA', 973, 2, 'Kwanza'),
  currency('ARS', 32, 2, 'Argentine Peso'),
  currency('AUD', 36, 2, 'Australian Dollar'),
  currency('AWG', 533, 2, 'Aruban Florin'),
  currency('AZN', 944, 2, 'Azerbaijan Manat'),
  currency('BAM', 977, 2, 'Convertible Mark'),
  currency('BBD', 52, 2, 'Barbados Dollar'),
  currency('BDT', 50, 2, 'Taka'),
  currency('BGN', 975, 2, 'Bulgarian Lev'),
  currency('BHD', 48, 3, 'Bahraini Dinar'),
  currency('BIF', 108, 0, 'Burundi Franc'),
  currency('BMD', 60, 2, 'Bermudian Dollar'),
  currency('BND', 96, 2, 'Brunei Dollar'),
  currency('BOB', 68, 2, 'Boliviano'),
  currency('BRL', 986, 2, 'Brazilian Real'),
  currency('BSD', 44, 2, 'Bahamian Dollar'),
  currency('BTN', 64, 2, 'Ngultrum'),
  currency('BWP', 72, 2, 'Pula'),
  currency('BYN', 933, 2, 'Belarusian Ruble'),
  currency('BZD', 84, 2, 'Belize Dollar'),
  currency('CAD', 124, 2, 'Canadian Dollar'),
  currency('CDF', 976, 2, 'Congolese Franc'),
  currency('CHF', 756, 2, 'Swiss Franc'),
  currency('CLP', 152, 0, 'Chilean Peso'),
  currency('CNY', 156, 2, 'Yuan Renminbi'),
  currency('COP', 170, 2, 'Colombian Peso'),
  currency('CRC', 188, 2, 'Costa Rican Colon'),
  currency('CUP', 192, 2, 'Cuban Peso'),
  currency('CVE', 132, 2, 'Cabo Verde Escudo'),
  currency('CZK', 203, 2, 'Czech Koruna'),
  currency('DJF', 262, 0, 'Djibouti Franc'),
  currency('DKK', 208, 2, 'Danish Krone'),
  currency('DOP', 214, 2, 'Dominican Peso'),
  currency('DZD', 12, 2, 'Algerian Dinar'),
  currency('EGP', 818, 2, 'Egyptian Pound'),
  currency('ERN', 232, 2, 'Nakfa'),
  currency('ETB', 230, 2, 'Ethiopian Birr'),
  currency('EUR', 978, 2, 'Euro'),
  currency('FJD', 242, 2, 'Fiji Dollar'),
  currency('FKP', 238, 2, 'Falkland Islands Pound'),
  currency('GBP', 826, 2, 'Pound Sterling'),
  currency('GEL', 981, 2, 'Lari'),
  currency('GHS', 936, 2, 'Ghana Cedi'),
  currency('GIP', 292, 2, 'Gibraltar Pound'),
  currency('GMD', 270, 2, 'Dalasi'),
  currency('GNF', 324, 0, 'Guinean Franc'),
  currency('GTQ', 320, 2, 'Quetzal'),
  currency('GYD', 328, 2, 'Guyana Dollar'),
  currency('HKD', 344, 2, 'Hong Kong Dollar'),
  currency('HNL', 340, 2, 'Lempira'),
  currency('HRK', 191, 2, 'Kuna'),
  currency('HTG', 332, 2, 'Gourde'),
  currency('HUF', 348, 2, 'Forint'),
  currency('IDR', 360, 2, 'Rupiah'),
  currency('ILS', 376, 2, 'New Israeli Sheqel'),
  currency('INR', 356, 2, 'Indian Rupee'),
  currency('IQD', 368, 3, 'Iraqi Dinar'),
  currency('IRR', 364, 2, 'Iranian Rial'),
  currency('ISK', 352, 0, 'Iceland Krona'),
  currency('JMD', 388, 2, 'Jamaican Dollar'),
  currency('JOD', 400, 3, 'Jordanian Dinar'),
  currency('JPY', 392, 0, 'Yen'),
  currency('KES', 404, 2, 'Kenyan Shilling'),
  currency('KGS', 417, 2, 'Som'),
  currency('KHR', 116, 2, 'Riel'),
  currency('KMF', 174, 0, 'Comorian Franc'),
  currency('KPW', 408, 2, 'North Korean Won'),
  currency('KRW', 410, 0, 'Won'),
  currency('KWD', 414, 3, 'Kuwaiti Dinar'),
  currency('KYD', 136, 2, 'Cayman Islands Dollar'),
  currency('KZT', 398, 2, 'Tenge'),
  currency('LAK', 418, 2, 'Lao Kip'),
  currency('LBP', 422, 2, 'Lebanese Pound'),
  currency('LKR', 144, 2, 'Sri Lanka Rupee'),
  currency('LRD', 430, 2, 'Liberian Dollar'),
  currency('LSL', 426, 2, 'Loti'),
  currency('LYD', 434, 3, 'Libyan Dinar'),
  currency('MAD', 504, 2, 'Moroccan Dirham'),
  currency('MDL', 498, 2, 'Moldovan Leu'),
  currency('MGA', 969, 2, 'Malagasy Ariary'),
  currency('MKD', 807, 2, 'Denar'),
  currency('MMK', 104, 2, 'Kyat'),
  currency('MNT', 496, 2, 'Tugrik'),
  currency('MOP', 446, 2, 'Pataca'),
  currency('MRU', 929, 2, 'Ouguiya'),
  currency('MUR', 480, 2, 'Mauritius Rupee'),
  currency('MVR', 462, 2, 'Rufiyaa'),
  currency('MWK', 454, 2, 'Malawi Kwacha'),
  currency('MXN', 484, 2, 'Mexican Peso'),
  currency('MYR', 458, 2, 'Malaysian Ringgit'),
  currency('MZN', 943, 2, 'Mozambique Metical'),
  currency('NAD', 516, 2, 'Namibia Dollar'),
  currency('NGN', 566, 2, 'Naira'),
  currency('NIO', 558, 2, 'Cordoba Oro'),
  currency('NOK', 578, 2, 'Norwegian Krone'),
  currency('NPR', 524, 2, 'Nepalese Rupee'),
  currency('NZD', 554, 2, 'New Zealand Dollar'),
  currency('OMR', 512, 3, 'Rial Omani'),
  currency('PAB', 590, 2, 'Balboa'),
  currency('PEN', 604, 2, 'Sol'),
  currency('PGK', 598, 2, 'Kina'),
  currency('PHP', 608, 2, 'Philippine Peso'),
  currency('PKR', 586, 2, 'Pakistan Rupee'),
  currency('PLN', 985, 2, 'Zloty'),
  currency('PYG', 600, 0, 'Guarani'),
  currency('QAR', 634, 2, 'Qatari Rial'),
  currency('RON', 946, 2, 'Romanian Leu'),
  currency('RSD', 941, 2, 'Serbian Dinar'),
  currency('RUB', 643, 2, 'Russian Ruble'),
  currency('RWF', 646, 0, 'Rwanda Franc'),
  currency('SAR', 682, 2, 'Saudi Riyal'),
  currency('SBD', 90, 2, 'Solomon Islands Dollar'),
  currency('SCR', 690, 2, 'Seychelles Rupee'),
  currency('SDG', 938, 2, 'Sudanese Pound'),
  currency('SEK', 752, 2, 'Swedish Krona'),
  currency('SGD', 702, 2, 'Singapore Dollar'),
  currency('SHP', 654, 2, 'Saint Helena Pound'),
  currency('SLE', 925, 2, 'Leone'),
  currency('SLL', 694, 2, 'Leone'),
  currency('SOS', 706, 2, 'Somali Shilling'),
  currency('SRD', 968, 2, 'Surinam Dollar'),
  currency('SSP', 728, 2, 'South Sudanese Pound'),
  currency('STN', 930, 2, 'Dobra'),
  currency('SVC', 222, 2, 'El Salvador Colon'),
  currency('SYP', 760, 2, 'Syrian Pound'),
  currency('SZL', 748, 2, 'Lilangeni'),
  currency('THB', 764, 2, 'Baht'),
  currency('TJS', 972, 2, 'Somoni'),
  currency('TMT', 934, 2, 'Turkmenistan New Manat'),
  currency('TND', 788, 3, 'Tunisian Dinar'),
  currency('TOP', 776, 2, 'Pa’anga'),
  currency('TRY', 949, 2, 'Turkish Lira'),
  currency('TTD', 780, 2, 'Trinidad and Tobago Dollar'),
  currency('TWD', 901, 2, 'New Taiwan Dollar'),
  currency('TZS', 834, 2, 'Tanzanian Shilling'),
  currency('UAH', 980, 2, 'Hryvnia'),
  currency('UGX', 800, 0, 'Uganda Shilling'),
  currency('USD', 840, 2, 'US Dollar'),
  currency('UYU', 858, 2, 'Peso Uruguayo'),
  currency('UZS', 860, 2, 'Uzbekistan Sum'),
  currency('VED', 926, 2, 'Bolívar Soberano'),
  currency('VES', 928, 2, 'Bolívar Soberano'),
  currency('VND', 704, 0, 'Dong'),
  currency('VUV', 548, 0, 'Vatu'),
  currency('WST', 882, 2, 'Tala'),
  currency('XAD', 396, 2, 'Arab Accounting Dinar'),
  currency('XAF', 950, 0, 'CFA Franc BEAC'),
  currency('XCD', 951, 2, 'East Caribbean Dollar'),
  currency('XCG', 532, 2, 'Caribbean Guilder'),
  currency('XOF', 952, 0, 'CFA Franc BCEAO'),
  currency('XPF', 953, 0, 'CFP Franc'),
  currency('YER', 886, 2, 'Yemeni Rial'),
  currency('ZAR', 710, 2, 'Rand'),
  currency('ZMW', 967, 2, 'Zambian Kwacha'),
  currency('ZWG', 924, 2, 'Zimbabwe Gold'),
]);

function indexBy<K>(key: (info: CurrencyInfo) => K): ReadonlyMap<K, CurrencyInfo> {
  const index = new Map<K, CurrencyInfo>();
  for (const info of CURRENCY_TABLE) {
    const k = key(info);
    if (index.has(k)) {
      // Load-time guard against a typo in the static table above, not a runtime condition.
      throw new Error(`duplicate key ${String(k)} in the currency table`);
    }
    index.set(k, info);
  }
  return index;
}

const BY_ALPHA = indexBy((info) => info.alpha);
const BY_NUMERIC = indexBy((info) => info.numeric);

/** Exact, upper-case lookup; normalisation of client input belongs to `CurrencyCode.of`. */
export function findCurrencyByAlpha(alpha: string): CurrencyInfo | undefined {
  return BY_ALPHA.get(alpha);
}

/** Alpha code for an ISO 4217 numeric code, or `undefined` when there is no mapping. */
export function numericToAlpha(numeric: number): string | undefined {
  return BY_NUMERIC.get(numeric)?.alpha;
}
