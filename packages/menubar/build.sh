#!/bin/bash
# Build the Assistants menu bar app
# Output: .build/release/AssistantsMenubar

set -e

echo "Building Assistants Menubar..."
swift build -c release

echo ""
echo "Build complete!"
echo "Binary: $(pwd)/.build/release/AssistantsMenubar"
echo ""
echo "To install, copy to /usr/local/bin:"
echo "  cp .build/release/AssistantsMenubar /usr/local/bin/assistants-menubar"
echo ""
echo "Or run directly:"
echo "  .build/release/AssistantsMenubar"
