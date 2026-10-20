import { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";

export function createAdminGuard(token: () => string | undefined): RequestHandler {
  return (req, res, next) => {
    const configured = token();
    if (!configured) return void res.sendStatus(503);
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return void res.sendStatus(401);
    const actual = Buffer.from(header.slice(7));
    const expected = Buffer.from(configured);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return void res.sendStatus(401);
    next();
  };
}
