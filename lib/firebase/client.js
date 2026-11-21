// Loaded only when an account action is requested. Passwords go directly to
// Firebase Auth over TLS, never to a PinCraft API, browser storage or logs.
let clientPromise;
async function client(config) {
  if (!clientPromise) clientPromise = (async () => {
    const [appSDK, authSDK] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const name = 'pincraft-web';
    const existing = appSDK.getApps().find(app => app.name === name);
    const app = existing || appSDK.initializeApp(config, name);
    const auth = existing ? authSDK.getAuth(app) : authSDK.initializeAuth(app, {
      persistence: authSDK.inMemoryPersistence,
      popupRedirectResolver: authSDK.browserPopupRedirectResolver,
    });
    if (app.options.projectId !== config.projectId) throw new Error('Reload before changing Firebase projects.');
    return { auth, sdk: authSDK };
  })().catch(error => { clientPromise = null; throw error; });
  return clientPromise;
}
const actionSettings = () => ({ url: `${window.location.origin}/login`, handleCodeInApp: false });
export async function firebaseGoogleSignIn(config) {
  const { auth, sdk } = await client(config);
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await sdk.signInWithPopup(auth, provider);
    // isNewUser is true only the first time this Google account registers.
    const isNewUser = Boolean(sdk.getAdditionalUserInfo(result)?.isNewUser);
    return { idToken: await result.user.getIdToken(true), isNewUser };
  } finally { await sdk.signOut(auth); }
}
// PinCraft sends the verification email itself (branded, English, through its Gmail system). Firebase's own
// verification email is not used. The server checks the ID token and sends only to that token's account email.
async function requestPinCraftVerification(user) {
  let response;
  try {
    const idToken = await user.getIdToken(true);
    response = await fetch('/api/auth/send-verification', {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
  } catch { return { verificationSent: false, verificationErrorCode: 'auth/network-request-failed', retryAfterSeconds: 0 }; }
  let data = null;
  try { data = await response.json(); } catch { /* Non-JSON responses are treated as a delivery failure below. */ }
  const retryAfterSeconds = Number.isFinite(data?.retryAfterSeconds) ? data.retryAfterSeconds : 0;
  if (data?.verificationSent === true) return { verificationSent: true, verificationErrorCode: null, retryAfterSeconds: 0 };
  return {
    verificationSent: false,
    verificationErrorCode: typeof data?.verificationErrorCode === 'string' ? data.verificationErrorCode : 'auth/network-request-failed',
    retryAfterSeconds,
  };
}
export async function firebaseEmailAction(config, { action, email, password, name }) {
  const { auth, sdk } = await client(config);
  try {
    if (action === 'reset') {
      await sdk.sendPasswordResetEmail(auth, email, actionSettings());
      return { resetRequested: true };
    }
    if (!['signup', 'login', 'resend'].includes(action)) throw new Error('Choose an account action.');
    const result = action === 'signup'
      ? await sdk.createUserWithEmailAndPassword(auth, email, password)
      : await sdk.signInWithEmailAndPassword(auth, email, password);
    if (action === 'signup' && name?.trim()) { try { await sdk.updateProfile(result.user, { displayName: name.trim().slice(0, 80) }); } catch { /* Account exists; name can be retried independently of email verification. */ } }
    if (!result.user.emailVerified) {
      let verificationSent = false, verificationErrorCode = null, retryAfterSeconds = 0;
      if (action === 'signup' || action === 'resend') {
        ({ verificationSent, verificationErrorCode, retryAfterSeconds } = await requestPinCraftVerification(result.user));
      }
      // Account creation can succeed while email delivery fails. Preserve that
      // truthful distinction so the person is not told to register again.
      return { accountCreated: action === 'signup', verificationRequired: true, verificationSent, verificationErrorCode, retryAfterSeconds };
    }
    return { idToken: await result.user.getIdToken(true) };
  } finally { await sdk.signOut(auth); }
}
export function firebaseAuthMessage(issue) {
  const messages = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled. You can try again.',
    'auth/popup-blocked': 'Allow popups for this website, then try again.',
    'auth/cancelled-popup-request': 'Another sign-in window was opened. Please try one window at a time.',
    'auth/unauthorized-domain': 'Sign-in is not available on this website address. Open the main PinCraft website or contact support.',
    'auth/operation-not-allowed': 'This sign-in method is temporarily unavailable. Try the other method or contact support.',
    'auth/invalid-api-key': 'Sign-in is temporarily unavailable. Please contact support.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/password-does-not-meet-requirements': 'This password does not meet the account’s password rules. Try a longer password with mixed characters.',
    'auth/email-already-in-use': 'You already have an account with this email. Please sign in with your password — or reset your password if you forgot it.',
    'auth/invalid-credential': 'Sign-in could not be completed. Check your email and password, or use password reset.',
    'auth/wrong-password': 'Sign-in could not be completed. Check your email and password, or use password reset.',
    'auth/user-not-found': 'Sign-in could not be completed. Check your email and password, or use password reset.',
    'auth/user-disabled': 'Sign-in is unavailable for this account. Contact the site owner.',
    'auth/account-exists-with-different-credential': 'This email already has an account, but with a different sign-in method. Please use the sign-in method you used when you created it.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
    'auth/network-request-failed': 'The account service could not be reached. Check your connection and try again.',
  };
  return messages[issue?.code] || 'Sign-in could not be completed. Reload the sign-in settings and try again.';
}
