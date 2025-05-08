import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PropScope,
  PropScopeSchema,
  PropScopeFeature,
  PropScopeFeatureSchema,
  PropScopeMeta,
  PropScopeMetaSchema,
} from 'src/schema/propscope.schema';
import { PropscopeService } from './propscope.service';
import { PropscopeController } from './propscope.controller';
import { PropscopeDao } from 'src/core/dao/propscope.dao';
import { FeatureClippingHelper } from 'src/core/helpers/featureClipping.helper';
import { TileHelper } from 'src/core/helpers/tile.helper';
import { PropertyTypeHelper } from 'src/core/helpers/propertyType.helper';
@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: PropScope.name, schema: PropScopeSchema },
        { name: PropScopeFeature.name, schema: PropScopeFeatureSchema },
        { name: PropScopeMeta.name, schema: PropScopeMetaSchema },
      ],
      'propScopeConnectionDb',
    ),
  ],
  controllers: [PropscopeController],
  providers: [
    PropscopeService,
    PropscopeDao,
    FeatureClippingHelper,
    TileHelper,
    PropertyTypeHelper,
  ],
})
export class PropScopeModule {}
