import { useCallback, useState, DragEvent, ChangeEvent, useRef } from 'react'

interface FileUploadProps {
  files: File[]
  onFilesSelected: (files: File[]) => void
  onRemoveFile: (index: number) => void
}

export function FileUpload({ files, onFilesSelected, onRemoveFile }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(file => 
      file.name.endsWith('.log') || file.name.endsWith('.txt') || file.name.endsWith('.json')
    )
    
    if (droppedFiles.length > 0) {
      onFilesSelected(droppedFiles)
    }
  }, [onFilesSelected])

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles) {
      onFilesSelected(Array.from(selectedFiles))
    }
    // Reset input so same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }, [onFilesSelected])

  const handleClick = () => {
    inputRef.current?.click()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div>
      <div
        className={`upload-zone ${isDragOver ? 'dragover' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="upload-zone-icon">📁</div>
        <h2>Drop log files here or click to upload</h2>
        <p>Supports .log, .txt, and .json files • Multiple files for comparison analysis</p>
        <input
          ref={inputRef}
          type="file"
          accept=".log,.txt,.json"
          multiple
          onChange={handleFileSelect}
        />
      </div>

      {files.length > 0 && (
        <div className="file-list">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="file-item">
              <div className="file-item-info">
                <span className="file-item-icon">📄</span>
                <span className="file-item-name">{file.name}</span>
                <span className="file-item-size">{formatFileSize(file.size)}</span>
              </div>
              <button
                className="file-item-remove"
                onClick={() => onRemoveFile(index)}
                title="Remove file"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
