'use client'

import { Amplify } from 'aws-amplify'
// Side-effect import: registers the listener that completes an in-flight
// OAuth redirect (exchanges the ?code=... for tokens). Without this,
// signInWithRedirect() never resolves and getCurrentUser() hangs forever
// on the callback page.
import 'aws-amplify/auth/enable-oauth-listener'

const signInRedirect = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/auth/callback'
const signOutRedirect = signInRedirect.replace(/\/auth\/callback\/?$/, '')

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '',
          scopes: ['email', 'openid'],
          redirectSignIn: [signInRedirect],
          redirectSignOut: [signOutRedirect],
          responseType: 'code',
        }
      }
    }
  }
}, { ssr: true })

export default function ConfigureAmplifyClientSide() {
  return null
}
