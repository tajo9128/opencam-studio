import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
const Analytics = lazy(() => import('@vercel/analytics/react').then(m => ({ default: m.Analytics })));
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { AppShell } from './components/AppShell/AppShell';
import ScreenRecorder from './components/ScreenRecorder';
import { LoadingSpinner } from './components/LoadingSpinner';

const EditorRoute = lazy(() => import('./components/EditMode/EditMode').then(m => ({ default: m.EditMode })));
const StreamRoute = lazy(() => import('./components/Streaming/StreamMode').then(m => ({ default: m.StreamMode })));
const ExportRoute = lazy(() => import('./components/ExportMode/ExportMode').then(m => ({ default: m.ExportMode })));
const SettingsRoute = lazy(() => import('./components/Settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
import LandingPage from './components/LandingPage/LandingPage';
import ProjectManager from './components/ProjectManager/ProjectManager';
import './index.css';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ThemeProvider>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/projects" element={<ProjectManager />} />
              <Route element={<AppShell />}>
                <Route path="/recorder" element={<ScreenRecorder />} />
                <Route path="/editor" element={<EditorRoute />} />
                <Route path="/editor/:projectId" element={<EditorRoute />} />
                <Route path="/stream" element={<StreamRoute />} />
                <Route path="/export" element={<ExportRoute />} />
                <Route path="/settings" element={<SettingsRoute />} />
              </Route>
            </Routes>
          </Suspense>
            <Suspense fallback={null}><Analytics /></Suspense>
        </ThemeProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
