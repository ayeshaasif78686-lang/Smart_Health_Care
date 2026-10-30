// @vitest-environment jsdom
import React from "react";
import { test, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { RecordForm } from "../src/App";
import { seedData } from "../../backend/src/seed-data";
afterEach(cleanup);
test("Task form converts numbers and predecessor IDs into API payload", async () => {
  const save = vi.fn();
  render(
    <RecordForm
      group="tasks"
      p={seedData()}
      onSave={save}
      onClose={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("Title *"), {
    target: { value: "Integration test task" },
  });
  fireEvent.change(screen.getByLabelText("Predecessor IDs (comma separated)"), {
    target: { value: "T-01, T-02" },
  });
  fireEvent.change(screen.getByLabelText("Baseline cost (PKR)"), {
    target: { value: "800000" },
  });
  fireEvent.click(screen.getByText("Save record"));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][1].dependencies).toEqual(["T-01", "T-02"]);
  expect(save.mock.calls[0][1].plannedCost).toBe(800000);
});
test("Empty title prevents submitting a requirement", async () => {
  const save = vi.fn();
  render(
    <RecordForm
      group="requirements"
      p={seedData()}
      onSave={save}
      onClose={() => {}}
    />,
  );
  fireEvent.submit(screen.getByText("Save record").closest("form"));
  await waitFor(() =>
    expect(screen.getByText("This field is required.")).toBeTruthy(),
  );
  expect(save).not.toHaveBeenCalled();
});
test("Edit form preserves defect values and displays server validation feedback", () => {
  const p = seedData();
  const close = vi.fn();
  render(
    <RecordForm
      group="defects"
      record={p.defects[0]}
      p={p}
      onSave={() => {}}
      onClose={close}
      error="Verification must pass before closure."
    />,
  );
  expect(screen.getByLabelText("Title *").value).toBe(
    "Appointment scheduling conflict",
  );
  expect(screen.getByLabelText("Severity").value).toBe("Critical");
  expect(
    screen.getByText("Verification must pass before closure."),
  ).toBeTruthy();
  fireEvent.click(screen.getByText("Cancel"));
  expect(close).toHaveBeenCalledOnce();
});
