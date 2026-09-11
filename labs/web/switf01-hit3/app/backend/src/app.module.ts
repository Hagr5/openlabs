import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { SeedModule } from './seed/seed.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { AdminModule } from './admin/admin.module';
import { GrpcModule } from './grpc/grpc.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ProtocolGuardMiddleware } from './common/middleware/protocol-guard.middleware';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/SwiTF01-hit3',
    ),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Generate schema in memory — no file written to disk
      autoSchemaFile: true,
      // Introspection MUST remain enabled — challenge requires it
      introspection: true,
      // Pass HTTP request into GQL context so JWT guard can read Authorization header
      context: ({ req }: { req: Request }) => ({ req }),
      // Disable batching (prevents batch-based enumeration shortcuts per challenge design)
      allowBatchedHttpRequests: false,
      formatError: (error) => ({
        message: error.message,
        extensions: { code: error.extensions?.code }
      })
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    UsersModule,
    SeedModule,
    AuthModule,
    ProjectsModule,
    TasksModule,
    AdminModule,
    GrpcModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ProtocolGuardMiddleware).forRoutes('*');
  }
}
