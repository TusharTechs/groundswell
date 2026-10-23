// The cities Groundswell models. Each is a circle Qloo's heatmap covers with a
// grid of geohash cells; the radius keeps the grid at city scale.

export interface CityDef {
  id: string;
  name: string;
  country: string;
  /** [lon, lat] */
  center: [number, number];
  radiusKm: number;
  /** Map camera zoom that fits the circle. */
  zoom: number;
  /** Qloo location query used for brand recommendations biased to the city. */
  locationQuery: string;
}

export const CITIES: CityDef[] = [
  { id: "chicago", name: "Chicago", country: "United States", center: [-87.675, 41.84], radiusKm: 22, zoom: 10.2, locationQuery: "Chicago" },
  { id: "new-york", name: "New York", country: "United States", center: [-73.95, 40.72], radiusKm: 20, zoom: 10.3, locationQuery: "New York City" },
  { id: "los-angeles", name: "Los Angeles", country: "United States", center: [-118.33, 34.05], radiusKm: 25, zoom: 10, locationQuery: "Los Angeles" },
  { id: "atlanta", name: "Atlanta", country: "United States", center: [-84.39, 33.76], radiusKm: 18, zoom: 10.4, locationQuery: "Atlanta" },
  { id: "london", name: "London", country: "United Kingdom", center: [-0.12, 51.51], radiusKm: 18, zoom: 10.4, locationQuery: "London" },
  { id: "mexico-city", name: "Mexico City", country: "Mexico", center: [-99.15, 19.4], radiusKm: 16, zoom: 10.6, locationQuery: "Mexico City" },
  { id: "tokyo", name: "Tokyo", country: "Japan", center: [139.72, 35.68], radiusKm: 18, zoom: 10.4, locationQuery: "Tokyo" },
];

export const cityById = (id: string) => CITIES.find((c) => c.id === id);
