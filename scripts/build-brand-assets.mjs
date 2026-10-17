import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
const original = await readFile("public/brand/01b - Logo Transparan.png");
if (createHash("sha256").update(original).digest("hex") !== "a004ccdf64fd2394c7aeb6f0164dc4fdd347b7dabe1bd411a5e849440f001de3") throw new Error("Unexpected original logo.");
for (const [output, size] of [["public/brand/tiny-osaka-logo.png", 256], ["src/app/icon.png", 48], ["src/app/apple-icon.png", 180]]) {
  await sharp(original).resize(size, size, { fit: "contain" }).png().toFile(output);
}
console.log("Generated web logo and icons; original file was read only.");
