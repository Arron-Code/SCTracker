import SwiftUI

@main
struct SCTrackerNativeApp: App {
    @StateObject private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environment(\.locale, model.language.locale)
                .tint(Brand.forest)
        }
    }
}

enum Brand {
    static let forest = Color(red: 31 / 255, green: 90 / 255, blue: 67 / 255)
    static let coffee = Color(red: 20 / 255, green: 37 / 255, blue: 29 / 255)
    static let cream = Color(red: 244 / 255, green: 242 / 255, blue: 234 / 255)
    static let warning = Color(red: 200 / 255, green: 129 / 255, blue: 36 / 255)
    static let danger = Color(red: 166 / 255, green: 69 / 255, blue: 54 / 255)
}
