import SwiftUI

struct NotificationView: View {
    let notifications: [Notification]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Recent")
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.horizontal, 16)
                .padding(.top, 6)

            ForEach(notifications.suffix(5)) { notification in
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(colorForType(notification.type))
                        .frame(width: 6, height: 6)
                        .padding(.top, 4)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(notification.message)
                            .font(.system(size: 12))
                            .lineLimit(2)

                        Text(formatTimestamp(notification.timestamp))
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 3)
            }
        }
        .padding(.bottom, 6)
    }

    private func colorForType(_ type: String) -> Color {
        switch type {
        case "success": return .green
        case "error": return .red
        case "warning": return .orange
        default: return .blue
        }
    }

    private func formatTimestamp(_ ms: Int) -> String {
        let date = Date(timeIntervalSince1970: Double(ms) / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
