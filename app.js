/**
 * App Module - Main Interactive Logic
 * Handles Rendering, Modals, and User Actions (CRUD)
 */

(async function () {
  'use strict';

  const {
    getUser,
    signIn,
    signUp,
    signOut,
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
                    <td style="cursor: pointer">
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
                    <td class="mobile-hide">${h.weight ? h.weight.toFixed(2) : '0.00'}%</td>
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
                    <td class="mobile-hide">
                       ${h.yoc ? h.yoc.toFixed(2) + '%' : '-'}
                    </td>
                    <td class="mobile-hide">
                       ${h.per || '-'}
                    </td>
                    <td class="mobile-hide">
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
    const form = document.getElementById('form-position');
    if (form) form.reset();
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
      console.log('Add Button Found, attaching listener');
      btnAdd.onclick = (e) => {
        console.log('Add Button Clicked');
        e.preventDefault();
        resetForm();
        openModal(elements.modalPosition);
      };
    } else {
      console.error('Add Button NOT found during setup');
    }

    // Import/Sync Button
    const btnImport = document.querySelector('.btn-import');
    if (btnImport) {
      btnImport.onclick = async (e) => {
        e.preventDefault();
        if (confirm('¿Sincronizar cartera con Google Sheets? Esto reemplazará los datos actuales en Supabase.')) {
          setLoadingState(true);
          try {
            const res = await DataModule.syncFromCSV();
            if (res.error) throw new Error(res.error);
            alert('Sincronización completada con éxito.');
            await loadData(true);
          } catch (err) {
            alert('Error en la sincronización: ' + err.message);
          } finally {
            setLoadingState(false);
          }
        }
      };
    }

    // Event Delegation for Table Actions (Edit/Delete/Row Click)
    if (elements.holdingsBody) {
      elements.holdingsBody.addEventListener('click', (e) => {
        const target = e.target;
        const row = target.closest('tr.holding-row');
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
    const loadingText = isLoading ? 'Loading...' : '0.00 €';
    if (isLoading) {
      if (elements.totalBalance) elements.totalBalance.textContent = 'Loading...';
      if (elements.annualIncome) elements.annualIncome.textContent = 'Loading...';
      if (elements.monthlyIncome) elements.monthlyIncome.textContent = 'Loading...';
      if (elements.dividendYield) elements.dividendYield.textContent = '-';
      if (elements.holdingsBody) elements.holdingsBody.innerHTML = '<tr><td colspan="12" class="loading-row">Refreshing Data...</td></tr>';
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

      const user = await getUser();
      updateAuthButton(user);

      if (user) {
        renderSummary(portfolioData);
        filterAndRender();
      } else {
        showLoginMessage();
      }
      console.log('App Loaded. Data:', portfolioData);

    } catch (error) {
      console.error('Failed to load data:', error);
      if (elements.holdingsBody) {
        elements.holdingsBody.innerHTML = `
                 <tr>
                     <td colspan="10" class="loading-row" style="color: #F44336;">
                         Error loading data: ${error.message}
                         <br>Check console for details.
                     </td>
                 </tr>
             `;
      }
    } finally {
      setLoadingState(false);
    }
  }

  // --- Auth Handlers ---
  let authMode = 'login'; // 'login' or 'signup'

  const openAuthModal = () => {
    elements.authModal.style.display = 'block';
    authMode = 'login';
    updateAuthUI();
  };

  const closeAuthModal = () => {
    elements.authModal.style.display = 'none';
    elements.authError.style.display = 'none';
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
    e.preventDefault(); // Prevent default form submission
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    errorEl.style.display = 'none';

    try {
      if (authMode === 'login') {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        const confirm = document.getElementById('auth-password-confirm').value;
        if (password !== confirm) throw new Error('Passwords do not match');
        const { error } = await signUp(email, password);
        if (error) throw error;
        alert('Verification email sent or account created. Please sign in.');
        authMode = 'login';
        updateAuthUI();
        return;
      }
      closeAuthModal();
      loadData(true);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  };

  const updateAuthButton = (user) => {
    const authBtn = document.getElementById('auth-btn');
    if (!authBtn) return;
    if (user) {
      authBtn.textContent = 'Logout';
      authBtn.onclick = async () => {
        await signOut();
        loadData(true);
      };
    } else {
      authBtn.textContent = 'Login';
      authBtn.onclick = openAuthModal;
    }
  };

  const showLoginMessage = () => {
    if (elements.holdingsBody) {
      elements.holdingsBody.innerHTML = `
        <tr>
          <td colspan="10" style="padding: 100px 0; text-align: center; color: var(--text-secondary);">
            <div style="font-size: 2rem; margin-bottom: 20px;">🔒</div>
            <p>Please log in to see your portfolio</p>
            <button class="btn btn-primary" onclick="app.openAuthModal()" style="margin-top: 20px;">Login Now</button>
          </td>
        </tr>
      `;
    }
  };

  // Expose to window for inline onclicks
  window.app = {
    openDetail: (id) => {
      const h = portfolioData.holdings.find(item => item.id === id);
      if (h) renderDetail(h);
    },
    openEdit: (id) => { // Renamed from openEditModal to match original app.openEdit
      const h = portfolioData.holdings.find(item => item.id === id);
      if (h) openPositionModal(h);
    },
    confirmDelete: (id) => { // Renamed from openDeleteModal to match original app.confirmDelete
      const h = portfolioData.holdings.find(item => item.id === id);
      if (h) openDeleteModal(h);
    },
    closeModal: () => { // This is a generic close, specific modals should be closed by their own functions
      elements.modalPosition.style.display = 'none';
      elements.modalDelete.style.display = 'none';
      elements.modalDetail.style.display = 'none';
      closeAuthModal(); // Ensure auth modal is closed too
    },
    closeAuthModal,
    openAuthModal,
    handleAuthSubmit,
    toggleAuthMode
  };

  // Init Logic
  const init = async () => {
    console.log('Initializing App...');

    // Initialize DOM Elements Here to ensure they exist
    elements.updateDate = document.getElementById('update-date');
    elements.balanceDate = document.getElementById('balance-date');
    elements.totalBalance = document.getElementById('total-balance');
    elements.dailyChange = document.getElementById('daily-change');
    elements.annualIncome = document.getElementById('annual-income');
    elements.monthlyIncome = document.getElementById('monthly-income');
    elements.dividendYield = document.getElementById('dividend-yield');
    elements.holdingsCount = document.getElementById('holdings-count');
    elements.holdingsTotal = document.getElementById('holdings-total');
    elements.holdingsBody = document.getElementById('holdings-body');

    // Modals
    elements.modalPosition = document.getElementById('modal-position');
    elements.modalDelete = document.getElementById('modal-delete');
    elements.modalDetail = document.getElementById('modal-detail');
    elements.authModal = document.getElementById('auth-modal'); // New auth modal element
    elements.authError = document.getElementById('auth-error'); // New auth error element
    elements.authForm = document.getElementById('auth-form'); // New auth form element

    // Forms & Buttons
    elements.formPosition = document.getElementById('form-position');
    elements.btnConfirmDelete = document.getElementById('btn-confirm-delete');
    elements.closeButtons = document.querySelectorAll('.close-modal, .btn-cancel');

    setupEventListeners();
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

    await loadData();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
