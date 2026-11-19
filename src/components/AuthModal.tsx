import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  Lock,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  UserPlus,
  X,
} from 'lucide-react';
import {
  recordBiometricPasskeyInFirestore,
  registerEmailCreator,
  signInWithEmailCreator,
  signInWithGoogleCreator,
  signOutFirebaseCreator,
} from '../firebase';
import {
  assertPlatformBiometricPasskey,
  createPlatformBiometricPasskey,
  detectPlatformBiometricCapability,
} from '../lib/webauthnClient';
import type { CreatorUser } from '../lib/types';

export const SESSION_STORAGE_KEY = 'kathastudio_session_token';

interface AuthModalProps {
  open: boolean;
  fullScreenGate?: boolean;
  onClose: () => void;
  currentUser: CreatorUser | null;
  onAuthenticated: (user: CreatorUser, sessionToken?: string) => void;
  onSignedOut: () => void;
}

export function AuthModal({
  open,
  fullScreenGate = false,
  onClose,
  currentUser,
  onAuthenticated,
  onSignedOut,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // New Create fields
  const [displayName, setDisplayName] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [useFirebaseEmailAuth, setUseFirebaseEmailAuth] = useState(false);

  const [busy, setBusy] = useState(false);
  const [biometricHint, setBiometricHint] = useState<{
    supported: boolean;
    platformAvailable: boolean;
    reason?: string;
  }>({ supported: true, platformAvailable: true });
  const [iframeBlockedHint, setIframeBlockedHint] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open && !fullScreenGate) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setIframeBlockedHint(false);
    void detectPlatformBiometricCapability().then(setBiometricHint);
  }, [open, fullScreenGate]);

  if (!open && !fullScreenGate) return null;

  const handleLinkMobileBiometric = async (targetUser: CreatorUser, token: string) => {
    setErrorMsg(null);
    setIframeBlockedHint(false);
    setBusy(true);
    try {
      const optRes = await fetch('/api/auth/webauthn/register-options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: targetUser.id }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        throw new Error(optData.error || 'Could not start biometric registration.');
      }

      const passkey = await createPlatformBiometricPasskey({
        challenge: optData.challenge,
        rpName: optData.rpName,
        rpId: optData.rpId,
        userId: optData.user.id,
        userName: optData.user.name,
        displayName: optData.user.displayName,
      });

      const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: optData.challengeId,
          credentialId: passkey.credentialId,
          clientDataJSON: passkey.clientDataJSON,
          transports: passkey.transports,
          deviceLabel: passkey.deviceLabel,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Biometric passkey verification failed.');
      }

      await recordBiometricPasskeyInFirestore({
        credentialId: passkey.credentialId,
        deviceLabel: passkey.deviceLabel,
        transports: passkey.transports,
      }).catch(() => {});

      if (verifyData.sessionToken) {
        localStorage.setItem(SESSION_STORAGE_KEY, verifyData.sessionToken);
      }
      onAuthenticated(verifyData.user as CreatorUser, verifyData.sessionToken);
      setStatusMsg('Mobile Biometric (Fingerprint / Face ID) linked to your creator account!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/permissions policy|not allowed|iframe|feature is not enabled/i.test(msg)) {
        setIframeBlockedHint(true);
        setErrorMsg(
          'Your preview window blocked the device biometric sensor inside an iframe. Open KathaStudio in a standalone mobile or browser tab to activate Fingerprint / Face ID.'
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCredentialSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const idTrimmed = loginIdentifier.trim();
    if (!idTrimmed || !loginPassword) {
      setErrorMsg('Please enter your Login ID / email and password.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: idTrimmed,
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.user && data.sessionToken) {
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
        onAuthenticated(data.user as CreatorUser, data.sessionToken);
        setLoginPassword('');
        setStatusMsg('Signed in! Unlocking KathaStudio...');
        return;
      }

      // Fallback for standard email addresses registered with Firebase Email Auth
      if (idTrimmed.includes('@') && idTrimmed.includes('.')) {
        const fbUser = await signInWithEmailCreator(idTrimmed, loginPassword);
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: fbUser.displayName || idTrimmed.split('@')[0],
            email: fbUser.email || idTrimmed,
            firebaseUid: fbUser.uid,
            authMethod: 'email',
          }),
        });
        const regData = await regRes.json();
        if (!regRes.ok) throw new Error(regData.error || 'Sign-in failed.');
        localStorage.setItem(SESSION_STORAGE_KEY, regData.sessionToken);
        onAuthenticated(regData.user as CreatorUser, regData.sessionToken);
        setLoginPassword('');
        setStatusMsg('Signed in successfully!');
        return;
      }

      throw new Error(data.error || 'Invalid Login ID or password.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent, withBiometricPrompt: boolean) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setIframeBlockedHint(false);

    if (!displayName.trim()) {
      setErrorMsg('Please enter your creator name.');
      return;
    }
    if (!newLoginId.trim() && !mobileNumber.trim() && !email.trim()) {
      setErrorMsg('Please enter a Login ID, mobile number, or email address.');
      return;
    }
    if (!withBiometricPrompt && (!newPassword || newPassword.length < 4)) {
      setErrorMsg('Please set a password (minimum 4 characters) for your new account.');
      return;
    }

    setBusy(true);
    try {
      let firebaseUid: string | undefined;
      let authMethod: CreatorUser['authMethod'] = withBiometricPrompt ? 'mobile_biometric' : 'credentials';

      if (useFirebaseEmailAuth && email.trim() && newPassword.length >= 6) {
        const fbRes = await registerEmailCreator({
          displayName: displayName.trim(),
          email: email.trim(),
          password: newPassword,
          phoneNumber: mobileNumber.trim() || undefined,
        });
        firebaseUid = fbRes.user.uid;
        authMethod = 'email';
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          loginId: newLoginId.trim() || undefined,
          mobileNumber: mobileNumber.trim() || undefined,
          email: email.trim() || undefined,
          password: newPassword || undefined,
          firebaseUid,
          authMethod,
          isNewCreate: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'New account creation failed.');
      }

      const token = data.sessionToken as string;
      const user = data.user as CreatorUser;
      localStorage.setItem(SESSION_STORAGE_KEY, token);
      onAuthenticated(user, token);

      if (withBiometricPrompt) {
        await handleLinkMobileBiometric(user, token);
      } else {
        setStatusMsg('New creator account created and signed in!');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Account creation failed.';
      if (msg.includes('auth/operation-not-allowed')) {
        setErrorMsg(
          'Firebase Email/Password provider is disabled in Firebase Console. Uncheck Firebase Email option to create your Studio Login ID directly.'
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const fbUser = await signInWithGoogleCreator();
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Creator',
          email: fbUser.email || undefined,
          firebaseUid: fbUser.uid,
          authMethod: 'google',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create creator session.');
      localStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
      onAuthenticated(data.user as CreatorUser, data.sessionToken);
      setStatusMsg('Signed in with Google!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleBiometricSignIn = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setIframeBlockedHint(false);
    setBusy(true);
    try {
      const identifier = loginIdentifier.trim() || mobileNumber.trim() || email.trim() || undefined;
      const optRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) {
        throw new Error(optData.error || 'No registered biometric passkey found.');
      }

      const assertion = await assertPlatformBiometricPasskey({
        challenge: optData.challenge,
        rpId: optData.rpId,
        allowCredentialIds: optData.allowCredentialIds,
      });

      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: optData.challengeId,
          credentialId: assertion.credentialId,
          clientDataJSON: assertion.clientDataJSON,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Biometric verification failed.');
      }

      localStorage.setItem(SESSION_STORAGE_KEY, verifyData.sessionToken);
      onAuthenticated(verifyData.user as CreatorUser, verifyData.sessionToken);
      setStatusMsg('Verified via Mobile Biometric! Welcome back.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/permissions policy|not allowed|iframe|feature is not enabled/i.test(msg)) {
        setIframeBlockedHint(true);
        setErrorMsg(
          'Device biometric prompt was blocked inside an embedded preview frame. Open KathaStudio in a standalone browser tab on your mobile phone to verify Fingerprint / Face ID.'
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      await signOutFirebaseCreator().catch(() => {});
      onSignedOut();
      setStatusMsg('Signed out cleanly.');
    } finally {
      setBusy(false);
    }
  };

  const containerClass = fullScreenGate
    ? 'min-h-screen bg-[#F8F9FB] flex items-center justify-center p-4 sm:p-6'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4';

  return (
    <div
      className={containerClass}
      role={fullScreenGate ? 'main' : 'dialog'}
      aria-modal={fullScreenGate ? undefined : 'true'}
      aria-label="KathaStudio Login Access"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                {currentUser ? 'Creator Account & Mobile Biometric' : 'KathaStudio Login Access'}
              </h1>
              <p className="text-xs text-slate-500">
                {currentUser
                  ? 'Manage session, device biometrics & creator profile.'
                  : 'Sign in with your Login ID & password, Mobile Biometric, or click New Create.'}
              </p>
            </div>
          </div>
          {!fullScreenGate && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account modal"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {statusMsg && (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 space-y-1.5">
              <p>{errorMsg}</p>
              {iframeBlockedHint && typeof window !== 'undefined' && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline text-red-900"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open in New Tab for Mobile Biometric Prompt</span>
                </a>
              )}
            </div>
          )}

          {currentUser ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {currentUser.displayName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {[currentUser.loginId, currentUser.mobileNumber, currentUser.email]
                        .filter(Boolean)
                        .join(' · ') || 'KathaStudio Creator'}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{currentUser.biometricEnabled ? 'Biometric Active' : 'Signed In'}</span>
                  </span>
                </div>

                {currentUser.biometricCredentials.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-1">
                    <div className="text-[11px] font-medium text-slate-700">
                      Linked Mobile Passkeys ({currentUser.biometricCredentials.length}):
                    </div>
                    {currentUser.biometricCredentials.map((cred) => (
                      <div
                        key={cred.credentialId}
                        className="flex items-center justify-between text-[11px] text-slate-600"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5 text-orange-700" />
                          <span>{cred.deviceLabel}</span>
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {cred.createdAt.slice(0, 10)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const tok = localStorage.getItem(SESSION_STORAGE_KEY) || '';
                    void handleLinkMobileBiometric(currentUser, tok);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2.5 text-xs font-medium text-white hover:bg-orange-800 disabled:opacity-60"
                >
                  <Fingerprint className="h-4 w-4" />
                  <span>
                    {currentUser.biometricEnabled
                      ? 'Add Another Mobile Biometric Device'
                      : 'Enable Mobile Biometric (Fingerprint / Face ID)'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mode Switcher: Login vs New Create */}
              <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  data-testid="tab-login"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                    mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Login Access
                </button>
                <button
                  type="button"
                  data-testid="tab-new-create"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  className={`rounded-md py-2 text-xs font-semibold transition-colors ${
                    mode === 'register' ? 'bg-white text-orange-800 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  New Create
                </button>
              </div>

              {mode === 'login' ? (
                <div className="space-y-4">
                  <form onSubmit={(e) => void handleCredentialSignIn(e)} className="space-y-3">
                    <div>
                      <label htmlFor="auth-login-id" className="block text-xs font-medium text-slate-700 mb-1">
                        Login ID / Email / Mobile
                      </label>
                      <input
                        id="auth-login-id"
                        data-testid="login-id-input"
                        type="text"
                        autoComplete="username"
                        value={loginIdentifier}
                        onChange={(e) => setLoginIdentifier(e.target.value)}
                        placeholder="Enter your Login ID or Email"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="auth-login-password" className="block text-xs font-medium text-slate-700 mb-1">
                        Password
                      </label>
                      <input
                        id="auth-login-password"
                        data-testid="login-password-input"
                        type="password"
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      data-testid="login-submit-btn"
                      disabled={busy || !loginIdentifier.trim() || !loginPassword}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60 transition-colors"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>{busy ? 'Signing In...' : 'Login to Studio'}</span>
                    </button>
                  </form>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500">Don&apos;t have a Login ID yet?</span>
                    <button
                      type="button"
                      onClick={() => setMode('register')}
                      className="font-semibold text-orange-700 hover:text-orange-800"
                    >
                      New Create →
                    </button>
                  </div>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-slate-200" />
                    <span className="mx-3 text-[11px] font-medium text-slate-400">
                      OR BIOMETRIC / GOOGLE
                    </span>
                    <div className="flex-grow border-t border-slate-200" />
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleBiometricSignIn()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2.5 text-xs font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-60"
                    >
                      <Fingerprint className="h-4 w-4 text-orange-700" />
                      <span>Mobile Biometric</span>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleGoogleAuth()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Mail className="h-4 w-4 text-orange-700" />
                      <span>Google Account</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => void handleCreateAccount(e, false)} className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700 mb-1">
                        Creator Full Name
                      </label>
                      <input
                        id="auth-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g., Om Yavtkar"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="auth-new-login-id" className="block text-xs font-medium text-slate-700 mb-1">
                        New Login ID
                      </label>
                      <input
                        id="auth-new-login-id"
                        type="text"
                        value={newLoginId}
                        onChange={(e) => setNewLoginId(e.target.value)}
                        placeholder="e.g., creator@2026"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="auth-mobile" className="block text-xs font-medium text-slate-700 mb-1">
                        Mobile Number
                      </label>
                      <input
                        id="auth-mobile"
                        type="tel"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        placeholder="+91 9876543210"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1">
                        Email Address (Optional)
                      </label>
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="creator@example.com"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-new-password" className="block text-xs font-medium text-slate-700 mb-1">
                      Create Password (Min 4 chars)
                    </label>
                    <input
                      id="auth-new-password"
                      type="password"
                      minLength={4}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Choose a strong password"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-orange-700 focus:outline-none"
                    />
                  </div>

                  {email.trim().includes('.') && (
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useFirebaseEmailAuth}
                        onChange={(e) => setUseFirebaseEmailAuth(e.target.checked)}
                        className="h-3.5 w-3.5 accent-orange-700"
                      />
                      <span>Also register with Firebase Email/Password</span>
                    </label>
                  )}

                  {!biometricHint.platformAvailable && biometricHint.reason && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      {biometricHint.reason}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
                    >
                      <UserPlus className="h-4 w-4" />
                      <span>New Create Account</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => void handleCreateAccount(e, true)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Fingerprint className="h-4 w-4 text-orange-700" />
                      <span>Create + Mobile Biometric</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
