package com.momentum.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Text messages from a bank or mobile-money service, read as they arrive. Only the senders the person has listed, only when reading is
 * switched on, and only what reads clearly as a payment: a one-time code, an advert or a chat is passed over without a trace. The text
 * itself is never stored; what is kept is the payment, once it is saved.
 *
 * Needs the permission to receive texts, which the person grants in Settings, and works without the app running.
 */
public class MoneySmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;
        // A long text arrives in pieces from one sender; put them back together before reading.
        Map<String, StringBuilder> bySender = new LinkedHashMap<>();
        for (SmsMessage m : parts) {
            if (m == null || m.getOriginatingAddress() == null) continue;
            StringBuilder sb = bySender.get(m.getOriginatingAddress());
            if (sb == null) { sb = new StringBuilder(); bySender.put(m.getOriginatingAddress(), sb); }
            if (m.getMessageBody() != null) sb.append(m.getMessageBody());
        }
        read(context, bySender, System.currentTimeMillis());
    }

    /** The part that doesn't need the system: which senders and texts become payments. Separate so a test can drive it. */
    static int read(Context context, Map<String, StringBuilder> bySender, long now) {
        MomentumMoney.Config c = MomentumMoney.config(context);
        if (!c.read) return 0;
        MoneyParse.load(context);
        int handled = 0;
        for (Map.Entry<String, StringBuilder> e : bySender.entrySet()) {
            if (!MomentumMoney.senderAllowed(e.getKey(), c.senders)) continue;
            MoneyParse.Payment p = MoneyParse.parseMessage(e.getValue().toString(), now, c.learned);
            if (p == null) continue;
            String result = MomentumMoney.handlePayment(context, p, now);
            if ("offered".equals(result) || "saved".equals(result)) handled++;
        }
        return handled;
    }
}
