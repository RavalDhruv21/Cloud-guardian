'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { confirmSignUp } from 'aws-amplify/auth'
import { loginUser } from '@/lib/auth'

function VerifyEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(emailParam)
    } else {
      router.push('/login')
    }
  }, [searchParams])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!code.trim()) return setError('Please enter the verification code')
    
    setLoading(true)

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: code.trim()
      })
      
      setSuccess(true)
      
      // Auto-login using the stashed password
      const tempPassword = sessionStorage.getItem('cg_temp_password')
      if (tempPassword) {
         const loginResult = await loginUser(email, tempPassword)
         if (loginResult && loginResult.success) {
            
            // Sync DynamoDB profile
            try {
                const { updateUserProfile } = await import('@/lib/api')
                // Try to get name from the email
                const name = email.split('@')[0]
                const avatar_initials = name.slice(0, 2).toUpperCase()
                const profile = { name, email, avatar_initials, aws_connected: false, connected_account_id: '' }
                await updateUserProfile(profile)
                localStorage.setItem('cg_user_profile', JSON.stringify(profile))
            } catch (err) {
                console.error("Failed to create profile in DB:", err)
            }
            
            window.dispatchEvent(new Event('profile-updated'))
            sessionStorage.removeItem('cg_temp_password')
            router.push('/connect-aws')
            return
         }
      }
      
      // If we couldn't auto-login, just send them to login page
      router.push('/login')
      
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 overflow-hidden relative" style={{ background: '#050B18', color: '#fff' }}>
      
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
          width: 500, height: 500, top: '-10%', left: '-5%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
          animation: 'float-orb 22s ease-in-out infinite',
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
          <h1 className="text-2xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>Verify your email</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
        </div>

        {/* Card */}
        <div className="auth-glass p-8">

          {error && (
            <div className="auth-error mb-5 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="auth-success mb-5 flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}>
              <span className="flex-shrink-0 mt-0.5">✅</span>
              <span>Email verified! Logging you in...</span>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Verification Code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="123456"
                className="dark-input tracking-widest text-center text-lg"
                maxLength={6}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="glow-btn w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 mt-2"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>
        </div>
        
        <p className="text-center text-sm mt-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Wrong email?{' '}
          <Link href="/signup" className="font-semibold hover:text-emerald-400 transition-colors" style={{ color: '#34D399' }}>
            Sign up again
          </Link>
        </p>

      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050B18' }}>
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    }>
      <VerifyEmailInner />
    </Suspense>
  )
}
