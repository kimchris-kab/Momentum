import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suite } from "./harness.mjs";
import { PENDING_URGE_KEY, WIDGET_KEY } from "../src/lib/widget.js";

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
  // It compiles now — on GitHub's runners, on every push — but compiling isn't running.
  // Until someone has put the widget on a home screen and tapped it, the Java says so where
  // whoever works on it next will see it. When that changes, so should this.
  t.ok("the Java says out loud that it hasn't been run on a device",
    /NOT YET RUN ON A DEVICE/.test(widgetJava));
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  t.ok("...and something compiles it on every push", /assembleDebug/.test(workflow) && /android\/\*\*/.test(workflow));
}

t.group("the Urge button, from home screen to urge screen");
{
  const activity = read("java/com/momentum/app/MainActivity.java");
  const app = readFileSync(join(ROOT, "src", "Momentum.jsx"), "utf8");

  // A widget layout may only use the classes RemoteViews allows. Anything else — a bare View
  // used as a divider, say — doesn't fail at build time: the whole widget shows "Problem
  // loading widget" on the phone. That was nearly shipped.
  const ALLOWED = new Set(["FrameLayout", "LinearLayout", "RelativeLayout", "GridLayout", "AnalogClock",
    "Button", "Chronometer", "ImageButton", "ImageView", "ProgressBar", "TextView", "ViewFlipper",
    "ListView", "GridView", "StackView", "AdapterViewFlipper", "ViewStub", "CheckBox", "Switch", "RadioButton",
    "RadioGroup", "TextClock"]);
  const tags = [...layout.matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s>/]/g)].map((m) => m[1]).filter((tag) => tag !== "?xml");
  t.eq("every element in the widget is one RemoteViews will inflate",
    [...new Set(tags.filter((tag) => !ALLOWED.has(tag)))], []);

  // Two languages, one string, and nothing to catch a typo in either until a tap on a phone
  // silently does nothing.
  t.ok("the activity leaves the id under the key the app reads", activity.includes(`"${PENDING_URGE_KEY}"`), PENDING_URGE_KEY);
  t.ok("...in the file Capacitor's Preferences reads", activity.includes('"CapacitorStorage"'));
  const event = activity.match(/triggerWindowJSEvent\("([^"]+)"\)/)?.[1];
  t.ok("the nudge the activity sends is the one the app listens for",
    event && app.includes(`addEventListener("${event}"`), event);

  // singleTask: a second launch goes to onNewIntent. Handling only onCreate is the classic way
  // this works exactly once — on a cold start — and never again.
  t.ok("the activity is singleTask, so a running app gets the tap in onNewIntent",
    /android:launchMode="singleTask"/.test(manifest));
  t.ok("...which it handles", /void onNewIntent\(Intent intent\)/.test(activity));
  t.ok("...keeping Capacitor's own handling", /super\.onNewIntent\(intent\)/.test(activity));
  t.ok("a cold start from the widget is handled too", /onCreate[\s\S]*stashUrge\(getIntent\(\)\)/.test(activity));
  t.ok("the activity reads the same scheme and host the widget builds",
    activity.includes("MomentumWidget.URGE_SCHEME") && activity.includes("MomentumWidget.URGE_HOST"));

  // PendingIntents are the same if action, data and class match — extras don't count. Without
  // a distinct URI per row, every Urge button opens whichever habit was bound last.
  const urgeBlock = widgetJava.slice(widgetJava.indexOf("new Intent(context, MainActivity.class)"));
  t.ok("each Urge carries its habit in the intent's data, not only in extras",
    /\.setData\(/.test(urgeBlock.slice(0, 400)) && /appendPath\(id\)/.test(urgeBlock.slice(0, 400)));
  t.ok("...with a request code of its own", /PendingIntent\.getActivity\(\s*context,\s*100 \+ i/.test(widgetJava));
  t.ok("...immutable, as Android 12 and later require", /FLAG_IMMUTABLE/.test(urgeBlock.slice(0, 700)));
  t.ok("every Urge button is given a tap handler",
    /quitButtons\s*=\s*\{\s*R\.id\.quit_0_urge,\s*R\.id\.quit_1_urge\s*\}/.test(widgetJava)
    && /setOnClickPendingIntent\(quitButtons\[i\]/.test(widgetJava));
}
