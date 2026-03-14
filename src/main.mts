'use strict';

// Echo module
// listens for messages, echos them back

import fs from 'node:fs';
import yaml from 'js-yaml';
import { NatsClient, log } from '@eeveebot/libeevee';

const echoCommandUUID = '9e5c1e0c-c6ad-4ae1-a368-7a28cd539dc9';
const echoCommandDisplayName = 'echo';

// Rate limit configuration interface
interface RateLimitConfig {
  mode: 'enqueue' | 'drop';
  level: 'channel' | 'user' | 'global';
  limit: number;
  interval: string; // e.g., "30s", "1m", "5m"
}

// Echo module configuration interface
interface EchoConfig {
  ratelimit?: RateLimitConfig;
}

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

/**
 * Load echo configuration from YAML file
 * @returns EchoConfig parsed from YAML file
 */
function loadEchoConfig(): EchoConfig {
  // Get the config file path from environment variable
  const configPath = process.env.MODULE_CONFIG_PATH;
  if (!configPath) {
    log.warn('MODULE_CONFIG_PATH not set, using default rate limit config', {
      producer: 'echo',
    });
    return {};
  }

  try {
    // Read the YAML file
    const configFile = fs.readFileSync(configPath, 'utf8');

    // Parse the YAML content
    const config = yaml.load(configFile) as EchoConfig;

    log.info('Loaded echo configuration', {
      producer: 'echo',
      configPath,
    });

    return config;
  } catch (error) {
    log.error('Failed to load echo configuration, using defaults', {
      producer: 'echo',
      configPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

//
// Do whatever teardown is necessary before calling common handler
process.on('SIGINT', () => {
  natsClients.forEach((natsClient) => {
    void natsClient.drain();
  });
});

process.on('SIGTERM', () => {
  natsClients.forEach((natsClient) => {
    void natsClient.drain();
  });
});

//
// Setup NATS connection

// Get host and token
const natsHost = process.env.NATS_HOST || false;
if (!natsHost) {
  const msg = 'environment variable NATS_HOST is not set.';
  throw new Error(msg);
}

const natsToken = process.env.NATS_TOKEN || false;
if (!natsToken) {
  const msg = 'environment variable NATS_TOKEN is not set.';
  throw new Error(msg);
}

const nats = new NatsClient({
  natsHost: natsHost as string,
  natsToken: natsToken as string,
});
natsClients.push(nats);
await nats.connect();

// Load configuration at startup
const echoConfig = loadEchoConfig();

// Function to register the echo command with the router
async function registerEchoCommand(): Promise<void> {
  // Default rate limit configuration
  const defaultRateLimit = {
    mode: 'drop',
    level: 'user',
    limit: 5,
    interval: '1m',
  };

  // Use configured rate limit or default
  const rateLimitConfig = echoConfig.ratelimit || defaultRateLimit;

  const commandRegistration = {
    type: 'command.register',
    commandUUID: echoCommandUUID,
    commandDisplayName: echoCommandDisplayName,
    platform: '.*', // Match all platforms
    network: '.*', // Match all networks
    instance: '.*', // Match all instances
    channel: '.*', // Match all channels
    user: '.*', // Match all users
    regex: 'echo ', // Match echo - trailing whitespace intentional
    platformPrefixAllowed: true,
    ratelimit: rateLimitConfig,
  };

  try {
    await nats.publish('command.register', JSON.stringify(commandRegistration));
    log.info('Registered echo command with router', {
      producer: 'echo',
      ratelimit: rateLimitConfig,
    });
  } catch (error) {
    log.error('Failed to register echo command', {
      producer: 'echo',
      error: error,
    });
  }
}

// Register commands at startup
await registerEchoCommand();

// Subscribe to command execution messages
const echoCommandSub = nats.subscribe(
  `command.execute.${echoCommandUUID}`,
  (subject, message) => {
    try {
      const data = JSON.parse(message.string());
      log.info('Received command.execute for echo', {
        producer: 'echo',
        platform: data.platform,
        instance: data.instance,
        channel: data.channel,
        user: data.user,
        originalText: data.originalText,
      });

      // Echo back on chat.message.outgoing.$PLATFORM.$INSTANCE.$CHANNEL
      const response = {
        channel: data.channel,
        network: data.network,
        instance: data.instance,
        platform: data.platform,
        text: data.text,
        trace: data.trace,
        type: 'message.outgoing',
      };

      const outgoingTopic = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
      void nats.publish(outgoingTopic, JSON.stringify(response));
    } catch (error) {
      log.error('Failed to parse message', {
        producer: 'echo',
        message: message.string(),
        error: error,
      });
    }
  }
);
natsSubscriptions.push(echoCommandSub);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandEcho = nats.subscribe(
  `control.registerCommands.${echoCommandDisplayName}`,
  () => {
    log.info(
      `Received control.registerCommands.${echoCommandDisplayName} control message`,
      {
        producer: 'echo',
      }
    );
    void registerEchoCommand();
  }
);
natsSubscriptions.push(controlSubRegisterCommandEcho);

const controlSubRegisterCommandAll = nats.subscribe(
  'control.registerCommands',
  () => {
    log.info('Received control.registerCommands control message', {
      producer: 'echo',
    });
    void registerEchoCommand();
  }
);
natsSubscriptions.push(controlSubRegisterCommandAll);
