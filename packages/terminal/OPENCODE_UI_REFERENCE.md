# OpenCode TUI Architecture Reference

This document describes the TUI architecture of [OpenCode](https://github.com/opencode-ai/opencode), a Go-based terminal AI coding assistant built with [Bubble Tea](https://github.com/charmbracelet/bubbletea) and [Lip Gloss](https://github.com/charmbracelet/lipgloss). Use this as a reference when building or modifying the open-assistants terminal UI.

Source: `/Users/hasna/Workspace/hasnaxyz/community/community-opencode/internal/tui/`

---

## 1. Layout Architecture

### Split-Pane System

The core layout is a **split-pane** system (`layout/split.go`) with three panels:

- **Left Panel** (primary content area) — takes `ratio` of total width (default `0.7` = 70%)
- **Right Panel** (sidebar) — takes remaining width (default 30%)
- **Bottom Panel** — takes `1 - verticalRatio` of total height (default 10%, top gets 90%)

```
+------------------------------+----------+
|                              |          |
|    Left Panel (70%)          |  Right   |
|    (messages viewport)       |  Panel   |
|                              | (sidebar)|
|                              |  (30%)   |
+------------------------------+----------+
|        Bottom Panel (editor, border-top)|
+------------------------------------------+
|             Status Bar (1 row)           |
+------------------------------------------+
```

### Chat Page Layout

In the chat page (`page/chat.go`), the layout is constructed as:

```go
layout.NewSplitPane(
    layout.WithLeftPanel(messagesContainer),   // padding(1,1,0,1)
    layout.WithBottomPanel(editorContainer),   // border-top only
)
```

- The sidebar (right panel) is **only added when a session is selected** — it is absent on the initial screen.
- The sidebar container has `padding(1,1,1,1)`.
- The status bar occupies the final 1 row (deducted in `WindowSizeMsg` handler: `msg.Height -= 1`).

### Container System

Containers (`layout/container.go`) wrap any `tea.Model` with styling options:
- `WithPadding(top, right, bottom, left)`
- `WithBorder(top, right, bottom, left)` with `NormalBorder()` default
- `WithRoundedBorder()`, `WithThickBorder()`, `WithDoubleBorder()`
- Containers auto-adjust child size by subtracting padding and border widths.

### Overlay System

Dialogs/modals use `layout.PlaceOverlay(col, row, fg, bg, shadow)` (`layout/overlay.go`):
- Places foreground string on top of background string at `(col, row)`.
- When `shadow=true`, renders a `"░"` shadow in `BackgroundDarker()` color below and right of the overlay.
- All dialogs are centered: `col = width/2 - overlayWidth/2`, `row = height/2 - overlayHeight/2`.

### Sizeable & Focusable Interfaces

```go
type Sizeable interface {
    SetSize(width, height int) tea.Cmd
    GetSize() (int, int)
}

type Focusable interface {
    Focus() tea.Cmd
    Blur() tea.Cmd
    IsFocused() bool
}

type Bindings interface {
    BindingKeys() []key.Binding
}
```

---

## 2. Component Hierarchy

```
appModel (tui.go)
├── pages map[PageID]tea.Model
│   ├── ChatPage (page/chat.go)
│   │   ├── SplitPaneLayout
│   │   │   ├── Left: Container(MessagesCmp)    — chat/list.go
│   │   │   ├── Right: Container(SidebarCmp)    — chat/sidebar.go (added on session select)
│   │   │   └── Bottom: Container(EditorCmp)    — chat/editor.go
│   │   └── CompletionDialog                    — dialog/complete.go
│   └── LogsPage (page/logs.go)
│       ├── Container(LogsTable)                — logs/table.go
│       └── Container(LogsDetails)              — logs/details.go
├── StatusCmp (core/status.go)                  — always visible, bottom row
└── Dialogs (overlays, shown/hidden via booleans)
    ├── PermissionDialogCmp                     — dialog/permission.go
    ├── HelpCmp                                 — dialog/help.go
    ├── QuitDialog                              — dialog/quit.go
    ├── SessionDialog                           — dialog/session.go
    ├── CommandDialog                           — dialog/commands.go
    ├── ModelDialog                             — dialog/models.go
    ├── InitDialogCmp                           — dialog/init.go
    ├── FilepickerCmp                           — dialog/filepicker.go
    ├── ThemeDialog                             — dialog/theme.go
    └── MultiArgumentsDialogCmp                 — dialog/arguments.go
```

---

## 3. Color Palette (OpenCode Default Theme)

All colors use `lipgloss.AdaptiveColor` with separate dark/light variants.

### Dark Mode

| Role                | Hex       | Description              |
|---------------------|-----------|--------------------------|
| Background          | `#212121` | Main background          |
| BackgroundSecondary | `#252525` | Current line / alt bg    |
| BackgroundDarker    | `#121212` | Shadow, overlay bg       |
| Text                | `#e0e0e0` | Primary text             |
| TextMuted           | `#6a6a6a` | Comments, secondary text |
| TextEmphasized      | `#e5c07b` | Highlighted text         |
| Primary             | `#fab283` | Orange/gold brand color  |
| Secondary           | `#5c9cf5` | Blue accent              |
| Accent              | `#9d7cd8` | Purple accent            |
| Error               | `#e06c75` | Red                      |
| Warning             | `#f5a742` | Orange                   |
| Success             | `#7fd88f` | Green                    |
| Info                | `#56b6c2` | Cyan                     |
| Border              | `#4b4c5c` | Normal border            |
| BorderFocused       | `#fab283` | Focused border (=Primary)|
| BorderDim           | `#303030` | Dim/selection border     |

### Light Mode

| Role                | Hex       | Description              |
|---------------------|-----------|--------------------------|
| Background          | `#f8f8f8` | Main background          |
| BackgroundSecondary | `#f0f0f0` | Alt bg                   |
| BackgroundDarker    | `#ffffff` | Lighter for shadows      |
| Text                | `#2a2a2a` | Primary text             |
| TextMuted           | `#8a8a8a` | Comments, secondary text |
| TextEmphasized      | `#b0851f` | Highlighted text         |
| Primary             | `#3b7dd8` | Blue brand color         |
| Secondary           | `#7b5bb6` | Purple accent            |
| Accent              | `#d68c27` | Orange/gold accent       |
| Error               | `#d1383d` | Red                      |
| Warning             | `#d68c27` | Orange                   |
| Success             | `#3d9a57` | Green                    |
| Info                | `#318795` | Cyan                     |
| Border              | `#d3d3d3` | Normal border            |
| BorderFocused       | `#3b7dd8` | Focused border (=Primary)|
| BorderDim           | `#e5e5e6` | Dim/selection border     |

### Diff Colors (Dark)

| Role                  | Hex       |
|-----------------------|-----------|
| DiffAdded             | `#478247` |
| DiffRemoved           | `#7C4444` |
| DiffAddedBg           | `#303A30` |
| DiffRemovedBg         | `#3A3030` |
| DiffHighlightAdded    | `#DAFADA` |
| DiffHighlightRemoved  | `#FADADD` |
| DiffContext            | `#a0a0a0` |
| DiffLineNumber        | `#888888` |

### Available Themes

OpenCode ships 9 themes, registered via `init()` in each file:
- `opencode` (default)
- `catppuccin`
- `dracula`
- `flexoki`
- `gruvbox`
- `monokai`
- `onedark`
- `tokyonight`
- `tron`

Themes are stored in a global `Manager` singleton, switchable at runtime via `theme.SetTheme(name)`.

---

## 4. Keyboard Shortcuts

### Global Shortcuts (always active)

| Key        | Action                |
|------------|----------------------|
| `ctrl+c`   | Toggle quit dialog   |
| `ctrl+l`   | Switch to logs page  |
| `ctrl+?`/`ctrl+h` | Toggle help overlay |
| `ctrl+s`   | Switch session dialog|
| `ctrl+k`   | Commands palette     |
| `ctrl+f`   | File picker          |
| `ctrl+o`   | Model selection      |
| `ctrl+t`   | Switch theme         |
| `esc`       | Close dialog/go back |

### Chat Page Shortcuts

| Key        | Action                |
|------------|----------------------|
| `@`        | Open completion dialog |
| `ctrl+n`   | New session           |
| `esc`      | Cancel generation     |

### Editor Shortcuts

| Key            | Action                          |
|----------------|--------------------------------|
| `enter`/`ctrl+s` | Send message                 |
| `ctrl+e`       | Open external editor ($EDITOR) |
| `ctrl+r`       | Delete attachment mode         |
| `ctrl+r+{i}`   | Delete attachment at index i   |
| `ctrl+r+r`     | Delete all attachments         |

### Message List Shortcuts

| Key        | Action           |
|------------|-----------------|
| `pgup`     | Page up          |
| `pgdown`   | Page down        |
| `ctrl+u`   | Half page up     |
| `ctrl+d`   | Half page down   |

### Quit Dialog

| Key            | Action           |
|----------------|-----------------|
| `←`/`→`/`tab`  | Switch Yes/No   |
| `enter`/`space` | Confirm         |
| `y`/`Y`         | Quit            |
| `n`/`N`         | Cancel          |

### Logs Page

| Key           | Action   |
|---------------|---------|
| `esc`/`q`/`backspace` | Go back |

---

## 5. How Modals/Dialogs Work

All dialogs follow the same pattern:

1. **State**: `appModel` has a `showXxx bool` and an `xxxDialog` component for each dialog.
2. **Toggle**: A key press or message sets `showXxx = true`.
3. **Blocking**: When a dialog is shown, key messages are consumed by the dialog and NOT forwarded to the page underneath. Other messages (pubsub events, window resize) pass through.
4. **Rendering**: In `View()`, if `showXxx` is true, the dialog's `View()` is rendered as an overlay via `PlaceOverlay()`, centered on screen with optional shadow.
5. **Close**: Dialog sends a `CloseXxxMsg{}`, caught by `appModel.Update()` which sets `showXxx = false`.

Dialog overlay rendering order (later = on top):
1. Permission dialog
2. File picker
3. Compacting status
4. Help overlay
5. Quit dialog
6. Session dialog
7. Model dialog
8. Command dialog
9. Init dialog
10. Theme dialog
11. Multi-arguments dialog

### Dialog Components

- **QuitDialog**: Yes/No buttons, rounded border, centered.
- **HelpCmp**: Multi-column layout of all key bindings, dynamically populated from page + global bindings.
- **PermissionDialogCmp**: 3-option (Allow, Allow for Session, Deny) with viewport for command/diff preview.
- **SessionDialog**: Filterable list of sessions.
- **CommandDialog**: Filterable list of commands (built-in + custom from `.opencode/commands/`).
- **ModelDialog**: Filterable list of LLM models.
- **FilepickerCmp**: File browser with CWD navigation.
- **ThemeDialog**: Filterable list of available themes.
- **CompletionDialog**: `@`-triggered file/folder completion dropdown, positioned above the editor.
- **InitDialogCmp**: First-run dialog to create OpenCode.md.
- **MultiArgumentsDialogCmp**: Form for custom command arguments ($name placeholders).

---

## 6. How Messages Are Rendered

### Message Types

Messages in `chat/message.go` are categorized into UI message types:
- `userMessageType` — user input
- `assistantMessageType` — LLM response
- `toolMessageType` — tool call + result

### User Messages

Rendered via `renderUserMessage()`:
- Left thick border in `Secondary()` color (blue).
- Content passed through markdown renderer (glamour).
- Attachments shown as inline badges with document icon.

### Assistant Messages

Rendered via `renderAssistantMessage()`:
- Left thick border in `Primary()` color (orange/gold).
- Content passed through markdown renderer.
- Finish info appended: model name + duration (e.g. "Claude 4 Opus (2.3s)").
- If cancelled/errored, shows status instead of duration.
- If thinking content exists (no main content yet), renders thinking text.

### Tool Calls

Rendered via `renderToolMessage()`:
- Left thick border in `TextMuted()` color.
- Header: tool name + params (truncated to fit width).
- Each tool type has custom param rendering: Bash shows command, Edit/Write shows file path, Glob/Grep shows pattern, etc.
- Tool response rendering is type-specific:
  - **Bash**: Response in ` ```bash ` code block.
  - **Edit**: Formatted diff view with add/remove highlighting.
  - **View/Write**: File content in language-specific code block.
  - **Fetch**: Content in format-specific code block (markdown/html/text).
  - **Glob/Grep/LS/Sourcegraph**: Plain muted text.
  - **Agent (Task)**: Markdown-rendered subtask output, with nested tool calls shown with `" └ "` prefix.
- Errors shown in `Error()` color, truncated to one line.
- Max result height: 10 lines (truncated).

### Working Indicator

When the agent is busy, a spinner (`spinner.Pulse`) shows below messages with context-aware status:
- "Thinking..." (default)
- "Waiting for tool response..." (tool calls sent, no response)
- "Building tool call..." (unfinished tool calls)
- "Generating..." (assistant message streaming)

### Message Caching

Messages are cached by ID + width. Cache is invalidated when:
- Width changes (re-render all).
- Message is updated (delta streaming).
- Theme changes (clear all caches, re-render).
- New message arrives (invalidate last message to update finish info).

---

## 7. How the Input Editor Works

The editor (`chat/editor.go`) uses `bubbles/textarea` with custom styling:

### Configuration
- No line numbers (`ShowLineNumbers = false`)
- Unlimited character limit (`CharLimit = -1`)
- Custom prompt: `" "` (space) — the visible `">"` prompt is rendered separately.
- Styles use theme colors for base, cursor line, placeholder, and text.

### Behavior
- **Send**: `enter` or `ctrl+s` sends the message (calls `send()`).
- **Newline**: Type `\` at end of line + enter to add a newline instead of sending.
- **External editor**: `ctrl+e` opens `$EDITOR` (defaults to nvim) with a temp file; content becomes the message.
- **Attachments**: Up to 5 attachments shown as inline badges above the textarea. `ctrl+r` enters delete mode, then press digit to delete specific attachment or `r` for all.

### Layout
```
[Attachments row (if any)]
[> textarea                ]
```

The editor container has `border(top, false, false, false)` — only a top border separating it from the messages area.

---

## 8. How the Status Bar Works

The status bar (`core/status.go`) is a single row at the bottom of the screen:

### Layout (left to right)
```
[ctrl+? help] [Context: 1.2K, Cost: $0.03] [info/warn/error message...] [diagnostics] [Model Name]
```

### Sections
1. **Help widget**: `"ctrl+? help"` with `TextMuted` bg, `BackgroundDarker` fg, bold.
2. **Token info** (shown when session active): Total tokens + cost. Background turns `Warning()` when >80% of context window used. Shows warning icon + percentage when >80%.
3. **Info/status message**: Fills remaining width. Colors depend on type: `Info()` blue, `Warning()` orange, `Error()` red. Messages auto-clear after 10s (configurable TTL).
4. **Diagnostics**: LSP diagnostic counts with icons: `ErrorIcon` red, `WarningIcon` orange, `HintIcon` normal, `InfoIcon` blue. Shows "Initializing LSP..." during startup.
5. **Model name**: Current model displayed in `Secondary()` bg, `Background()` fg.

### Behavior
- Status messages arrive via `util.InfoMsg` and auto-clear via `clearMessageCmd` with configurable TTL.
- Session token counts update on `pubsub.Event[session.Session]`.
- LSP diagnostics aggregate from all configured LSP clients.

---

## 9. How the Sidebar Works

The sidebar (`chat/sidebar.go`) appears in the right panel only when a session is active:

### Sections (top to bottom)
1. **Logo + version**: OpenCode icon + version text.
2. **Repo URL**: GitHub link in muted text.
3. **CWD**: Current working directory.
4. **Session**: Session title.
5. **LSP Configuration**: List of configured LSP servers.
6. **Modified Files**: Git-style diff stats per file (green `+N`, red `-N`), sorted alphabetically.

### Modified Files Tracking
- Uses `history.Service` to track file changes within a session.
- Calculates diffs between initial version and latest version of each file.
- Updates incrementally on `pubsub.Event[history.File]` events.
- Displays relative paths (working directory prefix stripped).

---

## 10. Icons

Defined in `styles/icons.go`:

| Constant     | Character |
|-------------|-----------|
| OpenCodeIcon | `⌬`       |
| CheckIcon    | `✓`       |
| ErrorIcon    | `✖`       |
| WarningIcon  | `⚠`       |
| InfoIcon     | `` (empty)|
| HintIcon     | `i`       |
| SpinnerIcon  | `...`     |
| LoadingIcon  | `⟳`       |
| DocumentIcon | `🖼`      |

---

## 11. Markdown Rendering

Uses [glamour](https://github.com/charmbracelet/glamour) with a custom `ansi.StyleConfig` generated from the active theme (`styles/markdown.go`):

- Headings: `MarkdownHeading` color (Secondary), bold, with `#` prefix.
- Block quotes: `MarkdownBlockQuote` color, italic, `"┃ "` prefix.
- List items: `"• "` prefix, `MarkdownListItem` color.
- Code blocks: Full Chroma syntax highlighting using theme's `Syntax*` colors.
- Links: `MarkdownLink` color, underlined.
- Tables: Box-drawing characters (`│`, `─`, `┼`).
- Background: Force-replaced to match theme background via `ForceReplaceBackgroundWithLipgloss()`.

---

## 12. Styles System

### Base Style
```go
func BaseStyle() lipgloss.Style {
    return lipgloss.NewStyle().
        Background(t.Background()).
        Foreground(t.Text())
}
```

All components use `BaseStyle()` as the starting point, then customize with theme colors.

### Background Replacement
`ForceReplaceBackgroundWithLipgloss()` in `styles/background.go` is a critical function that post-processes ANSI output from glamour/chroma to replace all background color codes with the theme's background color. This ensures code blocks and markdown don't have mismatched backgrounds.

---

## 13. Key Architectural Patterns

1. **Elm Architecture**: Every component follows Bubble Tea's `Init() -> Update(msg) -> View()` pattern.
2. **Message blocking**: Dialogs consume `tea.KeyMsg` but pass through all other messages (pubsub events, window resize).
3. **PubSub integration**: Real-time updates from sessions, messages, and files via `pubsub.Event[T]` messages.
4. **Theme reactivity**: Components receive `ThemeChangedMsg` and rebuild styles/clear caches.
5. **Overlay pattern**: All dialogs are overlays (not page changes). Multiple can theoretically be shown but are mutually exclusive via boolean flags.
6. **Content caching**: Message rendering is cached by (messageID, width). Cache invalidation is surgical (only affected messages).
7. **Auto-compact**: When token usage exceeds 95% of context window, automatically triggers session summarization.
