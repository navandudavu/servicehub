-- A nalog cannot be completed until somebody has typed a price (0 is allowed). "total = 0" alone cannot tell "no price yet" from "price 0".
ALTER TABLE nalog ADD COLUMN price_entered BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE nalog SET price_entered = TRUE WHERE total > 0 OR status = 'COMPLETED';
