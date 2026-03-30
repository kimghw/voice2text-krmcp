# voice2text-krmcp

Gemini API를 이용한 음성-텍스트 변환 MCP 서버

## 제공 도구

| 도구 | 설명 |
|------|------|
| `transcribe_audio` | 음성을 텍스트로 변환 |
| `transcribe_audio_with_timestamps` | 타임스탬프 포함 변환 |
| `transcribe_audio_with_speakers` | 화자 구분 포함 변환 |

지원 포맷: wav, mp3, aiff, aac, ogg, flac, m4a, mp4, mpeg, mpga, opus, pcm, webm

파일 크기 제한: 최대 2GB

## 설치

```bash
git clone https://github.com/kimghw/voice2text-krmcp.git
cd voice2text-krmcp
npm install
npm run build
```

## MCP 서버 등록

API 키는 [Google AI Studio](https://aistudio.google.com/apikey)에서 발급받을 수 있습니다.

### Claude Code (CLI)

```bash
claude mcp add voice2text -e GEMINI_API_KEY=your-api-key -- node /path/to/voice2text-krmcp/dist/index.js
```

### Claude Desktop

`claude_desktop_config.json` 파일에 아래 내용을 추가합니다.

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "voice2text": {
      "command": "node",
      "args": ["/path/to/voice2text-krmcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### VS Code (Copilot / Claude Code Extension)

`.vscode/mcp.json` 파일을 프로젝트 루트에 생성합니다.

```json
{
  "servers": {
    "voice2text": {
      "command": "node",
      "args": ["/path/to/voice2text-krmcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

> `/path/to/voice2text-krmcp`는 실제 클론한 경로로 변경해 주세요.
