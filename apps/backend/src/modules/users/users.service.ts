import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthResponse, UserProfile } from '@cmnews/shared';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { sha256 } from '../../common/text';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { hashPassword, verifyPassword } from './password';

export interface AuthenticatedUser extends UserProfile {
  sessionId: string;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  password_hash: string;
  disabled: boolean;
}

// Verifying against a dummy hash keeps login timing similar for unknown emails.
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

function profile(u: Pick<UserRow, 'id' | 'email' | 'display_name' | 'role'>): UserProfile {
  return { id: String(u.id), email: u.email, displayName: u.display_name, role: u.role };
}

/**
 * Optional accounts, only needed to sync bookmarks across devices. Sessions are opaque random
 * tokens; only their SHA-256 hash is stored, so a database leak does not leak live sessions.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DatabaseService,
  ) {}

  async register(email: string, password: string, displayName: string | null, userAgent: string | null): Promise<AuthResponse> {
    const passwordHash = await hashPassword(password);
    const rows = await this.db.query<UserRow>(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (lower(email)) DO NOTHING
       RETURNING id, email, display_name, role, password_hash, disabled`,
      [email.trim(), passwordHash, displayName],
    );
    if (rows.length === 0) throw new ConflictException({ code: 'email_taken', message: 'An account with this email already exists' });
    return this.createSession(rows[0], userAgent);
  }

  async login(email: string, password: string, userAgent: string | null): Promise<AuthResponse> {
    const user = await this.db.one<UserRow>(
      'SELECT id, email, display_name, role, password_hash, disabled FROM users WHERE lower(email) = lower($1)',
      [email.trim()],
    );
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || user.disabled) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Invalid email or password' });
    }
    return this.createSession(user, userAgent);
  }

  private async createSession(user: UserRow, userAgent: string | null): Promise<AuthResponse> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.SESSION_TTL_DAYS * 24 * 3600 * 1000);
    await this.db.query('INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES ($1, $2, $3, $4)', [
      user.id,
      sha256(token),
      userAgent?.slice(0, 300) ?? null,
      expiresAt.toISOString(),
    ]);
    return { token, expiresAt: expiresAt.toISOString(), user: profile(user) };
  }

  async authenticate(token: string): Promise<AuthenticatedUser | null> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const row = await this.db.one<UserRow & { session_id: string; last_used_at: Date }>(
      `SELECT u.id, u.email, u.display_name, u.role, u.disabled, s.id AS session_id, s.last_used_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    if (!row || row.disabled) return null;
    if (Date.now() - new Date(row.last_used_at).getTime() > 10 * 60 * 1000) {
      await this.db.query('UPDATE sessions SET last_used_at = now() WHERE id = $1', [row.session_id]).catch(() => undefined);
    }
    return { ...profile(row), sessionId: String(row.session_id) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  /** CLI helper: creates or promotes an administrator account. */
  async upsertAdmin(email: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.db.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin', disabled = false, updated_at = now()`,
      [email.trim(), passwordHash],
    );
  }
}
