import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// === Types ===

export type PropScopeDocument = PropScope & Document;
export type PropScopeFeatureDocument = PropScopeFeature & Document;
export type PropScopeMetaDocument = PropScopeMeta & Document;

// === GeoJSON Types ===

@Schema({ _id: false })
export class Geometry {
  @Prop({
    required: true,
    enum: [
      'Point',
      'Polygon',
      'MultiPolygon',
      'LineString',
      'MultiLineString',
      'MultiPoint',
    ],
  })
  type: string;

  @Prop({ required: true, type: MongooseSchema.Types.Mixed })
  coordinates: any;
}

@Schema({ _id: false })
export class Point {
  @Prop({ required: true, enum: ['Point'] })
  type: string;

  @Prop({ required: true, type: [Number] }) // Ensures fixed [lng, lat] type
  coordinates: number[];
}

@Schema({ _id: false })
export class FeatureCollection {
  @Prop({ required: true, enum: ['Feature'] })
  type: string;

  @Prop({ required: true, type: Geometry })
  geometry: Geometry;

  @Prop({ type: MongooseSchema.Types.Mixed })
  properties?: Record<string, any>;
}

// === Main Schema Definitions ===

@Schema({ timestamps: true, collection: 'propscopes' })
export class PropScope {
  @Prop({ required: true })
  propscope_id: string;

  @Prop({ required: true })
  property_type: string;

  @Prop({
    required: true,
    type: Point,
    default: {
      type: 'Point',
      coordinates: [0, 0], // Default coordinates (longitude, latitude)
    },
  })
  location: Point;

  @Prop({ default: false })
  propscope_instance_status: boolean;
}

@Schema({ timestamps: true, collection: 'propscope_spatial_features' })
export class PropScopeFeature {
  @Prop({ required: true })
  propscope_id: string;

  @Prop({ required: true })
  group_name: string;

  @Prop({ required: true })
  group_display_name : string;

  @Prop({ required: true })
  subgroup_name: string;

  @Prop({ required: true })
  subgroup_display_name : string;

  @Prop({ required: false, type: [FeatureCollection] })
  features?: FeatureCollection[];

  @Prop({ required: false , type: [FeatureCollection] })
  features_2km? : FeatureCollection[];

  @Prop()
  overview?: boolean;
}

@Schema({ timestamps: true, collection: 'propscope_meta' })
export class PropScopeMeta {
  @Prop({ required: true })
  propscope_id: string;

  @Prop({ required: true })
  group_name: string;

  @Prop({ required: true })
  subgroup_name: string;

  @Prop({ type: [MongooseSchema.Types.Mixed] })
  metadata?: Record<string, any>[];
}

// === Schema Factories ===

export const GeometrySchema = SchemaFactory.createForClass(Geometry);
export const PointSchema = SchemaFactory.createForClass(Point);
export const FeatureCollectionSchema =
  SchemaFactory.createForClass(FeatureCollection);
FeatureCollectionSchema.index({ geometry: '2dsphere' });

export const PropScopeSchema = SchemaFactory.createForClass(PropScope);
PropScopeSchema.index({ propscope_id: 1, property_type: 1 }, { unique: true });
PropScopeSchema.index({ location: '2dsphere' });

export const PropScopeFeatureSchema =
  SchemaFactory.createForClass(PropScopeFeature);
PropScopeFeatureSchema.index(
  { propscope_id: 1, group_name: 1, subgroup_name: 1 },
  { unique: true },
);

export const PropScopeMetaSchema = SchemaFactory.createForClass(PropScopeMeta);
PropScopeMetaSchema.index(
  { propscope_id: 1, group_name: 1, subgroup_name: 1 },
  { unique: true },
);
