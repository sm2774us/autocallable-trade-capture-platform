# autocallable-trade-capture-platform
A *trade-capture* platform listens for **executions** (fills) from brokers and from Murex, turns each into one canonical record (`TradeEvent`), moves it durably through **Kafka**, and stores it exactly once in **PostgreSQL**.
