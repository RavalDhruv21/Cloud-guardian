'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setStatus('No auth code found — redirecting to login...')
      setTimeout(() => router.push('/login'), 2000)
      return
    }
    exchangeCode(code)
  }, [])

  const exchangeCode = async (code: string) => {
    try {
      const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
      const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
      const redirect = 'http://localhost:3000/auth/callback'

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId!,
        code,
        redirect_uri: redirect,
      })

        const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error('Token exchange failed:', errText)
        setStatus(`Token exchange failed: ${errText}`)
        setTimeout(() => router.push('/login'), 3000)
        return
      }

      const tokens = await res.json()
      console.log('Tokens received:', Object.keys(tokens))

      if (!tokens.access_token) {
        console.log('Token response:', tokens)
        setStatus(`No access token: ${tokens.error || 'unknown error'}`)
        setTimeout(() => router.push('/login'), 3000)
        return
      }

      // Decode ID token to get user info
      const idToken = tokens.id_token
      const payload = JSON.parse(atob(idToken.split('.')[1]))
      console.log('User payload:', payload)

      // Cognito sometimes puts email in different fields
      const email = payload.email || payload['cognito:username'] || payload.sub
      const name = payload.name || payload.given_name || email?.split('@')[0] || 'User'

      localStorage.setItem('cg_token', tokens.access_token)
      localStorage.setItem('cg_user', JSON.stringify({ name, email }))

      // Save session in same format as email/password login
      const googleUser = {
        id: payload.sub,
        name,
        email,
        createdAt: new Date().toISOString()
      }
      localStorage.setItem('cg_session', JSON.stringify(googleUser))
      // Set cookie so middleware allows dashboard access
      document.cookie = `cg_session=true; path=/; max-age=${7 * 24 * 60 * 60}`

      const existingProfile = JSON.parse(localStorage.getItem('cg_user_profile') || '{}')
      localStorage.setItem('cg_user_profile', JSON.stringify({
        ...existingProfile,
        name,
        email,
        avatar_initials: name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
      }))

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