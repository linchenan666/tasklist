// ===== 主程序:事件绑定 & 应用逻辑 =====
(function () {
  const U = window.U;
  function $(id) { return document.getElementById(id); }

  // ===== 初始化 =====
  Store.init();
  Store.onRender(Render.renderAll);
  Render.init();
  applyTheme();
  Render.renderAll();

  // ===== 主题 =====
  function applyTheme() {
    const t = Store.getState().settings.theme || "light";
    const dark = t === "dark" || (t === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  function toggleTheme() {
    const s = Store.getState().settings.theme;
    const next = s === "dark" ? "light" : s === "light" ? "auto" : "dark";
    Store.setSettings({ theme: next });
    applyTheme();
    const labels = { dark: "🌞 浅色模式", light: "🌙 深色模式", auto: "🌗 跟随系统" };
    $("theme-btn").textContent = labels[next];
    Render.toast("主题:" + labels[next].replace(/^.{2}\s/, ""), "info");
  }
  // 系统深/浅色变化时自动跟随
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (Store.getState().settings.theme === "auto") applyTheme();
    });
  }

  // ===== 侧边栏导航 =====
  document.addEventListener("click", (e) => {
    const nav = e.target.closest(".nav-item[data-view]");
    if (nav) {
      const kind = nav.dataset.view;
      if (kind === "list") Store.setView(null, { kind: "list", value: nav.dataset.list });
      else if (kind === "filter") Store.setView(null, { kind: "filter", value: nav.dataset.filter });
      else if (kind === "matrix") Store.setLayout(Store.getView().layout === "matrix" ? "list" : "matrix");
      else Store.setView(null, { kind });
      closeMobileSidebar();
      return;
    }
    const layoutBtn = e.target.closest("#view-switch [data-layout]");
    if (layoutBtn) {
      const l = layoutBtn.dataset.layout;
      Store.setLayout(Store.getView().layout === l ? "list" : l);
      return;
    }

    // 任务列表动作
    const act = e.target.closest("[data-act]");
    if (act) {
      const id = act.closest("[data-id]").dataset.id;
      const a = act.dataset.act;
      if (a === "sel") { Render.toggleSelected(id); return; }
      if (Render.isBatchMode() && a === "edit") { Render.toggleSelected(id); return; }
      if (a === "toggle") Store.toggleTask(id);
      else if (a === "star") Store.toggleStar(id);
      else if (a === "myday") {
        const t = Store.getTask(id);
        if (t && t.mydayDate === U.todayISO()) Store.removeFromMyDay(id);
        else Store.addToMyDay(id);
      }
      else if (a === "edit") Render.openTaskModal(id);
      return;
    }

    // 看板卡片
    const card = e.target.closest(".board-card[data-id]");
    if (card && !e.target.closest("[data-act]")) { Render.openTaskModal(card.dataset.id); return; }
    const mitem = e.target.closest(".matrix-item[data-id]");
    if (mitem) { Render.openTaskModal(mitem.dataset.id); return; }
  });

  // ===== 侧边栏按钮 =====
  $("add-list-btn").addEventListener("click", () => Render.openListModal(null));
  $("add-filter-btn").addEventListener("click", () => Render.openFilterModal(null));
  $("theme-btn").addEventListener("click", toggleTheme);
  $("stats-btn").addEventListener("click", () => Render.openStatsModal());
  $("shortcut-btn").addEventListener("click", () => Render.showModal("shortcut-modal"));
  $("menu-btn").addEventListener("click", openMobileSidebar);
  $("sidebar-close").addEventListener("click", closeMobileSidebar);
  $("sidebar-backdrop").addEventListener("click", closeMobileSidebar);
  $("back-btn").addEventListener("click", () => Store.back());
  $("forward-btn").addEventListener("click", () => Store.forward());
  $("fab-add").addEventListener("click", newTask);

  function openMobileSidebar() { document.getElementById("app").classList.add("sidebar-open"); }
  function closeMobileSidebar() { document.getElementById("app").classList.remove("sidebar-open"); }

  // ===== 搜索 & 筛选 =====
  $("search-input").addEventListener("input", (e) => Store.setSearch(e.target.value));
  $("filter-toggle-btn").addEventListener("click", () => $("filter-bar").classList.toggle("hidden"));
  $("f-status").addEventListener("change", (e) => Store.setFilter("status", e.target.value));
  $("f-priority").addEventListener("change", (e) => Store.setFilter("priority", e.target.value));
  $("f-tag").addEventListener("change", (e) => Store.setFilter("tag", e.target.value));
  $("f-date").addEventListener("change", (e) => Store.setFilter("date", e.target.value));
  $("f-sort").addEventListener("change", (e) => Store.setFilter("sort", e.target.value));
  $("f-hide-done").addEventListener("change", (e) => Store.setFilter("hideDone", e.target.checked));
  $("f-clear").addEventListener("click", () => { Store.resetFilters(); });
  $("clear-done-btn").addEventListener("click", () => {
    const done = Store.visibleTasks().filter((t) => t.status === "done");
    if (!done.length) { Render.toast("当前视图没有已完成任务", "info"); return; }
    Render.confirmDialog("清空已完成", `确定把当前视图的 ${done.length} 个已完成任务移入回收站吗?`, () => {
      Store.batchDelete(done.map((t) => t.id));
      Render.toast("已清空 " + done.length + " 个已完成任务", "ok");
    });
  });

  // ===== 批量操作 =====
  $("batch-btn").addEventListener("click", () => Render.setBatchMode(!Render.isBatchMode()));
  $("batch-done").addEventListener("click", () => {
    const ids = Render.selectedIds();
    if (!ids.length) return;
    Store.batchSetStatus(ids, "done");
    Render.clearSelection();
    Render.toast("已批量完成 " + ids.length + " 项", "ok");
  });
  $("batch-delete").addEventListener("click", () => {
    const ids = Render.selectedIds();
    if (!ids.length) return;
    Store.batchDelete(ids);
    Render.clearSelection();
    Render.toast("已删除 " + ids.length + " 项(入回收站)", "ok");
  });
  $("batch-list").addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    Store.batchMove(Render.selectedIds(), v);
    Render.clearSelection();
    Render.toast("已批量移动", "ok");
  });
  $("batch-priority").addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    Store.batchSetPriority(Render.selectedIds(), v);
    Render.clearSelection();
    Render.toast("已批量设置优先级", "ok");
  });
  $("batch-cancel").addEventListener("click", () => Render.setBatchMode(false));

  // ===== 快速添加(自然语言) =====
  $("quick-add-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const raw = $("quick-add-input").value;
      if (!raw.trim()) return;
      const p = U.parseNatural(raw);
      if (!p.title) { Render.toast("没识别出任务内容", "warn"); return; }
      let listId = null;
      if (p.listName) {
        const l = Store.getState().lists.find((x) => !x.deletedAt && x.name.toLowerCase() === p.listName.toLowerCase());
        if (l) listId = l.id;
        else Render.toast("未找到清单「" + p.listName + "」,已放入收件箱", "warn");
      } else {
        listId = Store.getState().settings.defaultListId || null;
      }
      Store.addTask({
        title: p.title, listId, priority: p.priority || "none",
        tags: p.tags, dueDate: p.dueDate, dueTime: p.dueTime,
      });
      $("quick-add-input").value = "";
      Render.toast("已添加:" + p.title, "ok");
    }
  });

  // ===== 账号 / 同步 =====
  $("account-box").addEventListener("click", (e) => {
    if (e.target.id === "login-btn" || e.target.closest("#login-btn")) openAuth("signin");
    else if (e.target.id === "logout-btn") {
      Sync.signOut().then(() => { Render.toast("已退出登录", "info"); });
    } else if (e.target.id === "sync-btn") {
      if (!Sync.configured()) { Render.toast("纯本地模式,无需同步配置", "info"); return; }
      Sync.syncNow().then(() => Render.toast("同步完成", "ok")).catch((er) => Render.toast("同步失败:" + er.message, "warn"));
    }
  });

  // ===== 登录弹窗 =====
  let authMode = "signin";
  function openAuth(mode) {
    if (!Sync.configured()) {
      Render.toast("纯本地模式,不支持账号登录", "warn");
      return;
    }
    authMode = mode;
    $("auth-title").textContent = mode === "signin" ? "登录同步" : "注册账号";
    $("a-submit").textContent = mode === "signin" ? "登录" : "注册";
    $("a-mode").textContent = mode === "signin" ? "去注册" : "去登录";
    $("auth-error").classList.add("hidden");
    Render.showModal("auth-modal");
  }
  $("a-mode").addEventListener("click", () => openAuth(authMode === "signin" ? "signup" : "signin"));
  $("a-submit").addEventListener("click", async () => {
    const email = $("a-email").value.trim();
    const password = $("a-password").value;
    if (!email || !password) { $("auth-error").textContent = "请填写邮箱和密码"; $("auth-error").classList.remove("hidden"); return; }
    try {
      if (authMode === "signin") {
        await Sync.signIn(email, password);
        Render.closeModal("auth-modal");
        Render.toast("登录成功,正在同步…", "ok");
      } else {
        const data = await Sync.signUp(email, password);
        if (data && data.session) {
          // 邮箱确认已关闭:直接登录
          Store.setAccount({ userId: data.session.user.id, email: data.session.user.email });
          Render.closeModal("auth-modal");
          Render.toast("注册成功,正在同步…", "ok");
          Sync.syncNow().catch(() => {});
        } else {
          $("auth-error").textContent = "注册成功!请到邮箱查收确认邮件后,再点登录。";
          $("auth-error").classList.remove("hidden");
          authMode = "signin";
          $("auth-title").textContent = "登录同步";
          $("a-submit").textContent = "登录";
          $("a-mode").textContent = "去注册";
        }
      }
    } catch (er) {
      $("auth-error").textContent = er.message || "操作失败";
      $("auth-error").classList.remove("hidden");
    }
  });

  // ===== 导入 / 导出 =====
  $("export-btn").addEventListener("click", () => {
    const blob = new Blob([Store.exportJSON()], { type: "application/json" });
    download(blob, "任务清单备份-" + U.todayISO() + ".json");
    Store.markBackup();
    Render.toast("已导出备份文件,发到另一台设备点「导入」即可同步", "ok");
  });
  $("import-btn").addEventListener("click", () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          Store.importState(r.result);
          Render.toast("导入成功", "ok");
        } catch (e) { Render.toast("导入失败:文件格式错误", "warn"); }
      };
      r.readAsText(f);
    };
    inp.click();
  });
  // CSV 导出 / 清空数据(统计弹窗内按钮,事件委托)
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-empty-add]")) { newTask(); return; }
    if (e.target.id === "report-export") { Render.exportReport(); return; }
    if (e.target.id === "csv-export") exportCSV();
    if (e.target.id === "clear-all-btn") {
      Render.confirmDialog("清空所有数据", "确定删除所有任务和清单吗?此操作不可恢复。", () => {
        Store.clearAllData();
        Render.closeModal("stats-modal");
        Render.toast("已清空所有数据", "warn");
      });
    }
  });

  function exportCSV() {
    const st = Store.getState();
    const rows = [["标题", "状态", "优先级", "清单", "标签", "截止日期", "截止时间", "完成时间"]];
    st.tasks.filter((t) => !t.deletedAt).forEach((t) => {
      rows.push([t.title, t.status, t.priority, Store.getListName(t.listId), (t.tags || []).join(" "), t.dueDate || "", t.dueTime || "", t.completedAt ? U.fmtDateTime(t.completedAt) : ""]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), "任务清单-" + U.todayISO() + ".csv");
    Render.toast("已导出 CSV", "ok");
  }

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ===== 键盘快捷键 =====
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) {
      if (e.key === "Escape") { e.target.blur(); if (e.target.id === "search-input") Store.setSearch(""); }
      return;
    }
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); Store.undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k.toLowerCase() === "z" && e.shiftKey || k.toLowerCase() === "y")) { e.preventDefault(); Store.redo(); }
    else if (e.altKey && k === "ArrowLeft") { e.preventDefault(); Store.back(); }
    else if (e.altKey && k === "ArrowRight") { e.preventDefault(); Store.forward(); }
    else if (k === "n" || k === "N") { e.preventDefault(); newTask(); }
    else if (k === "/") { e.preventDefault(); $("search-input").focus(); }
    else if (k === "?") { Render.showModal("shortcut-modal"); }
    else if (k === "Escape") {
      document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((m) => m.classList.add("hidden"));
      $("pomodoro-panel").classList.add("hidden");
    }
    else if (["1", "2", "3", "4", "5", "6", "7"].includes(k)) {
      const map = ["myday", "today", "upcoming", "overdue", "inbox", "completed", "all"];
      Store.setView(null, { kind: map[parseInt(k) - 1] });
    }
  });

  function newTask() {
    const v = Store.getView();
    const preset = v.scope.kind === "list" ? { listId: v.scope.value } : {};
    Render.openTaskModal(null, preset);
  }

  // ===== 拖拽 =====
  let dragId = null;
  document.addEventListener("dragstart", (e) => {
    const item = e.target.closest("[data-id]");
    if (item) { dragId = item.dataset.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {} }
  });
  document.addEventListener("dragover", (e) => { e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const listDrop = e.target.closest("[data-drop-list]");
    const colDrop = e.target.closest(".board-col[data-col]");
    const itemDrop = e.target.closest(".task-item[data-id]");
    const calDrop = e.target.closest(".cal-cell[data-date]");
    if (!dragId) return;
    if (listDrop) {
      Store.moveTaskToList(dragId, listDrop.dataset.dropList);
      Render.toast("已移动到「" + Store.getListName(listDrop.dataset.dropList) + "」", "ok");
    } else if (colDrop) {
      Store.setStatus(dragId, colDrop.dataset.col);
    } else if (calDrop) {
      Store.updateTask(dragId, { dueDate: calDrop.dataset.date });
      Render.toast("已改期到 " + calDrop.dataset.date, "ok");
    } else if (itemDrop && itemDrop.dataset.id !== dragId) {
      Store.reorderTask(dragId, itemDrop.dataset.id);
    }
    dragId = null;
  });

  // ===== 提醒 =====
  const notified = new Set((() => { try { return JSON.parse(localStorage.getItem("tasklist_notified") || "[]"); } catch (e) { return []; } })());
  function checkReminders() {
    const now = Date.now();
    Store.getState().tasks.forEach((t) => {
      if (t.deletedAt || t.status === "done" || !t.reminder || !t.dueDate) return;
      const due = U.taskDueAt(t);
      if (!due) return;
      const remindAt = due.getTime() - (t.reminder.minutesBefore || 0) * 60000;
      if (now >= remindAt && now <= due.getTime() + 60000) {
        const key = t.id + ":" + t.updatedAt;
        if (notified.has(key)) return;
        notified.add(key);
        try { localStorage.setItem("tasklist_notified", JSON.stringify(Array.from(notified).slice(-300))); } catch (e) {}
        Render.toast("⏰ " + t.title + (t.reminder.minutesBefore ? "(提前" + t.reminder.minutesBefore + "分钟)" : "(现在)"), "warn");
        notifySystem("任务提醒", t.title);
        playSound();
      }
    });
  }
  function notifySystem(title, body) {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body });
      }
    } catch (e) {}
  }
  document.addEventListener("click", () => {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch (e) {}
  }, { once: true });
  setInterval(checkReminders, 20000);

  // ===== 音效 =====
  let audioCtx = null;
  function playSound() {
    if (!Store.getState().settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = 880; o.type = "sine";
      g.gain.value = 0.12;
      o.start();
      o.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
  }

  // ===== 番茄钟 =====
  const pomo = { running: false, mode: "work", remain: 25 * 60, timer: null, taskId: null };
  $("pomodoro-btn").addEventListener("click", () => $("pomodoro-panel").classList.toggle("hidden"));
  $("pomodoro-close").addEventListener("click", () => $("pomodoro-panel").classList.add("hidden"));
  $("pom-work").innerHTML = [15, 20, 25, 30, 45, 50, 60].map((n) => `<option value="${n}" ${n === 25 ? "selected" : ""}>${n}</option>`).join("");
  $("pom-break").innerHTML = [3, 5, 10, 15].map((n) => `<option value="${n}" ${n === 5 ? "selected" : ""}>${n}</option>`).join("");

  function pomoRemain() {
    const work = parseInt($("pom-work").value, 10) || 25;
    const brk = parseInt($("pom-break").value, 10) || 5;
    return pomo.mode === "work" ? work * 60 : brk * 60;
  }
  function renderPomo() {
    const m = Math.floor(pomo.remain / 60), s = pomo.remain % 60;
    $("pomodoro-time").textContent = U.pad(m) + ":" + U.pad(s);
    $("pomodoro-mode").textContent = pomo.mode === "work" ? "🍅 工作" : "☕ 休息";
    $("pomodoro-start").textContent = pomo.running ? "暂停" : "开始";
  }
  $("pomodoro-start").addEventListener("click", () => {
    if (pomo.running) { clearInterval(pomo.timer); pomo.running = false; renderPomo(); return; }
    if (pomo.remain <= 0) pomo.remain = pomoRemain();
    pomo.running = true;
    pomo.taskId = $("pomodoro-task").value || null;
    pomo.timer = setInterval(() => {
      pomo.remain--;
      renderPomo();
      if (pomo.remain <= 0) {
        clearInterval(pomo.timer);
        pomo.running = false;
        onPomoComplete();
      }
    }, 1000);
    renderPomo();
  });
  $("pomodoro-reset").addEventListener("click", () => {
    clearInterval(pomo.timer); pomo.running = false; pomo.remain = pomoRemain(); renderPomo();
  });
  $("pomodoro-skip").addEventListener("click", () => {
    clearInterval(pomo.timer); pomo.running = false; onPomoComplete();
  });
  $("pom-work").addEventListener("change", () => { if (!pomo.running) { pomo.remain = pomoRemain(); renderPomo(); } });
  $("pom-break").addEventListener("change", () => { if (!pomo.running) { pomo.remain = pomoRemain(); renderPomo(); } });

  function onPomoComplete() {
    playSound();
    if (pomo.mode === "work") {
      // 记录专注
      const log = Render.focusLog();
      const iso = U.todayISO();
      log[iso] = (log[iso] || 0) + (pomoRemain() / 60);
      localStorage.setItem("tasklist_focuslog", JSON.stringify(log));
      if (pomo.taskId) {
        const t = Store.getTask(pomo.taskId);
        if (t) {
          Store.updateTask(pomo.taskId, {
            pomodoroCount: (t.pomodoroCount || 0) + 1,
            focusSeconds: (t.focusSeconds || 0) + pomoRemain(),
          });
        }
      }
      Render.toast("🍅 完成一个番茄!休息一下~", "ok");
      notifySystem("番茄钟", "工作结束,休息一下吧");
      pomo.mode = "break";
    } else {
      Render.toast("☕ 休息结束,继续加油!", "ok");
      notifySystem("番茄钟", "休息结束");
      pomo.mode = "work";
    }
    pomo.remain = pomoRemain();
    renderPomo();
    updatePomoToday();
  }
  function updatePomoToday() {
    const log = Render.focusLog();
    let min = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); min += log[U.fmtDateISO(d)] || 0; }
    $("pomodoro-today").textContent = U.fmtMin(min * 60) + " 分";
    const st = Store.getState();
    $("pomodoro-count").textContent = st.tasks.reduce((s, t) => s + (t.pomodoroCount || 0), 0);
  }
  pomo.remain = pomoRemain();
  renderPomo();
  updatePomoToday();

  // ===== PWA:注册 Service Worker =====
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // ===== 同步(纯本地:不启用) =====
  if (Sync.configured()) { Sync.startAutoSync(); }

  // ===== 密码弹窗 =====
  function openPasswordModal() {
    $("pw-current").value = "";
    $("pw-new").value = "";
    $("pw-confirm").value = "";
    $("pw-error").classList.add("hidden");
    Render.showModal("lock-modal");
  }
  function showPwError(msg) {
    $("pw-error").textContent = msg;
    $("pw-error").classList.remove("hidden");
  }
  function bindPasswordModal() {
    $("pw-save").addEventListener("click", async () => {
      const cur = $("pw-current").value;
      const pw = $("pw-new").value;
      const confirm = $("pw-confirm").value;
      if (!pw || pw !== confirm) { showPwError("两次输入的新密码不一致"); return; }
      if (pw.length < 4) { showPwError("密码至少 4 位"); return; }
      if (!window.crypto || !window.crypto.subtle) { showPwError("当前环境不支持加密,请用 localhost 或 https 打开"); return; }
      if (Storage.hasVault() || Storage.isEncrypted()) {
        if (!cur) { showPwError("请输入当前密码"); return; }
        try { await Storage.decryptVault(cur); } catch (e) { showPwError("当前密码错误"); return; }
      }
      try {
        await Storage.enableEncryption(JSON.stringify(Store.getState()), pw);
        Render.closeModal("lock-modal");
        Render.toast("已开启数据加密", "ok");
      } catch (e) { showPwError("加密失败:" + e.message); }
    });
    $("pw-remove").addEventListener("click", () => {
      if (!Storage.hasVault() && !Storage.isEncrypted()) { Render.toast("尚未设置密码", "info"); return; }
      if (!confirm("确定取消密码吗?数据将恢复为明文存储。")) return;
      Storage.disableEncryption(Store.getState());
      Render.closeModal("lock-modal");
      Render.toast("已取消密码", "info");
    });
  }

  // ===== 锁屏 =====
  function showLockError(msg) {
    $("lock-error").textContent = msg;
    $("lock-error").classList.remove("hidden");
  }
  function bindLockScreen() {
    $("lock-unlock").addEventListener("click", async () => {
      const pw = $("lock-password").value;
      if (!pw) { showLockError("请输入密码"); return; }
      try {
        const json = await Storage.decryptVault(pw);
        const state = JSON.parse(json);
        Storage.setSessionPassword(pw);
        Store.init(state);
        $("lock-screen").classList.add("hidden");
        $("lock-password").value = "";
        Render.renderAll();
      } catch (e) {
        showLockError("密码错误,请重试");
      }
    });
    $("lock-password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("lock-unlock").click(); });
    $("lock-reset").addEventListener("click", () => {
      if (!confirm("确定清空所有数据并重新开始吗?此操作不可恢复。")) return;
      Storage.clearAll();
      location.reload();
    });
  }

  // ===== 密码入口 + 启动 =====
  $("pw-btn").addEventListener("click", openPasswordModal);
  $("lang-btn").addEventListener("click", () => {
    const cur = Store.getState().settings.lang || "zh";
    Store.setSettings({ lang: cur === "zh" ? "en" : "zh" });
  });
  bindPasswordModal();

  if (Storage.hasVault()) {
    $("lock-screen").classList.remove("hidden");
    bindLockScreen();
  }
})();
