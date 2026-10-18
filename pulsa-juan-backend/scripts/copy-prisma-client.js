// tsc compiles the .ts sources to dist/ but does NOT copy the Prisma client
// (prisma/generated is generated .js + platform query-engine binaries, not
// compiled from our TypeScript). So dist/prisma/client.js's require('./generated')
// has nothing to resolve at runtime -> "Cannot find module './generated'".
//
// This copies prisma/generated into dist/prisma/generated after the build.
// Run `npx prisma generate` BEFORE the build on the server so the engine binary
// copied here matches the server's platform (Linux), not your dev machine.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'prisma', 'generated');
const dest = path.join(__dirname, '..', 'dist', 'prisma', 'generated');

if (!fs.existsSync(src)) {
	console.error(`Prisma client not found at ${src}. Run "npx prisma generate" first.`);
	process.exit(1);
}

fs.cpSync(src, dest, { recursive: true });
console.log(`Copied Prisma client -> ${dest}`);
