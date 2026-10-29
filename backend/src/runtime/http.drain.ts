import type { Request, Response, NextFunction, RequestHandler } from "express";
import { WorkGroup } from "./lifecycle";

export class HttpDrain {
  readonly work = new WorkGroup();
  private draining = false;
  begin() { this.draining = true; }
  reject = (req: Request, res: Response, next: NextFunction) => {
    if (this.draining || req.app?.locals?.shuttingDown) return res.set("Connection", "close").status(503).json({ error: "Serviço em encerramento. Tente novamente." });
    next();
  };
  handler<T extends (req: Request, res: Response, next: NextFunction) => unknown>(handler: T): RequestHandler {
    return (req, res, next) => {
      if (this.draining || req.app?.locals?.shuttingDown) return this.reject(req, res, next);
      // Track the handler's promise, not socket finish/close. An aborted HTTP
      // client can leave a database transaction running after its socket closes.
      return this.work.run(() => handler(req, res, next));
    };
  }
}
export const httpDrain = new HttpDrain();
