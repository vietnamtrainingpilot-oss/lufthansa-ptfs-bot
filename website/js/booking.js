/**
 * booking.js — Shared seat-request dialog.
 *
 * Honest constraints enforced here:
 *  - A Discord user ID is required, because rewards are tied to a Discord
 *    account. The dialog explains how to find it rather than pretending a
 *    different login exists.
 *  - Nothing about price, tier or reward amount is ever sent from the browser.
 *    The server re-derives everything.
 */

import { api, esc, toast, busy, currentSession, ICONS } from "./site.js";

const DIALOG_ID = "booking-dialog";

function dialogMarkup() {
  return `
  <dialog id="${DIALOG_ID}" aria-labelledby="booking-dialog-title">
    <form method="dialog" class="modal" id="booking-form">
      <div class="modal-head">
        <div>
          <h2 class="modal-title" id="booking-dialog-title">Request a seat</h2>
          <p class="modal-sub" id="booking-sub">Your seat is confirmed once the flight is completed.</p>
        </div>
        <button class="icon-btn" type="button" data-close aria-label="Close">${ICONS.close}</button>
      </div>
      <div class="modal-body">
        <input type="hidden" name="flightNumber" id="booking-flight" />
        <div class="field">
          <label class="label" for="booking-discord-id">Discord user ID <span class="req" aria-hidden="true">*</span></label>
          <input class="input mono" id="booking-discord-id" name="discordUserId" required
                 inputmode="numeric" autocomplete="off" spellcheck="false"
                 aria-describedby="booking-discord-hint" placeholder="123456789012345678" />
          <p class="hint" id="booking-discord-hint">
            Rewards are tied to your Discord account. To find your ID, enable Developer Mode
            in Discord settings, then right-click your profile and choose Copy User ID.
          </p>
        </div>

        <div class="field mt-4">
          <label class="label" for="booking-class">Cabin class <span class="req" aria-hidden="true">*</span></label>
          <select class="select" id="booking-class" name="class" required>
            <option value="">Select a cabin</option>
            <option value="economy">Economy</option>
            <option value="premium">Premium Economy</option>
            <option value="business">Business</option>
          </select>
        </div>

        <div class="field mt-4">
          <label class="label" for="booking-seat">Seat preference</label>
          <input class="input" id="booking-seat" name="seat" maxlength="8" placeholder="Optional, for example 12A" />
        </div>

        <div class="alert alert-info mt-6">
          ${ICONS.info}
          <span>Seats are recorded on the flight manifest. Points and credits are only awarded
          after staff complete the flight and confirm your attendance.</span>
        </div>

        <div id="booking-error" class="alert alert-danger mt-4" hidden></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="submit" id="booking-submit">Submit request</button>
      </div>
    </form>
  </dialog>`;
}

let dialogEl = null;

function ensureDialog() {
  if (dialogEl) return dialogEl;
  document.body.insertAdjacentHTML("beforeend", dialogMarkup());
  dialogEl = document.getElementById(DIALOG_ID);

  dialogEl.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => dialogEl.close())
  );
  // Clicking the backdrop closes.
  dialogEl.addEventListener("click", (e) => {
    if (e.target === dialogEl) dialogEl.close();
  });

  const form = dialogEl.querySelector("#booking-form");
  form.addEventListener("submit", onSubmit);
  return dialogEl;
}

async function onSubmit(e) {
  e.preventDefault();
  const dlg = ensureDialog();
  const form = e.target;
  const errBox = dlg.querySelector("#booking-error");
  errBox.hidden = true;

  const discordUserId = form.discordUserId.value.trim();
  if (!/^\d{15,22}$/.test(discordUserId)) {
    errBox.textContent = "Enter a valid Discord user ID. It should be a long string of digits.";
    errBox.hidden = false;
    form.querySelector("#booking-discord-id").focus();
    return;
  }

  const submit = form.querySelector("#booking-submit");
  const restore = busy(submit, "Submitting");

  try {
    const payload = {
      flightNumber: form.flightNumber.value,
      discordUserId,
      class: form.class.value,
      seat: form.seat.value.trim() || null,
    };
    const res = await api("/api/bookings", { method: "POST", body: payload });
    dlg.close();
    form.reset();
    toast(res.message || "Seat request recorded.", { type: "success", title: `LH ${payload.flightNumber}` });
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  } finally {
    restore();
  }
}

/**
 * Open the booking dialog for a flight.
 * Prefills the Discord ID when the member is signed in.
 */
export function openBooking(flightNumber, availableClasses = "") {
  const dlg = ensureDialog();
  const form = dlg.querySelector("#booking-form");

  form.flightNumber.value = flightNumber || "";
  form.querySelector("#booking-sub").textContent =
    `LH ${flightNumber || ""}. Your seat is confirmed once the flight is completed.`;

  // Enable only the cabins this flight actually offers.
  const select = form.querySelector("#booking-class");
  const offered = String(availableClasses)
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  for (const opt of select.options) {
    if (!opt.value) continue;
    const v = opt.value === "premium" ? "premium" : opt.value;
    opt.disabled = offered.length > 0 && !offered.some((o) => o.includes(v) || v.includes(o));
  }

  // Prefill the Discord ID when the member is already signed in, so a
  // signed-in member does not have to paste it again.
  const session = currentSession();
  if (session.authenticated && session.member?.id) {
    form.querySelector("#booking-discord-id").value = session.member.id;
  }

  dlg.showModal();
  if (!session.authenticated) form.querySelector("#booking-discord-id").focus();
}

/**
 * Wire every [data-book-flight] button inside a container.
 */
export function wireBookingButtons(container) {
  container.querySelectorAll("[data-book-flight]").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      openBooking(btn.dataset.bookFlight, btn.dataset.bookCabin || "");
    });
  });
}