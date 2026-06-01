let navData = null;

marked.use({ breaks: true, gfm: true });

async function init() {
    try {
        const res = await fetch('nav.json');
        navData = await res.json();
        buildNavTree(navData);
    } catch (e) {
        console.error('Could not load nav.json:', e);
    }

    setupMobileMenu();
    document.getElementById('export-btn')?.addEventListener('click', exportVocabularyJSON);
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

// ── Nav tree ────────────────────────────────────────────

function buildNavTree(data) {
    const tree = document.getElementById('nav-tree');
    tree.innerHTML = '';

    for (const level of data.levels) {
        const levelBtn = document.createElement('button');
        levelBtn.className = 'nav-level-header';
        levelBtn.innerHTML = `<span>${level.label}</span><span class="chevron">&#9660;</span>`;

        const lekList = document.createElement('ul');
        lekList.className = 'nav-lektionen';

        levelBtn.addEventListener('click', () => {
            levelBtn.classList.toggle('collapsed');
            lekList.classList.toggle('hidden');
        });

        for (const lektion of level.lektionen) {
            const li = document.createElement('li');

            const lekBtn = document.createElement('button');
            lekBtn.className = 'nav-lektion-btn';
            lekBtn.innerHTML = `<span class="lk-label">${lektion.label}</span><span class="chevron">&#9658;</span>`;
            lekBtn.dataset.levelId = level.id;
            lekBtn.dataset.lektionId = lektion.id;

            const sectionList = document.createElement('ul');
            sectionList.className = 'nav-sections hidden';

            lekBtn.addEventListener('click', () => {
                lekBtn.classList.toggle('open');
                sectionList.classList.toggle('hidden');
            });

            for (const section of lektion.sections) {
                const sli = document.createElement('li');
                const link = document.createElement('a');
                link.className = 'nav-section-link';
                link.href = `#${level.id}/${lektion.id}/${section.id}`;
                link.textContent = section.label;
                sli.appendChild(link);
                sectionList.appendChild(sli);
            }

            li.appendChild(lekBtn);
            li.appendChild(sectionList);
            lekList.appendChild(li);
        }

        tree.appendChild(levelBtn);
        tree.appendChild(lekList);
    }
}

// ── Routing ────────────────────────────────────────────

let currentRoute = null;

function handleRoute() {
    const hash = location.hash.slice(1);

    if (!hash) {
        currentRoute = null;
        loadFile('content/welcome.md');
        setBreadcrumb([]);
        setActiveLink('');
        toggleExportButton(null);
        return;
    }

    const parts = hash.split('/').filter(Boolean);

    if (parts.length === 3) {
        const [levelId, lektionId, sectionId] = parts;
        currentRoute = { levelId, lektionId, sectionId };
        loadFile(`content/${levelId}/${lektionId}/${sectionId}.md`);
        setBreadcrumb([levelId, lektionId, sectionId]);
        setActiveLink(hash);
        toggleExportButton(currentRoute);
    }
}

// ── Content loading ────────────────────────────────────

async function loadFile(path) {
    const el = document.getElementById('content-area');
    el.innerHTML = '<div class="state-loading"><p>Laden...</p></div>';
    window.scrollTo(0, 0);

    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        el.innerHTML = marked.parse(text);
    } catch {
        el.innerHTML = `
            <div class="state-empty">
                <h2>Inhalt noch nicht vorhanden</h2>
                <p>Dieser Abschnitt wird ausgefüllt, wenn du Fotos aus deinem Lehrbuch hochlädst.</p>
            </div>`;
    }
}

// ── Vocabulary JSON export ─────────────────────────────

function toggleExportButton(route) {
    const btn = document.getElementById('export-btn');
    if (!btn) return;
    btn.hidden = !(route && route.sectionId === 'vocabulary');
}

function exportVocabularyJSON() {
    if (!currentRoute) return;

    const table = document.querySelector('#content-area table');
    if (!table) {
        alert('Keine Wortliste zum Exportieren gefunden.');
        return;
    }

    // Header cells become the keys for each row object.
    const headers = [...table.querySelectorAll('thead th')]
        .map(th => th.textContent.trim());

    const words = [...table.querySelectorAll('tbody tr')]
        .map(tr => {
            const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
            const row = {};
            headers.forEach((h, i) => { row[normalizeKey(h)] = cells[i] ?? ''; });
            return row;
        })
        // Skip placeholder/empty rows.
        .filter(row => Object.values(row).some(v => v !== ''));

    const { levelId, lektionId, sectionId } = currentRoute;
    const level = navData?.levels.find(l => l.id === levelId);
    const lektion = level?.lektionen.find(l => l.id === lektionId);
    const section = lektion?.sections.find(s => s.id === sectionId);

    const payload = {
        level: level?.label ?? levelId,
        lektion: lektion?.label ?? lektionId,
        section: section?.label ?? sectionId,
        exportedAt: new Date().toISOString(),
        count: words.length,
        words
    };

    downloadJSON(payload, `wortschatz-${levelId}-${lektionId}.json`);
}

function normalizeKey(header) {
    return header
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'spalte';
}

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ── Breadcrumb ────────────────────────────────────────

function setBreadcrumb(parts) {
    const el = document.getElementById('breadcrumb');

    if (!parts.length) {
        el.textContent = 'Startseite';
        return;
    }

    if (!navData) { el.textContent = ''; return; }

    const [levelId, lektionId, sectionId] = parts;
    const level = navData.levels.find(l => l.id === levelId);
    const lektion = level?.lektionen.find(l => l.id === lektionId);
    const section = lektion?.sections.find(s => s.id === sectionId);

    const crumbs = [level?.label, lektion?.label, section?.label].filter(Boolean);

    el.innerHTML = crumbs.map((c, i) =>
        i === crumbs.length - 1
            ? `<span class="crumb-active">${c}</span>`
            : c
    ).join(' &rsaquo; ');
}

// ── Active link + auto-expand ─────────────────────────

function setActiveLink(hash) {
    document.querySelectorAll('.nav-section-link').forEach(link => {
        const active = link.getAttribute('href') === `#${hash}`;
        link.classList.toggle('active', active);

        if (active) {
            const sectionList = link.closest('.nav-sections');
            const lekBtn = sectionList?.previousElementSibling;
            if (sectionList && lekBtn) {
                sectionList.classList.remove('hidden');
                lekBtn.classList.add('open');
            }
        }
    });
}

// ── Mobile menu ───────────────────────────────────────

function setupMobileMenu() {
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-sidebar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    const open = () => {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
    };

    const close = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
    };

    menuBtn?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', close);

    document.getElementById('nav-tree')?.addEventListener('click', e => {
        if (e.target.classList.contains('nav-section-link') && window.innerWidth <= 768) {
            close();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
