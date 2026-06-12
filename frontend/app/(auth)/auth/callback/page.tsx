'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AuthCallbackPage() {
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

      const res = await fetch(`https://${domain}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId!,
          code,
          redirect_uri: redirect,
        }),
      })

      const tokens = await res.json()

      if (!tokens.access_token) {
        setStatus('Authentication failed — redirecting to login...')
        setTimeout(() => router.push('/login'), 2000)
        return
      }

      // Decode ID token to get user info
      const idToken = tokens.id_token
      const payload = JSON.parse(atob(idToken.split('.')[1]))

      const name = payload.name || payload.email.split('@')[0]
      const email = payload.email

      // Save to localStorage same as email/password login
      localStorage.setItem('cg_token', tokens.access_token)
      localStorage.setItem('cg_user', JSON.stringify({ name, email }))

      const existingProfile = JSON.parse(localStorage.getItem('cg_user_profile') || '{}')
      localStorage.setItem('cg_user_profile', JSON.stringify({
        ...existingProfile,
        name,
        email,
        avatar_initials: name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
      }))

      window.dispatchEvent(new Event('profile-updated'))

      setStatus('Signed in successfully! Redirecting...')
      router.push('/dashboard')

    } catch (err) {
      console.error('Auth callback error:', err)
      setStatus('Something went wrong — redirecting to login...')
      setTimeout(() => router.push('/login'), 2000)
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