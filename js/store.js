/* ============================================================
   TaskTick — слой данных и утилиты
   ============================================================ */
(function (global) {
  "use strict";

  var KEY = "tasktick.v1";

  /* ---------- Утилиты дат ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  // Локальная дата в формате YYYY-MM-DD (без сдвига часовых поясов)
  function toDateStr(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function todayStr() { return toDateStr(new Date()); }

  function parseDateStr(s) {
    if (!s) return null;
    var parts = s.split("-");
    if (parts.length !== 3) return null;
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function addDaysStr(s, n) {
    var d = parseDateStr(s) || new Date();
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }

  function isSameDay(a, b) { return a === b; }

  function startOfWeek(d) {
    var x = new Date(d);
    var day = (x.getDay() + 6) % 7; // понедельник = 0
    x.setDate(x.getDate() - day);
    return x;
  }

  function formatDate(s) {
    var d = parseDateStr(s);
    if (!d) return "";
    var now = new Date();
    var t = todayStr();
    if (s === t) return "Сегодня";
    if (s === addDaysStr(t, 1)) return "Завтра";
    if (s === addDaysStr(t, -1)) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) +
      (d.getFullYear() !== now.getFullYear() ? " " + d.getFullYear() : "");
  }

  function weekdayShort(s) {
    var d = parseDateStr(s);
    if (!d) return "";
    return d.toLocaleDateString("ru-RU", { weekday: "short" });
  }

  var WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- Модель по умолчанию ---------- */
  function defaultData() {
    var t = todayStr();
    return {
      tasks: [],
      lists: [
        { id: "personal", name: "Личное", color: "#4772fa" },
        { id: "work", name: "Работа", color: "#f5a623" },
        { id: "shopping", name: "Покупки", color: "#3bb96f" }
      ],
      tags: [
        { id: "important", name: "важное", color: "#e5484d" },
        { id: "home", name: "дом", color: "#7c5cff" }
      ],
      habits: [],
      settings: {
        theme: "light",
        sort: "smart",
        focusTaskId: null,
        calendarView: "month",
        viewMode: "list",
        notify: false
      },
      stats: { completedByDate: {} },
      focusStats: { sessions: 0, minutes: 0 },
      nextTaskOrder: 100
    };
  }

  /* ---------- Повторяющиеся задачи ---------- */
  var REPEATS = ["Ежедневно", "Еженедельно", "Ежемесячно", "По будням"];

  function nextRepeatDate(dateStr, repeat) {
    var d = parseDateStr(dateStr) || new Date();
    if (repeat === "Еженедельно") d.setDate(d.getDate() + 7);
    else if (repeat === "Ежемесячно") d.setMonth(d.getMonth() + 1);
    else if (repeat === "По будням") {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    } else d.setDate(d.getDate() + 1); // Ежедневно и по умолчанию
    return toDateStr(d);
  }

  /* ---------- Загрузка / сохранение ---------- */
  var data;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        data = JSON.parse(raw);
        // гарантируем наличие полей
        data.lists = data.lists || [];
        data.tags = data.tags || [];
        data.habits = data.habits || [];
        data.tasks = data.tasks || [];
        data.settings = data.settings || { theme: "light", sort: "smart" };
        data.focusStats = data.focusStats || { sessions: 0, minutes: 0 };
        data.stats = data.stats || { completedByDate: {} };
        data.stats.completedByDate = data.stats.completedByDate || {};
        if (data.settings.calendarView == null) data.settings.calendarView = "month";
        if (data.settings.viewMode == null) data.settings.viewMode = "list";
        if (data.settings.notify == null) data.settings.notify = false;
        if (data.nextTaskOrder == null) data.nextTaskOrder = 100;
        // миграция задач: статус для Kanban и поля напоминаний
        data.tasks.forEach(function (t) {
          if (t.status == null) t.status = t.completed ? "done" : "todo";
          if (t.remind === undefined) t.remind = null;
          t.subtasks = t.subtasks || [];
          t.tags = t.tags || [];
        });
        return;
      }
    } catch (e) { /* повреждённые данные — пересоздаём */ }
    data = defaultData();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* quota */ }
  }

  function resetAll() {
    data = defaultData();
    save();
  }

  /* ---------- Доступ ---------- */
  var Store = {
    get data() { return data; },
    load: load,
    save: save,
    resetAll: resetAll,
    todayStr: todayStr,
    toDateStr: toDateStr,
    parseDateStr: parseDateStr,
    addDaysStr: addDaysStr,
    formatDate: formatDate,
    weekdayShort: weekdayShort,
    WEEKDAYS: WEEKDAYS,
    startOfWeek: startOfWeek,
    uid: uid,

    /* Задачи */
    getTasks: function () { return data.tasks; },
    getTask: function (id) {
      for (var i = 0; i < data.tasks.length; i++) if (data.tasks[i].id === id) return data.tasks[i];
      return null;
    },
    addTask: function (task) {
      task.id = task.id || uid();
      task.order = task.order != null ? task.order : (data.nextTaskOrder++);
      task.createdAt = task.createdAt || Date.now();
      task.subtasks = task.subtasks || [];
      task.tags = task.tags || [];
      if (task.status == null) task.status = "todo";
      if (task.remind === undefined) task.remind = null;
      data.tasks.push(task);
      save();
      return task;
    },
    updateTask: function (id, patch) {
      var t = Store.getTask(id);
      if (!t) return;
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) t[k] = patch[k];
      save();
    },
    deleteTask: function (id) {
      data.tasks = data.tasks.filter(function (t) { return t.id !== id; });
      if (data.settings.focusTaskId === id) data.settings.focusTaskId = null;
      save();
    },
    completeTask: function (id) {
      var t = Store.getTask(id);
      if (!t || t.completed) return null;
      var st = data.stats || (data.stats = { completedByDate: {} });
      st.completedByDate = st.completedByDate || {};
      var today = todayStr();
      st.completedByDate[today] = (st.completedByDate[today] || 0) + 1;
      if (t.repeat) {
        // повторяющуюся задачу не «закрываем», а переносим на следующий период
        t.dueDate = nextRepeatDate(t.dueDate || today, t.repeat);
        t.completed = false;
        t.completedAt = null;
        t.status = "todo";
        t.remindFired = null;
        t.lastCompletedAt = Date.now();
        save();
        return { recurred: true, next: t.dueDate };
      }
      t.completed = true;
      t.completedAt = Date.now();
      t.status = "done";
      save();
      return { recurred: false };
    },
    uncompleteTask: function (id) {
      var t = Store.getTask(id);
      if (!t || !t.completed) return;
      t.completed = false;
      t.completedAt = null;
      if (t.status === "done") t.status = "todo";
      var st = data.stats;
      var today = todayStr();
      if (st && st.completedByDate && st.completedByDate[today] > 0) st.completedByDate[today]--;
      save();
    },
    toggleTask: function (id) {
      var t = Store.getTask(id);
      if (!t) return null;
      if (t.completed) { Store.uncompleteTask(id); return { recurred: false, uncompleted: true }; }
      return Store.completeTask(id);
    },
    setTaskCompleted: function (id, done) {
      var t = Store.getTask(id);
      if (!t || t.completed === done) return;
      if (done) Store.completeTask(id); else Store.uncompleteTask(id);
    },
    setStatus: function (id, status) {
      var t = Store.getTask(id);
      if (!t) return;
      if (status === "done") { if (!t.completed) Store.completeTask(id); }
      else {
        if (t.completed) Store.uncompleteTask(id);
        t.status = status;
        save();
      }
    },
    clearCompleted: function () {
      data.tasks = data.tasks.filter(function (t) { return !t.completed; });
      save();
    },
    getStats: function () { return data.stats || { completedByDate: {} }; },
    completedOn: function (dateStr) {
      var st = data.stats || { completedByDate: {} };
      return (st.completedByDate || {})[dateStr] || 0;
    },
    nextRepeatDate: nextRepeatDate,
    REPEATS: REPEATS,
    reorder: function (ids) {
      ids.forEach(function (id, i) {
        var t = Store.getTask(id);
        if (t) t.order = i;
      });
      save();
    },

    /* Списки */
    getLists: function () { return data.lists; },
    getList: function (id) {
      for (var i = 0; i < data.lists.length; i++) if (data.lists[i].id === id) return data.lists[i];
      return null;
    },
    addList: function (list) {
      list.id = list.id || uid();
      data.lists.push(list);
      save();
      return list;
    },
    updateList: function (id, patch) {
      var l = Store.getList(id);
      if (!l) return;
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) l[k] = patch[k];
      save();
    },
    deleteList: function (id) {
      data.lists = data.lists.filter(function (l) { return l.id !== id; });
      data.tasks.forEach(function (t) { if (t.listId === id) t.listId = null; });
      save();
    },

    /* Теги */
    getTags: function () { return data.tags; },
    getTag: function (id) {
      for (var i = 0; i < data.tags.length; i++) if (data.tags[i].id === id) return data.tags[i];
      return null;
    },
    addTag: function (tag) {
      tag.id = tag.id || uid();
      data.tags.push(tag);
      save();
      return tag;
    },
    deleteTag: function (id) {
      data.tags = data.tags.filter(function (t) { return t.id !== id; });
      data.tasks.forEach(function (task) {
        task.tags = (task.tags || []).filter(function (x) { return x !== id; });
      });
      save();
    },

    /* Привычки */
    getHabits: function () { return data.habits; },
    getHabit: function (id) {
      for (var i = 0; i < data.habits.length; i++) if (data.habits[i].id === id) return data.habits[i];
      return null;
    },
    addHabit: function (h) {
      h.id = h.id || uid();
      h.completions = h.completions || {};
      data.habits.push(h);
      save();
      return h;
    },
    updateHabit: function (id, patch) {
      for (var i = 0; i < data.habits.length; i++) {
        if (data.habits[i].id === id) {
          for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) data.habits[i][k] = patch[k];
          break;
        }
      }
      save();
    },
    deleteHabit: function (id) {
      data.habits = data.habits.filter(function (h) { return h.id !== id; });
      save();
    },
    toggleHabit: function (id, dateStr) {
      var h = Store.getHabit(id);
      if (!h) return null;
      if (!h.completions) h.completions = {};
      var next = !(h.completions[dateStr] === true);
      if (next) h.completions[dateStr] = true;
      else delete h.completions[dateStr];
      save();
      return next;
    },
    habitStreak: function (h) {
      var c = h.completions || {};
      var streak = 0;
      var d = new Date();
      // если сегодня не отмечено — серия ещё «жива», считаем со вчера
      if (c[todayStr()] !== true) d.setDate(d.getDate() - 1);
      while (c[toDateStr(d)] === true) { streak++; d.setDate(d.getDate() - 1); }
      return streak;
    },
    habitBestStreak: function (h) {
      var c = h.completions || {};
      var days = Object.keys(c).filter(function (k) { return c[k] === true; }).sort();
      var best = 0, cur = 0, prev = null;
      for (var i = 0; i < days.length; i++) {
        var d = parseDateStr(days[i]);
        if (!d) continue;
        if (prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1) cur++;
        else cur = 1;
        prev = d;
        if (cur > best) best = cur;
      }
      return best;
    },
    habitTotal: function (h) {
      var c = h.completions || {};
      return Object.keys(c).filter(function (k) { return c[k] === true; }).length;
    },
    habitWeekCount: function (h, weekStartStr) {
      var c = h.completions || {}, n = 0;
      for (var i = 0; i < 7; i++) if (c[addDaysStr(weekStartStr, i)] === true) n++;
      return n;
    },

    /* Настройки и статистика */
    getSettings: function () { return data.settings; },
    saveSettings: function () { save(); },
    getFocusStats: function () { return data.focusStats; }
  };

  // Инициализация при загрузке скрипта
  load();

  global.Store = Store;
})(window);
