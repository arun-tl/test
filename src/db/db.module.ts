// db/db.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ManifestDBConnectionProvider , PropscopeDBConnectionProvider } from './connection.provider';


@Module({
  imports: [
    ConfigModule, // assumes ConfigModule is global
    ManifestDBConnectionProvider,
    PropscopeDBConnectionProvider
  ],
  exports: [ManifestDBConnectionProvider , PropscopeDBConnectionProvider],
})
export class DbModule {}