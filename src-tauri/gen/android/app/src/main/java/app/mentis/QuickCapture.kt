package app.mentis

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService
import android.widget.RemoteViews

/**
 * Quick capture from outside the app: a home-screen widget and a Quick
 * Settings tile, each opening Mentis straight into capture (the app shortcuts
 * do the same from res/xml/shortcuts.xml). Android widgets cannot hold a text
 * field, so both open the app.
 */
private fun captureIntent(context: Context) =
  Intent(context, MainActivity::class.java)
    .setAction(Inbox.ACTION_CAPTURE)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

private fun capturePending(context: Context) =
  PendingIntent.getActivity(
    context,
    0,
    captureIntent(context),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

class CaptureWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val views = RemoteViews(context.packageName, R.layout.widget_capture)
    views.setOnClickPendingIntent(R.id.widget_capture, capturePending(context))
    for (id in ids) manager.updateAppWidget(id, views)
  }
}

class CaptureTileService : TileService() {
  override fun onClick() {
    super.onClick()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startActivityAndCollapse(capturePending(this))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(captureIntent(this))
    }
  }
}
