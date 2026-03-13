'use strict';

// Echo module
// listens for messages, echos them back

import { NatsClient, log } from '@eeveebot/libeevee';

const echoCommandUUID = '9e5c1e0c-c6ad-4ae1-a368-7a28cd539dc9';

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

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

// Function to register the echo command with the router
async function registerEchoCommand(): Promise<void> {
  const commandRegistration = {
    type: 'command.register',
    commandUUID: echoCommandUUID,
    platform: '.*', // Match all platforms
    network: '.*', // Match all networks
    instance: '.*', // Match all instances
    channel: '.*', // Match all channels
    user: '.*', // Match all users
    regex: '^!echo\\s+(.+)', // Match !echo followed by text
    platformPrefixAllowed: true,
    ratelimit: {
      mode: 'drop',
      level: 'user',
      limit: 5,
      interval: '1m',
    },
  };

  try {
    await nats.publish('command.register', JSON.stringify(commandRegistration));
    log.info('Registered echo command with router', { producer: 'echo' });
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
const echoCommandSub = nats.subscribe(`command.execute.${echoCommandUUID}`, (subject, message) => {
  try {
    const data = JSON.parse(message.string());
    log.info(
      `Platform: ${data.platform}, Connection: ${data.instance}, Channel: ${data.channel}, User: ${data.user}, Message: ${data.text}`,
      { producer: 'echo' }
    );

    // Echo back on chat.message.outgoing.$PLATFORM.$INSTANCE
    const response = {
      channel: data.channel,
      network: data.network,
      instance: data.instance,
      platform: data.platform,
      text: data.text,
      trace: data.trace,
      type: 'message.outgoing',
    };

    const outgoingTopic = `chat.message.outgoing.${data.platform}.${data.instance}`;
    void nats.publish(outgoingTopic, JSON.stringify(response));
  } catch (error) {
    log.error(`Failed to parse message: ${message.string()}`, {
      producer: 'echo',
      error: error,
    });
  }
});
natsSubscriptions.push(echoCommandSub);

// Subscribe to control messages for re-registering commands
const controlSubRegisterCommandEcho = nats.subscribe('control.registercommands.echo', () => {
  log.info('Received command registration control message', {
    producer: 'echo',
  });
  void registerEchoCommand();
});
natsSubscriptions.push(controlSubRegisterCommandEcho);

const controlSubRegisterCommandAll = nats.subscribe('control.registercommands', () => {
  log.info('Received command registration control message', {
    producer: 'echo',
  });
  void registerEchoCommand();
});
natsSubscriptions.push(controlSubRegisterCommandAll);
