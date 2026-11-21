import React, { useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  getAuthMode,
  sendEmailSignInLink,
  signInWithGoogle,
  startGuestSession,
  type UserProfile,
  type UserSession,
} from '../data/platformStore';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  /** Called for guest sessions; cloud sessions arrive via the Supabase auth listener. */
  onAuthSuccess: (session: UserSession, profile: UserProfile) => void;
}

/** Google "G" mark for the sign-in button (per Google's sign-in branding guidelines). */
export const GoogleMark: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose, onAuthSuccess }) => {
  const mode = getAuthMode();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  const close = () => {
    setError(null);
    setLinkSentTo(null);
    onClose();
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('email');
    try {
      const res = await sendEmailSignInLink({ email, displayName });
      if (res.ok) setLinkSentTo(email.trim().toLowerCase());
      else setError(res.error);
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy('google');
    const res = await signInWithGoogle();
    // On success the browser navigates to Google; only failures return here
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
    }
  };

  const handleGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const { session, profile } = startGuestSession(displayName);
    onAuthSuccess(session, profile);
    close();
  };

  return (
    <Dialog isOpen={open} onOpenChange={(isOpen) => !isOpen && close()} width={420}>
      <DialogHeader
        title={mode === 'cloud' ? 'Sign in to AxisLab' : 'Continue as a guest'}
        subtitle={
          mode === 'cloud'
            ? 'Save demonstrations, policies, and preferences across devices.'
            : 'Accounts are not connected on this deployment.'
        }
      />
      <VStack gap={4} padding={4}>
        {error && <Banner status="error" title="Sign-in problem" description={error} />}

        {mode === 'cloud' && linkSentTo && (
          <Banner
            status="success"
            title="Check your inbox"
            description={`We sent a sign-in link to ${linkSentTo}. Open it on this device to finish; you can close this window.`}
          />
        )}

        {mode === 'cloud' && !linkSentTo && (
          <>
            <Button
              label="Continue with Google"
              variant="secondary"
              icon={<GoogleMark />}
              width="100%"
              isLoading={busy === 'google'}
              isDisabled={busy !== null}
              onClick={handleGoogle}
            />
            <Divider label="or use email" />
            <form onSubmit={handleEmail}>
              <VStack gap={3}>
                <TextInput
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@lab.org"
                  isRequired
                  width="100%"
                />
                <TextInput
                  label="Display name (optional, new accounts)"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="e.g. Ada Lovelace"
                  width="100%"
                />
                <Button
                  type="submit"
                  label="Email me a sign-in link"
                  variant="primary"
                  width="100%"
                  isLoading={busy === 'email'}
                  isDisabled={busy !== null || email.trim() === ''}
                />
              </VStack>
            </form>
          </>
        )}

        {mode === 'guest' && (
          <form onSubmit={handleGuest}>
            <VStack gap={3}>
              <TextInput
                label="Display name (optional)"
                value={displayName}
                onChange={setDisplayName}
                placeholder="Guest"
                width="100%"
              />
              <Button type="submit" label="Continue as guest" variant="primary" width="100%" />
            </VStack>
          </form>
        )}

        <Text type="supporting" color="secondary">
          {mode === 'cloud'
            ? 'No passwords. Your email is kept only by our sign-in provider and is never shared or shown to others. Profiles and saved work are private to you, and you can delete your account and data at any time from your profile.'
            : 'Guest mode collects no email. Your profile and work stay in this browser only; clear it any time from your profile.'}
        </Text>
      </VStack>
    </Dialog>
  );
};
