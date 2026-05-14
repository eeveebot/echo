'use strict';

// Echo module
// listens for messages, echos them back

import {
  NatsClient,
  log,
  createNatsConnection,
  registerGracefulShutdown,
  createModuleMetrics,
  loadModuleConfig,
  RateLimitConfig,
  defaultRateLimit,
  initializeSystemMetrics,
  setupHttpServer,
  registerCommand,
  sendChatMessage,
  registerHelp,
  HelpEntry,
  registerStatsHandlers,
  NatsSubscriptionResult,
} from '@eeveebot/libeevee';

// Record module startup time for uptime tracking
const moduleStartTime = Date.now();

// Initialize module-scoped metrics recorder
const metrics = createModuleMetrics('echo');

// Initialize system metrics
initializeSystemMetrics('echo');



const echoCommandUUID = '9e5c1e0c-c6ad-4ae1-a368-7a28cd539dc9';
const echoCommandDisplayName = 'echo';

// Echo module configuration interface
interface EchoConfig {
  ratelimit?: RateLimitConfig;
}

const natsClients: InstanceType<typeof NatsClient>[] = [];

// Setup HTTP server for metrics and health checks
setupHttpServer({
  port: process.env.HTTP_API_PORT || '9000',
  serviceName: 'echo',
  natsClients: natsClients,
});
const natsSubscriptions: Array<Promise<NatsSubscriptionResult>> = [];

// Load configuration at startup
const echoConfig = loadModuleConfig<EchoConfig>({});

// Register graceful shutdown handlers
registerGracefulShutdown(natsClients);

// Setup NATS connection
const nats = await createNatsConnection();
natsClients.push(nats);

// Register the echo command with the router (auto-subscribes to control.registerCommands)
const commandSubs = await registerCommand(nats, {
  commandUUID: echoCommandUUID,
  commandDisplayName: echoCommandDisplayName,
  regex: '^echo\\s+',
  ratelimit: echoConfig.ratelimit || defaultRateLimit,
}, metrics);
natsSubscriptions.push(...commandSubs);

// Subscribe to command execution messages
const echoCommandSub = nats.subscribe(
  `command.execute.${echoCommandUUID}`,
  (subject, message) => {
    metrics.recordNatsSubscribe(subject);
    const startTime = Date.now();
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

      // Echo back
      void sendChatMessage(nats, {
        channel: data.channel,
        network: data.network,
        instance: data.instance,
        platform: data.platform,
        text: data.text,
        trace: data.trace,
      }, metrics);

      metrics.recordCommand(data.platform, data.network, data.channel, 'success');
    } catch (error) {
      log.error('Failed to parse message', {
        producer: 'echo',
        message: message.string(),
        error: error,
      });

      metrics.recordCommand('unknown', 'unknown', 'unknown', 'error');
      metrics.recordError('parse_error');
    } finally {
      const duration = Date.now() - startTime;
      metrics.recordProcessingTime(duration / 1000);
    }
  }
);
natsSubscriptions.push(echoCommandSub);

// Subscribe to stats.uptime and stats.emit.request
const statsSubs = registerStatsHandlers({ nats, moduleName: 'echo', startTime: moduleStartTime, metrics });
natsSubscriptions.push(...statsSubs);

// Register help information (publishes immediately + subscribes to update requests)
const echoHelp: HelpEntry[] = [
  {
    command: 'echo',
    descr: 'Echoes back the text you provide',
    params: [
      {
        param: 'text',
        required: true,
        descr: 'The text to echo back',
      },
    ],
  },
];

const helpSubs = await registerHelp(nats, 'echo', echoHelp, metrics);
natsSubscriptions.push(...helpSubs);
