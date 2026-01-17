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

    // DIRECT DUMP FROM CSV (Source of Truth)
    // ticket, name, currency, price, fx, shares, costLocal (Col O), income (Col P)
    const OFFLINE_DATA = [
        { ticker: 'AMS:AD', name: 'Ahold Delhaize', currency: 'EUR', price: 33.85, fx: 1, shares: 75, costLocal: 22.82, income: 88.50 },
        { ticker: 'AMS:UNA', name: 'Unilever', currency: 'EUR', price: 54.99, fx: 1, shares: 55.11, costLocal: 46.49, income: 112.43 },
        { ticker: 'AMS:VEUR', name: 'Vanguard FTSE Developed Europe', currency: 'EUR', price: 47.47, fx: 1, shares: 94, costLocal: 37.31, income: 120.32 },
        { ticker: 'AMS:VUSA', name: 'Vanguard S&P 500', currency: 'USD', price: 113.6, fx: 0.8616, shares: 12, costLocal: 61.68, income: 12.72 },
        { ticker: 'BME:ACS', name: 'ACS Actividades', currency: 'EUR', price: 96.55, fx: 1, shares: 102, costLocal: 23.22, income: 205.02 },
        { ticker: 'BME:BBVA', name: 'BBVA', currency: 'EUR', price: 20.95, fx: 1, shares: 400, costLocal: 4.39, income: 292.00 },
        { ticker: 'BME:EBRO', name: 'Ebro Foods', currency: 'EUR', price: 18.4, fx: 1, shares: 120, costLocal: 16.21, income: 82.80 },
        { ticker: 'BME:ELE', name: 'Endesa', currency: 'EUR', price: 30.88, fx: 1, shares: 148, costLocal: 17.99, income: 195.36 },
        { ticker: 'BME:ENG', name: 'Enagás', currency: 'EUR', price: 13.9, fx: 1, shares: 213, costLocal: 16.39, income: 213.00 },
        { ticker: 'BME:IBE', name: 'Iberdrola', currency: 'EUR', price: 18.57, fx: 1, shares: 222, costLocal: 10.02, income: 146.52 },
        { ticker: 'BME:ITX', name: 'Inditex', currency: 'EUR', price: 55.86, fx: 1, shares: 45, costLocal: 21.79, income: 75.60 },
        { ticker: 'BME:LDA', name: 'Libertas 7', currency: 'EUR', price: 1.13, fx: 1, shares: 1600, costLocal: 1.24, income: 96.00 },
        { ticker: 'BME:LOG', name: 'Logista', currency: 'EUR', price: 31.4, fx: 1, shares: 60, costLocal: 19.87, income: 125.40 },
        { ticker: 'BME:MAP', name: 'Mapfre', currency: 'EUR', price: 4.25, fx: 1, shares: 1000, costLocal: 1.69, income: 160.00 },
        { ticker: 'BME:MCM', name: 'Miquel y Costas', currency: 'EUR', price: 14.3, fx: 1, shares: 109, costLocal: 10.98, income: 51.23 },
        { ticker: 'BME:NTGY', name: 'Naturgy', currency: 'EUR', price: 25.7, fx: 1, shares: 75, costLocal: 21.07, income: 135.00 },
        { ticker: 'BME:REd', name: 'Red Eléctrica', currency: 'EUR', price: 14.95, fx: 1, shares: 170, costLocal: 15.52, income: 136.00 },
        { ticker: 'BME:REP', name: 'Repsol', currency: 'EUR', price: 15.7, fx: 1, shares: 162, costLocal: 10.61, income: 162.00 },
        { ticker: 'BME:SAB', name: 'Banco Sabadell', currency: 'EUR', price: 3.24, fx: 1, shares: 500, costLocal: 1.07, income: 100.00 },
        { ticker: 'BME:VID', name: 'Vidrala', currency: 'EUR', price: 91, fx: 1, shares: 16, costLocal: 69.79, income: 26.24 },
        { ticker: 'BME:VIS', name: 'Viscofan', currency: 'EUR', price: 55.5, fx: 1, shares: 41, costLocal: 55.40, income: 129.97 },
        { ticker: 'EPA:BN', name: 'Danone', currency: 'EUR', price: 75.44, fx: 1, shares: 25, costLocal: 56.68, income: 53.75 },
        { ticker: 'HKG:0001', name: 'CK Hutchison', currency: 'HKD', price: 60.5, fx: 0.110688, shares: 500, costLocal: 39.84, income: 120.00 },
        { ticker: 'HKG:0144', name: 'China Merchants Port', currency: 'HKD', price: 15.06, fx: 0.110688, shares: 2000, costLocal: 9.40, income: 200.00 },
        { ticker: 'HKG:0257', name: 'China Everbright', currency: 'HKD', price: 4.75, fx: 0.110688, shares: 7000, costLocal: 4.07, income: 210.00 },
        { ticker: 'HKG:0392', name: 'Beijing Enterprises', currency: 'HKD', price: 32, fx: 0.110688, shares: 1000, costLocal: 26.40, income: 180.00 },
        { ticker: 'HKG:0855', name: 'China Water Affairs', currency: 'HKD', price: 5.41, fx: 0.110688, shares: 4000, costLocal: 5.76, income: 120.00 },
        { ticker: 'HKG:1038', name: 'CK Infrastructure', currency: 'HKD', price: 59.9, fx: 0.110688, shares: 500, costLocal: 46.40, income: 140.00 },
        { ticker: 'HKG:1044', name: 'Hengan International', currency: 'HKD', price: 27.44, fx: 0.110688, shares: 500, costLocal: 49.79, income: 85.00 },
        { ticker: 'HKG:1052', name: 'Yuexiu Transport', currency: 'HKD', price: 4.56, fx: 0.110688, shares: 4000, costLocal: 4.54, income: 120.00 },
        { ticker: 'HKG:2678', name: 'Texhong Textile', currency: 'HKD', price: 5.13, fx: 0.110688, shares: 4000, costLocal: 4.07, income: 80.00 },
        { ticker: 'KMB', name: 'Kimberly-Clark', currency: 'USD', price: 99.32, fx: 0.8616, shares: 18, costLocal: 124.17, income: 77.94 },
        { ticker: 'LON:AV', name: 'Aviva', currency: 'GBP', price: 6.73, fx: 1.1533, shares: 152, costLocal: 4.03, income: 65.36 },
        { ticker: 'LON:BATS', name: 'British American Tobacco', currency: 'GBP', price: 43.21, fx: 1.1533, shares: 105, costLocal: 25.76, income: 290.85 },
        { ticker: 'LON:DGE', name: 'Diageo', currency: 'GBP', price: 16.57, fx: 1.1533, shares: 185, costLocal: 24.51, income: 168.35 },
        { ticker: 'LON:VOD', name: 'Vodafone', currency: 'GBP', price: 1.006, fx: 1.1533, shares: 1400, costLocal: 0.96, income: 70.00 },
        { ticker: 'MICC', name: 'Micron', currency: 'EUR', price: 16.7, fx: 1, shares: 12, costLocal: 11.21, income: 0.00 },
        { ticker: 'NASDAQ:AAPL', name: 'Apple', currency: 'USD', price: 255.52, fx: 0.8616, shares: 4, costLocal: 127.89, income: 3.56 },
        { ticker: 'NASDAQ:AMGN', name: 'Amgen', currency: 'USD', price: 330.41, fx: 0.8616, shares: 10, costLocal: 219.79, income: 82.90 },
        { ticker: 'NASDAQ:CMCSA', name: 'Comcast', currency: 'USD', price: 27.82, fx: 0.8616, shares: 78, costLocal: 37.97, income: 88.14 },
        { ticker: 'NASDAQ:CSCO', name: 'Cisco', currency: 'USD', price: 75.19, fx: 0.8616, shares: 51, costLocal: 45.26, income: 71.91 },
        { ticker: 'NASDAQ:GILD', name: 'Gilead', currency: 'USD', price: 124.91, fx: 0.8616, shares: 16, costLocal: 60.66, income: 43.36 },
        { ticker: 'NASDAQ:INTC', name: 'Intel', currency: 'USD', price: 46.99, fx: 0.8616, shares: 90, costLocal: 39.30, income: 0.00 },
        { ticker: 'NASDAQ:KHC', name: 'Kraft Heinz', currency: 'USD', price: 23.53, fx: 0.8616, shares: 90, costLocal: 32.69, income: 123.30 },
        { ticker: 'NASDAQ:MSFT', name: 'Microsoft', currency: 'USD', price: 459.86, fx: 0.8616, shares: 3, costLocal: 254.16, income: 9.36 },
        { ticker: 'NASDAQ:PEP', name: 'PepsiCo', currency: 'USD', price: 146.32, fx: 0.8616, shares: 20, costLocal: 144.79, income: 97.60 },
        { ticker: 'NASDAQ:QCOM', name: 'Qualcomm', currency: 'USD', price: 159.42, fx: 0.8616, shares: 5, costLocal: 127.56, income: 15.30 },
        { ticker: 'NASDAQ:SBUX', name: 'Starbucks', currency: 'USD', price: 92.99, fx: 0.8616, shares: 28, costLocal: 81.80, income: 59.64 },
        { ticker: 'NASDAQ:TROW', name: 'T. Rowe Price', currency: 'USD', price: 106.49, fx: 0.8616, shares: 31, costLocal: 130.01, income: 135.16 },
        { ticker: 'NASDAQ:TXN', name: 'Texas Instruments', currency: 'USD', price: 191.58, fx: 0.8616, shares: 11, costLocal: 155.15, income: 53.57 },
        { ticker: 'NYSE:ABBV', name: 'AbbVie', currency: 'USD', price: 214.35, fx: 0.8616, shares: 20, costLocal: 91.08, income: 118.80 },
        { ticker: 'NYSE:ARE', name: 'Alexandria RE', currency: 'USD', price: 57.89, fx: 0.8616, shares: 21, costLocal: 108.60, income: 51.87 },
        { ticker: 'NYSE:BBY', name: 'Best Buy', currency: 'USD', price: 67.76, fx: 0.8616, shares: 31, costLocal: 69.08, income: 101.06 },
        { ticker: 'NYSE:BF.B', name: 'Brown-Forman', currency: 'USD', price: 26.4, fx: 0.8616, shares: 60, costLocal: 38.67, income: 46.80 },
        { ticker: 'NYSE:BLK', name: 'BlackRock', currency: 'USD', price: 1163.17, fx: 0.8616, shares: 2, costLocal: 580.23, income: 35.76 },
        { ticker: 'NYSE:BMY', name: 'Bristol-Myers', currency: 'USD', price: 55.26, fx: 0.8616, shares: 54, costLocal: 60.29, income: 116.64 },
        { ticker: 'NYSE:CLX', name: 'Clorox', currency: 'USD', price: 109.98, fx: 0.8616, shares: 11, costLocal: 140.79, income: 46.86 },
        { ticker: 'NYSE:CNI', name: 'Canadian National', currency: 'USD', price: 100.11, fx: 0.8616, shares: 12, costLocal: 104.21, income: 26.40 },
        { ticker: 'NYSE:CVX', name: 'Chevron', currency: 'USD', price: 166.26, fx: 0.8616, shares: 5, costLocal: 101.07, income: 29.35 },
        { ticker: 'NYSE:EL', name: 'Estée Lauder', currency: 'USD', price: 115.05, fx: 0.8616, shares: 31, costLocal: 68.57, income: 37.20 },
        { ticker: 'NYSE:FRT', name: 'Federal Realty', currency: 'USD', price: 103.67, fx: 0.8616, shares: 15, costLocal: 72.71, income: 58.20 },
        { ticker: 'NYSE:GIS', name: 'General Mills', currency: 'USD', price: 44.51, fx: 0.8616, shares: 46, costLocal: 54.04, income: 96.14 },
        { ticker: 'NYSE:HD', name: 'Home Depot', currency: 'USD', price: 380.17, fx: 0.8616, shares: 8, costLocal: 287.38, income: 63.20 },
        { ticker: 'NYSE:HII', name: 'Huntington Ingalls', currency: 'USD', price: 425.9, fx: 0.8616, shares: 5, costLocal: 176.37, income: 23.70 },
        { ticker: 'NYSE:HRL', name: 'Hormel Foods', currency: 'USD', price: 24.22, fx: 0.8616, shares: 67, costLocal: 37.96, income: 67.00 },
        { ticker: 'NYSE:HSY', name: 'Hershey', currency: 'USD', price: 197.76, fx: 0.8616, shares: 5, costLocal: 169.23, income: 23.50 },
        { ticker: 'NYSE:IFF', name: 'IFF', currency: 'USD', price: 71.68, fx: 0.8616, shares: 10, costLocal: 111.52, income: 13.70 },
        { ticker: 'NYSE:INGR', name: 'Ingredion', currency: 'USD', price: 114.9, fx: 0.8616, shares: 21, costLocal: 86.02, income: 59.01 },
        { ticker: 'NYSE:ITW', name: 'Illinois Tool Works', currency: 'USD', price: 263.47, fx: 0.8616, shares: 8, costLocal: 195.50, income: 44.24 },
        { ticker: 'NYSE:JNJ', name: 'Johnson & Johnson', currency: 'USD', price: 218.66, fx: 0.8616, shares: 21, costLocal: 168.99, income: 93.66 },
        { ticker: 'NYSE:JPM', name: 'JPMorgan', currency: 'USD', price: 312.47, fx: 0.8616, shares: 13, costLocal: 115.51, income: 66.95 },
        { ticker: 'NYSE:KO', name: 'Coca-Cola', currency: 'USD', price: 70.44, fx: 0.8616, shares: 35, costLocal: 53.45, income: 61.25 },
        { ticker: 'NYSE:LMT', name: 'Lockheed Martin', currency: 'USD', price: 582.43, fx: 0.8616, shares: 6, costLocal: 340.75, income: 71.04 },
        { ticker: 'NYSE:LOW', name: 'Lowe\'s', currency: 'USD', price: 277.55, fx: 0.8616, shares: 6, costLocal: 180.23, income: 24.72 },
        { ticker: 'NYSE:LYB', name: 'LyondellBasell', currency: 'USD', price: 50.91, fx: 0.8616, shares: 45, costLocal: 61.76, income: 211.50 },
        { ticker: 'NYSE:MAA', name: 'Mid-America Apt', currency: 'USD', price: 137.09, fx: 0.8616, shares: 13, costLocal: 134.66, income: 68.25 },
        { ticker: 'NYSE:MCD', name: 'McDonald\'s', currency: 'USD', price: 307.43, fx: 0.8616, shares: 2, costLocal: 255.64, income: 12.78 },
        { ticker: 'NYSE:MDT', name: 'Medtronic', currency: 'USD', price: 96.76, fx: 0.8616, shares: 10, costLocal: 101.11, income: 24.40 },
        { ticker: 'NYSE:MMM', name: '3M', currency: 'USD', price: 167.8, fx: 0.8616, shares: 38, costLocal: 118.40, income: 95.38 },
        { ticker: 'NYSE:MO', name: 'Altria', currency: 'USD', price: 61.76, fx: 0.8616, shares: 41, costLocal: 40.25, income: 149.24 },
        { ticker: 'NYSE:MPW', name: 'Medical Properties', currency: 'USD', price: 5.2, fx: 0.8616, shares: 180, costLocal: 7.60, income: 55.80 },
        { ticker: 'NYSE:MRK', name: 'Merck', currency: 'USD', price: 108.83, fx: 0.8616, shares: 31, costLocal: 82.30, income: 90.52 },
        { ticker: 'NYSE:NKE', name: 'Nike', currency: 'USD', price: 64.38, fx: 0.8616, shares: 30, costLocal: 80.42, income: 42.30 },
        { ticker: 'NYSE:O', name: 'Realty Income', currency: 'USD', price: 61.42, fx: 0.8616, shares: 66, costLocal: 65.35, income: 182.16 },
        { ticker: 'NYSE:PG', name: 'Procter & Gamble', currency: 'USD', price: 144.53, fx: 0.8616, shares: 15, costLocal: 143.26, income: 54.45 },
        { ticker: 'NYSE:RTX', name: 'RTX Corp', currency: 'USD', price: 201.92, fx: 0.8616, shares: 20, costLocal: 57.64, income: 46.60 },
        { ticker: 'NYSE:SPG', name: 'Simon Property', currency: 'USD', price: 184.92, fx: 0.8616, shares: 19, costLocal: 98.20, income: 143.45 },
        { ticker: 'NYSE:SWK', name: 'Stanley Black & Decker', currency: 'USD', price: 84.61, fx: 0.8616, shares: 24, costLocal: 92.63, income: 68.40 },
        { ticker: 'NYSE:TAP', name: 'Molson Coors', currency: 'USD', price: 48.95, fx: 0.8616, shares: 46, costLocal: 50.94, income: 74.06 },
        { ticker: 'NYSE:TGT', name: 'Target', currency: 'USD', price: 111.28, fx: 0.8616, shares: 21, costLocal: 107.29, income: 82.11 },
        { ticker: 'NYSE:TSN', name: 'Tyson Foods', currency: 'USD', price: 60.07, fx: 0.8616, shares: 41, costLocal: 66.07, income: 71.75 },
        { ticker: 'NYSE:UNH', name: 'UnitedHealth', currency: 'USD', price: 331.02, fx: 0.8616, shares: 3, costLocal: 273.02, income: 22.77 },
        { ticker: 'NYSE:USB', name: 'US Bancorp', currency: 'USD', price: 54.4, fx: 0.8616, shares: 50, costLocal: 36.09, income: 87.50 },
        { ticker: 'NYSE:V', name: 'Visa', currency: 'USD', price: 328.3, fx: 0.8616, shares: 4, costLocal: 213.04, income: 9.20 },
        { ticker: 'NYSE:VFC', name: 'VF Corp', currency: 'USD', price: 18.82, fx: 0.8616, shares: 65, costLocal: 39.30, income: 20.15 },
        { ticker: 'NYSE:VZ', name: 'Verizon', currency: 'USD', price: 38.91, fx: 0.8616, shares: 79, costLocal: 45.63, income: 187.23 },
        { ticker: 'NYSE:WM', name: 'Waste Management', currency: 'USD', price: 221.23, fx: 0.8616, shares: 5, costLocal: 109.64, income: 14.15 },
        { ticker: 'NYSE:WPC', name: 'W. P. Carey', currency: 'USD', price: 70.26, fx: 0.8616, shares: 37, costLocal: 63.35, income: 116.92 },
        { ticker: 'NYSE:XOM', name: 'Exxon Mobil', currency: 'USD', price: 129.89, fx: 0.8616, shares: 10, costLocal: 57.20, income: 35.40 },
        { ticker: 'NYSEARCA:JEPI', name: 'JPMorgan Equity Premium', currency: 'USD', price: 58.41, fx: 0.8616, shares: 105.45, costLocal: 57.39, income: 427.08 },
        { ticker: 'SCHD', name: 'Schwab US Dividend Equity', currency: 'USD', price: 28.9, fx: 0.8616, shares: 646.87, costLocal: 24.35, income: 582.18 }
    ];

    // Cache for PER values
    let perCache = {};

    // Fetch PER values from Google Sheet CSV export
    async function fetchPER() {
        if (Object.keys(perCache).length) return perCache;
        try {
            // Use the published CSV link provided by the user
            const response = await fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vSZ7SVCAW3W1vLdvPqrn5T-eG6A73I-0HWrHdk5dvKwOEGmQXkukQCYzkzBN4tjoUOJS4tcm2-HJSXG/pub?gid=1414892855&single=true&output=csv');
            const csvText = await response.text();
            const lines = csvText.split('\n');

            // Regex to parse CSV lines respecting quotes
            // Matches: Quoted string OR non-comma sequence
            // Simple robust CSV parser
            const parseLine = (text) => {
                const result = [];
                let curValue = '';
                let withinQuotes = false;
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (char === '"') {
                        withinQuotes = !withinQuotes;
                    } else if (char === ',' && !withinQuotes) {
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

            // Find 'PE' (header in CSV is 'PE') or 'PER'
            let perIdx = header.findIndex(h => ['pe', 'per'].includes(h.toLowerCase()));

            // Fallback to Index 17 if not found
            if (perIdx === -1) {
                console.warn('PER header not found via scan, defaulting to Index 17');
                perIdx = 17;
            }

            const tickerIdx = header.findIndex(h => h.toLowerCase() === 'ticker');
            // If ticker not found, default to 0
            const finalTickerIdx = tickerIdx !== -1 ? tickerIdx : 0;

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const cols = parseLine(lines[i]);

                if (cols.length <= perIdx) continue;

                const ticker = cols[finalTickerIdx];
                const perVal = cols[perIdx]; // No need to trim again, parseLine does it

                if (ticker) perCache[ticker] = perVal || 'N/A';
            }
        } catch (e) {
            console.error('Failed to fetch PER:', e);
        }
        return perCache;
    }

    // Placeholder for dividend safety score (could be fetched via web search)
    async function fetchDividendSafetyScore(ticker) {
        // For now return N/A; implement real lookup later.
        return 'N/A';
    }


    let cachedData = null;
    let userId = null;

    // --- Authentication ---
    async function login() {
        if (!supabase) return null;

        // Try to get existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            userId = session.user.id;
            return userId;
        }

        // Attempt Sign In
        const { data: { user }, error } = await supabase.auth.signInWithPassword({
            email: 'demo@financeflow.com',
            password: 'demo1234'
        });

        if (error) {
            console.warn('Auto-login failed (Invalid Creds), attempting auto-signup...');

            // Try sign up if login fails
            const { data: { user: newUser }, error: signUpError } = await supabase.auth.signUp({
                email: 'demo@financeflow.com',
                password: 'demo1234'
            });

            if (signUpError) {
                // Check specifically for Rate Limit (429) or Security constraints
                if (signUpError.status === 429 || signUpError.message.includes('security purposes')) {
                    console.warn('Auto-signup rate limited. Continuing in Offline Mode.');
                    return null; // Graceful fallback
                }

                console.warn('Auto-signup failed:', signUpError.message);
                return null;
            }
            userId = newUser?.id;
        } else {
            userId = user?.id;
        }
        return userId;
    }

    // --- Broker & Market Helpers ---
    async function getOrCreateDefaultBroker() {
        if (!userId) return null;

        let { data: broker } = await supabase
            .from('brokers')
            .select('id')
            .eq('user_id', userId)
            .eq('name', 'Default Broker')
            .single();

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

        const brokerId = await getOrCreateDefaultBroker();
        if (!brokerId) throw new Error("Broker creation failed (likely RLS). Cannot seed.");

        console.log('Seeding data with Broker ID:', brokerId);

        const rows = OFFLINE_DATA.map(h => {
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
            if (!userId || typeof userId !== 'string') {
                await login();
            }

            // Strict Check: If userId is still not a valid string or is literal 'undefined', Force Offline Mode
            if (!userId || typeof userId !== 'string' || userId === 'undefined') {
                console.warn('Invalid User ID after login attempt. Falling back to offline data.');
                return mockProcess();
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
        if (!userId) await login();
        shares = parseFloat(shares);
        cost = parseFloat(cost);

        const marketInfo = OFFLINE_DATA.find(m => m.ticker === ticker) || {};
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
            const perVal = perCache[db.ticker] || 'N/A';
            const dividendSafety = await fetchDividendSafetyScore(db.ticker);
            const ref = OFFLINE_DATA.find(m => m.ticker === db.ticker) || {
                price: 0,
                fx: 1,
                income: 0,
                costLocal: 0,
                shares: 1,
                yield: 0
            };

            const fx = ref.fx;

            // Market Value = Price * FX * Shares
            const valueInEUR = db.quantity * ref.price * fx;

            // Cost Basis = CostLocal (Col O) * FX * Shares
            const costBasisEUR = db.quantity * db.avg_price * fx;

            // Income Logic
            let annualIncomeEUR = 0;
            if (ref.income > 0) {
                const incomePerShare = ref.income / ref.shares;
                annualIncomeEUR = db.quantity * incomePerShare;
            }

            // Derived Yield
            const yieldPct = valueInEUR > 0 ? (annualIncomeEUR / valueInEUR) * 100 : 0;

            // Yield on Cost (YOC)
            const yoc = costBasisEUR > 0 ? (annualIncomeEUR / costBasisEUR) * 100 : 0;

            // Gain/Loss
            const gainLoss = costBasisEUR > 0 ? ((valueInEUR - costBasisEUR) / costBasisEUR) * 100 : 0;

            return {
                id: db.id,
                ticker: db.ticker,
                fullTicker: db.ticker,
                name: db.name,
                shares: db.quantity,
                price: ref.price,
                costPerShare: db.avg_price,
                currency: db.currency,
                valueInEUR: valueInEUR,
                value: db.quantity * ref.price,
                gainLoss: gainLoss,
                yieldPct: yieldPct,
                annualIncomeEUR: annualIncomeEUR,
                per: perVal,
                dividendSafetyScore: dividendSafety,
                yoc: yoc,
                changePercent: 0,
                fxToBase: fx
            };
        });

        // Resolve async map and compute totals
        return Promise.all(holdings).then(resolvedHoldings => {
            const totalValue = resolvedHoldings.reduce((sum, h) => sum + h.valueInEUR, 0);
            const totalAnnualIncome = resolvedHoldings.reduce((sum, h) => sum + h.annualIncomeEUR, 0);
            const dividendYield = totalValue > 0 ? (totalAnnualIncome / totalValue) * 100 : 0;
            resolvedHoldings.forEach(h => {
                h.weight = totalValue > 0 ? (h.valueInEUR / totalValue) * 100 : 0;
            });
            const monthlyIncome = totalAnnualIncome / 12;
            return {
                holdings: resolvedHoldings,
                summary: {
                    totalValue,
                    totalAnnualIncome,
                    monthlyIncome,
                    dividendYield,
                    dailyChange: 0,
                    holdingsCount: resolvedHoldings.length
                }
            };
        });
    };




    async function mockProcess() {
        // Fallback: Simulate seeding outcome
        // Ensure PER data is fetched even in mock mode
        await fetchPER();

        const mockHoldings = OFFLINE_DATA.map((h, i) => ({
            id: 'mock-' + i,
            ticker: h.ticker,
            quantity: h.shares,
            avg_price: h.costLocal, // Simulated DB has Local Cost
            currency: h.currency,
            name: h.name
        }));
        return processHoldings(mockHoldings);
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
