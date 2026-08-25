using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

namespace Synctable.Native {
    public class WinLiveReader {
        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
        const uint GW_OWNER = 4;

        public class LiveTab {
            public int index;
            public string title;
            public string url;
            public bool isSelected;
            public bool isPinned;
            public bool isSplit;
            public string splitSide;
            public string groupName;
        }

        public class LiveWindow {
            public long hwnd;
            public uint pid;
            public string profileDirectory;
            public string title;
            public string activeUrl;
            public List<LiveTab> tabs = new List<LiveTab>();
        }

        private static string EscapeJson(string s) {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder sb = new StringBuilder();
            foreach (char c in s) {
                switch (c) {
                    case '\\': sb.Append("\\\\"); break;
                    case '\"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.AppendFormat("\\u{0:x4}", (int)c);
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }

        private static string GetProcessCommandLine(uint pid) {
            try {
                using (var searcher = new ManagementObjectSearcher(
                    string.Format("SELECT CommandLine FROM Win32_Process WHERE ProcessId = {0}", pid))) {
                    foreach (var @object in searcher.Get()) {
                        var cmd = @object["CommandLine"];
                        if (cmd != null) return cmd.ToString();
                    }
                }
            } catch {
                // Ignore WMI errors
            }
            return "";
        }

        private static string ExtractProfileFromCommandLine(string cmdLine) {
            if (string.IsNullOrEmpty(cmdLine)) return "";
            string key = "--profile-directory=\"";
            int idx = cmdLine.IndexOf(key, StringComparison.OrdinalIgnoreCase);
            if (idx >= 0) {
                int start = idx + key.Length;
                int end = cmdLine.IndexOf("\"", start);
                if (end > start) return cmdLine.Substring(start, end - start);
            }

            string key2 = "--profile-directory=";
            int idx2 = cmdLine.IndexOf(key2, StringComparison.OrdinalIgnoreCase);
            if (idx2 >= 0) {
                int start = idx2 + key2.Length;
                int end = cmdLine.IndexOf(" ", start);
                if (end > start) return cmdLine.Substring(start, end - start);
                return cmdLine.Substring(start);
            }

            return "";
        }

        private static string GetLastUsedChromeProfile() {
            try {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string localStateFile = Path.Combine(localAppData, "Google", "Chrome", "User Data", "Local State");
                if (File.Exists(localStateFile)) {
                    string content = File.ReadAllText(localStateFile);
                    string needle = "\"last_used\":\"";
                    int idx = content.IndexOf(needle);
                    if (idx >= 0) {
                        int start = idx + needle.Length;
                        int end = content.IndexOf("\"", start);
                        if (end > start) return content.Substring(start, end - start);
                    }
                }
            } catch {}
            return "Default";
        }

        public static void Main(string[] args) {
            string browserTarget = "chrome";
            if (args.Length > 0 && !string.IsNullOrEmpty(args[0])) {
                browserTarget = args[0].ToLower().TrimStart('-');
            }

            List<LiveWindow> windows = new List<LiveWindow>();
            Dictionary<uint, string> pidToProfile = new Dictionary<uint, string>();
            string defaultProfile = GetLastUsedChromeProfile();

            EnumWindows((hWnd, lParam) => {
                if (!IsWindowVisible(hWnd)) return true;
                if (GetWindow(hWnd, GW_OWNER) != IntPtr.Zero) return true;

                StringBuilder sbClass = new StringBuilder(256);
                GetClassName(hWnd, sbClass, 256);
                if (sbClass.ToString() != "Chrome_WidgetWin_1") return true;

                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                try {
                    Process p = Process.GetProcessById((int)pid);
                    string procName = p.ProcessName.ToLower();
                    if (!procName.Contains(browserTarget)) return true;
                } catch {
                    return true;
                }

                StringBuilder sbTitle = new StringBuilder(512);
                GetWindowText(hWnd, sbTitle, 512);
                string winTitle = sbTitle.ToString();
                if (string.IsNullOrEmpty(winTitle)) return true;

                try {
                    AutomationElement root = AutomationElement.FromHandle(hWnd);
                    if (root == null) return true;

                    // Address bar (Edit control)
                    string activeUrl = "";
                    Condition editCond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit);
                    AutomationElementCollection edits = root.FindAll(TreeScope.Descendants, editCond);
                    foreach (AutomationElement edit in edits) {
                        object vp;
                        if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out vp)) {
                            string val = ((ValuePattern)vp).Current.Value;
                            if (!string.IsNullOrEmpty(val) && (val.Contains(".") || val.Contains(":/") || val.Contains("localhost"))) {
                                activeUrl = val;
                                break;
                            }
                        }
                    }

                    // Tab items
                    Condition tabCond = new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem);
                    AutomationElementCollection tabItems = root.FindAll(TreeScope.Descendants, tabCond);
                    if (tabItems.Count == 0) return true;

                    if (!pidToProfile.ContainsKey(pid)) {
                        string cmd = GetProcessCommandLine(pid);
                        string prof = ExtractProfileFromCommandLine(cmd);
                        if (string.IsNullOrEmpty(prof)) prof = defaultProfile;
                        pidToProfile[pid] = prof;
                    }

                    LiveWindow win = new LiveWindow {
                        hwnd = hWnd.ToInt64(),
                        pid = pid,
                        profileDirectory = pidToProfile[pid],
                        title = winTitle,
                        activeUrl = activeUrl
                    };

                    int tabIndex = 0;
                    for (int i = 0; i < tabItems.Count; i++) {
                        AutomationElement tab = tabItems[i];
                        string rawName = tab.Current.Name;
                        string className = tab.Current.ClassName;

                        if (className != null && className != "Tab" && !className.Contains("Tab")) {
                            continue;
                        }

                        if (string.IsNullOrEmpty(rawName) || rawName.Trim() == "" || rawName.StartsWith("New Tab")) {
                            continue;
                        }

                        bool isPinned = false;
                        bool isSplit = false;
                        string splitSide = "";
                        string cleanTitle = rawName;

                        if (cleanTitle.EndsWith(" - Pinned", StringComparison.OrdinalIgnoreCase)) {
                            isPinned = true;
                            cleanTitle = cleanTitle.Substring(0, cleanTitle.Length - 9);
                        }
                        if (cleanTitle.EndsWith(" - Left view", StringComparison.OrdinalIgnoreCase)) {
                            isSplit = true;
                            splitSide = "left";
                            cleanTitle = cleanTitle.Substring(0, cleanTitle.Length - 12);
                        } else if (cleanTitle.EndsWith(" - Right view", StringComparison.OrdinalIgnoreCase)) {
                            isSplit = true;
                            splitSide = "right";
                            cleanTitle = cleanTitle.Substring(0, cleanTitle.Length - 13);
                        }
                        if (cleanTitle.EndsWith(" - Audio playing", StringComparison.OrdinalIgnoreCase)) {
                            cleanTitle = cleanTitle.Substring(0, cleanTitle.Length - 16);
                        } else if (cleanTitle.EndsWith(" - Audio muted", StringComparison.OrdinalIgnoreCase)) {
                            cleanTitle = cleanTitle.Substring(0, cleanTitle.Length - 14);
                        }

                        object selPattern;
                        bool isSelected = false;
                        if (tab.TryGetCurrentPattern(SelectionItemPattern.Pattern, out selPattern)) {
                            isSelected = ((SelectionItemPattern)selPattern).Current.IsSelected;
                        }

                        string tabUrl = isSelected ? activeUrl : "";
                        win.tabs.Add(new LiveTab {
                            index = tabIndex++,
                            title = cleanTitle,
                            url = tabUrl,
                            isSelected = isSelected,
                            isPinned = isPinned,
                            isSplit = isSplit,
                            splitSide = splitSide,
                            groupName = ""
                        });
                    }

                    if (win.tabs.Count > 0) {
                        windows.Add(win);
                    }
                } catch {
                    // Ignore transient accessibility errors
                }

                return true;
            }, IntPtr.Zero);

            // Serialize to JSON
            StringBuilder json = new StringBuilder();
            json.Append("[");
            for (int w = 0; w < windows.Count; w++) {
                if (w > 0) json.Append(",");
                LiveWindow win = windows[w];
                json.Append("{");
                json.AppendFormat("\"hwnd\":{0},\"pid\":{1},\"profileDirectory\":\"{2}\",\"title\":\"{3}\",\"activeUrl\":\"{4}\",\"tabs\":[",
                    win.hwnd, win.pid, EscapeJson(win.profileDirectory), EscapeJson(win.title), EscapeJson(win.activeUrl));

                for (int t = 0; t < win.tabs.Count; t++) {
                    if (t > 0) json.Append(",");
                    LiveTab tab = win.tabs[t];
                    json.AppendFormat("{{\"index\":{0},\"title\":\"{1}\",\"url\":\"{2}\",\"isSelected\":{3},\"isPinned\":{4},\"isSplit\":{5},\"splitSide\":\"{6}\",\"groupName\":\"{7}\"}}",
                        tab.index, EscapeJson(tab.title), EscapeJson(tab.url),
                        tab.isSelected ? "true" : "false",
                        tab.isPinned ? "true" : "false",
                        tab.isSplit ? "true" : "false",
                        EscapeJson(tab.splitSide),
                        EscapeJson(tab.groupName));
                }
                json.Append("]}");
            }
            json.Append("]");

            Console.OutputEncoding = Encoding.UTF8;
            Console.WriteLine(json.ToString());
        }
    }
}
