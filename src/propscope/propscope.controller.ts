import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PropscopeService } from './propscope.service';

interface IPropscopeRequest {
  latitude: number;
  longitude: number;
  zoom: number;
  propertyType: string;
  isochronePolygons: string[]; // serialized GeoJSON
  propscopeId: string;
}

interface IPropscopeResponse {
  status: string;
  message: string;
  propscopeId: string | null;
  propscopeGroupName: string[] | null;
  propscopeStatus: boolean;
}

interface IPropertyTypeResponse {
  allowed: boolean;
  type: string;
}

@Controller()
export class PropscopeController {
  private readonly logger = new Logger(PropscopeController.name);

  constructor(private readonly propscopeService: PropscopeService) {}

  @GrpcMethod('PropscopeService', 'ProcessProperty')
  async processProperty(data: IPropscopeRequest): Promise<IPropscopeResponse> {
    this.logger.log(`Received gRPC request: ${JSON.stringify(data)}`);
    const {
      latitude,
      longitude,
      zoom,
      propertyType,
      isochronePolygons,
      propscopeId,
    } = data;

    // Deserialize the list of serialized GeoJSON strings into actual objects
    const parsedIsochronePolygons = isochronePolygons?.map((item, idx) => {
      try {
        return JSON.parse(item);
      } catch (e) {
        throw new Error(
          `Failed to parse isochrone_polygons[${idx}]: Invalid GeoJSON string`,
        );
      }
    });

    this.logger.log(
      `Received GenerateReport gRPC call with data: ${JSON.stringify(data)}`,
    );

    try {
      if (!propscopeId) {
        const createPropscopeResponse =
          await this.propscopeService.createPropscope(
            latitude,
            longitude,
            zoom,
            propertyType,
            parsedIsochronePolygons,
          );

        this.logger.log(
          `Successfully generated report for propscope id : ${createPropscopeResponse.propscope_id}`,
        );

        const response = {
          status: 'success',
          message: 'Processed successfully',
          propscopeId: createPropscopeResponse.propscope_id,
          propscopeGroupName: createPropscopeResponse.propscope_group_name,
          latitude: latitude,
          longitude: longitude,
          propscopeStatus: false,
        };

        this.logger.debug(`Response to GRPC : ${JSON.stringify(response)}`);

        return response;
      } else {
        const { propscope, group } =
          await this.propscopeService.getPropscopeStatus(propscopeId);

        const response = {
          status: 'success',
          message: 'Processed successfully',
          propscopeId: propscope.propscope_id,
          propscopeGroupName: group,
          latitude: propscope.location.coordinates[0],
          longitude: propscope.location.coordinates[1],
          propscopeStatus: propscope.propscope_instance_status,
        };
        this.logger.debug(`Response to GRPC : ${response}`);
        return response;
      }
    } catch (error) {
      this.logger.error(
        `Error generating report: ${error.message}`,
        error.stack,
      );
      return {
        status: 'failed',
        message: 'Error while generating the propscope',
        propscopeId: null,
        propscopeGroupName: null,
        propscopeStatus: false,
      }; // Or you could throw a gRPC exception if needed
    }
  }

  @GrpcMethod('PropertyTypeService', 'GetPropertyType')
  async getPropertyType(data: {
    latitude: number;
    longitude: number;
  }): Promise<IPropertyTypeResponse> {
    const { latitude, longitude } = data;

    this.logger.log(`Received coordinates: ${latitude}, ${longitude}`);

    const propertySpec: IPropertyTypeResponse =
      await this.propscopeService.getPropertyType(longitude, latitude);

    return propertySpec;
  }
}
