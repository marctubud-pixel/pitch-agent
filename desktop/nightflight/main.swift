import Cocoa
import SwiftUI
import WebKit

final class Desktop: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var settings: NSWindow?
    let web = WKWebView()
    var process: Process?
    var origin: URL?
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x:0,y:0,width:1160,height:780), styleMask:[.titled,.closable,.resizable,.miniaturizable], backing:.buffered,defer:false)
        window.title = "夜航提案台"; window.center()
        window.contentView = web
        web.navigationDelegate = self; web.uiDelegate = self
        web.configuration.userContentController.add(self, name: "openModelSettings")
        web.configuration.userContentController.addUserScript(WKUserScript(source: """
        const style=document.createElement('style');style.textContent='form[action="/logout"]{display:none}';document.head.append(style);
        """, injectionTime:.atDocumentEnd, forMainFrameOnly:true))
        let menu = NSMenu(); let appItem = NSMenuItem(); menu.addItem(appItem); let appMenu = NSMenu()
        let settingsItem = appMenu.addItem(withTitle:"模型与 API…",action:#selector(configure),keyEquivalent:",")
        settingsItem.target = self
        let libraryItem = appMenu.addItem(withTitle:"比稿资料库",action:#selector(library),keyEquivalent:"l")
        libraryItem.target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle:"退出夜航提案台",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q"); appItem.submenu = appMenu
        let edit = NSMenuItem(); menu.addItem(edit); let edits = NSMenu(title:"编辑"); edit.submenu = edits
        for (title,action,key) in [("撤销","undo:","z"),("剪切","cut:","x"),("复制","copy:","c"),("粘贴","paste:","v"),("全选","selectAll:","a")] { edits.addItem(withTitle:title,action:NSSelectorFromString(action),keyEquivalent:key) }
        NSApp.mainMenu = menu; window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
        do {
            let runner = Process(); process = runner
            let root = Bundle.main.resourceURL!.appendingPathComponent("runtime")
            runner.currentDirectoryURL = root
            let candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node"] +
                (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map { String($0) + "/node" }
            guard let node = candidates.first(where: FileManager.default.isExecutableFile(atPath:)) else {
                throw SettingsError.message("请先安装 Node.js 24。")
            }
            runner.executableURL = URL(fileURLWithPath: node)
            runner.arguments = ["tools/nightflight/start.mjs"]
            var env = ProcessInfo.processInfo.environment
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:" + (env["PATH"] ?? "/usr/bin:/bin")
            env["ONEPITCH_TEXT_EXECUTABLE"] = Bundle.main.executablePath
            let profile = Bundle.main.bundleIdentifier == "cn.onepitch.desktop.review" ? "Review" : "Desktop"
            env["NIGHTFLIGHT_PORT"] = "0"
            env["NIGHTFLIGHT_DATA"] = NSHomeDirectory()+"/Library/Application Support/OnePitch/"+profile+"/projects"
            if env["NIGHTFLIGHT_PYTHON"] == nil, let python = Bundle.main.object(forInfoDictionaryKey: "NightflightPython") as? String {
                env["NIGHTFLIGHT_PYTHON"] = python
            }
            runner.environment = env
            let output = Pipe(); runner.standardOutput = output
            output.fileHandleForReading.readabilityHandler = { [weak self] file in
                let data = file.availableData
                if data.isEmpty { file.readabilityHandler = nil; return }
                let line = String(decoding:data,as:UTF8.self)
                guard let range = line.range(of:"http://127[.]0[.]0[.]1:[0-9]+/",options:.regularExpression),
                      let url = URL(string:String(line[range])) else { return }
                DispatchQueue.main.async { self?.origin = url; self?.loadRoute("/") }
            }
            runner.terminationHandler = { [weak self] _ in DispatchQueue.main.async { self?.window.title = "夜航提案台 · 本地服务已停止，请重新打开 App。" } }
            try runner.run()
        } catch { window.title = "夜航提案台 · " + error.localizedDescription }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    func loadRoute(_ route: String) {
        if let url = origin.flatMap({ URL(string: "nightflight/#" + route, relativeTo: $0) }) {
            web.load(URLRequest(url: url))
        }
    }
    @objc func library() { loadRoute("/library") }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let origin = origin, message.name == "openModelSettings", message.frameInfo.isMainFrame,
              let source = message.frameInfo.request.url, source.scheme == origin.scheme,
              source.host == origin.host, source.port == origin.port else { return }
        configure()
    }
    @objc func configure() {
        if settings == nil {
            let w = NSWindow(contentViewController:NSHostingController(rootView:SettingsView()))
            w.title = "模型与 API"; w.setContentSize(NSSize(width:610,height:555)); w.styleMask.insert(.resizable)
            w.isReleasedWhenClosed = false; w.center(); settings = w
        }
        settings?.makeKeyAndOrderFront(nil)
    }
    func webView(_ webView:WKWebView, decidePolicyFor action:WKNavigationAction, decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "blob" || (url.host == origin?.host && url.port == origin?.port && url.scheme == "http") {
            if action.shouldPerformDownload { decisionHandler(.download) }
            else if action.targetFrame == nil { decisionHandler(.cancel); web.load(action.request) }
            else { decisionHandler(.allow) }
        } else { decisionHandler(.cancel); if action.navigationType == .linkActivated && ["https","http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) } }
    }
    func webView(_ webView:WKWebView, decidePolicyFor response:WKNavigationResponse, decisionHandler:@escaping(WKNavigationResponsePolicy)->Void) {
        let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField:"Content-Disposition") ?? ""
        decisionHandler(disposition.lowercased().contains("attachment") || !response.canShowMIMEType ? .download : .allow)
    }
    func webView(_ webView:WKWebView,navigationAction:WKNavigationAction,didBecome download:WKDownload){download.delegate=self}
    func webView(_ webView:WKWebView,navigationResponse:WKNavigationResponse,didBecome download:WKDownload){download.delegate=self}
    func download(_ download:WKDownload,decideDestinationUsing response:URLResponse,suggestedFilename:String,completionHandler:@escaping(URL?)->Void){
        let panel=NSSavePanel(); panel.nameFieldStringValue=suggestedFilename
        panel.beginSheetModal(for:window){ result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
    func applicationWillTerminate(_ notification:Notification){if process?.isRunning == true {process?.terminate()}}
}
if ["--text-model","--image-model","--vision-model"].contains(CommandLine.arguments.dropFirst().first ?? "") {
    let capability: Capability = CommandLine.arguments[1] == "--image-model" ? .image : CommandLine.arguments[1] == "--vision-model" ? .vision : .text
    var saved = profile(capability)
    if capability == .image, let model = ProcessInfo.processInfo.environment["NIGHTFLIGHT_IMAGE_MODEL"]?.trimmingCharacters(in: .whitespacesAndNewlines), !model.isEmpty {
        saved.model = model
    }
    let output = FileHandle.standardOutput
    func reply(_ json: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: json) { output.write(data) }
    }
    do {
        let base = try canonical(saved.base)
        guard !saved.model.isEmpty else { throw SettingsError.message("请在菜单中保存对应的 API 和模型。") }
        if CommandLine.arguments.last == "profile" {
            reply(["host":base.host!, "model":saved.model, "base":base.absoluteString]); exit(0)
        }
        let data = FileHandle.standardInput.readDataToEndOfFile()
        guard let packet = try JSONSerialization.jsonObject(with:data) as? [String:Any],
              packet["base"] as? String == base.absoluteString, let body = packet["body"] as? [String:Any],
              body["model"] as? String == saved.model else { throw SettingsError.message("文字模型配置已更改，请重试。") }
        let secret = try credential(capability.id + "|" + base.absoluteString)
        let inputs = packet["images"] as? [[String:String]] ?? []
        let endpoint = capability != .image ? "chat/completions" : inputs.isEmpty ? "images/generations" : "images/edits"
        var request = URLRequest(url:base.appendingPathComponent(endpoint))
        request.timeoutInterval = 240
        request.httpMethod = "POST"
        if capability == .image && !inputs.isEmpty {
            let boundary = UUID().uuidString
            var form = Data()
            func add(_ text: String) { form.append(Data(text.utf8)) }
            for (name,value) in body {
                add("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + String(describing:value) + "\r\n")
            }
            for (index,item) in inputs.enumerated() {
                guard let mime = item["mime"], ["image/png","image/jpeg","image/webp"].contains(mime),
                      let encoded = item["data"], let bytes = Data(base64Encoded:encoded) else { throw SettingsError.message("参考图格式无效") }
                add("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"ref-" + String(index) + "." + String(mime.dropFirst(6)) + "\"\r\nContent-Type: " + mime + "\r\n\r\n")
                form.append(bytes); add("\r\n")
            }
            add("--" + boundary + "--\r\n")
            request.httpBody = form
            request.setValue("multipart/form-data; boundary="+boundary,forHTTPHeaderField:"Content-Type")
        } else {
            request.httpBody = try JSONSerialization.data(withJSONObject:body)
            request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        }
        request.setValue("Bearer "+secret,forHTTPHeaderField:"Authorization")
        let transport = NoRedirect()
        let session = URLSession(configuration:.ephemeral,delegate:transport,delegateQueue:nil)
        let done = DispatchSemaphore(value:0)
        session.dataTask(with:request) { data,response,error in
            defer { done.signal() }
            guard error == nil, let http = response as? HTTPURLResponse else {
                var failure = ["failure":error?.localizedDescription ?? "连接服务失败"]
                if capability != .image && response == nil && (data == nil || data?.isEmpty == true) && transport.isUnsentHandshakeFailure(error) {
                    failure["retryCause"] = "tls-before-send"
                }
                reply(failure); return
            }
            guard (200..<300).contains(http.statusCode), let data = data else {
                reply(["failure":capability.rawValue + "接口 HTTP " + String(http.statusCode)]); return
            }
            if capability == .image {
                var result = try? JSONSerialization.jsonObject(with:data) as? [String:Any]
                result?["requestId"] = http.value(forHTTPHeaderField:"x-request-id")
                reply(result ?? ["failure":"生图服务未返回可读结果。"])
            } else { output.write(data) }
        }.resume()
        done.wait()
    } catch { reply(["failure":error.localizedDescription]) }
    exit(0)
}
let app = NSApplication.shared
let delegate = Desktop()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
