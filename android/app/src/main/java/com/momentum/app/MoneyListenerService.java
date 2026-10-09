package com.momentum.app;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Payments announced by an app's notification (a bank's app, a wallet) rather than by text. Reads each notification posted while it is allowed to,
 * keeps only a count of which apps send something that looks like a payment (so Settings can offer them), and acts only on the apps the
 * person has chosen. Our own notifications are never read: they contain amounts and would otherwise be read back as payments.
 *
 * The person grants this under "Notification access" in the phone's settings; it is the only way Android lets an app see other apps' notifications.
 */
public class MoneyListenerService extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        if (getPackageName().equals(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        String text = textOf(n);
        if (text.isEmpty()) return;
        consider(this, sbn.getPackageName(), label(n, sbn.getPackageName()), text, System.currentTimeMillis());
    }

    /** What a notification says: its title and its body, however it is laid out. */
    static String textOf(Notification n) {
        Bundle x = n.extras;
        if (x == null) return "";
        StringBuilder sb = new StringBuilder();
        for (String k : new String[] { Notification.EXTRA_TITLE, Notification.EXTRA_TEXT, Notification.EXTRA_BIG_TEXT, Notification.EXTRA_SUB_TEXT }) {
            CharSequence c = x.getCharSequence(k);
            if (c != null && c.length() > 0) {
                if (sb.length() > 0) sb.append(' ');
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /** The app's name as the person knows it, from the notification itself; the package name if it won't say. */
    private String label(Notification n, String pkg) {
        try {
            ApplicationInfo info = n.extras == null ? null : n.extras.getParcelable("android.appInfo");
            if (info != null) {
                CharSequence name = info.loadLabel(getPackageManager());
                if (name != null && name.length() > 0) return name.toString();
            }
        } catch (Exception ignored) { }
        return pkg;
    }

    /**
     * The part that doesn't need the system. Counts the app if its notification looks like a payment, and acts on it if the app is one
     * the person chose. Returns true if a payment was offered or saved.
     */
    static boolean consider(android.content.Context context, String pkg, String label, String text, long now) {
        MomentumMoney.Config c = MomentumMoney.config(context);
        if (!c.read) return false;
        MoneyParse.load(context);
        MoneyParse.Payment p = MoneyParse.parseMessage(text, now, c.learned);
        if (p == null) return false;
        MomentumMoney.noteCandidate(context, pkg, label);
        if (!c.packages.contains(pkg)) return false;
        String result = MomentumMoney.handlePayment(context, p, now);
        return "offered".equals(result) || "saved".equals(result);
    }
}
