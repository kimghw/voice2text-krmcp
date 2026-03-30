import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const SUPPORTED_FORMATS: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mp3",
  ".aiff": "audio/aiff",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/m4a",
  ".mp4": "audio/mp4",
  ".mpeg": "audio/mpeg",
  ".mpga": "audio/mpga",
  ".opus": "audio/opus",
  ".pcm": "audio/pcm",
  ".webm": "audio/webm",
};

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB (File API limit)

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
}

async function processAudio(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_FORMATS[ext]) {
    throw new Error(
      `Unsupported format '${ext}'. Supported: ${Object.keys(SUPPORTED_FORMATS).join(", ")}`
    );
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileSize = fs.statSync(filePath).size;
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(
      `File size (${(fileSize / (1024 * 1024 * 1024)).toFixed(2)}GB) exceeds the 2GB limit`
    );
  }

  const client = getClient();

  // Files > 20MB: use File API upload
  if (fileSize > 20 * 1024 * 1024) {
    const uploaded = await client.files.upload({
      file: filePath,
      config: { mimeType: SUPPORTED_FORMATS[ext] },
    });
    return { type: "file" as const, file: uploaded };
  }

  // Inline base64 for smaller files
  const data = fs.readFileSync(filePath);
  const base64Data = data.toString("base64");
  return {
    type: "inline" as const,
    mimeType: SUPPORTED_FORMATS[ext],
    base64Data,
  };
}

function saveOutput(text: string, outputPath: string): string {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, text, "utf-8");
  return outputPath;
}

function defaultOutputPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath, path.extname(filePath));
  return path.join(dir, `${name}.txt`);
}

const server = new McpServer({
  name: "voice2text",
  version: "1.0.0",
});

server.tool(
  "transcribe_audio",
  "Transcribe an audio file to text with speaker diarization using Gemini API",
  {
    file_path: z.string().describe("Absolute path to the audio file (wav, mp3, aiff, aac, ogg, flac, m4a, mp4, opus, pcm, webm)"),
    language: z.string().optional().describe("Target language (e.g. 'ko', 'en', 'ja')"),
    prompt: z.string().optional().describe("Custom prompt for transcription"),
    output_path: z.string().optional().describe("Output txt file path (defaults to same directory as audio file with .txt extension)"),
  },
  async ({ file_path, language, prompt, output_path }) => {
    try {
      const audio = await processAudio(file_path);
      const client = getClient();

      let transcriptionPrompt: string;
      if (prompt) {
        transcriptionPrompt = prompt;
      } else if (language) {
        transcriptionPrompt = `Generate a transcript of the speech in ${language} with speaker diarization. Identify and label each speaker (Speaker 1, Speaker 2, etc.). Format each line as "Speaker N: text". Return only the transcript.`;
      } else {
        transcriptionPrompt = "Generate a transcript of the speech with speaker diarization. Identify and label each speaker (Speaker 1, Speaker 2, etc.). Format each line as \"Speaker N: text\". Return only the transcript.";
      }

      const audioPart =
        audio.type === "file"
          ? { fileData: { fileUri: audio.file.uri!, mimeType: audio.file.mimeType! } }
          : { inlineData: { data: audio.base64Data, mimeType: audio.mimeType } };

      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: transcriptionPrompt }, audioPart],
          },
        ],
      });

      const text = response.text ?? "No transcription result";
      const outFile = output_path || defaultOutputPath(file_path);
      saveOutput(text, outFile);
      return { content: [{ type: "text" as const, text: `${text}\n\n[Saved to ${outFile}]` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "transcribe_audio_with_timestamps",
  "Transcribe an audio file with timestamps using Gemini API",
  {
    file_path: z.string().describe("Absolute path to the audio file (wav, mp3, aiff, aac, ogg, flac, m4a, mp4, opus, pcm, webm)"),
    language: z.string().optional().describe("Target language (e.g. 'ko', 'en', 'ja')"),
    output_path: z.string().optional().describe("Output txt file path (defaults to same directory as audio file with .txt extension)"),
  },
  async ({ file_path, language, output_path }) => {
    try {
      const audio = await processAudio(file_path);
      const client = getClient();

      const langPart = language ? ` in ${language}` : "";
      const transcriptionPrompt = `Generate a detailed transcript of the speech${langPart} with timestamps. Format each line as [MM:SS] text. Return only the transcript.`;

      const audioPart =
        audio.type === "file"
          ? { fileData: { fileUri: audio.file.uri!, mimeType: audio.file.mimeType! } }
          : { inlineData: { data: audio.base64Data, mimeType: audio.mimeType } };

      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: transcriptionPrompt }, audioPart],
          },
        ],
      });

      const text = response.text ?? "No transcription result";
      const outFile = output_path || defaultOutputPath(file_path);
      saveOutput(text, outFile);
      return { content: [{ type: "text" as const, text: `${text}\n\n[Saved to ${outFile}]` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "transcribe_audio_with_speakers",
  "Transcribe an audio file with speaker diarization using Gemini API",
  {
    file_path: z.string().describe("Absolute path to the audio file (wav, mp3, aiff, aac, ogg, flac, m4a, mp4, opus, pcm, webm)"),
    language: z.string().optional().describe("Target language (e.g. 'ko', 'en', 'ja')"),
    num_speakers: z.number().optional().describe("Expected number of speakers (if known)"),
    output_path: z.string().optional().describe("Output txt file path (defaults to same directory as audio file with .txt extension)"),
  },
  async ({ file_path, language, num_speakers, output_path }) => {
    try {
      const audio = await processAudio(file_path);
      const client = getClient();

      const langPart = language ? ` in ${language}` : "";
      const speakerHint = num_speakers
        ? ` There are ${num_speakers} speakers.`
        : "";
      const transcriptionPrompt =
        `Generate a transcript of the speech${langPart} with speaker diarization.${speakerHint} ` +
        `Identify and label each speaker (Speaker 1, Speaker 2, etc.). ` +
        `Format each line as "Speaker N: text". Return only the transcript.`;

      const audioPart =
        audio.type === "file"
          ? { fileData: { fileUri: audio.file.uri!, mimeType: audio.file.mimeType! } }
          : { inlineData: { data: audio.base64Data, mimeType: audio.mimeType } };

      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: transcriptionPrompt }, audioPart],
          },
        ],
      });

      const text = response.text ?? "No transcription result";
      const outFile = output_path || defaultOutputPath(file_path);
      saveOutput(text, outFile);
      return { content: [{ type: "text" as const, text: `${text}\n\n[Saved to ${outFile}]` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
