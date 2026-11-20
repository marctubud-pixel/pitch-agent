import SwiftUI
import Security
import UniformTypeIdentifiers

enum Capability: String, CaseIterable, Identifiable {
    case text = "文字", vision = "视觉理解", image = "生图"
    var id: String { rawValue }
}

struct Profile: Codable {
    var base = "https://api.openai.com/v1"
    var model = ""
}
enum SettingsError: Error, LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(s) = self { return s }; return nil }
}
let defaults = UserDefaults.standard
func profile(_ role: Capability) -> Profile {
    guard let data = defaults.data(forKey: role.id),
          let value = try? JSONDecoder().decode(Profile.self, from: data) else {
        if role == .text { return Profile(base:"https://api.deepseek.com",model:"deepseek-flash") }
        if role == .image { return Profile(base:"https://api.openai.com/v1",model:"gpt-image-2") }
        return Profile(base:"https://api.openai.com/v1",model:"gpt-6.2-sol")
    }
    return value
}
func credential(_ account: String, replacing value: String? = nil) throws -> String {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "cn.onepitch.desktop") + ".api", kSecAttrAccount as String: account]
    if let value = value, !value.isEmpty {
        let bytes = Data(value.utf8)
        var status = SecItemUpdate(query as CFDictionary, [kSecValueData: bytes] as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging([kSecValueData as String: bytes]) { _, b in b } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw SettingsError.message("钥匙串保存失败（\(status)）") }
        return value
    }
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query.merging([kSecReturnData as String: true]) { _, b in b } as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data, let key = String(data: data, encoding: .utf8) else {
        throw SettingsError.message(status == errSecItemNotFound ? "请填写这个服务的 API Key。" : "无法读取钥匙串（\(status)）")
    }
    return key
}
final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var stoppedDuringHandshake = false
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }

    func urlSession(_ session: URLSession, task: URLSessionTask, didFinishCollecting metrics: URLSessionTaskMetrics) {
        let transactions = metrics.transactionMetrics
        let requestUnsent = transactions.allSatisfy {
            $0.secureConnectionEndDate == nil && $0.requestStartDate == nil &&
                $0.countOfRequestHeaderBytesSent == 0 && $0.countOfRequestBodyBytesSent == 0
        }
        lock.lock()
        stoppedDuringHandshake = !transactions.isEmpty && requestUnsent
        lock.unlock()
    }

    func isUnsentHandshakeFailure(_ error: Error?) -> Bool {
        guard let error = error as NSError?, error.domain == NSURLErrorDomain,
              error.code == NSURLErrorSecureConnectionFailed,
              error.userInfo[NSURLErrorFailingURLPeerTrustErrorKey] == nil else { return false }
        lock.lock()
        defer { lock.unlock() }
        return stoppedDuringHandshake
    }
}
func canonical(_ input: String) throws -> URL {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: trimmed), let host = url.host, !host.isEmpty,
          url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
          url.scheme == "https" || (url.scheme == "http" && ["127.0.0.1","localhost","[::1]"].contains(host)) else {
        throw SettingsError.message("请填写 HTTPS 服务地址，本机服务也支持 HTTP。")
    }
    return url
}
struct SettingsView: View {
    @State private var role = Capability.text
    @State private var form = profile(.text)
    @State private var key = ""
    @State private var prompt = "请用一句中文确认收到测试。"
    @State private var attachment: URL?
    @State private var busy = false
    @State private var result = ""
    @State private var picture: NSImage?
    @State private var imageLink: URL?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("模型与 API").font(.largeTitle.bold())
                Text("文字推导使用「文字」，看图评审使用「视觉理解」，制作图稿使用「生图」。").foregroundColor(.secondary)
                Picker("用途", selection: $role) { ForEach(Capability.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.segmented).disabled(busy).onChange(of: role) { next in
                        form = profile(next); key = ""; result = ""; picture = nil; imageLink = nil; attachment = nil
                        prompt = next == .image ? "画一个白底蓝色的茶杯。" : next == .vision ? "请简述这张图的主体。" : "请用一句中文确认收到测试。"
                    }
                Text("OpenAI 兼容接口 · " + (role == .image ? "images/generations" : "chat/completions")).font(.caption)
                TextField("服务地址，包含版本路径，例如 https://api.openai.com/v1", text: $form.base)
                TextField("模型 ID · 填服务商提供的完整名称", text: $form.model)
                SecureField("API Key · 已保存可留空，填写可替换", text: $key)
                Divider()
                TextField("测试提示词", text: $prompt)
                if role == .vision {
                    Button(attachment?.lastPathComponent ?? "选择一张测试图片…") {
                        let panel = NSOpenPanel(); panel.allowedContentTypes = [.png, .jpeg]
                        if panel.runModal() == .OK { attachment = panel.url }
                    }
                }
                HStack {
                    Button("保存设置") { act(false) }
                    Button("保存并测试") { act(true) }.buttonStyle(.borderedProminent)
                    if busy { ProgressView().controlSize(.small) }
                }
                Text(result).textSelection(.enabled)
                if let picture = picture { Image(nsImage: picture).resizable().scaledToFit().frame(maxHeight: 260) }
                if let url = imageLink { Link("查看生成的图片", destination: url) }
            }.disabled(busy).textFieldStyle(.roundedBorder).padding(28)
        }.frame(minWidth: 540, minHeight: 500)
    }
    func act(_ test: Bool) {
        do {
            let base = try canonical(form.base)
            let model = form.model.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !model.isEmpty else { throw SettingsError.message("请填写模型 ID。") }
            let secret = try credential(role.id + "|" + base.absoluteString, replacing: key)
            defaults.set(try JSONEncoder().encode(Profile(base: base.absoluteString, model: model)), forKey: role.id)
            key = ""; picture = nil; imageLink = nil; result = "已保存。"
            guard test else { return }
            guard !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw SettingsError.message("请输入测试提示词。") }
            var content: Any = prompt
            if role == .vision {
                guard let file = attachment else { throw SettingsError.message("请选择一张图片。") }
                let bytes = try Data(contentsOf: file)
                guard bytes.count <= 8_000_000 else { throw SettingsError.message("请选择小于 8 MB 的测试图片。") }
                let mime = file.pathExtension.lowercased() == "png" ? "image/png" : "image/jpeg"
                content = [["type":"text","text":prompt],["type":"image_url","image_url":["url":"data:"+mime+";base64,"+bytes.base64EncodedString()]]] as [[String:Any]]
            }
            let isImage = role == .image
            var request = URLRequest(url: base.appendingPathComponent(isImage ? "images/generations" : "chat/completions"))
            request.httpMethod = "POST"; request.timeoutInterval = 180
            request.setValue("Bearer "+secret, forHTTPHeaderField:"Authorization")
            request.setValue("application/json", forHTTPHeaderField:"Content-Type")
            let body: [String:Any] = isImage ? ["model":model,"prompt":prompt,"n":1] : ["model":model,"messages":[["role":"user","content":content]]]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            result = "正在等待服务返回…"; busy = true
            Task { @MainActor in
                defer { busy = false }
                let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
                defer { session.finishTasksAndInvalidate() }
                do {
                    let (data, response) = try await session.data(for: request)
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    let json = (try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
                    guard (200..<300).contains(status) else {
                        let detail = (json?["error"] as? [String:Any])?["message"] as? String ?? "请检查服务地址、模型权限和额度。"
                        throw SettingsError.message("HTTP \(status) · " + String(detail.replacingOccurrences(of:secret,with:"••••").prefix(320)))
                    }
                    if isImage, let item = (json?["data"] as? [[String:Any]])?.first {
                        if let raw = item["b64_json"] as? String, let bytes = Data(base64Encoded:raw), let image = NSImage(data:bytes) { picture = image }
                        else if let raw = item["url"] as? String, let url = URL(string:raw), url.scheme == "https" { imageLink = url }
                        else { throw SettingsError.message("服务已响应，但未返回可查看的图片。") }
                        result = "已收到生成结果。"
                    } else if let choice = (json?["choices"] as? [[String:Any]])?.first,
                              let message = choice["message"] as? [String:Any], let text = message["content"] as? String, !text.isEmpty { result = text }
                    else { throw SettingsError.message("服务已响应，但结果格式与所选接口不匹配。") }
                } catch { result = error.localizedDescription }
            }
        } catch { result = error.localizedDescription }
    }
}
