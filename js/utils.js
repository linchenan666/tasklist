// ===== 工具函数库 =====
window.U = (function () {
  const pad = (n) => String(n).padStart(2, "0");

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function now() { return new Date().toISOString(); }

  function todayISO() { return fmtDateISO(new Date()); }

  function fmtDateISO(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function parseDate(str) {
    // 'YYYY-MM-DD' -> Date (local midnight)
    if (!str) return null;
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function taskDueAt(task) {
    if (!task.dueDate) return null;
    const base = parseDate(task.dueDate);
    if (task.dueTime) {
      const [h, m] = task.dueTime.split(":").map(Number);
      base.setHours(h || 0, m || 0, 0, 0);
    } else {
      base.setHours(23, 59, 59, 0);
    }
    return base;
  }

  function taskOverdue(task) {
    if (task.status === "done" || task.deletedAt) return false;
    const due = taskDueAt(task);
    if (!due) return false;
    return due.getTime() < Date.now();
  }

  // 距离截止的友好文案
  function dueText(task) {
    if (!task.dueDate) return "";
    const today = todayISO();
    const diff = dayDiff(today, task.dueDate); // due - today
    let label = fmtShort(task.dueDate);
    if (task.dueTime) label += " " + task.dueTime;
    if (diff === 0) return label + " · 今天";
    if (diff === 1) return label + " · 明天";
    if (diff === -1) return label + " · 昨天";
    if (diff > 1) return label + " · 还有 " + diff + " 天";
    if (diff < -1) return label + " · 已逾期 " + (-diff) + " 天";
    return label;
  }

  function dayDiff(a, b) {
    const da = parseDate(a), db = parseDate(b);
    return Math.round((db - da) / 86400000);
  }

  function fmtShort(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return m + "月" + d + "日";
  }

  function fmtFull(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return y + "年" + m + "月" + d + "日";
  }

  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function fmtMin(sec) {
    return Math.round((sec || 0) / 60);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments, ctx = this;
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  // ===== 常量 =====
  const PRIORITIES = [
    { v: "high", label: "高", icon: "🔴" },
    { v: "medium", label: "中", icon: "🟡" },
    { v: "low", label: "低", icon: "🔵" },
    { v: "none", label: "无", icon: "⚪" },
  ];
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
  const STATUSES = [
    { v: "todo", label: "待办" },
    { v: "in_progress", label: "进行中" },
    { v: "done", label: "完成" },
  ];
  const REPEAT_OPTIONS = [
    { v: "", label: "不重复" },
    { v: "daily", label: "每天" },
    { v: "weekdays", label: "工作日" },
    { v: "weekly", label: "每周" },
    { v: "monthly", label: "每月" },
    { v: "yearly", label: "每年" },
    { v: "custom_days", label: "每 N 天" },
    { v: "custom_weeks", label: "每 N 周" },
    { v: "custom_months", label: "每 N 月" },
  ];
  const REMINDER_OPTIONS = [
    { v: "none", label: "不提醒" },
    { v: "0", label: "准时提醒" },
    { v: "5", label: "提前 5 分钟" },
    { v: "15", label: "提前 15 分钟" },
    { v: "30", label: "提前 30 分钟" },
    { v: "60", label: "提前 1 小时" },
    { v: "1440", label: "提前 1 天" },
  ];
  const LIST_COLORS = ["#4f46e5", "#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ec4899", "#64748b", "#14b8a6", "#f97316"];

  // ===== 自然语言解析 =====
  function parseNatural(input) {
    const res = { title: "", tags: [], listName: null, priority: null, dueDate: null, dueTime: null };
    let s = String(input || "").trim();
    if (!s) return res;

    // #标签
    s = s.replace(/#([\p{L}\p{N}_-]+)/gu, (m, t) => { res.tags.push(t); return " "; });
    // @清单
    s = s.replace(/@([\p{L}\p{N}_-]+)/gu, (m, l) => { res.listName = l; return " "; });
    // !优先级
    s = s.replace(/![ ]*(高|中|低|high|medium|low|p1|p2|p3|1|2|3)/gi, (m, p) => {
      p = String(p).toLowerCase();
      if (["高", "high", "p1", "1"].includes(p)) res.priority = "high";
      else if (["中", "medium", "p2", "2"].includes(p)) res.priority = "medium";
      else if (["低", "low", "p3", "3"].includes(p)) res.priority = "low";
      return " ";
    });

    // 时间
    const tm = matchTime(s);
    if (tm) { res.dueTime = tm.time; s = s.replace(tm.raw, " "); }
    // 日期
    const dm = matchDate(s);
    if (dm) { res.dueDate = fmtDateISO(dm.date); s = s.replace(dm.raw, " "); }

    res.title = s.replace(/\s+/g, " ").trim();
    return res;
  }

  function matchTime(s) {
    let m = s.match(/([01]?\d|2[0-3]):([0-5]\d)/);
    if (m) return { raw: m[0], time: pad(parseInt(m[1])) + ":" + m[2] };
    m = s.match(/(上午|早上|早晨|中午|下午|傍晚|晚上|夜里|凌晨)?\s*(\d{1,2})\s*[点时]\s*(半|[0-5]?\d\s*分?)?/);
    if (m) {
      let h = parseInt(m[2], 10);
      const period = m[1] || "";
      let min = 0;
      if (m[3]) {
        if (m[3].includes("半")) min = 30;
        else { const mm = m[3].match(/\d+/); if (mm) min = parseInt(mm[0], 10); }
      }
      if (/下午|晚上|傍晚|夜里/.test(period)) { if (h < 12) h += 12; }
      else if (/凌晨/.test(period)) { if (h === 12) h = 0; }
      else if (/上午|早上|早晨/.test(period)) { if (h === 12) h = 0; }
      if (h > 23) h = 23;
      return { raw: m[0], time: pad(h) + ":" + pad(min) };
    }
    return null;
  }

  function matchDate(s) {
    const t = startOfToday();
    const rel = [["大后天", 3], ["后天", 2], ["明天", 1], ["今天", 0]];
    for (const [w, n] of rel) {
      if (s.includes(w)) return { raw: w, date: addDays(t, n) };
    }
    let m = s.match(/(\d{1,3})\s*天[后内]/);
    if (m) return { raw: m[0], date: addDays(t, parseInt(m[1], 10)) };
    m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (m) {
      const mm = parseInt(m[1], 10), dd = parseInt(m[2], 10);
      let y = t.getFullYear();
      let d = new Date(y, mm - 1, dd);
      if (d.getTime() < t.getTime() - 86400000) d = new Date(y + 1, mm - 1, dd);
      return { raw: m[0], date: d };
    }
    m = s.match(/(下+)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
    if (m) {
      const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
      const wd = map[m[2]];
      let offset = (wd - t.getDay() + 7) % 7;
      let d = addDays(t, offset);
      if (m[1]) d = addDays(d, 7 * m[1].length);
      return { raw: m[0], date: d };
    }
    return null;
  }

  // ===== 智能清单匹配 =====
  function matchesSmartList(task, cond) {
    if (!cond) return true;
    if (cond.status && task.status !== cond.status) return false;
    if (cond.priority && task.priority !== cond.priority) return false;
    if (cond.tag && !(task.tags || []).includes(cond.tag)) return false;
    if (cond.listId && task.listId !== cond.listId) return false;
    if (cond.due) {
      const today = todayISO();
      if (cond.due === "today" && task.dueDate !== today) return false;
      if (cond.due === "week") {
        if (!task.dueDate) return false;
        const diff = dayDiff(today, task.dueDate);
        if (diff < 0 || diff > 7) return false;
      }
      if (cond.due === "overdue" && !taskOverdue(task)) return false;
      if (cond.due === "none" && task.dueDate) return false;
    }
    return true;
  }

  // ===== 排序 =====
  function sortTasks(tasks, sortBy) {
    const arr = tasks.slice();
    const pri = (t) => PRIORITY_ORDER[t.priority] ?? 3;
    if (sortBy === "due") {
      arr.sort((a, b) => {
        const da = a.dueDate || "9999", db = b.dueDate || "9999";
        return da === db ? pri(a) - pri(b) : (da < db ? -1 : 1);
      });
    } else if (sortBy === "priority") {
      arr.sort((a, b) => pri(a) - pri(b) || (a.order - b.order));
    } else if (sortBy === "created") {
      arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    } else if (sortBy === "title") {
      arr.sort((a, b) => a.title.localeCompare(b.title, "zh"));
    } else {
      // order
      arr.sort((a, b) => a.order - b.order);
    }
    return arr;
  }

  // 后续日期(重复任务)
  function nextRepeatDate(repeat, fromDate) {
    if (!repeat || !repeat.type) return null;
    const base = parseDate(fromDate) || startOfToday();
    const d = new Date(base);
    if (repeat.type === "daily") d.setDate(d.getDate() + (repeat.interval || 1));
    else if (repeat.type === "weekdays") {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    }
    else if (repeat.type === "weekly") d.setDate(d.getDate() + 7 * (repeat.interval || 1));
    else if (repeat.type === "monthly") d.setMonth(d.getMonth() + (repeat.interval || 1));
    else if (repeat.type === "yearly") d.setFullYear(d.getFullYear() + (repeat.interval || 1));
    else if (repeat.type === "custom") d.setDate(d.getDate() + (repeat.interval || 1));
    else return null;
    return fmtDateISO(d);
  }

  return {
    pad, uid, now, todayISO, fmtDateISO, startOfToday, addDays, parseDate,
    taskDueAt, taskOverdue, dueText, dayDiff, fmtShort, fmtFull, fmtDateTime,
    fmtMin, escapeHtml, debounce,
    PRIORITIES, PRIORITY_ORDER, STATUSES, REPEAT_OPTIONS, REMINDER_OPTIONS, LIST_COLORS,
    parseNatural, matchesSmartList, sortTasks, nextRepeatDate,
  };
})();

// ===== 国际化(i18n) =====
window.I18N = {
  zh: {
    appTitle: "任务清单", quickAddPh: "快速添加: 明天下午3点买牛奶 #购物 !高",
    myday: "我的今天", today: "今天", upcoming: "即将到期", overdue: "已逾期",
    inbox: "收件箱", completed: "已完成", logbook: "日志", all: "全部",
    matrix: "四象限", archive: "归档", trash: "回收站",
    lists: "清单", smartLists: "智能清单",
    search: "搜索任务…", filter: "筛选", batch: "多选", pomodoro: "番茄钟",
    export: "导出", import: "导入", stats: "统计", password: "数据加密", language: "EN",
    todo: "待办", inProgress: "进行中", done: "完成",
    emptyAll: "没有任务 🎉", emptyTrash: "回收站是空的", emptyArchive: "还没有归档的任务", emptyLogbook: "还没有完成记录",
    newTask: "新建任务", save: "保存", cancel: "取消", delete: "删除",
  },
  en: {
    appTitle: "Task List", quickAddPh: "Quick add: buy milk tomorrow 3pm #shopping !high",
    myday: "My Day", today: "Today", upcoming: "Upcoming", overdue: "Overdue",
    inbox: "Inbox", completed: "Completed", logbook: "Logbook", all: "All",
    matrix: "Matrix", archive: "Archive", trash: "Trash",
    lists: "Lists", smartLists: "Smart Lists",
    search: "Search tasks…", filter: "Filter", batch: "Select", pomodoro: "Pomodoro",
    export: "Export", import: "Import", stats: "Stats", password: "Encrypt", language: "中文",
    todo: "To Do", inProgress: "In Progress", done: "Done",
    emptyAll: "No tasks 🎉", emptyTrash: "Trash is empty", emptyArchive: "No archived tasks", emptyLogbook: "No completed tasks yet",
    newTask: "New Task", save: "Save", cancel: "Cancel", delete: "Delete",
  },
};

window.t = function (key) {
  let lang = "zh";
  try { lang = (window.Store && Store.getState() && Store.getState().settings.lang) || "zh"; } catch (e) {}
  return (window.I18N[lang] && window.I18N[lang][key]) || window.I18N.zh[key] || key;
};

window.applyStaticI18n = function () {
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = window.t(el.getAttribute("data-i18n")); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = window.t(el.getAttribute("data-i18n-ph")); });
};
