/**
 * Data Module - Supabase Integration + CSV Market Data (Corrected Logic)
 * Logic Update:
 * - Market Value (EUR) = Price (Local) * FX * Shares
 * - Cost Basis (EUR) = Cost (Col O, Local) * FX * Shares
 * - Annual Income = From Col P (EUR)
 */

const DataModule = (() => {
    // Supabase Configuration
    const SUPABASE_URL = 'https://lnuoktjbkvqdxhvecqyx.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxudW9rdGpia3ZxZHhodmVjcXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTM5NDEsImV4cCI6MjA4MzU2OTk0MX0.6b5tZNkaOfYFgA6XS1ZNT5W22NUYIu1AUlmE42zoFQ8';

    // Initialize Supabase if available
    const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

    // Dynamic Market Data (Populated via CSV)
    let marketData = {};

    // Helper to parse European formatted numbers (1.234,56 -> 1234.56 or 33,85 -> 33.85)
    function parseEuroNum(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        // Remove quotes, replace comma with dot, remove thousands dots
        let clean = val.replace(/"/g, '').trim();
        if (clean.includes(',') && clean.includes('.')) {
            // Probably something like 1.234,56
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            clean = clean.replace(',', '.');
        }
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    }

    // Fetch Full Market Data from Google Sheet CSV export
    async function fetchSheetData() {
        if (Object.keys(marketData).length > 0) return marketData;

        try {
            const response = await fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vSZ7SVCAW3W1vLdvPqrn5T-eG6A73I-0HWrHdk5dvKwOEGmQXkukQCYzkzBN4tjoUOJS4tcm2-HJSXG/pub?gid=1414892855&single=true&output=csv');
            const csvText = await response.text();
            const lines = csvText.split('\n');

            const parseLine = (text) => {
                const result = [];
                let curValue = '';
                let withinQuotes = false;
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (char === '"') withinQuotes = !withinQuotes;
                    else if (char === ',' && !withinQuotes) {
                        result.push(curValue.trim());
                        curValue = '';
                    } else {
                        curValue += char;
                    }
                }
                result.push(curValue.trim());
                return result;
            };

            const header = parseLine(lines[0]);
            const getIdx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());

            const idx = {
                ticker: getIdx('ticker'),
                currency: getIdx('currency'),
                price: getIdx('price'),
                fx: getIdx('fx_to_base'),
                shares: getIdx('acciones'),
                costLocal: getIdx('buy.in.local'),
                income: getIdx('annual income'),
                per: getIdx('PE')
            };

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const cols = parseLine(lines[i]);
                const ticker = cols[idx.ticker];
                if (!ticker) continue;

                marketData[ticker] = {
                    ticker: ticker,
                    name: ticker, // Could be enriched if there was a name column
                    currency: cols[idx.currency] || 'EUR',
                    price: parseEuroNum(cols[idx.price]),
                    fx: parseEuroNum(cols[idx.fx]) || 1,
                    shares: parseEuroNum(cols[idx.shares]),
                    costLocal: parseEuroNum(cols[idx.costLocal]),
                    income: parseEuroNum(cols[idx.income]),
                    per: cols[idx.per] || 'N/A'
                };
            }
            console.log('Market Data Sync Complete:', Object.keys(marketData).length, 'tickers loaded.');
        } catch (e) {
            console.error('Failed to fetch Market Data:', e);
        }
        return marketData;
    }

    // Background helper to get PER for UI (compat with existing calls)
    async function fetchPER() {
        const data = await fetchSheetData();
        const perMap = {};
        for (const t in data) perMap[t] = data[t].per;
        return perMap;
    }

    // Placeholder for dividend safety score (could be fetched via web search)
    async function fetchDividendSafetyScore(ticker) {
        // For now return N/A; implement real lookup later.
        return 'N/A';
    }


    let cachedData = null;
    let userId = null;
    let loginAttempts = 0;

    // --- Authentication ---
    async function getUser() {
        if (!supabase) return null;
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            userId = session.user.id;
            return session.user;
        }
        return null;
    }

    async function signIn(email, password) {
        if (!supabase) return { error: 'Supabase not initialized' };
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error && data?.user) userId = data.user.id;
        return { data, error };
    }

    async function signUp(email, password) {
        if (!supabase) return { error: 'Supabase not initialized' };
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (!error && data?.user) userId = data.user.id;
        return { data, error };
    }

    async function signOut() {
        if (!supabase) return;
        await supabase.auth.signOut();
        userId = null;
        cachedData = null;
    }

    // --- Broker & Market Helpers ---
    async function getOrCreateDefaultBroker() {
        if (!userId) return null;

        let { data: broker } = await supabase
            .from('brokers')
            .select('id')
            .eq('user_id', userId)
            .eq('name', 'Default Broker')
            .maybeSingle();

        if (!broker) {
            const { data: newBroker, error } = await supabase
                .from('brokers')
                .insert({ user_id: userId, name: 'Default Broker' })
                .select('id')
                .single();

            if (error) {
                console.error('Error creating default broker:', error);
                return null;
            }
            broker = newBroker;
        }
        return broker.id;
    }

    function parseMarketFromTicker(ticker) {
        if (ticker.includes(':')) {
            const parts = ticker.split(':');
            return { market: parts[0], cleanTicker: parts[1] };
        }
        return { market: 'US', cleanTicker: ticker };
    }

    // --- SEED SQL ---
    async function seedData() {
        if (!userId) return;
        const data = await fetchSheetData();
        const brokerId = await getOrCreateDefaultBroker();
        if (!brokerId) throw new Error("Broker creation failed (likely RLS). Cannot seed.");

        console.log('Seeding data from Sheet with Broker ID:', brokerId);

        const rows = Object.values(data).map(h => {
            const { market } = parseMarketFromTicker(h.ticker);
            return {
                user_id: userId,
                broker_id: brokerId,
                ticker: h.ticker,
                market: market,
                quantity: h.shares,
                avg_price: h.costLocal,
                currency: h.currency,
                name: h.name,
                fees_total: 0
            };
        });

        const { error } = await supabase.from('holdings').insert(rows);
        if (error) {
            console.error('Seeding Error:', error);
            throw error;
        }
    }

    // --- CRUD ---

    async function fetchHoldings(forceRefresh = false) {
        if (!supabase) return mockProcess();

        try {
            if (!userId) {
                await getUser();
            }

            // If no user, return empty or mock data (up to user choice, but here we keep it clean)
            if (!userId) {
                console.warn('No active session. Please log in.');
                return { holdings: [], summary: {} }; // Return empty structure if not logged in
            }

            // Ensure PER data is loaded
            await fetchPER();

            // NOW safe to query because we know userId is a string
            const { data: dbHoldings, error } = await supabase
                .from('holdings')
                .select('*')
                .eq('user_id', userId);

            if (error) {
                console.error('Supabase Error:', error);
                throw error; // Triggers catch -> offline mode
            }

            if (dbHoldings.length === 0) {
                console.log('Empty DB. Seeding...');
                await seedData();
                // Refetch after seeding, ensuring no infinite loop
                return fetchHoldings(true);
            }

            return processHoldings(dbHoldings);
        } catch (e) {
            console.error('Fetch/Seeding Error:', e);
            console.warn('Falling back to offline due to error.');
            return mockProcess();
        }
    }

    async function addPosition(ticker, shares, cost) {
        if (!userId) return { error: 'Not logged in' };
        shares = parseFloat(shares);
        cost = parseFloat(cost);

        const marketInfo = marketData[ticker] || {};
        const { market } = parseMarketFromTicker(ticker);
        const brokerId = await getOrCreateDefaultBroker();

        const { data: existing } = await supabase.from('holdings').select('*').eq('user_id', userId).eq('ticker', ticker).single();

        if (existing) {
            // Weighted Average: (OldQty * OldCost + NewQty * NewCost) / (OldQty + NewQty)
            const totalShares = existing.quantity + shares;
            const newAvg = ((existing.quantity * existing.avg_price) + (shares * cost)) / totalShares;

            const { error } = await supabase.from('holdings').update({
                quantity: totalShares,
                avg_price: newAvg
            }).eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('holdings').insert({
                user_id: userId,
                broker_id: brokerId,
                ticker: ticker,
                market: market,
                quantity: shares,
                avg_price: cost,
                currency: marketInfo.currency || 'USD',
                name: marketInfo.name || ticker,
                fees_total: 0
            });
            if (error) throw error;
        }
    }

    async function sellPosition(ticker, shares, price) {
        if (!userId) await login();
        shares = parseFloat(shares);
        price = parseFloat(price); // Price is used for realized gain logic usually, but here just reducing shares.

        const { data: existing } = await supabase.from('holdings').select('*').eq('user_id', userId).eq('ticker', ticker).single();

        if (!existing) throw new Error("Position not found");

        const newQuantity = existing.quantity - shares;
        if (newQuantity <= 0) {
            // Delete if sold out
            await deletePosition(existing.id);
        } else {
            // Selling doesn't change Avg Cost per share, just quantity
            const { error } = await supabase.from('holdings').update({
                quantity: newQuantity
            }).eq('id', existing.id);
            if (error) throw error;
        }
    }

    async function updatePosition(id, shares, cost) {
        const { error } = await supabase.from('holdings').update({
            quantity: parseFloat(shares),
            avg_price: parseFloat(cost)
        }).eq('id', id);
        if (error) throw error;
    }

    async function deletePosition(id) {
        const { error } = await supabase.from('holdings').delete().eq('id', id);
        if (error) throw error;
    }

    // --- Processing ---

    function processHoldings(dbHoldings) {
        const holdings = dbHoldings.map(async db => {
            const ref = marketData[db.ticker] || {
                price: 0,
                fx: 1,
                income: 0,
                shares: 1,
                per: 'N/A',
                costLocal: 0
            };

            const fx = ref.fx;
            const valueInEUR = db.quantity * ref.price * fx;
            const costBasisEUR = db.quantity * db.avg_price * fx;

            let annualIncomeEUR = 0;
            if (ref.income > 0) {
                // If it's the CSV direct data, ref.income might be total income for ref.shares
                // but let's assume ref.income is already normalized if possible.
                // Looking at CSV: "annual income" is total for "acciones".
                const incomePerShare = ref.income / (ref.shares || 1);
                annualIncomeEUR = db.quantity * incomePerShare;
            }

            const yieldPct = valueInEUR > 0 ? (annualIncomeEUR / valueInEUR) * 100 : 0;
            const yoc = costBasisEUR > 0 ? (annualIncomeEUR / costBasisEUR) * 100 : 0;
            const gainLoss = costBasisEUR > 0 ? ((valueInEUR - costBasisEUR) / costBasisEUR) * 100 : 0;

            return {
                id: db.id,
                ticker: db.ticker,
                name: ref.name || db.ticker,
                shares: db.quantity,
                price: ref.price,
                costPerShare: db.avg_price,
                currency: db.currency,
                valueInEUR: valueInEUR,
                gainLoss: gainLoss,
                yieldPct: yieldPct,
                annualIncomeEUR: annualIncomeEUR,
                per: ref.per,
                yoc: yoc,
                weight: 0,
                fxToBase: fx
            };
        });

        return Promise.all(holdings).then(resolvedHoldings => {
            const totalValue = resolvedHoldings.reduce((sum, h) => sum + h.valueInEUR, 0);
            const totalAnnualIncome = resolvedHoldings.reduce((sum, h) => sum + h.annualIncomeEUR, 0);
            const dividendYield = totalValue > 0 ? (totalAnnualIncome / totalValue) * 100 : 0;
            resolvedHoldings.forEach(h => {
                h.weight = totalValue > 0 ? (h.valueInEUR / totalValue) * 100 : 0;
            });
            return {
                holdings: resolvedHoldings,
                summary: {
                    totalValue,
                    totalAnnualIncome,
                    monthlyIncome: totalAnnualIncome / 12,
                    dividendYield,
                    holdingsCount: resolvedHoldings.length
                }
            };
        });
    }

    async function mockProcess() {
        const data = await fetchSheetData();
        const mockHoldings = Object.values(data).map((h, i) => ({
            id: 'mock-' + i,
            ticker: h.ticker,
            quantity: h.shares,
            avg_price: h.costLocal,
            currency: h.currency,
            name: h.name
        }));
        return processHoldings(mockHoldings);
    }

    async function syncFromCSV() {
        if (!userId) return { error: 'Not logged in' };
        try {
            // 1. Force refresh sheet data
            marketData = {};
            await fetchSheetData();

            // 2. Clear Supabase holdings for user
            const { error: delError } = await supabase.from('holdings').delete().eq('user_id', userId);
            if (delError) throw delError;

            // 3. Re-seed
            await seedData();
            return { success: true };
        } catch (e) {
            console.error('Sync Error:', e);
            return { error: e.message };
        }
    }

    // Formatting utilities
    function formatCurrency(value, currency = 'EUR') {
        if (value === null || value === undefined) return '-';
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    function formatPercent(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) return '-';
        const sign = value >= 0 ? '+' : '';
        return `${sign}${value.toFixed(decimals)}%`;
    }

    return {
        getUser,
        signIn,
        signUp,
        signOut,
        syncFromCSV,
        fetchData: fetchHoldings,
        addPosition,
        sellPosition,
        updatePosition,
        deletePosition,
        formatCurrency,
        formatPercent
    };
})();

window.DataModule = DataModule;
