#!/usr/bin/env bun

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function toReverseDomain(domain: string): string {
  return domain.split(".").reverse().join(".");
}

interface Config {
  name: string;
  namePascal: string;
  scope: string;
  domain: string;
  reverseDomain: string;
}

const TEMPLATE_DEFAULTS = {
  name: "stockpile",
  namePascal: "Stockpile",
  scope: "@stockpile",
  domain: "stockpile.cash",
  reverseDomain: "sh.nitish.stockpile",
} as const;

const REPLACEMENTS = Object.entries({
  [TEMPLATE_DEFAULTS.reverseDomain]: (c: Config) => c.reverseDomain,
  [TEMPLATE_DEFAULTS.domain]: (c: Config) => c.domain,
  [TEMPLATE_DEFAULTS.scope]: (c: Config) => c.scope,
  [TEMPLATE_DEFAULTS.namePascal]: (c: Config) => c.namePascal,
  [TEMPLATE_DEFAULTS.name]: (c: Config) => c.name,
  "sh.nitish.stockpile": (c: Config) => c.reverseDomain,
  "stockpile.cash": (c: Config) => c.domain,
  "@stockpile": (c: Config) => c.scope,
  Stockpile: (c: Config) => c.namePascal,
  stockpile: (c: Config) => c.name,
}).sort(([a], [b]) => b.length - a.length);

function getAllFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    
    if (entry.startsWith(".") || 
        entry === "node_modules" || 
        entry === "dist" || 
        entry === ".sst" ||
        entry === "drizzle") {
      continue;
    }
    
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (stat.isFile()) {
      const ext = entry.split(".").pop()?.toLowerCase();
      if (entry === "bun.lock" || ["ts", "tsx", "js", "jsx", "json", "md", "mjs", "astro"].includes(ext || "")) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

function replaceInFile(filePath: string, config: Config): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  let content = readFileSync(filePath, "utf-8");
  let modified = false;

  for (const [searchValue, getValue] of REPLACEMENTS) {
    if (content.includes(searchValue)) {
      content = content.replaceAll(searchValue, getValue(config));
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(filePath, content);
    const relPath = relative(process.cwd(), filePath);
    console.log(`  ✅ ${relPath}`);
  }
  
  return modified;
}

async function main() {
 console.log("\n🚀 Project Setup Script\n");
 console.log("This will replace the default template values with your project values.\n");
 console.log("The template ships with working defaults so you can test it before setup.\n");

 const name = await ask("Enter project name (lowercase, e.g., myapp): ");
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error("❌ Project name is required and must be lowercase letters, numbers, and hyphens only (start with letter)");
   process.exit(1);
 }

 const domain = await ask("Enter base domain (e.g., myapp.com): ");
  if (!domain || !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    console.error("❌ Valid domain is required (e.g., myapp.com)");
   process.exit(1);
 }

  const config: Config = {
    name: name.toLowerCase(),
    namePascal: toPascalCase(name),
    scope: `@${name.toLowerCase()}`,
    domain,
    reverseDomain: toReverseDomain(domain),
  };

  console.log("\n📋 Configuration:");
  console.log(`   ${TEMPLATE_DEFAULTS.name}       → ${config.name}`);
  console.log(`   ${TEMPLATE_DEFAULTS.namePascal}       → ${config.namePascal}`);
  console.log(`   ${TEMPLATE_DEFAULTS.scope}      → ${config.scope}`);
  console.log(`   ${TEMPLATE_DEFAULTS.domain}   → ${config.domain}`);
  console.log(`   ${TEMPLATE_DEFAULTS.reverseDomain}  → ${config.reverseDomain}`);

  const confirm = await ask("\nProceed? (y/n): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled");
    process.exit(0);
  }

  console.log("\n🔄 Updating files...\n");

  const files = getAllFiles(process.cwd());
  let updatedCount = 0;

  for (const file of files) {
    if (replaceInFile(file, config)) {
      updatedCount++;
    }
  }

  console.log(`\n✨ Done! Updated ${updatedCount} files.\n`);
  console.log("Next steps:");
  console.log("  1. Review changes: git diff");
  console.log("  2. Update logo in apps/landing/public/logo.svg");
  console.log("  3. Run: bun install");
  console.log("  4. Configure SST secrets\n");

  rl.close();
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
