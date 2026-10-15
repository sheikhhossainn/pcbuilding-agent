import Builder from "./components/Builder"
import { findLandingPage } from "./seo/pages"

// Landing pages are real paths (prerendered to static HTML on deploy); everything else is the
// plain builder. No router: a landing page is a full page load, not an in-app transition.
const landingPage = typeof window === 'undefined' ? null : findLandingPage(window.location.pathname)

if (landingPage) document.title = landingPage.title

function App() {
  return <Builder page={landingPage} />
}

export default App
