/**
 * Screener Module
 * Filters and renders portfolio data for analysis
 */

(async function () {
    'use strict';

    const {
        getUser,
        signIn,
        signUp,
        signOut,
        fetchData,
        formatCurrency,
        formatPercent
    } = DataModule;

    const tables = {
        yield: document.getElementById('table-yield'),
        per: document.getElementById('table-per'),
        lossPct: document.getElementById('table-loss-pct'),
        lossVal: document.getElementById('table-loss-val')
    };

    async function loadScreener() {
        try {
            const data = await fetchData();
            const user = await getUser();
            updateAuthButton(user);

            if (!user) {
                showLoginMessage();
                return;
            }

            const holdings = data.holdings;

            renderHighestYield(holdings);
            renderLowestPER(holdings);
            renderGreatestLossPct(holdings);
            renderTopLossValue(holdings);

        } catch (error) {
            console.error('Screener Load Error:', error);
        }
    }

    // Helper to render rows
    function renderTable(tableEl, data, columns) {
        if (data.length === 0) {
            tableEl.innerHTML = '<tr><td colspan="3">No data available</td></tr>';
            return;
        }

        tableEl.innerHTML = data.map(h => `
            <tr>
                <td><strong>${h.ticker}</strong><br><span style="font-size:10px;color:#888">${h.name.substring(0, 15)}...</span></td>
                ${columns.map(col => `<td>${col(h)}</td>`).join('')}
            </tr>
        `).join('');
    }

    function renderHighestYield(holdings) {
        // Sort by Yield DESC
        const sorted = [...holdings]
            .filter(h => h.yieldPct > 0)
            .sort((a, b) => b.yieldPct - a.yieldPct)
            .slice(0, 5);

        renderTable(tables.yield, sorted, [
            h => formatCurrency(h.price, h.currency),
            h => `<span class="rank-up">${formatPercent(h.yieldPct)}</span>`
        ]);
    }

    function renderLowestPER(holdings) {
        // Sort by PER ASC (filter out 0 or N/A)
        const sorted = [...holdings]
            .filter(h => {
                if (!h.per || h.per === 'N/A') return false;
                // Parse potentially localized number string "14,92" -> 14.92
                const val = parseFloat(String(h.per).replace(',', '.'));
                return val > 0;
            })
            .sort((a, b) => {
                const valA = parseFloat(String(a.per).replace(',', '.'));
                const valB = parseFloat(String(b.per).replace(',', '.'));
                return valA - valB;
            })
            .slice(0, 10); // Show Top 10

        renderTable(tables.per, sorted, [
            h => formatCurrency(h.price, h.currency),
            h => `<strong>${h.per}</strong>`
        ]);
    }

    function renderGreatestLossPct(holdings) {
        // Sort by Gain/Loss ASC (Most Negative First)
        const sorted = [...holdings]
            .sort((a, b) => a.gainLoss - b.gainLoss)
            .slice(0, 5);

        renderTable(tables.lossPct, sorted, [
            h => formatCurrency(h.costPerShare, h.currency),
            h => `<span class="rank-down">${formatPercent(h.gainLoss)}</span>`
        ]);
    }

    function renderTopLossValue(holdings) {
        // Sort by Value * GainLoss% (Absolute Money Lost) approx: Value - CostBasis
        // CostBasis = Value / (1 + GainLoss/100)
        // Loss = Value - CostBasis (Negative number is loss)

        const withAbsLoss = holdings.map(h => {
            const costBasis = h.valueInEUR / (1 + (h.gainLoss / 100));
            const profitLossEUR = h.valueInEUR - costBasis;
            return { ...h, profitLossEUR };
        });

        const sorted = withAbsLoss
            .filter(h => h.profitLossEUR < 0)
            .sort((a, b) => a.profitLossEUR - b.profitLossEUR) // Most negative first
            .slice(0, 5);

        renderTable(tables.lossVal, sorted, [
            h => formatCurrency(h.valueInEUR, 'EUR'),
            h => `<span class="rank-down">${formatCurrency(h.profitLossEUR, 'EUR')}</span>`
        ]);
    }

    // --- Auth Logic ---
    let authMode = 'login';
    const authModal = document.getElementById('auth-modal');
    const authError = document.getElementById('auth-error');

    const openAuthModal = () => {
        authModal.style.display = 'block';
        authMode = 'login';
        updateAuthUI();
    };

    const closeAuthModal = () => {
        authModal.style.display = 'none';
        authError.style.display = 'none';
    };

    const toggleAuthMode = () => {
        authMode = authMode === 'login' ? 'signup' : 'login';
        updateAuthUI();
    };

    const updateAuthUI = () => {
        const title = document.getElementById('auth-title');
        const switchText = document.getElementById('auth-switch-text');
        const switchBtn = document.getElementById('auth-switch-btn');
        const signupExtra = document.getElementById('signup-extra');

        if (authMode === 'login') {
            title.textContent = 'Login';
            switchText.textContent = 'No account?';
            switchBtn.textContent = 'Sign up';
            signupExtra.style.display = 'none';
        } else {
            title.textContent = 'Sign Up';
            switchText.textContent = 'Have an account?';
            switchBtn.textContent = 'Login';
            signupExtra.style.display = 'block';
        }
    };

    const handleAuthSubmit = async (e) => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        authError.style.display = 'none';

        try {
            if (authMode === 'login') {
                const { error } = await signIn(email, password);
                if (error) throw error;
            } else {
                const confirm = document.getElementById('auth-password-confirm').value;
                if (password !== confirm) throw new Error('Passwords do not match');
                const { error } = await signUp(email, password);
                if (error) throw error;
                alert('Account created. Please check email or sign in.');
                authMode = 'login';
                updateAuthUI();
                return;
            }
            closeAuthModal();
            loadScreener();
        } catch (err) {
            authError.textContent = err.message;
            authError.style.display = 'block';
        }
    };

    const updateAuthButton = (user) => {
        const authBtn = document.getElementById('auth-btn');
        if (!authBtn) return;
        if (user) {
            authBtn.textContent = 'Logout';
            authBtn.onclick = async () => {
                await signOut();
                loadScreener();
            };
        } else {
            authBtn.textContent = 'Login';
            authBtn.onclick = openAuthModal;
        }
    };

    const showLoginMessage = () => {
        const grid = document.querySelector('.screener-grid');
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 100px 0; text-align: center; background: var(--surface-white); border-radius: var(--radius-lg);">
                    <div style="font-size: 3rem; margin-bottom: 20px;">🔒</div>
                    <h3>Private Access</h3>
                    <p>Please log in to analyze your portfolio opportunities.</p>
                    <button class="btn btn-primary" onclick="screener.openAuthModal()" style="margin-top: 20px;">Login Access</button>
                </div>
            `;
        }
    };

    window.screener = {
        openAuthModal,
        closeAuthModal,
        toggleAuthMode,
        handleAuthSubmit
    };

    // --- Dark Mode Logic ---
    const themeToggle = document.getElementById('theme-toggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    // Check local storage or system preference
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark' || (!currentTheme && prefersDarkScheme.matches)) {
        document.body.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.textContent = '☀️';
    } else {
        document.body.removeAttribute('data-theme');
        if (themeToggle) themeToggle.textContent = '🌙';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let theme = document.body.getAttribute('data-theme');
            if (theme === 'dark') {
                document.body.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                themeToggle.textContent = '🌙';
            } else {
                document.body.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggle.textContent = '☀️';
            }
        });
    }

    loadScreener();

})();
