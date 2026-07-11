import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const source = "/Users/gregwashington/Library/CloudStorage/Dropbox/Guy Gauvreau - Memorial";
const output = join(process.cwd(), "public", "media");
mkdirSync(output, { recursive: true });

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".heic"]);
const videoExtensions = new Set([".mov", ".mp4", ".m4v"]);
const excludedNames = new Set(["Photo 2026-06-27, 12 14 23 PM.jpg"]);
const counterclockwiseRotation = new Set([
  "Photo 2026-06-27, 11 54 22 AM.jpg",
  "Photo 2026-06-27, 12 47 31 PM.jpg",
  "Photo 2026-06-27, 12 53 45 PM.jpg",
  "Photo 2026-06-27, 1 29 38 PM.jpg",
  "Photo 2026-06-27, 12 37 24 PM.jpg",
  "Photo 2026-06-27, 12 40 03 PM.jpg",
  "Photo 2026-06-27, 1 19 29 PM.jpg",
  "Photo 2026-06-27, 3 42 18 PM.jpg",
  "Photo 2026-06-27, 4 04 34 PM.jpg",
  "Photo 2026-06-27, 3 06 26 PM.jpg",
  "Photo 2026-07-02, 3 37 24 PM.jpg",
]);
const clockwiseRotation = new Set([
  "Photo 2026-06-27, 11 50 42 AM.jpg",
  "IMG_8401.HEIC",
  "IMG_8402.HEIC",
  "Photo 2026-07-02, 3 27 39 PM.jpg",
]);
const files = readdirSync(source)
  .map((name) => ({ name, path: join(source, name) }))
  .filter((file) => statSync(file.path).isFile())
  .filter((file) => !/[()[\]{}]/.test(file.name))
  .filter((file) => !excludedNames.has(file.name));
const images = files.filter((file) => imageExtensions.has(extname(file.name).toLowerCase()));
const videos = files.filter((file) => videoExtensions.has(extname(file.name).toLowerCase()));

let seed = 1947;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
for (let i = images.length - 1; i > 0; i -= 1) {
  const j = Math.floor(random() * (i + 1));
  [images[i], images[j]] = [images[j], images[i]];
}

const photoItems = images.map((file, index) => {
  const filename = `photo-${String(index + 1).padStart(4, "0")}.jpg`;
  const destination = join(output, filename);
  const extension = extname(file.name).toLowerCase();
  if (extension === ".heic") {
    const resizedDestination = `${destination}.resized.jpg`;
    execFileSync("heif-convert", ["-q", "90", file.path, destination], { stdio: "ignore" });
    const filters = [
      ...(counterclockwiseRotation.has(file.name) ? ["transpose=2"] : []),
      ...(clockwiseRotation.has(file.name) ? ["transpose=1"] : []),
      "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease",
    ].join(",");
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", destination,
      "-vf", filters,
      "-frames:v", "1", "-q:v", "5", resizedDestination,
    ], { stdio: "inherit" });
    renameSync(resizedDestination, destination);
  } else {
    // ffmpeg applies camera rotation metadata to the pixels before stripping it.
    // This prevents portrait photos from being sized as landscape images by CSS.
    const filters = [
      ...(counterclockwiseRotation.has(file.name) ? ["transpose=2"] : []),
      ...(clockwiseRotation.has(file.name) ? ["transpose=1"] : []),
      "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease",
    ].join(",");
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", file.path,
      "-vf", filters,
      "-frames:v", "1", "-q:v", "5", destination,
    ], { stdio: "inherit" });
  }
  return { type: "image", src: `/media/${filename}?v=9`, duration: 5000, originalName: file.name };
});

const videoItems = videos.map((file, index) => {
  const filename = `video-${String(index + 1).padStart(2, "0")}.mp4`;
  const destination = join(output, filename);
  // Always regenerate numbered videos. Adding a source file can shift the
  // ordering, so reusing an existing destination could pair it with the wrong
  // originalName in the manifest.
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", file.path,
    "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "24",
    "-c:a", "aac", "-b:a", "128k", "-pix_fmt", "yuv420p", "-movflags", "+faststart", destination,
  ], { stdio: "inherit" });
  return { type: "video", src: `/media/${filename}?v=9`, originalName: file.name };
});

const items = [...photoItems];
videoItems.forEach((video, index) => {
  const position = Math.round(((index + 1) * items.length) / (videoItems.length + 1));
  items.splice(position + index, 0, video);
});

writeFileSync(join(process.cwd(), "app", "media-manifest.json"), JSON.stringify(items, null, 2));
writeFileSync(join(process.cwd(), "media-summary.txt"), `${photoItems.length} photos\n${videoItems.length} videos\n${items.length} total items\n`);
