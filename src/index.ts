import { createProgram, parseArgs } from "./cli.js";
import { run } from "./runner.js";

const program = createProgram();
const options = parseArgs(program);
const result = run(options);

process.exit(result.exitCode);
