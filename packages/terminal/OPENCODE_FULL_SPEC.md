# OpenCode TUI - Complete Implementation Specification

This document is a pixel-perfect specification of the OpenCode terminal UI, derived from a complete reading of all 48 Go source files (11,601 lines) in `internal/tui/`. A developer can build an exact clone from this spec without ever looking at the Go code.

---

## 1. Application Architecture

### 1.1 Component Hierarchy

```
appModel (tui.go)
  +-- pages: map[PageID]tea.Model
  |     +-- ChatPage (page/chat.go)
  |     |     +-- layout: SplitPaneLayout
  |     |     |     +-- leftPanel: Container(MessagesCmp)  [padding: 1,1,0,1]
  |     |     |     +-- rightPanel: Container(SidebarCmp)  [padding: 1,1,1,1]  (only when session active)
  |     |     |     +-- bottomPanel: Container(EditorCmp)  [border-top only]
  |     |     +-- completionDialog: CompletionDialog (overlay)
  |     +-- LogsPage (page/logs.go)
  |           +-- table: Container(LogsTable) [border-all]
  |           +-- details: Container(LogsDetails) [border-all]
  +-- status: StatusCmp (always visible, 1 row at bottom)
  +-- [overlays - centered on screen]:
        +-- permissions: PermissionDialogCmp
        +-- help: HelpCmp
        +-- quit: QuitDialog
        +-- sessionDialog: SessionDialog
        +-- commandDialog: CommandDialog
        +-- modelDialog: ModelDialog
        +-- initDialog: InitDialogCmp
        +-- filepicker: FilepickerCmp
        +-- themeDialog: ThemeDialog
        +-- multiArgumentsDialog: MultiArgumentsDialogCmp
        +-- [compacting overlay - inline styled]
```

### 1.2 Page System

Two pages exist:

| PageID | Value | Description |
|--------|-------|-------------|
| `ChatPage` | `"chat"` | Main chat interface (default start page) |
| `LogsPage` | `"logs"` | Log viewer |

The status bar always consumes 1 row. On `WindowSizeMsg`, the app subtracts 1 from height before passing to pages: `msg.Height -= 1`.

---

## 2. Layout System

### 2.1 SplitPaneLayout (layout/split.go)

The main layout engine. It supports left, right, and bottom panels.

**Default ratios:**
- Horizontal ratio (left/right): `0.7` (70% left, 30% right)
- Vertical ratio (top/bottom): `0.9` (90% top section, 10% bottom)

**Size calculation:**
```
topHeight = height * verticalRatio      (when bottomPanel exists)
bottomHeight = height - topHeight
leftWidth = width * ratio               (when both panels exist)
rightWidth = width - leftWidth
```

When only leftPanel exists (no sidebar yet), leftPanel gets full width. When rightPanel is added (session started), the 70/30 split activates.

**Rendering order:** Left and right are joined horizontally (aligned to Top), then the top section and bottom are joined vertically (aligned to Left). The entire view is wrapped in a style with `Width(s.width)`, `Height(s.height)`, `Background(t.Background())`.

### 2.2 Container (layout/container.go)

Wraps any tea.Model with padding and borders.

**Properties:**
- `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` (integers)
- `borderTop`, `borderRight`, `borderBottom`, `borderLeft` (booleans)
- `borderStyle` (default: `lipgloss.NormalBorder()`)

**Rendering:**
- Border foreground: `t.BorderNormal()`
- Border background: `t.Background()`
- Background: `t.Background()`
- Size adjustments: borders consume 1 cell each side they're enabled; padding is applied inside borders

**Content size = container size - borders - padding**

### 2.3 Overlay System (layout/overlay.go)

All dialogs are overlaid using `PlaceOverlay(x, y, fg, bg, shadow)`.

**Positioning formula (used by every dialog):**
```
row = appViewHeight / 2 - overlayHeight / 2
col = appViewWidth / 2 - overlayWidth / 2
```

**Shadow effect** (when `shadow=true`):
- A shadow layer is created with the same dimensions as the overlay + 1 row
- First row of shadow: background-colored spaces (invisible)
- Remaining rows: `"░"` characters styled with `Background(t.BackgroundDarker())`, `Foreground(t.Background())`
- The overlay is placed on top of the shadow at (0,0), then the combined result is placed on the app view

**Overlay render order (back to front):**
1. Base page view + status bar (joined vertically, aligned Top)
2. Permissions dialog (if showing)
3. Filepicker dialog (if showing)
4. Compacting status overlay (if compacting)
5. Help dialog (if showing)
6. Quit dialog (if showing)
7. Session dialog (if showing)
8. Model dialog (if showing)
9. Command dialog (if showing)
10. Init dialog (if showing)
11. Theme dialog (if showing)
12. Multi-arguments dialog (if showing)

---

## 3. Chat Page Layout (page/chat.go)

### 3.1 Structure

```
SplitPaneLayout (no explicit ratio override - uses defaults 0.7 horizontal, 0.9 vertical)
  +-- leftPanel: Container(MessagesCmp)
  |     padding: top=1, right=1, bottom=0, left=1
  |     no border
  +-- rightPanel: Container(SidebarCmp)  [only when session exists]
  |     padding: top=1, right=1, bottom=1, left=1
  |     no border
  +-- bottomPanel: Container(EditorCmp)
        border: top=true, right=false, bottom=false, left=false
        border style: NormalBorder (default)
        no padding
```

**Completion dialog overlay:** When `@` is typed, a completion dialog appears above the editor:
```
position: x=0, y=(layoutHeight - editorHeight - completionOverlayHeight)
shadow: false
```

### 3.2 Sidebar Activation

The sidebar (rightPanel) is NOT present initially. It is added when a session is first selected (`SessionSelectedMsg`). When `ctrl+n` creates a new session, the sidebar is cleared via `ClearRightPanel()`.

When sidebar is absent, the leftPanel (messages) takes the full width. When present, the 70/30 split engages.

---

## 4. Messages Component (chat/list.go)

### 4.1 Structure

Uses a `viewport.Model` for scrollable content. The viewport height is `height - 2` (leaving room for the working indicator and help text).

### 4.2 Initial Screen (No Messages)

When no messages exist, the initial screen renders:

```
[Logo line]       "opencode-icon OpenCode version-text"
[Repo line]       "https://github.com/opencode-ai/opencode"
[Empty line]
[CWD line]        "cwd: /path/to/working/directory"
[Empty line]
[LSP Config]      "LSP Configuration" (bold, primary color)
                  "  name (command)" per configured LSP
[Empty spacer to fill height-1]
[Help text]
```

**Logo:** `"⌬ OpenCode"` (bold) + space + version (muted text color)
**Repo:** `"https://github.com/opencode-ai/opencode"` in muted text
**CWD:** `"cwd: {path}"` in muted text

All elements use `BaseStyle()` which is `Background(t.Background()) + Foreground(t.Text())`.

### 4.3 Message Rendering

Messages are rendered sequentially with an empty spacer line between each.

#### User Messages

```
Style: BaseStyle()
  .Width(width - 1)
  .BorderLeft(true)
  .Foreground(t.TextMuted())
  .BorderForeground(t.Secondary())    <-- SECONDARY color for user
  .BorderStyle(lipgloss.ThickBorder())

Content: Markdown-rendered text
  + optional attachment badges (if binary content)
  + background forced to t.Background()
```

The left thick border uses the theme's **Secondary** color for user messages.

#### Assistant Messages

```
Style: BaseStyle()
  .Width(width - 1)
  .BorderLeft(true)
  .Foreground(t.TextMuted())
  .BorderForeground(t.Primary())      <-- PRIMARY color for assistant
  .BorderStyle(lipgloss.ThickBorder())

Content: Markdown-rendered text
  + finish info line (model name + duration/status)
  + background forced to t.Background()
```

The left thick border uses the theme's **Primary** color for assistant messages.

**Finish info line** (shown when message is complete):
- End turn: `" ModelName (duration)"` in TextMuted
- Canceled: `" ModelName (canceled)"` in TextMuted
- Error: `" ModelName (error)"` in TextMuted
- Permission denied: `" ModelName (permission denied)"` in TextMuted
- Summary: additional `" (summary)"` in TextMuted

**Duration format:**
- < 1 second: `"Nms"`
- < 60 seconds: `"N.Ns"`
- >= 60 seconds: `"N.Nm"`

#### Tool Call Messages

```
Style: BaseStyle()
  .Width(width - 1)
  .BorderLeft(true)
  .BorderStyle(lipgloss.ThickBorder())
  .PaddingLeft(1)
  .BorderForeground(t.TextMuted())    <-- MUTED for tool calls

Content:
  Line 1: "ToolName: params" (both in TextMuted)
  Remaining: Tool response content
```

**Tool names displayed:**
| Internal Name | Display Name |
|--------------|--------------|
| agent | Task |
| bash | Bash |
| edit | Edit |
| fetch | Fetch |
| glob | Glob |
| grep | Grep |
| ls | List |
| sourcegraph | Sourcegraph |
| view | View |
| write | Write |
| patch | Patch |

**Tool response rendering by type:**
- **Bash**: Content wrapped in ` ```bash ... ``` ` markdown code block
- **Edit**: Formatted diff view (using diff package)
- **View**: Content wrapped in ` ```{ext} ... ``` ` with file extension for syntax highlighting
- **Write**: Content wrapped in ` ```{ext} ... ``` `
- **Fetch**: Content wrapped in ` ```{format} ... ``` ` (markdown/text/html)
- **Glob/Grep/LS/Sourcegraph**: Plain text in TextMuted color
- **Task (agent)**: Markdown rendered, with nested tool calls shown with ` └ ` prefix
- **Error responses**: `"Error: message"` in `t.Error()` color
- **Default**: Content wrapped in ` ```text ... ``` `

**Max result height:** 10 lines (content is truncated)

**Nested tool calls** (from agent/task): Rendered 3 cells narrower (`width - 3`), with ` └ ` prefix, no response content shown

**In-progress tool calls:**
```
"ToolName: Building command..." / "Preparing edit..." / etc.
```
(in TextMuted color)

### 4.4 Working Indicator

Shown when agent is busy, below the viewport:

```
"{spinner} {task}"
Style: Width(width), Foreground(t.Primary()), Bold(true)
Spinner: spinner.Pulse
```

Task text:
- Default: `"Thinking..."`
- Has tools without response: `"Waiting for tool response..."`
- Has unfinished tool calls: `"Building tool call..."`
- Last message not finished: `"Generating..."`

### 4.5 Help Text

Always visible at the bottom of the messages area:

**When agent is busy:**
```
"press " + "esc" + " to exit cancel"
```
(muted/bold for "press", text/bold for "esc", muted/bold for rest)

**When agent is idle:**
```
"press " + "enter" + " to send the message," + " write" + " \" + " and enter to add a new line"
```

---

## 5. Editor Component (chat/editor.go)

### 5.1 Structure

A `textarea.Model` from charmbracelet/bubbles with a prompt prefix.

**Textarea configuration:**
```
Prompt: " "              (single space - the visible prompt ">" is rendered separately)
ShowLineNumbers: false
CharLimit: -1             (unlimited)
Focused: true             (always focused by default)
```

**Textarea styles (both Focused and Blurred identical):**
```
Base:        Background(t.Background()), Foreground(t.Text())
CursorLine:  Background(t.Background())
Placeholder: Background(t.Background()), Foreground(t.TextMuted())
Text:        Background(t.Background()), Foreground(t.Text())
```

### 5.2 Layout

**Without attachments:**
```
[ ">" prompt ] [ textarea ]
```
Joined horizontally, aligned to Top.

Prompt style: `Padding(0, 0, 0, 1)`, Bold, `Foreground(t.Primary())`

**With attachments:**
```
[ attachment badges row ]
[ ">" prompt ] [ textarea ]
```
Joined vertically, textarea height reduced by 1.

**Attachment badge style:**
```
MarginLeft(1), Background(t.TextMuted()), Foreground(t.Text())
Content: " icon filename" (truncated to 10 chars with "...")
In delete mode: "N icon filename" (index prefix)
```

### 5.3 Size Calculation

```
textarea.Width = containerWidth - 3    (then immediately set to containerWidth)
textarea.Height = containerHeight
```

### 5.4 Behavior

- **Enter/Ctrl+S**: Send message (unless last char is `\`, which removes `\` and adds newline)
- **Ctrl+E**: Open external editor ($EDITOR or nvim)
- **Ctrl+R**: Enter attachment delete mode (then press digit to delete at index, or `r` to delete all)
- **Esc**: Cancel delete mode
- **PageUp/PageDown/Ctrl+U/Ctrl+D**: Ignored (passed up to viewport)

---

## 6. Sidebar Component (chat/sidebar.go)

### 6.1 Layout

```
Style: BaseStyle()
  .Width(width)
  .PaddingLeft(4)
  .PaddingRight(2)
  .Height(height - 1)
```

### 6.2 Content (top to bottom)

```
[Logo + Version]         (same as initial screen header)
[Repo URL]
[Empty line]
[CWD]
" "                      (space separator)
[Session Section]        "Session: {title}"
" "
[LSP Configuration]      Same as initial screen
" "
[Modified Files]         "Modified Files:" (bold, primary)
  path/to/file.ext  +N -M
  ...
```

### 6.3 Modified Files Display

Each file entry:
```
[filepath] [+additions] [-removals]
```

- Additions: `Foreground(t.Success())`, `PaddingLeft(1)`, format `"+N"`
- Removals: `Foreground(t.Error())`, `PaddingLeft(1)`, format `"-N"`
- Files sorted alphabetically
- Working directory prefix stripped from paths
- When no modified files: `"No modified files"` in TextMuted

---

## 7. Status Bar (components/core/status.go)

### 7.1 Layout

A single horizontal row at the very bottom of the screen. Composed of segments joined horizontally:

```
[Help Widget] [Token Info?] [Info/Empty] [Diagnostics] [Model Name]
```

### 7.2 Segments

**Help Widget (leftmost):**
```
Text: "ctrl+? help"
Style: Padded() (padding 0,1)
  .Background(t.TextMuted())
  .Foreground(t.BackgroundDarker())
  .Bold(true)
```

**Token Info (only when session active):**
```
Text: "Context: {tokens}, Cost: ${cost}"
Style: Padded()
  .Background(t.Text())
  .Foreground(t.BackgroundSecondary())

When usage > 80%:
  Style changes to: .Background(t.Warning())
  Text includes: "warning-icon(N%)" instead of token count
```

Token formatting: `>=1M` -> `"1.2M"`, `>=1K` -> `"1.2K"`, else raw number. `.0` suffixes removed.

**Info Message (middle, fills remaining space):**
```
When message present:
  Info:    Background(t.Info()),    Foreground(t.Background())
  Warning: Background(t.Warning()), Foreground(t.Background())
  Error:   Background(t.Error()),   Foreground(t.Background())
  Style: Padded(), Width(availableWidth)
  Message truncated to fit

When no message:
  Background(t.BackgroundSecondary()), Foreground(t.Text()), Width(availableWidth)
  Empty text
```

Default message TTL: 10 seconds.

**Diagnostics:**
```
Background(t.BackgroundDarker())
Content: "icon N" per severity level
  Error:   Foreground(t.Error()),   icon="checkmark-X"
  Warning: Foreground(t.Warning()), icon="warning"
  Hint:    Foreground(t.Text()),    icon="i"
  Info:    Foreground(t.Info()),     icon=""
When LSP initializing: "... Initializing LSP..." in Warning color
When no diagnostics: "No diagnostics"
```

**Model Name (rightmost):**
```
Style: Padded()
  .Background(t.Secondary())
  .Foreground(t.Background())
Text: model display name
```

---

## 8. Dialog Components

All dialogs share a common pattern:
- Rounded border: `lipgloss.RoundedBorder()`
- Border background: `t.Background()`
- Border foreground: `t.TextMuted()`
- Inner padding: `Padding(1, 2)` (top/bottom=1, left/right=2)
- Width: `lipgloss.Width(content) + 4`
- Shadow: `true` (via PlaceOverlay)
- Centered on screen

### 8.1 Quit Dialog (dialog/quit.go)

```
Title text: "Are you sure you want to quit?"

Buttons: [Yes] [  ] [No]
  Selected:   Background(t.Primary()), Foreground(t.Background())
  Unselected: Background(t.Background()), Foreground(t.Primary())
  Button padding: (0, 1)
  Spacer: "  " with Background(t.Background())

Default selection: No (selectedNo = true)
```

**Keys:** left/right/tab toggle, enter/space confirm, y=yes, n=no

### 8.2 Help Dialog (dialog/help.go)

```
Width: 90 (fixed)
Padding: 1 (all sides, inside border)

Header: "Keyboard Shortcuts" in Primary, Bold
  Followed by empty line of same width

Content: Key bindings in column pairs
  Key style:   Bold, Background(t.Background()), Foreground(t.Text()), PaddingRight(1)
  Desc style:  Regular, Background(t.Background()), Foreground(t.TextMuted())
  Rows per column: 10 (12 - 2)
  Column separator: 3 spaces
  Columns flow left-to-right, wrapping at width limit
  Duplicate bindings removed (last occurrence kept)
```

### 8.3 Session Dialog (dialog/session.go)

```
Title: "Switch Session" in Primary, Bold, Padding(0,1)
Min width: 40, max: min(maxTitleLen+4, screenWidth-15), floor: 30
Max visible sessions: 10

Items:
  Normal:   BaseStyle().Width(maxWidth).Padding(0,1)
  Selected: + Background(t.Primary()), Foreground(t.Background()), Bold(true)

Scrolling: Centers selected item when possible
```

**Keys:** up/k previous, down/j next, enter select, esc close

### 8.4 Command Dialog (dialog/commands.go)

```
Title: "Commands" in Primary, Bold, Padding(0,1)
Min width: 40, expands to fit longest command title/description

Items: Two-line format when description exists
  Title line:
    Normal:   Text color, Background(t.Background()), Padding(0,1)
    Selected: Background(t.Primary()), Foreground(t.Background()), Bold, Padding(0,1)
  Description line:
    Normal:   TextMuted, Padding(0,1)
    Selected: Background(t.Primary()), Foreground(t.Background()), Padding(0,1)

Max visible: 10
```

**Keys:** up/down/j/k navigate, enter select, esc close

### 8.5 Model Dialog (dialog/models.go)

```
Title: "Select {Provider} Model" in Primary, Bold, PaddingBottom(1)
Width: 40 (fixed)
Max visible models: 10

Items:
  Normal:   BaseStyle().Width(40)
  Selected: + Background(t.Primary()), Foreground(t.Background()), Bold

Scroll indicators: "up" "down" "left" "right" arrows in Primary, Bold, right-aligned
  Horizontal arrows appear when multiple providers available
```

**Keys:** up/k previous, down/j next, left/h previous provider, right/l next provider, enter select, esc close

### 8.6 Theme Dialog (dialog/theme.go)

```
Title: "Select Theme" in Primary, Bold, Padding(0,1)
Min width: 40, max: min(maxNameLen+4, screenWidth-15), floor: 30

Items:
  Normal:   BaseStyle().Width(maxWidth).Padding(0,1)
  Selected: + Background(currentTheme.Primary()), Foreground(currentTheme.Background()), Bold
```

**Keys:** up/k previous, down/j next, enter select, esc close

### 8.7 Permission Dialog (dialog/permission.go)

**Size varies by tool type:**
| Tool | Width | Height |
|------|-------|--------|
| Bash | 40% of screen | 30% of screen |
| Edit | 80% of screen | 80% of screen |
| Write | 80% of screen | 80% of screen |
| Fetch | 40% of screen | 30% of screen |
| Default | 70% of screen | 50% of screen |

```
Title: "Permission Required" in Primary, Bold, Width(dialogWidth - 4)

Header section:
  "Tool: {toolName}"      (TextMuted bold label, Text value)
  "Path: {path}"          (TextMuted bold label, Text value)
  + tool-specific fields (File path for Edit/Write, etc.)

Content section: Viewport with scrollable content
  Bash: Markdown-rendered bash code block
  Edit/Patch: Formatted diff view
  Write: Formatted diff view
  Fetch: Markdown-rendered URL
  Default: Markdown-rendered description

Buttons row:
  "Allow (a)" | "Allow for session (s)" | "Deny (d)"
  Selected:   Background(t.Primary()), Foreground(t.Background()), Padding(0,1)
  Unselected: Background(t.Background()), Foreground(t.Primary()), Padding(0,1)
  Spacer: "  " with Background(t.Background())
  Right-aligned with remaining space filled by Background spacer

Border: Rounded, Padding(1, 0, 0, 1)
Full dialog: Width(dialogWidth), Height(dialogHeight)
```

**Keys:** left/right/tab cycle options, enter/space confirm, a=allow, s=allow-session, d=deny, other keys pass to content viewport

### 8.8 Init Dialog (dialog/init.go)

```
Content width: 60 (or min(60, screenWidth-10))

Title: "Initialize Project" in Primary, Bold, Padding(0,1)

Explanation text: In Text color, Width(60), Padding(0,1)
  "Initialization generates a new OpenCode.md file..."

Question: "Would you like to initialize this project?"
  Text color, Padding(1,1)

Buttons: [Yes] [  ] [No]
  Selected:   Background(t.Primary()), Foreground(t.Background()), Bold, Padding(0,3)
  Unselected: Background(t.Background()), Foreground(t.Primary()), Padding(0,3)
  Spacer: "  "
  Centered within width, Padding(1,0)
```

**Keys:** tab/left/right/h/l toggle, enter confirm, esc dismiss, y=yes, n=no

### 8.9 Multi-Arguments Dialog (dialog/arguments.go)

```
Content width: 60 (or min(60, screenWidth-10))

Title: "Command Arguments" in Primary, Bold, Padding(0,1)

Explanation: "This command requires multiple arguments..."
  Text color, Padding(0,1)

Per argument:
  Label: "{argName}:" with Padding(1,1,0,1)
    Focused: Primary, Bold
    Unfocused: TextMuted
  Input field: textinput.Model, Width(40), Padding(0,1)
    Placeholder: "Enter value for {name}..."
    Focused: Primary color for prompt and text
    Background matches theme
```

**Keys:** enter=next input or submit (on last), tab=next input, shift+tab=prev input, esc=cancel

### 8.10 Filepicker Dialog (dialog/filepicker.go)

Two panels side by side:

**Left panel (file list):**
```
Width: max(30, min(80, screenWidth-15)) + 1
Max visible: 20 items

Current path: textinput at top, Height(1)

File items:
  Normal:   BaseStyle().Width(adjustedWidth).Padding(0,1)
  Selected: + Background(t.Primary()), Foreground(t.Background()), Bold
  Directories: name + "/"
  Names truncated at width-7 with "..."

Always padded to 20 lines

Footer: "Press i to start typing path" / "Press esc to exit typing path"
  TextMuted color

Border: Rounded, BorderBackground(t.Background()), BorderForeground(t.TextMuted())
Padding: 1,2
```

**Right panel (image preview):**
```
Viewport: Width=80, Height=22
Border: Rounded, Background(t.Background())
Padding: 2
Content: Image rendered using half-block characters or "Preview unavailable"
```

**Keys:** j/down=down, k/up=up, enter=select/enter dir, l=enter dir, h/backspace=go back, ctrl+f=refresh, i=toggle path input, esc=exit input/close

### 8.11 Completion Dialog (dialog/complete.go)

```
Position: Above editor (bottom-aligned, x=0)
Shadow: false
Width: editor width

Border: NormalBorder, top only (bottom/right/left=false)
BorderBackground(t.Background()), BorderForeground(t.TextMuted())
Padding: 0

Content: SimpleList of completion items
  Min width: 40, expands to longest item
  Max visible: 7

Item style:
  Normal:   Padding(0,1)
  Selected: + Background(t.Background()), Foreground(t.Primary()), Bold
```

**Keys:** tab/enter=complete, space/esc/backspace=cancel (backspace only when input empty)

### 8.12 Compacting Overlay

```
Style:
  Border: RoundedBorder
  BorderForeground(t.BorderFocused())
  BorderBackground(t.Background())
  Padding(1, 2)
  Background(t.Background())
  Foreground(t.Text())

Content: "Summarizing\n{progressMessage}"
```

---

## 9. Logs Page (page/logs.go)

### 9.1 Layout

```
Two stacked containers, each Height = totalHeight / 2

Top: Container(LogsTable)
  Border: all sides, NormalBorder

Bottom: Container(LogsDetails)
  Border: all sides, NormalBorder
```

### 9.2 Logs Table (logs/table.go)

Standard `table.Model` from charmbracelet/bubbles.

**Columns:**
| Title | Initial Width |
|-------|--------------|
| ID | 4 |
| Time | 4 |
| Level | 10 |
| Message | 10 |
| Attributes | 10 |

Column widths auto-resize: `(totalWidth / numColumns) - 2` each.

Selected row style: `Foreground(t.Primary())`

Background forced to `t.Background()` via `ForceReplaceBackgroundWithLipgloss`.

Rows sorted by time descending (newest first). Time format: `"15:04:05"`.

### 9.3 Log Details (logs/details.go)

A `viewport.Model` showing the selected log entry.

**Content layout:**
```
[Timestamp (TextMuted)] [  ] [Level (colored)]

Message:
  {message text, indented with Padding(0,2)}

Attributes:
  {key (Primary, Bold)}: {value (Text)}
  (each indented with Padding(0,2))
```

**Level colors:**
| Level | Color |
|-------|-------|
| info | `t.Info()` |
| warn/warning | `t.Warning()` |
| error/err | `t.Error()` |
| debug | `t.Success()` |
| default | `t.Text()` |

---

## 10. Keyboard Shortcuts

### 10.1 Global Keys (tui.go)

| Key | Action | Condition |
|-----|--------|-----------|
| `ctrl+c` | Toggle quit dialog | Always |
| `ctrl+l` | Switch to logs page | Always |
| `ctrl+?` / `ctrl+h` | Toggle help dialog | Not when quit showing |
| `ctrl+s` | Switch session dialog | Chat page, no other dialogs |
| `ctrl+k` | Commands dialog | Chat page, no other dialogs |
| `ctrl+o` | Model selection dialog | Chat page, no other dialogs |
| `ctrl+t` | Theme switcher dialog | No other dialogs |
| `ctrl+f` | Toggle filepicker | Always |
| `esc` | Close current overlay / go back from logs | Context-dependent |
| `q` | Go back from logs page | On logs page |
| `?` | Toggle help | When agent is busy |

### 10.2 Chat Page Keys (page/chat.go)

| Key | Action |
|-----|--------|
| `@` | Show completion dialog |
| `ctrl+n` | New session (clears sidebar) |
| `esc` | Cancel current generation |

### 10.3 Editor Keys (chat/editor.go)

| Key | Action |
|-----|--------|
| `enter` / `ctrl+s` | Send message |
| `ctrl+e` | Open external editor |
| `ctrl+r` | Enter attachment delete mode |
| `ctrl+r` then digit | Delete attachment at index |
| `ctrl+r` then `r` | Delete all attachments |
| `esc` | Cancel delete mode |

### 10.4 Message Viewport Keys (chat/list.go)

| Key | Action |
|-----|--------|
| `pgup` | Page up |
| `pgdown` | Page down |
| `ctrl+u` | Half page up |
| `ctrl+d` | Half page down |

---

## 11. Theme System

### 11.1 Architecture

All themes implement the `Theme` interface via embedding `BaseTheme`. Colors use `lipgloss.AdaptiveColor{Dark, Light}` for automatic terminal background detection.

### 11.2 Available Themes

| Name | Registration Order |
|------|-------------------|
| `opencode` | Default (always sorted first) |
| `catppuccin` | Alphabetical |
| `dracula` | Alphabetical |
| `flexoki` | Alphabetical |
| `gruvbox` | Alphabetical |
| `monokai` | Alphabetical |
| `onedark` | Alphabetical |
| `tokyonight` | Alphabetical |
| `tron` | Alphabetical |

### 11.3 Color Categories

Each theme defines all of the following color slots:

**Base Colors:** Primary, Secondary, Accent
**Status Colors:** Error, Warning, Success, Info
**Text Colors:** Text, TextMuted, TextEmphasized
**Background Colors:** Background, BackgroundSecondary, BackgroundDarker
**Border Colors:** BorderNormal, BorderFocused, BorderDim
**Diff Colors:** DiffAdded, DiffRemoved, DiffContext, DiffHunkHeader, DiffHighlightAdded, DiffHighlightRemoved, DiffAddedBg, DiffRemovedBg, DiffContextBg, DiffLineNumber, DiffAddedLineNumberBg, DiffRemovedLineNumberBg
**Markdown Colors:** MarkdownText, MarkdownHeading, MarkdownLink, MarkdownLinkText, MarkdownCode, MarkdownBlockQuote, MarkdownEmph, MarkdownStrong, MarkdownHorizontalRule, MarkdownListItem, MarkdownListEnumeration, MarkdownImage, MarkdownImageText, MarkdownCodeBlock
**Syntax Colors:** SyntaxComment, SyntaxKeyword, SyntaxFunction, SyntaxVariable, SyntaxString, SyntaxNumber, SyntaxType, SyntaxOperator, SyntaxPunctuation

### 11.4 OpenCode Theme (Default) - Complete Color Values

**Dark Mode:**
| Slot | Hex |
|------|-----|
| Primary | `#fab283` (orange/gold) |
| Secondary | `#5c9cf5` (blue) |
| Accent | `#9d7cd8` (purple) |
| Error | `#e06c75` (red) |
| Warning | `#f5a742` (orange) |
| Success | `#7fd88f` (green) |
| Info | `#56b6c2` (cyan) |
| Text | `#e0e0e0` |
| TextMuted | `#6a6a6a` |
| TextEmphasized | `#e5c07b` (yellow) |
| Background | `#212121` |
| BackgroundSecondary | `#252525` |
| BackgroundDarker | `#121212` |
| BorderNormal | `#4b4c5c` |
| BorderFocused | `#fab283` (= Primary) |
| BorderDim | `#303030` |
| DiffAdded | `#478247` |
| DiffRemoved | `#7C4444` |
| DiffContext | `#a0a0a0` |
| DiffHunkHeader | `#a0a0a0` |
| DiffHighlightAdded | `#DAFADA` |
| DiffHighlightRemoved | `#FADADD` |
| DiffAddedBg | `#303A30` |
| DiffRemovedBg | `#3A3030` |
| DiffContextBg | `#212121` (= Background) |
| DiffLineNumber | `#888888` |
| DiffAddedLineNumberBg | `#293229` |
| DiffRemovedLineNumberBg | `#332929` |

**Light Mode:**
| Slot | Hex |
|------|-----|
| Primary | `#3b7dd8` (blue) |
| Secondary | `#7b5bb6` (purple) |
| Accent | `#d68c27` (orange/gold) |
| Error | `#d1383d` |
| Warning | `#d68c27` |
| Success | `#3d9a57` |
| Info | `#318795` |
| Text | `#2a2a2a` |
| TextMuted | `#8a8a8a` |
| TextEmphasized | `#b0851f` |
| Background | `#f8f8f8` |
| BackgroundSecondary | `#f0f0f0` |
| BackgroundDarker | `#ffffff` |
| BorderNormal | `#d3d3d3` |
| BorderFocused | `#3b7dd8` (= Primary) |
| BorderDim | `#e5e5e6` |
| DiffAdded | `#2E7D32` |
| DiffRemoved | `#C62828` |
| DiffContext | `#757575` |
| DiffHunkHeader | `#757575` |
| DiffHighlightAdded | `#A5D6A7` |
| DiffHighlightRemoved | `#EF9A9A` |
| DiffAddedBg | `#E8F5E9` |
| DiffRemovedBg | `#FFEBEE` |
| DiffContextBg | `#f8f8f8` (= Background) |
| DiffLineNumber | `#9E9E9E` |
| DiffAddedLineNumberBg | `#C8E6C9` |
| DiffRemovedLineNumberBg | `#FFCDD2` |

### 11.5 Other Theme Color Values

#### Dracula Dark
| Slot | Hex |
|------|-----|
| Primary | `#bd93f9` (purple) |
| Secondary | `#ff79c6` (pink) |
| Accent | `#8be9fd` (cyan) |
| Error | `#ff5555` |
| Warning | `#ffb86c` |
| Success | `#50fa7b` |
| Info | `#8be9fd` |
| Text | `#f8f8f2` |
| TextMuted | `#6272a4` |
| TextEmphasized | `#f1fa8c` |
| Background | `#282a36` |
| BackgroundSecondary | `#44475a` |
| BackgroundDarker | `#21222c` |
| BorderNormal | `#44475a` |

#### Tokyo Night Dark
| Slot | Hex |
|------|-----|
| Primary | `#82aaff` (blue) |
| Secondary | `#c099ff` (purple) |
| Accent | `#ff966c` (orange) |
| Error | `#ff757f` |
| Warning | `#ff966c` |
| Success | `#c3e88d` |
| Info | `#82aaff` |
| Text | `#c8d3f5` |
| TextMuted | `#636da6` |
| TextEmphasized | `#ffc777` |
| Background | `#222436` |
| BackgroundSecondary | `#1e2030` |
| BackgroundDarker | `#191B29` |
| BorderNormal | `#3b4261` |

#### Catppuccin Dark (Mocha)
| Slot | Hex |
|------|-----|
| Primary | Mocha Blue |
| Secondary | Mocha Mauve |
| Accent | Mocha Peach |
| Error | Mocha Red |
| Warning | Mocha Peach |
| Success | Mocha Green |
| Info | Mocha Blue |
| Text | Mocha Text |
| TextMuted | Mocha Subtext0 |
| TextEmphasized | Mocha Lavender |
| Background | `#212121` |
| BackgroundSecondary | `#2c2c2c` |
| BackgroundDarker | `#181818` |
| BorderNormal | `#4b4c5c` |

#### Gruvbox Dark
| Slot | Hex |
|------|-----|
| Primary | `#83a598` (blue bright) |
| Secondary | `#d3869b` (purple bright) |
| Accent | `#fe8019` (orange bright) |
| Error | `#fb4934` |
| Warning | `#fabd2f` |
| Success | `#b8bb26` |
| Info | `#83a598` |
| Text | `#ebdbb2` |
| TextMuted | `#a89984` |
| Background | `#282828` |
| BackgroundSecondary | `#3c3836` |
| BackgroundDarker | `#32302f` |
| BorderNormal | `#504945` |

#### Flexoki Dark
| Slot | Hex |
|------|-----|
| Primary | `#4385BE` (blue 400) |
| Secondary | `#8B7EC8` (purple 400) |
| Accent | `#DA702C` (orange 400) |
| Error | `#D14D41` |
| Warning | `#D0A215` |
| Success | `#879A39` |
| Info | `#3AA99F` |
| Text | `#B7B5AC` (base 300) |
| TextMuted | `#575653` (base 700) |
| Background | `#100F0F` (black) |
| BackgroundSecondary | `#1C1B1A` (base 950) |
| BackgroundDarker | `#282726` (base 900) |
| BorderNormal | `#282726` (base 900) |

#### Monokai Pro Dark
| Slot | Hex |
|------|-----|
| Primary | `#78dce8` (cyan) |
| Secondary | `#ab9df2` (purple) |
| Accent | `#fc9867` (orange) |
| Error | `#ff6188` |
| Warning | `#fc9867` |
| Success | `#a9dc76` |
| Info | `#ab9df2` |
| Text | `#fcfcfa` |
| TextMuted | `#727072` |
| Background | `#2d2a2e` |
| BackgroundSecondary | `#403e41` |
| BackgroundDarker | `#221f22` |
| BorderNormal | `#403e41` |

#### One Dark
| Slot | Hex |
|------|-----|
| Primary | `#61afef` (blue) |
| Secondary | `#c678dd` (purple) |
| Accent | `#d19a66` (orange) |
| Error | `#e06c75` |
| Warning | `#d19a66` |
| Success | `#98c379` |
| Info | `#61afef` |
| Text | `#abb2bf` |
| TextMuted | `#5c6370` |
| Background | `#282c34` |
| BackgroundSecondary | `#2c313c` |
| BackgroundDarker | `#21252b` |
| BorderNormal | `#3b4048` |

#### Tron Dark
| Slot | Hex |
|------|-----|
| Primary | `#00d9ff` (cyan) |
| Secondary | `#007fff` (blue) |
| Accent | `#ff9000` (orange) |
| Error | `#ff3333` |
| Warning | `#ff9000` |
| Success | `#00ff8f` |
| Info | `#00d9ff` |
| Text | `#caf0ff` |
| TextMuted | `#4d6b87` |
| Background | `#0c141f` |
| BackgroundSecondary | `#1a2633` |
| BackgroundDarker | `#070d14` |
| BorderNormal | `#1a2633` |

---

## 12. Styles System (styles/styles.go)

### 12.1 Base Style Functions

```go
BaseStyle()     = Background(t.Background()) + Foreground(t.Text())
Regular()       = lipgloss.NewStyle()  (no defaults)
Bold()          = Regular().Bold(true)
Padded()        = Regular().Padding(0, 1)
Border()        = Regular() + NormalBorder + BorderForeground(t.BorderNormal())
ThickBorder()   = Regular() + ThickBorder + BorderForeground(t.BorderNormal())
DoubleBorder()  = Regular() + DoubleBorder + BorderForeground(t.BorderNormal())
FocusedBorder() = Regular() + NormalBorder + BorderForeground(t.BorderFocused())
DimBorder()     = Regular() + NormalBorder + BorderForeground(t.BorderDim())
```

### 12.2 Icons

```
OpenCodeIcon    = "⌬"
CheckIcon       = "✓"
ErrorIcon       = "✖"
WarningIcon     = "⚠"
InfoIcon        = ""       (empty string)
HintIcon        = "i"
SpinnerIcon     = "..."
LoadingIcon     = "⟳"
DocumentIcon    = "🖼"
```

### 12.3 Background Replacement

`ForceReplaceBackgroundWithLipgloss(input, newBgColor)` replaces ALL ANSI background color codes in a string with the specified color. This is used extensively to force markdown-rendered content to use the theme background instead of glamour's defaults.

---

## 13. Markdown Rendering (styles/markdown.go)

Uses `glamour.TermRenderer` with custom `ansi.StyleConfig`.

**Key configurations:**
- Document margin: 1
- BlockQuote: italic, prefix `"┃ "`, indent 1
- List indent: 1, bullet prefix `"• "`
- Headings: Bold, with `"# "` through `"###### "` prefixes
- Horizontal rule: `"─────────────────────────────────────────"`
- Task: Ticked `"[✓] "`, Unticked `"[ ] "`
- Code blocks: prefix `" "`, margin 1
- Tables: separators `"┼"` `"│"` `"─"`
- Links: underlined
- Images: format `"🖼 {{.text}}"`

All colors derived from the current theme's Markdown* and Syntax* color slots. Full Chroma syntax highlighting configuration is included.

---

## 14. Image Rendering (image/images.go)

Images are rendered using half-block Unicode characters:
- Each pair of vertical pixels becomes one character
- Top pixel: foreground color using `"▀"` character
- Bottom pixel: background color
- Images resized to target width using Lanczos filter
- Max file size for attachments: 5MB
- Supported extensions: `.jpg`, `.jpeg`, `.webp`, `.png`

---

## 15. SimpleList Component (components/util/simple-list.go)

A generic reusable list component used by Commands, Sessions, Completions dialogs.

**Properties:**
- `maxVisibleItems`: Maximum items shown at once
- `useAlphaNumericKeys`: When true, j/k also navigate
- `fallbackMsg`: Shown when list is empty

**Scrolling behavior:** Centers the selected item when possible:
```
if selectedIdx >= halfVisible && selectedIdx < totalItems - halfVisible:
  startIdx = selectedIdx - halfVisible
elif selectedIdx >= totalItems - halfVisible:
  startIdx = totalItems - maxVisible
else:
  startIdx = 0
```

**Keys:** up/down always work, j/k only when `useAlphaNumericKeys=true`

---

## 16. Custom Commands (dialog/custom_commands.go)

Commands are loaded from three directories:
1. `$XDG_CONFIG_HOME/opencode/commands/` (prefix: `user:`)
2. `$HOME/.opencode/commands/` (prefix: `user:`)
3. `{project-data-dir}/commands/` (prefix: `project:`)

Files must be `.md` format. Named arguments use `$NAME` pattern (regex: `\$([A-Z][A-Z0-9_]*)`). When arguments are found, the multi-arguments dialog is shown.

---

## 17. Built-in Commands

| ID | Title | Description |
|----|-------|-------------|
| `init` | Initialize Project | Creates/updates OpenCode.md memory file |
| `compact` | Compact Session | Summarizes current session |

---

## 18. Auto-Compact Behavior

When a response completes (`AgentEventTypeResponse`) and the session has a session ID:
- Calculate token usage: `completionTokens + promptTokens`
- If tokens >= 95% of context window AND `config.AutoCompact` is true
- Trigger `startCompactSessionMsg` which starts summarization

During compacting, an overlay shows `"Summarizing\n{progressMessage}"`.
