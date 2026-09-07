import type { Context } from "https://edge.netlify.com";

// Gate the internal cotizador behind a password.
//
// Runs at the edge before Netlify serves anything under the cotizador folder,
// so the HTML, the JS, and the raw price JSON are all covered — there is no
// client-side check to bypass. The password lives in the COTIZADOR_PASSWORD
// environment variable on Netlify, never in this (public) repo.

const USER = "edecoration";
const REALM = "Cotizador Interno";

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
  const gated = new Response(response.body, response);
  gated.headers.set("Cache-Control", "private, no-store");
  gated.headers.set("X-Robots-Tag", "noindex, nofollow");
  return gated;
};

export const config = {
  path: ["/cotizador-yjxo0o", "/cotizador-yjxo0o/*"],
};
