'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { AuthField, AuthFrame, FormError, SubmitButton } from '@/components/auth/AuthFrame';
import { AuthLoadingOverlay } from '@/components/auth/AuthLoadingOverlay';
import { authAPI, getApiError } from '@/lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get('token') || '';
    setToken(resetToken);
    // In React Strict Mode, development effects are replayed. Defer URL cleanup
    // until the replay has finished so both setups can capture the same token.
    const cleanupFrame = window.requestAnimationFrame(() => {
      window.history.replaceState(null, '', window.location.pathname);
    });
    return () => window.cancelAnimationFrame(cleanupFrame);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('This reset link is missing its security token. Request a new link.');
      return;
    }
    if (password.length < 8 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[@$!%*?&]/.test(password)) {
      setError('Use 8–128 characters with uppercase, lowercase, a number, and one of @$!%*?&.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await authAPI.resetPassword(token, password);
      setSuccess(true);
    } catch (cause) {
      setError(getApiError(cause, 'That reset link may have expired. Request a new one and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <AuthFrame eyebrow="Account recovery" title={success ? 'Password updated' : 'Choose a new password'} description={success ? 'Your password has been changed. Sign in with the new password to continue.' : 'Choose a strong password you have not used for this account before.'}>
      {success ? (
        <div className="rounded-2xl border border-[#dce8df] bg-[#f0f7f2] p-5 text-center">
          <CheckCircle2 className="mx-auto text-[#26804b]" size={30} />
          <p className="mt-3 font-semibold text-[#214a32]">Password reset complete</p>
          <p className="mt-1 text-sm text-[#5b7261]">For your security, all existing sessions have been signed out.</p>
          <Link href="/login" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#20211f] px-5 text-sm font-semibold text-white hover:bg-[#363a33]">Go to sign in</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <FormError message={error} />
          <AuthField label="New password" id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="8+ chars, upper/lowercase, number, symbol" value={password} onChange={setPassword} disabled={isSubmitting} suffix={<button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#777b73] hover:text-[#20231f]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
          <AuthField label="Confirm new password" id="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Type the new password again" value={confirmPassword} onChange={setConfirmPassword} disabled={isSubmitting} />
          <SubmitButton loading={isSubmitting}>Update password <span aria-hidden="true">→</span></SubmitButton>
          {!token ? <p className="text-center text-xs text-red-200">Reset token not found. <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link></p> : null}
        </form>
      )}
      {!success ? <Link href="/login" className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-white/80 hover:text-white"><ArrowLeft size={16} /> Back to sign in</Link> : null}
    </AuthFrame>
    {isSubmitting ? <AuthLoadingOverlay message="Updating your password…" /> : null}
    </>
  );
}
