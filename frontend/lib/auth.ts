export interface AuthUser {
  id: string
  name: string
  email: string
  createdAt: string
}

const USERS_KEY = 'cg_users'
const SESSION_KEY = 'cg_session'

// Get all registered users
export const getUsers = (): AuthUser[] => {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]')
  } catch { return [] }
}

// Get current logged in user
export const getCurrentUser = (): any | null => {
  if (typeof window === 'undefined') return null
  try {
    // With Cognito, we rely on the token or the profile existing
    const token = localStorage.getItem('cg_token')
    const profile = localStorage.getItem('cg_user_profile')
    if (token && profile) return JSON.parse(profile)
    
    // Fallback for Google auth which sets cg_session
    const session = localStorage.getItem(SESSION_KEY)
    return session ? JSON.parse(session) : null
  } catch { return null }
}

// Check if email already registered
export const emailExists = (email: string): boolean => {
  return getUsers().some(u => u.email.toLowerCase() === email.toLowerCase())
}

import { signUp, signIn, fetchAuthSession, signOut } from 'aws-amplify/auth'

// Register new user (Now using AWS Cognito)
export const registerUser = async (name: string, email: string, password: string) => {
  try {
    const response = await signUp({
      username: email,
      password,
      options: {
        userAttributes: { email, name }
      }
    })
    return { success: true, response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Signup failed' }
  }
}

// Login user (Now using AWS Cognito)
export const loginUser = async (email: string, password: string): Promise<any> => {
  try {
    const { isSignedIn, nextStep } = await signIn({ username: email, password })
    if (!isSignedIn) return { success: false, error: 'Additional steps required.', nextStep }

    // Fetch the real tokens
    const session = await fetchAuthSession()
    if (session.tokens?.accessToken) {
      localStorage.setItem('cg_token', session.tokens.accessToken.toString())
    }

    // Set cookie for middleware
    document.cookie = `cg_session=true; path=/; max-age=${7 * 24 * 60 * 60}`
    
    // We will let the login page fetch the profile and handle `cg_user_profile` setting
    return { success: true }
  } catch (error: any) {
    if (error.message === 'There is already a signed in user.') {
        // Automatically clear the stuck session and try again
        await signOut()
        return loginUser(email, password)
    }
    return { success: false, error: error.message || 'Invalid email or password.' }
  }
}

// Logout
export const logoutUser = async () => {
  if (typeof window === 'undefined') return
  await clearSession()
  window.location.href = '/'
}

// Switch account — clears session and goes straight to login
export const switchAccount = async () => {
  if (typeof window === 'undefined') return
  await clearSession()
  window.location.href = '/login'
}

// Shared session cleanup
const clearSession = async () => {
  try {
    await signOut()
  } catch (e) {
    console.error("Sign out error", e)
  }
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('cg_user_profile')
  localStorage.removeItem('aws_connected')
  localStorage.removeItem('connected_account_id')
  localStorage.removeItem('cg_token')
  localStorage.removeItem('cg_user')
  // Properly expire the cookie
  document.cookie = 'cg_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

// Validate email format
export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Validate password strength
export const validatePassword = (password: string): string | null => {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
  return null
}