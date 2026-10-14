# Agent Core Browser Bridge

This unpacked Manifest V3 extension connects one explicitly selected existing Brave/Chromium tab to Agent Core. It does not launch a browser, copy a profile, read cookies or change login state. Agent Core remains the single browser action owner and HTTP runtime.

## Install once in the existing Brave window

1. Open `brave://extensions` in the Brave instance started by your existing portable launcher.
2. Enable **Developer mode**, choose **Load unpacked**, and select this directory.
3. Pin **Agent Core Browser Bridge** if useful. Installation grants the browser's debugger permission; connection still requires your action on the selected tab.

## Connect and disconnect

Ask Agent Core `browser_control` to open the intended URL with `transport: "extension"`. Open the intended existing HTTP(S) tab, click the extension, enter the returned one-use pairing code, and click **Connect selected tab**. The URL origin must match the requested origin. The bridge does not navigate or create a tab during connection.

The local Agent Core server must be running at `http://127.0.0.1:8765`. The extension only uses that loopback host; the public tunnel cannot pair or poll. Pairing codes expire in five minutes and are consumed once. Grant tokens remain in service-worker/Core RAM, never extension storage. Do not put codes or tokens in progress memory, reports or screenshots. Restarting either owner requires a new explicit pairing. No browser restart or repeated account login is required.

**Disconnect** or closing the Agent Core browser session detaches the debugger and retains the tab/browser. Browser detach/cancel, connection loss, expired grant or command timeout requires manual reconnection. Commands are delivered at most once and never replayed after an uncertain result. Held keys are released best effort before detach.

Version 1 supports the connected tab's main document, observed click/fill/select/scroll/wait actions, optional fixed keyboard/history operations, and bounded canvas evidence. It does not yet observe cross-origin iframe controls or switch to unconnected tabs. Existing isolated browser mode remains available explicitly. Browser-protected pages and conflicting debugger owners can refuse attachment; these remain concrete compatibility limits.

Implementation basis: [Chrome debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger) and [extension worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). No additional dependency, MCP server or orchestration daemon is introduced.
