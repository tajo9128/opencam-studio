import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
const Analytics = lazy(() => import('@vercel/analytics/react').then(m => ({ default: m.Analytics })));
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { AppShell } from './components/AppShell/AppShell';
import ScreenRecorder from './components/ScreenRecorder';
import { EditMode } from './components/EditMode/EditMode';
import { StreamMode } from './components/Streaming/StreamMode';
import { ExportMode } from './components/ExportMode/ExportMode';
import { SettingsPage } from './components/Settings/SettingsPage';
import LandingPage from './components/LandingPage/LandingPage';
import './index.css';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ThemeProvider>
          <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route element={<AppShell />}>
                <Route path="/recorder" element={<ScreenRecorder />} />
                <Route path="/editor" element={<EditMode />} />
                <Route path="/stream" element={<StreamMode />} />
                <Route path="/export" element={<ExportMode />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
            <Suspense fallback={null}><Analytics /></Suspense>
        </ThemeProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
