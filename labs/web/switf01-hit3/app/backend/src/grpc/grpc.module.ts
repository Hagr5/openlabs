import { Module } from '@nestjs/common';
import { GrpcController } from './grpc.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  // Re-use AdminModule which already registers the Admin Mongoose model
  // and exports MongooseModule — no duplicate schema registration needed.
  imports: [AdminModule],
  controllers: [GrpcController],
})
export class GrpcModule {}
