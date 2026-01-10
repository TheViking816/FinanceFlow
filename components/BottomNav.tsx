
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: 'home', path: '/dashboard' },
    { id: 'accounts', label: 'Cuentas', icon: 'account_balance', path: '/accounts' },
    { id: 'portfolio', label: 'Cartera', icon: 'trending_up', path: '/portfolio' },
    { id: 'goals', label: 'Objetivos', icon: 'track_changes', path: '/goals' },
    { id: 'settings', label: 'Ajustes', icon: 'settings', path: '/settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 safe-pb z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200 ${
                isActive ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <span className={`material-symbols-outlined text-[26px] ${isActive ? 'fill-[1]' : ''}`}>
                {item.icon}
              </span>
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
