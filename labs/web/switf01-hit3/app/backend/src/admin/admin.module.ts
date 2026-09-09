import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminResolver } from './admin.resolver';
import { Admin, AdminSchema } from './schemas/admin.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
  ],
  providers: [AdminResolver],
  exports: [MongooseModule], // exported so gRPC module can inject AdminModel
})
export class AdminModule {}
