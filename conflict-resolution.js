// Load after app.js. Changes only the calendar, not employer's schedule.
(() => {
  const $ = (id) => document.getElementById(id);
  const showButton = $("c-show");
  if (!showButton) return;

  showButton.classList.remove("primary");
  showButton.insertAdjacentHTML(
    "afterend",
    '<button class="btn primary" id="c-reschedule">Reschedule shift</button>',
  );

  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="resolution-dialog">
      <div class="dialog-body">
        <h2>Reschedule work shift</h2>
        <p>Choose a new date or start time. The shift length stays the same.</p>
        <form id="resolution-form">
          <label>New date <input id="resolution-date" type="date" required></label>
          <label>New start time <input id="resolution-start" type="time" required></label>
          <p id="resolution-preview" aria-live="polite"></p>
          <p id="resolution-error" role="alert" hidden></p>
          <p class="resolution-note">This only updates your calendar. Confirm changes with your employer.</p>
          <div class="actions">
            <button class="btn" id="resolution-cancel" type="button">Cancel</button>
            <button class="btn primary" type="submit">Save new shift</button>
          </div>
        </form>
      </div>
    </dialog>
    <dialog id="resolution-success-dialog">
      <div class="dialog-body resolution-success-content">
        <div class="resolution-success-icon" aria-hidden="true">✓</div>
        <h2>Conflict resolved!</h2>
        <p id="resolution-success-message" role="status"></p>
        <p class="resolution-note">Confirm the new shift with your employer.</p>
        <div class="actions">
          <button class="btn" id="resolution-other">Other conflicts</button>
          <button class="btn primary" id="resolution-calendar">View calendar</button>
        </div>
      </div>
    </dialog>
  `);

  const dialog = $("resolution-dialog");
  const success = $("resolution-success-dialog");
  let shiftId;
  let movedShift;
  const getShift = () => state.events.find((e) => e.id === shiftId);
  const duration = (e) => toMinutes(e.end) - toMinutes(e.start);

  function showError(message = "") {
    $("resolution-error").textContent = message;
    $("resolution-error").hidden = !message;
  }

  function updatePreview() {
    const shift = getShift();
    const start = $("resolution-start").value;
    if (!shift || !start || !$("resolution-date").value) return;
    const length = duration(shift);
    const end = toMinutes(start) + length;
    $("resolution-preview").textContent =
      end > 1440 || length <= 0
        ? "This shift would run past midnight. Try an earlier time."
        : `Shift: ${formatTime(start)} – ${formatTime(addMinutes(start, length))} ` +
          `(${Math.floor(length / 60)} hr${length % 60 ? ` ${length % 60} min` : ""})`;
  }

  $("c-reschedule").onclick = () => {
    if (!openConflict) return;
    const shift = state.events.find((e) => e.id === openConflict.work.id);
    if (!shift) return;
    shiftId = shift.id;
    $("resolution-date").value = shift.date;
    $("resolution-start").value = shift.start;
    showError();
    updatePreview();
    dialog.showModal();
  };

  for (const id of ["resolution-date", "resolution-start"]) {
    $(id).oninput = () => {
      showError();
      updatePreview();
    };
  }
  $("resolution-cancel").onclick = () => dialog.close();

  $("resolution-form").onsubmit = (event) => {
    event.preventDefault();
    const shift = getShift();
    if (!shift) return showError("Shift not found. Reopen the conflict and try again.");

    const date = $("resolution-date").value;
    const start = $("resolution-start").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || toKey(fromKey(date)) !== date) {
      return showError("Enter a valid date and start time.");
    }

    const length = duration(shift);
    const startMinutes = toMinutes(start);
    const endMinutes = startMinutes + length;
    if (length <= 0 || startMinutes < 0 || endMinutes > 1440) {
      return showError("The full shift must fit within one day.");
    }

    // Check every other event, not just the original conflict.
    const overlap = state.events.find((e) =>
      e.id !== shift.id && e.date === date &&
      startMinutes < toMinutes(e.end) && endMinutes > toMinutes(e.start),
    );
    if (overlap) {
      return showError(`That time overlaps ${overlap.title} (${formatTime(overlap.start)} – ${formatTime(overlap.end)}).`);
    }

    movedShift = { ...shift, date, start, end: addMinutes(start, length) };
    state.events = state.events.map((e) => e.id === shift.id ? movedShift : e);
    saveEvents();
    render();

    $("resolution-success-message").textContent =
      `Your shift was moved to ${formatLongDate(date)}, ` +
      `${formatTime(start)} – ${formatTime(movedShift.end)}. The overlap is gone.`;
    dialog.close();
    if ($("conflicts-dialog").open) $("conflicts-dialog").close();
    success.showModal();
  };

  $("resolution-other").onclick = () => {
    success.close();
    openConflicts();
  };
  $("resolution-calendar").onclick = () => {
    if (!movedShift) return;
    success.close();
    state.date = fromKey(movedShift.date);
    setView("week");
    $("week-scroll").scrollTop = Math.max(
      0, (toMinutes(movedShift.start) / 60 - 1.5) * HOUR_HEIGHT,
    );
  };
  for (const box of [dialog, success]) {
    box.onclick = (e) => { if (e.target === box) box.close(); };
  }
})();