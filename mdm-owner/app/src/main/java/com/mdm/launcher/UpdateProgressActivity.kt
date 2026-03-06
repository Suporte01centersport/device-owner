package com.mdm.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class UpdateProgressActivity : AppCompatActivity() {

    private lateinit var progressBar: ProgressBar
    private lateinit var tvProgress: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvTimeRemaining: TextView

    private var startTime = 0L

    private val progressReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_UPDATE_PROGRESS -> {
                    val progress = intent.getIntExtra(EXTRA_PROGRESS, 0)
                    val status = intent.getStringExtra(EXTRA_STATUS)
                    runOnUiThread {
                        updateProgress(progress, status)
                    }
                }
                ACTION_UPDATE_DONE -> {
                    runOnUiThread {
                        finish()
                    }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_update_progress)

        progressBar = findViewById(R.id.progressBar)
        tvProgress = findViewById(R.id.tvProgress)
        tvStatus = findViewById(R.id.tvStatus)
        tvTimeRemaining = findViewById(R.id.tvTimeRemaining)

        startTime = System.currentTimeMillis()

        val filter = IntentFilter().apply {
            addAction(ACTION_UPDATE_PROGRESS)
            addAction(ACTION_UPDATE_DONE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(progressReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(progressReceiver, filter)
        }
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(progressReceiver)
        } catch (e: Exception) { /* já desregistrado */ }
        super.onDestroy()
    }

    private fun updateProgress(progress: Int, status: String?) {
        progressBar.progress = progress
        tvProgress.text = "$progress%"
        if (!status.isNullOrEmpty()) {
            tvStatus.text = status
        }

        if (progress > 0 && progress < 100) {
            val elapsedSec = (System.currentTimeMillis() - startTime) / 1000
            val estimatedTotalSec = (elapsedSec * 100) / progress
            val remainingSec = (estimatedTotalSec - elapsedSec).toInt().coerceAtLeast(0)
            tvTimeRemaining.visibility = android.view.View.VISIBLE
            tvTimeRemaining.text = when {
                remainingSec < 60 -> "~${remainingSec}s restantes"
                else -> "~${remainingSec / 60} min restantes"
            }
        } else if (progress >= 100) {
            tvTimeRemaining.visibility = android.view.View.GONE
        }
    }

    companion object {
        const val ACTION_UPDATE_PROGRESS = "com.mdm.launcher.UPDATE_PROGRESS"
        const val ACTION_UPDATE_DONE = "com.mdm.launcher.UPDATE_PROGRESS_DONE"
        const val EXTRA_PROGRESS = "progress"
        const val EXTRA_STATUS = "status"
    }
}
