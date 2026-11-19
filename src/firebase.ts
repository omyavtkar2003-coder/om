import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export const youtubeGoogleProvider = new GoogleAuthProvider();
YOUTUBE_SCOPES.forEach((scope) => youtubeGoogleProvider.addScope(scope));
youtubeGoogleProvider.setCustomParameters({
  prompt: 'consent select_account',
});

let cachedYouTubeAccessToken: string | null = null;

export function getCachedYouTubeAccessToken(): string | null {
  return cachedYouTubeAccessToken;
}

export function clearCachedYouTubeAccessToken(): void {
  cachedYouTubeAccessToken = null;
}

if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedYouTubeAccessToken = null;
    }
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export async function syncUserProfileToFirestore(
  user: User,
  opts: {
    displayName?: string;
    phoneNumber?: string;
    authMethod: 'google' | 'email' | 'mobile_biometric';
    biometricEnabled?: boolean;
  }
): Promise<void> {
  // Firestore rules enforce email_verified == true for client writes to /users/{uid}
  if (!user.emailVerified) return;

  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/contact`;
  const userRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'contact');

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  const displayName = (opts.displayName || user.displayName || user.email?.split('@')[0] || 'Creator').slice(0, 80);

  if (!existingSnap.exists()) {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        role: 'creator',
        authMethod: opts.authMethod,
        biometricEnabled: Boolean(opts.biometricEnabled),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, userPath);
    }
  } else {
    const prevData = existingSnap.data();
    try {
      await setDoc(
        userRef,
        {
          uid: user.uid,
          displayName,
          role: prevData?.role || 'creator',
          authMethod: opts.authMethod,
          biometricEnabled:
            opts.biometricEnabled !== undefined
              ? opts.biometricEnabled
              : Boolean(prevData?.biometricEnabled),
          createdAt: prevData?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, userPath);
    }
  }

  const privatePayload: Record<string, unknown> = {
    uid: user.uid,
    updatedAt: serverTimestamp(),
  };
  if (user.email) privatePayload.email = user.email.slice(0, 160);
  if (opts.phoneNumber) privatePayload.phoneNumber = opts.phoneNumber.slice(0, 24);

  try {
    await setDoc(privateRef, privatePayload, { merge: false });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }
}

export async function recordBiometricPasskeyInFirestore(params: {
  credentialId: string;
  deviceLabel: string;
  transports: string[];
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const safeId = params.credentialId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `users/${user.uid}/biometricCredentials/${safeId}`;
  try {
    await setDoc(doc(db, 'users', user.uid, 'biometricCredentials', safeId), {
      credentialId: params.credentialId.slice(0, 256),
      ownerId: user.uid,
      deviceLabel: params.deviceLabel.slice(0, 80),
      transports: params.transports.slice(0, 6),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function signInWithGoogleCreator(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await syncUserProfileToFirestore(result.user, { authMethod: 'google' });
  return result.user;
}

export async function registerEmailCreator(params: {
  displayName: string;
  email: string;
  password: string;
  phoneNumber?: string;
}): Promise<{ user: User; verificationSent: boolean }> {
  const cred = await createUserWithEmailAndPassword(auth, params.email, params.password);
  if (params.displayName.trim()) {
    await updateProfile(cred.user, { displayName: params.displayName.trim() });
  }
  let verificationSent = false;
  try {
    await sendEmailVerification(cred.user);
    verificationSent = true;
  } catch {
    verificationSent = false;
  }
  return { user: cred.user, verificationSent };
}

export async function signInWithEmailCreator(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await syncUserProfileToFirestore(cred.user, { authMethod: 'email' });
  return cred.user;
}

export async function connectYouTubeChannelWithGoogle(): Promise<{
  user: User;
  accessToken: string;
  channel: {
    id: string;
    title: string;
    handle: string;
    subscribers: number;
  } | null;
}> {
  const result = await signInWithPopup(auth, youtubeGoogleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Google did not return a YouTube upload access token. Please allow YouTube permissions in the popup.');
  }
  cachedYouTubeAccessToken = credential.accessToken;
  await syncUserProfileToFirestore(result.user, { authMethod: 'google' }).catch(() => {});

  let channel: {
    id: string;
    title: string;
    handle: string;
    subscribers: number;
  } | null = null;

  const infoRes = await fetch('/api/youtube/channel-info', {
    headers: { Authorization: `Bearer ${credential.accessToken}` },
  });
  if (infoRes.ok) {
    const infoData = (await infoRes.json()) as {
      channel?: { id: string; title: string; handle: string; subscribers: number } | null;
    };
    channel = infoData.channel ?? null;
  }

  return { user: result.user, accessToken: credential.accessToken, channel };
}

export async function signOutFirebaseCreator(): Promise<void> {
  cachedYouTubeAccessToken = null;
  await signOut(auth);
}

export { onAuthStateChanged, type User };
