import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suite } from "./harness.mjs";
import { PENDING_LAPSE_KEY, PENDING_URGE_KEY, WIDGET_KEY, widgetSnapshot } from "../src/lib/widget.js";
import { SHADE_KEY, shadeSnapshot } from "../src/lib/shade.js";
import { PATTERNS, hapticCycle } from "../src/lib/pacer.js";
import { PENDING_PEP_KEY, PEP_KEY } from "../src/lib/pep.js";
import { CAPTURE_KEY, PENDING_DRAFT_KEY, PENDING_TX_KEY, UNDO_TX_KEY } from "../src/lib/capture.js";
import P from "../src/lib/txpatterns.json" with { type: "json" };
import { pepPlan } from "../src/lib/pepPlan.js";
import { widgetZones, zoneFromPreset } from "../src/lib/redzone.js";
import { REQUIRES_NATIVE_API } from "../src/lib/nativeApi.js";
import { MAX_FILES as otaMaxFiles, MAX_TOTAL_BYTES as otaMaxBytes, SAFE_PATH, signingPayload, verifyManifest } from "../scripts/ota.mjs";
import { newLapse, newUrge } from "../src/lib/urges.js";

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
const rowLayout = read("res/layout/widget_task_row.xml");
const pepLineLayout = read("res/layout/widget_pep_line.xml");
const serviceJava = read("java/com/momentum/app/MomentumWidgetService.java");

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
  const javaStrings = [...widgetJava.matchAll(/R\.string\.([a-zA-Z0-9_]+)/g), ...serviceJava.matchAll(/R\.string\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]);

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
  const idsIn = (xml) => [...xml.matchAll(/android:id="@\+id\/([a-zA-Z0-9_]+)"/g)].map((m) => m[1]);
  const layoutIds = new Set([...idsIn(layout), ...idsIn(rowLayout), ...idsIn(pepLineLayout)]);
  const javaIds = [...widgetJava.matchAll(/R\.id\.([a-zA-Z0-9_]+)/g), ...serviceJava.matchAll(/R\.id\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]);
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
  // The Java claims it's inflated on an emulator by the widget test. That has to be true.
  t.ok("...and the widget test the Java mentions exists and is run by the workflow",
    existsSync(join(ROOT, "android/app/src/androidTest/java/com/momentum/app/WidgetTest.java"))
    && /connectedDebugAndroidTest/.test(workflow));
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
  const tags = [...layout.matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s>/]/g), ...rowLayout.matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s>/]/g), ...pepLineLayout.matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s>/]/g)].map((m) => m[1]).filter((tag) => tag !== "?xml");
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

t.group("the scrolling task list");
{
  // RemoteViews has no list of its own: a ListView needs a service to supply each row. Every
  // link in that chain is a place a widget can show nothing, with no error anywhere.
  t.ok("the layout has a ListView for the tasks", /<ListView[\s\S]*?android:id="@\+id\/widget_list"/.test(layout));
  t.ok("...and something to show when it's empty", /@\+id\/widget_list_empty/.test(layout) && /setEmptyView\(R\.id\.widget_list,\s*R\.id\.widget_list_empty\)/.test(widgetJava));
  t.ok("it takes the room that's left rather than a fixed height",
    /<ListView[\s\S]*?android:layout_height="0dp"[\s\S]*?android:layout_weight="1"/.test(layout));

  const service = manifest.match(/<service[\s\S]*?\/>/)?.[0] || "";
  t.ok("the service is declared", service.includes(".MomentumWidgetService"), service);
  // Without this permission the system refuses to bind it and the list stays empty.
  t.ok("...guarded by the permission the system binds with", /android:permission="android\.permission\.BIND_REMOTEVIEWS"/.test(service));
  t.ok("...and not open to other apps", /android:exported="false"/.test(service));
  t.ok("the service class extends RemoteViewsService", /class MomentumWidgetService extends RemoteViewsService/.test(serviceJava));
  t.ok("...and hands back a factory", /onGetViewFactory\(Intent intent\)[\s\S]*new Factory\(/.test(serviceJava));
  t.ok("the factory re-reads the snapshot when told the data changed",
    /onDataSetChanged\(\)\s*\{\s*items = MomentumWidget\.readItems\(context\)/.test(serviceJava));

  t.ok("the widget points the list at the service", /setRemoteAdapter\(R\.id\.widget_list,/.test(widgetJava)
    && /new Intent\(context, MomentumWidgetService\.class\)/.test(widgetJava));
  // Two widgets on one screen with the same adapter intent would each be given the other's list.
  t.ok("...with an intent that's unique per widget", /setData\(Uri\.parse\(list\.toUri\(Intent\.URI_INTENT_SCHEME\)\)\)/.test(widgetJava)
    && /EXTRA_APPWIDGET_ID/.test(widgetJava));
  t.ok("it tells the list to re-read after drawing", /notifyAppWidgetViewDataChanged\(widgetId,\s*R\.id\.widget_list\)/.test(widgetJava));
  t.ok("a tap on a row has a template to fill in", /setPendingIntentTemplate\(R\.id\.widget_list/.test(widgetJava)
    && /setOnClickFillInIntent\(R\.id\.task_text/.test(serviceJava));
  // A template that rows fill in has to be mutable from Android 12; immutable ones throw at
  // draw time, which on a phone looks like the widget refusing to load.
    const templateCall = widgetJava.slice(widgetJava.indexOf("setPendingIntentTemplate"), widgetJava.indexOf("setPendingIntentTemplate") + 220);
  t.ok("...which is mutable on the versions that ask",
    /int mutable = Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S \? PendingIntent\.FLAG_MUTABLE : 0/.test(widgetJava)
    && /FLAG_UPDATE_CURRENT \| mutable/.test(templateCall) && !/FLAG_IMMUTABLE/.test(templateCall), templateCall);
  t.ok("the old four fixed rows are gone", !/row_[0-3]/.test(layout) && !/row_[0-3]/.test(widgetJava));
}

t.group("keeping the counter moving");
{
  // Android won't update a widget more than every half hour by itself, so a counter reading
  // "3h 20m" would sit there stale. The widget schedules its own, gentler tick.
  t.ok("it handles its own tick", /TICK_ACTION\.equals\(intent\.getAction\(\)\)/.test(widgetJava));
  t.ok("...redrawing and scheduling the next", /refresh\(context\);\s*scheduleTick\(context\)/.test(widgetJava));
  t.ok("it starts when the first widget is added", /onEnabled\(Context context\)\s*\{\s*scheduleTick/.test(widgetJava));
  t.ok("...and stops when the last is removed, rather than ticking for nothing", /onDisabled[\s\S]*alarms\.cancel\(tickIntent/.test(widgetJava));
  t.ok("the tick isn't a waking alarm", /AlarmManager\.RTC,/.test(widgetJava) && !/RTC_WAKEUP/.test(widgetJava));
  const every = Number(widgetJava.match(/TICK_MS\s*=\s*(\d+) \* 60_000L/)?.[1]);
  t.ok("it ticks more often than Android's half hour, but not wastefully", every >= 5 && every < 30, every);
}

t.group("the counter is the biggest thing on the widget");
{
  const size = (re) => Number(re.exec(styles)?.[1]);
  const timeSize = size(/name="MomentumWidgetQuitTime"[\s\S]*?textSize">(\d+)sp/);
  const others = [...styles.matchAll(/textSize">(\d+(?:\.\d+)?)sp/g)].map((m) => Number(m[1]));
  const progress = Number(layout.match(/widget_progress"[\s\S]*?textSize="(\d+)sp"/)?.[1]);
  t.ok("the clean-time counter is larger than the day's progress figure", timeSize > progress, { timeSize, progress });
  t.ok("...and than anything else in the styles", others.every((o) => o <= timeSize), others);
  t.ok("...and big in absolute terms", timeSize >= 28, timeSize);
  t.ok("it's bold", /name="MomentumWidgetQuitTime"[\s\S]*?textStyle">bold/.test(styles));
}

t.group("the keys the Java reads are the keys the app writes");
{
  // Two languages, one JSON shape. A key misspelt on either side doesn't fail anywhere — the
  // widget just shows the default. So: every key the Java asks for must exist in a real snapshot.
  const at = new Date("2026-09-28T15:00:00").getTime();
  const daily = { freq: "daily", interval: 1 };
  const snap = widgetSnapshot({
    tasks: [
      { id: "b1", kind: "build", text: "Walk", recurrence: daily, startDate: "2026-09-01", createdAt: 1 },
      { id: "q1", kind: "break", text: "Doomscrolling", recurrence: daily, startDate: "2026-09-01", createdAt: 1, limit: 3 },
    ],
    dayLog: {},
    urgeLog: [newLapse({ taskId: "q1", at }), newUrge({ taskId: "q1", at })],
  }, "2026-09-28");
  const top = new Set(Object.keys(snap));
  const item = new Set(Object.keys(snap.items[0] || {}));
  const quit = new Set(Object.keys(snap.quitting[0] || {}));
  const risk = new Set(Object.keys(widgetSnapshot({
    tasks: [{ id: "q1", kind: "break", text: "x", recurrence: daily, startDate: "2026-09-01", createdAt: 1 }],
    dayLog: {}, urgeLog: [],
  }, "2026-09-28", { usualWindow: () => ({ startMin: 1200, endMin: 1320 }) }).quitting[0].risk || {}));

  const read = (java) => [...java.matchAll(/\b(\w+)\.opt(?:String|Int|Long|Boolean|JSONArray|JSONObject)\("(\w+)"/g)]
    .map((m) => ({ on: m[1], key: m[2] }));
  const reads = [...read(widgetJava), ...read(serviceJava)];
  t.ok("the Java reads something", reads.length > 8, reads.length);
  const topReads = reads.filter((r) => r.on === "snapshot").map((r) => r.key);
  const itemReads = reads.filter((r) => r.on === "item").map((r) => r.key);
  const quitReads = reads.filter((r) => r.on === "q").map((r) => r.key);
  const riskReads = reads.filter((r) => r.on === "r").map((r) => r.key);
  t.eq("top-level keys all exist", topReads.filter((k) => !top.has(k)), []);
  t.eq("task keys all exist", itemReads.filter((k) => !item.has(k)), []);
  t.eq("habit-being-broken keys all exist", quitReads.filter((k) => !quit.has(k)), []);
  t.eq("risk-window keys all exist", riskReads.filter((k) => !risk.has(k)), []);
  t.ok("...and both were actually read", riskReads.includes("startMin") && riskReads.includes("endMin"), riskReads);
  t.ok("...and each group was actually checked", topReads.length && itemReads.length && quitReads.length,
    { topReads, itemReads, quitReads });
}

t.group("builds that can update one another");
{
  // Android won't install an app over one signed with a different key. Every CI run starts on a
  // fresh machine, which used to mean a fresh debug key per build — so no build could update the
  // last, and the only way to install was to uninstall and lose the app's data.
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  const apkJob = workflow.slice(workflow.indexOf("  apk:"), workflow.indexOf("  starts-on-android:"));
  t.ok("the debug key is remembered between runs", /actions\/cache@v4[\s\S]*?path: \$\{\{ env\.ANDROID_USER_HOME \}\}\/debug\.keystore/.test(apkJob));
  // Cached from one folder, written to another: that is how the first attempt saved nothing.
  t.ok("...from the folder the build is told to keep it in", /ANDROID_USER_HOME: \/home\/runner\/\S+/.test(apkJob.slice(0, apkJob.indexOf("steps:"))));
  t.ok("...restored before the APK is built, or it would be made too late",
    apkJob.indexOf("debug.keystore") < apkJob.indexOf("assembleDebug"));
  t.ok("the build says which key signed it, so stability can be checked from the log", /apksigner[\s\S]*print-certs/.test(apkJob));
  // The repository is public: a key committed to it would let anyone sign an "update".
  const tracked = readdirSync(join(ROOT, "android", "app"), { withFileTypes: true }).map((e) => e.name);
  t.ok("no signing key is committed to the repository", !tracked.some((n) => /\.(keystore|jks|p12|pfx)$/i.test(n)), tracked);
}

t.group("getting a backup out of the app");
{
  // The first backup button made a link and clicked it. A web view has no download handler, so
  // nothing was written anywhere — while the screen said "Saved to your downloads". Every link in
  // the chain from button to Downloads folder is a place that can quietly do nothing.
  const filesJava = read("java/com/momentum/app/MomentumFilesPlugin.java");
  const filesJs = readFileSync(join(ROOT, "src", "lib", "files.js"), "utf8");
  const main = read("java/com/momentum/app/MainActivity.java");

  t.ok("the plugin is registered before the bridge is built",
    main.indexOf("registerPlugin(MomentumFilesPlugin.class)") > -1
    && main.indexOf("registerPlugin(MomentumFilesPlugin.class)") < main.indexOf("super.onCreate"));
  const nativeName = filesJava.match(/@CapacitorPlugin\(name = "(\w+)"\)/)?.[1];
  t.ok("the app calls it by the name it registers under", nativeName && filesJs.includes(`Capacitor?.Plugins?.${nativeName}`), nativeName);

  // Two languages, one set of names: a misspelt method or argument doesn't fail anywhere, the
  // call just comes back empty.
  const methods = [...filesJava.matchAll(/@PluginMethod\s+public void (\w+)\(/g)].map((m) => m[1]);
  t.eq("it offers save and share", methods.sort(), ["save", "share"]);
  t.ok("the app calls both", /p\.save\(/.test(filesJs) && /p\.share\(/.test(filesJs));
  const sent = [...filesJs.matchAll(/p\.(?:save|share)\(\{ ([^}]+) \}\)/g)].flatMap((m) => m[1].split(",").map((k) => k.trim()));
  const read_ = [...filesJava.matchAll(/call\.getString\("(\w+)"/g)].map((m) => m[1]);
  t.eq("everything the app sends, the plugin reads", [...new Set(sent)].filter((k) => !read_.includes(k)), []);
  const answers = [...filesJava.matchAll(/result\.put\("(\w+)"/g)].map((m) => m[1]);
  t.ok("...and the app reads back what the plugin answers", answers.every((k) => filesJs.includes(`r?.${k}`) || filesJs.includes(`r.${k}`)), answers);

  t.ok("it saves through MediaStore.Downloads, which needs no permission", /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/.test(filesJava));
  t.ok("...into the Downloads folder", /RELATIVE_PATH, Environment\.DIRECTORY_DOWNLOADS/.test(filesJava));
  t.ok("...hidden until complete, so nothing sees half a file", /IS_PENDING, 1/.test(filesJava) && /IS_PENDING, 0/.test(filesJava));
  t.ok("it cleans up after a failed write", /resolver\.delete\(uri/.test(filesJava));
  t.ok("a name can't climb out of its folder", /safeName/.test(filesJava) && /replaceAll\(/.test(filesJava));
  t.ok("it needs no storage permission it doesn't ask for", !/WRITE_EXTERNAL_STORAGE/.test(manifest));

  // Share goes through a FileProvider; its authority and paths are only checked when someone taps.
  t.ok("share uses the provider the manifest declares", filesJava.includes('getPackageName() + ".fileprovider"') && /\$\{applicationId\}\.fileprovider/.test(manifest));
  const paths = read("res/xml/file_paths.xml");
  t.ok("...which covers the cache folder the file is staged in", /<cache-path[^>]*path="\."/.test(paths) && /getCacheDir\(\), "shared"/.test(filesJava));

  const workflow = readFileSync(join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  t.ok("the file test exists and is run with the widget test",
    existsSync(join(ROOT, "android/app/src/androidTest/java/com/momentum/app/FilesTest.java")) && /:app:connectedDebugAndroidTest/.test(workflow));

  // Nothing in the app may rely on a browser download any more: it silently does nothing here.
  const srcFiles = ["lib/backup.js", "lib/journal.js", "lib/money.js", "views/SettingsView.jsx", "views/JournalView.jsx", "views/MoneyView.jsx"];
  const offenders = srcFiles.filter((f) => /createObjectURL|\.download\s*=/.test(readFileSync(join(ROOT, "src", f), "utf8")));
  t.eq("only files.js makes download links", offenders, []);
}

t.group("the risk line on the widget");
{
  t.ok("it has a line of its own under each habit", /quit_0_risk/.test(layout) && /quit_1_risk/.test(layout));
  t.ok("hidden until there's something to say", /name="MomentumWidgetQuitRisk"[\s\S]*?visibility">gone/.test(styles));
  t.ok("the Java hides it again when the window is unknown", /risk\.isEmpty\(\) \? View\.GONE : View\.VISIBLE/.test(widgetJava));
  t.ok("it works out where now falls itself, so it stays right without the app", /Calendar\.HOUR_OF_DAY/.test(widgetJava) && /riskLine\(q, now\)/.test(widgetJava));
  t.ok("and handles a window that crosses midnight", /end <= start/.test(widgetJava));
}

t.group("room for the task list");
{
  // Two habits being broken, each with a counter, a detail line and a risk line, take about 150dp.
  // At 4x3 that left the list almost nothing and, on the emulator, no rows at all — which no amount
  // of reading the XML would have said. The default has to leave the list a usable height.
  const info = read("res/xml/momentum_widget_info.xml");
  const cells = Number(info.match(/targetCellHeight="(\d+)"/)?.[1]);
  const minH = Number(info.match(/minHeight="(\d+)dp"/)?.[1]);
  t.ok("the default is four cells tall", cells >= 4, cells);
  t.ok("...with a minimum height to match", minH >= 250, minH);
  t.ok("and the emulator test lays the widget out at that size", /px\(320\)/.test(readFileSync(join(ROOT, "android/app/src/androidTest/java/com/momentum/app/WidgetTest.java"), "utf8")));
}

t.group("the notification-shade counter");
{
  const shade = read("java/com/momentum/app/MomentumShade.java");
  const plugin = read("java/com/momentum/app/MomentumShadePlugin.java");
  const activity = read("java/com/momentum/app/MainActivity.java");
  // The Java and the web app can only meet at strings. Nothing but a phone would notice if they drifted.
  t.ok("the Java reads the key the app writes", shade.includes(`"${SHADE_KEY}"`), SHADE_KEY);
  t.ok("the activity leaves a slip under the key the app reads", activity.includes(`"${PENDING_LAPSE_KEY}"`), PENDING_LAPSE_KEY);
  t.ok("...which is not the key an urge uses", PENDING_LAPSE_KEY !== PENDING_URGE_KEY);
  t.ok("the slip button's host is the one the activity listens for", /SLIP_HOST\s*=\s*"slip"/.test(shade) && activity.includes("MomentumShade.SLIP_HOST"));
  t.ok("and the plugin the app calls is registered under the name it uses", /name\s*=\s*"MomentumShade"/.test(plugin) && activity.includes("registerPlugin(MomentumShadePlugin.class)"));
  // Every field the Java reads is one the snapshot carries.
  const reads = [...shade.matchAll(/s\.opt(?:String|Long|Boolean|JSONObject|Int)\("(\w+)"/g)].map((m) => m[1]);
  const sent = Object.keys(shadeSnapshot({
    tasks: [{ id: "q", kind: "break", text: "x", shadePin: 1, createdAt: 1 }], urgeLog: [], settings: {},
  }, 5, { usualWindow: () => ({ startMin: 1, endMin: 2 }) }));
  const missing = [...new Set(reads)].filter((k) => !sent.includes(k));
  t.eq("everything the Java reads, the snapshot sends", missing, []);

  t.ok("the receiver is registered and not exported", /<receiver\s+android:name="\.MomentumShade"\s+android:exported="false"/.test(manifest));
  t.ok("it comes back after a restart and after an update", manifest.includes("android.intent.action.BOOT_COMPLETED") && manifest.includes("android.intent.action.MY_PACKAGE_REPLACED"));
  t.ok("it declares the notification permission itself", manifest.includes("android.permission.POST_NOTIFICATIONS"));
  t.ok("the channel is low importance, which is what keeps it silent", /IMPORTANCE_LOW/.test(shade) && !/IMPORTANCE_(DEFAULT|HIGH)/.test(shade));
  t.ok("it is ongoing and silent", /setOngoing\(true\)/.test(shade) && /setSilent\(true\)/.test(shade));
  t.ok("the lock screen shows a public version with no habit on it", /VISIBILITY_PRIVATE/.test(shade) && /setPublicVersion/.test(shade));
  t.ok("the small icon exists", exists("res/drawable/ic_shade.xml") && shade.includes("R.drawable.ic_shade"));
  const used = [...shade.matchAll(/R\.string\.(\w+)/g)].map((m) => m[1]);
  t.eq("every string it uses is defined", [...new Set(used)].filter((n) => !strings.includes(`name="${n}"`)), []);
  t.ok("a request code of its own for each button, so one can't stand in for another", /200\)/.test(shade) && /201\)/.test(shade));
  t.ok("the widget's risk maths is shared, not copied", /MomentumWidget\.riskUntil/.test(shade) && /MomentumWidget\.riskLine/.test(shade));
}

t.group("the breathing pacer's vibration");
{
  const plugin = read("java/com/momentum/app/MomentumHapticsPlugin.java");
  const activity = read("java/com/momentum/app/MainActivity.java");
  const hapticsJs = readFileSync(join(ROOT, "src", "lib", "haptics.js"), "utf8");
  t.ok("the plugin is registered under the name the app calls", /name\s*=\s*"MomentumHaptics"/.test(plugin) && hapticsJs.includes("Plugins?.MomentumHaptics") && activity.includes("registerPlugin(MomentumHapticsPlugin.class)"));
  // Every method the app calls on it exists on the Java side, and nothing is called that isn't there.
  const called = [...hapticsJs.matchAll(/(?:plugin\(\)|\bp)\??\.(\w+)\(/g)].map((m) => m[1]).filter((n) => ["play", "cancel", "capabilities"].includes(n));
  const defined = [...plugin.matchAll(/@PluginMethod\s+public void (\w+)\(/g)].map((m) => m[1]);
  t.eq("the methods the app calls", [...new Set(called)].sort(), ["cancel", "capabilities", "play"]);
  t.eq("are the ones the plugin has", defined.sort(), ["cancel", "capabilities", "play"]);
  t.ok("the argument names match", /call\.getArray\("timings"\)/.test(plugin) && /call\.getArray\("amplitudes"\)/.test(plugin) && /timings:\s*wave\.timings/.test(hapticsJs) && /amplitudes:\s*wave\.amplitudes/.test(hapticsJs));
  t.ok("the answer fields match what the app reads", /out\.put\("motor"/.test(plugin) && /out\.put\("amplitude"/.test(plugin) && /c\.motor/.test(hapticsJs) && /c\.amplitude/.test(hapticsJs));
  t.ok("the manifest asks for the vibrate permission", manifest.includes('android.permission.VIBRATE'));
  const limits = { steps: Number(plugin.match(/MAX_STEPS\s*=\s*(\d+)/)?.[1]), ms: Number(plugin.match(/MAX_TOTAL_MS\s*=\s*([\d_]+)L/)?.[1].replace(/_/g, "")) };
  t.ok("the plugin has limits on a waveform", limits.steps > 0 && limits.ms > 0, limits);
  t.ok("and every breath the app can send fits inside them", PATTERNS.every((p) => {
    const w = hapticCycle(p);
    return w.timings.length <= limits.steps && w.timings.reduce((a, b) => a + b, 0) <= limits.ms;
  }), limits);
}

t.group("notes to yourself");
{
  const pep = read("java/com/momentum/app/MomentumPep.java");
  const plugin = read("java/com/momentum/app/MomentumPepPlugin.java");
  const activity = read("java/com/momentum/app/MainActivity.java");
  t.ok("the Java reads the plan the app writes", pep.includes(`"${PEP_KEY}"`), PEP_KEY);
  t.ok("and leaves typed notes where the app looks", pep.includes(`"${PENDING_PEP_KEY}"`), PENDING_PEP_KEY);
  t.ok("the plugin the app calls is registered", /name\s*=\s*"MomentumPep"/.test(plugin) && activity.includes("registerPlugin(MomentumPepPlugin.class)"));
  const sampleState = {
    tasks: [{ id: "q", kind: "break", text: "x", startDate: "2026-01-01", createdAt: 1, recurrence: { freq: "daily", interval: 1, weekdays: [], monthDay: null } }],
    urgeLog: [], dayLog: {}, pepNotes: [{ id: "n", taskId: "q", text: "t", at: 1, day: 3, date: "2026-10-01" }], settings: {},
  };
  const plan = pepPlan(sampleState, new Date("2026-10-06T08:00:00").getTime());
  const sentKeys = new Set(plan.flatMap((p) => Object.keys(p)));
  const itemKeys = [...pep.matchAll(/item\.opt(?:String|Long)\("(\w+)"/g)].map((m) => m[1]);
  t.ok("the plan has both kinds to test against", plan.some((p) => p.kind === "write") && plan.some((p) => p.kind === "remind"));
  t.eq("everything the Java reads from an item, the plan sends", [...new Set(itemKeys)].filter((k) => !sentKeys.has(k)), []);
  t.ok("the kinds the Java knows are the kinds the plan makes", /"write"\.equals\(kind\)/.test(pep) && /"remind"\.equals\(kind\)/.test(pep) && new Set(plan.map((p) => p.kind)).size === 2);
  t.ok("the receiver is registered, not exported, and comes back after a restart",
    /<receiver\s+android:name="\.MomentumPep"\s+android:exported="false">[\s\S]*?BOOT_COMPLETED[\s\S]*?MY_PACKAGE_REPLACED/.test(manifest));
  t.ok("the reply box has a mutable PendingIntent, which a reply needs on Android 12 and up", /FLAG_MUTABLE/.test(pep) && /addRemoteInput/.test(pep));
  t.ok("the reply is answered by replacing the notification, or the box spins", /handleReply/.test(pep) && /pep_saved_title/.test(pep));
  const used = [...pep.matchAll(/R\.string\.(\w+)/g)].map((m) => m[1]);
  t.eq("every string it uses is defined", [...new Set(used)].filter((n) => !strings.includes(`name="${n}"`)), []);
  t.ok("alarms are inexact and allowed while idle, not exact", /setAndAllowWhileIdle/.test(pep) && !/setExact/.test(pep));
  t.ok("a late alarm is dropped rather than shown stale", /STALE_MS/.test(pep));
}

t.group("your notes on the widget");
{
  const layoutXml = read("res/layout/momentum_widget.xml");
  const widgetJ = read("java/com/momentum/app/MomentumWidget.java");
  t.ok("the flipper is a ViewFlipper, which RemoteViews allows, and fades between notes", /<ViewFlipper[\s\S]*?android:id="@\+id\/pep_flipper"/.test(layoutXml) && /android:inAnimation="@android:anim\/fade_in"/.test(layoutXml) && /android:outAnimation="@android:anim\/fade_out"/.test(layoutXml));
  t.ok("it turns by itself, slowly", /android:autoStart="true"/.test(layoutXml) && Number(layoutXml.match(/android:flipInterval="(\d+)"/)?.[1]) >= 6000);
  t.ok("it starts out of the way", /pep_flipper[\s\S]*?android:visibility="gone"/.test(layoutXml));
  t.ok("each turn is its own layout, filled from the snapshot", /R\.layout\.widget_pep_line/.test(widgetJ) && /addView\(R\.id\.pep_flipper/.test(widgetJ));
  const sent = widgetSnapshot({ tasks: [], pepNotes: [] }, "2026-10-04");
  t.ok("the key the Java reads is the one the snapshot carries", /optJSONArray\("pep"\)/.test(widgetJ) && Array.isArray(sent.pep));
}

t.group("red zones on the widget and the shade");
{
  const widgetJ = read("java/com/momentum/app/MomentumWidget.java");
  const shadeJ = read("java/com/momentum/app/MomentumShade.java");
  const sample = widgetZones({ redZones: [zoneFromPreset("late"), zoneFromPreset("weekend")] });
  const keys = new Set(sample.flatMap((z) => Object.keys(z)));
  const javaReads = [...widgetJ.matchAll(/z\.opt(?:Int|JSONArray)\("(\w+)"/g)].map((m) => m[1]);
  t.ok("the Java reads a zone's days, start and end", ["days", "startMin", "endMin"].every((k) => javaReads.includes(k)), javaReads);
  t.eq("and the app sends exactly those", [...keys].sort(), ["days", "endMin", "startMin"]);
  t.ok("the habit's zones travel under the name the Java reads", /optJSONArray\("zones"\)/.test(widgetJ));
  t.ok("days are numbered 0 = Sunday on both sides", sample[0].days.join() === "0,1,2,3,4,5,6" && sample[1].days.join() === "0,6" && /DAY_OF_WEEK\) - 1/.test(widgetJ));
  t.ok("the shade uses the same maths as the widget, not its own", /MomentumWidget\.riskOf/.test(shadeJ) && /MomentumWidget\.riskUntil/.test(shadeJ));
  t.ok("a zone is told apart from a learned window in the words", /RED ZONE/.test(widgetJ) && /Red zone/.test(widgetJ) && /Your red zone is/.test(shadeJ));
}

t.group("over-the-air updates");
{
  const ota = read("java/com/momentum/app/MomentumOta.java");
  const plugin = read("java/com/momentum/app/MomentumOtaPlugin.java");
  const activity = read("java/com/momentum/app/MainActivity.java");
  const native = Number(ota.match(/static final int NATIVE_API\s*=\s*(\d+)/)?.[1]);
  const MAX_FILES_JS = otaMaxFiles;
  t.ok("the shell offers at least the native API this web build needs", native >= REQUIRES_NATIVE_API, [native, REQUIRES_NATIVE_API]);
  t.ok("the plugin the app calls is registered", /name\s*=\s*"MomentumOta"/.test(plugin) && activity.includes("registerPlugin(MomentumOtaPlugin.class)"));
  t.ok("the choice of build is made before the web view exists", activity.indexOf("MomentumOta.resolveAtStartup") > activity.indexOf("registerPlugin(MomentumOtaPlugin.class)") && activity.indexOf("MomentumOta.resolveAtStartup") < activity.indexOf("super.onCreate"));
  t.ok("the limits on both sides are the same", Number(ota.match(/MAX_FILES\s*=\s*(\d+)/)?.[1]) === MAX_FILES_JS && Number(ota.match(/MAX_TOTAL_BYTES\s*=\s*(\d+)L/)?.[1]) * 1024 * 1024 === otaMaxBytes);
  t.ok("it uses the keys Capacitor itself reads to pick its web folder", /"CapWebViewSettings"/.test(ota) && /"serverBasePath"/.test(ota));
  t.ok("the path rule is the same as the publisher's", ota.includes("^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$") && SAFE_PATH.source === "^[A-Za-z0-9._-]+(\\/[A-Za-z0-9._-]+)*$");
  t.ok("the text that is signed is the same on both sides", ota.includes('"momentum-ota-v1\\n"') && signingPayload({ id: "i", build: "b", requiresNativeApi: 1, files: [] }).startsWith("momentum-ota-v1\n"));
  t.ok("it works on the oldest Android this app supports: no java.util.Base64, which needs API 26", !/java\.util\.Base64/.test(ota) && /android\.util\.Base64/.test(ota));
  t.ok("it never follows a redirect and refuses plain http", /setInstanceFollowRedirects\(false\)/.test(ota) && /startsWith\("https:\/\/"\)/.test(ota));
  const calls = [...plugin.matchAll(/@PluginMethod\s+public void (\w+)\(/g)].map((m) => m[1]).sort();
  const otaJs = readFileSync(join(ROOT, "src", "lib", "ota.js"), "utf8");
  t.eq("the methods the plugin has", calls, ["apply", "confirm", "info", "install"]);
  t.ok("and the app calls only those", [...otaJs.matchAll(/plugin\(\)\??\.(\w+)\(/g)].every((m) => calls.includes(m[1])));
  t.ok("the test vector exists, for the signature to be checked against what Node makes", existsSync(join(ROOT, "android", "app", "src", "androidTest", "assets", "ota-vector.json")));
  const vec = JSON.parse(readFileSync(join(ROOT, "android", "app", "src", "androidTest", "assets", "ota-vector.json"), "utf8"));
  t.ok("and it is a valid signature as Node sees it, so a stale one would be caught here first", verifyManifest(vec.manifest, vec.publicKey));
}

t.group("publishing updates from CI");
{
  const wf = readFileSync(join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  const publish = wf.slice(wf.indexOf("  publish-ota:"), wf.indexOf("  starts-on-android:"));
  t.ok("there is a publish job", publish.length > 200);
  t.ok("it waits for the build, the emulator start and the tests", /needs:\s*\[apk, starts-on-android, widget-on-android\]/.test(publish));
  t.ok("it only runs for pushes to the release branch", /github\.event_name == 'push'/.test(publish) && /github\.ref_name == 'main'/.test(publish) && /vars\.OTA_BRANCH/.test(publish));
  t.ok("it does nothing, and says so, without the secrets", /aren't set as repository secrets/.test(publish) && /steps\.gate\.outputs\.go == 'yes'/.test(publish));
  t.ok("the keys come from secrets only", /secrets\.SUPABASE_SERVICE_KEY/.test(publish) && /secrets\.OTA_SIGNING_KEY/.test(publish));
  t.ok("a commit message never reaches the shell as text to be run", !/\$\{\{\s*github\.event\.head_commit\.message\s*\}\}.*\n.*run:/.test(publish) && /COMMIT_MESSAGE: \$\{\{ github\.event\.head_commit\.message \}\}/.test(publish) && /--notes "\$COMMIT_MESSAGE"/.test(publish));
  t.ok("nothing echoes a key", !/echo[^\n]*\$(SUPABASE_SERVICE_KEY|OTA_SIGNING_KEY)/.test(publish));
  t.ok("it publishes through the script that writes the manifest last", /deploy-supabase\.mjs --ota/.test(publish));
  t.ok("the version code counts up with every build", /GITHUB_RUN_NUMBER/.test(readFileSync(join(ROOT, "android", "app", "build.gradle"), "utf8")));
  t.ok("a change to the publishing scripts triggers the workflow", /"scripts\/\*\*"/.test(wf));
  t.ok("the emulator smoke test exercises over-the-air updates end to end", /Over the air: a build that never starts is dropped/.test(readFileSync(join(ROOT, ".github", "scripts", "android-smoke.sh"), "utf8")));
  t.ok("the build writes the build.json the native side compares against", /fileName: "build\.json"/.test(readFileSync(join(ROOT, "vite.config.js"), "utf8")));
}

t.group("no service worker inside the Android app");
{
  const vite = readFileSync(join(ROOT, "vite.config.js"), "utf8");
  const ota = read("java/com/momentum/app/MomentumOta.java");
  const activity = read("java/com/momentum/app/MainActivity.java");
  const main = readFileSync(join(ROOT, "src", "main.jsx"), "utf8");
  t.ok("the build no longer injects its own registration, which would run in the app too", /injectRegister:\s*false/.test(vite));
  t.ok("the app registers (or removes) it itself, at start", /setupServiceWorker\(\)/.test(main));
  t.ok("an old worker's files are cleared once, before the web view exists", /clearServiceWorkerOnce/.test(ota) && activity.indexOf("clearServiceWorkerOnce") > 0 && activity.indexOf("clearServiceWorkerOnce") < activity.indexOf("super.onCreate"));
  t.ok("it deletes the worker's folder inside the web view's data", /app_webview\/Default\/Service Worker/.test(ota));
}

t.group("money capture");
{
  const money = read("java/com/momentum/app/MomentumMoney.java");
  const parse = read("java/com/momentum/app/MoneyParse.java");
  const sms = read("java/com/momentum/app/MoneySmsReceiver.java");
  const listener = read("java/com/momentum/app/MoneyListenerService.java");
  const plugin = read("java/com/momentum/app/MomentumMoneyPlugin.java");
  const activity = read("java/com/momentum/app/MainActivity.java");
  const gradle = readFileSync(join(ROOT, "android", "app", "build.gradle"), "utf8");
  t.ok("the Java reads the settings and payees where the app writes them", money.includes(`"${CAPTURE_KEY}"`), CAPTURE_KEY);
  t.ok("leaves payments where the app collects them", money.includes(`"${PENDING_TX_KEY}"`) && money.includes(`"${UNDO_TX_KEY}"`));
  t.ok("and the payment to adjust where the app looks for it", money.includes(`"${PENDING_DRAFT_KEY}"`));
  t.ok("the plugin the app calls is registered", /name\s*=\s*"MomentumMoney"/.test(plugin) && activity.includes("registerPlugin(MomentumMoneyPlugin.class)"));
  const calls = ["refresh", "status", "requestSms", "openAccess", "candidates"];
  t.eq("every call the web app makes exists", calls.filter((c) => !new RegExp(`public void ${c}\\(PluginCall`).test(plugin)), []);
  t.ok("the settings screen only uses calls the plugin has", ["status", "candidates", "requestSms", "openAccess", "refresh"].every((c) => calls.includes(c)));
  t.ok("the Change button's link is handled when the app is opened from it", /DRAFT_HOST/.test(activity) && /stashDraft/.test(activity));
  t.ok("the box takes a reply, which needs a mutable PendingIntent on Android 12 and up", /FLAG_MUTABLE/.test(money) && /addRemoteInput/.test(money));
  t.ok("and answers it, or the box spins", /handleReply/.test(money) && /money_logged_title/.test(money));
  t.ok("the Save button keeps the payment and says so", /handleSave/.test(money) && /money_saved_title/.test(money));
  t.ok("Undo works whether or not the app has collected the payment", /UNDO_KEY/.test(money) && /found/.test(money));
  const used = [...[money, sms, listener, plugin].flatMap((src) => [...src.matchAll(/R\.string\.(\w+)/g)].map((m) => m[1]))];
  t.eq("every string it uses is defined", [...new Set(used)].filter((n) => !strings.includes(`name="${n}"`)), []);
  t.ok("the receiver for the box is not exported, and comes back after a restart",
    /<receiver\s+android:name="\.MomentumMoney"\s+android:exported="false">[\s\S]*?BOOT_COMPLETED[\s\S]*?MY_PACKAGE_REPLACED/.test(manifest));
  t.ok("the text receiver is exported only because the system sends to it, and requires the system's own permission",
    /<receiver\s+android:name="\.MoneySmsReceiver"\s+android:permission="android\.permission\.BROADCAST_SMS"\s+android:exported="true">[\s\S]*?SMS_RECEIVED/.test(manifest));
  t.ok("the listener can only be bound by the system", /<service\s+android:name="\.MoneyListenerService"[\s\S]*?android:permission="android\.permission\.BIND_NOTIFICATION_LISTENER_SERVICE"/.test(manifest));
  t.ok("receiving texts is declared, and is the only text permission asked for", /RECEIVE_SMS/.test(manifest) && !/READ_SMS|SEND_SMS|READ_CONTACTS|ACCESS_FINE_LOCATION/.test(manifest));
  t.ok("and asked for at runtime, by the plugin", /alias\s*=\s*"sms"/.test(plugin) && /requestPermissionForAlias/.test(plugin));
  t.ok("our own notifications are never read back as payments", /getPackageName\(\)\.equals\(sbn\.getPackageName\(\)\)/.test(listener));
  t.ok("only the senders the person listed are read", /senderAllowed/.test(sms));
  t.ok("nothing is read unless reading has been switched on", /if \(!c\.read\)/.test(sms) && /if \(!c\.read\)/.test(listener) && /if \(!c\.read\) return "off"/.test(money));
  t.ok("the message text is never written down", !/putString\([^)]*text/i.test(money + sms + listener));
  t.ok("the shared patterns are packaged into the app, and the tests' cases into the tests",
    /copyTxPatterns/.test(gradle) && /txpatterns\.json/.test(gradle) && /tests\/fixtures/.test(gradle));
  t.ok("the Java reads the one asset the build copies", parse.includes('"txpatterns.json"'));
  // The parts of the shared data the Java reads by name must exist in it.
  const names = [...parse.matchAll(/(?:typed|msg)\("(\w+)"\)/g)].map((m) => m[1]);
  t.eq("every pattern the Java asks for exists", [...new Set(names)].filter((n) => !(n in P.typed) && !(n in P.message)), []);
  t.ok("so does every group of data", ["currency", "currencyCodes", "filler", "acronyms", "keywords", "incomeKeywords", "clean"].every((k) => k in P));
  const cleanNames = [...parse.matchAll(/data\.clean\.optString\("(\w+)"\)/g)].map((m) => m[1]);
  t.eq("and every cleaning pattern", [...new Set(cleanNames)].filter((n) => !(n in P.clean)), []);
}
