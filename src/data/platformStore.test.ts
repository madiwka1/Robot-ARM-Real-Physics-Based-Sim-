import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMemoryPlatformStoreForTests,
  getInitials,
  getProfile,
  getSession,
  listFeedback,
  listPublicEmailRegistrations,
  recordPublicEmailRegistration,
  registerUserWithEmail,
  signInUserWithEmail,
  signOutUser,
  submitFeedback,
  updateProfile,
  validateDisplayName,
  validateEmail,
} from './platformStore';

beforeEach(() => {
  clearMemoryPlatformStoreForTests();
});

test('validateEmail and validateDisplayName enforce public registration input rules', () => {
  assert.equal(validateEmail('visitor@example.com'), true);
  assert.equal(validateEmail('not-an-email'), false);
  assert.equal(validateDisplayName('Alex Rivera'), true);
  assert.equal(validateDisplayName('A'), false);
  assert.equal(validateDisplayName('   '), false);
});

test('registerUserWithEmail registers public user with only email and display name', async () => {
  const missingName = await registerUserWithEmail({
    email: 'alex@example.com',
    displayName: ' ',
  });
  assert.equal(missingName.ok, false);

  const res = await registerUserWithEmail({
    email: 'Alex@Example.com',
    displayName: 'Alex Rivera',
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.session.email, 'alex@example.com');
  assert.equal(res.profile.displayName, 'Alex Rivera');
  assert.equal('roleTitle' in res.profile, false);
  assert.equal(getSession()?.userId, res.session.userId);
  assert.equal(getProfile(res.session.userId)?.displayName, 'Alex Rivera');

  const emails = listPublicEmailRegistrations();
  assert.equal(emails.length, 1);
  assert.equal(emails[0].email, 'alex@example.com');
  assert.equal(emails[0].displayName, 'Alex Rivera');

  // Duplicate signup is rejected cleanly
  const dup = await registerUserWithEmail({
    email: 'alex@example.com',
    displayName: 'Alex Rivera',
  });
  assert.equal(dup.ok, false);
});

test('signInUserWithEmail signs in registered public email and rejects unknown email', async () => {
  await registerUserWithEmail({
    email: 'sam@example.com',
    displayName: 'Sam Lee',
  });
  await signOutUser();
  assert.equal(getSession(), null);

  const missing = await signInUserWithEmail({
    email: 'nobody@example.com',
  });
  assert.equal(missing.ok, false);

  const good = await signInUserWithEmail({
    email: 'sam@example.com',
  });
  assert.equal(good.ok, true);
  assert.equal(getSession()?.email, 'sam@example.com');
});

test('updateProfile persists display name, bio, avatar color, and simulator defaults', async () => {
  const res = await registerUserWithEmail({
    email: 'custom@example.com',
    displayName: 'Initial Name',
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const updated = await updateProfile(res.session.userId, {
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

test('recordPublicEmailRegistration deduplicates emails cleanly', async () => {
  const first = await recordPublicEmailRegistration({
    email: 'team@example.org',
    displayName: 'Team Member',
  });
  const second = await recordPublicEmailRegistration({
    email: 'TEAM@example.org',
    displayName: 'Team Member',
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(listPublicEmailRegistrations().length, 1);
});
