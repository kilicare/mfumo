'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { AuthField, AuthFrame, FormError } from '@/components/auth/AuthFrame';
import { AuthLoadingOverlay } from '@/components/auth/AuthLoadingOverlay';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter both your email address and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email, password);
      const requestedPath = new URLSearchParams(window.location.search).get('next');
      const safePath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/dashboard';
      router.replace(safePath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not sign you in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <AuthFrame eyebrow="Welcome back" title="Sign in to your workspace" description="Use your business account details to continue.">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormError message={error} />
        <AuthField label="Email address" id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={setEmail} disabled={isSubmitting} />
        <AuthField
          label="Password"
          id="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={setPassword}
          disabled={isSubmitting}
          maxLength={128}
          suffix={<button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#777b73] hover:text-[#20231f]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
        />
        <div className="-mt-2 flex justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-[#d8f04b] hover:text-white">Forgot password?</Link>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#20211f] px-5 text-sm font-semibold text-white shadow-lg shadow-[#20211f]/15 transition hover:bg-[#363a33] focus:outline-none focus:ring-4 focus:ring-[#20211f]/20 disabled:cursor-wait disabled:opacity-70"
        >
          Sign in <span aria-hidden="true">→</span>
        </button>
        <p className="pt-1 text-center text-sm text-white/75">New to Genuine? <Link href="/register" className="font-semibold text-white underline-offset-4 hover:underline">Create an account</Link></p>
      </form>
      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-white/70"><LockKeyhole size={14} /> Your sign-in is encrypted and protected.</div>
    </AuthFrame>
    {isSubmitting ? <AuthLoadingOverlay message="Signing you in…" /> : null}
    </>
  );
}
