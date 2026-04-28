import { parseContentTables } from './parser.js';
import { FlashcardSystem } from './flashcards.js';

// Global State
let navData = null;
let allVocab = [];
let vocabByLevel = { a1: [], a2: [], b1: [] };
const flashcardSystem = new FlashcardSystem();

marked.use({ breaks: true, gfm: true });

async function init() {
  setupUI();
  try {
    const res = await fetch('nav.json');
    navData = await res.json();
    buildGrammarSidebar(navData);
    
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
      
      document.querySelectorAll('.nav-link, .mob-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll(`.nav-link[data-page="${page}"], .mob-link[data-page="${page}"]`).forEach(l => l.classList.add('active'));
    });
  });

  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('mobile-menu').classList.toggle('hidden');
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
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:32px;">Keine Wörter gefunden.</td></tr>';
      return;
    }

    tbody.innerHTML = results.map(r => `
      <tr>
        <td class="col-de">${r.front} ${r.extra ? `<span style="font-size:12px;color:var(--text-muted)">(${r.extra})</span>` : ''}</td>
        <td class="col-en">${r.back}</td>
        <td class="col-lek">${r.sourceLevel.toUpperCase()} / ${r.sourceLektion}</td>
      </tr>
    `).join('');
  };

  searchInput.addEventListener('input', (e) => doSearch(e.target.value));
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    doSearch('');
    searchInput.focus();
  });

  // Flashcard Launch Buttons
  ['a1', 'a2', 'b1', 'all'].forEach(level => {
    document.getElementById(`fc-launch-${level}`)?.addEventListener('click', () => {
      if (level === 'all') {
        flashcardSystem.start(allVocab);
      } else {
        flashcardSystem.start(vocabByLevel[level]);
      }
    });
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
    if (level.id === 'referenz') return;
    
    level.lektionen.forEach(lektion => {
      // Assuming 'vocabulary' is always an id inside sections
      const path = `content/${level.id}/${lektion.id}/vocabulary.md`;
      fetchPromises.push(
        fetch(path)
          .then(res => res.ok ? res.text() : null)
          .then(text => {
            if (!text) return;
            const html = marked.parse(text);
            const parsed = parseContentTables(html);
            
            // Add metadata
            parsed.vocabulary.forEach(v => {
              v.sourceLevel = level.id;
              v.sourceLektion = lektion.label;
            });

            vocabByLevel[level.id].push(...parsed.vocabulary);
            allVocab.push(...parsed.vocabulary);
          })
          .catch(() => {}) // Ignore 404s
      );
    });
  });

  await Promise.all(fetchPromises);
  
  // Update UI counts
  ['a1', 'a2', 'b1'].forEach(lvl => {
    const el = document.getElementById(`lc-${lvl}-count`);
    if (el) el.textContent = `${vocabByLevel[lvl].length} Wörter`;
  });
  document.getElementById('lc-all-count').textContent = `${allVocab.length} Wörter`;
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
    const mediaFiles = files.filter(f => !f.includes('.DS_Store'));
    
    gallery.innerHTML = mediaFiles.map(path => {
      const isVideo = path.toLowerCase().endsWith('.mp4');
      const filename = path.split('/').pop();
      
      if (isVideo) {
        return `
          <div class="cs-item video" onclick="openLightbox('${path}', true)">
            <video class="cs-media" src="${path}" muted playsinline></video>
          </div>
        `;
      } else {
        return `
          <div class="cs-item" onclick="openLightbox('${path}', false)">
            <img class="cs-media" src="${path}" loading="lazy" alt="${filename}">
          </div>
        `;
      }
    }).join('');
    
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
      link.textContent = lektion.label;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.gs-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        loadGrammarContent(level.id, lektion.id);
      });
      sidebar.appendChild(link);
    });
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
