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
  validateEmail,
  validatePassword,
} from './platformStore';

beforeEach(() => {
  clearMemoryPlatformStoreForTests();
});

test('validateEmail and validatePassword enforce basic input rules', () => {
  assert.equal(validateEmail('engineer@axislab.dev'), true);
  assert.equal(validateEmail('not-an-email'), false);
  assert.equal(validatePassword('secret123'), true);
  assert.equal(validatePassword('123'), false);
});

test('registerUserWithEmail creates account, public email registration, session, and customized profile', async () => {
  const res = await registerUserWithEmail({
    email: 'Ada@RoboticsLab.io',
    password: 'password123',
    displayName: 'Ada Vance',
    roleTitle: 'Controls & Kinematics Lead',
    organization: 'AxisLab Research',
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.session.email, 'ada@roboticslab.io');
  assert.equal(res.profile.displayName, 'Ada Vance');
  assert.equal(res.profile.organization, 'AxisLab Research');
  assert.equal(getSession()?.userId, res.session.userId);
  assert.equal(getProfile(res.session.userId)?.displayName, 'Ada Vance');

  const emails = listPublicEmailRegistrations();
  assert.equal(emails.length, 1);
  assert.equal(emails[0].email, 'ada@roboticslab.io');

  // Duplicate signup is rejected cleanly
  const dup = await registerUserWithEmail({
    email: 'ada@roboticslab.io',
    password: 'password123',
  });
  assert.equal(dup.ok, false);
});

test('signInUserWithEmail authenticates existing user and rejects wrong password', async () => {
  await registerUserWithEmail({
    email: 'dev@axislab.io',
    password: 'mypassword',
    displayName: 'Dev Operator',
  });
  signOutUser();
  assert.equal(getSession(), null);

  const bad = await signInUserWithEmail({
    email: 'dev@axislab.io',
    password: 'wrongpassword',
  });
  assert.equal(bad.ok, false);

  const good = await signInUserWithEmail({
    email: 'dev@axislab.io',
    password: 'mypassword',
  });
  assert.equal(good.ok, true);
  assert.equal(getSession()?.email, 'dev@axislab.io');
});

test('updateProfile persists display name, avatar color, and simulator defaults', async () => {
  const res = await registerUserWithEmail({
    email: 'custom@axislab.io',
    password: 'password123',
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const updated = await updateProfile(res.session.userId, {
    displayName: 'Kenji Sato',
    avatarColor: 'sky',
    defaultControlMode: 'ik',
    showJointAxesDefault: false,
    bio: 'Testing bottle-flip inertia.',
  });

  assert.ok(updated);
  assert.equal(updated.displayName, 'Kenji Sato');
  assert.equal(updated.avatarColor, 'sky');
  assert.equal(updated.defaultControlMode, 'ik');
  assert.equal(updated.showJointAxesDefault, false);
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
    email: 'pilot@axislab.io',
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
  const first = await recordPublicEmailRegistration({ email: 'team@lab.org' });
  const second = await recordPublicEmailRegistration({ email: 'TEAM@lab.org' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(listPublicEmailRegistrations().length, 1);
});
