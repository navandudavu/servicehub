-- The price of a nalog is now one hand-typed amount (subtotal = total = price; hourly rate, VAT and parts sum are 0
-- on new nalozi). Old nalozi keep their stored breakdown, so the two arithmetic checks must go.
ALTER TABLE nalog DROP CONSTRAINT IF EXISTS chk_nalog_subtotal;
ALTER TABLE nalog DROP CONSTRAINT IF EXISTS chk_nalog_total;
