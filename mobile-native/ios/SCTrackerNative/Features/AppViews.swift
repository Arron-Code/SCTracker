import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView {
            NavigationStack { WorkflowView() }
                .tabItem { Label(t(.workflows), systemImage: "shippingbox.fill") }
            NavigationStack { TransferView() }
                .tabItem { Label(t(.transfers), systemImage: "arrow.left.arrow.right") }
            NavigationStack { ExceptionsView() }
                .tabItem { Label(t(.exceptions), systemImage: "exclamationmark.shield.fill") }
            NavigationStack { PackageView() }
                .tabItem { Label(t(.package), systemImage: "checkmark.seal.fill") }
            NavigationStack { SettingsView() }
                .tabItem { Label(t(.settings), systemImage: "gearshape.fill") }
        }
        .alert(t(.error), isPresented: Binding(
            get: { model.lastError != nil },
            set: { if !$0 { model.lastError = nil } }
        )) {
            Button(t(.ok), role: .cancel) {}
        } message: {
            if let failure = model.lastError {
                Text(L10n.error(failure, language: model.language))
            }
        }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

private struct LanguageToolbar: ToolbarContent {
    @EnvironmentObject private var model: AppModel

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                ForEach(AppLanguage.allCases) { language in
                    Button {
                        model.language = language
                    } label: {
                        if language == model.language {
                            Label(language.label, systemImage: "checkmark")
                        } else {
                            Text(language.label)
                        }
                    }
                }
            } label: {
                Image(systemName: "globe")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(L10n.text(.language, language: model.language))
        }
    }
}

struct WorkflowView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingGenesis = false

    var body: some View {
        List {
            Section {
                Label(t(.offlineReady), systemImage: "iphone.and.arrow.forward")
                    .foregroundStyle(Brand.forest)
                    .accessibilityLabel(t(.offlineReady))
            }
            Section(t(.batches)) {
                if model.snapshot.batches.isEmpty {
                    ContentUnavailableView(t(.noBatches), systemImage: "shippingbox")
                }
                ForEach(model.snapshot.batches) { batch in
                    NavigationLink {
                        BatchDetailView(batchID: batch.id)
                    } label: {
                        BatchRow(batch: batch)
                    }
                }
            }
        }
        .navigationTitle(t(.appTitle))
        .toolbar {
            LanguageToolbar()
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    showingGenesis = true
                } label: {
                    Label(t(.newBatch), systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .sheet(isPresented: $showingGenesis) { GenesisView() }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

private struct BatchRow: View {
    @EnvironmentObject private var model: AppModel
    let batch: Batch

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: batch.quarantined ? "exclamationmark.triangle.fill" : icon)
                .foregroundStyle(batch.quarantined ? Brand.danger : Brand.forest)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 5) {
                Text(batch.reference).font(.headline)
                Text("\(batch.origin) • \(batch.sackIDs.count) \(t(.sacks))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(L10n.batchState(batch.state, language: model.language))
                    .font(.caption.bold())
            }
            Spacer()
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }

    private var icon: String {
        switch batch.state {
        case .unissued: return "circle.dashed"
        case .issued: return "checkmark.circle"
        case .sealed: return "lock.circle"
        case .inTransit: return "truck.box"
        case .opened: return "lock.open"
        case .void: return "xmark.octagon"
        case .damaged: return "exclamationmark.octagon"
        }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

struct GenesisView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var reference = ""
    @State private var origin = "Ethiopia"
    @State private var sackCount = 10

    var body: some View {
        NavigationStack {
            Form {
                TextField(t(.reference), text: $reference)
                TextField(t(.origin), text: $origin)
                Stepper("\(t(.sackCount)): \(sackCount)", value: $sackCount, in: 1...100)
                Button {
                    model.createGenesis(reference: reference, sackCount: sackCount, origin: origin)
                    if model.lastError == nil { dismiss() }
                } label: {
                    Label(t(.create), systemImage: "shippingbox.badge.plus")
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.borderedProminent)
            }
            .navigationTitle(t(.newBatch))
            .toolbar { LanguageToolbar() }
        }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

struct BatchDetailView: View {
    @EnvironmentObject private var model: AppModel
    let batchID: UUID

    private var batch: Batch? { model.snapshot.batches.first { $0.id == batchID } }

    var body: some View {
        List {
            if let batch {
                Section {
                    LabeledContent(t(.origin), value: batch.origin)
                    LabeledContent(t(.sacks), value: "\(batch.sackIDs.count)")
                    LabeledContent(t(.state), value: L10n.batchState(batch.state, language: model.language))
                    LabeledContent(t(.sequence), value: "\(batch.lastSequence)")
                }
                if batch.quarantined {
                    Section(t(.quarantine)) {
                        Label(t(.conflict), systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Brand.danger)
                    }
                } else {
                    Section(t(.nextAction)) {
                        ForEach(actions(for: batch.state), id: \.self) { action in
                            Button {
                                model.apply(action, to: batch.id)
                            } label: {
                                Label(label(action), systemImage: icon(action))
                                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                            }
                        }
                    }
                }
                Section(t(.ledger)) {
                    ForEach(model.snapshot.events.filter { $0.entityID == batch.id }.reversed()) { event in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(event.eventType).font(.headline)
                            Text("#\(event.sequence) • \(event.eventHash.prefix(16))…")
                                .font(.caption.monospaced())
                            Label(
                                event.signature?.developmentFallback == true
                                    ? t(.simulatorFallback) : t(.secureEnclave),
                                systemImage: event.signature == nil ? "signature" : "checkmark.seal"
                            )
                            .font(.caption)
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle(batch?.reference ?? t(.batches))
        .toolbar { LanguageToolbar() }
    }

    private func actions(for state: BatchState) -> [BatchAction] {
        switch state {
        case .unissued: return [.issue, .markVoid]
        case .issued: return [.seal, .markVoid, .markDamaged]
        case .sealed: return [.dispatch, .markVoid, .markDamaged]
        case .inTransit: return [.open, .markDamaged]
        case .opened, .void, .damaged: return []
        }
    }

    private func label(_ action: BatchAction) -> String {
        switch action {
        case .issue: return t(.issue)
        case .seal: return t(.seal)
        case .dispatch: return t(.dispatch)
        case .open: return t(.open)
        case .markVoid: return t(.markVoid)
        case .markDamaged: return t(.markDamaged)
        }
    }

    private func icon(_ action: BatchAction) -> String {
        switch action {
        case .issue: return "checkmark.circle"
        case .seal: return "lock.circle"
        case .dispatch: return "truck.box"
        case .open: return "lock.open"
        case .markVoid: return "xmark.octagon"
        case .markDamaged: return "exclamationmark.octagon"
        }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

struct TransferView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section {
                ForEach(model.snapshot.batches) { batch in
                    Button {
                        if let receiver = model.snapshot.actors.first(where: { $0.id != model.actorID }) {
                            model.offerTransfer(batchID: batch.id, to: receiver.id)
                        }
                    } label: {
                        Label("\(t(.offerTransfer)): \(batch.reference)", systemImage: "paperplane")
                            .frame(minHeight: 48)
                    }
                    .disabled(batch.quarantined)
                }
            }
            Section(t(.transfers)) {
                ForEach(model.snapshot.transfers) { transfer in
                    VStack(alignment: .leading, spacing: 10) {
                        Label(status(transfer.status), systemImage: statusIcon(transfer.status))
                            .font(.headline)
                        Text("\(t(.offerHash)): \(transfer.offerEventHash)")
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                        if transfer.status == .pending {
                            HStack {
                                actionButton(t(.accept), icon: "checkmark") {
                                    model.resolveTransfer(
                                        transfer.id,
                                        action: .accept,
                                        offerHash: transfer.offerEventHash
                                    )
                                }
                                actionButton(t(.reject), icon: "xmark") {
                                    model.resolveTransfer(
                                        transfer.id,
                                        action: .reject,
                                        offerHash: transfer.offerEventHash
                                    )
                                }
                            }
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
        .navigationTitle(t(.transfers))
        .toolbar { LanguageToolbar() }
    }

    private func actionButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.bordered)
    }

    private func status(_ value: TransferStatus) -> String {
        switch value {
        case .pending: return t(.pending)
        case .accepted: return t(.accepted)
        case .rejected: return t(.rejected)
        }
    }

    private func statusIcon(_ value: TransferStatus) -> String {
        switch value {
        case .pending: return "clock"
        case .accepted: return "checkmark.circle"
        case .rejected: return "xmark.circle"
        }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

struct ExceptionsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            let unresolved = model.snapshot.conflicts.filter { !$0.resolved }
            if unresolved.isEmpty {
                ContentUnavailableView(t(.noExceptions), systemImage: "checkmark.shield")
            }
            ForEach(unresolved) { conflict in
                VStack(alignment: .leading, spacing: 10) {
                    Label(t(.conflict), systemImage: "exclamationmark.triangle.fill")
                        .font(.headline)
                        .foregroundStyle(Brand.danger)
                    Text(conflict.reasonCode.rawValue).font(.caption.monospaced())
                    Text("\(t(.localHead)): \(conflict.localHeadHash.isEmpty ? "GENESIS" : conflict.localHeadHash)")
                        .font(.caption.monospaced())
                    Text("\(t(.incomingPrevious)): \(conflict.incomingPreviousHash ?? "GENESIS")")
                        .font(.caption.monospaced())
                    Button {
                        model.resolveConflict(conflict.id)
                    } label: {
                        Label(t(.resolve), systemImage: "person.crop.circle.badge.checkmark")
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(.vertical, 6)
            }
        }
        .navigationTitle(t(.exceptions))
        .toolbar { LanguageToolbar() }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

struct PackageView: View {
    @EnvironmentObject private var model: AppModel
    @State private var importing = false
    @State private var exporting = false

    var body: some View {
        List {
            Section {
                Button {
                    model.exportPackage()
                    exporting = model.lastPackage != nil
                } label: {
                    Label(t(.exportPackage), systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.borderedProminent)
                Button {
                    importing = true
                } label: {
                    Label(t(.importPackage), systemImage: "checkmark.shield")
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.bordered)
            }
            Section {
                Label(
                    model.lastPackage == nil ? t(.packageNotVerified) : t(.packageVerified),
                    systemImage: model.lastPackage == nil ? "questionmark.diamond" : "checkmark.seal.fill"
                )
                if let manifest = model.lastPackage?.manifest {
                    LabeledContent(t(.events), value: "\(manifest.eventCount)")
                    Text(manifest.chainRootHash).font(.caption.monospaced()).textSelection(.enabled)
                }
            }
        }
        .navigationTitle(t(.package))
        .toolbar { LanguageToolbar() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            do {
                let url = try result.get()
                guard url.startAccessingSecurityScopedResource() else {
                    throw SCTrackerFailure(code: .packageInvalid, detail: "File access was denied")
                }
                defer { url.stopAccessingSecurityScopedResource() }
                let package = try JSONDecoder.protocolDecoder.decode(
                    TransferPackage.self,
                    from: Data(contentsOf: url)
                )
                model.importPackage(package)
            } catch let failure as SCTrackerFailure {
                model.lastError = failure
            } catch {
                model.lastError = SCTrackerFailure(code: .packageInvalid, detail: error.localizedDescription)
            }
        }
        .fileExporter(
            isPresented: $exporting,
            document: model.lastPackage.map { PackageDocument(package: $0) },
            contentType: .json,
            defaultFilename: "sctracker-package.json"
        ) { result in
            if case let .failure(error) = result {
                model.lastError = SCTrackerFailure(code: .packageInvalid, detail: error.localizedDescription)
            }
        }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}

struct PackageDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    let package: TransferPackage

    init(package: TransferPackage) {
        self.package = package
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw SCTrackerFailure(code: .packageInvalid, detail: "Package is empty")
        }
        package = try JSONDecoder.protocolDecoder.decode(TransferPackage.self, from: data)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: try JSONEncoder.protocolEncoder.encode(package))
    }
}

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section(t(.signing)) {
                Label(
                    model.signer.isDevelopmentFallback ? t(.simulatorFallback) : t(.secureEnclave),
                    systemImage: model.signer.isDevelopmentFallback ? "hammer" : "lock.shield"
                )
                LabeledContent(t(.keyID), value: model.signer.keyID)
            }
            Section(t(.chipIntegration)) {
                Label(t(.chipDisabled), systemImage: "antenna.radiowaves.left.and.right.slash")
                    .foregroundStyle(Brand.warning)
                Label(t(.uidLookupOnly), systemImage: "info.circle")
            }
            Section(t(.trust)) {
                ForEach(model.snapshot.actors) { actor in
                    VStack(alignment: .leading) {
                        Text(actor.displayName).font(.headline)
                        Text("\(t(.role)): \(actor.roles.map { L10n.role($0, language: model.language) }.sorted().joined(separator: ", "))")
                        Text("\(t(.trust)): \(L10n.trust(actor.trustState, language: model.language))")
                    }
                    .font(.subheadline)
                }
            }
        }
        .navigationTitle(t(.settings))
        .toolbar { LanguageToolbar() }
    }

    private func t(_ key: TextKey) -> String { L10n.text(key, language: model.language) }
}
