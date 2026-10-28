/* ============================================================
   TaskTick — логика приложения и рендер
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Короткие утилиты ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  function timeToMinutes(t) {
    if (!t) return null;
    var p = String(t).split(":");
    if (p.length < 2) return null;
    return (+p[0]) * 60 + (+p[1]);
  }
  function minutesToTime(m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
  }
  function nowMinutes() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var Icons = window.Icons;
  var Store = window.Store;

  var LIST_COLORS = ["#4772fa", "#f5a623", "#3bb96f", "#e5484d", "#7c5cff", "#2e7cf6", "#12b5b0", "#f0785a", "#3a9d4c", "#8a5cf6"];
  var HABIT_EMOJIS = ["🎯", "📚", "🏃", "💧", "🧘", "😴", "🥗", "✍️", "🎸", "💪", "🚭", "🧹"];

  var PRIORITIES = {
    0: { label: "Нет", color: "var(--text-3)" },
    1: { label: "Низкий", color: "#2e7cf6" },
    2: { label: "Средний", color: "#f5a623" },
    3: { label: "Высокий", color: "#e5484d" }
  };

  var REMIND_OPTIONS = [
    { value: null, label: "Не напоминать" },
    { value: 0, label: "В момент наступления" },
    { value: 5, label: "За 5 минут" },
    { value: 15, label: "За 15 минут" },
    { value: 30, label: "За 30 минут" },
    { value: 60, label: "За 1 час" },
    { value: 120, label: "За 2 часа" },
    { value: 1440, label: "За 1 день" }
  ];

  var BOARD_COLUMNS = [
    { key: "todo", title: "К выполнению", color: "#9aa1ad" },
    { key: "doing", title: "В работе", color: "#f5a623" },
    { key: "done", title: "Готово", color: "#3bb96f" }
  ];

  /* ---------- Состояние ---------- */
  var state = {
    view: "today",
    listId: null,
    tagId: null,
    habitId: null,
    selectedTaskId: null,
    search: "",
    calView: "month",
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    miniY: new Date().getFullYear(),
    miniM: new Date().getMonth(),
    habitWeekStart: null,
    lastNavKey: null,
    renderLimit: 150,
    daySheet: false,
    selectedDay: null,
    quickDate: null,
    quickPriority: 0,
    dragId: null,
    dragOverId: null,
    selectMode: false,
    selected: {},
    reminderTimer: null,
    lastNotified: {},
    timer: { duration: 25 * 60, remaining: 25 * 60, running: false, interval: null, focus: true }
  };

  function isBoardMode() {
    var s = Store.getSettings();
    return s.viewMode === "board" && state.view !== "calendar" && state.view !== "habits" && state.view !== "focus";
  }
  function isSelected(id) { return !!state.selected[id]; }
  function selectedIds() { return Object.keys(state.selected).filter(function (k) { return state.selected[k]; }); }
  function clearSelection() { state.selected = {}; }

  // подавление «случайного» клика сразу после тач-перетаскивания
  var suppressClickUntil = 0;
  var suppressNextClick = false;


  /* ---------- Тема ---------- */
  function applyTheme() {
    var theme = Store.getSettings().theme || "light";
    document.documentElement.setAttribute("data-theme", theme);
    var icon = $("#theme-icon");
    if (icon) icon.innerHTML = theme === "dark" ? Icons.sun() : Icons.moon();
    var label = $("#theme-label");
    if (label) label.textContent = theme === "dark" ? "Светлая тема" : "Тёмная тема";
  }

  /* ============================================================
     Маршрутизация и фильтрация
     ============================================================ */
  function parseHash(explicit) {
    var raw;
    if (explicit != null) raw = explicit;
    else { try { raw = location.hash || "#today"; } catch (e) { raw = "#today"; } }
    var h = String(raw).replace(/^#\/?/, "");
    var parts = h.split("/");
    state.listId = null; state.tagId = null; state.habitId = null;
    if (parts[0] === "list" && parts[1]) { state.view = "list"; state.listId = parts[1]; }
    else if (parts[0] === "tag" && parts[1]) { state.view = "tag"; state.tagId = parts[1]; }
    else if (parts[0] === "habit") { state.view = "habits"; state.habitId = parts[1] || null; }
    else { state.view = parts[0] || "today"; }
    state.search = "";
    state.selectMode = false;
    state.habitWeekStart = null;
    state.renderLimit = 150;
    state.daySheet = false;
    clearSelection();
    var si = $("#search-input");
    if (si) si.value = "";
  }

  // Навигация без опоры на hashchange: работает и в sandbox/iframe
  function navigate(hash) {
    state.lastNavKey = hash;
    parseHash(hash);
    closeDetail();
    $("#sidebar").classList.remove("open");
    $("#sidebar-backdrop").classList.remove("show");
    renderAll();
    try {
      if (location.hash !== hash) location.hash = hash;
    } catch (e) { /* URL недоступен — навигация всё равно уже произошла */ }
    // прокрутить активную панель наверх
    try {
      $$(".task-pane, .calendar-pane, .habits-pane, .focus-pane").forEach(function (p) { p.scrollTop = 0; });
    } catch (e) { /* ignore */ }
  }

  function diffDays(a, b) {
    var d1 = Store.parseDateStr(a), d2 = Store.parseDateStr(b);
    if (!d1 || !d2) return 0;
    return Math.round((d2 - d1) / 86400000);
  }

  function filterTasks(includeCompleted) {
    var all = Store.getTasks();
    var t = Store.todayStr();
    var tm = Store.addDaysStr(t, 1);
    var t7 = Store.addDaysStr(t, 6);
    var q = state.search.trim().toLowerCase();

    return all.filter(function (task) {
      if (q) {
        var hay = ((task.title || "") + " " + (task.description || "") + " " + (task.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
        return true;
      }
      var v = state.view;
      // «vis» — учитывать ли завершённые (нужно для колонки «Готово» на доске)
      var vis = !task.completed || !!includeCompleted;
      if (v === "today") return !task.completed && task.dueDate && task.dueDate <= t;
      if (v === "tomorrow") return !task.completed && task.dueDate && (task.dueDate === tm || task.dueDate < t);
      if (v === "next7") return !task.completed && task.dueDate && task.dueDate >= t && task.dueDate <= t7;
      if (v === "inbox") return vis && !task.listId;
      if (v === "all") return vis;
      if (v === "completed") return task.completed;
      if (v === "list") return vis && task.listId === state.listId;
      if (v === "tag") return vis && (task.tags || []).indexOf(state.tagId) !== -1;
      return false;
    });
  }

  function sortTasks(list) {
    var sort = Store.getSettings().sort || "smart";
    var arr = list.slice();
    arr.sort(function (a, b) {
      if (sort === "manual") return (a.order || 0) - (b.order || 0);
      if (sort === "title") return (a.title || "").localeCompare(b.title || "", "ru");
      var da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      var db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (sort === "priority") {
        var p = (b.priority || 0) - (a.priority || 0);
        if (p !== 0) return p;
        if (da !== db) return da - db;
        return (a.order || 0) - (b.order || 0);
      }
      if (sort === "date") {
        if (da !== db) return da - db;
        return (a.order || 0) - (b.order || 0);
      }
      // smart
      if (da !== db) return da - db;
      var pp = (b.priority || 0) - (a.priority || 0);
      if (pp !== 0) return pp;
      return (a.order || 0) - (b.order || 0);
    });
    return arr;
  }

  function groupTasks(tasks) {
    var t = Store.todayStr();
    var tm = Store.addDaysStr(t, 1);
    var t7 = Store.addDaysStr(t, 7);
    var defs = [["overdue", "Просрочено"], ["today", "Сегодня"], ["tomorrow", "Завтра"], ["week", "Следующие 7 дней"], ["later", "Позже"], ["none", "Без даты"]];
    var map = {}; defs.forEach(function (o) { map[o[0]] = { key: o[0], title: o[1], tasks: [] }; });
    tasks.forEach(function (task) {
      var d = task.dueDate, k = "none";
      if (d) {
        if (d < t) k = "overdue";
        else if (d === t) k = "today";
        else if (d === tm) k = "tomorrow";
        else if (d <= t7) k = "week";
        else k = "later";
      }
      map[k].tasks.push(task);
    });
    var out = []; defs.forEach(function (o) { if (map[o[0]].tasks.length) out.push(map[o[0]]); });
    return out;
  }

  function groupNext7(tasks) {
    var t = Store.todayStr();
    var groups = [];
    for (var i = 0; i < 7; i++) {
      var d = Store.addDaysStr(t, i);
      groups.push({ key: "d" + i, date: d, title: i === 0 ? "Сегодня" : i === 1 ? "Завтра" : Store.formatDate(d), sub: i > 1 ? Store.weekdayShort(d) : "", tasks: [] });
    }
    var overdue = { key: "overdue", title: "Просрочено", sub: "", tasks: [] };
    var none = { key: "none", title: "Без даты", sub: "", tasks: [] };
    tasks.forEach(function (task) {
      var d = task.dueDate;
      if (!d) { none.tasks.push(task); return; }
      if (d < t) { overdue.tasks.push(task); return; }
      var idx = diffDays(t, d);
      if (idx >= 0 && idx < 7) groups[idx].tasks.push(task);
    });
    var out = [];
    if (overdue.tasks.length) out.push(overdue);
    groups.forEach(function (g) { if (g.tasks.length) out.push(g); });
    if (none.tasks.length) out.push(none);
    return out;
  }

  function viewTitle() {
    var v = state.view;
    if (v === "today") return "Сегодня";
    if (v === "tomorrow") return "Завтра";
    if (v === "next7") return "Следующие 7 дней";
    if (v === "calendar") return "Календарь";
    if (v === "inbox") return "Входящие";
    if (v === "all") return "Все задачи";
    if (v === "completed") return "Завершённые";
    if (v === "focus") return "Фокус";
    if (v === "habits") return "Привычки";
    if (v === "list") { var l = Store.getList(state.listId); return l ? l.name : "Список"; }
    if (v === "tag") { var tg = Store.getTag(state.tagId); return tg ? "#" + tg.name : "Тег"; }
    return "TaskTick";
  }

  /* ============================================================
     Рендер сайдбара
     ============================================================ */
  function renderSidebar() {
    var t = Store.todayStr();
    var tm = Store.addDaysStr(t, 1);
    var t7 = Store.addDaysStr(t, 6);
    var counts = { today: 0, tomorrow: 0, next7: 0, inbox: 0 };
    Store.getTasks().forEach(function (task) {
      if (task.completed) return;
      var d = task.dueDate;
      if (d && d <= t) counts.today++;
      if (d && (d === tm || d < t)) counts.tomorrow++;
      if (d && d >= t && d <= t7) counts.next7++;
      if (!task.listId) counts.inbox++;
    });
    ["today", "tomorrow", "next7", "inbox"].forEach(function (k) {
      var el = $('[data-count="' + k + '"]');
      if (el) { el.textContent = counts[k] || ""; el.style.display = counts[k] ? "" : "none"; }
    });

    // Активное состояние в сайдбаре
    $$(".nav-item[data-view]").forEach(function (el) {
      var v = el.getAttribute("data-view");
      var active = v === state.view && (v !== "list" && v !== "tag");
      el.classList.toggle("is-active", active);
    });

    // Списки
    var lc = $("#lists-container");
    lc.innerHTML = Store.getLists().map(function (l) {
      var active = state.view === "list" && state.listId === l.id;
      return '<li><a class="nav-item' + (active ? " is-active" : "") + '" data-drop-list="' + l.id + '" href="#list/' + encodeURIComponent(l.id) + '">' +
        '<span class="list-dot" style="--c:' + esc(l.color) + '"></span>' +
        '<span class="nav-label">' + esc(l.name) + '</span></a></li>';
    }).join("");

    // Теги
    var tc = $("#tags-container");
    tc.innerHTML = Store.getTags().map(function (g) {
      var active = state.view === "tag" && state.tagId === g.id;
      return '<li><a class="nav-item' + (active ? " is-active" : "") + '" data-drop-tag="' + g.id + '" href="#tag/' + encodeURIComponent(g.id) + '">' +
        '<span class="tag-dot" style="--c:' + esc(g.color) + '">#</span>' +
        '<span class="nav-label">' + esc(g.name) + '</span></a></li>';
    }).join("");

    // Привычки в сайдбаре
    var hn = $("#habits-nav");
    var habits = Store.getHabits();
    hn.innerHTML = habits.length
      ? habits.map(function (h) {
        return '<li><a class="nav-item' + (state.view === "habits" && state.habitId === h.id ? " is-active" : "") + '" href="#habit/' + encodeURIComponent(h.id) + '">' +
          '<span class="tag-dot">' + esc(h.emoji || "🎯") + '</span>' +
          '<span class="nav-label">' + esc(h.name) + '</span>' +
          '<span class="nav-count">' + Store.habitStreak(h) + '🔥</span></a></li>';
      }).join("")
      : '<li class="nav-item" style="opacity:.6;cursor:default"><span class="tag-dot">—</span><span class="nav-label">Пока нет привычек</span></li>';

    renderMiniCal();
  }

  /* Мини-календарь в сайдбаре: клик — переход, перетаскивание — смена даты */
  function renderMiniCal() {
    var el = $("#mini-cal");
    if (!el) return;
    var y = state.miniY, m = state.miniM;
    var first = new Date(y, m, 1);
    var startOffset = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var today = Store.todayStr();
    var marked = {}, overdue = {};
    Store.getTasks().forEach(function (t) {
      if (!t.dueDate || t.completed) return;
      marked[t.dueDate] = true;
      if (t.dueDate < today) overdue[t.dueDate] = true;
    });

    var html = '<div class="mini-cal-head">' +
      '<button class="icon-btn" data-mini="-1" aria-label="Предыдущий месяц">' + Icons.chevronLeft(16) + '</button>' +
      '<span class="mini-cal-title">' + first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) + '</span>' +
      '<button class="icon-btn" data-mini="1" aria-label="Следующий месяц">' + Icons.chevron(16) + '</button>' +
      '</div><div class="mini-cal-grid">';
    html += Store.WEEKDAYS.map(function (w) { return '<span class="mini-cal-dow">' + w[0] + '</span>'; }).join("");
    for (var i = 0; i < startOffset; i++) html += '<span></span>';
    for (var d = 1; d <= days; d++) {
      var ds = y + "-" + pad2(m + 1) + "-" + pad2(d);
      html += '<button type="button" class="mini-cal-day' + (ds === today ? " today" : "") +
        (marked[ds] ? " has-tasks" : "") + (overdue[ds] ? " has-overdue" : "") +
        '" data-drop-day="' + ds + '" data-mini-day="' + ds + '" title="' + ds + '">' + d + '</button>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  /* ============================================================
     Рендер списка задач
     ============================================================ */
  function taskMetaHtml(task, compact) {
    var chips = [];
    var t = Store.todayStr();
    if (task.dueDate && !compact) {
      var cls = "date";
      if (!task.completed && task.dueDate < t) cls += " overdue";
      else if (!task.completed && task.dueDate === t) cls += " today";
      chips.push('<span class="meta-chip ' + cls + '">' + Icons.calendar(13) + " " + esc(Store.formatDate(task.dueDate)) + '</span>');
    }
    if (task.time) chips.push('<span class="meta-chip">' + Icons.clock(13) + " " + esc(task.time) + '</span>');
    if (task.repeat) chips.push('<span class="meta-chip">' + Icons.repeat(13) + " " + esc(task.repeat) + '</span>');
    if (task.remind != null) chips.push('<span class="meta-chip">' + Icons.bell(13) + '</span>');
    var list = task.listId ? Store.getList(task.listId) : null;
    if (list && state.view !== "list" && !compact) chips.push('<span class="meta-chip"><span style="width:8px;height:8px;border-radius:2px;background:' + esc(list.color) + ';display:inline-block"></span> ' + esc(list.name) + '</span>');
    (task.tags || []).forEach(function (tgid) {
      var g = Store.getTag(tgid);
      if (g) chips.push('<span class="meta-chip meta-tag" style="color:' + esc(g.color) + '">' + esc(g.name) + '</span>');
    });
    if (task.priority) chips.push('<span class="meta-chip" style="color:' + PRIORITIES[task.priority].color + '">' + Icons.flag(13) + " " + PRIORITIES[task.priority].label + '</span>');
    if (task.subtasks && task.subtasks.length) {
      var done = task.subtasks.filter(function (s) { return s.completed; }).length;
      chips.push('<span class="subtask-count">' + Icons.subtask(13) + " " + done + "/" + task.subtasks.length + '</span>');
    }
    return chips.join("");
  }

  function taskItemHtml(task) {
    var pr = PRIORITIES[task.priority || 0];
    var sel = state.selectMode;
    var on = isSelected(task.id);
    var cls = "task" + (task.completed ? " done" : "") + (on ? " selected" : "") + (task.color ? " has-color" : "");
    var st = task.color ? ' style="--tc:' + esc(task.color) + '"' : "";
    return '<div class="' + cls + '" data-id="' + task.id + '" draggable="true"' + st + '>' +
      (sel
        ? '<span class="task-select' + (on ? " on" : "") + '" data-action="select">' + (on ? Icons.check(12) : "") + '</span>'
        : '<span class="task-drag-handle" data-action="drag" title="Перетащить">' + Icons.drag(16) + '</span>') +
      '<button class="task-check" data-action="check" aria-label="Выполнено">' + Icons.check(13) + '</button>' +
      '<div class="task-body" data-action="open">' +
        '<div class="task-title">' + esc(task.title) + '</div>' +
        '<div class="task-meta">' + taskMetaHtml(task) + '</div>' +
      '</div>' +
      '<span class="prio-flag prio-' + (task.priority || 0) + '" title="' + pr.label + '"></span>' +
    '</div>';
  }

  function setEmpty(emoji, title, sub) {
    $("#empty-emoji").textContent = emoji;
    $("#empty-title").textContent = title;
    $("#empty-sub").textContent = sub;
  }

  function renderTaskList() {
    var listEl = $("#task-list");
    var boardEl = $("#board");
    var emptyEl = $("#empty-state");

    if (isBoardMode()) {
      var bTasks = sortTasks(filterTasks(true));
      listEl.classList.add("hidden");
      if (!bTasks.length) {
        boardEl.classList.add("hidden");
        emptyEl.classList.remove("hidden");
        setEmpty("📋", "Нет задач", "Добавьте задачу ниже и перетащите её между колонками.");
        return;
      }
      emptyEl.classList.add("hidden");
      boardEl.classList.remove("hidden");
      renderBoard(bTasks);
      return;
    }

    var sorted = sortTasks(filterTasks());
    var totalAll = sorted.length;
    var limit = state.renderLimit || 150;
    var tasks = sorted.slice(0, limit);
    boardEl.classList.add("hidden");
    listEl.classList.remove("hidden");

    if (!tasks.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      var v = state.view;
      if (v === "completed") setEmpty("📭", "Нет завершённых задач", "Выполненные задачи появятся здесь.");
      else if (v === "inbox") setEmpty("📥", "Входящие пусты", "Задачи без списка появятся здесь.");
      else if (state.search) setEmpty("🔍", "Ничего не найдено", "Попробуйте другой запрос.");
      else setEmpty("🎉", "Всё выполнено", "Отличная работа! Добавьте новую задачу ниже.");
      return;
    }
    emptyEl.classList.add("hidden");

    var groups;
    if (state.view === "next7") groups = groupNext7(tasks);
    else if (state.view === "completed") groups = [{ key: "done", title: "Завершённые", tasks: tasks }];
    else groups = groupTasks(tasks);

    var html = "";
    groups.forEach(function (g) {
      html += '<div class="task-group"><div class="task-group-title"><span>' + esc(g.title) + '</span>' +
        (g.sub ? '<span style="color:var(--text-3);font-weight:400">' + esc(g.sub) + '</span>' : "") +
        '<span class="count">' + g.tasks.length + '</span>' +
        (state.view === "completed" ? '<button class="btn btn-ghost" data-action="clear-completed" style="margin-left:auto;padding:4px 10px;font-size:12px">Очистить</button>' : "") +
        '</div>' +
        g.tasks.map(taskItemHtml).join("") + '</div>';
    });

    // порционная отрисовка: не создаём тысячи узлов сразу
    if (totalAll > limit) {
      var rest = totalAll - limit;
      html += '<div class="task-more"><button class="btn btn-ghost" data-action="more">' +
        'Показать ещё ' + Math.min(limit, rest) + ' (осталось ' + rest + ' из ' + totalAll + ')' +
        '</button></div>';
    }
    listEl.innerHTML = html;
  }

  /* ============================================================
     Kanban-доска
     ============================================================ */
  function renderBoard(tasks) {
    var boardEl = $("#board");
    boardEl.innerHTML = BOARD_COLUMNS.map(function (col) {
      var colTasks = tasks.filter(function (t) {
        if (col.key === "done") return t.completed;
        return !t.completed && (t.status || "todo") === col.key;
      });
      // в «Готово» показываем не больше 50 последних завершённых
      if (col.key === "done") {
        colTasks = colTasks.slice().sort(function (a, b) {
          return (b.completedAt || 0) - (a.completedAt || 0);
        }).slice(0, 50);
      }
      // ограничиваем число карточек в колонке, чтобы доска не тормозила
      var colTotal = colTasks.length;
      if (colTotal > 100) colTasks = colTasks.slice(0, 100);
      var cards = colTasks.map(function (t) {
        var list = t.listId ? Store.getList(t.listId) : null;
        var subDone = (t.subtasks || []).filter(function (s) { return s.completed; }).length;
        var bcCls = "board-card" + (t.completed ? " done" : "") + (t.color ? " has-color" : "");
        var bcSt = t.color ? ' style="--tc:' + esc(t.color) + '"' : "";
        return '<div class="' + bcCls + '" data-id="' + t.id + '" draggable="true"' + bcSt + '>' +
          '<div class="bc-title">' + esc(t.title) + '</div>' +
          '<div class="bc-meta">' +
            (t.priority ? '<span class="meta-chip" style="color:' + PRIORITIES[t.priority].color + '">' + Icons.flag(12) + '</span>' : "") +
            (t.dueDate ? '<span class="meta-chip">' + Icons.calendar(12) + " " + esc(Store.formatDate(t.dueDate)) + '</span>' : "") +
            (t.time ? '<span class="meta-chip">' + Icons.clock(12) + " " + esc(t.time) + '</span>' : "") +
            (list ? '<span class="meta-chip" title="' + esc(list.name) + '"><span style="width:8px;height:8px;border-radius:2px;background:' + esc(list.color) + ';display:inline-block"></span></span>' : "") +
            (t.subtasks && t.subtasks.length ? '<span class="subtask-count">' + Icons.subtask(12) + " " + subDone + "/" + t.subtasks.length + '</span>' : "") +
          '</div>' +
        '</div>';
      }).join("");
      return '<div class="board-col" data-col="' + col.key + '">' +
        '<div class="board-col-head"><span><span class="dot" style="background:' + col.color + '"></span>' + col.title + '</span>' +
        '<span class="board-col-count">' + colTotal + '</span></div>' +
        (cards || '<div class="board-empty">Перетащите задачу сюда</div>') +
        (colTotal > colTasks.length ? '<div class="board-empty">…и ещё ' + (colTotal - colTasks.length) + '</div>' : "") +
      '</div>';
    }).join("");
  }

  /* ============================================================
     Календарь: месяц / неделя / 3 дня / день
     ============================================================ */
  var MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  function calAnchor() { return state.selectedDay || Store.todayStr(); }

  function setCalAnchor(dateStr) {
    state.selectedDay = dateStr;
    var d = Store.parseDateStr(dateStr);
    if (d) { state.calYear = d.getFullYear(); state.calMonth = d.getMonth(); }
  }

  function tasksByDay() {
    var map = {};
    Store.getTasks().forEach(function (t) {
      if (!t.dueDate) return;
      (map[t.dueDate] = map[t.dueDate] || []).push(t);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        var am = a.time ? timeToMinutes(a.time) : -1;
        var bm = b.time ? timeToMinutes(b.time) : -1;
        if (am !== bm) return am - bm;
        return (b.priority || 0) - (a.priority || 0);
      });
    });
    return map;
  }

  function taskColor(t) {
    if (t.color) return t.color;
    if (t.completed) return "var(--done)";
    if (t.priority) return PRIORITIES[t.priority].color;
    var l = t.listId ? Store.getList(t.listId) : null;
    return l ? l.color : "var(--primary)";
  }

  function calChip(t, showTime) {
    return '<div class="cal-chip' + (t.completed ? " done" : "") + '" data-id="' + t.id + '" draggable="true" title="' + esc(t.title) + '" style="border-left-color:' + taskColor(t) + '">' +
      (showTime && t.time ? '<span class="cal-chip-time">' + esc(t.time) + '</span>' : "") + esc(t.title) + '</div>';
  }

  function daysRange(startStr, count) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(Store.addDaysStr(startStr, i));
    return out;
  }

  function rangeTitle(days) {
    var a = Store.parseDateStr(days[0]), b = Store.parseDateStr(days[days.length - 1]);
    var sameYear = a.getFullYear() === b.getFullYear();
    var thisYear = new Date().getFullYear();
    if (a.getMonth() === b.getMonth() && sameYear) {
      return a.getDate() + " – " + b.getDate() + " " + MONTHS_GEN[b.getMonth()] + (a.getFullYear() !== thisYear ? " " + a.getFullYear() : "");
    }
    return a.getDate() + " " + MONTHS_GEN[a.getMonth()] + (a.getFullYear() !== thisYear ? " " + a.getFullYear() : "") +
      " – " + b.getDate() + " " + MONTHS_GEN[b.getMonth()] + (b.getFullYear() !== thisYear ? " " + b.getFullYear() : "");
  }

  function monthHtml(byDay, today) {
    var y = state.calYear, m = state.calMonth;
    var first = new Date(y, m, 1);
    var startOffset = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var weeks = Math.ceil((startOffset + daysInMonth) / 7);
    // на телефоне ячейка ~46 px — текстовые чипы нечитаемы, показываем точки
    var compact = (window.innerWidth || 0) <= 520;
    var html = '<div class="cal-month" data-weeks="' + weeks + '">';
    html += Store.WEEKDAYS.map(function (w) { return '<div class="cal-weekday">' + w + '</div>'; }).join("");
    for (var i = 0; i < startOffset; i++) html += '<div class="cal-day other-month"></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = y + "-" + pad2(m + 1) + "-" + pad2(d);
      var dayTasks = byDay[ds] || [];
      var cls = "cal-day" + (ds === today ? " today" : "") + (state.selectedDay === ds ? " is-selected" : "");
      var eventsHtml = compact
        ? dayTasks.slice(0, 3).map(function (t) { return '<span class="cal-dot" style="background:' + taskColor(t) + '"></span>'; }).join("")
        : dayTasks.slice(0, 3).map(function (t) { return calChip(t, true); }).join("");
      html += '<div class="' + cls + '" data-day="' + ds + '" data-drop-day="' + ds + '">' +
        '<div class="cal-day-head"><span class="cal-day-num">' + d + '</span>' +
        '<button class="cal-day-add" data-action="day-add" data-day="' + ds + '" title="Добавить задачу">+</button></div>' +
        '<div class="cal-day-events">' + eventsHtml + '</div>' +
        (dayTasks.length > 3 ? '<div class="cal-more">+' + (dayTasks.length - 3) + '</div>' : "") +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function timeGridHtml(days, byDay, today) {
    var n = days.length;
    var head = '<div class="cal-tg-head"><div class="cal-tg-gutter"></div>' +
      days.map(function (ds) {
        var d = Store.parseDateStr(ds);
        return '<div class="cal-tg-dayhead' + (ds === today ? " today" : "") + (state.selectedDay === ds ? " is-selected" : "") + '" data-day="' + ds + '">' +
          '<div class="dow">' + Store.WEEKDAYS[(d.getDay() + 6) % 7] + '</div>' +
          '<div class="dnum">' + d.getDate() + '</div></div>';
      }).join("") + '</div>';

    var allday = '<div class="cal-tg-allday"><div class="cal-tg-gutter">Весь день</div>' +
      days.map(function (ds) {
        var list = (byDay[ds] || []).filter(function (t) { return !t.time; });
        return '<div class="cal-tg-allday-cell" data-drop-day="' + ds + '">' +
          list.map(function (t) { return calChip(t, false); }).join("") + '</div>';
      }).join("") + '</div>';

    var hours = '<div class="cal-tg-hours">';
    for (var h = 0; h < 24; h++) hours += '<div class="cal-tg-hour-label">' + pad2(h) + ":00</div>";
    hours += '</div>';

    var curMin = nowMinutes();
    var cols = days.map(function (ds) {
      var list = (byDay[ds] || []).filter(function (t) { return t.time; });
      var slots = "";
      for (var hh = 0; hh < 24; hh++) {
        var inSlot = list.filter(function (t) { return Math.floor(timeToMinutes(t.time) / 60) === hh; });
        var isNow = ds === today && Math.floor(curMin / 60) === hh;
        slots += '<div class="cal-tg-slot' + (isNow ? " now" : "") + '" data-drop-day="' + ds + '" data-drop-hour="' + hh + '">' +
          inSlot.map(function (t) { return calChip(t, false); }).join("") + '</div>';
      }
      return '<div class="cal-tg-col" data-drop-day="' + ds + '">' + slots + '</div>';
    }).join("");

    return '<div class="cal-timegrid days-' + n + '" style="--days:' + n + '">' + head + allday +
      '<div class="cal-tg-body">' + hours + cols + '</div></div>';
  }

  function renderCalendar() {
    var grid = $("#calendar-grid");
    var view = state.calView || "month";
    var byDay = tasksByDay();
    var today = Store.todayStr();

    // синхронизируем режимы (полноэкранный календарь + панель дня)
    document.body.classList.toggle("cal-mode", state.view === "calendar");
    document.body.classList.toggle("day-sheet", state.view === "calendar" && !!state.daySheet);

    $$("#cal-view-switch button, #side-cal-switch button").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-calview") === view);
    });

    if (view === "month") {
      var first = new Date(state.calYear, state.calMonth, 1);
      $("#cal-title").textContent = first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
      grid.innerHTML = monthHtml(byDay, today);
    } else {
      var anchor = calAnchor();
      var days;
      if (view === "week") days = daysRange(Store.toDateStr(Store.startOfWeek(Store.parseDateStr(anchor))), 7);
      else if (view === "3day") days = daysRange(anchor, 3);
      else days = daysRange(anchor, 1);

      if (view === "day") {
        var dd = Store.parseDateStr(days[0]);
        $("#cal-title").textContent = dd.getDate() + " " + MONTHS_GEN[dd.getMonth()] +
          (dd.getFullYear() !== new Date().getFullYear() ? " " + dd.getFullYear() : "") +
          ", " + dd.toLocaleDateString("ru-RU", { weekday: "long" });
      } else {
        var compactTitle = (window.innerWidth || 0) <= 520;
        $("#cal-title").textContent = (view === "week" && !compactTitle ? "Неделя · " : "") + rangeTitle(days);
      }
      grid.innerHTML = timeGridHtml(days, byDay, today);
    }

    renderCalendarDay();
  }

  function renderCalendarDay() {
    var ds = state.selectedDay;
    var titleEl = $("#calendar-day-title");
    var listEl = $("#calendar-day-list");
    if (!ds) {
      titleEl.textContent = "Выберите день";
      listEl.innerHTML = '<p class="muted">Кликните на дату, чтобы увидеть задачи.</p>';
      return;
    }
    titleEl.textContent = Store.formatDate(ds) + " · " + (new Date(ds).toLocaleDateString("ru-RU", { weekday: "long" }));
    var tasks = Store.getTasks().filter(function (t) { return t.dueDate === ds; });
    if (!tasks.length) {
      listEl.innerHTML = '<p class="muted">Задач нет.</p><button class="btn btn-primary" data-action="day-add" style="margin-top:10px">+ Добавить</button>';
      return;
    }
    listEl.innerHTML = tasks.map(function (t) {
      return '<div class="day-task' + (t.completed ? " done" : "") + '" data-id="' + t.id + '" draggable="true">' +
        '<button class="task-check" data-action="check">' + Icons.check(12) + '</button>' +
        '<div class="day-task-title" data-action="open">' + (t.time ? '<span class="cal-chip-time">' + esc(t.time) + '</span>' : "") + esc(t.title) + '</div></div>';
    }).join("") + '<button class="btn btn-primary" data-action="day-add" style="margin-top:10px">+ Добавить</button>';
  }

  /* ============================================================
     Привычки
     ============================================================ */
  function habitWeekStartDate() {
    if (state.habitWeekStart) {
      var d = Store.parseDateStr(state.habitWeekStart);
      if (d) return d;
    }
    return Store.startOfWeek(new Date());
  }

  function renderHabits() {
    var grid = $("#habits-grid");
    var navEl = $("#habits-weeknav");
    var sumEl = $("#habits-summary");
    var habits = Store.getHabits();

    var ws = habitWeekStartDate();
    var wsStr = Store.toDateStr(ws);
    var today = Store.todayStr();
    var thisWeekStr = Store.toDateStr(Store.startOfWeek(new Date()));

    var days = [];
    for (var i = 0; i < 7; i++) {
      var dd = new Date(ws); dd.setDate(dd.getDate() + i);
      days.push({ label: Store.WEEKDAYS[i], ds: Store.toDateStr(dd) });
    }

    // --- навигация по неделям ---
    var a = Store.parseDateStr(days[0].ds), b = Store.parseDateStr(days[6].ds);
    var rangeLabel;
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      rangeLabel = a.getDate() + "–" + b.getDate() + " " + MONTHS_GEN[b.getMonth()] + " " + b.getFullYear();
    } else {
      rangeLabel = a.getDate() + " " + MONTHS_GEN[a.getMonth()] + " – " + b.getDate() + " " + MONTHS_GEN[b.getMonth()] + " " + b.getFullYear();
    }
    if (navEl) {
      navEl.innerHTML =
        '<div class="weeknav-left">' +
          '<button type="button" class="icon-btn" data-week="-1" aria-label="Предыдущая неделя">' + Icons.chevronLeft(18) + '</button>' +
          '<span class="weeknav-label">' + esc(rangeLabel) + '</span>' +
          '<button type="button" class="icon-btn" data-week="1" aria-label="Следующая неделя">' + Icons.chevron(18) + '</button>' +
        '</div>' +
        '<div class="weeknav-right">' +
          (wsStr !== thisWeekStr ? '<button type="button" class="btn btn-ghost btn-sm" data-week="0">Текущая неделя</button>' : '<span class="weeknav-hint">Текущая неделя</span>') +
        '</div>';
    }

    if (!habits.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-emoji">🌱</div><h3>Начните с привычки</h3><p>Например: «Пить воду», «Читать 20 минут», «Пробежка».</p></div>';
      if (sumEl) sumEl.textContent = "Отмечайте выполнение каждый день и растите серию.";
      return;
    }

    var markedToday = habits.filter(function (h) { return (h.completions || {})[today] === true; }).length;
    if (sumEl) sumEl.textContent = "Сегодня отмечено " + markedToday + " из " + habits.length + " · прошлые недели тоже можно отмечать";

    grid.innerHTML = habits.map(function (h) {
      var streak = Store.habitStreak(h);
      var best = Store.habitBestStreak(h);
      var total = Store.habitTotal(h);
      var weekCount = Store.habitWeekCount(h, wsStr);
      var comps = h.completions || {};

      var dayCells = days.map(function (day) {
        var checked = comps[day.ds] === true;
        var future = day.ds > today;
        var isToday = day.ds === today;
        var num = Store.parseDateStr(day.ds).getDate();
        return '<div class="habit-day' + (isToday ? " today" : "") + '">' +
          '<div class="habit-day-label">' + day.label + '</div>' +
          '<div class="habit-day-num">' + num + '</div>' +
          '<button type="button" class="habit-check' + (checked ? " checked" : "") + (future ? " future" : "") + '"' +
            ' data-habit="' + h.id + '" data-day="' + day.ds + '"' + (future ? " disabled" : "") +
            ' title="' + day.ds + '" aria-label="' + day.ds + '">' + (checked ? Icons.check(14) : "") + '</button></div>';
      }).join("");

      return '<div class="habit-card" data-habit-id="' + h.id + '">' +
        '<div class="habit-top">' +
          '<span class="habit-emoji">' + esc(h.emoji || "🎯") + '</span>' +
          '<span class="habit-name">' + esc(h.name) + '</span>' +
          '<span class="habit-streak" title="Текущая серия">' + Icons.flame(16) + " " + streak + '</span>' +
          '<span class="habit-best" title="Лучшая серия">🏆 ' + best + '</span>' +
          '<span class="habit-total" title="Всего отметок">' + total + '</span>' +
          '<button class="icon-btn habit-del" data-action="habit-del" aria-label="Удалить">' + Icons.trash(16) + '</button>' +
        '</div>' +
        '<div class="habit-week">' + dayCells + '</div>' +
        '<div class="habit-progress">' +
          '<span class="habit-progress-label">Эта неделя: ' + weekCount + '/7</span>' +
          '<span class="habit-progress-bar"><span style="width:' + Math.round(weekCount / 7 * 100) + '%"></span></span>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  /* ============================================================
     Фокус / таймер
     ============================================================ */
  var RING_CIRC = 653.45;

  function renderFocus() {
    var focusTaskId = Store.getSettings().focusTaskId;
    var ft = focusTaskId ? Store.getTask(focusTaskId) : null;
    $("#focus-task").textContent = ft ? (ft.title || "Без названия") : "Нажмите, чтобы выбрать задачу для фокуса";
    $("#focus-task").style.cursor = "pointer";
    var stats = Store.getFocusStats();
    $("#timer-stats").textContent = "Сессий: " + stats.sessions + " · Минут: " + stats.minutes;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    var rem = state.timer.remaining;
    var mm = Math.floor(rem / 60), ss = rem % 60;
    $("#timer-time").textContent = pad2(mm) + ":" + pad2(ss);
    var total = state.timer.duration;
    var frac = total ? rem / total : 0;
    $("#ring-fg").style.strokeDashoffset = String(RING_CIRC * (1 - frac));
    $("#timer-mode").textContent = state.timer.focus ? "Фокус" : "Отдых";
  }

  function timerTick() {
    if (state.timer.remaining > 0) {
      state.timer.remaining--;
      updateTimerDisplay();
      return;
    }
    // завершение
    clearInterval(state.timer.interval);
    state.timer.running = false;
    state.timer.interval = null;
    $("#timer-toggle").textContent = "Старт";
    if (state.timer.focus) {
      var stats = Store.getFocusStats();
      stats.sessions = (stats.sessions || 0) + 1;
      stats.minutes = (stats.minutes || 0) + Math.round(state.timer.duration / 60);
      Store.saveSettings();
      showToast("🎉 Фокус-сессия завершена!");
    } else {
      showToast("Отдых окончен — пора за работу!");
    }
    state.timer.remaining = state.timer.duration;
    updateTimerDisplay();
    renderFocus();
  }

  function setTimerMode(durationMin, focus, btn) {
    clearInterval(state.timer.interval);
    state.timer.interval = null;
    state.timer.running = false;
    state.timer.duration = durationMin * 60;
    state.timer.remaining = durationMin * 60;
    state.timer.focus = focus;
    $("#timer-toggle").textContent = "Старт";
    $$("#timer-modes .chip").forEach(function (c) { c.classList.remove("is-active"); });
    if (btn) btn.classList.add("is-active");
    updateTimerDisplay();
  }

  /* ============================================================
     Детали задачи
     ============================================================ */
  function openDetail(id) {
    state.selectedTaskId = id;
    renderDetail();
    $("#detail").classList.add("open");
    $("#detail-backdrop").classList.add("show");
  }
  function closeDetail() {
    var id = state.selectedTaskId;
    state.selectedTaskId = null;
    $("#detail").classList.remove("open");
    $("#detail-backdrop").classList.remove("show");
    // Задача, созданная тапом по календарю и оставленная без названия, удаляется,
    // чтобы не засорять список пустыми записями.
    if (id) {
      var t = Store.getTask(id);
      if (t && !String(t.title || "").trim()) {
        Store.deleteTask(id);
        renderAll();
      }
    }
  }

  function remindLabel(v) {
    if (v == null) return "Не напоминать";
    for (var i = 0; i < REMIND_OPTIONS.length; i++) if (REMIND_OPTIONS[i].value === v) return REMIND_OPTIONS[i].label;
    return "За " + v + " мин";
  }
  function statusLabel(task) {
    if (task.completed) return "Готово";
    if (task.status === "doing") return "В работе";
    return "К выполнению";
  }

  function renderDetail() {
    var task = Store.getTask(state.selectedTaskId);
    if (!task) { closeDetail(); return; }
    var body = $("#detail-body");
    var list = task.listId ? Store.getList(task.listId) : null;
    var pr = PRIORITIES[task.priority || 0];
    var dateVal = task.dueDate ? (Store.formatDate(task.dueDate) + (task.time ? " " + task.time : "")) : "";

    body.innerHTML =
      '<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<button class="task-check" data-action="d-complete" style="flex:0 0 22px;width:22px;height:22px">' + (task.completed ? Icons.check(14) : "") + '</button>' +
        '<textarea class="detail-title-input" id="detail-title" rows="2">' + esc(task.title) + '</textarea>' +
      '</div>' +
      '<div class="detail-fields">' +
        '<div class="detail-row" data-action="d-date"><span class="row-icon">' + Icons.calendar() + '</span><span class="row-label">Дата</span><span class="row-value">' + (dateVal ? esc(dateVal) : "Не указано") + '</span></div>' +
        '<div class="detail-row" data-action="d-color"><span class="row-icon" style="color:' + (task.color ? esc(task.color) : "var(--text-3)") + '">' + Icons.palette() + '</span><span class="row-label">Цвет</span><span class="row-value">' + (task.color ? '<span class="color-dot" style="background:' + esc(task.color) + '"></span> ' + esc(task.color) : "Не задан") + '</span></div>' +
        '<div class="detail-row" data-action="d-remind"><span class="row-icon">' + Icons.bell() + '</span><span class="row-label">Напомнить</span><span class="row-value">' + esc(remindLabel(task.remind)) + '</span></div>' +
        '<div class="detail-row" data-action="d-priority"><span class="row-icon" style="color:' + pr.color + '">' + Icons.flag() + '</span><span class="row-label">Приоритет</span><span class="row-value">' + pr.label + '</span></div>' +
        '<div class="detail-row" data-action="d-list"><span class="row-icon">' + Icons.inbox() + '</span><span class="row-label">Список</span><span class="row-value">' + (list ? esc(list.name) : "Входящие") + '</span></div>' +
        '<div class="detail-row" data-action="d-tags"><span class="row-icon">' + Icons.tag() + '</span><span class="row-label">Теги</span><span class="row-value">' + (task.tags && task.tags.length ? task.tags.map(function (id) { var g = Store.getTag(id); return g ? "#" + esc(g.name) : ""; }).filter(Boolean).join(", ") : "Нет") + '</span></div>' +
        '<div class="detail-row" data-action="d-repeat"><span class="row-icon">' + Icons.repeat() + '</span><span class="row-label">Повтор</span><span class="row-value">' + (task.repeat || "Не повторяется") + '</span></div>' +
        '<div class="detail-row" data-action="d-status"><span class="row-icon">' + Icons.columns() + '</span><span class="row-label">Статус</span><span class="row-value">' + statusLabel(task) + '</span></div>' +
      '</div>' +
      '<div class="detail-subtasks"><h4>Подзадачи</h4>' +
        '<div id="detail-subtasks">' + (task.subtasks || []).map(function (s, i) {
          return '<div class="subtask' + (s.completed ? " done" : "") + '" data-i="' + i + '">' +
            '<button class="task-check" data-action="sub-check">' + (s.completed ? Icons.check(12) : "") + '</button>' +
            '<input class="subtask-input" value="' + esc(s.title) + '" data-i="' + i + '" />' +
            '<button class="icon-btn subtask-del" data-action="sub-del">' + Icons.close(14) + '</button></div>';
        }).join("") + '</div>' +
        '<div class="subtask-add"><span style="color:var(--primary)">' + Icons.plus(16) + '</span><input id="subtask-add-input" placeholder="Добавить подзадачу" /></div>' +
      '</div>' +
      '<div class="detail-description"><h4>Заметка</h4><textarea id="detail-desc" placeholder="Добавить заметку…">' + esc(task.description || "") + '</textarea></div>';

    // title автоподстройка высоты и сохранение
    var titleEl = $("#detail-title");
    function autosize() { titleEl.style.height = "auto"; titleEl.style.height = titleEl.scrollHeight + "px"; }
    titleEl.addEventListener("input", function () {
      autosize();
      Store.updateTask(task.id, { title: titleEl.value });
      renderTaskList(); renderSidebar(); renderCalendar();
    });
    autosize();

    $("#detail-desc").addEventListener("input", debounce(function (e) {
      Store.updateTask(task.id, { description: e.target.value });
    }, 300));

    $("#subtask-add-input").addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var v = e.target.value.trim();
      if (!v) return;
      task.subtasks = task.subtasks || [];
      task.subtasks.push({ id: Store.uid(), title: v, completed: false });
      Store.updateTask(task.id, { subtasks: task.subtasks });
      renderDetail();
      var inp = $("#subtask-add-input"); if (inp) inp.focus();
    });

    // подзадачи: сохранение названия
    $$("#detail-subtasks .subtask-input").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var i = +inp.getAttribute("data-i");
        task.subtasks[i].title = inp.value;
        Store.updateTask(task.id, { subtasks: task.subtasks });
      });
    });
  }

  /* ============================================================
     Модальные окна
     ============================================================ */
  function openModal(html, onMount) {
    var card = $("#modal-card");
    card.className = "modal-card";
    card.innerHTML = html;
    $("#modal").classList.remove("hidden");
    if (onMount) onMount(card);
  }
  function closeModal() { $("#modal").classList.add("hidden"); }

  function openListModal(existingId) {
    var list = existingId ? Store.getList(existingId) : null;
    var color = list ? list.color : LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)];
    var html = '<h3>' + (list ? "Изменить список" : "Новый список") + '</h3>' +
      '<div class="field"><label>Название</label><input type="text" id="list-name" value="' + esc(list ? list.name : "") + '" placeholder="Название списка" /></div>' +
      '<div class="field"><label>Цвет</label><div class="color-row" id="color-row">' +
        LIST_COLORS.map(function (c) { return '<div class="color-swatch' + (c === color ? " is-active" : "") + '" data-color="' + c + '" style="background:' + c + '"></div>'; }).join("") +
      '</div></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button><button class="btn btn-primary" id="list-save">' + (list ? "Сохранить" : "Создать") + '</button></div>';
    openModal(html, function (card) {
      var selected = color;
      $$(".color-swatch", card).forEach(function (sw) {
        sw.addEventListener("click", function () { selected = sw.getAttribute("data-color"); $$(".color-swatch", card).forEach(function (s) { s.classList.remove("is-active"); }); sw.classList.add("is-active"); });
      });
      card.querySelector('[data-close]').addEventListener("click", closeModal);
      $("#list-save", card).addEventListener("click", function () {
        var name = $("#list-name", card).value.trim();
        if (!name) return;
        if (list) Store.updateList(list.id, { name: name, color: selected });
        else Store.addList({ name: name, color: selected });
        closeModal(); renderSidebar(); renderTaskList(); renderDetail();
      });
    });
  }

  function openTagModal() {
    var color = LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)];
    openModal('<h3>Новый тег</h3>' +
      '<div class="field"><label>Название</label><input type="text" id="tag-name" placeholder="например, важное" /></div>' +
      '<div class="field"><label>Цвет</label><div class="color-row" id="color-row">' +
        LIST_COLORS.map(function (c) { return '<div class="color-swatch' + (c === color ? " is-active" : "") + '" data-color="' + c + '" style="background:' + c + '"></div>'; }).join("") +
      '</div></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button><button class="btn btn-primary" id="tag-save">Создать</button></div>',
      function (card) {
        var selected = color;
        $$(".color-swatch", card).forEach(function (sw) {
          sw.addEventListener("click", function () { selected = sw.getAttribute("data-color"); $$(".color-swatch", card).forEach(function (s) { s.classList.remove("is-active"); }); sw.classList.add("is-active"); });
        });
        card.querySelector('[data-close]').addEventListener("click", closeModal);
        $("#tag-save", card).addEventListener("click", function () {
          var name = $("#tag-name", card).value.trim();
          if (!name) return;
          Store.addTag({ name: name, color: selected });
          closeModal(); renderSidebar();
        });
      });
  }

  function openHabitModal() {
    var emoji = HABIT_EMOJIS[Math.floor(Math.random() * HABIT_EMOJIS.length)];
    openModal('<h3>Новая привычка</h3>' +
      '<div class="field"><label>Название</label><input type="text" id="habit-name" placeholder="например, Пить воду" /></div>' +
      '<div class="field"><label>Эмодзи</label><div class="color-row">' +
        HABIT_EMOJIS.map(function (e) { return '<button class="color-swatch" data-emoji="' + e + '" style="background:var(--hover);font-size:16px">' + e + '</button>'; }).join("") +
      '</div><input type="text" id="habit-emoji" value="' + emoji + '" style="margin-top:8px;max-width:70px;text-align:center" /></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button><button class="btn btn-primary" id="habit-save">Создать</button></div>',
      function (card) {
        var selEmoji = emoji;
        $$("[data-emoji]", card).forEach(function (b) {
          b.addEventListener("click", function () { selEmoji = b.getAttribute("data-emoji"); $("#habit-emoji", card).value = selEmoji; });
        });
        $("#habit-emoji", card).addEventListener("input", function (e) { selEmoji = e.target.value; });
        card.querySelector('[data-close]').addEventListener("click", closeModal);
        $("#habit-save", card).addEventListener("click", function () {
          var name = $("#habit-name", card).value.trim();
          if (!name) return;
          Store.addHabit({ name: name, emoji: selEmoji || "🎯" });
          closeModal(); renderSidebar(); renderHabits();
        });
      });
  }

  /* ============================================================
     Выбор даты и времени: календарь + круглые часы
     ============================================================ */
  function buildClockHtml(step, hh, mm) {
    var CX = 120, CY = 120, R = 94;
    var p = ['<svg viewBox="0 0 240 240" class="clock-svg">'];
    p.push('<circle cx="120" cy="120" r="112" class="clock-bg"/>');

    var count = step === "h" ? 24 : 12;
    for (var i = 0; i < count; i++) {
      var val = step === "h" ? i : i * 5;
      var ang = (i / count) * Math.PI * 2 - Math.PI / 2;
      var x = CX + Math.cos(ang) * R;
      var y = CY + Math.sin(ang) * R + 4.5;
      var sel = step === "h" ? (hh === val) : (Math.floor(mm / 5) * 5 === val);
      p.push('<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" class="clock-num' +
        (sel ? " is-sel" : "") + '">' + pad2(val) + '</text>');
    }

    var cur = step === "h" ? hh : mm;
    var total = step === "h" ? 24 : 60;
    var a = (cur / total) * Math.PI * 2 - Math.PI / 2;
    var hx = CX + Math.cos(a) * (R - 20);
    var hy = CY + Math.sin(a) * (R - 20);
    p.push('<line x1="120" y1="120" x2="' + hx.toFixed(1) + '" y2="' + hy.toFixed(1) + '" class="clock-hand"/>');
    p.push('<circle cx="120" cy="120" r="5" class="clock-pin"/>');
    p.push('<circle cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) + '" r="12" class="clock-knob"/>');
    p.push('</svg>');
    return p.join("");
  }

  function openDateModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;

    var selDate = task.dueDate || null;
    var hh = 9, mm = 0;
    if (task.time) { var tp = String(task.time).split(":"); hh = +tp[0] || 0; mm = +tp[1] || 0; }
    var hasTime = !!task.time;
    var step = "h";

    var base = selDate ? Store.parseDateStr(selDate) : new Date();
    var viewY = base.getFullYear(), viewM = base.getMonth();

    function monthTitle() {
      return new Date(viewY, viewM, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    }

    function monthGridHtml() {
      var first = new Date(viewY, viewM, 1);
      var startOffset = (first.getDay() + 6) % 7;
      var days = new Date(viewY, viewM + 1, 0).getDate();
      var today = Store.todayStr();
      var h = '<div class="dtp-month">' +
        Store.WEEKDAYS.map(function (w) { return '<div class="dtp-dow">' + w + '</div>'; }).join("");
      for (var i = 0; i < startOffset; i++) h += '<div></div>';
      for (var d = 1; d <= days; d++) {
        var ds = viewY + "-" + pad2(viewM + 1) + "-" + pad2(d);
        h += '<button type="button" class="dtp-day' + (ds === today ? " today" : "") +
          (ds === selDate ? " is-selected" : "") + '" data-day="' + ds + '">' + d + '</button>';
      }
      h += '</div>';
      return h;
    }

    function timeStr() { return pad2(hh) + ":" + pad2(mm); }

    openModal('<h3>Дата и время</h3>' +
      '<div class="dtp">' +
        '<div class="dtp-left">' +
          '<div class="dtp-cal-head">' +
            '<button type="button" class="icon-btn" data-nav="-1" aria-label="Предыдущий месяц">' + Icons.chevronLeft(18) + '</button>' +
            '<span class="dtp-cal-title" id="dtp-title">' + esc(monthTitle()) + '</span>' +
            '<button type="button" class="icon-btn" data-nav="1" aria-label="Следующий месяц">' + Icons.chevron(18) + '</button>' +
          '</div>' +
          '<div id="dtp-grid">' + monthGridHtml() + '</div>' +
          '<div class="dtp-chips">' +
            '<button type="button" data-q="0">Сегодня</button>' +
            '<button type="button" data-q="1">Завтра</button>' +
            '<button type="button" data-q="7">+7 дней</button>' +
            '<button type="button" data-q="-1">Без даты</button>' +
          '</div>' +
        '</div>' +
        '<div class="dtp-right">' +
          '<div class="dtp-time-head">' +
            '<span class="dtp-time-val" id="dtp-val">' + timeStr() + '</span>' +
            '<label class="dtp-switch"><input type="checkbox" id="dtp-on"' + (hasTime ? " checked" : "") + '><span>Время</span></label>' +
          '</div>' +
          '<div class="dtp-clock' + (hasTime ? "" : " is-off") + '" id="dtp-clock">' + buildClockHtml(step, hh, mm) + '</div>' +
          '<div class="dtp-steps">' +
            '<button type="button" data-step="h" class="' + (step === "h" ? "is-active" : "") + '">Часы</button>' +
            '<button type="button" data-step="m" class="' + (step === "m" ? "is-active" : "") + '">Минуты</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-close>Отмена</button>' +
        '<button class="btn btn-primary" id="dtp-ok">Готово</button>' +
      '</div>',
      function (card) {
        card.classList.add("modal-wide");
        var clockEl = $("#dtp-clock", card);

        function refresh() {
          clockEl.innerHTML = buildClockHtml(step, hh, mm);
          clockEl.classList.toggle("is-off", !$("#dtp-on", card).checked);
          $("#dtp-val", card).textContent = timeStr();
          $$(".dtp-steps button", card).forEach(function (b) {
            b.classList.toggle("is-active", b.getAttribute("data-step") === step);
          });
        }

        function syncMonthTitle() {
          $("#dtp-title", card).textContent = monthTitle();
          $("#dtp-grid", card).innerHTML = monthGridHtml();
        }

        // --- календарь: клик по дате НЕ закрывает окно ---
        $("#dtp-grid", card).addEventListener("click", function (e) {
          var d = e.target.closest("[data-day]");
          if (!d) return;
          selDate = d.getAttribute("data-day");
          $$(".dtp-day", card).forEach(function (x) {
            x.classList.toggle("is-selected", x.getAttribute("data-day") === selDate);
          });
        });

        $$("[data-nav]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            viewM += +b.getAttribute("data-nav");
            if (viewM > 11) { viewM = 0; viewY++; }
            if (viewM < 0) { viewM = 11; viewY--; }
            syncMonthTitle();
          });
        });

        $$("[data-q]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            var q = b.getAttribute("data-q");
            selDate = q === "-1" ? null : Store.addDaysStr(Store.todayStr(), +q);
            if (selDate) {
              var d = Store.parseDateStr(selDate);
              viewY = d.getFullYear(); viewM = d.getMonth();
            }
            syncMonthTitle();
          });
        });

        // --- круглые часы ---
        function dialValue(ev) {
          var svg = clockEl.querySelector("svg");
          if (!svg) return null;
          var r = svg.getBoundingClientRect();
          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          var dx = ev.clientX - cx, dy = ev.clientY - cy;
          if (Math.sqrt(dx * dx + dy * dy) < 16) return null;
          var ang = Math.atan2(dy, dx) + Math.PI / 2;
          if (ang < 0) ang += Math.PI * 2;
          var frac = ang / (Math.PI * 2);
          if (step === "h") return Math.round(frac * 24) % 24;
          return Math.round(frac * 60) % 60;
        }

        var dialDown = false;
        function dialApply(ev) {
          var v = dialValue(ev);
          if (v == null) return;
          if (step === "h") hh = v; else mm = v;
          refresh();
        }

        clockEl.addEventListener("pointerdown", function (e) {
          if (!$("#dtp-on", card).checked) return;
          e.preventDefault();
          dialDown = true;
          try { clockEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          dialApply(e);
        });
        clockEl.addEventListener("pointermove", function (e) {
          if (!dialDown) return;
          e.preventDefault();
          dialApply(e);
        });
        clockEl.addEventListener("pointerup", function (e) {
          if (!dialDown) return;
          dialDown = false;
          // сначала часы, затем минуты
          if (step === "h") { step = "m"; refresh(); }
        });
        clockEl.addEventListener("pointercancel", function () { dialDown = false; });

        $$("[data-step]", card).forEach(function (b) {
          b.addEventListener("click", function () { step = b.getAttribute("data-step"); refresh(); });
        });

        $("#dtp-on", card).addEventListener("change", function (e) {
          hasTime = e.target.checked;
          refresh();
        });

        card.querySelector("[data-close]").addEventListener("click", closeModal);

        $("#dtp-ok", card).addEventListener("click", function () {
          var time = hasTime ? timeStr() : null;
          var date = selDate;
          if (hasTime && !date) date = Store.todayStr();
          Store.updateTask(taskId, { dueDate: date, time: time, remindFired: null });
          closeModal();
          renderAll();
        });
      });
  }

  function openPriorityModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;
    openModal('<h3>Приоритет</h3><div style="display:grid;gap:6px">' +
      [0, 1, 2, 3].map(function (p) {
        var pr = PRIORITIES[p];
        return '<button class="btn btn-ghost" data-p="' + p + '" style="justify-content:flex-start;' + (task.priority === p ? "border-color:" + pr.color + ";" : "") + '"><span style="color:' + pr.color + '">' + Icons.flag(16) + '</span> ' + pr.label + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-p]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            Store.updateTask(taskId, { priority: +b.getAttribute("data-p") });
            closeModal(); renderAll();
          });
        });
        card.querySelector('[data-close]').addEventListener("click", closeModal);
      });
  }

  function openColorModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;
    openModal('<h3>Цвет задачи</h3>' +
      '<p class="muted" style="margin-bottom:12px">Цвет подсвечивает задачу в списке, календаре и на доске.</p>' +
      '<div class="color-row">' +
        LIST_COLORS.map(function (c) {
          return '<button type="button" class="color-swatch' + (task.color === c ? " is-active" : "") +
            '" data-color="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>';
        }).join("") +
        '<button type="button" class="color-swatch color-none' + (!task.color ? " is-active" : "") + '" data-color="" title="Без цвета">—</button>' +
      '</div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Закрыть</button></div>',
      function (card) {
        $$("[data-color]", card).forEach(function (sw) {
          sw.addEventListener("click", function () {
            var c = sw.getAttribute("data-color") || null;
            Store.updateTask(taskId, { color: c });
            closeModal();
            renderAll();
            showToast(c ? "Цвет задачи изменён" : "Цвет убран");
          });
        });
        card.querySelector("[data-close]").addEventListener("click", closeModal);
      });
  }

  function openListPickerModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;
    openModal('<h3>Список</h3><div style="display:grid;gap:6px">' +
      '<button class="btn btn-ghost" data-lid="" style="justify-content:flex-start">' + Icons.inbox(16) + ' Входящие</button>' +
      Store.getLists().map(function (l) {
        return '<button class="btn btn-ghost" data-lid="' + l.id + '" style="justify-content:flex-start;' + (task.listId === l.id ? "border-color:" + l.color + ";" : "") + '"><span style="width:10px;height:10px;border-radius:3px;background:' + esc(l.color) + '"></span> ' + esc(l.name) + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-lid]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            Store.updateTask(taskId, { listId: b.getAttribute("data-lid") || null });
            closeModal(); renderAll();
          });
        });
        card.querySelector('[data-close]').addEventListener("click", closeModal);
      });
  }

  function openTagsModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;
    var tags = Store.getTags();
    openModal('<h3>Теги</h3><div style="display:grid;gap:6px;margin-bottom:12px">' +
      tags.map(function (g) {
        var on = (task.tags || []).indexOf(g.id) !== -1;
        return '<button class="btn btn-ghost" data-tg="' + g.id + '" style="justify-content:flex-start"><span style="color:' + esc(g.color) + ';width:16px">' + (on ? "✓" : "") + '</span> <span style="color:' + esc(g.color) + '">#</span>' + esc(g.name) + '</button>';
      }).join("") +
      (tags.length ? "" : '<p class="muted">Тегов пока нет.</p>') +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Готово</button></div>',
      function (card) {
        $$("[data-tg]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            var id = b.getAttribute("data-tg");
            var list = (task.tags || []).slice();
            var idx = list.indexOf(id);
            if (idx === -1) list.push(id); else list.splice(idx, 1);
            Store.updateTask(taskId, { tags: list });
            renderDetail();
            openTagsModal(taskId); // переоткрыть с обновлённым состоянием
          });
        });
        card.querySelector('[data-close]').addEventListener("click", closeModal);
      });
  }

  function openRepeatModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;
    var opts = [null, "Ежедневно", "Еженедельно", "Ежемесячно", "По будням"];
    openModal('<h3>Повтор</h3><div style="display:grid;gap:6px">' +
      opts.map(function (r) {
        var label = r || "Не повторяется";
        return '<button class="btn btn-ghost" data-r="' + (r || "") + '" style="justify-content:flex-start;' + (task.repeat === r ? "border-color:var(--primary);" : "") + '">' + label + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-r]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            Store.updateTask(taskId, { repeat: b.getAttribute("data-r") || null });
            closeModal(); renderAll();
          });
        });
        card.querySelector('[data-close]').addEventListener("click", closeModal);
      });
  }

  function openFocusTaskModal() {
    var tasks = Store.getTasks().filter(function (t) { return !t.completed; }).slice(0, 60);
    openModal('<h3>Задача для фокуса</h3><div style="display:grid;gap:6px;max-height:300px;overflow:auto">' +
      '<button class="btn btn-ghost" data-ft="" style="justify-content:flex-start">Без задачи</button>' +
      tasks.map(function (t) {
        return '<button class="btn btn-ghost" data-ft="' + t.id + '" style="justify-content:flex-start">' + esc(t.title) + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-ft]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            Store.getSettings().focusTaskId = b.getAttribute("data-ft") || null;
            Store.saveSettings();
            closeModal(); renderFocus();
          });
        });
        card.querySelector('[data-close]').addEventListener("click", closeModal);
      });
  }

  function confirmModal(title, text, onConfirm) {
    openModal('<h3>' + esc(title) + '</h3><p class="muted">' + esc(text) + '</p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button><button class="btn btn-danger" id="confirm-yes">Удалить</button></div>',
      function (card) {
        card.querySelector('[data-close]').addEventListener("click", closeModal);
        $("#confirm-yes", card).addEventListener("click", function () { closeModal(); onConfirm(); });
      });
  }

  /* ============================================================
     Quick add + парсер естественного языка
     ============================================================ */
  function findByName(items, name) {
    var low = name.toLowerCase();
    for (var i = 0; i < items.length; i++) if (items[i].name.toLowerCase() === low) return items[i];
    return null;
  }

  function parseQuickAdd(raw) {
    var text = raw.trim();
    var res = { title: "", date: state.quickDate, time: null, priority: state.quickPriority, tags: [], listId: state.view === "list" ? state.listId : null };

    // список: ~имя или [имя]
    var lm = text.match(/(?:^|\s)~([^\s]+)/) || text.match(/\[([^\]]+)\]/);
    if (lm) {
      var lname = (lm[1] || "").trim();
      var list = findByName(Store.getLists(), lname);
      if (!list) list = Store.addList({ name: lname, color: LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)] });
      res.listId = list.id;
      text = text.replace(lm[0], " ").trim();
    }

    // теги: #слово
    text = text.replace(/#([\p{L}\p{N}_-]+)/gu, function (_, tagname) {
      var tag = findByName(Store.getTags(), tagname);
      if (!tag) tag = Store.addTag({ name: tagname, color: LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)] });
      res.tags.push(tag.id);
      return " ";
    });

    // приоритет: !!! / !! / ! / !1 / !2 / !3
    var pm = text.match(/(?:^|\s)(!{1,3}|![123])(?=$|\s)/);
    if (pm) {
      var mark = pm[1];
      if (/![123]/.test(mark)) res.priority = +mark[1];
      else res.priority = mark.length;
      text = text.replace(pm[0], " ").trim();
    }

    // время (до даты, чтобы «9.30» не распозналось как дата)
    var timeRes = parseTimeToken(text);
    if (timeRes.time) { res.time = timeRes.time; text = timeRes.rest; }

    // дата
    var dateRes = parseDateToken(text);
    if (dateRes.date) { res.date = dateRes.date; text = dateRes.rest; }

    res.title = text.replace(/[,\s]+$/g, "").trim();
    return res;
  }

  function parseDateToken(text) {
    var t = Store.todayStr();
    var B = "[^\\p{L}\\p{N}]";

    // ключевые слова (без \\b — он не работает с кириллицей)
    function tryWords(sources, date) {
      var re = new RegExp("(^|" + B + ")(" + sources.join("|") + ")(?=$|" + B + ")", "iu");
      var m = text.match(re);
      if (m) return { date: date, rest: text.replace(re, function (all, pre) { return pre; }).trim() };
      return null;
    }

    var r = tryWords(["сегодня", "today", "tod"], t);
    if (r) return r;
    r = tryWords(["завтра", "tomorrow", "tmrw"], Store.addDaysStr(t, 1));
    if (r) return r;
    r = tryWords(["послезавтра", "day after tomorrow"], Store.addDaysStr(t, 2));
    if (r) return r;
    r = tryWords(["следующ\\p{L}*\\s+недел\\p{L}*", "next week"], Store.addDaysStr(t, 7));
    if (r) return r;

    // дни недели (пн=0 ... вс=6)
    var wd = {
      "понедельник": 0, "вторник": 1, "среда": 2, "среду": 2, "четверг": 3, "пятница": 4, "пятницу": 4, "суббота": 5, "субботу": 5, "воскресенье": 6, "воскресение": 6,
      "пн": 0, "вт": 1, "ср": 2, "чт": 3, "пт": 4, "сб": 5, "вс": 6,
      "monday": 0, "mon": 0, "tuesday": 1, "tue": 1, "tues": 1, "wednesday": 2, "wed": 2, "thursday": 3, "thu": 3, "thur": 3, "thurs": 3, "friday": 4, "fri": 4, "saturday": 5, "sat": 5, "sunday": 6, "sun": 6
    };
    var keys = Object.keys(wd).sort(function (a, b) { return b.length - a.length; });
    for (var k = 0; k < keys.length; k++) {
      var kw = keys[k];
      // опционально захватываем предлог «в/во» перед днём недели
      var re = new RegExp("(^|" + B + ")(?:в|во)?\\s*(" + kw + ")(?=$|" + B + ")", "iu");
      var m = text.match(re);
      if (m) {
        var target = wd[kw];
        var d = new Date();
        var cur = (d.getDay() + 6) % 7;
        var diff = (target - cur + 7) % 7;
        d.setDate(d.getDate() + diff);
        return { date: Store.toDateStr(d), rest: text.replace(re, function (all, pre) { return pre; }).trim() };
      }
    }

    // числовая дата YYYY-MM-DD или DD.MM[.YYYY]
    var num = text.match(/(^|\s)(\d{4})-(\d{1,2})-(\d{1,2})(?=$|\s)/);
    if (num) {
      var y = +num[2], mo = +num[3], da = +num[4];
      if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
        return { date: y + "-" + pad2(mo) + "-" + pad2(da), rest: text.replace(num[0], " ").trim() };
      }
    }
    num = text.match(/(^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=$|\s)/);
    if (num) {
      var day = +num[2], month = +num[3];
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        var year = num[4] ? (num[4].length === 2 ? 2000 + (+num[4]) : +num[4]) : new Date().getFullYear();
        return { date: year + "-" + pad2(month) + "-" + pad2(day), rest: text.replace(num[0], " ").trim() };
      }
    }
    return { date: null, rest: text };
  }

  function parseTimeToken(text) {
    var m;
    // 9:30 / 9.30 (с am/pm); не трогаем даты вида DD.MM.YYYY
    m = text.match(/(?:^|\s)(\d{1,2})[:.](\d{2})(?!\d?\.\d{2,4}\b)\s*(am|pm)?(?=$|\s)/i);
    if (m) {
      var h = +m[1], min = +m[2], mer = m[3] && m[3].toLowerCase();
      if (mer === "pm" && h < 12) h += 12;
      if (mer === "am" && h === 12) h = 0;
      if (!mer && (h > 23 || min > 59)) return { time: null, rest: text };
      if (mer && h > 12) return { time: null, rest: text };
      if (min > 59) return { time: null, rest: text };
      return { time: pad2(h) + ":" + pad2(min), rest: text.replace(m[0], " ").trim() };
    }
    // 9am / 9pm
    m = text.match(/(?:^|\s)(\d{1,2})\s*(am|pm)(?=$|\s)/i);
    if (m) {
      var h2 = +m[1], mer2 = m[2].toLowerCase();
      if (h2 > 12) return { time: null, rest: text };
      if (mer2 === "pm" && h2 < 12) h2 += 12;
      if (mer2 === "am" && h2 === 12) h2 = 0;
      return { time: pad2(h2) + ":00", rest: text.replace(m[0], " ").trim() };
    }
    // "в 9", "в 9 вечера", "к 7 утра"
    m = text.match(/(?:^|\s)(?:в|к)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(утра|утром|вечера|вечером|дня|днём|днем|ночи|ночью|часов|час)?(?=$|\s)/i);
    if (m) {
      var h3 = +m[1], min3 = m[2] ? +m[2] : 0, part = (m[3] || "").toLowerCase();
      if (h3 > 23 || min3 > 59) return { time: null, rest: text };
      if (/вечер/.test(part) && h3 < 12) h3 += 12;
      else if (/ноч/.test(part) && h3 < 5) h3 += 12;
      else if (/дн/.test(part) && h3 < 12) h3 += 12;
      return { time: pad2(h3) + ":" + pad2(min3), rest: text.replace(m[0], " ").trim() };
    }
    return { time: null, rest: text };
  }

  function addTaskFromInput() {
    var input = $("#quick-add-input");
    var val = input.value.trim();
    if (!val) return;
    var parsed = parseQuickAdd(val);
    if (!parsed.title) return;
    var task = Store.addTask({
      title: parsed.title,
      dueDate: parsed.date,
      time: parsed.time,
      priority: parsed.priority,
      tags: parsed.tags,
      listId: parsed.listId
    });
    input.value = "";
    state.quickDate = null; state.quickPriority = 0;
    updateQuickPrioBtn();
    closeQuickPopovers();
    renderAll();
    // сразу можно доредактировать: цвет, время, список и т.д.
    showToast("Задача добавлена", function () { openDetail(task.id); }, "Изменить");
  }

  function updateQuickPrioBtn() {
    var btn = $("#qa-prio");
    var pr = PRIORITIES[state.quickPriority];
    btn.style.color = state.quickPriority ? pr.color : "";
    btn.title = "Приоритет: " + pr.label;
  }

  function closeQuickPopovers() {
    $("#qa-date-pop").classList.add("hidden");
  }

  /* ============================================================
     Toast
     ============================================================ */
  var toastTimer = null;
  function showToast(msg, action, actionLabel) {
    var el = $("#toast");
    if (action) {
      el.className = "toast show undo";
      el.innerHTML = "<span>" + esc(msg) + "</span><button id='toast-undo'>" + esc(actionLabel || "Отменить") + "</button>";
      $("#toast-undo").addEventListener("click", function () { action(); hideToast(); });
    } else {
      el.className = "toast show";
      el.textContent = msg;
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3200);
  }
  function hideToast() { $("#toast").classList.remove("show"); }

  /* ============================================================
     Множественный выбор и групповые действия
     ============================================================ */
  function toggleSelected(id) {
    if (state.selected[id]) delete state.selected[id];
    else state.selected[id] = true;
  }

  function renderBulkBar() {
    var bar = $("#bulk-bar");
    var ids = selectedIds();
    var special = state.view === "calendar" || state.view === "habits" || state.view === "focus";
    if (!state.selectMode || special || !ids.length) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    $("#bulk-count").textContent = "Выбрано: " + ids.length;
  }

  function bulkAction(kind) {
    var ids = selectedIds();
    if (!ids.length) return;
    if (kind === "cancel") { state.selectMode = false; clearSelection(); renderAll(); return; }
    if (kind === "complete") {
      var recurred = 0;
      ids.forEach(function (id) {
        var r = Store.completeTask(id);
        if (r && r.recurred) recurred++;
      });
      clearSelection();
      renderAll();
      showToast(recurred ? "Выполнено: " + ids.length + " (повтор перенесён: " + recurred + ")" : "Выполнено: " + ids.length);
      return;
    }
    if (kind === "delete") {
      confirmModal("Удалить задачи", "Будет удалено задач: " + ids.length, function () {
        ids.forEach(function (id) { Store.deleteTask(id); });
        clearSelection(); renderAll(); showToast("Удалено: " + ids.length);
      });
      return;
    }
    if (kind === "date") { openBulkDateModal(ids); return; }
    if (kind === "list") { openBulkListModal(ids); return; }
    if (kind === "priority") { openBulkPriorityModal(ids); return; }
  }

  function openBulkDateModal(ids) {
    var t = Store.todayStr();
    openModal('<h3>Дата для ' + ids.length + ' задач</h3>' +
      '<div style="display:grid;gap:6px;margin-bottom:14px">' +
        '<button class="btn btn-ghost" data-set="today" style="justify-content:flex-start">Сегодня</button>' +
        '<button class="btn btn-ghost" data-set="tomorrow" style="justify-content:flex-start">Завтра</button>' +
        '<button class="btn btn-ghost" data-set="next-week" style="justify-content:flex-start">Следующая неделя</button>' +
        '<button class="btn btn-ghost" data-set="none" style="justify-content:flex-start">Без даты</button>' +
      '</div>' +
      '<div class="field"><label>Конкретная дата</label><input type="date" id="bulk-date" /></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        var apply = function (d) {
          ids.forEach(function (id) { Store.updateTask(id, { dueDate: d, remindFired: null }); });
          closeModal(); clearSelection(); renderAll(); showToast("Дата обновлена");
        };
        $$("[data-set]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            var v = b.getAttribute("data-set");
            apply(v === "today" ? t : v === "tomorrow" ? Store.addDaysStr(t, 1) : v === "next-week" ? Store.addDaysStr(t, 7) : null);
          });
        });
        $("#bulk-date", card).addEventListener("change", function (e) { apply(e.target.value || null); });
        card.querySelector("[data-close]").addEventListener("click", closeModal);
      });
  }

  function openBulkListModal(ids) {
    openModal('<h3>Список для ' + ids.length + ' задач</h3><div style="display:grid;gap:6px">' +
      '<button class="btn btn-ghost" data-lid="" style="justify-content:flex-start">' + Icons.inbox(16) + ' Входящие</button>' +
      Store.getLists().map(function (l) {
        return '<button class="btn btn-ghost" data-lid="' + l.id + '" style="justify-content:flex-start"><span style="width:10px;height:10px;border-radius:3px;background:' + esc(l.color) + '"></span> ' + esc(l.name) + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-lid]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            var lid = b.getAttribute("data-lid") || null;
            ids.forEach(function (id) { Store.updateTask(id, { listId: lid }); });
            closeModal(); clearSelection(); renderAll(); showToast("Список обновлён");
          });
        });
        card.querySelector("[data-close]").addEventListener("click", closeModal);
      });
  }

  function openBulkPriorityModal(ids) {
    openModal('<h3>Приоритет для ' + ids.length + ' задач</h3><div style="display:grid;gap:6px">' +
      [0, 1, 2, 3].map(function (p) {
        var pr = PRIORITIES[p];
        return '<button class="btn btn-ghost" data-p="' + p + '" style="justify-content:flex-start"><span style="color:' + pr.color + '">' + Icons.flag(16) + '</span> ' + pr.label + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-p]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            var p = +b.getAttribute("data-p");
            ids.forEach(function (id) { Store.updateTask(id, { priority: p }); });
            closeModal(); clearSelection(); renderAll(); showToast("Приоритет обновлён");
          });
        });
        card.querySelector("[data-close]").addEventListener("click", closeModal);
      });
  }

  /* ============================================================
     Напоминания
     ============================================================ */
  function notifyDesktop(title, body) {
    try {
      if (window.Notification && Notification.permission === "granted") {
        new Notification(title, { body: body });
        return true;
      }
    } catch (e) { /* нет доступа */ }
    return false;
  }

  function requestNotifyPermission(cb) {
    try {
      if (window.Notification && Notification.permission === "default") {
        Notification.requestPermission().then(function () { if (cb) cb(); });
        return;
      }
    } catch (e) { /* ignore */ }
    if (cb) cb();
  }

  function checkReminders() {
    var now = Date.now();
    Store.getTasks().forEach(function (t) {
      if (t.completed || t.remind == null || !t.dueDate) return;
      var due = t.dueDate + "T" + (t.time || "09:00") + ":00";
      var dueTs = new Date(due).getTime();
      if (isNaN(dueTs)) return;
      var fireAt = dueTs - t.remind * 60000;
      var key = t.dueDate + "T" + (t.time || "");
      if (t.remindFired === key) return;
      if (now >= fireAt && now - fireAt < 12 * 3600 * 1000) {
        Store.updateTask(t.id, { remindFired: key });
        var when = t.time ? ("в " + t.time) : "сегодня";
        notifyDesktop("TaskTick · " + t.title, "Задача " + when);
        showToast("🔔 " + t.title + " — " + when);
      }
    });
  }

  function openRemindModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;
    openModal('<h3>Напоминание</h3>' +
      (!task.dueDate ? '<p class="muted" style="margin-bottom:10px">Сначала задайте дату задачи.</p>' : "") +
      '<div style="display:grid;gap:6px">' +
      REMIND_OPTIONS.map(function (o) {
        var active = task.remind === o.value || (o.value === null && task.remind == null);
        return '<button class="btn btn-ghost" data-r="' + (o.value == null ? "" : o.value) + '" style="justify-content:flex-start;' + (active ? "border-color:var(--primary);" : "") + '">' + Icons.bell(16) + " " + o.label + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-r]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            var raw = b.getAttribute("data-r");
            var v = raw === "" ? null : +raw;
            Store.updateTask(taskId, { remind: v, remindFired: null });
            Store.getSettings().notify = v != null;
            Store.saveSettings();
            closeModal();
            if (v != null) { requestNotifyPermission(); showToast("Напоминание установлено"); }
            renderDetail(); renderAll();
          });
        });
        card.querySelector("[data-close]").addEventListener("click", closeModal);
      });
  }

  function openStatusModal(taskId) {
    var task = Store.getTask(taskId);
    if (!task) return;
    openModal('<h3>Статус</h3><div style="display:grid;gap:6px">' +
      BOARD_COLUMNS.map(function (c) {
        return '<button class="btn btn-ghost" data-c="' + c.key + '" style="justify-content:flex-start"><span class="dot" style="width:8px;height:8px;border-radius:50%;background:' + c.color + ';display:inline-block;margin-right:6px"></span>' + c.title + '</button>';
      }).join("") +
      '</div><div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button></div>',
      function (card) {
        $$("[data-c]", card).forEach(function (b) {
          b.addEventListener("click", function () {
            Store.setStatus(taskId, b.getAttribute("data-c"));
            closeModal(); renderAll();
          });
        });
        card.querySelector("[data-close]").addEventListener("click", closeModal);
      });
  }

  /* ============================================================
     Статистика
     ============================================================ */
  function openStatsModal() {
    var tasks = Store.getTasks();
    var open = tasks.filter(function (t) { return !t.completed; });
    var today = Store.todayStr();
    var doneToday = Store.completedOn(today);
    var t0 = Store.parseDateStr(today);
    var weekStart = Store.startOfWeek(t0);
    var weekCount = 0;
    for (var i = 0; i < 7; i++) {
      var ds = Store.toDateStr(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
      weekCount += Store.completedOn(ds);
    }
    var overdue = open.filter(function (x) { return x.dueDate && x.dueDate < today; }).length;
    var focusStats = Store.getFocusStats();
    var habits = Store.getHabits();
    var bestStreak = 0, doneHabitsToday = 0;
    habits.forEach(function (h) {
      var s = Store.habitStreak(h);
      if (s > bestStreak) bestStreak = s;
      if ((h.completions || {})[today]) doneHabitsToday++;
    });

    var vals = [], max = 1;
    for (var j = 6; j >= 0; j--) {
      var d = Store.addDaysStr(today, -j);
      var v = Store.completedOn(d);
      vals.push({ ds: d, v: v });
      if (v > max) max = v;
    }
    var bars = vals.map(function (x) {
      var h = Math.round((x.v / max) * 100);
      var dd = Store.parseDateStr(x.ds);
      return '<div class="stats-bar" title="' + x.ds + ': ' + x.v + '">' +
        '<div class="stats-bar-fill" style="height:' + (x.v ? Math.max(6, h) : 3) + '%"></div>' +
        '<div class="stats-bar-label">' + Store.WEEKDAYS[(dd.getDay() + 6) % 7] + '<br>' + dd.getDate() + '</div></div>';
    }).join("");

    var maxList = 1;
    var listCounts = Store.getLists().map(function (l) {
      var c = open.filter(function (x) { return x.listId === l.id; }).length;
      if (c > maxList) maxList = c;
      return { name: l.name, color: l.color, count: c };
    }).sort(function (a, b) { return b.count - a.count; });

    var listRows = listCounts.map(function (l) {
      return '<div class="stats-list-row"><span style="width:10px;height:10px;border-radius:3px;background:' + esc(l.color) + '"></span>' +
        '<span style="width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(l.name) + '</span>' +
        '<span class="bar"><span style="width:' + Math.round((l.count / maxList) * 100) + '%;background:' + esc(l.color) + '"></span></span>' +
        '<span style="color:var(--text-3);width:24px;text-align:right">' + l.count + '</span></div>';
    }).join("");

    openModal('<h3>Статистика</h3>' +
      '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-value">' + doneToday + '</div><div class="stat-label">Выполнено сегодня</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + weekCount + '</div><div class="stat-label">Выполнено за неделю</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + open.length + '</div><div class="stat-label">Активных задач</div></div>' +
        '<div class="stat-card"><div class="stat-value" style="color:' + (overdue ? "var(--danger)" : "inherit") + '">' + overdue + '</div><div class="stat-label">Просрочено</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + focusStats.sessions + '</div><div class="stat-label">Фокус-сессий · ' + focusStats.minutes + ' мин</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + bestStreak + '🔥</div><div class="stat-label">Лучшая серия · привычек сегодня ' + doneHabitsToday + '/' + habits.length + '</div></div>' +
      '</div>' +
      '<h4 style="font-size:13px;margin-bottom:4px">Выполнено за 7 дней</h4>' +
      '<div class="stats-bars">' + bars + '</div>' +
      '<h4 style="font-size:13px;margin:16px 0 4px">Активные задачи по спискам</h4>' +
      (listRows || '<p class="muted">Нет данных.</p>') +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Закрыть</button></div>',
      function (card) {
        card.querySelector("[data-close]").addEventListener("click", closeModal);
      });
  }

  /* ============================================================
     Drag & Drop
     ============================================================ */
  function clearDropIndicators() {
    $$(".drag-over").forEach(function (el) { el.classList.remove("drag-over"); });
    $$(".drop-before").forEach(function (el) { el.classList.remove("drop-before"); });
    $$(".drop-after").forEach(function (el) { el.classList.remove("drop-after"); });
  }

  function handleDropOnElement(dragId, el) {
    var task = Store.getTask(dragId);
    if (!task) return;

    if (el.hasAttribute("data-drop-quick")) {
      var q = el.getAttribute("data-drop-quick");
      var t0 = Store.todayStr();
      var qd = q === "today" ? t0 : q === "tomorrow" ? Store.addDaysStr(t0, 1) : q === "nextweek" ? Store.addDaysStr(t0, 7) : null;
      Store.updateTask(dragId, { dueDate: qd, remindFired: null });
      showToast(qd ? "Перенесено: " + Store.formatDate(qd) : "Дата убрана");
      renderAll();
      return;
    }

    if (el.hasAttribute("data-drop-day")) {
      var day = el.getAttribute("data-drop-day");
      var patch = { dueDate: day, remindFired: null };
      if (el.hasAttribute("data-drop-hour")) {
        var h = +el.getAttribute("data-drop-hour");
        var min = task.time ? timeToMinutes(task.time) % 60 : 0;
        patch.time = minutesToTime(h * 60 + min);
      }
      Store.updateTask(dragId, patch);
      setCalAnchor(day);
      showToast("Перенесено: " + Store.formatDate(day) + (patch.time ? ", " + patch.time : ""));
      renderAll();
      return;
    }
    if (el.hasAttribute("data-drop-list")) {
      var lid = el.getAttribute("data-drop-list") || null;
      Store.updateTask(dragId, { listId: lid });
      var l = lid ? Store.getList(lid) : null;
      showToast("Перемещено в «" + (l ? l.name : "Входящие") + "»");
      renderAll();
      return;
    }
    if (el.hasAttribute("data-drop-tag")) {
      var tg = el.getAttribute("data-drop-tag");
      var list = (task.tags || []).slice();
      if (list.indexOf(tg) === -1) list.push(tg);
      Store.updateTask(dragId, { tags: list });
      var g = Store.getTag(tg);
      showToast("Добавлен тег #" + (g ? g.name : ""));
      renderAll();
    }
  }

  function reorderTo(dragId, overId, pos) {
    if (!overId || dragId === overId) return;
    if (Store.getSettings().sort !== "manual") { Store.getSettings().sort = "manual"; Store.saveSettings(); }
    var ids = filterTasks().map(function (t) { return t.id; });
    var from = ids.indexOf(dragId);
    if (from === -1) return;
    ids.splice(from, 1);
    var to = ids.indexOf(overId);
    if (to === -1) return;
    if (pos === "after") to++;
    ids.splice(to, 0, dragId);
    Store.reorder(ids);
    renderAll();
  }

  function handleBoardDrop(dragId, status, overId, pos) {
    var task = Store.getTask(dragId);
    if (!task) return;
    if (status === "done") {
      if (!task.completed) {
        var r = Store.completeTask(dragId);
        if (r && r.recurred) showToast("🔁 Повтор: следующая дата — " + Store.formatDate(r.next));
      }
    } else {
      if (task.completed) Store.uncompleteTask(dragId);
      Store.updateTask(dragId, { status: status });
    }
    if (overId && overId !== dragId) {
      if (Store.getSettings().sort !== "manual") { Store.getSettings().sort = "manual"; Store.saveSettings(); }
      var ids = filterTasks(true).map(function (t) { return t.id; });
      var from = ids.indexOf(dragId);
      if (from > -1) ids.splice(from, 1);
      var to = ids.indexOf(overId);
      if (to === -1) to = ids.length; else if (pos === "after") to++;
      ids.splice(to, 0, dragId);
      Store.reorder(ids);
    }
    renderAll();
  }

  function bindDragAndDrop() {
    document.addEventListener("dragstart", function (e) {
      var el = e.target.closest ? e.target.closest("[data-id]") : null;
      if (!el) return;
      state.dragId = el.getAttribute("data-id");
      state.dragOverId = null;
      document.body.classList.add("is-dragging-task");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", state.dragId); } catch (err) { /* IE */ }
      }
      if (el.classList.contains("task") || el.classList.contains("board-card")) el.classList.add("dragging");
    });

    document.addEventListener("dragend", function () {
      state.dragId = null;
      state.dragOverId = null;
      document.body.classList.remove("is-dragging-task");
      clearDropIndicators();
      $$(".dragging").forEach(function (el) { el.classList.remove("dragging"); });
    });

    document.addEventListener("dragover", function (e) {
      if (!state.dragId) return;
      var t = e.target;
      if (!t.closest) return;
      clearDropIndicators();

      var card = t.closest(".task, .board-card");
      if (card) {
        e.preventDefault();
        var rect = card.getBoundingClientRect();
        var before = e.clientY < rect.top + rect.height / 2;
        card.classList.add(before ? "drop-before" : "drop-after");
        state.dragOverId = card.getAttribute("data-id");
        state.dragOverPos = before ? "before" : "after";
        var col = card.closest(".board-col");
        if (col) col.classList.add("drag-over");
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        return;
      }

      var dropEl = t.closest("[data-drop-day], [data-drop-list], [data-drop-tag], [data-drop-quick], .board-col");
      if (dropEl) {
        e.preventDefault();
        dropEl.classList.add("drag-over");
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      }
    });

    document.addEventListener("drop", function (e) {
      if (!state.dragId) return;
      var dragId = state.dragId;
      state.dragId = null;
      var t = e.target;
      if (!t.closest) return;
      e.preventDefault();
      performDrop(t, e.clientY, dragId);
      clearDropIndicators();
    });

    // ---------- тач-перетаскивание (долгое нажатие) ----------
    var touch = { timer: null, el: null, id: null, active: false, sx: 0, sy: 0, lx: 0, ly: 0, ghost: null };

    function ghostAt(x, y) {
      if (!touch.ghost) return;
      touch.ghost.style.left = x + "px";
      touch.ghost.style.top = y + "px";
    }

    function startTouchDrag(el, x, y) {
      touch.active = true;
      touch.id = el.getAttribute("data-id");
      state.dragId = touch.id;
      document.body.classList.add("is-dragging-task", "touch-dragging");
      el.classList.add("dragging");

      var ttl = el.querySelector(".task-title, .bc-title, .cal-chip, .day-task-title");
      var g = document.createElement("div");
      g.className = "drag-ghost";
      g.textContent = ((ttl && ttl.textContent) || "Задача").trim() || "Задача";
      document.body.appendChild(g);
      touch.ghost = g;
      ghostAt(x, y);

      try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) { /* ignore */ }
    }

    function endTouchDrag() {
      clearTimeout(touch.timer);
      touch.timer = null;
      if (touch.ghost && touch.ghost.parentNode) touch.ghost.parentNode.removeChild(touch.ghost);
      touch.ghost = null;
      touch.active = false;
      touch.el = null;
      state.dragId = null;
      document.body.classList.remove("is-dragging-task", "touch-dragging");
      clearDropIndicators();
      $$(".dragging").forEach(function (el) { el.classList.remove("dragging"); });
      suppressNextClick = true;
      suppressClickUntil = Date.now() + 350;
    }

    function elementAt(x, y) {
      try { return document.elementFromPoint(x, y); } catch (e) { return null; }
    }

    function autoScroll(x, y) {
      var under = elementAt(x, y);
      if (!under || !under.closest) return;
      var sc = under.closest(".task-pane, .calendar-pane, .sidebar-scroll, .board, .cal-tg-body");
      if (!sc) return;
      var r = sc.getBoundingClientRect();
      if (y < r.top + 64) sc.scrollTop -= 14;
      else if (y > r.bottom - 64) sc.scrollTop += 14;
    }

    document.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) return;
      var el = e.target.closest ? e.target.closest(".task[data-id], .board-card[data-id], .cal-chip[data-id]") : null;
      if (!el) return;
      var t = e.touches[0];
      touch.el = el;
      touch.sx = t.clientX; touch.sy = t.clientY;
      touch.lx = t.clientX; touch.ly = t.clientY;
      clearTimeout(touch.timer);
      touch.timer = setTimeout(function () {
        if (!touch.el) return;
        startTouchDrag(touch.el, touch.lx, touch.ly);
        highlightAt(touch.lx, touch.ly);
      }, 260);
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (!touch.el || e.touches.length !== 1) return;
      var t = e.touches[0];
      touch.lx = t.clientX; touch.ly = t.clientY;

      if (!touch.active) {
        // если палец поехал до срабатывания — это скролл, отменяем драг
        if (Math.abs(t.clientX - touch.sx) > 10 || Math.abs(t.clientY - touch.sy) > 10) {
          clearTimeout(touch.timer);
          touch.timer = null;
          touch.el = null;
        }
        return;
      }
      e.preventDefault();
      ghostAt(t.clientX, t.clientY);
      highlightAt(t.clientX, t.clientY);
      autoScroll(t.clientX, t.clientY);
    }, { passive: false });

    document.addEventListener("touchend", function () {
      if (!touch.el) return;
      var wasActive = touch.active;
      var x = touch.lx, y = touch.ly, id = touch.id;
      clearTimeout(touch.timer);
      if (wasActive) {
        var target = elementAt(x, y);
        endTouchDrag();
        if (target) performDrop(target, y, id);
      } else {
        touch.el = null;
      }
    }, { passive: true });

    document.addEventListener("touchcancel", function () {
      if (touch.active) endTouchDrag(); else { touch.el = null; clearTimeout(touch.timer); }
    }, { passive: true });
  }

  // Единая логика попадания: доска → список → зоны даты/списка/тега
  function performDrop(target, y, dragId) {
    if (!target || !target.closest) return;
    var col = target.closest(".board-col");
    if (col) {
      var overCard = target.closest(".board-card");
      var pos = beforeAfter(overCard, y);
      handleBoardDrop(dragId, col.getAttribute("data-col"), overCard ? overCard.getAttribute("data-id") : null, pos);
      return;
    }
    var card = target.closest(".task");
    if (card) {
      reorderTo(dragId, card.getAttribute("data-id"), beforeAfter(card, y));
      return;
    }
    var dropEl = target.closest("[data-drop-day], [data-drop-list], [data-drop-tag], [data-drop-quick]");
    if (dropEl) handleDropOnElement(dragId, dropEl);
  }

  function beforeAfter(el, y) {
    if (!el) return "after";
    var r = el.getBoundingClientRect();
    return y < r.top + r.height / 2 ? "before" : "after";
  }

  function highlightAt(x, y) {
    clearDropIndicators();
    var el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
    if (!el || !el.closest) return;
    var card = el.closest(".task, .board-card");
    if (card) {
      card.classList.add(beforeAfter(card, y) === "before" ? "drop-before" : "drop-after");
      var col = card.closest(".board-col");
      if (col) col.classList.add("drag-over");
      return;
    }
    var dropEl = el.closest("[data-drop-day], [data-drop-list], [data-drop-tag], [data-drop-quick], .board-col");
    if (dropEl) dropEl.classList.add("drag-over");
  }

  function calShift(dir) {
    var v = state.calView || "month";
    if (v === "month") {
      state.calMonth += dir;
      if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
      if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    } else if (v === "week") setCalAnchor(Store.addDaysStr(calAnchor(), dir * 7));
    else if (v === "3day") setCalAnchor(Store.addDaysStr(calAnchor(), dir * 3));
    else setCalAnchor(Store.addDaysStr(calAnchor(), dir));
    renderCalendar();
  }

  /* ============================================================
     Главный рендер
     ============================================================ */
  function renderAll() {
    applyTheme();
    $("#view-title").textContent = state.search ? "Поиск" : viewTitle();
    renderSidebar();

    var isCalendar = state.view === "calendar";
    var isHabits = state.view === "habits";
    var isFocus = state.view === "focus";
    $("#task-pane").classList.toggle("hidden", isCalendar || isHabits || isFocus);
    $("#calendar-pane").classList.toggle("hidden", !isCalendar);
    $("#habits-pane").classList.toggle("hidden", !isHabits);
    $("#focus-pane").classList.toggle("hidden", !isFocus);
    $("#quick-add").classList.toggle("hidden", isFocus);
    $("#select-btn").classList.toggle("is-active", state.selectMode);
    $("#view-mode-btn").classList.toggle("is-active", isBoardMode());
    // доска и групповой выбор применимы только к спискам задач
    $("#view-mode-btn").classList.toggle("hidden", isCalendar || isHabits || isFocus);
    $("#select-btn").classList.toggle("hidden", isCalendar || isHabits || isFocus);
    // полноэкранный календарь на мобильных
    document.body.classList.toggle("cal-mode", isCalendar);
    document.body.classList.toggle("day-sheet", isCalendar && !!state.daySheet);

    if (isCalendar) renderCalendar();
    else if (isHabits) renderHabits();
    else if (isFocus) renderFocus();
    else renderTaskList();

    renderBulkBar();

    if (state.selectedTaskId && !Store.getTask(state.selectedTaskId)) closeDetail();
    else if (state.selectedTaskId) renderDetail();
  }

  /* ============================================================
     Обработчики событий
     ============================================================ */
  function bindEvents() {
    // после тач-перетаскивания гасим ровно один «случайный» клик
    document.addEventListener("click", function (e) {
      if (suppressNextClick && Date.now() < suppressClickUntil) {
        suppressNextClick = false;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    // Сайдбар / навигация
    $("#menu-btn").addEventListener("click", function () { $("#sidebar").classList.add("open"); $("#sidebar-backdrop").classList.add("show"); });
    $("#sidebar-close").addEventListener("click", function () { $("#sidebar").classList.remove("open"); $("#sidebar-backdrop").classList.remove("show"); });
    $("#sidebar-backdrop").addEventListener("click", function () { $("#sidebar").classList.remove("open"); $("#sidebar-backdrop").classList.remove("show"); });

    // Навигация в сайдбаре: работает напрямую, а не только через hashchange
    // (в sandbox/iframe-вьюверах hashchange может не срабатывать)
    $("#sidebar").addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      e.preventDefault();
      var hash = a.getAttribute("href") || "#today";
      if (hash === "#" || hash === "#/") hash = "#today";
      navigate(hash);
    });

    $("#add-list-btn").addEventListener("click", function () { openListModal(null); });
    $("#add-tag-btn").addEventListener("click", openTagModal);
    $("#add-habit-btn").addEventListener("click", openHabitModal);
    $("#habits-add-top").addEventListener("click", openHabitModal);

    // Тема
    $("#theme-toggle").addEventListener("click", function () {
      var s = Store.getSettings();
      s.theme = s.theme === "dark" ? "light" : "dark";
      Store.saveSettings();
      applyTheme();
    });

    // Сортировка
    $("#sort-btn").addEventListener("click", function (e) { e.stopPropagation(); $("#sort-menu").classList.toggle("hidden"); });
    document.addEventListener("click", function () { $("#sort-menu").classList.add("hidden"); });
    $$("#sort-menu button").forEach(function (b) {
      b.addEventListener("click", function () {
        Store.getSettings().sort = b.getAttribute("data-sort");
        Store.saveSettings();
        $$("#sort-menu button").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        renderTaskList();
      });
    });

    // Поиск
    $("#search-input").addEventListener("input", debounce(function (e) {
      state.search = e.target.value;
      renderAll();
    }, 180));

    // Quick add
    $("#quick-add-input").addEventListener("keydown", function (e) { if (e.key === "Enter") addTaskFromInput(); });
    $("#qa-submit").addEventListener("click", addTaskFromInput);
    $("#qa-date").addEventListener("click", function (e) { e.stopPropagation(); $("#qa-date-pop").classList.toggle("hidden"); });
    $("#qa-prio").addEventListener("click", function () { state.quickPriority = (state.quickPriority + 1) % 4; updateQuickPrioBtn(); });
    $$("#qa-date-pop button[data-quick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-quick");
        var t = Store.todayStr();
        state.quickDate = v === "today" ? t : v === "tomorrow" ? Store.addDaysStr(t, 1) : v === "next-week" ? Store.addDaysStr(t, 7) : null;
        closeQuickPopovers();
      });
    });
    $("#qa-date-input").addEventListener("change", function (e) { state.quickDate = e.target.value || null; });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".quick-add")) closeQuickPopovers();
    });

    // Статистика / вид / множественный выбор
    $("#stats-btn").addEventListener("click", openStatsModal);
    $("#view-mode-btn").addEventListener("click", function () {
      var s = Store.getSettings();
      s.viewMode = s.viewMode === "board" ? "list" : "board";
      Store.saveSettings();
      clearSelection();
      renderAll();
      showToast(s.viewMode === "board" ? "Вид: доска" : "Вид: список");
    });
    $("#select-btn").addEventListener("click", function () {
      state.selectMode = !state.selectMode;
      if (!state.selectMode) clearSelection();
      renderAll();
      showToast(state.selectMode ? "Режим выделения включён" : "Режим выделения выключен");
    });

    // Панель групповых действий
    $("#bulk-bar").addEventListener("click", function (e) {
      var b = e.target.closest("[data-bulk]");
      if (!b) return;
      bulkAction(b.getAttribute("data-bulk"));
    });

    // Список задач — делегирование
    $("#task-list").addEventListener("click", function (e) {
      var actionEl = e.target.closest("[data-action]");
      var action = actionEl ? actionEl.getAttribute("data-action") : null;

      if (action === "clear-completed") {
        confirmModal("Очистить выполненные", "Все завершённые задачи будут удалены безвозвратно.", function () {
          Store.clearCompleted(); clearSelection(); renderAll(); showToast("Выполненные очищены");
        });
        return;
      }

      if (action === "more") {
        state.renderLimit = (state.renderLimit || 150) + 150;
        renderTaskList();
        return;
      }

      var taskEl = e.target.closest("[data-id]");
      if (!taskEl) return;
      var id = taskEl.getAttribute("data-id");

      if (state.selectMode) {
        if (action === "check") {
          var r0 = Store.toggleTask(id);
          if (r0 && r0.recurred) showToast("🔁 Следующая дата — " + Store.formatDate(r0.next));
          renderAll();
        } else {
          toggleSelected(id);
          renderAll();
        }
        return;
      }

      if (action === "check") {
        var res = Store.toggleTask(id);
        if (res && res.recurred) showToast("🔁 Повтор: следующая дата — " + Store.formatDate(res.next));
        renderAll();
      } else if (action === "select") {
        toggleSelected(id); renderAll();
      } else if (!action || action === "open" || action === "drag") {
        openDetail(id);
      }
    });

    // Доска: открытие карточки
    $("#board").addEventListener("click", function (e) {
      var card = e.target.closest("[data-id]");
      if (!card) return;
      openDetail(card.getAttribute("data-id"));
    });

    // Глобальный Drag & Drop
    bindDragAndDrop();

    // Календарь
    $$("#cal-view-switch button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.calView = b.getAttribute("data-calview");
        Store.getSettings().calendarView = state.calView;
        Store.saveSettings();
        renderCalendar();
      });
    });
    $("#cal-prev").addEventListener("click", function () { calShift(-1); });
    $("#cal-next").addEventListener("click", function () { calShift(1); });
    $("#cal-today").addEventListener("click", function () { setCalAnchor(Store.todayStr()); renderCalendar(); });

    // мобильный полноэкранный календарь: бургер и «+» в круге
    $("#cal-menu-btn").addEventListener("click", function () {
      $("#sidebar").classList.add("open");
      $("#sidebar-backdrop").classList.add("show");
    });
    $("#cal-fab").addEventListener("click", function () { addTaskFromFab(); });
    $("#sheet-backdrop").addEventListener("click", function () {
      state.daySheet = false;
      renderCalendar();
    });

    // переключатель вида календаря в сайдбаре (мобильный)
    $("#side-cal-switch").addEventListener("click", function (e) {
      var b = e.target.closest("[data-calview]");
      if (!b) return;
      state.calView = b.getAttribute("data-calview");
      Store.getSettings().calendarView = state.calView;
      Store.saveSettings();
      $("#sidebar").classList.remove("open");
      $("#sidebar-backdrop").classList.remove("show");
      navigate("#calendar");
    });
    $("#calendar-grid").addEventListener("click", function (e) {
      var addBtn = e.target.closest("[data-action='day-add']");
      if (addBtn) { e.stopPropagation(); openDateAddModal(addBtn.getAttribute("data-day")); return; }

      var chip = e.target.closest(".cal-chip[data-id]");
      if (chip) { openDetail(chip.getAttribute("data-id")); return; }

      // тап по пустому слоту времени → создать задачу на это время
      var slot = e.target.closest("[data-drop-hour]");
      if (slot) {
        createTaskAt(slot.getAttribute("data-drop-day"), +slot.getAttribute("data-drop-hour"));
        return;
      }

      // строка «весь день»
      var allDay = e.target.closest(".cal-tg-allday-cell[data-drop-day]");
      if (allDay) { createTaskAt(allDay.getAttribute("data-drop-day"), null); return; }

      // день месяца: с задачами — открыть панель дня, пустой — создать задачу
      var cell = e.target.closest(".cal-day[data-drop-day]");
      if (cell) {
        var hasTasks = !!cell.querySelector(".cal-chip, .cal-dot");
        if (hasTasks || cell.classList.contains("other-month")) {
          state.daySheet = true;
          setCalAnchor(cell.getAttribute("data-drop-day"));
          renderCalendar();
        } else {
          createTaskAt(cell.getAttribute("data-drop-day"), null);
        }
        return;
      }

      var head = e.target.closest("[data-day]");
      if (head) { setCalAnchor(head.getAttribute("data-day")); renderCalendar(); }
    });
    $("#calendar-grid").addEventListener("dblclick", function (e) {
      var day = e.target.closest("[data-drop-day]");
      if (!day) return;
      openDateAddModal(day.getAttribute("data-drop-day"));
    });
    $("#calendar-day-list").addEventListener("click", function (e) {
      var act = e.target.closest("[data-action]");
      if (act && act.getAttribute("data-action") === "day-add") {
        openDateAddModal(state.selectedDay);
        return;
      }
      var t = e.target.closest("[data-id]");
      if (!t) return;
      var id = t.getAttribute("data-id");
      var check = e.target.closest("[data-action='check']");
      if (check) {
        var rr = Store.toggleTask(id);
        if (rr && rr.recurred) showToast("🔁 Следующая дата — " + Store.formatDate(rr.next));
        renderAll();
      } else openDetail(id);
    });

    // Мини-календарь (сайдбар)
    $("#mini-cal").addEventListener("click", function (e) {
      var nav = e.target.closest("[data-mini]");
      if (nav) {
        state.miniM += +nav.getAttribute("data-mini");
        if (state.miniM > 11) { state.miniM = 0; state.miniY++; }
        if (state.miniM < 0) { state.miniM = 11; state.miniY--; }
        renderMiniCal();
        return;
      }
      var day = e.target.closest("[data-mini-day]");
      if (!day) return;
      setCalAnchor(day.getAttribute("data-mini-day"));
      navigate("#calendar");
    });

    // Привычки: навигация по неделям
    $("#habits-weeknav").addEventListener("click", function (e) {
      var b = e.target.closest("[data-week]");
      if (!b) return;
      var dir = +b.getAttribute("data-week");
      if (dir === 0) {
        state.habitWeekStart = null;
      } else {
        var ws = habitWeekStartDate();
        var nd = new Date(ws);
        nd.setDate(nd.getDate() + dir * 7);
        state.habitWeekStart = Store.toDateStr(nd);
      }
      renderHabits();
    });

    // Привычки
    $("#habits-grid").addEventListener("click", function (e) {
      var hb = e.target.closest(".habit-check");
      if (hb) { Store.toggleHabit(hb.getAttribute("data-habit"), hb.getAttribute("data-day")); renderHabits(); renderSidebar(); return; }
      var del = e.target.closest("[data-action='habit-del']");
      if (del) {
        var card = del.closest("[data-habit-id]");
        var hid = card.getAttribute("data-habit-id");
        var h = Store.getHabit(hid);
        confirmModal("Удалить привычку", "«" + (h ? h.name : "") + "» будет удалена безвозвратно.", function () { Store.deleteHabit(hid); renderHabits(); renderSidebar(); });
      }
    });

    // Фокус
    $("#focus-task").addEventListener("click", openFocusTaskModal);
    $("#timer-toggle").addEventListener("click", function () {
      if (state.timer.running) {
        clearInterval(state.timer.interval);
        state.timer.interval = null;
        state.timer.running = false;
        $("#timer-toggle").textContent = "Продолжить";
      } else {
        state.timer.running = true;
        $("#timer-toggle").textContent = "Пауза";
        state.timer.interval = setInterval(timerTick, 1000);
      }
    });
    $("#timer-reset").addEventListener("click", function () {
      clearInterval(state.timer.interval);
      state.timer.interval = null;
      state.timer.running = false;
      state.timer.remaining = state.timer.duration;
      $("#timer-toggle").textContent = "Старт";
      updateTimerDisplay();
    });
    $$("#timer-modes .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var min = +c.getAttribute("data-duration");
        setTimerMode(min, min === 25, c);
      });
    });

    // Детали задачи
    $("#detail-close").addEventListener("click", closeDetail);
    $("#detail-backdrop").addEventListener("click", closeDetail);
    $("#detail-delete").addEventListener("click", function () {
      var task = Store.getTask(state.selectedTaskId);
      if (!task) return;
      var backup = JSON.parse(JSON.stringify(task));
      Store.deleteTask(task.id);
      closeDetail();
      renderAll();
      showToast("Задача удалена", function () {
        backup.deleted = true;
        Store.getTasks().push(backup);
        Store.save();
        renderAll();
      });
    });
    $("#detail-body").addEventListener("click", function (e) {
      var row = e.target.closest("[data-action]");
      if (!row) return;
      var id = state.selectedTaskId;
      var a = row.getAttribute("data-action");
      if (a === "d-complete") {
        var r = Store.toggleTask(id);
        if (r && r.recurred) showToast("🔁 Повтор: следующая дата — " + Store.formatDate(r.next));
        renderAll();
      }
      else if (a === "d-date") openDateModal(id);
      else if (a === "d-color") openColorModal(id);
      else if (a === "d-remind") openRemindModal(id);
      else if (a === "d-priority") openPriorityModal(id);
      else if (a === "d-list") openListPickerModal(id);
      else if (a === "d-tags") openTagsModal(id);
      else if (a === "d-repeat") openRepeatModal(id);
      else if (a === "d-status") openStatusModal(id);
      else if (a === "sub-check") {
        var sub = row.closest(".subtask");
        var i = +sub.getAttribute("data-i");
        var task = Store.getTask(id);
        task.subtasks[i].completed = !task.subtasks[i].completed;
        Store.updateTask(id, { subtasks: task.subtasks });
        renderDetail(); renderTaskList();
      } else if (a === "sub-del") {
        var sub2 = row.closest(".subtask");
        var i2 = +sub2.getAttribute("data-i");
        var task2 = Store.getTask(id);
        task2.subtasks.splice(i2, 1);
        Store.updateTask(id, { subtasks: task2.subtasks });
        renderDetail(); renderTaskList();
      }
    });

    // Модальные
    $("#modal-backdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      var el = document.activeElement;
      var tag = (el && el.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable);

      if (e.key === "Escape") {
        closeModal(); closeDetail();
        $("#sidebar").classList.remove("open");
        $("#sidebar-backdrop").classList.remove("show");
        if (state.selectMode) { state.selectMode = false; clearSelection(); renderAll(); }
        return;
      }
      if (typing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      var k = e.key.toLowerCase();
      var views = { "1": "today", "2": "tomorrow", "3": "next7", "4": "calendar", "5": "inbox", "6": "all" };
      if (views[k]) { navigate("#" + views[k]); return; }
      if (k === "n" || k === "т" || k === "а" || k === "ф") { $("#quick-add-input").focus(); return; }
      if (k === "/" ) { e.preventDefault(); $("#search-input").focus(); return; }
      if (k === "b" || k === "и") {
        var s = Store.getSettings();
        s.viewMode = s.viewMode === "board" ? "list" : "board";
        Store.saveSettings(); renderAll();
        return;
      }
      if (k === "v" || k === "м") {
        state.selectMode = !state.selectMode;
        if (!state.selectMode) clearSelection();
        renderAll();
      }
    });

    // Хэш-навигация (для настоящего браузера: кнопки «назад/вперёд», прямые ссылки)
    window.addEventListener("hashchange", function () {
      var h = location.hash || "#today";
      // если этот переход мы уже обработали в navigate() — ничего не трогаем,
      // иначе открытая панель задач и строка поиска будут сбрасываться
      if (h === state.lastNavKey) return;
      state.lastNavKey = h;
      parseHash(h);
      closeDetail();
      renderAll();
    });

    // пересчёт плейсхолдера при изменении ширины (поворот экрана)
    window.addEventListener("resize", debounce(updateQuickAddPlaceholder, 200));
  }

  // Создание задачи тапом по календарю: сразу открываем редактор
  function createTaskAt(dateStr, hour, exactTime) {
    if (!dateStr) return null;
    var time = exactTime || (hour == null ? null : pad2(hour) + ":00");
    var task = Store.addTask({
      title: "",
      dueDate: dateStr,
      time: time,
      listId: state.view === "list" ? state.listId : null
    });
    setCalAnchor(dateStr);
    renderAll();
    openDetail(task.id);
    var ti = $("#detail-title");
    if (ti) { try { ti.focus(); } catch (e) { /* ignore */ } }
    showToast("Задача на " + Store.formatDate(dateStr) + (time ? ", " + time : "") + " — введите название");
    return task;
  }

  // «+» в календаре: задача на ближайшие полчаса выбранного дня
  function addTaskFromFab() {
    var day = state.selectedDay || Store.todayStr();
    var now = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    var rounded = Math.ceil((mins + 1) / 30) * 30;
    if (rounded >= 24 * 60) { rounded = 0; day = Store.addDaysStr(day, 1); }
    var time = pad2(Math.floor(rounded / 60)) + ":" + pad2(rounded % 60);
    createTaskAt(day, null, time);
  }

  // короткий плейсхолдер на узких экранах (иначе он обрезается)
  function updateQuickAddPlaceholder() {
    var inp = $("#quick-add-input");
    if (!inp) return;
    var narrow = window.innerWidth <= 640;
    inp.placeholder = narrow
      ? "Добавить задачу…"
      : "Добавить задачу, например «Купить молоко завтра 9:00»";
  }

  // Если браузер проигнорировал viewport и отрисовал страницу шире экрана —
  // переприменяем meta, чтобы масштаб был ровно 100%.
  function fixViewportIfNeeded() {
    try {
      var m = document.querySelector('meta[name="viewport"]');
      if (!m) return;
      var iw = window.innerWidth || 0;
      var sw = (window.screen && window.screen.width) || 0;
      var zoomedOut = !!(window.visualViewport && window.visualViewport.scale < 0.95);
      var tooWide = sw >= 280 && sw <= 560 && iw > sw + 120;
      if (zoomedOut || tooWide) {
        m.setAttribute("content", "width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover");
      }
    } catch (e) { /* ignore */ }
  }

  function openDateAddModal(dayOverride) {
    var ds = dayOverride || state.selectedDay || Store.todayStr();
    openModal('<h3>Новая задача на ' + esc(Store.formatDate(ds)) + '</h3>' +
      '<div class="field"><label>Название</label><input type="text" id="day-add-title" placeholder="Название задачи" /></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close>Отмена</button><button class="btn btn-primary" id="day-add-save">Добавить</button></div>',
      function (card) {
        card.querySelector('[data-close]').addEventListener("click", closeModal);
        $("#day-add-save", card).addEventListener("click", function () {
          var title = $("#day-add-title", card).value.trim();
          if (!title) return;
          Store.addTask({ title: title, dueDate: ds, listId: state.view === "list" ? state.listId : null });
          closeModal(); renderAll();
        });
        $("#day-add-title", card).addEventListener("keydown", function (e) { if (e.key === "Enter") $("#day-add-save", card).click(); });
        $("#day-add-title", card).focus();
      });
  }

  /* ============================================================
     Инициализация
     ============================================================ */
  function init() {
    // активная сортировка в меню
    var sort = Store.getSettings().sort || "smart";
    $$("#sort-menu button").forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-sort") === sort); });

    applyTheme();
    updateQuickPrioBtn();

    // восстановить вид календаря и режим отображения
    var settings = Store.getSettings();
    state.calView = settings.calendarView || "month";
    if (state.calView === "month") {
      var n = new Date();
      state.calYear = n.getFullYear();
      state.calMonth = n.getMonth();
    }

    bindEvents();
    parseHash();
    try { state.lastNavKey = location.hash || "#today"; } catch (e) { state.lastNavKey = "#today"; }
    updateQuickAddPlaceholder();
    renderAll();
    fixViewportIfNeeded();
    setTimeout(fixViewportIfNeeded, 300);
    window.addEventListener("orientationchange", function () { setTimeout(fixViewportIfNeeded, 250); });
    $("#quick-add-input").focus();

    // напоминания: проверяем раз в 30 секунд
    if (settings.notify) requestNotifyPermission();
    checkReminders();
    state.reminderTimer = setInterval(checkReminders, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

