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
    return await result.user.getIdToken(true);
  } finally { await sdk.signOut(auth); }
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
    if (action === 'signup' && name?.trim()) await sdk.updateProfile(result.user, { displayName: name.trim().slice(0, 80) });
    if (!result.user.emailVerified) {
      if (action === 'signup' || action === 'resend') await sdk.sendEmailVerification(result.user, actionSettings());
      return { verificationRequired: true, verificationSent: action === 'signup' || action === 'resend' };
    }
    return { idToken: await result.user.getIdToken(true) };
  } finally { await sdk.signOut(auth); }
}
export function firebaseAuthMessage(issue) {
  const messages = {
    'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can try again.',
    'auth/popup-blocked': 'Allow popups for this website, then try Google sign-in again.',
    'auth/cancelled-popup-request': 'Another sign-in window was opened. Please try one window at a time.',
    'auth/unauthorized-domain': 'The site owner must authorize this website domain in Firebase Authentication.',
    'auth/operation-not-allowed': 'The site owner must enable Email/Password and Google in Firebase Authentication.',
    'auth/invalid-api-key': 'Firebase web configuration needs attention. Contact the site owner.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
    'auth/password-does-not-meet-requirements': 'This password does not meet the Firebase project’s password policy. Try a longer password with mixed characters.',
    'auth/email-already-in-use': 'This account could not be created. Try signing in, Google, or resetting your password.',
    'auth/invalid-credential': 'Sign-in could not be completed. Check your email and password, or use password reset.',
    'auth/wrong-password': 'Sign-in could not be completed. Check your email and password, or use password reset.',
    'auth/user-not-found': 'Sign-in could not be completed. Check your email and password, or use password reset.',
    'auth/user-disabled': 'Sign-in is unavailable for this account. Contact the site owner.',
    'auth/account-exists-with-different-credential': 'Try the sign-in method you originally used for this email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes before trying again.',
    'auth/network-request-failed': 'Firebase could not be reached. Check your connection and try again.',
  };
  return messages[issue?.code] || 'Sign-in could not be completed. Reload the sign-in settings and try again.';
}
