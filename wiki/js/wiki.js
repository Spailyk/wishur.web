/* ============================================================
   Wishur Wiki — публичная часть
   ============================================================ */
(function () {
  const state = {
    data: null,
    activeArticleId: null,
    collapsed: new Set(),
    searchIndex: -1,
  };

  const $ = (id) => document.getElementById(id);

  /* ---------- ICONS (inline SVG) ---------- */
  const ICONS = {
    chevron:
      '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    folder:
      '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    file:
      '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  };

  /* ---------- HELPERS ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function renderMarkdown(md) {
    if (!md) return '';
    if (typeof marked === 'undefined') {
      return '<pre>' + escapeHtml(md) + '</pre>';
    }
    marked.setOptions({ breaks: true, gfm: true });
    const raw = marked.parse(md);
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    }
    return raw;
  }

  /* ---------- THEME ---------- */
  function updateThemeIcon() {
    const isLight = document.documentElement.classList.contains('light');
    document.querySelectorAll('.icon-sun').forEach((i) => {
      i.style.display = isLight ? 'none' : '';
    });
    document.querySelectorAll('.icon-moon').forEach((i) => {
      i.style.display = isLight ? '' : 'none';
    });
  }

  function initTheme() {
    updateThemeIcon();
    const btn = $('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
      localStorage.setItem(
        'theme',
        document.documentElement.classList.contains('light') ? 'light' : 'dark'
      );
      updateThemeIcon();
    });
  }

  /* ---------- TREE ---------- */
  function buildTree(data) {
    const dirs = data.directories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const arts = data.articles.slice();
    const dirMap = new Map(dirs.map((d) => [d.id, d]));
    const rootDirs = dirs.filter((d) => !d.parentId || !dirMap.has(d.parentId));
    const orphanArts = arts.filter((a) => !a.dirId || !dirMap.has(a.dirId));

    function renderDir(dir) {
      const isCollapsed = state.collapsed.has(dir.id);
      const childDirs = dirs.filter((d) => d.parentId === dir.id);
      const dirArts = arts
        .filter((a) => a.dirId === dir.id)
        .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

      const wrapper = document.createElement('div');
      const header = document.createElement('div');
      header.className = 'tree-item' + (isCollapsed ? ' collapsed' : '');
      header.innerHTML =
        ICONS.chevron + ICONS.folder + '<span>' + escapeHtml(dir.name) + '</span>';

      header.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.collapsed.has(dir.id)) state.collapsed.delete(dir.id);
        else state.collapsed.add(dir.id);
        renderTree();
      });
      wrapper.appendChild(header);

      const children = document.createElement('div');
      children.className = 'tree-dir';
      if (isCollapsed) children.style.display = 'none';

      childDirs.forEach((cd) => children.appendChild(renderDir(cd)));
      dirArts.forEach((a) => children.appendChild(renderArticle(a)));

      if (childDirs.length === 0 && dirArts.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText =
          'font-size:10px;color:#A0A0A0;font-style:italic;padding:.25rem .5rem';
        empty.textContent = '(пусто)';
        children.appendChild(empty);
      }
      wrapper.appendChild(children);
      return wrapper;
    }

    function renderArticle(a) {
      const node = document.createElement('div');
      node.className =
        'tree-item' + (state.activeArticleId === a.id ? ' active' : '');
      node.innerHTML = ICONS.file + '<span>' + escapeHtml(a.title) + '</span>';
      node.addEventListener('click', () => openArticle(a.id));
      return node;
    }

    const container = $('treeRoot');
    container.innerHTML = '';
    rootDirs.forEach((d) => container.appendChild(renderDir(d)));

    if (orphanArts.length) {
      const lbl = document.createElement('div');
      lbl.className = 'section-label';
      lbl.style.marginTop = '.75rem';
      lbl.textContent = 'Без категории';
      container.appendChild(lbl);
      orphanArts.forEach((a) => container.appendChild(renderArticle(a)));
    }

    if (rootDirs.length === 0 && orphanArts.length === 0) {
      container.innerHTML =
        '<div style="font-size:12px;color:#A0A0A0;font-style:italic;padding:.5rem">Статьи не найдены.</div>';
    }
  }

  function renderTree() {
    if (!state.data) return;
    buildTree(state.data);
  }

  /* ---------- PATH / BREADCRUMBS ---------- */
  function pathOf(dirId) {
    const map = new Map(state.data.directories.map((d) => [d.id, d]));
    const parts = [];
    let cur = map.get(dirId);
    while (cur) {
      parts.unshift(cur);
      cur = cur.parentId ? map.get(cur.parentId) : null;
    }
    return parts;
  }

  /* ---------- OPEN ARTICLE ---------- */
  function openArticle(id) {
    const a = state.data.articles.find((x) => x.id === id);
    if (!a) return;
    state.activeArticleId = id;
    renderTree();

    const crumbs = pathOf(a.dirId);
    const bc = $('breadcrumbs');
    if (bc) {
      bc.innerHTML =
        '<span class="crumb-muted">Wiki</span>' +
        crumbs
          .map(
            (c) =>
              '<span class="crumb-sep">/</span><span>' +
              escapeHtml(c.name) +
              '</span>'
          )
          .join('') +
        '<span class="crumb-sep">/</span><span class="crumb-current">' +
        escapeHtml(a.title) +
        '</span>';
    }

    const content = $('articleContent');
    if (content) {
      content.innerHTML =
        '<div class="article-body">' + renderMarkdown(a.content) + '</div>';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- SEARCH ---------- */
  function initSearch() {
    const input = $('wikiSearch');
    const results = $('searchResults');
    if (!input || !results) return;
    let timer;

    function renderResults() {
      const q = input.value;
      if (!q.trim()) {
        results.classList.remove('show');
        results.innerHTML = '';
        state.searchIndex = -1;
        return;
      }
      const list = window.WikiStore.search(q);
      if (!list.length) {
        results.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
      } else {
        results.innerHTML = list
          .map(
            (r, i) =>
              '<div class="search-result" data-article="' +
              r.article.id +
              '" data-idx="' +
              i +
              '">' +
              '<div class="sr-title">' +
              escapeHtml(r.article.title) +
              '</div>' +
              '<div class="sr-path">' +
              (r.path ? escapeHtml(r.path) : 'Без категории') +
              (r.matchType === 'content' ? ' · совпадение в тексте' : '') +
              '</div></div>'
          )
          .join('');
      }
      results.classList.add('show');
      state.searchIndex = list.length ? 0 : -1;
      highlight();
      results.querySelectorAll('.search-result').forEach((node) => {
        node.addEventListener('click', () => {
          openArticle(node.dataset.article);
          results.classList.remove('show');
          input.value = '';
        });
      });
    }

    function highlight() {
      results.querySelectorAll('.search-result').forEach((n, i) => {
        n.classList.toggle('sel', i === state.searchIndex);
      });
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(renderResults, 180);
    });

    input.addEventListener('keydown', (e) => {
      const items = results.querySelectorAll('.search-result');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.searchIndex = (state.searchIndex + 1) % items.length;
        highlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.searchIndex =
          (state.searchIndex - 1 + items.length) % items.length;
        highlight();
      } else if (e.key === 'Enter' && state.searchIndex >= 0) {
        e.preventDefault();
        items[state.searchIndex].click();
      } else if (e.key === 'Escape') {
        results.classList.remove('show');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) results.classList.remove('show');
    });
  }

  /* ---------- PRELOADER ---------- */
  function hidePreloader() {
    const p = $('wikiPreloader');
    if (!p) return;
    p.classList.add('hidden');
    setTimeout(() => {
      if (p.parentNode) p.parentNode.removeChild(p);
    }, 600);
  }

  /* ---------- BOOT ---------- */
  function boot() {
    initTheme();

    if (!window.WikiStore) {
      console.error('WishurWiki: WikiStore не загружен');
      hidePreloader();
      return;
    }

    state.data = window.WikiStore.init();
    renderTree();
    initSearch();

    const first = state.data.articles[0];
    if (first) openArticle(first.id);
    else {
      const bc = $('breadcrumbs');
      if (bc) bc.innerHTML = '';
    }

    // Скрываем прелоадер после первого рендера
    setTimeout(hidePreloader, 300);

    // Синхронизация между вкладками
    window.addEventListener('storage', (e) => {
      if (e.key === 'wishur_wiki_data_v1') {
        state.data = window.WikiStore.getAll();
        renderTree();
        if (
          state.activeArticleId &&
          state.data.articles.find((a) => a.id === state.activeArticleId)
        ) {
          openArticle(state.activeArticleId);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();