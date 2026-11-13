"use client";

import { useState } from "react";
import { BackHeader, SectionTitle } from "../ui";
import {
  Check,
  Clock,
  CalendarDays,
  Zap,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const PINS_PER_DAY = [3, 5, 10];
const TIMES = [
  { id: "9am", label: "9 AM", note: "Morning" },
  { id: "12pm", label: "12 PM", note: "Lunch" },
  { id: "6pm", label: "6 PM", note: "Evening" },
  { id: "9pm", label: "9 PM", note: "Night" },
];

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
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

export default function Schedule({ go, state, actions, toast }) {
  const existing = state.schedules[0];
  const [pins, setPins] = useState(existing?.pinsPerDay || 5);
  const [time, setTime] = useState(existing?.time || "6 PM");
  const [days, setDays] = useState(
    existing?.days || [0, 1, 2, 3, 4, 5, 6]
  );
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [saved, setSaved] = useState(!!existing);

  const toggleDay = (d) =>
    setDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()
    );

  function save() {
    if (days.length === 0) {
      toast("Pick at least one posting day", "error");
      return;
    }
    actions.saveSchedule({ pinsPerDay: pins, time, days, timezone: "USA (ET)" });
    setSaved(true);
    toast("Automation started 🚀");
  }

  // calendar math
  const first = new Date(cursor.y, cursor.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const today = new Date();
  const isThisMonth =
    today.getFullYear() === cursor.y && today.getMonth() === cursor.m;

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function scheduledFor(d) {
    const date = new Date(cursor.y, cursor.m, d);
    const dow = date.getDay();
    if (!days.includes(dow)) return null;
    if (!isThisMonth) return pins;
    if (d < today.getDate()) return null;
    return pins;
  }

  const monthTotal = cells.reduce((acc, d) => acc + (d ? scheduledFor(d) || 0 : 0), 0);

  return (
    <div className="app-shell pb-10">
      <BackHeader
        title="Schedule"
        subtitle="Auto-post on autopilot"
        onBack={() => go("dashboard")}
      />

      {saved && existing && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-emerald-50 p-3.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-white">
            <Check size={16} strokeWidth={3} />
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-emerald-900">
              Automation active
            </p>
            <p className="text-[11.5px] text-emerald-700">
              {existing.pinsPerDay} pins/day · {existing.time} USA time
            </p>
          </div>
          <button
            onClick={() => {
              actions.clearSchedule();
              setSaved(false);
              toast("Automation stopped", "info");
            }}
            aria-label="Stop automation"
            className="tap grid h-9 w-9 place-items-center rounded-full bg-white text-pin-600"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* Pins per day */}
      <section>
        <label className="label">How many Pins per day?</label>
        <div className="grid grid-cols-3 gap-2.5">
          {PINS_PER_DAY.map((n) => {
            const active = pins === n;
            return (
              <button
                key={n}
                onClick={() => setPins(n)}
                className={`tap rounded-2xl border-2 py-4 text-center transition ${
                  active
                    ? "border-pin-600 bg-pin-50"
                    : "border-neutral-200 bg-white"
                }`}
              >
                <p
                  className={`text-[22px] font-extrabold leading-none ${
                    active ? "text-pin-700" : "text-neutral-800"
                  }`}
                >
                  {n}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-neutral-500">
                  pins / day
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Post time */}
      <section className="mt-6">
        <label className="label">
          Post time <span className="font-medium text-neutral-400">USA time</span>
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          {TIMES.map((t) => {
            const active = time === t.label;
            return (
              <button
                key={t.id}
                onClick={() => setTime(t.label)}
                className={`tap flex items-center justify-between rounded-2xl border-2 px-3.5 py-3 transition ${
                  active
                    ? "border-pin-600 bg-pin-50"
                    : "border-neutral-200 bg-white"
                }`}
              >
                <div className="text-left">
                  <p
                    className={`text-[14px] font-bold ${
                      active ? "text-pin-700" : "text-neutral-800"
                    }`}
                  >
                    {t.label}
                  </p>
                  <p className="text-[10.5px] text-neutral-400">{t.note}</p>
                </div>
                {active ? (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-pin-600 text-white">
                    <Check size={11} strokeWidth={4} />
                  </span>
                ) : (
                  <Clock size={15} className="text-neutral-300" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Days */}
      <section className="mt-6">
        <label className="label">Posting days</label>
        <div className="flex justify-between gap-1.5">
          {DOW.map((d, i) => {
            const active = days.includes(i);
            return (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={`tap grid h-11 flex-1 place-items-center rounded-xl text-[13px] font-bold transition ${
                  active
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </section>

      {/* Calendar */}
      <section className="mt-6">
        <SectionTitle
          action={
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setCursor((c) => {
                    const m = c.m - 1;
                    return m < 0 ? { y: c.y - 1, m: 11 } : { ...c, m };
                  })
                }
                aria-label="Previous month"
                className="tap grid h-8 w-8 place-items-center rounded-full bg-neutral-100"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() =>
                  setCursor((c) => {
                    const m = c.m + 1;
                    return m > 11 ? { y: c.y + 1, m: 0 } : { ...c, m };
                  })
                }
                aria-label="Next month"
                className="tap grid h-8 w-8 place-items-center rounded-full bg-neutral-100"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          }
        >
          {MONTHS[cursor.m]} {cursor.y}
        </SectionTitle>

        <div className="card p-3.5">
          <div className="mb-1.5 grid grid-cols-7 gap-1">
            {DOW.map((d, i) => (
              <div
                key={i}
                className="text-center text-[10.5px] font-bold text-neutral-300"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const count = scheduledFor(d);
              const isToday = isThisMonth && d === today.getDate();
              return (
                <div
                  key={d}
                  className={`relative grid aspect-square place-items-center rounded-xl text-[12px] font-semibold ${
                    count
                      ? "bg-pin-50 text-pin-700"
                      : "text-neutral-400"
                  } ${isToday ? "ring-2 ring-neutral-900" : ""}`}
                >
                  {d}
                  {count > 0 && (
                    <span className="absolute bottom-1 flex gap-[2px]">
                      {Array.from({ length: Math.min(count, 3) }).map((_, k) => (
                        <span
                          key={k}
                          className="h-[3px] w-[3px] rounded-full bg-pin-600"
                        />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-2xl bg-neutral-50 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-neutral-500">
              <CalendarDays size={14} /> Scheduled this month
            </div>
            <p className="text-[13px] font-extrabold text-neutral-900">
              {monthTotal} pins
            </p>
          </div>
        </div>
      </section>

      <button onClick={save} className="btn-primary mt-5 w-full">
        <Zap size={18} /> Save & Start Automation
      </button>
      <p className="mt-2 text-center text-[11px] text-neutral-400">
        Posts at {time} USA time · {pins} pins per day
      </p>
    </div>
  );
}
