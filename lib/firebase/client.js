// Loaded only when a configured Google sign-in button is clicked.
// No Firestore client is used: tokens and private data go through server APIs.
export async function firebaseGoogleSignIn(config){
 const [{initializeApp,getApps},{getAuth,initializeAuth,GoogleAuthProvider,inMemoryPersistence,browserPopupRedirectResolver,signInWithPopup,signOut}]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
 const name='pincraft-web',existing=getApps().find(a=>a.name===name),app=existing||initializeApp(config,name);
 const auth=existing?getAuth(app):initializeAuth(app,{persistence:inMemoryPersistence,popupRedirectResolver:browserPopupRedirectResolver});
 const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
 try{const result=await signInWithPopup(auth,provider);return await result.user.getIdToken(true);}finally{await signOut(auth);}
}
