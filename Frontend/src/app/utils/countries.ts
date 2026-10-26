/* ===========================================================
   COUNTRY / CITY DATASET
   Lightweight, static dataset for the checkout location flow.
   Only includes countries/cities relevant to Irhas'Inn customers.
   =========================================================== */

export interface CityEntry {
  name: string;
  /** Approximate center coords for map fallback */
  lat: number;
  lng: number;
}

export interface CountryEntry {
  code: string;
  name: string;
  cities: CityEntry[];
}

export const COUNTRIES: CountryEntry[] = [
  {
    code: "PK",
    name: "Pakistan",
    cities: [
      { name: "Karachi", lat: 24.8607, lng: 67.0011 },
      { name: "Lahore", lat: 31.5204, lng: 74.3587 },
      { name: "Islamabad", lat: 33.6844, lng: 73.0479 },
      { name: "Rawalpindi", lat: 33.5651, lng: 73.0169 },
      { name: "Faisalabad", lat: 31.4504, lng: 73.1350 },
      { name: "Multan", lat: 30.1575, lng: 71.5249 },
      { name: "Peshawar", lat: 34.0151, lng: 71.5249 },
      { name: "Quetta", lat: 30.1798, lng: 66.9750 },
      { name: "Hyderabad", lat: 25.3960, lng: 68.3578 },
      { name: "Sialkot", lat: 32.4945, lng: 74.5229 },
      { name: "Gujranwala", lat: 32.1877, lng: 74.1945 },
      { name: "Bahawalpur", lat: 29.3956, lng: 71.6725 },
      { name: "Sukkur", lat: 27.7136, lng: 68.8486 },
      { name: "Larkana", lat: 27.5600, lng: 68.2264 },
      { name: "Mardan", lat: 34.1959, lng: 72.0329 },
      { name: "Abbottabad", lat: 34.1469, lng: 73.1990 },
      { name: "Dera Ghazi Khan", lat: 30.0561, lng: 70.6344 },
      { name: "Sahiwal", lat: 30.6682, lng: 73.1117 },
      { name: "Wah Cantt", lat: 33.7689, lng: 72.7326 },
      { name: "Muzaffarabad", lat: 34.3699, lng: 73.4836 },
    ],
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    cities: [
      { name: "Dubai", lat: 25.2048, lng: 55.2708 },
      { name: "Abu Dhabi", lat: 24.4539, lng: 54.3773 },
      { name: "Sharjah", lat: 25.3463, lng: 55.4209 },
      { name: "Ajman", lat: 25.4052, lng: 55.5136 },
      { name: "Ras Al Khaimah", lat: 25.7897, lng: 55.9432 },
      { name: "Fujairah", lat: 25.1288, lng: 56.3264 },
      { name: "Umm Al Quwain", lat: 25.5200, lng: 55.5500 },
      { name: "Al Ain", lat: 24.1917, lng: 55.8047 },
    ],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    cities: [
      { name: "Riyadh", lat: 24.7136, lng: 46.6753 },
      { name: "Jeddah", lat: 21.4858, lng: 39.1925 },
      { name: "Mecca", lat: 21.3891, lng: 39.8579 },
      { name: "Medina", lat: 24.5247, lng: 39.5692 },
      { name: "Dammam", lat: 26.3927, lng: 49.9777 },
      { name: "Khobar", lat: 26.2172, lng: 50.1971 },
      { name: "Tabuk", lat: 28.3838, lng: 36.5550 },
      { name: "Abha", lat: 18.2164, lng: 42.5053 },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    cities: [
      { name: "London", lat: 51.5074, lng: -0.1278 },
      { name: "Birmingham", lat: 52.4862, lng: -1.8904 },
      { name: "Manchester", lat: 53.4808, lng: -2.2426 },
      { name: "Glasgow", lat: 55.8642, lng: -4.2518 },
      { name: "Edinburgh", lat: 55.9533, lng: -3.1883 },
      { name: "Leeds", lat: 53.8008, lng: -1.5491 },
      { name: "Liverpool", lat: 53.4084, lng: -2.9916 },
      { name: "Bristol", lat: 51.4545, lng: -2.5879 },
    ],
  },
  {
    code: "US",
    name: "United States",
    cities: [
      { name: "New York", lat: 40.7128, lng: -74.0060 },
      { name: "Los Angeles", lat: 34.0522, lng: -118.2437 },
      { name: "Chicago", lat: 41.8781, lng: -87.6298 },
      { name: "Houston", lat: 29.7604, lng: -95.3698 },
      { name: "Phoenix", lat: 33.4484, lng: -112.0740 },
      { name: "Dallas", lat: 32.7767, lng: -96.7970 },
      { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
      { name: "Seattle", lat: 47.6062, lng: -122.3321 },
    ],
  },
  {
    code: "CA",
    name: "Canada",
    cities: [
      { name: "Toronto", lat: 43.6532, lng: -79.3832 },
      { name: "Vancouver", lat: 49.2827, lng: -123.1207 },
      { name: "Montreal", lat: 45.5017, lng: -73.5673 },
      { name: "Calgary", lat: 51.0447, lng: -114.0719 },
      { name: "Ottawa", lat: 45.4215, lng: -75.6972 },
      { name: "Edmonton", lat: 53.5461, lng: -113.4938 },
    ],
  },
  {
    code: "AU",
    name: "Australia",
    cities: [
      { name: "Sydney", lat: -33.8688, lng: 151.2093 },
      { name: "Melbourne", lat: -37.8136, lng: 144.9631 },
      { name: "Brisbane", lat: -27.4698, lng: 153.0251 },
      { name: "Perth", lat: -31.9505, lng: 115.8605 },
      { name: "Adelaide", lat: -34.9285, lng: 138.6007 },
    ],
  },
  {
    code: "DE",
    name: "Germany",
    cities: [
      { name: "Berlin", lat: 52.5200, lng: 13.4050 },
      { name: "Munich", lat: 48.1351, lng: 11.5820 },
      { name: "Hamburg", lat: 53.5511, lng: 9.9937 },
      { name: "Frankfurt", lat: 50.1109, lng: 8.6821 },
      { name: "Cologne", lat: 50.9375, lng: 6.9603 },
    ],
  },
  {
    code: "FR",
    name: "France",
    cities: [
      { name: "Paris", lat: 48.8566, lng: 2.3522 },
      { name: "Marseille", lat: 43.2965, lng: 5.3698 },
      { name: "Lyon", lat: 45.7640, lng: 4.8357 },
      { name: "Toulouse", lat: 43.6047, lng: 1.4442 },
      { name: "Nice", lat: 43.7102, lng: 7.2620 },
    ],
  },
  {
    code: "TR",
    name: "Turkey",
    cities: [
      { name: "Istanbul", lat: 41.0082, lng: 28.9784 },
      { name: "Ankara", lat: 39.9334, lng: 32.8597 },
      { name: "Izmir", lat: 38.4237, lng: 27.1428 },
      { name: "Bursa", lat: 40.1885, lng: 29.0610 },
      { name: "Antalya", lat: 36.8969, lng: 30.7133 },
    ],
  },
  {
    code: "MY",
    name: "Malaysia",
    cities: [
      { name: "Kuala Lumpur", lat: 3.1390, lng: 101.6869 },
      { name: "George Town", lat: 5.4164, lng: 100.3327 },
      { name: "Johor Bahru", lat: 1.4927, lng: 103.7414 },
      { name: "Kota Kinabalu", lat: 5.9804, lng: 116.0735 },
    ],
  },
  {
    code: "SG",
    name: "Singapore",
    cities: [
      { name: "Singapore", lat: 1.3521, lng: 103.8198 },
    ],
  },
  {
    code: "QA",
    name: "Qatar",
    cities: [
      { name: "Doha", lat: 25.2854, lng: 51.5310 },
      { name: "Al Wakrah", lat: 25.1716, lng: 51.6000 },
    ],
  },
  {
    code: "KW",
    name: "Kuwait",
    cities: [
      { name: "Kuwait City", lat: 29.3759, lng: 47.9774 },
      { name: "Hawalli", lat: 29.3382, lng: 48.0293 },
    ],
  },
  {
    code: "BH",
    name: "Bahrain",
    cities: [
      { name: "Manama", lat: 26.2285, lng: 50.5860 },
      { name: "Riffa", lat: 26.1294, lng: 50.5553 },
    ],
  },
  {
    code: "OM",
    name: "Oman",
    cities: [
      { name: "Muscat", lat: 23.5880, lng: 58.3829 },
      { name: "Salalah", lat: 17.0151, lng: 54.0924 },
    ],
  },
];

/**
 * Search countries by keyword (case-insensitive prefix/contains match).
 */
export function searchCountries(query: string): CountryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q),
  );
}

/**
 * Get cities for a given country code.
 */
export function getCitiesForCountry(countryCode: string): CityEntry[] {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  return country?.cities || [];
}

/**
 * Search cities within a country by keyword.
 */
export function searchCities(
  countryCode: string,
  query: string,
): CityEntry[] {
  const cities = getCitiesForCountry(countryCode);
  const q = query.trim().toLowerCase();
  if (!q) return cities;
  return cities.filter((c) => c.name.toLowerCase().includes(q));
}

/**
 * Find a country by name (fuzzy match).
 */
export function findCountryByName(name: string): CountryEntry | undefined {
  const q = name.trim().toLowerCase();
  return COUNTRIES.find(
    (c) =>
      c.name.toLowerCase() === q ||
      c.name.toLowerCase().startsWith(q),
  );
}

/**
 * Find a city within a country by name.
 */
export function findCityInCountry(
  countryCode: string,
  cityName: string,
): CityEntry | undefined {
  const cities = getCitiesForCountry(countryCode);
  const q = cityName.trim().toLowerCase();
  return cities.find((c) => c.name.toLowerCase() === q);
}
