/* Wishur Admin — слой авторизации (клиентский, для статики) */
(function () {
  // === SHA-256 хеш пароля "TheBestOfAll" ===
  // НЕ храните реальный пароль в коде. Хеш вычисляется один раз.
  // Вычислить: crypto.subtle.digest('SHA-256', new TextEncoder().encode('ПАРОЛЬ'))
  // и превратить в hex. Ниже — заранее вычисленный хеш.
  const ACCOUNTS = [
    {
      name: 'Spailyk',
      // SHA-256("TheBestOfAll")
      passHash: 'c99d8e777cf4d91c2988493454be7203f3b4f524b41d7964e1510fbff8ccc749'
    }
  ];

  const SESSION_KEY = 'wishur_admin_session_v1';
  const LOCK_KEY = 'wishur_admin_lock_v1';
  const MAX_ATTEMPTS = 10000;
  const LOCK_MS = 5 * 60 * 1000; // 5 минут
  const SESSION_MS = 30 * 60 * 1000; // 30 минут

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function now() { return Date.now(); }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.expires || s.expires < now()) { sessionStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch { return null; }
  }

  function setSession(name) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      name,
      expires: now() + SESSION_MS,
      created: now()
    }));
  }

  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  function getLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      const l = JSON.parse(raw);
      if (!l || !l.until || l.until < now()) { localStorage.removeItem(LOCK_KEY); return null; }
      return l;
    } catch { return null; }
  }

  function setLock(attempts) {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ attempts, until: now() + LOCK_MS }));
  }

  function clearLock() { localStorage.removeItem(LOCK_KEY); }

  window.WikiAuth = {
    ACCOUNTS,

    isAuthed() { return !!getSession(); },
    currentUser() { const s = getSession(); return s ? s.name : null; },

    async login(username, password) {
      const lock = getLock();
      if (lock) {
        const left = Math.ceil((lock.until - now()) / 1000);
        return { ok: false, error: `Слишком много попыток. Повторите через ${left} сек.` };
      }

      const account = ACCOUNTS.find(a => a.name.toLowerCase() === String(username).trim().toLowerCase());
      // Защита от timing-атак: всегда вычисляем хеш, даже если аккаунт не найден
      const hash = await sha256Hex(String(password));
      const passOk = account && account.passHash === hash;

      if (!account || !passOk) {
        // Счётчик неудач
        const attempts = (lock?.attempts || 0) + 1;
        const raw = localStorage.getItem(LOCK_KEY);
        let curAttempts = 1;
        if (raw) {
          try { curAttempts = (JSON.parse(raw).attempts || 0) + 1; } catch {}
        }
        if (curAttempts >= MAX_ATTEMPTS) {
          setLock(curAttempts);
          return { ok: false, error: `Превышено число попыток. Вход заблокирован на ${LOCK_MS / 60000} мин.` };
        } else {
          setLock(curAttempts);
          return { ok: false, error: `Неверный логин или пароль. Осталось попыток: ${MAX_ATTEMPTS - curAttempts}` };
        }
      }

      // Успех
      clearLock();
      setSession(account.name);
      return { ok: true };
    },

    logout() { clearSession(); },

    // Продлить сессию при активности
    touch() {
      const s = getSession();
      if (s) setSession(s.name);
    }
  };
})();