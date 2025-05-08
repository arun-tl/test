import {
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsString,
    ValidateNested,
  } from 'class-validator';
  import { Type } from 'class-transformer';
  
  export class FeatureDto {
    @IsNotEmpty()
    @IsString()
    type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
  
    @IsNotEmpty()
    coordinates: any; // You can use more strict typing based on the GeoJSON format if needed

    properties?: Record<string, string>;
  }
  
  export class SubgroupDto {
    @IsNotEmpty()
    @IsString()
    name : string;
  
    @IsNotEmpty()
    @IsString()
    display_name: string;
  
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FeatureDto)
    features: FeatureDto[];
  
    @IsBoolean()
    overview: boolean;
  }
  
  export class CreatePropscopeDto {
    @IsNotEmpty()
    @IsString()
    name: string;
  
    @IsNotEmpty()
    @IsString()
    display_name: string;
  
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SubgroupDto)
    sub_groups: SubgroupDto[];
  }
  