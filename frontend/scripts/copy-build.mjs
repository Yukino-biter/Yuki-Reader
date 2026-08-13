// Copy the Vite build output into the Spring Boot static resources folder.
import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const backendStatic = path.join(root, '..', 'backend', 'src', 'main', 'resources', 'static');

if (!existsSync(dist)) {
  throw new Error(`Vite dist not found at ${dist}; run vite build first`);
}
rmSync(backendStatic, { recursive: true, force: true });
cpSync(dist, backendStatic, { recursive: true });
console.log(`[copy-build] frontend build copied -> ${backendStatic}`);
