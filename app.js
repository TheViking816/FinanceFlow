/**
 * App Module - Main Interactive Logic
 * Handles Rendering, Modals, and User Actions (CRUD)
 */

(async function () {
  'use strict';

  const {
    fetchData,
    addPosition,
    updatePosition,
    deletePosition,
    formatCurrency,
    formatPercent
  } = DataModule;

  // DOM Elements
  const elements = {
    updateDate: document.getElementById('update-date'),
    balanceDate: document.getElementById('balance-date'),
    totalBalance: document.getElementById('total-balance'),
    dailyChange: document.getElementById('daily-change'),
    annualIncome: document.getElementById('annual-income'),
    monthlyIncome: document.getElementById('monthly-income'),
    dividendYield: document.getElementById('dividend-yield'),
    holdingsCount: document.getElementById('holdings-count'),
    holdingsTotal: document.getElementById('holdings-total'),
    holdingsBody: document.getElementById('holdings-body'),

    // Modals
    modalPosition: document.getElementById('modal-position'),
    modalDelete: document.getElementById('modal-delete'),
    modalDetail: document.getElementById('modal-detail'),

    // Forms & Buttons
    formPosition: document.getElementById('form-position'),
    btnAdd: document.querySelector('.btn-add'), // Make sure this exists in your HTML
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),
    closeButtons: document.querySelectorAll('.close-modal, .btn-cancel')
  };

  // State
  let currentSort = { column: 'value', direction: 'desc' };
  let portfolioData = null;
  let deleteTargetId = null;

  /**
   * Render summary cards
   */
  function renderSummary(data) {
    const { summary } = data;
    const today = new Date();
    const dateStr = today.toLocaleDateString('es-ES', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    if (elements.updateDate) elements.updateDate.textContent = dateStr;
    if (elements.balanceDate) elements.balanceDate.textContent = dateStr;

    elements.totalBalance.textContent = formatCurrency(summary.totalValue, 'EUR');

    const changeClass = summary.dailyChange >= 0 ? 'positive' : 'negative';
    if (elements.dailyChange) {
      elements.dailyChange.textContent = formatPercent(summary.dailyChange, 2);
      elements.dailyChange.className = `summary-change ${changeClass}`;
    }

    elements.annualIncome.textContent = formatCurrency(summary.totalAnnualIncome, 'EUR');

    // Monthly Income
    if (elements.monthlyIncome) {
      elements.monthlyIncome.textContent = formatCurrency(summary.monthlyIncome, 'EUR');
    }

    // Dividend Yield
    elements.dividendYield.textContent = `${summary.dividendYield.toFixed(2)}%`;

    elements.holdingsCount.textContent = summary.holdingsCount;
    if (elements.holdingsTotal) elements.holdingsTotal.textContent = summary.holdingsCount;
  }

  /**
   * Sort holdings
   */
  function sortHoldings(holdings, column, direction) {
    const sorted = [...holdings];

    const getValue = (h, col) => {
      switch (col) {
        case 'ticker': return h.ticker || '';
        case 'shares': return h.shares || 0;
        case 'price': return h.price || 0;
        case 'value': return h.valueInEUR || 0;
        case 'gainLoss': return h.gainLoss || 0;
        case 'yield': return h.yieldPct || 0;
        case 'yoc': return h.yoc || 0;
        case 'per': return parseFloat(h.per) || 0;
        case 'dividendSafetyScore': return parseFloat(h.dividendSafetyScore) || 0;
        default: return h.valueInEUR || 0; // Default sort by value
      }
    };

    sorted.sort((a, b) => {
      const aVal = getValue(a, column);
      const bVal = getValue(b, column);

      if (typeof aVal === 'string') {
        return direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  }

  /**
   * Render holdings table
   */
  function renderHoldings(data) {
    const { holdings } = data;

    if (holdings.length === 0) {
      elements.holdingsBody.innerHTML = `
                <tr>
                    <td colspan="10" class="loading-row">No holdings found. Add a position to start.</td>
                </tr>
            `;
      return;
    }

    const sorted = sortHoldings(holdings, currentSort.column, currentSort.direction);

    elements.holdingsBody.innerHTML = sorted.map(h => {
      const priceChangeClass = (h.changePercent || 0) >= 0 ? 'positive' : 'negative';
      const gainClass = (h.gainLoss || 0) >= 0 ? 'gain-positive' : 'gain-negative';

      // Updated Render with new columns and embedded actions
      return `
                <tr class="holding-row" data-id="${h.id}">
                    <td onclick="app.openDetail('${h.id}')" style="cursor: pointer">
                        <div class="ticker-cell">
                          <div class="ticker-info">
                            <span class="ticker-symbol">${h.fullTicker || h.ticker}</span>
                            <span class="ticker-name">${h.name}</span>
                          </div>
                            <!-- Embed actions directly under ticker -->
                            <div class="ticker-actions-embedded">
                                <span class="action-btn edit-btn">Edit</span> 
                                <span class="action-divider">|</span> 
                                <span class="action-btn delete-btn">Delete</span>
                            </div>
                        </div>
                    </td>
                    <td>${h.shares}</td>
                    <td>
                        <strong>${formatCurrency(h.costPerShare, h.currency)}</strong>
                    </td>
                    <td>
                        <div class="price-cell">
                            <span class="price-value">${formatCurrency(h.price, h.currency)}</span>
                        </div>
                    </td>
                    <td>${h.weight ? h.weight.toFixed(2) : '0.00'}%</td>
                    <td>
                        <div>
                            <strong>${formatCurrency(h.valueInEUR, 'EUR')}</strong>
                        </div>
                    </td>
                    <td class="${gainClass}">
                        ${h.gainLoss !== null ? formatPercent(h.gainLoss, 1) : '-'}
                    </td>
                    <td>
                        <div class="yield-cell">
                            <span class="yield-value">${h.yieldPct ? h.yieldPct.toFixed(2) + '%' : '-'}</span>
                        </div>
                    </td>
                    <td>
                       ${h.yoc ? h.yoc.toFixed(2) + '%' : '-'}
                    </td>
                    <td>
                       ${h.per || '-'}
                    </td>
                    <td>
                       ${h.dividendSafetyScore || '-'}
                    </td>
                </tr>
            `;
    }).join('');
  }

  // --- Modal Logic ---

  function openModal(modal) {
    if (modal) modal.classList.add('show');
  }

  function closeModal(modal) {
    if (modal) modal.classList.remove('show');
  }

  function resetForm() {
    elements.formPosition.reset();
    document.getElementById('pos-id').value = '';
    document.getElementById('modal-title').textContent = 'Add Position';
  }

  // --- Exposed Functions for HTML Listeners ---

  const app = {
    openEdit: (id) => {
      const h = portfolioData.holdings.find(i => i.id === id);
      if (!h) return;

      document.getElementById('pos-id').value = h.id;
      document.getElementById('pos-ticker').value = h.ticker;
      document.getElementById('pos-shares').value = h.shares;
      document.getElementById('pos-cost').value = h.costPerShare;
      document.getElementById('modal-title').textContent = 'Edit Position';

      openModal(elements.modalPosition);
    },

    confirmDelete: (id) => {
      const h = portfolioData.holdings.find(i => i.id === id);
      if (!h) return;

      deleteTargetId = id;
      document.getElementById('delete-ticker').textContent = h.ticker;
      openModal(elements.modalDelete);
    },

    openDetail: (id) => {
      const h = portfolioData.holdings.find(i => i.id === id);
      if (!h) return;

      document.getElementById('detail-ticker').textContent = h.ticker;
      document.getElementById('detail-name').textContent = h.name;
      document.getElementById('detail-price').textContent = formatCurrency(h.price, h.currency);
      document.getElementById('detail-value').textContent = formatCurrency(h.valueInEUR, 'EUR');
      document.getElementById('detail-shares').textContent = h.shares;
      document.getElementById('detail-cost').textContent = formatCurrency(h.costPerShare * h.shares, h.currency); // Total Cost
      document.getElementById('detail-gain').textContent = formatPercent(h.gainLoss);
      document.getElementById('detail-yield').textContent = h.yieldPct ? h.yieldPct.toFixed(2) + '%' : '-';
      document.getElementById('detail-income').textContent = formatCurrency(h.annualIncomeEUR, 'EUR');
      document.getElementById('detail-sector').textContent = 'N/A'; // No sector data yet

      openModal(elements.modalDetail);
    }
  };
  window.app = app; // Expose to window

  // --- Event Listeners ---

  function setupEventListeners() {
    // Modals Close
    if (elements.closeButtons) {
      elements.closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          closeModal(elements.modalPosition);
          closeModal(elements.modalDelete);
          closeModal(elements.modalDetail);
        });
      });
    }

    // Click outside modal
    window.onclick = (event) => {
      if (event.target.classList.contains('modal')) {
        closeModal(event.target);
      }
    };

    // Add Button - Robust binding
    const btnAdd = document.querySelector('.btn-add'); // Re-select to be safe
    if (btnAdd) {
      btnAdd.onclick = (e) => {
        e.preventDefault();
        resetForm();
        openModal(elements.modalPosition);
      };
    }

    // Event Delegation for Table Actions (Edit/Delete/Row Click)
    if (elements.holdingsBody) {
      elements.holdingsBody.addEventListener('click', (e) => {
        const target = e.target;
        const row = target.closest('tr.holding-row'); // Ensure we get the holding row
        if (!row) return;
        const id = row.dataset.id;

        // Handle Edit
        if (target.classList.contains('edit-btn')) {
          e.stopPropagation();
          app.openEdit(id);
          return;
        }

        // Handle Delete
        if (target.classList.contains('delete-btn')) {
          e.stopPropagation();
          app.confirmDelete(id);
          return;
        }

        // Handle Row Click (Detail) - if NOT clicking an action
        app.openDetail(id);
      });
    }

    // Form Submit
    if (elements.formPosition) {
      elements.formPosition.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('pos-id').value;
        const ticker = document.getElementById('pos-ticker').value.trim();
        const shares = document.getElementById('pos-shares').value;
        const cost = document.getElementById('pos-cost').value;

        // Determine type from radio
        const selectedType = document.querySelector('input[name="pos-type"]:checked')?.value || 'buy';

        try {
          if (id) {
            // Edit mode (overwrite)
            await updatePosition(id, shares, cost);
          } else {
            // Add logic (Buy or Sell)
            if (selectedType === 'sell') {
              await DataModule.sellPosition(ticker, shares, cost);
            } else {
              await addPosition(ticker, shares, cost);
            }
          }
          closeModal(elements.modalPosition);
          setLoadingState(true); // Show loading while refreshing
          loadData(true);
        } catch (err) {
          alert('Error processing request: ' + err.message);
        }
      });
    }

    // Delete Confirm
    if (elements.btnConfirmDelete) {
      elements.btnConfirmDelete.addEventListener('click', async () => {
        if (deleteTargetId) {
          try {
            await deletePosition(deleteTargetId);
            closeModal(elements.modalDelete);
            setLoadingState(true);
            loadData(true);
          } catch (err) {
            alert('Error deleting: ' + err.message);
          }
        }
      });
    }

    // Sorting Headers
    const headers = document.querySelectorAll('.holdings-table th.sortable');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const column = header.dataset.sort;

        if (currentSort.column === column) {
          currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.column = column;
          currentSort.direction = 'desc';
        }

        // Update icons
        headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
        header.classList.add(`sort-${currentSort.direction}`);

        // Re-render based on current filtered data
        filterAndRender();
      });
    });

    // Search Input
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterAndRender();
      });
    }
  }

  function setLoadingState(isLoading) {
    const loadingText = isLoading ? 'Loading...' : '0.00 €'; // Default or '...'
    if (isLoading) {
      elements.totalBalance.textContent = 'Loading...';
      elements.annualIncome.textContent = 'Loading...';
      if (elements.monthlyIncome) elements.monthlyIncome.textContent = 'Loading...';
      if (elements.dividendYield) elements.dividendYield.textContent = '-';
      elements.holdingsBody.innerHTML = '<tr><td colspan="12" class="loading-row">Refreshing Data...</td></tr>';
    }
  }

  function filterAndRender() {
    if (!portfolioData) return;

    const searchTerm = document.querySelector('.search-input')?.value.toLowerCase().trim() || '';

    let filtered = portfolioData.holdings;
    if (searchTerm) {
      filtered = portfolioData.holdings.filter(h =>
        (h.ticker && h.ticker.toLowerCase().includes(searchTerm)) ||
        (h.name && h.name.toLowerCase().includes(searchTerm))
      );
    }

    renderHoldings({ holdings: filtered });
  }

  /**
   * Load and render all data
   */
  async function loadData(force = false) {
    try {
      if (!portfolioData) setLoadingState(true); // Initial load only

      portfolioData = await fetchData(force);
      renderSummary(portfolioData);
      filterAndRender(); // Initial Render
      console.log('App Loaded. Data:', portfolioData);

    } catch (error) {
      console.error('Failed to load data:', error);
      elements.holdingsBody.innerHTML = `
                <tr>
                    <td colspan="10" class="loading-row" style="color: #F44336;">
                        Error loading data: ${error.message}
                        <br>Check console for details.
                    </td>
                </tr>
            `;
    }
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    // Re-query elements if needed or just setup
    setupEventListeners();
    loadData();
  });

})();
