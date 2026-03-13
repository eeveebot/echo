'use strict';

// Echo module
// listens for messages, echos them back

import { NatsClient, log } from "@eeveebot/libeevee";

const natsClients: InstanceType<typeof NatsClient>[] = [];
const natsSubscriptions: Array<Promise<string | boolean>> = [];

//
// Do whatever teardown is necessary before calling common handler
process.on("SIGINT", () => {
  natsClients.forEach((natsClient) => {
    void natsClient.drain();
  });
});

process.on("SIGTERM", () => {
  natsClients.forEach((natsClient) => {
    void natsClient.drain();
  });
});

//
// Setup NATS connection

// Get host and token
const natsHost = process.env.NATS_HOST || false;
if (!natsHost) {
  const msg = "environment variable NATS_HOST is not set.";
  throw new Error(msg);
}

const natsToken = process.env.NATS_TOKEN || false;
if (!natsToken) {
  const msg = "environment variable NATS_TOKEN is not set.";
  throw new Error(msg);
}

const nats = new NatsClient({
  natsHost: natsHost as string,
  natsToken: natsToken as string,
});
natsClients.push(nats);
await nats.connect();

const sub = nats.subscribe('command.echo.>', (subject, message) => {
  try {
    const data = JSON.parse(message.string());
    log.info(`Platform: ${data.platform}, Connection: ${data.instance}, Channel: ${data.channel}, User: ${data.user}, Message: ${data.text}`, { producer: "echo" });
    
    // Echo the message back to NATS on the outgoing channel
    const outgoingSubject = `chat.message.outgoing.${data.platform}.${data.instance}.${data.channel}`;
    const outgoingMessage = data.text;
    void nats.publish(outgoingSubject, outgoingMessage);
  } catch (error) {
    log.error(`Failed to parse message: ${message.string()}`, { producer: "echo", error: error });
  }
});
natsSubscriptions.push(sub);
