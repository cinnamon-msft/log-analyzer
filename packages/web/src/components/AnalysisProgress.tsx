import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AnalysisProgress as ProgressType } from '@log-analyzer/shared'

interface AnalysisProgressProps {
  progress: ProgressType
  streamingText?: string
}

export function AnalysisProgress({ progress, streamingText }: AnalysisProgressProps) {
  // Animate progress bar smoothly between updates
  const [displayProgress, setDisplayProgress] = useState(progress.progress)
  
  useEffect(() => {
    // Smoothly animate to new progress value
    if (progress.progress > displayProgress) {
      setDisplayProgress(progress.progress)
    }
  }, [progress.progress, displayProgress])

  // Increment progress slowly while waiting (prevents stale 0%)
  useEffect(() => {
    if (progress.stage === 'analyzing' && displayProgress < 15) {
      const timer = setInterval(() => {
        setDisplayProgress(prev => Math.min(prev + 1, 15))
      }, 500)
      return () => clearInterval(timer)
    }
  }, [progress.stage, displayProgress])

  const getStageIcon = (stage: ProgressType['stage']) => {
    switch (stage) {
      case 'uploading': return '📤'
      case 'scanning': return '🔍'
      case 'analyzing': return '🤖'
      case 'aggregating': return '📊'
      case 'complete': return '✅'
      case 'error': return '❌'
      default: return '⏳'
    }
  }

  const getStageDescription = (stage: ProgressType['stage']) => {
    switch (stage) {
      case 'uploading': return 'Uploading your log file to the server...'
      case 'scanning': return 'Scanning file structure and preparing for analysis...'
      case 'analyzing': return 'AI is analyzing patterns, anomalies, and root causes...'
      case 'aggregating': return 'Combining results from multiple chunks...'
      case 'complete': return 'Analysis complete!'
      case 'error': return 'An error occurred during analysis.'
      default: return 'Processing...'
    }
  }

  return (
    <div className="progress-container">
      <div className="loading">
        <div className="spinner" />
        <div className="loading-text">
          {getStageIcon(progress.stage)} {progress.message}
        </div>
        <div className="loading-description">
          {getStageDescription(progress.stage)}
        </div>
      </div>
      
      <div className="progress-bar-wrapper">
        <div 
          className="progress-bar" 
          style={{ width: `${Math.max(displayProgress, 5)}%`, transition: 'width 0.3s ease-out' }}
        />
      </div>
      
      <div className="progress-status">
        <span>{progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1)}</span>
        <span>{displayProgress}%</span>
      </div>
      
      {progress.currentChunk !== undefined && progress.totalChunks !== undefined && (
        <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Processing chunk {progress.currentChunk} of {progress.totalChunks}
        </div>
      )}

      {/* Streaming AI output */}
      {streamingText && (
        <div className="streaming-output">
          <div className="streaming-header">
            <span className="streaming-indicator" />
            <span>AI Analysis in Progress</span>
          </div>
          <div className="streaming-content">
            <ReactMarkdown>{streamingText}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
