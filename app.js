import { parseContentTables } from './parser.js?v=14';
import { FlashcardSystem } from './flashcards.js?v=14';
import { ProgressSystem } from './progress.js?v=14';

// Global State
window.progressSystem = new ProgressSystem();
window.progressSystem.init();

const DB_NAME = 'GermanStudyDB';
const STORE_NAME = 'customCheatsheets';
const CustomCheatsheetsDB = {
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async add(file) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const item = {
          id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type,
          dataUrl: reader.result,
          timestamp: Date.now()
        };
        store.put(item);
        tx.oncomplete = () => resolve(item);
        tx.onerror = () => reject(tx.error);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },
  async getAll() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
};

window.allGrammarTables = [];

let navData = null;
let allVocab = [];
let vocabByLevel = { a1: [], a2: [], b1: [], referenz: [] };
const flashcardSystem = new FlashcardSystem();

marked.use({ breaks: true, gfm: true });

async function init() {
  setupUI();
  try {
    const res = await fetch('nav.json');
    navData = await res.json();
    buildGrammarSidebar(navData);
    buildDashboardGrammarList();
    
    // Kick off async loading of all content
    loadAllContent();
    loadCheatsheets();
  } catch (e) {
    console.error('Could not load nav.json:', e);
  }
}

// ── UI SETUP & PAGE ROUTING ────────────────────────────
function setupUI() {
  // Navigation
  document.querySelectorAll('.nav-link, .mob-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = e.target.dataset.page;
      switchPage(page);
      document.getElementById('mobile-menu').classList.add('hidden');
      document.body.classList.remove('menu-open');

      document.querySelectorAll('.nav-link, .mob-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll(`.nav-link[data-page="${page}"], .mob-link[data-page="${page}"]`).forEach(l => l.classList.add('active'));
    });
  });

  document.getElementById('hamburger').addEventListener('click', () => {
    const isHidden = document.getElementById('mobile-menu').classList.toggle('hidden');
    document.body.classList.toggle('menu-open', !isHidden);
  });

  // Reference Tabs
  document.querySelectorAll('.ref-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.ref-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      loadReference(e.target.dataset.ref);
    });
  });

  // Global Search
  const searchInput = document.getElementById('vocab-search');
  const clearBtn = document.getElementById('search-clear');
  const defaultContent = document.getElementById('default-content');
  const searchResults = document.getElementById('search-results-section');
  const tbody = document.getElementById('search-results-body');
  const countLabel = document.getElementById('result-count');

  const doSearch = (query) => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      clearBtn.classList.add('hidden');
      searchResults.classList.add('hidden');
      defaultContent.classList.remove('hidden');
      return;
    }
    
    clearBtn.classList.remove('hidden');
    defaultContent.classList.add('hidden');
    searchResults.classList.remove('hidden');

    const results = allVocab.filter(v => 
      v.front.toLowerCase().includes(q) || 
      v.back.toLowerCase().includes(q)
    ).slice(0, 50); // Limit to 50 results

    countLabel.textContent = `${results.length} Ergebnisse`;
    
    if (results.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">Keine Wörter gefunden.</td></tr>';
      return;
    }

    tbody.innerHTML = results.map(r => {
      let detailsHtml = '';
      if (r.details && Object.keys(r.details).length > 0) {
        detailsHtml = `<div style="display:flex; flex-wrap:wrap; gap:8px; font-size:12px; color:var(--text-muted);">` +
          Object.entries(r.details).map(([k, v]) => `<span><strong style="color:var(--text-secondary);">${k}:</strong> ${v}</span>`).join('') +
          `</div>`;
      }
      
      let posHtml = '';
      if (r.pos) {
        posHtml = `<span class="fc-pos-badge pos-${r.pos.toLowerCase()}" style="margin-left:8px;">${r.pos}</span>`;
      }

      return `
        <tr>
          <td class="col-de">${r.front}${posHtml}</td>
          <td class="col-en">${r.back}</td>
          <td class="col-details">${detailsHtml}</td>
          <td class="col-lek">${r.sourceLevel.toUpperCase()} / ${r.sourceLektion}</td>
        </tr>
      `;
    }).join('');
  };

  searchInput.addEventListener('input', (e) => doSearch(e.target.value));
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    doSearch('');
    searchInput.focus();
  });

  // Grammar Search
  const grammarSearchInput = document.getElementById('grammar-search');
  const grammarSearchClear = document.getElementById('grammar-search-clear');
  const grammarContent = document.getElementById('grammar-content');

  const GRAMMAR_EMPTY = `<div class="empty-state"><div class="empty-icon">📖</div><p>Wähle eine Lektion aus der Liste</p></div>`;

  const doGrammarSearch = (query) => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      grammarSearchClear.classList.add('hidden');
      grammarContent.innerHTML = GRAMMAR_EMPTY;
      return;
    }
    grammarSearchClear.classList.remove('hidden');

    const results = (window.allGrammarTables || []).filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.lektionLabel.toLowerCase().includes(q) ||
      t.html.toLowerCase().includes(q)
    );

    if (results.length === 0) {
      grammarContent.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Keine Grammatikthemen gefunden für „${query}"</p></div>`;
      return;
    }

    grammarContent.innerHTML = `
      <div class="grammar-search-header">
        <span class="result-count">${results.length} Ergebnis${results.length !== 1 ? 'se' : ''}</span>
      </div>
      ${results.map(t => `
        <div class="grammar-result-card" data-level="${t.levelId}" data-lektion="${t.lektionId}">
          <div class="grammar-result-meta">
            <span class="grammar-result-level">${t.levelId.toUpperCase()}</span>
            <span class="grammar-result-lektion">${t.lektionLabel}</span>
          </div>
          <h3 class="grammar-result-title">${t.title}</h3>
          <div class="grammar-result-content">${t.html}</div>
        </div>
      `).join('')}
    `;

    grammarContent.querySelectorAll('.grammar-result-card').forEach(card => {
      card.addEventListener('click', () => {
        const { level, lektion } = card.dataset;
        grammarSearchInput.value = '';
        doGrammarSearch('');
        document.querySelectorAll('.gs-link').forEach(l => l.classList.remove('active'));
        const link = document.querySelector(`.gs-link[data-level="${level}"][data-lektion="${lektion}"]`);
        if (link) { link.classList.add('active'); link.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        loadGrammarContent(level, lektion);
      });
    });
  };

  grammarSearchInput.addEventListener('input', (e) => doGrammarSearch(e.target.value));
  grammarSearchClear.addEventListener('click', () => {
    grammarSearchInput.value = '';
    doGrammarSearch('');
    grammarSearchInput.focus();
  });

  // Flashcard Settings Modal
  const fcSettingsModal = document.getElementById('fc-settings-modal');
  const fcOpenSettings = document.getElementById('fc-open-settings');
  const fcSettingsClose = document.getElementById('fc-settings-close');
  const fcStartSession = document.getElementById('fc-start-session');
  const chkboxA1 = document.getElementById('chk-a1');
  const chkboxA2 = document.getElementById('chk-a2');
  const chkboxB1 = document.getElementById('chk-b1');
  const fcSelectedCount = document.getElementById('fc-selected-count');

  const updateSelectedCount = () => {
    let count = 0;
    if (chkboxA1?.checked) count += vocabByLevel.a1.length;
    if (chkboxA2?.checked) count += vocabByLevel.a2.length;
    if (chkboxB1?.checked) count += vocabByLevel.b1.length;
    if (fcSelectedCount) fcSelectedCount.textContent = count;
  };

  [chkboxA1, chkboxA2, chkboxB1].forEach(chk => {
    chk?.addEventListener('change', updateSelectedCount);
  });

  fcOpenSettings?.addEventListener('click', () => {
    updateSelectedCount();
    fcSettingsModal.classList.remove('hidden');
    fcSettingsModal.style.display = 'flex';
  });

  fcSettingsClose?.addEventListener('click', () => {
    fcSettingsModal.classList.add('hidden');
    setTimeout(() => fcSettingsModal.style.display = '', 200); // Wait for transition if we add one
  });

  fcStartSession?.addEventListener('click', () => {
    let deck = [];
    if (chkboxA1?.checked) deck.push(...vocabByLevel.a1);
    if (chkboxA2?.checked) deck.push(...vocabByLevel.a2);
    if (chkboxB1?.checked) deck.push(...vocabByLevel.b1);
    
    if (deck.length === 0) {
      showToast('Bitte wähle mindestens ein Level aus.');
      return;
    }
    
    fcSettingsModal.classList.add('hidden');
    flashcardSystem.start(deck);
  });

  // Cheatsheet Upload
  const csUploadBtn = document.getElementById('cs-upload-btn');
  const csUploadInput = document.getElementById('cs-upload-input');
  
  csUploadBtn?.addEventListener('click', () => {
    csUploadInput?.click();
  });
  
  csUploadInput?.addEventListener('change', async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files);
    showToast(`${files.length} Datei(en) werden hochgeladen...`);
    
    try {
      for (const file of files) {
        await CustomCheatsheetsDB.add(file);
      }
      showToast('Hochladen erfolgreich!');
      loadCheatsheets();
    } catch (err) {
      console.error(err);
      showToast('Fehler beim Hochladen.');
    }
    
    // Clear input
    e.target.value = '';
  });
}

function switchPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${pageId}`).classList.remove('hidden');
  
  if (pageId === 'reference') {
    const activeTab = document.querySelector('.ref-tab.active');
    if (activeTab) loadReference(activeTab.dataset.ref);
  }
}

// ── DATA LOADING ───────────────────────────────────────
async function loadAllContent() {
  const fetchPromises = [];

  navData.levels.forEach(level => {
    level.lektionen.forEach(lektion => {
      // 1. Fetch Vocabulary
      let vocabPath = `content/${level.id}/${lektion.id}/vocabulary.md`;
      if (level.id === 'referenz' && lektion.id === 'cheatsheets') {
         vocabPath = `content/${level.id}/${lektion.id}/vocabulary.md`; // Fallback, not really used
      }

      if (level.id !== 'referenz') {
        fetchPromises.push(
          fetch(vocabPath)
            .then(res => res.ok ? res.text() : null)
            .then(text => {
              if (!text) return;
              const html = marked.parse(text);
              const parsed = parseContentTables(html);
              
              parsed.vocabulary.forEach(v => {
                v.sourceLevel = level.id;
                v.sourceLektion = lektion.label;
              });

              vocabByLevel[level.id].push(...parsed.vocabulary);
              allVocab.push(...parsed.vocabulary);
            })
            .catch(() => {})
        );
      }

      // 2. Fetch Grammar
      let grammarPath = `content/${level.id}/${lektion.id}/grammar.md`;
      if (level.id === 'referenz' && (lektion.id === 'irregular-verbs' || lektion.id === 'prefix-verbs')) {
          grammarPath = `content/${level.id}/${lektion.id}/verben.md`;
      } else if (level.id === 'referenz' && lektion.id === 'cheatsheets') {
          return; // Skip cheatsheets grammar parsing for the table
      }

      fetchPromises.push(
        fetch(grammarPath)
          .then(res => res.ok ? res.text() : null)
          .then(text => {
            if (!text) return;
            const html = marked.parse(text);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            let currentSection = null;
            let tableIndex = 0;
            
            Array.from(tempDiv.children).forEach(node => {
              if (node.tagName.match(/^H[23]$/)) {
                if (currentSection && currentSection.html.trim() !== '') {
                  window.allGrammarTables.push(currentSection);
                }
                
                // Exclude the main title (usually H1, but just in case)
                if (node.textContent.includes('Grammatik – Lektion') || node.textContent.includes('Vollständige Liste')) return;
                
                currentSection = {
                  id: `${level.id}-${lektion.id}-table-${tableIndex++}`,
                  levelId: level.id,
                  lektionId: lektion.id,
                  lektionLabel: lektion.label,
                  title: node.textContent,
                  html: ''
                };
              } else if (currentSection && node.tagName !== 'H1') {
                currentSection.html += node.outerHTML;
              }
            });
            
            // Push the last section
            if (currentSection && currentSection.html.trim() !== '') {
              window.allGrammarTables.push(currentSection);
            }
          })
          .catch(() => {})
      );
    });
  });

  await Promise.all(fetchPromises);
  
  // Update UI counts
  const totalCountEl = document.getElementById('slc-total-count');
  if (totalCountEl) totalCountEl.textContent = `${allVocab.length} Wörter verfügbar`;
  
  // Now that data is loaded, build dashboard grammar list
  buildDashboardGrammarList();
  renderFavoriteTables();
}

// ── CHEATSHEET GALLERY ─────────────────────────────────
async function loadCheatsheets() {
  const gallery = document.getElementById('cs-gallery');
  if (!gallery) return;

  try {
    const res = await fetch('cheatsheets.json');
    if (!res.ok) throw new Error();
    const files = await res.json();
    
    // Filter out DS_Store
    let mediaFiles = files.filter(f => !f.includes('.DS_Store'));
    
    // Merge with custom uploads
    try {
      const customUploads = await CustomCheatsheetsDB.getAll();
      const customPaths = customUploads.map(c => c.dataUrl);
      mediaFiles = [...customPaths, ...mediaFiles];
    } catch (e) {
      console.error('Failed to load custom cheatsheets', e);
    }
    
    // Sort so favorites are at the top
    if (window.progressSystem) {
      mediaFiles.sort((a, b) => {
        const aFav = window.progressSystem.isCheatsheetFavorited(a);
        const bFav = window.progressSystem.isCheatsheetFavorited(b);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return 0; // preserve original order otherwise
      });
    }

    gallery.innerHTML = mediaFiles.map(path => {
      const isVideo = path.toLowerCase().includes('.mp4') || path.startsWith('data:video');
      const filename = path.startsWith('data:') ? 'Custom Upload' : path.split('/').pop();
      const isFav = window.progressSystem && window.progressSystem.isCheatsheetFavorited(path);
      
      if (isVideo) {
        return `
          <div class="cs-item video" onclick="openLightbox('${path}', true)">
            <button class="cs-fav-btn ${isFav ? 'active' : ''}" data-path="${path}">★</button>
            <video class="cs-media" src="${path}" muted playsinline></video>
          </div>
        `;
      } else {
        return `
          <div class="cs-item" onclick="openLightbox('${path}', false)">
            <button class="cs-fav-btn ${isFav ? 'active' : ''}" data-path="${path}">★</button>
            <img class="cs-media" src="${path}" loading="lazy" alt="${filename}">
          </div>
        `;
      }
    }).join('');
    
    // Bind favorite buttons
    gallery.querySelectorAll('.cs-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent opening lightbox
        const path = e.target.dataset.path;
        if (window.progressSystem) {
          const added = window.progressSystem.toggleFavoriteCheatsheet(path);
          e.target.classList.toggle('active', added);
          e.target.style.color = added ? '#3b82f6' : 'var(--text-muted)';
          showToast(added ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
          // Reload gallery to re-sort
          loadCheatsheets();
        }
      });
    });
    
  } catch (e) {
    gallery.innerHTML = '<div style="color:var(--text-muted);">Cheatsheets konnten nicht geladen werden.</div>';
  }
}

window.openLightbox = function(path, isVideo) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'lightbox-close';
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:24px;height:24px;"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  
  let content;
  if (isVideo) {
    content = document.createElement('video');
    content.className = 'lightbox-content';
    content.src = path;
    content.controls = true;
    content.autoplay = true;
  } else {
    content = document.createElement('img');
    content.className = 'lightbox-content';
    content.src = path;
  }
  
  const close = () => overlay.remove();
  closeBtn.onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  
  overlay.appendChild(closeBtn);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
};

// ── GRAMMAR PAGE ───────────────────────────────────────
function buildGrammarSidebar(data) {
  const sidebar = document.getElementById('grammar-sidebar');
  sidebar.innerHTML = '';

  data.levels.forEach(level => {
    if (level.id === 'referenz') return;
    
    const h3 = document.createElement('h3');
    h3.className = 'gs-level';
    h3.textContent = level.label;
    sidebar.appendChild(h3);

    level.lektionen.forEach(lektion => {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'gs-link';
      link.dataset.level = level.id;
      link.dataset.lektion = lektion.id;
      link.textContent = lektion.label;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.gs-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const gsi = document.getElementById('grammar-search');
        if (gsi && gsi.value) { gsi.value = ''; document.getElementById('grammar-search-clear').classList.add('hidden'); }
        loadGrammarContent(level.id, lektion.id);
      });
      sidebar.appendChild(link);
    });
  });
}

function buildDashboardGrammarList() {
  const container = document.getElementById('db-grammar-list');
  const tabs = document.querySelectorAll('#db-grammar-filter .filter-tab');
  if (!container || !window.allGrammarTables) return;

  const renderList = (levelId) => {
    container.innerHTML = '';
    let tables = window.allGrammarTables.filter(t => t.levelId === levelId);
    
    // Sort so favorites are at the top
    if (window.progressSystem) {
        tables.sort((a, b) => {
            const aFav = window.progressSystem.isTableFavorited(a.id);
            const bFav = window.progressSystem.isTableFavorited(b.id);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0; // preserve original order otherwise
        });
    }
    
    if (tables.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);">Keine Tabellen gefunden.</div>';
      return;
    }

    tables.forEach(table => {
      const card = document.createElement('div');
      card.className = 'lek-item';
      
      const isFav = window.progressSystem && window.progressSystem.isTableFavorited(table.id);
      
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">${table.lektionLabel}</div>
            <div class="lek-title" style="font-size:16px;">${table.title}</div>
          </div>
          <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${table.id}" style="background:none; border:none; cursor:pointer; font-size:24px; color:${isFav ? 'var(--accent-blue)' : 'var(--text-muted)'}; transition: color 0.2s;">
            ★
          </button>
        </div>
      `;
      
      // Favorite button listener
      const favBtn = card.querySelector('.fav-btn');
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.progressSystem) {
          const added = window.progressSystem.toggleFavoriteTable(table.id);
          favBtn.style.color = added ? '#3b82f6' : 'var(--text-muted)';
          renderFavoriteTables();
          
          // Re-render list to update sorting
          const activeTab = document.querySelector('#db-grammar-filter .filter-tab.active');
          if (activeTab) renderList(activeTab.dataset.filter);
          
          showToast(added ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
        } else {
          showToast('Fehler: Fortschrittssystem nicht geladen');
        }
      });
      
      // Navigate to grammar page on card click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.fav-btn')) return;
        switchPage('grammar');
        document.querySelectorAll('.nav-link, .mob-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.nav-link[data-page="grammar"], .mob-link[data-page="grammar"]').forEach(l => l.classList.add('active'));
        
        const targetLink = document.querySelector(`.gs-link[data-level="${table.levelId}"][data-lektion="${table.lektionId}"]`);
        if (targetLink) targetLink.click();
      });
      
      container.appendChild(card);
    });
  };

  tabs.forEach(tab => {
    // Only bind once
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);
    newTab.addEventListener('click', (e) => {
      document.querySelectorAll('#db-grammar-filter .filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      renderList(e.target.dataset.filter);
    });
  });

  renderList('a1');
}

function renderFavoriteTables() {
  const section = document.getElementById('favorite-tables-section');
  const container = document.getElementById('favorite-tables-container');
  if (!section || !container) return;

  if (!window.progressSystem || !window.progressSystem.data.favoriteTables || window.progressSystem.data.favoriteTables.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  container.innerHTML = '';

  const favorites = window.progressSystem.data.favoriteTables;
  const tablesToRender = window.allGrammarTables.filter(t => favorites.includes(t.id));

  tablesToRender.forEach(table => {
    const wrapper = document.createElement('div');
    wrapper.className = 'fav-table-wrapper markdown-body';
    wrapper.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 style="margin:0; font-size:18px; color:var(--text-primary);">${table.title}</h3>
        <span style="font-size:12px; color:var(--text-muted); background:var(--bg-dark); padding:4px 8px; border-radius:4px;">
          ${table.levelId.toUpperCase()} - ${table.lektionLabel}
        </span>
      </div>
      <div style="font-size: 14px;">
        ${table.html}
      </div>
    `;
    container.appendChild(wrapper);
  });
}

async function loadGrammarContent(levelId, lektionId) {
  const container = document.getElementById('grammar-content');
  container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;">Laden...</div>';
  
  try {
    const res = await fetch(`content/${levelId}/${lektionId}/grammar.md`);
    if (!res.ok) throw new Error();
    const text = await res.text();
    container.innerHTML = marked.parse(text);
  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚧</div>
        <p>Inhalt noch nicht vorhanden</p>
      </div>
    `;
  }
}

// ── REFERENCE PAGE ─────────────────────────────────────
async function loadReference(pathSegment) {
  const container = document.getElementById('ref-content');
  container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;">Laden...</div>';
  
  try {
    const res = await fetch(`content/${pathSegment}.md`);
    if (!res.ok) throw new Error();
    const text = await res.text();
    container.innerHTML = marked.parse(text);
  } catch (e) {
    container.innerHTML = `<div style="color:var(--error);">Fehler beim Laden.</div>`;
  }
}

export function showToast(message) {
  const root = document.getElementById('toast-root');
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

document.addEventListener('DOMContentLoaded', init);
