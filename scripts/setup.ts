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

const PLACEHOLDERS = {
  "__NAME__": (c: Config) => c.name,
  "__NAME_PASCAL__": (c: Config) => c.namePascal,
  "__SCOPE__": (c: Config) => c.scope,
  "__DOMAIN__": (c: Config) => c.domain,
  "__REVERSE_DOMAIN__": (c: Config) => c.reverseDomain,
};

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
      if (["ts", "tsx", "js", "jsx", "json", "md", "mjs", "astro"].includes(ext || "")) {
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

  for (const [placeholder, getValue] of Object.entries(PLACEHOLDERS)) {
    if (content.includes(placeholder)) {
      content = content.replaceAll(placeholder, getValue(config));
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
  console.log("This will replace all template placeholders with your project values.\n");

  const name = await ask("Enter project name (lowercase, e.g., myapp): ");
  if (!name) {
    console.error("❌ Project name is required");
    process.exit(1);
  }

  const domain = await ask("Enter base domain (e.g., myapp.com): ");
  if (!domain) {
    console.error("❌ Domain is required");
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
  console.log(`   __NAME__          → ${config.name}`);
  console.log(`   __NAME_PASCAL__   → ${config.namePascal}`);
  console.log(`   __SCOPE__         → ${config.scope}`);
  console.log(`   __DOMAIN__        → ${config.domain}`);
  console.log(`   __REVERSE_DOMAIN__ → ${config.reverseDomain}`);

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
