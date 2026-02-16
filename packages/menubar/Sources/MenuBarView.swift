import SwiftUI

struct MenuBarView: View {
    @ObservedObject var api: AssistantAPI

    var body: some View {
        VStack(spacing: 0) {
            // Status header
            HStack {
                Circle()
                    .fill(api.isConnected ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                Text(api.isConnected ? "Connected" : "Disconnected")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                if let uptime = api.status?.uptime {
                    Text(formatUptime(uptime))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Divider()

            // Quick chat
            QuickChatView(api: api)

            Divider()

            // Recent notifications
            if !api.notifications.isEmpty {
                NotificationView(notifications: api.notifications)
                Divider()
            }

            // Actions
            VStack(spacing: 2) {
                Button(action: { api.openWebUI() }) {
                    HStack {
                        Image(systemName: "globe")
                        Text("Open Web UI")
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)

                Button(action: { api.openTerminal() }) {
                    HStack {
                        Image(systemName: "terminal")
                        Text("Open Terminal")
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 4)

            Divider()

            Button(action: { NSApp.terminate(nil) }) {
                HStack {
                    Text("Quit Assistants")
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("Q")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
            .keyboardShortcut("q")
        }
        .frame(width: 320)
    }

    private func formatUptime(_ ms: Int) -> String {
        let seconds = ms / 1000
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)m"
        }
        return "\(minutes)m"
    }
}
