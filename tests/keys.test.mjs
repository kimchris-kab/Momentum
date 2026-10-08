import { execFileSync } from "node:child_process";
import { suite } from "./harness.mjs";
import { keyProblem } from "../src/lib/keys.js";
import { configProblem, readConfig } from "../src/lib/cloud.js";

const t = suite("keys");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", ref: "abcdefgh", role })}.sig_nature-1`;
const URL_ = "https://abcdefgh.supabase.co";

t.eq("an anon key is fine", keyProblem(jwt("anon")), null);
t.eq("so is a publishable key", keyProblem("sb_publishable_abc123"), null);
t.eq("nothing is nothing to complain about", keyProblem(""), null);
t.ok("the service role key is refused", /service role/i.test(keyProblem(jwt("service_role"))));
t.ok("so is a new-style secret key", /secret/i.test(keyProblem("sb_secret_abc123")));
t.eq("garbage is left to the shape check", keyProblem("not-a-key"), null);

t.ok("the app will not take a service key typed in", /service role/i.test(configProblem({ url: URL_, anonKey: jwt("service_role") })));
t.eq("and takes an anon one", configProblem({ url: URL_, anonKey: jwt("anon") }), null);
t.ok("or one that arrived in the build", /service role/i.test(configProblem(readConfig({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: jwt("service_role") }))));
t.eq("a build's project shows as coming from the build", readConfig({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: jwt("anon") }).source, "build");

// The build itself, since a public file is where a leaked key does the damage.
const build = (key) => {
  try {
    execFileSync("npx", ["vite", "build", "--outDir", "/tmp/momentum-keyguard"], {
      env: { ...process.env, VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: key }, stdio: "pipe", encoding: "utf8",
    });
    return { ok: true, out: "" };
  } catch (e) { return { ok: false, out: `${e.stdout}${e.stderr}` }; }
};
const bad = build(jwt("service_role"));
t.eq("a build handed the service key stops", bad.ok, false);
t.ok("and says why", /service role/i.test(bad.out));
t.eq("a build handed the anon key goes ahead", build(jwt("anon")).ok, true);

