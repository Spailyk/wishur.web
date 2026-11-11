/* ============================================================
   Wishur Admin — панель управления Wiki
   ============================================================ */
(function () {
  let data = null;
  let editingDirId = null;
  let confirmCallback = null;
  let sessionTimer = null;

  const $ = (id) => document.getElementById(id);

  /* ---------- ICONS (inline SVG) ---------- */
  const ICONS = {
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    edit:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
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

  function toast(msg) {
    const t = $('toast');
    const txt = $('toastText');
    if (!t || !txt) return;
    txt.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function confirmAction(text, cb) {
    const ct = $('confirmText');
    if (ct) ct.textContent = text;
    confirmCallback = cb;
    const m = $('confirmModal');
    if (m) m.classList.add('show');
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

  /* ---------- LOGIN ---------- */
  function initLogin() {
    const form = $('loginForm');
    const btn = $('loginBtn');
    const err = $('loginError');
    const toggle = $('togglePass');
    const passInput = $('loginPass');
    const userInput = $('loginUser');
    if (!form) return;

    if (toggle) {
      toggle.addEventListener('click', () => {
        passInput.type = passInput.type === 'password' ? 'text' : 'password';
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!window.WikiAuth) {
        err.textContent = 'Модуль авторизации не загружен';
        return;
      }
      err.textContent = '';
      btn.disabled = true;
      btn.classList.add('loading');

      const result = await window.WikiAuth.login(
        userInput.value,
        passInput.value
      );

      btn.disabled = false;
      btn.classList.remove('loading');

      if (result.ok) {
        passInput.value = '';
        showAdmin();
      } else {
        err.textContent = result.error || 'Ошибка входа';
        passInput.value = '';
        passInput.focus();
      }
    });
  }

  function initLogout() {
    const btn = $('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (window.WikiAuth) window.WikiAuth.logout();
      location.reload();
    });
  }

  function showAdmin() {
    const login = $('loginScreen');
    const app = $('adminApp');
    if (login) login.style.display = 'none';
    if (app) app.style.display = 'flex';

    const user = window.WikiAuth ? window.WikiAuth.currentUser() : null;
    if ($('currentUser')) $('currentUser').textContent = user || '—';

    data = window.WikiStore.init();
    renderAll();

    // Автопродление сессии при активности
    if (window.WikiAuth) {
      document.addEventListener('mousemove', window.WikiAuth.touch, {
        passive: true,
      });
      document.addEventListener('keydown', window.WikiAuth.touch, {
        passive: true,
      });
    }
    startSessionWatch();
  }

  function startSessionWatch() {
    if (sessionTimer) clearInterval(sessionTimer);
    sessionTimer = setInterval(() => {
      if (!window.WikiAuth || !window.WikiAuth.isAuthed()) {
        clearInterval(sessionTimer);
        location.reload();
      }
    }, 15000);
  }

  /* ---------- PATH HELPERS ---------- */
  function pathOf(dirId) {
    const map = new Map(data.directories.map((d) => [d.id, d]));
    const parts = [];
    let cur = map.get(dirId);
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentId ? map.get(cur.parentId) : null;
    }
    return parts.join(' / ') || '—';
  }

  /* ---------- RENDER ---------- */
  function renderAll() {
    data = window.WikiStore.getAll();
    renderDirs();
    renderArts();
    fillSelects();
  }

  function renderDirs() {
    const list = $('dirList');
    if (!list) return;
    const dirs = data.directories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    if (!dirs.length) {
      list.innerHTML =
        '<p style="font-size:12px;color:#A0A0A0;font-style:italic;padding:.75rem 0">Нет директорий</p>';
      return;
    }

    list.innerHTML = dirs
      .map(
        (d) => `
      <div class="admin-list-item" data-id="${d.id}">
        <span class="item-icon">${ICONS.folder}</span>
        <div class="item-body">
          <div class="item-title">${escapeHtml(d.name)}</div>
          <div class="item-meta">${escapeHtml(
            pathOf(d.parentId) === '—' ? 'Корень' : pathOf(d.parentId)
          )}</div>
        </div>
        <button class="btn-icon" data-action="edit-dir" data-id="${
          d.id
        }" title="Переименовать">${ICONS.edit}</button>
        <button class="btn-icon danger" data-action="delete-dir" data-id="${
          d.id
        }" title="Удалить">${ICONS.trash}</button>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-action="edit-dir"]').forEach((b) =>
      b.addEventListener('click', () => openDirModal(b.dataset.id))
    );

    list.querySelectorAll('[data-action="delete-dir"]').forEach((b) =>
      b.addEventListener('click', () => {
        const d = data.directories.find((x) => x.id === b.dataset.id);
        if (!d) return;
        const artsInside = data.articles.filter((a) => a.dirId === d.id).length;
        const hasSub = data.directories.some((x) => x.parentId === d.id);
        let msg = `Удалить директорию «${d.name}»?`;
        if (hasSub) msg += ' Вложенные директории тоже будут удалены.';
        if (artsInside) msg += ` Статей внутри: ${artsInside}.`;
        confirmAction(msg, () => {
          window.WikiStore.deleteDirectory(d.id);
          toast('Директория удалена');
          renderAll();
          resetEditorIfGone();
        });
      })
    );
  }

  function renderArts() {
    const list = $('artList');
    if (!list) return;
    const arts = data.articles.slice().sort((a, b) => b.updated - a.updated);

    if (!arts.length) {
      list.innerHTML =
        '<p style="font-size:12px;color:#A0A0A0;font-style:italic;padding:.75rem 0">Нет статей</p>';
      return;
    }

    list.innerHTML = arts
      .map(
        (a) => `
      <div class="admin-list-item" data-id="${a.id}">
        <span class="item-icon">${ICONS.file}</span>
        <div class="item-body">
          <div class="item-title">${escapeHtml(a.title)}</div>
          <div class="item-meta">${escapeHtml(pathOf(a.dirId))}</div>
        </div>
        <button class="btn-icon" data-action="edit-art" data-id="${
          a.id
        }" title="Редактировать">${ICONS.edit}</button>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-action="edit-art"]').forEach((b) =>
      b.addEventListener('click', () => loadArticleToEditor(b.dataset.id))
    );
  }

  function fillSelects() {
    const dirs = data.directories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

    const artDir = $('artDir');
    if (artDir) {
      const curVal = artDir.value;
      artDir.innerHTML =
        '<option value="">— Без категории —</option>' +
        dirs
          .map(
            (d) =>
              `<option value="${d.id}">${escapeHtml(pathOf(d.id))}</option>`
          )
          .join('');
      if (curVal) artDir.value = curVal;
    }

    const dirParent = $('dirParentInput');
    if (dirParent) {
      const curP = dirParent.value;
      dirParent.innerHTML =
        '<option value="">— Корень —</option>' +
        dirs
          .filter((d) => d.id !== editingDirId)
          .map(
            (d) =>
              `<option value="${d.id}">${escapeHtml(pathOf(d.id))}</option>`
          )
          .join('');
      if (curP) dirParent.value = curP;
    }
  }

  /* ---------- EDITOR ---------- */
  function showEditor(article) {
    const empty = $('editorEmpty');
    const form = $('editorForm');
    if (empty) empty.classList.add('hidden');
    if (form) form.classList.remove('hidden');

    $('artId').value = article ? article.id : '';
    $('artTitle').value = article ? article.title : '';
    $('artDir').value = article ? article.dirId || '' : '';
    $('artContent').value = article ? article.content : '';
    $('editorTitle').textContent = article
      ? 'Редактирование статьи'
      : 'Новая статья';
    $('deleteArtBtn').classList.toggle('hidden', !article);

    fillSelects();
    if (article) $('artDir').value = article.dirId || '';
  }

  function hideEditor() {
    const empty = $('editorEmpty');
    const form = $('editorForm');
    if (form) form.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    $('artId').value = '';
  }

  function loadArticleToEditor(id) {
    const a = window.WikiStore.getArticle(id);
    if (a) showEditor(a);
  }

  function resetEditorIfGone() {
    const id = $('artId').value;
    if (id && !window.WikiStore.getArticle(id)) hideEditor();
  }

  /* ---------- DIR MODAL ---------- */
  function openDirModal(id) {
    editingDirId = id || null;
    fillSelects();
    const isEdit = !!id;
    $('modalDirTitle').textContent = isEdit
      ? 'Редактирование директории'
      : 'Новая директория';

    if (isEdit) {
      const d = data.directories.find((x) => x.id === id);
      if (!d) return;
      $('dirNameInput').value = d.name;
      $('dirParentInput').value = d.parentId || '';
    } else {
      $('dirNameInput').value = '';
      $('dirParentInput').value = '';
    }

    $('modalDir').classList.add('show');
    setTimeout(() => $('dirNameInput').focus(), 100);
  }

  function closeDirModal() {
    const m = $('modalDir');
    if (m) m.classList.remove('show');
    editingDirId = null;
  }

  function saveDir() {
    const name = $('dirNameInput').value.trim();
    if (!name) {
      toast('Введите название');
      return;
    }
    const parentId = $('dirParentInput').value || null;

    // Проверка цикла при редактировании
    if (editingDirId && parentId) {
      let cur = parentId;
      const map = new Map(data.directories.map((d) => [d.id, d]));
      while (cur) {
        if (cur === editingDirId) {
          toast('Нельзя сделать директорию вложенной в саму себя');
          return;
        }
        const dd = map.get(cur);
        cur = dd && dd.parentId ? dd.parentId : null;
      }
    }

    if (editingDirId) {
      window.WikiStore.updateDirectory(editingDirId, { name, parentId });
      toast('Директория обновлена');
    } else {
      window.WikiStore.addDirectory(name, parentId);
      toast('Директория создана');
    }
    closeDirModal();
    renderAll();
  }

  /* ---------- BOOT ---------- */
  function boot() {
    initTheme();
    initLogin();
    initLogout();

    // Если уже авторизован — сразу в админку
    if (window.WikiAuth && window.WikiAuth.isAuthed()) {
      showAdmin();
    }

    // ==== Директории ====
    const addDirBtn = $('addDirBtn');
    if (addDirBtn) addDirBtn.addEventListener('click', () => openDirModal(null));

    const dirSaveBtn = $('dirSaveBtn');
    if (dirSaveBtn) dirSaveBtn.addEventListener('click', saveDir);

    const dirCancelBtn = $('dirCancelBtn');
    if (dirCancelBtn) dirCancelBtn.addEventListener('click', closeDirModal);

    const dirNameInput = $('dirNameInput');
    if (dirNameInput) {
      dirNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveDir();
        }
      });
    }

    // ==== Статьи ====
    const addArtBtn = $('addArtBtn');
    if (addArtBtn) {
      addArtBtn.addEventListener('click', () => {
        showEditor(null);
        $('artTitle').focus();
      });
    }

    const cancelEdit = $('cancelEdit');
    if (cancelEdit) cancelEdit.addEventListener('click', hideEditor);

    const editorForm = $('editorForm');
    if (editorForm) {
      editorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = $('artId').value;
        const title = $('artTitle').value.trim();
        const dirId = $('artDir').value || null;
        const content = $('artContent').value;

        if (!title) {
          toast('Введите название');
          return;
        }

        if (id) {
          window.WikiStore.updateArticle(id, { title, dirId, content });
          toast('Статья сохранена');
        } else {
          const a = window.WikiStore.addArticle({ title, dirId, content });
          $('artId').value = a.id;
          $('editorTitle').textContent = 'Редактирование статьи';
          $('deleteArtBtn').classList.remove('hidden');
          toast('Статья создана');
        }
        renderAll();
      });
    }

    const deleteArtBtn = $('deleteArtBtn');
    if (deleteArtBtn) {
      deleteArtBtn.addEventListener('click', () => {
        const id = $('artId').value;
        if (!id) return;
        const a = window.WikiStore.getArticle(id);
        if (!a) return;
        confirmAction(`Удалить статью «${a.title}»?`, () => {
          window.WikiStore.deleteArticle(id);
          toast('Статья удалена');
          hideEditor();
          renderAll();
        });
      });
    }

    // ==== Confirm modal ====
    const confirmYes = $('confirmYes');
    if (confirmYes) {
      confirmYes.addEventListener('click', () => {
        $('confirmModal').classList.remove('show');
        if (confirmCallback) confirmCallback();
        confirmCallback = null;
      });
    }
    const confirmNo = $('confirmNo');
    if (confirmNo) {
      confirmNo.addEventListener('click', () => {
        $('confirmModal').classList.remove('show');
        confirmCallback = null;
      });
    }

    // ==== Reset ====
    const resetBtn = $('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        confirmAction(
          'Сбросить ВСЕ данные к начальным? Изменения будут потеряны.',
          () => {
            data = window.WikiStore.resetToSeed();
            toast('Данные сброшены');
            hideEditor();
            renderAll();
          }
        );
      });
    }

    // ==== Click outside modal ====
    const modalDir = $('modalDir');
    if (modalDir) {
      modalDir.addEventListener('click', (e) => {
        if (e.target === modalDir) closeDirModal();
      });
    }
    const confirmModal = $('confirmModal');
    if (confirmModal) {
      confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
          confirmModal.classList.remove('show');
          confirmCallback = null;
        }
      });
    }

    // ==== Синхронизация между вкладками ====
    window.addEventListener('storage', (e) => {
      if (e.key === 'wishur_wiki_data_v1') renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();