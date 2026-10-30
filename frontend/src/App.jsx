import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Home,
  ClipboardList,
  FileText,
  Network,
  CalendarDays,
  Users,
  Wallet,
  ShieldCheck,
  TriangleAlert,
  RefreshCw,
  BarChart3,
  Settings,
  Bell,
  Search,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  Hospital,
  Coins,
  LogOut,
  Menu,
  Download,
  Printer,
  ArrowRight,
  CheckSquare,
  Flag,
  HeartPulse,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { config, charterFields, label } from "./config";
const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((c) => {
  c.headers.Authorization =
    "Bearer " + (sessionStorage.getItem("healthcare-token") || "");
  return c;
});
const money = (n) => "PKR " + Math.round(n || 0).toLocaleString("en-PK");
const fmt = (d) => (d ? format(parseISO(d), "MMM dd, yyyy") : "Not set");
const today = () => new Date().toISOString().slice(0, 10);
const colors = ["#4290ff", "#25bd76", "#ff9d36", "#9272ff", "#fb6c7d"];
const nav = [
  ["dashboard", "Dashboard", Home],
  ["charter", "Project Charter", FileText],
  ["requirements", "Requirements", ClipboardList],
  ["wbs", "WBS", Network],
  ["tasks", "Schedule & Resources", CalendarDays],
  ["costs", "Cost & EVM", Wallet],
  ["defects", "Quality Management", ShieldCheck],
  ["risks", "Risk Management", TriangleAlert],
  ["changes", "Change Requests", RefreshCw],
  ["reports", "Reports", FileText],
  ["team", "Team Management", Users],
  ["closure", "Project Closure", Flag],
  ["settings", "Settings", Settings],
];
function Badge({ children }) {
  const good = [
    "Approved",
    "Completed",
    "Passed",
    "Closed",
    "On Track",
    "Active",
    "Mitigated",
  ];
  const bad = ["Critical", "Rejected", "Failed", "Open", "Delayed"];
  return (
    <span
      className={
        "badge " +
        (good.includes(children)
          ? "green"
          : bad.includes(children)
            ? "red"
            : ["Pending", "Proposed", "High", "At Risk"].includes(children)
              ? "amber"
              : "blue")
      }
    >
      {children || "Not set"}
    </span>
  );
}
function Card({ title, action, children, className = "" }) {
  return (
    <section className={"card " + className}>
      {title && (
        <header>
          <h3>{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
function HospitalArt() {
  return (
    <svg viewBox="0 0 240 170" aria-hidden="true">
      <path
        d="M13 58Q30 31 48 58M149 25Q171-2 194 25Q217 14 225 35H140"
        fill="#3c5579"
      />
      <path d="M25 102H215V161H25z" fill="#d4e8ff" />
      <path d="M84 66L119 40L156 66V161H84z" fill="#9dc5f0" />
      <path d="M95 70H145V161H95z" fill="#e8f4ff" />
      <path d="M115 57H125V64H132V74H125V81H115V74H108V64H115" fill="#20a9ee" />
      {[38, 61, 99, 125, 166, 190].map((x) =>
        [94, 117, 140].map((y) => (
          <rect
            key={x + "-" + y}
            x={x}
            y={y}
            width="13"
            height="12"
            fill="#649bd9"
          />
        )),
      )}
      <path d="M105 140H137V164H105z" fill="#203c61" />
      <path d="M10 164H230" stroke="#67be9a" strokeWidth="3" />
      <path d="M15 165V126M224 163V138" stroke="#487860" strokeWidth="5" />
      <ellipse cx="15" cy="126" rx="13" ry="26" fill="#54a27d" />
      <ellipse cx="224" cy="139" rx="11" ry="23" fill="#58b188" />
    </svg>
  );
}
function Stat({ icon: Icon, title, value, sub, tone = "blue", children }) {
  return (
    <div className="stat card">
      <span className={"stat-icon " + tone}>
        <Icon size={25} />
      </span>
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
        {sub && <p>{sub}</p>}
        {children}
      </div>
    </div>
  );
}
function EvmChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={205}>
      <AreaChart
        data={data}
        margin={{ top: 12, right: 10, left: -16, bottom: 0 }}
      >
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffad55" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ffad55" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e7edf7" />
        <XAxis
          dataKey="date"
          tickFormatter={(s) => format(parseISO(s), "MMM d")}
          tick={{ fontSize: 10, fill: "#667693" }}
        />
        <YAxis
          tickFormatter={(v) => v / 1000000 + "M"}
          tick={{ fontSize: 10, fill: "#667693" }}
        />
        <Tooltip formatter={(v) => money(v)} />
        <Area
          type="linear"
          dataKey="PV"
          name="Planned Value"
          stroke="#4290ff"
          fill="transparent"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Area
          type="linear"
          dataKey="EV"
          name="Earned Value"
          stroke="#25bd76"
          fill="transparent"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Area
          type="linear"
          dataKey="AC"
          name="Actual Cost"
          stroke="#ff9d36"
          fill="url(#fade)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
function Gantt({ p, compact = false }) {
  const rows = p.tasks;
  const start = Math.min(
      Date.parse(p.startDate),
      ...rows.map((t) => Date.parse(t.start)),
    ),
    end = Math.max(start + 86400000, ...rows.map((t) => Date.parse(t.end)));
  const total = end - start + 86400000;
  return (
    <div className={"gantt " + (compact ? "compact" : "")}>
      <div className="gantt-axis">
        <span>Task name</span>
        <div>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i}>
              {format(new Date(start + (total * i) / 5), "MMM d")}
            </span>
          ))}
        </div>
      </div>
      {rows.map((t, i) => (
        <div className="gantt-row" key={t.id}>
          <span
            title={`${t.id} • Predecessors: ${t.dependencies.join(", ") || "None"}`}
          >
            {t.title}
          </span>
          <div className="gantt-track">
            <span
              className="gantt-bar"
              title={`${fmt(t.start)} to ${fmt(t.end)} | ${t.progress}% | Depends on ${t.dependencies.join(", ") || "none"}`}
              style={{
                left: ((Date.parse(t.start) - start) / total) * 100 + "%",
                width:
                  ((Date.parse(t.end) - Date.parse(t.start) + 86400000) /
                    total) *
                    100 +
                  "%",
                background: colors[i % 5],
              }}
            >
              {!compact && t.progress + "%"}
            </span>
          </div>
        </div>
      ))}
      {!rows.length && (
        <p className="empty">Add tasks to display the schedule.</p>
      )}
    </div>
  );
}
function Dashboard({ p, s, go, at, setAt }) {
  const health = [
    {
      name: "Completed",
      value: p.tasks.filter((t) => t.status === "Completed").length,
    },
    {
      name: "In progress",
      value: p.tasks.filter((t) => t.status === "In Progress").length,
    },
    {
      name: "Not started",
      value: p.tasks.filter((t) => t.status === "Not Started").length,
    },
  ];
  return (
    <>
      <Card className="hero">
        <div className="hero-top">
          <span className="hospital-icon">
            <Hospital size={50} />
          </span>
          <div>
            <div className="hero-title">
              <h1>{p.name}</h1>
              <Badge>{p.status}</Badge>
            </div>
            <p>{p.description}</p>
          </div>
          <div className="overall">
            <div>
              Overall Progress <b>{s.progress}%</b>
            </div>
            <progress value={s.progress} max="100" />
          </div>
        </div>
        <div className="hero-facts">
          {[
            [CalendarDays, "Start Date", fmt(p.startDate)],
            [CalendarDays, "Deadline", fmt(s.baseline.deadline)],
            [Clock, "Duration", `${s.baseline.weeks} Weeks`],
            [Wallet, "Original Budget", money(p.originalBudget)],
            [Coins, "Approved Budget", money(s.baseline.budget)],
          ].map(([I, l, v]) => (
            <div key={l}>
              <I size={27} />
              <span>
                <small>{l}</small>
                <strong>{v}</strong>
              </span>
            </div>
          ))}
        </div>
      </Card>
      <div className="stats">
        <Stat
          icon={ClipboardList}
          title="Total Requirements"
          value={p.requirements.length}
          sub={`${p.requirements.filter((x) => !["Proposed", "Rejected"].includes(x.status)).length} Approved scope | ${p.requirements.filter((x) => x.status === "Proposed").length} Proposed`}
        />
        <Stat
          icon={CheckSquare}
          title="Total Tasks"
          value={p.tasks.length}
          sub={`${p.tasks.filter((x) => x.status === "Completed").length} Completed | ${s.schedule.delayed.length} Delayed`}
        />
        <Stat
          icon={Users}
          title="Team Members"
          value={p.team.length}
          sub={`${p.team.filter((x) => x.status === "Active").length} Active`}
          tone="purple"
        />
        <Stat
          icon={TriangleAlert}
          title="Open Defects"
          value={p.defects.filter((x) => x.status !== "Closed").length}
          sub={`${s.critical.length} Critical unresolved`}
          tone="red"
        />
        <Stat
          icon={Coins}
          title="Budget Used"
          value={money(s.evm.AC)}
          sub={`of ${money(s.baseline.budget)} (${Math.round((s.evm.AC / s.baseline.budget) * 100) || 0}%)`}
          tone="purple"
        >
          <progress value={s.evm.AC} max={s.baseline.budget} />
        </Stat>
      </div>
      <div className="dashboard-mid">
        <Card
          title="Project Schedule"
          action={
            <button className="link" onClick={() => go("tasks")}>
              View Gantt Chart <ArrowRight size={13} />
            </button>
          }
        >
          <Gantt p={p} compact />
        </Card>
        <Card
          title="Budget vs Actual (EVM)"
          action={
            <input
              aria-label="EVM status date"
              className="mini-date"
              type="date"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          }
        >
          <div className="legend">
            <span className="pv">Planned Value (PV)</span>
            <span className="ev">Earned Value (EV)</span>
            <span className="ac">Actual Cost (AC)</span>
          </div>
          <EvmChart data={s.chart} />
          <div className="evm-grid">
            {["PV", "EV", "AC", "CPI", "SPI"].map((k) => (
              <div key={k}>
                <small>{k}</small>
                <b
                  className={
                    k === "SPI" && s.evm.scheduleWarning
                      ? "negative"
                      : k === "EV"
                        ? "positive"
                        : ""
                  }
                >
                  {s.evm[k] === null
                    ? "N/A"
                    : ["CPI", "SPI"].includes(k)
                      ? s.evm[k].toFixed(2)
                      : money(s.evm[k])}
                </b>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Project Health">
          <div className="donut">
            <ResponsiveContainer width="100%" height={157}>
              <PieChart>
                <Pie
                  data={health}
                  dataKey="value"
                  innerRadius={49}
                  outerRadius={66}
                  stroke="none"
                >
                  {health.map((v, i) => (
                    <Cell
                      key={v.name}
                      fill={["#25bd76", "#ffb144", "#dce5f2"][i]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-label">
              <b>{s.progress}%</b>
              <small>Overall</small>
            </div>
          </div>
          <div className="health-lines">
            {[
              [Network, "Scope", "On Track"],
              [
                CalendarDays,
                "Schedule",
                s.evm.scheduleWarning || s.schedule.deadlineAtRisk
                  ? "At Risk"
                  : "On Track",
              ],
              [Coins, "Cost", s.evm.costWarning ? "At Risk" : "On Track"],
              [
                ShieldCheck,
                "Quality",
                s.critical.length ? "At Risk" : "On Track",
              ],
              [
                TriangleAlert,
                "Risks",
                p.risks.some(
                  (r) => r.status === "Open" && r.likelihood * r.impact >= 15,
                )
                  ? "At Risk"
                  : "On Track",
              ],
            ].map(([I, t, v]) => (
              <div key={t}>
                <I size={21} />
                <span>{t}</span>
                <Badge>{v}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="dashboard-bottom">
        <Card
          title="Recent Change Requests"
          action={
            <button className="link" onClick={() => go("changes")}>
              View All <ArrowRight size={13} />
            </button>
          }
        >
          <table className="small-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Change Request</th>
                <th>Impact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {p.changes
                .slice(-4)
                .reverse()
                .map((c) => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>{c.title}</td>
                    <td>
                      +{c.weeks} w<br />
                      {money(c.cost)}
                    </td>
                    <td>
                      <Badge>{c.status}</Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!p.changes.length && <p className="empty">No change requests.</p>}
        </Card>
        <Card
          title="Critical Defects"
          action={
            <button className="link" onClick={() => go("defects")}>
              View All <ArrowRight size={13} />
            </button>
          }
        >
          <table className="small-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Module</th>
                <th>Severity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {s.critical.map((d) => (
                <tr key={d.id}>
                  <td>{d.id}</td>
                  <td>{d.module}</td>
                  <td>
                    <Badge>{d.severity}</Badge>
                  </td>
                  <td>
                    <Badge>{d.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.critical.length && (
            <p className="empty">No unresolved critical defects.</p>
          )}
        </Card>
        <Card
          title="Milestones"
          action={
            <button className="link" onClick={() => go("milestones")}>
              View All <ArrowRight size={13} />
            </button>
          }
        >
          {p.milestones.slice(0, 5).map((m) => (
            <div className="milestone" key={m.id}>
              {m.status === "Completed" ? (
                <CheckCircle2 size={18} color="#25b76d" />
              ) : (
                <Clock size={18} color="#8392ad" />
              )}
              <span>{m.title}</span>
              <small>{fmt(m.date)}</small>
            </div>
          ))}
        </Card>
      </div>
      <div className="dashboard-bottom lower">
        <Card title="Delayed Tasks">
          {s.schedule.delayed.length ? (
            s.schedule.delayed.map((t) => (
              <p key={t.id}>
                {t.title} <Badge>Delayed</Badge>
              </p>
            ))
          ) : (
            <p className="empty">No delayed tasks on the selected date.</p>
          )}
        </Card>
        <Card title="Pending Changes">
          <strong className="large-number">{s.pending}</strong>
          <p>Pending changes do not affect the approved scope or budget.</p>
        </Card>
        <Card title="Recent Activity">
          {p.audit.slice(0, 4).map((a) => (
            <p className="activity" key={a.id}>
              {a.action}
              <small>
                {a.actor} · {fmt(a.date.slice(0, 10))}
              </small>
            </p>
          ))}
        </Card>
      </div>
    </>
  );
}
export function RecordForm({ group, record, p, onSave, onClose, busy, error }) {
  const cfg = config[group];
  const defaults = Object.fromEntries(
    cfg.fields.map((f) => [
      f.name,
      record?.[f.name] ??
        (f.type === "number"
          ? 0
          : f.type === "date"
            ? today()
            : f.type === "select" && Array.isArray(f.options)
              ? f.options[0]
              : ""),
    ]),
  );
  if (group === "risks") {
    defaults.likelihood = record?.likelihood || 1;
    defaults.impact = record?.impact || 1;
  }
  if (group === "tasks")
    defaults.dependencies = (record?.dependencies || []).join(", ");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: defaults });
  return (
    <div className="overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={cfg.name + " form"}
      >
        <header>
          <div>
            <small>{record ? "UPDATE RECORD" : "NEW RECORD"}</small>
            <h2>{cfg.name}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </header>
        <form
          onSubmit={handleSubmit((v) => {
            if (group === "tasks")
              v.dependencies = v.dependencies
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
            onSave(group, v, record?.id);
          })}
        >
          <div className="form-grid">
            {cfg.fields.map((f) => (
              <label
                key={f.name}
                className={f.type === "textarea" ? "wide" : ""}
              >
                {f.label}
                {f.required && " *"}
                {f.type === "select" ? (
                  <select
                    {...register(f.name, { required: group === "costs" && f.name === "taskId" })}
                  >
                    <option value="">Select…</option>
                    {(Array.isArray(f.options)
                      ? f.options
                      : p[f.options]
                          .filter((x) => group !== "wbs" || x.id !== record?.id)
                          .filter((x) => group !== "tasks" || !["wbsId", "changeId"].includes(f.name) || x.status === "Approved")
                          .map((r) => ({ value: r.id, label: r.title }))
                    ).map((v) => (
                      <option key={v.value || v} value={v.value || v}>
                        {v.label || v}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea rows={3} {...register(f.name)} />
                ) : (
                  <input
                    type={f.type}
                    min={f.min ?? 0}
                    max={f.max}
                    step={f.type === "number" ? "any" : undefined}
                    {...register(f.name, {
                      required: f.required,
                      valueAsNumber: f.type === "number",
                    })}
                  />
                )}{" "}
                {errors[f.name] && (
                  <span className="negative">This field is required.</span>
                )}
              </label>
            ))}
          </div>
          {group === "tasks" && record && (
            <p className="note">
              Original dates and cost stay fixed for EVM. Changes here update
              the working schedule.
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <footer>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button disabled={busy}>{busy ? "Saving…" : "Save record"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
function Records({
  group,
  p,
  onEdit,
  onDelete,
  onDecision,
  canEdit,
  isManager,
  query = "",
}) {
  const cfg = config[group];
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
    setFilter("");
    setSearch("");
  }, [group]);
  let rows = p[group].filter(
    (r) =>
      (!filter || r.status === filter) &&
      JSON.stringify(r)
        .toLowerCase()
        .includes((search || query).toLowerCase()),
  );
  if (group === "risks")
    rows = [...rows].sort(
      (a, b) => b.likelihood * b.impact - a.likelihood * a.impact,
    );
  const count = rows.length;
  const max = Math.max(1, Math.ceil(count / 10));
  const current = Math.min(page, max);
  rows = rows.slice((current - 1) * 10, current * 10);
  const display = (r, k) => {
    if (k === "score")
      return (
        <>
          <b>{r.likelihood * r.impact}</b>{" "}
          <Badge>
            {r.likelihood * r.impact >= 20
              ? "Critical"
              : r.likelihood * r.impact >= 12
                ? "High"
                : r.likelihood * r.impact >= 6
                  ? "Medium"
                  : "Low"}
          </Badge>
        </>
      );
    if (["status", "severity", "priority"].includes(k))
      return <Badge>{r[k]}</Badge>;
    if (["cost", "amount", "plannedCost"].includes(k)) return money(r[k]);
    if (k === "progress")
      return (
        <div className="cell-progress">
          <progress value={r[k]} max={100} />
          {r[k]}%
        </div>
      );
    if (["owner", "taskId", "changeId", "wbsId"].includes(k)) {
      const list =
        k === "owner" ? "team" : k === "taskId" ? "tasks" : k === "wbsId" ? "wbs" : "changes";
      return p[list].find((x) => x.id === r[k])?.title || r[k] || "None";
    }
    return r[k] || "N/A";
  };
  return (
    <Card>
      <div className="table-tools">
        <h3>{cfg.name}</h3>
        <div>
          <input
            placeholder="Search records…"
            aria-label="Search records"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {p[group].some((r) => r.status) && (
            <select
              aria-label="Filter status"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {[...new Set(p[group].map((r) => r.status).filter(Boolean))].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          )}
          {canEdit && (group !== "tasks" || isManager) && (
            <button onClick={() => onEdit(group)}>
              <Plus size={15} /> Add {group === "wbs" ? "WBS Item" : "Record"}
            </button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              {cfg.columns.map((k) => (
                <th key={k}>{label(k)}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted">{r.id}</td>
                {cfg.columns.map((k) => (
                  <td key={k}>{display(r, k)}</td>
                ))}
                <td>
                  <div className="actions">
                    {canEdit &&
                      !(group === "changes" && r.status !== "Pending") && (
                        <>
                          <button
                            className="icon-button"
                            title="Edit"
                            onClick={() => onEdit(group, r)}
                          >
                            <Pencil size={15} />
                          </button>
                          {(group !== "tasks" || isManager) && (
                            <button
                              className="icon-button danger"
                              title="Delete"
                              onClick={() => onDelete(group, r)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </>
                      )}
                    {group === "changes" &&
                      r.status === "Pending" &&
                      canEdit && (
                        <button
                          className="secondary small"
                          onClick={() => onDecision(r)}
                        >
                          Review
                        </button>
                      )}
                    {group === "changes" && r.status !== "Pending" && (
                      <span className="muted" title={r.comments}>
                        {r.reviewer}
                        <br />
                        {r.reviewDate}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!count && (
        <p className="empty">
          No matching records. {canEdit ? "Use Add Record to get started." : ""}
        </p>
      )}
      <div className="pagination">
        <span>
          {count} records · Page {current} of {max}
        </span>
        <div>
          <button
            className="secondary small"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <button
            className="secondary small"
            disabled={current === max}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
}
function Charter({ p, s, save, busy, isManager, tab, setTab, records }) {
  return (
    <>
      <div className="tabs">
        {[
          "Project Details",
          "Stakeholders",
          "Management Plan",
          "Milestones",
        ].map((x) => (
          <button
            key={x}
            className={tab === x ? "selected" : ""}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {tab === "Stakeholders" ? (
        records("stakeholders")
      ) : tab === "Milestones" ? (
        records("milestones")
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget));
            save(tab === "Management Plan" ? { plan: d } : d);
          }}
        >
          <div className="charter-grid">
            <Card
              title={
                tab === "Management Plan"
                  ? "Project Management Plan"
                  : "Project Information"
              }
            >
              <div className="form-grid">
                {(tab === "Management Plan"
                  ? Object.keys(p.plan)
                  : charterFields
                ).map((k) => (
                  <label
                    key={k}
                    className={
                      [
                        "description",
                        "objectives",
                        "scope",
                        "hospitals",
                        "deliverables",
                      ].includes(k) || tab === "Management Plan"
                        ? "wide"
                        : ""
                    }
                  >
                    {label(k)}
                    <textarea
                      disabled={!isManager}
                      name={k}
                      rows={k === "hospitals" ? 5 : 2}
                      required={k === "name"}
                      defaultValue={
                        tab === "Management Plan" ? p.plan[k] : p[k]
                      }
                    />
                  </label>
                ))}
              </div>
            </Card>
            <div>
              <Card title="Approved Baseline">
                <dl>
                  {[
                    ["Start date", fmt(p.startDate)],
                    ["Original budget", money(p.originalBudget)],
                    ["Current budget", money(s.baseline.budget)],
                    ["Original duration", p.originalWeeks + " weeks"],
                    ["Approved duration", s.baseline.weeks + " weeks"],
                    ["Target completion", fmt(s.baseline.deadline)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <Badge>{p.status}</Badge>
              </Card>
              <Card title="Change control" className="mt">
                <p>
                  Only approved change requests update the current baseline.
                  Original budget and duration are preserved.
                </p>
                <p className="note">
                  AI functionality is preliminary assistance only. This
                  application manages delivery work and is not a clinical
                  diagnosis system.
                </p>
              </Card>
              {isManager && (
                <button className="mt" disabled={busy}>
                  Save{" "}
                  {tab === "Management Plan"
                    ? "Management Plan"
                    : "Project Charter"}
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </>
  );
}
function ChangeImpact({ s, isManager, busy, onGenerate }) {
  const i = s.impact;
  if (!i) return null;
  const row = (name, a, b) => (
    <tr>
      <td>{name}</td>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  );
  return (
    <Card title="Change Impact on Scope, Schedule and Budget">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Original baseline</th>
              <th>Current approved baseline</th>
            </tr>
          </thead>
          <tbody>
            {row("Budget", money(i.original.budget), money(i.current.budget))}
            {row("Duration", i.original.weeks + " weeks", i.current.weeks + " weeks")}
            {row("Deadline", fmt(i.original.deadline), fmt(i.current.deadline))}
            {row("Budget scheduled in tasks", "", money(i.allocatedCost))}
            {row("Approved budget not yet scheduled", "", money(i.unallocatedBudget))}
          </tbody>
        </table>
      </div>
      <h4 className="mt">Each request</h4>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th>Cost / schedule</th>
              <th>Linked requirements · WBS · tasks</th>
              <th>{"If approved / after approval"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {i.changes.map((c) => (
              <tr key={c.id}>
                <td>{c.id} {c.title}</td>
                <td><Badge>{c.status}</Badge></td>
                <td>+{money(c.cost)} · +{c.weeks} w</td>
                <td>{c.requirements} · {c.wbs} · {c.tasks}</td>
                <td>
                  {c.status === "Pending"
                    ? `${money(c.projected.budget)} · ${c.projected.weeks} weeks · ${fmt(c.projected.deadline)}`
                    : c.status === "Approved"
                      ? "Already in the approved baseline"
                      : "No effect (rejected)"}
                </td>
                <td>
                  {isManager && c.status === "Approved" && c.wbs > 0 && (
                    <button
                      className="secondary small"
                      disabled={busy}
                      onClick={() => onGenerate(c.id)}
                    >
                      Generate tasks
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Pending requests never change the baseline. After approval, "Generate tasks"
        adds schedule tasks (cost and weeks split across the approved work packages),
        so the Gantt chart and EVM include the new work.
      </p>
    </Card>
  );
}
function RiskMatrix({ p }) {
  return (
    <Card title="Risk Prioritization Matrix">
      <p className="muted">
        Likelihood × Impact. Low 1–5 · Medium 6–11 · High 12–19 · Critical
        20–25.
      </p>
      <div className="matrix-wrap">
        <span className="matrix-y">Likelihood</span>
        <div className="matrix">
          {[5, 4, 3, 2, 1].map((l) =>
            [1, 2, 3, 4, 5].map((i) => (
              <div
                key={l + "-" + i}
                className={
                  l * i >= 20
                    ? "critical"
                    : l * i >= 12
                      ? "high"
                      : l * i >= 6
                        ? "medium"
                        : "low"
                }
                title={`Likelihood ${l}, impact ${i}`}
              >
                <small>
                  {l} × {i}
                </small>
                <b>
                  {
                    p.risks.filter(
                      (r) =>
                        r.likelihood === l &&
                        r.impact === i &&
                        r.status !== "Closed",
                    ).length
                  }
                </b>
              </div>
            )),
          )}
          <span className="matrix-x">Impact: 1 → 5</span>
        </div>
      </div>
    </Card>
  );
}
function exportCsv(rows, name) {
  const keys = [...new Set(rows.flatMap(Object.keys))].filter(
    (k) => !["_id"].includes(k),
  );
  const esc = (v) => {
    let t = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    if (/^[=+@\-]/.test(t)) t = "'" + t;
    return '"' + t.replaceAll('"', '""') + '"';
  };
  const csv = [
    keys.map(esc).join(","),
    ...rows.map((r) => keys.map((k) => esc(r[k])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}
function Reports({ p, s }) {
  const [type, setType] = useState("overview"),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  let rows =
    type === "overview"
      ? [
          {
            project: p.name,
            status: p.status,
            originalBudget: p.originalBudget,
            approvedBudget: s.baseline.budget,
            progress: s.progress,
            deadline: s.baseline.deadline,
            ...s.evm,
          },
        ]
      : type === "charter"
        ? [
            {
              ...Object.fromEntries(charterFields.map((k) => [k, p[k]])),
              originalBudget: p.originalBudget,
              currentBudget: s.baseline.budget,
            },
          ]
        : type === "closure"
          ? [p.closure]
          : p[type] || [];
  rows = rows.filter(
    (r) =>
      (!status || r.status === status) &&
      (!from ||
        (r.date || r.start || r.createdAt || "").slice(0, 10) >= from) &&
      (!to || (r.date || r.start || r.createdAt || "9999").slice(0, 10) <= to),
  );
  return (
    <Card title="Reports & Project Dashboard">
      <div className="report-tools">
        <label>
          Report
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setStatus("");
            }}
          >
            {[
              ["overview", "Overall status & EVM"],
              ["charter", "Charter and baseline"],
              ...Object.entries(config).map(([k, v]) => [k, v.name]),
              ["audit", "Audit history"],
              ["closure", "Project closure"],
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All statuses"
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button onClick={() => exportCsv(rows, "healthcare-" + type)}>
          <Download size={16} /> Export CSV
        </button>
        <button className="secondary" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
      </div>
      <div className="report-preview">
        <h2>Smart Healthcare Project Report</h2>
        <p>
          {type.toUpperCase()} · Generated {fmt(today())} · {rows.length}{" "}
          records
        </p>
        {rows.length ? (
          rows.map((r, i) => (
            <dl key={r.id || i}>
              {Object.entries(r)
                .filter(
                  ([k, v]) =>
                    !["_id", "__v"].includes(k) &&
                    v !== null &&
                    v !== undefined &&
                    v !== "",
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{label(k)}</dt>
                    <dd>
                      {typeof v === "object"
                        ? JSON.stringify(v)
                        : typeof v === "number"
                          ? v.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
          ))
        ) : (
          <p className="empty">No records match the selected filters.</p>
        )}
      </div>
    </Card>
  );
}
function Login({ done }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-brand">
        <span className="brand-icon">
          <HeartPulse size={28} />
        </span>
        <h1>Smart Healthcare</h1>
        <p>Project Management System</p>
        <HospitalArt />
      </div>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const v = Object.fromEntries(new FormData(e.currentTarget));
            const r = await api.post("/login", v);
            sessionStorage.setItem("healthcare-token", r.data.data.token);
            sessionStorage.setItem(
              "healthcare-user",
              JSON.stringify(r.data.data.user),
            );
            done(r.data.data.user);
          } catch (e) {
            setError(
              e.response?.data?.error ||
                "Cannot connect to backend. Start the API and MongoDB first.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <small>WELCOME BACK</small>
        <h2>Sign in to your workspace</h2>
        <p className="muted">Plan, track and deliver better healthcare.</p>
        <label>
          Email
          <input
            type="email"
            name="email"
            required
            defaultValue="manager@healthcare.local"
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="note">Use the password you configured during setup.</p>
      </form>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState(() => {
      try {
        return JSON.parse(sessionStorage.getItem("healthcare-user"));
      } catch {
        return null;
      }
    }),
    [p, setP] = useState(null),
    [s, setS] = useState(null),
    [at, setAt] = useState(today()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [modal, setModal] = useState(null),
    [modalError, setModalError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [side, setSide] = useState(false),
    [tab, setTab] = useState("Project Details"),
    [sub, setSub] = useState(""),
    [decision, setDecision] = useState(null),
    [deletion, setDeletion] = useState(null),
    [alerts, setAlerts] = useState(false);
  const location = useLocation(),
    navigate = useNavigate();
  const page = location.pathname.slice(1) || "dashboard";
  const manager = user?.role === "Project Manager";
  const go = (x) => {
    navigate("/" + x);
    setSide(false);
  };
  async function refresh() {
    setLoading(true);
    try {
      const r = await api.get("/project", { params: { date: at || today() } });
      setP(r.data.data);
      setS(r.data.summary);
      setError("");
    } catch (e) {
      setError(
        e.response?.data?.error ||
          "Could not load project. Check your connection.",
      );
      if (e.response?.status === 401) {
        sessionStorage.clear();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (user) refresh();
  }, [user, at]);
  useEffect(() => {
    setSub("");
    setSearch(new URLSearchParams(location.search).get("q") || "");
  }, [page, location.search]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  async function change(url, data, method = "post") {
    setBusy(true);
    setModalError("");
    try {
      await api[method](
        url,
        method === "delete"
          ? { data: { version: p.__v } }
          : { ...data, version: p.__v },
      );
      await refresh();
      setModal(null);
      setDecision(null);
      setDeletion(null);
      setNotice("Changes saved successfully.");
      return true;
    } catch (e) {
      const msg =
        e.response?.data?.error || "Could not save. Please try again.";
      setModalError(msg);
      setError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const canEdit = (g) =>
    manager ||
    ["tasks", "defects"].includes(g) ||
    (g === "quality" && user?.role === "QA");
  const records = (g) => (
    <Records
      key={g}
      group={g}
      p={p}
      canEdit={canEdit(g)}
      isManager={manager}
      query={search}
      onEdit={(group, record) => {
        setModalError("");
        setModal({ group, record });
      }}
      onDelete={(group, record) => {
        setModalError("");
        setDeletion({ group, record });
      }}
      onDecision={(r) => {
        setModalError("");
        setDecision(r);
      }}
    />
  );
  if (!user) return <Login done={setUser} />;
  const title =
    nav.find((n) => n[0] === page)?.[1] || config[page]?.name || "Dashboard";
  return (
    <div className="app">
      <aside className={side ? "open" : ""}>
        <div className="brand">
          <span className="brand-icon">✚</span>
          <div>
            <b>Smart Healthcare</b>
            <small>Project Management System</small>
          </div>
        </div>
        <nav>
          {nav.map(([path, title, I]) => (
            <NavLink
              key={path}
              to={"/" + path}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={() => setSide(false)}
            >
              <I size={21} />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-art">
          <HospitalArt />
          <h3>5 Hospitals Network</h3>
          <p>Better Healthcare, Smarter Management</p>
        </div>
      </aside>
      {side && <div className="scrim" onClick={() => setSide(false)} />}
      <div className="workspace">
        <div className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setSide(!side)}
          >
            <Menu />
          </button>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate("/requirements?q=" + encodeURIComponent(search));
            }}
          >
            <Search size={18} />
            <input
              aria-label="Search project records"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects, tasks, requirements…"
            />
          </form>
          <div className="top-right">
            <div className="notification">
              <button
                className="icon-button"
                aria-label="Show notifications"
                onClick={() => setAlerts(!alerts)}
              >
                <Bell size={21} />
                {s?.pending > 0 && <em>{s.pending}</em>}
              </button>
              {alerts && (
                <div className="notification-panel">
                  <b>Project alerts</b>
                  <p>{s?.pending || 0} pending change requests</p>
                  <p>{s?.critical.length || 0} critical defects</p>
                  <button
                    className="link"
                    onClick={() => {
                      go("changes");
                      setAlerts(false);
                    }}
                  >
                    Review changes
                  </button>
                </div>
              )}
            </div>
            <span className="avatar">
              {user.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
            <span>{user.role}</span>
            <button
              className="icon-button"
              title="Sign out"
              onClick={() => {
                sessionStorage.removeItem("healthcare-token");
                sessionStorage.removeItem("healthcare-user");
                setUser(null);
                setP(null);
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <main>
          {page !== "dashboard" && (
            <div className="page-heading">
              <div>
                <small>Smart Healthcare / {title}</small>
                <h1>{title}</h1>
              </div>
              <Badge>{p?.status}</Badge>
            </div>
          )}
          {notice && (
            <div className="toast">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {error && (
            <div className="error">
              {error}{" "}
              <button className="link" onClick={refresh}>
                Refresh
              </button>
            </div>
          )}
          {loading && !p && <div className="empty">Loading project…</div>}
          {p && s && (
            <>
              {page === "dashboard" && (
                <Dashboard p={p} s={s} at={at} setAt={setAt} go={go} />
              )}
              {page === "charter" && (
                <Charter
                  key={p.__v}
                  p={p}
                  s={s}
                  save={(data) => change("/project", { data }, "put")}
                  busy={busy}
                  isManager={manager}
                  tab={tab}
                  setTab={setTab}
                  records={records}
                />
              )}
              {page === "tasks" && (
                <>
                  <div className="tabs">
                    {[
                      "Gantt Chart",
                      "Task List",
                      "Resources",
                      "Milestones",
                    ].map((x) => (
                      <button
                        key={x}
                        className={
                          (sub || "Gantt Chart") === x ? "selected" : ""
                        }
                        onClick={() => setSub(x)}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                  {!sub || sub === "Gantt Chart" ? (
                    <>
                      <Card
                        title="Project Schedule"
                        action={
                          manager && (
                            <button
                              onClick={() => {
                                setModalError("");
                                setModal({ group: "tasks" });
                              }}
                            >
                              <Plus size={16} /> Add Task
                            </button>
                          )
                        }
                      >
                        <Gantt p={p} />
                        <p className="note">
                          Calendar days, including weekends. Tasks start after
                          predecessors finish. Hover over tasks for dependency
                          IDs.
                        </p>
                      </Card>
                      <div className="schedule-summary">
                        <Card title="Forecast completion">
                          <h2>{fmt(s.schedule.forecast)}</h2>
                          <Badge>
                            {s.schedule.deadlineAtRisk ? "At Risk" : "On Track"}
                          </Badge>
                          <p>Approved deadline: {fmt(s.baseline.deadline)}</p>
                        </Card>
                        <Card title="Downstream impact">
                          <p>
                            {s.schedule.affected.length} tasks affected by
                            delayed predecessors.
                          </p>
                          {s.schedule.affected.map((id) => (
                            <p key={id}>
                              {p.tasks.find((t) => t.id === id)?.title}
                            </p>
                          ))}
                        </Card>
                      </div>
                    </>
                  ) : sub === "Resources" ? (
                    <Workload p={p} />
                  ) : (
                    records(sub === "Milestones" ? "milestones" : "tasks")
                  )}
                </>
              )}
              {page === "costs" && (
                <>
                  <div className="page-toolbar">
                    <p>
                      Baseline dates, task progress history and actual cost
                      records
                    </p>
                    <label>
                      Status date{" "}
                      <input
                        type="date"
                        value={at}
                        onChange={(e) => setAt(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="evm-cards">
                    {["PV", "EV", "AC", "CPI", "SPI", "CV", "SV", "BAC", "EAC", "ETC", "VAC"].map((k) => (
                      <Card key={k}>
                        <small>{k}</small>
                        <h2 className={s.evm[k] < 0 ? "negative" : ""}>
                          {s.evm[k] === null
                            ? "N/A"
                            : ["CPI", "SPI"].includes(k)
                              ? s.evm[k].toFixed(2)
                              : money(s.evm[k])}
                        </h2>
                      </Card>
                    ))}
                  </div>
                  {(s.evm.costWarning ||
                    s.evm.scheduleWarning ||
                    s.evm.overrunForecast ||
                    s.evm.remaining < 0) && (
                    <p className="warning">
                      {s.evm.costWarning
                        ? "Cost performance below threshold. "
                        : ""}
                      {s.evm.scheduleWarning
                        ? "Schedule performance below threshold. "
                        : ""}
                      {s.evm.overrunForecast
                        ? `Forecast overrun: EAC ${money(s.evm.EAC)} exceeds the approved budget by ${money(-s.evm.VAC)}. `
                        : ""}
                      {s.evm.remaining < 0 ? "Approved budget exceeded." : ""}
                    </p>
                  )}
                  <Card title="Planned, Earned & Actual Value">
                    <div className="legend">
                      <span className="pv">Planned value</span>
                      <span className="ev">Earned value</span>
                      <span className="ac">Actual cost</span>
                    </div>
                    <EvmChart data={s.chart} />
                    <p>
                      Remaining budget: <b>{money(s.evm.remaining)}</b>
                    </p>
                  </Card>
                  <div className="mt">{records("costs")}</div>
                </>
              )}
              {page === "defects" && (
                <>
                  <div className="tabs">
                    {["Defect Tracking", "Quality Checklist"].map((x) => (
                      <button
                        key={x}
                        className={
                          (sub || "Defect Tracking") === x ? "selected" : ""
                        }
                        onClick={() => setSub(x)}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                  {records(sub === "Quality Checklist" ? "quality" : "defects")}
                </>
              )}
              {page === "risks" && (
                <>
                  <div className="tabs">
                    {["Risk Register", "Prioritization Matrix", "PDPC"].map(
                      (x) => (
                        <button
                          key={x}
                          className={
                            (sub || "Risk Register") === x ? "selected" : ""
                          }
                          onClick={() => setSub(x)}
                        >
                          {x}
                        </button>
                      ),
                    )}
                  </div>
                  {sub === "Prioritization Matrix" ? (
                    <RiskMatrix p={p} />
                  ) : (
                    records(sub === "PDPC" ? "pdpc" : "risks")
                  )}
                </>
              )}
              {page === "team" && (
                <>
                  <Workload p={p} />
                  <div className="mt">{records("team")}</div>
                </>
              )}
              {["requirements", "wbs", "changes", "milestones"].includes(
                page,
              ) && (
                <>
                  {page === "changes" && (
                    <div className="baseline-strip">
                      <span>
                        Original:{" "}
                        <b>
                          {money(p.originalBudget)} · {p.originalWeeks} weeks
                        </b>
                      </span>
                      <span>
                        Approved:{" "}
                        <b>
                          {money(s.baseline.budget)} · {s.baseline.weeks} weeks
                        </b>
                      </span>
                    </div>
                  )}
                  {page === "changes" && (
                    <ChangeImpact
                      s={s}
                      isManager={manager}
                      busy={busy}
                      onGenerate={(id) =>
                        change("/changes/" + id + "/generate-tasks", {})
                      }
                    />
                  )}
                  {page === "wbs" && (
                    <Card title="Approved & Proposed Scope">
                      <WbsTree rows={p.wbs} />
                    </Card>
                  )}
                  <div className={page === "wbs" ? "mt" : ""}>
                    {records(page)}
                  </div>
                </>
              )}
              {page === "reports" && <Reports p={p} s={s} />}
              {page === "closure" && (
                <Card title="Project Closure Record">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      change(
                        "/project",
                        {
                          data: {
                            closure: Object.fromEntries(
                              new FormData(e.currentTarget),
                            ),
                          },
                        },
                        "put",
                      );
                    }}
                  >
                    <div className="form-grid">
                      {["date", "status", "issues", "lessons", "notes"].map(
                        (k) => (
                          <label
                            key={k}
                            className={k === "notes" ? "wide" : ""}
                          >
                            {label(k)}
                            {k === "date" ? (
                              <input
                                type="date"
                                name={k}
                                defaultValue={p.closure?.[k]}
                                disabled={!manager}
                              />
                            ) : (
                              <textarea
                                name={k}
                                defaultValue={p.closure?.[k]}
                                disabled={!manager}
                              />
                            )}
                          </label>
                        ),
                      )}
                    </div>
                    <p>
                      Recorded final cost:{" "}
                      {p.closure?.finalCost !== undefined
                        ? money(p.closure.finalCost)
                        : "Not yet recorded"}
                    </p>
                    {manager && (
                      <button disabled={busy}>Save Closure Record</button>
                    )}
                  </form>
                </Card>
              )}
              {page === "settings" && (
                <Card title="Project Settings">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      change(
                        "/project",
                        {
                          data: {
                            threshold: Number(d.threshold),
                            status: d.status,
                          },
                        },
                        "put",
                      );
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        EVM warning threshold
                        <input
                          type="number"
                          name="threshold"
                          min="0"
                          max="1"
                          step=".01"
                          defaultValue={p.threshold}
                          disabled={!manager}
                        />
                      </label>
                      <label>
                        Project status
                        <select
                          name="status"
                          defaultValue={p.status}
                          disabled={!manager}
                        >
                          {[
                            "Planning",
                            "In Progress",
                            "On Hold",
                            "Completed",
                          ].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {manager && (
                      <button className="mt" disabled={busy}>
                        Save Settings
                      </button>
                    )}
                    <p className="note">
                      Signed in as {user.name} ({user.role}). Change approvals
                      and baseline changes require the Project Manager role.
                    </p>
                  </form>
                </Card>
              )}
            </>
          )}
          <footer className="app-footer">
            Smart Healthcare Project Management System{" "}
            <span>Fictional project data · Academic demonstration</span>
          </footer>
        </main>
      </div>
      {modal && (
        <RecordForm
          key={modal.group + (modal.record?.id || "new")}
          {...modal}
          p={p}
          busy={busy}
          error={modalError}
          onClose={() => setModal(null)}
          onSave={(g, data, id) =>
            change(
              "/" + g + (id ? "/" + id : ""),
              { data },
              id ? "put" : "post",
            )
          }
        />
      )}
      {decision && (
        <div className="overlay">
          <form
            className="modal decision"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Object.fromEntries(new FormData(e.currentTarget));
              change("/changes/" + decision.id + "/decision", v);
            }}
          >
            <header>
              <h2>Review Change Request</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setDecision(null)}
              >
                <X />
              </button>
            </header>
            <h3>{decision.title}</h3>
            <p>{decision.description}</p>
            <div className="baseline-strip">
              +{money(decision.cost)} · +{decision.weeks} weeks
            </div>
            <label>
              Decision
              <select name="status">
                <option>Approved</option>
                <option>Rejected</option>
              </select>
            </label>
            <label>
              Approval / rejection comments
              <textarea name="comments" required rows="4" />
            </label>
            {modalError && <p className="error">{modalError}</p>}
            <p className="note">
              Decisions are final. Approval updates the current budget, duration
              and linked scope together.
            </p>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setDecision(null)}
              >
                Cancel
              </button>
              <button disabled={busy}>Confirm Decision</button>
            </footer>
          </form>
        </div>
      )}
      {deletion && (
        <div className="overlay">
          <section className="modal decision" role="dialog" aria-modal="true">
            <h2>Delete this record?</h2>
            <p>{deletion.record.title}</p>
            <p>Referenced records cannot be deleted while they are in use.</p>
            {modalError && <p className="error">{modalError}</p>}
            <footer>
              <button className="secondary" onClick={() => setDeletion(null)}>
                Cancel
              </button>
              <button
                className="delete-button"
                disabled={busy}
                onClick={() =>
                  change(
                    "/" + deletion.group + "/" + deletion.record.id,
                    {},
                    "delete",
                  )
                }
              >
                Delete Record
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
function Workload({ p }) {
  return (
    <Card title="Resource Allocation">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Team Member</th>
              <th>Role</th>
              <th>Assigned tasks</th>
              <th>Estimated effort</th>
              <th>Actual effort</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {p.team.map((t) => {
              const tasks = p.tasks.filter((x) => x.owner === t.id);
              return (
                <tr key={t.id}>
                  <td>
                    <b>{t.title}</b>
                    <small className="block muted">{t.id}</small>
                  </td>
                  <td>{t.role}</td>
                  <td>
                    {tasks.map((x) => x.title).join(", ") || "Unassigned"}
                  </td>
                  <td>{tasks.reduce((s, x) => s + (x.effort || 0), 0)} hrs</td>
                  <td>
                    {tasks.reduce((s, x) => s + (x.actualEffort || 0), 0)} hrs
                  </td>
                  <td>
                    <Badge>{t.status}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function WbsTree({ rows, parent = "" }) {
  return (
    <ul className="wbs-tree">
      {rows
        .filter((r) => (r.parent || "") === parent)
        .map((r) => (
          <li key={r.id}>
            <span>
              <Network size={15} />
              <b>{r.id}</b> {r.title} <Badge>{r.status}</Badge>
            </span>
            <WbsTree rows={rows} parent={r.id} />
          </li>
        ))}
    </ul>
  );
}
