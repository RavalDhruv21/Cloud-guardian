'use client'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden relative" style={{ background: '#050B18', color: '#fff' }}>
      
      {/* ═══════════ ANIMATED BACKGROUND ═══════════ */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute inset-0" style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          animation: 'grid-fade 8s ease-in-out infinite',
        }} />
        <div className="absolute rounded-full" style={{
          width: 500, height: 500, top: '20%', right: '10%',
          background: 'radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 70%)',
          animation: 'float-orb 24s ease-in-out infinite',
        }} />
        <div className="absolute rounded-full" style={{
          width: 400, height: 400, bottom: '20%', left: '10%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
          animation: 'float-orb-reverse 20s ease-in-out infinite',
        }} />
      </div>

      <div className="w-full max-w-md relative z-10 text-center animate-entrance">
        <div className="text-8xl font-black mb-2" style={{
          background: 'linear-gradient(135deg, #EF4444, #F59E0B)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.05em'
        }}>
          404
        </div>
        <h1 className="text-2xl font-bold text-white mb-4" style={{ letterSpacing: '-0.02em' }}>
          Page not found
        </h1>
        <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.5)' }}>
          The page you're looking for doesn't exist or has been moved. Check the URL or return to the dashboard.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="glow-btn px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all w-full sm:w-auto"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all w-full sm:w-auto"
            style={{ 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  )
}
