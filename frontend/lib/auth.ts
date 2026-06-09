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
export const getCurrentUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null
  try {
    const session = localStorage.getItem(SESSION_KEY)
    return session ? JSON.parse(session) : null
  } catch { return null }
}

// Check if email already registered
export const emailExists = (email: string): boolean => {
  return getUsers().some(u => u.email.toLowerCase() === email.toLowerCase())
}

// Register new user
export const registerUser = (name: string, email: string, password: string): AuthUser | null => {
  if (emailExists(email)) return null
  const users = getUsers()
  const newUser: AuthUser = {
    id: Date.now().toString(),
    name,
    email,
    createdAt: new Date().toISOString()
  }
  // Store user with hashed password (simple hash for demo)
  localStorage.setItem(USERS_KEY, JSON.stringify([
    ...users,
    { ...newUser, password: btoa(password) }
  ]))
  document.cookie = `cg_session=true; path=/; max-age=${7 * 24 * 60 * 60}`
  return newUser
}

// Login user
export const loginUser = (email: string, password: string): AuthUser | null => {
  const users = getUsers() as any[]
  const user = users.find(
    u => u.email.toLowerCase() === email.toLowerCase() &&
    u.password === btoa(password)
  )
  if (!user) return null
  const { password: _, ...userWithoutPassword } = user
  localStorage.setItem(SESSION_KEY, JSON.stringify(userWithoutPassword))
  // Set cookie for middleware
  document.cookie = `cg_session=true; path=/; max-age=${7 * 24 * 60 * 60}`
  return userWithoutPassword
}

// Logout
export const logoutUser = () => {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem('cg_user_profile')
  // Properly expire the cookie
  document.cookie = 'cg_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  window.location.href = '/'
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