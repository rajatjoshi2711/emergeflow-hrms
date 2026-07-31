import { describe, expect, it } from "vitest";
import {
  FULL_TIME_QUARTERLY_LEAVE_PER_TYPE,
  INTERN_MONTHLY_LEAVE_PER_TYPE,
  MONTHLY_WFH_CREDIT,
  computeProratedAmount,
  isMonthStart,
  isQuarterStart,
  previousMonthStart,
  previousQuarterStart,
  roundToHalf,
  toUtcDateOnly,
} from "./leave-rules";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("entitlement constants match the design doc", () => {
  it("gives full-time employees 8 of each leave type per year", () => {
    expect(FULL_TIME_QUARTERLY_LEAVE_PER_TYPE * 4).toBe(8);
  });

  it("gives interns 12 of each leave type per year", () => {
    expect(INTERN_MONTHLY_LEAVE_PER_TYPE * 12).toBe(12);
  });

  it("gives everyone 2 WFH days a month", () => {
    expect(MONTHLY_WFH_CREDIT).toBe(2);
  });
});

describe("isMonthStart", () => {
  it("is true on the 1st", () => {
    expect(isMonthStart(utc("2026-03-01"))).toBe(true);
  });

  it("is false on any other day", () => {
    expect(isMonthStart(utc("2026-03-02"))).toBe(false);
    expect(isMonthStart(utc("2026-03-31"))).toBe(false);
  });
});

describe("isQuarterStart", () => {
  it("is true on Jan/Apr/Jul/Oct 1st", () => {
    for (const iso of ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]) {
      expect(isQuarterStart(utc(iso))).toBe(true);
    }
  });

  it("is false on the 1st of a non-quarter month", () => {
    for (const iso of ["2026-02-01", "2026-06-01", "2026-12-01"]) {
      expect(isQuarterStart(utc(iso))).toBe(false);
    }
  });

  it("is false mid-quarter-month", () => {
    expect(isQuarterStart(utc("2026-04-15"))).toBe(false);
  });
});

describe("period start helpers", () => {
  it("walks back one month, including across a year boundary", () => {
    expect(previousMonthStart(utc("2026-03-01")).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(previousMonthStart(utc("2026-01-01")).toISOString()).toBe("2025-12-01T00:00:00.000Z");
  });

  it("walks back one quarter, including across a year boundary", () => {
    expect(previousQuarterStart(utc("2026-07-01")).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(previousQuarterStart(utc("2026-01-01")).toISOString()).toBe("2025-10-01T00:00:00.000Z");
  });
});

describe("roundToHalf", () => {
  it("snaps to the nearest half day", () => {
    expect(roundToHalf(1.2)).toBe(1);
    expect(roundToHalf(1.3)).toBe(1.5);
    expect(roundToHalf(1.74)).toBe(1.5);
    expect(roundToHalf(1.8)).toBe(2);
  });
});

describe("toUtcDateOnly", () => {
  it("strips the time component", () => {
    expect(toUtcDateOnly(new Date("2026-05-20T17:45:31.000Z")).toISOString()).toBe(
      "2026-05-20T00:00:00.000Z"
    );
  });
});

describe("computeProratedAmount", () => {
  const quarterStart = utc("2026-04-01");
  const quarterEnd = utc("2026-07-01");

  it("credits the full amount when employed for the whole period", () => {
    expect(computeProratedAmount(2, quarterStart, quarterEnd, utc("2024-01-01"))).toBe(2);
  });

  it("credits the full amount when joining exactly on the period start", () => {
    expect(computeProratedAmount(2, quarterStart, quarterEnd, quarterStart)).toBe(2);
  });

  it("credits roughly half when joining mid-period", () => {
    // 2026-05-17 leaves 45 of 91 days, so 2 * (45/91) = 0.989 -> 1
    expect(computeProratedAmount(2, quarterStart, quarterEnd, utc("2026-05-17"))).toBe(1);
  });

  it("credits nothing when joining on or after the period end", () => {
    expect(computeProratedAmount(2, quarterStart, quarterEnd, quarterEnd)).toBe(0);
    expect(computeProratedAmount(2, quarterStart, quarterEnd, utc("2026-08-01"))).toBe(0);
  });

  it("rounds to half days rather than arbitrary fractions", () => {
    const amount = computeProratedAmount(2, quarterStart, quarterEnd, utc("2026-06-20"));
    expect(amount % 0.5).toBe(0);
  });

  it("prorates a monthly intern credit", () => {
    // Joined 2026-06-16, period is June: 15 of 30 days -> 1 * 0.5 = 0.5
    expect(computeProratedAmount(1, utc("2026-06-01"), utc("2026-07-01"), utc("2026-06-16"))).toBe(0.5);
  });
});
