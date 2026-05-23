import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AppShell } from './components/AppShell/AppShell';
import ScreenRecorder from './components/ScreenRecorder';
import { EditMode } from './components/EditMode/EditMode';
import { ExportMode } from './components/ExportMode/ExportMode';
import { SettingsPage } from './components/Settings/SettingsPage';
import LandingPage from './components/LandingPage/LandingPage';
import './index.css';

function App() {
  return (
    <Router>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route element={<AppShell />}>
            <Route path="/recorder" element={<ScreenRecorder />} />
            <Route path="/editor" element={<EditMode />} />
            <Route path="/export" element={<ExportMode />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        <Analytics />
      </ThemeProvider>
    </Router>
  );
}

export default App;
