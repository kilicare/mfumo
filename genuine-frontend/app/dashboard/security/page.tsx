'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound } from 'lucide-react';
import { AuthField, FormError, SubmitButton } from '@/components/auth/AuthFrame';
import { getApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';

export default function SecurityPage() {
  const router = useRouter();
  const changePassword = useAuthStore((state) => state.changePassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8 || newPassword.length > 128 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[@$!%*?&]/.test(newPassword)) {
      setError('Use 8–128 characters with uppercase, lowercase, a number, and one of @$!%*?&.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      router.replace('/login?reason=password-updated');
    } catch (cause) {
      setError(getApiError(cause, 'We could not update your password. Check your current password and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#73766f] hover:text-[#173d31]"><ArrowLeft size={16} /> Back to overview</Link>
      <section className="mt-6 rounded-2xl border border-[#e8e9e5] bg-white p-5 shadow-sm sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f5f0e3] text-[#927126]"><KeyRound size={19} /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#20231f]">Change password</h1>
        <p className="mt-2 text-sm leading-6 text-[#73766f]">Changing your password signs out all active sessions. You will need to sign in again with the new password.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
          <FormError message={error} />
          <AuthField label="Current password" id="currentPassword" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter current password" value={currentPassword} onChange={setCurrentPassword} disabled={isSubmitting} />
          <AuthField label="New password" id="newPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" placeholder="8+ chars, upper/lowercase, number, symbol" value={newPassword} onChange={setNewPassword} disabled={isSubmitting} maxLength={128} />
          <AuthField label="Confirm new password" id="confirmPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" placeholder="Type the new password again" value={confirmation} onChange={setConfirmation} disabled={isSubmitting} maxLength={128} />
          <button type="button" onClick={() => setShowPasswords((shown) => !shown)} className="inline-flex items-center gap-2 text-xs font-semibold text-[#73766f] hover:text-[#173d31]">{showPasswords ? <EyeOff size={15} /> : <Eye size={15} />}{showPasswords ? 'Hide passwords' : 'Show passwords'}</button>
          <SubmitButton loading={isSubmitting}>Update password <span aria-hidden="true">→</span></SubmitButton>
        </form>
      </section>
    </div>
  );
}
