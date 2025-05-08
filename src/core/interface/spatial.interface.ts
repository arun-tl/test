export interface IspatialTileRequest {
    latitude: number;
    longitude: number;
    property_type: string;
    max_zoom: number;
  }
  
  export interface GroupedGeoJsonResponse {
    grouped_geojson: Record<string, string>; // category -> GeoJSON string
  }