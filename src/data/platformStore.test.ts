import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMemoryPlatformStoreForTests,
  deleteAccount,
  dumpMemoryPlatformStoreForTests,
  getAuthMode,
  getInitials,
  getProfile,
  getSession,
  listFeedback,
  purgeLegacyLocalAccounts,
  seedMemoryPlatformStoreForTests,
  sendEmailSignInLink,
  signInWithGoogle,
  signOutUser,
  startGuestSession,
  submitFeedback,
  updateProfile,
  validateDisplayName,
  validateEmail,
} from './platformStore';

beforeEach(() => {
  clearMemoryPlatformStoreForTests();
});

test('validateEmail and validateDisplayName enforce input rules', () => {
  assert.equal(validateEmail('visitor@example.com'), true);
  assert.equal(validateEmail('not-an-email'), false);
  assert.equal(validateDisplayName('Alex Rivera'), true);
  assert.equal(validateDisplayName('A'), false);
  assert.equal(validateDisplayName('   '), false);
});

test('without a backend the app runs in guest mode and never stores an email', async () => {
  assert.equal(getAuthMode(), 'guest');

  // Cloud sign-in paths refuse cleanly and leave nothing behind
  const link = await sendEmailSignInLink({ email: 'alex@example.com', displayName: 'Alex' });
  assert.equal(link.ok, false);
  assert.equal((await signInWithGoogle()).ok, false);
  assert.equal(getSession(), null);

  const { session, profile } = startGuestSession('Alex Rivera');
  assert.equal(session.provider, 'local');
  assert.equal(session.email, '');
  assert.ok(session.userId.startsWith('guest_'));
  assert.equal(profile.displayName, 'Alex Rivera');
  assert.equal(getSession()?.userId, session.userId);

  const stored = [...dumpMemoryPlatformStoreForTests().values()].join('\n');
  assert.equal(/@/.test(stored), false, 'no email address anywhere in local storage');

  await signOutUser();
  assert.equal(getSession(), null);
});

test('sendEmailSignInLink validates the address before anything else', async () => {
  const res = await sendEmailSignInLink({ email: 'not-an-email' });
  assert.deepEqual(res, { ok: false, error: 'Please enter a valid email address.' });
});

test('updateProfile persists display name, bio, avatar color, and simulator defaults', async () => {
  const { session } = startGuestSession('Initial Name');
  const updated = await updateProfile(session.userId, {
    displayName: 'Kenji Sato',
    avatarColor: 'sky',
    defaultControlMode: 'ik',
    showJointAxesDefault: false,
    bio: 'Practicing bottle flip trajectories.',
  });

  assert.ok(updated);
  assert.equal(updated.displayName, 'Kenji Sato');
  assert.equal(updated.avatarColor, 'sky');
  assert.equal(updated.defaultControlMode, 'ik');
  assert.equal(updated.showJointAxesDefault, false);
  assert.equal(updated.bio, 'Practicing bottle flip trajectories.');
  assert.equal(getInitials(updated.displayName, updated.email), 'KS');
});

test('submitFeedback validates message and persists structured feedback', async () => {
  const bad = await submitFeedback({
    userId: null,
    email: 'bad-email',
    category: 'Bug Report',
    rating: 4,
    message: 'Too short?',
    appView: 'simulator',
  });
  assert.equal(bad.ok, false);

  const good = await submitFeedback({
    userId: 'usr_1',
    email: 'pilot@example.com',
    category: 'Physics & Kinematics',
    rating: 5,
    message: 'Bottle flip physics and power telemetry graph feel super responsive.',
    appView: 'simulator',
  });
  assert.equal(good.ok, true);
  const all = listFeedback();
  assert.equal(all.length, 1);
  assert.equal(all[0].rating, 5);
  assert.equal(all[0].category, 'Physics & Kinematics');
});

test('deleteAccount removes the profile, session, and the user\'s feedback', async () => {
  const { session } = startGuestSession('Temp User');
  await submitFeedback({
    userId: session.userId,
    email: '',
    category: 'UI / Workflow',
    rating: 4,
    message: 'Please add a dark/light toggle.',
    appView: 'landing',
  });
  await submitFeedback({
    userId: 'someone_else',
    email: '',
    category: 'Bug Report',
    rating: 3,
    message: 'Unrelated feedback that must survive.',
    appView: 'landing',
  });

  assert.deepEqual(await deleteAccount(session.userId), { ok: true });
  assert.equal(getSession(), null);
  assert.equal(getProfile(session.userId), null);
  assert.deepEqual(listFeedback().map((f) => f.userId), ['someone_else']);
});

test('purgeLegacyLocalAccounts removes plaintext email lists and fake sessions from older versions', () => {
  seedMemoryPlatformStoreForTests(
    'axislab_email_registrations_v1',
    JSON.stringify([{ email: 'old@example.com' }]),
  );
  seedMemoryPlatformStoreForTests('axislab_accounts_v2', JSON.stringify([{ email: 'old@example.com' }]));
  seedMemoryPlatformStoreForTests(
    'axislab_session_v1',
    JSON.stringify({ userId: 'sb_pending_old@example.com', email: 'old@example.com', provider: 'supabase' }),
  );

  purgeLegacyLocalAccounts();

  const stored = dumpMemoryPlatformStoreForTests();
  assert.equal(stored.has('axislab_email_registrations_v1'), false);
  assert.equal(stored.has('axislab_accounts_v2'), false);
  assert.equal(getSession(), null);

  // A current guest session is left alone
  const { session } = startGuestSession();
  purgeLegacyLocalAccounts();
  assert.equal(getSession()?.userId, session.userId);
});
