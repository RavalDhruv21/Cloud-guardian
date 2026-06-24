'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { loginUser, isValidEmail, getCurrentUser } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Redirect if already logged in
  useEffect(() => {
    const user = getCurrentUser()
    if (user) router.push('/dashboard')
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) return setError('Email is required')
    if (!isValidEmail(email)) return setError('Please enter a valid email address')
    if (!password) return setError('Password is required')

    setLoading(true)

    // Simulate network delay
    await new Promise(r => setTimeout(r, 800))

    const result = await loginUser(email, password)
    
    if (!result || !result.success) {
      if (result?.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
          // Stash the password temporarily so we can auto-login them after verification!
          sessionStorage.setItem('cg_temp_password', password)
          router.push(`/verify?email=${encodeURIComponent(email)}`)
          return
      }
      
      setError(result?.error || 'Invalid email or password.')
      setLoading(false)
      return
    }

    try {
        const { getUserProfile, updateUserProfile } = await import('@/lib/api')
        const data = await getUserProfile()
        
        let profile = data.profile
        // If the profile returned by DB has no email, create an initial one
        if (!profile || !profile.email) {
            const name = email.split('@')[0]
            const avatar_initials = name.slice(0, 2).toUpperCase()
            profile = { name, email, avatar_initials, aws_connected: false, connected_account_id: '' }
            await updateUserProfile(profile)
        }
        
        localStorage.setItem('cg_user_profile', JSON.stringify(profile))
        
        // Restore aws_connected state
        if (profile.aws_connected) {
            localStorage.setItem('aws_connected', 'true')
            localStorage.setItem('connected_account_id', profile.connected_account_id)
        }
    } catch (err) {
        console.error("Failed to sync profile from DB:", err)
        const name = email.split('@')[0]
        const avatar_initials = name.slice(0, 2).toUpperCase()
        localStorage.setItem('cg_user_profile', JSON.stringify({ name, email, avatar_initials }))
    }

    window.dispatchEvent(new Event('profile-updated'))
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 overflow-hidden relative" style={{ background: '#050B18', color: '#fff' }}>
      
      {/* ═══════════ ANIMATED BACKGROUND ═══════════ */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
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
          width: 500, height: 500, top: '-10%', left: '-5%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
          animation: 'float-orb 22s ease-in-out infinite',
        }} />
        <div className="absolute rounded-full" style={{
          width: 400, height: 400, bottom: '-10%', right: '-5%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)',
          animation: 'float-orb-reverse 26s ease-in-out infinite',
        }} />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-entrance">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-5 group">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white transition-transform group-hover:scale-105" style={{
              background: 'linear-gradient(135deg, #10B981, #059669)',
              boxShadow: '0 0 20px rgba(16,185,129,0.25)',
            }}>
              CG
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>Welcome back</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Sign in to your account</p>
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
            onClick={() => {
              const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
              const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
              const redirect = encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/auth/callback'}`)
              window.location.href = `https://${domain}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=email+openid&redirect_uri=${redirect}&identity_provider=Google`
            }}
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

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Email address
              </label>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>Password</label>
                <Link href="/forgot-password" className="text-xs hover:text-emerald-400 transition-colors" style={{ color: '#34D399' }}>
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glow-btn w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 mt-2"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Don't have an account?{' '}
          <Link href="/signup" className="font-semibold hover:text-emerald-400 transition-colors" style={{ color: '#34D399' }}>
            Create account
          </Link>
        </p>

      </div>
    </div>
  )
}