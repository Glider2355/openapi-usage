import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { Command } from "commander";
import { Project, SyntaxKind, Node, CallExpression, SourceFile } from "ts-morph";

// Types
interface OpenAPISpec {
  paths: Record<string, Record<string, unknown>>;
}

interface Usage {
  file: string;
  line: number;
}

interface Endpoint {
  method: string;
  path: string;
  usages: Usage[];
}

interface ApiDependencies {
  generated_at: string;
  endpoints: Endpoint[];
  summary: {
    total: number;
    used: number;
    unused: number;
  };
}

// HTTP methods that we want to track
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Extract string literals from an expression (handles variables, ternary, etc.)
 */
function extractStringLiterals(node: Node, sourceFile: SourceFile): string[] {
  const results: string[] = [];

  // Direct string literal
  if (Node.isStringLiteral(node)) {
    results.push(node.getLiteralValue());
    return results;
  }

  // Template literal without substitutions
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    results.push(node.getLiteralValue());
    return results;
  }

  // Ternary/Conditional expression: condition ? "path1" : "path2"
  if (Node.isConditionalExpression(node)) {
    const whenTrue = node.getWhenTrue();
    const whenFalse = node.getWhenFalse();
    results.push(...extractStringLiterals(whenTrue, sourceFile));
    results.push(...extractStringLiterals(whenFalse, sourceFile));
    return results;
  }

  // Identifier (variable reference) - trace back to definition
  if (Node.isIdentifier(node)) {
    const definitions = node.getDefinitionNodes();
    for (const def of definitions) {
      // VariableDeclaration: const endpoint = "..."
      if (Node.isVariableDeclaration(def)) {
        const initializer = def.getInitializer();
        if (initializer) {
          results.push(...extractStringLiterals(initializer, sourceFile));
        }
      }
      // Parameter with default value
      if (Node.isParameterDeclaration(def)) {
        const initializer = def.getInitializer();
        if (initializer) {
          results.push(...extractStringLiterals(initializer, sourceFile));
        }
      }
    }
    return results;
  }

  // Parenthesized expression: (expression)
  if (Node.isParenthesizedExpression(node)) {
    return extractStringLiterals(node.getExpression(), sourceFile);
  }

  // As expression (type assertion): expr as Type
  if (Node.isAsExpression(node)) {
    return extractStringLiterals(node.getExpression(), sourceFile);
  }

  return results;
}

/**
 * Parse OpenAPI spec and extract all endpoints
 */
function parseOpenAPISpec(openapiPath: string): Map<string, Set<string>> {
  const content = readFileSync(openapiPath, "utf-8");
  const spec: OpenAPISpec = JSON.parse(content);

  const endpoints = new Map<string, Set<string>>();

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      const upperMethod = method.toUpperCase();
      if (HTTP_METHODS.includes(upperMethod as HttpMethod)) {
        const key = `${upperMethod} ${path}`;
        if (!endpoints.has(key)) {
          endpoints.set(key, new Set());
        }
      }
    }
  }

  return endpoints;
}

/**
 * Analyze TypeScript files to find API calls
 */
function analyzeTypeScriptFiles(
  srcPath: string,
  endpoints: Map<string, Set<string>>
): Map<string, Usage[]> {
  const project = new Project({
    tsConfigFilePath: resolve(srcPath, "../tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  // Add all TypeScript files
  project.addSourceFilesAtPaths([
    `${srcPath}/**/*.ts`,
    `${srcPath}/**/*.tsx`,
  ]);

  const usages = new Map<string, Usage[]>();

  // Initialize usages map with all endpoints
  for (const key of endpoints.keys()) {
    usages.set(key, []);
  }

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const relativeFilePath = relative(resolve(srcPath, ".."), filePath);

    // Find all call expressions
    sourceFile.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const callExpr = node as CallExpression;
        const expression = callExpr.getExpression();

        // Check if it's a property access like client.GET or client.POST
        if (Node.isPropertyAccessExpression(expression)) {
          const methodName = expression.getName();
          const objectExpr = expression.getExpression();

          // Check if the object is "client" and method is an HTTP method
          if (
            Node.isIdentifier(objectExpr) &&
            objectExpr.getText() === "client" &&
            HTTP_METHODS.includes(methodName as HttpMethod)
          ) {
            const args = callExpr.getArguments();
            if (args.length > 0) {
              const firstArg = args[0];
              const line = sourceFile.getLineAndColumnAtPos(node.getStart()).line;

              // Extract all possible path values (handles variables, ternary, etc.)
              const pathValues = extractStringLiterals(firstArg, sourceFile);

              for (const pathValue of pathValues) {
                const key = `${methodName} ${pathValue}`;

                if (usages.has(key)) {
                  usages.get(key)!.push({
                    file: relativeFilePath,
                    line,
                  });
                } else {
                  // Path might have different parameter format
                  // Try to match with OpenAPI path patterns
                  const matchedKey = findMatchingEndpoint(key, endpoints);
                  if (matchedKey) {
                    usages.get(matchedKey)!.push({
                      file: relativeFilePath,
                      line,
                    });
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  return usages;
}

/**
 * Find matching endpoint with path parameter patterns
 */
function findMatchingEndpoint(
  key: string,
  endpoints: Map<string, Set<string>>
): string | null {
  const [method, path] = key.split(" ", 2);

  for (const endpointKey of endpoints.keys()) {
    const [endpointMethod, endpointPath] = endpointKey.split(" ", 2);

    if (method !== endpointMethod) continue;

    // Convert OpenAPI path pattern to regex
    // e.g., /users/{id} -> /users/[^/]+
    const regexPattern = endpointPath.replace(/\{[^}]+\}/g, "[^/]+");
    const regex = new RegExp(`^${regexPattern}$`);

    if (regex.test(path)) {
      return endpointKey;
    }
  }

  return null;
}

/**
 * Output results in tree format
 */
function outputTree(usages: Map<string, Usage[]>): void {
  const sortedKeys = Array.from(usages.keys()).sort();

  for (const key of sortedKeys) {
    const usageList = usages.get(key)!;
    console.log(key);

    if (usageList.length === 0) {
      console.log("\u2514\u2500 (\u672a\u4f7f\u7528)");
    } else {
      usageList.forEach((usage, index) => {
        const isLast = index === usageList.length - 1;
        const prefix = isLast ? "\u2514\u2500" : "\u251c\u2500";
        console.log(`${prefix} ${usage.file}:${usage.line}`);
      });
    }
    console.log();
  }
}

/**
 * Output summary
 */
function outputSummary(usages: Map<string, Usage[]>): number {
  const unusedEndpoints: string[] = [];

  for (const [key, usageList] of usages) {
    if (usageList.length === 0) {
      unusedEndpoints.push(key);
    }
  }

  console.log("\u2500".repeat(35));

  if (unusedEndpoints.length === 0) {
    console.log("\u672a\u4f7f\u7528 API: 0\u4ef6");
    return 0;
  }

  console.log(`\u672a\u4f7f\u7528 API: ${unusedEndpoints.length}\u4ef6`);
  for (const endpoint of unusedEndpoints) {
    console.log(`  - ${endpoint}`);
  }

  return 1;
}

/**
 * Generate JSON output
 */
function generateJsonOutput(usages: Map<string, Usage[]>): ApiDependencies {
  const endpoints: Endpoint[] = [];
  let used = 0;
  let unused = 0;

  const sortedKeys = Array.from(usages.keys()).sort();

  for (const key of sortedKeys) {
    const [method, path] = key.split(" ", 2);
    const usageList = usages.get(key)!;

    endpoints.push({
      method,
      path,
      usages: usageList,
    });

    if (usageList.length > 0) {
      used++;
    } else {
      unused++;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    endpoints,
    summary: {
      total: endpoints.length,
      used,
      unused,
    },
  };
}

// CLI
const program = new Command();

program
  .name("openapi-usage")
  .description("Analyze API usage based on OpenAPI spec")
  .requiredOption("-o, --openapi <path>", "Path to OpenAPI spec file")
  .requiredOption("-s, --src <path>", "Path to source directory")
  .option("--output <path>", "Output JSON file path")
  .option("--check", "Check mode (exit 1 if unused APIs exist)")
  .option("--ignore <patterns...>", "Glob patterns to ignore");

program.parse();

const options = program.opts<{
  openapi: string;
  src: string;
  output?: string;
  check?: boolean;
  ignore?: string[];
}>();

// Resolve paths
const openapiPath = resolve(process.cwd(), options.openapi);
const srcPath = resolve(process.cwd(), options.src);

// Validate paths
if (!existsSync(openapiPath)) {
  console.error(`Error: OpenAPI spec not found: ${openapiPath}`);
  process.exit(1);
}

if (!existsSync(srcPath)) {
  console.error(`Error: Source directory not found: ${srcPath}`);
  process.exit(1);
}

// Parse OpenAPI spec
console.log(`Parsing OpenAPI spec: ${openapiPath}`);
const endpoints = parseOpenAPISpec(openapiPath);
console.log(`Found ${endpoints.size} endpoints`);

// Analyze TypeScript files
console.log(`Analyzing source files: ${srcPath}`);
const usages = analyzeTypeScriptFiles(srcPath, endpoints);

// Output
if (options.output) {
  // JSON output mode
  const outputPath = resolve(process.cwd(), options.output);
  const outputDir = dirname(outputPath);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(outputDir, { recursive: true });
  }

  const jsonOutput = generateJsonOutput(usages);
  writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`Output written to: ${outputPath}`);
}

if (options.check) {
  // Check mode - output tree and summary
  console.log();
  outputTree(usages);
  const exitCode = outputSummary(usages);
  process.exit(exitCode);
}

// Default: just output the tree format if no output option specified
if (!options.output && !options.check) {
  console.log();
  outputTree(usages);
  outputSummary(usages);
}
