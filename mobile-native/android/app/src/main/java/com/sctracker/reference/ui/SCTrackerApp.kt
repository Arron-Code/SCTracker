package com.sctracker.reference.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.SyncProblem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sctracker.reference.domain.GenesisWorkflow
import com.sctracker.reference.domain.TransferDecision
import com.sctracker.reference.domain.TransferWorkflow

private val Forest = Color(0xFF1F5A43)
private val ForestDark = Color(0xFF174735)
private val Paper = Color(0xFFF4F2EA)
private val Panel = Color(0xFFFFFEFA)
private val Ink = Color(0xFF14251D)
private val Amber = Color(0xFFC88124)
private val SoftGreen = Color(0xFFDDEADF)
private val SoftAmber = Color(0xFFF8E8CE)

private enum class Screen { OVERVIEW, SACKS, TRANSFERS, MORE }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SCTrackerApp(
    language: AppLanguage,
    onLanguageSelected: (AppLanguage) -> Unit,
) {
    val t = localizedStrings.getValue(language)
    var screen by remember { mutableStateOf(Screen.OVERVIEW) }
    var languageOpen by remember { mutableStateOf(false) }

    MaterialTheme(
        colorScheme = MaterialTheme.colorScheme.copy(
            primary = Forest,
            onPrimary = Color.White,
            background = Paper,
            surface = Panel,
            onSurface = Ink,
            secondary = Amber,
        ),
    ) {
        Scaffold(
            containerColor = Paper,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Paper),
                    title = {
                        Column {
                            Text("SCTracker", fontWeight = FontWeight.Bold, color = ForestDark)
                            Text(t.evidence, fontSize = 12.sp, color = Color(0xFF68766F))
                        }
                    },
                    actions = {
                        StatusPill(t.offline)
                        IconButton(
                            onClick = { languageOpen = true },
                            modifier = Modifier
                                .size(56.dp)
                                .semantics { contentDescription = t.chooseLanguage },
                        ) {
                            Icon(Icons.Default.Language, contentDescription = null, tint = Forest)
                        }
                    },
                )
            },
            bottomBar = {
                NavigationBar(containerColor = Panel) {
                    NavItem(screen, Screen.OVERVIEW, Icons.Default.Home, t.overview) { screen = it }
                    NavItem(screen, Screen.SACKS, Icons.Default.Inventory2, t.sacks) { screen = it }
                    NavItem(screen, Screen.TRANSFERS, Icons.Default.LocalShipping, t.transfers) { screen = it }
                    NavItem(screen, Screen.MORE, Icons.Default.MoreHoriz, t.exceptions) { screen = it }
                }
            },
        ) { padding ->
            Box(Modifier.padding(padding).fillMaxSize()) {
                when (screen) {
                    Screen.OVERVIEW -> OverviewScreen(t)
                    Screen.SACKS -> SacksScreen(t)
                    Screen.TRANSFERS -> TransfersScreen(t)
                    Screen.MORE -> ExceptionsAndPackagesScreen(t)
                }
            }
        }
        if (languageOpen) {
            AlertDialog(
                onDismissRequest = { languageOpen = false },
                title = { Text(t.chooseLanguage) },
                text = {
                    Column {
                        AppLanguage.entries.forEach { option ->
                            TextButton(
                                onClick = {
                                    onLanguageSelected(option)
                                    languageOpen = false
                                },
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                            ) {
                                Text(
                                    "${option.nativeName} · ${option.code.uppercase()}",
                                    fontWeight = if (option == language) FontWeight.Bold else FontWeight.Normal,
                                )
                            }
                        }
                    }
                },
                confirmButton = {},
            )
        }
    }
}

@Composable
private fun OverviewScreen(t: Strings) {
    ScreenList {
        HeroCard(t)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricCard("12", t.verifiedChain, Icons.Default.Lock, Modifier.weight(1f))
            MetricCard("1", t.pendingTransfers, Icons.Default.LocalShipping, Modifier.weight(1f))
        }
        SectionHeading(t.trust)
        InfoCard("Producer · LOCAL_ATTESTED", "Device · SOFTWARE_OR_UNKNOWN")
        WarningCard(t.prototype)
    }
}

@Composable
private fun SacksScreen(t: Strings) {
    var sackCount by remember { mutableIntStateOf(0) }
    ScreenList {
        SectionHeading(t.genesis)
        Text(t.genesisHint, color = Color(0xFF68766F))
        PrimaryAction(t.createTen) {
            sackCount = GenesisWorkflow.create("B-2026-091", "Washed Arabica", "Jimma", 600.0, 10)
                .sacks.size
        }
        if (sackCount > 0) {
            InfoCard("B-2026-091", "$sackCount ${t.sacks} · UNISSUED")
        }
        SectionHeading(t.sealWorkflow)
        WarningCard(t.unconfiguredChip)
        listOf("ISSUED", "SEALED", "IN_TRANSIT", "OPENED", "VOID / DAMAGED").forEachIndexed { index, state ->
            StatusRow(index + 1, state)
        }
    }
}

@Composable
private fun TransfersScreen(t: Strings) {
    var transfer by remember {
        mutableStateOf(
            TransferWorkflow.offer(
                "T-2026-004",
                listOf("B-2026-091-S001", "B-2026-091-S002"),
                "ACT-COOP-01",
                "ACT-CARRIER-02",
            ),
        )
    }
    ScreenList {
        SectionHeading(t.offer)
        InfoCard("T-2026-004 · ${transfer.decision}", "2 ${t.sacks}\n${transfer.offerHash.take(20)}…")
        Text(t.exactHash, color = Color(0xFF68766F))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = {
                    if (transfer.decision == TransferDecision.PENDING) {
                        transfer = TransferWorkflow.decide(
                            transfer, transfer.offerHash, TransferDecision.ACCEPTED, "EV-ACCEPT-004",
                        )
                    }
                },
                modifier = Modifier.weight(1f).height(56.dp),
            ) { Text(t.accept) }
            TextButton(
                onClick = {
                    if (transfer.decision == TransferDecision.PENDING) {
                        transfer = TransferWorkflow.decide(
                            transfer, transfer.offerHash, TransferDecision.REJECTED, "EV-REJECT-004",
                        )
                    }
                },
                modifier = Modifier.weight(1f).height(56.dp),
            ) { Text(t.reject) }
        }
    }
}

@Composable
private fun ExceptionsAndPackagesScreen(t: Strings) {
    ScreenList {
        SectionHeading(t.exceptionTitle)
        ExceptionCard(Icons.Default.SyncProblem, t.conflict, "EVENT_PREV_HASH_MISMATCH", t.resolveHint)
        ExceptionCard(Icons.Default.ErrorOutline, t.quarantine, "IMPORT_QUARANTINED", t.verifyFirst)
        SectionHeading(t.exportImport)
        Text(t.verifyFirst, color = Color(0xFF68766F))
        PrimaryAction(t.createPackage) {}
        TextButton(onClick = {}, modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Text(t.importPackage)
        }
    }
}

@Composable
private fun HeroCard(t: Strings) {
    Card(
        colors = CardDefaults.cardColors(containerColor = ForestDark),
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(t.activeBatch.uppercase(), color = Color(0xFFCADB84), fontSize = 12.sp)
            Text("B-2026-091", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text("Washed Arabica · Jimma", color = Color.White)
            Text("12 / 12 ${t.sacks} · 600 kg", color = Color.White, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun StatusPill(text: String) {
    Surface(color = SoftGreen, shape = RoundedCornerShape(50)) {
        Text("✓ $text", modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = ForestDark)
    }
}

@Composable
private fun MetricCard(value: String, label: String, icon: ImageVector, modifier: Modifier = Modifier) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = Panel)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, contentDescription = null, tint = Forest)
            Text(value, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text(label, color = Color(0xFF68766F))
        }
    }
}

@Composable
private fun InfoCard(title: String, detail: String) {
    Card(colors = CardDefaults.cardColors(containerColor = Panel), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, fontWeight = FontWeight.Bold)
            Text(detail, color = Color(0xFF68766F))
        }
    }
}

@Composable
private fun WarningCard(text: String) {
    Card(colors = CardDefaults.cardColors(containerColor = SoftAmber), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = Amber)
            Spacer(Modifier.width(12.dp))
            Text("! $text", modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ExceptionCard(icon: ImageVector, title: String, code: String, hint: String) {
    Card(colors = CardDefaults.cardColors(containerColor = Panel), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = Amber)
                Spacer(Modifier.width(12.dp))
                Text("! $title", fontWeight = FontWeight.Bold)
            }
            Text(code, color = Amber, fontWeight = FontWeight.SemiBold)
            HorizontalDivider()
            Text(hint, color = Color(0xFF68766F))
        }
    }
}

@Composable
private fun StatusRow(number: Int, state: String) {
    Row(
        Modifier.fillMaxWidth().height(56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(color = SoftGreen, shape = RoundedCornerShape(50)) {
            Text("$number", modifier = Modifier.padding(10.dp), color = ForestDark, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(12.dp))
        Text(state, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PrimaryAction(label: String, action: () -> Unit) {
    Button(
        onClick = action,
        modifier = Modifier.fillMaxWidth().height(56.dp),
        shape = RoundedCornerShape(14.dp),
    ) {
        Text(label, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SectionHeading(text: String) {
    Text(text, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Ink)
}

@Composable
private fun ScreenList(content: @Composable () -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item { Column(verticalArrangement = Arrangement.spacedBy(14.dp)) { content() } }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.NavItem(
    selected: Screen,
    target: Screen,
    icon: ImageVector,
    label: String,
    navigate: (Screen) -> Unit,
) {
    NavigationBarItem(
        selected = selected == target,
        onClick = { navigate(target) },
        icon = { Icon(icon, contentDescription = null) },
        label = { Text(label, maxLines = 1, fontSize = 10.sp) },
    )
}
