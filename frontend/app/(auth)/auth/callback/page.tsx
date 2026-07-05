'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'

function AuthCallbackInner() {
  const router = useRouter()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('code') && !params.get('error')) {
      setStatus('No auth code found — redirecting to login...')
      setTimeout(() => router.push('/login'), 2000)
      return
    }

    // Amplify intercepts the redirect and completes the OAuth code exchange
    // itself; we just wait for it to finish signing the user in.
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect') {
        syncSignedInUser()
      } else if (payload.event === 'signInWithRedirect_failure') {
        setStatus('Sign in failed — redirecting to login...')
        setTimeout(() => router.push('/login'), 3000)
      }
    })

    // In case Amplify already finished before this listener attached
    syncSignedInUser()

    return unsubscribe
  }, [])

  const syncSignedInUser = async () => {
    try {
      await getCurrentUser()
    } catch {
      // Not signed in yet — wait for the Hub event above
      return
    }

    try {
      const attrs = await fetchUserAttributes()
      const email = attrs.email || ''
      const name = attrs.name || attrs.given_name || email.split('@')[0] || 'User'

      document.cookie = `cg_session=true; path=/; max-age=${7 * 24 * 60 * 60}`

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
