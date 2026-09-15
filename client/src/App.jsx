import { useState } from 'react'
import { createJob } from './api'
import ProcessingScreen from './components/ProcessingScreen'
import ResultsScreen from './components/ResultsScreen'
import UploadScreen from './components/UploadScreen'

export default function App() {
  const [screen, setScreen] = useState('upload') // 'upload' | 'processing' | 'results'
  const [jobId, setJobId] = useState(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit(files) {
    setError(null)
    try {
      const { job_id } = await createJob(files)
      setJobId(job_id)
      setPhotoCount(files.length)
      setScreen('processing')
    } catch {
      setError('Could not upload those photos. Please try again.')
    }
  }

  function handleDone(finalResult) {
    setResult(finalResult)
    setScreen('results')
  }

  function handleError(message) {
    setError(message)
    setScreen('upload')
  }

  function reset() {
    setJobId(null)
    setResult(null)
    setError(null)
    setScreen('upload')
  }

  return (
    <div className="min-h-screen">
      {error && (
        <div className="mx-auto mt-4 max-w-lg rounded-2xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-600">
          {error}
        </div>
      )}
      {screen === 'upload' && <UploadScreen onSubmit={handleSubmit} />}
      {screen === 'processing' && (
        <ProcessingScreen jobId={jobId} photoCount={photoCount} onDone={handleDone} onError={handleError} />
      )}
      {screen === 'results' && <ResultsScreen result={result} jobId={jobId} onReset={reset} />}
    </div>
  )
}
