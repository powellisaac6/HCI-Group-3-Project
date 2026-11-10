const STORAGE_KEY = "calendar-events";
// read from the css variable so the week view and the stylesheet stay in sync
const HOUR_HEIGHT = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue("--hour-height"),
);
const CLASS_COLOR = "#7c8cff";
const DUE_COLOR = "#ff3d7f";
// hardcoded for now, the "upload" just loads this
const SYLLABUS = {
  file: "syllabus.pdf",
  title: "Review syllabus",
  info: "Tue & Thu, 11:30am - 12:45pm, ECSS 2.412",
  noClass: ["2026-11-24", "2026-11-26"],
  deadlines: [
    ["2026-08-30", "DP0 Due"],
    ["2026-09-13", "DP1 Due"],
    ["2026-09-27", "DP2 Due"],
    ["2026-10-18", "DP3 Due"],
    ["2026-11-03", "DP4 Progress Check"],
    ["2026-11-15", "DP4 Due"],
    ["2026-11-22", "DP5 Due"],
    ["2026-12-13", "DP6 Due"],
  ],
};
const WORK_COLOR = "#2de2b6";
// hardcoded like the syllabus; matches what's printed in work_schedule.pdf
const WORK = {
  file: "work_schedule.pdf",
  title: "Review work schedule",
  heading: "Campus Corner Café - Barista",
  // regular weekly shifts, by day of week (0 = Sun ... 6 = Sat)
  weekly: [
    { day: 1, start: "17:00", end: "21:00" },
    { day: 3, start: "16:00", end: "21:00" },
    { day: 6, start: "10:00", end: "16:00" },
  ],
  // one-off shifts picked up in November
  extra: [
    {
      date: "2026-11-03",
      start: "10:00",
      end: "13:00",
      note: "Covering for Jordan",
    },
    { date: "2026-11-12", start: "12:00", end: "16:00", note: "Inventory day" },
    { date: "2026-11-15", start: "19:00", end: "23:30", note: "Closing shift" },
    {
      date: "2026-11-19",
      start: "11:00",
      end: "15:00",
      note: "Catering event",
    },
  ],
};
// set to false if a late shift on a due date shouldn't count as a conflict
const DEADLINES_CAN_CONFLICT = true;

// deadlines can be split into checkpoints ("mini-deadlines") that are
// placed in free time leading up to the due date so nothing collides
const MINI_COLOR = "#c06cff";
const MINI_STEPS = [
  { label: "Outline", daysBefore: 7 },
  { label: "Draft", daysBefore: 4 },
  { label: "Review", daysBefore: 1 },
];

// the two upload flows share one dialog; each one fills in these pieces
const UPLOADS = {
  syllabus: {
    doc: () => SYLLABUS,
    heading: "CS 4352 - Foundations of HCI",
    prefix: "syl-",
    events: () => syllabusEvents(),
    info: (events) =>
      `${SYLLABUS.info} - ${events.filter((e) => e.id.startsWith("syl-class")).length} class sessions`,
    list: () =>
      SYLLABUS.deadlines
        .map(([date, title]) => `<li><b>${title}</b> ${date.slice(5)}</li>`)
        .join(""),
    done: (events) => {
      const classes = events.filter((e) => e.id.startsWith("syl-class")).length;
      return `${events.length} events added: ${classes} class sessions and ${events.length - classes} deadlines.`;
    },
  },
  work: {
    doc: () => WORK,
    heading: WORK.heading,
    prefix: "work-",
    events: () => workEvents(),
    info: (events) =>
      `${events.length} shifts found: 3 regular weekly shifts plus ${WORK.extra.length} picked-up shifts`,
    list: () =>
      WORK.weekly
        .map(
          (s) =>
            `<li><b>Every ${DAYS[s.day]}</b> ${formatTime(s.start)} - ${formatTime(s.end)}</li>`,
        )
        .join("") +
      WORK.extra
        .map(
          (s) =>
            `<li><b>${s.note}</b> ${s.date.slice(5)}, ${formatTime(s.start)} - ${formatTime(s.end)}</li>`,
        )
        .join(""),
    done: (events) => `${events.length} work shifts added to your calendar.`,
  },
};

// events from the upload dialog, only saved once the user hits "Add to calendar"
let pendingEvents = [];
let currentUpload = "syllabus";
// conflict currently open in the conflicts dialog
let openConflict = null;
// event currently open in the event dialog (the mini-deadline button needs it)
let openEventId = null;
let previewMiniEvents = []; // tracks proposed checkpoints before confirmation

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// date is whatever day/week/month we're looking at, not necessarily today
const state = {
  view: "month",
  date: startOfDay(new Date()),
  events: loadEvents(),
  conflicts: [],
};

const $ = (selector) => document.querySelector(selector);

// bad or missing JSON just means an empty calendar
function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

// localStorage can throw (private mode, full quota), not worth crashing over
function saveEvents() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  } catch {}
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

// weeks start on Sunday
const startOfWeek = (d) => addDays(d, -d.getDay());

// "2026-11-02" style keys, used to match events to days
const toKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// parse by hand, new Date("2026-11-02") would shift a day in US timezones
function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// "13:30" -> minutes since midnight
const toMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// "13:30" + 60 -> "14:30"
const addMinutes = (t, mins) => {
  const total = toMinutes(t) + mins;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

// "13:30" -> "1:30pm", drops the minutes when it's on the hour
function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + pad(m) : ""}${h < 12 ? "am" : "pm"}`;
}

// titles go into innerHTML below, so escape them
function escapeHtml(s) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

function eventsOn(key) {
  return state.events
    .filter((e) => e.date === key)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// ---- conflict detection ----

const isWork = (e) => e.id.startsWith("work-");
// mini-deadlines belong to a deadline, so they count as school work too
const isMini = (e) => Boolean(e.parent);
const isSchool = (e) =>
  (e.id.startsWith("syl-") || isMini(e)) &&
  (DEADLINES_CAN_CONFLICT || !e.id.startsWith("syl-due"));

// a conflict is a school event and a work shift on the same day whose times overlap
function findConflicts(events) {
  const conflicts = [];
  const school = events.filter(isSchool);
  const work = events.filter(isWork);

  school.forEach((s) => {
    work.forEach((w) => {
      if (s.date !== w.date) return;
      // two time ranges overlap when each one starts before the other ends
      const start = Math.max(toMinutes(s.start), toMinutes(w.start));
      const end = Math.min(toMinutes(s.end), toMinutes(w.end));
      if (start < end)
        conflicts.push({
          id: `${s.id}|${w.id}`,
          date: s.date,
          school: s,
          work: w,
          start,
          end,
        });
    });
  });

  return conflicts.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
  );
}

const conflictsOn = (key) => state.conflicts.filter((c) => c.date === key);
const conflictsFor = (id) =>
  state.conflicts.filter((c) => c.school.id === id || c.work.id === id);

// minutes since midnight -> "1:30pm"
const minutesToTime = (m) =>
  formatTime(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

function formatLongDate(key) {
  return fromKey(key).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(key) {
  return fromKey(key).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// no framework, just rebuild the whole view whenever something changes
function render() {
  $("#view-month").setAttribute("aria-pressed", state.view === "month");
  $("#view-week").setAttribute("aria-pressed", state.view === "week");

  // recompute every render so conflicts always match what's on the calendar
  state.conflicts = findConflicts(state.events);

  if (state.view === "month") renderMonth();
  else renderWeek();
  renderMini();
  renderConflictAlert();
}

// sidebar card: tells the user whether anything overlaps, and how to see it
function renderConflictAlert() {
  const alert = $("#conflict-alert");
  const hasSchool = state.events.some(isSchool);
  const hasWork = state.events.some(isWork);
  const count = state.conflicts.length;

  if (!hasSchool || !hasWork) {
    alert.className = "conflict-alert hint";
    alert.innerHTML =
      `<strong>Check for conflicts</strong>` +
      `<span>Upload your ${!hasSchool ? "syllabus" : ""}${!hasSchool && !hasWork ? " and " : ""}` +
      `${!hasWork ? "work schedule" : ""} to see where school and work overlap.</span>`;
  } else if (count === 0) {
    alert.className = "conflict-alert ok";
    alert.innerHTML = `<strong>✓ No conflicts found</strong><span>Your classes and shifts don't overlap.</span>`;
  } else {
    const next = state.conflicts[0];
    alert.className = "conflict-alert danger";
    alert.innerHTML =
      `<strong>⚠ ${count} schedule conflict${count === 1 ? "" : "s"}</strong>` +
      `<span>First: ${formatShortDate(next.date)}, ${escapeHtml(next.school.title)}</span>` +
      `<button class="btn danger" id="view-conflicts">View conflicts</button>`;
  }
}

function renderMonth() {
  const year = state.date.getFullYear();
  const month = state.date.getMonth();
  const today = toKey(new Date());
  // always 6 rows (42 days) so the grid doesn't change height between months
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

    const dayConflicts = conflictsOn(key).length;
    const conflictClass = dayConflicts ? " has-conflict" : "";

    html += `<div class="cell${outside}${conflictClass}" aria-label="${label}${dayConflicts ? ", has a conflict" : ""}">`;
    html += `<span class="day-num${key === today ? " today" : ""}">${day.getDate()}</span>`;
    // red badge on days with an overlap; clicking it opens that conflict
    if (dayConflicts)
      html += `<span class="conflict-badge" data-conflict-day="${key}" title="Schedule conflict">⚠</span>`;
    // cells are small, so only show 3 and link the rest to the week view
    html += list.slice(0, 3).map(chipHtml).join("");
    if (list.length > 3)
      html += `<div class="more" data-week="${key}">${list.length - 3} more</div>`;
    html += "</div>";
  }

  $("#view").innerHTML = html + "</div>";
}

function chipHtml(e) {
  const conflict = conflictsFor(e.id).length > 0;
  return (
    `<div class="chip${conflict ? " conflict" : ""}" data-id="${e.id}" style="--c:${e.color}">` +
    `<i></i>${conflict ? "⚠ " : ""}${formatTime(e.start)} ${escapeHtml(e.title)}</div>`
  );
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
    html += `<div class="day-col">${dayColumnHtml(key, key === today)}</div>`;
  }

  $("#view").innerHTML = html + "</div>";
  // start scrolled to around 7:30am instead of midnight
  $("#week-scroll").scrollTop = 7.5 * HOUR_HEIGHT;
}

// weeks that straddle two months get both names, e.g. "Oct - Nov 2026"
function weekTitle(start, end) {
  if (start.getMonth() === end.getMonth())
    return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  return `${MONTHS[start.getMonth()].slice(0, 3)} - ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
}

function dayColumnHtml(key, isToday) {
  const list = eventsOn(key);

  // overlapping events: put each in the first column that's free, then split the width
  const laneEnds = [];
  const lanes = list.map((e) => {
    let lane = laneEnds.findIndex((end) => end <= toMinutes(e.start));
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = Math.max(toMinutes(e.end), toMinutes(e.start) + 30);
    return lane;
  });
  const width = 100 / Math.max(laneEnds.length, 1);

  // red striped band behind the events showing exactly when they overlap
  let html = conflictsOn(key)
    .map((c) => {
      const top = (c.start / 60) * HOUR_HEIGHT;
      const height = Math.max(16, ((c.end - c.start) / 60) * HOUR_HEIGHT);
      return `<div class="overlap-band" style="top:${top}px;height:${height}px"></div>`;
    })
    .join("");

  html += list
    .map((e, i) => {
      // position is just minutes converted to pixels; 22px minimum so short events stay clickable
      const top = (toMinutes(e.start) / 60) * HOUR_HEIGHT;
      const height = Math.max(
        22,
        ((toMinutes(e.end) - toMinutes(e.start)) / 60) * HOUR_HEIGHT - 2,
      );
      const conflict = conflictsFor(e.id).length > 0;
      return (
        `<div class="week-event${conflict ? " conflict" : ""}" data-id="${e.id}" ` +
        `style="--c:${e.color};top:${top}px;height:${height}px;left:${lanes[i] * width}%;width:${width}%">` +
        `${conflict ? "⚠ " : ""}${escapeHtml(e.title)}<small>${formatTime(e.start)} - ${formatTime(e.end)}</small></div>`
      );
    })
    .join("");

  // pink line for the current time, only on today's column
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
    ]
      .filter(Boolean)
      .join(" ");
    html += `<button data-date="${key}" class="${classes}">${day.getDate()}</button>`;
  }

  $("#mini").innerHTML = html + "</div>";
}

// turns the syllabus into calendar events: every Tue/Thu class plus the due dates
function syllabusEvents() {
  const events = [];
  // semester runs roughly Aug 25 - Dec 10 (months are 0-indexed, so 7 = Aug, 11 = Dec)
  for (
    let d = new Date(2026, 7, 25);
    d <= new Date(2026, 11, 10);
    d = addDays(d, 1)
  ) {
    const key = toKey(d);
    if (
      (d.getDay() === 2 || d.getDay() === 4) &&
      !SYLLABUS.noClass.includes(key)
    ) {
      events.push({
        id: "syl-class-" + key,
        title: "CS 4352 Class",
        date: key,
        start: "11:30",
        end: "12:45",
        color: CLASS_COLOR,
      });
    }
  }
  SYLLABUS.deadlines.forEach(([date, title]) => {
    // due dates get a late-night slot since the syllabus only gives a day
    events.push({
      id: "syl-due-" + date,
      title,
      date,
      start: "23:00",
      end: "23:59",
      color: DUE_COLOR,
    });
  });
  return events;
}

// turns the work schedule into calendar events: the weekly shifts all semester plus the extra ones
function workEvents() {
  const events = [];
  for (
    let d = new Date(2026, 7, 25);
    d <= new Date(2026, 11, 10);
    d = addDays(d, 1)
  ) {
    const key = toKey(d);
    WORK.weekly
      .filter((s) => s.day === d.getDay())
      .forEach((s) => {
        events.push({
          id: `work-${key}-${s.start}`,
          title: "Work shift",
          date: key,
          start: s.start,
          end: s.end,
          color: WORK_COLOR,
        });
      });
  }
  WORK.extra.forEach((s) => {
    events.push({
      id: `work-${s.date}-${s.start}`,
      title: "Work shift",
      date: s.date,
      start: s.start,
      end: s.end,
      color: WORK_COLOR,
    });
  });
  return events;
}

// ---- mini-deadlines ----

// first free one-hour block on the day, or on one of the few days before it
function findFreeSlot(key, parentId, placed) {
  let day = fromKey(key);
  for (let attempt = 0; attempt < 4; attempt++) {
    const dayKey = toKey(day);
    const busy = state.events
      .filter((e) => e.date === dayKey && e.parent !== parentId)
      .concat(placed.filter((e) => e.date === dayKey))
      .map((e) => [toMinutes(e.start), toMinutes(e.end)]);
    for (let m = 9 * 60; m + 60 <= 22 * 60; m += 60) {
      if (!busy.some(([start, end]) => m < end && m + 60 > start)) {
        return {
          date: dayKey,
          start: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`,
        };
      }
    }
    day = addDays(day, -1);
  }
  return null;
}

// three checkpoints leading up to the deadline, each in free time
function miniEventsFor(deadline) {
  const base = deadline.title.replace(/ Due$/, "");
  const placed = [];
  MINI_STEPS.forEach((step, i) => {
    const slot = findFreeSlot(
      toKey(addDays(fromKey(deadline.date), -step.daysBefore)),
      deadline.id,
      placed,
    );
    if (!slot) return;
    placed.push({
      id: `mini-${deadline.id}-${i}`,
      parent: deadline.id,
      title: `${base}: ${step.label}`,
      date: slot.date,
      start: slot.start,
      end: addMinutes(slot.start, 60),
      color: MINI_COLOR,
    });
  });
  return placed;
}

function toggleMiniDeadlines(deadline) {
  const hasMinis = state.events.some((e) => e.parent === deadline.id);
  state.events = hasMinis
    ? state.events.filter((e) => e.parent !== deadline.id)
    : state.events.concat(miniEventsFor(deadline));
  saveEvents();
  render();
}

// kind is "syllabus" or "work"; both use the same three-step dialog
function openUpload(kind) {
  currentUpload = kind;
  const upload = UPLOADS[kind];
  pendingEvents = upload.events();
  // always start on the preview step, even if the dialog was last closed on a later one
  showStep(1);
  $("#s-file").src = upload.doc().file;
  $("#s-title").textContent = upload.doc().title;
  $("#s-heading").textContent = upload.heading;
  $("#s-info").textContent = upload.info(pendingEvents);
  $("#s-list").innerHTML = upload.list();
  $("#syllabus-dialog").showModal();
}

// the upload dialog is three panels in one <dialog>, only the current one is visible
function showStep(n) {
  [1, 2, 3].forEach((i) => {
    $("#s-step" + i).hidden = i !== n;
  });
}

function confirmUpload() {
  const upload = UPLOADS[currentUpload];
  // drop old events from this document first so re-adding doesn't duplicate them
  state.events = state.events
    .filter((e) => !e.id.startsWith(upload.prefix))
    .concat(pendingEvents);
  saveEvents();
  render();

  // don't close yet, step 3 tells the user it worked (and whether it caused conflicts)
  const count = state.conflicts.length;
  const conflictNote =
    state.events.some(isSchool) && state.events.some(isWork)
      ? count
        ? ` ⚠ ${count} conflict${count === 1 ? "" : "s"} found with your other schedule.`
        : " No conflicts found."
      : "";
  $("#s-done").textContent = upload.done(pendingEvents) + conflictNote;
  $("#s-view-conflicts").hidden = count === 0;
  showStep(3);
}

function openEvent(id) {
  const e = state.events.find((ev) => ev.id === id);
  if (!e) return;
  openEventId = id;
  const dialog = $("#event-dialog");
  dialog.style.setProperty("--c", e.color);
  $("#e-title").textContent = e.title;
  $("#e-date").textContent = fromKey(e.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  $("#e-time").textContent = `${formatTime(e.start)} - ${formatTime(e.end)}`;

  // if this event overlaps something, say what and offer a shortcut to the details
  const conflict = conflictsFor(id)[0];
  $("#e-conflict").hidden = !conflict;
  if (conflict) {
    const other = conflict.school.id === id ? conflict.work : conflict.school;
    $("#e-conflict-text").textContent =
      `⚠ Overlaps with ${other.title} (${formatTime(other.start)} - ${formatTime(other.end)})`;
    $("#e-conflict-view").onclick = () => {
      dialog.close();
      openConflicts(conflict.id);
    };
  }

  // deadlines can be split into checkpoints; show what already exists
  const isDeadline = e.id.startsWith("syl-due-");
  const minis = state.events
    .filter((ev) => ev.parent === e.id)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
    );
  $("#e-mini").hidden = !isDeadline;
  if (isDeadline) {
    $("#e-mini-text").textContent = minis.length
      ? "Checkpoints leading up to this deadline:"
      : "Split this deadline into checkpoints placed in your free time.";
    $("#e-mini-list").innerHTML = minis
      .map(
        (m) =>
          `<li><b>${escapeHtml(m.title)}</b><small>${formatShortDate(m.date)} · ${formatTime(m.start)} - ${formatTime(m.end)}</small></li>`,
      )
      .join("");
    $("#e-mini-toggle").textContent = minis.length
      ? "Remove mini-deadlines"
      : "Break into mini-deadlines";
  }

  $("#e-main-step").hidden = false;
  $("#e-preview-step").hidden = true;
  dialog.showModal();
}

// ---- conflicts dialog ----

// with an id it jumps straight to that conflict's details, otherwise shows the list
function openConflicts(id) {
  renderConflictList();
  const conflict = id && state.conflicts.find((c) => c.id === id);
  if (conflict) showConflict(conflict);
  else showConflictStep("list");
  $("#conflicts-dialog").showModal();
}

function showConflictStep(step) {
  $("#c-list-step").hidden = step !== "list";
  $("#c-detail-step").hidden = step !== "detail";
}

function renderConflictList() {
  const count = state.conflicts.length;
  $("#c-summary").textContent = count
    ? `${count} time${count === 1 ? "" : "s"} where school and work overlap. Select one to see the details.`
    : "No overlaps between your classes and work shifts.";

  $("#c-list").innerHTML = count
    ? state.conflicts
        .map(
          (c) =>
            `<li><button class="c-item" data-conflict="${c.id}">` +
            `<span class="c-date">${formatShortDate(c.date)}</span>` +
            `<span class="c-names">${escapeHtml(c.school.title)} <em>and</em> ${escapeHtml(c.work.title)}</span>` +
            `<span class="c-time">Overlap ${minutesToTime(c.start)} - ${minutesToTime(c.end)}</span>` +
            `<span class="c-arrow" aria-hidden="true">›</span></button></li>`,
        )
        .join("")
    : `<li class="c-empty">✓ You're all clear.</li>`;
}

function eventCardHtml(e, label) {
  return (
    `<div class="c-card" style="--c:${e.color}">` +
    `<small>${label}</small><b>${escapeHtml(e.title)}</b>` +
    `<span>${formatTime(e.start)} - ${formatTime(e.end)}</span></div>`
  );
}

function showConflict(c) {
  openConflict = c;
  $("#c-banner-date").textContent = formatLongDate(c.date);
  const minutes = c.end - c.start;
  const length =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} hr ${minutes % 60 ? (minutes % 60) + " min" : ""}`
      : `${minutes} min`;
  $("#c-cards").innerHTML =
    eventCardHtml(c.school, "School") +
    eventCardHtml(c.work, "Work") +
    `<div class="c-card overlap"><small>Overlap</small><b>${minutesToTime(c.start)} - ${minutesToTime(c.end)}</b>` +
    `<span>${length.trim()} of double-booked time</span></div>`;
  showConflictStep("detail");
}

// closes the dialog and opens the week containing the conflict
function showConflictInCalendar() {
  if (!openConflict) return;
  state.date = fromKey(openConflict.date);
  $("#conflicts-dialog").close();
  setView("week");
  // scroll so the overlap is in view instead of the default 7:30am
  $("#week-scroll").scrollTop = Math.max(
    0,
    (openConflict.start / 60 - 1.5) * HOUR_HEIGHT,
  );
}

function resetCalendar() {
  state.events = [];
  saveEvents();
  render();
}

function goToday() {
  state.date = startOfDay(new Date());
  render();
}

function step(direction) {
  state.date =
    state.view === "month"
      ? new Date(state.date.getFullYear(), state.date.getMonth() + direction, 1)
      : addDays(state.date, 7 * direction);
  render();
}

function setView(view) {
  state.view = view;
  render();
}

// event wiring
$("#today").onclick = goToday;
$("#prev").onclick = () => step(-1);
$("#next").onclick = () => step(1);
$("#view-month").onclick = () => setView("month");
$("#view-week").onclick = () => setView("week");

$("#upload-syllabus").onclick = () => openUpload("syllabus");
$("#upload-work").onclick = () => openUpload("work");
$("#s-next").onclick = () => showStep(2);
$("#s-back").onclick = () => showStep(1);
$("#s-confirm").onclick = confirmUpload;
$("#s-finish").onclick = () => $("#syllabus-dialog").close();
$("#s-cancel").onclick = () => $("#syllabus-dialog").close();
$("#s-view-conflicts").onclick = () => {
  $("#syllabus-dialog").close();
  openConflicts();
};

$("#reset").onclick = resetCalendar;

// the alert is rebuilt on every render, so listen on the container
$("#conflict-alert").onclick = (e) => {
  if (e.target.closest("#view-conflicts")) openConflicts();
};

$("#c-list").onclick = (e) => {
  const item = e.target.closest("[data-conflict]");
  if (item)
    showConflict(state.conflicts.find((c) => c.id === item.dataset.conflict));
};
$("#c-back").onclick = () => showConflictStep("list");
$("#c-show").onclick = showConflictInCalendar;
$("#c-close").onclick = () => $("#conflicts-dialog").close();
$("#c-detail-close").onclick = () => $("#conflicts-dialog").close();
$("#conflicts-dialog").onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
};

$("#mini").onclick = (e) => {
  const button = e.target.closest("[data-date]");
  if (!button) return;
  state.date = fromKey(button.dataset.date);
  render();
};

// one listener for the whole view since the contents get rebuilt on every render
$("#view").onclick = (e) => {
  const badge = e.target.closest("[data-conflict-day]");
  if (badge) return openConflicts(conflictsOn(badge.dataset.conflictDay)[0].id);

  const event = e.target.closest("[data-id]");
  if (event) return openEvent(event.dataset.id);

  const more = e.target.closest("[data-week]");
  if (!more) return;
  state.date = fromKey(more.dataset.week);
  setView("week");
};

$("#e-close").onclick = () => $("#event-dialog").close();

$("#e-mini-toggle").onclick = () => {
  const e = state.events.find((ev) => ev.id === openEventId);
  if (!e) return;

  const existingMinis = state.events.filter((ev) => ev.parent === e.id);

  if (existingMinis.length) {
    // If they already exist, remove them immediately
    state.events = state.events.filter((ev) => ev.parent !== e.id);
    saveEvents();
    $("#event-dialog").close();
    render();
  } else {
    // Otherwise, calculate the slots and show the preview
    previewMiniEvents = miniEventsFor(e);

    if (previewMiniEvents.length === 0) {
      alert("No free time found for checkpoints!");
      return;
    }

    $("#e-preview-list").innerHTML = previewMiniEvents
      .map(
        (m) =>
          `<li><b>${escapeHtml(m.title)}</b><small>${formatShortDate(m.date)} · ${formatTime(m.start)} - ${formatTime(m.end)}</small></li>`,
      )
      .join("");

    $("#e-main-step").hidden = true;
    $("#e-preview-step").hidden = false;
  }
};

// Preview step buttons
$("#e-preview-cancel").onclick = () => {
  $("#e-preview-step").hidden = true;
  $("#e-main-step").hidden = false;
};

$("#e-preview-confirm").onclick = () => {
  if (!previewMiniEvents.length) return;
  // Add the proposed events to the calendar
  state.events = state.events.concat(previewMiniEvents);
  previewMiniEvents = [];
  saveEvents();
  $("#event-dialog").close();
  render();
};

// clicking the dark backdrop closes it too
$("#event-dialog").onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
};

render();
