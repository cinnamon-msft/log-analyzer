#!/bin/bash

# Test script for log analyzer
# Note: This requires the GitHub Copilot CLI to be installed and configured

set -e

echo "======================================"
echo "Log Analyzer Test Script"
echo "======================================"
echo ""

# Check if Copilot CLI is available
if ! command -v copilot &> /dev/null; then
    echo "❌ Error: GitHub Copilot CLI is not installed or not in PATH"
    echo ""
    echo "Please install the Copilot CLI first:"
    echo "https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"
    echo ""
    exit 1
fi

echo "✓ Copilot CLI found"
echo ""

# Build the project
echo "Building project..."
npm run build
echo "✓ Build completed"
echo ""

# Test with example log file
echo "Testing with example log file..."
node dist/cli.js --file ./examples/sample-application.log

echo ""
echo "======================================"
echo "Test completed successfully!"
echo "======================================"
