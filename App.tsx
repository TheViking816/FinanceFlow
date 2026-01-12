
import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import InstallPromptBanner from './components/InstallPromptBanner';
import { SessionProvider } from './hooks/useSession';
import { ToastProvider } from './components/ToastProvider';
import RequireAuth from './components/RequireAuth';
import { DarkModeProvider } from './hooks/useDarkMode';

const Dashboard = React.lazy(() => import('./screens/Dashboard'));
const Accounts = React.lazy(() => import('./screens/Accounts'));
const Portfolio = React.lazy(() => import('./screens/Portfolio'));
const Goals = React.lazy(() => import('./screens/Goals'));
const Settings = React.lazy(() => import('./screens/Settings'));
const Onboarding = React.lazy(() => import('./screens/Onboarding'));
const AssetDetail = React.lazy(() => import('./screens/AssetDetail'));
const AddTransaction = React.lazy(() => import('./screens/AddTransaction'));
const EditTransaction = React.lazy(() => import('./screens/EditTransaction'));
const Reports = React.lazy(() => import('./screens/Reports'));
const ImportPortfolio = React.lazy(() => import('./screens/ImportPortfolio'));
const PortfolioStats = React.lazy(() => import('./screens/PortfolioStats'));

const AppContent: React.FC = () => {
  const location = useLocation();
  const hideNav =
    ['/', '/onboarding', '/add-transaction', '/import-portfolio'].includes(location.pathname) ||
    location.pathname.startsWith('/asset/') ||
    location.pathname.startsWith('/edit-transaction');

  return (
    <div
      className={`max-w-md mx-auto min-h-screen relative flex flex-col overflow-x-hidden bg-background-light dark:bg-background-dark ${
        hideNav ? '' : 'safe-bottom-offset'
      }`}
    >
      <InstallPromptBanner />
      <Suspense fallback={<div className="px-6 py-6 text-sm text-slate-500">Cargando...</div>}>
        <Routes>
          <Route path="/" element={<Onboarding />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/accounts"
            element={
              <RequireAuth>
                <Accounts />
              </RequireAuth>
            }
          />
          <Route
            path="/portfolio"
            element={
              <RequireAuth>
                <Portfolio />
              </RequireAuth>
            }
          />
          <Route
            path="/portfolio-stats"
            element={
              <RequireAuth>
                <PortfolioStats />
              </RequireAuth>
            }
          />
          <Route
            path="/goals"
            element={
              <RequireAuth>
                <Goals />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          <Route
            path="/asset/:id"
            element={
              <RequireAuth>
                <AssetDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/add-transaction"
            element={
              <RequireAuth>
                <AddTransaction />
              </RequireAuth>
            }
          />
          <Route
            path="/edit-transaction/:id"
            element={
              <RequireAuth>
                <EditTransaction />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <Reports />
              </RequireAuth>
            }
          />
          <Route
            path="/import-portfolio"
            element={
              <RequireAuth>
                <ImportPortfolio />
              </RequireAuth>
            }
          />
        </Routes>
      </Suspense>
      {!hideNav && <BottomNav />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <SessionProvider>
        <ToastProvider>
          <DarkModeProvider>
            <AppContent />
          </DarkModeProvider>
        </ToastProvider>
      </SessionProvider>
    </HashRouter>
  );
};

export default App;
