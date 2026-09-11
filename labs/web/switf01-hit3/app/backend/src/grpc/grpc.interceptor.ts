import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class GrpcProtocolInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() === 'rpc') {
      const metadata = context.switchToRpc().getContext();
      const authorization = metadata.get('authorization');
      
      let token = '';
      if (authorization && authorization.length > 0) {
        const authHeader = authorization[0] as string;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.split(' ')[1];
        } else {
          token = authHeader;
        }
      }

      if (token) {
        try {
          const decoded = jwt.decode(token) as any;
          if (decoded && decoded.role !== 'superadmin') {
            throw new RpcException({
              code: status.PERMISSION_DENIED,
              message: 'Forbidden: Requires superadmin role',
            });
          }
        } catch (e) {
          if (e instanceof RpcException) {
            throw e;
          }
          // Allow valid or unparsable tokens to pass to guards if no specific role logic here
        }
      } else {
        // Unauthenticated access may be handled by Guards, but for this specific 
        // requirement, if they have no token at all, maybe we let them through so the guard handles it?
        // Actually, if role != superadmin -> 403. So no token implies not superadmin.
        throw new RpcException({
          code: status.PERMISSION_DENIED,
          message: 'Forbidden: Requires superadmin role',
        });
      }
    }

    return next.handle();
  }
}
