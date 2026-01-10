import React, { useState } from 'react';
import useInstallPrompt from '../hooks/useInstallPrompt';

const InstallPromptBanner: React.FC = () => {
  const { isInstallable, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!isInstallable || dismissed) {
    return null;
  }

  return (
    <div className="sticky top-0 z-40 px-4 pt-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
        <div className="flex-1 text-xs text-slate-600 dark:text-slate-300">
          Instala FinanceFlow para acceder m&#225;s r&#225;pido desde tu pantalla de inicio.
        </div>
        <button
          className="min-h-[44px] px-3 text-xs font-bold text-primary"
          onClick={() => promptInstall()}
        >
          Instalar
        </button>
        <button
          className="min-h-[44px] px-2 text-xs text-slate-400"
          onClick={() => setDismissed(true)}
          aria-label="Ocultar"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
};

export default InstallPromptBanner;
