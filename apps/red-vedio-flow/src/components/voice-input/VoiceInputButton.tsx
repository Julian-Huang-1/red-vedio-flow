import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SpeechRecognitionEventLike = Event & {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

type SpeechRecognitionErrorEventLike = Event & {
  error: string
}

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

type VoiceInputButtonProps = {
  onTranscript: (text: string) => void
  disabled?: boolean
  className?: string
}

const errorMessages: Record<string, string> = {
  'audio-capture': '未检测到麦克风',
  'network': '语音识别网络异常',
  'not-allowed': '请允许使用麦克风',
  'service-not-allowed': '浏览器未允许语音识别',
}

export function VoiceInputButton({
  onTranscript,
  disabled = false,
  className,
}: VoiceInputButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionLike>()
  const onTranscriptRef = useRef(onTranscript)
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string>()
  const isSupported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  onTranscriptRef.current = onTranscript

  useEffect(() => () => {
    recognitionRef.current?.abort()
  }, [])

  const start = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'zh-CN'
    recognition.onstart = () => {
      setError(undefined)
      setIsListening(true)
    }
    recognition.onresult = (event) => {
      const transcripts: string[] = []
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal && result[0]?.transcript.trim()) {
          transcripts.push(result[0].transcript.trim())
        }
      }
      if (transcripts.length) onTranscriptRef.current(transcripts.join(''))
    }
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(errorMessages[event.error] ?? '语音识别失败，请重试')
      }
    }
    recognition.onend = () => {
      recognitionRef.current = undefined
      setIsListening(false)
    }
    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch {
      recognitionRef.current = undefined
      setError('语音识别启动失败，请重试')
      setIsListening(false)
    }
  }

  const toggle = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    start()
  }

  const label = !isSupported
    ? '当前浏览器不支持语音输入，请使用 Chrome'
    : error
      ? error
      : isListening
        ? '停止语音输入'
        : '语音输入'

  return (
    <Button
      type="button"
      variant={isListening ? 'secondary' : 'ghost'}
      size="icon"
      className={cn(
        'text-muted-foreground data-[listening]:text-destructive',
        className,
      )}
      aria-label={label}
      title={label}
      disabled={disabled || !isSupported}
      data-voice-input=""
      data-listening={isListening ? '' : undefined}
      data-error={error ? '' : undefined}
      onClick={toggle}
    >
      {isListening ? <MicOff size={16} /> : <Mic size={16} />}
    </Button>
  )
}

