export interface ReferenceCurrency {
  readonly alpha: string;
  readonly numeric: number;
  readonly minorUnits: 0 | 2 | 3;
}

/** Parses a group written as `"BIF 108, CLP 152, …"`, so the text can be pasted from ISO 4217. */
function group(minorUnits: 0 | 2 | 3, entries: string): ReferenceCurrency[] {
  return entries.split(',').map((entry) => {
    const match = /^([A-Z]{3}) (\d+)$/.exec(entry.trim());
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new Error(`malformed reference entry "${entry}"`);
    }
    return { alpha: match[1], numeric: Number(match[2]), minorUnits };
  });
}

export const MINOR_UNITS_0 = group(
  0,
  `BIF 108, CLP 152, DJF 262, GNF 324, ISK 352, JPY 392, KMF 174, KRW 410, PYG 600, RWF 646,
   UGX 800, VND 704, VUV 548, XAF 950, XOF 952, XPF 953`,
);

export const MINOR_UNITS_3 = group(
  3,
  `BHD 48, IQD 368, JOD 400, KWD 414, LYD 434, OMR 512, TND 788`,
);

export const MINOR_UNITS_2 = group(
  2,
  `AED 784, AFN 971, ALL 8, AMD 51, AOA 973, ARS 32, AUD 36, AWG 533, AZN 944, BAM 977, BBD 52,
   BDT 50, BGN 975, BMD 60, BND 96, BOB 68, BRL 986, BSD 44, BTN 64, BWP 72, BYN 933, BZD 84,
   CAD 124, CDF 976, CHF 756, CNY 156, COP 170, CRC 188, CUP 192, CVE 132, CZK 203, DKK 208,
   DOP 214, DZD 12, EGP 818, ERN 232, ETB 230, EUR 978, FJD 242, FKP 238, GBP 826, GEL 981,
   GHS 936, GIP 292, GMD 270, GTQ 320, GYD 328, HKD 344, HNL 340, HRK 191, HTG 332, HUF 348,
   IDR 360, ILS 376, INR 356, IRR 364, JMD 388, KES 404, KGS 417, KHR 116, KPW 408, KYD 136,
   KZT 398, LAK 418, LBP 422, LKR 144, LRD 430, LSL 426, MAD 504, MDL 498, MGA 969, MKD 807,
   MMK 104, MNT 496, MOP 446, MRU 929, MUR 480, MVR 462, MWK 454, MXN 484, MYR 458, MZN 943,
   NAD 516, NGN 566, NIO 558, NOK 578, NPR 524, NZD 554, PAB 590, PEN 604, PGK 598, PHP 608,
   PKR 586, PLN 985, QAR 634, RON 946, RSD 941, RUB 643, SAR 682, SBD 90, SCR 690, SDG 938,
   SEK 752, SGD 702, SHP 654, SLE 925, SLL 694, SOS 706, SRD 968, SSP 728, STN 930, SVC 222,
   SYP 760, SZL 748, THB 764, TJS 972, TMT 934, TOP 776, TRY 949, TTD 780, TWD 901, TZS 834,
   UAH 980, USD 840, UYU 858, UZS 860, VED 926, VES 928, WST 882, XAD 396, XCD 951, XCG 532,
   YER 886, ZAR 710, ZMW 967, ZWG 924`,
);

/** The supported currencies as published, typed independently of the production table. */
export const REFERENCE_CURRENCIES: readonly ReferenceCurrency[] = [
  ...MINOR_UNITS_0,
  ...MINOR_UNITS_3,
  ...MINOR_UNITS_2,
];
