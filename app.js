const STORAGE_KEY = "calendar-events";
const HOUR_HEIGHT = 48;
const COLORS = ["#1a73e8", "#0b8043", "#d93025", "#e37400", "#8e24aa"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const state = {
  view: "month",
  date: startOfDay(new Date()),
  events: loadEvents(),
};

const $ = (selector) => document.querySelector(selector);

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

const pad = (n) => String(n).padStart(2, "0");

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const startOfWeek = (d) => addDays(d, -d.getDay());

const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const toMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + pad(m) : ""}${h < 12 ? "am" : "pm"}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function eventsOn(key) {
  return state.events
    .filter((e) => e.date === key)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function render() {
  $("#view-month").setAttribute("aria-pressed", state.view === "month");
  $("#view-week").setAttribute("aria-pressed", state.view === "week");

  if (state.view === "month") renderMonth();
  else renderWeek();
  renderMini();
}

function renderMonth() {
  const year = state.date.getFullYear();
  const month = state.date.getMonth();
  const today = toKey(new Date());
  const gridStart = startOfWeek(new Date(year, month, 1));

  $("#title").textContent = `${MONTHS[month]} ${year}`;

  let html = `<div class="weekdays">${DAYS.map((d) => `<div>${d}</div>`).join("")}</div>`;
  html += '<div class="month-grid">';

  for (let i = 0; i < 42; i++) {
    const day = addDays(gridStart, i);
    const key = toKey(day);
    const list = eventsOn(key);
    const outside = day.getMonth() !== month ? " outside" : "";
    const label = `${DAYS[day.getDay()]} ${MONTHS[day.getMonth()]} ${day.getDate()}`;

    html += `<div class="cell${outside}" data-date="${key}" aria-label="${label}">`;
    html += `<span class="day-num${key === today ? " today" : ""}">${day.getDate()}</span>`;
    html += list.slice(0, 3).map(chipHtml).join("");
    if (list.length > 3) html += `<div class="more" data-week="${key}">${list.length - 3} more</div>`;
    html += "</div>";
  }

  $("#view").innerHTML = html + "</div>";
}

function chipHtml(e) {
  return `<div class="chip" data-id="${e.id}" style="--c:${e.color}">` +
         `<i></i>${formatTime(e.start)} ${escapeHtml(e.title)}</div>`;
}

function renderWeek() {
  const weekStart = startOfWeek(state.date);
  const weekEnd = addDays(weekStart, 6);
  const today = toKey(new Date());

  $("#title").textContent = weekTitle(weekStart, weekEnd);

  let html = '<div class="weekdays week-head"><div></div>';
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    html += `<div class="${toKey(day) === today ? "today" : ""}">${DAYS[i]}<b>${day.getDate()}</b></div>`;
  }
  html += "</div>";

  html += '<div class="week-scroll" id="week-scroll"><div class="hours">';
  for (let h = 0; h < 24; h++) {
    html += `<div>${h ? `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` : ""}</div>`;
  }
  html += "</div>";

  for (let i = 0; i < 7; i++) {
    const key = toKey(addDays(weekStart, i));
    html += `<div class="day-col" data-date="${key}">${dayColumnHtml(key, key === today)}</div>`;
  }

  $("#view").innerHTML = html + "</div>";
  $("#week-scroll").scrollTop = 7.5 * HOUR_HEIGHT;
}

function weekTitle(start, end) {
  if (start.getMonth() === end.getMonth()) return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  return `${MONTHS[start.getMonth()].slice(0, 3)} - ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
}

function dayColumnHtml(key, isToday) {
  const list = eventsOn(key);

  const laneEnds = [];
  const lanes = list.map((e) => {
    let lane = laneEnds.findIndex((end) => end <= toMinutes(e.start));
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = Math.max(toMinutes(e.end), toMinutes(e.start) + 30);
    return lane;
  });
  const width = 100 / Math.max(laneEnds.length, 1);

  let html = list.map((e, i) => {
    const top = (toMinutes(e.start) / 60) * HOUR_HEIGHT;
    const height = Math.max(22, ((toMinutes(e.end) - toMinutes(e.start)) / 60) * HOUR_HEIGHT - 2);
    return `<div class="week-event" data-id="${e.id}" ` +
           `style="--c:${e.color};top:${top}px;height:${height}px;left:${lanes[i] * width}%;width:${width}%">` +
           `${escapeHtml(e.title)}<small>${formatTime(e.start)} - ${formatTime(e.end)}</small></div>`;
  }).join("");

  if (isToday) {
    const now = new Date();
    const top = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT;
    html += `<div class="now-line" style="top:${top}px"></div>`;
  }
  return html;
}

function renderMini() {
  const year = state.date.getFullYear();
  const month = state.date.getMonth();
  const today = toKey(new Date());
  const selected = toKey(state.date);
  const gridStart = startOfWeek(new Date(year, month, 1));

  let html = `<h2>${MONTHS[month]} ${year}</h2><div class="mini-grid">`;
  html += DAYS.map((d) => `<span>${d[0]}</span>`).join("");

  for (let i = 0; i < 42; i++) {
    const day = addDays(gridStart, i);
    const key = toKey(day);
    const classes = [
      day.getMonth() !== month && "outside",
      key === selected && "selected",
      key === today && "today",
    ].filter(Boolean).join(" ");
    html += `<button data-date="${key}" class="${classes}">${day.getDate()}</button>`;
  }

  $("#mini").innerHTML = html + "</div>";
}

function goToday() {
  state.date = startOfDay(new Date());
  render();
}

function step(direction) {
  state.date = state.view === "month"
    ? new Date(state.date.getFullYear(), state.date.getMonth() + direction, 1)
    : addDays(state.date, 7 * direction);
  render();
}

function setView(view) {
  state.view = view;
  render();
}

$("#today").onclick = goToday;
$("#prev").onclick = () => step(-1);
$("#next").onclick = () => step(1);
$("#view-month").onclick = () => setView("month");
$("#view-week").onclick = () => setView("week");

$("#mini").onclick = (e) => {
  const button = e.target.closest("[data-date]");
  if (!button) return;
  state.date = fromKey(button.dataset.date);
  render();
};

$("#view").onclick = (e) => {
  const more = e.target.closest("[data-week]");
  if (more) {
    state.date = fromKey(more.dataset.week);
    return setView("week");
  }
};

render();
