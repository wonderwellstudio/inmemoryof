import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const mediaDir = join(root, "public", "media");
const outputDir = join(tmpdir(), "memorial-slideshow-optimized-media");
const files = readdirSync(mediaDir).sort();
const images = files.filter((file) => extname(file).toLowerCase() === ".jpg");
const videos = files.filter((file) => extname(file).toLowerCase() === ".mp4");

if (images.length !== 320 || videos.length !== 4 || files.length !== 324) {
  throw new Error(`Expected 320 images and 4 videos; found ${images.length} images and ${videos.length} videos.`);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const run = (args, options = {}) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], options);
const probe = (file) => JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "stream=codec_name,width,height,duration:format=duration",
  "-of", "json", file,
], { encoding: "utf8" }));

function pixels(file) {
  const raw = run(["-i", file, "-vf", "scale=32:32,format=gray", "-frames:v", "1", "-f", "rawvideo", "pipe:1"]);
  if (raw.length !== 1024) throw new Error(`${basename(file)} did not decode to a complete validation frame.`);
  let sum = 0;
  for (const value of raw) sum += value;
  const mean = sum / raw.length;
  let squared = 0;
  for (const value of raw) squared += (value - mean) ** 2;
  return { mean, deviation: Math.sqrt(squared / raw.length) };
}

for (const [index, file] of images.entries()) {
  const source = join(mediaDir, file);
  const output = join(outputDir, file);
  run([
    "-y", "-i", source,
    "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease",
    "-frames:v", "1", "-q:v", "7", output,
  ], { stdio: ["ignore", "ignore", "inherit"] });

  const before = pixels(source);
  const after = pixels(output);
  if (Math.abs(before.mean - after.mean) > 12 || (before.deviation > 4 && after.deviation < before.deviation * 0.55)) {
    throw new Error(`${file} failed visual-content validation: ${JSON.stringify({ before, after })}`);
  }
  if ((index + 1) % 40 === 0) console.log(`Validated ${index + 1}/${images.length} photos`);
}

for (const file of videos) {
  const source = join(mediaDir, file);
  const output = join(outputDir, file);
  const before = probe(source);
  run([
    "-y", "-i", source,
    "-map", "0:v:0", "-map", "0:a?",
    "-vf", "scale='min(960,iw)':'min(960,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v", "libx264", "-preset", "slow", "-crf", "29", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", output,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  const after = probe(output);
  const beforeDuration = Number(before.format.duration);
  const afterDuration = Number(after.format.duration);
  if (after.streams[0]?.codec_name !== "h264" || Math.abs(beforeDuration - afterDuration) > 0.2) {
    throw new Error(`${file} failed video validation.`);
  }
  pixels(output);
  console.log(`Validated ${file}`);
}

const optimized = readdirSync(outputDir).sort();
if (optimized.join("\n") !== files.join("\n")) throw new Error("Optimized media inventory does not match the source inventory.");

const beforeBytes = files.reduce((total, file) => total + statSync(join(mediaDir, file)).size, 0);
const afterBytes = files.reduce((total, file) => total + statSync(join(outputDir, file)).size, 0);
if (afterBytes >= beforeBytes) throw new Error("Optimization did not reduce the media size.");

for (const file of files) cpSync(join(outputDir, file), join(mediaDir, file));
console.log(`Media validated and replaced: ${(beforeBytes / 1024 / 1024).toFixed(1)} MB -> ${(afterBytes / 1024 / 1024).toFixed(1)} MB`);
