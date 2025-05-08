// db/connection.provider.ts
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

export const ManifestDBConnectionProvider = MongooseModule.forRootAsync({
  inject: [ConfigService],
  connectionName: 'manifestConnectionDb',
  useFactory: (configService: ConfigService) => {
    const uri = `${configService.get<string>('mongoDB.mongodbUri')}/${configService.get<string>('mongoDB.manifestDBName')}`;
    if (!uri) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    return {
      uri,
    };
  },
});

export const PropscopeDBConnectionProvider = MongooseModule.forRootAsync({
  inject: [ConfigService],
  connectionName: 'propScopeConnectionDb',
  useFactory: (configService: ConfigService) => {
    const uri = `${configService.get<string>('mongoDB.mongodbUri')}/${configService.get<string>('mongoDB.propscopeDbName')}`;
    if (!uri) throw new Error('Second MongoDB URI is not defined');
    return {
      uri,
    };
  },
});
