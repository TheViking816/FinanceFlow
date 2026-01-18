
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './services/supabase';
import { fetchAllData, cleanTicker } from './services/dataService';
import { Holding, PortfolioSummary, MarketData } from './types';

type SortConfig = { key: keyof Holding | 'rangeScore' | 'none', direction: 'asc' | 'desc' };

const Logo = ({ className = "w-8 h-8" }) => (
  <div className={`${className} bg-gradient-to-br from-teal-400 to-teal-600 rounded-xl shadow-lg shadow-teal-900/20 flex items-center justify-center overflow-hidden`}>
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 3L4 14h7v7l9-11h-7z" />
    </svg>
  </div>
);

const Range52w = ({ price, low, high, thin = false, isDark = true }: { price: number, low: number, high: number, thin?: boolean, isDark?: boolean }) => {
  const labelClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const trackClass = isDark ? 'bg-slate-800 border border-slate-700' : 'bg-slate-100 border border-slate-200';
  if (!low || !high) return <div className={`text-xs ${labelClass}`}>N/A</div>;
  const percent = ((price - low) / (high - low)) * 100;
  const clamped = Math.min(Math.max(percent, 0), 100);
  
  return (
    <div className={`${thin ? 'w-16' : 'w-24'} flex flex-col gap-1`}>
      {!thin && (
        <div className={`flex justify-between text-xs font-bold ${labelClass} uppercase`}>
          <span>{low.toFixed(1)}</span>
          <span>{high.toFixed(1)}</span>
        </div>
      )}
      <div className={`${thin ? 'h-1' : 'h-1.5'} w-full ${trackClass} rounded-full overflow-hidden relative`}>
        <div 
          className={`absolute h-full ${thin ? 'w-1.5' : 'w-2'} bg-teal-500 rounded-full shadow-[0_0_8px_rgba(20,184,166,0.6)] transition-all duration-1000`}
          style={{ left: `calc(${clamped}% - ${thin ? '3px' : '4px'})` }}
        />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'screener'>('portfolio');
  const [portfolio, setPortfolio] = useState<{ holdings: Holding[], summary: PortfolioSummary } | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'valueInEUR', direction: 'desc' });
  
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('ff-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('ff-theme', theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) loadData();
    else if (!loading) setLoading(false);
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { marketData: mData, holdings, summary } = await fetchAllData();
      setMarketData(mData);
      setPortfolio({ holdings, summary });
    } catch (err) {
      console.error("Error sincronizando con Sheets:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError('Error: Credenciales inválidas');
  };

  const sortedHoldings = useMemo(() => {
    if (!portfolio?.holdings) return [];
    const items = [...portfolio.holdings];
    if (sortConfig.key !== 'none') {
      items.sort((a: any, b: any) => {
        let aVal, bVal;
        
        if (sortConfig.key === 'rangeScore') {
          // Calcular score de proximidad al mínimo (0-100)
          aVal = (a.low52w && a.high52w) ? (a.price - a.low52w) / (a.high52w - a.low52w) : 999;
          bVal = (b.low52w && b.high52w) ? (b.price - b.low52w) / (b.high52w - b.low52w) : 999;
        } else {
          aVal = a[sortConfig.key as keyof Holding] ?? 0;
          bVal = b[sortConfig.key as keyof Holding] ?? 0;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [portfolio, sortConfig]);

  const screenerInsights = useMemo(() => {
    if (!marketData || !portfolio) return null;
    const stocks = Object.values(marketData) as MarketData[string][];
    
    const byPer = stocks
      .filter(s => s.per !== 'N/A' && s.per !== '' && !isNaN(Number(s.per)) && Number(s.per) > 0)
      .sort((a, b) => Number(a.per) - Number(b.per))
      .slice(0, 10);

    const byYield = stocks
      .filter(s => s.yieldPct > 0)
      .sort((a, b) => b.yieldPct - a.yieldPct)
      .slice(0, 10);

    const byLoss = [...portfolio.holdings]
      .sort((a, b) => a.gainLoss - b.gainLoss)
      .slice(0, 10);

    const byNearLow = stocks
      .filter(s => s.low52w !== undefined && s.high52w !== undefined && s.low52w > 0 && s.high52w > s.low52w)
      .sort((a, b) => {
        const scoreA = (a.price - (a.low52w || 0)) / ((a.high52w || 0) - (a.low52w || 0));
        const scoreB = (b.price - (b.low52w || 0)) / ((b.high52w || 0) - (b.low52w || 0));
        return scoreA - scoreB;
      })
      .slice(0, 10);

    return { byPer, byYield, byLoss, byNearLow };
  }, [marketData, portfolio]);

  const requestSort = (key: keyof Holding | 'rangeScore') => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
  const portfolioYoc = portfolio?.summary?.yoc ?? 0;
  const isDark = theme === 'dark';
  const pageClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900';
  const surfaceClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const surfaceSoftClass = isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50/80 border-slate-200';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-500';
  const mutedTextStrong = isDark ? 'text-slate-300' : 'text-slate-600';
  const primaryText = isDark ? 'text-slate-100' : 'text-slate-900';
  const navIdleClass = isDark ? 'text-slate-500 border-transparent hover:text-white' : 'text-slate-500 border-transparent hover:text-slate-900';
  const headerMutedText = isDark ? 'text-slate-400' : 'text-slate-600';
  const dividerClass = isDark ? 'divide-slate-800' : 'divide-slate-100';
  const rowHoverClass = isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50/80';
  const headerRowClass = isDark ? 'text-slate-300 border-slate-800' : 'text-slate-500 border-slate-200';
  const tableTitleClass = isDark ? 'text-amber-300' : 'text-amber-600';
  const sheetBadgeClass = isDark ? 'text-teal-300 bg-teal-900/40 border-teal-800' : 'text-teal-600 bg-teal-50 border-teal-100';
  const gainPositiveClass = isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600';
  const gainNegativeClass = isDark ? 'bg-red-900/40 text-red-500' : 'bg-red-50 text-red-500';
  const hoverBorderClass = isDark ? 'hover:border-slate-800' : 'hover:border-slate-200';

  if (loading && user) return (
    <div className={`flex h-screen items-center justify-center ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="text-center">
        <Logo className="w-16 h-16 mx-auto mb-6 animate-bounce" />
        <p className="text-teal-400 font-black text-sm uppercase tracking-[0.3em] animate-pulse">Analizando Cartera DGI...</p>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${pageClass} font-sans pb-24 md:pb-10`}>
      <header className={`sticky top-0 z-40 shadow-2xl border-b ${isDark ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="w-10 h-10" />
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter uppercase leading-none">FinanceFlow <span className="text-teal-400">DGI</span></span>
              <span className="text-xs font-bold text-teal-500 uppercase tracking-widest mt-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse"></span> Terminal v2.5
              </span>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-12 text-sm font-black uppercase tracking-[0.2em]">
            <button onClick={() => setActiveTab('portfolio')} className={`transition-all pb-1 border-b-2 ${activeTab === 'portfolio' ? 'text-teal-400 border-teal-400' : navIdleClass}`}>Cartera</button>
            <button onClick={() => setActiveTab('screener')} className={`transition-all pb-1 border-b-2 ${activeTab === 'screener' ? 'text-teal-400 border-teal-400' : navIdleClass}`}>Screener</button>
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-black text-xs uppercase tracking-widest transition shadow-lg ${isDark ? 'bg-slate-800 border-slate-700 text-teal-300 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-teal-600 hover:bg-slate-200'}`}
              title="Cambiar tema"
            >
              <span className="text-base leading-none">{isDark ? '☀️' : '🌙'}</span>
              <span className="hidden md:inline">{isDark ? 'Claro' : 'Oscuro'}</span>
            </button>
            {user ? (
              <div className="flex items-center gap-3">
                <button onClick={loadData} className={`p-2.5 rounded-xl transition shadow-lg border active:scale-90 ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-teal-400 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-teal-600 border-slate-200'}`} title="Refrescar desde Sheets">
                  <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <button onClick={() => supabase.auth.signOut()} className={`hidden md:block text-xs font-black ${headerMutedText} hover:text-red-400 uppercase tracking-widest transition`}>Cerrar Sesión</button>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="bg-teal-500 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-teal-400 transition shadow-lg shadow-teal-900/20">Acceder</button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {!user ? (
          <div className="max-w-md mx-auto mt-12 text-center">
            {showLogin ? (
              <div className={`rounded-[2.5rem] shadow-2xl p-10 border animate-in zoom-in-95 ${surfaceClass}`}>
                <h2 className={`text-3xl font-black mb-8 tracking-tight ${primaryText}`}>Acceso Cartera</h2>
                <form onSubmit={handleAuth} className="space-y-5">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={`w-full border-0 rounded-2xl px-6 py-4 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`} placeholder="Email" required />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={`w-full border-0 rounded-2xl px-6 py-4 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`} placeholder="Password" required />
                  {authError && <p className="text-red-500 text-xs font-bold">{authError}</p>}
                  <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95">Entrar</button>
                </form>
              </div>
            ) : (
              <div className={`rounded-[3rem] shadow-2xl p-12 border animate-in fade-in slide-in-from-bottom-8 ${surfaceClass}`}>
                <Logo className="w-24 h-24 mx-auto mb-10" />
                <h2 className={`text-4xl font-black mb-2 tracking-tighter uppercase ${primaryText}`}>DGI Monitor</h2>
                <p className={`font-bold text-sm uppercase tracking-widest mb-10 ${mutedText}`}>Visualizador de Activos de Dividendos</p>
                <button onClick={() => setShowLogin(true)} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-xl hover:bg-black transition-all shadow-2xl active:scale-95">Conectar Cartera</button>
              </div>
            )}
          </div>
        ) : (
          <>
            {activeTab === 'portfolio' && (
              <>
                <div className="mb-6 md:mb-8 animate-in fade-in slide-in-from-top-4">
                  <div className={`text-xs md:text-sm font-black uppercase tracking-[0.35em] ${mutedText}`}>Cartera Total</div>
                  <div className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-teal-400 via-cyan-300 to-amber-300 text-transparent bg-clip-text">
                    Resumen Ejecutivo
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-10 animate-in fade-in slide-in-from-top-4">
                {[
                  { label: 'Valor Cartera', value: formatCurrency(portfolio?.summary.totalValue || 0), color: primaryText },
                  { 
                    label: 'Ingresos', 
                    value: (
                      <div className="flex flex-col">
                        <span className="text-teal-400 text-2xl">{formatCurrency(portfolio?.summary.totalAnnualIncome || 0)} <small className="text-xs opacity-60">/AÑO</small></span>
                        <span className="text-amber-300 text-xl">{formatCurrency(portfolio?.summary.monthlyIncome || 0)} <small className="text-xs opacity-60">/MES</small></span>
                      </div>
                    ), 
                    color: '' 
                  },
                  { 
                    label: 'Rentabilidad', 
                    value: (
                      <div className="flex flex-col">
                        <span className="text-teal-400 text-2xl">{portfolio?.summary.dividendYield.toFixed(2)}% <small className="text-xs opacity-60">YIELD</small></span>
                        <span className="text-amber-300 text-xl">{portfolioYoc.toFixed(2)}% <small className="text-xs opacity-60">YOC</small></span>
                      </div>
                    ), 
                    color: '' 
                  },
                  { label: 'Total Activos', value: portfolio?.summary.holdingsCount, color: mutedTextStrong },
                ].map((card, idx) => (
                  <div key={idx} className={`p-6 md:p-8 rounded-[2.5rem] shadow-sm border flex flex-col justify-center hover:shadow-md transition-shadow ${surfaceClass}`}>
                    <p className={`text-xs font-black uppercase tracking-[0.25em] mb-3 ${mutedText}`}>{card.label}</p>
                    <div className={`text-3xl md:text-4xl font-black tracking-tighter ${card.color}`}>{card.value}</div>
                  </div>
                ))}
              </div>
              </>
            )}

            {activeTab === 'portfolio' ? (
              <div className={`rounded-[2.5rem] shadow-sm border overflow-hidden mb-12 ${surfaceClass}`}>
                <div className={`px-8 py-6 border-b flex justify-between items-center ${surfaceSoftClass}`}>
                  <h3 className={`font-black text-xs uppercase tracking-[0.3em] ${tableTitleClass}`}>Monitor de Activos en Tiempo Real</h3>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${sheetBadgeClass}`}>Sheets Direct Link</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`border-b text-sm uppercase tracking-widest font-black ${headerRowClass}`}>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => requestSort('ticker')}>Activo</th>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors text-center" onClick={() => requestSort('shares')}>Acciones</th>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => requestSort('valueInEUR')}>Valor EUR</th>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors text-center" onClick={() => requestSort('gainLoss')}>Retorno %</th>
                        <th className="px-6 py-6 text-center cursor-pointer hover:text-teal-600 transition-colors" onClick={() => requestSort('rangeScore')}>Rango 52S</th>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors text-center" onClick={() => requestSort('yieldPct')}>Yield %</th>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors text-center" onClick={() => requestSort('yoc')}>YoC %</th>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors" onClick={() => requestSort('annualIncomeEUR')}>Renta Año</th>
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors text-right" onClick={() => requestSort('dailyChange')}>24H %</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${dividerClass}`}>
                      {sortedHoldings.map((h) => (
                        <tr key={h.id} className={`group transition-all duration-300 ${rowHoverClass}`}>
                          <td className="px-6 py-5">
                            <div className={`font-black text-xl leading-tight ${primaryText}`}>{h.ticker}</div>
                            <div className={`text-sm font-bold uppercase mt-1 tracking-wider truncate max-w-[150px] ${mutedText}`}>{h.name}</div>
                          </td>
                          <td className={`px-6 py-5 font-bold text-center text-lg ${mutedTextStrong}`}>{h.shares}</td>
                          <td className={`px-6 py-5 font-black whitespace-nowrap text-lg ${primaryText}`}>{formatCurrency(h.valueInEUR)}</td>
                          <td className="px-6 py-5 text-center">
                            <span className={`text-sm font-black px-3 py-1.5 rounded-xl ${h.gainLoss >= 0 ? gainPositiveClass : gainNegativeClass}`}>
                              {h.gainLoss >= 0 ? '▲' : '▼'} {Math.abs(h.gainLoss).toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-6 py-5 flex justify-center items-center h-full mt-2">
                             <Range52w price={h.price} low={h.low52w} high={h.high52w} isDark={isDark} />
                          </td>
                          <td className="px-6 py-5 font-black text-teal-400 text-lg text-center">{h.yieldPct.toFixed(2)}%</td>
                          <td className="px-6 py-5 font-black text-amber-400 text-base text-center">{h.yoc.toFixed(2)}%</td>
                          <td className={`px-6 py-5 font-black whitespace-nowrap text-lg ${mutedTextStrong}`}>{formatCurrency(h.annualIncomeEUR)}</td>
                          <td className="px-6 py-5 text-right">
                            <span className={`text-base font-black ${h.dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {h.dailyChange >= 0 ? '+' : ''}{h.dailyChange.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-8">
                  {/* Min PER */}
                  <div className={`rounded-[2.5rem] p-8 shadow-sm border flex flex-col ${surfaceClass}`}>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-teal-400 mb-8 flex items-center gap-3">
                       <span className="w-2 h-2 bg-teal-600 rounded-full"></span> Min PER
                    </h4>
                    <div className="space-y-4 flex-1">
                      {screenerInsights?.byPer.map(s => (
                        <div key={s.ticker} className={`flex justify-between items-center group p-4 rounded-2xl transition-all border border-transparent ${rowHoverClass} ${hoverBorderClass}`}>
                          <div>
                            <div className={`font-black tracking-tight text-lg ${primaryText}`}>{cleanTicker(s.ticker)}</div>
                            <div className={`text-sm font-bold uppercase truncate max-w-[120px] ${mutedText}`}>{s.name}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-teal-400 text-lg">{Number(s.per).toFixed(1)}x</div>
                            <div className={`text-sm font-bold ${mutedText}`}>Yield: {s.yieldPct.toFixed(1)}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Max Yield */}
                  <div className={`rounded-[2.5rem] p-8 shadow-sm border flex flex-col ${surfaceClass}`}>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-amber-400 mb-8 flex items-center gap-3">
                       <span className="w-2 h-2 bg-amber-600 rounded-full"></span> Max Yield
                    </h4>
                    <div className="space-y-4 flex-1">
                      {screenerInsights?.byYield.map(s => (
                        <div key={s.ticker} className={`flex justify-between items-center group p-4 rounded-2xl transition-all border border-transparent ${rowHoverClass} ${hoverBorderClass}`}>
                          <div>
                            <div className={`font-black tracking-tight text-lg ${primaryText}`}>{cleanTicker(s.ticker)}</div>
                            <div className={`text-sm font-bold uppercase truncate max-w-[120px] ${mutedText}`}>{s.name}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-amber-400 text-lg">{s.yieldPct.toFixed(2)}%</div>
                            <div className={`text-sm font-bold ${mutedText}`}>PER: {s.per}x</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Near 52w Low */}
                  <div className={`rounded-[2.5rem] p-8 shadow-sm border flex flex-col ${surfaceClass}`}>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400 mb-8 flex items-center gap-3">
                       <span className="w-2 h-2 bg-indigo-600 rounded-full"></span> 52w Low
                    </h4>
                    <div className="space-y-4 flex-1">
                      {screenerInsights?.byNearLow.map(s => (
                        <div key={s.ticker} className={`flex justify-between items-center group p-4 rounded-2xl transition-all border border-transparent ${rowHoverClass} ${hoverBorderClass}`}>
                          <div>
                            <div className={`font-black tracking-tight text-lg ${primaryText}`}>{cleanTicker(s.ticker)}</div>
                            <div className={`text-sm font-bold uppercase truncate max-w-[120px] ${mutedText}`}>{s.name}</div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            <Range52w price={s.price} low={s.low52w || 0} high={s.high52w || 0} thin={true} isDark={isDark} />
                            <div className="text-sm font-black text-indigo-400">NEAR LOW</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Max Loss (Cartera) */}
                  <div className={`rounded-[2.5rem] p-8 shadow-sm border flex flex-col ${surfaceClass}`}>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-red-400 mb-8 flex items-center gap-3">
                       <span className="w-2 h-2 bg-red-500 rounded-full"></span> Max Loss                    </h4>
                    <div className="space-y-4 flex-1">
                      {screenerInsights?.byLoss.map(h => (
                        <div key={h.id} className={`flex justify-between items-center group p-4 rounded-2xl transition-all border border-transparent ${rowHoverClass} ${hoverBorderClass}`}>
                          <div>
                            <div className={`font-black tracking-tight text-lg ${primaryText}`}>{h.ticker}</div>
                            <div className={`text-sm font-bold uppercase truncate max-w-[120px] ${mutedText}`}>{h.name}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-black text-lg ${h.gainLoss < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {h.gainLoss.toFixed(2)}%
                            </div>
                            <div className={`text-sm font-bold ${mutedText}`}>Yield: {h.yieldPct.toFixed(1)}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {user && (
        <footer className={`fixed bottom-0 inset-x-0 border-t md:hidden z-50 safe-bottom shadow-[0_-10px_30px_rgba(0,0,0,0.3)] ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-around h-20">
            <button 
              onClick={() => setActiveTab('portfolio')}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all ${activeTab === 'portfolio' ? (isDark ? 'text-teal-400 bg-slate-800/50' : 'text-teal-600 bg-slate-100') : 'text-slate-500'}`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2v8a2 2 0 002 2z" /></svg>
              <span className="text-xs font-black uppercase tracking-widest">Cartera</span>
            </button>
            <button 
              onClick={loadData}
              className="flex items-center justify-center -mt-10"
            >
              <div className={`bg-teal-500 p-4 rounded-2xl shadow-xl border-4 active:scale-90 transition-transform ${isDark ? 'shadow-teal-900/40 border-slate-900' : 'shadow-teal-500/30 border-white'}`}>
                <svg className={`w-6 h-6 text-white ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('screener')}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all ${activeTab === 'screener' ? (isDark ? 'text-teal-400 bg-slate-800/50' : 'text-teal-600 bg-slate-100') : 'text-slate-500'}`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <span className="text-xs font-black uppercase tracking-widest">Screener</span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default App;
