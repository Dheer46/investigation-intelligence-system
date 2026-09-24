import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { EnrollBiometricDto } from './dto/enroll-biometric.dto';
import { VerifyGateDto } from './dto/verify-gate.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CurrentUser, CurrentUserPayload } from './current-user.decorator';

// The USB/face/PIN gate: officers are provisioned here (register -> enroll
// face+PIN -> pair a USB), and verified here too (gate/verify). Biometric ML
// inference is delegated to biometric-service (see AuthService), but every
// decision - PIN check, face match, isActive, minting the session - happens
// in this backend so the same gate works from any workstation's browser,
// not just one machine that happens to hold local files.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Account creation is an administrative action, not self-service - anyone
  // able to pick their own role at signup could mint themselves an
  // ADMINISTRATOR account. Only an existing administrator may provision one.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Post('register')
  register(@Body() dto: RegisterDto, @CurrentUser() user: CurrentUserPayload) {
    return this.authService.register(dto, user.userId);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }

  // Registration-portal officer management - administrative, same guard as
  // register().
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Get('users')
  listUsers() {
    return this.authService.listOfficers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Patch('users/:id/active')
  setActive(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.authService.setActive(id, dto.isActive, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.authService.deleteOfficer(id, user.userId);
  }

  // Admin-portal step 2 (face + PIN) and step 3 (USB pairing) - same guard
  // as register(). Biometric data/PINs are set here, never accepted on the
  // register() call itself, so the two steps stay auditable separately.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Post('officers/:id/biometric')
  enrollBiometric(
    @Param('id') id: string,
    @Body() dto: EnrollBiometricDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.authService.enrollBiometric(id, dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Post('officers/:id/usb-token')
  pairUsbToken(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.authService.pairUsbToken(id, user.userId);
  }

  // The gate itself - deliberately unauthenticated (no one is logged in yet,
  // that's the entire point) and reachable from any workstation's browser.
  @Post('gate/verify')
  verifyGate(@Body() dto: VerifyGateDto) {
    return this.authService.verifyGateAuth(dto);
  }
}
