import React, { useState } from 'react';
import { ArrowDown, CheckCircle2, Cpu, MessageSquare, Sliders } from 'lucide-react';
import {
  AVATAR_COLOR_OPTIONS,
  getInitials,
  isSupabaseConfigured,
  registerUserWithEmail,
  signInUserWithEmail,
  type UserProfile,
  type UserSession,
} from '../data/platformStore';

const HERO_IMAGE_SRC = '/src/assets/images/axislab_hero_arm_1794994281866.jpg';
const GRIPPER_IMAGE_SRC = '/src/assets/images/axislab_gripper_closeup_1794994281412.jpg';

interface LandingPageProps {
  session: UserSession | null;
  profile: UserProfile | null;
  simulatorSection: React.ReactNode;
  onAuthSuccess: (
    session: UserSession,
    profile: UserProfile,
    verificationEmailSent: boolean,
  ) => void;
  onSignOut: () => void;
  onOpenProfileModal: () => void;
  onOpenFeedbackModal: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  session,
  profile,
  simulatorSection,
  onAuthSuccess,
  onSignOut,
  onOpenProfileModal,
  onOpenFeedbackModal,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [gripperImgFailed, setGripperImgFailed] = useState(false);

  const [authTab, setAuthTab] = useState<'register' | 'signin'>('register');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const supabaseActive = isSupabaseConfigured();

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setStatusNotice(null);
    setSubmitting(true);
    try {
      if (authTab === 'register') {
        const res = await registerUserWithEmail({
          email,
          displayName,
        });
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
        setStatusNotice(
          res.verificationEmailSent
            ? `Registered ${res.session.email}. Check your inbox for the Supabase confirmation link to activate cross-device sync.`
            : `Registered ${res.session.email} and saved your display profile.`,
        );
        onAuthSuccess(res.session, res.profile, res.verificationEmailSent);
      } else {
        const res = await signInUserWithEmail({ email });
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
        setStatusNotice(
          res.verificationEmailSent
            ? `Sign-in link sent to ${res.session.email} via Supabase Auth.`
            : `Signed in as ${res.profile.displayName}.`,
        );
        onAuthSuccess(res.session, res.profile, res.verificationEmailSent);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const avatarColorMeta =
    AVATAR_COLOR_OPTIONS.find((c) => c.id === (profile?.avatarColor ?? 'amber')) ??
    AVATAR_COLOR_OPTIONS[0];

  return (
    <div className="min-h-screen bg-[#0d1015] text-[#e6eaf0] overflow-x-hidden">
      {/* Top Bar: 3-zone contract */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0d1015]/95 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            AxisLab 6
          </a>

          {/* Zone 2: Concise single-line section anchor links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300"
          >
            <a
              href="#simulator"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Simulator
            </a>
            <a
              href="#capabilities"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#register"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Register
            </a>
            <button
              type="button"
              onClick={onOpenFeedbackModal}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Feedback
            </button>
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center gap-3 shrink-0">
            {session && profile ? (
              <button
                type="button"
                onClick={onOpenProfileModal}
                aria-label="Customize Profile"
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-[#161b24] px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-[#1e2531] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold ${avatarColorMeta.bgClass} ${avatarColorMeta.textClass}`}
                >
                  {getInitials(profile.displayName, profile.email)}
                </span>
                <span className="max-w-[120px] truncate">{profile.displayName}</span>
              </button>
            ) : (
              <a
                href="#register"
                className="rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
              >
                Register
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* 1. Hero Section */}
        <section className="mx-auto max-w-[1440px] px-6 pt-10 pb-10 lg:pt-14 lg:pb-12">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            {/* Hero Copy */}
            <div className="flex flex-col justify-between gap-7 lg:col-span-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                  <span>Open Browser Playground</span>
                  <span aria-hidden="true">·</span>
                  <span>6-Axis Robotic Arm</span>
                  <span aria-hidden="true">·</span>
                  <span>Rapier3D Physics</span>
                </div>

                <h1
                  className="font-bold tracking-tight text-slate-100 [text-wrap:balance]"
                  style={{ fontSize: 'clamp(2.25rem, 3.6vw, 3.5rem)', lineHeight: 1.08 }}
                >
                  Control, experiment, and train a 6-DOF robotic arm directly on this page.
                </h1>

                <p className="max-w-xl text-base leading-relaxed text-slate-300">
                  AxisLab 6 puts an interactive 6-axis arm, rigid-body object grasping, live motor
                  power graphs, and demonstration export right below—open to everyone with zero
                  installation required.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <a
                  href="#simulator"
                  className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap"
                >
                  <span>Scroll to 3D Simulator</span>
                  <ArrowDown className="h-4 w-4" />
                </a>
                <a
                  href="#register"
                  className="text-sm font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                >
                  {session ? 'View Your Registration' : 'Register with Email'}
                </a>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="lg:col-span-6">
              <div className="h-full min-h-[290px] overflow-hidden rounded-lg border border-white/10 bg-[#12161d]">
                {!heroImgFailed ? (
                  <img
                    src={HERO_IMAGE_SRC}
                    alt="AxisLab 6 articulated 6-axis robotic arm mounted on an optical breadboard workbench with calibration cubes and test bottle"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#141923] to-[#0d1015] p-8 text-center">
                    <Cpu className="h-10 w-10 text-amber-400" />
                    <div className="text-sm font-semibold text-slate-200">
                      Axis-6R Interactive 3D Workspace
                    </div>
                    <p className="max-w-xs text-xs text-slate-400">
                      Scroll down to move joints, pick up objects, and record demonstrations.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-column Technical Metric Strip below hero split */}
          <div
            id="specifications"
            className="mt-10 grid grid-cols-2 gap-4 border-t border-b border-white/10 py-6 md:grid-cols-4"
          >
            <div className="space-y-1">
              <div className="font-mono-tabular text-2xl font-semibold text-slate-100">
                6-DOF
              </div>
              <div className="text-xs text-slate-400">
                Articulated FK & damped least-squares IK
              </div>
            </div>
            <div className="space-y-1">
              <div className="font-mono-tabular text-2xl font-semibold text-slate-100">
                48 V Bus
              </div>
              <div className="text-xs text-slate-400">
                Per-joint servo torque & wattage modeling
              </div>
            </div>
            <div className="space-y-1">
              <div className="font-mono-tabular text-2xl font-semibold text-slate-100">
                12.5 Hz
              </div>
              <div className="text-xs text-slate-400">
                Real-time power, joint & bottle-flip charts
              </div>
            </div>
            <div className="space-y-1">
              <div className="font-mono-tabular text-2xl font-semibold text-slate-100">
                JSON / CSV
              </div>
              <div className="text-xs text-slate-400">
                Timestamped trajectories & object poses
              </div>
            </div>
          </div>
        </section>

        {/* 2. Embedded Interactive 3D Simulator Section */}
        <section
          id="simulator"
          aria-label="Interactive 3D Robotics Simulator"
          className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6"
        >
          <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-medium text-amber-400">
                Interactive Workbench
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
                Live 6-DOF Simulator
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Drag canvas to orbit · click inside 3D view to zoom with wheel · press G/R for gizmo
            </p>
          </div>

          {simulatorSection}
        </section>

        {/* 3. Core Capabilities Bento Grid */}
        <section id="capabilities" className="mx-auto max-w-[1440px] px-6 py-12">
          <div className="mb-8 space-y-1.5">
            <div className="text-xs font-medium text-amber-400">
              Simulation Architecture
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              Built for hands-on kinematics testing and demonstration recording
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Capability 01 */}
            <article className="flex flex-col justify-between rounded-lg border border-white/10 bg-[#12161d] p-6 lg:col-span-2">
              <div className="space-y-3">
                <div className="text-xs font-mono-tabular text-slate-400">01</div>
                <h3 className="text-lg font-semibold text-slate-100">
                  Joint Control and 3D Direct End-Effector Manipulation
                </h3>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                  Drive J1 through J6 individually with degree-accurate sliders or switch to Direct
                  IK mode to drag and rotate the tool center point (TCP) in 3D space. Monitor
                  target versus actual position error in millimeters as joints hit reach limits.
                </p>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-4 text-xs">
                <div>
                  <div className="font-mono-tabular font-semibold text-slate-100">0.92 m</div>
                  <div className="text-slate-400">Max spherical reach</div>
                </div>
                <div>
                  <div className="font-mono-tabular font-semibold text-slate-100">±180°</div>
                  <div className="text-slate-400">Wrist & base sweep</div>
                </div>
                <div>
                  <div className="font-mono-tabular font-semibold text-slate-100">0 – 80 mm</div>
                  <div className="text-slate-400">Parallel-jaw stroke</div>
                </div>
              </div>
            </article>

            {/* Capability 02 with 4:3 photo */}
            <article className="flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#12161d] lg:row-span-2">
              <div className="aspect-[4/3] w-full overflow-hidden border-b border-white/10 bg-[#0b0e13]">
                {!gripperImgFailed ? (
                  <img
                    src={GRIPPER_IMAGE_SRC}
                    alt="Parallel-jaw robotic gripper holding translucent calibration bottle on optical table"
                    referrerPolicy="no-referrer"
                    onError={() => setGripperImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[#0d1015] text-xs text-slate-500">
                    Parallel-Jaw Grasp View
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-6 space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono-tabular text-slate-400">02</div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    Rigid-Body Grasping and Weighted Bottle Flip Physics
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-300">
                    Rapier3D simulates object mass, surface friction, and inherited linear/angular
                    release velocity. Practice precision pick-and-place or test dynamic wrist-flick
                    launches with an asymmetrically weighted test bottle.
                  </p>
                </div>
                <div className="border-t border-white/10 pt-3 text-xs text-slate-400">
                  Cubes · Cylinders · Spheres · Weighted Bottle · Receiving Tray
                </div>
              </div>
            </article>

            {/* Capability 03 */}
            <article className="flex flex-col justify-between rounded-lg border border-white/10 bg-[#12161d] p-6">
              <div className="space-y-3">
                <div className="text-xs font-mono-tabular text-slate-400">03</div>
                <h3 className="text-lg font-semibold text-slate-100">
                  Demonstration Timeline and Dataset Export
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">
                  Record keyframes automatically while teleoperating, scrub and relabel action
                  steps, loop playback at 0.5x–2.0x speed, and export structured JSON or CSV logs.
                </p>
              </div>
              <div className="mt-5 border-t border-white/10 pt-3 text-xs font-mono-tabular text-slate-400">
                Includes joint angles · TCP pose · gripper width · object snapshots
              </div>
            </article>

            {/* Capability 04 */}
            <article className="flex flex-col justify-between rounded-lg border border-white/10 bg-[#12161d] p-6">
              <div className="space-y-3">
                <div className="text-xs font-mono-tabular text-slate-400">04</div>
                <h3 className="text-lg font-semibold text-slate-100">
                  ROS 2 Hardware Bridge and Supabase Sync
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">
                  Stream joint commands to rosbridge_suite over WebSocket while saving public
                  registrations, display profiles, and feedback through Supabase.
                </p>
              </div>
              <div className="mt-5 border-t border-white/10 pt-3 text-xs font-mono-tabular text-slate-400">
                ws://localhost:9090 · Supabase Auth & RLS · Profile defaults
              </div>
            </article>
          </div>
        </section>

        {/* 4. Public Registration Section */}
        <section
          id="register"
          className="mx-auto max-w-[1440px] px-6 py-12 border-t border-white/10"
        >
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Left Explanation */}
            <div className="space-y-5 lg:col-span-5">
              <div className="text-xs font-medium text-amber-400">
                Open to Everyone
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
                Register with your email and display name
              </h2>
              <p className="text-sm leading-relaxed text-slate-300">
                AxisLab 6 is open to the general public—students, makers, hobbyists, researchers,
                and anyone curious to try a robotic arm. Enter just your email address and display
                name to save your profile preferences.
              </p>

              <ul className="space-y-3 border-t border-white/10 pt-5 text-sm text-slate-300">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    Quick public registration powered by Supabase Auth and our public email policy.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Sliders className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    Customize your avatar, display name, and preferred simulator control mode.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                  <span>
                    Share feedback anytime from the Feedback menu in the header or workbench.
                  </span>
                </li>
              </ul>
            </div>

            {/* Right Interactive Registration / Account Card */}
            <div className="lg:col-span-7">
              <div className="rounded-lg border border-white/10 bg-[#12161d] p-6 sm:p-8">
                {session && profile ? (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold ${avatarColorMeta.bgClass} ${avatarColorMeta.textClass}`}
                        >
                          {getInitials(profile.displayName, profile.email)}
                        </div>
                        <div>
                          <div className="text-base font-semibold text-slate-100">
                            {profile.displayName}
                          </div>
                          <div className="font-mono-tabular text-xs text-slate-400">
                            {profile.email}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-emerald-400">
                        {session.pendingEmailVerification ? 'Verification Email Sent' : 'Registered'}
                      </span>
                    </div>

                    {statusNotice && (
                      <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                        {statusNotice}
                      </div>
                    )}

                    {profile.bio && (
                      <p className="text-xs leading-relaxed text-slate-300">
                        {profile.bio}
                      </p>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                      <div className="rounded border border-white/10 bg-[#0d1015] p-3">
                        <div className="text-slate-400">Default Mode</div>
                        <div className="mt-1 font-medium text-slate-100">
                          {profile.defaultControlMode === 'ik'
                            ? 'Direct IK Manipulation'
                            : 'Joint Control (J1–J6)'}
                        </div>
                      </div>
                      <div className="rounded border border-white/10 bg-[#0d1015] p-3">
                        <div className="text-slate-400">Joint Axes Overlay</div>
                        <div className="mt-1 font-medium text-slate-100">
                          {profile.showJointAxesDefault ? 'Enabled on Start' : 'Hidden on Start'}
                        </div>
                      </div>
                      <div className="rounded border border-white/10 bg-[#0d1015] p-3">
                        <div className="text-slate-400">Storage Backend</div>
                        <div className="mt-1 font-medium text-slate-100">
                          {supabaseActive ? 'Supabase Auth + DB' : 'Local Store (Supabase Ready)'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={onOpenProfileModal}
                        className="rounded-md bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap cursor-pointer"
                      >
                        Customize Profile
                      </button>
                      <button
                        type="button"
                        onClick={onOpenFeedbackModal}
                        className="rounded-md border border-white/10 bg-[#1a202b] px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#232b3a] whitespace-nowrap cursor-pointer"
                      >
                        Send Feedback
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusNotice(null);
                          onSignOut();
                        }}
                        className="ml-auto rounded-md px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 whitespace-nowrap cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleAuthSubmit} className="space-y-4" noValidate>
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div className="flex items-center gap-1 rounded bg-[#0d1015] p-1 border border-white/10">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthTab('register');
                            setFormError(null);
                          }}
                          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            authTab === 'register'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Register
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthTab('signin');
                            setFormError(null);
                          }}
                          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            authTab === 'signin'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Sign In
                        </button>
                      </div>
                      <span className="text-xs text-slate-400">
                        {supabaseActive ? 'Supabase Connected' : 'Public Registration'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <label className="block space-y-1.5">
                        <span className="block text-xs font-medium text-slate-300">
                          Email Address
                        </span>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full rounded-md border border-white/15 bg-[#0d1015] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                        />
                      </label>

                      {authTab === 'register' && (
                        <label className="block space-y-1.5">
                          <span className="block text-xs font-medium text-slate-300">
                            Display Name
                          </span>
                          <input
                            type="text"
                            required
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Alex Rivera"
                            className="w-full rounded-md border border-white/15 bg-[#0d1015] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                          />
                        </label>
                      )}
                    </div>

                    {formError && (
                      <div
                        role="alert"
                        className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                      >
                        {formError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <span className="text-xs text-slate-400">
                        {supabaseActive
                          ? 'Stores your email via Supabase and sends a sign-in link.'
                          : 'Open to everyone — only your email and display name are needed.'}
                      </span>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="rounded-md bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        {submitting
                          ? 'Saving...'
                          : authTab === 'register'
                            ? 'Register with Email'
                            : 'Sign In with Email'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-white/10 bg-[#0b0e13]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-200">AxisLab 6</span>
            <span aria-hidden="true">·</span>
            <span>
              {supabaseActive
                ? 'Supabase Connected'
                : 'Supabase Schema Ready (Local Persistence Active)'}
            </span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#top" className="hover:text-slate-200 transition-colors">
              Top
            </a>
            <a href="#simulator" className="hover:text-slate-200 transition-colors">
              Simulator
            </a>
            <a href="#capabilities" className="hover:text-slate-200 transition-colors">
              Capabilities
            </a>
            <a href="#register" className="hover:text-slate-200 transition-colors">
              Register
            </a>
            <button
              type="button"
              onClick={onOpenFeedbackModal}
              className="hover:text-slate-200 transition-colors cursor-pointer"
            >
              Feedback
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
