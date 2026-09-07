import type { Context } from "https://edge.netlify.com";

// Gate the internal cotizador behind a password.
//
// Runs at the edge before Netlify serves anything under /cotizador, so the
// page, its scripts and the raw price JSON are all covered — there is no
// client-side check to bypass. The password lives in the COTIZADOR_PASSWORD
// environment variable on Netlify, never in this (public) repo.
//
// The function is mounted on every path rather than on "/cotizador/*" on
// purpose. Netlify matches those route patterns literally, but its asset
// server is case-insensitive and collapses repeated slashes, so
// //cotizador/data/catalog.json and /COTIZADOR/data/catalog.json both reach
// the file while sliding past a literal pattern. We normalise the path the
// same way the asset server does and decide here instead.

const USER = "edecoration";
const REALM = "Cotizador Interno";
const GATED = "cotizador";

function isGated(pathname: string): boolean {
  let path = pathname;

  // Percent-decode to a fixed point so %2f and friends cannot hide a segment.
  for (let i = 0; i < 4; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      break;
    }
    if (decoded === path) break;
    path = decoded;
  }

  // Treat backslashes as separators, then drop empty and "." segments the way
  // path normalisation does, so "//x", "/./x" and "/x/" all reduce alike.
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return segments[0]?.toLowerCase() === GATED;
}

// Constant-time-ish compare so a wrong guess leaks nothing through timing.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unauthorized(): Response {
  return new Response("Acceso restringido.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

export default async (request: Request, context: Context) => {
  const pathname = new URL(request.url).pathname;

  let gated: boolean;
  try {
    gated = isGated(pathname);
  } catch {
    // Never fail open: if normalisation itself breaks, anything that even
    // mentions the folder still has to prove itself.
    gated = pathname.toLowerCase().includes(GATED);
  }

  // Everything else on the site is public; hand it straight back to Netlify.
  if (!gated) return;

  const expected = Deno.env.get("COTIZADOR_PASSWORD");

  // No password configured means the gate is not working; fail closed.
  if (!expected) {
    return new Response("Cotizador no disponible.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const header = request.headers.get("Authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme?.toLowerCase() !== "basic" || !encoded) return unauthorized();

  let decoded: string;
  try {
    decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    );
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return unauthorized();

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  if (user !== USER || !sameSecret(password, expected)) return unauthorized();

  // Correct password: let Netlify serve the file, but keep it out of shared caches.
  const response = await context.next();
  const gatedResponse = new Response(response.body, response);
  gatedResponse.headers.set("Cache-Control", "private, no-store");
  gatedResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  return gatedResponse;
};

export const config = {
  path: "/*",
};
