'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { AuthField, AuthFrame, FormError, SubmitButton } from '@/components/auth/AuthFrame';
import { authAPI, getApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await authAPI.forgotPassword(email.trim().toLowerCase());
      // Keep the response identical for existing and unknown addresses.
      setSent(true);
    } catch (cause) {
      setError(getApiError(cause, 'We could not process that request. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthFrame eyebrow="Account recovery" title={sent ? 'Check your inbox' : 'Reset your password'} description={sent ? 'If an account matches that email, you will receive a password reset link.' : 'Enter the email address linked to your account and we will send a secure reset link.'}>
      {sent ? (
        <div className="rounded-2xl border border-[#dce8df] bg-[#f0f7f2] p-5">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#dcefe1] text-[#236244]"><MailCheck size={20} /></span><div><p className="font-semibold text-[#214a32]">Request received</p><p className="mt-1 break-all text-sm text-[#5b7261]">{email}</p></div></div>
          <p className="mt-4 text-xs leading-5 text-[#627568]">For your security, this confirmation is the same whether or not the address is registered. Check spam if the email does not arrive.</p>
          <button type="button" onClick={() => setSent(false)} className="mt-4 text-sm font-semibold text-[#173d31] hover:underline">Try another email</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <FormError message={error} />
          <AuthField label="Email address" id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={setEmail} disabled={isSubmitting} />
          <SubmitButton loading={isSubmitting}>Send reset link <span aria-hidden="true">→</span></SubmitButton>
        </form>
      )}
      <Link href="/login" className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-white/80 hover:text-white"><ArrowLeft size={16} /> Back to sign in</Link>
    </AuthFrame>
  );
}
