package com.momentum.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

/**
 * What the web app asks of the phone about money: put the typing box in the shade (or take it away), say what is allowed, ask for the
 * permission to read texts, open the screen where notification access is granted, and list the apps that have sent a payment. The app calls
 * these through optional chaining, so a build without them still works.
 */
@CapacitorPlugin(
        name = "MomentumMoney",
        permissions = { @Permission(strings = { Manifest.permission.RECEIVE_SMS }, alias = "sms") })
public class MomentumMoneyPlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        MomentumMoney.refresh(getContext());
        call.resolve();
    }

    private JSObject statusObject() {
        JSObject o = new JSObject();
        o.put("sms", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED);
        o.put("listener", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        return o;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestSms(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED) {
            call.resolve(statusObject());
            return;
        }
        requestPermissionForAlias("sms", call, "smsResult");
    }

    @PermissionCallback
    private void smsResult(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void openAccess(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void candidates(PluginCall call) {
        JSObject o = new JSObject();
        try {
            JSONArray apps = MomentumMoney.candidates(getContext());
            o.put("apps", apps);
        } catch (Exception e) {
            o.put("apps", new JSONArray());
        }
        call.resolve(o);
    }
}
