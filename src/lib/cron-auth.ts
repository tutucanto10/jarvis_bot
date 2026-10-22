import { getBriefingEnv } from "./env";
import { safeEqual } from "./secrets";

/** `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends), or `?secret=` when allowed. */
export function isCronAuthorized(req: Request, { allowQuery = false } = {}): boolean {
  const secret = getBriefingEnv().CRON_SECRET;
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const query = allowQuery ? new URL(req.url).searchParams.get("secret") : null;
  return safeEqual(bearer, secret) || safeEqual(query, secret);
}
