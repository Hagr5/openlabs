import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { TokenDto } from './dto/token.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Standard login — username + password → JWT.
   * Used by the frontend UI for all three role tiers.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }


  /**
   * Token exchange — authorizationCode → signed JWT.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(@Body() dto: TokenDto) {
    return this.authService.exchangeToken(dto);
  }
}
