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

- Node.js 22.12 or later
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
  - pattern: "GET /temp/*"
    reason: "Local static file serving"

# Restrict where each endpoint may be called from
locations:
  "* /users/**":
    - "src/hooks/api/user/**"
  "*":
    - "src/hooks/api/**"
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `openapi` | Path to OpenAPI spec file (json) |
| `src` | Source directory to analyze. A single path, or a list of paths |
| `output` | Output JSON file path. Ignored in `--check` mode |
| `level` | Severity level: `error` or `warn`. Validated at startup |
| `ignore` | List of endpoints to ignore. A pattern string, or `{ pattern, reason }` |
| `locations` | Endpoint pattern → directory globs the endpoint may be called from |

The config file is schema-validated. An invalid value (for example `level: warning`)
exits with code 1 instead of being silently ignored, and unknown keys are reported
as warnings:

```
Error: Invalid config file /app/openapi-usage.yaml: level: invalid level "warning" (expected "error" or "warn")
Warning: unknown config key "levell" in /app/openapi-usage.yaml (ignored)
```

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

An entry can also carry a machine-readable reason. The reason shows up in the
report and in the JSON output, so "why is this left unused" does not have to live
in a YAML comment:

```yaml
ignore:
  - "GET /health"                  # Plain strings still work
  - pattern: "GET /temp/*"
    reason: "Local static file serving"
```

Patterns that match no endpoint are reported, so an ignore entry left behind by a
renamed or deleted endpoint does not stay unnoticed:

```
warning: ignore pattern "GET /sounds/*" matched no endpoint
```

### Multiple Source Directories

Pass `--src` more than once, or give `src` a list, to analyze several clients
against the same spec — for example a frontend and an e2e suite. An endpoint is
counted as used when any of the directories calls it, and the summary also
reports how many endpoints each directory does not call:

```yaml
src:
  - packages/frontend/src
  - e2e/api
```

```bash
openapi-usage --src packages/frontend/src --src e2e/api --check
```

```
───────────────────────────────────
Unused APIs: 1
  - DELETE /users/{id}
Unused APIs per source:
  packages/frontend/src: 2
  e2e/api: 9
```

Call-site paths in the report and in the JSON output are relative to the current
working directory.

### Call-site Location Rules

`locations` maps an endpoint pattern to the directory globs its call sites are
allowed to live in — for example "API hooks belong under `src/hooks/api/`, mirroring
the API path structure". A call from anywhere else is reported as a violation, and
fails `--check` with `level: error`:

```yaml
locations:
  # endpoint pattern → allowed call-site directory globs
  "* /novel/**":
    - "src/hooks/api/novel/**"
    - "src/app/**/_lib/**"        # SSR data fetching
  "* /user/**":
    - "src/hooks/api/user/**"
  "*":                            # Default
    - "src/hooks/api/**"
```

```
───────────────────────────────────
Location violations: 1
  - GET /novel/{novel_id} at src/components/NovelCard.tsx:12
    allowed: src/hooks/api/novel/**, src/app/**/_lib/** (rule: "* /novel/**")
```

- In directory globs, `**` crosses directory boundaries and `*` does not
- A glob without wildcards (or ending with `/`) is treated as a directory and allows
  every file under it, so `src/hooks/api` behaves like `src/hooks/api/**`
- When several endpoint patterns match, the most specific one wins (the one with
  the most non-wildcard characters), so `"*"` acts as a default
- Globs are matched against paths relative to the current working directory
- `ignore` does not exempt call sites from these rules: it only controls
  unused-API reporting

## CLI Options

```bash
openapi-usage [options]

Options:
  -o, --openapi <path>  Path to OpenAPI spec file (json)
  -s, --src <path>      Source directory to analyze (repeatable)
  --output <path>       Output JSON file path
  --check               Check mode (exit 1 if unused APIs exist with --level error)
  --level <level>       Set severity level for unused APIs: "error" or "warn" (default: "error")
  -c, --config <path>   Path to config file (YAML)
```

CLI options override configuration file settings.

In `--check` mode the `output` file from the config file is **not** written, so
running the check as part of a lint task has no side effects. Pass `--output`
explicitly when you want the JSON written anyway.

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

With `locations` configured, violations are listed after the summary. They are
printed in every mode, including when the JSON output file is written:

```
───────────────────────────────────
Location violations: 1
  - GET /users at src/api.ts:4
    allowed: src/hooks/api/** (rule: "*")
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
    },
    {
      "method": "GET",
      "path": "/temp/{id}",
      "usages": [],
      "ignored": true,
      "reason": "Local static file serving"
    }
  ],
  "summary": {
    "total": 50,
    "used": 48,
    "unused": 1,
    "ignored": 1
  }
}
```

Ignored endpoints are included with `ignored: true` (plus `reason` when the ignore
entry has one) and are counted in `summary.ignored` instead of `summary.unused`,
so `used + unused + ignored === total`. Their `usages` are still listed, so an
ignore entry for an endpoint that is actually called stays visible.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No unused APIs and no location violations (or `--level warn`) |
| 1 | Unused APIs or location violations exist (with `--level error`) |
| 1 | Invalid configuration (unknown `level`, wrong value types, missing paths) |

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

// Analyze TypeScript files (srcPaths accepts multiple directories)
const usages = analyzeTypeScriptFiles(endpoints, { srcPaths: ["./src"] });

// Generate JSON output
const output = generateJsonOutput(usages);
console.log(JSON.stringify(output, null, 2));
```

## License

MIT
