// core.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Global() // <-- makes it available app-wide
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      envFilePath: '.env', 
    }),
  ],
  exports: [ConfigModule],
})
export class CoreModule {}