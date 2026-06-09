'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { registerUser, isValidEmail, validatePassword, emailExists, getCurrentUser } from '@/lib/auth'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)

  // Redirect if already logged in
  useEffect(() => {
    const user = getCurrentUser()
    if (user) router.push('/dashboard')
  }, [])

  const checkStrength = (pass: string) => {
    let strength = 0
    if (pass.length >= 8) strength++
    if (/[A-Z]/.test(pass)) strength++
    if (/[0-9]/.test(pass)) strength++
    if (/[^A-Za-z0-9]/.test(pass)) strength++
    setPasswordStrength(strength)
  }

  const strengthColor = () => {
    if (passwordStrength <= 1) return '#EF4444' // Red
    if (passwordStrength === 2) return '#F59E0B' // Amber
    if (passwordStrength === 3) return '#3B82F6' // Blue
    return '#10B981' // Emerald
  }

  const strengthLabel = () => {
    if (passwordStrength <= 1) return 'Weak'
    if (passwordStrength === 2) return 'Fair'
    if (passwordStrength === 3) return 'Good'
    return 'Strong'
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validations
    if (!name.trim()) return setError('Full name is required')
    if (name.trim().length < 2) return setError('Name must be at least 2 characters')
    if (!isValidEmail(email)) return setError('Please enter a valid email address')
    if (emailExists(email)) return setError('An account with this email already exists. Please sign in instead.')

    const passError = validatePassword(password)
    if (passError) return setError(passError)

    if (password !== confirmPassword) return setError('Passwords do not match')

    setLoading(true)
    await new Promise(r => setTimeout(r, 800))

    const user = registerUser(name.trim(), email.toLowerCase(), password)
    if (!user) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    // Save to profile
    localStorage.setItem('cg_user_profile', JSON.stringify({
      name: user.name,
      email: user.email,
      avatar_initials: user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
      timezone: 'Asia/Kolkata',
      alert_email: true,
      alert_slack: false,
      aws_account_id: '',
      aws_role_arn: '',
      aws_region: 'us-east-1'
    }))

    // Auto login after signup
    localStorage.setItem('cg_session', JSON.stringify(user))

    router.push('/connect-aws')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden relative" style={{ background: '#050B18', color: '#fff' }}>
      
      {/* ═══════════ ANIMATED BACKGROUND ═══════════ */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute inset-0" style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          animation: 'grid-fade 8s ease-in-out infinite',
        }} />
        <div className="absolute rounded-full" style={{
          width: 500, height: 500, top: '-10%', right: '-5%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
          animation: 'float-orb 24s ease-in-out infinite',
        }} />
        <div className="absolute rounded-full" style={{
          width: 400, height: 400, bottom: '-10%', left: '-5%',
          background: 'radial-gradient(circle, rgba(129,140,248,0.06) 0%, transparent 70%)',
          animation: 'float-orb-reverse 20s ease-in-out infinite',
        }} />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-entrance">

        {/* Logo */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 mb-5 group">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white transition-transform group-hover:scale-105" style={{
              background: 'linear-gradient(135deg, #10B981, #059669)',
              boxShadow: '0 0 20px rgba(16,185,129,0.25)',
            }}>
              CG
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>Create your account</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Free forever · No credit card required</p>
        </div>

        {/* Beta banner */}
        <div className="rounded-xl px-4 py-3 text-center mb-6" style={{
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.2)',
        }}>
          <span className="text-xs font-medium" style={{ color: '#6EE7B7' }}>
            🎉 Beta — Full Pro features completely free
          </span>
        </div>

        {/* Card */}
        <div className="auth-glass p-8">

          {error && (
            <div className="auth-error mb-5 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Google button */}
          <button
            type="button"
            onClick={() => setError('Google sign-in requires Cognito setup — use email/password for now')}
            className="google-btn mb-6"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.53H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.49a4.8 4.8 0 0 1 0-3l-2.67-2.07a8 8 0 0 0 0 7.13l2.67-2.06z"/>
              <path fill="#EA4335" d="M8.98 4.72c1.2 0 2.26.41 3.1 1.22l2.3-2.3A8 8 0 0 0 1.83 5.42L4.5 7.49a4.77 4.77 0 0 1 4.48-2.77z"/>
            </svg>
            Continue with Google
          </button>

          <div className="auth-divider mb-6">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>or</span>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>Full name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ravi Sharma"
                className="dark-input"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="dark-input"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); checkStrength(e.target.value) }}
                  placeholder="Min. 8 characters"
                  className="dark-input pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {password && (
                <div className="mt-2 animate-entrance" style={{ animationDuration: '0.3s' }}>
                  <div className="flex gap-1 mb-1.5">
                    {[1,2,3,4].map(i => (
                      <div
                        key={i}
                        className="flex-1 h-1 rounded-full transition-all duration-300"
                        style={{ background: i <= passwordStrength ? strengthColor() : 'rgba(255,255,255,0.1)' }}
                      />
                    ))}
                  </div>
                  <div className="text-xs font-medium" style={{ color: strengthColor() }}>
                    {strengthLabel()} password
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="dark-input pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                >
                  {showConfirm ? '🙈' : '👁'}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <div className="text-xs text-red-400 mt-1.5 animate-entrance" style={{ animationDuration: '0.3s' }}>Passwords do not match</div>
              )}
              {confirmPassword && password === confirmPassword && confirmPassword.length > 0 && (
                <div className="text-xs mt-1.5 animate-entrance" style={{ color: '#34D399', animationDuration: '0.3s' }}>✓ Passwords match</div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glow-btn w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 mt-4"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>

            <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
              By signing up you agree to our Terms of Service and Privacy Policy
            </p>
          </form>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold hover:text-emerald-400 transition-colors" style={{ color: '#34D399' }}>
            Sign in
          </Link>
        </p>

      </div>
    </div>
  )
}