import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("публичные страницы и robots.txt запрещают поисковую индексацию", () => {
  const page = read("index.html");
  const admin = read("admin.html");
  const robots = read("robots.txt");

  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Disallow:\s*\//i);
  assert.match(page, /name="robots"\s+content="[^"]*noindex[^"]*nofollow[^"]*noarchive[^"]*nosnippet[^"]*noimageindex/i);
  assert.match(page, /name="yandex"\s+content="[^"]*noindex[^"]*nofollow/i);
  assert.match(admin, /name="robots"\s+content="[^"]*noindex[^"]*nofollow[^"]*noarchive[^"]*nosnippet/i);
});

test("публикуемые файлы не содержат ссылки на репозиторий владельца", () => {
  const publicFiles = ["index.html", "admin.html", "script.js", "features.js", "experience.js", "manifest.webmanifest"];
  publicFiles.forEach((path) => {
    assert.doesNotMatch(read(path), /github\.com\/(?:Avajer|avajer)\b/i, path);
  });
});

test("секрет владельца хранится в Script Properties и статистика закрыта по умолчанию", () => {
  const server = read("google-apps-script.js");

  assert.doesNotMatch(server, /const\s+OWNER_KEY\s*=/);
  assert.match(server, /PropertiesService\.getScriptProperties\(\)\.getProperty\(['"]OWNER_KEY['"]\)/);
  assert.match(server, /if\s*\(!configuredKey\)/);
  assert.match(server, /Ключ владельца не настроен/);
  assert.match(server, /function setupSecurity\(\)/);
  assert.match(server, /setProperty\(['"]OWNER_KEY['"],\s*ownerKey\)/);
  assert.match(server, /Utilities\.getUuid\(\)\.replace\([^)]*\)\.toUpperCase\(\)/);
});

test("закрытая регистрация использует одноразовые усиленные коды на сервере", () => {
  const pageLogic = read("script.js");
  const server = read("google-apps-script.js");

  assert.match(pageLogic, /mode === "register"[\s\S]*!accessCode/);
  assert.match(server, /consumeAccessCode_\(accessCode, name, department\)/);
  assert.match(server, /setValue\('used'\)/);
  assert.match(server, /Utilities\.getUuid\(\)\.replace\([^)]*\)\.slice\(0, 16\)/);
  assert.match(server, /version:\s*'2026-07-15-v8-security-hardening'/);
  assert.match(server, /ownerKeyRequired:\s*true/);
  assert.match(server, /strongAccessCodes:\s*true/);
});

test("локальные файлы с секретами исключены из git", () => {
  const ignore = read(".gitignore");

  [".env", ".env.*", "secrets/", "credentials/", "*.pem", "*.p12", "*service-account*.json"].forEach((pattern) => {
    assert.match(ignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  });
});
