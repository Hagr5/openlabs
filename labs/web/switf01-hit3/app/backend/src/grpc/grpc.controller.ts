import { Controller, UseInterceptors } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { Admin, AdminDocument } from '../admin/schemas/admin.schema';
import { GrpcProtocolInterceptor } from './grpc.interceptor';

// ── Proto message interfaces ──────────────────────────────────────────────────

interface AddAdminRequest {
  name: string;
  role: string;
  email?: string;
}

interface AddAdminResponse {
  success: boolean;
  message: string;
}

interface RemoveAdminRequest {
  name: string;
}

interface RemoveAdminResponse {
  success: boolean;
  message: string;
}

interface AdminEntry {
  name: string;
  role: string;
}

interface AdminList {
  admins: AdminEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Controller()
@UseInterceptors(GrpcProtocolInterceptor)
export class GrpcController {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
  ) { }

  // ── AdminService.AddAdmin ────────────────────────────────────────────────
  // Enforces a hard limit of 5 admins (role: 'admin').
  // Returns RESOURCE_EXHAUSTED if count >= 5.
  // This is what the frontend Add Admin button calls.

  @GrpcMethod('AdminService', 'AddAdmin')
  async addAdmin(data: AddAdminRequest): Promise<AddAdminResponse> {
    const count = await this.adminModel.countDocuments({ role: 'admin' });

    if (count >= 5) {
      throw new RpcException({
        code: status.RESOURCE_EXHAUSTED,
        message: 'Admin limit reached (max 5)',
      });
    }

    const email = data.email || `${data.name}@switf.local`;
    await this.adminModel.create({
      name: data.name,
      role: 'admin',
      email,
    });

    return { success: true, message: 'Admin added successfully' };
  }

  @GrpcMethod('AdminService', 'RemoveAdmin')
  async removeAdmin(data: RemoveAdminRequest): Promise<RemoveAdminResponse> {
    const result = await this.adminModel.deleteOne({ name: data.name, role: 'admin' });
    if (result.deletedCount === 0) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Admin not found',
      });
    }
    return { success: true, message: 'Admin removed successfully' };
  }

  // ── AdminService.ListAdmins ──────────────────────────────────────────────
  // Returns all admins with role: 'admin' (superadmin entry excluded from gRPC list).
  //
  // FLAG LOGIC: when count reaches 6, the 6th admin's name is replaced with the flag.
  // The flag string exists ONLY here — nowhere else in the codebase.

  @GrpcMethod('AdminService', 'ListAdmins')
  async listAdmins(): Promise<AdminList> {
    const adminDocs = await this.adminModel
      .find({ role: 'admin' })
      .lean()
      .exec();

    const admins: AdminEntry[] = adminDocs.map((a) => ({
      name: a.name,
      role: a.role,
    }));

    if (admins.length >= 6) {
      admins[5].name = 'duck{h1t_r3st_gr2ph_7pc_to_h1t_m3}';
    }

    return { admins };
  }

  // ── SuperAdminService.AddUnlimitedAdmin ──────────────────────────────────
  // Hidden service — NOT referenced in frontend code anywhere.
  // Discoverable only via gRPC server reflection.
  //
  // Intentional vulnerability: no admin count check whatsoever.
  // Calling this adds a 6th admin, which triggers the flag in ListAdmins.

  @GrpcMethod('SuperAdminService', 'AddUnlimitedAdmin')
  async addUnlimitedAdmin(data: AddAdminRequest): Promise<AddAdminResponse> {
    const email = data.email || `${data.name}@switf.local`;
    await this.adminModel.create({
      name: data.name,
      role: 'admin',
      email,
    });

    return { success: true, message: 'Admin added successfully' };
  }
}
