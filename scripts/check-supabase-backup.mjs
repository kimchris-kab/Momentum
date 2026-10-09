// Read-only look at the Supabase project behind the app's cloud backup, run from CI where the secrets already are.
// It says whether the table exists, how many accounts there are, and what each backup row looks like from the outside.
// It never prints an email, a user id, a key, or anything from inside a backup: this repository is public, so so are its logs.
import { createHash } from "node:crypto";

const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const service = (process.env.SUPABASE_SERVICE_KEY || "").trim();
const anon = (process.env.SUPABASE_ANON_KEY || "").trim();
if (!url || !service) { console.log("SUPABASE_URL / SUPABASE_SERVICE_KEY are not set, so nothing can be checked."); process.exit(0); }

const get = async (path, key) => {
  try {
    const res = await fetch(`${url}${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    let body = null; try { body = await res.json(); } catch { /* not json */ }
    return { status: res.status, body };
  } catch (e) { return { status: 0, body: null, error: e.message }; }
};
const tag = (id) => createHash("sha256").update(String(id)).digest("hex").slice(0, 6);

console.log("== Project");
const settings = await get("/auth/v1/settings", anon || service);
console.log(`auth settings: HTTP ${settings.status}`);
if (settings.body) {
  console.log(`  email sign-in on: ${settings.body.external?.email}`);
  console.log(`  confirm-email OFF (auto-confirm): ${settings.body.mailer_autoconfirm}`);
  console.log(`  new sign-ups disabled: ${settings.body.disable_signup}`);
}

console.log("== Accounts");
const users = await get("/auth/v1/admin/users?per_page=200", service);
if (users.status !== 200) console.log(`could not list accounts: HTTP ${users.status}`);
else {
  const list = users.body?.users || [];
  console.log(`${list.length} account(s)`);
  for (const u of list) {
    console.log(`  account ${tag(u.id)}: created ${u.created_at}, confirmed ${!!u.email_confirmed_at}, last sign-in ${u.last_sign_in_at || "never"}`);
  }
}

console.log("== Backups table");
const rows = await get("/rest/v1/backups?select=user_id,updated_at,device,item_count,size_bytes,schema_version", service);
if (rows.status === 404) console.log("THE TABLE DOES NOT EXIST. Run supabase/schema.sql in the Supabase SQL editor.");
else if (rows.status !== 200) console.log(`could not read the table: HTTP ${rows.status} ${JSON.stringify(rows.body)?.slice(0, 200)}`);
else {
  console.log(`${rows.body.length} backup row(s)`);
  for (const r of rows.body) {
    console.log(`  account ${tag(r.user_id)}: written ${r.updated_at} from "${r.device}", ${r.item_count} items, ${r.size_bytes} bytes, schema ${r.schema_version}`);
  }
  if (!rows.body.length) console.log("The table is there but empty: no phone has ever managed to save a backup into it.");
}

if (anon) {
  console.log("== What the app's own key sees (should be refused, not 404)");
  const a = await get("/rest/v1/backups?select=user_id&limit=1", anon);
  console.log(`anon read: HTTP ${a.status}`);
}
