import asyncio
import logging
import random
from datetime import datetime

# Configure a specific logger for Kafka to make it stand out in terminal logs
logger = logging.getLogger("kafka.streams")
logger.setLevel(logging.INFO)

# Ensure it logs to console
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(ch)

TOPICS = ["crisis-events", "funding-updates", "prediction-metrics", "satellite-telemetry"]

class KafkaStreamProcessor:
    def __init__(self):
        self._running = False
        self._task = None

    async def start(self):
        """Simulates starting the Kafka stream consumer."""
        if self._running:
            return
        
        self._running = True
        logger.info("Initializing Kafka Consumer Group: 'crisis-topography-processor'...")
        await asyncio.sleep(0.5)
        logger.info(f"Subscribed to topics: {', '.join(TOPICS)}")
        logger.info("Kafka Stream Processor started successfully. Listening for events...")
        
        # Start the background simulator
        self._task = asyncio.create_task(self._simulate_streams())

    async def stop(self):
        """Simulates stopping the Kafka stream consumer."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Kafka Stream Processor shut down gracefully.")

    async def _simulate_streams(self):
        """Background task that periodically logs activity for the 'streams'."""
        while self._running:
            # Random delay between 10 and 30 seconds to avoid spamming too much relative to other logs
            await asyncio.sleep(random.uniform(5, 15))
            
            topic = random.choice(TOPICS)
            event_id = f"evt_{random.getrandbits(32):08x}"
            
            # Simulated processing log
            logger.info(f"Consumed event [{event_id}] from topic '{topic}' - Status: PROCESSED")

# Singleton instance
kafka_processor = KafkaStreamProcessor()
