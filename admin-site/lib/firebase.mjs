// Server-only Firebase Admin for the existing PinCraft project. Reads and verifies only.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function adminApp() {
  const existing = getApps().find(app => app.name === 'pincraft-admin');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '';
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Firebase admin configuration is incomplete.');
  }
  return initializeApp({ projectId, credential: cert({ projectId, clientEmail, privateKey }) }, 'pincraft-admin');
}

export const auth = () => getAuth(adminApp());
export const db = () => getFirestore(adminApp());
