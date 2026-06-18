import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Decode token to extract user ID
    const payloadBase64 = token.split('.')[1]
    const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf-8')
    const payload = JSON.parse(decodedPayload)

    const cookieStore = await cookies()
    cookieStore.set({
      name: 'cg_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    return NextResponse.json({ success: true, userId: payload.sub })
  } catch (error) {
    console.error('Session error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('cg_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated', userId: null }, { status: 401 })
    }

    const payloadBase64 = token.split('.')[1]
    const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf-8')
    const payload = JSON.parse(decodedPayload)

    return NextResponse.json({ success: true, userId: payload.sub })
  } catch (error) {
    console.error('Session decode error:', error)
    return NextResponse.json({ error: 'Invalid token', userId: null }, { status: 401 })
  }
}
