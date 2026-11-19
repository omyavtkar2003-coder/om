function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function detectPlatformBiometricCapability(): Promise<{
  supported: boolean;
  platformAvailable: boolean;
  reason?: string;
}> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
    return {
      supported: false,
      platformAvailable: false,
      reason: 'WebAuthn biometric API is not supported in this browser.',
    };
  }
  if (!window.isSecureContext) {
    return {
      supported: false,
      platformAvailable: false,
      reason: 'Mobile biometric authentication requires HTTPS or localhost.',
    };
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return {
      supported: true,
      platformAvailable: available,
      reason: available
        ? undefined
        : 'No built-in device Fingerprint/Face ID authenticator detected on this device.',
    };
  } catch {
    return { supported: true, platformAvailable: false };
  }
}

export interface RegisteredPasskeyPayload {
  credentialId: string;
  rawId: string;
  clientDataJSON: string;
  attestationObject: string;
  transports: string[];
  deviceLabel: string;
}

export async function createPlatformBiometricPasskey(options: {
  challenge: string;
  rpName: string;
  rpId: string;
  userId: string;
  userName: string;
  displayName: string;
}): Promise<RegisteredPasskeyPayload> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToUint8Array(options.challenge) as BufferSource,
    rp: {
      name: options.rpName,
      id: options.rpId,
    },
    user: {
      id: new TextEncoder().encode(options.userId) as BufferSource,
      name: options.userName,
      displayName: options.displayName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('Biometric registration was cancelled.');
  }
  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === 'function' ? response.getTransports() : ['internal'];

  const ua = navigator.userAgent;
  const deviceLabel = /Android/i.test(ua)
    ? 'Android Mobile Biometric'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iPhone / iPad Face ID or Touch ID'
      : 'Device Biometric Passkey';

  return {
    credentialId: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
    attestationObject: arrayBufferToBase64Url(response.attestationObject),
    transports,
    deviceLabel,
  };
}

export interface BiometricAssertionPayload {
  credentialId: string;
  rawId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

export async function assertPlatformBiometricPasskey(options: {
  challenge: string;
  rpId: string;
  allowCredentialIds?: string[];
}): Promise<BiometricAssertionPayload> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToUint8Array(options.challenge) as BufferSource,
    rpId: options.rpId,
    userVerification: 'required',
    timeout: 60000,
    allowCredentials:
      options.allowCredentialIds && options.allowCredentialIds.length > 0
        ? options.allowCredentialIds.map((id) => ({
            type: 'public-key' as const,
            id: base64UrlToBaseArray(id) as BufferSource,
            transports: ['internal', 'hybrid'] as AuthenticatorTransport[],
          }))
        : undefined,
  };

  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) {
    throw new Error('Biometric verification was cancelled.');
  }
  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    credentialId: assertion.id,
    rawId: arrayBufferToBase64Url(assertion.rawId),
    clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
    authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
    signature: arrayBufferToBase64Url(response.signature),
  };
}

function base64UrlToBaseArray(id: string): Uint8Array {
  return base64UrlToUint8Array(id);
}
