import React from 'react';
import { ArrowRight, Github, LogOut, MessageSquare, ShieldCheck, User } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Heading, Text } from '@astryxdesign/core/Text';
import { getAuthMode, type UserProfile, type UserSession } from '../data/platformStore';

const SIMULATOR_PREVIEW_SRC = '/media/axislab-simulator-preview.png';
const REPO_URL = 'https://github.com/madiwka1/Robot-ARM-Real-Physics-Based-Sim-';

interface LandingPageProps {
  session: UserSession | null;
  profile: UserProfile | null;
  onEnterSimulator: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenProfileModal: () => void;
  onOpenFeedbackModal: () => void;
}

/* Every figure below is measured; see README §11 "Benchmarking" for method and hardware. */
const KEY_RESULTS = [
  { value: '120 Hz', label: 'fixed-step physics', note: 'identical replays at any frame rate' },
  { value: '0.53 mm', label: 'mean IK error', note: 'Axis-6R, 10³ targets, 100% converged' },
  { value: '≤ 11', label: 'ARS iterations', note: 'to 100% ball-balance success, 3 robots' },
  { value: '0.04 ms', label: 'physics step', note: '≈195× real-time headroom' },
];

const EXPERIMENTS = [
  {
    tag: 'Exp. 1',
    title: 'Bottle Flip',
    badge: { label: 'dynamic release', variant: 'orange' as const },
    method: 'Throw found by headless search within rated joint speeds; two-collider ballasted bottle.',
    result: 'Released at 0.55 m, 2.6 m/s up, 8.4 rad/s; ≈330° in flight, lands upright. 8/8 at ±0.3° joint noise.',
  },
  {
    tag: 'Exp. 2',
    title: 'Ball Balance',
    badge: { label: 'closed-loop control', variant: 'green' as const },
    method: 'Plate end effector; wrist tilt rates as actions. ẍ = 5/7·g·θ, θ̇ = 1.05·a (third-order).',
    result: 'Linear ARS policy reaches 100% success in 6–11 iterations on Axis-6R, SO-101 and Koch v1.1.',
  },
  {
    tag: 'Exp. 3',
    title: 'Reach & Pick',
    badge: { label: 'reinforcement learning', variant: 'blue' as const },
    method: 'Gymnasium-style env, end-effector Δxyz actions via DLS IK, 5 cm Fetch success threshold.',
    result: 'Reach: best 62.5–100% success within 100 iterations. Pick & Lift: not yet solvable by a linear policy.',
  },
  {
    tag: 'Exp. 4',
    title: 'Demonstrations',
    badge: { label: 'imitation data', variant: 'purple' as const },
    method: 'Teleoperate by joints or IK gizmo; auto-sampled keyframes with object poses at every frame.',
    result: 'Exports axislab.demonstration.v1 JSON / 18-column CSV, ready for LeRobot-style training.',
  },
];

const ROBOTS = [
  ['Axis-6R', '6', '0.92 m', '48 V industrial drives', '0.53 mm'],
  ['SO-101 (LeRobot)', '5', '≈ 0.40 m', '12 V Feetech STS3215', '1.81 mm'],
  ['Koch v1.1', '5', '≈ 0.30 m', '12 V Dynamixel XL430/XL330', '0.89 mm'],
];

const EQUATIONS = [
  {
    name: 'Damped least-squares IK',
    eq: '(JᵀJ + λ²I) Δq = Jᵀe,   λ = 0.06 + min(0.12, 0.15‖eₚ‖)',
  },
  {
    name: 'Augmented Random Search update',
    eq: 'W ← W + α / (b·σ_R) · Σ_top-b (r⁺ₖ − r⁻ₖ) δₖ',
  },
  {
    name: 'Ball on a tilting plate (per axis)',
    eq: 'ẍ = (5/7) g θ,   θ̇ = ω_max · a,   ω_max = 60°/s',
  },
];

/** Section header in a paper style: "§2 Experiments". */
const SectionTitle: React.FC<{ index: string; title: string; kicker?: string }> = ({ index, title, kicker }) => (
  <VStack gap={1}>
    <span className="font-mono-tabular text-xs tracking-widest text-[var(--color-text-accent)]">
      §{index} {kicker ?? ''}
    </span>
    <Heading level={2}>{title}</Heading>
  </VStack>
);

const Figure: React.FC<{ src: string; alt: string; caption: string }> = ({ src, alt, caption }) => (
  <figure className="m-0 overflow-hidden rounded-[var(--radius-container)] border border-[var(--color-border)] bg-[var(--color-background-card)]">
    <img src={src} alt={alt} className="block h-auto w-full" loading="lazy" />
    <figcaption className="border-t border-[var(--color-border)] px-4 py-2.5">
      <Text type="supporting" color="secondary">
        {caption}
      </Text>
    </figcaption>
  </figure>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  session,
  profile,
  onEnterSimulator,
  onOpenAuth,
  onSignOut,
  onOpenProfileModal,
  onOpenFeedbackModal,
}) => {
  const cloud = getAuthMode() === 'cloud';

  return (
    <div
      className="min-h-screen bg-[var(--color-background-body)] text-[var(--color-text-primary)]"
      style={{
        // Faint engineering-paper grid
        backgroundImage:
          'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        backgroundPosition: '-1px -1px',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-background-body)]/90 backdrop-blur">
        <nav aria-label="Main" className="flex w-full items-center justify-between gap-4 px-6 py-4 lg:px-12">
          <HStack gap={3} align="center">
            <span className="font-mono-tabular text-sm font-semibold tracking-wide">AxisLab 6</span>
            <Badge label="browser-native robotics lab" variant="neutral" />
          </HStack>
          <HStack gap={2} align="center">
            <a href="#experiments" className="hidden text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] md:inline">
              Experiments
            </a>
            <a href="#methods" className="hidden px-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] md:inline">
              Methods
            </a>
            <a href="#privacy" className="hidden pr-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] md:inline">
              Privacy
            </a>
            {session && profile ? (
              <>
                <Button label={profile.displayName} variant="ghost" icon={<User size={14} />} onClick={onOpenProfileModal} />
                <Button label="Sign out" variant="ghost" icon={<LogOut size={14} />} onClick={onSignOut} />
              </>
            ) : (
              <Button label={cloud ? 'Sign in' : 'Continue as guest'} variant="secondary" onClick={onOpenAuth} />
            )}
            <Button label="Open simulator" variant="primary" icon={<ArrowRight size={14} />} onClick={onEnterSimulator} />
          </HStack>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero / abstract */}
        <section className="max-w-3xl py-20">
          <VStack gap={5}>
            <span className="font-mono-tabular text-xs tracking-widest text-[var(--color-text-accent)]">
              OPEN LAB · RAPIER3D · THREE.JS · REACT 19
            </span>
            <Heading level={1} type="display-2">
              A physics lab for robot arms, running in your browser.
            </Heading>
            <Text type="large" color="secondary">
              Teleoperate real open-source arms, record demonstrations, and train policies with reinforcement
              learning: deterministic 120 Hz rigid-body physics, measured kinematics, no install.
            </Text>
            <HStack gap={3} wrap="wrap">
              <Button label="Open live simulator" variant="primary" size="lg" icon={<ArrowRight size={16} />} onClick={onEnterSimulator} />
              {!session && (
                <Button label={cloud ? 'Sign in with Google or email' : 'Continue as guest'} variant="secondary" size="lg" onClick={onOpenAuth} />
              )}
            </HStack>
            {session && profile && (
              <Text type="supporting" color="secondary">
                Signed in as {profile.displayName}
                {session.provider === 'local' ? ' (guest, data stays in this browser)' : ''}.
              </Text>
            )}
          </VStack>
        </section>

        {/* Key results */}
        <section aria-label="Key results" className="grid gap-px overflow-hidden rounded-[var(--radius-container)] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-4">
          {KEY_RESULTS.map((r) => (
            <div key={r.label} className="bg-[var(--color-background-card)] p-5">
              <div className="font-mono-tabular text-3xl font-semibold tabular-nums">{r.value}</div>
              <Text type="label">{r.label}</Text>
              <div className="mt-1">
                <Text type="supporting" color="secondary">
                  {r.note}
                </Text>
              </div>
            </div>
          ))}
        </section>

        {/* Experiments */}
        <section id="experiments" className="scroll-mt-20 py-16">
          <VStack gap={6}>
            <SectionTitle index="1" kicker="EXPERIMENTS" title="Four experiments, one workbench" />
            <div className="grid gap-4 md:grid-cols-2">
              {EXPERIMENTS.map((e) => (
                <Card key={e.title} padding={5}>
                  <VStack gap={3}>
                    <HStack gap={2} align="center" justify="between">
                      <span className="font-mono-tabular text-xs text-[var(--color-text-secondary)]">{e.tag}</span>
                      <Badge label={e.badge.label} variant={e.badge.variant} />
                    </HStack>
                    <Heading level={3}>{e.title}</Heading>
                    <Text color="secondary">
                      <strong className="text-[var(--color-text-primary)]">Method.</strong> {e.method}
                    </Text>
                    <Text color="secondary">
                      <strong className="text-[var(--color-text-primary)]">Result.</strong> {e.result}
                    </Text>
                  </VStack>
                </Card>
              ))}
            </div>
            <Figure
              src={SIMULATOR_PREVIEW_SRC}
              alt="Simulator workbench with joint sliders, demonstration timeline, and power telemetry graph"
              caption="Fig. 1 — The live workbench: joint control, demonstration timeline, and per-joint power telemetry."
            />
          </VStack>
        </section>

        {/* Methods */}
        <section id="methods" className="scroll-mt-20 pb-16">
          <VStack gap={6}>
            <SectionTitle index="2" kicker="METHODS" title="Models and measurements" />
            <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <Card padding={5}>
                <VStack gap={4}>
                  <Heading level={3}>Governing equations</Heading>
                  {EQUATIONS.map((q) => (
                    <VStack key={q.name} gap={1}>
                      <Text type="label">{q.name}</Text>
                      <code className="block overflow-x-auto rounded-[var(--radius-element)] bg-[var(--color-background-muted)] px-3 py-2 font-mono-tabular text-sm">
                        {q.eq}
                      </code>
                    </VStack>
                  ))}
                </VStack>
              </Card>
              <Card padding={5}>
                <VStack gap={4}>
                  <Heading level={3}>Robot models</Heading>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-text-secondary)]">
                          {['Robot', 'DOF', 'Reach', 'Actuators', 'IK error (mean)'].map((h) => (
                            <th key={h} scope="col" className="py-2 pr-3 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="font-mono-tabular tabular-nums">
                        {ROBOTS.map((r) => (
                          <tr key={r[0]} className="border-b border-[var(--color-border)] last:border-0">
                            {r.map((cell, i) => (
                              <td key={i} className={`py-2 pr-3 ${i === 0 ? 'font-sans font-medium' : i === 3 ? '' : 'whitespace-nowrap'}`}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Text type="supporting" color="secondary">
                    Link lengths from the published SO-ARM100 and Koch v1.1 URDFs. Measured with Node 24 on a
                    Ryzen 7 7730U; full method in the README.
                  </Text>
                </VStack>
              </Card>
            </div>
          </VStack>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 pb-16">
          <VStack gap={6}>
            <SectionTitle index="3" kicker="PRIVACY" title="What we store, and what we don't" />
            <div className="grid gap-4 md:grid-cols-3">
              <Card padding={5}>
                <VStack gap={2}>
                  <HStack gap={2} align="center">
                    <ShieldCheck size={16} className="text-[var(--color-text-accent)]" />
                    <Heading level={3}>Sign-in</Heading>
                  </HStack>
                  <Text color="secondary">
                    Google or a one-time email link, with no passwords. Your email is held only by the sign-in provider
                    (Supabase Auth) and is never copied into app tables, shown to others, or used for marketing.
                  </Text>
                </VStack>
              </Card>
              <Card padding={5}>
                <VStack gap={2}>
                  <Heading level={3}>Your data</Heading>
                  <Text color="secondary">
                    A display name, simulator preferences, and work you choose to save. Row-level security means only
                    you can read your rows. Guest mode stores nothing outside this browser.
                  </Text>
                </VStack>
              </Card>
              <Card padding={5}>
                <VStack gap={2}>
                  <Heading level={3}>Your control</Heading>
                  <Text color="secondary">
                    Delete your account at any time from your profile; your profile and saved demonstrations are
                    erased and any feedback you sent is anonymized.
                  </Text>
                </VStack>
              </Card>
            </div>
          </VStack>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6">
          <Text type="supporting" color="secondary">
            AxisLab 6 · Rapier3D physics · Astryx design system
          </Text>
          <HStack gap={2}>
            <Button label="Feedback" variant="ghost" icon={<MessageSquare size={14} />} onClick={onOpenFeedbackModal} />
            <Button label="Source on GitHub" variant="ghost" icon={<Github size={14} />} href={REPO_URL} />
          </HStack>
        </div>
      </footer>
    </div>
  );
};
