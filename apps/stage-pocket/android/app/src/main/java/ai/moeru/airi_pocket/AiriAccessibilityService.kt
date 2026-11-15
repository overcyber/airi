package ai.moeru.airi_pocket

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lets AIRI read the screen and control the phone, only after the user turns the service on in the system settings
 * (Settings, Accessibility, AIRI) and the switches in the AIRI settings.
 *
 * The app does not listen to accessibility events. It reads the screen only when a tool asks for it
 * ([snapshot]), and it acts only when a tool asks for it ([perform]). Text of a password field is never read,
 * and a password field is never typed in.
 */
class AiriAccessibilityService : AccessibilityService() {
    companion object {
        /** The running service, or `null` while the user has it off. */
        @Volatile
        var instance: AiriAccessibilityService? = null
            private set

        const val MAX_NODES = 250
        const val MAX_DEPTH = 40
        const val MAX_TEXT_LENGTH = 200
        const val MAX_COORDINATE = 20000.0
        const val TAP_MILLISECONDS = 60L
        const val LONG_PRESS_MILLISECONDS = 800L
        const val DEFAULT_SWIPE_MILLISECONDS = 300L
    }

    private val lock = Any()

    /** The views of the last snapshot. The `id` of a view is its place in this list. */
    private var snapshotNodes: List<AccessibilityNodeInfo> = emptyList()

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onUnbind(intent: Intent?): Boolean {
        release()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        release()
        super.onDestroy()
    }

    // The service does not use events. It reads the screen on demand.
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    private fun release() {
        instance = null
        replaceNodes(emptyList())
    }

    @Suppress("DEPRECATION")
    private fun replaceNodes(next: List<AccessibilityNodeInfo>) {
        val previous = synchronized(lock) {
            val old = snapshotNodes
            snapshotNodes = next
            old
        }
        // Before Android 13 a node has to be recycled. From 13 on, recycle does nothing.
        previous.forEach { runCatching { it.recycle() } }
    }

    /**
     * The views of the screen in front, as JSON: the package, the size of the screen, and a list of views with their
     * text, place, and what they can do. Throws when no window is in front.
     */
    fun snapshot(): JSONObject {
        val root = rootInActiveWindow ?: throw IllegalStateException("No window is in front. Wake the screen and try again.")
        val kept = ArrayList<AccessibilityNodeInfo>()
        val views = JSONArray()
        var truncated = false

        fun visit(node: AccessibilityNodeInfo, depth: Int) {
            if (kept.size >= MAX_NODES) {
                truncated = true
                return
            }
            if (describes(node)) {
                views.put(describe(node, kept.size))
                kept.add(node)
            }
            if (depth >= MAX_DEPTH) {
                truncated = true
                return
            }
            for (index in 0 until node.childCount) {
                val child = node.getChild(index) ?: continue
                visit(child, depth + 1)
            }
        }
        visit(root, 0)
        replaceNodes(kept)

        val metrics = resources.displayMetrics
        return JSONObject()
            .put("packageName", root.packageName?.toString() ?: "")
            .put("width", metrics.widthPixels)
            .put("height", metrics.heightPixels)
            .put("nodes", views)
            .put("truncated", truncated)
    }

    /** A view is worth sending when the user can see it and it has text or can be used. */
    private fun describes(node: AccessibilityNodeInfo): Boolean {
        if (!node.isVisibleToUser) return false
        val hasText = !node.text.isNullOrEmpty() || !node.contentDescription.isNullOrEmpty() || !node.hintText.isNullOrEmpty()
        return hasText || node.isClickable || node.isEditable || node.isScrollable || node.isCheckable
    }

    private fun describe(node: AccessibilityNodeInfo, id: Int): JSONObject {
        val bounds = Rect().also { node.getBoundsInScreen(it) }
        val view = JSONObject()
            .put("id", id)
            .put("className", node.className?.toString() ?: "")
            .put("bounds", JSONArray().put(bounds.left).put(bounds.top).put(bounds.right).put(bounds.bottom))
            .put("clickable", node.isClickable)
            .put("scrollable", node.isScrollable)
            .put("editable", node.isEditable)
            .put("focused", node.isFocused)
            .put("password", node.isPassword)
        // The text of a password field never leaves the service.
        if (!node.isPassword) {
            node.text?.let { view.put("text", it.toString().take(MAX_TEXT_LENGTH)) }
        }
        node.contentDescription?.let { view.put("description", it.toString().take(MAX_TEXT_LENGTH)) }
        node.hintText?.let { view.put("hint", it.toString().take(MAX_TEXT_LENGTH)) }
        node.viewIdResourceName?.let { view.put("viewId", it) }
        if (node.isCheckable) view.put("checked", node.isChecked)
        return view
    }

    private fun nodeOf(id: Int): AccessibilityNodeInfo? = synchronized(lock) { snapshotNodes.getOrNull(id) }

    /** Does one action and calls `done` once with `{ok}` or `{ok: false, error}`. It never throws. */
    fun perform(action: JSONObject, done: (JSONObject) -> Unit) {
        try {
            when (action.optString("type")) {
                "tap" -> gesture(point(action, "x", "y"), null, TAP_MILLISECONDS, done)
                "long_press" -> gesture(point(action, "x", "y"), null, LONG_PRESS_MILLISECONDS, done)
                "swipe" -> gesture(
                    point(action, "x1", "y1"),
                    point(action, "x2", "y2"),
                    action.optLong("durationMs", DEFAULT_SWIPE_MILLISECONDS).coerceIn(50L, 3000L),
                    done,
                )
                "click_node" -> done(clickNode(action.getInt("id")))
                "set_text" -> done(setText(action))
                "scroll" -> done(scroll(action.getInt("id"), action.getString("direction")))
                "key" -> done(key(action.getString("key")))
                "open_app" -> done(openApp(action.getString("packageName")))
                else -> done(failure("Unknown action type."))
            }
        } catch (error: Exception) {
            done(failure(error.message ?: "The action failed."))
        }
    }

    private fun failure(message: String) = JSONObject().put("ok", false).put("error", message)

    private fun success() = JSONObject().put("ok", true)

    private fun point(action: JSONObject, xKey: String, yKey: String): Pair<Float, Float> {
        val x = action.getDouble(xKey)
        val y = action.getDouble(yKey)
        require(x in 0.0..MAX_COORDINATE && y in 0.0..MAX_COORDINATE) { "A coordinate is out of range." }
        return Pair(x.toFloat(), y.toFloat())
    }

    private fun gesture(from: Pair<Float, Float>, to: Pair<Float, Float>?, duration: Long, done: (JSONObject) -> Unit) {
        val path = Path().apply {
            moveTo(from.first, from.second)
            // A tap is a path with no length. A swipe goes to its end.
            if (to != null) lineTo(to.first, to.second)
        }
        val description = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0L, duration))
            .build()
        val accepted = dispatchGesture(
            description,
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription?) = done(success())

                override fun onCancelled(gestureDescription: GestureDescription?) = done(failure("The gesture was cancelled."))
            },
            null,
        )
        if (!accepted) done(failure("The system did not accept the gesture."))
    }

    private fun clickNode(id: Int): JSONObject {
        val node = nodeOf(id) ?: return failure("No view has this id. Read the screen again.")
        if (!node.refresh()) return failure("The view is gone. Read the screen again.")
        // The view that handles the click can be a parent of the view with the text.
        var target: AccessibilityNodeInfo? = node
        var hops = 0
        while (target != null && !target.isClickable && hops < 5) {
            target = target.parent
            hops++
        }
        return if (target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            success()
        } else {
            failure("The view cannot be clicked. Use a tap at its place.")
        }
    }

    private fun setText(action: JSONObject): JSONObject {
        val text = action.getString("text")
        val node = if (action.has("id")) nodeOf(action.getInt("id")) else findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (node == null) return failure("No text field. Click a field, or read the screen and give its id.")
        if (action.has("id") && !node.refresh()) return failure("The view is gone. Read the screen again.")
        if (node.isPassword) return failure("AIRI does not type in a password field.")
        if (!node.isEditable) return failure("This view is not a text field.")
        val arguments = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return if (node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)) success() else failure("The field did not take the text.")
    }

    private fun scroll(id: Int, direction: String): JSONObject {
        val node = nodeOf(id) ?: return failure("No view has this id. Read the screen again.")
        if (!node.refresh()) return failure("The view is gone. Read the screen again.")
        val kind = if (direction == "backward") AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        return if (node.performAction(kind)) success() else failure("The view cannot scroll that way.")
    }

    private fun key(name: String): JSONObject {
        val global = when (name) {
            "back" -> GLOBAL_ACTION_BACK
            "home" -> GLOBAL_ACTION_HOME
            "recents" -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            else -> return failure("Unknown key.")
        }
        return if (performGlobalAction(global)) success() else failure("The system did not accept the key.")
    }

    private fun openApp(packageName: String): JSONObject {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
            ?: return failure("No app with this package can be opened.")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            startActivity(intent)
            success()
        } catch (error: RuntimeException) {
            failure("The system did not let AIRI open the app.")
        }
    }
}
