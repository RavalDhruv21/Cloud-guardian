'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const steps = [
  {
    num: '01',
    title: 'Download CloudFormation template',
    desc: 'This template creates a read-only IAM role in your AWS account. It takes 2 minutes to run.'
  },
  {
    num: '02',
    title: 'Run it in your AWS Console',
    desc: 'Open AWS Console → CloudFormation → Create Stack → Upload the template file → Click Create.'
  },
  {
    num: '03',
    title: 'Paste your Role ARN',
    desc: 'After the stack is created, copy the Role ARN from the Outputs tab and paste it below.'
  },
]

export default function ConnectAWSPage() {
  const router = useRouter()
  const [roleArn, setRoleArn] = useState('')
  const [nickname, setNickname] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!roleArn.startsWith('arn:aws:iam::')) {
      setError('Invalid Role ARN format. Should start with arn:aws:iam::')
      return
    }
    setLoading(true)
    setError('')

    // Simulate connection — real API call added in Phase 6
    setTimeout(() => {
      setLoading(false)
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    }, 1500)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Connect AWS account</h1>
        <p className="text-xs text-gray-400 mt-0.5">Add a new AWS account to monitor</p>
      </div>

      {success ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-5xl mb-4">✅</div>
          <div className="text-sm font-semibold text-gray-900 mb-2">Account connected successfully!</div>
          <div className="text-xs text-gray-400">Redirecting to dashboard — first metrics will appear in 15 minutes</div>
        </div>
      ) : (
        <>
          {/* Steps */}
          <div className="flex flex-col gap-3 mb-6">
            {steps.map((step, i) => (
              <div key={step.num} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4">
                <div className="text-2xl font-bold flex-shrink-0" style={{color: '#e5e7eb'}}>{step.num}</div>
                <div>
                  <div className="text-sm font-medium text-gray-900 mb-1">{step.title}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{step.desc}</div>
                  {i === 0 && (
                    <button className="mt-3 text-xs px-3 py-1.5 rounded-lg text-white transition-colors" style={{background: '#0F6E56'}}>
                      Download template
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Enter connection details</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-600 mb-4">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Role ARN <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={roleArn}
                  onChange={e => setRoleArn(e.target.value)}
                  placeholder="arn:aws:iam::123456789012:role/CloudGuardianMonitorRole"
                  className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Account nickname
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="e.g. Production, Staging, Dev"
                  className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Primary region
                </label>
                <select
                  value={region}
                  onChange={e => setRegion(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-500"
                >
                  {['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1', 'ap-southeast-1'].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleConnect}
                disabled={loading || !roleArn}
                className="w-full py-2.5 rounded-lg text-white text-xs font-medium transition-all disabled:opacity-50"
                style={{background: '#0F6E56'}}
              >
                {loading ? 'Validating connection...' : 'Connect account'}
              </button>
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-400 text-center">
            🔒 We only request read-only access · You can disconnect anytime · IAM role costs nothing
          </div>
        </>
      )}
    </div>
  )
}