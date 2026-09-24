import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EnrollBiometricDto } from './dto/enroll-biometric.dto';
import { VerifyGateDto } from './dto/verify-gate.dto';
import { cosineSimilarity, decryptEmbedding, encryptEmbedding } from './biometric-crypto';

// Mirrors the thresholds the original local-only face-detection project used
// (face detection/config.py) - same models, same math, just centrally hosted
// now (biometric-service) instead of a per-machine Windows process.
const LIVENESS_THRESHOLD = 0.65;
const FACE_MATCH_THRESHOLD = 0.55;
const MIN_GOOD_FRAMES_ENROLL = 8;
const MIN_GOOD_FRAMES_VERIFY = 4;

interface ExtractedFrame {
  ok: boolean;
  embedding?: number[];
  liveness?: number;
  reason?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  private biometricServiceUrl(): string {
    return this.config.get<string>('BIOMETRIC_SERVICE_URL', 'http://biometric-service:8500');
  }

  private embeddingSecret(): string {
    return this.config.get<string>('BIOMETRIC_ENCRYPTION_KEY', 'dev-only-change-me-32-bytes-min!');
  }

  // The gate also hands this token off to a separate app at GATE_HANDOFF_URL
  // (see GatePage.tsx), which has its own, unrelated users table with plain
  // integer ids - `sub` (this app's own uuid) means nothing there. This adds
  // a second `userId` claim carrying an id that DOES exist in that other
  // app's database, so one token satisfies both. Only makes sense while
  // that other app has exactly one real account (its seeded admin, id 1);
  // revisit if it grows real per-officer accounts of its own.
  private gateHandoffUserId(): number {
    return this.config.get<number>('GATE_HANDOFF_USER_ID', 1);
  }

  private async extractFrames(images: string[]): Promise<ExtractedFrame[]> {
    const res = await fetch(`${this.biometricServiceUrl()}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });
    if (!res.ok) {
      throw new Error(`biometric-service /extract failed: ${res.status}`);
    }
    const data = (await res.json()) as { results: ExtractedFrame[] };
    return data.results;
  }

  async register(dto: RegisterDto, createdById: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        badgeNumber: dto.badgeNumber,
      },
    });
    await this.auditLog.log({
      actorId: createdById,
      action: 'USER_REGISTERED',
      targetType: 'User',
      targetId: user.id,
      result: 'SUCCESS',
      provenance: { email: user.email, role: user.role },
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      await this.auditLog.log({
        actorId: user?.id,
        action: 'LOGIN_FAILED',
        targetType: 'User',
        targetId: user?.id ?? 'unknown',
        result: 'FAILURE',
        provenance: { email: dto.email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      await this.auditLog.log({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        targetType: 'User',
        targetId: user.id,
        result: 'FAILURE',
        provenance: { email: dto.email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.auditLog.log({
      actorId: user.id,
      action: 'LOGIN_SUCCESS',
      targetType: 'User',
      targetId: user.id,
      result: 'SUCCESS',
    });
    return this.buildAuthResponse(user);
  }

  // Registration-portal officer list - enough to show who exists and whether
  // they're enabled, without leaking passwordHash/pinHash.
  async listOfficers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        badgeNumber: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Disabling flips isActive, checked by both the normal /auth/login path
  // and the face-gate's resolve_officer() lookup - a disabled account is
  // locked out of both, not just one.
  async setActive(userId: string, isActive: boolean, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('No such user');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });
    await this.auditLog.log({
      actorId,
      action: isActive ? 'USER_ENABLED' : 'USER_DISABLED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      provenance: { email: user.email },
    });
    return { id: updated.id, isActive: updated.isActive };
  }

  // Hard delete - only reachable for accounts with no history at all. Any
  // user who ever logged in, created a case, uploaded a document, etc. has
  // rows referencing them (AuditLog.actorId, Case.createdById, ...) and the
  // database's own foreign-key constraints (no onDelete: Cascade anywhere
  // on User) reject the delete rather than silently orphaning or wiping
  // evidence/audit history - this is an investigation system, that history
  // must not disappear. That case should use setActive(false) instead.
  async deleteOfficer(userId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('No such user');
    }
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictException(
          'This account has associated records (cases, documents, audit history, ' +
            'a biometric template, or a USB token) and cannot be deleted. Disable it instead.',
        );
      }
      throw err;
    }
    await this.auditLog.log({
      actorId,
      action: 'USER_DELETED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      provenance: { email: user.email },
    });
    return { id: userId, deleted: true };
  }

  // Admin-portal step 2: capture face + PIN for an already-created account.
  // Frames go to biometric-service for ML extraction only; this method owns
  // every decision (how many good frames are enough, how to combine them,
  // how they're stored) - same separation of concerns as ai-service calls
  // elsewhere in this backend.
  async enrollBiometric(userId: string, dto: EnrollBiometricDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('No such user');
    }

    const frames = await this.extractFrames(dto.images);
    const good = frames.filter(
      (f) => f.ok && f.embedding && (f.liveness ?? 0) >= LIVENESS_THRESHOLD,
    );
    if (good.length < MIN_GOOD_FRAMES_ENROLL) {
      throw new BadRequestException(
        `Only ${good.length} usable frames (need at least ${MIN_GOOD_FRAMES_ENROLL}) - ` +
          `try again with better lighting, one face, no photo/screen.`,
      );
    }

    const dim = good[0].embedding!.length;
    const centroid = new Array(dim).fill(0);
    for (const frame of good) {
      for (let i = 0; i < dim; i++) centroid[i] += frame.embedding![i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= good.length;
    const norm = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
    const normalized = norm === 0 ? centroid : centroid.map((v) => v / norm);

    const embeddingEncrypted = encryptEmbedding(normalized, this.embeddingSecret());
    await this.prisma.biometricTemplate.upsert({
      where: { userId },
      create: { userId, embeddingEncrypted },
      update: { embeddingEncrypted },
    });

    const pinHash = await bcrypt.hash(dto.pin, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash } });

    await this.auditLog.log({
      actorId,
      action: 'BIOMETRIC_ENROLLED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      provenance: { email: user.email, framesUsed: good.length },
    });

    return { ok: true, framesUsed: good.length };
  }

  // Generates a fresh opaque token id server-side (never client-supplied) -
  // the admin portal writes it onto the officer's USB afterward. Any prior
  // ACTIVE token for this user is revoked first: "only one ACTIVE token per
  // user at a time" is enforced here, per the schema's own comment, since a
  // lost/reissued USB shouldn't leave two tokens both able to authenticate.
  async pairUsbToken(userId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('No such user');
    }

    await this.prisma.usbToken.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    const tokenId = `GOV-${randomBytes(12).toString('hex').toUpperCase()}`;
    await this.prisma.usbToken.create({ data: { tokenId, userId, status: 'ACTIVE' } });

    await this.auditLog.log({
      actorId,
      action: 'USB_TOKEN_PAIRED',
      targetType: 'User',
      targetId: userId,
      result: 'SUCCESS',
      provenance: { email: user.email },
    });

    return { tokenId };
  }

  // The gate's central verification call - unauthenticated by nature (the
  // whole point is that no one is logged in yet), reachable from any
  // workstation's browser. Checks USB token -> PIN -> face, in that order,
  // against the SPECIFIC officer the token names - never a search across
  // every enrolled officer.
  async verifyGateAuth(dto: VerifyGateDto) {
    const usbToken = await this.prisma.usbToken.findUnique({
      where: { tokenId: dto.tokenId },
      include: { user: { include: { biometricTemplate: true } } },
    });
    if (!usbToken || usbToken.status !== 'ACTIVE') {
      return { ok: false, reason: 'Unknown or revoked USB token' };
    }

    const user = usbToken.user;
    if (!user.isActive) {
      return { ok: false, reason: 'Account disabled' };
    }
    if (!user.pinHash) {
      return { ok: false, reason: 'No PIN enrolled for this officer' };
    }
    const pinOk = await bcrypt.compare(dto.pin, user.pinHash);
    if (!pinOk) {
      await this.auditLog.log({
        actorId: user.id,
        action: 'GATE_LOGIN_FAILED',
        targetType: 'User',
        targetId: user.id,
        result: 'FAILURE',
        provenance: { reason: 'invalid_pin' },
      });
      return { ok: false, reason: 'Invalid PIN' };
    }
    if (!user.biometricTemplate) {
      return { ok: false, reason: 'No enrolled face for this officer' };
    }

    const frames = await this.extractFrames(dto.images);
    const good = frames.filter(
      (f) => f.ok && f.embedding && (f.liveness ?? 0) >= LIVENESS_THRESHOLD,
    );
    if (good.length < MIN_GOOD_FRAMES_VERIFY) {
      return {
        ok: false,
        reason: 'Face/liveness requirements not met',
        passedFrames: good.length,
      };
    }

    const storedEmbedding = decryptEmbedding(user.biometricTemplate.embeddingEncrypted, this.embeddingSecret());
    const similarities = good.map((f) => cosineSimilarity(f.embedding!, storedEmbedding));
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const avgLiveness = good.reduce((a, f) => a + (f.liveness ?? 0), 0) / good.length;

    if (avgSimilarity < FACE_MATCH_THRESHOLD) {
      await this.auditLog.log({
        actorId: user.id,
        action: 'GATE_LOGIN_FAILED',
        targetType: 'User',
        targetId: user.id,
        result: 'FAILURE',
        provenance: { reason: 'face_mismatch', similarity: avgSimilarity },
      });
      return { ok: false, reason: 'Face does not match', similarity: avgSimilarity };
    }

    await this.auditLog.log({
      actorId: user.id,
      action: 'GATE_LOGIN_SUCCESS',
      targetType: 'User',
      targetId: user.id,
      result: 'SUCCESS',
      provenance: { tokenId: dto.tokenId, similarity: avgSimilarity, liveness: avgLiveness },
    });

    return {
      ok: true,
      similarity: avgSimilarity,
      liveness: avgLiveness,
      ...this.buildAuthResponse(user, { userId: this.gateHandoffUserId() }),
    };
  }

  private buildAuthResponse(
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
    },
    extraClaims: Record<string, unknown> = {},
  ) {
    const payload = { sub: user.id, email: user.email, role: user.role, ...extraClaims };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
