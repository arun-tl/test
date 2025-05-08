import axios from 'axios';
import * as vt2geojson from '@mapbox/vt2geojson';
import { Logger } from '@nestjs/common';
import { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import * as turf from '@turf/turf';

type TileCoord = [number, number];

interface FeatureMap {
  [featureId: string]: Feature<Polygon | MultiPolygon>;
}

export class TileHelper {
  private readonly logger = new Logger(TileHelper.name);

  isValidPolygon(coordinates: any): boolean {
    return (
      Array.isArray(coordinates) &&
      coordinates.length > 0 &&
      coordinates.every((ring) => Array.isArray(ring) && ring.length >= 4)
    );
  }

  async fetchAndProcessTile(
    tileUrl: string,
    layer: string | string[],
    subGroup_name? : string,
  ): Promise<any> {
    const layerToFetch = Array.isArray(layer) ? layer : [layer];

    try {
      return await new Promise((resolve, reject) => {
        vt2geojson({ uri: tileUrl, layer: layerToFetch }, (err, data) => {
          if (err) {
            this.logger.error(`Error extracting GeoJSON for ${layer} , subGroup_name: ${subGroup_name}`);
            return resolve({ features: [] });
          }
          resolve(data);
        });
      });
    } catch (error) {
      this.logger.error('Unexpected error in fetchAndProcessTile', error);
      return { features: [] };
    }
  }

  async getLayerZoom(
    tileId: string,
    sourceLayer: string,
    apiKey: string,
  ): Promise<{ minzoom: number; maxzoom: number }> {
    if (tileId === 'maptiler_planet') {
      tileId = 'v3';
    }
    const url = `https://api.maptiler.com/tiles/${tileId}/tiles.json?key=${apiKey}`;
    try {
      const response = await axios.get(url);
      const layerDetails = response?.data?.vector_layers?.find(
        (layer: any) => layer.id === sourceLayer,
      );
      return {
        minzoom: layerDetails?.minzoom || 0,
        maxzoom: layerDetails?.maxzoom || 22,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get layer zoom for ${sourceLayer}: ${error}`,
      );
      return { minzoom: 0, maxzoom: 22 };
    }
  }

  getAdjacentTiles(
    latDeg: number,
    lonDeg: number,
    zoom: number,
    radiusKm: number,
  ): TileCoord[] {
    const earthCircumferenceKm = 40075;
    const tilesAtZoom = Math.pow(2, zoom);
    const tileSizeKmEquator = earthCircumferenceKm / tilesAtZoom;

    const latRad = (latDeg * Math.PI) / 180;
    const tileSizeLonKm = tileSizeKmEquator * Math.cos(latRad);
    const tileSizeLatKm = tileSizeKmEquator;

    const x = Math.floor(((lonDeg + 180) / 360) * tilesAtZoom);
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        tilesAtZoom,
    );

    const tilesX = Math.ceil(radiusKm / tileSizeLonKm);
    const tilesY = Math.ceil(radiusKm / tileSizeLatKm);

    const adjacentTiles: TileCoord[] = [];
    for (let dx = -tilesX; dx <= tilesX; dx++) {
      for (let dy = -tilesY; dy <= tilesY; dy++) {
        adjacentTiles.push([x + dx, y + dy]);
      }
    }

    return adjacentTiles;
  }

  // async fetchTileData(
  //   tileArray: TileCoord[],
  //   tileId: string,
  //   sourceLayer: string,
  //   zoom: number,
  //   mapTilerApiKey: string,
  // ): Promise<FeatureCollection> {
  //   const featureMap: FeatureMap = {};

  //   for (const [x, y] of tileArray) {
  //     const tileUrl = `https://api.maptiler.com/tiles/${tileId}/${zoom}/${x}/${y}.pbf?key=${mapTilerApiKey}`;
  //     try {
  //       const tileData = await this.fetchAndProcessTile(tileUrl, sourceLayer);
  //       for (const feature of tileData.features) {
  //         const id = feature.properties?.geohash_id;
  //         if (!id) continue;

  //         const geomType = feature.geometry.type;
  //         if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') continue;

  //         if (!featureMap[id]) {
  //           featureMap[id] = feature as Feature<Polygon | MultiPolygon>;
  //         } else {
  //           try {
  //             const feature1 =
  //               featureMap[id].geometry.type === 'MultiPolygon'
  //                 ? featureMap[id].geometry.coordinates[0]
  //                 : featureMap[id].geometry.coordinates;

  //             const feature2 =
  //               feature.geometry.type === 'MultiPolygon'
  //                 ? feature.geometry.coordinates[0]
  //                 : feature.geometry.coordinates;

  //             const poly1: any = turf.polygon(feature1);
  //             const poly2: any = turf.polygon(feature2);

  //             const merged = turf.union(
  //               turf.featureCollection([poly1, poly2]),
  //             ) as Feature<Polygon | MultiPolygon>;
  //             if (merged) {
  //               featureMap[id] = {
  //                 ...featureMap[id],
  //                 geometry: merged.geometry,
  //               };
  //             }
  //           } catch (err) {
  //             this.logger.warn(`Union failed for feature ${id}: ${err}`);
  //           }
  //         }
  //       }
  //     } catch (error) {
  //       this.logger.error(`Tile fetch error at (${x}, ${y}): ${error}`);
  //     }
  //   }

  //   return {
  //     type: 'FeatureCollection',
  //     features: Object.values(featureMap),
  //   };
  // }

  async fetchTileData(
    tileArray: TileCoord[],
    tileId: string,
    sourceLayer: string,
    zoom: number,
    mapTilerApiKey: string,
    subGroup_name : string
  ): Promise<FeatureCollection> {
    const featureMap: FeatureMap = {};
    const otherFeatures: Feature[] = [];

    for (const [x, y] of tileArray) {
      const tileUrl = `https://api.maptiler.com/tiles/${tileId}/${zoom}/${x}/${y}.pbf?key=${mapTilerApiKey}`;
      try {
        const tileData = await this.fetchAndProcessTile(tileUrl, sourceLayer,subGroup_name);
        for (const feature of tileData.features) {
          const geomType = feature.geometry.type;
          const id = feature.properties?.geohash_id;

          if (id && (geomType === 'Polygon' || geomType === 'MultiPolygon')) {
            if (!featureMap[id]) {
              featureMap[id] = feature as Feature<Polygon | MultiPolygon>;
            } else {
              try {
                const feature1 =
                  featureMap[id].geometry.type === 'MultiPolygon'
                    ? featureMap[id].geometry.coordinates[0]
                    : featureMap[id].geometry.coordinates;

                const feature2 =
                  feature.geometry.type === 'MultiPolygon'
                    ? feature.geometry.coordinates[0]
                    : feature.geometry.coordinates;

                const poly1: any = turf.polygon(feature1);
                const poly2: any = turf.polygon(feature2);

                const merged = turf.union(
                  turf.featureCollection([poly1, poly2]),
                ) as Feature<Polygon | MultiPolygon>;

                if (merged) {
                  featureMap[id] = {
                    ...featureMap[id],
                    geometry: merged.geometry,
                  };
                }
              } catch (err) {
                this.logger.warn(`Union failed for feature ${id}: ${err}`);
              }
            }
          } else {
            // Add features with other geometry types or without geohash_id directly
            otherFeatures.push(feature);
          }
        }
      } catch (error) {
        this.logger.error(`Tile fetch error at (${x}, ${y}): ${error}`);
      }
    }

    return {
      type: 'FeatureCollection',
      features: [...Object.values(featureMap), ...otherFeatures],
    };
  }

  // async fetchTileDataForTile(
  //   tileArray: [number, number][],
  //   tileId: string,
  //   sourceLayer: string,
  //   zoom: number,
  //   mapTilerApiKey: string,
  // ): Promise<any> {
  //   this.logger.debug(
  //     `Fetching tile data for tileId: ${tileId}, sourceLayer: ${sourceLayer}, zoom: ${zoom}`,
  //   );
  //   const featureCollection = {
  //     type: 'FeatureCollection',
  //     features: [] as any,
  //   };
  //   for (const [x, y] of tileArray) {
  //     try {
  //       const tileUrl = `https://api.maptiler.com/tiles/${tileId}/${zoom}/${x}/${y}.pbf?key=${mapTilerApiKey}`;
  //       const tileData = await this.fetchAndProcessTile(tileUrl, sourceLayer);
  //       tileData.features.forEach((feature: any) => {
  //         featureCollection.features.push(feature);
  //       });
  //     } catch (error) {
  //       this.logger.error('Error getting data', JSON.stringify(error));
  //     }
  //   }
  //   return featureCollection;
  // }

  /**
   * Converts degrees to radians.
   */
  degToRad = (deg: number): number => (deg * Math.PI) / 180;

  /**
   * Returns destination point from a start point, bearing and distance using Haversine formula.
   */
  destinationPoint = (
    lat: number,
    lon: number,
    distanceKm: number,
    bearingDeg: number,
  ): [number, number] => {
    const R = 6371; // Earth's radius in km
    const bearing = this.degToRad(bearingDeg);
    const δ = distanceKm / R;

    const φ1 = this.degToRad(lat);
    const λ1 = this.degToRad(lon);

    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(δ) +
        Math.cos(φ1) * Math.sin(δ) * Math.cos(bearing),
    );
    const λ2 =
      λ1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(δ) * Math.cos(φ1),
        Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
      );

    return [φ2 * (180 / Math.PI), λ2 * (180 / Math.PI)];
  };

  /**
   * Get bounding box for a buffer radius around a point.
   */
  getBufferBounds = (
    lat: number,
    lon: number,
    radiusKm: number,
  ): [number, number, number, number] => {
    const [north] = this.destinationPoint(lat, lon, radiusKm, 0);
    const [south] = this.destinationPoint(lat, lon, radiusKm, 180);
    const [, east] = this.destinationPoint(lat, lon, radiusKm, 90);
    const [, west] = this.destinationPoint(lat, lon, radiusKm, 270);
    return [north, south, east, west];
  };

  /**
   * Converts lat/lon to tile X/Y at a specific zoom.
   */
  latLonToTile = (lat: number, lon: number, zoom: number): [number, number] => {
    const latRad = this.degToRad(lat);
    const n = 2 ** zoom;
    const xtile = Math.floor(((lon + 180) / 360) * n);
    const ytile = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        n,
    );
    return [xtile, ytile];
  };

  /**
   * Tile object interface.
   */

  /**
   * Main function: gets all tiles within a buffer radius around a lat/lon.
   */
  getTilesInBuffer = (
    lat: number,
    lon: number,
    radiusKm: number,
    zoom: number,
  ): [number, number][] => {
    const [north, south, east, west] = this.getBufferBounds(lat, lon, radiusKm);

    const [xMin, yMin] = this.latLonToTile(north, west, zoom);
    const [xMax, yMax] = this.latLonToTile(south, east, zoom);

    const tiles: [number, number][] = [];

    for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
      for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
        tiles.push([x, y]);
      }
    }

    return tiles;
  };
}
