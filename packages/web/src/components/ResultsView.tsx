import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { LogAnalysisResult, MultiFileAnalysisResult, IssueSuggestion } from '@log-analyzer/shared'
import { sanitizeHtml } from '@log-analyzer/shared'

interface AnalysisResultsData {
  analysis: LogAnalysisResult | MultiFileAnalysisResult
  issueSuggestions?: IssueSuggestion[]
  filename?: string
  fileSize?: number
}

interface ResultsViewProps {
  results: AnalysisResultsData
  onReset: () => void
  isMultiFile: boolean
}

type TabType = 'summary' | 'findings' | 'issues' | 'diff'

export function ResultsView({ results, onReset, isMultiFile: _isMultiFile }: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('summary')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all')

  const isMultiFileResult = (analysis: LogAnalysisResult | MultiFileAnalysisResult): analysis is MultiFileAnalysisResult => {
    return 'fileResults' in analysis
  }

  const analysis = results.analysis
  const isMulti = isMultiFileResult(analysis)

  const primaryAnalysis: LogAnalysisResult = isMulti 
    ? analysis.fileResults[0]?.analysis || { patterns: [], anomalies: [], rootCauses: [], summary: '' }
    : analysis

  // Get deduplicated findings with file sources
  const getDeduplicatedFindings = () => {
    if (!isMulti) {
      return {
        patterns: primaryAnalysis.patterns.map(p => ({ text: p, files: [results.filename || 'log'] })),
        anomalies: primaryAnalysis.anomalies.map(a => ({ text: a, files: [results.filename || 'log'] })),
        rootCauses: primaryAnalysis.rootCauses.map(r => ({ text: r, files: [results.filename || 'log'] })),
      }
    }

    const patternMap = new Map<string, { text: string; files: Set<string> }>()
    const anomalyMap = new Map<string, { text: string; files: Set<string> }>()
    const rootCauseMap = new Map<string, { text: string; files: Set<string> }>()

    for (const fileResult of analysis.fileResults) {
      for (const pattern of fileResult.analysis.patterns) {
        const key = pattern.toLowerCase().trim()
        if (!patternMap.has(key)) patternMap.set(key, { text: pattern, files: new Set() })
        patternMap.get(key)!.files.add(fileResult.filename)
      }
      for (const anomaly of fileResult.analysis.anomalies) {
        const key = anomaly.toLowerCase().trim()
        if (!anomalyMap.has(key)) anomalyMap.set(key, { text: anomaly, files: new Set() })
        anomalyMap.get(key)!.files.add(fileResult.filename)
      }
      for (const rootCause of fileResult.analysis.rootCauses) {
        const key = rootCause.toLowerCase().trim()
        if (!rootCauseMap.has(key)) rootCauseMap.set(key, { text: rootCause, files: new Set() })
        rootCauseMap.get(key)!.files.add(fileResult.filename)
      }
    }

    return {
      patterns: Array.from(patternMap.values()).map(v => ({ text: v.text, files: Array.from(v.files) })),
      anomalies: Array.from(anomalyMap.values()).map(v => ({ text: v.text, files: Array.from(v.files) })),
      rootCauses: Array.from(rootCauseMap.values()).map(v => ({ text: v.text, files: Array.from(v.files) })),
    }
  }

  const findings = getDeduplicatedFindings()
  const totalFindings = findings.patterns.length + findings.anomalies.length + findings.rootCauses.length

  const tabs: { id: TabType; label: string; icon: string; count?: number }[] = [
    { id: 'summary', label: 'Overview', icon: '📋' },
    { id: 'findings', label: 'Findings', icon: '🔬', count: totalFindings },
  ]

  if (isMulti && analysis.similarities.exactMatches && analysis.similarities.exactMatches.length > 0) {
    tabs.push({ 
      id: 'diff', 
      label: 'Exact Matches', 
      icon: '🔀',
      count: analysis.similarities.exactMatches.length
    })
  }

  if (results.issueSuggestions !== undefined) {
    tabs.push({ 
      id: 'issues', 
      label: 'GitHub Issues', 
      icon: '💡', 
      count: results.issueSuggestions.length 
    })
  }

  const renderSummaryTab = () => {
    return (
      <div className="summary-tab">
        {/* Stats Overview */}
        <div className="stats-grid">
          <div className="stat-card stat-patterns">
            <div className="stat-icon">📊</div>
            <div className="stat-value">{findings.patterns.length}</div>
            <div className="stat-label">Patterns</div>
          </div>
          <div className="stat-card stat-anomalies">
            <div className="stat-icon">⚠️</div>
            <div className="stat-value">{findings.anomalies.length}</div>
            <div className="stat-label">Anomalies</div>
          </div>
          <div className="stat-card stat-rootcauses">
            <div className="stat-icon">🔍</div>
            <div className="stat-value">{findings.rootCauses.length}</div>
            <div className="stat-label">Root Causes</div>
          </div>
          {isMulti && (
            <div className="stat-card stat-files">
              <div className="stat-icon">📁</div>
              <div className="stat-value">{analysis.fileResults.length}</div>
              <div className="stat-label">Files</div>
            </div>
          )}
        </div>

        {/* Files Overview for multi-file */}
        {isMulti && (
          <div className="files-overview">
            <h3>📁 Files Analyzed</h3>
            <div className="files-grid">
              {analysis.fileResults.map((fileResult, idx) => (
                <div key={idx} className="file-card">
                  <div className="file-card-header">
                    <span className="file-name">{fileResult.filename}</span>
                    <span className="file-size">{(fileResult.fileSize / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="file-card-stats">
                    <span title="Patterns">📊 {fileResult.analysis.patterns.length}</span>
                    <span title="Anomalies">⚠️ {fileResult.analysis.anomalies.length}</span>
                    <span title="Root Causes">🔍 {fileResult.analysis.rootCauses.length}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="summary-section">
          <h3>📝 Analysis Summary</h3>
          <div className="summary-content markdown-content">
            <ReactMarkdown>{isMulti ? analysis.overallSummary : primaryAnalysis.summary}</ReactMarkdown>
          </div>
        </div>

        {/* Shared findings highlight for multi-file */}
        {isMulti && (analysis.similarities.sharedPatterns.length > 0 || 
                     analysis.similarities.sharedAnomalies.length > 0 ||
                     analysis.similarities.sharedRootCauses.length > 0) && (
          <div className="shared-findings">
            <h3>🔗 Cross-File Similarities</h3>
            <div className="shared-grid">
              {analysis.similarities.sharedPatterns.length > 0 && (
                <div className="shared-card">
                  <h4>Shared Patterns ({analysis.similarities.sharedPatterns.length})</h4>
                  <ul>
                    {analysis.similarities.sharedPatterns.slice(0, 5).map((p, i) => (
                      <li key={i}><ReactMarkdown>{p}</ReactMarkdown></li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.similarities.sharedAnomalies.length > 0 && (
                <div className="shared-card shared-warning">
                  <h4>Shared Anomalies ({analysis.similarities.sharedAnomalies.length})</h4>
                  <ul>
                    {analysis.similarities.sharedAnomalies.slice(0, 5).map((a, i) => (
                      <li key={i}><ReactMarkdown>{a}</ReactMarkdown></li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.similarities.sharedRootCauses.length > 0 && (
                <div className="shared-card shared-error">
                  <h4>Shared Root Causes ({analysis.similarities.sharedRootCauses.length})</h4>
                  <ul>
                    {analysis.similarities.sharedRootCauses.slice(0, 5).map((r, i) => (
                      <li key={i}><ReactMarkdown>{r}</ReactMarkdown></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderFindingCard = (
    type: 'pattern' | 'anomaly' | 'rootCause',
    item: { text: string; files: string[] },
    idx: number
  ) => {
    const cardId = `${type}-${idx}`
    const isShared = item.files.length > 1
    
    const icons = { pattern: '📊', anomaly: '⚠️', rootCause: '🔍' }
    const labels = { pattern: 'Pattern', anomaly: 'Anomaly', rootCause: 'Root Cause' }
    const colors = { pattern: 'blue', anomaly: 'yellow', rootCause: 'red' }
    
    return (
      <div 
        key={cardId} 
        className={`finding-card finding-${colors[type]} ${isShared ? 'shared' : ''}`}
      >
        <div className="finding-header">
          <span className="finding-icon">{icons[type]}</span>
          <span className="finding-type">{labels[type]}</span>
          {isShared && <span className="shared-badge">🔗 {item.files.length} files</span>}
          {item.files.length > 0 && (
            <div className="finding-files-inline">
              {item.files.map((file, i) => (
                <span key={i} className="file-tag">{file}</span>
              ))}
            </div>
          )}
        </div>
        <div className="finding-content markdown-content">
          <ReactMarkdown>{item.text}</ReactMarkdown>
        </div>
      </div>
    )
  }

  const renderFindingsTab = () => {
    return (
      <div className="findings-tab">
        {/* Root Causes Section - Most Important */}
        {findings.rootCauses.length > 0 && (
          <section className="findings-section">
            <h3>🔍 Root Causes <span className="count">({findings.rootCauses.length})</span></h3>
            <p className="section-desc">Critical issues that need attention</p>
            <div className="findings-list">
              {findings.rootCauses.map((item, idx) => renderFindingCard('rootCause', item, idx))}
            </div>
          </section>
        )}

        {/* Anomalies Section */}
        {findings.anomalies.length > 0 && (
          <section className="findings-section">
            <h3>⚠️ Anomalies <span className="count">({findings.anomalies.length})</span></h3>
            <p className="section-desc">Unusual behaviors and warnings detected</p>
            <div className="findings-list">
              {findings.anomalies.map((item, idx) => renderFindingCard('anomaly', item, idx))}
            </div>
          </section>
        )}

        {/* Patterns Section */}
        {findings.patterns.length > 0 && (
          <section className="findings-section">
            <h3>📊 Patterns <span className="count">({findings.patterns.length})</span></h3>
            <p className="section-desc">Recurring patterns and trends</p>
            <div className="findings-list">
              {findings.patterns.map((item, idx) => renderFindingCard('pattern', item, idx))}
            </div>
          </section>
        )}

        {findings.patterns.length === 0 && findings.anomalies.length === 0 && findings.rootCauses.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🔬</div>
            <p>No findings detected in the analyzed logs.</p>
          </div>
        )}
      </div>
    )
  }

  const renderDiffTab = () => {
    if (!isMulti || !analysis.similarities.exactMatches) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">🔀</div>
          <p>No exact line matches found between files.</p>
        </div>
      )
    }

    const matches = analysis.similarities.exactMatches
    const filteredMatches = categoryFilter === 'all' 
      ? matches 
      : matches.filter(m => m.category === categoryFilter)

    const categoryColors: Record<string, string> = {
      error: 'red',
      warning: 'yellow',
      info: 'blue',
      debug: 'gray',
      other: 'default'
    }

    return (
      <div className="diff-tab">
        <div className="diff-header">
          <h3>🔀 Exact Line Matches</h3>
          <p className="diff-desc">
            Lines that appear identically in multiple files (after removing timestamps/IDs)
          </p>
          
          {/* Category Filter */}
          <div className="category-filter">
            <button 
              className={`filter-btn ${categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              All ({matches.length})
            </button>
            <button 
              className={`filter-btn filter-error ${categoryFilter === 'error' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('error')}
            >
              🔴 Errors ({matches.filter(m => m.category === 'error').length})
            </button>
            <button 
              className={`filter-btn filter-warning ${categoryFilter === 'warning' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('warning')}
            >
              🟡 Warnings ({matches.filter(m => m.category === 'warning').length})
            </button>
            <button 
              className={`filter-btn filter-info ${categoryFilter === 'info' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('info')}
            >
              🔵 Info ({matches.filter(m => m.category === 'info').length})
            </button>
          </div>
        </div>

        <div className="diff-list">
          {filteredMatches.map((match, idx) => (
            <div key={idx} className={`diff-card diff-${categoryColors[match.category]}`}>
              <div className="diff-card-header">
                <span className={`category-badge ${match.category}`}>
                  {match.category.toUpperCase()}
                </span>
                <span className="occurrence-count">
                  {match.totalCount}× across {match.occurrences.length} files
                </span>
              </div>
              <div className="diff-line">
                <code>{match.line}</code>
              </div>
              <div className="diff-occurrences">
                {match.occurrences.map((occ, occIdx) => (
                  <div key={occIdx} className="occurrence">
                    <span className="occ-file">📄 {occ.filename}</span>
                    <span className="occ-lines">
                      {occ.lineNumbers.length > 3 
                        ? `Lines ${occ.lineNumbers.slice(0, 3).join(', ')}... (+${occ.lineNumbers.length - 3} more)`
                        : `Line${occ.lineNumbers.length > 1 ? 's' : ''} ${occ.lineNumbers.join(', ')}`
                      }
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {filteredMatches.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <p>No matches found for the selected category.</p>
          </div>
        )}
      </div>
    )
  }

  const renderIssuesTab = () => {
    if (!results.issueSuggestions || results.issueSuggestions.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">💡</div>
          <p>No issue suggestions generated.</p>
        </div>
      )
    }

    // Only show cards that have matching GitHub issues
    const suggestionsWithIssues = results.issueSuggestions.filter(
      s => s.linkedIssues && s.linkedIssues.length > 0
    );

    if (suggestionsWithIssues.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <p>No matching GitHub issues found for the detected errors.</p>
        </div>
      )
    }

    return (
      <div className="issues-tab">
        {suggestionsWithIssues.map((suggestion, idx) => (
          <div key={idx} className="issue-card">
            <div className="issue-card-top">
              {suggestion.sourceFiles && suggestion.sourceFiles.length > 0 && (
                <div className="issue-files-inline">
                  {suggestion.sourceFiles.map((file, i) => (
                    <span key={i} className="file-badge">📄 {file}</span>
                  ))}
                </div>
              )}
              <code className="error-signature">{sanitizeHtml(suggestion.errorSignature)}</code>
            </div>
            
            <p className="issue-description">{sanitizeHtml(suggestion.description)}</p>
            
            <div className="linked-issues">
              <h5>🔗 Related GitHub Issues ({suggestion.linkedIssues!.length})</h5>
              <div className="issues-list">
                {suggestion.linkedIssues!.map((issue, i) => (
                  <a 
                    key={i}
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`github-issue ${issue.state}`}
                  >
                    <span className="issue-num">#{issue.number}</span>
                    <span className="issue-title">{sanitizeHtml(issue.title)}</span>
                    <span className={`issue-state ${issue.state}`}>{issue.state}</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="issue-actions">
              <a 
                href={`https://github.com/search?q=${encodeURIComponent(suggestion.searchQuery)}&type=issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="search-link"
              >
                🔍 Search GitHub: {suggestion.searchQuery}
              </a>
            </div>

            {suggestion.potentialSolutions.length > 0 && (
              <div className="solutions">
                <h5>💡 Potential Solutions</h5>
                <ul>
                  {suggestion.potentialSolutions.map((s, i) => (
                    <li key={i}>{sanitizeHtml(s)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'summary':
        return renderSummaryTab()
      case 'findings':
        return renderFindingsTab()
      case 'diff':
        return renderDiffTab()
      case 'issues':
        return renderIssuesTab()
      default:
        return null
    }
  }

  return (
    <div className="results-container-v2">
      <div className="results-header">
        <div className="header-left">
          <h2>📊 Analysis Results</h2>
          {isMulti && (
            <span className="file-count-badge">{analysis.fileResults.length} files</span>
          )}
        </div>
        <button className="btn btn-secondary" onClick={onReset}>
          ← Analyze More Files
        </button>
      </div>

      <div className="tabs-v2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-v2 ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="tab-count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {renderTabContent()}
      </div>
    </div>
  )
}
