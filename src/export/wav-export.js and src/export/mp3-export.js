import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Lazy-loaded offline encoder. Long files can use substantial memory on iPhone.
let ffmpegPromise;
async function getFFmpeg() {
  if (!ffmpegPromise) ffmpegPromise = (async () => {
    const ffmpeg = new FFmpeg();
    const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm")
    });
    return ffmpeg;
  })();
  return ffmpegPromise;
}
export async function wavBlobToMp3(wavBlob, { bitrate = "192k" } = {}) {
  const ffmpeg = await getFFmpeg(), input = "sn-export.wav", output = "sn-export.mp3";
  await ffmpeg.writeFile(input, await fetchFile(wavBlob));
  await ffmpeg.exec(["-i", input, "-codec:a", "libmp3lame", "-b:a", bitrate, output]);
  const bytes = await ffmpeg.readFile(output);
  await ffmpeg.deleteFile(input); await ffmpeg.deleteFile(output);
  return new Blob([bytes], { type: "audio/mpeg" });
}