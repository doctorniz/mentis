package app.mentis

import android.content.Intent
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Started to show something (a reminder's item, a share): keep it for the app.
    if (savedInstanceState == null) Inbox.accept(this, intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    Inbox.accept(this, intent)
  }
}
