import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suite } from "./harness.mjs";
import { PENDING_URGE_KEY, WIDGET_KEY, widgetSnapshot } from "../src/lib/widget.js";
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
  const layoutIds = new Set([...idsIn(layout), ...idsIn(rowLayout)]);
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
  const tags = [...layout.matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s>/]/g), ...rowLayout.matchAll(/<([A-Za-z][A-Za-z0-9.]*)[\s>/]/g)].map((m) => m[1]).filter((tag) => tag !== "?xml");
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
  t.ok("and the emulator test lays the widget out at that size", /px\(300\)/.test(readFileSync(join(ROOT, "android/app/src/androidTest/java/com/momentum/app/WidgetTest.java"), "utf8")));
}
