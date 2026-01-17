import { useState } from 'react'
import { FileUpload } from './components/FileUpload'
import { AnalysisProgress } from './components/AnalysisProgress'
import { ResultsView } from './components/ResultsView'
import { useLogAnalysis } from './hooks/useLogAnalysis'

function App() {
  const [files, setFiles] = useState<File[]>([])
  const [suggestIssues, setSuggestIssues] = useState(false)
  const [repoName, setRepoName] = useState('')
  
  const { analyze, isAnalyzing, progress, streamingText, results, error, reset } = useLogAnalysis()

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles])
  }

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleAnalyze = async () => {
    if (files.length === 0) return
    
    await analyze(files, { suggestIssues, repo: repoName || undefined })
  }

  const handleReset = () => {
    setFiles([])
    reset()
  }

  return (
    <div className="app">
      <header className="header">
        <div className="container header-content">
          <h1>📊 Log Analyzer</h1>
          <span className="header-badge">Powered by Copilot</span>
        </div>
      </header>

      <main className="main">
        <div className="container">
          {!results && !isAnalyzing && (
            <>
              <FileUpload
                files={files}
                onFilesSelected={handleFilesSelected}
                onRemoveFile={handleRemoveFile}
              />

              {files.length > 0 && (
                <>
                  <div className="options-panel">
                    <h3>Analysis Options</h3>
                    <div className="option-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={suggestIssues}
                          onChange={(e) => setSuggestIssues(e.target.checked)}
                        />
                        Generate GitHub issue suggestions
                      </label>
                    </div>
                    {suggestIssues && (
                      <div className="option-row">
                        <label>Repository (optional):</label>
                        <input
                          type="text"
                          placeholder="owner/repo"
                          value={repoName}
                          onChange={(e) => setRepoName(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleAnalyze}
                      disabled={files.length === 0}
                    >
                      🔍 Analyze {files.length > 1 ? `${files.length} Files` : 'Log File'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setFiles([])}
                    >
                      Clear Files
                    </button>
                  </div>
                </>
              )}

              {error && (
                <div className="error-message">
                  <strong>Error:</strong> {error}
                </div>
              )}
            </>
          )}

          {isAnalyzing && (
            <AnalysisProgress progress={progress} streamingText={streamingText} />
          )}

          {results && !isAnalyzing && (
            <ResultsView
              results={results}
              onReset={handleReset}
              isMultiFile={files.length > 1}
            />
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          Log Analyzer • Built with GitHub Copilot SDK
        </div>
      </footer>
    </div>
  )
}

export default App
