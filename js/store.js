// ===== 核心状态管理 =====
window.Store = (function () {
  const U = window.U;
  let state = null;
  let renderFn = null;

  // 视图
  let view = { layout: "list", scope: { kind: "all" } };
  let navBack = [];
  let navFwd = [];

  // 筛选 & 搜索
  let filters = { status: "", priority: "", tag: "", date: "", sort: "order", hideDone: false };
  let search = "";

  // 撤销 / 重做(内存快照)
  let undoStack = [];
  let redoStack = [];
  const MAX_UNDO = 100;

  // ===== 基础 =====
  function init(loadedState) {
    state = loadedState || Storage.load();
    if (!state.settings.theme) state.settings.theme = "light";
  }
  function getState() { return state; }
  function onRender(fn) { renderFn = fn; }
  function render() { if (renderFn) renderFn(); }

  function snapshot() { return JSON.stringify(state); }
  function restoreSnapshot(json) {
    const parsed = JSON.parse(json);
    // 补齐字段
    parsed.tasks = parsed.tasks.map(Storage.fillTask);
    parsed.lists = parsed.lists.map((l) => Object.assign({ parentId: null, order: 0, deletedAt: null }, l));
    state = parsed;
  }
  function touchAll() {
    const t = U.now();
    state.tasks.forEach((x) => { if (!x.deletedAt) x.updatedAt = t; });
    state.lists.forEach((x) => { if (!x.deletedAt) x.updatedAt = t; });
  }

  // commit:用户操作(记撤销 + 保存 + 标记脏 + 渲染)
  function commit(fn) {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
    fn();
    state.meta.dirty = U.now();
    Storage.save(state);
    render();
  }

  // applyRemote:同步拉取应用(不记撤销、不标脏)
  function applyRemote(fn) {
    fn();
    Storage.save(state);
    render();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    const prev = undoStack.pop();
    restoreSnapshot(prev);
    touchAll();
    state.meta.dirty = U.now();
    Storage.save(state);
    render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    const next = redoStack.pop();
    restoreSnapshot(next);
    touchAll();
    state.meta.dirty = U.now();
    Storage.save(state);
    render();
  }
  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  // ===== 视图导航 =====
  function getView() { return view; }
  function setView(layout, scope) {
    const nl = layout || view.layout;
    const ns = scope || view.scope;
    if (nl === view.layout && JSON.stringify(ns) === JSON.stringify(view.scope)) {
      view.layout = nl; view.scope = ns;
      render();
      return;
    }
    navBack.push({ layout: view.layout, scope: view.scope });
    if (navBack.length > 50) navBack.shift();
    navFwd = [];
    view.layout = nl; view.scope = ns;
    render();
  }
  function setLayout(layout) { view.layout = layout; render(); }
  function back() {
    if (!navBack.length) return;
    navFwd.push({ layout: view.layout, scope: view.scope });
    const prev = navBack.pop();
    view.layout = prev.layout;
    view.scope = prev.scope;
    render();
  }
  function forward() {
    if (!navFwd.length) return;
    navBack.push({ layout: view.layout, scope: view.scope });
    const next = navFwd.pop();
    view.layout = next.layout;
    view.scope = next.scope;
    render();
  }
  function canBack() { return navBack.length > 0; }
  function canFwd() { return navFwd.length > 0; }

  // ===== 筛选 / 搜索 =====
  function getFilters() { return filters; }
  function setFilter(k, v) { filters[k] = v; render(); }
  function resetFilters() {
    filters = { status: "", priority: "", tag: "", date: "", sort: "order", hideDone: false };
    render();
  }
  function getSearch() { return search; }
  function setSearch(q) { search = q; render(); }

  // ===== 任务操作 =====
  function newTaskOrder(listId) {
    let max = 0;
    state.tasks.forEach((t) => { if (t.listId === listId && !t.deletedAt && t.order > max) max = t.order; });
    return max + 1;
  }

  function addTask(fields) {
    let t = null;
    commit(() => {
      const now = U.now();
      t = Storage.fillTask(Object.assign({
        id: U.uid(), createdAt: now, updatedAt: now,
      }, fields));
      if (t.order == null) t.order = newTaskOrder(t.listId);
      state.tasks.push(t);
    });
    return t;
  }

  function updateTask(id, fields) {
    commit(() => {
      const t = state.tasks.find((x) => x.id === id);
      if (!t) return;
      Object.assign(t, fields, { updatedAt: U.now() });
    });
  }

  function getTask(id) { return state.tasks.find((x) => x.id === id); }

  function setStatus(id, status) {
    commit(() => {
      const t = state.tasks.find((x) => x.id === id);
      if (!t) return;
      const wasDone = t.status === "done";
      t.status = status;
      t.updatedAt = U.now();
      if (status === "done") {
        if (!t.completedAt) t.completedAt = U.now();
        // 重复任务:生成下一次
        if (!wasDone && t.repeat && t.repeat.type) {
          const nextDue = U.nextRepeatDate(t.repeat, t.dueDate || U.todayISO());
          const clone = Storage.fillTask({
            id: U.uid(),
            listId: t.listId, title: t.title, description: t.description, notes: t.notes,
            status: "todo", priority: t.priority, tags: t.tags.slice(),
            dueDate: nextDue, dueTime: t.dueTime, repeat: t.repeat, reminder: t.reminder,
            subtasks: t.subtasks.map((s) => ({ id: U.uid(), title: s.title, done: false })),
            starred: t.starred, pinned: false, archived: false, mydayDate: null,
            order: newTaskOrder(t.listId), pomodoroCount: 0, focusSeconds: 0,
            completedAt: null, createdAt: U.now(), updatedAt: U.now(), deletedAt: null,
          });
          state.tasks.push(clone);
        }
      } else {
        t.completedAt = null;
      }
    });
  }

  function toggleTask(id) {
    const t = getTask(id);
    if (!t) return;
    setStatus(id, t.status === "done" ? "todo" : "done");
  }

  function deleteTask(id) { // 软删除 -> 回收站
    commit(() => {
      const t = state.tasks.find((x) => x.id === id);
      if (t) { t.deletedAt = U.now(); t.updatedAt = U.now(); }
    });
  }
  function restoreTask(id) {
    commit(() => {
      const t = state.tasks.find((x) => x.id === id);
      if (t) { t.deletedAt = null; t.updatedAt = U.now(); }
    });
  }
  function purgeTask(id) {
    commit(() => {
      state.tasks = state.tasks.filter((x) => x.id !== id);
      state.meta.purged = state.meta.purged || [];
      state.meta.purged.push(id);
    });
  }
  function archiveTask(id) {
    commit(() => { const t = state.tasks.find((x) => x.id === id); if (t) { t.archived = true; t.updatedAt = U.now(); } });
  }
  function unarchiveTask(id) {
    commit(() => { const t = state.tasks.find((x) => x.id === id); if (t) { t.archived = false; t.updatedAt = U.now(); } });
  }
  function addToMyDay(id) {
    commit(() => { const t = state.tasks.find((x) => x.id === id); if (t) { t.mydayDate = U.todayISO(); t.updatedAt = U.now(); } });
  }
  function removeFromMyDay(id) {
    commit(() => { const t = state.tasks.find((x) => x.id === id); if (t) { t.mydayDate = null; t.updatedAt = U.now(); } });
  }
  function toggleStar(id) {
    commit(() => { const t = state.tasks.find((x) => x.id === id); if (t) { t.starred = !t.starred; t.updatedAt = U.now(); } });
  }
  function togglePin(id) {
    commit(() => { const t = state.tasks.find((x) => x.id === id); if (t) { t.pinned = !t.pinned; t.updatedAt = U.now(); } });
  }

  // ===== 批量操作 =====
  function batchSetStatus(ids, status) {
    commit(() => {
      const set = new Set(ids);
      state.tasks.forEach((t) => {
        if (set.has(t.id) && t.status !== status) {
          t.status = status; t.updatedAt = U.now();
          if (status === "done") { if (!t.completedAt) t.completedAt = U.now(); }
          else t.completedAt = null;
        }
      });
    });
  }
  function batchDelete(ids) {
    commit(() => {
      const set = new Set(ids);
      state.tasks.forEach((t) => { if (set.has(t.id)) { t.deletedAt = U.now(); t.updatedAt = U.now(); } });
    });
  }
  function batchMove(ids, listId) {
    commit(() => {
      const set = new Set(ids);
      state.tasks.forEach((t) => { if (set.has(t.id)) { t.listId = listId; t.updatedAt = U.now(); } });
    });
  }
  function batchSetPriority(ids, priority) {
    commit(() => {
      const set = new Set(ids);
      state.tasks.forEach((t) => { if (set.has(t.id)) { t.priority = priority; t.updatedAt = U.now(); } });
    });
  }
  function moveTaskToList(id, listId) {
    commit(() => {
      const t = state.tasks.find((x) => x.id === id);
      if (t) { t.listId = listId; t.order = newTaskOrder(listId); t.updatedAt = U.now(); }
    });
  }

  // 拖拽排序:把 taskId 移动到 beforeId 之前(同清单),beforeId 为空则移到末尾
  function reorderTask(taskId, beforeId, listId) {
    commit(() => {
      const t = state.tasks.find((x) => x.id === taskId);
      if (!t) return;
      if (listId != null) t.listId = listId;
      const col = state.tasks.filter((x) => x.listId === t.listId && !x.deletedAt && x.id !== taskId);
      col.sort((a, b) => a.order - b.order);
      let idx = col.findIndex((x) => x.id === beforeId);
      if (idx === -1) idx = col.length;
      col.splice(idx, 0, t);
      col.forEach((x, i) => { x.order = i + 1; x.updatedAt = U.now(); });
    });
  }

  // ===== 清单操作 =====
  function getList(id) { return state.lists.find((x) => x.id === id); }
  function getListName(id) {
    if (!id) return "收件箱";
    const l = getList(id);
    return l ? l.name : "收件箱";
  }

  function addList(fields) {
    let l = null;
    commit(() => {
      const now = U.now();
      l = Object.assign({ id: U.uid(), name: "", color: U.LIST_COLORS[0], parentId: null, order: 0, createdAt: now, updatedAt: now, deletedAt: null }, fields);
      state.lists.push(l);
    });
    return l;
  }
  function updateList(id, fields) {
    commit(() => {
      const l = state.lists.find((x) => x.id === id);
      if (l) Object.assign(l, fields, { updatedAt: U.now() });
    });
  }
  function deleteList(id) {
    commit(() => {
      const l = state.lists.find((x) => x.id === id);
      if (l) { l.deletedAt = U.now(); l.updatedAt = U.now(); }
      // 该清单下的任务移到收件箱
      state.tasks.forEach((t) => { if (t.listId === id) { t.listId = null; t.updatedAt = U.now(); } });
    });
  }
  function restoreList(id) {
    commit(() => {
      const l = state.lists.find((x) => x.id === id);
      if (l) { l.deletedAt = null; l.updatedAt = U.now(); }
    });
  }
  function purgeList(id) {
    commit(() => {
      state.lists = state.lists.filter((x) => x.id !== id);
      state.meta.purged = state.meta.purged || [];
      state.meta.purged.push(id);
    });
  }

  // ===== 智能清单 =====
  function addSmartList(fields) {
    commit(() => { state.smartLists.push(Object.assign({ id: U.uid(), name: "", conditions: {} }, fields)); });
  }
  function updateSmartList(id, fields) {
    commit(() => {
      const sl = state.smartLists.find((x) => x.id === id);
      if (sl) Object.assign(sl, fields);
    });
  }
  function deleteSmartList(id) {
    commit(() => { state.smartLists = state.smartLists.filter((x) => x.id !== id); });
  }

  // ===== 模板 =====
  function addTemplate(fields) {
    commit(() => { state.templates.push(Object.assign({ id: U.uid(), name: "", task: {} }, fields)); });
  }
  function deleteTemplate(id) {
    commit(() => { state.templates = state.templates.filter((x) => x.id !== id); });
  }

  // ===== 设置 / 账号 =====
  function setSettings(patch) {
    commit(() => { Object.assign(state.settings, patch); });
  }
  function setAccount(patch) {
    commit(() => { Object.assign(state.account, patch); });
  }

  // ===== 数据导入 / 导出 =====
  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importState(newState) {
    commit(() => {
      const now = U.now();
      const src = (typeof newState === "string") ? JSON.parse(newState) : newState;
      const merged = Storage.load();
      // 简单策略:合并任务/清单(按 id 去重,后者覆盖)
      const map = {};
      merged.lists.concat(src.lists || []).forEach((l) => { map[l.id] = Object.assign({}, map[l.id], l); });
      merged.lists = Object.values(map);
      const tmap = {};
      merged.tasks.concat(src.tasks || []).forEach((t) => { tmap[t.id] = Storage.fillTask(Object.assign({}, tmap[t.id], t)); });
      merged.tasks = Object.values(tmap);
      if (src.smartLists) merged.smartLists = src.smartLists;
      if (src.templates) merged.templates = src.templates;
      if (src.settings) Object.assign(merged.settings, src.settings);
      state = merged;
      state.meta = { lastSyncAt: null, dirty: now, purged: merged.meta.purged || [] };
    });
  }
  function clearAllData() {
    commit(() => {
      const ids = state.tasks.map((t) => t.id).concat(state.lists.map((l) => l.id));
      state = Storage.defaultState();
      state.meta.purged = ids; // 同步时删除云端对应数据
      state.meta.dirty = U.now();
    });
  }

  // ===== 视图过滤(核心) =====
  function matchesScope(t) {
    const sc = view.scope;
    const today = U.todayISO();
    if (t.deletedAt) return sc.kind === "trash";
    switch (sc.kind) {
      case "trash": return false; // 上面已处理 deleted
      case "archive": return t.archived;
      case "logbook": return t.status === "done";
      case "completed": return t.status === "done" && !t.archived;
      case "myday": return t.mydayDate === today && !t.archived;
      case "today": return t.dueDate === today && !t.archived;
      case "upcoming":
        if (t.archived || t.status === "done") return false;
        return t.dueDate && U.dayDiff(today, t.dueDate) >= 0 && U.dayDiff(today, t.dueDate) <= 7;
      case "overdue": return !t.archived && U.taskOverdue(t);
      case "inbox": return !t.archived && !t.listId;
      case "all": return !t.archived;
      case "list": return !t.archived && t.listId === sc.value;
      case "filter": {
        const sl = state.smartLists.find((x) => x.id === sc.value);
        return !t.archived && U.matchesSmartList(t, sl ? sl.conditions : {});
      }
      default: return !t.archived;
    }
  }

  function visibleTasks() {
    let arr = state.tasks.filter(matchesScope);
    // 筛选栏
    if (filters.status) arr = arr.filter((t) => t.status === filters.status);
    if (filters.priority) arr = arr.filter((t) => t.priority === filters.priority);
    if (filters.tag) arr = arr.filter((t) => (t.tags || []).includes(filters.tag));
    if (filters.date === "has") arr = arr.filter((t) => !!t.dueDate);
    if (filters.date === "none") arr = arr.filter((t) => !t.dueDate);
    if (filters.hideDone) arr = arr.filter((t) => t.status !== "done");
    // 搜索
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((t) =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q) ||
        (t.tags || []).some((tg) => tg.toLowerCase().includes(q))
      );
    }
    return U.sortTasks(arr, filters.sort);
  }

  function allTags() {
    const set = new Set();
    state.tasks.forEach((t) => (t.tags || []).forEach((x) => set.add(x)));
    return Array.from(set).sort();
  }

  function tasksByList(listId) {
    return state.tasks.filter((t) => !t.deletedAt && !t.archived && t.listId === listId);
  }

  function taskCount(scopeKind, value) {
    const savedView = view;
    view = { layout: "list", scope: { kind: scopeKind, value } };
    const n = visibleTasks().length;
    view = savedView;
    return n;
  }

  function markBackup() {
    state.meta.lastBackupAt = U.now();
    Storage.save(state);
    render();
  }

  // ===== 导出 API =====
  return {
    init, getState, onRender, render,
    getView, setView, setLayout, back, forward, canBack, canFwd,
    getFilters, setFilter, resetFilters, getSearch, setSearch,
    addTask, updateTask, getTask, setStatus, toggleTask,
    deleteTask, restoreTask, purgeTask, archiveTask, unarchiveTask,
    addToMyDay, removeFromMyDay, toggleStar, togglePin,
    moveTaskToList, reorderTask,
    getList, getListName, addList, updateList, deleteList, restoreList, purgeList,
    addSmartList, updateSmartList, deleteSmartList,
    addTemplate, deleteTemplate,
    setSettings, setAccount,
    exportJSON, importState, clearAllData,
    visibleTasks, allTags, tasksByList, taskCount,
    batchSetStatus, batchDelete, batchMove, batchSetPriority,
    markBackup,
    undo, redo, canUndo, canRedo,
    commit, applyRemote, markDirty: function () { state.meta.dirty = U.now(); Storage.save(state); },
  };
})();
