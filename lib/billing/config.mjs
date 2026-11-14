import 'server-only';
import { PAYMENT_NUMBER } from '../product.mjs';
import { firebaseAuth } from '../firebase/admin.mjs';
export const FREE_LIMITS = { pinterest: 1, websites: 1 };
export const PLAN_REF = 'pincraft_system/subscriptionPlan';
// Owner confirmed these terms on 2026-11-13. The reviewer is still pending;
// publishing prices is not authorization to collect or activate payments.
export const CONFIRMED_PLAN = Object.freeze({ priceBdt: 99, durationDays: 30, limits: Object.freeze({ pinterest: 2, websites: 2 }), revision: 'owner-confirmed-2026-11-13-v1', currency: 'BDT', method: 'manual_review', enabled: false });
const list = value => (value || '').split(',').map(item => item.trim()).filter(Boolean);
export function billingAdminConfigured() { return Boolean(list(process.env.BILLING_ADMIN_UIDS).length || list(process.env.BILLING_ADMIN_EMAILS).length); }
export async function billingAdmin(user) {
  if (!user?.id) return false;
  const allowedUid = list(process.env.BILLING_ADMIN_UIDS).includes(user.id), emails = list(process.env.BILLING_ADMIN_EMAILS).map(value => value.toLowerCase());
  if (!allowedUid && !emails.length) return false;
  const managed = await firebaseAuth().getUser(user.id);
  return Boolean(managed.emailVerified && !managed.disabled && (allowedUid || (typeof managed.email === 'string' && emails.includes(managed.email.toLowerCase()))));
}
export function planInput(raw) {
  const priceBdt = Number(raw.priceBdt), durationDays = Number(raw.durationDays), pinterest = Number(raw.pinterestLimit), websites = Number(raw.websiteLimit);
  if (![priceBdt, durationDays, pinterest, websites].every(Number.isInteger) || priceBdt < 1 || priceBdt > 100000 || durationDays < 1 || durationDays > 366 || pinterest < 2 || pinterest > 20 || websites < 2 || websites > 20 || typeof raw.enabled !== 'boolean') throw new Error('Set a whole-taka price, 1–366 days, and 2–20 Pinterest accounts and websites.');
  return { priceBdt, durationDays, limits: { pinterest, websites }, enabled: raw.enabled, currency: 'BDT', method: 'manual_review' };
}
export function publicPlan(row) {
  row = row || CONFIRMED_PLAN;
  const configured = Boolean(row && Number.isInteger(row.priceBdt) && row.priceBdt > 0 && row.durationDays > 0 && row.limits?.pinterest > 1 && row.limits?.websites > 1 && row.revision);
  const enabled = Boolean(configured && row.enabled && billingAdminConfigured());
  return { configured, enabled, paymentNumber: enabled ? PAYMENT_NUMBER : null, paymentMethods: enabled ? ['bkash', 'nagad'] : [], verification: 'manual_review', ...(configured ? { revision: row.revision, priceBdt: row.priceBdt, durationDays: row.durationDays, limits: row.limits, currency: 'BDT' } : {}) };
}
