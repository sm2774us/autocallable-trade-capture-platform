-- Flyway migration V1__capture.sql
CREATE TABLE trade (
  source        text        NOT NULL,
  trade_id      text        NOT NULL,
  account       text        NOT NULL,
  symbol        text        NOT NULL,
  side          text        NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity      bigint      NOT NULL CHECK (quantity > 0),
  price_micros  bigint      NOT NULL CHECK (price_micros > 0),
  source_seq    bigint      NOT NULL,
  executed_at   timestamptz NOT NULL,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, trade_id)           -- the idempotency key
);

CREATE INDEX trade_account_symbol_time ON trade (account, symbol, executed_at);

CREATE TABLE outbox (
  id            bigserial   PRIMARY KEY,
  account       text        NOT NULL,
  symbol        text        NOT NULL,
  payload_json  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);

-- The relay only ever scans unpublished rows; keep that index tiny.
CREATE INDEX outbox_pending ON outbox (id) WHERE published_at IS NULL;
