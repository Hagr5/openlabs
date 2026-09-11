import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class ProtocolGuardMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.role) {
        if (req.originalUrl.includes('/graphql') && decoded.role === 'user') {
          return res.status(403).json({
            statusCode: 403,
            message: 'Forbidden resource',
            error: 'Forbidden'
          });
        }
      }
    } catch (e) {
      // Allow JwtAuthGuard to handle invalid tokens
    }

    next();
  }
}
