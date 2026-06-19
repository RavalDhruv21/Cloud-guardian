'use client'
import { useState, useRef, useEffect } from 'react'
import { getMetrics, getAnomalies, getCostSuggestions } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export default function AgentAIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [contextLoading, setContextLoading] = useState(true)
  const [accountContext, setAccountContext] = useState('')
  const [contextChips, setContextChips] = useState<any[]>([])
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    loadContext()
  }, [])

  const loadContext = async () => {
    setContextLoading(true)
    try {
      const [m, a, c] = await Promise.all([
        getMetrics(),
        getAnomalies(),
        getCostSuggestions()
      ])

      const metrics = m.metrics || []
      const anomalies = a.anomalies || []
      const costs = c.suggestions || []
      const unresolved = anomalies.filter((x: any) => !x.resolved)
      const instances = [...new Set(metrics.map((x: any) => x.instance_id))]
      const region = typeof window !== 'undefined'
        ? localStorage.getItem('selected_region') || 'us-east-1'
        : 'us-east-1'

      const totalSavings = costs.reduce((sum: number, x: any) => {
        const amt = parseFloat(x.estimated_saving?.replace('$', '').replace('/mo', '') || '0')
        return sum + (isNaN(amt) ? 0 : amt)
      }, 0)

      // Build context chips for display (Dark mode adapted colors)
      setContextChips([
        { label: `${instances.length} EC2 instances`, color: '#34D399', bg: 'rgba(16,185,129,0.15)' },
        { label: `${unresolved.length} anomalies`, color: unresolved.length > 0 ? '#F87171' : '#34D399', bg: unresolved.length > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(16,185,129,0.15)' },
        { label: `$${totalSavings.toFixed(0)} savings found`, color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
        { label: `Region: ${region}`, color: '#60A5FA', bg: 'rgba(59,130,246,0.15)' },
      ])

      // Build context string for AI
      const instanceDetails = instances.map(id => {
        const instanceMetrics = metrics.filter((x: any) => x.instance_id === id)
        const latest = instanceMetrics[0]
        const cpu = parseFloat(latest?.cpu_avg || 0)
        return `${id} (CPU: ${cpu.toFixed(1)}%)`
      }).join(', ')

      const anomalyDetails = unresolved.length > 0
        ? unresolved.map((a: any) => `${a.instance_id}: ${a.summary}`).join('; ')
        : 'none'

      const resolvedAnomalies = anomalies.filter((x: any) => x.resolved)
      const pastAnomaliesDetails = resolvedAnomalies.length > 0
        ? resolvedAnomalies.slice(0, 5).map((a: any) => `${a.instance_id}: ${a.summary} (Resolved)`).join('; ')
        : 'none recently'

      const costDetails = costs.length > 0
        ? costs.map((c: any) => `${c.resource_id}: ${c.estimated_saving}`).join('; ')
        : 'none identified'

      const ctx = `
- EC2 instances monitored (Current State): ${instances.length > 0 ? instanceDetails : 'none yet'}
- Unresolved anomalies (Active Issues): ${anomalyDetails}
- Past anomalies (Historical Context): ${pastAnomaliesDetails}
- Cost optimization opportunities: ${costDetails} — total $${totalSavings.toFixed(0)}/mo
- Account ID: ${process.env.NEXT_PUBLIC_AWS_ACCOUNT_ID || 'connected'}
- Region: ${region}`

      setAccountContext(ctx)

      // Set initial greeting with real data
      const greeting = instances.length > 0
        ? `Hi! I'm your Cloud Guardian AI assistant. Here's your current AWS account status:\n\n• **${instances.length} EC2 instance${instances.length > 1 ? 's' : ''}** monitored: ${instanceDetails}\n• **${unresolved.length} unresolved anomal${unresolved.length === 1 ? 'y' : 'ies'}**${unresolved.length > 0 ? ': ' + unresolved[0].summary : ' — all clear'}\n• **$${totalSavings.toFixed(0)}/month** in potential savings${costs.length > 0 ? ` across ${costs.length} resources` : ''}\n\nWhat would you like to know?`
        : `Hi! I'm your Cloud Guardian AI assistant. Your AWS account is connected but no metrics have been collected yet — metrics are gathered every 15 minutes from running EC2 instances.\n\nI can still answer general AWS questions or help you understand your infrastructure. What would you like to know?`

      setMessages([{
        role: 'assistant',
        content: greeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])

    } catch (err) {
      setAccountContext('AWS account connected')
      setContextChips([
        { label: 'Account connected', color: '#34D399', bg: 'rgba(16,185,129,0.15)' }
      ])
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm your Cloud Guardian AI assistant. I'm having trouble fetching your live data right now, but I can still answer questions about your AWS infrastructure. What would you like to know?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
    } finally {
      setContextLoading(false)
    }
  }

  const handleSendWithText = async (text: string) => {
    if (!text.trim() || loading || contextLoading) return
    setLoading(true)

    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      const systemPrompt = `You are Cloud Guardian AI — an expert AWS infrastructure assistant.
You have real-time context of the user's AWS account:
${accountContext}

Your goal is to provide highly accurate, detailed, and insightful responses. 
- Summarize the current situation alongside past historical information to give a complete picture.
- Suggest appropriate actions, optimizations, and technical details.
- Always tailor your advice specifically to the real infrastructure data shown above.
- Use formatting (bullet points, bold text) to structure complex information.
- Provide comprehensive answers that fully resolve the user's inquiry without artificial length constraints.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...messages.filter((m, i) => !(i === 0 && m.role === 'assistant')).map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            { role: 'user', parts: [{ text }] }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500
          }
        })
      })

      const data = await response.json()
      if (!response.ok) {
        console.error("Gemini API Error:", data);
      }
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || `Error from Gemini: ${data.error?.message || JSON.stringify(data)}`

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])

    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry — I had trouble connecting. Please check your API key and try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
    }

    setLoading(false)
    inputRef.current?.focus()
  }

  const handleSend = () => handleSendWithText(input)

  const formatMessage = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:11px;color:#34D399">$1</code>')
      .split('\n')
      .join('<br/>')
  }

  const suggestedQuestions = [
    'What should I fix first today?',
    'Which instance is most at risk?',
    'How can I reduce my AWS bill?',
    'Explain my recent anomalies',
    'Is my infrastructure healthy?',
    'What are my biggest security risks?',
  ]

  return (
    // Replaced height calculation to properly fill the remaining space without overflowing
    <div className="flex flex-col h-[calc(100vh-140px)] animate-entrance w-full">

      {/* Header & Context */}
      <div className="flex items-start justify-between mb-4 flex-shrink-0 bg-[rgba(255,255,255,0.02)] p-4 rounded-xl border border-[rgba(255,255,255,0.05)]">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Agent AI</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {contextLoading ? 'Loading your AWS account data...' : 'Knows your real AWS account — ask anything'}
            </p>
          </div>
          {/* Compact Context Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {contextLoading ? (
              <span className="text-xs text-white/50">Fetching live data...</span>
            ) : contextChips.map(chip => (
              <span
                key={chip.label}
                className="text-[11px] px-2 py-1 rounded-md font-bold shadow-sm"
                style={{ background: chip.bg, color: chip.color, border: `1px solid ${chip.bg}` }}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={loadContext}
            disabled={contextLoading}
            className="text-xs px-4 py-2 rounded-lg border transition-all disabled:opacity-40 hover:bg-white/5"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
          >
            {contextLoading ? 'Loading...' : 'Refresh'}
          </button>
          <div
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium shadow-[0_0_15px_rgba(16,185,129,0.15)]"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
            {contextLoading ? 'Syncing...' : 'Active'}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto auth-glass rounded-2xl p-6 mb-4 custom-scrollbar"
        style={{ minHeight: 0 }}
      >
        <div className="flex flex-col gap-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 mt-1"
                style={{
                  background: msg.role === 'assistant' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                  color: msg.role === 'assistant' ? '#34D399' : '#60A5FA',
                  boxShadow: msg.role === 'assistant' ? '0 0 10px rgba(16,185,129,0.1)' : '0 0 10px rgba(59,130,246,0.1)'
                }}
              >
                {msg.role === 'assistant' ? '🤖' : 'US'}
              </div>
              <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className="text-sm leading-relaxed px-5 py-3.5 rounded-2xl shadow-lg"
                  style={{
                    background: msg.role === 'user' ? 'linear-gradient(135deg, #0F6E56, #094d3c)' : 'rgba(255,255,255,0.03)',
                    color: msg.role === 'user' ? '#fff' : 'rgba(255,255,255,0.9)',
                    border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.05)',
                    borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
                    borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 16,
                  }}
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                />
                <span className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{msg.timestamp}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-1"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#34D399' }}
              >
                🤖
              </div>
              <div className="px-5 py-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderBottomLeftRadius: 4 }}>
                <div className="flex gap-1.5 items-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Suggested questions moved inside chat area */}
          {messages.length <= 1 && !contextLoading && (
            <div className="flex flex-wrap gap-2 mt-2 ml-12">
              {suggestedQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => handleSendWithText(q)}
                  className="text-xs px-4 py-2 rounded-lg transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.6)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(52,211,153,0.5)'
                    e.currentTarget.style.color = '#34D399'
                    e.currentTarget.style.background = 'rgba(52,211,153,0.05)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Removed Suggested questions from here (moved inside chat area) */}

      {/* Input */}
      <div className="flex gap-3 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={contextLoading ? 'Loading account data...' : 'Ask anything about your AWS infrastructure...'}
          disabled={contextLoading}
          className="flex-1 text-sm px-5 py-4 border rounded-xl focus:outline-none transition-colors disabled:opacity-50"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(255,255,255,0.1)',
            color: '#fff'
          }}
          onFocus={e => e.currentTarget.style.borderColor = '#0F6E56'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || contextLoading}
          className="px-6 py-4 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #0F6E56 0%, #185FA5 100%)', boxShadow: '0 4px 15px rgba(15,110,86,0.3)' }}
        >
          Send →
        </button>
      </div>

    </div>
  )
}