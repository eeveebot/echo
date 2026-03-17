import {
  Counter,
  Histogram,
  log,
  natsPublishCounter,
  natsSubscribeCounter,
  commandErrorCounter,
} from '@eeveebot/libeevee';

// Echo module specific metrics
export const echoCommandCounter = new Counter({
  name: 'echo_commands_total',
  help: 'Total number of echo commands processed',
  labelNames: ['module', 'platform', 'network', 'channel', 'result'],
});

export const echoProcessingTime = new Histogram({
  name: 'echo_processing_seconds',
  help: 'Time spent processing echo commands',
  labelNames: ['module'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

// Function to record command execution
export function recordEchoCommand(platform: string, network: string, channel: string, result: string): void {
  try {
    echoCommandCounter.inc({
      module: 'echo',
      platform,
      network,
      channel,
      result,
    });
  } catch (error) {
    log.error('Failed to record echo command metric', {
      producer: 'echo-metrics',
      error,
    });
  }
}

// Function to record processing time
export function recordProcessingTime(duration: number): void {
  try {
    echoProcessingTime.observe({ module: 'echo' }, duration);
  } catch (error) {
    log.error('Failed to record echo processing time metric', {
      producer: 'echo-metrics',
      error,
    });
  }
}

// Function to record errors
export function recordEchoError(errorType: string): void {
  try {
    commandErrorCounter.inc({
      module: 'echo',
      type: errorType,
    });
  } catch (error) {
    log.error('Failed to record echo error metric', {
      producer: 'echo-metrics',
      error,
    });
  }
}

// Function to record NATS publish operations
export function recordNatsPublish(subject: string, messageType: string): void {
  try {
    natsPublishCounter.inc({
      module: 'echo',
      type: messageType,
    });
  } catch (error) {
    log.error('Failed to record NATS publish metric', {
      producer: 'echo-metrics',
      error,
    });
  }
}

// Function to record NATS subscribe operations
export function recordNatsSubscribe(subject: string): void {
  try {
    natsSubscribeCounter.inc({
      module: 'echo',
      subject: subject,
    });
  } catch (error) {
    log.error('Failed to record NATS subscribe metric', {
      producer: 'echo-metrics',
      error,
    });
  }
}