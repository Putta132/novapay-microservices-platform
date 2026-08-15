// =============================================================================
// FILE: infrastructure/kafka/init-topics.js
// PURPOSE: Create all required Kafka topics on first startup
//
// RUN: node infrastructure/kafka/init-topics.js
// DOCKER: Automatically run by kafka-init service in docker-compose-full.yml
//
// TOPIC CONFIGURATION:
//   numPartitions: 3  — 3 consumers can read in parallel (better throughput)
//   replicationFactor: 1 — for local dev (use 3 in production)
// =============================================================================

const { Kafka } = require('kafkajs');

const BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');

const TOPICS_TO_CREATE = [
  {
    topic: 'novapay.payments',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' },  // 7 days
      { name: 'cleanup.policy', value: 'delete' },
    ],
  },
  {
    topic: 'novapay.transactions',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' },
      { name: 'cleanup.policy', value: 'delete' },
    ],
  },
  {
    topic: 'novapay.accounts',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '604800000' },
      { name: 'cleanup.policy', value: 'delete' },
    ],
  },
  {
    topic: 'novapay.notifications',
    numPartitions: 2,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '86400000' },  // 1 day (notifications are time-sensitive)
      { name: 'cleanup.policy', value: 'delete' },
    ],
  },
  {
    topic: 'novapay.audit',
    numPartitions: 1,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '2592000000' }, // 30 days (compliance requirement)
      { name: 'cleanup.policy', value: 'delete' },
    ],
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const initTopics = async () => {
  const kafka = new Kafka({
    clientId: 'novapay-topic-init',
    brokers: BROKERS,
    retry: { retries: 10, initialRetryTime: 300 },
  });

  const admin = kafka.admin();

  console.log(`Connecting to Kafka at ${BROKERS.join(', ')}...`);

  // Wait for Kafka to be ready
  let connected = false;
  for (let i = 0; i  !existingTopics.includes(t.topic)
  );

  if (topicsToCreate.length === 0) {
    console.log('✅ All topics already exist — nothing to create');
  } else {
    await admin.createTopics({
      waitForLeaders: true,
      topics: topicsToCreate,
    });

    console.log('✅ Created topics:');
    topicsToCreate.forEach((t) => {
      console.log(`   ${t.topic} (${t.numPartitions} partitions)`);
    });
  }

  // Verify all topics exist
  const allTopics = await admin.listTopics();
  const novapayTopics = allTopics.filter((t) => t.startsWith('novapay.'));
  console.log('\n📋 NovaPay topics ready:');
  novapayTopics.forEach((t) => console.log(`   ✅ ${t}`));

  await admin.disconnect();
  console.log('\n🎉 Kafka initialisation complete');
};

initTopics().catch((err) => {
  console.error('❌ Kafka init failed:', err.message);
  process.exit(1);
});
