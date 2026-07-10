import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PasscodeService } from './passcode.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret-change-in-prod',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasscodeService],
  // Export JwtModule so CurrentActorMiddleware (declared in AppModule) can inject JwtService.
  // Export PasscodeService so the globally-registered PasscodeGuard can inject it.
  exports: [JwtModule, AuthService, PasscodeService],
})
export class AuthModule {}
