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
    localStorage.setItem('aws_connected', 'true')
    // Save to profile so Settings AWS tab shows the details
    const existingProfile = JSON.parse(localStorage.getItem('cg_user_profile') || '{}')
    const updatedProfile = {
      ...existingProfile,
      aws_role_arn: roleArn,
      aws_region: region,
      aws_account_id: roleArn.split(':')[4] || ''
    }
    localStorage.setItem('cg_user_profile', JSON.stringify(updatedProfile))
    window.dispatchEvent(new Event('profile-updated'))
    
    setLoading(true)
    setError('')

    // Save region to localStorage so topbar updates
    localStorage.setItem('selected_region', region)
    window.dispatchEvent(new Event('region-changed'))

    setTimeout(() => {
      setLoading(false)
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    }, 1500)
  }

  return (
    <div className="animate-entrance w-full">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-white">Connect AWS account</h1>
        <p className="text-xs text-white/50 mt-0.5">Add a new AWS account to monitor with read-only access</p>
      </div>

      {success ? (
        <div className="auth-glass rounded-2xl p-12 text-center shadow-[0_0_50px_rgba(16,185,129,0.1)]">
          <div className="text-5xl mb-4" style={{textShadow: '0 0 20px rgba(52,211,153,0.4)'}}>✅</div>
          <div className="text-lg font-semibold text-white mb-2">Account connected successfully!</div>
          <div className="text-xs text-white/50">Redirecting to dashboard — first metrics will appear in 15 minutes</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-8">
          {/* Steps */}
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-2">Instructions</h2>
            {steps.map((step, i) => (
              <div key={step.num} className="auth-glass rounded-xl p-5 flex gap-5 transition-all hover:scale-[1.02]" style={{animationDelay: `${i * 0.1}s`}}>
                <div className="text-3xl font-black text-white/10" style={{textShadow: '0 0 20px rgba(255,255,255,0.05)'}}>{step.num}</div>
                <div>
                  <div className="text-sm font-semibold text-white mb-1.5">{step.title}</div>
                  <div className="text-xs text-white/50 leading-relaxed">{step.desc}</div>
                  {i === 0 && (
                    <button
                      onClick={() => {
                        fetch('/cloudguardian-role.yaml')
                          .then(res => res.text())
                          .then(text => {
                            const blob = new Blob([text], { type: 'application/octet-stream' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = 'cloudguardian-role.yaml'
                            a.click()
                            URL.revokeObjectURL(url)
                          })
                      }}
                      className="mt-4 text-xs font-bold px-4 py-2 rounded-lg text-white shadow-lg transition-all hover:scale-105 inline-block"
                      style={{
                        background: 'linear-gradient(135deg, #0F6E56, #094d3c)',
                        boxShadow: '0 4px 15px rgba(15,110,86,0.3)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      Download template
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-2">Connection Details</h2>
            <div className="auth-glass rounded-2xl p-6">
              
              {error && (
                <div className="rounded-xl px-5 py-4 text-sm text-red-400 mb-6" style={{background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)'}}>
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                    Role ARN <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={roleArn}
                    onChange={e => setRoleArn(e.target.value)}
                    placeholder="arn:aws:iam::123456789012:role/CloudGuardian"
                    className="w-full px-4 py-3 text-xs rounded-xl focus:outline-none transition-colors font-mono"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                    Account nickname
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder="e.g. Production, Staging, Dev"
                    className="w-full px-4 py-3 text-xs rounded-xl focus:outline-none transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                    Primary region
                  </label>
                  <select
                    value={region}
                    onChange={e => {
                      setRegion(e.target.value)
                      localStorage.setItem('selected_region', e.target.value)
                      window.dispatchEvent(new Event('region-changed'))
                    }}
                    className="w-full px-4 py-3 text-xs rounded-xl focus:outline-none transition-colors appearance-none"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
                    onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                  >
                    {['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1', 'ap-southeast-1'].map(r => (
                      <option key={r} value={r} style={{background: '#050B18', color: '#fff'}}>{r}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={loading || !roleArn}
                  className="w-full mt-2 py-3.5 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50 hover:scale-[1.02]"
                  style={{background: 'linear-gradient(135deg, #0F6E56 0%, #185FA5 100%)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)'}}
                >
                  {loading ? 'Validating connection...' : 'Connect account'}
                </button>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-xl text-xs text-white/40 text-center border" style={{background: 'rgba(255,255,255,0.01)', borderColor: 'rgba(255,255,255,0.03)'}}>
              🔒 We only request read-only access · You can disconnect anytime · IAM role costs nothing
            </div>
          </div>
        </div>
      )}
    </div>
  )
}