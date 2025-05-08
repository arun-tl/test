// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { CoreModule } from './core/core.module';
import { PropScopeModule } from './propscope/propscope.module';
import configuration from './core/config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
    }), // <-- important
    DbModule,
    CoreModule,
    PropScopeModule,
  ],
})
export class AppModule {}
