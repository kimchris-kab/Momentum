import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suite } from "./harness.mjs";
import { WIDGET_KEY } from "../src/lib/widget.js";

const t = suite("android");

// Nothing in this sandbox can compile the Android project — the org's egress policy blocks
// dl.google.com, so the SDK and AGP can't be fetched. That left the widget's Java and XML
// completely unchecked by anything, and a hand review found three faults that would each
// have stopped it working entirely.
//
// This is not a compiler. It's the subset of what one would have caught that can be checked
// by reading the files: unbound namespaces, unescaped apostrophes, resource references that
// point at nothing, and the handful of manifest details an app widget depends on.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID = join(ROOT, "android", "app", "src", "main");
const read = (p) => readFileSync(join(ANDROID, p), "utf8");
const exists = (p) => existsSync(join(ANDROID, p));

const resFiles = [];
const walk = (dir) => {
  readdirSync(join(ANDROID, dir), { withFileTypes: true }).forEach((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith(".xml")) resFiles.push(rel);
  });
};
walk("res");
const xmlFiles = ["AndroidManifest.xml", ...resFiles];

const manifest = read("AndroidManifest.xml");
const strings = read("res/values/strings.xml");
const styles = read("res/values/styles.xml");
const widgetJava = read("java/com/momentum/app/MomentumWidget.java");
const layout = read("res/layout/momentum_widget.xml");

const declaredNames = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}\\s+name="([^"]+)"`, "g"))].map((m) => m[1]);

t.group("xml is well formed");
{
  xmlFiles.forEach((file) => {
    const xml = read(file);
    // Every prefix used has to be bound somewhere in the file. An unbound one (tools:ignore
    // without xmlns:tools, say) is a hard build failure, not a warning.
    const declared = new Set(["android", "xml", ...[...xml.matchAll(/xmlns:([a-zA-Z0-9]+)=/g)].map((m) => m[1])]);
    const used = new Set([...xml.matchAll(/\s([a-zA-Z0-9]+):[a-zA-Z0-9_]+\s*=/g)].map((m) => m[1]));
    const unbound = [...used].filter((p) => p !== "xmlns" && !declared.has(p));
    t.eq(`${file}: every namespace prefix is declared`, unbound, []);

    const opens = (xml.match(/<[a-zA-Z]/g) || []).length;
    const closes = (xml.match(/<\/[a-zA-Z]/g) || []).length + (xml.match(/\/>/g) || []).length;
    t.ok(`${file}: tags balance`, opens === closes, { opens, closes });
  });
}

t.group("string resources");
{
  // An unescaped apostrophe in a string resource is an AAPT error, and "Today's habits"
  // is exactly the kind of copy that trips it.
  const values = [...strings.matchAll(/<string name="[^"]+">([\s\S]*?)<\/string>/g)].map((m) => m[1]);
  const unescaped = values.filter((v) => /(^|[^\\])'/.test(v));
  t.eq("apostrophes are escaped", unescaped, []);
  t.ok("there are strings at all", values.length > 0);
}

t.group("resource references resolve");
{
  const stringNames = new Set(declaredNames(strings, "string"));
  const styleNames = new Set(declaredNames(styles, "style"));

  const refs = (text, kind) => [...text.matchAll(new RegExp(`@${kind}/([a-zA-Z0-9_]+)`, "g"))].map((m) => m[1]);
  const javaStrings = [...widgetJava.matchAll(/R\.string\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]);

  const missingStrings = [...xmlFiles.flatMap((f) => refs(read(f), "string")), ...javaStrings]
    .filter((n) => !stringNames.has(n));
  t.eq("every @string points at one that exists", [...new Set(missingStrings)], []);

  const missingStyles = xmlFiles.flatMap((f) => refs(read(f), "style")).filter((n) => !styleNames.has(n));
  t.eq("every @style exists", [...new Set(missingStyles)], []);

  // A drawable can be a png as easily as an xml, and can live in any density-qualified
  // folder, so resolve by name across all of them rather than by exact path.
  const resDirs = readdirSync(join(ANDROID, "res"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const resolves = (kind, name) => resDirs
    .filter((d) => d === kind || d.startsWith(`${kind}-`))
    .some((d) => readdirSync(join(ANDROID, "res", d)).some((f) => f.replace(/\.[^.]+$/, "") === name));

  const missingFiles = xmlFiles.flatMap((f) => {
    const xml = read(f);
    return ["layout", "drawable", "xml", "mipmap"]
      .flatMap((kind) => refs(xml, kind).map((n) => ({ kind, n })));
  }).filter(({ kind, n }) => !resolves(kind, n)).map(({ kind, n }) => `@${kind}/${n}`);
  t.eq("every referenced layout, drawable, mipmap and xml file is there", [...new Set(missingFiles)], []);

  // A missing R.id is a compile error in Java and a silent no-op in RemoteViews.
  const layoutIds = new Set([...layout.matchAll(/android:id="@\+id\/([a-zA-Z0-9_]+)"/g)].map((m) => m[1]));
  const javaIds = [...widgetJava.matchAll(/R\.id\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]);
  t.eq("every view the widget writes to exists in its layout",
    [...new Set(javaIds.filter((id) => !layoutIds.has(id)))], []);
  t.ok("the layout has a root the tap handler can bind to", layoutIds.has("widget_root"));
}

t.group("the widget's manifest entry");
{
  const receiver = manifest.match(/<receiver[\s\S]*?<\/receiver>/)?.[0] || "";
  t.ok("there is one", receiver.includes(".MomentumWidget"));
  // The launcher is a different app: an unexported provider never receives a single
  // broadcast, so the widget doesn't even appear in the picker.
  t.ok("it is exported", /android:exported="true"/.test(receiver));
  t.ok("it listens for the update broadcast",
    receiver.includes("android.appwidget.action.APPWIDGET_UPDATE"));
  t.ok("it points at its provider metadata",
    /android:name="android.appwidget.provider"/.test(receiver)
    && /@xml\/momentum_widget_info/.test(receiver));

  const info = read("res/xml/momentum_widget_info.xml");
  t.ok("the provider declares a layout", /initialLayout="@layout\/momentum_widget"/.test(info));
  // Android refuses anything under half an hour, and silently rounds it up.
  const period = Number(info.match(/updatePeriodMillis="(\d+)"/)?.[1]);
  t.ok("its update period is one Android will honour", period >= 1800000, period);
}

t.group("the bridge between app and widget");
{
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  // Without this the snapshot is never written at all and the widget sits at "—" forever.
  t.ok("the Preferences plugin is a dependency", !!pkg.dependencies["@capacitor/preferences"]);
  const settings = readFileSync(join(ROOT, "android", "capacitor.settings.gradle"), "utf8");
  t.ok("...and is wired into the Android build", settings.includes("capacitor-preferences"));

  // Capacitor's Preferences writes to this SharedPreferences file with unprefixed keys;
  // the widget reads the same file directly, so the two names have to agree.
  t.ok("the widget reads the file Capacitor writes", widgetJava.includes('"CapacitorStorage"'));
  t.ok("...under the same key the app publishes", widgetJava.includes(`"${WIDGET_KEY}"`), WIDGET_KEY);

  const plugin = join(ANDROID, "java/com/momentum/app/MomentumWidgetPlugin.java");
  t.ok("the refresh bridge exists", existsSync(plugin));
  const main = read("java/com/momentum/app/MainActivity.java");
  t.ok("...and is registered before the bridge is built",
    main.indexOf("registerPlugin(MomentumWidgetPlugin.class)") < main.indexOf("super.onCreate"));
  t.ok("...and the app calls it by the name it registers under",
    readFileSync(join(ROOT, "src/lib/widget.js"), "utf8").includes("MomentumWidget")
    && readFileSync(plugin, "utf8").includes('name = "MomentumWidget"'));
}

t.group("honesty about what this is");
{
  // None of the above compiles anything. If that ever stops being true the note should go,
  // but until then it stays where whoever builds this will see it.
  t.ok("the Java says out loud that it has never been built",
    /NOT VERIFIED/.test(widgetJava));
}
