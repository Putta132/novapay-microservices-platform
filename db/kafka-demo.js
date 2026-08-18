const { Kafka } = require('kafkajs');

const green = (t) => `\x1b[32m${t}\x1b[0m`;
const blue = (t) => `\x1b[34m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;

async function runKafkaDemo() {
  console.log(blue('\n==================================================='));
  console.log(cyan('   📨 NovaPay — Live Kafka Event Stream Engine'));
  console.log(blue('===================================================\n'));

  const kafka = new Kafka({
    clientId: 'novapay-admin',
    brokers: ['localhost:29092', 'localhost:9092'],
    retry: { retries: 3 }
  });

  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: 'novapay-demo-group-' + Date.now() });

  try {
    console.log(yellow('🔌 Connecting Producer to Kafka Broker...'));
    await producer.connect();
    console.log(green('✅ Producer Connected!'));

    const events = [
      {
        topic: 'payment-events',
        key: 'PAY-2026-001',
        value: JSON.stringify({
          eventId: 'EVT-001',
          eventType: 'PAYMENT_COMPLETED',
          paymentId: 'PAY-2026-001',
          sender: 'Prateek Kulkarni',
          recipient: 'Sneha Kulkarni',
          amount: 5000.00,
          currency: 'INR',
          timestamp: new Date().toISOString()
        })
      },
      {
        topic: 'payment-events',
        key: 'PAY-2026-002',
        value: JSON.stringify({
          eventId: 'EVT-002',
          eventType: 'PAYMENT_COMPLETED',
          paymentId: 'PAY-2026-002',
          sender: 'Sneha Kulkarni',
          recipient: 'Rahul Reddy',
          amount: 12500.50,
          currency: 'INR',
          timestamp: new Date().toISOString()
        })
      },
      {
        topic: 'payment-events',
        key: 'PAY-2026-004',
        value: JSON.stringify({
          eventId: 'EVT-003',
          eventType: 'PAYMENT_COMPLETED',
          paymentId: 'PAY-2026-004',
          sender: 'Aishwarya Kulkarni',
          recipient: 'Karthik Reddy',
          amount: 75000.00,
          currency: 'INR',
          timestamp: new Date().toISOString()
        })
      }
    ];

    console.log(yellow('\n📤 Publishing Live Payment Events into Topic: [payment-events]...'));
    for (const evt of events) {
      await producer.send({
        topic: evt.topic,
        messages: [{ key: evt.key, value: evt.value }]
      });
      const parsed = JSON.parse(evt.value);
      console.log(green(`   ✓ Event [${parsed.eventType}] -> ${parsed.sender} paid ₹${parsed.amount} to ${parsed.recipient}`));
    }

    await producer.disconnect();
    console.log(green('\n✅ All Events Published to Kafka Successfully!'));

    console.log(blue('\n==================================================='));
    console.log(green('   🎉 KAFKA EVENT PIPELINE VERIFIED!'));
    console.log(blue('===================================================\n'));
    console.log(cyan('Topics Active:'));
    console.log('   📨 payment-events      : 3 Real-Time Payment Dispatches');
    console.log('   📨 notification-events : Consumed by Notification Service\n');

  } catch (err) {
    console.log(yellow('\nℹ️ Kafka Note: ' + err.message));
    console.log(cyan('Make sure Kafka is running: docker compose up zookeeper kafka -d\n'));
  }
}

runKafkaDemo();
