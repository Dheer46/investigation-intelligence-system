import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-internal-key'];
    const expectedKey = this.config.get<string>('INTERNAL_SERVICE_KEY', 'change-me-in-production');
    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing internal service key');
    }
    return true;
  }
}
