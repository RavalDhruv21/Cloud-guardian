'use client'
import { useEffect } from 'react'
import Link from 'next/link'

/* ────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────── */

const stats = [
  { value: '$0',    label: 'Cost during beta' },
  { value: '15min', label: 'Metric collection' },
  { value: '<5s',   label: 'Auto-remediation' },
  { value: '100%',  label: 'AWS native' },
]

const steps = [
  { n: '01', title: 'Connect AWS',  desc: 'Run our CloudFormation template. Creates a read-only IAM role — done in 2 minutes.' },
  { n: '02', title: 'We monitor',   desc: 'Lambdas collect metrics every 15 min across EC2, RDS, S3, and billing data.' },
  { n: '03', title: 'AI detects',   desc: 'Groq AI analyses patterns and surfaces anomalies with plain-English explanations.' },
  { n: '04', title: 'You act',      desc: 'Get smart alerts via email. Security misconfigs are auto-reverted before damage.' },
]

const features = [
  { icon: '📊', title: 'Real-time metrics',       desc: 'CPU, memory, network, disk I/O — collected every 15 minutes from all your AWS resources via CloudWatch.' },
  { icon: '🧠', title: 'AI anomaly detection',    desc: "Not just 'CPU high' — our AI explains why it's happening, what caused it, and exactly what to do." },
  { icon: '🛡️', title: 'Auto-remediation',         desc: 'Security misconfigurations like open port 22 are automatically reverted in under 5 seconds.' },
  { icon: '💰', title: 'Cost optimizer',           desc: "Finds idle EC2s, unattached volumes, and unused IPs. Shows exactly how much you're wasting." },
  { icon: '📋', title: 'Weekly AI reports',        desc: 'Every Sunday — a plain-English infrastructure health report written by AI, delivered to your email.' },
  { icon: '🤖', title: 'Agent AI',                 desc: 'A live AI assistant that knows your entire AWS account. Ask anything — it answers with real data.' },
]

const plans = [
  {
    name: 'Free', price: '$0', period: 'forever', highlight: false,
    features: ['1 AWS account', '15-min metrics', '7-day history', 'Email alerts', 'Cost optimizer', '20 AI questions/day'],
    cta: 'Get started',
  },
  {
    name: 'Pro', price: '$12', period: '/ month', highlight: true,
    features: ['Up to 5 AWS accounts', '5-min metrics', 'Unlimited history', 'Slack + email alerts', 'Unlimited AI questions', 'Weekly PDF reports'],
    cta: 'Start free trial',
  },
  {
    name: 'Team', price: '$29', period: '/ month', highlight: false,
    features: ['Unlimited accounts', '1-min metrics', 'Multi-user access', 'Custom rules', 'Priority AI analysis', 'Dedicated support'],
    cta: 'Start free trial',
  },
]

/* ────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────── */

export default function LandingPage() {

  /* Scroll-triggered reveal */
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible')
      }),
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.animate-on-scroll, .animate-on-scroll-scale')
      .forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <main className="min-h-screen overflow-hidden" style={{ background: '#050B18', color: '#fff' }}>

      {/* ═══════════ ANIMATED BACKGROUND ═══════════ */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {/* Grid pattern */}
        <div className="absolute inset-0" style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          animation: 'grid-fade 8s ease-in-out infinite',
        }} />
        {/* Floating orbs */}
        <div className="absolute rounded-full" style={{
          width: 600, height: 600, top: '-10%', left: '10%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
          animation: 'float-orb 22s ease-in-out infinite',
        }} />
        <div className="absolute rounded-full" style={{
          width: 500, height: 500, top: '30%', right: '5%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)',
          animation: 'float-orb-reverse 26s ease-in-out infinite 3s',
        }} />
        <div className="absolute rounded-full" style={{
          width: 450, height: 450, bottom: '10%', left: '20%',
          background: 'radial-gradient(circle, rgba(129,140,248,0.05) 0%, transparent 70%)',
          animation: 'float-orb 20s ease-in-out infinite 6s',
        }} />
        <div className="absolute rounded-full" style={{
          width: 350, height: 350, top: '60%', right: '30%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.04) 0%, transparent 70%)',
          animation: 'float-orb-reverse 18s ease-in-out infinite 2s',
        }} />
        {/* Morphing accent blob */}
        <div className="absolute" style={{
          width: 300, height: 300, top: '15%', right: '20%',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.07), rgba(6,182,212,0.05))',
          animation: 'morph 15s ease-in-out infinite, float-orb 20s ease-in-out infinite',
          filter: 'blur(40px)',
        }} />
      </div>

      {/* ═══════════ NAVBAR ═══════════ */}
      <nav className="nav-glass fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #10B981, #059669)',
              boxShadow: '0 0 20px rgba(16,185,129,0.25)',
            }}>
              <span className="text-white text-xs font-bold">CG</span>
            </div>
            <span className="font-semibold text-white text-sm tracking-tight">Cloud Guardian</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm transition-colors"
              style={{ color: 'rgba(255,255,255,0.55)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="glow-btn text-sm text-white px-5 py-2 rounded-xl font-medium"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative pt-36 pb-24 px-6" style={{ zIndex: 1 }}>
        <div className="max-w-4xl mx-auto text-center">

          {/* Beta badge */}
          <div className="animate-on-scroll inline-flex items-center gap-2 rounded-full px-5 py-2 mb-8" style={{
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <div className="w-2 h-2 rounded-full" style={{
              background: '#10B981',
              boxShadow: '0 0 8px rgba(16,185,129,0.6)',
              animation: 'pulse-subtle 2s ease-in-out infinite',
            }} />
            <span className="text-xs font-medium" style={{ color: '#6EE7B7' }}>
              Beta — All Pro features free during testing
            </span>
          </div>

          {/* Heading */}
          <h1 className="animate-on-scroll text-5xl md:text-6xl font-extrabold leading-tight mb-7" style={{ letterSpacing: '-0.03em' }}>
            AI-powered guardian for your
            <br />
            <span className="gradient-text">AWS infrastructure</span>
          </h1>

          {/* Subtitle */}
          <p className="animate-on-scroll stagger-2 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Connect your AWS account and get intelligent anomaly detection,
            auto-remediation, cost optimization, and a live AI assistant —
            all in one dashboard.
          </p>

          {/* CTA row */}
          <div className="animate-on-scroll stagger-3 flex items-center justify-center gap-5 mb-5">
            <Link
              href="/signup"
              className="glow-btn text-sm text-white px-8 py-3.5 rounded-xl font-semibold"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              Get Started Free
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm flex items-center gap-1.5 transition-colors group"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              See how it works
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>

          <p className="animate-on-scroll stagger-4 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            No credit card required · Free forever
          </p>
        </div>

        {/* Hero glow beneath CTA */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[600px] h-[200px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(16,185,129,0.08) 0%, transparent 70%)' }}
        />
      </section>

      {/* ═══════════ STATS ═══════════ */}
      <section className="relative py-16 px-6" style={{ zIndex: 1 }}>
        <div className="section-divider max-w-4xl mx-auto mb-16" />
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`animate-on-scroll stagger-${i + 1} glass-card rounded-2xl px-6 py-5 text-center`}
            >
              <div className="text-2xl md:text-3xl font-bold gradient-text-emerald mb-1">{s.value}</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section id="how-it-works" className="relative py-24 px-6" style={{ zIndex: 1 }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="animate-on-scroll text-3xl md:text-4xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
              How it works
            </h2>
            <p className="animate-on-scroll stagger-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Up and running in under 5 minutes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-10 left-[12%] right-[12%] h-px" style={{
              background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.2), rgba(6,182,212,0.2), transparent)',
            }} />

            {steps.map((step, i) => (
              <div key={step.n} className={`animate-on-scroll stagger-${i + 1} relative text-center md:text-left`}>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4 relative" style={{
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.15)',
                }}>
                  <span className="text-sm font-bold" style={{ color: '#34D399' }}>{step.n}</span>
                  {/* Pulse dot on the connecting line */}
                  <div className="hidden md:block absolute -top-[1px] left-1/2 -translate-x-1/2 -translate-y-full w-2 h-2 rounded-full" style={{
                    background: '#10B981',
                    boxShadow: '0 0 10px rgba(16,185,129,0.5)',
                  }} />
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section className="relative py-24 px-6" style={{ zIndex: 1 }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="animate-on-scroll text-3xl md:text-4xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
              Everything your AWS account needs
            </h2>
            <p className="animate-on-scroll stagger-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              What Datadog charges $15/host/month for — free
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`animate-on-scroll stagger-${i + 1} glass-card glass-card-glow rounded-2xl p-7 group cursor-default`}
              >
                <div className="icon-glow w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-5"
                  style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)' }}
                >
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-white mb-2 group-hover:text-emerald-300 transition-colors">{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ ABOUT ═══════════ */}
      <section className="relative py-24 px-6" style={{ zIndex: 1 }}>
        <div className="section-divider max-w-3xl mx-auto mb-16" />
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="animate-on-scroll text-3xl md:text-4xl font-bold mb-8" style={{ letterSpacing: '-0.02em' }}>
            What is Cloud Guardian?
          </h2>

          <div className="animate-on-scroll stagger-1 glass-card rounded-3xl p-10 md:p-12 text-left space-y-5">
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Cloud Guardian is an AI-powered AWS infrastructure monitoring platform built for developers
              and small teams who want enterprise-level observability without enterprise-level complexity or cost.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              AWS CloudWatch tells you a number. <span className="text-white font-medium">Cloud Guardian tells you what that number means,
              why it happened, and what to do about it.</span> Built on top of CloudWatch using AWS Lambda,
              DynamoDB, and Groq AI — fully serverless, zero agents to install.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              This is what SRE teams at Google and Amazon build internally — now available as a free tool for everyone.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ PRICING ═══════════ */}
      <section className="relative py-24 px-6" style={{ zIndex: 1 }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-5">
            <h2 className="animate-on-scroll text-3xl md:text-4xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
              Simple pricing
            </h2>
            <p className="animate-on-scroll stagger-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              All plans include full Pro features during beta
            </p>
          </div>

          {/* Beta banner */}
          <div className="animate-on-scroll stagger-2 rounded-2xl px-6 py-3 text-center mb-12" style={{
            background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.15)',
          }}>
            <span className="text-sm font-medium" style={{ color: '#6EE7B7' }}>
              🎉 Beta period — every user gets Pro features completely free
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan, i) => (
              <div
                key={plan.name}
                className={`animate-on-scroll stagger-${i + 1} relative rounded-[22px] p-7 transition-all duration-500 ${
                  plan.highlight ? 'pricing-featured' : ''
                }`}
                style={{
                  background: plan.highlight
                    ? 'linear-gradient(160deg, rgba(16,185,129,0.12) 0%, rgba(5,11,24,0.95) 50%, rgba(6,182,212,0.08) 100%)'
                    : 'rgba(255,255,255,0.03)',
                  border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'linear-gradient(135deg, #10B981, #06B6D4)', color: '#fff' }}
                  >
                    Most popular
                  </div>
                )}

                <div className="text-xs font-semibold mb-2" style={{ color: plan.highlight ? '#6EE7B7' : 'rgba(255,255,255,0.35)' }}>
                  {plan.name}
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{plan.period}</span>
                </div>
                <div className="section-divider my-5" />

                <ul className="space-y-3 mb-7">
                  {plan.features.map(f => (
                    <li key={f} className="text-xs flex items-center gap-2.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      <span style={{ color: '#10B981' }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className={`block text-center text-xs py-3 rounded-xl font-semibold transition-all ${
                    plan.highlight ? 'glow-btn' : ''
                  }`}
                  style={{
                    background: plan.highlight
                      ? 'linear-gradient(135deg, #10B981, #059669)'
                      : 'rgba(255,255,255,0.06)',
                    color: plan.highlight ? '#fff' : 'rgba(255,255,255,0.7)',
                    border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="relative py-28 px-6" style={{ zIndex: 1 }}>
        <div className="max-w-3xl mx-auto text-center relative">
          {/* Background glow */}
          <div className="absolute inset-0 -z-10" style={{
            background: 'radial-gradient(ellipse 600px 300px at center, rgba(16,185,129,0.07) 0%, transparent 70%)',
          }} />

          <h2 className="animate-on-scroll text-3xl md:text-4xl font-bold mb-5" style={{ letterSpacing: '-0.02em' }}>
            Start monitoring your AWS account today
          </h2>
          <p className="animate-on-scroll stagger-1 text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Takes 5 minutes to connect. No agents. No credit card.
          </p>
          <Link
            href="/signup"
            className="animate-on-scroll stagger-2 glow-btn inline-block text-sm text-white px-10 py-4 rounded-xl font-semibold"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            Get Started Free
          </Link>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="relative px-6 py-10" style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        zIndex: 1,
      }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #10B981, #059669)',
            }}>
              <span className="text-white text-[10px] font-bold">CG</span>
            </div>
            <span className="text-sm font-medium text-white">Cloud Guardian</span>
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Built with AWS Lambda · DynamoDB · Groq AI · Next.js
          </div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            © 2025 Cloud Guardian
          </div>
        </div>
      </footer>

    </main>
  )
}