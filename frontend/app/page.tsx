import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen" style={{backgroundColor: '#f0f9f4'}}>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-700 flex items-center justify-center">
              <span className="text-white text-xs font-bold">CG</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">Cloud Guardian</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Login
            </Link>
            <Link href="/signup" className="text-sm bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-800 transition-colors">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6" style={{background: 'linear-gradient(180deg, #f0f9f4 0%, #ffffff 100%)'}}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-6">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs text-emerald-700 font-medium">Beta — All Pro features free during testing</span>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            AI-powered guardian for your
            <span className="text-emerald-700"> AWS infrastructure</span>
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Connect your AWS account and get intelligent anomaly detection, auto-remediation, cost optimization, and a live AI assistant — all in one dashboard.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/signup" className="bg-emerald-700 text-white px-8 py-3 rounded-lg font-medium hover:bg-emerald-800 transition-colors text-sm">
              Get Started Free
            </Link>
            <Link href="#how-it-works" className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1">
              See how it works →
            </Link>
          </div>
          <p className="text-xs text-gray-400 mt-4">No credit card required · Free forever</p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-gray-50 border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid grid-cols-4 gap-8 text-center">
            {[
              { value: '$0', label: 'Cost during beta' },
              { value: '15min', label: 'Metric collection interval' },
              { value: '< 5s', label: 'Auto-remediation speed' },
              { value: '100%', label: 'AWS native — no agents' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-bold text-emerald-700">{stat.value}</div>
                <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">How it works</h2>
            <p className="text-gray-500 text-sm">Up and running in under 5 minutes</p>
          </div>
          <div className="grid grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Connect AWS', desc: 'Run our CloudFormation template in your AWS account. Creates a read-only IAM role in 2 minutes.' },
              { step: '02', title: 'We monitor', desc: 'Our Lambdas collect metrics every 15 minutes across all your EC2, RDS, S3, and billing data.' },
              { step: '03', title: 'AI detects', desc: 'Groq AI analyzes patterns and detects anomalies with plain-English explanations — not just raw alerts.' },
              { step: '04', title: 'You get alerted', desc: 'Receive intelligent alerts via email. Security misconfigurations are auto-reverted before damage is done.' },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="text-4xl font-bold text-gray-100 mb-3">{item.step}</div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything your AWS account needs</h2>
            <p className="text-gray-500 text-sm">What Datadog charges $15/host/month for — free</p>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[
              { icon: '📊', title: 'Real-time metrics', desc: 'CPU, memory, network, disk I/O — collected every 15 minutes from all your AWS resources via CloudWatch.' },
              { icon: '🧠', title: 'AI anomaly detection', desc: 'Not just "CPU high" — our AI explains why it\'s happening, what caused it, and exactly what to do.' },
              { icon: '🛡️', title: 'Auto-remediation', desc: 'Security misconfigurations like open port 22 are automatically reverted in under 5 seconds. No human needed.' },
              { icon: '💰', title: 'Cost optimizer', desc: 'Finds idle EC2s, unattached volumes, and unused IPs. Shows exactly how much you\'re wasting per month.' },
              { icon: '📋', title: 'Weekly AI reports', desc: 'Every Sunday — a plain-English infrastructure health report written by AI, delivered to your email.' },
              { icon: '🤖', title: 'Agent AI', desc: 'A live AI assistant that knows your entire AWS account. Ask anything — it answers with your real data.' },
            ].map((feature) => (
              <div key={feature.title} className="bg-white rounded-xl p-6 border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all">
                <div className="text-2xl mb-3">{feature.icon}</div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">What is Cloud Guardian?</h2>
          <p className="text-gray-500 leading-relaxed text-sm mb-6">
            Cloud Guardian is an AI-powered AWS infrastructure monitoring platform built for developers and small teams who want enterprise-level observability without enterprise-level complexity or cost.
          </p>
          <p className="text-gray-500 leading-relaxed text-sm mb-6">
            AWS CloudWatch tells you a number. Cloud Guardian tells you what that number means, why it happened, and what to do about it. Built on top of CloudWatch using AWS Lambda, DynamoDB, and Groq AI — fully serverless, zero agents to install.
          </p>
          <p className="text-gray-500 leading-relaxed text-sm">
            This is what SRE teams at Google and Amazon build internally — now available as a free tool for everyone.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Simple pricing</h2>
            <p className="text-gray-500 text-sm">All plans include full Pro features during beta</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-3 text-center mb-10">
            <span className="text-sm text-emerald-700 font-medium">🎉 Beta period — every user gets Pro features completely free</span>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[
              {
                name: 'Free',
                price: '$0',
                period: 'forever',
                features: ['1 AWS account', '15-min metric collection', '7-day anomaly history', 'Email alerts', 'Cost optimizer', '20 AI questions/day'],
                cta: 'Get started',
                highlight: false,
              },
              {
                name: 'Pro',
                price: '$12',
                period: 'per month',
                features: ['Up to 5 AWS accounts', '5-min metric collection', 'Unlimited history', 'Slack + email alerts', 'Unlimited AI questions', 'Weekly PDF reports'],
                cta: 'Get started free',
                highlight: true,
              },
              {
                name: 'Team',
                price: '$29',
                period: 'per month',
                features: ['Unlimited AWS accounts', '1-min metric collection', 'Multi-user access', 'Custom remediation rules', 'Priority AI analysis', 'Dedicated support'],
                cta: 'Get started free',
                highlight: false,
              },
            ].map((plan) => (
              <div key={plan.name} className={`rounded-xl p-6 border ${plan.highlight ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-gray-100'}`}>
                <div className={`text-xs font-semibold mb-1 ${plan.highlight ? 'text-emerald-200' : 'text-gray-400'}`}>{plan.name}</div>
                <div className={`text-3xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>{plan.price}</div>
                <div className={`text-xs mb-6 ${plan.highlight ? 'text-emerald-200' : 'text-gray-400'}`}>{plan.period}</div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className={`text-xs flex items-center gap-2 ${plan.highlight ? 'text-emerald-100' : 'text-gray-500'}`}>
                      <span className={plan.highlight ? 'text-emerald-300' : 'text-emerald-600'}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className={`block text-center text-xs py-2.5 rounded-lg font-medium transition-colors ${plan.highlight ? 'bg-white text-emerald-700 hover:bg-emerald-50' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Start monitoring your AWS account today</h2>
          <p className="text-gray-500 text-sm mb-8">Takes 5 minutes to connect. No agents. No credit card.</p>
          <Link href="/signup" className="bg-emerald-700 text-white px-8 py-3 rounded-lg font-medium hover:bg-emerald-800 transition-colors text-sm">
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-700 flex items-center justify-center">
              <span className="text-white text-xs font-bold">CG</span>
            </div>
            <span className="text-sm font-medium text-gray-700">Cloud Guardian</span>
          </div>
          <div className="text-xs text-gray-400">Built with AWS Lambda · DynamoDB · Groq AI · Next.js</div>
          <div className="text-xs text-gray-400">© 2025 Cloud Guardian</div>
        </div>
      </footer>

    </main>
  )
}