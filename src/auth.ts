import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { User } from "./models";

const secret = () => process.env.JWT_SECRET || "dev-only-secret-change-me";

export function signUser(userId: string) {
  return jwt.sign({ sub: userId }, secret(), { expiresIn: "7d" });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.session;
    if (!token) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } });
    const payload = jwt.verify(token, secret()) as { sub: string };
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: { code: "INVALID_SESSION", message: "Session expired" } });
    (req as any).userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: { code: "INVALID_SESSION", message: "Session expired" } });
  }
}
