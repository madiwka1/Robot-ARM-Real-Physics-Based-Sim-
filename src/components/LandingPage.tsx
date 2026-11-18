import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Cpu, MessageSquare, Sliders, User } from 'lucide-react';
import {
  AVATAR_COLOR_OPTIONS,
  getInitials,
  isSupabaseConfigured,
  registerUserWithEmail,
  ROLE_PRESETS,
  signInUserWithEmail,
  type UserProfile,
  type UserSession,
} from '../data/platformStore';

const HERO_IMAGE_SRC = '/src/assets/images/axislab_hero_arm_1794994281866.jpg';
const GRIPPER_IMAGE_SRC = '/src/assets/images/axislab_gripper_closeup_1794994281412.jpg';

interface LandingPageProps {
  session: UserSession | null;
  profile: UserProfile | null;
  onEnterSimulator: () => void;
  onAuthSuccess: (session: UserSession, profile: UserProfile) => void;
  onSignOut: () => void;
  onOpenProfileModal: () => void;
  onOpenFeedbackModal: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  session,
  profile,
  onEnterSimulator,
  onAuthSuccess,
  onSignOut,
  onOpenProfileModal,
  onOpenFeedbackModal,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [gripperImgFailed, setGripperImgFailed] = useState(false);

  const [authTab, setAuthTab] = useState<'register' | 'signin'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleTitle, setRoleTitle] = useState(ROLE_PRESETS[0]);
  const [organization, setOrganization] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justRegisteredEmail, setJustRegisteredEmail] = useState<string | null>(null);

  const supabaseActive = isSupabaseConfigured();

  const scrollToRegister = () => {
    const el = document.getElementById('register');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      if (authTab === 'register') {
        const res = await registerUserWithEmail({
          email,
          password,
          displayName,
          roleTitle,
          organization,
        });
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
        setJustRegisteredEmail(res.session.email);
        onAuthSuccess(res.session, res.profile);
      } else {
        const res = await signInUserWithEmail({ email, password });
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
        setJustRegisteredEmail(null);
        onAuthSuccess(res.session, res.profile);
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
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0d1015]/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-6">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            AxisLab 6
          </a>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300"
          >
            <a
              href="#capabilities"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#specifications"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Specifications
            </a>
            <a
              href="#register"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Registration
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
            {session ? (
              <button
                type="button"
                onClick={onEnterSimulator}
                className="rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Launch Simulator
              </button>
            ) : (
              <button
                type="button"
                onClick={scrollToRegister}
                className="rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Create Account
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* 1. Hero Section */}
        <section className="mx-auto max-w-7xl px-6 pt-12 pb-10 lg:pt-16 lg:pb-14">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            {/* Hero Copy */}
            <div className="flex flex-col justify-between gap-8 lg:col-span-6">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                  <span>Axis-6R Manipulation Lab</span>
                  <span aria-hidden="true">·</span>
                  <span>Rapier3D Physics</span>
                  <span aria-hidden="true">·</span>
                  <span>Browser Native WebGL</span>
                </div>

                <h1
                  className="font-bold tracking-tight text-slate-100 [text-wrap:balance]"
                  style={{ fontSize: 'clamp(2.25rem, 3.6vw, 3.5rem)', lineHeight: 1.08 }}
                >
                  Train and validate 6-DOF robotic arms directly in your browser.
                </h1>

                <p className="max-w-xl text-base leading-relaxed text-slate-300">
                  AxisLab 6 combines an articulated 6-axis manipulator, damped least-squares inverse
                  kinematics, rigid-body object grasping, live motor power telemetry, and JSON/CSV
                  demonstration export with zero local installation.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-5">
                {session ? (
                  <>
                    <button
                      type="button"
                      onClick={onEnterSimulator}
                      className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap cursor-pointer"
                    >
                      <span>Open 3D Laboratory</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onOpenProfileModal}
                      className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <User className="h-4 w-4 text-amber-400" />
                      <span>Customize Profile ({profile?.displayName ?? session.email})</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={scrollToRegister}
                      className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap cursor-pointer"
                    >
                      <span>Register with Email</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onEnterSimulator}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Launch Live Simulator</span>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Hero Visual */}
            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] overflow-hidden rounded-lg border border-white/10 bg-[#12161d]">
                {!heroImgFailed ? (
                  <img
                    src={HERO_IMAGE_SRC}
                    alt="AxisLab 6 articulated 6-axis robotic arm mounted on an optical breadboard workbench with calibration cubes and test bottle"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#141923] to-[#0d1015] p-8 text-center">
                    <Cpu className="h-10 w-10 text-amber-400" />
                    <div className="text-sm font-semibold text-slate-200">
                      Axis-6R Interactive 3D Workspace
                    </div>
                    <p className="max-w-xs text-xs text-slate-400">
                      Real-time Three.js + Rapier3D physics simulation ready to launch.
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

        {/* 2. Core Capabilities Bento Grid */}
        <section id="capabilities" className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-amber-400">
                Simulation Architecture
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
                Built for kinematics testing and demonstration collection
              </h2>
            </div>
            <button
              type="button"
              onClick={onEnterSimulator}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors self-start md:self-auto whitespace-nowrap cursor-pointer"
            >
              <span>Inspect live controls in simulator</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
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
                  Drive J1 through J6 individually with degree-accurate steppers or switch to
                  Direct IK mode to drag and rotate the tool center point (TCP) in 3D space.
                  Monitor target versus actual position error in millimeters as joints hit reach
                  or limit constraints.
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
                  ROS 2 Hardware Bridge and Supabase-Ready Accounts
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">
                  Stream joint commands to rosbridge_suite over WebSocket while saving operator
                  profiles, email registrations, and feedback using a Supabase-compatible store.
                </p>
              </div>
              <div className="mt-5 border-t border-white/10 pt-3 text-xs font-mono-tabular text-slate-400">
                ws://localhost:9090 · Public email policy · Profile defaults
              </div>
            </article>
          </div>
        </section>

        {/* 3. Registration & Account Conversion Section */}
        <section
          id="register"
          className="mx-auto max-w-7xl px-6 py-12 border-t border-white/10"
        >
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Left Explanation */}
            <div className="space-y-5 lg:col-span-5">
              <div className="text-xs font-medium text-amber-400">
                Production Account & Early Access
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
                Register with your email to save your lab profile
              </h2>
              <p className="text-sm leading-relaxed text-slate-300">
                Create an operator account to store your email in the public registration registry,
                customize your display profile and startup kinematics mode, and submit product
                feedback as AxisLab 6 connects to Supabase Auth.
              </p>

              <ul className="space-y-3 border-t border-white/10 pt-5 text-sm text-slate-300">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    Email registrations follow a dedicated Supabase public insert policy schema.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Sliders className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    Profile customization sets default control mode (Joint vs Direct IK) and axes.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                  <span>
                    Integrated feedback menu logs bug reports and feature requests cleanly.
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
                          <div className="text-xs text-slate-400">
                            {profile.roleTitle}
                            {profile.organization ? ` · ${profile.organization}` : ''}
                          </div>
                          <div className="font-mono-tabular text-xs text-slate-500">
                            {profile.email}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-emerald-400">
                        {justRegisteredEmail ? 'Registration Saved' : 'Signed In'}
                      </span>
                    </div>

                    {justRegisteredEmail && (
                      <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
                        Account created and <span className="font-mono-tabular">{justRegisteredEmail}</span> stored
                        in the registration registry. You can customize your profile or enter the
                        3D simulator now.
                      </div>
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
                        onClick={onEnterSimulator}
                        className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap cursor-pointer"
                      >
                        <span>Launch 3D Simulator</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={onOpenProfileModal}
                        className="rounded-md border border-white/10 bg-[#1a202b] px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-[#232b3a] whitespace-nowrap cursor-pointer"
                      >
                        Customize Profile
                      </button>
                      <button
                        type="button"
                        onClick={onSignOut}
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
                          Create Account
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
                        {supabaseActive ? 'Supabase Auth' : 'Supabase-Ready Email Auth'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5 sm:col-span-2">
                        <span className="block text-xs font-medium text-slate-300">
                          Work or Lab Email
                        </span>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="operator@roboticslab.org"
                          className="w-full rounded-md border border-white/15 bg-[#0d1015] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                        />
                      </label>

                      <label
                        className={`block space-y-1.5 ${
                          authTab === 'signin' ? 'sm:col-span-2' : ''
                        }`}
                      >
                        <span className="block text-xs font-medium text-slate-300">
                          Password
                        </span>
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Minimum 6 characters"
                          className="w-full rounded-md border border-white/15 bg-[#0d1015] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                        />
                      </label>

                      {authTab === 'register' && (
                        <>
                          <label className="block space-y-1.5">
                            <span className="block text-xs font-medium text-slate-300">
                              Display Name
                            </span>
                            <input
                              type="text"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder="Ada Vance"
                              className="w-full rounded-md border border-white/15 bg-[#0d1015] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                            />
                          </label>

                          <label className="block space-y-1.5">
                            <span className="block text-xs font-medium text-slate-300">
                              Role
                            </span>
                            <select
                              value={roleTitle}
                              onChange={(e) => setRoleTitle(e.target.value)}
                              className="w-full rounded-md border border-white/15 bg-[#0d1015] px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            >
                              {ROLE_PRESETS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block space-y-1.5">
                            <span className="block text-xs font-medium text-slate-300">
                              Organization / Lab (optional)
                            </span>
                            <input
                              type="text"
                              value={organization}
                              onChange={(e) => setOrganization(e.target.value)}
                              placeholder="Autonomous Manipulation Group"
                              className="w-full rounded-md border border-white/15 bg-[#0d1015] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                            />
                          </label>
                        </>
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
                        Emails are stored under the public registration policy.
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
                            : 'Sign In to AxisLab 6'}
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-200">AxisLab 6</span>
            <span aria-hidden="true">·</span>
            <span>
              {supabaseActive
                ? 'Supabase Connected'
                : 'Local Persistence Active (Supabase Schema Included)'}
            </span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#capabilities" className="hover:text-slate-200 transition-colors">
              Capabilities
            </a>
            <a href="#register" className="hover:text-slate-200 transition-colors">
              Registration
            </a>
            <button
              type="button"
              onClick={onOpenFeedbackModal}
              className="hover:text-slate-200 transition-colors cursor-pointer"
            >
              Send Feedback
            </button>
            <button
              type="button"
              onClick={onEnterSimulator}
              className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              Open Simulator
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
