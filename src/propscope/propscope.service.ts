import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { PropscopeDao } from 'src/core/dao/propscope.dao';
import { ConfigService } from '@nestjs/config';
import { FeatureClippingHelper } from 'src/core/helpers/featureClipping.helper';
import { TileHelper } from 'src/core/helpers/tile.helper';
import { PropertyTypeHelper } from 'src/core/helpers/propertyType.helper';
import * as turf from '@turf/turf';

interface ILayer {
  id: string;
  source: string;
  ['source-layer']?: string;
}

@Injectable()
export class PropscopeService {
  private readonly logger = new Logger(PropscopeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly propscopeDao: PropscopeDao,
    private readonly featureClippingHelper: FeatureClippingHelper,
    private readonly tileHelper: TileHelper,
    private readonly propertyTypeHelper: PropertyTypeHelper,
  ) {}

  async createPropscope(
    lat: number,
    lon: number,
    zoom: number,
    property_type: string,
    isochronePolygons?: any,
  ): Promise<any> {
    const manifestCollection = this.configService.get<string>(
      'mongoDB.propScopeManifestCollectionName',
    ) as string;
    const propscope_id = uuidv4();
    const propscope_status = !true;
    const groupName = await this.propscopeDao.getGroupNamefromManifest(
      manifestCollection,
      property_type,
    );

    await this.propscopeDao.createPropscopeEntry(
      propscope_id,
      property_type,
      lat,
      lon,
    );
    this.generateReport(
      lat,
      lon,
      zoom,
      property_type,
      propscope_id,
      isochronePolygons,
    );
    return {
      propscope_id: propscope_id,
      propscope_group_name: groupName,
      propscope_status: propscope_status,
      latitude: lat,
      longtitude: lon,
    };
  }

  async getPropscopeStatus(propscopeId: string): Promise<any> {
    this.logger.debug(`Getting propsope for id : ${propscopeId}`);
    const mongoPropscopeCollection = this.configService.get<string>(
      'mongoDB.propScopeCollectionName',
    ) as string;

    const manifestCollection = this.configService.get<string>(
      'mongoDB.propScopeManifestCollectionName',
    ) as string;

    const propscope = await this.propscopeDao.getPropScopeStatus(
      mongoPropscopeCollection,
      propscopeId,
    );

    this.logger.debug('propscope response', JSON.stringify(propscope));

    const groupName = await this.propscopeDao.getGroupNamefromManifest(
      manifestCollection,
      propscope.property_type,
    );

    return { propscope: propscope, group: groupName };
  }

  private async generateReport(
    lat: number,
    lon: number,
    zoom: number,
    propertyType: string,
    propscope_id: string,
    isochronePolygons?: any,
  ): Promise<any> {
    this.logger.log(
      `Generating report for lat: ${lat}, lon: ${lon}, zoom: ${zoom}, propertyType: ${propertyType}`,
    );

    this.logger.debug(
      `Isochrone Polygons: ${JSON.stringify(isochronePolygons)}`,
    );

    const manifestCollection = this.configService.get<string>(
      'mongoDB.propScopeManifestCollectionName',
    ) as string;

    const mongoPropscopeCollection = this.configService.get<string>(
      'mongoDB.propScopeCollectionName',
    ) as string;

    const manifest = await this.propscopeDao.getManifestByPropertyType(
      manifestCollection,
      propertyType,
    );

    if (!manifest) {
      this.logger.error(`No manifest found for property type: ${propertyType}`);
      throw new Error(`Manifest not found for ${propertyType}`);
    }

    for (const group of manifest.groups) {
      try {
        const groupData = await this.getGroupedData(group, lat, lon, zoom);
        if (!groupData) {
          this.logger.error(`No data found for group: ${group.name}`);
          continue;
        }

        if (groupData.name === 'Overview') {
          const point = turf.point([lon, lat]);

          groupData.sub_groups = groupData.sub_groups.map((subGroup) => {
            this.logger.debug(`Filtering subgroup: ${subGroup.name}`);

            return {
              ...subGroup,
              features: (subGroup.features || []).filter((feature) => {
                return feature.geometry?.type === 'Polygon' ||
                  feature.geometry?.type === 'MultiPolygon'
                  ? turf.booleanPointInPolygon(point, feature)
                  : false;
              }),
            };
          });
        }
        // else if (group.isochrone_filtering) {
        //   const isochronePolygon2Km = isochronePolygons[0];
        //   const isochronePolygon5km = isochronePolygons[1];

        //   groupData.sub_groups = groupData.sub_groups.map((subGroup) => {
        //     this.logger.debug(
        //       `Applying isochrone filtering to subgroup: ${subGroup.name}`,
        //     );

        //     return {
        //       ...subGroup,
        //       features_2km: (subGroup.features || []).filter((feature) => {
        //         return feature.geometry?.type === 'Point'
        //           ? turf.booleanPointInPolygon(feature, isochronePolygon2Km)
        //           : false;
        //       }),
        //       features: (subGroup.features || []).filter((feature) => {
        //         return feature.geometry?.type === 'Point'
        //           ? turf.booleanPointInPolygon(feature, isochronePolygon5km)
        //           : false;
        //       }),
        //     };
        //   });
        // }
        else {
          groupData.sub_groups = groupData.sub_groups.map((subGroup) => {
            const bufferDistance = subGroup.custom_buffer ?? 5;

            this.logger.debug(
              `Using buffer: ${bufferDistance} for subgroup: ${subGroup.name}`,
            );

            return {
              ...subGroup,
              features: this.featureClippingHelper.findFeaturesWithinBuffer(
                lat,
                lon,
                bufferDistance,
                subGroup.features,
              ),
            };
          });
        }
        const documentsToInsert = groupData.sub_groups.map((subGroup) => ({
          propscope_id,
          group_name: group.name,
          group_display_name: group.display_name,
          subgroup_name: subGroup.name,
          subgroup_display_name: subGroup.display_name,
          features: subGroup.features,
          features_2km: subGroup?.features_2km || [],
          overview: subGroup?.overview || false, // or true if applicable
        }));

        const metaDocuments = groupData.sub_groups.map((subGroup) => {
          const metaFields = subGroup.metadata_fields || [];
          const metadata = subGroup.features.map((feature: any) => {
            const props = feature.properties || {};
            const metaObj: Record<string, any> = {};

            for (const field of metaFields) {
              if (props[field]) {
                metaObj[field] = props[field];
              }
            }
            return metaObj;
          });

          return {
            propscope_id,
            group_name: group.name,
            subgroup_name: subGroup.display_name,
            metadata,
          };
        });

        try {
          await this.propscopeDao.insertPropscopeFeatures(documentsToInsert);
        } catch (error) {
          this.logger.error(
            `Error inserting features for group ${group.name}: ${error.message}`,
          );
        }

        try {
          await this.propscopeDao.insertPropscopeMetaData(metaDocuments);
        } catch (error) {
          this.logger.error(
            `Error inserting metadata for group ${group.name}: ${error.message}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error processing group ${group.name}: ${error.message}`,
        );
      }
    }

    const response = await this.propscopeDao.updatePropscopeStatus(
      mongoPropscopeCollection,
      propscope_id,
      true,
    );

    this.logger.debug(`Update response : ${JSON.stringify(response)}`);

    return {
      status: 'Data proccessed successfully',
    };
  }

  private async getGroupedData(
    groupManifest: any,
    lat: number,
    lon: number,
    zoom: number,
  ): Promise<any> {
    const mapTilerApiKey = this.configService.get<string>(
      'maptiler.mapTilerApiKey',
    ) as string;

    await Promise.all(
      (groupManifest.sub_groups || []).map(async (subGroup) => {
        const { 'source-layer': sourceLayer, 'tile-source': tileSource } =
          subGroup;

        if (sourceLayer && tileSource) {
          const { minzoom, maxzoom } = await this.tileHelper.getLayerZoom(
            tileSource,
            sourceLayer,
            mapTilerApiKey,
          );
          subGroup.minzoom = minzoom;
          subGroup.maxzoom = maxzoom;
        }
      }),
    );

    await Promise.all(
      (groupManifest.sub_groups || []).map(async (subGroup) => {
        const zoomLevel = Math.min(zoom, subGroup.maxzoom || zoom);
        const bufferRadius = 5;
        const adjacentTiles = this.tileHelper.getTilesInBuffer(
          lat,
          lon,
          bufferRadius,
          zoomLevel,
        );

        const tileId =
          subGroup['tile-source'] === 'maptiler_planet'
            ? 'v3'
            : subGroup['tile-source'];

        const sourceLayer = subGroup['source-layer'];

        const tileData = await this.tileHelper.fetchTileData(
          adjacentTiles,
          tileId,
          sourceLayer,
          zoomLevel,
          mapTilerApiKey,
          subGroup.name,
        );

        // if (groupManifest.name === 'Overview') {
        //   tileData = await this.tileHelper.fetchTileData(
        //     adjacentTiles,
        //     tileId,
        //     sourceLayer,
        //     zoomLevel,
        //     mapTilerApiKey,
        //   );
        // } else {
        //   tileData = await this.tileHelper.fetchTileDataForTile(
        //     adjacentTiles,
        //     tileId,
        //     sourceLayer,
        //     zoomLevel,
        //     mapTilerApiKey,
        //   );
        // }

        subGroup.features = (tileData.features || []).filter((feature) =>
          this.featureClippingHelper.filterFeatures(
            feature,
            subGroup.filter || {},
          ),
        );
      }),
    );

    return groupManifest;
  }

  async updateManifest(propertyType: string): Promise<void> {
    const mongoCollectionName = this.configService.get<string>(
      'mongoDB.propScopeManifestCollectionName',
    ) as string;
    const manifest = await this.propscopeDao.getManifestByPropertyType(
      mongoCollectionName,
      propertyType,
    );

    if (!manifest) {
      throw new Error(`Manifest not found for ${propertyType}`);
    }

    const layers = await this.getLayersFromStyle();
    const layerSourceMap = this.buildLayerSourceMap(layers);

    manifest.groups.forEach((group) => {
      (group.sub_groups || []).forEach((sub) => {
        const sourceLayer = sub['source-layer'];
        if (sourceLayer && layerSourceMap.has(sourceLayer)) {
          sub['tile-source'] = layerSourceMap.get(sourceLayer);
        }
      });
    });

    await this.propscopeDao.updateManifestByPropertyType(
      mongoCollectionName,
      propertyType,
      manifest,
    );
    this.logger.log(`Updated manifest for ${propertyType}`);
  }

  private async getLayersFromStyle(): Promise<any[]> {
    const styleUrl = `https://api.maptiler.com/maps/c27d19c0-a6ac-435a-ac58-ddcc1442509b/style.json?key=${this.configService.get<string>('maptiler.mapTilerApiKey')}`;
    const { data } = await axios.get(styleUrl);
    return data.layers;
  }

  private buildLayerSourceMap(layers: ILayer[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const layer of layers) {
      if (layer['source-layer'] && layer.source) {
        map.set(layer['source-layer'], layer.source);
      }
    }
    return map;
  }

  async getPropertyType(
    longitude: number,
    latitude: number,
  ): Promise<{ allowed: boolean; type: string }> {
    const point = turf.point([longitude, latitude]);

    try {
      const cdpLayers = await this.propertyTypeHelper.getCDPLayer();
      const layerIds = cdpLayers.map(
        (layer) => layer['source-layer'],
      ) as string[];
      const sourceTile = cdpLayers[0]?.['source'];

      const cdpData = await this.propertyTypeHelper.fetchVectorData(
        longitude,
        latitude,
        16,
        layerIds,
        sourceTile,
      );
      const result = this.propertyTypeHelper.processFeatures(
        cdpData?.features,
        point,
        this.propertyTypeHelper.isAllowedCDPType,
      );
      if (result) return result;
    } catch (error) {
      this.logger.log('Error fetching CDP layer data:', error);
    }

    this.logger.warn('No data found for CDP layer.');

    try {
      const landUseData = await this.propertyTypeHelper.fetchVectorData(
        longitude,
        latitude,
        15,
        ['landuse', 'building'],
        'v3',
      );
      const result = this.propertyTypeHelper.processFeatures(
        landUseData?.features,
        point,
        this.propertyTypeHelper.isAllowedLandUseType,
      );
      if (result) return result;
    } catch (error) {
      this.logger.log('Error fetching Land Use data:', error);
    }

    return { allowed: false, type: 'undetermined' };
  }
}
