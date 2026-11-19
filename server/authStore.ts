import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { BiometricCredentialRecord, CreatorUser } from '../src/lib/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.resolve(DATA_DIR, 'users-db.json');
const SECRET_FILE = path.resolve(DATA_DIR, '.session-secret');

interface StoredCreatorUser extends CreatorUser {
  passwordSalt?: string;
  passwordHash?: string;
}

interface UsersDb {
  users: StoredCreatorUser[];
}

interface PendingChallenge {
  challenge: string;
  userId?: string;
  purpose: 'register' | 'login';
  createdAtMs: number;
}

const challengeStore = new Map<string, PendingChallenge>();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPassword(password: string, existingSalt?: string): { salt: string; hash: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password: string, salt?: string, expectedHash?: string): boolean {
  if (!password || !salt || !expectedHash) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

function sanitizeUser(user: StoredCreatorUser): CreatorUser {
  const { passwordHash: _ph, passwordSalt: _ps, ...clean } = user;
  return clean;
}

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, 'utf8');
  return generated;
}

function buildPrimaryOwnerRecord(): StoredCreatorUser {
  const now = new Date().toISOString();
  const initialPassword = process.env.OWNER_LOGIN_PASSWORD || 'Pass@2003';
  const { salt, hash } = hashPassword(initialPassword);
  return {
    id: 'usr-owner-omyavtkar',
    loginId: 'omyavtkar@2003',
    displayName: 'Om Yavtkar',
    email: 'omyavtkar2003@gmail.com',
    authMethod: 'credentials',
    biometricEnabled: false,
    biometricCredentials: [],
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    updatedAt: now,
  };
}

function readUsersDb(): UsersDb {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) {
    const seeded: UsersDb = { users: [buildPrimaryOwnerRecord()] };
    fs.writeFileSync(USERS_FILE, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) as UsersDb;
    let users = Array.isArray(parsed.users) ? parsed.users : [];
    let changed = false;

    // Remove legacy smoke-test placeholder account if present
    const filtered = users.filter((u) => u.displayName !== 'Smoke Test Creator');
    if (filtered.length !== users.length) {
      users = filtered;
      changed = true;
    }

    // Ensure primary owner login ID (omyavtkar@2003) always exists
    const hasPrimary = users.some(
      (u) => u.loginId?.toLowerCase() === 'omyavtkar@2003'
    );
    if (!hasPrimary) {
      users = [buildPrimaryOwnerRecord(), ...users];
      changed = true;
    }

    if (changed) {
      writeUsersDb({ users });
    }
    return { users };
  } catch {
    const seeded: UsersDb = { users: [buildPrimaryOwnerRecord()] };
    fs.writeFileSync(USERS_FILE, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }
}

function writeUsersDb(db: UsersDb): void {
  ensureDataDir();
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_FILE);
}

export function issueSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token?: string | null): CreatorUser | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { uid?: string };
    if (!parsed.uid) return null;
    return findCreatorUserById(parsed.uid) ?? null;
  } catch {
    return null;
  }
}

function findRawUserByIdentifier(identifier: string): StoredCreatorUser | undefined {
  const norm = identifier.trim().toLowerCase();
  if (!norm) return undefined;
  return readUsersDb().users.find(
    (u) =>
      u.id === identifier ||
      u.firebaseUid === identifier ||
      (u.loginId && u.loginId.toLowerCase() === norm) ||
      (u.email && u.email.toLowerCase() === norm) ||
      (u.mobileNumber && u.mobileNumber.replace(/\s+/g, '') === norm.replace(/\s+/g, ''))
  );
}

export function findCreatorUserById(id: string): CreatorUser | undefined {
  const found = readUsersDb().users.find((u) => u.id === id);
  return found ? sanitizeUser(found) : undefined;
}

export function findCreatorUserByIdentifier(identifier: string): CreatorUser | undefined {
  const found = findRawUserByIdentifier(identifier);
  return found ? sanitizeUser(found) : undefined;
}

export function verifyCreatorLogin(identifier: string, password: string): CreatorUser | null {
  const user = findRawUserByIdentifier(identifier);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return null;
  }
  return sanitizeUser(user);
}

export function listAllBiometricCredentialIds(identifier?: string): string[] {
  const db = readUsersDb();
  if (identifier?.trim()) {
    const user = findRawUserByIdentifier(identifier.trim());
    return user ? user.biometricCredentials.map((c) => c.credentialId) : [];
  }
  return db.users.flatMap((u) => u.biometricCredentials.map((c) => c.credentialId));
}

export function upsertCreatorUser(input: {
  displayName: string;
  loginId?: string;
  email?: string;
  mobileNumber?: string;
  password?: string;
  firebaseUid?: string;
  authMethod: 'google' | 'email' | 'mobile_biometric' | 'credentials';
  isNewCreate?: boolean;
}): { user?: CreatorUser; error?: string; statusCode?: number } {
  const db = readUsersDb();
  const now = new Date().toISOString();
  const cleanLoginId = input.loginId?.trim() || undefined;
  const cleanEmail = input.email?.trim() || undefined;
  const cleanMobile = input.mobileNumber?.trim() || undefined;

  const existing = db.users.find(
    (u) =>
      (input.firebaseUid && u.firebaseUid === input.firebaseUid) ||
      (cleanLoginId && u.loginId?.toLowerCase() === cleanLoginId.toLowerCase()) ||
      (cleanEmail && u.email?.toLowerCase() === cleanEmail.toLowerCase()) ||
      (cleanMobile && u.mobileNumber?.replace(/\s+/g, '') === cleanMobile.replace(/\s+/g, ''))
  );

  if (existing && input.isNewCreate) {
    return {
      error: 'An account with this Login ID, Email, or Mobile already exists. Please Sign In instead.',
      statusCode: 409,
    };
  }

  if (existing) {
    let nextSalt = existing.passwordSalt;
    let nextHash = existing.passwordHash;
    if (input.password && input.password.length >= 6) {
      const hashed = hashPassword(input.password);
      nextSalt = hashed.salt;
      nextHash = hashed.hash;
    }
    const updated: StoredCreatorUser = {
      ...existing,
      displayName: input.displayName.trim() || existing.displayName,
      loginId: cleanLoginId ?? existing.loginId,
      email: cleanEmail ?? existing.email,
      mobileNumber: cleanMobile ?? existing.mobileNumber,
      firebaseUid: input.firebaseUid ?? existing.firebaseUid,
      authMethod: input.authMethod,
      passwordSalt: nextSalt,
      passwordHash: nextHash,
      updatedAt: now,
    };
    db.users = db.users.map((u) => (u.id === existing.id ? updated : u));
    writeUsersDb(db);
    return { user: sanitizeUser(updated) };
  }

  let passwordSalt: string | undefined;
  let passwordHash: string | undefined;
  if (input.password && input.password.length >= 4) {
    const hashed = hashPassword(input.password);
    passwordSalt = hashed.salt;
    passwordHash = hashed.hash;
  }

  const created: StoredCreatorUser = {
    id: `usr-${crypto.randomBytes(6).toString('hex')}`,
    loginId: cleanLoginId,
    displayName: input.displayName.trim() || cleanLoginId || 'KathaStudio Creator',
    email: cleanEmail,
    mobileNumber: cleanMobile,
    firebaseUid: input.firebaseUid,
    authMethod: input.authMethod,
    biometricEnabled: false,
    biometricCredentials: [],
    passwordSalt,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  db.users = [created, ...db.users];
  writeUsersDb(db);
  return { user: sanitizeUser(created) };
}

export function attachBiometricCredentialToUser(
  userId: string,
  cred: BiometricCredentialRecord
): CreatorUser | null {
  const db = readUsersDb();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;

  const user = db.users[idx];
  const exists = user.biometricCredentials.some((c) => c.credentialId === cred.credentialId);
  const nextCreds = exists ? user.biometricCredentials : [cred, ...user.biometricCredentials];
  const updated: StoredCreatorUser = {
    ...user,
    biometricEnabled: true,
    biometricCredentials: nextCreds,
    updatedAt: new Date().toISOString(),
  };
  db.users[idx] = updated;
  writeUsersDb(db);
  return sanitizeUser(updated);
}

export function findCreatorUserByCredentialId(credentialId: string): CreatorUser | undefined {
  const found = readUsersDb().users.find((u) =>
    u.biometricCredentials.some((c) => c.credentialId === credentialId)
  );
  return found ? sanitizeUser(found) : undefined;
}

export function createWebAuthnChallenge(
  purpose: 'register' | 'login',
  userId?: string
): { challengeId: string; challenge: string } {
  const now = Date.now();
  for (const [key, item] of challengeStore.entries()) {
    if (now - item.createdAtMs > 5 * 60 * 1000) {
      challengeStore.delete(key);
    }
  }
  const challengeId = crypto.randomBytes(12).toString('base64url');
  const challenge = crypto.randomBytes(32).toString('base64url');
  challengeStore.set(challengeId, {
    challenge,
    userId,
    purpose,
    createdAtMs: now,
  });
  return { challengeId, challenge };
}

export function verifyClientDataChallenge(params: {
  challengeId: string;
  expectedPurpose: 'register' | 'login';
  clientDataJSONB64Url: string;
}): { ok: boolean; userId?: string; error?: string } {
  const entry = challengeStore.get(params.challengeId);
  if (!entry) {
    return { ok: false, error: 'Biometric challenge expired or not found. Please try again.' };
  }
  challengeStore.delete(params.challengeId);

  if (Date.now() - entry.createdAtMs > 5 * 60 * 1000) {
    return { ok: false, error: 'Biometric challenge expired.' };
  }
  if (entry.purpose !== params.expectedPurpose) {
    return { ok: false, error: 'Biometric challenge purpose mismatch.' };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(params.clientDataJSONB64Url, 'base64url').toString('utf8')
    ) as { type?: string; challenge?: string; origin?: string };

    const expectedType =
      params.expectedPurpose === 'register' ? 'webauthn.create' : 'webauthn.get';
    if (parsed.type !== expectedType) {
      return { ok: false, error: 'Invalid WebAuthn ceremony type.' };
    }
    if (parsed.challenge !== entry.challenge) {
      return { ok: false, error: 'WebAuthn challenge verification failed.' };
    }
    return { ok: true, userId: entry.userId };
  } catch {
    return { ok: false, error: 'Malformed WebAuthn clientDataJSON.' };
  }
}
