# Contributing to Log Analyzer

Thank you for your interest in contributing to the Log Analyzer project! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/log-analyzer.git
   cd log-analyzer
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Build the project**:
   ```bash
   npm run build
   ```

## Prerequisites

- Node.js >= 18.0.0
- GitHub Copilot CLI installed and configured
- Active GitHub Copilot subscription (for testing)

## Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** in the `src/` directory

3. **Build and test your changes**:
   ```bash
   npm run build
   ./test.sh  # If you have Copilot CLI installed
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Description of your changes"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** on GitHub

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting and naming conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and single-purpose

## Testing

When adding new features:
- Test with various log formats
- Test with large log files (if possible)
- Verify error handling
- Check edge cases

## Adding New Features

When proposing new features:
1. Open an issue first to discuss the feature
2. Explain the use case and benefits
3. Consider backwards compatibility
4. Update documentation and examples

## Areas for Contribution

Some ideas for contributions:

- **Enhanced parsing**: Support more log formats
- **Streaming analysis**: Process logs in chunks
- **Export options**: JSON, CSV, or HTML output
- **Custom prompts**: Allow users to customize analysis prompts
- **Visualization**: Generate charts or graphs from log data
- **Integration**: Support for common logging platforms
- **Performance**: Optimize for very large files
- **Testing**: Add unit and integration tests

## Documentation

When adding features, please update:
- README.md - If it affects usage
- Code comments - For complex logic
- examples/ - If adding new capabilities
- Type definitions - Keep TypeScript types accurate

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about the code
- Documentation improvements

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
