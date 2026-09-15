// Upstream bodies in Monobank's `/bank/currency` format, for driving the mock.

export const F_EXAMPLE = [
  { currencyCodeA: 840, currencyCodeB: 980, date: 1789113600, rateBuy: 41.1, rateSell: 41.6 },
  { currencyCodeA: 826, currencyCodeB: 980, date: 1789102800, rateCross: 55.4 },
];

export const F_ORDER = [
  { currencyCodeA: 985, currencyCodeB: 980, date: 1789113600, rateCross: 0.0272 },
  { currencyCodeA: 840, currencyCodeB: 980, date: 1789113600, rateBuy: 41.1, rateSell: 41.6 },
  { currencyCodeA: 826, currencyCodeB: 980, date: 1789113600, rateCross: 55.4 },
  { currencyCodeA: 978, currencyCodeB: 980, date: 1789113600, rateBuy: 44.9, rateSell: 45.5 },
];

/** Items that break the Monobank item rules; the mock must serve them as they are. */
export const F_BROKEN = [
  { currencyCodeA: '840', currencyCodeB: 980, date: 1789113600, rateBuy: 41.1 },
  { currencyCodeA: 840, currencyCodeB: 980, date: 1789113600, rateSell: -1 },
  { currencyCodeA: 978, currencyCodeB: 980, rateCross: 45 },
  null,
  [],
];

/**
 * ISO 4217 numeric codes of currencies with numeric minor units, plus the withdrawn BGN (975),
 * HRK (191) and SLL (694). Excludes codes with no alpha mapping such as 959 (XAU) and 999.
 */
export const SUPPORTED_NUMERIC_CODES: ReadonlySet<number> = new Set([
  784, 971, 8, 51, 532, 973, 32, 36, 533, 944, 977, 52, 50, 975, 48, 108, 60, 96, 68, 986, 44, 64,
  72, 933, 84, 124, 976, 756, 152, 156, 170, 188, 931, 192, 132, 203, 262, 208, 214, 12, 818, 232,
  230, 978, 242, 238, 826, 981, 936, 292, 270, 324, 320, 328, 344, 340, 191, 332, 348, 360, 376,
  356, 368, 364, 352, 388, 400, 392, 404, 417, 116, 174, 408, 410, 414, 136, 398, 418, 422, 144,
  430, 426, 434, 504, 498, 969, 807, 104, 496, 446, 929, 480, 462, 454, 484, 458, 943, 516, 566,
  558, 578, 524, 554, 512, 590, 604, 598, 608, 586, 985, 600, 634, 946, 941, 643, 646, 682, 90, 690,
  938, 752, 702, 654, 925, 694, 706, 968, 728, 930, 222, 760, 748, 764, 972, 934, 788, 776, 949,
  780, 901, 834, 980, 800, 840, 858, 927, 860, 926, 928, 704, 548, 882, 950, 951, 952, 953, 886,
  710, 967, 924,
]);
