package ai.moeru.airi_pocket

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * The bridge between the app and [AiriAccessibilityService]. The web side checks the permission of the user in the
 * AIRI settings. This plugin does nothing while the user has the service off in the system settings.
 */
@CapacitorPlugin(name = "DeviceControl")
class DeviceControlPlugin : Plugin() {
    /** Tells if the service is turned on in the system settings, and if it runs now. */
    @PluginMethod
    fun status(call: PluginCall) {
        val result = JSObject().apply {
            put("enabledInSystem", isEnabledInSystem())
            put("running", AiriAccessibilityService.instance != null)
        }
        call.resolve(result)
    }

    /** Opens the accessibility page of the system settings, where the user turns the service on. */
    @PluginMethod
    fun openAccessibilitySettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
            call.resolve()
        } catch (error: RuntimeException) {
            call.reject("The system has no accessibility settings page.", "SETTINGS_UNAVAILABLE", error)
        }
    }

    /** Reads the screen in front. */
    @PluginMethod
    fun snapshot(call: PluginCall) {
        val service = AiriAccessibilityService.instance
        if (service == null) {
            call.reject("The AIRI accessibility service is off. Turn it on in the system settings.", "SERVICE_OFF")
            return
        }
        try {
            call.resolve(JSObject(service.snapshot().toString()))
        } catch (error: Exception) {
            call.reject(error.message ?: "The screen could not be read.", "SNAPSHOT_FAILED", error)
        }
    }

    /** Does one action. The answer is `{ok}` or `{ok: false, error}`. */
    @PluginMethod
    fun act(call: PluginCall) {
        val service = AiriAccessibilityService.instance
        if (service == null) {
            call.reject("The AIRI accessibility service is off. Turn it on in the system settings.", "SERVICE_OFF")
            return
        }
        val action = JSONObject(call.data.toString())
        service.perform(action) { result -> call.resolve(JSObject(result.toString())) }
    }

    private fun isEnabledInSystem(): Boolean {
        val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val mine = ComponentName(context, AiriAccessibilityService::class.java)
        // The system writes the services as `package/class` or `package/.Class`, separated by `:`.
        return enabled.split(':').any { entry ->
            ComponentName.unflattenFromString(entry) == mine
        }
    }
}
