'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth'

function AuthCallbackInner() {
  const router = useRouter()
  const [status, setStatus] = useState('Processing secure authentication...')

  useEffect(() => {
    handleAmplifyCallback()
  }, [])

  const handleAmplifyCallback = async () => {
    try {
      // Amplify automatically intercepts the ?code= parameter and exchanges it in the background.
      // We just need to wait until the session is fully established.
      let session;
      for (let i = 0; i < 15; i++) {
        try {
          session = await fetchAuthSession()
          if (session.tokens?.accessToken) break;
        } catch { }
        // Poll every 400ms while Amplify negotiates the OAuth exchange
        await new Promise(r => setTimeout(r, 400))
      }

      if (!session?.tokens?.accessToken) {
        setStatus('Authentication timed out or failed. Redirecting to login...')
        setTimeout(() => router.push('/login'), 3000)
        return
      }

      // ── Retrieve User Identity ──
      const attrs = await fetchUserAttributes()
      const email = attrs.email || ''
      const name = attrs.name || attrs.given_name || email.split('@')[0] || 'User'

      // ── UI Caching ──
      localStorage.setItem('cg_user', JSON.stringify({ name, email }))
      
      const googleUser = {
        id: session.tokens.accessToken.payload.sub?.toString() || '',
        name,
        email,
        createdAt: new Date().toISOString()
      }
      localStorage.setItem('cg_session', JSON.stringify(googleUser))
      document.cookie = `cg_session=true; path=/; max-age=${7 * 24 * 60 * 60}`

      // ── Fetch or Create Profile ──
      try {
        const { getUserProfile, updateUserProfile } = await import('@/lib/api')
        const data = await getUserProfile()
        
        let profile = data.profile
        if (!profile || !profile.email) {
            const avatar_initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
            profile = { name, email, avatar_initials, aws_connected: false, connected_account_id: '' }
            await updateUserProfile(profile)
        }
        
        localStorage.setItem('cg_user_profile', JSON.stringify(profile))
        
        if (profile.aws_connected) {
            localStorage.setItem('aws_connected', 'true')
            localStorage.setItem('connected_account_id', profile.connected_account_id)
        }
      } catch (err) {
        console.error("Failed to sync profile from DB:", err)
        const avatar_initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
        localStorage.setItem('cg_user_profile', JSON.stringify({ name, email, avatar_initials }))
      }

      window.dispatchEvent(new Event('profile-updated'))
      setStatus('Signed in! Redirecting to dashboard...')
      router.push('/dashboard')

    } catch (err) {
      console.error('Auth callback error:', err)
      setStatus(`Error: ${err}`)
      setTimeout(() => router.push('/login'), 3000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#050B18' }}>
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"
          style={{ boxShadow: '0 0 15px rgba(16,185,129,0.2)' }} />
        <div className="text-sm text-white/60">{status}</div>
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050B18' }}>
        <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  )
}