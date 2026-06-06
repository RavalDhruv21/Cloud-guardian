'use client'
import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const suggestedQuestions = [
  'What should I fix first today?',
  'Which instance is most at risk?',
  'Will my bill be high this month?',
  'Explain my security events',
  'How do I prevent cryptominers?',
  'What caused the bill spike today?',
]

const initialMessage: Message = {
  role: 'assistant',
  content: `Hi! I'm your Cloud Guardian AI assistant. I have full context of your AWS account:

- **4 EC2 instances** — 1 critical (i-0abc123456 at 94% CPU), 1 warning
- **3 unresolved anomalies** — including a possible cryptominer
- **$43/month** in potential savings identified
- **2 security events** — both auto-reverted successfully

What would you like to tackle first?`,
  timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
}

export default function AgentAIPage() {
  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'})
  }, [messages])

  // Check if navigated here from Ask AI button
  useEffect(() => {
    const ctx = sessionStorage.getItem('agent_context')
    if (ctx) {
      setContext(ctx)
      sessionStorage.removeItem('agent_context')
      // Auto-send context as first user message
      handleSendWithText(`Tell me about this: ${ctx}`)
    }
  }, [])

  const handleSendWithText = async (text: string) => {
    if (!text.trim() || loading) return
    setLoading(true)

    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      // Call Groq API directly
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
You have context of the user's AWS account:
- 4 EC2 instances running (i-0abc123456 critical at 94% CPU, i-0ghi789012 warning at 78%, 2 healthy)
- 3 unresolved anomalies: high CPU on i-0abc123456 (possible cryptominer), RDS zero connections, bill spike $47
- Cost savings identified: $43/month (idle EC2, idle RDS, unattached EBS)
- 2 security events: port 22 auto-reverted, S3 bucket auto-reverted
- Account region: us-east-1

Answer questions specifically about their infrastructure. Be concise, technical, and actionable.
Use bullet points for lists. Keep responses under 150 words unless the question requires more detail.`
            },
            ...messages.map(m => ({role: m.role, content: m.content})),
            {role: 'user', content: text}
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      })

      const data = await response.json()
      const aiText = data.choices?.[0]?.message?.content || 'Sorry, I could not get a response. Please try again.'

      const aiMsg: Message = {
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
      }
      setMessages(prev => [...prev, aiMsg])
    } catch (error) {
      const errMsg: Message = {
        role: 'assistant',
        content: 'Sorry — I had trouble connecting. Please check your API key and try again.',
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
      }
      setMessages(prev => [...prev, errMsg])
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
      .replace(/•/g, '•')
      .split('\n')
      .join('<br/>')
  }

  return (
    <div className="flex flex-col h-full" style={{height: 'calc(100vh - 48px - 48px)'}}>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Agent AI</h1>
          <p className="text-xs text-gray-400 mt-0.5">Knows your entire AWS account — ask anything</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{background: '#E1F5EE', color: '#0F6E56'}}>
            <div className="w-1.5 h-1.5 rounded-full" style={{background: '#1D9E75'}}></div>
            Context loaded
          </div>
        </div>
      </div>

      {/* Context bar */}
      <div className="flex items-center gap-2 flex-wrap mb-4 flex-shrink-0 p-3 rounded-xl border" style={{background: '#f9fafb', borderColor: '#e5e7eb'}}>
        <span className="text-xs text-gray-400">AI is aware of:</span>
        {[
          { label: '4 EC2 instances', color: '#0F6E56', bg: '#E1F5EE' },
          { label: '3 anomalies', color: '#A32D2D', bg: '#FCEBEB' },
          { label: '$43 savings found', color: '#854F0B', bg: '#FAEEDA' },
          { label: '2 security events', color: '#185FA5', bg: '#E6F1FB' },
        ].map(chip => (
          <span key={chip.label} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background: chip.bg, color: chip.color}}>
            {chip.label}
          </span>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4" style={{minHeight: 0}}>
        <div className="flex flex-col gap-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

              {/* Avatar */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5"
                style={{
                  background: msg.role === 'assistant' ? '#E1F5EE' : '#E6F1FB',
                  color: msg.role === 'assistant' ? '#0F6E56' : '#185FA5'
                }}
              >
                {msg.role === 'assistant' ? '🤖' : 'RK'}
              </div>

              {/* Bubble */}
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

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0" style={{background: '#E1F5EE'}}>
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

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
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
          placeholder="Ask anything about your AWS infrastructure..."
          className="flex-1 text-xs px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-4 py-3 rounded-xl text-white text-xs font-medium transition-all disabled:opacity-40"
          style={{background: '#0F6E56'}}
        >
          Send →
        </button>
      </div>

    </div>
  )
}