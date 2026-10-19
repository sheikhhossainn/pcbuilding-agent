import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, MotionConfig, domMax } from 'framer-motion'
import './index.css'
import App from './App.jsx'
import { installFeedbackUnlock } from './lib/feedback'

installFeedbackUnlock()

// `m` components only (strict) so the animation feature set is chosen here, in one place.
// reducedMotion="user": people who ask the OS for less motion get cross-fades instead of movement.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
)
