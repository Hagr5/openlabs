import { NextRequest, NextResponse } from 'next/server';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { jwtVerify } from 'jose';

// Run in Node.js runtime — required for @grpc/grpc-js
export const runtime = 'nodejs';

const GRPC_URL = process.env.GRPC_URL || 'localhost:50051';
const PROTO_PATH = path.join(process.cwd(), 'proto', 'admin.proto');

let adminServiceClient: any = null;

function getClient() {
  if (adminServiceClient) return adminServiceClient;

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false, // camelCase method names: addAdmin, listAdmins
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const proto = grpc.loadPackageDefinition(packageDefinition) as any;

  // Only AdminService is instantiated here.
  // SuperAdminService is intentionally never referenced in any frontend code.
  adminServiceClient = new proto.admin.AdminService(
    GRPC_URL,
    grpc.credentials.createInsecure(),
  );

  return adminServiceClient;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { method, data } = await request.json();

    // Allowlist of methods the frontend UI is permitted to call.
    // SuperAdminService methods are intentionally excluded from this list.
    const ALLOWED_METHODS = ['addAdmin', 'listAdmins', 'removeAdmin'];
    if (!ALLOWED_METHODS.includes(method)) {
      return NextResponse.json({ error: 'Method not allowed' }, { status: 403 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.role !== 'superadmin') {
        return NextResponse.json({ error: 'Forbidden: Requires superadmin role' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const metadata = new grpc.Metadata();
    metadata.add('authorization', authHeader);

    const client = getClient();

    const result = await new Promise<any>((resolve, reject) => {
      client[method](data || {}, metadata, (error: grpc.ServiceError, response: any) => {
        if (error) reject(error);
        else resolve(response);
      });
    });

    return NextResponse.json(result);
  } catch (error: any) {
    // Pass gRPC error codes back so the UI can display meaningful messages.
    // Code 8 = RESOURCE_EXHAUSTED (admin limit reached)
    return NextResponse.json(
      {
        error: error.details || error.message || 'gRPC call failed',
        code: error.code,
      },
      { status: 400 },
    );
  }
}
