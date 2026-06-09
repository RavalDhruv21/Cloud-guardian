'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const user = getCurrentUser()
    if (!user) {
      router.replace('/login')
    }
  }, [])

  return <>{children}</>
}