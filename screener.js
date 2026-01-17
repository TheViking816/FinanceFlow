/**
 * Screener Module
 * Filters and renders portfolio data for analysis
 */

(async function () {
    'use strict';

    const { fetchData, formatCurrency, formatPercent } = DataModule;

    const tables = {
        yield: document.getElementById('table-yield'),
        per: document.getElementById('table-per'),
        lossPct: document.getElementById('table-loss-pct'),
        lossVal: document.getElementById('table-loss-val')
    };

    async function loadScreener() {
        try {
            const data = await fetchData();
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

    loadScreener();

})();
