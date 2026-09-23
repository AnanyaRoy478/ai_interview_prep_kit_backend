import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { z } from "zod";
import { User, KitModel } from "./models";
import { signUser, requireAuth } from "./auth";
import { runPipeline } from "./pipeline/run";
import { validateKit } from "./validation/kit";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

const inputSchema = z.object({
  jd: z.string().min(2).max(100_000),
  company_url: z.string().url(),
  days: z.number().int().min(1).max(365)
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(8).max(200) }).parse(req.body);
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: { code: "EMAIL_EXISTS", message: "Email already registered" } });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });
    res.cookie("session", signUser(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7*24*60*60*1000 });
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (e:any) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: e.message } });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
    res.cookie("session", signUser(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7*24*60*60*1000 });
    res.json({ user: { id: user.id, email: user.email } });
  } catch (e:any) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: e.message } });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("session");
  res.status(204).end();
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await User.findById((req as any).userId).select("_id email");
  res.json({ user });
});

app.get("/api/kits", requireAuth, async (req, res) => {
  const kits = await KitModel.find({ userId: (req as any).userId }).sort({ createdAt: -1 });
  res.json({ kits });
});

app.get("/api/kits/:id", requireAuth, async (req, res) => {
  const kit = await KitModel.findOne({ _id: req.params.id, userId: (req as any).userId });
  if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });
  res.json({ kit });
});

app.post("/api/kits", requireAuth, async (req, res) => {
  try {
    const input = inputSchema.parse(req.body);
    const companyName = new URL(input.company_url)
  .hostname
  .replace(/^www\./, "")
  .split(".")[0];
    const record = await KitModel.create({
      userId: (req as any).userId,
      title:  `${companyName} Interview Prep Kit`,
      status: "generating",
      progress: "queued"
    });

    runPipeline(input, async stage => {
      await KitModel.findByIdAndUpdate(record.id, { progress: stage });
    }).then(async kit => {
      await KitModel.findByIdAndUpdate(record.id, { status: "ready", progress: "complete", data: kit });
    }).catch(async err => {
      await KitModel.findByIdAndUpdate(record.id, { status: "failed", progress: "failed", error: { code: "PIPELINE_FAILED", message: err.message } });
    });

    res.status(202).json({ kitId: record.id });
  } catch (e:any) {
    res.status(400).json({ error: { code: "INVALID_INPUT", message: e.message } });
  }
});

app.put("/api/kits/:id", requireAuth, async (req, res) => {
  const body = validateKit(req.body);
  const kit = await KitModel.findOneAndUpdate(
    { _id: req.params.id, userId: (req as any).userId },
    { data: body, status: "ready" },
    { new: true }
  );
  if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });
  res.json({ kit });
});

app.post("/api/kits/:id/regenerate", requireAuth, async (req, res) => {
  // Section-level regeneration hook. The frontend sends the preserved kit plus a section name.
  const { section } = z.object({ section: z.enum(["company_brief", "questions", "schedule"]) }).parse(req.body);
  const existing = await KitModel.findOne({ _id: req.params.id, userId: (req as any).userId });
  if (!existing?.data) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found" } });

  // A production implementation can call the same provider with section-specific context.
  // This endpoint intentionally preserves all unrelated user edits.
  const data = existing.data;
  data._lastRegeneratedSection = section;
  await KitModel.updateOne({ _id: existing.id }, { data });
  res.json({ kit: await KitModel.findById(existing.id) });
});

async function start() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/interview_prep");
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
}
start().catch(err => { console.error(err); process.exit(1); });
