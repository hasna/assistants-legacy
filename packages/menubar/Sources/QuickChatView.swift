import SwiftUI

struct QuickChatView: View {
    @ObservedObject var api: AssistantAPI
    @State private var inputText = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Input field
            HStack {
                TextField("Ask anything...", text: $inputText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .onSubmit {
                        sendMessage()
                    }
                    .disabled(!api.isConnected || api.isChatting)

                if api.isChatting {
                    ProgressView()
                        .scaleEffect(0.6)
                } else {
                    Button(action: sendMessage) {
                        Image(systemName: "arrow.up.circle.fill")
                            .foregroundColor(inputText.isEmpty || !api.isConnected ? .secondary : .accentColor)
                    }
                    .buttonStyle(.plain)
                    .disabled(inputText.isEmpty || !api.isConnected)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(nsColor: .controlBackgroundColor))
            .cornerRadius(8)

            // Response
            if !api.chatResponse.isEmpty {
                ScrollView {
                    Text(api.chatResponse)
                        .font(.system(size: 12))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 200)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func sendMessage() {
        guard !inputText.isEmpty, api.isConnected else { return }
        api.sendChat(message: inputText)
        inputText = ""
    }
}
