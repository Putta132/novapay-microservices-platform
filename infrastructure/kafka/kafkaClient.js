const { Kafka, logLevel } = require('kafkajs');

const createKafkaClient = (serviceName) => {
  const brokers = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',');

  return new Kafka({
    clientId: serviceName,
    brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
    ssl: process.env.KAFKA_SSL === 'true',
  });
};

const createProducer = async (serviceName) => {
  const kafka = createKafkaClient(serviceName);
  const producer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
  });

  await producer.connect();

  const publish = async (topic, eventType, data, key = null) => {
    const message = {
      key: key || data.id || String(Date.now()),
      value: JSON.stringify({
        eventType,
        timestamp: new Date().toISOString(),
        serviceName,
        data,
      }),
      headers: {
        eventType,
        serviceName,
        version: '1',
      },
    };

    await producer.send({ topic, messages: [message] });
  };

  const disconnect = async () => producer.disconnect();

  return { publish, disconnect };
};

const createConsumer = async (serviceName, groupId, topics, handlers) => {
  const kafka = createKafkaClient(serviceName);
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const handler = handlers[payload.eventType];

        if (handler) {
          await handler(payload.data, payload);
        }
      } catch (err) {
        console.error(JSON.stringify({
          message: 'Kafka message processing error',
          topic,
          partition,
          error: err.message,
        }));
      }
    },
  });

  const disconnect = async () => consumer.disconnect();

  return { disconnect };
};

const createTopics = async (serviceName, topicConfigs) => {
  const kafka = createKafkaClient(serviceName);
  const admin = kafka.admin();
  await admin.connect();

  await admin.createTopics({
    waitForLeaders: true,
    topics: topicConfigs.map(({ topic, numPartitions = 3, replicationFactor = 1 }) => ({
      topic,
      numPartitions,
      replicationFactor,
    })),
  });

  await admin.disconnect();
};

module.exports = {
  createKafkaClient,
  createProducer,
  createConsumer,
  createTopics,
};