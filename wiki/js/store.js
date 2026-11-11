/* Wishur Wiki — слой хранения (localStorage) */
(function () {
  const KEY = 'wishur_wiki_data_v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('WishurWiki: load error', e);
      return null;
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('WishurWiki: save error', e);
      return false;
    }
  }

  function seedIfEmpty() {
    const existing = load();
    if (existing && (existing.directories?.length || existing.articles?.length)) {
      return existing;
    }
    const seed = window.WIKI_SEED || { directories: [], articles: [] };
    const data = JSON.parse(JSON.stringify(seed));
    save(data);
    return data;
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  window.WikiStore = {
    init() { return seedIfEmpty(); },
    getAll() { return load() || { directories: [], articles: [] }; },
    saveAll(data) { return save(data); },
    resetToSeed() {
      localStorage.removeItem(KEY);
      return seedIfEmpty();
    },

    addDirectory(name, parentId) {
      const data = this.getAll();
      const dir = { id: uid('d'), name: name.trim(), parentId: parentId || null };
      data.directories.push(dir);
      save(data);
      return dir;
    },
    updateDirectory(id, patch) {
      const data = this.getAll();
      const d = data.directories.find(x => x.id === id);
      if (!d) return false;
      Object.assign(d, patch);
      save(data);
      return true;
    },
    deleteDirectory(id) {
      const data = this.getAll();
      const toDelete = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const d of data.directories) {
          if (d.parentId && toDelete.has(d.parentId) && !toDelete.has(d.id)) {
            toDelete.add(d.id); changed = true;
          }
        }
      }
      data.directories = data.directories.filter(d => !toDelete.has(d.id));
      data.articles = data.articles.filter(a => !toDelete.has(a.dirId));
      save(data);
      return true;
    },

    addArticle(article) {
      const data = this.getAll();
      const a = {
        id: uid('a'),
        title: (article.title || 'Без названия').trim(),
        dirId: article.dirId || null,
        content: article.content || '',
        updated: Date.now()
      };
      data.articles.push(a);
      save(data);
      return a;
    },
    updateArticle(id, patch) {
      const data = this.getAll();
      const a = data.articles.find(x => x.id === id);
      if (!a) return false;
      Object.assign(a, patch, { updated: Date.now() });
      save(data);
      return true;
    },
    deleteArticle(id) {
      const data = this.getAll();
      data.articles = data.articles.filter(a => a.id !== id);
      save(data);
      return true;
    },
    getArticle(id) {
      return this.getAll().articles.find(a => a.id === id) || null;
    },

    search(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) return [];
      const data = this.getAll();
      const dirMap = new Map(data.directories.map(d => [d.id, d]));
      const pathOf = (dirId) => {
        const parts = [];
        let cur = dirMap.get(dirId);
        while (cur) {
          parts.unshift(cur.name);
          cur = cur.parentId ? dirMap.get(cur.parentId) : null;
        }
        return parts.join(' / ');
      };
      const results = [];
      for (const a of data.articles) {
        if (a.title.toLowerCase().includes(q)) {
          results.push({ article: a, path: pathOf(a.dirId), matchType: 'title' });
        } else if (a.content.toLowerCase().includes(q)) {
          results.push({ article: a, path: pathOf(a.dirId), matchType: 'content' });
        }
      }
      return results.slice(0, 20);
    }
  };
})();