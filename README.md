# echo

> Echoes back whatever text you send it — the simplest eevee command module, and a reference implementation for building your own.

## Overview

The echo module listens for chat messages starting with `echo ` and sends the provided text right back to the same channel. It's the canonical "hello world" of the eevee ecosystem, but it's also a fully production-grade module: NATS-based messaging, Prometheus metrics, configurable rate limiting, health checks, and graceful shutdown are all wired up.

As an eevee module, echo subscribes to the router's command system via NATS. When a user types `echo <text>` in any connected channel (IRC, Discord, etc.), the router matches the command regex and publishes a `command.execute` message. The echo module picks it up, extracts the text, and publishes a chat message back through the connector. This makes echo a useful template for anyone writing a new command module — copy the structure, swap the logic, and you're most of the way there.

Key architecture decisions:

- **Single-file source** (`src/main.mts`) — the entire module is one file, keeping the reference implementation easy to read end-to-end.
- **Uses `@eeveebot/libeevee` helpers** — `registerCommand`, `sendChatMessage`, `registerHelp`, `registerStatsHandlers`, etc. handle the boilerplate so modules only implement their domain logic.
- **Configurable rate limiting** — defaults to libeevee's built-in defaults, but can be overridden via a YAML config file.

## Features

- **`echo <text>` command** — repeats the provided text back to the originating channel
- **Rate limiting** — configurable per-user or per-channel limits to prevent spam
- **Help registration** — automatically registers `!help echo` documentation with the help module
- **Prometheus metrics** — command counts (success/error), processing time, NATS subscribe counts
- **Health checks** — HTTP endpoint for liveness/readiness probes (Kubernetes-ready)
- **Stats** — uptime tracking and on-demand stats emission via NATS
- **Graceful shutdown** — drains NATS connections cleanly on SIGTERM/SIGINT

## Install

This module is part of the eevee ecosystem and is not published independently. Install it as a workspace package:

```bash
# From the eevee project root
npm install
```

Or build and run the echo module directly:

```bash
cd echo
npm install
npm run build
npm run dev
```

### Docker

A `Dockerfile` is included for containerized deployment. It performs a multi-stage build: the builder stage installs dev dependencies and compiles TypeScript, and the final stage copies only production artifacts.

```bash
docker build --secret id=GITHUB_TOKEN,src=<token-file> -t eevee-echo .
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NATS_HOST` | Yes | — | NATS server hostname |
| `NATS_TOKEN` | Yes | — | NATS authentication token |
| `MODULE_CONFIG_PATH` | No | — | Path to a YAML configuration file |
| `HTTP_API_PORT` | No | `9000` | Port for the HTTP metrics/health server |

### YAML Configuration File

If `MODULE_CONFIG_PATH` is set, the module loads additional settings from the specified YAML file. Currently, only rate limiting is configurable:

```yaml
# Rate limit configuration
ratelimit:
  mode: drop        # "drop" (silently ignore) or "queue" (buffer and delay)
  level: user       # "user" or "channel"
  limit: 5          # Maximum allowed invocations per interval
  interval: 1m      # Time window (e.g. "30s", "5m", "1h")
```

If no configuration file is provided, the module uses libeevee's default rate limiting settings.

## Usage / Commands

### `echo <text>`

Sends `<text>` back to the same channel the command was invoked in.

**Examples:**

```
<user> echo hello world
<bot>  hello world
```

```
<user> echo the quick brown fox
<bot>  the quick brown fox
```

The command matches on the regex `^echo\s+`, so any message starting with `echo ` (with at least one space) will trigger it. The matched text (after `echo `) is echoed verbatim.

### Help

Users can query built-in help:

```
<user> !help echo
```

This returns the registered help entry describing the command and its `text` parameter.

## Architecture

```
User types "echo hello"
        │
        ▼
   Chat Connector (IRC/Discord)
        │
        ▼
   Router — regex match: ^echo\s+
        │
        ▼
   NATS: command.execute.<UUID>
        │
        ▼
   Echo Module
   ├── Parse JSON message
   ├── Extract text, channel, network, platform
   ├── Publish chat message via NATS
   └── Record metrics (success/error, processing time)
        │
        ▼
   Chat Connector → sends "hello" back to channel
```

### NATS Subjects

| Subject | Direction | Purpose |
|---------|-----------|---------|
| `control.registerCommands` | Publish | Registers the echo command with the router |
| `command.execute.<UUID>` | Subscribe | Receives matched command invocations |
| `chat.send` | Publish | Sends the echoed text back to the channel |
| `help.register.echo` | Publish | Registers help entries |
| `help.update` | Subscribe | Responds to help refresh requests |
| `stats.uptime` | Subscribe | Reports module uptime |
| `stats.emit.request` | Subscribe | Emits full stats snapshot on demand |

### Module Internals

1. **Startup** — loads config, initializes metrics and HTTP server, creates NATS connection
2. **Command registration** — calls `registerCommand()` with the echo UUID, display name, regex, and rate limit config
3. **Command handling** — subscribes to `command.execute.<UUID>`, parses the incoming JSON, calls `sendChatMessage()`, and records metrics
4. **Help & stats** — registers help entries and stats handlers via libeevee helpers
5. **Shutdown** — `registerGracefulShutdown()` ensures NATS connections drain before exit

## Development

```bash
# Install dependencies
npm install

# Lint
npm test

# Build (lint + compile TypeScript)
npm run build

# Build and run locally
npm run dev
```

The build compiles `src/main.mts` to `dist/main.mjs` using TypeScript with ES2024 target and NodeNext module resolution.

### Requirements

- **Node.js** ≥ 24.0.0
- Access to a NATS server (for runtime)
- Access to the `@eeveebot` GitHub Packages registry (for `@eeveebot/libeevee`)

## Contributing

This module is part of the [eevee project](https://github.com/eeveebot/eevee). See the contributing guidelines for details on development workflow, pull requests, and code standards.

## License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — see [LICENSE](./LICENSE) for the full text.
