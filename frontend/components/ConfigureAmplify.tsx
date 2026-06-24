'use client'

import { Amplify } from 'aws-amplify'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '',
          scopes: ['email', 'openid'],
          redirectSignIn: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/auth/callback'],
          redirectSignOut: [process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL.replace('/auth/callback', '/') : 'http://localhost:3000/'],
          responseType: 'code'
        }
      }
    }
  }
}, { ssr: true })

export default function ConfigureAmplifyClientSide() {
  return null
}
