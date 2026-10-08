#!/usr/bin/env node
/**
 * Minify All Script
 * Version 4.5 - Last Update on 11/01/2025
 * Minifies all JavaScript and CSS files in the Search Pro project
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🚀 Starting minification process...\n");

// Files to minify with their configurations
const jsFiles = [
  {
    input: "search-v4.js",
    output: "search-v4.min.js",
    config: "terser.config.json",
    description: "Main search engine",
  },
];

// Dashboard JS files
const dashboardJsFiles = [
  "control-panel-v4.js",
  "control-panel-core.js",
  "general-tab.js",
  "appearance-tab.js",
  "display-tab.js",
  "content-tab.js",
  "filtering-tab.js",
  "data-sources-tab.js",
  "advanced-tab.js",
  "knowledge-tab.js",
  "modal-system.js",
  "toast.js",
  "tab-loader.js",
  "fab-menu.js",
  "sidebar-menu.js",
  "validation-messages.js",
  "debug-core-v4.js",
  "logo-manager.js",
  "emoji-library.js",
  "fontawesome-icons.js",
];

// Add dashboard files to minification list
dashboardJsFiles.forEach((file) => {
  jsFiles.push({
    input: `dashboard/js/${file}`,
    output: `dashboard/js/${file.replace(".js", ".min.js")}`,
    config: "terser.config.json",
    description: `Dashboard: ${file}`,
  });
});

// Minify JavaScript files
console.log("📦 Minifying JavaScript files...\n");
let successCount = 0;
let errorCount = 0;

jsFiles.forEach((file, index) => {
  try {
    console.log(`[${index + 1}/${jsFiles.length}] ${file.description}`);
    console.log(`   Input:  ${file.input}`);
    console.log(`   Output: ${file.output}`);

    const command = `npx terser ${file.input} -o ${file.output} --config-file ${file.config}`;
    execSync(command, { cwd: path.join(__dirname, ".."), stdio: "inherit" });

    // Get file sizes
    const inputSize = fs.statSync(path.join(__dirname, "..", file.input)).size;
    const outputSize = fs.statSync(path.join(__dirname, "..", file.output)).size;
    const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);

    console.log(
      `   ✅ Success! Size reduced by ${reduction}% (${inputSize} → ${outputSize} bytes)\n`
    );
    successCount++;
  } catch (error) {
    console.error(`   ❌ Error minifying ${file.input}:`, error.message, "\n");
    errorCount++;
  }
});

// CSS Minification
console.log("\n🎨 Minifying CSS files...\n");

const cssFiles = [
  {
    input: "css/search-v4.css",
    output: "css/search-v4.min.css",
    description: "Main search stylesheet",
  },
];

// Dashboard CSS files
const dashboardCssFiles = [
  "control-panel-v4.css",
  "control-panel-tooltip.css",
  "fab-menu.css",
  "modal-system.css",
  "sidebar-menu.css",
  "tab-loader.css",
  "toast.css",
  "validation-messages.css",
];

dashboardCssFiles.forEach((file) => {
  cssFiles.push({
    input: `dashboard/css/${file}`,
    output: `dashboard/css/${file.replace(".css", ".min.css")}`,
    description: `Dashboard: ${file}`,
  });
});

// Check if clean-css-cli is available, if not skip CSS minification
try {
  execSync("npx cleancss --version", { stdio: "ignore" });

  cssFiles.forEach((file, index) => {
    try {
      console.log(`[${index + 1}/${cssFiles.length}] ${file.description}`);
      console.log(`   Input:  ${file.input}`);
      console.log(`   Output: ${file.output}`);

      const command = `npx cleancss -o ${file.output} ${file.input}`;
      execSync(command, { cwd: path.join(__dirname, ".."), stdio: "inherit" });

      // Get file sizes
      const inputSize = fs.statSync(path.join(__dirname, "..", file.input)).size;
      const outputSize = fs.statSync(path.join(__dirname, "..", file.output)).size;
      const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);

      console.log(
        `   ✅ Success! Size reduced by ${reduction}% (${inputSize} → ${outputSize} bytes)\n`
      );
      successCount++;
    } catch (error) {
      console.error(`   ❌ Error minifying ${file.input}:`, error.message, "\n");
      errorCount++;
    }
  });
} catch (error) {
  console.log(
    "⚠️  clean-css-cli not found. Install it with: npm install clean-css-cli --save-dev\n"
  );
  console.log("   Skipping CSS minification...\n");
}

// Summary
console.log("\n" + "=".repeat(60));
console.log("📊 MINIFICATION SUMMARY");
console.log("=".repeat(60));
console.log(`✅ Successful: ${successCount} files`);
console.log(`❌ Failed: ${errorCount} files`);
console.log("=".repeat(60) + "\n");

if (errorCount === 0) {
  console.log("🎉 All files minified successfully!\n");
} else {
  console.log("⚠️  Some files failed to minify. Check the errors above.\n");
  process.exit(1);
}
