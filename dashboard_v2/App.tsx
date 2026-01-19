
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './services/supabase';
import { fetchAllData, cleanTicker } from './services/dataService';
import { Holding, PortfolioSummary, MarketData, HoldingUser, HoldingPending } from './types';

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

const findMarketEntry = (input: string, mData: MarketData | null) => {
  if (!mData || !input) return null;
  if (mData[input]) return { key: input, data: mData[input] };
  const cleanInput = cleanTicker(input).toUpperCase();
  const matchKey = Object.keys(mData).find((key) => cleanTicker(key).toUpperCase() === cleanInput);
  return matchKey ? { key: matchKey, data: mData[matchKey] } : null;
};

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'screener'>('portfolio');
  const [portfolio, setPortfolio] = useState<{ holdings: Holding[], summary: PortfolioSummary } | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'valueInEUR', direction: 'desc' });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [editHolding, setEditHolding] = useState<Holding | null>(null);
  const [addForm, setAddForm] = useState({ ticker: '', shares: '', costPerShare: '' });
  const [manualForm, setManualForm] = useState({ ticker: '', shares: '', costPerShare: '' });
  const [addError, setAddError] = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
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
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallButton(false);
    }
    setDeferredPrompt(null);
  };

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

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name, base_currency')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error cargando perfil:', error);
          return;
        }
        if (data?.display_name) setDisplayName(data.display_name);
        if (data?.base_currency) setBaseCurrency(data.base_currency.toUpperCase());
      });
  }, [user]);

  const buildHoldingsFromHoldings = (entries: HoldingUser[], mData: MarketData, pendingMap: Map<string, HoldingPending>) => {
    const byCleanTicker = new Map<string, { key: string, data: MarketData[string] }>();
    Object.entries(mData).forEach(([key, data]) => {
      const clean = cleanTicker(key).toUpperCase();
      if (!byCleanTicker.has(clean)) byCleanTicker.set(clean, { key, data });
    });

    let totalCostBasisEUR = 0;
    const holdings: Holding[] = entries.map((entry) => {
      const inputTicker = entry.ticker.trim();
      const cleanInput = cleanTicker(inputTicker).toUpperCase();
      const match = mData[inputTicker] ? { key: inputTicker, data: mData[inputTicker] } : byCleanTicker.get(cleanInput);
      const override = pendingMap.get(cleanInput);
      const md = match?.data;
      const rawTicker = match?.key || inputTicker;
      const price = md?.price ?? override?.price ?? 0;
      const fx = md?.fx ?? 1;
      const shares = Number(entry.quantity) || 0;
      const costPerShare = Number(entry.avg_price) || 0;
      const valueInEUR = shares * price * fx;
      const costBasisEUR = shares * costPerShare * fx;
      totalCostBasisEUR += costBasisEUR;
      const gainLoss = costBasisEUR > 0 ? ((valueInEUR - costBasisEUR) / costBasisEUR) * 100 : 0;
      const yieldPct = md?.yieldPct ?? override?.yield_pct ?? 0;
      const annualIncomeEUR = md?.income ?? (yieldPct / 100) * valueInEUR;

      return {
        id: `h-${entry.id}`,
        sourceId: entry.id,
        ticker: cleanTicker(rawTicker),
        rawTicker,
        name: md?.name || override?.name || inputTicker,
        shares,
        price,
        costPerShare,
        currency: entry.currency || override?.currency || md?.currency || 'EUR',
        valueInEUR,
        gainLoss,
        yieldPct,
        annualIncomeEUR,
        per: md?.per ?? 'N/A',
        yoc: costBasisEUR > 0 ? (annualIncomeEUR / costBasisEUR) * 100 : 0,
        weight: 0,
        dailyChange: md?.dailyChange ?? override?.daily_change ?? 0,
        low52w: md?.low52w ?? override?.low52w ?? 0,
        high52w: md?.high52w ?? override?.high52w ?? 0
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.valueInEUR, 0);
    const totalAnnualIncome = holdings.reduce((sum, h) => sum + h.annualIncomeEUR, 0);
    holdings.forEach(h => {
      h.weight = totalValue > 0 ? (h.valueInEUR / totalValue) * 100 : 0;
    });

    return {
      holdings,
      summary: {
        totalValue,
        totalAnnualIncome,
        monthlyIncome: totalAnnualIncome / 12,
        dividendYield: totalValue > 0 ? (totalAnnualIncome / totalValue) * 100 : 0,
        yoc: totalCostBasisEUR > 0 ? (totalAnnualIncome / totalCostBasisEUR) * 100 : 0,
        holdingsCount: holdings.length,
        dailyChange: 0
      }
    };
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { marketData: mData, holdings: sheetHoldings, summary: sheetSummary } = await fetchAllData();
      setMarketData(mData);

      let holdings: Holding[] = [];
      let summary: PortfolioSummary = {
        totalValue: 0,
        totalAnnualIncome: 0,
        monthlyIncome: 0,
        dividendYield: 0,
        yoc: 0,
        holdingsCount: 0,
        dailyChange: 0
      };

      if (user) {
        const [{ data: holdingsRows, error }, { data: pendingRows, error: pendingError }] = await Promise.all([
          supabase.from('holdings').select('*').eq('user_id', user.id),
          supabase.from('holdings_pending').select('*').eq('user_id', user.id)
        ]);

        if (error) {
          console.error("Error cargando posiciones:", error);
        } else if (holdingsRows && holdingsRows.length > 0) {
          const pendingMap = new Map<string, HoldingPending>();
          (pendingRows || []).forEach((row) => {
            const clean = cleanTicker(row.ticker).toUpperCase();
            pendingMap.set(clean, row as HoldingPending);
          });
          if (pendingError) {
            console.error("Error cargando pendientes:", pendingError);
          }
          const built = buildHoldingsFromHoldings(holdingsRows as HoldingUser[], mData, pendingMap);
          holdings = built.holdings;
          summary = built.summary;
        }
      }

      if (!user) {
        holdings = sheetHoldings;
        summary = sheetSummary;
      }

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
    if (isSignup) {
      const normalizedCurrency = baseCurrency.trim().toUpperCase();
      if (!['EUR', 'USD', 'GBP'].includes(normalizedCurrency)) {
        setAuthError('Divisa base inválida.');
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthError('No se pudo crear la cuenta.');
        return;
      }
      const userId = data.user?.id;
      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ user_id: userId, display_name: displayName.trim(), base_currency: normalizedCurrency }]);
        if (profileError) {
          console.error('Error guardando perfil:', profileError);
          setAuthError('Cuenta creada, pero no se pudo guardar el perfil.');
          return;
        }
      }
      setAuthError('Cuenta creada correctamente.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError('Error: Credenciales inválidas');
    }
  };

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAddError('');
    const ticker = addForm.ticker.trim().toUpperCase();
    const shares = Number(addForm.shares);
    const costPerShare = Number(addForm.costPerShare);
    const currency = baseCurrency.trim().toUpperCase() || 'EUR';
    const marketMatch = findMarketEntry(ticker, marketData);

    if (!ticker || !isFinite(shares) || shares <= 0 || !isFinite(costPerShare) || costPerShare <= 0) {
      setAddError('Revisa ticker, acciones y precio de compra.');
      return;
    }

    if (!marketMatch) {
      setManualForm({ ticker, shares: addForm.shares, costPerShare: addForm.costPerShare });
      setShowManualModal(true);
      return;
    }

    const { error } = await supabase
      .from('holdings')
      .insert([{ user_id: user.id, ticker, quantity: shares, avg_price: costPerShare, currency }]);

    if (error) {
      setAddError('No se pudo guardar la posición.');
      console.error('Error guardando posición:', error);
      return;
    }

    setShowAddModal(false);
    setAddForm({ ticker: '', shares: '', costPerShare: '' });
    loadData();
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAddError('');
    const ticker = manualForm.ticker.trim().toUpperCase();
    const shares = Number(manualForm.shares);
    const costPerShare = Number(manualForm.costPerShare);
    const currency = baseCurrency.trim().toUpperCase() || 'EUR';

    if (!ticker || !isFinite(shares) || shares <= 0 || !isFinite(costPerShare) || costPerShare <= 0) {
      setAddError('Revisa ticker, acciones y precio de compra.');
      return;
    }

    const { error: pendingError } = await supabase
      .from('holdings_pending')
      .insert([{
        user_id: user.id,
        ticker,
        name: null,
        currency,
        price: costPerShare,
        yield_pct: 0,
        low52w: null,
        high52w: null,
        daily_change: 0
      }]);

    if (pendingError) {
      setAddError('No se pudo guardar el ticker pendiente.');
      console.error('Error guardando pendiente:', pendingError);
      return;
    }

    const { error } = await supabase
      .from('holdings')
      .insert([{ user_id: user.id, ticker, quantity: shares, avg_price: costPerShare, currency }]);

    if (error) {
      setAddError('No se pudo guardar la posición.');
      console.error('Error guardando posición:', error);
      return;
    }

    setShowManualModal(false);
    setShowAddModal(false);
    setManualForm({ ticker: '', shares: '', costPerShare: '' });
    setAddForm({ ticker: '', shares: '', costPerShare: '' });
    loadData();
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editHolding?.sourceId) return;
    const shares = Number(manualForm.shares);
    const costPerShare = Number(manualForm.costPerShare);
    if (!isFinite(shares) || shares <= 0 || !isFinite(costPerShare) || costPerShare <= 0) {
      setAddError('Revisa acciones y precio de compra.');
      return;
    }

    const { error } = await supabase
      .from('holdings')
      .update({ quantity: shares, avg_price: costPerShare })
      .eq('id', editHolding.sourceId)
      .eq('user_id', user.id);

    if (error) {
      setAddError('No se pudo actualizar la posición.');
      console.error('Error actualizando posición:', error);
      return;
    }

    await supabase
      .from('holdings_pending')
      .update({ price: costPerShare })
      .eq('user_id', user.id)
      .eq('ticker', editHolding.rawTicker);

    setEditHolding(null);
    setManualForm({ ticker: '', shares: '', costPerShare: '' });
    loadData();
  };

  const handleDeleteHolding = async (holding: Holding) => {
    if (!user || !holding.sourceId) return;
    if (!window.confirm(`Eliminar ${holding.ticker}?`)) return;
    const { error } = await supabase
      .from('holdings')
      .delete()
      .eq('id', holding.sourceId)
      .eq('user_id', user.id);
    if (error) {
      console.error('Error eliminando posición:', error);
      return;
    }
    await supabase
      .from('holdings_pending')
      .delete()
      .eq('user_id', user.id)
      .eq('ticker', holding.rawTicker);
    loadData();
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
      .filter((h) => h.gainLoss < 0)
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
  const tickerOptions = useMemo(() => {
    if (!marketData) return [];
    const map = new Map<string, string>();
    Object.entries(marketData).forEach(([key, data]) => {
      const ticker = cleanTicker(key).toUpperCase();
      if (!map.has(ticker)) map.set(ticker, data.name || ticker);
    });
    return Array.from(map.entries())
      .map(([ticker, name]) => ({ ticker, name }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [marketData]);

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
      {user && (
        <header className={`sticky top-0 z-40 shadow-2xl border-b ${isDark ? 'bg-slate-900 text-white border-slate-800' : 'bg-white text-slate-900 border-slate-200'}`}>
          <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo className="w-10 h-10" />
              <div className="flex flex-col">
                <span className="text-xl font-black tracking-tighter uppercase leading-none">FinanceFlow <span className="text-teal-400">DGI</span></span>
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
              <div className="flex items-center gap-3">
                <button onClick={loadData} className={`p-2.5 rounded-xl transition shadow-lg border active:scale-90 ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-teal-400 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-teal-600 border-slate-200'}`} title="Refrescar desde Sheets">
                  <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <button onClick={() => supabase.auth.signOut()} className={`hidden md:block text-xs font-black ${headerMutedText} hover:text-red-400 uppercase tracking-widest transition`}>Cerrar Sesión</button>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {!user ? (
          <div className="max-w-md mx-auto mt-12 text-center">
            <div className={`rounded-[2.5rem] shadow-2xl p-10 border animate-in zoom-in-95 ${surfaceClass}`}>
              <div className="flex flex-col items-center mb-8">
                <Logo className="w-16 h-16 mb-4" />
                <h2 className={`text-3xl font-black tracking-tight ${primaryText}`}>{isSignup ? 'Crear Cuenta' : 'FinanceFlow'}</h2>
                <p className={`text-xs uppercase tracking-[0.35em] mt-2 ${mutedText}`}>Dashboard DGI</p>
              </div>
              <form onSubmit={handleAuth} className="space-y-5">
                {isSignup && (
                  <>
                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className={`w-full border-0 rounded-2xl px-6 py-4 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`} placeholder="Nombre" required />
                    <select value={baseCurrency} onChange={e => setBaseCurrency(e.target.value)} className={`w-full border-0 rounded-2xl px-6 py-4 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-slate-50 text-slate-900'}`} required>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </>
                )}
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={`w-full border-0 rounded-2xl px-6 py-4 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`} placeholder="Email" required />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={`w-full border-0 rounded-2xl px-6 py-4 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`} placeholder="Password" required />
                {authError && <p className={`${authError.startsWith('Cuenta creada') ? 'text-emerald-400' : 'text-red-500'} text-sm font-bold`}>{authError}</p>}
                <button type="submit" className="w-full bg-teal-500 text-slate-900 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-teal-400 transition-all shadow-xl active:scale-95">
                  {isSignup ? 'Crear Cuenta' : 'Entrar'}
                </button>
              </form>
              <div className="mt-6 text-sm font-bold">
                <button onClick={() => { setIsSignup(!isSignup); setAuthError(''); }} className={`uppercase tracking-widest ${mutedText}`}>
                  {isSignup ? 'Ya tengo cuenta' : 'Crear cuenta nueva'}
                </button>
              </div>
              {showInstallButton && (
                <div className="mt-6">
                  <button
                    onClick={handleInstallClick}
                    className={`w-full py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg border-2 ${isDark ? 'bg-slate-800 text-teal-400 border-teal-500 hover:bg-slate-700' : 'bg-teal-50 text-teal-600 border-teal-500 hover:bg-teal-100'}`}
                  >
                    📱 Instalar App
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'portfolio' && (
              <>
                <div className="mb-6 md:mb-8 animate-in fade-in slide-in-from-top-4">
                  <div className={`text-xs md:text-sm font-black uppercase tracking-[0.35em] ${mutedText}`}>Bienvenido, {displayName || user?.email}</div>
                  <div className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-teal-400 via-cyan-300 to-amber-300 text-transparent bg-clip-text">
                    Dashboard DGI · {baseCurrency}
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
              <div className={`rounded-[2.5rem] shadow-sm border mb-12 ${surfaceClass}`}>
                <div className={`px-8 py-6 border-b flex justify-between items-center ${surfaceSoftClass}`}>
                  <h3 className={`font-black text-xs uppercase tracking-[0.3em] ${tableTitleClass}`}>Datos en Tiempo Real</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowAddModal(true)}
                      className={`px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest transition border ${isDark ? 'bg-teal-500 text-slate-900 border-teal-400 hover:bg-teal-400' : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-500'}`}
                    >
                      Añadir
                    </button>
                  </div>
                </div>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
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
                        <th className="px-6 py-6 cursor-pointer hover:text-teal-600 transition-colors text-right" onClick={() => requestSort('dailyChange')}>Día %</th>
                        <th className="px-6 py-6 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${dividerClass}`}>
                      {sortedHoldings.map((h) => (
                        <tr key={h.id} className={`group transition-all duration-300 ${rowHoverClass}`}>
                          <td className="px-6 py-5">
                            <button onClick={() => setSelectedHolding(h)} className="text-left">
                              <div className={`font-black text-xl leading-tight ${primaryText}`}>{h.ticker}</div>
                              <div className={`text-sm font-bold uppercase mt-1 tracking-wider truncate max-w-[150px] ${mutedText}`}>{h.name}</div>
                            </button>
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
                          <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditHolding(h);
                                  setManualForm({ ticker: h.rawTicker, shares: String(h.shares), costPerShare: String(h.costPerShare) });
                                }}
                                className={`px-3 py-2 rounded-xl text-lg border transition-all ${isDark ? 'text-teal-300 border-slate-700 hover:bg-slate-800' : 'text-teal-600 border-slate-200 hover:bg-slate-100'}`}
                                title="Editar"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteHolding(h)}
                                className={`px-3 py-2 rounded-xl text-lg border transition-all ${isDark ? 'text-red-300 border-slate-700 hover:bg-slate-800' : 'text-red-500 border-slate-200 hover:bg-slate-100'}`}
                                title="Eliminar"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden p-4 space-y-4">
                  {/* Mobile Sort Controls */}
                  <div className={`flex items-center gap-3 pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <span className={`text-xs font-black uppercase tracking-widest ${mutedText}`}>Ordenar:</span>
                    <select
                      value={sortConfig.key}
                      onChange={(e) => {
                        const key = e.target.value as keyof Holding | 'rangeScore' | 'none';
                        setSortConfig({ key, direction: 'desc' });
                      }}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-bold border ${isDark ? 'bg-slate-800 text-slate-100 border-slate-700' : 'bg-white text-slate-900 border-slate-200'}`}
                    >
                      <option value="none">Sin ordenar</option>
                      <option value="weight">Peso %</option>
                      <option value="yieldPct">Yield %</option>
                      <option value="gainLoss">Retorno %</option>
                      <option value="valueInEUR">Valor</option>
                      <option value="ticker">Ticker</option>
                    </select>
                  </div>

                  {sortedHoldings.map((h) => (
                    <div key={h.id} className={`rounded-2xl border p-5 shadow-sm ${surfaceSoftClass}`}>
                      {/* Header */}
                      <button onClick={() => setSelectedHolding(h)} className="w-full text-left mb-4">
                        <div className={`font-black text-2xl leading-tight ${primaryText}`}>{h.ticker}</div>
                        <div className={`text-sm font-bold uppercase mt-1 tracking-wider ${mutedText}`}>{h.name}</div>
                      </button>

                      {/* Metrics Grid */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                          <div className={`text-xs uppercase tracking-widest ${mutedText} mb-1`}>Acciones</div>
                          <div className={`font-bold text-lg ${mutedTextStrong}`}>{h.shares}</div>
                        </div>
                        <div>
                          <div className={`text-xs uppercase tracking-widest ${mutedText} mb-1`}>Valor</div>
                          <div className={`font-black text-lg ${primaryText}`}>{formatCurrency(h.valueInEUR)}</div>
                        </div>
                        <div>
                          <div className={`text-xs uppercase tracking-widest ${mutedText} mb-1`}>Retorno</div>
                          <span className={`inline-block text-sm font-black px-3 py-1.5 rounded-xl ${h.gainLoss >= 0 ? gainPositiveClass : gainNegativeClass}`}>
                            {h.gainLoss >= 0 ? '▲' : '▼'} {Math.abs(h.gainLoss).toFixed(2)}%
                          </span>
                        </div>
                        <div>
                          <div className={`text-xs uppercase tracking-widest ${mutedText} mb-1`}>Yield</div>
                          <div className="font-black text-teal-400 text-lg">{h.yieldPct.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className={`text-xs uppercase tracking-widest ${mutedText} mb-1`}>YoC</div>
                          <div className="font-black text-amber-400 text-lg">{h.yoc.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className={`text-xs uppercase tracking-widest ${mutedText} mb-1`}>Día</div>
                          <div className={`font-black text-lg ${h.dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {h.dailyChange >= 0 ? '+' : ''}{h.dailyChange.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      {/* 52w Range */}
                      <div className="mb-4">
                        <div className={`text-xs uppercase tracking-widest ${mutedText} mb-2`}>Rango 52 Semanas</div>
                        <Range52w price={h.price} low={h.low52w} high={h.high52w} isDark={isDark} />
                      </div>

                      {/* Annual Income */}
                      <div className="mb-4">
                        <div className={`text-xs uppercase tracking-widest ${mutedText} mb-1`}>Renta Anual</div>
                        <div className={`font-black text-lg ${mutedTextStrong}`}>{formatCurrency(h.annualIncomeEUR)}</div>
                      </div>

                      {/* Action Buttons */}
                      <div className={`flex gap-2 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <button
                          onClick={() => {
                            setEditHolding(h);
                            setManualForm({ ticker: h.rawTicker, shares: String(h.shares), costPerShare: String(h.costPerShare) });
                          }}
                          className={`flex-1 px-4 py-3 rounded-xl text-xl border transition-all ${isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'}`}
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteHolding(h)}
                          className={`flex-1 px-4 py-3 rounded-xl text-xl border transition-all ${isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'}`}
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-lg rounded-[2rem] border p-8 shadow-2xl ${surfaceClass}`}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className={`text-xl font-black ${primaryText}`}>Añadir posición</div>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Manual</div>
              </div>
              <button onClick={() => setShowAddModal(false)} className={`text-xs font-black uppercase tracking-widest ${mutedText}`}>Cerrar</button>
            </div>
            <form onSubmit={handleAddPosition} className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={addForm.ticker}
                  onChange={e => setAddForm({ ...addForm, ticker: e.target.value.toUpperCase() })}
                  className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                  placeholder="Ticker (ej: O, MSFT)"
                  required
                />
                {addForm.ticker && tickerOptions.length > 0 && !findMarketEntry(addForm.ticker, marketData) && (
                  <div className={`absolute z-10 mt-2 w-full max-h-48 overflow-auto rounded-2xl border shadow-xl ${surfaceClass}`}>
                    {tickerOptions
                      .filter(({ ticker, name }) => {
                        const query = addForm.ticker.toUpperCase();
                        return ticker.includes(query) || name.toUpperCase().includes(query);
                      })
                      .slice(0, 8)
                      .map(({ ticker, name }) => (
                        <button
                          key={ticker}
                          type="button"
                          onClick={() => setAddForm({ ...addForm, ticker })}
                          className={`w-full text-left px-4 py-2 font-bold text-sm transition ${isDark ? 'hover:bg-slate-800 text-slate-100' : 'hover:bg-slate-100 text-slate-900'}`}
                        >
                          <span className="mr-2">{ticker}</span>
                          <span className={`text-xs ${mutedText}`}>{name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={addForm.shares}
                  onChange={e => setAddForm({ ...addForm, shares: e.target.value })}
                  className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                  placeholder="Acciones"
                  required
                />
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={addForm.costPerShare}
                  onChange={e => setAddForm({ ...addForm, costPerShare: e.target.value })}
                  className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                  placeholder="Precio compra"
                  required
                />
              </div>
              {addError && <p className="text-red-500 text-sm font-bold">{addError}</p>}
              <button type="submit" className="w-full bg-teal-500 text-slate-900 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-teal-400 transition-all shadow-xl active:scale-95">Guardar</button>
            </form>
          </div>
        </div>
      )}

      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-lg rounded-[2rem] border p-8 shadow-2xl ${surfaceClass}`}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className={`text-xl font-black ${primaryText}`}>Ticker no encontrado</div>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Introduce los datos manualmente</div>
              </div>
              <button onClick={() => setShowManualModal(false)} className={`text-xs font-black uppercase tracking-widest ${mutedText}`}>Cerrar</button>
            </div>
            <form onSubmit={handleManualSave} className="space-y-4">
              <input
                type="text"
                value={manualForm.ticker}
                onChange={e => setManualForm({ ...manualForm, ticker: e.target.value.toUpperCase() })}
                className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                placeholder="Ticker"
                required
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={manualForm.shares}
                  onChange={e => setManualForm({ ...manualForm, shares: e.target.value })}
                  className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                  placeholder="Acciones"
                  required
                />
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={manualForm.costPerShare}
                  onChange={e => setManualForm({ ...manualForm, costPerShare: e.target.value })}
                  className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                  placeholder="Precio compra"
                  required
                />
              </div>
              {addError && <p className="text-red-500 text-sm font-bold">{addError}</p>}
              <button type="submit" className="w-full bg-teal-500 text-slate-900 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-teal-400 transition-all shadow-xl active:scale-95">Guardar</button>
            </form>
          </div>
        </div>
      )}

      {editHolding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-lg rounded-[2rem] border p-8 shadow-2xl ${surfaceClass}`}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className={`text-xl font-black ${primaryText}`}>Editar posición</div>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>{editHolding.ticker}</div>
              </div>
              <button onClick={() => setEditHolding(null)} className={`text-xs font-black uppercase tracking-widest ${mutedText}`}>Cerrar</button>
            </div>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={manualForm.shares}
                  onChange={e => setManualForm({ ...manualForm, shares: e.target.value })}
                  className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                  placeholder="Acciones"
                  required
                />
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={manualForm.costPerShare}
                  onChange={e => setManualForm({ ...manualForm, costPerShare: e.target.value })}
                  className={`w-full border-0 rounded-2xl px-5 py-3 text-lg font-bold focus:ring-2 focus:ring-teal-500 outline-none transition ${isDark ? 'bg-slate-800 text-slate-100 placeholder-slate-400' : 'bg-slate-50 text-slate-900 placeholder-slate-500'}`}
                  placeholder="Precio compra"
                  required
                />
              </div>
              {addError && <p className="text-red-500 text-sm font-bold">{addError}</p>}
              <button type="submit" className="w-full bg-teal-500 text-slate-900 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-teal-400 transition-all shadow-xl active:scale-95">Guardar cambios</button>
            </form>
          </div>
        </div>
      )}

      {selectedHolding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-2xl rounded-[2rem] border p-8 shadow-2xl ${surfaceClass}`}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className={`text-2xl font-black ${primaryText}`}>{selectedHolding.ticker}</div>
                <div className={`text-sm uppercase tracking-widest ${mutedText}`}>{selectedHolding.name}</div>
              </div>
              <button onClick={() => setSelectedHolding(null)} className={`text-xs font-black uppercase tracking-widest ${mutedText}`}>Cerrar</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Acciones</div>
                <div className={`text-xl font-black ${primaryText}`}>{selectedHolding.shares}</div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Valor</div>
                <div className={`text-xl font-black ${primaryText}`}>{formatCurrency(selectedHolding.valueInEUR)}</div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Precio</div>
                <div className={`text-xl font-black ${primaryText}`}>{selectedHolding.price.toFixed(2)}</div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Rentabilidad</div>
                <div className={`text-xl font-black ${primaryText}`}>{selectedHolding.gainLoss.toFixed(2)}%</div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Yield</div>
                <div className="text-xl font-black text-teal-400">{selectedHolding.yieldPct.toFixed(2)}%</div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>YoC</div>
                <div className="text-xl font-black text-amber-400">{selectedHolding.yoc.toFixed(2)}%</div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Renta Año</div>
                <div className={`text-xl font-black ${primaryText}`}>{formatCurrency(selectedHolding.annualIncomeEUR)}</div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Día %</div>
                <div className={`text-xl font-black ${selectedHolding.dailyChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedHolding.dailyChange >= 0 ? '+' : ''}{selectedHolding.dailyChange.toFixed(2)}%
                </div>
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Rango 52S</div>
                <Range52w price={selectedHolding.price} low={selectedHolding.low52w} high={selectedHolding.high52w} isDark={isDark} />
              </div>
              <div className={`rounded-2xl border p-4 ${surfaceSoftClass}`}>
                <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Peso</div>
                <div className={`text-xl font-black ${primaryText}`}>{selectedHolding.weight.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {user && (
        <footer className={`fixed bottom-0 inset-x-0 border-t md:hidden z-50 safe-bottom shadow-[0_-10px_30px_rgba(0,0,0,0.3)] ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-around h-20">
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all ${activeTab === 'portfolio' ? (isDark ? 'text-teal-400 bg-slate-800/50' : 'text-teal-600 bg-slate-100') : 'text-slate-500'}`}
            >
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" /></svg>
              <span className="text-xs font-black uppercase tracking-widest">Cartera</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center -mt-10"
            >
              <div className={`bg-teal-500 p-4 rounded-2xl shadow-xl border-4 active:scale-90 transition-transform ${isDark ? 'shadow-teal-900/40 border-slate-900' : 'shadow-teal-500/30 border-white'}`}>
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
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

      <div className="mt-12 border-t border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 text-center">
          <div className={`text-xs uppercase tracking-widest ${mutedText}`}>Soporte</div>
          <div className={`text-sm font-black ${primaryText}`}>Adrian Lujan · Desarrollador</div>
          <div className={`text-sm ${mutedText}`}>a.adrianlujan.l@gmail.com</div>
        </div>
      </div>
    </div>
  );
};

export default App;
