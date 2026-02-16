import Foundation
import Combine

struct ServerStatus: Codable {
    let running: Bool
    let sessionId: String?
    let uptime: Int?
    let version: String?
}

struct Notification: Codable, Identifiable {
    let id: String
    let message: String
    let timestamp: Int
    let type: String
}

struct NotificationsResponse: Codable {
    let notifications: [Notification]
}

class AssistantAPI: ObservableObject {
    @Published var isConnected = false
    @Published var status: ServerStatus?
    @Published var notifications: [Notification] = []
    @Published var chatResponse = ""
    @Published var isChatting = false

    private let baseURL = "http://127.0.0.1:3456"
    private var pollTimer: Timer?

    init() {
        startPolling()
    }

    deinit {
        pollTimer?.invalidate()
    }

    func startPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.checkStatus()
            self?.fetchNotifications()
        }
        checkStatus()
    }

    func checkStatus() {
        guard let url = URL(string: "\(baseURL)/api/status") else { return }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let data = data,
                   let status = try? JSONDecoder().decode(ServerStatus.self, from: data) {
                    self?.isConnected = status.running
                    self?.status = status
                } else {
                    self?.isConnected = false
                    self?.status = nil
                }
            }
        }.resume()
    }

    func fetchNotifications() {
        guard let url = URL(string: "\(baseURL)/api/notifications") else { return }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            DispatchQueue.main.async {
                if let data = data,
                   let response = try? JSONDecoder().decode(NotificationsResponse.self, from: data) {
                    self?.notifications = response.notifications
                }
            }
        }.resume()
    }

    func sendChat(message: String) {
        guard let url = URL(string: "\(baseURL)/api/chat") else { return }

        isChatting = true
        chatResponse = ""

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["message": message])

        let task = URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            DispatchQueue.main.async {
                self?.isChatting = false

                if let error = error {
                    self?.chatResponse = "Error: \(error.localizedDescription)"
                    return
                }

                guard let data = data, let text = String(data: data, encoding: .utf8) else {
                    self?.chatResponse = "No response received"
                    return
                }

                // Parse SSE events
                let lines = text.components(separatedBy: "\n")
                var fullText = ""
                for line in lines {
                    if line.hasPrefix("data: ") {
                        let jsonStr = String(line.dropFirst(6))
                        if let jsonData = jsonStr.data(using: .utf8),
                           let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                           let type = json["type"] as? String {
                            if type == "text", let textChunk = json["text"] as? String {
                                fullText += textChunk
                            }
                        }
                    }
                }
                self?.chatResponse = fullText.isEmpty ? text : fullText
            }
        }
        task.resume()
    }

    func openTerminal() {
        let process = Process()
        process.launchPath = "/usr/bin/open"
        process.arguments = ["-a", "Terminal"]
        try? process.launch()
    }

    func openWebUI() {
        if let url = URL(string: "http://localhost:3000/chat") {
            NSWorkspace.shared.open(url)
        }
    }
}
