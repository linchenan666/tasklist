// ===== 界面渲染层 =====
window.Render = (function () {
  const U = window.U;
  function $(id) { return document.getElementById(id); }

  // 任务弹窗草稿
  let taskModal = { id: null, draft: null };
  let listModalId = null;
  let filterModalId = null;
  let calCursor = new Date(); // 日历当前月

  // 批量选择
  let batchMode = false;
  const selected = new Set();

  // ===== 主渲染 =====
  function renderAll() {
    renderSidebar();
    renderAccountBox();
    renderTitle();
    renderNavButtons();
    renderFilterBar();
    renderProgress();
    renderView();
    renderLayoutSwitch();
    renderPomodoroTaskOptions();
    renderBatchBar();
    applyStaticI18n();
  }

  function renderTitle() {
    const v = Store.getView();
    let title = t("all");
    const sc = v.scope;
    if (sc.kind === "list") title = Store.getListName(sc.value);
    else if (sc.kind === "filter") {
      const sl = Store.getState().smartLists.find((x) => x.id === sc.value);
      title = sl ? sl.name : t("smartLists");
    } else {
      const names = { myday: t("myday"), today: t("today"), upcoming: t("upcoming"), overdue: t("overdue"), inbox: t("inbox"), completed: t("completed"), logbook: t("logbook"), all: t("all"), archive: t("archive"), trash: t("trash") };
      title = names[sc.kind] || t("all");
    }
    $("view-title").textContent = title;
    const tasks = Store.visibleTasks();
    const done = tasks.filter((t) => t.status === "done").length;
    $("task-count").textContent = tasks.length ? `${tasks.length} 个任务 · ${done} 完成` : "";
  }

  function renderNavButtons() {
    $("back-btn").disabled = !Store.canBack();
    $("forward-btn").disabled = !Store.canFwd();
  }

  function renderLayoutSwitch() {
    const layout = Store.getView().layout;
    document.querySelectorAll("#view-switch [data-layout]").forEach((b) => {
      b.classList.toggle("active", b.dataset.layout === layout);
    });
  }

  function renderProgress() {
    const kind = Store.getView().scope.kind;
    if (["trash", "archive", "logbook"].includes(kind)) {
      $("progress-wrap").classList.add("hidden");
      return;
    }
    const tasks = Store.visibleTasks();
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("progress-bar").style.width = pct + "%";
    $("progress-text").textContent = total ? `${done}/${total} · ${pct}%` : "";
    $("progress-wrap").classList.toggle("hidden", total === 0);
  }

  // ===== 侧边栏 =====
  function renderSidebar() {
    const st = Store.getState();
    const lists = st.lists.filter((l) => !l.deletedAt);
    const v = Store.getView();

    // 智能视图高亮
    document.querySelectorAll(".smart-views .nav-item, .bottom-nav .nav-item").forEach((b) => {
      const on = v.scope.kind === b.dataset.view;
      b.classList.toggle("active", on);
    });
    document.querySelectorAll(".bottom-nav .nav-item[data-view='matrix']").forEach((b) => {
      b.classList.toggle("active", v.layout === "matrix");
    });

    // 清单列表(支持文件夹缩进)
    const el = $("lists");
    const folders = lists.filter((l) => !l.parentId);
    const html = [];
    const walk = (parent, depth) => {
      (lists.filter((l) => l.parentId === parent)).forEach((l) => {
        const n = Store.tasksByList(l.id).filter((t) => t.status !== "done").length;
        html.push(`
          <button class="nav-item list-item ${v.scope.kind === "list" && v.scope.value === l.id ? "active" : ""}"
                  data-view="list" data-list="${l.id}" style="padding-left:${12 + depth * 14}px" draggable="true" data-drop-list="${l.id}">
            <span class="list-dot" style="background:${l.color}"></span>
            <span class="list-name">${U.escapeHtml(l.name)}</span>
            <span class="count">${n || ""}</span>
          </button>`);
        walk(l.id, depth + 1);
      });
    };
    walk(null, 0);
    el.innerHTML = html.join("") || `<div class="empty-hint">还没有清单,点右上 ＋ 新建</div>`;

    // 智能清单
    const fel = $("filter-lists");
    fel.innerHTML = st.smartLists.map((sl) => `
      <button class="nav-item filter-item ${v.scope.kind === "filter" && v.scope.value === sl.id ? "active" : ""}"
              data-view="filter" data-filter="${sl.id}">
        <span class="list-dot" style="background:#64748b">🔍</span>
        <span class="list-name">${U.escapeHtml(sl.name)}</span>
      </button>`).join("") || "";
  }

  function renderAccountBox() {
    const st = Store.getState();
    const box = $("account-box");
    const acc = st.account;
    if (acc.userId) {
      const dirty = st.meta.dirty ? "有未同步更改" : "已同步";
      box.innerHTML = `
        <div class="acct-row"><span class="dot online"></span><span class="acct-email">${U.escapeHtml(acc.email || "已登录")}</span></div>
        <div class="acct-row muted small">${Sync.configured() ? dirty : "未配置同步(本地模式)"}</div>
        <div class="acct-actions">
          <button id="sync-btn" class="btn btn-ghost btn-sm">🔄 同步</button>
          <button id="logout-btn" class="btn btn-ghost btn-sm">退出</button>
        </div>`;
    } else {
      box.innerHTML = `<div class="acct-row muted small">📱 纯本地模式 · 数据保存在本机,永久免费</div>`;
    }
  }

  function renderBatchBar() {
    const bar = $("batch-bar");
    bar.classList.toggle("hidden", !batchMode);
    $("fab-add").classList.toggle("hidden", batchMode);
    $("batch-count").textContent = "已选 " + selected.size + " 项";
    const sel = $("batch-list");
    const cur = sel.value;
    const lists = Store.getState().lists.filter((l) => !l.deletedAt);
    sel.innerHTML = `<option value="">移动到清单…</option>` + lists.map((l) => `<option value="${l.id}">${U.escapeHtml(l.name)}</option>`).join("");
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }

  // ===== 筛选栏 =====
  function renderFilterBar() {
    const f = Store.getFilters();
    const tags = Store.allTags();
    const sel = $("f-tag");
    const cur = sel.value;
    sel.innerHTML = `<option value="">全部</option>` + tags.map((t) => `<option value="${U.escapeHtml(t)}">${U.escapeHtml(t)}</option>`).join("");
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
    $("f-status").value = f.status;
    $("f-priority").value = f.priority;
    $("f-date").value = f.date;
    $("f-sort").value = f.sort;
    $("f-hide-done").checked = !!f.hideDone;
  }

  // ===== 视图分发 =====
  function renderView() {
    const layout = Store.getView().layout;
    ["list-view", "board-view", "calendar-view", "matrix-view"].forEach((id) => $(id).classList.add("hidden"));
    if (layout === "list") { $("list-view").classList.remove("hidden"); renderListView(); }
    else if (layout === "board") { $("board-view").classList.remove("hidden"); renderBoardView(); }
    else if (layout === "calendar") { $("calendar-view").classList.remove("hidden"); renderCalendarView(); }
    else { $("matrix-view").classList.remove("hidden"); renderMatrixView(); }
  }

  function emptyHtml(msg) {
    return `<div class="empty-state"><div class="empty-icon">📝</div><p>${msg || "这里空空如也"}</p><button class="btn btn-primary" data-empty-add>＋ ${t("newTask")}</button></div>`;
  }

  // ===== 列表视图 =====
  function renderListView() {
    const tasks = Store.visibleTasks();
    const el = $("list-view");
    const kind = Store.getView().scope.kind;
    const showList = ["all", "inbox", "completed", "logbook", "today", "upcoming", "overdue", "myday", "filter"].includes(kind);
    if (!tasks.length) {
      const emptyMsgs = { trash: ["🗑️", t("emptyTrash")], archive: ["🗂️", t("emptyArchive")], logbook: ["📖", t("emptyLogbook")] };
      if (emptyMsgs[kind]) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">${emptyMsgs[kind][0]}</div><p>${emptyMsgs[kind][1]}</p></div>`;
      } else {
        el.innerHTML = emptyHtml(t("emptyAll"));
      }
      return;
    }
    el.innerHTML = `<div class="task-list" id="task-list">` + tasks.map((t) => taskItemHtml(t, { showList })).join("") + `</div>`;
  }

  function taskItemHtml(t, opts = {}) {
    const done = t.status === "done";
    const overdue = U.taskOverdue(t);
    const pri = U.PRIORITIES.find((p) => p.v === t.priority) || { icon: "⚪" };
    const tags = (t.tags || []).map((tg) => `<span class="tag">#${U.escapeHtml(tg)}</span>`).join("");
    const subTotal = (t.subtasks || []).length;
    const subDone = (t.subtasks || []).filter((s) => s.done).length;
    const sub = subTotal ? `<span class="sub">☑ ${subDone}/${subTotal}</span>` : "";
    const due = t.dueDate ? `<span class="due ${overdue ? "overdue" : ""}">${overdue ? "⚠ " : ""}${U.escapeHtml(U.dueText(t))}</span>` : "";
    const listName = (opts.showList && t.listId) ? `<span class="listname">🗂 ${U.escapeHtml(Store.getListName(t.listId))}</span>` : "";
    const myday = t.mydayDate === U.todayISO() ? `<span class="myday">☀️</span>` : "";
    return `
      <div class="task-item pri-${t.priority} ${done ? "done" : ""}" data-id="${t.id}" draggable="true">
        ${batchMode ? `<button class="task-sel ${selected.has(t.id) ? "on" : ""}" data-act="sel" title="选择">${selected.has(t.id) ? "✓" : ""}</button>` : ""}
        <button class="task-check" data-act="toggle" title="完成/取消">${done ? "✓" : ""}</button>
        <div class="task-main" data-act="edit">
          <div class="task-title">${U.escapeHtml(t.title) || "(无标题)"}</div>
          <div class="task-meta-line">${pri.icon} ${due} ${sub} ${listName} ${tags} ${myday}</div>
        </div>
        <div class="task-actions">
          <button class="mini ${t.starred ? "on" : ""}" data-act="star" title="星标">${t.starred ? "⭐" : "☆"}</button>
          <button class="mini" data-act="myday" title="加入/移出我的今天">☀</button>
          <button class="mini" data-act="edit" title="编辑">✎</button>
        </div>
      </div>`;
  }

  // ===== 看板视图 =====
  function renderBoardView() {
    const tasks = Store.visibleTasks();
    const cols = [
      { k: "todo", label: t("todo") },
      { k: "in_progress", label: t("inProgress") },
      { k: "done", label: t("done") },
    ];
    $("board-view").innerHTML = `<div class="board">` + cols.map((c) => {
      const list = tasks.filter((t) => t.status === c.k);
      return `
        <div class="board-col" data-col="${c.k}">
          <div class="board-col-head">${c.label} <span class="count">${list.length}</span></div>
          <div class="board-cards">
            ${list.length ? list.map((t) => boardCardHtml(t)).join("") : `<div class="board-empty">拖到这里</div>`}
          </div>
        </div>`;
    }).join("") + `</div>`;
  }

  function boardCardHtml(t) {
    const overdue = U.taskOverdue(t);
    const due = t.dueDate ? `<span class="due ${overdue ? "overdue" : ""}">${U.escapeHtml(U.dueText(t))}</span>` : "";
    const pri = U.PRIORITIES.find((p) => p.v === t.priority) || { icon: "⚪" };
    return `
      <div class="board-card pri-${t.priority}" data-id="${t.id}" draggable="true">
        <div class="board-card-title">${U.escapeHtml(t.title)}</div>
        <div class="task-meta-line">${pri.icon} ${due}</div>
      </div>`;
  }

  // ===== 日历视图 =====
  function renderCalendarView() {
    const tasks = Store.visibleTasks().filter((t) => t.dueDate);
    const byDate = {};
    tasks.forEach((t) => { (byDate[t.dueDate] = byDate[t.dueDate] || []).push(t); });
    const y = calCursor.getFullYear(), m = calCursor.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    const today = U.todayISO();
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = U.fmtDateISO(d);
      const inMonth = d.getMonth() === m;
      const list = byDate[iso] || [];
      cells += `
        <div class="cal-cell ${inMonth ? "" : "out"} ${iso === today ? "today" : ""}" data-date="${iso}">
          <div class="cal-day">${d.getDate()}</div>
          <div class="cal-tasks">
            ${list.slice(0, 3).map((t) => `<button class="cal-chip pri-${t.priority}" data-id="${t.id}" draggable="true" title="${U.escapeHtml(t.title)}">${U.escapeHtml(t.title)}</button>`).join("")}
            ${list.length > 3 ? `<span class="cal-more">+${list.length - 3}</span>` : ""}
          </div>
        </div>`;
    }
    $("calendar-view").innerHTML = `
      <div class="cal-head">
        <button class="btn btn-ghost btn-sm" id="cal-prev">‹</button>
        <h3>${y} 年 ${m + 1} 月</h3>
        <button class="btn btn-ghost btn-sm" id="cal-next">›</button>
        <button class="btn btn-ghost btn-sm" id="cal-today">今天</button>
      </div>
      <div class="cal-grid">
        ${["日", "一", "二", "三", "四", "五", "六"].map((d) => `<div class="cal-weekday">${d}</div>`).join("")}
        ${cells}
      </div>`;
  }

  // ===== 四象限视图 =====
  function renderMatrixView() {
    const tasks = Store.visibleTasks().filter((t) => t.status !== "done" && !t.deletedAt);
    const today = U.todayISO();
    const important = (t) => t.priority === "high" || t.priority === "medium";
    const urgent = (t) => U.taskOverdue(t) || t.dueDate === today;
    const quads = [
      { label: "重要 · 紧急", cls: "q1", list: tasks.filter((t) => important(t) && urgent(t)) },
      { label: "重要 · 不紧急", cls: "q2", list: tasks.filter((t) => important(t) && !urgent(t)) },
      { label: "不重要 · 紧急", cls: "q3", list: tasks.filter((t) => !important(t) && urgent(t)) },
      { label: "不重要 · 不紧急", cls: "q4", list: tasks.filter((t) => !important(t) && !urgent(t)) },
    ];
    $("matrix-view").innerHTML = `<div class="matrix-grid">` + quads.map((q) => `
      <div class="matrix-quad ${q.cls}">
        <div class="matrix-quad-head">${q.label} <span class="count">${q.list.length}</span></div>
        <div class="matrix-quad-body">
          ${q.list.length ? q.list.map((t) => `<div class="matrix-item" data-id="${t.id}">${U.escapeHtml(t.title)}</div>`).join("") : `<div class="board-empty">空</div>`}
        </div>
      </div>`).join("") + `</div>`;
  }

  // ===== 任务弹窗 =====
  function newDraft(preset) {
    return {
      listId: (preset && preset.listId != null) ? preset.listId : (Store.getState().settings.defaultListId || null),
      title: "", description: "", notes: "",
      status: "todo", priority: "none", tags: [], dueDate: null, dueTime: null,
      repeat: null, reminder: null, subtasks: [], starred: false, pinned: false,
    };
  }

  function openTaskModal(id, preset) {
    taskModal.id = id;
    if (id) {
      const t = Store.getTask(id);
      taskModal.draft = {
        listId: t.listId, title: t.title, description: t.description, notes: t.notes,
        status: t.status, priority: t.priority, tags: (t.tags || []).slice(), dueDate: t.dueDate,
        dueTime: t.dueTime, repeat: t.repeat, reminder: t.reminder,
        subtasks: (t.subtasks || []).map((s) => ({ id: s.id, title: s.title, done: s.done })),
        starred: !!t.starred, pinned: !!t.pinned,
      };
      $("task-modal-title").textContent = "编辑任务";
      $("t-delete").classList.remove("hidden");
    } else {
      taskModal.draft = newDraft(preset);
      $("task-modal-title").textContent = "新建任务";
      $("t-delete").classList.add("hidden");
    }
    fillListOptions();
    fillTemplateOptions();
    renderTaskModalForm();
    showModal("task-modal");
    $("t-title").focus();
  }

  function fillListOptions() {
    const st = Store.getState();
    const lists = st.lists.filter((l) => !l.deletedAt);
    $("t-list").innerHTML = `<option value="">收件箱</option>` + lists.map((l) => `<option value="${l.id}">${U.escapeHtml(l.name)}</option>`).join("");
    $("t-list").value = taskModal.draft.listId || "";
  }

  function fillTemplateOptions() {
    const st = Store.getState();
    $("t-template").innerHTML = `<option value="">— 从模板新建 —</option>` + st.templates.map((tp) => `<option value="${tp.id}">${U.escapeHtml(tp.name)}</option>`).join("");
    $("t-template").value = "";
  }

  function renderTaskModalForm() {
    const d = taskModal.draft;
    $("t-title").value = d.title;
    $("t-description").value = d.description;
    $("t-notes").value = d.notes;
    $("t-due-date").value = d.dueDate || "";
    $("t-due-time").value = d.dueTime || "";
    $("t-tags").value = (d.tags || []).join(", ");
    $("t-starred").checked = !!d.starred;
    $("t-pinned").checked = !!d.pinned;
    $("t-repeat").value = repeatToSelect(d.repeat);
    $("t-reminder").value = d.reminder ? String(d.reminder.minutesBefore) : "none";
    renderSeg("t-priority", d.priority);
    renderSeg("t-status", d.status);
    renderSubtasks();
  }

  function renderSeg(id, val) {
    document.querySelectorAll(`#${id} button`).forEach((b) => {
      b.classList.toggle("active", b.dataset.v === val);
    });
  }

  function renderSubtasks() {
    const d = taskModal.draft;
    const list = d.subtasks || [];
    const done = list.filter((s) => s.done).length;
    $("t-subtask-progress").textContent = list.length ? `${done}/${list.length}` : "";
    $("t-subtasks").innerHTML = list.map((s, i) => `
      <li class="subtask-item">
        <button class="task-check small ${s.done ? "on" : ""}" data-sub-i="${i}" data-sub-act="toggle">${s.done ? "✓" : ""}</button>
        <span class="subtask-title ${s.done ? "done" : ""}">${U.escapeHtml(s.title)}</span>
        <button class="mini" data-sub-i="${i}" data-sub-act="del">✕</button>
      </li>`).join("");
  }

  function resolveRepeat(repeatType) {
    if (!repeatType) return null;
    const ask = (msg, def) => {
      const n = parseInt(prompt(msg + "重复一次?(填数字)", String(def)), 10);
      return n > 0 ? n : def;
    };
    if (repeatType === "custom_days") return { type: "daily", interval: ask("每隔几天", 2) };
    if (repeatType === "custom_weeks") return { type: "weekly", interval: ask("每隔几周", 2) };
    if (repeatType === "custom_months") return { type: "monthly", interval: ask("每隔几月", 2) };
    return { type: repeatType, interval: 1 };
  }
  function repeatToSelect(r) {
    if (!r || !r.type) return "";
    if (r.type === "daily" && r.interval > 1) return "custom_days";
    if (r.type === "weekly" && r.interval > 1) return "custom_weeks";
    if (r.type === "monthly" && r.interval > 1) return "custom_months";
    return r.type;
  }

  function readTaskModal() {
    const d = taskModal.draft;
    const repeatType = $("t-repeat").value;
    const remV = $("t-reminder").value;
    d.title = $("t-title").value.trim();
    d.listId = $("t-list").value || null;
    d.description = $("t-description").value;
    d.notes = $("t-notes").value;
    d.dueDate = $("t-due-date").value || null;
    d.dueTime = $("t-due-time").value || null;
    d.tags = $("t-tags").value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
    d.starred = $("t-starred").checked;
    d.pinned = $("t-pinned").checked;
    d.repeat = resolveRepeat(repeatType);
    d.reminder = (remV && remV !== "none") ? { minutesBefore: parseInt(remV, 10) } : null;
    return d;
  }

  function saveTask() {
    const d = readTaskModal();
    if (!d.title) { toast("请填写任务标题", "warn"); $("t-title").focus(); return; }
    if (taskModal.id) Store.updateTask(taskModal.id, d);
    else Store.addTask(d);
    closeModal("task-modal");
    toast("已保存", "ok");
  }

  // ===== 清单弹窗 =====
  function openListModal(id) {
    listModalId = id;
    const st = Store.getState();
    const lists = st.lists.filter((l) => !l.deletedAt);
    const colors = $("l-color");
    colors.innerHTML = U.LIST_COLORS.map((c) => `<button class="color-swatch ${c === U.LIST_COLORS[0] ? "active" : ""}" data-color="${c}" style="background:${c}"></button>`).join("");
    let selectedColor = U.LIST_COLORS[0];
    let name = "", parentId = null;
    if (id) {
      const l = Store.getList(id);
      name = l.name; selectedColor = l.color; parentId = l.parentId;
      $("list-modal-title").textContent = "编辑清单";
      $("l-delete").classList.remove("hidden");
    } else {
      $("list-modal-title").textContent = "新建清单";
      $("l-delete").classList.add("hidden");
    }
    $("l-name").value = name;
    document.querySelectorAll("#l-color button").forEach((b) => b.classList.toggle("active", b.dataset.color === selectedColor));
    $("l-parent").innerHTML = `<option value="">(无,作为顶层清单)</option>` + lists.filter((l) => l.id !== id).map((l) => `<option value="${l.id}">${U.escapeHtml(l.name)}</option>`).join("");
    $("l-parent").value = parentId || "";
    showModal("list-modal");
  }

  function saveList() {
    const name = $("l-name").value.trim();
    if (!name) { toast("请填写清单名称", "warn"); return; }
    const color = document.querySelector("#l-color button.active")?.dataset.color || U.LIST_COLORS[0];
    const parentId = $("l-parent").value || null;
    if (listModalId) Store.updateList(listModalId, { name, color, parentId });
    else Store.addList({ name, color, parentId });
    closeModal("list-modal");
  }

  // ===== 智能清单弹窗 =====
  function openFilterModal(id) {
    filterModalId = id;
    const st = Store.getState();
    let cond = {};
    let name = "";
    if (id) {
      const sl = st.smartLists.find((x) => x.id === id);
      if (sl) { cond = sl.conditions || {}; name = sl.name; }
      $("fl-delete").classList.remove("hidden");
    } else $("fl-delete").classList.add("hidden");
    $("fl-name").value = name;
    $("fl-status").value = cond.status || "";
    $("fl-priority").value = cond.priority || "";
    $("fl-tag").value = cond.tag || "";
    $("fl-due").value = cond.due || "";
    $("fl-list").innerHTML = `<option value="">不限</option>` + st.lists.filter((l) => !l.deletedAt).map((l) => `<option value="${l.id}">${U.escapeHtml(l.name)}</option>`).join("");
    $("fl-list").value = cond.listId || "";
    showModal("filter-modal");
  }

  function saveFilter() {
    const name = $("fl-name").value.trim();
    if (!name) { toast("请填写名称", "warn"); return; }
    const cond = {
      status: $("fl-status").value || undefined,
      priority: $("fl-priority").value || undefined,
      tag: $("fl-tag").value.trim() || undefined,
      listId: $("fl-list").value || undefined,
      due: $("fl-due").value || undefined,
    };
    if (filterModalId) Store.updateSmartList(filterModalId, { name, conditions: cond });
    else Store.addSmartList({ name, conditions: cond });
    closeModal("filter-modal");
  }

  // ===== 统计弹窗 =====
  function openStatsModal() {
    const st = Store.getState();
    const active = st.tasks.filter((t) => !t.deletedAt && !t.archived);
    const done = active.filter((t) => t.status === "done");
    const overdue = active.filter((t) => U.taskOverdue(t));
    const total = active.length;
    const rate = total ? Math.round((done.length / total) * 100) : 0;
    $("stat-cards").innerHTML = `
      <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">总任务</div></div>
      <div class="stat-card"><div class="stat-num">${done.length}</div><div class="stat-label">已完成</div></div>
      <div class="stat-card"><div class="stat-num">${rate}%</div><div class="stat-label">完成率</div></div>
      <div class="stat-card danger"><div class="stat-num">${overdue.length}</div><div class="stat-label">已逾期</div></div>
      <div class="stat-card"><div class="stat-num">${karma()}</div><div class="stat-label">积分</div></div>
      <div class="stat-card"><div class="stat-num">${streak()}</div><div class="stat-label">连续打卡(天)</div></div>`;
    drawTrend();
    drawPriorityPie();
    drawHeatmap();
    renderAchievements();
    weeklyReport();
    showModal("stats-modal");
  }

  function karma() {
    return Store.getState().tasks.filter((t) => t.status === "done").length * 10;
  }
  function streak() {
    const days = new Set();
    Store.getState().tasks.forEach((t) => { if (t.completedAt) days.add(U.fmtDateISO(new Date(t.completedAt))); });
    let s = 0;
    let d = new Date();
    if (!days.has(U.fmtDateISO(d))) d.setDate(d.getDate() - 1);
    while (days.has(U.fmtDateISO(d))) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }

  function achievements() {
    const st = Store.getState();
    const done = st.tasks.filter((t) => t.status === "done" && !t.deletedAt).length;
    const totalPomo = st.tasks.reduce((s, t) => s + (t.pomodoroCount || 0), 0);
    const stk = streak();
    return [
      { icon: "🚀", name: "起步", desc: "创建第一个任务", ok: st.tasks.some((t) => !t.deletedAt) },
      { icon: "✅", name: "首战告捷", desc: "完成第一个任务", ok: done >= 1 },
      { icon: "🔟", name: "小有成就", desc: "完成 10 个任务", ok: done >= 10 },
      { icon: "💯", name: "百炼成钢", desc: "完成 100 个任务", ok: done >= 100 },
      { icon: "🍅", name: "番茄新手", desc: "完成第一个番茄钟", ok: totalPomo >= 1 },
      { icon: "⏱", name: "番茄达人", desc: "完成 10 个番茄钟", ok: totalPomo >= 10 },
      { icon: "🔥", name: "坚持 3 天", desc: "连续打卡 3 天", ok: stk >= 3 },
      { icon: "🏆", name: "坚持 7 天", desc: "连续打卡 7 天", ok: stk >= 7 },
      { icon: "🗂", name: "整理达人", desc: "创建第一个清单", ok: st.lists.some((l) => !l.deletedAt) },
    ];
  }
  function renderAchievements() {
    $("achievements").innerHTML = achievements().map((a) => `
      <div class="ach-item ${a.ok ? "earned" : "locked"}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-name">${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>`).join("");
  }

  function drawTrend() {
    const cv = $("chart-trend");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const days = 30, barW = W / days;
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = U.fmtDateISO(d);
      data.push(Store.getState().tasks.filter((t) => t.completedAt && U.fmtDateISO(new Date(t.completedAt)) === iso).length);
    }
    const max = Math.max(1, ...data);
    data.forEach((v, i) => {
      const h = (v / max) * (H - 24);
      ctx.fillStyle = v ? "#4f46e5" : "#e2e8f0";
      ctx.fillRect(i * barW + 1, H - h - 14, barW - 2, h);
    });
    ctx.fillStyle = "#64748b"; ctx.font = "10px sans-serif";
    ctx.fillText("近 30 天每天完成任务数", 4, 10);
  }

  function drawPriorityPie() {
    const cv = $("chart-priority");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const tasks = Store.getState().tasks.filter((t) => !t.deletedAt && !t.archived);
    const colors = { high: "#ef4444", medium: "#f59e0b", low: "#3b82f6", none: "#cbd5e1" };
    const counts = { high: 0, medium: 0, low: 0, none: 0 };
    tasks.forEach((t) => counts[t.priority] = (counts[t.priority] || 0) + 1);
    const total = Math.max(1, tasks.length);
    const cx = 52, cy = 70, r = 40;
    let start = -Math.PI / 2;
    Object.keys(counts).forEach((k) => {
      const ang = (counts[k] / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = colors[k];
      ctx.fill();
      start += ang;
    });
    // 图例(右侧,不再和饼图重叠)
    let ly = 18;
    Object.keys(counts).forEach((k) => {
      ctx.fillStyle = colors[k];
      ctx.fillRect(112, ly, 10, 10);
      ctx.fillStyle = "#64748b"; ctx.font = "11px sans-serif";
      ctx.fillText(U.PRIORITIES.find((p) => p.v === k).label + " " + counts[k], 126, ly + 9);
      ly += 18;
    });
  }

  function focusLog() {
    try { return JSON.parse(localStorage.getItem("tasklist_focuslog") || "{}"); } catch (e) { return {}; }
  }

  function drawHeatmap() {
    const el = $("heatmap");
    const log = focusLog();
    const cells = [];
    const weeks = 12;
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1));
    // 对齐到周日
    start.setDate(start.getDate() - start.getDay());
    let d = new Date(start);
    let html = `<div class="hm-weekdays">` + ["", "一", "三", "五"].map((x) => `<span>${x}</span>`).join("") + `</div>`;
    const grid = [];
    for (let w = 0; w < weeks; w++) {
      let col = `<div class="hm-col">`;
      for (let i = 0; i < 7; i++) {
        const iso = U.fmtDateISO(d);
        const min = log[iso] || 0;
        let cls = "hm-cell";
        if (min > 0) cls += min >= 60 ? " h4" : min >= 30 ? " h3" : min >= 15 ? " h2" : " h1";
        col += `<div class="${cls}" title="${iso}: ${min} 分钟"></div>`;
        d.setDate(d.getDate() + 1);
      }
      col += `</div>`;
      grid.push(col);
    }
    html += `<div class="hm-grid">${grid.join("")}</div>`;
    html += `<div class="muted small">专注分钟数(近 12 周)</div>`;
    el.innerHTML = html;
  }

  function backupInfo() {
    const last = Store.getState().meta.lastBackupAt;
    if (!last) return "从未备份";
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    if (days <= 0) return "今天备份过";
    return days + " 天前";
  }

  function exportReport() {
    const st = Store.getState();
    const active = st.tasks.filter((t) => !t.deletedAt && !t.archived);
    const done = active.filter((t) => t.status === "done");
    const overdue = active.filter((t) => U.taskOverdue(t));
    const rate = active.length ? Math.round((done.length / active.length) * 100) + "%" : "0%";
    const lines = [];
    lines.push("# 任务统计报告");
    lines.push("");
    lines.push("生成时间:" + U.fmtDateTime(U.now()));
    lines.push("");
    lines.push("## 概览");
    lines.push("- 总任务:" + active.length);
    lines.push("- 已完成:" + done.length);
    lines.push("- 完成率:" + rate);
    lines.push("- 已逾期:" + overdue.length);
    lines.push("- 总积分:" + karma());
    lines.push("- 连续打卡:" + streak() + " 天");
    lines.push("- 上次备份:" + backupInfo());
    lines.push("");
    lines.push("## 成就徽章");
    achievements().forEach((a) => lines.push("- " + (a.ok ? "✅" : "🔒") + " " + a.name + "(" + a.desc + ")"));
    lines.push("");
    lines.push("## 按优先级分布");
    U.PRIORITIES.forEach((p) => {
      lines.push("- " + p.label + ":" + active.filter((t) => t.priority === p.v).length);
    });
    lines.push("");
    lines.push("## 按清单分布");
    st.lists.filter((l) => !l.deletedAt).forEach((l) => {
      lines.push("- " + l.name + ":" + active.filter((t) => t.listId === l.id).length);
    });
    lines.push("");
    lines.push("## 最近完成的任务");
    active.filter((t) => t.completedAt).sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)).slice(0, 10)
      .forEach((t) => lines.push("- " + t.title + "(" + U.fmtDateTime(t.completedAt) + ")"));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "任务统计报告-" + U.todayISO() + ".md";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("已导出统计报告", "ok");
  }

  function weeklyReport() {
    const el = $("weekly-report");
    const thisWeekDone = Store.getState().tasks.filter((t) => {
      if (!t.completedAt) return false;
      const d = new Date(t.completedAt);
      const now = new Date();
      const diff = (now - d) / 86400000;
      return diff <= 7;
    }).length;
    const focus = focusLog();
    let weekMin = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      weekMin += focus[U.fmtDateISO(d)] || 0;
    }
    el.innerHTML = `
      <h4>📋 本周回顾</h4>
      <p>本周完成任务:<b>${thisWeekDone}</b> 个</p>
      <p>本周专注时长:<b>${U.fmtMin(weekMin * 60)}</b> 分钟</p>
      <p>连续打卡:<b>${streak()}</b> 天 · 总积分:<b>${karma()}</b></p>
      <p>上次备份:<b>${backupInfo()}</b>${/天前|从未/.test(backupInfo()) ? " ⚠️ 建议定期备份" : ""}</p>
      <button id="report-export" class="btn btn-ghost btn-sm">📑 导出统计报告</button>
      <button id="csv-export" class="btn btn-ghost btn-sm">📄 导出 CSV</button>
      <button id="clear-all-btn" class="btn btn-danger btn-sm">🗑 清空所有数据</button>`;
  }

  // ===== 番茄钟渲染 =====
  function renderPomodoroTaskOptions() {
    const st = Store.getState();
    const active = st.tasks.filter((t) => !t.deletedAt && !t.archived && t.status !== "done");
    $("pomodoro-task").innerHTML = `<option value="">不绑定任务</option>` + active.map((t) => `<option value="${t.id}">${U.escapeHtml(t.title)}</option>`).join("");
  }

  // ===== 弹窗工具 =====
  function showModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }

  // ===== Toast =====
  function toast(msg, type) {
    const box = $("toasts");
    const el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add("show"); }, 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2600);
  }

  // ===== 确认框 =====
  let confirmCb = null;
  function confirmDialog(title, text, cb) {
    $("confirm-title").textContent = title;
    $("confirm-text").textContent = text;
    confirmCb = cb;
    showModal("confirm-modal");
  }
  function confirmYes() {
    closeModal("confirm-modal");
    if (confirmCb) { const cb = confirmCb; confirmCb = null; cb(); }
  }
  function confirmNo() {
    closeModal("confirm-modal");
    confirmCb = null;
  }

  // ===== 内部事件绑定 =====
  function init() {
    // 填充重复/提醒下拉选项
    $("t-repeat").innerHTML = U.REPEAT_OPTIONS.map((o) => `<option value="${o.v}">${o.label}</option>`).join("");
    $("t-reminder").innerHTML = U.REMINDER_OPTIONS.map((o) => `<option value="${o.v}">${o.label}</option>`).join("");
    // 任务弹窗:优先级/状态分段
    document.querySelectorAll("#t-priority button, #t-status button").forEach((b) => {
      b.addEventListener("click", () => {
        const group = b.closest(".seg").id === "t-priority" ? "priority" : "status";
        taskModal.draft[group] = b.dataset.v;
        renderSeg(group === "priority" ? "t-priority" : "t-status", b.dataset.v);
      });
    });
    // 子任务
    function addSub() {
      const inp = $("t-subtask-input");
      const v = inp.value.trim();
      if (!v) return;
      taskModal.draft.subtasks.push({ id: U.uid(), title: v, done: false });
      inp.value = "";
      renderSubtasks();
    }
    $("t-subtask-add").addEventListener("click", addSub);
    $("t-subtask-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } });
    $("t-subtasks").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sub-act]");
      if (!btn) return;
      const i = parseInt(btn.dataset.subI, 10);
      if (btn.dataset.subAct === "toggle") taskModal.draft.subtasks[i].done = !taskModal.draft.subtasks[i].done;
      else taskModal.draft.subtasks.splice(i, 1);
      renderSubtasks();
    });
    // 保存
    $("t-save").addEventListener("click", saveTask);
    $("t-delete").addEventListener("click", () => {
      confirmDialog("删除任务", "确定删除这个任务吗?会移入回收站。", () => {
        Store.deleteTask(taskModal.id);
        closeModal("task-modal");
        toast("已移入回收站", "ok");
      });
    });
    // 模板
    $("t-save-template").addEventListener("click", () => {
      const d = readTaskModal();
      if (!d.title) { toast("先填标题再存模板", "warn"); return; }
      const name = prompt("模板名称:", d.title);
      if (!name) return;
      const tpl = Object.assign({}, d);
      delete tpl.title;
      Store.addTemplate({ name, task: tpl });
      fillTemplateOptions();
      toast("已存为模板", "ok");
    });
    $("t-template").addEventListener("change", () => {
      const id = $("t-template").value;
      if (!id) return;
      const tp = Store.getState().templates.find((x) => x.id === id);
      if (tp) Object.assign(taskModal.draft, JSON.parse(JSON.stringify(tp.task)), { subtasks: (tp.task.subtasks || []).map((s) => ({ id: U.uid(), title: s.title, done: false })) });
      renderTaskModalForm();
      fillListOptions();
      $("t-list").value = taskModal.draft.listId || "";
      $("t-template").value = "";
    });
    // 截止日期清除
    $("t-due-clear").addEventListener("click", () => { $("t-due-date").value = ""; $("t-due-time").value = ""; });

    // 快捷日期(今天/明天/下周)
    document.querySelectorAll("[data-quick]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = new Date();
        if (b.dataset.quick === "tomorrow") t.setDate(t.getDate() + 1);
        else if (b.dataset.quick === "week") t.setDate(t.getDate() + 7);
        $("t-due-date").value = U.fmtDateISO(t);
      });
    });

    // 回车保存
    $("t-title").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveTask(); } });
    $("l-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveList(); } });
    $("fl-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveFilter(); } });

    // 清单弹窗
    $("l-save").addEventListener("click", saveList);
    $("l-delete").addEventListener("click", () => {
      confirmDialog("删除清单", "确定删除清单吗?清单内的任务会移回收件箱。", () => {
        Store.deleteList(listModalId);
        closeModal("list-modal");
      });
    });
    $("l-color").addEventListener("click", (e) => {
      const b = e.target.closest(".color-swatch");
      if (!b) return;
      document.querySelectorAll("#l-color button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    });

    // 智能清单弹窗
    $("fl-save").addEventListener("click", saveFilter);
    $("fl-delete").addEventListener("click", () => {
      Store.deleteSmartList(filterModalId);
      closeModal("filter-modal");
    });

    // 确认框
    $("confirm-yes").addEventListener("click", confirmYes);
    $("confirm-no").addEventListener("click", confirmNo);

    // 日历
    $("calendar-view").addEventListener("click", (e) => {
      if (e.target.id === "cal-prev") { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendarView(); }
      else if (e.target.id === "cal-next") { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendarView(); }
      else if (e.target.id === "cal-today") { calCursor = new Date(); renderCalendarView(); }
      const chip = e.target.closest(".cal-chip");
      if (chip) openTaskModal(chip.dataset.id);
    });

    // 关闭弹窗(通用)
    document.querySelectorAll(".modal-close[data-close]").forEach((b) => {
      b.addEventListener("click", () => closeModal(b.dataset.close));
    });
    document.querySelectorAll(".modal-overlay").forEach((ov) => {
      ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.add("hidden"); });
    });
  }

  return {
    renderAll, renderView, renderAccountBox,
    openTaskModal, openListModal, openFilterModal, openStatsModal,
    toast, confirmDialog, showModal, closeModal,
    focusLog, init, exportReport,
    setBatchMode: function (on) { batchMode = on; if (!on) selected.clear(); Store.render(); },
    isBatchMode: function () { return batchMode; },
    toggleSelected: function (id) { if (selected.has(id)) selected.delete(id); else selected.add(id); Store.render(); },
    selectedIds: function () { return Array.from(selected); },
    clearSelection: function () { selected.clear(); Store.render(); },
  };
})();
