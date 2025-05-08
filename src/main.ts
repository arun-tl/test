import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Register gRPC service 1
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'propscope',
      protoPath: join(__dirname, '../proto/propscope.proto'),
      // url: configService.get<string>('appConfig.serverGrpcUrl'),
      url: '0.0.0.0:50051',
    },
  });

  // Register gRPC service 2
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'propertytype',
      protoPath: join(__dirname, '../proto/propertytype.proto'),
      url: '0.0.0.0:50052',
    },
  });

  await app.startAllMicroservices();
  console.log('Both gRPC services are running.');
}

bootstrap();