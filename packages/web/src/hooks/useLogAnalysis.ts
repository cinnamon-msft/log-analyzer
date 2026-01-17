import { useState, useCallback, useRef } from 'react'
import type { AnalysisProgress, LogAnalysisResult, MultiFileAnalysisResult, IssueSuggestion } from '@log-analyzer/shared'

interface AnalysisOptions {
  suggestIssues?: boolean
  repo?: string
}

interface AnalysisResults {
  analysis: LogAnalysisResult | MultiFileAnalysisResult
  issueSuggestions?: IssueSuggestion[]
  filename?: string
  fileSize?: number
}

interface UseLogAnalysisReturn {
  analyze: (files: File[], options?: AnalysisOptions) => Promise<void>
  isAnalyzing: boolean
  progress: AnalysisProgress
  streamingText: string
  results: AnalysisResults | null
  error: string | null
  reset: () => void
}

const initialProgress: AnalysisProgress = {
  stage: 'uploading',
  progress: 0,
  message: 'Preparing...',
}

export function useLogAnalysis(): UseLogAnalysisReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState<AnalysisProgress>(initialProgress)
  const [streamingText, setStreamingText] = useState('')
  const [results, setResults] = useState<AnalysisResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const reset = useCallback(() => {
    setIsAnalyzing(false)
    setProgress(initialProgress)
    setStreamingText('')
    setResults(null)
    setError(null)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  const analyze = useCallback(async (files: File[], options?: AnalysisOptions) => {
    if (files.length === 0) {
      setError('No files selected')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setStreamingText('')
    setProgress({ stage: 'uploading', progress: 5, message: 'Preparing to upload...' })

    // Generate a unique request ID for SSE
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Set up SSE connection for streaming updates BEFORE making the request
    const eventSource = new EventSource(`/api/analyze/progress/${requestId}`)
    eventSourceRef.current = eventSource

    // Wait for SSE connection to be established
    await new Promise<void>((resolve) => {
      eventSource.onopen = () => {
        setProgress({ stage: 'uploading', progress: 10, message: 'Uploading files...' })
        resolve()
      }
      // Timeout after 2 seconds if no connection
      setTimeout(() => resolve(), 2000)
    })

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'progress') {
          setProgress({
            stage: data.stage,
            progress: data.progress,
            message: data.message,
            currentChunk: data.currentChunk,
            totalChunks: data.totalChunks,
          })
        } else if (data.type === 'streaming') {
          // Append streaming text from AI
          setStreamingText(data.fullText || '')
        } else if (data.type === 'complete') {
          // Analysis complete, SSE will close
        }
      } catch (e) {
        console.error('Error parsing SSE data:', e)
      }
    }

    eventSource.onerror = () => {
      // SSE connection closed or errored - this is normal when analysis completes
      eventSource.close()
      eventSourceRef.current = null
    }

    try {
      const formData = new FormData()
      
      if (files.length === 1) {
        formData.append('file', files[0])
      } else {
        files.forEach(file => {
          formData.append('files', file)
        })
      }

      if (options?.suggestIssues) {
        formData.append('suggestIssues', 'true')
      }
      if (options?.repo) {
        formData.append('repo', options.repo)
      }

      setProgress({ stage: 'analyzing', progress: 30, message: 'Analyzing logs...' })

      const endpoint = files.length === 1 ? '/api/analyze' : '/api/analyze/multi'
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Request-ID': requestId,
        },
      })

      // Close SSE connection
      eventSource.close()
      eventSourceRef.current = null

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP error ${response.status}`)
      }

      setProgress({ stage: 'aggregating', progress: 80, message: 'Processing results...' })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed')
      }

      setProgress({ stage: 'complete', progress: 100, message: 'Analysis complete!' })
      setResults(data.data)
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setProgress({ stage: 'error', progress: 0, message: 'Analysis failed' })
      
      // Ensure SSE is closed on error
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  return {
    analyze,
    isAnalyzing,
    progress,
    streamingText,
    results,
    error,
    reset,
  }
}
