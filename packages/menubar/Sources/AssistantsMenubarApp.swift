import SwiftUI

@main
struct AssistantsMenubarApp: App {
    @StateObject private var api = AssistantAPI()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(api: api)
        } label: {
            Image(systemName: api.isConnected ? "brain.head.profile" : "brain.head.profile.slash")
        }
        .menuBarExtraStyle(.window)
    }
}
