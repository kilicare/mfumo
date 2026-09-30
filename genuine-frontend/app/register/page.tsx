'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AuthField, AuthFrame, FormError, SubmitButton } from '@/components/auth/AuthFrame';
import { AuthLoadingOverlay } from '@/components/auth/AuthLoadingOverlay';
import { useAuthStore } from '@/store/authStore';

const passwordRules = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'An uppercase and lowercase letter', test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'A number and a special character', test: (value: string) => /\d/.test(value) && /[@$!%*?&]/.test(value) },
];

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const matchedRules = useMemo(() => passwordRules.map((rule) => rule.test(password)), [password]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError('Enter a first and last name with at least 2 characters each.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!businessName.trim()) {
      setError('Enter your business name.');
      return;
    }
    if (!businessType) {
      setError('Select your business type.');
      return;
    }
    if (!matchedRules.every(Boolean)) {
      setError('Choose a password that meets all the requirements below.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        businessName: businessName.trim(),
        businessType,
        password,
      });
      router.replace('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not create your account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <AuthFrame eyebrow="Start your workspace" title="Create your business account" description="Set up secure access for your team and bring your operations together.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthField label="First name" id="firstName" autoComplete="given-name" placeholder="First name" value={firstName} onChange={setFirstName} disabled={isSubmitting} />
          <AuthField label="Last name" id="lastName" autoComplete="family-name" placeholder="Last name" value={lastName} onChange={setLastName} disabled={isSubmitting} />
        </div>
        <AuthField label="Work email" id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={setEmail} disabled={isSubmitting} />
        <AuthField label="Business name" id="businessName" autoComplete="organization" placeholder="Your business" value={businessName} onChange={setBusinessName} disabled={isSubmitting} />
        <div>
          <label htmlFor="businessType" className="mb-2 block text-sm font-semibold text-white">Business type</label>
          <select id="businessType" name="businessType" value={businessType} onChange={(event) => setBusinessType(event.target.value)} disabled={isSubmitting} className="h-12 w-full rounded-xl border border-[#dfe1db] bg-white px-4 text-sm text-[#20231f] shadow-sm shadow-black/[0.02] focus:border-[#8aa91a] focus:outline-none focus:ring-4 focus:ring-[#d8f04b]/15 disabled:opacity-60">
            <option value="">Select business type</option>
            <option value="Distribution">Distribution</option>
            <option value="Retail">Retail</option>
            <option value="Wholesale">Wholesale</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <AuthField label="Password" id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Create a strong password" value={password} onChange={setPassword} disabled={isSubmitting} maxLength={128} suffix={<button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#777b73] hover:text-[#20231f]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>} />
        <div className="grid gap-1.5 rounded-xl border border-white/15 bg-black/20 px-3.5 py-3 text-xs backdrop-blur-sm sm:grid-cols-2">
          {passwordRules.map((rule, index) => <p key={rule.label} className={matchedRules[index] ? 'text-[#c5f0d2]' : 'text-white/75'}><span className="mr-1.5">{matchedRules[index] ? '✓' : '○'}</span>{rule.label}</p>)}
          <p className={password.length <= 128 ? 'text-white/75' : 'text-red-200'}><span className="mr-1.5">{password.length <= 128 ? '○' : '!'}</span>Maximum 128 characters</p>
        </div>
        <AuthField label="Confirm password" id="confirmPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Type your password again" value={confirmPassword} onChange={setConfirmPassword} disabled={isSubmitting} maxLength={128} />
        <p className="text-xs leading-5 text-white/70">By creating an account, you confirm that you are authorized to set up this business workspace.</p>
        <SubmitButton loading={isSubmitting}>Create account <span aria-hidden="true">→</span></SubmitButton>
        <p className="text-center text-sm text-white/75">Already have an account? <Link href="/login" className="font-semibold text-white underline-offset-4 hover:underline">Sign in</Link></p>
      </form>
    </AuthFrame>
    {isSubmitting ? <AuthLoadingOverlay message="Creating your workspace…" /> : null}
    </>
  );
}
