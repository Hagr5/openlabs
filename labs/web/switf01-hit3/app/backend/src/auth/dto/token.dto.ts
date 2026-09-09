import { IsString, IsNotEmpty } from 'class-validator';

export class TokenDto {
  @IsString()
  @IsNotEmpty()
  authorizationCode: string;

  @IsString()
  @IsNotEmpty()
  grantType: string;

  @IsString()
  @IsNotEmpty()
  codeVerifier: string;

  @IsString()
  @IsNotEmpty()
  email: string;
}
