import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ReflectionService } from '@grpc/reflection';
import { join } from 'path';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
async function bootstrap() {
  // ── HTTP Application (REST + GraphQL) ─────────────────────────────────────
  const app = await NestFactory.create(AppModule);

  // Disable Express ETag generation — prevents 304 Not Modified on API responses
  app.getHttpAdapter().getInstance().disable('etag');


  app.setGlobalPrefix('api/v1', {
    // Exclude GraphQL endpoint from the REST prefix
    exclude: ['/graphql'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true });

  // Disable HTTP response caching globally — prevents 304 Not Modified on API endpoints.
  // Without this, Express sets ETag headers and browsers/fetch clients cache responses,
  // causing task list refreshes to silently return stale data.
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });


  // ── gRPC Microservice (port 50051) ──
  // ───────────────────────────────────────
  // Connected as a hybrid application so both HTTP and gRPC share AppModule context.
  // onLoadPackageDefinition registers gRPC server reflection, which is required
  // for `grpcurl list` to enumerate all services including SuperAdminService.
  const grpcApp = app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      url: '0.0.0.0:50051',
      package: 'admin',
      protoPath: join(__dirname, 'proto', 'admin.proto'),
      onLoadPackageDefinition: (pkg, server) => {
        // Register reflection — makes SuperAdminService discoverable via grpcurl
        new ReflectionService(pkg).addToServer(server);
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(4000);

  console.log('SwiTF01-hit3 backend: HTTP on :4000, gRPC on :50051');
}

bootstrap();

