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
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'})
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

      // Build context chips for display
      setContextChips([
        { label: `${instances.length} EC2 instances`, color: '#0F6E56', bg: '#E1F5EE' },
        { label: `${unresolved.length} anomalies`, color: unresolved.length > 0 ? '#A32D2D' : '#0F6E56', bg: unresolved.length > 0 ? '#FCEBEB' : '#E1F5EE' },
        { label: `$${totalSavings.toFixed(0)} savings found`, color: '#854F0B', bg: '#FAEEDA' },
        { label: `Region: ${region}`, color: '#185FA5', bg: '#E6F1FB' },
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

      const costDetails = costs.length > 0
        ? costs.map((c: any) => `${c.resource_id}: ${c.estimated_saving}`).join('; ')
        : 'none identified'

      const ctx = `
- EC2 instances monitored: ${instances.length > 0 ? instanceDetails : 'none yet'}
- Unresolved anomalies (${unresolved.length}): ${anomalyDetails}
- Cost savings (${costs.length} found): ${costDetails} — total $${totalSavings.toFixed(0)}/mo
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
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
      }])

    } catch (err) {
      setAccountContext('AWS account connected')
      setContextChips([
        { label: 'Account connected', color: '#0F6E56', bg: '#E1F5EE' }
      ])
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm your Cloud Guardian AI assistant. I'm having trouble fetching your live data right now, but I can still answer questions about your AWS infrastructure. What would you like to know?",
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
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
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are Cloud Guardian AI — an expert AWS infrastructure assistant.
You have real-time context of the user's AWS account:
${accountContext}

Answer questions specifically about their real infrastructure data shown above.
Be concise, technical, and actionable. Use bullet points for lists.
Keep responses under 150 words unless more detail is needed.
If asked about specific instances, refer to the real instance IDs from the context.`
            },
            ...messages.map(m => ({role: m.role, content: m.content})),
            {role: 'user', content: text}
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      })

      const data = await response.json()
      const aiText = data.choices?.[0]?.message?.content || 'Sorry — could not get a response. Please try again.'

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
      }])

    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry — I had trouble connecting. Please check your API key and try again.',
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
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
      .replace(/`(.*?)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
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
    <div className="flex flex-col" style={{height: 'calc(100vh - 96px)'}}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Agent AI</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {contextLoading ? 'Loading your AWS account data...' : 'Knows your real AWS account — ask anything'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadContext}
            disabled={contextLoading}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            {contextLoading ? 'Loading...' : 'Refresh context'}
          </button>
          <div
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
            style={{background: '#E1F5EE', color: '#0F6E56'}}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{background: '#1D9E75'}}></div>
            {contextLoading ? 'Loading...' : 'Context loaded'}
          </div>
        </div>
      </div>

      {/* Context bar */}
      <div
        className="flex items-center gap-2 flex-wrap mb-4 flex-shrink-0 p-3 rounded-xl border"
        style={{background: '#f9fafb', borderColor: '#e5e7eb'}}
      >
        <span className="text-xs text-gray-400">AI is aware of:</span>
        {contextLoading ? (
          <span className="text-xs text-gray-300">Fetching live data...</span>
        ) : contextChips.map(chip => (
          <span
            key={chip.label}
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{background: chip.bg, color: chip.color}}
          >
            {chip.label}
          </span>
        ))}
      </div>

      {/* Chat area */}
      <div
        className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4"
        style={{minHeight: 0}}
      >
        <div className="flex flex-col gap-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5"
                style={{
                  background: msg.role === 'assistant' ? '#E1F5EE' : '#E6F1FB',
                  color: msg.role === 'assistant' ? '#0F6E56' : '#185FA5'
                }}
              >
                {msg.role === 'assistant' ? '🤖' : 'RK'}
              </div>
              <div className={`flex flex-col gap-1 max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className="text-xs leading-relaxed px-4 py-3 rounded-2xl"
                  style={{
                    background: msg.role === 'user' ? '#0F6E56' : '#f9fafb',
                    color: msg.role === 'user' ? '#fff' : '#374151',
                    borderBottomRightRadius: msg.role === 'user' ? 4 : undefined,
                    borderBottomLeftRadius: msg.role === 'assistant' ? 4 : undefined,
                  }}
                  dangerouslySetInnerHTML={{__html: formatMessage(msg.content)}}
                />
                <span className="text-xs text-gray-300">{msg.timestamp}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                style={{background: '#E1F5EE'}}
              >
                🤖
              </div>
              <div className="px-4 py-3 rounded-2xl bg-gray-50" style={{borderBottomLeftRadius: 4}}>
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '0ms'}}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '150ms'}}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef}/>
        </div>
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && !contextLoading && (
        <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
          {suggestedQuestions.map(q => (
            <button
              key={q}
              onClick={() => handleSendWithText(q)}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-emerald-300 hover:text-emerald-700 transition-all"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={contextLoading ? 'Loading account data...' : 'Ask anything about your AWS infrastructure...'}
          disabled={contextLoading}
          className="flex-1 text-xs px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || contextLoading}
          className="px-4 py-3 rounded-xl text-white text-xs font-medium transition-all disabled:opacity-40"
          style={{background: '#0F6E56'}}
        >
          Send →
        </button>
      </div>

    </div>
  )
}