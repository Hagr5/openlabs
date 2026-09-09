import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import { TokenDto } from './dto/token.dto';

interface AuthCodeEntry {
  userId: string;
  role: string;
  codeChallenge: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  // In-memory authorization code store with TTL — no extra DB collection needed
  private readonly authCodes = new Map<string, AuthCodeEntry>();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {
    // Purge expired codes every 5 minutes
    setInterval(() => this.purgeExpiredCodes(), 5 * 60 * 1000);
  }

  // ── Standard login (username + password) ──────────────────────────────────

  async login(dto: LoginDto): Promise<{ authorizationCode: string; email: string }> {
    const user = await this.userModel
      .findOne({ username: dto.username })
      .exec();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const code = crypto.randomBytes(24).toString('base64');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

    this.authCodes.set(code, {
      userId: user._id.toString(),
      role: user.role,
      codeChallenge: dto.codeChallenge,
      expiresAt,
    });

    return { authorizationCode: code, email: user.email };
  }



  // ── Token exchange ─────────────────────────────────────────────────────────

  async exchangeToken(dto: TokenDto): Promise<{ access_token: string; token_type: string; role: string }> {
    const entry = this.authCodes.get(dto.authorizationCode);

    if (!entry) {
      throw new UnauthorizedException('Invalid or expired authorization code');
    }

    if (entry.expiresAt < new Date()) {
      this.authCodes.delete(dto.authorizationCode);
      throw new UnauthorizedException('Authorization code expired');
    }

    const hashedVerifier = Buffer.from(dto.codeVerifier || '').toString('base64');
    if (hashedVerifier !== entry.codeChallenge) {
      throw new UnauthorizedException('Invalid PKCE code verifier');
    }

    this.authCodes.delete(dto.authorizationCode); // codes are single-use

    // VULNERABILITY: Parameter Tampering (IDOR)
    // The server verified the PKCE challenge successfully.
    // However, instead of using the user associated with the authorization code (entry.userId),
    // it issues a JWT for the email provided by the client in the request!
    const targetUser = await this.userModel.findOne({ email: dto.email }).exec();
    
    if (!targetUser) {
      throw new UnauthorizedException('Invalid target user');
    }

    const token = this.jwtService.sign(
      {
        sub: targetUser._id.toString(),
        email: targetUser.email,
        role: targetUser.role,
        username: targetUser.username,
      },
      { expiresIn: '2h' },
    );

    return { access_token: token, token_type: 'Bearer', role: targetUser.role };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private signToken(user: UserDocument): string {
    return this.jwtService.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        username: user.username,
      },
      { expiresIn: '2h' },
    );
  }

  private purgeExpiredCodes(): void {
    const now = new Date();
    for (const [code, entry] of this.authCodes.entries()) {
      if (entry.expiresAt < now) {
        this.authCodes.delete(code);
      }
    }
  }
}
