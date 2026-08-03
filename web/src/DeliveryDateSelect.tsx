import { DayPicker } from "@daypicker/persian";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { persianDate, todayISO } from "./shared";

function dateFromISO(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateToISO(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DeliveryDateSelect({ id, value, onChange, invalid, describedBy, allowPast = false }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  allowPast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = dateFromISO(value);
  const today = dateFromISO(todayISO())!;
  const endMonth = new Date(today);
  endMonth.setFullYear(endMonth.getFullYear() + 2);

  return (
    <div>
      <button
        id={id}
        className="field flex items-center justify-between gap-3 text-right font-bold"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-controls={`${id}-calendar`}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-invalid={invalid}
      >
        <span className={selected ? "text-ink" : "text-ink/60"}>{selected ? persianDate(value) : "انتخاب تاریخ"}</span>
        <CalendarDays className="size-5 shrink-0 text-teal" aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-calendar`} className="delivery-calendar mt-2 rounded-2xl border border-ledger bg-white p-3 shadow-sm" role="region" aria-label="تقویم تاریخ تحویل">
          <DayPicker
            mode="single"
            captionLayout={allowPast ? "dropdown" : "label"}
            navLayout="after"
            selected={selected}
            defaultMonth={selected ?? today}
            startMonth={allowPast ? undefined : today}
            endMonth={endMonth}
            disabled={allowPast ? undefined : { before: today }}
            onSelect={(day) => {
              if (!day) return;
              onChange(dateToISO(day));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
