package com.sctracker.reference

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.sctracker.reference.ui.AppLanguage
import com.sctracker.reference.ui.SCTrackerApp

class MainActivity : ComponentActivity() {
    private var language by mutableStateOf(AppLanguage.EN)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val preferences = getSharedPreferences("sctracker-reference", MODE_PRIVATE)
        language = AppLanguage.fromCode(preferences.getString("language", null))
        setContent {
            SCTrackerApp(language) { selected ->
                language = selected
                preferences.edit().putString("language", selected.code).apply()
            }
        }
    }
}
