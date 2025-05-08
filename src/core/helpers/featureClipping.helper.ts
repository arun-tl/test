import { Logger } from '@nestjs/common';
import * as turf from '@turf/turf';
import { FeatureCollection, Feature, Polygon, Point } from 'geojson';

// import lineclip from 'lineclip';

interface IGeometry {
  type: string;
  coordinates: any;
}

interface IFeature {
  type: 'Feature';
  geometry: IGeometry;
  properties: Record<string, string>;
}

export class FeatureClippingHelper {
  private readonly logger = new Logger(FeatureClippingHelper.name);

  private createBuffer = (
    lat: number,
    long: number,
    distanceInKm: number = 5,
  ): any => {
    try {
      const point = turf.point([long, lat]);
      return turf.buffer(point, distanceInKm, { units: 'kilometers' });
    } catch (error) {
      this.logger.error('Error creating buffer', JSON.stringify(error));
    }
  };

  private createBboxfromBuffer = (buffer: any): any => {
    try {
      const bboxArray = turf.bbox(buffer); // Get [minX, minY, maxX, maxY] from the Polygon
      return bboxArray;
    } catch (error) {
      this.logger.error('Error creating bbox', JSON.stringify(error));
    }
  };

  // findFeaturesWithinBuffer = (
  //   lat: number,
  //   long: number,
  //   distanceInKm: number,
  //   featureCollection: IFeature[],
  // ) => {
  //   const buffer = this.createBuffer(lat, long, distanceInKm);
  //   const bufferBbox = this.createBboxfromBuffer(buffer);
  //   const filteredCollection = featureCollection.filter((feature) => {
  //     try {
  //       const geometry = feature.geometry;
  //       if (geometry.type === 'Point' || geometry.type === 'MultiPoint') {
  //         return turf.booleanPointInPolygon(
  //           turf.point(geometry?.coordinates),
  //           buffer,
  //         );
  //       } else if (
  //         geometry.type === 'Polygon' ||
  //         geometry.type === 'MultiPolygon'
  //       ) {
  //         const polygon = turf.polygon(geometry.coordinates);
  //         const clipped = turf.bboxClip(polygon, bufferBbox);
  //         return (
  //           clipped &&
  //           clipped.geometry &&
  //           clipped.geometry.coordinates.length > 0
  //         );
  //       } else if (
  //         geometry.type === 'LineString' ||
  //         geometry.type === 'MultiLineString'
  //       ) {
  //         const line = turf.lineString(geometry.coordinates);
  //         const clipped = turf.bboxClip(line, bufferBbox);
  //         return (
  //           clipped &&
  //           clipped.geometry &&
  //           clipped.geometry.coordinates.length > 0
  //         );
  //       }
  //       return false;
  //     } catch (error) {
  //       // this.logger.log('Feature that got error', JSON.stringify(feature));
  //       return false;
  //     }
  //   });
  //   return filteredCollection;
  // };

  findFeaturesWithinBuffer(
    lat: number,
    long: number,
    distanceInKm: number,
    featureCollection: IFeature[],
  ): IFeature[] {
    const buffer = this.createBuffer(lat, long, distanceInKm);
    const bufferBbox = this.createBboxfromBuffer(buffer);
    const filteredCollection: IFeature[] = [];

    for (const feature of featureCollection) {
      try {
        const geometry: any = feature.geometry;

        if (!geometry) continue;

        if (geometry.type === 'Point' || geometry.type === 'MultiPoint') {
          const point = turf.point(geometry.coordinates);
          if (turf.booleanPointInPolygon(point, buffer)) {
            filteredCollection.push(feature);
          }
        } else if (
          geometry.type === 'Polygon' ||
          geometry.type === 'MultiPolygon'
        ) {
          const polygon = turf.polygon(geometry.coordinates as any);
          const clipped = turf.bboxClip(polygon, bufferBbox);

          if (clipped && clipped.geometry?.coordinates.length > 0) {
            filteredCollection.push({
              ...feature,
              geometry: clipped.geometry,
            });
          }
        } else if (
          geometry.type === 'LineString' ||
          geometry.type === 'MultiLineString'
        ) {
          const lines =
            geometry.type === 'LineString'
              ? [geometry.coordinates]
              : geometry.coordinates;

          // filteredCollection.push(feature);

          for (const lineCoords of lines) {
            const line = turf.lineString(lineCoords);
            const split = turf.lineSplit(line, buffer);

            split.features.forEach((segment) => {
              const startPoint = turf.point(segment.geometry.coordinates[0]);
              if (turf.booleanPointInPolygon(startPoint, buffer)) {
                filteredCollection.push({
                  ...feature,
                  geometry: segment.geometry,
                });
              }
            });
          }
        }
      } catch (error) {
        this.logger.warn(
          'Error processing feature',
          JSON.stringify(feature.properties),
        );
        this.logger.error('Error details', JSON.stringify(error));
      }
    }

    return filteredCollection;
  }

  filterFeatures = (feature: any, filter: Record<string, any>): boolean => {
    return Object.entries(filter).every(([key, condition]) => {
      switch (condition.type) {
        case 'includes': {
          if(Array.isArray(condition.value)) {
            return condition.value.some((val) => feature?.properties?.[key]?.includes(val));
          } 
          return feature?.properties?.[key]?.includes(condition?.value);
        }
      }

      const [property, op] = key.split('__');
      const featureValue = feature.properties[property];

      if (op) {
        // Numeric or comparable operators
        switch (op) {
          case 'lte':
            return featureValue <= condition;
          case 'gte':
            return featureValue >= condition;
          case 'eq':
            return featureValue === condition;
          default:
            console.warn(`Unsupported operator: ${op}`);
            return false;
        }
      } else {
        // Default: array or direct value comparison
        if (Array.isArray(condition)) {
          return condition.includes(featureValue);
        }
        return featureValue === condition;
      }
    });
  };

  getPolygonContainingPoint(
    featureCollection: FeatureCollection<Polygon>,
    lat: number,
    lng: number,
  ): Feature<Polygon> | null {
    const point: Feature<Point> = turf.point([lng, lat]);
    this.logger.debug('FeatueCollection', JSON.stringify(featureCollection));
    for (const feature of featureCollection.features) {
      if (turf.booleanPointInPolygon(point, feature)) {
        this.logger.debug('Found feature containing point');
        return feature;
      }
    }

    return null;
  }

  filterFeaturesInIsochrone(isochronePolygon: any, features: any[] = []) {
    return features.filter((feature) => {
      if (!feature.geometry) return false;

      const { type } = feature.geometry;
      if (type === 'Point') {
        return turf.booleanPointInPolygon(feature, isochronePolygon);
      }

      return false;
    });
  }
}
