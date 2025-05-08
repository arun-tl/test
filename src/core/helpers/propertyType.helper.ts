import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as turf from '@turf/turf';
import { TileHelper } from './tile.helper';

interface MapLayer {
  id: string;
  type?: string;
  source: string;
  'source-layer'?: string;
}

interface VectorLayerMetadata {
  id: string;
  maxzoom: number;
}

interface LayerMapping {
  ids: string[];
  layer_id: { layer: string; maxzoom: number }[];
}

@Injectable()
export class PropertyTypeHelper {
  private readonly logger = new Logger(PropertyTypeHelper.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tileHelper: TileHelper,
  ) {}

  async getLayersFromStyle(): Promise<MapLayer[]> {
    try {
      const styleJsonUrl = this.configService.get<string>(
        'maptiler.mapTilerStyleUrl',
      ) as string;
      const response = await axios.get(styleJsonUrl);
      return response.data?.layers || [];
    } catch (error) {
      this.logger.error('Failed to fetch layers from style JSON', error);
      throw error;
    }
  }

  async getCDPLayer(): Promise<MapLayer[]> {
    const layers = await this.getLayersFromStyle();
    return layers.filter((layer) => layer.id === 'Proposed-CDP-Map');
  }

  async generateLayerMapping(
    inputIds: string[],
    layers: MapLayer[],
    apiKey: string,
  ): Promise<Record<string, LayerMapping>> {
    const tilesUrl = this.configService.get<string>(
      'maptiler.mapTilerTilesUrl',
    );
    const result: Record<string, LayerMapping> = {};
    const sourceUrls: Record<string, string> = {};

    for (const layer of layers) {
      if (!inputIds.includes(layer.id) || !layer.type) continue;

      const { source, id, 'source-layer': sourceLayer } = layer;

      if (!result[source]) {
        result[source] = { ids: [], layer_id: [] };
      }

      result[source].ids.push(id);

      if (sourceLayer) {
        const exists = result[source].layer_id.some(
          (l) => l.layer === sourceLayer,
        );
        if (!exists) {
          result[source].layer_id.push({ layer: sourceLayer, maxzoom: 0 });
        }
      }

      if (!sourceUrls[source]) {
        const version = source === 'maptiler_planet' ? 'v3' : source;
        sourceUrls[source] = `${tilesUrl}/${version}/tiles.json?key=${apiKey}`;
      }
    }

    await Promise.all(
      Object.entries(sourceUrls).map(async ([sourceName, url]) => {
        try {
          const { data } = await axios.get(url);
          const vectorLayers: VectorLayerMetadata[] = data?.vector_layers || [];

          result[sourceName].layer_id = result[sourceName].layer_id.map(
            (layer) => {
              const match = vectorLayers.find((v) => v.id === layer.layer);
              return {
                ...layer,
                maxzoom: match?.maxzoom || 0,
              };
            },
          );
        } catch (error) {
          this.logger.warn(
            `Failed to fetch metadata for source: ${sourceName}`,
            error,
          );
        }
      }),
    );

    return result;
  }

  async lonLatToTile(lon: number, lat: number, zoom: number) {
    const scale = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * scale);
    const y = Math.floor(
      ((1 -
        Math.log(
          Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
        ) /
          Math.PI) /
        2) *
        scale,
    );
    return { x, y, z: zoom };
  }

  processFeatures(
    features: any[] = [],
    point: any,
    typeCheckFn: (properties: any) => { allowed: boolean; type: string } | null,
  ): { allowed: boolean; type: string } | null {
    for (const feature of features) {
      const { geometry, properties } = feature;

      if (
        (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
        turf.booleanPointInPolygon(point, geometry)
      ) {
        const result = typeCheckFn(properties);
        if (result) return result;
      }
    }

    return null;
  }

  isAllowedCDPType(properties: any): { allowed: boolean; type: string } | null {
    const allowedTypes = [
      'Residential Main',
      'Residential Mixed',
      'Agricultural Land',
      'Commercial Business',
      'Commercial Center',
      'High Tech',
      'Industrial',
    ];

    if (properties.name) {
      return {
        allowed: allowedTypes.includes(properties.name),
        type: properties.name,
      };
    }
    return null;
  }

  isAllowedLandUseType(
    properties: any,
  ): { allowed: boolean; type: string } | null {
    const allowedClasses = [
      'residential',
      'industrial',
      'commercial',
      'neighbourhood',
    ];

    if (properties.vt_layer === 'landuse' && properties.class) {
      return {
        allowed: allowedClasses.includes(properties.class),
        type: properties.class,
      };
    }

    if (properties.vt_layer === 'building') {
      return {
        allowed: true,
        type: 'building',
      };
    }

    return null;
  }

  async fetchVectorData(
    longitude: number,
    latitude: number,
    zoom: number,
    layerIds: string[],
    sourceTile: string,
  ): Promise<any> {
    const tilesUrl = this.configService.get<string>('maptiler.mapTilerTilesUrl');
    const apiKey = this.configService.get<string>('maptiler.mapTilerApiKey');

    if (!tilesUrl || !apiKey) {
      this.logger.error('MapTiler configuration missing.');
      throw new Error('Tile URL or API key is missing.');
    }

    try {
      const { x, y, z } = await this.lonLatToTile(longitude, latitude, zoom);

      const tileUrl = `${tilesUrl}/${sourceTile}/${z}/${x}/${y}.pbf?key=${apiKey}`;

      this.logger.log(
        `Fetching vector tile for z=${z}, x=${x}, y=${y}, source=${sourceTile}, layers=${layerIds.join(',')}`,
      );

      const tileData = await this.tileHelper.fetchAndProcessTile(
        tileUrl,
        layerIds,
      );

      if (!tileData || !tileData.features) {
        this.logger.warn(`No features found in tile: ${tileUrl}`);
      }

      return tileData;
    } catch (error) {
      // this.logger.error('Error fetching vector tile', error.stack || error);
      throw new BadRequestException('Failed to fetch vector tile data');
    }
  }
}
