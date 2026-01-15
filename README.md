# openapi-usage

[日本語](./README.ja.md)

A tool for statically analyzing frontend API calls using OpenAPI spec as the source of truth. It provides **call site visualization** and **unused API detection**.

## Installation

```bash
npm install openapi-usage
# or
pnpm add openapi-usage
# or
yarn add openapi-usage
```

Global installation (for CLI usage):

```bash
npm install -g openapi-usage
```

## Prerequisites

- API client using `openapi-typescript` + `openapi-fetch`
- Client created with `createClient()` (variable name is auto-detected)
- No dynamic path generation (string literals only)

## Detection Patterns

### Detectable

```typescript
// String literals
client.GET("/users");

// Any variable name created with createClient
const api = createClient<paths>();
api.GET("/users");

// Ternary operator
client.GET(isAdmin ? "/admins" : "/users");

// Simple variable reference
const path = "/users";
client.GET(path);

// Path parameters (recommended pattern)
client.GET("/users/{id}", { params: { path: { id: userId } } });
```

### Not Detectable

```typescript
// Template literals (not recommended as it also breaks type safety)
client.GET(`/users/${id}`);

// Function return values
const path = getPath();
client.GET(path);

// String concatenation
client.GET("/users" + "/" + id);

// Dynamically constructed paths
const base = "/users";
client.GET(`${base}/${id}`);
```

> **Note:** Patterns that cannot be detected also lose `openapi-fetch` type safety.
> For path parameters, using `params.path` is recommended.

## Configuration File

You can configure openapi-usage using a YAML configuration file. The following filenames are automatically detected:

- `openapi-usage.yaml`
- `openapi-usage.yml`
- `.openapi-usage.yaml`
- `.openapi-usage.yml`

### Example Configuration

```yaml
# openapi-usage.yaml
openapi: ./openapi.json
src: ./src
output: ./api-usage.json
level: error

# Ignore specific endpoints
ignore:
  - "GET /health"
  - "GET /metrics"
  - "* /internal/*"  # Wildcard pattern
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `openapi` | Path to OpenAPI spec file (json) |
| `src` | Source directory to analyze |
| `output` | Output JSON file path |
| `level` | Severity level: `error` or `warn` |
| `ignore` | List of endpoints to ignore (supports wildcards) |

### Ignore Patterns

The `ignore` option supports exact matches and wildcard patterns:

```yaml
ignore:
  # Exact match
  - "GET /health"
  - "POST /internal/webhook"

  # Wildcard patterns
  - "* /internal/*"      # All methods under /internal/
  - "GET /admin/*"       # All GET requests under /admin/
  - "* /v1/deprecated/*" # All deprecated v1 endpoints
```

## CLI Options

```bash
openapi-usage [options]

Options:
  -o, --openapi <path>  Path to OpenAPI spec file (json)
  -s, --src <path>      Source directory to analyze
  --output <path>       Output JSON file path
  --check               Check mode (exit 1 if unused APIs exist with --level error)
  --level <level>       Set severity level for unused APIs: "error" or "warn" (default: "error")
  -c, --config <path>   Path to config file (YAML)
```

CLI options override configuration file settings.

### Severity Level

The `--level` option controls the behavior when unused APIs are detected:

- `--level error` (default): Exit with code 1 when unused APIs are found
- `--level warn`: Exit with code 0, only display warnings

## Output Format

### Check Mode (--check)

```
───────────────────────────────────
Unused APIs: 1
  - DELETE /users/{id}
```

### JSON Output (--output mode)

```json
{
  "endpoints": [
    {
      "method": "GET",
      "path": "/users",
      "usages": [
        { "file": "src/pages/Users.tsx", "line": 42 }
      ]
    }
  ],
  "summary": {
    "total": 50,
    "used": 49,
    "unused": 1
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No unused APIs (or `--level warn`) |
| 1 | Unused APIs exist (with `--level error`) |

## Library Usage

```typescript
import {
  loadOpenAPISpec,
  parseOpenAPISpec,
  analyzeTypeScriptFiles,
  generateJsonOutput,
} from "openapi-usage";

// Load OpenAPI spec
const specResult = loadOpenAPISpec("./openapi.json");
if (!specResult.success) {
  console.error(specResult.error);
  process.exit(1);
}

// Extract endpoint list
const endpoints = parseOpenAPISpec(specResult.spec);

// Analyze TypeScript files
const usages = analyzeTypeScriptFiles(endpoints, { srcPath: "./src" });

// Generate JSON output
const output = generateJsonOutput(usages);
console.log(JSON.stringify(output, null, 2));
```

## License

MIT
