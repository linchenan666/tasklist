// ===== 本地持久化(支持可选加密) =====
window.Storage = (function () {
  const KEY = "tasklist_state_v1";
  const VAULT_KEY = "tasklist_vault";
  const VERSION = 1;

  let currentPassword = null; // 加密模式下的会话密码
  let encryptTimer = null;

  function defaultState() {
    return {
      version: VERSION,
      lists: [],
      tasks: [],
      smartLists: [],
      templates: [],
      settings: {
        theme: "light", defaultListId: null, lang: "zh",
        pomodoroWork: 25, pomodoroBreak: 5, longBreak: 15,
        sound: true, hideCompleted: false,
      },
      account: { userId: null, email: null },
      meta: { lastSyncAt: null, dirty: null, purged: [], lastBackupAt: null },
    };
  }

  function migrate(raw) {
    if (!raw || typeof raw !== "object") return null;
    const s = defaultState();
    const merged = {
      version: VERSION,
      lists: Array.isArray(raw.lists) ? raw.lists : [],
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      smartLists: Array.isArray(raw.smartLists) ? raw.smartLists : [],
      templates: Array.isArray(raw.templates) ? raw.templates : [],
      settings: Object.assign({}, s.settings, raw.settings || {}),
      account: Object.assign({}, s.account, raw.account || {}),
      meta: Object.assign({}, s.meta, raw.meta || {}),
    };
    merged.tasks = merged.tasks.map(fillTask);
    merged.lists = merged.lists.map((l) => Object.assign({ parentId: null, order: 0, deletedAt: null }, l));
    return merged;
  }

  function fillTask(t) {
    const base = {
      id: "", listId: null, title: "", description: "", notes: "",
      status: "todo", priority: "none", tags: [], dueDate: null, dueTime: null,
      repeat: null, reminder: null, subtasks: [], starred: false, pinned: false,
      archived: false, mydayDate: null, order: 0,
      pomodoroCount: 0, focusSeconds: 0, completedAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null,
    };
    return Object.assign(base, t);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const migrated = migrate(parsed);
        if (migrated) return migrated;
      }
    } catch (e) { /* 数据损坏时回退默认 */ }
    return defaultState();
  }

  function save(state) {
    const json = JSON.stringify(state);
    if (!currentPassword) {
      try { localStorage.setItem(KEY, json); } catch (e) { console.error("保存失败", e); }
      return;
    }
    // 加密模式:防抖写入加密库(不写明文)
    clearTimeout(encryptTimer);
    encryptTimer = setTimeout(() => {
      encryptState(json, currentPassword).catch((e) => console.error("加密保存失败", e));
    }, 150);
  }

  function clearAll() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(VAULT_KEY);
    currentPassword = null;
    clearTimeout(encryptTimer);
  }

  // ===== 加密(AES-256-GCM + PBKDF2) =====
  function hasVault() { try { return localStorage.getItem(VAULT_KEY) != null; } catch (e) { return false; } }
  function isEncrypted() { return currentPassword != null; }
  function setSessionPassword(pw) { currentPassword = pw; }
  function removeVault() { localStorage.removeItem(VAULT_KEY); }

  function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function unb64(str) { const bin = atob(str); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }

  async function deriveKey(password, salt, usages) {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 60000, hash: "SHA-256" },
      km, { name: "AES-GCM", length: 256 }, false, usages
    );
  }

  async function encryptState(jsonStr, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, ["encrypt"]);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(jsonStr));
    localStorage.setItem(VAULT_KEY, JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }));
  }

  async function decryptVault(password) {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) throw new Error("无加密数据");
    const vault = JSON.parse(raw);
    const key = await deriveKey(password, unb64(vault.salt), ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(vault.iv) }, key, unb64(vault.ct));
    return new TextDecoder().decode(pt);
  }

  async function enableEncryption(jsonStr, password) {
    await encryptState(jsonStr, password);
    localStorage.removeItem(KEY);
    currentPassword = password;
  }

  function disableEncryption(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    localStorage.removeItem(VAULT_KEY);
    currentPassword = null;
  }

  return {
    load, save, clearAll, defaultState, fillTask,
    hasVault, isEncrypted, setSessionPassword, removeVault,
    decryptVault, enableEncryption, disableEncryption,
  };
})();
