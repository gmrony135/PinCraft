'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/providers/AppProvider';
export default function HomeAccountCTA() {
  const { user, authLoading, authUnavailable } = useAuth();
  if (authLoading) return <span aria-label="Checking account" className="inline-block h-12 w-48 animate-pulse rounded-xl bg-neutral-800" />;
  return <Link href={user || authUnavailable ? '/dashboard' : '/register'} prefetch className="btn-primary shrink-0">{user || authUnavailable ? 'Continue to Dashboard' : 'Create an account'}<ArrowRight size={16} aria-hidden="true" /></Link>;
}
