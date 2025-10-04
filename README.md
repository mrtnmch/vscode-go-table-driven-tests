# Go Table-Driven Tests

A VS Code extension (also compatible with Cursor) that adds support for running individual test cases in Go's table-driven tests.

## Features

- **CodeLens Integration**: Adds "Run" and "Debug" buttons above each table test case
- **Individual Test Execution**: Run or debug specific test cases from table-driven tests
- **Automatic Detection**: Automatically detects table-driven test patterns in your Go test files

## Supported Test Patterns

The extension recognizes common table-driven test patterns:

```go
func TestExample(t *testing.T) {
    tests := []struct {
        name string
        // other fields...
    }{
        {name: "test case 1"},
        {name: "test case 2"},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // test code
        })
    }
}
```

## Usage

1. Open a Go test file with table-driven tests
2. Look for "run test" and "debug test" CodeLens above each test case
3. Click "run test" to run the specific test case
4. Click "debug test" to debug the specific test case (requires Go debugger setup)

## Installation

### From VSIX (local build, development)
1. Build the extension: `npm install && npm run compile`
2. Package the extension: `npx vsce package`
3. Install the `.vsix` file in VS Code: Extensions → ... → Install from VSIX

## License

MIT
