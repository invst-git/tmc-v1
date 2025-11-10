-- Payments core tables
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payment_intent_id text UNIQUE,
  amount numeric,
  currency text,
  customer_email text,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount_applied numeric,
  previous_status text
);

-- Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS idx_payment_invoices_payment_id ON public.payment_invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_invoices_invoice_id ON public.payment_invoices(invoice_id);

